'use strict';

// Real Chromium WebGL2 fixtures execute the shipped renderer and active
// episode shaders. They use the intact supplied photographic people texture,
// plus explicitly authored MB wall/blocker/water geometry. They do not stand
// in for the separate normal-patrol gameplay acceptance suite.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

module.exports = async function episodeRenderer(browser, target, evidenceDir) {
  const originalPath = path.join(__dirname, '..', 'assets', 'figures-original.png');
  const originalHash = () => fs.readFile(originalPath).then(bytes => crypto.createHash('sha256').update(bytes).digest('hex'));
  const sourceHash = await originalHash();
  assert.equal(sourceHash, '2b357f1d128f3a9be324778c0fbea527c7574ff8ca328cfb5391bf811d910883');
  const out = path.join(evidenceDir, 'pow-episode-renderer');
  await fs.mkdir(out, { recursive: true });
  const checks = [], screenshots = [], browserErrors = [];
  for (const layout of [
    { name: 'desktop', viewport: { width: 1000, height: 650 }, hasTouch: false, deviceScaleFactor: 1 },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }
  ]) {
    const context = await browser.newContext(layout), page = await context.newPage();
    const record = (name, observed) => { checks.push({ name: layout.name + ': ' + name, passed: true, observed }); console.log('PASS episode-renderer ' + layout.name + ' ' + name); };
    page.on('pageerror', error => browserErrors.push({ layout: layout.name, error: error.message }));
    try {
      await page.addInitScript(() => { localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 })); localStorage.setItem('a6_sawkeys', '1'); });
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.App && window.POW?.FigureMotion && window.EpisodeGLSL, null, { timeout: 30000 });
      await page.locator('#bootFly').click();
      await page.waitForFunction(() => App.game?.st || document.getElementById('graphicError'), null, { timeout: 90000 });
      assert.equal(await page.locator('#graphicError').count(), 0);
      await page.waitForFunction(() => typeof FIGIMG !== 'undefined' && FIGIMG && App.rend?.textures?.people?.w > 1000, null, { timeout: 30000 });
      const result = await page.evaluate(() => {
        // Pause ordinary rendering while reading these explicit scene targets.
        App.game.paused = true; App.screen = 'gpu-fixture';
        const R = App.rend, gl = R.gl, save = { quality: R.quality, float: R.floatBuf, atmos: R.atm, episode: R.episode, time: R.time };
        const drain = () => { const list = []; for (let n = 0; n < 16; n++) { const error = gl.getError(); if (!error) break; list.push(error); } return list; };
        const inheritedErrors = drain(), photograph = { width: R.textures.people.w, height: R.textures.people.h, source: FIGIMG.getAttribute('src') };
        R.quality = 0; R.floatBuf = false; R.resize(384, 384, 1);
        R.setCamera([0, 1, 0], [0, 0, -1], [0, 1, 0], 50, .1, 100, 1);
        R.setAtmos({ ...R.atm, amb: [.8, .8, .8], gnd: [0, 0, 0], sunCol: [0, 0, 0], horizon: [0, 0, 0], zenith: [0, 0, 0], fogDens: 0, overcast: 0 });
        R.setFires([]);
        const profile = { ambient: [.75, .75, .75], fogColor: [0, 0, 0], fogDensity: .000001, lights: [], water: { enabled: false, level: 0, time: 0, current: .6 } };
        const instance = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1, 1,1,1,0]);
        const clear = () => { R.begin(); gl.clearColor(0, .25, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); };
        const read = () => { const bytes = new Uint8Array(R.W * R.H * 4); gl.readPixels(0, 0, R.W, R.H, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes; };
        const png = bytes => {
          // Lossless screenshot of the actual GPU target, vertically oriented
          // for viewing. No source photograph pixels or atlases are edited.
          const canvas = document.createElement('canvas'); canvas.width = R.W; canvas.height = R.H;
          const g = canvas.getContext('2d'), image = g.createImageData(R.W, R.H);
          for (let y = 0; y < R.H; y++) image.data.set(bytes.subarray(y * R.W * 4, (y + 1) * R.W * 4), (R.H - 1 - y) * R.W * 4);
          g.putImageData(image, 0, 0); return canvas.toDataURL('image/png');
        };
        const difference = (a, b) => { let changed = 0, changedForeground = 0, foreground = 0, lost = 0, gained = 0, max = 0, foregroundError = 0;
          for (let i = 0; i < a.length; i += 4) {
            const fg = a[i] !== 0 || Math.abs(a[i + 1] - 64) > 1 || a[i + 2] !== 0;
            const delta = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
            const bgB = b[i] === 0 && Math.abs(b[i + 1] - 64) <= 1 && b[i + 2] === 0;
            // A one-channel, one-level antialias edge can round back to the
            // clear colour when tessellated. Count actual lost coverage only
            // when the previous visible contribution exceeded that rounding.
            if (fg) { foreground++; foregroundError += delta; if (delta > 2) changedForeground++; if (bgB && delta > 2) lost++; }
            else if (!bgB) gained++;
            if (delta > 2) changed++; max = Math.max(max, delta);
          }
          return { changed, changedForeground, foreground, lost, gained, max, meanForegroundError: foregroundError / Math.max(1, foreground) };
        };
        const imageTargets = [], frames = [];
        R.setEpisode(profile, { p: [0, 0, 0], solids: [] });
        for (const [name, cell] of [['guard', 0], ['vc', 24], ['kneeling-vc', 32], ['farmer', 48]]) {
          const sprite = { p: [0, 0, -3], h: 2, w: 1, cell, cols: 8, rows: 9 };
          clear(); R.drawSprites('people', [sprite]); const quad = read();
          clear(); R.drawSprites('people', [{ ...sprite, motion: [0, 0, 0, 0] }]); const neutral = read();
          clear(); R.drawSprites('people', [{ ...sprite, motion: [Math.PI / 2, 1, 0, 0] }]); const stride = read();
          frames.push({ name, cell, neutral: difference(quad, neutral), stride: difference(neutral, stride) });
          if (name === 'guard' || name === 'farmer') { imageTargets.push({ name: name + '-neutral', png: png(neutral) }, { name: name + '-stride', png: png(stride) }); }
        }
        const wall = new MB(); wall.quad([-2, 0, -2], [2, 0, -2], [2, 2, -2], [-2, 2, -2], [.5, .5, .5]);
        R.meshFromBuilder('episodeGPUWall', wall);
        clear(); R.drawMesh('episodeGPUWall', instance, 1); const wallOnly = read();
        R.drawSprites('people', [{ p: [0, 0, -3], h: 2, w: 1, cell: 0, cols: 8, rows: 9, motion: [Math.PI / 2, 1, .5, 0] }]);
        const behindWall = read(), occlusion = difference(wallOnly, behindWall);
        const finalState = { depthWrites: gl.getParameter(gl.DEPTH_WRITEMASK), blending: gl.isEnabled(gl.BLEND), culling: gl.isEnabled(gl.CULL_FACE) };
        const litWall = new MB(); litWall.quad([-3, -1, -6], [3, -1, -6], [3, 3, -6], [-3, 3, -6], [.6, .6, .6]);
        R.meshFromBuilder('episodeGPULitWall', litWall);
        const blocker = { x: 1, z: -4.5, hw: .2, hl: .2, yMin: .5, yMax: 1.5, active: true };
        const blockerMesh = new MB(); blockerMesh.box(1, 1, -4.5, .2, .5, .2, [.3, .3, .3]); R.meshFromBuilder('episodeGPUBlocker', blockerMesh);
        const light = { position: [2, 1, -3], rgb: [1, .56, .25], radius: 10, intensity: 2.5 };
        const centre = bytes => Array.from(bytes.subarray(((R.H >> 1) * R.W + (R.W >> 1)) * 4, ((R.H >> 1) * R.W + (R.W >> 1)) * 4 + 4));
        const lightProfile = { ...profile, ambient: [.025, .025, .025], lights: [light] };
        R.setEpisode(lightProfile, { p: [0, 0, 0], solids: [] }); clear(); R.drawMesh('episodeGPULitWall', instance, 1); const lit = read();
        R.setEpisode({ ...lightProfile, lights: [{ ...light, intensity: 0 }] }, { p: [0, 0, 0], solids: [] }); clear(); R.drawMesh('episodeGPULitWall', instance, 1); const off = read();
        R.setEpisode(lightProfile, { p: [0, 0, 0], solids: [blocker] }); clear(); R.drawMesh('episodeGPULitWall', instance, 1); R.drawMesh('episodeGPUBlocker', instance, 1); const shadow = read();
        imageTargets.push({ name: 'warm-light', png: png(lit) }, { name: 'light-switched-off', png: png(off) }, { name: 'solid-blocker-shadow', png: png(shadow) });
        const illumination = { on: centre(lit), off: centre(off), shadow: centre(shadow), blocker };
        // Low must retain the useful outdoor lamp after the earlier fixed
        // cell/corridor descriptors, including the fourth searchlight slot.
        R.setEpisode({ ...lightProfile, lights: [{ ...light, intensity: 0 }, { ...light, position: [-100, 1, -3] }, { ...light, position: [100, 1, -3] }, light] }, { p: [0, 0, 0], solids: [] });
        clear(); R.drawMesh('episodeGPULitWall', instance, 1); const relevantLowLight = centre(read());
        const beam = { ...light, direction: [-2 / Math.sqrt(13), 0, -3 / Math.sqrt(13)], coneCos: .92 };
        R.setEpisode({ ...lightProfile, lights: [beam] }, { p: [0, 0, 0], solids: [] }); clear(); R.drawMesh('episodeGPULitWall', instance, 1); const coneOn = centre(read());
        R.setEpisode({ ...lightProfile, lights: [{ ...beam, direction: [0, 0, 1] }] }, { p: [0, 0, 0], solids: [] }); clear(); R.drawMesh('episodeGPULitWall', instance, 1); const coneAway = centre(read());
        // Use a separate Renderer mesh entry and restore the shipped water
        // entry immediately. The real shader dispatch depends on powWater.
        const priorWater = R.meshes.powWater;
        // Start this declared ripple fixture at literal zero, rather than
        // inheriting the preceding flight renderer's elapsed sky clock.
        R.time = 0;
        const water = new MB(); water.quad([-4, 0, -2], [4, 0, -2], [4, 0, -12], [-4, 0, -12], [.2, .3, .3]);
        const waterVertices = JSON.stringify(water.p);
        R.meshFromBuilder('episodeGPUWater', water); R.meshes.powWater = R.meshes.episodeGPUWater;
        R.setCamera([0, 2, 0], [0, -.38, -1], [0, 1, 0], 55, .1, 100, 1);
        R.setEpisode({ ...profile, fogColor: [.06, .09, .12], water: { enabled: true, level: 0, current: .6, time: 0 } }, { p: [0, 0, 0], solids: [] }); clear(); R.drawMesh('powWater', instance, 1); const water0 = read();
        R.setEpisode({ ...profile, fogColor: [.06, .09, .12], water: { enabled: true, level: 0, current: .6, time: 2.5 } }, { p: [0, 0, 0], solids: [] }); clear(); R.drawMesh('powWater', instance, 1); const water1 = read();
        R.setEpisode({ ...profile, fogColor: [.06, .09, .12], water: { enabled: true, level: 0, current: 1.4, time: 2.5 } }, { p: [0, 0, 0], solids: [] }); clear(); R.drawMesh('powWater', instance, 1); const waterCurrent = read();
        imageTargets.push({ name: 'river-ripples-t0', png: png(water0) }, { name: 'river-ripples-t2', png: png(water1) });
        const ripple = { elapsed: difference(water0, water1), current: difference(water1, waterCurrent), verticesUnchanged: JSON.stringify(water.p) === waterVertices, surfaceY: Array.from(new Set(water.p.filter((value, i) => i % 3 === 1))) };
        if (priorWater) R.meshes.powWater = priorWater; else delete R.meshes.powWater;
        const gpuErrors = drain();
        // These fixtures live in a short-lived browser context. Restore the
        // target state rather than deleting any game-owned photograph/mesh.
        R.floatBuf = save.float; R.quality = save.quality; R.setAtmos(save.atmos); R.setEpisode(save.episode); R.time = save.time; R.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
        return { version: gl.getParameter(gl.VERSION), photograph, inheritedErrors, gpuErrors, frames, occlusion, finalState, illumination, relevantLowLight, coneOn, coneAway, ripple, imageTargets };
      });
      assert.match(result.version, /^WebGL 2/);
      assert.equal(result.photograph.source, 'assets/figures-original.png');
      assert.deepEqual(result.inheritedErrors, []); assert.deepEqual(result.gpuErrors, []);
      console.log('GPU episode fixture observations ' + JSON.stringify({ layout: layout.name, frames: result.frames, illumination: result.illumination, ripple: result.ripple }));
      for (const frame of result.frames) {
        assert.ok(frame.neutral.foreground > 1000, 'The intact ' + frame.name + ' source photograph actually draws');
        // Tessellated interpolation may round a few sampled colour channels
        // differently from the original two triangles. It must preserve the
        // whole silhouette and stay within tiny 8-bit sampling differences.
        assert.ok(frame.neutral.max <= 12 && frame.neutral.meanForegroundError < .5 && frame.neutral.changedForeground <= Math.max(3, frame.neutral.foreground * .05), 'Neutral grid keeps photograph continuity: ' + JSON.stringify(frame));
        assert.equal(frame.neutral.lost, 0, 'Neutral articulation introduces no new transparent holes in ' + frame.name);
        assert.ok(frame.stride.changed > 50, 'The shipped shader visibly moves the photograph with actual stride phase: ' + JSON.stringify(frame));
      }
      record('Intact guard, VC, kneeling VC and farmer photographs stay solid on the neutral grid and visibly articulate', { sourceHash, photograph: result.photograph, frames: result.frames });
      assert.equal(result.occlusion.changed, 0, 'The actual opaque wall fully occludes the articulated original figure');
      assert.deepEqual(result.finalState, { depthWrites: true, blending: false, culling: true });
      record('Articulated original photograph respects wall depth and restores alpha/depth/cull state', result.occlusion);
      assert.ok(result.illumination.on[0] > result.illumination.off[0] + 50, 'Enabled local light visibly illuminates the actual mesh');
      assert.ok(result.illumination.on[0] > result.illumination.on[1] * 1.4 && result.illumination.on[1] > result.illumination.on[2] * 1.4, 'Warm light keeps its intended colour');
      assert.ok(result.illumination.shadow[0] <= result.illumination.off[0] + 2, 'Solid physical blocker casts an actual shader shadow on the visible wall');
      record('Warm light switches on/off and a real solid blocker removes illumination through its shadow', result.illumination);
      assert.deepEqual(result.relevantLowLight, result.illumination.on, 'Low quality retains nearby useful lights despite earlier OFF or distant descriptors');
      record('Low quality retains the nearby fourth lamp after OFF and distant descriptors', { nearby: result.relevantLowLight, singleLightReference: result.illumination.on });
      assert.deepEqual(result.coneOn, result.illumination.on); assert.deepEqual(result.coneAway, result.illumination.off);
      record('An actual searchlight cone illuminates the aimed wall and moves away with its direction', { aimed: result.coneOn, away: result.coneAway });
      assert.ok(result.ripple.elapsed.changed > 1000 && result.ripple.current.changed > 1000, 'Elapsed time and actual river current alter the shipped ripple pixels');
      assert.equal(result.ripple.elapsed.lost + result.ripple.elapsed.gained + result.ripple.current.lost + result.ripple.current.gained, 0, 'Ripple changes leave actual GPU water geometry coverage unchanged');
      assert.equal(result.ripple.verticesUnchanged, true); assert.deepEqual(result.ripple.surfaceY, [0]);
      record('River current and time change visible ripples while the physical surface remains flat', result.ripple);
      for (const image of result.imageTargets) {
        const file = layout.name + '-' + image.name + '.png';
        await fs.writeFile(path.join(out, file), Buffer.from(image.png.split(',')[1], 'base64'));
        screenshots.push('pow-episode-renderer/' + file);
      }
      record('Real active shaders execute without WebGL or uncaught JavaScript errors', { version: result.version, inheritedErrors: result.inheritedErrors, gpuErrors: result.gpuErrors });
    } finally { await context.close(); }
  }
  assert.equal(await originalHash(), sourceHash, 'The supplied photographic file remains byte-identical');
  assert.deepEqual(browserErrors, []);
  return { suite: 'episode-renderer', checks, screenshots, browserErrors, limitations: [
    'Real Chromium/SwiftShader WebGL2 and simulated iPhone layouts; physical Windows GPU, iPhone Safari and device frame rate remain manual checks.',
    'Photograph continuity uses the shipped intact people texture; walls, local-light blocker and flat water are declared GPU fixtures, not normal-patrol gameplay.',
    'Photographic stride uses authored bounded geometry articulation. The source photographs do not contain a recorded full walking animation.'
  ] };
};
