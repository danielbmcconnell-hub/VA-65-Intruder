'use strict';

// Actual WebGL2 first-person episode acceptance. Normal patrol schedules,
// collision, vision, hearing and recapture stay active throughout the complete
// route. Explicit stepping/view steering drive production movement and genuine
// keyboard/CDP touch controls; no AI methods or success flags are replaced.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

module.exports = async function episodeBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'pow-episode'); await fs.mkdir(out, { recursive: true });
  const checks = [], screenshots = [], browserErrors = [], sourceHashes = [];
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 }, hasTouch: false, deviceScaleFactor: 1 },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }
  ];
  if (process.env.INTRUDER_EPISODE_LAYOUT && !profiles.some(q => q.name === process.env.INTRUDER_EPISODE_LAYOUT)) throw new Error('Unknown episode browser layout');
  for (const layout of profiles.filter(q => !process.env.INTRUDER_EPISODE_LAYOUT || q.name === process.env.INTRUDER_EPISODE_LAYOUT)) {
    const context = await browser.newContext(layout), page = await context.newPage();
    const errors = []; page.on('pageerror', e => { errors.push(e.message); browserErrors.push({ layout: layout.name, error: e.message }); });
    const session = layout.hasTouch ? await context.newCDPSession(page) : null;
    const touch = (type, points = []) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(q => ({ ...q, radiusX: 7, radiusY: 7, force: 1 })) });
    const click = locator => layout.hasTouch ? locator.tap() : locator.click();
    const record = (name, actual) => { checks.push({ name: layout.name + ': ' + name, passed: true, actual }); console.log('PASS episode ' + layout.name + ' ' + name); };
    const tick = seconds => page.evaluate(seconds => {
      const g = App.game; let left = seconds;
      while (left > 1e-8) {
        const dt = Math.min(.05, left); g.t += dt; g.stepEvade(dt); left -= dt;
        if (g.pow.stage === 'solitary' || g.pow.complete) throw new Error('Normal patrol captured the episode player: ' + JSON.stringify({ time: g.pow.time, p: g.evade.p, message: g.pow.message }));
      }
      return { stage: g.pow.stage, p: g.evade.p.slice(), time: g.pow.time };
    }, seconds);
    const center = selector => page.locator(selector).evaluate(n => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width }; });
    async function shot(name) {
      const gl = await page.evaluate(() => { const g = App.game; g.render(1 / 60); g.syncControls(); return g.rend.gl.getError(); }); assert.equal(gl, 0, 'Actual gameplay screenshot must render without GL errors');
      const file = layout.name + '-' + name + '.png'; await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('pow-episode/' + file);
    }
    async function walk(x, z, { crouch = true, run = false, maxSeconds = 240 } = {}) {
      if (crouch) await page.keyboard.down('c'); else await page.keyboard.up('c');
      if (run) await page.keyboard.down('Shift'); else await page.keyboard.up('Shift');
      await page.keyboard.down('w');
      let actual;
      try {
        actual = await page.evaluate(({ x, z, maxSeconds }) => {
          const g = App.game, b = g.pow.base, tx = b[0] + x, tz = b[2] + z; let frames = 0; const trace = [];
          for (; frames < maxSeconds * 20; frames++) {
            if (g.pow.stage === 'solitary' || g.pow.complete) throw new Error('Actual patrol capture while walking toward ' + x + ',' + z + ': ' + JSON.stringify(trace));
            if (frames % 10 === 0) { trace.push({ t: g.pow.time, p: g.evade.p.slice(), actors: g.evade.searchers.filter(a => Math.hypot(a.p[0] - g.evade.p[0], a.p[2] - g.evade.p[2]) < 12).map(a => ({ id: a.id, p: a.p.slice(), state: a.state, visible: a.visible, sus: a.sus, goal: a.goal?.slice() })) }); if (trace.length > 12) trace.shift(); }
            if (g.pow.stage === 'river' && x >= 91) break;
            const dx = tx - g.evade.p[0], dz = tz - g.evade.p[2], d = Math.hypot(dx, dz); if (d < .035) break;
            g.evade.hdg = Math.atan2(dx, -dz);
            const speed = (g.pow.motion?.speed || 2.05) * (g.pow.movementScale || 1) * (App.keys.KeyC ? .49 : App.keys.ShiftLeft || App.keys.ShiftRight ? 1.9 : 1) * (g.pow.stats.fatigue > 80 ? .7 : 1) * (g.pow.stats.physical < 40 ? .7 : 1);
            const dt = Math.min(.05, d / speed); g.t += dt; g.stepEvade(dt);
            for (const a of g.evade.searchers) if (a.alive !== false && POW.blocked(g, a.p[0], a.p[2], .28, a.p[1])) throw new Error('Actual patrol intersects a solid: ' + a.id);
          }
          return { p: g.evade.p.slice(), stage: g.pow.stage, seconds: frames * .05, distance: Math.hypot(tx - g.evade.p[0], tz - g.evade.p[2]) };
        }, { x, z, maxSeconds });
      } finally { await page.keyboard.up('w'); await page.keyboard.up('Shift'); }
      assert.ok(actual.distance < .05 || actual.stage === 'river' && x >= 91, 'Physical route is blocked: ' + JSON.stringify(actual)); return actual;
    }
    async function aim(id) {
      const obj = await page.evaluate(id => {
        const g = App.game, q = g.pow.objects.find(q => q.id === id); if (!q) throw new Error('Missing episode object: ' + id);
        g.evade.hdg = Math.atan2(q.p[0] - g.evade.p[0], -(q.p[2] - g.evade.p[2]));
        return { id, p: q.p.slice(), hold: q.hold || .2, radius: q.radius || 1.7 };
      }, id); await tick(.15);
      assert.equal(await page.evaluate(() => App.game.pow.focus?.id), id, 'The real interaction prompt must select ' + id); return obj;
    }
    async function hold(id, seconds, beforeRelease) {
      const q = await aim(id); const duration = seconds ?? q.hold + .2;
      if (session) { const p = await center('#powHUD .pow-context-controls button:first-child'); await touch('touchStart', [{ x: p.x, y: p.y, id: 8 }]); }
      else await page.keyboard.down('f');
      try {
        if (beforeRelease && typeof beforeRelease === 'object') {
          await tick(beforeRelease.after); await beforeRelease.inspect(); await tick(Math.max(0, duration - beforeRelease.after));
        } else { await tick(duration); if (beforeRelease) await beforeRelease(); }
      }
      finally { if (session) await touch('touchEnd'); else await page.keyboard.up('f'); await tick(.2); }
      return page.evaluate(() => ({ stage: App.game.pow.stage, inventory: { ...App.game.pow.inventory }, flags: { ...App.game.pow.flags }, message: App.game.pow.message }));
    }
    async function throwStone() {
      if (session) await click(page.locator('#powHUD [data-episode-throw]'));
      else {
        // The production hotkey is intentionally limited to the game screen.
        // Keep the real active screen during the trusted key gesture;
        // the declared fixed-clock flag suspends automatic RAF.
        await page.evaluate(() => { App.screen = 'game'; });
        try { await page.keyboard.down('r'); await page.keyboard.up('r'); }
        finally { await page.evaluate(() => { App.screen = 'game'; }); }
      }
      await tick(.05);
    }
    const h = { page, layout, click, tick, touch, center, shot, walk, aim, hold, throwStone, record };
    try {
      await page.addInitScript(() => {
        localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 })); localStorage.setItem('a6_sawkeys', '1');
        const raf=window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame=cb=>window.__episodeFixedClock?0:raf(t=>{if(!window.__episodeFixedClock)cb(t)});
      });
      const coreResponse = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/assets/pow/core.js'));
      const entry = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 }); const core = await coreResponse;
      sourceHashes.push({ layout: layout.name, entrySHA256: createHash('sha256').update(await entry.body()).digest('hex'), coreSHA256: createHash('sha256').update(await core.body()).digest('hex') });
      await page.waitForFunction(() => window.App && window.POW?.EpisodeScene && POW.EpisodeStealth && POW.EpisodeActions, null, { timeout: 30000 });
      await click(page.locator('#bootGo')); await click(page.locator('#powChapter [data-pow-chapter="escape"]'));
      await page.waitForFunction(() => App.game?.pow?.stage === 'cell' && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
      await page.evaluate(() => { window.__episodeFixedClock=true; App.screen = 'game'; App.game.paused = false; for (const k of Object.keys(App.keys)) App.keys[k] = 0; App.gctl.pitch = App.gctl.roll = 0; });
      if (await page.locator('#powHUD [data-guide-skip]').isVisible()) await click(page.locator('#powHUD [data-guide-skip]'));
      const initial = await page.evaluate(() => ({ stage: App.game.pow.stage, webgl: App.game.rend.gl.getParameter(App.game.rend.gl.VERSION), normalPatrols: App.game.evade.searchers.map(a => ({ id: a.id, p: a.p.slice(), route: a.route.map(p => p.slice()), schedule: { ...a.schedule } })) }));
      assert.match(initial.webgl, /WebGL 2/); assert.ok(initial.normalPatrols.length >= 4); record('Original playable cell starts with the unmodified active patrol roster', initial);
      await exerciseCellAndPebbles(h);
      await completeNormalEpisode(h);
      await exerciseRiverArrival(h);
      assert.deepEqual(errors, [], 'No uncaught JavaScript errors during the physical episode');
      record('The completed normal-patrol episode has no JavaScript or WebGL errors', { errors, glError: await page.evaluate(() => App.game.rend.gl.getError()) });
    } catch (error) {
      const state = await page.evaluate(() => ({ stage: App.game?.pow?.stage, p: App.game?.evade?.p, time: App.game?.pow?.time, focus: App.game?.pow?.focus?.id, message: App.game?.pow?.message, stealth: App.game?.pow?.episodeStealth, scene: App.game?.pow?.episodeScene, actors: App.game?.evade?.searchers?.map(a => ({ id: a.id, p: a.p, state: a.state, sus: a.sus, face: a.face, goal: a.goal, attention: a.attention })) })).catch(() => null);
      await fs.writeFile(path.join(out, layout.name + '-failure.json'), JSON.stringify({ error: String(error), state }, null, 2) + '\n'); throw error;
    } finally { await fs.writeFile(path.join(out, 'partial-checks.json'), JSON.stringify({ checks, screenshots, browserErrors, sourceHashes }, null, 2) + '\n'); await context.close(); }
  }
  const report = { suite: 'pow-episode', checks, screenshots, browserErrors, sourceHashes,
    scope: 'Actual Chromium WebGL2 and production keyboard/CDP touch controls. The complete original cell→rooftop→Hanoi→river route keeps normal guard rosters, schedules, vision, hearing, navigation, collision and recapture active. Deterministic view steering and explicit simulation stepping control the player only. Separately labeled day/night visual probes temporarily alter the clock and its derived lighting only, and no success or AI state flags are written. Not physical Windows hardware, physical iPhone Safari or a human difficulty assessment.' };
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n'); return report;
};

