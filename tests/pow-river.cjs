'use strict';

// Pure simulation and integration-contract tests. The real River module runs
// in a VM without a DOM or GPU; geometry, swept movement, and persistence are
// explicit stubs. These checks do not claim browser or iPhone verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/pow/river.js'), 'utf8');
const coreContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pow/core.js'), 'utf8'), coreContext,
  { filename: 'assets/pow/core.js' });
const realCollision = coreContext.window.POW;
const clone = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, tolerance = 1e-7) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `expected ${actual} to be within ${tolerance} of ${expected}`);
const gap = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

function fixture(saved, options = {}) {
  const calls = { boxes: [], objects: [], moves: [], saves: [], notices: [], finishes: [], meshes: 0, captures: 0 };
  const marker = {};
  const POW = {
    preservedNamespaceMember: marker,
    ensureMeshes() { calls.meshes++; },
    addBox(game, id, mesh, dx, dy, dz, hx, hy, hz, options) {
      const base = game.pow.base;
      const box = { id, m: mesh, p: [base[0] + dx, base[1] + dy, base[2] + dz],
        y: options.yaw || 0, scale: [hx * 2, hy * 2, hz * 2], t: options.tint || [1, 1, 1, 0] };
      calls.boxes.push(box); game.campGeo.push(box);
      if (options.solid) game.pow.solids.push({ id, x: box.p[0], z: box.p[2], hw: hx, hl: hz,
        minY: box.p[1] - hy, maxY: box.p[1] + hy, a: options.yaw || 0 });
      return box;
    },
    addObject(game, object) { calls.objects.push(object); game.pow.objects.push(object); },
    move(game, actor, dx, dz, radius) {
      assert.ok([dx, dz, radius].every(Number.isFinite), 'movement must remain finite');
      assert.ok(radius > 0, 'swept movement needs a physical radius');
      calls.moves.push({ dx, dz, radius });
      if (!game.blockMovement) { actor.p[0] += dx; actor.p[2] += dz; }
    },
    save(game) { calls.saves.push(clone({ pow: game.pow, evade: game.evade })); },
    notify(game, message, tone) { calls.notices.push({ message, tone }); },
    finish(game, result) { calls.finishes.push(clone(result)); }
  };
  if (options.coreCollision) {
    POW.addBox = (game, ...args) => {
      const box = realCollision.addBox(game, ...args); calls.boxes.push(box); return box;
    };
    POW.move = (game, actor, dx, dz, radius) => {
      assert.ok([dx, dz, radius].every(Number.isFinite));
      calls.moves.push({ dx, dz, radius });
      if (!game.blockMovement) realCollision.move(game, actor, dx, dz, radius);
    };
  }
  const context = vm.createContext({ POW });
  vm.runInContext(source, context, { filename: 'assets/pow/river.js' });
  assert.equal(context.POW.preservedNamespaceMember, marker);
  assert.equal(typeof context.document, 'undefined');
  assert.equal(typeof context.window, 'undefined');
  assert.equal(calls.meshes, 0, 'loading must not initialize the game');
  const game = {
    pow: saved ? clone(saved.pow) : {
      base: [100, 20, 300], day: 3, flags: {}, inventory: {},
      stats: { physical: 65, fatigue: 35, morale: 65, hope: 65, memory: 65 },
      input: {}, solids: [], surfaces: [], objects: []
    },
    evade: saved ? clone(saved.evade) : { p: [194, 20, 300], hdg: 0, searchers: [] },
    campGeo: [], app: { keys: {}, gctl: {} },
    captured() { calls.captures++; },
    setHour(hour) { assert.ok(Number.isFinite(hour) && hour >= 0 && hour < 24); }
  };
  const River = context.POW.River;
  assert.equal(River.enter(game), true);
  return { game, River, calls, r: game.pow.river, e: game.evade, s: game.pow };
}

function advance(f, seconds) {
  let remaining = seconds;
  while (remaining > 1e-8) {
    const dt = Math.min(.25, remaining);
    f.River.step(f.game, dt); remaining -= dt;
  }
}
const tests = [];
function test(name, run) { tests.push({ name, run }); }

