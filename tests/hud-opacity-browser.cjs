'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');

// Actual Canvas2D pixels over the existing WebGL2 game. Positioning near the
// M2 target and advancing only the original radar are declared readback
// fixtures, not a completed sortie. No target, radar return or outcome is set.
module.exports = async (browser, target, evidenceDir) => {
  const results = [], screenshots = [], out = path.join(evidenceDir, 'hud-opacity');
  await fs.mkdir(out, { recursive: true });
  for (const profile of [{ name: 'desktop', viewport: { width: 1280, height: 720 } }, { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]) {
    const { name, ...options } = profile, ctx = await browser.newContext(options), page = await ctx.newPage(), errors = [], missing = [], touch = !!profile.hasTouch;
    page.setDefaultTimeout(90000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && /\/assets\//.test(r.url())) missing.push(r.url()); });
    await ctx.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ seat: 1, quality: 0, sound: 0, voices: 0, mouse: 0, assist: 1, sens: 1 })); localStorage.setItem('a6_sawkeys', '1');
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => window.__hudClock ? 0 : raf(t => { if (!window.__hudClock) cb(t); });
    });
    const record = (title, actual, fixture) => { results.push({ profile: name, name: title, passed: true, actual, fixture }); console.log('PASS hud-opacity ' + name + ' ' + title); };
    const nativeScope = async () => { const before = await page.evaluate(() => App.hud.scope); if (touch) await page.locator('#btnScope').tap(); else await page.keyboard.press('Tab'); await page.waitForFunction(before => App.hud.scope !== before, before, { polling: 50, timeout: 5000 }); await render(); };
    const render = () => page.evaluate(() => { const g = App.game; for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on'); g.render(1 / 60); g.syncControls(); });
    const pixels = () => page.evaluate(() => {
      const h = App.hud, g = h.g, sample = (x, y) => [...g.getImageData(Math.round(x * h.W * h.dpr), Math.round(y * h.H * h.dpr), 1, 1).data];
      return { scope: h.scope, rightSeat: App.game.rightSeat, extView: App.game.extView, dpr: h.dpr, sourceCPU: h.radar.ctx.getContextAttributes().willReadFrequently, lost: g.isContextLost(), outside: [[.02, .90], [.45, .03], [.45, .9], [.98, .1]].map(p => ({ point: p, rgba: sample(...p) })), gpuError: App.rend.gl.getError() };
    });
    const shot = async label => { const file = name + '-' + label + '.png'; await page.screenshot({ path: path.join(out, file) }); screenshots.push('hud-opacity/' + file); };
    async function start(id, seat) {
      await page.evaluate(({ id, seat }) => { window.__hudClock = false; App.set.seat = seat; App.start(MISSIONS.find(m => m.id === id)); }, { id, seat });
      await page.waitForFunction(id => App.game?.mis?.id === id && document.getElementById('loader').style.display === 'none', id, { polling: 50 });
      await page.evaluate(() => { window.__hudClock = true; App.game.paused = false; App.screen = 'game'; }); await render();
    }
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.App); await page.evaluate(() => { window.__hudInputLog = []; for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) document.addEventListener(type, event => { if (event.target.closest('#btnScope')) window.__hudInputLog.push({ type, trusted: event.isTrusted, pointerType: event.pointerType, scopeBefore: App.hud.scope, at: performance.now() }); }, true); });
      if (touch) await page.locator('#bootGo').tap(); else await page.locator('#bootGo').click();
      await start('m2', 1);
      const fixture = await page.evaluate(() => {
        const g = App.game, p = g.world.briefed.slice(); g.ac.onDeck = false; g.ac.p = [p[0], p[1] + 700, p[2] + 3500]; g.ac.v = [0, 0, -140]; g.ac.yaw = g.ac.roll = 0; g.ac.pitch = .02; g.ac.gear = g.ac.hook = false; g.phase = 'airborne';
        for (let i = 0; i < 300; i++) g.hud.radar.step(1 / 60, g.ac, g.world, 0);
        return { position: g.ac.p.slice(), targetReadback: p, radarSeconds: 5 };
      });
      await render();
      // Standalone synthetic Canvas2D fixtures isolate the driver defect:
      // a transparent bitmap, nested CRT/fan clips and an inherited shadow.
      // They never replace the production Radar or touch its return values.
      const clipDiagnostic = await page.evaluate(() => {
        const results = [];
        for (const cpuSource of [false, true]) for (const shadow of [0, 6]) {
          const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d');
          g.fillStyle = '#12171c'; g.fillRect(0, 0, 1280, 720); g.shadowBlur = shadow; g.shadowColor = 'rgba(0,0,0,.95)';
          const src = document.createElement('canvas'); src.width = 96; src.height = 112; const sg = src.getContext('2d', { willReadFrequently: cpuSource }); sg.putImageData(sg.createImageData(96, 112), 0, 0);
          g.save(); g.beginPath(); g.arc(975, 360, 235, 0, Math.PI * 2); g.clip();
          g.save(); g.beginPath(); g.moveTo(975, 580.9); g.arc(975, 580.9, 451.2, -Math.PI / 2 - 35 * Math.PI / 180, -Math.PI / 2 + 35 * Math.PI / 180); g.closePath(); g.clip();
          g.save(); g.translate(975, 580.9); g.drawImage(src, 0, 108.26666666666667, 96, 4.333333333333333, -10.531121374674033, -15.54, 21.062242749348066, 16.04); g.restore(); g.restore(); g.restore();
          results.push({ cpuSource, inheritedShadowBlur: shadow, outsidePixel: [...g.getImageData(10, 700, 1, 1).data], contextLost: g.isContextLost() });
        }
        return { fixture: 'Synthetic nested circle/fan clips and transparent bitmap; separate canvas, not game content.', results };
      });
      // Browsers need not share the affected driver's negative result. The
      // native production pixels below must always preserve their backing.
      await fs.writeFile(path.join(out, name + '-nested-clip-shadow-diagnostic.json'), JSON.stringify(clipDiagnostic, null, 2) + '\n');
      const actual = await pixels(); assert.equal(actual.scope, true); assert.equal(actual.rightSeat, true); assert.equal(actual.extView, false); assert.equal(actual.lost, false); assert.ok(actual.outside.every(p => p.rgba[3] === 255), JSON.stringify(actual)); assert.equal(actual.gpuError, 0);
      record('Full B/N station retains opaque panel pixels around the radar after real sweeps', { fixture, actual, clipDiagnostic }, 'The negative driver diagnostic uses separate synthetic canvases. Production uses original Radar and draw paths; diagnostic results do not determine pass.');
      const returns = await page.evaluate(() => {
        const h = App.hud, r = h.radar, data = r.ctx.getImageData(0, 0, r.NA, r.NR).data;
        let opaque = 0, green = 0, amber = 0, hard = 0;
        for (let i = 0; i < data.length; i += 4) { if (data[i + 3]) { opaque++; if (data[i + 1] > data[i]) green++; else if (data[i] > 30) amber++; } }
        for (const v of r.hard) if (v > .28) hard++;
        const rpx = Math.min(h.W * .26, h.H * .4, 235), cx = h.W - rpx - Math.min(Math.max(h.W * .06, 14), 70), cy = h.H * .5;
        return { opaque, green, amber, hard, crtCenter: [...h.g.getImageData(Math.round(cx * h.dpr), Math.round(cy * h.dpr), 1, 1).data] };
      });
      assert.ok(returns.opaque > 100); assert.ok(returns.green > 100); assert.ok(returns.hard > 0); assert.equal(returns.crtCenter[3], 255); await shot('bn-station-real-returns');
      record('Original radar image retains terrain and hard returns inside an opaque CRT', returns, 'ImageData comes from original Radar.column/step/bake at the declared M2 position; no return values are assigned.');
      const before = await page.evaluate(() => App.hud.cross.slice()), bounds = await page.locator('#stack').boundingBox(), from = { x: bounds.width * .76, y: bounds.height * .45 }, to = { x: from.x - 35, y: from.y + 12 };
      if (touch) { const cdp = await ctx.newCDPSession(page); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up(); }
      await render(); const after = await page.evaluate(() => App.hud.cross.slice()), slewed = await pixels(); assert.notDeepEqual(after, before); assert.ok(slewed.outside.every(p => p.rgba[3] === 255));
      record('Native scope drag moves crosshairs while the panel remains solid', { before, after, actual: slewed }, 'Native mouse or CDP touch events use the existing scope pointer handler.');
      const cycles = []; let cancelled = null;
      if (touch) {
        const cdp = await ctx.newCDPSession(page), b = await page.locator('#btnScope').boundingBox(), beforeCancel = await pixels();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await page.waitForTimeout(60); const afterCancel = await pixels(); assert.equal(afterCancel.scope, beforeCancel.scope); cancelled = { before: beforeCancel.scope, after: afterCancel.scope };
      }
      for (let i = 0; i < 4; i++) { await nativeScope(); const closed = await pixels(); assert.equal(closed.scope, false); assert.ok(closed.outside.some(p => p.rgba[3] < 255)); await nativeScope(); const opened = await pixels(); assert.equal(opened.scope, true); assert.ok(opened.outside.every(p => p.rgba[3] === 255)); cycles.push({ closed, opened }); }
      await shot('bn-station-reopened');
      record('Repeated native SCOPE toggles preserve the transparent forward view and opaque B/N view', { cancelled, cycles }, 'Eight native TAB/SCOPE actions follow the physical radar drag; touch cancellation must not toggle. No reset or canvas replacement is used for the production view.');
      await start('m1', 0); assert.equal((await pixels()).scope, false); await nativeScope(); const pilot = await pixels(); assert.equal(pilot.scope, true); assert.equal(pilot.rightSeat, false); assert.ok(pilot.outside.every(p => p.rgba[3] >= 220), JSON.stringify(pilot)); await shot('m1-pilot-scope');
      record('Original daytime Mission 1 pilot scope keeps its intended dark translucent backing', pilot, 'Pilot seat is selected through the existing App setting before original M1 construction; native TAB/SCOPE opens the original fan display.');
      assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.equal(await page.evaluate(() => App.rend.gl.getError()), 0);
      record('B/N and pilot Canvas2D overlays coexist with original WebGL2 without missing assets or errors', { errors, missing }, 'Linux Chromium and simulated iPhone landscape only; physical Windows and iPhone Safari remain untested.');
    } catch (error) { await fs.writeFile(path.join(out, name + '-input-on-failure.json'), JSON.stringify(await page.evaluate(() => window.__hudInputLog || []).catch(() => []), null, 2) + '\n'); await shot('FAIL').catch(() => {}); throw error; } finally { await ctx.close(); }
  }
  return { suite: 'hud-opacity', total: results.length, results, screenshots, passed: true, actualIPhoneSafariTested: false, physicalWindowsTested: false, fullMissionCompletionTested: false };
};
