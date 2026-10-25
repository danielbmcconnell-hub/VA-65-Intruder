'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {waitCompletePhotographs}=require('./helpers/complete-photo-fixture.cjs');

// Actual WebGL browser tests. An explicit starting fixture enters the river;
// all subsequent section/landing progress uses real input, current, collision,
// guard AI and core held interactions. This is not a physical-device test.
module.exports = async function powM22RiverBrowser(browser, target, evidenceDir) {
  const results = [], screenshots = [], layouts = [];
  const out = path.join(evidenceDir, 'pow-m22-river');
  await fs.mkdir(out, { recursive: true });
  const check = (name, actual, predicate) => {
    const passed = !!predicate(actual); results.push({ name, passed, actual });
    assert.ok(passed, `${name}: ${JSON.stringify(actual)}`);
  };
  for (const layout of [
    { name: 'desktop', viewport: { width: 1280, height: 720 }, hasTouch: false },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, hasTouch: true }
  ]) {
    const context = await browser.newContext({ viewport: layout.viewport, hasTouch: layout.hasTouch, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    async function shot(label) {
      const graphics = await page.evaluate(() => {
        const G = App.game, gl = G.rend.gl;
        const before = gl.getError(); G.render(1 / 60); POW.updateUI(G);
        return { before, after: gl.getError(), section: G.pow.river.sectionId,
          width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
          position: G.evade.p.slice(), mode: G.pow.river.mode };
      });
      check(`${layout.name} ${label} actual WebGL`, graphics, a => a.before === 0 && a.after === 0 && a.width > 0 && a.height > 0);
      const file = path.join(out, `${layout.name}-${label}.png`);
      await page.screenshot({ path: file }); screenshots.push(file);
    }
    try {
      await page.addInitScript(() => {
        localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, assist: 1, sens: 1 }));
        localStorage.setItem('a6_sawkeys', '1');
      });
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => window.App && window.POW && POW.River && POW.AI);
      await page.evaluate(() => App.start(MISSIONS.find(mission => mission.escape)));
      await page.waitForFunction(() => App.game?.st && document.getElementById('loader').style.display === 'none', null, { timeout: 90000 });
      await waitCompletePhotographs(page);
      await page.evaluate(() => {
        App.frame = () => {}; App.screen = 'game'; App.game.paused = false;
        for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on');
        document.activeElement?.blur?.();
        const G = App.game;
        const h = window.__m22River = {
          controls(keys) { App.keys = keys || {}; Object.assign(App.gctl, { pitch: 0, roll: 0, run: 0, crouch: 0, climb: 0, dive: 0 }); },
          tick(seconds) {
            let left = seconds;
            while (left > .000001 && !G.pow.complete && G.pow.stage === 'river') { const dt = Math.min(.1, left); G.t += dt; G.stepEvade(dt); left -= dt; }
            return h.snapshot();
          },
          snapshot() {
            const s = G.pow, r = s.river;
            if (!r) return { stage: s.stage, position: G.evade.p.slice(), complete: !!s.complete, recapture: s.recaptureContext || s.message };
            return { stage: s.stage, position: G.evade.p.slice(), section: r.sectionId, name: r.sectionName,
              distance: r.logicalDistance, offset: r.streamOffset, mode: r.mode, resting: r.resting,
              hours: r.hours, current: r.currentWorldMps, cover: r.cover, visited: r.sectionsVisited.slice(),
              encounters: JSON.parse(JSON.stringify(r.encounters)), stats: { ...s.stats },
              complete: !!s.complete, landmarkIds: G.campGeo.filter(g => g.id.startsWith('river-landmark')).map(g => g.id),
              observers: G.evade.searchers.map(a => ({ id: a.id, kind: a.kind, p: a.p.slice(), state: a.state, seen: a.seen,
                encounter: a.riverEncounter, blocked: POW.blocked(G, a.p[0], a.p[2], .30, a.p[1]) })) };
          },
          driftChunk(distance, seconds) {
            for (let n = 0; n < seconds * 10 && G.pow.river.logicalDistance < distance; n++) {
              const x = G.pow.base[0] + 94, dx = x - G.evade.p[0];
              G.evade.hdg = Math.abs(dx) > 1 ? dx > 0 ? Math.PI / 2 : Math.PI * 1.5 : Math.PI;
              h.controls(Math.abs(dx) > 1 ? { KeyW: 1 } : {}); h.tick(.1);
            }
            h.controls({}); return h.snapshot();
          },
          landingChunk(id, seconds) {
            for (let n = 0; n < seconds * 10; n++) {
              const s = G.pow, r = s.river, e = G.evade, x = s.base[0] + 94;
              if (s.stage !== 'river') return h.snapshot();
              const landing = s.objects.find(o => o.id === id);
              if (!landing) throw new Error(`Landing ${id} is absent`);
              const gap = Math.hypot(e.p[0] - landing.p[0], e.p[2] - landing.p[2]);
              if (r.resting) { h.controls({}); return h.tick(.1); }
              if (r.mode === 'float') h.controls({ KeyF: 1, KeyC: 1 });
              else if (Math.abs(e.p[0] - x) < 15.5) {
                e.hdg = landing.p[0] > x ? Math.PI / 2 : Math.PI * 1.5; h.controls({ KeyW: 1, KeyC: 1 });
              } else if (gap > .65) {
                const side = Math.sign(landing.p[0] - x), entrance = [x + side * 19.7, landing.p[1], landing.p[2]];
                if (Math.hypot(e.p[0] - entrance[0], e.p[2] - entrance[2]) < .65) h.entranceReached = id;
                const target = h.entranceReached === id ? landing.p : entrance;
                e.hdg = Math.atan2(target[0] - e.p[0], -(target[2] - e.p[2])); h.controls({ KeyW: 1, KeyC: 1 });
              } else h.controls({ KeyF: 1, KeyC: 1 });
              h.tick(.1);
            }
            return h.snapshot();
          }
        };
        G.pow = null; h.controls({}); POW.begin(G, 'river');
        // Chapter-entry tutorial is separately exercised by the integration
        // suite; this fixture isolates physical river movement.
        if (POW.Guidance?.skip) POW.Guidance.skip(G);
        G.pow.modalOpen = false;
        G.syncControls();
      });
      const info = await page.evaluate(() => ({ version: App.rend.gl.getParameter(App.rend.gl.VERSION),
        renderer: App.rend.gl.getParameter(App.rend.gl.RENDERER), layout: { width: innerWidth, height: innerHeight },
        initial: __m22River.snapshot() }));
      layouts.push({ name: layout.name, ...info });
      check(`${layout.name} river starts at visible bridge with preserved controls`, info,
        a => /^WebGL 2/.test(a.version) && a.initial.section === 'bridge' && a.initial.distance === 0
          && a.initial.landmarkIds.includes('river-landmark-bridge-deck'));
      await shot('bridge');
      let reeds;
      for (let chunk = 0; chunk < 10; chunk++) {
        reeds = await page.evaluate(() => __m22River.driftChunk(6600, 20));
        if (reeds.distance >= 6600) break;
      }
      check(`${layout.name} actual current and input enter reeds without stage shortcuts`, reeds,
        a => a.stage === 'river' && a.section === 'reeds' && a.distance >= 6600 && !a.complete
          && a.visited.includes('bridge') && a.visited.includes('reeds'));
      await shot('reed-islands');
      let landing;
      for (let chunk = 0; chunk < 15; chunk++) {
        landing = await page.evaluate(() => __m22River.landingChunk('river-landing-reeds', 10));
        if (landing.resting || landing.stage !== 'river') break;
      }
      check(`${layout.name} swimming, bank movement and held interaction reach covered landing`, landing,
        a => a.stage === 'river' && a.mode === 'hidden' && a.resting && a.encounters.reeds?.landingReached && a.cover > .8);
      await page.evaluate(() => {
        const G = App.game;
        // Look out through the actual entrance, showing the cover and river;
        // rotate the viewpoint without moving the player or changing state.
        G.evade.hdg = Math.PI * 1.5; G.evade.look = G.evade.pitchCmd = 0;
      });
      await shot('covered-landing');
      const restoration = await page.evaluate(() => {
        const G = App.game, h = __m22River, before = h.snapshot();
        G.pow.stats.fatigue = 80; G.pow.stats.physical = 35; h.tick(8);
        const rested = h.snapshot(), saved = POW.save(G);
        G.pow = null; POW.begin(G, 'river', saved); h.controls({});
        if (POW.Guidance?.skip) POW.Guidance.skip(G);
        G.pow.modalOpen = false;
        const restored = h.snapshot();
        return { before, rested, restored, savedPosition: saved.p };
      });
      check(`${layout.name} physical landing recovery and actual checkpoint restoration`, restoration,
        a => a.rested.hours > a.before.hours + 1 && Math.abs(a.rested.distance - a.before.distance) < 1e-6
          && a.rested.stats.fatigue < 75 && a.rested.stats.physical > 37
          && a.restored.section === 'reeds' && a.restored.resting
          && a.restored.position.every((p, n) => Math.abs(p - a.savedPosition[n]) < 1e-6)
          && a.restored.encounters.reeds.landingReached);
      // Return to the stream through physical movement; do not transplant the
      // restored player into a convenient downstream section.
      let returnToWater = await page.evaluate(() => {
        const G = App.game, h = __m22River;
        G.evade.hdg = Math.PI * 1.5; h.controls({ KeyW: 1 });
        for (let n = 0; n < 600 && Math.abs(G.evade.p[0] - (G.pow.base[0] + 94)) > 1; n++) h.tick(.1);
        h.controls({}); G.evade.hdg = Math.PI; return h.snapshot();
      });
      check(`${layout.name} the resting player can move back into the current`, returnToWater,
        a => a.stage === 'river' && !a.resting && ['swim', 'float'].includes(a.mode) && a.cover < .8);
      let ferry;
      for (let chunk = 0; chunk < 12; chunk++) {
        ferry = await page.evaluate(() => __m22River.driftChunk(14600, 20));
        if (ferry.distance >= 14600) break;
      }
      check(`${layout.name} physical onward travel reaches the ferry and collision-safe observers`, ferry,
        a => a.stage === 'river' && a.section === 'ferry' && a.distance >= 14600 && a.offset >= 112
          && a.landmarkIds.includes('river-landmark-ferry-lantern')
          && a.observers.filter(o => o.encounter === 'ferry').length === 2
          && a.observers.filter(o => o.encounter === 'ferry').every(o => !o.blocked));
      await page.evaluate(() => {
        const G = App.game, guard = G.evade.searchers.find(a => a.id === 'river-ferry-patrol');
        G.evade.hdg = Math.atan2(guard.p[0] - G.evade.p[0], -(guard.p[2] - G.evade.p[2]));
      });
      await shot('ferry-patrol');
      check(`${layout.name} no JavaScript exceptions during physical river sections`, errors, a => a.length === 0);
    } finally { await context.close(); }
  }
  return { suite: 'm22-river', passed: results.every(r => r.passed), results, screenshots, layouts,
    scope: 'Actual Chromium WebGL2 with desktop and simulated iPhone layouts, keyboard inputs in both. Initial river fixture; normal live patrols, physical current, quiet swimming/crouched bank approach, real landing holds, AI, checkpoint restoration and four screenshots per layout. No physical Windows or iPhone claim.' };
};
