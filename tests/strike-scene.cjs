'use strict';
// Production terrain/mesh domain tests. These do not claim rendered GPU
// screenshots, Windows hardware or physical iPhone Safari validation.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../assets/flight/strike-scene.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(options = {}) {
  const window = {}, sandbox = { window, console, Math, Number, Float32Array, Uint16Array, Uint32Array };
  vm.createContext(sandbox);
  vm.runInContext(html.slice(html.indexOf('const TAU ='), html.indexOf('const GLSL_NOISE =')) + '\nwindow.terrain={terrainH,fbm,coastAt,TER};', sandbox);
  vm.runInContext(html.slice(html.indexOf('class MB {'), html.indexOf('/* ============================ Renderer')) + '\nwindow.MB=MB;', sandbox);
  vm.runInContext(source, sandbox);
  const T = window.terrain; T.TER.seed = ('m2'.charCodeAt(1) * 7.31) % 100; T.TER.mtn = 0;
  const F = window.FlightStrikeScene; F.configure({ ...T, MB: window.MB, ...options });
  const center = [-8200, T.terrainH(-8200, -1200), -1200];
  const targets = Array.from({ length: 5 }, (_, i) => { const x = center[0] + Math.sin(i * 2.4) * 120, z = center[2] + Math.cos(i * 2.4) * 120; return { kind: 'depot', p: [x, T.terrainH(x, z), z], yaw: i * .6, alive: true, hp: 55, hp0: 55, r: 15, burn: 0, mesh: 'bldg', label: 'SUPPLY DEPOT' }; });
  const game = { mis: { id: 'm2' }, strikeExperience: { stage: 'acquire' }, phase: 'attack', ac: { p: [-5000, 700, 1000], alive: true }, world: { t: 0, briefed: center, targets, score: { killed: 0, hits: 0, dropped: 0 }, fires: [], secs: [] } };
  return { F, T, game, window };
}

test('opt-in public landmarks use deterministic authored positions and qualified history', () => {
  const a = fixture(), b = fixture(), chart = a.F.chart(a.game);
  assert.deepEqual(clone(chart), clone(b.F.chart(b.game)));
  assert.match(chart.note, /Not a surveyed historical target map/);
  assert(chart.features.some(f => f.id === 'dixie-road-junction'));
  assert(chart.features.some(f => f.id === 'dixie-warehouse-row'));
  assert(chart.features.every(f => f.briefed && f.p.every(Number.isFinite)));
  assert(chart.features.every(f => !('targetId' in f) && !('confirmed' in f) && !('enemy' in f)));
});

test('scene and chart queries never move original targets, alter damage, score or world effects', () => {
  const { F, game } = fixture(), before = clone(game);
  F.chart(game); F.inspect(game); F.instances(game, game.world.briefed, 2, () => {});
  F.targetVisual(game, game.world.targets[0]); F.lights(game, game.world.briefed, 2);
  assert.deepEqual(clone(game), before);
});

test('chart and inspection return isolated copies, not mutable cached scene or target positions', () => {
  const { F, game } = fixture(), first = F.chart(game); first.center[0] = 123; first.features[0].p[0] = 123; first.features.length = 0;
  const view = F.inspect(game); view.items[0].p[0] = 123; view.targets[0].p[0] = 123;
  assert.notEqual(F.chart(game).center[0], 123); assert(F.chart(game).features.length >= 2);
  assert.notEqual(F.inspect(game).items[0].p[0], 123); assert.notEqual(F.inspect(game).targets[0].p[0], 123);
});

test('all scenery transforms are finite and remain a small bounded instanced workload', () => {
  const { F, game } = fixture(), s = F.inspect(game);
  assert(s.count > 40 && s.count <= F.limits.high);
  for (const item of s.items) {
    assert(item.mesh.startsWith('bnStrike')); assert(item.p.every(Number.isFinite)); assert(item.rot.every(Number.isFinite));
    assert(item.scale.every(n => Number.isFinite(n) && n > 0)); assert(item.tint.every(n => n >= 0 && n <= 3));
    assert(item.range <= F.limits.range);
  }
});

test('landmark foundations clear every terrain footprint sample and reach below the slopes', () => {
  const { F, T, game } = fixture();
  for (const item of F.inspect(game).items.filter(i => i.mesh !== 'bnStrikeRoad')) {
    const co = Math.cos(item.rot[0]), si = Math.sin(item.rot[0]); let hi = -Infinity;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const u = item.hx * i / 2, v = item.hz * j / 2;
      const h = Math.max(0, T.terrainH(item.p[0] + u * co - v * si, item.p[2] + u * si + v * co)); hi = Math.max(hi, h);
      assert(item.p[1] >= h); assert(item.p[1] - (item.mesh === 'bnStrikeTruck' ? 5 : 12) < h + .1, `${item.mesh} foundation must reach the actual terrain`);
    }
    assert(Math.abs(item.p[1] - hi - .06) < 1e-7);
  }
});

