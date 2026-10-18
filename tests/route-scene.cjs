'use strict';
// Pure scene/terrain/mesh checks using the production terrain and MB. These
// checks do not claim actual WebGL output, physical iPhone or Windows testing.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../assets/flight/route-scene.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(options = {}) {
  const window = {}, store = new Map(), sandbox = { window, console, Math, Number, Float32Array, Uint16Array, Uint32Array };
  vm.createContext(sandbox);
  vm.runInContext(html.slice(html.indexOf('const TAU ='), html.indexOf('const GLSL_NOISE =')) + '\nwindow.terrain={terrainH,coastAt,fbm,TER};', sandbox);
  vm.runInContext(html.slice(html.indexOf('class MB {'), html.indexOf('/* ============================ Renderer')) + '\nwindow.MB=MB;', sandbox);
  vm.runInContext(source, sandbox);
  const T = window.terrain; T.TER.seed = (('willard'.charCodeAt(1) * 7.31) % 100); T.TER.mtn = 0;
  const Store = { get: (key, fallback) => store.has(key) ? store.get(key) : fallback, set: (key, value) => store.set(key, value) };
  const F = window.FlightRouteScene; F.configure({ ...T, MB: window.MB, Store, ...options });
  const game = { mis: { id: 'willard', willard: true }, ac: { p: [-65000, 700, 18000] }, atm: { night: true }, willard: { route: { strike: [-65000, T.terrainH(-65000, 14000), 14000], plan: [-52000, 950, -10000], flak: [-34000, 900, -14000], safe: [T.coastAt(-14000) + 36000, 1100, -14000] } }, world: { targets: [{ alive: true, hp: 100, p: [-65000, 90, 14000] }], scenery: [], score: { total: 1 } } };
  return { F, T, game, store, sandbox };
}

test('authored route landmarks are deterministic, public and historically qualified', () => {
  const a = fixture(), b = fixture(), ca = a.F.chart(a.game), cb = b.F.chart(b.game);
  assert.deepEqual(clone(ca), clone(cb)); assert(ca.features.length >= 4);
  assert.match(ca.note, /not a surveyed map/); assert.match(ca.note, /1960s/);
  assert(ca.features.every(f => f.briefed === true && f.p.every(Number.isFinite)));
  assert(ca.features.some(f => f.id === 'rail-sidings')); assert(ca.features.some(f => f.id === 'three-way-junction'));
  assert(ca.features.some(f => f.id === 'twin-stacks')); assert(ca.features.some(f => f.id === 'coastal-hamlet'));
  assert(ca.features.every(f => !('enemy' in f) && !('targetId' in f) && !('confirmed' in f)));
});

test('chart and diagnostics return copies without exposing mutable scene or mission state', () => {
  const { F, game } = fixture(), before = clone(game), a = F.chart(game); a.features[0].p[0] = 99; a.features.length = 0;
  const b = F.inspect(game); b.items[0].p[0] = 99; b.features[0].label = 'changed';
  assert(F.chart(game).features.length >= 4); assert.notEqual(F.inspect(game).items[0].p[0], 99);
  assert.notEqual(F.chart(game).features[0].label, 'changed'); assert.deepEqual(clone(game), before);
});

test('every authored scene item has finite transforms, bounded tint and positive scale', () => {
  const { F, game } = fixture(), s = F.inspect(game);
  assert(s.count > 70 && s.count < 220);
  for (const item of s.items) {
    assert.equal(item.p.length, 3); assert(item.p.every(Number.isFinite)); assert(item.rot.every(Number.isFinite));
    assert(item.scale.every(n => Number.isFinite(n) && n > 0)); assert(item.tint.every(n => Number.isFinite(n) && n >= 0 && n <= 3));
    assert(item.range <= F.limits.range); assert(item.m.startsWith('bnRoute'));
  }
});

test('buildings sit on sampled terrain with foundations reaching every footprint sample', () => {
  const { F, T, game } = fixture();
  for (const item of F.inspect(game).items.filter(i => i.m === 'bnRouteHouse' || i.m === 'bnRouteFactory')) {
    const factory = item.m === 'bnRouteFactory', hx = factory ? 26 : 9, hz = factory ? 38 : 14;
    const ca = Math.cos(item.rot[0]), sa = Math.sin(item.rot[0]); let top = 0;
    for (const u of [-hx, 0, hx]) for (const v of [-hz, 0, hz]) {
      const x = item.p[0] + u * item.scale[0] * ca - v * item.scale[2] * sa;
      const z = item.p[2] + u * item.scale[0] * sa + v * item.scale[2] * ca;
      const h = Math.max(0, T.terrainH(x, z)); top = Math.max(top, h);
      assert(item.p[1] >= h, 'foundation top must not put the building through a hill');
      assert(item.p[1] - (factory ? 9 : 8) * item.scale[1] < h + .5, 'foundation must reach the terrain rather than float');
    }
    assert(Math.abs(item.p[1] - top - .08) < 1e-7);
  }
});

