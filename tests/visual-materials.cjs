'use strict';
// Pure range/alias gates and material ownership. Actual GLSL compilation,
// appearance and terrain/river preservation are checked by WebGL browsers.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/flight/visual-materials.js'), 'utf8'), { window });
const M = window.FlightVisualMaterials;

test('surface ownership excludes photographic sprites, original aircraft, carrier and unchanged scenery', () => {
  for (const name of ['intruder', 'A6A', 'carrier', 'people', 'photo_farmer', 'photo_nva', 'bldg', 'MiG17PF', 'bnStrikeEmbers', '', null, '__proto__', 'constructor']) assert.equal(M.kind(name), 0, String(name));
  for (const [name, kind] of [['bnStrikeDepot', 1], ['bnStrikeShed', 1], ['bnStrikeRuin', 2], ['bnStrikeRoad', 3], ['bnStrikeTruck', 4], ['bnStrikeTower', 5]]) assert.equal(M.kind(name), kind);
});

test('detail vanishes at unresolved pixel footprints and long range on all qualities', () => {
  for (const quality of [0, 1, 2]) {
    assert.equal(M.detailWeight(10, .56, quality), 0);
    assert.equal(M.detailWeight(1450, .01, quality), 0);
    assert.equal(M.detailWeight(5000, .01, quality), 0);
    assert.equal(M.detailWeight(10, .01, quality), 1);
    assert(M.detailWeight(500, .01, quality) < 1);
  }
  assert.equal(M.detailWeight(620, .01, 0), 0);
  assert(M.detailWeight(620, .01, 1) > 0);
});

test('detail gates remain bounded and monotone as range or pixel footprint grows', () => {
  for (const quality of [0, 1, 2]) {
    let previous = 1;
    for (let distance = 0; distance < 2000; distance += 13) { const w = M.detailWeight(distance, .08, quality); assert(w >= 0 && w <= 1 && w <= previous + 1e-12); previous = w; }
    previous = 1;
    for (let footprint = 0; footprint < 1; footprint += .007) { const w = M.detailWeight(100, footprint, quality); assert(w >= 0 && w <= 1 && w <= previous + 1e-12); previous = w; }
  }
  for (const args of [[NaN, 0, 1], [0, Infinity, 1], [0, 0, NaN], [-1, 0, 1], [0, -1, 1]]) assert.equal(M.detailWeight(...args), 0);
});

test('material helper is immutable and introduces no browser lifecycle or network ownership', () => {
  assert(Object.isFrozen(M));
  assert.doesNotMatch(M.glsl, /sampler|texture\s*\(|terrainH\s*\(|gl_Position|discard|uSunCol\s*\*|uAmb\s*\*/);
});
