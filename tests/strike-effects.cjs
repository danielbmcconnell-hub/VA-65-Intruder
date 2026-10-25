'use strict';
// Domain and real World/FX checks. Actual WebGL visibility is checked by the
// browser suite; these checks do not claim physical iPhone or Windows testing.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../assets/flight/strike-effects.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function fixture(quality = 1) {
  const window = {}, sandbox = { window, console, Math, TAU: Math.PI * 2, PI: Math.PI, DEG: Math.PI / 180,
    RAD: 180 / Math.PI, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), rnd: (a, b) => a + (b - a) * .5,
    vdist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    vsub: (a, b) => a.map((v, i) => v - b[i]), vadd: (a, b) => a.map((v, i) => v + b[i]), vmul: (a, n) => a.map(v => v * n),
    vlen: a => Math.hypot(...a), vnorm: a => { const n = Math.hypot(...a) || 1; return a.map(v => v / n); }, terrainH: () => 0,
    vdist2: (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  // Real World projectiles now call the isolated cosmetic trail module.
  // Load that production dependency rather than replacing its emitter.
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/flight/threat-feedback.js'), 'utf8'), sandbox);
  sandbox.FlightThreatFeedback = window.FlightThreatFeedback;
  vm.runInContext(html.slice(html.indexOf('class FX {'), html.indexOf('const AC =')) + '\nwindow.ActualFX = FX;', sandbox);
  const FX = window.ActualFX, calls = [], fx = { add: [], smk: [] };
  for (const name of ['smoke', 'glow', 'streak']) fx[name] = (...args) => { calls.push({ name, args }); (name === 'smoke' ? fx.smk : fx.add).push({ args }); };
  const world = { t: 0, rend: { quality }, fx, targets: [], fires: [], secs: [], score: { killed: 0, hits: 0, misses: 0 } };
  return { E: window.FlightStrikeEffects, world, calls, FX, sandbox, window };
}
function target(f, kind = 'pol', p = [12, 10, -20], r = 11) {
  const t = { kind, p: p.slice(), r, alive: false, hp: 0, hp0: 45, burn: 1 };
  f.world.targets.push(t); return t;
}
const copy = v => JSON.parse(JSON.stringify(v));
function advance(f, seconds, eye = [0, 80, 100], interval = .05) {
  for (let i = 0; i < Math.ceil(seconds / interval); i++) { f.world.t += interval; f.E.step(f.world, interval, { eye }); }
}

test('primary visual origins use real impact position, copied arrays and no damage/score writes', () => {
  const f = fixture(), t = target(f), p = [100, 3, 40], before = copy({ targets: f.world.targets, score: f.world.score });
  const id = f.E.impact(f.world, p, 1.6, { weapon: 'bomb', surface: 'land' }); p[0] = -100;
  assert.equal(typeof id, 'number'); assert.deepEqual(copy(f.E.inspect(f.world).flashes[0].p), [100, 3, 40]);
  assert.deepEqual(copy({ targets: f.world.targets, score: f.world.score }), before);
  assert.equal(f.world.secs.length, 0, 'ground impact alone cannot invent a target cook-off');
  assert.equal(t.burn, 1); assert(f.calls.some(v => v.name === 'smoke' && v.args[0][1] > 20));
});

test('invalid/flak events cannot create target-looking strike effects', () => {
  const f = fixture();
  for (const p of [[NaN, 0, 0], [0, Infinity, 0], null, [1, 2]]) assert.equal(f.E.impact(f.world, p, 1.6), null);
  assert.equal(f.E.impact(f.world, [0, 0, 0], 0), null);
  assert.equal(f.E.impact(f.world, [0, 0, 0], 1.6, { weapon: 'flak' }), null);
  assert.equal(f.E.inspect(f.world).flashes.length, 0); assert.equal(f.calls.length, 0);
});

test('water miss produces brief pale spray, no sustained ground column or cook-off', () => {
  const f = fixture(); f.E.impact(f.world, [0, 0, 0], 1.6, { weapon: 'bomb', surface: 'water' });
  assert.equal(f.world.secs.length, 0); assert.equal(f.E.inspect(f.world).targets.length, 0);
  assert(f.calls.length > 0); assert(f.calls.every(v => v.name === 'smoke' && v.args[1][2] > .7 && v.args[3] <= 1.4));
});

