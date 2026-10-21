'use strict';
// Production layout/upload/ownership logic with explicit WebGL/Canvas doubles.
// These checks cover resource and error contracts; they do not claim GPU output.
// Separate Chromium fixtures exercise texSubImage3D and real mipmap sampling.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/render/sprite-layers.js'), 'utf8');
function fixture() {
  const calls = [], canvases = [], window = { document: { createElement(name) {
    assert.equal(name, 'canvas');
    const canvas = { width: 0, height: 0, getContext(type) {
      assert.equal(type, '2d'); return this.ctx;
    } };
    canvas.ctx = { clearRect(...args) { calls.push(['clear', ...args]); },
      drawImage(...args) { calls.push(['crop', ...args.slice(1)]); },
      getImageData() { calls.push(['pixels']); return { data: new Uint8ClampedArray([200, 80, 40, 128, 0, 0, 0, 0, 255, 200, 100, 255, 100, 100, 100, 64]) }; } };
    canvases.push(canvas); return canvas;
  } } };
  vm.runInNewContext(source, { window, Uint8Array });
  return { M: window.SpriteLayers, window, calls, canvases };
}
function gpu(options = {}) {
  let id = 0, active = 33987, lost = false;
  const calls = [], valid = new Set(), values = new Map(), arrays = new Map(), textures2D = new Map(), errors = options.preexistingError ? [options.preexistingError] : [];
  const gl = {
    ACTIVE_TEXTURE: 34016, TEXTURE0: 33984, TEXTURE_2D_ARRAY: 35866, TEXTURE_BINDING_2D_ARRAY: 35869,
    TEXTURE_2D: 3553, TEXTURE_BINDING_2D: 32873,
    MAX_TEXTURE_SIZE: 3379, MAX_ARRAY_TEXTURE_LAYERS: 35071, UNPACK_FLIP_Y_WEBGL: 37440,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441, UNPACK_ALIGNMENT: 3317, UNPACK_ROW_LENGTH: 3314,
    UNPACK_IMAGE_HEIGHT: 32878, UNPACK_SKIP_PIXELS: 3316, UNPACK_SKIP_ROWS: 3315, UNPACK_SKIP_IMAGES: 32877,
    RGBA8: 32856, RGBA: 6408, UNSIGNED_BYTE: 5121, TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240,
    LINEAR_MIPMAP_LINEAR: 9987, LINEAR: 9729, TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243, TEXTURE_WRAP_R: 32882,
    CLAMP_TO_EDGE: 33071, NO_ERROR: 0,
    isContextLost: () => lost,
    isTexture: texture => valid.has(texture),
    getParameter(key) {
      if (key === this.ACTIVE_TEXTURE) return active;
      if (key === this.TEXTURE_BINDING_2D_ARRAY) return arrays.get(active) || null;
      if (key === this.TEXTURE_BINDING_2D) return textures2D.get(active) || null;
      if (key === this.MAX_TEXTURE_SIZE) return options.maxSize || 4096;
      if (key === this.MAX_ARRAY_TEXTURE_LAYERS) return options.maxLayers || 256;
      return values.get(key) ?? 0;
    },
    activeTexture(unit) { active = unit; calls.push(['active', unit]); },
    createTexture() { if (options.noTexture) return null; const texture = { id: ++id }; valid.add(texture); calls.push(['create', texture.id]); return texture; },
    deleteTexture(texture) { valid.delete(texture); calls.push(['delete', texture.id]); },
    bindTexture(target, texture) {
      assert([this.TEXTURE_2D_ARRAY, this.TEXTURE_2D].includes(target));
      (target === this.TEXTURE_2D_ARRAY ? arrays : textures2D).set(active, texture);
      calls.push([target === this.TEXTURE_2D_ARRAY ? 'bind' : 'bind2D', active, texture && texture.id]);
    },
    pixelStorei(key, value) { values.set(key, value); calls.push(['pixel', key, value]); },
    texStorage3D(...args) { calls.push(['storage', ...args]); if (options.storageError) errors.push(1285); },
    texImage2D(...args) { calls.push(['upload2D', ...args.slice(0, 8), Array.from(args[8])]); if (options.proxyError) errors.push(1285); },
    texSubImage3D(...args) {
      const image = args[10], typed = ArrayBuffer.isView(image);
      calls.push(['upload', args[4], args[5], args[6], typed ? Array.from(image) : [image.width, image.height], values.get(this.UNPACK_PREMULTIPLY_ALPHA_WEBGL)]);
      if (typed && options.typedError || !typed && options.domError) errors.push(1282);
    },
    texParameteri(...args) { calls.push(['parameter', ...args]); },
    generateMipmap(target) { calls.push(['mip', target]); if (options.mipError) errors.push(1282); },
    getError() { return errors.shift() || 0; },
    uniform1i(location, value) { calls.push(['integer', location, value]); },
    uniform1f(location, value) { calls.push(['float', location, value]); },
    lose() { lost = true; }, restore() { lost = false; valid.clear(); arrays.clear(); },
    calls, values, arrays, textures2D, options
  };
  values.set(gl.UNPACK_FLIP_Y_WEBGL, true); values.set(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  values.set(gl.UNPACK_ALIGNMENT, 8); values.set(gl.UNPACK_ROW_LENGTH, 29); values.set(gl.UNPACK_IMAGE_HEIGHT, 31);
  values.set(gl.UNPACK_SKIP_PIXELS, 3); values.set(gl.UNPACK_SKIP_ROWS, 5); values.set(gl.UNPACK_SKIP_IMAGES, 2);
  return gl;
}
const atlas = (width = 16, height = 18) => ({ width, height });
const plain = value => JSON.parse(JSON.stringify(value));

test('native supplied layouts retain all direction/state frames and full original resolution', () => {
  const { M } = fixture(), people = M.layout('people', 1536, 3456), trees = M.layout('photo_vegetation', 1536, 1536);
  assert.deepEqual([people.width, people.height, people.cols, people.rows, people.layers, people.levels], [192, 384, 8, 9, 72, 9]);
  assert.deepEqual([trees.width, trees.height, trees.cols, trees.rows, trees.layers, trees.levels], [192, 256, 8, 6, 48, 9]);
  let pixels = 0;
  for (let w = 192, h = 384; ; w = Math.max(1, Math.floor(w / 2)), h = Math.max(1, Math.floor(h / 2))) { pixels += w * h; if (w === 1 && h === 1) break; }
  assert.equal(people.bytes, pixels * 72 * 4); assert(people.bytes < 32 * 1024 * 1024);
  assert(people.bytes + trees.bytes < 40 * 1024 * 1024);
});

test('only known atlas names and exact integer frame boundaries are eligible', () => {
  const { M } = fixture();
  for (const name of ['wear', 'photo_farmer', 'photo_nva', 'portrait', '__proto__', 'constructor', '', null]) assert.equal(M.layout(name, 1536, 3456), null);
  for (const [w, h] of [[0, 18], [16, -1], [17, 18], [16, 19], [NaN, 18], [Infinity, 18], [16.5, 18], [8192, 9216]]) assert.equal(M.layout('people', w, h), null);
});

test('array allocation crops every original frame exactly once into its own layer', () => {
  const f = fixture(), gl = gpu(), original = atlas(), before = JSON.stringify(original), info = f.M.upload(gl, 'people', original);
  assert(info && gl.isTexture(info.arrayTex)); assert.equal(info.premultiplied, true); assert.equal(info.uploadPath, 'canvas-premultiplied');
  const crops = f.calls.filter(c => c[0] === 'crop'), uploads = gl.calls.filter(c => c[0] === 'upload');
  assert.equal(crops.length, 72); assert.equal(uploads.length, 72);
  for (let i = 0; i < 72; i++) { assert.deepEqual(crops[i].slice(1), [i % 8 * 2, Math.floor(i / 8) * 2, 2, 2, 0, 0, 2, 2]); assert.equal(uploads[i][1], i); assert.deepEqual(uploads[i].slice(2, 5), [2, 2, [2, 2]]); assert.equal(uploads[i][5], true); }
  assert.equal(JSON.stringify(original), before); assert.equal(f.calls.filter(c => c[0] === 'pixels').length, 0);
  assert.equal(gl.calls.filter(c => c[0] === 'mip').length, 1); assert.equal(gl.getError(), 0);
});

test('mipmaps belong to the texture array, with clamped edges and trilinear minification', () => {
  const { M } = fixture(), gl = gpu(); M.upload(gl, 'people', atlas());
  const params = gl.calls.filter(c => c[0] === 'parameter');
  assert(params.some(c => c[2] === gl.TEXTURE_MIN_FILTER && c[3] === gl.LINEAR_MIPMAP_LINEAR));
  assert(params.some(c => c[2] === gl.TEXTURE_MAG_FILTER && c[3] === gl.LINEAR));
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) assert(params.some(c => c[2] === p && c[3] === gl.CLAMP_TO_EDGE));
});

