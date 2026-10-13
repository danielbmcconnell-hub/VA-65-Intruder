'use strict';
// Scene-domain checks with the actual POW geometry and slab-tested sight lines.
// These do not substitute for the separate browser/WebGL screenshots or devices.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const clone = value => JSON.parse(JSON.stringify(value));
const prefix = 'episode-scene:';
const knownLamps = ['cell-bulb', 'corridor-lamp', 'yard-west', 'yard-east', 'street-lamp-west', 'street-lamp-east', 'ferry-lantern', 'bank-lantern'];

function fixture(stage = 'cell') {
  const document = { body: { classList: { toggle() {} } }, getElementById() { return null; }, activeElement: null };
  const window = { document }, sandbox = vm.createContext({ window, document, console, Date });
  for (const name of ['core', 'episode-scene']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/pow/' + name + '.js'), 'utf8'), sandbox);
  const P = window.POW, store = new Map();
  P.mountUI = () => {}; P.updateUI = () => {}; P.activate = () => {};
  P.ctx = { terrainH: () => 4, Store: { get: (key, otherwise) => store.has(key) ? store.get(key) : otherwise, set: (key, value) => store.set(key, clone(value)) } };
  const game = { ac: { p: [120, 5, 280] }, app: { keys: {}, gctl: {}, set: { sound: 0, quality: 2 } }, world: { _cells: new Map() }, setHour(hour) { this.hour = hour; } };
  P.begin(game, 'cell'); game.pow.stage = stage;
  if (stage === 'river') game.pow.river = { waterY: game.pow.base[1] - .35, hour: 23, current: .75, phase: 'river', sectionId: 'ferry', logicalDistance: 8200, weather: 'rain' };
  return { P, S: P.Scene, game, sandbox, store };
}
function additions(game) { return game.campGeo.filter(q => q.id.startsWith(prefix)); }
function allOff(f) { for (const id of knownLamps) f.S.setLamp(f.game, id, false); }
function assertFiniteTree(value, label) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), label + ' finite');
  else if (Array.isArray(value)) value.forEach((q, i) => assertFiniteTree(q, label + '[' + i + ']'));
  else if (value && typeof value === 'object') for (const [key, q] of Object.entries(value)) assertFiniteTree(q, label + '.' + key);
}
function validateRender(render) {
  assert.ok(render && typeof render === 'object'); assertFiniteTree(render, 'render');
  for (const key of ['ambient', 'rim', 'fogColor']) { assert.equal(render[key].length, 3, key + ' RGB'); assert.ok(Array.from(render[key]).every(q => q >= 0 && q <= 1)); }
  assert.ok(render.fogDensity >= 0 && render.fogDensity <= 1);
  for (const key of ['grain', 'wear', 'wetness']) assert.ok(render.material[key] >= 0 && render.material[key] <= 1, key + ' normalized');
  assert.equal(typeof render.water.enabled, 'boolean'); assert.ok(render.water.amplitude >= 0 && render.water.amplitude <= 2);
  assert.ok(render.lights.length <= 4, 'mobile light budget');
  assert.equal(new Set(render.lights.map(q => q.id)).size, render.lights.length, 'one descriptor per lamp');
  for (const light of render.lights) {
    assert.ok(knownLamps.includes(light.id)); assert.equal(light.position.length, 3); assert.equal(light.rgb.length, 3);
    assert.ok(Array.from(light.rgb).every(q => q >= 0 && q <= 1)); assert.ok(light.radius > 0 && light.radius <= 100);
    assert.ok(light.intensity >= 0 && light.intensity <= 4);
    if (light.direction) { assert.equal(light.direction.length, 3); assert.ok(Math.abs(Math.hypot(...light.direction) - 1) < 1e-5); assert.ok(light.coneCos >= -1 && light.coneCos <= 1); }
  }
}

