const fs = require('node:fs');
const assert=require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

// Fixture-assisted checks of the Milestone 1 Game methods and custom WebGL renderer.
// This does not claim a human completed the historical missions or an iPhone test.
let out;
let targetUrl;


async function main(browser,target,evidenceDir) {
  targetUrl=target;out=path.join(evidenceDir,'ground');
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  fs.mkdirSync(out,{recursive:true});
  const errors = [];
  const results = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
    localStorage.setItem('a6_sawkeys', '1');
  });
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.App);
    await page.evaluate(() => App.start(MISSIONS.find(m => m.escape)));
    await page.waitForFunction(() => App.game?.st && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
    await page.evaluate(() => {
      App.screen = 'fixture'; // Stop automatic simulation/rendering; invoke real methods explicitly below.
      App.game.paused = true;
      App.game.t = 20;
      document.getElementById('legend').classList.remove('on');
    });
    const info = await page.evaluate(() => ({ title: document.title, mission: App.game.mis.title,
      webgl: App.rend.gl.getParameter(App.rend.gl.VERSION), renderer: App.rend.gl.getParameter(App.rend.gl.RENDERER) }));

    const facing = await page.evaluate(() => {
      const G = App.game;
      G.startCamp(1);
      // A countryside searcher constructor omits face. This fixture reproduces that real constructor shape.
      let p;
      for (let radius = 120; radius < 900 && !p; radius += 100) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
          const x = G.evade.p[0] + Math.cos(angle) * radius, z = G.evade.p[2] + Math.sin(angle) * radius;
          if (terrainH(x, z) > 10 && !G._localSolidAt(x, z, 0.43)) { p = [x, 0, z]; break; }
        }
      }
      if (!p) throw new Error('Could not find dry fixture ground near the camp');
      const s = { p: [p[0], 0, p[2] - 2], goal: [...p], kind: 'nva', armed: true, alive: true, seen: 0, sus: 0, spd: 0, ph: 0 };
      G.evade = { p, hdg: 0, t: 0, rounds: 6, radio: 0, rescue: 0, eta: 120, exposure: 0, searchers: [s], locals: [], cattle: [], noise: 0, kills: 0, pickup: [p[0] + 300, p[2]], chute: [p[0], p[2]], drawn: 0, lastShot: -99 };
      document.getElementById('teach').classList.remove('on');
      document.getElementById('teachPeek').classList.remove('on');
      document.getElementById('radio').innerHTML = '';
      G.render(1 / 60);
      const before = G._sprites.filter(x => Math.hypot(x.p[0] - s.p[0], x.p[2] - s.p[2]) < 0.5).map(x => x.photoName);
      G._noticeTick = 0;
      G._noticeAtCloseRange(G.evade, 1 / 60);
      G.render(1 / 60);
      const after = G._sprites.filter(x => Math.hypot(x.p[0] - s.p[0], x.p[2] - s.p[2]) < 0.5).map(x => x.photoName);
      return { fixture: 'real countryside searcher shape, placed two metres ahead on dry terrain', expected: 'finite facing and same visible NPC after noticing player',
        actual: { seen: s.seen, face: String(s.face), faceFinite: Number.isFinite(s.face), beforePhotoSprites: before, afterPhotoSprites: after },
        passed: Number.isFinite(s.face) && before.includes('nva') && after.includes('nva') };
    });
    results.push({ name: 'close-range-facing', ...facing });
    await page.screenshot({ path: path.join(out, 'ground-close-awareness.png') });

    results.push({ name: 'knife-after-last-round', ...await page.evaluate(() => {
      const G = App.game;
      function attack(rounds) {
        const p = [...G.evade.p];
        const s = { p: [p[0], 0, p[2] - 2], goal: [...p], kind: 'nva', armed: true, alive: true, face: 0 };
        const e = { p, hdg: 0, t: 0, rounds, drawn: 0, weaponMode: 'knife', lastShot: -99, kills: 0, noise: 0, searchers: [s], locals: [], cattle: [],
          pickup: [p[0] + 300, p[2]], chute: [p[0], p[2]], radio: 0, rescue: 0, eta: 120, exposure: 0 };
        G.t += 2;
        G._weapons(1 / 60, e, App, { Space: true });
        G.evade = e;
        G.syncControls();
        G.render(1 / 60);
        return { rounds, mode: e.weaponMode, wounds: s.wounds || 0, alive: s.alive, knifeButton: document.getElementById('btnKnife').textContent,
          knifeUnavailable: document.getElementById('btnKnife').classList.contains('none'), visibleArt: G._lastWeaponArt };
      }
      const withAmmo = attack(1), empty = attack(0);
      return { fixture: 'same carried knife, target two metres ahead; ammo count only changes', expected: 'knife reach remains available after revolver ammunition is exhausted',
        actual: { withAmmo, empty }, passed: withAmmo.wounds === 1 && empty.wounds === 1 && empty.visibleArt === 'knife' && !empty.knifeUnavailable };
    }) });
    await page.screenshot({ path: path.join(out, 'ground-empty-ammo-knife.png') });

    results.push({ name: 'armed-local-surrender-ignored', ...await page.evaluate(() => {
      const G = App.game, p = [...G.evade.p];
      const s = { p: [p[0], 0, p[2] - 2], goal: [...p], home: [p[0], p[2] - 2], kind: 'nva', armed: true, alive: true, face: 0, seen: 1, sus: 1.2,
        local: true, wander: 100, loiter: 0, spd: 0, ph: 0 };
      const e = { ...G.evade, p, hdg: 0, t: 0, handsUp: true, handsT: 0, searchers: [], locals: [s], cattle: [], rounds: 6,
        spawn: 1e9, localRefill: 1e9, cowT: 1e9, radio: 0, rescue: 0, eta: 120, exposure: 0, drawn: 0, noise: 0, weaponMode: 'fists' };
      G.evade = e; G.phase = 'evade'; G._capt = 0;
      for (let i = 0; i < 300 && G.evade; i++) { G.t += 1 / 60; G.stepEvade(1 / 60); }
      G.render(1 / 60);
      return { fixture: 'one live armed local at two metres, raised hands, five seconds of real stepEvade', expected: 'near armed local accepts surrender and captures player',
        actual: { phase: G.phase, handsTime: e.handsT, seen: s.seen, separation: Math.hypot(e.p[0] - s.p[0], e.p[2] - s.p[2]), hasEvade: !!G.evade },
        passed: G.phase==='done' && !G.evade && e.handsT>1.1 };
    }) });
    await page.screenshot({ path: path.join(out, 'ground-local-ignores-surrender.png') });

    results.push({ name: 'camp-clock', ...await page.evaluate(() => {
      const G = App.game; G.startCamp(1); const e = G.evade; const initial = e.t;
      G.stepEvade(1 / 60);
      const elapsed = e.t - initial;
      return { fixture: 'real startCamp, one 1/60-second stepEvade call', expected: 1 / 60, actual: elapsed, passed: Math.abs(elapsed - 1 / 60) < 1e-9 };
    }) });

    results.push({ name: 'frozen-cell-controls', ...await page.evaluate(() => {
      const G = App.game; G.enterCell(); const e = G.evade, before = e.hdg;
      App.keys.KeyD = 1; G.stepEvade(1 / 60); App.keys.KeyD = 0;
      return { fixture: 'real enterCell frozen scene, keyboard turn input', expected: 'frozen cell heading unchanged', actual: { frozen: e.frozen, before, after: e.hdg }, passed: e.hdg === before };
    }) });

    results.push({ name: 'camp-wall-sweep', ...await page.evaluate(() => {
      const G = App.game; G.startCamp(1); const e = G.evade;
      const x = e.origin[0] - 28, z = e.origin[1] + e.B - 3;
      const beforeBlocked = G._blockedAt(x, z, 0.43, e);
      const moved = G._moveOnFoot(x, z, 0, 8, 0.43, e);
      return { fixture: 'real generated camp perimeter, eight-metre forward sweep', expected: 'wall stops sweep on inside of perimeter', actual: { beforeBlocked, start: [x, z], end: moved, wallZ: e.origin[1] + e.B },
        passed: !beforeBlocked && moved[1] < e.origin[1] + e.B && !G._blockedAt(moved[0], moved[1], 0.43, e) };
    }) });

    results.push({ name: 'wreck-wing-sweep', ...await page.evaluate(() => {
      const G = App.game; const e = G.evade;
      // Keep the real collision method, supply a stationary wreck far from camp geometry.
      const x = e.origin[0] + 170, z = e.origin[1] + 100;
      G.wreck = { p: [x, terrainH(x, z), z], yaw: 0, down: true, pitch: 0, roll: 0 };
      const moved = G._moveOnFoot(x - 13, z, 26, 0, 0.43, e);
      return { fixture: 'stationary A-6 wreck, 26-metre sweep across wing', expected: 'wing prevents crossing', actual: { start: [x - 13, z], end: moved, wreck: [x, z] }, passed: moved[0] < x - 8.75 && !G._insideWreck(moved[0], moved[1], 0.43) };
    }) });

    results.push({ name: 'live-body-sweep', ...await page.evaluate(() => {
      const G = App.game; G.wreck = null; const p = G.evade.p;
      const x = p[0] + 170, z = p[2] + 100;
      const e = { p: [x, 0, z + 3], searchers: [{ p: [x, 0, z], alive: true }], locals: [], cattle: [] };
      const moved = G._moveOnFoot(x, z + 3, 0, -6, 0.43, e);
      return { fixture: 'live NPC body, six-metre player sweep', expected: 'actor body stops player', actual: { start: [x, z + 3], end: moved, npc: [x, z] },
        passed: moved[1] >= z + 0.79 && !G._blockedAt(moved[0], moved[1], 0.43, e) };
    }) });

    results.push({ name: 'revolver-through-prison-wall', ...await page.evaluate(() => {
      const G = App.game; G.startCamp(1); const old = G.evade;
      const x = old.origin[0] - 28, z = old.origin[1] + old.B;
      const s = { p: [x, 0, z + 1.25], goal: [x, 0, z - 1.25], alive: true, armed: true, face: 0, kind: 'nva' };
      const e = { ...old, p: [x, 0, z - 1.25], hdg: Math.PI, searchers: [s], weaponMode: 'pistol', drawn: 1, rounds: 1, lastShot: -99 };
      G.t += 2; const wallBlocked = G._campSolidAt(x, z, 0.1);
      G._weapons(1 / 60, e, App, { Space: true });
      return { fixture: 'real camp wall between player and enemy, .38 fired from 2.5 metres', expected: 'solid wall blocks revolver hit', actual: { wallBlocked, wounds: s.wounds || 0, remainingRounds: e.rounds },
        passed: wallBlocked && !s.wounds && e.rounds===0 };
    }) });

    results.push({ name: 'body-push-into-static-solid', ...await page.evaluate(() => {
      const G = App.game; G.wreck = null;
      const p = G.evade.p;
      const x = p[0] + 170, z = p[2] + 100;
      // Add a local setup prop to in-memory scenery, no repository changes.
      const prop = { m: 'hut', p: [x, 0, z], y: 0, s: 1 };
      G.world.scenery.push(prop); G._collisionCache = null;
      const e = { p: [x + 3, 0, z], searchers: [{ p: [x + 3.5, 0, z], alive: true }], locals: [], cattle: [] };
      const before = G._localSolidAt(e.p[0], e.p[2], 0.43);
      G._pushPeople(e);
      const after = G._localSolidAt(e.p[0], e.p[2], 0.43);
      G.world.scenery.pop(); G._collisionCache = null;
      return { fixture: 'real hut footprint with player near wall and live NPC outside', expected: 'contact push respects static solid', actual: { beforeBlocked: before, afterBlocked: after, relativePlayerX: e.p[0] - x }, passed: !before && !after };
    }) });

    // Reproduce the real capture state transition before supplying the river position fixture.
    await page.evaluate(() => { const G = App.game; G._capt = 0; G._escStage = 'landing'; G.phase = 'evade'; G.captured(); });
    await page.waitForFunction(() => document.getElementById('captTitle').textContent === 'Vinh, 27 August 1966', null, { timeout: 15000 });
    await page.evaluate(() => App.game.render(1 / 60));
    await page.screenshot({ path: path.join(out, 'ground-captured-cell.png') });
    results.push({ name: 'repeat-capture-after-river-transition', ...await page.evaluate(() => {
      const G = App.game; document.getElementById('captVeil').classList.remove('on'); G.startCamp(1); G.startRiver(1);
      const e = G.evade; e.light = 1; e.goal = [e.p[0] + 1500, e.p[2]]; e.searchers = []; e.locals = []; e.spawn = 1e9; e.localRefill = 1e9; e.cowT = 1e9;
      const initialCaptured = G._capt; G.stepEvade(1 / 60);
      return { fixture: 'actual captured() -> POW card; direct real startCamp/startRiver, dawn set to deadline and goal kept distant', expected: 'dawn recaptures player',
        actual: { initialCaptured, phase: G.phase, hasEvade: !!G.evade, light: G.evade?.light }, passed: initialCaptured===1 && G.phase==='done' && !G.evade };
    }) });
    await page.evaluate(() => App.game.render(1 / 60));
    await page.screenshot({ path: path.join(out, 'ground-river-recapture-skipped.png') });

    for(const result of results){result.status=result.passed?'passed':'failed';assert.ok(result.passed,result.name);}
    const report = { scope: 'Fixture-assisted Chromium browser checks using Milestone 1 Game methods and actual custom WebGL 2 rendering. No source edits or method stubs. Not human gameplay completion or physical iPhone Safari validation.',
      targetUrl, info, results, browserErrors: errors, reproducedDefects: results.filter(r => r.reproduced).length,
      knownDefectsNotReproduced: results.filter(r => r.status === 'known-defect-not-reproduced').map(r => r.name),
      passingChecks: results.filter(r=>r.passed).length };
    fs.writeFileSync(path.join(out, 'ground-reproduction.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('PASS: '+results.length+' ground rendering, combat, collision and capture regressions');
    if (errors.length) throw new Error('Unexpected browser JavaScript errors: ' + errors.join('; '));
    const failures = results.filter(r => r.status === 'unexpected-check-failure');
    const defects=results.filter(r=>r.reproduced);
    if(defects.length)throw new Error('Regression failures: '+defects.map(r=>r.name).join(', '));
    if (failures.length) throw new Error('Unexpected fixture check failures: ' + failures.map(r => r.name).join(', '));
    return report;
  } finally { await page.context().close(); }
}
module.exports=main;