async function exerciseCellAndPebbles(h) {
  const { page, layout, tick, touch, center, shot, walk, hold, throwStone, record } = h;
  await tick(.2);
  await shot('01-lit-cell');
  const figureBefore = await page.evaluate(() => App.game.evade.searchers.map(a => ({ id: a.id, p: a.p.slice(), pose: POW.FigureMotion.pose(a, App.game) })));
  await tick(6); // Initial route endpoints have genuine scheduled dwell times.
  const figureAfter = await page.evaluate(() => App.game.evade.searchers.map(a => ({ id: a.id, p: a.p.slice(), pose: POW.FigureMotion.pose(a, App.game), repeat: POW.FigureMotion.pose(a, App.game) })));
  assert.ok(figureAfter.some((a, i) => Math.hypot(a.p[0] - figureBefore[i].p[0], a.p[2] - figureBefore[i].p[2]) > .2 && a.pose.stride > 0 && a.pose.phase !== figureBefore[i].pose.phase));
  assert.ok(figureAfter.every(a => a.pose.phase === a.repeat.phase && Number.isFinite(a.pose.turn)));
  record('Photographic figure stride follows actual patrol movement and rendering does not advance animation state', { before: figureBefore, after: figureAfter });
  // Genuine CDP gestures, not synthetic DOM events, check phone look and feet.
  if (layout.hasTouch) {
    const before = await page.evaluate(() => ({ p: App.game.evade.p.slice(), hdg: App.game.evade.hdg }));
    // Real POW look is correctly limited to the active game screen. Keep
    // the original App.frame suspended, but expose that screen for trusted
    // gestures instead of asking gameplay input to work in a hidden fixture.
    await page.evaluate(() => { App.screen='game'; });
    try {
      await touch('touchStart', [{ x: 520, y: 155, id: 2 }]);
      await touch('touchMove', [{ x: 555, y: 165, id: 2 }]); await touch('touchEnd');
    } finally { await page.evaluate(() => { App.screen='game'; }); }
    const stick = await center('#stick');
    await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }]);
    await touch('touchMove', [{ x: stick.x, y: stick.y - (stick.width / 2 - 10) * .68, id: 1 }]);
    await tick(.4); await touch('touchEnd'); await tick(.2);
    const after = await page.evaluate(before => ({ p: App.game.evade.p.slice(), angle: Math.abs(App.game.evade.hdg - before.hdg), moved: Math.hypot(App.game.evade.p[0] - before.p[0], App.game.evade.p[2] - before.p[2]), pitch: App.gctl.pitch, roll: App.gctl.roll }), before);
    assert.ok(after.angle > .15 && after.moved > .25); assert.equal(after.pitch, 0); assert.equal(after.roll, 0);
    record('Native right-drag look and left-stick movement work and release cleanly', after);
  }
  // The locked door must stop real movement before any fitting is worked.
  await page.evaluate(() => { App.game.evade.hdg = 0; });
  await page.keyboard.down('w'); await tick(5); await page.keyboard.up('w');
  const barrier = await page.evaluate(() => ({ z: App.game.evade.p[2] - App.game.pow.base[2], stage: App.game.pow.stage, locked: !App.game.pow.flags.doorOpen }));
  assert.ok(barrier.z > -3.2 && barrier.locked && barrier.stage === 'cell'); record('The original closed cell door blocks held forward movement', barrier);
  await walk(0, -.15);
  const gathered = await hold('episode-pebbles');
  const finite = await page.evaluate(() => ({ stones: App.game.pow.episodeStealth.stones, pileRemaining: App.game.pow.episodeStealth.pileRemaining, meshes: App.game.campGeo.filter(q => q.id.startsWith('episode-pebble-pile:')).length }));
  assert.equal(finite.stones, 3); assert.equal(finite.pileRemaining, 0); assert.equal(finite.meshes, 0);
  record('A real held interaction collects exactly three physical pebbles', { ...finite, inventory: gathered.inventory });
  // Throw at the closed front wall. The projectile travels before it can emit
  // the impact event; collision uses the same real door as the walking test.
  await walk(0, -.5);
  await page.evaluate(() => { App.game.evade.hdg = 0; App.game.evade.look = App.game.evade.pitchCmd = 0; });
  let watcher;
  for (let n = 0; n < 300; n++) {
    watcher = await page.evaluate(() => { const g = App.game, a = g.evade.searchers.find(a => a.id === 'corridor-sentry'); return { p: a.p.slice(), time: g.pow.time, gap: Math.hypot(a.p[0] - g.pow.base[0], a.p[2] - (g.pow.base[2] - 3.6)) }; });
    if (watcher.gap < 7) break; await tick(.2);
  }
  assert.ok(watcher.gap < 7, 'Observe the normal sentry approach before testing audible impact');
  const beforeThrow = await page.evaluate(() => ({ impacts: App.game.pow.episodeStealth.impacts.length, noises: (App.game.pow.noises || []).filter(n => n.kind === 'stone-impact').length }));
  await throwStone();
  const airborne = await page.evaluate(() => ({ stones: App.game.pow.episodeStealth.stones, shot: { ...App.game.pow.episodeStealth.projectiles[0] }, impacts: App.game.pow.episodeStealth.impacts.length, noises: (App.game.pow.noises || []).filter(n => n.kind === 'stone-impact').length, pose: POW.EpisodeActions.view(App.game) }));
  assert.equal(airborne.stones, 2); assert.equal(airborne.shot.impacted, false); assert.equal(airborne.impacts, beforeThrow.impacts); assert.equal(airborne.noises, beforeThrow.noises);
  assert.equal(airborne.pose.pose, 'throw'); await shot('02-airborne-pebble');
  await throwStone();
  assert.equal(await page.evaluate(() => App.game.pow.episodeStealth.stones), 2, 'Cooldown must prevent repeated immediate throws');
  await tick(.5);
  const impact = await page.evaluate(() => ({ event: App.game.pow.episodeStealth.impacts.at(-1), projectile: App.game.pow.episodeStealth.projectiles[0], noise: (App.game.pow.noises || []).find(n => n.kind === 'stone-impact'), guards: App.game.evade.searchers.filter(a => a.attention?.kind === 'stone-impact').map(a => ({ id: a.id, state: a.state, noise: a.lastNoise, goal: a.goal, blocked: POW.blocked(App.game, a.p[0], a.p[2], .28, a.p[1]) })) }));
  assert.equal(impact.event.kind, 'solid'); assert.equal(impact.event.surface, 'cell-door'); assert.equal(impact.projectile.impacted, true);
  assert.deepEqual(impact.noise.p, impact.event.p); assert.match(impact.noise.source, /^episode-stone:/); assert.ok(impact.guards.length > 0 && impact.guards.every(q => q.state === 'investigate' && !q.blocked));
  record('A swept stone hits the real closed door and guards investigate the actual impact', { beforeThrow, airborne, impact });
  await walk(0, -.8);
  await page.evaluate(() => { App.game.evade.pitchCmd = App.game.evade.look = -.5; });
  await hold('bunk-bracket', .8, async () => {
    const pose = await page.evaluate(() => ({ view: POW.EpisodeActions.view(App.game), left: document.querySelector('[data-action-left]')?.style.transform, right: document.querySelector('[data-action-right]')?.style.transform }));
    assert.equal(pose.view.pose, 'rummage'); assert.ok(pose.view.progress > .4 && pose.view.progress < 1); assert.ok(pose.left && pose.right); await shot('03-searching-bunk');
    record('Searching the mat visibly moves hands during actual unfinished work', pose);
  });
  assert.equal(await page.evaluate(() => !!App.game.pow.inventory.bracket), false);
  const bracket = await hold('bunk-bracket'); assert.equal(bracket.inventory.bracket, true);
  await walk(0, -3.0); await walk(-.65, -3.0); await hold('wall-contact');
  assert.equal(await page.locator('#pow-captivity').isVisible(), true, 'The real wall interaction opens covert communication');
  const panel = page.locator('#pow-captivity');
  await h.click(panel.getByRole('button', { name: 'Listen / replay message', exact: true }));
  const counted = await page.evaluate(() => {
    const g = App.game, pairs = []; let prior = '', lastGroup = '', steps = 0;
    for (; steps < 3000 && !g.pow.captivity.tap.playback?.done; steps++) {
      g.t += .1; g.stepEvade(.1);
      const signal = document.querySelector('[data-tap-signal]').textContent;
      if (signal.includes('•') && signal !== prior) {
        const group = signal.startsWith('Row') ? 'row' : 'col';
        if (group === 'row' && lastGroup !== 'row') pairs.push({ row: 0, col: 0 });
        if (!pairs.length) throw new Error('A column was shown before a row');
        pairs.at(-1)[group]++; lastGroup = group;
      }
      prior = signal;
    }
    return { pairs, steps, done: !!g.pow.captivity.tap.playback?.done };
  });
  assert.equal(counted.done, true); assert.ok(counted.pairs.length > 0 && counted.pairs.every(q => q.row > 0 && q.row <= 5 && q.col > 0 && q.col <= 5));
  for (const pair of counted.pairs) {
    for (const group of ['row', 'col']) for (let n = 0; n < pair[group]; n++) {
      await h.click(panel.getByRole('button', { name: group === 'row' ? 'Tap row (+1)' : 'Tap column (+1)', exact: true })); await tick(.2);
    }
    await h.click(panel.getByRole('button', { name: 'Commit this letter', exact: true })); await tick(1);
  }
  await h.click(panel.getByRole('button', { name: 'Check complete word', exact: true }));
  const contact = await page.evaluate(() => ({ flags: { ...App.game.pow.flags }, received: App.game.pow.captivity.tap.received, p: App.game.evade.p.slice() }));
  assert.equal(contact.flags.wallContact, true); assert.equal(contact.received, 1);
  await h.click(panel.getByRole('button', { name: 'Return to cell', exact: true })); await tick(.2);
  record('Physical bunk search and counted covert wall communication establish real prisoner contact', { counted, contact });
  await walk(.5, -3.0);
  const lit = await page.evaluate(() => ({ value: POW.EpisodeScene.lightAt(App.game, [App.game.pow.base[0], App.game.pow.base[1] + 1.1, App.game.pow.base[2]], { requireLOS: true }), lights: POW.EpisodeScene.renderState(App.game).lights }));
  await hold('episode-lamp:cell-bulb');
  const dark = await page.evaluate(() => ({ on: App.game.pow.episodeScene.lamps['cell-bulb'], value: POW.EpisodeScene.lightAt(App.game, [App.game.pow.base[0], App.game.pow.base[1] + 1.1, App.game.pow.base[2]], { requireLOS: true }), lights: POW.EpisodeScene.renderState(App.game).lights }));
  assert.equal(dark.on, false); assert.ok(dark.value < lit.value); assert.ok(dark.lights.length <= 4);
  await page.evaluate(() => { App.game.evade.hdg = Math.PI; App.game.evade.pitchCmd = App.game.evade.look = 0; }); await shot('04-dark-cell');
  record('Reachable physical lamp switch changes illumination and real stealth light', { lit, dark });
  const progress = await page.evaluate(() => ({ p: App.game.evade.p.slice(), time: App.game.pow.time, inventory: { ...App.game.pow.inventory }, stealth: POW.EpisodeStealth.snapshot(App.game), scene: POW.EpisodeScene.snapshot(App.game), ai: POW.AI.snapshot(App.game) }));
  await h.click(page.locator('#powHUD').getByRole('button', { name: 'Save', exact: true }));
  await page.waitForFunction(time => POW.ctx.Store.get('pow_checkpoint', null)?.time === time, progress.time,{polling:50,timeout:30000});
  await page.evaluate(() => { window.__episodeBeforeContinue = App.game.pow; });
  await h.click(page.locator('#powHUD').getByRole('button', { name: 'Continue', exact: true }));
  await page.waitForFunction(p => App.game.pow !== window.__episodeBeforeContinue && App.game.evade.p.every((v, i) => Math.abs(v - p[i]) < 1e-8) && App.game.pow.time > 0, progress.p,{polling:50,timeout:30000});
  const resumed = await page.evaluate(() => ({ p: App.game.evade.p.slice(), time: App.game.pow.time, inventory: { ...App.game.pow.inventory }, stealth: POW.EpisodeStealth.snapshot(App.game), scene: POW.EpisodeScene.snapshot(App.game), ai: POW.AI.snapshot(App.game) }));
  assert.deepEqual(resumed, progress, 'Actual Save/Continue must preserve finite stones, light switches, physical work, player position and live patrol memory');
  record('Real Save and Continue preserve episode inventory, illumination, physical work and patrol memory', resumed);
  await tick(20); // Let the genuine closed-door investigation end before escaping.
}