test('bridge crosses the real lowland channel and its deck clears the sampled surface', () => {
  const { F, T, game } = fixture(), s = F.inspect(game), r = s.river;
  assert(r, 'production Willard terrain must provide an actual nearby crossing');
  const rv = Math.abs(T.fbm(r.p[0] * .00006 + 3.7, r.p[2] * .00006 - 2.1, 3) - .5);
  assert(rv < .019); assert(r.channel >= .82); assert(T.terrainH(r.p[0], r.p[2]) < 155); assert(r.length < 1300);
  for (let i = 0; i <= 32; i++) {
    const f = i / 32, x = r.p0[0] + (r.p1[0] - r.p0[0]) * f, z = r.p0[2] + (r.p1[2] - r.p0[2]) * f;
    assert(r.p[1] > T.terrainH(x, z), 'bridge cannot be buried in intermediate terrain');
  }
  const segments = s.items.filter(i => i.m === 'bnRouteBridge'); assert(segments.length > 2);
  const dx = -Math.sin(r.yaw), dz = Math.cos(r.yaw), line = [r.p1[0] - r.p0[0], r.p1[2] - r.p0[2]];
  assert((dx * line[0] + dz * line[1]) / Math.hypot(...line) > .99999, 'bridge local Z must follow its world span');
  for (const pier of s.items.filter(i => i.m === 'bnRoutePier')) assert(Math.abs(pier.p[1] + 12 * pier.scale[1] - r.p[1]) < 1e-7);
});

test('missing or unsuitable channel data never creates a fake river feature or bridge', () => {
  for (const override of [{ fbm: null }, { fbm: () => .1 }, { terrainH: () => 500 }]) {
    const { F, game } = fixture(override), s = F.inspect(game);
    assert.equal(s.river, null); assert(!s.items.some(i => i.m === 'bnRouteBridge'));
    assert(!s.features.some(f => f.id === 'river-crossing'));
  }
});

test('rail and road instances follow their actual transformed longitudinal axes', () => {
  const { F, game } = fixture(), items = F.inspect(game).items;
  const rails = items.filter(i => i.m === 'bnRouteRail').slice(0, 25);
  for (let i = 1; i < rails.length; i++) {
    const a = rails[i - 1], b = rails[i], dx = b.p[0] - a.p[0], dz = b.p[2] - a.p[2];
    assert(Math.abs(Math.hypot(dx, dz) - 24) < 1e-7);
    assert((-Math.sin(a.rot[0]) * dx + Math.cos(a.rot[0]) * dz) > 23.99);
  }
  const roads = items.filter(i => i.m === 'bnRouteRoad');
  for (let arm = 0; arm < 3; arm++) for (let i = 1; i < 10; i++) {
    const a = roads[arm * 10 + i - 1], b = roads[arm * 10 + i];
    assert((-Math.sin(a.rot[0]) * (b.p[0] - a.p[0]) + Math.cos(a.rot[0]) * (b.p[2] - a.p[2])) > 22.99);
  }
});

test('parked wagon wheels align with their siding rather than slide beside the track', () => {
  const { F, game } = fixture(), wagons = F.inspect(game).items.filter(i => i.m === 'bnRouteWagon');
  assert.equal(wagons.length, 7);
  for (let i = 0; i < wagons.length; i++) {
    const w = wagons[i], base = [-65000 + (i % 2 ? 186 : 160), 14000 + (i % 2 ? 60 : 0)], yaw = w.rot[0];
    const dx = w.p[0] - base[0], dz = w.p[2] - base[1];
    assert(Math.abs(Math.cos(yaw) * dx + Math.sin(yaw) * dz) < 1e-7, 'wagon must share the centreline of the actual track');
  }
});

test('road centre surfaces clear the original terrain and follow finite slopes', () => {
  const { F, T, game } = fixture(), roads = F.inspect(game).items.filter(i => i.m === 'bnRouteRoad');
  assert.equal(roads.length, 30); assert(roads.some(i => Math.abs(i.rot[1]) > .01));
  for (const r of roads) { assert(r.p[1] > T.terrainH(r.p[0], r.p[2])); assert(Math.abs(r.rot[1]) < .8 && Math.abs(r.rot[2]) < .8); }
});

test('distance culling and quality budgets prioritize nearby actual instances', () => {
  const { F, game } = fixture(), eye = [-65000, 800, 14000];
  for (const q of [0, 1, 2]) {
    const calls = [], n = F.instances(game, eye, q, (...args) => calls.push(args));
    assert.equal(n, calls.length); assert(n > 25); assert(n <= [120, 190, 220][q]);
    const dist = p => Math.hypot(p[0] - eye[0], p[2] - eye[2]);
    assert(calls.every(c => dist(c[1]) < 12500));
    assert(calls.every((c, i) => i === 0 || dist(calls[i - 1][1]) <= dist(c[1]) + 1e-7));
  }
  assert.equal(F.instances(game, [400000, 1000, 400000], 2, () => assert.fail('out-of-range draw')), 0);
});