test('decorative scene adds bounded finite geometry without changing real walls, objects, surfaces or actors', () => {
  const f = fixture(), g = f.game, s = g.pow;
  assert.equal(f.P.EpisodeScene, f.S, 'the primary API and compatibility alias share one scene module');
  const original = g.campGeo.slice(), originalJSON = clone(original), solids = clone(s.solids), objects = clone(s.objects), surfaces = clone(s.surfaces), actors = s.actors, e = g.evade, p = e.p.slice();
  f.S.enter(g); const extra = additions(g);
  assert.ok(extra.length > 0 && extra.length <= 64); assert.equal(s.episodeScene.version, 1);
  assert.deepEqual(clone(s.solids), solids); assert.deepEqual(clone(s.objects), objects); assert.deepEqual(clone(s.surfaces), surfaces);
  assert.equal(s.actors, actors); assert.equal(g.evade, e); assert.deepEqual(Array.from(e.p), Array.from(p));
  for (const item of original) { assert.ok(g.campGeo.includes(item)); assert.equal(JSON.stringify(item), JSON.stringify(originalJSON.find(q => q.id === item.id))); }
  for (const item of extra) { assertFiniteTree(item, item.id); assert.ok(Array.from(item.scale).every(q => q > 0)); assert.ok(item.m.startsWith('pow')); }
});

test('repeated scene entry and rendering cannot multiply decorative geometry or exceed four lights', () => {
  const f = fixture(); f.S.enter(f.game); const ids = additions(f.game).map(q => q.id).sort();
  for (let i = 0; i < 100; i++) { f.S.enter(f.game); validateRender(f.S.renderState(f.game)); f.S.step(f.game, .1); }
  assert.deepEqual(additions(f.game).map(q => q.id).sort(), ids); assert.equal(new Set(ids).size, ids.length);
});

test('physical stage changes rebuild a bounded scene without stacking prior-stage decorations', () => {
  const f = fixture();
  for (const stage of ['cell', 'compound', 'hanoi', 'river', 'cell', 'hanoi', 'compound']) {
    f.game.pow.stage = stage;
    if (stage === 'river') f.game.pow.river = { waterY: f.game.pow.base[1] - .35, hour: 23, current: .75, phase: 'river', sectionId: 'ferry', logicalDistance: 8200 };
    const originals = f.game.campGeo.filter(q => !q.id.startsWith(prefix)); f.S.enter(f.game);
    assert.ok(additions(f.game).length <= 64); assert.equal(new Set(additions(f.game).map(q => q.id)).size, additions(f.game).length);
    assert.deepEqual(f.game.campGeo.filter(q => !q.id.startsWith(prefix)), originals); validateRender(f.S.renderState(f.game));
  }
});

test('Low quality maintains a separate 24-decoration budget in every physical stage', () => {
  for (const stage of ['cell', 'compound', 'hanoi', 'river']) {
    const f = fixture(stage); f.game.app.set.quality = 0; f.game.rend = { quality: 0 }; f.S.enter(f.game);
    assert.ok(additions(f.game).length > 0 && additions(f.game).length <= 24, stage + ' Low geometry limit'); validateRender(f.S.renderState(f.game));
  }
});

test('river recenter and a cleared GPU scene rebuild decorations at the new origin with persistent switches', () => {
  const f = fixture('river'); f.S.enter(f.game); f.S.setLamp(f.game, 'ferry-lantern', false);
  const before = additions(f.game).map(q => ({ id: q.id, p: Array.from(q.p) })), shift = 250;
  f.game.pow.base[2] += shift; f.game.evade.p[2] += shift; f.S.enter(f.game);
  const after = additions(f.game); assert.equal(after.length, before.length);
  for (const q of before) { const updated = after.find(v => v.id === q.id); assert.ok(updated); assert.ok(Math.abs(updated.p[2] - q.p[2] - shift) < 1e-6); }
  f.game.campGeo = f.game.campGeo.filter(q => !q.id.startsWith(prefix)); f.S.enter(f.game);
  assert.equal(additions(f.game).length, before.length); assert.equal(f.S.snapshot(f.game).lamps['ferry-lantern'], false);
});

test('valid physical stages produce finite normalized material, fog, light and water uniforms', () => {
  for (const stage of ['cell', 'compound', 'hanoi', 'river']) { const f = fixture(stage); f.S.enter(f.game); validateRender(f.S.renderState(f.game)); }
});

