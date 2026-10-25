'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const moduleFiles = ['assets/flight/aircraft-detail.js', 'assets/flight/visual-materials.js'];
async function sourceSnapshot(){
  const files=['index.html'];async function walk(dir){for(const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory())await walk(file);else if(/\.(js|css|json|glsl)$/.test(file))files.push(file);}}
  await walk('assets');return Object.fromEntries(await Promise.all(files.sort().map(async file=>[file,sha(await fs.readFile(path.join(root,file)))])));
}

// Native mission initialization followed by declared, isolated close-up cameras.
// These are production meshes/materials, not a sortie or a physical-device test.
module.exports = async function aircraftDetailBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'aircraft-detail'), checks = [], screenshots = [];
  await fs.mkdir(out, { recursive: true });
  const sourceFiles=await sourceSnapshot(),initialSHA256=sourceFiles;
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ].filter(p => !process.env.INTRUDER_AIRCRAFT_PROFILE || p.name === process.env.INTRUDER_AIRCRAFT_PROFILE);
  for (const { name, ...options } of profiles) {
    const context = await browser.newContext(options), page = await context.newPage(), errors = [], missing = [];
    const responseDigests = [], runtimeSHA256 = {}, moduleHTTP = {},executedModules={};let collecting=true;
    const track=promise=>responseDigests.push(promise.catch(error=>{errors.push('HTTP response body: '+String(error.message||error));}));
    page.setDefaultTimeout(90000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {
      if(!collecting)return;
      const file = new URL(r.url()).pathname;
      if (r.status() >= 400 && file.includes('/assets/')) missing.push({ file, status: r.status() });
      const moduleFile = moduleFiles.find(local => file.endsWith('/' + local));
      if (r.ok() && moduleFile) track(r.body().then(b => { runtimeSHA256[file] = moduleHTTP[moduleFile] = sha(b); }));
      if(r.ok()&&r.url().startsWith(target)&&/\/assets\/.*\.(js|css|json|glsl)$/.test(file))track(r.body().then(b=>{executedModules[file.slice(1)]=sha(b);}));
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
        // Rebuild the exact original authored geometry with only the preceding
        // normal correction. Current grading, camera, materials and transparent
        // pass are shared by both geometry states; no old screenshot is reused.
        const tail=g.mis.visualTail||g.mis.brief?.tail,ship=(g.mis.brief?.origin||'').split('(')[0];
        const originalIntruder=buildIntruder(tail,g.mis.brief?.buno,ship);
        const originals={intruder:originalIntruder,canopy:buildIntruder.glass,sandy:buildSandy()};
        originals.sandyGlass=buildSandy.glass;originals.jolly=buildJolly();originals.jollyGlass=buildJolly.glass;
        for(const [name,builder]of Object.entries(originals)){
          AircraftDetail.refineNormals(builder,name);
          const uploaded=builder.upload(gl);uploaded.aircraftDetail=AircraftDetail.inspect(builder);R.meshes[name+'_geometryBaseline']=uploaded;
        }
        R.setEpisode(null); R.setFires([]); R.shadows = false;
        R.setAtmos({ ...R.atm, sunDir: vnorm([-.45, .68, -.57]), sunCol: [.95, .90, .80], amb: [.27, .32, .38], gnd: [.15, .17, .18], horizon: [.52, .65, .73], zenith: [.18, .34, .53], fogDens: 0, cloud: 0, overcast: 0, stars: 0, moon: 0, night: false, nightContrast: 0 });
        const instance = new Float32Array(20); instance.set(m4trs(m4(), origin, [0, 0, 0], [1, 1, 1])); instance.set([1, 1, 1, 0], 16);
        const fixtures = [
          { id: 'a6a-quarter', mesh: 'intruder', glass: 'canopy', gear: true, eye: [17, 107, -20], focus: [0, 100, 0], fov: 38 },
          { id: 'a6a-cockpit', mesh: 'intruder', glass: 'canopy', eye: [4.8, 102.5, -8.2], focus: [0, 100.9, -4.0], fov: 45 },
          { id: 'a6a-inlet', mesh: 'intruder', glass: 'canopy', eye: [4.6, 101.7, -9.0], focus: [0, 100.4, -4.5], fov: 40 },
          { id: 'a6a-exhaust', mesh: 'intruder', glass: 'canopy', eye: [7, 102.8, 8.8], focus: [0, 99.9, 1.3], fov: 44 },
          { id: 'a1-sandy-quarter', mesh: 'sandy', glass: 'sandyGlass', disc: 'sandyDisc', eye: [16, 106, -18], focus: [0, 100, 0], fov: 46 },
          { id: 'a1-sandy-cockpit', mesh: 'sandy', glass: 'sandyGlass', disc: 'sandyDisc', eye: [4.0, 102.1, -8.8], focus: [0, 100.5, -3.0], fov: 44 },
          { id: 'hh3e-jolly-quarter', mesh: 'jolly', glass: 'jollyGlass', disc: 'jollyDisc', eye: [17, 107, -18], focus: [0, 100, 0], fov: 46 },
          { id: 'hh3e-jolly-cockpit', mesh: 'jolly', glass: 'jollyGlass', eye: [4.0, 102, -10.0], focus: [0, 100.6, -6.7], fov: 42 }
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
          const draw = (corrected, discMode = 'blended', body = true,geometryBaseline=false) => {
            // Re-enable the exact former generic wear branch for a material-only
            // comparison. Both renders retain the same refined production mesh.
            window.AircraftDetail = {...material,kind:corrected?(name=>material.kind(name.replace(/_geometryBaseline$/,''))):()=>0};
            const geometryName=name=>geometryBaseline&&originals[name]?name+'_geometryBaseline':name;
            try {
              R.begin(); R.drawSky(0);
              if (body) {
                R.drawMesh(geometryName(fixture.mesh), instance, 1);
                if (fixture.gear) R.drawMesh('gear', instance, 1);
                R.drawGlass(geometryName(fixture.glass), instance, 1);
              }
              if (fixture.disc && discMode !== 'none') {
                if (discMode === 'opaque-control') {gl.disable(gl.CULL_FACE);R.drawMesh(fixture.disc, instance, 1);gl.enable(gl.CULL_FACE);}
                else R.drawGlass(fixture.disc, instance, 1);
              }
              R.end(0, 0, 1);
              return read();
            } finally { window.AircraftDetail = material; }
          };
          const before = draw(false), after = draw(true); let changed = 0, opaque = 0, maxDifference = 0;
          const geometryBefore=draw(true,'blended',true,true);let geometryChangedPixels=0;
          for (let i = 0; i < after.length; i += 4) {
            const diff = Math.max(Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]), Math.abs(before[i + 2] - after[i + 2]));
            if (diff > 2) changed++; maxDifference = Math.max(maxDifference, diff); if (after[i + 3] === 255) opaque++;
            if(Math.max(Math.abs(geometryBefore[i]-after[i]),Math.abs(geometryBefore[i+1]-after[i+1]),Math.abs(geometryBefore[i+2]-after[i+2]))>2)geometryChangedPixels++;
          }
          let rotor = null;
          if (fixture.disc) {
            const noRotor = draw(true, 'none'), sky = draw(true, 'none', false), opaqueControl = draw(true, 'opaque-control');
            // Read the actual scene alpha before the post-process makes the
            // final framebuffer opaque. This measures the blended disc alone.
            const alphaProbe = pass => {
              R.begin(); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
              if (pass === 'blended') R.drawGlass(fixture.disc, instance, 1); else {gl.disable(gl.CULL_FACE);R.drawMesh(fixture.disc, instance, 1);gl.enable(gl.CULL_FACE);}
              const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
              if (type !== gl.FLOAT && type !== gl.HALF_FLOAT && type !== gl.UNSIGNED_BYTE) throw Error('Unsupported scene read type: ' + type);
              const pixels = type === gl.FLOAT ? new Float32Array(R.W * R.H * 4) : type === gl.HALF_FLOAT ? new Uint16Array(R.W * R.H * 4) : new Uint8Array(R.W * R.H * 4);
              gl.readPixels(0, 0, R.W, R.H, gl.RGBA, type, pixels);
              const alpha = new Float32Array(R.W * R.H), scale = type === gl.FLOAT ? 1 : 1 / 255;
              const half = bits => { const exponent = bits >> 10 & 31, fraction = bits & 1023; return (bits & 32768 ? -1 : 1) * (exponent === 0 ? fraction * 2 ** -24 : exponent === 31 ? fraction ? NaN : Infinity : (1 + fraction / 1024) * 2 ** (exponent - 15)); };
              for (let i = 0; i < alpha.length; i++) alpha[i] = type === gl.HALF_FLOAT ? half(pixels[i * 4 + 3]) : pixels[i * 4 + 3] * scale;
              return alpha;
            };
            const savedTime=R.time;R.time=3.0;const alpha=alphaProbe('blended'),sameClock=alphaProbe('blended');R.time=3.7;const advancedClock=alphaProbe('blended');R.time=savedTime;const solid=alphaProbe('opaque');
            let pausedDifferences=0,advancedDifferences=0,maxTemporalDifference=0;
            for(let i=0;i<alpha.length;i++){if(alpha[i]!==sameClock[i])pausedDifferences++;const d=Math.abs(alpha[i]-advancedClock[i]);if(d>1e-6)advancedDifferences++;maxTemporalDifference=Math.max(maxTemporalDifference,d);}
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
            rotor = { pass: 'blended', alphaSource: 'actual scene framebuffer before opaque composite; SRC_ALPHA blending also squares source alpha',manualClockProbe:{sameTime:3.0,advancedTime:3.7,pausedDifferences,advancedDifferences,maxTemporalDifference,scope:'Declared renderer-clock probe isolates the production exposure material; not a physical RPM measurement'},coveredPixels: covered, translucentPixels: translucent, minAlpha, maxAlpha, airframeBehindRotorPixels: throughAirframe, airframeLessOccludedThanOpaqueControlPixels: retainedAirframe, noRotorPNG: capture(noRotor), opaqueControlPNG: capture(opaqueControl) };
          }
          records.push({ ...fixture, changedPixels: changed, maxDifference,geometryChangedPixels,geometryBaselinePNG:capture(geometryBefore), opaquePixels: opaque, pixels: R.W * R.H, rotor, glError: gl.getError(), png: capture(after) });
        }
        R.drawMesh('intruder', instance, 1); const aircraftKind = gl.getUniform(R.pMesh, R.pMesh.u.uAircraftKind);
        R.drawMesh('carrier', instance, 1); const carrierKind = gl.getUniform(R.pMesh, R.pMesh.u.uAircraftKind);
        return {
          width: R.W, height: R.H, quality: R.quality, dpr: R.dpr, gpu: gl.getParameter(gl.VERSION),
          meshLinked: gl.getProgramParameter(R.pMesh, gl.LINK_STATUS), glassLinked: gl.getProgramParameter(R.pGlass, gl.LINK_STATUS),
          normals: Object.fromEntries(['intruder', 'canopy', 'sandy', 'sandyGlass', 'jolly', 'jollyGlass', 'gear'].map(k => [k, R.meshes[k].aircraftDetail])),
          rotorMeshes:Object.fromEntries(['sandyDisc','jollyDisc'].map(k=>[k,R.meshes[k].aircraftDetail])),
          aircraftKind, carrierKind, nativeRouting, records, glError: gl.getError()
        };
      });
      await Promise.all(responseDigests);
      for (const file of moduleFiles) assert.equal(moduleHTTP[file], initialSHA256[file], name + ' HTTP module differs from source: ' + file);
      for(const [file,digest]of Object.entries(executedModules))assert.equal(digest,sourceFiles[file],name+' actual HTTP runtime differs: '+file);
      assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.equal(data.glError, 0);
      assert.equal(data.meshLinked, true); assert.equal(data.glassLinked, true); assert.equal(data.quality, 1);
      assert.equal(data.aircraftKind, 1); assert.equal(data.carrierKind, 0);
      for (const disc of ['sandyDisc', 'jollyDisc']) {
        assert.ok(data.nativeRouting.some(row => row.mesh === disc && row.pass === 'blended'), disc + ' native blended pass');
        assert.ok(!data.nativeRouting.some(row => row.mesh === disc && row.pass === 'opaque'), disc + ' must not use native opaque pass');
      }
      for(const glass of ['sandyGlass','jollyGlass']){assert.ok(data.nativeRouting.some(row=>row.mesh===glass&&row.pass==='blended'),glass+' native transparent pass');assert.ok(!data.nativeRouting.some(row=>row.mesh===glass&&row.pass==='opaque'),glass+' must not cover its repaired cockpit with opaque paint');}
      assert.equal(data.rotorMeshes.sandyDisc.geometry.singleSurface,true);assert.equal(data.rotorMeshes.sandyDisc.triangles,48);
      assert.equal(data.rotorMeshes.jollyDisc.geometry.singleSurface,true);assert.equal(data.rotorMeshes.jollyDisc.triangles,80);
      for (const [mesh, report] of Object.entries(data.normals)) {
        assert.ok(report && report.vertices > 0, mesh);assert.equal(report.positionsChanged,mesh!=='gear');assert.equal(report.colorsChanged,mesh!=='gear');assert.equal(report.indicesChanged,mesh!=='gear');
        if(mesh!=='gear')assert.ok(report.geometry,mesh+' documented geometry repair');
      }
      for (const mesh of ['intruder', 'canopy', 'sandy', 'jolly']) assert.ok(data.normals[mesh].smoothedVertices > 0, mesh);
      for (const record of data.records) {
        assert.equal(record.glError, 0); assert.ok(record.changedPixels > 100, record.id);assert.ok(record.geometryChangedPixels>20,record.id+' actual geometry changes visible pixels'); assert.equal(record.opaquePixels, record.pixels);
        const baselineFile=name+'-'+record.id+'-previous-geometry.png';await fs.writeFile(path.join(out,baselineFile),Buffer.from(record.geometryBaselinePNG.split(',')[1],'base64'));screenshots.push('aircraft-detail/'+baselineFile);delete record.geometryBaselinePNG;
        if (record.rotor) {
          assert.equal(record.rotor.manualClockProbe.pausedDifferences,0,record.id+' identical simulation time freezes rotor exposure');
          assert.ok(record.rotor.manualClockProbe.advancedDifferences>100,record.id+' advancing renderer time changes actual rotor alpha');
          assert.ok(record.rotor.maxAlpha<.04,record.id+' neutral blurred rotor remains faint, without opaque glass sheen');
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
      checks.push({ layout: name, name: name + ' real aircraft openings, interiors, filtered materials, transparent glazing and state reset', passed: true, indexSHA256: sourceSHA256, moduleSHA256: moduleHTTP['assets/flight/aircraft-detail.js'], sourceSHA256, runtimeSHA256, modules: moduleHTTP,executedModules, observed: data });
      console.log('PASS aircraft-detail ' + name + ' production mesh/material close-ups');
    } finally {
      collecting=false;
      try{await Promise.all(responseDigests);for(const [file,digest]of Object.entries(executedModules))assert.equal(digest,sourceFiles[file],name+' final HTTP runtime differs: '+file);}
      finally{await context.close();}
    }
  }
  assert.ok(checks.length > 0, 'No matching aircraft profile');
  assert.deepEqual(await sourceSnapshot(),sourceFiles,'Source changed during aircraft checks');
  for (const check of checks) check.sourceStable = true;
  return { suite: 'aircraft-detail', passed: true, sourceStable: true,sourceFiles, indexSHA256: initialSHA256['index.html'], moduleSHA256: initialSHA256['assets/flight/aircraft-detail.js'], modules: Object.fromEntries(moduleFiles.map(file => [file, initialSHA256[file]])), checks, screenshots, scope: 'Native training button initializes the production engine. A declared rescue package exercises real Game.render pass routing; eight isolated close-up cameras per viewport match those production passes at Medium quality. Same-current-camera/material/grading previous-geometry controls use original builders plus the existing normals-only correction. Actual scene alpha and opaque controls verify transparent rotor coverage and underlying airframe. All executed HTTP runtime modules and all runtime text files are source-bound. Chromium/SwiftShader desktop and simulated phone layout; no physical-device, measured FPS, entire mission or universal photorealism claim.', limitations: ['These are repaired authored 3D models, not scanned photographic aircraft.', 'Rotor blur uses the existing blended disc geometry; these checks do not establish physical-device FPS.'] };
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
