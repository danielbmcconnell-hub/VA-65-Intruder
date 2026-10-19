/* DIXIE strike scenery. Authored representative scenery on the existing
 * procedural terrain, not a surveyed reconstruction or a target-ID sensor.
 * Only the opt-in strike experience uses these meshes. The original target
 * objects, bomb damage, fires, secondary explosions and score stay in World. */
(function (root) {
  'use strict';
  const LIMIT = Object.freeze({ low: 72, medium: 108, high: 132, range: 10500, lights: 2 });
  const states = new WeakMap(), uploaded = new WeakSet();
  let ctx = {};
  const copy = value => JSON.parse(JSON.stringify(value));
  const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  const ground = (x, z) => Math.max(0, Number(ctx.terrainH(x, z)) || 0);
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2;
  const destroyed = t => !!(t && t.alive === false && Number.isFinite(t.hp) && t.hp <= 0);
  const enabled = g => !!(g && g.mis && g.mis.id === 'm2' && g.strikeExperience && g.world);
  const active = g => enabled(g) && !g.pow && !g.chute && !g.evade && !g.result && !['done', 'dead', 'captured', 'evade', 'chute'].includes(g.phase) && !(g.ac && (g.ac.outOfAircraft || g.ac.alive === false));
  function configure(options) { ctx = Object.assign({}, ctx, options || {}); return root.FlightStrikeScene; }
  function footprint(x, z, hx, hz, yaw) {
    const co = Math.cos(yaw), si = Math.sin(yaw); let lo = Infinity, hi = -Infinity;
    // A 5x5 footprint catches the fine terrain variation rather than
    // grounding only the centre of a structure on a sloping hillside.
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const u = hx * i / 2, v = hz * j / 2, y = ground(x + u * co - v * si, z + u * si + v * co);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return { y: hi + .06, rise: hi - lo };
  }
  function site(x, z, hx, hz, yaw, radius = 110) {
    let best = null;
    for (let i = 0; i < 17; i++) {
      const a = i * 2.399963, r = radius * Math.sqrt(i / 16), px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (ground(px, pz) < 2) continue;
      const f = footprint(px, pz, hx, hz, yaw), score = f.rise * 20 + r * .025;
      if (f.rise < 11.5 && (!best || score < best.score)) best = { x: px, z: pz, y: f.y, rise: f.rise, score };
    }
    return best;
  }
  function riverNear(center) {
    if (typeof ctx.fbm !== 'function') return null;
    const field = (x, z) => ctx.fbm(x * .00006 + 3.7, z * .00006 - 2.1, 3);
    let best = null;
    for (let z = -12; z <= 12; z++) for (let x = -12; x <= 12; x++) {
      const px = center[0] + x * 240, pz = center[2] + z * 240, y = ground(px, pz), rv = Math.abs(field(px, pz) - .5);
      if (y < 3 || y > 155 || rv > .0035) continue;
      const distance = Math.hypot(x * 240, z * 240), score = distance + rv * 180000;
      if (!best || score < best.score) best = { p: [px, y, pz], score, field: rv };
    }
    if (!best) return null;
    const p = best.p, gx = field(p[0] + 30, p[2]) - field(p[0] - 30, p[2]), gz = field(p[0], p[2] + 30) - field(p[0], p[2] - 30), n = Math.hypot(gx, gz);
    if (n < 1e-8) return null;
    const normal = [gx / n, gz / n], tangent = [-normal[1], normal[0]];
    let bank = null;
    for (let i = 3; i <= 28; i++) {
      const x = p[0] + normal[0] * i * 24, z = p[2] + normal[1] * i * 24;
      if (Math.abs(field(x, z) - .5) > .024 && ground(x, z) > 3) { bank = [x, ground(x, z), z]; break; }
    }
    if (!bank) return null;
    return { p, bank, normal, tangent, yaw: -Math.atan2(tangent[0], tangent[1]), field: best.field };
  }
  function build(game) {
    const w = game.world, center = point(w.briefed) ? w.briefed.slice() : point(w.tgtCenter) ? w.tgtCenter.slice() : null;
    if (!center) return null;
    const items = [], features = [], targets = new Map();
    const add = (mesh, x, z, options = {}) => {
      const yaw = options.yaw || 0, hx = options.hx || 1, hz = options.hz || 1;
      const f = options.road ? { y: ground(x, z) + .2, rise: 0 } : footprint(x, z, hx, hz, yaw), y = Number.isFinite(options.y) ? options.y : f.y;
      const item = { mesh, p: [x, y, z], rot: [yaw, options.pitch || 0, options.roll || 0], scale: options.scale || [1, 1, 1], tint: options.tint || [1, 1, 1, 0], hx, hz, rise: f.rise, range: options.range || 8500, detail: options.detail || 0, grounded: options.grounded !== false };
      items.push(item); return item;
    };
    const hut = (x, z, yaw) => { const s = site(x, z, 7, 11, yaw, 80); if (s) add('bnStrikeShed', s.x, s.z, { y: s.y, yaw, hx: 7, hz: 11, detail: 1 }); };
    const road = (a, b) => {
      const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz), count = Math.min(28, Math.ceil(length / 28)), ux = dx / length, uz = dz / length;
      if (!count || !Number.isFinite(ux)) return;
      const yaw = -Math.atan2(ux, uz), half = length / count / 2 + .15;
      for (let i = 0; i < count; i++) {
        const x = a[0] + dx * (i + .5) / count, z = a[2] + dz * (i + .5) / count;
        const along = ground(x + ux * half, z + uz * half) - ground(x - ux * half, z - uz * half);
        const across = ground(x + uz * 4, z - ux * 4) - ground(x - uz * 4, z + ux * 4);
        add('bnStrikeRoad', x, z, { y: ground(x, z) + .2, yaw, pitch: -Math.atan2(along, half * 2), roll: -Math.atan2(across, 8), scale: [1, 1, half / 14], hx: 4, hz: half, detail: 1, road: true });
      }
    };
    const cx = center[0], cz = center[2], junction = [cx + 520, ground(cx + 520, cz + 620), cz + 620];
    const roadEnds = [[junction[0] + 640, 0, junction[2]], [junction[0] - 240, 0, junction[2] + 430], [cx + 250, 0, cz + 220]];
    for (const p of roadEnds) { p[1] = ground(p[0], p[2]); road(junction, p); }
    features.push({ id: 'dixie-road-junction', label: 'Three-way road junction', kind: 'road', p: junction, points: [roadEnds[0], junction, roadEnds[1], junction, roadEnds[2]], signature: 'Three pale dirt roads meet southeast of the briefed depot; the short northwest spur leads toward the compound', briefed: true });
    const tower = site(junction[0] + 70, junction[2] - 56, 5, 5, 0, 45);
    if (tower) add('bnStrikeTower', tower.x, tower.z, { y: tower.y, hx: 5, hz: 5, range: LIMIT.range });
    hut(junction[0] - 65, junction[2] + 60, .25); hut(junction[0] + 95, junction[2] + 76, -.3);
    // The rows are scenery around the public briefed position. They do not
    // create extra targets, score events or invisible radar identities.
    for (let i = 0; i < 7; i++) {
      const x = cx - 300 - (i % 3) * 45, z = cz + 210 + Math.floor(i / 3) * 54;
      const parked = site(x, z, 1.9, 5.3, -.35, 20);
      if (parked) add('bnStrikeTruck', parked.x, parked.z, { y: parked.y, yaw: -.35, hx: 1.9, hz: 5.3, detail: 1 });
    }
    for (let i = 0; i < 4; i++) hut(cx - 290 + i * 72, cz - 260 - (i % 2) * 30, .12);
    features.push({ id: 'dixie-warehouse-row', label: 'Four-shed service row', kind: 'industrial', p: [cx - 182, ground(cx - 182, cz - 275), cz - 275], signature: 'A service row northwest of the supply area; nearby civilian and service buildings are not additional cleared targets', briefed: true });
    const river = riverNear(center);
    if (river) {
      const b = river.bank, t = river.tangent;
      for (let i = 0; i < 5; i++) hut(b[0] + t[0] * (i - 2) * 65 + river.normal[0] * 50, b[2] + t[1] * (i - 2) * 65 + river.normal[1] * 50, river.yaw);
      const points = [-240, -120, 0, 120, 240].map(n => [river.p[0] + t[0] * n, ground(river.p[0] + t[0] * n, river.p[2] + t[1] * n), river.p[2] + t[1] * n]);
      features.push({ id: 'dixie-riverbank', label: 'Riverbank hamlet', kind: 'river', p: river.p.slice(), points, signature: 'Five pitched-roof huts follow a bank of the actual procedural river channel; water stays a dark radar return', briefed: true });
    }
    // Precompute visual grounding, never write the original p/hp/r/mesh.
    for (const t of w.targets || []) if (t && t.kind === 'depot' && point(t.p)) {
      const yaw = Number.isFinite(t.yaw) ? t.yaw : 0, f = footprint(t.p[0], t.p[2], 9.8, 15.8, yaw);
      if (f.rise < 11.5) targets.set(t, { p: [t.p[0], Math.max(f.y, t.p[1]), t.p[2]], rot: [yaw, 0, 0], rise: f.rise });
    }
    return { items, features, targets, river, chart: { title: 'DIXIE-3 · BRIEFED PILOTAGE FEATURES', center, radius: 3600, features, note: 'Representative 1960s scenery authored on the existing procedural terrain. Not a surveyed historical target map; visible buildings are not permission to release.' } };
  }
  function ensure(game) {
    if (!enabled(game) || typeof ctx.terrainH !== 'function') return null;
    let s = states.get(game); if (!s) { s = build(game); if (s) states.set(game, s); } return s;
  }
  function targetVisual(game, target) {
    if (!active(game) || !target || !(game.world.targets || []).includes(target)) return null;
    const s = ensure(game), t = s && s.targets.get(target); if (!t) return null;
    // A dead flag alone, a decorative structure, an impact or an HP-only
    // change is not a destruction event. Require the real World outcome.
    const isDestroyed = destroyed(target);
    return { mesh: isDestroyed ? 'bnStrikeRuin' : 'bnStrikeDepot', p: t.p.slice(), rot: t.rot.slice(), scale: [1, 1, 1], tint: [1, 1, 1, 0], destroyed: isDestroyed, rise: t.rise };
  }
  function instances(game, eye, quality, push) {
    if (!active(game) || !point(eye) || typeof push !== 'function') return 0;
    const s = ensure(game); if (!s) return 0;
    const budget = quality === 0 ? LIMIT.low : quality === 2 ? LIMIT.high : LIMIT.medium;
    const items = s.items.filter(i => (quality !== 0 || i.detail < 2) && d2(i.p, eye) < i.range ** 2).sort((a, b) => d2(a.p, eye) - d2(b.p, eye));
    let n = 0;
    for (const item of items) { if (n >= budget) break; push(item.mesh, item.p, item.rot, item.scale, item.tint); n++; }
    for (const [t, v] of s.targets) if (n < budget && destroyed(t) && t.burn > .02 && d2(v.p, eye) < 5000 ** 2) {
      // Embers accompany a real surviving fire; they are neither a delayed
      // fake detonation nor an independently scheduled gameplay effect.
      const pulse = .8 + .2 * Math.sin((Number(game.world.t) || 0) * 3.2 + v.p[0]);
      push('bnStrikeEmbers', v.p, v.rot, [1, 1, 1], [1, pulse, .7, 1.7 * Math.min(1, t.burn)]); n++;
    }
    return n;
  }
  function lights(game, eye, quality) {
    if (!active(game) || !point(eye)) return [];
    const s = ensure(game); if (!s) return [];
    return [...s.targets].filter(([t, v]) => destroyed(t) && t.burn > .02 && d2(v.p, eye) < 6000 ** 2).sort((a, b) => d2(a[1].p, eye) - d2(b[1].p, eye)).slice(0, quality === 0 ? 1 : LIMIT.lights).map(([t, v]) => [v.p[0], v.p[1] + 2, v.p[2], Math.min(1, t.burn) * .9, 40, [1, .40, .12]]);
  }
  function chart(game) { const s = ensure(game); return s ? copy(s.chart) : null; }
  function inspect(game) { const s = ensure(game); return s ? { active: active(game), count: s.items.length, items: copy(s.items), features: copy(s.features), river: copy(s.river), targets: [...s.targets].map(([t, v]) => ({ p: v.p.slice(), rise: v.rise, destroyed: destroyed(t), burning: destroyed(t) && t.burn > .02 })) } : null; }
  function ensureMeshes(renderer) {
    const MB = ctx.MB; if (!renderer || !renderer.meshes || typeof renderer.meshFromBuilder !== 'function' || typeof MB !== 'function') return false;
    if (uploaded.has(renderer) && renderer.meshes.bnStrikeDepot && renderer.meshes.bnStrikeRuin && renderer.meshes.bnStrikeTower) return true;
    const meshes = {}, wall = [.43, .38, .27], iron = [.26, .28, .25], roof = [.30, .25, .19], concrete = [.26, .25, .21], soot = [.105, .095, .075];
    const foundation = (m, hx, hz) => m.box(0, -6, 0, hx, 6, hz, concrete);
    const pitched = (m, hx, hz, eave, ridge, col) => { m.quad([-hx, eave, -hz], [-hx, eave, hz], [0, ridge, hz], [0, ridge, -hz], col); m.quad([0, ridge, -hz], [0, ridge, hz], [hx, eave, hz], [hx, eave, -hz], col); m.tri([hx, eave, -hz], [-hx, eave, -hz], [0, ridge, -hz], wall); m.tri([-hx, eave, hz], [hx, eave, hz], [0, ridge, hz], wall); };
    let m = new MB(); foundation(m, 9.8, 15.8); m.box(0, 3.3, 0, 9, 3.3, 15, wall); pitched(m, 9.8, 15.8, 6.6, 10.8, roof);
    for (const z of [-15.04, 15.04]) { m.box(0, 2.3, z, 3.2, 2.3, .12, [.10, .11, .09]); for (const x of [-6.4, 6.4]) m.box(x, 4.3, z, 1.1, .9, .13, [.13, .16, .14]); }
    for (const x of [-9.05, 9.05]) for (const z of [-11, -5.5, 0, 5.5, 11]) m.box(x, 3.4, z, .15, 3.4, .16, iron);
    for (let z = -14; z <= 14; z += 3.5) m.box(0, 10.85, z, .22, .18, .13, iron);
    meshes.bnStrikeDepot = m;
    m = new MB(); foundation(m, 9.8, 15.8); m.box(0, .18, 0, 9.5, .18, 15.5, soot);
    m.box(-8.6, 2.1, -3, .4, 2.1, 11, soot); m.box(8.6, 1.4, 7, .4, 1.4, 7, [.16, .145, .11]); m.box(2.4, 1, -14.4, 5.6, 1, .5, soot);
    for (let i = 0; i < 13; i++) { const x = Math.sin(i * 2.7) * 7.8, z = Math.cos(i * 1.8) * 13; m.box(x, .5 + i % 3 * .25, z, 1.5 + i % 2, .55, 1.4, [.14 + i % 3 * .025, .12, .09], i * .7); }
    m.box(-2, 1.7, -3, 7, .18, 5, [.20, .18, .14], .35); m.box(4, 1.3, 8, 4.5, .16, 5.5, iron, -.45); m.box(-3.5, 2.1, 5, .18, 2.1, .18, iron); meshes.bnStrikeRuin = m;
    m = new MB(); for (let i = 0; i < 9; i++) m.box(Math.sin(i * 2.4) * 6.8, .65 + i % 3 * .3, Math.cos(i * 1.7) * 11, .55, .22, .9, i % 2 ? [1, .23, .025] : [1, .55, .08], i); meshes.bnStrikeEmbers = m;
    m = new MB(); foundation(m, 7, 11); m.box(0, 2.4, 0, 6.5, 2.4, 10.5, [.42, .35, .22]); pitched(m, 7, 11, 4.8, 8, roof); m.box(0, 1.5, -10.6, 1.4, 1.5, .12, soot); meshes.bnStrikeShed = m;
    m = new MB(); foundation(m, 5, 5); for (const x of [-3.4, 3.4]) for (const z of [-3.4, 3.4]) m.box(x, 8, z, .32, 8, .32, iron);
    m.cyl(0, 17, 0, 4.5, 3.3, [.39, .35, .26], 10); m.cyl(0, 20.45, 0, 4.8, .2, iron, 10); for (let y = 3; y < 15; y += 4) m.box(0, y, -3.4, 3.5, .18, .18, iron); meshes.bnStrikeTower = m;
    m = new MB(); m.box(0, 0, 0, 4, .08, 14, [.34, .29, .20]); meshes.bnStrikeRoad = m;
    m = new MB(); m.box(0, -2.5, 0, 1.95, 2.5, 5.35, concrete); m.box(0, 1.1, 0, 1.8, .25, 5.1, iron); m.box(0, 2, -3.2, 1.7, 1.1, 1.7, [.25, .29, .17]); m.box(0, 2.6, -4.92, 1.4, .55, .08, [.09, .14, .14]); m.box(0, 2.5, 1.8, 1.8, 1.35, 3, [.37, .33, .20]);
    for (const x of [-1.7, 1.7]) for (const z of [-3.3, 2.6, 4]) m.cyl(x, .7, z, .7, .25, soot, 8, 'x'); meshes.bnStrikeTruck = m;
    for (const name of Object.keys(meshes)) renderer.meshFromBuilder(name, meshes[name]); uploaded.add(renderer); return true;
  }
  root.FlightStrikeScene = Object.freeze({ configure, active, ensure, ensureMeshes, instances, targetVisual, chart, lights, inspect, limits: LIMIT });
})(typeof window !== 'undefined' ? window : globalThis);
