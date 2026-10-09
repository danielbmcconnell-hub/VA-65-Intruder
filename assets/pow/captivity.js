/* Playable, fictional captivity chapter. Historical notes are explicitly separated
   from the simulation; coping choices are never a moral score. */
(function (root) {
  'use strict';
  const P = root.POW = root.POW || {};
  const CELL = { width: 0.9144, length: 2.7432, height: 2.4 };
  const MATRIX = ['ABCDE', 'FGHIJ', 'LMNOP', 'QRSTU', 'VWXYZ'];
  const CAR = [
    { id: 'block', label: 'Engine block', deps: [], why: 'The bored block supports the cylinders and main bearings.' },
    { id: 'bearings', label: 'Main bearings', deps: ['block'], why: 'Seat the bearing shells before laying in the crankshaft.' },
    { id: 'crank', label: 'Crankshaft', deps: ['bearings'], why: 'The crank converts piston motion to rotation.' },
    { id: 'pistons', label: 'Pistons and connecting rods', deps: ['crank'], why: 'The connecting rods attach each piston to the crank.' },
    { id: 'camshaft', label: 'Camshaft and timing drive', deps: ['pistons'], why: 'Set valve timing against the assembled rotating mechanism.' },
    { id: 'oiling', label: 'Oil pump and galleries', deps: ['crank', 'camshaft'], why: 'Prime the bearings and timing gear before any test rotation.' },
    { id: 'cooling', label: 'Water pump and radiator', deps: ['block', 'oiling'], why: 'Complete the cooling circuit before a running test.' },
    { id: 'ignition', label: 'Distributor, plugs and leads', deps: ['camshaft', 'cooling'], why: 'Synchronize ignition with the timed valves and cooling system.' },
    { id: 'transmission', label: 'Clutch and transmission', deps: ['crank', 'oiling'], why: 'Connect a lubricated engine to the driveline.' },
    { id: 'wheels', label: 'Axles, brakes and wheels', deps: ['transmission'], why: 'Fit the driven wheels and brakes after the transmission.' }
  ];
  const ARCH = [
    { id: 'foundation', title: 'Foundation', choices: [{ id: 'concrete', label: 'Drained concrete footing', cost: 4, cap: 8 }, { id: 'stone', label: 'Stone footing', cost: 3, cap: 6 }, { id: 'timber', label: 'Timber posts', cost: 2, cap: 3 }] },
    { id: 'framing', title: 'Framing', choices: [{ id: 'timber', label: 'Braced timber frame', cost: 3, mass: 3, cap: 4 }, { id: 'steel', label: 'Braced steel frame', cost: 4, mass: 4, cap: 7 }, { id: 'masonry', label: 'Load-bearing masonry', cost: 5, mass: 7, cap: 8 }] },
    { id: 'roof', title: 'Roof', choices: [{ id: 'pitched', label: 'Light pitched roof with gutters', cost: 3, mass: 3 }, { id: 'slate', label: 'Heavy pitched slate roof', cost: 5, mass: 6 }, { id: 'flat', label: 'Flat roof without drains', cost: 2, mass: 2 }] },
    { id: 'plumbing', title: 'Plumbing', choices: [{ id: 'gravity', label: 'Separate supply; waste falls to drain', cost: 2 }, { id: 'pump', label: 'Separated circuits with waste pump', cost: 4 }, { id: 'shared', label: 'Shared supply and waste pipe', cost: 1 }] },
    { id: 'electrical', title: 'Electrical', choices: [{ id: 'conduit', label: 'Dry conduit, circuit protection and earth', cost: 3 }, { id: 'bare', label: 'Bare wire alongside water pipe', cost: 1 }, { id: 'unfused', label: 'Dry wire without circuit protection', cost: 2 }] },
    { id: 'furniture', title: 'Furniture and access', choices: [{ id: 'clear', label: 'Bed and table; door and drain kept clear', cost: 1 }, { id: 'blocked', label: 'Large cabinet across the only doorway', cost: 1 }, { id: 'drain', label: 'Bed over the plumbing access hatch', cost: 1 }] }
  ];
  const RECEIVE = [
    { word: 'HOPE', text: 'A fictional neighbour sends encouragement.' },
    { word: 'REST', text: 'A fictional neighbour reminds you to rest when you can.' },
    { word: 'STEADY', text: 'A fictional neighbour suggests taking the day one task at a time.' },
    { word: 'WATER', text: 'A fictional camp message reports a change in the water delivery.' },
    { word: 'TOGETHER', text: 'A fictional neighbour marks another month of mutual support.' },
    { word: 'COURAGE', text: 'A fictional greeting: courage can include recovering after a difficult day.' }
  ];
  const SEND = ['HOPE', 'REST', 'STEADY', 'THANKS'];
  const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const canonical = text => String(text || '').toUpperCase().replace(/K/g, 'C').replace(/[^A-Z]/g, '');
  const TapCode = {
    matrix: MATRIX.slice(),
    encode(text) {
      const result = [];
      for (const raw of String(text || '').toUpperCase()) {
        if (/\s/.test(raw)) { if (result.length && !result[result.length - 1].space) result.push({ row: 0, col: 0, space: true }); continue; }
        const letter = raw === 'K' ? 'C' : raw;
        const row = MATRIX.findIndex(line => line.includes(letter));
        if (row !== -1) result.push({ row: row + 1, col: MATRIX[row].indexOf(letter) + 1, letter });
      }
      return result;
    },
    decode(row, col) {
      if (Array.isArray(row)) {
        if (row.length === 2 && row.every(Number.isInteger)) return TapCode.decode(row[0], row[1]);
        return row.map(pair => pair && pair.space ? ' ' : TapCode.decode(pair)).map(v => v === null ? '?' : v).join('');
      }
      if (row && typeof row === 'object') return row.space ? ' ' : TapCode.decode(row.row, row.col);
      return Number.isInteger(row) && Number.isInteger(col) && row >= 1 && row <= 5 && col >= 1 && col <= 5 ? MATRIX[row - 1][col - 1] : null;
    },
    normalize: canonical
  };
  P.TapCode = TapCode;

  function seed(game) {
    const s = game.pow;
    const x = (s.flags.captivitySeed || 173) + s.day * 31 + (s.flags.recaptures || 0) * 101;
    return x >>> 0;
  }
  function sequence(n, value) {
    let x = value >>> 0;
    return Array.from({ length: n }, () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return (x >>> 19) % 4; });
  }
  function state(game) {
    const s = game.pow;
    s.flags = s.flags || {};
    s.stats = s.stats || {};
    s.day = Math.max(1, finite(s.day, 1));
    for (const [key, value] of Object.entries({ physical: 75, fatigue: 25, resilience: 65, morale: 60, memory: 60, hope: 60 })) s.stats[key] = finite(s.stats[key], value);
    s.inventory = s.inventory || {};
    if (!s.captivity) s.captivity = {
      version: 2, minute: 8 * 60, elapsedMinutes: 0, captureDay: s.day,
      captureYear: captureYear(game), visits: 0, logs: [], events: [], rewards: {}, daily: {},
      foodQuality: 0.6, sleeping: null, exercise: null, inspectionUntil: 0, lastAttempt: -100,
      car: { round: 1, installed: [], phase: 'assemble', recall: [], cycle: [] },
      architecture: { round: 1, stage: 0, choices: {}, budget: 18, spent: 0, site: 'wet' },
      city: { round: 1, grid: cityGrid(), tool: 'housing' },
      memory: { round: 1, sequence: [], phase: 'ready', entered: [], timer: 0, cursor: 0 },
      tap: { lesson: false, mode: 'receive', pair: { row: 0, col: 0 }, group: 'row', decoded: '', sendWord: 'HOPE', received: 0, sent: 0, playback: null, signal: '', lastTap: -100 },
      vent: { noticed: false, work: 0, lastDay: 0, route: false },
      code: { intention: '', reflections: 0 }, routine: { active: false, elapsed: 0, eligible: false },
      feedback: 'Inspect the door, wall, bed or notebook. The light remains on.'
    };
    const c = s.captivity;
    c.daily = c.daily || {}; c.rewards = c.rewards || {}; c.events = c.events || []; c.logs = c.logs || [];
    return c;
  }
  function captureYear(game) {
    const mis = game.mis || {};
    if (mis.escape) return 1967; // This playable episode begins with the October escape.
    const text = String(mis.date || mis.year || (mis.env && mis.env.year) || mis.title || '1967');
    const match = text.match(/\b(196[5-9]|197[0-2])\b/);
    return match ? Number(match[0]) : 1967;
  }
  function cityGrid() { return Array.from({ length: 25 }, (_, i) => Math.floor(i / 5) === 2 ? 'road' : 'empty'); }
  function notify(game, message) {
    const c = state(game); c.feedback = message;
    if (P.notify) P.notify(game, message);
    render(game);
  }
  function save(game) { if (P.save) P.save(game); }
  function stat(game, key, delta) { game.pow.stats[key] = clamp(game.pow.stats[key] + delta, 0, 100); }
  function log(game, message) {
    const c = state(game);
    c.logs.push({ day: game.pow.day, minute: Math.floor(c.minute), message });
    if (c.logs.length > 70) c.logs.shift();
  }
  function reward(game, activity, message, gains) {
    const c = state(game), stamp = game.pow.day;
    if (c.rewards[activity] === stamp) {
      notify(game, message + ' You have already gained from this activity today; further practice is optional.');
      return false;
    }
    c.rewards[activity] = stamp; c.daily[activity] = stamp;
    for (const [key, delta] of Object.entries(gains || {})) stat(game, key, delta);
    log(game, message); notify(game, message); save(game); return true;
  }
  function available(game, activity, duration) {
    const c = state(game);
    if (c.sleeping || c.routine.active) return false;
    if (c.elapsedMinutes - c.lastAttempt < 0.6) { notify(game, 'Take a moment between steps.'); return false; }
    if (game.pow.stats.fatigue >= 92 && activity !== 'code' && activity !== 'tap') { notify(game, 'Exhaustion makes this task difficult. Rest, use a short personal anchor, or return later.'); return false; }
    c.lastAttempt = c.elapsedMinutes;
    advance(game, duration || 4, 'activity');
    if (activity !== 'code') stat(game, 'fatigue', 0.35);
    return true;
  }
  function advance(game, minutes, reason) {
    const c = state(game), s = game.pow;
    minutes = Math.max(0, finite(minutes, 0));
    c.elapsedMinutes += minutes; c.minute += minutes;
    while (c.minute >= 1440) { c.minute -= 1440; s.day++; newDay(game, reason); }
    if (reason !== 'sleep' && reason !== 'rest') stat(game, 'fatigue', minutes / 360);
    if (c.sleeping) stat(game, 'fatigue', -minutes / 14);
  }
  function newDay(game, reason) {
    const s = game.pow, c = state(game), hard = s.difficulty === 'hard';
    c.foodQuality = clamp(0.58 + Math.sin(s.day * 1.31 + (s.flags.recaptures || 0)) * 0.22 - (hard ? 0.08 : 0), 0.25, 0.84);
    stat(game, 'physical', (c.foodQuality - 0.52) * 2 - (s.stats.fatigue > 80 ? 0.9 : 0));
    const contact = c.rewards.tapReceive >= s.day - 3 || c.rewards.tapSend >= s.day - 3;
    stat(game, 'morale', contact ? 0.8 : -0.35);
    stat(game, 'hope', contact ? 0.55 : -0.22);
    c.daily = {};
    if (s.day % 7 === 0) {
      c.events.push({ day: s.day, kind: 'week', text: 'Another fictional week: food and guard routines shift; projects and contact remain available.' });
      log(game, 'Weekly routine changed.');
    }
    if (s.day % 11 === 0 && !c.pendingEvent) c.pendingEvent = { kind: 'interview', day: s.day };
    if (s.day % 35 === 0) {
      c.events.push({ day: s.day, kind: 'transfer', text: 'A fictional transfer changes the corridor and guard pattern. Your memory projects and relationships continue.' });
      s.flags.campTransfers = (s.flags.campTransfers || 0) + 1;
      s.flags.guardCycle = (s.flags.guardCycle || 0) + 1;
      log(game, 'Transferred within the fictional camp system.');
    }
    if (s.day >= 28 && !c.vent.noticed) { c.vent.noticed = true; notify(game, 'Weeks of observation reveal a loose vent fastener. Inspect it in the cell; it does not lead directly to freedom.'); }
    if (s.day % 30 === 0) log(game, 'A month has passed in this accelerated fictional simulation.');
    if (reason !== 'routine' && c.pendingEvent && !c.sleeping) notify(game, 'An interview request is waiting at the door. You can address it when ready.');
    if (s.day >= releaseDay(c)) c.releaseAvailable = true;
    if (c.events.length > 30) c.events.shift();
  }
  function releaseDay(c) { return Math.max(365, Math.round((1973 - c.captureYear) * 365 + 43)); }
  function confined(game) { return !!(game.pow && ['solitary', 'captivity'].includes(game.pow.stage)); }
  function activitiesAvailable(game) { return confined(game) || !!(game.pow && game.pow.stage === 'cell'); }
  function isNight(c) { return c.minute >= 20 * 60 || c.minute < 6 * 60; }

  function box(game, id, mesh, x, y, z, hx, hy, hz, solid, color) {
    if (P.addBox) return P.addBox(game, id, mesh, x, y, z, hx, hy, hz, { solid: !!solid, tint: color || [1, 1, 1, 0] });
    const s = game.pow, b = s.base;
    const geo = { id, m: mesh, p: [b[0] + x, b[1] + y, b[2] + z], y: 0, scale: [hx * 2, hy * 2, hz * 2], s: 1, t: color || [1, 1, 1, 0] };
    game.campGeo = game.campGeo || []; game.campGeo.push(geo);
    if (solid) s.solids.push({ id, x: b[0] + x, z: b[2] + z, hw: hx, hl: hz, yMin: b[1] + y - hy, yMax: b[1] + y + hy, active: true });
    return geo;
  }
  function object(game, id, name, x, y, z, action, extra) {
    if (P.object) return P.object(game, id, name, x, y, z, action, extra || {});
    const b = game.pow.base;
    const o = Object.assign({ id, name, p: [b[0] + x, b[1] + y, b[2] + z], radius: 1.05, action, view: false }, extra || {});
    if (P.addObject) P.addObject(game, o); else game.pow.objects.push(o);
    return o;
  }
  function buildCell(game) {
    const s = game.pow, c = state(game), w = CELL.width / 2, l = CELL.length / 2;
    s.objects = []; s.solids = []; s.surfaces = []; game.campGeo = [];
    box(game, 'cell-floor', 'powStone', 0, -0.065, 0, w + 0.14, 0.065, l + 0.14, false, [0.7, 0.66, 0.59, 0]);
    box(game, 'cell-left', 'powStone', -w - 0.09, 1.2, 0, 0.09, 1.2, l + 0.18, true);
    box(game, 'cell-right', 'powStone', w + 0.09, 1.2, 0, 0.09, 1.2, l + 0.18, true);
    box(game, 'cell-back', 'powStone', 0, 1.2, l + 0.09, w, 1.2, 0.09, true);
    box(game, 'cell-roof', 'powStone', 0, 2.46, 0, w + 0.18, 0.06, l + 0.18, false);
    // Door is at local -Z, matching the corridor guard's acoustic target.
    box(game, 'cell-door', 'powMetal', 0, 1.08, -l - 0.05, w, 1.08, 0.05, true, [0.54, 0.57, 0.51, 0]);
    box(game, 'door-transom', 'powStone', 0, 2.28, -l - 0.09, w, 0.12, 0.09, true);
    for (let i = -2; i <= 2; i++) box(game, 'door-bar-' + i, 'powMetal', i * 0.15, 2.16, -l - 0.03, 0.012, 0.12, 0.02, false);
    box(game, 'bed', 'powWood', 0, 0.12, 0.55, 0.35, 0.12, 0.73, true, [0.65, 0.6, 0.5, 0]);
    box(game, 'bed-mat', 'powWood', 0, 0.25, 0.55, 0.32, 0.015, 0.7, false, [0.86, 0.74, 0.52, 0]);
    box(game, 'ankle-bar', 'powMetal', 0, 0.34, -0.04, 0.34, 0.025, 0.025, false);
    for (const x of [-0.11, 0.11]) {
      box(game, 'shackle-a-' + x, 'powMetal', x - 0.04, 0.38, -0.04, 0.009, 0.045, 0.02, false);
      box(game, 'shackle-b-' + x, 'powMetal', x + 0.04, 0.38, -0.04, 0.009, 0.045, 0.02, false);
      box(game, 'shackle-top-' + x, 'powMetal', x, 0.43, -0.04, 0.05, 0.009, 0.02, false);
    }
    box(game, 'tray', 'powMetal', 0.21, 0.035, -1.15, 0.14, 0.025, 0.13, false);
    box(game, 'notebook', 'powWood', -0.18, 0.28, -0.16, 0.095, 0.012, 0.09, false, [0.91, 0.82, 0.62, 0]);
    box(game, 'vent', 'powMetal', -w + 0.012, 1.9, -0.7, 0.012, 0.16, 0.22, false);
    box(game, 'bulb-wire', 'powMetal', 0, 2.32, -0.35, 0.008, 0.08, 0.008, false);
    box(game, 'permanent-bulb', 'powPale', 0, 2.22, -0.35, 0.045, 0.055, 0.045, false, [1, 0.9, 0.68, 4]);
    box(game, 'corridor-floor', 'powStone', 0, -0.05, -2.6, 2.3, 0.05, 1.1, false);
    s.cellDoor = [s.base[0], s.base[1], s.base[2] - l - 0.7];
    s.lights = [{ p: [s.base[0], s.base[1] + 2.21, s.base[2] - 0.35], color: [1, 0.88, 0.65], radius: 5, power: 1.25, permanent: true }];
    object(game, 'cell-notebook', 'Mental notebook: build and remember', -0.18, 0.28, -0.16, g => open(g, 'notebook'), { radius: 1.6, view: false });
    object(game, 'cell-wall', 'Listen and use the tap code', -w, 1.1, -0.45, g => open(g, 'tap'), { radius: 1.6, view: false });
    object(game, 'cell-bed', 'Rest, sleep and daily routine', 0, 0.28, 0.62, g => open(g, 'rest'), { radius: 1.7, view: false });
    object(game, 'cell-door', 'Observe the corridor / interview', 0, 1.2, -l, g => inspectDoor(g), { radius: 1.25 });
    object(game, 'cell-tray', 'Inspect the daily meal', 0.21, 0.12, -1.15, g => meal(g), { radius: 1.1, view: false });
    object(game, 'cell-vent', 'Inspect the vent fastener', -w, 1.9, -0.7, g => inspectVent(g), { radius: 1.25, enabled: g => state(g).vent.noticed, hold: 5 });
    object(game, 'cell-exercise', 'Seated exercise and personal anchor', 0, 0.8, -0.08, g => open(g, 'exercise'), { radius: 1.2, view: false });
    s.motion = { radius: 0.19, speed: 0.72 };
    s.objective = 'Inspect the wall, notebook, door and bed. Keep contact, practice and rest. Time passes through days, weeks and months.';
    s.customMovement = false;
    if (game.evade) {
      if (game.evade.p) game.evade.p.splice(0, 3, s.base[0], s.base[1], s.base[2] - 0.66);
      else game.evade.p = [s.base[0], s.base[1], s.base[2] - 0.66];
      s.p = game.evade.p;
      game.evade.hdg = 0; game.evade.look = 0; game.evade.inCell = 1; game.evade.camp = true; game.evade.frozen = false;
      game.evade.running = false; game.evade.drawn = 0;
    }
    if (game.setHour) game.setHour(2.4, 0.25);
    c.tetherOrigin = [s.base[0], s.base[2] - 0.66];
  }

  function enter(game) {
    if (!game || !game.pow) return;
    const c = state(game), s = game.pow;
    c.visits++;
    if (!s.base) s.base = game.evade && game.evade.p ? game.evade.p.slice() : [0, 4, 0];
    c.car.cycle = c.car.cycle.length ? c.car.cycle : CAR.map(part => part.id);
    buildCell(game);
    close(game);
    notify(game, c.visits > 1 ? 'Returned to confinement. Your projects, contacts and elapsed days remain. The guard routine has changed.' : 'Solitary confinement: a three-by-nine-foot cell, a permanent light, and limited space. Inspect objects with F or the touch action.');
    log(game, c.visits > 1 ? 'Returned to solitary confinement.' : 'Entered solitary confinement.');
    save(game);
  }

  function restore(game, snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || !game || !game.pow) return false;
    const defaults = state(game);
    function merge(target, source) {
      for (const key of Object.keys(target)) {
        const value = source[key];
        if (value === undefined) continue;
        if (Array.isArray(target[key])) { if (Array.isArray(value)) target[key] = JSON.parse(JSON.stringify(value)); }
        else if (target[key] && typeof target[key] === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
          if (Object.keys(target[key]).length) merge(target[key], value);
          else target[key] = JSON.parse(JSON.stringify(value));
        } else if (target[key] === null || typeof target[key] === typeof value) target[key] = value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
      }
      // Project targets and timeline notices are optional until their first use.
      for (const key of ['targets', 'hiddenAt', 'observations', 'pendingEvent', 'releaseAvailable', 'noiseCount', 'flashUntil']) if (source[key] !== undefined) target[key] = JSON.parse(JSON.stringify(source[key]));
    }
    merge(defaults, snapshot);
    defaults.minute = clamp(finite(defaults.minute, 480), 0, 1439.999);
    defaults.elapsedMinutes = Math.max(0, finite(defaults.elapsedMinutes, 0));
    defaults.open = false; defaults.tab = 'notebook'; defaults.uiTick = 0;
    if (defaults.exercise) defaults.exercise.holding = false;
    if (defaults.sleeping) defaults.sleeping = null;
    if (defaults.routine) defaults.routine.active = false;
    if (game.evade && game.evade.p) defaults.tetherOrigin = [game.evade.p[0], game.evade.p[2]];
    if (defaults.car.installed.some(id => !CAR.some(p => p.id === id))) defaults.car.installed = [];
    if (!Array.isArray(defaults.city.grid) || defaults.city.grid.length !== 25) defaults.city.grid = cityGrid();
    close(game); return true;
  }

  function carChoose(game, id) {
    const c = state(game), a = c.car, part = CAR.find(p => p.id === id);
    if (!part || a.phase !== 'assemble' || a.installed.includes(id)) return false;
    if (!available(game, 'car', 6)) return false;
    const missing = part.deps.filter(dep => !a.installed.includes(dep));
    if (missing.length) { notify(game, part.label + ' needs ' + missing.map(k => CAR.find(p => p.id === k).label).join(' and ') + ' first.'); return false; }
    a.installed.push(id); a.hiddenAt = c.elapsedMinutes + Math.max(8, 24 - a.round * 2);
    notify(game, part.label + ' placed. ' + part.why);
    if (a.installed.length === CAR.length) { a.phase = 'cycle'; a.recall = []; notify(game, 'Assembly complete. Trace the four-stroke cycle in order, then recall the hidden components.'); }
    save(game); return true;
  }
  function carCycle(game, choice) {
    const a = state(game).car, cycle = ['Intake', 'Compression', 'Power', 'Exhaust'];
    if (a.phase !== 'cycle' || !available(game, 'car', 4)) return false;
    if (choice !== cycle[a.recall.length]) { a.recall = []; notify(game, 'Reconsider valve opening, compression, ignition and exhaust. Start the cycle again.'); return false; }
    a.recall.push(choice);
    if (a.recall.length === 4) {
      a.phase = 'recall'; a.recall = [];
      a.targets = sequence(Math.min(2 + a.round + (game.pow.difficulty === 'hard' ? 1 : 0), 6), seed(game) + a.round).map(n => a.installed[(n * 3 + a.round) % CAR.length]);
      notify(game, 'Recall challenge: reconstruct the listed jobs from memory. Installed names are hidden.');
    } else notify(game, choice + ' stroke traced.');
    save(game); return true;
  }
  function carRecall(game, id) {
    const a = state(game).car;
    if (a.phase !== 'recall' || !available(game, 'car', 5)) return false;
    if (a.targets[a.recall.length] !== id) { a.recall = []; notify(game, 'That component does a different job. Reconstruct the jobs in the indicated order.'); return false; }
    a.recall.push(id);
    if (a.recall.length === a.targets.length) {
      reward(game, 'car', 'A complete imaginary engine runs through a coherent cycle.', { memory: 3, resilience: 2, hope: 1 });
      a.round++; a.installed = []; a.phase = 'assemble'; a.recall = []; a.targets = []; a.hiddenAt = 0;
    } else notify(game, 'The remembered component fits. Continue.');
    save(game); return true;
  }
  function architecturalConstraint(a, index, option) {
    if (a.spent + option.cost > a.budget) return 'That exceeds the remaining material budget.';
    if (index === 0 && a.site === 'wet' && option.id !== 'concrete') return 'Wet ground needs a drained concrete footing for this plan.';
    if (index === 0 && a.site === 'dry' && option.id === 'timber') return 'The planned permanent house needs a masonry or concrete foundation.';
    if (index === 1) {
      const foundation = ARCH[0].choices.find(p => p.id === a.choices.foundation);
      if (!foundation || option.mass > foundation.cap) return 'The selected foundation cannot carry that frame.';
    }
    if (index === 2) {
      const frame = ARCH[1].choices.find(p => p.id === a.choices.framing);
      if (option.id === 'flat') return 'The rainy site requires a pitched roof and controlled drainage.';
      if (!frame || option.mass > frame.cap) return 'That roof is too heavy for the selected frame.';
    }
    if (index === 3 && option.id === 'shared') return 'Potable supply must be separated from wastewater.';
    if (index === 4 && option.id !== 'conduit') return 'Keep protected wiring dry and separate from water; include circuit protection and earth.';
    if (index === 5 && option.id !== 'clear') return 'Keep the only exit and maintenance access clear.';
    // Reserve the cheapest safe remaining stages: choosing an expensive frame/roof
    // can be valid structurally and still leave an impossible budget.
    const minimum = [0, 3, 3, 2, 3, 1];
    if (a.spent + option.cost + minimum.slice(index + 1).reduce((x, y) => x + y, 0) > a.budget) return 'Safe remaining stages would exceed the budget. Choose a lighter, economical material.';
    return null;
  }
  function architectureChoose(game, id) {
    const a = state(game).architecture, section = ARCH[a.stage];
    if (!section) return false;
    const option = section.choices.find(p => p.id === id);
    if (!option || !available(game, 'architecture', 9)) return false;
    const error = architecturalConstraint(a, a.stage, option);
    if (error) { notify(game, error); return false; }
    a.choices[section.id] = id; a.spent += option.cost; a.stage++;
    if (a.stage === ARCH.length) {
      reward(game, 'architecture', 'Foundation, structure, services and a clear living space form a workable imagined house.', { memory: 2, morale: 3, resilience: 2 });
      a.round++; a.stage = 0; a.choices = {}; a.spent = 0; a.site = a.round % 2 ? 'wet' : 'dry'; a.budget = Math.max(16, 19 - a.round);
    } else notify(game, section.title + ' planned. ' + (a.budget - a.spent) + ' material units remain.');
    save(game); return true;
  }
  function cityErrors(city, hard) {
    const g = city.grid, positions = type => g.map((t, i) => t === type ? i : -1).filter(i => i >= 0);
    const xy = i => [i % 5, Math.floor(i / 5)];
    const distance = (a, b) => { const u = xy(a), v = xy(b); return Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]); };
    const neighbours = i => [i % 5 > 0 ? i - 1 : -1, i % 5 < 4 ? i + 1 : -1, i >= 5 ? i - 5 : -1, i < 20 ? i + 5 : -1].filter(n => n >= 0);
    const roads = g.map((t, i) => ['road', 'stop'].includes(t) ? i : -1).filter(i => i >= 0);
    const homes = positions('housing'), waters = positions('water'), utilities = positions('utility'), schools = positions('school'), parks = positions('park'), stops = positions('stop');
    const errors = [], count = city.round > 1 || hard ? 3 : 2;
    if (homes.length !== count) errors.push('Place exactly ' + count + ' housing blocks.');
    for (const [kind, list] of [['water supply', waters], ['utility plant', utilities], ['school', schools], ['park', parks], ['transport stop', stops]]) if (list.length !== 1) errors.push('Place one ' + kind + '.');
    if (!roads.length) errors.push('A street network is required.');
    if (roads.length > 10) errors.push('The street budget is ten cells, including the stop.');
    if (roads.length) {
      const seen = new Set([roads[0]]), todo = [roads[0]];
      while (todo.length) for (const n of neighbours(todo.shift())) if (roads.includes(n) && !seen.has(n)) { seen.add(n); todo.push(n); }
      if (seen.size !== roads.length) errors.push('Connect every street and transport stop to one street network.');
    }
    for (const i of homes) {
      const label = String.fromCharCode(65 + i % 5) + (Math.floor(i / 5) + 1);
      if (!neighbours(i).some(n => roads.includes(n))) errors.push('Housing ' + label + ' needs an adjacent street.');
      if (!waters.some(n => distance(i, n) <= 5)) errors.push('Housing ' + label + ' is outside water coverage (five blocks).');
      if (utilities.some(n => distance(i, n) < 2)) errors.push('Separate housing ' + label + ' from the utility plant by at least two blocks.');
      if (!stops.some(n => distance(i, n) <= (hard ? 2 : 3))) errors.push('Housing ' + label + ' is too far from the transport stop.');
      if (!parks.some(n => distance(i, n) <= 3)) errors.push('Housing ' + label + ' needs a park within three blocks.');
    }
    for (const i of waters.concat(utilities)) if (!neighbours(i).some(n => roads.includes(n))) errors.push('Water and utility service buildings need street access.');
    for (const i of schools) {
      if (!roads.some(n => distance(i, n) <= 2)) errors.push('The school needs a street within two blocks.');
      if (utilities.some(n => distance(i, n) < 2)) errors.push('Separate the school from the utility plant.');
    }
    return Array.from(new Set(errors));
  }
  function cityPlace(game, index, tool) {
    const a = state(game).city;
    if (!Number.isInteger(index) || index < 0 || index >= 25 || !['empty', 'road', 'housing', 'water', 'utility', 'school', 'park', 'stop'].includes(tool)) return false;
    if (a.grid[index] === tool || !available(game, 'city', 3)) return false;
    a.grid[index] = tool; notify(game, 'Placed ' + tool + ' at ' + String.fromCharCode(65 + index % 5) + (Math.floor(index / 5) + 1) + '.'); save(game); return true;
  }
  function cityValidate(game) {
    const a = state(game).city;
    if (!available(game, 'city', 12)) return false;
    const errors = cityErrors(a, game.pow.difficulty === 'hard');
    if (errors.length) { notify(game, errors.slice(0, 4).join(' ')); return false; }
    reward(game, 'city', 'A connected neighbourhood has water, services, green space and transport.', { memory: 3, morale: 2, hope: 2 });
    a.round++; a.grid = cityGrid(); save(game); return true;
  }

  function memoryStart(game) {
    const a = state(game).memory;
    if (!['ready', 'answer'].includes(a.phase) || !available(game, 'memory', 3)) return false;
    a.sequence = sequence(Math.min(3 + a.round + (game.pow.difficulty === 'hard' ? 1 : 0), 12), seed(game) + a.round * 73);
    a.phase = 'show'; a.entered = []; a.cursor = 0; a.timer = 0; a.visible = -1;
    notify(game, 'Watch the positions, then repeat the sequence.'); save(game); return true;
  }
  function memoryInput(game, index) {
    const a = state(game).memory;
    if (a.phase !== 'answer' || !Number.isInteger(index) || index < 0 || index > 3 || !available(game, 'memory', 2)) return false;
    if (a.sequence[a.entered.length] !== index) {
      a.phase = 'ready'; a.entered = []; notify(game, 'The sequence differed. Repetition is practice; your progress remains.'); return false;
    }
    a.entered.push(index);
    if (a.entered.length === a.sequence.length) {
      reward(game, 'memory', 'The entire spatial pattern was recalled.', { memory: 3, resilience: 1, hope: 1 });
      a.round++; a.phase = 'ready'; a.sequence = []; a.entered = [];
    } else notify(game, 'Position remembered: ' + a.entered.length + ' of ' + a.sequence.length + '.');
    save(game); return true;
  }

  function tapSound(game, vol) {
    const a = game.app;
    if (a && a.audio && (!a.set || a.set.sound)) a.audio.burst('thunk', vol * (game.pow.intensity === 'reduced' ? 0.55 : 1));
  }
  function tapPlay(game) {
    const c = state(game), a = c.tap, message = RECEIVE[(a.received + Math.floor(game.pow.day / 7)) % RECEIVE.length];
    a.mode = 'receive'; a.decoded = ''; a.pair = { row: 0, col: 0 }; a.group = 'row';
    a.playback = { word: message.word, text: message.text, letters: TapCode.encode(message.word), index: 0, group: 'row', count: 0, timer: 0.7, done: false };
    a.signal = ''; notify(game, 'Listen and count: row taps, pause, column taps. A longer pause separates letters.'); save(game);
  }
  function tapHit(game, group) {
    const c = state(game), a = c.tap;
    if (!['row', 'col'].includes(group) || c.inspectionUntil > c.elapsedMinutes) { notify(game, 'The corridor is being checked. Wait quietly before tapping again.'); return false; }
    if (c.elapsedMinutes - a.lastTap < 0.12) return false;
    if (a.pair[group] >= 5) { notify(game, 'A group contains at most five taps. Clear the pair to start again.'); return false; }
    a.lastTap = c.elapsedMinutes; a.pair[group]++; a.group = group;
    if (a.mode === 'send') {
      tapSound(game, 0.17);
      if (P.AI && P.AI.noise) P.AI.noise(game, game.evade.p, game.pow.intensity === 'reduced' ? 0.095 : 0.15, 'tap');
      a.noiseCount = (a.noiseCount || 0) + 1;
      if (a.noiseCount % 18 === 0) { if (P.AI && P.AI.noise) P.AI.noise(game, game.evade.p, 0.55, 'repeated wall taps'); }
    }
    render(game); return true;
  }
  function tapLetter(game) {
    const a = state(game).tap, letter = TapCode.decode(a.pair.row, a.pair.col);
    if (!letter) { notify(game, 'Enter one to five row taps and one to five column taps.'); return false; }
    if (!available(game, 'tap', 1)) return false;
    a.decoded += letter; a.pair = { row: 0, col: 0 }; a.group = 'row';
    notify(game, 'Decoded letters: ' + a.decoded + '. C also represents K.'); save(game); return true;
  }
  function tapValidate(game) {
    const a = state(game).tap;
    if (!available(game, 'tap', 8)) return false;
    const expected = a.mode === 'send' ? a.sendWord : a.playback && a.playback.word;
    if (!expected) { notify(game, 'Listen to a message first.'); return false; }
    if (a.mode === 'receive' && !a.playback.done) { notify(game, 'The neighbour is still sending. Count the remaining letters before checking.'); return false; }
    if (canonical(a.decoded) !== canonical(expected)) { notify(game, 'That spelling does not match. Replay and count each row and column, or clear your letters.'); return false; }
    if (a.mode === 'send') {
      a.sent++; reward(game, 'tapSend', 'Your fictional neighbour answers the correctly transmitted word with a quiet acknowledgement.', { morale: 3, hope: 3 });
      a.sendWord = SEND[a.sent % SEND.length]; a.decoded = ''; a.pair = { row: 0, col: 0 };
    } else {
      a.received++; reward(game, 'tapReceive', a.playback.text + ' Message: ' + expected + '.', { morale: 3, hope: 3, memory: 1 });
      game.pow.flags.prisonerContact = true; game.pow.flags.wallContact = true; a.playback = null; a.decoded = ''; a.lesson = true;
    }
    save(game); return true;
  }

  function exerciseStart(game) {
    const c = state(game);
    if (game.pow.stats.fatigue >= 78) { notify(game, 'At this fatigue level, rest is more useful than another exercise set.'); return false; }
    if (c.rewards.exercise === game.pow.day) { notify(game, 'Today’s short exercise is complete. Give your body recovery time.'); return false; }
    c.exercise = { reps: 0, next: 'left', hold: 0, holding: false, last: -100, night: isNight(c) };
    notify(game, 'A gentle seated set: alternate left and right shoulder presses eight times, then hold a relaxed breathing position for three seconds. Stop whenever you choose.');
    save(game); return true;
  }
  function exercisePress(game, side) {
    const c = state(game), a = c.exercise;
    if (!a || a.reps >= 8 || !['left', 'right'].includes(side)) return false;
    if (side !== a.next) { notify(game, 'Alternate sides; do not repeat the same shoulder.'); return false; }
    if (c.elapsedMinutes - a.last < 0.65) { notify(game, 'Keep the movement slow and controlled.'); return false; }
    a.last = c.elapsedMinutes; a.reps++; a.next = side === 'left' ? 'right' : 'left';
    advance(game, 1.5, 'activity'); stat(game, 'fatigue', 0.3);
    if (P.AI && P.AI.noise) P.AI.noise(game, game.evade.p, 0.075, 'movement');
    notify(game, a.reps === 8 ? 'Eight gentle presses complete. Hold the breathing button for three seconds, or stop.' : a.reps + ' of eight presses; next is ' + a.next + '.'); return true;
  }
  function personalAnchor(game, intention) {
    const c = state(game);
    if (!['duty', 'help', 'truth', 'prayer', 'quiet'].includes(intention) || !available(game, 'code', 5)) return false;
    c.code.intention = intention; c.code.reflections++;
    const texts = {
      duty: 'A personal duty can be small: care for yourself today and be ready to help another person tomorrow.',
      help: 'A useful intention: help when you can, receive help when you need it, and return to that intention after a difficult day.',
      truth: 'Honesty, loyalty, kindness and courage can be a private compass. Coercion and exhaustion do not measure a person’s worth.',
      prayer: 'Optional quiet prayer. You may use your own words or simply breathe. Belief is never required for progress.',
      quiet: 'Sit quietly and notice one thing you can choose: a breath, a memory, a sentence, a plan for the next hour.'
    };
    reward(game, 'code', texts[intention], { resilience: 1, morale: 1 }); save(game); return true;
  }
  function restStart(game, type) {
    const c = state(game);
    if (c.sleeping || c.routine.active || !['rest', 'sleep'].includes(type)) return false;
    c.sleeping = { type, elapsed: 0, target: type === 'sleep' ? 16 : 8, minutes: 0, startFatigue: game.pow.stats.fatigue };
    if (game.evade) game.evade.moving = false;
    notify(game, type === 'sleep' ? 'Sleep interval: one real second represents thirty simulated minutes, up to eight hours. The light stays on; you can wake early.' : 'Rest interval: one real second represents fifteen simulated minutes, up to two hours. You can stop early.');
    save(game); return true;
  }
  function stopRest(game) {
    const c = state(game);
    if (!c.sleeping) return;
    const a = c.sleeping; c.sleeping = null;
    const disturbance = c.inspectionUntil > c.elapsedMinutes;
    if (a.type === 'sleep') {
      const quality = game.pow.intensity === 'reduced' ? 0.85 : 0.68;
      stat(game, 'physical', Math.min(1.8, a.minutes / 240) * quality);
      if (disturbance) stat(game, 'fatigue', 3);
    }
    log(game, a.type + ' interval of ' + Math.round(a.minutes) + ' simulated minutes.');
    notify(game, 'You ' + (a.type === 'sleep' ? 'wake' : 'finish resting') + ' after ' + Math.round(a.minutes) + ' simulated minutes. Light and confinement continue.'); save(game);
  }
  function routineStart(game) {
    const c = state(game), recent = Object.values(c.rewards).filter(d => d >= game.pow.day - 7).length;
    if (game.pow.day < 28 || recent < 3) { notify(game, 'A longer routine becomes available after four weeks and practice in three different activities during the last week.'); return false; }
    if (c.routine.active || c.sleeping) return false;
    c.routine = { active: true, elapsed: 0, target: 30, days: 30, eligible: true };
    notify(game, 'Accelerated monthly routine: thirty real seconds represent thirty fictional days of established meals, rest and practice. New events and conditions still accrue. You can stop early.'); save(game); return true;
  }
  function routineStop(game) {
    const c = state(game), a = c.routine;
    if (!a.active) return;
    a.active = false;
    notify(game, 'The longer routine ends. Projects and contact need attention again; review the event log and door.');
    log(game, 'Lived through ' + Math.floor(a.elapsed) + ' days of an established accelerated routine.'); save(game);
  }

  function meal(game) {
    const c = state(game), q = c.foodQuality;
    if (c.daily.meal === game.pow.day) { notify(game, 'The day’s meal is finished. The tray holds no additional food.'); return false; }
    c.daily.meal = game.pow.day;
    stat(game, 'physical', q * 1.2); stat(game, 'fatigue', -q * 3);
    advance(game, 12, 'activity');
    notify(game, 'A small fictional ration: ' + (q > 0.65 ? 'somewhat better today' : q < 0.4 ? 'poor quality today' : 'plain and limited') + '. Food quality affects condition over time.'); save(game); return true;
  }
  function inspectDoor(game) {
    const c = state(game);
    if (c.releaseAvailable) { open(game, 'release'); return; }
    if (c.pendingEvent) { open(game, 'interview'); return; }
    if (c.daily.observe !== game.pow.day) {
      c.daily.observe = game.pow.day; c.observations = (c.observations || 0) + 1; advance(game, 10, 'activity');
      game.pow.flags.guardObservations = (game.pow.flags.guardObservations || 0) + 1;
      log(game, 'Observed the corridor changeover.');
    }
    notify(game, 'Through the barred transom: a fictional corridor patrol changes direction before stopping at the far door. Watching records a pattern, but the door remains locked.');
    open(game, 'door'); save(game);
  }
  function interviewChoose(game, choice) {
    const c = state(game);
    if (!c.pendingEvent || !['identity', 'pause', 'cope'].includes(choice)) return false;
    const texts = {
      identity: 'You give identifying information and keep other answers brief. The fictional interview ends; recovery remains part of the next day.',
      pause: 'You ask for a pause and water, and conserve your energy. A need for rest does not define your character.',
      cope: 'You use a flexible coping response to get through the fictional interview. Recover, reconnect and begin again when you can.'
    };
    advance(game, game.pow.intensity === 'reduced' ? 35 : 75, 'activity');
    stat(game, 'fatigue', game.pow.intensity === 'reduced' ? 2 : 5);
    c.pendingEvent = null; c.events.push({ day: game.pow.day, kind: 'interview', text: texts[choice] });
    log(game, 'Returned from a non-graphic fictional interview.'); notify(game, texts[choice]); open(game, 'notebook'); save(game); return true;
  }
  function inspection(game, reason) {
    const c = state(game);
    c.inspectionUntil = Math.max(c.inspectionUntil, c.elapsedMinutes + (game.pow.intensity === 'reduced' ? 4 : 8));
    c.tap.signal = ''; c.tap.playback = null;
    game.pow.flags.inspections = (game.pow.flags.inspections || 0) + 1;
    if (c.sleeping && game.pow.intensity !== 'reduced') stat(game, 'fatigue', 1.5);
    notify(game, (reason || 'The corridor guard checks the door.') + ' Tapping and vent work pause; wait quietly.'); log(game, 'A guard checked the cell after a noise.'); save(game);
  }
  function inspectVent(game) {
    const c = state(game);
    if (!c.vent.noticed) { notify(game, 'The vent is fixed. Weeks of observation may reveal more.'); return false; }
    if (c.inspectionUntil > c.elapsedMinutes) { notify(game, 'A corridor check interrupts the work. Return after the guard moves away.'); return false; }
    if (c.vent.route) { open(game, 'route'); return true; }
    if (isNight(c)) { notify(game, 'Night shackling limits reach. Inspect the fastener during a daytime interval.'); return false; }
    if (c.vent.lastDay === game.pow.day) { notify(game, 'A little work is enough today. Repeating it now would attract attention.'); return false; }
    if (game.pow.stats.fatigue > 82) { notify(game, 'Rest before doing controlled physical work.'); return false; }
    c.vent.lastDay = game.pow.day; c.vent.work++; advance(game, 45, 'activity'); stat(game, 'fatigue', 3);
    if (P.AI && P.AI.noise) P.AI.noise(game, game.evade.p, 0.65, 'vent work');
    if (c.vent.work >= 3) { c.vent.route = true; notify(game, 'The fastener is loose after several days of work. The opening leads to a physical escape attempt through the camp, with guards and walls still ahead.'); open(game, 'route'); }
    else notify(game, 'A little controlled work loosens the fastener: ' + c.vent.work + ' of three separate days.');
    save(game); return true;
  }
  function leaveCell(game) {
    const c = state(game);
    if (!c.vent.route || c.inspectionUntil > c.elapsedMinutes) { notify(game, 'The physical route is not ready or the corridor is being checked.'); return false; }
    if ((c.observations || 0) < 2) { notify(game, 'Observe the corridor on two days before attempting the route.'); return false; }
    game.pow.flags.captivityEscape = true;
    game.pow.flags.retryStage = 'cell';
    c.vent.route = false; c.vent.work = 0;
    log(game, 'Began a new physical escape attempt.');
    close(game); save(game);
    // Core restarts the physical cell chapter with its saved progress, not an
    // outcome panel or a successful escape roll.
    if (P.begin) {
      const snapshot = P.save ? P.save(game) : { day: game.pow.day, time: game.pow.time, base: game.pow.base.slice(), stats: game.pow.stats, flags: game.pow.flags, inventory: game.pow.inventory, captivity: c };
      if (snapshot) {
        delete snapshot.p;
        snapshot.stage = 'cell'; snapshot.complete = false;
        for (const key of ['doorOpen', 'outside', 'roofCrossed', 'bunkSearched']) delete snapshot.flags[key];
        delete snapshot.inventory.bracket; delete snapshot.inventory.rope;
      }
      P.begin(game, 'cell', snapshot);
      if (game.pow && !game.pow.captivity) game.pow.captivity = c;
    } else if (P.transition) P.transition(game, 'cell');
    return true;
  }
  function release(game) {
    const c = state(game);
    if (!c.releaseAvailable || game.pow.day < releaseDay(c)) return false;
    close(game);
    const text = 'Repatriated in 1973. Operation Homecoming began on 12 February 1973; the release operation returned 591 Americans from captivity in Southeast Asia. The conditions, conversations, accelerated calendar and activities in this chapter are fictional, not a transcript or a claim about an individual prisoner.';
    log(game, 'Operation Homecoming ending, 1973.');
    if (P.finish) P.finish(game, { title: 'Operation Homecoming · 1973', text, historical: true, repatriated: true });
    else if (game.debrief) game.debrief(false, text);
    return true;
  }

  let ui = null, currentGame = null;
  function dom(tag, text, cls) {
    const e = root.document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e;
  }
  function ensureUI() {
    if (ui || !root.document) return ui;
    const style = dom('style'); style.id = 'pow-captivity-style';
    style.textContent = '#pow-captivity{position:fixed;inset:7vh 5vw;z-index:850;background:rgba(14,22,25,.97);color:#eee8d8;border:1px solid #82785e;border-radius:7px;padding:16px;overflow:auto;display:none;font:15px/1.45 system-ui,sans-serif;touch-action:pan-y}#pow-captivity button{background:#293c40;color:#fff2d4;border:1px solid #7f918c;border-radius:4px;padding:10px 12px;min-height:44px;font:inherit;cursor:pointer}#pow-captivity button:focus-visible{outline:3px solid #edcc79}#pow-captivity button:disabled{opacity:.45;cursor:default}#pow-captivity h2{margin:0 0 5px;font-size:23px}#pow-captivity h3{margin:12px 0 6px;font-size:18px}#pow-captivity p{margin:8px 0}#pow-captivity .pow-row{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}#pow-captivity .pow-grid{display:grid;grid-template-columns:repeat(5,minmax(42px,1fr));gap:4px;max-width:500px}#pow-captivity .pow-memory{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;max-width:320px}#pow-captivity .pow-active{background:#c5a850;color:#141b1b}#pow-captivity .pow-dim{color:#b4b9b4;font-size:13px}#pow-captivity .pow-feedback{padding:8px;background:#1b2d31;border-left:3px solid #c7b066}#pow-captivity .pow-top{display:flex;justify-content:space-between;gap:12px;align-items:start}#pow-captivity .pow-tap-signal{min-height:30px;font-size:25px;color:#ffdb87}#pow-captivity .pow-stat{font-variant-numeric:tabular-nums}@media(max-height:480px){#pow-captivity{inset:2vh 2vw;padding:10px}}';
    root.document.head.appendChild(style);
    ui = dom('section'); ui.id = 'pow-captivity'; ui.setAttribute('role', 'dialog'); ui.setAttribute('aria-label', 'Captivity activities'); ui.setAttribute('aria-modal', 'true');
    ui.addEventListener('keydown', event => { if (event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); close(currentGame); } });
    ui.addEventListener('pointerdown', event => event.stopPropagation());
    root.document.body.appendChild(ui); return ui;
  }
  function btn(parent, label, fn, disabled, cls) {
    const b = dom('button', label, cls); b.type = 'button'; b.disabled = !!disabled; b.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); fn(); }); parent.appendChild(b); return b;
  }
  function para(parent, text, cls) { const e = dom('p', text, cls); parent.appendChild(e); return e; }
  function row(parent) { const e = dom('div', undefined, 'pow-row'); parent.appendChild(e); return e; }
  function open(game, tab) {
    if (!game || !game.pow) return;
    const c = state(game); c.tab = tab || 'notebook'; c.open = true; currentGame = game;
    if (game.evade && game.evade.p) c.tetherOrigin = [game.evade.p[0], game.evade.p[2]];
    if (game.app && game.app.keys) for (const key of Object.keys(game.app.keys)) game.app.keys[key] = false;
    if (root.document && root.document.pointerLockElement && root.document.exitPointerLock) root.document.exitPointerLock();
    render(game);
    const first = ui && ui.querySelector('button'); if (first) first.focus({ preventScroll: true });
  }
  function close(game) {
    if (game && game.pow && game.pow.captivity) {
      const c = game.pow.captivity; c.open = false;
      if (c.exercise) c.exercise.holding = false;
      if (game.app && game.app.keys) for (const key of Object.keys(game.app.keys)) game.app.keys[key] = false;
    }
    if (ui) ui.style.display = 'none';
  }
  function render(game) {
    if (!root.document || !game || !game.pow) return;
    const c = state(game), panel = ensureUI();
    if (!c.open || !activitiesAvailable(game)) { panel.style.display = 'none'; return; }
    // Rebuilding only when a task changes preserves touch holds and keyboard focus.
    const active = root.document.activeElement, focus = active && panel.contains(active) ? active.textContent : null;
    panel.replaceChildren(); panel.style.display = 'block';
    const top = dom('div', undefined, 'pow-top'); panel.appendChild(top);
    const title = dom('div'); top.appendChild(title); title.appendChild(dom('h2', 'Solitary · day ' + game.pow.day));
    para(title, clock(c) + ' · ' + (isNight(c) ? 'Night shackling: restricted movement' : 'Daytime: limited legroom') + ' · 1 real second = 1 simulated minute', 'pow-dim');
    btn(top, 'Return to cell', () => close(game));
    para(panel, 'Condition ' + Math.round(game.pow.stats.physical) + ' · fatigue ' + Math.round(game.pow.stats.fatigue) + ' · memory ' + Math.round(game.pow.stats.memory) + ' · morale ' + Math.round(game.pow.stats.morale) + ' · hope ' + Math.round(game.pow.stats.hope), 'pow-dim pow-stat');
    const nav = row(panel);
    for (const [id, label] of [['notebook', 'Notebook'], ['car', 'Engine'], ['architecture', 'House'], ['city', 'City'], ['memory', 'Memory'], ['tap', 'Tap code'], ['exercise', 'Exercise / anchor'], ['rest', 'Rest / time'], ['history', 'Context / log']]) btn(nav, label, () => open(game, id), false, c.tab === id ? 'pow-active' : '');
    const feedback = para(panel, c.feedback, 'pow-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    const tab = c.tab;
    if (tab === 'car') renderCar(game, panel);
    else if (tab === 'architecture') renderArchitecture(game, panel);
    else if (tab === 'city') renderCity(game, panel);
    else if (tab === 'memory') renderMemory(game, panel);
    else if (tab === 'tap') renderTap(game, panel);
    else if (tab === 'exercise') renderExercise(game, panel);
    else if (tab === 'rest') renderRest(game, panel);
    else if (tab === 'interview') renderInterview(game, panel);
    else if (tab === 'route') renderRoute(game, panel);
    else if (tab === 'release') {
      para(panel, 'The accelerated calendar has reached 1973. Release is a historical ending, after prolonged captivity, rather than an escape roll.');
      btn(row(panel), 'Continue to Operation Homecoming', () => release(game));
    } else if (tab === 'history') renderHistory(game, panel);
    else if (tab === 'door') {
      para(panel, 'The locked door and barred transom face the corridor. Recorded observations: ' + (c.observations || 0) + '. Guard noise, inspections and transfers change the routine.');
      if (c.pendingEvent) btn(row(panel), 'Address interview request', () => open(game, 'interview'));
      if (c.vent.route) btn(row(panel), 'Review physical route', () => open(game, 'route'));
    } else {
      para(panel, 'The notebook represents imagined projects and remembered patterns, not supplies in the cell. Each completed project requires several real steps. Practice can help once per day; repeating it immediately gives no extra condition gain.');
      para(panel, 'Build an engine, a workable house or a connected neighbourhood; repeat a spatial pattern; communicate by timed taps. Rest when tired. Your progress persists after transfer or recapture.');
      para(panel, 'These activities draw on a supplied, paraphrased secondary summary of mental coping. They are fictional interaction design, not verified dialogue or a reconstruction of one person’s captivity.', 'pow-dim');
    }
    if (focus) { const match = Array.from(panel.querySelectorAll('button')).find(b => b.textContent === focus); if (match) match.focus({ preventScroll: true }); }
  }
  function clock(c) { return String(Math.floor(c.minute / 60)).padStart(2, '0') + ':' + String(Math.floor(c.minute % 60)).padStart(2, '0'); }
  function renderCar(game, panel) {
    const c = state(game), a = c.car;
    panel.appendChild(dom('h3', 'Mechanical assembly · challenge ' + a.round));
    para(panel, 'Reconstruct an engine and drivetrain from real components. Bearings precede the crank, lubrication precedes testing, and transmission precedes driven wheels. Steps take six simulated minutes.');
    if (a.phase === 'assemble') {
    const hidden = (a.round > 1 || game.pow.difficulty === 'hard') && c.elapsedMinutes > (a.hiddenAt || 0);
      para(panel, 'Placed: ' + (a.installed.length ? hidden ? a.installed.length + ' parts (recall their identities)' : a.installed.map(id => CAR.find(p => p.id === id).label).join(', ') : 'none'));
      const options = row(panel);
      const order = CAR.slice(); if (a.round % 2 === 0) order.reverse();
      for (const part of order) btn(options, part.label, () => carChoose(game, part.id), a.installed.includes(part.id));
    } else if (a.phase === 'cycle') {
      para(panel, 'Select the next stroke; valve motion and ignition determine the order. ' + a.recall.length + ' of four traced.');
      for (const name of ['Power', 'Exhaust', 'Intake', 'Compression']) btn(row(panel), name, () => carCycle(game, name));
    } else {
      para(panel, 'Recall these jobs in order: ' + a.targets.map(id => CAR.find(p => p.id === id).why).join(' → '));
      para(panel, a.recall.length + ' of ' + a.targets.length + ' reconstructed.');
      const options = row(panel); for (const part of CAR) btn(options, part.label, () => carRecall(game, part.id));
    }
  }
  function renderArchitecture(game, panel) {
    const a = state(game).architecture, section = ARCH[a.stage];
    panel.appendChild(dom('h3', 'Architectural plan · challenge ' + a.round));
    para(panel, 'Site: ' + a.site + ' ground, rain, one exit. Material budget: ' + a.budget + '; spent: ' + a.spent + '. Foundation → framing → roof → plumbing → electrical → furniture. Structural load, drainage, hygiene, electrical protection and access must agree.');
    para(panel, Object.entries(a.choices).map(([key, value]) => key + ': ' + value).join(' · ') || 'No stages planned yet.');
    if (section) {
      panel.appendChild(dom('h3', section.title));
      const options = row(panel); for (const option of section.choices) btn(options, option.label + ' (' + option.cost + ' units)', () => architectureChoose(game, option.id));
    }
    btn(row(panel), 'Redraw this plan', () => { a.stage = 0; a.choices = {}; a.spent = 0; notify(game, 'A fresh plan keeps the same site and material budget.'); save(game); });
  }
  function renderCity(game, panel) {
    const a = state(game).city, hard = game.pow.difficulty === 'hard', needed = a.round > 1 || hard ? 3 : 2;
    const symbols = { empty: '·', road: 'Street', housing: 'Home', water: 'Water', utility: 'Utility', school: 'School', park: 'Park', stop: 'Stop' };
    panel.appendChild(dom('h3', 'City grid · challenge ' + a.round));
    para(panel, 'Place ' + needed + ' homes and one each: water, utility, school, park and street transport stop. All streets connect (maximum ten). Homes touch a street, have water within five blocks, a park within three and a stop within ' + (hard ? 2 : 3) + '. Utility stays two blocks from homes and school. Service buildings touch streets; school is within two blocks of a street.');
    const tools = row(panel); for (const [id, label] of Object.entries(symbols)) btn(tools, id === 'empty' ? 'Erase' : label, () => { a.tool = id; render(game); }, false, a.tool === id ? 'pow-active' : '');
    const grid = dom('div', undefined, 'pow-grid'); panel.appendChild(grid);
    for (let i = 0; i < 25; i++) { const name = String.fromCharCode(65 + i % 5) + (Math.floor(i / 5) + 1); btn(grid, name + ' ' + symbols[a.grid[i]], () => cityPlace(game, i, a.tool), false, a.grid[i] === 'empty' ? '' : 'pow-active'); }
    const controls = row(panel); btn(controls, 'Check neighbourhood', () => cityValidate(game));
    btn(controls, 'Clear to starting street', () => { a.grid = cityGrid(); notify(game, 'Five connected street cells remain; plan the neighbourhood around them.'); save(game); });
  }
  function renderMemory(game, panel) {
    const a = state(game).memory;
    panel.appendChild(dom('h3', 'Spatial sequence · challenge ' + a.round));
    para(panel, a.phase === 'show' ? 'Watch the timed positions. Input opens after the pattern finishes.' : a.phase === 'answer' ? 'Repeat the positions in order. ' + a.entered.length + ' entered.' : 'Watch a real timed sequence, then reproduce it. Patterns become longer as you progress.');
    if (a.phase === 'ready') btn(row(panel), 'Show sequence', () => memoryStart(game));
    const grid = dom('div', undefined, 'pow-memory'); panel.appendChild(grid);
    for (let i = 0; i < 4; i++) { const b = btn(grid, ['Upper left', 'Upper right', 'Lower left', 'Lower right'][i], () => memoryInput(game, i), a.phase !== 'answer', a.visible === i ? 'pow-active' : ''); b.dataset.memoryPosition = String(i); }
    if (a.phase === 'answer') btn(row(panel), 'Replay from the beginning', () => memoryStart(game));
  }
  function renderTap(game, panel) {
    const c = state(game), a = c.tap;
    panel.appendChild(dom('h3', 'Tap code · row, then column'));
    para(panel, 'A five-by-five alphabet; C and K share a square. Count row taps, pause, count column taps. A longer pause starts the next letter. Messages here are fictional mutual encouragement and camp information.');
    const table = dom('table'); table.setAttribute('aria-label', 'Tap code matrix');
    const head = dom('tr'); head.appendChild(dom('th', 'Row / col')); for (let i = 1; i <= 5; i++) head.appendChild(dom('th', String(i))); table.appendChild(head);
    MATRIX.forEach((line, i) => { const r = dom('tr'); r.appendChild(dom('th', String(i + 1))); for (const letter of line) r.appendChild(dom('td', letter === 'C' ? 'C/K' : letter)); table.appendChild(r); }); panel.appendChild(table);
    const modes = row(panel); btn(modes, 'Listen / replay message', () => tapPlay(game));
    btn(modes, 'Transmit ' + a.sendWord, () => { a.mode = 'send'; a.playback = null; a.decoded = ''; a.pair = { row: 0, col: 0 }; notify(game, 'Transmit the spelling ' + a.sendWord + ' using actual row and column taps. Repeated tapping can draw an inspection.'); });
    const signal = para(panel, a.signal || (a.playback && a.playback.done ? 'Message finished. Check your decoded spelling.' : 'Quiet wall'), 'pow-tap-signal'); signal.dataset.tapSignal = '1'; signal.setAttribute('aria-live', 'off');
    para(panel, a.mode === 'send' ? 'Transmit target: ' + a.sendWord : 'Receive: count the timed taps. The word is revealed after correct decoding.');
    para(panel, 'This pair: row ' + a.pair.row + ', column ' + a.pair.col + ' · letters: ' + (a.decoded || '—'));
    const controls = row(panel); btn(controls, 'Tap row (+1)', () => tapHit(game, 'row')); btn(controls, 'Tap column (+1)', () => tapHit(game, 'col')); btn(controls, 'Commit this letter', () => tapLetter(game));
    btn(controls, 'Clear pair', () => { a.pair = { row: 0, col: 0 }; render(game); });
    const end = row(panel); btn(end, 'Check complete word', () => tapValidate(game)); btn(end, 'Clear decoded letters', () => { a.decoded = ''; a.pair = { row: 0, col: 0 }; render(game); });
    para(panel, 'Receiving is quiet. Transmitting makes audible taps in the camp simulation. Reduced intensity uses slower incoming taps and quieter audio; counting and spelling still matter.', 'pow-dim');
  }
  function renderExercise(game, panel) {
    const c = state(game), a = c.exercise;
    panel.appendChild(dom('h3', 'Gentle movement and personal anchors'));
    para(panel, isNight(c) ? 'Night shackles restrict lower-body movement. Only the seated shoulder and breathing set is available.' : 'There is little legroom. A short seated shoulder and breathing set maintains a routine; fatigue limits exercise.');
    if (!a) btn(row(panel), 'Begin gentle seated set', () => exerciseStart(game));
    else {
      para(panel, a.reps + ' of eight alternate presses. Breathing hold: ' + a.hold.toFixed(1) + ' of three seconds.');
      const controls = row(panel); btn(controls, 'Left shoulder', () => exercisePress(game, 'left'), a.reps >= 8); btn(controls, 'Right shoulder', () => exercisePress(game, 'right'), a.reps >= 8);
      const hold = btn(controls, 'Press and hold: quiet breathing', () => {}, a.reps < 8); hold.dataset.breathHold = '1';
      const begin = event => { if (a.reps < 8) return; event.preventDefault(); a.holding = true; if (event.pointerId !== undefined && hold.setPointerCapture) hold.setPointerCapture(event.pointerId); };
      const end = () => { a.holding = false; };
      hold.addEventListener('pointerdown', begin); hold.addEventListener('pointerup', end); hold.addEventListener('pointercancel', end); hold.addEventListener('lostpointercapture', end);
      hold.addEventListener('keydown', event => { if (event.code === 'Space' || event.code === 'Enter') begin(event); }); hold.addEventListener('keyup', end); hold.addEventListener('blur', end);
      btn(controls, 'Stop set', () => { c.exercise = null; notify(game, 'You stop the set and conserve energy.'); });
    }
    panel.appendChild(dom('h3', 'Optional personal code / prayer'));
    para(panel, 'The traditional Scout Oath emphasizes doing one’s best, duty, helping others, and care for body and mind. The Scout Law names trustworthiness, loyalty, helpfulness, friendliness, courtesy, kindness, obedience, cheerfulness, thrift, bravery, cleanliness and reverence. These are optional personal anchors, not a test of a prisoner’s worth.');
    const anchors = row(panel);
    for (const [id, label] of [['duty', 'Small duty today'], ['help', 'Help and receive help'], ['truth', 'Private compass'], ['prayer', 'Quiet prayer'], ['quiet', 'Quiet reflection']]) btn(anchors, label, () => personalAnchor(game, id));
    para(panel, 'Inspired by a supplied secondary summary, paraphrased here. No line is presented as verified prisoner dialogue. Recovery after coercion is part of coping.', 'pow-dim');
  }
  function renderRest(game, panel) {
    const c = state(game);
    panel.appendChild(dom('h3', 'Rest, sleep and the longer calendar'));
    para(panel, 'Ordinary play: one real second is one simulated minute. Rest: fifteen minutes per second for up to two hours. Sleep: thirty minutes per second for up to eight hours. A monthly routine needs three different recent activities and four weeks of confinement. Acceleration is a fictional design aid.');
    const controls = row(panel);
    if (c.sleeping) { para(panel, c.sleeping.type + ': ' + Math.round(c.sleeping.minutes) + ' simulated minutes accrued.'); btn(controls, 'Wake / stop resting', () => stopRest(game)); }
    else if (c.routine.active) { para(panel, 'Monthly routine: ' + Math.floor(c.routine.elapsed) + ' of thirty simulated days. Conditions and events accrue.'); btn(controls, 'End longer routine early', () => routineStop(game)); }
    else { btn(controls, 'Rest up to two hours', () => restStart(game, 'rest')); btn(controls, 'Sleep up to eight hours', () => restStart(game, 'sleep')); btn(controls, 'Live an established monthly routine', () => routineStart(game)); }
    if (c.releaseAvailable) btn(row(panel), 'Read 1973 release notice', () => open(game, 'release'));
    para(panel, 'The light remains on during rest and sleep. Night shackling limits reach and movement. Poor rations and missed rest affect condition; this simulation does not diagnose or rank anyone.');
  }
  function renderInterview(game, panel) {
    const reduced = game.pow.intensity === 'reduced';
    panel.appendChild(dom('h3', reduced ? 'A brief interview request' : 'A non-graphic interview'));
    para(panel, reduced ? 'A staff member asks questions. Choose a brief response; the scene skips pressure details and uses a shorter time and fatigue cost.' : 'You are asked for information and a statement. This scene represents pressure through time and fatigue, without graphic violence or reflex challenges. None of these coping choices is graded as courage or cowardice.');
    const options = row(panel);
    btn(options, 'Give identifying information; keep answers brief', () => interviewChoose(game, 'identity'));
    btn(options, 'Ask for water and a pause', () => interviewChoose(game, 'pause'));
    btn(options, 'Use a flexible coping response', () => interviewChoose(game, 'cope'));
    para(panel, 'The Code of Conduct is a historical framework. Captivity and coercion require compassion; recovering and reconnecting after pressure matter. These fictional choices do not claim a universal response or recreate a specific interview.', 'pow-dim');
  }
  function renderRoute(game, panel) {
    const c = state(game);
    panel.appendChild(dom('h3', 'A physical escape opportunity'));
    para(panel, 'After weeks and several days of careful work, the vent opening offers a route into the physical camp chapter. You must still move past guards, open barriers, cross the compound and evade search. Recapture returns you here with your elapsed time, projects and contacts intact, and changes the next attempt.');
    para(panel, 'Fastener work: ' + c.vent.work + '/3 separate days · corridor observations: ' + (c.observations || 0) + '.');
    btn(row(panel), 'Enter the physical escape route', () => leaveCell(game), !c.vent.route);
    para(panel, 'This opportunity is fictional. It is not a claim that an American prisoner escaped North Vietnam and reached safety.', 'pow-dim');
  }
  function renderHistory(game, panel) {
    const c = state(game);
    panel.appendChild(dom('h3', 'Historical context and simulation record'));
    para(panel, 'American prisoners in North Vietnam used a five-by-five tap code with C/K sharing a square, mental projects, remembered routines and mutual support. This chapter’s events, messages, condition numbers and accelerated intervals are fictional. A supplied secondary summary inspired some activities; it is not treated as a verified transcript.');
    para(panel, 'Operation Homecoming began on 12 February 1973. The operation returned 591 Americans held in Southeast Asia. Release in this chapter is dated 1973, after prolonged captivity. Physical escape and rescue outcomes in the game are alternate fictional possibilities.');
    if (root.POWPhotos && root.POWPhotos.open) {
      const photographs = row(panel);
      btn(photographs, 'View historical reference photographs', () => root.POWPhotos.open());
      btn(photographs, 'Jeremiah Denton photograph', () => root.POWPhotos.open('denton'));
      btn(photographs, 'James Stockdale photograph', () => root.POWPhotos.open('stockdale'));
    }
    panel.appendChild(dom('h3', 'Changing camp events'));
    if (!c.events.length) para(panel, 'Weekly events, transfer notices and interviews will appear as time passes.');
    for (const event of c.events.slice(-8).reverse()) para(panel, 'Day ' + event.day + ': ' + event.text);
    panel.appendChild(dom('h3', 'Your activity record'));
    for (const event of c.logs.slice(-12).reverse()) para(panel, 'Day ' + event.day + ': ' + event.message, 'pow-dim');
  }

  function tickPlayback(game, dt) {
    const a = state(game).tap, b = a.playback;
    if (!b || b.done) return;
    b.timer -= dt;
    b.flashUntil = finite(b.flashUntil, 0) - dt;
    if (a.signal && b.flashUntil <= 0) a.signal = '';
    let guard = 0;
    while (b.timer <= 0 && !b.done && guard++ < 12) {
      const pair = b.letters[b.index];
      if (!pair) { b.done = true; a.signal = 'Message finished'; break; }
      const target = pair[b.group];
      if (b.count < target) {
        b.count++; a.signal = (b.group === 'row' ? 'Row ' : 'Column ') + '•'; tapSound(game, 0.12);
        b.flashUntil = 0.15; b.timer += game.pow.intensity === 'reduced' ? 0.5 : 0.32;
      } else if (b.group === 'row') { b.group = 'col'; b.count = 0; a.signal = ''; b.timer += 0.8; }
      else { b.index++; b.group = 'row'; b.count = 0; a.signal = ''; b.timer += 1.15; }
    }
    if (ui && state(game).open && state(game).tab === 'tap') { const node = ui.querySelector('[data-tap-signal]'); if (node) node.textContent = a.signal || '—'; }
  }
  function step(game, dt) {
    if (!game || !game.pow || !confined(game)) { if (ui) ui.style.display = 'none'; return; }
    const c = state(game), s = game.pow, e = game.evade;
    dt = clamp(finite(dt, 0), 0, 1);
    if (c.routine.active) {
      const a = c.routine, remaining = Math.min(dt, a.target - a.elapsed); a.elapsed += remaining;
      // Established routine includes meals, sleep and practice. No extra puzzle
      // rewards are issued; only condition drift and historical calendar progress.
      advance(game, remaining * 1440, 'routine');
      stat(game, 'fatigue', -remaining * 4.6); stat(game, 'physical', remaining * 0.12);
      if (a.elapsed >= a.target) routineStop(game);
    } else if (c.sleeping) {
      const a = c.sleeping, remaining = Math.min(dt, a.target - a.elapsed); a.elapsed += remaining;
      const minutes = remaining * (a.type === 'sleep' ? 30 : 15); a.minutes += minutes; advance(game, minutes, a.type);
      if (a.elapsed >= a.target) stopRest(game);
    } else advance(game, dt, 'clock');
    const night = isNight(c), locked = night || !!c.sleeping || c.routine.active || c.open;
    s.motion.radius = 0.19; s.motion.speed = locked ? 0 : 0.72 * (s.stats.fatigue > 85 ? 0.6 : 1);
    s.flags.nightShackles = night;
    if (e && c.tetherOrigin && locked) {
      // Enforce a physical restriction even when core movement ran before this
      // tick; never teleport through a wall or allow UI input to walk away.
      const limit = night ? 0.1 : 0.02;
      const x = c.tetherOrigin[0], z = c.tetherOrigin[1], dx = e.p[0] - x, dz = e.p[2] - z, d = Math.hypot(dx, dz);
      if (d > limit) { e.p[0] = x + dx / d * limit; e.p[2] = z + dz / d * limit; }
      e.moving = false; e.running = false;
    } else if (e) c.tetherOrigin = [e.p[0], e.p[2]];
    tickPlayback(game, dt);
    const m = c.memory;
    if (m.phase === 'show') {
      m.timer += dt; const pace = s.intensity === 'reduced' ? 1.25 : 1;
      const cursor = Math.floor(m.timer / pace);
      m.visible = m.timer % pace < pace * 0.65 ? m.sequence[cursor] : -1;
      if (cursor >= m.sequence.length) { m.phase = 'answer'; m.visible = -1; notify(game, 'Now repeat the displayed spatial sequence.'); }
      if (ui && c.open && c.tab === 'memory') for (const node of ui.querySelectorAll('[data-memory-position]')) node.classList.toggle('pow-active', Number(node.dataset.memoryPosition) === m.visible);
    }
    const a = c.exercise;
    if (a && a.holding && a.reps >= 8 && c.open && c.tab === 'exercise') {
      a.hold += dt;
      if (ui) { const node = ui.querySelector('[data-breath-hold]'); if (node) node.textContent = 'Quiet breathing: ' + Math.min(3, a.hold).toFixed(1) + '/3 seconds'; }
      if (a.hold >= 3) { c.exercise = null; reward(game, 'exercise', 'A controlled seated set and quiet breathing are complete. Recovery time comes next.', { physical: 1.2, resilience: 1 }); stat(game, 'fatigue', 1.5); }
    }
    c.uiTick = finite(c.uiTick, 0) + dt;
    if (c.uiTick >= 1) {
      c.uiTick = 0;
      // Avoid replacing the pressed exercise button or interrupting a timed
      // sequence. Other progress panels can update their displayed clock.
      if (c.open && !['tap', 'memory', 'exercise'].includes(c.tab)) render(game);
    }
  }
  function interact(game, obj, action) {
    if (typeof obj === 'function') return obj(game);
    if (obj && typeof obj.action === 'function') return obj.action(game, obj);
    const id = typeof obj === 'string' ? obj : obj && obj.id;
    if (id === 'cell-vent') return inspectVent(game);
    if (id === 'cell-door') return inspectDoor(game);
    if (id === 'cell-tray') return meal(game);
    return open(game, action || (id === 'cell-wall' ? 'tap' : id === 'cell-bed' ? 'rest' : id === 'cell-exercise' ? 'exercise' : 'notebook'));
  }
  function prepareCell(game) {
    const s = game.pow;
    if (!s || s.stage !== 'cell' || s._cellActivitiesInstalled) return;
    s._cellActivitiesInstalled = true;
    state(game);
    const wall = s.objects.find(obj => obj.id === 'wall-contact');
    if (wall) { wall.action = g => open(g, 'tap'); wall.name = 'Listen and transmit the five-by-five tap code'; wall.enabled = () => true; }
    object(game, 'mental-notebook', 'Remembered projects and personal anchors', -1.4, 0.65, 0.8, g => open(g, 'notebook'), { radius: 1.1, view: false, enabled: () => !!s.inventory.bracket });
  }
  function stepCell(game, dt) {
    if (!game || !game.pow || game.pow.stage !== 'cell') return;
    prepareCell(game);
    const c = state(game); dt = clamp(finite(dt, 0), 0, 1);
    if (c.sleeping) {
      const a = c.sleeping, remaining = Math.min(dt, a.target - a.elapsed); a.elapsed += remaining;
      const minutes = remaining * (a.type === 'sleep' ? 30 : 15); a.minutes += minutes; advance(game, minutes, a.type);
      if (a.elapsed >= a.target) stopRest(game);
    } else advance(game, dt, 'clock');
    tickPlayback(game, dt);
    const m = c.memory;
    if (m.phase === 'show') {
      m.timer += dt; const pace = game.pow.intensity === 'reduced' ? 1.25 : 1;
      const cursor = Math.floor(m.timer / pace); m.visible = m.timer % pace < pace * 0.65 ? m.sequence[cursor] : -1;
      if (cursor >= m.sequence.length) { m.phase = 'answer'; m.visible = -1; notify(game, 'Now repeat the displayed spatial sequence.'); }
      if (ui && c.open && c.tab === 'memory') for (const node of ui.querySelectorAll('[data-memory-position]')) node.classList.toggle('pow-active', Number(node.dataset.memoryPosition) === m.visible);
    }
    const a = c.exercise;
    if (a && a.holding && a.reps >= 8 && c.open && c.tab === 'exercise') {
      a.hold += dt;
      if (a.hold >= 3) { c.exercise = null; reward(game, 'exercise', 'A controlled seated set is complete.', { physical: 1.2, resilience: 1 }); stat(game, 'fatigue', 1.5); }
    }
    if (c.open && game.evade) { game.evade.moving = false; game.evade.running = false; }
  }
  P.Captivity = {
    CELL, enter, restore, step, stepCell, prepareCell, interact, open, close, inspection, state, advance,
    carChoose, carCycle, carRecall, architectureChoose, architecturalConstraint,
    cityPlace, cityValidate, cityErrors, memoryStart, memoryInput,
    tapPlay, tapHit, tapLetter, tapValidate, exerciseStart, exercisePress,
    personalAnchor, restStart, stopRest, routineStart, routineStop,
    meal, inspectDoor, interviewChoose, inspectVent, leaveCell, release,
    releaseDay, data: { car: CAR, architecture: ARCH }
  };
})(typeof window !== 'undefined' ? window : globalThis);
