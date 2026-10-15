'use strict';
// Domain tests execute the production Game._weapons and applyFirstContact
// methods extracted unchanged from index.html. Audio/terrain/witness effects
// are explicit fixtures; this file does not claim browser or device testing.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), test = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const moduleSource = fs.readFileSync(path.join(__dirname, '../assets/survival/ammunition.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function method(signature, nextMarker) {
  const start = html.indexOf('  ' + signature + ' {');
  assert.ok(start > 0, 'production method exists: ' + signature);
  const end = html.indexOf(nextMarker, start);
  assert.ok(end > start, 'production method boundary exists: ' + signature);
  return html.slice(start, end);
}
function fixture() {
  const sounds = [], messages = [], window = {};
  const context = vm.createContext({ window, console, Number, Object, WeakMap,
    PI: Math.PI, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    rnd: (lo, hi) => (lo + hi) / 2, terrainH: () => 0 });
  vm.runInContext(moduleSource, context);
  context.SurvivalAmmunition = window.SurvivalAmmunition;
  vm.runInContext('globalThis.methods={' +
    method('_weapons(dt, e, A, K)', '  /* ---- people are solid') + ',' +
    method('applyFirstContact(res)', '  /* The hour between the canopy') + '};', context);
  const e = { p: [0, 0, 0], hdg: 0, rounds: 6, hasPistol: true, hasKnife: true,
    drawn: 1, weaponMode: 'pistol', lastShot: -99, kills: 0, noise: 0,
    searchers: [], locals: [], cattle: [], spawn: 100 };
  const game = { t: 10, phase: 'evade', evade: e, mis: { escape: false },
    world: { score: { hits: 3, dropped: 4, cep: [20] }, fx: { glow() {}, smoke() {} } },
    app: { radio: (...args) => messages.push(args), audio: { burst: (...args) => sounds.push(args) } },
    _alertWitnesses() {}, _groundLineOfSight() { return true; }, _panicAtCow() {}, teach() {} };
  const fire = (dt = 1, keys = { Space: true }) => {
    game.t += dt;
    context.methods._weapons.call(game, 1 / 60, e, game.app, keys);
  };
  const contact = result => context.methods.applyFirstContact.call(game, result);
  return { A: window.SurvivalAmmunition, game, e, fire, contact, sounds, messages, context };
}

