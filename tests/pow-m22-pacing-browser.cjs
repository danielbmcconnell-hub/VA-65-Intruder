'use strict';
// Real DOM, keyboard/CDP touch, guards, WebGL and persisted chapter saves.
// The standalone Solitary chapter is an explicit dated scenario. Camera aim
// and fixed gameplay time steps are fixtures; no answers, rewards, contact,
// guard behavior, condition, eligibility or success flags are written.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async function pacingBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'pow-m22-pacing');
  await fs.mkdir(out, { recursive: true });
  const checks = [], screenshots = [], browserErrors = [];
  for (const layout of [
    { name: 'desktop', viewport: { width: 1100, height: 650 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
  ]) {
    const context = await browser.newContext(layout), page = await context.newPage();
    const session = layout.hasTouch ? await context.newCDPSession(page) : null;
    const touch = (type, points = []) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(point => ({ ...point, radiusX: 7, radiusY: 7, force: 1 })) });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); browserErrors.push({ layout: layout.name, error: error.message }); });
    const panel = page.locator('#pow-captivity');
    const click = locator => layout.hasTouch ? locator.tap() : locator.click();
    const button = name => panel.getByRole('button', { name, exact: true });
    const tick = seconds => page.evaluate(seconds => { for (let i = 0; i < Math.ceil(seconds * 10); i++) App.game.stepEvade(Math.min(.1, seconds - i * .1)); }, seconds);
    const center = locator => locator.evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const record = (name, observed) => { checks.push({ name: layout.name + ': ' + name, passed: true, observed }); console.log('PASS m22-pacing ' + layout.name + ' ' + name); };
    const shot = async name => {
      await page.evaluate(() => { App.game.render(1 / 60); App.game.syncControls(); });
      const file = layout.name + '-' + name + '.png'; await page.screenshot({ path: path.join(out, file) }); screenshots.push('pow-m22-pacing/' + file);
    };
    async function frozen() {
      await page.waitForFunction(() => App.game?.pow?.stage === 'solitary' && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
      await page.evaluate(() => { App.screen = 'fixture'; App.game.paused = false; for (const key of Object.keys(App.keys)) App.keys[key] = 0; App.gctl.pitch = App.gctl.roll = 0; });
    }
    async function held(locator, seconds, physical = false) {
      await locator.scrollIntoViewIfNeeded();
      if (session) {
        const point = await center(locator); await touch('touchStart', [{ ...point, id: 8 }]);
        try { await tick(seconds); } finally { await touch('touchEnd'); await tick(.1); }
      } else if (physical) {
        await page.keyboard.down('f'); try { await tick(seconds); } finally { await page.keyboard.up('f'); await tick(.1); }
      } else {
        const point = await center(locator); await page.mouse.move(point.x, point.y); await page.mouse.down();
        try { await tick(seconds); } finally { await page.mouse.up(); await tick(.1); }
      }
    }
    async function environmental(id) {
      if (await panel.isVisible()) await click(button('Return to cell'));
      await page.evaluate(id => {
        const g = App.game, obj = g.pow.objects.find(value => value.id === id);
        if (!obj) throw new Error('Missing physical cell object ' + id);
        const dx = obj.p[0] - g.evade.p[0], dz = obj.p[2] - g.evade.p[2];
        g.evade.hdg = Math.atan2(dx, -dz); g.evade.look = Math.atan2(obj.p[1] - (g.evade.p[1] + 1.65), Math.max(.1, Math.hypot(dx, dz)));
      }, id);
      await tick(.1);
      const focus = await page.evaluate(() => ({ id: App.game.pow.focus?.id, hold: App.game.pow.focus?.hold || .15, prompt: POW.ui.prompt.textContent }));
      assert.equal(focus.id, id, 'A real aimed environmental prompt selects the object: ' + JSON.stringify(focus));
      await held(page.locator('#powHUD .pow-context-controls button:first-child'), focus.hold + .25, true);
      return focus;
    }
    async function inputPairs(pairs) {
      for (const pair of pairs) {
        if (pair.space) continue;
        for (const group of ['row', 'col']) for (let i = 0; i < pair[group]; i++) {
          const before = await page.evaluate(group => App.game.pow.captivity.tap.pair[group], group);
          await click(button(group === 'row' ? 'Tap row (+1)' : 'Tap column (+1)')); await tick(.3);
          let after = await page.evaluate(group => App.game.pow.captivity.tap.pair[group], group);
          if (after === before) {
            const wait = await page.evaluate(() => App.game.pow.captivity.inspectionUntil - App.game.pow.captivity.elapsedMinutes);
            assert.ok(wait > 0, 'A denied tap is explained by an actual guard inspection');
            await tick(wait + .5); await click(button(group === 'row' ? 'Tap row (+1)' : 'Tap column (+1)')); await tick(.3);
            after = await page.evaluate(group => App.game.pow.captivity.tap.pair[group], group);
          }
          assert.equal(after, before + 1, 'Every DOM tap contributes one counted hit');
        }
        await click(button('Commit this letter')); await tick(.2);
      }
    }
    async function receive() {
      await click(button('Listen / replay message'));
      const visible = await page.evaluate(() => {
        const pairs = []; let prior = '', lastGroup = '', steps = 0;
        for (; steps < 2400 && !App.game.pow.captivity.tap.playback?.done; steps++) {
          App.game.stepEvade(.1);
          const signal = document.querySelector('[data-tap-signal]').textContent;
          if (signal.includes('•') && signal !== prior) {
            const group = signal.startsWith('Row') ? 'row' : 'col';
            if (group === 'row' && lastGroup !== 'row') pairs.push({ row: 0, col: 0 });
            if (!pairs.length) throw new Error('Visible column pulse preceded a row');
            pairs[pairs.length - 1][group]++; lastGroup = group;
          }
          prior = signal;
        }
        return { pairs, steps, done: !!App.game.pow.captivity.tap.playback?.done };
      });
      assert.equal(visible.done, true); assert.ok(visible.pairs.length && visible.pairs.every(pair => pair.row > 0 && pair.row <= 5 && pair.col > 0 && pair.col <= 5));
      await inputPairs(visible.pairs); await click(button('Check complete word')); return visible;
    }
    async function send() {
      const control = panel.getByRole('button', { name: /^Transmit / }).first(), label = await control.textContent();
      const word = label.replace(/^Transmit /, ''); await click(control);
      const pairs = await panel.locator('table').evaluate((table, word) => {
        const rows = Array.from(table.querySelectorAll('tr')).slice(1).map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent));
        return [...word.toUpperCase()].filter(letter => /[A-Z]/.test(letter)).map(letter => {
          for (let row = 0; row < rows.length; row++) { const col = rows[row].findIndex(value => value.includes(letter)); if (col >= 0) return { row: row + 1, col: col + 1 }; }
          throw new Error('Transmit letter missing from the visible matrix: ' + letter);
        });
      }, word);
      await inputPairs(pairs); await click(button('Check complete word')); return { word, pairs };
    }
    async function untilPause() {
      return page.evaluate(() => {
        let frames = 0;
        for (; frames < 150 && App.game.pow.captivity.routine.active; frames++) App.game.stepEvade(.1);
        return { frames, active: App.game.pow.captivity.routine.active, day: App.game.pow.day, minute: App.game.pow.captivity.minute, status: POW.Captivity.pacingStatus(App.game), cycle: App.game.pow.flags.guardCycle || 0 };
      });
    }
    try {
      await page.addInitScript(() => {
        localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
        localStorage.setItem('a6_sawkeys', '1');
      });
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => window.POW && window.App && POW.Captivity?.pacingStart);
      await click(page.locator('#bootGo')); await click(page.locator('#powChapter [data-pow-chapter="solitary"]')); await frozen();
      const entry = await page.evaluate(() => ({ stage: App.game.pow.stage, practice: App.game.pow.practice, day: App.game.pow.day, captureDay: App.game.pow.captivity.captureDay, captureYear: App.game.pow.captivity.captureYear, status: POW.Captivity.pacingStatus(App.game), known: POW.Solidarity.state(App.game).known, rewards: App.game.pow.captivity.rewards, webgl: App.game.rend.gl.getParameter(App.game.rend.gl.VERSION) }));
      assert.equal(entry.day, 17); assert.equal(entry.captureDay, 1); assert.equal(entry.captureYear, 1967); assert.equal(entry.practice, 'solitary'); assert.equal(entry.status.ready, false);
      assert.deepEqual(entry.known, []); assert.deepEqual(entry.rewards, {}); assert.match(entry.webgl, /WebGL 2/);
      record('Dated Solitary practice opens with no pre-earned answers, projects, contacts or compression', entry);
      await shot('01-physical-cell');

      await environmental('cell-notebook'); await click(button('Memory')); await click(button('Show sequence'));
      const memory = await page.evaluate(() => {
        const pattern = []; let previous = -1, frames = 0;
        for (; frames < 160 && App.game.pow.captivity.memory.phase === 'show'; frames++) {
          App.game.stepEvade(.1); const tile = document.querySelector('[data-memory-position].pow-active'); const shown = tile ? Number(tile.dataset.memoryPosition) : -1;
          if (shown >= 0 && shown !== previous) pattern.push(shown); previous = shown;
        }
        return { pattern, frames, phase: App.game.pow.captivity.memory.phase };
      });
      assert.equal(memory.phase, 'answer'); assert.ok(memory.pattern.length >= 3);
      for (const position of memory.pattern) { await click(panel.locator('[data-memory-position="' + position + '"]')); await tick(.2); }
      assert.equal(await page.evaluate(() => App.game.pow.captivity.memory.round), 2);
      record('Observed and reproduced the real timed memory pattern through DOM tiles', memory);

      await click(button('Exercise / anchor')); await click(button('Begin gentle seated set'));
      for (const side of ['Left shoulder', 'Right shoulder', 'Left shoulder', 'Right shoulder', 'Left shoulder', 'Right shoulder', 'Left shoulder', 'Right shoulder']) { await click(button(side)); await tick(.2); }
      await held(panel.locator('[data-breath-hold]'), 3.2);
      const practice = await page.evaluate(() => ({ exercise: App.game.pow.captivity.exercise, rewards: App.game.pow.captivity.rewards, types: POW.Captivity.pacingStatus(App.game).projects, codeReflections: App.game.pow.captivity.code.reflections }));
      assert.equal(practice.exercise, null); assert.equal(practice.types, 2); assert.equal(practice.codeReflections, 0);
      record('Eight alternating presses and a real mouse/touch breathing hold complete the second activity without a faith requirement', practice);

      await click(button('Tap code')); const incoming = await receive(), outgoing = await send();
      const contact = await page.evaluate(() => ({ received: App.game.pow.captivity.tap.received, sent: App.game.pow.captivity.tap.sent, cursor: POW.Solidarity.state(App.game).cursor, known: POW.Solidarity.state(App.game).known.slice(), inspections: App.game.pow.flags.inspections || 0 }));
      assert.equal(contact.received, 1); assert.equal(contact.sent, 1); assert.equal(contact.cursor, 1); assert.deepEqual(contact.known, []);
      record('Counted actual visible row/column pulses and transmitted a real matrix-derived reply with live guards', { incoming, outgoing, contact });

      const meal = await environmental('cell-tray'); assert.equal(await page.evaluate(() => App.game.pow.captivity.pacing.meal), true);
      await environmental('cell-door');
      if (await button('Ask for water and a pause').isVisible()) { await click(button('Ask for water and a pause')); await environmental('cell-door'); }
      assert.equal(await page.evaluate(() => App.game.pow.captivity.observations), 1);
      await click(button('Rest / time')); await click(button('Rest up to two hours')); await tick(8.1);
      const earned = await page.evaluate(() => ({ status: POW.Captivity.pacingStatus(App.game), day: App.game.pow.day, sleeping: App.game.pow.captivity.sleeping, transfer: POW.RegularConfinement.eligibility(App.game), flags: App.game.pow.flags }));
      assert.equal(earned.status.ready, true); assert.equal(earned.day, 17); assert.equal(earned.sleeping, null); assert.ok(earned.status.restedMinutes >= 120); assert.equal(earned.transfer.ready, false);
      assert.equal(await panel.locator('[data-pacing-start]').isEnabled(), true);
      record('Held meal and corridor actions plus an elapsed rest interval earn compression before four weeks without earning transfer or escape', { meal, earned });
      await panel.locator('[data-pacing-progress]').scrollIntoViewIfNeeded(); await shot('02-earned-routine');

      const conditionBefore = await page.evaluate(() => ({ stats: { ...App.game.pow.stats }, minute: App.game.pow.captivity.elapsedMinutes }));
      await click(panel.locator('[data-pacing-start]'));
      const started = await page.evaluate(() => ({ stats: { ...App.game.pow.stats }, minute: App.game.pow.captivity.elapsedMinutes, mode: App.game.pow.captivity.routine.mode }));
      assert.deepEqual(started.stats, conditionBefore.stats); assert.equal(started.minute, conditionBefore.minute); assert.equal(started.mode, 'earned');
      await tick(.3); await click(panel.locator('[data-pacing-stop]'));
      const paused = await page.evaluate(() => ({ routine: { ...App.game.pow.captivity.routine }, skipped: App.game.pow.captivity.pacing.totalDays }));
      assert.equal(paused.routine.active, false); assert.ok(paused.routine.elapsed > 0 && paused.routine.elapsed < 1);
      await tick(.5); assert.equal(await page.evaluate(() => App.game.pow.captivity.routine.elapsed), paused.routine.elapsed);
      record('Starting compression gives no instant condition gain; the visible Pause action retains the unfinished interval', paused);

      await click(button('Return to cell')); await click(page.locator('#powHUD .pow-tools').getByRole('button', { name: 'Save', exact: true }));
      const saved = await page.evaluate(() => POW.ctx.Store.get('pow_checkpoint:solitary', null));
      assert.equal(saved.practice, 'solitary'); assert.equal(saved.captivity.routine.active, false);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }); await page.waitForFunction(() => window.App && window.POW);
      await click(page.locator('#bootGo')); await click(page.locator('#powChapter summary').filter({ hasText: 'Saved chapters' }));
      await click(page.locator('#powChapter').getByRole('button', { name: 'Resume Solitary survival', exact: true })); await frozen();
      const restored = await page.evaluate(() => ({ day: App.game.pow.day, stats: { ...App.game.pow.stats }, routine: { ...App.game.pow.captivity.routine }, pacing: { ...App.game.pow.captivity.pacing }, rewards: { ...App.game.pow.captivity.rewards }, received: App.game.pow.captivity.tap.received, sent: App.game.pow.captivity.tap.sent, touch: App.game.pow.touchInteract }));
      assert.equal(restored.day, saved.day); assert.equal(restored.routine.active, false); assert.equal(restored.routine.elapsed, saved.captivity.routine.elapsed);
      assert.equal(restored.pacing.totalDays, saved.captivity.pacing.totalDays); assert.deepEqual(restored.rewards, saved.captivity.rewards);
      assert.equal(restored.received, saved.captivity.tap.received); assert.equal(restored.sent, saved.captivity.tap.sent); assert.equal(restored.touch, false);
      for (const key of Object.keys(saved.stats)) assert.ok(Math.abs(restored.stats[key] - saved.stats[key]) < .05, 'Restored ' + key + ' retains saved condition within the short startup timestep');
      record('The real Save and Ready Room Resume controls restore the same condition, contacts and remaining earned interval after page reload', { savedDay: saved.day, restored, tolerance: .05 });

      await environmental('cell-bed'); await click(panel.locator('[data-pacing-start]')); const message = await untilPause();
      assert.equal(message.active, false); assert.equal(message.day, 19); assert.equal(message.minute, 480); assert.equal(message.status.pause.kind, 'message');
      assert.equal(await panel.locator('[data-pacing-start]').isEnabled(), false);
      record('Resumed time stops exactly at the morning wall exchange and waits for player input', message);
      await panel.locator('[data-pacing-notice]').scrollIntoViewIfNeeded(); await shot('03-message-interruption');
      await click(panel.locator('[data-pacing-review]')); await receive();
      const learned = await page.evaluate(() => ({ known: POW.Solidarity.state(App.game).known.slice(), status: POW.Captivity.pacingStatus(App.game), received: App.game.pow.captivity.tap.received }));
      assert.deepEqual(learned.known, ['denton']); assert.equal(learned.received, 2); assert.equal(learned.status.pause, null);
      record('Review leads to an actual counted Denton identification; elapsed time alone never reveals his identity', learned);

      await click(button('Rest / time')); await click(panel.locator('[data-pacing-start]')); const guard = await untilPause();
      assert.equal(guard.active, false); assert.equal(guard.day, 21); assert.equal(guard.status.pause.kind, 'guard'); assert.ok(guard.cycle > 0);
      const beforeDefer = await page.evaluate(() => ({ observations: App.game.pow.captivity.observations, received: App.game.pow.captivity.tap.received, flags: { ...App.game.pow.flags }, routine: { ...App.game.pow.captivity.routine } }));
      await click(panel.locator('[data-pacing-defer]'));
      const deferred = await page.evaluate(() => ({ observations: App.game.pow.captivity.observations, received: App.game.pow.captivity.tap.received, status: POW.Captivity.pacingStatus(App.game), transfer: POW.RegularConfinement.eligibility(App.game) }));
      assert.equal(deferred.observations, beforeDefer.observations); assert.equal(deferred.received, beforeDefer.received); assert.equal(deferred.status.pause, null); assert.equal(deferred.transfer.ready, false);
      record('Changed guard duty interrupts the routine; keeping its clue for later gives no observation, contact or escape credit', { guard, deferred });
      await panel.locator('[data-pacing-progress]').scrollIntoViewIfNeeded(); await shot('04-changed-duty');

      assert.deepEqual(errors, []); const gl = await page.evaluate(() => { App.game.render(1 / 60); return App.game.rend.gl.getError(); }); assert.equal(gl, 0);
      record('Earned pacing and restored touch/desktop gameplay finish without JavaScript or WebGL errors', { errors, glError: gl });
    } catch (error) {
      const state = await page.evaluate(() => ({ day: App.game?.pow?.day, stage: App.game?.pow?.stage, focus: App.game?.pow?.focus?.id, captivity: App.game?.pow?.captivity, feet: App.game?.evade?.p, active: document.activeElement?.outerHTML?.slice(0, 300) })).catch(() => null);
      await fs.writeFile(path.join(out, layout.name + '-failure-state.json'), JSON.stringify({ error: String(error), state }, null, 2) + '\n');
      await page.screenshot({ path: path.join(out, layout.name + '-failure.png') }).catch(() => {}); throw error;
    } finally {
      await fs.writeFile(path.join(out, 'partial-checks.json'), JSON.stringify({ checks, screenshots, browserErrors }, null, 2) + '\n'); await context.close();
    }
  }
  const report = { suite: 'milestone-2.2-pacing', checks, screenshots, browserErrors,
    scope: 'Actual Chromium WebGL2 in desktop and DPR3 iPhone-size touch layouts. Named Solitary practice is a declared dated scenario; orientation and fixed real gameplay timesteps are fixtures. Memory answers are observed from rendered DOM pulses, incoming taps are counted from visible row/column pulses, outgoing taps use the displayed alphabet grid, meals and observation use held contextual actions, rest consumes elapsed time, and Save/Resume survives a real page reload. No gameplay methods, AI, answers, reward/contact/eligibility/success flags or condition are replaced or pre-awarded. Physical Windows hardware, physical iPhone Safari and human difficulty balance remain untested.' };
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n'); return report;
};
