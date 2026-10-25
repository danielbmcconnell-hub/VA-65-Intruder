'use strict';

// Read-only complement to hand-edge-browser for a complete held-item image.
// This detects an authored sleeve boundary floating inside the actual camera;
// it does not require the shoulder/stock to remain inside an FPS camera frame.
module.exports = async function heldEquipmentEdgeBrowser(page) {
  return page.evaluate(async () => {
    const img = document.getElementById('weaponArt'), viewport = document.getElementById('weaponViewport');
    if (!img || !viewport) throw Error('Missing native held-equipment layer');
    await img.decode();
    const css = getComputedStyle(img), pcs = getComputedStyle(viewport), iw = img.naturalWidth, ih = img.naturalHeight;
    if (!(iw > 0 && ih > 0)) throw Error('Native held photograph is not decoded');
    const source = img.currentSrc || img.src, cache = window.__equipmentEdgeProbeSources || (window.__equipmentEdgeProbeSources = new Map());
    if (!cache.has(source)) cache.set(source, Promise.resolve().then(() => {
      const canvas = document.createElement('canvas'); canvas.width = iw; canvas.height = ih;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
      const rgba = ctx.getImageData(0, 0, iw, ih).data; canvas.width = canvas.height = 1;
      return { rgba, iw, ih };
    }));
    let pixels;
    try { pixels = await cache.get(source); } catch (error) { cache.delete(source); throw error; }
    const data = pixels.rgba;
    const parent = img.offsetParent, parentRect = parent.getBoundingClientRect();
    const parentMatrix = new DOMMatrixReadOnly(pcs.transform === 'none' ? undefined : pcs.transform);
    if (Math.abs(parentMatrix.a - 1) > 1e-6 || Math.abs(parentMatrix.b) > 1e-6 || Math.abs(parentMatrix.c) > 1e-6 || Math.abs(parentMatrix.d - 1) > 1e-6) throw Error('Held probe requires translation-only viewport transform; actual parent rotation needs explicit composition');
    const width = parseFloat(css.width), height = parseFloat(css.height), scale = Math.min(width / iw, height / ih);
    if (css.objectFit !== 'contain') throw Error('Unexpected held-image object-fit: ' + css.objectFit);
    const content = { left: (width - iw * scale) / 2, top: height - ih * scale, width: iw * scale, height: ih * scale };
    const origin = css.transformOrigin.split(/\s+/).map(Number.parseFloat), matrix = new DOMMatrixReadOnly(css.transform === 'none' ? undefined : css.transform);
    const left = parseFloat(css.left), top = parseFloat(css.top);
    const base = { x: parentRect.left + (Number.isFinite(left) ? left : img.offsetLeft), y: parentRect.top + (Number.isFinite(top) ? top : img.offsetTop) };
    const project = (sx, sy) => {
      const q = matrix.transformPoint(new DOMPoint(content.left + sx * scale - origin[0], content.top + sy * scale - origin[1]));
      return { x: base.x + origin[0] + q.x / q.w, y: base.y + origin[1] + q.y / q.w };
    };
    const stack = document.getElementById('stack').getBoundingClientRect(), camera = { left: Math.max(0, stack.left), top: Math.max(0, stack.top), right: Math.min(innerWidth, stack.right), bottom: Math.min(innerHeight, stack.bottom), margin: 2 };
    const visible = pcs.display !== 'none' && css.display !== 'none' && css.visibility !== 'hidden' && Number(css.opacity) > 0 && img.getClientRects().length > 0;
    const counts = { left: 0, right: 0, top: 0, bottom: 0 }, bad = { left: 0, right: 0, top: 0, bottom: 0 }, samples = [];
    const inspect = (edge, x, y) => {
      const a = data[(y * iw + x) * 4 + 3]; if (a <= 127.5) return;
      counts[edge]++; const q = project(x + .5, y + .5);
      if (q.x > camera.left + 2 && q.x < camera.right - 2 && q.y > camera.top + 2 && q.y < camera.bottom - 2) {
        bad[edge]++; if (samples.length < 24) samples.push({ edge, sourceX: x, sourceY: y, alpha: a, viewportX: q.x, viewportY: q.y });
      }
    };
    for (const inset of [0, 1]) {
      for (let y = 0; y < ih; y++) { inspect('left', inset, y); inspect('right', iw - 1 - inset, y); }
      for (let x = 0; x < iw; x++) { inspect('top', x, inset); inspect('bottom', x, ih - 1 - inset); }
    }
    const badEdgePixels = Object.values(bad).reduce((n, q) => n + q, 0);
    return { passed: visible && badEdgePixels === 0, mode: viewport.dataset.weapon, visible, source, sourceSize: [iw, ih], sourceCacheEntries: cache.size, alphaThreshold: .5, sourceBorderStrip: 2,
      opaqueBorderSamples: counts, visibleCutoffSamples: bad, badEdgePixels, badSamples: samples, camera, content,
      css: { imageTransform: css.transform, imageOrigin: css.transformOrigin, objectFit: css.objectFit, objectPosition: css.objectPosition, imageWidth: css.width, imageHeight: css.height, viewportLeft: pcs.left, viewportRight: pcs.right, viewportBottom: pcs.bottom, viewportTransform: pcs.transform },
      layout: { base, origin, parentRect: { x: parentRect.x, y: parentRect.y, width: parentRect.width, height: parentRect.height } },
      scope: 'Actual complete held-photograph alpha through native CSS object-fit and transform. Read-only: no source/style edits or actor assignments. Source sleeve boundaries must lie outside the camera; this does not assert every stock/shoulder is on screen.' };
  });
};
