'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/render/quality-policy.js'), 'utf8');

function fixture(requested = 2) {
  const loader = { hidden: false, style: { display: 'none' } };
  const doc = { hidden: false, visibilityState: 'visible', getElementById: id => id === 'loader' ? loader : null };
  const forbidden = () => { throw new Error('Policy must not schedule work or write preferences'); };
  const context = { document: doc, requestAnimationFrame: forbidden, setTimeout: forbidden,
    setInterval: forbidden, Store: { set: forbidden }, localStorage: { setItem: forbidden } };
  vm.runInNewContext(source, context);
  const calls = { resize: 0, notices: [] };
  let contextLost = false, now = 0;
  const app = { rend: { quality: requested, W: 1280, gl: { isContextLost: () => contextLost } },
    game: { phase: 'flight', paused: false }, screen: 'game', set: Object.freeze({ quality: requested }),
    resize() { calls.resize++; }, radio(...args) { calls.notices.push(args); } };
  const policy = context.QualityPolicy;
  return { app, policy, doc, loader, calls, context,
    tick(ms = 50) { now += ms; return policy.observe(app, now); },
    start() { return policy.observe(app, now); },
    frameCount(n, ms = 50) { let changes = 0; for (let i = 0; i < n; i++) changes += +this.tick(ms); return changes; },
    lost(value) { contextLost = value; } };
}

test('adapts only after warmup and a full completed-frame window; saved quality is immutable', () => {
  const f = fixture();
  assert.equal(f.start(), false);
  assert.equal(f.frameCount(60), 0);
  assert.equal(f.policy.inspect(f.app).warmup, 3000);
  assert.equal(f.policy.inspect(f.app).samples, 0);
  assert.equal(f.frameCount(89), 0);
  assert.equal(f.policy.inspect(f.app).samples, 89);
  assert.equal(f.tick(), true);
  assert.equal(f.app.rend.quality, 1);
  assert.equal(f.app.rend.W, 0);
  assert.equal(f.app.set.quality, 2);
  assert.equal(f.calls.resize, 1);
  assert.equal(f.calls.notices.length, 1);
  assert.match(f.calls.notices[0][1], /session/);
  assert.equal(f.policy.inspect(f.app).average, 50);
  assert.equal(f.policy.inspect(f.app).adaptive, true);
  assert.equal(f.frameCount(1000, 150), 0);
  assert.equal(f.app.rend.quality, 1);
  assert.equal(f.calls.resize, 1);
  assert.equal(f.calls.notices.length, 1);
});

test('playable cadence and isolated shader/OS hitches do not cause fallback', () => {
  const f = fixture();
  f.start(); f.frameCount(188, 16);
  assert.equal(f.policy.inspect(f.app).samples, 0);
  f.frameCount(89, 16); f.tick(200);
  assert.equal(f.app.rend.quality, 2);
  assert.equal(f.policy.inspect(f.app).average, 16);
  f.frameCount(90, 48);
  assert.equal(f.app.rend.quality, 2);
  assert.equal(f.calls.resize, 0);
});

test('isolated resume gaps restart measurement and never consume the automatic fallback', () => {
  const f = fixture();
  f.start(); f.frameCount(60); f.frameCount(89);
  f.tick(10000);
  assert.equal(f.policy.inspect(f.app).samples, 0);
  assert.equal(f.policy.inspect(f.app).warmup, 0);
  assert.equal(f.policy.inspect(f.app).reason, 'resume-gap');
  f.frameCount(100, 16); f.tick(300); f.frameCount(100, 16);
  assert.equal(f.app.rend.quality, 2);
  assert.equal(f.calls.resize, 0);
});

test('sustained very slow foreground rendering adapts instead of resetting forever', () => {
  for (const interval of [251, 500, 5000]) {
    const f = fixture(); f.start();
    f.tick(interval); f.tick(interval);
    assert.equal(f.policy.inspect(f.app).samples, 0);
    assert.equal(f.policy.inspect(f.app).warmup, 0);
    assert.equal(f.policy.inspect(f.app).longFrames, 2);
    assert.equal(f.frameCount(12, interval), 0);
    assert.equal(f.policy.inspect(f.app).warmup, 3000);
    assert.equal(f.frameCount(89, interval), 0);
    assert.equal(f.tick(interval), true);
    assert.equal(f.app.rend.quality, 1);
    assert.equal(f.policy.inspect(f.app).average, 250);
    assert.equal(f.app.set.quality, 2);
    assert.equal(f.frameCount(120, interval), 0);
    assert.equal(f.calls.resize, 1);
  }
});