test('upload restores every pixel-unpack value, active unit and former array binding', () => {
  const { M } = fixture(), gl = gpu(), previous = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, previous);
  const active = gl.getParameter(gl.ACTIVE_TEXTURE), pixels = [...gl.values];
  M.upload(gl, 'people', atlas());
  assert.equal(gl.getParameter(gl.ACTIVE_TEXTURE), active); assert.equal(gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY), previous);
  assert.deepEqual([...gl.values], pixels);
});

test('DOM conversion fallback premultiplies temporary RGB while preserving source pixels and alpha', () => {
  const f = fixture(), gl = gpu({ domError: true }), original = atlas(), before = plain(original), info = f.M.upload(gl, 'people', original);
  assert(info); assert.equal(info.uploadPath, 'typed-premultiplied');
  const uploads = gl.calls.filter(c => c[0] === 'upload'); assert.equal(uploads.length, 73);
  assert.deepEqual(uploads[1][4], [100, 40, 20, 128, 0, 0, 0, 0, 255, 200, 100, 255, 25, 25, 25, 64]);
  assert.equal(uploads[1][5], false); assert.deepEqual(original, before); assert.equal(gl.getError(), 0);
});

test('insufficient texture limits do not allocate storage or alter current GL state', () => {
  for (const options of [{ maxLayers: 32 }, { maxSize: 1 }]) {
    const { M } = fixture(), gl = gpu(options), before = [...gl.values];
    assert.equal(M.upload(gl, 'people', atlas()), null); assert.equal(gl.calls.length, 0); assert.deepEqual([...gl.values], before);
    assert.equal(M.inspect(gl).failures, 1);
  }
});

