/* Parachute/tree contact and water movement for the existing survival game.
 * Tree encounters come from actual scenery, not a random injury timer.
 * Injuries and swimming stamina are bounded gameplay abstractions. */
(function (root) {
  'use strict';
  const VERSION = 1, MAX_TREES = 28, CUT_TIME = 1.8, RELEASE_TIME = 3, PURSUER_STROKE = .65;
  const states = new WeakMap(), renderers = new WeakMap();
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = (n, f = 0) => Number.isFinite(n) ? n : f;
  const point = p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite);
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  let config = {}, installed = false;
  function active(g) {
    const a = g && g.app, d = root.document;
    return !!(g && !g.paused && !g.result && !g._capturePending && !(d && d.hidden) &&
      (!a || (!a.game || a.game === g) && (!a.screen || a.screen === 'game') && !a.graphicsContextLost));
  }
  function state(g) {
    let s = states.get(g);
    if (!s) { s = { actor: null, dt: 0, before: null, cutHeld: false, treeCache: null, riverP: null, riverMode: '', nextRiverHint: 0 }; states.set(g, s); }
    return s;
  }
  function terrain(g, x, z, c = config) {
    const h = typeof c.terrainH === 'function' ? c.terrainH(x, z) : 0;
    return Number.isFinite(h) ? h : NaN;
  }
  function notify(g, text, tone = 'warn') {
    const target = g.evade || g.chute;
    if (target) target.landingMessage = { text, until: finite(g.t) + 9 };
    if (g.app && typeof g.app.radio === 'function') g.app.radio('CREW', text, tone);
  }
  function surface(g, x, z, c = config) {
    if (typeof c.waterLevel === 'function') return finite(c.waterLevel(g, x, z));
    if (Number.isFinite(g && g.pow && g.pow.river && g.pow.river.waterY)) return g.pow.river.waterY;
    const t = finite(g && g.t), h = terrain(g, x, z, c), wave = finite(g && g.atm && g.atm.wave, .35);
    const u = clamp((h + 2) / -22, 0, 1), shore = u * u * (3 - 2 * u);
    return (Math.sin(x * .055 + t * 1.7) * .30 + Math.sin(z * .047 - t * 1.3) * .26 +
      Math.sin(x * .6 + z * .42 + t * 3.1) * .10 + Math.sin(x * .021 - z * .033 + t * .8) * .75) * wave * shore;
  }
  function groundEligible(g) { return !!(g && g.evade && point(g.evade.p) && !g.pow && !g.evade.camp && !g.evade.river); }
  function waterState(g, c = config) {
    if (!groundEligible(g)) return null;
    const e = g.evade;
    let w = e.landingWater;
    if (!w || w.version !== VERSION) w = e.landingWater = { version: VERSION, swimming: false, strokeTravel: 0, phase: 0, strokes: 0, injury: null };
    const h = terrain(g, e.p[0], e.p[2], c);
    if (Number.isFinite(h)) w.swimming = w.swimming ? h < .12 : h < -.4;
    e.swimming = !!w.swimming;
    return w;
  }
  function swimming(g) { return !!waterState(g)?.swimming; }
  function movementFactor(g) {
    const injury = g && g.evade && g.evade.landingWater && g.evade.landingWater.injury;
    return injury && injury.age < injury.duration ? clamp(injury.factor, .6, 1) : 1;
  }
  function splash(g, gain = 1) {
    const a = g && g.app, audio = a && a.audio;
    if (a && a.set && a.set.sound && audio && typeof audio.footfall === 'function') audio.footfall(true, gain > 1.05);
  }
  function enterGround(g, c = config) {
    if (!groundEligible(g)) return false;
    const w = waterState(g, c), pending = g._landingFromTree;
    if (pending) {
      if (pending.injury) w.injury = { ...pending.injury, age: 0 };
      g.evade.chute = pending.anchor.slice();
      g.evade.treeLanding = { treeId: pending.treeId, cutAway: true, fallHeight: pending.fallHeight };
      delete g._landingFromTree;
      notify(g, w.injury ? 'Clear of the canopy. The landing injury slows you; move carefully.' : 'Clear of the canopy. Move away from the tree.');
    }
    if (w.swimming) {
      g.evade.crouch = false; g.evade.running = false;
      notify(g, 'In the water. Swim toward shore or use the survival radio for rescue.');
      splash(g, 1.15);
    }
    state(g).actor = g.evade;
    return true;
  }
  function travel(g, dt, amount, c = config) {
    const w = waterState(g, c);
    if (!w || !active(g) || !Number.isFinite(dt) || dt <= 0) return false;
    if (w.injury) { w.injury.age = Math.max(0, finite(w.injury.age)) + Math.min(dt, .25); if (w.injury.age >= w.injury.duration) w.injury = null; }
    if (!w.swimming) return false;
    const e = g.evade;
    e.running = false; e.stepTravel = 0;
    if (Number.isFinite(amount) && amount > 0 && amount < Math.max(.6, dt * 6)) {
      w.strokeTravel += amount; w.phase = (w.phase + amount / .9) % 1;
      if (w.strokeTravel >= .9) { w.strokeTravel %= .9; w.strokes++; splash(g); }
    }
    return true;
  }
  function camera(g, eye, c = config) {
    if (!point(eye) || !groundEligible(g) || distance(eye, g.evade.p) > 2) return eye;
    const w = waterState(g, c), s = state(g);
    if (!w.swimming && (!s.waterCamera || s.waterCamera.actor !== g.evade)) return eye;
    const bob = g.evade.moving ? Math.sin(w.phase * Math.PI * 2) * .025 : Math.sin(finite(g.t) * .9) * .012;
    const target = w.swimming ? surface(g, g.evade.p[0], g.evade.p[2], c) + .38 + bob : eye[1], now = finite(g.t);
    if (!s.waterCamera || s.waterCamera.actor !== g.evade) s.waterCamera = { actor: g.evade, y: target, at: now };
    const cache = s.waterCamera, dt = clamp(now - cache.at, 0, .25); cache.at = now;
    cache.y += (target - cache.y) * (1 - Math.exp(-8 * dt));
    if (!w.swimming) cache.y = Math.max(cache.y, finite(terrain(g, g.evade.p[0], g.evade.p[2], c)) + .2);
    const result = [eye[0], cache.y, eye[2]];
    if (!w.swimming && Math.abs(cache.y - target) < .002) s.waterCamera = null;
    return result;
  }
  function collectTrees(g, before, after, c = config) {
    if (typeof c.trees === 'function') return (c.trees(g, before, after) || []).slice(0, MAX_TREES);
    const s = state(g), w = g.world, centre = after || before, cached = s.treeCache;
    if (cached && cached.world === w && distance(cached.p, centre) < 12 && finite(g.t) - cached.at < .4) return cached.trees;
    const rows = [], seen = new Set(), sizes = { tree: [13.7, 5.1, .85], palm: [11, 3.6, .44], bamboo: [7.9, 2.55, .8] };
    const add = o => {
      if (!o || !sizes[o.m] || !point(o.p)) return;
      const scale = clamp(finite(o.s, 1), .3, 3), spec = sizes[o.m], reach = spec[1] * scale + 9;
      if (distance(o.p, centre) > reach + 8) return;
      const id = o.m + ':' + o.p[0].toFixed(2) + ':' + o.p[2].toFixed(2); if (seen.has(id)) return; seen.add(id);
      const y = terrain(g, o.p[0], o.p[2], c); if (!Number.isFinite(y) || y < .2) return;
      rows.push({ id, kind: o.m, p: [o.p[0], y, o.p[2]], height: spec[0] * scale, crownRadius: spec[1] * scale, trunkRadius: spec[2] * scale });
    };
    for (const o of w && w.scenery || []) add(o);
    if (w && w._cells) {
      const x = Math.round(centre[0] / 170), z = Math.round(centre[2] / 170);
      for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) for (const o of w._cells.get((x + ix) * 65536 + z + iz) || []) add(o);
    }
    if (c.JungleScenery && typeof c.JungleScenery.obstacles === 'function') for (const o of c.JungleScenery.obstacles(g)) {
      if (!point(o.p) || distance(o.p, centre) > 20) continue;
      rows.push({ id: o.id, kind: o.kind, p: o.p.slice(), height: o.kind === 'bamboo' ? 7.4 : 13.6, crownRadius: o.kind === 'bamboo' ? 2.6 : 5.1, trunkRadius: finite(o.radius, .5) });
    }
    rows.sort((a, b) => distance(a.p, centre) - distance(b.p, centre));
    s.treeCache = { world: w, p: centre.slice(), at: finite(g.t), trees: rows.slice(0, MAX_TREES) };
    return s.treeCache.trees;
  }
  function canopyContact(previous, current, canopy, candidates) {
    if (!point(current) || !canopy || finite(canopy.open) < .55 || finite(canopy.verticalSpeed) >= 0) return null;
    const start = point(previous) ? previous : current, end = current;
    let hit = null;
    for (const tree of (candidates || []).slice(0, MAX_TREES)) {
      if (!tree || !point(tree.p) || !Number.isFinite(tree.height) || tree.height < 3 || !Number.isFinite(tree.crownRadius)) continue;
      const top = tree.p[1] + tree.height, bottom = top - Math.max(2.2, tree.height * .36), radius = tree.crownRadius + 1.45;
      for (let i = 0; i <= 8; i++) {
        const u = i / 8, p = start.map((n, j) => n + (end[j] - n) * u), canopy = p[1] + 4.6;
        if (canopy > top + .2 || canopy < bottom || distance(p, tree.p) > radius) continue;
        if (!hit || u < hit.u) hit = { tree, p, u, top };
        break;
      }
    }
    if (hit) hit.branch = distance(hit.p, hit.tree.p) < finite(hit.tree.trunkRadius, .65) + .35 && -canopy.verticalSpeed > 4.5;
    return hit;
  }
  function contact(g, previous, c = config) {
    const chute = g && g.chute;
    if (!active(g) || !chute || !point(chute.p) || chute.landing) return false;
    const start = point(previous) ? previous : chute.p, hit = canopyContact(start, chute.p, { open: chute.open, verticalSpeed: finite(chute.v && chute.v[1]) }, collectTrees(g, start, chute.p, c));
    if (!hit) return false;
    const tree = hit.tree;
    const branch = hit.branch;
    const injury = branch ? { kind: 'branch puncture', factor: .68, duration: 120, age: 0 } : null;
    // The harness swings beside the wood instead of embedding the camera in
    // the trunk. This also leaves a physically clear vertical cutaway path.
    const offset = finite(tree.trunkRadius, .65) + .85, dx = hit.p[0] - tree.p[0], dz = hit.p[2] - tree.p[2], radial = Math.hypot(dx, dz);
    if (radial < offset) {
      const angle = radial > .01 ? Math.atan2(dx, -dz) : finite(chute.drift);
      hit.p[0] = tree.p[0] + Math.sin(angle) * offset; hit.p[2] = tree.p[2] - Math.cos(angle) * offset;
    }
    const ground = terrain(g, hit.p[0], hit.p[2], c), y = Math.max(finite(ground, tree.p[1]) + 2.2, hit.p[1]);
    chute.landing = { version: VERSION, mode: 'hung', treeId: String(tree.id || 'tree'), anchor: [tree.p[0], tree.p[2]], p: [hit.p[0], y, hit.p[2]], top: hit.top, age: 0, progress: 0, hasKnife: chute.hasKnife !== false, injury };
    chute.p = chute.landing.p.slice(); chute.v = [0, 0, 0]; chute.cineT = Math.max(finite(chute.cine), finite(chute.cineT));
    notify(g, branch ? 'A sharp branch injures your leg as the canopy snags. Hold V or use CUT FREE to cut the lines.' : 'The canopy is caught in the tree. Hold V or use CUT FREE with the survival knife.');
    return true;
  }
  function release(g, c = config) {
    const chute = g && g.chute, hang = chute && chute.landing;
    if (!hang || hang.mode !== 'hung' || !active(g)) return false;
    let best = null, bestDistance = Infinity;
    const solid = typeof c.solidAt === 'function' ? (x, z) => c.solidAt(g, x, z, .45) : (x, z) => !!(g._localSolidAt && g._localSolidAt(x, z, .45));
    for (const radius of [1.8, 2.5, 3.4, 4.5]) for (let i = 0; i < 12; i++) {
      const angle = finite(chute.drift) + i / 12 * Math.PI * 2, x = hang.anchor[0] + Math.sin(angle) * radius, z = hang.anchor[1] - Math.cos(angle) * radius;
      const h = terrain(g, x, z, c), d = Math.hypot(x - chute.p[0], z - chute.p[2]);
      if (!Number.isFinite(h) || solid(x, z) || h > chute.p[1] - 1.6 || d >= bestDistance) continue;
      best = [x, h, z]; bestDistance = d;
    }
    if (!best) { notify(g, 'The branches below are blocked. Turn the canopy and try the other side before cutting.'); hang.progress = 0; return false; }
    hang.mode = 'falling'; hang.target = best; hang.fallHeight = Math.max(0, chute.p[1] - 1.6 - best[1]);
    g.landingCanopy = { p: [chute.p[0], chute.p[1] + 4.6, chute.p[2]], treeId: hang.treeId, age: 0 };
    chute.open = 0; chute.landingReleased = true; chute.v = [0, -.7, 0];
    if (hang.fallHeight > 3.5 && !hang.injury) hang.injury = { kind: 'hard landing', factor: .78, duration: 70, age: 0 };
    notify(g, 'Lines cut. Brace for the drop.');
    return true;
  }
  function chuteStep(g, dt, c = config) {
    const chute = g && g.chute, h = chute && chute.landing;
    if (!chute || !h) return false;
    if (!active(g) || !Number.isFinite(dt) || dt <= 0) { state(g).cutHeld = false; return true; }
    dt = Math.min(dt, .1); h.age += dt; chute.t = finite(chute.t) + dt;
    const keys = g.app && g.app.keys || {}, touch = g.app && g.app.gctl || {};
    if (h.mode === 'hung') {
      chute.drift = finite(chute.drift) + clamp((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + finite(touch.roll), -1, 1) * dt * .55;
      chute.p = [h.p[0] + Math.sin(h.age * 1.4) * .07, h.p[1] + Math.sin(h.age * 1.1) * .025, h.p[2]];
      const held = state(g).cutHeld || keys.KeyV || touch.cutaway;
      h.progress = held ? Math.min(1, h.progress + dt / (h.hasKnife ? CUT_TIME : RELEASE_TIME)) : Math.max(0, h.progress - dt * .8);
      if (h.progress >= 1) release(g, c);
      return true;
    }
    if (h.mode === 'falling') {
      const dx = h.target[0] - chute.p[0], dz = h.target[2] - chute.p[2], d = Math.hypot(dx, dz), pace = Math.min(d, dt * 2.1);
      if (d > .001) { chute.p[0] += dx / d * pace; chute.p[2] += dz / d * pace; }
      chute.v[1] = Math.max(-14, chute.v[1] - dt * 9.81); chute.p[1] += chute.v[1] * dt;
      const floor = Math.max(0, finite(terrain(g, chute.p[0], chute.p[2], c)));
      if (chute.p[1] <= floor + 1.6) {
        chute.p[1] = floor + 1.6;
        g._landingFromTree = { treeId: h.treeId, anchor: h.anchor.slice(), injury: h.injury && { ...h.injury }, fallHeight: h.fallHeight };
        h.mode = 'landed';
        if (typeof c.onGround === 'function') c.onGround(g); else if (typeof g.onGround === 'function') g.onGround();
      }
      return true;
    }
    return true;
  }
  function riverActorStep(g, a, dt, P = config.POW || root.POW) {
    const p = g && g.pow, r = p && p.river, e = g && g.evade;
    if (!active(g) || !r || !e || r.finished || r.phase === 'gulf' || !a || a.alive === false || a.armed === false || !['nva', 'vc', 'militia', 'guard', 'soldier', 'sentry'].includes(a.kind) || !point(a.p) || !Number.isFinite(dt) || dt <= 0) return false;
    dt = Math.min(dt, .1);
    const center = p.base[0] + 94, half = 14.5, playerWater = Math.abs(e.p[0] - center) < half && !r.boatOwned;
    const visible = a.visible === true && !r.submerged, recent = finite(p.aiClock) - finite(a.lastSight, -999) < 4;
    let swim = a.riverPursuit;
    if (swim && swim.mode === 'done' && finite(p.aiClock) >= finite(a.riverRetryAt)) { delete a.riverPursuit; swim = null; }
    if (!swim) {
      if (!playerWater || a.state !== 'pursuit' || !(visible || recent) || Math.abs(Math.abs(a.p[0] - center) - half) > 2.2 || distance(a.p, e.p) > 23) return false;
      if ((e.searchers || []).filter(o => o !== a && o.riverPursuit && o.riverPursuit.mode !== 'done').length >= 2) return false;
      if (finite(p.aiClock) < finite(a.riverRetryAt)) return false;
      swim = a.riverPursuit = { mode: 'warn', age: 0, travel: 0, phase: 0, side: a.p[0] >= center ? 1 : -1, ageTotal: 0 };
      notify(g, 'A pursuer is preparing to enter the river. Keep moving; the banks remain an escape route.');
    }
    if (swim.mode === 'done') return false;
    swim.age += dt; swim.ageTotal += dt;
    if (swim.mode === 'warn') {
      const observed = visible ? e.p : point(a.lastKnown) ? a.lastKnown : a.p;
      a.spd = 0; a.face = Math.atan2(observed[0] - a.p[0], -(observed[2] - a.p[2]));
      if (!playerWater) { a.riverRetryAt = finite(p.aiClock) + 8; swim.mode = 'done'; return false; }
      if (swim.age < 1.15) return true;
      swim.mode = 'enter'; swim.age = 0; swim.entryAge = 0; swim.entryY = a.p[1];
    }
    const inside = Math.abs(a.p[0] - center) < half;
    if (inside) swim.mode = swim.mode === 'return' ? 'return' : 'swim';
    if (!playerWater || !recent && !visible || swim.ageTotal > 22) swim.mode = 'return';
    const goal = swim.mode === 'return' ? [center + swim.side * (half + 1.2), r.waterY + .35, a.p[2]] : visible ? e.p : point(a.lastKnown) ? a.lastKnown : a.p;
    const dx = goal[0] - a.p[0], dz = goal[2] - a.p[2], d = Math.hypot(dx, dz), speed = inside ? 1.0 : swim.mode === 'enter' ? 1.7 : 1.5;
    // Complete horizontal swimming photographs share the player's waterline.
    // Their .70 m canvas rises from this anchor; an upright-body offset would
    // put the entire swimmer below the actual river surface.
    const old = a.p.slice(), waterDepth = r.waterY - .42;
    if (!(Number.isFinite(swim.entryAge) && swim.entryAge < .75)) a.p[1] = inside ? waterDepth : r.waterY + .35;
    const travelAmount = Math.min(d, speed * dt), drift = inside ? .35 * dt : 0;
    if (d > .001 && P && typeof P.move === 'function') P.move(g, a, dx / d * travelAmount, dz / d * travelAmount + drift, .31);
    else if (d > .001 && typeof config.moveRiver === 'function') config.moveRiver(g, a, dx / d * travelAmount, dz / d * travelAmount + drift, .31);
    const nowInside = Math.abs(a.p[0] - center) < half;
    const actual = distance(old, a.p);
    if (Number.isFinite(swim.entryAge) && swim.entryAge < .75) {
      // A committed, collision-checked lunge into the water. A blocked actor
      // cannot consume the entry animation while standing against a wall.
      swim.entryAge = Math.min(.75, swim.entryAge + dt * clamp(actual / Math.max(.001, speed * dt), 0, 1));
      const u = swim.entryAge / .75, ease = u * u * (3 - 2 * u);
      a.p[1] = finite(swim.entryY, r.waterY + .35) + (waterDepth - finite(swim.entryY, r.waterY + .35)) * ease + Math.sin(Math.PI * u) * .30;
      a.riverEntering = u < 1;
    } else { a.p[1] = nowInside ? waterDepth + Math.sin(swim.phase * Math.PI * 2) * .025 : r.waterY + .35; a.riverEntering = false; }
    swim.travel += actual; swim.phase = (swim.phase + actual / PURSUER_STROKE) % 1;
    a.swimming = nowInside; a.swimPhase = swim.phase; a.waterY = r.waterY; a.spd = actual / dt;
    a.face = Math.atan2(dx, -dz); a.ph = finite(a.ph) + actual * 3.2;
    if (swim.mode === 'return' && !nowInside && Math.abs(a.p[0] - goal[0]) < .4) { swim.mode = 'done'; a.riverRetryAt = finite(p.aiClock) + 25; a.swimming = false; a.spd = 0; a.path = []; a.nextPlan = 0; }
    if (nowInside && actual > 0 && swim.travel >= PURSUER_STROKE) { swim.travel %= PURSUER_STROKE; if (distance(a.p, e.p) < 18) splash(g); }
    return true;
  }
  function riverStep(g, dt, P = config.POW || root.POW) {
    const p = g && g.pow, r = p && p.river, e = g && g.evade;
    if (!active(g) || !r || !e || !point(e.p) || !Number.isFinite(dt) || dt <= 0) return false;
    const s = state(g);
    if (s.riverActor !== e) { s.riverActor = e; s.riverP = null; s.riverMode = ''; s.riverStroke = 0; s.nextRiverHint = 0; }
    const previous = s.riverP;
    const onBank = r.mode === 'bank' || r.mode === 'hidden', mode = r.boatOwned ? 'boat' : onBank ? 'bank' : r.submerged ? 'dive' : 'swim';
    if (s.riverMode && s.riverMode !== mode && (mode === 'bank' || mode === 'swim')) notify(g, mode === 'bank' ? 'You are out on the bank. Walk, crouch into cover, or return to the water.' : 'Back in the river. Swim or aim diagonally toward either bank.');
    if (!s.riverMode || finite(p.time) >= s.nextRiverHint && mode === 'swim') { notify(g, 'Both riverbanks are reachable. Steer toward the bank to climb out and use cover.'); s.nextRiverHint = finite(p.time) + 45; }
    const input = p.input || {}, keys = g.app && g.app.keys || {}, touch = g.app && g.app.gctl || {};
    const forward = finite(input.forward, (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + finite(touch.pitch)), strafe = finite(input.strafe);
    const propelling = Math.abs(forward) + Math.abs(strafe) > .06;
    if (previous && distance(previous, e.p) < 3 && mode === 'swim' && e.moving && propelling && !r.submerged) {
      s.riverStroke = finite(s.riverStroke) + distance(previous, e.p);
      if (s.riverStroke >= .9) { s.riverStroke %= .9; splash(g); }
    }
    s.riverP = e.p.slice(); s.riverMode = mode;
    return true;
  }
  function view(g) {
    if (!g) return { active: false };
    const h = g.chute && g.chute.landing, w = groundEligible(g) ? waterState(g) : null;
    if (h) return { active: true, mode: h.mode, cutProgress: h.progress, hasKnife: h.hasKnife, injury: h.injury && { ...h.injury }, treeId: h.treeId };
    if (g.pow && g.pow.river) return { active: true, mode: g.pow.river.mode, swimming: !['bank', 'hidden', 'boat'].includes(g.pow.river.mode), pursuers: (g.evade.searchers || []).filter(a => a.swimming).length };
    return { active: !!w, mode: w && w.swimming ? 'swim' : 'land', swimming: !!w?.swimming, strokePhase: finite(w && w.phase), strokes: finite(w && w.strokes), injury: w && w.injury && { ...w.injury } };
  }
  function hud(g) {
    const d = root.document; if (!d || !d.createElement || !d.body) return;
    let node = d.getElementById('landingWaterHUD'); const h = g && g.chute && g.chute.landing;
    if (!g || !h || h.mode !== 'hung' || !active(g)) { if (g) state(g).cutHeld = false; if (node) node.remove(); return; }
    if (node && node._landingGame !== g) { node.remove(); node = null; }
    if (!node) {
      node = d.createElement('section'); node.id = 'landingWaterHUD'; node.setAttribute('role', 'status');
      node._landingGame = g;
      node.style.cssText = 'position:fixed;z-index:44;left:50%;top:72px;transform:translateX(-50%);max-width:min(88vw,430px);padding:10px;background:rgba(14,23,20,.92);color:#eee5ce;border:1px solid #9a8757;font:13px system-ui;text-align:center';
      const text = d.createElement('div'); text.className = 'landingWaterText'; node.appendChild(text);
      const toggle = d.createElement('button'); toggle.type = 'button'; toggle.className = 'btn'; toggle.id = 'landingHudToggle';
      toggle.addEventListener('click', () => { state(g).hudCollapsed = !state(g).hudCollapsed; state(g).cutHeld = false; hud(g); }); node.appendChild(toggle);
      const controls = d.createElement('div'); controls.className = 'landingWaterControls'; node.appendChild(controls);
      const button = d.createElement('button'); button.type = 'button'; button.className = 'btn'; button.id = 'landingCutaway';
      const hold = ev => { if (ev && ev.preventDefault) ev.preventDefault(); state(g).cutHeld = true; };
      const clear = () => { state(g).cutHeld = false; };
      button.addEventListener('pointerdown', hold); button.addEventListener('pointerup', clear); button.addEventListener('pointercancel', clear); button.addEventListener('pointerleave', clear);
      button.addEventListener('keydown', ev => { if (ev.code === 'Space' || ev.code === 'Enter') hold(ev); }); button.addEventListener('keyup', clear);
      controls.appendChild(button); d.body.appendChild(node);
    }
    node.querySelector('.landingWaterText').textContent = h.injury ? 'Caught in the branches · landing injury' : 'Parachute caught in the tree';
    node.querySelector('#landingHudToggle').textContent = state(g).hudCollapsed ? 'Show cutaway controls' : 'Hide cutaway controls';
    node.querySelector('.landingWaterControls').hidden = !!state(g).hudCollapsed;
    node.querySelector('#landingCutaway').textContent = (h.hasKnife ? 'Hold: CUT FREE with knife' : 'Hold: RELEASE HARNESS') + ' · ' + Math.round(h.progress * 100) + '%';
  }
  function install(c) {
    if (!c || !c.Game || installed) return false; config = { ...c }; installed = true;
    const G = c.Game.prototype, oldChute = G.stepChute, oldGround = G.onGround, oldEnter = G._startGroundPhase, oldStep = G.stepEvade, oldMove = G._moveOnFoot, oldFoot = G._groundFootfalls, oldRender = G.render;
    G.stepChute = function (dt) {
      const s = state(this), chute = this.chute; s.before = chute && point(chute.p) ? chute.p.slice() : null;
      if (chuteStep(this, dt)) { hud(this); return; }
      if (!active(this)) return;
      const result = oldChute.apply(this, arguments); if (this.chute === chute && chute) contact(this, s.before); hud(this); return result;
    };
    G.onGround = function () { const h = this.chute && this.chute.landing; if ((!h || h.mode !== 'landed') && contact(this, state(this).before)) { hud(this); return; } return oldGround.apply(this, arguments); };
    G._startGroundPhase = function () { const result = oldEnter.apply(this, arguments); enterGround(this); return result; };
    G.stepEvade = function (dt) { if (!active(this)) return; const s = state(this); s.dt = Math.min(.25, Math.max(0, finite(dt))); waterState(this); try { return oldStep.apply(this, arguments); } finally { s.dt = 0; hud(this); } };
    G._moveOnFoot = function (x, z, dx, dz, radius, actor) {
      if (actor === this.evade && groundEligible(this)) {
        const w = waterState(this), dt = state(this).dt, request = Math.hypot(dx, dz), nextH = terrain(this, x + dx, z + dz);
        if (dt > 0 && request > 0) {
          const injury = movementFactor(this), keys = this.app && this.app.keys || {}, touch = this.app && this.app.gctl || {}, fast = keys.ShiftLeft || keys.ShiftRight || touch.run;
          const water = w.swimming || Number.isFinite(nextH) && nextH < -.4, allowed = water ? (fast ? 1.35 : 1.0) * dt * injury : request * injury;
          if (request > allowed) { dx *= allowed / request; dz *= allowed / request; }
        }
      }
      return oldMove.call(this, x, z, dx, dz, radius, actor);
    };
    G._groundFootfalls = function (dt, e, amount) { if (e === this.evade && travel(this, dt, amount)) return; return oldFoot.apply(this, arguments); };
    G.render = function () {
      const r = this.rend;
      if (r && typeof r.setCamera === 'function') {
        if (!renderers.has(r)) { const set = r.setCamera; const record = { game: null }; renderers.set(r, record); r.setCamera = function (eye) { const args = Array.from(arguments); if (record.game) args[0] = camera(record.game, eye); return set.apply(this, args); }; }
        renderers.get(r).game = this;
      }
      try { return oldRender.apply(this, arguments); } finally { if (r && renderers.has(r)) renderers.get(r).game = null; hud(this); }
    };
    const P = c.POW || root.POW;
    if (P && P.River) { const oldRiver = P.River.step; P.River.step = function (g, dt) { const result = oldRiver.apply(this, arguments); riverStep(g, dt, P); return result; }; P.River.movePursuer = (g, a, dt) => riverActorStep(g, a, dt, P); }
    return true;
  }
  root.LandingWater = Object.freeze({ install, enterGround, swimming, movementFactor, surface, travel, camera, collectTrees, canopyContact, contact, chuteStep, release, riverActorStep, riverStep, view,
    limits: Object.freeze({ maxTrees: MAX_TREES, knifeHoldSeconds: CUT_TIME, harnessHoldSeconds: RELEASE_TIME, maxPursuers: 2, swimmerSpeed: 1, maxSwimSpeed: 1.35, pursuerStrokeMetres: PURSUER_STROKE, timers: 0 }) });
})(typeof window !== 'undefined' ? window : globalThis);
