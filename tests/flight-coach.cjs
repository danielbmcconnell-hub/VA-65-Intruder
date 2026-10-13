'use strict';
// Domain checks use real guidance logic and recorded lifecycle fixtures.
// They are separate from root's actual WebGL/browser regression tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/flight/coach.js'), 'utf8');
function fixture() {
  const window = {}, scope = vm.createContext({ window }); vm.runInContext(source, scope);
  const game = {
    phase: 'deck', paused: false, rightSeat: false, departed: false, app: { screen: 'game', keys: {}, gctl: {} },
    mis: { id: 'm1', type: 'carrier_only' },
    ac: { alive: true, onDeck: true, cat: 0, p: [0, 1.62, 0], v: [0, 0, -6], yaw: 0, pitch: 0, roll: 0,
      aoa: 9 * Math.PI / 180, ias: 6, radalt: 1.62, thr: .7, gear: true, hook: true, fuel: 8000, bombs: 0, arms: 0,
      crew: { pilot: 1, bn: 1 }, dmg: { diane: 0 } },
    world: { carrier: { p: [0, 0, 0] }, targets: [], score: { cep: [], dropped: 0 }, nav: null, route: [], rtIdx: 0, designated: null, lock: false },
    approachLog: []
  };
  return { C: window.FlightCoach, game, window };
}
function air(f, type = 'strike') {
  const g = f.game; g.phase = 'airborne'; g.mis.type = type; g.ac.onDeck = false; g.ac.cat = 0; g.ac.p = [0, 500, 8000];
  g.ac.ias = 155; g.ac.radalt = 500; g.ac.gear = false; g.ac.hook = false; g.ac.bombs = type === 'carrier_only' ? 0 : 12;
  g.world.targets = type === 'carrier_only' ? [] : [{ p: [0, 0, 0], alive: true }]; return g;
}
function recovery(f) {
  const g = air(f); g.phase = 'recovery'; g.departed = true; g.ac.gear = true; g.ac.hook = true; g.ac.p = [0, 50, 750];
  g.ac.radalt = 50; g.ac.ias = 67; g.rampD = 700; g.lineErr = 0; g.gsErr = 0; return g;
}
function record(f, seconds) { f.C.setEnabled(true, f.game, false); for (let n = 0; n < Math.ceil(seconds * 20); n++) f.C.tick(f.game, .05); }
const tests = [], test = (name, run) => tests.push({ name, run });
test('ordinary missions begin with optional coaching off; practice can enable it without persisting', () => {
  const f = fixture(); assert.equal(f.C.enabled(f.game), false); assert.equal(f.C.tick(f.game, .1), null);
  f.game.mis.coachPractice = true; assert.equal(f.C.enabled(f.game), true);
  f.C.setEnabled(false, f.game, false); assert.equal(f.C.enabled(f.game), false);
  const another = fixture(); f.C.setEnabled(true, f.game, false); assert.equal(f.C.enabled(another.game), false);
});
test('snapshot reads correct aircraft/radar units without modifying source fields', () => {
  const f = fixture(), g = air(f); g.ac.p = [0, 304.8, 1852]; g.ac.ias = 100; g.ac.radalt = 60.96; g.ac.roll = Math.PI / 6;
  g.world.nav = { ex: 300, ez: 400, fixes: 2 }; const before = JSON.stringify(g), d = f.C.snapshot(g);
  assert.ok(Math.abs(d.altitudeFt - 1000) < .001); assert.ok(Math.abs(d.clearanceFt - 200) < .001);
  assert.ok(Math.abs(d.knots - 194.3844492) < .00001); assert.ok(Math.abs(d.bankDeg - 30) < .001);
  assert.equal(d.fuelLb, 8000); assert.equal(d.navErrorM, 500); assert.equal(d.ship.rangeNM, 1); assert.equal(d.ship.heading, 0);
  assert.equal(JSON.stringify(g), before); assert.equal(f.C.units.fuel, 'lb');
});
test('launch instruction distinguishes pilot power, launch-ready and active catapult stroke', () => {
  const f = fixture(); assert.equal(f.C.cue(f.game).id, 'launch-power');
  f.game.ac.thr = 1; assert.equal(f.C.cue(f.game).id, 'launch-ready');
  f.game.ac.cat = 1; assert.equal(f.C.cue(f.game).id, 'cat-stroke');
  assert.match(f.C.cue(f.game).text, /steady/);
});
test('right-seat launch respects the existing pilot instead of commanding BN throttle changes', () => {
  const f = fixture(); f.game.rightSeat = true;
  const prompt = f.C.cue(f.game); assert.equal(prompt.id, 'bn-launch'); assert.equal(prompt.seat, 'BN');
  assert.match(prompt.text, /existing pilot handles power/); assert.doesNotMatch(prompt.text, /Hold Shift/);
});
test('coach disappears in menus, pause, captivity, parachute, death and completed phases', () => {
  for (const change of [g => g.paused = true, g => g.pow = {}, g => g.evade = {}, g => g.chute = {}, g => g.ac.alive = false,
    g => g.result = {}, g => g.phase = 'done', g => g.app.screen = 'ready', g => g.phase = 'chute']) {
    const f = fixture(); change(f.game); f.C.setEnabled(true, f.game, false);
    assert.equal(f.C.cue(f.game), null); assert.equal(f.C.tick(f.game, .1), null); assert.equal(f.C.metrics(f.game), null);
  }
});
test('cleanup is appropriate during departure but does not raise gear near the returning ship', () => {
  const f = fixture(), g = air(f); g.ac.gear = true; g.departed = true;
  assert.equal(f.C.cue(g).id, 'gear-speed-limit');
  g.ac.ias = 120; assert.equal(f.C.cue(g).id, 'clean-up');
  g.ac.p[2] = 6000; assert.notEqual(f.C.cue(g).id, 'clean-up');
});
test('navigation fix cue uses actual checkpoint bearing, range and model navigation error', () => {
  const f = fixture(), g = air(f); g.rightSeat = true; g.world.nav = { ex: 300, ez: 400, fixes: 0 };
  g.world.route = [{ label: 'River bend', p: [1852, 0, 8000] }];
  const p = f.C.cue(g); assert.equal(p.id, 'navigation-fix'); assert.match(p.text, /River bend 090° · 1\.0 NM/);
  assert.match(p.text, /SYS ERR 547 yd/); assert.match(p.text, /not a target designation/);
});
test('out-of-range checkpoints do not falsely claim a visible or close radar fix', () => {
  const f = fixture(), g = air(f); g.world.route = [{ label: 'Far coast', p: [80000, 0, 8000] }];
  assert.equal(f.C.cue(g).id, 'designation');
});
test('blind target instruction preserves coordinate attacks and navigation error consequences', () => {
  const f = fixture(), g = air(f); g.world.blind = true;
  const p = f.C.cue(g); assert.equal(p.id, 'blind-designation'); assert.match(p.text, /does not paint/); assert.match(p.text, /Navigation error/);
});
test('valid attack guidance follows actual bank, azimuth, solution and held-consent fields', () => {
  const f = fixture(), g = air(f); g.world.designated = { p: [0, 0, 0] }; g.world.lock = true; g.sol = { valid: true, az: 0, tRel: 4.3 };
  g.ac.roll = .25; assert.equal(f.C.cue(g).id, 'attack-bank'); g.ac.roll = 0;
  g.sol.az = .08; assert.equal(f.C.cue(g).id, 'attack-align'); g.sol.az = 0;
  assert.equal(f.C.cue(g).id, 'attack-ready'); assert.match(f.C.cue(g).text, /about 5 s/);
  g.app.keys.Space = 1; assert.equal(f.C.cue(g).id, 'attack-consent');
  g.sol.valid = false; assert.equal(f.C.cue(g).id, 'solution-wait');
});
test('one-ripple rearm cue does not make or schedule a weapon release', () => {
  const f = fixture(), g = air(f); g.world.designated = {}; g._relArm = 0;
  const before = JSON.stringify(g); assert.equal(f.C.cue(g).id, 'new-run'); record(f, 1); assert.equal(JSON.stringify(g), before);
});
test('weapons-tight recce and original A-6B Iron Hand keep distinct mission-specific instructions', () => {
  const f = fixture(), g = air(f, 'recce'); g.world.targets = [{ alive: true, ident: true }, { alive: true }];
  const p = f.C.cue(g); assert.equal(p.id, 'weapons-tight'); assert.match(p.text, /1 contact/); assert.match(p.text, /do not hold/);
  g.mis.type = 'ironhand'; g.ac.arms = 2; g.world.radar = { alive: true, emitting: false };
  assert.equal(f.C.cue(g).id, 'arm-wait'); g.world.radar.emitting = true; assert.equal(f.C.cue(g).id, 'arm-emitting');
  assert.match(f.C.cue(g).title, /A-6B/);
});
test('carrier guidance reads actual configuration, glideslope, lineup, indexer and coupled state', () => {
  const f = fixture(), g = recovery(f); g.ac.gear = false; assert.equal(f.C.cue(g).id, 'approach-config'); g.ac.gear = true;
  g.gsErr = -.7; assert.equal(f.C.cue(g).id, 'approach-low'); g.gsErr = 1; assert.equal(f.C.cue(g).id, 'approach-high'); g.gsErr = 0;
  g.lineErr = 16; assert.equal(f.C.cue(g).id, 'approach-lineup'); assert.match(f.C.cue(g).text, /left/);
  g.lineErr = -16; assert.match(f.C.cue(g).text, /right/); g.lineErr = 0;
  g.ac.aoa = 13 / 180 * Math.PI; assert.equal(f.C.cue(g).id, 'approach-slow'); g.ac.aoa = 5 / 180 * Math.PI; assert.equal(f.C.cue(g).id, 'approach-fast');
  g.ac.aoa = 9 / 180 * Math.PI; assert.equal(f.C.cue(g).id, 'approach-stable');
  g.aclsCoupled = true; assert.equal(f.C.cue(g).id, 'coupled'); g.waveoff = true; assert.equal(f.C.cue(g).id, 'waveoff');
});
test('carrier BN prompts ask for monitoring, and pilot incapacity exposes existing emergency controls', () => {
  const f = fixture(), g = recovery(f); g.rightSeat = true; g.gsErr = -.7;
  const p = f.C.cue(g); assert.equal(p.id, 'approach-low'); assert.match(p.text, /Monitor the pilot/); assert.doesNotMatch(p.text, /Add a small/);
  g.ac.crew.pilot = 0; assert.equal(f.C.cue(g).id, 'pilot-unavailable'); assert.match(f.C.cue(g).text, /existing stick/);
});
test('low radar altitude and fuel cues take priority only during relevant airborne phases', () => {
  const f = fixture(), g = air(f); g.ac.radalt = 30; assert.equal(f.C.cue(g).id, 'terrain-low');
  g.ac.fuel = 500; assert.equal(f.C.cue(g).id, 'fuel-low'); assert.match(f.C.cue(g).text, /500 lb/);
  g.phase = 'recovery'; g.ac.gear = true; g.ac.hook = true; assert.equal(f.C.cue(g).id, 'recovery-setup');
});
test('cue cooldown suppresses transient changes but safety cues appear immediately', () => {
  const f = fixture(); f.C.setEnabled(true, f.game, false); assert.equal(f.C.tick(f.game, .1).id, 'launch-power');
  f.game.ac.thr = 1; assert.equal(f.C.tick(f.game, .1).id, 'launch-power');
  for (let n = 0; n < 65; n++) f.C.tick(f.game, .05); assert.equal(f.C.tick(f.game, .05).id, 'launch-ready');
  air(f); f.game.ac.fuel = 500; assert.equal(f.C.tick(f.game, .05).id, 'fuel-low');
});
test('recording does not advance in pause or when guidance is off and clamps oversized simulation deltas', () => {
  const f = fixture(), g = air(f); f.C.setEnabled(true, g, false); f.C.tick(g, 90);
  assert.equal(f.C.metrics(g).elapsed, .25); g.paused = true; f.C.tick(g, 10); assert.equal(f.C.metrics(g).elapsed, .25);
  g.paused = false; f.C.setEnabled(false, g, false); f.C.tick(g, .1); assert.equal(f.C.metrics(g).elapsed, .25);
});
test('coach telemetry remains separate from aircraft, mission, score, control and navigation state', () => {
  const f = fixture(), g = air(f); g.ac.radalt = 30; g.world.nav = { ex: 300, ez: 400, fixes: 0 };
  const before = JSON.stringify(g); record(f, 2); const metrics = f.C.metrics(g);
  assert.equal(JSON.stringify(g), before); assert.ok(metrics.lowClearanceSeconds > 1.9); assert.equal(metrics.maxNavErrorM, 500);
});
test('debrief advice cites actual miss/navigation records without inventing bomb direction or changing grades', () => {
  const f = fixture(), g = air(f); record(f, 1); g.world.score.cep = [100, 120]; g.world.navErrAtRelease = 500;
  g.world.nav = { fixes: 0, ex: 300, ez: 400 }; g.world.route = [{}, {}]; g.result = { grade: 'C', pass: false };
  const before = JSON.stringify(g), review = f.C.report(g, false, 'Fuel exhausted');
  assert.ok(review.evidence.some(t => t.includes('361 ft'))); assert.ok(review.evidence.some(t => t.includes('547 yd')));
  assert.ok(review.advice.some(t => t.includes('does not establish which direction'))); assert.equal(JSON.stringify(g), before);
  assert.match(review.note, /does not change the mission grade/);
});
test('debrief uses recorded absolute approach errors and actual bolters for specific improvement advice', () => {
  const f = fixture(), g = recovery(f); record(f, 1); g.approachLog = [[.8, 18], [.6, 16]]; g.bolters = 2;
  const review = f.C.report(g, true); assert.ok(review.evidence.some(t => t.includes('17.0 m')));
  assert.ok(review.advice.some(t => t.includes('smaller power corrections'))); assert.ok(review.advice.some(t => t.includes('lineup earlier')));
  assert.ok(review.evidence.some(t => t.includes('2 bolter')));
});
test('previews reflect changed records, but a completed debrief remains stable and reset starts a fresh observation', () => {
  const f = fixture(), g = air(f); record(f, .5); const a = f.C.report(g, false); g.world.score.cep = [120];
  const b = f.C.report(g, false); assert.notEqual(a, b); assert.ok(b.evidence.length > a.evidence.length);
  g.result = { grade: 'B' }; const frozen = f.C.report(g, true); g.world.score.cep = [0]; assert.equal(f.C.report(g, true), frozen);
  f.C.reset(g); assert.equal(f.C.metrics(g), null); assert.equal(f.C.report(g, true), null);
});
test('captivity and the forced historical escape mission receive no flight-grade coaching report', () => {
  const f = fixture(), g = air(f); record(f, 1); g.pow = {}; assert.equal(f.C.report(g, false), null); delete g.pow;
  g.mis.escape = true; assert.equal(f.C.report(g, false), null);
});
test('install is idempotent, preserves update and debrief returns, persists choice and restores original methods', () => {
  const f = fixture(), writes = [], App = { screen: 'game', game: f.game, show(name) { this.screen = name; return 'shown'; } };
  const calls = { update: 0, debrief: 0 };
  function Game() {}
  const update = Game.prototype.update = function (dt) { calls.update++; return dt + 1; };
  const debrief = Game.prototype.debrief = function () { calls.debrief++; this.result = { grade: 'A' }; return 'debriefed'; };
  Object.setPrototypeOf(f.game, Game.prototype); f.game.app = App;
  const ctx = { Game, App, Store: { get: (_, fallback) => fallback, set: (key, value) => writes.push([key, value]) }, touch: true };
  assert.equal(f.C.install(ctx), true); const wrapper = Game.prototype.update; assert.equal(f.C.install(ctx), true); assert.equal(Game.prototype.update, wrapper);
  f.C.setEnabled(true, f.game); assert.deepEqual(writes, [['flightCoach22', true]]);
  assert.equal(f.game.update(.1), 1.1); assert.equal(calls.update, 1); assert.match(f.C.cue(f.game).text, /THR \+/);
  assert.equal(f.game.debrief(true), 'debriefed'); assert.equal(calls.debrief, 1); assert.equal(App.show('ready'), 'shown');
  assert.equal(f.C.uninstall(), true); assert.equal(Game.prototype.update, update); assert.equal(Game.prototype.debrief, debrief); assert.equal(f.C.uninstall(), false);
});
test('saved opt-in restores only guidance, without changing seat or enabling automatic flight', () => {
  const f = fixture(); function Game() {} Game.prototype.update = function () {}; Game.prototype.debrief = function () {};
  const ctx = { Game, App: { game: f.game }, Store: { get: () => true, set() {} } }; f.C.install(ctx);
  assert.equal(f.C.enabled(f.game), true); const before = JSON.stringify(f.game); f.C.tick(f.game, .1); assert.equal(JSON.stringify(f.game), before);
});
let passed = 0;
for (const test of tests) { try { test.run(); passed++; console.log('PASS ' + test.name); } catch (error) { console.error('FAIL ' + test.name); throw error; } }
console.log(passed + ' flight coaching domain and lifecycle fixture checks passed.');
