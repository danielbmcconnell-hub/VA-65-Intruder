/* Instrument-derived flight feedback. Changes only presentation: the original
 * aircraft damage, crew, forces, radar and hit decisions remain authoritative.
 * Sound reuses Audio2's user-initialized context/master/noise; no new context,
 * looping source, browser timer, speech or synthetic enemy position is created. */
(function (root) {
  'use strict';
  const records = new WeakMap(), sounds = [], LIMIT = 2;
  let context = null, installed = false, ui = null;
  const finite = (n, otherwise = 0) => Number.isFinite(n) ? n : otherwise;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const point = p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite);
  const systems = Object.freeze({
    hyd: ['HYDRAULIC DAMAGE', 'Control response is reduced. Use smooth inputs.'],
    eng: ['ENGINE DAMAGE', 'Available thrust is reduced. Monitor airspeed.'],
    fuelLeak: ['FUEL LEAK', 'Fuel is draining faster. Reassess the return.'],
    diane: ['DIANE DAMAGE', 'Navigation and attack instruments are degraded.'],
    fire: ['AIRFRAME FIRE', 'Fire indicated. Assess aircraft control and ejection options.'],
    pilot: ['PILOT INJURED', 'Pilot condition has worsened. Monitor aircraft control.'],
    bn: ['B/N INJURED', 'B/N condition has worsened. Instrument work may be impaired.']
  });
  function appOf(game) { return context && context.App || game && game.app; }
  function active(game) {
    const app = appOf(game), doc = root.document;
    return !!(game && game.ac && game.world && game.ac.alive !== false && !game.result
      && !game.paused && !game.ejected && !game.evade && !game.pow && !game.chute
      && !['done', 'dead'].includes(game.phase)
      && (!app || (app.game === undefined || app.game === game) && (!app.screen || app.screen === 'game' || app.screen === 'fixture') && !app.graphicsContextLost)
      && !(doc && doc.hidden));
  }
  function read(game) {
    const ac = game.ac, damage = ac.dmg || {}, crew = ac.crew || {};
    const result = { hits: finite(ac.hits), score: finite(game.world.score && game.world.score.damage) };
    for (const key of ['hyd', 'eng', 'fuelLeak', 'diane', 'fire']) result[key] = clamp(finite(damage[key]), 0, 1);
    for (const key of ['pilot', 'bn']) result[key] = clamp(finite(crew[key], 1), 0, 1);
    return result;
  }
  function state(game) {
    let s = records.get(game);
    if (!s) {
      s = { previous: read(game), clock: finite(game.t), alert: null, history: [], lastHitAt: -Infinity,
        lastStressAt: -Infinity, lastSoundAt: -Infinity, source: null, impacts: 0, emitted: 0 };
      records.set(game, s);
    }
    return s;
  }
  function clock(game, s) { return finite(game.t, s.clock); }
  function changes(previous, current) {
    const out = [];
    for (const key of ['hyd', 'eng', 'fuelLeak', 'diane', 'fire']) if (current[key] - previous[key] > .00001) out.push(key);
    for (const key of ['pilot', 'bn']) if (previous[key] - current[key] > .00001) out.push(key);
    return out;
  }
  function bearing(game, position) {
    if (!point(position) || !point(game.ac.p)) return null;
    const dx = position[0] - game.ac.p[0], dz = position[2] - game.ac.p[2];
    const distance = Math.hypot(dx, position[1] - game.ac.p[1], dz);
    if (!(distance > 1)) return null;
    const relative = Math.atan2(Math.sin(Math.atan2(dx, -dz) - finite(game.ac.yaw)), Math.cos(Math.atan2(dx, -dz) - finite(game.ac.yaw)));
    const direction = Math.abs(relative) < .55 ? 'AHEAD' : Math.abs(relative) > 2.58 ? 'ASTERN' : relative < 0 ? 'PORT' : 'STARBOARD';
    return { direction, pan: clamp(Math.sin(relative), -1, 1), distance };
  }
  function issue(game, s, changed, kind, observed) {
    const at = clock(game, s), labels = changed.map(key => systems[key][0]);
    const fatalities = changed.filter(key => (key === 'pilot' || key === 'bn') && read(game)[key] <= 0);
    let title = fatalities.length ? fatalities.map(key => key === 'pilot' ? 'PILOT NOT RESPONDING' : 'B/N NOT RESPONDING').join(' · ') : labels.length ? labels.join(' · ') : 'AIRFRAME HIT';
    const explanations = changed.slice(0, 2).map(key => systems[key][1]);
    if (fatalities.includes('pilot')) explanations.unshift('Take manual control or eject if the aircraft cannot be recovered.');
    const detail = explanations.length ? explanations.slice(0, 2).join(' ') : 'Check the instruments, crew and return route.';
    const alert = { title, detail, systems: changed.slice(), at, until: at + (changed.length ? 8 : 3.5),
      source: typeof kind === 'string' ? kind.slice(0, 24) : 'damage',
      direction: observed ? observed.direction : '', positionKnown: !!observed };
    s.alert = alert; s.history.push({ ...alert, systems: changed.slice() }); if (s.history.length > 6) s.history.shift();
    s.emitted++; return alert;
  }
  function disconnect(node) { try { node.disconnect(); } catch (_) {} }
  function destroy(sound) {
    if (sound.ended) return;
    sound.ended = true;
    try { sound.gain.gain.cancelScheduledValues(sound.context.currentTime); sound.gain.gain.setValueAtTime(0, sound.context.currentTime); } catch (_) {}
    try { sound.source.stop(); } catch (_) {}
    for (const node of sound.nodes) disconnect(node);
    const index = sounds.indexOf(sound); if (index >= 0) sounds.splice(index, 1);
  }
  function stop(game) { for (const sound of sounds.slice()) if (!game || sound.game === game) destroy(sound); }
  function soundAllowed(game) {
    const app = appOf(game), audio = app && app.audio;
    return !!(active(game) && app && app.set && app.set.sound && audio && audio.on && audio.ctx
      && audio.ctx.state === 'running' && audio.master && audio.noiseBuf);
  }
  function play(game, severity, observed, type) {
    if (!soundAllowed(game)) return false;
    const s = state(game), at = clock(game, s), stress = type === 'stress';
    if (at - s.lastSoundAt < (stress ? .7 : .065)) return false;
    const app = appOf(game), audio = app.audio, c = audio.ctx, nodes = [];
    const own = node => { nodes.push(node); return node; };
    let sourceNode, gain, sound;
    try {
      const now = finite(c.currentTime), duration = stress ? .28 : .18;
      sourceNode = own(c.createBufferSource()); sourceNode.buffer = audio.noiseBuf;
      sourceNode.playbackRate.value = stress ? .67 : 1.15 + clamp(severity, 0, 1) * .5;
      const filter = own(c.createBiquadFilter()); filter.type = 'bandpass'; filter.Q.value = stress ? .8 : .65;
      filter.frequency.value = stress ? 260 : game.extView ? 1200 : 650;
      gain = own(c.createGain()); gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(stress ? .07 : .16 + clamp(severity, 0, 1) * .25, now + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      sourceNode.connect(filter); filter.connect(gain);
      if (observed && typeof c.createStereoPanner === 'function') {
        const pan = own(c.createStereoPanner()); pan.pan.value = observed.pan; gain.connect(pan); pan.connect(audio.master);
      } else gain.connect(audio.master);
      while (sounds.length >= LIMIT) destroy(sounds[0]);
      sound = { game, context: c, source: sourceNode, gain, nodes, end: now + duration + .025, ended: false };
      sourceNode.onended = () => destroy(sound); sounds.push(sound);
      sourceNode.start(now); sourceNode.stop(sound.end); s.lastSoundAt = at; return true;
    } catch (_) {
      if (sound) destroy(sound);
      else { try { if (sourceNode) sourceNode.stop(); } catch (_) {} for (const node of nodes) disconnect(node); }
      return false;
    }
  }
  // Call only with an actual impact/explosion origin. Merely knowing a hostile
  // unit exists does not qualify; the UI never searches World.threats or AI.
  function source(game, position, kind) {
    if (!active(game)) return null;
    const observed = bearing(game, position);
    if (!observed || observed.distance > 1500) return null;
    const s = state(game);
    s.source = { ...observed, at: clock(game, s), kind: typeof kind === 'string' ? kind.slice(0, 24) : 'impact' };
    return { ...s.source };
  }
  function hit(game, severity, kind, position) {
    if (!active(game) || !Number.isFinite(severity) || severity <= 0) return { played: false, direction: '', pan: null };
    const s = state(game), now = read(game), changed = changes(s.previous, now);
    const observed = point(position) ? bearing(game, position) : null;
    // This direct hit origin can be beyond the audible near-miss range: it was
    // supplied by the actual damaging weapon, never guessed from a nearest gun.
    if (observed) s.source = { ...observed, at: clock(game, s), kind: typeof kind === 'string' ? kind.slice(0, 24) : 'impact' };
    issue(game, s, changed, kind, observed); s.previous = now; s.lastHitAt = clock(game, s); s.impacts++;
    return { played: play(game, severity, observed, 'impact'), direction: observed ? observed.direction : '', pan: observed ? observed.pan : null };
  }
  function tick(game, dt) {
    for (const sound of sounds.slice()) if (!active(sound.game) || !soundAllowed(sound.game) || finite(sound.context.currentTime) > sound.end + .1) destroy(sound);
    if (!active(game)) { stop(game); return false; }
    if (!Number.isFinite(dt) || dt < 0) return false;
    const s = state(game), at = clock(game, s), now = read(game);
    if (at < s.clock) { s.previous = now; s.alert = null; s.source = null; s.lastSoundAt = s.lastStressAt = -Infinity; }
    const changed = changes(s.previous, now), hitIncrease = now.hits > s.previous.hits || now.score > s.previous.score + .00001;
    if (changed.length || hitIncrease) issue(game, s, changed, 'instruments', null);
    s.previous = now; s.clock = at;
    if (s.alert && at >= s.alert.until) s.alert = null;
    if (s.source && (at < s.source.at || at - s.source.at > 1.25)) s.source = null;
    const ac = game.ac, speed = point(ac.v) ? Math.hypot(...ac.v.slice(0, 3)) : finite(ac.ias);
    // Actual damage + sustained measured loading, not a constant cinematic
    // rattle. Original Audio2 already reduces engine pitch with real eng damage.
    if (!ac.onDeck && speed > 60 && now.hyd > .1 && Math.abs(finite(ac.gLoad, 1)) > 2.5 && at - s.lastStressAt > 4) {
      if (play(game, .1, null, 'stress')) s.lastStressAt = at;
    }
    return true;
  }
  function view(game) {
    if (!active(game)) return { active: false, alert: null, source: null, sourceCount: 0, impacts: 0, emitted: 0 };
    const s = state(game), at = clock(game, s), alert = s.alert && at >= s.alert.at && at < s.alert.until ? s.alert : null;
    return { active: true, alert: alert ? { ...alert, systems: alert.systems.slice() } : null,
      source: s.source && at >= s.source.at && at - s.source.at <= 1.25 ? { ...s.source } : null,
      sourceCount: sounds.filter(sound => sound.game === game).length, impacts: s.impacts, emitted: s.emitted };
  }
  function makeUI() {
    const doc = root.document, host = doc && doc.getElementById('game'); if (!host) return null;
    const panel = doc.createElement('section'); panel.id = 'flightAirframeFeedback'; panel.hidden = true;
    panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
    const label = doc.createElement('small'); label.textContent = 'AIRCRAFT · INSTRUMENT / CREW REPORT';
    const title = doc.createElement('strong'); title.id = 'flightAirframeTitle';
    const detail = doc.createElement('span'); detail.id = 'flightAirframeDetail';
    panel.append(label, title, detail); host.append(panel); return { panel, title, detail };
  }
  function render(game) {
    if (!ui) ui = makeUI(); if (!ui) return false;
    const current = view(game), alert = current.alert; ui.panel.hidden = !alert;
    if (!alert) return false;
    ui.title.textContent = alert.title;
    ui.detail.textContent = (alert.direction ? 'INCOMING FROM ' + alert.direction + '. ' : '') + alert.detail;
    ui.panel.dataset.kind = alert.systems.includes('fire') || alert.systems.includes('pilot') || alert.systems.includes('bn') ? 'critical' : 'damage';
    return true;
  }
  function hide() { if (ui) ui.panel.hidden = true; }
  function dispose(game) { stop(game); if (!game || appOf(game) && appOf(game).game === game) hide(); if (game) records.delete(game); }
  function install(ctx) {
    if (!ctx || !ctx.App || installed) return false; context = ctx; installed = true;
    const app = ctx.App;
    for (const name of ['show', 'pause']) {
      const original = app[name]; if (typeof original !== 'function') continue;
      app[name] = function () {
        const result = original.apply(this, arguments);
        if (!active(this.game)) { stop(); hide(); }
        return result;
      };
    }
    return true;
  }
  root.FlightAirframeFeedback = Object.freeze({ install, tick, render, hit, source, view, active, stop, dispose,
    constants: Object.freeze({ maxSources: LIMIT, maxHistory: 6, newAudioContexts: 0, loops: 0, timers: 0 }) });
})(typeof window !== 'undefined' ? window : globalThis);
