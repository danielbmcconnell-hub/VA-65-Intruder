'use strict';

// Exported real-browser fixture suite. The root runner owns the only GPU browser
// process. DOM actions and real POW.tick/render methods run here; setup fixtures
// explicitly accelerate the calendar or place a guard, without stubbing success.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async function captivityBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'pow-captivity');
  await fs.mkdir(out, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 844, height: 480 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
    localStorage.setItem('a6_sawkeys', '1');
  });
  const panel = page.locator('#pow-captivity');
  const click = name => panel.getByRole('button', { name, exact: true }).click();
  const tick = frames => page.evaluate(n => { for (let i = 0; i < n; i++) POW.tick(App.game, .1); }, frames);
  const screenshot = async name => {
    await page.evaluate(() => App.game.render(1 / 60));
    await page.screenshot({ path: path.join(out, name + '.png') });
  };
  const record = (name, observed) => checks.push({ name, passed: true, observed });
  async function inputPairs(pairs) {
    for (const pair of pairs) {
      for (const group of ['row', 'col']) for (let i = 0; i < pair[group]; i++) {
        const label = group === 'row' ? 'Tap row (+1)' : 'Tap column (+1)';
        const count = await page.evaluate(group => App.game.pow.captivity.tap.pair[group], group);
        await click(label); await tick(3);
        let actual = await page.evaluate(group => App.game.pow.captivity.tap.pair[group], group);
        if (actual === count) {
          const waiting = await page.evaluate(() => App.game.pow.captivity.inspectionUntil - App.game.pow.captivity.elapsedMinutes);
          assert.ok(waiting > 0, 'A refused tap must be explained by an actual inspection.');
          await tick(Math.ceil(waiting * 10) + 5); await click(label); await tick(3);
          actual = await page.evaluate(group => App.game.pow.captivity.tap.pair[group], group);
        }
        assert.equal(actual, count + 1, 'Each DOM tap produces one counted hit.');
      }
      await click('Commit this letter'); await tick(3);
    }
  }
  async function completeEngine() {
    const parts = await page.evaluate(() => POW.Captivity.data.car.map(part => ({ id: part.id, label: part.label })));
    await click('Engine');
    for (const part of parts) await click(part.label);
    for (const phase of ['Intake', 'Compression', 'Power', 'Exhaust']) await click(phase);
    const targets = await page.evaluate(() => App.game.pow.captivity.car.targets.map(id => POW.Captivity.data.car.find(part => part.id === id).label));
    for (const label of targets) await click(label);
    return page.evaluate(() => ({ round: App.game.pow.captivity.car.round, memory: App.game.pow.stats.memory }));
  }
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.App && window.POW && POW.Captivity, null, { timeout: 30000 });
    await page.evaluate(() => App.startPOW());
    await page.waitForFunction(() => App.game?.pow && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
    await page.evaluate(() => { App.screen = 'fixture'; POW.begin(App.game, 'solitary'); App.game.paused = false; });
    const geometry = await page.evaluate(() => {
      const g = App.game, s = g.pow, left = s.solids.find(q => q.id === 'cell-left'), right = s.solids.find(q => q.id === 'cell-right');
      const initial = g.evade.p.slice();
      POW.move(g, g.evade, 20, 0, .19); const rightStop = g.evade.p[0] - s.base[0];
      POW.move(g, g.evade, -40, 0, .19); const leftStop = g.evade.p[0] - s.base[0];
      g.evade.p.splice(0, 3, ...initial); POW.move(g, g.evade, 0, -30, .19); const doorStop = g.evade.p[2] - s.base[2];
      g.evade.p.splice(0, 3, ...initial); POW.move(g, g.evade, 0, 30, .19); const bedStop = g.evade.p[2] - s.base[2];
      g.evade.p.splice(0, 3, ...initial); s.captivity.tetherOrigin = [initial[0], initial[2]];
      g.evade.hdg = Math.PI; g.render(1 / 60);
      return { width: (right.x - right.hw) - (left.x + left.hw), rightStop, leftStop, doorStop, bedStop,
        actors: g.evade.searchers.length, fireCount: g.rend.fireN, finite: g.campGeo.every(q => q.p.concat(q.scale || []).every(Number.isFinite)), webgl: g.rend.gl.getParameter(g.rend.gl.VERSION) };
    });
    assert.ok(Math.abs(geometry.width - .9144) < 1e-8); assert.ok(geometry.rightStop < .268 && geometry.leftStop > -.268);
    assert.ok(geometry.doorStop > -1.182 && geometry.bedStop < -.369); assert.equal(geometry.finite, true);
    assert.match(geometry.webgl, /WebGL 2/); assert.ok(geometry.actors > 0); assert.ok(geometry.fireCount > 0);
    record('Real narrow-cell collision, people, constant bulb and custom WebGL scene', geometry);
    await screenshot('cell-constant-light');

    const night = await page.evaluate(() => {
      const g = App.game, c = g.pow.captivity; c.minute = 21 * 60;
      const before = g.evade.p.slice(), start = c.tetherOrigin.slice(); App.keys.KeyW = true; g.evade.hdg = 0;
      for (let i = 0; i < 50; i++) POW.tick(g, .1); App.keys.KeyW = false;
      return { before, after: g.evade.p.slice(), reach: Math.hypot(g.evade.p[0] - start[0], g.evade.p[2] - start[1]), restricted: g.pow.flags.nightShackles };
    });
    assert.equal(night.restricted, true); assert.ok(night.reach <= .10001); record('Night shackling constrains actual movement input', night);
    await page.evaluate(() => { const g = App.game; g.pow.captivity.minute = 8 * 60; POW.Captivity.open(g, 'car'); });
    const beforeModal = await page.evaluate(() => ({ p: App.game.evade.p.slice(), hdg: App.game.evade.hdg }));
    await page.keyboard.down('w'); await page.keyboard.down('d'); await tick(30); await page.keyboard.up('w'); await page.keyboard.up('d');
    const afterModal = await page.evaluate(() => ({ p: App.game.evade.p.slice(), hdg: App.game.evade.hdg }));
    assert.deepEqual(afterModal, beforeModal); record('Puzzle DOM suppresses walking and turning', afterModal);

    // Establish an explicit late-first-month calendar fixture, then recover by
    // running a real eight-hour sleep interval before completing actual puzzles.
    await page.evaluate(() => { POW.Captivity.advance(App.game, 27 * 1440, 'clock'); POW.Captivity.open(App.game, 'rest'); });
    await click('Sleep up to eight hours'); const fatigueBeforeSleep = await page.evaluate(() => App.game.pow.stats.fatigue);
    await tick(161); const rest = await page.evaluate(() => ({ day: App.game.pow.day, fatigue: App.game.pow.stats.fatigue, sleeping: App.game.pow.captivity.sleeping }));
    assert.equal(rest.day, 28); assert.equal(rest.sleeping, null); assert.ok(rest.fatigue < fatigueBeforeSleep); record('Eight-hour accelerated sleep consumes time and reduces accumulated fatigue', rest);

    await click('Engine'); await click('Pistons and connecting rods');
    assert.equal(await page.evaluate(() => App.game.pow.captivity.car.installed.length), 0);
    assert.match(await panel.locator('.pow-feedback').textContent(), /Crankshaft/);
    const engine = await completeEngine(); assert.equal(engine.round, 2); record('DOM engine dependency, real stroke cycle and component recall', engine);
    await screenshot('engine-recall-completed');

    await click('House'); await click('Timber posts (2 units)'); assert.equal(await page.evaluate(() => App.game.pow.captivity.architecture.stage), 0);
    for (const label of ['Drained concrete footing (4 units)', 'Braced timber frame (3 units)', 'Light pitched roof with gutters (3 units)', 'Separate supply; waste falls to drain (2 units)', 'Dry conduit, circuit protection and earth (3 units)', 'Bed and table; door and drain kept clear (1 units)']) await click(label);
    const house = await page.evaluate(() => ({ round: App.game.pow.captivity.architecture.round, stage: App.game.pow.captivity.architecture.stage, budget: App.game.pow.captivity.architecture.budget }));
    assert.equal(house.round, 2); record('DOM staged architectural plan with materials and services', house);
    await screenshot('house-project');

    await click('City'); await click('Check neighbourhood'); assert.equal(await page.evaluate(() => App.game.pow.captivity.city.round), 1);
    for (const [tool, cell] of [['Water', 'A2'], ['Utility', 'E2'], ['Home', 'B4'], ['Home', 'D4'], ['School', 'C5'], ['Park', 'C4'], ['Stop', 'C3']]) {
      await click(tool); await panel.getByRole('button', { name: new RegExp('^' + cell + ' ') }).click();
    }
    await screenshot('city-placed-neighbourhood'); await click('Check neighbourhood');
    assert.equal(await page.evaluate(() => App.game.pow.captivity.city.round), 2); record('DOM grid placements satisfy water, streets, utility separation and transport', { round: 2 });

    await click('Memory'); await click('Show sequence');
    await tick(65); const pattern = await page.evaluate(() => App.game.pow.captivity.memory.sequence.slice());
    assert.equal(await page.evaluate(() => App.game.pow.captivity.memory.phase), 'answer');
    for (const i of pattern) await click(['Upper left', 'Upper right', 'Lower left', 'Lower right'][i]);
    assert.equal(await page.evaluate(() => App.game.pow.captivity.memory.round), 2); record('Timed spatial pattern followed by actual DOM sequence inputs', { pattern });

    // The projects have increased fatigue. Complete another actual sleep
    // interval before attempting a set that correctly refuses exhaustion.
    await click('Rest / time'); await click('Sleep up to eight hours'); await tick(161);
    await click('Exercise / anchor'); await click('Begin gentle seated set');
    await click('Right shoulder'); assert.equal(await page.evaluate(() => App.game.pow.captivity.exercise.reps), 0);
    for (const side of ['Left shoulder', 'Right shoulder', 'Left shoulder', 'Right shoulder', 'Left shoulder', 'Right shoulder', 'Left shoulder', 'Right shoulder']) await click(side);
    const hold = panel.getByRole('button', { name: 'Press and hold: quiet breathing', exact: true });
    const holdBounds = await hold.boundingBox(); assert.ok(holdBounds);
    await page.mouse.move(holdBounds.x + holdBounds.width / 2, holdBounds.y + holdBounds.height / 2);
    await page.mouse.down(); await tick(32); await page.mouse.up();
    assert.equal(await page.evaluate(() => App.game.pow.captivity.exercise), null);
    record('Alternating DOM exercise inputs followed by a held breathing interval', { reps: 8, holdSeconds: 3 });
    await click('Help and receive help');

    await click('Tap code'); await click('Listen / replay message');
    const receive = await page.evaluate(() => {
      const pairs = []; let prior = '', lastGroup = '';
      for (let i = 0; i < 700 && !App.game.pow.captivity.tap.playback.done; i++) {
        POW.tick(App.game, .1);
        const signal = document.querySelector('[data-tap-signal]').textContent;
        if (signal.includes('•') && signal !== prior) {
          const group = signal.startsWith('Row') ? 'row' : 'col';
          if (group === 'row' && lastGroup !== 'row') pairs.push({ row: 0, col: 0 });
          if (!pairs.length) throw new Error('Column signal arrived before a row.');
          pairs[pairs.length - 1][group]++; lastGroup = group;
        }
        prior = signal;
      }
      return { pairs, done: App.game.pow.captivity.tap.playback.done };
    });
    assert.equal(receive.done, true); assert.ok(receive.pairs.length > 0); assert.ok(receive.pairs.every(pair => pair.row > 0 && pair.row <= 5 && pair.col > 0 && pair.col <= 5));
    await inputPairs(receive.pairs); await screenshot('tap-counted-receive'); await click('Check complete word');
    assert.equal(await page.evaluate(() => App.game.pow.flags.prisonerContact), true);
    record('Counts visual timed row/column pulses, enters actual tap hits and validates a decoded message', receive);

    const targetWord = await page.evaluate(() => App.game.pow.captivity.tap.sendWord);
    await click('Transmit ' + targetWord); const sendPairs = await page.evaluate(word => POW.TapCode.encode(word), targetWord);
    await inputPairs(sendPairs); await click('Check complete word');
    assert.equal(await page.evaluate(() => App.game.pow.captivity.tap.sent), 1);
    const inspection = await page.evaluate(() => {
      const g = App.game, guard = g.evade.searchers.find(a => a.alive !== false); const b = g.pow.base;
      guard.p.splice(0, 3, b[0], b[1], b[2] - 2.7);
      const before = g.pow.flags.inspections || 0; g.pow.nextInspection = 0;
      POW.AI.noise(g, g.evade.p, .8, 'controlled repeated-tap fixture');
      for (let i = 0; i < 30; i++) POW.tick(g, .1);
      return { before, after: g.pow.flags.inspections || 0, stage: g.pow.stage, guardState: guard.state, inspectionUntil: g.pow.captivity.inspectionUntil, elapsed: g.pow.captivity.elapsedMinutes };
    });
    assert.ok(inspection.after > inspection.before); assert.equal(inspection.stage, 'solitary'); assert.equal(inspection.guardState, 'investigate');
    record('Actual guard hearing through the door triggers an inspection without recapturing confinement', inspection);

    await click('Engine'); await click('Engine block'); await click('Main bearings');
    await click('House'); await click('Drained concrete footing (4 units)');
    const saved = await page.evaluate(() => {
      const g = App.game, snap = POW.save(g), expected = { installed: snap.captivity.car.installed.slice(), foundation: snap.captivity.architecture.choices.foundation, contact: snap.flags.prisonerContact, day: snap.day, memory: snap.stats.memory, rewards: { ...snap.captivity.rewards } };
      POW.begin(g, 'solitary', JSON.parse(JSON.stringify(snap)));
      return { expected, actual: { installed: g.pow.captivity.car.installed.slice(), foundation: g.pow.captivity.architecture.choices.foundation, contact: g.pow.flags.prisonerContact, day: g.pow.day, memory: g.pow.stats.memory, rewards: { ...g.pow.captivity.rewards } }, open: g.pow.captivity.open };
    });
    assert.deepEqual(saved.actual, saved.expected); assert.equal(saved.open, false); record('Real checkpoint save/restore retains project maps, contacts, dates and condition', saved);

    await page.evaluate(() => { const g = App.game; if (!g.pow.captivity.pendingEvent) g.pow.captivity.pendingEvent = { kind: 'interview', day: g.pow.day }; POW.Captivity.open(g, 'interview'); });
    await screenshot('non-graphic-interview'); const resilience = await page.evaluate(() => App.game.pow.stats.resilience);
    await click('Use a flexible coping response'); assert.equal(await page.evaluate(() => App.game.pow.stats.resilience), resilience);
    assert.equal(await page.evaluate(() => App.game.pow.captivity.pendingEvent), null);
    record('Non-graphic interview uses a neutral coping choice and preserves personal worth statistics', { resilience });

    await click('Rest / time'); await click('Live an established monthly routine');
    assert.equal(await page.evaluate(() => App.game.pow.captivity.routine.active), true); await tick(105);
    const calendar = await page.evaluate(() => ({ day: App.game.pow.day, transfers: App.game.pow.flags.campTransfers, events: App.game.pow.captivity.events.map(e => e.kind), routine: App.game.pow.captivity.routine.active }));
    assert.ok(calendar.day >= 38); assert.ok(calendar.transfers >= 1); assert.ok(calendar.events.includes('week')); assert.equal(calendar.routine, true);
    await click('End longer routine early'); record('Established monthly routine accrues real days, weekly events and a transfer and stops on request', calendar);

    const releaseFixture = await page.evaluate(() => {
      const g = App.game, C = POW.Captivity; const early = C.release(g);
      C.advance(g, Math.max(0, C.releaseDay(g.pow.captivity) - g.pow.day + 1) * 1440, 'routine'); C.open(g, 'release');
      return { early, day: g.pow.day, target: C.releaseDay(g.pow.captivity), available: g.pow.captivity.releaseAvailable };
    });
    assert.equal(releaseFixture.early, false); assert.equal(releaseFixture.available, true); assert.ok(releaseFixture.day >= releaseFixture.target);
    await click('Continue to Operation Homecoming'); assert.equal(await page.evaluate(() => App.game.pow.complete), true);
    assert.match(await page.locator('#powHUD .pow-end h2').textContent(), /1973/);
    await screenshot('operation-homecoming-1973'); record('Release requires the prolonged calendar and produces the 1973 historical ending', releaseFixture);
    assert.deepEqual(errors, [], 'No uncaught browser errors in captivity interactions.');
    const result = { suite: 'pow-captivity', checks, browserErrors: errors, limits: 'Real browser DOM and custom WebGL fixture execution with touch emulation. Calendar/guard placements are explicit fixtures; physical iPhone Safari and a human end-to-end playthrough remain separate.' };
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2)); return result;
  } finally {
    await fs.writeFile(path.join(out, 'partial-checks.json'), JSON.stringify({ checks, browserErrors: errors }, null, 2));
    await context.close();
  }
};
