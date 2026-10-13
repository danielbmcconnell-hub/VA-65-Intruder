'use strict';
// Domain tests exercise the real completed activities, counted tap input,
// clock, condition and restore code. They do not claim browser/GPU coverage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(day = 1) {
  const window = {}, context = vm.createContext({ window });
  for (const file of ['core.js', 'captivity.js', 'solidarity.js', 'regular-confinement.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pow/' + file), 'utf8'), context);
  const P = window.POW, notices = [], saves = [];
  P.notify = (_, message) => notices.push(message);
  P.save = game => { const out = clone({ day: game.pow.day, flags: game.pow.flags, stats: game.pow.stats, captivity: game.pow.captivity }); saves.push(out); return out; };
  P.AI = { noise() {} };
  const game = { pow: { stage: 'solitary', base: [100, 20, 300], day: 1, time: 0, difficulty: 'normal', intensity: 'standard', flags: {}, inventory: {}, stats: { physical: 65, fatigue: 25, resilience: 60, morale: 60, memory: 60, hope: 60 }, solids: [], objects: [], surfaces: [] }, evade: { p: [100, 20, 300], searchers: [], locals: [] }, campGeo: [], app: { keys: {}, set: { sound: 0 }, audio: { burst() {} } }, setHour() {}, mis: { escape: true } };
  const C = P.Captivity; C.enter(game);
  // Explicit calendar-boundary fixtures keep captureDay1 and do not grant
  // answers, identities, activity completions or transfer eligibility.
  game.pow.day = day;
  return { game, P, C, c: game.pow.captivity, s: game.pow, notices, saves };
}
function tick(f, seconds) { for (let i = 0; i < Math.ceil(seconds * 10); i++) { f.s.time += .1; f.C.step(f.game, .1); } }
function inputWord(f, word) {
  for (const pair of f.P.TapCode.encode(word)) {
    if (pair.space) continue;
    for (const group of ['row', 'col']) for (let i = 0; i < pair[group]; i++) { f.C.advance(f.game, .2, 'clock'); assert.equal(f.C.tapHit(f.game, group), true); }
    assert.equal(f.C.tapLetter(f.game), true);
  }
}
function contact(f, send = false) {
  if (send) { f.c.tap.mode = 'send'; f.c.tap.sendWord = 'HOPE'; f.c.tap.decoded = ''; f.c.tap.pair = { row: 0, col: 0 }; inputWord(f, 'HOPE'); }
  else { f.C.tapPlay(f.game); const word = f.c.tap.playback.word; tick(f, 90); assert.equal(f.c.tap.playback.done, true); inputWord(f, word); }
  assert.equal(f.C.tapValidate(f.game), true);
}
function projects(f) {
  f.C.memoryStart(f.game); tick(f, 8);
  for (const value of f.c.memory.sequence.slice()) assert.equal(f.C.memoryInput(f.game, value), true);
  assert.equal(f.C.exerciseStart(f.game), true);
  for (const side of ['left', 'right', 'left', 'right', 'left', 'right', 'left', 'right']) assert.equal(f.C.exercisePress(f.game, side), true);
  f.C.open(f.game, 'exercise'); f.c.exercise.holding = true; tick(f, 3.1);
  assert.equal(f.c.exercise, null);
}
function earn(f) {
  projects(f); contact(f); contact(f, true);
  assert.equal(f.C.meal(f.game), true); f.C.inspectDoor(f.game);
  assert.equal(f.C.restStart(f.game, 'rest'), true); tick(f, 8.1);
  assert.equal(f.c.sleeping, null); assert.equal(f.C.pacingStatus(f.game).ready, true);
}
function untilPause(f) { for (let i = 0; i < 110 && f.c.routine.active; i++) tick(f, .1); assert.equal(f.c.routine.active, false); return f.C.pacingStatus(f.game).pause; }
function settle(f) {
  const notice = f.C.pacingStatus(f.game).pause;
  if (notice && notice.kind === 'interview') assert.equal(f.C.interviewChoose(f.game, 'pause'), true);
  else if (notice) assert.equal(f.C.pacingDefer(f.game), true);
}
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('a fresh cell explains earned prerequisites and cannot skip days without gameplay', () => {
  const f = fixture(), before = clone(f.s.stats), status = f.C.pacingStatus(f.game);
  assert.equal(status.ready, false); assert.equal(status.projects, 0); assert.equal(status.missing.length, 5);
  assert.equal(f.C.pacingStart(f.game), false); assert.equal(f.s.day, 1); assert.deepEqual(clone(f.s.stats), before);
  assert.match(f.s.objective, /two different activities/); assert.equal(f.c.pacing.unlocked, false);
});
test('two real completed activities, counted contact, food, observation and completed rest earn early compression', () => {
  const f = fixture(); earn(f);
  assert.equal(f.C.pacingStatus(f.game).projects, 2); assert.equal(f.c.tap.received, 1); assert.equal(f.c.tap.sent, 1);
  assert.ok(f.c.pacing.restMinutes >= 120); assert.equal(f.c.observations, 1); assert.equal(f.s.day, 1);
  const before = clone(f.s.stats), elapsed = f.c.elapsedMinutes;
  assert.equal(f.C.pacingStart(f.game), true); assert.equal(f.c.routine.mode, 'earned');
  assert.deepEqual(clone(f.s.stats), before); assert.equal(f.c.elapsedMinutes, elapsed);
  assert.equal(f.c.pacing.unlocked, true); assert.equal(f.c.code.reflections, 0);
});
test('starting and immediately cancelling rest gives no earned recovery credit', () => {
  const f = fixture(); assert.equal(f.C.restStart(f.game, 'sleep'), true); f.C.stopRest(f.game);
  assert.equal(f.c.pacing.restMinutes, 0); assert.ok(f.C.pacingStatus(f.game).missing.some(text => text.includes('two simulated hours')));
});
test('an earned interval stops exactly at morning wall contact without revealing names or completing replies', () => {
  const f = fixture(); earn(f); const receiveCount = f.c.tap.received, sentCount = f.c.tap.sent;
  assert.equal(f.C.pacingStart(f.game), true); const notice = untilPause(f);
  assert.equal(notice.kind, 'message'); assert.equal(f.s.day, 5); assert.equal(f.c.minute, 480);
  assert.equal(f.c.tap.received, receiveCount); assert.equal(f.c.tap.sent, sentCount);
  assert.equal(f.P.Solidarity.state(f.game).known.length, 0); assert.ok(f.c.routine.elapsed < 7);
  assert.equal(f.C.pacingStart(f.game), false, 'unfinished exchange is an explicit opportunity');
  contact(f); assert.equal(f.C.pacingStatus(f.game).pause, null);
  assert.equal(f.C.pacingStart(f.game), true); assert.ok(f.c.routine.elapsed > 0);
});
test('keeping a message for later preserves choice but does not award communication or escape progress', () => {
  const f = fixture(); earn(f); f.C.pacingStart(f.game); untilPause(f);
  const receives = f.c.tap.received, flags = clone(f.s.flags), before = clone(f.s.stats);
  assert.equal(f.C.pacingDefer(f.game), true); assert.equal(f.c.tap.received, receives); assert.equal(f.C.pacingStatus(f.game).pause, null);
  assert.deepEqual(clone(f.s.stats), before); assert.equal(f.s.flags.doorOpen, flags.doorOpen); assert.equal(f.c.vent.route, false);
  assert.equal(f.C.pacingStart(f.game), true);
});
test('manual stopping and resuming retains the unfinished interval rather than resetting its clock', () => {
  const f = fixture(); earn(f); f.C.pacingStart(f.game); tick(f, .5);
  const progressed = f.c.routine.elapsed, skipped = f.c.pacing.totalDays; assert.ok(progressed > 0 && progressed < 1);
  f.C.routineStop(f.game); tick(f, 3); assert.equal(f.c.routine.elapsed, progressed); assert.equal(f.c.pacing.totalDays, skipped);
  assert.equal(f.C.pacingStart(f.game), true); assert.equal(f.c.routine.elapsed, progressed);
  tick(f, .5); assert.ok(f.c.routine.elapsed > progressed); assert.equal(f.c.routine.target, 7);
});
test('an active saved interval restores paused with its remaining days, condition and project state intact', () => {
  const f = fixture(); earn(f); f.C.pacingStart(f.game); tick(f, .5);
  const snap = clone(f.c), next = fixture(); next.s.day = f.s.day; next.s.stats = clone(f.s.stats);
  assert.equal(next.C.restore(next.game, snap), true); assert.equal(next.c.routine.active, false);
  assert.equal(next.c.routine.mode, 'earned'); assert.equal(next.c.routine.elapsed, f.c.routine.elapsed);
  assert.deepEqual(clone(next.c.rewards), clone(f.c.rewards)); assert.equal(next.c.pacing.restMinutes, f.c.pacing.restMinutes);
  assert.equal(next.C.pacingStart(next.game), true); assert.equal(next.c.routine.elapsed, f.c.routine.elapsed);
});
test('recapture/re-entry cannot restart an active skip or discard its earned interval', () => {
  const f = fixture(); earn(f); f.C.pacingStart(f.game); tick(f, .5);
  const elapsed = f.c.routine.elapsed, skipped = f.c.pacing.totalDays, completed = clone(f.c.rewards);
  f.C.enter(f.game); assert.equal(f.c.routine.active, false); assert.equal(f.c.routine.elapsed, elapsed);
  assert.equal(f.c.pacing.totalDays, skipped); assert.deepEqual(clone(f.c.rewards), completed);
  assert.equal(f.C.pacingStart(f.game), true); assert.equal(f.c.routine.elapsed, elapsed);
});
test('pending interviews interrupt acceleration and every compassionate response permits recovery and resumption', () => {
  const f = fixture(10); earn(f); f.C.pacingStart(f.game); const notice = untilPause(f);
  assert.equal(notice.kind, 'interview'); assert.equal(f.s.day, 11); assert.equal(f.c.minute, 480);
  assert.equal(f.C.pacingDefer(f.game), false); assert.equal(f.C.pacingStart(f.game), false);
  const resilience = f.s.stats.resilience; assert.equal(f.C.interviewChoose(f.game, 'pause'), true);
  assert.equal(f.s.stats.resilience, resilience); assert.equal(f.c.pendingEvent, null);
  assert.equal(f.C.pacingStatus(f.game).pause, null); assert.equal(f.C.pacingStart(f.game), true);
  assert.equal(f.s.flags.cowardice, undefined);
});
test('a changed guard duty alters the live schedule flag and demands a fresh real door observation', () => {
  const f = fixture(6); earn(f); f.C.pacingStart(f.game); const notice = untilPause(f);
  assert.equal(notice.kind, 'guard'); assert.equal(f.s.day, 7); assert.equal(f.s.flags.guardCycle, 1);
  const observations = f.c.observations; f.C.pacingReview(f.game);
  assert.equal(f.c.observations, observations, 'viewing guidance is not a corridor observation');
  f.C.inspectDoor(f.game); assert.equal(f.c.observations, observations + 1);
  assert.equal(f.C.pacingStatus(f.game).pause, null); assert.equal(f.C.pacingStart(f.game), true);
});
test('the October calendar opens named communication through a new decoded exchange, not a skipped-time reward', () => {
  const f = fixture(16); earn(f); assert.equal(f.P.Solidarity.available(f.game), false);
  f.C.pacingStart(f.game); const notice = untilPause(f);
  assert.equal(f.s.day, 17); assert.equal(notice.id, 'alcatraz-era'); assert.equal(f.P.Solidarity.available(f.game), true);
  assert.equal(f.P.Solidarity.state(f.game).known.length, 0); assert.equal(f.c.captureYear, 1967);
  contact(f); assert.equal(f.P.Solidarity.state(f.game).known.length, 0);
  contact(f); assert.deepEqual(clone(f.P.Solidarity.state(f.game).known), ['denton']);
});
test('new fastener discovery pauses the routine without granting vent work, a door opening or escape', () => {
  const f = fixture(27); earn(f); f.C.pacingStart(f.game); const notice = untilPause(f);
  assert.equal(f.s.day, 28); assert.equal(notice.kind, 'discovery'); assert.equal(f.c.vent.noticed, true);
  assert.equal(f.c.vent.work, 0); assert.equal(f.c.vent.route, false); assert.equal(f.s.flags.doorOpen, undefined);
  f.C.pacingReview(f.game); assert.equal(f.c.vent.work, 0); assert.equal(f.C.pacingDefer(f.game), true);
  assert.equal(f.c.vent.noticed, true); assert.equal(f.c.vent.work, 0);
});
test('accelerated condition stays bounded and elapsed weeks do not substitute for required projects or prisoner clues', () => {
  const f = fixture(); earn(f); const completed = clone(f.c.rewards), rounds = f.c.memory.round;
  let safety = 0;
  while (f.s.day < 29 && safety++ < 80) {
    settle(f); assert.equal(f.C.pacingStart(f.game), true); untilPause(f);
  }
  assert.ok(f.s.day >= 29); assert.ok(f.c.pacing.totalDays > 20); assert.equal(f.c.memory.round, rounds);
  assert.deepEqual(clone(f.c.rewards), completed, 'routine does not complete fresh activities or transmit messages');
  const transfer = f.P.RegularConfinement.eligibility(f.game);
  assert.equal(transfer.ready, false); assert.equal(transfer.projects, 1);
  assert.ok(transfer.missing.some(text => text.includes('three different')));
  assert.equal(f.P.Solidarity.state(f.game).known.length, 0); assert.equal(f.s.stage, 'solitary');
  assert.ok(Object.values(f.s.stats).every(value => Number.isFinite(value) && value >= 0 && value <= 100));
});
test('old saves gain safe pacing defaults while their elapsed captivity, meals and original monthly API remain compatible', () => {
  const f = fixture(); delete f.c.pacing;
  f.c.rewards = { car: 28, architecture: 28, memory: 28 }; f.s.day = 28;
  assert.equal(f.C.pacingStatus(f.game).ready, false);
  assert.equal(f.c.pacing.totalDays, 0); assert.equal(f.C.routineStart(f.game), true);
  tick(f, 10); assert.equal(f.s.day, 38); assert.equal(f.c.routine.active, true);
  assert.equal(f.c.pacing.unlocked, false); f.C.routineStop(f.game);
});

let failed = 0;
for (const entry of tests) {
  try { entry.run(); process.stdout.write('PASS ' + entry.name + '\n'); }
  catch (error) { failed++; process.stderr.write('FAIL ' + entry.name + '\n' + error.stack + '\n'); }
}
process.stdout.write((tests.length - failed) + '/' + tests.length + ' pure Milestone 2.2 pacing checks passed (no browser/GPU).\n');
process.exitCode = failed ? 1 : 0;
