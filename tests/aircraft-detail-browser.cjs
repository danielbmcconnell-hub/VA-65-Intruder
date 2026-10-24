'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const moduleFiles = ['assets/flight/aircraft-detail.js', 'assets/flight/visual-materials.js'];

// Native mission initialization followed by declared, isolated close-up cameras.
// These are production meshes/materials, not a sortie or a physical-device test.
module.exports = async function aircraftDetailBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'aircraft-detail'), checks = [], screenshots = [];
  await fs.mkdir(out, { recursive: true });
  const initialSHA256 = Object.fromEntries(await Promise.all(['index.html', ...moduleFiles].map(async file => [file, sha(await fs.readFile(path.join(root, file)))])));
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ].filter(p => !process.env.INTRUDER_AIRCRAFT_PROFILE || p.name === process.env.INTRUDER_AIRCRAFT_PROFILE);
  for (const { name, ...options } of profiles) {
    const context = await browser.newContext(options), page = await context.newPage(), errors = [], missing = [];
    const responseDigests = [], runtimeSHA256 = {}, moduleHTTP = {};
    page.setDefaultTimeout(90000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {
      const file = new URL(r.url()).pathname;
      if (r.status() >= 400 && file.includes('/assets/')) missing.push({ file, status: r.status() });
      const moduleFile = moduleFiles.find(local => file.endsWith('/' + local));
      if (r.ok() && moduleFile) responseDigests.push(r.body().then(b => { runtimeSHA256[file] = moduleHTTP[moduleFile] = sha(b); }));
    });
    try {
      await context.addInitScript(() => {
        localStorage.setItem('a6_set', JSON.stringify({ quality: 1, sound: 0, voices: 0, assist: 1 }));
        localStorage.setItem('a6_sawkeys', '1');
        const raf = requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => window.__aircraftFixture ? 0 : raf(t => { if (!window.__aircraftFixture) callback(t); });
      });
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      const sourceSHA256 = sha(await response.body());
      assert.equal(sourceSHA256, initialSHA256['index.html'], name + ' HTTP index differs from source at start');
      if (options.hasTouch) await page.locator('#bootFly').tap(); else await page.locator('#bootFly').click();
      await page.waitForFunction(() => App.game?.st && App.rend?.meshes?.jolly && document.getElementById('loader').style.display === 'none');
      await page.evaluate(() => { window.__aircraftFixture = true; App.game.paused = true; App.screen = 'fixture'; });
      const data = await page.evaluate(() => {
        const g = App.game, R = App.rend, gl = R.gl, origin = [0, 100, 0], material = AircraftDetail;
        // A declared rescue-package fixture exercises Game.render's real pass
        // routing before the isolated close-ups; it does not earn a rescue.
        g._startGroundPhase(-7011.2, 660.8, 0, 'chute');
        const e = g.evade, y = e.p[1];
        e.sandy = [{ p: [e.p[0] - 15, y + 30, e.p[2] - 30], yaw: 0, pitch: 0, roll: 0 }];
        e.jolly = { p: [e.p[0] + 15, y + 20, e.p[2] - 25], yaw: 0, pitch: 0, roll: 0, hoist: 0 };
        const nativeRouting = [], meshDraw = R.drawMesh, glassDraw = R.drawGlass;
        R.drawMesh = function (name) { if (/^(sandy|jolly)/.test(name)) nativeRouting.push({ mesh: name, pass: 'opaque' }); return meshDraw.apply(this, arguments); };
        R.drawGlass = function (name) { if (/^(sandy|jolly)/.test(name)) nativeRouting.push({ mesh: name, pass: 'blended' }); return glassDraw.apply(this, arguments); };
        try { g.render(0); } finally { R.drawMesh = meshDraw; R.drawGlass = glassDraw; }
        R.setEpisode(null); R.setFires([]); R.shadows = false;
        R.setAtmos({ ...R.atm, sunDir: vnorm([-.45, .68, -.57]), sunCol: [.95, .90, .80], amb: [.27, .32, .38], gnd: [.15, .17, .18], horizon: [.52, .65, .73], zenith: [.18, .34, .53], fogDens: 0, cloud: 0, overcast: 0, stars: 0, moon: 0, night: false, nightContrast: 0 });
        const instance = new Float32Array(20); instance.set(m4trs(m4(), origin, [0, 0, 0], [1, 1, 1])); instance.set([1, 1, 1, 0], 16);
        const fixtures = [
          { id: 'a6a-quarter', mesh: 'intruder', glass: 'canopy', gear: true, eye: [17, 107, -20], focus: [0, 100, 0], fov: 46 },
          { id: 'a6a-cockpit', mesh: 'intruder', glass: 'canopy', eye: [4.8, 102.5, -8.2], focus: [0, 100.9, -4.0], fov: 45 },
          { id: 'a1-sandy-quarter', mesh: 'sandy', glass: 'sandyGlass', disc: 'sandyDisc', eye: [16, 106, -18], focus: [0, 100, 0], fov: 46 },
          { id: 'hh3e-jolly-quarter', mesh: 'jolly', glass: 'jollyGlass', disc: 'jollyDisc', eye: [17, 107, -18], focus: [0, 100, 0], fov: 46 }
        ];
        const read = () => { const p = new Uint8Array(R.W * R.H * 4); gl.readPixels(0, 0, R.W, R.H, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; };
        const capture = p => {
          const canvas = document.createElement('canvas'); canvas.width = R.W; canvas.height = R.H;
          const ctx = canvas.getContext('2d'), image = ctx.createImageData(R.W, R.H);
          for (let y = 0; y < R.H; y++) image.data.set(p.subarray(y * R.W * 4, (y + 1) * R.W * 4), (R.H - y - 1) * R.W * 4);
          ctx.putImageData(image, 0, 0); return canvas.toDataURL('image/png');
        };
        const records = [];
        for (const fixture of fixtures) {
          R.setCamera(fixture.eye, vsub(fixture.focus, fixture.eye), [0, 1, 0], fixture.fov, .1, 1000, R.W / R.H);
          const draw = (corrected, discMode = 'blended', body = true) => {
            // Re-enable the exact former generic wear branch for a material-only
            // comparison. Both renders retain the same refined production mesh.
            window.AircraftDetail = corrected ? material : { ...material, kind: () => 0 };
            try {
              R.begin(); R.drawSky(0);
              if (body) {
                R.drawMesh(fixture.mesh, instance, 1);
                if (fixture.gear) R.drawMesh('gear', instance, 1);
                // Match current production routing: A6 canopy is blended;
                // Sandy/Jolly glazing currently shares their opaque pass.
                if (fixture.glass === 'canopy') R.drawGlass(fixture.glass, instance, 1);
                else R.drawMesh(fixture.glass, instance, 1);
              }
              if (fixture.disc && discMode !== 'none') {
                if (discMode === 'opaque-control') R.drawMesh(fixture.disc, instance, 1);
                else R.drawGlass(fixture.disc, instance, 1);
              }
              R.end(0, 0, 1);
              return read();
            } finally { window.AircraftDetail = material; }
          };
          const before = draw(false), after = draw(true); let changed = 0, opaque = 0, maxDifference = 0;
          for (let i = 0; i < after.length; i += 4) {
            const diff = Math.max(Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]), Math.abs(before[i + 2] - after[i + 2]));
            if (diff > 2) changed++; maxDifference = Math.max(maxDifference, diff); if (after[i + 3] === 255) opaque++;
          }
          let rotor = null;
          if (fixture.disc) {
            const noRotor = draw(true, 'none'), sky = draw(true, 'none', false), opaqueControl = draw(true, 'opaque-control');
            // Read the actual scene alpha before the post-process makes the
            // final framebuffer opaque. This measures the blended disc alone.
            const alphaProbe = pass => {
              R.begin(); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
              if (pass === 'blended') R.drawGlass(fixture.disc, instance, 1); else R.drawMesh(fixture.disc, instance, 1);
              const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
              if (type !== gl.FLOAT && type !== gl.HALF_FLOAT && type !== gl.UNSIGNED_BYTE) throw Error('Unsupported scene read type: ' + type);
              const pixels = type === gl.FLOAT ? new Float32Array(R.W * R.H * 4) : type === gl.HALF_FLOAT ? new Uint16Array(R.W * R.H * 4) : new Uint8Array(R.W * R.H * 4);
              gl.readPixels(0, 0, R.W, R.H, gl.RGBA, type, pixels);
              const alpha = new Float32Array(R.W * R.H), scale = type === gl.FLOAT ? 1 : 1 / 255;
              const half = bits => { const exponent = bits >> 10 & 31, fraction = bits & 1023; return (bits & 32768 ? -1 : 1) * (exponent === 0 ? fraction * 2 ** -24 : exponent === 31 ? fraction ? NaN : Infinity : (1 + fraction / 1024) * 2 ** (exponent - 15)); };
              for (let i = 0; i < alpha.length; i++) alpha[i] = type === gl.HALF_FLOAT ? half(pixels[i * 4 + 3]) : pixels[i * 4 + 3] * scale;
              return alpha;
            };
            const alpha = alphaProbe('blended'), solid = alphaProbe('opaque');
            let covered = 0, translucent = 0, throughAirframe = 0, retainedAirframe = 0, minAlpha = 1, maxAlpha = 0;
            const delta = (a, b, i) => Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
            for (let pixel = 0; pixel < solid.length; pixel++) if (solid[pixel] > .99) {
              covered++; minAlpha = Math.min(minAlpha, alpha[pixel]); maxAlpha = Math.max(maxAlpha, alpha[pixel]);
              if (alpha[pixel] > 0 && alpha[pixel] < .95) translucent++;
              const i = pixel * 4, hiddenByOpaque = delta(opaqueControl, noRotor, i);
              if (delta(noRotor, sky, i) > 25 && hiddenByOpaque > 12) {
                throughAirframe++;
                if (delta(after, noRotor, i) < hiddenByOpaque * .9) retainedAirframe++;
              }
            }
            rotor = { pass: 'blended', alphaSource: 'actual scene framebuffer before opaque composite; SRC_ALPHA blending also squares source alpha', coveredPixels: covered, translucentPixels: translucent, minAlpha, maxAlpha, airframeBehindRotorPixels: throughAirframe, airframeLessOccludedThanOpaqueControlPixels: retainedAirframe, noRotorPNG: capture(noRotor), opaqueControlPNG: capture(opaqueControl) };
          }
          records.push({ ...fixture, changedPixels: changed, maxDifference, opaquePixels: opaque, pixels: R.W * R.H, rotor, glError: gl.getError(), png: capture(after) });
        }
        R.drawMesh('intruder', instance, 1); const aircraftKind = gl.getUniform(R.pMesh, R.pMesh.u.uAircraftKind);
        R.drawMesh('carrier', instance, 1); const carrierKind = gl.getUniform(R.pMesh, R.pMesh.u.uAircraftKind);
        return {
          width: R.W, height: R.H, quality: R.quality, dpr: R.dpr, gpu: gl.getParameter(gl.VERSION),
          meshLinked: gl.getProgramParameter(R.pMesh, gl.LINK_STATUS), glassLinked: gl.getProgramParameter(R.pGlass, gl.LINK_STATUS),
          normals: Object.fromEntries(['intruder', 'canopy', 'sandy', 'sandyGlass', 'jolly', 'jollyGlass', 'gear'].map(k => [k, R.meshes[k].aircraftDetail])),
          aircraftKind, carrierKind, nativeRouting, records, glError: gl.getError()
        };
      });
      await Promise.all(responseDigests);
      for (const file of moduleFiles) assert.equal(moduleHTTP[file], initialSHA256[file], name + ' HTTP module differs from source: ' + file);
      assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.equal(data.glError, 0);
      assert.equal(data.meshLinked, true); assert.equal(data.glassLinked, true); assert.equal(data.quality, 1);
      assert.equal(data.aircraftKind, 1); assert.equal(data.carrierKind, 0);
      for (const disc of ['sandyDisc', 'jollyDisc']) {
        assert.ok(data.nativeRouting.some(row => row.mesh === disc && row.pass === 'blended'), disc + ' native blended pass');
        assert.ok(!data.nativeRouting.some(row => row.mesh === disc && row.pass === 'opaque'), disc + ' must not use native opaque pass');
      }
      for (const [mesh, report] of Object.entries(data.normals)) {
        assert.ok(report && report.vertices > 0, mesh); assert.equal(report.positionsChanged, false); assert.equal(report.colorsChanged, false); assert.equal(report.indicesChanged, false);
      }
      for (const mesh of ['intruder', 'canopy', 'sandy', 'jolly']) assert.ok(data.normals[mesh].smoothedVertices > 0, mesh);
      for (const record of data.records) {
        assert.equal(record.glError, 0); assert.ok(record.changedPixels > 100, record.id); assert.equal(record.opaquePixels, record.pixels);
        if (record.rotor) {
          assert.ok(record.rotor.coveredPixels > 1000, record.id + ' visible rotor probe');
          assert.ok(record.rotor.translucentPixels > record.rotor.coveredPixels * .8, record.id + ' rotor must transmit background');
          assert.ok(record.rotor.airframeBehindRotorPixels > 100, record.id + ' probe must overlap actual airframe');
          assert.ok(record.rotor.airframeLessOccludedThanOpaqueControlPixels > record.rotor.airframeBehindRotorPixels * .5, record.id + ' airframe must remain visible through rotor');
          for (const [field, label] of [['noRotorPNG', 'no-rotor-reference'], ['opaqueControlPNG', 'intentionally-opaque-control']]) {
            const proofFile = name + '-' + record.id + '-' + label + '.png';
            await fs.writeFile(path.join(out, proofFile), Buffer.from(record.rotor[field].split(',')[1], 'base64'));
            screenshots.push('aircraft-detail/' + proofFile); delete record.rotor[field];
          }
        }
        const filename = name + '-' + record.id + '.png';
        await fs.writeFile(path.join(out, filename), Buffer.from(record.png.split(',')[1], 'base64'));
        screenshots.push('aircraft-detail/' + filename); delete record.png;
      }
      checks.push({ layout: name, name: name + ' real aircraft meshes, filtered local materials, canopy shaders and state reset', passed: true, indexSHA256: sourceSHA256, moduleSHA256: moduleHTTP['assets/flight/aircraft-detail.js'], sourceSHA256, runtimeSHA256, modules: moduleHTTP, observed: data });
      console.log('PASS aircraft-detail ' + name + ' production mesh/material close-ups');
    } finally { await context.close(); }
  }
  assert.ok(checks.length > 0, 'No matching aircraft profile');
  for (const [file, digest] of Object.entries(initialSHA256)) assert.equal(sha(await fs.readFile(path.join(root, file))), digest, 'Source changed during aircraft checks: ' + file);
  for (const check of checks) check.sourceStable = true;
  return { suite: 'aircraft-detail', passed: true, sourceStable: true, indexSHA256: initialSHA256['index.html'], moduleSHA256: initialSHA256['assets/flight/aircraft-detail.js'], modules: Object.fromEntries(moduleFiles.map(file => [file, initialSHA256[file]])), checks, screenshots, scope: 'Native training button initializes the production engine. A declared rescue package exercises real Game.render pass routing; four isolated close-up cameras per viewport then match those production passes at Medium quality. Actual scene alpha and opaque-control comparisons verify translucent rotor coverage and visible underlying airframe. Material A/B changes only the material branch; both retain corrected normals. Chromium/SwiftShader desktop and simulated phone layout; no physical-device, measured FPS, entire mission or universal photorealism claim.', limitations: ['Current native Sandy/Jolly glazing is opaque; this fixture preserves that existing production route rather than claiming improved transparent windows.', 'Rotor blur uses the existing blended static disc and blade geometry; these checks do not demonstrate a new time-varying blade animation.'] };
};

if (require.main === module) (async () => {
  const { chromium } = require('playwright'), { createServer } = require('../tools/dev-server.cjs');
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const out = process.argv[2] || 'test-results/aircraft-detail'; await fs.mkdir(out, { recursive: true });
    const result = await module.exports(browser, 'http://127.0.0.1:' + server.address().port + '/', out);
    await fs.writeFile(path.join(out, 'aircraft-detail.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ passed: result.passed, checks: result.checks.length, screenshots: result.screenshots.length }));
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