test('loads without DOM/GPU and builds a local river through the existing POW API', () => {
  const f = fixture();
  assert.ok(Object.isFrozen(f.River.constants));
  assert.equal(f.s.stage, 'river'); assert.equal(f.s.customMovement, true);
  assert.equal(f.e.river, true); assert.equal(f.e.frozen, false); assert.equal(f.e.hasRadio, false);
  assert.equal(f.s.p, f.e.p); assert.equal(f.calls.meshes, 1);
  assert.equal(f.e.searchers.length, 4);
  assert.ok(f.e.searchers.every(actor => gap(actor.p, f.e.p) > 20));
  assert.ok(f.calls.boxes.some(box => box.id === 'river-water'));
  assert.ok(f.calls.boxes.every(box => box.p.concat(box.scale).every(Number.isFinite)
    && box.scale.every(size => size > 0)));
  assert.ok(f.s.objects.some(object => object.id.startsWith('river-hide')));
  assert.ok(f.s.objects.every(object => object.view === false), 'river interactions must remain usable while looking around');
  assert.equal(f.calls.captures, 0); assert.equal(f.calls.finishes.length, 0);
});

test('current moves the player physically and route distance uses actual downstream displacement', () => {
  const f = fixture(), before = f.e.p.slice();
  advance(f, 1);
  assert.ok(f.e.p[2] > before[2] + .75, 'idle floating must be carried downstream');
  near(f.r.logicalDistance, (f.e.p[2] - before[2]) * f.River.constants.distanceScale);
  near(f.r.elapsed, 1); assert.ok(f.r.hours > .2);
  assert.ok(f.calls.moves.length >= 30, 'the current must use the swept-movement hook');
  f.game.blockMovement = true;
  const stopped = f.r.logicalDistance, position = f.e.p.slice();
  advance(f, 2);
  near(f.r.logicalDistance, stopped); assert.deepEqual(f.e.p.slice(0, 1).concat(f.e.p[2]), [position[0], position[2]]);
  assert.ok(f.s.stats.physical < 65, 'a blocked swimmer experiences the obstacle instead of phantom travel');
});

test('keyboard, touch, and explicit input drive the same physical swim movement', () => {
  const keyboard = fixture(), touch = fixture(), explicit = fixture();
  keyboard.game.app.keys.KeyW = 1;
  touch.game.app.gctl.pitch = 10; // Sensitivity can exceed one; input must clamp.
  explicit.s.input.forward = 1;
  for (const f of [keyboard, touch, explicit]) advance(f, .75);
  for (let axis = 0; axis < 3; axis++) {
    near(keyboard.e.p[axis], touch.e.p[axis]); near(keyboard.e.p[axis], explicit.e.p[axis]);
  }
  near(keyboard.r.logicalDistance, touch.r.logicalDistance);
  assert.ok(keyboard.e.p[2] > fixture().e.p[2]);
});

test('manual crossing reaches the bank, bank walking earns no route distance, and concealment recovers over days', () => {
  const f = fixture();
  f.s.stats.fatigue = 0; f.s.stats.physical = 100;
  assert.equal(f.River.interact(f.game, 'float'), true); // Choose swimming.
  f.s.input.strafe = -1; // Heading pi: this crosses toward the right bank.
  advance(f, 12);
  assert.ok(f.e.p[0] >= f.s.base[0] + 94 + f.River.constants.channelHalfWidth);
  assert.equal(f.r.mode, 'bank'); assert.ok(f.r.logicalDistance > 0);
  const reached = f.r.logicalDistance;
  f.s.input = { forward: 1 };
  const shelter = f.s.objects.find(object => object.id === 'river-hide-1-2');
  let steps = 0;
  while (f.e.p[2] < shelter.p[2] - 1 && steps++ < 100) f.River.step(f.game, .25);
  assert.ok(gap(f.e.p, shelter.p) < shelter.radius, 'walk to the visible shelter');
  near(f.r.logicalDistance, reached);
  f.s.input = {};
  f.s.stats.fatigue = 88; f.s.stats.physical = 25;
  assert.equal(f.River.interact(f.game, shelter, 'hide'), true);
  const position = f.e.p.slice(), restDay = f.s.day, initialHealth = f.s.stats.physical;
  advance(f, 180);
  assert.equal(f.r.resting, true); assert.equal(f.r.mode, 'hidden'); assert.equal(f.e.hidden, true);
  assert.deepEqual(f.e.p, position); near(f.r.logicalDistance, reached);
  assert.ok(f.s.stats.fatigue < 5); assert.ok(f.s.stats.physical > initialHealth + 40);
  assert.ok(f.s.day > restDay, 'rest should advance into another day');
  assert.equal(f.calls.captures, 0); assert.equal(f.calls.finishes.length, 0);
  f.s.input.forward = 1; f.River.step(f.game, .25);
  assert.equal(f.r.resting, false); assert.equal(f.r.mode, 'bank');
});