test('inactive states discard partial samples, warmup and long-frame pressure', () => {
  const cases = [
    f => { f.app.game.paused = true; }, f => { f.app.screen = 'ready'; },
    f => { f.doc.hidden = true; }, f => { f.doc.visibilityState = 'hidden'; },
    f => { f.loader.style.display = 'flex'; }, f => { f.app.graphicsContextLost = true; },
    f => { f.lost(true); }, f => { f.app.game.result = { title: 'Finished' }; },
    f => { f.app.game.phase = 'dead'; }, f => { f.app.game.phase = 'done'; },
    f => { f.app.game.pow = { complete: true }; }, f => { f.app.game = null; }
  ];
  for (const inactive of cases) {
    const f = fixture(); f.start(); f.frameCount(60); f.frameCount(20);
    inactive(f);
    assert.equal(f.policy.allowed(f.app), false);
    assert.equal(f.frameCount(200, 500), 0);
    const s = f.policy.inspect(f.app);
    assert.equal(s.samples, 0); assert.equal(s.warmup, 0); assert.equal(s.longFrames, 0);
    assert.equal(f.app.rend.quality, 2); assert.equal(f.calls.resize, 0);
  }
});

test('resuming after explicit pause needs a new full warmup and sample window', () => {
  const f = fixture(); f.start(); f.frameCount(60); f.frameCount(89);
  f.app.game.paused = true; f.tick(5000);
  f.app.game.paused = false; f.tick(5000);
  assert.equal(f.policy.inspect(f.app).warmup, 0);
  assert.equal(f.frameCount(149), 0);
  assert.equal(f.tick(), true);
});

test('a new mission resets its cadence but preserves this session fallback budget', () => {
  const f = fixture(); f.start(); f.frameCount(150);
  f.app.game = { phase: 'flight' }; f.tick();
  assert.equal(f.policy.inspect(f.app).samples, 0);
  assert.equal(f.frameCount(300, 100), 0);
  assert.equal(f.app.rend.quality, 1);
  assert.equal(f.calls.resize, 1);
});

test('explicit Graphics choice, including the same saved value, starts a fresh session', () => {
  const f = fixture(); f.start(); f.frameCount(150);
  f.app.rend.quality = 2;
  assert.equal(f.policy.userChanged(f.app), true);
  assert.equal(f.policy.inspect(f.app).adaptive, false);
  assert.equal(f.policy.inspect(f.app).changes, 0);
  f.tick(); assert.equal(f.frameCount(150), 1);
  assert.equal(f.app.rend.quality, 1);
  assert.equal(f.app.set.quality, 2);
  assert.equal(f.calls.resize, 2);
  assert.equal(f.calls.notices.length, 2);
});

test('new renderer and requested preference changes reset without retaining stale device state', () => {
  const f = fixture(); f.start(); f.frameCount(150);
  f.app.rend = { quality: 2, W: 1280 };
  f.tick(); assert.equal(f.frameCount(150), 1);
  assert.equal(f.calls.resize, 2);
  f.app.set = Object.freeze({ quality: 0 }); f.app.rend.quality = 0;
  f.tick(); assert.equal(f.frameCount(300), 0);
  assert.equal(f.policy.inspect(f.app).requestedLabel, 'Low');
  assert.equal(f.policy.inspect(f.app).effectiveLabel, 'Low');
  assert.equal(f.policy.inspect(f.app).adaptive, false);
});

test('invalid clocks cannot create artificial pressure or corrupt another app', () => {
  const f = fixture(), other = fixture(); f.start(); other.start();
  f.frameCount(60); f.frameCount(50);
  assert.equal(f.policy.observe(f.app, NaN), false);
  assert.equal(f.policy.inspect(f.app).samples, 50);
  assert.equal(f.policy.observe(f.app, -1), false);
  assert.equal(f.policy.inspect(f.app).samples, 0);
  assert.equal(f.policy.inspect(f.app).warmup, 0);
  assert.equal(f.policy.observe(f.app, -1), false);
  assert.equal(f.policy.inspect(f.app).reason, 'invalid-clock');
  assert.equal(other.policy.inspect(other.app).samples, 0);
  assert.equal(f.calls.resize, 0);
  assert.equal(f.policy.observe(null, 10), false);
  assert.equal(f.policy.inspect(null), null);
});

test('inspection is detached, public API is frozen and reset frees per-app policy state', () => {
  const f = fixture(); f.start(); f.frameCount(60); f.frameCount(10);
  const before = f.policy.inspect(f.app); before.samples = 10000; before.warmup = 10000;
  assert.equal(f.policy.inspect(f.app).samples, 10);
  assert.equal(f.policy.inspect(f.app).warmup, 3000);
  assert.equal(Object.isFrozen(f.policy), true);
  assert.equal(Object.isFrozen(f.policy.limits), true);
  assert.equal(f.policy.reset(f.app), true);
  assert.equal(f.policy.inspect(f.app).reason, 'new');
  assert.equal(f.policy.reset(f.app), false);
  assert.equal(f.policy.userChanged(null), false);
});
