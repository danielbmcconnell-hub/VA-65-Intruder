/* Willard Egress — bounded MiG-17PF pursuit and cannon simulation.
 * The unidentified historical interceptor is portrayed by the supplied MiG
 * artwork. These authored flight/combat parameters are gameplay reconstruction,
 * not claims about the encounter or a second player-aircraft flight engine.
 * World coordinates follow bodyAxes(): +X east, +Y up, -Z north.
 */
(function (global) {
  'use strict';
  const PI = Math.PI, TAU = PI * 2, G = 9.81, MAX_PROJECTILES = 128;
  const profiles = Object.freeze({
    rookie: Object.freeze({ sight: 4400, reaction: .95, sensor: .28, spread: .014, cooldown: 3.5, burst: .42, damage: .13, memory: 15, aggression: .85 }),
    naval: Object.freeze({ sight: 5400, reaction: .65, sensor: .20, spread: .008, cooldown: 2.65, burst: .50, damage: .19, memory: 20, aggression: 1 }),
    ace: Object.freeze({ sight: 6400, reaction: .40, sensor: .15, spread: .0045, cooldown: 1.9, burst: .58, damage: .23, memory: 25, aggression: 1.12 })
  });
  const limits = Object.freeze({ maxSpeed: 315, minSpeed: 132, maxAcceleration: 6.5, maxDeceleration: 8,
    maxRollRate: 1.55, maxBank: 1.25, maxTurnRate: .32, maxPitchRate: .24,
    muzzleSpeed: 710, fireRate: 12, ammunition: 180, projectileLife: 2.2,
    maxProjectiles: MAX_PROJECTILES, targetRadius: 6.5, substep: 1 / 60 });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const valid = p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const length = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => mul(a, 1 / (length(a) || 1));
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const wrap = a => ((a + PI) % TAU + TAU) % TAU - PI;
  const forward = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
  const flatGround = () => 0;
  function random(e) { e._rng = (Math.imul(e._rng, 1664525) + 1013904223) >>> 0; return e._rng / 4294967296; }
  function profile(difficulty) {
    const id = String(difficulty || 'naval').toLowerCase().replace(/[ _-]/g, '');
    return id === 'rookie' || id === 'easy' ? profiles.rookie : id === 'ace' || id === 'hard' ? profiles.ace : profiles.naval;
  }
  function create(options) {
    const o = options || {}, p = valid(o.position) ? o.position.slice(0, 3) : [0, 650, 2200];
    const yaw = Number.isFinite(o.yaw) ? wrap(o.yaw) : 0;
    const pitch = Number.isFinite(o.pitch) ? clamp(o.pitch, -.48, .38) : 0;
    const speed = Number.isFinite(o.speed) ? clamp(o.speed, limits.minSpeed, limits.maxSpeed) : 235;
    return { p, v: mul(forward(yaw, pitch), speed), yaw, pitch, roll: 0, speed,
      health: 1, alive: true, state: 'PATROL', stateTime: 0, time: 0,
      ammo: limits.ammunition, roundsFired: 0, hits: 0, bursts: 0, projectiles: [],
      visible: false, lastSeen: -1e9, lastKnown: null, lastKnownVelocity: [0, 0, 0],
      flakPressure: 0, flakAlarm: 0, disengaged: false,
      _profile: profile(o.difficulty), _rng: (Number(o.seed) >>> 0) || 1966,
      _sensor: 0, _origin: p.slice(), _targetPrevious: null, _shotClock: 0,
      _burstRemaining: 0, _cooldown: 0, _evadeSign: 1, _flakIds: [],
      _flakAway: null, _events: [], _id: 0, _damageSource: null };
  }
  function emit(e, context, event) {
    e._events.push(event);
    if (typeof context.emit === 'function') context.emit(event);
  }
  function transition(e, state, context) {
    if (e.state === state) return;
    const from = e.state; e.state = state; e.stateTime = 0;
    if (state !== 'ATTACK') e._burstRemaining = 0;
    emit(e, context, { type: 'state', from, state, p: e.p.slice(), time: e.time });
  }
  function lineOfSight(from, to, terrainH) {
    if (!valid(from) || !valid(to)) return false;
    const terrain = typeof terrainH === 'function' ? terrainH : flatGround;
    const delta = sub(to, from), distance = length(delta), count = clamp(Math.ceil(distance / 100), 2, 96);
    for (let i = 1; i < count; i++) {
      const f = i / count, x = from[0] + delta[0] * f, y = from[1] + delta[1] * f, z = from[2] + delta[2] * f;
      const h = terrain(x, z);
      if (!Number.isFinite(h) || y <= Math.max(h, 0) + 3) return false;
    }
    return true;
  }
  // Constant-velocity interception using only the most recent visual estimate.
  // Own velocity is inherited by the shell, so use relative target velocity.
  function lead(origin, ownVelocity, targetPosition, targetVelocity, muzzleSpeed) {
    const speed = Number.isFinite(muzzleSpeed) ? muzzleSpeed : limits.muzzleSpeed;
    const r = sub(targetPosition, origin), v = sub(targetVelocity, ownVelocity);
    const a = dot(v, v) - speed * speed, b = 2 * dot(r, v), c = dot(r, r), discriminant = b * b - 4 * a * c;
    let t = length(r) / speed;
    if (Math.abs(a) > 1e-8 && discriminant >= 0) {
      const q = Math.sqrt(discriminant), x = (-b - q) / (2 * a), y = (-b + q) / (2 * a);
      const positive = [x, y].filter(n => n > 0); if (positive.length) t = Math.min(...positive);
    } else if (Math.abs(b) > 1e-8) { const q = -c / b; if (q > 0) t = q; }
    t = clamp(t, .01, limits.projectileLife);
    const offset = add(r, mul(v, t)); offset[1] += .5 * G * t * t;
    return { direction: norm(offset), point: add(origin, offset), time: t };
  }
  function perceive(e, context) {
    const target = context.targetAC;
    if (!target || target.alive === false || !valid(target.p)) { e.visible = false; return; }
    const offset = sub(target.p, e.p), distance = length(offset), fwd = forward(e.yaw, e.pitch);
    const visibility = clamp(Number.isFinite(context.visibility) ? context.visibility : 1, .05, 1);
    const cloud = clamp(Number.isFinite(context.cloud) ? context.cloud : 0, 0, 1);
    const inView = dot(norm(offset), fwd) > Math.cos(110 * PI / 180) || distance < 280;
    e.visible = inView && distance <= e._profile.sight * visibility * (1 - cloud * .78)
      && lineOfSight(e.p, target.p, context.terrainH);
    if (!e.visible) return;
    const previous = e.lastKnown, elapsed = e.time - e.lastSeen;
    let observed = valid(target.v) ? target.v.slice(0, 3) : [0, 0, 0];
    if (previous && elapsed > .04 && elapsed < 2) observed = mul(sub(target.p, previous), 1 / elapsed);
    const speed = length(observed); if (speed > 400) observed = mul(observed, 400 / speed);
    e.lastKnownVelocity = previous ? mix(e.lastKnownVelocity, observed, .6) : observed;
    e.lastKnown = target.p.slice(0, 3); e.lastSeen = e.time;
  }
  function damage(e, severity, source, position) {
    if (!e || !e.alive || !Number.isFinite(severity) || severity <= 0) return false;
    const amount = clamp(severity, 0, 1);
    e.health = Math.max(0, e.health - amount); e._damageSource = source || 'damage';
    if (source === 'flak' || source === 'aaa') {
      e.flakPressure = Math.min(3, e.flakPressure + amount * 2.5);
      e.flakAlarm = Math.max(e.flakAlarm, 4);
      if (valid(position)) e._flakAway = norm(sub(e.p, position));
    }
    if (e.health <= 0) e.alive = false;
    return true;
  }
  function flak(e, dt, context) {
    e.flakAlarm = Math.max(0, e.flakAlarm - dt);
    e.flakPressure = Math.max(0, e.flakPressure - dt * .045);
    const threat = context.flakThreat;
    const level = typeof threat === 'number' ? threat : threat && Number(threat.level);
    if (Number.isFinite(level) && level > .35) e.flakAlarm = Math.max(e.flakAlarm, 1.3 + clamp(level, 0, 1) * 2);
    if (threat && valid(threat.direction)) e._flakAway = mul(norm(threat.direction), -1);
    const impacts = threat && Array.isArray(threat.impacts) ? threat.impacts.slice(-32) : [];
    for (const impact of impacts) {
      if (!impact || !valid(impact.p) || impact.id === undefined || e._flakIds.includes(impact.id)) continue;
      e._flakIds.push(impact.id); if (e._flakIds.length > 128) e._flakIds.shift();
      const distance = length(sub(e.p, impact.p)), radius = clamp(Number(impact.radius) || 55, 4, 180);
      const power = clamp(Number(impact.power) || 1, .05, 2), nearRadius = Math.max(radius * 3, 220);
      if (distance < nearRadius) {
        e.flakAlarm = Math.max(e.flakAlarm, 4);
        e.flakPressure = Math.min(3, e.flakPressure + (1 - distance / nearRadius) * .55 * power);
        e._flakAway = norm(sub(e.p, impact.p));
      }
      if (distance < radius) {
        const severity = (1 - distance / radius) * .28 * power;
        damage(e, severity, 'flak', impact.p);
        emit(e, context, { type: 'enemyHit', severity, source: 'flak', p: e.p.slice(), health: e.health });
      }
    }
  }
  function knowledge(e) {
    if (!e.lastKnown) return null;
    // Dead reckoning lasts at most two seconds: turns made behind terrain
    // are genuinely unknown, even while a larger search area remains active.
    return add(e.lastKnown, mul(e.lastKnownVelocity, Math.min(2, Math.max(0, e.time - e.lastSeen))));
  }
  function choose(e, context) {
    const known = knowledge(e), age = e.time - e.lastSeen;
    if (!e.alive) { transition(e, 'DESTROYED', context); return null; }
    if (e.health < .40 || e.flakPressure >= 1.35 || e.disengaged) {
      e.disengaged = true; transition(e, 'DISENGAGE', context);
    } else if (e.flakAlarm > 0) transition(e, 'EVADE_FLAK', context);
    else if (e.state === 'EVADE_FLAK') transition(e, e.visible ? 'REPOSITION' : 'REACQUIRE', context);
    if (e.state === 'DISENGAGE' || e.state === 'EVADE_FLAK') {
      let away = e._flakAway || (known ? norm(sub(e.p, known)) : forward(e.yaw + .7, .15));
      if (Math.hypot(away[0], away[2]) < .15) away = forward(e.yaw + e._evadeSign * .75, .1);
      const point = add(e.p, mul(away, 2400)); point[1] = e.p[1] + (e.state === 'DISENGAGE' ? 380 : 180);
      return { point, speed: e.state === 'DISENGAGE' ? 300 : 268 };
    }
    if (e.visible && e.state === 'PATROL') transition(e, 'DETECT', context);
    if (e.state === 'DETECT' && e.stateTime >= e._profile.reaction) transition(e, 'INTERCEPT', context);
    if (!e.visible && known && age > 1.2 && e.state !== 'PATROL') transition(e, 'REACQUIRE', context);
    if (e.state === 'REACQUIRE' && e.visible) transition(e, 'INTERCEPT', context);
    if (e.state === 'REACQUIRE' && age > e._profile.memory) transition(e, 'PATROL', context);
    if (!known || e.state === 'PATROL') {
      const a = e.time * .035;
      return { point: add(e._origin, [Math.sin(a) * 4800, 100 * Math.sin(a * 2), -Math.cos(a) * 4800]), speed: 235 };
    }
    if (e.state === 'DETECT') return { point: known, speed: 235 };
    if (e.state === 'REACQUIRE') {
      const search = e.stateTime * .6, radius = Math.min(1300, 120 + age * 90);
      return { point: add(known, [Math.sin(search) * radius, 90, Math.cos(search) * radius]), speed: 225 };
    }
    const offset = sub(known, e.p), range = length(offset), targetForward = norm(e.lastKnownVelocity);
    const closing = dot(sub(e.v, e.lastKnownVelocity), norm(offset));
    const ahead = dot(sub(e.p, known), targetForward);
    if ((e.state === 'ATTACK' || e.state === 'PURSUIT' || e.state === 'INTERCEPT') &&
      ((range < 330 && closing > 55) || (ahead > 90 && range < 850))) {
      e._evadeSign = random(e) < .5 ? -1 : 1; transition(e, 'OVERSHOOT', context);
    }
    if (e.state === 'OVERSHOOT') {
      if (e.stateTime > 2.8) transition(e, 'REPOSITION', context);
      else {
        const f = forward(e.yaw + e._evadeSign * .5, .1);
        return { point: add(e.p, mul(f, 1200)), speed: Math.max(160, length(e.lastKnownVelocity) - 20) };
      }
    }
    if (e.state === 'REPOSITION') {
      const right = [targetForward[2] * -1, 0, targetForward[0]], point = add(add(known, mul(targetForward, -850)), mul(right, e._evadeSign * 400));
      point[1] += 100;
      if (e.stateTime > 5 || length(sub(point, e.p)) < 280) transition(e, 'INTERCEPT', context);
      else return { point, speed: 245 };
    }
    if (e.state === 'INTERCEPT' && range < 1700) transition(e, 'PURSUIT', context);
    const intercept = lead(e.p, e.v, known, e.lastKnownVelocity), aligned = dot(forward(e.yaw, e.pitch), intercept.direction);
    const rear = dot(norm(sub(e.p, known)), targetForward) < -.15;
    const firing = e.visible && age < .42 && range > 180 && range < 1150 && aligned > Math.cos(.057) && rear;
    if (firing && e.ammo > 0 && e._cooldown <= 0) transition(e, 'ATTACK', context);
    else if (e.state === 'ATTACK' && (!firing || e._cooldown > 0)) transition(e, 'PURSUIT', context);
    let point;
    if (range > 1800) {
      const t = clamp(range / Math.max(e.speed, 160), .3, 5);
      point = add(known, mul(e.lastKnownVelocity, t));
    } else point = intercept.point;
    const desired = clamp(length(e.lastKnownVelocity) + clamp((range - 450) * .055, -30, 75), 165, 290);
    return { point, speed: desired * e._profile.aggression, firing, intercept };
  }
  function fly(e, dt, command, context) {
    if (!command) return;
    const terrain = typeof context.terrainH === 'function' ? context.terrainH : flatGround;
    const offset = sub(command.point, e.p), yawTarget = Math.atan2(offset[0], -offset[2]), error = wrap(yawTarget - e.yaw);
    const bankTarget = clamp(Math.atan2(error * Math.max(e.speed, 150) * 1.8, G), -limits.maxBank, limits.maxBank);
    e.roll += clamp(bankTarget - e.roll, -limits.maxRollRate * dt, limits.maxRollRate * dt);
    const turnRate = clamp(G * Math.tan(e.roll) / Math.max(e.speed, 132), -limits.maxTurnRate, limits.maxTurnRate);
    e.yaw = wrap(e.yaw + turnRate * dt);
    let pitchTarget = clamp(Math.atan2(offset[1], Math.max(500, Math.hypot(offset[0], offset[2]))), -.40, .30);
    const f = forward(e.yaw, 0), ahead = add(e.p, mul(f, Math.max(400, e.speed * 3)));
    const floor = Math.max(0, terrain(ahead[0], ahead[2]));
    if (e.p[1] - floor < 140) pitchTarget = Math.max(pitchTarget, clamp((floor + 190 - e.p[1]) / 500, .08, .38));
    e.pitch += clamp(pitchTarget - e.pitch, -limits.maxPitchRate * dt, limits.maxPitchRate * dt);
    const energy = Math.abs(Math.sin(e.roll)) * 20 + Math.max(0, Math.sin(e.pitch)) * 30;
    const targetSpeed = clamp(command.speed - energy - (1 - e.health) * 45, limits.minSpeed, limits.maxSpeed);
    e.speed += clamp((targetSpeed - e.speed) * .9, -limits.maxDeceleration * dt, limits.maxAcceleration * dt);
    e.speed = clamp(e.speed, limits.minSpeed, limits.maxSpeed);
    e.v = mul(forward(e.yaw, e.pitch), e.speed);
    e.p = add(e.p, mul(e.v, dt));
    const ground = terrain(e.p[0], e.p[2]);
    if (!Number.isFinite(ground) || e.p[1] <= Math.max(0, ground) + 3) {
      e.health = 0; e.alive = false; e._damageSource = 'terrain'; transition(e, 'DESTROYED', context);
      emit(e, context, { type: 'enemyDestroyed', source: 'terrain', p: e.p.slice() });
    }
  }
  function shoot(e, dt, command, context) {
    e._cooldown = Math.max(0, e._cooldown - dt);
    if (!e.alive || e.state !== 'ATTACK' || !command || !command.firing || e.ammo <= 0) return;
    if (e._burstRemaining <= 0) {
      if (e._cooldown > 0) return;
      e._burstRemaining = e._profile.burst; e._shotClock = 0; e.bursts++;
    }
    const activeTime = Math.min(dt, e._burstRemaining);
    // Fire on [burstStart, burstEnd), excluding the end boundary. Advancing
    // this clock by the active portion avoids an extra seventh shell at
    // 60 Hz that a 120 Hz frame sequence would not have emitted.
    while (e._shotClock < activeTime - 1e-9 && e.ammo > 0 && e.projectiles.length < MAX_PROJECTILES) {
      e._shotClock += 1 / limits.fireRate;
      const f = forward(e.yaw, e.pitch), muzzle = add(e.p, mul(f, 6.2));
      // Gun mount is fixed forward. Tracking gates the attack; dispersion
      // changes shell paths, never grants a probabilistic automatic hit.
      const spread = e._profile.spread, dx = (random(e) - .5) * 2 * spread, dy = (random(e) - .5) * 2 * spread;
      const right = [Math.cos(e.yaw), 0, Math.sin(e.yaw)];
      const direction = norm(add(add(f, mul(right, dx)), [0, dy, 0]));
      const v = add(e.v, mul(direction, limits.muzzleSpeed));
      const q = { id: ++e._id, p: muzzle, prev: muzzle.slice(), v, age: 0, life: limits.projectileLife, damage: e._profile.damage };
      e.projectiles.push(q); e.ammo--; e.roundsFired++;
      emit(e, context, { type: 'tracer', id: q.id, p: q.p.slice(), v: q.v.slice(), life: q.life, color: [1, .48, .12] });
      emit(e, context, { type: 'muzzle', p: muzzle.slice(), scale: 2.4, life: .045 });
    }
    e._shotClock -= activeTime; e._burstRemaining = Math.max(0, e._burstRemaining - activeTime);
    if (e._burstRemaining < 1e-9 || e.ammo <= 0) { e._burstRemaining = 0; e._cooldown = e._profile.cooldown; }
  }
  function segmentDistanceSquared(a, b) {
    const d = sub(b, a), n = dot(d, d), t = n > 1e-12 ? clamp(-dot(a, d) / n, 0, 1) : 0;
    const p = add(a, mul(d, t)); return dot(p, p);
  }
  function projectiles(e, dt, targetStart, targetEnd, context) {
    const target = context.targetAC, terrain = typeof context.terrainH === 'function' ? context.terrainH : flatGround;
    for (let i = e.projectiles.length - 1; i >= 0; i--) {
      const q = e.projectiles[i]; q.prev = q.p.slice();
      q.p = add(q.p, mul(q.v, dt)); q.p[1] -= .5 * G * dt * dt; q.v[1] -= G * dt; q.age += dt;
      const hit = target && target.alive !== false && valid(targetStart) && valid(targetEnd)
        && segmentDistanceSquared(sub(q.prev, targetStart), sub(q.p, targetEnd)) <= limits.targetRadius ** 2;
      if (hit) {
        e.hits++; e.projectiles.splice(i, 1);
        if (typeof context.hitAircraft === 'function') context.hitAircraft(target, q.damage, 'mig-cannon');
        emit(e, context, { type: 'cannonHit', projectileId: q.id, p: targetEnd.slice(), severity: q.damage, source: 'mig-cannon' });
      } else if (q.age >= q.life || q.p[1] <= Math.max(0, terrain(q.p[0], q.p[2]))) e.projectiles.splice(i, 1);
    }
  }
  function step(e, dt, context) {
    const c = context || {};
    if (!e || c.paused || !Number.isFinite(dt) || dt <= 0) return [];
    e._events = [];
    const elapsed = Math.min(dt, 1), count = Math.ceil(elapsed / limits.substep), h = elapsed / count;
    const target = c.targetAC, targetEnd = target && valid(target.p) ? target.p.slice() : null;
    if (!target || target.alive === false || !targetEnd) e.visible = false;
    const targetStart = targetEnd ? e._targetPrevious || (valid(target.v) ? sub(targetEnd, mul(target.v, elapsed)) : targetEnd.slice()) : null;
    for (let i = 0; i < count; i++) {
      e.time += h; e.stateTime += h; e._sensor -= h;
      const a = targetEnd ? mix(targetStart, targetEnd, i / count) : null;
      const b = targetEnd ? mix(targetStart, targetEnd, (i + 1) / count) : null;
      if (e.alive) {
        flak(e, h, c);
        if (e._sensor <= 0) { perceive(e, c); e._sensor += e._profile.sensor; }
        const command = choose(e, c); fly(e, h, command, c); shoot(e, h, command, c);
      } else if (e.state !== 'DESTROYED') {
        transition(e, 'DESTROYED', c);
        emit(e, c, { type: 'enemyDestroyed', source: e._damageSource || 'damage', p: e.p.slice() });
      }
      projectiles(e, h, a, b, c);
    }
    if (targetEnd) e._targetPrevious = targetEnd;
    return e._events;
  }
  global.WillardInterceptor = Object.freeze({ create, step, damage, lineOfSight, lead, profiles, limits });
})(typeof window !== 'undefined' ? window : globalThis);
