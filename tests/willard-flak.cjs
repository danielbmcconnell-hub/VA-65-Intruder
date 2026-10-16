'use strict';
// Production flak simulation and the existing production FX class in a VM.
// These geometry/physics checks do not claim actual WebGL or device testing.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../assets/willard/flak.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(options = {}) {
  const window = {}, context = { window, console, Math, PI: Math.PI, TAU: Math.PI * 2, rnd: (a, b) => (a + b) * .5 };
  vm.createContext(context); vm.runInContext(source, context);
  vm.runInContext(html.slice(html.indexOf('class FX {'), html.indexOf('const AC =')) + '\nwindow.ActualFX = FX;', context);
  const F = window.WillardFlak, terrainH = options.terrainH || (() => 0);
  const s = F.create({ center: [0, 0, 0], seed: 1966, difficulty: options.difficulty || 'naval', terrainH, ...options });
  const ac = { p: [0, 650, 0], v: [0, 0, 0], alive: true }, enemy = { p: [260, 680, 40], v: [0, 0, 0], alive: true };
  const hits = [], fx = new window.ActualFX();
  const ctx = { ac, enemy, terrainH, fx, quality: 0, hitAircraft: (target, severity, source) => hits.push({ target, severity, source }) };
  return { F, s, ac, enemy, hits, fx, ctx };
}
function advance(f, seconds, interval = 1 / 30, move) {
  const bursts = [];
  for (let t = 0; t < seconds - 1e-9; t += interval) {
    const dt = Math.min(interval, seconds - t);
    if (move) move(f, dt, t);
    bursts.push(...f.F.step(f.s, dt, f.ctx)); f.fx.step(dt);
  }
  return bursts;
}
function physicalShell(f, p, v, fuse, extra = {}) {
  // Explicit isolated projectile fixture: no mission success, damage or AI
  // state is seeded. This exercises the same production integrator/fuse.
  f.s.guns.forEach(g => { g.alive = false; });
  const shell = { id: ++f.s.sequence, gunId: 'fixture', targetId: 'a6', p: p.slice(), v: v.slice(), age: 0, fuse,
    radius: 65, power: 1, born: f.s.time, ...extra };
  f.s.shells.push(shell); return shell;
}

test('eight seeded fixed ground emplacements remain within the authored ring', () => {
  const f = fixture({ center: [1000, 70, -500], terrainH: (x, z) => 20 + x * .001 + z * .002 });
  assert.equal(f.s.guns.length, 8); assert.equal(new Set(f.s.guns.map(g => g.id)).size, 8);
  for (const g of f.s.guns) {
    const r = Math.hypot(g.p[0] - 1000, g.p[2] + 500); assert(r >= 1600 && r <= 2700);
    assert(Math.abs(g.p[1] - (f.ctx.terrainH(g.p[0], g.p[2]) + 2.4)) < 1e-8);
  }
  const other = fixture({ center: [1000, 70, -500], terrainH: f.ctx.terrainH });
  assert.deepEqual(clone(f.s), clone(other.s));
});

test('different seeds vary emplacements and timing without adding entities', () => {
  const a = fixture({ seed: 2 }), b = fixture({ seed: 3 });
  assert.notDeepEqual(clone(a.s.guns.map(g => g.p)), clone(b.s.guns.map(g => g.p)));
  assert.equal(a.s.guns.length, b.s.guns.length);
});

test('line of sight respects ridgelines, finite terrain and actual ray height', () => {
  const { F } = fixture();
  assert(F.lineOfSight([0, 2, 0], [1000, 600, 0], () => 0));
  assert(!F.lineOfSight([0, 2, 0], [1000, 600, 0], x => x > 400 && x < 600 ? 450 : 0));
  assert(!F.lineOfSight([0, 2, 0], [1000, 600, 0], () => NaN));
  assert(!F.lineOfSight([0, 2, 0], [NaN, 100, 0], () => 0));
});

test('detection has range and AGL limits and excludes dead/ejected aircraft', () => {
  for (const edit of [f => { f.ac.p = [0, 90, 0]; }, f => { f.ac.p = [0, 2300, 0]; },
    f => { f.ac.p = [19000, 650, 0]; }, f => { f.ac.alive = false; }, f => { f.ac.outOfAircraft = true; }]) {
    const f = fixture(); f.ctx.enemy = null; edit(f); advance(f, 12);
    assert.equal(f.s.stats.shellsFired, 0); assert.equal(f.hits.length, 0);
  }
});

