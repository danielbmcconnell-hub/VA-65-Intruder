'use strict';

// The runner owns the server and actual Chromium/WebGL2 browser. Keyboard and
// CDP touchscreen events drive the original Game/POW methods; tutorial flags and
// successful interactions are never written by a fixture.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const openPowTools = require('./helpers/pow-tools.cjs');

module.exports = async function onboardingBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'pow-m22-onboarding');
  await fs.mkdir(out, { recursive: true });
  const checks = [], screenshots = [], browserErrors = [], sourceHashes = [];
  if (process.env.INTRUDER_M22_LAYOUT && !['desktop','iphone-layout-chromium'].includes(process.env.INTRUDER_M22_LAYOUT)) throw new Error('Unknown onboarding browser layout');
  for (const layout of [
    { name: 'desktop', viewport: { width: 1100, height: 650 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
  ].filter(layout => !process.env.INTRUDER_M22_LAYOUT || process.env.INTRUDER_M22_LAYOUT === layout.name)) {
    const context = await browser.newContext(layout), page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); browserErrors.push({ layout: layout.name, error: error.message }); });
    const session = layout.hasTouch ? await context.newCDPSession(page) : null;
    const touch = (type, points = []) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p, radiusX: 7, radiusY: 7, force: 1 })) });
    const record = (name, observed) => {
      checks.push({ name: layout.name + ': ' + name, passed: true, observed });
      console.log('PASS m22-onboarding ' + layout.name + ' ' + name);
    };
    const click = async locator => { await page.evaluate(() => { if (window.App?.screen === 'ready' && window.__onboardingNativeFrame && App.frame !== window.__onboardingNativeFrame) { App.frame = window.__onboardingNativeFrame; requestAnimationFrame(t => App.frame(t)); } }); return layout.hasTouch ? locator.tap() : locator.click(); };
    const tick = seconds => page.evaluate(seconds => {
      const count = Math.ceil(seconds * 20);
      for (let i = 0; i < count; i++) App.game.stepEvade(Math.min(.05, seconds - i * .05));
    }, seconds);
    const center = selector => page.locator(selector).evaluate(node => {
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };
    });
    const screenshot = async name => {
      await page.evaluate(() => { if (App.game) { App.game.render(1 / 60); App.game.syncControls(); } });
      const file = layout.name + '-' + name + '.png';
      await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('pow-m22-onboarding/' + file);
    };
    async function heldKey(key, seconds) {
      await page.keyboard.down(key); try { await tick(seconds); } finally { await page.keyboard.up(key); await tick(.2); }
    }
    async function heldAction(seconds, beforeRelease) {
      if (!session) {
        await page.keyboard.down('f');
        try { await tick(seconds); if (beforeRelease) await beforeRelease(); }
        finally { await page.keyboard.up('f'); await tick(.2); }
        return;
      }
      const point = await center('#powHUD .pow-context-controls button:first-child');
      await touch('touchStart', [{ x: point.x, y: point.y, id: 8 }]);
      try { await tick(seconds); if (beforeRelease) await beforeRelease(); } finally { await touch('touchEnd'); await tick(.2); }
    }
    async function touchMove(seconds, ratio = .68) {
      await page.evaluate(() => App.game.syncControls()); const stick = await center('#stick');
      await touch('touchStart', [{ x: stick.x, y: stick.y, id: 1 }]);
      await touch('touchMove', [{ x: stick.x, y: stick.y - (stick.width / 2 - 10) * ratio, id: 1 }]);
      try { await tick(seconds); } finally { await touch('touchEnd'); await tick(.2); }
    }
    async function walkTo(x, z, max = 1800) {
      await page.keyboard.down('w');
      let actual;
      try {
        actual = await page.evaluate(({ x, z, max }) => {
          const g = App.game, base = g.pow.base, tx = base[0] + x, tz = base[2] + z; let steps = 0;
          for (; steps < max; steps++) {
            const dx = tx - g.evade.p[0], dz = tz - g.evade.p[2], distance = Math.hypot(dx, dz);
            if (distance < .02) break;
            g.evade.hdg = Math.atan2(dx, -dz); g.stepEvade(Math.min(.05, distance / 2.05));
          }
          return { p: g.evade.p.slice(), distance: Math.hypot(tx - g.evade.p[0], tz - g.evade.p[2]), stage: g.pow.stage, steps };
        }, { x, z, max });
      } finally { await page.keyboard.up('w'); }
      assert.ok(actual.distance < .035, 'Actual movement must reach the interaction approach: ' + JSON.stringify(actual)); return actual;
    }
    try {
      await page.addInitScript(() => {
        localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
        localStorage.setItem('a6_sawkeys', '1');
        window.__m22ToolEvents = [];
        for (const type of ['pointerdown','pointerup','touchstart','touchend','click']) document.addEventListener(type, event => {
          if (event.target.closest && event.target.closest('#powHUD .pow-tools')) {
            window.__m22ToolEvents.push({ type, target: event.target.textContent, time: performance.now(), trusted: event.isTrusted });
            if (window.__m22ToolEvents.length > 30) window.__m22ToolEvents.shift();
          }
        }, true);
      });
      const coreResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/assets/pow/core.js'));
      const entryResponse = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const coreLoaded = await coreResponse;
      sourceHashes.push({ layout: layout.name, entrySHA256: createHash('sha256').update(await entryResponse.body()).digest('hex'), coreSHA256: createHash('sha256').update(await coreLoaded.body()).digest('hex') });
      await page.waitForFunction(() => window.App && window.POW && POW.Guidance, null, { timeout: 30000 });
      await click(page.locator('#bootGo'));
      await verifyChapterEntries({ page, click, tick, screenshot, record });
      await verifyTutorial({ page, click, tick, heldKey, heldAction, touchMove, touch, center, walkTo, screenshot, record, layout });
      await verifyPreciseTargets({ page, click, tick, heldKey, heldAction, touch, walkTo, screenshot, record, layout });
      await verifyPracticeAccounting({ page, click, tick, screenshot, record });
      assert.deepEqual(errors, [], 'The onboarding browser sequence must have no uncaught JavaScript errors');
      const gl = await page.evaluate(() => { App.game.render(1 / 60); return App.game.rend.gl.getError(); }); assert.equal(gl, 0);
      record('New entries, controls and onboarding finish without JavaScript or WebGL errors', { errors, glError: gl });
    } catch (error) {
      const state = await page.evaluate(() => ({ screen: App.screen, stage: App.game?.pow?.stage, p: App.game?.evade?.p, guidance: App.game?.pow?.guidance, saved: POW.ctx.Store.get('pow_checkpoint', null), toolEvents: window.__m22ToolEvents, saveHit: window.__m22SaveHit, focus: App.game?.pow?.focus?.id, held: App.game?.pow?.holding, keys: App.keys, gctl: App.gctl, active: document.activeElement?.outerHTML?.slice(0, 600) })).catch(() => null);
      await fs.writeFile(path.join(out, layout.name + '-failure.json'), JSON.stringify({ error: String(error), state }, null, 2) + '\n'); throw error;
    } finally {
      await fs.writeFile(path.join(out, 'partial-checks.json'), JSON.stringify({ checks, browserErrors, screenshots }, null, 2) + '\n');
      await context.close();
    }
  }
  const report = { suite: 'pow-m22-onboarding', layouts: process.env.INTRUDER_M22_LAYOUT ? [process.env.INTRUDER_M22_LAYOUT] : ['desktop','iphone-layout-chromium'], sourceHashes, checks, screenshots, browserErrors,
    scope: 'Actual Chromium WebGL2 on desktop and an 844×390/DPR 3 touch-emulated iPhone layout. Real DOM controls, keyboard and CDP touchscreen movement/look/held actions exercise the original renderer, collision and game state. Explicit simulation stepping and view steering make the fixtures deterministic. One named campaign checkpoint key is removed to emulate legacy save storage; gameplay snapshots come from actual player actions and Save. A clearly labeled terminal callback fixture calls the real POW.finish to verify separate practice accounting; it does not claim a physical escape or rescue playthrough. No tutorial completion, interaction outcome, patrol or success flags are written. This is not physical Windows hardware, physical iPhone Safari or a human difficulty assessment.' };
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n'); return report;
};