test('an airborne ARM detonation does not throw earth or grow a ground-anchored column', () => {
  const f = fixture(); f.E.impact(f.world, [200, 600, -100], 1.9, { weapon: 'arm', surface: 'air' });
  assert.equal(f.world.secs.length, 0); assert(f.calls.length > 0);
  assert(f.calls.every(v => v.name === 'smoke' && v.args[0][0] === 200 && v.args[3] <= 4 && v.args[4][1] <= 2));
});

test('only actual destroyed members of the target roster may schedule secondaries', () => {
  const f = fixture(), t = target(f); t.alive = true; assert.equal(f.E.destroyed(f.world, t), false);
  t.alive = false; t.hp = 1; assert.equal(f.E.destroyed(f.world, t), false);
  t.hp = NaN; assert.equal(f.E.destroyed(f.world, t), false);
  t.hp = 0; assert.equal(f.E.destroyed(f.world, { ...t }), false);
  assert.equal(f.world.secs.length, 0); assert.equal(f.E.destroyed(f.world, t), true); assert.equal(f.world.secs.length, 7);
});

test('one destroyed target schedules exactly once even after repeated impacts or callbacks', () => {
  const f = fixture(), t = target(f); assert(f.E.destroyed(f.world, t)); const queued = copy(f.world.secs);
  for (let i = 0; i < 20; i++) { f.E.impact(f.world, t.p, 1.6); assert.equal(f.E.destroyed(f.world, t), false); }
  assert.deepEqual(copy(f.world.secs), queued); assert.equal(f.E.inspect(f.world).targets.length, 1);
});

test('fuel, ammunition, vehicles and launchers have distinct deterministic cook-off cadence', () => {
  const expected = { pol: 7, depot: 4, trucks: 3, rail: 2, launcher: 3, boat: 1, contacts: 1, bridge: 0, radar: 0, concrete: 0 };
  for (const [kind, count] of Object.entries(expected)) {
    const a = fixture(), b = fixture(); a.world.t = b.world.t = 30;
    const ta = target(a, kind), tb = target(b, kind); a.E.destroyed(a.world, ta); b.E.destroyed(b.world, tb);
    assert.equal(a.world.secs.length, count, kind); assert.deepEqual(copy(a.world.secs), copy(b.world.secs), kind + ' deterministic');
    for (const q of a.world.secs) { assert(q.at > 30); assert.equal(q.strikeVisual.kind, kind); assert(q.mag > 0); }
    for (let i = 1; i < count; i++) assert(a.world.secs[i].at > a.world.secs[i - 1].at, kind + ' timed progression');
  }
});

test('cook-off origins remain within actual target footprint and have no damage payload', () => {
  const f = fixture(), t = target(f, 'depot', [500, 62, -800], 15); f.E.destroyed(f.world, t);
  for (const q of f.world.secs) {
    assert(Math.hypot(q.p[0] - t.p[0], q.p[2] - t.p[2]) < t.r);
    assert(q.p[1] >= 63 && q.p[1] <= 65); assert.equal(q.dmg, undefined); assert.equal(q.rad, undefined);
  }
});

test('actual scheduled secondary must be due and is visually augmented once', () => {
  const f = fixture(), t = target(f, 'depot'); f.E.destroyed(f.world, t); const queued = f.world.secs[0];
  assert.equal(f.E.secondary(f.world, queued), false); assert.equal(f.calls.length, 0);
  f.world.t = queued.at; assert(f.E.secondary(f.world, queued)); assert(f.calls.some(v => v.name === 'streak'));
  const n = f.calls.length; assert.equal(f.E.secondary(f.world, queued), false); assert.equal(f.calls.length, n);
  assert.equal(f.E.inspect(f.world).flashes[0].source, 'secondary');
});

