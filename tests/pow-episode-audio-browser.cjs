'use strict';
// Real Chromium Web Audio acceptance. Native boot/setting/pause/history controls
// drive lifecycle; explicit chapter entry and simulation clock are fixtures.
// Factory instrumentation observes real nodes and never substitutes a context,
// buffer, AudioParam, connect(), start(), stop(), or resume() implementation.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async function episodeAudioBrowser(browser, target, evidenceDir) {
  const checks = [], browserErrors = [];
  const out = path.join(evidenceDir, 'pow-episode-audio');
  await fs.mkdir(out, { recursive: true });
  for (const layout of [
    { name: 'desktop', viewport: { width: 1100, height: 650 }, hasTouch: false, deviceScaleFactor: 1 },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }
  ]) {
    const context = await browser.newContext(layout), page = await context.newPage(), errors = [];
    page.on('pageerror', e => { errors.push(e.message); browserErrors.push({ layout: layout.name, error: e.message }); });
    const session = layout.hasTouch ? await context.newCDPSession(page) : null;
    const click = locator => layout.hasTouch ? locator.tap({ timeout: 30000 }) : locator.click({ timeout: 30000 });
    function check(name, actual, predicate) {
      const passed = !!predicate(actual);
      checks.push({ name: layout.name + ': ' + name, passed, actual });
      assert.ok(passed, name + ': ' + JSON.stringify(actual)); console.log('PASS episode-audio ' + layout.name + ' ' + name);
    }
    const snapshot = () => page.evaluate(() => {
      const t = window.__episodeAudioObserved, g = App.game;
      return { mix: POW.EpisodeAudio.inspect(g || undefined), realContext: App.audio.ctx instanceof (window.AudioContext || window.webkitAudioContext),
        state: App.audio.ctx?.state, sameContext: App.audio.ctx === t.context, contexts: t.contexts.length, resumes: t.resumes.length,
        buffers: t.buffers.map(b => ({ rate: b.sampleRate, duration: b.duration, length: b.length, channels: b.numberOfChannels })),
        sources: t.sources.length, activeSources: t.sources.filter(s => s.started && !s.stopped).length,
        allStoppedDisconnected: t.sources.filter(s => s.stopped).every(s => s.disconnected),
        graphAttachedToOriginalMaster: t.nodes.filter(n => n.masterConnected).some(n => !n.disconnected),
        enginePreserved: t.engine === App.audio.eng && t.engineLowpass === App.audio.engLP && t.master === App.audio.master,
        gl: g?.rend?.gl.getError(), stage: g?.pow?.stage, sound: App.set.sound };
    });
    async function render() { await page.evaluate(() => { App.game?.render(1 / 60); App.game?.syncControls(); }); }
    async function tick(seconds) { await page.evaluate(seconds => { for (let n = 0; n < Math.ceil(seconds * 20); n++) App.game.stepEvade(.05); App.game.render(1 / 60); }, seconds); }
    async function freeze() {
      await page.waitForFunction(() => App.game?.pow && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
      await page.evaluate(() => { App.screen = 'fixture'; App.game.paused = false; for (const k of Object.keys(App.keys)) App.keys[k] = 0; App.gctl.pitch = App.gctl.roll = 0; });
      if (await page.locator('#powHUD [data-guide-skip]').isVisible()) await click(page.locator('#powHUD [data-guide-skip]'));
      await render();
    }
    async function ready() {
      await click(page.locator('#pauseBtn')); await render();
      await click(page.locator('#pauseBody button').filter({ hasText: /^Ready Room$/ }));
      await page.waitForFunction(() => App.screen === 'ready' && App.game === null, null, { timeout: 30000 });
    }
    async function sound(value) {
      await click(page.locator('#tabs [data-tab="set"]'));
      const row = page.locator('#ready .setrow').filter({ has: page.locator('.sl').filter({ hasText: /^Sound$/ }) });
      await click(row.getByRole('button', { name: value ? 'On' : 'Off', exact: true }));
      await click(page.locator('#tabs [data-tab="ops"]'));
    }
    try {
      await page.addInitScript(() => {
        localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 1, voices: 0, mouse: 0, assist: 1, sens: 1 }));
        localStorage.setItem('a6_sawkeys', '1');
        const t = window.__episodeAudioObserved = { contexts: [], resumes: [], nodes: [], sources: [], buffers: [] };
        const Native = window.AudioContext || window.webkitAudioContext;
        if (!Native) throw Error('Real AudioContext unavailable');
        const nativeResume = Native.prototype.resume;
        Native.prototype.resume = function (...args) { t.resumes.push({ context: this, stack: new Error().stack }); return Reflect.apply(nativeResume, this, args); };
        const Observed = new Proxy(Native, { construct(constructor, args) { const c = Reflect.construct(constructor, args); t.contexts.push(c); return c; } });
        if (window.AudioContext) window.AudioContext = Observed; else window.webkitAudioContext = Observed;
      });
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => window.App && window.POW?.EpisodeAudio, null, { timeout: 30000 });
      check('Loading the game allocates no AudioContext or ambience sources', await page.evaluate(() => ({ contexts: __episodeAudioObserved.contexts.length, mix: POW.EpisodeAudio.inspect() })), a => a.contexts === 0 && !a.mix.active);
      await click(page.locator('#bootGo'));
      await page.waitForFunction(() => App.audio.ctx?.state === 'running', null, { timeout: 30000 });
      await page.evaluate(() => {
        const c = App.audio.ctx, t = __episodeAudioObserved;
        t.context = c; t.master = App.audio.master; t.engine = App.audio.eng; t.engineLowpass = App.audio.engLP;
        for (const method of ['createBuffer', 'createBufferSource', 'createGain', 'createBiquadFilter']) {
          const native = c[method]; c[method] = function (...args) {
            const node = Reflect.apply(native, this, args);
            if (!new Error().stack.includes('episode-audio.js')) return node;
            if (method === 'createBuffer') { t.buffers.push(node); return node; }
            const record = { node, kind: method, started: false, stopped: false, disconnected: false, masterConnected: false };
            t.nodes.push(record); if (method === 'createBufferSource') t.sources.push(record);
            for (const action of ['connect', 'disconnect', 'start', 'stop']) if (typeof node[action] === 'function') {
              const nativeAction = node[action]; node[action] = function (...values) {
                if (action === 'start') record.started = true;
                if (action === 'stop') record.stopped = true;
                if (action === 'disconnect') record.disconnected = true;
                if (action === 'connect' && values[0] === t.master) record.masterConnected = true;
                return Reflect.apply(nativeAction, this, values);
              };
            }
            return node;
          };
        }
      });
      check('The trusted Ready Room click initializes the original running Audio2 context', await snapshot(), a => a.contexts === 1 && a.state === 'running' && a.realContext && a.sameContext && a.enginePreserved);
      await click(page.locator('#powChapter [data-pow-chapter="escape"]')); await freeze(); await tick(.2);
      const initial = await snapshot(), resumeCount = initial.resumes;
      check('Physical cell ambience uses three real cached loop sources attached to the original master', initial, a => a.mix.active && a.mix.stage === 'cell' && a.activeSources === 3 && a.buffers.length === 3 && a.buffers.every(b => b.rate <= 24000 && b.duration === 2.4 && b.channels === 1) && a.graphAttachedToOriginalMaster && a.enginePreserved && a.gl === 0);
      const allocations = initial.sources;
      await tick(.4); await render(); await render();
      check('Repeated physics and render frames do not allocate another graph or context', await snapshot(), a => a.sources === allocations && a.buffers.length === 3 && a.activeSources === 3 && a.contexts === 1 && a.resumes === resumeCount);

      await click(page.locator('#pauseBtn')); await render();
      check('The native Pause button stops and disconnects every owned ambience source', await snapshot(), a => !a.mix.active && a.activeSources === 0 && a.allStoppedDisconnected && a.enginePreserved);
      await click(page.locator('#pauseBody button').filter({ hasText: /^Resume$/ })); await render();
      check('Native Resume rebuilds three loops from the existing cached buffers', await snapshot(), a => a.mix.active && a.activeSources === 3 && a.buffers.length === 3 && a.sameContext && a.resumes === resumeCount);
      await click(page.locator('#powHUD .pow-tools button').filter({ hasText: /^History & photos$/ })); await render();
      check('The actual photograph dialog silences physical ambience', await snapshot(), a => !a.mix.active && a.activeSources === 0 && a.allStoppedDisconnected);
      await click(page.getByRole('button', { name: 'Close history', exact: true })); await render();
      check('Closing history returns ambience without a new context or buffer bank', await snapshot(), a => a.mix.active && a.activeSources === 3 && a.buffers.length === 3 && a.contexts === 1);

      await page.evaluate(() => POW.Captivity.open(App.game, 'tap')); await render();
      check('The real tap-code activity panel stops physical ambience', await snapshot(), a => !a.mix.active && a.activeSources === 0 && a.allStoppedDisconnected);
      await click(page.locator('#pow-captivity').getByRole('button', { name: 'Return to cell', exact: true })); await render();
      await page.evaluate(() => { POW.Captivity.open(App.game, 'architecture'); });
      await click(page.locator('[data-mind-open="architecture"]')); await render();
      check('Entering the explorable remembered house leaves no physical ambience loops', await snapshot(), a => !a.mix.active && a.activeSources === 0 && a.allStoppedDisconnected && a.gl === 0);
      await click(page.locator('[data-mind-return]')); await tick(.1);
      check('Returning to the physical cell restores only the three owned loops', await snapshot(), a => a.mix.active && a.activeSources === 3 && a.buffers.length === 3 && a.sameContext);

      await page.evaluate(() => { POW.begin(App.game, 'river'); }); await tick(.1);
      const above = await snapshot(), preDive = await page.evaluate(() => App.game.evade.p.slice());
      check('The real river-entry fixture changes the mix without reallocating its live graph', above, a => a.mix.active && a.mix.stage === 'river' && !a.mix.underwater && a.mix.cutoff >= 10000 && a.activeSources === 3 && a.buffers.length === 3);
      if (session) {
        const point = await page.locator('#powHUD .pow-context-controls button').filter({ hasText: /Dive/ }).evaluate(n => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 9, radiusX: 7, radiusY: 7, force: 1 }] });
        try { await tick(.6); } finally { await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      } else { await page.keyboard.down('Space'); try { await tick(.6); } finally { await page.keyboard.up('Space'); } }
      const under = await snapshot(); under.movement = await page.evaluate(p => ({ submerged: App.game.pow.river.submerged, breath: App.game.pow.river.breath, vertical: App.game.evade.p[1] - p[1], mode: App.game.pow.river.mode }), preDive);
      check('Real held keyboard or CDP touch diving lowers the player and muffles the existing river loops', under, a => a.mix.underwater && a.mix.cutoff === 520 && a.movement.submerged && a.movement.vertical < -1.5 && a.movement.breath < 100 && a.sources === above.sources && a.activeSources === 3 && a.gl === 0);
      await tick(.15);
      check('Releasing Dive physically resurfaces and restores the original above-water cutoff', await snapshot(), a => !a.mix.underwater && a.mix.cutoff === above.mix.cutoff && a.sources === under.sources && a.activeSources === 3);

      await ready();
      check('Native Ready Room departure retains the flight engine and no ambience sources', await snapshot(), a => !a.mix.active && a.activeSources === 0 && a.allStoppedDisconnected && a.enginePreserved && a.sameContext);
      await sound(false); await click(page.locator('#powChapter [data-pow-chapter="escape"]')); await freeze(); await tick(.1);
      check('The real Sound Off setting prevents ambience on the next physical chapter', await snapshot(), a => a.sound === 0 && !a.mix.active && a.activeSources === 0 && a.enginePreserved);
      await ready(); await sound(true); await click(page.locator('#powChapter [data-pow-chapter="escape"]')); await freeze(); await tick(.1);
      check('The real Sound On setting reuses the original context and cached bank', await snapshot(), a => a.sound === 1 && a.mix.active && a.activeSources === 3 && a.buffers.length === 3 && a.sameContext && a.contexts === 1 && a.resumes === resumeCount);
      await page.evaluate(() => {
        // Restoration rebuilds POW meshes lazily in the real render loop.
        // The fixture screen suppresses that loop, so use normal gameplay here.
        App.screen = 'game';
        window.__episodeAudioGame = App.game;
        window.__episodeAudioGL = App.game.rend.gl.getExtension('WEBGL_lose_context');
        if (!__episodeAudioGL) throw Error('Real WebGL context-loss extension unavailable');
        __episodeAudioGL.loseContext();
      });
      await page.waitForFunction(() => App.graphicsContextLost && App.rend === null, null, { timeout: 30000 });
      check('An actual lost WebGL context stops live ambience and preserves the running Audio2 context', await snapshot(), a => !a.mix.active && a.activeSources === 0 && a.allStoppedDisconnected && a.sameContext && a.state === 'running' && a.enginePreserved);
      await page.waitForTimeout(200); await page.evaluate(() => __episodeAudioGL.restoreContext());
      await page.waitForFunction(() => !App.graphicsContextLost && App.rend && App.game === __episodeAudioGame && App.rend.meshes.powStone, null, { timeout: 30000 });
      await click(page.getByRole('button', { name: 'Resume mission', exact: true }));
      await page.evaluate(() => { App.screen = 'fixture'; }); await render();
      check('Native graphics recovery rebuilds GPU state and cached ambience without replacing the audio context', await snapshot(), a => a.mix.active && a.activeSources === 3 && a.buffers.length === 3 && a.sameContext && a.contexts === 1 && a.resumes === resumeCount && a.gl === 0);
      await ready(); await click(page.locator('#toBoot')); await click(page.locator('#bootFly'));
      await page.waitForFunction(() => App.game?.phase === 'deck' && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
      await page.evaluate(() => { App.game.paused = true; App.game.render(1 / 60); });
      check('The trusted original Quick Flight path leaves ambience silent and its native engine graph intact', await snapshot(), a => !a.mix.active && a.activeSources === 0 && a.allStoppedDisconnected && a.enginePreserved && a.sameContext && a.contexts === 1 && a.gl === 0);
      assert.deepEqual(errors, []); check('Actual Web Audio and WebGL operations complete without JavaScript errors', { errors }, a => a.errors.length === 0);
    } finally { await context.close(); }
  }
  const report = { suite: 'episode-audio', checks, browserErrors, screenshots: [], limitations: [
    'Chromium software WebGL2 and real Web Audio with a simulated iPhone layout; no physical iPhone Safari or Windows device was used.',
    'Audio graph allocation, cleanup, filtering and original-context preservation are verified. Audible balance and physical speakers/headphones still require human listening.',
    'Explicit chapter entry, camera state and simulation stepping are fixtures; boot, settings, pause, history, remembered-house entry/return, keyboard diving and CDP touch diving use production input and state transitions.'
  ] };
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
};
