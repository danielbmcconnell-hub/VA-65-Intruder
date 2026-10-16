'use strict';
// Deterministic mechanics tests. These do not claim WebGL or real-device tests.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../assets/willard/interceptor.js'), 'utf8');
const window = {}; vm.runInNewContext(source, { window, Math, Number, Array, Object, String });
const AI = window.WillardInterceptor, copy = v => JSON.parse(JSON.stringify(v));
const flat = () => 0, distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const forward = e => [Math.sin(e.yaw) * Math.cos(e.pitch), Math.sin(e.pitch), -Math.cos(e.yaw) * Math.cos(e.pitch)];
function fixture(options = {}) {
  const enemy = AI.create({ position: [0, 600, 900], yaw: 0, speed: 220, seed: 1966, ...options });
  const ac = { alive: true, p: [0, 600, 0], v: [0, 0, -180], damage: 0 };
  const hits = [], events = [], context = { targetAC: ac, terrainH: flat,
    hitAircraft(target, severity, source) { target.damage += severity; hits.push({ severity, source }); }, emit(e) { events.push(e); } };
  return { enemy, ac, context, hits, events };
}
function advance(f, seconds, dt = 1 / 60, move = true) {
  for (let t = 0; t < seconds - 1e-8; t += dt) {
    if (move) f.ac.p = f.ac.p.map((n, i) => n + f.ac.v[i] * dt);
    AI.step(f.enemy, dt, f.context);
  }
}