async function completeNormalEpisode(h) {
  const { page, tick, shot, walk, hold, throwStone, record } = h;
  await walk(0, -3.0);
  const bolt = await page.evaluate(() => App.game.campGeo.find(q => q.id === 'door-bolt').p.slice());
  await hold('door-fitting', 3.4, async () => {
    const work = await page.evaluate(() => ({ view: POW.EpisodeActions.view(App.game), bolt: App.game.campGeo.find(q => q.id === 'door-bolt')?.p.slice(), open: !!App.game.pow.flags.doorOpen, barrier: App.game.pow.solids.find(q => q.id === 'cell-door')?.active !== false }));
    assert.equal(work.view.pose, 'loosen'); assert.ok(work.view.progress > .4 && work.view.progress < 1); assert.ok(work.bolt[0] < bolt[0] - .08); assert.equal(work.open, false); assert.equal(work.barrier, true);
    await shot('05-working-door-hardware'); record('The improvised bracket visibly retracts hardware while the door remains locked', work);
  });
  const door = await hold('door-fitting'); assert.equal(door.flags.doorOpen, true);
  record('Completing the real fitting hold opens the original collision door', door);
  await tick(.8); // Finish the genuine latch-hand pulse before another action.
  const evidence = await page.evaluate(() => ({ seenBy: App.game.pow.episodeStealth.tamper.seenBy.slice(), actors: App.game.evade.searchers.filter(a => a.evidenceFound).map(a => a.id) }));
  await hold('episode-conceal-fitting');
  const covered = await page.evaluate(() => ({ concealed: App.game.pow.episodeStealth.tamper.concealed, seenBy: App.game.pow.episodeStealth.tamper.seenBy.slice(), actors: App.game.evade.searchers.filter(a => a.evidenceFound).map(a => a.id), marks: App.game.campGeo.filter(q => q.id === 'episode-door-evidence').length, open: App.game.pow.flags.doorOpen }));
  assert.equal(covered.concealed, true); assert.equal(covered.marks, 0); assert.equal(covered.open, true); assert.deepEqual(covered.seenBy, evidence.seenBy); assert.deepEqual(covered.actors, evidence.actors);
  record('Physically covering fitting marks preserves the open door and guards\' already observed evidence', { evidence, covered });
  // Aim through the doorway. The finite physical stone must strike elsewhere
  // before the player enters the corridor; no guard goals are fixture-written.
  await page.evaluate(() => { App.game.evade.hdg = .05; App.game.evade.pitchCmd = App.game.evade.look = .36; });
  await throwStone(); await tick(1.2);
  const remote = await page.evaluate(() => ({ base: App.game.pow.base.slice(), event: App.game.pow.episodeStealth.impacts.at(-1), stones: App.game.pow.episodeStealth.stones, guards: App.game.evade.searchers.map(a => ({ id: a.id, state: a.state, p: a.p.slice(), goal: a.goal?.slice(), noise: a.lastNoise?.slice(), reason: a.attention?.reason, kind: a.attention?.kind })) }));
  assert.equal(remote.stones, 1); assert.ok(remote.event.p[2] < remote.base[2] - 3.7);
  assert.ok(remote.guards.some(a => a.kind === 'stone-impact' && a.goal && Math.hypot(a.goal[0] - remote.event.p[0], a.goal[2] - remote.event.p[2]) < .01));
  record('A thrown stone beyond the open doorway creates a remote investigation without moving guards by fixture', remote);
  // Seeing a prisoner at the open doorway can correctly override the sound.
  // Withdraw behind the actual cell wall, observe the guard finish his check,
  // and leave when his unmodified patrol has physically cleared the door.
  await walk(.65, -3.0);
  let clearance;
  for (let n = 0; n < 900; n++) {
    clearance = await page.evaluate(() => { const g = App.game, a = g.evade.searchers.find(a => a.id === 'corridor-sentry'), roof = g.evade.searchers.find(a => a.id === 'roof-watch'); return { time: g.pow.time, x: a.p[0] - g.pow.base[0], z: a.p[2] - g.pow.base[2], state: a.state, visible: a.visible, seen: a.seen, roofZ: roof.p[2] - g.pow.base[2], roofState: roof.state }; });
    if (clearance.x < -4) break; await tick(.2);
  }
  assert.ok(clearance.x < -4, 'Observe the westbound corridor patrol before taking the quiet eastbound escape route: ' + JSON.stringify(clearance));
  await walk(0, -3.0);
  record('Hiding behind the cell wall and observing the live guard creates a physical departure window', clearance);
  await walk(0, -5.6, { crouch: true });
  assert.equal(await page.evaluate(() => App.game.pow.stage), 'compound');
  await walk(.3, -6.85, { crouch: true });
  await walk(14, -6.85, { crouch: true });
  await walk(14, -22.4, { crouch: true });
  const roof = await page.evaluate(() => ({ stage: App.game.pow.stage, p: App.game.evade.p.slice(), base: App.game.pow.base.slice(), guard: App.game.evade.searchers.find(a => a.id === 'roof-watch')?.p.slice(), actors: App.game.evade.searchers.map(a => ({ id: a.id, p: a.p.slice(), pose: POW.FigureMotion?.pose(a, App.game), clear: !POW.blocked(App.game, a.p[0], a.p[2], .28, a.p[1]) })) }));
  assert.ok(roof.p[1] > roof.base[1] + 3.3 && roof.actors.every(a => a.clear));
  await page.evaluate(() => { const g = App.game, a = g.evade.searchers.find(a => a.id === 'roof-watch'); g.evade.hdg = Math.atan2(a.p[0] - g.evade.p[0], -(a.p[2] - g.evade.p[2])); g.evade.pitchCmd = g.evade.look = 0; }); await shot('06-rooftop-live-watch');
  await daylightVisualProbe(h, '06b-rooftop-daylight-visual-probe');
  record('Real corridor movement, quiet stair ascent and elevation reach the roof under normal patrols', roof);
  await walk(20.1, -23.25, { crouch: true });
  const rope = await hold('roof-rope', undefined, { after: .4, inspect: async () => {
    const pose = await page.evaluate(() => POW.EpisodeActions.view(App.game)); assert.equal(pose.pose, 'gather-rope'); await shot('07-gathering-rope');
  } });
  assert.equal(rope.inventory.rope, true);
  await walk(25.25, -24, { crouch: true });
  await hold('roof-descent', undefined, { after: 1.2, inspect: async () => {
    const pose = await page.evaluate(() => POW.EpisodeActions.view(App.game)); assert.equal(pose.pose, 'tie-rope'); await shot('08-tying-rope');
  } });
  await tick(1);
  const descent = await page.evaluate(() => ({ view: POW.EpisodeActions.view(App.game), traversal: App.game.pow.traversal && { ...App.game.pow.traversal }, p: App.game.evade.p.slice() }));
  assert.equal(descent.view.pose, 'descent'); assert.ok(descent.traversal.t > 0 && descent.traversal.t < 4); await shot('09-physical-rope-descent');
  await tick(4);
  const outside = await page.evaluate(() => ({ stage: App.game.pow.stage, p: App.game.evade.p.slice(), base: App.game.pow.base.slice(), outside: App.game.pow.flags.outside, crossed: App.game.pow.flags.roofCrossed, guards: App.game.evade.searchers.map(a => ({ id: a.id, kind: a.kind, p: a.p.slice(), state: a.state, route: a.route.length })) }));
  assert.equal(outside.stage, 'hanoi'); assert.equal(outside.outside, true); assert.equal(outside.crossed, true); assert.ok(Math.abs(outside.p[1] - outside.base[1]) < .01);
  await page.evaluate(() => { App.game.evade.hdg = Math.PI / 2; App.game.evade.pitchCmd = App.game.evade.look = 0; }); await shot('10-hanoi-night-patrols');
  record('Held rope work and timed physical descent cross the wall into the original Hanoi street', { descent, outside });
  await walk(30.5, -27.5, { crouch: true });
  await walk(47, -27.5, { crouch: true });
  await hold('episode-lamp:street-lamp-west');
  assert.equal(await page.evaluate(() => App.game.pow.episodeScene.lamps['street-lamp-west']), false);
  await walk(60, -27.5, { crouch: true });
  await walk(66.5, -25.8, { crouch: true }); // Pass the actual north-side cart.
  await walk(73, -25.8, { crouch: true });
  await walk(82, -27.5, { crouch: true });
  await hold('episode-lamp:street-lamp-east');
  await walk(91.5, -26.5, { crouch: false, run: true });
  const reached = await page.evaluate(() => ({ stage: App.game.pow.stage, outside: App.game.pow.flags.outside, riverEntered: App.game.pow.flags.riverEntered, distance: App.game.pow.river?.logicalDistance, complete: !!App.game.pow.complete, stones: App.game.pow.episodeStealth.stones, seen: App.game.evade.searchers.filter(a => a.seen).map(a => a.id) }));
  assert.equal(reached.stage, 'river'); assert.equal(reached.riverEntered, true); assert.equal(reached.complete, false);
  record('The complete cell→roof→Hanoi→river episode succeeds by genuine movement with default patrols active', reached);
}

