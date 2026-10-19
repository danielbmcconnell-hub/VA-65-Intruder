/* Optional B/N worksheet. Recognition notes are player judgments, never a
 * target-ID sensor. All designation, steering and release remain in the
 * original A-6A/APQ-92/APQ-112/ASQ-61 gameplay. */
(function (root) {
  'use strict';
  const NM = 1852, RAD = 180 / Math.PI, SECTOR = 35 / RAD;
  const states = new WeakMap();
  const choices = [
    ['cluster', 'Hard cluster'], ['linear', 'Linear / crossing'],
    ['water', 'Contact on water'], ['soft', 'Soft / concealed'],
    ['offset', 'Offset reference'], ['coordinates', 'Briefed coordinates'],
    ['unknown', 'Uncertain return']
  ];
  const patterns = {
    depot: ['cluster', 'A compact group of strong echoes against softer ground. Compare its position with the briefed river bend and road junction; another building cluster is not proof of identity.'],
    pol: ['cluster', 'A grouped storage return when conditions permit. On this sortie weather may prevent any useful target echo; navigation fixes determine a coordinate attack.'],
    bridge: ['linear', 'A narrow hard crossing against the dark river. Compare the crossing and surrounding river shape with the target-area chart.'],
    rail: ['linear', 'A line of hard rolling-stock echoes along the siding. Confirm the briefed rail alignment before committing the run.'],
    boat: ['water', 'Separate strong returns against dark water. Track a contact through successive sweeps; a bright echo alone does not identify a hostile vessel.'],
    contacts: ['water', 'Surface contacts on water. This is an identification sortie: approach on the assigned track and retain every weapon.'],
    trucks: ['soft', 'Small dispersed vehicles may merge into ground clutter or disappear beneath cover. Use the briefed offset reference when a direct return cannot be obtained.'],
    sam_site: ['cluster', 'The briefed radar and launcher area is dispersed. On the existing Iron Hand mission the emitter indication governs an ARM shot; this worksheet does not provide a radar seeker.']
  };
  let context = null, ui = null;
  const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const d3 = n => String(Math.round((n % 360 + 360) % 360) % 360).padStart(3, '0');
  const releases = score => Math.max(0, finite(score && score.dropped)) + Math.max(0, finite(score && score.armsReleased));
  function flight(game) {
    return !!(game && game.ac && game.world && game.mis && game.ac.alive !== false && !game.pow && !game.evade && !game.chute && !game.result &&
      !['done', 'dead', 'evade', 'chute', 'captured'].includes(game.phase) && (!game.app || game.app.screen === 'game' && !game.app.graphicsContextLost));
  }
  function state(game) {
    let s = states.get(game);
    if (!s) { s = { open: false, interpretation: 'unknown', notes: [], samples: 0, releaseCount: 0, impacts: 0, lastReleased: releases(game.world.score), lastImpacts: finite(game.world.score && game.world.score.hits) + finite(game.world.score && game.world.score.misses), lastDesignation: null, cursor: null, elapsed: 0, renderWait: 0, chartMark: null, runIn: null, pickMode: 'candidate', comparison: null, comparisons: 0 }; states.set(game, s); }
    return s;
  }
  function relative(game, point) {
    if (!Array.isArray(point) || point.length < 3 || !point.every(Number.isFinite)) return null;
    const p = game.ac.p, dx = point[0] - p[0], dz = point[2] - p[2];
    const bearing = Math.atan2(dx, -dz), range = Math.hypot(dx, dz), rel = Math.atan2(Math.sin(bearing - game.ac.yaw), Math.cos(bearing - game.ac.yaw));
    return { bearing: d3(bearing * RAD), rangeNM: range / NM, relativeDeg: rel * RAD };
  }
  function brief(game) {
    const m = game.mis, w = game.world, b = m.brief || {}, kind = m.targets && m.targets.kind;
    const p = patterns[kind] || ['unknown', 'Compare the target-area chart and briefing with the return. A designation is a crew decision, not confirmation of identity.'];
    return { target: b.target || m.targets && m.targets.label || 'No attack target assigned', aircraft: b.ac || 'A-6A Intruder', roe: b.roe || 'Follow the sortie briefing.', ordnance: b.ord || 'See the sortie briefing.',
      expected: w.blind ? 'coordinates' : w.softTargets && w.oap ? 'offset' : p[0], pattern: w.blind ? 'No target return is available. Use the briefed ring after taking the route fixes; a clean solution still carries system-position error.' : w.softTargets && w.oap ? 'The target is concealed in ground clutter. Find the briefed hard offset reference, lock it, then lock again to carry the existing bearing/range offset to the target.' : p[1],
      observation: /visual identification/i.test(b.roe || '') ? 'Visual identification remains required by this briefing. A radar match is only a working hypothesis.' : 'Radar correlation is a working hypothesis. Follow the briefing’s clearance and restrictions.' };
  }
  function sample(game) {
    const h = game.hud || game.app && game.app.hud, r = h && h.radar;
    if (!h || !h.scope || !r || !Array.isArray(h.cross) || !r.buf || !r.hard || !r.age || !r.NA || !r.NR || !Number.isFinite(r.maxR) || r.maxR <= 0 || r.buf.length < r.NA * r.NR || r.hard.length < r.NA * r.NR || r.age.length < r.NA) return { available: false, reason: 'Open SCOPE to read the selected return.' };
    if (finite(game.ac.dmg && game.ac.dmg.diane) > .8) return { available: false, reason: 'DIANE damaged: no reliable scope lock.' };
    const az = clamp(finite(h.cross[0]), -1, 1) * SECTOR, range = 300 + clamp(finite(h.cross[1]), 0, 1) * r.maxR;
    const ac = game.ac, p = [ac.p[0] + Math.sin(ac.yaw + az) * range, 0, ac.p[2] - Math.cos(ac.yaw + az) * range];
    const a = clamp(Math.floor((clamp(h.cross[0], -1, 1) + 1) * .5 * r.NA), 0, r.NA - 1);
    const ri = clamp(Math.floor(clamp(h.cross[1], 0, 1) * r.NR), 0, r.NR - 1);
    // The same polar cell data displayed on the scope; deliberately no
    // lookup in World.targets, scenery identities or hidden terrain tags.
    let strength = 0, hard = 0, count = 0, bright = 0, age = finite(r.age[a], Infinity);
    for (let aa = Math.max(0, a - 1); aa <= Math.min(r.NA - 1, a + 1); aa++) {
      for (let rr = Math.max(0, ri - 1); rr <= Math.min(r.NR - 1, ri + 1); rr++) {
        const i = aa * r.NR + rr, fade = .30 + .70 * Math.exp(-finite(r.age[aa], 9) * .55);
        strength += finite(r.buf[i]) * fade; hard = Math.max(hard, finite(r.hard[i]) * fade); bright += r.hard[i] * fade > .24 ? 1 : 0; count++;
      }
    }
    const mean = strength / Math.max(1, count), fresh = age <= 1.8;
    let description = !fresh ? 'Old / unswept echo — wait for a fresh sweep' : hard > .28 ? (bright >= 4 ? 'Broad hard return' : 'Concentrated hard return') : mean > .12 ? 'Ground / soft return' : 'Weak or dark return';
    if (game.world.blind) description = 'Coordinate attack — do not infer target identity from these echoes';
    return { available: true, fresh, description, strength: mean, hard, age, p, bearing: d3((ac.yaw + az) * RAD), rangeNM: range / NM, relativeDeg: az * RAD, broad: bright >= 4 };
  }
  const validPoint = p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite);
  function chart(game) {
    if (!flight(game)) return null;
    const w = game.world;
    // These are briefing/chart coordinates, never target objects or a live
    // identity overlay. A nearby strong return can still be the wrong site.
    let supplied = null;
    if (root.FlightRouteScene && typeof root.FlightRouteScene.chart === 'function') supplied = root.FlightRouteScene.chart(game);
    if (root.FlightStrikeScene && root.FlightStrikeScene.active(game)) supplied = root.FlightStrikeScene.chart(game);
    const raw = Array.isArray(supplied) ? supplied : supplied && supplied.features || [];
    const features = raw.filter(f => f && f.briefed === true && validPoint(f.p)).slice(0, 32).map(f => ({ id: String(f.id || ''), label: String(f.label || f.name || 'Briefed landmark').slice(0, 70), kind: String(f.kind || 'landmark'), p: f.p.slice(0, 3), signature: String(f.signature || '').slice(0, 200), points: Array.isArray(f.points) ? f.points.filter(validPoint).slice(0, 64).map(p => p.slice(0, 3)) : [] }));
    const bp = validPoint(w.briefed) ? w.briefed.slice(0, 3) : null;
    const route = (Array.isArray(w.route) ? w.route : []).filter(c => c && validPoint(c.p)).slice(0, 8).map(c => ({ label: String(c.label || 'Route fix'), hint: String(c.hint || ''), p: c.p.slice(0, 3) }));
    const oap = w.oap && validPoint(w.oap.p) ? { label: String(w.oap.label || 'Offset reference'), p: w.oap.p.slice(0, 3), bearing: finite(w.oap.brg), range: finite(w.oap.rng) } : null;
    const center = supplied && validPoint(supplied.center) ? supplied.center.slice(0, 3) : bp || oap && oap.p.slice() || route.at(-1)?.p.slice() || game.ac.p.slice();
    const radius = clamp(finite(supplied && supplied.radius, 6000), 2000, 16000);
    const sp = typeof w.sysPos === 'function' ? w.sysPos(center) : center;
    const shift = validPoint(sp) ? [sp[0] - center[0], 0, sp[2] - center[2]] : [0, 0, 0];
    return { title: String(supplied && supplied.title || 'Target-area chart'), center, radius, features, route, briefed: bp, briefedRadius: clamp(finite(w.briefedR, 300), 100, 1200), oap, ownship: [game.ac.p[0] - shift[0], 0, game.ac.p[2] - shift[2]], shift,
      note: 'Authored schematic / system navigation, not a satellite map. Chart marks do not slew the radar, identify a target or authorize release.' };
  }
  function chartPixel(c, p) { return [(p[0] - c.center[0]) / (c.radius * 2) + .5, (p[2] - c.center[2]) / (c.radius * 2) + .5]; }
  function pick(game, x, y) {
    if (!flight(game) || game.paused || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return false;
    const c = chart(game), s = state(game), p = [c.center[0] + (x - .5) * c.radius * 2, 0, c.center[2] + (y - .5) * c.radius * 2];
    if (s.pickMode === 'run-in') s.runIn = p; else { s.chartMark = p; s.comparison = null; }
    s.pickMode = 'candidate'; render(game); return true;
  }
  function setPickMode(game, mode) {
    if (!flight(game) || game.paused || !['candidate', 'run-in'].includes(mode)) return false;
    state(game).pickMode = mode; render(game); return true;
  }
  function recognition(game) {
    const c = chart(game); if (!c) return null;
    const s = state(game), selected = s.chartMark && s.chartMark.slice(), ip = s.runIn && s.runIn.slice();
    let runIn = null;
    if (selected && ip) {
      const dx = selected[0] - ip[0], dz = selected[2] - ip[2], length = Math.hypot(dx, dz), course = Math.atan2(dx, -dz);
      if (length >= 100) {
        const headingError = Math.atan2(Math.sin(course - game.ac.yaw), Math.cos(course - game.ac.yaw)) * RAD;
        const ax = c.ownship[0] - ip[0], az = c.ownship[2] - ip[2], crossTrack = ax * Math.cos(course) + az * Math.sin(course), remaining = length - (ax * Math.sin(course) - az * Math.cos(course));
        runIn = { course: d3(course * RAD), lengthNM: length / NM, headingError, crossTrackYd: crossTrack * 1.0936133, remainingNM: remaining / NM, altitudeFt: finite(game.ac.p[1]) * 3.2808399, speedKt: Math.hypot(...(game.ac.v || [0, 0, 0])) * 1.9438445 };
      }
    }
    return { chart: c, candidate: selected, runInPoint: ip, pickMode: s.pickMode, comparison: s.comparison && { ...s.comparison }, comparisons: s.comparisons, runIn };
  }
  function compare(game) {
    if (!flight(game) || game.paused) return { ok: false, reason: 'Resume flight to compare chart and echo.' };
    const s = state(game), c = chart(game), echo = sample(game);
    if (!s.chartMark) return { ok: false, reason: 'Tap the chart to mark a candidate position first.' };
    if (!echo.available) return { ok: false, reason: echo.reason };
    const ep = [echo.p[0] - c.shift[0], 0, echo.p[2] - c.shift[2]], dx = ep[0] - s.chartMark[0], dz = ep[2] - s.chartMark[2], residual = Math.hypot(dx, dz), close = residual <= Math.max(220, echo.rangeNM * NM * .025);
    const usable = echo.fresh && !game.world.blind && (echo.hard > .28 || echo.strength > .12);
    let reason = game.world.blind ? 'Coordinate attack: no visible target echo can confirm this chart mark.' : !echo.fresh ? 'Sweep is stale. Wait and compare the next real sweep.' : !usable ? 'Weak / dark return. Position alone does not establish a target.' : !close ? 'Echo and chart mark do not coincide. Check the landmark pattern and navigation fix before designation.' : 'Echo and chart position correlate. This is a working hypothesis; compare the pattern and briefing clearance before LOCK.';
    const result = { time: Math.round(finite(game.t) * 10) / 10, residualYd: residual * 1.0936133, eastYd: dx * 1.0936133, northYd: -dz * 1.0936133, fresh: !!echo.fresh, usable: !!usable, positionCorrelated: !!(close && usable), bearing: echo.bearing, rangeNM: echo.rangeNM, return: echo.description, reason };
    s.comparison = result; s.comparisons++; render(game); return { ok: true, ...result };
  }
  function snapshot(game) {
    if (!flight(game)) return null;
    const w = game.world, s = state(game), nav = w.nav || {}, score = w.score || {}, sol = game.sol;
    const cp = Array.isArray(w.route) && w.route[w.rtIdx];
    const err = typeof w.navErr === 'function' ? finite(w.navErr()) : Math.hypot(finite(nav.ex), finite(nav.ez));
    const designated = w.designated, cursor = sample(game), instructions = brief(game), recon = recognition(game);
    let step = 'search', next = 'Compare the briefed pattern with a fresh scope return. Drag the crosshairs or use arrow keys; X is the existing next-reference slew aid.';
    if (game.paused) { step = 'paused'; next = 'Worksheet paused. Resume the sortie to work the scope.'; }
    else if (game.ac.onDeck) { step = 'launch'; next = game.rightSeat ? 'Launch with the existing pilot. Review the chart and recognition clues before coast-in.' : 'Launch and stabilize the aircraft before working the scope.'; }
    else if (game.mis.type === 'carrier_only') { step = 'navigation'; next = 'Carrier practice: no attack stores or targets assigned. Monitor TACAN and fuel, follow the pattern, and prepare the existing recovery.'; }
    else if (game.mis.noRelease || game.mis.type === 'recce') { step = 'identify'; next = 'Weapons tight. Follow the assigned track and overfly contacts to obtain the existing identification photographs. Keep COMMIT released.'; }
    else if (game.mis.type === 'ironhand' && finite(score.armsReleased) > 0 && Array.isArray(w.arms) && w.arms.length > 0) { step = 'observe-arm'; next = w.arms.length + ' ARM missile(s) in flight · ' + finite(score.armsReleased) + ' launched. Maintain the threat/navigation scan. A launch is not confirmation of impact or destruction; emitter silence alone is not proof of a kill.'; }
    else if (game.willard && ['contact', 'defend', 'flak', 'egress'].includes(game.willard.phase)) { step = 'survival'; next = (game.willard.objective || 'Keep both crew alive and escape the interceptor.') + ' Close the worksheet for the threat scan; use LOOK AFT and the current B/N navigation cue. Retaining bombs does not mean another attack is required.'; }
    else if (game.egressCalled && !game.willard || finite(game.ac.bombs) === 0 && finite(game.ac.arms) === 0) { step = 'egress'; next = 'Stores expended: return feet wet and monitor fuel and TACAN. A flash is not confirmation that every target was destroyed.'; }
    else if (finite(game.ac.dmg && game.ac.dmg.diane) > .8) { step = 'failure'; next = 'DIANE damaged. Do not rely on this scope to identify or lock; use surviving navigation to return.'; }
    else if (cp && !designated) { step = 'fix'; next = 'Take the next radar fix before designation. Slew to the real checkpoint and LOCK; this updates navigation, not the attack target.'; }
    else if (w.oapLocked) { step = 'offset'; next = 'Offset reference locked. Leave the crosshairs on the reference and LOCK again to apply the briefed bearing and range.'; }
    else if (!designated && w.blind) { step = 'coordinates'; next = 'Take route fixes, then designate the briefed ring. No visible target return confirms this coordinate attack.'; }
    else if (designated) {
      if (!sol || !sol.valid) { step = 'solution'; next = 'Designation set; no valid release solution yet. Check heading, height and the run-in. B/N: C / STEER gives the existing pilot your crosshair steer.'; }
      else if (game._relArm === 0) { step = 'observe'; next = 'One ripple released on this run. Observe from the cockpit when visibility permits; compare the measured impacts in debrief. Do not orbit under fire just to watch.'; }
      else if (Math.abs(finite(sol.az)) >= .028) { step = 'align'; next = 'Center the steering needle before release. Give the pilot a useful steer and settle the run; consent cannot correct a cross-track error.'; }
      else { step = 'consent'; next = 'Hold COMMIT / Space when cleared; the existing ASQ-61 chooses release. Maintain the designation and the centered steering needle through the ripple.'; }
    }
    if (game.mis.type === 'ironhand' && finite(game.ac.arms) > 0 && !game.paused && !game.ac.onDeck && step !== 'observe-arm') { step = 'arm'; next = (finite(score.armsReleased) > 0 ? finite(score.armsReleased) + ' ARM launched. ' : '') + (w.radar && w.radar.alive && w.radar.emitting ? 'Existing A-6B Iron Hand sortie: emitter is transmitting. COMMIT fires the existing ARM; it does not fire a gun.' : 'Existing A-6B Iron Hand sortie: emitter is silent. Watch the seeker/threat indication; this worksheet cannot produce a shot.'); }
    const bpoint = w.briefed && typeof w.sysPos === 'function' ? w.sysPos(w.briefed) : null;
    return { step, next, brief: instructions, cursor, recognition: recon, open: s.open, interpretation: s.interpretation, notes: s.notes.map(n => ({ ...n })),
      checkpoint: cp ? { label: cp.label, ...relative(game, cp.p) } : null, fixes: finite(nav.fixes), navErrorYd: err * 1.0936133,
      briefed: bpoint ? relative(game, bpoint) : null, offset: w.oap ? { label: w.oap.label, bearing: d3(w.oap.brg), yards: Math.round(w.oap.rng * 1.0936133) } : null,
      designated: designated ? { label: designated.label || 'Designation', ...relative(game, designated.p), offset: !!designated.offset } : null,
      solution: sol ? { valid: !!sol.valid, releaseSeconds: finite(sol.tRel), azimuthDeg: finite(sol.az) * RAD, flightSeconds: finite(sol.tof) } : null,
      stores: { bombs: finite(game.ac.bombs), bombsMax: finite(game.bombsMax, finite(game.ac.bombs)), arms: finite(game.ac.arms), ripple: finite(game.ripple), released: releases(score), bombsReleased: finite(score.dropped), armsReleased: finite(score.armsReleased) },
      score: { hits: finite(score.hits), misses: finite(score.misses), killed: finite(score.killed) },
      note: 'Player worksheet · reconstructed gameplay guidance, not authentic crew dialogue or an extra target-identification instrument.' };
  }
  function setOpen(game, value) { if (!game || !flight(game)) return false; state(game).open = !!value; render(game); return true; }
  function interpret(game, value) { if (!flight(game) || game.paused || !choices.some(c => c[0] === value)) return false; state(game).interpretation = value; return true; }
  function mark(game) {
    if (!flight(game) || game.paused) return { ok: false, reason: 'Resume flight before recording a correlation.' };
    const s = state(game), c = sample(game);
    if (!c.available) return { ok: false, reason: c.reason };
    if (!c.fresh && !game.world.blind) return { ok: false, reason: 'Wait for a fresh sweep before recording this echo.' };
    if (s.interpretation === 'unknown') return { ok: false, reason: 'Select your interpretation. Uncertain returns can be left undesignated.' };
    const note = { time: Math.round(finite(game.t) * 10) / 10, interpretation: s.interpretation, bearing: c.bearing, rangeNM: c.rangeNM, return: c.description, designation: null };
    s.notes.push(note); if (s.notes.length > 10) s.notes.shift(); s.samples++;
    render(game); return { ok: true, note: { ...note }, reason: 'Correlation recorded as your judgment. It does not authorize a release or confirm identity.' };
  }
  function designate(game) {
    if (!flight(game) || game.paused || !context || !context.App || context.App.game !== game || !game.hud || !game.hud.scope || finite(game.ac.dmg && game.ac.dmg.diane) > .8) return false;
    if (typeof context.App.lockTarget !== 'function') return false;
    context.App.lockTarget();
    const last = state(game).notes.at(-1); if (last && game.world.designated) last.designation = game.world.designated.label || 'Manual point';
    render(game); return true;
  }
  function tick(game, dt) {
    if (!flight(game)) { render(game); return null; }
    const s = state(game), score = game.world.score || {};
    if (!game.paused) {
      s.elapsed += clamp(finite(dt), 0, .25);
      const released = releases(score), impacts = finite(score.hits) + finite(score.misses);
      if (released > s.lastReleased) s.releaseCount += released - s.lastReleased;
      if (impacts > s.lastImpacts) s.impacts += impacts - s.lastImpacts;
      s.lastReleased = released; s.lastImpacts = impacts;
    }
    s.renderWait += clamp(finite(dt), 0, .25);
    if (s.renderWait >= .15 || !ui) { s.renderWait = 0; render(game); }
    return snapshot(game);
  }
  function bindButton(n, fn) {
    // Same released-touch policy as the tested POW controls. A canvas drag
    // can suppress a later compatibility click; a real released tap must
    // still work once, without converting scrolls or cancellations to taps.
    let press = null, touchClickUntil = 0;
    n.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || n.disabled) return;
      if (press && press.id !== event.pointerId) { press.moved = true; return; }
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    });
    n.addEventListener('pointermove', event => {
      if (press && press.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) press.moved = true;
    });
    n.addEventListener('pointercancel', () => { if (press) touchClickUntil = Date.now() + 700; press = null; });
    n.addEventListener('pointerup', event => {
      const p = press; if (!p) return;
      touchClickUntil = Date.now() + 700;
      if (p.id !== event.pointerId) { p.moved = true; return; }
      press = null; if (n.disabled) return;
      const r = n.getBoundingClientRect();
      if (p.moved || event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) return;
      fn.call(n, event);
    });
    n.onclick = event => {
      const touchClick = event.pointerType === 'touch' || event.sourceCapabilities && event.sourceCapabilities.firesTouchEvents || !event.pointerType && !event.sourceCapabilities;
      if (n.disabled || event.detail > 0 && touchClick && Date.now() < touchClickUntil) return;
      fn.call(n, event);
    };
    return n;
  }
  const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
  const write = (n, value) => { if (n.textContent !== value) n.textContent = value; };
  function mount() {
    if (ui || typeof document === 'undefined') return ui;
    const host = document.getElementById('game'); if (!host) return null;
    const box = el('section'); box.id = 'flightStrikeBoard'; box.hidden = true;
    const toggle = el('button', 'B/N worksheet'); toggle.id = 'flightStrikeBoardToggle'; toggle.type = 'button'; toggle.setAttribute('data-strike-toggle', ''); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'flightStrikePanel');
    const panel = el('div'); panel.id = 'flightStrikePanel'; panel.hidden = true;
    const heading = el('strong', 'B/N target correlation');
    const target = el('p'), pattern = el('p'), diagram = el('div'); diagram.className = 'strike-pattern'; diagram.setAttribute('aria-hidden', 'true'); diagram.setAttribute('title', 'Briefed recognition sketch · schematic, not a live map');
    for (let i = 0; i < 6; i++) diagram.append(el('i'));
    const chartWrap = el('div'); chartWrap.className = 'strike-chart-wrap';
    const chartTitle = el('strong', 'Target-area chart · north up'), canvas = el('canvas'); canvas.id = 'flightStrikeChart'; canvas.tabIndex = 0; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Target-area chart. Tap to mark a candidate; arrow keys move the mark and Enter compares the radar echo.');
    const chartHint = el('p', 'Tap chart: candidate · select RUN-IN then tap an initial point. Slew the radar independently and COMPARE ECHO.'); chartHint.className = 'strike-chart-hint';
    const chartActions = el('div'); chartActions.className = 'strike-actions'; const candidate = el('button', 'CANDIDATE'), runIn = el('button', 'RUN-IN'), compareEcho = el('button', 'COMPARE ECHO');
    for (const [button, attr] of [[candidate, 'data-strike-candidate'], [runIn, 'data-strike-run-in'], [compareEcho, 'data-strike-compare']]) { button.type = 'button'; button.setAttribute(attr, ''); chartActions.append(button); }
    const comparison = el('p'), runInReadout = el('p'); comparison.setAttribute('data-strike-comparison', ''); runInReadout.setAttribute('data-strike-run-in-readout', '');
    chartWrap.append(chartTitle, canvas, chartHint, chartActions, comparison, runInReadout);
    const roe = el('p'), navigation = el('p'), cursor = el('p'), solution = el('p'), next = el('p'), status = el('p'); status.setAttribute('role', 'status'); status.className = 'strike-status';
    target.setAttribute('data-strike-target', ''); pattern.setAttribute('data-strike-pattern', ''); cursor.setAttribute('data-strike-cursor', ''); solution.setAttribute('data-strike-solution', ''); next.setAttribute('data-strike-next', '');
    const selectLabel = el('label', 'My interpretation '), select = el('select'); select.id = 'flightStrikeInterpretation'; select.setAttribute('data-strike-interpretation', '');
    for (const [value, label] of choices) { const option = el('option', label); option.value = value; select.append(option); }
    selectLabel.append(select);
    const actions = el('div'); actions.className = 'strike-actions';
    const scope = el('button', 'SCOPE'), record = el('button', 'NOTE'), lock = el('button', 'LOCK');
    scope.setAttribute('data-strike-scope', ''); record.setAttribute('data-strike-mark', ''); lock.setAttribute('data-strike-lock', '');
    for (const button of [scope, record, lock]) { button.type = 'button'; actions.append(button); }
    const note = el('small', 'Authored worksheet. Echoes do not prove identity. Close this panel to keep the radar and flight controls clear.');
    panel.append(heading, target, chartWrap, diagram, pattern, roe, navigation, cursor, selectLabel, actions, status, solution, next, note); box.append(toggle, panel); host.append(box);
    const current = () => context && context.App && context.App.game;
    const nativeAction = fn => event => { event.stopPropagation(); fn(current()); event.currentTarget.blur(); };
    bindButton(candidate, nativeAction(g => setPickMode(g, 'candidate')));
    bindButton(runIn, nativeAction(g => setPickMode(g, 'run-in')));
    bindButton(compareEcho, nativeAction(g => { const result = compare(g); write(status, result.reason); }));
    let chartPress = null;
    canvas.addEventListener('pointerdown', event => { if (chartPress) { chartPress.moved = true; return; } chartPress = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; });
    canvas.addEventListener('pointermove', event => { if (chartPress && chartPress.id === event.pointerId && Math.hypot(event.clientX - chartPress.x, event.clientY - chartPress.y) > 12) chartPress.moved = true; });
    canvas.addEventListener('pointercancel', () => { chartPress = null; });
    canvas.addEventListener('pointerup', event => { const press = chartPress; chartPress = null; if (!press || press.moved || press.id !== event.pointerId) return; const r = canvas.getBoundingClientRect(); if (r.width > 0 && r.height > 0) pick(current(), (event.clientX - r.left) / r.width, (event.clientY - r.top) / r.height); canvas.blur(); });
    canvas.addEventListener('keydown', event => { event.stopPropagation(); const g = current(); if (!flight(g)) return; const s = state(g), c = chart(g), p = s.pickMode === 'run-in' ? s.runIn : s.chartMark, uv = p ? chartPixel(c, p) : [.5, .5], arrows = { ArrowLeft: [-.025, 0], ArrowRight: [.025, 0], ArrowUp: [0, -.025], ArrowDown: [0, .025] }; if (arrows[event.key]) { event.preventDefault(); const delta = arrows[event.key]; pick(g, clamp(uv[0] + delta[0], 0, 1), clamp(uv[1] + delta[1], 0, 1)); } else if (event.key === 'Enter') { event.preventDefault(); const result = compare(g); write(status, result.reason); } else if (event.key === ' ') event.preventDefault(); });
    canvas.addEventListener('keyup', event => event.stopPropagation());
    bindButton(toggle, nativeAction(g => { if (g) setOpen(g, !state(g).open); }));
    bindButton(scope, nativeAction(g => { if (flight(g) && !g.paused && context && typeof context.App.toggleScope === 'function') context.App.toggleScope(); render(g); }));
    select.onchange = event => { event.stopPropagation(); interpret(current(), select.value); };
    bindButton(record, nativeAction(g => { const r = mark(g); write(status, r.reason); }));
    bindButton(lock, nativeAction(g => { const ok = designate(g); write(status, ok ? 'Existing LOCK applied at your crosshairs. Check the designation and clearance before consent.' : 'Open a working scope and resume flight to designate.'); }));
    box.addEventListener('pointerdown', e => e.stopPropagation()); box.addEventListener('pointerup', e => e.stopPropagation());
    // Form selection must not leak arrows/Space/Enter into aircraft or weapons
    // controls. Buttons blur after native clicks so Space remains consent.
    select.addEventListener('keydown', e => e.stopPropagation()); select.addEventListener('keyup', e => e.stopPropagation());
    box.addEventListener('keydown', e => { if (e.target && ['BUTTON', 'SELECT', 'OPTION'].includes(e.target.tagName)) e.stopPropagation(); });
    box.addEventListener('keyup', e => { if (e.target && ['BUTTON', 'SELECT', 'OPTION'].includes(e.target.tagName)) e.stopPropagation(); });
    ui = { box, toggle, panel, target, pattern, diagram, roe, navigation, cursor, solution, next, status, select, scope, record, lock, chartWrap, chartTitle, canvas, chartHint, candidate, runIn, compareEcho, comparison, runInReadout }; return ui;
  }
  function drawChart(u, game, d) {
    if (!u.canvas || typeof u.canvas.getContext !== 'function') return;
    const ctx = u.canvas.getContext('2d'); if (!ctx) return;
    const rec = d.recognition, c = rec.chart, width = Math.round(u.canvas.clientWidth || 280), height = Math.round(u.canvas.clientHeight || 156), ratio = Math.min(2, root.devicePixelRatio || 1);
    if (u.canvas.width !== Math.round(width * ratio) || u.canvas.height !== Math.round(height * ratio)) { u.canvas.width = Math.round(width * ratio); u.canvas.height = Math.round(height * ratio); }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#10201f'; ctx.fillRect(0, 0, width, height);
    const xy = p => { const uv = chartPixel(c, p); return [uv[0] * width, uv[1] * height]; };
    ctx.strokeStyle = '#29423c'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 1; i < 4; i++) { ctx.moveTo(width * i / 4, 0); ctx.lineTo(width * i / 4, height); ctx.moveTo(0, height * i / 4); ctx.lineTo(width, height * i / 4); } ctx.stroke();
    const pathLine = (points, color, dash = []) => { if (points.length < 2) return; ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.beginPath(); points.forEach((p, i) => { const q = xy(p); if (i) ctx.lineTo(...q); else ctx.moveTo(...q); }); ctx.stroke(); ctx.setLineDash([]); };
    pathLine(c.route.map(r => r.p).concat(c.briefed ? [c.briefed] : []), '#a39970', [4, 4]);
    ctx.font = '9px system-ui';
    for (const f of c.features) {
      const color = /river|water|coast/.test(f.kind) ? '#75b8c6' : /rail/.test(f.kind) ? '#d3bf91' : '#afbfa1';
      pathLine(f.points, color, /rail/.test(f.kind) ? [5, 2] : []); const q = xy(f.p);
      if (q[0] < 4 || q[0] > width - 4 || q[1] < 8 || q[1] > height - 5) continue;
      ctx.strokeStyle = color; ctx.strokeRect(q[0] - 3, q[1] - 3, 6, 6); ctx.fillStyle = color; ctx.fillText(f.label, clamp(q[0] + 5, 4, width - 82), clamp(q[1] - 6, 11, height - 5), 105);
    }
    if (c.briefed) { const q = xy(c.briefed); ctx.strokeStyle = '#cbbc82'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.ellipse(q[0], q[1], Math.max(8, c.briefedRadius / (2 * c.radius) * width), Math.max(6, c.briefedRadius / (2 * c.radius) * height), 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    for (const fix of c.route) { const q = xy(fix.p); ctx.fillStyle = '#b8af83'; ctx.fillRect(q[0] - 2, q[1] - 2, 4, 4); }
    if (c.oap) { const q = xy(c.oap.p); ctx.strokeStyle = '#dfbe7d'; ctx.strokeRect(q[0] - 5, q[1] - 5, 10, 10); ctx.fillStyle = '#dfbe7d'; ctx.fillText('OAP', q[0] + 6, q[1] + 10); }
    if (rec.candidate && rec.runInPoint) pathLine([rec.runInPoint, rec.candidate], '#e6d88c', [6, 3]);
    if (rec.runInPoint) { const q = xy(rec.runInPoint); ctx.fillStyle = '#e6d88c'; ctx.fillText('IP', q[0] + 5, q[1] - 5); ctx.fillRect(q[0] - 2, q[1] - 2, 4, 4); }
    if (rec.candidate) { const q = xy(rec.candidate); ctx.strokeStyle = '#ffcb69'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q[0] - 7, q[1]); ctx.lineTo(q[0] + 7, q[1]); ctx.moveTo(q[0], q[1] - 7); ctx.lineTo(q[0], q[1] + 7); ctx.stroke(); ctx.lineWidth = 1; }
    if (d.cursor.available) { const ep = [d.cursor.p[0] - c.shift[0], 0, d.cursor.p[2] - c.shift[2]], q = xy(ep); ctx.strokeStyle = '#b1e4b3'; ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, Math.PI * 2); ctx.stroke(); }
    const own = xy(c.ownship); if (own[0] >= 0 && own[0] <= width && own[1] >= 0 && own[1] <= height) { ctx.save(); ctx.translate(...own); ctx.rotate(game.ac.yaw); ctx.strokeStyle = '#e6eee1'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-4, 5); ctx.lineTo(0, 2); ctx.lineTo(4, 5); ctx.closePath(); ctx.stroke(); ctx.restore(); }
    ctx.fillStyle = '#d8e0c9'; ctx.fillText('N ↑', 6, 12); ctx.fillText((c.radius * 2 / NM).toFixed(1) + ' NM across', width - 92, height - 6);
  }
  function render(game) {
    const u = mount(); if (!u) return;
    const visible = flight(game) && !game.paused; u.box.hidden = !visible;
    if (!visible) { u.panel.hidden = true; return; }
    const d = snapshot(game); if (!d) return;
    const teaching = document.getElementById('teach'), knee = document.getElementById('knee');
    const covered = !!(teaching && teaching.classList.contains('on') || knee && knee.classList.contains('on'));
    u.box.hidden = covered; u.panel.hidden = !d.open; u.toggle.setAttribute('aria-expanded', String(d.open)); u.toggle.textContent = d.open ? 'Close B/N worksheet' : 'B/N worksheet';
    u.box.dataset.step = d.step; u.box.dataset.pattern = d.brief.expected; u.diagram.dataset.pattern = d.brief.expected;
    const rec = d.recognition, comparison = rec.comparison;
    write(u.chartTitle, rec.chart.title + ' · north up');
    write(u.chartHint, rec.pickMode === 'run-in' ? 'Tap a safe initial point for your chosen run-in. This plots a course; the pilot and ASQ-61 remain under existing controls.' : 'Tap chart: candidate (+). Green circle: independent scope cursor. RUN-IN then tap: planned initial point. No automatic designation.');
    write(u.comparison, comparison ? 'COMPARE · ' + Math.round(comparison.residualYd) + ' yd separation · echo ' + Math.round(Math.abs(comparison.eastYd)) + ' yd ' + (comparison.eastYd < 0 ? 'W' : 'E') + ' / ' + Math.round(Math.abs(comparison.northYd)) + ' yd ' + (comparison.northYd < 0 ? 'S' : 'N') + ' · ' + comparison.reason : rec.candidate ? 'Chart candidate marked. Slew the actual scope to the return independently; COMPARE ECHO measures agreement without identifying it.' : 'Mark the chart candidate, then compare an independently selected radar echo.');
    write(u.runInReadout, rec.runIn ? 'PLANNED RUN · ' + rec.runIn.course + '° / ' + rec.runIn.lengthNM.toFixed(1) + ' NM · ' + Math.round(Math.abs(rec.runIn.headingError)) + '° ' + (rec.runIn.headingError < 0 ? 'left' : 'right') + ' of present heading · cross-track ' + Math.round(Math.abs(rec.runIn.crossTrackYd)) + ' yd ' + (rec.runIn.crossTrackYd < 0 ? 'left' : 'right') + ' of track · ' + rec.runIn.remainingNM.toFixed(1) + ' NM to mark. Plan only: check clearance and use the existing steering needle / ASQ-61.' : 'RUN-IN plots your approach from an initial point to the chart mark. It does not steer the aircraft or calculate a bomb release.');
    u.candidate.setAttribute('aria-pressed', String(rec.pickMode === 'candidate')); u.runIn.setAttribute('aria-pressed', String(rec.pickMode === 'run-in')); u.compareEcho.disabled = !rec.candidate || !d.cursor.available; if (d.open) drawChart(u, game, d);
    write(u.target, d.brief.target); write(u.pattern, d.brief.pattern); write(u.roe, 'CLEARANCE · ' + d.brief.roe + ' ' + d.brief.observation);
    const cp = d.checkpoint, bp = d.briefed;
    write(u.navigation, 'NAV · SYS ERR ' + Math.round(d.navErrorYd) + ' yd · ' + d.fixes + ' fixes' + (cp ? ' · next ' + cp.label + ' ' + cp.bearing + '° / ' + cp.rangeNM.toFixed(1) + ' NM' : ' · route fixes complete') + (bp ? ' · briefed ' + bp.bearing + '° / ' + bp.rangeNM.toFixed(1) + ' NM (system position)' : ''));
    write(u.cursor, d.cursor.available ? 'CROSSHAIRS · ' + d.cursor.bearing + '° / ' + d.cursor.rangeNM.toFixed(2) + ' NM · ' + d.cursor.description : d.cursor.reason);
    write(u.solution, 'STORES · ' + d.stores.bombs + ' bombs · ' + d.stores.arms + ' ARM remaining · ' + d.stores.bombsReleased + ' bombs dropped · ' + d.stores.armsReleased + ' ARM launched · ' + d.stores.ripple + '-bomb ripple' + (d.designated ? '\nDESIGNATION · ' + d.designated.label : '\nDESIGNATION · none') + (d.solution && d.solution.valid ? '\nASQ-61 · ' + Math.max(0, d.solution.releaseSeconds).toFixed(1) + ' s to solution · ' + d.solution.azimuthDeg.toFixed(1) + '° steering error' : '\nASQ-61 · no valid bomb-release solution'));
    write(u.next, d.next); u.select.value = d.interpretation;
    u.scope.disabled = !!game.paused; u.select.disabled = !!game.paused; u.record.disabled = !!game.paused || !d.cursor.available || !d.cursor.fresh && !game.world.blind;
    u.lock.disabled = !!game.paused || !d.cursor.available;
  }
  function debrief(game) {
    const s = game && states.get(game); if (!s || !s.samples && !s.comparisons) return null;
    const score = game.world && game.world.score || {}, cep = Array.isArray(score.cep) ? score.cep.filter(Number.isFinite) : [];
    const lines = s.notes.map(n => n.time.toFixed(1) + ' s · ' + (choices.find(c => c[0] === n.interpretation) || ['', n.interpretation])[1] + ' · ' + n.bearing + '° / ' + n.rangeNM.toFixed(2) + ' NM · ' + n.return + (n.designation ? ' → ' + n.designation : ' · not designated from this note'));
    if (s.comparison) lines.push(s.comparison.time.toFixed(1) + ' s · chart / echo comparison · ' + Math.round(s.comparison.residualYd) + ' yd separation · ' + s.comparison.reason);
    return { title: 'Right-seat attack worksheet', correlations: s.samples, chartComparisons: s.comparisons, lines, released: releases(score), bombsReleased: finite(score.dropped), armsReleased: finite(score.armsReleased), impacts: finite(score.hits) + finite(score.misses), killed: finite(score.killed),
      meanMissYd: cep.length ? cep.reduce((a, b) => a + b, 0) / cep.length * 1.0936133 : null,
      note: 'Player interpretations are working hypotheses, not historical testimony or independently confirmed target identities. Weapon-impact measurements come from the existing simulation and do not establish what the crew could see. ARM launches are counted separately and do not establish a missile hit or radar kill.' };
  }
  function appendDebrief(game) {
    const d = debrief(game); if (!d || typeof document === 'undefined') return false;
    const host = document.getElementById('debriefBody'); if (!host || host.querySelector('[data-strike-report]')) return false;
    const box = el('section'); box.className = 'note'; box.setAttribute('data-strike-report', ''); box.append(el('h3', d.title), el('p', d.correlations + ' correlations noted · ' + (d.chartComparisons || 0) + ' chart / echo comparisons · ' + d.released + ' stores expended (' + d.bombsReleased + ' bombs dropped / ' + d.armsReleased + ' ARM launched) · ' + d.impacts + ' weapon impacts measured' + (d.meanMissYd === null ? '' : ' · mean recorded miss ' + Math.round(d.meanMissYd) + ' yd')));
    for (const line of d.lines) box.append(el('p', line)); box.append(el('small', d.note)); host.append(box); return true;
  }
  root.FlightStrikeBoard = { install(ctx) { if (!ctx || !ctx.App) return false; context = ctx; mount(); return true; }, tick, render, snapshot, sample, brief, mark, designate, interpret, setOpen, debrief, appendDebrief, chart, chartPixel, pick, setPickMode, recognition, compare,
    reset(game) { if (!game) return false; states.delete(game); render(game); return true; },
    choices: choices.map(c => c.slice()), units: { range: 'NM = 1852 m', bearings: 'degrees true in the existing game', systemError: 'yd', time: 'simulation seconds' } };
})(window);
