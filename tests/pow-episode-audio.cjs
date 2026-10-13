'use strict';
// Web Audio graph contract tests; no claim of audible hardware verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../assets/pow/episode-audio.js'), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));

class Param {
  constructor(value = 0) { this.value = value; this.calls = []; }
  record(kind, value, time, smoothing) {
    assert.ok(Number.isFinite(value) && Number.isFinite(time));
    if (smoothing !== undefined) assert.ok(smoothing > 0 && Number.isFinite(smoothing));
    this.value = value; this.calls.push({ kind, value, time, smoothing });
  }
  setValueAtTime(value, time) { this.record('set', value, time); }
  setTargetAtTime(value, time, smoothing) { this.record('target', value, time, smoothing); }
  cancelScheduledValues(time) { assert.ok(Number.isFinite(time)); this.calls.push({ kind: 'cancel', time }); }
  cancelAndHoldAtTime(time) { assert.ok(Number.isFinite(time)); this.calls.push({ kind: 'hold', time }); }
}
class Node {
  constructor(ctx, type) { this.ctx = ctx; this.type = type; this.outputs = new Set(); this.inputs = new Set(); this.disconnections = 0; ctx.nodes.push(this); }
  connect(target) { this.outputs.add(target); target.inputs.add(this); return target; }
  disconnect() { for (const target of this.outputs) target.inputs.delete(this); this.outputs.clear(); this.disconnections++; }
}
class Context {
  constructor() { this.state = 'running'; this.sampleRate = 48000; this.currentTime = 0; this.nodes = []; this.buffers = []; this.sources = []; this.resumes = 0; this.closes = 0; this.filterCalls = 0; this.failFilterAt = Infinity; }
  createGain() { const n = new Node(this, 'gain'); n.gain = new Param(); return n; }
  createBiquadFilter() {
    if (++this.filterCalls === this.failFilterAt) throw new Error('deliberate resource failure');
    const n = new Node(this, 'filter'); n.frequency = new Param(); n.Q = new Param(); return n;
  }
  createBuffer(channels, length, rate) {
    const data = new Float32Array(length), b = { channels, length, sampleRate: rate, getChannelData: () => data, data };
    this.buffers.push(b); return b;
  }
  createBufferSource() {
    const n = new Node(this, 'source'); n.started = false; n.stopped = false; n.stopCalls = 0;
    n.start = (at, offset) => { assert.equal(n.started, false); assert.ok(Number.isFinite(at) && Number.isFinite(offset)); n.started = true; n.offset = offset; };
    n.stop = at => { if (at !== undefined) assert.ok(Number.isFinite(at)); n.stopCalls++; n.stopped = true; };
    this.sources.push(n); return n;
  }
  resume() { this.resumes++; }
  close() { this.closes++; this.state = 'closed'; }
}
function fixture() {
  let constructed = 0, modal = false;
  const document = { hidden: false, querySelector: () => modal ? { open: true } : null };
  const window = { POW: {}, document, AudioContext: function () { constructed++; throw new Error('must use existing context'); } };
  vm.runInContext(source, vm.createContext({ window, Math, console }));
  const context = new Context(), master = context.createGain(), engine = context.createGain();
  master.gain.value = .62; engine.gain.value = .33; engine.connect(master);
  const app = { set: { sound: 1, voices: 1 }, screen: 'game', audio: { ctx: context, master, on: true } };
  const game = { app, phase: 'evade', paused: false, pow: { stage: 'cell', time: 0, intensity: 'standard' }, evade: { camp: true, p: [0, 0, 0] } };
  app.game = game;
  return { A: window.POW.EpisodeAudio, P: window.POW, context, master, engine, app, game, document,
    modal(value) { modal = value; }, constructions: () => constructed };
}
function liveSources(f) { return f.context.sources.filter(s => s.started && !s.stopped); }
function tick(f, dt = .1) { f.game.pow.time += dt; f.context.currentTime += dt; return f.A.step(f.game, dt); }
function assertOriginal(f) { assert.equal(f.master.gain.value, .62); assert.equal(f.engine.gain.value, .33); assert.ok(f.engine.outputs.has(f.master)); assert.equal(f.context.resumes, 0); assert.equal(f.context.closes, 0); assert.equal(f.constructions(), 0); }