test('creation follows bodyAxes heading, copies position and uses finite cannon ammunition', () => {
  const p = [10, 500, 20], e = AI.create({ position: p, yaw: Math.PI / 2, speed: 240 }); p[0] = 100;
  assert.equal(e.p[0], 10); assert(Math.abs(e.v[0] - 240) < 1e-9); assert(Math.abs(e.v[2]) < 1e-9);
  assert.equal(e.ammo, 180); assert.equal(e.state, 'PATROL'); assert.equal(e.projectiles.length, 0);
});
test('normal flight detects a visible target and progresses through reaction into pursuit', () => {
  const f = fixture(); advance(f, 3);
  const states = f.events.filter(e => e.type === 'state').map(e => e.state);
  assert(states.includes('DETECT')); assert(states.includes('INTERCEPT')); assert(states.includes('PURSUIT'));
  assert(f.enemy.visible); assert(f.enemy.lastKnown); assert(f.enemy.time > 2.9);
});
test('terrain line of sight blocks perception instead of tracking through a ridge', () => {
  const f = fixture(); f.context.terrainH = (x, z) => z > 300 && z < 600 ? 1000 : 0;
  AI.step(f.enemy, .1, f.context);
  assert.equal(f.enemy.visible, false); assert.equal(f.enemy.lastKnown, null); assert.equal(f.enemy.state, 'PATROL');
  assert.equal(AI.lineOfSight([0, 600, 900], [0, 600, 0], f.context.terrainH), false);
});
test('night cloud cover reduces visual acquisition range and the sensor has a finite field of view', () => {
  const f = fixture({ position: [0, 600, 3800] }); f.context.cloud = 1; advance(f, .2, 1 / 60, false);
  assert.equal(f.enemy.visible, false);
  const rear = fixture({ position: [0, 600, -1200], yaw: 0 }); advance(rear, .2, 1 / 60, false);
  assert.equal(rear.enemy.visible, false); assert.equal(rear.enemy.lastKnown, null);
});
test('last visual knowledge stops updating when terrain conceals a change in target direction', () => {
  const f = fixture(); advance(f, 1); const seen = copy(f.enemy.lastKnown), seenVelocity = copy(f.enemy.lastKnownVelocity);
  f.context.terrainH = () => 10000; f.ac.v = [180, 0, 0];
  // Keep the interceptor above the blocking terrain only for this sensor fixture.
  f.context.terrainH = (x, z) => z < f.enemy.p[2] - 150 ? 2000 : 0;
  advance(f, 2);
  assert.deepEqual(copy(f.enemy.lastKnown), seen); assert.deepEqual(copy(f.enemy.lastKnownVelocity), seenVelocity);
  assert.equal(f.enemy.state, 'REACQUIRE'); assert(f.enemy.time - f.enemy.lastSeen > 1.2);
});
test('a concealed target is not reacquired from its true position after memory expires', () => {
  const f = fixture(); advance(f, 1); f.context.visibility = .05; f.ac.p = [20000, 1000, -15000];
  f.ac.v = [0, 0, 0]; advance(f, 24);
  assert.equal(f.enemy.visible, false); assert.equal(f.enemy.state, 'PATROL');
  assert(distance(f.enemy.lastKnown, f.ac.p) > 10000);
});
test('intercept solution leads a moving target and compensates shell gravity', () => {
  const solution = AI.lead([0, 500, 0], [0, 0, -220], [0, 500, -700], [100, 0, -180]);
  assert(solution.direction[0] > .1); assert(solution.direction[1] > 0); assert(solution.direction[2] < -.95);
  const time = solution.time, projectile = solution.direction.map((v, i) => v * AI.limits.muzzleSpeed * time + [0, 500, 0][i] + [0, 0, -220][i] * time);
  projectile[1] -= .5 * 9.81 * time * time;
  assert(distance(projectile, [100 * time, 500, -700 - 180 * time]) < .5);
});
test('MiG acceleration, bank, turn and pitch obey finite limits and never teleport', () => {
  const f = fixture(); f.ac.p = [2400, 1100, 0]; f.ac.v = [0, 0, -170];
  for (let i = 0; i < 900; i++) {
    f.ac.p = f.ac.p.map((v, j) => v + f.ac.v[j] / 60);
    const before = copy(f.enemy); AI.step(f.enemy, 1 / 60, f.context); const e = f.enemy;
    assert(distance(e.p, before.p) <= AI.limits.maxSpeed / 60 + 1e-6);
    assert(Math.abs(e.speed - before.speed) <= AI.limits.maxDeceleration / 60 + 1e-6);
    assert(Math.abs(e.roll - before.roll) <= AI.limits.maxRollRate / 60 + 1e-6);
    const yaw = Math.atan2(Math.sin(e.yaw - before.yaw), Math.cos(e.yaw - before.yaw));
    assert(Math.abs(yaw) <= AI.limits.maxTurnRate / 60 + 1e-6);
    assert(Math.abs(e.pitch - before.pitch) <= AI.limits.maxPitchRate / 60 + 1e-6);
    assert(Math.abs(e.roll) <= AI.limits.maxBank + 1e-6);
    assert(distance(e.v, forward(e).map(v => v * e.speed)) < 1e-6);
  }
});
test('an excessive closing rate produces overshoot and finite reposition rather than an instant turn', () => {
  const f = fixture({ position: [0, 600, 260], speed: 300 }); f.ac.v = [0, 0, -140];
  advance(f, 7);
  const states = f.events.filter(e => e.type === 'state').map(e => e.state);
  assert(states.includes('OVERSHOOT')); assert(states.includes('REPOSITION')); assert(f.enemy.speed >= 132);
});
test('a genuine attack emits bounded finite ballistic tracers and muzzle flashes', () => {
  const f = fixture(); advance(f, 8);
  assert(f.events.some(e => e.type === 'tracer')); assert(f.events.some(e => e.type === 'muzzle'));
  assert(f.enemy.roundsFired > 0); assert.equal(f.enemy.ammo + f.enemy.roundsFired, 180);
  assert(f.enemy.projectiles.length <= AI.limits.maxProjectiles);
  for (const q of f.enemy.projectiles) assert(q.life <= 2.2 && q.v.every(Number.isFinite));
});
test('actual fired shells hit a steady target through swept projectile collision', () => {
  const f = fixture({ difficulty: 'ace' }); advance(f, 15);
  assert(f.hits.length > 0); assert.equal(f.hits.length, f.enemy.hits); assert(f.ac.damage > 0);
  assert(f.hits.every(h => h.source === 'mig-cannon' && h.severity === AI.profiles.ace.damage));
});
test('a moving target crossing between shell endpoints is hit without tunnelling', () => {
  const f = fixture(); f.enemy.projectiles.push({ id: 99, p: [-30, 600, 0], prev: [-30, 600, 0], v: [3600, 0, 0], age: 0, life: 2.2, damage: .2 });
  f.ac.p = [0, 600, 0]; f.ac.v = [0, 0, 0]; AI.step(f.enemy, 1 / 60, f.context);
  assert.equal(f.hits.length, 1); assert.equal(f.enemy.projectiles.some(p => p.id === 99), false);
});
test('a near miss causes no probabilistic damage and expired projectiles are removed', () => {
  const f = fixture(); f.ac.v = [0, 0, 0];
  f.enemy.projectiles.push({ id: 99, p: [-30, 630, 0], prev: [-30, 630, 0], v: [3600, 0, 0], age: 2.19, life: 2.2, damage: .2 });
  AI.step(f.enemy, 1 / 60, f.context);
  assert.equal(f.hits.length, 0); assert.equal(f.ac.damage, 0); assert.equal(f.enemy.projectiles.length, 0);
});
test('evasive displacement after a real burst makes its projectiles miss', () => {
  const f = fixture({ difficulty: 'ace' });
  for (let i = 0; i < 180 && !f.events.some(e => e.type === 'tracer'); i++) advance(f, 1 / 60);
  assert(f.events.some(e => e.type === 'tracer')); const oldRounds = f.enemy.roundsFired;
  f.ac.p[0] += 150; f.ac.v = [200, 0, -140]; f.context.visibility = .05; advance(f, 3);
  assert.equal(f.hits.length, 0); assert.equal(f.enemy.roundsFired, oldRounds);
});
test('ammunition is finite and dry guns cannot emit additional shells', () => {
  const f = fixture(); f.enemy.ammo = 2; advance(f, 20);
  assert.equal(f.enemy.ammo, 0); assert.equal(f.enemy.roundsFired, 2);
  const shots = f.events.filter(e => e.type === 'tracer').length; advance(f, 10);
  assert.equal(f.events.filter(e => e.type === 'tracer').length, shots);
});
test('burst cooldown prevents continuous fire even with a stable solution', () => {
  const f = fixture({ difficulty: 'rookie' }); advance(f, 12);
  assert(f.enemy.bursts >= 1); assert(f.enemy.bursts <= 4); assert(f.enemy.roundsFired <= 24);
});
test('30, 60 and 120 Hz reproduce the same finite burst count and close flight paths', () => {
  const runs = [1 / 30, 1 / 60, 1 / 120].map(dt => { const f = fixture(); advance(f, 30, dt); return f; });
  assert(runs.every(f => f.enemy.roundsFired === runs[0].enemy.roundsFired));
  assert(runs.every(f => distance(f.enemy.p, runs[0].enemy.p) < 6));
  assert(runs.every(f => f.enemy.bursts === 10 && f.enemy.roundsFired === 60));
});
test('a naval half-second burst has six shells at 12 rounds per second, including at high refresh rates', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const f = fixture();
    for (let i = 0; i < 240 / dt && f.enemy.bursts === 0; i++) advance(f, dt, dt);
    advance(f, .6, dt);
    assert.equal(f.enemy.bursts, 1); assert.equal(f.enemy.roundsFired, 6);
  }
});
test('a scalar warning alone causes evasion but cannot award a forced disengagement', () => {
  const f = fixture(); f.context.flakThreat = .9; advance(f, 5);
  assert.equal(f.enemy.state, 'EVADE_FLAK'); assert.equal(f.enemy.disengaged, false); assert.equal(f.enemy.flakPressure, 0);
  f.context.flakThreat = 0; advance(f, 5);
  assert.notEqual(f.enemy.state, 'EVADE_FLAK'); assert.equal(f.enemy.disengaged, false);
});
test('actual nearby airbursts build danger and can cause a pilot to break pursuit', () => {
  const f = fixture();
  for (let i = 0; i < 6; i++) {
    f.context.flakThreat = { level: 1, impacts: [{ id: i, p: [f.enemy.p[0] + 100, f.enemy.p[1], f.enemy.p[2]], radius: 55, power: 1 }] };
    AI.step(f.enemy, 1 / 60, f.context);
  }
  assert(f.enemy.flakPressure >= 1.35); assert.equal(f.enemy.state, 'DISENGAGE'); assert.equal(f.enemy.disengaged, true);
  assert.equal(f.enemy.health, 1, 'distant bursts threaten without inventing fragmentation hits');
});
test('airburst IDs are consumed once and cannot repeatedly inflict damage each frame', () => {
  const f = fixture(); const p = f.enemy.p.slice(); f.context.flakThreat = { impacts: [{ id: 'one', p, radius: 100, power: 1 }] };
  AI.step(f.enemy, 1 / 60, f.context); const health = f.enemy.health, hitCount = f.events.filter(e => e.type === 'enemyHit').length;
  advance(f, 1); assert.equal(f.enemy.health, health); assert.equal(f.events.filter(e => e.type === 'enemyHit').length, hitCount);
  assert(health < 1); assert(health > 0);
});
test('actual external flak damage affects health, smoke state and disengagement without repair', () => {
  const f = fixture(); assert(AI.damage(f.enemy, .65, 'flak', [0, 600, 0])); AI.step(f.enemy, 1 / 60, f.context);
  assert(Math.abs(f.enemy.health - .35) < 1e-9); assert.equal(f.enemy.state, 'DISENGAGE');
  advance(f, 2); assert.equal(f.enemy.health, .35); assert.equal(AI.damage(f.enemy, NaN, 'flak'), false);
});
test('terrain collision destroys an interceptor instead of teleporting it above the landscape', () => {
  const f = fixture({ position: [0, 20, 900] }); f.context.terrainH = () => 100;
  AI.step(f.enemy, 1 / 60, f.context); assert.equal(f.enemy.alive, false); assert.equal(f.enemy.state, 'DESTROYED');
  assert(f.enemy.p[1] < 100); assert(f.events.some(e => e.type === 'enemyDestroyed' && e.source === 'terrain'));
});
test('paused and invalid time steps do not move enemies, fire, consume ammunition or age projectiles', () => {
  const f = fixture(); advance(f, 2); const before = copy(f.enemy);
  f.context.paused = true; assert.deepEqual(copy(AI.step(f.enemy, 1, f.context)), []); assert.deepEqual(copy(f.enemy), before);
  f.context.paused = false;
  for (const dt of [0, -1, NaN, Infinity]) AI.step(f.enemy, dt, f.context);
  assert.deepEqual(copy(f.enemy), before);
});
test('the same seed and controls reproduce combat paths; new seeds change dispersion', () => {
  const a = fixture({ seed: 77 }), b = fixture({ seed: 77 }), c = fixture({ seed: 78 });
  advance(a, 8); advance(b, 8); advance(c, 8);
  assert.deepEqual(copy(a.enemy), copy(b.enemy));
  const shotsA = a.events.filter(e => e.type === 'tracer'), shotsC = c.events.filter(e => e.type === 'tracer');
  assert(shotsA.length > 0 && shotsC.length > 0); assert.notDeepEqual(copy(shotsA[0].v), copy(shotsC[0].v));
});
test('difficulty changes observation, cannon dispersion, cadence and damage without changing A-6 physics', () => {
  assert(AI.profiles.rookie.spread > AI.profiles.ace.spread);
  assert(AI.profiles.rookie.reaction > AI.profiles.ace.reaction);
  assert(AI.profiles.rookie.damage < AI.profiles.ace.damage);
  assert(AI.profiles.rookie.cooldown > AI.profiles.ace.cooldown);
  assert.equal(AI.create({ difficulty: 'NAVAL AVIATOR' })._profile.sight, AI.profiles.naval.sight);
  assert(!/launchSam|fireArm|newAircraft|acStep\(/.test(source), 'no invented fighter missiles or replacement player physics');
});
test('target loss and destruction do not permit more cannon attacks', () => {
  const f = fixture(); advance(f, 2); f.ac.alive = false; const rounds = f.enemy.roundsFired;
  advance(f, 4); assert.equal(f.enemy.roundsFired, rounds); assert.equal(f.enemy.visible, false);
  AI.damage(f.enemy, 1, 'flak'); AI.step(f.enemy, 1 / 60, f.context);
  assert.equal(f.enemy.alive, false); assert.equal(f.enemy.state, 'DESTROYED');
});
