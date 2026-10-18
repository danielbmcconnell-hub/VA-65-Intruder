'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Presentation/recognition acceptance in the production custom WebGL2 engine.
// Native controls use actual mouse/keyboard or CDP touch. Explicit camera,
// landmark and fresh-flak fixtures below exercise rendering, not a completed
// combat sortie. The existing Willard end-to-end suite remains that proof.
module.exports = async function immersionBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'immersion'); await fs.mkdir(out, { recursive: true });
  const results = [], screenshots = [];
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ].filter(p => !process.env.INTRUDER_IMMERSION_PROFILE || p.name === process.env.INTRUDER_IMMERSION_PROFILE);
  for (const profile of profiles) {
    const { name, ...options } = profile, context = await browser.newContext(options), page = await context.newPage();
    const errors = [], missing = [], runtimeSHA256 = {}, digestTasks = [], cdp = profile.hasTouch ? await context.newCDPSession(page) : null;
    const click = locator => profile.hasTouch ? locator.tap() : locator.click();
    const record = (title, actual, fixture) => { results.push({ profile: name, name: title, passed: true, actual, fixture }); console.log('PASS immersion ' + name + ' ' + title); fsSync.writeFileSync(path.join(evidenceDir, 'immersion-progress.json'), JSON.stringify({ suite: 'immersion', passed: false, complete: false, completedChecks: results.length, results, screenshots }, null, 2)); };
    const shot = async key => { const file = name + '-' + key + '.png'; assert.equal(await page.evaluate(() => App.rend.gl.getError()), 0); await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('immersion/' + file); };
    page.setDefaultTimeout(90000); page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && /\/assets\//.test(r.url())) missing.push({ url: r.url(), status: r.status() }); if (r.ok() && /\/assets\/(?:flight|willard)\/[^/]+\.(?:js|css)$/.test(new URL(r.url()).pathname)) digestTasks.push(r.body().then(bytes => { runtimeSHA256[new URL(r.url()).pathname] = createHash('sha256').update(bytes).digest('hex'); })); });
    await context.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, assist: 1, sound: 0, voices: 0, invert: 0, sens: 1, mouse: 0, seat: 0 })); localStorage.setItem('a6_sawkeys', '1');
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => window.__immersionFixedClock ? 0 : raf(t => { if (!window.__immersionFixedClock) cb(t); });
    });
    const loaded = async () => {
      await page.waitForFunction(() => App.game?.mis?.willard && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
      await page.evaluate(() => { window.__immersionFixedClock = true; App.game.paused = false; for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on'); for (const key of Object.keys(App.keys)) App.keys[key] = 0; for (const key of ['pitch', 'roll', 'thrUp', 'thrDn', 'commit']) App.gctl[key] = 0; });
      await page.waitForTimeout(30);
      await page.evaluate(() => { App.game.render(1 / 60); App.game.syncControls(); });
    };
    const nativeRange = async (id, fraction) => {
      const input = page.locator('#' + id); await input.scrollIntoViewIfNeeded(); const box = await input.boundingBox(); assert.ok(box && box.width > 80 && box.height >= 24);
      if (cdp) {
        const x = box.x + box.width * fraction, y = box.y + box.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 51, radiusX: 5, radiusY: 5, force: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 1, y, id: 51, radiusX: 5, radiusY: 5, force: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else await input.click({ position: { x: box.width * fraction, y: box.height / 2 } });
      return Number(await input.inputValue());
    };
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
      const sourceSHA256 = createHash('sha256').update(await response.body()).digest('hex');
      await page.waitForFunction(() => window.App && window.FlightImmersion && window.FlightRouteScene && window.WillardPresentation);
      await click(page.locator('#bootGo')); await click(page.locator('#readyBody .mcard[data-mission="willard"]'));
      const slider = page.locator('#flightNightVisibility'); await slider.waitFor({ state: 'visible' });
      assert.equal(await slider.getAttribute('min'), '0'); assert.equal(await slider.getAttribute('max'), '100');
      const briefVisibility = await nativeRange('flightNightVisibility', .8); assert.ok(briefVisibility >= 65 && briefVisibility <= 95);
      await page.locator('#willardStrike').uncheck(); await click(page.locator('#willardPlay')); await loaded();
      await Promise.all(digestTasks);
      const initial = await page.evaluate(() => ({ mission: App.game.mis.id, phase: App.game.willard.phase, alive: App.game.ac.alive, gpu: App.rend.gl.getParameter(App.rend.gl.VERSION), atmosphere: JSON.parse(JSON.stringify(App.game.atm)) }));
      assert.equal(initial.mission, 'willard'); assert.equal(initial.alive, true); assert.match(initial.gpu, /^WebGL 2/);
      record('Native mission briefing exposes a persistent night-visibility adjustment and launches the original WebGL2 mission', { sourceSHA256, runtimeSHA256: { ...runtimeSHA256 }, briefVisibility, initial }, profile.hasTouch ? 'Actual CDP touch on the 844×390 landscape layout; Chromium emulation, not physical iPhone Safari.' : 'Native mouse slider and mission controls. No replacement renderer or aircraft physics.');

      // Filled below once the feature APIs are frozen; source ownership stays
      // within this acceptance file while runtime modules are implemented.
      const beforeAdjustment = await page.evaluate(() => {
        const g = App.game; g.render(1 / 60);
        return { base: JSON.stringify(g.atm), rendered: JSON.parse(JSON.stringify(App.rend.atm)), visibility: FlightRouteScene.getVisibility(), contrastUniform: App.rend.gl.getUniform(App.rend.pMesh, App.rend.pMesh.u.uNightContrast), aircraft: JSON.stringify(g.ac), time: g.t };
      });
      assert.ok(Math.abs(beforeAdjustment.visibility * 100 - briefVisibility) <= 1);
      assert.equal(beforeAdjustment.rendered.nightContrast, 1); assert.equal(beforeAdjustment.contrastUniform, 1);
      await click(page.locator('#willardPause')); assert.equal(await page.evaluate(() => App.game.paused), true);
      const pausedVisibility = await nativeRange('flightNightPause', .2); assert.ok(pausedVisibility >= 5 && pausedVisibility <= 35);
      // Focused input must consume steering/throttle keys. Actual paused
      // updates cannot alter aircraft, enemy clocks or mission progression.
      await page.locator('#flightNightPause').focus(); await page.keyboard.press('ArrowRight');
      const adjustment = await page.evaluate(() => {
        const g = App.game; for (let n = 0; n < 120; n++) g.update(1 / 60); g.render(1 / 60);
        return { base: JSON.stringify(g.atm), rendered: JSON.parse(JSON.stringify(App.rend.atm)), visibility: FlightRouteScene.getVisibility(), aircraft: JSON.stringify(g.ac), time: g.t, inputs: { ...App.keys }, gctl: { pitch: App.gctl.pitch, roll: App.gctl.roll, thrUp: App.gctl.thrUp, thrDn: App.gctl.thrDn }, slider: Number(document.getElementById('flightNightPause').value) };
      });
      assert.equal(adjustment.base, beforeAdjustment.base); assert.equal(adjustment.aircraft, beforeAdjustment.aircraft); assert.equal(adjustment.time, beforeAdjustment.time);
      assert.notDeepEqual(adjustment.rendered, beforeAdjustment.rendered); assert.ok(Math.abs(adjustment.visibility * 100 - adjustment.slider) <= 1);
      assert.ok(!adjustment.inputs.ArrowRight); assert.deepEqual(adjustment.gctl, { pitch: 0, roll: 0, thrUp: 0, thrDn: 0 });
      await shot('paused-night-visibility'); await click(page.locator('#pauseBody').getByRole('button', { name: 'Resume', exact: true }));
      record('Native paused visibility adjustment changes rendered night light without modifying the mission atmosphere, aircraft, clock or flight inputs', { beforeAdjustment, adjustment }, 'Two seconds of original paused Game.update attempts; mouse/CDP touch slider interaction and focused keyboard ArrowRight. Only presentation settings change.');

      // The production mission itself spawns its MiG after the supported
      // no-strike opening. Neutral original physics is sufficient here.
      await page.evaluate(async () => { const g = App.game; for (let i = 0; i < 13 * 60; i++) g.update(1 / 60); await WillardSprites.load(App.rend); g.render(1 / 60); });
      assert.equal(await page.evaluate(() => !!App.game.willard.enemy), true);
      await click(page.locator('#willardRear'));
      const rearWide = await page.evaluate(() => { const g = App.game; g.render(1 / 60); return { eye: App.rend.eye.slice(), projectionY: App.rend.matP[5], fov: WillardPresentation.rearFov(g), enemy: JSON.stringify(g.willard.enemy), aircraft: JSON.stringify(g.ac), rear: g.willard.rear, zoom: !!g.willard.rearZoom, art: WillardSprites.inspect(App.rend).last }; });
      assert.equal(rearWide.fov, 54); assert.equal(rearWide.rear, true); assert.equal(rearWide.zoom, false);
      await shot('rear-wide-view'); await click(page.locator('#willardZoom'));
      const rearZoom = await page.evaluate(() => { const g = App.game; g.render(1 / 60); return { eye: App.rend.eye.slice(), projectionY: App.rend.matP[5], fov: WillardPresentation.rearFov(g), enemy: JSON.stringify(g.willard.enemy), aircraft: JSON.stringify(g.ac), rear: g.willard.rear, zoom: !!g.willard.rearZoom, art: WillardSprites.inspect(App.rend).last }; });
      assert.equal(rearZoom.fov, 34); assert.equal(rearZoom.zoom, true); assert.deepEqual(rearZoom.eye, rearWide.eye); assert.equal(rearZoom.enemy, rearWide.enemy); assert.equal(rearZoom.aircraft, rearWide.aircraft);
      assert.ok(Math.abs(rearWide.projectionY - 1 / Math.tan(54 * Math.PI / 360)) < .00001); assert.ok(Math.abs(rearZoom.projectionY - 1 / Math.tan(34 * Math.PI / 360)) < .00001);
      assert.ok(rearZoom.art.widthPixels > rearWide.art.widthPixels * 1.6); await shot('rear-magnified-view');
      const boxes = await page.evaluate(() => {
        const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
        const zoom = rect('willardZoom'), others = ['stick', 'thrUp', 'thrDn', 'pickle', 'willardRear', 'willardCamera', 'willardRetry', 'willardPause'].map(rect).filter(b => b.width && b.height);
        return { zoom, collisions: others.filter(b => zoom.x < b.right && zoom.right > b.x && zoom.y < b.bottom && zoom.bottom > b.y).map(b => b.id) };
      });
      assert.ok(boxes.zoom.width >= 44 && boxes.zoom.height >= 44); assert.deepEqual(boxes.collisions, []);
      await click(page.locator('#willardRear')); assert.equal(await page.evaluate(() => !!App.game.willard.rearZoom || !!App.game.willard.rear), false);
      await click(page.locator('#willardRear')); await click(page.locator('#willardZoom')); await click(page.locator('#willardCamera'));
      assert.equal(await page.evaluate(() => !!App.game.willard.rearZoom || !!App.game.willard.rear), false);
      // Repeated native toggle pairs must not accumulate duplicate listeners.
      for (let n = 0; n < 3; n++) { await click(page.locator('#willardRear')); await click(page.locator('#willardZoom')); assert.equal(await page.evaluate(() => !!App.game.willard.rearZoom), true); await click(page.locator('#willardRear')); }
      assert.equal(await page.locator('#willardZoom:visible').count(), 0);
      const cameraBeforeShortcut = await page.evaluate(() => !!App.game.extView);
      if (!profile.hasTouch) { await page.keyboard.press('h'); await page.keyboard.press('z'); assert.equal(await page.evaluate(() => !!App.game.willard.rearZoom), true); await page.keyboard.press('v'); }
      else { await click(page.locator('#willardRear')); await click(page.locator('#willardZoom')); await click(page.locator('#btnView')); }
      const shortcut = await page.evaluate(() => ({ rear: !!App.game.willard.rear, zoom: !!App.game.willard.rearZoom, external: !!App.game.extView, inputReleased: !App.keys.KeyH && !App.keys.KeyZ && !App.keys.KeyV }));
      assert.equal(shortcut.rear || shortcut.zoom, false); assert.equal(shortcut.external, !cameraBeforeShortcut); assert.equal(shortcut.inputReleased, true);
      record('Native rear magnification changes the real perspective from 54° to 34° around the same eye and physical MiG; forward/camera views clear it', { rearWide, rearZoom, boxes, repeatedTogglePairs: 3, shortcut }, 'Thirteen seconds of original no-strike mission physics naturally spawn the interceptor. Subsequent paused-clock comparisons render the same aircraft and enemy, using native mouse/CDP controls. No enemy position or camera eye is assigned for this comparison.');

      const scene = await page.evaluate(() => {
        const g = App.game, R = App.rend, gl = R.gl, s = FlightRouteScene.inspect(g), chart = FlightStrikeBoard.recognition(g).chart;
        const names = ['House', 'Rail', 'Wagon', 'Road', 'Factory', 'Lamp', 'Glow', 'Bridge', 'Pier'].map(n => 'bnRoute' + n);
        const meshes = names.map(name => ({ name, indices: R.meshes[name]?.n || 0, uploaded: !!R.meshes[name] && gl.isVertexArray(R.meshes[name].vao) }));
        const handles = names.map(name => R.meshes[name]?.vao); FlightRouteScene.ensureMeshes(R); FlightRouteScene.ensureMeshes(R);
        const reused = names.every((name, i) => R.meshes[name]?.vao === handles[i]);
        const mountErrors = s.items.filter(i => i.ground && !['bnRouteRoad', 'bnRouteRail'].includes(i.m)).map(i => ({ mesh: i.m, delta: i.p[1] - Math.max(0, terrainH(i.p[0], i.p[2])) })).filter(i => i.delta < -.11 || i.delta > 15);
        const lod = [0, 1, 2].map(q => { const selected = []; const count = FlightRouteScene.instances(g, s.features[0].p, q, (m, p, rot, scale) => selected.push({ m, p: p.slice(), rot: rot.slice(), scale: scale.slice() })); return { q, count, selected }; });
        return { scene: s, chart, meshes, reused, mountErrors, lod, limits: FlightRouteScene.limits, gl: gl.getError() };
      });
      assert.equal(scene.scene.active, true); assert.ok(scene.scene.count > 80); assert.ok(scene.scene.features.length >= 4); assert.equal(scene.scene.count, scene.scene.items.length);
      assert.equal(scene.reused, true); assert.ok(scene.meshes.every(m => m.uploaded && m.indices > 0)); assert.deepEqual(scene.mountErrors, []); assert.equal(scene.gl, 0);
      for (const q of scene.lod) { assert.ok(q.count > 0); assert.ok(q.count <= [scene.limits.low, scene.limits.medium, scene.limits.high][q.q]); assert.equal(q.count, q.selected.length); }
      for (const f of scene.scene.features) { const onChart = scene.chart.features.find(c => c.id === f.id); assert.ok(onChart, f.id); assert.deepEqual(onChart.p, f.p); }
      if (scene.scene.river) { assert.ok(scene.scene.river.channel >= .82); const [a, b] = [scene.scene.river.p0, scene.scene.river.p1]; assert.ok(a[1] >= 0 && b[1] >= 0); }
      record('Briefed pilotage features match grounded world geometry, nine genuine GPU meshes and bounded distance/quality LOD', scene, 'The chart uses the same authored world positions as production route geometry. Geometry support is checked against the actual terrain; the bridge crosses the actual procedural channel field. Direct LOD calls are explicit renderer fixtures, not a flown route.');
      const landmarkViews = [];
      for (const id of ['rail-sidings', 'river-crossing', 'twin-stacks', 'coastal-hamlet']) {
        const view = await page.evaluate(id => {
          const g = App.game, R = App.rend, feature = FlightRouteScene.inspect(g).features.find(f => f.id === id); if (!feature) return null;
          const saved = { p: g.ac.p, v: g.ac.v, yaw: g.ac.yaw, pitch: g.ac.pitch, roll: g.ac.roll, extView: g.extView, camSm: g.camSm, rear: g.willard.rear, rearZoom: g.willard.rearZoom };
          const eye = feature.p.map((n, i) => n + [240, 180, 320][i]), fwd = feature.p.map((n, i) => n - eye[i]);
          g.ac.p = eye.slice(); g.ac.v = [0, 0, 0]; g.ac.yaw = Math.atan2(fwd[0], -fwd[2]); g.ac.pitch = -.4; g.ac.roll = 0; g.extView = false; g.willard.rear = false; g.willard.rearZoom = false;
          const camera = R.setCamera, draw = R.drawMesh, draws = [];
          R.setCamera = function () { return camera.call(this, eye, fwd, [0, 1, 0], 55, 1.2, 60000, this.W / this.H); };
          R.drawMesh = function (name, data, count) { if (name.startsWith('bnRoute')) draws.push({ name, count }); return draw.apply(this, arguments); };
          try { g.render(1 / 60); } finally { R.setCamera = camera; R.drawMesh = draw; Object.assign(g.ac, { p: saved.p, v: saved.v, yaw: saved.yaw, pitch: saved.pitch, roll: saved.roll }); Object.assign(g, { extView: saved.extView, camSm: saved.camSm }); g.willard.rear = saved.rear; g.willard.rearZoom = saved.rearZoom; }
          return { feature, eye, draws, light: FlightImmersion.inspect(g), gl: R.gl.getError() };
        }, id);
        if (!view) continue;
        assert.ok(view.draws.some(d => d.count > 0)); assert.ok(view.draws.reduce((n, d) => n + d.count, 0) <= scene.limits.low); assert.equal(view.gl, 0); landmarkViews.push(view); await shot('landmark-' + id);
      }
      assert.ok(landmarkViews.length >= 3);
      record('Actual WebGL views render distinctive railway, bridge, industrial and coastal pilotage scenery with warm local lights', landmarkViews, 'Explicit visual fixtures place the unchanged aircraft/camera at each public landmark, render through original Game.render and original drawMesh, then restore the aircraft. These screenshots are inspected geometry views, not evidence of flying the entire route.');

      const flash = await page.evaluate(() => {
        const g = App.game, R = App.rend, gl = R.gl, originalBursts = g.willard.flak.bursts;
        const eye = [g.ac.p[0], g.ac.p[1], g.ac.p[2]], wall = [eye[0], eye[1], eye[2] - 70], m = new MB();
        m.quad([-24, -24, 0], [24, -24, 0], [24, 24, 0], [-24, 24, 0], [.6, .6, .6]); R.meshFromBuilder('immersionLightFixture', m);
        const inst = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, wall[0],wall[1],wall[2],1, 1,1,1,0]);
        const fixture = WillardFlak.create({ center: eye, terrainH: () => 0, seed: 1966 }); fixture.guns.forEach(gun => { gun.alive = false; });
        fixture.shells.push({ id: 1, gunId: 'explicit-fuse-fixture', targetId: 'a6', p: [wall[0], wall[1] + 8, wall[2] + 18], v: [0, 0, 0], age: 0, fuse: 1 / 30, radius: 65, power: 1, born: 0 });
        const fresh = WillardFlak.step(fixture, 1 / 30, { terrainH: () => 0, quality: 0 });
        const pixel = () => { R.setCamera(eye, [0, 0, -1], [0, 1, 0], 55, 1.2, 60000, R.W / R.H); R.begin(); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); R.drawMesh('immersionLightFixture', inst, 1); const readType = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE), half = readType === gl.HALF_FLOAT, p = readType === gl.FLOAT ? new Float32Array(4) : half ? new Uint16Array(4) : new Uint8Array(4); gl.readPixels(R.W >> 1, R.H >> 1, 1, 1, gl.RGBA, readType, p); const halfValue = n => { const sign = n & 32768 ? -1 : 1, exponent = n >> 10 & 31, mantissa = n & 1023; return sign * (exponent ? exponent === 31 ? Infinity : 2 ** (exponent - 15) * (1 + mantissa / 1024) : 2 ** -14 * mantissa / 1024); }; return Array.from(p, n => readType === gl.FLOAT ? Math.round(n * 255) : half ? Math.round(halfValue(n) * 255) : n); };
        let dark, lit, lights, metadata, expired;
        try {
          g.willard.flak.bursts = []; R.setFires(FlightImmersion.lights(g, eye, [], 0)); dark = pixel();
          g.willard.flak.bursts = fixture.bursts; lights = FlightImmersion.lights(g, eye, [], 0); metadata = FlightImmersion.inspect(g); R.setFires(lights); lit = pixel();
          fixture.bursts.forEach(b => { b.age = .43; }); expired = FlightImmersion.lights(g, eye, [], 0);
        } finally { g.willard.flak.bursts = originalBursts; g.render(1 / 60); }
        return { fresh, stats: fixture.stats, dark, lit, lights, metadata, expired, gl: gl.getError() };
      });
      assert.equal(flash.fresh.length, 1); assert.equal(flash.stats.detonated, 1); assert.equal(flash.metadata.sourceCounts.flak, 1); assert.ok(flash.lights.length <= 4); assert.ok(flash.lit.slice(0, 3).reduce((a, n, i) => a + n - flash.dark[i], 0) > 20); assert.ok(flash.expired.every(l => !flash.lights.some(f => f[0] === l[0] && f[1] === l[1] && f[2] === l[2])) || flash.expired.length < flash.lights.length); assert.equal(flash.gl, 0);
      record('A production fused flak shell briefly illuminates real GPU geometry and expires within the bounded mobile light budget', flash, 'Explicit isolated physical-shell fixture: production WillardFlak integrates and detonates a 1/30-second shell with all fixture guns disabled. Its emitted burst is briefly supplied to production FlightImmersion.lights. No real mission damage, AI, outcome or target is changed. GPU pixels compare the same wall with and without this actual fused-burst light.');

      const recoveryBefore = await page.evaluate(() => {
        const R = App.rend, names = Object.keys(R.meshes).filter(n => n.startsWith('bnRoute'));
        window.__immersionRecovery = { game: App.game, renderer: R, names, handles: names.map(n => R.meshes[n].vao), aircraft: JSON.stringify(App.game.ac), visibility: FlightRouteScene.getVisibility() };
        const ext = R.gl.getExtension('WEBGL_lose_context'); if (!ext) return false; window.__immersionLoss = ext; ext.loseContext(); return true;
      });
      assert.equal(recoveryBefore, true);
      await page.waitForFunction(() => App.graphicsContextLost && App.game?.paused && !App.rend, null, { polling: 50 }); await page.waitForTimeout(200); await page.evaluate(() => __immersionLoss.restoreContext());
      await page.waitForFunction(() => !App.graphicsContextLost && App.rend && App.rend !== __immersionRecovery.renderer && App.game?.paused, null, { polling: 50 });
      const recovery = await page.evaluate(() => {
        const R = App.rend, g = App.game, before = __immersionRecovery; g.render(1 / 60);
        const handles = before.names.map(n => R.meshes[n]?.vao); FlightRouteScene.ensureMeshes(R); FlightRouteScene.ensureMeshes(R);
        return { sameGame: before.game === g, sameAircraft: before.aircraft === JSON.stringify(g.ac), visibility: FlightRouteScene.getVisibility(), previousVisibility: before.visibility,
          replacedResources: before.names.every((n, i) => R.meshes[n]?.vao !== before.handles[i] && R.gl.isVertexArray(R.meshes[n]?.vao)), reusedResources: before.names.every((n, i) => R.meshes[n]?.vao === handles[i]), meshes: before.names, renderedNight: R.atm.nightContrast, gl: R.gl.getError() };
      });
      assert.equal(recovery.sameGame && recovery.sameAircraft && recovery.replacedResources && recovery.reusedResources, true); assert.equal(recovery.visibility, recovery.previousVisibility); assert.equal(recovery.meshes.length, 9); assert.equal(recovery.renderedNight, 1); assert.equal(recovery.gl, 0);
      await click(page.locator('#graphicsRecovery').getByRole('button', { name: 'Resume mission', exact: true }));
      await page.evaluate(() => { App.game.render(1 / 60); App.game.syncControls(); WillardPresentation.render(App.game); });
      record('Real context loss recreates route GPU resources once and preserves mission, aircraft and saved night visibility', recovery, 'Real WEBGL_lose_context loss/restoration, existing recovery overlay and native Resume mission; repeated ensureMeshes calls retain the restored VAOs.');

      await click(page.locator('#willardPause')); await click(page.locator('#pauseBody').getByRole('button', { name: 'Ready Room', exact: true }));
      assert.equal(await page.evaluate(() => App.game), null);
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.App && window.FlightRouteScene); await click(page.locator('#bootGo')); await click(page.locator('#readyBody .mcard[data-mission="willard"]'));
      const persisted = { visibility: await page.evaluate(() => FlightRouteScene.getVisibility()), slider: Number(await page.locator('#flightNightVisibility').inputValue()) };
      assert.ok(Math.abs(persisted.visibility - adjustment.visibility) < .0001); assert.ok(Math.abs(persisted.slider - adjustment.visibility * 100) <= 1);
      record('Night visibility survives an actual browser reload and is reflected by the next native mission briefing', persisted, 'The browser reload reads persisted settings; this test does not write or seed the setting storage key.');
      await click(page.locator('#briefBack')); await click(page.locator('#readyBody .mcard[data-mission="m1"]'));
      assert.equal(await page.locator('#flightNightVisibility').count(), 0);
      await click(page.locator('#briefBody').getByRole('button', { name: 'Man Aircraft', exact: true }));
      await page.waitForFunction(() => App.game?.mis?.id === 'm1' && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
      const day = await page.evaluate(() => { window.__immersionFixedClock = true; const g = App.game; g.render(1 / 60); return { mission: g.mis.id, base: JSON.stringify(g.atm), rendered: JSON.stringify(App.rend.atm), active: FlightRouteScene.active(g), nightContrast: App.rend.atm.nightContrast || 0, contrastUniform: App.rend.gl.getUniform(App.rend.pMesh, App.rend.pMesh.u.uNightContrast), gl: App.rend.gl.getError() }; });
      assert.equal(day.active, false); assert.equal(day.nightContrast, 0); assert.equal(day.contrastUniform, 0); assert.equal(day.base, day.rendered); assert.equal(day.gl, 0);
      await click(page.locator('#pauseBtn')); assert.equal(await page.locator('#flightNightPause').count(), 0); await click(page.locator('#pauseBody').getByRole('button', { name: 'Ready Room', exact: true }));
      await click(page.locator('#powChapter button').filter({ hasText: 'Enter the prison' }));
      await page.waitForFunction(() => App.game && App._powLaunch && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
      // The native chapter button queues initialization in App.frame. Drain
      // that real frame once because this suite intentionally suspends RAF.
      await page.evaluate(() => App.frame(performance.now()));
      await page.waitForFunction(() => App.game?.pow?.stage === 'cell' && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
      const prison = await page.evaluate(() => { window.__immersionFixedClock = true; const g = App.game; g.render(1 / 60); return { stage: g.pow.stage, active: FlightRouteScene.active(g), immersion: FlightImmersion.inspect(g), nightContrast: App.rend.atm.nightContrast || 0, contrastUniform: App.rend.gl.getUniform(App.rend.pMesh, App.rend.pMesh.u.uNightContrast), visibility: FlightRouteScene.getVisibility(), gl: App.rend.gl.getError() }; });
      assert.equal(prison.active, false); assert.equal(prison.immersion.active, false); assert.equal(prison.nightContrast, 0); assert.equal(prison.contrastUniform, 0); assert.equal(prison.visibility, adjustment.visibility); assert.equal(prison.gl, 0);
      record('The new night display remains scoped to airborne Willard and leaves the original day mission and actual prison chapter unchanged', { day, prison }, 'Native Ready Room → original Mission 1 → pause → Ready Room → Enter the prison. One original App.frame drains the queued native chapter launch while automatic RAF is suspended. No mission or prison-stage setter.');
      assert.deepEqual(errors, []); assert.deepEqual(missing, []);
      record('No JavaScript errors, missing runtime assets or residual WebGL errors', { errors, missing, glError: await page.evaluate(() => App.rend.gl.getError()) });
    } catch (error) { const failure = { suite: 'immersion', passed: false, complete: false, profile: name, error: error.stack || String(error), errors, missing, screen: await page.evaluate(() => window.App?.screen).catch(() => 'unavailable'), completedChecks: results.length, results, screenshots }; console.error('IMMERSION FAILURE', name, JSON.stringify(failure)); await fs.writeFile(path.join(evidenceDir, 'immersion-failure.json'), JSON.stringify(failure, null, 2)); await page.screenshot({ path: path.join(out, name + '-failure.png'), timeout: 90000 }).catch(() => {}); throw error; } finally { await context.close(); }
  }
  await fs.rm(path.join(evidenceDir, 'immersion-progress.json'), { force: true });
  return { suite: 'immersion', passed: true, total: results.length, results, screenshots, physicalWindowsTested: false, actualIPhoneSafariTested: false,
    scope: 'Production Chromium/SwiftShader WebGL2 with native mouse/keyboard and CDP touch on simulated iPhone dimensions. Explicit landmark-camera and fused-flak visual fixtures are identified per check. This suite does not claim a completed combat sortie, human balance, physical-device frame rate or physical Safari testing.' };
};