test('remaining HUD reads do not create counters, mutate inventory or touch aircraft ordnance', () => {
  const f = fixture(), before = clone(f.game);
  const view = f.A.view(f.game);
  assert.equal(view.remaining, 6); assert.equal(view.bulletsExpended, 0); assert.equal(view.hasPistol, true);
  assert.deepEqual(clone(f.game), before); assert.deepEqual(clone(f.A.snapshot(f.game)),
    { version: 1, bulletsExpended: 0, pistolShots: 0, narrativeRoundsExpended: 0, roundsAcquired: 0 });
});
test('one real accepted trigger shot spends one round even when it hits nothing', () => {
  const f = fixture(); f.fire();
  assert.equal(f.e.rounds, 5); assert.equal(f.game.world.score.bulletsExpended, 1);
  assert.equal(f.game.world.score.pistolShots, 1); assert.equal(f.game.world.score.narrativeRoundsExpended, 0);
  assert.equal(f.sounds.filter(s => s[0] === 'gun').length, 1);
  assert.deepEqual(f.game.world.score.cep, [20]); assert.equal(f.game.world.score.dropped, 4);
});
test('trigger debounce and the actual pistol cooldown cannot spend or count extra rounds', () => {
  const f = fixture(); f.fire(); f.fire(.1); f.fire(.31);
  assert.equal(f.e.rounds, 5); assert.equal(f.game.world.score.pistolShots, 1);
  f.fire(.46); assert.equal(f.e.rounds, 4); assert.equal(f.game.world.score.pistolShots, 2);
});
test('held attack exhausts the original finite six rounds then dry fires without increasing expenditure', () => {
  const f = fixture(); for (let i = 0; i < 9; i++) f.fire(1);
  assert.equal(f.e.rounds, 0); assert.equal(f.game.world.score.bulletsExpended, 6);
  assert.equal(f.sounds.filter(s => s[0] === 'gun').length, 6);
  assert.equal(f.sounds.filter(s => s[0] === 'thunk').length, 3);
});
test('a holstered pistol, fists, knife and hands-up state spend no bullets', () => {
  for (const change of [e => e.drawn = 0, e => { e.weaponMode = 'fists'; e.drawn = 0; },
    e => { e.weaponMode = 'knife'; e.drawn = 0; }, e => e.handsUp = true]) {
    const f = fixture(); change(f.e); f.fire();
    assert.equal(f.e.rounds, 6); assert.equal(f.A.view(f.game).bulletsExpended, 0);
    assert.equal(f.sounds.filter(s => s[0] === 'gun').length, 0);
  }
});
test('a real hit and a shot blocked by actual weapon LOS each cost exactly one round', () => {
  for (const blocked of [false, true]) {
    const f = fixture(); f.game._groundLineOfSight = () => !blocked;
    f.e.searchers = [{ p: [0, 0, -2], alive: true, armed: true, face: 0 }];
    vm.runInContext('Math.random=()=>0;', f.context);
    f.fire(); assert.equal(f.e.rounds, 5); assert.equal(f.A.view(f.game).pistolShots, 1);
    assert.equal(!!f.e.searchers[0].wounds, !blocked);
  }
});
test('duplicate notification of the same accepted physical shot is ignored', () => {
  const f = fixture(); f.fire();
  assert.equal(f.A.fired(f.game, f.e, 6), false); assert.equal(f.A.fired(f.game, f.e, 6), false);
  assert.equal(f.A.view(f.game).bulletsExpended, 1);
});
test('invalid, unaccepted and replenishment deltas cannot be registered as physical shots', () => {
  const f = fixture();
  for (const before of [-1, NaN, Infinity, 6.5, 6, 5]) assert.equal(f.A.fired(f.game, f.e, before), false);
  f.e.rounds = 5; f.e.drawn = 0; assert.equal(f.A.fired(f.game, f.e, 6), false);
  f.e.drawn = 1; f.e.weaponMode = 'knife'; assert.equal(f.A.fired(f.game, f.e, 6), false);
  f.e.weaponMode = 'pistol'; f.e.hasPistol = false; assert.equal(f.A.fired(f.game, f.e, 6), false);
  assert.equal(f.A.view(f.game).bulletsExpended, 0);
});
test('actual first-contact consumption counts the limited delta separately from trigger shots', () => {
  const f = fixture(); f.fire(); f.contact({ rounds: -2 });
  assert.equal(f.e.rounds, 3); assert.equal(f.game.world.score.bulletsExpended, 3);
  assert.equal(f.game.world.score.pistolShots, 1); assert.equal(f.game.world.score.narrativeRoundsExpended, 2);
  f.contact({ rounds: -20 }); assert.equal(f.e.rounds, 0);
  assert.equal(f.game.world.score.bulletsExpended, 6); assert.equal(f.game.world.score.narrativeRoundsExpended, 5);
  f.contact({ rounds: -2 }); assert.equal(f.game.world.score.bulletsExpended, 6);
});
test('actual first-contact replenishment counts only available inventory capacity and never unspends bullets', () => {
  const f = fixture(); f.fire(); f.contact({ rounds: 2 });
  assert.equal(f.e.rounds, 7); assert.equal(f.A.view(f.game).roundsAcquired, 2);
  assert.equal(f.A.view(f.game).bulletsExpended, 1);
  f.contact({ rounds: 50 }); assert.equal(f.e.rounds, 12); assert.equal(f.A.view(f.game).roundsAcquired, 7);
  f.contact({ rounds: 2 }); assert.equal(f.A.view(f.game).roundsAcquired, 7);
});
test('capture, recapture and rescue replacing the evader cannot reset sortie expenditure or grant equipment', () => {
  const f = fixture(); f.fire(); f.fire();
  f.game.evade = { p: [0, 0, 0], rounds: 0, hasPistol: false, camp: true };
  assert.equal(f.A.view(f.game).remaining, 0); assert.equal(f.A.view(f.game).bulletsExpended, 2);
  f.game.evade = { rounds: 0, hasPistol: false, river: true };
  assert.equal(f.A.view(f.game).bulletsExpended, 2);
  f.game.evade = null; f.game.rescuedOK = true;
  assert.equal(f.A.view(f.game).bulletsExpended, 2); assert.equal(f.A.view(f.game).remaining, 0);
});
test('saved ledger restores into a fresh game while leaving confiscated inventory and mission score intact', () => {
  const f = fixture(); f.fire(); f.contact({ rounds: -2 }); f.contact({ rounds: 2 });
  const saved = clone(f.A.snapshot(f.game)), fresh = fixture();
  fresh.game.evade = { rounds: 0, hasPistol: false, camp: true }; const equipment = clone(fresh.game.evade);
  assert.equal(fresh.A.restore(fresh.game, saved), true);
  assert.equal(fresh.A.view(fresh.game).bulletsExpended, 3); assert.equal(fresh.A.view(fresh.game).roundsAcquired, 2);
  assert.deepEqual(fresh.game.evade, equipment); assert.equal(fresh.game.world.score.hits, 3);
  assert.equal(fresh.game.world.score.dropped, 4); assert.deepEqual(clone(fresh.A.snapshot(fresh.game)), saved);
});
test('missing and corrupt old checkpoints do not wipe an existing ledger', () => {
  const f = fixture(); f.fire(); const before = clone(f.game.world.score);
  for (const saved of [undefined, null, {}, { version: 0 },
    { version: 1, bulletsExpended: 4, pistolShots: 1, narrativeRoundsExpended: 2, roundsAcquired: 0 },
    { version: 1, bulletsExpended: NaN, pistolShots: -2, narrativeRoundsExpended: 2, roundsAcquired: 0 }])
    assert.equal(f.A.restore(f.game, saved), false);
  assert.deepEqual(f.game.world.score, before);
});
test('a new World score begins a new sortie and read-only legacy values are sanitized', () => {
  const f = fixture(); f.fire(); f.game.world.score = { dropped: 0, hits: 0 };
  assert.equal(f.A.view(f.game).bulletsExpended, 0);
  f.game.world.score = { bulletsExpended: 3 }; assert.equal(f.A.view(f.game).pistolShots, 3);
  f.game.world.score = { bulletsExpended: -7, pistolShots: Infinity, roundsAcquired: NaN };
  assert.equal(f.A.view(f.game).bulletsExpended, 0); assert.equal(f.A.view(f.game).roundsAcquired, 0);
});
