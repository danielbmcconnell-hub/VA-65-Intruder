/* Readable physical POW feedback. All patrol words are reconstructed game
   dialogue. Cues require a visible person or an audible nearby sound; this
   module never changes detection, navigation, collision or capture. */
(function (root) {
  'use strict';
  const P = root.POW = root.POW || {}, states = new WeakMap();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, otherwise) => Number.isFinite(v) ? v : otherwise;
  const angle = v => Math.atan2(Math.sin(v), Math.cos(v));
  const clock = game => finite(game.pow.aiClock, finite(game.pow.time, 0));
  const inactive = game => !game || !game.pow || !game.evade || game.paused || game.pow.complete || game.pow.modalOpen || game.pow.captivity && game.pow.captivity.open || P.Mindscape && P.Mindscape.active(game);
  const names = { patrol: 'walks the route', suspicious: 'pauses to watch', observe: 'watches unfamiliar movement', investigate: 'checks a disturbance', pursuit: 'pursues', search: 'searches the last seen area', flee: 'moves away to seek help' };
  function state(game) {
    let s = states.get(game);
    if (!s || s.pow !== game.pow) {
      const preferences = P.ctx && P.ctx.Store && P.ctx.Store.get ? P.ctx.Store.get('pow_feedback_preferences', {}) : {};
      s = { pow: game.pow, actors: new Map(), history: [], caption: null, heard: null, nextSoundAt: -1, nextHeardAt: -1, nextCaptionAt: -1, nextFootCaption: -1, current: null, hints: game.pow.feedbackHints !== undefined ? !!game.pow.feedbackHints : preferences.hints !== false };
      states.set(game, s);
    }
    return s;
  }
  function listener(game) {
    const e = game.evade, r = game.pow.river, eye = r ? finite(r.eyeHeight, .48) : e.crouch ? 1.16 : 1.68;
    return [e.p[0], e.p[1] + eye, e.p[2]];
  }
  function direction(game, p) {
    const e = game.evade, a = angle(Math.atan2(p[0] - e.p[0], -(p[2] - e.p[2])) - finite(e.hdg, 0));
    return Math.abs(a) < .45 ? 'ahead' : Math.abs(a) > 2.40 ? 'behind' : a < 0 ? 'left' : 'right';
  }
  function perceive(game, actor, kind) {
    if (!game || !game.pow || !game.evade || !actor || !actor.p || actor.alive === false) return { visible: false, audible: false, distance: Infinity, gain: 0, pan: 0, direction: '' };
    const e = game.evade, eye = listener(game), target = [actor.p[0], actor.p[1] + 1.25, actor.p[2]], dx = target[0] - eye[0], dz = target[2] - eye[2], horizontal = Math.hypot(dx, dz), distance = Math.hypot(horizontal, target[1] - eye[1]);
    const speech = kind === 'speech', reach = speech ? 25 : 15;
    const relative = angle(Math.atan2(dx, -dz) - finite(e.hdg, 0));
    const inFrame = Math.abs(relative) < 1.14 && Math.abs(Math.atan2(target[1] - eye[1], Math.max(horizontal, .01)) - finite(e.look, 0)) < .86;
    const light = clamp(finite(game.pow.river && game.pow.river.daylight, finite(game.pow.light, .65)), 0, 1), visualRange = actor.lamp ? 30 : 12 + 22 * light;
    const needRay = distance < reach || inFrame && distance < visualRange;
    const clear = needRay && (!P.los || P.los(game, eye, target));
    const wallReach = speech ? 9 : 6;
    const audible = !e.submerged && !e.underwater && distance < (clear ? reach : wallReach) && Math.abs(actor.p[1] - e.p[1]) < (clear ? 7 : 3.5);
    const gain = audible ? Math.pow(1 - distance / reach, 1.65) * (clear ? 1 : .20) : 0;
    return { visible: !e.submerged && !e.underwater && clear && inFrame && distance < visualRange, audible, distance, muffled: !clear, gain, pan: Math.sin(relative), direction: direction(game, actor.p) };
  }
  function remember(game, event) {
    const s = state(game); s.history.push(Object.assign({ at: clock(game) }, event));
    if (s.history.length > 48) s.history.splice(0, s.history.length - 48);
  }
  function say(game, actor, key, call) {
    if (inactive(game) || !call) return false;
    const info = perceive(game, actor, 'speech'), s = state(game), now = clock(game);
    const urgent = key === 'spotted' && s.caption && s.caption.key !== 'spotted' && now - finite(s.caption.at, now) >= .9;
    if (!info.audible || now < s.nextCaptionAt && !urgent) return false;
    s.nextCaptionAt = now + 1.8;
    const person = actor.armed === false || ['farmer', 'villager'].includes(actor.kind) ? 'Civilian' : 'Guard';
    const text = person + ' ' + info.direction + (info.muffled ? ', muffled' : '') + ': ' + call[0] + ' — ' + call[1] + ' (reconstructed)';
    s.caption = { text, at: now, until: now + 4.5, key, direction: info.direction };
    remember(game, { type: 'speech', key, text, direction: info.direction, muffled: info.muffled });
    // The existing application handles available browser voices. Captions are
    // authoritative; this does not promise a Vietnamese voice on every device.
    const app = game.app, audio = app && app.audio, set = app && app.set;
    if (set && set.sound && set.voices !== 0 && audio && audio.on && audio.ctx && audio.ctx.state === 'running' && typeof app.radio === 'function') app.radio(person.toUpperCase(), call[0] + ' — ' + call[1], 'warn', 'vi-VN', call[0]);
    return true;
  }
  function observableDescription(actor) {
    const attention = actor.attention || {}, person = actor.armed === false ? 'Civilian' : 'Guard';
    if (actor.state === 'investigate') return person + ' checks ' + (attention.reason === 'sound' ? 'a sound' : attention.reason === 'report' ? 'a reported disturbance' : 'the nearby area');
    if (actor.state === 'suspicious' || actor.state === 'observe') return person + ' pauses and looks toward suspicious movement';
    if (actor.state === 'pursuit') return person + ' is closing in';
    if (actor.state === 'search') return person + ' searches the last observed area';
    if (actor.state === 'flee') return 'Civilian moves away to seek help';
    return person + (actor.onPost || actor.spd < .2 ? ' looks around at the post' : ' walks the patrol route');
  }
  function hint(actor) {
    if (actor.state === 'pursuit') return 'Break sight behind solid cover. Running carries farther than slow, crouched movement.';
    if (actor.state === 'investigate') return actor.attention && actor.attention.reason === 'sound' ? 'The guard checks the remembered sound location. Pause noisy work; watch where the guard looks.' : 'Watch the guard’s direction before crossing an exposed opening.';
    if (actor.state === 'search') return 'The search follows the last observation. Stay out of sight and avoid a new disturbance.';
    if (['suspicious', 'observe', 'flee'].includes(actor.state)) return 'Avoid exposed movement. A civilian may alert a nearby patrol.';
    return 'Observe the walking route and pauses. A turning guard can see a different direction.';
  }
  function step(game, dt) {
    if (inactive(game) || !Number.isFinite(dt) || dt <= 0) { if (game && states.has(game)) states.get(game).current = null; return; }
    const s = state(game), now = clock(game), base = game.pow.base || [0, 0, 0], list = (game.evade.searchers || []).slice(0, 24), present = new Set();
    let observed = null, score = -1, footstep = null;
    for (let i = 0; i < list.length; i++) {
      const a = list[i], id = a.id || 'actor-' + i; present.add(id);
      const local = [a.p[0] - base[0], a.p[1] - base[1], a.p[2] - base[2]];
      let previous = s.actors.get(id);
      if (!previous) { previous = { p: local, state: a.state, stride: 0 }; s.actors.set(id, previous); }
      const distance = Math.hypot(local[0] - previous.p[0], local[2] - previous.p[2]), info = perceive(game, a, 'steps');
      if (a.alive !== false && info.visible) {
        const value = (a.state === 'pursuit' ? 8 : a.state === 'search' ? 5 : a.state === 'investigate' ? 4 : ['suspicious', 'observe', 'flee'].includes(a.state) ? 3 : 0) + 1 / Math.max(1, info.distance);
        if (value > score) { observed = { actor: a, info }; score = value; }
        if (a.state !== previous.state) remember(game, { type: 'observed', state: a.state, reason: a.attention && a.attention.reason || 'routine', text: observableDescription(a), direction: info.direction });
      }
      // Movement, not a timer or a speed flag, creates footsteps. Warp/recenter
      // discontinuities are discarded and corpses/stunned actors remain quiet.
      if (distance > .002 && distance < Math.max(.9, dt * 4.5) && a.alive !== false && !a.stunned && finite(a.stunUntil, -1) <= finite(game.t, now)) previous.stride += distance;
      else if (distance >= Math.max(.9, dt * 4.5) || a.alive === false) previous.stride = 0;
      if (previous.stride >= .78) {
        previous.stride %= .78;
        if (info.audible && (!footstep || info.gain > footstep.info.gain)) footstep = { actor: a, info };
      }
      previous.p = local; previous.state = a.state;
    }
    // One audible step per frame, chosen by acoustic strength rather than actor
    // roster order. Caption direction holds briefly instead of flickering among
    // several guards whose steps happen to land on neighbouring frames.
    if (footstep) {
      const a = footstep.actor, info = footstep.info;
      if (now >= s.nextHeardAt) {
        const text = (info.muffled ? 'Muffled ' : '') + (a.spd > 2 ? 'quick footsteps ' : 'footsteps ') + info.direction;
        s.heard = { text: text[0].toUpperCase() + text.slice(1), until: now + 1.8, direction: info.direction }; s.nextHeardAt = now + .45;
        if (now >= s.nextFootCaption) { remember(game, { type: 'footsteps', text: s.heard.text, direction: info.direction, muffled: info.muffled }); s.nextFootCaption = now + 3; }
      }
      const app = game.app, audio = app && app.audio;
      if (now >= s.nextSoundAt && app && app.set && app.set.sound && audio && audio.on && audio.ctx && audio.ctx.state === 'running' && typeof audio.burst === 'function') {
        audio.burst('thunk', Math.max(.003, .072 * info.gain * (game.pow.intensity === 'reduced' ? .62 : 1)), info.pan);
        s.nextSoundAt = now + .16;
      }
    }
    for (const id of s.actors.keys()) if (!present.has(id)) s.actors.delete(id);
    s.current = observed;
  }
  function view(game) {
    if (!game || !game.pow || !game.evade || inactive(game)) return { alert: '', detail: '', caption: '', danger: false, direction: '' };
    const s = state(game), now = clock(game), o = s.current;
    const caption = s.caption && s.caption.until > now ? s.caption.text : s.heard && s.heard.until > now ? s.heard.text : '';
    if (!o) return { alert: '', detail: s.hints && caption ? 'Listen for direction; walls can muffle nearby sounds. A sound does not establish the guard’s exact position.' : '', caption, danger: false, direction: s.heard && s.heard.until > now ? s.heard.direction : '' };
    return { alert: observableDescription(o.actor) + ' · ' + o.info.direction, detail: s.hints ? hint(o.actor) : '', caption, danger: o.actor.state === 'pursuit' && o.actor.visible === true, direction: o.info.direction };
  }
  function setHints(game, enabled) {
    if (!game || !game.pow) return false;
    const s = state(game); s.hints = !!enabled; game.pow.feedbackHints = s.hints;
    if (P.ctx && P.ctx.Store && P.ctx.Store.set) P.ctx.Store.set('pow_feedback_preferences', { hints: s.hints });
    return s.hints;
  }
  function snapshot(game) {
    if (!game || !game.pow || !game.evade) return null;
    const s = state(game);
    return { version: 1, hints: s.hints, history: JSON.parse(JSON.stringify(s.history.slice(-12))) };
  }
  function restore(game, saved) {
    if (!game || !game.pow || !game.evade || !saved || saved.version !== 1) return false;
    states.delete(game); const s = state(game); s.hints = saved.hints !== false; game.pow.feedbackHints = s.hints;
    // Recorded events may be inspected by tests/reporting. Historical captions,
    // shouts and footstep pulses never play again when restoring a checkpoint.
    s.history = Array.isArray(saved.history) ? saved.history.slice(-12).filter(q => q && typeof q.text === 'string').map(q => ({ at: finite(q.at, 0), type: String(q.type || 'observed'), text: q.text, direction: String(q.direction || '') })) : [];
    return true;
  }
  function history(game) { return game && game.pow ? JSON.parse(JSON.stringify(state(game).history)) : []; }
  P.Feedback = { step, view, say, perceive, direction, setHints, snapshot, restore, history, dialogueNote: 'All patrol dialogue is reconstructed gameplay text, not a documented quotation.' };
})(typeof window !== 'undefined' ? window : globalThis);
