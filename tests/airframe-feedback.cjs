'use strict';
// Domain/DOM and WebAudio-node doubles, not a device/audio-listening test.
// The actual production World.hitAircraft and newAircraft run in the fixture.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('assets/flight/airframe-feedback.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const aircraftSource = html.slice(html.indexOf('function newAircraft()'), html.indexOf('function acStep('));
const hitSource = html.slice(html.indexOf('  hitAircraft(ac,'), html.indexOf('  /* A round through the canopy.')).trim().replace(/^hitAircraft\(/, 'function(');
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(sound = true) {
  const ids = new Map(), nodes = [], eventCalls = [];
  class Element {
    constructor() { this.children = []; this.attributes = {}; this.hidden = false; this.dataset = {}; }
    set id(id) { this._id = id; ids.set(id, this); } get id() { return this._id; }
    append(...items) { this.children.push(...items); }
    setAttribute(k, v) { this.attributes[k] = v; }
  }
  const host = new Element(); host.id = 'game';
  const document = { hidden: false, createElement: () => new Element(), getElementById: id => ids.get(id) };
  const parameter = () => ({ value: 0, cancelScheduledValues(t) { eventCalls.push(['cancel', t]); }, setValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; } });
  const node = type => { const n = { type, gain: parameter(), frequency: parameter(), Q: parameter(), playbackRate: parameter(), pan: parameter(), connected: [], stopCalls: 0, disconnected: 0,
    connect(other) { this.connected.push(other); }, disconnect() { this.disconnected++; }, start() { this.started = true; }, stop() { this.stopCalls++; } }; nodes.push(n); return n; };
  const audioContext = { state: 'running', currentTime: 1, createBufferSource: () => node('source'), createBiquadFilter: () => node('filter'), createGain: () => node('gain'), createStereoPanner: () => node('panner') };
  const audio = { on: true, ctx: audioContext, master: { legacy: true }, noiseBuf: { legacy: true } };
  const math = Object.create(Math); let randomValues = [.99, .1]; math.random = () => randomValues.length ? randomValues.shift() : .99;
  const sandbox = { document, Math: math, console }; sandbox.globalThis = sandbox;
  vm.createContext(sandbox); vm.runInContext(aircraftSource, sandbox); vm.runInContext(source, sandbox);
  const ac = sandbox.newAircraft(); ac.alive = true; ac.onDeck = false; ac.p = [0, 300, 0]; ac.v = [0, 0, -150]; ac.ias = 150;
  const game = { t: 10, ac, phase: 'airborne', world: { score: { damage: 0 } } };
  const app = { game, screen: 'game', graphicsContextLost: false, audio, set: { sound }, show(name) { this.screen = name; return 7; }, pause(on) { this.game.paused = on; return 8; } }; game.app = app;
  const api = sandbox.FlightAirframeFeedback; api.install({ App: app }); api.tick(game, 0);
  const productionHit = vm.runInContext('(' + hitSource + ')', sandbox);
  function actualHit(severity, kind = 'aaa', position, allocation = .1) {
    randomValues = [.99, allocation];
    const world = { score: game.world.score, crewHit() { throw Error('unexpected cockpit selection'); }, onHit: (sev, type, p) => api.hit(game, sev, type, p || position), kill() { ac.alive = false; } };
    productionHit.call(world, ac, severity, kind, position);
  }
  return { api, game, app, ac, ids, nodes, eventCalls, audioContext, audio, actualHit, document, sandbox,
    advance(seconds) { game.t += seconds; audioContext.currentTime += seconds; api.tick(game, seconds); return api.view(game); } };
}
test('production hydraulic hits generate actual consequences without changing original physics or damage', () => {
  const f = fixture(), before = plain(f.ac); f.actualHit(.25);
  assert.equal(f.ac.dmg.hyd, .2); assert.equal(f.game.world.score.damage, .25);
  assert.equal(f.api.view(f.game).alert.title, 'HYDRAULIC DAMAGE');
  assert.match(f.api.view(f.game).alert.detail, /Control response is reduced/);
  for (const key of ['p', 'v', 'yaw', 'pitch', 'roll', 'fuel', 'bombs']) assert.deepEqual(plain(f.ac[key]), before[key]);
  assert.equal(f.api.view(f.game).sourceCount, 1);
});
for (const [allocation, key, title] of [[.4, 'eng', 'ENGINE DAMAGE'], [.6, 'fuelLeak', 'FUEL LEAK'], [.8, 'diane', 'DIANE DAMAGE'], [.99, 'fire', 'AIRFRAME FIRE']]) {
  test('production damage allocation truthfully reports ' + title, () => { const f = fixture(); f.actualHit(.3, 'flak', null, allocation); assert.ok(f.ac.dmg[key] > 0); assert.equal(f.api.view(f.game).alert.title, title); });
}
test('a direct actual hit origin determines a coarse pan, never a guessed body part or gun identity', () => {
  const f = fixture(); f.actualHit(.2, 'aaa', [100, 300, 0]);
  const alert = f.api.view(f.game).alert; assert.equal(alert.direction, 'STARBOARD'); assert.equal(alert.positionKnown, true);
  const panner = f.nodes.find(n => n.type === 'panner'); assert.equal(panner.pan.value, 1);
  f.api.render(f.game); assert.match(f.ids.get('flightAirframeDetail').textContent, /INCOMING FROM STARBOARD/);
  assert.doesNotMatch(alert.title + alert.detail, /wing|cockpit|nearest gun/i);
});
test('bearing follows actual aircraft heading while unknown hit origins remain centered', () => {
  const f = fixture(); f.ac.yaw = Math.PI / 2; f.actualHit(.2, 'aaa', [0, 300, -100]);
  assert.equal(f.api.view(f.game).alert.direction, 'PORT'); assert.ok(f.nodes.find(n => n.type === 'panner').pan.value < -.99);
  f.advance(1); const result = f.api.hit(f.game, .1, 'aaa'); assert.equal(result.pan, null); assert.equal(result.direction, '');
  assert.equal(f.api.view(f.game).alert.positionKnown, false);
});
test('malformed origins cannot invent a direction or stereo position', () => {
  for (const p of [[NaN, 2, 3], null, [0, 300, 0], [1, Infinity, 0]]) {
    const f = fixture(); f.api.hit(f.game, .2, 'flak', p); assert.equal(f.api.view(f.game).alert.direction, ''); assert.equal(f.nodes.some(n => n.type === 'panner'), false);
  }
});
test('a source notification alone never invents a damage card or modifies health', () => {
  const f = fixture(), before = JSON.stringify(f.ac); assert.equal(f.api.source(f.game, [80, 300, 0], 'flak').direction, 'STARBOARD');
  assert.equal(f.api.view(f.game).alert, null); assert.equal(f.api.source(f.game, [2000, 300, 0], 'flak'), null);
  assert.equal(JSON.stringify(f.ac), before); assert.equal(f.nodes.length, 0);
  f.advance(1.3); assert.equal(f.api.view(f.game).source, null);
});
test('polling observes actual crew loss and instructs manual control without invented words from a historical person', () => {
  const f = fixture(); f.ac.crew.pilot = 0; f.api.tick(f.game, .1); const a = f.api.view(f.game).alert;
  assert.equal(a.title, 'PILOT NOT RESPONDING'); assert.match(a.detail, /manual control or eject/); assert.equal(a.positionKnown, false);
  assert.equal(f.nodes.length, 0);
});
test('initial saved damage is a baseline rather than a replayed hit', () => {
  const f = fixture(); const next = { ...f.game, ac: { ...f.ac, dmg: { hyd: .7, eng: .8, diane: .4, fuelLeak: .5, fire: .1 }, hits: 8 }, world: { score: { damage: 2 } } }; f.app.game = next;
  f.api.tick(next, 0); assert.equal(f.api.view(next).alert, null); assert.equal(f.api.view(next).impacts, 0); assert.equal(f.nodes.length, 0);
});
test('direct callbacks and subsequent instrument polling produce one notice per actual damage event', () => {
  const f = fixture(); f.actualHit(.2); assert.equal(f.api.view(f.game).emitted, 1);
  for (let i = 0; i < 100; i++) f.api.tick(f.game, .01);
  assert.equal(f.api.view(f.game).emitted, 1); assert.equal(f.api.view(f.game).impacts, 1);
});
test('damage cards expire on simulation time and a paused redraw cannot keep them alive', () => {
  const f = fixture(); f.actualHit(.2); const a = plain(f.api.view(f.game).alert);
  for (let i = 0; i < 100; i++) { f.api.render(f.game); assert.deepEqual(plain(f.api.view(f.game).alert), a); }
  f.advance(8); assert.equal(f.api.view(f.game).alert, null); f.api.render(f.game); assert.equal(f.ids.get('flightAirframeFeedback').hidden, true);
});
test('a backwards simulation/checkpoint clock establishes a fresh baseline with no stale source or notice', () => {
  const f = fixture(); f.actualHit(.2, 'aaa', [90, 300, 0]); f.game.t = 1; f.api.tick(f.game, 0);
  assert.equal(f.api.view(f.game).alert, null); assert.equal(f.api.view(f.game).source, null);
});
for (const [name, mutate] of [
  ['muted', f => { f.app.set.sound = false; }], ['suspended', f => { f.audioContext.state = 'suspended'; }],
  ['paused', f => { f.app.pause(true); }], ['menu', f => { f.app.show('ready'); }],
  ['graphics context lost', f => { f.app.graphicsContextLost = true; }], ['hidden document', f => { f.document.hidden = true; }],
  ['parachute', f => { f.game.chute = {}; }], ['POW', f => { f.game.pow = {}; }], ['ejection', f => { f.game.ejected = true; }]
]) test(name + ' immediately or on the next lifecycle tick silences and disconnects owned sound', () => {
  const f = fixture(); f.actualHit(.2); f.api.render(f.game); const owned = f.nodes.slice(); mutate(f); f.api.tick(f.game, .1); f.api.render(f.game);
  assert.equal(f.api.view(f.game).sourceCount, 0); assert.ok(owned.every(n => n.disconnected > 0));
  if (name !== 'muted' && name !== 'suspended') assert.equal(f.ids.get('flightAirframeFeedback').hidden, true);
  assert.equal(f.audio.master.legacy, true); assert.equal(f.audio.noiseBuf.legacy, true);
});
test('silent/unsupported audio preserves the visual damage report and requests no permission or context', () => {
  const f = fixture(false); delete f.audioContext.createBufferSource; const result = f.api.hit(f.game, .2, 'aaa');
  assert.equal(result.played, false); assert.equal(f.nodes.length, 0); assert.equal(f.api.view(f.game).alert.title, 'AIRFRAME HIT');
  assert.equal(f.api.constants.newAudioContexts, 0); assert.equal(f.api.constants.loops, 0); assert.equal(f.api.constants.timers, 0);
});
test('rapid hits are rate-limited and the live source budget is two even before ended callbacks run', () => {
  const f = fixture(); for (let i = 0; i < 30; i++) { f.game.t += .07; f.api.hit(f.game, .2, 'aaa'); assert.ok(f.api.view(f.game).sourceCount <= 2); }
  assert.ok(f.nodes.filter(n => n.type === 'source' && n.disconnected).length >= 28);
  const before = f.nodes.length; for (let i = 0; i < 100; i++) f.api.hit(f.game, .2, 'aaa'); assert.equal(f.nodes.length, before);
  f.api.stop(f.game); assert.equal(f.api.view(f.game).sourceCount, 0);
});
test('ended audio sources release all owned nodes and only those nodes', () => {
  const f = fixture(); f.api.hit(f.game, .2, 'aaa', [-80, 300, 0]); f.nodes.find(n => n.type === 'source').onended();
  assert.equal(f.api.view(f.game).sourceCount, 0); assert.ok(f.nodes.every(n => n.disconnected === 1)); assert.equal(f.audio.master.legacy, true);
});
test('a failing audio-node construction cleans partial allocation and leaves gameplay intact', () => {
  const f = fixture(); f.audioContext.createBiquadFilter = () => { throw Error('unavailable'); };
  assert.equal(f.api.hit(f.game, .2, 'aaa').played, false); assert.ok(f.nodes.every(n => n.disconnected === 1)); assert.equal(f.ac.alive, true);
});
test('damaged airframe stress needs measured loading and sufficient speed, not just existing damage', () => {
  const f = fixture(); f.ac.dmg.hyd = .3; f.api.tick(f.game, .1); assert.equal(f.nodes.length, 0);
  f.ac.gLoad = 3; f.api.tick(f.game, .1); assert.equal(f.api.view(f.game).sourceCount, 1);
  f.advance(1); const count = f.nodes.length; f.api.tick(f.game, .1); assert.equal(f.nodes.length, count);
  f.game.t += 4.1; f.ac.v = [0, 0, -30]; f.api.tick(f.game, .1); assert.equal(f.nodes.length, count);
});
test('stale-game callbacks cannot emit sounds, update cards or stop the new current game sound', () => {
  const f = fixture(), old = f.game; const next = { ...old, t: 20, ac: { ...old.ac }, world: { score: { damage: 0 } } }; f.app.game = next;
  f.api.tick(next, 0); f.api.hit(next, .2, 'aaa'); const before = f.nodes.length;
  assert.equal(f.api.hit(old, .4, 'sam').played, false); f.api.tick(old, .1); f.api.dispose(old);
  assert.equal(f.nodes.length, before); assert.equal(f.api.view(next).sourceCount, 1);
});
test('installation is idempotent, native app return values survive, and UI has no event interception', () => {
  const f = fixture(); assert.equal(f.api.install({ App: f.app }), false); assert.equal(f.app.show('game'), 7); assert.equal(f.app.pause(false), 8);
  f.api.hit(f.game, .2, 'aaa'); f.api.render(f.game); f.api.render(f.game);
  assert.equal(f.ids.get('game').children.length, 1); assert.equal(f.ids.get('flightAirframeFeedback').attributes.role, 'status');
  f.api.dispose(f.game); assert.equal(f.ids.get('flightAirframeFeedback').hidden, true);
});