test('unsupported or lost contexts do not allocate a fallback or consume source data', () => {
  const { M } = fixture(), gl = gpu(); gl.lose();
  assert.equal(M.upload(gl, 'people', atlas()), null); assert.equal(M.fallback(gl), null); assert.equal(gl.calls.length, 0);
  const old = gl.texStorage3D; gl.restore(); delete gl.texStorage3D; assert.equal(M.upload(gl, 'people', atlas()), null); gl.texStorage3D = old;
});

test('pre-existing caller GL errors are explicitly reported before any upload allocation', () => {
  for (const method of ['upload', 'fallback', 'proxy']) {
    const { M, calls } = fixture(), gl = gpu({ preexistingError: 1280 });
    const result = method === 'upload' ? M.upload(gl, 'people', atlas()) : M[method](gl);
    assert.equal(result, null); assert.equal(gl.calls.length, 0); assert.equal(calls.length, 0);
    const report = M.inspect(gl);
    assert.equal(report.failures, 1); assert.equal(report.lastFailure.error, 1280);
    assert.match(report.lastFailure.reason, /Pre-existing WebGL error/);
  }
});

test('failed storage, typed uploads and mipmaps release the partial array and retain a diagnostic', () => {
  for (const options of [{ storageError: true }, { domError: true, typedError: true }, { mipError: true }]) {
    const { M } = fixture(), gl = gpu(options), pixels = [...gl.values], active = gl.getParameter(gl.ACTIVE_TEXTURE);
    assert.equal(M.upload(gl, 'people', atlas()), null);
    assert.equal(gl.calls.filter(c => c[0] === 'create').length, 1); assert.equal(gl.calls.filter(c => c[0] === 'delete').length, 1);
    assert.deepEqual([...gl.values], pixels); assert.equal(gl.getParameter(gl.ACTIVE_TEXTURE), active);
    const report = M.inspect(gl); assert.equal(report.bytes, 0); assert.equal(report.liveArrays, 0); assert.equal(report.failures, 1); assert(report.lastFailure.error > 0); assert.equal(gl.getError(), 0);
  }
});