test('public junction lines coincide with the actual drawn road chain and clear terrain at centres', () => {
  const { F, T, game } = fixture(), s = F.inspect(game), c = F.chart(game), junction = c.features.find(f => f.id === 'dixie-road-junction');
  const roads = s.items.filter(i => i.mesh === 'bnStrikeRoad'); assert(roads.length >= 30);
  for (const road of roads) {
    assert(road.p[1] > T.terrainH(road.p[0], road.p[2])); assert(Math.abs(road.rot[1]) < .8 && Math.abs(road.rot[2]) < .8);
    const direction = [-Math.sin(road.rot[0]), Math.cos(road.rot[0])];
    const arms = [junction.points[0], junction.points[2], junction.points[4]];
    assert(arms.some(p => {
      const dx = p[0] - junction.p[0], dz = p[2] - junction.p[2], length = Math.hypot(dx, dz);
      const rx = road.p[0] - junction.p[0], rz = road.p[2] - junction.p[2], along = (rx * dx + rz * dz) / length;
      return Math.abs(rx * dz - rz * dx) / length < 1e-6 && along >= 0 && along <= length && Math.abs(direction[0] * dx + direction[1] * dz) / length > .999999;
    }), 'each visible road segment must lie on and follow one of the exact public chart arms');
  }
  assert(roads.some(i => Math.abs(i.rot[1]) > .01), 'road segments must follow real terrain slope rather than a flat hover plane');
});

test('riverbank landmark uses the real shader channel and only draws huts on its actual bank', () => {
  const { F, T, game } = fixture(), s = F.inspect(game), river = s.river;
  assert(river, 'fixture on production m2 terrain must find a nearby real channel');
  const rv = p => Math.abs(T.fbm(p[0] * .00006 + 3.7, p[2] * .00006 - 2.1, 3) - .5);
  assert(rv(river.p) <= .0035); assert(rv(river.bank) > .024);
  assert(T.terrainH(river.p[0], river.p[2]) < 155);
  assert(s.features.some(f => f.id === 'dixie-riverbank'));
});

test('missing or unsuitable river data never creates a fake water feature over dry land', () => {
  for (const option of [{ fbm: null }, { fbm: () => .1 }, { terrainH: () => 700 }]) {
    const { F, game } = fixture(option), s = F.inspect(game);
    assert.equal(s.river, null); assert(!s.features.some(f => f.kind === 'river'));
  }
});

test('real target visuals preserve the existing footprint and require actual World ownership', () => {
  const { F, game } = fixture(), target = game.world.targets[0], v = F.targetVisual(game, target);
  assert(v); assert.equal(v.mesh, 'bnStrikeDepot'); assert.equal(v.destroyed, false);
  assert.equal(v.p[0], target.p[0]); assert.equal(v.p[2], target.p[2]); assert.equal(v.rot[0], target.yaw);
  assert.deepEqual(clone(v.scale), [1, 1, 1]); assert.equal(target.r, 15);
  assert.equal(F.targetVisual(game, { ...target, p: target.p.slice() }), null);
  const other = { ...target, kind: 'bridge' }; game.world.targets.push(other); assert.equal(F.targetVisual(game, other), null);
});

test('ruins and ember lights require real destruction rather than impacts, flags or HP alone', () => {
  const { F, game } = fixture(), t = game.world.targets[0], eye = game.world.briefed;
  for (const change of [{ alive: true, hp: 55, burn: 1 }, { alive: false, hp: 55, burn: 1 }, { alive: true, hp: -1, burn: 1 }, { alive: false, hp: NaN, burn: 1 }, { alive: false, hp: '-1', burn: 1 }]) {
    Object.assign(t, change); assert.equal(F.targetVisual(game, t).mesh, 'bnStrikeDepot'); assert.equal(F.lights(game, eye, 2).length, 0);
    const draws = []; F.instances(game, eye, 2, (...args) => draws.push(args)); assert(!draws.some(d => d[0] === 'bnStrikeEmbers'));
  }
  Object.assign(t, { alive: false, hp: -2, burn: 1 });
  assert.equal(F.targetVisual(game, t).mesh, 'bnStrikeRuin'); assert.equal(F.lights(game, eye, 2).length, 1);
  t.burn = 0; assert.equal(F.targetVisual(game, t).mesh, 'bnStrikeRuin'); assert.equal(F.lights(game, eye, 2).length, 0);
  t.alive = true; t.hp = 55; assert.equal(F.targetVisual(game, t).mesh, 'bnStrikeDepot');
});

