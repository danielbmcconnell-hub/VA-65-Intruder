'use strict';
// Production route/acquisition code in a Node VM. Terrain, gun positions and
// DOM below are explicit domain fixtures, not a rendered or human-flown sortie.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const base = path.join(__dirname, '..'), source = fs.readFileSync(path.join(base, 'assets/flight/tactical-approach.js'), 'utf8');
const clone = v => JSON.parse(JSON.stringify(v));
function fixture(options = {}) {
  let calls = 0, terrain = options.terrain || (() => 0); const nodes = new Map();
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.hidden = false; }
    set id(v) { this._id = v; nodes.set(v, this); } get id() { return this._id; }
    setAttribute(k, v) { this[k] = String(v); } append(...v) { this.children.push(...v); }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    blur() { this.blurred = (this.blurred || 0) + 1; }
    querySelector(s) { return s === '.dixie-actions' ? this.actions : null; }
  }
  const document = { createElement: () => new Element(), getElementById: id => nodes.get(id) || null };
  const host = new Element(); host.id = 'dixiePanel'; host.actions = new Element();
  const window = { WillardPresentation: { bindButton(n, fn) { n.action = fn; } }, FlightStrikeBoard: { snapshot: () => ({ open: false }) } };
  const sandbox = { window, document, console, Math, Number, setTimeout() { throw Error('No owned timers'); }, setInterval() { throw Error('No owned intervals'); } };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const ac = { p: [0, 700, 18000], v: [0, 0, -160], radalt: 700, yaw: 0, alive: true, onDeck: false, bombs: 12, crew: { pilot: 1, bn: 1 } };
  const gun = { p: [0, 0, 0], type: 'aaaL', rng: 12000, alt: 1800, alive: true, cool: 0 };
  const world = { t: 0, threats: [gun], route: [{ p: [0, 0, 12000], label: 'COAST-IN' }, { p: [0, 0, 7000], label: 'CHECKPOINT' }, { p: [0, 0, 2000], label: 'INITIAL POINT' }],
    rtIdx: 0, nav: { fixes: 0, ex: 140, ez: -80 }, carrier: { p: [0, 19, 18000] }, ipoint: [0, 0, 2000], briefed: [0, 0, 0], targets: [{ p: [0, 0, 0], hp: 55 }], score: { damage: 0, killed: 0 }, bombs: [] };
  const game = { mis: { id: 'm2', env: { fog: .28 } }, world, ac, strikeExperience: {}, phase: 'airborne', rightSeat: true, steer: null, apAGL: 700, result: null, paused: false };
  const App = { game, screen: 'game', graphicsContextLost: false }; game.app = App;
  const F = window.FlightTacticalApproach; F.configure({ App, terrainH: (x, z) => { calls++; return terrain(x, z); }, coastAt: () => 6000 });
  F.begin(game); calls = 0;
  function advance(seconds, dt = .05) {
    let permitted = false;
    for (let remaining = seconds; remaining > 1e-8;) { const step = Math.min(dt, remaining); remaining -= step; world.t += step; permitted = F.gate(world, gun, ac, step); F.tick(game, step); }
    return permitted;
  }
  function action(id) { const n = nodes.get(id); assert(n && n.action, id + ' bound'); n.action({ stopPropagation() {} }); }
  return { F, game, world, ac, gun, App, window, sandbox, nodes, advance, action, terrain: fn => terrain = fn, calls: () => calls, clearCalls: () => calls = 0 };
}
const untouched = g => clone({ ac: g.ac, targets: g.world.targets, score: g.world.score, route: g.world.route, nav: g.world.nav, rtIdx: g.world.rtIdx });

