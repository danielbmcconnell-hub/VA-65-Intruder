'use strict';
// Descriptor and sampling tests only. GLSL appearance/occlusion needs the real
// WebGL browser suite; these tests do not measure device rendering performance.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');

function moduleUnderTest() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/render/contact-shadows.js'), 'utf8'), { window });
  return window.ContactShadows;
}
function game(extra = {}) { return { t: 0, evade: { p: [0, 0, 0] }, rend: { eye: [0, 0, 0] }, ...extra }; }
function sprite(p = [2, 0, 0], kind = 'nva') {
  return { p, owner: { kind, alive: true }, useCleanFigure: true, photoName: 'nva', motion: [0, 0, 0, .98] };
}
function near(actual, expected, epsilon = 1e-10) { assert(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`); }
function vector(actual, expected) { assert.equal(actual.length, expected.length); actual.forEach((n, i) => near(n, expected[i])); }
function finiteDescriptor(s) {
  assert.equal(s.p.length, 3); assert.equal(s.slope.length, 2);
  for (const n of [...s.p, ...s.slope, s.r, s.sx, s.d, s.lift]) assert(Number.isFinite(n));
  assert(s.d >= 0 && s.d <= .24); assert.equal(s.contact, true);
}

test('supported photographic NPCs receive cores while scenery, corpses and unrelated sprites do not', () => {
  const M = moduleUnderTest(), g = game();
  const kinds = ['guard', 'guardAim', 'sentry', 'nva', 'militia', 'vc', 'vcFem', 'female_vc', 'farmer', 'villager'];
  const actors = kinds.map(kind => sprite([2, 0, 0], kind));
  const rejected = [sprite([2, 0, 0], 'forest'), sprite([2, 0, 0], 'cow'), sprite([2, 0, 0], 'tree'),
    { ...sprite(), owner: { kind: 'nva', alive: false } }, { ...sprite(), useCleanFigure: false },
    { ...sprite(), motion: null }, { ...sprite(), owner: null, photoName: 'vegetation' }];
  assert.equal(M.collect(g, [...actors, ...rejected], 1).length, kinds.length);
  // Ownerless compatibility descriptors must still be known people photographs.
  assert.equal(M.collect(g, ['nva', 'militia', 'female_vc', 'farmer'].map(photoName => ({ ...sprite(), owner: null, photoName })), 1).length, 4);
  // A still actor with a valid motion descriptor remains grounded.
  assert.equal(M.collect(g, [{ ...sprite(), motion: [0, 0, 0, .98] }], 1).length, 1);
});

test('invalid or sparse coordinates/motion cannot emit nonfinite render instances', () => {
  const M = moduleUnderTest(), g = game();
  const invalid = [null, undefined, {}, { ...sprite(), p: [NaN, 0, 0] }, { ...sprite(), p: [0, Infinity, 0] },
    { ...sprite(), p: new Array(3) }, { ...sprite(), p: [0, 0] }, { ...sprite(), motion: new Array(4) },
    { ...sprite(), motion: [0, 0, NaN, 0] }, { ...sprite(), motion: [0, 0, 0] }];
  assert.equal(M.collect(g, invalid, 2).length, 0);
  for (const badGame of [null, undefined, {}, { evade: {} }, { evade: { p: new Array(3) } }]) assert.equal(M.collect(badGame, [], 1).length, 0);
  assert.equal(M.collect(g, null, 1).length, 0);
  // Extra metadata in a position array is outside the three-coordinate key.
  const output = M.collect(g, [{ ...sprite([1, 0, 0, Symbol('unused')]), owner: null }], 1);
  assert.equal(output.length, 1); finiteDescriptor(output[0]);
});

test('restored unwarped source photographs retain contact shadows without legacy figure motion', () => {
  const M=moduleUnderTest(),g=game();
  const photos=['farmer','female_vc','militia','nva'].map((photoName,i)=>({
    p:[i+1,0,0],photoName,sourcePhotograph:true,owner:{kind:photoName,alive:true},motion:null
  }));
  const before=JSON.stringify(photos),result=M.collect(g,photos,2);
  assert.equal(result.length,4);result.forEach(finiteDescriptor);
  assert.equal(JSON.stringify(photos),before);
});

test('quality limits select only the nearest cores and cap terrain work at four samples each', () => {
  for (const [quality, count] of [[0, 12], [1, 18], [2, 24], [undefined, 18]]) {
    const M = moduleUnderTest(), g = game(); let samples = 0;
    M.configure({ terrainH: () => { samples++; return 0; } });
    const sprites = Array.from({ length: 100 }, (_, i) => sprite([.3 * i, 0, 0])).reverse();
    const result = M.collect(g, sprites, quality);
    assert.equal(result.length, count); assert.equal(samples, count * 4);
    result.forEach((s, i) => { near(s.p[0], i * .3); finiteDescriptor(s); });
    assert.equal(M.inspect(g).terrainSamples, count * 4);
  }
});

test('range fade, night intensity and camera ownership remain bounded and continuous', () => {
  const M = moduleUnderTest(), g = game();
  const result = M.collect(g, [sprite([34, 0, 0]), sprite([35, 0, 0]), sprite([45, 0, 0]), sprite([55, 0, 0]), sprite([60, 0, 0]), sprite([80, 0, 0])], 2);
  assert.equal(result.length, 4); near(result[0].d, .24); near(result[1].d, .24);
  assert(result[1].d > result[2].d && result[2].d > result[3].d && result[3].d > 0);
  g.atm = { night: true }; near(M.collect(g, [sprite()], 2)[0].d, .14);
  // Render camera, not the player body, controls nearby-only budget selection.
  g.rend.eye = [200, 0, 0]; assert.equal(M.collect(g, [sprite()], 1).length, 0);
  delete g.rend; g.camPos = [0, 0, 0]; assert.equal(M.collect(g, [sprite()], 1).length, 1);
  delete g.camPos; assert.equal(M.collect(g, [sprite()], 1).length, 1);
});

test('terrain plane uses exactly four local samples and retains the actual sprite foot', () => {
  const M = moduleUnderTest(), g = game(), calls = [];
  const h = (x, z) => 10 + .4 * x - .2 * z;
  M.configure({ terrainH: (x, z) => { calls.push([x, z]); return h(x, z); } });
  const s = sprite([2, h(2, 3), 3]), result = M.collect(g, [s], 2)[0];
  assert.equal(calls.length, 4); vector(calls[0], [1.72, 3]); vector(calls[1], [2.28, 3]);
  vector(calls[2], [2, 2.72]); vector(calls[3], [2, 3.28]);
  vector(result.p, s.p); vector(result.slope, [.4, -.2]); near(result.lift, .012);
  near(result.r, .55); near(result.sx, .88); finiteDescriptor(result);
});

test('cache cadence skips repeated sampling but refreshes on movement, clock rollback and changed terrain', () => {
  const M = moduleUnderTest(), g = game(), s = sprite([0, 10, 0]); let calls = 0;
  const h = x => { calls++; return 10 + .2 * x; };
  assert.equal(M.configure({ terrainH: h }), true);
  M.collect(g, [s], 1); assert.equal(calls, 4);
  g.t = .1; M.collect(g, [s], 1); assert.equal(M.inspect(g).terrainSamples, 0);
  g.t = .249; M.collect(g, [s], 1); assert.equal(calls, 4);
  g.t = .25; M.collect(g, [s], 1); assert.equal(calls, 8);
  s.p = [5, 11, 0]; g.t = .26; M.collect(g, [s], 1); assert.equal(calls, 12);
  g.t = .01; M.collect(g, [s], 1); assert.equal(calls, 16);
  M.configure({ terrainH: h }); M.collect(g, [s], 1); assert.equal(calls, 16);
  M.configure({ terrainH: x => { calls++; return 11 + .4 * (x - 5); } });
  vector(M.collect(g, [s], 1)[0].slope, [.4, 0]); assert.equal(calls, 20);
  assert.equal(M.configure({ terrainH: null }), false);
});

test('cache is bounded per game and evicts the least recently used owner', () => {
  const M = moduleUnderTest(), g = game(); let samples = 0;
  M.configure({ terrainH: () => { samples++; return 0; } });
  const sprites = Array.from({ length: 101 }, () => sprite());
  for (const s of sprites.slice(0, 100)) M.collect(g, [s], 1);
  assert.equal(M.inspect(g).cacheSize, 96); assert.equal(samples, 400);
  M.collect(g, [sprites[4]], 1); assert.equal(M.inspect(g).terrainSamples, 0);
  M.collect(g, [sprites[100]], 1); assert.equal(M.inspect(g).cacheSize, 96);
  M.collect(g, [sprites[4]], 1); assert.equal(M.inspect(g).terrainSamples, 0);
  M.collect(g, [sprites[5]], 1); assert.equal(M.inspect(g).terrainSamples, 4);
  const second = game(); M.collect(second, [sprites[4]], 1);
  assert.equal(M.inspect(second).cacheSize, 1); assert.equal(M.inspect(second).terrainSamples, 4);
  assert.equal(M.inspect(g).cacheSize, 96);
});

test('prison/camp floors and roof-height feet stay horizontal and cannot be pulled down to terrain', () => {
  for (const context of ['pow', 'camp', 'roof']) {
    const M = moduleUnderTest(), g = game(), s = sprite([2, 7, 0]); let samples = 0;
    M.configure({ terrainH: x => { samples++; return 1 + .4 * x; } });
    if (context === 'pow') g.pow = { time: 0 };
    if (context === 'camp') g.evade.camp = {};
    const result = M.collect(g, [s], 1)[0];
    vector(result.p, [2, 7, 0]); vector(result.slope, [0, 0]);
    assert.equal(samples, context === 'roof' ? 4 : 0);
  }
});

test('steep, curved, discontinuous or invalid terrain safely falls back to a flat foot-height core', () => {
  const cases = [
    { h: x => 10 + 3 * x, p: [0, 10, 0] },
    { h: () => 10, p: [0, 10.19, 0] },
    { h: (x, z) => 10 + 4 * (x * x + z * z), p: [0, 10, 0] },
    { h: x => x < 0 ? 0 : 20, p: [0, 10, 0] },
    { h: () => NaN, p: [0, 10, 0] },
    { h: () => Infinity, p: [0, 10, 0] },
    { h: () => { throw new Error('terrain temporarily unavailable'); }, p: [0, 10, 0] }
  ];
  for (const { h, p } of cases) {
    const M = moduleUnderTest(); M.configure({ terrainH: h });
    const result = M.collect(game(), [sprite(p)], 1)[0];
    vector(result.slope, [0, 0]); vector(result.p, p); finiteDescriptor(result);
  }
});

test('switching between terrain and known floor invalidates cached surface orientation immediately', () => {
  const M = moduleUnderTest(), g = game(), s = sprite([0, 10, 0]);
  M.configure({ terrainH: x => 10 + .4 * x });
  vector(M.collect(g, [s], 1)[0].slope, [.4, 0]);
  g.pow = { time: 0 }; vector(M.collect(g, [s], 1)[0].slope, [0, 0]); assert.equal(M.inspect(g).terrainSamples, 0);
  delete g.pow; vector(M.collect(g, [s], 1)[0].slope, [.4, 0]); assert.equal(M.inspect(g).terrainSamples, 4);
  // A small raised step also invalidates a terrain tangent during the cadence.
  s.p[1] = 10.19; vector(M.collect(g, [s], 1)[0].slope, [0, 0]); assert.equal(M.inspect(g).terrainSamples, 4);
  vector(M.collect(g, [s], 1)[0].p, [0, 10.19, 0]);
});

test('duplicate descriptors for one actor contribute only one core and independent owners remain independent', () => {
  const M = moduleUnderTest(), g = game(), s = sprite();
  const result = M.collect(g, [s, { ...s }, sprite()], 2);
  assert.equal(result.length, 2); assert.equal(M.inspect(g).cacheSize, 2);
});

test('descriptors and diagnostics are detached copies and frozen gameplay state is never mutated', () => {
  const M = moduleUnderTest(); M.configure({ terrainH: x => 10 + .2 * x });
  const s = sprite([0, 10, 0]); Object.freeze(s.p); Object.freeze(s.motion); Object.freeze(s.owner); Object.freeze(s);
  const g = game({ t: 3, paused: true }); Object.freeze(g.evade.p); Object.freeze(g.evade); Object.freeze(g.rend.eye); Object.freeze(g.rend); Object.freeze(g);
  const original = JSON.stringify({ g, s }), result = M.collect(g, [s], 1);
  result[0].p[0] = 900; result[0].slope[0] = 99; result[0].d = 99; result.push({});
  const info = M.inspect(g); info.cacheSize = 900; info.count = 99;
  const fresh = M.collect(g, [s], 1);
  vector(fresh[0].p, [0, 10, 0]); vector(fresh[0].slope, [.2, 0]); near(fresh[0].d, .24);
  assert.equal(fresh.length, 1); assert.equal(M.inspect(g).cacheSize, 1); assert.equal(M.inspect(g).terrainSamples, 0);
  assert.equal(JSON.stringify({ g, s }), original);
});

test('reset drops only the requested game cache and public resource limits cannot be changed', () => {
  const M = moduleUnderTest(), first = game(), second = game();
  assert(Object.isFrozen(M)); assert(Object.isFrozen(M.limits));
  assert.equal(M.limits.low, 12); assert.equal(M.limits.medium, 18); assert.equal(M.limits.high, 24);
  assert.equal(M.limits.cache, 96); assert.equal(M.limits.samplesPerCore, 4);
  M.collect(first, [sprite()], 1); M.collect(second, [sprite()], 1);
  assert.equal(M.reset(first), true); assert.equal(M.inspect(first).cacheSize, 0);
  assert.equal(M.inspect(second).cacheSize, 1); assert.equal(M.reset(first), false);
  assert.equal(M.reset(null), false);
});
