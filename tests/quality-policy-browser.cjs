'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Controlled-clock policy integration, not a hardware performance benchmark.
// Native practice entry and original App.frame renders verify the integration.
// Artificial frame-pressure timestamps are then passed directly to the policy
// so a software GPU is not mistaken for a real Windows PC or iPhone GPU.
module.exports = async function qualityPolicyBrowser(browser, target, evidenceDir) {
  const results = [], screenshots = [], output = path.join(evidenceDir, 'quality-policy');
  await fs.mkdir(output, { recursive: true });
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ];
  for (const { name, ...profile } of profiles) {
    const context = await browser.newContext(profile), page = await context.newPage(), errors = [], missing = [];
    const click = locator => profile.hasTouch ? locator.tap() : locator.click();
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && /\/assets\//.test(response.url())) missing.push(response.url()); });
    await context.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
      localStorage.setItem('a6_sawkeys', '1');
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => window.__qualityPolicyClock ? 0 : raf(time => { if (!window.__qualityPolicyClock) callback(time); });
    });
    const record = (name_, actual, method) => {
      results.push({ profile: name, name: name_, passed: true, actual, method });
      console.log('PASS quality-policy ' + name + ' ' + name_);
    };
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      const sourceSHA256 = createHash('sha256').update(await response.body()).digest('hex');
      await page.waitForFunction(() => window.App && window.QualityPolicy);
      await click(page.locator('#bootGo'));
      // The original native setting callback must reset automatic adaptation,
      // including reapplying the same saved choice later in this test.
      await click(page.locator('#tabs [data-tab="set"]'));
      await click(page.locator('.setrow').filter({ hasText: 'Graphics' }).getByRole('button', { name: 'Medium', exact: true }));
      await click(page.locator('#tabs [data-tab="ops"]'));
      await click(page.locator('#dixieReady')); await click(page.locator('#dixiePractice'));
      await page.waitForFunction(() => App.game?.strikeExperience && App.game.mis.id === 'm2' && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
      await page.evaluate(() => { window.__qualityPolicyClock = true; });
      await page.waitForTimeout(60);

      const integration = await page.evaluate(() => {
        const app = App, g = app.game, policy = QualityPolicy, render = g.render;
        let renders = 0;
        g.render = function () { renders++; return render.apply(this, arguments); };
        policy.reset(app); app._last = 0; app._acc = 0;
        try {
          app.frame(10000); const first = policy.inspect(app);
          app.frame(10050); const active = policy.inspect(app);
          g.paused = true; app.frame(10100); const paused = policy.inspect(app); g.paused = false;
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          app.frame(10150); const hidden = policy.inspect(app); delete document.hidden;
          const oldScreen = app.screen; app.screen = 'ready'; app.frame(10200); const menu = policy.inspect(app); app.screen = oldScreen;
          app.graphicsContextLost = true; app.frame(10250); const lost = policy.inspect(app); app.graphicsContextLost = false;
          return { first, active, paused, hidden, menu, lost, renders, mission: g.mis.id,
            webgl: app.rend.gl.getParameter(app.rend.gl.VERSION), gl: app.rend.gl.getError() };
        } finally { g.render = render; delete document.hidden; g.paused = false; app.graphicsContextLost = false; app.screen = 'game'; }
      });
      assert.equal(integration.mission, 'm2'); assert.match(integration.webgl, /^WebGL 2/);
      assert.equal(integration.renders, 4); assert.equal(integration.first.warmup, 0); assert.equal(integration.active.warmup, 50);
      for (const key of ['paused', 'hidden', 'menu', 'lost']) {
        assert.equal(integration[key].warmup, 0); assert.equal(integration[key].samples, 0);
        assert.equal(integration[key].reason, 'inactive');
      }
      assert.equal(integration.gl, 0);
      record('Actual App.frame observes completed renders and excludes pause, hidden tab, menu and context loss',
        { sourceSHA256, integration }, 'Native mouse/touch Ready Room → Settings Medium → short B/N practice. RAF is then suspended; six original App.frame calls use declared timestamps. Four call the untouched production render, while menu/context-loss skip it. Hidden state and context-loss flags are explicit exclusion fixtures.');

      const pressure = await page.evaluate(() => {
        const app = App, R = app.rend, gl = R.gl, policy = QualityPolicy;
        const saved = localStorage.getItem('a6_set'), choice = app.set.quality;
        const gameplay = JSON.stringify({ aircraft: app.game.ac, targets: app.game.world.targets, score: app.game.world.score });
        const before = { quality: R.quality, width: R.W, height: R.H, shadowSize: R.shadowSize };
        const old = { shadow: R.shadowTex, shadowFB: R.fbShadow, scene: R.texScene, sceneFB: R.fbScene };
        policy.reset(app); policy.observe(app, 20000);
        let changes = 0;
        for (let frame = 1; frame <= 149; frame++) changes += +policy.observe(app, 20000 + frame * 50);
        const pending = policy.inspect(app);
        changes += +policy.observe(app, 27500);
        const after = policy.inspect(app);
        for (let frame = 1; frame <= 300; frame++) changes += +policy.observe(app, 27500 + frame * 100);
        const final = policy.inspect(app);
        return { savedUnchanged: localStorage.getItem('a6_set') === saved, choiceUnchanged: app.set.quality === choice,
          gameplayUnchanged: JSON.stringify({ aircraft: app.game.ac, targets: app.game.world.targets, score: app.game.world.score }) === gameplay,
          pending, after, final, changes, before,
          resources: { width: R.W, height: R.H, shadowSize: R.shadowSize,
            oldShadowDeleted: !gl.isTexture(old.shadow), oldShadowFBDeleted: !gl.isFramebuffer(old.shadowFB),
            oldSceneDeleted: !gl.isTexture(old.scene), oldSceneFBDeleted: !gl.isFramebuffer(old.sceneFB),
            validShadow: gl.isTexture(R.shadowTex), validScene: gl.isTexture(R.texScene), validSceneFB: gl.isFramebuffer(R.fbScene) },
          gl: gl.getError() };
      });
      assert.equal(pressure.pending.samples, 89); assert.equal(pressure.pending.warmup, 3000);
      assert.equal(pressure.before.quality, 1); assert.equal(pressure.after.effective, 0); assert.equal(pressure.after.requested, 1);
      assert.equal(pressure.final.effective, 0); assert.equal(pressure.changes, 1); assert.equal(pressure.final.notices, 1);
      assert(pressure.savedUnchanged && pressure.choiceUnchanged && pressure.gameplayUnchanged);
      for (const key of ['oldShadowDeleted', 'oldShadowFBDeleted', 'oldSceneDeleted', 'oldSceneFBDeleted', 'validShadow', 'validScene', 'validSceneFB']) assert.equal(pressure.resources[key], true, key);
      assert(pressure.resources.width < pressure.before.width); assert(pressure.resources.height < pressure.before.height);
      assert.equal(pressure.resources.shadowSize, 1); assert.equal(pressure.gl, 0);
      record('Controlled pressure performs one real GPU fallback without changing saved choice or gameplay', pressure,
        'Explicit synthetic 50 ms timestamps call the production policy directly, after the actual App.frame integration checks. The real renderer setter and App.resize delete and recreate actual WebGL shadow/scene resources. This is artificial policy pressure, not measured device FPS.');

      const scene = await page.evaluate(() => {
        for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on');
        App.game.render(1 / 60);
        const gl = App.rend.gl, w = Math.min(160, App.rend.W), h = Math.min(120, App.rend.H), pixels = new Uint8Array(w * h * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(Math.floor((App.rend.W - w) / 2), Math.floor((App.rend.H - h) / 2), w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const colors = new Set(); for (let i = 0; i < pixels.length; i += 4) colors.add([pixels[i] >> 3, pixels[i + 1] >> 3, pixels[i + 2] >> 3].join(','));
        return { width: App.rend.W, height: App.rend.H, colors: colors.size, gl: gl.getError(), alive: App.game.ac.alive, quality: App.rend.quality };
      });
      assert(scene.colors > 20 && scene.alive); assert.equal(scene.quality, 0); assert.equal(scene.gl, 0);
      const screenshot = name + '-session-fallback.png'; await page.screenshot({ path: path.join(output, screenshot), timeout: 90000 });
      screenshots.push('quality-policy/' + screenshot);
      record('The full original WebGL game renders after adaptive GPU resource replacement', scene,
        'Untouched production Game.render after the artificial pressure fixture. Final WebGL framebuffer has varied visible colors; a complete viewport screenshot is saved. No human playthrough or hardware frame-rate claim.');

      // Preserve the native game but expose the ordinary Ready Room for this
      // setting callback fixture. The clicks themselves use real UI handlers.
      await page.evaluate(() => { App.game.paused = true; App.show('ready'); });
      await click(page.locator('#tabs [data-tab="set"]'));
      await click(page.locator('.setrow').filter({ hasText: 'Graphics' }).getByRole('button', { name: 'Medium', exact: true }));
      const manual = await page.evaluate(() => ({ policy: QualityPolicy.inspect(App), saved: JSON.parse(localStorage.getItem('a6_set')).quality,
        requested: App.set.quality, effective: App.rend.quality, shadowSize: App.rend.shadowSize, gl: App.rend.gl.getError() }));
      assert.equal(manual.saved, 1); assert.equal(manual.requested, 1); assert.equal(manual.effective, 1);
      assert.equal(manual.policy.adaptive, false); assert.equal(manual.policy.changes, 0); assert.equal(manual.policy.warmup, 0);
      assert(manual.shadowSize > 1); assert.equal(manual.gl, 0);
      assert.deepEqual(errors, []); assert.deepEqual(missing, []);
      record('Native reapplication of the saved Graphics choice restores it and resets adaptation', { manual, errors, missing },
        'An explicit fixture pauses and exposes the existing Ready Room without replacing the game. Native Settings → Medium mouse/touch click executes the actual saved-setting callback, restores real shadow resources and starts a fresh policy session.');
    } catch (error) {
      await page.screenshot({ path: path.join(output, name + '-failure.png'), timeout: 90000 }).catch(() => {});
      await fs.writeFile(path.join(evidenceDir, 'quality-policy-failure.json'), JSON.stringify({ passed: false, profile: name, error: error.stack || String(error), errors, missing, results, screenshots }, null, 2));
      throw error;
    } finally { await context.close(); }
  }
  return { suite: 'quality-policy', passed: true, total: results.length, results, screenshots,
    physicalWindowsTested: false, actualIPhoneSafariTested: false,
    scope: 'Chromium/SwiftShader WebGL2 desktop and simulated iPhone landscape. Original frame/render integration plus explicitly synthetic policy cadence, real GPU resource replacement and native Settings clicks. No hardware FPS benchmark.' };
};
