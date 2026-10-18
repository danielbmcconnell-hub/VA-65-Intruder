/* Authored pilotage scenery, not a surveyed reconstruction of Nam Dinh.
 * Uses the existing terrain, instancing, fire-light slots and mesh builder.
 * No gameplay target, aircraft force, collision plane, timer or photograph is
 * replaced here. River crossings are found in the actual shader's channel
 * field; this module never paints a fictional river over dry ground. */
(function (root) {
  'use strict';
  const KEY = 'flight_night_visibility';
  const LIMIT = Object.freeze({ low: 120, medium: 190, high: 220, lights: 3, range: 12500 });
  const cache = new WeakMap(), uploaded = new WeakSet();
  let ctx = {}, visibility = .55;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const copy = x => JSON.parse(JSON.stringify(x));
  const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2;
  const active = game => !!(game && game.mis && game.mis.willard && game.willard && !game.evade && !game.pow && !game.chute && !(game.ac && (game.ac.onDeck || game.ac.outOfAircraft)) && game.atm && game.atm.night);
  const ground = (x, z) => Math.max(0, Number(ctx.terrainH(x, z)) || 0);
  function configure(options) {
    ctx = Object.assign({}, ctx, options || {});
    if (ctx.Store && typeof ctx.Store.get === 'function') {
      const n = ctx.Store.get(KEY, .55); if (typeof n === 'number' && Number.isFinite(n)) visibility = clamp(n, 0, 1);
    }
    return root.FlightRouteScene;
  }
  function setVisibility(value) {
    if (!Number.isFinite(Number(value))) return visibility;
    visibility = clamp(Number(value), 0, 1);
    if (ctx.Store && typeof ctx.Store.set === 'function') ctx.Store.set(KEY, visibility);
    return visibility;
  }
  function route(game) {
    if (game.willard && game.willard.route) return game.willard.route;
    const z = -14000, coast = typeof ctx.coastAt === 'function' ? ctx.coastAt(z) : 0;
    return { strike: [-65000, ground(-65000, 14000), 14000], plan: [-52000, 950, -10000], flak: [-34000, 900, z], safe: [coast + 36000, 1100, z] };
  }
  function support(x, z, hx, hz, yaw) {
    let h = ground(x, z); const ca = Math.cos(yaw), sa = Math.sin(yaw);
    for (const u of [-hx, 0, hx]) for (const v of [-hz, 0, hz]) h = Math.max(h, ground(x + u * ca - v * sa, z + u * sa + v * ca));
    return h + .08;
  }
  function landSite(x, z, radius, hx, hz, yaw) {
    let best = null;
    for (let i = 0; i < 9; i++) {
      const a = i * 2.399963, r = i ? radius * Math.sqrt(i / 8) : 0;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (ground(px, pz) < 2) continue;
      const top = support(px, pz, hx, hz, yaw), rise = top - ground(px, pz), score = rise * 32 + r * .015;
      if (!best || score < best.score) best = { x: px, z: pz, y: top, score, rise };
    }
    return best;
  }
  function channel(x, z) {
    if (typeof ctx.fbm !== 'function') return 0;
    const n = Math.abs(ctx.fbm(x * .00006 + 3.7, z * .00006 - 2.1, 3) - .5) / .019;
    const t = clamp(n, 0, 1); return 1 - t * t * (3 - 2 * t);
  }
  function crossing(preferred) {
    if (typeof ctx.fbm !== 'function') return null;
    let best = null;
    // Deterministic broad search followed by a local refinement; once per
    // game, never per frame. The same field and elevation mask draw rivers.
    for (let j = -10; j <= 10; j++) for (let i = -10; i <= 10; i++) {
      const x = preferred[0] + i * 260, z = preferred[2] + j * 260, h = ground(x, z), c = channel(x, z);
      if (h < 3 || h > 155 || c < .82) continue;
      const score = Math.hypot(i * 260, j * 260) + (1 - c) * 1700;
      if (!best || score < best.score) best = { x, z, h, score };
    }
    if (!best) return null;
    const rv = (x, z) => ctx.fbm(x * .00006 + 3.7, z * .00006 - 2.1, 3);
    const gx = rv(best.x + 50, best.z) - rv(best.x - 50, best.z), gz = rv(best.x, best.z + 50) - rv(best.x, best.z - 50);
    const norm = Math.hypot(gx, gz); if (norm < 1e-9) return null;
    const dx = gx / norm, dz = gz / norm;
    let half = 36;
    while (half < 600 && (channel(best.x + dx * half, best.z + dz * half) > .30 || channel(best.x - dx * half, best.z - dz * half) > .30)) half += 12;
    if (half >= 600) return null; // No giant bridge over an unresolved valley.
    const p0 = [best.x - dx * (half + 24), 0, best.z - dz * (half + 24)];
    const p1 = [best.x + dx * (half + 24), 0, best.z + dz * (half + 24)];
    let deck = 0;
    const n = Math.ceil((half * 2 + 48) / 24);
    for (let i = 0; i <= n; i++) deck = Math.max(deck, ground(p0[0] + (p1[0] - p0[0]) * i / n, p0[2] + (p1[2] - p0[2]) * i / n));
    p0[1] = p1[1] = deck + 2.5;
    return { p: [best.x, deck + 2.5, best.z], p0, p1, yaw: -Math.atan2(dx, dz), length: Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), channel: channel(best.x, best.z) };
  }
  function build(game) {
    const r = route(game), items = [], lamps = [], features = [];
    function add(m, x, z, opts) {
      opts = opts || {}; const yaw = opts.yaw || 0, scale = opts.scale || [1, 1, 1];
      let y = opts.y;
      if (!Number.isFinite(y)) y = support(x, z, (opts.hx || 1) * scale[0], (opts.hz || 1) * scale[2], yaw);
      const item = { m, p: [x, y, z], rot: [yaw, opts.pitch || 0, opts.roll || 0], scale, tint: opts.tint || [1, 1, 1, 0], range: opts.range || 8500, detail: opts.detail || 0, kind: opts.kind || 'scenery', ground: opts.ground !== false };
      items.push(item); return item;
    }
    function lamp(x, z, name) {
      const y = ground(x, z); add('bnRouteLamp', x, z, { y, range: 10000, kind: 'lamp' });
      add('bnRouteGlow', x, z, { y: y + 5.4, tint: [1, .60, .24, 2.5], scale: [1.4, 1.4, 1.4], ground: false, range: 12000 });
      lamps.push({ id: name, p: [x, y + 5.4, z], power: .8, radius: 29, color: [1, .63, .30] });
    }
    function house(x, z, yaw, small) {
      const scale = small ? [.75, .8, .75] : [1, 1, 1], site = landSite(x, z, 65, 9 * scale[0], 14 * scale[2], yaw);
      if (site && site.rise < 7) add('bnRouteHouse', site.x, site.z, { y: site.y, yaw, scale, hx: 9, hz: 14, detail: 1 });
    }
    function railway(x, z, yaw, count) {
      const dx = -Math.sin(yaw), dz = Math.cos(yaw);
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * 24, px = x + dx * off, pz = z + dz * off;
        const a = ground(px - dx * 12, pz - dz * 12), b = ground(px + dx * 12, pz + dz * 12);
        add('bnRouteRail', px, pz, { y: ground(px, pz) + .09, yaw, pitch: -Math.atan2(b - a, 24), range: 9000, detail: 1 });
      }
    }
    const sx = r.strike[0], sz = r.strike[2];
    // The railway is public context beside the existing, unchanged target.
    // Non-target wagons/sheds are scenic; only original World.targets score.
    railway(sx + 160, sz, .06, 25); railway(sx + 186, sz + 60, .06, 15);
    for (let i = 0; i < 7; i++) {
      const yaw = .06, off = (i - 3) * 42, alternate = i % 2;
      add('bnRouteWagon', sx + (alternate ? 186 : 160) - Math.sin(yaw) * off, sz + (alternate ? 60 : 0) + Math.cos(yaw) * off, { yaw, hx: 2, hz: 7, detail: 1 });
    }
    for (let i = 0; i < 5; i++) house(sx + 260 + i * 48, sz + (i % 2) * 96 - 80, .06, false);
    lamp(sx + 150, sz + 190, 'rail-yard-north'); lamp(sx + 232, sz - 170, 'rail-yard-south');
    features.push({ id: 'rail-sidings', label: 'Twin railway sidings', kind: 'rail', p: [sx + 173, ground(sx + 173, sz), sz], points: [[sx + 160, ground(sx + 160, sz - 288), sz - 288], [sx + 160, ground(sx + 160, sz + 288), sz + 288]], signature: 'Two parallel sidings, parked wagons and five pitched-roof sheds', briefed: true });
    const junction = [sx + 680, ground(sx + 680, sz + 120), sz + 120];
    for (let arm = 0; arm < 3; arm++) for (let i = 0; i < 10; i++) {
      const yaw = [0, -Math.PI / 2, .70][arm], off = i * 23;
      const x = junction[0] - Math.sin(yaw) * off, z = junction[2] + Math.cos(yaw) * off, dx = -Math.sin(yaw), dz = Math.cos(yaw), rx = Math.cos(yaw), rz = Math.sin(yaw);
      const along = ground(x + dx * 12, z + dz * 12) - ground(x - dx * 12, z - dz * 12);
      const across = ground(x + rx * 6, z + rz * 6) - ground(x - rx * 6, z - rz * 6);
      add('bnRouteRoad', x, z, { yaw, y: ground(x, z) + .16, pitch: -Math.atan2(along, 24), roll: -Math.atan2(across, 12), detail: 2 });
    }
    features.push({ id: 'three-way-junction', label: 'Three-way road junction', kind: 'road', p: junction, points: [junction, [junction[0] + 207, ground(junction[0] + 207, junction[2]), junction[2]]], signature: 'Three pale road arms east of the railway sidings', briefed: true });
    const river = crossing(r.plan);
    if (river) {
      const n = Math.ceil(river.length / 24);
      for (let i = 0; i < n; i++) {
        const f = (i + .5) / n;
        add('bnRouteBridge', river.p0[0] + (river.p1[0] - river.p0[0]) * f, river.p0[2] + (river.p1[2] - river.p0[2]) * f, { y: river.p[1], yaw: river.yaw, scale: [1, 1, river.length / n / 24], ground: false, range: 12500 });
      }
      const piers = Math.ceil(river.length / 96);
      for (let i = 0; i <= piers; i++) {
        const f = i / piers, x = river.p0[0] + (river.p1[0] - river.p0[0]) * f, z = river.p0[2] + (river.p1[2] - river.p0[2]) * f, y = ground(x, z);
        add('bnRoutePier', x, z, { y, scale: [1, (river.p[1] - y) / 12, 1], range: 12500 });
      }
      for (let i = 0; i < 12; i++) house(river.p1[0] + 100 + (i % 4) * 43, river.p1[2] + (Math.floor(i / 4) - 1) * 68, river.yaw + .3 * (i % 3), true);
      lamp(river.p1[0] + 32, river.p1[2] + 24, 'crossing-lantern');
      features.push({ id: 'river-crossing', label: 'River bridge and hamlet', kind: 'river', p: river.p, points: [river.p0, river.p1], signature: 'A narrow truss bridge crosses the existing moonlit channel; warm hamlet lamps on one bank', briefed: true });
    }
    const ix = r.flak[0] + 360, iz = r.flak[2] - 650, factory = landSite(ix, iz, 180, 26, 38, .25);
    if (factory && factory.rise < 9) {
      add('bnRouteFactory', factory.x, factory.z, { y: factory.y, yaw: .25, range: 12500 });
      lamp(factory.x + 38, factory.z + 22, 'industrial-yard');
      features.push({ id: 'twin-stacks', label: 'Twin-stack industrial works', kind: 'industrial', p: [factory.x, factory.y, factory.z], signature: 'Two unequal brick stacks above a long sawtooth-roof works; hostile defenses remain independent', briefed: true });
      for (let i = 0; i < 12; i++) house(factory.x - 240 + (i % 4) * 75, factory.z + 230 + Math.floor(i / 4) * 70, i * .31, false);
    }
    const cz = r.safe[2], cx = typeof ctx.coastAt === 'function' ? ctx.coastAt(cz) : 0;
    const coastsite = landSite(cx - 190, cz, 150, 9, 14, .2);
    if (coastsite) {
      for (let i = 0; i < 8; i++) house(coastsite.x - (i % 4) * 58, coastsite.z + Math.floor(i / 4) * 75 - 35, .2 + i * .12, true);
      lamp(coastsite.x, coastsite.z + 30, 'coastal-fishing-hamlet');
      features.push({ id: 'coastal-hamlet', label: 'Coastal fishing hamlet', kind: 'coast', p: [coastsite.x, coastsite.y, coastsite.z], signature: 'Sparse amber fishing-hamlet lamps at the actual shoreline; the Gulf lies east', briefed: true });
    }
    return { items, lamps, river, chart: { title: 'WILLARD EGRESS · BRIEFED PILOTAGE FEATURES', center: [sx, ground(sx, sz), sz], radius: 6000, features, note: 'Authored representative 1960s structures on the game’s procedural terrain. This is not a surveyed map of Nam Dinh or a record of the historical crew’s exact route.' } };
  }
  function ensure(game) {
    if (!game || !game.mis || !game.mis.willard || typeof ctx.terrainH !== 'function') return null;
    let s = cache.get(game); if (!s) { s = build(game); cache.set(game, s); } return s;
  }
  function instances(game, eye, quality, push) {
    if (!active(game) || !point(eye) || typeof push !== 'function') return 0;
    const s = ensure(game); if (!s) return 0;
    const q = quality === 0 ? 0 : quality === 2 ? 2 : 1, budget = q === 0 ? LIMIT.low : q === 2 ? LIMIT.high : LIMIT.medium;
    const selected = s.items.filter(item => (q > 0 || item.detail < 2) && d2(item.p, eye) < item.range * item.range).sort((a, b) => d2(a.p, eye) - d2(b.p, eye));
    let n = 0; for (const item of selected) { if (n >= budget) break; push(item.m, item.p, item.rot, item.scale, item.tint); n++; } return n;
  }
  function lights(game, eye, quality) {
    if (!active(game) || !point(eye)) return [];
    const s = ensure(game); if (!s) return [];
    const n = quality === 0 ? 2 : LIMIT.lights;
    return s.lamps.filter(l => d2(l.p, eye) < 9000 * 9000).sort((a, b) => d2(a.p, eye) - d2(b.p, eye)).slice(0, n).map(l => [l.p[0], l.p[1], l.p[2], l.power, l.radius, l.color.slice()]);
  }
  function atmosphere(game, base) {
    if (!active(game) || !base || !base.night) return base;
    // A fresh copy keeps the original day/night, POW and context recovery
    // atmospheres intact. Visibility adjusts presentation, never detection.
    const a = Object.assign({}, base), v = visibility, amb = .44 + .44 * v, moon = .65 + .30 * v;
    for (const k of ['sunDir', 'sunCol', 'amb', 'gnd', 'horizon', 'zenith']) if (Array.isArray(base[k])) a[k] = base[k].slice();
    for (const k of ['amb', 'gnd']) if (a[k]) a[k] = a[k].map(n => Math.max(.014, n * amb));
    if (a.sunCol) a.sunCol = a.sunCol.map(n => n * moon);
    if (a.horizon) a.horizon = a.horizon.map(n => n * (.67 + .18 * v));
    if (a.zenith) a.zenith = a.zenith.map(n => n * (.78 + .15 * v));
    a.exposure = clamp((Number(base.exposure) || 2.8) * (.75 + .18 * v), 1.65, 3.2);
    a.flightNight = true; a.nightContrast = 1; a.nightVisibility = v;
    return a;
  }
  function chart(game) { const s = ensure(game); return s ? copy(s.chart) : null; }
  function inspect(game) {
    const s = ensure(game); return s ? { active: active(game), count: s.items.length, lamps: s.lamps.length, river: s.river ? copy(s.river) : null, items: copy(s.items), features: copy(s.chart.features), visibility } : null;
  }
  function ensureMeshes(renderer) {
    const MB = ctx.MB; if (!renderer || !renderer.meshes || typeof renderer.meshFromBuilder !== 'function' || typeof MB !== 'function') return false;
    if (uploaded.has(renderer) && renderer.meshes.bnRouteFactory && renderer.meshes.bnRouteBridge) return true;
    const meshes = {}, roof = [.20, .13, .09], brick = [.25, .19, .13], iron = [.17, .18, .17];
    let m = new MB();
    m.box(0, -4, 0, 9.4, 4, 14.4, [.20, .19, .15]); m.box(0, 3.5, 0, 9, 3.5, 14, [.33, .29, .20]);
    m.quad([-10, 7, -15], [0, 11, -15], [0, 11, 15], [-10, 7, 15], roof); m.quad([0, 11, -15], [10, 7, -15], [10, 7, 15], [0, 11, 15], roof);
    m.tri([-9, 7, -14], [9, 7, -14], [0, 11, -14], brick); m.tri([9, 7, 14], [-9, 7, 14], [0, 11, 14], brick);
    m.box(-3, 2.1, -14.1, 1.5, 2.1, .12, [.07, .065, .05]); m.box(5, 3.8, -14.1, 1.25, 1.1, .12, [.10, .09, .06]); meshes.bnRouteHouse = m;
    m = new MB(); m.box(-.72, .2, 0, .08, .12, 12, iron); m.box(.72, .2, 0, .08, .12, 12, iron);
    for (let z = -10; z <= 10; z += 2) m.box(0, 0, z, 1.25, .14, .2, [.15, .12, .08]); meshes.bnRouteRail = m;
    m = new MB(); m.box(0, 1.2, 0, 1.85, .30, 7, iron); m.box(0, 3.2, 0, 1.65, 1.7, 6.6, [.24, .14, .08]);
    m.box(0, 5.05, 0, 1.78, .20, 6.8, [.15, .13, .10]); for (const z of [-4.7, 4.7]) for (const x of [-1.7, 1.7]) m.cyl(x, .8, z, .7, .19, iron, 8, 'x'); meshes.bnRouteWagon = m;
    m = new MB(); m.box(0, 0, 0, 6, .08, 12, [.26, .22, .16]); meshes.bnRouteRoad = m;
    m = new MB(); m.box(0, -4.5, 0, 26.5, 4.5, 38.5, [.21, .21, .17]); m.box(0, 7, 0, 26, 7, 38, brick);
    for (const x of [-18, 0, 18]) { m.quad([x - 9, 14, -39], [x, 20, -39], [x, 20, 39], [x - 9, 14, 39], roof); m.quad([x, 20, -39], [x + 9, 14, -39], [x + 9, 14, 39], [x, 20, 39], roof); }
    for (let i = 0; i < 2; i++) { const x = -16 + i * 32, height = 43 + i * 13; m.cyl(x, height / 2, 27, 3.3, height / 2, brick, 10); m.cyl(x, height, 27, 3.8, .8, [.12, .105, .09], 10); }
    for (let x = -21; x < 25; x += 7) m.box(x, 8.5, -38.1, 2, 2.5, .15, [.11, .12, .10]); meshes.bnRouteFactory = m;
    m = new MB(); m.cyl(0, 2.8, 0, .13, 2.8, [.16, .15, .12], 5); m.box(0, 5.6, 0, .6, .18, .6, iron); meshes.bnRouteLamp = m;
    m = new MB(); m.box(0, 0, 0, .45, .26, .45, [1, .68, .30]); meshes.bnRouteGlow = m;
    m = new MB(); m.box(0, -.4, 0, 5, .4, 12, [.22, .22, .19]);
    for (const x of [-4.7, 4.7]) { m.box(x, 3, -12, .3, 3, .3, iron); m.box(x, 6, 0, .3, .3, 12, iron); m.box(x, 1, 0, .2, .2, 12, iron);
      // Each side is a thin two-sided truss silhouette with real depth.
      for (const z of [-12, 0]) { const c = [.20, .21, .19]; m.quad([x - .15, 1, z], [x - .15, 1.7, z], [x - .15, 6, z + 12], [x - .15, 5.3, z + 12], c); m.quad([x + .15, 5.3, z + 12], [x + .15, 6, z + 12], [x + .15, 1.7, z], [x + .15, 1, z], c); }
    } meshes.bnRouteBridge = m;
    m = new MB(); m.box(0, 6, 0, 4.5, 6, 4.5, [.26, .25, .20]); meshes.bnRoutePier = m;
    for (const name of Object.keys(meshes)) renderer.meshFromBuilder(name, meshes[name]);
    uploaded.add(renderer); return true;
  }
  root.FlightRouteScene = { configure, ensure, ensureMeshes, instances, lights, atmosphere, chart, inspect, setVisibility, getVisibility: () => visibility, active, limits: LIMIT };
})(typeof window !== 'undefined' ? window : globalThis);
