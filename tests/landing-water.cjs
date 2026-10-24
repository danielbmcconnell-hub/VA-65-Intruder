'use strict';
// Stateful simulation and original-method adapter checks. Native input, GPU
// presentation and carrier/river scenes are verified separately in browsers.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/survival/landing-water.js'), 'utf8');
const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
function fixture(options = {}) {
  const messages = [], sounds = [], document = { hidden: false };
  const window = { document }, math = Object.create(Math); math.random = () => { throw Error('Landing mechanics cannot consume mission RNG'); };
  vm.runInNewContext(source, { window, Math: math });
  const W = window.LandingWater;
  class Game {
    constructor() {
      this.phase = 'evade'; this.t = 0; this.atm = { wave: .5 }; this.world = { scenery: [], _cells: new Map() };
      this.app = { screen: 'game', keys: {}, gctl: {}, set: { sound: 1 }, audio: { footfall: (...a) => sounds.push(a) }, radio: (...a) => messages.push(a) };
      this.app.game = this;
      this.evade = { p: [0, 0, 0], hdg: 0, moving: false, running: false, hasKnife: true, searchers: [], locals: [], cattle: [] };
      this.rend = { lastEye: null, setCamera(eye) { this.lastEye = eye.slice(); } };
      this.requestSpeed = 4.3; this.oldFootfalls = 0; this.oldSteps = 0;
    }
    _localSolidAt(x, z, r) { return !!(options.blocked && options.blocked(x, z, r)); }
    _moveOnFoot(x, z, dx, dz, r) { return this._localSolidAt(x + dx, z + dz, r) ? [x, z] : [x + dx, z + dz]; }
    _groundFootfalls(dt, e, amount) { if (amount > .001) this.oldFootfalls++; }
    stepEvade(dt) {
      this.t += dt; this.oldSteps++;
      const e = this.evade, before = e.p.slice(), q = this._moveOnFoot(e.p[0], e.p[2], 0, -this.requestSpeed * dt, .43, e);
      e.p[0] = q[0]; e.p[2] = q[1]; e.moving = Math.hypot(e.p[0] - before[0], e.p[2] - before[2]) > .0001; e.running = this.requestSpeed > 2.1;
      this._groundFootfalls(dt, e, Math.hypot(e.p[0] - before[0], e.p[2] - before[2]));
    }
    stepChute(dt) {
      const c = this.chute; c.p[1] += c.v[1] * dt;
      if (c.p[1] <= 1.6) this.onGround();
    }
    onGround() { const c = this.chute; this.chute = null; this._startGroundPhase(c.p[0], c.p[2], c.drift, 'chute'); }
    _startGroundPhase(x, z, heading) { this.phase = 'evade'; this.evade = { p: [x, 0, z], hdg: heading, searchers: [], locals: [], cattle: [], moving: false }; }
    render() { this.rend.setCamera([this.evade.p[0], 1.68, this.evade.p[2]], [0, 0, -1], [0, 1, 0]); }
  }
  const terrainH = options.terrainH || (() => 0), P = { River: { step() { return true; } }, move(g, a, dx, dz) { if (!(options.riverBlocked && options.riverBlocked(a.p[0] + dx, a.p[2] + dz))) { a.p[0] += dx; a.p[2] += dz; } } };
  W.install({ Game, terrainH, POW: P, solidAt: (g, x, z, r) => g._localSolidAt(x, z, r), trees: options.trees });
  const g = new Game();
  return { W, g, P, messages, sounds, document, terrainH };
}
const tree = { id: 'real-tree', kind: 'tree', p: [0, 0, 0], height: 12, crownRadius: 3, trunkRadius: .65 };
function chute(g, x = 0) { g.evade = null; g.phase = 'chute'; g.chute = { p: [x, 6, 0], v: [0, -6.2, 0], open: 1, drift: 0, t: 8, cine: 4.2, cineT: 8 }; }

test('swept canopy contact uses actual tree volume and leaves source geometry untouched', () => {
  const { W } = fixture(), before = [0, 10, 0], after = [0, 6, 0], original = JSON.stringify(tree);
  const hit = W.canopyContact(before, after, { open: 1, verticalSpeed: -6.2 }, [tree]);
  assert.ok(hit); assert.equal(hit.tree.id, 'real-tree'); assert.equal(hit.branch, true); assert.ok(hit.u >= 0 && hit.u <= 1);
  assert.equal(JSON.stringify(tree), original); assert.deepEqual(before, [0, 10, 0]); assert.deepEqual(after, [0, 6, 0]);
  assert.equal(W.canopyContact(before, after, { open: .2, verticalSpeed: -6.2 }, [tree]), null);
  assert.equal(W.canopyContact(before, after, { open: 1, verticalSpeed: 3 }, [tree]), null);
  assert.equal(W.canopyContact([20, 10, 0], [20, 6, 0], { open: 1, verticalSpeed: -6.2 }, [tree]), null);
  assert.equal(W.canopyContact(before, after, { open: 1, verticalSpeed: -6.2 }, []), null);
});

