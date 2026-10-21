/* Ground weapon eligibility and hit reactions. The original trigger, ammunition,
 * random accuracy, wounds, witness response and flight simulation stay owned by
 * Game. Body capsules approximate the supplied photo silhouettes; this is not
 * per-pixel collision or a replacement ballistics engine. */
(function (root) {
  'use strict';
  const EPS = 1e-9, RANGE = 60, ASSIST_ANGLE = .035, MAX_PADDING = .16, FRICTION = 7.5, MAX_TERRAIN_SAMPLES = 240;
  const point = p => Array.isArray(p) && [0,1,2].every(i => Number.isFinite(p[i]));
  const finite = (n, otherwise = 0) => Number.isFinite(n) ? n : otherwise;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function direction(e) {
    const heading = finite(e && e.hdg), look = finite(e && e.look), c = Math.cos(look);
    const d = [Math.sin(heading) * c, -.04 + Math.sin(look), -Math.cos(heading) * c], n = Math.hypot(...d);
    return d.map(x => x / n);
  }
  // Earliest non-negative intersection with the union of a bounded vertical
  // cylinder and its two spherical caps. It also handles a vertical ray or an
  // origin already inside the capsule without dividing by a tiny coefficient.
  function capsule(origin, dir, x, z, bottom, height, radius, padding = 0) {
    const r = radius + padding, lo = bottom + radius, hi = bottom + height - radius;
    const ox = origin[0] - x, oz = origin[2] - z, nearY = clamp(origin[1], lo, hi);
    if (ox * ox + oz * oz + (origin[1] - nearY) ** 2 <= r * r) return 0;
    let first = Infinity;
    const accept = t => { if (Number.isFinite(t) && t >= 0 && t < first) first = t; };
    const a = dir[0] ** 2 + dir[2] ** 2, b = ox * dir[0] + oz * dir[2], c = ox * ox + oz * oz - r * r;
    const disc = b * b - a * c;
    if (a > EPS && disc >= 0) {
      const q = Math.sqrt(disc);
      for (const t of [(-b - q) / a, (-b + q) / a]) {
        const y = origin[1] + dir[1] * t;
        if (y >= lo && y <= hi) accept(t);
      }
    }
    for (const y of [lo, hi]) {
      const oy = origin[1] - y, B = ox * dir[0] + oy * dir[1] + oz * dir[2], C = ox * ox + oy * oy + oz * oz - r * r, D = B * B - C;
      if (D >= 0) { accept(-B - Math.sqrt(D)); accept(-B + Math.sqrt(D)); }
    }
    return first;
  }
  function defaultHeight(actor) {
    if (actor.kind === 'vcFem' || actor.kind === 'female_vc') return 1.76 * 309 / 352;
    if (actor.kind === 'farmer') return 1.76 * 346 / 352;
    return 1.76;
  }
  function target(game, e, options = {}) {
    if (!e || !point(e.p)) return null;
    const floorAt = typeof options.floorAt === 'function' ? options.floorAt : p => p[1];
    const floor = floorAt(e.p); if (!Number.isFinite(floor)) return null;
    const eye = clamp(finite(options.eyeHeight, e.crouch ? 1.16 : 1.68), .15, 2.2);
    const origin = [e.p[0], floor + eye, e.p[2]], dir = direction(e), seen = new Set();
    let exact = null, assisted = null;
    const consider = (actor, isCow) => {
      if (!actor || actor.alive !== true || !point(actor.p) || seen.has(actor)) return;
      seen.add(actor);
      const dx = actor.p[0] - e.p[0], dz = actor.p[2] - e.p[2], distance = Math.hypot(dx, dz);
      if (!(distance < RANGE)) return;
      const radius = isCow ? .65 : .28, padding = Math.min(MAX_PADDING, distance * Math.tan(ASSIST_ANGLE));
      // Cheap horizontal broad phase avoids terrain/metadata work for people
      // that cannot overlap this actual view ray, including actors behind us.
      const along = dx * Math.sin(finite(e.hdg)) - dz * Math.cos(finite(e.hdg));
      const across = Math.abs(dx * Math.cos(finite(e.hdg)) + dz * Math.sin(finite(e.hdg)));
      if (along < -radius - padding || across > radius + padding) return;
      const bottom = floorAt(actor.p); if (!Number.isFinite(bottom)) return;
      const requestedHeight = isCow ? 1.42 : typeof options.bodyHeight === 'function' ? options.bodyHeight(actor) : defaultHeight(actor);
      const height = clamp(finite(requestedHeight, defaultHeight(actor)), radius * 2, 2.2);
      let rayDistance = capsule(origin, dir, actor.p[0], actor.p[2], bottom, height, radius), assist = false;
      if (!Number.isFinite(rayDistance)) { rayDistance = capsule(origin, dir, actor.p[0], actor.p[2], bottom, height, radius, padding); assist = true; }
      if (!Number.isFinite(rayDistance)) return;
      const hitPoint = origin.map((n, i) => n + dir[i] * rayDistance);
      if (typeof options.lineOfSight === 'function' && !options.lineOfSight(actor, origin, hitPoint)) return;
      // The inherited LOS helper samples a fixed chest-height line. A shot
      // aimed at the legs can instead intersect a foreground rise. Reuse the
      // actual countryside floor function along this view ray. Known camp/POW
      // floors retain their own level/solid semantics, rather than sampling
      // an unrelated landscape underneath a cell or rooftop.
      if (!(game && game.pow) && !e.camp) {
        const steps = Math.max(1, Math.min(MAX_TERRAIN_SAMPLES, Math.ceil(Math.hypot(hitPoint[0] - origin[0], hitPoint[2] - origin[2]) / .25)));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps, x = origin[0] + (hitPoint[0] - origin[0]) * t, z = origin[2] + (hitPoint[2] - origin[2]) * t;
          const ground = floorAt([x, 0, z]);
          if (!Number.isFinite(ground) || ground > origin[1] + (hitPoint[1] - origin[1]) * t + .015) return;
        }
      }
      const item = { actor, distance, rayDistance, isCow, hitPoint, assisted: assist };
      // An assisted near miss cannot steal a farther body actually under the
      // crosshair. Within each group, the first physical surface wins.
      if (assist) { if (!assisted || rayDistance < assisted.rayDistance) assisted = item; }
      else if (!exact || rayDistance < exact.rayDistance) exact = item;
    };
    for (const actor of e.searchers || []) consider(actor, false);
    for (const actor of e.locals || []) consider(actor, false);
    for (const actor of e.cattle || []) consider(actor, true);
    return exact || assisted;
  }
  function reactions(game, dt, e, move) {
    if (!e || !point(e.p) || !Number.isFinite(dt) || dt <= 0 || typeof move !== 'function') return 0;
    let moved = 0; const seen = new Set(), player = { p: e.p, alive: true };
    const settle = (actor, isCow) => {
      if (!actor || seen.has(actor) || !point(actor.p) || !actor.kick) return;
      seen.add(actor);
      const kick = actor.kick;
      if (!Number.isFinite(kick.a) || !Number.isFinite(kick.v) || kick.v <= 0) { actor.kick = null; return; }
      const duration = Math.min(dt, kick.v / FRICTION), distance = kick.v * duration - .5 * FRICTION * duration * duration;
      const context = { ...e, p: actor.p,
        searchers: (e.searchers || []).filter(o => o !== actor).concat(player),
        locals: (e.locals || []).filter(o => o !== actor), cattle: (e.cattle || []).filter(o => o !== actor) };
      const result = move(actor.p[0], actor.p[2], Math.sin(kick.a) * distance, -Math.cos(kick.a) * distance, isCow ? .72 : .35, context);
      if (Array.isArray(result) && Number.isFinite(result[0]) && Number.isFinite(result[1])) {
        if (Math.hypot(result[0] - actor.p[0], result[1] - actor.p[2]) > EPS) moved++;
        actor.p[0] = result[0]; actor.p[2] = result[1];
      }
      kick.v = Math.max(0, kick.v - FRICTION * dt);
      if (kick.v <= 0) actor.kick = null;
    };
    for (const actor of e.searchers || []) settle(actor, false);
    for (const actor of e.locals || []) settle(actor, false);
    for (const actor of e.cattle || []) settle(actor, true);
    return moved;
  }
  root.GroundCombat = Object.freeze({ target, reactions, direction,
    limits: Object.freeze({ range: RANGE, assistAngle: ASSIST_ANGLE, maxAssistPadding: MAX_PADDING, reactionDeceleration: FRICTION, maxTerrainSamples: MAX_TERRAIN_SAMPLES, terrainSpacing: .25, timers: 0, retainedActors: 0 }) });
})(typeof window !== 'undefined' ? window : globalThis);
