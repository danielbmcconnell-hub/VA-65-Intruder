/* Ground-only view presentation and legacy pointer-lock look. Original actor
 * posture, collision, positions, AI, flight controls and saves stay authoritative.
 * A private camera cache eases stance changes; it never moves the player. */
(function (root) {
  'use strict';
  let context = null, installed = false, touchLook = null;
  const states = new WeakMap(), STAND = 1.68, CROUCH = 1.16, RATE = 12;
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const point = p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite);
  const appFor = g => context && context.App || g && g.app;
  function eligible(g) { return !!(g && g.evade && point(g.evade.p) && (!g.phase || g.phase === 'evade')); }
  function active(g) {
    const a = appFor(g), d = root.document;
    return eligible(g) && !g.paused && !g.result && !(g.pow && g.pow.complete) &&
      (!a || (a.game === undefined || a.game === g) && (!a.screen || a.screen === 'game' || a.screen === 'fixture') && !a.graphicsContextLost) && !(d && d.hidden);
  }
  function locked(g) {
    const d = root.document;
    return !!(active(g) && !g.pow && d && d.pointerLockElement && d.pointerLockElement === d.getElementById('stack'));
  }
  function blockedInput(g) {
    const d = root.document, node = d && d.activeElement;
    return !!(node && node.closest && node.closest('input,textarea,select,[contenteditable=true],[role=dialog][aria-modal=true]'));
  }
  function target(g) { return g.evade.crouch ? CROUCH : STAND; }
  function entry(g) {
    let s = states.get(g);
    if (!s || s.actor !== g.evade) {
      s = { actor: g.evade, height: target(g), target: target(g), p: g.evade.p.slice(0, 3), steps: 0, touchPitch: false };
      states.set(g, s);
    }
    return s;
  }
  function step(g, dt) {
    if (!active(g) || !Number.isFinite(dt) || dt <= 0) return false;
    // Swimming/underwater/boat height is owned by the existing river module.
    if (g.pow && g.pow.river) { states.delete(g); return false; }
    const s = entry(g), p = g.evade.p;
    if (Math.hypot(p[0] - s.p[0], p[2] - s.p[2]) > 32 || Math.abs(p[1] - s.p[1]) > 2.5) s.height = target(g);
    s.target = target(g);
    s.height += (s.target - s.height) * (1 - Math.exp(-RATE * Math.min(dt, .25)));
    s.height = clamp(s.height, CROUCH, STAND);
    if (Math.abs(s.height - s.target) < .00001) s.height = s.target;
    s.p = p.slice(0, 3); s.steps++; return true;
  }
  function eyeHeight(g, raw) {
    if (!eligible(g) || g.pow && g.pow.river || !Number.isFinite(raw) || raw < CROUCH - .001 || raw > STAND + .001) return raw;
    return entry(g).height;
  }
  function mouse(g, event) {
    if (!locked(g) || blockedInput(g) || !event) return false;
    const a = appFor(g), e = g.evade, sensitivity = clamp(finite(a && a.set && a.set.sens, 1), .25, 3);
    const dx = finite(event.movementX), dy = finite(event.movementY);
    e.hdg = finite(e.hdg) + dx * .0025 * sensitivity;
    // Start from the visible view: keyboard look may still be easing toward
    // pitchCmd when pointer lock begins. Reusing that target would jump the head.
    e.pitchCmd = clamp(finite(e.look, finite(e.pitchCmd)) - dy * .0025 * sensitivity, -.55, 1.15);
    e.look = e.pitchCmd;
    return true;
  }
  function holdPitch(g) {
    if (!active(g) || g.pow || blockedInput(g)) return false;
    const s = states.get(g);
    return locked(g) || !!(s && s.actor === g.evade && s.touchPitch);
  }
  function cancelTouch() {
    const previous = touchLook; touchLook = null;
    const d = root.document, stack = d && d.getElementById('stack');
    try { if (previous && stack && stack.hasPointerCapture && stack.hasPointerCapture(previous.id)) stack.releasePointerCapture(previous.id); } catch (_) {}
  }
  function touchAllowed(g) {
    const a = appFor(g);
    return active(g) && !g.pow && !g.evade.held && !g._solitaryActive && !blockedInput(g) &&
      (!a || !a.screen || a.screen === 'game');
  }
  function reset(g) { if (touchLook && touchLook.game === g) cancelTouch(); return !!g && states.delete(g); }
  function view(g) {
    if (!eligible(g)) return null;
    const s = entry(g); return { active: active(g), height: s.height, target: target(g), steps: s.steps, pointerLocked: locked(g), touchPitchHeld: s.touchPitch };
  }
  function install(c) {
    if (!c || !c.App || installed) return false;
    context = c; installed = true;
    // Flight mouse accumulators must not carry a previous flight into a new
    // ground sequence or survive pointer-lock release while on the ground.
    const clear = () => { const a = c.App; if (a.game && a.game.evade && a.gctl) { a.gctl.mx = 0; a.gctl.my = 0; } };
    if (root.document && root.document.addEventListener) root.document.addEventListener('pointerlockchange', clear);
    if (root.addEventListener) root.addEventListener('blur', () => { clear(); cancelTouch(); });
    const d = root.document, stack = d && d.getElementById('stack'), canvas = d && d.getElementById('gl');
    if (d && d.addEventListener) d.addEventListener('visibilitychange', () => { if (d.hidden) cancelTouch(); });
    if (canvas && canvas.addEventListener) canvas.addEventListener('webglcontextlost', cancelTouch);
    const app = c.App;
    if (typeof app.pause === 'function') {
      const pause = app.pause;
      app.pause = function(on) { if (on) cancelTouch(); return pause.apply(this, arguments); };
    }
    if (typeof app.show === 'function') {
      const show = app.show;
      app.show = function() { const result = show.apply(this, arguments); if (this.screen !== 'game' || touchLook && (touchLook.game !== this.game || touchLook.actor !== this.game?.evade)) cancelTouch(); return result; };
    }
    if (stack && stack.addEventListener) {
      stack.addEventListener('pointerdown', event => {
        const g = app.game;
        if (touchLook || !touchAllowed(g) || !['touch', 'pen'].includes(event.pointerType) || event.clientX < finite(root.innerWidth) * .43 ||
          event.target && event.target.closest && event.target.closest('button,input,textarea,select,a,[role=dialog],.tc,#stick,.veil')) return;
        touchLook = { game: g, actor: g.evade, id: event.pointerId, x: event.clientX, y: event.clientY };
        entry(g).touchPitch = true;
        try { if (stack.setPointerCapture) stack.setPointerCapture(event.pointerId); } catch (_) {}
        if (event.preventDefault) event.preventDefault();
      });
      stack.addEventListener('pointermove', event => {
        if (!touchLook || touchLook.id !== event.pointerId) return;
        const g = app.game;
        if (!touchAllowed(g) || touchLook.game !== g || touchLook.actor !== g.evade) { cancelTouch(); return; }
        const e = g.evade, sensitivity = clamp(finite(app.set && app.set.sens, 1), .25, 3);
        const x = finite(event.clientX, touchLook.x), y = finite(event.clientY, touchLook.y);
        e.hdg = finite(e.hdg) + (x - touchLook.x) * .006 * sensitivity;
        e.pitchCmd = clamp(finite(e.look, finite(e.pitchCmd)) - (y - touchLook.y) * .006 * sensitivity, -.55, 1.15);
        e.look = e.pitchCmd; touchLook.x = x; touchLook.y = y;
        if (event.preventDefault) event.preventDefault();
      });
      const release = event => { if (touchLook && touchLook.id === event.pointerId) cancelTouch(); };
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) stack.addEventListener(event, release);
    }
    return true;
  }
  root.GroundView = Object.freeze({ install, mouse, holdPitch, step, eyeHeight, reset, view,
    limits: Object.freeze({ standingHeight: STAND, crouchedHeight: CROUCH, easingRate: RATE, timers: 0, actorMutationsFromStance: 0 }) });
})(typeof window !== 'undefined' ? window : globalThis);
