'use strict';
// Real AI/core feedback domain checks. Audio nodes and notifications are
// recording fixtures; this is not a speaker, browser or physical-device test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(options = {}) {
  const window = {}, context = vm.createContext({ window, console, Date });
  for (const module of ['core', 'ai', 'feedback']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pow/' + module + '.js'), 'utf8'), context);
  const P = window.POW, sounds = [], speech = [], preferences = new Map();
  P.notify = () => {}; P.ctx = { Store: { get: (key, otherwise) => preferences.has(key) ? preferences.get(key) : otherwise, set: (key, value) => preferences.set(key, clone(value)) } };
  const game = { t: 0, pow: { stage: 'compound', time: 0, aiClock: 0, base: [0, 0, 0], light: .8, flags: {}, stats: {}, solids: [], surfaces: [], objects: [], noises: [], nav: { minX: -12, maxX: 12, minZ: -12, maxZ: 12, cell: 1 }, intensity: options.intensity || 'standard' }, evade: { p: [0, 0, 0], hdg: 0, look: 0, searchers: [], locals: [] }, app: { set: { sound: options.sound !== false, voices: 2 }, audio: { on: true, ctx: { state: 'running' }, burst: (...args) => sounds.push(args) }, radio: (...args) => speech.push(args) } };
  const actor = P.AI.makeActor({ id: 'watch', p: [0, 0, -4], route: [[0, 0, -4]], face: Math.PI }); game.evade.searchers.push(actor);
  const step = dt => { game.pow.aiClock += dt; game.pow.time += dt; game.t += dt; P.Feedback.step(game, dt); };
  const move = (seconds = 1, dx = .20, dz = 0) => { for (let n = 0; n < Math.round(seconds * 10); n++) { actor.p[0] += dx; actor.p[2] += dz; actor.spd = Math.hypot(dx, dz) * 10; step(.1); } };
  return { P, F: P.Feedback, AI: P.AI, game, actor, sounds, speech, preferences, step, move };
}
test('listener heading gives coarse left/right/ahead/behind and signed pan without exact positions', () => {
  const f = fixture();
  for (const [p, label, pan] of [[[4, 0, 0], 'right', 1], [[-4, 0, 0], 'left', -1], [[0, 0, -4], 'ahead', 0], [[0, 0, 4], 'behind', 0]]) {
    f.actor.p = p; const info = f.F.perceive(f.game, f.actor, 'speech'); assert.equal(info.direction, label); assert.ok(Math.abs(info.pan - pan) < 1e-9);
  }
  f.game.evade.hdg = Math.PI / 2; f.actor.p = [4, 0, 0]; assert.equal(f.F.direction(f.game, f.actor.p), 'ahead');
});
test('solid walls remove visual state cues; nearby muffled speech is audible without enemy positions or brain state', () => {
  const f = fixture(); f.game.pow.solids = [{ id: 'wall', x: 0, z: -2, hw: 4, hl: .06, yMin: 0, yMax: 4 }];
  f.actor.state = 'pursuit'; f.actor.visible = true; f.step(.1);
  assert.equal(f.F.perceive(f.game, f.actor, 'speech').visible, false); assert.equal(f.F.view(f.game).alert, '');
  assert.equal(f.F.say(f.game, f.actor, 'investigate', ['Ai đó?', "Who's there?"]), true);
  const view = f.F.view(f.game); assert.equal(view.danger, false); assert.equal(view.alert, ''); assert.match(view.caption, /muffled.*reconstructed/);
  assert.doesNotMatch(view.caption, /pursuit|coordinates|4\.0|watch/);
});
test('distant, underwater and far elevated actors cannot create audio or awareness captions', () => {
  const f = fixture();
  for (const p of [[100, 0, 0], [0, 30, -2]]) { f.actor.p = p; assert.equal(f.F.say(f.game, f.actor, 'spotted', ['Đứng lại!', 'Stop!']), false); }
  f.actor.p = [0, 0, -2]; f.game.evade.submerged = true; assert.equal(f.F.perceive(f.game, f.actor, 'speech').audible, false); assert.equal(f.F.perceive(f.game, f.actor, 'speech').visible, false);
  assert.equal(f.speech.length, 0); assert.equal(f.F.view(f.game).caption, '');
});
test('only observable state transitions enter feedback history and stale states are not replayed on arrival', () => {
  const f = fixture(); f.step(.1); assert.equal(f.F.history(f.game).length, 0);
  f.actor.state = 'investigate'; f.actor.attention = { reason: 'sound', kind: 'door-fitting' }; f.step(.1);
  assert.match(f.F.view(f.game).alert, /checks a sound/); assert.match(f.F.view(f.game).detail, /remembered sound/); assert.equal(f.F.history(f.game).length, 1);
  for (let i = 0; i < 20; i++) f.step(.1); assert.equal(f.F.history(f.game).length, 1);
  f.actor.p = [100, 0, 100]; f.actor.state = 'pursuit'; f.step(.1); assert.equal(f.F.history(f.game).length, 1);
  f.actor.p = [0, 0, -4]; f.step(.1); assert.equal(f.F.history(f.game).length, 1, 'coming into view does not replay an old transition');
});
test('stationary speed flags and timers cannot produce footsteps; physical distance does', () => {
  const f = fixture(); f.actor.spd = 2; for (let i = 0; i < 100; i++) f.step(.1); assert.equal(f.sounds.length, 0);
  f.move(1); assert.ok(f.sounds.length >= 2); assert.ok(f.sounds.every(args => args[0] === 'thunk' && args[1] > 0 && args[1] < .073));
  assert.match(f.F.view(f.game).caption, /footsteps/i); assert.ok(f.F.history(f.game).some(q => q.type === 'footsteps'));
});
test('distance, occlusion, heading and reduced intensity shape actual footstep burst volume/pan', () => {
  const near = fixture(), far = fixture(), reduced = fixture({ intensity: 'reduced' }), muffled = fixture();
  far.actor.p = [0, 0, -11]; muffled.game.pow.solids = [{ id: 'wall', x: 0, z: -2, hw: 4, hl: .06, yMin: 0, yMax: 4 }];
  for (const f of [near, far, reduced, muffled]) { f.step(.1); f.move(.4); assert.equal(f.sounds.length, 1); }
  assert.ok(far.sounds[0][1] < near.sounds[0][1]); assert.ok(muffled.sounds[0][1] < near.sounds[0][1]); assert.ok(Math.abs(reduced.sounds[0][1] / near.sounds[0][1] - .62) < 1e-9);
  assert.ok(near.sounds[0][2] > 0, 'a person to the right is heard to the right');
});
test('sound-off and suspended audio preserve readable captions without initiating or resuming audio', () => {
  for (const variant of ['off', 'suspended']) {
    const f = fixture({ sound: variant !== 'off' }); if (variant === 'suspended') f.game.app.audio.ctx.state = 'suspended';
    f.step(.1); f.move(1); f.F.say(f.game, f.actor, 'investigate', ['Ai đó?', "Who's there?"]);
    assert.equal(f.sounds.length, 0); assert.equal(f.speech.length, 0); assert.match(f.F.view(f.game).caption, /reconstructed/);
  }
});
test('paused, modal and imagined scenes emit no footsteps, speech or present-day guard state', () => {
  for (const variant of ['paused', 'modal', 'captivity', 'imagined']) {
    const f = fixture(); if (variant === 'paused') f.game.paused = true; if (variant === 'modal') f.game.pow.modalOpen = true;
    if (variant === 'captivity') f.game.pow.captivity = { open: true }; if (variant === 'imagined') f.P.Mindscape = { active: () => true };
    f.move(1); assert.equal(f.F.say(f.game, f.actor, 'spotted', ['Đứng lại!', 'Stop!']), false);
    assert.equal(f.sounds.length, 0); assert.equal(f.speech.length, 0); assert.equal(f.F.view(f.game).alert, '');
  }
});
test('warp/recenter discontinuities and dead or stunned actors remain quiet', () => {
  const f = fixture(); f.step(.1); f.actor.p[0] += 200; f.step(.1); assert.equal(f.sounds.length, 0);
  f.actor.p = [0, 0, -4]; f.step(.1); f.actor.alive = false; f.move(1); assert.equal(f.sounds.length, 0);
  f.actor.alive = true; f.actor.stunUntil = 100; f.move(1); assert.equal(f.sounds.length, 0);
  const r = fixture(); r.step(.1); r.game.pow.base[0] += 100; r.actor.p[0] += 100; r.game.evade.p[0] += 100; r.step(.1); assert.equal(r.sounds.length, 0);
});
test('voice captions are throttled and preserve Vietnamese with a reconstructed dialogue label', () => {
  const f = fixture(); assert.equal(f.F.say(f.game, f.actor, 'investigate', ['Ai đó?', "Who's there?"]), true);
  assert.equal(f.F.say(f.game, f.actor, 'spotted', ['Đứng lại!', 'Stop!']), false); assert.equal(f.speech.length, 1);
  f.step(2); assert.equal(f.F.say(f.game, f.actor, 'spotted', ['Đứng lại!', 'Stop!']), true); assert.equal(f.speech.length, 2);
  assert.match(f.F.view(f.game).caption, /Đứng lại!.*Stop!.*reconstructed/);
});
test('checkpoint restore keeps optional hint preferences without replaying speech, steps or old states', () => {
  const f = fixture(); f.step(.1); f.F.setHints(f.game, false); f.F.say(f.game, f.actor, 'spotted', ['Đứng lại!', 'Stop!']);
  const saved = clone(f.F.snapshot(f.game)); assert.equal(saved.hints, false); assert.equal(f.preferences.get('pow_feedback_preferences').hints, false);
  const restored = fixture(); assert.equal(restored.F.restore(restored.game, saved), true); restored.step(.1);
  assert.equal(restored.F.view(restored.game).caption, ''); assert.equal(restored.F.view(restored.game).detail, ''); assert.equal(restored.game.pow.feedbackHints, false); assert.equal(restored.speech.length, 0);
  assert.equal(restored.F.history(restored.game).length, saved.history.length); assert.equal(restored.F.restore(restored.game, { version: 9 }), false);
});
test('saved attention reasons and physical scan direction survive the real AI snapshot and remain bounded', () => {
  const f = fixture(); f.game.evade.p = [100, 0, 100]; f.actor.dwell = 12; const original = f.actor.face;
  for (let i = 0; i < 20; i++) { f.game.t += .1; f.AI.step(f.game, .1); }
  assert.ok(Math.abs(Math.atan2(Math.sin(f.actor.face - original), Math.cos(f.actor.face - original))) <= .24); assert.notEqual(f.actor.face, original);
  assert.equal(f.actor.motionBlend, 0); assert.equal(f.actor.attention.reason, 'routine');
  f.AI.noise(f.game, [0, 0, -3], 1, 'door-fitting'); f.AI.step(f.game, .1); assert.equal(f.actor.attention.reason, 'sound');
  const saved = clone(f.AI.snapshot(f.game)); assert.equal(f.AI.restore(f.game, saved), true); assert.equal(f.game.evade.searchers[0].attention.kind, 'door-fitting');
});
test('feedback actor tracking, history and frame audio remain bounded', () => {
  const f = fixture();
  f.game.evade.searchers = Array.from({ length: 60 }, (_, i) => f.AI.makeActor({ id: 'g-' + i, p: [i % 2 ? -2 : 2, 0, -3], route: [[0, 0, -3]] }));
  f.step(.1);
  for (let frame = 0; frame < 100; frame++) {
    for (const a of f.game.evade.searchers) { a.p[0] += frame % 2 ? .2 : -.2; a.state = frame % 2 ? 'investigate' : 'patrol'; }
    f.step(.1);
  }
  assert.ok(f.F.history(f.game).length <= 48); assert.ok(f.sounds.length <= 63); assert.ok(f.F.snapshot(f.game).history.length <= 12);
});
test('lawful ordinary yard footsteps preserve guard routines; running, illicit noises and unauthorized walking still matter', () => {
  for (const [legal, kind, loudness, expected] of [[true, 'footsteps', .25, 'patrol'], [true, 'footsteps', .08, 'patrol'], [true, 'footsteps', .85, 'investigate'], [true, 'door-fitting', .25, 'investigate'], [false, 'footsteps', .25, 'investigate']]) {
    const f = fixture(); f.game.pow.stage = 'regular'; f.game.evade.p = [0, 0, -3]; f.P.RegularConfinement = { isSuspicious: () => !legal };
    f.P.los = () => false; f.AI.noise(f.game, f.game.evade.p, loudness, kind); f.AI.step(f.game, .1);
    assert.equal(f.actor.state, expected, legal + ' / ' + kind + ' / ' + loudness);
  }
});
test('a first recognition shout can replace an earlier inquiry without overlapping immediate calls', () => {
  const f = fixture(); f.F.say(f.game, f.actor, 'investigate', ['Ai đó?', "Who's there?"]);
  f.step(.5); assert.equal(f.F.say(f.game, f.actor, 'spotted', ['Đứng lại!', 'Stop!']), false);
  f.step(.5); assert.equal(f.F.say(f.game, f.actor, 'spotted', ['Đứng lại!', 'Stop!']), true);
  assert.match(f.F.view(f.game).caption, /Stop!/); assert.equal(f.speech.length, 2);
});
test('simultaneous footsteps use the strongest nearby source instead of actor roster order', () => {
  const f = fixture(); f.actor.p = [0, 0, -11];
  const near = f.AI.makeActor({ id: 'near', p: [0, 0, -3], route: [[0, 0, -3]] }); f.game.evade.searchers.push(near); f.step(.1);
  for (let i = 0; i < 4; i++) { for (const a of f.game.evade.searchers) { a.p[0] += .2; a.spd = 2; } f.step(.1); }
  assert.equal(f.sounds.length, 1); const info = f.F.perceive(f.game, near, 'steps');
  assert.ok(Math.abs(f.sounds[0][1] - .072 * info.gain) < 1e-9); assert.ok(Math.abs(f.sounds[0][2] - info.pan) < 1e-9);
});
