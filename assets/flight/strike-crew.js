/* DIXIE strike crew: authored, dramatized guidance from observed flight events.
 * Presentation only. It cannot steer, designate, release, score or identify a
 * target. One subtitle, no timers, and at most one optional synthesized voice. */
(function (root) {
  'use strict';
  const records = new WeakMap(), radioBindings = new WeakSet(), RAD = 180 / Math.PI;
  let context = null, ui = null, installed = false, voice = null, lastGame = null;
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const point = p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite);
  const phaseLines = Object.freeze({
    navigation: 'Work CHART and the next briefed landmark. I will hold heading.',
    acquire: 'Compare the landmark pattern with the actual sweep. A bright return alone is not identification.',
    'run-in': 'Check clearance, center the needles, then hold consent.',
    release: 'Hold the run steady. ASQ selects release; consent cannot override its limits.',
    assess: 'Keep clear of the guns. Assess only when the view and workload permit.',
    egress: 'Get feet wet. Keep the navigation scan going.',
    recovery: 'Back to the ship. Monitor TACAN, fuel, gear and hook.'
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
    if (!s) { s = { last: read(g), caption: null, until: -Infinity, quietUntil: -Infinity, priority: 0, next: Object.create(null), radio: Object.create(null), history: [], emitted: 0, suppressed: 0, stable: 0, stableAnnounced: false, inhibit: null, voiceEnabled: false, disposed: false, first: true }; records.set(g, s); }
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
  function speechEnabled(g) {
    const settings = (context && context.App || g && g.app || {}).set || {};
    return settings.sound !== false && settings.sound !== 0 && (settings.voices === undefined ? 2 : settings.voices) >= 2;
  }
  function criticalDamage(g) {
    const report = root.FlightAirframeFeedback && root.FlightAirframeFeedback.view(g), alert = report && report.alert;
    return !!(alert && alert.systems.some(key => ['fire', 'pilot', 'bn'].includes(key)));
  }
  function captionVisible(g, caption) {
    return !!(caption && (!criticalDamage(g) || caption.priority >= 3 && caption.key.startsWith('inhibit-')));
  }
  function radioKey(text) {
    if (typeof text !== 'string') return null;
    if (/^Bombs away\b/i.test(text)) return 'release';
    if (/^Fix (?:on|taken)\b|^Radar fix\b/i.test(text)) return 'fix';
    if (/^Locked\.|^Offset applied\.|^Attacking briefed coordinates\b|^No hard return there.*designating/i.test(text)) return 'lock';
    if (/^(?:Left|Right|Steering|Steer)\s+(?:to\s+)?\d{3}\b|^Come (?:right|left) to \d{3}\b|^Steady on\s*\d{3}\b/i.test(text)) return 'steer';
    return null;
  }
  function radioMatched(g, s, key) {
    const at = finite(g.t), stamp = s.radio[key];
    return Number.isFinite(stamp) && at >= stamp && at - stamp <= 1.25;
  }
  function speak(g, s, caption) {
    const synth = root.speechSynthesis;
    if (!s.voiceEnabled || !speechAvailable() || !speechEnabled(g) || !active(g) || !captionVisible(g, caption) || voice || synth.pending || synth.speaking) return false;
    try {
      const utterance = new root.SpeechSynthesisUtterance(caption.text.slice(0, 175));
      const voices=typeof synth.getVoices==='function'?synth.getVoices():[];
      if(!root.VoiceProfiles||!root.VoiceProfiles.apply(utterance,{speaker:caption.speaker,text:caption.text,lang:'en-US',tone:caption.priority>=3?'bad':caption.priority===2?'warn':undefined},voices))return false;
      const owned = { game: g, utterance, started: false }; voice = owned;
      utterance.onstart = () => { if (voice === owned) owned.started = true; };
      utterance.onend = utterance.onerror = () => { if (voice === owned) voice = null; };
      synth.speak(utterance); return true;
    } catch (_) { voice = null; return false; }
  }
  function show(g, s, item) {
    const at = finite(g.t), next = finite(s.next[item.key], -Infinity);
    if (at < next || at < s.until && item.priority <= s.priority || item.priority < 3 && at < s.quietUntil) return false;
    // The original radio owns its real acknowledgement and family wording.
    // Do not add another caption or synthesized reading of the same event.
    if (radioMatched(g, s, item.key)) {
      s.next[item.key] = at + (item.cooldown || 18);
      s.quietUntil = Math.max(s.quietUntil, at + (item.priority >= 3 ? 7 : 9));
      s.suppressed++; return true;
    }
    const caption = { key: item.key, speaker: item.speaker || 'PILOT', text: root.CrewPersonality?root.CrewPersonality.line(g,item.speaker||'PILOT',item.text):item.text, priority: item.priority, at, label: 'DRAMATIZED CREW · GAMEPLAY GUIDANCE' };
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
    if (n.dropped > old.dropped) add('release', (n.dropped - old.dropped) + ' bomb' + (n.dropped - old.dropped === 1 ? '' : 's') + ' off. Impact is not a confirmed hit. Fly the escape route.', 4, { speaker: 'B/N', cooldown: 3.5 });
    if (n.fixes > old.fixes) add('fix', 'Fix entered. Check the next landmark; one fix does not remove all navigation error.', 3, { speaker: 'B/N', cooldown: 8 });
    if (n.designated && !old.designated) add('lock', 'Designation received. I have the steering; check clearance and the solution before consent.', 2);
    if (n.steer !== null && (old.steer === null || Math.abs(Math.atan2(Math.sin(n.steer - old.steer), Math.cos(n.steer - old.steer))) > .01)) {
      const heading = String(Math.round((n.steer * RAD % 360 + 360) % 360) % 360).padStart(3, '0');
      add('steer', 'Steer ' + heading + ' acknowledged. ' + (g.rightSeat ? 'I will settle on that heading.' : 'Keep her steady while you work the system.'), 2, { cooldown: 6 });
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
    if (n.hits + n.misses > old.hits + old.misses) add('impact', 'Impacts registered. The debrief measures the result; keep clear of the guns.', 2, { speaker: 'B/N', cooldown: 12 });
    if (n.phase === 'assess' && aftermathVisible(g)) add('aftermath', 'Smoke visible in the target area; not confirmation of every aimpoint.', 2, { speaker: 'B/N', cooldown: 35 });
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
    voiceButton.onclick = event => { event.stopPropagation(); const g = context && context.App.game; if (!active(g) || !speechAvailable() || !speechEnabled(g)) return; const s = state(g); s.voiceEnabled = !s.voiceEnabled; if (!s.voiceEnabled) stopVoice(g); render(g); voiceButton.blur(); };
    panel.append(label, line, voiceButton); host.append(panel); ui = { panel, label, line, voiceButton }; return ui;
  }
  function render(g) {
    if (voice && (!active(voice.game) || !speechEnabled(voice.game) || !captionVisible(voice.game, records.get(voice.game)?.caption))) stopVoice(voice.game);
    const u = mount(); if (!u) return;
    const s = g && records.get(g), visible = active(g) && s && !s.disposed;
    u.panel.hidden = !visible;
    if (!visible) { stopVoice(g); return; }
    const caption = s.caption && finite(g.t) < s.until && captionVisible(g, s.caption) ? s.caption : null;
    u.panel.dataset.state = caption ? 'caption' : 'idle';
    u.label.hidden = true; u.line.hidden = !caption;
    u.line.textContent = caption ? caption.speaker + ': ' + caption.text : '';
    u.panel.dataset.priority = caption ? String(caption.priority) : '0';
    u.voiceButton.disabled = !speechAvailable() || !speechEnabled(g);
    u.voiceButton.textContent = 'CREW VOICE: ' + (!speechEnabled(g) ? 'MUTED' : s.voiceEnabled ? 'ON' : 'OFF'); u.voiceButton.setAttribute('aria-pressed', String(s.voiceEnabled));
    if (!caption && !speechAvailable()) u.panel.hidden = true;
  }
  function inspect(g) {
    const s = g && records.get(g); if (!s) return { active: false, caption: null, history: [], emitted: 0, ownedVoices: voice ? 1 : 0 };
    return { active: active(g) && !s.disposed, caption: active(g) && finite(g.t) < s.until && !s.disposed ? { ...s.caption } : null, captionVisible: active(g) && finite(g.t) < s.until && !s.disposed && captionVisible(g, s.caption), history: s.history.map(x => ({ ...x })), emitted: s.emitted, suppressed: s.suppressed, stableSeconds: s.stable, voiceEnabled: s.voiceEnabled, ownedVoices: voice && voice.game === g ? 1 : 0, inhibit: s.inhibit };
  }
  function dispose(g) { if (!g) return false; stopVoice(g); const s = records.get(g); if (s) { s.disposed = true; s.caption = null; s.until = -Infinity; s.voiceEnabled = false; } if (lastGame === g) lastGame = null; if (ui && (!context || context.App.game === g)) ui.panel.hidden = true; return true; }
  function install(ctx) {
    if (!ctx || !ctx.App) return false; context = ctx; mount();
    const app = ctx.App;
    if (typeof app.radio === 'function' && !radioBindings.has(app)) {
      radioBindings.add(app); const radio = app.radio;
      app.radio = function (who, text) {
        const g = this.game, key = radioKey(text), tracked = key && ['BN', 'B/N', 'PILOT', 'TURCZYN', 'MAC', 'CREW'].includes(who) && active(g);
        if (tracked) {
          const s = state(g); s.radio[key] = finite(g.t);
          // Retire our matching utterance before the original radio owns a
          // new one; cancelling afterward could clear its newly queued call.
          if (s.caption?.key === key && finite(g.t) - s.caption.at <= 1.25) { s.caption = null; s.until = -Infinity; s.priority = 0; stopVoice(g); }
        }
        // The real intercom always has the floor, including launch/damage
        // calls that are not a duplicate of our optional guidance.
        if (voice && voice.game === g) stopVoice(g);
        const result = radio.apply(this, arguments);
        if (tracked) render(g);
        return result;
      };
    }
    if (!installed && typeof document !== 'undefined') { installed = true; document.addEventListener('visibilitychange', () => { if (document.hidden) stopVoice(); }); if (root.addEventListener) root.addEventListener('blur', () => stopVoice()); }
    return true;
  }
  root.FlightStrikeCrew = Object.freeze({ install, tick, render, inspect, dispose, inhibit, active });
})(typeof window !== 'undefined' ? window : globalThis);
