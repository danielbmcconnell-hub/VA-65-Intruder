'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// GPU acceptance supplement. Mission entry is native; close-up aircraft and
// camera placements, and one isolated World.detonate are explicit fixtures.
// The separate dixie-strike suite proves genuine input-driven ballistics and
// carrier recovery. This file does not claim a flown sortie or device FPS.
module.exports = async function dixieVisualBrowser(browser, target, evidenceDir) {
  const results = [], screenshots = [], out = path.join(evidenceDir, 'dixie-visual');
  await fs.mkdir(out, { recursive: true });
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ].filter(p => !process.env.INTRUDER_DIXIE_VISUAL_PROFILE || p.name === process.env.INTRUDER_DIXIE_VISUAL_PROFILE);
  for (const profile of profiles) {
    const { name, ...options } = profile, context = await browser.newContext(options), page = await context.newPage();
    const click = locator => profile.hasTouch ? locator.tap() : locator.click();
    const errors = [], missing = [], digestTasks = [], runtimeSHA256 = {};
    page.setDefaultTimeout(90000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', response => {
      if (response.status() >= 400 && /\/assets\//.test(response.url())) missing.push({ url: response.url(), status: response.status() });
      const file = new URL(response.url()).pathname;
      if (response.ok() && /\/assets\/flight\/strike-(?:scene|experience|crew|checkpoint|effects)\.(?:js|css)$/.test(file)) digestTasks.push(response.body().then(bytes => { runtimeSHA256[file] = createHash('sha256').update(bytes).digest('hex'); }));
    });
    await context.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
      localStorage.setItem('a6_sawkeys', '1');
      let seed = 0x196603;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => window.__dixieVisualClock ? 0 : raf(t => { if (!window.__dixieVisualClock) cb(t); });
    });
    const record = (title, actual, method) => {
      results.push({ profile: name, name: title, passed: true, actual, method }); console.log('PASS Dixie visual ' + name + ' ' + title);
      fsSync.writeFileSync(path.join(evidenceDir, 'dixie-visual-progress.json'), JSON.stringify({ passed: false, complete: false, results, screenshots }, null, 2));
    };
    const shot = async label => { const file = name + '-' + label + '.png'; assert.equal(await page.evaluate(() => App.rend.gl.getError()), 0); await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('dixie-visual/' + file); };
    // This helper renders the original complete scene, temporarily replacing
    // camera placement alone, and restores the unchanged real aircraft after
    // that render. The captured depth/lighting/meshes are production passes.
    const renderFixture = async label => page.evaluate(label => {
      const g = App.game, R = App.rend, fixture = window.__dixieVisualFixture;
      const t = g.world.targets[fixture.targetIndex], visual = FlightStrikeScene.targetVisual(g, t);
      const feature = label === 'junction' ? FlightStrikeScene.chart(g).features.find(f => f.id === 'dixie-road-junction') : null;
      const focus = feature ? feature.p : visual.p, offset = feature ? [190, 155, 240] : [55, 46, 65];
      const eye = focus.map((n, i) => n + offset[i]), forward = focus.map((n, i) => n + (i === 1 ? 3 : 0) - eye[i]);
      const saved = { p: g.ac.p, v: g.ac.v, yaw: g.ac.yaw, pitch: g.ac.pitch, roll: g.ac.roll, extView: g.extView, camSm: g.camSm };
      g.ac.p = eye.slice(); g.ac.v = [0, 0, 0]; g.ac.yaw = Math.atan2(forward[0], -forward[2]); g.ac.pitch = -.35; g.ac.roll = 0; g.extView = false;
      const camera = R.setCamera, mesh = R.drawMesh, draws = [];
      R.setCamera = function () { return camera.call(this, eye, forward, [0, 1, 0], 48, 1.2, 60000, this.W / this.H); };
      R.drawMesh = function (name, data, count) { if (name.startsWith('bnStrike')) draws.push({ name, count }); return mesh.apply(this, arguments); };
      try { g.render(1 / 60); } finally { R.setCamera = camera; R.drawMesh = mesh; Object.assign(g.ac, { p: saved.p, v: saved.v, yaw: saved.yaw, pitch: saved.pitch, roll: saved.roll }); g.extView = saved.extView; g.camSm = saved.camSm; }
      // Read final tone-mapped WebGL framebuffer, independently of the HTML
      // HUD. Central pixels cover the same depot roof/debris in both states.
      const gl = R.gl, width = Math.min(240, R.W), height = Math.min(180, R.H), pixels = new Uint8Array(width * height * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(Math.floor((R.W - width) / 2), Math.floor((R.H - height) / 2), width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let distinct = new Set(), dark = 0, warm = 0;
      for (let i = 0; i < pixels.length; i += 4) { distinct.add([pixels[i] >> 3, pixels[i + 1] >> 3, pixels[i + 2] >> 3].join(',')); if (pixels[i] + pixels[i + 1] + pixels[i + 2] < 180) dark++; if (pixels[i] > pixels[i + 1] * 1.2 && pixels[i] > pixels[i + 2] * 1.4) warm++; }
      const key = label === 'intact' ? 'intactPixels' : label === 'cold-ruin' ? 'coldPixels' : 'lastPixels'; fixture[key] = pixels;
      let changedPixels = null;
      if (label === 'cold-ruin' && fixture.intactPixels?.length === pixels.length) { changedPixels = 0; for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i] - fixture.intactPixels[i]) + Math.abs(pixels[i + 1] - fixture.intactPixels[i + 1]) + Math.abs(pixels[i + 2] - fixture.intactPixels[i + 2]) > 12) changedPixels++; }
      return { label, targetIndex: fixture.targetIndex, visual, focus: focus.slice(), eye, draws, sceneInstances: draws.reduce((n, d) => n + d.count, 0) - (draws.find(d => d.name === 'bnStrikeDepot')?.count || 0) - (draws.find(d => d.name === 'bnStrikeRuin')?.count || 0), framebuffer: { width: R.W, height: R.H, sample: [width, height], distinct: distinct.size, dark, warm, changedPixels }, state: { depthWrites: gl.getParameter(gl.DEPTH_WRITEMASK), culling: gl.isEnabled(gl.CULL_FACE) }, gl: gl.getError() };
    }, label);
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
      const sourceSHA256 = createHash('sha256').update(await response.body()).digest('hex');
      await page.waitForFunction(() => window.App && window.FlightStrikeScene && window.FlightStrikeExperience);
      await click(page.locator('#bootGo')); await click(page.locator('#dixieReady')); await click(page.locator('#dixiePractice'));
      await page.waitForFunction(() => App.game?.strikeExperience && App.game.mis.id === 'm2' && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
      await page.evaluate(() => { window.__dixieVisualClock = true; }); await page.waitForTimeout(50);
      await page.evaluate(() => { App.game.render(1 / 60); App.game.syncControls(); });
      if (await page.locator('#teach.on').count()) await click(page.locator('#teach'));
      if (await page.locator('#legend.on').count()) await page.keyboard.press('h');
      await click(page.locator('#dixieLook'));
      await Promise.all(digestTasks);
      const entry = await page.evaluate(() => ({ mission: App.game.mis.id, targetCount: App.game.world.targets.length, alive: App.game.ac.alive, onDeck: App.game.ac.onDeck, rightSeat: App.game.rightSeat, dropped: App.game.world.score.dropped, killed: App.game.world.score.killed, look: App.game.strikeExperience.look, gpu: App.rend.gl.getParameter(App.rend.gl.VERSION) }));
      assert.equal(entry.mission, 'm2'); assert.equal(entry.targetCount, 5); assert.equal(entry.alive, true); assert.equal(entry.onDeck, false); assert.equal(entry.rightSeat, true); assert.equal(entry.killed, 0); assert.equal(entry.dropped, 0); assert.equal(entry.look, true); assert.match(entry.gpu, /^WebGL 2/);
      record('Native short B/N practice entry launches the original five-target Dixie sortie without pre-earned hits or kills', { sourceSHA256, runtimeSHA256, entry }, 'Native Ready Room → DIXIE briefing → SHORT B/N PRACTICE → LOOK OUT, using actual mouse or emulated touch. Automatic RAF is suspended after the production loader; this is not a completed sortie.');

      const geometry = await page.evaluate(() => {
        const g = App.game, R = App.rend, gl = R.gl, s = FlightStrikeScene.inspect(g), chart = FlightStrikeBoard.recognition(g).chart;
        const names = ['Depot', 'Ruin', 'Embers', 'Shed', 'Tower', 'Road', 'Truck'].map(n => 'bnStrike' + n);
        const meshes = names.map(name => ({ name, indices: R.meshes[name]?.n || 0, uploaded: !!R.meshes[name] && gl.isVertexArray(R.meshes[name].vao) }));
        const handles = names.map(name => R.meshes[name]?.vao); FlightStrikeScene.ensureMeshes(R); FlightStrikeScene.ensureMeshes(R);
        const reused = names.every((n, i) => R.meshes[n]?.vao === handles[i]);
        const sampleErrors = [];
        for (const item of s.items.filter(i => i.mesh !== 'bnStrikeRoad')) {
          const co = Math.cos(item.rot[0]), si = Math.sin(item.rot[0]);
          for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const u = item.hx * i / 2, v = item.hz * j / 2, h = Math.max(0, terrainH(item.p[0] + u * co - v * si, item.p[2] + u * si + v * co)); if (item.p[1] < h - .01 || item.p[1] - (item.mesh === 'bnStrikeTruck' ? 5 : 12) > h + .11) sampleErrors.push({ mesh: item.mesh, delta: item.p[1] - h }); }
        }
        const lod = [0, 1, 2].map(q => ({ quality: q, count: FlightStrikeScene.instances(g, g.world.briefed, q, () => {}) }));
        const targetIndex = g.world.targets.findIndex(t => !!FlightStrikeScene.targetVisual(g, t)); if (targetIndex < 0) throw new Error('No depot supports the actual scene visual');
        window.__dixieVisualFixture = { targetIndex, initialAircraft: JSON.stringify(g.ac), targetPosition: g.world.targets[targetIndex].p.slice(), targetHP: g.world.targets[targetIndex].hp };
        return { meshes, reused, sampleErrors, count: s.count, lod, limits: FlightStrikeScene.limits, publicFeatures: s.features, chartFeatures: chart.features, gl: gl.getError() };
      });
      assert(geometry.meshes.every(m => m.uploaded && m.indices > 0)); assert.equal(geometry.reused, true); assert.deepEqual(geometry.sampleErrors, []); assert.equal(geometry.gl, 0);
      for (const l of geometry.lod) assert(l.count > 30 && l.count <= [72, 108, 132][l.quality]);
      for (const feature of geometry.publicFeatures) assert.deepEqual(geometry.chartFeatures.find(f => f.id === feature.id)?.p, feature.p);
      record('Seven real GPU meshes, terrain-supported foundations and public chart positions agree within mobile instance budgets', geometry, 'Actual uploaded VAOs and production terrain sampled across 5×5 rotated footprints. Direct scene LOD calls are isolated renderer queries and do not alter targets or aircraft.');

      const intact = await renderFixture('intact'); assert(intact.draws.some(d => d.name === 'bnStrikeDepot' && d.count > 0)); assert.equal(intact.visual.destroyed, false); assert(intact.framebuffer.distinct > 20); assert.equal(intact.gl, 0); await shot('fixture-intact-depot');
      const junction = await renderFixture('junction'); assert(junction.draws.some(d => d.name === 'bnStrikeTower')); assert.equal(junction.gl, 0); await shot('fixture-grounded-junction');
      record('Actual WebGL views show a solid pitched-roof depot and grounded junction, tower and road landmarks', { intact, junction }, 'Explicit close-up aircraft/camera placement fixtures render the complete production world and original HUD. The real aircraft is restored immediately after each render. These are geometry views, not claimed flown approaches.');

      const blast = await page.evaluate(() => {
        const g = App.game, w = g.world, f = __dixieVisualFixture, t = w.targets[f.targetIndex];
        const before = { alive: t.alive, hp: t.hp, p: t.p.slice(), killed: w.score.killed, secs: w.secs.length };
        // An explicitly isolated real blast, not a target alive/HP assignment.
        w.detonate(t.p.slice(), 1, 2, 100, 'visual-acceptance-fixture');
        for (let n = 0; n < 60; n++) w.step(1 / 30, g.ac, {});
        return { before, after: { alive: t.alive, hp: t.hp, p: t.p.slice(), killed: w.score.killed, burn: t.burn, secs: w.secs.length }, effects: FlightStrikeEffects.inspect(w), visual: FlightStrikeScene.targetVisual(g, t), lights: FlightStrikeScene.lights(g, t.p, 0), originalAircraftRetained: JSON.stringify(g.ac) === f.initialAircraft, gl: App.rend.gl.getError() };
      });
      assert.equal(blast.before.alive, true); assert.equal(blast.after.alive, false); assert(blast.after.hp <= 0); assert.deepEqual(blast.after.p, blast.before.p); assert.equal(blast.visual.mesh, 'bnStrikeRuin'); assert(blast.after.killed > blast.before.killed); assert(blast.after.burn > .9); assert(blast.effects.targets.length > 0); assert(blast.lights.length === 1); assert(blast.originalAircraftRetained); assert.equal(blast.gl, 0);
      const burning = await renderFixture('burning'); assert(burning.draws.some(d => d.name === 'bnStrikeRuin')); assert(burning.draws.some(d => d.name === 'bnStrikeEmbers')); await shot('fixture-real-blast-burning-ruin');
      record('An actual World blast destroys the owned depot and gates the real ruin, embers, light and existing secondary effects', { blast, burning }, 'Explicit isolated World.detonate at the unchanged target position plus two seconds of original World.step. No target HP/alive/burn/score assignments and no fabricated hit; this supplement does not claim a player-released ballistic bomb.');

      const aged = await page.evaluate(() => {
        const g = App.game, w = g.world, t = w.targets[__dixieVisualFixture.targetIndex];
        for (let n = 0; n < 95 * 30; n++) w.step(1 / 30, g.ac, {});
        return { clock: w.t, alive: t.alive, hp: t.hp, burn: t.burn, secondaryQueue: w.secs.length, visual: FlightStrikeScene.targetVisual(g, t), lights: FlightStrikeScene.lights(g, t.p, 2), aircraftAlive: g.ac.alive, originalAircraftRetained: JSON.stringify(g.ac) === __dixieVisualFixture.initialAircraft };
      });
      assert.equal(aged.burn, 0); assert.equal(aged.secondaryQueue, 0); assert.equal(aged.visual.mesh, 'bnStrikeRuin'); assert.deepEqual(aged.lights, []); assert(aged.aircraftAlive && aged.originalAircraftRetained);
      const cold = await renderFixture('cold-ruin'); assert(cold.draws.some(d => d.name === 'bnStrikeRuin')); assert(!cold.draws.some(d => d.name === 'bnStrikeEmbers')); assert(cold.framebuffer.changedPixels > 100); assert.equal(cold.gl, 0); await shot('fixture-persistent-cold-ruin');
      record('The depot remains visibly ruined after original fires and secondary effects expire instead of reverting to an intact shed', { aged, cold }, 'Ninety-five further seconds of original World.step with the original safe practice aircraft unchanged. Same oblique camera and final WebGL framebuffer ROI as the intact capture; changed-pixel evidence supplements the actual ruin draw.');

      const supported = await page.evaluate(() => {
        const R = App.rend, g = App.game, names = Object.keys(R.meshes).filter(n => n.startsWith('bnStrike'));
        window.__dixieVisualRecovery = { renderer: R, game: g, aircraft: JSON.stringify(g.ac), targets: JSON.stringify(g.world.targets), score: JSON.stringify(g.world.score), experience: JSON.stringify(g.strikeExperience), names, handles: names.map(n => R.meshes[n].vao), audio: App.audio };
        const ext = R.gl.getExtension('WEBGL_lose_context'); if (!ext) return false; window.__dixieVisualLoss = ext; ext.loseContext(); return true;
      });
      assert.equal(supported, true);
      await page.waitForFunction(() => App.graphicsContextLost && App.game?.paused && !App.rend, null, { polling: 50 }); await page.waitForTimeout(200); await page.evaluate(() => __dixieVisualLoss.restoreContext());
      await page.waitForFunction(() => !App.graphicsContextLost && App.rend && App.rend !== __dixieVisualRecovery.renderer && App.game?.paused, null, { polling: 50 });
      const restored = await page.evaluate(() => {
        const g = App.game, R = App.rend, b = __dixieVisualRecovery; g.render(1 / 60);
        const handles = b.names.map(n => R.meshes[n]?.vao); FlightStrikeScene.ensureMeshes(R); FlightStrikeScene.ensureMeshes(R);
        return { sameGame: g === b.game, sameAircraft: JSON.stringify(g.ac) === b.aircraft, sameTargets: JSON.stringify(g.world.targets) === b.targets, sameScore: JSON.stringify(g.world.score) === b.score, sameExperience: JSON.stringify(g.strikeExperience) === b.experience, sameAudio: App.audio === b.audio, newResources: b.names.every((n, i) => R.meshes[n]?.vao !== b.handles[i] && R.gl.isVertexArray(R.meshes[n]?.vao)), reused: b.names.every((n, i) => R.meshes[n]?.vao === handles[i]), count: b.names.length, panels: document.querySelectorAll('#dixiePanel').length, gl: R.gl.getError() };
      });
      assert(restored.sameGame && restored.sameAircraft && restored.sameTargets && restored.sameScore && restored.sameExperience && restored.sameAudio && restored.newResources && restored.reused); assert.equal(restored.count, 7); assert.equal(restored.panels, 1); assert.equal(restored.gl, 0);
      await click(page.locator('#graphicsRecovery').getByRole('button', { name: 'Resume mission', exact: true }));
      const resumed = await renderFixture('restored-ruin'); assert(resumed.draws.some(d => d.name === 'bnStrikeRuin')); assert.equal(resumed.gl, 0); await shot('fixture-restored-ruin');
      assert.deepEqual(errors, []); assert.deepEqual(missing, []);
      record('Real context restoration recreates all seven scene GPU resources once while preserving mission, aircraft, targets, score, audio and one control panel', { restored, resumed, errors, missing }, 'Real WEBGL_lose_context loss and restore plus the native Resume mission control. Repeated ensureMeshes calls reuse restored VAOs. This is context-recovery proof, not a physical iPhone, frame-rate or complete audio-source leak audit.');
    } catch (error) {
      const failure = { suite: 'dixie-visual', passed: false, complete: false, profile: name, error: error.stack || String(error), errors, missing, results, screenshots };
      await fs.writeFile(path.join(evidenceDir, 'dixie-visual-failure.json'), JSON.stringify(failure, null, 2));
      await page.screenshot({ path: path.join(out, name + '-failure.png'), timeout: 90000 }).catch(() => {}); throw error;
    } finally { await context.close(); }
  }
  await fs.rm(path.join(evidenceDir, 'dixie-visual-progress.json'), { force: true });
  return { suite: 'dixie-visual', passed: true, total: results.length, results, screenshots, physicalWindowsTested: false, actualIPhoneSafariTested: false, scope: 'Chromium/SwiftShader actual WebGL2 on desktop and simulated iPhone landscape. Native practice entry followed by declared camera/aircraft placement and isolated real-blast fixtures. Complements, rather than replaces, dixie-strike native ballistic sortie and carrier-recovery tests.' };
};
