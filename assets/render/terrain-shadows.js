/* Project the existing long sprite shadows onto the ground they stand on.
 * The caller supplies original sun offset/radius/darkness. This changes only
 * render descriptors: source photographs, terrain, actors and RNG stay owned
 * by the original simulation. Missing cache entries wait for bounded sampling
 * instead of drawing a known-wrong horizontal disc above a hillside. */
(function (root) {
  'use strict';
  const PROFILES = Object.freeze([
    Object.freeze({ count: 128, range: 100, updates: 8 }),
    Object.freeze({ count: 256, range: 140, updates: 12 }),
    Object.freeze({ count: 384, range: 180, updates: 16 })
  ]);
  const LIMITS = Object.freeze({ cache: 1024, samplesPerUpdate: 6, cadence: .30,
    movement: .30, centreMovement: .25, surfaceError: .10, floorTolerance: .12,
    curvature: .10, maxSlope: 2, warmup: .18, lift: .035 });
  const games = new WeakMap(); let terrain = null, revision = 0;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
  const point = p => Array.isArray(p) && [0, 1, 2].every(i => Number.isFinite(p[i]));
  const level = n => clamp(Math.round(finite(n, 1)), 0, 2);
  function configure(options) {
    if (!options || typeof options.terrainH !== 'function') return false;
    if (terrain !== options.terrainH) { terrain = options.terrainH; revision++; }
    return true;
  }
  function clock(game) { return finite(game.pow && game.pow.time, finite(game.t, 0)); }
  function state(game, now, flat) {
    let s = games.get(game);
    if (!s) { s = { cache: new Map(), time: now, world: game.world, flat }; games.set(game, s); }
    if (now < s.time || s.world !== game.world || s.flat !== flat) s.cache.clear();
    s.time = now; s.world = game.world; s.flat = flat;
    s.terrainSamples = 0; s.updates = 0; s.cacheHits = 0; s.skipped = 0; s.count = 0;
    return s;
  }
  function key(sprite) {
    if (sprite.owner && typeof sprite.owner === 'object') return sprite.owner;
    return String(sprite.photoName || 'sprite') + ':' + sprite.p.slice(0, 3).map(n => n.toFixed(3)).join(':');
  }
  function remember(s, id, entry) {
    s.cache.delete(id); s.cache.set(id, entry);
    while (s.cache.size > LIMITS.cache) s.cache.delete(s.cache.keys().next().value);
    return entry;
  }
  function sample(s, x, z) {
    s.terrainSamples++;
    const h = terrain(x, z); return Number.isFinite(h) ? Math.max(0, h) : NaN;
  }
  function reusable(entry, foot, centre, now) {
    if (!entry || entry.revision !== revision) return false;
    const moved = Math.hypot(foot[0] - entry.foot[0], foot[2] - entry.foot[2]);
    const shifted = Math.hypot(centre[0] - entry.centre[0], centre[1] - entry.centre[1]);
    if (Math.abs(foot[1] - entry.foot[1]) > .10 || moved > LIMITS.movement || shifted > LIMITS.centreMovement) return false;
    // Static procedural terrain does not need to be resampled every cadence.
    // A moving actor/centre refreshes its small tangent patch after 300 ms.
    if (now - entry.at >= LIMITS.cadence && (moved > .01 || shifted > .01)) return false;
    if (entry.valid && !entry.floor) {
      const y = entry.foot[1] + (foot[0] - entry.foot[0]) * entry.slope[0] + (foot[2] - entry.foot[2]) * entry.slope[1];
      if (Math.abs(foot[1] - y) > LIMITS.surfaceError) return false;
    }
    return true;
  }
  function surface(s, id, foot, centre, radius, now, budget) {
    const prior = s.cache.get(id);
    if (reusable(prior, foot, centre, now)) {
      s.cacheHits++; remember(s, id, prior); return prior;
    }
    if (!terrain || s.updates >= budget) { s.skipped++; return null; }
    s.updates++;
    const moved = prior ? Math.hypot(foot[0] - prior.foot[0], foot[2] - prior.foot[2], foot[1] - prior.foot[1]) : Infinity;
    const entry = { revision, at: now, createdAt: prior && prior.revision === revision && moved < 5 ? prior.createdAt : now,
      foot: foot.slice(0, 3), centre: centre.slice(), height: foot[1], slope: [0, 0], floor: false, valid: false };
    try {
      const footY = sample(s, foot[0], foot[2]);
      if (!Number.isFinite(footY)) return remember(s, id, entry);
      // Unknown raised floors remain at their own height. POW/camp floors
      // bypass terrain entirely below, preserving roofs and interior slabs.
      if (Math.abs(footY - foot[1]) > LIMITS.floorTolerance) {
        entry.floor = entry.valid = true; return remember(s, id, entry);
      }
      const e = Math.max(.20, radius * .5), x = centre[0], z = centre[1];
      const h = [sample(s, x, z), sample(s, x - e, z), sample(s, x + e, z), sample(s, x, z - e), sample(s, x, z + e)];
      if (!h.every(Number.isFinite)) return remember(s, id, entry);
      const dx = (h[2] - h[1]) / (2 * e), dz = (h[4] - h[3]) / (2 * e);
      const bend = Math.max(Math.abs((h[1] + h[2]) * .5 - h[0]), Math.abs((h[3] + h[4]) * .5 - h[0]));
      // A single plane cannot wrap cliffs/sharp terrain curvature. Omit this
      // approximate shadow there, rather than showing a floating decal.
      if (Math.abs(dx) > LIMITS.maxSlope || Math.abs(dz) > LIMITS.maxSlope || bend > LIMITS.curvature) return remember(s, id, entry);
      entry.height = h[0]; entry.slope = [dx, dz]; entry.valid = true;
    } catch (_) { /* Leave this entry invalid; retry only after movement/change. */ }
    return remember(s, id, entry);
  }
  function collect(game, sprites, options) {
    if (!game || !Array.isArray(sprites)) return [];
    const eye = game.rend && game.rend.eye || game.camPos || game.evade && game.evade.p;
    if (!point(eye)) return [];
    const o = options || {}, profile = PROFILES[level(o.quality)];
    const reach = clamp(finite(o.reach, 0), 0, 4), radius = clamp(finite(o.radius, 1.85), .1, 5);
    const darkness = clamp(finite(o.darkness, .5), 0, 1);
    if (darkness <= 0) return [];
    const ox = clamp(finite(o.ox, 0), -1, 1), oz = clamp(finite(o.oz, 0), -1, 1);
    const flat = !!(game.pow || game.evade && game.evade.camp), now = clock(game), s = state(game, now, flat);
    const candidates = [], seen = new Set();
    for (const sprite of sprites) {
      if (!sprite || !point(sprite.p)) continue;
      const id = key(sprite); if (seen.has(id)) continue; seen.add(id);
      const distance = Math.hypot(sprite.p[0] - eye[0], sprite.p[1] - eye[1], sprite.p[2] - eye[2]);
      if (distance < profile.range) candidates.push({ sprite, id, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const out = [];
    for (const item of candidates.slice(0, profile.count)) {
      const foot = item.sprite.p, centre = [foot[0] + ox * reach * .5, foot[2] + oz * reach * .5];
      const entry = flat ? null : surface(s, item.id, foot, centre, radius, now, profile.updates);
      if (!flat && (!entry || !entry.valid)) continue;
      const slope = flat || entry.floor ? [0, 0] : entry.slope.slice();
      const y = flat || entry.floor ? foot[1] : entry.height + (centre[0] - entry.centre[0]) * slope[0] + (centre[1] - entry.centre[1]) * slope[1];
      const rangeFade = clamp((profile.range - item.distance) / (profile.range * .25), 0, 1);
      const warm = flat ? 1 : clamp((now - entry.createdAt) / LIMITS.warmup, 0, 1);
      if (warm <= 0) continue;
      out.push({ p: [centre[0], y, centre[1]], r: radius, d: darkness * rangeFade * warm,
        slope, lift: LIMITS.lift, terrainShadow: true });
    }
    s.count = out.length; return out;
  }
  function inspect(game) {
    const s = game && games.get(game);
    return s ? { count: s.count, cacheSize: s.cache.size, terrainSamples: s.terrainSamples,
      updates: s.updates, cacheHits: s.cacheHits, skipped: s.skipped, time: s.time } :
      { count: 0, cacheSize: 0, terrainSamples: 0, updates: 0, cacheHits: 0, skipped: 0, time: 0 };
  }
  function reset(game) { return !!game && games.delete(game); }
  root.TerrainShadows = Object.freeze({ configure, collect, inspect, reset, profiles: PROFILES, limits: LIMITS });
})(typeof window !== 'undefined' ? window : globalThis);