test('warm point lights use bounded original renderer slots and are copied per call', () => {
  const { F, game } = fixture(), eye = [-65000, 800, 14000], lamps = F.lights(game, eye, 0);
  assert(lamps.length > 0 && lamps.length <= 2);
  for (const l of lamps) { assert.equal(l.length, 6); assert(l.slice(0, 5).every(Number.isFinite)); assert(l[4] <= 30); assert(l[5][0] > l[5][2]); }
  lamps[0][5][0] = 0; assert.equal(F.lights(game, eye, 2)[0][5][0], 1);
  assert(F.lights(game, eye, 2).length <= 3); assert.equal(F.lights(game, [400000, 1000, 400000], 2).length, 0);
});

test('night contrast is a readable fresh atmosphere copy, without changing original arrays', () => {
  const { F, game } = fixture(), base = { night: true, amb: [.14, .17, .30], gnd: [.10, .10, .12], sunCol: [.35, .42, .72], sunDir: [.4, .6, .4], horizon: [.04, .06, .10], zenith: [.008, .013, .028], exposure: 2.8, fogDens: .00002 };
  const before = clone(base), next = F.atmosphere(game, base);
  assert.notEqual(next, base); assert.deepEqual(clone(base), before); assert.equal(next.nightContrast, 1);
  assert(next.exposure > 2 && next.exposure < base.exposure); assert(next.amb.every((n, i) => n >= .014 && n < base.amb[i]));
  assert.equal(next.fogDens, base.fogDens); next.sunDir[0] = 0; assert.equal(base.sunDir[0], .4);
});

test('visibility is clamped, persisted and changes only presentation brightness', () => {
  const { F, game, store } = fixture(), before = clone(game), base = { night: true, amb: [.14, .17, .30], sunCol: [.35, .42, .72], exposure: 2.8 };
  assert.equal(F.getVisibility(), .55); F.setVisibility(-1); const low = F.atmosphere(game, base);
  assert.equal(F.getVisibility(), 0); F.setVisibility(7); const high = F.atmosphere(game, base);
  assert.equal(F.getVisibility(), 1); assert(high.exposure > low.exposure); assert(high.amb[0] > low.amb[0]);
  assert.equal(store.get('flight_night_visibility'), 1); F.setVisibility('invalid'); assert.equal(F.getVisibility(), 1);
  assert.deepEqual(clone(game), before);
});

test('all preexisting missions, daylight, POW, ejection and ground scenes remain unchanged', () => {
  const edits = [g => { g.mis.willard = false; }, g => { g.atm.night = false; }, g => { g.pow = {}; }, g => { g.evade = {}; }, g => { g.chute = {}; }, g => { g.ac.onDeck = true; }, g => { g.ac.outOfAircraft = true; }, g => { delete g.willard; }];
  for (const edit of edits) {
    const { F, game } = fixture(), base = { night: true, amb: [.14, .17, .3], exposure: 2.8 }; edit(game);
    assert.equal(F.atmosphere(game, base), base); assert.equal(F.instances(game, [-65000, 500, 14000], 2, () => assert.fail('inactive draw')), 0);
    assert.equal(F.lights(game, [-65000, 500, 14000], 2).length, 0);
  }
});

test('procedural meshes have finite production vertices, valid indices and bounded geometry', () => {
  const { F } = fixture(), built = {}, renderer = { meshes: {}, meshFromBuilder: (name, mb) => { built[name] = mb; renderer.meshes[name] = { valid: true }; } };
  assert(F.ensureMeshes(renderer)); assert.equal(Object.keys(built).length, 9);
  let vertices = 0;
  for (const [name, mb] of Object.entries(built)) {
    assert(mb.p.length > 0, name); assert.equal(mb.p.length, mb.n.length); assert.equal(mb.p.length, mb.c.length);
    assert(mb.p.every(Number.isFinite)); assert(mb.n.every(Number.isFinite)); assert(mb.c.every(Number.isFinite));
    assert(mb.i.every(n => Number.isInteger(n) && n >= 0 && n < mb.p.length / 3)); vertices += mb.p.length / 3;
  }
  assert(vertices < 6000, 'route meshes must remain inexpensive enough for the original instanced renderer');
});

test('mesh creation is idempotent and reconstructs meshes for restored WebGL renderers', () => {
  const { F } = fixture(); let count = 0;
  const make = () => { const r = { meshes: {}, meshFromBuilder: name => { count++; r.meshes[name] = {}; } }; return r; };
  const first = make(); assert(F.ensureMeshes(first)); assert.equal(count, 9); assert(F.ensureMeshes(first)); assert.equal(count, 9);
  const recovered = make(); assert(F.ensureMeshes(recovered)); assert.equal(count, 18); assert(F.ensureMeshes(recovered)); assert.equal(count, 18);
  assert.equal(F.ensureMeshes(null), false);
});
