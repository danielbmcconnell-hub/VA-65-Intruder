'use strict';
// Production mission, interceptor and hostile gun simulation in a Node VM.
// Explicit aircraft-path fixtures exercise mission criteria; these are not the
// A-6 flight integrator, a WebGL render, or physical desktop/iPhone testing.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const folder = path.join(__dirname, '..'), html = fs.readFileSync(path.join(folder, 'index.html'), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
function fixture(options = {}) {
  const window = {}, values = new Map(), calls = [], radios = [], hits = [];
  const sandbox = { window, console, Math, Date }; vm.createContext(sandbox);
  for (const name of ['interceptor', 'flak', 'mission']) vm.runInContext(fs.readFileSync(path.join(folder, 'assets/willard', name + '.js'), 'utf8'), sandbox);
  vm.runInContext(html.slice(html.indexOf('function newAircraft() {'), html.indexOf('function acStep(')) + '\nwindow.newAircraft = newAircraft;', sandbox);
  class Game {
    update(dt) { calls.push(['update', this, dt]); this.t += dt; this.world.t += dt; }
    director(...args) { calls.push(['director', this, ...args]); return 'original-director'; }
    pilotChatter(...args) { calls.push(['pilotChatter', this, ...args]); return 'original-chatter'; }
    teach(...args) { calls.push(['teach', this, ...args]); return 'original-teach'; }
    checkObjectives(...args) { calls.push(['checkObjectives', this, ...args]); return 'original-check'; }
    objState(...args) { calls.push(['objState', this, ...args]); return [['Original', 'kept', true]]; }
    onDead(...args) { calls.push(['onDead', this, ...args]); return 'original-death'; }
    debrief(...args) { calls.push(['debrief', this, ...args]); return 'original-debrief'; }
  }
  const Store = { get(k, d) { return values.has(k) ? clone(values.get(k)) : d; }, set(k, v) { values.set(k, clone(v)); } };
  const App = { game: null, set: { sound: false }, prog: { done: {}, grade: {} }, _willardRestore: null,
    radio(...args) { radios.push(args); }, audio: { setEngine() {}, setTone() {}, setRadAlt() {}, burst() {} },
    start(mis) { this.game = make(mis); return this.game; },
    show(...args) { calls.push(['show', ...args]); return 'original-show'; },
    brief(...args) { calls.push(['brief', ...args]); return 'original-brief'; },
    pause(on) { calls.push(['pause', on]); this.game.paused = on; return 'original-pause'; } };
  const terrainH = options.terrainH || (() => 0), coastAt = options.coastAt || (() => 0);
  const M = window.WillardMission;
  M.install({ App, Game, Store, terrainH, coastAt });
  function make(mis = M.definition) {
    const game = new Game();
    Object.assign(game, { app: App, mis, ac: window.newAircraft(), rend: { quality: 0 }, hud: { scope: false },
      t: 0, paused: false, result: null, phase: 'deck', extView: false, rightSeat: false, flash: 0, shake: 0,
      bombsMax: 12, armsMax: 0, world: { t: 0, rend: {},
        score: { hits: 0, misses: 0, cep: [], dropped: 0, armsReleased: 0, damage: 0, killed: 0, total: 1, trucks: 0, discipline: 0 },
        targets: [{ p: [10, 0, 20], hp: 1, hp0: 1, alive: true, burn: 0, kind: 'depot' }], carrier: { p: [0, 0, 0], hdg: 0 },
        fx: { add: [], smk: [], glow() {}, smoke() {}, streak() {} },
        hitAircraft(ac, severity, source) { hits.push({ ac, severity, source }); game.world.score.damage += severity; }
      } });
    return game;
  }
  const game = make(options.mission || M.definition); App.game = game;
  if (options.start !== false) M.start(game, { seed: 1966, strike: true, ...options });
  return { window, M, game, App, Store, values, calls, radios, hits, Game, make, terrainH };
}
function step(f, seconds, dt = 1 / 30, move) {
  for (let elapsed = 0; elapsed < seconds - 1e-9 && !f.game.result; elapsed += dt) {
    const h = Math.min(dt, seconds - elapsed);
    if (move) move(f.game.ac, h, elapsed);
    f.game.t += h; f.game.world.t += h; f.M.step(f.game, h);
  }
}
function spawn(f) { f.game.ac.p[2] = f.game.willard.route.strike[2] - 601; step(f, .04); assert(f.game.willard.enemy); }
function toward(f, target, speed = 230, stop = 50) {
  let limit = 18000;
  while (limit-- > 0 && !f.game.result) {
    const a = f.game.ac, dx = target[0] - a.p[0], dz = target[2] - a.p[2], range = Math.hypot(dx, dz);
    if (range < stop) return true;
    a.yaw = Math.atan2(dx, -dz); a.pitch = 0; a.roll = .1;
    a.v = [Math.sin(a.yaw) * speed, 0, -Math.cos(a.yaw) * speed];
    step(f, 1 / 30, 1 / 30, (ac, h) => { ac.p = [ac.p[0] + ac.v[0] * h, 650, ac.p[2] + ac.v[2] * h]; });
  }
  return !!f.game.result;
}
function checkpoint(f) { spawn(f); const saved = f.Store.get(f.M.KEY, null); assert(f.M.validCheckpoint(saved)); return saved; }

