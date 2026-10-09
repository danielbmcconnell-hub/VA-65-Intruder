'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

// An isolated encounter fixture starts in the regular compound. Only a guard's
// patrol location is seeded; detection, pursuit, contact and recapture are live.
module.exports = async function (browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'pow-m21-recapture');
  await fs.mkdir(out, { recursive: true });
  const checks = [], screenshots = [], browserErrors = [];
  for (const layout of [
    { name: 'desktop', viewport: { width: 1100, height: 650 } },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
  ]) {
    const { name, ...options } = layout;
    const context = await browser.newContext(options), page = await context.newPage();
    const errors = []; page.on('pageerror', e => { errors.push(e.message); browserErrors.push({ layout: name, error: e.message }); });
    const record = (label, observed) => { checks.push({ name: name + ': ' + label, passed: true, observed }); console.log('PASS m21 recapture ' + name + ' ' + label); };
    const tick = n => page.evaluate(n => { for (let i = 0; i < n; i++) POW.tick(App.game, .1); }, n);
    const walk = async z => {
      await page.keyboard.down('w');
      try {
        return await page.evaluate(z => {
          const g = App.game, goal = g.pow.base[2] + z; g.evade.hdg = 0;
          for (let n = 0; n < 600 && g.evade.p[2] - goal > .04; n++) POW.tick(g, Math.min(.1, (g.evade.p[2] - goal) / 1.8));
          if (Math.abs(g.evade.p[2] - goal) > .05) throw Error('Actual movement could not reach the yard approach');
          return g.evade.p.slice();
        }, z);
      } finally { await page.keyboard.up('w'); }
    };
    try {
      await page.addInitScript(() => { localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 })); localStorage.setItem('a6_sawkeys', '1'); });
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.App && window.POW?.RegularConfinement);
      await page.evaluate(() => App.startPOW());
      await page.waitForFunction(() => App.game?.pow && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
      await page.evaluate(() => { App.screen = 'fixture'; POW.begin(App.game, 'regular'); App.game.paused = false; for (const key of Object.keys(App.keys)) App.keys[key] = false; App.gctl.pitch = App.gctl.roll = 0; });
      await walk(-2.25);
      await page.keyboard.down('f'); await tick(20); await page.keyboard.up('f'); await tick(1);
      assert.equal(await page.evaluate(() => App.game.pow.regular.flags.cellOpen), true);
      await walk(-4.7);
      const lawful = await page.evaluate(() => ({ stage: App.game.pow.stage, suspicious: POW.RegularConfinement.isSuspicious(App.game), p: App.game.evade.p.slice() }));
      assert.equal(lawful.stage, 'regular'); assert.equal(lawful.suspicious, false);
      record('Genuine movement and held door work reach the permitted supervised yard', lawful);
      await page.evaluate(() => {
        const g = App.game, b = g.pow.base;
        g.evade.searchers.forEach((a, i) => {
          const p = i === 0 ? [b[0], b[1], b[2] - 6.4] : [b[0] + 24 + i, b[1], b[2] + 2];
          a.p = p.slice(); a.home = p.slice(); a.route = [p.slice()]; a.goal = p.slice(); a.path = []; a.pathIndex = 0; a.wp = 0;
          a.state = 'patrol'; a.face = Math.PI; a.seen = 0; a.sus = 0; a.grab = 0; a.lastKnown = null; a.dwellUntil = 0; a.senseAt = 0;
        }); g.pow.noises = [];
      });
      await page.keyboard.down('Shift'); await page.keyboard.down('w');
      const encounter = await page.evaluate(() => {
        const g = App.game, states = [], start = g.pow.flags.recaptures || 0, guard = g.evade.searchers[0];
        let steps = 0, pursuit = false, wanted = false, clear = true;
        for (; steps < 180 && g.pow.stage === 'regular'; steps++) {
          POW.tick(g, .1); states.push(guard.state); pursuit ||= guard.state === 'pursuit';
          wanted ||= (g.pow.regular?.wantedUntil || 0) > g.pow.time;
          clear &&= !POW.blocked(g, guard.p[0], guard.p[2], .30, guard.p[1]);
        }
        return { steps, states: [...new Set(states)], pursuit, wanted, clear, stage: g.pow.stage, recaptures: g.pow.flags.recaptures || 0, previousRecaptures: start, p: g.evade.p.slice(), cellSolids: g.pow.solids.length };
      });
      await page.keyboard.up('w'); await page.keyboard.up('Shift');
      assert.equal(encounter.pursuit, true); assert.equal(encounter.wanted, true); assert.equal(encounter.clear, true);
      record('Visible suspicious running causes actual guard pursuit with collision and alert memory', encounter);
      assert.equal(encounter.stage, 'solitary'); assert.equal(encounter.recaptures, encounter.previousRecaptures + 1); assert.ok(encounter.steps > 0 && encounter.steps < 180);
      record('Sustained physical guard contact causes recapture into the actual solitary cell', encounter);
      await page.evaluate(() => { App.game.render(1 / 60); App.game.syncControls(); });
      const image = name + '-recaptured-cell.png'; await page.screenshot({ path: path.join(out, image) }); screenshots.push('pow-m21-recapture/' + image);
      const restoration = await page.evaluate(() => {
        const g = App.game, snap = POW.save(g), before = { p: g.evade.p.slice(), recaptures: g.pow.flags.recaptures, stage: g.pow.stage };
        POW.begin(g, snap.stage, JSON.parse(JSON.stringify(snap)));
        const after = { p: g.evade.p.slice(), recaptures: g.pow.flags.recaptures, stage: g.pow.stage };
        // Isolated re-entry tests lock reset; it does not claim a qualified camp transfer.
        POW.begin(g, 'regular');
        return { before, after, cellOpen: g.pow.regular.flags.cellOpen, fasteners: g.pow.regular.hatchFasteners, tool: g.pow.regular.inventory.tool, attempts: g.pow.regular.attempts, gl: g.rend.gl.getError() };
      });
      assert.deepEqual(restoration.after, restoration.before); assert.equal(restoration.cellOpen, false); assert.equal(restoration.fasteners, 0); assert.equal(restoration.tool, false); assert.equal(restoration.attempts, 1); assert.equal(restoration.gl, 0); assert.deepEqual(errors, []);
      record('Recapture checkpoint restores position and count; a fresh camp attempt restores secure barriers', restoration);
    } finally { await context.close(); }
  }
  return { checks, screenshots, browserErrors, scope: 'Actual Chromium WebGL2 isolated encounters in desktop and phone layouts. Regular-stage entry and near-player patrol location are declared fixtures. Real keyboard walking/running, held door interaction, detection, pursuit, collision, capture and checkpoint restoration execute unchanged gameplay. This is not a human balance test or physical Safari.' };
};