test('module loading is inert and silent/missing contexts never construct or resume audio', () => {
  const f = fixture(); assert.equal(f.context.sources.length, 0); assert.equal(f.context.buffers.length, 0);
  for (const game of [undefined, {}, { pow: { stage: 'cell' }, evade: {} }, { ...f.game, app: { set: { sound: 0 }, audio: f.app.audio } }]) assert.doesNotThrow(() => assert.equal(f.A.step(game, .1), false));
  for (const state of ['suspended', 'interrupted', 'closed']) { f.context.state = state; assert.equal(f.A.step(f.game, .1), false); }
  assert.equal(f.context.sources.length, 0); assert.equal(f.context.buffers.length, 0); assertOriginal(f);
});

test('physical ambience owns exactly three finite, quiet, looping sources through the existing master', () => {
  const f = fixture(); assert.equal(tick(f), true);
  assert.equal(liveSources(f).length, 3); assert.equal(f.context.buffers.length, 3);
  const status = f.A.inspect(f.game); assert.equal(status.sourceCount, 3); assert.equal(status.bufferCount, 3);
  assert.ok(Array.from(status.levels).every(v => v >= 0 && v <= .032)); assert.ok(status.bus <= .5);
  for (const source of liveSources(f)) { assert.equal(source.loop, true); assert.ok(f.context.buffers.includes(source.buffer)); }
  for (const buffer of f.context.buffers) {
    assert.equal(buffer.channels, 1); assert.ok(buffer.sampleRate <= 24000); assert.ok(buffer.length <= 24000 * 2.4);
    assert.ok(buffer.data.every(v => Number.isFinite(v) && Math.abs(v) <= .95)); assert.ok(buffer.data.some(v => Math.abs(v) > .01));
  }
  assertOriginal(f);
});

test('hundreds of frames and stage crossfades reuse one bounded graph and its buffers', () => {
  const f = fixture(); tick(f); const nodes = f.context.nodes.length, sources = f.context.sources.slice(), bank = f.context.buffers.slice();
  const room = plain(f.A.inspect(f.game));
  for (const stage of ['compound', 'hanoi', 'river', 'solitary', 'regular', 'cell']) {
    f.game.pow.stage = stage; f.game.pow.river = { rain: .65, currentWorldMps: .9 };
    for (let n = 0; n < 100; n++) tick(f);
    assert.equal(f.context.nodes.length, nodes); assert.equal(f.context.sources.length, 3); assert.equal(f.context.buffers.length, 3);
    assert.equal(f.A.inspect(f.game).stage, stage);
  }
  assert.deepEqual(f.context.sources, sources); assert.deepEqual(f.context.buffers, bank);
  f.game.pow.stage = 'river'; tick(f); assert.notDeepEqual(plain(f.A.inspect(f.game).levels), room.levels);
  for (const node of f.context.nodes.filter(n => n.gain)) assert.ok(node.gain.calls.every(c => c.kind !== 'target' || c.smoothing >= .1));
  assertOriginal(f);
});

test('sound OFF disconnects ambience immediately and ON reuses the cached deterministic buffers', () => {
  const f = fixture(); tick(f); const bank = f.context.buffers.slice(); f.app.set.sound = 0;
  assert.equal(f.A.step(f.game, 0), false); assert.equal(liveSources(f).length, 0); assert.equal(f.A.inspect().active, false);
  assert.equal(f.master.inputs.size, 1); assert.ok(f.master.inputs.has(f.engine));
  f.app.set.sound = 1; tick(f); assert.equal(liveSources(f).length, 3); assert.equal(f.context.buffers.length, 3);
  assert.deepEqual(f.context.buffers, bank); assert.ok(liveSources(f).every(s => bank.includes(s.buffer))); assertOriginal(f);
});