test('river time and water surface are scene-derived, while prison stages disable water treatment', () => {
  const f = fixture('river'); f.S.enter(f.game); const before = f.S.renderState(f.game);
  assert.equal(before.water.enabled, true); assert.ok(Math.abs(before.water.level - f.game.pow.river.waterY) < 1e-6);
  f.S.step(f.game, .1); const after = f.S.renderState(f.game); assert.ok(after.water.time > before.water.time);
  f.game.pow.stage = 'cell'; f.S.enter(f.game); assert.equal(f.S.renderState(f.game).water.enabled, false);
});

test('dawn changes river lighting rather than leaving a permanent night uniform', () => {
  const f = fixture('river'); f.S.enter(f.game); const night = clone(f.S.renderState(f.game));
  f.game.pow.river.hour = 12; const day = f.S.renderState(f.game); validateRender(day);
  assert.ok(day.ambient.reduce((a, q) => a + q, 0) > night.ambient.reduce((a, q) => a + q, 0), 'day ambient brighter than midnight');
});

test('lamp switches change actual illumination and descriptors without altering prison collision', () => {
  const f = fixture(); f.S.enter(f.game); const g = f.game, solids = clone(g.pow.solids), lamp = f.S.renderState(g).lights.find(q => q.id === 'cell-bulb');
  assert.ok(lamp); const p = Array.from(lamp.position); p[1] -= .7;
  allOff(f); f.S.setLamp(g, 'cell-bulb', true); const lit = f.S.lightAt(g, p, { requireLOS: true });
  assert.equal(f.S.setLamp(g, 'cell-bulb', false), true); const dark = f.S.lightAt(g, p, { requireLOS: true });
  assert.ok(Number.isFinite(lit) && lit > dark); assert.ok(!f.S.renderState(g).lights.some(q => q.id === 'cell-bulb' && q.intensity > 0));
  assert.deepEqual(clone(g.pow.solids), solids); assert.equal(f.S.switchLamp(g, 'cell-bulb'), true); assert.equal(f.S.snapshot(g).lamps['cell-bulb'], true);
});

test('spotlight illuminates its cone, not the space behind it, with other lamps switched off', () => {
  const f = fixture('compound'); f.S.enter(f.game); allOff(f); f.S.setLamp(f.game, 'yard-east', true);
  f.game.pow.solids = []; const light = f.S.renderState(f.game).lights.find(q => q.id === 'yard-east');
  assert.ok(light && light.direction && light.coneCos > 0);
  const forward = Array.from(light.position, (q, i) => q + light.direction[i] * 5), backward = Array.from(light.position, (q, i) => q - light.direction[i] * 5);
  const lit = f.S.lightAt(f.game, forward, { requireLOS: true }), dark = f.S.lightAt(f.game, backward, { requireLOS: true });
  assert.ok(lit > dark + .01, 'spotlight cannot project backwards'); assert.ok(lit <= 1 && dark >= 0, 'illumination is bounded');
});

test('thin wall blocks real spotlight illumination, while disabling LOS exposes the blocked point', () => {
  const f = fixture('compound'); f.S.enter(f.game); allOff(f); f.S.setLamp(f.game, 'yard-east', true); f.game.pow.solids = [];
  const light = f.S.renderState(f.game).lights.find(q => q.id === 'yard-east');
  const target = Array.from(light.position, (q, i) => q + light.direction[i] * 7), halfway = Array.from(light.position, (q, i) => (q + target[i]) / 2);
  const clear = f.S.lightAt(f.game, target, { requireLOS: true }); assert.ok(clear > 0);
  f.game.pow.solids.push({ id: 'independent-thin-wall', x: halfway[0], z: halfway[2], hw: .01, hl: 12, yMin: halfway[1] - 12, yMax: halfway[1] + 12 });
  assert.equal(f.P.los(f.game, Array.from(light.position), target), false);
  const blocked = f.S.lightAt(f.game, target, { requireLOS: true }), unoccluded = f.S.lightAt(f.game, target, { requireLOS: false });
  assert.ok(blocked < clear); assert.ok(Math.abs(unoccluded - clear) < 1e-7); assert.equal(f.S.lightAt(f.game, target), blocked, 'default illumination must respect the real wall');
});