test('shelter interaction requires reaching the bank and the physical shelter', () => {
  const f = fixture(), shelter = f.s.objects.find(object => object.id === 'river-hide-1-2');
  assert.equal(f.River.interact(f.game, shelter, 'hide'), false);
  f.e.p[0] = shelter.p[0]; f.e.p[2] = shelter.p[2] + shelter.radius + 1;
  assert.equal(f.River.interact(f.game, shelter, 'hide'), false);
  assert.equal(f.r.resting, false);
  f.e.p[2] = shelter.p[2];
  assert.equal(f.River.interact(f.game, shelter, 'hide'), true);
  assert.ok(f.r.cover === undefined || Number.isFinite(f.r.cover));
});

test('dawn and the fifteen-mile historical comparison cannot force failure', () => {
  const f = fixture();
  f.r.hours = 5.49;
  f.r.logicalDistance = f.River.constants.historicalBenchmark - 10;
  advance(f, 2);
  assert.ok(f.r.hour > 5.5); assert.equal(f.r.benchmarkPassed, true);
  assert.equal(f.r.phase, 'stream'); assert.equal(f.r.finished, false);
  const distance = f.r.logicalDistance;
  f.r.hours = 12.7; advance(f, 1);
  assert.ok(f.r.daylight > .9); assert.ok(f.r.logicalDistance > distance);
  assert.equal(f.calls.captures, 0); assert.equal(f.calls.finishes.length, 0);
});

test('a held dive surfaces automatically, recovers breath, and permits a later dive', () => {
  const f = fixture(); f.s.input.climb = true;
  advance(f, .25);
  assert.equal(f.r.submerged, true); assert.ok(f.r.breath < 100);
  assert.ok(f.r.cover > .98); assert.ok(f.r.visibility < .05);
  let attempts = 0;
  while (!f.calls.notices.some(n => /surface automatically/.test(n.message)) && attempts++ < 100)
    f.River.step(f.game, .25);
  assert.ok(attempts < 100, 'holding dive must exhaust air');
  assert.equal(f.r.submerged, false); assert.ok(f.r.surfacingCooldown > 5);
  const lowBreath = f.r.breath;
  advance(f, 1);
  assert.equal(f.r.submerged, false, 'held dive cannot bypass the breathing cooldown');
  assert.ok(f.r.breath > lowBreath);
  f.s.input.climb = false; advance(f, 10);
  near(f.r.breath, 100); near(f.r.surfacingCooldown, 0);
  f.s.input.climb = true; advance(f, .25);
  assert.equal(f.r.submerged, true); assert.ok(f.r.breath < 100);
  assert.equal(f.calls.captures, 0); assert.equal(f.calls.finishes.length, 0);
});

test('the delta requires real travel and boarding requires physically reaching the skiff', () => {
  const f = fixture();
  f.r.logicalDistance = f.River.constants.deltaDistance - 30;
  f.game.blockMovement = true; advance(f, 4);
  assert.equal(f.r.phase, 'stream'); assert.equal(f.r.boatOwned, false);
  f.game.blockMovement = false; advance(f, 1);
  assert.equal(f.r.phase, 'delta'); assert.equal(f.s.flags.deltaReached, true);
  const boarding = f.s.objects.find(object => object.id === 'river-board');
  assert.ok(boarding && gap(f.e.p, boarding.p) > 20);
  assert.equal(f.River.interact(f.game, boarding, 'board'), false);
  assert.equal(f.r.boatOwned, false);
  f.e.p = [f.r.boat.p[0], f.r.waterY - .42, f.r.boat.p[2] - 6]; f.s.p = f.e.p;
  assert.equal(f.River.interact(f.game, boarding, 'board'), false);
  f.e.p[2] = f.r.boat.p[2] - 3;
  assert.equal(f.River.interact(f.game, boarding, 'board'), true);
  assert.equal(f.r.mode, 'boat'); assert.equal(f.s.flags.deltaBoat, true); assert.equal(f.s.p, f.e.p);
  assert.equal(f.River.interact(f.game, boarding, 'board'), false, 'the skiff cannot be acquired twice');
  const before = f.e.p.slice(); f.e.hdg = Math.PI / 2; f.s.input.forward = 1; advance(f, 1);
  assert.ok(f.e.p[0] > before[0]); assert.ok(f.r.boat.speed > 1);
  assert.deepEqual(f.r.boat.p, f.e.p);
  const visible = f.game.campGeo.find(g => g.id === 'river-skiff');
  near(visible.p[0], f.e.p[0]); near(visible.p[2], f.e.p[2]);
});

