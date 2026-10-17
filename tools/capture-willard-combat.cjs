#!/usr/bin/env node
'use strict';
// Additional screenshot evidence from the real, normally launched mission.
// Reuses the acceptance suite's stick/throttle pilot verbatim. It does not
// move actors, alter phases, synthesize explosions or modify the runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { createServer } = require('./dev-server.cjs');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'test-results/willard-combat-evidence');
const sha = value => createHash('sha256').update(value).digest('hex');

async function main() {
  await fs.mkdir(evidence, { recursive: true });
  const acceptance = await fs.readFile(path.join(root, 'tests/willard-browser.cjs'), 'utf8');
  const start = acceptance.indexOf('window.__willardPilot =');
  const end = acceptance.indexOf('\n      });\n      const observedPhases', start);
  assert.ok(start > 0 && end > start, 'Production acceptance pilot must remain available for verbatim reuse.');
  const pilot = acceptance.slice(start, end);
  const server = createServer(); let browser;
  const errors = [], missing = [], screens = [], samples = [], runtimeSHA256 = {}, digests = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const target = 'http://127.0.0.1:' + server.address().port + '/';
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); page.setDefaultTimeout(90000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', response => {
      const file = new URL(response.url()).pathname;
      if (response.status() >= 400 && file.startsWith('/assets/')) missing.push({ file, status: response.status() });
      if (response.ok() && (file === '/' || /\/assets\/willard\/.*\.(js|css|json|png)$/.test(file))) digests.push(response.body().then(bytes => { runtimeSHA256[file] = sha(bytes); }));
    });
    await context.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, assist: 1, sound: 0, voices: 0, invert: 0, sens: 1, mouse: 0, seat: 0 }));
      localStorage.setItem('a6_sawkeys', '1');
      let randomSeed = 0x196665; Math.random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => window.__willardFixedClock ? 0 : raf(t => { if (!window.__willardFixedClock) cb(t); });
    });
    const response = await page.goto(target, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.App && window.WillardMission);
    await page.locator('#bootGo').click();
    await page.locator('#readyBody .mcard').filter({ hasText: /WILLARD EGRESS/i }).click();
    await page.evaluate(() => { window.__willardFixedClock = true; window.__willardDateNow = Date.now; Date.now = () => 1966; });
    await page.locator('#briefBody').getByRole('button', { name: /PLAY MISSION/i }).click();
    await page.waitForFunction(() => App.game?.mis?.willard && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
    await page.evaluate(() => {
      Date.now = window.__willardDateNow; delete window.__willardDateNow;
      App.game.paused = false;
      for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on');
      for (const key of Object.keys(App.keys)) App.keys[key] = 0;
      for (const key of ['pitch', 'roll', 'thrUp', 'thrDn', 'commit']) App.gctl[key] = 0;
      App.game.render(1 / 60);
    });
    // Match the acceptance run's one-second real-keyboard steering exercise.
    await page.keyboard.down('d');
    await page.evaluate(() => { for (let i = 0; i < 60; i++) App.game.update(1 / 60); App.game.render(1 / 60); });
    await page.keyboard.up('d');
    await page.evaluate(pilot);
    await page.evaluate(() => { window.__willardPilot.captureFire = false; });
    const state = () => page.evaluate(() => {
      const g = App.game, s = g.willard, R = App.rend, m = R.matVP;
      const project = p => {
        const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
        const ndc = [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w];
        return { ndc, w, visible: w > 0 && ndc.every(n => Math.abs(n) <= 1) };
      };
      return { time: g.t, alive: g.ac.alive, result: g.result, phase: s.phase, aircraft: { p: g.ac.p.slice(), v: g.ac.v.slice(), yaw: g.ac.yaw, pitch: g.ac.pitch, roll: g.ac.roll, crew: { ...g.ac.crew }, damage: { ...g.ac.dmg } },
        gunBeltMetres: Math.hypot(g.ac.p[0] - s.route.flak[0], g.ac.p[2] - s.route.flak[2]),
        flak: WillardFlak.inspect(s.flak),
        visibleFreshBursts: s.flak.bursts.filter(b => b.age < .27).map(b => ({ ...b, screen: project(b.p) })).filter(b => b.screen.visible),
        visibleShells: s.flak.shells.map(b => ({ ...b, screen: project(b.p) })).filter(b => b.screen.visible),
        visibleLights: s.flak.lights.map(l => ({ ...l, screen: project(l.end) })).filter(l => l.screen.visible),
        particles: { additive: g.world.fx.add.length, smoke: g.world.fx.smk.length, visible: g.world.fx.add.filter(p => project(p.p).visible).length },
        rear: s.rear, external: g.extView, enemy: s.enemy ? { range: Math.hypot(...s.enemy.p.map((v, i) => v - g.ac.p[i])), p: s.enemy.p.slice(), state: s.enemy.state, projectiles: s.enemy.projectiles.length, roundsFired: s.enemy.roundsFired } : null,
        artwork: WillardSprites.inspect(R), glError: R.gl.getError() };
    });
    let current = await state(), nearFrames = 0, lastShotAt = -100, bestRange = Infinity;
    const nativeViewChanges = [];
    for (let batch = 0; batch < 2500 && current.alive && !current.result; batch++) {
      const frames = current.gunBeltMetres < 7000 ? 6 : 600;
      await page.evaluate(frames => __willardPilotStep(frames), frames);
      current = await state(); if (frames === 6) nearFrames += frames;
      // The defensive gun belt is commonly behind the aircraft after the break.
      // Use the normal rear-view control rather than moving a camera or actor.
      if (current.gunBeltMetres < 6500 && !current.rear) {
        await page.locator('#willardRear').click(); await page.evaluate(() => App.game.render(1 / 60));
        current = await state(); nativeViewChanges.push({ time: current.time, control: 'LOOK AFT', rear: current.rear });
      }
      if (batch % 30 === 0) console.log(JSON.stringify({ batch, time: current.time, phase: current.phase, distance: current.gunBeltMetres, bursts: current.flak.bursts.length, shells: current.flak.shells.length, inView: current.visibleFreshBursts.length }));
      if (current.gunBeltMetres < 7000 && Math.floor(current.time * 2) !== samples.at(-1)?.halfSecond) samples.push({ halfSecond: Math.floor(current.time * 2), ...current });
      const liveFire = current.gunBeltMetres < 6500 && current.visibleFreshBursts.length > 0 && current.time - lastShotAt > 2;
      if (liveFire && screens.filter(s => s.filename.includes('nam-dinh')).length < 2) {
        const filename = 'desktop-live-nam-dinh-flak-' + (screens.filter(s => s.filename.includes('nam-dinh')).length + 1) + '.png';
        assert.equal(current.glError, 0);
        await page.screenshot({ path: path.join(evidence, filename), timeout: 90000 });
        screens.push({ filename, state: current }); lastShotAt = current.time;
        console.log('CAPTURE ' + filename + ' at ' + current.gunBeltMetres.toFixed(0) + ' m, ' + current.visibleFreshBursts.length + ' fresh bursts / ' + current.visibleShells.length + ' live shells / ' + current.visibleLights.length + ' searchlight endpoints in native ' + (current.rear ? 'rear' : 'forward') + ' view');
      }
      // Optional closer view is obtained only with the existing LOOK AFT UI.
      if (!current.rear && current.enemy && current.enemy.range < 650 && current.enemy.range < bestRange - 100 && !screens.some(s => s.filename.includes('close-mig'))) {
        await page.locator('#willardRear').click(); await page.evaluate(() => App.game.render(1 / 60));
        const rear = await state();
        if (rear.artwork.last?.visible && rear.artwork.last.widthPixels > 10) {
          const filename = 'desktop-naturally-closing-mig.png';
          await page.screenshot({ path: path.join(evidence, filename), timeout: 90000 }); screens.push({ filename, state: rear });
        }
        await page.locator('#willardRear').click(); await page.evaluate(() => App.game.render(1 / 60));
        bestRange = current.enemy.range;
      }
      if (screens.filter(s => s.filename.includes('nam-dinh')).length >= 2 || current.phase === 'egress' && nearFrames > 600) break;
      if (current.time > 850) break;
    }
    assert.equal(screens.filter(s => s.filename.includes('nam-dinh')).length, 2, 'Actual input-driven native gameplay view must show two fresh hostile flak bursts.');
    assert.deepEqual(errors, []); assert.deepEqual(missing, []); await Promise.all(digests);
    const report = { suite: 'willard-additional-combat-evidence', passed: true, recordedAt: new Date().toISOString(), runtimeSHA256, acceptancePilotSHA256: sha(pilot), screenshots: screens, nativeViewChanges, samples,
      fixture: 'Native normal mission selector and PLAY MISSION; supported standard difficulty. Repeatable uniform Math.random seed 0x196665 and mission-construction seed 1966, restored before flight. Existing tests/willard-browser.cjs controller reused verbatim: only normalized virtual-stick/throttle inputs and every original 1/60-second Game.update. Automatic RAF suspended; no aircraft/enemy/camera teleport, damage/phase/success setter, fabricated particle or effect is used. LOOK AFT uses the native mission control. Capture stops during the actual gun-belt encounter and does not claim a completed sortie.',
      physicalWindowsTested: false, actualIPhoneSafariTested: false, performanceMeasured: false, browserErrors: errors, missingAssets: missing };
    await fs.writeFile(path.join(evidence, 'combat-evidence.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, screenshots: screens.map(s => s.filename), source: runtimeSHA256['/'], evidence }));
    await context.close();
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
