/* Quiet, original procedural ambience for the physical POW chapters. No
 * archival voices, intelligible murmur, synthetic guard footsteps, or position
 * cues are manufactured here. Those remain actual actors in POW.Feedback.
 * The existing application's audio context/master and flight graph are owned
 * by Audio2; this module never creates/resumes a context or changes that graph. */
(function (global) {
  'use strict';
  const P = global.POW = global.POW || {};
  const STAGES = new Set(['cell', 'compound', 'hanoi', 'river', 'solitary', 'regular']);
  const pools = new WeakMap(), failedContexts = new WeakSet();
  const finite = (n, otherwise) => Number.isFinite(n) ? n : otherwise;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const CHANNELS = Object.freeze(['air', 'texture', 'water']);
  let live = null;

  function physical(game) {
    const s = game && game.pow, app = game && game.app;
    return !!(s && game.evade && game.evade.camp !== false && STAGES.has(s.stage)
      && (game.phase === undefined || game.phase === 'evade') && !game.paused && !s.complete
      && !s.modalOpen && !(s.captivity && s.captivity.open)
      && !(P.Mindscape && P.Mindscape.active && P.Mindscape.active(game))
      && (!app || app.screen === undefined || app.screen === 'game' || app.screen === 'fixture')
      && (!app || app.game === undefined || app.game === game));
  }
  function allowed(game) {
    if (!physical(game)) return false;
    const app = game.app, sound = app && app.audio, context = sound && sound.ctx;
    if (!app || !app.set || !app.set.sound || !sound || !sound.on || !context || context.state !== 'running' || !sound.master) return false;
    const doc = global.document;
    return !(doc && (doc.hidden || typeof doc.querySelector === 'function' && doc.querySelector('dialog[open]')));
  }
  function disconnect(node) { try { node.disconnect(); } catch (_) {} }
  function zero(parameter, at) {
    try { if (parameter.cancelScheduledValues) parameter.cancelScheduledValues(at); } catch (_) {}
    try { if (parameter.setValueAtTime) parameter.setValueAtTime(0, at); else parameter.value = 0; } catch (_) {}
  }
  function destroy(graph) {
    if (!graph) return;
    const time = finite(graph.context.currentTime, 0);
    zero(graph.bus.gain, time);
    for (const channel of graph.channels) {
      zero(channel.gain.gain, time);
      try { channel.source.stop(time); } catch (_) {}
    }
    for (const node of graph.nodes) disconnect(node);
  }
  function stop(game) {
    if (!live || game && live.game !== game) return false;
    const graph = live; live = null; destroy(graph); return true;
  }
  function inactiveStop(game) {
    if (!live) return;
    if (!game || live.game === game || game.app && live.game.app === game.app
      && (game.app.game === undefined || game.app.game === game || game.app.game === null)) stop();
  }
  function dispose(game) {
    const context = live && (!game || live.game === game) ? live.context : game?.app?.audio?.ctx;
    const stopped = stop(game);
    if (context) { pools.delete(context); failedContexts.delete(context); }
    return stopped;
  }

  function buffers(context) {
    if (pools.has(context)) return pools.get(context);
    const rate = clamp(Math.round(finite(context.sampleRate, 24000)), 8000, 24000), duration = 2.4;
    const length = Math.max(1, Math.floor(rate * duration)), out = [];
    for (let channel = 0; channel < CHANNELS.length; channel++) {
      const buffer = context.createBuffer(1, length, rate), data = buffer.getChannelData(0);
      let seed = (0x64716a3 + channel * 17389) >>> 0, brown = 0;
      for (let n = 0; n < length; n++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = seed / 2147483648 - 1, t = n / rate;
        brown = brown * .965 + white * .035;
        const edge = Math.min(1, t / .025, (duration - t) / .025);
        let value;
        if (channel === 0) value = (.28 * white + brown * 2.1) * (.78 + .16 * Math.sin(t * 2.4));
        else if (channel === 1) {
          const drop = Math.exp(-Math.pow((t - .32) / .016, 2)) + .65 * Math.exp(-Math.pow((t - 1.61) / .022, 2));
          const chirp = Math.pow(Math.max(0, Math.sin(t * 11.8)), 5);
          value = .16 * white + .35 * drop * Math.sin(t * 6900) + .10 * chirp * Math.sin(t * 18100);
        } else value = brown * 2.4 + .07 * Math.sin(t * 540) * (.7 + .2 * Math.sin(t * 7));
        data[n] = clamp(value * Math.max(0, edge), -.95, .95);
      }
      out.push(buffer);
    }
    pools.set(context, out); return out;
  }
  function create(game) {
    const audio = game.app.audio, context = audio.ctx, nodes = [], channels = [];
    const node = value => { nodes.push(value); return value; };
    let bus;
    try {
      const bank = buffers(context);
      bus = node(context.createGain()); bus.gain.value = 0;
      const lowpass = node(context.createBiquadFilter()); lowpass.type = 'lowpass';
      lowpass.frequency.value = Math.min(11000, finite(context.sampleRate, 24000) * .45);
      lowpass.Q.value = .55;
      bus.connect(lowpass); lowpass.connect(audio.master);
      for (let index = 0; index < CHANNELS.length; index++) {
        const source = node(context.createBufferSource()), filter = node(context.createBiquadFilter()), gain = node(context.createGain());
        source.buffer = bank[index]; source.loop = true; gain.gain.value = 0;
        filter.type = index === 1 ? 'bandpass' : 'lowpass';
        filter.frequency.value = index === 0 ? 650 : index === 1 ? 1000 : 500;
        filter.Q.value = index === 1 ? .7 : .55;
        source.connect(filter); filter.connect(gain); gain.connect(bus);
        const channel = { id: CHANNELS[index], source, filter, gain, lastGain: -1, lastFrequency: -1, lastQ: -1 };
        channels.push(channel); source.start(finite(context.currentTime, 0), index * .63);
      }
      return { game, context, master: audio.master, nodes, channels, bus, lowpass,
        time: 0, stage: '', mix: null, lastBus: -1, lastCutoff: -1 };
    } catch (_) {
      if (bus) zero(bus.gain, finite(context.currentTime, 0));
      for (const channel of channels) try { channel.source.stop(); } catch (_) {}
      for (const owned of nodes) disconnect(owned);
      failedContexts.add(context);
      return null;
    }
  }
  function target(parameter, value, time, smoothing) {
    try {
      if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(time);
      else if (parameter.cancelScheduledValues) parameter.cancelScheduledValues(time);
      if (parameter.setTargetAtTime) parameter.setTargetAtTime(value, time, smoothing);
      else if (parameter.setValueAtTime) parameter.setValueAtTime(value, time);
      else parameter.value = value;
    } catch (_) { try { parameter.value = value; } catch (_) {} }
  }
  function profile(game, clock) {
    const s = game.pow, r = s.river || {}, underwater = !!(r.submerged || game.evade.submerged || game.evade.underwater);
    const rain = clamp(finite(r.rain, game.atm?.wet ? .65 : 0), 0, 1), wind = .8 + .2 * Math.sin(clock * .19);
    let gains = [.009, .0065, 0], frequencies = [340, 950, 430], qs = [.6, .75, .6];
    if (s.stage === 'compound') { gains = [.018 * wind, .002 + rain * .009, 0]; frequencies = [520, 2200, 430]; }
    else if (s.stage === 'hanoi') { gains = [.009, .006 + rain * .006, .002]; frequencies = [280, rain > .5 ? 2100 : 2850, 260]; qs[1] = rain > .5 ? .7 : 4; }
    else if (s.stage === 'river') {
      const current = clamp(finite(r.currentWorldMps, .8), 0, 3);
      gains = [.010 * wind, .001 + rain * .010, .013 + current * .006]; frequencies = [560, 2500, 590];
    } else if (s.stage === 'regular') { gains = [.012 * wind, .004, 0]; frequencies = [440, 1900, 430]; }
    if (underwater) { gains = [gains[0] * .16, gains[1] * .10, Math.max(.014, gains[2] * .9)]; frequencies = [220, 480, 340]; }
    const reduced = s.intensity === 'reduced' ? .52 : 1;
    return { stage: s.stage, gains: gains.map(gain => clamp(gain * reduced, 0, .032)), frequencies, qs,
      bus: .42, cutoff: underwater ? 520 : 11000, underwater, reduced: reduced < 1, rain };
  }
  function step(game, dt) {
    if (!allowed(game)) { inactiveStop(game); return false; }
    if (!Number.isFinite(dt) || dt < 0) return false;
    const audio = game.app.audio;
    if (live && (live.context !== audio.ctx || live.master !== audio.master)) stop();
    if (failedContexts.has(audio.ctx)) return false;
    if (!live) live = create(game);
    if (!live) return false;
    live.game = game;
    live.time = finite(game.pow.time, live.time + Math.min(dt, .1));
    const mix = profile(game, live.time), now = finite(live.context.currentTime, 0);
    for (let n = 0; n < live.channels.length; n++) {
      const channel = live.channels[n];
      if (Math.abs(channel.lastGain - mix.gains[n]) > .00015) { target(channel.gain.gain, mix.gains[n], now, .24); channel.lastGain = mix.gains[n]; }
      if (Math.abs(channel.lastFrequency - mix.frequencies[n]) > 4) { target(channel.filter.frequency, mix.frequencies[n], now, .20); channel.lastFrequency = mix.frequencies[n]; }
      if (Math.abs(channel.lastQ - mix.qs[n]) > .02) { target(channel.filter.Q, mix.qs[n], now, .20); channel.lastQ = mix.qs[n]; }
    }
    if (live.lastBus !== mix.bus) { target(live.bus.gain, mix.bus, now, .24); live.lastBus = mix.bus; }
    const cutoff = Math.min(mix.cutoff, finite(live.context.sampleRate, 24000) * .45);
    if (live.lastCutoff !== cutoff) { target(live.lowpass.frequency, cutoff, now, .12); live.lastCutoff = cutoff; }
    live.stage = mix.stage; live.mix = mix;
    return true;
  }
  function inspect(game) {
    if (!live || game && live.game !== game) return { active: false, sourceCount: 0, bufferCount: 0, stage: 'silent' };
    return { active: true, sourceCount: live.channels.length, bufferCount: 3, stage: live.stage,
      clock: live.time, levels: live.mix?.gains.slice() || [0, 0, 0], bus: live.mix?.bus || 0,
      cutoff: live.lastCutoff, underwater: !!live.mix?.underwater, reduced: !!live.mix?.reduced };
  }
  P.EpisodeAudio = { step, stop, dispose, inspect,
    constants: Object.freeze({ maxSources: 3, maxBuffers: 3, maxBufferSampleRate: 24000, maxTrackGain: .032,
      authoredNonverbalAmbience: true }) };
})(typeof window !== 'undefined' ? window : globalThis);