test('recentring keeps route progress, pursuit state, NPC coordinates, and saved state consistent', () => {
  const f = fixture(), length = f.River.constants.segmentLength;
  f.e.p[2] = f.s.base[2] + 99.9; f.r.logicalDistance = 1000;
  const actor = f.e.searchers[0]; actor.seen = 1; actor.wp = 1;
  actor.p[2] = f.s.base[2] + 150; actor.home = actor.p;
  actor.goal[2] = f.s.base[2] + 160;
  actor.lastKnown = [actor.p[0], actor.p[1], f.s.base[2] + 170];
  actor.route = [[actor.p[0], actor.p[1], f.s.base[2] + 140], [actor.p[0], actor.p[1], f.s.base[2] + 180]];
  f.r.boat = { p: [194, f.r.waterY, f.s.base[2] + 120], speed: 0 };
  f.r.hideAt = [212, f.r.waterY + .35, f.s.base[2] + 140]; f.e.pickup = f.r.hideAt;
  const before = { player: f.e.p[2], actor: actor.p[2], goal: actor.goal[2], known: actor.lastKnown[2],
    route: actor.route.map(p => p[2]), boat: f.r.boat.p[2], hide: f.r.hideAt[2] };
  f.River.step(f.game, .25);
  assert.equal(f.r.segment, 1); near(f.r.streamOffset, length);
  near(f.r.logicalDistance - 1000, (f.e.p[2] + f.r.streamOffset - before.player) * 100);
  assert.ok(f.r.logicalDistance > 1000);
  near(actor.p[2], before.actor - length); near(actor.home[2], before.actor - length);
  near(actor.goal[2], before.goal - length); near(actor.lastKnown[2], before.known - length);
  actor.route.forEach((p, index) => near(p[2], before.route[index] - length));
  near(f.r.boat.p[2], before.boat - length); near(f.r.hideAt[2], before.hide - length);
  near(f.e.pickup[2], before.hide - length); assert.equal(actor.seen, 1); assert.equal(actor.wp, 1);
  const saved = f.calls.saves.at(-1);
  assert.equal(saved.pow.river.segment, 1); assert.equal(saved.pow.river.streamOffset, length);
  const resumed = fixture(saved);
  near(resumed.r.logicalDistance, saved.pow.river.logicalDistance);
  near(resumed.r.streamOffset, length); near(resumed.e.searchers[0].p[2], saved.evade.searchers[0].p[2]);
  assert.equal(resumed.e.searchers.length, saved.evade.searchers.length, 'resume must not duplicate observers');
  near(resumed.e.p[2], saved.evade.p[2]);
});

function gulfFixture() {
  const f = fixture(); f.r.logicalDistance = f.River.constants.gulfDistance - 10;
  f.River.step(f.game, .25);
  assert.equal(f.r.phase, 'gulf'); assert.equal(f.s.flags.fictionalContinuation, true);
  assert.equal(f.e.searchers.length, 0); assert.ok(f.r.ship && f.r.recoveryPoint);
  return f;
}

