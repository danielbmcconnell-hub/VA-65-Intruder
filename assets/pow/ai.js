/* Fictional patrols for the custom WebGL POW scenes. All saved actor state is data.
   Dialogue below is newly written game dialogue, with English translations. */
(function (global) {
  'use strict';
  const P = global.POW;
  if (!P) throw new Error('POW core must load before POW AI.');
  const PI = Math.PI, TAU = PI * 2;
  const grids = new WeakMap();
  const CAP = 18, DESKTOP_CAP = 24, EXPANSIONS = 2300;
  const CALLS = {
    investigate: ['Ai đó?', "Who's there?"],
    spotted: ['Đứng lại!', 'Stop!'],
    report: ['Có người lạ!', 'There is a stranger!'],
    search: ['Tìm quanh đây.', 'Search around here.'],
    clear: ['Không thấy ai.', 'No one in sight.']
  };
  const finite = (n, d) => Number.isFinite(n) ? n : d;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const point = p => [finite(p && p[0], 0), finite(p && p[1], 0), finite(p && p[2], 0)];
  const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
  const confined = s => s.stage === 'cell' || s.stage === 'solitary';
  const civilian = a => a.kind === 'farmer' || a.kind === 'villager' || a.armed === false;
  const ctx = () => P.ctx || {};
  const time = s => finite(s.aiClock, 0);
  function actors(game) {
    return game.evade ? game.evade.searchers || [] : [];
  }
  function say(game, a, key) {
    const s = game.pow, clock = time(s), call = CALLS[key];
    if (!call || clock < finite(a.chatterUntil, 0) || clock < finite(s.aiChatterUntil, 0)) return;
    a.chatter = {vi: call[0], en: call[1], until: clock + 3};
    a.chatterUntil = clock + 8;
    s.aiChatterUntil = clock + 1.8;
    if (P.notify) P.notify(game, call[0] + ' — ' + call[1]);
    if (game.app && typeof game.app.radio === 'function') game.app.radio(civilian(a) ? 'FARMER' : 'GUARD', call[0] + ' — ' + call[1], 'warn', 'vi-VN', call[0]);
  }
  function makeActor(options) {
    const o = options || {}, p = point(o.p), kind = o.kind || 'nva';
    const a = {
      id: o.id || 'patrol', p, home: point(o.home || p),
      goal: point(o.goal || p), route: (o.route || [p]).map(point),
      kind, armed: kind === 'farmer' || kind === 'villager' ? false : o.armed !== false,
      alive: o.alive !== false, face: finite(o.face, 0), spd: 0, ph: finite(o.ph, 0),
      seen: 0, sus: 0, lamp: !!o.lamp, state: 'patrol', wp: 0,
      dwell: finite(o.dwell, kind === 'farmer' ? 9 : 3),
      schedule: o.schedule || {cycle: 105, rounds: 78, offset: 0},
      senseAt: 0, bodyAt: 0, nextPlan: 0, path: [], pathIndex: 0,
      lastKnown: null, lastSight: -1000, searchUntil: 0, noticedBodies: [],
      grab: 0, flee: 0, heardSequence: 0, reportAt: 0, reported: false
    };
    return a;
  }
  function initActor(a, index, s) {
    // Restore older saves and legacy actors without resetting meaningful state.
    if (!a.id) a.id = 'patrol-' + index;
    a.p = point(a.p);
    if (!a.home) a.home = point(a.p);
    if (!a.goal) a.goal = point(a.p);
    if (!Array.isArray(a.route) || !a.route.length) a.route = [point(a.home), point(a.goal)];
    if (!a.state) a.state = a.seen ? 'pursuit' : 'patrol';
    if (!a.schedule) a.schedule = {cycle: 105, rounds: 78, offset: index * 13};
    if (!a.noticedBodies) a.noticedBodies = [];
    if (!Array.isArray(a.path)) a.path = [];
    a.face = finite(a.face, Math.atan2(a.goal[0] - a.p[0], -(a.goal[2] - a.p[2])));
    a.spd = finite(a.spd, 0); a.ph = finite(a.ph, 0); a.sus = finite(a.sus, 0);
    a.lastSight = finite(a.lastSight, -1000);
    a.wp = clamp(Math.floor(finite(a.wp, 0)), 0, a.route.length - 1);
    if (a.kind === 'farmer' || a.kind === 'villager') a.armed = false;
  }
  function blocked(game, x, z, r, y) {
    const s = game.pow;
    // Dry-land observers follow their own bank; they cannot walk on the channel.
    if (s && s.river && s.river.phase !== 'gulf' && Math.abs(x - (s.base[0] + 94)) < 14.5 + r) return true;
    return P.blocked ? P.blocked(game, x, z, r, y) : false;
  }
  function los(game, from, to) {
    return P.los ? P.los(game, from, to) : true;
  }
  function navFor(game, a) {
    const s = game.pow, b = s.base || [0, 0, 0];
    const n = s.nav || {minX: b[0] - 36, maxX: b[0] + 110, minZ: b[2] - 65, maxZ: b[2] + 100, cell: 1};
    const cell = Math.max(.6, finite(n.cell, 1));
    // Coarse floor keys share static occupancy, never live character obstacles.
    const y = Math.round(finite(a.p[1], b[1]) * 4) / 4;
    let cache = grids.get(game);
    const revision = String(s.navVersion || 0) + ':' + (s.solids || []).length;
    if (!cache || cache.revision !== revision || cache.nav !== n) {
      cache = {revision, nav: n, floors: new Map(), auditAt: 0, active: ''};
      grids.set(game, cache);
    }
    // Doors can change without replacing the solids array. Audit at most once a second.
    if (time(s) >= cache.auditAt) {
      const active = (s.solids || []).map(o => o.active === false ? '0' : '1').join('');
      if (cache.active !== active) { cache.floors.clear(); cache.active = active; }
      cache.auditAt = time(s) + 1;
    }
    if (!cache.floors.has(y)) cache.floors.set(y, {
      minX: n.minX, minZ: n.minZ, cell, y,
      cols: Math.floor((n.maxX - n.minX) / cell) + 1,
      rows: Math.floor((n.maxZ - n.minZ) / cell) + 1,
      pass: new Map(), edge: new Map()
    });
    return cache.floors.get(y);
  }
  function cellPoint(n, k) { return [n.minX + (k % n.cols) * n.cell, n.y, n.minZ + Math.floor(k / n.cols) * n.cell]; }
  function passable(game, n, k) {
    if (k < 0 || k >= n.cols * n.rows) return false;
    if (!n.pass.has(k)) {
      const p = cellPoint(n, k), s = game.pow;
      // An elevated patrol needs actual floor support, not empty air above a wall.
      const supported = !P.floorY || s.customMovement || p[1] <= s.base[1] + .75 || P.floorY(game, p[0], p[2], p[1]) >= p[1] - .45;
      n.pass.set(k, supported && !blocked(game, p[0], p[2], .34, p[1]));
    }
    return n.pass.get(k);
  }
  function edgeClear(game, n, from, to) {
    const key = Math.min(from, to) + ':' + Math.max(from, to);
    if (!n.edge.has(key)) {
      const a = cellPoint(n, from), b = cellPoint(n, to), count = Math.ceil(dist(a, b) / .18);
      let clear = true;
      for (let i = 1; i <= count && clear; i++) {
        const t = i / count;
        clear = !blocked(game, a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, .34, n.y);
      }
      n.edge.set(key, clear);
    }
    return n.edge.get(key);
  }
  function nearestCell(game, n, p) {
    const x = clamp(Math.round((p[0] - n.minX) / n.cell), 0, n.cols - 1);
    const z = clamp(Math.round((p[2] - n.minZ) / n.cell), 0, n.rows - 1);
    let best = -1, score = Infinity;
    for (let ring = 0; ring <= 5; ring++) {
      for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const ix = x + dx, iz = z + dz;
        if (ix < 0 || iz < 0 || ix >= n.cols || iz >= n.rows) continue;
        const k = iz * n.cols + ix;
        if (!passable(game, n, k)) continue;
        const cp = cellPoint(n, k), d = dist(cp, p);
        if (d < score) { best = k; score = d; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  function planPath(game, a, target) {
    const n = navFor(game, a), start = nearestCell(game, n, a.p), end = nearestCell(game, n, target);
    a.planExpansions = 0;
    if (start < 0 || end < 0) return [];
    const heuristic = k => Math.abs(k % n.cols - end % n.cols) + Math.abs(Math.floor(k / n.cols) - Math.floor(end / n.cols));
    const heap = [], costs = new Map([[start, 0]]), prev = new Map(), closed = new Set();
    const push = (k, score) => {
      let i = heap.length; heap.push({k, score});
      while (i) { const p = (i - 1) >> 1; if (heap[p].score <= score) break; heap[i] = heap[p]; i = p; }
      heap[i] = {k, score};
    };
    const pop = () => {
      const first = heap[0], last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
          if (heap[child].score >= last.score) break;
          heap[i] = heap[child]; i = child;
        }
        heap[i] = last;
      }
      return first.k;
    };
    push(start, heuristic(start));
    let found = false;
    while (heap.length && a.planExpansions < EXPANSIONS) {
      const k = pop(); if (closed.has(k)) continue;
      if (k === end) { found = true; break; }
      closed.add(k); a.planExpansions++;
      const x = k % n.cols, z = Math.floor(k / n.cols);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ix = x + dx, iz = z + dz, next = iz * n.cols + ix;
        if (ix < 0 || iz < 0 || ix >= n.cols || iz >= n.rows || closed.has(next)) continue;
        if (!passable(game, n, next) || !edgeClear(game, n, k, next)) continue;
        const cost = costs.get(k) + 1;
        if (cost >= (costs.get(next) ?? Infinity)) continue;
        costs.set(next, cost); prev.set(next, k); push(next, cost + heuristic(next));
      }
    }
    if (!found) return [];
    const path = []; let k = end;
    while (k !== start && path.length < EXPANSIONS) { path.push(cellPoint(n, k)); k = prev.get(k); }
    path.reverse();
    // Keep corners: smoothing across walls is deliberately avoided.
    if (path.length === 0) path.push(cellPoint(n, start));
    return path;
  }
  function safeSpawn(game, p) {
    const n = navFor(game, {p}), k = nearestCell(game, n, p);
    return k >= 0 ? cellPoint(n, k) : null;
  }
  function enter(game, stage) {
    const s = game.pow, e = game.evade;
    if (!s || !e) return;
    s.aiClock = finite(s.aiClock, 0); s.noises ||= []; s.flags ||= {}; s.stats ||= {};
    const b = s.base || [0, 0, 0], at = (x, z) => [b[0] + x, b[1], b[2] + z];
    e.searchers ||= [];
    if (stage === 'river' && s.river || stage === 'regular' && s.regular) {
      // The river module places observers on its raised banks and preserves pursuit.
      s.aiRoster = stage; s.aiStage = stage; s.actors = e.searchers;
      delete s.flags.capturePending;
      for (let i = 0; i < e.searchers.length; i++) initActor(e.searchers[i], i, s);
      return;
    }
    const roster = stage === 'solitary' ? 'solitary' : stage === 'cell' || stage === 'compound' ? 'compound' : 'street';
    if (s.aiRoster !== roster) {
      const seeds = roster === 'solitary' ? [
        {id: 'solitary-corridor', kind: 'nva', route: [[-1.5, -2.5], [1.5, -2.5]], dwell: 5, face: PI / 2},
        {id: 'solitary-post', kind: 'nva', route: [[2, -3.4]], dwell: 7, face: -PI / 2}
      ] : roster === 'compound' ? [
        {id: 'corridor-sentry', kind: 'nva', route: [[1, -5.5], [15, -5.5], [1, -5.5], [-7, -5.5]], dwell: 4, face: 0},
        {id: 'yard-patrol', kind: 'nva', route: [[-17, -18], [-8, -18], [-8, 2], [-23, 2], [-23, -18]], dwell: 3},
        {id: 'west-watch', kind: 'militia', route: [[-25, -27], [-25, 26], [-9, 26], [-9, -27]], dwell: 5},
        {id: 'courtyard-watch', kind: 'nva', route: [[-6, 10], [-11, 10], [-11, 26], [-23, 26], [-23, 2], [-8, 2]], dwell: 6},
        {id: 'roof-watch', kind: 'nva', route: [[10, -31], [22, -31], [22, -18], [10, -18]], height: 3.4, dwell: 4}
      ] : [
        {id: 'alley-patrol', kind: 'nva', route: [[35, -23], [63, -23], [86, -23], [63, -23]], dwell: 3},
        {id: 'market-watch', kind: 'militia', route: [[44, -25], [75, -25]], dwell: 5},
        {id: 'river-watch', kind: 'nva', route: [[88, -28], [102, -28], [102, -15], [88, -15]], dwell: 4},
        {id: 'alley-worker', kind: 'farmer', route: [[52, -21], [66, -21]], dwell: 12},
        {id: 'river-worker', kind: 'farmer', route: [[92, -18], [98, -18], [98, -24]], dwell: 15},
        {id: 'local-patrol', kind: 'vcFem', route: [[77, -24], [89, -24]], dwell: 6}
      ];
      // Preserve the compound patrol across cell escape. New zones have their own roster.
      e.searchers = seeds.map((o, i) => {
        const route = o.route.map(q => { const p = at(...q); p[1] += finite(o.height, 0); return safeSpawn(game, p); }).filter(Boolean), p = route[0];
        if (!p) return null;
        return makeActor({...o, p, route, lamp: i === 0,
          schedule: {cycle: 105 + i * 7, rounds: 78, offset: i * 13}});
      }).filter(Boolean);
      s.aiRoster = roster;
    }
    s.actors = e.searchers;
    s.aiStage = stage;
    if (!confined(s)) delete s.flags.capturePending;
    for (const a of e.searchers) { a.grab = 0; if (confined(s)) a.seen = 0; }
  }
  function noise(game, p, loudness, kind, source) {
    const s = game.pow;
    if (!s || !p) return;
    if (!Array.isArray(s.noises)) s.noises = [];
    const clock = time(s), type = kind || 'movement';
    // Continuous footsteps share a short event instead of filling the queue every frame.
    const last = s.noises[s.noises.length - 1];
    if (last && last.kind === type && last.source === (source || 'player') && clock - last.at < .28) return;
    s.noiseSequence = finite(s.noiseSequence, 0) + 1;
    s.noises.push({id: s.noiseSequence, p: point(p), loudness: clamp(finite(loudness, .3), 0, 4),
      kind: type, source: source || 'player', at: clock, expires: clock + 2.5});
    if (s.noises.length > 24) s.noises.splice(0, s.noises.length - 24);
  }
  function outsideDoor(s) {
    const b = s.base || [0, 0, 0], d = s.cellDoor || [b[0], b[1], b[2] - 3.5];
    return [d[0], b[1], d[2] - 1.4];
  }
  function view(game, a, target, body) {
    const s = game.pow, e = game.evade, d = dist(a.p, target);
    const light = clamp(finite(s.river && s.river.daylight, finite(s.light, finite(e.light, .65))), 0, 1);
    const reach = body ? 10 : (a.lamp ? 25 : 16 + light * 23) * (s.difficulty === 'hard' ? 1.12 : 1);
    if (d > reach || Math.abs(target[1] - a.p[1]) > 7) return 0;
    const heading = Math.atan2(target[0] - a.p[0], -(target[2] - a.p[2]));
    // Human peripheral vision permits close contact from behind, but walls always occlude.
    if (d > 1.65 && Math.abs(angle(heading - a.face)) > (a.state === 'search' ? 1.1 : .86)) return 0;
    const eye = [a.p[0], a.p[1] + 1.55, a.p[2]];
    const eyeHeight = s.river ? finite(s.river.eyeHeight, .48) : e.crouch || e.hide || e.hidden ? .55 : 1.4;
    const targetEye = [target[0], target[1] + (body ? .25 : eyeHeight), target[2]];
    if (!los(game, eye, targetEye)) return 0;
    if (body) return 1;
    if (e.underwater || e.submerged || e.waterDepth > 1.25 && e.crouch) return d < 1.65 ? .3 : 0;
    let cover = finite(e.cover, finite(s.river && s.river.cover, finite(s.cover, 0)));
    if (game._coverAt && !e.camp) cover = finite(game._coverAt(e.p), cover);
    cover = clamp(cover, 0, 1);
    const posture = e.hide || e.hidden ? .12 : e.crouch ? .4 : 1;
    const motion = e.running ? 1.4 : finite(e.spd, 0) > .2 || e.moving ? 1.05 : .72;
    const water = e.waterDepth > .35 || e.swimming || s.river && !['bank', 'hidden', 'boat'].includes(s.river.mode) ? .55 : 1;
    const weather = s.river ? 1 - clamp(finite(s.river.rain, 0), 0, 1) * .37 : 1;
    const contrast = (.35 + light * .9) * (1 - cover * .8) * posture * motion * water * weather;
    return clamp((1 - d / reach) * contrast, d < 2.4 ? .75 : 0, 1.5);
  }
  function observe(game, a, elapsed) {
    const s = game.pow, e = game.evade, clock = time(s), visible = view(game, a, e.p, false);
    a.visible = visible > 0; a.visibility = visible;
    if(s.stage==='regular' && P.RegularConfinement && !P.RegularConfinement.isSuspicious(game)){
      a.seen=0;a.grab=0;a.sus=Math.max(0,a.sus-elapsed*.15);hear(game,a);return;
    }
    if (visible > 0) {
      a.observedPlayer = point(e.p);
      a.sus = clamp(a.sus + visible * (s.difficulty === 'hard' ? 1.1 : .88) * elapsed, 0, 1.35);
      if (a.sus > .34 && a.state === 'patrol') {
        a.state = civilian(a) ? 'observe' : 'suspicious';
        a.goal = point(e.p); say(game, a, 'investigate');
      }
      if (a.sus >= 1 || a.state === 'pursuit') {
        a.lastSight = clock; a.lastKnown = point(e.p);
        if (confined(s)) {
          a.state = 'investigate'; a.goal = outsideDoor(s); a.seen = 0;
        } else if (civilian(a)) {
          if (a.state !== 'flee') { a.reportAt = clock + 3; a.reported = false; }
          a.state = 'flee'; a.flee = 1; a.seen = 1; a.fleeUntil = clock + 12;
        } else {
          if (a.state !== 'pursuit') say(game, a, 'spotted');
          a.state = 'pursuit'; a.seen = 1; a.goal = point(a.lastKnown);
        }
      }
    } else {
      a.sus = Math.max(0, a.sus - elapsed * (a.state === 'patrol' ? .13 : .065));
      if ((a.state === 'suspicious' || a.state === 'observe') && a.sus < .23) {
        a.state = 'patrol'; a.goal = point(a.home);
      }
    }
    if (a.state === 'pursuit' && !a.visible) {
      a.goal = point(a.lastKnown || a.home); // Do not track the hidden player's current position.
      if (clock - a.lastSight > 2.2) {
        a.state = 'search'; a.seen = 0; a.searchUntil = clock + 16;
        a.searchOrigin = point(a.lastKnown || a.p); a.searchIndex = 0; say(game, a, 'search');
      }
    }
    hear(game, a);
    if (clock >= finite(a.bodyAt, 0)) { noticeBodies(game, a); a.bodyAt = clock + 1; }
  }
  function hear(game, a) {
    const s = game.pow, clock = time(s);
    for (const n of s.noises || []) {
      if (!n || n.id <= finite(a.heardSequence, 0)) continue;
      a.heardSequence = n.id;
      if (n.source === a.id || n.expires < clock || !n.p) continue;
      const radius = clamp(finite(n.loudness, .3) * 24, 2, 96), d = dist(a.p, n.p);
      if (d >= radius) continue;
      const muffled = !los(game, [a.p[0], a.p[1] + 1.2, a.p[2]], [n.p[0], n.p[1] + .8, n.p[2]]);
      const strength = (1 - d / radius) * (muffled ? .52 : 1);
      if (strength < .14 || a.state === 'pursuit' && a.visible) continue;
      a.sus = Math.max(a.sus, clamp(.3 + strength * .65, 0, .95));
      a.lastNoise = point(n.p);
      if (!civilian(a)) {
        a.goal = confined(s) ? outsideDoor(s) : point(n.p);
        a.investigateOrigin = point(a.goal); a.state = 'investigate';
        a.investigateUntil = clock + 9; a.seen = 0; say(game, a, 'investigate');
      } else if (n.loudness > 1 || n.kind === 'gunshot' || n.kind === 'body') {
        a.state = 'flee'; a.flee = 1; a.fleeUntil = clock + 10; a.observedPlayer = point(n.p);
      }
      if (confined(s) && !civilian(a) && a.sus >= .55 && clock >= finite(s.nextInspection, 0)) {
        s.nextInspection = clock + 24;
        if (P.Captivity && P.Captivity.inspection) P.Captivity.inspection(game, 'A corridor guard investigates the noise near your door.');
        else { s.flags.inspection = true; s.stats.stress = finite(s.stats.stress, 0) + .035; }
      }
    }
  }
  function noticeBodies(game, a) {
    if (civilian(a) || a.state === 'pursuit') return;
    const s = game.pow;
    for (const body of actors(game).slice(0, DESKTOP_CAP)) {
      if (body.alive !== false || body === a || a.noticedBodies.includes(body.id) || !view(game, a, body.p, true)) continue;
      a.noticedBodies.push(body.id); if (a.noticedBodies.length > 16) a.noticedBodies.shift();
      a.goal = point(body.p); a.investigateOrigin = point(body.p); a.state = 'investigate';
      a.investigateUntil = time(s) + 12; a.sus = Math.max(a.sus, .72);
      s.flags.bodyAlarm = true; say(game, a, 'investigate');
      noise(game, a.p, .8, 'body', a.id);
      break;
    }
  }
  function patrolGoal(game, a) {
    const s = game.pow, clock = time(s), schedule = a.schedule;
    const phase = (clock + finite(schedule.offset, 0)) % Math.max(10, finite(schedule.cycle, 105));
    const nightWorker = civilian(a) && finite(s.river && s.river.daylight, finite(s.light, .65)) < .28;
    if (phase > finite(schedule.rounds, 78) || nightWorker) {
      a.goal = point(a.home); a.onPost = true; return;
    }
    a.onPost = false;
    const target = a.route[a.wp] || a.home;
    if (dist(a.p, target) < .6) {
      if (!a.dwellUntil) a.dwellUntil = clock + finite(a.dwell, civilian(a) ? 12 : 3);
      if (clock >= a.dwellUntil) { a.wp = (a.wp + 1) % a.route.length; a.dwellUntil = 0; }
    }
    a.goal = point(a.route[a.wp] || a.home);
  }
  function chooseGoal(game, a, dt) {
    const s = game.pow, clock = time(s);
    if (a.state === 'patrol') patrolGoal(game, a);
    else if (a.state === 'suspicious' || a.state === 'observe') {
      if (a.observedPlayer) faceToward(a, a.observedPlayer, dt);
    } else if (a.state === 'search') {
      if (clock >= a.searchUntil) {
        a.state = 'patrol'; a.seen = 0; a.sus = Math.min(a.sus, .25); a.grab = 0;
        a.path = []; a.nextPlan = clock; say(game, a, 'clear'); patrolGoal(game, a);
      } else {
        const origin = a.searchOrigin || a.lastKnown || a.home;
        if (!a.searchGoalAt || clock >= a.searchGoalAt) {
          const offsets = [[0, 0], [3, 1], [-3, 2], [2, -3], [-2, -3]];
          const q = offsets[finite(a.searchIndex, 0) % offsets.length];
          a.searchIndex = finite(a.searchIndex, 0) + 1; a.searchGoalAt = clock + 3;
          a.goal = [origin[0] + q[0], a.p[1], origin[2] + q[1]];
        }
      }
    } else if (a.state === 'investigate') {
      if (clock >= finite(a.investigateUntil, clock + 1)) {
        a.state = 'search'; a.searchOrigin = point(a.investigateOrigin || a.goal);
        a.searchUntil = clock + 8; a.searchIndex = 0;
      }
    } else if (a.state === 'flee') {
      const danger = a.observedPlayer || a.lastNoise || a.lastKnown || a.p;
      let dx = a.p[0] - danger[0], dz = a.p[2] - danger[2], d = Math.hypot(dx, dz);
      if (d < .01) { dx = Math.sin(a.face); dz = -Math.cos(a.face); d = 1; }
      // A single remembered escape destination prevents live-player tracking while fleeing.
      if (!a.fleeGoal || dist(a.p, a.fleeGoal) < .8) a.fleeGoal = [a.p[0] + dx / d * 10, a.p[1], a.p[2] + dz / d * 10];
      a.goal = point(a.fleeGoal);
      if (a.reportAt && !a.reported && clock >= a.reportAt) report(game, a);
      if (clock >= finite(a.fleeUntil, clock + 1) && !a.visible) {
        a.state = 'patrol'; a.flee = 0; a.seen = 0; a.sus = .2; a.fleeGoal = null; patrolGoal(game, a);
      }
    }
    if (s.river && s.river.phase !== 'gulf') {
      const centre = s.base[0] + 94, side = a.p[0] >= centre ? 1 : -1;
      a.goal[0] = side > 0 ? Math.max(a.goal[0], centre + 14.95) : Math.min(a.goal[0], centre - 14.95);
      a.goal[1] = a.p[1];
    }
  }
  function report(game, a) {
    let nearest = null, best = 45;
    for (const guard of actors(game).slice(0, DESKTOP_CAP)) {
      if (guard === a || !guard.alive || civilian(guard)) continue;
      const d = dist(a.p, guard.p); if (d < best) { best = d; nearest = guard; }
    }
    a.reported = true;
    if (!nearest) return;
    if (nearest.state === 'pursuit' && nearest.visible) return;
    nearest.goal = point(a.observedPlayer || a.lastKnown || a.p);
    nearest.investigateOrigin = point(nearest.goal); nearest.investigateUntil = time(game.pow) + 12;
    nearest.sus = Math.max(nearest.sus, .7);
    if (!(nearest.state === 'pursuit' && nearest.visible)) { nearest.state = 'investigate'; nearest.seen = 0; }
    a.reports = finite(a.reports, 0) + 1; say(game, a, 'report');
  }
  function faceToward(a, goal, dt) {
    if (dist(a.p, goal) < .01) return;
    const desired = Math.atan2(goal[0] - a.p[0], -(goal[2] - a.p[2]));
    a.face += clamp(angle(desired - a.face), -dt * 3.8, dt * 3.8);
    a.face = angle(a.face);
  }
  function moveActor(game, a, dt, budget) {
    const s = game.pow, clock = time(s);
    if (a.state === 'suspicious' || a.state === 'observe' || clock < finite(a.dwellUntil, 0) && a.state === 'patrol') {
      a.spd = 0; return;
    }
    if (a.state === 'search' && dist(a.p, a.goal) < .6) { a.face = angle(a.face + dt * .7); a.spd = 0; return; }
    const changed = !a.pathGoal || dist(a.pathGoal, a.goal) > 1.1;
    if (clock >= finite(a.nextPlan, 0) && (changed || !a.path.length || a.pathIndex >= a.path.length) && budget.left > 0) {
      budget.left--;
      a.path = planPath(game, a, a.goal); a.pathIndex = 0; a.pathGoal = point(a.goal);
      a.nextPlan = clock + (a.path.length ? .6 : 1.8);
      a.planCount = finite(a.planCount, 0) + 1;
    }
    while (a.pathIndex < a.path.length && dist(a.p, a.path[a.pathIndex]) < .13) a.pathIndex++;
    const target = a.path[a.pathIndex];
    if (!target) { a.spd = 0; return; }
    faceToward(a, target, dt);
    const dx = target[0] - a.p[0], dz = target[2] - a.p[2], d = Math.hypot(dx, dz);
    const desired = a.state === 'pursuit' ? 2.6 : a.state === 'flee' ? 2.8 : a.state === 'search' ? 1.25 : a.state === 'investigate' ? 1.55 : civilian(a) ? .85 : 1.15;
    const hurt = a.hurt ? .6 : 1;
    a.spd += (desired * hurt - a.spd) * Math.min(1, dt * 4);
    const stride = Math.min(d, a.spd * dt), old = point(a.p);
    if (blocked(game, old[0] + dx / (d || 1) * stride, old[2] + dz / (d || 1) * stride, .33, old[1])) {
      a.spd = 0; a.path = []; return;
    }
    // Core move sweeps solids and live actors. A fallback also samples the entire segment.
    if (P.move) P.move(game, a, dx / (d || 1) * stride, dz / (d || 1) * stride, .33);
    else {
      const steps = Math.max(1, Math.ceil(stride / .12));
      for (let i = 1; i <= steps; i++) {
        const x = old[0] + dx / (d || 1) * stride * i / steps, z = old[2] + dz / (d || 1) * stride * i / steps;
        if (blocked(game, x, z, .33, a.p[1])) break;
        a.p[0] = x; a.p[2] = z;
      }
    }
    const travelled = dist(old, a.p);
    a.spd = travelled / Math.max(dt, .001);
    a.ph = (a.ph + travelled * PI / .78) % (TAU * 100);
    if (travelled < stride * .2 && stride > .015) {
      a.stuck = finite(a.stuck, 0) + dt;
      if (a.stuck > .45) { a.path = []; a.stuck = 0; }
    } else a.stuck = 0;
  }
  function grab(game, a, dt) {
    const s = game.pow, e = game.evade;
    if(s.stage==='regular' && P.RegularConfinement && !P.RegularConfinement.isSuspicious(game)){a.grab=0;return false;}
    const close = !confined(s) && !civilian(a) && a.state === 'pursuit' && a.visible
      && dist(a.p, e.p) < 1.1 && Math.abs(a.p[1] - e.p[1]) < 1.4
      && los(game, [a.p[0], a.p[1] + 1.3, a.p[2]], [e.p[0], e.p[1] + .8, e.p[2]]);
    a.grab = close ? finite(a.grab, 0) + dt : Math.max(0, finite(a.grab, 0) - dt * 2);
    if (a.grab >= (s.difficulty === 'hard' ? 1.3 : 1.7) && !s.flags.capturePending) {
      s.flags.capturePending = true; s.stats.recaptures = finite(s.stats.recaptures, 0) + 1;
      s.flags.recaptures = finite(s.flags.recaptures, 0) + 1;
      if (P.begin) P.begin(game, 'solitary');
      return true;
    }
    return false;
  }
  function step(game, dt) {
    const s = game && game.pow, e = game && game.evade;
    if (!s || !e || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .25); s.aiClock = time(s) + dt;
    s.flags ||= {}; s.stats ||= {}; if (!Array.isArray(s.noises)) s.noises = [];
    s.noises = s.noises.filter(n => n && finite(n.expires, time(s) + 1) >= time(s)).slice(-24);
    const touch = typeof global.matchMedia === 'function' ? global.matchMedia('(pointer: coarse)').matches : false;
    const list = actors(game), cap = touch ? CAP : DESKTOP_CAP, budget = {left: 3};
    for (let i = 0; i < Math.min(list.length, cap); i++) initActor(list[i], i, s);
    if (s.stage === 'solitary') for (const a of list.slice(0, cap)) {
      const cycle = finite(s.flags.guardCycle, 0), previous = finite(a.guardCycleApplied, 0);
      if (cycle !== previous) {
        if (Math.abs(cycle - previous) % 2) a.route.reverse();
        a.schedule.offset = (finite(a.schedule.offset, 0) + (cycle - previous) * 17) % finite(a.schedule.cycle, 105);
        a.dwell = 4 + Math.abs(cycle % 4); a.wp = 0; a.path = []; a.dwellUntil = 0;
      }
      a.guardCycleApplied = cycle;
    }
    let peak = 0;
    for (let i = 0; i < Math.min(list.length, cap); i++) {
      const a = list[i];
      if (!a.alive) { a.spd = 0; a.seen = 0; a.grab = 0; continue; }
      const stunned = finite(a.stunUntil, -1) > finite(game.t, time(s)) || a.stunned;
      if (stunned) { a.spd = 0; a.grab = 0; a.visible = false; continue; }
      if (time(s) >= finite(a.senseAt, 0)) {
        const elapsed = clamp(time(s) - finite(a.lastSense, time(s) - .2), .05, .35);
        a.lastSense = time(s); a.senseAt = time(s) + .18;
        observe(game, a, elapsed);
      }
      chooseGoal(game, a, dt); moveActor(game, a, dt, budget);
      peak = Math.max(peak, a.sus);
      if (!e.frozen && grab(game, a, dt)) return;
    }
    // Excess restored actors remain harmless and motionless rather than consuming mobile work.
    for (let i = cap; i < list.length; i++) { list[i].spd = 0; list[i].seen = 0; list[i].grab = 0; }
    e.sus = peak; e.expose = finite(e.expose, 0) + (peak - finite(e.expose, 0)) * Math.min(1, dt * 4);
  }
  /* Optional legacy hook: perception only. Existing ground movement/rescue remain owned
     by the original game. Call after legacy AI; it never seeds a roster or captures. */
  function stepGround(game, dt) {
    if (!game || game.pow || !game.evade || game.evade.camp) return;
    const e = game.evade, list = (e.searchers || []).concat(e.locals || []).slice(0, DESKTOP_CAP);
    e.aiClock = finite(e.aiClock, 0) + Math.min(.25, Math.max(0, finite(dt, 0)));
    let peak = 0;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; if (!a.alive) continue;
      if (!a.id) a.id = 'ground-' + i;
      if (a.kind === 'farmer' || a.kind === 'villager') a.armed = false;
      const d = dist(a.p, e.p), heading = Math.atan2(e.p[0] - a.p[0], -(e.p[2] - a.p[2]));
      a.face = finite(a.face, heading);
      const sight = (d < 1.65 || Math.abs(angle(heading - a.face)) < 1.05) && d < 100
        && (!game._groundLineOfSight || game._groundLineOfSight(a.p, e.p, e));
      if (sight) a.aiLastKnown = point(e.p);
      if (sight && a.seen) a.aiLastSight = e.aiClock;
      if (!sight) {
        a.grab = 0;
        if (a.aiLastKnown && a.seen) a.goal = point(a.aiLastKnown);
        if (e.aiClock - finite(a.aiLastSight, 0) > 8) { a.seen = 0; a.sus = Math.min(finite(a.sus, 0), .4); }
      }
      if (!a.armed) a.grab = 0;
      peak = Math.max(peak, finite(a.sus, 0));
    }
    e.sus = peak;
  }
  function snapshot(game) {
    if (!game || !game.pow || !game.evade) return null;
    const s = game.pow;
    return JSON.parse(JSON.stringify({version: 1, clock: time(s), roster: s.aiRoster, stage: s.stage,
      sequence: finite(s.noiseSequence, 0), noises: (s.noises || []).slice(-24), actors: actors(game).slice(0, DESKTOP_CAP)}));
  }
  function restore(game, saved) {
    if (!game || !game.pow || !game.evade || !saved || saved.stage !== game.pow.stage || !Array.isArray(saved.actors)) return false;
    const s = game.pow, data = JSON.parse(JSON.stringify(saved));
    s.aiClock = finite(data.clock, 0); s.aiRoster = data.roster; s.aiStage = s.stage;
    s.noiseSequence = finite(data.sequence, 0); s.noises = (data.noises || []).slice(-24);
    game.evade.searchers = data.actors.slice(0, DESKTOP_CAP); s.actors = game.evade.searchers;
    for (let i = 0; i < s.actors.length; i++) initActor(s.actors[i], i, s);
    grids.delete(game);
    return true;
  }
  P.AI = {enter, step, stepGround, makeActor, noise, planPath, snapshot, restore,
    limits: {mobileActors: CAP, desktopActors: DESKTOP_CAP, expansionsPerPath: EXPANSIONS, plansPerStep: 3},
    dialogueNote: 'All Vietnamese patrol dialogue is fictional game text, presented with an English translation.'};
})(window);
