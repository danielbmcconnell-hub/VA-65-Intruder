/* POW river journey. This scene uses the game's WebGL meshes and real, swept
 * movement; it does not alter the flight terrain. Distances are deliberately
 * compressed: one downstream world metre represents 100 route metres. The
 * current and accelerated clock are gameplay approximations, not a measured
 * reconstruction of the October 1967 river. The supplied oral-history summary
 * mentions about three knots, five hours and fifteen miles; 24.14 km is a
 * historical comparison, never a failure or completion trigger. */
(function (root) {
  'use strict';
  const P = root.POW = root.POW || {};
  const SCALE = 100, DELTA = 72000, GULF = 96000, BENCHMARK = 24140;
  const HALF_WIDTH = 14.5, SEGMENT = 112;
  // Original river movement remains continuous. These are invented, readable
  // route sections, not a surveyed 1967 map. Landmarks have persistent global
  // positions, so a tile recentre cannot move a landing ahead of the swimmer.
  const SECTIONS = Object.freeze([
    { id: 'bridge', name: 'Hanoi bridge embankment', from: 0, to: 6500,
      current: .80, bankCurrent: .48, eddy: .07, exposure: 1, reedCover: 0, side: -1,
      hint: 'Pass below the bridge. Its bank abutments and a covered landing break sight lines.' },
    { id: 'reeds', name: 'Reed islands', from: 6500, to: 14500,
      current: .98, bankCurrent: .42, eddy: .14, exposure: .82, reedCover: .25, side: 1,
      hint: 'A quick central current; slower reeds. Watch bank patrols and approach the covered landing quietly.' },
    { id: 'ferry', name: 'Ferry landing', from: 14500, to: BENCHMARK,
      current: .91, bankCurrent: .40, eddy: .10, exposure: 1.12, reedCover: .08, side: -1,
      hint: 'Watch the right-bank landing patrol. The opposite bank has a quiet covered recess.' },
    { id: 'floodplain', name: 'Open floodplain', from: BENCHMARK, to: 46000,
      current: .88, bankCurrent: .43, eddy: .10, exposure: 1.22, reedCover: 0, side: 1,
      hint: 'Daylight exposes the open banks. A sluice wall shelters a resting place; resting advances the clock.' },
    { id: 'delta-reeds', name: 'Delta reed channels', from: 46000, to: DELTA,
      current: .79, bankCurrent: .40, eddy: .15, exposure: .88, reedCover: .20, side: -1,
      hint: 'Reeds and old mooring posts mark the shallows. Rest on a bank or keep drifting toward the delta.' },
    { id: 'delta', name: 'Working-skiff moorings', from: DELTA, to: GULF,
      current: .80, bankCurrent: .42, eddy: .08, exposure: 1, reedCover: .10, side: 1,
      hint: 'Reach the unoccupied skiff physically. Mooring posts and logs remain solid.' }
  ].map(section => Object.freeze(section)));
  const OFFSHORE = Object.freeze({ id: 'gulf', name: 'Gulf offshore contact', current: .1,
    bankCurrent: .1, eddy: .02, exposure: 1, reedCover: 0,
    hint: 'Fictional continuation: approach and signal the visible naval contact. No rescue was arranged.' });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const state = game => game && game.pow;
  const centre = game => state(game).base[0] + 94;
  const notify = (game, message, tone) => {
    if (P.notify) P.notify(game, message, tone || 'info');
  };
  const checkpoint = game => { if (P.save) P.save(game); };
  const hasItem = (s, pattern) => {
    const inv = s.inventory || {};
    if (Array.isArray(inv)) return inv.some(item => pattern.test(typeof item === 'string' ? item : item.id || item.name || ''));
    return Object.keys(inv).some(key => inv[key] && pattern.test(key));
  };
  const modify = (s, key, amount) => {
    const stats = s.stats || (s.stats = {});
    stats[key] = clamp(finite(stats[key], key === 'fatigue' ? 35 : 65) + amount,
      key === 'physical' ? 6 : 0, 100);
  };

  function sectionFor(r) {
    if (r.phase === 'gulf') return OFFSHORE;
    return SECTIONS.find(section => r.logicalDistance < section.to) || SECTIONS[SECTIONS.length - 1];
  }
  function sectionState(game, announce) {
    const r = state(game).river, section = sectionFor(r), changed = r.sectionId !== section.id;
    r.sectionsVisited = Array.isArray(r.sectionsVisited) ? r.sectionsVisited : [];
    r.encounters = r.encounters && typeof r.encounters === 'object' ? r.encounters : {};
    r.sectionId = section.id; r.sectionName = section.name; r.sectionHint = section.hint;
    r.sectionExposure = section.exposure;
    if (!r.sectionsVisited.includes(section.id)) {
      r.sectionsVisited.push(section.id);
      if (announce) notify(game, section.name + ': ' + section.hint, 'warn');
    }
    return changed;
  }
  function landmarkZ(game, section) {
    const r = state(game).river;
    return r.routeOriginZ + section.from / SCALE + 32 - r.streamOffset;
  }

  function landmarks(game) {
    const s = state(game), r = s.river, x = centre(game), y = r.waterY;
    r.landings = [];
    for (const section of SECTIONS) {
      const z = landmarkZ(game, section), id = 'river-landmark-' + section.id;
      if (z < s.nav.zmin - 10 || z > s.nav.zmax - 15) continue;
      if (section.id === 'bridge') {
        box(game, id + '-deck', 'powStone', x, y + 5.1, z, 35, .28, 2.6, { solid: true });
        for (const side of [-1, 1]) {
          box(game, id + '-abutment-' + side, 'powStone', x + side * 20, y + 2.25, z,
            2.1, 2.2, 3, { solid: true });
          box(game, id + '-rail-' + side, 'powMetal', x, y + 5.75, z + side * 2.2, 35, .09, .08);
        }
      } else if (section.id === 'reeds') {
        for (const side of [-1, 1]) {
          const island = box(game, id + '-island-' + side, 'powMud', x + side * 10.7, y - 1.05, z + side * 7,
            1.5, 1.45, 5.2, { solid: true, tint: [.72, .83, .64, 0] });
          if (!island) continue;
          for (let n = 0; n < 5; n++) prop(game, id + '-tuft-' + side + '-' + n, 'bamboo',
            [x + side * 10.7, y + .4, z + side * 7 - 3.5 + n * 1.7], [.14, .25, .14]);
        }
      } else if (section.id === 'ferry') {
        // The dock stops at the bank edge, leaving the central channel open.
        box(game, id + '-dock', 'powWood', x + 17.2, y + .5, z, 2.2, .13, 5.2,
          { solid: true });
        for (const dz of [-4, 4]) box(game, id + '-post-' + dz, 'powWood', x + 16, y + .65, z + dz,
          .13, .9, .13, { solid: true });
        box(game, id + '-hut-back', 'powWood', x + 27, y + 1.55, z, .16, 1.2, 3.3, { solid: true });
        box(game, id + '-hut-side', 'powWood', x + 24.5, y + 1.55, z - 3.3, 2.7, 1.2, .16, { solid: true });
        box(game, id + '-hut-roof', 'powWood', x + 24.5, y + 2.92, z, 2.9, .12, 3.6, { solid: true });
        box(game, id + '-lantern', 'powPale', x + 22, y + 2.25, z - 2.9, .11, .15, .11,
          { tint: [1.7, 1.35, .65, .45] });
      } else if (section.id === 'floodplain') {
        box(game, id + '-sluice', 'powStone', x + 28, y + 1.6, z, 1.4, 1.25, 5.5, { solid: true });
        for (const dz of [-4, 0, 4]) box(game, id + '-gate-' + dz, 'powMetal', x + 26.5, y + 1.2,
          z + dz, .08, .85, .1);
        box(game, id + '-wheel', 'powWood', x + 26.2, y + 1.9, z, .08, .42, .42);
      } else {
        for (let n = 0; n < 5; n++) {
          const side = n % 2 ? -1 : 1;
          box(game, id + '-mooring-' + n, 'powWood', x + side * 16.2, y + .65, z - 12 + n * 6,
            .11, .9, .11, { solid: true });
          prop(game, id + '-reed-' + n, 'bamboo', [x + side * 20.5, y + .35, z - 12 + n * 6], [.24, .5, .24]);
        }
      }
      // A roofed recess is reached by real bank movement. The water-facing
      // side remains open; walls and roof provide physical occlusion rather
      // than an invulnerable menu-triggered hiding state.
      const px = x + section.side * 23, pz = z - 18;
      box(game, id + '-shelter-back', 'powWood', px + section.side * 1.9, y + 1.25, pz,
        .12, .9, 2.5, { solid: true });
      box(game, id + '-shelter-end', 'powWood', px, y + 1.25, pz - 2.5,
        2, .9, .12, { solid: true });
      box(game, id + '-shelter-other-end', 'powWood', px, y + 1.25, pz + 2.5,
        2, .9, .12, { solid: true });
      box(game, id + '-shelter-roof', 'powWood', px, y + 2.36, pz, 2.1, .1, 2.7, { solid: true });
      box(game, id + '-landing-mat', 'powMud', px, y + .39, pz, 1.25, .045, 1.4,
        { tint: [1.15, 1.02, .78, 0] });
      const landing = object(game, 'river-landing-' + section.id, section.name + ' · conceal and rest in the bank recess',
        [px, y + .35, pz], 'hide', 2.3, { hold: 1.6, cover: .9, sectionId: section.id, view: false });
      r.landings.push({ id: landing.id, sectionId: section.id, p: landing.p.slice() });
    }
  }

  function seedEncounter(game) {
    const s = state(game), r = s.river;
    if (r.phase === 'gulf') return;
    const ferry = SECTIONS.find(section => section.id === 'ferry'), z = landmarkZ(game, ferry);
    if (z < s.nav.zmin + 20 || z > s.nav.zmax - 25) return;
    const record = r.encounters.ferry || (r.encounters.ferry = {});
    const actors = game.evade.searchers;
    // A legacy AI restore can replace the initial actor list after scene
    // entry. Require the actual saved/spawned actor, not merely its old flag.
    if (record.peopleSeeded && actors.some(a => a.id === 'river-ferry-patrol')) return;
    const x = centre(game), y = r.waterY + .35;
    const options = [
      { id: 'river-ferry-patrol', kind: 'nva', lamp: true, p: [x + 24, y, z + 17], face: Math.PI,
        route: [[x + 24, y, z + 17], [x + 24, y, z + 6], [x + 31, y, z + 6], [x + 31, y, z - 12]],
        schedule: { cycle: 86, rounds: 57, offset: 12 }, dwell: 7 },
      { id: 'river-ferry-worker', kind: 'farmer', p: [x + 31, y, z - 15], face: Math.PI,
        route: [[x + 31, y, z - 15], [x + 31, y, z + 10]], dwell: 15 }
    ];
    // Never materialize an encounter around the player's saved position.
    if (options.some(o => distance(o.p, game.evade.p) < 18)) return;
    for (const o of options) {
      if (actors.some(a => a.id === o.id)) continue;
      if (P.blocked && P.blocked(game, o.p[0], o.p[2], .35, y)) continue;
      const a = P.AI && P.AI.makeActor ? P.AI.makeActor(o) : Object.assign({ alive: true, armed: o.kind !== 'farmer',
        seen: 0, sus: 0, wp: 0, ph: 0, spd: 0, speed: .6, goal: o.p.slice(), home: o.p.slice() }, o);
      a.riverNPC = true; a.riverEncounter = 'ferry'; actors.push(a);
    }
    record.peopleSeeded = actors.some(a => a.id === 'river-ferry-patrol');
    s.actors = actors;
  }

  function meshes(game) {
    if (P.ensureMeshes) P.ensureMeshes(game);
    const rend = game.rend || game.app && game.app.rend;
    const MB = P.ctx && P.ctx.MB;
    if (!rend || !MB || typeof rend.meshFromBuilder !== 'function') return;
    if (!rend.meshes || !rend.meshes.powRiverSkiff) {
      const m = new MB();
      // A small working skiff, not the existing 24-metre armed patrol boat.
      if (m.frustum) m.frustum(0, .03, 0, .55, 1.6, .88, 2.15, .24, [.24, .15, .08]);
      else m.box(0, 0, 0, .88, .24, 2.15, [.24, .15, .08]);
      m.box(-.8, .35, 0, .07, .3, 1.95, [.34, .23, .13]);
      m.box(.8, .35, 0, .07, .3, 1.95, [.34, .23, .13]);
      m.box(0, .3, -1.3, .8, .08, .23, [.34, .23, .13]);
      m.box(0, .3, 1.1, .8, .08, .23, [.34, .23, .13]);
      m.box(0, .48, .6, .04, .04, 1.6, [.48, .36, .19]);
      rend.meshFromBuilder('powRiverSkiff', m);
    }
    if (!rend.meshes || !rend.meshes.powRiverNaval) {
      const m = new MB();
      // An unnamed representative silhouette for the explicitly fictional
      // rescue branch. No historical vessel or rescue is asserted here.
      if (m.frustum) m.frustum(0, .45, 0, 3, 20, 4.6, 26, 1.5, [.28, .31, .34]);
      else m.box(0, .45, 0, 4.6, 1.5, 26, [.28, .31, .34]);
      m.box(0, 2.1, 0, 4.4, .32, 23, [.39, .42, .44]);
      m.box(0, 3.6, 3, 2.8, 1.3, 7, [.42, .45, .47]);
      m.box(0, 5.6, -1, 2.1, .7, 3.4, [.29, .34, .38]);
      m.box(0, 7, 6, .7, 1.8, .9, [.21, .24, .27]);
      m.box(0, 9, 1, .12, 3.2, .12, [.45, .47, .49]);
      m.box(0, 10.8, 1, 2.6, .07, .1, [.45, .47, .49]);
      m.box(0, 3.1, -15, .95, .5, 1.5, [.32, .35, .38]);
      rend.meshFromBuilder('powRiverNaval', m);
    }
  }

  function box(game, id, mesh, x, y, z, hx, hy, hz, options) {
    const s = state(game), base = s.base;
    if (options && options.solid && id.startsWith('river-landmark-')) {
      // An older checkpoint may occupy space that was empty before these
      // landmarks existed. Keep its position/progress and omit that one new
      // obstacle permanently, rather than trapping or relocating its player.
      const r = s.river;
      r.landmarkClearances = r.landmarkClearances || {};
      for (const actor of [game.evade].concat(game.evade.searchers || [])) {
        if (!actor.p || actor.alive === false) continue;
        const p = actor.p, radius = actor === game.evade ? r.boatOwned ? .82 : .34 : .31;
        const dx = Math.max(Math.abs(p[0] - x) - hx, 0), dz = Math.max(Math.abs(p[2] - z) - hz, 0);
        const vertical = p[1] < y + hy - .035 && p[1] + 1.48 > y - hy + .025;
        if (vertical && dx * dx + dz * dz < radius * radius - 1e-8) r.landmarkClearances[id] = true;
      }
      if (r.landmarkClearances[id]) return null;
    }
    if (P.addBox) return P.addBox(game, id, mesh, x - base[0], y - base[1], z - base[2], hx, hy, hz, options || {});
    const g = { id, m: mesh, p: [x, y, z], y: options && options.yaw || 0,
      s: 1, scale: [hx * 2, hy * 2, hz * 2], t: options && options.tint || [1, 1, 1, 0] };
    game.campGeo.push(g);
    if (options && options.solid) s.solids.push({ id, x, z, hw: hx, hl: hz,
      minY: y - hy, maxY: y + hy, a: options.yaw || 0 });
    return g;
  }
  function object(game, id, name, p, action, radius, extra) {
    const obj = Object.assign({ id, name, p, radius: radius || 3.5,
      action: (g, o) => River.interact(g, o, action) }, extra || {});
    if (P.addObject) P.addObject(game, obj); else state(game).objects.push(obj);
    return obj;
  }
  function prop(game, id, m, p, scale, yaw, tint) {
    const g = { id, m, p, y: yaw || 0, s: 1, scale: scale || [1, 1, 1],
      t: tint || [1, 1, 1, 0] };
    game.campGeo.push(g); return g;
  }
  function rebuild(game) {
    const s = state(game), r = s.river, e = game.evade, x = centre(game), z0 = s.base[2], y = r.waterY;
    sectionState(game, false);
    game.campGeo = []; s.solids = []; s.surfaces = []; s.objects = [];
    game.campY = y + .35;
    game._collisionCache = null;
    s.nav = { xmin: x - 65, xmax: x + 65, zmin: z0 - 102, zmax: z0 + 170,
      minX: x - 65, maxX: x + 65, minZ: z0 - 102, maxZ: z0 + 170,
      bounds: [x - 65, z0 - 102, x + 65, z0 + 170], cell: 1 };
    if (r.phase === 'gulf') {
      s.nav = { xmin: x - 100, xmax: x + 110, zmin: z0 - 110, zmax: z0 + 235,
        minX: x - 100, maxX: x + 110, minZ: z0 - 110, maxZ: z0 + 235,
        bounds: [x - 100, z0 - 110, x + 110, z0 + 235], cell: 1 };
      box(game, 'offshore-bed', 'powMud', x, y - 2.75, z0 + 58, 110, .25, 190);
      box(game, 'offshore-water', 'powWater', x, y - .045, z0 + 58, 110, .04, 190,
        { tint: [.66, .82, 1.05, 0] });
      box(game, 'last-shore', 'powMud', x, y - .1, z0 - 83, 110, .45, 22);
      for (let i = 0; i < 7; i++) prop(game, 'delta-palm-' + i, 'palm',
        [x - 65 + i * 19, y + .35, z0 - 81 + (i % 2) * 12], [.58, .58, .58]);
      if (!r.ship) r.ship = { p: [x + 22, y, z0 + 140], acknowledged: false };
      prop(game, 'naval-contact', 'powRiverNaval', r.ship.p.slice(), [1, 1, 1], Math.PI);
      // The hull is a real solid; approach the visible stern-side recovery point.
      box(game, 'naval-hull', 'powMetal', r.ship.p[0], y + .2, r.ship.p[2], 4.4, 1.2, 24,
        { solid: true, tint: [.36, .39, .42, 0] });
      r.recoveryPoint = [r.ship.p[0] + 7.6, y, r.ship.p[2] - 16];
      box(game, 'recovery-buoy', 'powPale', r.recoveryPoint[0], y + .14, r.recoveryPoint[2], .23, .32, .23,
        { tint: [1.3, 1.2, .8, .15] });
      object(game, 'river-signal', 'Signal the unnamed offshore naval contact', r.recoveryPoint.slice(), 'signal', 13, { hold: 1.5, view: false });
      r.control = object(game, 'river-float', 'Float / swim · hold Space or DIVE to submerge', e.p.slice(), 'float', 1.6, { view: false });
      if (r.boatOwned) prop(game, 'river-skiff', 'powRiverSkiff', e.p.slice(), [1, 1, 1], e.hdg);
      return;
    }
    // Raised river bed masks the procedural ground locally. Nothing changes
    // terrainH, the flight world, the real sea, or the original camp site.
    box(game, 'river-bed', 'powMud', x, y - 2.7, z0 + 30, 65, .28, 136);
    box(game, 'river-water', 'powWater', x, y - .04, z0 + 30, HALF_WIDTH, .035, 136,
      { tint: [.60, .81, .87, 0] });
    for (const side of [-1, 1]) {
      box(game, 'bank-' + side, 'powMud', x + side * 39.5, y - .12, z0 + 30, 25, .47, 136,
        { tint: [.78, .83, .66, 0] });
      for (let i = 0; i < 12; i++) {
        const z = z0 - 86 + i * 22;
        prop(game, 'river-bamboo-' + side + '-' + i, i % 3 ? 'bamboo' : 'palm',
          [x + side * (21 + i % 4 * 3), y + .35, z], [.48, .58, .48]);
        // Thin reeds leave a navigable lane along the mud bank.
        for (let k = 0; k < 3; k++) box(game, 'reed-' + side + '-' + i + '-' + k,
          'powWood', x + side * (15.7 + k * .7), y + .65, z + k * .9,
          .035, .7 + k * .12, .035, { tint: [.43, .64, .34, 0] });
      }
      for (let i = 0; i < 5; i++) {
        const z = z0 - 72 + i * 48, px = x + side * 18;
        box(game, 'mud-shelter-' + side + '-' + i, 'powMud', px, y + .48, z, 1.4, .16, 1.3,
          { tint: [.44, .46, .35, 0] });
        object(game, 'river-hide-' + side + '-' + i, 'Dig a mud shelter / conceal and rest',
          [px, y + .35, z], 'hide', 3.2, { hold: 2, cover: .87, view: false });
      }
    }
    landmarks(game);
    // A repeatable, staggered obstacle course. The open central lane means a
    // tired swimmer can still float; swimming around logs is a useful choice.
    for (let i = 0; i < 6; i++) {
      const z = z0 - 58 + i * 37, side = (i + r.segment) % 2 ? -1 : 1;
      const px = x + side * (7 + (r.segment + i) % 3);
      if (Math.hypot(e.p[0] - px, e.p[2] - z) < 7) continue;
      box(game, 'river-log-' + i, 'powWood', px, y - .05, z, 3.1, .22, .44,
        { solid: true, tint: [.53, .39, .23, 0] });
    }
    if (r.phase === 'delta' && !r.boatOwned) {
      if (!r.boat) r.boat = { p: [x + 12, y + .03, e.p[2] + 28], speed: 0 };
      prop(game, 'river-skiff', 'powRiverSkiff', r.boat.p.slice(), [1, 1, 1], Math.PI);
      object(game, 'river-board', 'Climb into the unoccupied working skiff', r.boat.p.slice(), 'board', 3.8, { hold: 1.4, view: false });
    } else if (r.boatOwned) prop(game, 'river-skiff', 'powRiverSkiff', e.p.slice(), [1, 1, 1], e.hdg);
    r.control = object(game, 'river-float', 'Float / swim · hold Space or DIVE to submerge', e.p.slice(), 'float', 1.6, { view: false });
    seedEncounter(game);
  }

  function seedPeople(game) {
    const s = state(game), r = s.river, x = centre(game), z = s.base[2];
    const actors = game.evade.searchers || (game.evade.searchers = []);
    if (actors.some(a => a.riverNPC)) return;
    // No guard is placed at the swimmer's entry. These are observers with
    // ordinary world-space sight lines, not timed or distance-based captures.
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1, p = [x + side * 23, r.waterY + .35, z + 38 + i * 27];
      actors.push({ id: 'river-person-' + i, riverNPC: true, p, pY: p[1],
        kind: i === 0 || i === 3 ? 'farmer' : 'nva', civilian: i === 0 || i === 3,
        armed: i === 1 || i === 2, alive: true, seen: 0, sus: 0, face: side > 0 ? -Math.PI / 2 : Math.PI / 2,
        wp: 0, ph: i * .8, speed: .6, spd: 0, goal: [p[0], p[1], p[2] + 22],
        route: [[p[0], p[1], p[2] - 18], [p[0], p[1], p[2] + 26]],
        home: p.slice(), lamp: i === 1 || i === 2 ? 1 : 0 });
    }
    s.actors = actors;
  }

  function recenter(game) {
    const s = state(game), r = s.river, e = game.evade;
    if (r.phase === 'gulf' || e.p[2] <= s.base[2] + 100) return;
    e.p[2] -= SEGMENT; r.streamOffset += SEGMENT; r.segment++;
    const visited = new Set([e.p]);
    const shift = p => { if (Array.isArray(p) && !visited.has(p)) { p[2] -= SEGMENT; visited.add(p); } };
    for (const a of e.searchers || []) {
      shift(a.p); shift(a.goal); shift(a.home); shift(a.lastKnown);
      for (const key of ['observedPlayer', 'lastNoise', 'searchOrigin', 'investigateOrigin', 'fleeGoal', 'pathGoal']) shift(a[key]);
      for (const p of (a.route || []).concat(a.path || [])) shift(p);
      // A pursuing man remains pursuing. An unalerted observer who is now
      // behind the repeating scene rejoins a beat downstream, without seeing
      // the player solely because a segment was rebuilt.
      if (a.riverNPC && !a.riverEncounter && !a.seen && a.p[2] < s.base[2] - 90) {
        const dz = 220;
        for (const p of [a.p, a.goal, a.home].concat(a.route || [])) if (p) p[2] += dz;
      }
    }
    if (r.boat && !r.boatOwned) shift(r.boat.p);
    if (r.hideAt) shift(r.hideAt);
    if (e.pickup) shift(e.pickup);
    for (const noise of s.noises || []) shift(noise.p);
    rebuild(game); checkpoint(game);
  }

  function enter(game) {
    const s = state(game), e = game.evade;
    if (!s || !e) return false;
    const restoring = !!s.river;
    s.customMovement = true; s.stage = 'river';
    s.flags = s.flags || {}; s.flags.riverEntered = true;
    if (!s.river) {
      let high = finite(s.base[1], 0);
      const terrain = P.ctx && P.ctx.terrainH;
      if (terrain) for (let ix = -70; ix <= 120; ix += 24)
        for (let iz = -115; iz <= 255; iz += 24)
          high = Math.max(high, finite(terrain(centre(game) + ix, s.base[2] + iz), high));
      s.river = { version: 1, phase: 'stream', mode: 'float', logicalDistance: 0,
        distanceScale: SCALE, historicalBenchmark: BENCHMARK, deltaAt: DELTA, gulfAt: GULF,
        elapsed: 0, hours: .2, startDay: finite(s.day, 1), segment: 0, streamOffset: 0,
        waterY: high + 3.6, breath: 100, surfacingCooldown: 0, damageCooldown: 0,
        currentWorldMps: .8, weather: 'mist', visibility: .45, noise: .12,
        resting: false, checkpoints: [], signalProgress: 0, recoveryTime: 0,
        signalFabric: true, boatOwned: false, finished: false };
      e.p[0] = Math.abs(e.p[0] - centre(game)) < HALF_WIDTH ?
        clamp(e.p[0], centre(game) - HALF_WIDTH + 1, centre(game) + HALF_WIDTH - 1) : centre(game) - 3;
      e.p[2] = clamp(e.p[2], s.base[2] - 75, s.base[2] + 75);
      e.p[1] = s.river.waterY - .42; e.hdg = Math.PI;
      e.searchers = (e.searchers || []).filter(a => a.alive !== false && a.seen
        && distance(a.p, e.p) < 42 && Math.abs(a.p[0] - centre(game)) >= HALF_WIDTH + .35);
      for (const a of e.searchers) { a.p[1] = s.river.waterY + .35; a.pY = a.p[1]; }
    }
    const r = s.river;
    r.breath = clamp(finite(r.breath, 100), 0, 100);
    r.streamOffset = finite(r.streamOffset, 0); r.segment = finite(r.segment, 0);
    r.routeOriginZ = finite(r.routeOriginZ, e.p[2] + r.streamOffset - r.logicalDistance / SCALE);
    r.checkpoints = r.checkpoints || []; r.finished = false;
    // Core restores saved AI after scene entry. Audit once on its first real
    // tick so an old NPC save is not enclosed by a newly introduced structure.
    r.layoutAuditPending = restoring;
    sectionState(game, false);
    r.eyeHeight = r.mode === 'boat' ? 1.05 : r.mode === 'bank' || r.mode === 'hidden' ? 1.58 : .48;
    e.camp = true; e.river = true; e.frozen = false; e.inCell = false; e.hasRadio = false; e.radio = -1;
    e.locals = []; e.cattle = []; e.spawn = e.localRefill = 1e9;
    s.p = e.p;
    meshes(game); rebuild(game);
    if (r.phase !== 'gulf') { seedPeople(game); seedEncounter(game); }
    else { e.searchers = []; s.actors = e.searchers; }
    objective(game); checkpoint(game);
    notify(game, 'The water carries you downstream. Steer toward reeds to reach a bank; F switches float/swim. Hold Space or DIVE briefly to submerge. No survival radio is available.', 'warn');
    return true;
  }

  function objective(game) {
    const s = state(game), r = s.river;
    if (r.resting) s.objective = 'Concealed in a mud shelter. Rest advances the clock; movement leaves shelter. Observers can still discover you.';
    else if (r.phase === 'gulf') s.objective = r.ship && r.ship.acknowledged
      ? 'The contact has noticed your signal. Carefully approach the recovery point alongside its stern.'
      : 'FICTIONAL continuation: approach the visible offshore contact and signal with clothing or a mirror. There is no arranged rescue.';
    else if (r.phase === 'delta') s.objective = r.boatOwned
      ? 'Steer the skiff downstream toward the Gulf. Forward/back controls paddle and brake; banks and logs remain solid.'
      : 'The delta widens ahead. Physically reach the unoccupied skiff near the bank and hold F to board, or continue swimming.';
    else s.objective = r.sectionName + ': ' + r.sectionHint;
    r.distanceKm = r.logicalDistance / 1000;
    r.progress = clamp(r.logicalDistance / GULF, 0, 1);
    r.benchmarkPassed = r.logicalDistance >= BENCHMARK;
    r.compressionNote = 'Route distance is compressed 100:1; current, travel time and offshore continuation are gameplay approximations.';
  }

  function transitionToGulf(game) {
    const s = state(game), r = s.river, e = game.evade;
    r.phase = 'gulf'; s.flags.fictionalContinuation = true;
    // Local origin changes only the stage geometry; saved route distance stays
    // continuous. Boat, player, and NPC coordinates are rebuilt together.
    const dz = e.p[2] - s.base[2];
    e.p[2] -= dz;
    if (r.boat) r.boat.p = e.p.slice();
    e.searchers = []; s.actors = e.searchers;
    r.ship = { p: [centre(game) + 22, r.waterY, s.base[2] + 140], acknowledged: false };
    rebuild(game); checkpoint(game);
    notify(game, 'FICTIONAL ALTERNATE HISTORY: you have reached the Gulf. The distant unnamed naval contact is an opportunity to approach and signal, not a prearranged rescue.', 'warn');
  }

  function interact(game, obj, requested) {
    const s = state(game), e = game.evade, r = s && s.river;
    if (!r || r.finished) return false;
    const action = requested || (typeof obj === 'string' ? obj : obj && obj.id || 'float');
    if (obj && obj.p && distance(e.p, obj.p) > (obj.radius || 3.5) + .4) return false;
    if (action === 'float' || action === 'river-float') {
      if (r.boatOwned || Math.abs(e.p[0] - centre(game)) >= HALF_WIDTH) return false;
      r.mode = r.mode === 'float' ? 'swim' : 'float'; r.resting = false;
      notify(game, r.mode === 'float' ? 'Floating conserves strength; you can still steer gently.' : 'Swimming gives stronger control and costs strength.');
    } else if (action === 'dive') {
      r.diveToggle = !r.diveToggle; return true;
    } else if (action === 'hide' || /^river-hide/.test(action)) {
      if (!obj || Math.abs(e.p[0] - centre(game)) < HALF_WIDTH || r.boatOwned) return false;
      r.hideAt = obj.p.slice(); r.resting = !r.resting;
      if (r.resting) {
        e.p[0] = obj.p[0]; e.p[2] = obj.p[2]; e.p[1] = r.waterY + .35;
        r.mode = 'hidden'; modify(s, 'fatigue', 6); modify(s, 'hope', 2);
        if (obj.sectionId) {
          const record = r.encounters[obj.sectionId] || (r.encounters[obj.sectionId] = {});
          record.landingReached = true; record.rests = finite(record.rests, 0) + 1;
          record.arrivalDistance = Math.round(r.logicalDistance); record.arrivalHour = r.hour;
        }
        r.checkpoints.push({ mode: 'bank', distance: Math.round(r.logicalDistance), day: s.day });
        if (P.AI && P.AI.noise) P.AI.noise(game, e.p, .42, 'mud-dig');
        notify(game, 'You work into the muddy bank under the reeds. Rest here recovers strength and advances hours; move to leave. Concealment can fail if someone comes close.', 'warn');
      } else { r.mode = 'bank'; notify(game, 'You leave the shelter.'); }
    } else if (action === 'board' || action === 'river-board') {
      if (!r.boat || r.boatOwned || distance(e.p, r.boat.p) > 4.2) return false;
      r.boatOwned = true; r.mode = 'boat'; r.resting = false;
      e.p = r.boat.p.slice(); e.p[1] = r.waterY + .24; e.hdg = Math.PI; s.p = e.p;
      r.boat.speed = 0; s.flags.deltaBoat = true;
      r.checkpoints.push({ mode: 'boat', distance: Math.round(r.logicalDistance), day: s.day });
      rebuild(game); notify(game, 'A small unoccupied working skiff. Forward paddles; backward brakes. Turn with A/D, arrows, touch stick or mouse look. The Gulf still requires travel.', 'warn');
    } else if (action === 'signal' || action === 'river-signal') {
      if (r.phase !== 'gulf' || !r.recoveryPoint || distance(e.p, r.recoveryPoint) > 13.4) return false;
      if (!r.signalFabric && !hasItem(s, /mirror|cloth|fabric|shirt|scarf/i)) return false;
      r.signaling = true;
      notify(game, 'You raise a strip of clothing and signal. Hold position alongside the contact while its watch identifies you.', 'warn');
    } else return false;
    if (r.checkpoints.length > 24) r.checkpoints.splice(0, r.checkpoints.length - 24);
    objective(game); checkpoint(game); return true;
  }

  function input(game) {
    const s = state(game), keys = game.app && game.app.keys || {}, touch = game.app && game.app.gctl || {};
    const i = s.input || {};
    return { forward: clamp(finite(i.forward, (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + finite(touch.pitch, 0)), -1, 1),
      strafe: clamp(finite(i.strafe, 0), -1, 1), run: !!(i.run || touch.run || keys.ShiftLeft || keys.ShiftRight),
      crouch: !!(i.crouch || touch.crouch || keys.KeyC), dive: !!(i.climb || keys.Space || touch.climb || touch.dive) };
  }
  function move(game, dx, dz, radius) {
    const e = game.evade;
    if (P.move) P.move(game, e, dx, dz, radius || .34);
    else { e.p[0] += dx; e.p[2] += dz; }
  }
  function simulationStep(game, dt) {
    const s = state(game), r = s.river, e = game.evade, i = input(game), stats = s.stats || {};
    const section = sectionFor(r);
    const x = centre(game), old = e.p.slice();
    const steer = Math.abs(i.forward) + Math.abs(i.strafe) > .06;
    const onBank = r.phase !== 'gulf' ? Math.abs(e.p[0] - x) >= HALF_WIDTH
      : e.p[2] <= s.base[2] - 61;
    r.elapsed += dt;
    r.damageCooldown = Math.max(0, finite(r.damageCooldown, 0) - dt);
    r.surfacingCooldown = Math.max(0, finite(r.surfacingCooldown, 0) - dt);
    if (steer && r.resting) { r.resting = false; r.mode = 'bank'; r.signaling = false; }
    if (r.resting && (!r.hideAt || distance(e.p, r.hideAt) > 2.5 || !onBank)) r.resting = false;
    const hoursBefore = r.hours;
    r.hours += dt * (r.resting ? .18 : .0145);
    r.hour = ((r.hours % 24) + 24) % 24;
    s.day = r.startDay + Math.floor(r.hours / 24);
    r.daylight = clamp((r.hour - 5.5) / 1.3, 0, 1) * clamp((19.5 - r.hour) / 1.4, 0, 1);
    r.rain = clamp(.3 + Math.sin(r.hours * 1.1 + .8) * .42, 0, 1);
    r.weather = r.rain > .48 ? 'rain' : r.daylight > .65 ? 'haze' : 'mist';
    if (typeof game.setHour === 'function' && (r.lastLitHour === undefined || Math.abs(r.hours - r.lastLitHour) > .14)) {
      game.setHour(r.hour, .48); r.lastLitHour = r.hours;
      if (game.atm) {
        game.atm.overcast = clamp(.26 + r.rain * .68, 0, 1);
        game.atm.wet = r.rain > .45 ? 1 : 0;
        game.atm.fogDens = .00004 + r.rain * .00022;
      }
    }
    if (Math.floor(hoursBefore / 24) < Math.floor(r.hours / 24)) {
      modify(s, 'memory', .8); modify(s, 'hope', -.7); checkpoint(game);
    }
    const fatigue = finite(stats.fatigue, 35), health = finite(stats.physical, 65);
    r.submerged = !onBank && !r.boatOwned && !!(i.dive || r.diveToggle)
      && r.breath > 8 && r.surfacingCooldown <= 0;
    if (r.submerged) {
      r.breath = Math.max(0, r.breath - dt * (steer ? 7.8 : 6));
      if (r.breath <= 8) {
        r.submerged = false; r.diveToggle = false; r.surfacingCooldown = 6;
        modify(s, 'fatigue', 3); notify(game, 'Air is running short. You surface automatically; breathe before diving again.', 'warn');
      }
    } else r.breath = Math.min(100, r.breath + dt * 12);
    const speedScale = clamp(1 - fatigue * .006, .32, 1) * clamp(.52 + health * .007, .55, 1);
    const previousMode = r.mode;
    if (r.boatOwned) {
      r.mode = 'boat'; r.submerged = false;
      if (!r.boat) r.boat = { p: e.p.slice(), speed: 0 };
      r.boat.speed = clamp(finite(r.boat.speed, 0) + i.forward * dt * 1.8 - finite(r.boat.speed, 0) * dt * .24, -.55, 3.1);
      const current = r.phase === 'gulf' ? .08 : .26;
      move(game, Math.sin(e.hdg) * r.boat.speed * dt, (-Math.cos(e.hdg) * r.boat.speed + current) * dt, .82);
      // Boats beach against the bank instead of sailing through the dry mud.
      // Swimming can cross this shoreline; a boarded hull cannot.
      if (r.phase !== 'gulf' && Math.abs(e.p[0] - x) > HALF_WIDTH - .9) {
        e.p[0] = clamp(e.p[0], x - HALF_WIDTH + .9, x + HALF_WIDTH - .9);
        r.boat.speed *= Math.max(0, 1 - dt * 6);
      } else if (r.phase === 'gulf' && e.p[2] < s.base[2] - 59) {
        e.p[2] = s.base[2] - 59; r.boat.speed = Math.max(0, r.boat.speed);
      }
      e.p[1] = r.waterY + .24; r.eyeHeight = 1.02;
      r.boat.p = e.p.slice(); r.boat.yaw = e.hdg;
      modify(s, 'fatigue', (steer ? .038 : -.045) * dt);
      modify(s, 'physical', .012 * dt);
    } else if (onBank) {
      r.mode = r.resting ? 'hidden' : 'bank'; r.submerged = false; r.eyeHeight = i.crouch || r.resting ? .82 : 1.56;
      const speed = (i.run && !i.crouch ? 2.9 : i.crouch ? .8 : 1.6) * speedScale;
      if (!r.resting) move(game, (Math.sin(e.hdg) * i.forward + Math.cos(e.hdg) * i.strafe) * speed * dt,
        (-Math.cos(e.hdg) * i.forward + Math.sin(e.hdg) * i.strafe) * speed * dt);
      e.p[1] = r.waterY + .35;
      modify(s, 'fatigue', (r.resting ? -1.05 : steer ? .06 : -.16) * dt);
      modify(s, 'physical', (r.resting ? .30 : !steer ? .05 : 0) * dt);
      modify(s, 'morale', (r.resting ? .045 : -.002) * dt);
    } else {
      if (r.mode === 'bank' || r.mode === 'hidden' || r.mode === 'dive') r.mode = r.floatBeforeDive ? 'float' : 'swim';
      if (r.submerged) { r.floatBeforeDive = r.mode === 'float'; r.mode = 'dive'; }
      const floating = r.mode === 'float' || r.submerged && r.floatBeforeDive;
      const swimSpeed = (floating ? .54 : r.submerged ? .9 : i.run ? 1.9 : 1.45) * speedScale;
      // Faster open-channel drift and a slower bank eddy are both physical
      // choices. Reaching a bank still requires steering; neither current
      // variation nor dawn triggers a capture or removes recovery controls.
      const bankEddy = clamp((Math.abs(e.p[0] - x) - 9.5) / 5, 0, 1);
      r.currentWorldMps = r.phase === 'gulf' ? .10
        : section.current + (section.bankCurrent - section.current) * bankEddy + r.rain * .16;
      const eddy = r.phase === 'gulf' ? .02 : Math.sin((e.p[2] + r.streamOffset) * .027) * section.eddy;
      move(game, ((Math.sin(e.hdg) * i.forward + Math.cos(e.hdg) * i.strafe) * swimSpeed + eddy) * dt,
        ((-Math.cos(e.hdg) * i.forward + Math.sin(e.hdg) * i.strafe) * swimSpeed + r.currentWorldMps) * dt);
      // The core's standing collision body is 1.48m tall: this depth gives it
      // clearance below floating logs, while remaining above the river bed.
      e.p[1] = r.waterY - (r.submerged ? 2.1 : .42); r.eyeHeight = r.submerged ? .3 : .48;
      modify(s, 'fatigue', (floating ? -.060 + (steer ? .028 : 0) : steer ? .17 : .035) * dt);
      // Fatigue takes away propulsion, never the player's ability to reach a
      // bank, float, breathe, or recover from an earlier poor decision.
      modify(s, 'physical', (fatigue > 88 && steer && !floating ? -.022 : 0) * dt);
    }
    const actual = Math.hypot(e.p[0] - old[0], e.p[2] - old[2]);
    const collision = actual < dt * .08 && !onBank && !r.submerged
      && (steer || r.phase !== 'gulf') && !r.resting;
    if (collision && r.damageCooldown <= 0) {
      modify(s, 'physical', -1.2); modify(s, 'fatigue', 2.4); r.damageCooldown = 6;
      e.hurt = true; notify(game, 'The current presses you against an obstacle. Steer sideways or dive beneath the floating log.', 'warn');
    }
    e.p[0] = clamp(e.p[0], s.nav.xmin + 1, s.nav.xmax - 1);
    e.p[2] = clamp(e.p[2], s.nav.zmin + 1, s.nav.zmax - 1);
    // Progress comes from physical downstream travel in the channel, never a
    // timer or walking down the bank. Recentring is applied after this delta.
    if (!onBank && r.phase !== 'gulf') r.logicalDistance = Math.max(0,
      r.logicalDistance + (e.p[2] - old[2]) * SCALE);
    const sheltered = onBank && r.hideAt && distance(e.p, r.hideAt) < 2.6 && (i.crouch || r.resting);
    const reedEdge = !onBank && Math.abs(e.p[0] - x) > 11 && section.reedCover > 0;
    r.cover = r.submerged ? .985 : sheltered ? .86 : onBank && i.crouch ? .60 : reedEdge ? section.reedCover : 0;
    r.visibility = (r.submerged ? .025 : sheltered ? .14 : onBank && i.crouch ? .42 : 1)
      * (.36 + r.daylight * 1.12) * (1 - r.rain * .37) * (reedEdge ? .72 : 1) * section.exposure;
    // Quiet posture must affect the underlying sound events, not just the
    // visual pose. Previously crouching on a bank emitted full-volume steps,
    // attracting a guard for longer because the player moved more slowly.
    r.noise = r.submerged ? .02 : r.boatOwned ? steer ? .9 : .16
      : onBank ? i.run && !i.crouch ? 1.1 : steer ? i.crouch ? .065 : .26 : .015
      : r.mode === 'float' ? .08 : steer ? i.crouch ? .22 : .72 : .18;
    e.submerged = r.submerged; e.hidden = !!sheltered; e.crouch = !!(i.crouch || r.resting); e.cover = r.cover;
    e.moving = actual > dt * .015; e.running = !!(i.run && onBank && steer);
    e.noise = r.noise; s.p = e.p;
    s.noise = Math.max(finite(s.noise, 0), r.noise);
    if (steer && !r.submerged && r.elapsed >= finite(r.nextStrokeNoise, 0)) {
      r.nextStrokeNoise = r.elapsed + .85;
      if (P.AI && P.AI.noise) P.AI.noise(game, e.p, r.noise,
        r.boatOwned ? 'paddle-stroke' : onBank ? 'mud-footstep' : 'swim-stroke');
    }
    if (previousMode !== r.mode && ['bank', 'boat', 'float', 'hidden'].includes(r.mode)) {
      r.checkpoints.push({ mode: r.mode, distance: Math.round(r.logicalDistance), day: s.day });
      if (r.checkpoints.length > 24) r.checkpoints.shift(); checkpoint(game);
    }
    if (r.phase !== 'gulf' && sectionState(game, true)) {
      rebuild(game); checkpoint(game);
    }
    if (r.logicalDistance >= DELTA && r.phase === 'stream') {
      r.phase = 'delta'; s.flags.deltaReached = true;
      r.boat = { p: [x + 11.5, r.waterY + .03, e.p[2] + 26], speed: 0 };
      if (P.blocked) for (let n = 0; n < 10 && P.blocked(game, r.boat.p[0], r.boat.p[2], 1,
        r.waterY + .24); n++) r.boat.p[2] += 2;
      rebuild(game); checkpoint(game);
      notify(game, 'You have reached the wider delta. A small working skiff lies ahead near the bank. Reach it and hold F to board. This continuation is fictional alternate history.', 'warn');
    }
    if (r.logicalDistance >= GULF && r.phase !== 'gulf') transitionToGulf(game);
    else recenter(game);
    if (r.control) {
      const targetNear = r.phase === 'delta' && !r.boatOwned && r.boat && distance(e.p, r.boat.p) < 8
        || r.phase === 'gulf' && r.recoveryPoint && distance(e.p, r.recoveryPoint) < 20;
      r.control.p = !onBank && !r.boatOwned && !targetNear ? e.p.slice() : [x + 1000, r.waterY, s.base[2]];
    }
    const skiff = game.campGeo.find(g => g.id === 'river-skiff');
    if (skiff && r.boatOwned) { skiff.p = [e.p[0], r.waterY + .03, e.p[2]]; skiff.y = e.hdg; }
    rescueStep(game, dt, steer);
    objective(game);
  }

  function rescueStep(game, dt, moving) {
    const s = state(game), r = s.river, e = game.evade;
    if (r.phase !== 'gulf' || !r.signaling || !r.recoveryPoint || r.finished) return;
    const gap = distance(e.p, r.recoveryPoint);
    if (gap > 17 || r.submerged || moving && gap > 8 && !r.ship.acknowledged) {
      r.signaling = false; return;
    }
    const stats = s.stats || {}, mirror = hasItem(s, /mirror/i);
    const condition = clamp(.25 + finite(stats.physical, 60) * .005
      + finite(stats.hope, 50) * .002 - finite(stats.fatigue, 40) * .0015, .22, 1);
    const weather = 1 - r.rain * .55;
    const signal = mirror && r.daylight > .4 ? 1.4 : gap < 10 ? 1 : .6;
    r.signalProgress += dt * condition * weather * signal;
    if (r.signalProgress >= 7 && !r.ship.acknowledged) {
      r.ship.acknowledged = true; s.flags.navalSignalAcknowledged = true;
      notify(game, 'The watch has noticed you. Approach the stern-side recovery point slowly; stay within five metres so the crew can bring you aboard.', 'warn');
      checkpoint(game);
    }
    if (r.ship.acknowledged && gap <= 5.2 && (!r.boatOwned || Math.abs(r.boat.speed) < .6)) {
      r.recoveryTime += dt * condition;
      if (r.recoveryTime >= 4.5) {
        r.finished = true; s.flags.fictionalRescue = true; s.flags.fictionalContinuation = true;
        checkpoint(game);
        const result = { id: 'pow-fictional-river-rescue', title: 'Fictional alternate-history rescue', rescued: true, escaped: true, historical: false,
          text: 'FICTIONAL ALTERNATE HISTORY: after reaching the delta, approaching an unnamed offshore naval contact and signaling at close range, you are brought aboard. Coker and McKnight were recaptured during their actual 1967 escape; this playable successful continuation is hypothetical.' };
        if (P.finish) P.finish(game, result); else s.result = result;
      }
    } else r.recoveryTime = Math.max(0, r.recoveryTime - dt * .3);
  }

  function step(game, dt) {
    const s = state(game), r = s && s.river;
    if (!r || r.finished || !game.evade || !Number.isFinite(dt) || dt <= 0) return false;
    if (r.layoutAuditPending) { r.layoutAuditPending = false; rebuild(game); checkpoint(game); }
    // Frame stalls cannot tunnel through logs or consume a full breath bar.
    let remaining = Math.min(dt, .25);
    while (remaining > .000001 && !r.finished) {
      const amount = Math.min(remaining, 1 / 30);
      simulationStep(game, amount); remaining -= amount;
    }
    return true;
  }
  const River = P.River = { enter, step, interact, rebuild, objective, ensureMeshes: meshes,
    sections: SECTIONS,
    constants: Object.freeze({ distanceScale: SCALE, deltaDistance: DELTA, gulfDistance: GULF,
      historicalBenchmark: BENCHMARK, channelHalfWidth: HALF_WIDTH, segmentLength: SEGMENT }) };
})(typeof window !== 'undefined' ? window : globalThis);
