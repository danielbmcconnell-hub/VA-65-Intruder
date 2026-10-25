'use strict';

// Read-only native CSS/alpha probe. It neither alters a source image nor moves
// an element: authored cut edges must already lie outside the actual camera.
module.exports = async function handEdgeBrowser(page, side) {
  if (!['left', 'right'].includes(side)) throw new TypeError('Expected left or right hand');
  return page.evaluate(async side => {
    const arm = document.querySelector('#equipmentHands [data-punch-hand="' + side + '"]');
    if (!arm) throw Error('Missing native hand element: ' + side);
    const css = getComputedStyle(arm), frame = Number(arm.dataset.frame);
    const match = css.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
    if (!match || !Number.isInteger(frame) || frame < 0 || frame > 7) throw Error('Invalid native hand atlas binding');
    const source = new URL(match[1], location.href).href;
    // Keep one read-only alpha/RGBA buffer per source for the entire QA page,
    // rather than allocating a6MB canvas+buffer for every one of16 poses.
    const cache = window.__equipmentEdgeProbeSources || (window.__equipmentEdgeProbeSources = new Map());
    if (!cache.has(source)) cache.set(source, (async () => {
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const iw = canvas.width, ih = canvas.height, ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      const rgba = ctx.getImageData(0, 0, iw, ih).data;
      canvas.width = canvas.height = 1;
      return { rgba, iw, ih };
    })());
    let pixels;
    try { pixels = await cache.get(source); } catch (error) { cache.delete(source); throw error; }
    const { rgba, iw, ih } = pixels;
    const cols = 4, rows = 2, cw = iw / cols, ch = ih / rows, col = frame % cols, row = Math.floor(frame / cols);
    const width = parseFloat(css.width), height = parseFloat(css.height), parent = arm.offsetParent;
    if (!parent || !(width > 0 && height > 0)) throw Error('No native positioned hand geometry');
    const parentRect = parent.getBoundingClientRect(), origin = css.transformOrigin.split(/\s+/).map(Number.parseFloat);
    const left = Number.parseFloat(css.left), top = Number.parseFloat(css.top);
    const base = { x: parentRect.left + (Number.isFinite(left) ? left : arm.offsetLeft), y: parentRect.top + (Number.isFinite(top) ? top : arm.offsetTop) };
    const matrix = new DOMMatrixReadOnly(css.transform === 'none' ? undefined : css.transform);
    const project = (x, y) => {
      const q = matrix.transformPoint(new DOMPoint(x - origin[0], y - origin[1]));
      return { x: base.x + origin[0] + q.x / q.w, y: base.y + origin[1] + q.y / q.w };
    };
    // The source coordinate convention is pixel centres. Bilinear alpha reads
    // preserve fractional443.5px cells; no rounded new image crop is created.
    const alpha = (x, y) => {
      x = Math.max(0, Math.min(iw - 1, x - .5)); y = Math.max(0, Math.min(ih - 1, y - .5));
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(iw - 1, x0 + 1), y1 = Math.min(ih - 1, y0 + 1), fx = x - x0, fy = y - y0;
      const at = (xx, yy) => rgba[(yy * iw + xx) * 4 + 3];
      return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
    };
    const stack = document.getElementById('stack').getBoundingClientRect();
    const camera = { left: Math.max(0, stack.left), top: Math.max(0, stack.top), right: Math.min(innerWidth, stack.right), bottom: Math.min(innerHeight, stack.bottom), margin: 2 };
    const visible = css.display !== 'none' && Number(css.opacity) > 0 && arm.getClientRects().length > 0;
    const counts = { left: 0, right: 0, top: 0, bottom: 0 }, bad = { left: 0, right: 0, top: 0, bottom: 0 }, samples = [];
    const inspect = (edge, sx, sy) => {
      const a = alpha(col * cw + sx, row * ch + sy);
      if (a <= 127.5) return;
      counts[edge]++;
      const q = project(sx / cw * width, sy / ch * height);
      const inside = q.x > camera.left + camera.margin && q.x < camera.right - camera.margin && q.y > camera.top + camera.margin && q.y < camera.bottom - camera.margin;
      if (inside) { bad[edge]++; if (samples.length < 24) samples.push({ edge, sourceX: col * cw + sx, sourceY: row * ch + sy, alpha: a, viewportX: q.x, viewportY: q.y }); }
    };
    // A two-source-pixel strip also catches a cuff cut just inside a cell's
    // nominal boundary; unrelated transparent pixel RGB is never counted.
    for (const inset of [.5, 1.5]) {
      for (let y = .5; y < ch; y++) { inspect('left', inset, y); inspect('right', cw - inset, y); }
      for (let x = .5; x < cw; x++) { inspect('top', x, inset); inspect('bottom', x, ch - inset); }
    }
    const badEdgePixels = Object.values(bad).reduce((sum, n) => sum + n, 0);
    return { passed: visible && badEdgePixels === 0, side, frame, visible, source, sourceSize: [iw, ih], sourceCacheEntries: cache.size, columns: cols, rows, alphaThreshold: .5, sourceBorderStrip: 2,
      opaqueBorderSamples: counts, visibleCutoffSamples: bad, badEdgePixels, badSamples: samples, camera,
      css: { left: css.left, right: css.right, top: css.top, bottom: css.bottom, width: css.width, height: css.height, transform: css.transform, transformOrigin: css.transformOrigin, backgroundPosition: css.backgroundPosition, backgroundSize: css.backgroundSize },
      layout: { offsetLeft: arm.offsetLeft, offsetTop: arm.offsetTop, base, origin, parentRect: { x: parentRect.x, y: parentRect.y, width: parentRect.width, height: parentRect.height } },
      scope: 'Actual decoded atlas alpha mapped through native CSS transform. Read-only source analysis; no image edits, actor pose assignment, or element style changes.' };
  }, side);
};
