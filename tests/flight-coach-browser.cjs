'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const crypto = require('node:crypto');
const {waitCompletePhotographs}=require('./helpers/complete-photo-fixture.cjs');

// Real application controls, flight engine and WebGL2. Fixed-step loops compress
// a short flight; no aircraft placement, physics replacement or invented impact
// records are used. Chromium mobile layout is not physical iPhone Safari.
module.exports = async function flightCoachBrowser(browser, target, evidenceDir) {
  const results = [], directory = path.join(evidenceDir, 'flight-coach');
  await fs.mkdir(directory, { recursive: true });
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ];
  const selectedProfile = process.env.INTRUDER_COACH_PROFILE || '';
  if (selectedProfile && !profiles.some(profile => profile.name === selectedProfile)) throw new Error('Unknown flight-coaching browser profile: ' + selectedProfile);
  for (const profile of profiles.filter(profile => !selectedProfile || profile.name === selectedProfile)) {
    const { name, ...options } = profile, context = await browser.newContext(options), errors = [], missing = [];
    await context.addInitScript(() => {
      if(location.protocol==='about:')return;
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, assist: 1, sound: 0, voices: 0, invert: 0, sens: 1, mouse: 0, seat: 0 }));
      localStorage.setItem('a6_sawkeys', '1'); localStorage.removeItem('a6_flightCoach22');
    });
    const page = await context.newPage(), cdp = profile.hasTouch ? await context.newCDPSession(page) : null;
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) missing.push({ url: response.url(), status: response.status() }); });
    const record = (title, observed, fixture) => { results.push({ profile: name, name: title, passed: true, observed, fixture }); console.log('PASS ' + name + ' ' + title); };
    const shot = async title => { const file = path.join(directory, name + '-' + title + '.png'); await page.screenshot({ path: file, timeout: 90000 }); return file; };
    const ready = async () => {
      await page.click('#pauseBtn'); await page.locator('#pauseBody').getByRole('button', { name: 'Ready Room', exact: true }).click();
      await page.waitForFunction(() => App.screen === 'ready' && !App.game);
      assert.equal(await page.locator('#flightCoach').isVisible(), false);
      await page.click('#tabs [data-tab="ops"]');
    };
    const loaded = async id => {
      await page.waitForFunction(expected => document.getElementById('graphicError') || App.game?.mis.id === expected && App.game.st && document.getElementById('loader').style.display === 'none', id, { timeout: 90000 });
      assert.equal(await page.locator('#graphicError').count(), 0);
      await waitCompletePhotographs(page);
      await page.locator('#teach').dispatchEvent('click');
      if (await page.locator('#legend.on').count()) await page.keyboard.press('h');
    };
    const touch = async (selector, held) => {
      const box = await page.locator(selector).boundingBox(); assert.ok(box, selector + ' must be reachable on touch');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
      if (!held) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const launch = async () => {
      if (cdp) { await touch('#pickle', true); assert.equal(await page.evaluate(() => App.gctl.commit), 1); }
      else { await page.keyboard.down('Shift'); await page.keyboard.down('Space'); assert.equal(await page.evaluate(() => App.keys.Space), 1); }
      const observed = await page.evaluate(() => {
        const g = App.game; g.paused = false;
        for (let n = 0; n < 240; n++) g.update(1 / 60);
        // Hold the actual aircraft at this measured time while the test sends
        // its next native input; otherwise software-renderer wall-clock drift
        // can carry it through the existing 260 KIAS gear interlock.
        g.paused = true;
        g.render(1 / 60); g.syncControls();
        return { time: g.t, onDeck: g.ac.onDeck, alive: g.ac.alive, phase: g.phase, position: g.ac.p.slice(), velocity: g.ac.v.slice(),
          finite: [...g.ac.p, ...g.ac.v, g.ac.yaw, g.ac.pitch, g.ac.roll].every(Number.isFinite), coachEnabled: FlightCoach.enabled(g),
          modelData: FlightCoach.snapshot(g), metrics: FlightCoach.metrics(g), gpuError: g.rend.gl.getError() };
      });
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else { await page.keyboard.up('Space'); await page.keyboard.up('Shift'); }
      assert.equal(observed.onDeck, false); assert.equal(observed.alive, true); assert.equal(observed.phase, 'airborne');
      assert.equal(observed.finite, true); assert.equal(observed.coachEnabled, true); assert.equal(observed.gpuError, 0); assert.ok(observed.time >= 4);
      await page.locator('#teach').dispatchEvent('click');
      return observed;
    };
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
      const sourceSha256 = crypto.createHash('sha256').update(await response.text()).digest('hex');
      await page.waitForFunction(() => window.App && App.screen === 'boot'); await page.click('#bootGo');
      assert.equal(await page.locator('#readyBody .mcard').count(), 12);
      await page.locator('#readyBody .mcard').first().click(); await page.getByRole('button', { name: 'Man Aircraft', exact: true }).click(); await loaded('m1');
      const initial = await page.evaluate(() => ({ enabled: FlightCoach.enabled(App.game), pressed: document.getElementById('flightCoachToggle').getAttribute('aria-pressed'),
        version: App.rend.gl.getParameter(App.rend.gl.VERSION), panelHidden: document.getElementById('flightCoachCue').hidden, quality: App.rend.quality }));
      assert.equal(initial.enabled, false); assert.equal(initial.pressed, 'false'); assert.equal(initial.panelHidden, true); assert.match(initial.version, /^WebGL 2/);
      record('Existing mission UI starts with guidance off and real WebGL2', { sourceSha256, ...initial }, 'Fresh browser storage; existing Mission 1 briefing and Man Aircraft controls. Low quality for software-renderer test throughput, not a physical-device performance measurement.');

      const toggleBox = await page.locator('#flightCoachToggle').boundingBox(); assert.ok(toggleBox.height >= 44 && toggleBox.width >= 44);
      if (cdp) await touch('#flightCoachToggle', false); else await page.click('#flightCoachToggle');
      await page.waitForFunction(() => FlightCoach.enabled(App.game));
      await page.waitForFunction(() => document.getElementById('flightCoachCue').hidden === false);
      const enabledToggleBox = await page.locator('#flightCoachToggle').boundingBox();
      assert.ok(Math.abs(enabledToggleBox.x - toggleBox.x) < .1 && Math.abs(enabledToggleBox.y - toggleBox.y) < .1, 'Showing a cue must not move the toggle between touch gestures');
      assert.equal(await page.evaluate(() => Store.get('flightCoach22', null)), true);
      assert.notEqual(await page.evaluate(() => document.activeElement.id), 'flightCoachToggle');
      if (cdp) await touch('#flightCoachToggle', false); else await page.click('#flightCoachToggle');
      await page.waitForFunction(() => !FlightCoach.enabled(App.game)); assert.equal(await page.evaluate(() => Store.get('flightCoach22', null)), false);
      record('Native guidance toggle is stable, reachable, persists choice and releases flight keyboard focus', { width: toggleBox.width, height: toggleBox.height, enabledX: enabledToggleBox.x, disabledX: toggleBox.x, persistedOff: true }, cdp ? 'Actual CDP touchscreen events on the DOM toggle; cue appearance cannot shift the target.' : 'Native mouse clicks on the DOM toggle; cue appearance cannot shift the target.');
      await ready(); record('Returning to Ready Room hides guidance and retains its off preference', { hidden: true, saved: await page.evaluate(() => Store.get('flightCoach22')) }, 'Existing pause and Ready Room buttons.');

      await page.locator('[data-flight-practice="m1"]').click(); await loaded('m1');
      await page.waitForFunction(() => FlightCoach.enabled(App.game) && document.getElementById('flightCoachCue').hidden === false);
      const practice = await page.evaluate(() => {
        const g = App.game, original = MISSIONS.find(m => m.id === 'm1'), copy = { ...g.mis }; delete copy.coachPractice;
        return { missionUnchanged: JSON.stringify(copy) === JSON.stringify(original), originalId: g.mis.id, enabled: FlightCoach.enabled(g),
          defaultChoice: Store.get('flightCoach22'), prompt: FlightCoach.cue(g), uiCue: document.getElementById('flightCoach').dataset.cue };
      });
      assert.equal(practice.missionUnchanged, true); assert.equal(practice.enabled, true); assert.equal(practice.defaultChoice, false);
      assert.ok(['launch-ready', 'launch-power'].includes(practice.prompt.id)); assert.equal(practice.uiCue, practice.prompt.id);
      record('Carrier practice preserves Mission 1 and enables only this flight', practice, 'Actual Ready Room practice button; native teaching card folded with its existing click handler.');
      const unchanged = await page.evaluate(() => {
        const g = App.game, capture = () => JSON.stringify({ ac: g.ac, keys: App.keys, controls: App.gctl, score: g.world.score, nav: g.world.nav, mission: g.mis });
        const before = capture(); FlightCoach.tick(g, .1); return { unchanged: capture() === before, model: FlightCoach.snapshot(g), ui: document.getElementById('flightCoachCue').textContent };
      });
      assert.equal(unchanged.unchanged, true); assert.match(unchanged.ui, /authored|Authored/);
      record('Guidance reads actual aircraft fields without changing controls, mission or simulation state', unchanged, 'Synchronous pre/post comparison around the real optional coach tick; the engine remains original.');
      await shot('carrier-catapult-guidance');
      const airborne = await launch(); record('Held native launch input flies the preserved catapult with guidance enabled', airborne, (cdp ? 'Actual touchscreen COMMIT held.' : 'Actual keyboard Shift and Space held.') + ' Four seconds compressed through 240 real fixed-step Game.update calls; no aircraft placement or physics mocks.');
      const gearBefore = await page.evaluate(() => ({ gear: App.game.ac.gear, knots: App.game.ac.ias * 1.943844492 }));
      if (cdp) await touch('#btnGear', false); else await page.keyboard.press('g');
      const gearAfter = await page.evaluate(() => ({ gear: App.game.ac.gear, hook: App.game.ac.hook, enabled: FlightCoach.enabled(App.game), error: App.rend.gl.getError(), radio: document.getElementById('radio').textContent }));
      const extensionBlocked = !gearBefore.gear && gearBefore.knots > 260;
      const expectedGear = extensionBlocked ? false : !gearBefore.gear;
      assert.equal(gearAfter.gear, expectedGear); assert.equal(gearAfter.hook, expectedGear); assert.equal(gearAfter.enabled, true); assert.equal(gearAfter.error, 0);
      if (extensionBlocked) assert.match(gearAfter.radio, /Too fast for the gear/);
      let slowdown = null, allowedGear = gearAfter;
      if (extensionBlocked) {
        if (cdp) { await touch('#thrDn', true); assert.equal(await page.evaluate(() => App.gctl.thrDn), 1); }
        else { await page.keyboard.down('Control'); assert.equal(await page.evaluate(() => App.keys.ControlLeft), 1); }
        slowdown = await page.evaluate(() => {
          const g = App.game; g.paused = false; let steps = 0;
          while (g.ac.ias * 1.943844492 > 255 && g.ac.alive && steps++ < 1200) g.update(1 / 60);
          g.paused = true; g.render(1 / 60); g.syncControls();
          return { steps, alive: g.ac.alive, phase: g.phase, knots: g.ac.ias * 1.943844492, throttle: g.ac.thr, position: g.ac.p.slice() };
        });
        if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.keyboard.up('Control');
        assert.equal(slowdown.alive, true); assert.equal(slowdown.phase, 'airborne'); assert.ok(slowdown.knots <= 255);
        if (cdp) await touch('#btnGear', false); else await page.keyboard.press('g');
        allowedGear = await page.evaluate(() => ({ gear: App.game.ac.gear, hook: App.game.ac.hook, enabled: FlightCoach.enabled(App.game), error: App.rend.gl.getError() }));
        assert.equal(allowedGear.gear, !gearBefore.gear); assert.equal(allowedGear.hook, !gearBefore.gear);
        assert.equal(allowedGear.enabled, true); assert.equal(allowedGear.error, 0);
      }
      record('Existing gear control permits retraction and limits high-speed extension', { before: gearBefore, extensionBlocked, interlockResponse: gearAfter, slowdown, allowedResponse: allowedGear }, (cdp ? 'Actual touchscreen GEAR and held THR− controls.' : 'Actual G and held Control keyboard events.') + ' Retraction remains available above 260 KIAS. If an extension is actually blocked, native throttle-down input advances the original engine below 255 KIAS before retrying; no speed, velocity or position is assigned.');
      await page.evaluate(() => { App.game.paused = false; FlightCoach.tick(App.game, 0); App.game.render(1 / 60); });
      await shot('carrier-airborne-guidance');

      const debrief = await page.evaluate(() => {
        const g = App.game, fuel = Math.round(g.ac.fuel), observed = FlightCoach.metrics(g); g.debrief(false, 'Short flight-coaching browser check ended before recovery.');
        const before = JSON.stringify(g.result), review = FlightCoach.report(g, false); return { fuel, observed, review, gradeUnchanged: before === JSON.stringify(g.result),
          realReport: !!document.querySelector('[data-flight-coach-report]'), body: document.getElementById('debriefBody').textContent };
      });
      assert.equal(debrief.realReport, true); assert.equal(debrief.gradeUnchanged, true); assert.ok(debrief.review.observedSeconds >= 4);
      assert.ok(debrief.review.evidence.includes('Fuel at this debrief: ' + debrief.fuel + ' lb.')); assert.match(debrief.body, /Short flight-coaching browser check ended before recovery/);
      record('Actual short-flight debrief adds measured guidance without changing the existing grade', debrief, 'Real Game.debrief after the input-driven short flight. This intentionally ends an incomplete practice flight; no trap or full mission completion is claimed, and no impact/approach measurements are fabricated.');
      await shot('measured-practice-debrief');
      await page.locator('#debriefBody').getByRole('button', { name: 'Ready Room', exact: true }).click(); await page.waitForFunction(() => App.screen === 'ready' && !App.game);
      assert.equal(await page.locator('#flightCoach').isVisible(), false);

      await page.click('#tabs [data-tab="set"]'); await page.getByRole('button', { name: 'Right — B/N', exact: true }).click(); await page.click('#tabs [data-tab="ops"]');
      await page.locator('[data-flight-practice="m2"]').click(); await loaded('m2');
      const bnPractice = await page.evaluate(() => {
        const g = App.game, source = MISSIONS.find(m => m.id === 'm2'), copy = { ...g.mis }; delete copy.coachPractice;
        return { sameMission: JSON.stringify(copy) === JSON.stringify(source), id: g.mis.id, rightSeat: g.rightSeat, threats: g.mis.threats,
          coach: FlightCoach.enabled(g), prompt: FlightCoach.cue(g), radarScope: g.hud.scope };
      });
      assert.equal(bnPractice.sameMission, true); assert.equal(bnPractice.rightSeat, true); assert.equal(bnPractice.coach, true); assert.equal(bnPractice.radarScope, true);
      assert.deepEqual(bnPractice.threats, { aaaLight: 5, aaaHeavy: 0, sam: 0 }); assert.equal(bnPractice.prompt.seat, 'BN');
      record('DIANE practice retains Mission 2 and its light AAA while respecting the chosen BN seat', bnPractice, 'Existing Settings seat button and actual Ready Room DIANE practice entry; no threat or mission-content changes.');
      // The existing BN pilot launches on his own clock. Advance that unchanged
      // engine, then allow guidance to settle without injecting player controls.
      const bnLaunch = await page.evaluate(() => {
        const g = App.game; g.paused = false; for (let n = 0; n < 480; n++) g.update(1 / 60);
        g.paused = true; return { alive: g.ac.alive, onDeck: g.ac.onDeck, gear: g.ac.gear, knots: g.ac.ias * 1.943844492 };
      });
      assert.equal(bnLaunch.alive, true); assert.equal(bnLaunch.onDeck, false);
      const cleanedUp = bnLaunch.gear && bnLaunch.knots <= 260;
      if (cleanedUp) {
        if (cdp) await touch('#btnGear', false); else await page.keyboard.press('g');
      }
      const navigation = await page.evaluate(() => {
        const g = App.game; g.paused = false; for (let n = 0; n < 180; n++) g.update(1 / 60);
        g.render(1 / 60); g.syncControls();
        const model = FlightCoach.snapshot(g), next = g.world.route[g.world.rtIdx], nativeError = Math.hypot(g.world.nav.ex, g.world.nav.ez),
          nativeRange = Math.hypot(next.p[0] - g.ac.p[0], next.p[2] - g.ac.p[2]) / 1852;
        return { alive: g.ac.alive, onDeck: g.ac.onDeck, phase: g.phase, time: g.t, model, nativeError, nativeRange,
          prompt: FlightCoach.cue(g), uiCue: document.getElementById('flightCoach').dataset.cue, gpuError: g.rend.gl.getError() };
      });
      assert.equal(navigation.alive, true); assert.equal(navigation.onDeck, false); assert.equal(navigation.phase, 'airborne');
      assert.ok(Math.abs(navigation.model.navErrorM - navigation.nativeError) < .000001); assert.ok(Math.abs(navigation.model.checkpoint.rangeNM - navigation.nativeRange) < .000001);
      assert.ok(['navigation-fix', 'clean-up', 'gear-speed-limit', 'terrain-low'].includes(navigation.prompt.id));
      assert.equal(navigation.prompt.facts.navErrorM, navigation.nativeError); assert.equal(navigation.prompt.seat, 'BN'); assert.equal(navigation.gpuError, 0);
      await page.locator('#teach').dispatchEvent('click'); await shot('bn-diane-navigation');
      record('BN coaching uses actual checkpoint geometry and navigation drift after existing pilot launch', navigation, 'Eleven compressed seconds through the real BN pilot/flight engine. ' + (cleanedUp ? 'Existing native GEAR control used below its speed limit.' : 'Existing GEAR speed limit respected; higher-priority safety/configuration guidance may precede the navigation-fix cue.') + ' No artificial position, navigation error or weapon changes.');
      await ready();
      assert.deepEqual(errors, []); assert.deepEqual(missing, []);
      record('No uncaught JavaScript errors or missing runtime assets during flight-guidance regression', { errors, missing }, 'Both practice entries, native inputs, real WebGL render, settings, debrief and Ready Room transitions.');
      await fs.writeFile(path.join(directory, name + '-results.json'), JSON.stringify({ profile: name, results: results.filter(result => result.profile === name), passed: true, sourceSha256, recordedAt: new Date().toISOString() }, null, 2) + '\n');
    } catch (error) {
      await shot('FAIL').catch(() => {}); throw error;
    } finally { await context.close(); }
  }
  return { suite: 'm22-flight', results, total: results.length, passed: true, testedProfiles: [...new Set(results.map(result => result.profile))],
    scope: 'Real Chromium WebGL2 ' + (selectedProfile || 'desktop and emulated iPhone touch layouts') + '. Original input-driven catapult flight, existing BN pilot launch, navigation data, opt-in UI and measured short-flight debrief. No physical Windows/iPhone Safari test, carrier trap or complete combat mission claim.',
    actualIPhoneSafariTested: false, physicalWindowsTested: false, fullMissionCompletionTested: false };
};
