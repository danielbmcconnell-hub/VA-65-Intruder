'use strict';
// Actual core state/collision with a recording audio fixture. DOM checks below
// use an explicitly lightweight element fixture, not a browser or WebGL claim.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), test = require('node:test');
const clone = value => JSON.parse(JSON.stringify(value));
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.attrs = {}; this.hidden = false; }
  appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
  setAttribute(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return key === 'src' ? this.src || null : this.attrs[key] || null; }
  querySelector(selector) {
    const data = selector.startsWith('[data-') ? selector.slice(6, -1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) : null;
    const match = node => data ? Object.hasOwn(node.dataset, data) : node.tagName === selector;
    for (const node of this.children) { if (match(node)) return node; const result = node.querySelector(selector); if (result) return result; }
    return null;
  }
}
function fixture({ dom = false } = {}) {
  const hud = new Element('section'), window = {}, sounds = [], splashes = [];
  const document = dom ? { createElement: tag => new Element(tag), getElementById: id => id === 'powHUD' ? hud : null } : undefined;
  if (document) window.document = document;
  const context = vm.createContext({ window, document, console, Date });
  for (const module of ['core', 'episode-actions']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pow/' + module + '.js'), 'utf8'), context);
  const P = window.POW; P.ctx = { firstPersonArt: { fists: 'data:image/svg+xml;base64,ORIGINAL_UNCHANGED_FISTS' } }; P.ui = { root: hud }; P.notify = () => {};
  const bolt = { id: 'door-bolt', m: 'powMetal', p: [.59, 1.05, -3.73], scale: [.48, .09, .09] }, door = { id: 'cell-door', x: 0, z: -3.6, hw: .88, hl: .095, yMin: 0, yMax: 2.48, active: true };
  const game = { pow: { stage: 'cell', time: 0, base: [0, 0, 0], inventory: {}, flags: {}, solids: [door], surfaces: [], objects: [], actors: [], input: {}, intensity: 'standard' }, evade: { p: [.35, 0, -2.9], hdg: 0, look: 0, searchers: [], locals: [] }, campGeo: [bolt], app: { set: { sound: true }, audio: { on: true, ctx: { state: 'running' }, burst: (...args) => sounds.push(args), footfall: (...args) => splashes.push(args) } } };
  const A = P.EpisodeActions; A.enter(game);
  const step = dt => { game.pow.time += dt; A.step(game, dt); };
  const hold = (id, seconds, duration = 4.5) => { const s = game.pow; s.focus = { id, hold: duration, p: [.5, 1, -3.46], canHold: () => id !== 'door-fitting' || !!s.inventory.bracket }; s.holding = { id, t: 0 }; for (let n = 0; n < Math.ceil(seconds * 10); n++) { s.holding.t += .1; step(.1); } };
  return { P, A, game, bolt, door, sounds, splashes, step, hold, hud, context };
}
test('real held work selects distinct mat/bracket/rope poses without granting inventory or completing tasks', () => {
  const f = fixture(); f.hold('bunk-bracket', .4, 1.5); assert.equal(f.A.view(f.game).pose, 'rummage'); assert.equal(f.A.view(f.game).tool, 'cloth');
  assert.equal(f.game.pow.inventory.bracket, undefined); f.game.pow.holding.t = 1.1; f.step(.1); assert.equal(f.A.view(f.game).tool, 'bracket');
  f.game.pow.inventory.bracket = true; f.hold('door-fitting', 1); assert.equal(f.A.view(f.game).pose, 'loosen'); assert.ok(f.A.view(f.game).progress > .20);
  f.hold('roof-rope', .3, .75); assert.equal(f.A.view(f.game).pose, 'gather-rope'); assert.equal(f.game.pow.inventory.rope, undefined);
  f.hold('roof-descent', .4, 1.4); assert.equal(f.A.view(f.game).pose, 'tie-rope'); assert.equal(f.game.pow.flags.outside, undefined);
});
test('partial bolt retraction is visible while independent actual door collision remains closed', () => {
  const f = fixture(), solids = clone(f.game.pow.solids), origin = f.bolt.p.slice(); f.game.pow.inventory.bracket = true;
  f.hold('door-fitting', 2, 4.5); assert.ok(f.bolt.p[0] < origin[0] - .08 && f.bolt.p[0] > origin[0] - .36);
  assert.deepEqual(clone(f.game.pow.solids), solids); assert.equal(f.game.pow.flags.doorOpen, undefined);
  f.P.move(f.game, f.game.evade, 0, -8, .32); assert.ok(f.game.evade.p[2] > -3.3, 'actual swept collision still stops the player');
});
test('cancellation releases the working pose, returns the visual bolt and stops interaction sound cadence', () => {
  const f = fixture(); f.game.pow.inventory.bracket = true; f.hold('door-fitting', 1.5); const count = f.sounds.length;
  f.game.pow.holding = null; for (let i = 0; i < 20; i++) f.step(.1);
  assert.equal(f.A.view(f.game).active, false); assert.equal(f.sounds.length, count); assert.ok(Math.abs(f.bolt.p[0] - .59) < .001);
});
test('a missing actual bracket cannot produce lock-work hands, sound or bolt progress', () => {
  const f = fixture(); f.hold('door-fitting', 2); assert.equal(f.A.view(f.game).active, false); assert.equal(f.sounds.length, 0); assert.equal(f.bolt.p[0], .59);
});
test('inventory and actual door-completion transitions produce one short retrieval/latch pose each', () => {
  const f = fixture(); f.game.pow.inventory.bracket = true; f.step(.1); assert.equal(f.A.view(f.game).pose, 'take-bracket');
  for (let i = 0; i < 10; i++) f.step(.1); assert.equal(f.A.view(f.game).active, false);
  f.game.pow.inventory.rope = true; f.step(.1); assert.equal(f.A.view(f.game).pose, 'gather-rope');
  f.game.pow.flags.doorOpen = true; f.game.campGeo = []; f.step(.1); assert.equal(f.A.view(f.game).pose, 'latch'); const count = f.sounds.length;
  for (let i = 0; i < 10; i++) f.step(.1); assert.equal(f.sounds.length, count); assert.equal(f.A.view(f.game).active, false);
});
test('real traversal drives alternating rope grip and landing without changing physical destinations or time', () => {
  const f = fixture(); const traversal = f.game.pow.traversal = { kind: 'descent', t: 1, duration: 4, from: [25, 3.4, -24], to: [29.1, 0, -24] }, original = clone(traversal);
  f.step(.1); assert.equal(f.A.view(f.game).pose, 'descent'); assert.equal(f.A.view(f.game).progress, .25); assert.deepEqual(clone(traversal), original);
  traversal.kind = 'climb'; f.step(.1); assert.equal(f.A.view(f.game).pose, 'climb');
  f.game.pow.traversal = null; f.game.pow.stage = 'hanoi'; f.step(.1); assert.equal(f.A.view(f.game).pose, 'landing');
});
test('actual river entry creates a single splash; floating does not pretend the player actively swims', () => {
  const f = fixture(); f.game.pow.stage = 'river'; f.game.pow.river = { mode: 'float' }; f.step(.1);
  assert.equal(f.A.view(f.game).pose, 'water-entry'); assert.equal(f.splashes.length, 1);
  for (let i = 0; i < 12; i++) f.step(.1); assert.equal(f.A.view(f.game).active, false); assert.equal(f.splashes.length, 1);
  f.game.pow.river.mode = 'swim'; f.game.pow.input.forward = 1; f.step(.1); assert.equal(f.A.view(f.game).pose, 'swim');
  f.game.pow.input.forward = 0; f.step(.1); assert.equal(f.A.view(f.game).active, false);
});
test('throw presentation follows a real external event and its impact sound remains spatial and separately timed', () => {
  const f = fixture(); assert.equal(f.A.event(f.game, 'throw'), true); assert.equal(f.A.view(f.game).pose, 'throw'); assert.equal(f.sounds.length, 0);
  f.step(.3); assert.equal(f.A.event(f.game, 'pebble-impact', [8, 0, -3]), true); assert.equal(f.sounds.length, 1); assert.ok(f.sounds[0][2] > 0);
  assert.equal(f.A.event(f.game, 'pebble-impact', [8, 0, -3]), false, 'same-frame impact audio is bounded');
  assert.equal(f.A.snapshot(f.game).throws, 1); assert.equal(f.game.pow.noises, undefined, 'presentation does not replace the real gameplay noise event');
});
test('sound-off, suspended audio, modal, pause, solitary, regular and imagined scenes remain isolated', () => {
  for (const reason of ['off', 'suspended', 'modal', 'paused', 'solitary', 'regular', 'imagined']) {
    const f = fixture(); f.game.pow.inventory.bracket = true;
    if (reason === 'off') f.game.app.set.sound = false; if (reason === 'suspended') f.game.app.audio.ctx.state = 'suspended';
    if (reason === 'modal') f.game.pow.modalOpen = true; if (reason === 'paused') f.game.paused = true;
    if (reason === 'solitary') f.game.pow.stage = 'solitary'; if (reason === 'regular') { f.game.pow.stage = 'regular'; f.game.pow.regular = {}; }
    if (reason === 'imagined') f.P.Mindscape = { active: () => true };
    f.hold('door-fitting', 2); assert.equal(f.sounds.length, 0); assert.equal(f.splashes.length, 0);
    if (!['off', 'suspended'].includes(reason)) { assert.equal(f.A.view(f.game).active, false); assert.equal(f.bolt.p[0], .59); assert.equal(f.A.event(f.game, 'throw'), false); }
  }
});
test('reduced intensity keeps progress readable while lowering work sound and avoiding a loud splash', () => {
  const full = fixture(), reduced = fixture(); full.game.pow.inventory.bracket = true; reduced.game.pow.inventory.bracket = true; reduced.game.pow.intensity = 'reduced';
  full.hold('door-fitting', .6); reduced.hold('door-fitting', .6); assert.equal(full.sounds.length, 1); assert.equal(reduced.sounds.length, 1);
  assert.ok(Math.abs(reduced.sounds[0][1] / full.sounds[0][1] - .6) < 1e-9); assert.equal(reduced.A.view(reduced.game).progress, full.A.view(full.game).progress);
  reduced.game.pow.holding = null; reduced.step(.2); reduced.A.event(reduced.game, 'water-entry'); assert.equal(reduced.splashes.length, 0);
});
test('checkpoint restore records counters without replaying completed acquisition, entry or transient hand poses', () => {
  const f = fixture(); f.A.event(f.game, 'throw'); const saved = clone(f.A.snapshot(f.game));
  f.game.pow.inventory.bracket = true; f.game.pow.inventory.rope = true; f.game.pow.flags.doorOpen = true; f.game.pow.stage = 'river'; f.game.pow.river = { mode: 'float' };
  f.A.restore(f.game, saved); f.step(.1); assert.equal(f.A.view(f.game).active, false); assert.equal(f.splashes.length, 0); assert.equal(f.A.snapshot(f.game).throws, 1); assert.equal(f.A.restore(f.game, { version: 8 }), false);
});
test('scene replacement and restored bolt geometry use the new mesh without corrupting old references or solid state', () => {
  const f = fixture(); f.game.pow.inventory.bracket = true; f.hold('door-fitting', 1);
  const old = f.bolt.p.slice(), replacement = { id: 'door-bolt', p: [20.59, 6.05, -20] }; f.game.campGeo = [replacement]; f.step(.1);
  assert.deepEqual(Array.from(f.bolt.p), Array.from(old)); assert.ok(replacement.p[0] < 20.59); assert.equal(f.door.active, true);
});
test('illustrated tools are bounded original SVGs; unchanged hands render distinct transforms in a DOM fixture', () => {
  const f = fixture({ dom: true }); f.game.pow.inventory.bracket = true; f.hold('door-fitting', .4);
  const overlay = f.hud.children[0], canvas = overlay.querySelector('[data-episode-action]'); assert.equal(overlay.hidden, false); assert.equal(canvas.dataset.pose, 'loosen');
  for (const side of ['left', 'right']) assert.equal(overlay.querySelector('[data-action-' + side + ']').querySelector('img').src, f.P.ctx.firstPersonArt.fists);
  const before = overlay.querySelector('[data-action-right]').style.transform; f.game.pow.holding.t += .1; f.step(.1); assert.notEqual(overlay.querySelector('[data-action-right]').style.transform, before);
  assert.equal(overlay.getAttribute('aria-hidden'), 'true'); assert.ok(overlay.querySelector('[data-action-tool]').src.includes('image/svg+xml'));
  assert.equal(Object.keys(f.A.art).length, 4); assert.ok(Object.values(f.A.art).every(source => source.length < 6500 && !decodeURIComponent(source).includes('<image')));
  f.game.pow.holding = null; f.step(.1); assert.equal(overlay.hidden, true);
});
test('long work remains cadence-bounded and creates no task flags, independent timer loop or history growth', () => {
  const f = fixture(); f.game.pow.inventory.bracket = true; f.hold('door-fitting', 20, 25);
  assert.ok(f.sounds.length > 15 && f.sounds.length < 34); assert.equal(f.game.pow.flags.doorOpen, undefined); assert.equal(f.A.snapshot(f.game).entries, 0);
  const source = fs.readFileSync(path.join(__dirname, '../assets/pow/episode-actions.js'), 'utf8'); assert.doesNotMatch(source, /requestAnimationFrame|setInterval|setTimeout|\.resume\(/);
});
test('real intervening walls muffle remote impact sounds while overlapping work blocks another throw pose', () => {
  const wall = fixture(), clear = fixture(); clear.game.pow.solids = [];
  wall.A.event(wall.game, 'pebble-impact', [0, 0, -7]); clear.A.event(clear.game, 'pebble-impact', [0, 0, -7]);
  assert.ok(wall.sounds[0][1] < clear.sounds[0][1]);
  wall.game.pow.inventory.bracket = true; wall.hold('door-fitting', .5); assert.equal(wall.A.busy(wall.game), true);
  wall.game.pow.holding = null; wall.step(.1); assert.equal(wall.A.busy(wall.game), false);
});