test('pause, modal history, background tabs and open captivity panels stop all owned loops', () => {
  for (const kind of ['pause', 'modal', 'dialog', 'hidden', 'captivity']) {
    const f = fixture(); tick(f);
    if (kind === 'pause') f.game.paused = true;
    if (kind === 'modal') f.game.pow.modalOpen = true;
    if (kind === 'dialog') f.modal(true);
    if (kind === 'hidden') f.document.hidden = true;
    if (kind === 'captivity') f.game.pow.captivity = { open: 'notebook' };
    assert.equal(f.A.step(f.game, 0), false, kind); assert.equal(liveSources(f).length, 0, kind); assertOriginal(f);
  }
});

test('flight, completion, ready room, removed POW state and imagined projects cannot keep ambience running', () => {
  for (const kind of ['flight', 'complete', 'ready', 'removed', 'imagined']) {
    const f = fixture(); tick(f);
    if (kind === 'flight') f.game.phase = 'airborne';
    if (kind === 'complete') f.game.pow.complete = true;
    if (kind === 'ready') f.app.screen = 'ready';
    if (kind === 'removed') f.game.pow = null;
    if (kind === 'imagined') f.P.Mindscape = { active: () => true };
    assert.equal(f.A.step(f.game, .1), false, kind); assert.equal(liveSources(f).length, 0, kind); assertOriginal(f);
  }
});

test('reduced intensity lowers every active layer without modifying speech or flight gain', () => {
  const f = fixture(); f.game.pow.stage = 'river'; f.game.pow.river = { rain: .8, currentWorldMps: 1 };
  f.A.step(f.game, .1); const normal = Array.from(f.A.inspect(f.game).levels);
  f.game.pow.intensity = 'reduced'; f.A.step(f.game, .1); const reduced = f.A.inspect(f.game);
  assert.equal(reduced.reduced, true); reduced.levels.forEach((v, n) => assert.ok(v <= normal[n] * .53)); assertOriginal(f);
});

test('underwater movement muffles only ambience and resurfacing restores the same graph', () => {
  const f = fixture(); f.game.pow.stage = 'river'; f.game.pow.river = { rain: .5, currentWorldMps: .8 };
  tick(f); const above = plain(f.A.inspect(f.game)), sources = f.context.sources.slice();
  f.game.pow.river.submerged = true; tick(f); const under = f.A.inspect(f.game);
  assert.equal(under.underwater, true); assert.ok(under.cutoff < 600 && under.cutoff < above.cutoff / 10);
  assert.ok(under.levels[0] < above.levels[0] / 5 && under.levels[1] < above.levels[1] / 5 && under.levels[2] > 0);
  f.game.pow.river.submerged = false; tick(f); assert.equal(f.A.inspect(f.game).cutoff, above.cutoff);
  assert.deepEqual(f.context.sources, sources); assertOriginal(f);
});

test('a suspended existing context tears down quietly and is never resumed by ambience', () => {
  const f = fixture(); tick(f); f.context.state = 'suspended'; f.A.step(f.game, 0);
  assert.equal(liveSources(f).length, 0); assert.equal(f.context.resumes, 0);
  f.context.state = 'running'; tick(f); assert.equal(liveSources(f).length, 3); assert.equal(f.context.buffers.length, 3); assertOriginal(f);
});

test('context replacement stops and disconnects the old graph and builds only three new sources', () => {
  const f = fixture(); tick(f); const old = f.context, oldNodes = old.nodes.slice(2), next = new Context(), master = next.createGain();
  f.app.audio.ctx = next; f.app.audio.master = master; f.A.step(f.game, .1);
  assert.ok(old.sources.every(s => s.stopped)); assert.ok(oldNodes.every(n => n.outputs.size === 0));
  assert.equal(next.sources.filter(s => !s.stopped).length, 3); assert.equal(next.buffers.length, 3);
  assert.equal(old.resumes, 0); assert.equal(old.closes, 0); assert.equal(next.resumes, 0); assert.equal(next.closes, 0);
});

