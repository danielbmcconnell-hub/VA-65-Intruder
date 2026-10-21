'use strict';
// Real WebGL2 upload/filtering tests. The generated colour atlas is an explicit
// GPU fixture; gameplay photographs and gameplay screenshots are tested separately.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function run(browser, target, evidenceDir) {
  const results = [];
  for (const profile of [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { name: 'iphone-layout', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ]) {
    const { name, ...options } = profile;
    const context = await browser.newContext(options);
    const page = await context.newPage();
    try {
      await page.route('**/__sprite_layer_test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Explicit synthetic WebGL2 sprite-array fixture</title><script src="/assets/render/sprite-layers.js"></script>' }));
      await page.goto(new URL('__sprite_layer_test', target).href);
      const data = await page.evaluate(async () => {
        const checks = [], check = (ok, detail) => { if (!ok) throw new Error(detail); checks.push(detail); };
        const near = (actual, expected, tolerance = 2) => expected.every((value, i) => Math.abs(actual[i] - value) <= tolerance);
        const M = window.SpriteLayers, canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32; document.body.appendChild(canvas);
        const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
        check(!!gl, 'Actual browser WebGL2 context available');
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const source = document.createElement('canvas'); source.width = 64; source.height = 72;
        const ctx = source.getContext('2d', { willReadFrequently: true }), colours = [];
        for (let layer = 0; layer < 72; layer++) {
          const x = layer % 8 * 8, y = Math.floor(layer / 8) * 8;
          ctx.fillStyle = layer === 4 ? 'rgba(200,80,40,0.5019607843137255)' : `rgb(${23 + layer * 31 % 220},${17 + layer * 67 % 230},${11 + layer * 97 % 240})`;
          ctx.fillRect(x, y, 8, 8);
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          colours.push([Math.round(pixel[0] * pixel[3] / 255), Math.round(pixel[1] * pixel[3] / 255), Math.round(pixel[2] * pixel[3] / 255), pixel[3]]);
        }
        const sourceBefore = source.toDataURL();
        const unpack = [gl.UNPACK_FLIP_Y_WEBGL, gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, gl.UNPACK_ALIGNMENT, gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT, gl.UNPACK_SKIP_PIXELS, gl.UNPACK_SKIP_ROWS, gl.UNPACK_SKIP_IMAGES];
        const unpackValues = [true, false, 8, 13, 15, 2, 3, 1];
        gl.activeTexture(gl.TEXTURE0 + 3);
        const sentinel = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, sentinel);
        const sentinel2D = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, sentinel2D);
        unpack.forEach((key, i) => gl.pixelStorei(key, unpackValues[i]));
        const before = () => [gl.getParameter(gl.ACTIVE_TEXTURE), gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY), ...unpack.map(key => gl.getParameter(key))];
        const saved = before(), info = M.upload(gl, 'people', source), after = before();
        check(!!info && gl.isTexture(info.arrayTex), 'Actual texStorage3D/texSubImage3D upload succeeded');
        check(info.layers === 72 && info.width === 8 && info.height === 8 && info.levels === 4, 'All 72 exact synthetic frames and full mip chain allocated');
        check(saved.every((value, i) => value === after[i]), 'Upload restores active unit, array binding and all unpack state');
        check(sourceBefore === source.toDataURL(), 'Upload leaves source canvas pixels unchanged');
        check(gl.getError() === gl.NO_ERROR, 'Upload leaves no WebGL errors');
        const proxyBefore = before(), proxy = M.proxy(gl), proxyAfter = before();
        check(!!proxy && gl.isTexture(proxy), 'Legacy proxy uploads despite deliberately nondefault row/skip/alignment unpack state');
        check(proxyBefore.every((value, i) => value === proxyAfter[i]) && gl.getParameter(gl.TEXTURE_BINDING_2D) === sentinel2D,
          'Legacy proxy restores all unpack state, active unit and both texture bindings');
        check(gl.getError() === gl.NO_ERROR, 'Legacy proxy creation leaves no WebGL errors');
        const frame = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, proxy, 0);
        check(gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE, 'Actual 1x1 legacy proxy is framebuffer complete');
        const proxyPixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, proxyPixel);
        check(near(proxyPixel, [0, 0, 0, 0], 0), 'Actual legacy proxy contains transparent RGBA pixels');
        for (const layer of [0, 4, 7, 8, 35, 71]) {
          gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, info.arrayTex, 0, layer);
          check(gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE, `Layer ${layer} is framebuffer complete`);
          const pixel = new Uint8Array(4); gl.readPixels(3, 3, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          check(near(pixel, colours[layer]), `Layer ${layer} retains source frame colour and premultiplied alpha`);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        function shader(type, text) {
          const handle = gl.createShader(type); gl.shaderSource(handle, text); gl.compileShader(handle);
          check(gl.getShaderParameter(handle, gl.COMPILE_STATUS), 'GPU fixture shader compiles: ' + (type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'));
          return handle;
        }
        const program = gl.createProgram();
        const vertex = shader(gl.VERTEX_SHADER, '#version 300 es\nprecision highp float;out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}');
        const fragment = shader(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;precision highp sampler2DArray;in vec2 uv;uniform sampler2DArray uSpriteLayers;uniform sampler2D atlas;uniform float uUseSpriteLayers;uniform float layer;uniform float lod;out vec4 colour;void main(){colour=uUseSpriteLayers>.5?textureLod(uSpriteLayers,vec3(uv,layer),lod):texture(atlas,uv);}');
        gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
        check(gl.getProgramParameter(program, gl.LINK_STATUS), 'Actual mixed 2D/array sampler fixture links'); gl.useProgram(program);
        const u = Object.fromEntries(['uSpriteLayers', 'uUseSpriteLayers', 'atlas', 'layer', 'lod'].map(key => [key, gl.getUniformLocation(program, key)]));
        // Distinct legacy 2D sampler 0 and array sampler 5 prevent sampler-type conflicts.
        gl.activeTexture(gl.TEXTURE0); const legacy = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, legacy);
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0); gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([19, 47, 83, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.uniform1i(u.atlas, 0);
        gl.activeTexture(gl.TEXTURE0 + 7);
        check(M.bind(gl, { u }, info), 'Owned sprite texture enables array sampling');
        check(gl.getParameter(gl.ACTIVE_TEXTURE) === gl.TEXTURE0 + 7 && gl.getUniform(program, u.uSpriteLayers) === 5, 'Bind preserves active unit and uses dedicated sampler unit 5');
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.viewport(0, 0, 32, 32);
        gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
        for (const layer of [0, 4, 7, 8, 35, 71]) for (const lod of [0, 1, 2, 3]) {
          gl.uniform1f(u.layer, layer); gl.uniform1f(u.lod, lod); gl.drawArrays(gl.TRIANGLES, 0, 3);
          const pixel = new Uint8Array(4); gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          check(near(pixel, colours[layer]), `Actual sampler layer ${layer}, mip ${lod} has no neighbouring-frame colour bleed`);
        }
        check(gl.getError() === gl.NO_ERROR, 'All real array/mipmap draw calls are error-free');
        check(!M.bind(gl, { u }, null) && gl.getUniform(program, u.uUseSpriteLayers) === 0, 'Legacy draw disables array branch while binding complete transparent fallback');
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const legacyPixel = new Uint8Array(4); gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, legacyPixel);
        check(near(legacyPixel, [19, 47, 83, 255]) && gl.getError() === gl.NO_ERROR, 'Legacy 2D atlas draw succeeds with both sampler types active');
        const fallback = M.fallback(gl); gl.bindFramebuffer(gl.FRAMEBUFFER, frame); gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, fallback, 0, 0);
        const transparent = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, transparent);
        check(near(transparent, [0, 0, 0, 0], 0), 'Shared fallback array actually contains transparent RGBA pixels'); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const replacement = M.upload(gl, 'people', source);
        check(!!replacement && M.inspect(gl).liveArrays === 2 && M.inspect(gl).bytes === info.bytes * 2, 'Replacement upload has separately owned and accurately counted GPU storage');
        check(M.dispose(gl, info) && !gl.isTexture(info.arrayTex) && !M.dispose(gl, info), 'Replaced texture releases once, without deleting replacement');
        check(gl.isTexture(replacement.arrayTex) && M.dispose(gl, replacement) && M.inspect(gl).bytes === 0, 'Final owner release leaves zero atlas bytes');
        // Native photographic sizes verify real allocation limits and the temporary
        // crop path. Colour/fidelity in the game is verified by the visual suite.
        const native = [];
        for (const [name, url] of [['people', '/assets/figures-original.png'], ['photo_vegetation', '/assets/processed/vegetation.webp']]) {
          const image = new Image(); image.src = url; await image.decode();
          const uploaded = M.upload(gl, name, image);
          check(!!uploaded && gl.isTexture(uploaded.arrayTex), `Actual native photographic ${name} atlas uploads and mipmaps`);
          native.push({ name, width: uploaded.width, height: uploaded.height, layers: uploaded.layers, bytes: uploaded.bytes, uploadPath: uploaded.uploadPath });
          M.dispose(gl, uploaded);
        }
        check(M.inspect(gl).liveArrays === 0 && M.inspect(gl).failures === 0 && gl.getError() === gl.NO_ERROR, 'Native upload/release cycle leaves zero live arrays or GPU errors');
        gl.deleteTexture(proxy); check(!gl.isTexture(proxy), 'Caller can release its legacy proxy independently of atlas ownership');
        const errorCanvas = document.createElement('canvas'), callerGl = errorCanvas.getContext('webgl2');
        callerGl.bindTexture(-1, null); // Deliberate caller INVALID_ENUM, on an isolated context.
        check(M.upload(callerGl, 'people', source) === null && M.inspect(callerGl).uploads === 0
          && M.inspect(callerGl).lastFailure.error === callerGl.INVALID_ENUM
          && /Pre-existing/.test(M.inspect(callerGl).lastFailure.reason), 'Actual pre-existing caller GL error is diagnosed before array allocation');
        const releaseErrorContext = callerGl.getExtension('WEBGL_lose_context'); if (releaseErrorContext) releaseErrorContext.loseContext();
        let contextRestoration = 'unsupported';
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) {
          const stale = M.upload(gl, 'people', source);
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Context restoration timed out')), 10000);
            canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); setTimeout(() => lose.restoreContext(), 25); }, { once: true });
            canvas.addEventListener('webglcontextrestored', () => { clearTimeout(timer); resolve(); }, { once: true }); lose.loseContext();
          });
          check(!gl.isTexture(stale.arrayTex) && M.inspect(gl).liveArrays === 0 && M.inspect(gl).bytes === 0, 'Actual context restoration invalidates and prunes former atlas ownership');
          const recovered = M.upload(gl, 'people', source);
          check(!!recovered && gl.isTexture(recovered.arrayTex) && !!M.fallback(gl), 'Atlas and complete fallback recreate after actual context restoration');
          M.dispose(gl, recovered); contextRestoration = 'passed';
        }
        return { renderer, checks: checks.length, details: checks, uploadPath: info.uploadPath, native, contextRestoration, final: M.inspect(gl), physicalIPhoneTested: false };
      });
      results.push({ profile: name, ...data });
      assert.equal(data.final.liveArrays, 0);
      assert.equal(data.final.failures, 0);
    } finally { await context.close(); }
  }
  if (evidenceDir) { await fs.mkdir(evidenceDir, { recursive: true }); await fs.writeFile(path.join(evidenceDir, 'sprite-layer-upload-browser.json'), JSON.stringify(results, null, 2) + '\n'); }
  return results;
}
module.exports = run;
if (require.main === module) (async () => {
  const { chromium } = require('playwright'), { createServer } = require('../tools/dev-server.cjs');
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const result = await run(browser, `http://127.0.0.1:${server.address().port}/`, process.argv[2]);
    console.log(JSON.stringify(result.map(({ details, ...summary }) => summary), null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