test('aftermath lights and embers are bounded, spatially culled and use the existing World clock', () => {
  const { F, game } = fixture(), before = clone(game.world.score);
  for (const t of game.world.targets) Object.assign(t, { alive: false, hp: -1, burn: 1 });
  assert.equal(F.lights(game, game.world.briefed, 0).length, 1); assert.equal(F.lights(game, game.world.briefed, 2).length, 2);
  const lights = F.lights(game, game.world.briefed, 2); lights[0][5][0] = 0; assert.equal(F.lights(game, game.world.briefed, 2)[0][5][0], 1);
  assert.equal(F.lights(game, [90000, 700, 90000], 2).length, 0);
  const emitted = []; F.instances(game, game.world.briefed, 2, (...a) => emitted.push(a));
  assert(emitted.filter(d => d[0] === 'bnStrikeEmbers').length > 0); assert(emitted.length <= F.limits.high);
  assert.equal(game.world.t, 0); assert.deepEqual(clone(game.world.score), before); assert.equal(game.world.secs.length, 0);
});

test('draw culling and quality budgets limit instances without changing target state', () => {
  const { F, game } = fixture(), before = clone(game);
  for (const q of [0, 1, 2]) { const calls = []; const n = F.instances(game, game.world.briefed, q, (...a) => calls.push(a)); assert.equal(n, calls.length); assert(n > 30); assert(n <= [72, 108, 132][q]); }
  assert.equal(F.instances(game, [90000, 700, 90000], 2, () => assert.fail('culled')), 0);
  assert.deepEqual(clone(game), before);
});

test('ordinary m2, all other missions and out-of-aircraft modes retain original visuals', () => {
  const edits = [g => delete g.strikeExperience, g => { g.mis.id = 'm3'; }, g => { g.mis.id = 'willard'; }, g => { g.pow = {}; }, g => { g.chute = {}; }, g => { g.evade = {}; }, g => { g.result = {}; }, g => { g.phase = 'done'; }, g => { g.ac.outOfAircraft = true; }, g => { g.ac.alive = false; }];
  for (const edit of edits) { const { F, game } = fixture(); edit(game); assert.equal(F.active(game), false); assert.equal(F.instances(game, game.world.briefed, 2, () => assert.fail('inactive')), 0); assert.equal(F.lights(game, game.world.briefed, 2).length, 0); assert.equal(F.targetVisual(game, game.world.targets[0]), null); }
});

test('steep or unresolved target footprints fall back safely to the existing target model', () => {
  const { F, game } = fixture({ terrainH: (x, z) => 80 + (x + 8200) * 4 });
  assert.equal(F.targetVisual(game, game.world.targets[0]), null);
});

test('production meshes have finite attributes, valid triangles and outward-facing pitched roofs', () => {
  const { F } = fixture(), built = {}, renderer = { meshes: {}, meshFromBuilder: (name, mb) => { built[name] = mb; renderer.meshes[name] = {}; } };
  assert(F.ensureMeshes(renderer)); assert.equal(Object.keys(built).length, 7);
  let total = 0;
  for (const [name, m] of Object.entries(built)) { assert(m.p.length > 0, name); assert.equal(m.p.length, m.c.length); assert.equal(m.p.length, m.n.length); assert(m.p.every(Number.isFinite)); assert(m.n.every(Number.isFinite)); assert(m.i.every(i => Number.isInteger(i) && i >= 0 && i < m.p.length / 3)); total += m.p.length / 3; }
  assert(total < 6500);
  const depot = built.bnStrikeDepot; assert(Math.max(...depot.p.filter((_, i) => i % 3 === 0)) <= 9.8); assert(Math.max(...depot.p.filter((_, i) => i % 3 === 2)) <= 15.8);
  // Foundation+wall = 48 vertices; both sloping roof quads follow them.
  for (let i = 48; i < 56; i++) assert(depot.n[i * 3 + 1] > 0, 'a roof must face the aircraft above, not be culled as an underside');
});

test('mesh setup is idempotent and supports a fresh renderer after context restoration', () => {
  const { F } = fixture(); let count = 0;
  const make = () => { const r = { meshes: {}, meshFromBuilder: name => { count++; r.meshes[name] = {}; } }; return r; };
  const r = make(); assert(F.ensureMeshes(r)); assert.equal(count, 7); assert(F.ensureMeshes(r)); assert.equal(count, 7);
  assert(F.ensureMeshes(make())); assert.equal(count, 14); assert.equal(F.ensureMeshes(null), false);
});