test('only Willard initializes the air start and original A-6 damage/crew schema remains intact', () => {
  const f = fixture(), g = f.game, ac = clone(g.ac);
  assert.equal(g.phase, 'airborne'); assert.equal(ac.onDeck, false); assert.equal(ac.gear, false); assert.equal(ac.fuel, 9500);
  assert.equal(ac.bombs, 4); assert.equal(ac.arms, 0); assert.deepEqual(ac.crew, { pilot: 1, bn: 1 });
  assert.deepEqual(ac.dmg, { hyd: 0, eng: 0, diane: 0, fuelLeak: 0, fire: 0 });
  const other = f.make({ id: 'm1' }), before = clone({ ac: other.ac, world: other.world, phase: other.phase }); assert.equal(f.M.start(other), null);
  assert.equal(other.willard, undefined); assert.deepEqual(clone({ ac: other.ac, world: other.world, phase: other.phase }), before);
});

test('all three difficulties select production AI/gun profiles without inventing a player gun', () => {
  const profiles = [];
  for (const difficulty of ['rookie', 'naval', 'ace']) {
    const f = fixture({ difficulty }); spawn(f); const s = f.game.willard;
    assert.equal(s.difficulty, difficulty); assert.equal(s.flak.difficulty, difficulty); assert.equal(f.game.ac.arms, 0);
    profiles.push(s.enemy._profile);
  }
  assert(profiles[0].spread > profiles[1].spread && profiles[1].spread > profiles[2].spread);
  assert(profiles[0].damage < profiles[1].damage && profiles[1].damage < profiles[2].damage);
});

test('optional strike uses original release accounting; skipping still produces a playable contact checkpoint', () => {
  const a = fixture(); step(a, 20); assert.equal(a.game.willard.phase, 'strike');
  a.game.world.score.dropped = 1; step(a, .1); assert.equal(a.game.willard.phase, 'contact');
  assert(a.M.validCheckpoint(a.Store.get(a.M.KEY, null))); assert.equal(a.game.world.score.dropped, 1);
  const b = fixture({ strike: false }); assert.equal(b.game.ac.bombs, 0); step(b, 12.2);
  assert.equal(b.game.willard.phase, 'contact'); assert.equal(b.game.world.score.dropped, 0);
});

test('waiting through phase timings never wins, disbands the pursuer, or invents hostile gun exposure', () => {
  const f = fixture({ strike: false }); step(f, 300); const s = f.game.willard;
  assert(['defend', 'flak'].includes(s.phase)); assert.equal(f.game.result, null); assert.equal(s.completed, false);
  assert.equal(s.flakDisrupted, false); assert.equal(s.terrainEscape, undefined);
  assert.equal(s.flak.stats.shellsFired, 0); assert.equal(s.enemy.disengaged, false);
});

test('crossing the gun belt does not complete the mission before safe ocean egress', () => {
  const f = fixture(); toward(f, f.game.willard.route.flak); const s = f.game.willard;
  assert.equal(f.game.result, null); assert.equal(s.completed, false);
  assert(s.flak.stats.a6Shots > 0, 'hostile guns remain active against the Intruder');
});

