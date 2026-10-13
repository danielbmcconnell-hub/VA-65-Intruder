'use strict';

// Real river, core swept collision/LOS, save, and guard AI in a DOM-free VM.
// Fixtures establish starting conditions; progress below comes from movement.
// These checks do not claim rendering or physical iPhone verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const clone = data => JSON.parse(JSON.stringify(data));
const gap = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const tests = [];
const test = (name, run) => tests.push({ name, run });

function fixture(saved) {
  const context = vm.createContext({ window: {} });
  for (const name of ['core', 'ai', 'river']) vm.runInContext(
    fs.readFileSync(path.join(__dirname, `../assets/pow/${name}.js`), 'utf8'), context, { filename: `${name}.js` });
  const P = context.window.POW, saves = [], captures = [], notices = [];
  P.ctx = { Store: { set(key, data) { saves.push(clone(data)); } } };
  const originalNotify = P.notify;
  P.notify = (game, text) => { notices.push(text); originalNotify(game, text); };
  const s = { stage: 'river', time: saved?.time || 0, day: saved?.day || 1, base: saved?.base || [0, 0, 0],
    flags: clone(saved?.flags || {}), inventory: clone(saved?.inventory || {}),
    stats: clone(saved?.stats || { physical: 100, fatigue: 0, resilience: 70, morale: 65, hope: 65, memory: 70 }),
    solids: [], surfaces: [], objects: [], input: {}, difficulty: 'normal', intensity: 'reduced', noises: [] };
  if (saved?.module) s.river = clone(saved.module);
  const game = { pow: s, evade: { p: saved?.p?.slice() || [94, 0, 0], hdg: saved?.hdg ?? Math.PI,
    searchers: [], alive: true, radius: .32, t: 0 }, campGeo: [], app: { keys: {}, gctl: {} },
    setHour() {}, captured(reason) { captures.push(reason); } };
  P.River.enter(game);
  if (saved?.ai) P.AI.restore(game, saved.ai);
  s.actors = game.evade.searchers;
  return { P, game, s, r: s.river, e: game.evade, saves, captures, notices, x: 94 };
}

function tick(f, seconds, ai = false) {
  let left = seconds;
  while (left > 1e-8) {
    const dt = Math.min(.1, left);
    f.s.time += dt; f.P.River.step(f.game, dt);
    if (ai) f.P.AI.step(f.game, dt);
    left -= dt;
  }
}
function driftTo(f, distance) {
  let ticks = 0;
  while (f.r.logicalDistance < distance && ticks++ < 12000) {
    const dx = f.x - f.e.p[0];
    f.e.hdg = Math.abs(dx) > 1 ? dx > 0 ? Math.PI / 2 : Math.PI * 1.5 : Math.PI;
    f.s.input = Math.abs(dx) > 1 ? { forward: 1 } : {};
    tick(f, .1);
  }
  assert.ok(ticks < 12000, `physical drift stalled at ${f.r.logicalDistance}`);
  f.s.input = {};
}
function reachLanding(f, id) {
  const find = () => f.s.objects.find(o => o.id === id);
  assert.ok(find(), `landing ${id} must be physically rendered`);
  f.P.River.interact(f.game, 'float'); // Stronger swimming, not a stage change.
  let ticks = 0, entranceReached = false;
  while (Math.abs(f.e.p[0] - f.x) < 15.5 && ticks++ < 700) {
    const side = Math.sign(find().p[0] - f.x);
    f.e.hdg = side > 0 ? Math.PI / 2 : Math.PI * 1.5;
    f.s.input = { forward: 1 }; tick(f, .1);
  }
  while (gap(f.e.p, find().p) > .7 && ticks++ < 2800) {
    const landing = find().p, side = Math.sign(landing[0] - f.x), entrance = [f.x + side * 19.7, landing[1], landing[2]];
    if (gap(f.e.p, entrance) < .65) entranceReached = true;
    const target = entranceReached ? landing : entrance;
    f.e.hdg = Math.atan2(target[0] - f.e.p[0], -(target[2] - f.e.p[2]));
    f.s.input = { forward: 1 }; tick(f, .1);
  }
  assert.ok(ticks < 2800, `could not physically reach ${id}: ${f.e.p}`);
  f.s.input = {}; tick(f, .1);
  return find();
}