test('solid high terrain masks both aircraft rather than letting guns see through it', () => {
  const f = fixture({ terrainH: (x, z) => Math.hypot(x, z) > 600 && Math.hypot(x, z) < 1200 ? 1600 : 0 });
  advance(f, 12); assert.equal(f.s.stats.shellsFired, 0); assert.equal(f.hits.length, 0);
});

test('gunners must observe, wait for lagged tracks and physically slew before firing', () => {
  const f = fixture(), initial = clone(f.s.guns);
  advance(f, .5); assert.equal(f.s.stats.shellsFired, 0);
  f.s.guns.forEach((g, i) => {
    const yawChange = Math.atan2(Math.sin(g.yaw - initial[i].yaw), Math.cos(g.yaw - initial[i].yaw));
    assert(Math.abs(yawChange) <= .5 * 1.03); assert(g.tracking <= .5);
  });
  advance(f, 5); assert(f.s.stats.shellsFired > 0);
  assert(f.s.shells.every(s => s.fuse >= 1 && s.fuse <= 4));
});

test('guns genuinely target both the A-6 and pursuing MiG, with no friendly exemption', () => {
  const f = fixture(); advance(f, 24);
  assert(f.s.stats.a6Shots > 0, 'actual A-6 track fired on'); assert(f.s.stats.migShots > 0, 'actual interceptor track fired on');
  assert(f.s.bursts.some(b => b.targetId === 'a6')); assert(f.s.bursts.some(b => b.targetId === 'mig'));
  assert(f.s.stats.migExposure > 0); assert(f.s.stats.a6Exposure > 0);
});

test('targets outside physical fuse reach are tracked without impossible long-range shell velocity', () => {
  const f = fixture(); f.ctx.enemy = null; f.ac.p = [0, 2100, -7000];
  advance(f, 18);
  assert(f.s.guns.some(g => g.visibleA6), 'some gun positions detect within 6.5 km');
  assert.equal(f.s.stats.shellsFired, 0, 'four-second shells cannot teleport to remote tracks');
});

test('gun lead is based on delayed observations and predicts target motion', () => {
  const f = fixture(); f.ctx.enemy = null; f.ac.p = [-1500, 650, 500]; f.ac.v = [170, 0, -20];
  let shell = null;
  for (let i = 0; i < 200 && !shell; i++) {
    f.ac.p = f.ac.p.map((n, j) => n + f.ac.v[j] / 30); f.F.step(f.s, 1 / 30, f.ctx);
    shell = f.s.shells[0];
  }
  assert(shell, 'production gun fired a real ballistic shell');
  const g = f.s.guns.find(gun => gun.id === shell.gunId);
  const burstX = shell.p[0] + shell.v[0] * (shell.fuse - shell.age);
  assert(burstX > f.ac.p[0] + 100, 'aim point leads eastbound aircraft');
  assert(g.observations.a6.some(o => f.s.time - o.at >= .55));
  assert(shell.fuse >= 1 && shell.fuse <= 4); assert(Math.hypot(...shell.v) < 1220);
});

test('physical shell follows gravity and detonates once at its exact fuse location', () => {
  const f = fixture(); f.ctx.ac = null; f.ctx.enemy = null;
  physicalShell(f, [0, 500, 0], [400, 80, -50], 2);
  const first = advance(f, 1); assert.equal(first.length, 0); assert.equal(f.s.shells.length, 1);
  assert(Math.abs(f.s.shells[0].p[0] - 400) < 1e-7);
  assert(Math.abs(f.s.shells[0].p[1] - (580 - 4.905)) < 1e-7);
  const next = advance(f, 1.2); assert.equal(next.length, 1); assert.equal(f.s.shells.length, 0);
  assert(Math.abs(next[0].p[0] - 800) < 1e-7); assert(Math.abs(next[0].p[1] - (660 - 19.62)) < 1e-7);
  assert.equal(advance(f, 2).length, 0); assert.equal(f.s.stats.detonated, 1);
});

test('shell terrain impacts do not turn into aerial bursts or random aircraft hits', () => {
  const f = fixture(); physicalShell(f, [0, 15, 0], [100, -70, 0], 2);
  const bursts = advance(f, 3); assert.equal(bursts.length, 0); assert.equal(f.s.shells.length, 0);
  assert.equal(f.s.stats.terrainImpacts, 1); assert.equal(f.hits.length, 0);
});

