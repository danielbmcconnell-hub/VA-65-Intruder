'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Actual supplied artwork in the production WebGL2 program. Camera/aircraft
// placements and the solid depth blocker below are explicit GPU fixtures,
// separate from the input-driven end-to-end combat acceptance suite.
module.exports = async function willardRendererBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'willard-renderer'); await fs.mkdir(out, { recursive: true });
  const results = [], screenshots = [], errors = [];
  const profiles = [
    { name: 'desktop', viewport: { width: 1000, height: 650 } },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ].filter(p => !process.env.INTRUDER_WILLARD_PROFILE || p.name === process.env.INTRUDER_WILLARD_PROFILE);
  const sourceAtlas = await fs.readFile(path.join(__dirname, '../assets/willard/media/MiG17PF_Willard_Egress_ATLAS.png'));
  const atlasSHA256 = createHash('sha256').update(sourceAtlas).digest('hex');
  const moduleSHA256 = Object.fromEntries(await Promise.all(['sprites', 'presentation', 'mission', 'interceptor', 'flak'].map(async name => [name, createHash('sha256').update(await fs.readFile(path.join(__dirname, '../assets/willard', name + '.js'))).digest('hex')])));
  for (const profile of profiles) {
    const { name, ...options } = profile, context = await browser.newContext(options), page = await context.newPage(); page.setDefaultTimeout(90000);
    const record = (title, actual) => { results.push({ profile: name, name: title, passed: true, actual }); console.log('PASS Willard renderer ' + name + ' ' + title); };
    page.on('pageerror', e => errors.push({ profile: name, error: e.message }));
    await context.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, seat: 0, assist: 1, mouse: 0 })); localStorage.setItem('a6_sawkeys', '1');
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => window.__willardGPUFixedClock ? 0 : raf(t => { if (!window.__willardGPUFixedClock) cb(t); });
    });
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
      const sourceSHA256 = createHash('sha256').update(await response.body()).digest('hex');
      await page.waitForFunction(() => window.App && window.WillardSprites); await page.locator('#bootFly').click();
      await page.waitForFunction(() => App.game?.st && document.getElementById('loader').style.display === 'none');
      const decoded = await page.evaluate(async () => {
        const base = 'assets/willard/media/', response = await fetch(base + 'MiG17PF_Willard_Egress_ATLAS.json'), atlas = await response.json();
        WillardSprites.validateAtlas(atlas);
        const images = await Promise.all(Object.entries(atlas.frames).map(async ([name, frame]) => {
          const image = new Image(); image.src = base + frame.filename; await image.decode();
          return { name, width: image.naturalWidth, height: image.naturalHeight, frame: frame.frame, pivot: frame.pivot };
        }));
        await WillardSprites.load(App.rend);
        return { atlas: { format: atlas.format, size: atlas.size, frames: Object.keys(atlas.frames).length }, images, gpu: WillardSprites.inspect(App.rend), maxTextureSize: App.rend.gl.getParameter(App.rend.gl.MAX_TEXTURE_SIZE) };
      });
      assert.equal(decoded.images.length, 54); assert.ok(decoded.images.every(i => i.width === 512 && i.height === 512));
      assert.equal(decoded.gpu.status, 'ready'); assert.equal(decoded.gpu.atlasFrames, 54); assert.deepEqual(decoded.gpu.atlasSize, [4096, 3584]); assert.ok(decoded.maxTextureSize >= 4096);
      record('Supplied atlas and all 54 individual aircraft frames decode with exact validated coordinates and pivots', { sourceSHA256, atlasSHA256, ...decoded });
      const gpu = await page.evaluate(() => {
        window.__willardGPUFixedClock = true;
        App.game.paused = true; App.screen = 'willard-gpu-fixture';
        const R = App.rend, gl = R.gl; R.quality = 0; R.floatBuf = false; R.resize(512, 512, 1);
        R.setEpisode(null); R.setFires([]); R.setAtmos({ ...R.atm, night: false, amb: [1, 1, 1], sunCol: [0, 0, 0], fogDens: 0, horizon: [0, 0, 0], zenith: [0, 0, 0] });
        const images = [], clear = () => { R.begin(); gl.clearColor(0, .3, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); };
        const read = () => { const bytes = new Uint8Array(R.W * R.H * 4); gl.readPixels(0, 0, R.W, R.H, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes; };
        const metrics = bytes => {
          let pixels = 0, left = R.W, right = -1, top = R.H, bottom = -1, dark = 0;
          for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) {
            const i = (y * R.W + x) * 4;
            if (bytes[i] > 2 || Math.abs(bytes[i + 1] - 77) > 2 || bytes[i + 2] > 2) { pixels++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); if (bytes[i] < 4 && bytes[i + 1] < 4 && bytes[i + 2] < 4) dark++; }
          }
          return { pixels, bounds: [left, top, right, bottom], width: Math.max(0, right - left + 1), height: Math.max(0, bottom - top + 1), dark };
        };
        const png = bytes => { const canvas = document.createElement('canvas'); canvas.width = R.W; canvas.height = R.H; const ctx = canvas.getContext('2d'), data = ctx.createImageData(R.W, R.H); for (let y = 0; y < R.H; y++) data.data.set(bytes.subarray(y * R.W * 4, (y + 1) * R.W * 4), (R.H - y - 1) * R.W * 4); ctx.putImageData(data, 0, 0); return canvas.toDataURL('image/png'); };
        const one = (label, enemy, eye = [0, 0, 0]) => {
          const dir = enemy.p.map((v, i) => v - eye[i]); R.setCamera(eye, dir, [0, 1, 0], 50, .1, 1000, 1); clear();
          const before = JSON.stringify(enemy); WillardSprites.draw(R, enemy, { dt: .1, light: 1 });
          const bytes = read(), result = { label, selection: WillardSprites.inspect(R).last, metrics: metrics(bytes), enemyUnchanged: before === JSON.stringify(enemy) };
          images.push({ label, png: png(bytes) }); return result;
        };
        const scenarios = [
          one('front', { p: [0, 0, -50], yaw: Math.PI, pitch: 0, roll: 0, alive: true }),
          one('rear', { p: [0, 0, -50], yaw: 0, pitch: 0, roll: 0, alive: true }),
          one('left-side', { p: [0, 0, -50], yaw: -Math.PI / 2, pitch: 0, roll: 0, alive: true }),
          one('right-side', { p: [0, 0, -50], yaw: Math.PI / 2, pitch: 0, roll: 0, alive: true }),
          one('upper-bank-left', { p: [0, 0, -50], yaw: .5, pitch: 0, roll: -Math.PI / 6, alive: true }, [0, 80, 0]),
          one('upper-bank-right', { p: [0, 0, -50], yaw: -.5, pitch: 0, roll: Math.PI / 6, alive: true }, [0, 80, 0]),
          one('underside', { p: [0, 0, -50], yaw: 0, pitch: 0, roll: 0, alive: true }, [0, -80, 0])
        ];
        const near = one('near-range', { p: [0, 0, -40], yaw: Math.PI, pitch: 0, roll: 0, alive: true }), far = one('far-range', { p: [0, 0, -80], yaw: Math.PI, pitch: 0, roll: 0, alive: true });
        const turning = { p: [0, 0, -50], yaw: .4, pitch: 0, roll: -.27, alive: true };
        R.setCamera([0, 80, 0], [0, -80, -50], [0, 1, 0], 50, .1, 1000, 1); clear(); WillardSprites.draw(R, turning, { dt: 1 / 60, light: 1 });
        const transitionBefore = WillardSprites.inspect(R).last; turning.roll = -.25;
        clear(); WillardSprites.draw(R, turning, { dt: 1 / 60, light: 1 }); const transitionDuring = WillardSprites.inspect(R).last, duringPixels = read();
        for (let n = 0; n < 10; n++) { clear(); WillardSprites.draw(R, turning, { dt: 1 / 60, light: 1 }); }
        const transitionAfter = WillardSprites.inspect(R).last, afterPixels = read(); let transitionChangedPixels = 0;
        for (let i = 0; i < afterPixels.length; i += 4) if (Math.abs(afterPixels[i] - duringPixels[i]) + Math.abs(afterPixels[i + 1] - duringPixels[i + 1]) + Math.abs(afterPixels[i + 2] - duringPixels[i + 2]) > 5) transitionChangedPixels++;
        images.push({ label: 'bank-transition-midpoint', png: png(duringPixels) });
        const transition = { before: transitionBefore, during: transitionDuring, after: transitionAfter, changedPixels: transitionChangedPixels };
        const enemy = { p: [0, 0, -50], yaw: Math.PI, pitch: 0, roll: 0, alive: true };
        R.setCamera([0, 0, 0], [0, 0, -1], [0, 1, 0], 50, .1, 1000, 1);
        const wall = new MB(); wall.quad([-12, -12, -35], [12, -12, -35], [12, 12, -35], [-12, 12, -35], [.4, .4, .4]); R.meshFromBuilder('willardGPUWall', wall);
        const instance = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1, 1,1,1,0]);
        clear(); R.drawMesh('willardGPUWall', instance, 1); const wallPixels = read(); WillardSprites.draw(R, enemy, { dt: .1, light: 1 }); const hiddenPixels = read();
        let occlusionDifferences = 0; for (let i = 0; i < wallPixels.length; i++) if (wallPixels[i] !== hiddenPixels[i]) occlusionDifferences++;
        images.push({ label: 'opaque-depth-occlusion', png: png(hiddenPixels) });
        const state = { depthWrites: gl.getParameter(gl.DEPTH_WRITEMASK), blending: gl.isEnabled(gl.BLEND), culling: gl.isEnabled(gl.CULL_FACE) };
        const reusable = WillardSprites.inspect(R);
        for (let i = 0; i < 50; i++) { clear(); WillardSprites.draw(R, enemy, { dt: 1 / 60, light: 1 }); }
        const after = WillardSprites.inspect(R), errors = []; for (let i = 0; i < 16; i++) { const e = gl.getError(); if (!e) break; errors.push(e); }
        return { scenarios, near, far, transition, occlusionDifferences, state, reusable, after, errors, version: gl.getParameter(gl.VERSION), images };
      });
      assert.match(gpu.version, /^WebGL 2/); assert.deepEqual(gpu.errors, []);
      for (const s of gpu.scenarios) { assert.ok(s.metrics.pixels > 100, 'Actual aircraft artwork must draw: ' + JSON.stringify(s)); assert.equal(s.enemyUnchanged, true); assert.equal(s.selection.flip, false); assert.equal(s.selection.alphaDepthPass, true); assert.equal(s.selection.worldMetres, true); assert.deepEqual(s.selection.worldPosition, [0, 0, -50]); }
      assert.equal(gpu.scenarios[0].selection.name, 'front'); assert.equal(gpu.scenarios[1].selection.name, 'rear');
      assert.equal(gpu.scenarios[2].selection.name, 'left_side'); assert.equal(gpu.scenarios[3].selection.name, 'right_side');
      assert.match(gpu.scenarios[4].selection.name, /b-30$/); assert.match(gpu.scenarios[5].selection.name, /b\+30$/); assert.equal(gpu.scenarios[6].selection.name, 'bottom');
      record('Actual front, rear, left, right, bank and underside artwork renders in camera-relative world space without mirroring or moving the aircraft', gpu.scenarios);
      assert.ok(gpu.near.metrics.pixels > gpu.far.metrics.pixels * 3.4); assert.ok(Math.abs(gpu.near.selection.widthPixels / gpu.far.selection.widthPixels - 2) < .001);
      record('Aircraft perspective size scales continuously with physical distance', { near: gpu.near, far: gpu.far });
      assert.notEqual(gpu.transition.before.name, gpu.transition.after.name); assert.ok(gpu.transition.during.blend > 0 && gpu.transition.during.blend < 1); assert.equal(gpu.transition.after.blend, 1); assert.ok(gpu.transition.changedPixels > 10); assert.deepEqual(gpu.transition.before.worldPosition, gpu.transition.after.worldPosition);
      record('A real bank-frame transition interpolates the supplied artwork over multiple GPU frames without moving its pivot', gpu.transition);
      assert.equal(gpu.occlusionDifferences, 0); assert.deepEqual(gpu.state, { depthWrites: true, blending: false, culling: true });
      record('Solid world geometry fully occludes the MiG and the dual alpha/depth passes restore the engine state', { occlusionDifferences: gpu.occlusionDifferences, state: gpu.state });
      assert.equal(gpu.reusable.uploads, 1); assert.equal(gpu.after.uploads, 1); assert.equal(gpu.after.draws - gpu.reusable.draws, 100);
      record('Fifty repeated aircraft renders reuse the GPU atlas without duplicate uploads or WebGL errors', { uploads: gpu.after.uploads, draws: gpu.after.draws - gpu.reusable.draws, errors: gpu.errors });
      for (const image of gpu.images) { const file = name + '-' + image.label + '.png'; await fs.writeFile(path.join(out, file), Buffer.from(image.png.split(',')[1], 'base64')); screenshots.push('willard-renderer/' + file); }

      // Integrated recovery fixture, separate from a successful flight claim:
      // launch the real mission with its supported no-strike option, suspend
      // only automatic RAF, then run thirteen seconds of original A-6 physics
      // with neutral controls until the mission itself spawns its interceptor
      // and writes the first checkpoint. No enemy/phase/position setter.
      await page.evaluate(() => {
        Store.set('willard_options', { difficulty: 'naval', strike: false });
        App.start(WillardMission.definition);
      });
      await page.waitForFunction(() => App.game?.mis?.willard && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
      const integration = await page.evaluate(async () => {
        const g = App.game; g.paused = false;
        for (let i = 0; i < 13 * 60 && g.ac.alive && !g.result; i++) g.update(1 / 60);
        WillardPresentation.rear(g); await WillardSprites.load(App.rend); g.render(1 / 60);
        return { mission: g.mis.id, phase: g.willard.phase, alive: g.ac.alive, time: g.t, checkpointValid: WillardMission.validCheckpoint(Store.get(WillardMission.KEY, null)), artwork: WillardSprites.inspect(App.rend), glError: App.rend.gl.getError() };
      });
      assert.equal(integration.mission, 'willard'); assert.equal(integration.alive, true); assert.equal(integration.checkpointValid, true);
      assert.ok(['contact', 'defend'].includes(integration.phase)); assert.equal(integration.artwork.status, 'ready'); assert.equal(integration.artwork.last?.visible, true); assert.equal(integration.glError, 0);
      const recoveries = [];
      for (const originallyPaused of [false, true]) {
        const supported = await page.evaluate(paused => {
          App.pause(paused);
          const g = App.game;
          window.__willardBeforeLoss = { game: g, renderer: App.rend, enemy: g.willard.enemy, checkpoint: g.willard.checkpoint, checkpointJSON: JSON.stringify(Store.get(WillardMission.KEY, null)), snapshot: JSON.stringify(WillardMission.snapshot(g)), aircraftJSON: JSON.stringify(g.ac), time: g.t, originallyPaused: paused };
          window.__willardGLRecovery = App.rend.gl.getExtension('WEBGL_lose_context');
          if (!window.__willardGLRecovery) return false;
          window.__willardGLRecovery.loseContext(); return true;
        }, originallyPaused);
        assert.equal(supported, true, 'Real WebGL context-loss extension is required for this recovery check.');
        await page.waitForFunction(() => App.graphicsContextLost && App.game?.paused && !App.rend, null, { polling: 50 });
        const lost = await page.evaluate(() => ({
          sameGame: App.game === __willardBeforeLoss.game, sameEnemy: App.game.willard.enemy === __willardBeforeLoss.enemy,
          sameCheckpoint: App.game.willard.checkpoint === __willardBeforeLoss.checkpoint, retainedPause: App._graphicsResume.paused,
          clockFrozen: App.game.t === __willardBeforeLoss.time, mission: App.game.mis.id, paused: App.game.paused,
          banner: document.getElementById('graphicsRecovery')?.textContent
        }));
        assert.equal(lost.sameGame && lost.sameEnemy && lost.sameCheckpoint && lost.clockFrozen && lost.paused, true);
        assert.equal(lost.retainedPause, originallyPaused); assert.equal(lost.mission, 'willard'); assert.match(lost.banner, /Flight display interrupted/);
        await page.waitForTimeout(200);
        await page.evaluate(() => __willardGLRecovery.restoreContext());
        await page.waitForFunction(() => !App.graphicsContextLost && App.rend && App.rend !== __willardBeforeLoss.renderer && App.game?.paused, null, { polling: 50, timeout: 90000 });
        const restored = await page.evaluate(async () => {
          const g = App.game, R = App.rend; await WillardSprites.load(R);
          g.render(1 / 60); const first = WillardSprites.inspect(R);
          for (let i = 0; i < 3; i++) g.render(1 / 60);
          const after = WillardSprites.inspect(R), errors = [];
          for (let i = 0; i < 16; i++) { const e = R.gl.getError(); if (!e) break; errors.push(e); }
          return { sameGame: g === __willardBeforeLoss.game, sameEnemy: g.willard.enemy === __willardBeforeLoss.enemy,
            sameCheckpoint: g.willard.checkpoint === __willardBeforeLoss.checkpoint,
            checkpointUnchanged: JSON.stringify(Store.get(WillardMission.KEY, null)) === __willardBeforeLoss.checkpointJSON,
            missionUnchanged: JSON.stringify(WillardMission.snapshot(g)) === __willardBeforeLoss.snapshot,
            aircraftUnchanged: JSON.stringify(g.ac) === __willardBeforeLoss.aircraftJSON,
            rendererReplaced: R !== __willardBeforeLoss.renderer, rendererConnected: g.rend === R && g.world.rend === R,
            visualTail: App._tailOn, expectedVisualTail: g.mis.visualTail || g.mis.brief.tail,
            paused: g.paused, first, after, errors };
        });
        for (const key of ['sameGame', 'sameEnemy', 'sameCheckpoint', 'checkpointUnchanged', 'missionUnchanged', 'aircraftUnchanged', 'rendererReplaced', 'rendererConnected', 'paused']) assert.equal(restored[key], true, key);
        assert.equal(restored.visualTail, restored.expectedVisualTail, 'Context restoration must preserve the actual historical mission aircraft markings.');
        assert.equal(restored.first.status, 'ready'); assert.equal(restored.first.uploads, 1); assert.equal(restored.after.uploads, 1);
        assert.equal(restored.first.last.visible, true); assert.equal(restored.after.last.visible, true);
        assert.equal(restored.after.draws - restored.first.draws, 6, 'Three integrated Game.render calls must draw two MiG alpha/depth passes each.');
        assert.deepEqual(restored.errors, []);
        const shot = name + '-integrated-context-restored-' + (originallyPaused ? 'paused' : 'running') + '.png';
        await page.screenshot({ path: path.join(out, shot), timeout: 90000 }); screenshots.push('willard-renderer/' + shot);
        const resume = page.locator('#graphicsRecovery').getByRole('button', { name: 'Resume mission', exact: true });
        if (profile.hasTouch) await resume.tap(); else await resume.click();
        const afterResume = await page.evaluate(() => ({ paused: App.game.paused, sameGame: App.game === __willardBeforeLoss.game, noticeRemoved: !document.getElementById('graphicsRecovery') }));
        assert.equal(afterResume.paused, originallyPaused); assert.equal(afterResume.sameGame && afterResume.noticeRemoved, true);
        recoveries.push({ originallyPaused, lost, restored, afterResume });
      }
      record('Real context loss restores the integrated mission, fighter, checkpoint and prior pause state, with one fresh atlas upload and resumed artwork rendering', { integration, recoveries, sourceSHA256, moduleSHA256, fixture: 'Supported no-strike mission option; thirteen seconds of original neutral-stick Game.update; real WEBGL_lose_context events twice, once running and once already paused. This is graphics recovery, not a successful sortie or physical-device FPS test.' });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  return { suite: 'willard-renderer', passed: true, results, total: results.length, screenshots, atlasSHA256, moduleSHA256,
    physicalWindowsTested: false, actualIPhoneSafariTested: false,
    scope: 'Real Chromium/SwiftShader WebGL2 with intact supplied artwork. Explicit camera, aircraft-position and depth-wall GPU fixtures; this suite does not claim normal mission progression, human visual quality or physical-device frame rate.' };
};
