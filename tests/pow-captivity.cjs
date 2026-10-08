'use strict';

// Domain checks run the real core collision and real captivity module without
// a DOM, browser or GPU. Notifications/audio/storage are recording fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(stage = 'solitary') {
  const window = {}, context = vm.createContext({ window });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pow/core.js'), 'utf8'), context);
  const P = window.POW, calls = { noises: [], notices: [], finishes: [], begins: [], saves: [] };
  P.notify = (game, message) => calls.notices.push(message);
  P.save = game => { const s = game.pow; const out = clone({ stage: s.stage, day: s.day, time: s.time, base: s.base, p: game.evade.p, flags: s.flags, inventory: s.inventory, stats: s.stats, difficulty: s.difficulty, intensity: s.intensity, captivity: s.captivity }); calls.saves.push(out); return out; };
  P.finish = (game, result) => calls.finishes.push(result);
  P.begin = (game, stage, saved) => calls.begins.push({ stage, saved });
  P.AI = { noise: (game, p, loudness, kind) => calls.noises.push({ p: p.slice(), loudness, kind }) };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pow/captivity.js'), 'utf8'), context);
  const game = { pow: { stage, base: [100, 20, 300], day: 1, time: 0, difficulty: 'normal', intensity: 'standard', flags: {}, inventory: {}, stats: { physical: 65, fatigue: 25, resilience: 60, morale: 60, memory: 60, hope: 60 }, solids: [], objects: [], surfaces: [] }, evade: { p: [100, 20, 300], searchers: [], locals: [] }, campGeo: [], app: { keys: {}, set: { sound: 0 }, audio: { burst() {} } }, setHour() {}, mis: { title: 'Coker · 1967' } };
  const C = P.Captivity;
  if (stage === 'solitary') C.enter(game); else C.state(game);
  return { game, P, C, T: P.TapCode, calls, s: game.pow, c: game.pow.captivity, e: game.evade };
}
function tick(f, seconds, cell = false) { for (let n = 0; n < Math.ceil(seconds * 10); n++) { f.s.time += .1; (cell ? f.C.stepCell : f.C.step)(f.game, .1); } }
function encodeInput(f, word) {
  for (const pair of f.T.encode(word)) {
    for (const group of ['row', 'col']) for (let n = 0; n < pair[group]; n++) { f.C.advance(f.game, .2, 'clock'); assert.equal(f.C.tapHit(f.game, group), true); }
    assert.equal(f.C.tapLetter(f.game), true);
  }
}
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('C/K tap matrix validates bounds, punctuation, case and word spaces', () => {
  const f = fixture();
  assert.equal(f.T.decode(1, 3), 'C'); assert.equal(f.T.decode(3, 1), 'L');
  assert.equal(f.T.decode(5, 5), 'Z'); assert.equal(f.T.decode(0, 1), null); assert.equal(f.T.decode(2.5, 2), null);
  assert.equal(f.T.decode(f.T.encode('Keep hope!')), 'CEEP HOPE');
  assert.equal(f.T.decode([1, 3]), 'C'); assert.equal(f.T.decode({ row: 5, col: 5 }), 'Z');
  assert.equal(f.T.normalize('THANKS'), 'THANCS');
});
test('builds the real three-by-nine-foot cell, permanent bulb, shackles and finite world geometry', () => {
  const f = fixture(), left = f.s.solids.find(q => q.id === 'cell-left'), right = f.s.solids.find(q => q.id === 'cell-right');
  assert.ok(Math.abs((right.x - right.hw) - (left.x + left.hw) - .9144) < 1e-9);
  assert.equal(f.s.motion.radius, .19); assert.equal(f.s.p, f.e.p); assert.equal(f.s.lights[0].permanent, true);
  assert.ok(f.game.campGeo.some(q => q.id === 'permanent-bulb' && q.t[3] === 4));
  assert.ok(f.game.campGeo.some(q => q.id === 'ankle-bar'));
  assert.ok(f.game.campGeo.every(q => q.p.concat(q.scale).every(Number.isFinite)));
});
test('real swept collision blocks thin walls, locked door and bed without tunnelling', () => {
  const f = fixture(), start = f.e.p.slice();
  f.P.move(f.game, f.e, 50, 0, .19); assert.ok(f.e.p[0] <= f.s.base[0] + .2673);
  f.P.move(f.game, f.e, -100, 0, .19); assert.ok(f.e.p[0] >= f.s.base[0] - .2673);
  f.e.p.splice(0, 3, ...start); f.P.move(f.game, f.e, 0, -30, .19); assert.ok(f.e.p[2] >= f.s.base[2] - 1.1817);
  f.e.p.splice(0, 3, ...start); f.P.move(f.game, f.e, 0, 30, .19); assert.ok(f.e.p[2] <= f.s.base[2] - .3699);
  assert.equal(f.P.blocked(f.game, ...[f.e.p[0], f.e.p[2], .19, f.e.p[1]]), false);
});
test('night shackling physically constrains movement and never opens the door', () => {
  const f = fixture(); f.c.minute = 21 * 60;
  const origin = f.c.tetherOrigin.slice(); f.P.move(f.game, f.e, .2, -.2, .19); f.C.step(f.game, .1);
  assert.ok(Math.hypot(f.e.p[0] - origin[0], f.e.p[2] - origin[1]) <= .10001);
  assert.equal(f.s.motion.speed, 0); assert.equal(f.s.flags.nightShackles, true);
  assert.equal(f.s.solids.find(q => q.id === 'cell-door').active, true);
});
test('engine assembly enforces real dependencies and four-stroke order before recall', () => {
  const f = fixture(); assert.equal(f.C.carChoose(f.game, 'pistons'), false); assert.equal(f.c.car.installed.length, 0);
  for (const part of f.C.data.car) assert.equal(f.C.carChoose(f.game, part.id), true);
  assert.equal(f.c.car.phase, 'cycle'); assert.equal(f.C.carCycle(f.game, 'Power'), false);
  for (const phase of ['Intake', 'Compression', 'Power', 'Exhaust']) assert.equal(f.C.carCycle(f.game, phase), true);
  assert.equal(f.c.car.phase, 'recall');
  for (const target of f.c.car.targets.slice()) assert.equal(f.C.carRecall(f.game, target), true);
  assert.equal(f.c.car.round, 2); assert.equal(f.c.car.phase, 'assemble'); assert.equal(f.s.stats.memory, 63);
});
test('repeating an entire engine on the same day gives no extra memory gain', () => {
  const f = fixture();
  function complete() { for (const part of f.C.data.car) f.C.carChoose(f.game, part.id); for (const phase of ['Intake', 'Compression', 'Power', 'Exhaust']) f.C.carCycle(f.game, phase); for (const id of f.c.car.targets.slice()) f.C.carRecall(f.game, id); }
  complete(); const memory = f.s.stats.memory; complete(); assert.equal(f.s.stats.memory, memory); assert.equal(f.c.car.round, 3);
});
test('house planning enforces damp foundation, load, budget, protected services and clear access', () => {
  const f = fixture(); assert.equal(f.C.architectureChoose(f.game, 'timber'), false);
  assert.equal(f.C.architectureChoose(f.game, 'concrete'), true); assert.equal(f.C.architectureChoose(f.game, 'timber'), true);
  assert.equal(f.C.architectureChoose(f.game, 'slate'), false); assert.equal(f.C.architectureChoose(f.game, 'flat'), false);
  assert.equal(f.C.architectureChoose(f.game, 'pitched'), true); assert.equal(f.C.architectureChoose(f.game, 'shared'), false);
  assert.equal(f.C.architectureChoose(f.game, 'gravity'), true); assert.equal(f.C.architectureChoose(f.game, 'bare'), false);
  assert.equal(f.C.architectureChoose(f.game, 'conduit'), true); assert.equal(f.C.architectureChoose(f.game, 'blocked'), false);
  assert.equal(f.C.architectureChoose(f.game, 'clear'), true); assert.equal(f.c.architecture.round, 2); assert.equal(f.s.stats.morale, 63);
});
test('city validation rejects disconnected and unsafe placement then accepts an actual connected neighbourhood', () => {
  const f = fixture(); assert.equal(f.C.cityValidate(f.game), false);
  for (const [i, type] of [[5, 'water'], [9, 'utility'], [16, 'housing'], [18, 'housing'], [22, 'school'], [17, 'park'], [12, 'stop']]) assert.equal(f.C.cityPlace(f.game, i, type), true);
  assert.deepEqual(Array.from(f.C.cityErrors(f.c.city, false)), []);
  assert.equal(f.C.cityValidate(f.game), true); assert.equal(f.c.city.round, 2);
  const disconnected = { round: 1, grid: f.c.city.grid.slice() }; disconnected.grid[0] = 'road';
  assert.ok(f.C.cityErrors(disconnected, false).some(e => e.includes('Connect every street')));
});
test('hard city challenge actually requires another housing block and tighter transport coverage', () => {
  const f = fixture(); f.s.difficulty = 'hard';
  for (const [i, type] of [[5, 'water'], [9, 'utility'], [16, 'housing'], [18, 'housing'], [22, 'school'], [17, 'park'], [12, 'stop']]) f.C.cityPlace(f.game, i, type);
  assert.equal(f.C.cityValidate(f.game), false); assert.equal(f.c.city.round, 1);
  f.C.cityPlace(f.game, 6, 'housing'); assert.equal(f.C.cityValidate(f.game), true);
});
test('timed memory blocks early inputs, rejects a wrong pattern and grows after a complete sequence', () => {
  const f = fixture(); assert.equal(f.C.memoryStart(f.game), true); assert.equal(f.C.memoryInput(f.game, 0), false);
  tick(f, 6); const seq = f.c.memory.sequence.slice(); assert.equal(f.c.memory.phase, 'answer');
  assert.equal(f.C.memoryInput(f.game, (seq[0] + 1) % 4), false); assert.equal(f.c.memory.phase, 'ready');
  f.C.advance(f.game, 1, 'clock'); f.C.memoryStart(f.game); tick(f, 6);
  const length = f.c.memory.sequence.length; for (const i of f.c.memory.sequence.slice()) assert.equal(f.C.memoryInput(f.game, i), true);
  assert.equal(f.c.memory.round, 2); f.C.memoryStart(f.game); assert.equal(f.c.memory.sequence.length, length + 1);
});
test('received timed taps require a decoded spelling and establish contact only after correct entry', () => {
  const f = fixture(); f.C.tapPlay(f.game); const word = f.c.tap.playback.word;
  assert.equal(f.C.tapValidate(f.game), false); assert.equal(f.s.flags.prisonerContact, undefined);
  tick(f, 45); assert.equal(f.c.tap.playback.done, true); encodeInput(f, word);
  assert.equal(f.C.tapValidate(f.game), true); assert.equal(f.s.flags.prisonerContact, true); assert.equal(f.s.flags.wallContact, true);
});
test('sending actual row/column hits emits guard noise and C/K-normalized spelling is accepted', () => {
  const f = fixture(); f.c.tap.mode = 'send'; f.c.tap.sendWord = 'THANKS'; encodeInput(f, 'THANKS');
  assert.ok(f.calls.noises.length > 20); assert.ok(f.calls.noises.some(n => n.kind === 'repeated wall taps'));
  assert.equal(f.C.tapValidate(f.game), true); assert.equal(f.c.tap.sent, 1);
});
test('inspections interrupt receiving and physically pause tap/vent interactions', () => {
  const f = fixture(); f.C.tapPlay(f.game); f.C.inspection(f.game, 'Test corridor check.');
  assert.equal(f.c.tap.playback, null); assert.equal(f.C.tapHit(f.game, 'row'), false);
  f.s.day = 28; f.c.vent.noticed = true; assert.equal(f.C.inspectVent(f.game), false);
  f.C.advance(f.game, 9, 'clock'); assert.equal(f.C.tapHit(f.game, 'row'), true);
});
test('gentle exercise uses alternate inputs and a real hold; fatigue ceiling and daily recovery prevent farming', () => {
  const f = fixture(); f.s.stats.fatigue = 80; assert.equal(f.C.exerciseStart(f.game), false);
  f.s.stats.fatigue = 25; assert.equal(f.C.exerciseStart(f.game), true);
  assert.equal(f.C.exercisePress(f.game, 'right'), false);
  for (const side of ['left', 'right', 'left', 'right', 'left', 'right', 'left', 'right']) assert.equal(f.C.exercisePress(f.game, side), true);
  assert.equal(f.c.exercise.reps, 8); assert.equal(f.s.stats.physical, 65);
  f.c.open = true; f.c.tab = 'exercise'; f.c.exercise.holding = true; tick(f, 3.1);
  assert.equal(f.c.exercise, null); assert.equal(f.s.stats.physical, 66.2); assert.equal(f.C.exerciseStart(f.game), false);
});
test('sleep consumes real interval and accelerated time rather than granting condition on click', () => {
  const f = fixture(); f.s.stats.fatigue = 60; assert.equal(f.C.restStart(f.game, 'sleep'), true);
  assert.equal(f.s.stats.fatigue, 60); tick(f, 16.1);
  assert.equal(f.c.sleeping, null); assert.ok(f.c.elapsedMinutes >= 480); assert.ok(f.s.stats.fatigue < 30); assert.ok(f.s.stats.physical > 65);
});
test('long routines require established activity, accrue weekly/monthly changes and remain stoppable', () => {
  const f = fixture(); assert.equal(f.C.routineStart(f.game), false);
  f.C.advance(f.game, 27 * 1440, 'clock'); assert.equal(f.s.day, 28); assert.equal(f.c.vent.noticed, true);
  f.c.rewards = { car: 28, architecture: 28, memory: 28 }; assert.equal(f.C.routineStart(f.game), true);
  tick(f, 10); assert.equal(f.s.day, 38); assert.equal(f.s.flags.campTransfers, 1); assert.ok(f.c.events.some(e => e.kind === 'week'));
  assert.ok(f.c.logs.some(e => e.message.includes('month'))); f.C.routineStop(f.game); assert.equal(f.c.routine.active, false);
});
test('interview coping choices impose fatigue/time without scoring worth or inventing failure outcomes', () => {
  for (const choice of ['identity', 'pause', 'cope']) {
    const f = fixture(); f.c.pendingEvent = { kind: 'interview', day: 1 }; const resilience = f.s.stats.resilience;
    assert.equal(f.C.interviewChoose(f.game, choice), true); assert.equal(f.s.stats.resilience, resilience);
    assert.equal(f.c.pendingEvent, null); assert.ok(f.s.stats.fatigue > 25); assert.equal(f.calls.finishes.length, 0);
  }
});
test('reduced intensity changes tap pace, audio/noise intensity and interview time/condition cost', () => {
  const standard = fixture(), reduced = fixture(); reduced.s.intensity = 'reduced';
  standard.C.tapPlay(standard.game); reduced.C.tapPlay(reduced.game); tick(standard, 3); tick(reduced, 3);
  assert.ok(standard.c.tap.playback.count !== reduced.c.tap.playback.count || standard.c.tap.playback.group !== reduced.c.tap.playback.group);
  standard.c.pendingEvent = {}; reduced.c.pendingEvent = {}; standard.C.interviewChoose(standard.game, 'cope'); reduced.C.interviewChoose(reduced.game, 'cope');
  assert.ok(standard.c.elapsedMinutes > reduced.c.elapsedMinutes); assert.ok(standard.s.stats.fatigue > reduced.s.stats.fatigue);
});
test('vent preparation requires weeks, different days and observations then enters a physical chapter with persistence', () => {
  const f = fixture(); assert.equal(f.C.inspectVent(f.game), false); f.C.advance(f.game, 27 * 1440, 'clock');
  assert.equal(f.C.inspectVent(f.game), false, 'unrested fixture must first recover from accumulated fatigue');
  f.C.restStart(f.game, 'sleep'); tick(f, 16.1);
  if (f.c.pendingEvent) f.C.interviewChoose(f.game, 'pause');
  f.C.inspectDoor(f.game); assert.equal(f.C.inspectVent(f.game), true); assert.equal(f.C.inspectVent(f.game), false);
  f.C.restStart(f.game, 'sleep'); tick(f, 16); f.C.advance(f.game, 16 * 60, 'clock'); f.C.inspectDoor(f.game); assert.equal(f.C.inspectVent(f.game), true);
  f.C.restStart(f.game, 'sleep'); tick(f, 16); f.C.advance(f.game, 16 * 60, 'clock'); assert.equal(f.C.inspectVent(f.game), true); assert.equal(f.c.vent.route, true);
  f.s.flags.doorOpen = true; f.s.inventory.bracket = true;
  assert.equal(f.C.leaveCell(f.game), true); assert.equal(f.calls.finishes.length, 0);
  assert.equal(f.calls.begins[0].stage, 'cell'); assert.equal(f.calls.begins[0].saved.day, 30);
  assert.equal(f.calls.begins[0].saved.flags.doorOpen, undefined); assert.equal(f.calls.begins[0].saved.inventory.bracket, undefined);
  assert.equal(f.calls.begins[0].saved.captivity.car.round, 1);
});
test('saved project, contact, elapsed condition, maps and pattern survive a confinement restore', () => {
  const f = fixture(); f.C.carChoose(f.game, 'block'); f.C.carChoose(f.game, 'bearings');
  f.C.architectureChoose(f.game, 'concrete'); f.C.memoryStart(f.game); tick(f, 6);
  f.c.rewards = { code: 1, exercise: 1 }; f.c.daily.meal = 1; f.c.observations = 3; f.c.pendingEvent = { kind: 'interview', day: 1 };
  const snap = clone(f.c), next = fixture(); assert.equal(next.C.restore(next.game, snap), true);
  assert.deepEqual(clone(next.c.car.installed), ['block', 'bearings']); assert.equal(next.c.architecture.choices.foundation, 'concrete');
  assert.equal(next.c.rewards.code, 1); assert.equal(next.c.daily.meal, 1); assert.equal(next.c.observations, 3);
  assert.deepEqual(clone(next.c.memory.sequence), clone(f.c.memory.sequence)); assert.equal(next.c.pendingEvent.kind, 'interview'); assert.equal(next.c.open, false);
  assert.ok(Math.abs(next.c.elapsedMinutes - f.c.elapsedMinutes) < 1e-9);
});
test('release is unavailable early and requires the prolonged 1973 calendar, then records historical context', () => {
  const f = fixture(); assert.equal(f.C.release(f.game), false); assert.ok(f.C.releaseDay(f.c) > 5 * 365);
  f.C.advance(f.game, f.C.releaseDay(f.c) * 1440, 'clock'); assert.equal(f.c.releaseAvailable, true);
  assert.equal(f.C.release(f.game), true); assert.equal(f.calls.finishes.length, 1);
  assert.match(f.calls.finishes[0].title, /1973/); assert.match(f.calls.finishes[0].text, /591/); assert.match(f.calls.finishes[0].text, /fictional/);
});
test('physical escape cell attaches timed tap activities without replacing its geometry or locking movement', () => {
  const f = fixture('cell'); const geometry = [{ id: 'preserve-flight-geometry' }]; f.game.campGeo = geometry;
  const wall = { id: 'wall-contact', action() {}, enabled: () => false }; f.s.objects.push(wall);
  f.C.stepCell(f.game, .1); assert.equal(f.game.campGeo, geometry); assert.equal(f.s.motion, undefined);
  assert.equal(wall.enabled(), true); wall.action(f.game); assert.equal(f.c.open, true); assert.equal(f.c.tab, 'tap');
  assert.equal(f.s.objects.filter(o => o.id === 'mental-notebook').length, 1); f.C.stepCell(f.game, .1);
  assert.equal(f.s.objects.filter(o => o.id === 'mental-notebook').length, 1);
});