test('a real overlapping fused burst damages the actual A-6 exactly once', () => {
  const f = fixture(); f.ctx.enemy = null;
  physicalShell(f, [0, 500, 0], [0, 154.905, 0], 1);
  const bursts = advance(f, 1.2); assert.equal(bursts.length, 1); assert(bursts[0].hitA6);
  assert.equal(f.hits.length, 1); assert.equal(f.hits[0].target, f.ac); assert.equal(f.hits[0].source, 'flak');
  assert(Math.abs(f.hits[0].severity - .45) < 1e-7);
  advance(f, 5); assert.equal(f.hits.length, 1);
});

test('near misses give readable exposure but cannot produce invisible RNG damage', () => {
  const f = fixture(); f.ctx.enemy = null;
  physicalShell(f, [100, 500, 0], [0, 154.905, 0], 1);
  const bursts = advance(f, 1.2); assert.equal(bursts.length, 1); assert.equal(bursts[0].hitA6, false);
  assert.equal(f.s.stats.a6Exposure, 1); assert.equal(f.hits.length, 0);
});

test('a shell aimed at the MiG can still damage an A-6 entering its burst', () => {
  const f = fixture(); physicalShell(f, [0, 500, 0], [0, 154.905, 0], 1, { targetId: 'mig' });
  advance(f, 1.2); assert.equal(f.hits.length, 1); assert.equal(f.s.bursts[0].targetId, 'mig');
});

test('mobile frame interpolation tests actual aircraft position at the fuse instant', () => {
  const f = fixture(); f.s.previousAC = [-100, 650, 0]; f.ac.p = [100, 650, 0]; f.ctx.enemy = null;
  physicalShell(f, [0, 649.95095, 0], [0, .981, 0], .1);
  f.F.step(f.s, .2, f.ctx); assert.equal(f.hits.length, 1, 'plane crosses burst mid-frame');
});

test('difficulty changes actual spread and damage without buffing the A-6 flight engine', () => {
  const values = [];
  for (const difficulty of ['rookie', 'naval', 'ace']) {
    const f = fixture({ difficulty }); const before = clone(f.ac);
    physicalShell(f, [0, 500, 0], [0, 154.905, 0], 1); advance(f, 1.2);
    values.push(f.hits[0].severity); assert.deepEqual(f.ac, before, 'only supplied World damage callback owns aircraft mutation');
  }
  assert(values[0] < values[1] && values[1] < values[2]);
});

test('pause, invalid dt and zero dt neither mutate state nor emit effects', () => {
  const f = fixture(); advance(f, 4); const before = JSON.stringify(f.s), effects = f.fx.add.length + f.fx.smk.length;
  f.ctx.paused = true; assert.equal(f.F.step(f.s, 5, f.ctx).length, 0); assert.equal(JSON.stringify(f.s), before);
  f.ctx.paused = false;
  for (const dt of [0, -1, NaN, Infinity]) assert.equal(f.F.step(f.s, dt, f.ctx).length, 0);
  assert.equal(JSON.stringify(f.s), before); assert.equal(f.fx.add.length + f.fx.smk.length, effects);
});

test('plain JSON checkpoints resume identical gun tracking, shells, bursts and RNG', () => {
  const a = fixture(); advance(a, 5.2); const b = fixture(); b.s = clone(a.s);
  const x = advance(a, 7.4), y = advance(b, 7.4);
  assert.deepEqual(clone(x), clone(y)); assert.deepEqual(clone(a.s), clone(b.s));
  assert.equal(typeof a.s.guns[0].observations.a6[0].at, 'number');
});

test('simulation stays consistent at 30 and 120 Hz for isolated ballistic physics', () => {
  const a = fixture(), b = fixture(); a.ctx.ac = b.ctx.ac = null; a.ctx.enemy = b.ctx.enemy = null;
  physicalShell(a, [0, 500, 0], [300, 200, -80], 2.15);
  physicalShell(b, [0, 500, 0], [300, 200, -80], 2.15);
  const x = advance(a, 2.3, 1 / 30)[0], y = advance(b, 2.3, 1 / 120)[0];
  for (let i = 0; i < 3; i++) assert(Math.abs(x.p[i] - y.p[i]) < 1e-6);
});

