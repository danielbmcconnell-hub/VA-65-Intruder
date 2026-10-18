'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), { createHash } = require('node:crypto');

// Real native B/N controls, original ASQ-61 release and ballistic integration.
// The clock fixture suppresses only automatic RAF scheduling after loading;
// every renderer/flight/weapon method below remains original. Aircraft run-in
// placement isolates a short pass, not a claimed human full-sortie completion.
module.exports = async function strikeBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'm24-strike'); await fs.mkdir(out, { recursive: true });
  const results = [], screenshots = [];
  const profiles = [{ name: 'desktop', viewport: { width: 1280, height: 720 } }, { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }];
  for (const profile of profiles.filter(p => !process.env.INTRUDER_M24_PROFILE || p.name === process.env.INTRUDER_M24_PROFILE)) {
    const { name, ...options } = profile, context = await browser.newContext(options), page = await context.newPage(), errors = [], badAssets = [];
    const cdp = profile.hasTouch ? await context.newCDPSession(page) : null, click = locator => profile.hasTouch ? locator.tap({ timeout: 15000 }) : locator.click({ timeout: 15000 });
    page.setDefaultTimeout(90000); page.on('pageerror', error => errors.push(error.message)); page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) badAssets.push(response.url()); });
    await context.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 1, assist: 1, sens: 1 })); localStorage.setItem('a6_sawkeys', '1');
      const nativeRAF = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = callback => window.__fixedFlightClock ? 0 : nativeRAF(time => { if (!window.__fixedFlightClock) callback(time); });
      window.__strikeInputTrace = []; for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) document.addEventListener(type, event => { window.__strikeInputTrace.push({ type, target: event.target?.id || event.target?.tagName, pointer: event.pointerType, trusted: event.isTrusted }); if (window.__strikeInputTrace.length > 60) window.__strikeInputTrace.shift(); }, true);
    });
    const record = (title, actual, fixture) => { results.push({ profile: name, name: title, passed: true, actual, fixture }); console.log('PASS strike ' + name + ' ' + title); };
    async function shot(key) { const file = name + '-' + key + '.png'; assert.equal(await page.evaluate(() => App.rend.gl.getError()), 0); await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('m24-strike/' + file); }
    async function flight(id) {
      await page.evaluate(id => { window.__fixedFlightClock = false; App.start(MISSIONS.find(m => m.id === id)); }, id);
      await page.waitForFunction(id => App.game?.mis?.id === id && document.getElementById('loader').style.display === 'none', id, { timeout: 90000 });
      await page.evaluate(() => { window.__fixedFlightClock = true; const g = App.game; g.paused = false; App.screen = 'game'; for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on'); for (const key of Object.keys(App.keys)) App.keys[key] = 0; App.gctl.commit = 0; g.render(1 / 60); g.syncControls(); });
      await page.waitForTimeout(50); // Drain the one RAF queued before freezing.
    }
    async function render() { return page.evaluate(() => { const g = App.game; for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on'); g.render(1 / 60); g.syncControls(); FlightStrikeBoard.tick(g, 0); FlightStrikeBoard.render(g); return { gl: App.rend.gl.getError(), board: FlightStrikeBoard.snapshot(g) }; }); }
    async function placeReadback(point) {
      return page.evaluate(point => { const g = App.game, a = g.ac; a.onDeck = false; a.p = [point[0], point[1] + 700, point[2] + 3000]; a.v = [0, 0, -110]; a.yaw = 0; a.pitch = .03; a.roll = 0; a.gear = false; a.hook = false; g.phase = 'airborne'; g.hud.scope = true; g.render(1 / 60); g.syncControls(); for (let i = 0; i < 300; i++) g.hud.radar.step(1 / 60, a, g.world, 0); FlightStrikeBoard.tick(g, 0); FlightStrikeBoard.render(g); return { aircraft: a.p.slice(), velocity: a.v.slice(), phase: g.phase }; }, point);
    }
    async function slew(point) {
      // Invert the existing HUD projection only to calculate physical drag
      // deltas; never call slewTo, lockTarget or set a designation here.
      const drag = await page.evaluate(point => { const g = App.game, h = g.hud, dx = point[0] - g.st.p[0], dz = point[2] - g.st.p[2], r = Math.hypot(dx, dz), angle = Math.atan2(dx, -dz) - g.st.yaw;
        const desired = [Math.atan2(Math.sin(angle), Math.cos(angle)) / RSECT, (r - 300) / h.radar.maxR]; return { dx: (desired[0] - h.cross[0]) * h.W * .55, dy: -(desired[1] - h.cross[1]) * h.H * .9, cross: h.cross.slice(), desired, width: h.W, height: h.H }; }, point);
      const box = await page.locator('#stack').boundingBox(), start = { x: box.x + box.width * .70, y: box.y + box.height * .55 };
      // Multiple modest drags keep the pointer inside the actual canvas and
      // avoid treating a slew as the existing click-to-lock shortcut.
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(drag.dx) / (box.width * .25), Math.abs(drag.dy) / (box.height * .25))));
      for (let i = 0; i < n; i++) {
        const end = { x: start.x + drag.dx / n, y: start.y + drag.dy / n };
        if (cdp) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 2, radiusX: 6, radiusY: 6, force: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 2, radiusX: 6, radiusY: 6, force: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
        else { await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up(); }
      }
      await render(); const actual = await page.evaluate(() => App.game.hud.crossWorld(App.game.st)); assert.ok(Math.hypot(actual[0] - point[0], actual[2] - point[2]) < 4, 'Native scope slew matches physical input: ' + JSON.stringify({ drag, actual, point })); return { drag, actual };
    }
    async function lock() { if (profile.hasTouch) { await click(page.locator('#flightStrikeBoardToggle')); await click(page.locator('[data-strike-lock]')); await render(); await click(page.locator('#flightStrikeBoardToggle')); } else await page.keyboard.press('Enter'); await render(); }
    async function consent() {
      if (cdp) { const b = await page.locator('#pickle').boundingBox(); assert.ok(b && b.width >= 44 && b.height >= 44); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 3, radiusX: 6, radiusY: 6, force: 1 }] }); }
      else await page.keyboard.down('Space');
      let actual;
      try { actual = await page.evaluate(() => { const g = App.game, accepted = () => g.world.score.dropped + (g.world.score.armsReleased || 0), before = accepted(); for (let n = 0; n < 600 && accepted() === before; n++) g.update(1 / 60); g.render(1 / 60); g.syncControls(); return { before, accepted: accepted(), dropped: g.world.score.dropped, armsReleased: g.world.score.armsReleased || 0, bombCount: g.world.bombs.length, armsCount: g.world.arms.length, stores: g.ac.bombs, arms: g.ac.arms, phase: g.phase, alive: g.ac.alive, solution: g.sol }; }); }
      finally { if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.keyboard.up('Space'); }
      assert.ok(actual.accepted > actual.before && (actual.bombCount > 0 || actual.armsCount > 0), 'Original weapon release must accept native consent: ' + JSON.stringify(actual)); assert.equal(actual.alive, true); return actual;
    }
    async function armConsent() {
      // The preserved ARM is edge-triggered: holding COMMIT while an emitter
      // is silent cannot launch when it returns. Observe the genuine emitter
      // cycle, test that negative path, then make a fresh trusted consent edge.
      // No emission, target, weapon or damage state is assigned here.
      const silent = await page.evaluate(() => {
        const g = App.game; let frames = 0;
        while ((g.world.radar.emitting || g.world.radar.strobe < .5) && g.ac.alive && frames++ < 7200) g.update(1 / 60);
        return { frames, time: g.t, emitting: g.world.radar.emitting, strobe: g.world.radar.strobe, released: g.world.score.armsReleased || 0, alive: g.ac.alive };
      });
      assert.equal(silent.alive, true); assert.equal(silent.emitting, false); assert.ok(silent.strobe >= .5);
      if (cdp) { const b = await page.locator('#pickle').boundingBox(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 3, radiusX: 6, radiusY: 6, force: 1 }] }); }
      else await page.keyboard.down('Space');
      let held;
      try {
        held = await page.evaluate(() => {
          const g = App.game; g.update(1 / 60);
          const first = { time: g.t, emitting: g.world.radar.emitting, released: g.world.score.armsReleased || 0, commit: g._lastCommit };
          let frames = 0;
          while ((!g.world.radar.emitting || g.world.radar.strobe < .5) && g.ac.alive && frames++ < 7200) g.update(1 / 60);
          return { first, frames, time: g.t, emitting: g.world.radar.emitting, strobe: g.world.radar.strobe, released: g.world.score.armsReleased || 0, alive: g.ac.alive };
        });
      } finally { if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.keyboard.up('Space'); }
      assert.equal(held.first.emitting, false); assert.equal(held.first.commit, 1); assert.equal(held.first.released, silent.released);
      assert.equal(held.alive, true); assert.equal(held.emitting, true); assert.ok(held.strobe >= .5); assert.equal(held.released, silent.released, 'A held consent must not launch merely because the emitter returns.');
      await page.evaluate(() => App.game.update(1 / 60)); // Release resets the original edge detector.
      const launched = await consent();
      return { ...launched, emitterTiming: { silent, held, method: 'Real emitter cycle and native release/repress; no emitter or launch setter.' } };
    }
    async function setupPass(point, lead = 0) {
      return page.evaluate(({ point, lead }) => { const g = App.game, a = g.ac, w = g.world;
        a.p = [point[0], point[1] + 120, point[2] + 1000]; a.v = [0, 0, -110]; a.yaw = 0; a.pitch = .03; a.roll = 0; a.gear = a.hook = false; a.onDeck = false; g.phase = 'airborne'; g.ripple = 1;
        const solution = w.solve(a); if (!solution) throw Error('Missing native designation'); a.p[2] = point[2] + solution.rel + lead;
        g.render(1 / 60); g.syncControls(); return { aircraft: a.p.slice(), velocity: a.v.slice(), solution: w.solve(a), designation: w.designated.p.slice(), target: point };
      }, { point, lead });
    }
    async function untilImpact() {
      return page.evaluate(() => { const g = App.game, w = g.world, before = w.score.hits + w.score.misses; let frames = 0;
        while (w.score.hits + w.score.misses === before && frames++ < 3600) { w.t += 1 / 60; g.t += 1 / 60; w._weapons(1 / 60, g.ac); w.stepSecondaries(g.ac); w._fires(1 / 60); FlightStrikeEffects.step(w, 1 / 60, { quality: App.rend.quality, eye: g.ac.p }); w.fx.step(1 / 60); FlightStrikeBoard.tick(g, 1 / 60); }
        return { frames, time: w.t, score: { ...w.score, cep: w.score.cep.slice() }, visual: FlightStrikeEffects.inspect(w), targets: w.targets.map(t => ({ kind: t.kind, alive: t.alive, hp: t.hp, p: t.p.slice() })), smoke: w.fx.smk.length, additive: w.fx.add.length };
      });
    }
    async function advanceEffects(seconds) { return page.evaluate(seconds => { const g = App.game, w = g.world; for (let i = 0; i < Math.ceil(seconds * 60); i++) { w.t += 1 / 60; g.t += 1 / 60; w.stepSecondaries(g.ac); w._fires(1 / 60); FlightStrikeEffects.step(w, 1 / 60, { quality: App.rend.quality, eye: g.ac.p }); w.fx.step(1 / 60); FlightStrikeBoard.tick(g, 1 / 60); } return { visual: FlightStrikeEffects.inspect(w), smoke: w.fx.smk.map(s => ({ p: s.p.slice(), c: s.c.slice(), life: s.life, age: s.t })), lights: FlightStrikeEffects.lights(w, g.ac.p, App.rend.quality) }; }, seconds); }
    async function frameImpact(point) { await page.evaluate(point => { const g = App.game; g.extView = false; g.hud.scope = false; const d = Math.hypot(point[0] - g.ac.p[0], point[2] - g.ac.p[2]); g.ac.yaw = Math.atan2(point[0] - g.ac.p[0], -(point[2] - g.ac.p[2])); g.ac.pitch = Math.atan2(point[1] + 12 - g.ac.p[1], d); g.render(1 / 60); g.syncControls(); }, point); }
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' }), sourceSHA256 = createHash('sha256').update(await response.body()).digest('hex');
      await page.waitForFunction(() => window.App && window.FlightStrikeBoard && window.FlightStrikeEffects); await click(page.locator('#bootGo'));
      await flight('m2'); const targetPoint = await page.evaluate(() => App.game.world.targets[0].p.slice()), readbackFixture = await placeReadback(targetPoint); await render();
      await click(page.locator('#flightStrikeBoardToggle')); const button = await page.locator('#flightStrikeBoardToggle').boundingBox(); assert.ok(button.width >= 44 && button.height >= 44);
      const controls = await page.evaluate(() => { const ids = ['pickle', 'btnScope', 'btnGear', 'pauseBtn', 'stick'], panel = document.getElementById('flightStrikePanel').getBoundingClientRect(); return ids.map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, visible: r.width > 0 && r.height > 0, overlaps: r.width > 0 && r.height > 0 && panel.left < r.right && panel.right > r.left && panel.top < r.bottom && panel.bottom > r.top }; }); }); assert.ok(controls.every(c => !c.overlaps), 'Worksheet must not overlap existing flight controls: ' + JSON.stringify(controls));
      await page.locator('[data-strike-interpretation]').selectOption('cluster'); await page.locator('[data-strike-interpretation]').focus(); await page.keyboard.press('Space'); assert.equal(await page.evaluate(() => !!App.keys.Space || !!App.gctl.commit), false); assert.equal(await page.evaluate(() => App.game.world.score.dropped), 0); await page.keyboard.press('Escape');
      await click(page.locator('#flightStrikeBoardToggle')); assert.equal(await page.evaluate(() => FlightStrikeBoard.snapshot(App.game).open), false, 'Native close tap must close the worksheet after dismissing the form popup');
      await slew(targetPoint); assert.equal(await page.evaluate(() => FlightStrikeBoard.snapshot(App.game).open), false, 'Physical scope drag must leave the worksheet closed');
      await click(page.locator('#flightStrikeBoardToggle')); assert.equal(await page.evaluate(() => FlightStrikeBoard.snapshot(App.game).open), true, 'Native open tap must expand the worksheet after the scope drag');
      await click(page.locator('[data-strike-mark]')); const note = await page.evaluate(() => FlightStrikeBoard.snapshot(App.game)); assert.equal(note.notes.length, 1); assert.equal(note.notes[0].interpretation, 'cluster'); assert.equal(await page.evaluate(() => App.game.world.designated), null);
      await shot('bn-correlation-scope'); record('Native worksheet records an observed echo as a BN judgment without locking, firing or granting identification', { sourceSHA256, readbackFixture, note, controls, button }, 'Aircraft position/velocity fixture, actual radar sweeps and native scope drag; NOTE is explicitly a player judgment. Form Space stays out of aircraft consent.');
      await click(page.locator('[data-strike-lock]')); await render(); const locked = await page.evaluate(() => ({ actualTarget: App.game.world.designated === App.game.world.targets[0], label: App.game.world.designated?.label, board: FlightStrikeBoard.snapshot(App.game) })); assert.equal(locked.actualTarget, true); assert.equal(locked.board.notes[0].designation, locked.label);
      await click(page.locator('#flightStrikeBoardToggle')); record('Native LOCK at a hard radar return delegates the preserved target designation', locked, 'Existing production App.lockTarget is invoked by the new native worksheet button; no designated object is assigned.');
      const pass = await setupPass(targetPoint), released = await consent(), depotImpact = await untilImpact(); assert.ok(depotImpact.frames > 60 && depotImpact.frames < 1200); assert.ok(depotImpact.score.hits >= 1 && depotImpact.targets.some(t => !t.alive && t.kind === 'depot')); assert.ok(depotImpact.visual.flashes.some(f => f.source === 'bomb')); assert.ok(depotImpact.visual.queue > 0 && depotImpact.visual.queue <= 128);
      await frameImpact(targetPoint); await shot('primary-depot-impact'); record('Native consent releases a real falling bomb and actual damage starts the primary blast', { pass, released, impact: depotImpact }, 'Declared 120m/110m-s run-in and one-store ripple; real Game.update release, original gravity/drag/contact/detonation/HP. Subsequent isolated weapon/FX clock prevents random AAA from obscuring the effect; no detonate/kill/effect callback is invoked by this test.');
      const depotSecondaries = await advanceEffects(1.5); assert.ok(depotSecondaries.visual.flashes.some(f => f.source === 'secondary')); assert.ok(depotSecondaries.smoke.some(s => s.life >= 8)); assert.ok(depotSecondaries.lights.length <= 4); await frameImpact(targetPoint); await shot('delayed-ammunition-cookoff');
      record('Only a destroyed depot schedules a distinct delayed ammunition blast and persistent smoke', { visual: depotSecondaries.visual, longSmoke: depotSecondaries.smoke.filter(s => s.life >= 8).length, lights: depotSecondaries.lights.length }, 'Real production secondary scheduler advanced 1.5 seconds after actual bomb destruction; Low-quality light budget.');
      const beforeEjection = await page.evaluate(() => ({ visual: FlightStrikeEffects.inspect(App.game.world), score: JSON.stringify(App.game.world.score), smoke: App.game.world.fx.smk.length, hp: App.game.world.targets.map(t => [t.hp, t.alive]) })); assert.ok(beforeEjection.visual.flashes.length > 0 && beforeEjection.visual.queue > 0 && beforeEjection.smoke > 0);
      if (profile.hasTouch) { await click(page.locator('#btnEject')); await click(page.locator('#btnEject')); } else await page.keyboard.press('j');
      const ejection = await page.evaluate(() => { const g = App.game; g.update(1 / 60); g.render(1 / 60); return { phase: g.phase, ejected: !!g.ejected, visual: FlightStrikeEffects.inspect(g.world), score: JSON.stringify(g.world.score), smoke: g.world.fx.smk.length, hp: g.world.targets.map(t => [t.hp, t.alive]), gl: g.rend.gl.getError() }; });
      assert.equal(ejection.phase, 'chute'); assert.equal(ejection.ejected, true); assert.equal(ejection.visual.flashes.length, 0); assert.equal(ejection.visual.queue, beforeEjection.visual.queue); assert.equal(ejection.score, beforeEjection.score); assert.deepEqual(ejection.hp, beforeEjection.hp); assert.ok(ejection.smoke > 0); assert.equal(ejection.gl, 0); await shot('real-ejection-clears-transient-flash');
      record('A real ejection clears transient flash lighting while preserving impact smoke, queued cook-offs and recorded damage', { beforeEjection, ejection }, 'Native J or existing two-tap touchscreen EJECT immediately after a genuine delayed strike; original parachute Game.update, no phase/ejection/flash setter.');
      const debrief = await page.evaluate(() => { const g = App.game; const before = JSON.stringify(g.world.score); g.debrief(false, 'BN browser acceptance pass ended before carrier recovery.'); return { text: document.getElementById('debriefBody').textContent, scoreUnchanged: before === JSON.stringify(g.world.score), log: Store.get('log', []).at(-1) }; }); assert.equal(debrief.scoreUnchanged, true); assert.match(debrief.text, /(?:B\/N|BN).*correlation|correlation.*(?:B\/N|BN)/i); await shot('bn-strike-debrief');
      record('Measured BN debrief preserves original score and distinguishes correlation from observed effects', debrief, 'Actual incomplete-sortie debrief after a real bomb pass; no carrier return or whole target-set completion claim.');

      // Blind fuel mission: coordinate attack carries its actual navigation
      // error. After an authentic designation, align only the declared run-in
      // aircraft fixture with that point, never move/kill/repair the targets.
      await flight('m5'); const fuelPoint = await page.evaluate(() => App.game.world.targets[0].p.slice()); await placeReadback(fuelPoint);
      await slew(fuelPoint); await lock(); const blind = await page.evaluate(() => ({ blind: App.game.world.blind, sameTargetObject: App.game.world.targets.includes(App.game.world.designated), label: App.game.world.designated.label, position: App.game.world.designated.p.slice() })); assert.equal(blind.blind, true); assert.equal(blind.sameTargetObject, false); assert.match(blind.label, /COORDINATES|MANUAL/);
      const fuelPass = await setupPass(fuelPoint), fuelReleased = await consent(), fuelImpact = await untilImpact(); assert.ok(fuelImpact.targets.some(t => t.kind === 'pol' && !t.alive)); assert.ok(fuelImpact.visual.queue >= 7); await frameImpact(fuelPoint); await shot('fuel-primary-impact');
      const fuelSecondary = await advanceEffects(1.5); assert.ok(fuelSecondary.visual.flashes.some(f => f.source === 'secondary')); assert.ok(fuelSecondary.smoke.some(s => s.c.every(v => v < .25) && s.life >= 8)); await frameImpact(fuelPoint); await shot('fuel-secondary-black-smoke');
      record('Blind coordinate mode grants no radar identity; real fuel damage produces bounded delayed black-smoke secondaries', { blind, fuelPass, fuelReleased, impact: fuelImpact, delayed: { visual: fuelSecondary.visual, darkSmoke: fuelSecondary.smoke.filter(s => s.c.every(v => v < .25) && s.life >= 8).length } }, 'Blind Mission5 remains blind. Native manual coordinate designation and declared precise-position run-in isolate an actual fuel hit; no navigation accuracy or target recognition award is fabricated.');

      await flight('m2'); const missPoint = await page.evaluate(() => { const p = App.game.world.targets[0].p.slice(); let best; for (let r = 800; r < 2400 && !best; r += 100) for (let a = 0; a < TAU && !best; a += PI / 8) { const x = p[0] + Math.sin(a) * r, z = p[2] + Math.cos(a) * r, h = terrainH(x, z); if (h > 8 && App.game.world.targets.every(t => Math.hypot(t.p[0] - x, t.p[2] - z) > 600)) best = [x, h, z]; } if (!best) throw Error('No safe bomb-miss fixture'); return best; }); await placeReadback(missPoint); await slew(missPoint); await lock(); assert.equal(await page.evaluate(() => App.game.world.designated.label), 'MANUAL POINT');
      await setupPass(missPoint); await consent(); const miss = await untilImpact(); assert.equal(miss.score.hits, 0); assert.equal(miss.score.misses, 1); assert.equal(miss.score.killed, 0); assert.equal(miss.visual.targets.length, 0); assert.equal(miss.visual.queue, 0); assert.ok(miss.visual.flashes.some(f => f.source === 'bomb')); await frameImpact(missPoint); await shot('miss-primary-no-cookoff');
      await advanceEffects(9); assert.equal((await page.evaluate(() => FlightStrikeEffects.inspect(App.game.world))).queue, 0);
      record('A real miss remains a visible primary blast and never invents destroyed fuel or ammunition', miss, 'Native MANUAL POINT designation on dry terrain >600m from every target; actual ASQ-61 release and original impact damage.');

      await flight('m3'); const bridgePoint = await page.evaluate(() => App.game.world.targets[0].p.slice()); await placeReadback(bridgePoint); await slew(bridgePoint); await lock();
      // Three separate legitimate one-store runs are needed for the unchanged
      // bridge HP. Fresh run-in placement is declared for each actual pass.
      const bridgeRuns = [];
      for (let run = 0; run < 4 && await page.evaluate(() => App.game.world.targets[0].alive); run++) {
        const fixture = await setupPass(bridgePoint, 400);
        const rel = await consent(), impact = await untilImpact(); bridgeRuns.push({ fixture, rel, impact });
      }
      const bridge = await page.evaluate(() => ({ alive: App.game.world.targets[0].alive, hp: App.game.world.targets[0].hp, visual: FlightStrikeEffects.inspect(App.game.world), score: App.game.world.score })); assert.equal(bridge.alive, false); assert.equal(bridge.visual.queue, 0); await frameImpact(bridgePoint); await shot('bridge-damage-dust'); await advanceEffects(9); assert.ok(!(await page.evaluate(() => FlightStrikeEffects.inspect(App.game.world))).flashes.some(f => f.source === 'secondary'));
      record('Actual repeated bridge damage produces masonry dust without fuel-style cook-off', { bridgeRuns, bridge }, 'Separate declared aircraft run-in fixtures with original bridge HP and real one-bomb gravity/drag/damage. No bridge HP/alive state or hit result is assigned.');

      await flight('m8'); const radarPoint = await page.evaluate(() => App.game.world.radar.p.slice()); await placeReadback(radarPoint);
      const armBefore = await page.evaluate(() => ({ available: App.game.ac.arms, bombs: App.game.ac.bombs, type: App.game.mis.type, aircraft: App.game.mis.brief.ac }));
      assert.equal(armBefore.type, 'ironhand'); assert.ok(armBefore.available > 0); assert.match(armBefore.aircraft, /A-6B/);
      const armRelease = await armConsent(); assert.equal(armRelease.armsReleased, 1); assert.equal(armRelease.dropped, 0); assert.equal(armRelease.arms, armBefore.available - 1);
      await render(); await click(page.locator('#flightStrikeBoardToggle')); const armBoard = await page.evaluate(() => FlightStrikeBoard.snapshot(App.game)); assert.equal(armBoard.stores.armsReleased, 1); assert.equal(armBoard.stores.bombsReleased, 0); assert.equal(armBoard.stores.released, 1); await shot('a6b-arm-stores-accounting'); await click(page.locator('#flightStrikeBoardToggle'));
      const armImpact = await untilImpact(); const radar = await page.evaluate(() => ({ hp: App.game.world.radar.hp, alive: App.game.world.radar.alive })); assert.equal(radar.alive, false); assert.ok(radar.hp <= 0); assert.ok(armImpact.visual.flashes.some(f => f.source === 'arm')); assert.equal(armImpact.visual.queue, 0);
      await frameImpact(radarPoint); await shot('a6b-arm-radar-impact');
      record('Existing A-6B ARM requires fresh consent on an active emitter, is counted separately and actually destroys the radar without fuel cook-off', { armBefore, armRelease, armBoard, impact: armImpact, radar }, 'Existing historical A-6B Iron Hand mission only. Genuine emission cycles prove that a silent-emitter press and continued hold do not launch; a fresh native COMMIT/Space press after emission returns launches the original ARM. Real seeker guidance, gravity/contact and target HP remain unchanged. No A-6A gun or ARM capability is added.');
      assert.deepEqual(errors, []); assert.deepEqual(badAssets, []); record('No uncaught JavaScript errors or missing runtime assets across target interpretation and real bomb impacts', { errors, badAssets }, 'Actual custom WebGL2 screenshots on desktop and simulated iPhone touch layout.');
    } catch (error) { const state = await page.evaluate(() => ({ screen: App?.screen, phase: App?.game?.phase, paused: App?.game?.paused, alive: App?.game?.ac?.alive, mission: App?.game?.mis?.id, graphicsLost: App?.graphicsContextLost, boardHidden: document.getElementById('flightStrikeBoard')?.hidden, teacher: document.getElementById('teach')?.className, teacherPeek: document.getElementById('teachPeek')?.className, knee: document.getElementById('knee')?.className, trace: window.__strikeInputTrace, board: window.FlightStrikeBoard && App?.game && FlightStrikeBoard.snapshot(App.game) })).catch(() => null); await fs.writeFile(path.join(out, name + '-failure-state.json'), JSON.stringify({ error: String(error), state }, null, 2)); await shot('FAIL').catch(() => {}); throw error; } finally { await context.close(); }
  }
  return { suite: 'm24-strike', results, total: results.length, screenshots, passed: true, physicalWindowsTested: false, actualIPhoneSafariTested: false, fullMissionCompletionTested: false, scope: 'Native Chromium keyboard/mouse/touch B/N controls and actual custom WebGL2 bomb impacts. Explicit clock and aircraft run-in fixtures; original radar/ASQ-61/ballistic/damage logic remains real. No physical Windows/iPhone Safari, subjective audio or complete human sortie claim.' };
};
