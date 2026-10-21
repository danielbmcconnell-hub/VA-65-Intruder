/* Frame-isolated sprite mipmaps for the existing WebGL2 renderer.
 * Source photographs and atlas files are never changed. Each original frame
 * gets its own array layer, so filtering cannot borrow a neighbour's face,
 * pose or vegetation. Uploaded RGB is premultiplied only for GPU sampling.
 * The caller retains the normal atlas fallback when allocation is unavailable.
 */
(function (root) {
  'use strict';
  const SPECS = Object.freeze({ people: Object.freeze([8, 9]), photo_vegetation: Object.freeze([8, 6]) });
  const MAX_BYTES = 32 * 1024 * 1024, UNIT = 5;
  const contexts = new WeakMap(), owners = new WeakMap();
  function layout(name, w, h) {
    if (!Object.prototype.hasOwnProperty.call(SPECS, name) || !Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w <= 0 || h <= 0) return null;
    const [cols, rows] = SPECS[name];
    if (w % cols || h % rows) return null;
    const width = w / cols, height = h / rows, layers = cols * rows;
    const levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
    let bytes = 0;
    for (let i = 0; i < levels; i++) bytes += Math.max(1, Math.floor(width / 2 ** i)) * Math.max(1, Math.floor(height / 2 ** i)) * layers * 4;
    if (!Number.isSafeInteger(bytes) || bytes > MAX_BYTES) return null;
    return { w, h, cols, rows, width, height, layers, levels, bytes };
  }
  function state(gl) {
    let s = contexts.get(gl);
    if (!s) { s = { uploads: 0, failures: 0, lastFailure: null, live: new Set(), bytes: 0, fallback: null }; contexts.set(gl, s); }
    // A restored context may keep its JS identity, but its former textures
    // have ceased to exist. Do not count or rebind those lost GPU allocations.
    if (!gl.isContextLost()) {
      for (const record of s.live) if (!gl.isTexture(record.texture)) {
        record.disposed = true; s.bytes -= record.bytes; s.live.delete(record);
      }
      if (s.fallback && !gl.isTexture(s.fallback)) s.fallback = null;
    }
    return s;
  }
  function fail(gl, reason, error = 0) {
    const s = state(gl); s.failures++; s.lastFailure = { reason, error };
    return null;
  }
  function preserve(gl) {
    const pixels = [gl.UNPACK_FLIP_Y_WEBGL, gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, gl.UNPACK_ALIGNMENT,
      gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT, gl.UNPACK_SKIP_PIXELS, gl.UNPACK_SKIP_ROWS, gl.UNPACK_SKIP_IMAGES];
    return { active: gl.getParameter(gl.ACTIVE_TEXTURE), binding: gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY),
      pixels: pixels.map(key => [key, gl.getParameter(key)]) };
  }
  function restore(gl, before) {
    for (const [key, value] of before.pixels) gl.pixelStorei(key, value);
    gl.activeTexture(before.active); gl.bindTexture(gl.TEXTURE_2D_ARRAY, before.binding);
  }
  function unpack(gl, premultiplied) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplied);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    for (const key of [gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT, gl.UNPACK_SKIP_PIXELS, gl.UNPACK_SKIP_ROWS, gl.UNPACK_SKIP_IMAGES]) gl.pixelStorei(key, 0);
  }
  function parameters(gl, mipmaps) {
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, key, gl.CLAMP_TO_EDGE);
  }
  function surface(width, height) {
    const canvas = root.document && root.document.createElement ? root.document.createElement('canvas')
      : typeof root.OffscreenCanvas === 'function' ? new root.OffscreenCanvas(width, height) : null;
    if (!canvas) return null;
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false; // Crop at native resolution, without a resample.
    return { canvas, ctx };
  }
  function upload(gl, name, source) {
    if (!gl || typeof gl.texStorage3D !== 'function' || typeof gl.texSubImage3D !== 'function' || gl.isContextLost()) return null;
    const shape = source && layout(name, source.naturalWidth || source.width, source.naturalHeight || source.height);
    if (!shape) return null;
    // WebGL's error flag cannot be restored. Report an existing caller error
    // explicitly and stop before allocation rather than clearing it and then
    // misreporting our successful storage call as the cause of that error.
    const pending = gl.getError();
    if (pending !== gl.NO_ERROR) return fail(gl, 'Pre-existing WebGL error prevented texture-array upload', pending);
    if (shape.width > gl.getParameter(gl.MAX_TEXTURE_SIZE) || shape.height > gl.getParameter(gl.MAX_TEXTURE_SIZE)
      || shape.layers > gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)) return fail(gl, 'Texture-array limits do not cover the supplied frames');
    const crop = surface(shape.width, shape.height);
    if (!crop) return fail(gl, 'A native-size frame canvas is unavailable');
    const before = preserve(gl); let texture = null, complete = false, path = 'canvas-premultiplied';
    try {
      texture = gl.createTexture();
      if (!texture) return fail(gl, 'Texture-array allocation returned no texture');
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, shape.levels, gl.RGBA8, shape.width, shape.height, shape.layers);
      let error = gl.getError();
      if (error !== gl.NO_ERROR) return fail(gl, 'Texture-array storage allocation failed', error);
      unpack(gl, true);
      for (let layer = 0; layer < shape.layers; layer++) {
        crop.ctx.clearRect(0, 0, shape.width, shape.height);
        crop.ctx.drawImage(source, layer % shape.cols * shape.width, Math.floor(layer / shape.cols) * shape.height,
          shape.width, shape.height, 0, 0, shape.width, shape.height);
        if (path === 'canvas-premultiplied') {
          gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, shape.width, shape.height, 1, gl.RGBA, gl.UNSIGNED_BYTE, crop.canvas);
          error = gl.getError();
          // Some implementations cannot convert DOM pixels for an array.
          // Retry that frame with explicit temporary premultiplication; the
          // unmodified source canvas/file is never written back or replaced.
          if (error !== gl.NO_ERROR) { path = 'typed-premultiplied'; unpack(gl, false); }
        }
        if (path === 'typed-premultiplied') {
          const pixels = crop.ctx.getImageData(0, 0, shape.width, shape.height).data;
          for (let i = 0; i < pixels.length; i += 4) {
            const alpha = pixels[i + 3] / 255;
            pixels[i] = Math.round(pixels[i] * alpha); pixels[i + 1] = Math.round(pixels[i + 1] * alpha); pixels[i + 2] = Math.round(pixels[i + 2] * alpha);
          }
          gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, shape.width, shape.height, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          error = gl.getError();
          if (error !== gl.NO_ERROR) return fail(gl, 'Texture-array frame upload failed', error);
        }
      }
      parameters(gl, true); gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      error = gl.getError();
      if (error !== gl.NO_ERROR) return fail(gl, 'Isolated-frame mipmap generation failed', error);
      const s = state(gl), record = { gl, texture, bytes: shape.bytes, disposed: false };
      owners.set(texture, record); s.live.add(record); s.bytes += record.bytes; s.uploads++; complete = true;
      return { ...shape, arrayTex: texture, premultiplied: true, uploadPath: path };
    } catch (error) { return fail(gl, 'Texture-array upload exception: ' + String(error && error.message || error).slice(0, 140)); }
    finally {
      if (!complete && texture) gl.deleteTexture(texture);
      restore(gl, before);
      // Canvas backing storage is temporary; no CPU atlas copy is cached.
      crop.canvas.width = crop.canvas.height = 1;
    }
  }
  function fallback(gl) {
    if (!gl || gl.isContextLost()) return null;
    const s = state(gl); if (s.fallback) return s.fallback;
    const pending = gl.getError();
    if (pending !== gl.NO_ERROR) return fail(gl, 'Pre-existing WebGL error prevented fallback-array upload', pending);
    const before = preserve(gl); let texture = null, complete = false;
    try {
      texture = gl.createTexture(); if (!texture) return fail(gl, 'Fallback-array allocation returned no texture');
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture); unpack(gl, false);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 1, 1, 1);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      parameters(gl, false);
      const error = gl.getError(); if (error !== gl.NO_ERROR) return fail(gl, 'Fallback-array allocation failed', error);
      s.fallback = texture; complete = true; return texture;
    } finally { if (!complete && texture) gl.deleteTexture(texture); restore(gl, before); }
  }
  // The renderer owns this four-byte legacy sampler placeholder. Its creation
  // must not inherit caller row/skip unpack settings restored by upload().
  function proxy(gl) {
    if (!gl || gl.isContextLost()) return null;
    const pending = gl.getError();
    if (pending !== gl.NO_ERROR) return fail(gl, 'Pre-existing WebGL error prevented legacy-proxy upload', pending);
    const before = preserve(gl), binding = gl.getParameter(gl.TEXTURE_BINDING_2D);
    let texture = null, complete = false;
    try {
      texture = gl.createTexture(); if (!texture) return fail(gl, 'Legacy-proxy allocation returned no texture');
      gl.bindTexture(gl.TEXTURE_2D, texture); unpack(gl, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) return fail(gl, 'Legacy-proxy upload failed', error);
      complete = true; return texture;
    } catch (error) { return fail(gl, 'Legacy-proxy upload exception: ' + String(error && error.message || error).slice(0, 140)); }
    finally {
      if (!complete && texture) gl.deleteTexture(texture);
      restore(gl, before); gl.bindTexture(gl.TEXTURE_2D, binding);
    }
  }
  function bind(gl, program, info) {
    if (!gl || gl.isContextLost() || !program || !program.u) return false;
    const record = info && info.arrayTex && owners.get(info.arrayTex);
    const enabled = !!(record && record.gl === gl && !record.disposed && gl.isTexture(record.texture));
    // Clear a preceding array draw's flag even if fallback allocation fails.
    if (program.u.uSpriteLayers != null) gl.uniform1i(program.u.uSpriteLayers, UNIT);
    if (program.u.uUseSpriteLayers != null) gl.uniform1f(program.u.uUseSpriteLayers, enabled ? 1 : 0);
    const texture = enabled ? record.texture : fallback(gl); if (!texture) return false;
    const active = gl.getParameter(gl.ACTIVE_TEXTURE);
    gl.activeTexture(gl.TEXTURE0 + UNIT); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.activeTexture(active); return enabled;
  }
  function dispose(gl, info) {
    const record = info && info.arrayTex && owners.get(info.arrayTex);
    if (!record || record.gl !== gl || record.disposed) return false;
    const s = state(gl);
    if (record.disposed) return false;
    gl.deleteTexture(record.texture); record.disposed = true; s.live.delete(record); s.bytes -= record.bytes; return true;
  }
  function inspect(gl) {
    const s = state(gl);
    return { uploads: s.uploads, liveArrays: s.live.size, bytes: s.bytes, fallbackReady: !!s.fallback,
      failures: s.failures, lastFailure: s.lastFailure ? { ...s.lastFailure } : null };
  }
  root.SpriteLayers = Object.freeze({ upload, layout, bind, dispose, fallback, proxy, inspect,
    limits: Object.freeze({ bytesPerArray: MAX_BYTES, textureUnit: UNIT, maxLayers: 72, retainedCpuAtlases: 0 }) });
})(typeof window !== 'undefined' ? window : globalThis);