test('unowned legacy queue entries cannot invent new strike-specific flash records', () => {
  const f = fixture(); f.world.t = 5;
  assert.equal(f.E.secondary(f.world, { p: [0, 0, 0], at: 4, mag: 1 }), false); assert.equal(f.calls.length, 0);
});

test('invented metadata or copied queue entries cannot impersonate an actual scheduled cook-off', () => {
  const f = fixture(); f.E.destroyed(f.world, target(f)); const queued = f.world.secs[0]; f.world.t = 20;
  assert.equal(f.E.secondary(f.world, copy(queued)), false);
  assert.equal(f.E.secondary(f.world, { p: [0, 0, 0], at: 0, mag: 3, strikeVisual: { kind: 'pol', targetId: 1 } }), false);
  assert.equal(f.calls.length, 0); assert(f.E.secondary(f.world, queued));
});

test('persistent black fuel smoke differs from temporary bridge concrete dust', () => {
  const fuel = fixture(), bridge = fixture(); fuel.E.destroyed(fuel.world, target(fuel, 'pol'));
  bridge.E.destroyed(bridge.world, target(bridge, 'bridge', [12, 10, -20], 46)); advance(fuel, 6); advance(bridge, 6);
  assert(fuel.calls.some(v => v.args[1][0] < .1 && v.args[0][1] >= 48));
  assert(bridge.calls.some(v => v.args[1][0] > .2 && v.args[0][1] <= 21));
  assert.equal(bridge.world.secs.length, 0); advance(bridge, 8); assert.equal(bridge.E.inspect(bridge.world).targets.length, 0);
  assert.equal(fuel.E.inspect(fuel.world).targets.length, 1);
});

test('burn expiry and target restoration retire aftermath without modifying target', () => {
  const f = fixture(), t = target(f); f.E.destroyed(f.world, t); advance(f, 2); t.burn = 0;
  const before = copy(t); advance(f, 1); assert.deepEqual(copy(t), before); assert.equal(f.E.inspect(f.world).targets.length, 0);
  const g = fixture(), other = target(g); g.E.destroyed(g.world, other); other.alive = true; advance(g, 1);
  assert.equal(g.E.inspect(g.world).targets.length, 0);
});

test('zero/invalid timestep does not advance visuals while paused', () => {
  const f = fixture(); f.E.destroyed(f.world, target(f)); f.E.impact(f.world, [0, 0, 0], 1.6); const before = copy(f.E.inspect(f.world));
  for (const dt of [0, -1, NaN, Infinity]) f.E.step(f.world, dt, { eye: [0, 0, 0] });
  assert.deepEqual(copy(f.E.inspect(f.world)), before);
});

test('close, medium and far visibility reduce emission without cancelling genuine queues', () => {
  const close = fixture(), medium = fixture(), far = fixture();
  for (const f of [close, medium, far]) f.E.destroyed(f.world, target(f));
  advance(close, 10, [12, 50, 150]); advance(medium, 10, [12, 50, 9000]); advance(far, 10, [12, 50, 20000]);
  assert(close.calls.length > medium.calls.length); assert(medium.calls.length > 0); assert.equal(far.calls.length, 0);
  assert.equal(far.world.secs.length, 7, 'visibility LOD does not cancel real secondary scheduler');
});

test('low quality particle, aftermath, flash and queue budgets remain bounded during a mass strike', () => {
  const f = fixture(0);
  for (let i = 0; i < 200; i++) { f.E.destroyed(f.world, target(f, 'pol', [i * 2, 0, 0])); f.E.impact(f.world, [i * 2, 0, 0], 1.6); }
  const view = f.E.inspect(f.world); assert(view.emitted <= 48); assert.equal(view.targets.length, 24); assert.equal(view.flashes.length, 32);
  assert.equal(f.world.secs.length, 128); advance(f, 30); assert(f.world.fx.smk.length <= 620); assert(f.world.fx.add.length <= 1100);
});

test('suspended-tab large timestep catches up at most two plumes per tracked target', () => {
  const f = fixture(); f.E.destroyed(f.world, target(f)); f.world.t = 35; f.E.step(f.world, 35, { eye: [0, 50, 0] });
  assert(f.calls.length <= 2); assert.equal(f.world.secs.length, 7);
});