test('production mission, guns and interceptor support earned flak disruption and safe ocean egress', () => {
  const f = fixture();
  const s = f.game.willard;
  toward(f, s.route.flak);
  assert(s.flakDisrupted, 'disruption must arise from actual interceptor pressure and real gun bursts');
  assert(s.flak.stats.migExposure > 0); assert(s.flak.stats.shellsFired > 0); assert(s.enemy.disengaged || !s.enemy.alive);
  assert.equal(f.game.result, null, 'gun-belt disruption alone is not safe egress');
  toward(f, s.route.safe);
  assert.equal(f.game.result?.pass, true); assert.equal(f.game.result.recovered, false); assert.equal(s.completed, true);
  assert.equal(f.App.prog.done.willard, 1); assert(f.Store.get('log', []).some(x => x.safeEgress && !x.landed));
});

test('a safe ocean coordinate alone does not bypass interception or award completion', () => {
  const f = fixture(); spawn(f); const s = f.game.willard;
  f.game.ac.p = s.route.safe.slice(); step(f, 30);
  assert.equal(f.game.result, null); assert.equal(s.completed, false); assert.equal(f.App.prog.done.willard, undefined);
});

test('pause, invalid dt and existing result freeze mission and combat state', () => {
  const f = fixture(); spawn(f); const before = JSON.stringify(f.game.willard);
  f.game.paused = true; step(f, 2); assert.equal(JSON.stringify(f.game.willard), before);
  f.game.paused = false;
  for (const dt of [0, -1, NaN, Infinity]) f.M.step(f.game, dt);
  assert.equal(JSON.stringify(f.game.willard), before);
  f.game.result = { pass: false }; f.M.step(f.game, 2); assert.equal(JSON.stringify(f.game.willard), before);
});

test('ejection, ground survival and POW state stop aircraft combat without replacing original gameplay', () => {
  for (const mode of ['chute', 'evade', 'pow']) {
    const f = fixture(); spawn(f); f.game[mode] = { stage: 'fixture' }; const s = f.game.willard;
    s.rear = true; s.contact.observed = true; const enemy = clone(s.enemy), time = s.elapsed;
    step(f, 30); assert.equal(s.elapsed, time); assert.deepEqual(clone(s.enemy), enemy);
    assert.equal(s.rear, false); assert.equal(s.contact.observed, false); assert.equal(f.game.result, null);
  }
});

test('stale sortie death or finish cannot change the current game, logs or progression', () => {
  const f = fixture(); spawn(f); const old = f.game; f.App.game = f.make({ id: 'm2' });
  assert.equal(f.M.finish(old, true, 'stale callback', false), false);
  old.onDead('stale delayed loss');
  assert.equal(old.result, null); assert.deepEqual(f.Store.get('log', []), []); assert.equal(f.App.prog.done.willard, undefined);
});

test('failure produces one debrief entry and bounded scoring without fake recovery', () => {
  const f = fixture(); spawn(f); f.game.world.score.damage = 2.3; f.game.willard.retries = 2;
  f.game.onDead('Terrain impact.');
  assert.equal(f.game.result.pass, false); assert.equal(f.game.result.recovered, false); assert.equal(f.game.willard.phase, 'failed');
  assert(f.game.result.pts >= 0 && f.game.result.pts <= 100); assert.equal(f.Store.get('log', []).length, 1);
  f.game.onDead('Repeated callback.'); assert.equal(f.Store.get('log', []).length, 1);
});

test('checkpoint JSON contains bounded resumable combat and clears airborne rounds before retry', () => {
  const f = fixture(); spawn(f); step(f, 8); const s = f.game.willard;
  assert(f.M.checkpoint(f.game, 'Combat checkpoint')); const saved = f.Store.get(f.M.KEY, null);
  assert(f.M.validCheckpoint(saved)); assert.equal(saved.state.checkpoint, undefined);
  assert.equal(saved.state.enemy.projectiles.length, 0); assert.equal(saved.state.flak.shells.length, 0); assert.equal(saved.state.flak.bursts.length, 0);
  const old = f.game; assert(f.M.retry(old)); f.game = f.App.game;
  // The fixture's App.start builds the new original aircraft; invoke the same
  // production mission constructor hook once, as the real Game constructor does.
  f.M.start(f.game, { seed: 999 });
  assert.equal(f.game.willard.retries, 1); assert.equal(f.game.willard.seed, s.seed); assert.equal(f.game.willard.phase, s.phase);
  assert.deepEqual(clone(f.game.ac), saved.ac); assert.equal(f.game.willard.enemy.projectiles.length, 0);
  assert.equal(f.game.willard.contact.observed, false); assert.equal(f.game.willard.grace, 3);
});