test('sections preserve the exact distance contract and offer visible physical landmarks', () => {
  const f = fixture(), sections = f.P.River.sections;
  assert.ok(Object.isFrozen(sections) && sections.every(Object.isFrozen));
  assert.equal(sections.length, 6);
  assert.equal(sections[0].from, 0);
  sections.slice(1).forEach((section, n) => assert.equal(section.from, sections[n].to));
  assert.equal(sections[3].from, 24140);
  assert.equal(sections[5].from, 72000); assert.equal(sections[5].to, 96000);
  assert.equal(f.r.sectionId, 'bridge');
  assert.ok(f.game.campGeo.some(g => g.id === 'river-landmark-bridge-deck'));
  assert.ok(f.game.campGeo.some(g => g.id === 'river-landmark-reeds-island--1'));
  assert.ok(f.s.objects.some(o => o.id === 'river-landing-bridge'));
  assert.equal(f.e.hasRadio, false); assert.equal(f.e.searchers.length, 4);
  assert.equal(f.r.logicalDistance, 0); assert.equal(f.captures.length, 0);
});

test('open current and bank eddy change actual downstream movement without phantom route progress', () => {
  const middle = fixture(), edge = fixture();
  edge.e.p[0] = edge.x + 13;
  const startMiddle = middle.e.p[2], startEdge = edge.e.p[2];
  tick(middle, 2); tick(edge, 2);
  assert.ok(middle.r.currentWorldMps > edge.r.currentWorldMps + .15);
  assert.ok(middle.e.p[2] - startMiddle > edge.e.p[2] - startEdge);
  near(middle.r.logicalDistance, (middle.e.p[2] - startMiddle) * 100);
  near(edge.r.logicalDistance, (edge.e.p[2] - startEdge) * 100);
  assert.ok(edge.r.logicalDistance > 0); assert.equal(edge.captures.length, 0);
});

test('the bridge is a solid obstacle on the bank and permits physical passage below its deck', () => {
  const f = fixture(), deck = f.s.solids.find(q => q.id === 'river-landmark-bridge-deck');
  assert.ok(deck.yMin > f.r.waterY + 4);
  assert.equal(f.P.blocked(f.game, f.x, deck.z, .34, f.r.waterY - .42), false);
  const bank = f.s.solids.find(q => q.id === 'river-landmark-bridge-abutment-1');
  assert.equal(f.P.blocked(f.game, bank.x, bank.z, .34, f.r.waterY + .35), true);
  driftTo(f, 5500);
  assert.ok(f.e.p[2] + f.r.streamOffset > deck.z + deck.hl);
  assert.equal(f.r.sectionId, 'bridge'); assert.equal(f.captures.length, 0);
});

test('physical drift enters the reed and ferry sections with preserved landmarks and honest compression', () => {
  const f = fixture(), start = f.e.p[2];
  driftTo(f, 6600);
  assert.equal(f.r.sectionId, 'reeds');
  assert.ok(f.r.sectionsVisited.includes('bridge') && f.r.sectionsVisited.includes('reeds'));
  near(f.r.logicalDistance, (f.e.p[2] + f.r.streamOffset - start) * 100, .0001);
  driftTo(f, 14600);
  assert.equal(f.r.sectionId, 'ferry');
  assert.ok(f.game.campGeo.some(g => g.id === 'river-landmark-ferry-lantern'));
  assert.ok(f.s.objects.some(o => o.id === 'river-landing-ferry'));
  assert.ok(f.r.sectionHint.includes('patrol'));
  assert.equal(f.r.finished, false); assert.equal(f.captures.length, 0);
});

test('scene recentering keeps a visible landmark at its original global position', () => {
  const f = fixture(), before = f.game.campGeo.find(g => g.id === 'river-landmark-reeds-island-1').p[2];
  driftTo(f, 11300);
  assert.ok(f.r.streamOffset >= 112);
  const after = f.game.campGeo.find(g => g.id === 'river-landmark-reeds-island-1');
  assert.ok(after); near(after.p[2] + f.r.streamOffset, before);
  near(f.r.routeOriginZ, 0);
});

test('ferry patrols use real dry-land routes and cannot walk through their hut or river', () => {
  const f = fixture(); driftTo(f, 14600);
  const guards = f.e.searchers.filter(a => a.riverEncounter === 'ferry');
  assert.equal(guards.length, 2);
  const guard = guards.find(a => a.armed), worker = guards.find(a => !a.armed);
  assert.ok(guard.schedule.rounds < guard.schedule.cycle);
  assert.equal(worker.kind, 'farmer');
  for (let n = 0; n < 100; n++) {
    f.P.AI.step(f.game, .1);
    for (const a of guards) {
      assert.ok(Math.abs(a.p[0] - f.x) >= 14.5 + .3);
      assert.equal(f.P.blocked(f.game, a.p[0], a.p[2], .31, a.p[1]), false);
    }
  }
  assert.equal(f.captures.length, 0);
  const origin = guard.home[2] + f.r.streamOffset;
  driftTo(f, 23500);
  near(guard.home[2] + f.r.streamOffset, origin);
  assert.equal(f.e.searchers.filter(a => a.id === guard.id).length, 1);
});

