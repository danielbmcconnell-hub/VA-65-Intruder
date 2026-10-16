/* Willard Egress — authored, unfriendly ground defenses.
 * Each shell starts at a real fixed emplacement, follows a gravity arc and
 * detonates on its fuse. A-6 damage comes only from spatial burst overlap;
 * the interceptor consumes the same burst positions through its own AI.
 * No timers, DOM, graphics API, hidden damage rolls or friendly-fire exemption.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, G = 9.81;
  const LIMIT = Object.freeze({ guns: 8, shells: 40, bursts: 48, observations: 8, substep: 1 / 30, range: 6500, maxFuse: 4 });
  const profiles = Object.freeze({
    rookie: Object.freeze({ spread: 145, delay: .72, damage: .32, interval: 3.05, slew: .75 }),
    naval: Object.freeze({ spread: 105, delay: .55, damage: .45, interval: 2.65, slew: .9 }),
    ace: Object.freeze({ spread: 72, delay: .42, damage: .58, interval: 2.25, slew: 1.02 })
  });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite);
  const length = v => Math.hypot(v[0], v[1], v[2]);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const distance = (a, b) => length(sub(a, b));
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const copy = value => JSON.parse(JSON.stringify(value));
  const flat = () => 0;
  function random(s) { s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0; return s.rng / 4294967296; }
  function ground(terrain, x, z) { const y = terrain(x, z); return Number.isFinite(y) ? Math.max(0, y) : 0; }
  function difficulty(id) {
    id = String(id || 'naval').toLowerCase().replace(/[ _-]/g, '');
    return id === 'rookie' || id === 'easy' ? 'rookie' : id === 'ace' || id === 'hard' ? 'ace' : 'naval';
  }
  function create(options) {
    const o = options || {}, terrain = typeof o.terrainH === 'function' ? o.terrainH : flat;
    const center = finite(o.center) ? o.center.slice(0, 3) : [0, 0, 0];
    const s = { version: 1, center, difficulty: difficulty(o.difficulty), rng: (Number(o.seed) >>> 0) || 1966,
      time: 0, sequence: 0, guns: [], shells: [], bursts: [], lights: [], previousAC: null,
      beamClock: 0, beamCursor: 0, stats: { shellsFired: 0, a6Shots: 0, migShots: 0, detonated: 0, terrainImpacts: 0, a6Hits: 0, a6Exposure: 0, migExposure: 0 } };
    const start = random(s) * TAU;
    for (let i = 0; i < LIMIT.guns; i++) {
      const a = start + i / LIMIT.guns * TAU, radius = 1600 + random(s) * 1100;
      const x = center[0] + Math.cos(a) * radius, z = center[2] + Math.sin(a) * radius;
      s.guns.push({ id: 'willard-gun-' + (i + 1), p: [x, ground(terrain, x, z) + 2.4, z],
        yaw: wrap(a + Math.PI), elevation: .65, alive: true, cooldown: .6 + i * .25 + random(s) * .5,
        sampleClock: random(s) * .2, targetId: null, lastTargetId: null, tracking: 0, aim: null,
        observations: { a6: [], mig: [] }, shots: 0, lastFired: -100, visibleA6: false, visibleMiG: false });
    }
    updateLights(s);
    return s;
  }
  function lineOfSight(from, to, terrainH) {
    if (!finite(from) || !finite(to)) return false;
    const terrain = typeof terrainH === 'function' ? terrainH : flat, d = distance(from, to);
    const n = clamp(Math.ceil(d / 110), 2, 64);
    for (let i = 1; i < n; i++) {
      const f = i / n, x = from[0] + (to[0] - from[0]) * f, z = from[2] + (to[2] - from[2]) * f;
      const y = from[1] + (to[1] - from[1]) * f, h = terrain(x, z);
      if (!Number.isFinite(h) || y <= Math.max(0, h) + .7) return false;
    }
    return true;
  }
  function observation(gun, target, terrain, at) {
    if (!target || target.alive === false || target.outOfAircraft || !finite(target.p)) return null;
    const agl = target.p[1] - ground(terrain, target.p[0], target.p[2]);
    if (agl < 100 || agl > 2200 || distance(gun.p, target.p) > LIMIT.range || !lineOfSight(gun.p, target.p, terrain)) return null;
    let v = finite(target.v) ? target.v.slice(0, 3) : [0, 0, 0];
    const speed = length(v); if (speed > 400) v = v.map(n => n * 400 / speed);
    return { p: target.p.slice(0, 3), v, at, range: distance(gun.p, target.p) };
  }
  function perceive(s, gun, context, terrain) {
    for (const id of ['a6', 'mig']) {
      const seen = observation(gun, id === 'a6' ? context.ac : context.enemy, terrain, s.time), list = gun.observations[id];
      gun[id === 'a6' ? 'visibleA6' : 'visibleMiG'] = !!seen;
      if (seen) { list.push(seen); if (list.length > LIMIT.observations) list.shift(); }
      while (list.length && s.time - list[0].at > 2.5) list.shift();
    }
  }
  function delayed(s, gun, id, profile) {
    if (!gun[id === 'a6' ? 'visibleA6' : 'visibleMiG']) return null;
    const list = gun.observations[id];
    for (let i = list.length - 1; i >= 0; i--) if (s.time - list[i].at >= profile.delay && s.time - list[i].at < 1.4) return list[i];
    return null;
  }
  // Keep the shell's travel time physical. Contacts are tracked to 6.5 km;
  // guns wait until a <=4 second fuse can reach the predicted intercept.
  function solution(s, gun, seen, profile, spread) {
    const age = clamp(s.time - seen.at, 0, 1.4), estimate = seen.p.map((n, i) => n + seen.v[i] * age);
    let fuse = clamp(distance(gun.p, estimate) / 1050, 1, LIMIT.maxFuse), aim;
    for (let i = 0; i < 3; i++) {
      aim = estimate.map((n, j) => n + seen.v[j] * fuse);
      fuse = clamp(distance(gun.p, aim) / 1050, 1, LIMIT.maxFuse);
    }
    aim = estimate.map((n, j) => n + seen.v[j] * fuse);
    if (spread) {
      const a = random(s) * TAU, r = Math.sqrt(random(s)) * profile.spread;
      aim[0] += Math.cos(a) * r; aim[2] += Math.sin(a) * r;
      aim[1] += (random(s) * 2 - 1) * profile.spread * .55;
    }
    const v = aim.map((n, i) => (n - gun.p[i]) / fuse); v[1] += G * fuse * .5;
    const speed = length(v);
    if (speed > 1210 || speed < 250) return null;
    const horizontal = Math.hypot(v[0], v[2]);
    return { p: aim, v, fuse, yaw: Math.atan2(v[0], -v[2]), elevation: Math.atan2(v[1], horizontal) };
  }
  function select(s, gun, profile) {
    const choices = ['a6', 'mig'].map(id => ({ id, seen: delayed(s, gun, id, profile) })).filter(v => v.seen);
    if (!choices.length) return null;
    choices.sort((a, b) => a.seen.range - b.seen.range);
    // Adjacent gun crews can mistake the following interceptor for another
    // intruder. Prefer the nearest track, alternating only comparable tracks.
    if (choices.length === 2 && choices[0].id === gun.lastTargetId && choices[1].seen.range < choices[0].seen.range * 1.35) return choices[1];
    return choices[0];
  }
  function emit(fx, name, args, quality) {
    if (!fx || typeof fx[name] !== 'function') return;
    const list = name === 'smoke' ? fx.smk : fx.add;
    if (list && list.length > (name === 'smoke' ? quality === 0 ? 550 : 720 : quality === 0 ? 900 : 1250)) return;
    fx[name].apply(fx, args);
  }
  function fire(s, gun, shot, context, quality, profile) {
    if (s.shells.length >= LIMIT.shells) return false;
    const shell = { id: ++s.sequence, gunId: gun.id, targetId: gun.targetId, p: gun.p.slice(), v: shot.v.slice(),
      age: 0, fuse: shot.fuse, radius: 55 + random(s) * 20, power: 1, born: s.time };
    s.shells.push(shell); gun.shots++; gun.lastFired = s.time; gun.lastTargetId = gun.targetId;
    gun.cooldown = profile.interval * (.86 + random(s) * .35);
    s.stats.shellsFired++; s.stats[gun.targetId === 'a6' ? 'a6Shots' : 'migShots']++;
    emit(context.fx, 'glow', [gun.p, [1, .73, .30], 6.2, .14], quality);
    // These tracers use exactly the physical shell's initial velocity/gravity.
    // The actual shell, not its cosmetic particle, remains authoritative.
    emit(context.fx, 'streak', [shell.p, shell.v, [1, .66, .22], 1.05, shell.fuse, G, 25], quality);
    return true;
  }
  function advanceGun(s, gun, dt, context, terrain, quality, profile) {
    if (!gun.alive) return;
    gun.cooldown = Math.max(0, gun.cooldown - dt); gun.sampleClock -= dt;
    if (gun.sampleClock <= 0) { gun.sampleClock += .2; perceive(s, gun, context, terrain); }
    let choice = gun.targetId && delayed(s, gun, gun.targetId, profile);
    if (!choice || gun.cooldown <= 0 && gun.lastTargetId === gun.targetId) {
      const selected = select(s, gun, profile), id = selected && selected.id;
      if (id !== gun.targetId) { gun.targetId = id; gun.tracking = 0; }
      choice = selected && selected.seen;
    }
    const aim = choice && solution(s, gun, choice, profile, false);
    gun.aim = aim ? aim.p : null;
    if (!aim) { gun.tracking = Math.max(0, gun.tracking - dt * 1.8); gun.yaw = wrap(gun.yaw + dt * .11); return; }
    const yawError = wrap(aim.yaw - gun.yaw), elevationError = aim.elevation - gun.elevation;
    gun.yaw = wrap(gun.yaw + clamp(yawError, -profile.slew * dt, profile.slew * dt));
    gun.elevation += clamp(elevationError, -.58 * dt, .58 * dt);
    const aligned = Math.abs(wrap(aim.yaw - gun.yaw)) < .10 && Math.abs(aim.elevation - gun.elevation) < .08;
    gun.tracking = aligned ? Math.min(2, gun.tracking + dt) : Math.max(0, gun.tracking - dt * .5);
    if (aligned && gun.tracking >= .65 && gun.cooldown <= 0) {
      const shot = solution(s, gun, choice, profile, true);
      if (shot) fire(s, gun, shot, context, quality, profile);
    }
  }
  function detonate(s, shell, context, quality, profile, aircraftPoint, fresh) {
    const burst = { id: shell.id, gunId: shell.gunId, targetId: shell.targetId, p: shell.p.slice(), radius: shell.radius,
      power: shell.power, at: s.time, age: 0, hitA6: false };
    s.bursts.push(burst); if (s.bursts.length > LIMIT.bursts) s.bursts.shift();
    s.stats.detonated++; emit(context.fx, 'flak', [burst.p], quality);
    const ac = context.ac;
    if (ac && ac.alive !== false && !ac.outOfAircraft && finite(aircraftPoint)) {
      const d = distance(aircraftPoint, burst.p); burst.distanceA6 = d;
      if (d < 220) s.stats.a6Exposure++;
      if (d < burst.radius) {
        burst.hitA6 = true; s.stats.a6Hits++;
        if (typeof context.hitAircraft === 'function') context.hitAircraft(ac, (1 - d / burst.radius) * profile.damage * burst.power, 'flak');
      }
    }
    if (context.enemy && context.enemy.alive !== false && finite(context.enemy.p) && distance(context.enemy.p, burst.p) < 220) s.stats.migExposure++;
    fresh.push(burst);
  }
  function updateLights(s) {
    s.lights = s.guns.filter(g => g.alive).map(g => {
      const ce = Math.cos(g.elevation), dir = [Math.sin(g.yaw) * ce, Math.sin(g.elevation), -Math.cos(g.yaw) * ce];
      const beamLength = g.aim ? clamp(distance(g.p, g.aim), 700, 4800) : 2300;
      return { id: g.id, p: [g.p[0], g.p[1] + 1.5, g.p[2]], dir,
        end: g.p.map((n, i) => n + dir[i] * beamLength), intensity: g.targetId ? .8 : .45,
        tracking: g.tracking, targetId: g.targetId, spread: .023 };
    });
  }
  function beamParticles(s, context, dt, quality) {
    s.beamClock -= dt; if (s.beamClock > 0 || !s.lights.length) return;
    s.beamClock += .20;
    const samples = quality === 0 ? 3 : quality === 2 ? 6 : 4;
    for (let k = 0; k < 2; k++) {
      const light = s.lights[(s.beamCursor++ % s.lights.length)], delta = sub(light.end, light.p);
      for (let i = 1; i <= samples; i++) {
        const f = i / (samples + 1), p = light.p.map((n, j) => n + delta[j] * f);
        emit(context.fx, 'glow', [p, [.055 * light.intensity, .080 * light.intensity, .105 * light.intensity], 10 + f * 35, .42], quality);
      }
    }
  }
  function step(s, seconds, context) {
    context = context || {};
    if (!s || s.version !== 1 || context.paused || !Number.isFinite(seconds) || seconds <= 0) return [];
    const dt = Math.min(seconds, 1), terrain = typeof context.terrainH === 'function' ? context.terrainH : flat;
    const quality = context.quality === 0 ? 0 : context.quality === 2 ? 2 : 1, profile = profiles[s.difficulty] || profiles.naval;
    const fresh = [], ac = context.ac, endpoint = ac && finite(ac.p) ? ac.p.slice(0, 3) : null;
    const origin = finite(s.previousAC) ? s.previousAC : endpoint;
    let elapsed = 0;
    while (elapsed < dt - 1e-9) {
      const h = Math.min(LIMIT.substep, dt - elapsed); elapsed += h; s.time += h;
      for (const b of s.bursts) b.age += h;
      s.bursts = s.bursts.filter(b => b.age < 6).slice(-LIMIT.bursts);
      for (let i = s.shells.length - 1; i >= 0; i--) {
        const shell = s.shells[i], travel = Math.min(h, Math.max(0, shell.fuse - shell.age));
        shell.p[0] += shell.v[0] * travel; shell.p[1] += shell.v[1] * travel - .5 * G * travel * travel; shell.p[2] += shell.v[2] * travel;
        shell.v[1] -= G * travel; shell.age += travel;
        if (shell.p[1] <= ground(terrain, shell.p[0], shell.p[2])) { s.shells.splice(i, 1); s.stats.terrainImpacts++; continue; }
        if (shell.age >= shell.fuse - 1e-8) {
          s.shells.splice(i, 1);
          const f = clamp((elapsed - h + travel) / dt, 0, 1), point = endpoint && origin ? origin.map((n, j) => n + (endpoint[j] - n) * f) : null;
          detonate(s, shell, context, quality, profile, point, fresh);
        }
      }
      for (const gun of s.guns) advanceGun(s, gun, h, context, terrain, quality, profile);
    }
    s.previousAC = endpoint; updateLights(s); beamParticles(s, context, dt, quality);
    return fresh;
  }
  function inspect(s) {
    if (!s || s.version !== 1) return null;
    return copy({ time: s.time, difficulty: s.difficulty, guns: s.guns, shells: s.shells, bursts: s.bursts, lights: s.lights, stats: s.stats });
  }
  root.WillardFlak = Object.freeze({ create, step, inspect, lineOfSight, limits: LIMIT });
})(typeof window !== 'undefined' ? window : globalThis);
