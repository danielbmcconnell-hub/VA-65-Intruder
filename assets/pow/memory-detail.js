/* Warm, authored details for imagined projects. These are fictional remembered
   surroundings, not historical photographs or claims about a specific POW.
   Actual puzzle state alone determines what can be shown. */
(function (root) {
  'use strict';
  const P = root.POW = root.POW || {}, cache = new WeakMap(), PREFIX = 'memory-detail:', LIMIT = 32;
  const active = game => !!(game && game.pow && game.evade && P.Mindscape && P.Mindscape.active(game) && game.pow.captivity && game.pow._mindscape && ['car', 'architecture', 'city'].includes(game.pow._mindscape.kind));
  function cleanup(game) {
    if (!game || !Array.isArray(game.campGeo) || !game.campGeo.some(q => q.id && q.id.startsWith(PREFIX))) return 0;
    const before = game.campGeo.length; game.campGeo = game.campGeo.filter(q => !q.id || !q.id.startsWith(PREFIX)); cache.delete(game); return before - game.campGeo.length;
  }
  function project(game) {
    const c = game.pow.captivity, m = c.mindscape || {}, kind = game.pow._mindscape.kind;
    if (kind === 'car') return { kind, installed: c.car.installed.length ? c.car.installed : m.completedCar ? m.completedCar.installed : [] };
    if (kind === 'architecture') return { kind, choices: Object.keys(c.architecture.choices).length ? c.architecture.choices : m.completedHouse ? m.completedHouse.choices : {} };
    const untouched = c.city.grid.every((q, i) => q === (Math.floor(i / 5) === 2 ? 'road' : 'empty'));
    return { kind, grid: untouched && m.completedCity ? m.completedCity.grid : c.city.grid };
  }
  function decorate(game) {
    if (!active(game)) { cleanup(game); return { active: false, count: 0 }; }
    const p = project(game), key = JSON.stringify([game.pow.base, p]), previous = cache.get(game);
    if (previous && previous.pow === game.pow && previous.scene === game.campGeo && previous.key === key) return { active: true, kind: p.kind, count: previous.count };
    cleanup(game); let count = 0;
    const box = (id, mesh, x, y, z, hx, hy, hz, tint) => {
      if (count >= LIMIT) return;
      P.addBox(game, PREFIX + id, mesh, x, y, z, hx, hy, hz, { tint: tint || [1, 1, 1, 0] }); count++;
    };
    const warm = [1.30, 1.17, .94, 0], blue = [.65, .96, 1.20, 0], wood = [1.48, 1.20, .84, 0], green = [.69, 1.15, .73, 0], cream = [1.45, 1.36, 1.12, 0];
    if (p.kind === 'car') {
      const installed = new Set(p.installed);
      if (installed.has('block')) { box('engine-nameplate', 'powPale', .49, 1.38, -2.8, .012, .065, .22, cream); box('block-painted-edge', 'powMetal', -.49, 1.22, -2.8, .015, .035, .68, [1.36, .86, .56, 0]); }
      if (installed.has('oiling')) { box('oil-line', 'powMetal', -.54, 1.05, -2.9, .022, .022, .50, [1.4, 1.16, .55, 0]); box('oil-filter', 'powPale', -.68, 1.13, -3.08, .10, .12, .11, cream); }
      if (installed.has('cooling')) { box('radiator-cap', 'powMetal', .30, 1.63, -3.91, .06, .045, .055, warm); box('cooling-return', 'powMetal', -.54, 1.40, -3.2, .025, .025, .35, blue); }
      if (installed.has('ignition')) for (let i = -1; i <= 1; i++) box('ignition-lead-' + i, 'powMetal', .56, 1.75, -2.8 + i * .30, .018, .018, .17, [1.57, 1.00, .40, 0]);
      if (installed.has('transmission')) for (const side of [-1, 1]) box('remembered-chassis-' + side, 'powMetal', side * .86, .93, -2.55, .04, .045, 1.16, warm);
      // A cabin appears only after the actual driveline/wheel stage. It occupies
      // the existing engine-stand footprint and leaves every walking aisle clear.
      if (installed.has('wheels')) {
        box('remembered-seat', 'powWood', 0, 1.48, -1.65, .65, .10, .27, wood);
        box('remembered-seat-back', 'powWood', 0, 1.79, -1.37, .65, .24, .045, wood);
        for (const side of [-1, 1]) { box('cabin-pillar-' + side, 'powMetal', side * .79, 1.85, -1.61, .035, .44, .035, warm); box('cabin-side-' + side, 'powMetal', side * .82, 1.44, -1.69, .025, .15, .45, green); }
        box('remembered-cabin-roof', 'powMetal', 0, 2.29, -1.69, .85, .045, .46, green);
        box('remembered-windscreen', 'powPale', 0, 2.02, -2.11, .70, .22, .018, [.7, .92, 1.08, .2]);
        box('steering-column', 'powMetal', .40, 1.74, -1.91, .026, .16, .026, warm);
        box('steering-wheel', 'powMetal', .40, 1.90, -1.91, .16, .025, .035, [1.0, .78, .54, 0]);
      }
    } else if (p.kind === 'architecture') {
      const c = p.choices;
      if (c.framing) {
        for (const x of [-3.78, 3.78]) for (const z of [-5.78, -4.22]) box('curtain-' + x + '-' + z, 'powWood', x, 1.60, z, .026, .50, .18, [1.72, 1.02, .62, 0]);
        // An original, abstract remembered landscape, not an invented photograph.
        box('landscape-frame', 'powWood', -3.75, 1.7, -7.1, .03, .36, .56, wood);
        box('landscape-sky', 'powPale', -3.713, 1.77, -7.1, .012, .23, .48, blue);
        box('landscape-hill', 'powMud', -3.70, 1.50, -7.1, .010, .09, .48, green);
        box('landscape-sun', 'powPale', -3.687, 1.90, -7.32, .011, .065, .065, [1.75, 1.39, .60, .7]);
      }
      if (c.plumbing) {
        for (const z of [-3.35, -2.65]) box('sink-rim-' + z, 'powPale', -3, 1.015, z, .44, .025, .035, cream);
        box('sink-basin', 'powMetal', -3, 1.012, -3, .30, .018, .25, blue);
      }
      if (c.electrical) { box('remembered-clock', 'powWood', 3.69, 1.9, -6.2, .035, .26, .26, wood); box('clock-face', 'powPale', 3.645, 1.9, -6.2, .012, .21, .21, cream); box('clock-hand', 'powMetal', 3.625, 1.96, -6.2, .012, .09, .018, [.7, .65, .57, 0]); }
      if (c.furniture) {
        box('bed-pillow', 'powPale', 2.4, .69, -8.16, .42, .08, .25, cream);
        box('bed-blanket', 'powWood', 2.4, .67, -7.1, .65, .025, .66, [.75, 1.02, 1.19, 0]);
        box('table-book-cover', 'powWood', -.22, .797, -5.38, .23, .025, .16, [1.47, .78, .53, 0]);
        box('table-book-pages', 'powPale', -.22, .829, -5.38, .21, .008, .15, cream);
        box('table-cup', 'powPale', .37, .87, -5.38, .065, .095, .065, cream);
        box('cup-handle', 'powPale', .45, .87, -5.38, .04, .055, .025, cream);
      }
    } else {
      for (let i = 0; i < p.grid.length && count < LIMIT; i++) {
        const type = p.grid[i], x = (i % 5 - 2) * 4, z = (Math.floor(i / 5) - 2) * 4;
        if (type === 'housing' || type === 'school') {
          box('city-door-' + i, 'powWood', x, .37, z + .848, .15, .37, .014, wood);
          box('city-window-box-' + i, 'powWood', x - .45, .75, z + .858, .20, .035, .025, wood);
          box('city-flowers-' + i, 'powMud', x - .45, .80, z + .858, .17, .030, .025, [1.51, .99, .82, 0]);
        } else if (type === 'water') {
          box('water-tank-band-' + i, 'powPale', x, 1.37, z + .71, .67, .05, .012, cream);
          box('water-valve-' + i, 'powMetal', x, .38, z + .74, .14, .025, .025, warm);
        } else if (type === 'utility') {
          box('utility-transformer-' + i, 'powMetal', x, 2.02, z, .30, .12, .30, [1.13, 1.10, .87, 0]);
          box('utility-copper-' + i, 'powMetal', x - .29, 2.14, z, .024, .02, .30, [1.51, .98, .52, 0]);
        } else if (type === 'park') {
          box('park-seat-back-' + i, 'powWood', x + .5, .42, z + .43, .59, .13, .04, wood);
          for (const side of [-1, 1]) box('park-bench-arm-' + i + '-' + side, 'powWood', x + .5 + side * .55, .35, z + .58, .035, .05, .16, wood);
        } else if (type === 'stop') { box('transport-timetable-' + i, 'powPale', x, 1.37, z + .936, .15, .12, .007, cream); box('transport-route-line-' + i, 'powWood', x, 1.38, z + .949, .013, .085, .007, blue); }
      }
    }
    cache.set(game, { pow: game.pow, scene: game.campGeo, key, count });
    return { active: true, kind: p.kind, count };
  }
  function renderState(game) {
    if (!active(game)) return null;
    const b = game.pow.base, kind = game.pow._mindscape.kind;
    // A renderer-only sunny memory. The game's actual night, calendar, weather,
    // guard clock and physical atmosphere object remain completely untouched.
    const atmosphere = Object.assign({}, game.atm || {}, { night: false, sunDir: [-.48, .82, .31], sunCol: [1.0, .89, .69], amb: [.28, .29, .27], gnd: [.20, .17, .12], horizon: [.64, .71, .76], zenith: [.15, .32, .55], stars: 0, moon: 0, exposure: 1.24, fogDens: .000014, overcast: .08 });
    return { imagined: true, kind, ambient: [.40, .37, .30], fogColor: [.63, .71, .74], fogDensity: .00035, baseY: b[1], atmosphere, lights: [{ position: [b[0] - 2, b[1] + 2.8, b[2] - 3], rgb: [1, .86, .63], intensity: .48, radius: 15 }], water: { enabled: false }, label: 'Authored imagined surroundings · your body remains in the cell' };
  }
  P.MemoryDetail = { decorate, cleanup, renderState, active, limits: { decorations: LIMIT }, provenance: 'Original authored visualization of the existing memory projects; not historical architecture, photographs, or a claimed recollection by a specific POW.' };
})(typeof window !== 'undefined' ? window : globalThis);
