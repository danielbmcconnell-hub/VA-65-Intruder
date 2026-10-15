'use strict';
// Domain checks use the production target-generation portion of World._layout,
// World.release/fireArm/detonate and Game.objState. Terrain, flight-frame axes
// and visual effects are explicit fixtures; these are not browser/device tests.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../assets/flight/sortie-checkpoint.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function region(start, next) {
  const i = html.indexOf(start), j = html.indexOf(next, i);
  assert.ok(i >= 0 && j > i, 'production region ' + start);
  return html.slice(i, j);
}
function fixture(missionId = 'm2', seed = 17) {
  const math = Object.create(Math);
  math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const window = {}, context = vm.createContext({ window, Math: math,
    TAU: Math.PI * 2, PI: Math.PI, RAD: 180 / Math.PI,
    rnd: (min, max) => min + (max - min) * math.random(),
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    findFlat: (x, z) => [x, 40, z], terrainH: () => 40,
    vadd: (a, b) => a.map((v, i) => v + b[i]), vmul: (a, s) => a.map(v => v * s),
    vdist: (a, b) => Math.hypot(...a.map((v, i) => v - b[i])),
    bodyAxes: () => ({ right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1] }) });
  vm.runInContext(source, context);
  const missions = region('const MISSIONS = [', '\n];') + '\n];';
  vm.runInContext(missions + '\nglobalThis.missions=MISSIONS;', context);
  // This boundary includes the unchanged placement and initial-health logic
  // for every target kind, before unrelated route/scenery/threat creation.
  const targetLayout = region('  _layout() {', '\n\n\n    /* The briefed target position:') + '\n  }';
  vm.runInContext('globalThis.methods={' + targetLayout + ',' +
    region('  release(ac, n, interval, spray) {', '\n  fireArm(ac) {') + ',' +
    region('  fireArm(ac) {', '\n  /* ---------------- DIANE ballistics') + ',' +
    region('  detonate(p, scale, rad, dmg, weapon) {', '\n  /* A ripple is a string:') + ',' +
    region('  objState() {', '\n  checkObjectives() {') + '};', context);
  const mis = context.missions.find(m => m.id === missionId);
  const ord = mis.brief.ord, bombs = ord.match(/(\d+)\s*×\s*Mk\s*82/i);
  const bombsMax = /^none$/i.test(ord.trim()) ? 0 : bombs ? Number(bombs[1]) : 12;
  const world = { mis, targets: [], threats: [], sites: [], scenery: [], secs: [], bombs: [], arms: [], t: 0,
    rend: { quality: 0 }, fx: { explosion() {} }, nav: { fixes: 0 }, route: [1, 2, 3], rtIdx: 0,
    score: { hits: 0, misses: 0, dropped: 0, killed: 0, total: 0, damage: 0, discipline: true, cep: [] } };
  context.methods._layout.call(world);
  const ac = { bombs: bombsMax, arms: mis.type === 'ironhand' ? 2 : 0, alive: true, onDeck: true,
    crew: { pilot: 1, bn: 1 }, crewHits: 0, p: [0, 400, 0], v: [0, 0, -200], yaw: 0, roll: 0, pitch: 0 };
  const game = { world, mis, ac, bombsMax, rightSeat: true, departed: false, ejected: false,
    evade: { rounds: 0, hasPistol: false, camp: true }, phase: 'evade' };
  return { C: window.FlightSortieCheckpoint, game, world, context,
    objectives: () => clone(context.methods.objState.call(game)),
    release: n => context.methods.release.call(world, ac, n),
    arm: () => context.methods.fireArm.call(world, ac),
    detonate: (p, rad = 45, dmg = 80) => context.methods.detonate.call(world, p, 1.6, rad, dmg) };
}
function captured(f) {
  f.game.ac.onDeck = false; f.game.ac.alive = false; f.game.departed = true;
  f.game.ejected = true; f.game._outOfAircraft = true; f.game._capt = 1;
  return f;
}

