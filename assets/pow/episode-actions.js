/* Physical interaction presentation for the original escape episode. Work is
   read from the real core hold/traversal state. This module never grants tools,
   opens collision, advances a task, or changes a historical photograph. */
(function (root) {
  'use strict';
  const P = root.POW = root.POW || {}, records = new WeakMap();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, otherwise) => Number.isFinite(v) ? v : otherwise;
  const now = game => finite(game.pow.time, 0);
  const permitted = new Set(['cell', 'compound', 'hanoi', 'river']);
  const WORK = {
    'bunk-bracket': { pose: 'rummage', tool: 'cloth', label: 'Lift the mat and work the concealed bracket free', cadence: .85, volume: .015 },
    'door-fitting': { pose: 'loosen', tool: 'bracket', label: 'Brace the fitting · work the bolt clear', cadence: .64, volume: .025 },
    'roof-rope': { pose: 'gather-rope', tool: 'rope', label: 'Gather the coiled rope', cadence: .82, volume: .013 },
    'roof-descent': { pose: 'tie-rope', tool: 'rope', label: 'Loop the rope around the parapet hook', cadence: .84, volume: .018 }
  };
  const svg = body => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><defs><linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a7b0ad"/><stop offset=".45" stop-color="#5b6869"/><stop offset=".7" stop-color="#d1d7cf"/><stop offset="1" stop-color="#404d4d"/></linearGradient><linearGradient id="cloth"><stop stop-color="#b4a28b"/><stop offset="1" stop-color="#635b4c"/></linearGradient></defs>' + body + '</svg>');
  // Original illustrated tools, made for this interaction layer. The existing
  // stylized hands are supplied separately through ctx.firstPersonArt.fists.
  const ART = {
    bracket: svg('<path d="M137 45 L174 45 L174 233 L218 233 L218 263 L137 263Z" fill="url(#steel)" stroke="#263337" stroke-width="5"/><path d="M145 58L167 58M145 212L167 212M182 243L203 243" stroke="#e0e3d5" stroke-width="3"/><circle cx="154" cy="84" r="8" fill="#263337"/><circle cx="154" cy="184" r="8" fill="#263337"/>'),
    cloth: svg('<path d="M58 90 Q111 69 166 85 Q210 91 254 72 L270 219 Q218 211 184 239 Q109 243 67 225Z" fill="url(#cloth)" stroke="#454739" stroke-width="5"/><path d="M81 95L93 216M116 88L122 232M155 91L157 232M197 93L195 227M234 88L226 211M70 124Q166 114 256 110M74 159Q165 149 261 151M76 194Q178 196 267 191" stroke="#cfbea1" stroke-width="2" opacity=".5"/><path d="M92 213L111 222M220 219L243 204" stroke="#514d41" stroke-width="4"/>'),
    rope: svg('<g fill="none" stroke-linecap="round"><path d="M124 235 Q49 265 66 178 Q80 109 226 122 Q276 135 244 213 Q219 267 112 220" stroke="#423b2e" stroke-width="15"/><path d="M124 235 Q49 265 66 178 Q80 109 226 122 Q276 135 244 213 Q219 267 112 220" stroke="#c1a57a" stroke-width="9"/><path d="M122 221 Q73 234 88 181 Q105 135 221 144 Q253 153 225 211 Q212 240 122 208M127 207 Q106 223 107 178 Q127 157 212 164 Q237 174 208 208 Q171 226 128 191M130 189 Q115 167 188 177 Q215 184 183 201" stroke="#c5aa80" stroke-width="9"/><path d="M116 225Q76 277 55 276M222 141Q253 106 267 59" stroke="#423b2e" stroke-width="13"/><path d="M116 225Q76 277 55 276M222 141Q253 106 267 59" stroke="#c5aa80" stroke-width="8"/><path d="M69 173L84 178M93 140L103 151M161 129L160 144M216 137L211 151M236 174L222 177M207 222L202 209M138 238L139 223" stroke="#796245" stroke-width="4"/></g>'),
    pebble: svg('<path d="M106 184L118 151L156 135L186 145L204 173L197 199L164 213L128 206Z" fill="#77756a" stroke="#313a37" stroke-width="5"/><path d="M118 153L152 151L186 146L172 179L128 197Z" fill="#a5a397"/><path d="M172 179L197 198L164 212L130 205Z" fill="#595f57"/>')
  };
  let ui;
  function inactive(game) { return !game || !game.pow || !game.evade || !permitted.has(game.pow.stage) || game.pow.regular && game.pow.stage !== 'river' || game.pow.complete || game.paused || game.pow.modalOpen || game.pow.captivity && game.pow.captivity.open || P.Mindscape && P.Mindscape.active(game); }
  function wet(game) { return !!(game.pow.river && ['swim', 'float', 'dive'].includes(game.pow.river.mode)); }
  function record(game) {
    let r = records.get(game);
    if (!r || r.pow !== game.pow) {
      const inventory = game.pow.inventory || {};
      r = { pow: game.pow, scene: null, bolt: null, boltOrigin: null, boltProgress: 0, previousBracket: !!inventory.bracket, previousRope: !!inventory.rope, previousDoorOpen: !!(game.pow.flags && game.pow.flags.doorOpen), previousTraversal: !!game.pow.traversal, previousWet: wet(game), pulse: null, working: '', nextSound: 0, sounds: 0, throws: 0, entries: 0, descriptor: { active: false, pose: 'none', progress: 0 } };
      records.set(game, r);
    }
    return r;
  }
  function enter(game, saved) {
    if (!game || !game.pow || !game.evade) return false;
    records.delete(game); const r = record(game);
    if (saved && saved.version === 1) { r.throws = Math.max(0, Math.floor(finite(saved.throws, 0))); r.entries = Math.max(0, Math.floor(finite(saved.entries, 0))); }
    render(game); return true;
  }
  function reduced(game) { return game.pow.intensity === 'reduced' || typeof root.matchMedia === 'function' && root.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function audio(game, volume, p, water) {
    if (inactive(game)) return false;
    const app = game.app, sound = app && app.audio, r = record(game);
    if (!app || !app.set || !app.set.sound || !sound || !sound.on || !sound.ctx || sound.ctx.state !== 'running' || now(game) < r.nextSound) return false;
    const e = game.evade, origin = p || e.p, dx = origin[0] - e.p[0], dz = origin[2] - e.p[2], distance = Math.hypot(dx, dz, origin[1] - e.p[1]);
    if (distance > 22) return false;
    const relative = Math.atan2(dx, -dz) - finite(e.hdg, 0), pan = distance < .15 ? 0 : Math.sin(relative);
    const muffled = distance > .35 && P.los && !P.los(game, [e.p[0], e.p[1] + 1.25, e.p[2]], [origin[0], origin[1] + .15, origin[2]]);
    const attenuation = clamp(1 - distance / 22, 0, 1) * (muffled ? .35 : 1), level = Math.max(.002, volume * attenuation * (reduced(game) ? .6 : 1));
    if (water && !reduced(game) && typeof sound.footfall === 'function') sound.footfall(true, false);
    else if (typeof sound.burst === 'function') sound.burst('thunk', level, pan);
    else return false;
    r.nextSound = now(game) + .16; r.sounds++; return true;
  }
  function event(game, kind, p) {
    if (inactive(game)) return false;
    const r = record(game), time = now(game);
    if (kind === 'pebble-impact') return audio(game, .055, p);
    const poses = { throw: ['throw', 'pebble', .65, 'Throw the pebble'], 'water-entry': ['water-entry', '', .9, 'Ease into the river'], latch: ['latch', 'bracket', .45, 'The bolt is clear'], 'take-bracket': ['take-bracket', 'bracket', .65, 'The bracket is in your hand'], 'take-rope': ['gather-rope', 'rope', .7, 'Gather the rope'], landing: ['landing', '', .45, 'Feet on the ground'] };
    const info = poses[kind]; if (!info) return false;
    r.pulse = { pose: info[0], tool: info[1], start: time, until: time + info[2], label: info[3] };
    if (kind === 'throw') r.throws++;
    if (kind === 'water-entry') { r.entries++; audio(game, .050, p, true); }
    if (kind === 'latch' || kind === 'landing') audio(game, kind === 'latch' ? .045 : .026, p);
    r.descriptor = describe(game, r); render(game);
    return true;
  }
  function animateBolt(game, r, target, dt) {
    const scene = game.campGeo || [];
    const bolt = scene.find(q => q.id === 'door-bolt') || null;
    r.scene = scene;
    // Removing a settled stone or rebuilding decoration replaces the array
    // while retaining this same animated mesh. Only a new bolt has a new origin.
    if (r.bolt !== bolt) {
      r.bolt = bolt; r.boltOrigin = bolt ? bolt.p.slice() : null;
      r.boltProgress = 0;
    }
    if (!r.bolt || !r.boltOrigin || game.pow.flags && game.pow.flags.doorOpen) return;
    r.boltProgress += (target - r.boltProgress) * Math.min(1, dt * 9);
    if (Math.abs(r.boltProgress - target) < .001) r.boltProgress = target;
    // Presentation only: the separate core solids remain locked until the actual
    // interaction completes. The visible bolt retracts a little farther per turn.
    const ease = r.boltProgress * r.boltProgress * (3 - 2 * r.boltProgress);
    r.bolt.p[0] = r.boltOrigin[0] - .36 * ease;
    r.bolt.p[1] = r.boltOrigin[1] - .035 * ease;
  }
  function describe(game, r) {
    const s = game.pow, holding = s.holding, focus = s.focus;
    if (s.traversal) {
      const t = s.traversal, progress = clamp(finite(t.t, 0) / Math.max(.01, finite(t.duration, 4)), 0, 1);
      return { active: true, pose: t.kind === 'climb' ? 'climb' : 'descent', tool: 'rope', progress, phase: finite(t.t, 0) * 5.2, label: 'Grip · lower one hand · grip again', held: true };
    }
    if (holding && focus && holding.id === focus.id && WORK[holding.id]) {
      const task = WORK[holding.id];
      if (focus.canHold && !focus.canHold(game, focus)) return { active: false, pose: 'none', progress: 0 };
      const progress = clamp(finite(holding.t, 0) / Math.max(.01, finite(focus.hold, .15)), 0, 1);
      return Object.assign({ active: true, held: true, progress, phase: finite(holding.t, 0) * 6, id: holding.id }, task, { tool: holding.id === 'bunk-bracket' && progress > .67 ? 'bracket' : task.tool });
    }
    if (r.pulse && now(game) < r.pulse.until) return Object.assign({ active: true, held: false, progress: clamp((now(game) - r.pulse.start) / (r.pulse.until - r.pulse.start), 0, 1), phase: (now(game) - r.pulse.start) * 6 }, r.pulse);
    if (wet(game) && game.pow.river.mode === 'swim' && Math.hypot(finite(s.input && s.input.forward, 0), finite(s.input && s.input.strafe, 0)) > .15) return { active: true, pose: 'swim', tool: '', progress: 0, phase: now(game) * 3.2, label: 'Stroke into the current', held: false };
    return { active: false, pose: 'none', progress: 0 };
  }
  function step(game, dt) {
    if (!game || !game.pow || !game.evade) { if (ui) ui.hidden = true; return false; }
    const r = record(game);
    if (inactive(game)) { r.descriptor = { active: false, pose: 'none', progress: 0 }; r.working = ''; render(game); return false; }
    dt = clamp(finite(dt, 0), 0, .1);
    const inventory = game.pow.inventory || {};
    if (!r.previousBracket && inventory.bracket) event(game, 'take-bracket');
    if (!r.previousRope && inventory.rope) event(game, 'take-rope');
    if (!r.previousDoorOpen && game.pow.flags && game.pow.flags.doorOpen) event(game, 'latch');
    if (r.previousTraversal && !game.pow.traversal && game.pow.stage === 'hanoi') event(game, 'landing');
    if (!r.previousWet && wet(game)) event(game, 'water-entry');
    r.previousBracket = !!inventory.bracket; r.previousRope = !!inventory.rope; r.previousDoorOpen = !!(game.pow.flags && game.pow.flags.doorOpen); r.previousTraversal = !!game.pow.traversal; r.previousWet = wet(game);
    const descriptor = describe(game, r), previous = r.working;
    if (descriptor.held) r.pulse = null;
    r.descriptor = descriptor; r.working = descriptor.held ? descriptor.id || descriptor.pose : '';
    if (r.working !== previous) r.nextWorkSound = now(game) + .18;
    if (descriptor.held && now(game) >= finite(r.nextWorkSound, Infinity)) {
      const focus = game.pow.focus; audio(game, descriptor.volume || .015, focus && focus.p);
      r.nextWorkSound = now(game) + (descriptor.cadence || .84);
    }
    animateBolt(game, r, descriptor.pose === 'loosen' ? descriptor.progress : 0, dt);
    render(game); return true;
  }
  function view(game) {
    if (!game || !game.pow || !game.evade || inactive(game)) return { active: false, pose: 'none', progress: 0 };
    return Object.assign({}, record(game).descriptor);
  }
  function busy(game) {
    if (!game || !game.pow || !game.evade || inactive(game)) return false;
    const r = record(game);
    return !!(game.pow.holding || game.pow.traversal || r.pulse && now(game) < r.pulse.until);
  }
  function ensureUI() {
    if (ui || !root.document) return ui;
    const d = root.document, parent = P.ui && P.ui.root || d.getElementById('powHUD');
    if (!parent) return null;
    ui = d.createElement('div'); ui.id = 'powEpisodeActions'; ui.hidden = true; ui.setAttribute('aria-hidden', 'true');
    const canvas = d.createElement('div'); canvas.className = 'episode-action-view'; canvas.dataset.episodeAction = ''; ui.appendChild(canvas);
    for (const side of ['left', 'right']) { const wrapper = d.createElement('div'); wrapper.className = 'episode-action-hand episode-action-' + side; wrapper.dataset['action' + side[0].toUpperCase() + side.slice(1)] = ''; const image = d.createElement('img'); image.alt = ''; image.draggable = false; wrapper.appendChild(image); canvas.appendChild(wrapper); }
    const tool = d.createElement('img'); tool.className = 'episode-action-tool'; tool.dataset.actionTool = ''; tool.alt = ''; tool.draggable = false; canvas.appendChild(tool);
    const ripple = d.createElement('div'); ripple.className = 'episode-action-ripple'; ripple.dataset.actionRipple = ''; canvas.appendChild(ripple);
    parent.appendChild(ui); return ui;
  }
  function render(game) {
    const descriptor = view(game), overlay = ensureUI(); if (!overlay) return descriptor;
    overlay.hidden = !descriptor.active;
    if (!descriptor.active) return descriptor;
    const canvas = overlay.querySelector('[data-episode-action]'), left = overlay.querySelector('[data-action-left]'), right = overlay.querySelector('[data-action-right]'), tool = overlay.querySelector('[data-action-tool]'), ripple = overlay.querySelector('[data-action-ripple]');
    canvas.dataset.pose = descriptor.pose; canvas.dataset.progress = descriptor.progress.toFixed(3); canvas.dataset.tool = descriptor.tool || ''; canvas.dataset.label = descriptor.label || '';
    const handArt = P.ctx && P.ctx.firstPersonArt && P.ctx.firstPersonArt.fists;
    for (const wrapper of [left, right]) { const image = wrapper.querySelector('img'); if (handArt && image.getAttribute('src') !== handArt) image.src = handArt; wrapper.hidden = !handArt; }
    const quiet = reduced(game) ? .35 : 1, wave = Math.sin(descriptor.phase || 0), phase = descriptor.progress, rope = ['tie-rope', 'gather-rope', 'descent', 'climb'].includes(descriptor.pose), throwPose = descriptor.pose === 'throw', water = ['swim', 'water-entry'].includes(descriptor.pose);
    let lx = rope ? 22 + wave * 7 * quiet : 24 + wave * 3 * quiet, ly = rope ? -9 - wave * 14 * quiet : -12 + wave * 4 * quiet;
    let rx = rope ? -20 - wave * 7 * quiet : -26 - wave * 5 * quiet, ry = rope ? -9 + wave * 14 * quiet : -16 - wave * 6 * quiet;
    if (throwPose) { rx = -14 + Math.sin(phase * Math.PI) * 48 * quiet; ry = -12 - Math.sin(phase * Math.PI) * 75 * quiet; }
    if (water) { lx = 8 - wave * 13 * quiet; rx = -8 + wave * 13 * quiet; ly = -14 + wave * 11 * quiet; ry = -14 - wave * 11 * quiet; }
    left.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + ly.toFixed(1) + 'px) rotate(' + (wave * 3 * quiet).toFixed(1) + 'deg)';
    right.style.transform = 'translate(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px) rotate(' + (-wave * 5 * quiet + (throwPose ? phase * 18 * quiet : 0)).toFixed(1) + 'deg)';
    tool.hidden = !descriptor.tool;
    if (descriptor.tool) { if (tool.getAttribute('src') !== ART[descriptor.tool]) tool.src = ART[descriptor.tool]; tool.style.transform = 'translate(-50%,' + (-5 + wave * 4 * quiet).toFixed(1) + 'px) rotate(' + (descriptor.pose === 'loosen' ? -26 + wave * 8 * quiet : rope ? 8 + wave * 4 * quiet : throwPose ? 12 + phase * 35 : -8).toFixed(1) + 'deg)'; tool.style.opacity = throwPose && phase > .38 ? String(clamp(1 - (phase - .38) * 5, 0, 1)) : '1'; }
    ripple.hidden = descriptor.pose !== 'water-entry'; ripple.style.transform = 'translate(-50%,0) scale(' + (1 + phase * .65 * quiet).toFixed(2) + ')'; ripple.style.opacity = String(clamp(1 - phase, 0, 1));
    return descriptor;
  }
  function snapshot(game) {
    if (!game || !game.pow || !game.evade) return null;
    const r = record(game); return { version: 1, throws: r.throws, entries: r.entries };
  }
  function restore(game, saved) { return !!(saved && saved.version === 1 && enter(game, saved)); }
  P.EpisodeActions = { enter, step, render, view, busy, event, snapshot, restore, art: ART, limits: { minimumSoundInterval: .16, workCadence: .64, illustrationCount: 4, history: 0 } };
})(typeof window !== 'undefined' ? window : globalThis);
