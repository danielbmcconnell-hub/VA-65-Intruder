'use strict';

// Real custom-WebGL/DOM integration tests. The calendar, patrol duty and view
// steering are explicit fixtures; success flags, puzzle answers, interactions,
// collisions and progression are never stubbed or written by this suite.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async function milestone21(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'pow-m21');
  await fs.mkdir(out, { recursive: true });
  const checks = [], screenshots = [], browserErrors = [];
  for (const layout of [
    { name: 'desktop', viewport: { width: 1100, height: 650 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }
  ]) {
    const context = await browser.newContext(layout), page = await context.newPage();
    const touchSession = layout.hasTouch ? await context.newCDPSession(page) : null;
    const touch = (type, points = []) => touchSession.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p, radiusX: 7, radiusY: 7, force: 1 })) });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); browserErrors.push({ layout: layout.name, error: error.message }); });
    const record = (name, observed) => {
      checks.push({ name: layout.name + ': ' + name, passed: true, observed });
      console.log('PASS m21 ' + layout.name + ' ' + name);
    };
    const tick = frames => page.evaluate(n => { for (let i = 0; i < n; i++) POW.tick(App.game, .1); }, frames);
    const panel = page.locator('#pow-captivity');
    const click = name => panel.getByRole('button', { name, exact: true }).click();
    const shot = async name => {
      await page.evaluate(() => { App.game.render(1 / 60); App.game.syncControls(); });
      const file = layout.name + '-' + name + '.png';
      await page.screenshot({ path: path.join(out, file) }); screenshots.push('pow-m21/' + file);
    };
    async function walk(x, z, label, limit = 2600) {
      await page.keyboard.down('w');
      let observed;
      try {
        observed = await page.evaluate(({ x, z, limit }) => {
          const g = App.game, b = g.pow.base, tx = b[0] + x, tz = b[2] + z, startStage = g.pow.stage;
          let steps = 0, stagnant = 0, lastDistance = Infinity, route = [], waypoint = 0;
          for (; steps < limit; steps++) {
            if (g.pow.stage === 'solitary' && startStage !== 'solitary' && !POW.Mindscape.active(g)) throw new Error('Unexpected capture during physical route');
            const distance = Math.hypot(tx - g.evade.p[0], tz - g.evade.p[2]);
            if (distance < .025) break;
            stagnant = distance >= lastDistance - .002 ? stagnant + 1 : 0; lastDistance = distance;
            if (stagnant >= 8 && waypoint >= route.length) {
              route = POW.AI.planPath(g, { p: g.evade.p.slice() }, [tx, g.evade.p[1], tz]); waypoint = 0; stagnant = 0;
            }
            while (waypoint < route.length && Math.hypot(route[waypoint][0] - g.evade.p[0], route[waypoint][2] - g.evade.p[2]) < .15) waypoint++;
            const goal = waypoint < route.length ? route[waypoint] : [tx, g.evade.p[1], tz];
            const dx = goal[0] - g.evade.p[0], dz = goal[2] - g.evade.p[2];
            g.evade.hdg = Math.atan2(dx, -dz);
            POW.tick(g, Math.min(.1, Math.hypot(dx, dz) / (g.evade.crouch ? 1 : 2.05)));
          }
          return { feet: g.evade.p.slice(), stage: g.pow.stage, steps, distance: Math.hypot(tx - g.evade.p[0], tz - g.evade.p[2]) };
        }, { x, z, limit });
      } finally { await page.keyboard.up('w'); }
      assert.ok(observed.distance < .04, label + ' must use collision-checked walking: ' + JSON.stringify(observed));
      return observed;
    }
    async function hold(seconds, heading) {
      if (heading !== undefined) await page.evaluate(h => { App.game.evade.hdg = h; }, heading);
      if (touchSession) {
        await tick(1);
        const center = await page.locator('#powHUD .pow-context-controls button:first-child').evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        await touch('touchStart', [{ ...center, id: 8 }]);
        try { await tick(Math.ceil(seconds * 10)); }
        finally { await touch('touchEnd'); await tick(1); }
        return;
      }
      await page.keyboard.down('f');
      try { await tick(Math.ceil(seconds * 10)); }
      finally { await page.keyboard.up('f'); await tick(1); }
    }
    async function object(id) {
      return page.evaluate(id => {
        const s = App.game.pow, q = s.objects.find(item => item.id === id);
        if (!q) throw new Error('Missing physical object ' + id);
        return { id, x: q.p[0] - s.base[0], y: q.p[1] - s.base[1], z: q.p[2] - s.base[2], hold: q.hold || .2 };
      }, id);
    }
    async function physicalInteraction(id, approach) {
      const q = await object(id), destination = approach || { x: q.x, z: q.z + .65 };
      await walk(destination.x, destination.z, 'walk to ' + id);
      await page.evaluate(({ x, z }) => { const g = App.game, b = g.pow.base; g.evade.hdg = Math.atan2(b[0] + x - g.evade.p[0], -(b[2] + z - g.evade.p[2])); }, q);
      await tick(1);
      const focus = await page.evaluate(() => ({ id: App.game.pow.focus?.id, feet: App.game.evade.p.slice(), feedback: App.game.pow.captivity?.feedback, open: !!App.game.pow.captivity?.open }));
      assert.equal(focus.id, id, 'The real interaction prompt must select ' + id + ': ' + JSON.stringify(focus));
      await hold(q.hold + .2);
    }
    async function inputPairs(pairs) {
      for (const pair of pairs) {
        if (pair.space) continue;
        for (const group of ['row', 'col']) for (let i = 0; i < pair[group]; i++) {
          const label = group === 'row' ? 'Tap row (+1)' : 'Tap column (+1)';
          const before = await page.evaluate(group => App.game.pow.captivity.tap.pair[group], group);
          await click(label); await tick(3);
          let after = await page.evaluate(group => App.game.pow.captivity.tap.pair[group], group);
          if (after === before) {
            const wait = await page.evaluate(() => App.game.pow.captivity.inspectionUntil - App.game.pow.captivity.elapsedMinutes);
            assert.ok(wait > 0, 'A denied tap must be explained by a live guard inspection');
            await tick(Math.ceil(wait * 10) + 5); await click(label); await tick(3);
            after = await page.evaluate(group => App.game.pow.captivity.tap.pair[group], group);
          }
          assert.equal(after, before + 1, 'Every visible tap control increments exactly one hit');
        }
        await click('Commit this letter'); await tick(2);
      }
    }
    async function receiveOne() {
      await click('Listen / replay message');
      const observed = await page.evaluate(() => {
        const pairs = []; let prior = '', lastGroup = '', steps = 0;
        for (; steps < 3000 && !App.game.pow.captivity.tap.playback?.done; steps++) {
          POW.tick(App.game, .1);
          const signal = document.querySelector('[data-tap-signal]').textContent;
          if (signal.includes('•') && signal !== prior) {
            const group = signal.startsWith('Row') ? 'row' : 'col';
            if (group === 'row' && lastGroup !== 'row') pairs.push({ row: 0, col: 0 });
            if (!pairs.length) throw new Error('A column was displayed before a row');
            pairs[pairs.length - 1][group]++; lastGroup = group;
          }
          prior = signal;
        }
        return { pairs, steps, done: !!App.game.pow.captivity.tap.playback?.done };
      });
      assert.equal(observed.done, true, 'Timed playback finishes');
      assert.ok(observed.pairs.length > 0 && observed.pairs.every(p => p.row > 0 && p.row <= 5 && p.col > 0 && p.col <= 5));
      await inputPairs(observed.pairs); await click('Check complete word');
      return observed;
    }
    try {
      await page.addInitScript(() => {
        localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
        localStorage.setItem('a6_sawkeys', '1');
      });
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => window.App && window.POW && POW.Solidarity && POW.Mindscape && POW.DentonFlashback && POW.RegularConfinement);
      await page.evaluate(() => App.startPOW());
      await page.waitForFunction(() => App.game?.pow && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
      await page.evaluate(() => {
        App.screen = 'fixture'; App.game.paused = false; POW.begin(App.game, 'solitary');
        for (const key of Object.keys(App.keys)) App.keys[key] = false;
        App.gctl.pitch = App.gctl.roll = 0;
      });
      const init = await page.evaluate(() => ({ stage: App.game.pow.stage, webgl: App.game.rend.gl.getParameter(App.game.rend.gl.VERSION), known: POW.Solidarity.state(App.game).known.slice(), cells: App.game.pow.solids.length }));
      assert.equal(init.stage, 'solitary'); assert.match(init.webgl, /WebGL 2/); assert.equal(init.known.length, 0);
      record('New Alcatraz systems load in an isolated custom-WebGL cell', init);
      await shot('isolated-cell');

      // The remaining implementation-specific sequences are deliberately kept in
      // this one owner file; no runner, gameplay modules or release files change.
      await exerciseHistoricalPhotos(page, shot, record);
      await exerciseFlashback(page, shot, record);
      await exerciseNetwork(page, panel, click, tick, receiveOne, inputPairs, shot, record);
      await exerciseMindscapes(page, walk, physicalInteraction, shot, record, touchSession && touch, tick);
      await exerciseRegularReturn(page, walk, physicalInteraction, hold, tick, panel, click, shot, record);
      assert.deepEqual(errors, [], 'No uncaught JavaScript errors');
      const gl = await page.evaluate(() => App.game.rend.gl.getError()); assert.equal(gl, 0);
      record('No JavaScript or WebGL errors after all new chapter interactions', { errors, glError: gl });
    } catch (error) {
      const state = await page.evaluate(() => ({ stage: App.game?.pow?.stage, p: App.game?.evade?.p, day: App.game?.pow?.day, c: App.game?.pow?.captivity, regular: App.game?.pow?.regular, focus: App.game?.pow?.focus?.id, active: document.activeElement?.outerHTML?.slice(0, 400), keys: App.keys })).catch(() => null);
      await fs.writeFile(path.join(out, layout.name + '-failure-state.json'), JSON.stringify({ error: String(error), state }, null, 2) + '\n');
      throw error;
    } finally {
      await fs.writeFile(path.join(out, 'partial-checks.json'), JSON.stringify({ checks, browserErrors, screenshots }, null, 2) + '\n');
      await context.close();
    }
  }
  const report = { suite: 'milestone-2.1', checks, browserErrors, screenshots,
    scope: 'Actual Chromium WebGL2, keyboard, DOM and emulated touchscreen layouts. Calendar advancement, patrol duty and deterministic view steering are declared fixtures. Genuine pulse decoding, project decisions, collision-checked player movement, held environmental actions and progression are exercised without replacing gameplay methods or writing success flags. This is not physical Windows hardware, physical iPhone Safari or human balance validation.' };
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n'); return report;
};

