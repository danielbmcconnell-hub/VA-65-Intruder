'use strict';
// These are real domain-module checks without DOM/GPU; the browser regression
// separately counts real incoming pulses and enters row/column taps in the UI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const window = {}, context = vm.createContext({ window }), notices = [], saves = [];
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pow/captivity.js'), 'utf8'), context);
  const P = window.POW;
  P.notify = (_, text) => notices.push(text);
  P.save = game => { const saved = clone(game.pow.captivity); saves.push(saved); return saved; };
  const game = { pow: { stage: 'solitary', day: 1, difficulty: 'normal', intensity: 'standard', flags: {}, inventory: {}, stats: { physical: 60, fatigue: 25, resilience: 60, morale: 60, memory: 60, hope: 60 }, base: [0, 0, 0] }, mis: { escape: true }, app: { keys: {} }, evade: { p: [0, 0, 0] } };
  P.Captivity.state(game); game.pow.day = 28;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pow/solidarity.js'), 'utf8'), context);
  const S = P.Solidarity, n = S.state(game);
  return { game, P, S, n, c: game.pow.captivity, notices, saves };
}
function receive(f, count = 1) { for (let i = 0; i < count; i++) assert.equal(f.S.received(f.game, f.S.message(f.game).word), true); }
function ready(f) { receive(f, 8); f.S.sent(f.game, 'HOPE'); f.S.decide(f.game, 'rumor', 'observe'); f.S.afterActivity(f.game, 'car'); }
function answerAnchor(f) {
  for (let i = 0; i < 9; i++) f.S.step(f.game, 1);
  assert.equal(f.n.anchor.phase, 'answer');
  for (const index of f.n.anchor.targets.slice()) assert.equal(f.S.anchorChoose(f.game, index), true);
}
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('initial state is independent, JSON-savable and initializes without circular Captivity.state calls', () => {
  const f = fixture(), a = f.S.initial(), b = f.S.initial(); a.known.push('denton'); assert.equal(b.known.length, 0);
  f.P.Captivity.state = () => { throw new Error('circular initialization'); };
  assert.equal(f.S.state(f.game), f.n); assert.deepEqual(clone(f.n), clone(f.S.initial()));
});
test('historical names are gated until late October 1967, with anonymous earlier encouragement', () => {
  const f = fixture(); f.game.pow.day = 1;
  assert.equal(f.S.available(f.game), false); receive(f, 5);
  assert.equal(f.n.cursor, 0); assert.equal(f.n.anonymousReceived, 5); assert.equal(f.n.known.length, 0);
  f.game.pow.day = 16; assert.equal(f.S.available(f.game), false);
  f.game.pow.day = 17; assert.equal(f.S.available(f.game), true);
  receive(f, 2); assert.deepEqual(clone(f.n.known), ['denton']);
});
test('earlier flight capture dates do not imply named Alcatraz neighbors; era has an end', () => {
  const f = fixture(); f.c.captureYear = 1966; f.game.pow.day = 365;
  assert.equal(f.S.available(f.game), false); f.game.pow.day = 382; assert.equal(f.S.available(f.game), true);
  f.c.captureYear = 1970; f.game.pow.day = 28; assert.equal(f.S.available(f.game), false);
  f.c.captureYear = 1969; f.game.pow.day = 367; assert.equal(f.S.available(f.game), false);
});
test('replay is stable, incorrect spelling cannot advance or disclose any identity', () => {
  const f = fixture(), incoming = clone(f.S.message(f.game));
  assert.deepEqual(clone(f.S.message(f.game)), incoming);
  assert.equal(f.S.received(f.game, 'DENTON'), false); assert.equal(f.n.cursor, 0); assert.equal(f.n.known.length, 0);
  receive(f); assert.equal(f.S.message(f.game).word, 'DENTON');
  assert.equal(f.S.received(f.game, 'HOPE'), false); assert.equal(f.n.cursor, 1);
});
test('Denton and Stockdale are learned by separate messages and C/K normalization is preserved', () => {
  const f = fixture(); receive(f, 2); assert.deepEqual(clone(f.n.known), ['denton']);
  assert.equal(f.n.objectives.leadership, undefined); receive(f, 2);
  assert.deepEqual(clone(f.n.known), ['denton', 'stockdale']); assert.equal(f.n.objectives.leadership, true);
  assert.equal(f.S.normalize('Stockdale'), 'STOCCDALE'); assert.equal(f.S.normalize('KEEP TOGETHER'), 'CEEPTOGETHER');
});
test('the isolated Eleven roster includes Air Force Captain McKnight, not fabricated adjacency', () => {
  const f = fixture(); receive(f, f.S.data.course.length);
  assert.equal(f.n.known.length, 11); assert.equal(f.n.objectives.eleven, true);
  const records = clone(f.S.data.records);
  assert.equal(records.filter(person => person.service === 'U.S. Air Force').length, 3);
  assert.match(records.find(person => person.id === 'mcknight').note, /Air Force captain/);
  assert.ok(records.every(person => person.cell === undefined && person.neighbor === undefined));
  assert.ok(f.n.decoded.every(entry => /Reconstructed/.test(entry.text)));
});
test('progressive phrases remain countable through the real tap matrix including C/K', () => {
  const f = fixture(); receive(f, 17);
  assert.equal(f.S.message(f.game).word, 'KEEP TOGETHER');
  const message = f.S.message(f.game), matrix = f.P.TapCode;
  assert.equal(matrix.normalize(matrix.decode(matrix.encode(message.word))), matrix.normalize(message.word));
  assert.equal(f.S.received(f.game, 'CEEPTOGETHER'), true);
});
test('a concrete guard routine clue requires its own decoded message and never opens a physical route', () => {
  const f = fixture(); receive(f, 7); assert.equal(f.S.escapeClue(f.game), null); assert.equal(f.game.pow.flags.networkGuardClue, undefined);
  const flags = clone(f.game.pow.flags); receive(f);
  assert.match(f.S.escapeClue(f.game), /far-door stop and turn/); assert.equal(f.game.pow.flags.networkGuardClue, true);
  assert.equal(f.game.pow.flags.doorOpen, flags.doorOpen); assert.equal(f.c.vent.route, false);
  assert.equal(f.n.objectives.practice, undefined);
});
test('readiness depends on actual contact, reply, thought, practice and clue rather than reading a card', () => {
  const f = fixture(); receive(f, 8); assert.equal(f.S.ready(f.game), false);
  f.S.sent(f.game, 'HOPE'); f.S.decide(f.game, 'rumor', 'observe'); assert.equal(f.S.ready(f.game), false);
  f.S.afterActivity(f.game, 'car'); assert.equal(f.S.ready(f.game), true);
});
test('fictional decisions require relevant contact/clues and accept rest without a failure score', () => {
  const f = fixture(); assert.equal(f.S.decide(f.game, 'reconnect', 'rest'), false);
  receive(f); assert.equal(f.S.decide(f.game, 'rumor', 'observe'), false);
  assert.equal(f.S.decide(f.game, 'reconnect', 'rest'), true);
  assert.equal(f.n.decisions.reconnect.principle, 'recover'); assert.equal(f.n.objectives.thoughtfulResponse, true);
  assert.equal(f.game.pow.flags.failure, undefined); assert.equal(f.n.courage, undefined);
  const condition = f.game.pow.stats.physical; assert.equal(f.S.decide(f.game, 'reconnect', 'nonsense'), false);
  assert.equal(f.game.pow.stats.physical, condition);
});
test('every interview response preserves the same recovery and mutual-support pathway', () => {
  for (const choice of ['identity', 'pause', 'cope']) {
    const f = fixture(), before = clone(f.game.pow.stats); f.S.afterInterview(f.game, choice);
    assert.equal(f.n.objectives.recovery, true); assert.equal(f.n.interviewCount, 1);
    assert.deepEqual(clone(f.game.pow.stats), before); assert.equal(f.n.lastInterview.choice, choice);
  }
});
test('repeated leadership decisions on one day cannot farm condition', () => {
  const f = fixture(); receive(f); f.S.decide(f.game, 'reconnect', 'report'); const before = clone(f.game.pow.stats);
  f.S.decide(f.game, 'reconnect', 'rest'); f.S.decide(f.game, 'reconnect', 'anchor');
  assert.deepEqual(clone(f.game.pow.stats), before); assert.equal(f.n.decisions.reconnect.choice, 'anchor');
});
test('BACK US learning is gated, US is combined, and wrong pairing carries no prisoner penalty', () => {
  const f = fixture(); assert.equal(f.S.backusSelect(f.game, 'B'), false); receive(f, 4);
  assert.deepEqual(clone(f.S.data.backus).map(pair => pair.symbol), ['B', 'A', 'C', 'K', 'US']);
  assert.equal(f.S.backusSelect(f.game, 'S'), false); assert.equal(f.S.backusSelect(f.game, 'B'), true);
  const before = clone(f.game.pow.stats); assert.equal(f.S.backusMatch(f.game, 'air'), false);
  assert.deepEqual(clone(f.game.pow.stats), before); assert.equal(f.n.backus.matches.length, 0);
});
test('BACK US meaningful matching completes only after all five reference pairings', () => {
  const f = fixture(); receive(f, 4);
  for (const pair of f.S.data.backus) { assert.equal(f.S.backusSelect(f.game, pair.symbol), true); assert.equal(f.S.backusMatch(f.game, pair.id), true); }
  assert.equal(f.n.objectives.backus, true); assert.equal(f.n.backus.matches.length, 5); assert.equal(f.game.pow.stats.memory, 61);
  f.S.backusSelect(f.game, 'US'); f.S.backusMatch(f.game, 'unity'); assert.equal(f.game.pow.stats.memory, 61);
});
test('optional anchors require watching and recalling actual sequences, not an instant benefit button', () => {
  const f = fixture(), before = clone(f.game.pow.stats);
  f.S.startAnchor(f.game, 'family'); assert.equal(f.S.anchorChoose(f.game, 0), false); assert.deepEqual(clone(f.game.pow.stats), before);
  answerAnchor(f); assert.equal(f.n.anchors.family, 1); assert.equal(f.n.anchor, null); assert.equal(f.game.pow.stats.hope, 62);
});
test('wrong family recall leaves condition and completed projects unchanged and permits recovery', () => {
  const f = fixture(); f.S.startAnchor(f.game, 'family'); for (let i = 0; i < 8; i++) f.S.step(f.game, 1);
  const before = clone(f.game.pow.stats); assert.equal(f.S.anchorChoose(f.game, 2), false);
  assert.deepEqual(clone(f.game.pow.stats), before); assert.equal(f.n.anchors.family, undefined);
  for (const i of f.n.anchor.targets.slice()) f.S.anchorChoose(f.game, i); assert.equal(f.n.anchors.family, 1);
});
test('Scout Law uses the traditional twelve ordered traits, grows progressively, and hard mode adds recall', () => {
  const normal = fixture(), hard = fixture(); hard.game.pow.difficulty = 'hard';
  normal.S.startAnchor(normal.game, 'scout'); hard.S.startAnchor(hard.game, 'scout');
  assert.equal(normal.n.anchor.targets.length, 4); assert.equal(hard.n.anchor.targets.length, 5);
  assert.deepEqual(clone(normal.S.data.scout), ['Trustworthy', 'Loyal', 'Helpful', 'Friendly', 'Courteous', 'Kind', 'Obedient', 'Cheerful', 'Thrifty', 'Brave', 'Clean', 'Reverent']);
  answerAnchor(normal); normal.S.startAnchor(normal.game, 'scout'); assert.equal(normal.n.anchor.targets.length, 5);
});
test('traditional Scout Oath requires the four clauses in order and remains optional for progression', () => {
  const f = fixture(); assert.equal(f.S.startAnchor(f.game, 'oath'), true);
  assert.equal(f.n.anchor.targets.length, 4); assert.equal(f.S.data.oath[0], 'On my honor I will do my best');
  for (let i = 0; i < 8; i++) f.S.step(f.game, 1);
  const before = clone(f.game.pow.stats); assert.equal(f.S.anchorChoose(f.game, 1), false); assert.deepEqual(clone(f.game.pow.stats), before);
  for (const i of f.n.anchor.targets.slice()) assert.equal(f.S.anchorChoose(f.game, i), true);
  assert.equal(f.n.anchors.oath, 1); assert.equal(f.game.pow.stats.memory, 62);
  const secular = fixture(); ready(secular); assert.equal(secular.S.ready(secular.game), true); assert.equal(secular.n.anchors.oath, undefined);
});
test('reduced intensity gives longer observation without lowering accuracy requirements', () => {
  const normal = fixture(), reduced = fixture(); reduced.game.pow.intensity = 'reduced';
  normal.S.startAnchor(normal.game, 'reflection'); reduced.S.startAnchor(reduced.game, 'reflection');
  assert.ok(reduced.n.anchor.remaining > normal.n.anchor.remaining);
  assert.deepEqual(clone(reduced.n.anchor.targets), clone(normal.n.anchor.targets));
  assert.equal(reduced.S.anchorChoose(reduced.game, 0), false);
});
test('rest and high fatigue do not block optional support or create a worth/courage metric', () => {
  const f = fixture(); f.game.pow.stats.fatigue = 100; receive(f); f.S.sent(f.game, 'REST');
  assert.equal(f.S.decide(f.game, 'reconnect', 'rest'), true); f.S.startAnchor(f.game, 'reflection'); answerAnchor(f);
  assert.equal(f.game.pow.stats.fatigue, 100); assert.equal(f.n.failure, undefined); assert.equal(f.n.worth, undefined);
});
test('saved identities, ongoing recall, guidance and guard clue survive JSON restore', () => {
  const f = fixture(); ready(f); f.S.startAnchor(f.game, 'scout'); f.S.step(f.game, 1);
  const snapshot = clone(f.c), restored = fixture(); restored.game.pow.captivity = snapshot;
  const next = restored.S.state(restored.game); assert.deepEqual(clone(next), clone(f.n));
  assert.equal(restored.S.ready(restored.game), true); assert.equal(restored.S.message(restored.game).word, f.S.message(f.game).word);
  assert.equal(next.anchor.phase, 'show'); assert.equal(next.anchor.remaining, 6);
});
test('older saves gain additive defaults without erasing existing flight/captivity records', () => {
  const f = fixture(); delete f.c.solidarity;
  f.c.car.installed = ['block']; const older = clone(f.c); f.S.state(f.game);
  assert.deepEqual(clone(f.c.car.installed), ['block']); assert.equal(f.c.captureYear, older.captureYear);
  f.c.solidarity = { cursor: -40, known: ['denton', 'fabricated'], decoded: null, decisions: { fake: {} }, backus: { matches: ['fake'] } };
  const n = f.S.state(f.game); assert.equal(n.cursor, 0); assert.deepEqual(clone(n.known), ['denton']); assert.deepEqual(clone(n.decisions), {}); assert.deepEqual(clone(n.backus.matches), []);
});
test('all reconstructed message journals and sent history stay bounded during prolonged captivity', () => {
  const f = fixture(); receive(f, 130);
  for (let i = 0; i < 70; i++) f.S.sent(f.game, 'HOPE');
  assert.equal(f.n.decoded.length, 80); assert.equal(f.n.sent.length, 40); assert.equal(f.n.known.length, 11);
  assert.equal(f.n.cursor, 130); assert.equal(f.S.message(f.game).kind, 'support');
});

let failed = 0;
for (const entry of tests) {
  try { entry.run(); process.stdout.write('PASS ' + entry.name + '\n'); }
  catch (error) { failed++; process.stderr.write('FAIL ' + entry.name + '\n' + error.stack + '\n'); }
}
process.stdout.write((tests.length - failed) + '/' + tests.length + ' pure POW solidarity checks passed (no browser/GPU).\n');
process.exitCode = failed ? 1 : 0;
