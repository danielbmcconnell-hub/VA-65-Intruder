'use strict';
// Actual core/mindscape state; no browser/GPU or historical-source claim.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), test = require('node:test');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const window = {}, context = vm.createContext({ window, console, Date });
  for (const name of ['core', 'captivity', 'mindscape', 'memory-detail']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pow/' + name + '.js'), 'utf8'), context);
  const P = window.POW; P.notify = () => {}; P.updateUI = () => {}; P.save = () => null;
  const game = { pow: { stage: 'solitary', base: [100, 20, 300], day: 1, time: 17, flags: {}, inventory: {}, stats: { physical: 80, fatigue: 15, resilience: 65, morale: 65, memory: 60, hope: 60 }, solids: [], surfaces: [], objects: [], difficulty: 'normal' }, evade: { p: [100, 20, 300], searchers: [], locals: [], hdg: .3, look: -.1 }, campGeo: [], app: { keys: {}, gctl: {}, set: { sound: false } }, atm: { night: true, exposure: 2.8, zenith: [.01, .02, .03] }, setHour() {} };
  P.Captivity.enter(game); return { P, M: P.Mindscape, D: P.MemoryDetail, C: P.Captivity, game, c: game.pow.captivity };
}
const details = f => f.game.campGeo.filter(q => q.id.startsWith('memory-detail:'));
test('decorations are limited to the actual imagined scene and do not change physical state', () => {
  const f = fixture(), scene = f.game.campGeo, saved = clone({ pow: f.game.pow, evade: f.game.evade });
  assert.equal(f.D.decorate(f.game).active, false); assert.equal(f.game.campGeo, scene); assert.equal(f.D.renderState(f.game), null); assert.deepEqual(clone({ pow: f.game.pow, evade: f.game.evade }), saved);
});
test('real mechanical assembly grows details only as the corresponding components are accepted', () => {
  const f = fixture(); f.M.open(f.game, 'car'); assert.equal(f.D.decorate(f.game).count, 0);
  f.C.carChoose(f.game, 'wheels'); f.M.rebuild(f.game); f.D.decorate(f.game); assert.equal(details(f).length, 0, 'an invalid wheel choice adds no fictional completed cabin');
  f.C.carChoose(f.game, 'block'); f.M.rebuild(f.game); assert.equal(f.D.decorate(f.game).count, 2);
  assert.ok(details(f).some(q => q.id.includes('engine-nameplate'))); assert.ok(!details(f).some(q => q.id.includes('cabin')));
  for (const part of f.C.data.car.slice(1)) f.C.carChoose(f.game, part.id); f.M.rebuild(f.game); f.D.decorate(f.game);
  assert.ok(details(f).some(q => q.id.includes('remembered-cabin-roof'))); assert.ok(details(f).length <= 32);
});
test('remembered house details follow framing, services and actual furniture choices', () => {
  const f = fixture(); f.M.open(f.game, 'architecture'); f.D.decorate(f.game); assert.equal(details(f).length, 0);
  f.C.architectureChoose(f.game, 'concrete'); f.C.architectureChoose(f.game, 'timber'); f.M.rebuild(f.game); f.D.decorate(f.game);
  assert.ok(details(f).some(q => q.id.includes('curtain'))); assert.ok(!details(f).some(q => q.id.includes('bed-pillow')));
  for (const id of ['pitched', 'gravity', 'conduit', 'clear']) f.C.architectureChoose(f.game, id);
  // The existing puzzle resets after completion; its completed visual model is
  // retained by the real mindscape interaction contract.
  f.c.mindscape.completedHouse = { choices: { foundation: 'concrete', framing: 'timber', roof: 'pitched', plumbing: 'gravity', electrical: 'conduit', furniture: 'clear' } };
  f.M.rebuild(f.game); f.D.decorate(f.game); assert.ok(details(f).some(q => q.id.includes('bed-pillow'))); assert.ok(details(f).some(q => q.id.includes('clock-face')));
});
test('actual city plots receive matching visual services and never imply unplaced buildings', () => {
  const f = fixture(); f.M.open(f.game, 'city'); f.D.decorate(f.game); assert.equal(details(f).length, 0);
  f.C.cityPlace(f.game, 16, 'housing'); f.C.cityPlace(f.game, 5, 'water'); f.M.rebuild(f.game); f.D.decorate(f.game);
  assert.ok(details(f).some(q => q.id === 'memory-detail:city-door-16')); assert.ok(details(f).some(q => q.id === 'memory-detail:water-valve-5'));
  assert.ok(!details(f).some(q => q.id === 'memory-detail:city-door-18'));
});
test('idempotent updates and scene rebuilds keep unique bounded decorations with no new collision or interactions', () => {
  const f = fixture(); f.M.open(f.game, 'city'); f.c.city.grid.fill('housing'); f.M.rebuild(f.game);
  const solids = f.game.pow.solids, objects = f.game.pow.objects, snapshot = clone({ c: f.c, stats: f.game.pow.stats, flags: f.game.pow.flags, inventory: f.game.pow.inventory, surfaces: f.game.pow.surfaces });
  f.D.decorate(f.game); const count = f.game.campGeo.length, scene = f.game.campGeo;
  for (let i = 0; i < 100; i++) f.D.decorate(f.game);
  assert.equal(f.game.campGeo, scene); assert.equal(f.game.campGeo.length, count); assert.equal(details(f).length, 32);
  assert.equal(new Set(details(f).map(q => q.id)).size, 32); assert.equal(f.game.pow.solids, solids); assert.equal(f.game.pow.objects, objects);
  assert.deepEqual(clone({ c: f.c, stats: f.game.pow.stats, flags: f.game.pow.flags, inventory: f.game.pow.inventory, surfaces: f.game.pow.surfaces }), snapshot);
  f.M.rebuild(f.game); f.D.decorate(f.game); assert.equal(details(f).length, 32); assert.ok(details(f).every(q => q.p.concat(q.scale, q.t).every(Number.isFinite)));
});
test('warm renderer profile is imaginary-only and never changes actual night, clocks or exposure', () => {
  const f = fixture(), atmosphere = f.game.atm, time = f.game.pow.time, minute = f.c.minute;
  f.M.open(f.game, 'car'); const profile = f.D.renderState(f.game); assert.equal(profile.imagined, true); assert.equal(profile.atmosphere.night, false); assert.ok(profile.ambient[0] > profile.ambient[2]);
  assert.equal(f.game.atm, atmosphere); assert.equal(f.game.atm.night, true); assert.equal(f.game.atm.exposure, 2.8); assert.equal(f.game.pow.time, time); assert.equal(f.c.minute, minute);
  f.M.close(f.game); assert.equal(f.D.renderState(f.game), null);
});
test('return and project switching preserve exact physical checkpoint and original scene references', () => {
  const f = fixture(), e = f.game.evade, p = e.p.slice(), scene = f.game.campGeo, solids = f.game.pow.solids;
  f.M.open(f.game, 'car'); f.C.carChoose(f.game, 'block'); f.M.rebuild(f.game); f.D.decorate(f.game);
  const saved = f.M.physicalSnapshot(f.game, {}); assert.deepEqual(Array.from(saved.p), Array.from(p));
  f.M.close(f.game); f.D.cleanup(f.game); assert.equal(f.game.evade, e); assert.equal(f.game.campGeo, scene); assert.equal(f.game.pow.solids, solids); assert.equal(details(f).length, 0);
  f.M.open(f.game, 'city'); f.D.decorate(f.game); assert.equal(details(f).length, 0); f.M.close(f.game); assert.equal(f.game.campGeo, scene);
});
