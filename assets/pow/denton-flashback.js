/* Optional history lesson. The supplied photograph stays static and unchanged;
   a separate authored Morse signal illustrates the documented message. */
(function (root) {
  'use strict';
  const P = root.POW = root.POW || {};
  const MESSAGE = 'TORTURE';
  const MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
    K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
    U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..'
  };
  let dialog = null, session = null, frame = 0, lastFrame = null;
  let readyRoomState = null;
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  function initial() {
    return { version: 1, decoded: '', pattern: '', selected: '', observed: [], completed: false, playbackCount: 0,
      feedback: 'Optional observation exercise. Replay a letter, count its marks, then identify it with the Morse chart.' };
  }
  function state(game) {
    let s;
    if (game && game.pow) {
      game.pow.captivity = game.pow.captivity || {};
      s = game.pow.captivity.flashback = game.pow.captivity.flashback || initial();
    } else s = readyRoomState = readyRoomState || initial();
    if (!Array.isArray(s.observed)) s.observed = [];
    if (typeof s.pattern !== 'string') s.pattern = '';
    if (typeof s.decoded !== 'string' || !MESSAGE.startsWith(s.decoded)) s.decoded = '';
    s.completed = s.decoded === MESSAGE;
    return s;
  }
  function encode(text) {
    return String(text || '').toUpperCase().split('').filter(letter => MORSE[letter] || /\s/.test(letter)).map(letter => MORSE[letter] || '/');
  }
  function decode(marks) {
    if (typeof marks !== 'string' || !/^[.-]{1,4}$/.test(marks)) return null;
    return Object.keys(MORSE).find(letter => MORSE[letter] === marks) || null;
  }
  function timeline(text) {
    const words = String(text || '').toUpperCase().replace(/[^A-Z\s]/g, '').trim().split(/\s+/).filter(Boolean);
    const segments = []; let cursor = 0, index = 0;
    const add = (lit, units, letter, symbol, letterIndex, kind) => {
      segments.push({ start: cursor, end: cursor + units, lit, units, letter, symbol, letterIndex, kind }); cursor += units;
    };
    words.forEach((word, wi) => {
      Array.from(word).forEach((letter, li) => {
        Array.from(MORSE[letter]).forEach((symbol, mi, marks) => {
          add(true, symbol === '.' ? 1 : 3, letter, symbol, index, 'mark');
          if (mi < marks.length - 1) add(false, 1, letter, '', index, 'inside-letter');
        });
        index++;
        if (li < word.length - 1) add(false, 3, letter, '', index - 1, 'between-letter');
      });
      if (wi < words.length - 1) add(false, 7, '', '', index - 1, 'between-word');
    });
    return { segments, duration: cursor, letters: index };
  }
  function signalAt(track, units) {
    if (!track || !Array.isArray(track.segments) || !Number.isFinite(units) || units < 0 || units >= track.duration) {
      return { lit: false, done: !!(track && Number.isFinite(units) && units >= track.duration), segment: null };
    }
    const segment = track.segments.find(part => units >= part.start && units < part.end) || null;
    return { lit: !!(segment && segment.lit), done: false, segment };
  }
  function mark(s, symbol) {
    if (!s || s.completed || (symbol !== '.' && symbol !== '-') || s.pattern.length >= 4) return false;
    s.pattern += symbol; s.feedback = 'Your marks: ' + s.pattern + '. Choose the letter they describe.'; return true;
  }
  function resetEntry(s) {
    if (!s) return false;
    s.pattern = ''; s.selected = ''; s.feedback = 'Entry cleared. Replay the current letter whenever you need.'; return true;
  }
  function submitLetter(s, chosen) {
    if (!s || s.completed) return false;
    const index = s.decoded.length, letter = String(chosen || '').toUpperCase(), decoded = decode(s.pattern);
    s.selected = letter;
    if (!s.observed[index]) { s.feedback = 'First observe this letter to the end. Replay is untimed and repeatable.'; return false; }
    if (!decoded || decoded !== letter) { s.feedback = 'Check the Morse chart: your marks and chosen letter do not match. Replay or clear the entry.'; return false; }
    if (decoded !== MESSAGE[index]) { s.feedback = 'Those marks describe ' + decoded + '. Listen or watch the current letter again; there is no penalty.'; return false; }
    s.decoded += decoded; s.pattern = ''; s.selected = ''; s.completed = s.decoded === MESSAGE;
    s.feedback = s.completed
      ? 'You decoded TORTURE. This lesson records observation only; it does not grade resistance, suffering or courage.'
      : 'Decoded letter ' + s.decoded.length + ' of 7: ' + decoded + '. Replay the next letter when ready.';
    return true;
  }
  function clearControls(game) {
    const a = game && game.app || P.ctx && P.ctx.App;
    if (a && a.keys) for (const key of Object.keys(a.keys)) a.keys[key] = 0;
    if (a && a.gctl) for (const key of ['pitch', 'roll', 'run', 'crouch']) a.gctl[key] = 0;
    if (game && game.pow) {
      game.pow.touchInteract = false; game.pow.touchClimb = false; game.pow.holding = null;
      game.pow.interactLatched = false;
    }
    if (game && game.evade) { game.evade.moving = false; game.evade.running = false; }
  }
  function persist() {
    if (session && session.game && session.game.pow && typeof P.save === 'function') P.save(session.game);
  }
  function el(tag, text, attrs) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    for (const [name, value] of Object.entries(attrs || {})) node.setAttribute(name, value);
    return node;
  }
  function button(text, attrs, action) {
    const node = el('button', text, Object.assign({ type: 'button' }, attrs)); node.onclick = action; return node;
  }
  function paint() {
    if (!session || !dialog) return;
    const s = session.state, pulse = session.track ? signalAt(session.track, session.elapsed / session.unit) : { lit: false, done: true };
    const board = dialog.querySelector('[data-denton-signal]');
    board.dataset.lit = pulse.lit ? 'true' : 'false';
    board.dataset.on = pulse.lit ? 'true' : 'false';
    board.textContent = session.playing ? pulse.lit ? 'Signal ON · count its length' : 'Signal OFF · count the gap' : 'Signal stopped · replay whenever you need';
    dialog.querySelector('[data-denton-pattern]').textContent = s.pattern || '(no marks entered)';
    dialog.querySelector('[data-denton-progress]').textContent = 'Your decoded message: ' + (s.decoded || '(none)') + ' · ' + s.decoded.length + '/7';
    dialog.querySelector('[data-denton-feedback]').textContent = s.feedback;
    dialog.querySelector('[data-denton-letter]').value = s.selected || '';
    dialog.querySelector('[data-denton-submit]').disabled = s.completed;
    for (const node of dialog.querySelectorAll('[data-denton-mark]')) node.disabled = s.completed;
    dialog.querySelector('[data-denton-play="letter"]').disabled = s.completed;
    dialog.querySelector('[data-denton-result]').hidden = !s.completed;
  }
  function stepPlayback(seconds) {
    if (!session || !session.playing || !Number.isFinite(seconds) || seconds <= 0) return false;
    session.elapsed += seconds;
    const units = session.elapsed / session.unit, parts = session.track.segments;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i], next = parts[i + 1];
      if (part.lit && (!next || next.kind !== 'inside-letter') && units + 1e-9 >= part.end) {
        session.state.observed[session.offset + part.letterIndex] = true;
      }
    }
    if (units + 1e-9 >= session.track.duration) { session.playing = false; session.elapsed = session.track.duration * session.unit; persist(); }
    paint(); return true;
  }
  // Both browser fixtures and real rAF playback use this clock. Advancing it
  // changes only the optional visual lesson, never game time or an outcome.
  function advance(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120) return false;
    let left = seconds;
    while (left > 1e-9) { const slice = Math.min(.25, left); stepPlayback(slice); left -= slice; }
    return !!session;
  }
  function onFrame(now) {
    if (!session) return;
    if (lastFrame !== null) stepPlayback(Math.min(.25, Math.max(0, (now - lastFrame) / 1000)));
    lastFrame = now;
    frame = root.requestAnimationFrame(onFrame);
  }
  function play(mode) {
    if (!session || (mode === 'letter' && session.state.completed)) return false;
    const offset = mode === 'full' ? 0 : session.state.decoded.length;
    session.track = timeline(mode === 'full' ? MESSAGE : MESSAGE[offset]);
    session.offset = offset; session.elapsed = 0; session.playing = true;
    session.state.playbackCount = finite(session.state.playbackCount, 0) + 1;
    lastFrame = null; paint(); return true;
  }
  function keyboard(event) {
    if (!dialog) return;
    event.stopImmediatePropagation();
    if (event.type === 'keydown' && event.code === 'Escape') { event.preventDefault(); close(); }
  }
  function open(game) {
    close();
    if (typeof document === 'undefined') return false;
    game = game || P.ctx && P.ctx.App && P.ctx.App.game || null;
    const s = state(game);
    session = { game, state: s, previousPause: game && game.paused, previousModal: game && game.pow && game.pow.modalOpen,
      track: null, elapsed: 0, unit: game && game.pow && game.pow.intensity === 'reduced' ? .75 : .45, offset: 0, playing: false };
    if (game) game.paused = true;
    if (game && game.pow) game.pow.modalOpen = true;
    clearControls(game);
    root.addEventListener('keydown', keyboard, true); root.addEventListener('keyup', keyboard, true);
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    dialog = el('dialog', '', { id: 'powDentonFlashback', 'aria-labelledby': 'dentonFlashbackTitle', 'aria-modal': 'true' });
    dialog.style.cssText = 'width:calc(100% - 20px);max-width:900px;box-sizing:border-box;max-height:94dvh;max-height:94vh;overflow:auto;padding:16px;background:#101a23;color:#e8ecef;border:1px solid #617887;z-index:300';
    const css = el('style'); css.textContent = '#powDentonFlashback *{box-sizing:border-box}#powDentonFlashback button,#powDentonFlashback select{min-height:44px;font:inherit;border:1px solid #8ba2b0;border-radius:4px;background:#203343;color:#fff;padding:8px 12px}#powDentonFlashback button:disabled{opacity:.5}#powDentonFlashback button:focus-visible,#powDentonFlashback select:focus-visible{outline:3px solid #d8c37b;outline-offset:2px}#powDentonFlashback p{line-height:1.5;margin:10px 0}#powDentonFlashback .denton-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}#powDentonFlashback .denton-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:16px}#powDentonFlashback .denton-signal{min-height:70px;background:#16222d;border:2px solid #70848c;border-radius:8px;padding:18px;text-align:center;font-weight:600}#powDentonFlashback .denton-signal[data-lit="true"]{background:#adad7a;color:#121d26;border-color:#c1c39b}#powDentonFlashback details{margin:12px 0}#powDentonFlashback .denton-chart{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:6px;font-family:monospace}#powDentonFlashback .denton-chart span{padding:5px;background:#20303d}'; dialog.append(css);
    const head = el('div', '', { class: 'denton-row' });
    const title = el('h2', 'Historical flashback · 2 May 1966', { id: 'dentonFlashbackTitle' }); title.style.cssText = 'flex:1;margin:0;font-size:1.3rem';
    head.append(title, button('Close flashback', { 'data-denton-close': '' }, close)); dialog.append(head);
    dialog.append(el('p', 'Jeremiah Denton used eye blinks to send the Morse-code word TORTURE during a televised interview. This historical event predates the game’s October 1967 escape; your player is studying it, not witnessing it at the prison.'));
    const grid = el('div', '', { class: 'denton-grid' });
    const figure = el('figure'); figure.style.margin = '0';
    const photo = el('img', '', { 'data-denton-photo': '', src: 'assets/history/denton_blinking_torture_color.png', alt: 'User-supplied color-treated photograph identified as Jeremiah Denton', decoding: 'async' });
    photo.style.cssText = 'display:block;max-width:100%;width:auto;height:auto;max-height:42dvh;object-fit:contain;filter:none;opacity:1;mix-blend-mode:normal;margin:0 auto';
    figure.append(photo, el('figcaption', 'The supplied photograph is static and unaltered. Its original source frame and color treatment are not independently established.'));
    const lesson = el('div');
    lesson.append(el('p', 'Authored Morse visualization — not archival footage, reconstructed eyes, or timing synchronized to this photograph. Dots last 1 unit, dashes 3; gaps within a letter last 1 unit and between letters 3.'));
    lesson.append(el('div', 'Signal stopped · replay whenever you need', { class: 'denton-signal', 'data-denton-signal': '', 'data-lit': 'false', 'aria-label': 'Separate Morse signal visualization' }));
    const replay = el('div', '', { class: 'denton-row' }); replay.style.marginTop = '10px';
    replay.append(button('Replay current letter', { 'data-denton-play': 'letter' }, () => play('letter')), button('Replay whole message', { 'data-denton-play': 'full' }, () => play('full')));
    const label = el('label', 'Playback pace '), pace = el('select', '', { 'data-denton-speed': '', 'aria-label': 'Morse playback pace' });
    for (const [value, text] of [['0.75', 'Gentle'], ['0.45', 'Standard'], ['0.28', 'Quicker']]) pace.append(el('option', text, { value }));
    pace.value = String(session.unit); pace.onchange = () => { session.unit = Number(pace.value); session.playing = false; session.elapsed = 0; paint(); };
    label.append(pace); replay.append(label); lesson.append(replay);
    lesson.append(el('p', '', { 'data-denton-progress': '' }));
    const marks = el('p', 'Your counted marks: '); marks.append(el('code', '', { 'data-denton-pattern': '' })); lesson.append(marks);
    const entry = el('div', '', { class: 'denton-row' });
    for (const [symbol, text] of [['.', 'Dot ·'], ['-', 'Dash —']]) entry.append(button(text, { 'data-denton-mark': symbol }, () => { mark(s, symbol); paint(); }));
    entry.append(button('Clear marks', { 'data-denton-clear': '' }, () => { resetEntry(s); paint(); }));
    const select = el('select', '', { 'data-denton-letter': '', 'aria-label': 'Letter decoded from your counted Morse marks' }); select.append(el('option', 'Choose a letter', { value: '' }));
    for (const letter of Object.keys(MORSE)) select.append(el('option', letter, { value: letter }));
    select.onchange = () => { s.selected = select.value; };
    entry.append(select, button('Submit decoded letter', { 'data-denton-submit': '' }, () => { if (submitLetter(s, select.value)) persist(); paint(); })); lesson.append(entry);
    lesson.append(el('p', '', { 'data-denton-feedback': '', role: 'status', 'aria-live': 'polite' }));
    const chart = el('details'), summary = el('summary', 'Morse chart and instructions'); summary.style.cssText = 'min-height:44px;padding:12px 0;cursor:pointer';
    const chartGrid = el('div', '', { class: 'denton-chart' });
    for (const [letter, code] of Object.entries(MORSE)) chartGrid.append(el('span', letter + ' ' + code));
    chart.append(summary, el('p', 'Observe a whole letter, enter each dot or dash, then choose its letter. You can use this chart and replay as often as you want. There is no time limit, consequence for a mistaken answer, or effect on the player’s physical or mental condition.'), chartGrid); lesson.append(chart);
    grid.append(figure, lesson); dialog.append(grid);
    const result = el('div', '', { 'data-denton-result': '' });
    result.append(el('h3', 'What the message conveyed'), el('p', 'The covert message communicated evidence of mistreatment beyond the captors’ intended propaganda presentation. It showed why American observers could not accept that presentation at face value. Exact interception procedures and intelligence timelines require further archival verification. This lesson is not a standard by which other prisoners’ suffering is judged.'));
    dialog.append(result);
    dialog.append(el('p', 'This optional historical lesson is separate from the fictional playable prison narrative. No dialogue here is presented as a direct quotation from Denton.'));
    const sources = el('p', 'Historical reference: '), link = el('a', 'Naval History and Heritage Command', { href: 'https://www.history.navy.mil/', target: '_blank', rel: 'noopener noreferrer' }); link.style.color = '#b4cfea'; sources.append(link); dialog.append(sources);
    document.body.append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.showModal(); paint();
    frame = root.requestAnimationFrame(onFrame);
    return s;
  }
  function close() {
    if (!session && !dialog) return false;
    if (frame && root.cancelAnimationFrame) root.cancelAnimationFrame(frame);
    frame = 0; lastFrame = null;
    if (root.removeEventListener) { root.removeEventListener('keydown', keyboard, true); root.removeEventListener('keyup', keyboard, true); }
    if (session) {
      persist(); clearControls(session.game);
      if (session.game) {
        session.game.paused = session.previousPause;
        if (session.game.pow) session.game.pow.modalOpen = session.previousModal;
      }
    }
    if (dialog) dialog.remove();
    dialog = null; session = null; return true;
  }
  P.DentonFlashback = { message: MESSAGE, alphabet: Object.assign({}, MORSE), initial, state, encode, decode, timeline, signalAt,
    mark, resetEntry, submitLetter, open, close, play, advance,
    status: () => session ? { playing: session.playing, elapsed: session.elapsed, unit: session.unit, duration: session.track && session.track.duration, state: session.state } : null };
})(window);
