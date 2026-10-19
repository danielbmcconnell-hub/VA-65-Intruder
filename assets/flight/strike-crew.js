/* DIXIE strike crew: authored, dramatized guidance from observed flight events.
 * Presentation only. It cannot steer, designate, release, score or identify a
 * target. One subtitle, no timers, and at most one optional synthesized voice. */
(function (root) {
  'use strict';
  const records = new WeakMap(), RAD = 180 / Math.PI;
  let context = null, ui = null, installed = false, voice = null, lastGame = null;
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const point = p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite);
  const phaseLines = Object.freeze({
    navigation: 'Your chart, your fixes. Work the next briefed landmark; I will hold the aircraft steady.',
    acquire: 'Compare the landmark pattern with the actual sweep. A bright return alone is not identification.',
    'run-in': 'We have a designation. Check clearance, settle the needles, then hold consent.',
    release: 'Keep the run steady. The computer selects release; consent does not override its limits.',
    assess: 'Do not circle under the guns for a better look. Observe only when the view and workload permit.',
    egress: 'Get us feet wet. Keep the navigation scan going; the attack is behind us.',
    recovery: 'Back to the ship. Monitor TACAN, fuel, gear and hook; use the existing recovery guidance.'
  });
  function eligible(g) {
    return !!(g && g.mis && g.mis.id === 'm2' && g.strikeExperience && g.ac && g.world && !g.willard);
  }
  function active(g) {
    const app = context && context.App;
    return eligible(g) && (!app || app.game === g && app.screen === 'game' && !app.graphicsContextLost) && !g.paused && !g.result && !g.pow && !g.evade && !g.chute && !g.ejected && g.ac.alive !== false && !['done', 'dead'].includes(g.phase) && !(typeof document !== 'undefined' && document.hidden);
  }
  function phase(g) {
    const exp = g.strikeExperience;
    return exp && typeof exp.phase === 'string' ? exp.phase : 'navigation';
  }
  function read(g) {
    const score = g.world.score || {}, nav = g.world.nav || {};
    return { at: finite(g.t), fixes: finite(nav.fixes), dropped: finite(score.dropped), hits: finite(score.hits), misses: finite(score.misses), designated: !!g.world.designated, steer: Number.isFinite(g.steer) ? g.steer : null, consent: !!(g.masterArm || g._lastCommit), phase: phase(g) };
  }
  function state(g) {
    let s = records.get(g);
    if (!s) { s = { last: read(g), caption: null, until: -Infinity, quietUntil: -Infinity, priority: 0, next: Object.create(null), history: [], emitted: 0, stable: 0, stableAnnounced: false, inhibit: null, voiceEnabled: false, disposed: false, first: true }; records.set(g, s); }
    return s;
  }
  function stopVoice(g) {
    if (!voice || g && voice.game !== g) return;
    const current = voice; voice = null;
    // Native synthesis has a global queue. Cancel only our sole utterance:
    // never cancel a queued App.radio line or somebody else's active speech.
    const synth = root.speechSynthesis;
    if (synth && current.started && !synth.pending && synth.speaking) { try { synth.cancel(); } catch (_) {} }
    else if (synth && !current.started && synth.pending && !synth.speaking) { try { synth.cancel(); } catch (_) {} }
  }
  function speechAvailable() { return !!(root.speechSynthesis && typeof root.SpeechSynthesisUtterance === 'function'); }
  function speak(g, s, caption) {
    const synth = root.speechSynthesis, app = context && context.App;
    if (!s.voiceEnabled || !speechAvailable() || !active(g) || app && app.set && !app.set.sound || voice || synth.pending || synth.speaking) return false;
    try {
      const utterance = new root.SpeechSynthesisUtterance(caption.text.slice(0, 175));
      utterance.lang = 'en-US'; utterance.rate = .96; utterance.pitch = caption.speaker === 'PILOT' ? .84 : .94; utterance.volume = .8;
      const owned = { game: g, utterance, started: false }; voice = owned;
      utterance.onstart = () => { if (voice === owned) owned.started = true; };
      utterance.onend = utterance.onerror = () => { if (voice === owned) voice = null; };
      synth.speak(utterance); return true;
    } catch (_) { voice = null; return false; }
  }
  function show(g, s, item) {
    const at = finite(g.t), next = finite(s.next[item.key], -Infinity);
    if (at < next || at < s.until && item.priority <= s.priority || item.priority < 3 && at < s.quietUntil) return false;
    const caption = { key: item.key, speaker: item.speaker || 'PILOT', text: item.text, priority: item.priority, at, label: 'DRAMATIZED CREW · GAMEPLAY GUIDANCE' };
    s.caption = caption; s.until = at + (item.duration || 5.5); s.priority = item.priority;
    s.quietUntil = at + (item.priority >= 3 ? 7 : 9); s.next[item.key] = at + (item.cooldown || 18); s.emitted++;
    s.history.push({ ...caption }); if (s.history.length > 8) s.history.shift();
    speak(g, s, caption); return true;
  }
  function inhibit(g) {
    const sol = g.sol, ac = g.ac;
    if (g.mis.noRelease) return { code: 'weapons-tight', text: 'Weapons tight. This mission does not authorize a release.' };
    if (ac.onDeck) return { code: 'deck', text: 'We are on the deck. Keep consent released until airborne and cleared for the attack.' };
    if (!(finite(ac.bombs) > 0)) return { code: 'empty', text: 'No bombs remain. Release consent and work the egress navigation.' };
    if (finite(ac.dmg && ac.dmg.diane) > .8) return { code: 'diane', text: 'DIANE is damaged. Do not trust the scope or an attack solution; use surviving navigation.' };
    if (!g.world.designated) return { code: 'designation', text: 'Consent held, but no point is designated. Correlate the chart and sweep, then LOCK when cleared.' };
    if (!sol || !sol.valid) {
      if (sol && Number.isFinite(sol.h) && sol.h <= 55) return { code: 'height', text: 'The computed height is below the release solution limit. Climb safely and rebuild the run.' };
      if (sol && Number.isFinite(sol.tRel) && sol.tRel < -1.2) return { code: 'past', text: 'The release point is behind us. Release consent, come off safely and set up another run.' };
      if (sol && Number.isFinite(sol.az) && Math.abs(sol.az) >= .30) return { code: 'approach', text: 'We are outside the attack solution. Give me a useful steer and establish the run-in.' };
      return { code: 'solution', text: 'No valid ASQ solution yet. Check the run-in, height and designation; consent cannot force a release.' };
    }
    if (!Number.isFinite(sol.az) || Math.abs(sol.az) >= .028) return { code: 'alignment', text: 'Steering error is outside the release limit. Center the azimuth needle; holding consent cannot correct it.' };
    if (g._relArm === 0) return { code: 'ripple', text: 'One ripple has gone on this run. Release consent and come around if another pass is needed.' };
    return { code: 'waiting', text: 'Consent held. Keep the needles centered; the computer selects the release point.' };
  }
  function aftermathVisible(g) {
    // Only genuine active fire/strike aftermath inside the current camera view
    // can support an observation. Hidden targets and damage counters cannot.
    const inspect = root.FlightStrikeEffects && root.FlightStrikeEffects.inspect;
    if (!inspect || !g.rend || !point(g.rend.eye) || !g.rend.matV) return false;
    const eye = g.rend.eye, view = g.rend.matV, dx = -view[2], dy = -view[6], dz = -view[10], len = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(len) || len < .01) return false;
    const actual = inspect(g.world);
    return !!(actual && actual.targets && actual.targets.some(v => {
      if (!point(v.p) || !(v.elapsed >= 0 && v.elapsed <= 75)) return false;
      const x = v.p[0] - eye[0], y = v.p[1] - eye[1], z = v.p[2] - eye[2], distance = Math.hypot(x, y, z);
      // Visibility is deliberately conservative: no claim through dense cloud
      // or a horizon ridge. Root may expose an existing terrain LOS callback.
      if (!(distance > 1 && distance < 4200) || (x * dx + y * dy + z * dz) / (distance * len) < .94) return false;
      return typeof context.canSeeAftermath === 'function' && context.canSeeAftermath(g, eye, v.p) === true;
    }));
  }
  function tick(g, dt) {
    if (lastGame && lastGame !== g) dispose(lastGame);
    if (!eligible(g)) { render(g); return null; }
    lastGame = g;
    if (!active(g)) { stopVoice(g); render(g); return null; }
    let s = state(g), n = read(g);
    if (s.disposed || n.at < s.last.at || n.dropped < s.last.dropped || n.fixes < s.last.fixes) { stopVoice(g); records.delete(g); s = state(g); n = read(g); }
    const old = s.last, events = [], add = (key, text, priority = 2, extra) => events.push({ key, text, priority, ...extra });
    if (s.first || n.phase !== old.phase) { s.first = false; if (phaseLines[n.phase]) add('phase-' + n.phase, phaseLines[n.phase], 1); }
    if (n.dropped > old.dropped) add('release', (n.dropped - old.dropped) + ' bomb' + (n.dropped - old.dropped === 1 ? '' : 's') + ' off the racks. Release is not a confirmed hit; keep the escape route in mind.', 4, { speaker: 'B/N', cooldown: 3.5 });
    if (n.fixes > old.fixes) add('fix', 'Radar fix entered. Check the next landmark against the sweep; one fix does not remove all navigation error.', 3, { speaker: 'B/N', cooldown: 8 });
    if (n.designated && !old.designated) add('lock', 'Designation received. I have the steering; check clearance and the solution before consent.', 2);
    if (n.steer !== null && (old.steer === null || Math.abs(Math.atan2(Math.sin(n.steer - old.steer), Math.cos(n.steer - old.steer))) > .01)) {
      const heading = String(Math.round((n.steer * RAD % 360 + 360) % 360) % 360).padStart(3, '0');
      add('steer', 'Steer ' + heading + ' acknowledged. ' + (g.rightSeat ? 'I will settle her on that heading.' : 'Keep the aircraft steady while you work the system.'), 2, { cooldown: 6 });
    }
    const sol = g.sol, stable = !!(n.designated && sol && sol.valid && Number.isFinite(sol.az) && Math.abs(sol.az) < .022 && Math.abs(finite(g.ac.roll)) < .18);
    s.stable = stable ? s.stable + Math.min(Math.max(finite(dt), 0), .25) : 0;
    if (!stable && (!sol || !sol.valid || !Number.isFinite(sol.az) || Math.abs(sol.az) > .045 || Math.abs(finite(g.ac.roll)) > .30)) s.stableAnnounced = false;
    if (s.stable >= 1.25 && !s.stableAnnounced && g._relArm !== 0 && finite(g.ac.bombs) > 0) { add('stable', 'Needles settled. Check attack clearance, then hold consent through the computer release.', 2, { cooldown: 18 }); s.stableAnnounced = true; }
    if (n.consent) {
      const reason = inhibit(g), changed = reason.code !== s.inhibit;
      if (!old.consent || changed || n.at >= finite(s.next['inhibit-' + reason.code], -Infinity)) add('inhibit-' + reason.code, reason.text, reason.code === 'waiting' ? 2 : 3, { speaker: 'B/N', cooldown: 14 });
      s.inhibit = reason.code;
    } else s.inhibit = null;
    if (n.hits + n.misses > old.hits + old.misses) add('impact', 'Weapon impacts registered. The debrief measures the result; do not orbit under fire just to watch.', 2, { speaker: 'B/N', cooldown: 12 });
    if (n.phase === 'assess' && aftermathVisible(g)) add('aftermath', 'Smoke is visible in the target area. That is an observation, not confirmation of every aimpoint.', 2, { speaker: 'B/N', cooldown: 35 });
    events.sort((a, b) => b.priority - a.priority);
    for (const event of events) if (show(g, s, event)) break;
    s.last = n; render(g); return inspect(g);
  }
  function el(tag, text) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; }
  function mount() {
    if (ui || typeof document === 'undefined') return ui;
    const host = document.getElementById('game'); if (!host) return null;
    const panel = el('section'); panel.id = 'flightStrikeCrew'; panel.hidden = true; panel.setAttribute('aria-label', 'Dramatized strike crew guidance');
    const label = el('small', 'DRAMATIZED CREW · GAMEPLAY GUIDANCE'), line = el('p'); line.id = 'flightStrikeCrewLine'; line.setAttribute('role', 'status'); line.setAttribute('aria-live', 'polite'); line.setAttribute('aria-atomic', 'true');
    const voiceButton = el('button', 'SYNTH VOICE: OFF'); voiceButton.id = 'flightStrikeCrewVoice'; voiceButton.type = 'button'; voiceButton.setAttribute('aria-label', 'Optional browser synthesized crew guidance; not an authentic voice'); voiceButton.setAttribute('aria-pressed', 'false'); voiceButton.disabled = !speechAvailable();
    const stop = event => event.stopPropagation();
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup', 'wheel']) voiceButton.addEventListener(type, stop);
    // A native click is one activation for mouse, keyboard and touch. No
    // pointerup handler means no compatibility-click or multitouch double fire.
    voiceButton.onclick = event => { event.stopPropagation(); const g = context && context.App.game; if (!active(g) || !speechAvailable()) return; const s = state(g); s.voiceEnabled = !s.voiceEnabled; if (!s.voiceEnabled) stopVoice(g); render(g); voiceButton.blur(); };
    panel.append(label, line, voiceButton); host.append(panel); ui = { panel, label, line, voiceButton }; return ui;
  }
  function render(g) {
    if (voice && !active(voice.game)) stopVoice(voice.game);
    const u = mount(); if (!u) return;
    const s = g && records.get(g), visible = active(g) && s && !s.disposed;
    u.panel.hidden = !visible;
    if (!visible) { stopVoice(g); return; }
    const caption = s.caption && finite(g.t) < s.until ? s.caption : null;
    u.line.textContent = caption ? caption.speaker + ': ' + caption.text : 'Crew listening · work the chart, radar and aircraft.';
    u.panel.dataset.priority = caption ? String(caption.priority) : '0';
    u.voiceButton.textContent = 'SYNTH VOICE: ' + (s.voiceEnabled ? 'ON' : 'OFF'); u.voiceButton.setAttribute('aria-pressed', String(s.voiceEnabled));
  }
  function inspect(g) {
    const s = g && records.get(g); if (!s) return { active: false, caption: null, history: [], emitted: 0, ownedVoices: voice ? 1 : 0 };
    return { active: active(g) && !s.disposed, caption: active(g) && finite(g.t) < s.until && !s.disposed ? { ...s.caption } : null, history: s.history.map(x => ({ ...x })), emitted: s.emitted, stableSeconds: s.stable, voiceEnabled: s.voiceEnabled, ownedVoices: voice && voice.game === g ? 1 : 0, inhibit: s.inhibit };
  }
  function dispose(g) { if (!g) return false; stopVoice(g); const s = records.get(g); if (s) { s.disposed = true; s.caption = null; s.until = -Infinity; s.voiceEnabled = false; } if (lastGame === g) lastGame = null; if (ui && (!context || context.App.game === g)) ui.panel.hidden = true; return true; }
  function install(ctx) {
    if (!ctx || !ctx.App) return false; context = ctx; mount();
    if (!installed && typeof document !== 'undefined') { installed = true; document.addEventListener('visibilitychange', () => { if (document.hidden) stopVoice(); }); if (root.addEventListener) root.addEventListener('blur', () => stopVoice()); }
    return true;
  }
  root.FlightStrikeCrew = Object.freeze({ install, tick, render, inspect, dispose, inhibit, active });
})(typeof window !== 'undefined' ? window : globalThis);
