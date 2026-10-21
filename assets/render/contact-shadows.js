/* Small ambient contact cores beneath nearby photographic NPCs. The original
 * long cast shadows, lighting, source photographs and actor simulation remain
 * authoritative. One bounded descriptor list joins the existing blob pass. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({ low: 12, medium: 18, high: 24, cache: 96, range: 60, fadeStart: 35, cadence: .25, samplesPerCore: 4 });
  const KINDS = new Set(['guard', 'guardAim', 'sentry', 'nva', 'militia', 'vc', 'vcFem', 'female_vc', 'farmer', 'villager']);
  const PHOTOS = new Set(['nva', 'militia', 'female_vc', 'farmer']);
  let terrain = null, revision = 0;
  const games = new WeakMap();
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const point = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const smooth = (lo, hi, n) => { const t = clamp((n - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
  function configure(options) {
    if (!options || typeof options.terrainH !== 'function') return false;
    if (terrain !== options.terrainH) { terrain = options.terrainH; revision++; }
    return true;
  }
  function clock(game) { return finite(game.pow && game.pow.time, finite(game.t)); }
  function group(game, now) {
    let s = games.get(game);
    if (!s) { s = { cache: new Map(), time: now, samples: 0, count: 0 }; games.set(game, s); }
    if (now < s.time) s.cache.clear();
    s.time = now; s.samples = 0; s.count = 0; return s;
  }
  function supported(sprite) {
    if (!sprite || !sprite.useCleanFigure || !point(sprite.p) || !Array.isArray(sprite.motion) || ![0, 1, 2, 3].every(i => Number.isFinite(sprite.motion[i]))) return false;
    const actor = sprite.owner;
    if (actor) return KINDS.has(actor.kind) && actor.alive !== false;
    return PHOTOS.has(sprite.photoName);
  }
  function key(sprite) {
    if (sprite.owner && typeof sprite.owner === 'object') return sprite.owner;
    return sprite.photoName + ':' + sprite.p.slice(0, 3).map(n => Math.round(n * 4)).join(':');
  }
  function surface(game, sprite, state, now) {
    const p = sprite.p, id = key(sprite), flat = !!(game.pow || game.evade && game.evade.camp);
    let entry = state.cache.get(id);
    const moved = entry ? Math.hypot(entry.p[0] - p[0], entry.p[2] - p[2]) : Infinity;
    const surfaceError = entry ? Math.abs(p[1] - entry.p[1] - (p[0] - entry.p[0]) * entry.slope[0] - (p[2] - entry.p[2]) * entry.slope[1]) : Infinity;
    if (entry && entry.revision === revision && entry.flat === flat && Math.abs(entry.p[1] - p[1]) < .4 && surfaceError <= .18 && moved < 4 && now - entry.at < LIMITS.cadence) {
      // Keep frequently used actors when bounded LRU eviction is necessary.
      state.cache.delete(id); state.cache.set(id, entry); return entry.slope.slice();
    }
    let slope = [0, 0];
    if (!flat && terrain) {
      const e = .28;
      let h;
      try {
        h = [[p[0] - e, p[2]], [p[0] + e, p[2]], [p[0], p[2] - e], [p[0], p[2] + e]].map(q => {
          state.samples++; const y = terrain(q[0], q[1]); return Number.isFinite(y) ? Math.max(0, y) : NaN;
        });
      } catch (_) { h = [NaN]; }
      // The four samples estimate both the centre height and local tangent.
      // An elevated floor must retain its own height and remain horizontal.
      if (h.length === 4 && h.every(Number.isFinite) && Math.abs((h[0] + h[1] + h[2] + h[3]) * .25 - p[1]) <= .18) {
        const dx = (h[1] - h[0]) / (2 * e), dz = (h[3] - h[2]) / (2 * e);
        if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) slope = [dx, dz];
      }
    }
    entry = { at: now, p: p.slice(0, 3), slope, flat, revision };
    state.cache.delete(id); state.cache.set(id, entry);
    while (state.cache.size > LIMITS.cache) state.cache.delete(state.cache.keys().next().value);
    return slope.slice();
  }
  function collect(game, sprites, quality) {
    if (!game || !game.evade || !Array.isArray(sprites)) return [];
    const eye = game.rend && game.rend.eye || game.camPos || game.evade.p;
    if (!point(eye)) return [];
    const now = clock(game), state = group(game, now), candidates = [], seen = new Set();
    const cap = quality === 0 ? LIMITS.low : quality === 2 ? LIMITS.high : LIMITS.medium;
    for (const sprite of sprites) {
      if (!supported(sprite)) continue;
      const id = key(sprite); if (seen.has(id)) continue; seen.add(id);
      const distance = Math.hypot(sprite.p[0] - eye[0], sprite.p[1] - eye[1], sprite.p[2] - eye[2]);
      if (distance >= LIMITS.range) continue;
      candidates.push({ sprite, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const result = [], night = !!(game.atm && game.atm.night);
    for (const item of candidates.slice(0, cap)) {
      const fade = 1 - smooth(LIMITS.fadeStart, LIMITS.range, item.distance);
      if (fade <= .001) continue;
      result.push({ p: item.sprite.p.slice(0, 3), r: .55, sx: .88, d: (night ? .14 : .24) * fade,
        slope: surface(game, item.sprite, state, now), lift: .012, contact: true });
    }
    state.count = result.length; return result;
  }
  function inspect(game) {
    const s = game && games.get(game);
    return s ? { count: s.count, cacheSize: s.cache.size, terrainSamples: s.samples, time: s.time } : { count: 0, cacheSize: 0, terrainSamples: 0, time: 0 };
  }
  function reset(game) { return !!game && games.delete(game); }
  root.ContactShadows = Object.freeze({ configure, collect, inspect, reset, limits: LIMITS });
})(typeof window !== 'undefined' ? window : globalThis);