test('flash lights expire, choose nearby visible sources and preserve original fire arrays', () => {
  const f = fixture(0); f.world.fires = [[10, 4, -20, .8, 47, [1, .46, .13]], [200, 4, -20, .7]]; const before = copy(f.world.fires);
  for (let i = 0; i < 20; i++) f.E.impact(f.world, [i * 100, 3, -20], 1.6);
  const lit = f.E.lights(f.world, [0, 5, -20], 0); assert.equal(lit.length, 4); assert(lit[0][0] < 150);
  assert.deepEqual(copy(f.world.fires), before); lit[0][0] = 9000;
  const fireCopy = lit.find(v => v[5] && v[5][1] === .46); if (fireCopy) fireCopy[5][1] = 0;
  assert.deepEqual(copy(f.world.fires), before);
  f.world.t = 2; assert.equal(f.E.lights(f.world, [0, 5, 0], 1).length, 2);
});

test('ejection clears transient flashes with a frozen world clock while retaining fires, FX, smoke tracks, queues and score', () => {
  const f = fixture(), t = target(f); f.world.fx = new f.FX();
  f.world.fires = [[12, 16, -20, .8, 47, [1, .46, .13]]];
  f.E.destroyed(f.world, t); f.E.impact(f.world, [12, 10, -20], 1.6); advance(f, 2);
  const due = f.world.secs[0]; f.world.t = due.at; assert(f.E.secondary(f.world, due));
  const before = copy({ fires: f.world.fires, add: f.world.fx.add, smoke: f.world.fx.smk, targets: f.world.targets,
    tracks: f.E.inspect(f.world).targets, secs: f.world.secs, score: f.world.score, time: f.world.t, emitted: f.E.inspect(f.world).emitted });
  const originals = { fires: f.world.fires, add: f.world.fx.add, smoke: f.world.fx.smk, targets: f.world.targets, secs: f.world.secs, score: f.world.score };
  assert(f.E.lights(f.world, [12, 80, 0], 1).length > f.world.fires.length);
  f.E.clearTransient(f.world); f.E.clearTransient(f.world); // Idempotent every non-flight update.
  assert.equal(f.E.inspect(f.world).flashes.length, 0);
  assert.deepEqual(copy(f.E.lights(f.world, [12, 80, 0], 1)), copy(f.world.fires));
  assert.deepEqual(copy({ fires: f.world.fires, add: f.world.fx.add, smoke: f.world.fx.smk, targets: f.world.targets,
    tracks: f.E.inspect(f.world).targets, secs: f.world.secs, score: f.world.score, time: f.world.t, emitted: f.E.inspect(f.world).emitted }), before);
  for (const [name, object] of Object.entries(originals)) {
    const actual = name === 'add' ? f.world.fx.add : name === 'smoke' ? f.world.fx.smk : f.world[name]; assert.equal(actual, object, name + ' array/object identity retained');
  }
  assert.equal(f.E.destroyed(f.world, t), false, 'transient cleanup must preserve once-only target identity');
  f.world.t = f.world.secs[1].at; assert(f.E.secondary(f.world, f.world.secs[1]), 'pending genuine cook-offs retain registration');
  f.E.clearTransient(f.world); assert.equal(f.E.inspect(f.world).flashes.length, 0);
});

test('mission reseat clears visual identity and permits the same genuine target to be destroyed in a new sortie', () => {
  const f = fixture(), t = target(f); f.E.destroyed(f.world, t); f.E.clear(f.world); f.world.secs = [];
  assert.equal(f.E.inspect(f.world).targets.length, 0); assert(f.E.destroyed(f.world, t)); assert.equal(f.world.secs.length, 7);
});

test('snapshot inspection is read-only and cannot teleport an effect or alter a target', () => {
  const f = fixture(), t = target(f); f.E.destroyed(f.world, t); const snap = f.E.inspect(f.world); snap.targets[0].p[0] = 12345; snap.targets.length = 0;
  assert.equal(f.E.inspect(f.world).targets.length, 1); assert.equal(f.E.inspect(f.world).targets[0].p[0], t.p[0]);
});