test('every original mission records its own context rather than defaulting to Mission 11', () => {
  for (let n = 1; n <= 11; n++) {
    const f = fixture('m' + n), saved = f.C.snapshot(f.game);
    assert.ok(saved, 'snapshot m' + n); assert.equal(saved.missionId, 'm' + n);
    assert.equal(f.C.missionId({ version: 2, sortie: clone(saved) }), 'm' + n);
  }
});
test('snapshot is bounded plain JSON and read-only, with no aircraft coordinates or carried weapons', () => {
  const f = captured(fixture()), before = clone(f.game), saved = f.C.snapshot(f.game);
  assert.deepEqual(clone(f.game), before); assert.ok(JSON.stringify(saved).length < 8000);
  assert.equal(saved.context.captured, true); assert.equal(saved.context.rightSeat, true);
  assert.equal(saved.evade, undefined); assert.equal(saved.position, undefined); assert.equal(saved.result, undefined);
  saved.score.cep.push(999); saved.targets[0].hp = -20;
  assert.equal(f.world.score.cep.length, 0); assert.equal(f.world.targets[0].hp, 55);
});
test('actual bomb release and detonation survive reload into a freshly randomized Mission 2 world', () => {
  const f = captured(fixture()), point = f.world.targets[0].p.slice();
  f.release(4); f.world.designated = { p: point };
  f.detonate(point); f.world.score.damage = 1.75;
  f.world.score.bulletsExpended = 3; f.world.score.pistolShots = 3;
  f.world.nav.fixes = 2; f.world.rtIdx = 2; f.world.navErrAtRelease = 172.5;
  const saved = clone(f.C.snapshot(f.game)), fresh = fixture('m2', 861);
  const positions = fresh.world.targets.map(target => target.p.slice()), equipment = clone(fresh.game.evade);
  fresh.world.score.bulletsExpended = 7;
  assert.notDeepEqual(positions, f.world.targets.map(target => target.p));
  assert.equal(fresh.C.restore(fresh.game, saved), true);
  assert.deepEqual(fresh.objectives(), f.objectives());
  assert.deepEqual(fresh.world.targets.map(target => target.p), positions);
  assert.equal(fresh.world.score.dropped, 4); assert.equal(fresh.world.score.hits, 1);
  assert.equal(fresh.world.score.killed, f.world.score.killed); assert.deepEqual(clone(fresh.world.score.cep), [0]);
  assert.equal(fresh.world.score.damage, 1.75); assert.equal(fresh.game.ac.bombs, 8);
  assert.equal(fresh.world.nav.fixes, 2); assert.equal(fresh.world.rtIdx, 2);
  assert.equal(fresh.world.navErrAtRelease, 172.5); assert.equal(fresh.game._capt, 1);
  assert.equal(fresh.world.score.bulletsExpended, 7, 'ammunition has its own independently restored ledger');
  assert.deepEqual(fresh.game.evade, equipment); assert.equal(fresh.game.result, undefined);
});
test('a different mission is rejected atomically even when it also contains depot targets', () => {
  const f = captured(fixture()); f.release(2); f.detonate(f.world.targets[0].p);
  const saved = clone(f.C.snapshot(f.game)), fresh = fixture('m11'), before = clone(fresh.game);
  assert.equal(fresh.C.restore(fresh.game, saved), false); assert.deepEqual(clone(fresh.game), before);
});
test('changed target kind, health specification or order cannot receive another target’s damage', () => {
  const f = fixture('m8'); f.arm(); f.detonate(f.world.radar.p, 30, 70);
  const saved = clone(f.C.snapshot(f.game));
  for (const change of [g => g.world.targets.reverse(), g => g.world.targets[0].kind = 'depot',
    g => g.world.targets[1].hp0 = 99, g => g.world.targets[0].mesh = 'bldg']) {
    const fresh = fixture('m8'); change(fresh.game); const before = clone(fresh.game);
    assert.equal(fresh.C.restore(fresh.game, saved), false); assert.deepEqual(clone(fresh.game), before);
  }
});
test('Iron Hand recorded radar destruction preserves the real radar alias and finite ARM expenditure', () => {
  const f = captured(fixture('m8')); assert.equal(f.arm(), true); f.detonate(f.world.radar.p, 30, 70);
  const fresh = fixture('m8'), radar = fresh.world.radar;
  assert.equal(fresh.C.restore(fresh.game, clone(f.C.snapshot(f.game))), true);
  assert.equal(fresh.world.radar, radar); assert.equal(radar.alive, false); assert.equal(radar.hp, f.world.radar.hp);
  assert.equal(fresh.game.ac.arms, 1); assert.equal(fresh.world.score.armsReleased, 1);
  assert.deepEqual(fresh.objectives(), f.objectives()); assert.equal(fresh.game.escapedOK, undefined);
});
test('recorded recon identifications survive without identifying unobserved contacts or releasing stores', () => {
  const f = captured(fixture('m9')); f.world.targets[0].ident = true;
  const fresh = fixture('m9'); assert.equal(fresh.C.restore(fresh.game, clone(f.C.snapshot(f.game))), true);
  assert.equal(fresh.world.targets.filter(target => target.ident).length, 1);
  assert.deepEqual(fresh.objectives(), f.objectives()); assert.equal(fresh.world.score.dropped, 0);
});
test('bonus convoy counters are preserved without spawning invented trucks or changing primary requirements', () => {
  const f = captured(fixture());
  f.world.targets.push({ kind: 'trucks', mesh: 'truck', bonus: 1, p: [9000, 40, 9000], hp: 42, hp0: 42, alive: true, r: 7 });
  f.release(1); f.detonate(f.world.targets.at(-1).p);
  const saved = clone(f.C.snapshot(f.game)), fresh = fixture(), initialCount = fresh.world.targets.length;
  assert.equal(saved.targets.length, initialCount); assert.equal(saved.score.trucks, 1);
  assert.equal(fresh.C.restore(fresh.game, saved), true); assert.equal(fresh.world.targets.length, initialCount);
  assert.equal(fresh.world.score.trucks, 1); assert.equal(fresh.world.score.killed, 0);
  assert.equal(fresh.objectives()[0][2], false);
});
test('missing old-save context and malformed checkpoint envelopes have a safe null mission migration', () => {
  const f = fixture();
  for (const value of [null, undefined, [], {}, { version: 2 }, { version: 1, sortie: f.C.snapshot(f.game) },
    { version: 2, sortie: {} }, { version: 2, sortie: { ...f.C.snapshot(f.game), missionId: 'm99' } }])
    assert.equal(f.C.missionId(value), null);
});
test('corrupt or incomplete saved statistics cannot partially mutate valid current progress', () => {
  const f = captured(fixture()); f.release(1); f.detonate(f.world.targets[0].p);
  const original = clone(f.C.snapshot(f.game));
  const changes = [s => s.version = 0, s => s.score.dropped = -1, s => s.score.hits = NaN,
    s => s.score.damage = Infinity, s => s.context.rightSeat = 'true', s => delete s.score.cep,
    s => s.targets[0].hp = Infinity, s => s.targets[0].alive = true, s => s.stores.bombs = 99,
    s => s.navigation.errorAtRelease = -1, s => s.context.blood = 'invented', s => s.context.crew.bn = 2];
  for (const change of changes) {
    const saved = clone(original), fresh = fixture(), before = clone(fresh.game); change(saved);
    assert.equal(fresh.C.restore(fresh.game, saved), false); assert.deepEqual(clone(fresh.game), before);
  }
});
test('excessive arrays, target-count disagreement and impossible kills are rejected without completion', () => {
  const f = fixture(), saved = clone(f.C.snapshot(f.game));
  for (const change of [s => s.targets = Array(65).fill(s.targets[0]), s => s.score.cep = Array(257).fill(20),
    s => s.targets.pop(), s => s.score.killed++, s => s.score.total++, s => s.targets[0].alive = false]) {
    const data = clone(saved), fresh = fixture(), before = clone(fresh.game); change(data);
    assert.equal(fresh.C.restore(fresh.game, data), false); assert.deepEqual(clone(fresh.game), before);
  }
});
test('recorded crash, hurt and crew condition replace the false ejected defaults after captivity hydration', () => {
  const f = captured(fixture()); f.game.ejected = false; f.game._hurt = true; f.game._blood = 'militia';
  f.game.rightSeat = false; f.game.ac.crew.pilot = .42; f.game.ac.crewHits = 2;
  const fresh = fixture(); fresh.game.ejected = true;
  assert.equal(fresh.C.restore(fresh.game, clone(f.C.snapshot(f.game))), true);
  assert.equal(fresh.game.ejected, false); assert.equal(fresh.game._outOfAircraft, true);
  assert.equal(fresh.game._capt, 1); assert.equal(fresh.game._hurt, true); assert.equal(fresh.game._blood, 'militia');
  assert.equal(fresh.game.rightSeat, false); assert.equal(fresh.game.ac.onDeck, false);
  assert.equal(fresh.game.ac.alive, false); assert.equal(fresh.game.ac.crew.pilot, .42);
  assert.equal(fresh.game.ac.crewHits, 2);
});
test('unknown fields cannot grant mission success, grades, weapons or prisoner equipment', () => {
  const f = fixture(), saved = clone(f.C.snapshot(f.game)), fresh = fixture(), equipment = clone(fresh.game.evade);
  saved.result = { pass: true }; saved.escapedOK = true; saved.context.rescuedOK = true;
  saved.context.breakoutOK = true; saved.evade = { rounds: 999, hasPistol: true };
  assert.equal(fresh.C.restore(fresh.game, saved), true);
  for (const key of ['result', 'escapedOK', 'rescuedOK', 'breakoutOK']) assert.equal(fresh.game[key], undefined);
  assert.deepEqual(fresh.game.evade, equipment); assert.equal(fresh.world.score.killed, 0);
});
test('changed loadout maxima and incompatible navigation route reject old progress atomically', () => {
  const f = fixture(); f.world.nav.fixes = 2; f.world.rtIdx = 2;
  const saved = clone(f.C.snapshot(f.game));
  for (const change of [g => g.bombsMax = 16, g => g.armsMax = 2, g => g.world.route = [1]]) {
    const fresh = fixture(); change(fresh.game); const before = clone(fresh.game);
    assert.equal(fresh.C.restore(fresh.game, saved), false); assert.deepEqual(clone(fresh.game), before);
  }
});
test('restored arrays and crew records are detached from the serialized checkpoint', () => {
  const f = fixture(); f.release(1); f.world.designated = { p: f.world.targets[0].p }; f.detonate(f.world.targets[0].p);
  const saved = clone(f.C.snapshot(f.game)), fresh = fixture();
  assert.equal(fresh.C.restore(fresh.game, saved), true);
  saved.score.cep[0] = 900; saved.context.crew.pilot = 0; saved.targets[0].hp = 55;
  assert.deepEqual(clone(fresh.world.score.cep), [0]); assert.equal(fresh.game.ac.crew.pilot, 1);
  assert.equal(fresh.world.targets[0].alive, false);
});
