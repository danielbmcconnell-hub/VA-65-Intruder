/* Threat presentation only. Real World launches, projectiles and warning
 * eligibility remain authoritative. Cosmetic particles have their own random
 * stream and use the existing FX schema/caps, never gameplay Math.random. */
(function (root) {
  'use strict';
  const worlds = new WeakMap(), trails = new WeakMap(), TAU = Math.PI * 2;
  const LIMITS = Object.freeze({ events: 8, additive: 1500, smoke: 900, smokeStep: 12,
    smokeInterval: 1 / 30, glowInterval: 1 / 60, maxStep: .25, maxTravel: 500,
    smokePerStep: 24, glowPerStep: 16, lights: 2 });
  const WORDS = Object.freeze(['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven']);
  const point = p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite);
  const mix = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function seedFor(p, salt = 0) {
    let seed = (salt | 0) ^ 0x6d2b79f5;
    for (const n of p) { seed ^= Math.round(n * 16) | 0; seed = Math.imul(seed ^ seed >>> 16, 0x45d9f3b); }
    return seed >>> 0 || 1;
  }
  function random(s) { let n = s.seed; n ^= n << 13; n ^= n >>> 17; n ^= n << 5; s.seed = n >>> 0 || 1; return s.seed / 4294967296; }
  function state(world) {
    if (!world || typeof world !== 'object') return null;
    let s = worlds.get(world);
    if (!s) { s = { serial: 0, events: [] }; worlds.set(world, s); }
    return s;
  }
  function add(fx, p, c, size, life, rng, vector) {
    if (!fx || !Array.isArray(fx.add) || fx.add.length >= LIMITS.additive) return false;
    const q = { p: p.slice(), c: c.slice(), a: 1, s: size, s0: size, k: vector ? 2 : 1,
      t: 0, life, vel: [0, 0, 0], g: 0, rot: random(rng) * TAU };
    if (vector) { q.streak = true; q.v = [0, 0, 0]; q.vs = vector.slice(); }
    fx.add.push(q); return true;
  }
  function smoke(fx, p, c, size, life, rng, velocity, rise) {
    if (!fx || !Array.isArray(fx.smk) || fx.smk.length >= LIMITS.smoke) return false;
    fx.smk.push({ p: p.slice(), c: c.slice(), a: .55, s: size, s0: size, k: 0,
      t: 0, life, vel: velocity.slice(), g: -rise, rot: random(rng) * TAU }); return true;
  }
  function plume(fx, p, rng) {
    add(fx, [p[0], p[1] + .5, p[2]], [1, .92, .72], 4, .12, rng);
    add(fx, [p[0], p[1] + 1, p[2]], [1, .65, .3], 7, .28, rng);
    for (let i = 0; i < 18; i++) {
      const angle = random(rng) * TAU, radius = Math.sqrt(random(rng)) * 5;
      const h = random(rng) * 3, speed = 1.4 + random(rng) * 2.4;
      smoke(fx, [p[0] + Math.cos(angle) * radius, p[1] - 2 + h, p[2] + Math.sin(angle) * radius],
        [.66, .65, .61], 3.3 + random(rng) * 3.7, 3.8 + random(rng) * 2.2,
        rng, [Math.cos(angle) * speed, .5 + random(rng), Math.sin(angle) * speed], 1.3);
    }
  }
  function recordLaunch(world, site, projectile) {
    const s = state(world), p = point(projectile && projectile.p) ? projectile.p : site && site.p;
    if (!s || !point(p) || !Number.isFinite(world.t)) return null;
    const at = world.t;
    if (s.events.length && at < s.events[s.events.length - 1].at - 1e-6) s.events.length = 0;
    const event = { id: ++s.serial, at, p: p.slice() };
    s.events.push(event); if (s.events.length > LIMITS.events) s.events.shift();
    const rng = { seed: seedFor(p, event.id) };
    plume(world.fx, p, rng);
    if (projectile && typeof projectile === 'object') trails.set(projectile, fresh(projectile, 'sam', p));
    return { ...event, p: event.p.slice() };
  }
  function clockBearing(ac, p) {
    if (!ac || !point(ac.p) || !point(p) || !Number.isFinite(ac.yaw)) return null;
    const dx = p[0] - ac.p[0], dz = p[2] - ac.p[2];
    if (Math.hypot(dx, dz) < .25) return null;
    const relative = Math.atan2(Math.sin(Math.atan2(dx, -dz) - ac.yaw), Math.cos(Math.atan2(dx, -dz) - ac.yaw));
    const sector = (Math.round(relative / (TAU / 12)) % 12 + 12) % 12;
    return { clock: sector || 12, word: WORDS[sector], relative };
  }
  function launchCall(world, ac) {
    if (!world || !(world.launchWarn > 0)) return null;
    const s = worlds.get(world), at = world.t;
    const eligible = s && Number.isFinite(at) ? s.events.filter(e => at - e.at >= -1e-6 && at - e.at <= 5.25) : [];
    const newest = eligible.length ? Math.max(...eligible.map(e => e.at)) : -Infinity;
    const candidates = eligible.filter(e => Math.abs(e.at - newest) < 1e-6);
    candidates.sort((a, b) => point(ac && ac.p) ? Math.hypot(a.p[0] - ac.p[0], a.p[2] - ac.p[2]) - Math.hypot(b.p[0] - ac.p[0], b.p[2] - ac.p[2]) || b.id - a.id : b.id - a.id);
    const event = candidates[0], bearing = event && clockBearing(ac, event.p);
    return { text: bearing ? "LAUNCH! SAM at our " + bearing.word + " o'clock — watch for the smoke!" : 'LAUNCH! Surface-to-air missile — watch for the smoke!',
      clock: bearing ? bearing.clock : null, relative: bearing ? bearing.relative : null,
      eventId: event ? event.id : null, position: event ? event.p.slice() : null };
  }
  function fresh(projectile, kind, p) {
    return { p: p.slice(), kind, seed: seedFor(p, kind === 'arm' ? 37 : 19),
      smokeTime: 0, smokeDistance: 0, glowTime: 0, clock: 0, emittedSmoke: 0, emittedGlow: 0 };
  }
  function trail(fx, projectile, dt, kind = 'sam', wind = [0, 0, 0]) {
    const out = { smoke: 0, glow: 0, reset: false, skipped: false };
    if (!(Number.isFinite(dt) && dt > 0) || !projectile || !point(projectile.p) || !point(projectile.v)) { out.skipped = true; return out; }
    kind = kind === 'arm' ? 'arm' : 'sam';
    let s = trails.get(projectile);
    const end = projectile.p;
    if (!s || s.kind !== kind) {
      const start = end.map((n, i) => n - projectile.v[i] * Math.min(dt, LIMITS.maxStep));
      s = fresh(projectile, kind, start); trails.set(projectile, s);
    }
    const distance = Math.hypot(...end.map((n, i) => n - s.p[i]));
    if (dt > LIMITS.maxStep || distance > LIMITS.maxTravel) {
      trails.set(projectile, fresh(projectile, kind, end)); out.reset = true; return out;
    }
    const start = s.p.slice(), breeze = point(wind) ? wind.map(v => clamp(v, -12, 12)) : [0, 0, 0];
    // Sample the continuous segment at the first time OR distance boundary,
    // not once per renderer update. This avoids long gaps at high speed.
    let alpha = 0, samples = 0;
    while (alpha < 1 - 1e-9 && samples < LIMITS.smokePerStep) {
      const aTime = Math.max(0, LIMITS.smokeInterval - s.smokeTime) / dt;
      const aDistance = distance > 1e-9 ? Math.max(0, LIMITS.smokeStep - s.smokeDistance) / distance : Infinity;
      const step = Math.min(aTime, aDistance), remaining = 1 - alpha;
      if (step > remaining + 1e-9) { s.smokeTime += remaining * dt; s.smokeDistance += remaining * distance; alpha = 1; break; }
      alpha = Math.min(1, alpha + Math.max(0, step));
      const p = mix(start, end, alpha);
      const color = kind === 'arm' ? [.48, .49, .49] : [.61, .60, .57];
      const size = kind === 'arm' ? 2.8 : 4.7, life = kind === 'arm' ? 2.2 : 3.4;
      if (smoke(fx, p, color, size, life, s, [breeze[0] * .35, breeze[1] * .1, breeze[2] * .35], .35)) out.smoke++;
      s.smokeTime = s.smokeDistance = 0; samples++;
    }
    if (samples === LIMITS.smokePerStep && alpha < 1) s.smokeTime = s.smokeDistance = 0;
    const oldGlow = s.glowTime, count = Math.floor((oldGlow + dt + 1e-10) / LIMITS.glowInterval);
    const speed = Math.hypot(...projectile.v), length = clamp(speed * .014, 2, 10);
    const tail = speed > .01 ? projectile.v.map(v => -v / speed * length) : [0, -2, 0];
    for (let i = 0; i < Math.min(count, LIMITS.glowPerStep); i++) {
      const fraction = clamp((LIMITS.glowInterval - oldGlow + i * LIMITS.glowInterval) / dt, 0, 1);
      if (add(fx, mix(start, end, fraction), kind === 'arm' ? [1, .74, .38] : [1, .84, .54], kind === 'arm' ? .35 : .5, .10, s, tail)) out.glow++;
    }
    s.glowTime = Math.max(0, (oldGlow + dt) - count * LIMITS.glowInterval);
    s.p = end.slice(); s.clock += dt; s.emittedSmoke += out.smoke; s.emittedGlow += out.glow;
    return out;
  }
  function transientLights(world) {
    const s = worlds.get(world); if (!s || !Number.isFinite(world.t)) return [];
    const now = world.t;
    return s.events.filter(e => now >= e.at && now - e.at < .4).slice(-LIMITS.lights).map(e => {
      const age = now - e.at, fade = 1 - age / .4;
      return { eventId: e.id, position: [e.p[0], e.p[1] + 1, e.p[2]], direction: [0, 1, 0],
        coneCos: -1, rgb: [1, .68, .32], radius: 110, intensity: fade * fade * 1.8 };
    });
  }
  function inspect(world) {
    const s = worlds.get(world);
    return { launches: s ? s.serial : 0, events: s ? s.events.map(e => ({ ...e, p: e.p.slice() })) : [] };
  }
  function inspectTrail(projectile) {
    const s = trails.get(projectile);
    return s ? { kind: s.kind, clock: s.clock, smoke: s.emittedSmoke, glow: s.emittedGlow,
      smokeTime: s.smokeTime, smokeDistance: s.smokeDistance, glowTime: s.glowTime, position: s.p.slice() } : null;
  }
  root.FlightThreatFeedback = Object.freeze({ version: 1, recordLaunch, clockBearing, launchCall, trail, transientLights, inspect, inspectTrail, limits: LIMITS });
})(typeof window !== 'undefined' ? window : globalThis);