test('actual original FX receives coherent physical tracers, heavy flak and bounded beams', () => {
  const f = fixture(); advance(f, 10);
  assert(f.fx.add.some(p => p.streak)); assert(f.fx.smk.some(p => p.life >= 16), 'production long-lived flak smoke');
  assert(f.s.lights.length === 8 && f.s.lights.every(l => l.dir.length === 3 && l.end.length === 3 && l.spread > 0));
  for (const light of f.s.lights) assert(Math.abs(Math.hypot(...light.dir) - 1) < 1e-9);
});

test('sustained combat and repeated restart remain bounded without timers or duplicate entities', () => {
  const f = fixture(); advance(f, 160, 1 / 30);
  assert(f.s.shells.length <= 40); assert(f.s.bursts.length <= 48); assert.equal(f.s.guns.length, 8);
  assert(f.s.guns.every(g => g.observations.a6.length <= 8 && g.observations.mig.length <= 8));
  assert(f.fx.add.length <= 1300); assert(f.fx.smk.length <= 760);
  for (let i = 0; i < 25; i++) { const s = f.F.create({ seed: i }); assert.equal(s.guns.length, 8); assert.equal(s.shells.length, 0); assert.equal(s.bursts.length, 0); }
  assert(!/requestAnimationFrame|setTimeout|setInterval/.test(source));
});

test('read-only inspection returns detached positions and statistics', () => {
  const f = fixture(); advance(f, 4); const before = JSON.stringify(f.s), info = f.F.inspect(f.s);
  info.guns[0].p[0] = Infinity; info.stats.a6Hits = 99; info.shells.length = 0;
  assert.equal(JSON.stringify(f.s), before);
});

test('production interceptor is driven off by actual gun-fired bursts during a corridor crossing', () => {
  const window = {}, sandbox = { window, console, Math }; vm.createContext(sandbox);
  for (const file of ['flak.js', 'interceptor.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/willard/', file), 'utf8'), sandbox);
  for (const difficulty of ['rookie', 'naval', 'ace']) {
    const F = window.WillardFlak, I = window.WillardInterceptor, terrainH = () => 0;
    const s = F.create({ seed: 1966, center: [0, 0, 0], difficulty });
    const enemy = I.create({ position: [0, 650, 10000], yaw: 0, speed: 255, seed: 1966, difficulty });
    const ac = { p: [0, 650, 8000], v: [0, 0, -230], alive: true }; let a6Damage = 0, steps = 0;
    // Explicit flight-path fixture, not the player flight model or a claim of
    // end-to-end play. Both production AI and gun simulation remain active.
    while (steps++ < 3600 && !enemy.disengaged) {
      ac.p[2] -= 230 / 30;
      const bursts = F.step(s, 1 / 30, { ac, enemy, terrainH, hitAircraft: (a, v) => { a6Damage += v; } });
      I.step(enemy, 1 / 30, { targetAC: ac, terrainH, flakThreat: { impacts: bursts } });
    }
    assert(enemy.disengaged, difficulty + ': genuine nearby bursts build sufficient pressure');
    assert.equal(enemy.state, 'DISENGAGE'); assert(s.stats.migShots > 0 && s.stats.migExposure > 0);
    assert(a6Damage > 0 && s.stats.a6Hits > 0, 'defenses remain unfriendly to the Intruder');
    assert(s.stats.shellsFired > s.stats.detonated && s.stats.detonated > 0);
  }
});

test('an interceptor outside the defense corridor receives no fabricated flak pressure', () => {
  const window = {}, sandbox = { window, console, Math }; vm.createContext(sandbox);
  for (const file of ['flak.js', 'interceptor.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/willard/', file), 'utf8'), sandbox);
  const F = window.WillardFlak, I = window.WillardInterceptor, terrainH = () => 0;
  const s = F.create({ seed: 1966 }), enemy = I.create({ position: [20000, 650, 1000], yaw: 0, seed: 1966 });
  const ac = { p: [20000, 650, 0], v: [0, 0, -230], alive: true };
  for (let i = 0; i < 900; i++) {
    ac.p[2] -= 230 / 30;
    const bursts = F.step(s, 1 / 30, { ac, enemy, terrainH });
    I.step(enemy, 1 / 30, { targetAC: ac, terrainH, flakThreat: { impacts: bursts } });
  }
  assert.equal(s.stats.shellsFired, 0); assert.equal(enemy.flakPressure, 0); assert.equal(enemy.disengaged, false);
});
