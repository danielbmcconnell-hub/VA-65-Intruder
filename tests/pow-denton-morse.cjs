'use strict';
// Pure Morse-domain and recorded-DOM lifecycle fixtures, not browser/GPU tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../assets/pow/denton-flashback.js'), 'utf8');
function fixture() {
  const nodes = [];
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.style = {}; this.listeners = {}; this.value = ''; this.textContent = ''; nodes.push(this); }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'value') this.value = String(value); }
    append(...items) { for (const item of items) { this.children.push(item); item.parentNode = this; } }
    querySelectorAll(selector) {
      const match = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      return this.children.flatMap(child => (match && Object.prototype.hasOwnProperty.call(child.attributes, match[1]) && (match[2] === undefined || child.attributes[match[1]] === match[2]) ? [child] : []).concat(child.querySelectorAll(selector)));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    showModal() { this.open = true; }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.open = false; }
  }
  const listeners = {}, saves = [], cancelled = [], frames = new Map(); let frameId = 0;
  const window = { POW: { save: game => saves.push(JSON.parse(JSON.stringify(game.pow))) },
    addEventListener(name, fn) { listeners[name] = fn; },
    removeEventListener(name, fn) { if (listeners[name] === fn) delete listeners[name]; },
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(id) { cancelled.push(id); frames.delete(id); } };
  const document = { createElement: tag => new Node(tag), body: new Node('body'), pointerLockElement: null };
  vm.runInContext(script, vm.createContext({ window, document }));
  const game = { paused: false, pow: { stage: 'solitary', captivity: {}, intensity: 'standard', touchInteract: true, touchClimb: true, holding: {} },
    app: { keys: { KeyW: 1, KeyF: 1 }, gctl: { pitch: 1, roll: 1, run: 1, crouch: 1 } }, evade: { moving: true, running: true } };
  return { F: window.POW.DentonFlashback, game, document, listeners, saves, cancelled, frames, nodes };
}
const tests = [];
const test = (name, run) => tests.push({ name, run });
test('encodes the documented message as exact international Morse letters', () => {
  const { F } = fixture();
  assert.deepEqual(Array.from(F.encode('TORTURE')), ['-', '---', '.-.', '-', '..-', '.-.', '.']);
  assert.equal(F.message, 'TORTURE');
});
test('all alphabet letters round-trip and invalid marks are rejected', () => {
  const { F } = fixture();
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') assert.equal(F.decode(F.encode(letter)[0]), letter);
  for (const bad of ['', '...', '.....', 'abc', '.', '----', null]) {
    if (bad === '...') assert.equal(F.decode(bad), 'S');
    else if (bad === '.') assert.equal(F.decode(bad), 'E');
    else assert.equal(F.decode(bad), null);
  }
});
test('full message has fifteen separate pulses and exactly fifty-seven timing units', () => {
  const { F } = fixture(), track = F.timeline('TORTURE');
  assert.equal(track.duration, 57); assert.equal(track.letters, 7);
  assert.equal(track.segments.filter(s => s.lit).length, 15);
  assert.equal(track.segments.filter(s => s.kind === 'between-letter').length, 6);
  for (const segment of track.segments) assert.equal(segment.units, segment.lit ? segment.symbol === '.' ? 1 : 3 : segment.kind === 'inside-letter' ? 1 : 3);
});
test('word gaps last seven units without additional letter or trailing gaps', () => {
  const { F } = fixture(), track = F.timeline(' T  E! ');
  assert.equal(track.duration, 11);
  assert.deepEqual(Array.from(track.segments, s => s.units), [3, 7, 1]);
  assert.equal(track.segments[1].kind, 'between-word');
});
test('half-open timing boundaries preserve all individual dot/dash signals', () => {
  const { F } = fixture(), track = F.timeline('R');
  for (const [t, lit] of [[0, true], [.99, true], [1, false], [1.99, false], [2, true], [4.99, true], [5, false], [6, true]]) assert.equal(F.signalAt(track, t).lit, lit, String(t));
  assert.equal(F.signalAt(track, 7).done, true); assert.equal(F.signalAt(track, -1).lit, false); assert.equal(F.signalAt(track, NaN).lit, false);
});
test('letter input requires observation and refuses a correct shortcut before playback', () => {
  const { F } = fixture(), s = F.initial();
  assert.equal(F.mark(s, '-'), true); assert.equal(F.submitLetter(s, 'T'), false); assert.equal(s.decoded, '');
  assert.equal(s.completed, false); assert.match(s.feedback, /First observe/);
});
test('mistakes preserve progress with no condition or moral score', () => {
  const { F } = fixture(), s = F.initial(); s.observed[0] = true;
  F.mark(s, '.'); assert.equal(F.submitLetter(s, 'T'), false); assert.equal(F.submitLetter(s, 'E'), false);
  assert.equal(s.decoded, ''); assert.match(s.feedback, /no penalty/);
  assert.equal(Object.prototype.hasOwnProperty.call(s, 'score'), false); assert.equal(Object.prototype.hasOwnProperty.call(s, 'penalty'), false);
});
test('dot and dash entry is bounded and clearing resets only the pending letter', () => {
  const { F } = fixture(), s = F.initial(); s.decoded = 'TO'; s.observed[2] = true;
  for (const mark of '....') assert.equal(F.mark(s, mark), true);
  assert.equal(F.mark(s, '.'), false); assert.equal(F.mark(s, 'x'), false);
  assert.equal(F.resetEntry(s), true); assert.equal(s.pattern, ''); assert.equal(s.decoded, 'TO'); assert.equal(s.observed[2], true);
});
test('complete decoding requires all seven observed letter patterns and matching chosen letters', () => {
  const { F } = fixture(), s = F.initial();
  for (let n = 0; n < F.message.length; n++) {
    s.observed[n] = true;
    for (const symbol of F.encode(F.message[n])[0]) assert.equal(F.mark(s, symbol), true);
    assert.equal(F.submitLetter(s, F.message[n]), true);
  }
  assert.equal(s.decoded, 'TORTURE'); assert.equal(s.completed, true); assert.equal(F.mark(s, '.'), false);
  assert.equal(F.submitLetter(s, 'E'), false); assert.match(s.feedback, /does not grade/);
});
test('optional lesson pauses the real game and clears all held keyboard and touch controls', () => {
  const f = fixture(), s = f.F.open(f.game);
  assert.equal(s, f.game.pow.captivity.flashback); assert.equal(f.game.paused, true); assert.equal(f.game.pow.modalOpen, true);
  assert.ok(Object.values(f.game.app.keys).every(v => v === 0)); assert.ok(Object.values(f.game.app.gctl).every(v => v === 0));
  assert.equal(f.game.pow.touchInteract, false); assert.equal(f.game.pow.touchClimb, false); assert.equal(f.game.pow.holding, null);
  assert.equal(f.game.evade.moving, false); assert.equal(s.completed, false);
});
test('same visual playback clock marks observation only at the actual final signal boundary', () => {
  const f = fixture(), s = f.F.open(f.game); f.F.play('letter');
  f.F.advance(1.34); assert.equal(s.observed[0], undefined); assert.equal(f.F.status().playing, true);
  f.F.advance(.01); assert.equal(s.observed[0], true); assert.equal(f.F.status().playing, false);
  const board = f.document.body.querySelector('[data-denton-signal]'); assert.equal(board.dataset.on, 'false');
  assert.equal(s.decoded, '');
});
test('authored DOM signal exposes separate measurable pulse lengths and original static photo', () => {
  const f = fixture(); f.F.open(f.game); f.F.play('full');
  const dialog = f.document.body.children[0], board = dialog.querySelector('[data-denton-signal]'), photo = dialog.querySelector('[data-denton-photo]');
  assert.equal(board.dataset.on, 'true'); f.F.advance(1.35); assert.equal(board.dataset.on, 'false');
  f.F.advance(1.35); assert.equal(board.dataset.on, 'true');
  assert.equal(photo.attributes.src, 'assets/history/denton_blinking_torture_color.png');
  assert.match(photo.style.cssText, /filter:none/); assert.equal(photo.attributes.src.includes('.gif'), false);
});
test('reduced setting slows playback without affecting condition and close preserves prior pause state', () => {
  const f = fixture(); f.game.paused = true; f.game.pow.intensity = 'reduced'; f.game.pow.stats = { physical: 42, fatigue: 80, morale: 17 };
  const before = JSON.stringify(f.game.pow.stats); f.F.open(f.game); assert.equal(f.F.status().unit, .75);
  f.F.play('letter'); f.F.advance(2); assert.equal(f.game.pow.captivity.flashback.observed[0], undefined);
  f.F.close(); assert.equal(f.game.paused, true); assert.equal(f.game.pow.modalOpen, undefined); assert.equal(JSON.stringify(f.game.pow.stats), before);
  assert.ok(f.cancelled.length > 0); assert.equal(f.document.body.children.length, 0);
});
test('escape closes only the history lesson, cancels playback and restores unpaused gameplay', () => {
  const f = fixture(); f.F.open(f.game); f.F.play('full'); let stopped = 0, prevented = 0;
  f.listeners.keydown({ type: 'keydown', code: 'Escape', stopImmediatePropagation: () => stopped++, preventDefault: () => prevented++ });
  assert.equal(stopped, 1); assert.equal(prevented, 1); assert.equal(f.game.paused, false); assert.equal(f.F.status(), null);
  assert.equal(Object.keys(f.listeners).length, 0); assert.equal(f.F.advance(1000), false); assert.equal(f.F.close(), false);
});
test('saved partial decoding resumes without persisting live timers or requiring participation', () => {
  const f = fixture(), s = f.F.open(f.game); f.F.play('letter'); f.F.advance(2); f.F.mark(s, '-'); f.F.submitLetter(s, 'T');
  f.F.close(); assert.equal(f.saves.at(-1).captivity.flashback.decoded, 'T');
  const resumed = f.F.open(f.game); assert.equal(resumed.decoded, 'T'); assert.equal(f.F.status().playing, false);
  assert.equal(Object.prototype.hasOwnProperty.call(resumed, 'elapsed'), false); f.F.close();
  const fresh = fixture(); fresh.F.open(null); assert.equal(fresh.F.status().state.completed, false); fresh.F.close();
});
let passed = 0;
for (const test of tests) { try { test.run(); passed++; console.log('PASS ' + test.name); } catch (error) { console.error('FAIL ' + test.name); throw error; } }
console.log(passed + ' Denton Morse-domain and lifecycle fixture checks passed.');