test('repeated checkpoints do not retain recursive saves, duplicate enemies or accumulate projectiles', () => {
  const f = fixture(); spawn(f); let maximum = 0;
  for (let i = 0; i < 25; i++) {
    step(f, .2); assert(f.M.checkpoint(f.game, 'Checkpoint ' + i));
    const saved = f.Store.get(f.M.KEY, null), size = JSON.stringify(saved).length; maximum = Math.max(maximum, size);
    assert.equal(saved.state.checkpoint, undefined); assert.equal(saved.state.flak.guns.length, 8);
    assert.equal(saved.state.enemy.projectiles.length, 0); assert.equal(saved.state.enemy._profile.sight, f.game.willard.enemy._profile.sight);
  }
  assert(maximum < 150000); assert.equal(f.game.willard.flak.guns.length, 8);
});

test('repeated retries count distinct attempts while preserving the same earned checkpoint', () => {
  const f=fixture(), saved=checkpoint(f);
  for(let attempt=1;attempt<=4;attempt++){
    assert.equal(f.M.retry(f.game),true);f.game=f.App.game;f.M.start(f.game,{seed:999});
    assert.equal(f.game.willard.retries,attempt);assert.deepEqual(clone(f.game.ac.p),saved.ac.p);
    assert.equal(f.game.willard.phase,saved.state.phase);assert.equal(f.M.validCheckpoint(f.game.willard.checkpoint),true);
  }
});

test('old missions retain original update, director, objectives, teaching, death and debrief delegation', () => {
  const f = fixture({ mission: { id: 'm2' } }), g = f.game;
  assert.equal(g.willard, undefined); g.update(.4);
  assert.equal(f.calls.filter(c => c[0] === 'update').length, 1); assert.equal(f.calls[0][2], .4);
  assert.equal(g.director(1), 'original-director'); assert.equal(g.pilotChatter(2), 'original-chatter');
  assert.equal(g.teach('test'), 'original-teach'); assert.equal(g.checkObjectives(3), 'original-check');
  assert.deepEqual(g.objState(), [['Original', 'kept', true]]); assert.equal(g.onDead('test'), 'original-death');
  assert.equal(g.debrief(false, 'original'), 'original-debrief');
});

test('Willard update uses bounded substeps of the existing update instead of replacing player physics', () => {
  const f = fixture(); f.game.update(.4); const updates = f.calls.filter(c => c[0] === 'update');
  assert.equal(updates.length, 15); assert(updates.every(c => c[2] <= 1 / 60));
  assert(Math.abs(updates.reduce((n, c) => n + c[2], 0) - .25) < 1e-9); assert(Math.abs(f.game.willard.elapsed - .25) < 1e-9);
  f.game.paused = true; f.game.update(.1); assert.equal(f.calls.filter(c => c[0] === 'update').length, 15);
});

test('checkpoint validation rejects malformed physics, time, score, enemy and gun state before restoration', () => {
  const f = fixture(), saved = checkpoint(f);
  const corruptions = [
    x => { delete x.worldTime; }, x => { x.worldTime = -1; }, x => { delete x.score; },
    x => { x.ac.yaw = null; }, x => { x.ac.dmg.eng = 'broken'; }, x => { x.ac.crew.bn = -1; },
    x => { x.bombsMax = -3; }, x => { x.targets[0].hp = -999; },
    x => { x.state.elapsed = -1; }, x => { x.state.flak.guns = null; },
    x => { x.state.enemy._profile = null; }, x => { x.state.enemy.p = [null, 600, 100]; },
    x => { x.state.flak.guns[0].observations.a6 = [{}]; },
    x => { x.state.flak.shells = [{}]; }, x => { x.state.flak.bursts = [{}]; },
    x => { x.state.enemy.projectiles = [{}]; }, x => { delete x.state.enemy.stateTime; },
    x => { x.state.flak.lights = [{}]; }
  ];
  for (const mutate of corruptions) { const invalid = clone(saved); mutate(invalid); assert.equal(f.M.validCheckpoint(invalid), false, mutate.toString()); }
});