test('a real tree snag holds the pilot above terrain and exposes a warned knife action', () => {
  const f = fixture({ trees: () => [tree] }); chute(f.g);
  assert.equal(f.W.contact(f.g, [0, 10, 0]), true);
  const h = f.g.chute.landing; assert.equal(h.mode, 'hung'); assert.ok(f.g.chute.p[1] > 2); assert.ok(Math.hypot(f.g.chute.p[0], f.g.chute.p[2]) > tree.trunkRadius + .7);
  assert.equal(h.injury.kind, 'branch puncture'); assert.equal(h.hasKnife, true);
  assert.match(f.messages.at(-1)[1], /Hold V|CUT FREE/);
  const phase = f.g.phase, height = f.g.chute.p[1];
  for (let i = 0; i < 30; i++) f.g.stepChute(.05);
  assert.equal(f.g.phase, phase); assert.ok(Math.abs(f.g.chute.p[1] - height) < .03); assert.equal(h.progress, 0);
});

test('knife hold releases into a real gravity descent and transfers bounded injury on landing', () => {
  const f = fixture({ trees: () => [tree], blocked: (x, z) => Math.hypot(x, z) < .9 }); chute(f.g); f.W.contact(f.g, [0, 10, 0]); f.g.app.keys.KeyV = 1;
  for (let i = 0; i < 20; i++) f.g.stepChute(.05);
  assert.equal(f.g.chute.landing.mode, 'hung');
  for (let i = 0; i < 20; i++) f.g.stepChute(.05);
  assert.equal(f.g.chute.landing.mode, 'falling'); assert.equal(f.g.chute.landingReleased, true); assert.equal(f.g.chute.open, 0);
  const previousY = f.g.chute.p[1]; f.g.stepChute(.05); assert.ok(f.g.chute.p[1] < previousY);
  for (let i = 0; i < 100 && f.g.chute; i++) f.g.stepChute(.05);
  assert.equal(f.g.phase, 'evade'); assert.equal(f.g.chute, null); assert.equal(f.g.evade.treeLanding.cutAway, true); assert.deepEqual(Array.from(f.g.evade.chute), [0, 0]);
  assert.ok(f.W.movementFactor(f.g) >= .6 && f.W.movementFactor(f.g) < 1); assert.ok(Math.hypot(f.g.evade.p[0], f.g.evade.p[2]) > .9); assert.ok(f.g.landingCanopy);
});

test('hung state and knife progress freeze on pause, hidden tabs, menus and capture', () => {
  for (const stop of [f => { f.g.paused = true; }, f => { f.document.hidden = true; }, f => { f.g.app.screen = 'ready'; }, f => { f.g._capturePending = true; }]) {
    const f = fixture({ trees: () => [tree] }); chute(f.g); f.W.contact(f.g, [0, 10, 0]); f.g.app.keys.KeyV = 1;
    const before = JSON.stringify(f.g.chute); stop(f); f.g.stepChute(3); assert.equal(JSON.stringify(f.g.chute), before);
  }
});

test('unavailable knife has a slower harness release instead of a permanent soft lock', () => {
  const f = fixture({ trees: () => [tree] }); chute(f.g); f.g.chute.hasKnife = false; f.W.contact(f.g, [0, 10, 0]); f.g.app.keys.KeyV = 1;
  for (let i = 0; i < 40; i++) f.g.stepChute(.05); assert.equal(f.g.chute.landing.mode, 'hung');
  for (let i = 0; i < 25; i++) f.g.stepChute(.05); assert.equal(f.g.chute.landing.mode, 'falling');
});

test('unsafe cutaway is refused and retains a reachable hanging state', () => {
  const f = fixture({ trees: () => [tree], blocked: () => true }); chute(f.g); f.W.contact(f.g, [0, 10, 0]);
  assert.equal(f.W.release(f.g), false); assert.equal(f.g.chute.landing.mode, 'hung'); assert.match(f.messages.at(-1)[1], /blocked/);
});