test('visible incoming pulses remain countable at a tenth-second simulation step', () => {
  const f = fixture(); f.C.tapPlay(f.game);
  const expected = f.T.encode(f.c.tap.playback.word), pairs = []; let prior = '', lastGroup = '';
  for (let i = 0; i < 1000 && !f.c.tap.playback.done; i++) {
    f.C.step(f.game, .1); const signal = f.c.tap.signal;
    if (signal.includes('•') && signal !== prior) {
      const group = signal.startsWith('Row') ? 'row' : 'col';
      if (group === 'row' && lastGroup !== 'row') pairs.push({row:0,col:0});
      assert.ok(pairs.length); pairs[pairs.length-1][group]++; lastGroup = group;
    }
    prior = signal;
  }
  assert.equal(f.c.tap.playback.done, true); assert.deepEqual(pairs, clone(expected).map(({row,col})=>({row,col})));
});

let failed = 0;
for (const entry of tests) {
  try { entry.run(); process.stdout.write('PASS ' + entry.name + '\n'); }
  catch (error) { failed++; process.stderr.write('FAIL ' + entry.name + '\n' + error.stack + '\n'); }
}
process.stdout.write((tests.length - failed) + '/' + tests.length + ' pure POW captivity checks passed (no browser/GPU).\n');
process.exitCode = failed ? 1 : 0;