test('safe egress cannot complete with either crew member dead, even after genuine flak disruption', () => {
  for (const who of ['pilot', 'bn']) {
    const f = fixture(); toward(f, f.game.willard.route.flak);
    assert(f.game.willard.flakDisrupted, 'real gun belt must first break the pursuit');
    f.game.ac.crew[who] = 0; toward(f, f.game.willard.route.safe);
    assert.equal(f.game.result.pass, false); assert.equal(f.game.willard.phase, 'failed'); assert.equal(f.App.prog.done.willard, undefined);
    assert.equal(f.game.willard.completed, false);
    f.game.debrief(true, 'One crew member was lost.');
    assert.equal(f.game.result.pass, false);
  }
});

test('retry rejects absent or malformed checkpoints and does not replace a running game', () => {
  const f = fixture(), old = f.App.game;
  assert.equal(f.M.retry(old), false); assert.equal(f.App.game, old);
  f.Store.set(f.M.KEY, { version: 1, missionId: 'willard' });
  assert.equal(f.M.retry(old), false); assert.equal(f.App.game, old);
});

test('read-only mission inspection does not expose live route, gun or enemy arrays', () => {
  const f = fixture(); spawn(f); const before = JSON.stringify(f.game.willard);
  const snapshot = f.M.snapshot(f.game);
  snapshot.route.flak[0] = Infinity; snapshot.enemy.p[0] = -999999; snapshot.enemy.projectiles.length = 0;
  snapshot.flak.guns[0].p[0] = 999999; snapshot.events.push({ type: 'fixture' });
  assert.equal(JSON.stringify(f.game.willard), before);
});

test('an actual interceptor terrain collision permits an explicit alternate evasion, without a flak reward', () => {
  // Isolated terrain-collision fixture: reveal a narrow ridge underneath the
  // visible interceptor. The player aircraft is more than 3 km clear; no enemy
  // alive, health, damage-source, escape or result flag is written by the test.
  let ridge = null;
  const f = fixture({ terrainH: (x, z) => ridge && Math.hypot(x - ridge[0], z - ridge[2]) < 100 ? ridge[1] + 80 : 0 });
  spawn(f); step(f, .4); const enemy = f.game.willard.enemy;
  assert.equal(enemy.visible, true); ridge = enemy.p.slice(); step(f, .05);
  assert.equal(enemy.alive, false); assert.equal(enemy._damageSource, 'terrain');
  assert.equal(f.game.willard.phase, 'egress'); assert.equal(f.game.willard.terrainEscape, true);
  assert.equal(f.game.willard.flakDisrupted, false); assert.equal(f.game.result, null);
  toward(f, f.game.willard.route.safe);
  assert.equal(f.game.result.pass, true); assert.equal(f.game.willard.score.parts.flak, 0);
  assert(f.radios.some(row => /not a historical confirmed kill/.test(row[1])));
});

test('phase-one debrief callbacks and exported finish cannot award unearned victory', () => {
  const f = fixture();
  assert.equal(f.game.debrief(true, 'Premature carrier callback.'), false);
  assert.equal(f.M.finish(f.game, true, 'Premature success.', false), false);
  assert.equal(f.game.result, null); assert.equal(f.game.willard.completed, false);
  assert.equal(f.App.prog.done.willard, undefined); assert.deepEqual(f.Store.get('log', []), []);
});