async function exerciseHistoricalPhotos(page, shot, record) {
  for (const key of ['denton', 'stockdale']) {
    await page.evaluate(key => POWPhotos.open(key), key);
    const photo = page.locator('#powHistory img[data-asset="' + key + '"]');
    await photo.waitFor({ state: 'visible' });
    await page.waitForFunction(key => { const p = document.querySelector('#powHistory img[data-asset="' + key + '"]'); return p && p.complete && p.naturalWidth > 0; }, key);
    await photo.scrollIntoViewIfNeeded();
    const result = await photo.evaluate(p => {
      const rect = p.getBoundingClientRect(), style = getComputedStyle(p);
      return { naturalWidth: p.naturalWidth, naturalHeight: p.naturalHeight, width: rect.width, height: rect.height, opacity: style.opacity, filter: style.filter, fit: style.objectFit, src: p.getAttribute('src'), caption: p.closest('figure').textContent };
    });
    assert.ok(Math.abs(result.width / result.height - result.naturalWidth / result.naturalHeight) < .003);
    assert.equal(result.opacity, '1'); assert.equal(result.filter, 'none'); assert.equal(result.fit, 'contain');
    assert.match(result.caption, /supplied|color|colour|provenance/i);
    await shot('photo-' + key); await page.locator('#powHistory').getByRole('button', { name: 'Close history', exact: true }).click();
    assert.equal(await page.evaluate(() => App.game.paused), false);
    record(key + ' photograph keeps native proportions and honest provenance', result);
  }
}

