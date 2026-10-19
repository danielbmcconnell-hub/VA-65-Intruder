/* Optional Dixie B/N approaches and visual ground-gun acquisition.
 * Routes are authored from the EXISTING chart fixes and actual terrain.
 * The original pilot, ASQ, gun bursts, damage and mission result still decide
 * the sortie. This module never moves an aircraft or invents a target lock. */
(function (root) {
  'use strict';
  const VERSION = 1, SAMPLE_COUNT = 12, SAMPLE_INTERVAL = .25, SEARCH_SECONDS = 4;
  let context = null, ui = null;
  const copy = v => JSON.parse(JSON.stringify(v));
  const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const bearing = (a, b) => Math.atan2(b[0] - a[0], -(b[2] - a[2]));
  const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
  const height = (x, z) => { const h = context && context.terrainH(x, z); return Number.isFinite(h) ? Math.max(0, h) : 0; };
  function eligible(g) { return !!(g && g.mis && g.mis.id === 'm2' && g.strikeExperience && g.ac && g.world); }
  function active(g) {
    const app = context && context.App || g && g.app;
    return eligible(g) && (!app || app.game === g && app.screen === 'game' && !app.graphicsContextLost) &&
      g.ac.alive && !g.result && !g.evade && !g.pow && !g.chute && !g.ejected && !['dead', 'done'].includes(g.phase);
  }
  function terrainPeak(a, b) {
    let peak = 0;
    for (let i = 0; i <= 12; i++) { const u = i / 12; peak = Math.max(peak, height(a[0] + (b[0] - a[0]) * u, a[2] + (b[2] - a[2]) * u)); }
    return peak;
  }
  function route(id, label, clearance, points, start) {
    let length = 0, maxTerrain = 0, prev = start;
    for (const p of points) { length += distance(prev, p.p); maxTerrain = Math.max(maxTerrain, terrainPeak(prev, p.p)); prev = p.p; }
    return { id, label, clearance, points, length, maxTerrain };
  }
  function makeRoutes(g) {
    const w = g.world, start = point(w.carrier && w.carrier.p) ? w.carrier.p : g.ac.p;
    let fixes = (w.route || []).filter(f => f && point(f.p)).slice(0, 6).map(f => ({ p: f.p.slice(), label: String(f.label || 'CHART FIX').slice(0, 60) }));
    if (!fixes.length && point(w.ipoint)) fixes = [{ p: w.ipoint.slice(), label: 'INITIAL POINT' }];
    const direct = route('direct', 'DIRECT CHART FIXES', 700, fixes, start), low = [];
    let previous = start;
    for (let i = 0; i < fixes.length; i++) {
      const fix = fixes[i], len = distance(previous, fix.p);
      // Keep the original coast-in unmodified. Inland legs get a real,
      // surveyed dogleg; choose the lower of the two terrain corridors.
      if (i > 0 && len > 1800) {
        const dx = (fix.p[0] - previous[0]) / len, dz = (fix.p[2] - previous[2]) / len;
        const offset = clamp(len * .30, 1500, 3100), options = [-1, 1].map(side => {
          const x = (previous[0] + fix.p[0]) * .5 - dz * offset * side;
          const z = (previous[2] + fix.p[2]) * .5 + dx * offset * side, p = [x, height(x, z), z];
          return { p, peak: Math.max(terrainPeak(previous, p), terrainPeak(p, fix.p)) };
        });
        options.sort((a, b) => a.peak - b.peak);
        low.push({ p: options[0].p, label: 'LOW TERRAIN CORNER ' + i });
      }
      low.push(copy(fix)); previous = fix.p;
    }
    return { direct, terrain: route('terrain', 'LOW TERRAIN DOGLEG', 320, low, start) };
  }
  function validState(s, count) {
    return s && s.version === VERSION && ['direct', 'terrain'].includes(s.choice) && typeof s.following === 'boolean' &&
      Number.isSafeInteger(s.leg) && s.leg >= 0 && s.leg <= 12 && Number.isFinite(s.time) && s.time >= 0 &&
      s.routes && ['direct', 'terrain'].every(id => { const r = s.routes[id]; return r && r.id === id &&
        [320, 700].includes(r.clearance) && Number.isFinite(r.length) && r.length >= 0 && Number.isFinite(r.maxTerrain) &&
        Array.isArray(r.points) && r.points.length <= 12 && r.points.every(p => p && point(p.p) && typeof p.label === 'string'); }) &&
      Array.isArray(s.guns) && s.guns.length <= 16 && s.guns.length === count && s.guns.every(s => s &&
        ['unaware', 'acquire', 'track', 'search'].includes(s.mode) && Number.isFinite(s.confidence) && s.confidence >= 0 && s.confidence <= 1 &&
        Number.isFinite(s.checkedAt) && Number.isFinite(s.lastSeen) && typeof s.visible === 'boolean' && (s.lastPosition === null || point(s.lastPosition)));
  }
  function begin(g) {
    if (!eligible(g)) return false;
    const count = Math.min(16, (g.world.threats || []).length), previous = g.strikeExperience.tactical;
    if (!validState(previous, count)) g.strikeExperience.tactical = {
      version: VERSION, choice: 'direct', following: false, leg: 0, time: 0, lastCommand: null,
      status: 'Choose a route if you want the pilot to follow the chart fixes. Radar fixes and target identification remain your job.',
      routes: makeRoutes(g), guns: Array.from({ length: count }, () => ({ mode: 'unaware', confidence: 0, visible: false, checkedAt: -100, lastSeen: -100, lastPosition: null }))
    };
    // Lifetime ownership is not a save field. Keep it non-enumerable so the
    // original World's diagnostic JSON never gains a circular Game reference.
    Object.defineProperty(g.world, '_tacticalGame', { value: g, writable: true, configurable: true, enumerable: false });
    render(g); return true;
  }
  function choose(g, id, follow = true) {
    if (!active(g) || g.paused || g.egressCalled || g.world.designated || !['direct', 'terrain'].includes(id)) return false;
    const s = g.strikeExperience.tactical;
    if (!s || !s.routes[id].points.length) return false;
    s.choice = id; s.following = !!follow; s.leg = 0;
    // A short practice can start inside coast-in: pick the next chart fix
    // ahead along the published route instead of turning back out to sea.
    let nearest = 0, best = Infinity;
    for (let i = 0; i < s.routes[id].points.length; i++) {
      const d = distance(g.ac.p, s.routes[id].points[i].p); if (d < best) { best = d; nearest = i; }
    }
    s.leg = nearest; s.status = id === 'terrain' ? 'Lower dogleg: 320 m clearance, more observation and tighter terrain margins. Fix the ORIGINAL chart checkpoints.' : 'Direct route: 700 m clearance and fewer turns, with greater exposure above the terrain.';
    if (s.following) command(g); render(g); return true;
  }
  function command(g) {
    const s = g.strikeExperience.tactical, r = s.routes[s.choice], next = r.points[s.leg];
    if (!next || g.world.designated || g.egressCalled || !g.rightSeat || g.ac.crew && g.ac.crew.pilot <= 0) return false;
    g.steer = bearing(g.ac.p, next.p); g.apAGL = r.clearance; s.lastCommand = g.steer; return true;
  }
  function steer(g, on = true) {
    if (!active(g) || g.paused || !g.strikeExperience.tactical) return false;
    const s = g.strikeExperience.tactical;
    if (on) return choose(g, s.choice, true);
    s.following = false; s.lastCommand = null; s.status = 'Your steers. Original radar navigation and terrain-following pilot remain available.'; render(g); return true;
  }
  function tick(g, dt) {
    if (!active(g) || g.paused || !Number.isFinite(dt) || dt <= 0) { render(g); return; }
    const s = g.strikeExperience.tactical; if (!s) return;
    s.time += dt;
    if (s.following && !g.ac.onDeck) {
      if (g.world.designated || g.egressCalled || !g.rightSeat || g.ac.crew && g.ac.crew.pilot <= 0) {
        s.following = false; s.lastCommand = null;
        if (g.world.designated && !g.egressCalled) g.apAGL = 700;
        s.status = 'Route handed back to the original attack or recovery pilot. Your designation and release still decide the attack.';
      } else if (Number.isFinite(s.lastCommand) && Number.isFinite(g.steer) && Math.abs(angle(g.steer - s.lastCommand)) > .025) {
        s.following = false; s.lastCommand = null; s.status = 'Your new steer overrides route guidance.';
      } else {
        const r = s.routes[s.choice], next = r.points[s.leg];
        if (next && distance(g.ac.p, next.p) < 700) s.leg++;
        if (s.leg >= r.points.length) {
          s.following = false; s.lastCommand = null; g.apAGL = 700;
          s.status = 'Initial point reached. Attack clearance 700 m. Compare the chart and actual radar, identify, designate and hold COMMIT.';
        } else command(g);
      }
    }
    render(g);
  }
  function lineOfSight(gun, ac) {
    const a = [gun.p[0], gun.p[1] + 2.5, gun.p[2]], b = ac.p;
    for (let i = 1; i <= SAMPLE_COUNT; i++) {
      const u = i / (SAMPLE_COUNT + 1), x = a[0] + (b[0] - a[0]) * u, z = a[2] + (b[2] - a[2]) * u;
      if (height(x, z) > a[1] + (b[1] - a[1]) * u - .5) return false;
    }
    return true;
  }
  function gate(world, gun, ac, dt) {
    const g = world && world._tacticalGame;
    if (!eligible(g)) return true; // All pre-existing ordinary missions unchanged.
    if (!active(g) || g.paused || ac !== g.ac || !Number.isFinite(dt) || dt <= 0) return false;
    const s = g.strikeExperience.tactical, i = world.threats.indexOf(gun), state = s && s.guns[i];
    if (!state || !gun.alive || !point(gun.p) || !point(ac.p)) return false;
    const now = Number.isFinite(world.t) ? world.t : s.time, d = distance(gun.p, ac.p);
    const inRange = ac.alive && d < gun.rng && ac.radalt > 20 && ac.radalt < gun.alt;
    // Sampling at four Hz bounds work. A ready, acquired gun ALWAYS checks
    // again before a burst, so cached sight cannot shoot through a ridge.
    const ready = state.mode === 'track' && gun.cool <= dt;
    if (!inRange) state.visible = false;
    else if (now - state.checkedAt >= SAMPLE_INTERVAL || ready) {
      state.visible = lineOfSight(gun, ac); state.checkedAt = now;
      if (state.visible) { state.lastSeen = now; state.lastPosition = ac.p.slice(); }
    }
    if (state.visible && inRange) {
      const acquisition = 1.05 + clamp(d / Math.max(1, gun.rng), 0, 1) * .8 + clamp(g.mis.env && g.mis.env.fog || 0, 0, 1) * .4;
      state.confidence = clamp(state.confidence + dt / acquisition, 0, 1);
      state.mode = state.confidence >= .85 ? 'track' : 'acquire';
      // The very first acquired burst needs the same current-LOS guarantee
      // as subsequent bursts; acquisition can finish between cadence checks.
      if (state.mode === 'track' && gun.cool <= dt && state.checkedAt !== now) {
        state.visible = lineOfSight(gun, ac); state.checkedAt = now;
        if (!state.visible) { state.mode = 'search'; return false; }
        state.lastSeen = now; state.lastPosition = ac.p.slice();
      }
      return state.mode === 'track';
    }
    state.confidence = clamp(state.confidence - dt * .55, 0, 1);
    state.mode = state.lastPosition && now - state.lastSeen < SEARCH_SECONDS ? 'search' : 'unaware';
    if (state.mode === 'unaware') { state.confidence = 0; state.lastPosition = null; }
    return false;
  }
  function routes(g) { return eligible(g) && g.strikeExperience.tactical ? copy(g.strikeExperience.tactical.routes) : null; }
  function inspect(g) {
    if (!eligible(g) || !g.strikeExperience.tactical) return null;
    const s = g.strikeExperience.tactical, r = s.routes[s.choice], p = r.points[s.leg];
    return copy({ choice: s.choice, following: s.following, leg: s.leg, route: r, status: s.status,
      next: p ? { ...p, distance: distance(g.ac.p, p.p), bearing: bearing(g.ac.p, p.p) } : null, guns: s.guns });
  }
  function bind(node, fn) {
    if (root.WillardPresentation && root.WillardPresentation.bindButton) root.WillardPresentation.bindButton(node, e => { if (e) e.stopPropagation(); node.blur(); fn(); });
    else node.addEventListener('click', e => { e.stopPropagation(); node.blur(); fn(); });
    node.addEventListener('click', () => node.blur());
  }
  function mount() {
    if (ui || typeof document === 'undefined') return;
    const host = document.getElementById('dixiePanel'), actions = host && host.querySelector('.dixie-actions');
    if (!host || !actions) return;
    const toggle = document.createElement('button'); toggle.id = 'dixieApproach'; toggle.type = 'button'; toggle.textContent = 'ROUTE';
    const panel = document.createElement('div'); panel.id = 'dixieApproachPanel'; panel.hidden = true;
    const note = document.createElement('p'), buttons = document.createElement('div'); buttons.className = 'tactical-route-buttons';
    for (const [id, label, fn] of [['dixieRouteDirect', 'FLY DIRECT · 700 m', g => choose(g, 'direct')], ['dixieRouteTerrain', 'FLY LOW DOGLEG · 320 m', g => choose(g, 'terrain')], ['dixieRouteFree', 'MY STEERS', g => steer(g, false)]]) {
      const b = document.createElement('button'); b.id = id; b.type = 'button'; b.textContent = label;
      bind(b, () => { const g = context && context.App && context.App.game; if (g) fn(g); panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }); buttons.append(b);
    }
    bind(toggle, () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); });
    panel.append(note, buttons); host.append(panel); actions.append(toggle); ui = { host, toggle, panel, note };
  }
  function render(g) {
    mount(); if (!ui) return;
    const show = active(g) && !g.paused && !g.egressCalled && !g.world.designated;
    ui.toggle.hidden = !show; if (!show) { ui.panel.hidden = true; return; }
    const v = inspect(g); if (!v) return;
    const next = v.next, hdg = next ? String(Math.round((next.bearing * 180 / Math.PI + 360) % 360)).padStart(3, '0') : '—';
    ui.toggle.textContent = v.following ? (v.choice === 'terrain' ? 'LOW ' : 'DIRECT ') + (next ? (next.distance / 1852).toFixed(1) + ' NM' : '') : 'ROUTE';
    ui.toggle.title = next && v.following ? next.label + ' · ' + hdg + ' degrees · ' + (next.distance / 1852).toFixed(1) + ' nautical miles' : 'Choose a terrain approach or use your own original radar steers';
    ui.toggle.setAttribute('aria-label', ui.toggle.title);
    ui.note.textContent = (v.following && next ? next.label + ' · ' + hdg + '° · ' + (next.distance / 1852).toFixed(1) + ' NM. ' : '') + v.status;
    const board = root.FlightStrikeBoard && root.FlightStrikeBoard.snapshot && root.FlightStrikeBoard.snapshot(g);
    if (board && board.open) ui.panel.hidden = true;
    ui.toggle.setAttribute('aria-expanded', String(!ui.panel.hidden));
  }
  function configure(c) { context = c || null; return !!(context && typeof context.terrainH === 'function'); }
  root.FlightTacticalApproach = Object.freeze({ configure, begin, tick, gate, render, inspect, routes, choose, steer,
    limits: Object.freeze({ samples: SAMPLE_COUNT, cadence: SAMPLE_INTERVAL, searchSeconds: SEARCH_SECONDS }) });
})(typeof window !== 'undefined' ? window : globalThis);