test('optional tactical startup leaves the original aircraft, chart fixes, navigation error and score untouched', () => {
  const f = fixture(), before = untouched(f.game); f.F.begin(f.game); assert.deepEqual(untouched(f.game), before);
  assert.equal(f.F.inspect(f.game).following, false); assert.equal(f.game.steer, null); assert.equal(f.game.apAGL, 700);
  assert.equal(f.world._tacticalGame, f.game);
  assert(!Object.keys(f.world).includes('_tacticalGame')); assert.doesNotThrow(() => JSON.stringify(f.world));
});
test('unrelated and ordinary missions retain their original firing permission and have no route state', () => {
  for (const change of [g => g.mis.id = 'm3', g => delete g.strikeExperience]) {
    const f = fixture(); change(f.game); assert.equal(f.F.begin(f.game), false); assert.equal(f.F.gate(f.world, f.gun, f.ac, .1), true); assert.equal(f.F.inspect(f.game), null);
  }
  const f = fixture(); assert.equal(f.F.gate({ threats: [f.gun] }, f.gun, f.ac, .1), true);
});
test('the lower route uses real surveyed doglegs and retains every original chart checkpoint', () => {
  const f = fixture({ terrain: x => x > 500 ? 900 : 20 }), r = f.F.routes(f.game);
  assert.equal(r.direct.points.length, 3); assert.equal(r.terrain.points.length, 5);
  assert(r.terrain.length > r.direct.length + 1200); assert.equal(r.direct.clearance, 700); assert.equal(r.terrain.clearance, 320);
  assert(r.terrain.points.filter(p => p.label.startsWith('LOW')).every(p => p.p[0] < -1000));
  for (const fix of f.world.route) assert(r.terrain.points.some(p => p.label === fix.label && JSON.stringify(p.p) === JSON.stringify(fix.p)));
  assert.equal(r.direct.maxTerrain, 20); assert.equal(r.terrain.maxTerrain, 20);
});
test('choosing a route commands only the original pilot steer and clearance, without moving or repairing anything', () => {
  const f = fixture(), before = untouched(f.game); assert(f.F.choose(f.game, 'terrain'));
  assert.equal(f.game.apAGL, 320); assert.equal(f.game.steer, 0); assert.equal(f.F.inspect(f.game).following, true);
  assert.deepEqual(untouched(f.game), before); assert.equal(f.game.result, null);
  const view = f.F.inspect(f.game); assert.equal(view.next.label, 'COAST-IN'); assert.equal(view.next.distance, 6000);
});
test('the original pilot gets the next real terrain corner as the aircraft reaches a fix, without auto-awarding a radar fix', () => {
  const f = fixture(); f.F.choose(f.game, 'terrain'); f.ac.p = [0, 700, 12200]; f.F.tick(f.game, .1);
  const v = f.F.inspect(f.game); assert.equal(v.leg, 1); assert.match(v.next.label, /LOW TERRAIN CORNER/); assert.notEqual(f.game.steer, 0);
  assert.equal(f.world.nav.fixes, 0); assert.equal(f.world.rtIdx, 0); assert.equal(f.world.nav.ex, 140);
});
test('public route and inspection readbacks are detached and contain no hidden target identity or success result', () => {
  const f = fixture(), r = f.F.routes(f.game), v = f.F.inspect(f.game); r.direct.points[0].p[0] = 999; v.route.points[0].p[0] = 999;
  assert.equal(f.F.routes(f.game).direct.points[0].p[0], 0); assert.equal(v.targetId, undefined); assert.equal(v.result, undefined);
});
test('a native alternative steer overrides route following rather than being overwritten every frame', () => {
  const f = fixture(); f.F.choose(f.game, 'terrain'); f.game.steer += 5 * Math.PI / 180;
  const h = f.game.steer; f.F.tick(f.game, .1); assert.equal(f.F.inspect(f.game).following, false); assert.equal(f.game.steer, h); assert.match(f.F.inspect(f.game).status, /overrides/);
});
test('designation and carrier-return intent hand the original pilot back its attack/recovery, never a synthetic win', () => {
  for (const mode of ['designation', 'home']) { const f = fixture(); f.F.choose(f.game, 'terrain');
    if (mode === 'designation') f.world.designated = f.world.targets[0]; else f.game.egressCalled = true;
    const before = untouched(f.game); f.F.tick(f.game, .1); assert.equal(f.F.inspect(f.game).following, false); assert.deepEqual(untouched(f.game), before);
    if (mode === 'designation') assert.equal(f.game.apAGL, 700);
    assert.equal(f.F.choose(f.game, 'direct'), false); assert.equal(f.game.result, null);
  }
});
test('completing the route opens target acquisition without choosing a target or issuing any mission award', () => {
  const f = fixture(); f.F.choose(f.game, 'direct'); const points = f.F.routes(f.game).direct.points;
  for (const p of points) { f.ac.p = [p.p[0], 700, p.p[2]]; f.F.tick(f.game, .1); }
  assert.equal(f.F.inspect(f.game).following, false); assert.equal(f.F.inspect(f.game).next, null); assert.equal(f.game.apAGL, 700);
  assert.equal(f.world.designated, undefined); assert.equal(f.world.score.killed, 0); assert.equal(f.world.nav.fixes, 0);
});
test('visible aircraft require sustained acquisition before the original gun is permitted to fire', () => {
  const f = fixture(); f.ac.p = [0, 700, 6000]; const before = untouched(f.game);
  assert.equal(f.advance(.6), false); assert.equal(f.F.inspect(f.game).guns[0].mode, 'acquire');
  assert.equal(f.advance(1), true); assert.equal(f.F.inspect(f.game).guns[0].mode, 'track');
  assert.deepEqual(untouched(f.game), before); assert.equal(f.world.score.damage, 0);
});
test('intervening terrain prevents acquisition and every permitted burst needs fresh unobstructed sight', () => {
  const f = fixture(); f.ac.p = [0, 700, 6000]; assert(f.advance(2));
  f.terrain((x, z) => z > 2500 && z < 3500 ? 900 : 0); f.world.t += .01;
  assert.equal(f.F.gate(f.world, f.gun, f.ac, .01), false); const v = f.F.inspect(f.game).guns[0]; assert.equal(v.mode, 'search'); assert.equal(v.visible, false);
  assert.equal(f.advance(1), false); assert.equal(f.F.inspect(f.game).guns[0].mode, 'search');
});
test('the first acquisition burst checks current terrain even if contact was visible at the previous cadence', () => {
  const f = fixture(); f.ac.p = [0, 700, 6000]; f.advance(1.30, .05);
  const state = f.game.strikeExperience.tactical.guns[0]; assert.equal(state.mode, 'acquire');
  f.terrain(() => 1000); f.world.t += .03;
  assert.equal(f.F.gate(f.world, f.gun, f.ac, .03), false); assert.equal(state.mode, 'search');
});
test('last-known search does not follow an aircraft hidden behind terrain and eventually expires', () => {
  const f = fixture(); f.ac.p = [0, 700, 6000]; f.advance(2); const seen = clone(f.F.inspect(f.game).guns[0].lastPosition);
  f.terrain(() => 1000); f.ac.p = [700, 700, 6000]; f.advance(1);
  assert.deepEqual(clone(f.F.inspect(f.game).guns[0].lastPosition), seen); assert.equal(f.F.inspect(f.game).guns[0].mode, 'search');
  f.advance(4); const v = f.F.inspect(f.game).guns[0]; assert.equal(v.mode, 'unaware'); assert.equal(v.confidence, 0); assert.equal(v.lastPosition, null);
});
test('a gun that lost contact must reacquire after the player reappears, instead of instantly firing', () => {
  const f = fixture(); f.ac.p = [0, 700, 6000]; f.advance(2); f.terrain(() => 1000); f.advance(5); f.terrain(() => 0);
  assert.equal(f.advance(.5), false); assert.equal(f.F.inspect(f.game).guns[0].mode, 'acquire'); assert(f.advance(1.2));
});
test('terrain sampling is capped at twelve samples per check and four Hz while a gun is acquiring or cooling', () => {
  const f = fixture(); f.ac.p = [0, 700, 6000]; f.gun.cool = 10;
  f.clearCalls(); f.advance(.20, .01); assert.equal(f.calls(), 12);
  f.clearCalls(); f.advance(1, .01); assert(f.calls() <= 48); assert.equal(f.F.limits.samples, 12);
});
test('close, low and out-of-envelope aircraft cannot become magical targets through invalid geometry', () => {
  for (const change of [f => f.ac.radalt = 10, f => f.ac.radalt = 2200, f => f.ac.p = [0, 700, 15000], f => f.gun.alive = false, f => f.ac.p[0] = NaN]) {
    const f = fixture(); f.ac.p = [0, 700, 6000]; change(f); assert.equal(f.advance(3), false); assert.equal(f.F.inspect(f.game).guns[0].confidence, 0);
  }
});
test('acquisition time is stable at desktop and low mobile update rates', () => {
  const results = [1 / 60, 1 / 30, .1].map(dt => { const f = fixture(); f.ac.p = [0, 700, 6000]; f.advance(1, dt); return f.F.inspect(f.game).guns[0].confidence; });
  assert(Math.max(...results) - Math.min(...results) < 1e-10); assert(results.every(n => n > .6 && n < .85));
});
test('pause, retired games, hidden screens, context loss, defeat and ejection freeze tactical state and suppress fire', () => {
  for (const change of [f => f.game.paused = true, f => f.App.game = {}, f => f.App.screen = 'ready', f => f.App.graphicsContextLost = true,
    f => f.game.result = { pass: true }, f => f.ac.alive = false, f => f.game.ejected = true, f => f.game.pow = {}]) {
    const f = fixture(); f.ac.p = [0, 700, 6000]; f.advance(.5); change(f); const before = clone(f.game.strikeExperience.tactical);
    assert.equal(f.F.gate(f.world, f.gun, f.ac, 10), false); f.F.tick(f.game, 10); assert.equal(f.F.choose(f.game, 'terrain'), false); assert.equal(f.F.steer(f.game), false);
    assert.deepEqual(clone(f.game.strikeExperience.tactical), before);
  }
});
test('route native controls use the shared touch binding and blur focus so paired keyboard consent stays available', () => {
  const f = fixture(); f.action('dixieApproach'); assert.equal(f.nodes.get('dixieApproachPanel').hidden, false);
  f.action('dixieRouteTerrain'); assert.equal(f.F.inspect(f.game).choice, 'terrain'); assert.equal(f.F.inspect(f.game).following, true);
  assert.equal(f.nodes.get('dixieApproachPanel').hidden, true); assert.equal(f.nodes.get('dixieRouteTerrain').blurred, 1);
  f.action('dixieRouteFree'); assert.equal(f.F.inspect(f.game).following, false);
});
test('valid persistent route and gun state survive a detached JSON round-trip and malformed old state is safely replaced', () => {
  const f = fixture(); f.F.choose(f.game, 'terrain'); f.ac.p = [0, 700, 6000]; f.advance(.8);
  const saved = clone(f.game.strikeExperience.tactical); f.game.strikeExperience.tactical = clone(saved); assert(f.F.begin(f.game));
  assert.deepEqual(clone(f.game.strikeExperience.tactical), saved);
  f.game.strikeExperience.tactical.guns[0].lastPosition = [NaN, 0, 0]; assert(f.F.begin(f.game)); assert.equal(f.F.inspect(f.game).choice, 'direct');
  assert.equal(f.F.inspect(f.game).guns[0].confidence, 0);
});

