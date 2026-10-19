/* A guided presentation of the ORIGINAL Dixie Station sortie. The original
 * radar, ASQ release gates, target damage, pilot and carrier wires decide it.
 * This module gives the B/N a readable task, observation and retry workflow. */
(function (root) {
  'use strict';
  const NM = 1852, RAD = 180 / Math.PI;
  const descriptions = {
    navigation: ['I · COAST-IN', 'Work the next charted fix. The pilot flies; you correct the navigation.'],
    acquire: ['II · FIND THE DEPOT', 'Compare the junction, service road and depot group with the chart and actual radar.'],
    'run-in': ['III · THE ATTACK', 'Check the designation, settle the needles and hold COMMIT through release.'],
    release: ['IV · BOMBS AWAY', 'The bombs are still in flight. Keep scanning; a release is not a confirmed hit.'],
    assess: ['V · WHAT DID WE HIT?', 'LOOK OUT toward your designation. Observe the aftermath, then choose another pass or HOME.'],
    egress: ['VI · FEET WET', 'Navigate toward the ship. Watch fuel and damage; recovery is still to be flown.'],
    recovery: ['VII · BRING THE CREW HOME', 'Monitor gear, hook and the ball. The original pilot/ACLS must catch a real wire.']
  };
  let context = null, installed = false, ui = null;
  const finite = (n, d = 0) => Number.isFinite(n) ? n : d;
  const point = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  const copy = v => JSON.parse(JSON.stringify(v));
  function eligible(g) { return !!(g && g.mis && g.mis.id === 'm2' && g.strikeExperience && g.ac && g.world); }
  function active(g) { return eligible(g) && (!context || context.App.game === g && context.App.screen === 'game' && !context.App.graphicsContextLost) && g.ac.alive && !g.result && !g.evade && !g.chute && !g.pow && !g.ejected && !['done', 'dead'].includes(g.phase); }
  function events(g, kind, detail) {
    const s = g.strikeExperience; s.events.push({ at: s.elapsed, kind, detail }); if (s.events.length > 48) s.events.shift();
  }
  function phase(g, next) {
    const s = g.strikeExperience; if (s.phase === next) return;
    s.phase = next; s.phaseTime = 0; events(g, 'phase', next);
  }
  function syncStation(g) {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('rseat', g.rightSeat);
    document.getElementById('btnScope')?.classList.toggle('on', !!g.hud.scope);
    document.getElementById('btnGear')?.classList.toggle('on', !!g.ac.gear);
    for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on');
  }
  function begin(g) {
    const launch = g.app && g.app._dixieLaunch;
    if (!launch || launch.token !== g.app._missionStart || g.mis.id !== 'm2') return false;
    g.app._dixieLaunch = null;
    g.strikeExperience = { version: 1, phase: 'navigation', elapsed: 0, phaseTime: 0, tutorial: launch.tutorial !== false,
      retries: 0, checkedVisual: false, observations: [], events: [], lastDropped: 0, lastImpacts: 0, lastFixes: 0,
      firstReleaseAt: null, impactAt: null, assessment: null, checkpointLabel: null, completed: false, look: false, lookPoint: null };
    g.rightSeat = true; g.hud.scope = true; g.ripple = 2;
    if (launch.practice && !launch.saved) {
      const w = g.world, t = w.briefed, ship = w.carrier.p;
      const dx = ship[0] - t[0], dz = ship[2] - t[2], length = Math.max(1, Math.hypot(dx, dz));
      const p = [t[0] + dx / length * 11000, 0, t[2] + dz / length * 11000];
      let terrain = 0;
      for (let i = 0; i <= 24; i++) terrain = Math.max(terrain, context.terrainH(p[0] + (t[0] - p[0]) * i / 24, p[2] + (t[2] - p[2]) * i / 24));
      const yaw = Math.atan2(t[0] - p[0], -(t[2] - p[2])); p[1] = Math.max(0, terrain) + 700;
      Object.assign(g.ac, { p, v: [Math.sin(yaw) * 160, 0, -Math.cos(yaw) * 160], yaw, pitch: .035, roll: 0, gear: false, hook: false, onDeck: false, cat: 0, thr: .78 });
      g.phase = 'airborne'; g.departed = true; g.steer = yaw;
    }
    if (launch.saved && root.FlightStrikeCheckpoint.valid(launch.saved) && root.FlightStrikeCheckpoint.restore(g, launch.saved)) {
      g.strikeExperience.retries = finite(launch.saved.experience.retries) + 1;
      g.strikeExperience.look = false; g.strikeExperience.lookPoint = null; g.extView = false;
      events(g, 'retry', launch.saved.label);
    }
    syncStation(g); render(g); return true;
  }
  function start(options) {
    if (!context) return false; const o = options || {}, app = context.App, mission = context.missions.find(m => m.id === 'm2');
    if (!mission || o.saved && !root.FlightStrikeCheckpoint.valid(o.saved)) return false;
    app._dixieRequested = { tutorial: o.tutorial !== false, practice: !!o.practice, saved: o.saved ? copy(o.saved) : null };
    app.start(mission); return true;
  }
  function save(g, label) {
    const d = root.FlightStrikeCheckpoint.capture(g, label);
    if (!d) return false; g.strikeExperience.checkpointLabel = label; events(g, 'checkpoint', label); return true;
  }
  function retry(g) {
    if (!eligible(g) || !context || context.App.game !== g) return false;
    const saved = root.FlightStrikeCheckpoint.saved();
    if (!saved) return false; return start({ saved, tutorial: saved.experience.tutorial });
  }
  function returnHome(g) {
    if (!active(g) || g.paused || g.ac.onDeck) return false;
    g.egressCalled = true; g.steer = Math.atan2(g.world.carrier.p[0] - g.ac.p[0], -(g.world.carrier.p[2] - g.ac.p[2]));
    phase(g, 'egress'); events(g, 'return-command', 'Crew chose to recover; target and wire objectives remain original.');
    save(g, 'egress'); render(g); return true;
  }
  function takeLook(g) {
    if (!active(g) || g.paused || g.ac.onDeck) return false;
    const s = g.strikeExperience; s.look = !s.look;
    if (s.look) {
      s.scopeBeforeLook = !!g.hud.scope; g.hud.scope = false;
      const chart = root.FlightStrikeBoard && typeof root.FlightStrikeBoard.recognition === 'function' ? root.FlightStrikeBoard.recognition(g) : null;
      const p = g.world.designated && g.world.designated.p || chart && chart.candidate;
      s.lookPoint = point(p) ? [p[0], Math.max(p[1], context.terrainH(p[0], p[2])), p[2]] : null;
    } else { g.hud.scope = s.scopeBeforeLook !== false; s.lookPoint = null; }
    g.camSm = null; syncStation(g); render(g); return s.look;
  }
  function anotherPass(g) {
    if (!active(g) || g.paused || g.ac.onDeck || g.egressCalled || !(g.ac.bombs > 0) || !g.world.designated) return false;
    g._reattack = 1; g.strikeExperience.look = false; g.hud.scope = true;
    phase(g, 'acquire'); events(g, 'another-pass', 'Original pilot opens range before turning back.'); syncStation(g); render(g); return true;
  }
  function camera(g) {
    if (!active(g) || !g.strikeExperience.look || !point(g.strikeExperience.lookPoint)) return null;
    const p = g.strikeExperience.lookPoint, a = g.ac;
    return { eye: [a.p[0] + Math.sin(a.yaw) * 4, a.p[1] + 1.4, a.p[2] - Math.cos(a.yaw) * 4], target: [p[0], p[1] + 3, p[2]] };
  }
  function canSeeAftermath(g, eye, p) {
    if (!active(g) || !point(eye) || !point(p) || !context || (g.mis.env.fog || 0) > .65) return false;
    if (Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) > 4300) return false;
    for (let i = 1; i < 24; i++) {
      const u = i / 24, x = eye[0] + (p[0] - eye[0]) * u, z = eye[2] + (p[2] - eye[2]) * u;
      if (context.terrainH(x, z) > eye[1] + (p[1] + 15 - eye[1]) * u - 1) return false;
    }
    return true;
  }
  function observe(g) {
    const s = g.strikeExperience;
    if (!s.look || g.hud.scope || !point(s.lookPoint) || !g.rend || !canSeeAftermath(g, g.rend.eye, s.lookPoint)) return false;
    const effects = root.FlightStrikeEffects.inspect(g.world);
    const visible = effects.targets.filter(v => point(v.p) && Math.hypot(v.p[0] - s.lookPoint[0], v.p[2] - s.lookPoint[2]) < 200 && canSeeAftermath(g, g.rend.eye, v.p));
    if (!visible.length || s.checkedVisual) return false;
    s.checkedVisual = true;
    s.assessment = { at: s.elapsed, evidence: 'Fire, debris or smoke observed near the player-designated point. Full target destruction is confirmed only in the original debrief.', count: visible.length };
    s.observations.push(copy(s.assessment)); if (s.observations.length > 8) s.observations.shift(); events(g, 'observed-aftermath', 'Visual evidence, not a score award.'); return true;
  }
  function tick(g, dt) {
    if (!active(g) || g.paused || !Number.isFinite(dt) || dt < 0) { render(g); return; }
    const s = g.strikeExperience, w = g.world, score = w.score;
    s.elapsed += dt; s.phaseTime += dt;
    const d = w.briefed ? Math.hypot(w.briefed[0] - g.ac.p[0], w.briefed[2] - g.ac.p[2]) : Infinity;
    const dropped = finite(score.dropped), impacts = finite(score.hits) + finite(score.misses);
    if (w.designated && point(w.designated.p) && !s.look) s.lastDesignation = w.designated.p.slice();
    if (dropped > s.lastDropped) { if (s.firstReleaseAt === null) s.firstReleaseAt = s.elapsed; phase(g, 'release'); events(g, 'released', dropped - s.lastDropped); }
    if (impacts > s.lastImpacts) { s.impactAt = s.elapsed; phase(g, 'assess'); events(g, 'impact', impacts - s.lastImpacts); }
    if (g.phase === 'recovery' && g.egressCalled) phase(g, 'recovery');
    else if (g.egressCalled || g.ac.bombs === 0 && !w.bombs.length) { if (s.phase !== 'recovery') phase(g, 'egress'); }
    else if (!['release', 'assess'].includes(s.phase)) {
      if (w.designated && w.lock) phase(g, 'run-in');
      else if (!g.ac.onDeck && d < 10000) phase(g, 'acquire');
    } else if (s.phase === 'assess' && g.sol && g.sol.valid && g.sol.tRel > 10 && g._relArm !== 0) phase(g, 'run-in');
    if (!g.ac.onDeck && g.ac.p[1] > 180 && g.t > 8 && !s.checkpointLabel) save(g, 'approach');
    if (s.phase === 'run-in' && g.sol && g.sol.valid && g.sol.tRel > 8 && s.checkpointLabel !== 'run-in' && !w.bombs.length) save(g, 'run-in');
    if (s.phase === 'egress' && s.checkpointLabel !== 'egress' && !w.bombs.length) save(g, 'egress');
    observe(g); s.lastDropped = dropped; s.lastImpacts = impacts; s.lastFixes = w.nav && w.nav.fixes || 0;
    render(g);
  }
  function view(g) {
    if (!eligible(g)) return null; const s = g.strikeExperience, spec = descriptions[s.phase] || descriptions.navigation;
    const w = g.world, cp = w.route && w.route[w.rtIdx];
    const emergency = !!(g.ac.crew && g.ac.crew.pilot <= 0 && !g.ac.onDeck);
    return { phase: s.phase, title: emergency ? 'EMERGENCY · THE PILOT CANNOT FLY' : spec[0], objective: emergency ? 'You have the aircraft. Use the flight stick or W/A/S/D, watch terrain and head for the ship. EJECT remains available.' : s.tutorial ? spec[1] : 'Work the original navigation, attack and carrier recovery.', tutorial: s.tutorial, look: !!s.look,
      targetArea: point(w.briefed) ? w.briefed.slice() : null, nextFix: cp ? { label: cp.label, p: cp.p.slice(), hint: cp.hint } : null,
      readiness: g.sol ? { valid: !!g.sol.valid, az: finite(g.sol.az), tRel: finite(g.sol.tRel) } : null,
      checkpointLabel: s.checkpointLabel, retries: s.retries, ripple: g.ripple, bombs: g.ac.bombs,
      assessment: s.assessment ? copy(s.assessment) : null, observed: !!s.checkedVisual, elapsed: s.elapsed };
  }
  function setTutorial(g, on) { if (!eligible(g)) return false; g.strikeExperience.tutorial = !!on; render(g); return true; }
  function bind(node, fn) { root.WillardPresentation.bindButton(node, event => { if (event) event.stopPropagation(); node.blur(); fn(); }); }
  function mount() {
    if (ui || typeof document === 'undefined') return;
    const panel = document.createElement('section'); panel.id = 'dixiePanel'; panel.hidden = true; panel.setAttribute('aria-label', 'Dixie B/N strike');
    const title = document.createElement('strong'); title.id = 'dixieTitle';
    const objective = document.createElement('p'); objective.id = 'dixieObjective';
    const actions = document.createElement('div'); actions.className = 'dixie-actions'; const buttons = {};
    for (const [key, id, label, action] of [
      ['look', 'dixieLook', 'LOOK OUT', takeLook], ['ripple', 'dixieRipple', 'RIPPLE 2', g => { if (!g.paused) g.ripple = g.ripple >= 8 ? 1 : g.ripple * 2; render(g); }],
      ['pass', 'dixiePass', 'ANOTHER PASS', anotherPass],
      ['home', 'dixieHome', 'HOME', returnHome], ['retry', 'dixieRetry', 'RETRY', retry], ['guidance', 'dixieGuidance', 'GUIDANCE ON', g => setTutorial(g, !g.strikeExperience.tutorial)]
    ]) { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.textContent = label; bind(b, () => { const g = context.App.game; if (eligible(g)) action(g); }); actions.append(b); buttons[key] = b; }
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup']) panel.addEventListener(type, e => e.stopPropagation());
    panel.append(actions, title, objective); (document.getElementById('game') || document.body).append(panel); ui = { panel, title, objective, buttons };
  }
  function render(g) {
    if (!ui || !context) return;
    const show = active(g) && context.App.game === g && context.App.screen === 'game' && !context.App.graphicsContextLost && !g.paused;
    ui.panel.hidden = !show; document.body.classList.toggle('dixie-flight', !!show);
    if (!show) { if (root.FlightStrikeCrew) root.FlightStrikeCrew.render(g); return; }
    const v = view(g), board = root.FlightStrikeBoard && root.FlightStrikeBoard.snapshot(g);
    ui.panel.classList.toggle('compact', !!(board && board.open));
    ui.title.textContent = v.title; ui.objective.textContent = v.objective;
    ui.buttons.look.textContent = v.look ? 'BACK TO SCOPE' : 'LOOK OUT'; ui.buttons.look.setAttribute('aria-pressed', String(v.look));
    ui.buttons.ripple.textContent = g.ripple === 1 ? 'SINGLE' : 'RIPPLE ' + g.ripple;
    ui.buttons.retry.disabled = !v.checkpointLabel; ui.buttons.home.disabled = !!g.ac.onDeck;
    ui.buttons.pass.disabled = !!(g.ac.onDeck || g.egressCalled || !g.ac.bombs || !g.world.designated);
    ui.buttons.look.disabled = !!g.ac.onDeck; ui.buttons.guidance.textContent = v.tutorial ? 'GUIDANCE ON' : 'GUIDANCE OFF'; ui.buttons.guidance.setAttribute('aria-pressed', String(v.tutorial));
  }
  function button(host, id, label, action) {
    const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = 'btn pri'; b.textContent = label; bind(b, action); host.append(b); return b;
  }
  function briefing(app, m) {
    if (!m || m.id !== 'm2' || typeof document === 'undefined') return;
    const host = document.getElementById('briefBody'), card = document.createElement('section'); card.className = 'card dixie-brief'; card.id = 'dixieBrief';
    const h = document.createElement('h3'); h.textContent = 'Fly the B/N-led Dixie strike';
    const p = document.createElement('p'); p.textContent = 'Find the depot, work the actual radar and bombing computer, observe the results and bring the crew aboard. The pilot flies from your instructions. A confirmed dispersed group can warrant an eight-bomb ripple, keeping four stores for another run; single drops suit isolated points. Authored scenery and crew dialogue are gameplay reconstructions.';
    const row = document.createElement('div'); row.className = 'btnrow'; card.append(h, p, row);
    button(row, 'dixieStart', 'PLAY GUIDED SORTIE', () => start({ tutorial: true }));
    button(row, 'dixiePractice', 'SHORT B/N PRACTICE', () => start({ tutorial: true, practice: true }));
    if (root.FlightStrikeCheckpoint.saved()) button(row, 'dixieContinue', 'CONTINUE CHECKPOINT', () => start({ saved: root.FlightStrikeCheckpoint.saved() }));
    host.prepend(card);
  }
  function appendDebrief(g) {
    if (!eligible(g) || typeof document === 'undefined') return;
    g.strikeExperience.completed = !!(g.result && g.result.recovered);
    const host = document.getElementById('debriefBody'); if (!host || host.querySelector('#dixieDebrief')) return;
    const card = document.createElement('section'); card.id = 'dixieDebrief'; card.className = 'card dixie-brief';
    const title = document.createElement('h3'); title.textContent = 'B/N strike record';
    const p = document.createElement('p'); p.textContent = (g.strikeExperience.checkedVisual ? 'You observed aftermath near your designated point. ' : 'No visual damage assessment was recorded. ') + 'Target destruction and carrier recovery above are the original simulation results. Checkpoint retries: ' + g.strikeExperience.retries + '.';
    card.append(title, p); if (root.FlightStrikeCheckpoint.saved()) button(card, 'dixieDebriefRetry', 'RETRY CHECKPOINT', () => retry(g)); host.append(card);
  }
  function install(c) {
    if (!c || !c.App || installed) return false; context = c; installed = true; root.FlightStrikeCheckpoint.configure(c); mount();
    const app = c.App, oldStart = app.start;
    app.start = function (m) {
      if (root.FlightStrikeCrew && this.game) root.FlightStrikeCrew.dispose(this.game);
      const requested = this._dixieRequested; this._dixieRequested = null;
      this._dixieLaunch = m.id === 'm2' && requested ? { ...requested, token: finite(this._missionStart) + 1 } : null;
      return oldStart.apply(this, arguments);
    };
    const oldBrief = app.brief; app.brief = function (m) { const result = oldBrief.apply(this, arguments); briefing(this, m); return result; };
    const oldOps = app.renderOps; app.renderOps = function (host) {
      const result = oldOps.apply(this, arguments); const card = document.createElement('section'); card.className = 'card dixie-brief';
      const h = document.createElement('h3'); h.textContent = 'Take the B/N seat · Guided Dixie strike'; card.append(h);
      button(card, 'dixieReady', 'BRIEF THE GUIDED STRIKE', () => this.brief(c.missions.find(m => m.id === 'm2'))); host.prepend(card); return result;
    };
    const oldShow = app.show; app.show = function () { const result = oldShow.apply(this, arguments); render(this.game); if (root.FlightStrikeCrew) root.FlightStrikeCrew.render(this.game); return result; };
    const oldPause = app.pause; app.pause = function (on) {
      const result = oldPause.apply(this, arguments); render(this.game); if (root.FlightStrikeCrew) root.FlightStrikeCrew.tick(this.game, 0);
      if (on && eligible(this.game) && root.FlightStrikeCheckpoint.saved()) button(document.getElementById('pauseBody'), 'dixiePauseRetry', 'RETRY STRIKE CHECKPOINT', () => retry(this.game)); return result;
    };
    root.FlightStrikeCrew.install({ ...c, canSeeAftermath });
    return true;
  }
  root.FlightStrikeExperience = Object.freeze({ install, begin, start, tick, view, active, retry, returnHome, takeLook, anotherPass, camera, canSeeAftermath, setTutorial, render, appendDebrief });
})(typeof window !== 'undefined' ? window : globalThis);
