'use strict';
// Domain/DOM fixtures, not a claim of full sortie or physical-device testing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/flight/strike-crew.js'), 'utf8');
const tests = [], test = (name, run) => tests.push({ name, run });
function fixture(options = {}) {
  const ids = new Map(), events = {}, documentEvents = {};
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; this.hidden = false; }
    set id(id) { this._id = id; ids.set(id, this); } get id() { return this._id; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
    blur() { this.blurred = true; }
  }
  const host = new Node('section'); host.id = 'game';
  const document = { hidden: false, getElementById: id => ids.get(id), createElement: tag => new Node(tag), addEventListener(k, fn) { (documentEvents[k] ||= []).push(fn); } };
  const synth = { pending: false, speaking: false, said: [], cancels: 0, speak(u) { this.said.push(u); this.speaking = true; u.onstart(); }, cancel() { this.cancels++; this.speaking = false; this.pending = false; const u = this.said.at(-1); if (u) u.onend(); } };
  const window = { addEventListener(k, fn) { (events[k] ||= []).push(fn); } };
  if (options.speech !== false) { window.speechSynthesis = synth; window.SpeechSynthesisUtterance = function (text) { this.text = text; }; }
  const effects = { targets: [], flashes: [] };
  window.FlightStrikeEffects = { inspect() { return effects; } };
  vm.runInContext(source, vm.createContext({ window, document }));
  const game = { t: 0, phase: 'ingress', mis: { id: 'm2' }, strikeExperience: { phase: 'navigation' }, rightSeat: true, ac: { p: [0, 1000, 0], roll: 0, alive: true, bombs: 12, dmg: {} }, world: { nav: { fixes: 0 }, score: { dropped: 0, hits: 0, misses: 0 }, designated: null }, sol: null, steer: null, masterArm: false, _lastCommit: 0, rend: { eye: [0, 1000, 0], matV: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } };
  const App = { game, screen: 'game', set: { sound: true }, graphicsContextLost: false }, api = window.FlightStrikeCrew;
  const context = { App, canSeeAftermath: () => true }; api.install(context);
  const tick = delta => { game.t += delta; api.tick(game, delta); return api.inspect(game); };
  const baseline = () => { tick(0); tick(10); };
  const click = () => ids.get('flightStrikeCrewVoice').onclick({ stopPropagation() {} });
  return { api, window, game, App, document, context, ids, host, synth, effects, tick, baseline, click, events, documentEvents };
}
test('opt-in scope leaves every old mission, Willard and absent experience untouched', () => {
  for (const change of [g => g.mis.id = 'm1', g => delete g.strikeExperience, g => g.willard = {}]) {
    const f = fixture(); change(f.game); const before = JSON.stringify(f.game); f.api.tick(f.game, 1);
    assert.equal(f.api.inspect(f.game).active, false); assert.equal(f.ids.get('flightStrikeCrew').hidden, true); assert.equal(JSON.stringify(f.game), before);
  }
});
test('all authored phase prompts visibly declare dramatization and never fabricate quotes', () => {
  for (const phase of ['navigation', 'acquire', 'run-in', 'release', 'assess', 'egress', 'recovery']) {
    const f = fixture(); f.game.strikeExperience.phase = phase; const c = f.tick(0).caption;
    assert.equal(c.key, 'phase-' + phase); assert.match(c.label, /DRAMATIZED/); assert.ok(c.text.length < 180); assert.match(f.ids.get('flightStrikeCrew').attributes['aria-label'], /Dramatized/);
  }
});
test('fix calls require an actual new navigation fix and do not claim perfect navigation', () => {
  const f = fixture(); f.baseline(); f.game.world.nav.fixes++; const c = f.tick(.1).caption;
  assert.equal(c.key, 'fix'); assert.match(c.text, /does not remove all navigation error/); f.tick(20); assert.equal(f.tick(20).caption, null);
});
test('loading prior fix, impact and release counters does not announce them as fresh', () => {
  const f = fixture(); Object.assign(f.game.world.score, { dropped: 8, hits: 7, misses: 1 }); f.game.world.nav.fixes = 3;
  assert.equal(f.tick(0).caption.key, 'phase-navigation'); f.tick(10); assert.equal(f.tick(10).caption, null);
});
test('steer acknowledgement uses the actual assigned heading and finite turn change', () => {
  const f = fixture(); f.baseline(); f.game.steer = -Math.PI / 2; const c = f.tick(.1).caption;
  assert.equal(c.key, 'steer'); assert.match(c.text, /270 acknowledged/); f.tick(10); f.game.steer = -Math.PI / 2 + Math.PI * 2; assert.equal(f.tick(.1).caption, null);
});
test('designation acknowledgement needs a real lock, never hidden target details', () => {
  const f = fixture(); f.baseline(); const target = {};
  Object.defineProperty(target, 'label', { get() { throw Error('hidden target identity read'); } }); Object.defineProperty(f.game.world, 'targets', { get() { throw Error('hidden target collection read'); } });
  f.game.world.designated = target; assert.equal(f.tick(.1).caption.key, 'lock');
});
test('stabilization requires continuous real valid needles and bank with hysteresis', () => {
  const f = fixture(); f.baseline(); f.game.world.designated = {}; f.game.sol = { valid: true, az: .01, tRel: 8, h: 1000 };
  f.tick(.1); f.game.sol.az = .03; f.tick(10); f.game.sol.az = .01; for (let i = 0; i < 4; i++) assert.notEqual(f.tick(.25).caption?.key, 'stable');
  assert.equal(f.tick(.25).caption.key, 'stable'); f.tick(20); f.game.sol.az = .03; f.tick(.25); f.game.sol.az = .01; for (let i = 0; i < 6; i++) f.tick(.25); assert.equal(f.api.inspect(f.game).caption, null);
  f.game.sol.az = .06; f.tick(.25); f.tick(20); f.game.sol.az = .01; for (let i = 0; i < 6; i++) f.tick(.25); assert.equal(f.api.inspect(f.game).caption.key, 'stable');
});
test('loss of solution or a substantial bank permits a truthful fresh stabilization call', () => {
  for (const mode of ['invalid', 'bank']) {
    const f = fixture(); f.baseline(); f.game.world.designated = {}; f.game.sol = { valid: true, az: .01, tRel: 8, h: 1000 };
    f.tick(.1); f.tick(10); for (let i = 0; i < 6; i++) f.tick(.25); assert.equal(f.api.inspect(f.game).caption.key, 'stable');
    if (mode === 'invalid') f.game.sol.valid = false; else f.game.ac.roll = .4;
    f.tick(20); f.game.sol.valid = true; f.game.ac.roll = 0; for (let i = 0; i < 6; i++) f.tick(.25);
    assert.equal(f.api.inspect(f.game).caption.key, 'stable');
  }
});
test('unstable, invalid or missing solutions cannot manufacture a settled-needle call', () => {
  for (const sol of [null, { valid: false, az: 0 }, { valid: true, az: .1 }, { valid: true, az: NaN }]) {
    const f = fixture(); f.baseline(); f.game.world.designated = {}; f.game.sol = sol; f.game.ac.roll = .5;
    for (let i = 0; i < 100; i++) f.tick(.1); assert.ok(f.api.inspect(f.game).history.every(c => c.key !== 'stable'));
  }
});
test('actual release deltas have highest priority and never imply a confirmed hit', () => {
  const f = fixture(); f.baseline(); f.game.world.nav.fixes++; f.game.world.score.dropped += 4; f.game.masterArm = true;
  const c = f.tick(.1).caption; assert.equal(c.key, 'release'); assert.match(c.text, /4 bombs off/); assert.match(c.text, /not a confirmed hit/); assert.equal(f.game.ac.bombs, 12);
});
test('consent with no designation explains why nothing releases', () => {
  const f = fixture(); f.baseline(); f.game.masterArm = true; const c = f.tick(.1).caption;
  assert.equal(c.key, 'inhibit-designation'); assert.match(c.text, /no point is designated/); assert.equal(f.game.world.score.dropped, 0);
});
test('release inhibit explanations track original gate reasons and boundaries', () => {
  const f = fixture(), g = f.game, reason = () => f.api.inhibit(g).code;
  assert.equal(reason(), 'designation'); g.world.designated = {}; assert.equal(reason(), 'solution');
  g.sol = { valid: false, h: 55, az: 0, tRel: 8 }; assert.equal(reason(), 'height'); g.sol.h = 1000; g.sol.tRel = -1.21; assert.equal(reason(), 'past');
  g.sol.tRel = 6; g.sol.az = .3; assert.equal(reason(), 'approach'); g.sol.valid = true; g.sol.az = .028; assert.equal(reason(), 'alignment');
  g.sol.az = .02799; assert.equal(reason(), 'waiting'); g._relArm = 0; assert.equal(reason(), 'ripple'); g.ac.dmg.diane = .81; assert.equal(reason(), 'diane');
  g.ac.bombs = 0; assert.equal(reason(), 'empty'); g.ac.onDeck = true; assert.equal(reason(), 'deck'); g.mis.noRelease = true; assert.equal(reason(), 'weapons-tight');
});
test('held consent repeats slowly and changed safety reasons can replace quieter guidance', () => {
  const f = fixture(); f.baseline(); f.game.masterArm = true; assert.equal(f.tick(.1).caption.key, 'inhibit-designation');
  const first = f.api.inspect(f.game).emitted; for (let i = 0; i < 100; i++) f.tick(.1); assert.equal(f.api.inspect(f.game).emitted, first);
  f.tick(4); assert.equal(f.api.inspect(f.game).emitted, first + 1); f.tick(6); f.game.world.designated = {}; f.game.sol = { valid: true, az: .2, tRel: 4 }; assert.equal(f.tick(.1).caption.key, 'inhibit-alignment');
});
test('actual impacts are distinguished from visual confirmation and kills', () => {
  const f = fixture(); f.baseline(); f.game.world.score.hits++; f.game.world.score.killed = 20;
  const c = f.tick(.1).caption; assert.equal(c.key, 'impact'); assert.match(c.text, /debrief measures/); assert.doesNotMatch(c.text, /destroyed|20|killed/);
});
test('after-action observation requires actual aftermath in current view and positive LOS', () => {
  const f = fixture(); f.baseline(); f.game.strikeExperience.phase = 'assess'; f.tick(.1); f.tick(10);
  f.effects.targets.push({ p: [0, 500, -2000], elapsed: 2 }); assert.equal(f.tick(.1).caption.key, 'aftermath');
  assert.match(f.api.inspect(f.game).caption.text, /not confirmation/);
});
test('no smoke claim through terrain, behind the camera, beyond range or from hidden scores', () => {
  for (const mode of ['occluded', 'behind', 'far', 'expired', 'no-los', 'no-effects']) {
    const f = fixture(); f.game.strikeExperience.phase = 'assess'; f.baseline(); f.game.world.score.killed = 8;
    f.effects.targets.push({ p: [0, 500, -2000], elapsed: 2 });
    if (mode === 'occluded') f.context.canSeeAftermath = () => false;
    if (mode === 'no-los') delete f.context.canSeeAftermath;
    if (mode === 'behind') f.effects.targets[0].p[2] = 2000;
    if (mode === 'far') f.effects.targets[0].p[2] = -8000;
    if (mode === 'expired') f.effects.targets[0].elapsed = 100;
    if (mode === 'no-effects') f.effects.targets = [];
    assert.equal(f.tick(.1).caption, null);
  }
});
test('malformed view matrices cannot manufacture a visual smoke observation', () => {
  const f = fixture(); f.game.strikeExperience.phase = 'assess'; f.baseline(); f.effects.targets.push({ p: [0, 500, -2000], elapsed: 2 }); f.game.rend.matV = [];
  assert.equal(f.tick(.1).caption, null);
});
test('captions expire on simulation time with meaningful quiet intervals', () => {
  const f = fixture(); f.tick(0); for (let i = 0; i < 20; i++) f.api.render(f.game); assert.ok(f.api.inspect(f.game).caption);
  f.tick(6); assert.equal(f.api.inspect(f.game).caption, null); assert.match(f.ids.get('flightStrikeCrewLine').textContent, /Crew listening/);
});
test('pause, menus, capture, ejection, death, graphics loss and hidden document suppress guidance', () => {
  for (const mutate of [f => f.game.paused = true, f => f.App.screen = 'ready', f => f.game.pow = {}, f => f.game.evade = {}, f => f.game.chute = {}, f => f.game.ejected = true, f => f.game.ac.alive = false, f => f.App.graphicsContextLost = true, f => f.document.hidden = true]) {
    const f = fixture(); f.tick(0); mutate(f); f.api.render(f.game); assert.equal(f.api.inspect(f.game).active, false); assert.equal(f.ids.get('flightStrikeCrew').hidden, true);
  }
});
test('speech is optional, feature detected and OFF by default while subtitles remain', () => {
  const f = fixture(); f.tick(0); assert.equal(f.synth.said.length, 0); assert.equal(f.api.inspect(f.game).voiceEnabled, false);
  const absent = fixture({ speech: false }); absent.tick(0); assert.equal(absent.ids.get('flightStrikeCrewVoice').disabled, true); assert.ok(absent.api.inspect(absent.game).caption);
});
test('native speech button activates once per click and never leaks flight keys', () => {
  const f = fixture(); f.baseline(); f.click(); assert.equal(f.api.inspect(f.game).voiceEnabled, true);
  const b = f.ids.get('flightStrikeCrewVoice'); assert.equal(b.listeners.pointerup.length, 1); assert.equal(b.listeners.pointerdown.length, 1); assert.equal(b.attributes['aria-pressed'], 'true');
  for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup']) { let stopped = false; b.listeners[type][0]({ stopPropagation() { stopped = true; } }); assert.equal(stopped, true); }
  f.game.world.nav.fixes++; f.tick(.1); assert.equal(f.synth.said.length, 1); assert.equal(f.api.inspect(f.game).ownedVoices, 1); f.click(); assert.equal(f.synth.cancels, 1); assert.equal(f.api.inspect(f.game).ownedVoices, 0);
});
test('synth guidance never queues behind unrelated active or pending speech', () => {
  for (const property of ['speaking', 'pending']) { const f = fixture(); f.baseline(); f.click(); f.synth[property] = true; f.game.world.nav.fixes++; f.tick(.1); assert.equal(f.synth.said.length, 0); f.game.paused = true; f.api.render(f.game); assert.equal(f.synth.cancels, 0); }
});
test('owned voice stops on pause, visibility loss, retry and switching to an old mission', () => {
  for (const mode of ['pause', 'visibility', 'retry', 'old-mission']) {
    const f = fixture(); f.baseline(); f.click(); f.game.world.nav.fixes++; f.tick(.1); assert.equal(f.synth.said.length, 1);
    if (mode === 'pause') { f.game.paused = true; f.api.render(f.game); }
    if (mode === 'visibility') { f.document.hidden = true; f.documentEvents.visibilitychange[0](); }
    if (mode === 'retry') f.api.dispose(f.game);
    if (mode === 'old-mission') { const next = { ...f.game, mis: { id: 'm1' }, strikeExperience: null }; f.App.game = next; f.api.tick(next, .1); }
    assert.equal(f.synth.cancels, 1); assert.equal(f.api.inspect(f.game).ownedVoices, 0);
  }
});
test('owned voice cancellation does not clear a subsequently queued unrelated radio call', () => {
  const f = fixture(); f.baseline(); f.click(); f.game.world.nav.fixes++; f.tick(.1); f.synth.pending = true; f.game.paused = true; f.api.render(f.game);
  assert.equal(f.synth.cancels, 0); assert.equal(f.api.inspect(f.game).ownedVoices, 0);
});
test('retry clock/counter rollback starts a fresh presentation without replaying old damage', () => {
  const f = fixture(); f.baseline(); f.game.world.score.dropped = 4; f.tick(.1); f.game.t = 0; f.game.world.score.dropped = 0;
  const c = f.tick(0).caption; assert.equal(c.key, 'phase-navigation'); assert.equal(f.api.inspect(f.game).history.length, 1); assert.equal(f.api.inspect(f.game).voiceEnabled, false);
});
test('repeated installation and sorties own one panel, one listener set and bounded history', () => {
  const f = fixture(); for (let i = 0; i < 100; i++) f.api.install(f.context);
  assert.equal(f.host.children.length, 1); assert.equal(f.events.blur.length, 1); assert.equal(f.documentEvents.visibilitychange.length, 1);
  f.baseline(); for (let i = 0; i < 100; i++) { f.game.world.nav.fixes++; f.tick(20); }
  assert.equal(f.api.inspect(f.game).history.length, 8); assert.equal(f.api.inspect(f.game).ownedVoices, 0);
});
test('presentation cannot mutate flight, mission, stores, scores or checkpoint state', () => {
  const f = fixture(); f.game.world.designated = {}; f.game.sol = { valid: true, az: 0, tRel: 4, h: 500 }; f.game.masterArm = true;
  const before = JSON.stringify(f.game); for (let i = 0; i < 100; i++) { f.api.tick(f.game, .01); f.api.render(f.game); }
  assert.equal(JSON.stringify(f.game), before); assert.doesNotMatch(source, /setInterval\s*\(|setTimeout\s*\(|new\s+(?:root\.)?AudioContext/);
  const s = f.api.inspect(f.game); s.history[0].text = 'tampered'; assert.notEqual(f.api.inspect(f.game).history[0].text, 'tampered');
});
let failed = 0;
for (const t of tests) { try { t.run(); console.log('PASS ' + t.name); } catch (error) { failed++; console.error('FAIL ' + t.name + '\n' + error.stack); } }
console.log(JSON.stringify({ suite: 'strike-crew-domain-dom', passed: tests.length - failed, failed, total: tests.length }));
if (failed) process.exitCode = 1;
