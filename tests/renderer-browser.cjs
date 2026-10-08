'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

// These are real custom-renderer GPU tests. Synthetic RGBA sheets and a
// procedural wall are explicit shader fixtures, not rendering mocks.
module.exports = async function rendererChecks(browser, target, evidenceDir) {
  const errors = [];
  const desktop = await browser.newContext({ viewport: { width: 640, height: 400 } });
  const checks = [];
  try {
    const page = await desktop.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.App && App.screen === 'boot');
    await page.click('#bootFly');
    await page.waitForFunction(() => App.game?.st || document.getElementById('graphicError'), null, { timeout: 90000 });
    assert.equal(await page.locator('#graphicError').count(), 0);
    await page.locator('#teach').dispatchEvent('click');
    if (await page.locator('#legend.on').count()) await page.keyboard.press('h');
    await page.click('#pauseBtn');
    const desktopMemory = await page.evaluate(() => {
      const R = App.rend, gl = R.gl;
      const initial = { quality: R.quality, shadowSize: R.shadowSize };
      const counts = { createTexture: 0, deleteTexture: 0, createFramebuffer: 0, deleteFramebuffer: 0, createRenderbuffer: 0, deleteRenderbuffer: 0 };
      const originals = {};
      for (const key of Object.keys(counts)) { originals[key] = gl[key]; gl[key] = function (...args) { counts[key]++; return originals[key].apply(gl, args); }; }
      let lowSize, mediumSize, highSize;
      try {
        R.resize(620, 380, 1); R.resize(640, 400, 1);
        R.quality = 0; lowSize = R.shadowSize;
        R.quality = 1; mediumSize = R.shadowSize;
        R.quality = 2; highSize = R.shadowSize;
      } finally { for (const key of Object.keys(counts)) gl[key] = originals[key]; }
      return { initial, counts, lowSize, mediumSize, highSize, gpuError: gl.getError() };
    });
    assert.deepEqual(desktopMemory.initial, { quality: 2, shadowSize: 4096 });
    assert.deepEqual(desktopMemory.counts, { createTexture: 9, deleteTexture: 9, createFramebuffer: 9, deleteFramebuffer: 9, createRenderbuffer: 2, deleteRenderbuffer: 2 });
    assert.deepEqual([desktopMemory.lowSize, desktopMemory.mediumSize, desktopMemory.highSize], [1, 2048, 4096]);
    assert.equal(desktopMemory.gpuError, 0);
    checks.push({ name: 'Desktop target lifetimes and quality-dependent shadow replacement', passed: true, observed: desktopMemory });
  } finally { await desktop.close(); }
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.App && App.screen === 'boot');
    await page.click('#bootFly');
    await page.waitForFunction(() => App.game?.st || document.getElementById('graphicError'), null, { timeout: 90000 });
    assert.equal(await page.locator('#graphicError').count(), 0, 'Real WebGL renderer must start');
    await page.locator('#teach').dispatchEvent('click');
    const initial = await page.evaluate(() => ({ quality: App.rend.quality, shadowSize: App.rend.shadowSize, shadowBytes: App.rend.shadowSize ** 2 * 4, version: App.rend.gl.getParameter(App.rend.gl.VERSION) }));
    assert.equal(initial.quality, 1);
    assert.equal(initial.shadowSize, 2048, 'Medium touch quality must not allocate a 4096 shadow');
    assert.match(initial.version, /^WebGL 2/);
    checks.push({ name: 'Default touch GPU allocation', passed: true, observed: initial });
    await page.click('#pauseBtn');

    const allocations = await page.evaluate(() => {
      const gl = App.rend.gl;
      const counts = { createTexture: 0, deleteTexture: 0, createFramebuffer: 0, deleteFramebuffer: 0, createRenderbuffer: 0, deleteRenderbuffer: 0 };
      const originals = {};
      for (const key of Object.keys(counts)) { originals[key] = gl[key]; gl[key] = function (...args) { counts[key]++; return originals[key].apply(gl, args); }; }
      try { App.rend.resize(810, 370, 3); App.rend.resize(844, 390, 3); }
      finally { for (const key of Object.keys(counts)) gl[key] = originals[key]; }
      return counts;
    });
    assert.deepEqual(allocations, { createTexture: 6, deleteTexture: 6, createFramebuffer: 6, deleteFramebuffer: 6, createRenderbuffer: 2, deleteRenderbuffer: 2 });
    checks.push({ name: 'Two real GPU resizes have balanced target lifetimes', passed: true, observed: allocations });

    const shader = await page.evaluate(() => {
      const R = App.rend, gl = R.gl;
      const save = { quality: R.quality, float: R.floatBuf, atmos: R.atm, eye: R.eye, fires: R.fireN };
      const drain = () => { const out = []; for (let i = 0; i < 16; i++) { const error = gl.getError(); if (!error) break; out.push(error); } return out; };
      const inheritedErrors = drain();
      R.quality = 0; R.floatBuf = false; R.resize(240, 240, 1);
      R.setCamera([0, 1, 0], [0, 0, -1], [0, 1, 0], 62, 0.1, 100, 1);
      R.setAtmos({ ...R.atm, amb: [1, 1, 1], gnd: [0, 0, 0], sunCol: [0, 0, 0], horizon: [0, 0, 0], zenith: [0, 0, 0], fogDens: 0, overcast: 0 });
      R.fireN = 0;
      const sheet = document.createElement('canvas'); sheet.width = 8; sheet.height = 4;
      const g = sheet.getContext('2d');
      g.fillStyle = '#ff0000'; g.fillRect(0, 0, 4, 4);
      g.fillStyle = '#0000ff'; g.fillRect(4, 0, 4, 4);
      R.texFromCanvas('photo_renderer_fixture', sheet);
      const sprite = { p: [0, 0, -5], h: 2, w: 2, cell: 0, cols: 2, rows: 1 };
      const clear = () => { R.begin(); gl.clearColor(0, 0.25, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); };
      const centre = () => { const p = new Uint8Array(4); gl.readPixels(R.W >> 1, R.H >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return Array.from(p); };
      clear(); R.drawSprites('photo_renderer_fixture', [sprite]);
      const full = new Uint8Array(R.W * R.H * 4); gl.readPixels(0, 0, R.W, R.H, gl.RGBA, gl.UNSIGNED_BYTE, full);
      let redPixels = 0, maxBlue = 0;
      for (let i = 0; i < full.length; i += 4) { if (full[i] > 32) redPixels++; maxBlue = Math.max(maxBlue, full[i + 2]); }
      const solidCentre = centre();
      g.clearRect(0, 0, 8, 4); g.fillStyle = 'rgba(255,0,0,0.5)'; g.fillRect(0, 0, 4, 4); g.fillStyle = '#0000ff'; g.fillRect(4, 0, 4, 4);
      const oldTexture = R.textures.photo_renderer_fixture.tex;
      R.texFromCanvas('photo_renderer_fixture', sheet);
      const replacementDeleted = !gl.isTexture(oldTexture);
      clear(); R.drawSprites('photo_renderer_fixture', [sprite]);
      const softCentre = centre();
      const wall = new MB(); wall.quad([-2, 0, -3], [2, 0, -3], [2, 2, -3], [-2, 2, -3], [0, 1, 0]);
      R.meshFromBuilder('rendererFixtureWall', wall);
      const instance = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1, 1,1,1,0]);
      clear(); R.drawMesh('rendererFixtureWall', instance, 1); const wallCentre = centre();
      R.drawSprites('photo_renderer_fixture', [sprite]); const occludedCentre = centre();
      const gpuErrors = drain();
      const state = { depthWrites: gl.getParameter(gl.DEPTH_WRITEMASK), blending: gl.isEnabled(gl.BLEND), culling: gl.isEnabled(gl.CULL_FACE) };
      const result = { fixture: 'Actual custom shaders, synthetic two-cell RGBA atlas, and actual MB wall mesh, read from real WebGL framebuffer', inheritedErrors, gpuErrors, redPixels, maxBlue, solidCentre, softCentre, wallCentre, occludedCentre, replacementDeleted, state, lowShadowSize: R.shadowSize };
      gl.deleteTexture(R.textures.photo_renderer_fixture.tex); delete R.textures.photo_renderer_fixture;
      R.floatBuf = save.float; R.quality = save.quality; R.setAtmos(save.atmos); R.fireN = save.fires;
      R.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
      return result;
    });
    assert.deepEqual(shader.inheritedErrors, [], 'Actual gameplay must not accumulate GPU errors');
    assert.deepEqual(shader.gpuErrors, [], 'Actual shader fixtures must not raise GPU errors');
    assert.equal(shader.lowShadowSize, 1);
    assert.ok(shader.redPixels > 100, 'The chosen atlas cell must actually render');
    assert.equal(shader.maxBlue, 0, 'Red frame must not sample its blue neighbour');
    assert.ok(shader.solidCentre[0] > 200 && shader.solidCentre[1] < 3);
    assert.ok(shader.softCentre[0] > 90 && shader.softCentre[0] < 180, 'Half-alpha red must render, without double premultiplication');
    assert.ok(shader.softCentre[1] > 25 && shader.softCentre[1] < 40, 'Half-alpha edge must blend with the actual background');
    assert.deepEqual(shader.occludedCentre, shader.wallCentre, 'Opaque wall must occlude the sprite');
    assert.equal(shader.replacementDeleted, true, 'Replacing an atlas must delete its previous texture');
    assert.deepEqual(shader.state, { depthWrites: true, blending: false, culling: true });
    checks.push({ name: 'Real sprite GPU sampling, alpha, occlusion and state restoration', passed: true, observed: shader });

    await page.locator('#pauseBody').getByRole('button', { name: 'Resume', exact: true }).click();
    await page.keyboard.down('ArrowUp');
    await page.locator('#pickle').dispatchEvent('pointerdown');
    const lossSupported = await page.evaluate(() => {
      window.__rendererBeforeLoss = { game: App.game, position: [...App.game.ac.p], mission: App.game.mis.id, renderer: App.rend, keys: App.keys };
      window.__rendererLoss = App.rend.gl.getExtension('WEBGL_lose_context');
      if (!window.__rendererLoss) return false;
      window.__rendererLoss.loseContext(); return true;
    });
    assert.equal(lossSupported, true, 'Test browser must expose actual context-loss extension');
    await page.waitForFunction(() => App.graphicsContextLost && App._graphicsResume?.game === App.game && App.game.paused);
    const lost = await page.evaluate(() => ({ retained: App.game === window.__rendererBeforeLoss.game, paused: App.game.paused, position: App.game.ac.p, sameKeys: App.keys === window.__rendererBeforeLoss.keys, keyReset: App.keys.ArrowUp === 0, commitReset: App.gctl.commit === 0, banner: document.getElementById('graphicsRecovery')?.textContent }));
    assert.equal(lost.retained && lost.paused, true);
    assert.equal(lost.sameKeys && lost.keyReset && lost.commitReset, true, 'Held input must clear while keyboard listener object remains connected');
    await page.keyboard.up('ArrowUp');
    await page.evaluate(() => window.__rendererLoss.restoreContext());
    await page.waitForFunction(() => !App.graphicsContextLost && App.game?.paused && App.rend && App.rend !== window.__rendererBeforeLoss.renderer, null, { timeout: 90000 });
    const restored = await page.evaluate(() => ({ sameGame: App.game === window.__rendererBeforeLoss.game, renderer: App.game.rend === App.rend && App.game.world.rend === App.rend, finite: [...App.game.ac.p, ...App.game.ac.v].every(Number.isFinite), shadowSize: App.rend.shadowSize, mission: App.game.mis.id }));
    assert.equal(restored.sameGame && restored.renderer && restored.finite, true);
    assert.equal(restored.mission, 'm1');
    // A second interruption before Resume must preserve the original pause
    // state rather than making the recovery pause permanent.
    await page.evaluate(() => { window.__rendererLoss = App.rend.gl.getExtension('WEBGL_lose_context'); window.__rendererLoss.loseContext(); });
    await page.waitForFunction(() => App.graphicsContextLost && App._graphicsResume?.game === App.game && App.game.paused);
    assert.equal(await page.evaluate(() => App._graphicsResume.paused), false);
    await page.evaluate(() => window.__rendererLoss.restoreContext());
    await page.waitForFunction(() => !App.graphicsContextLost && App.game?.paused && App.rend, null, { timeout: 90000 });
    assert.equal(await page.evaluate(() => App.game === window.__rendererBeforeLoss.game), true);
    await fs.mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, 'renderer-context-restored.png') });
    await page.locator('#graphicsRecovery').getByRole('button', { name: 'Resume mission', exact: true }).click();
    await page.waitForFunction(() => App.game && !App.game.paused && !document.getElementById('graphicsRecovery'));
    await page.keyboard.down('ArrowDown');
    assert.equal(await page.evaluate(() => App.keys.ArrowDown), 1, 'Keyboard must still work after context restoration');
    await page.keyboard.up('ArrowDown');
    checks.push({ name: 'Repeated actual WebGL loss/restoration preserves mission and resumes through UI', passed: true, observed: { lost, restored, repeatedBeforeResume: true } });

    // Explicit pending-terminal fixture: a legitimate delayed callback must
    // remain current during loss. This does not claim aircraft recovery.
    await page.evaluate(() => {
      const game = App.game;
      window.__rendererTerminal = { game, before: App.rend, renderCallsWhileLost: 0 };
      const render = game.render;
      game.render = function (...args) { if (App.graphicsContextLost) window.__rendererTerminal.renderCallsWhileLost++; return render.apply(this, args); };
      game.phase = 'done';
      window.__rendererLoss = App.rend.gl.getExtension('WEBGL_lose_context');
      window.__rendererLoss.loseContext();
    });
    await page.waitForFunction(() => App.graphicsContextLost && App.game === window.__rendererTerminal.game);
    await page.evaluate(() => {
      const game = window.__rendererTerminal.game;
      setTimeout(() => game.debrief(false, 'Context recovery regression fixture — forced terminal callback'), 150);
    });
    await page.waitForFunction(() => App.graphicsContextLost && App.game?.result && document.getElementById('debriefVeil').classList.contains('on'), null, { timeout: 10000 });
    const pending = await page.evaluate(() => ({ sameGame: App.game === window.__rendererTerminal.game, resultPresent: !!App.game.result, renderCallsWhileLost: window.__rendererTerminal.renderCallsWhileLost }));
    assert.deepEqual(pending, { sameGame: true, resultPresent: true, renderCallsWhileLost: 0 });
    await page.evaluate(() => window.__rendererLoss.restoreContext());
    await page.waitForFunction(() => !App.graphicsContextLost && App.game?.result && App.rend !== window.__rendererTerminal.before, null, { timeout: 90000 });
    await page.locator('#graphicsRecovery').getByRole('button', { name: 'View debrief', exact: true }).click();
    assert.equal(await page.evaluate(() => App.game.paused && !!App.game.result && !document.getElementById('graphicsRecovery')), true);
    checks.push({ name: 'Pending debrief survives context loss and stays paused after restoration', passed: true, fixture: 'Forced terminal phase and scheduled the real debrief method; not a mission-completion claim', observed: pending });
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    return { suite: 'renderer', checks, browserErrors: errors, limits: 'Real Chromium/SwiftShader GPU execution with touch emulation; physical iPhone Safari and device frame rate remain separate validation.' };
  } finally { await context.close(); }
};