test('a saved offshore journey resumes without land observers and preserves its physical state', () => {
  const f = gulfFixture();
  f.r.breath = 63; f.r.boatOwned = true; f.r.mode = 'boat';
  f.r.boat = { p: f.e.p.slice(), speed: .42, yaw: f.e.hdg };
  f.r.ship.acknowledged = true; f.r.signalProgress = 8.5;
  const saved = clone({ pow: f.s, evade: f.e });
  const resumed = fixture(saved);
  assert.equal(resumed.r.phase, 'gulf');
  assert.equal(resumed.e.searchers.length, 0, 'an offshore checkpoint must not seed bank guards');
  assert.deepEqual(clone(resumed.e.p), saved.evade.p);
  assert.deepEqual(clone(resumed.r.ship), saved.pow.river.ship);
  assert.deepEqual(clone(resumed.r.boat), saved.pow.river.boat);
  near(resumed.r.breath, 63); near(resumed.r.logicalDistance, saved.pow.river.logicalDistance);
  assert.equal(resumed.r.boatOwned, true); assert.equal(resumed.r.mode, 'boat');
  near(resumed.r.signalProgress, 8.5);
  assert.ok(resumed.game.campGeo.some(g => g.id === 'naval-contact' && g.m === 'powRiverNaval'));
  assert.ok(resumed.game.campGeo.some(g => g.id === 'river-skiff' && g.m === 'powRiverSkiff'));
  assert.ok(resumed.s.solids.some(solid => solid.id === 'naval-hull'));
  assert.ok(resumed.s.objects.some(object => object.id === 'river-signal' && object.view === false));
  assert.ok(resumed.s.objects.some(object => object.id === 'river-float' && object.view === false));
  assert.equal(resumed.calls.finishes.length, 0);
});

test('offshore signals require materials and physical proximity, and break when swimming away', () => {
  const f = gulfFixture(), target = f.s.objects.find(o => o.id === 'river-signal');
  f.s.inventory.mirror = true;
  assert.equal(f.River.interact(f.game, target, 'signal'), false, 'an inventory item cannot signal from the river mouth');
  f.e.p = [target.p[0], f.r.waterY - .42, target.p[2] - 11]; f.s.p = f.e.p;
  f.r.signalFabric = false; f.s.inventory = {};
  assert.equal(f.River.interact(f.game, target, 'signal'), false);
  f.s.inventory = { mirror: true };
  assert.equal(f.River.interact(f.game, target, 'signal'), true);
  assert.equal(f.r.ship.acknowledged, false); assert.equal(f.calls.finishes.length, 0);
  f.e.p[2] = target.p[2] - 25; f.River.step(f.game, .25);
  assert.equal(f.r.signaling, false); near(f.r.signalProgress, 0);
});

test('acknowledgement requires signaling and rescue requires a sustained close approach exactly once', () => {
  const f = gulfFixture(), target = f.s.objects.find(o => o.id === 'river-signal');
  f.e.p = [target.p[0], f.r.waterY - .42, target.p[2] - 12]; f.s.p = f.e.p;
  advance(f, 5);
  assert.equal(f.r.ship.acknowledged, false, 'proximity alone must not arrange rescue');
  assert.equal(f.River.interact(f.game, target, 'signal'), true);
  let steps = 0;
  while (!f.r.ship.acknowledged && steps++ < 240) f.River.step(f.game, .25);
  assert.ok(steps < 240); assert.equal(f.s.flags.navalSignalAcknowledged, true);
  assert.ok(gap(f.e.p, f.r.recoveryPoint) > 5.2);
  assert.equal(f.calls.finishes.length, 0); near(f.r.recoveryTime, 0);
  f.e.p[2] = target.p[2] - 4;
  f.River.step(f.game, .25);
  assert.equal(f.calls.finishes.length, 0, 'entering recovery range must not instantly finish');
  advance(f, 15);
  assert.equal(f.r.finished, true); assert.equal(f.calls.finishes.length, 1);
  const result = f.calls.finishes[0];
  assert.equal(result.id, 'pow-fictional-river-rescue'); assert.equal(result.rescued, true);
  assert.equal(result.historical, false); assert.match(result.text, /FICTIONAL ALTERNATE HISTORY/);
  assert.equal(f.s.flags.fictionalRescue, true); assert.equal(f.calls.captures, 0);
  const ended = clone({ p: f.e.p, elapsed: f.r.elapsed, distance: f.r.logicalDistance });
  advance(f, 10); assert.equal(f.River.interact(f.game, target, 'signal'), false);
  assert.deepEqual(clone({ p: f.e.p, elapsed: f.r.elapsed, distance: f.r.logicalDistance }), ended);
  assert.equal(f.calls.finishes.length, 1);
});

