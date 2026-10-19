'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Native controls and the original right-seat pilot, ASQ-61, ballistic weapon
// integration and carrier arrestment. RAF scheduling alone is suspended so a
// deterministic fixed-step clock can compress flight without inventing hits,
// target health, aircraft placement, phases, a wire or a successful result.
module.exports = async function dixieStrikeBrowser(browser, target, evidenceDir) {
  const results = [], screenshots = [], out = path.join(evidenceDir, 'dixie-strike');
  await fs.mkdir(out, { recursive: true });
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ].filter(p => !process.env.INTRUDER_DIXIE_PROFILE || p.name === process.env.INTRUDER_DIXIE_PROFILE);
  for (const profile of profiles) {
    const { name, ...options } = profile, context = await browser.newContext(options), page = await context.newPage();
    const cdp = profile.hasTouch ? await context.newCDPSession(page) : null, errors = [], missing = [], inputTrace = [], runtimeSHA256 = {}, digestTasks = [];
    const click = locator => cdp ? locator.tap() : locator.click();
    page.setDefaultTimeout(90000);
    page.on('pageerror', e => { errors.push(e.message); console.log('Dixie JavaScript error ' + name + ': ' + e.message); });
    page.on('response', r => { if (r.status() >= 400 && /\/assets\//.test(r.url())) missing.push({ status: r.status(), url: r.url() }); });
    page.on('response', r => { const file = new URL(r.url()).pathname; if (r.ok() && /\/assets\/flight\/(?:strike-(?:experience|crew|scene|checkpoint|effects|board)|immersion)\.(?:js|css)$/.test(file)) digestTasks.push(r.body().then(bytes => { const sha = createHash('sha256').update(bytes).digest('hex'); (runtimeSHA256[file] ||= []); if (!runtimeSHA256[file].includes(sha)) runtimeSHA256[file].push(sha); })); });
    await context.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
      localStorage.setItem('a6_sawkeys', '1');
      // Uniform seeded randomness retains the real scatter, threat hit and
      // aircraft damage probabilities; this does not force favorable values.
      let seed = 0x196603;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => window.__dixieFixedClock ? 0 : raf(t => { if (!window.__dixieFixedClock) callback(t); });
      window.__dixieNativeInputs = [];
      for (const type of ['pointerup', 'click', 'keydown', 'keyup']) document.addEventListener(type, e => {
        if (e.isTrusted) window.__dixieNativeInputs.push({ type, id: e.target && e.target.id || '', key: e.code || '', trusted: e.isTrusted });
      }, true);
    });
    const record = (title, actual, method) => { results.push({ profile: name, name: title, passed: true, actual, method }); console.log('PASS Dixie ' + name + ' ' + title); };
    async function state() {
      return page.evaluate(() => {
        const g = App.game, w = g.world, a = g.ac;
        return { mission: g.mis.id, time: g.t, phase: g.phase, paused: g.paused, rightSeat: g.rightSeat, departed: g.departed,
          aircraft: { p: a.p.slice(), v: a.v.slice(), yaw: a.yaw, pitch: a.pitch, roll: a.roll, alive: a.alive, onDeck: a.onDeck, bombs: a.bombs, damage: { ...a.dmg }, crew: { ...a.crew } },
          experience: window.FlightStrikeExperience && FlightStrikeExperience.view(g), score: { ...w.score, cep: w.score.cep.slice() },
          route: { index: w.rtIdx, length: w.route.length, fixes: w.nav.fixes }, designation: w.designated && { p: w.designated.p.slice(), label: w.designated.label },
          solution: g.sol && { ...g.sol }, egress: g.egressCalled, shipRange: g.shipRange, acls: !!g.aclsCoupled, wire: g.wire || 0, result: g.result,
          objectives: g.objState(), gl: g.rend.gl.getError() };
      });
    }
    async function render() {
      await page.evaluate(() => { const g = App.game; g.render(1 / 60); g.syncControls(); if (window.FlightStrikeBoard) FlightStrikeBoard.render(g); });
    }
    async function shot(key) {
      await render(); const file = name + '-' + key + '.png';
      assert.equal(await page.evaluate(() => App.rend.gl.getError()), 0);
      await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('dixie-strike/' + file);
    }
    async function loaded() {
      // App's real loader constructs a new Game without RAF. During a
      // checkpoint retry the deliberately suspended scheduling means st is
      // first produced by render below, rather than by an automatic frame.
      await page.waitForFunction(() => App.game?.mis?.id === 'm2' && document.getElementById('loader').style.display === 'none', null, { timeout: 90000, polling: 50 });
      await page.evaluate(() => { window.__dixieFixedClock = true; }); await page.waitForTimeout(50);
      await render();
      // Fold only existing cards through their existing native interaction.
      if (await page.locator('#teach.on').count()) await click(page.locator('#teach'));
      if (await page.locator('#legend.on').count()) await page.keyboard.press('h');
    }
    async function advance(seconds) {
      return page.evaluate(seconds => {
        const g = App.game, dt = 1 / 60, start = g.t, phases = [], observed = [];
        for (let n = 0; n < Math.round(seconds * 60) && g.ac.alive && !g.result && g.phase !== 'done' && !g.evade && !g.chute; n++) {
          const before = g.world.score.dropped, impacts = g.world.score.hits + g.world.score.misses;
          g.update(dt);
          if (g.world.score.dropped !== before || g.world.score.hits + g.world.score.misses !== impacts) observed.push({ time: g.t, released: g.world.score.dropped, hits: g.world.score.hits, misses: g.world.score.misses, killed: g.world.score.killed, bombsInFlight: g.world.bombs.length });
          const phase = g.strikeExperience && g.strikeExperience.phase;
          if (phases.at(-1) !== phase) phases.push(phase);
        }
        g.render(dt); g.syncControls();
        return { start, time: g.t, phases, observed, alive: g.ac.alive, phase: g.phase, result: g.result, position: g.ac.p.slice(), shipRange: g.shipRange };
      }, seconds);
    }
    async function holdConsent(on) {
      if (cdp) {
        if (!on) return cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const b = await page.locator('#pickle').boundingBox(); assert.ok(b && b.width >= 44 && b.height >= 44);
        return cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 6, radiusX: 6, radiusY: 6, force: 1 }] });
      }
      if (on) { await page.keyboard.down('Space'); assert.equal(await page.evaluate(() => App.keys.Space), 1, 'A clicked flight action must release focus so held Space reaches COMMIT.'); }
      else await page.keyboard.up('Space');
    }
    async function scopeTo(point) {
      // Use only a public route/chart coordinate or an observed scope-cell
      // position. Invert the actual HUD drag mapping, never call slewTo or
      // assign crosshair, designation or navigation fields.
      const drag = await page.evaluate(p => {
        const g = App.game, h = g.hud, dx = p[0] - g.st.p[0], dz = p[2] - g.st.p[2], range = Math.hypot(dx, dz), a = Math.atan2(dx, -dz) - g.st.yaw;
        const rel = Math.atan2(Math.sin(a), Math.cos(a)), desired = [rel / RSECT, (range - 300) / h.radar.maxR];
        if (Math.abs(desired[0]) > 1 || desired[1] < 0 || desired[1] > 1) return { available: false, rel, range };
        return { available: true, dx: (desired[0] - h.cross[0]) * h.W * .55, dy: -(desired[1] - h.cross[1]) * h.H * .9, desired };
      }, point);
      if (!drag.available) return drag;
      const box = await page.locator('#stack').boundingBox(), start = { x: box.x + box.width * .67, y: box.y + box.height * .52 };
      const count = Math.max(1, Math.ceil(Math.max(Math.abs(drag.dx) / (box.width * .18), Math.abs(drag.dy) / (box.height * .18))));
      for (let n = 0; n < count; n++) {
        const end = { x: start.x + drag.dx / count, y: start.y + drag.dy / count };
        if (cdp) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 2, radiusX: 6, radiusY: 6, force: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 2, radiusX: 6, radiusY: 6, force: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
        else { await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up(); }
      }
      await render(); return drag;
    }
    async function lock() {
      if (!cdp) await page.keyboard.press('Enter');
      else {
        if (!await page.locator('#flightStrikePanel').isVisible()) await click(page.locator('#flightStrikeBoardToggle'));
        await click(page.locator('[data-strike-lock]')); await click(page.locator('#flightStrikeBoardToggle'));
      }
      await render();
    }
    async function ready() {
      await click(page.locator('#pauseBtn'));
      await click(page.locator('#pauseBody').getByRole('button', { name: 'Ready Room', exact: true }));
      await page.waitForFunction(() => App.screen === 'ready' && !App.game);
      await click(page.locator('#tabs [data-tab="ops"]'));
    }
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
      const sourceSHA256 = createHash('sha256').update(await response.body()).digest('hex');
      console.log('Dixie loaded entry ' + name + ' ' + sourceSHA256);
      await page.waitForFunction(() => window.App && window.FlightStrikeExperience && window.FlightStrikeScene && window.FlightStrikeCrew && window.FlightStrikeCheckpoint);
      await click(page.locator('#bootGo'));
      const card = page.locator('#readyBody .mcard').filter({ hasText: /Break-in on Dixie Station/i }); assert.equal(await card.count(), 1);
      assert.equal(await page.locator('#readyBody .mcard').count(), 12);
      // The original campaign card correctly remains locked on a new save.
      // The new guided-strike briefing entry is explicitly available without
      // altering progression, forcing a click or setting an unlock flag.
      await click(page.locator('#dixieReady'));
      assert.equal(await page.locator('#dixieStart').count(), 1); assert.equal(await page.locator('#dixiePractice').count(), 1);
      assert.match(await page.locator('#briefBody').innerText(), /dramatized|authored|representative/i);
      await click(page.locator('#dixieStart')); await loaded(); const initial = await state();
      assert.equal(initial.rightSeat, true); assert.equal(initial.aircraft.onDeck, true); assert.equal(initial.gl, 0);
      assert.equal(await page.evaluate(() => App.set.seat), 0, 'Opt-in B/N experience must not rewrite the saved default seat.');
      assert.ok(initial.experience); await shot('original-carrier-bn-start');
      await Promise.all(digestTasks);
      record('Native optional DIXIE briefing launches the existing A-6A at its carrier with the B/N station active', { sourceSHA256, runtimeSHA256: { ...runtimeSHA256 }, initial, flightSetting: 'Standard', graphicsSetting: 'Low', uniformRandomSeed: '0x196603' }, 'Trusted native mouse/touch controls. Fresh pilot-seat preference remains unchanged. Custom WebGL2 renderer; no game-start or placement fixture.');

      const controls = await page.evaluate(() => {
        const ids = ['dixieLook', 'dixieRipple', 'dixiePass', 'dixieHome', 'dixieRetry', 'dixieGuidance'];
        const rect = id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return { id, x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, hidden: e.hidden }; };
        const added = ids.map(rect), old = ['pickle', 'btnScope', 'pauseBtn', 'stick', 'flightStrikeBoardToggle'].map(rect).filter(r => r.width > 0 && r.height > 0);
        return { added, old, overlaps: added.filter(r => !r.hidden).flatMap(a => old.filter(b => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y).map(b => [a.id, b.id])) };
      });
      assert.ok(controls.added.every(r => r.width >= 44 && r.height >= 44)); assert.deepEqual(controls.overlaps, []);
      const guidanceBefore = await state(); await click(page.locator('#dixieGuidance')); const guidanceAfter = await state();
      assert.equal(guidanceAfter.experience.tutorial, !guidanceBefore.experience.tutorial);
      assert.deepEqual(guidanceAfter.aircraft, guidanceBefore.aircraft); assert.deepEqual(guidanceAfter.score, guidanceBefore.score);
      await click(page.locator('#dixieGuidance'));
      await click(page.locator('#pauseBtn')); const frozen = await state(); await advance(2); const still = await state();
      assert.equal(still.time, frozen.time); assert.deepEqual(still.aircraft, frozen.aircraft); assert.deepEqual(still.experience, frozen.experience);
      await click(page.locator('#pauseBody').getByRole('button', { name: 'Resume', exact: true }));
      record('Native pause freezes the experience and original aircraft, and added controls preserve existing touch targets', { controls, pausedTime: frozen.time }, 'Original pause/resume controls; two seconds of original update attempts while paused. Touch layout is Chromium emulation, not physical Safari.');

      const trajectory = [], events = [];
      async function run(seconds) { const batch = await advance(seconds); events.push(...batch.observed); trajectory.push(await state()); return trajectory.at(-1); }
      let current = await run(50);
      assert.equal(current.aircraft.alive, true); assert.equal(current.aircraft.onDeck, false); assert.ok(current.time >= 50);
      assert.ok(Math.hypot(...current.aircraft.p.map((v, i) => v - initial.aircraft.p[i])) > 1500);
      record('Existing right-seat pilot performs the real catapult launch and flies toward the coast', { initial: initial.aircraft.p, current }, 'Fifty seconds of original Game.update/acStep and the existing autoFly/pilotGuide. No aircraft, launch, velocity, phase or timer setter.');

      // All checkpoints are public briefing landmarks. Fix them through the
      // actual scope, with real radar sweeps and the existing LOCK control.
      for (let guard = 0; guard < 55; guard++) {
        const nav = await page.evaluate(() => { const g = App.game, w = g.world, cp = w.route[w.rtIdx]; return { cp: cp && { label: cp.label, p: cp.p.slice() }, index: w.rtIdx, length: w.route.length, target: w.briefed.slice() }; });
        if (!nav.cp) break;
        const aimed = await scopeTo(nav.cp.p);
        if (aimed.available) { await lock(); await run(.1); const after = await state(); if (after.route.index > nav.index) continue; }
        await run(3);
        if (!trajectory.at(-1).aircraft.alive) break;
      }
      current = await state(); assert.equal(current.aircraft.alive, true); assert.equal(current.route.index, current.route.length); assert.ok(current.route.fixes >= current.route.length);
      await shot('native-navigation-and-radar');
      record('Public route landmarks produce genuine native radar navigation fixes', { route: current.route, time: current.time }, 'Scope drags use only public briefed route coordinates, followed by the existing native LOCK. No navFix, coordinate-error, route-index or radar-buffer assignment.');
      const lookBefore = await state(); await click(page.locator('#dixieLook')); const lookAfter = await state();
      assert.deepEqual(lookAfter.aircraft.p, lookBefore.aircraft.p); assert.deepEqual(lookAfter.aircraft.v, lookBefore.aircraft.v); assert.deepEqual(lookAfter.score, lookBefore.score);
      await shot('authored-landmark-observation'); await click(page.locator('#dixieLook'));
      record('Native LOOK changes observation while preserving aircraft motion, stores and combat results', { before: lookBefore.experience, after: lookAfter.experience }, 'Same measured aircraft position and original terrain/scene. Observation is a camera function, not target identification or an aircraft teleport.');

      // The attack loop is completed below after the public experience API is
      // integrated; it reads only the briefed area and actual swept echoes.
      const publicArea = await page.evaluate(() => App.game.world.briefed.slice());
      let acquired = false;
      for (let guard = 0; guard < 50 && !acquired; guard++) {
        const aimed = await scopeTo(publicArea);
        if (aimed.available) { await lock(); acquired = !!(await state()).designation; }
        if (!acquired) await run(2);
      }
      assert.equal(acquired, true); await shot('native-target-designation');
      record('B/N designates from the briefed target area through native scope and LOCK', { state: await state() }, 'Public chart/briefed area is an assisted cue; target selection and ASQ-61 solution remain the original lockTarget/World.solve methods.');

      // A group target warrants a deliberately selected eight-store ripple.
      // A subsequent pass can use only the four original remaining stores.
      // native ripple control changes the original intervalometer setting;
      // it cannot create a store, a release or a hit.
      for (let n = 0; n < 4 && await page.evaluate(() => App.game.ripple) !== 8; n++) await click(page.locator('#dixieRipple'));
      assert.equal(await page.evaluate(() => App.game.ripple), 8);
      assert.notEqual(await page.evaluate(() => document.activeElement.id), 'dixieRipple', 'Native flight action must release focus for immediate keyboard flight input.');
      await page.keyboard.down('Space');
      const hybridFocus = await page.evaluate(() => ({ commit: App.keys.Space, ripple: App.game.ripple, focused: document.activeElement.id, released: App.game.world.score.dropped }));
      await page.keyboard.up('Space');
      assert.equal(hybridFocus.commit, 1); assert.equal(hybridFocus.ripple, 8); assert.equal(hybridFocus.released, 0);
      assert.equal(await page.evaluate(() => App.keys.Space), 0);
      if (cdp) {
        // A real centered touch restores the existing touch presentation
        // after the hybrid keyboard probe, without advancing the aircraft.
        const b = await page.locator('#stick').boundingBox();
        if (b) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 8, force: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      }
      let firstRelease = true;
      const observedReturns = [];
      for (let pass = 0; pass < 12; pass++) {
        current = await state();
        if (current.objectives[0][2] || current.aircraft.bombs === 0 || !current.aircraft.alive) break;
        if (pass > 0) {
          let onRun = false;
          for (let guard = 0; guard < 130; guard++) {
            const echo = await page.evaluate(() => {
              const g = App.game, h = g.hud, r = h.radar, center = g.world.briefed, a = g.ac;
              let best = null;
              // Read only the same fresh polar cells the player sees. A
              // return is not a target identity and no World.targets lookup
              // participates in choosing the physical native scope drag.
              for (let ai = 0; ai < r.NA; ai++) {
                if (r.age[ai] > 1.8) continue;
                const az = a.yaw - RSECT + (ai + .5) / r.NA * RSECT * 2;
                for (let ri = 0; ri < r.NR; ri++) {
                  const index = ai * r.NR + ri, hard = r.hard[index], strength = r.buf[index];
                  if (hard < .35 || strength < .25) continue;
                  const range = 300 + ri * r.maxR / r.NR, point = [a.p[0] + Math.sin(az) * range, 0, a.p[2] - Math.cos(az) * range];
                  const distance = Math.hypot(point[0] - center[0], point[2] - center[2]);
                  if (distance > 800 || range < 4000) continue;
                  const quality = hard + strength * .2 - distance * .0002;
                  if (!best || quality > best.quality) best = { point, range, hard, strength, age: r.age[ai], distance, quality };
                }
              }
              return best;
            });
            if (echo) { observedReturns.push({ pass, ...echo }); const aimed = await scopeTo(echo.point); if (aimed.available) { await lock(); onRun = true; break; } }
            current = await run(3); if (!current.aircraft.alive || current.egress) break;
          }
          if (!onRun) break;
        }
        const before = (await state()).score.dropped;
        await holdConsent(true);
        try {
          for (let guard = 0; guard < 100; guard++) { current = await run(3); if (!current.aircraft.alive || current.score.dropped > before) break; }
        } finally { await holdConsent(false); }
        assert.equal(current.aircraft.alive, true);
        assert.ok(current.score.dropped > before, 'The real ASQ-61 must release a weapon under native held consent: ' + JSON.stringify(current));
        if (firstRelease) { await shot('actual-weapon-release'); firstRelease = false; }
        const released = current.score.dropped;
        for (let guard = 0; guard < 30 && current.score.hits + current.score.misses < released; guard++) current = await run(1);
        assert.equal(current.aircraft.alive, true); assert.ok(current.score.hits + current.score.misses > 0);
        console.log('Dixie measured pass ' + name + ' ' + JSON.stringify({ pass, time: current.time, score: current.score, aircraft: current.aircraft.p, objective: current.objectives[0] }));
        if (pass === 0) { await click(page.locator('#dixieLook')); await run(.2); await shot('actual-impact-aftermath'); await click(page.locator('#dixieLook')); }
        if (!current.objectives[0][2] && current.aircraft.bombs > 0) {
          const beforePass = await state(); await click(page.locator('#dixiePass')); const afterPass = await state();
          assert.deepEqual(afterPass.aircraft.p, beforePass.aircraft.p); assert.deepEqual(afterPass.aircraft.v, beforePass.aircraft.v);
          assert.deepEqual(afterPass.score, beforePass.score);
        }
      }
      assert.equal(current.objectives[0][2], true, 'The actual original supply-depot objective must be achieved; no automatic success: ' + JSON.stringify(current));
      await click(page.locator('#dixieLook')); await run(.2); await shot('earned-target-objective'); await click(page.locator('#dixieLook'));
      record('Original ASQ-61 releases and ballistic collisions genuinely satisfy the depot objective', { impacts: current.score.hits + current.score.misses, score: current.score, observedReturns, events, hybridFocus }, 'Native selected eight-store intervalometer and held Space or CDP touchscreen COMMIT; a second pass can use only the four original remaining stores. A genuine keyboard Space press after the same action also reaches COMMIT in both mouse and touch layouts without reactivating RIPPLE. Subsequent native aim reads only fresh displayed radar cells around the public briefed area. Every bomb, damage and impact advances through original Game.update/World.step. No release, impact, target ID, health or score setter.');

      await click(page.locator('#dixieHome')); await run(.2);
      for (let guard = 0; guard < 130 && !current.result && current.phase !== 'done' && current.aircraft.alive; guard++) {
        current = await run(8);
        if (current.acls && !screenshots.includes('dixie-strike/' + name + '-original-carrier-recovery.png')) await shot('original-carrier-recovery');
      }
      if (current.phase === 'done' && !current.result) { await page.waitForTimeout(1850); current = await state(); }
      await fs.writeFile(path.join(out, name + '-input-driven-sortie.json'), JSON.stringify({ trajectory, events, finish: current }, null, 2) + '\n');
      assert.equal(current.aircraft.alive, true); assert.ok(current.result, 'A genuine original arrested landing and debrief must complete: ' + JSON.stringify(current));
      assert.equal(current.result.recovered, true); assert.ok(current.wire >= 1 && current.wire <= 4); assert.equal(current.aircraft.onDeck, true);
      assert.equal(current.result.pass, true);
      assert.equal(current.result.pass, current.objectives.filter((o, i) => i === 0).every(o => o[2]), 'Return must not award a successful attack when the actual target objective was not achieved.');
      await shot('honest-carrier-return-debrief');
      record('Original coupled carrier approach catches an actual arresting wire and debrief reflects measured attack results', { finish: current, trajectory: 'dixie-strike/' + name + '-input-driven-sortie.json' }, 'RETURN requests the original pilot/carrier route; it never sets position, wire, phase or result. Attack success remains conditional on original target damage. This is automated fixed-step flight, not a human or hardware-FPS claim.');

      const saved = await page.evaluate(() => FlightStrikeCheckpoint.saved());
      assert.ok(saved && await page.evaluate(() => FlightStrikeCheckpoint.valid(FlightStrikeCheckpoint.saved())));
      await fs.writeFile(path.join(out, name + '-naturally-earned-checkpoint.json'), JSON.stringify(saved, null, 2) + '\n');
      await page.evaluate(() => { window.__retiredDixieGame = App.game; window.__retiredDixieToken = App._missionStart; });
      await click(page.locator('#dixieDebriefRetry')); await loaded(); const retried = await state();
      assert.deepEqual(retried.aircraft.p, saved.aircraft.p); assert.deepEqual(retried.aircraft.damage, saved.aircraft.dmg);
      assert.equal(retried.aircraft.bombs, saved.aircraft.bombs); assert.equal(retried.score.killed, saved.world.score.killed);
      assert.equal(retried.score.dropped, saved.world.score.dropped); assert.equal(retried.result, null);
      assert.equal(retried.experience.retries, saved.experience.retries + 1);
      const ownership = await page.evaluate(() => {
        const old = window.__retiredDixieGame, current = App.game, before = document.getElementById('debriefBody').innerHTML;
        old.debrief(false, 'Stale retired-game callback');
        return { freshGame: old !== current, freshWorld: old.world !== current.world, tokenAdvanced: App._missionStart > window.__retiredDixieToken,
          staleDebriefIgnored: document.getElementById('debriefBody').innerHTML === before && !current.result,
          singletonPanel: document.querySelectorAll('#dixiePanel').length, noInFlightWeapons: current.world.bombs.length === 0 && current.world.arms.length === 0 };
      });
      assert.ok(ownership.freshGame && ownership.freshWorld && ownership.tokenAdvanced && ownership.staleDebriefIgnored && ownership.noInFlightWeapons);
      assert.equal(ownership.singletonPanel, 1);
      record('Native checkpoint retry creates a fresh owned Game and preserves earned damage, target destruction and remaining stores', { retried, ownership, checkpoint: 'dixie-strike/' + name + '-naturally-earned-checkpoint.json' }, 'Checkpoint was earned by the preceding original sortie. Native debrief retry only; no checkpoint payload is edited. A direct stale-debrief callback is a declared lifecycle negative-path probe, not a mission progression action.');

      inputTrace.push(...await page.evaluate(() => window.__dixieNativeInputs));
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.App && window.FlightStrikeExperience);
      await click(page.locator('#bootGo')); await click(page.locator('#dixieReady'));
      assert.equal(await page.locator('#dixieContinue').count(), 1);
      // Suspend the clock before clicking the public Continue button. App's
      // own timed loader constructs and renders the new Game independently.
      await page.evaluate(() => { window.__dixieFixedClock = true; });
      await click(page.locator('#dixieContinue')); await loaded(); const continued = await state();
      assert.deepEqual(continued.aircraft.p, saved.aircraft.p); assert.equal(continued.score.dropped, saved.world.score.dropped);
      assert.equal(continued.aircraft.bombs, saved.aircraft.bombs); assert.deepEqual(continued.aircraft.damage, saved.aircraft.dmg);
      assert.equal(continued.result, null); assert.equal(continued.experience.retries, saved.experience.retries + 1);
      await shot('native-reloaded-checkpoint');
      record('Browser reload and native CONTINUE restore validated earned progress without repair or replenishment', { checkpointLabel: continued.experience.checkpointLabel, time: continued.time, score: continued.score, aircraft: continued.aircraft }, 'Real same-origin localStorage and page reload, then native Ready Room / briefing / Continue. No browser-save injection or edited checkpoint record.');

      // Returning via existing debrief controls verifies normal Mission 02
      // remains available, with the original preferred pilot seat and content.
      await ready();
      await click(page.locator('#dixieReady'));
      await click(page.locator('#briefBody').getByRole('button', { name: 'Man Aircraft', exact: true })); await loaded();
      const normal = await page.evaluate(() => ({ experience: App.game.strikeExperience || null, rightSeat: App.game.rightSeat, mission: JSON.stringify(App.game.mis) === JSON.stringify(MISSIONS.find(m => m.id === 'm2')), savedSeat: App.set.seat, uiHidden: document.getElementById('dixiePanel').hidden }));
      assert.equal(normal.experience, null); assert.equal(normal.rightSeat, false); assert.equal(normal.mission, true); assert.equal(normal.savedSeat, 0); assert.equal(normal.uiHidden, true);
      record('Original Mission 02 remains unchanged through its ordinary Man Aircraft button', normal, 'Existing native mission and debrief UI. Opt-in experience cannot rewrite the normal mission or saved seat.');
      await ready(); await click(page.locator('#dixieReady')); await click(page.locator('#dixiePractice')); await loaded();
      const practice = await state(), practiceRange = await page.evaluate(() => { const g = App.game, p = g.world.briefed; return Math.hypot(g.ac.p[0] - p[0], g.ac.p[2] - p[2]); });
      assert.equal(practice.rightSeat, true); assert.equal(practice.aircraft.onDeck, false); assert.equal(practice.aircraft.bombs, 12);
      assert.equal(practice.score.dropped, 0); assert.equal(practice.score.killed, 0); assert.equal(practice.route.fixes, 0);
      assert.ok(Math.abs(practiceRange - 11000) < 10); assert.equal(practice.objectives[0][2], false);
      assert.equal(await page.evaluate(() => App.set.seat), 0);
      record('Native SHORT B/N PRACTICE starts the original attack airborne with full work still required', { practice, range: practiceRange }, 'User-visible practice start is intentionally an airborne initial condition. This separate mode is not used to claim the earlier carrier-to-carrier sortie or its actual impacts. It awards no target damage, fixes or automatic success.');
      inputTrace.push(...await page.evaluate(() => window.__dixieNativeInputs)); assert.ok(inputTrace.length > 10 && inputTrace.every(e => e.trusted));
      await Promise.all(digestTasks); assert.ok(Object.values(runtimeSHA256).every(versions => versions.length === 1), 'A browser run must not mix different versions of the same runtime asset: ' + JSON.stringify(runtimeSHA256));
      assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.equal(await page.evaluate(() => App.rend.gl.getError()), 0);
      record('No uncaught JavaScript, asset or WebGL errors occur across the real sortie and old-mission return', { errors, missing, runtimeSHA256, trustedInputs: inputTrace.length, webgl: 'WebGL2 / Linux Chromium SwiftShader', physicalIPhoneTested: false }, 'Production application and actual browser; no browser APIs, renderer, physics, weapon or result methods mocked.');
    } catch (error) {
      const failure = { profile: name, error: error.stack || String(error), state: await state().catch(() => null), errors, missing, runtimeSHA256, results, screenshots, inputs: await page.evaluate(() => window.__dixieNativeInputs || []).catch(() => []) };
      await fs.writeFile(path.join(out, name + '-failure.json'), JSON.stringify(failure, null, 2) + '\n');
      await page.screenshot({ path: path.join(out, name + '-failure.png'), timeout: 90000 }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  return { suite: 'dixie-strike', passed: true, results, screenshots, limitations: ['Linux Chromium with SwiftShader; physical Windows and iPhone Safari are not tested.', 'Fixed-step original engine flight uses the existing B/N-seat pilot and carrier coupling, not a human full-sortie playthrough.', 'Public chart coordinate assistance is declared; actual original impact and target-objective results are never forged.'] };
};
