/* Runtime graphics adaptation. The user's saved choice remains authoritative.
 * Samples only complete, foreground gameplay frames, after warmup; no timers,
 * extra requestAnimationFrame, storage writes or simulation changes. */
(function (root) {
  'use strict';
  const WARMUP_MS = 3000, SAMPLE_COUNT = 90, SLOW_MS = 48, MAX_GAP_MS = 250, LONG_FRAME_CONFIRM = 3;
  const states = new WeakMap();
  const quality = n => Math.max(0, Math.min(2, Math.round(Number(n) || 0)));
  const label = n => ['Low', 'Medium', 'High'][quality(n)];
  function allowed(app) {
    if (!app || !app.rend || !app.game || app.screen !== 'game' || app.graphicsContextLost) return false;
    const g = app.game;
    if (g.paused || g.result || ['dead', 'done'].includes(g.phase) || g.pow && g.pow.complete) return false;
    const doc = root.document;
    if (doc && (doc.hidden || doc.visibilityState === 'hidden')) return false;
    const loader = doc && doc.getElementById && doc.getElementById('loader');
    if (loader && !loader.hidden && loader.style && loader.style.display !== 'none') return false;
    return !(app.rend.gl && typeof app.rend.gl.isContextLost === 'function' && app.rend.gl.isContextLost());
  }
  function fresh(app) {
    return { renderer: app.rend, game: app.game, requested: quality(app.set && app.set.quality), effective: quality(app.rend.quality),
      last: null, warmup: 0, samples: [], longFrames: 0, dropped: false, notices: 0, changes: 0, lastAverage: null, reason: 'warming' };
  }
  function resetSamples(s, reason) { s.last = null; s.warmup = 0; s.samples.length = 0; s.longFrames = 0; s.reason = reason; }
  function state(app) {
    let s = states.get(app);
    const requested = quality(app.set && app.set.quality);
    if (!s || s.renderer !== app.rend || requested !== s.requested || quality(app.rend.quality) > s.effective) {
      s = fresh(app); states.set(app, s);
    } else if (s.game !== app.game) {
      s.game = app.game; resetSamples(s, 'new-game');
    }
    return s;
  }
  function observe(app, now) {
    if (!app || !app.rend || !Number.isFinite(now)) return false;
    const s = state(app);
    if (!allowed(app)) { resetSamples(s, 'inactive'); return false; }
    // Respect external quality changes and the saved preference's upper bound.
    s.effective = quality(app.rend.quality);
    if (s.effective > s.requested) { resetSamples(s, 'above-choice'); return false; }
    if (s.last === null) { s.last = now; return false; }
    let interval = now - s.last; s.last = now;
    if (!(interval > 0)) { resetSamples(s, 'invalid-clock'); s.last = now; return false; }
    if (s.dropped || s.effective === 0) { s.reason = s.dropped ? 'adapted' : 'low'; return false; }
    if (interval > MAX_GAP_MS) {
      // One long interval may be a resumed tab or an OS/shader hitch. Ignore
      // it and start a fresh warmup. Repeated completed foreground frames can
      // also genuinely run below 4 FPS: never reset forever in that case.
      const consecutive = Math.min(LONG_FRAME_CONFIRM, s.longFrames + 1);
      if (consecutive === 1) { resetSamples(s, 'resume-gap'); s.last = now; }
      s.longFrames = consecutive;
      if (consecutive < LONG_FRAME_CONFIRM) return false;
      // Bound the contribution of each long frame. A large clock jump must
      // not instantly satisfy warmup or dominate a whole sample window.
      interval = MAX_GAP_MS;
    } else s.longFrames = 0;
    if (s.warmup < WARMUP_MS) { s.warmup += interval; s.reason = 'warming'; return false; }
    s.samples.push(interval); s.reason = 'sampling';
    if (s.samples.length < SAMPLE_COUNT) return false;
    const sorted = s.samples.slice().sort((a, b) => a - b);
    // Discard the single slowest sample. One sporadic shader/OS hitch cannot
    // lower a session whose remaining measured frame cadence is playable.
    const average = sorted.slice(0, -1).reduce((a, b) => a + b, 0) / (SAMPLE_COUNT - 1);
    s.lastAverage = average; s.samples.length = 0;
    if (average <= SLOW_MS) { s.reason = 'stable'; return false; }
    const next = Math.max(0, Math.min(s.requested, s.effective - 1));
    if (next >= s.effective) return false;
    app.rend.quality = next; app.rend.W = 0;
    if (typeof app.resize === 'function') app.resize();
    s.effective = next; s.dropped = true; s.changes++; s.reason = 'adapted';
    if (typeof app.radio === 'function') {
      app.radio('SHIP', 'Graphics reduced for this session to keep play responsive. Settings retain your choice.', 'warn'); s.notices++;
    }
    return true;
  }
  // Call from the existing explicit Graphics setting callback after it applies
  // the renderer quality. This also handles reapplying the SAME saved choice.
  function userChanged(app) {
    if (!app || !app.rend) return false;
    states.set(app, fresh(app)); return true;
  }
  function inspect(app) {
    if (!app || !app.rend) return null;
    const s = states.get(app), requested = quality(app.set && app.set.quality), effective = quality(app.rend.quality);
    return { requested, effective, requestedLabel: label(requested), effectiveLabel: label(effective),
      adaptive: !!(s && s.renderer === app.rend && s.dropped && effective < requested),
      samples: s ? s.samples.length : 0, warmup: s ? s.warmup : 0, changes: s ? s.changes : 0,
      notices: s ? s.notices : 0, average: s ? s.lastAverage : null, longFrames: s ? s.longFrames : 0,
      reason: s ? s.reason : 'new' };
  }
  function reset(app) { return !!app && states.delete(app); }
  root.QualityPolicy = Object.freeze({ observe, userChanged, inspect, reset, allowed,
    limits: Object.freeze({ warmupMS: WARMUP_MS, sampleCount: SAMPLE_COUNT, slowMS: SLOW_MS, maxGapMS: MAX_GAP_MS,
      longFrameConfirm: LONG_FRAME_CONFIRM, maxAutomaticDrops: 1 }) });
})(typeof window !== 'undefined' ? window : globalThis);
