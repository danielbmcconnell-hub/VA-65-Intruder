/* Imagined, explorable projects. Uses the existing POW collision, controls and
   custom renderer. These are fictional visualizations of remembered projects,
   never physical objects in the historical prison. */
(function (root) {
  'use strict';
  const P = root.POW = root.POW || {};
  const copy = value => JSON.parse(JSON.stringify(value));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const KINDS = ['car', 'architecture', 'city'];
  const TOOLS = ['empty', 'road', 'housing', 'water', 'utility', 'school', 'park', 'stop'];
  const PHYSICAL = ['base', 'solids', 'objects', 'surfaces', 'motion', 'lights', 'nav', 'objective', 'customMovement', 'movementScale', 'traversal', 'actors', 'p', 'noise', 'input', 'focus', 'holding', 'interactLatched', 'cellDoor', 'touchInteract', 'touchClimb'];
  const GAME_FIELDS = ['campGeo', 'campY', 'campOrigin', 'cellPos', '_collisionCache'];
  let ui, currentGame;
  function active(game) { return !!(game && game.pow && game.pow._mindscape); }
  function progress(game) {
    const c = P.Captivity.state(game);
    c.mindscape = c.mindscape || { version: 1, completedCar: null, completedHouse: null, completedCity: null, completions: { car: 0, architecture: 0, city: 0 } };
    c.mindscape.completions = c.mindscape.completions || { car: 0, architecture: 0, city: 0 };
    return c.mindscape;
  }
  function visual(game, id, mesh, x, y, z, hx, hy, hz, tint, yaw) {
    return P.addBox(game, 'mind:' + id, mesh, x, y, z, hx, hy, hz, { tint: tint || [1, 1, 1, 0], yaw: yaw || 0 });
  }
  function solid(game, id, mesh, x, y, z, hx, hy, hz, tint) {
    return P.addBox(game, 'mind:' + id, mesh, x, y, z, hx, hy, hz, { solid: true, tint: tint || [1, 1, 1, 0] });
  }
  function object(game, id, name, x, y, z, action, selection) {
    return P.object(game, id, name, x, y, z, action, { radius: 1.7, hold: .2, mindscape: true, selection });
  }
  function marker(game, id, x, z) {
    visual(game, 'marker-' + id, 'powPale', x, .84, z, .065, .09, .065, [.72, .92, 1, 2]);
  }
  function room(game, hx, hz, roof) {
    visual(game, 'floor', 'powPale', 0, -.08, 0, hx, .08, hz, [1.14, 1.2, 1.27, 0]);
    solid(game, 'west', 'powStone', -hx, 1.7, 0, .12, 1.7, hz, [.7, .84, .98, 0]);
    solid(game, 'east', 'powStone', hx, 1.7, 0, .12, 1.7, hz, [.7, .84, .98, 0]);
    solid(game, 'north', 'powStone', 0, 1.7, -hz, hx, 1.7, .12, [.7, .84, .98, 0]);
    solid(game, 'south', 'powStone', 0, 1.7, hz, hx, 1.7, .12, [.7, .84, .98, 0]);
    if (roof) visual(game, 'ceiling', 'powPale', 0, 3.5, 0, hx, .08, hz, [.65, .8, .94, 0]);
    const b = game.pow.base;
    game.pow.lights = [[-5, 2.7, 1], [5, 2.7, -5], [0, 2.8, 6]].map(q => ({ p: [b[0] + q[0], b[1] + q[1], b[2] + q[2]], power: .70, radius: 12, color: [.79, .9, 1] }));
    game.pow.nav = { minX: b[0] - hx, maxX: b[0] + hx, minZ: b[2] - hz, maxZ: b[2] + hz, cell: 1 };
  }
  function ring(game, id, x, y, z, radius, width, color, plane) {
    for (let n = 0; n < 8; n++) {
      const a = n * Math.PI / 4;
      if (plane === 'xz') visual(game, id + n, 'powMetal', x + Math.sin(a) * radius, y, z + Math.cos(a) * radius, .075, width, .075, color);
      else visual(game, id + n, 'powMetal', x, y + Math.sin(a) * radius, z + Math.cos(a) * radius, width, .09, .09, color);
    }
  }
  function partGeometry(game, id, x, y, z, scale, installed) {
    const v = (suffix, mesh, dx, dy, dz, hx, hy, hz, color) => visual(game, id + ':' + suffix, mesh, x + dx * scale, y + dy * scale, z + dz * scale, hx * scale, hy * scale, hz * scale, color);
    const steel = [.95, 1.12, 1.28, 0], brass = [1.48, 1.18, .65, 0], dark = [.35, .45, .54, 0];
    if (id.includes('block')) {
      v('crankcase', 'powMetal', 0, 0, 0, .50, .13, .8, steel);
      for (const dx of [-.4, .4]) v('side-' + dx, 'powMetal', dx, .25, 0, .08, .22, .8, steel);
      for (const dz of [-.57, -.19, .19, .57]) for (const dx of [-.22, .22]) ring(game, id + ':bore-' + dx + '-' + dz, x + dx * scale, y + .49 * scale, z + dz * scale, .15 * scale, .025 * scale, dark, 'xz');
    } else if (id.includes('bearings')) {
      for (let i = -1; i <= 1; i++) ring(game, id + ':bearing-' + i, x, y + .1 * scale, z + i * .4 * scale, .15 * scale, .07 * scale, brass, 'xz');
    } else if (id.includes('crank')) {
      v('shaft', 'powMetal', 0, .12, 0, .045, .045, .78, steel);
      for (let i = -1; i <= 1; i++) { v('web-' + i, 'powMetal', 0, .12, i * .4, .24, .13, .04, steel); v('journal-' + i, 'powMetal', .20, .17, i * .4, .055, .055, .12, brass); }
    } else if (id.includes('pistons')) {
      for (let i = -1; i <= 1; i++) { v('rod-' + i, 'powMetal', 0, .10, i * .4, .045, .28, .04, steel); v('piston-' + i, 'powPale', 0, .43, i * .4, .15, .12, .15, steel); }
    } else if (id.includes('camshaft')) {
      v('shaft', 'powMetal', 0, .1, 0, .04, .04, .75, steel);
      for (let i = -2; i <= 2; i++) v('lobe-' + i, 'powMetal', .07 * (i % 2), .13, i * .27, .11, .09, .035, brass);
    } else if (id.includes('oiling')) {
      v('pump', 'powMetal', 0, .06, 0, .25, .15, .25, brass); v('pickup', 'powMetal', 0, -.11, .4, .055, .05, .28, steel);
      v('sump', 'powMetal', 0, -.18, .6, .21, .05, .17, steel);
    } else if (id.includes('cooling')) {
      v('radiator', 'powMetal', 0, .3, 0, .53, .37, .075, dark);
      for (let i = -4; i <= 4; i++) v('fin-' + i, 'powPale', i * .11, .3, -.085, .012, .32, .015, steel);
      v('hose', 'powMetal', .45, -.15, .35, .06, .06, .4, dark);
    } else if (id.includes('ignition')) {
      v('distributor', 'powMetal', 0, .18, 0, .17, .2, .17, brass);
      for (let i = -2; i <= 2; i++) { v('plug-' + i, 'powPale', i * .2, .18, .4, .03, .14, .035, steel); v('lead-' + i, 'powMetal', i * .1, .30, .22, .025, .025, .22, dark); }
    } else if (id.includes('transmission')) {
      v('bellhousing', 'powMetal', 0, .15, -.30, .36, .29, .19, steel); v('gearbox', 'powMetal', 0, .1, .24, .23, .22, .40, steel);
      v('output', 'powMetal', 0, .1, .77, .07, .07, .19, brass);
    } else if (id.includes('wheels')) {
      v('axle', 'powMetal', 0, .15, 0, .55, .04, .04, steel);
      ring(game, id + ':wheel-l', x - .55 * scale, y + .16 * scale, z, .32 * scale, .11 * scale, dark);
      ring(game, id + ':wheel-r', x + .55 * scale, y + .16 * scale, z, .32 * scale, .11 * scale, dark);
    }
    if (installed) v('fitted', 'powPale', .6, 0, 0, .035, .035, .035, [.54, .88, .68, 2]);
  }
  function assembledCar(game, installed) {
    const ids = new Set(installed);
    solid(game, 'engine-stand', 'powMetal', 0, .45, -2.5, 1.10, .45, 1.45, [.53, .7, .87, 0]);
    const positions = { block: [0, 1, -2.8], bearings: [0, 1.16, -2.8], crank: [0, 1.30, -2.8], pistons: [0, 1.54, -2.8], camshaft: [.65, 1.65, -2.8], oiling: [-.68, 1.05, -2.6], cooling: [0, 1.2, -4.05], ignition: [.60, 1.50, -2.35], transmission: [0, 1.04, -1.48], wheels: [0, .70, -.8] };
    for (const [id, q] of Object.entries(positions)) if (ids.has(id)) partGeometry(game, 'assembled-' + id, ...q, 1, true);
  }
  function choose(game, kind, id, index) {
    if (!active(game)) return false;
    const C = P.Captivity, c = C.state(game), m = progress(game);
    const before = copy(kind === 'car' || kind === 'cycle' ? c.car : kind === 'architecture' ? c.architecture : c.city);
    let accepted;
    if (kind === 'car') accepted = c.car.phase === 'assemble' ? C.carChoose(game, id) : c.car.phase === 'recall' ? C.carRecall(game, id) : false;
    else if (kind === 'cycle') accepted = C.carCycle(game, id);
    else if (kind === 'architecture') accepted = C.architectureChoose(game, id);
    else if (kind === 'city') accepted = C.cityPlace(game, index, c.city.tool);
    else if (kind === 'validate') accepted = C.cityValidate(game);
    const k = kind === 'cycle' ? 'car' : kind === 'validate' ? 'city' : kind;
    const after = k === 'car' ? c.car : k === 'architecture' ? c.architecture : c.city;
    if (accepted && after.round > before.round) {
      m.completions[k] = (m.completions[k] || 0) + 1;
      if (k === 'car') m.completedCar = { installed: before.installed.slice(), round: before.round };
      else if (k === 'architecture') m.completedHouse = { choices: Object.assign({}, before.choices, { furniture: id }), round: before.round };
      else m.completedCity = { grid: before.grid.slice(), round: before.round };
      if (P.save) P.save(game);
    }
    if (active(game)) { rebuild(game); game.pow.holding = null; game.pow.interactLatched = true; updateUI(game); }
    return !!accepted;
  }
  function buildCar(game) {
    const c = P.Captivity.state(game), a = c.car, m = progress(game);
    room(game, 8.5, 8.5, true);
    for (let i = 0; i < P.Captivity.data.car.length; i++) {
      const part = P.Captivity.data.car[i], x = [-5.5, -2.75, 0, 2.75, 5.5][i % 5], z = i < 5 ? -6 : 1.8;
      solid(game, 'bench-' + i, 'powWood', x, .38, z, .92, .38, .53, [.9, .97, 1.08, 0]);
      partGeometry(game, 'station-' + part.id, x, .93, z, .55, a.installed.includes(part.id));
      marker(game, 'car-' + i, x, z + .64);
      const o = object(game, 'mind-car-' + part.id, (a.phase === 'recall' ? 'Recall: ' : a.installed.includes(part.id) ? 'Inspect fitted ' : 'Fit ') + part.label, x, .95, z + .64, g => choose(g, 'car', part.id), { kind: 'car', id: part.id });
      o.enabled = () => c.car.phase !== 'cycle';
    }
    const installed = a.installed.length ? a.installed : m.completedCar ? m.completedCar.installed : [];
    assembledCar(game, installed);
    const phases = ['Intake', 'Compression', 'Power', 'Exhaust'];
    for (let i = 0; i < phases.length; i++) {
      const name = phases[i], x = [-5.5, -2.75, 2.75, 5.5][i], z = -2.2;
      visual(game, 'stroke-pedestal-' + i, 'powMetal', x, .45, z, .40, .45, .40, [.8, 1.03, 1.28, 0]);
      visual(game, 'stroke-piston-' + i, 'powPale', x, 1.20, z, .16, .12, .16, [1.2, 1.27, 1.4, 0]);
      visual(game, 'stroke-rod-' + i, 'powMetal', x, .85, z, .04, .25, .04);
      marker(game, 'stroke-' + i, x, z + .5);
      const o = object(game, 'mind-stroke-' + name.toLowerCase(), 'Trace the ' + name.toLowerCase() + ' stroke', x, 1.04, z + .5, g => choose(g, 'cycle', name), { kind: 'cycle', id: name });
      o.enabled = () => c.car.phase === 'cycle';
    }
    game.pow.objective = 'IMAGINED ENGINE · walk to a component and fit it with F / Interact';
  }
  function builtHouse(game, choices) {
    const tint = choices.foundation === 'stone' ? [.85, .86, .87, 0] : [1.12, 1.14, 1.18, 0];
    if (choices.foundation) {
      visual(game, 'house-footing', 'powStone', 0, .08, -5, 4.2, .08, 4.2, tint);
      const b = game.pow.base;
      game.pow.surfaces.push({ minX: b[0] - 4.2, maxX: b[0] + 4.2, minZ: b[2] - 9.2, maxZ: b[2] - .8, y: b[1] + .16 });
    }
    if (choices.framing) {
      const mesh = choices.framing === 'timber' ? 'powWood' : choices.framing === 'masonry' ? 'powBrick' : 'powMetal';
      for (const x of [-4, 4]) solid(game, 'house-side-' + x, mesh, x, 1.4, -5, .12, 1.4, 4, [1.12, 1.2, 1.32, 0]);
      solid(game, 'house-back', mesh, 0, 1.4, -9, 4, 1.4, .12, [1.12, 1.2, 1.32, 0]);
      for (const x of [-2.65, 2.65]) solid(game, 'house-front-' + x, mesh, x, 1.4, -1, 1.35, 1.4, .12, [1.12, 1.2, 1.32, 0]);
      visual(game, 'door-header', mesh, 0, 2.5, -1, 1.3, .3, .12);
      for (const x of [-3.75, 3.75]) for (const z of [-8.75, -1.25]) visual(game, 'house-post-' + x + z, mesh, x, 1.4, z, .09, 1.4, .09, [1.7, 1.65, 1.52, 0]);
      // Window panes stand out as memories of a house, rather than prison bars.
      for (const x of [-3.84, 3.84]) visual(game, 'window-' + x, 'powPale', x, 1.55, -5, .025, .46, .90, [.60, .86, 1.08, 1]);
    }
    if (choices.roof) {
      // Five stepped strips per slope are cheap geometry with a visible ridge.
      for (let i = 0; i < 5; i++) for (const sign of [-1, 1]) visual(game, 'roof-' + i + sign, 'powWood', sign * (i + .5) * .86, 3.65 - i * .16, -5, .45, .10, 4.3, [.78, .87, .96, 0]);
      for (const x of [-4.22, 4.22]) { visual(game, 'gutter-' + x, 'powMetal', x, 2.91, -5, .055, .055, 4.1, [.7, 1.06, 1.25, 0]); visual(game, 'drain-' + x, 'powMetal', x, 1.5, -8.5, .055, 1.4, .055); }
    }
    if (choices.plumbing) {
      for (const [x, color] of [[-3.65, [.42, .81, 1.23, 1]], [-3.38, [.73, .51, .27, 1]]]) {
        visual(game, 'service-pipe-' + x, 'powMetal', x, .30, -5.6, .045, .045, 2.6, color);
        visual(game, 'service-rise-' + x, 'powMetal', x, .72, -3.0, .045, .45, .045, color);
      }
      solid(game, 'sink', 'powPale', -3.0, .49, -3, .48, .49, .48, [1.18, 1.22, 1.2, 0]);
      visual(game, 'tap', 'powMetal', -3, 1.08, -3, .035, .12, .06, [.67, .92, 1.14, 0]);
    }
    if (choices.electrical) {
      visual(game, 'conduit', 'powMetal', 3.7, 2.1, -5, .03, .03, 3.2, [1.26, 1.06, .5, 1]);
      visual(game, 'fusebox', 'powMetal', 3.67, 1.6, -2.1, .08, .23, .17, [1.14, 1.17, 1.2, 0]);
      visual(game, 'ceiling-light', 'powPale', 0, 2.68, -5, .18, .05, .18, [1, .95, .74, 3]);
    }
    if (choices.furniture) {
      solid(game, 'house-bed', 'powWood', 2.4, .28, -7.4, .72, .28, 1.15, [1.05, 1.12, 1.21, 0]);
      visual(game, 'house-mattress', 'powPale', 2.4, .58, -7.4, .70, .07, 1.13, [.80, .92, 1.15, 0]);
      solid(game, 'house-table', 'powWood', 0, .38, -5.4, .78, .38, .55, [1.3, 1.35, 1.38, 0]);
      visual(game, 'house-hatch', 'powMetal', -2.9, .09, -6.7, .48, .02, .43, [1.1, 1.3, 1.44, 0]);
    }
  }
  function buildHouse(game) {
    room(game, 10, 11, false);
    const c = P.Captivity.state(game), a = c.architecture, m = progress(game);
    builtHouse(game, Object.keys(a.choices).length ? a.choices : m.completedHouse ? m.completedHouse.choices : {});
    const section = P.Captivity.data.architecture[a.stage];
    if (section) for (let i = 0; i < section.choices.length; i++) {
      const option = section.choices[i], x = [-6, 0, 6][i], z = 5;
      solid(game, 'house-choice-' + i, 'powWood', x, .32, z, .78, .32, .55, [1.1, 1.17, 1.24, 0]);
      const color = i === 0 ? [1.05, 1.28, 1.39, 0] : i === 1 ? [.98, 1.16, .86, 0] : [1.27, 1.0, .75, 0];
      visual(game, 'house-sample-' + i, section.id === 'framing' ? 'powWood' : section.id === 'foundation' ? 'powStone' : 'powMetal', x, .85, z, .38, .20, .30, color);
      marker(game, 'house-' + i, x, z + .64);
      object(game, 'mind-house-' + option.id, section.title + ': ' + option.label + ' · ' + option.cost + ' units', x, 1, z + .64, g => choose(g, 'architecture', option.id), { kind: 'architecture', id: option.id, stage: section.id });
    }
    game.pow.objective = 'IMAGINED HOUSE · examine materials; walk inside the structure you remember';
  }
  function cityGeometry(game, grid) {
    for (let i = 0; i < 25; i++) {
      const type = grid[i], x = (i % 5 - 2) * 4, z = (Math.floor(i / 5) - 2) * 4;
      visual(game, 'plot-' + i, ['road', 'stop'].includes(type) ? 'powDark' : type === 'park' ? 'powMud' : 'powPale', x, .008, z, 1.94, .008, 1.94, type === 'park' ? [.83, 1.27, .79, 0] : [1.1, 1.14, 1.22, 0]);
      if (['road', 'stop'].includes(type)) { visual(game, 'road-mark-' + i, 'powPale', x, .022, z, .75, .014, .04, [1.1, 1.14, 1.19, 0]); visual(game, 'water-main-' + i, 'powMetal', x, .03, z - 1.55, 1.93, .02, .025, [.4, .85, 1.2, 1]); }
      if (['housing', 'school', 'utility'].includes(type)) {
        const height = type === 'school' ? 1.15 : type === 'utility' ? 1.9 : 1.55;
        solid(game, 'building-' + i, type === 'utility' ? 'powMetal' : 'powBrick', x, height / 2, z, .83, height / 2, .83, type === 'housing' ? [1.15, .98, .83, 0] : type === 'school' ? [1.15, 1.24, 1.32, 0] : [.8, 1.04, 1.22, 0]);
        visual(game, 'building-roof-' + i, 'powWood', x, height + .08, z, .91, .10, .91, [1.04, 1.13, 1.26, 0]);
        for (const dx of [-.45, .45]) visual(game, 'window-' + i + dx, 'powPale', x + dx, height * .67, z + .85, .15, .18, .022, [.6, .86, 1.1, 1]);
        if (type === 'utility') visual(game, 'chimney-' + i, 'powMetal', x + .5, 2.4, z - .5, .13, .55, .13);
      }
      if (type === 'water') { solid(game, 'water-tank-' + i, 'powMetal', x, .85, z, .7, .85, .7, [.55, .95, 1.28, 0]); visual(game, 'water-line-' + i, 'powMetal', x, .08, z + 1.15, .055, .05, .43, [.4, .85, 1.2, 1]); }
      if (type === 'park') { visual(game, 'park-trunk-' + i, 'powWood', x - .5, .5, z, .09, .5, .09); visual(game, 'park-canopy-' + i, 'powMud', x - .5, 1.15, z, .55, .35, .55, [.45, 1.3, .75, 0]); visual(game, 'park-bench-' + i, 'powWood', x + .5, .25, z + .6, .6, .07, .17); }
      if (type === 'stop') { visual(game, 'stop-post-' + i, 'powMetal', x, .75, z + .9, .045, .75, .045); visual(game, 'stop-sign-' + i, 'powPale', x, 1.38, z + .9, .22, .18, .025, [.98, 1.15, 1.34, 1]); }
    }
  }
  function buildCity(game) {
    room(game, 12, 16, false);
    const c = P.Captivity.state(game), a = c.city, m = progress(game);
    const grid = m.completedCity && a.grid.every((q, i) => q === (Math.floor(i / 5) === 2 ? 'road' : 'empty')) ? m.completedCity.grid : a.grid;
    cityGeometry(game, grid);
    for (let i = 0; i < 25; i++) {
      const x = (i % 5 - 2) * 4, z = (Math.floor(i / 5) - 2) * 4, label = String.fromCharCode(65 + i % 5) + (Math.floor(i / 5) + 1);
      marker(game, 'city-' + i, x, z + 1.6);
      object(game, 'mind-city-' + i, label + ' · place ' + a.tool + ' (currently ' + a.grid[i] + ')', x, .9, z + 1.6, g => choose(g, 'city', null, i), { kind: 'city', index: i, plot: label });
    }
    visual(game, 'survey-table', 'powWood', 0, .45, 12, 1.4, .45, .5);
    marker(game, 'survey', 0, 12.6);
    object(game, 'mind-city-survey', 'Survey roads, water, housing and transport connections', 0, .9, 12.6, g => choose(g, 'validate'), { kind: 'validate' });
    game.pow.objective = 'IMAGINED CITY · select a land use, walk to a plot, then Interact';
  }
  function signature(game) {
    const c = P.Captivity.state(game), m = progress(game), kind = game.pow._mindscape.kind;
    return JSON.stringify(kind === 'car' ? [c.car, m.completedCar] : kind === 'architecture' ? [c.architecture, m.completedHouse] : [c.city, m.completedCity]);
  }
  function rebuild(game) {
    if (!active(game)) return;
    const s = game.pow, m = s._mindscape;
    s.solids = []; s.objects = []; s.surfaces = []; game.campGeo = []; s.focus = null;
    if (m.kind === 'car') buildCar(game); else if (m.kind === 'architecture') buildHouse(game); else buildCity(game);
    m.signature = signature(game);
    // A newly imagined wall may occupy an older observation position. Move the
    // observer only when needed, to a known clear aisle rather than into a wall.
    if (P.blocked(game, game.evade.p[0], game.evade.p[2], .25, game.evade.p[1])) game.evade.p.splice(0, 3, s.base[0], s.base[1], s.base[2] + m.spawnZ);
  }
  function clearInput(game) {
    if (game.app && game.app.keys) for (const k of Object.keys(game.app.keys)) game.app.keys[k] = 0;
    if (game.app && game.app.gctl) for (const k of ['pitch', 'roll', 'run', 'crouch']) game.app.gctl[k] = 0;
    game.pow.touchInteract = false; game.pow.touchClimb = false; game.pow.holding = null; game.pow.interactLatched = false;
  }
  function open(game, kind) {
    if (!game || !game.pow || !game.evade || game.evade.alive === false || !P.Captivity || !KINDS.includes(kind) || !['cell', 'solitary', 'captivity'].includes(game.pow.stage) || game.pow.complete) return false;
    const c = P.Captivity.state(game);
    if (c.sleeping || c.routine && c.routine.active) { P.notify(game, 'Finish resting or stop the accelerated routine before entering an imagined project.'); return false; }
    if (active(game)) close(game, true);
    progress(game); P.Captivity.close(game);
    // A hidden captivity dialog still owns its focused button unless explicitly
    // blurred. Leaving it focused would make the shared input guard stop walking.
    if (root.document && root.document.activeElement && root.document.activeElement.blur) root.document.activeElement.blur();
    const s = game.pow, physical = {}, fields = {};
    for (const key of PHYSICAL) physical[key] = { present: Object.hasOwn(s, key), value: s[key] };
    for (const key of GAME_FIELDS) fields[key] = { present: Object.hasOwn(game, key), value: game[key] };
    const e = game.evade, aiState = P.AI && P.AI.snapshot ? P.AI.snapshot(game) : null, ai = aiState ? copy(aiState) : null;
    const m = s._mindscape = { kind, physical, fields, evade: e, ai, physicalStage: s.stage, physicalBase: s.base.slice(), physicalP: e.p.slice(), physicalHdg: e.hdg || 0, physicalLook: e.look || 0, spawnZ: kind === 'car' ? 5.8 : kind === 'architecture' ? 8 : 14, time: 0 };
    // A separate floor above the world prevents underlying terrain from entering
    // the remembered room. Returning never relocates the physical prisoner.
    s.base = [m.physicalBase[0], m.physicalBase[1] + 30, m.physicalBase[2]];
    game.evade = Object.assign({}, e, { p: [s.base[0], s.base[1], s.base[2] + m.spawnZ], hdg: 0, look: 0, pitchCmd: 0, searchers: [], locals: [], crouch: false, moving: false, running: false, weaponMode: 'fists', hasPistol: false, hasKnife: false, rounds: 0 });
    s.p = game.evade.p; s.actors = game.evade.searchers; s.motion = { speed: 2.4, radius: .25 }; s.movementScale = 1; s.customMovement = false; s.traversal = null; s.noise = 0; s.input = {}; s.focus = null;
    game.campY = s.base[1]; game.campOrigin = [s.base[0], s.base[2]]; game.cellPos = s.base.slice(); game._collisionCache = null;
    clearInput(game); P.ensureMeshes(game); rebuild(game); currentGame = game;
    P.notify(game, 'IMAGINED SPACE: your body remains in the cell. Walk, look, and assemble remembered details. Return to the cell at any time.');
    updateUI(game);
    if (ui) ui.querySelector('[data-mind-return]').focus({ preventScroll: true });
    if (P.save) P.save(game); return true;
  }
  function close(game, skipSave) {
    if (!active(game)) return false;
    const s = game.pow, m = s._mindscape;
    clearInput(game);
    for (const [key, entry] of Object.entries(m.physical)) { if (entry.present) s[key] = entry.value; else delete s[key]; }
    for (const [key, entry] of Object.entries(m.fields)) { if (entry.present) game[key] = entry.value; else delete game[key]; }
    game.evade = m.evade; s.p = game.evade.p; s.actors = game.evade.searchers;
    delete s._mindscape; clearInput(game);
    if (ui) ui.hidden = true;
    if (P.updateUI) P.updateUI(game);
    if (!skipSave && P.save) P.save(game);
    if (P.notify) P.notify(game, 'Back in the cell. The remembered project persists; these imagined surroundings were never a physical escape.');
    return true;
  }
  function physicalSnapshot(game, snapshot) {
    if (!active(game) || !snapshot) return snapshot;
    const m = game.pow._mindscape;
    snapshot.stage = m.physicalStage; snapshot.base = m.physicalBase.slice(); snapshot.p = m.physicalP.slice(); snapshot.hdg = m.physicalHdg; snapshot.look = m.physicalLook;
    if (m.ai) snapshot.ai = copy(m.ai); else delete snapshot.ai;
    delete snapshot.mindscape; return snapshot;
  }
  function nearest(game, id) {
    const s = game.pow, e = game.evade, eye = [e.p[0], e.p[1] + 1.65, e.p[2]];
    let chosen = null, best = Infinity;
    for (const o of s.objects) {
      if (!o.mindscape || o.active === false || o.enabled && !o.enabled(game, o) || id && id !== 'interact' && id !== true && o.id !== id) continue;
      const dx = o.p[0] - e.p[0], dz = o.p[2] - e.p[2], d = Math.hypot(dx, dz);
      if (d > (o.radius || 1.7) || Math.abs(o.p[1] - eye[1]) > 2.2) continue;
      const angle = Math.atan2(dx, -dz) - e.hdg;
      if (d > .50 && Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) > 1.10) continue;
      const f = d > .15 ? Math.max(0, (d - .14) / d) : 0;
      if (!P.los(game, eye, eye.map((v, k) => v + (o.p[k] - v) * f))) continue;
      if (d < best) { best = d; chosen = o; }
    }
    return chosen;
  }
  function interact(game, id) {
    if (!active(game) || game.paused) return false;
    const obj = nearest(game, id);
    if (!obj) return false;
    return !!obj.action(game, obj);
  }
  function tick(game, dt) {
    if (!active(game) || game.paused) return false;
    const s = game.pow, m = s._mindscape, e = game.evade, input = s.input || {};
    dt = clamp(dt || 0, 0, .1); m.time += dt;
    const before = [e.p[0], e.p[2]], f = clamp(input.forward || 0, -1, 1), side = clamp(input.strafe || 0, -1, 1), norm = Math.max(1, Math.hypot(f, side));
    const speed = 2.4 * (input.run ? 1.35 : input.crouch ? .60 : 1);
    P.move(game, e, (Math.sin(e.hdg) * f + Math.cos(e.hdg) * side) / norm * speed * dt, (-Math.cos(e.hdg) * f + Math.sin(e.hdg) * side) / norm * speed * dt, .25);
    e.moving = Math.hypot(e.p[0] - before[0], e.p[2] - before[1]) > .001; e.running = e.moving && !!input.run;
    // Only real project decisions advance the captivity clock/condition. Walking
    // a visualization is observation, not physical exercise or prison noise.
    s.focus = nearest(game);
    if (input.interact && s.focus) {
      if (!s.interactLatched) {
        if (!s.holding || s.holding.id !== s.focus.id) s.holding = { id: s.focus.id, t: 0 };
        s.holding.t += dt;
        if (s.holding.t >= .2) { interact(game, s.focus.id); s.holding = null; s.interactLatched = true; }
      }
    } else { s.holding = null; s.interactLatched = false; }
    if (!active(game)) return true;
    if (m.signature !== signature(game)) rebuild(game);
    // Four-stroke stations visibly move, without adding a second render loop.
    if (m.kind === 'car') for (const geo of game.campGeo) if (/mind:stroke-piston-/.test(geo.id)) geo.p[1] = s.base[1] + 1.20 + Math.sin(m.time * 2 + Number(geo.id.slice(-1)) * Math.PI / 2) * .14;
    m.uiTick = (m.uiTick || 0) + dt;
    if (m.uiTick >= .1) { m.uiTick = 0; updateUI(game); }
    return true;
  }
  function ensureUI() {
    if (!root.document || ui) return ui;
    const d = root.document, style = d.createElement('style');
    style.textContent = '#powMindscapeHUD{position:fixed;z-index:65;left:14px;top:106px;max-width:430px;box-sizing:border-box;padding:10px 12px;background:rgba(9,26,40,.94);border:1px solid #8eafc5;color:#e7f1f8;font:13px/1.4 system-ui;pointer-events:none}#powMindscapeHUD[hidden],#powMindscapeHUD [hidden]{display:none!important}#powMindscapeHUD h3{margin:0 0 6px;font-size:15px}#powMindscapeHUD p{margin:5px 0}#powMindscapeHUD button,#powMindscapeHUD select{pointer-events:auto;min-height:36px;border:1px solid #94aec0;background:#213d52;color:#fff;padding:6px 10px;border-radius:4px}#powMindscapeHUD label{display:block;margin-top:5px}#powMindscapeHUD summary{pointer-events:auto;cursor:pointer;padding:7px 0;color:#b8d1e3}#powMindscapeHUD .mind-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#powMindscapeHUD .mind-row h3{flex:1;margin:0}#powMindscapeHUD select{margin-left:8px}#powMindscapeHUD [data-mind-feedback]{color:#b8d1e3;font-size:12px}@media(max-width:950px){#powMindscapeHUD{top:87px;left:8px;max-width:min(360px,calc(100vw - 224px));max-height:calc(100vh - 160px);overflow:auto;font-size:11px;padding:7px 9px}#powMindscapeHUD h3{font-size:12px}#powMindscapeHUD button,#powMindscapeHUD select{min-height:40px;font-size:11px}#powMindscapeHUD [data-mind-feedback]{font-size:10px}}';
    d.head.appendChild(style); ui = d.createElement('aside'); ui.id = 'powMindscapeHUD'; ui.hidden = true; ui.setAttribute('aria-label', 'Imagined project');
    const header = d.createElement('div'); header.className = 'mind-row'; ui.appendChild(header);
    const title = d.createElement('h3'); title.dataset.mindTitle = ''; header.appendChild(title);
    const back = d.createElement('button'); back.dataset.mindReturn = ''; back.textContent = 'Return to the cell'; back.addEventListener('click', () => close(currentGame)); header.appendChild(back);
    const instructions = d.createElement('details'); instructions.dataset.mindInstructions = '';
    const summary = d.createElement('summary'); summary.textContent = 'Project instructions · W / stick · F / Interact'; instructions.appendChild(summary); ui.appendChild(instructions);
    const detail = d.createElement('p'); detail.dataset.mindDetail = ''; instructions.appendChild(detail);
    const controls = d.createElement('p'); controls.textContent = 'W / stick: walk · mouse / right drag: look · F / Interact: use nearby object'; instructions.appendChild(controls);
    const label = d.createElement('label'); label.dataset.mindToolLabel = ''; label.textContent = 'Land use'; const select = d.createElement('select'); select.dataset.mindTool = ''; select.setAttribute('aria-label', 'Imagined city land use');
    for (const kind of TOOLS) { const option = d.createElement('option'); option.value = kind; option.textContent = kind === 'empty' ? 'Erase' : kind; select.appendChild(option); }
    select.addEventListener('change', () => { if (!active(currentGame)) return; const c = P.Captivity.state(currentGame); c.city.tool = select.value; clearInput(currentGame); rebuild(currentGame); updateUI(currentGame); if (P.save) P.save(currentGame); select.blur(); }); label.appendChild(select); ui.appendChild(label);
    const feedback = d.createElement('p'); feedback.dataset.mindFeedback = ''; instructions.appendChild(feedback); d.body.appendChild(ui); return ui;
  }
  function updateUI(game) {
    if (!active(game)) return;
    if (P.updateUI) P.updateUI(game);
    const panel = ensureUI(); if (!panel) return;
    const s = game.pow, kind = s._mindscape.kind, c = P.Captivity.state(game), a = kind === 'car' ? c.car : kind === 'architecture' ? c.architecture : c.city;
    panel.hidden = false; panel.querySelector('[data-mind-title]').textContent = 'IMAGINED ' + (kind === 'car' ? 'ENGINE WORKSHOP' : kind === 'architecture' ? 'HOUSE' : 'CITY') + ' · challenge ' + a.round;
    let text;
    if (kind === 'car') text = a.phase === 'assemble' ? a.installed.length + '/' + P.Captivity.data.car.length + ' components fitted. Dependencies matter; inspect each part before assembly.' : a.phase === 'cycle' ? 'Trace Intake → Compression → Power → Exhaust at the four moving piston stations. ' + a.recall.length + '/4 traced.' : 'Recall these jobs in order: ' + (a.targets || []).map(id => P.Captivity.data.car.find(q => q.id === id).why).join(' → ') + ' · ' + a.recall.length + '/' + (a.targets || []).length;
    else if (kind === 'architecture') text = 'Choose ' + ((P.Captivity.data.architecture[a.stage] || {}).title || 'materials') + ' at the sample stands. ' + a.site + ' ground; budget ' + a.budget + ', spent ' + a.spent + '. Walk through the doorway to inspect structure and services.';
    else text = 'Build a connected five-by-five neighbourhood. Two homes (three in later/hard rounds), water, utility, school, park and stop. Homes need adjacent roads; all streets must connect. Walk to the survey table after placing the plans.';
    panel.querySelector('[data-mind-detail]').textContent = text;
    panel.querySelector('[data-mind-tool-label]').hidden = kind !== 'city'; panel.querySelector('[data-mind-tool]').value = c.city.tool;
    panel.querySelector('[data-mind-feedback]').textContent = c.feedback || 'Your body remains in the cell. These surroundings are imagined.';
    if (P.ui && P.ui.stage) P.ui.stage.textContent = 'IMAGINED ' + (kind === 'architecture' ? 'HOUSE' : kind.toUpperCase()) + ' · BODY REMAINS IN THE CELL';
    if (P.ui && P.ui.alert) P.ui.alert.textContent = 'MENTAL RECONSTRUCTION · RETURN AT ANY TIME';
  }
  P.Mindscape = { open, close, active, tick, interact, physicalSnapshot, rebuild, updateUI, progress, nearest, data: { kinds: KINDS.slice(), tools: TOOLS.slice() } };
})(typeof window !== 'undefined' ? window : globalThis);