test('searchlight sweeps physically over time without directly commanding AI or recapture', () => {
  const f = fixture('compound'); let events = 0; f.P.AI = { step() { events++; }, captured() { events++; }, noise() { events++; } }; f.game.captured = () => { events++; };
  f.S.enter(f.game); const before = Array.from(f.S.renderState(f.game).lights.find(q => q.id === 'yard-east').direction), p = f.game.evade.p.slice();
  for (let i = 0; i < 120; i++) f.S.step(f.game, .1);
  const after = f.S.renderState(f.game).lights.find(q => q.id === 'yard-east').direction;
  assert.ok(Math.hypot(...after.map((q, i) => q - before[i])) > .1); assert.equal(events, 0); assert.deepEqual(Array.from(f.game.evade.p), Array.from(p));
});

test('checkpoint scene data are bounded plain JSON and restore clock and lamp choices without moving the player', () => {
  const f = fixture(); f.S.enter(f.game); f.S.setLamp(f.game, 'cell-bulb', false); f.S.setLamp(f.game, 'yard-east', false); f.S.step(f.game, .1);
  const snapshot = clone(f.S.snapshot(f.game)); assert.equal(snapshot.version, 1); assert.ok(JSON.stringify(snapshot).length < 4096); assert.ok(!('geometry' in snapshot));
  const oldClock = snapshot.clock, g = fixture('hanoi'); g.S.enter(g.game); const p = g.game.evade.p.slice(); g.S.restore(g.game, snapshot);
  assert.equal(g.S.snapshot(g.game).clock, oldClock); assert.equal(g.S.snapshot(g.game).lamps['cell-bulb'], false); assert.equal(g.S.snapshot(g.game).lamps['yard-east'], false); assert.deepEqual(Array.from(g.game.evade.p), Array.from(p));
  snapshot.lamps['cell-bulb'] = true; assert.equal(g.S.snapshot(g.game).lamps['cell-bulb'], false, 'restored switches do not alias caller-owned JSON');
});

test('unknown lamps and malformed checkpoint data cannot inject lights, non-finite values or unbounded state', () => {
  const f = fixture(); f.S.enter(f.game);
  assert.equal(f.S.setLamp(f.game, 'untrusted-light', true), false); assert.equal(f.S.switchLamp(f.game, 'untrusted-light'), false);
  for (const saved of [null, [], 'broken', { version: 999, clock: Infinity, lamps: { 'cell-bulb': 'false', 'untrusted-light': true } }, { version: 1, clock: -100, lamps: { 'yard-east': {}, 'cell-bulb': false } }]) {
    assert.doesNotThrow(() => f.S.restore(f.game, saved)); const snap = f.S.snapshot(f.game); assertFiniteTree(snap, 'checkpoint'); assert.ok(snap.clock >= 0);
    assert.ok(Object.keys(snap.lamps).every(id => knownLamps.includes(id))); assert.ok(Object.values(snap.lamps).every(on => typeof on === 'boolean')); validateRender(f.S.renderState(f.game));
  }
});

test('invalid simulation durations do not advance scene state, and oversized durations are capped', () => {
  const f = fixture(); f.S.enter(f.game); const initial = f.S.snapshot(f.game).clock;
  for (const dt of [-1, NaN, Infinity, -Infinity, undefined]) f.S.step(f.game, dt);
  assert.equal(f.S.snapshot(f.game).clock, initial); f.S.step(f.game, 500);
  const change = f.S.snapshot(f.game).clock - initial; assert.ok(change > 0 && change <= .100001);
});

test('flight, solitary, regular confinement and imagined scenes cannot receive episode geometry, light or state mutations', () => {
  for (const kind of ['flight', 'solitary', 'regular', 'imagined']) {
    const f = fixture(); if (kind === 'flight') f.game.phase = 'fly'; else if (kind === 'imagined') f.P.Mindscape = { active: () => true }; else f.game.pow.stage = kind;
    const before = JSON.stringify({ pow: f.game.pow, geometry: f.game.campGeo, evade: f.game.evade });
    f.S.enter(f.game); f.S.step(f.game, .1); assert.equal(f.S.renderState(f.game), null);
    assert.equal(JSON.stringify({ pow: f.game.pow, geometry: f.game.campGeo, evade: f.game.evade }), before);
  }
});
