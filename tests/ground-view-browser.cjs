'use strict';

// Actual WebGL2, native pointer lock, keyboard events and Chromium CDP touch.
// The game loop is suspended after normal chapter launch, then original movement
// is stepped explicitly. The legacy fixture uses original ejection/descent over
// declared dry ground and isolates nearby encounters; collision is not replaced.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

module.exports = async function groundViewBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'ground-view');
  await fs.mkdir(out, { recursive: true });
  const checks = [], screenshots = [], sourceHashes = [], browserErrors = [], badAssets = [];
  for (const layout of [
    { name: 'desktop', viewport: { width: 1280, height: 720 }, hasTouch: false },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }
  ]) {
    const context = await browser.newContext(layout), page = await context.newPage();
    page.on('pageerror', e => browserErrors.push({ layout: layout.name, error: e.message }));
    page.on('response', r => { if (r.status() >= 400 && /\/assets\//.test(r.url())) badAssets.push({ layout: layout.name, url: r.url(), status: r.status() }); });
    const record = (name, actual) => { checks.push({ layout: layout.name, name, passed: true, actual }); console.log('PASS ground-view ' + layout.name + ' ' + name); };
    const tick = seconds => page.evaluate(seconds => {
      const g = App.game; let left = seconds;
      while (left > 1e-10) { const dt = Math.min(1 / 60, left); g.t += dt; g.stepEvade(dt); left -= dt; }
      g.render(0); g.syncControls();
      return { p: g.evade.p.slice(), hdg: g.evade.hdg, pitch: g.evade.pitchCmd, height: GroundView.view(g).height, eye: g.rend.eye.slice() };
    }, seconds);
    const state = () => page.evaluate(() => ({ p: App.game.evade.p.slice(), hdg: App.game.evade.hdg, pitch: App.game.evade.pitchCmd || 0, look: App.game.evade.look || 0, mx: App.gctl.mx || 0, my: App.gctl.my || 0 }));
    async function shot(name) {
      assert.equal(await page.evaluate(() => { App.game.render(0); return App.game.rend.gl.getError(); }), 0);
      const file = layout.name + '-' + name + '.png'; await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('ground-view/' + file);
    }
    async function pitchKeys(chapter) {
      const a = await state(); await page.keyboard.down('q'); const q = await tick(.12); await page.keyboard.up('q');
      await page.keyboard.down('e'); const e = await tick(.24); await page.keyboard.up('e');
      assert.ok(q.pitch > a.pitch + .08, chapter + ' Q must look up');
      assert.ok(e.pitch < a.pitch - .07, chapter + ' E must look down');
      record(chapter + ' native Q/E has consistent up/down direction', { before: a.pitch, q: q.pitch, e: e.pitch });
    }
    async function mouseLook(chapter) {
      await page.mouse.move(600, 250);
      await page.keyboard.press('y');
      await page.waitForFunction(() => document.pointerLockElement === document.getElementById('stack'), null, { timeout: 5000 });
      const before = await state();
      await page.mouse.move(640, 230); const after = await state();
      assert.ok(after.hdg > before.hdg + .04, chapter + ' native locked horizontal motion must turn the head');
      assert.ok(after.look > before.look + .02, chapter + ' native locked upward motion must look up');
      assert.equal(after.mx, 0); assert.equal(after.my, 0);
      const held = await tick(.3); assert.ok(Math.abs(held.pitch - after.pitch) < 1e-9, chapter + ' locked pitch must hold when mouse stops');
      await page.evaluate(() => App.pause(true)); const paused = await state();
      await page.mouse.move(680, 210); assert.deepEqual(await state(), paused, chapter + ' paused mouse must leave player and flight input untouched');
      await page.evaluate(() => { App.pause(false); document.exitPointerLock(); });
      await page.waitForFunction(() => !document.pointerLockElement);
      record(chapter + ' actual browser pointer lock turns view, holds pitch and freezes on pause without aircraft input', { before, after, heldPitch: held.pitch, paused });
    }
    async function crouch(chapter) {
      await page.evaluate(() => { const g = App.game; App.gctl.crouch = 0; App.keys.KeyC = 0; g.evade.crouch = false; GroundView.reset(g); g.render(0); });
      const before = await state();
      await page.keyboard.down('c'); const first = await tick(1 / 60);
      assert.ok(first.height > 1.16 && first.height < 1.68, 'First crouch step must be continuous');
      assert.ok(Math.abs(first.height - 1.68) < .12, 'First crouch camera change must be below 12 cm');
      assert.deepEqual(first.p, before.p, 'Camera easing must not move the feet/collider');
      const pausedHeight = await page.evaluate(() => { App.pause(true); return GroundView.view(App.game).height; });
      const still = await tick(.5); assert.equal(still.height, pausedHeight, 'Paused stance must not advance');
      await page.evaluate(() => App.pause(false));
      const settled = await tick(1); assert.ok(Math.abs(settled.height - 1.16) < .00002);
      await shot(chapter + '-crouch');
      await page.keyboard.up('c'); const rise = await tick(1 / 60);
      assert.ok(rise.height > 1.16 && rise.height < 1.3, 'Standing must ease from the crouch');
      const standing = await tick(1); assert.ok(Math.abs(standing.height - 1.68) < .00002);
      assert.deepEqual(standing.p, before.p);
      record(chapter + ' real crouch/stand camera eases, pauses and preserves physical actor position', { firstHeight: first.height, pausedHeight, crouched: settled.height, firstRise: rise.height, standing: standing.height, p: before.p });
    }
    try {
      await context.addInitScript(() => { localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 })); localStorage.setItem('a6_sawkeys', '1'); });
      const responses = ['assets/survival/ground-view.js', 'assets/pow/core.js'].map(n => page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/' + n)));
      const entry = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      sourceHashes.push({ layout: layout.name, entrySHA256: createHash('sha256').update(await entry.body()).digest('hex'), modules: await Promise.all(responses.map(async r => { const q = await r; return { url: new URL(q.url()).pathname, sha256: createHash('sha256').update(await q.body()).digest('hex') }; })) });
      await page.waitForFunction(() => window.App && window.GroundView && window.POW?.Guidance);
      await page.locator('#bootGo').click();
      await page.locator('#powChapter [data-pow-chapter="escape"]').click();
      await page.waitForFunction(() => App.game?.pow?.stage === 'cell' && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
      // Stop automatic scheduling only; original game, render and input methods stay intact.
      await page.evaluate(() => { App.frame = function () {}; App.screen = 'game'; App.game.paused = false; for (const k of Object.keys(App.keys)) App.keys[k] = 0; App.gctl.mx = App.gctl.my = 0; });
      if (await page.locator('#powHUD [data-guide-skip]').isVisible()) await page.locator('#powHUD [data-guide-skip]').click();
      assert.match(await page.evaluate(() => App.game.rend.gl.getParameter(App.game.rend.gl.VERSION)), /WebGL 2/);
      await pitchKeys('POW');
      if (!layout.hasTouch) await mouseLook('POW');
      await crouch('POW');
      // Original locked-cell geometry remains authoritative during held movement.
      await page.evaluate(() => { App.game.evade.hdg = 0; });
      await page.keyboard.down('w'); const collision = await tick(5); await page.keyboard.up('w');
      const door = await page.evaluate(() => ({ z: App.game.evade.p[2] - App.game.pow.base[2], stage: App.game.pow.stage, closed: !App.game.pow.flags.doorOpen, insideSolid: POW.blocked(App.game, App.game.evade.p[0], App.game.evade.p[2], .30, App.game.evade.p[1]) }));
      assert.ok(door.closed && door.z > -3.2 && door.stage === 'cell' && !door.insideSolid);
      record('Original prison collider blocks held movement while stance view stays independent', { door, position: collision.p });
      await shot('prison-standing');
      if (layout.hasTouch) {
        const cdp = await context.newCDPSession(page);
        const touch = (type, points = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p, radiusX: 6, radiusY: 6, force: 1 })) });
        const a = await state();
        await touch('touchStart', [{ x: 510, y: 190, id: 1 }]); await touch('touchMove', [{ x: 540, y: 180, id: 1 }]);
        const moved = await state(); assert.ok(moved.hdg > a.hdg + .1 && moved.look > a.look + .03);
        await page.evaluate(() => App.pause(true)); const p = await state();
        await touch('touchMove', [{ x: 575, y: 170, id: 1 }]); assert.deepEqual(await state(), p);
        await page.evaluate(() => App.pause(false));
        await touch('touchMove', [{ x: 600, y: 160, id: 1 }]); assert.deepEqual(await state(), p, 'Canceled held gesture must not resume across pause');
        await touch('touchEnd');
        await touch('touchStart', [{ x: 510, y: 190, id: 2 }]); const fresh = await state(); assert.deepEqual(fresh, p, 'Fresh touch down cannot jump the camera');
        await touch('touchMove', [{ x: 520, y: 185, id: 2 }]); const clean = await state();
        assert.ok(Math.abs(clean.hdg - fresh.hdg - .06) < 1e-6); assert.ok(Math.abs(clean.look - fresh.look - .03) < 1e-6);
        await touch('touchCancel');
        record('Native held touch cancels at pause, remains canceled on resume and restarts without a view jump', { before: a, moved, paused: p, fresh, clean });
        await page.locator('#powHUD .pow-tools').getByRole('button', { name: 'Save', exact: true }).tap();
        await touch('touchStart', [{ x: 510, y: 190, id: 3 }]); await touch('touchMove', [{ x: 520, y: 185, id: 3 }]);
        // A second genuine finger taps Continue while the first look gesture remains held.
        const q = await page.locator('#powHUD .pow-tools').getByRole('button', { name: 'Continue', exact: true }).evaluate(n => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: 4 }; });
        await touch('touchStart', [{ x: 520, y: 185, id: 3 }, q]);
        await touch('touchEnd', [{ x: 520, y: 185, id: 3 }]);
        const restored = await state(); await touch('touchMove', [{ x: 555, y: 165, id: 3 }]);
        assert.deepEqual(await state(), restored, 'Gesture owned by pre-checkpoint actor must not alter restored actor');
        await touch('touchEnd');
        record('Native checkpoint Continue cannot inherit a previous actor touch gesture', { restored });
        await page.evaluate(() => document.getElementById('stack').addEventListener('pointerdown', event => { window.__groundCapturePointer = event.pointerId; }, { once: true }));
        await touch('touchStart', [{ x: 510, y: 190, id: 5 }]);
        await touch('touchMove', [{ x: 520, y: 185, id: 5 }]);
        const interrupted = await state();
        await page.evaluate(() => document.getElementById('stack').releasePointerCapture(window.__groundCapturePointer));
        await touch('touchMove', [{ x: 555, y: 165, id: 5 }]);
        assert.deepEqual(await state(), interrupted, 'Lost native pointer capture must cancel a held look gesture');
        await touch('touchEnd');
        record('Native pointer-capture loss cancels the existing touch look', interrupted);
      }
      // Legacy survival: same original aircraft/ejection/parachute production path.
      await page.evaluate(() => App.start(MISSIONS.find(m => m.id === 'm1')));
      await page.waitForFunction(() => App.game && !App.game.pow && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
      const ground = await page.evaluate(() => {
        const g = App.game, t = g.world.briefed || g.world.tgtCenter; let p;
        for (let r = 900; r < 6000 && !p; r += 160) for (let a = 0; a < TAU && !p; a += PI / 8) {
          const x = t[0] + Math.sin(a) * r, z = t[2] - Math.cos(a) * r, h = terrainH(x, z);
          if (h > 8 && !g._localSolidAt(x, z, .5) && Math.abs(terrainH(x + 10, z - 10) - h) < 2) p = [x, h, z];
        }
        if (!p) throw Error('No dry ground fixture');
        g.ac.p = [p[0], p[1] + 110, p[2]]; g.ac.v = [0, 0, 0]; g.ac.onDeck = false; g.phase = 'airborne'; g.render(0); g.syncControls(); return p;
      });
      await page.locator('#btnEject').dispatchEvent('click'); await page.locator('#btnEject').dispatchEvent('click');
      const descent = await page.evaluate(() => { const g = App.game; let n = 0; while (g.phase === 'chute' && n++ < 4800) g.update(1 / 60); g.render(0); g.syncControls(); return { steps: n, phase: g.phase, ejected: g.ejected }; });
      assert.equal(descent.phase, 'evade'); assert.ok(descent.ejected);
      if (await page.locator('#captVeil.on').count()) {
        const run = page.locator('#captBody').getByRole('button', { name: 'Run', exact: true });
        if (await run.count()) await run.click(); else await page.locator('#captBody').getByRole('button', { name: 'Run for the treeline', exact: true }).click();
        await page.locator('#captBody').getByRole('button', { name: 'Go on', exact: true }).click();
      }
      await page.evaluate(() => { const g = App.game, e = g.evade; e.searchers = []; e.locals = []; e.cattle = []; e.spawn = e.localRefill = e.cowT = 1e9; delete e.doom; delete e.doomMax; g.wreck = null; g.paused = false; App.screen = 'game'; for (const k of Object.keys(App.keys)) App.keys[k] = 0; App.gctl.pitch = App.gctl.roll = App.gctl.mx = App.gctl.my = 0; for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on'); });
      record('Legacy fixture reaches survival through original ejection and parachute descent', { dryTerrain: ground, descent, isolation: 'Nearby searchers, locals, cattle and wreck cleared after descent for repeatable camera checks; their production behavior is covered in progression/episode suites.' });
      await pitchKeys('legacy survival');
      if (!layout.hasTouch) await mouseLook('legacy survival');
      await crouch('legacy-survival');
      await shot('survival-standing');
      assert.deepEqual(browserErrors.filter(e => e.layout === layout.name), []);
      assert.deepEqual(badAssets.filter(e => e.layout === layout.name), []);
      record('Actual gameplay source, assets and WebGL render without errors', { glError: await page.evaluate(() => App.game.rend.gl.getError()), sourceHashes: sourceHashes.at(-1) });
    } catch (error) {
      const current = await page.evaluate(() => ({ screen: App?.screen, paused: App?.game?.paused, phase: App?.game?.phase, stage: App?.game?.pow?.stage, player: App?.game?.evade, look: window.GroundView?.view(App?.game), active: document.activeElement?.outerHTML.slice(0, 500) })).catch(() => null);
      await fs.writeFile(path.join(out, layout.name + '-failure.json'), JSON.stringify({ error: String(error), current, browserErrors, badAssets, checks }, null, 2));
      throw error;
    } finally {
      await fs.writeFile(path.join(out, 'partial-results.json'), JSON.stringify({ checks, screenshots, sourceHashes, browserErrors, badAssets }, null, 2));
      await context.close();
    }
  }
  const report = { suite: 'ground-view', passed: true, checks, screenshots, sourceHashes, browserErrors, badAssets,
    scope: 'Actual Chromium WebGL2: native desktop pointer lock and keyboard; native CDP touch on simulated iPhone layout. Original motion, collision, rendering and ejection/descent. Deterministic explicit stepping suspends App.frame scheduling; declared legacy dry-ground placement and encounter isolation only. No physical iPhone Safari or Windows hardware claim.' };
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n'); return report;
};
