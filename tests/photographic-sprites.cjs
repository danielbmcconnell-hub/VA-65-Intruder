'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const window = {};
const scope = vm.createContext({ window });
vm.runInContext(fs.readFileSync(path.join(root, 'assets/render/photographic-sprites.js'), 'utf8'), scope);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/atlas-metadata.js'), 'utf8') + ';window.testMetadata=PHOTO_ATLAS;', scope);
const repairedMetadata = path.join(root, 'assets/sprites/atlas-metadata.js');
if (fs.existsSync(repairedMetadata)) vm.runInContext(fs.readFileSync(repairedMetadata, 'utf8'), scope);
const S = window.PhotoSprites, metadata = window.testMetadata;
S.configure(metadata);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' != ' + b);
const actor = kind => ({ kind, p: [0, 0, 0], face: 0, ph: 0, spd: 0, alive: true, armed: !['farmer', 'villager', 'cow'].includes(kind) });
const photoKinds = { farmer: 'farmer', villager: 'farmer', vc: 'militia', militia: 'militia', vcFem: 'female_vc', female_vc: 'female_vc', guard: 'nva', guardAim: 'nva', sentry: 'nva', nva: 'nva', aviator: 'aviator', cow: 'cow' };

test('every supplied photographic atlas remains byte-identical to the original project baseline', () => {
  for (const name of ['farmer', 'female_vc', 'militia', 'nva', 'aviator', 'cow', 'vegetation']) {
    const file = 'assets/' + name + '.webp';
    const before = cp.execFileSync('git', ['show', 'chatgpt-v11-baseline:' + file], { cwd: root, maxBuffer: 4 * 1024 * 1024 });
    const after = fs.readFileSync(path.join(root, file));
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(after), hash(before), file);
  }
});

test('idle, moving, hurt and alerted actors retain their own supplied photographic identity', () => {
  for (const [kind, expected] of Object.entries(photoKinds)) {
    for (const state of [{}, { spd: 1.4, ph: 1.3 }, { spd: 3, ph: 3.2, seen: 1, state: 'pursuit' }, { hurt: true, flinch: 10 }]) {
      const a = { ...actor(kind), ...state }, before = JSON.stringify(a);
      const d = S.describe(a, { camera: [0, 1.6, 8], moving: a.spd > .1 });
      assert.equal(d.photoName, expected, kind + ': ' + JSON.stringify(state));
      assert.ok(Number.isInteger(d.photoFrame) && d.photoFrame >= 0 && d.photoFrame < 48, JSON.stringify(d));
      assert.ok(Number.isFinite(d.h) && d.h > 0 && d.h < 2.2, JSON.stringify(d));
      assert.equal(JSON.stringify(a), before, 'Rendering descriptors cannot alter actors or combat state');
    }
  }
});

test('camera direction may change a source pose but never switches species, crops a frame or mutates AI', () => {
  for (const [kind, expected] of Object.entries(photoKinds)) {
    const a = actor(kind), before = JSON.stringify(a);
    for (const camera of [[0, 1.6, 8], [8, 1.6, 0], [0, 1.6, -8], [-8, 1.6, 0]]) {
      const d = S.describe(a, { camera });
      assert.equal(d.photoName, expected);
      assert.ok(Number.isInteger(d.photoFrame) && d.photoFrame >= 0 && d.photoFrame < 48);
    }
    assert.equal(JSON.stringify(a), before);
  }
});

test('all 48 source cells preserve original aspect and put the photographed soles on the requested ground', () => {
  for (const name of ['farmer', 'female_vc', 'militia', 'nva', 'aviator', 'cow']) {
    const m = metadata[name], expectedAspect = (m.width / 8) / (m.height / 6);
    for (let frame = 0; frame < 48; frame++) {
      const source = { p: [3, 12, -5], photoName: name, photoFrame: frame, h: 1.6, w: 7, flip: frame % 2 === 0 };
      const before = JSON.stringify(source), result = S.anchor(source, metadata), f = m.frames[frame];
      assert.equal(result.cols, 8); assert.equal(result.rows, 6); assert.equal(result.cell, frame);
      close(result.w / result.h, expectedAspect);
      close(result.p[1] + result.h * f.bottom, 12);
      assert.equal(result.p[0], 3); assert.equal(result.p[2], -5);
      assert.equal(JSON.stringify(source), before);
      assert.ok(!result.motion || result.motion.every(value => !value), 'Source figures use intact photograph geometry');
    }
  }
});

test('idle cattle do not alternate grazing and standing photographs just because time passes', () => {
  const a = { ...actor('cow'), yaw: .3, walk: 0 };
  const first = S.describe(a, { camera: [0, 1.6, 8], phase: 0 });
  for (const t of [.1, .5, 1, 3, 9]) {
    a.t = t;
    const d = S.describe(a, { camera: [0, 1.6, 8], phase: t });
    assert.equal(d.photoName, 'cow'); assert.equal(d.photoFrame, first.photoFrame); assert.equal(d.flip, first.flip);
  }
});

test('the damaged frontal NVA pose uses the complete restored figure with its own one-cell source geometry', () => {
  const a = actor('nva'), d = S.describe(a, { camera: [0, 1.6, -8] });
  assert.equal(d.photoName, 'nva'); assert.equal(d.photoVariant, 'nva_front'); assert.equal(d.textureName, 'photo_nva_front');
  const p = S.anchor({ ...d, p: [3, 9, -5] }, metadata), m = metadata.nva_front, f = m.frames[0];
  assert.equal(p.cols, 1); assert.equal(p.rows, 1); assert.equal(p.cell, 0);
  close(p.w / p.h, m.width / m.height); close(p.p[1] + p.h * f.bottom, 9); close(p.h * f.height, 1.76);
  assert.ok(!p.motion);
  const aimed = S.describe({ ...a, seen: 1 }, { camera: [0, 1.6, -8] });
  assert.equal(aimed.photoName, 'nva'); assert.equal(aimed.photoFrame, 16); assert.ok(!aimed.photoVariant);
});
