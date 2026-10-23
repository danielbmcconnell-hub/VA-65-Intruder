/* Authored strike visuals. Original World damage, FX explosions and secondary
 * sound stay authoritative; this module never releases a weapon or damages an
 * object. All times are simulation times, so pause cannot advance a cook-off. */
(function (root) {
  'use strict';
  const worlds = new WeakMap(), TAU = Math.PI * 2;
  const LIMIT = Object.freeze({ targets: 24, impacts: 32, queue: 128, lights: 8 });
  const profiles = Object.freeze({
    pol: { count: 7, spacing: 1.35, magnitude: 2.35, smoke: [0.075, 0.071, 0.065], size: 27, height: 38, period: .65, life: 20 },
    depot: { count: 4, spacing: 2.4, magnitude: 1.95, smoke: [.19, .17, .15], size: 22, height: 29, period: .85, life: 17 },
    trucks: { count: 3, spacing: 1.3, magnitude: 1.25, smoke: [.105, .101, .095], size: 13, height: 18, period: 1.15, life: 15 },
    rail: { count: 2, spacing: 2.1, magnitude: 1.7, smoke: [.14, .135, .12], size: 19, height: 25, period: 1, life: 17 },
    launcher: { count: 3, spacing: 1.8, magnitude: 1.45, smoke: [.25, .24, .225], size: 15, height: 22, period: 1.1, life: 14 },
    boat: { count: 1, spacing: 1, magnitude: 1.25, smoke: [.10, .10, .105], size: 15, height: 22, period: 1.2, life: 17 },
    contacts: { count: 1, spacing: 1, magnitude: 1.6, smoke: [.105, .105, .11], size: 19, height: 27, period: 1.1, life: 17 },
    // A demolished concrete bridge/radar is not a fuel or ammunition cache.
    bridge: { count: 0, smoke: [.28, .265, .24], size: 22, height: 11, period: 1.3, life: 12, dust: true },
    radar: { count: 0, smoke: [.24, .235, .22], size: 10, height: 10, period: 1.5, life: 11, dust: true }
  });
  const plain = { count: 0, smoke: [.25, .23, .20], size: 12, height: 12, period: 1.4, life: 12, dust: true };
  const finitePoint = p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  function state(world) {
    let s = worlds.get(world);
    if (!s) { s = { seen: new WeakSet(), sequence: 0, targets: [], impacts: [], scheduled: new WeakSet(), secondarySeen: new WeakSet(), budgetAt: NaN, budget: 0, emitted: 0 }; worlds.set(world, s); }
    return s;
  }
  function quality(world, opts) {
    const q = opts && opts.quality !== undefined ? opts.quality : world.rend && world.rend.quality;
    return q === 0 ? 0 : q === 2 ? 2 : 1;
  }
  function clock(world) { return Number.isFinite(world.t) ? world.t : 0; }
  function noise(id, index, salt) {
    let n = (id * 1597334677 + index * 3812015801 + salt * 958282191) | 0;
    n ^= n >>> 16; n = Math.imul(n, 2246822507); n ^= n >>> 13;
    return (n >>> 0) / 4294967296;
  }
  function emit(world, type, args, q) {
    const s = state(world), at = clock(world), fx = world.fx;
    if (!fx || typeof fx[type] !== 'function') return false;
    if (s.budgetAt !== at) { s.budgetAt = at; s.budget = q === 0 ? 48 : q === 2 ? 144 : 96; }
    if (s.budget < 1) return false;
    const list = type === 'smoke' ? fx.smk : fx.add;
    if (list && list.length >= (type === 'smoke' ? q === 0 ? 620 : 760 : 1100)) return false;
    s.budget--; s.emitted++; fx[type].apply(fx, args); return true;
  }
  function flash(s, world, p, scale, source, color, style = 'impact', duration = .8) {
    const item = { id: ++s.sequence, p: p.slice(0, 3), born: clock(world), scale, source, color, style, duration };
    s.impacts.push(item); if (s.impacts.length > LIMIT.impacts) s.impacts.shift();
    return item;
  }
  function impact(world, p, scale, opts) {
    if (!world || !finitePoint(p) || !Number.isFinite(scale) || scale <= 0) return null;
    opts = opts || {};
    if (opts.weapon && opts.weapon !== 'bomb' && opts.weapon !== 'arm') return null;
    const s = state(world), q = quality(world, opts), water = opts.surface === 'water', air = opts.surface === 'air';
    const item = flash(s, world, p, clamp(scale, .3, 4), opts.weapon || 'bomb', water ? [.82, .91, 1] : [1, .70, .35]);
    if (air) {
      for (let i = 0; i < (q === 0 ? 2 : 4); i++) emit(world, 'smoke', [[p[0], p[1] + i * 3, p[2]],
        [.27, .26, .24], 7 * item.scale, 4, [2, 2, 1], .3], q);
      return item.id;
    }
    const count = q === 0 ? 4 : q === 2 ? 10 : 7;
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU + noise(item.id, i, 1) * .2, v = (water ? 9 : 16) * item.scale;
      const spread = (water ? 1.5 : 4) * item.scale;
      emit(world, 'smoke', [[p[0] + Math.cos(a) * spread, p[1] + .8, p[2] + Math.sin(a) * spread],
        water ? [.65, .72, .76] : [.28, .24, .18], (water ? 3 : 7) * item.scale,
        water ? 1.4 : 5.5, [Math.cos(a) * v, water ? 13 : 1.5, Math.sin(a) * v], water ? -8 : .4], q);
    }
    // The original explosion supplies the fireball. Add a coherent, lasting
    // column rather than a second copy of the same primary flash.
    if (!water) for (let i = 0; i < (q === 0 ? 2 : 4); i++) {
      emit(world, 'smoke', [[p[0], p[1] + 8 + i * 10, p[2]], [.22, .205, .18],
        (14 + i * 3) * item.scale, 12 + i * 2, [3, 7 + i, 1], 1.2], q);
    }
    return item.id;
  }
  function destroyed(world, target) {
    if (!world || !target || target.alive !== false || !Number.isFinite(target.hp) || target.hp > 0 || !finitePoint(target.p)) return false;
    // A visual event can only come from the actual mission target set.
    if (!Array.isArray(world.targets) || !world.targets.includes(target)) return false;
    const s = state(world); if (s.seen.has(target)) return false; s.seen.add(target);
    const profile = profiles[target.kind] || plain, id = ++s.sequence;
    const item = { id, target, kind: target.kind || 'structure', p: target.p.slice(0, 3), profile,
      born: clock(world), elapsed: 0, accumulator: 0, emitted: 0 };
    s.targets.push(item); if (s.targets.length > LIMIT.targets) s.targets.shift();
    if (!Array.isArray(world.secs)) world.secs = [];
    for (let i = 0; i < profile.count && world.secs.length < LIMIT.queue; i++) {
      const a = noise(id, i, 2) * TAU;
      // Cook-offs stay inside the actual target footprint, not a random
      // unexplained fire appearing twenty metres away in an empty field.
      const r = Math.max(1, Math.min(30, Number(target.r) || 4)) * (.15 + noise(id, i, 3) * .65);
      const queued = { p: [item.p[0] + Math.cos(a) * r, item.p[1] + 1 + noise(id, i, 4) * 2, item.p[2] + Math.sin(a) * r],
        at: item.born + .55 + i * profile.spacing + noise(id, i, 5) * .75,
        mag: profile.magnitude * (.78 + noise(id, i, 6) * .36),
        strikeVisual: { targetId: id, kind: item.kind, ordinal: i + 1 } };
      world.secs.push(queued); s.scheduled.add(queued);
    }
    return true;
  }
  function secondary(world, queued) {
    if (!world || !queued || !finitePoint(queued.p) || !queued.strikeVisual) return false;
    const s = state(world); if (!s.scheduled.has(queued) || s.secondarySeen.has(queued)) return false;
    // Never flash before the real World secondary scheduler fires it.
    if (!Number.isFinite(queued.at) || clock(world) + 1e-6 < queued.at) return false;
    s.secondarySeen.add(queued);
    const profile = profiles[queued.strikeVisual.kind] || plain, q = quality(world);
    const fuel = profile === profiles.pol || profile === profiles.trucks || profile === profiles.boat,
      ammunition = profile === profiles.depot || profile === profiles.launcher;
    // Fuel rolls orange and lingers; ammunition gives a shorter, hotter flash.
    // These are only the light signatures of a genuinely due World cook-off.
    const item = flash(s, world, queued.p, clamp(queued.mag || 1, .3, 4), 'secondary',
      fuel ? [1, .34, .075] : ammunition ? [1, .78, .35] : [1, .48, .14],
      fuel ? 'fuel' : ammunition ? 'ammunition' : 'secondary', fuel ? 1.15 : ammunition ? .48 : .8);
    const count = q === 0 ? 2 : q === 2 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const a = noise(item.id, i, 15) * TAU, offset = fuel ? 2 + i * 2.5 : i * 1.5;
      emit(world, 'smoke', [[queued.p[0] + Math.cos(a) * offset, queued.p[1] + (fuel ? 3 + i * 14 : 5 + i * 9), queued.p[2] + Math.sin(a) * offset],
        profile.smoke, profile.size * (fuel ? .82 + i * .20 : .65 + i * .15), profile.life,
        [3 + i * .7, fuel ? 11 + i * 3 : 8 + i * 2, 1 + i * .35], 1.7], q);
    }
    // Ammunition/rocket cook-offs throw brief upward sparks; fuel billows.
    if (ammunition) {
      for (let i = 0; i < (q === 0 ? 2 : 5); i++) {
        const a = noise(item.id, i, 7) * TAU;
        emit(world, 'streak', [queued.p, [Math.cos(a) * 16, 30 + noise(item.id, i, 8) * 25, Math.sin(a) * 16],
          [1, .63, .22], .7, 1.15, 9.81, 2.4], q);
      }
    }
    return true;
  }
  function step(world, dt, opts) {
    if (!world || !Number.isFinite(dt) || dt <= 0) return;
    const s = state(world), q = quality(world, opts), eye = opts && finitePoint(opts.eye) ? opts.eye : null;
    s.impacts = s.impacts.filter(v => clock(world) - v.born < v.duration + .15);
    for (let i = s.targets.length - 1; i >= 0; i--) {
      const v = s.targets[i], p = v.profile; v.elapsed += dt;
      if (v.target.alive !== false || v.elapsed > (p.dust ? 13 : 90) || (!p.dust && !(v.target.burn > .02))) { s.targets.splice(i, 1); continue; }
      const d = eye ? distance(eye, v.p) : 0;
      if (d > 14000) { v.accumulator = 0; continue; }
      const interval = p.period * (q === 0 ? 2 : 1) * (d > 6500 ? 2 : 1) * (p.dust ? 1 + v.elapsed / 4 : 1);
      v.accumulator = Math.min(v.accumulator + dt, interval * 2);
      // Bounded catch-up: a suspended tab does not disgorge minutes of FX.
      let catchup = 0;
      while (v.accumulator >= interval && catchup++ < 2) {
        v.accumulator -= interval;
        const n = ++v.emitted, offset = (noise(v.id, n, 9) - .5) * 7;
        const size = p.size * (q === 0 ? 1.12 : 1) * (p.dust ? 1 : .78 + Math.min(v.elapsed / 18, .38));
        emit(world, 'smoke', [[v.p[0] + offset, v.p[1] + p.height, v.p[2] - offset * .35], p.smoke,
          size, p.life, [3.5, p.dust ? 1.5 : 6.5, 1.2], p.dust ? .3 : 1.5], q);
      }
    }
  }
  function lights(world, eye, requestedQuality) {
    if (!world) return [];
    const s = state(world), q = quality(world, { quality: requestedQuality }), now = clock(world);
    const items = Array.isArray(world.fires) ? world.fires.filter(f => finitePoint(f) && Number.isFinite(f[3]) && f[3] > 0).map(f => {
      const copy = f.slice(); if (Array.isArray(copy[5])) copy[5] = copy[5].slice(); return copy;
    }) : [];
    for (const f of s.impacts) {
      const age = now - f.born;
      if (age < 0 || age >= f.duration) continue;
      const power = (1 - age / f.duration) ** 2 * (f.style === 'ammunition' ? 3.1 : f.source === 'secondary' ? 2.6 : 2.0);
      items.push([f.p[0], f.p[1] + 5, f.p[2], power, 55 + f.scale * 21, f.color.slice()]);
    }
    const viewpoint = finitePoint(eye) ? eye : [0, 0, 0];
    items.sort((a, b) => b[3] / (400 + distance(viewpoint, b) ** 2) - a[3] / (400 + distance(viewpoint, a) ** 2));
    return items.slice(0, q === 0 ? 4 : LIMIT.lights);
  }
  // Ejection/ground play stops World.t. End only the momentary light pulse;
  // the existing fires, particles and genuine target aftermath remain intact.
  function clearTransient(world) {
    const s = world && worlds.get(world); if (s) s.impacts.length = 0;
  }
  function clear(world) { if (world) worlds.delete(world); }
  function inspect(world) {
    if (!world) return null; const s = state(world);
    return { targets: s.targets.map(v => ({ id: v.id, kind: v.kind, p: v.p.slice(), elapsed: v.elapsed, smokeBursts: v.emitted })),
      flashes: s.impacts.map(v => ({ id: v.id, p: v.p.slice(), born: v.born, source: v.source, style: v.style, duration: v.duration })),
      emitted: s.emitted, queue: Array.isArray(world.secs) ? world.secs.length : 0 };
  }
  root.FlightStrikeEffects = Object.freeze({ impact, destroyed, secondary, step, lights, clearTransient, clear, inspect, limits: LIMIT });
})(typeof window !== 'undefined' ? window : globalThis);
