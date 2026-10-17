'use strict';
// Domain/DOM and Web Audio graph fixtures. Native input + actual WebGL views
// are verified separately in the Willard browser acceptance suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/willard/presentation.js'), 'utf8');
const tests = [], test = (name, run) => tests.push({ name, run });
function fixture() {
  const ids = new Map(), windowEvents = {}, documentEvents = {};
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; this.disabled = false; this.textContent = ''; const values = new Set(); this.classList = { toggle(k, on) { if (on) values.add(k); else values.delete(k); }, remove(k) { values.delete(k); }, contains(k) { return values.has(k); } }; }
    set id(v) { this._id = v; ids.set(v, this); } get id() { return this._id; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(k, v) { this.attributes[k] = v; }
    addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
    blur() { this.blurred = true; }
    getBoundingClientRect() { return { left: 10, right: 110, top: 20, bottom: 70 }; }
  }
  const body = new Node('body'), host = new Node('section'), canvas = new Node('canvas'); host.id = 'game'; canvas.id = 'gl';
  const document = { body, hidden: false, createElement: tag => new Node(tag), getElementById: id => ids.get(id) || null, addEventListener(k, fn) { (documentEvents[k] ||= []).push(fn); } };
  const window = { addEventListener(k, fn) { (windowEvents[k] ||= []).push(fn); } };
  const sandbox = vm.createContext({ window, document }); vm.runInContext(source, sandbox);
  const game = { ac: { p: [0, 600, 0], v: [0, 0, -180], yaw: 0, alive: true }, hud: { scope: true }, world: { score: { killed: 0, hits: 0 } }, extView: false, paused: false,
    willard: { phase: 'contact', phaseTime: 1, elapsed: 30, objective: 'Keep the fighter in sight.', route: { strike: [0, 0, -3704], plan: [-1852, 0, 0], flak: [1852, 0, 0], safe: [0, 0, -18520], carrier: [7408, 0, 0] }, contact: { observed: true, bearing: Math.PI, lastSeen: 29 }, enemy: { p: [100, 610, 800], speed: 220, alive: true }, difficulty: 'naval', checkpointLabel: 'After strike' } };
  const App = { game, screen: 'game', set: { sound: true }, graphicsContextLost: false, pause(on) { game.paused = on; } }; game.app = App;
  const callbacks = { retry: 0, camera: 0, pause: 0 }, ctx = { App, retry(g) { assert.equal(g, game); callbacks.retry++; }, toggleCamera(g) { callbacks.camera++; g.extView = !g.extView; }, pause(on) { callbacks.pause++; App.pause(on); } };
  const api = window.WillardPresentation; api.install(ctx);
  const dispatch = (events, type, event = {}) => { for (const fn of events[type] || []) fn(event); };
  const key = extra => { let prevented = false; const event = { code: 'KeyH', repeat: false, target: null, preventDefault() { prevented = true; }, ...extra }; dispatch(windowEvents, 'keydown', event); return prevented; };
  return { api, game, App, ctx, callbacks, document, window, ids, windowEvents, documentEvents, dispatch, key, canvas };
}
function control(f, id) {
  const node = f.ids.get(id), event = extra => ({ pointerType: 'touch', pointerId: 1, clientX: 50, clientY: 40, detail: 1, currentTarget: node, stopPropagation() {}, ...extra });
  return { node, send(type, extra) { f.dispatch(node.listeners, type, event(extra)); }, click(extra) { node.onclick(event(extra)); }, tap() { this.send('pointerdown'); this.send('pointerup'); } };
}
function fakeAudio(f) {
  const nodes = [], sources = [], param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; } });
  const node = kind => { const n = { kind, gain: param(), frequency: param(), Q: param(), playbackRate: param(), pan: param(), connections: [], disconnected: false, starts: 0, stops: 0, connect(other) { this.connections.push(other); }, disconnect() { this.disconnected = true; }, start() { this.starts++; }, stop() { this.stops++; } }; nodes.push(n); if (['buffer', 'oscillator'].includes(kind)) sources.push(n); return n; };
  const ctx = { currentTime: 20, state: 'running', createGain: () => node('gain'), createBiquadFilter: () => node('filter'), createBufferSource: () => node('buffer'), createOscillator: () => node('oscillator'), createStereoPanner: () => node('pan') };
  f.App.audio = { on: true, ctx, master: node('master'), noiseBuf: { originalNoise: true } }; return { nodes, sources, ctx };
}
test('mounts a single compact mission overlay and four native controls', () => {
  const f = fixture(); assert.equal(f.ids.get('willardHUD').hidden, false); assert.equal(f.ids.get('willardControls').children.length, 4);
  const first = f.ids.get('willardHUD'); f.api.install(f.ctx); assert.equal(f.ids.get('willardHUD'), first); assert.equal(f.ids.get('game').children.length, 1);
});
test('mission guidance reads the current objective and approximate crew contact clock', () => {
  const f = fixture(), s = f.api.snapshot(f.game); assert.match(s.title, /ENEMY INTERCEPTOR/); assert.equal(s.objective, 'Keep the fighter in sight.'); assert.match(s.contact, /6 O’CLOCK/); assert.doesNotMatch(s.contact, /800|range|HP|Pursuit/i); assert.equal(s.navigation, 'PLANNED EGRESS · 270° · 1.0 NM');
});
test('a contact clock is relative to aircraft yaw and contains no hidden fighter location', () => {
  const f = fixture(); Object.defineProperty(f.game.willard.enemy, 'p', { get() { throw new Error('HUD read hidden fighter position'); } });
  f.game.ac.yaw = Math.PI / 2; assert.match(f.api.snapshot(f.game).contact, /3 O’CLOCK/); f.game.willard.contact.bearing = -Math.PI / 2; assert.match(f.api.snapshot(f.game).contact, /6 O’CLOCK/);
});
test('stale, unobserved, malformed and absent sightings never reveal a precise contact direction', () => {
  for (const value of [null, { observed: false, bearing: Math.PI, lastSeen: 30 }, { observed: true, bearing: 1, lastSeen: 10 }, { observed: true, bearing: NaN, lastSeen: 30 }]) {
    const f = fixture(); f.game.willard.contact = value; assert.equal(f.api.snapshot(f.game).contact, 'CONTACT NOT HELD · LOOK AFT');
  }
});
test('warning captions remain available when visual contact is lost and text is bounded', () => {
  const f = fixture(); f.game.willard.contact = { observed: false, warning: 'BREAK! '.repeat(50) }; const s = f.api.snapshot(f.game); assert.equal(s.contact.length, 100); assert.doesNotMatch(s.contact, /O’CLOCK/);
});
test('Ace reduces waypoint assistance and safe egress uses the correct destination', () => {
  const f = fixture(); f.game.willard.difficulty = 'ace'; assert.equal(f.api.snapshot(f.game).navigation, 'PLANNED EGRESS · 270°');
  f.game.willard.phase = 'egress'; f.game.willard.difficulty = 'naval'; assert.equal(f.api.snapshot(f.game).navigation, 'COASTAL EGRESS · 000° · 10.0 NM');
});
test('each playable phase renders the same public guidance point the B/N gives the pilot', () => {
  const cases = [
    { phase: 'strike', point: [0, 800, -3704], expected: 'OPTIONAL STRIKE · 000° · 2.0 NM' },
    { phase: 'contact', point: [3704, 800, 0], expected: 'PLANNED EGRESS · 090° · 2.0 NM' },
    { phase: 'defend', point: [0, 800, 3704], expected: 'PLANNED EGRESS · 180° · 2.0 NM' },
    { phase: 'flak', point: [-3704, 800, 0], expected: 'NAM DINH DEFENSE ZONE · 270° · 2.0 NM' },
    { phase: 'flak', entered: true, point: [0, 800, -5556], expected: 'BREAK TOWARD THE GULF · 000° · 3.0 NM' },
    { phase: 'egress', point: [5556, 800, 0], expected: 'COASTAL EGRESS · 090° · 3.0 NM' }
  ];
  const f = fixture();
  for (const c of cases) {
    Object.assign(f.game.willard, { phase: c.phase, flakEntered: !!c.entered, guidance: { point: c.point, altitude: 800 }, objective: 'Follow this phase’s public B/N course.' });
    f.api.render(f.game);
    assert.equal(f.api.snapshot(f.game).navigation, c.expected);
    assert.equal(f.ids.get('willardNavigation').textContent, c.expected);
    assert.equal(f.ids.get('willardObjective').textContent, 'Follow this phase’s public B/N course.');
    assert.equal(f.ids.get('willardHUD').dataset.phase, c.phase);
  }
});
test('optional carrier recovery replaces the coastal route without claiming the carrier landing is complete', () => {
  const f = fixture(), w = f.game.willard;
  Object.assign(w, { phase: 'egress', recovery: true, guidance: { point: w.route.carrier.slice(), altitude: 360 }, phaseTitle: 'CONSTELLATION · OPTIONAL RECOVERY' });
  f.api.render(f.game);
  assert.equal(f.ids.get('willardNavigation').textContent, 'CONSTELLATION RECOVERY · 090° · 4.0 NM');
  assert.equal(f.ids.get('willardPhase').textContent, 'CONSTELLATION · OPTIONAL RECOVERY');
  assert.equal(f.game.result, undefined); assert.equal(w.completed, undefined);
});
test('malformed navigation omits guidance without exposing NaN coordinates', () => {
  const f = fixture(); f.game.willard.route.plan = [NaN, 0, 100]; assert.equal(f.api.snapshot(f.game).navigation, '');
});
test('H rear-view toggles once per press and closes the forward radar display', () => {
  const f = fixture(); assert.equal(f.key({}), true); assert.equal(f.game.willard.rear, true); assert.equal(f.game.hud.scope, false);
  f.key({ repeat: true }); assert.equal(f.game.willard.rear, true); f.key({}); assert.equal(f.game.willard.rear, false);
});
test('input focus, modifiers, menus and paused games cannot steal H for rear-view', () => {
  for (const extra of [{ target: { tagName: 'INPUT' } }, { target: { tagName: 'BUTTON' } }, { target: { tagName: 'SELECT' } }, { target: { isContentEditable: true } }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) { const f = fixture(); assert.equal(f.key(extra), false); assert.equal(f.game.willard.rear, undefined); }
  const f = fixture(); f.game.paused = true; assert.equal(f.key({}), false); f.game.paused = false; f.App.screen = 'ready'; assert.equal(f.key({}), false);
});
test('repeated installs do not duplicate keyboard, visibility or WebGL listeners', () => {
  const f = fixture(); for (let i = 0; i < 12; i++) f.api.install(f.ctx); assert.equal(f.windowEvents.keydown.length, 1); assert.equal(f.documentEvents.visibilitychange.length, 1); assert.equal(f.canvas.listeners.webglcontextlost.length, 1); f.key({}); assert.equal(f.game.willard.rear, true);
});
test('all native controls activate on released touch and suppress the generated compatibility click', () => {
  for (const id of ['willardRear', 'willardCamera', 'willardRetry', 'willardPause']) {
    const f = fixture(), c = control(f, id); c.tap(); c.click();
    if (id === 'willardRear') assert.equal(f.game.willard.rear, true);
    if (id === 'willardCamera') assert.equal(f.callbacks.camera, 1);
    if (id === 'willardRetry') assert.equal(f.callbacks.retry, 1);
    if (id === 'willardPause') assert.equal(f.callbacks.pause, 1);
    assert.equal(c.node.blurred, true);
  }
});
test('drag, cancellation, outside release and overlapping touches do not activate', () => {
  for (const mode of ['drag', 'cancel', 'outside', 'overlap', 'unmatched']) {
    const f = fixture(), c = control(f, 'willardRear');
    if (mode !== 'unmatched') c.send('pointerdown');
    if (mode === 'drag') { c.send('pointermove', { clientX: 90 }); c.send('pointermove', { clientX: 50 }); }
    if (mode === 'cancel') c.send('pointercancel');
    if (mode === 'overlap') { c.send('pointerdown', { pointerId: 2 }); c.send('pointerup'); c.send('pointerup', { pointerId: 2 }); }
    else c.send('pointerup', mode === 'outside' ? { clientX: 150 } : {});
    if (mode !== 'unmatched') c.click(); assert.equal(f.game.willard.rear, undefined, mode);
  }
});
test('keyboard activation and genuine mouse clicks work immediately following a touch', () => {
  const f = fixture(), c = control(f, 'willardRear'); c.tap(); assert.equal(f.game.willard.rear, true); c.click({ pointerType: undefined, detail: 0 }); assert.equal(f.game.willard.rear, false); c.click({ pointerType: 'mouse', detail: 1 }); assert.equal(f.game.willard.rear, true);
});
test('exported touch binding works on briefing and result buttons outside the flight overlay exactly once', () => {
  for (const hostId of ['briefBody', 'debriefBody']) {
    const f = fixture(), host = f.document.createElement('section'), node = f.document.createElement('button');
    host.id = hostId; node.id = hostId + 'NativeAction'; host.append(node); f.document.body.append(host);
    let calls = 0; f.api.bindButton(node, () => calls++);
    const c = control(f, node.id); c.send('pointerdown'); assert.equal(calls, 0);
    c.send('pointerup'); assert.equal(calls, 1);
    c.click(); c.click({ pointerType: undefined, sourceCapabilities: { firesTouchEvents: true } }); assert.equal(calls, 1);
    c.click({ pointerType: undefined, detail: 0 }); assert.equal(calls, 2);
    c.click({ pointerType: 'mouse', detail: 1 }); assert.equal(calls, 3);
  }
});
test('external briefing and result touch actions reject cancellation, scrolling, outside release and disabled controls', () => {
  for (const hostId of ['briefBody', 'debriefBody']) for (const mode of ['cancel', 'drag', 'outside', 'disabled', 'overlap']) {
    const f = fixture(), host = f.document.createElement('section'), node = f.document.createElement('button');
    host.id = hostId; node.id = hostId + mode; host.append(node); f.document.body.append(host);
    let calls = 0; f.api.bindButton(node, () => calls++); const c = control(f, node.id);
    c.send('pointerdown');
    if (mode === 'cancel') c.send('pointercancel');
    if (mode === 'drag') { c.send('pointermove', { clientX: 90 }); c.send('pointermove', { clientX: 50 }); }
    if (mode === 'disabled') node.disabled = true;
    if (mode === 'overlap') c.send('pointerdown', { pointerId: 2 });
    c.send('pointerup', mode === 'outside' ? { clientY: 100 } : {});
    if (mode === 'overlap') c.send('pointerup', { pointerId: 2 });
    c.click(); assert.equal(calls, 0, hostId + ' ' + mode);
  }
});
test('checkpoint control requires an available checkpoint and uses only the provided retry callback', () => {
  const f = fixture(), c = control(f, 'willardRetry'); f.game.willard.checkpointLabel = ''; f.api.render(f.game); assert.equal(c.node.disabled, true); c.tap(); c.click(); assert.equal(f.callbacks.retry, 0);
  f.game.willard.checkpointLabel = 'Before flak run'; f.api.render(f.game); c.click({ pointerType: 'mouse' }); assert.equal(f.callbacks.retry, 1); assert.equal(c.node.title, 'Before flak run');
});
test('camera control leaves rear-view and delegates the existing cockpit/chase switch', () => {
  const f = fixture(); f.game.willard.rear = true; control(f, 'willardCamera').click({ pointerType: 'mouse' }); assert.equal(f.game.willard.rear, false); assert.equal(f.game.extView, true); assert.equal(f.callbacks.camera, 1);
});
test('presentation never changes flight physics, mission damage, combat counters or outcomes', () => {
  const f = fixture(), before = JSON.stringify({ ac: f.game.ac, world: f.game.world }); for (let i = 0; i < 50; i++) f.api.step(f.game, .016); assert.equal(JSON.stringify({ ac: f.game.ac, world: f.game.world }), before); assert.equal(f.game.result, undefined);
});
test('all inactive flight states hide guidance and reject control actions', () => {
  for (const change of [f => f.game.paused = true, f => f.App.screen = 'ready', f => f.App.graphicsContextLost = true, f => f.game.evade = {}, f => f.game.chute = {}, f => f.game.pow = {}, f => f.game.ejected = true, f => f.game.result = {}, f => f.game.ac.alive = false, f => f.game.willard.phase = 'complete', f => f.game.willard.phase = 'failed', f => f.document.hidden = true]) {
    const f = fixture(); change(f); f.api.render(f.game); assert.equal(f.ids.get('willardHUD').hidden, true); assert.equal(f.api.rear(f.game), false); assert.equal(f.document.body.classList.contains('willard-flight'), false);
  }
});
test('non-Willard missions are untouched and never mount an active overlay', () => {
  const f = fixture(); delete f.game.willard; assert.equal(f.api.snapshot(f.game), null); f.api.step(f.game, .1); assert.equal(f.ids.get('willardHUD').hidden, true); f.key({}); assert.equal(f.game.extView, false);
});
test('pursuit synthesis owns exactly two sources on the existing Audio2 graph', () => {
  const f = fixture(), a = fakeAudio(f); f.api.step(f.game); assert.equal(f.api.inspect().ownedSources, 2); assert.equal(a.sources.length, 2); assert.ok(a.sources.every(s => s.starts === 1));
  for (let i = 0; i < 200; i++) f.api.step(f.game); assert.equal(a.sources.length, 2); assert.ok(a.nodes.some(n => n.connections.includes(f.App.audio.master))); assert.ok(a.nodes.find(n => n.kind === 'pan').pan.value > 0);
});
test('pause, menu, ejection, graphics loss and user mute dispose every owned source immediately', () => {
  for (const change of [f => f.game.paused = true, f => f.App.screen = 'ready', f => f.game.ejected = true, f => f.App.graphicsContextLost = true, f => f.App.set.sound = false]) {
    const f = fixture(), a = fakeAudio(f); f.api.step(f.game); change(f); f.api.step(f.game); assert.equal(f.api.inspect().ownedSources, 0); assert.ok(a.sources.every(s => s.stops === 1 && s.disconnected));
  }
});
test('suspended or unavailable audio never initializes, resumes or allocates its own context', () => {
  for (const mode of ['suspended', 'off', 'buffer', 'missing']) { const f = fixture(), a = fakeAudio(f); if (mode === 'suspended') a.ctx.state = 'suspended'; if (mode === 'off') f.App.audio.on = false; if (mode === 'buffer') f.App.audio.noiseBuf = null; if (mode === 'missing') delete f.App.audio; f.api.step(f.game); assert.equal(a.sources.length, 0); }
});
test('far or destroyed fighters have no persistent approach sound', () => {
  for (const mode of ['far', 'dead']) { const f = fixture(), a = fakeAudio(f); f.api.step(f.game); if (mode === 'far') f.game.willard.enemy.p = [10000, 1000, 10000]; else f.game.willard.enemy.alive = false; f.api.step(f.game); assert.equal(f.api.inspect().audioActive, false); assert.ok(a.sources.every(s => s.stops === 1)); }
});
test('browser blur and visibility loss stop sound without waiting for another game update', () => {
  const f = fixture(), a = fakeAudio(f); f.api.step(f.game); f.dispatch(f.windowEvents, 'blur'); assert.ok(a.sources.every(s => s.stops === 1)); f.api.step(f.game); assert.equal(a.sources.length, 2);
  f.dispatch(f.windowEvents, 'focus'); f.api.step(f.game); assert.equal(a.sources.length, 4); f.document.hidden = true; f.dispatch(f.documentEvents, 'visibilitychange'); assert.equal(f.api.inspect().audioActive, false); assert.equal(f.ids.get('willardHUD').hidden, true);
});
test('WebGL loss and explicit stop clean up once, and retries cannot reuse an old fighter sound', () => {
  const f = fixture(), a = fakeAudio(f); f.api.step(f.game); f.dispatch(f.canvas.listeners, 'webglcontextlost'); f.api.stop(); assert.ok(a.sources.every(s => s.stops === 1));
  const next = { ...f.game, willard: { ...f.game.willard } }; f.App.game = next; f.api.step(next); assert.equal(a.sources.length, 4); f.api.stop(); assert.equal(f.api.inspect().ownedSources, 0); assert.ok(a.sources.every(s => s.stops === 1));
});
test('audio context replacement tears down old nodes and a failed creation cannot leak sources', () => {
  const f = fixture(), a = fakeAudio(f); f.api.step(f.game); const b = fakeAudio(f); f.api.step(f.game); assert.ok(a.sources.every(s => s.stops === 1)); assert.equal(b.sources.length, 2); f.api.stop();
  f.App.audio.ctx.createOscillator = () => { throw new Error('fixture allocation failure'); }; f.api.step(f.game); assert.equal(f.api.inspect().audioActive, false); assert.ok(b.sources.every(s => s.stops === 1));
});
test('reconstruction note explicitly identifies the unconfirmed MiG portrayal and authored dialogue', () => {
  const f = fixture(); assert.match(f.api.snapshot(f.game).reconstruction, /unidentified interceptor portrayed as a MiG-17PF/); assert.match(f.api.snapshot(f.game).reconstruction, /dialogue is dramatized/);
});
let failed = 0;
for (const t of tests) { try { t.run(); console.log('PASS ' + t.name); } catch (error) { failed++; console.error('FAIL ' + t.name + '\n' + error.stack); } }
console.log(JSON.stringify({ suite: 'willard-presentation-domain-dom-audio', passed: tests.length - failed, failed, total: tests.length }));
if (failed) process.exitCode = 1;
