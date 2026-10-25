'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const installCompletePhotoFixture = require('./helpers/complete-photo-fixture.cjs');

// Actual custom-WebGL acceptance supplement. Native entries and controls are
// followed by declared camera, actor-roster and isolated GPU fixtures. The
// separate Dixie sortie suite verifies unmodified native ballistic/recovery
// gameplay. No fixture here claims a human or physical-device playthrough.
module.exports = async function tacticalVisualBrowser(browser, target, evidenceDir) {
  const results = [], screenshots = [], out = path.join(evidenceDir, 'tactical-visual');
  await fs.mkdir(out, { recursive: true });
  const sourcePhotograph = await fs.readFile(path.join(__dirname, '../assets/figures-original.png'));
  const sourcePhotographSHA256 = createHash('sha256').update(sourcePhotograph).digest('hex');
  assert.equal(sourcePhotographSHA256, '2b357f1d128f3a9be324778c0fbea527c7574ff8ca328cfb5391bf811d910883');
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ].filter(p => !process.env.INTRUDER_TACTICAL_VISUAL_PROFILE || p.name === process.env.INTRUDER_TACTICAL_VISUAL_PROFILE);
  for (const profile of profiles) {
    const { name, ...options } = profile, context = await browser.newContext(options), page = await context.newPage();
    const click = locator => profile.hasTouch ? locator.tap() : locator.click();
    const errors = [], missing = [], digestTasks = [], runtimeSHA256 = {};
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      const file = new URL(response.url()).pathname;
      if (response.status() >= 400 && /\/assets\//.test(file)) missing.push({ file, status: response.status() });
      if (response.ok() && /\/assets\/(?:flight\/(?:tactical-approach|visual-materials|airframe-feedback|strike-scene)|pow\/figure-motion)\.js$/.test(file)) digestTasks.push(response.body().then(bytes => { runtimeSHA256[file] = createHash('sha256').update(bytes).digest('hex'); }));
    });
    await context.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
      localStorage.setItem('a6_sawkeys', '1');
      let seed = 0x196603;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => window.__tacticalVisualClock ? 0 : raf(t => { if (!window.__tacticalVisualClock) callback(t); });
    });
    const record = (title, actual, method) => {
      results.push({ profile: name, name: title, passed: true, actual, method });
      console.log('PASS tactical-visual ' + name + ' ' + title);
      fsSync.writeFileSync(path.join(evidenceDir, 'tactical-visual-progress.json'), JSON.stringify({ passed: false, complete: false, results, screenshots }, null, 2));
    };
    const decodedPNG = async (bytes, expectedFramebuffer) => {
      assert.deepEqual(Array.from(bytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
      const observed = await page.evaluate(async dataURL => {
        const image = new Image(); image.src = dataURL; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set(); let opaque = 0;
        for (let i = 0; i < data.length; i += 4) { colors.add([data[i] >> 4, data[i + 1] >> 4, data[i + 2] >> 4].join(',')); if (data[i + 3] === 255) opaque++; }
        return { width: canvas.width, height: canvas.height, colors: colors.size, opaque };
      }, 'data:image/png;base64,' + bytes.toString('base64'));
      if (expectedFramebuffer) {
        // Production Low quality renders at 72%: a requested 384px GPU
        // fixture is 276px, not a full-page screenshot. Check the exact
        // measured framebuffer rather than an unrelated viewport threshold.
        assert.deepEqual([observed.width, observed.height], [expectedFramebuffer.width, expectedFramebuffer.height]);
        assert(observed.width >= 192 && observed.height >= 192 && observed.colors > 20);
        assert.equal(observed.opaque, observed.width * observed.height);
      } else assert(observed.width > 300 && observed.height > 300 && observed.colors > 20);
      return { ...observed, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    };
    const shot = async label => {
      assert.equal(await page.evaluate(() => App.rend.gl.getError()), 0);
      const file = name + '-' + label + '.png', bytes = await page.screenshot({ timeout: 90000 });
      await fs.writeFile(path.join(out, file), bytes); screenshots.push('tactical-visual/' + file);
      return decodedPNG(bytes);
    };
    const hideHelp = async () => page.evaluate(() => {
      for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on');
      document.getElementById('radio').innerHTML = '';
    });
    const freeze = async () => { await page.evaluate(() => { window.__tacticalVisualClock = true; }); await page.waitForTimeout(60); await hideHelp(); };
    // Production scene and production shader, with explicitly positioned eye
    // and original camera restored. No physics, score or target mutation.
    const sceneFixture = async (label, polish) => page.evaluate(({ label, polish }) => {
      const g = App.game, R = App.rend, target = g.world.targets.find(t => FlightStrikeScene.targetVisual(g, t));
      if (!target) throw new Error('No terrain-supported depot fixture');
      const focus = FlightStrikeScene.targetVisual(g, target).p, eye = [focus[0] + 50, focus[1] + 27, focus[2] + 60], forward = [focus[0] - eye[0], focus[1] + 2 - eye[1], focus[2] - eye[2]];
      const saved = { p: g.ac.p, v: g.ac.v, yaw: g.ac.yaw, pitch: g.ac.pitch, roll: g.ac.roll, extView: g.extView, camSm: g.camSm };
      const camera = R.setCamera, atmosphere = R.setAtmos, draw = R.drawMesh, savedPolish = R.surfacePolish, draws = [];
      g.ac.p = eye.slice(); g.ac.v = [0, 0, 0]; g.ac.yaw = Math.atan2(forward[0], -forward[2]); g.ac.pitch = -.24; g.ac.roll = 0; g.extView = false;
      R.setCamera = function () { return camera.call(this, eye, forward, [0, 1, 0], 52, .5, 60000, this.W / this.H); };
      R.setAtmos = function (a) { this.surfacePolish = polish; return atmosphere.call(this, a); };
      R.drawMesh = function (name, data, count) { if (name.startsWith('bnStrike')) draws.push({ name, count }); return draw.apply(this, arguments); };
      try { g.render(1 / 60); } finally { R.setCamera = camera; R.setAtmos = atmosphere; R.drawMesh = draw; R.surfacePolish = savedPolish; Object.assign(g.ac, { p: saved.p, v: saved.v, yaw: saved.yaw, pitch: saved.pitch, roll: saved.roll }); g.extView = saved.extView; g.camSm = saved.camSm; }
      const gl = R.gl, w = Math.min(480, R.W), h = Math.min(320, R.H), pixels = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(Math.floor((R.W - w) / 2), Math.floor((R.H - h) / 2), w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (!window.__tacticalScenePixels) window.__tacticalScenePixels = {};
      let changed = 0, max = 0; const baseline = __tacticalScenePixels.original;
      if (baseline && polish) for (let i = 0; i < pixels.length; i += 4) { const d = Math.max(Math.abs(pixels[i] - baseline[i]), Math.abs(pixels[i + 1] - baseline[i + 1]), Math.abs(pixels[i + 2] - baseline[i + 2])); if (d > 3) changed++; max = Math.max(max, d); }
      __tacticalScenePixels[polish ? 'polished' : 'original'] = pixels;
      return { label, polish, focus, eye, draws, sample: [w, h], changed, max, surfaceUniform: !!R.pTer.u.uSurfacePolish, meshUniform: !!R.pMesh.u.uSurfacePolish, gl: gl.getError() };
    }, { label, polish });
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
      const sourceSHA256 = createHash('sha256').update(await response.body()).digest('hex');
      await page.waitForFunction(() => window.App && window.FlightTacticalApproach && window.FlightVisualMaterials);
      await click(page.locator('#bootGo')); await click(page.locator('#dixieReady')); await click(page.locator('#dixiePractice'));
      await page.waitForFunction(() => App.game?.strikeExperience && App.game.mis.id === 'm2' && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
      await freeze(); await page.evaluate(() => { App.game.render(1 / 60); App.game.syncControls(); });
      const entry = await page.evaluate(() => {
        const R = App.rend, gl = R.gl, g = App.game;
        return { mission: g.mis.id, airborne: !g.ac.onDeck, alive: g.ac.alive, seat: g.rightSeat, dropped: g.world.score.dropped, killed: g.world.score.killed, targetHP: g.world.targets.map(t => t.hp), gpu: gl.getParameter(gl.VERSION), linked: ['pTer', 'pMesh', 'pSprite', 'pSea'].map(key => ({ key, linked: gl.getProgramParameter(R[key], gl.LINK_STATUS) })), gl: gl.getError() };
      });
      assert.equal(entry.mission, 'm2'); assert(entry.airborne && entry.alive && entry.seat); assert.equal(entry.dropped, 0); assert.equal(entry.killed, 0); assert(entry.targetHP.every(hp => hp === 55)); assert.match(entry.gpu, /^WebGL 2/); assert(entry.linked.every(p => p.linked)); assert.equal(entry.gl, 0);
      await Promise.all(digestTasks);
      record('Native short B/N practice loads complete original target gameplay and linked production graphics programs', { sourceSHA256, runtimeSHA256, entry }, 'Native Ready Room → Dixie → SHORT B/N PRACTICE with actual mouse or emulated touch. Automatic RAF is suspended after the original loader; this is not a completed sortie.');

      await click(page.locator('#dixieApproach'));
      await click(page.locator('#dixieRouteTerrain'));
      const terrainRoute = await page.evaluate(() => ({ tactical: FlightTacticalApproach.inspect(App.game), nav: JSON.stringify(App.game.world.route), steered: App.game.steer, acls: App.game.acls }));
      assert.equal(terrainRoute.tactical.choice, 'terrain'); assert.equal(terrainRoute.tactical.following, true); assert(terrainRoute.tactical.route.points.length >= 3);
      await click(page.locator('#dixieApproach'));
      await click(page.locator('#dixieRouteDirect'));
      const directRoute = await page.evaluate(() => ({ tactical: FlightTacticalApproach.inspect(App.game), nav: JSON.stringify(App.game.world.route) }));
      assert.equal(directRoute.tactical.choice, 'direct'); assert.equal(directRoute.nav, terrainRoute.nav); assert(directRoute.tactical.route.clearance > terrainRoute.tactical.route.clearance);
      record('Native route choices select distinct terrain-clearance approaches without replacing the original navigation chart', { terrainRoute, directRoute }, 'Native mouse/touch APPROACH, TERRAIN and DIRECT controls. The original World.route and target IDs remain unchanged. Route selection itself earns no hits or mission success.');

      await click(page.locator('#dixieApproach'));
      const routeControls = await page.evaluate(() => ['dixieRouteDirect', 'dixieRouteTerrain', 'dixieRouteFree'].map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { id, x: r.x, y: r.y, width: r.width, height: r.height, reachable: hit === e || e.contains(hit) }; }));
      for (const button of routeControls) assert(button.width >= 44 && button.height >= 44 && button.reachable, JSON.stringify(button));
      const routeShot = await shot('native-route-selection');
      await click(page.locator('#dixieRouteTerrain'));
      const flownRoute = await page.evaluate(() => {
        const g = App.game, before = { p: g.ac.p.slice(), leg: FlightTacticalApproach.inspect(g).leg, fixes: g.world.nav.fixes, route: JSON.stringify(g.world.route), time: g.t }, trace = [];
        let steps = 0;
        for (; steps < 75 * 60 && g.ac.alive && !g.result && !g.evade && !g.chute; steps++) {
          g.update(1 / 60);
          if (steps % 300 === 0) trace.push({ time: g.t, p: g.ac.p.slice(), agl: g.ac.radalt, tactical: FlightTacticalApproach.inspect(g).leg });
          if (FlightTacticalApproach.inspect(g).leg > before.leg) break;
        }
        const after = { p: g.ac.p.slice(), leg: FlightTacticalApproach.inspect(g).leg, fixes: g.world.nav.fixes, route: JSON.stringify(g.world.route), time: g.t, alive: g.ac.alive, dropped: g.world.score.dropped, killed: g.world.score.killed, stores: g.ac.bombs, tactical: FlightTacticalApproach.inspect(g) };
        return { before, after, steps, trace };
      });
      assert(flownRoute.after.alive && flownRoute.after.leg > flownRoute.before.leg); assert(flownRoute.after.time > flownRoute.before.time + 10); assert.equal(flownRoute.after.fixes, flownRoute.before.fixes); assert.equal(flownRoute.after.route, flownRoute.before.route); assert.equal(flownRoute.after.dropped, 0); assert.equal(flownRoute.after.killed, 0); assert.equal(flownRoute.after.stores, 12);
      record('The original pilot genuinely flies and advances the selected low route without automatically earning a radar fix or attack result', { routeControls, screenshot: routeShot, flownRoute }, 'Native low-route selection, then fixed 1/60-second original Game.update until the first physical waypoint crossing. No aircraft position/velocity, navigation-fix, target, HP, damage or score writes. Real original flight, terrain, defenses and pilot remain active.');

      await click(page.locator('#dixieLook'));
      const originalScene = await sceneFixture('original-material-reference', 0);
      const originalShot = await shot('fixture-original-material-reference');
      const polishedScene = await sceneFixture('polished-materials', 1);
      const polishedShot = await shot('fixture-polished-depot-and-fields');
      assert(originalScene.draws.some(d => d.name === 'bnStrikeDepot')); assert(polishedScene.surfaceUniform && polishedScene.meshUniform); assert(polishedScene.changed > 300); assert(polishedScene.max > 10); assert.equal(polishedScene.gl, 0);
      record('Surface materials visibly change the real terrain and detailed depot while preserving world geometry and targets', { originalScene, polishedScene, originalShot, polishedShot }, 'Declared identical close-up camera/aircraft render fixtures; only production surfacePolish uniform differs. Actual final WebGL ROI is compared, and both screenshots are decoded as PNG images. Aircraft is restored after each render.');

      await page.evaluate(() => { const R = App.rend; R.quality = 1; R.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1); });
      try {
        const mediumScene = await sceneFixture('medium-quality-polished-materials', 1);
        const mediumShot = await shot('fixture-medium-polished-depot-and-fields');
        assert.equal(mediumScene.gl, 0); assert(mediumScene.draws.some(d => d.name === 'bnStrikeDepot'));
        record('Medium-quality production scenery and shadows render the polished depot in the complete world', { mediumScene, screenshot: mediumShot }, 'Additional declared camera/aircraft render fixture using the existing Medium setting, original world lights and production shadow passes. This is a real WebGL screenshot, not another flown sortie or hardware-performance measurement.');
      } finally { await page.evaluate(() => { const R = App.rend; R.quality = 0; R.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1); }); }

      await click(page.locator('#dixieLook'));
      const damage = await page.evaluate(() => {
        const g = App.game, h = g.hud, before = { damage: { ...g.ac.dmg }, score: g.world.score.damage, hits: g.ac.hits };
        FlightAirframeFeedback.tick(g, 0);
        const actualOrigin = [g.ac.p[0] + Math.cos(g.ac.yaw) * 250, g.ac.p[1], g.ac.p[2] + Math.sin(g.ac.yaw) * 250];
        const random = Math.random; let n = 0;
        try { Math.random = () => n++ === 0 ? .5 : .1; g.world.hitAircraft(g.ac, .25, 'flak', actualOrigin); }
        finally { Math.random = random; }
        const armament = h.bnArmament; let panel;
        h.bnArmament = function (st, x, y, w, tiny) { panel = { x, y, width: w, height: 20 + 5 * (tiny ? 19 : 23) }; return armament.apply(this, arguments); };
        try { g.render(1 / 60); g.syncControls(); } finally { h.bnArmament = armament; }
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r = clamp(Math.min(h.W * .26, h.H * .40), 78, 235), cx = h.W - r - clamp(h.W * .06, 14, 70), cy = h.H * .50;
        const e = document.getElementById('flightAirframeFeedback'), box = e.getBoundingClientRect();
        const controls = ['stick', 'pickle', 'rcol', 'rpow', 'dixiePanel'].map(id => { const element = document.getElementById(id), b = element.getBoundingClientRect(); return { id, x: b.x, y: b.y, width: b.width, height: b.height, visible: !!element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' }; }).filter(c => c.visible && c.width > 0 && c.height > 0);
        return { before, after: { damage: { ...g.ac.dmg }, score: g.world.score.damage, hits: g.ac.hits, alive: g.ac.alive }, source: actualOrigin, view: FlightAirframeFeedback.view(g), card: { hidden: e.hidden, text: e.textContent, pointerEvents: getComputedStyle(e).pointerEvents, x: box.x, y: box.y, width: box.width, height: box.height }, armament: panel, ddi: { x: cx - r - 13, y: cy - r - 13, width: 2 * (r + 13), height: 2 * (r + 13) }, controls, viewport: [innerWidth, innerHeight], gl: App.rend.gl.getError() };
      });
      assert.equal(damage.after.hits, damage.before.hits + 1); assert(Math.abs(damage.after.score - damage.before.score - .25) < .0001); assert(Math.abs(damage.after.damage.hyd - damage.before.damage.hyd - .20) < .0001); assert(damage.after.alive); assert.equal(damage.view.alert.title, 'HYDRAULIC DAMAGE'); assert.equal(damage.view.alert.direction, 'STARBOARD'); assert.equal(damage.card.hidden, false); assert.equal(damage.card.pointerEvents, 'none'); assert.equal(damage.gl, 0);
      const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      assert(damage.card.x >= 0 && damage.card.y >= 0 && damage.card.x + damage.card.width <= damage.viewport[0] && damage.card.y + damage.card.height <= damage.viewport[1]); assert(damage.armament && !overlaps(damage.card, damage.armament)); assert(!overlaps(damage.card, damage.ddi));
      for (const c of damage.controls) assert(!overlaps(damage.card, c), 'Damage card covers ' + c.id);
      const damageShot = await shot('fixture-original-hydraulic-damage-report');
      await click(page.locator('#pauseBtn'));
      const pausedDamage = await page.evaluate(() => ({ paused: App.game.paused, hidden: document.getElementById('flightAirframeFeedback').hidden, sources: FlightAirframeFeedback.view(App.game).sourceCount }));
      assert(pausedDamage.paused && pausedDamage.hidden); assert.equal(pausedDamage.sources, 0);
      await click(page.locator('#pauseVeil').getByRole('button', { name: 'Resume', exact: true }));
      record('Original damage allocation produces an accurate unobstructed instrument report that suspends on native pause', { damage, pausedDamage, screenshot: damageShot }, 'Declared isolated real World.hitAircraft fixture with a .25-severity flak origin and controlled random allocation to the original hydraulic branch; randomness is immediately restored. No direct aircraft-damage/HP/score writes and no projectile-hit claim. Actual B/N armament panel and DDI bounds are compared against the live card on both layouts. Sound is disabled in this suite; audio ownership has separate tests.');

      // Reload into the normal prison entry; all subsequent movement uses real
      // production stepEvade, AI navigation and collision.
      await page.goto(target, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.App && window.POW?.FigureMotion);
      await click(page.locator('#bootGo')); await click(page.locator('#powChapter button').filter({ hasText: 'Enter the prison' }));
      await page.waitForFunction(() => App.game?.pow?.stage === 'cell' && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
      await freeze();
      await installCompletePhotoFixture(page); await installCompletePhotoFixture.waitPOWVegetation(page);
      const prisonEntry = await page.evaluate(() => { const g = App.game; g.render(1 / 60); g.syncControls(); return { phase: g.phase, stage: g.pow.stage, frozen: g.evade.frozen, solids: g.pow.solids.length, actors: g.evade.searchers.length, active: document.body.classList.contains('pow-active'), gl: App.rend.gl.getError() }; });
      assert.equal(prisonEntry.phase, 'evade'); assert.equal(prisonEntry.stage, 'cell'); assert(!prisonEntry.frozen && prisonEntry.active); assert(prisonEntry.solids > 20 && prisonEntry.actors > 0); assert.equal(prisonEntry.gl, 0);
      const cellShot = await shot('native-cell-environment');
      record('Native prison entry retains an interactive solid-walled first-person cell', { prisonEntry, screenshot: cellShot }, 'Native Ready Room prison control on desktop/touch, with unchanged original cell spawn and no stage teleport. Actual custom-WebGL cell screenshot.');

      const patrol = await page.evaluate(() => {
        const g = App.game, actors = g.evade.searchers, before = actors.map(a => a.p.slice()), paths = actors.map(() => []), poses = [];
        let penetrations = 0, peakSpeed = 0, movingPoses = 0;
        for (let i = 0; i < 160; i++) {
          g.t += .05; g.stepEvade(.05);
          for (let j = 0; j < actors.length; j++) { const a = actors[j]; if (a.alive && POW.blocked(g, a.p[0], a.p[2], .30, a.p[1])) penetrations++; if (i % 20 === 0) paths[j].push(a.p.slice()); const p = POW.FigureMotion.pose(a, g); peakSpeed = Math.max(peakSpeed, p.speed || 0); if (p.enabled && p.stride > .1) movingPoses++; }
        }
        for (const a of actors) poses.push({ id: a.id, state: a.state, pose: POW.FigureMotion.pose(a, g), p: a.p.slice() });
        return { moved: actors.some((a, i) => Math.hypot(a.p[0] - before[i][0], a.p[2] - before[i][2]) > .2), penetrations, peakSpeed, movingPoses, paths, poses, playerStage: g.pow.stage };
      });
      assert(patrol.moved && patrol.movingPoses > 10); assert.equal(patrol.penetrations, 0); assert(patrol.peakSpeed > .1 && patrol.peakSpeed < 6); assert.equal(patrol.playerStage, 'cell');
      record('Original prison patrols genuinely walk with bounded photographic articulation and never penetrate solid walls', patrol, 'Eight seconds of original Game.stepEvade with native player remaining in his locked cell. Every guard position is checked against actual POW.blocked at every 50 ms step. No guard position, route or AI state setters.');

      const bodies = await page.evaluate(() => {
        const g = App.game, b = g.pow.base;
        // Explicit isolated actor-roster fixture in the existing open yard.
        // Identities, paths and render source use the real authored game APIs.
        const list = [['farmer', 4], ['vc', 9], ['nva', 14]].map(([kind, x], index) => POW.AI.makeActor({ id: 'visual-fixture-' + kind, kind, p: [b[0] + x, b[1], b[2] + 12], route: [[b[0] + x, b[1], b[2] + 12], [b[0] + x, b[1], b[2] + 6]], face: 0, schedule: { cycle: 10000, rounds: 9999, offset: 0 }, dwell: 0 }));
        for (const a of list) if (POW.blocked(g, a.p[0], a.p[2], .32, a.p[1])) throw new Error('Actor fixture intersects prison solid');
        g.evade.searchers = list; g.pow.actors = list; POW.FigureMotion.reset(g);
        const start = list.map(a => a.p.slice()), before = list.map(a => POW.FigureMotion.pose(a, g));
        // Farmers normally rest at this nighttime hour. A declared audible
        // event exercises the genuine civilian flee and guard investigation
        // responses rather than overriding that legitimate duty schedule.
        POW.AI.noise(g, g.evade.p, 1.4, 'gunshot', 'acceptance-sound-fixture');
        let penetrations = 0, maximumFrameDisplacement = 0, previous = list.map(a => a.p.slice());
        for (let n = 0; n < 40; n++) { g.t += .05; g.stepEvade(.05); for (let i = 0; i < list.length; i++) { const a = list[i]; if (POW.blocked(g, a.p[0], a.p[2], .30, a.p[1])) penetrations++; maximumFrameDisplacement = Math.max(maximumFrameDisplacement, Math.hypot(a.p[0] - previous[i][0], a.p[2] - previous[i][2])); previous[i] = a.p.slice(); } }
        const moving = list.map((a, i) => ({ kind: a.kind, state: a.state, attention: a.attention, moved: Math.hypot(a.p[0] - start[i][0], a.p[2] - start[i][2]), pose: POW.FigureMotion.pose(a, g), footY: a.p[1], groundY: POW.floorY(g, a.p[0], a.p[2], a.p[1]) }));
        window.__tacticalActorFixture = { actors: list, start, before, moving };
        return { before, moving, penetrations, maximumFrameDisplacement };
      });
      assert.equal(bodies.penetrations, 0); assert(bodies.maximumFrameDisplacement < .3);
      for (const a of bodies.moving) { assert(a.moved > .2 && a.pose.enabled && a.pose.stride > .1, JSON.stringify(a)); assert(Math.abs(a.footY - a.groundY) < .01); assert.equal(a.pose.teleported, false); }
      assert.equal(bodies.moving.find(a => a.kind === 'farmer').pose.row, 6); assert.equal(bodies.moving.find(a => a.kind === 'vc').pose.row, 3);
      assert.equal(bodies.moving.find(a => a.kind === 'farmer').state, 'flee'); assert(bodies.moving.filter(a => a.kind !== 'farmer').every(a => a.state === 'investigate' && a.attention.reason === 'sound'));
      record('A farmer flees while VC and NVA investigate an audible event with intact identity, grounded feet and real movement', bodies, 'Declared actor-roster and audible gunshot-event fixtures in existing open prison yard, then two seconds of real stepEvade/POW.AI hearing and collision navigation. The nighttime civilian normally rests; the real noise response starts movement. No per-frame position, seen or AI-state assignments.');

      const groundedRender = await page.evaluate(() => {
        const g = App.game, R = App.rend, b = g.pow.base, list = __tacticalActorFixture.actors, origin = [b[0] + 9, b[1] + 1.55, b[2] + 22];
        const camera = R.setCamera, draw = R.drawSprites, calls = [];
        R.setCamera = function () { return camera.call(this, origin, [0, -.035, -1], [0, 1, 0], 58, .1, 60000, this.W / this.H); };
        R.drawSprites = function (texture, sprites) { for (const s of sprites) { const match = list.find(a => a === s.owner); if (match) calls.push({ kind: match.kind, texture, ...__completePhotoFixture.meta(s), worldFeet: match.p[1] }); } return draw.apply(this, arguments); };
        try { g.render(1 / 60); } finally { R.setCamera = camera; R.drawSprites = draw; }
        return { calls, eye: origin, gl: R.gl.getError(), legacyAtlasUploaded: !!R.textures.people, state: PhotoCutouts.inspect(R) };
      });
      assert.equal(groundedRender.calls.length, 3); assert.equal(groundedRender.legacyAtlasUploaded, false); assert.equal(groundedRender.state.status, 'ready'); assert.equal(groundedRender.gl, 0);
      for (const a of groundedRender.calls) { assert.match(a.texture, /^photo_hr_/); assert.equal(a.complete, true); assert.equal(a.cols, 1); assert.equal(a.rows, 1); assert.equal(a.cell, 0); assert(a.liveTexture); assert(Math.abs(a.feet - a.worldFeet) < .001); assert(Math.abs(a.renderedAspect - a.sourceAspect) < .001); assert(a.visibleHeight > 1.2 && a.visibleHeight < 1.9); assert.ok(!a.motion); }
      const peopleShot = await shot('fixture-photographic-farmer-vc-nva-prison');
      record('Production renderer draws intact farmer, VC and NVA photographs with exact source aspect and ground anchors', { groundedRender, screenshot: peopleShot }, 'Declared prison-yard camera fixture renders complete production world plus real moving actor fixture. Captured complete-image descriptors retain authored pose registration, with foot positions reconstructed from current baseline metadata. Screenshot is decoded and checked for visible image data.');

      const stopped = await page.evaluate(() => {
        const g = App.game, list = __tacticalActorFixture.actors;
        for (const a of list) { a.home = a.p.slice(); a.route = [a.p.slice()]; a.goal = a.p.slice(); a.path = []; a.wp = 0; a.state = 'patrol'; a.flee = 0; a.sus = 0; a.dwellUntil = g.pow.aiClock + 5; }
        const before = list.map(a => POW.FigureMotion.pose(a, g));
        for (let n = 0; n < 60; n++) { g.t += .05; g.stepEvade(.05); }
        const after = list.map(a => POW.FigureMotion.pose(a, g));
        const phase = after.map(p => p.phase);
        for (let n = 0; n < 5; n++) { g.t += .05; g.stepEvade(.05); }
        return { before, after, settled: list.map((a, i) => ({ kind: a.kind, pose: POW.FigureMotion.pose(a, g), phaseDelta: Math.abs(POW.FigureMotion.pose(a, g).phase - phase[i]) })) };
      });
      for (const a of stopped.settled) { assert(a.pose.stride < .02); assert(a.pose.speed < .02); assert(a.phaseDelta < .001); assert.equal(a.pose.teleported, false); }
      record('Walking settles smoothly into idle without marching in place or changing civilian identity', stopped, 'The declared roster is reset to an in-place patrol dwell through authored fixture state and original guard schedule/path data. Real stepEvade is advanced for 3.25 seconds; FigureMotion must settle and stop accumulating stride phase.');

      const gpu = await page.evaluate(async () => {
        const R = App.rend, gl = R.gl, saved = { quality: R.quality, float: R.floatBuf, atm: R.atm, episode: R.episode, time: R.time };
        R.quality = 0; R.floatBuf = false; R.resize(384, 384, 1);
        const fixtureDimensions = { width: R.W, height: R.H };
        R.setCamera([0, 1, 0], [0, 0, -1], [0, 1, 0], 50, .1, 100, 1);
        R.setAtmos({ ...R.atm, amb: [.8, .8, .8], gnd: [0, 0, 0], sunCol: [0, 0, 0], horizon: [0, 0, 0], zenith: [0, 0, 0], fogDens: 0, overcast: 0 });
        R.setEpisode({ ambient: [.75, .75, .75], fogColor: [0, 0, 0], fogDensity: .000001, lights: [], water: { enabled: false } }, { p: [0, 0, 0], solids: [] }); R.setFires([]);
        const clear = () => { R.begin(); gl.clearColor(0, .25, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); };
        const read = () => { const pixels = new Uint8Array(R.W * R.H * 4); gl.readPixels(0, 0, R.W, R.H, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; };
        const compare = (a, b) => { let changed = 0, covered = 0, lost = 0; for (let i = 0; i < a.length; i += 4) { const delta = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); const fg = a[i] > 2 || Math.abs(a[i + 1] - 64) > 2 || a[i + 2] > 2, bg = b[i] <= 2 && Math.abs(b[i + 1] - 64) <= 2 && b[i + 2] <= 2; if (delta > 3) changed++; if (fg) covered++; if (fg && bg && delta > 3) lost++; } return { changed, covered, lost }; };
        const png = pixels => { const c = document.createElement('canvas'); c.width = R.W; c.height = R.H; const ctx = c.getContext('2d'), data = ctx.createImageData(R.W, R.H); for (let y = 0; y < R.H; y++) data.data.set(pixels.subarray(y * R.W * 4, (y + 1) * R.W * 4), (R.H - 1 - y) * R.W * 4); ctx.putImageData(data, 0, 0); return c.toDataURL('image/png'); };
        const samples = [], images = [];
        for (const [kind, subject] of [['farmer', 'farmer'], ['vc', 'militia'], ['nva', 'nva']]) {
          const F = __completePhotoFixture; await F.prepare(subject, 'walk');
          const sprite = F.sprite(subject), movingSprite = F.sprite(subject, [0, 0, -3], { clip: 'walk', phase: .25 }), farSprite = F.sprite(subject, [0, 0, -6]);
          clear(); R.drawSprites(sprite.textureName, [sprite]); const source = read();
          clear(); R.drawSprites(sprite.textureName, [{ ...sprite }]); const neutral = read();
          clear(); R.drawSprites(movingSprite.textureName, [movingSprite]); const moving = read();
          clear(); R.drawSprites(farSprite.textureName, [farSprite]); const distant = read();
          const neutralDiff = compare(source, neutral), motionDiff = compare(neutral, moving), distantCovered = compare(distant, distant).covered;
          samples.push({ kind, source: F.meta(sprite), moving: F.meta(movingSprite), neutral: neutralDiff, motion: motionDiff, nearPixels: neutralDiff.covered, distantPixels: distantCovered, areaRatio: neutralDiff.covered / distantCovered });
          images.push({ name: kind + '-complete-near', png: png(neutral) }, { name: kind + '-authored-walk-near', png: png(moving) });
        }
        const wall = new MB(); wall.quad([-2, 0, -2], [2, 0, -2], [2, 2, -2], [-2, 2, -2], [.5, .5, .5]); R.meshFromBuilder('tacticalGPUWall', wall);
        const identity = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,1,1,1,0]);
        clear(); R.drawMesh('tacticalGPUWall', identity, 1); const wallOnly = read(); const behind = __completePhotoFixture.sprite('nva'); R.drawSprites(behind.textureName, [behind]); const occluded = read();
        const occlusion = compare(wallOnly, occluded), state = { depthWrites: gl.getParameter(gl.DEPTH_WRITEMASK), depthTest: gl.isEnabled(gl.DEPTH_TEST), blending: gl.isEnabled(gl.BLEND), culling: gl.isEnabled(gl.CULL_FACE) }, error = gl.getError();
        const leaf = PHOTO_ATLAS.vegetation.frames[7], wholeHeight = 3.5 / leaf.height, plant = { p: [0, -leaf.bottom * wholeHeight, -6], h: wholeHeight, w: 3, cell: 7, cols: 8, rows: 6, motion: [0, 0, 0, leaf.bottom] };
        R.quality = 1; R.time = 0; clear(); R.drawSprites('photo_vegetation', [plant]); const foliage0 = read();
        R.time = 3; clear(); R.drawSprites('photo_vegetation', [plant]); const foliage3 = read();
        let firstRow = R.H, lastRow = 0;
        for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++) { const i = (y * R.W + x) * 4; if (foliage0[i] > 2 || Math.abs(foliage0[i + 1] - 64) > 2 || foliage0[i + 2] > 2) { firstRow = Math.min(firstRow, y); lastRow = Math.max(lastRow, y); } }
        let baseChanged = 0; const lastBaseRow = firstRow + Math.max(1, Math.floor((lastRow - firstRow) * .05));
        for (let y = firstRow; y <= lastBaseRow; y++) for (let x = 0; x < R.W; x++) { const i = (y * R.W + x) * 4; if (Math.max(Math.abs(foliage0[i] - foliage3[i]), Math.abs(foliage0[i + 1] - foliage3[i + 1]), Math.abs(foliage0[i + 2] - foliage3[i + 2])) > 3) baseChanged++; }
        const batchDraw = gl.drawArraysInstanced, batches = [];
        gl.drawArraysInstanced = function (mode, first, count, instances) { batches.push({ mode, count, instances }); return batchDraw.apply(this, arguments); };
        try { clear(); R.drawSprites('photo_vegetation', Array.from({ length: 70 }, (_, i) => ({ ...plant, p: [(i % 10 - 5) * .04, plant.p[1], -6 - Math.floor(i / 10) * .04] }))); }
        finally { gl.drawArraysInstanced = batchDraw; }
        const mediumBatches = batches.splice(0);
        R.quality = 0;
        gl.drawArraysInstanced = function (mode, first, count, instances) { batches.push({ mode, count, instances }); return batchDraw.apply(this, arguments); };
        try { clear(); R.drawSprites('photo_vegetation', [plant]); }
        finally { gl.drawArraysInstanced = batchDraw; }
        const lowBatches = batches.splice(0), foliage = { change: compare(foliage0, foliage3), firstRow, lastRow, baseChanged, mediumBatches, lowBatches, articulatedVertices: R.spMotionCount, gl: gl.getError() };
        images.push({ name: 'vegetation-anchored-t0', png: png(foliage0) }, { name: 'vegetation-breeze-t3', png: png(foliage3) });
        R.floatBuf = saved.float; R.quality = saved.quality; R.setAtmos(saved.atm); R.setEpisode(saved.episode); R.time = saved.time; R.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
        return { samples, occlusion, state, error, foliage, images, fixtureDimensions };
      });
      for (const sample of gpu.samples) { assert.equal(sample.source.complete, true); assert.equal(sample.source.cols, 1); assert.equal(sample.source.rows, 1); assert.notEqual(sample.source.asset, sample.moving.asset); assert(sample.neutral.covered > 1000); assert.equal(sample.neutral.lost, 0); assert(sample.neutral.changed < sample.neutral.covered * .05); assert(sample.motion.changed > 50); assert(sample.areaRatio > 3.5 && sample.areaRatio < 4.5); }
      record('Actual GPU complete photographs retain solid silhouettes, distinct authored poses and perspective scaling', { sourcePhotographSHA256, samples: gpu.samples }, 'Explicit production drawSprites GPU fixture at identical near/far distances. A held current cutout is compared pixel-for-pixel, authored walk selection must change the image, and 2× distance must yield approximately ¼ image area. Authored poses are not recorded film or a physical-device frame-rate measurement.');
      assert.equal(gpu.occlusion.changed, 0); assert.deepEqual(gpu.state, { depthWrites: true, depthTest: true, blending: false, culling: true }); assert.equal(gpu.error, 0);
      record('Opaque walls fully occlude moving photographic people and sprite passes restore depth/alpha/culling state', { occlusion: gpu.occlusion, state: gpu.state, error: gpu.error }, 'Declared real MB wall plus current complete photograph drawn behind it using production GPU shaders. Final framebuffer is unchanged by the occluded figure.');
      assert(gpu.foliage.change.changed > 100); assert.equal(gpu.foliage.baseChanged, 0); assert.equal(gpu.foliage.gl, 0);
      assert(gpu.foliage.mediumBatches.some(b => b.count === gpu.foliage.articulatedVertices && b.instances === 60)); assert(gpu.foliage.mediumBatches.some(b => b.count === 4 && b.instances === 10)); assert(gpu.foliage.lowBatches.every(b => b.count === 4));
      record('Photographic vegetation moves gently above an immobile ground anchor with a strict 60-plant medium-quality budget', gpu.foliage, 'Declared actual vegetation cutout GPU fixture at production time 0 and 3 seconds. Lower visible base pixels must remain unchanged. Real draw-call capture verifies 60 near articulated plants plus ten ordinary quads at medium quality, and only ordinary quads at low quality. No source photograph edits.');
      const decodedFixtures = [];
      for (const image of gpu.images) { const file = name + '-gpu-fixture-' + image.name + '.png', bytes = Buffer.from(image.png.split(',')[1], 'base64'); await fs.writeFile(path.join(out, file), bytes); screenshots.push('tactical-visual/' + file); decodedFixtures.push({ name: image.name, ...await decodedPNG(bytes, gpu.fixtureDimensions) }); }
      await Promise.all(digestTasks); assert.deepEqual(errors, []); assert.deepEqual(missing, []);
      record('Desktop or touch-layout assets, shader execution and captured PNG evidence complete without browser errors', { runtimeSHA256, errors, missing, decodedFixtures, screenshots: screenshots.filter(s => s.includes(name + '-')).length }, 'Uncaught JavaScript, asset HTTP status, WebGL getError, shader link status and lossless screenshot decode checks; Linux Chromium/SwiftShader only. Physical Windows GPU/iPhone Safari and device FPS remain manual tests.');
    } catch (error) {
      const failure = { suite: 'tactical-visual', passed: false, complete: false, profile: name, error: error.stack || String(error), errors, missing, results, screenshots };
      await fs.writeFile(path.join(evidenceDir, 'tactical-visual-failure.json'), JSON.stringify(failure, null, 2));
      await page.screenshot({ path: path.join(out, name + '-failure.png'), timeout: 90000 }).catch(() => {}); throw error;
    } finally { await context.close(); }
  }
  assert.equal(createHash('sha256').update(await fs.readFile(path.join(__dirname, '../assets/figures-original.png'))).digest('hex'), sourcePhotographSHA256);
  await fs.rm(path.join(evidenceDir, 'tactical-visual-progress.json'), { force: true });
  return { suite: 'tactical-visual', passed: true, total: results.length, results, screenshots, physicalWindowsTested: false, actualIPhoneSafariTested: false, scope: 'Linux Chromium/SwiftShader WebGL2 desktop and emulated iPhone landscape. Native Ready Room/route/prison controls followed by declared material camera, actor-roster and isolated GPU fixtures. Real original patrol updates, collision, photographic-alpha/perspective/depth and screenshot decoding. Separate Dixie suite validates a full native ballistic sortie and carrier recovery.' };
};
