/* Deterministic simulation tests; these do not verify a browser render or iPhone. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/pow/ai.js'), 'utf8');
let checks = 0;
function fixture({stage = 'compound', boxes = [], mobile = false, nav = {minX: -15, maxX: 15, minZ: -15, maxZ: 15, cell: 1}} = {}) {
  const game = {t: 0, pow: {stage, base: [0, 0, 0], light: .9, difficulty: 'normal', nav, solids: boxes,
    flags: {}, stats: {}, noises: [], cellDoor: [0, 0, -3.5]}, evade: {p: [200, 0, 200], searchers: [], locals: []}};
  let probes = 0, captures = 0;
  const notifications = [], segments = [];
  const hit = (x, z, r, y) => boxes.some(b => b.active !== false && y + 1.6 > (b.yMin ?? -1) && y < (b.yMax ?? 4)
    && Math.hypot(Math.max(0, Math.abs(x - b.x) - b.hw), Math.max(0, Math.abs(z - b.z) - b.hl)) < r + 1e-9);
  const P = {
    ctx: {}, blocked(g, x, z, r, y) { probes++; return hit(x, z, r, y); },
    los(g, from, to) {
      const count = Math.ceil(Math.hypot(to[0] - from[0], to[2] - from[2]) / .08) || 1;
      for (let i = 0; i <= count; i++) {
        const t = i / count, x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t, z = from[2] + (to[2] - from[2]) * t;
        if (boxes.some(b => b.active !== false && Math.abs(x - b.x) <= b.hw && Math.abs(z - b.z) <= b.hl
          && y >= (b.yMin ?? -1) && y <= (b.yMax ?? 4))) return false;
      }
      return true;
    },
    move(g, actor, dx, dz, r) {
      const start = actor.p.slice(), count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .06));
      for (let i = 1; i <= count; i++) {
        const x = start[0] + dx * i / count, z = start[2] + dz * i / count;
        if (hit(x, z, r, actor.p[1])) break;
        actor.p[0] = x; actor.p[2] = z;
      }
      segments.push([start, actor.p.slice()]); return actor.p;
    },
    notify(g, message) { notifications.push(message); },
    begin(g, stageName) { captures++; g.pow.stage = stageName; }
  };
  const sandbox = {window: {POW: P, matchMedia: () => ({matches: mobile})}, Math, Number, Map, Set, WeakMap};
  vm.runInNewContext(source, sandbox, {filename: 'pow/ai.js'});
  const AI = P.AI;
  const actor = (o = {}) => AI.makeActor({id: 'g-' + game.evade.searchers.length, p: [0, 0, 0], ...o});
  const add = o => { const a = actor(o); game.evade.searchers.push(a); return a; };
  const run = (seconds, dt = .1) => { for (let i = 0; i < Math.ceil(seconds / dt); i++) { game.t += dt; AI.step(game, dt); } };
  return {game, P, AI, actor, add, run, hit, boxes, segments, notifications, probes: () => probes, captures: () => captures};
}
function test(name, fn) { fn(); checks++; process.stdout.write('PASS ' + name + '\n'); }
function toData(value) { return JSON.parse(JSON.stringify(value)); }

test('A* detours a thin wall; every movement sweep stays clear', () => {
  const f = fixture({boxes: [{x: 0, z: 0, hw: .04, hl: 6}]});
  const a = f.add({p: [-4, 0, 0], goal: [4, 0, 0]});
  a.state = 'investigate'; a.investigateUntil = 1000;
  f.run(25);
  assert.ok(Math.hypot(a.p[0] - 4, a.p[2]) < .7, 'guard should reach opposite side around wall');
  for (const [from, to] of f.segments) for (let i = 0; i <= 8; i++) {
    assert.equal(f.hit(from[0] + (to[0] - from[0]) * i / 8, from[2] + (to[2] - from[2]) * i / 8, .33, 0), false);
  }
  assert.ok(a.ph > 0 && Number.isFinite(a.face), 'travel advances gait and finite smooth facing');
});

test('A* permits a clear doorway and rejects one narrower than the actor', () => {
  const nav = {minX: -5, maxX: 5, minZ: -4, maxZ: 4, cell: 1};
  const walls = gap => [{x: 0, z: -(5 + gap) / 2, hw: .05, hl: (5 - gap) / 2}, {x: 0, z: (5 + gap) / 2, hw: .05, hl: (5 - gap) / 2}];
  const open = fixture({nav, boxes: walls(1)}), shut = fixture({nav, boxes: walls(.15)});
  assert.ok(open.AI.planPath(open.game, open.actor({p: [-4, 0, 0]}), [4, 0, 0]).length > 0);
  assert.equal(shut.AI.planPath(shut.game, shut.actor({p: [-4, 0, 0]}), [4, 0, 0]).length, 0);
});

test('a large frame cannot tunnel an actor through a wall', () => {
  const f = fixture({boxes: [{x: 0, z: 0, hw: .025, hl: 12}]});
  const a = f.add({p: [-1, 0, 0], goal: [1, 0, 0]});
  a.state = 'investigate'; a.investigateUntil = 1000;
  f.run(10, 10);
  assert.ok(a.p[0] < 0 && !f.hit(a.p[0], a.p[2], .33, 0));
});

test('sustained visible close armed contact recaptures once; dead, civilian and stunned actors do not', () => {
  for (const variant of ['guard', 'farmer', 'dead', 'stunned']) {
    const f = fixture(); f.game.evade.p = [0, 0, 0];
    const a = f.add({p: [0, 0, .9], face: 0, kind: variant === 'farmer' ? 'farmer' : 'nva', alive: variant !== 'dead'});
    a.face = undefined; a.state = 'pursuit'; a.seen = 1; a.sus = 1;
    if (variant === 'stunned') a.stunUntil = 100;
    f.run(3);
    assert.equal(f.captures(), variant === 'guard' ? 1 : 0, variant);
    assert.ok(Number.isFinite(a.face));
  }
});

test('wall-separated close guards cannot see or grab the player', () => {
  const f = fixture({boxes: [{x: 0, z: 0, hw: .04, hl: 5}]});
  f.game.evade.p = [.45, 0, 0];
  const a = f.add({p: [-.45, 0, 0], face: Math.PI / 2});
  f.run(3);
  assert.equal(f.captures(), 0); assert.equal(a.visible, false); assert.equal(a.grab, 0);
});

test('cell noise crosses walls as a remembered investigation, without sight or capture', () => {
  const f = fixture({stage: 'cell', boxes: [{x: 0, z: -3.5, hw: 3, hl: .08}]});
  f.game.evade.p = [0, 0, -2.5];
  const a = f.add({p: [0, 0, -4.9], face: Math.PI});
  f.AI.noise(f.game, [0, 0, -2.5], 1, 'tap'); f.run(.5);
  assert.equal(a.state, 'investigate'); assert.equal(a.seen, 0); assert.equal(a.visible, false);
  assert.deepEqual(toData(a.lastNoise), [0, 0, -2.5]);
  assert.deepEqual(toData(a.goal), [0, 0, -4.9]);
  assert.equal(f.game.pow.flags.inspection, true);
  f.game.evade.p = [2, 0, -1]; f.run(3);
  assert.deepEqual(toData(a.lastNoise), [0, 0, -2.5]); assert.equal(f.captures(), 0);
});

test('civilian flees and reports once to a nearby guard after a delay', () => {
  const f = fixture(); f.game.evade.p = [0, 0, 0];
  const farmer = f.add({p: [0, 0, 2], kind: 'farmer', face: 0}); farmer.sus = 1;
  const guard = f.add({p: [8, 0, 5], face: -Math.PI / 2});
  guard.senseAt = 100;
  f.run(2); assert.equal(farmer.state, 'flee'); assert.equal(farmer.reports || 0, 0);
  f.run(2); assert.equal(farmer.reports, 1); assert.equal(guard.state, 'investigate');
  assert.deepEqual(toData(guard.investigateOrigin), [0, 0, 0]);
  assert.ok(farmer.p[2] > 2); assert.equal(f.captures(), 0);
  f.run(3); assert.equal(farmer.reports, 1);
});

test('pursuit remembers the final sight point, searches, and deescalates without tracking hidden relocation', () => {
  const wall = {x: 4, z: 0, hw: .1, hl: 14, active: false};
  const f = fixture({boxes: [wall]}); f.game.evade.p = [3, 0, 0];
  const a = f.add({p: [0, 0, 0], face: Math.PI / 2}); a.sus = 1;
  f.run(.2); assert.equal(a.state, 'pursuit');
  wall.active = true; f.game.evade.p = [8, 0, 0]; f.run(1);
  assert.deepEqual(toData(a.goal), [3, 0, 0]);
  f.game.evade.p = [10, 0, 10]; f.run(3); assert.equal(a.state, 'search');
  assert.deepEqual(toData(a.searchOrigin), [3, 0, 0]);
  f.run(18); assert.equal(a.state, 'patrol'); assert.equal(a.seen, 0);
  f.game.evade.p = [a.p[0], 0, a.p[2] - .9]; a.sus = 1; f.run(.2);
  assert.equal(a.state, 'pursuit');
});

test('visible bodies trigger local awareness once; wall-hidden bodies do not', () => {
  for (const hidden of [false, true]) {
    const f = fixture({boxes: hidden ? [{x: 0, z: -2, hw: 6, hl: .08}] : []});
    const guard = f.add({p: [0, 0, 0], face: 0}); f.add({p: [0, 0, -4], alive: false});
    f.run(.3); assert.equal(!!f.game.pow.flags.bodyAlarm, !hidden);
    if (!hidden) { assert.equal(guard.noticedBodies.length, 1); f.run(3); assert.equal(guard.noticedBodies.length, 1); }
  }
});

test('paths and memory survive JSON roundtrip; planning retries and work stay bounded', () => {
  const f = fixture({boxes: [{x: 0, z: 0, hw: .1, hl: 30}]});
  const a = f.add({p: [-8, 0, 0], goal: [8, 0, 0]}); a.state = 'investigate'; a.investigateUntil = 100;
  f.run(2);
  assert.ok(a.planExpansions <= f.AI.limits.expansionsPerPath);
  assert.ok(a.planCount <= 2, 'unreachable goal uses retry backoff');
  const saved = toData(f.game); f.game.pow = saved.pow; f.game.evade = saved.evade;
  f.run(.5); assert.ok(Number.isFinite(f.game.evade.searchers[0].face));
  const restored = f.game.evade.searchers[0]; assert.equal(restored.state, 'investigate');
  // Restoring creates a new nav object; rebuild once, then measure cache reuse.
  f.AI.planPath(f.game, restored, [8, 0, 0]);
  const probeCount = f.probes(); f.AI.planPath(f.game, restored, [8, 0, 0]);
  assert.ok(f.probes() - probeCount < 100, 'static occupancy and edge probes are cached');
});

test('mobile simulation caps actor work and noise storage', () => {
  const f = fixture({mobile: true});
  for (let i = 0; i < 30; i++) { const a = f.add({p: [-10 + i / 3, 0, -10], goal: [10, 0, 10]}); a.state = 'investigate'; a.investigateUntil = 100; }
  for (let i = 0; i < 40; i++) f.AI.noise(f.game, [0, 0, 0], 1, 'event-' + i);
  f.run(.1);
  assert.ok(f.game.pow.noises.length <= 24);
  assert.ok(f.game.evade.searchers.filter(a => a.planCount).length <= 3);
  assert.ok(f.game.evade.searchers.slice(18).every(a => a.spd === 0 && a.seen === 0));
});

test('explicit AI snapshots restore serializable patrol memory and noise', () => {
  const f = fixture(); const a = f.add({p: [1, 0, 2]});
  a.state = 'search'; a.searchOrigin = [2, 0, 3]; a.searchUntil = 18; a.path = [[1, 0, 3], [2, 0, 3]];
  f.game.pow.aiClock = 4; f.game.pow.aiRoster = 'compound';
  f.AI.noise(f.game, [3, 0, 2], .8, 'step');
  const snapshot = toData(f.AI.snapshot(f.game));
  a.searchOrigin[0] = 90; f.game.evade.searchers = [];
  assert.equal(f.AI.restore(f.game, snapshot), true);
  assert.equal(f.game.pow.aiClock, 4);
  assert.deepEqual(toData(f.game.evade.searchers[0].searchOrigin), [2, 0, 3]);
  assert.equal(f.game.evade.searchers[0].state, 'search');
  assert.equal(f.game.pow.noises.length, 1);
  snapshot.stage = 'hanoi'; assert.equal(f.AI.restore(f.game, snapshot), false);
});

test('river observers retain their roster, remain on dry banks, and cannot see a submerged swimmer at range', () => {
  const f = fixture({stage: 'river', nav: {minX: 50, maxX: 140, minZ: -30, maxZ: 90, cell: 1}});
  f.game.pow.river = {waterY: 3, mode: 'float', daylight: .8, cover: 0, eyeHeight: .48, phase: 'stream'};
  f.game.pow.customMovement = true; f.game.evade.p = [94, 2.58, 0];
  const a = f.add({p: [71, 3.35, 0], face: Math.PI / 2}); a.riverNPC = true;
  f.AI.enter(f.game, 'river'); assert.equal(f.game.evade.searchers[0], a);
  a.sus = 1; f.run(7);
  assert.ok(a.p[0] < 79.2, 'guard stays on western dry bank');
  assert.ok(a.goal[0] <= 79.05, 'pursuit aims at own shoreline');
  f.game.evade.submerged = true; f.game.evade.p = [94, .9, 0]; f.run(.4);
  assert.equal(a.visible, false); assert.equal(f.captures(), 0);
});

test('elevated navigation requires floor support and never plans across open air', () => {
  const f = fixture(); f.P.floorY = (g, x, z) => Math.abs(x) <= 4 && Math.abs(z) <= 4 ? 3.4 : 0;
  const a = f.actor({p: [0, 3.4, 0]});
  assert.ok(f.AI.planPath(f.game, a, [3, 3.4, 0]).length > 0);
  assert.equal(f.AI.planPath(f.game, a, [11, 3.4, 0]).length, 0);
});

test('actual core compound waypoints and a full patrol round remain collision-safe, including the roof', () => {
  const sandbox = {window: {}, document: {getElementById: () => null}, Math, Number, Map, Set, WeakMap};
  const core = fs.readFileSync(path.join(__dirname, '../assets/pow/core.js'), 'utf8');
  vm.runInNewContext(core, sandbox, {filename: 'pow/core.js'});
  vm.runInNewContext(source, sandbox, {filename: 'pow/ai.js'});
  const P = sandbox.window.POW;
  P.activate = P.mountUI = P.updateUI = () => {};
  const game = {};
  P.begin(game, 'cell', {base: [0, 0, 0], stage: 'cell', flags: {}, inventory: {}});
  assert.equal(game.evade.searchers.length, 5);
  for (const a of game.evade.searchers) for (const q of a.route) assert.equal(P.blocked(game, q[0], q[2], .34, q[1]), false, a.id);
  const initial = game.evade.searchers.map(a => a.p.slice());
  for (let frame = 0; frame < 1000; frame++) {
    game.t = frame * .1; P.AI.step(game, .1);
    for (const a of game.evade.searchers) assert.equal(P.blocked(game, a.p[0], a.p[2], .32, a.p[1]), false, a.id + ' entered a wall');
    const roof = game.evade.searchers.find(a => a.id === 'roof-watch'); assert.ok(roof.p[1] >= 3.3, 'roof sentry never steps into open air');
  }
  assert.ok(game.evade.searchers.filter((a, i) => Math.hypot(a.p[0] - initial[i][0], a.p[2] - initial[i][2]) > 1).length >= 3,
    'several patrols must actually travel their clocked beats');
});

process.stdout.write(`${checks} deterministic POW AI simulation tests passed. Browser/GPU/iPhone behavior is not tested here.\n`);
