/* Optional guidance and explicitly labeled practice chapter entry. No puzzle
   answers, escape outcomes, patrol positions or campaign qualifications are set. */
(function (root) {
  'use strict';
  const P = root.POW;
  const copy = x => JSON.parse(JSON.stringify(x));
  const CHAPTERS = {
    escape: { stage: 'cell', day: 1, target: 'bunk-bracket', label: 'October escape', task: 'Find the concealed bracket at the bunk. Turn toward the prompt and hold F / Interact.' },
    solitary: { stage: 'solitary', day: 17, target: 'cell-notebook', label: 'Solitary survival · practice', task: 'Inspect the notebook. Hold F / Interact, then explore an imagined project in 3D.' },
    regular: { stage: 'regular', day: 29, target: 'regular-observe', label: 'Second escape · fictional practice', task: 'Observe the guard routine at the door slot. Hold F / Interact until the work finishes.' },
    river: { stage: 'river', day: 1, target: null, label: 'Red River journey · fictional practice', task: 'Feel the current, watch the banks and approach a sheltered landing. Use reeds to break a patrol’s view.' }
  };
  function prefs() { return P.ctx && P.ctx.Store ? P.ctx.Store.get('pow_preferences', {}) || {} : {}; }
  function state(game) {
    const s = game.pow;
    if (!s.guidance) {
      const stageChapter = { cell: 'escape', solitary: 'solitary', regular: 'regular', river: 'river' }[s.stage];
      const chapter = stageChapter || 'escape';
      s.guidance = { version: 1, enabled: prefs().guidance !== false, chapter, step: stageChapter ? 0 : 4, completed: !stageChapter, actionSeen: false,
        startP: game.evade.p.slice(), startHeading: game.evade.hdg || 0, startLook: game.evade.look || 0 };
    }
    return s.guidance;
  }
  function enter(game, saved, previous) {
    if (saved && typeof saved === 'object') game.pow.guidance = copy(saved);
    const g = state(game);
    if (!saved && previous && previous.completed) { g.step = 4; g.completed = true; }
  }
  function startChapter(game, kind) {
    const chapter = CHAPTERS[kind];
    if (!chapter) throw new Error('Unknown POW chapter');
    if (P.Mindscape && P.Mindscape.active(game)) P.Mindscape.close(game, true);
    if (P.DentonFlashback) P.DentonFlashback.close();
    game.pow = null;
    const saved = { version: 2, stage: chapter.stage, day: chapter.day, time: 0, flags: {}, inventory: {}, complete: false, practice:kind === 'escape' ? null : kind };
    P.begin(game, chapter.stage, saved);
    const s = game.pow;
    s.practice = kind === 'escape' ? null : kind;
    delete s.guidance; state(game);
    if ((kind === 'solitary' || kind === 'regular') && P.Captivity) {
      const c = P.Captivity.state(game);
      c.captureDay = 1; c.captureYear = 1967; c.elapsedMinutes = (chapter.day - 1) * 1440;
      c.minute = kind === 'regular' ? 970 : 480;
    }
    P.notify(game, kind === 'escape'
      ? '12 October 1967 inspiration. The layout and dialogue are reconstructed. Coker and McKnight were recaptured; alternate escape outcomes are fictional.'
      : chapter.label + '. This standalone chapter does not award campaign transfer, escape or rescue. Your actions determine what happens next.');
    P.updateUI(game); P.save(game); return s;
  }
  function step(game) {
    if (!game || !game.pow || !game.evade || game.paused || game.pow.complete || P.Mindscape && P.Mindscape.active(game)) return;
    const s = game.pow, g = state(game), e = game.evade;
    if (!g.enabled || g.completed) return;
    const chapter = CHAPTERS[g.chapter] || CHAPTERS.escape;
    const angle = Math.atan2(Math.sin(e.hdg - g.startHeading), Math.cos(e.hdg - g.startHeading));
    const moved = Math.hypot(e.p[0] - g.startP[0], e.p[2] - g.startP[2]);
    if (g.step === 0 && (Math.abs(angle) > .25 || Math.abs((e.look || 0) - g.startLook) > .20)) g.step = 1;
    if (g.step === 1 && moved > .45 && s.input && (s.input.forward || s.input.strafe)) g.step = 2;
    if (g.step === 2 && g.actionSeen) g.step = 3;
    if (g.step === 2 && !chapter.target && s.river && (s.river.cover > .3 || s.cover > .3)) g.step = 3;
    const k = game.app && game.app.keys || {};
    if (g.step === 3 && !k.KeyF && !s.touchInteract && !(s.captivity && s.captivity.open)) {
      g.step = 4; g.completed = true; P.save(game);
      P.notify(game, 'Controls learned. Observe, choose your approach and release between held actions. You can replay guidance in Settings & controls.');
    }
  }
  function interaction(game, obj) {
    if (!game || !game.pow) return;
    const g = state(game), c = CHAPTERS[g.chapter] || CHAPTERS.escape;
    if (obj && (obj.id === c.target || g.chapter === 'river' && /^river-(rest|shelter|land)/.test(obj.id))) g.actionSeen = true;
  }
  function setEnabled(game, on) {
    const g = state(game); g.enabled = !!on;
    if (on && g.completed) { delete game.pow.guidance; state(game).enabled = true; }
    if (P.ctx && P.ctx.Store) P.ctx.Store.set('pow_preferences', Object.assign({}, prefs(), { guidance: !!on }));
    P.save(game); P.updateUI(game);
  }
  function skip(game) { const g = state(game); g.completed = true; g.step = 4; P.save(game); P.updateUI(game); }
  function text(game) {
    const g = state(game), c = CHAPTERS[g.chapter] || CHAPTERS.escape;
    if (!g.enabled || g.completed) return '';
    return [
      '1/4 · Look around: A/D or arrows turn; Q/E look up/down. Mouse look: Y. On touch, drag the right side.',
      '2/4 · Move a few steps: W/S or the left stick. Crouch to move quietly; running draws attention.',
      '3/4 · ' + c.task,
      '4/4 · Release F / Interact before the next action. Close the activity panel to return to the physical world.'
    ][g.step] || '';
  }
  function render(game) {
    const u = P.ui; if (!u || !u.guide || !game.pow) return;
    const message = text(game); u.guide.hidden = !message;
    if (message) u.guide.querySelector('[data-guide-text]').textContent = message;
    if (u.guidanceSetting) u.guidanceSetting.checked = state(game).enabled;
    const visible = !game.paused && !game.pow.complete && !game.pow.modalOpen && !(game.pow.captivity && game.pow.captivity.open);
    if (u.reticle) u.reticle.hidden = !visible;
    if (u.hands) {
      const h = game.pow.holding, f = game.pow.focus;
      u.hands.hidden = !(visible && h && f && f.hold >= 1 && !f.climb);
      if (!u.hands.hidden) {
        const t = h.t || 0;
        u.hands.style.transform = 'translateX(-50%) translateY(' + (4 + Math.sin(t * 9) * 3) + 'px) rotate(' + (Math.sin(t * 5) * 2) + 'deg)';
        if (P.ctx && P.ctx.firstPersonArt && u.hands.querySelector('img').getAttribute('src') !== P.ctx.firstPersonArt.fists) u.hands.querySelector('img').src = P.ctx.firstPersonArt.fists;
      }
    }
  }
  P.Guidance = { state, enter, startChapter, step, interaction, setEnabled, skip, text, render, chapters: copy(CHAPTERS) };
})(typeof window === 'undefined' ? globalThis : window);
