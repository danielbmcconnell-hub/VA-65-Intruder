/* Ground-only view presentation and legacy pointer-lock look. Original actor
 * posture, collision, positions, AI, flight controls and saves stay authoritative.
 * A private camera cache eases stance changes; it never moves the player. */
(function (root) {
  'use strict';
  let context = null, installed = false;
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
      s = { actor: g.evade, height: target(g), target: target(g), p: g.evade.p.slice(0, 3), steps: 0 };
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
  function holdPitch(g) { return locked(g) && !blockedInput(g); }
  function reset(g) { return !!g && states.delete(g); }
  function view(g) {
    if (!eligible(g)) return null;
    const s = entry(g); return { active: active(g), height: s.height, target: target(g), steps: s.steps, pointerLocked: locked(g) };
  }
  function install(c) {
    if (!c || !c.App || installed) return false;
    context = c; installed = true;
    // Flight mouse accumulators must not carry a previous flight into a new
    // ground sequence or survive pointer-lock release while on the ground.
    const clear = () => { const a = c.App; if (a.game && a.game.evade && a.gctl) { a.gctl.mx = 0; a.gctl.my = 0; } };
    if (root.document && root.document.addEventListener) root.document.addEventListener('pointerlockchange', clear);
    if (root.addEventListener) root.addEventListener('blur', clear);
    return true;
  }
  root.GroundView = Object.freeze({ install, mouse, holdPitch, step, eyeHeight, reset, view,
    limits: Object.freeze({ standingHeight: STAND, crouchedHeight: CROUCH, easingRate: RATE, timers: 0, actorMutationsFromStance: 0 }) });
})(typeof window !== 'undefined' ? window : globalThis);