async function verifyChapterEntries({ page, click, tick, screenshot, record }) {
  const chapters = [['escape','cell'],['solitary','solitary'],['regular','regular'],['river','river']];
  for (const [chapter, expectedStage] of chapters) {
    await page.locator('#powChapter [data-pow-chapter="' + chapter + '"]').waitFor({ state: 'visible' });
    await click(page.locator('#powChapter [data-pow-chapter="' + chapter + '"]'));
    await page.waitForFunction(stage => App.game?.pow?.stage === stage && document.getElementById('loader').style.display === 'none', expectedStage, { timeout: 90000 });
    await page.evaluate(() => { window.__onboardingNativeFrame ||= App.frame; App.frame = () => {}; App.screen = 'game'; App.game.paused = false; for (const key of Object.keys(App.keys)) App.keys[key] = 0; App.gctl.pitch = App.gctl.roll = 0; });
    await tick(.1);
    const entry = await page.evaluate(() => {
      const g = App.game, s = g.pow;
      return { phase: g.phase, stage: s.stage, guidance: { ...POW.Guidance.state(g) }, p: g.evade.p.slice(), solids: s.solids.length, objects: s.objects.length, webgl: g.rend.gl.getParameter(g.rend.gl.VERSION), complete: !!s.complete, soldiers: g.evade.searchers.length,
        inventedProgress: !!s.flags.regularEscape || !!s.flags.doorOpen || !!s.flags.outside || !!s.flags.prisonerContact,
        networkKnown: s.captivity?.solidarity?.known?.length || 0 };
    });
    assert.equal(entry.phase, 'evade'); assert.equal(entry.stage, expectedStage); assert.match(entry.webgl, /WebGL 2/);
    assert.equal(entry.complete, false); assert.ok(entry.solids > 0 && entry.objects > 0); assert.equal(entry.networkKnown, 0);
    assert.equal(entry.guidance.chapter, chapter); assert.equal(entry.guidance.step, 0);
    if (chapter !== 'river') assert.equal(entry.inventedProgress, false, 'Chapter practice must not seed successful escape or discovered-contact flags');
    await screenshot('direct-entry-' + chapter); record('Ready Room launches the playable ' + chapter + ' chapter directly without invented progression', entry);
    await click(page.locator('#pauseBtn'));
    await click(page.locator('#pauseVeil').getByRole('button', { name: 'Ready Room', exact: true }));
    await page.waitForFunction(() => App.screen === 'ready' && App.game === null);
    assert.equal(await page.evaluate(() => document.body.classList.contains('pow-active')), false);
  }
  record('All direct chapter entries return through the real pause menu to a usable Ready Room', { chapters: chapters.map(([id]) => id) });
}
async function verifyTutorial({ page, click, tick, heldKey, heldAction, touchMove, touch, walkTo, screenshot, record, layout }) {
  async function launch(chapter, stage) {
    await click(page.locator('#powChapter [data-pow-chapter="' + chapter + '"]'));
    await page.waitForFunction(stage => App.game?.pow?.stage === stage && document.getElementById('loader').style.display === 'none', stage, { timeout: 90000 });
    await page.evaluate(() => { window.__onboardingNativeFrame ||= App.frame; App.frame = () => {}; App.screen = 'game'; App.game.paused = false; for (const key of Object.keys(App.keys)) App.keys[key] = 0; App.gctl.pitch = App.gctl.roll = 0; });
    await tick(.1);
  }
  const state = () => page.evaluate(() => ({ ...POW.Guidance.state(App.game) }));
  await launch('escape', 'cell');
  assert.equal((await state()).step, 0); assert.equal((await state()).enabled, true);
  await screenshot('tutorial-look');
  const lookBefore = await page.evaluate(() => ({ hdg: App.game.evade.hdg, look: App.game.evade.look }));
  if (layout.hasTouch) {
    await touch('touchStart', [{ x: 510, y: 170, id: 2 }]);
    await touch('touchMove', [{ x: 570, y: 140, id: 2 }]);
    await touch('touchEnd'); await tick(.1);
  } else await heldKey('d', .35);
  const looked = await page.evaluate(before => ({ hdg: App.game.evade.hdg, look: App.game.evade.look, delta: Math.abs(App.game.evade.hdg - before.hdg) + Math.abs(App.game.evade.look - before.look), guidance: { ...POW.Guidance.state(App.game) } }), lookBefore);
  assert.ok(looked.delta > .25); assert.equal(looked.guidance.step, 1);
  record('The look lesson advances from actual keyboard turning or touchscreen drag', looked);

  const beforeMove = await page.evaluate(() => App.game.evade.p.slice());
  if (layout.hasTouch) await touchMove(.6); else await heldKey('w', .4);
  const moved = await page.evaluate(before => ({ p: App.game.evade.p.slice(), distance: Math.hypot(App.game.evade.p[0] - before[0], App.game.evade.p[2] - before[2]), guidance: { ...POW.Guidance.state(App.game) }, pitch: App.gctl.pitch, roll: App.gctl.roll }), beforeMove);
  assert.ok(moved.distance > .45); assert.equal(moved.guidance.step, 2); assert.equal(moved.pitch, 0); assert.equal(moved.roll, 0);
  record('The movement lesson advances from collision-checked feet displacement and controls release cleanly', moved);

  await openPowTools(page, click);
  await page.locator('#powHUD').getByRole('button', { name: 'Save', exact: true }).evaluate(button => {
    const r = button.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    window.__m22SaveHit = { bounds: { left: r.left, top: r.top, width: r.width, height: r.height }, hit: hit?.outerHTML?.slice(0, 500), stack: document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).slice(0, 6).map(node => ({ tag: node.tagName, id: node.id, class: node.className, zIndex: getComputedStyle(node).zIndex, pointerEvents: getComputedStyle(node).pointerEvents })) };
  });
  await click(page.locator('#powHUD').getByRole('button', { name: 'Save', exact: true }));
  const wantedSave = await page.evaluate(() => App.game.evade.p.slice());
  await page.waitForFunction(p => {
    const saved = POW.ctx.Store.get('pow_checkpoint', null);
    return saved?.p?.every((v, i) => Math.abs(v - p[i]) < 1e-8) && saved.guidance?.step === 2;
  }, wantedSave, { timeout: 3000 });
  const beforeRestore = await page.evaluate(() => ({ p: App.game.evade.p.slice(), guidance: { ...POW.Guidance.state(App.game) }, saved: POW.ctx.Store.get('pow_checkpoint', null).guidance, savedP: POW.ctx.Store.get('pow_checkpoint', null).p, events: window.__m22ToolEvents.slice(-6) }));
  assert.deepEqual(beforeRestore.saved, beforeRestore.guidance, 'The trusted Save gesture must persist current tutorial progress: ' + JSON.stringify(beforeRestore));
  assert.deepEqual(beforeRestore.savedP, beforeRestore.p, 'The trusted Save gesture must persist current physical position');
  await heldKey('w', .2);
  await openPowTools(page, click);
  await click(page.locator('#powHUD').getByRole('button', { name: 'Continue', exact: true })); await tick(.1);
  const afterRestore = await page.evaluate(() => ({ p: App.game.evade.p.slice(), guidance: { ...POW.Guidance.state(App.game) }, complete: !!App.game.pow.complete }));
  assert.deepEqual(afterRestore.p, beforeRestore.p); assert.deepEqual(afterRestore.guidance, beforeRestore.guidance); assert.deepEqual(beforeRestore.saved, beforeRestore.guidance); assert.equal(afterRestore.complete, false);
  record('Real Save and Continue controls restore a partly learned tutorial and the exact physical position', afterRestore);

  await walkTo(0, -.8);
  await page.evaluate(() => { App.game.evade.hdg = -Math.PI / 2; App.game.evade.pitchCmd = App.game.evade.look = 0; }); await tick(.1);
  if (layout.hasTouch) {
    await touch('touchStart', [{ x: 510, y: 165, id: 2 }]);
    await touch('touchMove', [{ x: 510, y: 275, id: 2 }]);
    await touch('touchEnd'); await tick(.1);
  } else await heldKey('e', .75);
  assert.equal(await page.evaluate(() => App.game.pow.focus?.id), 'bunk-bracket');
  let partial;
  await heldAction(.55, async () => {
    partial = await page.evaluate(() => ({ holding: App.game.pow.holding && { ...App.game.pow.holding }, bracket: !!App.game.pow.inventory.bracket, guidance: { ...POW.Guidance.state(App.game) }, progress: POW.ui.progress.value, handsVisible: !!POW.ui.hands && !POW.ui.hands.hidden || !!document.querySelector('#powEpisodeActions') && !document.querySelector('#powEpisodeActions').hidden }));
    assert.equal(partial.holding.id, 'bunk-bracket'); assert.ok(partial.holding.t >= .5); assert.equal(partial.bracket, false); assert.equal(partial.guidance.step, 2); assert.ok(partial.progress > 0 && partial.progress < 1); assert.equal(partial.handsVisible, true);
    await screenshot('held-action-feedback');
  });
  const interrupted = await page.evaluate(() => ({ holding: App.game.pow.holding, bracket: !!App.game.pow.inventory.bracket, guidance: { ...POW.Guidance.state(App.game) }, progress: POW.ui.progress.value }));
  assert.equal(interrupted.holding, null); assert.equal(interrupted.bracket, false); assert.equal(interrupted.guidance.step, 2); assert.equal(interrupted.progress, 0);
  record('A short real hold shows progress and release cancels it without advancing the interaction lesson', { partial, interrupted });

  let accepted;
  await heldAction(1.65, async () => {
    accepted = await page.evaluate(() => ({ bracket: !!App.game.pow.inventory.bracket, guidance: { ...POW.Guidance.state(App.game) }, door: !!App.game.pow.flags.doorOpen }));
    assert.equal(accepted.bracket, true); assert.equal(accepted.guidance.step, 3); assert.equal(accepted.guidance.completed, false); assert.equal(accepted.door, false);
  });
  const completed = await page.evaluate(() => ({ guidance: { ...POW.Guidance.state(App.game) }, bracket: !!App.game.pow.inventory.bracket, gameComplete: !!App.game.pow.complete, door: !!App.game.pow.flags.doorOpen }));
  assert.equal(completed.guidance.completed, true); assert.equal(completed.bracket, true); assert.equal(completed.gameComplete, false); assert.equal(completed.door, false);
  await screenshot('tutorial-real-interaction-completed');
  record('Only successful environmental interaction followed by actual input release completes all four tutorial steps', { accepted, completed });
  await verifyLegacySaveMigration({ page, click, tick, launch, screenshot, record });

  const hud = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('#powHUD .pow-status,#powHUD .pow-tools,#powHUD .pow-notice,#powHUD .pow-prompt,#powHUD .pow-context-controls'));
    const cx = innerWidth * .5, cy = innerHeight * .5;
    return { viewport: [innerWidth, innerHeight], statusHeight: document.querySelector('#powHUD .pow-status').getBoundingClientRect().height,
      centerCovered: nodes.filter(n => { const r = n.getBoundingClientRect(), s = getComputedStyle(n); return !n.hidden && s.display !== 'none' && r.left <= cx && r.right >= cx && r.top <= cy && r.bottom >= cy; }).map(n => n.className),
      conditionDetails: Array.from(document.querySelectorAll('#powHUD details')).filter(n => n.querySelector('[data-stats]')).length,
      conditionCollapsed: Array.from(document.querySelectorAll('#powHUD details')).filter(n => n.querySelector('[data-stats]')).every(n => !n.open) };
  });
  assert.deepEqual(hud.centerCovered, []); assert.ok(hud.conditionDetails > 0); assert.equal(hud.conditionCollapsed, true);
  if (layout.hasTouch) assert.ok(hud.statusHeight < innerHeightFrom(hud) * .35, 'Compact phone status must leave the game scene visible');
  record('Compact condition HUD leaves the center of the actual first-person viewport unobstructed', hud);
  const condition = page.locator('#powHUD details').filter({ has: page.locator('[data-stats]') });
  await click(condition.locator('summary'));
  assert.equal(await page.locator('#powHUD [data-stats]').isVisible(), true);
  const conditionText = await page.locator('#powHUD [data-stats]').textContent();
  for (const label of ['BODY','FATIGUE','RESOLVE','MORALE','MEMORY','HOPE']) assert.ok(conditionText.includes(label));
  await click(condition.locator('summary'));
  record('The compact Condition control still reveals all six survival statistics on request', { conditionText });

  await openPowTools(page, click);
  await click(page.locator('#powHUD .pow-settings summary'));
  const setting = page.locator('#powHUD [data-guidance]'); await setting.uncheck();
  await click(page.locator('#powHUD .pow-settings summary'));
  assert.equal((await state()).enabled, false);
  await click(page.locator('#pauseBtn')); await click(page.locator('#pauseVeil').getByRole('button', { name: 'Ready Room', exact: true }));
  await launch('regular', 'regular'); assert.equal((await state()).enabled, false);
  assert.equal(await page.locator('#powHUD [data-guide]').isVisible(), false);
  record('The guidance-off checkbox persists into a freshly launched chapter without blocking normal play', await state());
  await openPowTools(page, click);
  await click(page.locator('#powHUD .pow-settings summary')); await setting.check(); await click(page.locator('#powHUD .pow-settings summary'));
  assert.equal((await state()).enabled, true);
  await click(page.locator('#powHUD [data-guide-skip]'));
  const skipped = await page.evaluate(() => ({ guidance: { ...POW.Guidance.state(App.game) }, complete: !!App.game.pow.complete, door: !!App.game.pow.regular.flags.cellOpen, outside: !!App.game.pow.flags.outside }));
  assert.equal(skipped.complete, false); assert.equal(skipped.door, false); assert.equal(skipped.outside, false);
  assert.equal(await page.locator('#powHUD [data-guide]').isVisible(), false);
  record('Guidance can be re-enabled and skipped without opening doors or completing gameplay', skipped);
}