test('real swimming and bank walking reach the reed landing; recovery trades travel for elapsed hours', () => {
  const f = fixture(); driftTo(f, 6600);
  const landing = reachLanding(f, 'river-landing-reeds');
  assert.equal(f.r.mode, 'bank'); assert.ok(gap(f.e.p, landing.p) < 1);
  f.s.stats.fatigue = 80; f.s.stats.physical = 30;
  const distance = f.r.logicalDistance, hours = f.r.hours;
  assert.equal(f.P.River.interact(f.game, landing, 'hide'), true);
  tick(f, 12);
  near(f.r.logicalDistance, distance);
  assert.ok(f.r.hours > hours + 2 && f.s.stats.fatigue < 78 && f.s.stats.physical > 33);
  assert.equal(f.r.encounters.reeds.landingReached, true);
  assert.equal(f.r.encounters.reeds.rests, 1);
  assert.equal(f.e.hidden, true); assert.ok(f.e.cover > .8);
  f.s.input = { forward: 1 }; tick(f, .2);
  assert.equal(f.r.resting, false); assert.equal(f.r.mode, 'bank');
  assert.equal(f.captures.length, 0);
});

test('landing actions refuse remote access and approach stays recoverable at high fatigue', () => {
  const f = fixture(), landing = f.s.objects.find(o => o.id === 'river-landing-bridge');
  assert.equal(f.P.River.interact(f.game, landing, 'hide'), false);
  f.s.stats.fatigue = 98; f.s.stats.physical = 8;
  const reached = reachLanding(f, 'river-landing-bridge');
  assert.equal(f.P.River.interact(f.game, reached, 'hide'), true);
  tick(f, 10);
  assert.ok(f.s.stats.physical > 8); assert.ok(f.s.stats.fatigue < 98);
  assert.equal(f.captures.length, 0);
});

test('daylight changes real guard detection while darkness and distance permit evasion', () => {
  function observe(hours) {
    const f = fixture(); f.r.hours = hours;
    const a = f.P.AI.makeActor({ id: 'm22-bank-view-fixture', kind: 'nva',
      p: [f.x + 19, f.r.waterY + .35, f.e.p[2]], face: -Math.PI / 2,
      route: [[f.x + 19, f.r.waterY + .35, f.e.p[2]]], dwell: 20 });
    f.e.searchers = [a]; f.s.actors = f.e.searchers;
    tick(f, .5, true); return { f, a };
  }
  const dark = observe(.5), light = observe(12);
  assert.equal(dark.a.visible, false); assert.equal(light.a.visible, true);
  assert.ok(light.a.sus > dark.a.sus);
  assert.ok(light.f.r.visibility > dark.f.r.visibility);
  assert.equal(light.f.captures.length, 0); assert.equal(dark.f.captures.length, 0);
});

test('quiet bank steps reduce actual emitted noise and let an unseen player pass a nearby guard', () => {
  function approach(crouch) {
    const f = fixture();
    f.e.p[0] = f.x + 20; f.e.p[1] = f.r.waterY + .35;
    const a = f.P.AI.makeActor({ id: 'm22-hearing-fixture', kind: 'nva',
      p: [f.x + 25, f.r.waterY + .35, 0], face: Math.PI / 2,
      route: [[f.x + 25, f.r.waterY + .35, 0]], dwell: 20 });
    f.e.searchers = [a]; f.s.actors = f.e.searchers; f.s.input = { forward: 1, crouch };
    tick(f, .2, true);
    return { f, a, sound: f.s.noises.find(n => n.kind === 'mud-footstep') };
  }
  const normal = approach(false), quiet = approach(true);
  assert.ok(normal.sound && quiet.sound && quiet.sound.loudness < normal.sound.loudness / 3);
  assert.ok(normal.a.lastNoise, 'ordinary steps should be investigated at this distance');
  assert.equal(quiet.a.lastNoise, undefined); assert.equal(quiet.a.state, 'patrol');
  assert.equal(quiet.f.captures.length, 0);
});

test('checkpoint restoration preserves section, landing recovery, position and guard memory', () => {
  const f = fixture(); driftTo(f, 6600);
  const landing = reachLanding(f, 'river-landing-reeds');
  f.P.River.interact(f.game, landing, 'hide'); tick(f, 3);
  const actor = f.e.searchers[0]; actor.state = 'investigate'; actor.lastNoise = actor.p.slice();
  const saved = clone(f.P.save(f.game)), resumed = fixture(saved);
  assert.equal(resumed.r.sectionId, f.r.sectionId);
  assert.deepEqual(clone(resumed.r.sectionsVisited), clone(f.r.sectionsVisited));
  assert.deepEqual(clone(resumed.r.encounters), clone(f.r.encounters));
  assert.deepEqual(clone(resumed.e.p), clone(f.e.p)); near(resumed.r.logicalDistance, f.r.logicalDistance);
  assert.equal(resumed.r.resting, true); assert.equal(resumed.e.searchers.length, f.e.searchers.length);
  assert.equal(resumed.e.searchers[0].state, 'investigate');
  tick(resumed, .2); assert.equal(resumed.e.hidden, true);
});