test('the real strict production checkpoint accepts tactical state and restores it into a newly generated world', () => {
  // Reuse only the preexisting production-World fixture definition, not its
  // tests. Its terrain/damage/aircraft declarations are explicit test fixtures.
  const helper = fs.readFileSync(path.join(__dirname, 'strike-checkpoint.cjs'), 'utf8');
  const start = helper.indexOf('function fixture(seed=17){'), end = helper.indexOf('\ntest(', start);
  const html = fs.readFileSync(path.join(base, 'index.html'), 'utf8'), checkpoint = fs.readFileSync(path.join(base, 'assets/flight/strike-checkpoint.js'), 'utf8');
  const sandbox = { console, Math, Number, Float32Array, Map, vm, html, src: checkpoint }; vm.createContext(sandbox);
  vm.runInContext(helper.slice(start, end) + '\nglobalThis.productionFixture=fixture;', sandbox);
  const f = sandbox.productionFixture(), FWindow = f.sandbox.window;
  vm.runInContext(source, f.sandbox); const F = FWindow.FlightTacticalApproach;
  F.configure({ terrainH: () => 40 }); assert(F.begin(f.game)); assert(F.choose(f.game, 'terrain'));
  const saved = f.C.capture(f.game, 'approach'); assert(saved, 'new approach/gun fields must pass the real checkpoint whitelist');
  assert(f.C.valid(saved)); const fresh = sandbox.productionFixture(811);
  assert(fresh.C.restore(fresh.game, saved));
  vm.runInContext(source, fresh.sandbox); fresh.sandbox.window.FlightTacticalApproach.configure({ terrainH: () => 40 });
  assert(fresh.sandbox.window.FlightTacticalApproach.begin(fresh.game));
  assert.deepEqual(clone(fresh.game.strikeExperience.tactical), clone(f.game.strikeExperience.tactical));
  assert.equal(fresh.world._tacticalGame, fresh.game); assert.equal(fresh.ac.fuel, f.ac.fuel); assert.equal(fresh.world.score.damage, f.world.score.damage);
});
