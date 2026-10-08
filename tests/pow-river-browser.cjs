'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

// Fixture-assisted actual-browser suite. The initial stage is explicitly the
// river; this does not establish completion of the cell/street chapters or a
// human/iPhone playthrough. Game methods, POW tick, AI, swept collisions,
// interactions, rendering, persistence, and finish remain their real methods.
// The caller owns browser launch and graphics configuration.
module.exports = async function powRiverBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'pow-river');
  await fs.mkdir(out, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 844, height: 390 },
    hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [], results = [], screenshots = [];
  let info, failure;
  page.on('pageerror', error => errors.push(error.message));
  const check = (name, actual, predicate) => {
    const passed = !!predicate(actual);
    results.push({ name, passed, actual });
    assert.ok(passed, `${name}: ${JSON.stringify(actual)}`);
  };
  async function screenshot(name) {
    const graphics = await page.evaluate(() => {
      const G = App.game, gl = G.rend.gl;
      const before = gl.getError();
      G.render(1 / 60); POW.updateUI(G);
      return { before, after: gl.getError(), width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight, phase: G.pow.river.phase, mode: G.pow.river.mode,
        position: G.evade.p.slice(), terrain: G.pow.base.slice(),
        meshes: ['powWater', 'powMud', 'powRiverSkiff', 'powRiverNaval'].map(name => !!G.rend.meshes[name]) };
    });
    check(`${name} real WebGL render`, graphics, g => g.before === 0 && g.after === 0
      && g.width > 0 && g.height > 0 && g.meshes.every(Boolean));
    const file = path.join(out, `${name}.png`);
    await page.screenshot({ path: file }); screenshots.push(file);
  }
  try {
    await page.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0,
        mouse: 0, seat: 0, assist: 1, sens: 1 }));
      localStorage.setItem('a6_sawkeys', '1');
    });
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.App && window.POW && POW.River && POW.AI);
    await page.evaluate(() => App.start(MISSIONS.find(mission => mission.escape)));
    await page.waitForFunction(() => App.game?.st && document.getElementById('loader').style.display === 'none',
      null, { timeout: 90000 });
    await page.waitForFunction(() => FIGIMG && ['nva', 'farmer', 'vegetation']
      .every(name => App.rend.textures['photo_' + name]), null, { timeout: 30000 });
    await page.evaluate(() => {
      App.screen = 'fixture'; // Stop automatic frames; invoke the actual methods below.
      App.game.paused = false;
      document.getElementById('teach').classList.remove('on');
      document.getElementById('teachPeek').classList.remove('on');
      document.getElementById('legend').classList.remove('on');
      if (document.activeElement?.blur) document.activeElement.blur();
      const G = App.game;
      const helper = window.__powRiverTest = {
        reset(stats) {
          G.pow = null;
          App.keys = {}; Object.assign(App.gctl, { pitch: 0, roll: 0, run: 0, crouch: 0, climb: 0, dive: 0 });
          POW.begin(G, 'river');
          if (stats) Object.assign(G.pow.stats, stats);
          G.syncControls();
          return helper.snapshot();
        },
        controls(keys, pitch = 0) {
          App.keys = keys || {}; Object.assign(App.gctl, { pitch, roll: 0, run: 0, crouch: 0, climb: 0, dive: 0 });
        },
        tick(seconds) {
          let remaining = seconds;
          while (remaining > .000001 && !G.pow.complete) {
            const dt = Math.min(.1, remaining); G.t += dt; G.stepEvade(dt); remaining -= dt;
          }
          return helper.snapshot();
        },
        snapshot() {
          const s = G.pow, r = s.river, e = G.evade;
          return { stage: s.stage, phase: r?.phase, mode: r?.mode, position: e.p.slice(),
            base: s.base.slice(), elapsed: r?.elapsed, hours: r?.hours, day: s.day,
            distance: r?.logicalDistance, offset: r?.streamOffset, segment: r?.segment,
            breath: r?.breath, submerged: r?.submerged, cooldown: r?.surfacingCooldown,
            cover: r?.cover, visibility: r?.visibility, resting: r?.resting,
            stats: { ...s.stats }, complete: !!s.complete, outcome: s.outcome || s.result || null,
            flags: { ...s.flags }, observers: e.searchers.map(a => ({ id: a.id, kind: a.kind,
              armed: a.armed, state: a.state, suspect: a.sus, visible: a.visible,
              position: a.p.slice(), grab: a.grab, reported: a.reported })) };
        }
      };
      helper.reset();
    });
    info = await page.evaluate(() => ({ mission: App.game.mis.title, initialFixtureStage: 'river',
      webgl: App.rend.gl.getParameter(App.rend.gl.VERSION),
      renderer: App.rend.gl.getParameter(App.rend.gl.RENDERER), quality: App.rend.quality }));
    assert.match(info.webgl, /^WebGL 2/);

    const current = await page.evaluate(() => {
      const h = __powRiverTest, before = h.reset(), after = h.tick(2);
      return { before, after, actualDownstream: after.position[2] - before.position[2],
        expectedRoute: (after.position[2] - before.position[2]) * POW.River.constants.distanceScale };
    });
    check('idle current uses physical swept movement and 100:1 route compression', current,
      a => a.actualDownstream > 1.4 && Math.abs(a.after.distance - a.expectedRoute) < 1e-6
        && a.after.stage === 'river' && !a.after.complete);
    await screenshot('river-swim');

    const parity = await page.evaluate(() => {
      const h = __powRiverTest;
      h.reset(); h.controls({ KeyW: 1 }); const keyboard = h.tick(1);
      h.reset(); h.controls({}, 1); const touch = h.tick(1);
      h.reset(); h.controls({ KeyW: 1, KeyD: 1 }); const turn = h.tick(.5);
      return { keyboard, touch, turn, heading: App.game.evade.hdg };
    });
    check('keyboard and touch swim parity with actual core input', parity,
      a => a.keyboard.position.every((p, i) => Math.abs(p - a.touch.position[i]) < 1e-6)
        && Math.abs(a.keyboard.distance - a.touch.distance) < 1e-6 && Math.abs(a.heading - Math.PI) > .5);

    const breath = await page.evaluate(() => {
      const h = __powRiverTest; h.reset(); h.controls({ Space: 1 });
      const diving = h.tick(.5);
      let frames = 0;
      while (App.game.pow.river.surfacingCooldown <= 0 && frames++ < 200) h.tick(.1);
      const surfaced = h.snapshot(), recovering = h.tick(1);
      h.controls({}); const recovered = h.tick(10);
      return { diving, surfaced, recovering, recovered, frames };
    });
    check('actual dive consumes air, automatically surfaces, and recovers while input stays held', breath,
      a => a.diving.submerged && a.diving.breath < 100 && a.diving.cover > .98
        && a.frames < 200 && !a.surfaced.submerged && a.surfaced.cooldown > 5
        && a.recovering.breath > a.surfaced.breath && !a.recovering.submerged
        && a.recovered.breath > 99 && !a.recovered.complete);

    const hiding = await page.evaluate(() => {
      const h = __powRiverTest, G = App.game;
      h.reset({ physical: 65, fatigue: 35 });
      h.controls({ KeyF: 1 }); h.tick(.3); h.controls({}); h.tick(.1); // Float -> swim.
      const shelter = G.pow.objects.find(o => o.id === 'river-hide-1-2');
      let frames = 0;
      // Cross the flow first. A diagonal pursuit of a bank marker can let the
      // current carry a swimmer past it before reaching dry footing.
      G.evade.hdg = Math.PI / 2; h.controls({ KeyW: 1 });
      while (G.evade.p[0] < shelter.p[0] - .3 && frames++ < 500) h.tick(.1);
      while (Math.hypot(G.evade.p[0] - shelter.p[0], G.evade.p[2] - shelter.p[2]) > 2 && frames++ < 800) {
        G.evade.hdg = Math.atan2(shelter.p[0] - G.evade.p[0], -(shelter.p[2] - G.evade.p[2]));
        h.controls({ KeyW: 1 }); h.tick(.1);
      }
      if (frames >= 800) throw new Error('Could not physically swim/walk to a bank shelter');
      h.controls({ KeyF: 1 }); h.tick(2.2); h.controls({}); h.tick(.1);
      return { beforeRest: h.snapshot(), shelter: shelter.p.slice(), frames };
    });
    check('manual swimming reaches a real bank shelter and hold-F conceals the player', hiding,
      a => a.beforeRest.mode === 'hidden' && a.beforeRest.resting
        && Math.hypot(a.beforeRest.position[0] - a.shelter[0], a.beforeRest.position[2] - a.shelter[2]) < .1);
    await screenshot('river-bank-hidden');
    // Run multi-day recovery in bounded browser evaluations; AI keeps running.
    let rest;
    for (let chunk = 0; chunk < 9; chunk++) rest = await page.evaluate(() => __powRiverTest.tick(20));
    check('bank rest recovers health and fatigue over days without a clock-forced capture',
      { before: hiding.beforeRest, after: rest }, a => a.after.stage === 'river' && a.after.resting
        && a.after.day > a.before.day && a.after.stats.physical > a.before.stats.physical + 20
        && a.after.stats.fatigue < a.before.stats.fatigue && !a.after.complete);

    const perception = await page.evaluate(() => {
      const h = __powRiverTest, G = App.game;
      // Explicit perception fixture: one real civilian on the bank, looking
      // at a stationary player three metres away. No capture method is mocked.
      h.reset(); const s = G.pow, r = s.river, x = s.base[0] + 94, z = s.base[2] + 24;
      G.evade.p = [x + 18, r.waterY + .35, z]; s.p = G.evade.p;
      r.hours = 12; r.mode = 'bank';
      const worker = POW.AI.makeActor({ id: 'river-civilian-perception-fixture', kind: 'farmer',
        p: [x + 21, r.waterY + .35, z], face: -Math.PI / 2,
        route: [[x + 21, r.waterY + .35, z]], dwell: 20 });
      G.evade.searchers = [worker]; s.actors = G.evade.searchers;
      h.controls({}); const after = h.tick(12);
      return { after, worker: { armed: worker.armed, suspect: worker.sus, seen: worker.seen,
        state: worker.state, reported: worker.reported, observed: worker.observedPlayer, grab: worker.grab } };
    });
    check('a nearby bank civilian actually perceives and reacts without directly capturing', perception,
      a => !a.worker.armed && a.worker.observed && a.worker.seen
        && ['flee', 'observe'].includes(a.worker.state) && a.worker.grab === 0
        && a.after.stage === 'river' && !a.after.complete);

    await page.evaluate(() => {
      const h = __powRiverTest; h.reset();
      h.journey = { part: 'float', ticks: 0, stageStarted: 0, deltaElapsed: null, captures: [], maxGap: 0 };
      h.journeyChunk = function(seconds) {
        const G = App.game, j = h.journey;
        const gap = p => Math.hypot(G.evade.p[0] - p[0], G.evade.p[2] - p[2]);
        const turnTo = p => { G.evade.hdg = Math.atan2(p[0] - G.evade.p[0], -(p[2] - G.evade.p[2])); };
        const part = name => { j.part = name; j.stageStarted = G.pow.river.elapsed; };
        let capture = null;
        for (let frame = 0; frame < Math.round(seconds * 10) && !G.pow.complete; frame++) {
          const s = G.pow, r = s.river, e = G.evade, x = s.base[0] + 94;
          if (s.stage !== 'river') throw new Error(`Journey interrupted by real AI: stage=${s.stage}`);
          if (r.elapsed - j.stageStarted > 160 && j.part !== 'float')
            throw new Error(`Journey stalled in ${j.part}: p=${e.p}, distance=${r.logicalDistance}`);
          if (j.part === 'float') {
            if (r.phase === 'delta') { j.deltaElapsed = r.elapsed; part('swimToggle'); capture = 'river-delta'; }
            else if (Math.abs(e.p[0] - x) > 1.5) {
              e.hdg = e.p[0] < x ? Math.PI / 2 : Math.PI * 1.5; h.controls({ KeyW: 1 });
            } else { e.hdg = Math.PI; h.controls({}); }
          }
          if (j.part === 'swimToggle') {
            h.controls({ KeyF: 1 });
            if (r.mode === 'swim') { h.controls({}); part('toBoat'); }
          } else if (j.part === 'toBoat') {
            if (gap(r.boat.p) <= 3.2) { part('boardHold'); h.controls({ KeyF: 1 }); }
            else { turnTo(r.boat.p); h.controls({ KeyW: 1 }); }
          } else if (j.part === 'boardHold') {
            h.controls({ KeyF: 1 });
            if (r.boatOwned) { h.controls({}); part('centerBoat'); capture = 'river-boat'; }
          } else if (j.part === 'centerBoat') {
            e.hdg = Math.PI * 1.5; h.controls({ KeyW: 1 });
            if (e.p[0] <= x + 1) part('paddle');
          } else if (j.part === 'paddle') {
            const lateral = Math.max(-1.3, Math.min(1.3, (x - e.p[0]) * .8));
            e.hdg = Math.atan2(lateral, -3); h.controls({ KeyW: 1 });
            if (r.phase === 'gulf') { part('offshoreApproach'); capture = 'river-offshore'; }
          } else if (j.part === 'offshoreApproach') {
            turnTo(r.recoveryPoint); h.controls({ KeyW: 1 });
            if (gap(r.recoveryPoint) <= 11.5) part('signalBrake');
          } else if (j.part === 'signalBrake') {
            h.controls({ KeyS: 1 });
            if (r.boat.speed <= .15) { h.controls({}); part('signalHold'); }
          } else if (j.part === 'signalHold') {
            h.controls({ KeyF: 1 });
            if (r.signaling) { h.controls({}); part('acknowledge'); }
          } else if (j.part === 'acknowledge') {
            h.controls({}); if (r.ship.acknowledged) part('recoveryApproach');
          } else if (j.part === 'recoveryApproach') {
            turnTo(r.recoveryPoint); h.controls({}, r.boat.speed < .45 ? .25 : 0);
            if (gap(r.recoveryPoint) <= 4.5) part('recoveryBrake');
          } else if (j.part === 'recoveryBrake') {
            h.controls({ KeyS: 1 });
            if (r.boat.speed <= .1) { h.controls({}); part('recoverySignal'); }
          } else if (j.part === 'recoverySignal') {
            h.controls({ KeyF: 1 });
            if (r.signaling) { h.controls({}); part('recover'); }
          } else if (j.part === 'recover') h.controls({});
          h.tick(.1); j.ticks++;
          if (capture) { j.captures.push(capture); break; }
        }
        if (G.pow.complete) j.part = 'done';
        return { ...h.snapshot(), part: j.part, capture, deltaElapsed: j.deltaElapsed,
          ticks: j.ticks, boatOwned: G.pow.river.boatOwned,
          signalAcknowledged: G.pow.river.ship?.acknowledged,
          recoveryGap: G.pow.river.recoveryPoint ? gap(G.pow.river.recoveryPoint) : null };
      };
    });
    let journey;
    for (let chunk = 0; chunk < 70; chunk++) {
      journey = await page.evaluate(() => __powRiverTest.journeyChunk(20));
      if (journey.capture) await screenshot(journey.capture);
      if (journey.complete) break;
      assert.ok(journey.elapsed < 1200, `journey exceeded 20 simulated minutes: ${JSON.stringify(journey)}`);
    }
    check('uninterrupted real-core river journey physically reaches skiff, Gulf contact, and fictional recovery', journey,
      a => a.complete && a.part === 'done' && a.deltaElapsed >= 600 && a.deltaElapsed <= 1000
        && a.elapsed < 1200 && a.boatOwned && a.signalAcknowledged && a.recoveryGap <= 5.2
        && a.flags.fictionalRescue && a.outcome?.id === 'pow-fictional-river-rescue'
        && a.outcome.historical === false && a.outcome.rescued === true && a.segment >= 6);
    await screenshot('river-fictional-recovery');
    const once = await page.evaluate(() => {
      const before = { elapsed: App.game.pow.river.elapsed, log: Store.get('pow_log', []).length,
        result: JSON.stringify(App.game.pow.outcome || App.game.pow.result) };
      __powRiverTest.tick(5); POW.River.step(App.game, .25);
      return { before, after: { elapsed: App.game.pow.river.elapsed,
        log: Store.get('pow_log', []).length, result: JSON.stringify(App.game.pow.outcome || App.game.pow.result) },
      endVisible: !POW.ui.end.hidden, text: POW.ui.end.querySelector('[data-result]').textContent };
    });
    check('real completion persists once and presents an explicitly fictional result', once,
      a => JSON.stringify(a.before) === JSON.stringify(a.after) && a.endVisible
        && /FICTIONAL ALTERNATE HISTORY/.test(a.text));
    assert.equal(errors.length, 0, `browser JavaScript errors: ${errors.join('; ')}`);
  } catch (error) { failure = error; }
  finally {
    const report = { scope: 'Fixture-assisted real Game/POW simulation and custom WebGL rendering. Initial stage=river; scripted keys, touch values, and camera headings. No success/movement/AI methods stubbed. No human or physical iPhone Safari completion claim.',
      target, info, results, screenshots, browserErrors: errors,
      passed: !failure, failure: failure ? String(failure.stack || failure) : null };
    await fs.writeFile(path.join(out, 'pow-river-browser.json'), JSON.stringify(report, null, 2) + '\n');
    await context.close();
  }
  if (failure) throw failure;
  console.log(`PASS: ${results.length} actual-browser POW river checks`);
  return { info, results, screenshots, browserErrors: errors };
};