test('checkpoint validation rejects missing integrator and flak scheduler fields instead of restoring a crashing flight', () => {
  const f = fixture(), saved = checkpoint(f);
  const corruptions = [
    x => { delete x.ac.gLoad; }, x => { delete x.ac.stallShake; },
    x => { delete x.ac.dmg.fire; }, x => { delete x.state.flak.beamCursor; },
    x => { delete x.state.flak.beamClock; }, x => { delete x.state.flak.guns[0].sampleClock; },
    x => { x.retries = 'bad'; }, x => { x.state.flak.beamCursor = -1; }
  ];
  for (const mutate of corruptions) {
    const invalid = clone(saved); mutate(invalid);
    assert.equal(f.M.validCheckpoint(invalid), false, mutate.toString());
  }
});

test('egress completion rejects a still-near pursuer even after authentic flak disruption', () => {
  const f = fixture(); toward(f, f.game.willard.route.flak); const s = f.game.willard;
  assert(s.flakDisrupted, 'earn disruption through the production gun/interceptor simulation');
  // Explicit post-disruption spatial fixture: the disengaging fighter has not
  // yet opened safe separation. No result, damage or success flag is seeded.
  f.game.ac.p = s.route.safe.slice(); s.enemy.p = [f.game.ac.p[0] - 2000, f.game.ac.p[1], f.game.ac.p[2]];
  assert.equal(f.M.finish(f.game, true, 'Premature safe-egress callback.', false), false);
  assert.equal(f.game.result, null); assert.equal(f.App.prog.done.willard, undefined);
});

test('carrier-recovery callback requires a real deck and wire, not merely a safe ocean coordinate', () => {
  const f = fixture(); toward(f, f.game.willard.route.flak); const s = f.game.willard;
  assert(s.flakDisrupted); f.game.ac.p = s.route.safe.slice();
  assert.equal(f.game.ac.onDeck, false); assert.equal(f.game.wire, undefined);
  assert.equal(f.game.debrief(true, 'Spurious carrier callback.'), false);
  assert.equal(f.game.result, null); assert.deepEqual(f.Store.get('log', []), []);
});

test('earned optional carrier recovery updates its one safe-egress entry after a genuine deck/wire state', () => {
  const f = fixture(); toward(f, f.game.willard.route.flak); toward(f, f.game.willard.route.safe);
  assert.equal(f.game.result.pass, true); assert.equal(f.game.result.recovered, false);
  assert.equal(f.Store.get('log', []).length, 1);
  // This is the state set by the native optional-recovery action and original
  // tryTrap method; actual approach/arrestment belongs to the browser test.
  f.game.result = null; f.game.paused = false; f.game.willard.recovery = true;
  f.game.ac.onDeck = true; f.game.wire = 3;
  assert.equal(f.game.debrief(true, 'Recovered aboard Constellation.'), true);
  assert.equal(f.game.result.pass, true); assert.equal(f.game.result.recovered, true);
  const log = f.Store.get('log', []); assert.equal(log.length, 1); assert.equal(log[0].landed, true);
});

test('an unsaveable crew state cannot overwrite the last valid rapid-retry checkpoint', () => {
  const f = fixture(), before = checkpoint(f), current = f.game.willard.checkpoint;
  f.game.ac.crew.bn = 0;
  assert.equal(f.M.checkpoint(f.game, 'Cannot save a lost crew member'), false);
  assert.deepEqual(f.Store.get(f.M.KEY, null), before);
  assert.equal(f.game.willard.checkpoint, current);
  assert.equal(f.M.validCheckpoint(f.Store.get(f.M.KEY, null)), true);
});

test('new reconstruction radio keeps the tribute crew out of 1966 dialogue and delegates legacy missions unchanged', () => {
  const f = fixture();
  f.App.radio('TURCZYN', 'Nine seven two, Mac. Turn toward Kitty Hawk.', 'warn', 'en', 'Turczyn calls Mac.');
  assert.deepEqual(f.radios.at(-1), ['Pilot · DRAMATIZED', 'Tiger, B/N. Turn toward Constellation.', 'warn', 'en', 'Pilot calls B/N.']);
  f.App.game = f.make({ id: 'm2' });
  f.App.radio('TURCZYN', 'Nine seven two, Mac. Turn toward Kitty Hawk.', 'warn', 'en', 'Turczyn calls Mac.');
  assert.deepEqual(f.radios.at(-1), ['TURCZYN', 'Nine seven two, Mac. Turn toward Kitty Hawk.', 'warn', 'en', 'Turczyn calls Mac.']);
});
