'use strict';
// Real POW collision and real mental-project rules. These domain checks do not
// replace the separate Chromium/WebGL or physical-device tests.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const window = {}, sandbox = vm.createContext({ window, console, Date });
  for (const name of ['core', 'captivity', 'mindscape']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pow/' + name + '.js'), 'utf8'), sandbox);
  const P = window.POW, store = new Map(), notices = [];
  P.notify = (game, text) => notices.push(text); P.updateUI = () => {};
  P.ctx = { Store: { set: (key, value) => store.set(key, clone(value)) } };
  const game = { pow: { stage: 'solitary', base: [100, 20, 300], day: 1, time: 5, difficulty: 'normal', intensity: 'standard', flags: {}, inventory: {}, stats: { physical: 75, fatigue: 15, resilience: 65, morale: 65, memory: 60, hope: 60 }, solids: [], surfaces: [], objects: [] }, evade: { p: [100, 20, 300], hdg: .4, look: -.2, pitchCmd: -.2, searchers: [], locals: [] }, campGeo: [], app: { keys: {}, gctl: {}, set: { sound: 0 }, audio: {} }, setHour() {} };
  const C = P.Captivity; C.enter(game);
  const rawSave = P.save;
  P.save = g => {
    const out = rawSave(g); if (P.Mindscape.active(g)) P.Mindscape.physicalSnapshot(g, out);
    store.set('pow_checkpoint', clone(out)); return out;
  };
  return { P, C, M: P.Mindscape, game, store, notices, c: game.pow.captivity, s: game.pow };
}
function walk(f, target) {
  const e = f.game.evade, s = f.game.pow;
  for (let n = 0; n < 400 && Math.hypot(e.p[0] - target[0], e.p[2] - target[1]) > .09; n++) {
    const distance = Math.hypot(e.p[0] - target[0], e.p[2] - target[1]);
    e.hdg = Math.atan2(target[0] - e.p[0], -(target[1] - e.p[2]));
    s.input = { forward: 1 }; f.M.tick(f.game, Math.min(.05, distance / 2.4));
  }
  assert.ok(Math.hypot(e.p[0] - target[0], e.p[2] - target[1]) <= .10, 'physical movement reaches the clear waypoint');
  s.input = {};
}
function approach(f, id) {
  const s = f.game.pow, e = f.game.evade, o = s.objects.find(q => q.id === id);
  assert.ok(o, 'live 3D object exists: ' + id);
  const goal = [o.p[0], o.p[2] + 1], step = .5, origin = [s.base[0], s.base[2]];
  const toCell = p => [Math.round((p[0] - origin[0]) / step), Math.round((p[1] - origin[1]) / step)];
  const start = toCell([e.p[0], e.p[2]]), end = toCell(goal), key = p => p.join(',');
  const queue = [start], parent = new Map([[key(start), null]]);
  while (queue.length) {
    const here = queue.shift(); if (key(here) === key(end)) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = [here[0] + dx, here[1] + dz], x = origin[0] + q[0] * step, z = origin[1] + q[1] * step;
      if (parent.has(key(q)) || Math.abs(q[0]) > 25 || Math.abs(q[1]) > 32 || f.P.blocked(f.game, x, z, .27, f.P.floorY(f.game, x, z, e.p[1]))) continue;
      parent.set(key(q), here); queue.push(q);
    }
  }
  assert.ok(parent.has(key(end)), 'a walkable route reaches ' + id);
  const route = []; for (let q = end; q; q = parent.get(key(q))) route.push(q);
  for (const q of route.reverse()) walk(f, [origin[0] + q[0] * step, origin[1] + q[1] * step]);
  walk(f, goal); e.hdg = Math.atan2(o.p[0] - e.p[0], -(o.p[2] - e.p[2]));
  return s.objects.find(q => q.id === id);
}
function use(f, id) {
  approach(f, id); f.s.input = { interact: false }; f.M.tick(f.game, .05);
  f.s.input = { interact: true }; f.M.tick(f.game, .1); f.M.tick(f.game, .1);
  f.s.input = {}; f.M.tick(f.game, .05);
}
test('only a living prisoner can enter an imagined scene; active rest and unsupported kinds preserve the cell', () => {
  const f = fixture(), e = f.game.evade, geo = f.game.campGeo;
  assert.equal(f.M.open(f.game, 'unknown'), false); assert.equal(f.game.evade, e); assert.equal(f.game.campGeo, geo);
  f.s.stage = 'river'; assert.equal(f.M.open(f.game, 'car'), false); f.s.stage = 'solitary';
  f.c.sleeping = { type: 'rest' }; assert.equal(f.M.open(f.game, 'car'), false); f.c.sleeping = null;
  assert.equal(f.M.open(f.game, 'car'), true); assert.equal(f.c.open, false); assert.equal(f.s.stage, 'solitary');
});
test('closing atomically restores the exact physical scene, actor, lighting and cell orientation', () => {
  const f = fixture(), s = f.s, e = f.game.evade, p = e.p.slice(), solids = s.solids, objects = s.objects, surfaces = s.surfaces, lights = s.lights, geo = f.game.campGeo, base = s.base;
  f.M.open(f.game, 'car'); assert.notEqual(f.game.evade, e); assert.equal(s.base[1], base[1] + 30);
  f.game.app.keys.KeyW = 1; s.touchInteract = true; f.game.evade.p[0] += 1;
  assert.equal(f.M.close(f.game), true);
  assert.equal(f.game.evade, e); assert.deepEqual(Array.from(e.p), Array.from(p)); assert.equal(s.base, base);
  assert.equal(s.solids, solids); assert.equal(s.objects, objects); assert.equal(s.surfaces, surfaces); assert.equal(s.lights, lights); assert.equal(f.game.campGeo, geo);
  assert.equal(f.game.app.keys.KeyW, 0); assert.equal(s.touchInteract, false); assert.equal(f.M.active(f.game), false);
});
test('mental checkpoint saves original physical coordinates and guard memory, while preserving accepted assembly', () => {
  const f = fixture(), p = f.game.evade.p.slice(), base = f.s.base.slice(), hdg = f.game.evade.hdg;
  const guards = { nodes: [{ id: 'corridor', seen: false }], alarm: .2 }; f.P.AI = { snapshot: () => guards };
  f.M.open(f.game, 'car'); use(f, 'mind-car-block');
  const snap = f.P.save(f.game); assert.deepEqual(Array.from(snap.p), Array.from(p)); assert.deepEqual(Array.from(snap.base), Array.from(base));
  assert.equal(snap.hdg, hdg); assert.equal(snap.stage, 'solitary'); assert.deepEqual(clone(snap.ai), guards);
  assert.deepEqual(Array.from(snap.captivity.car.installed), ['block']); assert.equal(snap.mindscape, undefined);
});
test('shared swept collision blocks imagined walls and central engine, with no physical fatigue or noise from walking', () => {
  const f = fixture(); f.M.open(f.game, 'car'); const e = f.game.evade, stats = clone(f.s.stats), elapsed = f.c.elapsedMinutes;
  f.P.move(f.game, e, 50, 0, .25); assert.ok(e.p[0] <= f.s.base[0] + 8.14);
  f.P.move(f.game, e, -100, 0, .25); assert.ok(e.p[0] >= f.s.base[0] - 8.14);
  assert.equal(f.M.interact(f.game, 'mind-car-block'), false, 'far-away components cannot be selected');
  f.s.input = { forward: 1, run: true }; for (let i = 0; i < 30; i++) f.M.tick(f.game, .1);
  assert.deepEqual(clone(f.s.stats), stats); assert.equal(f.s.noise, 0); assert.equal(f.c.elapsedMinutes, elapsed);
});
test('actual component stations enforce dependencies; all assembly, four strokes and memory jobs complete the real car challenge', () => {
  const f = fixture(); f.M.open(f.game, 'car'); use(f, 'mind-car-pistons'); assert.equal(f.c.car.installed.length, 0);
  for (const part of f.C.data.car) use(f, 'mind-car-' + part.id);
  assert.equal(f.c.car.phase, 'cycle'); assert.equal(f.c.car.installed.length, 10);
  use(f, 'mind-stroke-power'); assert.equal(f.c.car.recall.length, 0);
  for (const stroke of ['intake', 'compression', 'power', 'exhaust']) use(f, 'mind-stroke-' + stroke);
  assert.equal(f.c.car.phase, 'recall'); const targets = f.c.car.targets.slice();
  for (const part of targets) use(f, 'mind-car-' + part);
  assert.equal(f.c.car.round, 2); assert.equal(f.M.progress(f.game).completions.car, 1);
  assert.equal(f.M.progress(f.game).completedCar.installed.length, 10); assert.equal(f.c.rewards.car, f.s.day);
  assert.ok(f.game.campGeo.some(q => q.id.includes('assembled-ignition'))); assert.ok(f.s.stats.memory > 60);
});
test('a release is required between physical holds and incomplete holds do not fit components', () => {
  const f = fixture(); f.M.open(f.game, 'car'); approach(f, 'mind-car-block');
  f.s.input = { interact: true }; f.M.tick(f.game, .1); assert.equal(f.c.car.installed.length, 0);
  f.M.tick(f.game, .1); assert.deepEqual(Array.from(f.c.car.installed), ['block']);
  const minutes = f.c.elapsedMinutes; for (let i = 0; i < 8; i++) f.M.tick(f.game, .1); assert.equal(f.c.elapsedMinutes, minutes);
});
test('imagined house is generated from constrained decisions, includes an accessible doorway and grounded foundation', () => {
  const f = fixture(); f.M.open(f.game, 'architecture'); use(f, 'mind-house-timber'); assert.equal(f.c.architecture.stage, 0);
  for (const id of ['concrete', 'timber', 'pitched', 'gravity', 'conduit', 'clear']) use(f, 'mind-house-' + id);
  assert.equal(f.c.architecture.round, 2); assert.equal(f.M.progress(f.game).completions.architecture, 1);
  const choices = f.M.progress(f.game).completedHouse.choices; assert.equal(choices.furniture, 'clear'); assert.equal(choices.foundation, 'concrete');
  assert.ok(f.game.campGeo.some(q => q.id === 'mind:house-mattress')); assert.ok(f.game.campGeo.some(q => q.id === 'mind:conduit'));
  const b = f.s.base; walk(f, [b[0] + 2, b[2] + 1]); walk(f, [b[0], b[2] + 1]); walk(f, [b[0], b[2] - 3]);
  assert.ok(Math.abs(f.game.evade.p[1] - (b[1] + .16)) < 1e-7, 'the remembered foundation is the actual walked floor');
  walk(f, [b[0] - 2.1, b[2] - 5]);
  f.P.move(f.game, f.game.evade, -10, 0, .25);
  assert.ok(f.game.evade.p[0] > b[0] - 3.75 && f.game.evade.p[0] < b[0] - 3.2, 'a clear aisle reaches the side wall rather than stopping at the sink');
});
test('city land uses render real collision and require street/service validation before progression', () => {
  const f = fixture(); f.M.open(f.game, 'city'); use(f, 'mind-city-survey'); assert.equal(f.c.city.round, 1);
  const plan = [[5, 'water'], [9, 'utility'], [16, 'housing'], [18, 'housing'], [22, 'school'], [17, 'park'], [12, 'stop']];
  for (const [index, tool] of plan) { f.c.city.tool = tool; f.M.rebuild(f.game); use(f, 'mind-city-' + index); }
  assert.deepEqual(Array.from(f.C.cityErrors(f.c.city, false)), []); use(f, 'mind-city-survey');
  assert.equal(f.c.city.round, 2); assert.equal(f.M.progress(f.game).completions.city, 1);
  assert.equal(f.M.progress(f.game).completedCity.grid[16], 'housing'); assert.ok(f.s.solids.some(q => q.id === 'mind:building-16'));
  assert.ok(f.game.campGeo.some(q => q.id === 'mind:water-tank-5'));
});
test('all three imagined scenes use bounded finite geometry and no copied photograph or NPC replacements', () => {
  const f = fixture();
  for (const kind of f.M.data.kinds) {
    assert.equal(f.M.open(f.game, kind), true); assert.ok(f.game.campGeo.length < 500, kind + ' bounded mobile geometry');
    assert.ok(f.game.campGeo.every(q => q.p.concat(q.scale, q.t).every(Number.isFinite)));
    assert.deepEqual(Array.from(f.game.evade.searchers), []); assert.ok(f.s.objects.every(q => q.mindscape));
    assert.ok(f.game.campGeo.every(q => q.m.startsWith('pow'))); f.M.close(f.game);
  }
});
test('switching projects and saving completed work preserves the same physical checkpoint and real progression', () => {
  const f = fixture(), e = f.game.evade, p = e.p.slice(), objects = f.s.objects;
  f.M.open(f.game, 'car'); use(f, 'mind-car-block'); f.M.open(f.game, 'architecture');
  assert.deepEqual(Array.from(f.M.physicalSnapshot(f.game, {}).p), Array.from(p)); assert.deepEqual(Array.from(f.c.car.installed), ['block']);
  f.M.close(f.game); assert.equal(f.game.evade, e); assert.equal(f.s.objects, objects);
  const saved = f.store.get('pow_checkpoint'); assert.deepEqual(saved.p, Array.from(p)); assert.deepEqual(saved.captivity.car.installed, ['block']);
});