function innerHeightFrom(hud) { return hud.viewport[1]; }

async function verifyLegacySaveMigration({ page, click, tick, launch, screenshot, record }) {
  const savedBefore = await page.evaluate(() => POW.ctx.Store.get('pow_checkpoint', null)?.savedAt);
  await openPowTools(page, click);
  await click(page.locator('#powHUD').getByRole('button', { name: 'Save', exact: true }));
  await page.waitForFunction(previous => {
    const snap = POW.ctx.Store.get('pow_checkpoint', null);
    return snap && snap.savedAt !== previous && snap.inventory?.bracket && snap.guidance?.completed && !snap.practice;
  }, savedBefore, { timeout: 3000 });
  const legacy = await page.evaluate(() => {
    const S = POW.ctx.Store, snap = S.get('pow_checkpoint', null);
    const other = { regular: S.get('pow_checkpoint:regular', null), river: S.get('pow_checkpoint:river', null) };
    localStorage.removeItem('a6_pow_checkpoint:campaign');
    return { snap, other, campaignMissing: S.get('pow_checkpoint:campaign', null) === null, globalRetained: JSON.stringify(S.get('pow_checkpoint', null)) === JSON.stringify(snap) };
  });
  assert.equal(legacy.campaignMissing, true); assert.equal(legacy.globalRetained, true);
  assert.equal(legacy.snap.stage, 'cell'); assert.equal(legacy.snap.inventory.bracket, true); assert.equal(legacy.snap.guidance.completed, true);
  assert.ok(legacy.other.regular && legacy.other.river, 'Independent practice checkpoints come from the prior genuine menu-entry tests');
  await click(page.locator('#pauseBtn'));
  await click(page.locator('#pauseVeil').getByRole('button', { name: 'Ready Room', exact: true }));
  await launch('solitary', 'solitary');
  const migrated = await page.evaluate(() => {
    const S = POW.ctx.Store;
    return { campaign: S.get('pow_checkpoint:campaign', null), other: { regular: S.get('pow_checkpoint:regular', null), river: S.get('pow_checkpoint:river', null) },
      practice: App.game.pow.practice, stage: App.game.pow.stage, latestPractice: S.get('pow_checkpoint', null)?.practice,
      practiceSlots: { solitary: S.get('pow_checkpoint:solitary', null), regular: S.get('pow_checkpoint:regular', null), river: S.get('pow_checkpoint:river', null) } };
  });
  assert.deepEqual(migrated.campaign, legacy.snap, 'Starting practice must archive the exact valid legacy campaign snapshot before replacing the latest checkpoint');
  assert.deepEqual(migrated.other, legacy.other, 'Migration must preserve unrelated named chapter checkpoints');
  assert.equal(migrated.practice, 'solitary'); assert.equal(migrated.latestPractice, 'solitary'); assert.equal(migrated.stage, 'solitary');
  record('Starting a real practice chapter preserves an exact legacy campaign save and leaves other named chapter saves unchanged', { archivedStage: migrated.campaign.stage, archivedPosition: migrated.campaign.p, archivedInventory: migrated.campaign.inventory, archivedGuidance: migrated.campaign.guidance, unrelatedSlotsPreserved: ['regular','river'] });

  await click(page.locator('#pauseBtn'));
  await click(page.locator('#pauseVeil').getByRole('button', { name: 'Ready Room', exact: true }));
  const savedChapters = page.locator('#powChapter details').filter({ has: page.getByText('Saved chapters', { exact: true }) });
  await click(savedChapters.locator('summary'));
  await click(savedChapters.getByRole('button', { name: 'Resume October escape', exact: true }));
  await page.waitForFunction(() => App.game?.pow?.stage === 'cell' && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
  await page.evaluate(() => { window.__onboardingNativeFrame ||= App.frame; App.frame = () => {}; App.screen = 'game'; App.game.paused = false; for (const key of Object.keys(App.keys)) App.keys[key] = 0; App.gctl.pitch = App.gctl.roll = 0; });
  await tick(.2);
  const resumed = await page.evaluate(() => {
    const g = App.game, S = POW.ctx.Store;
    return { p: g.evade.p.slice(), inventory: { ...g.pow.inventory }, flags: { ...g.pow.flags }, guidance: { ...POW.Guidance.state(g) }, practice: g.pow.practice || null,
      complete: !!g.pow.complete, namedCampaignPractice: S.get('pow_checkpoint:campaign', null)?.practice || null,
      practiceSlots: { solitary: S.get('pow_checkpoint:solitary', null), regular: S.get('pow_checkpoint:regular', null), river: S.get('pow_checkpoint:river', null) } };
  });
  assert.deepEqual(resumed.p, legacy.snap.p); assert.deepEqual(resumed.inventory, legacy.snap.inventory); assert.deepEqual(resumed.flags, legacy.snap.flags); assert.deepEqual(resumed.guidance, legacy.snap.guidance);
  assert.equal(resumed.practice, null); assert.equal(resumed.namedCampaignPractice, null); assert.equal(resumed.complete, false);
  assert.deepEqual(resumed.practiceSlots, migrated.practiceSlots, 'Resuming the campaign must not replace practice slots');
  await screenshot('legacy-campaign-resumed');
  record('Saved Chapters → Resume October escape restores earned inventory, physical position and tutorial progress without inheriting practice identity', { p: resumed.p, inventory: resumed.inventory, guidance: resumed.guidance, practice: resumed.practice, unrelatedPracticeSlotsPreserved: true });
}

async function verifyPreciseTargets({ page, click, tick, heldKey, heldAction, touch, walkTo, screenshot, record, layout }) {
  const centerDoor = await walkTo(.62, -2.30);
  await page.evaluate(() => { App.game.evade.hdg = 0; App.game.evade.pitchCmd = App.game.evade.look = 0; }); await tick(.1);
  assert.equal(await page.evaluate(() => App.game.pow.focus?.id), 'regular-observe');
  // Retarget while the same real held action is down. Its elapsed time must
  // belong to the current object rather than carrying into a different door.
  let changed;
  await heldAction(.70, async () => {
    const initial = await page.evaluate(() => ({ ...App.game.pow.holding }));
    assert.equal(initial.id, 'regular-observe'); assert.ok(initial.t >= .65);
    if (layout.hasTouch) {
      // Keep the held touch action and introduce a second real finger to look.
      const bounds = await page.locator('#powHUD .pow-context-controls button:first-child').evaluate(n => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      const points = [{ x: bounds.x, y: bounds.y, id: 8 }, { x: 510, y: 185, id: 2 }];
      await touch('touchStart', points);
      points[1].x = 400;
      await touch('touchMove', points);
      await tick(.05);
      // Leave both fingers down until heldAction releases them together. A CDP
      // touchEnd packet releases the gesture; it is not a partial-finger lift.
    } else await heldKey('a', .4);
    await tick(.05);
    changed = await page.evaluate(() => ({ focus: App.game.pow.focus?.id, holding: App.game.pow.holding && { ...App.game.pow.holding }, observations: App.game.pow.regular.observations, cellOpen: App.game.pow.regular.flags.cellOpen, input: { ...App.game.pow.input } }));
    assert.equal(changed.focus, 'regular-cell-door'); assert.equal(changed.holding?.id, 'regular-cell-door', 'The action finger must remain down during the look gesture: ' + JSON.stringify(changed));
    assert.ok(changed.holding.t < initial.t); assert.equal(changed.observations, 0); assert.equal(changed.cellOpen, false);
  });
  assert.equal(await page.evaluate(() => App.game.pow.holding), null);
  record('Changing aim during the same keyboard or multi-finger touch hold resets elapsed time for the new object', { approach: centerDoor, changed });
  await walkTo(0, .5);
  await page.evaluate(() => { App.game.evade.hdg = 0; }); await tick(.1);
  assert.equal(await page.evaluate(() => App.game.pow.focus), null);
  await heldAction(.5);
  const far = await page.evaluate(() => ({ focus: App.game.pow.focus, holding: App.game.pow.holding, door: App.game.pow.regular.flags.cellOpen, observations: App.game.pow.regular.observations }));
  assert.equal(far.holding, null); assert.equal(far.door, false); assert.equal(far.observations, 0);
  record('Holding the action with no target in reach produces no remote interaction', far);

  await click(page.locator('#pauseBtn')); await click(page.locator('#pauseVeil').getByRole('button', { name: 'Ready Room', exact: true }));
  await click(page.locator('#powChapter [data-pow-chapter="solitary"]'));
  await page.waitForFunction(() => App.game?.pow?.stage === 'solitary' && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
  await page.evaluate(() => { window.__onboardingNativeFrame ||= App.frame; App.frame = () => {}; App.screen = 'game'; App.game.paused = false; for (const key of Object.keys(App.keys)) App.keys[key] = 0; App.gctl.pitch = App.gctl.roll = 0; });
  if (await page.locator('#powHUD [data-guide-skip]').isVisible()) await click(page.locator('#powHUD [data-guide-skip]'));
  await walkTo(0, -.80);
  await page.evaluate(() => { App.game.evade.hdg = 0; App.game.evade.pitchCmd = App.game.evade.look = 0; }); await tick(.1);
  const aimed = await page.evaluate(() => {
    const g = App.game, e = g.evade, door = g.pow.objects.find(q => q.id === 'cell-door'), tray = g.pow.objects.find(q => q.id === 'cell-tray');
    return { focus: g.pow.focus?.id, doorDistance: Math.hypot(door.p[0] - e.p[0], door.p[2] - e.p[2]), trayDistance: Math.hypot(tray.p[0] - e.p[0], tray.p[2] - e.p[2]), prompt: POW.ui.prompt.textContent, feet: e.p.slice() };
  });
  assert.ok(aimed.trayDistance < aimed.doorDistance); assert.equal(aimed.focus, 'cell-door'); assert.match(aimed.prompt, /corridor|door|observe/i);
  await screenshot('solitary-aimed-door');
  record('Actual camera aim selects the solitary door over a closer meal tray instead of choosing by distance alone', aimed);
  await heldKey('d', .33);
  const tray = await page.evaluate(() => ({ focus: App.game.pow.focus?.id, heading: App.game.evade.hdg, prompt: POW.ui.prompt.textContent }));
  assert.equal(tray.focus, 'cell-tray'); assert.match(tray.prompt, /meal|ration|food/i);
  record('Turning toward the nearby tray intentionally changes the interaction prompt to that object', tray);
}

async function verifyPracticeAccounting({ page, click, tick, screenshot, record }) {
  const outcome = await page.evaluate(() => {
    const g = App.game, S = POW.ctx.Store, before = { app: JSON.parse(JSON.stringify(App.prog)), stored: S.get('prog', null) };
    if (!g.pow.practice) throw new Error('Accounting callback fixture requires a practice chapter');
    const kind = g.pow.practice;
    POW.finish(g, { title: 'Practice accounting callback fixture', text: 'Fictional terminal callback fixture for accounting verification; no physical escape is claimed.', historical: false, fictional: true });
    const log = S.get('pow_log', []);
    return { before, after: { app: JSON.parse(JSON.stringify(App.prog)), stored: S.get('prog', null) }, kind, lastLog: log[log.length - 1], complete: g.pow.complete };
  });
  assert.deepEqual(outcome.after, outcome.before, 'Finishing standalone practice must not grant Mission 11 completion or campaign grades');
  assert.equal(outcome.complete, true); assert.equal(outcome.lastLog.practice, outcome.kind);
  record('The real practice completion callback leaves campaign progress and grades unchanged and records its practice identity', outcome);
  await click(page.locator('#powHUD .pow-end').getByRole('button', { name: 'Ready room', exact: true }));
  await click(page.locator('#tabs [data-tab="log"]'));
  const logTitle = page.locator('#readyBody h3').filter({ hasText: 'Practice · Practice accounting callback fixture' });
  await logTitle.waitFor({ state: 'visible' }); await logTitle.scrollIntoViewIfNeeded();
  const text = await logTitle.textContent(); await screenshot('cruise-log-practice-accounting');
  record('The actual Cruise Log labels the practice ending separately from the campaign record', { text, kind: outcome.kind });
  // Return through real menus to a usable first-person chapter for the final
  // render/error check, rather than retaining a detached finished Game object.
  await click(page.locator('#tabs [data-tab="ops"]'));
  await click(page.locator('#powChapter [data-pow-chapter="solitary"]'));
  await page.waitForFunction(() => App.game?.pow?.stage === 'solitary' && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
  await page.evaluate(() => { window.__onboardingNativeFrame ||= App.frame; App.frame = () => {}; App.screen = 'game'; App.game.paused = false; }); await tick(.2);
}