test('ocean landings swim with low wave-following camera and actual stroke sounds', () => {
  const f = fixture({ terrainH: () => -12 }); f.W.enterGround(f.g); assert.equal(f.W.swimming(f.g), true); const initial = f.sounds.length;
  for (let i = 0; i < 20; i++) f.g.stepEvade(.1);
  near(-f.g.evade.p[2], 2); assert.equal(f.g.evade.running, false); assert.equal(f.g.oldFootfalls, 0); assert.ok(f.sounds.length >= initial + 2); assert.ok(f.sounds.every(a => a[0] === true));
  f.g.render(); const water = f.W.surface(f.g, f.g.evade.p[0], f.g.evade.p[2]); assert.ok(f.g.rend.lastEye[1] - water > .33 && f.g.rend.lastEye[1] - water < .43);
});

test('ocean fast paddle stays bounded and collision does not create idle splash loops', () => {
  const f = fixture({ terrainH: () => -10, blocked: (x, z) => z < -.4 }); f.W.enterGround(f.g); f.g.app.keys.ShiftLeft = 1;
  f.g.stepEvade(.1); near(-f.g.evade.p[2], .135);
  for (let i = 0; i < 20; i++) f.g.stepEvade(.1);
  const n = f.sounds.length, p = f.g.evade.p[2]; for (let i = 0; i < 50; i++) f.g.stepEvade(.1);
  near(f.g.evade.p[2], p); assert.equal(f.sounds.length, n); assert.equal(f.g.evade.running, false);
});

test('shore hysteresis prevents flicker and dry land recovers original walking', () => {
  let height = -.5; const f = fixture({ terrainH: () => height }); f.W.enterGround(f.g); assert.equal(f.W.swimming(f.g), true);
  height = -.1; assert.equal(f.W.swimming(f.g), true); height = .2; assert.equal(f.W.swimming(f.g), false);
  height = -.1; assert.equal(f.W.swimming(f.g), false); f.g.stepEvade(.1); near(-f.g.evade.p[2], .43); assert.equal(f.g.oldFootfalls, 1);
  height = -.41; assert.equal(f.W.swimming(f.g), true);
});

test('temporary landing injury expires without changing permanent gunfire wounds', () => {
  const f = fixture({ terrainH: () => 4 }); f.W.enterGround(f.g); f.g.evade.hurt = true; f.g.evade.landingWater.injury = { kind: 'hard landing', age: 0, duration: .7, factor: .78 };
  const before = f.g.evade.p[2]; f.g.stepEvade(.1); near(before - f.g.evade.p[2], .43 * .78);
  for (let i = 0; i < 9; i++) f.g.stepEvade(.1); assert.equal(f.W.movementFactor(f.g), 1); assert.equal(f.g.evade.hurt, true);
});

test('pause/menu guards freeze actual original movement and source camera remains unchanged on land', () => {
  const f = fixture({ terrainH: () => 5 }); f.g.render(); near(f.g.rend.lastEye[1], 1.68);
  f.g.paused = true; const before = f.g.evade.p.slice(); f.g.stepEvade(.1); assert.deepEqual(f.g.evade.p, before); assert.equal(f.g.oldSteps, 0);
  f.g.paused = false; f.document.hidden = true; f.g.stepEvade(.1); assert.equal(f.g.oldSteps, 0);
  f.document.hidden = false; f.g.pow = { stage: 'cell' }; assert.equal(f.W.swimming(f.g), false); f.g.render(); near(f.g.rend.lastEye[1], 1.68);
});

function riverFixture(options = {}) {
  const f = fixture(options), g = f.g;
  g.pow = { stage: 'river', time: 0, aiClock: 2, base: [-94, 0, 0], input: { forward: 1, strafe: 0 }, river: { mode: 'swim', waterY: 0, phase: 'stream', submerged: false } };
  g.evade.p = [0, -.42, 0]; g.evade.moving = true;
  return f;
}
const pursuer = (id, x = 15) => ({ id, kind: 'nva', armed: true, alive: true, state: 'pursuit', p: [x, .35, -2], visible: true, lastSight: 2, lastKnown: [0, -.42, 0], spd: 0, face: 0 });
function riverTicks(f, a, seconds) { for (let i = 0; i < Math.ceil(seconds / .05); i++) { f.g.pow.aiClock += .05; f.W.riverActorStep(f.g, a, .05, f.P); } }

