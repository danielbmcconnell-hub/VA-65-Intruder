/* Intact supplied NPC cutouts with authored, bounded articulation.
   The clean sheet has direction variants and several guard poses, NOT a
   recorded walking cycle. No photographs, pixels, alpha or AI state are edited. */
(function (root) {
  'use strict';
  const P = root.POW = root.POW || {}, TAU = Math.PI * 2;
  const COLUMNS = 8, ROWS = 9, MAX_ACTORS = 128, CYCLE_DISTANCE = 1.56;
  const SECTOR = TAU / COLUMNS, DIRECTION_MARGIN = 4 * Math.PI / 180;
  const SOURCE_HEIGHT = [11 / 12, 11 / 12, 11 / 12, 11 / 12, 309 / 384, 11 / 12, 346 / 384, 2 / 3, 11 / 12];
  const SOURCE_BOTTOM = [6 / 384, 6 / 384, 6 / 384, 6 / 384, 16 / 384, 6 / 384, 6 / 384, 58 / 384, 6 / 384];
  const KINDS = { nva: 0, guard: 0, guardAim: 0, sentry: 0, militia: 2, vc: 3, vcFem: 4, female_vc: 4, villager: 5, farmer: 6 };
  let games = new WeakMap(), metadata = null;
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, finite(value, lo)));
  const angle = value => Math.atan2(Math.sin(finite(value)), Math.cos(finite(value)));
  const smooth = (lo, hi, value) => { const t = clamp((value - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
  const validPoint = point => Array.isArray(point) && point.length >= 3 && point.slice(0, 3).every(Number.isFinite);
  const clock = game => game && game.pow && Number.isFinite(game.pow.time) ? game.pow.time : finite(game && game.t);
  const known = actor => actor && Object.prototype.hasOwnProperty.call(KINDS, actor.kind);
  const active = game => !!(game && game.evade && (!game.pow || !game.pow.complete));
  const ease = (current, target, dt, rate) => current + (target - current) * (1 - Math.exp(-dt * rate));
  function relativeHeading(actor, game) {
    const camera = game.rend && game.rend.eye || game.camPos;
    const heading = validPoint(camera) && validPoint(actor.p) ? Math.atan2(camera[0] - actor.p[0], -(camera[2] - actor.p[2])) : 0;
    return angle(finite(actor.face) - heading + Math.PI);
  }
  function direction(actor, game, previous) {
    const relative = relativeHeading(actor, game);
    // A whole original photograph, never a transparent blend of two people.
    // Four degrees of sector hysteresis prevent camera/heading jitter at a cut.
    if (Number.isInteger(previous) && Math.abs(angle(relative - previous * SECTOR)) <= SECTOR * .5 + DIRECTION_MARGIN) return previous;
    return ((Math.round(relative / SECTOR) % COLUMNS) + COLUMNS) % COLUMNS;
  }
  function configure(options) {
    const candidate = options && (options.metadata || options.atlas);
    if (candidate && Array.isArray(candidate.frames) && candidate.frames.length === COLUMNS * ROWS &&
      candidate.frames.every(frame => Number.isFinite(frame.height) && frame.height > 0 && frame.height <= 1 && Number.isFinite(frame.bottom) && frame.bottom >= 0 && frame.bottom < 1)) {
      // Snapshot numeric anchors; mutable caller metadata cannot corrupt poses.
      metadata = candidate.frames.map(frame => ({ height: frame.height, bottom: frame.bottom }));
      return true;
    }
    return false;
  }
  function frameData(row, column) {
    const frame = metadata && metadata[row * COLUMNS + column];
    return frame || { height: SOURCE_HEIGHT[row], bottom: SOURCE_BOTTOM[row] };
  }
  function context(game) {
    if (!games.has(game)) games.set(game, { actors: new WeakMap(), stamp: null, steps: 0 });
    return games.get(game);
  }
  function isGuard(actor) { return known(actor) && KINDS[actor.kind] === 0; }
  function isDead(actor) { return actor.alive === false; }
  function isStunned(actor, game) { return !!(actor.stunned || finite(actor.stunUntil, -1) > finite(game.t, clock(game))); }
  function mode(actor, game, speed, locomotion) {
    if (isDead(actor)) return 'fallen';
    if (isStunned(actor, game)) return 'stunned';
    if (actor.interacting || actor.interaction || actor.action === 'inspect' || actor.action === 'door' || actor.action === 'talk') return 'interaction';
    if (actor.crouch || actor.crouched) return 'crouched';
    if (actor.state === 'investigate' || actor.state === 'search') return speed > .08 ? 'investigating' : 'inspecting';
    if (actor.state === 'pursuit' || actor.state === 'flee' || actor.flee) return locomotion === 'running' ? 'running' : locomotion === 'walking' ? 'walking-alert' : 'alert';
    if (actor.seen && actor.armed || actor.state === 'suspicious' || actor.state === 'observe') return locomotion !== 'idle' ? 'walking-alert' : 'alert';
    return locomotion || (speed > 1.9 ? 'running' : speed > .12 ? 'walking' : 'idle');
  }
  function requestedRow(actor, movement) {
    const base = KINDS[actor.kind];
    if (!isGuard(actor)) return base; // Never change a civilian/VC's identity into the guard.
    if (isDead(actor)) return 7;
    if (movement === 'stunned') return 0;
    if (movement === 'running' && actor.armed !== false) return 8;
    if (actor.kind === 'guardAim' || actor.grab > 0 || actor.seen && actor.armed || actor.state === 'pursuit') return 1;
    return 0;
  }
  function entry(actor, game) {
    const group = context(game);
    if (!group.actors.has(actor)) {
      const movement = mode(actor, game, 0, 'idle'), row = requestedRow(actor, movement);
      group.actors.set(actor, { p: validPoint(actor.p) ? actor.p.slice(0, 3) : null, face: finite(actor.face), phase: ((finite(actor.ph) % TAU) + TAU) % TAU,
        stride: 0, turn: 0, crouch: KINDS[actor.kind] === 4 ? 1 : 0, row, pendingRow: row, pendingTime: 0,
        speed: 0, distance: 0, state: movement, locomotion: 'idle', column: direction(actor, game), idleLean: 0, teleported: false });
    }
    return group.actors.get(actor);
  }
  function advance(actor, game, dt) {
    const s = entry(actor, game), point = validPoint(actor.p) ? actor.p : null;
    let distance = point && s.p ? Math.hypot(point[0] - s.p[0], point[2] - s.p[2]) : 0;
    s.teleported = !!(point && s.p && (distance > Math.max(.65, dt * 6 + .2) || Math.abs(point[1] - s.p[1]) > 3));
    if (s.teleported || !point || isDead(actor) || isStunned(actor, game)) distance = 0;
    const speed = distance / Math.max(dt, .001);
    // A path corner or a blocked step must not repeatedly swap relaxed/charge
    // photographs. Actual measured motion still determines gait and cadence.
    s.locomotion = speed > 1.9 || s.locomotion === 'running' && speed > 1.5 ? 'running'
      : speed > .12 || s.locomotion !== 'idle' && speed > .05 ? 'walking' : 'idle';
    const movement = mode(actor, game, speed, s.locomotion);
    const wanted = requestedRow(actor, movement), stopped = movement === 'fallen' || movement === 'stunned';
    if (distance > 0) s.phase = (s.phase + distance * TAU / CYCLE_DISTANCE) % TAU;
    s.distance += distance; s.speed = speed; s.state = movement;
    const targetStride = stopped || s.teleported ? 0 : clamp(speed / 1.3, 0, 1);
    s.stride = stopped || s.teleported ? 0 : ease(s.stride, targetStride, dt, 8);
    if (s.stride < .004) s.stride = 0;
    const turnRate = stopped || s.teleported ? 0 : angle(finite(actor.face) - s.face) / Math.max(dt, .001);
    s.turn = stopped || s.teleported ? 0 : ease(s.turn, clamp(turnRate / 2.2, -1, 1), dt, 7);
    if (Math.abs(s.turn) < .0001) s.turn = 0;
    // Restrained authored weight shift/inspection, anchored at the feet. This
    // is explicitly geometry articulation, not invented photographic frames.
    const idleAmount = movement === 'inspecting' || movement === 'interaction' ? .22 : movement === 'idle' ? .11 : .035;
    const idleTarget = stopped || s.teleported ? 0 : Math.sin(clock(game) * .83 + finite(actor.ph)) * idleAmount * (1 - s.stride);
    s.idleLean = stopped || s.teleported ? 0 : ease(s.idleLean, idleTarget, dt, 3.5);
    const targetCrouch = KINDS[actor.kind] === 4 ? 1 : movement === 'crouched' ? .65 : movement === 'inspecting' ? .2 : 0;
    s.crouch = ease(s.crouch, targetCrouch, dt, 6);
    if (stopped) { s.row = wanted; s.pendingRow = wanted; s.pendingTime = 0; }
    else if (wanted !== s.row) {
      if (s.pendingRow !== wanted) { s.pendingRow = wanted; s.pendingTime = 0; }
      s.pendingTime += dt;
      if (s.pendingTime >= .12) { s.row = wanted; s.pendingTime = 0; }
    } else { s.pendingRow = wanted; s.pendingTime = 0; }
    s.column = direction(actor, game, s.teleported ? undefined : s.column);
    s.p = point ? point.slice(0, 3) : null; s.face = finite(actor.face);
  }
  function step(game, dt) {
    if (!active(game) || game.paused) return 0;
    dt = clamp(dt, 0, .25); if (!dt) return 0;
    const group = context(game), stamp = clock(game);
    if (group.stamp === stamp) return 0; // Multiple render/simulation hooks cannot double cadence.
    if (group.stamp !== null && stamp < group.stamp) { reset(game); return step(game, dt); }
    group.stamp = stamp; group.steps++;
    const all = (game.evade.searchers || []).concat(game.evade.locals || []), done = new Set();
    let count = 0;
    for (const actor of all) {
      if (count >= MAX_ACTORS) break;
      if (!known(actor) || done.has(actor)) continue;
      done.add(actor); advance(actor, game, dt); count++;
    }
    return count;
  }
  function disabled(actor) {
    return { enabled: false, cell: -1, frame: -1, row: -1, heightRatio: 1, scale: 1, phase: 0, stride: 0, turn: 0, crouch: 0,
      state: 'unsupported', kind: actor && actor.kind || '', visible: actor && actor.alive !== false, anchorBottom: 0, sourceHeight: 1,
      source: 'No matching clean supplied NPC row; preserve the existing renderer.' };
  }
  function pose(actor, game) {
    if (!active(game) || !known(actor)) return disabled(actor);
    const s = entry(actor, game), column = direction(actor, game, s.column);
    const row = clamp(s.row, 0, ROWS - 1) | 0, frame = frameData(row, column), heightRatio = frame.height / (11 / 12);
    const fallen = isDead(actor), stunned = isStunned(actor, game), now = finite(game.t, clock(game));
    return { enabled: true, cell: row * COLUMNS + column, frame: row * COLUMNS + column, row, column,
      heightRatio, scale: heightRatio, phase: finite(s.phase), stride: fallen || stunned || game.paused ? 0 : clamp(s.stride, 0, 1),
      turn: fallen || stunned || game.paused ? 0 : clamp(s.turn + s.idleLean, -1, 1),
      headingTurn: finite(s.turn), idleLean: finite(s.idleLean), crouch: clamp(s.crouch, 0, 1),
      state: fallen ? 'fallen' : stunned ? 'stunned' : s.state, kind: actor.kind,
      visible: !fallen || Number.isFinite(actor.downAt) && now - actor.downAt <= .75,
      anchorBottom: frame.bottom, sourceHeight: frame.height, speed: finite(s.speed), distance: finite(s.distance), teleported: s.teleported,
      source: 'Intact original NPC cutout; direction/state rows plus authored grid deformation, not recorded walking footage.',
      crouchPresentation: row === 4 ? 'Already kneeling in the supplied pose; retain its source proportions.' : 'Reserved descriptor; no crouch deformation is claimed until supported by the renderer.' };
  }
  // Exact reference for root's 4-column x 12-row continuous shared-vertex grid.
  // Inputs x=-.5..+.5, y=0..1 are the original grid coordinates. The first
  // interior grid row is remapped to the metadata's photographed foot line;
  // matching UVs use sourceY, so no image area is stretched or cut away.
  // Geometry deformation uses one intact texture, never cut layers.
  function deform(x, y, motion) {
    x = clamp(x, -.5, .5); y = clamp(y, 0, 1); motion = motion || {};
    const phase = finite(motion.phase), stride = clamp(motion.stride, 0, 1), turn = clamp(motion.turn, -1, 1);
    const bottom = clamp(motion.anchorBottom, 0, .4);
    const sourceY = bottom > 0 ? y <= 1 / 12 ? y * bottom * 12 : bottom + (y - 1 / 12) / (11 / 12) * (1 - bottom) : y;
    const visibleY = clamp((sourceY - bottom) / (1 - bottom), 0, 1);
    const leg = 1 - smooth(.20, .54, visibleY), side = smooth(-.04, .04, x) * 2 - 1;
    const dx = Math.sin(phase) * side * leg * stride * .034 * smooth(0, .07, visibleY) + turn * smooth(.35, .85, visibleY) * .024;
    const dy = Math.sin(phase * 2) * Math.sin(visibleY * Math.PI) * stride * .006;
    return { x: x + dx, y: sourceY + dy, dx, dy, sourceY };
  }
  function reset(game) { if (game) return games.delete(game); games = new WeakMap(); return true; }
  P.FigureMotion = { configure, step, pose, reset, deform,
    source: Object.freeze({ file: 'assets/figures-original.png', sha256: '2b357f1d128f3a9be324778c0fbea527c7574ff8ca328cfb5391bf811d910883', columns: COLUMNS, rows: ROWS,
      limitations: 'Visually inspected clean sheet: columns are perspective/direction variants, not leg-stride frames. Guard relaxed/aim/charge/falling poses exist. VC female is already kneeling. No true crouch or interaction cycle exists for other figures. Damaged derived atlases are not used by this descriptor.' }),
    limits: Object.freeze({ maxActors: MAX_ACTORS, cycleDistanceM: CYCLE_DISTANCE, directionMarginRadians: DIRECTION_MARGIN,
      runEnterMps: 1.9, runLeaveMps: 1.5, maxLegWidthFraction: .034, maxTurnWidthFraction: .024, maxVerticalTileFraction: .006 }) };
})(window);