test('older river checkpoints gain finite landmark state without resetting their journey', () => {
  const f = fixture(); driftTo(f, 18000);
  const saved = clone(f.P.save(f.game));
  for (const key of ['routeOriginZ', 'sectionId', 'sectionName', 'sectionHint', 'sectionExposure', 'sectionsVisited', 'encounters', 'landings']) delete saved.module[key];
  const resumed = fixture(saved);
  near(resumed.r.logicalDistance, saved.module.logicalDistance);
  near(resumed.r.streamOffset, saved.module.streamOffset);
  assert.equal(resumed.r.sectionId, 'ferry');
  assert.ok(resumed.game.campGeo.every(g => g.p.concat(g.scale).every(Number.isFinite)));
  assert.equal(resumed.e.searchers.length, f.e.searchers.length);
  assert.equal(resumed.captures.length, 0);
});

test('an older checkpoint occupying a newly added island retains its position and can swim away', () => {
  const f = fixture(), saved = clone(f.P.save(f.game));
  saved.module.logicalDistance = 10400; saved.module.streamOffset = 112; saved.module.segment = 1;
  saved.module.mode = 'swim';
  delete saved.module.routeOriginZ; delete saved.module.landmarkClearances;
  saved.p = [104.7, saved.module.waterY - .42, -8];
  const restored = fixture(saved), before = restored.e.p.slice();
  assert.deepEqual(clone(restored.e.p), saved.p);
  assert.equal(restored.r.landmarkClearances['river-landmark-reeds-island-1'], true);
  assert.equal(restored.P.blocked(restored.game, before[0], before[2], .34, before[1]), false);
  restored.s.input = { forward: 1 }; tick(restored, 1);
  assert.ok(gap(restored.e.p, before) > 1);
  assert.ok(restored.r.logicalDistance > saved.module.logicalDistance);
  const savedAgain = clone(restored.P.save(restored.game)), second = fixture(savedAgain);
  assert.equal(second.r.landmarkClearances['river-landmark-reeds-island-1'], true);
});

test('an old saved guard is not enclosed by new bridge geometry when AI restores after entry', () => {
  const f = fixture(), saved = clone(f.P.save(f.game));
  saved.module.logicalDistance = 10400; saved.module.streamOffset = 112; saved.module.segment = 1;
  delete saved.module.routeOriginZ; delete saved.module.landmarkClearances;
  saved.p = [94, saved.module.waterY - .42, -8];
  const a = saved.ai.actors[0];
  a.p = [114, saved.module.waterY + .35, -80]; a.home = a.p.slice(); a.goal = a.p.slice();
  a.route = [a.p.slice(), [114, a.p[1], -70]]; a.kind = 'nva'; a.armed = true;
  const restored = fixture(saved), actor = restored.e.searchers[0], position = actor.p.slice();
  assert.equal(restored.r.layoutAuditPending, true);
  tick(restored, .1);
  assert.deepEqual(clone(actor.p), clone(position), 'layout migration must not relocate the guard');
  assert.equal(restored.r.landmarkClearances['river-landmark-bridge-abutment-1'], true);
  assert.equal(restored.P.blocked(restored.game, actor.p[0], actor.p[2], .31, actor.p[1]), false);
  assert.equal(restored.r.layoutAuditPending, false);
  assert.equal(restored.e.searchers.filter(a => a.id === 'river-ferry-patrol').length, 1,
    'legacy AI restoration must not discard the newly added upcoming encounter');
  restored.P.River.rebuild(restored.game);
  assert.equal(restored.e.searchers.filter(a => a.id === 'river-ferry-patrol').length, 1,
    'an extra layout rebuild cannot duplicate that encounter');
});

test('the fifteen-mile comparison enters open floodplain without scripted recapture or completion', () => {
  const f = fixture(); driftTo(f, 24300);
  assert.equal(f.r.sectionId, 'floodplain'); assert.equal(f.r.benchmarkPassed, true);
  assert.equal(f.r.phase, 'stream'); assert.equal(f.r.finished, false);
  assert.equal(f.captures.length, 0); assert.ok(f.r.logicalDistance >= 24140);
  const before = f.r.logicalDistance; tick(f, 3);
  assert.ok(f.r.logicalDistance > before);
});

let failed = 0;
for (const { name, run } of tests) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
}
console.log(`${tests.length - failed}/${tests.length} Milestone 2.2 river simulation checks passed (no GPU).`);
if (failed) process.exitCode = 1;