async function exerciseFlashback(page, shot, record) {
  const before = await page.evaluate(() => ({ p: App.game.evade.p.slice(), stats: { ...App.game.pow.stats } }));
  await page.evaluate(() => POW.DentonFlashback.open(App.game));
  await page.locator('#powDentonFlashback [data-denton-photo]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-denton-photo]').complete);
  assert.match(await page.locator('#powDentonFlashback').textContent(), /2 May 1966/);
  assert.match(await page.locator('#powDentonFlashback').textContent(), /not archival footage/);
  await page.locator('[data-denton-mark="-"]').click();
  await page.locator('[data-denton-letter]').selectOption('T');
  await page.locator('[data-denton-submit]').click();
  assert.equal(await page.evaluate(() => POW.DentonFlashback.state(App.game).decoded), '');
  assert.match(await page.locator('[data-denton-feedback]').textContent(), /First observe/);
  await page.locator('[data-denton-clear]').click();
  const measured = [];
  const letters = { '.': 'E', '-': 'T', '---': 'O', '.-.': 'R', '..-': 'U' };
  for (let i = 0; i < 7; i++) {
    await page.locator('[data-denton-play="letter"]').click();
    const observation = await page.evaluate(() => {
      const signal = document.querySelector('[data-denton-signal]'), widths = [];
      let status = POW.DentonFlashback.status(), lit = signal.dataset.lit === 'true', start = lit ? 0 : null;
      for (let n = 0; n < 1800 && status.playing; n++) {
        POW.DentonFlashback.advance(.03); const next = POW.DentonFlashback.status(), nowLit = signal.dataset.lit === 'true';
        if (nowLit && !lit) start = next.elapsed;
        if (!nowLit && lit) { widths.push(next.elapsed - start); start = null; }
        lit = nowLit; status = next;
      }
      return { widths, unit: status.unit, stopped: !status.playing };
    });
    assert.equal(observation.stopped, true); assert.ok(observation.widths.length > 0);
    const pattern = observation.widths.map(width => width > observation.unit * 2 ? '-' : '.').join('');
    assert.ok(letters[pattern], 'The displayed pulse widths decode to an expected Morse letter');
    for (const mark of pattern) await page.locator('[data-denton-mark="' + mark + '"]').click();
    await page.locator('[data-denton-letter]').selectOption(letters[pattern]);
    await page.locator('[data-denton-submit]').click();
    assert.equal(await page.evaluate(() => POW.DentonFlashback.state(App.game).decoded.length), i + 1);
    measured.push({ letter: letters[pattern], pattern, widths: observation.widths, unit: observation.unit });
    if (i === 1) {
      await page.locator('[data-denton-close]').click();
      assert.equal(await page.evaluate(() => App.game.paused), false);
      await page.evaluate(() => POW.DentonFlashback.open(App.game));
      assert.equal(await page.evaluate(() => POW.DentonFlashback.state(App.game).decoded), 'TO');
    }
  }
  assert.equal(measured.map(item => item.letter).join(''), 'TORTURE');
  await shot('denton-morse-decoded');
  await page.keyboard.down('w'); await page.keyboard.down('f');
  await page.evaluate(() => { for (let i = 0; i < 40; i++) POW.tick(App.game, .1); });
  await page.keyboard.up('w'); await page.keyboard.up('f');
  await page.locator('[data-denton-close]').click();
  const after = await page.evaluate(() => ({ p: App.game.evade.p.slice(), stats: { ...App.game.pow.stats }, complete: POW.DentonFlashback.state(App.game).completed, modal: !!App.game.pow.modalOpen, paused: App.game.paused }));
  assert.deepEqual(after.p, before.p); assert.deepEqual(after.stats, before.stats); assert.equal(after.complete, true); assert.equal(after.modal, false); assert.equal(after.paused, false);
  record('Optional dated flashback measures visible Morse pulses, decodes all letters and resumes the physical cell', { measured, observationWithoutPlaybackRefused: true, progressSurvivedClose: true, physicalState: after });
}
async function exerciseNetwork(page, panel, click, tick, receiveOne, inputPairs, shot, record) {
    await page.evaluate(() => POW.Captivity.open(App.game, 'network'));
  await page.locator('[data-network-listen]').click();
  const anonymous = await receiveOne();
  const early = await page.evaluate(() => ({ cursor: POW.Solidarity.state(App.game).cursor, known: POW.Solidarity.state(App.game).known.slice(), anonymous: POW.Solidarity.state(App.game).anonymousReceived }));
  assert.equal(early.cursor, 0); assert.equal(early.known.length, 0); assert.equal(early.anonymous, 1);
  record('Before late October, genuine decoded contact stays anonymous', { ...early, countedPairs: anonymous.pairs });
  // Explicit time fixture: this is the transition from the 12 October escape
  // chapter into late-October Alcatraz, not a claim that named prisoners were
  // immediately sharing the player's fictional cell or freely meeting him.
  await page.evaluate(() => POW.Captivity.advance(App.game, 16 * 1440, 'routine'));
  assert.equal(await page.evaluate(() => POW.Solidarity.available(App.game)), true);
  const messages = [];
  for (let i = 0; i < 8; i++) {
    const cursorBefore = await page.evaluate(() => POW.Solidarity.state(App.game).cursor);
    if (i === 1) {
      await click('Check complete word');
      assert.equal(await page.evaluate(() => POW.Solidarity.state(App.game).cursor), cursorBefore, 'An empty answer cannot discover an identity');
    }
    const observed = await receiveOne();
    const after = await page.evaluate(() => { const n = POW.Solidarity.state(App.game); return { cursor: n.cursor, known: n.known.slice(), last: n.decoded[n.decoded.length - 1], clues: { ...n.clues } }; });
    assert.equal(after.cursor, cursorBefore + 1); messages.push({ ...after.last, countedPairs: observed.pairs });
    if (i === 0) assert.equal(after.known.length, 0);
    if (i === 1) assert.deepEqual(after.known, ['denton']);
    if (i === 3) assert.deepEqual(after.known, ['denton', 'stockdale']);
  }
  const word = await page.evaluate(() => App.game.pow.captivity.tap.sendWord);
  await click('Transmit ' + word);
  // Encode the displayed word using the actual visible historical five-by-five
  // chart; the test supplies row and column hits, never calls tapValidate.
  const sendPairs = await page.evaluate(word => {
    const grid = ['ABCDE', 'FGHIJ', 'LMNOP', 'QRSTU', 'VWXYZ'];
    return Array.from(word.replace(/K/g, 'C')).filter(letter => /[A-Z]/.test(letter)).map(letter => {
      const row = grid.findIndex(line => line.includes(letter)); return { row: row + 1, col: grid[row].indexOf(letter) + 1 };
    });
  }, word);
  await inputPairs(sendPairs); await click('Check complete word');
  await page.evaluate(() => POW.Captivity.open(App.game, 'network'));
  assert.equal(await page.evaluate(() => POW.Solidarity.state(App.game).sent.length), 1);
  assert.match(await panel.textContent(), /BACK US/);
  assert.match(await panel.textContent(), /reconstructed fiction/i);
  const statsBeforeWrong = await page.evaluate(() => ({ ...App.game.pow.stats }));
  await page.locator('[data-backus-symbol="B"]').click();
  await page.locator('[data-backus-meaning="unity"]').click();
  assert.deepEqual(await page.evaluate(() => ({ ...App.game.pow.stats })), statsBeforeWrong, 'A mistaken historical matching answer does not punish condition');
  for (const [symbol, meaning] of [['B','bow'],['A','air'],['C','crimes'],['K','kiss'],['US','unity']]) {
    await page.locator('[data-backus-symbol="' + symbol + '"]').click();
    await page.locator('[data-backus-meaning="' + meaning + '"]').click();
  }
  assert.equal(await page.evaluate(() => POW.Solidarity.state(App.game).objectives.backus), true);
  await page.locator('[data-network-decision="reconnect:rest"]').click();
  await page.locator('[data-network-decision="rumor:observe"]').click();
  await page.locator('[data-network-decision="mutual:short"]').click();
  const network = await page.evaluate(() => { const n = POW.Solidarity.state(App.game); return { cursor: n.cursor, known: n.known.slice(), sent: n.sent.slice(), decisions: { ...n.decisions }, guidance: { ...n.guidance }, objectives: { ...n.objectives }, clues: { ...n.clues }, freeHistoricalActors: App.game.evade.searchers.some(actor => ['denton','stockdale','coker','mcknight'].includes(actor.id)) }; });
  assert.equal(network.cursor, 8); assert.equal(network.objectives.contact, true); assert.equal(network.objectives.reply, true); assert.equal(network.objectives.thoughtfulResponse, true); assert.equal(network.objectives.leadership, true); assert.equal(network.clues.changeover, true); assert.equal(network.freeHistoricalActors, false);
  await shot('prisoner-network-guidance');
  record('Counted tap pulses gradually reveal Denton and Stockdale and deliver meaningful support and a fictional guard clue', { messages, network, invalidAnswerDidNotAdvance: true });
  record('BACK US decisions permit recovery, careful reporting and mutual support without a courage score', network.decisions);
  record('Matches all five documented BACK US mnemonic groups with no condition penalty for a mistaken answer', { groups: ['B','A','C','K','US'], complete: true });

  for (const kind of ['family', 'scout', 'oath']) {
    await page.locator('[data-network-anchor-start="' + kind + '"]').click();
    const labels = await page.locator('[data-network-anchor="' + kind + '"] p').first().textContent();
    const observed = labels.replace(/^Remember these cues in order:\s*/, '').split(' → ');
    assert.ok(observed.length >= 3);
    await tick(81);
    for (const label of observed) await panel.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await page.evaluate(kind => POW.Solidarity.state(App.game).anchors[kind], kind), 1);
    record('Timed ' + kind + ' memory anchor is completed through recalled visible cues', { observed });
  }
  const restored = await page.evaluate(() => {
    const g = App.game, snap = POW.save(g), before = JSON.stringify(POW.Solidarity.state(g));
    POW.Captivity.close(g); POW.begin(g, snap.stage, JSON.parse(JSON.stringify(snap)));
    return { same: JSON.stringify(POW.Solidarity.state(g)) === before, known: POW.Solidarity.state(g).known.slice(), flashback: g.pow.captivity.flashback.decoded };
  });
  assert.equal(restored.same, true); assert.equal(restored.flashback, 'TORTURE');
  record('Actual checkpoint restores discovered identities, decisions, anchors and optional Morse lesson', restored);
}
async function exerciseMindscapes(page, walk, physicalInteraction, shot, record, touch, tick) {
  const panel = page.locator('#pow-captivity');
  await page.evaluate(() => POW.Captivity.open(App.game, 'rest'));
  await panel.getByRole('button', { name: 'Sleep up to eight hours', exact: true }).click();
  await tick(161);
  await page.evaluate(() => POW.Captivity.close(App.game));
  const recovered = await page.evaluate(() => ({ fatigue: App.game.pow.stats.fatigue, sleeping: App.game.pow.captivity.sleeping }));
  assert.equal(recovered.sleeping, null); assert.ok(recovered.fatigue < 92);
  record('Actual eight-hour sleep restores fatigue before demanding imagined projects', recovered);
  const physical = await page.evaluate(() => ({ p: App.game.evade.p.slice(), base: App.game.pow.base.slice(), hdg: App.game.evade.hdg, solids: App.game.pow.solids.map(q => q.id), ai: POW.AI.snapshot(App.game) }));
  async function open(kind) {
    await page.evaluate(kind => POW.Captivity.open(App.game, kind), kind);
    await panel.locator('[data-mind-open="' + kind + '"]').click();
    assert.equal(await page.evaluate(() => POW.Mindscape.active(App.game)), true);
  }
  async function returnToCell(kind) {
    const saved = await page.evaluate(() => { const snap = POW.save(App.game); return { stage: snap.stage, p: snap.p.slice(), base: snap.base.slice(), current: App.game.evade.p.slice() }; });
    assert.deepEqual(saved.p, physical.p); assert.deepEqual(saved.base, physical.base); assert.equal(saved.stage, 'solitary');
    assert.ok(saved.current[1] >= physical.p[1] + 29);
    await page.locator('[data-mind-return]').click();
    const after = await page.evaluate(() => ({ active: POW.Mindscape.active(App.game), p: App.game.evade.p.slice(), base: App.game.pow.base.slice(), hdg: App.game.evade.hdg, solids: App.game.pow.solids.map(q => q.id), ai: POW.AI.snapshot(App.game), completions: { ...POW.Mindscape.progress(App.game).completions } }));
    assert.equal(after.active, false); assert.deepEqual(after.p, physical.p); assert.deepEqual(after.base, physical.base); assert.deepEqual(after.solids, physical.solids); assert.deepEqual(after.ai, physical.ai); assert.equal(after.hdg, physical.hdg);
    assert.equal(after.completions[kind], 1); return after;
  }
  await open('car');
  if (touch) {
    await page.evaluate(() => App.game.syncControls());
    const stick = await page.locator('#stick').evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width }; });
    const before = await page.evaluate(() => App.game.evade.p.slice());
    await touch('touchStart', [{ x: stick.x, y: stick.y, id: 7 }]);
    await touch('touchMove', [{ x: stick.x, y: stick.y - (stick.width / 2 - 10) * .68, id: 7 }]);
    await tick(11); await touch('touchEnd'); await tick(1);
    const actual = await page.evaluate(before => ({ distance: Math.hypot(App.game.evade.p[0] - before[0], App.game.evade.p[2] - before[2]), stopped: App.gctl.pitch === 0 && App.gctl.roll === 0, dpr: devicePixelRatio }), before);
    assert.ok(actual.distance > 1); assert.equal(actual.stopped, true); assert.equal(actual.dpr, 3);
    record('Actual emulated touchscreen stick moves through the 3D imagined workshop and release stops movement', actual);
  }
  await physicalInteraction('mind-car-pistons');
  assert.equal(await page.evaluate(() => App.game.pow.captivity.car.installed.length), 0, 'Physical component dependency is enforced');
  const parts = await page.evaluate(() => POW.Captivity.data.car.map(part => part.id));
  for (const id of parts) {
    await physicalInteraction('mind-car-' + id);
    const state = await page.evaluate(() => ({ installed: App.game.pow.captivity.car.installed.slice(), feedback: App.game.pow.captivity.feedback, fatigue: App.game.pow.stats.fatigue, focus: App.game.pow.focus?.id, p: App.game.evade.p.slice(), input: App.game.pow.input, open: App.game.pow.captivity.open }));
    assert.ok(state.installed.includes(id), 'Actual held physical station must fit ' + id + ': ' + JSON.stringify(state));
  }
  assert.equal(await page.evaluate(() => App.game.pow.captivity.car.phase), 'cycle');
  for (const phase of ['intake', 'compression', 'power', 'exhaust']) await physicalInteraction('mind-stroke-' + phase);
  assert.equal(await page.evaluate(() => App.game.pow.captivity.car.phase), 'recall');
  const targets = await page.evaluate(() => App.game.pow.captivity.car.targets.slice());
  for (const id of targets) await physicalInteraction('mind-car-' + id);
  assert.equal(await page.evaluate(() => App.game.pow.captivity.car.round), 2);
  await walk(-2.3, -.9, 'view assembled remembered engine');
  await page.evaluate(() => { App.game.evade.hdg = Math.atan2(2.3, 1.6); });
  await shot('imagined-engine-completed');
  const car = await returnToCell('car');
  record('Walks to ten mechanical stations, enforces prerequisites, traces four strokes and recalls components', { parts, targets, completion: car.completions.car });

  await open('architecture');
  await physicalInteraction('mind-house-timber');
  assert.equal(await page.evaluate(() => App.game.pow.captivity.architecture.stage), 0, 'Wet-ground timber footing is refused');
  const choices = ['concrete', 'timber', 'pitched', 'gravity', 'conduit', 'clear'];
  for (const id of choices) await physicalInteraction('mind-house-' + id);
  assert.equal(await page.evaluate(() => App.game.pow.captivity.architecture.round), 2);
  await walk(0, -.35, 'approach remembered house doorway');
  await walk(-2.1, -5.0, 'physically enter the clear aisle of the completed remembered house');
  const wall = await page.evaluate(() => {
    const g = App.game, before = g.evade.p.slice(); g.evade.hdg = -Math.PI / 2;
    for (let i = 0; i < 30; i++) POW.tick(g, .1);
    return { before, after: g.evade.p.slice(), localX: g.evade.p[0] - g.pow.base[0], furniture: g.campGeo.filter(q => /house-(bed|table)|water|conduit/.test(q.id)).length };
  });
  // This movement intentionally uses a held DOM keyboard event as well as real
  // navigation: a wall must stop further travel, not let the imagined space
  // bypass the engine's ordinary collision system.
  await page.keyboard.down('w');
  const stop = await page.evaluate(() => { const g = App.game; g.evade.hdg = -Math.PI / 2; for (let i = 0; i < 30; i++) POW.tick(g, .1); return g.evade.p[0] - g.pow.base[0]; });
  await page.keyboard.up('w');
  assert.ok(stop > -3.75 && stop < -3.2, 'Remembered house has real collision walls; observed stop x=' + stop);
  await page.evaluate(() => { App.game.evade.hdg = Math.PI / 2; }); await shot('imagined-house-interior');
  const house = await returnToCell('architecture');
  record('Selects physical structural/service samples, enters the complete house and collides with its wall', { choices, wallStopX: stop, furniture: wall.furniture, completion: house.completions.architecture });

  await open('city');
  await physicalInteraction('mind-city-survey');
  assert.equal(await page.evaluate(() => App.game.pow.captivity.city.round), 1, 'An empty plan fails the physical survey');
  const placements = [['water', 5], ['utility', 9], ['housing', 16], ['housing', 18], ['school', 22], ['park', 17], ['stop', 12]];
  for (const [tool, index] of placements) {
    await page.locator('[data-mind-tool]').selectOption(tool);
    await page.locator('[data-mind-tool]').evaluate(node => node.blur());
    await physicalInteraction('mind-city-' + index);
    assert.equal(await page.evaluate(index => App.game.pow.captivity.city.grid[index], index), tool);
  }
  await physicalInteraction('mind-city-survey');
  assert.equal(await page.evaluate(() => App.game.pow.captivity.city.round), 2);
  await walk(-2, 11.4, 'view completed connected imagined city');
  await page.evaluate(() => { App.game.evade.hdg = 0; }); await shot('imagined-city-completed');
  const city = await returnToCell('city');
  assert.equal(await page.evaluate(() => POW.Solidarity.state(App.game).objectives.practice), true);
  record('Walks to seven real city plots and surveys connected homes, services, water and transport', { placements, completion: city.completions.city });
  record('All three imagined projects save the original physical cell and restore its exact position, collision and patrol state', { p: city.p, base: city.base, completions: city.completions, practiceSupportsProgression: true });
}
async function exerciseRegularReturn(page, walk, physicalInteraction, hold, tick, panel, click, shot, record) {
  const early = await page.evaluate(() => POW.RegularConfinement.eligibility(App.game));
  assert.equal(early.ready, false); assert.ok(early.projects >= 3); assert.equal(early.communication, true);
  record('Three completed projects and communication do not bypass elapsed confinement and observation requirements', early);
  await page.evaluate(() => { POW.Captivity.advance(App.game, 12 * 1440, 'routine'); POW.Captivity.open(App.game, 'rest'); });
  await click('Sleep up to eight hours'); await tick(161);
  const rested = await page.evaluate(() => ({ fatigue: App.game.pow.stats.fatigue, day: App.game.pow.day, sleeping: App.game.pow.captivity.sleeping }));
  assert.equal(rested.sleeping, null); assert.ok(rested.fatigue <= 85);
  await page.evaluate(() => { POW.Captivity.close(App.game); App.game.pow.captivity.minute = 8 * 60; });
  // A small daytime/calendar fixture makes the repeated observation feasible;
  // the player still walks and interacts with the physical slot on each day.
  async function observeCorridor() {
    const before = await page.evaluate(() => App.game.pow.captivity.observations || 0);
    await physicalInteraction('cell-door', { x: -.2, z: -1.05 });
    if (await panel.getByRole('button', { name: 'Use a flexible coping response', exact: true }).isVisible()) {
    const resilience = await page.evaluate(() => App.game.pow.stats.resilience);
    await click('Use a flexible coping response');
    assert.equal(await page.evaluate(() => App.game.pow.stats.resilience), resilience);
    assert.equal(await page.evaluate(() => POW.Solidarity.state(App.game).objectives.recovery), true);
    record('Actual pending non-graphic interview reconnects to the support network without a failure penalty', { resilience });
    await page.evaluate(() => POW.Captivity.close(App.game));
    await physicalInteraction('cell-door', { x: -.2, z: -1.05 });
    }
    const after = await page.evaluate(() => ({ count: App.game.pow.captivity.observations || 0, day: App.game.pow.day, tab: App.game.pow.captivity.tab, pendingEvent: App.game.pow.captivity.pendingEvent }));
    assert.equal(after.count, before + 1, 'Each physical door observation records its own day: ' + JSON.stringify(after));
  }
  await observeCorridor();
  await page.evaluate(() => { POW.Captivity.close(App.game); POW.Captivity.advance(App.game, 1440, 'routine'); App.game.pow.captivity.minute = 8 * 60; });
  await observeCorridor();
  await page.evaluate(() => POW.Captivity.close(App.game));
  const eligible = await page.evaluate(() => POW.RegularConfinement.eligibility(App.game));
  assert.equal(eligible.ready, true, 'Meaningful practiced projects, network objectives, observations, condition and elapsed days qualify a transfer: ' + JSON.stringify(eligible));
  record('Actual corridor observations plus recovered condition qualify regular confinement', { eligible, rested });
  // Root supplies this genuinely contextual physical cell-door action, whose
  // availability is computed by the same eligibility used above.
  await physicalInteraction('transfer-regular', { x: -.2, z: -1.05 });
  const transfer = await page.evaluate(() => ({ stage: App.game.pow.stage, complete: !!App.game.pow.complete, feet: App.game.evade.p.slice(), regular: POW.RegularConfinement.snapshot(App.game), actors: App.game.evade.searchers.map(a => a.id) }));
  assert.equal(transfer.stage, 'regular'); assert.equal(transfer.complete, false); assert.equal(transfer.regular.flags.cellOpen, false); assert.equal(transfer.actors.length, 4);
  record('Physical escorted transfer reaches another locked cell and retains real guards rather than awarding escape', transfer);

  await page.keyboard.down('w');
  const closed = await page.evaluate(() => {
    const g = App.game; g.evade.hdg = 0; for (let i = 0; i < 60; i++) POW.tick(g, .1);
    return { localZ: g.evade.p[2] - g.pow.base[2], cellOpen: g.pow.regular.flags.cellOpen, stage: g.pow.stage };
  });
  await page.keyboard.up('w'); assert.ok(closed.localZ > -2.95); assert.equal(closed.cellOpen, false); assert.equal(closed.stage, 'regular');
  record('New locked regular-confinement door stops actual long forward input', closed);
  const patrol = await page.evaluate(() => {
    const g = App.game, before = g.evade.searchers.map(a => a.p.slice());
    for (let i = 0; i < 80; i++) POW.tick(g, .1);
    return { moved: g.evade.searchers.some((a, i) => Math.hypot(a.p[0] - before[i][0], a.p[2] - before[i][2]) > .3), clear: g.evade.searchers.every(a => !POW.blocked(g, a.p[0], a.p[2], .30, a.p[1])), actors: g.evade.searchers.map(a => ({ id: a.id, p: a.p.slice(), state: a.state })) };
  });
  assert.equal(patrol.moved, true); assert.equal(patrol.clear, true); record('Regular compound patrols actually walk and stay outside solid structures', patrol);
  await physicalInteraction('regular-observe', { x: .62, z: -2.25 });
  assert.equal(await page.evaluate(() => App.game.pow.regular.flags.observed), true);
  assert.equal(await page.evaluate(() => App.game.pow.regular.clueSeen), true, 'Decoded network clue becomes useful observation guidance');
  await physicalInteraction('regular-cell-door', { x: 0, z: -2.3 });
  assert.equal(await page.evaluate(() => App.game.pow.regular.flags.cellOpen), true);
  await walk(0, -4.6, 'walk out during the supervised yard period');
  await page.evaluate(() => {
    const g = App.game, a = g.evade.searchers.find(a => /corridor/.test(a.id));
    if (a) g.evade.hdg = Math.atan2(a.p[0] - g.evade.p[0], -(a.p[2] - g.evade.p[2]));
  });
  await shot('regular-compound-live-guards');
  const lawful = await page.evaluate(() => ({ stage: App.game.pow.stage, suspicious: POW.RegularConfinement.isSuspicious(App.game), captures: App.game.pow.flags.recaptures || 0 }));
  assert.equal(lawful.stage, 'regular'); assert.equal(lawful.suspicious, false); record('Calm movement in the supervised yard is distinguished from suspicious escape work', lawful);

  // Declared happy-route duty fixture. Bodies, navigation, vision, hearing,
  // wall collision and capture remain live, but patrol homes move to the far
  // exterior corner after their ordinary patrol behavior has been verified.
  await page.evaluate(() => {
    window.__m21AwayDuty = function () {
      const g = App.game, b = g.pow.base;
      g.evade.searchers.forEach((a, i) => {
        const p = [b[0] + 25 + i % 2, b[1], b[2] + 1 + i];
        a.p = p.slice(); a.home = p.slice(); a.route = [p.slice(), [p[0], p[1], p[2] + .8]]; a.goal = a.route[0].slice();
        a.path = []; a.pathIndex = 0; a.wp = 0; a.state = 'patrol'; a.seen = 0; a.sus = 0; a.grab = 0; a.lastKnown = null; a.face = 0;
        a.schedule = { cycle: 10000, rounds: 9999, offset: 0 }; a.dwellUntil = 0;
      });
      g.pow.actors = g.evade.searchers; g.pow.noises = [];
    }; window.__m21AwayDuty();
  });
  await walk(-7, -5.5, 'walk around privacy wall'); await walk(-7, -17.5, 'reach trough quietly');
  await physicalInteraction('regular-trough-tool', { x: -6.8, z: -17.5 });
  assert.equal(await page.evaluate(() => App.game.pow.regular.inventory.tool), true);
  await walk(-7, -10, 'return around privacy wall'); await walk(8, -10, 'cross permitted yard'); await walk(8.8, -15, 'approach restricted workshop');
  await page.evaluate(() => {
    const g = App.game, b = g.pow.base, a = g.evade.searchers.find(a => /workshop/.test(a.id));
    a.p = [b[0] + 11.3, b[1], b[2] - 15]; a.home = a.p.slice(); a.route = [a.p.slice()]; a.goal = a.p.slice();
    a.path = []; a.state = 'patrol'; a.face = Math.PI / 2; a.seen = 0; a.sus = 0; a.lastKnown = null;
  });
  await hold(2.3, Math.PI / 2);
  const response = await page.evaluate(() => {
    const g = App.game, a = g.evade.searchers.find(a => /workshop/.test(a.id));
    return { state: a.state, lastKnown: a.lastKnown, p: a.p.slice(), clear: !POW.blocked(g, a.p[0], a.p[2], .30, a.p[1]), workshopOpen: g.pow.regular.flags.workshopOpen, stage: g.pow.stage, noiseEvents: g.pow.noiseSequence };
  });
  assert.equal(response.workshopOpen, false); assert.equal(response.clear, true); assert.equal(response.stage, 'regular'); assert.ok(['investigate','search','alert','pursue'].includes(response.state), 'Actual held latch work must produce a live guard response: ' + JSON.stringify(response));
  await shot('workshop-noise-investigation'); record('Real latch noise attracts a guard while the closed workshop wall still blocks passage', response);
  await page.evaluate(() => window.__m21AwayDuty());
  await physicalInteraction('regular-workshop-lock', { x: 8.8, z: -15 });
  assert.equal(await page.evaluate(() => App.game.pow.regular.flags.workshopOpen), true);
  await walk(11.5, -15, 'physically enter opened workshop'); await walk(20, -18.5, 'reach service hatch');
  for (let fastener = 1; fastener <= 3; fastener++) {
    await physicalInteraction('regular-hatch', { x: 20, z: -18.5 });
    assert.equal(await page.evaluate(() => App.game.pow.regular.hatchFasteners), fastener);
  }
  await walk(20, -22, 'walk through real loosened hatch');
  const checkpoint = await page.evaluate(() => {
    const g = App.game, snap = POW.save(g), before = { p: g.evade.p.slice(), regular: POW.RegularConfinement.snapshot(g), network: POW.Solidarity.state(g).known.slice() };
    POW.begin(g, snap.stage, JSON.parse(JSON.stringify(snap)));
    return { before, after: { p: g.evade.p.slice(), regular: POW.RegularConfinement.snapshot(g), network: POW.Solidarity.state(g).known.slice() } };
  });
  assert.deepEqual(checkpoint.after, checkpoint.before); record('Passage checkpoint restores actual physical position, all three fasteners and the prisoner network', checkpoint);
  await shot('regular-service-passage');
  await page.evaluate(() => window.__m21AwayDuty());
  await walk(20, -29.7, 'physically follow service passage to outside gate');
  await physicalInteraction('regular-exit-gate', { x: 20, z: -29.7 });
  assert.equal(await page.evaluate(() => App.game.pow.regular.flags.gateOpen), true);
  // Crossing the genuine boundary naturally installs the preserved Hanoi scene.
  // Once that transition occurs, stop walking rather than steering to the old
  // compound coordinate in the new scene.
  await page.keyboard.down('w');
  const exit = await page.evaluate(() => {
    const g = App.game; g.evade.hdg = 0; let steps = 0;
    for (; steps < 100 && g.pow.stage === 'regular'; steps++) POW.tick(g, .1);
    return { steps, stage: g.pow.stage, feet: g.evade.p.slice(), outside: g.pow.flags.outside, physicalEscape: g.pow.flags.regularEscape, complete: !!g.pow.complete, projects: g.pow.captivity.mindscape.completions, contacts: POW.Solidarity.state(g).known.slice() };
  });
  await page.keyboard.up('w');
  assert.equal(exit.stage, 'hanoi'); assert.equal(exit.outside, true); assert.equal(exit.physicalEscape, true); assert.equal(exit.complete, false); assert.ok(exit.steps > 0);
  await shot('subsequent-escape-hanoi');
  record('After real tools, three held fasteners, passage collision and the outer gate, actual movement reaches preserved Hanoi gameplay', exit);
}