test('a fresh game shares the live graph, while a stale previous-game frame cannot stop its audio', () => {
  const f = fixture(); tick(f); const previous = f.game;
  const next = { ...previous, pow: { stage: 'hanoi', time: 7, intensity: 'standard' }, evade: { camp: true, p: [3, 0, 4] } };
  f.app.game = next; assert.equal(f.A.step(next, .1), true); assert.equal(f.context.sources.length, 3);
  assert.equal(f.A.inspect(next).stage, 'hanoi'); assert.equal(f.A.step(previous, .1), false);
  assert.equal(f.A.inspect(next).active, true); assert.equal(f.A.stop(previous), false);
  assert.equal(f.A.stop(next), true); assert.equal(liveSources(f).length, 0); assertOriginal(f);
});

test('invalid durations allocate nothing and cannot advance an existing mix; long frame durations are capped', () => {
  const f = fixture();
  for (const dt of [undefined, NaN, Infinity, -Infinity, -1]) assert.equal(f.A.step(f.game, dt), false);
  assert.equal(f.context.sources.length, 0); tick(f); const old = plain(f.A.inspect(f.game));
  for (const dt of [NaN, Infinity, -1]) f.A.step(f.game, dt);
  assert.deepEqual(plain(f.A.inspect(f.game)), old);
  delete f.game.pow.time; f.A.step(f.game, 1000); assert.ok(f.A.inspect(f.game).clock - old.clock <= .100001); assertOriginal(f);
});

test('authored samples and atmospheric mixes are deterministic and do not mutate gameplay or actor cues', () => {
  const a = fixture(), b = fixture();
  for (const f of [a, b]) {
    f.game.pow.stage = 'hanoi'; f.game.pow.time = 7; f.game.pow.river = { rain: .3 }; f.game.evade.searchers = [{ id: 'real-guard', p: [4, 0, 8], state: 'patrol' }];
    const before = JSON.stringify({ pow: f.game.pow, evade: f.game.evade }); f.A.step(f.game, .1);
    assert.equal(JSON.stringify({ pow: f.game.pow, evade: f.game.evade }), before);
  }
  assert.deepEqual(plain(a.A.inspect(a.game)), plain(b.A.inspect(b.game)));
  for (let n = 0; n < 3; n++) assert.deepEqual(Array.from(a.context.buffers[n].data.slice(0, 256)), Array.from(b.context.buffers[n].data.slice(0, 256)));
});

test('partial graph allocation failures clean owned nodes and back off until an explicit rebuild', () => {
  const f = fixture(); f.context.failFilterAt = 3;
  assert.equal(f.A.step(f.game, .1), false); const nodes = f.context.nodes.slice(2), count = f.context.nodes.length;
  assert.ok(f.context.sources.every(s => !s.started || s.stopped)); assert.ok(nodes.every(n => n.outputs.size === 0));
  for (let n = 0; n < 100; n++) assert.equal(f.A.step(f.game, .1), false);
  assert.equal(f.context.nodes.length, count); assert.equal(f.master.inputs.size, 1); assertOriginal(f);
  f.A.dispose(f.game); f.context.failFilterAt = Infinity; assert.equal(f.A.step(f.game, .1), true); assert.equal(liveSources(f).length, 3);
});

test('stop/dispose are idempotent and disconnect only owned resources', () => {
  const f = fixture(); tick(f); const owned = f.context.nodes.slice(2);
  assert.equal(f.A.stop(f.game), true); assert.equal(f.A.stop(f.game), false);
  assert.equal(f.A.dispose(f.game), false); assert.equal(f.A.dispose(f.game), false);
  assert.ok(owned.every(n => n.outputs.size === 0)); assert.ok(f.context.sources.every(s => s.stopped));
  assert.equal(f.master.inputs.size, 1); assertOriginal(f);
});