async function exerciseRiverArrival(h) {
  const { page, tick, shot, record } = h;
  await page.keyboard.up('c'); await page.keyboard.up('Shift'); await page.keyboard.up('w'); await tick(.2);
  const snapshot = () => page.evaluate(() => {
    const g = App.game, s = g.pow, r = s.river;
    return { stage: s.stage, p: g.evade.p.slice(), distance: r.logicalDistance, section: r.sectionId, mode: r.mode, resting: r.resting, cover: r.cover, hideAt: r.hideAt?.slice(), riverCentreX: s.base[0] + 94, input: { ...s.input }, stats: { ...s.stats }, current: r.currentWorldMps, submerged: !!r.submerged, breath: r.breath, hours: r.hours, entries: s.episodeActions?.entries, view: POW.EpisodeActions.view(g), visited: r.sectionsVisited.slice(), encounters: JSON.parse(JSON.stringify(r.encounters)) };
  });
  await shot('11-river-water-entry'); const entered = await snapshot(); assert.ok(['float', 'swim'].includes(entered.mode));
  await tick(4); const drifted = await snapshot(); assert.ok(drifted.distance > entered.distance + 50); assert.ok(drifted.current > 0);
  record('Water entry leads to actual downstream displacement from the river current', { entered, drifted });
  // F toggles swimming through the existing physical river-control object.
  await page.keyboard.down('f'); await tick(.4); await page.keyboard.up('f'); await tick(.2);
  await page.evaluate(() => { App.game.evade.hdg = Math.PI; });
  await page.keyboard.down('w'); await tick(1);
  const swimming = await snapshot(); assert.equal(swimming.mode, 'swim'); assert.equal(swimming.view.pose, 'swim'); await shot('12-first-person-swimming');
  await page.keyboard.down('Space'); await tick(1);
  const under = await snapshot(); assert.ok(under.breath < swimming.breath); assert.ok(under.submerged || under.mode === 'dive');
  await page.keyboard.up('Space'); await page.keyboard.up('w'); await tick(.2);
  await tick(1.2); const surfaced = await snapshot(); assert.equal(surfaced.submerged, false);
  record('Real swim and dive controls animate hands and consume then restore air', { swimming, under, surfaced });
  // Production movement/current only; deterministic headings are view steering.
  const drift = seconds => page.evaluate(seconds => {
    const g = App.game;
    for (let n = 0; n < seconds * 20 && g.pow.stage === 'river' && g.pow.river.logicalDistance < 6600; n++) {
      const dx = g.pow.base[0] + 94 - g.evade.p[0];
      g.evade.hdg = Math.abs(dx) > 1 ? dx > 0 ? Math.PI / 2 : Math.PI * 1.5 : Math.PI;
      g.app.keys.KeyW = Math.abs(dx) > 1 ? 1 : 0;
      g.t += .05; g.stepEvade(.05);
    }
    g.app.keys.KeyW = 0;
    return { stage: g.pow.stage, distance: g.pow.river?.logicalDistance };
  }, seconds);
  for (let n = 0; n < 12; n++) { const q = await drift(20); assert.equal(q.stage, 'river'); if (q.distance >= 6600) break; }
  const reeds = await snapshot(); assert.ok(reeds.distance >= 6600); assert.equal(reeds.section, 'reeds'); await shot('13-red-river-reeds');
  record('Actual current and steering continue from the escaped compound into the reed section', reeds);
  let landing;
  for (let chunk = 0; chunk < 18; chunk++) {
    landing = await page.evaluate(() => {
      const g = App.game; let entranceReached = !!window.__episodeEntrance;
      for (let n = 0; n < 200 && g.pow.stage === 'river' && !g.pow.river.resting; n++) {
        const r = g.pow.river, e = g.evade, x = g.pow.base[0] + 94, o = g.pow.objects.find(o => o.id === 'river-landing-reeds');
        if (!o) throw new Error('Missing physical reed landing');
        const keys = g.app.keys; keys.KeyF = 0; keys.KeyW = 0; keys.KeyC = 1;
        if (r.mode === 'float') keys.KeyF = 1;
        else if (Math.abs(e.p[0] - x) < 15.5) { e.hdg = o.p[0] > x ? Math.PI / 2 : Math.PI * 1.5; keys.KeyW = 1; }
        else if (Math.hypot(e.p[0] - o.p[0], e.p[2] - o.p[2]) > .65) {
          const side = Math.sign(o.p[0] - x), entrance = [x + side * 19.7, o.p[1], o.p[2]];
          if (Math.hypot(e.p[0] - entrance[0], e.p[2] - entrance[2]) < .65) entranceReached = true;
          const p = entranceReached ? o.p : entrance; e.hdg = Math.atan2(p[0] - e.p[0], -(p[2] - e.p[2])); keys.KeyW = 1;
        } else keys.KeyF = 1;
        g.t += .05; g.stepEvade(.05);
      }
      window.__episodeEntrance = entranceReached; g.app.keys.KeyW = g.app.keys.KeyF = 0;
      return { stage: g.pow.stage, resting: g.pow.river?.resting };
    });
    assert.equal(landing.stage, 'river'); if (landing.resting) break;
  }
  await tick(.1); // Recompute shelter visibility after the real landing action.
  const sheltered = await snapshot(); assert.equal(sheltered.mode, 'hidden'); assert.equal(sheltered.resting, true); assert.ok(sheltered.cover > .8, 'Actual shelter must provide physical cover: ' + JSON.stringify(sheltered)); assert.equal(sheltered.encounters.reeds.landingReached, true);
  await page.evaluate(() => { App.game.evade.hdg = Math.PI * 1.5; App.game.evade.pitchCmd = App.game.evade.look = 0; }); await shot('14-covered-mudbank-rest');
  await daylightVisualProbe(h, '15-river-daylight-visual-probe');
  await tick(12); const rested = await snapshot(); assert.ok(rested.stats.fatigue < sheltered.stats.fatigue || rested.stats.fatigue === 0); assert.ok(rested.stats.physical >= sheltered.stats.physical); assert.ok(rested.hours > sheltered.hours); assert.ok(Math.abs(rested.distance - sheltered.distance) < .01);
  record('Physical quiet swimming and bank navigation reach real shelter, where rest restores condition without advancing distance', { sheltered, rested });
}

