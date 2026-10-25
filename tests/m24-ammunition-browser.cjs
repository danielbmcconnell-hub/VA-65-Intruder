'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), { createHash } = require('node:crypto');
const openPowTools = require('./helpers/pow-tools.cjs');

// Native keyboard/touch inputs, real ejection and physical weapon code. Dry
// terrain aircraft placement and absent encounter spawns are declared fixtures
// to isolate accepted shots from random first-contact violence and capture.
module.exports = async function ammunitionBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'm24-ammunition'); await fs.mkdir(out, { recursive: true });
  const results = [], screenshots = [];
  for (const profile of [{ name: 'desktop', viewport: { width: 1280, height: 720 } }, { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]) {
    const { name, ...options } = profile, context = await browser.newContext(options), page = await context.newPage(), errors = [], badAssets = [];
    const record = (title, actual, fixture) => { results.push({ profile: name, name: title, passed: true, actual, fixture }); console.log('PASS ammunition ' + name + ' ' + title); };
    page.setDefaultTimeout(90000); page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (r.status() >= 400 && /\/assets\//.test(r.url())) badAssets.push(r.url()); });
    await context.addInitScript(() => { localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 })); localStorage.setItem('a6_sawkeys', '1'); });
    const click = locator => profile.hasTouch ? locator.tap() : locator.click();
    const ledger = () => page.evaluate(() => ({ ...SurvivalAmmunition.view(App.game), rounds: App.game.evade?.rounds, mode: App.game.evade?.weaponMode, drawn: App.game.evade?.drawn }));
    const tick = seconds => page.evaluate(seconds => { const g = App.game; for (let i = 0; i < Math.ceil(seconds * 60); i++) { g.t += 1 / 60; g.stepEvade(1 / 60); } g.syncControls(); g.render(1 / 60); }, seconds);
    async function select(mode) { if (profile.hasTouch) { await click(page.locator({ pistol: '#btnPistol', knife: '#btnKnife', fists: '#btnPunch' }[mode])); await tick(1 / 60); } else { const key = { pistol: 'f', knife: 'v', fists: 'p' }[mode]; await page.keyboard.down(key); try { await tick(1 / 60); } finally { await page.keyboard.up(key); } } }
    async function fire(seconds = 1 / 60) { if (profile.hasTouch) { await click(page.locator('#btnFire')); await tick(seconds); } else { const box=await page.locator('#gl').boundingBox();assert.ok(box,'Actual game canvas must receive primary pointer attacks');await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();try { await tick(seconds); } finally { await page.mouse.up(); } } }
    async function shot(key) { const file = name + '-' + key + '.png'; assert.equal(await page.evaluate(() => App.rend.gl.getError()), 0); await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('m24-ammunition/' + file); }
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' }), sourceSHA256 = createHash('sha256').update(await response.body()).digest('hex');
      await page.waitForFunction(() => window.App && window.SurvivalAmmunition); await click(page.locator('#bootGo'));
      await page.evaluate(() => App.start(MISSIONS.find(m => m.id === 'm2')));
      await page.waitForFunction(() => App.game?.st && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
      const fixture = await page.evaluate(() => {
        App.frame = () => {}; App.screen = 'game'; const g = App.game, t = g.world.briefed; g.paused = false; let p;
        for (let r = 900; r < 6000 && !p; r += 160) for (let a = 0; a < TAU && !p; a += PI / 8) {
          const x = t[0] + Math.sin(a) * r, z = t[2] + Math.cos(a) * r, h = terrainH(x, z);
          if (h > 8 && !g._localSolidAt(x, z, .5) && Math.abs(terrainH(x + 10, z - 10) - h) < 2) p = [x, h, z];
        }
        if (!p) throw Error('No dry landing fixture'); g.ac.p = [p[0], p[1] + 110, p[2]]; g.ac.v = [0, 0, 0]; g.ac.onDeck = false; g.phase = 'airborne';
        for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on');
        return { aircraft: g.ac.p.slice(), velocity: g.ac.v.slice(), mission: g.mis.id };
      });
      // Existing button handlers are native even with the frame scheduler stopped. They
      // perform the real two-tap eject confirmation and parachute simulation.
      if (profile.hasTouch) { await click(page.locator('#btnEject')); await click(page.locator('#btnEject')); }
      else { await page.evaluate(() => App.screen = 'game'); await page.keyboard.press('j'); await page.keyboard.press('j'); await page.evaluate(() => App.screen = 'game'); }
      const descent = await page.evaluate(() => { const g = App.game; g.paused = false; let frames = 0; while (g.phase === 'chute' && frames++ < 4800) g.update(1 / 60); g.paused = false; g.render(1 / 60); g.syncControls(); return { frames, phase: g.phase, ejected: g.ejected }; });
      assert.equal(descent.phase, 'evade'); assert.equal(descent.ejected, true);
      if (await page.locator('#captVeil.on').count()) {
        const run = page.locator('#captBody').getByRole('button', { name: 'Run', exact: true });
        await click(await run.count() ? run : page.locator('#captBody').getByRole('button', { name: 'Run for the treeline', exact: true }));
        await click(page.locator('#captBody').getByRole('button', { name: 'Go on', exact: true }));
      }
      await page.evaluate(() => { const g = App.game, e = g.evade; e.searchers = []; e.locals = []; e.cattle = []; e.spawn = e.localRefill = e.cowT = 1e9; g.wreck = null; for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on'); g.syncControls(); g.render(1 / 60); });
      assert.equal((await ledger()).remaining, 6); assert.equal((await ledger()).bulletsExpended, 0);
      record('Real parachute landing issues six finite rounds and a zero expenditure ledger', { fixture, descent, ledger: await ledger(), sourceSHA256, webgl: await page.evaluate(() => App.rend.gl.getParameter(App.rend.gl.VERSION)) }, 'Aircraft position/velocity and absent countryside encounters isolate ammunition; existing Run/Go on cards spend no ammunition. No shot/hit/capture result is assigned.');

      await fire(.2); assert.equal((await ledger()).remaining, 6); assert.equal((await ledger()).bulletsExpended, 0);
      record('An attack while the revolver is holstered spends no ammunition', await ledger(), 'Original initial fists mode and native attack input before drawing.');
      await select('pistol'); assert.equal((await ledger()).drawn, true);
      if(!profile.hasTouch){const before=await ledger();await page.keyboard.down('Space');try{await tick(.25)}finally{await page.keyboard.up('Space')}await tick(.1);const after=await ledger();assert.equal(after.remaining,before.remaining);assert.equal(after.bulletsExpended,before.bulletsExpended);assert.equal(after.mode,'pistol');record('Space uses the free hand without firing the carried revolver',{before,after},'Actual held Space and release while the revolver remains selected; only primary canvas Attack fires it.');}
      await fire(); const first = await ledger(); assert.equal(first.remaining, 5); assert.equal(first.pistolShots, 1); assert.equal(first.bulletsExpended, 1);
      record('Native draw and fire count an accepted missed round exactly once', first, profile.hasTouch ? 'Actual touchscreen Pistol/FIRE buttons; no target is in sight.' : 'Actual F selection and primary canvas mouse trigger; no target is in sight.');
      await fire(.2); assert.equal((await ledger()).bulletsExpended, 1); assert.equal((await ledger()).remaining, 5);
      await page.evaluate(() => { const g = App.game; for (let i = 0; i < 4; i++) { g.syncControls(); g.render(1 / 60); } }); assert.equal((await ledger()).bulletsExpended, 1);
      record('Trigger cooldown and repeated actual renders do not spend or duplicate a shot', await ledger(), 'A second real trigger within .85 seconds, then four original renderer/control refreshes.');
      // Queued primary FIRE is consumed by its real cooldown. Let that same
      // queued trigger complete, then use distinct native taps for the rest.
      await tick(.9); let shots = (await ledger()).pistolShots;
      while (shots < 6) { await fire(); await tick(.9); shots = (await ledger()).pistolShots; }
      const empty = await ledger(); assert.equal(empty.remaining, 0); assert.equal(empty.pistolShots, 6); assert.equal(empty.bulletsExpended, 6);
      const hud = await page.evaluate(() => { const g = App.game, ctx = g.hud.g, native = ctx.fillText, text = []; ctx.fillText = function (...args) { text.push(String(args[0])); return native.apply(this, args); }; try { g.render(1 / 60); } finally { ctx.fillText = native; } return { text, state: g.st.ammunition }; });
      assert.ok(hud.text.includes('SPENT') && hud.text.includes('6 ROUNDS'), 'Actual HUD canvas must draw the live expenditure counter'); assert.equal(hud.state.remaining, 0); assert.equal(hud.state.bulletsExpended, 6);
      await shot('six-rounds-expended-hud'); record('Six actual accepted missed shots empty the revolver and draw the live HUD counter', { ...empty, hud, pistolButton: await page.locator('#btnPistol').textContent() }, 'Native firing inputs and fixed-step cooldown advancement, no inventory assignment. Canvas text instrumentation forwards every original drawing call.');
      await fire(.95); assert.equal((await ledger()).remaining, 0); assert.equal((await ledger()).pistolShots, 6);
      await select('knife'); await fire(.95); await select('fists'); await fire(.95); assert.equal((await ledger()).pistolShots, 6); assert.equal((await ledger()).bulletsExpended, 6);
      record('Empty-trigger, carried knife and fists never add bullets expended', await ledger(), 'Actual empty trigger and native knife/fists selection with subsequent attack inputs.');

      await page.evaluate(() => {App.game.captured();App.game.paused=false;for(let i=0;i<780;i++)App.game.update(1/60);}); await page.waitForFunction(() => App.game?.pow?.stage === 'solitary'&&!CaptureTransition.active(App.game), null, { timeout: 15000 });
      await page.evaluate(() => { App.frame = () => {}; App.screen = 'game'; App.game.paused = false; App.game.render(1 / 60); App.game.syncControls(); });
      const captured = await ledger(); assert.equal(captured.bulletsExpended, 6); assert.equal(captured.remaining, 0); assert.equal(captured.hasPistol, false);
      await openPowTools(page, click);
      await click(page.locator('#powHUD .pow-tools button').filter({ hasText: /^Save$/ }));
      const checkpoint = await page.evaluate(() => Store.get('pow_checkpoint', null)); assert.equal(checkpoint.ammunition.bulletsExpended, 6); assert.equal(checkpoint.sortie.missionId, 'm2'); assert.equal(checkpoint.sortie.context.captured, true); assert.equal(checkpoint.sortie.context.ejected, true);
      record('Actual capture confiscates equipment while Save retains the completed shot ledger', { captured, saved: checkpoint.ammunition }, 'Real Game.captured and thirteen seconds of original fixed-step transfer/reveal; native Save control.');
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.App && window.SurvivalAmmunition); await click(page.locator('#bootGo'));
      await click(page.locator('#powChapter button').filter({ hasText: /^Continue POW checkpoint$/ }));
      await page.waitForFunction(() => App.game?.pow?.stage === 'solitary' && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
      await page.evaluate(() => { App.frame = () => {}; App.screen = 'game'; App.game.paused = false; App.game.render(1 / 60); App.game.syncControls(); });
      const restored = await ledger(); assert.equal(restored.bulletsExpended, 6); assert.equal(restored.pistolShots, 6); assert.equal(restored.remaining, 0); assert.equal(restored.hasPistol, false);
      const sortie = await page.evaluate(() => ({ mission: App.game.mis.id, captured: !!App.game._capt, ejected: !!App.game.ejected, bombs: App.game.ac.bombs, dropped: App.game.world.score.dropped, total: App.game.world.score.total }));
      assert.equal(sortie.mission, 'm2'); assert.equal(sortie.captured, true); assert.equal(sortie.ejected, true); assert.equal(sortie.bombs, checkpoint.sortie.stores.bombs); assert.equal(sortie.dropped, checkpoint.sortie.score.dropped); assert.equal(sortie.total, checkpoint.sortie.score.total);
      record('Reload and native Continue restore original sortie and expenditure without restoring confiscated rounds', { ...restored, sortie }, 'Same browser storage, actual checkpoint restore into physical solitary; Mission2 remains Mission2 with its recorded aircraft stores and capture/ejection context.');
      const debrief = await page.evaluate(() => { const g = App.game; g.debrief(false, 'Ammunition regression: captivity chapter intentionally ended.'); return { text: document.getElementById('debriefBody').textContent, log: Store.get('log', []).at(-1) }; });
      assert.match(debrief.text, /Pistol rounds expended\s*6/); assert.equal(debrief.log.bulletsExpended, 6); assert.equal(debrief.log.pistolShots, 6); assert.equal(debrief.log.id, 'm2'); assert.equal(debrief.log.captured, true); assert.equal(debrief.log.ejected, true);
      await shot('ammunition-captivity-debrief'); record('Actual debrief and stored Cruise Log retain the six expended rounds after capture and reload', debrief, 'Real debrief of an intentionally incomplete captured sortie; no successful release or rescue claim.');
      await click(page.locator('#debriefBody').getByRole('button', { name: 'Ready Room', exact: true })); await click(page.locator('#tabs [data-tab="log"]'));
      const cruise = await page.locator('#readyBody').textContent(); assert.match(cruise, /6.*(?:round|bullet)|(?:round|bullet).*6/i); record('Cruise Log visibly reports the stored ammunition expenditure', { text: cruise }, 'Native Ready Room and Cruise Log UI.');
      assert.deepEqual(errors, []); assert.deepEqual(badAssets, []); record('No uncaught errors or missing assets across ammunition, capture, restore and report', { errors, badAssets }, 'Actual Chromium WebGL2 desktop/touch layout execution.');
    } catch (error) { await shot('FAIL').catch(() => {}); throw error; } finally { await context.close(); }
  }
  return { suite: 'm24-ammunition', results, total: results.length, screenshots, passed: true, physicalWindowsTested: false, actualIPhoneSafariTested: false, scope: 'Real Chromium WebGL2, native keyboard/touch controls, original ejection and weapon simulation; declared dry-ground/encounter-isolation fixtures. No physical Windows or iPhone Safari validation.' };
};