test('canvas failure and upload exceptions keep the original-atlas fallback available', () => {
  const f = fixture(), gl = gpu(); f.window.document.createElement = () => ({ getContext: () => null });
  assert.equal(f.M.upload(gl, 'people', atlas()), null); assert.equal(gl.calls.length, 0);
  const q = fixture(), h = gpu(); q.window.document.createElement = () => ({ getContext: () => ({ clearRect() {}, drawImage() { throw Error('source not decoded'); } }) });
  assert.equal(q.M.upload(h, 'people', atlas()), null); assert.match(q.M.inspect(h).lastFailure.reason, /source not decoded/); assert.equal(h.calls.filter(c => c[0] === 'delete').length, 1);
});

test('a merged renderer descriptor disposes its owned array exactly once', () => {
  const { M } = fixture(), gl = gpu(), info = M.upload(gl, 'people', atlas()), merged = { ...info, tex: {} };
  assert.equal(M.inspect(gl).liveArrays, 1); assert.equal(M.inspect(gl).bytes, info.bytes);
  assert.equal(M.dispose(gl, merged), true); assert.equal(M.dispose(gl, merged), false); assert.equal(M.inspect(gl).bytes, 0);
  assert.equal(gl.calls.filter(c => c[0] === 'delete').length, 1);
});

test('foreign contexts and forged descriptors cannot delete owned resources', () => {
  const { M } = fixture(), gl = gpu(), other = gpu(), info = M.upload(gl, 'people', atlas());
  assert.equal(M.dispose(other, info), false); assert.equal(M.dispose(gl, { arrayTex: {} }), false); assert(gl.isTexture(info.arrayTex));
});

test('sampler unit five is distinct from the legacy 2D atlas and leaves active texture unchanged', () => {
  const { M } = fixture(), gl = gpu(), info = M.upload(gl, 'people', atlas()), program = { u: { uSpriteLayers: 'array-sampler', uUseSpriteLayers: 'use-array' } };
  const active = gl.getParameter(gl.ACTIVE_TEXTURE); assert.equal(M.bind(gl, program, info), true);
  assert.equal(gl.getParameter(gl.ACTIVE_TEXTURE), active); assert.equal(gl.arrays.get(gl.TEXTURE0 + 5), info.arrayTex);
  assert(gl.calls.some(c => c[0] === 'integer' && c[1] === 'array-sampler' && c[2] === 5));
  assert(gl.calls.some(c => c[0] === 'float' && c[1] === 'use-array' && c[2] === 1));
});

test('legacy sprites share one valid transparent fallback array without enabling array sampling', () => {
  const { M } = fixture(), gl = gpu(), program = { u: { uSpriteLayers: 'sampler', uUseSpriteLayers: 'enabled' } };
  for (let i = 0; i < 20; i++) assert.equal(M.bind(gl, program, { tex: {} }), false);
  assert.equal(gl.calls.filter(c => c[0] === 'create').length, 1); assert.equal(M.inspect(gl).fallbackReady, true);
  assert.equal(M.inspect(gl).bytes, 0); assert(gl.calls.some(c => c[0] === 'float' && c[1] === 'enabled' && c[2] === 0));
  assert.equal(M.fallback(gl), gl.arrays.get(gl.TEXTURE0 + 5));
});

