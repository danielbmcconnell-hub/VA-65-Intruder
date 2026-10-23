'use strict';
// Actual production-WebGL renders and routing checks. Mixed-roster and isolated
// photo comparisons are declared fixtures, not completed historical missions.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

module.exports = async function photographicSprites(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'photographic-sprites'), checks = [], screenshots = [], errors = [], missing = [], sourceHashes = [];
  await fs.mkdir(out, { recursive: true });
  const record = (layout, name, actual) => { checks.push({ layout, name, passed: true, actual }); console.log('PASS photographic-sprites ' + layout + ' ' + name); };
  for (const profile of [
    { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ].filter(p => !process.env.INTRUDER_PHOTO_PROFILE || p.name === process.env.INTRUDER_PHOTO_PROFILE)) {
    const { name, ...options } = profile, context = await browser.newContext(options), page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.on('pageerror', e => errors.push({ layout: name, error: e.message }));
    page.on('response', r => { if (r.status() >= 400 && r.url().includes('/assets/')) missing.push(r.url()); });
    const click = locator => profile.hasTouch ? locator.tap() : locator.click();
    const shot = async label => {
      const file = name + '-' + label + '.png'; await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('photographic-sprites/' + file);
    };
    try {
      await context.addInitScript(() => {
        localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
        localStorage.setItem('a6_sawkeys', '1');
      });
      const entry = await page.goto(target, { waitUntil: 'domcontentloaded' }); assert.equal(entry.status(), 200);
      sourceHashes.push({ layout: name, indexSHA256: createHash('sha256').update(await entry.body()).digest('hex') });
      await page.waitForFunction(() => window.App && window.PhotoSprites);
      await click(page.locator('#bootGo'));
      await click(page.locator('#powChapter [data-pow-chapter="escape"]'));
      await page.waitForFunction(() => App.game?.pow?.stage === 'cell' && document.getElementById('loader').style.display === 'none' && ['nva', 'nva_front', 'farmer', 'militia', 'female_vc', 'cow', 'aviator'].every(n => App.rend.textures['photo_' + n]), null, { polling: 50 });
      const native = await page.evaluate(() => {
        const g = App.game, R = g.rend, calls = [], original = R.drawSprites;
        window.__photoNativeFrame = App.frame; App.frame = () => {}; g.paused = true;
        for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on');
        document.getElementById('radio').innerHTML = '';
        R.drawSprites = function (name, list, ...rest) { for (const s of list) if (s.owner) calls.push({ name, kind: s.owner.kind, variant: s.photoVariant || null, cell: s.cell, rows: s.rows, cols: s.cols, motion: s.motion || null, width: s.w, height: s.h }); return original.call(this, name, list, ...rest); };
        try { g.render(0); } finally { R.drawSprites = original; }
        return { stage: g.pow.stage, calls, actors: g.evade.searchers.length, gl: R.gl.getError() };
      });
      assert.equal(native.stage, 'cell'); assert.ok(native.actors > 0);
      assert.ok(native.calls.some(c => /^photo_nva(?:_front)?$/.test(c.name)), JSON.stringify(native));
      for (const c of native.calls) { assert.notEqual(c.name, 'people'); assert.equal(c.rows, c.variant ? 1 : 6); assert.equal(c.cols, c.variant ? 1 : 8); assert.ok(!c.motion || c.motion.every(v => !v)); }
      assert.equal(native.gl, 0); await shot('native-prison-guards'); record(name, 'Ready Room prison guards use supplied NVA photographs rather than the reconstructed sheet', native);

      const roster = await page.evaluate(() => {
        const g = App.game, R = g.rend, center = g.world.briefed || g.world.tgtCenter; let p;
        delete g.pow;
        for (let r = 900; r < 7000 && !p; r += 160) for (let a = 0; a < Math.PI * 2 && !p; a += Math.PI / 8) {
          const x = center[0] + Math.sin(a) * r, z = center[2] - Math.cos(a) * r, y = terrainH(x, z);
          if (y > 8 && !g._localSolidAt(x, z, .5) && Math.abs(terrainH(x + 10, z - 10) - y) < 2) p = [x, y, z];
        }
        if (!p) throw Error('No dry ground fixture');
        g._startGroundPhase(p[0], p[2], 0, 'chute'); const e = g.evade;
        e.held = 0; e.spawn = e.localRefill = e.cowT = 1e9; e.hdg = e.look = e.pitchCmd = 0; e.locals = [];
        e.searchers = ['farmer', 'vc', 'vcFem', 'nva', 'guard'].map((kind, i) => ({ id: 'photo-roster-' + kind, kind, p: [p[0] + (i - 2) * 2.1, 0, p[2] - 8], face: Math.PI, goal: [p[0], p[2] - 8], alive: true, armed: kind !== 'farmer', spd: 0, ph: 0, seen: 0 }));
        e.cattle = [{ id: 'photo-cow', kind: 'cow', p: [p[0] - 3, 0, p[2] - 4.5], alive: true, yaw: Math.PI / 2, walk: 0, t: 0 }];
        g.wreck = null; g.world.scenery = []; g.world._cells = new Map(); g.world.targets = []; g.world.saf = []; g._collisionCache = null;
        g.paused = true; App.screen = 'game';
        for (const id of ['teach', 'teachPeek', 'legend', 'captVeil']) document.getElementById(id)?.classList.remove('on');
        document.getElementById('radio').innerHTML = '';
        const original = R.drawSprites, calls = [];
        // The existing near-ground CPU/GPU height patch streams over nine
        // bounded renders. A cold first-frame capture can show buried actors.
        for (let i = 0; i < 10; i++) g.render(0);
        R.drawSprites = function (name, list, ...rest) {
          for (const s of list) if (s.owner) { const m = PHOTO_ATLAS[s.photoVariant || s.photoName], f = m?.frames[s.cell]; calls.push({ name, kind: s.owner.kind, variant: s.photoVariant || null, id: s.owner.id, frame: s.cell, cols: s.cols, rows: s.rows, aspect: s.w / s.h, sourceAspect: m && (m.width / (m.cols || 8)) / (m.height / (m.rows || 6)), feet: s.p[1] + (f?.bottom || 0) * s.h, ground: Math.max(terrainH(s.owner.p[0], s.owner.p[2]), 0), motion: s.motion || null }); }
          return original.call(this, name, list, ...rest);
        };
        try { g.render(0); g.syncControls(); } finally { R.drawSprites = original; }
        return { calls, nearGround: NearGround.inspect(R), gl: R.gl.getError(), p: p.slice(), phase: g.phase };
      });
      const expected = { farmer: 'photo_farmer', vc: 'photo_militia', vcFem: 'photo_female_vc', nva: 'photo_nva_front', guard: 'photo_nva_front', cow: 'photo_cow' };
      for (const [kind, texture] of Object.entries(expected)) {
        const c = roster.calls.find(c => c.kind === kind); assert.ok(c, 'Missing ' + kind + ': ' + JSON.stringify(roster));
        assert.equal(c.name, texture); assert.equal(c.cols, c.variant ? 1 : 8); assert.equal(c.rows, c.variant ? 1 : 6);
        assert.ok(Math.abs(c.aspect - c.sourceAspect) < 1e-6, JSON.stringify(c));
        assert.ok(Math.abs(c.sourceAspect - (kind === 'cow' ? 4 / 3 : 2 / 3)) < .001, JSON.stringify(c));
        assert.ok(Math.abs(c.feet - c.ground) < 1e-5, JSON.stringify(c)); assert.ok(!c.motion || c.motion.every(v => !v));
      }
      assert.equal(roster.gl, 0); await shot('declared-ground-roster'); record(name, 'Actual countryside renderer preserves farmer, male VC, female VC, NVA, guard and cattle identity, source aspect and foot contact', roster);

      const gallery = await page.evaluate(async () => {
        const R = App.rend, gl = R.gl; R.floatBuf = false; R.quality = 0; R.resize(1000, 480, 1);
        R.setCamera([0, 1.05, 0], [0, 0, -1], [0, 1, 0], 50, .1, 400, 1000 / 480);
        const daylight = { ...R.atm, amb: [.65, .65, .65], gnd: [.12, .12, .12], sunCol: [.45, .45, .45], fogDens: 0, horizon: [0, 0, 0], zenith: [0, 0, 0], night: false };
        R.setAtmos(daylight);
        R.setEpisode(null); R.setFires([]); R.begin(); gl.clearColor(.12, .15, .17, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const names = ['farmer', 'militia', 'female_vc', 'nva', 'aviator', 'cow'], samples = [], sprites = [];
        for (let i = 0; i < names.length; i++) {
          const name = names[i], descriptor = PhotoSprites.describe({ kind: name, p: [0, 0, 0], face: 0, alive: true, walk: 0 }, { camera: [0, 1, -8] });
          const sprite = PhotoSprites.anchor({ ...descriptor, photoName: name, p: [(i - 2.5) * 1.1, .08, -5], h: name === 'cow' ? 1.22 : 1.65 }, PHOTO_ATLAS);
          sprites.push([name, sprite]);
          R.drawSprites(sprite.textureName || 'photo_' + name, [sprite]);
          const im = new Image(); im.src = 'assets/' + name + '.webp'; await im.decode();
          const canvas = document.createElement('canvas'); canvas.width = im.naturalWidth / 8; canvas.height = im.naturalHeight / 6; const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(im, descriptor.photoFrame % 8 * canvas.width, Math.floor(descriptor.photoFrame / 8) * canvas.height, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let visible = 0, transparent = 0;
          for (let j = 3; j < pixels.length; j += 4) { if (pixels[j] === 255) visible++; if (pixels[j] === 0) transparent++; }
          const meta = PHOTO_ATLAS[descriptor.photoVariant || name];
          samples.push({ name, frame: descriptor.photoFrame, variant: descriptor.photoVariant || null, width: canvas.width, height: canvas.height, visible, transparent, source: im.getAttribute('src'), runtimeAspect: sprite.w / sprite.h, expectedAspect: (meta.width / (meta.cols || 8)) / (meta.height / (meta.rows || 6)) });
        }
        const pixels = new Uint8Array(R.W * R.H * 4); gl.readPixels(0, 0, R.W, R.H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let foreground = 0; for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i] - 31) + Math.abs(pixels[i + 1] - 38) + Math.abs(pixels[i + 2] - 43) > 30) foreground++;
        const png = pixels => {
          const c = document.createElement('canvas'); c.width = R.W; c.height = R.H; const ctx = c.getContext('2d'), data = ctx.createImageData(c.width, c.height);
          for (let y = 0; y < R.H; y++) data.data.set(pixels.subarray(y * R.W * 4, (y + 1) * R.W * 4), (R.H - 1 - y) * R.W * 4);
          ctx.putImageData(data, 0, 0); return c.toDataURL('image/png');
        };
        const dayPNG = png(pixels);
        R.setAtmos({ ...daylight, amb: [.018, .022, .030], gnd: [.008, .009, .012], sunCol: [0, 0, 0], night: true });
        R.begin(); gl.clearColor(.12, .15, .17, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        for (const [name, sprite] of sprites) R.drawSprites(sprite.textureName || 'photo_' + name, [sprite]);
        const night = new Uint8Array(R.W * R.H * 4); gl.readPixels(0, 0, R.W, R.H, gl.RGBA, gl.UNSIGNED_BYTE, night);
        let daySum = 0, nightSum = 0, count = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          // The same photographed pixels at the same camera/geometry isolate
          // illumination from a changed silhouette or source-pose selection.
          if (Math.abs(pixels[i] - 31) + Math.abs(pixels[i + 1] - 38) + Math.abs(pixels[i + 2] - 43) <= 30) continue;
          daySum += .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
          nightSum += .2126 * night[i] + .7152 * night[i + 1] + .0722 * night[i + 2]; count++;
        }
        return { samples, foreground, lighting: { count, dayMean: daySum / count, nightMean: nightSum / count, ratio: nightSum / daySum }, width: R.W, height: R.H, png: dayPNG, nightPNG: png(night), gl: gl.getError() };
      });
      assert.equal(gallery.gl, 0); assert.ok(gallery.foreground > 10000, JSON.stringify({ ...gallery, png: undefined, nightPNG: undefined }));
      for (const s of gallery.samples) { assert.ok(s.visible > 5000 && s.transparent > 1000, JSON.stringify(s)); assert.equal(s.height, s.name === 'cow' ? 192 : 288); assert.ok(Math.abs(s.runtimeAspect - s.expectedAspect) < 1e-6); }
      assert.ok(gallery.lighting.count > 10000 && gallery.lighting.ratio > .01 && gallery.lighting.ratio < .35, JSON.stringify(gallery.lighting));
      const galleryFile = name + '-production-webgl-photograph-gallery.png'; await fs.writeFile(path.join(out, galleryFile), Buffer.from(gallery.png.split(',')[1], 'base64')); screenshots.push('photographic-sprites/' + galleryFile); delete gallery.png;
      const nightFile = name + '-production-webgl-night-photographs.png'; await fs.writeFile(path.join(out, nightFile), Buffer.from(gallery.nightPNG.split(',')[1], 'base64')); screenshots.push('photographic-sprites/' + nightFile); delete gallery.nightPNG;
      record(name, 'Production WebGL gallery renders the supplied 48-cell photographs with decoded source alpha', gallery);
      record(name, 'Identical source poses respond to day and night illumination without a daylight self-lit floor', gallery.lighting);
      assert.deepEqual(errors.filter(e => e.layout === name), []); assert.deepEqual(missing, []);
    } catch (e) {
      await shot('failure').catch(() => {}); await fs.writeFile(path.join(out, name + '-failure.json'), JSON.stringify({ error: String(e), checks, errors, missing }, null, 2)); throw e;
    } finally { await context.close(); }
  }
  const report = { suite: 'photographic-sprites', passed: true, checks, screenshots, errors, missing, sourceHashes, sourceSHA256: createHash('sha256').update(await fs.readFile(path.resolve(__dirname, '../assets/render/photographic-sprites.js'))).digest('hex'), scope: 'Actual Chromium/SwiftShader WebGL2, desktop and iPhone landscape layout emulation. Native Ready Room prison entry; declared mixed-roster countryside and isolated production renderer gallery fixtures. Original photographs retained; repaired NVA and aviator derivatives are not pixel-identical originals. Gallery PNGs read linear light before the normal display compositor. No physical iPhone Safari, Windows GPU or completed-mission claim.' };
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n'); return report;
};

if (require.main === module) (async () => {
  const { chromium } = require('playwright'), { createServer } = require('../tools/dev-server.cjs'); const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); let browser;
  try { browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); console.log(JSON.stringify(await module.exports(browser, 'http://127.0.0.1:' + server.address().port + '/', process.argv[2] || path.resolve(__dirname, '../test-results')), null, 2)); }
  finally { await browser?.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
