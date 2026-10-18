'use strict';
// Presentation-only fixtures: production combat creates these public counters
// and visible bursts. The integrated browser suite verifies real flight/input.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/willard/presentation.js'), 'utf8');
const tests = [], test = (name, run) => tests.push({ name, run });
function fixture() {
  const ids = new Map(), events = {};
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; this.classList = { toggle() {}, remove() {} }; }
    set id(id) { this._id = id; ids.set(id, this); } get id() { return this._id; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, fn) { (this.listeners[key] ||= []).push(fn); }
    getBoundingClientRect() { return { left: 10, right: 120, top: 20, bottom: 70 }; }
    blur() {}
  }
  const host = new Node('section'); host.id = 'game'; const canvas = new Node('canvas'); canvas.id = 'gl';
  const document = { hidden: false, body: new Node('body'), getElementById: id => ids.get(id), createElement: tag => new Node(tag), addEventListener() {} };
  const window = { addEventListener(key, fn) { (events[key] ||= []).push(fn); } };
  vm.runInContext(source, vm.createContext({ window, document }));
  const game = { ac: { p: [0, 500, 0], yaw: 0, alive: true }, hud: { scope: false }, world: { score: { damage: 0 } }, paused: false, extView: false,
    willard: { phase: 'defend', elapsed: 10, cannonHits: 0, flakHits: 0, attackBursts: 0, warningClock: 0, contact: { observed: true, bearing: Math.PI, lastSeen: 10 }, route: {}, enemy: {}, flak: { bursts: [] } } };
  const App = { game, screen: 'game', graphicsContextLost: false, set: { sound: false } }, api = window.WillardPresentation;
  const context = { App, toggleCamera(g) { g.extView = !g.extView; } }; api.install(context);
  const tick = delta => { game.willard.elapsed += delta; api.render(game); return api.snapshot(game); };
  const control = id => {
    const node = ids.get(id), event = extra => ({ pointerType: 'touch', pointerId: 1, detail: 1, currentTarget: node, clientX: 50, clientY: 40, stopPropagation() {}, ...extra });
    return { send(type, extra) { for (const fn of node.listeners[type] || []) fn(event(extra)); }, click(extra) { node.onclick(event(extra)); } };
  };
  const key = extra => { let prevented = false; const e = { code: 'KeyZ', target: null, repeat: false, preventDefault() { prevented = true; }, ...extra }; for (const fn of events.keydown || []) fn(e); return prevented; };
  return { api, game, App, context, document, ids, tick, control, key, events };
}
test('steady pursuit and hidden AI state never manufacture a critical warning', () => {
  const f = fixture(); Object.defineProperty(f.game.willard.enemy, 'p', { get() { throw Error('presentation read hidden interceptor position'); } });
  f.game.willard.enemy.state = 'ATTACK'; f.game.willard.enemy.health = .1;
  for (let i = 0; i < 100; i++) assert.equal(f.tick(.1).alert, null);
});
test('a real cannon-hit counter increase produces a brief damage alert without changing damage', () => {
  const f = fixture(); f.game.willard.cannonHits++; f.game.world.score.damage = .4;
  assert.equal(f.tick(.1).alert.kind, 'cannon-hit'); assert.equal(f.ids.get('willardAlertTitle').textContent, 'CANNON HIT');
  assert.equal(f.game.world.score.damage, .4); assert.equal(f.tick(2.5).alert, null);
});
test('flak hits and other actual airframe damage have distinct truthful captions', () => {
  const f = fixture(); f.game.willard.flakHits++; assert.equal(f.tick(.1).alert.kind, 'flak-hit');
  f.tick(3); f.game.world.score.damage += .1; assert.equal(f.tick(.1).alert.kind, 'damage'); assert.equal(f.api.snapshot(f.game).alert.title, 'AIRFRAME DAMAGE');
});
test('simultaneous cannon and flak damage is described without guessing a single source', () => {
  const f = fixture(); f.game.willard.cannonHits++; f.game.willard.flakHits++; const s = f.tick(.1);
  assert.equal(s.alert.kind, 'damage'); assert.equal(s.alert.title, 'CANNON + FLAK HIT');
});
test('cannon fire uses only a recent observed clock direction', () => {
  const f = fixture(); f.game.willard.warningClock = 4; f.game.willard.attackBursts = 1; const s = f.tick(.1);
  assert.equal(s.alert.kind, 'cannon'); assert.match(s.alert.detail, /LAST SIGHTING ABOUT 6 O’CLOCK/);
});
test('stale, absent, future and unobserved sightings never add a cannon direction', () => {
  for (const contact of [null, { observed: false, bearing: Math.PI, lastSeen: 10 }, { observed: true, bearing: Math.PI, lastSeen: 0 }, { observed: true, bearing: Math.PI, lastSeen: 20 }]) {
    const f = fixture(); f.game.willard.contact = contact; f.game.willard.warningClock = 4; f.game.willard.attackBursts++;
    const s = f.tick(.1); assert.match(s.alert.detail, /CONTACT NOT HELD/); assert.doesNotMatch(s.alert.detail + s.contact, /O’CLOCK/);
  }
});
test('damage priority survives subsequent cannon and flak warnings', () => {
  const f = fixture(); f.game.willard.cannonHits++; f.game.willard.attackBursts++; f.game.willard.warningClock = 4;
  f.game.willard.flak.bursts.push({ id: 1, age: .1, p: [80, 500, 0] }); const s = f.tick(.1); assert.equal(s.alert.kind, 'cannon-hit');
});
test('a genuinely nearby fresh burst gets a coarse visible-burst direction', () => {
  const f = fixture(); f.game.willard.flak.bursts.push({ id: 3, age: .1, p: [90, 500, 0] }); const s = f.tick(.1);
  assert.equal(s.alert.kind, 'flak'); assert.match(s.alert.detail, /BURST ABOUT 3 O’CLOCK/); assert.match(s.alert.detail, /GUNS ARE HOSTILE/);
});
test('distant, expired, future and malformed bursts never create close-flak warnings', () => {
  for (const burst of [{ id: 1, age: .1, p: [0, 500, 1000] }, { id: 2, age: 2, p: [0, 500, 80] }, { id: 3, age: -.1, p: [0, 500, 80] }, { id: 4, age: .1, p: [NaN, 500, 0] }, { id: 5, age: .1, p: null }]) {
    const f = fixture(); f.game.willard.flak.bursts.push(burst); assert.equal(f.tick(.1).alert, null);
  }
});
test('alerts expire on simulation time and unchanged evidence cannot keep them alive', () => {
  const f = fixture(); f.game.willard.warningClock = 4; f.game.willard.attackBursts = 1;
  assert.equal(f.tick(.1).alert.kind, 'cannon'); for (let i = 0; i < 100; i++) assert.equal(f.api.snapshot(f.game).alert.kind, 'cannon');
  assert.equal(f.tick(2).alert, null); assert.equal(f.tick(20).alert, null);
});
test('burst warning cooldown limits repetition and each burst is handled once', () => {
  const f = fixture(); const b = { id: 1, age: .1, p: [100, 500, 0] }; f.game.willard.flak.bursts.push(b); assert.ok(f.tick(.1).alert);
  f.game.willard.flak.bursts.push({ id: 2, age: 0, p: [100, 500, 0] }); assert.equal(f.tick(2).alert, null);
  assert.ok(f.tick(4).alert); assert.equal(f.tick(2).alert, null); assert.equal(f.tick(10).alert, null);
});
test('loading saved damage and retry counter resets do not replay old hits', () => {
  const f = fixture(); f.game.willard.cannonHits = 4; f.game.world.score.damage = .8; assert.ok(f.tick(.1).alert);
  f.game.willard.elapsed = 0; assert.equal(f.api.snapshot(f.game).alert, null);
  f.game.willard.cannonHits = 1; f.game.world.score.damage = .2; assert.equal(f.api.snapshot(f.game).alert, null);
  const next = { ...f.game, willard: { ...f.game.willard, cannonHits: 20 }, world: { score: { damage: 2 } } }; f.App.game = next; assert.equal(f.api.snapshot(next).alert, null);
});
test('pause, menus, capture, parachutes and graphics loss suppress combat alerts', () => {
  for (const mutate of [f => f.game.paused = true, f => f.App.screen = 'ready', f => f.game.pow = {}, f => f.game.evade = {}, f => f.game.chute = {}, f => f.game.ejected = true, f => f.App.graphicsContextLost = true, f => f.document.hidden = true]) {
    const f = fixture(); f.game.willard.cannonHits++; assert.ok(f.tick(.1).alert); mutate(f); f.api.render(f.game);
    assert.equal(f.api.snapshot(f.game)?.alert || null, null); assert.equal(f.ids.get('willardHUD').hidden, true);
  }
});
test('rear magnification affects only its declared camera FOV, never aircraft or AI', () => {
  const f = fixture(); const before = JSON.stringify({ ac: f.game.ac, enemy: f.game.willard.enemy, score: f.game.world.score });
  assert.equal(f.api.zoom(f.game), false); assert.equal(f.api.rearFov(f.game), 54); f.api.rear(f.game); assert.equal(f.api.zoom(f.game), true); assert.equal(f.api.rearFov(f.game), 34);
  assert.equal(f.ids.get('willardZoom').attributes['aria-pressed'], 'true'); assert.equal(JSON.stringify({ ac: f.game.ac, enemy: f.game.willard.enemy, score: f.game.world.score }), before);
});
test('LOOK FORWARD and camera changes clear magnification before the next rear view', () => {
  for (const exit of [f => f.api.rear(f.game), f => f.control('willardCamera').click({ pointerType: 'mouse' })]) {
    const f = fixture(); f.api.rear(f.game); f.api.zoom(f.game); exit(f); assert.equal(f.game.willard.rear, false); assert.equal(f.game.willard.rearZoom, false); assert.equal(f.api.rearFov(f.game), 54);
    f.api.rear(f.game); assert.equal(f.api.rearFov(f.game), 54);
  }
});
test('canonical camera action supports keyboard and legacy-view callers with exactly one toggle', () => {
  const f = fixture(); let calls = 0; f.context.toggleCamera = g => { calls++; g.extView = !g.extView; };
  for (let i = 0; i < 6; i++) {
    f.api.rear(f.game); f.api.zoom(f.game); f.game.camSm = { p: [1, 2, 3] };
    const before = f.game.extView; assert.equal(f.api.camera(f.game), true);
    assert.equal(f.game.extView, !before); assert.equal(calls, i + 1); assert.equal(f.game.willard.rear, false); assert.equal(f.game.willard.rearZoom, false); assert.equal(f.game.camSm, null);
  }
  assert.equal(f.events.keydown.length, 1); assert.equal(f.api.rearFov(f.game), 54);
});
test('native VIEW delegates the same camera action without a duplicate compatibility-click toggle', () => {
  const f = fixture(); f.api.rear(f.game); f.api.zoom(f.game); f.game.camSm = { p: [1, 2, 3] };
  const c = f.control('willardCamera'), before = f.game.extView; c.send('pointerdown'); c.send('pointerup'); c.click();
  assert.equal(f.game.extView, !before); assert.equal(f.game.willard.rear, false); assert.equal(f.game.willard.rearZoom, false); assert.equal(f.game.camSm, null);
});
test('canonical camera action rejects paused, captured and inactive flight input', () => {
  for (const change of [f => f.game.paused = true, f => f.App.screen = 'ready', f => f.game.pow = {}, f => f.game.chute = {}, f => f.game.ac.alive = false]) {
    const f = fixture(); f.api.rear(f.game); f.api.zoom(f.game); const before = JSON.stringify({ rear: f.game.willard.rear, zoom: f.game.willard.rearZoom, external: f.game.extView }); change(f);
    assert.equal(f.api.camera(f.game), false); assert.equal(JSON.stringify({ rear: f.game.willard.rear, zoom: f.game.willard.rearZoom, external: f.game.extView }), before);
  }
});
test('rear zoom touch releases exactly once and its compatibility click is deduplicated', () => {
  const f = fixture(); f.api.rear(f.game); const c = f.control('willardZoom'); c.send('pointerdown'); assert.equal(f.api.rearFov(f.game), 54);
  c.send('pointerup'); assert.equal(f.api.rearFov(f.game), 34); c.click(); assert.equal(f.api.rearFov(f.game), 34);
  c.click({ pointerType: 'mouse' }); assert.equal(f.api.rearFov(f.game), 54);
});
test('cancelled, dragged and off-button zoom touches cannot activate magnification', () => {
  for (const mode of ['cancel', 'drag', 'outside']) { const f = fixture(); f.api.rear(f.game); const c = f.control('willardZoom'); c.send('pointerdown');
    if (mode === 'cancel') c.send('pointercancel'); if (mode === 'drag') c.send('pointermove', { clientX: 100 });
    c.send('pointerup', mode === 'outside' ? { clientX: 200 } : {}); c.click(); assert.equal(f.api.rearFov(f.game), 54);
  }
});
test('Z works only in active rear view and respects keyboard focus and modifiers', () => {
  const f = fixture(); assert.equal(f.key({}), false); f.api.rear(f.game); assert.equal(f.key({}), true); assert.equal(f.api.rearFov(f.game), 34);
  for (const event of [{ repeat: true }, { target: { tagName: 'INPUT' } }, { target: { tagName: 'BUTTON' } }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) assert.equal(f.key(event), false);
  f.game.paused = true; assert.equal(f.key({}), false); assert.equal(f.api.rearFov(f.game), 54);
});
test('repeated install keeps one zoom button and one keyboard listener', () => {
  const f = fixture(), first = f.ids.get('willardZoom'); for (let i = 0; i < 20; i++) f.api.install(f.context);
  assert.equal(f.ids.get('willardZoom'), first); assert.equal(f.events.keydown.length, 1); assert.equal(f.ids.get('willardControls').children.length, 4);
});
test('combat feedback does not add checkpoint data, mutate counters, or allocate timers', () => {
  const f = fixture(); const before = JSON.stringify(f.game); for (let i = 0; i < 100; i++) f.api.step(f.game);
  assert.equal(JSON.stringify(f.game), before); assert.equal(f.api.inspect().ownedSources, 0); assert.doesNotMatch(source, /setInterval\s*\(|setTimeout\s*\(|new\s+AudioContext/);
});
let failed = 0;
for (const t of tests) { try { t.run(); console.log('PASS ' + t.name); } catch (error) { failed++; console.error('FAIL ' + t.name + '\n' + error.stack); } }
console.log(JSON.stringify({ suite: 'combat-feedback-domain-dom', passed: tests.length - failed, failed, total: tests.length }));
if (failed) process.exitCode = 1;
