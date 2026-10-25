'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function sources() {
  const files = ['index.html'];
  async function walk(dir) { for (const e of await fs.readdir(path.join(root, dir), { withFileTypes: true })) { const f = dir + '/' + e.name; if (e.isDirectory()) await walk(f); else if (/\.(js|css|json|glsl)$/.test(f)) files.push(f); } }
  await walk('assets'); return Object.fromEntries(await Promise.all(files.sort().map(async f => [f, sha(await fs.readFile(path.join(root, f)))])));
}
module.exports = async function threatBrowser(browser, target, evidenceDir) {
  const start = await sources(), checks = [], screenshots = [], executedHTTP = [], errors = [], missing = [], sourceHashes = [];
  const out = path.resolve(evidenceDir, 'threat-feedback'); await fs.mkdir(out, { recursive: true });
  try {
    for (const profile of [{ name: 'desktop', viewport: { width: 1280, height: 720 } }, { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]) {
      const { name, ...options } = profile, context = await browser.newContext(options), page = await context.newPage(), jobs = [];
      page.setDefaultTimeout(90000);
      const record = (title, actual, scope) => { checks.push({ layout: name, name: title, passed: true, actual, ...(scope ? { scope } : {}) }); console.log('PASS threat-feedback ' + name + ' ' + title); };
      const click = locator => options.hasTouch ? locator.tap() : locator.click();
      const shot = async label => {
        // Retain the native caption fade, but capture after it becomes readable.
        await page.evaluate(async () => { await Promise.all(Array.from(document.querySelectorAll('#radio .rmsg')).flatMap(el => el.getAnimations().map(a => a.finished.catch(() => {})))); });
        const file = name + '-' + label + '.png'; await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('threat-feedback/' + file);
      };
      page.on('pageerror', e => errors.push({ layout: name, message: e.message }));
      page.on('response', r => { if (!r.url().startsWith(target)) return; if (r.status() >= 400) missing.push({ layout: name, url: r.url(), status: r.status() }); if (/\/assets\/.*\.(js|css|json|glsl)$/.test(r.url())) jobs.push(r.body().then(b => executedHTTP.push({ layout: name, file: new URL(r.url()).pathname.slice(1), sha256: sha(b) }))); });
      try {
        await context.addInitScript(touch => {
          localStorage.setItem('a6_set', JSON.stringify({ quality: touch ? 1 : 2, sound: 1, voices: 0, seat: 0, assist: 0, mouse: 0 }));
          localStorage.setItem('a6_sawkeys', '1');
          const raf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = cb => window.__threatFixed ? 0 : raf(t => { if (!window.__threatFixed) cb(t); });
        }, !!options.hasTouch);
        const entry = await page.goto(target, { waitUntil: 'domcontentloaded' }); sourceHashes.push({ layout: name, indexSHA256: sha(await entry.body()) });
        await page.waitForFunction(() => window.App && window.FlightThreatFeedback, null, { polling: 50 });
        await click(page.locator('#bootGo')); await click(page.locator('#readyBody .mcard').first()); await click(page.getByRole('button', { name: 'Man Aircraft', exact: true }));
        await page.waitForFunction(() => { if (document.getElementById('graphicError')) throw Error(document.getElementById('graphicError').innerText); return App.game && document.getElementById('loader').style.display === 'none'; }, null, { polling: 50 });
        await page.evaluate(() => { window.__threatFixed = true; App.game.paused = true; });
        await page.waitForFunction(() => { const p = PhotoCutouts.inspect(App.rend); if (p.status === 'error' || App.rend.gl.isContextLost()) throw Error(JSON.stringify(p)); return p.status === 'ready' && CarrierLaunch.ready(App.rend); }, null, { polling: 50 });
        const initialized = await page.evaluate(() => ({ mission: App.game.mis.id, quality: App.rend.quality, photoStatus: PhotoCutouts.inspect(App.rend).status, crewReady: CarrierLaunch.ready(App.rend), audio: { state: App.audio.ctx && App.audio.ctx.state, on: App.audio.on, toneNode: !!App.audio.tone, oscillator: !!App.audio.to }, gl: App.rend.gl.getError() }));
        assert.equal(initialized.mission, 'm1'); assert.equal(initialized.quality, options.hasTouch ? 1 : 2); assert.equal(initialized.photoStatus, 'ready'); assert.equal(initialized.crewReady, true); assert.equal(initialized.audio.on, true); assert.ok(initialized.audio.toneNode && initialized.audio.oscillator); assert.equal(initialized.gl, 0);
        record('Native Mission01 initializes the actual renderer, complete photographs and original WebAudio nodes', initialized);
        const fixture = await page.evaluate(() => {
          const g = App.game, W = g.world, ac = g.ac;
          let siteP = null;
          for (let ring = 0; ring <= 6 && !siteP; ring++) for (let z = -ring; z <= ring && !siteP; z++) for (let x = -ring; x <= ring; x++) {
            if (ring && Math.abs(x) !== ring && Math.abs(z) !== ring) continue;
            const px = -10000 + x * 500, pz = z * 500, h = terrainH(px, pz);
            if (!(h > 20 && dryJungleAt(px, pz))) continue;
            if (Math.max(...[[15, 0], [-15, 0], [0, 15], [0, -15]].map(d => Math.abs(terrainH(px + d[0], pz + d[1]) - h))) > 4) continue;
            siteP = [px, h, pz]; break;
          }
          if (!siteP) throw Error('Declared SAM fixture requires a real dry, gently sloping terrain point');
          const originalTone = App.audio.setTone; window.__threatTone = [];
          App.audio.setTone = function (value, frequency) { window.__threatTone.push({ value, frequency }); if (window.__threatTone.length > 600) window.__threatTone.shift(); return originalTone.apply(this, arguments); };
          const originalWarnings = g.hud.warnStack; window.__threatWarningGeometry = null;
          g.hud.warnStack = function (st, x, y) { window.__threatWarningGeometry = { x, y, labels: st.warnings.map(w => ({ ...w })) }; return originalWarnings.apply(this, arguments); };
          W.fx.clear(); W.threats = []; W.saf = []; W.secs = []; W.sams = []; W.arms = []; W.bombs = []; W.fires = []; W.radar = null;
          W.sites = [{ p: siteP.slice(), cool: 20, alive: true, tracking: .3, salvo: 0 }];
          W.targets.push({ kind: 'launcher', p: siteP.slice(), hp: 35, hp0: 35, r: 11, label: 'DECLARED LAUNCH FIXTURE', mesh: 'sam', alive: true, score: 30, burn: 0, yaw: 0 });
          Object.assign(ac, { p: [siteP[0] + 12000, Math.max(terrainH(siteP[0] + 12000, siteP[2]) + 1200, siteP[1] + 1200), siteP[2]], v: [0, 0, -150], yaw: 0, pitch: 0, roll: 0, onDeck: false, cat: 0, gear: false, hook: false, thr: .7 });
          g.phase = 'airborne'; g.rightSeat = false; g.hud.scope = false; g.extView = false; g.camSm = null; g._lw = 0;
          const env = { ...g.mis.env, hour: .5, moon: .15, fog: .12, cloud: 1200 }; g.atm = g.makeAtmos(env);
          App.keys = {}; for (const key of ['pitch', 'roll', 'thrUp', 'thrDn', 'commit']) App.gctl[key] = 0;
          App.screen = 'game'; g.paused = false;
          window.__threatFixture = { site: siteP.slice(), night: env, stores: { bombs: ac.bombs, arms: ac.arms }, calls: [] };
          window.__threatSnapshot = () => {
            g.render(0); g.syncControls();
            const R = g.rend, gl = R.gl, st = g.hudState(), geometry = window.__threatWarningGeometry;
            let red = 0, amber = 0, crop = null;
            if (geometry && st.warnings.length) {
              const ctx = g.hud.g; ctx.save(); ctx.font = 'bold 12px "Share Tech Mono", monospace'; const width = ctx.measureText(geometry.labels[0].t).width + 26; ctx.restore();
              const dpr = g.hud.dpr || 1, x = Math.max(0, Math.round((geometry.x - width / 2 + 3) * dpr)), y = Math.max(0, Math.round((geometry.y - 7) * dpr));
              const w = Math.min(Math.round((width - 6) * dpr), g.hud.cv.width - x), h = Math.min(Math.round(14 * dpr), g.hud.cv.height - y), pixels = ctx.getImageData(x, y, w, h).data; crop = [x, y, w, h];
              for (let i = 0; i < pixels.length; i += 4) { const r = pixels[i], gr = pixels[i + 1], b = pixels[i + 2]; if (pixels[i + 3] < 30) continue; if (r > 40 && r > gr * 2.2 && r > b * 1.4) red++; if (r > 40 && gr > 25 && r > gr * 1.1 && gr > b * 1.2 && r < gr * 2.2) amber++; }
            }
            const lights = Array.from({ length: R.fireN }, (_, i) => ({ p: Array.from(R.fires.slice(i * 4, i * 4 + 3)), power: R.fires[i * 4 + 3], radiusSquared: R.fireR[i], color: Array.from(R.fireC.slice(i * 3, i * 3 + 3)) }));
            return { t: g.t, worldTime: W.t, alive: ac.alive, phase: g.phase, result: g.result, p: ac.p.slice(), v: ac.v.slice(), yaw: ac.yaw, launchWarn: W.launchWarn, samWarn: W.samWarn, warnings: st.warnings, rwr: st.rwrContacts,
              caption: document.getElementById('radio').innerText, tone: window.__threatTone.at(-1) || null, hudPixels: { red, amber, crop }, events: FlightThreatFeedback.inspect(W), transientLights: FlightThreatFeedback.transientLights(W), lights,
              gpuLights: { count: gl.getUniform(R.pMesh, R.pMesh.u.uFireN), positions: Array.from(gl.getUniform(R.pMesh, R.pMesh.u.uFires) || []) },
              missiles: W.sams.map(m => ({ p: m.p.slice(), v: m.v.slice(), t: m.t, armed: m.armed, trail: FlightThreatFeedback.inspectTrail(m) })), particles: { glow: W.fx.add.length, smoke: W.fx.smk.length }, canvas: [R.W, R.H], gl: gl.getError() };
          };
          return { site: siteP.slice(), groundHeight: terrainH(siteP[0], siteP[2]), dryHabitat: dryJungleAt(siteP[0], siteP[2]), aircraft: { p: ac.p.slice(), v: ac.v.slice(), yaw: ac.yaw }, night: env };
        });
        await page.evaluate(() => { const g = App.game; g.update(1 / 60); document.getElementById('teach').click(); });
        const radar = await page.evaluate(() => window.__threatSnapshot());
        assert.ok(radar.samWarn > 0); assert.equal(radar.launchWarn, 0); assert.equal(radar.events.launches, 0); assert.ok(radar.warnings.some(w => w.t === 'SAM RADAR' && w.c === 'a')); assert.ok(!radar.warnings.some(w => w.t === 'SAM LAUNCH')); assert.ok(radar.hudPixels.amber > 100); assert.equal(radar.hudPixels.red, 0); assert.deepEqual(radar.tone, { value: .5, frequency: 760 }); assert.equal(radar.gl, 0);
        record('Actual radar tracking produces amber HUD pixels and the original radar tone without inventing a launch', radar, 'Declared 12km-port site and airborne initial conditions; original World._threats/Game.update and night-atmosphere method.'); await shot('radar-only');
        const launched = await page.evaluate(() => { const g = App.game; g.world.sites[0].tracking = .99; g.world.sites[0].cool = 0; g.update(1 / 60); document.getElementById('teach').click(); return window.__threatSnapshot(); });
        assert.equal(launched.events.launches, 1); assert.equal(launched.missiles.length, 1); assert.ok(launched.launchWarn > 0); assert.ok(launched.warnings.some(w => w.t === 'SAM LAUNCH' && w.c === 'r')); assert.ok(launched.hudPixels.red > 100); assert.match(launched.caption, /nine o'clock/); assert.doesNotMatch(launched.caption, /going down and right|get down|go right/i); assert.deepEqual(launched.tone, { value: 1, frequency: 1320 }); assert.ok(launched.transientLights.length > 0); assert.equal(launched.gl, 0);
        const light = launched.transientLights[0], close = p => Math.hypot(...p.map((n, i) => n - light.position[i])) < .03;
        assert.ok(launched.lights.some(l => close(l.p) && l.power > 0)); assert.ok(launched.gpuLights.count > 0); assert.ok(Array.from({ length: launched.gpuLights.count }, (_, i) => launched.gpuLights.positions.slice(i * 4, i * 4 + 3)).some(close));
        record('A legally ready site launches through the real game, giving a correct clock call, red warning and actual GPU launch-light uniforms', launched); await shot('launch-warning');
        const macro = await page.evaluate(() => {
          const g = App.game, R = g.rend, gl = R.gl, p = window.__threatFixture.site, originalCamera = R.setCamera, drawParticles = R.drawParticles, setFires = R.setFires;
          const eye = [p[0] + 35, p[1] + 22, p[2] + 40], target = [p[0], p[1] + 5, p[2]], direction = target.map((n, i) => n - eye[i]), length = Math.hypot(...direction);
          R.setCamera = function (_eye, _fwd, _up, fov, near, far, aspect) { return originalCamera.call(this, eye, direction.map(n => n / length), [0, 1, 0], fov, near, far, aspect); };
          const read = () => { const data = new Uint8Array(R.W * R.H * 4); gl.readPixels(0, 0, R.W, R.H, gl.RGBA, gl.UNSIGNED_BYTE, data); return data; };
          const diff = (a, b) => { let changed = 0, total = 0; for (let i = 0; i < a.length; i += 4) { const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); total += d; if (d > 4) changed++; } return { changedPixels: changed, totalAbsoluteRGB: total }; };
          try {
            g.render(0); const on = read(), png = R.canvas.toDataURL('image/png'); R.drawParticles = () => {}; g.render(0); const noParticles = read();
            R.drawParticles = drawParticles; R.setFires = function () { return setFires.call(this, []); }; g.render(0); const noLights = read();
            R.setFires = setFires; g.render(0); const restored = read();
            return { scope: 'Declared 75m-ish inspection camera over the real launch fixture; production Game.render, scene meshes, FX shader and lighting. On/off controls omit only particles or point lights for GPU-difference verification.', camera: { eye, target }, canvas: [R.W, R.H], particleDifference: diff(on, noParticles), lightDifference: diff(on, noLights), restoredDifference: diff(on, restored), png, gl: gl.getError() };
          } finally { R.setCamera = originalCamera; R.drawParticles = drawParticles; R.setFires = setFires; }
        });
        assert.equal(macro.gl, 0); assert.ok(macro.particleDifference.changedPixels > 20, JSON.stringify(macro.particleDifference)); assert.ok(macro.lightDifference.changedPixels > 20, JSON.stringify(macro.lightDifference)); assert.ok(macro.restoredDifference.changedPixels < Math.max(20, macro.particleDifference.changedPixels * .05), JSON.stringify(macro.restoredDifference));
        const macroFile = name + '-production-launch-plume.png'; await fs.writeFile(path.join(out, macroFile), Buffer.from(macro.png.split(',')[1], 'base64')); screenshots.push('threat-feedback/' + macroFile); macro.renderSHA256 = sha(Buffer.from(macro.png.split(',')[1], 'base64')); delete macro.png;
        record('Production launch plume and local illumination change actual WebGL pixels, with reversible particle/light controls', macro);
        await click(page.locator('#pauseBtn')); await page.waitForFunction(() => App.game.paused, null, { polling: 50 });
        const paused = await page.evaluate(() => {
          const g = App.game, before = window.__threatSnapshot(); for (let i = 0; i < 30; i++) g.update(1 / 60); const after = window.__threatSnapshot();
          return { before, after, paused: g.paused };
        });
        assert.equal(paused.paused, true); for (const key of ['t', 'worldTime', 'p', 'missiles', 'particles', 'launchWarn', 'events', 'transientLights']) assert.deepEqual(paused.after[key], paused.before[key], key + ' must freeze'); assert.equal(paused.after.gl, 0);
        record('Native Pause freezes the real projectile, warning clock, trail particles and launch illumination', paused);
        await click(page.getByRole('button', { name: 'Resume', exact: true })); await page.waitForFunction(() => !App.game.paused, null, { polling: 50 });
        const flying = await page.evaluate(() => { const g = App.game; g.world.sites[0].cool = 30; for (let i = 0; i < 30; i++) g.update(1 / 60); document.getElementById('teach').click(); return window.__threatSnapshot(); });
        assert.equal(flying.alive, true); assert.equal(flying.events.launches, 1); assert.ok(flying.missiles.length > 0); assert.ok(flying.missiles[0].t > launched.missiles[0].t); assert.ok(Math.hypot(...flying.missiles[0].p.map((n, i) => n - launched.missiles[0].p[i])) > 40); assert.ok(flying.missiles[0].trail.smoke > 5 && flying.missiles[0].trail.glow > 10); assert.ok(flying.particles.smoke <= FlightLimit('smoke') && flying.particles.glow <= FlightLimit('glow')); assert.equal(flying.transientLights.length, 0); assert.equal(flying.gl, 0);
        record('Resume advances original missile dynamics and bounded time/distance trails while the short launch light expires', flying);
        const cleared = await page.evaluate(() => { const g = App.game; g.world.sites[0].alive = false; for (let i = 0; i < 330; i++) g.update(1 / 60); document.getElementById('teach').click(); const s = window.__threatSnapshot(); s.stores = { bombs: g.ac.bombs, arms: g.ac.arms }; s.initialStores = window.__threatFixture.stores; return s; });
        assert.equal(cleared.alive, true); assert.equal(cleared.launchWarn, 0); assert.ok(!cleared.warnings.some(w => w.t === 'SAM LAUNCH' || w.t === 'SAM RADAR')); assert.equal(cleared.transientLights.length, 0); assert.equal(cleared.tone.value, 0); assert.equal(cleared.events.launches, 1); assert.deepEqual(cleared.stores, cleared.initialStores); assert.equal(cleared.result, null); assert.equal(cleared.gl, 0);
        record('Original warning expiry clears the HUD and tone without consuming stores or awarding a mission result', cleared); await shot('warning-cleared');
        await Promise.all(jobs); assert.deepEqual(errors.filter(e => e.layout === name), []); assert.deepEqual(missing.filter(e => e.layout === name), []);
        record('Actual desktop/touch renderer and original controls finish without JavaScript, HTTP or WebGL errors', { fixture, errors: [], missing: [], gl: 0 });
      } finally { await Promise.allSettled(jobs); await context.close(); }
    }
    const end = await sources(); assert.deepEqual(end, start, 'Runtime sources changed during threat acceptance');
    for (const row of executedHTTP) assert.equal(row.sha256, start[row.file], row.file + ' served bytes differ');
    for (const row of sourceHashes) assert.equal(row.indexSHA256, start['index.html']);
    return { suite: 'threat-feedback', passed: true, fullCoverage: true, sourceStable: true, sourceFiles: start, sourceHashes, executedHTTP, checks, screenshots, errors, missing,
      scope: 'Both Chromium/SwiftShader layouts at normal High/Medium quality. Native Mission01 startup and Pause/Resume; declared 12km-port legal SAM site/aircraft and original night-atmosphere fixtures. Actual World._threats, launchSam, Game.update, HUD pixels, WebAudio commands, shader uniforms and GPU particle/light differences. The site macro camera is explicitly isolated. No complete flown mission, actual iPhone Safari, audible voice assessment or hardware FPS claim.' };
  } catch (error) {
    await fs.writeFile(path.join(evidenceDir, 'threat-feedback.failed.json'), JSON.stringify({ suite: 'threat-feedback', passed: false, error: error.stack, sourceFiles: start, checks, screenshots, sourceHashes, executedHTTP, errors, missing }, null, 2) + '\n'); throw error;
  }
};
function FlightLimit(kind) { return kind === 'smoke' ? 900 : 1500; }
if (require.main === module) (async () => {
  const { chromium } = require('playwright'), { createServer } = require('../tools/dev-server.cjs'), server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try { const out = process.argv[2] || 'test-results/threat-feedback'; await fs.mkdir(out, { recursive: true }); const result = await module.exports(browser, 'http://127.0.0.1:' + server.address().port + '/', out); await fs.writeFile(path.join(out, 'threat-feedback.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ passed: result.passed, checks: result.checks.length, screenshots: result.screenshots.length })); }
  finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