test('frame stalls are capped and substepped; invalid dt has no side effects', () => {
  const stalled = fixture(), normal = fixture();
  stalled.s.input.climb = true; normal.s.input.climb = true;
  stalled.River.step(stalled.game, 3600); normal.River.step(normal.game, .25);
  near(stalled.r.elapsed, .25); near(stalled.r.breath, normal.r.breath);
  near(stalled.r.logicalDistance, normal.r.logicalDistance);
  stalled.e.p.forEach((value, axis) => near(value, normal.e.p[axis]));
  assert.equal(stalled.calls.moves.length, 8);
  assert.ok(stalled.calls.moves.every(move => Math.hypot(move.dx, move.dz) < .08), 'substeps prevent a stall tunneling through scenery');
  const before = clone({ r: stalled.r, p: stalled.e.p, stats: stalled.s.stats });
  const counts = [stalled.calls.moves.length, stalled.calls.saves.length, stalled.calls.notices.length];
  for (const dt of [0, -1, NaN, Infinity, -Infinity]) assert.equal(stalled.River.step(stalled.game, dt), false);
  assert.deepEqual(clone({ r: stalled.r, p: stalled.e.p, stats: stalled.s.stats }), before);
  assert.deepEqual([stalled.calls.moves.length, stalled.calls.saves.length, stalled.calls.notices.length], counts);
});

test('real core collision blocks surface log penetration and permits the physical dive depth beneath it', () => {
  const f = fixture(undefined, { coreCollision: true });
  const log = f.s.solids.find(solid => solid.id === 'river-log-0');
  assert.ok(log);
  f.e.p = [log.x, f.r.waterY - .42, log.z - 2]; f.s.p = f.e.p;
  advance(f, 6);
  assert.ok(f.e.p[2] <= log.z - log.hl - .33, 'the current cannot push the standing collision body through the log');
  assert.equal(realCollision.blocked(f.game, f.e.p[0], f.e.p[2], .34, f.e.p[1]), false);
  assert.ok(f.s.stats.physical < 65, 'the blocked current should produce an obstacle warning and injury');
  const blockedAt = f.e.p[2];
  f.s.input.climb = true; advance(f, 6);
  assert.equal(f.r.submerged, true);
  assert.ok(f.e.p[1] + 1.48 <= log.yMin + .025, 'the submerged collision body clears the bottom of the log');
  assert.ok(f.e.p[2] > log.z + log.hl + .34 && f.e.p[2] > blockedAt + 4,
    'diving must physically travel through the water beneath the obstacle');
  assert.equal(f.calls.captures, 0);
});