test('river pursuers warn before entry, then swim with bounded speed and immersed bodies', () => {
  const f = riverFixture(), a = pursuer('guard'); f.g.evade.searchers = [a];
  riverTicks(f, a, .8); near(a.p[0], 15); assert.equal(a.riverPursuit.mode, 'warn'); assert.match(f.messages.at(-1)[1], /enter the river/);
  riverTicks(f, a, 2); assert.equal(a.swimming, true); assert.ok(a.p[0] < 14.5); assert.ok(a.p[1] < -.39 && a.p[1] > -.45); assert.ok(a.spd <= 1.36); assert.ok(a.swimPhase >= 0 && a.swimPhase < 1);
});

test('river entry is a continuous lunge rather than a sudden standing-to-submerged jump', () => {
  const f = riverFixture(), a = pursuer('entry'); f.g.evade.searchers = [a]; let previous = a.p[1], largest = 0;
  for (let i = 0; i < 60; i++) { riverTicks(f, a, .05); largest = Math.max(largest, Math.abs(a.p[1] - previous)); previous = a.p[1]; }
  assert.ok(largest < .26); assert.equal(a.swimming, true); assert.equal(a.riverEntering, false);
  const blocked = riverFixture({ riverBlocked: () => true }), b = pursuer('blocked-entry'); blocked.g.evade.searchers = [b]; riverTicks(blocked, b, 3);
  near(b.p[0], 15); near(b.p[1], .35); assert.equal(b.swimming, false);
});

test('river pursuit cap and civilian checks preserve ordinary dry observers', () => {
  const f = riverFixture(), list = [pursuer('one'), pursuer('two', -15), pursuer('three')]; f.g.evade.searchers = list;
  assert.equal(f.W.riverActorStep(f.g, list[0], .05, f.P), true); assert.equal(f.W.riverActorStep(f.g, list[1], .05, f.P), true); assert.equal(f.W.riverActorStep(f.g, list[2], .05, f.P), false);
  const farmer = { ...pursuer('farmer'), kind: 'farmer', armed: false }; assert.equal(f.W.riverActorStep(f.g, farmer, .05, f.P), false); assert.equal(farmer.riverPursuit, undefined);
});

test('river collisions freeze swimming position and photographed distance phase', () => {
  const f = riverFixture({ riverBlocked: () => true }), a = pursuer('blocked', 14); a.riverPursuit = { mode: 'swim', age: 0, ageTotal: 0, phase: .2, travel: 0, side: 1 }; f.g.evade.searchers = [a];
  riverTicks(f, a, 1); near(a.p[0], 14); near(a.p[2], -2); near(a.swimPhase, .2); near(a.spd, 0);
});

test('a lost or ashore player makes pursuers return rather than follow forever', () => {
  const f = riverFixture(), a = pursuer('return', 13.9); a.riverPursuit = { mode: 'swim', age: 0, ageTotal: 0, phase: 0, travel: 0, side: 1 }; f.g.evade.searchers = [a]; f.g.evade.p[0] = 17;
  riverTicks(f, a, 5); assert.equal(a.riverPursuit.mode, 'done'); assert.equal(a.swimming, false); assert.ok(a.p[0] > 14.5); assert.ok(a.riverRetryAt > f.g.pow.aiClock);
});

test('river water sounds follow intentional travel and bank cues explain physical exits', () => {
  const f = riverFixture(); f.W.riverStep(f.g, .1, f.P); const initial = f.sounds.length;
  for (let i = 0; i < 12; i++) { f.g.evade.p[2] += .1; f.W.riverStep(f.g, .1, f.P); } assert.ok(f.sounds.length > initial); assert.ok(f.sounds.every(a => a[0]));
  f.g.pow.input.forward = 0; const idle = f.sounds.length;
  for (let i = 0; i < 20; i++) { f.g.evade.p[2] += .1; f.W.riverStep(f.g, .1, f.P); } assert.equal(f.sounds.length, idle, 'current alone cannot become repeated arm strokes');
  f.g.pow.river.mode = 'bank'; f.W.riverStep(f.g, .1, f.P); assert.match(f.messages.at(-1)[1], /out on the bank/);
});

test('river movement pauses under hidden/menu/capture conditions without consuming pursuit timers', () => {
  const f = riverFixture(), a = pursuer('paused'); f.g.evade.searchers = [a]; f.W.riverActorStep(f.g, a, .1, f.P); const before = JSON.stringify(a);
  f.g.paused = true; assert.equal(f.W.riverActorStep(f.g, a, 2, f.P), false); assert.equal(JSON.stringify(a), before);
  f.g.paused = false; f.document.hidden = true; assert.equal(f.W.riverActorStep(f.g, a, 2, f.P), false); assert.equal(JSON.stringify(a), before);
});
