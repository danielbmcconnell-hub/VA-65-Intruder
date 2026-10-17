/* Willard Egress presentation. Authored navigation captions and synthesized
 * pursuit audio; no archival voices or additional flight/combat simulation. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, RAD = 180 / Math.PI, NM = 1852;
  let context = null, ui = null, audio = null, listeners = false, focused = true;
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const phases = { strike: 'I · THE NIGHT STRIKE', contact: 'II · ENEMY INTERCEPTOR', defend: 'III · THE DOGFIGHT YOU CANNOT WIN', flak: 'IV · THE WILLARD EGRESS', egress: 'V · FEET WET', complete: 'WILLARD EGRESS · COMPLETE', failed: 'WILLARD EGRESS · AIRCRAFT LOST' };
  function current() { return context && context.App && context.App.game; }
  function airborne(game) {
    const app = context && context.App;
    return !!(game && game.willard && game.ac && !game.evade && !game.chute && !game.pow && !game.ejected && app && app.game === game && app.screen === 'game' && !app.graphicsContextLost);
  }
  function active(game) {
    return airborne(game) && !game.paused && !game.result && game.ac.alive !== false && !['complete', 'failed'].includes(game.willard.phase) && !(typeof document !== 'undefined' && document.hidden);
  }
  function point(game, destination) {
    if (!Array.isArray(destination) || destination.length < 3 || !destination.every(Number.isFinite) || !Array.isArray(game.ac.p)) return null;
    const dx = destination[0] - game.ac.p[0], dz = destination[2] - game.ac.p[2];
    return { bearing: String(Math.round((Math.atan2(dx, -dz) * RAD + 360) % 360) % 360).padStart(3, '0'), nm: Math.hypot(dx, dz) / NM };
  }
  function contact(game) {
    const w = game.willard, c = w.contact;
    if (!c) return 'CONTACT NOT HELD · LOOK AFT';
    const seenAt = Number.isFinite(c.lastSeen) ? c.lastSeen : c.lastseen;
    const age = Number.isFinite(seenAt) ? Math.max(0, finite(w.elapsed) - seenAt) : Infinity;
    if (c.observed !== true || age > 6 || !Number.isFinite(c.bearing)) return c.warning ? String(c.warning).slice(0, 100) : 'CONTACT NOT HELD · LOOK AFT';
    const relative = Math.atan2(Math.sin(c.bearing - finite(game.ac.yaw)), Math.cos(c.bearing - finite(game.ac.yaw)));
    const clock = ((Math.round(relative / TAU * 12) % 12) + 12) % 12 || 12;
    return (c.warning ? String(c.warning).slice(0, 70) + ' · ' : '') + 'CONTACT ABOUT ' + clock + ' O’CLOCK';
  }
  function snapshot(game) {
    if (!airborne(game)) return null;
    const w = game.willard, route = w.route || {};
    const target = w.recovery ? route.carrier : w.guidance?.point || (w.phase === 'egress' ? route.safe : w.phase === 'strike' ? route.strike || route.flak : ['contact','defend'].includes(w.phase) ? route.plan || route.flak : route.flak);
    const nav = point(game, target), navLabel = w.recovery ? 'CONSTELLATION RECOVERY' : w.phase === 'egress' ? 'COASTAL EGRESS' : w.phase === 'strike' ? 'OPTIONAL STRIKE' : ['contact','defend'].includes(w.phase) ? 'PLANNED EGRESS' : w.flakEntered ? 'BREAK TOWARD THE GULF' : 'NAM DINH DEFENSE ZONE';
    return { visible: active(game), phase: w.phase, title: w.phaseTitle || phases[w.phase] || 'WILLARD EGRESS', objective: String(w.objective || 'Fly the assigned egress. Keep your crew alive.'),
      contact: ['contact', 'defend', 'flak'].includes(w.phase) ? contact(game) : w.phase === 'egress' ? 'CHECK AFT · KEEP THE COAST AHEAD' : 'CREW · NAVIGATION AND STRIKE CHECK',
      navigation: nav ? navLabel + ' · ' + nav.bearing + '°' + (w.difficulty === 'ace' ? '' : ' · ' + nav.nm.toFixed(1) + ' NM') : '',
      rear: !!w.rear, external: !!game.extView, retry: !!w.checkpointLabel, checkpoint: w.checkpointLabel || 'No checkpoint yet', difficulty: w.difficulty || 'naval',
      reconstruction: 'Historical reconstruction · unidentified interceptor portrayed as a MiG-17PF. Crew dialogue is dramatized.' };
  }
  function disposeAudio() {
    if (!audio) return;
    for (const source of audio.sources) { try { source.stop(); } catch (_) {} }
    for (const node of audio.nodes) { try { node.disconnect(); } catch (_) {} }
    audio = null;
  }
  function sounds(game) {
    const app = context && context.App, a = app && app.audio;
    if (!active(game) || !focused || !app.set || !app.set.sound || !a || !a.on || !a.ctx || a.ctx.state !== 'running' || !a.master || !a.noiseBuf) { disposeAudio(); return; }
    const enemy = game.willard.enemy;
    if (!enemy || enemy.alive === false || !Array.isArray(enemy.p) || !Array.isArray(game.ac.p)) { disposeAudio(); return; }
    const range = Math.hypot(enemy.p[0] - game.ac.p[0], enemy.p[1] - game.ac.p[1], enemy.p[2] - game.ac.p[2]);
    const near = clamp(1 - range / 3200, 0, 1);
    if (!near) { disposeAudio(); return; }
    if (audio && (audio.game !== game || audio.ctx !== a.ctx || audio.master !== a.master)) disposeAudio();
    if (!audio) {
      const c = a.ctx, nodes = [], sources = [];
      // Two owned sources, both disposed on pause/retry/visibility/context loss.
      try {
        const gain = c.createGain(); nodes.push(gain); gain.gain.value = 0;
        const filter = c.createBiquadFilter(); nodes.push(filter); filter.type = 'bandpass'; filter.frequency.value = 360; filter.Q.value = .7;
        const rush = c.createBufferSource(); nodes.push(rush); sources.push(rush); rush.buffer = a.noiseBuf; rush.loop = true; rush.playbackRate.value = 1.3; rush.connect(filter);
        const turbine = c.createOscillator(); nodes.push(turbine); sources.push(turbine); turbine.type = 'triangle'; turbine.frequency.value = 155;
        const toneGain = c.createGain(); nodes.push(toneGain); toneGain.gain.value = .17; turbine.connect(toneGain); toneGain.connect(filter); filter.connect(gain);
        let panner = null;
        if (typeof c.createStereoPanner === 'function') { panner = c.createStereoPanner(); nodes.push(panner); gain.connect(panner); panner.connect(a.master); } else gain.connect(a.master);
        rush.start(); turbine.start(); audio = { game, ctx: c, master: a.master, sources, nodes, gain, filter, turbine, panner };
      } catch (_) {
        for (const source of sources) { try { source.stop(); } catch (_) {} }
        for (const node of nodes) { try { node.disconnect(); } catch (_) {} }
        return;
      }
    }
    const c = audio.ctx, now = finite(c.currentTime), angle = Math.atan2(enemy.p[0] - game.ac.p[0], -(enemy.p[2] - game.ac.p[2])) - finite(game.ac.yaw);
    const duck = now < finite(a.duckUntil) ? .4 : 1;
    audio.gain.gain.setTargetAtTime(near * near * .13 * duck, now, .16);
    audio.filter.frequency.setTargetAtTime(260 + near * 650, now, .18);
    audio.turbine.frequency.setTargetAtTime(135 + near * 135 + clamp(finite(enemy.speed), 0, 400) * .08, now, .18);
    if (audio.panner) audio.panner.pan.setTargetAtTime(clamp(Math.sin(angle) * .9, -.9, .9), now, .12);
  }
  function bindButton(node, action) {
    let press = null, touchClickUntil = 0;
    node.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || node.disabled) return;
      if (press && press.id !== event.pointerId) { press.moved = true; return; }
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    });
    node.addEventListener('pointermove', event => { if (press && press.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) press.moved = true; });
    node.addEventListener('pointercancel', () => { if (press) touchClickUntil = Date.now() + 700; press = null; });
    node.addEventListener('pointerup', event => {
      if (!press) return;
      touchClickUntil = Date.now() + 700;
      if (press.id !== event.pointerId) { press.moved = true; return; }
      const p = press; press = null; const r = node.getBoundingClientRect();
      if (node.disabled || p.moved || event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) return;
      action(event);
    });
    node.onclick = event => {
      const compatible = event.pointerType === 'touch' || event.sourceCapabilities && event.sourceCapabilities.firesTouchEvents || !event.pointerType && !event.sourceCapabilities;
      if (node.disabled || event.detail > 0 && compatible && Date.now() < touchClickUntil) return;
      action(event);
    };
  }
  const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
  function rear(game) {
    if (!active(game)) return false;
    game.willard.rear = !game.willard.rear;
    if (game.hud && game.willard.rear) game.hud.scope = false;
    render(game); return true;
  }
  function mount() {
    if (ui || typeof document === 'undefined') return ui;
    const host = document.getElementById('game'); if (!host) return null;
    const box = el('section'); box.id = 'willardHUD'; box.hidden = true; box.setAttribute('aria-label', 'Willard Egress mission guidance');
    const title = el('strong'), objective = el('p'), contactLine = el('p'), navigation = el('p');
    title.id = 'willardPhase'; objective.id = 'willardObjective'; contactLine.id = 'willardContact'; navigation.id = 'willardNavigation';
    const status = el('div'); status.className = 'willard-status'; status.append(title, objective, contactLine, navigation);
    const controls = el('div'); controls.id = 'willardControls'; controls.setAttribute('aria-label', 'Willard flight controls');
    const buttons = {};
    for (const [key, label, description] of [['rear', 'LOOK AFT · H', 'Toggle rearward view'], ['camera', 'VIEW · V', 'Toggle cockpit or chase camera'], ['retry', 'CHECKPOINT', 'Retry the latest mission checkpoint'], ['pause', 'PAUSE', 'Pause mission']]) {
      const b = el('button', label); b.id = 'willard' + key[0].toUpperCase() + key.slice(1); b.type = 'button'; b.setAttribute('aria-label', description); controls.append(b); buttons[key] = b;
    }
    const native = fn => event => { event.stopPropagation(); const game = current(); if (active(game)) fn(game); if (event.currentTarget && event.currentTarget.blur) event.currentTarget.blur(); };
    bindButton(buttons.rear, native(rear));
    bindButton(buttons.camera, native(game => { game.willard.rear = false; if (typeof context.toggleCamera === 'function') context.toggleCamera(game); else game.extView = !game.extView; render(game); }));
    bindButton(buttons.retry, native(game => { if (game.willard.checkpointLabel && typeof context.retry === 'function') { disposeAudio(); context.retry(game); } }));
    bindButton(buttons.pause, native(() => { if (typeof context.pause === 'function') context.pause(true); else if (context.App.pause) context.App.pause(true); render(current()); }));
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup']) box.addEventListener(type, event => event.stopPropagation());
    box.append(status, controls); host.append(box); ui = { box, title, objective, contact: contactLine, navigation, buttons }; return ui;
  }
  function render(game) {
    const u = mount(); if (!u) return;
    const s = snapshot(game); u.box.hidden = !s || !s.visible;
    if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('willard-flight', !!s && s.visible);
    if (!s || !s.visible) { disposeAudio(); return; }
    const write = (node, value) => { if (node.textContent !== value) node.textContent = value; };
    write(u.title, s.title); write(u.objective, s.objective); write(u.contact, s.contact); write(u.navigation, s.navigation);
    u.box.dataset.phase = s.phase; u.box.dataset.difficulty = s.difficulty; u.box.dataset.rear = String(s.rear);
    write(u.buttons.rear, s.rear ? 'LOOK FORWARD · H' : 'LOOK AFT · H'); u.buttons.rear.setAttribute('aria-pressed', String(s.rear));
    u.buttons.camera.setAttribute('aria-pressed', String(s.external)); u.buttons.retry.disabled = !s.retry || typeof context.retry !== 'function'; u.buttons.retry.title = s.checkpoint;
  }
  function events() {
    if (listeners || !root.addEventListener) return; listeners = true;
    root.addEventListener('keydown', event => {
      const target = event.target, tag = target && target.tagName;
      if (event.code !== 'KeyH' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || tag && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tag) || target && target.isContentEditable || !active(current())) return;
      event.preventDefault(); rear(current());
    });
    root.addEventListener('blur', () => { focused = false; disposeAudio(); });
    root.addEventListener('focus', () => { focused = true; });
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', () => { if (document.hidden) { disposeAudio(); render(current()); } });
    const canvas = typeof document !== 'undefined' && document.getElementById('gl');
    if (canvas && canvas.addEventListener) canvas.addEventListener('webglcontextlost', disposeAudio);
  }
  root.WillardPresentation = {
    install(ctx) { if (!ctx || !ctx.App) return false; if (context && context.App !== ctx.App) disposeAudio(); context = ctx; mount(); events(); render(current()); return true; },
    render, snapshot, rear, bindButton,
    step(game) { render(game); sounds(game); return snapshot(game); },
    stop() { disposeAudio(); if (ui) ui.box.hidden = true; if (typeof document !== 'undefined' && document.body) document.body.classList.remove('willard-flight'); },
    inspect() { return { ownedSources: audio ? audio.sources.length : 0, audioActive: !!audio, installed: !!context }; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
