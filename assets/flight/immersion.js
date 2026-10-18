/* Presentation only: actual combat lights and a saved night-display preference.
 * No flight forces, target identities, hit decisions or timers are changed. */
(function (root) {
  'use strict';
  const records = new WeakMap();
  let context = null, installed = false;
  const point = p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite);
  const cloneLight = p => [p[0], p[1], p[2], p[3], p[4], Array.isArray(p[5]) ? p[5].slice() : [1, .46, .13]];
  function active(g) {
    return !!(g && g.mis && g.mis.willard && g.willard && g.ac && g.ac.alive !== false && !g.pow && !g.evade && !g.chute && !g.result && !['done', 'dead'].includes(g.phase));
  }
  function lights(game, eye, original, quality) {
    const base = Array.isArray(original) ? original : [];
    if (!active(game)) return base;
    const limit = quality === 0 ? 4 : 8;
    const valid = l => point(l) && Number.isFinite(l[3]) && l[3] > 0;
    const candidates = base.filter(valid).map(p => ({ light: cloneLight(p), source: 'strike' }));
    const scene = root.FlightRouteScene;
    if (scene && typeof scene.lights === 'function') for (const p of scene.lights(game, eye, quality)) if (valid(p)) candidates.push({ light: cloneLight(p), source: 'landmark' });
    // Only a real, freshly detonated hostile shell can light nearby geometry.
    for (const b of game.willard.flak && game.willard.flak.bursts || []) {
      if (!point(b.p) || !Number.isFinite(b.age) || b.age < 0 || b.age >= .42 || !(b.radius > 0)) continue;
      const decay = (1 - b.age / .42) ** 2;
      candidates.push({ light: [b.p[0], b.p[1], b.p[2], 2.4 * decay, Math.min(260, b.radius * 3.4), [1, .70, .34]], source: 'flak' });
    }
    const viewer = point(eye) ? eye : game.ac.p;
    const value = p => p[3] * Math.max(1, p[4] || 47) ** 2 / (400 + (p[0] - viewer[0]) ** 2 + (p[1] - viewer[1]) ** 2 + (p[2] - viewer[2]) ** 2);
    candidates.sort((a, b) => value(b.light) - value(a.light));
    const selected = candidates.slice(0, limit), result = selected.map(p => p.light);
    const sourceCounts = { strike: 0, landmark: 0, flak: 0 };
    for (const item of selected) sourceCounts[item.source]++;
    records.set(game, { lastLights: result.map(cloneLight), sourceCounts, limit, active: true });
    return result;
  }
  function control(host, game, id) {
    const scene = root.FlightRouteScene;
    if (!host || !scene || !scene.getVisibility || !scene.setVisibility) return;
    host.querySelector('#' + id + 'Panel')?.remove();
    const panel = document.createElement('section'); panel.id = id + 'Panel'; panel.className = 'flight-night-control';
    const label = document.createElement('label'); label.htmlFor = id; label.textContent = 'Night visibility';
    const input = document.createElement('input'); input.id = id; input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '5'; input.value = String(Math.round(scene.getVisibility() * 100));
    const output = document.createElement('output'); output.htmlFor = id; output.id = id + 'Readout';
    const text = document.createElement('p'); text.textContent = 'Adjust for your screen. Moonlit terrain and obstacles should stay visible; village lamps and flak remain bright.';
    const show = () => { output.textContent = input.value + '%'; input.setAttribute('aria-valuetext', input.value + ' percent visibility'); };
    input.addEventListener('input', () => { scene.setVisibility(Number(input.value) / 100); show(); if (game && game === context.App.game && game.paused && !context.App.graphicsContextLost) game.render(0); });
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup', 'wheel']) panel.addEventListener(type, event => event.stopPropagation());
    show(); panel.append(label, input, output, text); host.append(panel);
  }
  function install(ctx) {
    if (!ctx || !ctx.App || installed) return false;
    context = ctx; installed = true;
    const brief = ctx.App.brief;
    ctx.App.brief = function (mission) { const result = brief.apply(this, arguments); if (mission && mission.willard) control(document.getElementById('willardBrief'), null, 'flightNightVisibility'); return result; };
    const pause = ctx.App.pause;
    ctx.App.pause = function (on) { const result = pause.apply(this, arguments); if (on && active(this.game)) control(document.getElementById('pauseBody'), this.game, 'flightNightPause'); return result; };
    return true;
  }
  function inspect(game) {
    const r = records.get(game);
    return r && active(game) ? { ...r, lastLights: r.lastLights.map(cloneLight), sourceCounts: { ...r.sourceCounts } } : { lastLights: [], sourceCounts: { strike: 0, landmark: 0, flak: 0 }, active: false, limit: 0 };
  }
  root.FlightImmersion = Object.freeze({ lights, install, inspect, active });
})(typeof window !== 'undefined' ? window : globalThis);