test('a complete active journey floats to the delta, physically boards, paddles to the Gulf, and approaches rescue', () => {
  const f = fixture(undefined, { coreCollision: true }), x = f.s.base[0] + 94;
  f.e.p[0] = x - 3; // Declared initial river-entry fixture, before any travel.
  // A normal player can float in the clear central lane, using small lateral
  // corrections to avoid drifting toward the visible bank obstacles.
  let frames = 0;
  while (f.r.phase === 'stream' && frames++ < 4200) {
    f.s.input = { strafe: f.e.p[0] > x + 2 ? 1 : f.e.p[0] < x - 2 ? -1 : 0 };
    f.River.step(f.game, .25);
  }
  assert.equal(f.r.phase, 'delta');
  const deltaElapsed = f.r.elapsed;
  assert.ok(deltaElapsed >= 600 && deltaElapsed <= 1000,
    `normal floating should reach the delta in 600–1000 simulated seconds, got ${deltaElapsed}`);
  assert.ok(f.r.logicalDistance >= f.River.constants.deltaDistance);
  assert.equal(f.r.boatOwned, false);
  assert.equal(f.calls.finishes.length, 0); assert.equal(f.calls.captures, 0);
  assert.equal(f.River.interact(f.game, 'float'), true); // Swim toward the skiff.
  frames = 0;
  while (gap(f.e.p, f.r.boat.p) > 3.2 && frames++ < 240) {
    f.e.hdg = Math.atan2(f.r.boat.p[0] - f.e.p[0], -(f.r.boat.p[2] - f.e.p[2]));
    f.s.input = { forward: 1 };
    f.River.step(f.game, .25);
  }
  assert.ok(frames < 240, 'the player should be able to swim to the skiff');
  const boarding = f.s.objects.find(object => object.id === 'river-board');
  assert.equal(f.River.interact(f.game, boarding, 'board'), true);
  // Physically leave the near-bank mooring before heading downstream: the
  // alternating floating logs still collide with an occupied skiff.
  f.e.hdg = Math.PI * 1.5; f.s.input = { forward: 1 };
  frames = 0;
  while (f.e.p[0] > x + 1 && frames++ < 120) f.River.step(f.game, .25);
  assert.ok(frames < 120, 'the skiff must paddle physically into the central lane');
  frames = 0;
  while (f.r.phase !== 'gulf' && frames++ < 600) {
    const lateral = Math.max(-1.3, Math.min(1.3, (x - f.e.p[0]) * .8));
    f.e.hdg = Math.atan2(lateral, -3); f.s.input = { forward: 1 };
    f.River.step(f.game, .25);
  }
  assert.equal(f.r.phase, 'gulf'); assert.ok(frames < 600);
  assert.ok(f.r.logicalDistance >= f.River.constants.gulfDistance);
  assert.equal(f.calls.finishes.length, 0, 'reaching the Gulf cannot remotely rescue the player');
  const signal = f.s.objects.find(object => object.id === 'river-signal');
  frames = 0;
  while (gap(f.e.p, signal.p) > 11.5 && frames++ < 300) {
    f.e.hdg = Math.atan2(signal.p[0] - f.e.p[0], -(signal.p[2] - f.e.p[2]));
    f.s.input = { forward: 1 }; f.River.step(f.game, .25);
  }
  assert.ok(frames < 300, 'paddle physically toward the offshore contact');
  // Brake to a safe signaling speed without snapping the player to the ship.
  f.s.input = { forward: -1 };
  while (f.r.boat.speed > .15) f.River.step(f.game, .10);
  f.s.input = {};
  assert.ok(gap(f.e.p, signal.p) <= 13.4);
  assert.equal(f.River.interact(f.game, signal, 'signal'), true);
  frames = 0;
  while (!f.r.ship.acknowledged && frames++ < 300) f.River.step(f.game, .25);
  assert.equal(f.r.ship.acknowledged, true); assert.ok(frames < 300);
  // The acknowledgement only starts an approach. Paddle slowly into range,
  // then brake and wait while the nearby crew carries out recovery.
  frames = 0;
  while (gap(f.e.p, signal.p) > 4.5 && frames++ < 200) {
    f.e.hdg = Math.atan2(signal.p[0] - f.e.p[0], -(signal.p[2] - f.e.p[2]));
    f.s.input = { forward: f.r.boat.speed < .45 ? .25 : 0 };
    f.River.step(f.game, .25);
  }
  assert.ok(frames < 200);
  f.s.input = { forward: -1 };
  while (f.r.boat.speed > .1) f.River.step(f.game, .10);
  f.s.input = {};
  assert.equal(f.River.interact(f.game, signal, 'signal'), true, 'signal again after the physical approach');
  advance(f, 20);
  assert.equal(f.r.finished, true, JSON.stringify({ p: f.e.p, target: signal.p,
    gap: gap(f.e.p, signal.p), speed: f.r.boat.speed, signaling: f.r.signaling,
    acknowledged: f.r.ship.acknowledged, recovery: f.r.recoveryTime }));
  assert.equal(f.calls.finishes.length, 1);
  assert.equal(f.calls.finishes[0].historical, false); assert.equal(f.calls.captures, 0);
  assert.ok(f.r.elapsed >= 600 && f.r.elapsed < 1200,
    `the complete active journey should remain playable within 10–20 simulated minutes, got ${f.r.elapsed}`);
  assert.ok(f.r.segment >= 6, 'normal travel must survive several physical scene recentres');
  process.stdout.write(`  Journey: delta ${deltaElapsed.toFixed(1)}s; rescue ${f.r.elapsed.toFixed(1)}s; ${(f.r.logicalDistance / 1000).toFixed(2)} compressed route km.\n`);
});

let failed = 0;
for (const entry of tests) {
  try { entry.run(); process.stdout.write(`PASS ${entry.name}\n`); }
  catch (error) { failed++; process.stderr.write(`FAIL ${entry.name}\n${error.stack}\n`); }
}
process.stdout.write(`${tests.length - failed}/${tests.length} pure POW river checks passed (no browser/GPU).\n`);
if (failed) process.exitCode = 1;