test('the unchanged real FX engine evolves supplementary smoke with finite particles', () => {
  const f = fixture(); f.world.fx = new f.FX(); f.E.impact(f.world, [0, 3, 0], 1.6); f.E.destroyed(f.world, target(f));
  for (let i = 0; i < 100; i++) { f.world.t += .05; f.E.step(f.world, .05, { eye: [0, 50, 100] }); f.world.fx.step(.05); }
  assert(f.world.fx.smk.length > 0);
  for (const particle of [...f.world.fx.smk, ...f.world.fx.add]) {
    assert(particle.p.every(Number.isFinite)); assert(Number.isFinite(particle.s)); assert(particle.a >= 0 && particle.a <= 1);
  }
});

test('actual World impact damage produces one fuel aftermath while a real nearby miss does not', () => {
  const f = fixture(); vm.runInContext(html.slice(html.indexOf('class World {'), html.indexOf('const Chart =')) + '\nwindow.ActualWorld = World;', f.sandbox);
  f.sandbox.FlightStrikeEffects = f.E;
  const w = Object.assign(Object.create(f.window.ActualWorld.prototype), f.world, { fx: new f.FX(), threats: [], sites: [], designated: null, score: { killed: 0, hits: 0, misses: 0, cep: [] } });
  const t = { kind: 'pol', p: [100, 10, -100], hp: 45, hp0: 45, r: 11, alive: true, burn: 0 }; w.targets = [t];
  w.detonate([300, 10, -100], 1.6, 45, 80); assert(t.alive); assert.equal(w.score.misses, 1); assert.equal(w.secs.length, 0);
  w.detonate(t.p.slice(), 1.6, 45, 80); assert.equal(t.alive, false); assert.equal(w.score.killed, 1); assert.equal(w.score.hits, 1);
  // Require the production World path, rather than a manually fired callback.
  assert.equal(f.E.inspect(w).targets.length, 1); assert.equal(w.secs.length, 7);
  const count = w.secs.length; w.detonate(t.p.slice(), 1.6, 45, 80); assert.equal(w.secs.length, count); assert.equal(w.score.killed, 1);
  w.t = .1; w.stepSecondaries({ p: [100, 100, 50], yaw: 0 }); assert.equal(w.secs.length, 7);
  const first = Math.min(...w.secs.map(q => q.at)); w.t = first + 1e-5;
  const before = copy(w.score); w.stepSecondaries({ p: [100, 100, 50], yaw: 0 });
  assert.equal(w.secs.length, 6); assert.equal(f.E.inspect(w).flashes.filter(q => q.source === 'secondary').length, 1);
  assert.deepEqual(copy(w.score), before, 'real secondary scheduler adds FX/sound without damage or score inflation');
});

test('actual ARM projectile impact retains radar damage and creates the ARM primary without a fuel cook-off', () => {
  const f = fixture(); vm.runInContext(html.slice(html.indexOf('class World {'), html.indexOf('const Chart =')) + '\nwindow.ActualWorld = World;', f.sandbox);
  f.sandbox.FlightStrikeEffects = f.E;
  const w = Object.assign(Object.create(f.window.ActualWorld.prototype), f.world, { fx: new f.FX(), bombs: [], sams: [], threats: [], sites: [],
    designated: null, score: { killed: 0, hits: 0, misses: 0, cep: [] } });
  const radar = { kind: 'radar', p: [40, 10, 20], hp: 40, hp0: 40, r: 12, alive: true, burn: 0, emitting: true };
  w.radar = radar; w.targets = [radar]; w.arms = [{ p: [40, 10, 25], v: [0, 0, -40], t: 0, aim: radar.p.slice(), mem: radar.p.slice() }];
  w._weapons(.01, { p: [40, 100, 100], v: [0, 0, -50] });
  assert.equal(w.arms.length, 0); assert.equal(radar.alive, false); assert.equal(w.score.killed, 1); assert.equal(w.secs.length, 0);
  assert.equal(f.E.inspect(w).flashes.filter(v => v.source === 'arm').length, 1); assert.equal(f.E.inspect(w).targets[0].kind, 'radar');
});