async function daylightVisualProbe({ page, shot, record }, label) {
  const before = await page.evaluate(() => {
    const g = App.game, s = g.pow;
    const saved = { hour: g._envHour, riverHour: s.river?.hour, riverDaylight: s.river?.daylight, p: g.evade.p.slice(), time: s.time, distance: s.river?.logicalDistance, ai: JSON.stringify(POW.AI.snapshot(g)) };
    g.setHour(10, .52); if (s.river) { s.river.hour = 10; s.river.daylight = 1; }
    return saved;
  });
  try { await shot(label); }
  finally { await page.evaluate(saved => { const g = App.game; g.setHour(Number.isFinite(saved.hour) ? saved.hour : 22.05, .52); if (g.pow.river) { g.pow.river.hour = saved.riverHour; g.pow.river.daylight = saved.riverDaylight; } }, before); }
  const after = await page.evaluate(() => ({ p: App.game.evade.p.slice(), time: App.game.pow.time, distance: App.game.pow.river?.logicalDistance, riverDaylight: App.game.pow.river?.daylight, ai: JSON.stringify(POW.AI.snapshot(App.game)) }));
  assert.deepEqual(after.p, before.p); assert.equal(after.time, before.time); assert.equal(after.distance, before.distance); assert.equal(after.riverDaylight, before.riverDaylight); assert.equal(after.ai, before.ai);
  record('Separately labeled daylight render probe preserves physical progress and patrol state: ' + label, { position: after.p, time: after.time, distance: after.distance });
}