test('legacy fallback failure clears a preceding array draw flag without altering active unit', () => {
  const { M } = fixture(), gl = gpu(), info = M.upload(gl, 'people', atlas());
  const program = { u: { uSpriteLayers: 'sampler', uUseSpriteLayers: 'enabled' } }, active = gl.getParameter(gl.ACTIVE_TEXTURE);
  assert.equal(M.bind(gl, program, info), true); gl.options.noTexture = true;
  assert.equal(M.bind(gl, program, null), false);
  assert.deepEqual(gl.calls.filter(c => c[0] === 'float').at(-1), ['float', 'enabled', 0]);
  assert.equal(gl.getParameter(gl.ACTIVE_TEXTURE), active); assert(gl.isTexture(info.arrayTex));
});

test('legacy proxy is transparent, complete, caller-owned and restores all upload state', () => {
  const { M } = fixture(), gl = gpu(), array = gl.createTexture(), legacy = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, array); gl.bindTexture(gl.TEXTURE_2D, legacy);
  const pixels = [...gl.values], active = gl.getParameter(gl.ACTIVE_TEXTURE), texture = M.proxy(gl);
  assert(gl.isTexture(texture)); assert.notEqual(texture, legacy);
  assert.deepEqual(gl.calls.find(c => c[0] === 'upload2D').slice(-1), [[0, 0, 0, 0]]);
  assert.equal(gl.calls.filter(c => c[0] === 'parameter' && c[1] === gl.TEXTURE_2D).length, 4);
  assert.equal(gl.getParameter(gl.ACTIVE_TEXTURE), active); assert.equal(gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY), array);
  assert.equal(gl.getParameter(gl.TEXTURE_BINDING_2D), legacy); assert.deepEqual([...gl.values], pixels);
  assert.equal(M.inspect(gl).bytes, 0); assert.equal(M.inspect(gl).liveArrays, 0);
  gl.deleteTexture(texture); assert.equal(gl.isTexture(texture), false);
});

test('failed legacy proxy releases partial allocation, retains old bindings and reports its error', () => {
  for (const options of [{ proxyError: true }, { noTexture: true }]) {
    const { M } = fixture(), gl = gpu(options), pixels = [...gl.values], active = gl.getParameter(gl.ACTIVE_TEXTURE);
    assert.equal(M.proxy(gl), null); assert.equal(M.inspect(gl).failures, 1);
    assert.equal(gl.calls.filter(c => c[0] === 'delete').length, options.noTexture ? 0 : 1);
    assert.equal(gl.getParameter(gl.ACTIVE_TEXTURE), active); assert.deepEqual([...gl.values], pixels);
    assert.equal(gl.getParameter(gl.TEXTURE_BINDING_2D), null); assert.equal(gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY), null);
  }
});

test('context restoration invalidates old arrays and creates a new valid fallback', () => {
  const { M } = fixture(), gl = gpu(), info = M.upload(gl, 'people', atlas()), old = M.fallback(gl);
  gl.lose(); gl.restore(); const now = M.fallback(gl);
  assert.notEqual(now, old); assert(gl.isTexture(now)); assert.equal(M.inspect(gl).bytes, 0); assert.equal(M.inspect(gl).liveArrays, 0);
  assert.equal(M.dispose(gl, info), false); assert.equal(M.bind(gl, { u: {} }, info), false);
});

test('diagnostic reads return detached data and the module owns no timers, contexts or retained atlases', () => {
  const { M } = fixture(), gl = gpu({ maxLayers: 3 }); M.upload(gl, 'people', atlas());
  const a = M.inspect(gl); a.lastFailure.reason = 'modified'; assert.notEqual(M.inspect(gl).lastFailure.reason, 'modified');
  assert(Object.isFrozen(M)); assert(Object.isFrozen(M.limits)); assert.equal(M.limits.retainedCpuAtlases, 0);
  assert.doesNotMatch(source, /setTimeout\s*\(|setInterval\s*\(|requestAnimationFrame\s*\(|new\s+AudioContext|fetch\s*\(/);
});
