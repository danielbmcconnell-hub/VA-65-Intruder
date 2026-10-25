'use strict';
// Production module and real FX/World/Game method bodies, in declared flat
// terrain fixtures. Native renderer/UI coverage is intentionally separate.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), code = fs.readFileSync(path.join(root, 'assets/flight/threat-feedback.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const part = (a, b) => { const start = html.indexOf(a), end = html.indexOf(b, start); assert.ok(start >= 0 && end > start); return html.slice(start, end); };
const fxCode = part('class FX {', '/* ------------------------- aircraft');
const weaponsCode = part('  _weapons(dt, ac) {', '  detonate(p, scale, rad, dmg, weapon) {');
const launchCode = part('  launchSam(site, ac) {', '  hitAircraft(ac, sev, src, position) {');
const postCode = part('  postUpdate(dt) {', '  /* ---- carrier:');
const copy = x => JSON.parse(JSON.stringify(x));
function fixture({ forbidRandom = true } = {}) {
  let randomCalls = 0;
  const math = Object.create(Math); math.random = () => { randomCalls++; if (forbidRandom) throw Error('Cosmetic presentation consumed gameplay RNG'); return .5; };
  const add = (a, b) => a.map((n, i) => n + b[i]), mul = (a, n) => a.map(x => x * n), sub = (a, b) => a.map((n, i) => n - b[i]), len = a => Math.hypot(...a), norm = a => mul(a, 1 / (len(a) || 1));
  const sandbox = vm.createContext({ Math: math, console, Number, Array, PI: Math.PI, TAU: Math.PI * 2, G: 9.80665, BOMB_K: 6.45e-5,
    clamp: (n, a, b) => Math.max(a, Math.min(b, n)), rnd: (a, b) => a + (b - a) * math.random(),
    vadd: add, vsub: sub, vmul: mul, vlen: len, vnorm: norm, vdist: (a, b) => len(sub(a, b)), vdist2: (a, b) => len(sub(a, b)) ** 2,
    terrainH: () => 0, coastAt: () => -1e9, M2FT: 3.28084 });
  vm.runInContext(code, sandbox);
  const api = sandbox.FlightThreatFeedback;
  const FX = vm.runInContext(fxCode + '; FX;', sandbox);
  return { api, sandbox, FX, randomCalls: () => randomCalls };
}
test('all twelve actual launch bearings map to clock words, independent of aircraft heading', () => {
  const { api } = fixture(), words = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
  for (const yaw of [0, Math.PI / 3, -Math.PI, Math.PI * 9.25]) for (let hour = 0; hour < 12; hour++) {
    const angle = yaw + hour * Math.PI / 6, ac = { p: [130, 400, -72], yaw };
    const result = api.clockBearing(ac, [ac.p[0] + Math.sin(angle) * 800, 0, ac.p[2] - Math.cos(angle) * 800]);
    assert.equal(result.clock, hour || 12); assert.equal(result.word, words[hour]);
  }
});
test('sector wraparound is stable and missing, invalid or vertically coincident bearings remain unknown', () => {
  const { api } = fixture(), ac = { p: [0, 500, 0], yaw: 0 };
  for (const angle of [-.00001, .00001, Math.PI * 2 - .00001, -Math.PI * 2 + .00001])
    assert.equal(api.clockBearing(ac, [Math.sin(angle) * 100, 0, -Math.cos(angle) * 100]).clock, 12);
  for (const [a, p] of [[null, [1, 2, 3]], [ac, [NaN, 0, 1]], [{ ...ac, yaw: NaN }, [1, 0, 3]], [ac, [0, -400, 0]]])
    assert.equal(api.clockBearing(a, p), null);
});
test('real launch records copy their positions, are bounded and never mutate the projectile, site or gameplay RNG', () => {
  const f = fixture(), world = { t: 14, launchWarn: 5, fx: new f.FX() }, site = { p: [80, 2, -1000] }, missile = { p: [80, 5, -1000], v: [0, 90, 0], t: 0 };
  const before = copy({ site, missile }), event = f.api.recordLaunch(world, site, missile);
  assert.deepEqual(copy({ site, missile }), before); assert.equal(f.randomCalls(), 0);
  event.p[0] = 999; site.p[0] = 888; missile.p[0] = 777;
  assert.equal(f.api.inspect(world).events[0].p[0], 80);
  assert.equal(world.fx.add.length, 2); assert.equal(world.fx.smk.length, 18);
  for (let i = 0; i < 20; i++) f.api.recordLaunch(world, { p: [i, 0, 10] }, null);
  assert.equal(f.api.inspect(world).events.length, f.api.limits.events);
  assert.equal(f.api.inspect(world).launches, 21);
});
test('nearest simultaneous latest launch supplies the call while radar alone, old events and unknown bearings invent no direction', () => {
  const f = fixture(), w = { t: 10, launchWarn: 5, fx: new f.FX() }, ac = { p: [0, 500, 0], yaw: 0 };
  f.api.recordLaunch(w, { p: [3000, 0, 0] }); f.api.recordLaunch(w, { p: [-1000, 0, 0] });
  let c = f.api.launchCall(w, ac); assert.equal(c.clock, 9); assert.match(c.text, /nine o'clock/);
  w.t = 10.1; f.api.recordLaunch(w, { p: [0, 0, 5000] }); assert.equal(f.api.launchCall(w, ac).clock, 6);
  w.launchWarn = 0; w.samWarn = .4; assert.equal(f.api.launchCall(w, ac), null);
  w.launchWarn = 1; w.t = 30; c = f.api.launchCall(w, ac); assert.equal(c.clock, null); assert.doesNotMatch(c.text, /o'clock/);
  w.t = 1; f.api.recordLaunch(w, { p: [0, 0, 0] }); assert.equal(f.api.inspect(w).events.length, 1); assert.equal(f.api.launchCall(w, ac).clock, null);
  w.t = NaN; assert.equal(f.api.recordLaunch(w, { p: [100, 0, 0] }), null); assert.equal(f.api.launchCall(w, ac).clock, null); assert.equal(f.api.transientLights(w).length, 0);
});
function pathRun(hz, speed = 600, seconds = 2) {
  const f = fixture(), fx = new f.FX(), p = { p: [0, 1000, 0], v: [speed, 0, 0] }, samples = [];
  for (let i = 0; i < seconds * hz; i++) {
    p.p[0] += speed / hz; const old = fx.smk.length; f.api.trail(fx, p, 1 / hz, 'sam', [4, 0, -2]);
    samples.push(...fx.smk.slice(old).map(q => q.p[0]));
  }
  return { f, fx, p, samples, state: f.api.inspectTrail(p) };
}
test('30/60/120Hz retain the same trail samples, count and bounded spatial gaps at high speed', () => {
  const runs = [30, 60, 120].map(hz => pathRun(hz, 600));
  for (const r of runs) {
    assert.equal(r.state.smoke, 100); assert.equal(r.state.glow, 120); assert.equal(r.f.randomCalls(), 0);
    assert.ok(r.samples.every((p, i) => Math.abs(p - (i + 1) * 12) < 1e-6));
    assert.ok(r.samples.every((p, i) => !i || p - r.samples[i - 1] <= 12 + 1e-6));
  }
});
test('slow missiles keep their motor visible on the time boundary rather than depending on render count', () => {
  for (const hz of [30, 60, 120]) {
    const r = pathRun(hz, 90); assert.equal(r.state.smoke, 60); assert.equal(r.state.glow, 120);
    assert.ok(r.samples.every((p, i) => Math.abs(p - (i + 1) * 3) < 1e-6));
  }
});
test('pause/zero/invalid time emits nothing and cannot advance a prepared trail clock', () => {
  const r = pathRun(60, 300, 1), before = copy({ state: r.state, add: r.fx.add, smk: r.fx.smk, p: r.p });
  for (const dt of [0, -1, NaN, Infinity]) assert.equal(r.f.api.trail(r.fx, r.p, dt).skipped, true);
  assert.deepEqual(copy({ state: r.f.api.inspectTrail(r.p), add: r.fx.add, smk: r.fx.smk, p: r.p }), before);
});
test('teleports and large steps reset without a ribbon across the map or a later catch-up burst', () => {
  const r = pathRun(60, 300, 1), count = r.fx.smk.length;
  r.p.p[0] += 5000; assert.equal(r.f.api.trail(r.fx, r.p, 1 / 60).reset, true); assert.equal(r.fx.smk.length, count);
  r.p.p[0] += 5; const resumed = r.f.api.trail(r.fx, r.p, 1 / 60); assert.ok(resumed.smoke <= 1); assert.ok(resumed.glow <= 1);
  assert.equal(r.f.api.trail(r.fx, r.p, 5).reset, true);
});
test('original FX step renders the new schema with finite age/position/alpha and retires it within the existing limits', () => {
  const f = fixture(), fx = new f.FX(), w = { t: 0, launchWarn: 5, fx }, missile = { p: [0, 3, 0], v: [0, 90, 0] };
  f.api.recordLaunch(w, { p: [0, 0, 0] }, missile);
  for (let i = 0; i < 240; i++) {
    missile.p[1] += 90 / 60; f.api.trail(fx, missile, 1 / 60, 'sam'); fx.step(1 / 60);
    assert.ok(fx.add.length <= f.api.limits.additive && fx.smk.length <= f.api.limits.smoke);
    for (const q of [...fx.add, ...fx.smk]) assert.ok([...q.p, q.s, q.a, q.rot, q.t, q.life].every(Number.isFinite));
  }
  assert.ok(fx.add.some(q => q.streak && q.vs[1] < 0), 'narrow motor streak points behind the actual upward-moving missile');
  for (let i = 0; i < 420; i++) fx.step(1 / 60);
  assert.equal(fx.add.length, 0); assert.equal(fx.smk.length, 0); assert.equal(f.randomCalls(), 0);
});
test('full FX queues stay capped and released capacity does not replay a hidden backlog', () => {
  const f = fixture(), fx = { add: new Array(f.api.limits.additive).fill({}), smk: new Array(f.api.limits.smoke).fill({}) }, p = { p: [0, 100, 0], v: [600, 0, 0] };
  for (let i = 0; i < 120; i++) { p.p[0] += 10; f.api.trail(fx, p, 1 / 60); }
  assert.equal(fx.add.length, 1500); assert.equal(fx.smk.length, 900);
  fx.add.length = fx.smk.length = 0; p.p[0] += 10;
  const out = f.api.trail(fx, p, 1 / 60); assert.ok(out.smoke <= 1 && out.glow <= 1);
});
test('local launch lights exist only for actual fresh launch events and return independent bounded records', () => {
  const f = fixture(), w = { t: 10, launchWarn: 5, fx: new f.FX() };
  assert.deepEqual(copy(f.api.transientLights(w)), []);
  for (let i = 0; i < 4; i++) f.api.recordLaunch(w, { p: [i * 100, 0, 200] });
  const lights = f.api.transientLights(w); assert.equal(lights.length, 2); assert.ok(lights.every(l => l.intensity === 1.8 && l.radius === 110));
  lights[0].position[0] = 999; assert.notEqual(f.api.transientLights(w)[0].position[0], 999);
  w.t += .2; assert.ok(Math.abs(f.api.transientLights(w)[0].intensity - .45) < 1e-9);
  w.t += .3; assert.equal(f.api.transientLights(w).length, 0);
});
function worldFixture(presentation = true) {
  const f = fixture({ forbidRandom: false }), methods = vm.runInContext('({' + launchCode + ',' + weaponsCode + '})', f.sandbox);
  let calls = 0; const api = f.api;
  f.sandbox.FlightThreatFeedback = { ...api, trail(...args) { calls++; return presentation ? api.trail(...args) : { smoke: 0, glow: 0 }; }, recordLaunch(...args) { return presentation ? api.recordLaunch(...args) : null; } };
  const events = [], fx = new f.FX(); fx.explosion = () => {};
  const w = Object.assign({ t: 0, fx, sams: [], arms: [], bombs: [], radar: { alive: true, emitting: true, p: [-300, 0, -8000] }, hitAircraft(ac, severity, source, p) { events.push(['hit', severity, source, p.slice()]); }, detonate(p, scale, radius, damage, kind) { events.push(['detonate', p.slice(), scale, radius, damage, kind]); } }, methods);
  return { ...f, w, events, trailCalls: () => calls };
}
test('actual World launch and weapon methods retain projectile trajectories, detonation decisions and damage with feedback enabled', () => {
  const on = worldFixture(true), off = worldFixture(false), acOn = { p: [0, 700, 0], v: [180, 0, -150], yaw: .1 }, acOff = copy(acOn), trace = [];
  for (const [f, ac] of [[on, acOn], [off, acOff]]) {
    f.w.launchSam({ p: [700, 0, -5000] }, ac);
    f.w.arms.push({ p: ac.p.slice(), v: [0, 0, -300], t: 0, mem: f.w.radar.p.slice(), aim: f.w.radar.p.slice() });
  }
  for (let i = 0; i < 1800; i++) {
    for (const [f, ac] of [[on, acOn], [off, acOff]]) { f.w.t += 1 / 60; ac.p = ac.p.map((n, j) => n + ac.v[j] / 60); f.w._weapons(1 / 60, ac); f.w.fx.step(1 / 60); }
    const projectiles = f => copy({ sams: f.w.sams.map(s => ({ p: s.p, v: s.v, t: s.t, armed: s.armed })), arms: f.w.arms.map(a => ({ p: a.p, v: a.v, t: a.t, mem: a.mem })) });
    assert.deepEqual(projectiles(on), projectiles(off)); if (i % 60 === 0) trace.push(projectiles(on));
  }
  assert.ok(on.trailCalls() > 0, 'real integrated weapon methods must invoke production presentation');
  assert.deepEqual(copy(on.events), copy(off.events)); assert.ok(on.events.length > 0); assert.ok(trace.length > 0);
});
test('actual Game post-update speaks the correct launch once per existing warning episode and keeps radar-only quiet', () => {
  const f = fixture({ forbidRandom: false }), post = vm.runInContext('({' + postCode + '}).postUpdate', f.sandbox), calls = [];
  const ac = { p: [0, 600, 0], v: [0, 0, -150], yaw: 0, fuel: 5000, alive: true, onDeck: false, bombs: 6, radalt: 600, dmg: {}, aoa: 0 };
  const w = { t: 10, fx: new f.FX(), carrier: { p: [16000, 19, 0] }, targets: [], threats: [], score: { damage: 0 }, samWarn: .4, launchWarn: 0 };
  const g = { ac, world: w, app: { set: { sound: 0 }, radio(...args) { calls.push(args); } }, mis: { type: 'strike' }, phase: 'airborne', departed: false, strikeExperience: {}, shake: 0, flash: 0, t: 10, teach() {}, recoveryCalls() {} };
  post.call(g, 1 / 60); assert.equal(calls.length, 0);
  w.launchWarn = 5; f.api.recordLaunch(w, { p: [-1000, 0, 0] });
  for (let i = 0; i < 60; i++) { w.t += 1 / 60; post.call(g, 1 / 60); }
  assert.equal(calls.length, 1); assert.match(calls[0][1], /nine o'clock/); assert.equal(calls[0][2], 'bad');
  w.launchWarn = 0; post.call(g, 1 / 60); w.t = 20; w.launchWarn = 5; f.api.recordLaunch(w, { p: [0, 0, -1000] }); post.call(g, 1 / 60);
  assert.equal(calls.length, 2); assert.match(calls[1][1], /twelve o'clock/);
});
