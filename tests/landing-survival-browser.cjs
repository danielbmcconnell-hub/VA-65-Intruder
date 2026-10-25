'use strict';
// Real production WebGL2 and native keyboard/touch input after normal startup.
// Encounter setup is declared: aircraft are positioned above actual scenery or
// sea, and one shore/pursuit fixture selects starting feet/actors. No landing,
// injury, reunion, bank-exit, capture or rescue result is assigned by the test.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const auditSwimGPU = require('./swim-gpu-audit.cjs');

module.exports = async function landingSurvivalBrowser(browser, target, evidenceDir) {
  const section = process.env.INTRUDER_SURVIVAL_SECTION || 'all'; assert.ok(['all', 'ocean', 'river'].includes(section), 'Unknown survival test section');
  const out = path.join(evidenceDir, 'landing-survival'), checks = [], screenshots = [], sourceHashes = [], videos = [];
  await fs.mkdir(out, { recursive: true });
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
  ].filter(p => !process.env.INTRUDER_SURVIVAL_PROFILE || p.name === process.env.INTRUDER_SURVIVAL_PROFILE);
  for (const { name, ...options } of profiles) {
    const context = await browser.newContext(options), page = await context.newPage(), errors = [], missing = [], hashes = [], jobs = [];
    page.setDefaultTimeout(120000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {
      const file = new URL(r.url()).pathname;
      if (r.status() >= 400 && file.includes('/assets/')) missing.push({ file, status: r.status() });
      if (r.ok() && /\/assets\/(?:survival\/(?:landing-water|aviator-companion|equipment-view)|render\/(?:photo-cutouts|photo-motion|photographic-sprites)|pow\/(?:core|ai|river|feedback))\.js$/.test(file)) jobs.push(r.body().then(b => hashes.push({ file, sha256: createHash('sha256').update(b).digest('hex') })));
    });
    const click = locator => options.hasTouch ? locator.tap({ timeout: 15000 }) : locator.click({ timeout: 15000 });
    const eject = async () => { if (options.hasTouch) { await click(page.locator('#btnEject')); await click(page.locator('#btnEject')); } else await page.keyboard.press('j'); };
    const openControls = async () => { if (options.hasTouch) { await click(page.locator('#pauseBtn')); await click(page.locator('#pauseBody').getByRole('button', { name: 'Controls', exact: true })); } else await click(page.locator('#btnKeys')); };
    const record = (label, actual) => { checks.push({ layout: name, name: label, passed: true, actual }); console.log('PASS landing-survival ' + name + ' ' + label); };
    const tick = (seconds, render = true, untilDry = false, untilRadius = null) => page.evaluate(({ seconds, render, untilDry, untilRadius }) => {
      const g = App.game, started = g.t;
      let left = seconds;const contact=untilRadius?.companionContact?{queries:0,last:null}:null,blocked=g._blockedAt;
      // Observe the original solver's actual body rejection, then release the
      // native movement control before tangential sliding can go around him.
      if(contact)g._blockedAt=function(x,z,r,e){const result=blocked.apply(this,arguments);if(result&&e===this.evade&&AviatorCompanion.blockedAt(this,x,z,r,e)){contact.queries++;contact.last={x,z,r};}return result;};
      try{
      while (left > 1e-9 && !g.result && !['done', 'dead'].includes(g.phase) && !(untilDry && !LandingWater.swimming(g)) && !(contact?.queries) && !(untilRadius && !contact && Math.hypot(g.evade.p[0] - untilRadius.p[0], g.evade.p[2] - untilRadius.p[2]) >= untilRadius.distance)) { const dt = Math.min(1 / 60, left); g.update(dt); left -= dt; }
      }finally{if(contact)g._blockedAt=blocked;}
      if (render) { g.render(0); g.syncControls(); }
      return { phase: g.phase, elapsed: g.t - started, p: g.evade?.p.slice() || g.chute?.p.slice(), landing: LandingWater.view(g), companion: AviatorCompanion.view(g), gl: App.rend.gl.getError(), result: !!g.result,...(contact?{contact}:{} ) };
    }, { seconds, render, untilDry, untilRadius });
    const shot = async label => { const file = name + '-' + label + '.png'; await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('landing-survival/' + file); };
    let cdp;
    const touch = async (type, points = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p, radiusX: 5, radiusY: 5, force: 1 })) });
    async function forward(seconds, run = false, direction = 1, untilDry = false, untilRadius = null) {
      if (!options.hasTouch) {
        const key = direction < 0 ? 's' : 'w'; await page.keyboard.down(key); if (run) await page.keyboard.down('ShiftLeft');
        try { return await tick(seconds, true, untilDry, untilRadius); } finally { await page.keyboard.up(key); if (run) await page.keyboard.up('ShiftLeft'); }
      }
      const b = await page.locator('#stick').boundingBox();
      assert.ok(b, 'Original touch flight/ground stick is present');
      const p = { id: 1, x: b.x + b.width / 2, y: b.y + b.height / 2 };
      await touch('touchStart', [p]); await touch('touchMove', [{ ...p, y: p.y - direction * (b.height / 2 - 8) }]);
      try { return await tick(seconds, true, untilDry, untilRadius); } finally { await touch('touchEnd'); }
    }
    async function interact(seconds) {
      if (!options.hasTouch) { await page.keyboard.down('f'); try { return await tick(seconds); } finally { await page.keyboard.up('f'); } }
      const b = await page.locator('#powHUD .pow-context-controls button').first().boundingBox(); assert.ok(b);
      await touch('touchStart', [{ id: 9, x: b.x + b.width / 2, y: b.y + b.height / 2 }]);
      try { return await tick(seconds); } finally { await touch('touchEnd'); }
    }
    async function isolateGround() {
      return page.evaluate(() => {
        const g = App.game, e = g.evade;
        if (!e) throw Error('Expected original ground phase');
        e.searchers = []; e.locals = []; e.cattle = []; e.spawn = e.localRefill = e.cowT = 1e9;
        e.held = e.frozen = false; e.noise = 0; delete e.doom; delete e.doomMax;
        // The temporary entry flag only isolated randomized first contact.
        // Restore ordinary M1 survival before testing its real radio/CSAR.
        e.wildlifePractice = false; g.mis = { ...g.mis, wildlifePractice: false };
        g.wreck = null; g.paused = false; App.screen = 'game';
        if (Wildlife?.enter) Wildlife.enter(g, { seed: 1, disableSpawns: true, encounters: [] });
        for (const id of ['teach', 'teachPeek', 'legend', 'captVeil']) document.getElementById(id)?.classList.remove('on');
        for (const key of Object.keys(App.keys)) App.keys[key] = 0;
        for (const key of Object.keys(App.gctl)) if (typeof App.gctl[key] === 'number') App.gctl[key] = 0;
        g.render(0); g.syncControls(); return e.p.slice();
      });
    }
    try {
      await context.addInitScript(quality => {
        localStorage.setItem('a6_set', JSON.stringify({ quality, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
        localStorage.setItem('a6_sawkeys', '1');
        const raf = requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => window.__survivalFixture ? 0 : raf(t => { if (!window.__survivalFixture) callback(t); });
      }, options.hasTouch ? 1 : 2);
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200); sourceHashes.push({ layout: name, indexSHA256: createHash('sha256').update(await response.body()).digest('hex') });
      await click(page.locator('#bootFly'));
      await page.waitForFunction(() => App.game?.st && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
      if (options.hasTouch) cdp = await context.newCDPSession(page);
      await page.evaluate(() => { window.__survivalFixture = true; window.__survivalOriginalFrame = App.frame; App.frame = () => {}; App.game.paused = false; });
      await page.waitForFunction(() => { const s = PhotoCutouts.inspect(App.rend); if (s.status === 'error') throw Error(JSON.stringify(s.failures)); return s.status === 'ready'; }, null, { polling: 50 });
      assert.match(await page.evaluate(() => App.rend.gl.getParameter(App.rend.gl.VERSION)), /WebGL 2/);
      const presentation = await page.evaluate(() => ({ quality: App.rend.quality, requested: App.set.quality, canvas: [App.rend.W, App.rend.H], dpr: App.rend.dpr }));
      assert.equal(presentation.quality, options.hasTouch ? 1 : 2); assert.equal(presentation.requested, presentation.quality);
      const harness = await page.evaluate(async () => { await PhotoCutouts.preparePose(App.rend, 'aviator', 'harness'); return { ready: PhotoCutouts.hasPose(App.rend, 'aviator', 'harness'), record: PhotoCutouts.inspect(App.rend).records.find(r => r.key === 'aviator:harness') }; });
      assert.equal(harness.ready, true, 'The tested final build must contain the genuine complete suspended-harness photo'); assert.ok(harness.record.sourceHeight >= 1536);

      // The original controls card must be operable by a pointer, reopenable,
      // and its close state accurately exposed to assistive technologies.
      await openControls();
      await page.waitForFunction(() => document.getElementById('legend').classList.contains('on'), null, { polling: 50 });
      const closeHit = await page.locator('#legend [data-close-controls]').evaluate(node => { const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { clickable: node === hit || node.contains(hit), hit: hit?.id || hit?.tagName, legendZ: getComputedStyle(node.closest('#legend')).zIndex, point: [r.x + r.width / 2, r.y + r.height / 2] }; });
      assert.equal(closeHit.clickable, true, 'Controls Close is the actual hit target above overlapping coaching HUDs');
      await click(page.locator('#legend [data-close-controls]'));
      assert.equal(await page.locator('#btnKeys').getAttribute('aria-expanded'), 'false');
      await openControls(); await click(page.locator('#legend h4'));
      assert.equal(await page.locator('#legend').getAttribute('aria-hidden'), 'true');
      await openControls(); await click(options.hasTouch ? page.locator('#legend [data-close-controls]') : page.locator('#btnKeys'));
      record('Native controls card closes with Close or its content and can be reopened through the original device controls', { touch: !!options.hasTouch, opener: options.hasTouch ? 'Pause → Controls' : 'Keys toggle', closeHit, presentation });

      if (section === 'all') {
      const treeFixture = await page.evaluate(() => {
        const g = App.game, W = g.world, centre = W.briefed || W.tgtCenter;
        let selected;
        for (let r = 700; r < 3600 && !selected; r += 340) for (let a = 0; a < TAU && !selected; a += PI / 4) {
          const p = [centre[0] + Math.sin(a) * r, 100, centre[2] - Math.cos(a) * r];
          W.clutter(p, [], () => {});
          for (const list of W._cells.values()) for (const o of list) if (!selected && o.m === 'tree' && o.s > .65 && o.s < 1.3) {
            const h = terrainH(o.p[0], o.p[2]);
            if (h > 8 && dryJungleAt(o.p[0], o.p[2]) && !g._localSolidAt(o.p[0] + 3.5, o.p[2], .45)) selected = { id: 'tree:' + o.p[0].toFixed(2) + ':' + o.p[2].toFixed(2), p: [o.p[0], h, o.p[2]], scale: o.s, height: 13.7 * o.s };
          }
        }
        if (!selected) throw Error('No actual scenery tree for descent fixture');
        const startY = selected.p[1] + 79; let y = startY, vy = 12, vz = 0, open = 0, zTravel = 0;
        for (let i = 0; i < 2400 && y + 4.6 > selected.p[1] + selected.height + .1; i++) {
          const dt = 1 / 60; open = Math.min(1, open + dt * .7); vz += (-open * 4.5 - vz) * dt * .8;
          vy += ((open > .5 ? -6.2 : -38) - vy) * dt * 1.4; y += vy * dt; zTravel += vz * dt;
        }
        // This explicitly positioned aircraft fixture intersects an actual
        // tree after the original ejection and full, unedited descent.
        g.ac.p = [selected.p[0], startY - 14, selected.p[2] - zTravel]; g.ac.v = [0, 0, 0]; g.ac.onDeck = false; g.ac.gear = false;
        g.phase = 'airborne'; g.mis = { ...g.mis, wildlifePractice: true }; g.render(0); g.syncControls();
        window.__survivalRandom = Math.random; Math.random = () => 0;
        return { tree: selected, aircraft: g.ac.p.slice(), zTravel, scope: 'Positioned aircraft + deterministic initial canopy heading. Practice flag suppresses randomized first-contact dialogue; nearby ground encounters are isolated after landing. Original tree, ejection, descent, swept contact and injury APIs remain authoritative.' };
      });
      await eject();
      const ejected = await page.evaluate(() => { Math.random = window.__survivalRandom; const g = App.game; return { phase: g.phase, live: g.chute.live, companion: AviatorCompanion.view(g), player: { p: g.chute.p.slice(), open: g.chute.open } }; });
      assert.equal(ejected.phase, 'chute'); assert.ok(ejected.live.pilot && ejected.live.bn); assert.ok(ejected.companion.chute);
      assert.notDeepEqual(ejected.player.p, ejected.companion.chute.p);
      record('Actual command ejection starts both surviving aviators on sequenced independent trajectories', { fixture: treeFixture, ejected });
      const snag = await page.evaluate(() => {
        const g = App.game; let steps = 0;
        while (g.phase === 'chute' && !g.chute.landing && steps++ < 2400) g.update(1 / 60);
        const R = g.rend, draw = R.drawSprites, calls = [];
        R.drawSprites = function (texture, list, ...rest) { for (const q of list) if (q.owner?.companion) calls.push({ pose: q.photoPose, suspended: q.photoSuspended, airborne: q.owner.airborne, asset: q.photoAsset }); return draw.call(this, texture, list, ...rest); };
        try { g.render(0); g.syncControls(); } finally { R.drawSprites = draw; }
        return { steps, phase: g.phase, landing: LandingWater.view(g), p: g.chute?.p.slice(), floor: g.chute && terrainH(g.chute.p[0], g.chute.p[2]), companion: AviatorCompanion.view(g), photoCalls: calls, gl: App.rend.gl.getError() };
      });
      assert.equal(snag.phase, 'chute'); assert.equal(snag.landing.mode, 'hung'); assert.ok(snag.p[1] > snag.floor + 2); assert.equal(snag.gl, 0);
      if (snag.companion.chute?.open >= .42) { assert.ok(snag.photoCalls.length); for (const q of snag.photoCalls) { assert.equal(q.pose, 'harness'); assert.equal(q.suspended, true); assert.equal(q.airborne, true); } }
      const hung = await tick(1); assert.equal(hung.landing.cutProgress, 0); assert.equal(hung.phase, 'chute');
      await shot('tree-hang'); record('Actual descending canopy catches a rendered scenery tree and hangs until a deliberate cutaway', snag);
      const pause = await page.evaluate(() => { const g = App.game, before = JSON.stringify(g.chute); g.paused = true; for (let i = 0; i < 60; i++) g.update(1 / 60); const after = JSON.stringify(g.chute); g.paused = false; return { same: before === after }; });
      assert.equal(pause.same, true); record('Pausing freezes a real hanging canopy and cutaway progress', pause);
      await click(page.locator('#landingHudToggle')); assert.equal(await page.locator('.landingWaterControls').isVisible(), false);
      await click(page.locator('#landingHudToggle')); assert.equal(await page.locator('#landingCutaway').isVisible(), true);
      if (options.hasTouch) {
        const b = await page.locator('#landingCutaway').boundingBox(); assert.ok(b);
        await touch('touchStart', [{ id: 8, x: b.x + b.width / 2, y: b.y + b.height / 2 }]);
      } else await page.keyboard.down('v');
      const cut = await tick(2);
      if (options.hasTouch) await touch('touchEnd'); else await page.keyboard.up('v');
      assert.equal(cut.landing.mode, 'falling');
      const ground = await tick(4); assert.equal(ground.phase, 'evade');
      const cutState = await page.evaluate(() => ({ tree: App.game.evade.treeLanding, injury: LandingWater.view(App.game).injury, canopy: App.game.landingCanopy, emptyMesh: !!App.rend.meshes.chuteEmpty, blocked: App.game._localSolidAt(App.game.evade.p[0], App.game.evade.p[2], .43) }));
      assert.equal(cutState.tree.cutAway, true); assert.ok(cutState.canopy && cutState.emptyMesh); assert.equal(cutState.blocked, false); assert.ok(cutState.injury && cutState.injury.factor >= .6);
      await isolateGround();
      await page.waitForFunction(() => JungleScenery.ready(App.rend) && WildlifeRender.ready(App.rend), null, { polling: 50 });
      await page.evaluate(() => { App.game.render(0); App.game.syncControls(); });
      await shot('cutaway-ground'); record('Keyboard or held touch knife action releases into gravity, a clear landing and bounded injury', { cut, ground, cutState });

      // Let the other descent finish, then use the real Call crewmate control.
      // A separately landed aviator can be outside visual search distance.
      // Neither the call nor the walk assigns reunion, knowledge or position.
      const crewDescent = await page.evaluate(() => {
        const g = App.game; let steps = 0;
        while (AviatorCompanion.view(g).chute && steps++ < 3000) g.update(1 / 60);
        g.render(0);g.syncControls();return {steps,initial:AviatorCompanion.view(g)};
      });
      await click(page.locator('[data-companion-line]'));
      await click(page.locator('[data-companion="call"]'));
      await click(page.locator('[data-companion="hide"]'));
      const reunion = await page.evaluate(crewDescent => {
        const g = App.game, e = g.evade, called=AviatorCompanion.view(g);
        for (let i = 0; i < 2400 && !AviatorCompanion.view(g).reunited; i++) {
          const n = AviatorCompanion.actors(g)[0]; if (!n) break;
          const yaw = Math.atan2(n.p[0] - e.p[0], -(n.p[2] - e.p[2]));
          for (const turn of [0, .65, -.65, 1.2, -1.2]) {
            const angle = yaw + turn, p = g._moveOnFoot(e.p[0], e.p[2], Math.sin(angle) * .1, -Math.cos(angle) * .1, .43, e);
            if (Math.hypot(p[0] - e.p[0], p[1] - e.p[2]) > .025) { e.hdg = angle; break; }
          }
          App.keys.KeyW = 1; g.update(1 / 60); App.keys.KeyW = 0;
        }
        g.render(0); g.syncControls(); return { initial:crewDescent.initial, descentSteps:crewDescent.steps, called, after: AviatorCompanion.view(g), p: e.p.slice(), gl: App.rend.gl.getError() };
      },crewDescent);
      assert.equal(reunion.after.reunited, true); assert.ok(reunion.after.distance < 7); assert.equal(reunion.gl, 0);
      await click(page.locator('[data-companion-line]')); await click(page.locator('[data-companion="wait"]'));
      const waiting = await tick(2); const waitP = waiting.companion.actors[0].p;
      const still = await tick(2); assert.deepEqual(still.companion.actors[0].p, waitP); assert.equal(still.companion.order, 'wait');
      const collisionBefore = await page.evaluate(() => {
        const g = App.game, e = g.evade, original = AviatorCompanion.snapshot(g), probe = { ...e, _companionMoving: true };
        g.render(0);const obstaclesBefore=JungleScenery.obstacles(g);let target, heading,rejectedAfterRender=0;
        for (let i = 0; i < 32 && !target; i++) {
          const a = i * Math.PI / 16; let clear = true;
          for (let d = .1; d <= 3.5 && clear; d += .1) clear = !g._blockedAt(e.p[0] + Math.sin(a) * d, e.p[2] - Math.cos(a) * d, .46, probe);
          if(clear){
            const x=e.p[0]+Math.sin(a)*3,z=e.p[2]-Math.cos(a)*3,candidate=[x,terrainH(x,z),z],s=JSON.parse(JSON.stringify(original));s.actor.p=candidate;s.actor.goal=candidate.slice();
            if(!AviatorCompanion.restore(g,s))throw Error('Cannot set declared collision body fixture');
            g.render(0);
            // Rendering can establish more real jungle trunks. Check the
            // actual submitted colliders before committing this fixture.
            for(let d=.1;d<=3.5&&clear;d+=.1)clear=!g._blockedAt(e.p[0]+Math.sin(a)*d,e.p[2]-Math.cos(a)*d,.46,probe);
            if(clear){heading=a;target=candidate;}else rejectedAfterRender++;
          }
        }
        if (!target) throw Error('No actual clear three-metre collision-test corridor');
        // Reunion and Wait above were physically earned. Only this isolated
        // contact fixture repositions the same waiting body; no success,
        // injury, pace, collision or extraction state is created by the test.
        e.hdg = heading; return { player: e.p.slice(), crew: target, originalCrew: original.actor.p,heading,rejectedAfterRender,obstaclesBefore,obstaclesAfter:JungleScenery.obstacles(g), scope: 'Only waiting crewmate starting feet repositioned onto a three-metre corridor verified against actual colliders after rendering, after real reunion. Native movement stops after the original solver actually rejects a companion-body step; actor state, collisions and injury remain authoritative.' };
      });
      const contact=await forward(6,false,1,false,{companionContact:true});assert.ok(contact.contact.queries>0,'Original swept movement must actually encounter the crewmate collider');
      const crewCollision = await page.evaluate(() => { const g = App.game, n = AviatorCompanion.actors(g)[0]; return { player: g.evade.p.slice(), crew: n.p.slice(), distance: Math.hypot(n.p[0] - g.evade.p[0], n.p[2] - g.evade.p[2]) }; });
      assert.deepEqual(crewCollision.crew, collisionBefore.crew); assert.ok(crewCollision.distance >= .75 && crewCollision.distance < 1.3);
      assert.ok(Math.hypot(crewCollision.player[0] - collisionBefore.player[0], crewCollision.player[2] - collisionBefore.player[2]) > .5);
      await click(page.locator('[data-companion="hide"]')); await forward(3, false, -1); await shot('crew-reunion');
      await click(page.locator('[data-companion-line]'));
      await click(page.locator('[data-companion="follow"]')); const follow = await tick(2); assert.equal(follow.companion.order, 'follow');
      await click(page.locator('[data-companion="hide"]')); assert.equal(await page.locator('[data-companion-actions]').isVisible(), false);
      record('Physical second descent reaches genuine reunion; Follow/Wait/Hide operate and native walking stops at the companion collider', { reunion, waiting: waiting.companion, collisionBefore,contact, crewCollision, following: follow.companion });

      // Authentic radio authentication, elapsed rescue time, smoke, the full
      // HH-3 run-in and the existing cable dwell all remain authoritative.
      // The surrounding patrol roster is isolated for this extraction test.
      await click(page.locator('[data-companion-line]')); await click(page.locator('[data-companion="wait"]')); await click(page.locator('[data-companion="hide"]'));
      await page.evaluate(() => {
        const g = App.game, original = g.rescued;
        window.__survivalRescue = null;
        g.rescued = function () {
          const s = AviatorCompanion.snapshot(this), J = this.evade?.jolly;
          window.__survivalRescue = { before: s, J: J && { p: J.p.slice(), down: J.down, hoist: J.hoist }, player: this.evade?.p.slice(), lift: this.evade?.lift };
          return original.apply(this, arguments);
        };
      });
      if (options.hasTouch) {
        for (let i = 0; i < 3; i++) { await click(page.locator('#btnRadio')); await tick(1.3, false); }
      } else { await page.keyboard.down('r'); await tick(2.7, false); await page.keyboard.up('r'); }
      const authenticated = await page.evaluate(() => ({ radio: App.game.evade.radio, eta: App.game.evade.eta, rescue: App.game.evade.rescue }));
      assert.equal(authenticated.radio, 1);
      await tick(authenticated.eta * .57, false);
      if (options.hasTouch) await click(page.locator('#btnSmoke')); else await page.keyboard.down('g');
      await tick(.1, false); if (!options.hasTouch) await page.keyboard.up('g');
      const signal = await page.evaluate(() => {
        const g = App.game, e = g.evade, result = { smoke: e.smoke?.slice(), enemiesGenerated: e.searchers.length, p: e.p.slice() };
        e.searchers = []; e.locals = [];
        let heading;
        for (let i = 0; i < 32 && heading === undefined; i++) {
          const a = i * Math.PI / 16; let clear = true;
          for (let d = .25; d < 15 && clear; d += .25) clear = !g._blockedAt(e.p[0] + Math.sin(a) * d, e.p[2] - Math.cos(a) * d, .43, e);
          if (clear) heading = a;
        }
        if (heading === undefined) throw Error('No collision-free actual clearing for waiting off the rescue cable');
        e.hdg = heading; return { ...result, awayHeading: heading };
      });
      assert.ok(signal.smoke);
      const offCable = await forward(30, false, 1, false, { p: signal.p, distance: 11 });
      assert.ok(Math.hypot(offCable.p[0] - signal.p[0], offCable.p[2] - signal.p[2]) > 10);
      const firstBoarding = await page.evaluate(() => {
        const g = App.game; let steps = 0;
        while (g.phase === 'evade' && !g.result && AviatorCompanion.snapshot(g).cableTime < 3.5 && steps++ < 16000) g.update(1 / 60);
        const crew = AviatorCompanion.snapshot(g), e = g.evade, J = e?.jolly;
        if (!e || !J) throw Error('The player boarded before the waiting crewmate');
        const distance = Math.hypot(J.p[0] - e.p[0], J.p[2] - e.p[2]);
        e.hdg = Math.atan2(J.p[0] - e.p[0], -(J.p[2] - e.p[2]));
        g.render(0); return { steps, crew, distance, J: { p: J.p.slice(), down: J.down, hoist: J.hoist } };
      });
      assert.ok(firstBoarding.crew.cableTime >= 3.4); assert.ok(firstBoarding.distance >= 9);
      await forward(Math.max(8, (firstBoarding.distance - 8) / 1.2 + 4.2));
      const recovery = await page.evaluate(() => {
        const g = App.game; let steps = 0;
        while (g.phase === 'evade' && !g.result && steps++ < 600) g.update(1 / 60);
        g.render(0); g.syncControls(); return { steps, rescued: g.rescuedOK, companionRescued: g.companionRescued, observed: window.__survivalRescue, phase: g.phase, gl: App.rend.gl.getError() };
      });
      assert.equal(recovery.rescued, true); assert.ok(recovery.observed.lift > 3.4); assert.equal(recovery.gl, 0);
      const c = recovery.observed.before, J = recovery.observed.J;
      const eligible = !!(c.reunited && !c.chute && !['captured', 'rescued'].includes(c.mode) && J.down && J.hoist > .7 && Math.hypot(c.actor.p[0] - J.p[0], c.actor.p[2] - J.p[2]) < 9 && c.cableTime >= 3.4 - 1e-8);
      assert.equal(recovery.companionRescued, eligible);
      assert.equal(recovery.companionRescued, true);
      record('Radio, smoke and the full helicopter run-in allow both real crewmen to board through physical cable proximity and dwell', { authenticated, signal, offCable, firstBoarding, recovery, isolated: 'Patrol roster cleared for the extraction fixture after its real signal-triggered spawn. A native Wait order lets the other aviator reach the cable first while the player walks clear, then returns. No health, rescue timer, cable progress or success flags assigned.' });
      }

      if (section !== 'river') {
      // Ocean start is a separate declared positioned-aircraft fixture. The
      // original command handle and complete canopy path choose water entry.
      await page.evaluate(() => App.start(MISSIONS.find(m => m.id === 'm1')));
      await page.waitForFunction(() => App.game?.mis?.id === 'm1' && !App.game.evade && document.getElementById('loader').style.display === 'none', null, { polling: 50, timeout: 20000 });
      const oceanFixture = await page.evaluate(() => {
        const g = App.game, z = 0, x = coastAt(z) + 1800;
        g.ac.p = [x, 85, z]; g.ac.v = [0, 0, 0]; g.ac.onDeck = false; g.phase = 'airborne';
        g.render(0); g.syncControls(); return { aircraft: g.ac.p.slice(), terrain: terrainH(x, z), scope: 'Only aircraft starting position/velocity selected above actual open ocean. Ordinary mission, natural roster, first-contact policy, radio and rescue remain active; no practice flag or actor isolation.' };
      });
      await eject();
      const oceanLanding = await page.evaluate(() => { const g = App.game; let n = 0; while (g.phase === 'chute' && n++ < 3000) g.update(1 / 60); g.render(0); return { n, phase: g.phase, landing: LandingWater.view(g), p: g.evade?.p.slice(), gl: App.rend.gl.getError() }; });
      assert.equal(oceanLanding.phase, 'evade'); assert.equal(oceanLanding.landing.swimming, true); assert.equal(oceanLanding.gl, 0);
      await tick(20, false);
      const naturalEntry = await page.evaluate(() => {
        const g = App.game, e = g.evade;
        return { practice: !!(g.mis.wildlifePractice || e.wildlifePractice), held: !!e.held, contactOverlay: document.getElementById('captVeil').classList.contains('on'), spawn: e.spawn, localRefill: e.localRefill, rounds: e.rounds, roster: e.searchers.concat(e.locals || []).map(a => ({ kind: a.kind, p: a.p.slice(), height: terrainH(a.p[0], a.p[2]) })) };
      });
      assert.equal(naturalEntry.practice, false); assert.equal(naturalEntry.held, false); assert.equal(naturalEntry.contactOverlay, false); assert.ok(naturalEntry.spawn < 6 && naturalEntry.localRefill < 5); assert.equal(naturalEntry.roster.length, 0);
      await tick(5, false);
      const oceanCrew = await page.evaluate(() => {
        const g = App.game, R = g.rend, draw = R.drawSprites, calls = [];
        R.drawSprites = function (texture, list, ...rest) { for (const q of list) if (q.owner?.companion) calls.push({ pose: q.photoPose, swimming: q.owner.swimming, asset: q.photoAsset, h: q.h }); return draw.call(this, texture, list, ...rest); };
        try { g.render(0); } finally { R.drawSprites = draw; }
        return { companion: AviatorCompanion.view(g), calls, gl: R.gl.getError() };
      });
      assert.equal(oceanCrew.companion.chute, null); assert.ok(oceanCrew.calls.length); assert.equal(oceanCrew.gl, 0);
      for (const q of oceanCrew.calls) { assert.equal(q.pose, 'swim'); assert.equal(q.swimming, true); assert.ok(q.h < 1); }
      record('The other actual ocean descent settles into a photographic aviator swimming body at the water surface', oceanCrew);
      await page.evaluate(() => {
        App.set.sound = 1; const audio = App.audio, old = audio.footfall; audio.resume(); audio.master.gain.value = .55;
        window.__survivalSounds = []; window.__survivalAudioNodes = 0;
        const source = audio.ctx.createBufferSource; audio.ctx.createBufferSource = function () { window.__survivalAudioNodes++; return source.apply(this, arguments); };
        audio.footfall = function (wet, fast) { const before = window.__survivalAudioNodes, result = old.apply(this, arguments); window.__survivalSounds.push({ wet, fast, audioState: this.ctx.state, gain: this.master.gain.value, createdSources: window.__survivalAudioNodes - before }); return result; };
      });
      await page.waitForFunction(() => App.audio.ctx?.state === 'running', null, { polling: 50, timeout: 10000 });
      const beforeSwim = await page.evaluate(() => App.game.evade.p.slice());
      const moved = await forward(3);
      await page.evaluate(() => {
        const g = App.game, R = g.rend, scale = R.quality === 0 ? .72 : R.quality === 1 ? .88 : 1;
        // The normal camera runs at render frequency. After fast-forwarding
        // simulation, give the real adapter twelve60Hz rendered updates at a
        // declared640x360 warmup size, then restore the native capture size.
        R.resize(640 / scale, 360 / scale, 1);
        for (let i = 0; i < 12; i++) { g.update(1 / 60); g.render(1 / 60); }
        App.resize(); g.render(0);
      });
      const swim = await page.evaluate(before => {
        const g = App.game, e = g.evade, w = LandingWater.surface(g, e.p[0], e.p[2]), expected = LandingWater.camera(g, [e.p[0], 1.68, e.p[2]]);
        // Sum of the four production wave derivatives divided by camera's
        // rate8, plus residual warmup and .025m authored head bob. This is a
        // physics bound, rather than treating an eased camera as an exact wave.
        const lagBound = (1.758 / 8 + .08) * Math.abs(g.atm.wave) + .03;
        const result = { p: e.p.slice(), distance: Math.hypot(e.p[0] - before[0], e.p[2] - before[2]), running: e.running, moving: e.moving, eye: g.rend.eye.slice(), expectedCamera: expected, waterY: w, targetAboveWater: .38, lagBound, cue: g.nextCue(g.ac, g.world), equipmentDisplay: document.getElementById('weaponViewport').style.display, equipmentMotion: EquipmentView.inspect(g), sounds: window.__survivalSounds.slice(), view: LandingWater.view(g) };
        window.__survivalCameraDiagnostic = result; return result;
      }, beforeSwim);
      assert.ok(swim.distance > 1.8 && swim.distance <= 3.05); assert.equal(swim.running, false); assert.ok(swim.sounds.length >= 2 && swim.sounds.every(s => s.wet));
      assert.ok(Math.abs(swim.eye[1] - swim.expectedCamera[1]) < 1e-7, 'Actual native renderer uses the production water-camera adapter');
      assert.ok(Math.abs(swim.eye[1] - swim.waterY - .38) <= swim.lagBound, 'Low swimming eye follows the real waves within its derived easing bound');
      assert.ok(swim.eye[1] - swim.waterY > .1 && swim.eye[1] - swim.waterY < .75, 'Swimming never uses the original1.68m standing eye');
      for (const sound of swim.sounds) { assert.equal(sound.audioState, 'running'); assert.ok(sound.gain > .1); assert.equal(sound.createdSources, 2); }
      assert.equal(swim.equipmentDisplay, 'none'); assert.equal(swim.equipmentMotion, null);
      assert.match(swim.cue, /SWIMS/); assert.doesNotMatch(swim.cue, /WALKS|SHIFT RUNS/);
      const idleSounds = swim.sounds.length; await tick(2); assert.equal(await page.evaluate(() => window.__survivalSounds.length), idleSounds);
      await shot('ocean-swimming');
      if (options.hasTouch) { for (let i = 0; i < 3; i++) { await click(page.locator('#btnRadio')); await tick(1.3, false); } }
      else { await page.keyboard.down('r'); await tick(2.7, false); await page.keyboard.up('r'); }
      const naturalRadio = await page.evaluate(() => ({ radio: App.game.evade.radio, eta: App.game.evade.eta })); assert.equal(naturalRadio.radio, 1);
      await tick(naturalRadio.eta * .57, false); await page.evaluate(() => App.game.syncControls());
      if (options.hasTouch) await click(page.locator('#btnSmoke')); else await page.keyboard.down('g');
      await tick(.1, false); if (!options.hasTouch) await page.keyboard.up('g');
      const naturalSmoke = await page.evaluate(() => { const g = App.game, e = g.evade; return { practice: !!(g.mis.wildlifePractice || e.wildlifePractice), smoke: e.smoke?.slice(), radio: e.radio, rescue: e.rescue, eta: e.eta, rounds: e.rounds, roster: e.searchers.concat(e.locals || []).map(a => ({ kind: a.kind, p: a.p.slice(), height: terrainH(a.p[0], a.p[2]) })) }; });
      assert.equal(naturalSmoke.practice, false); assert.ok(naturalSmoke.smoke); assert.equal(naturalSmoke.radio, 1); assert.equal(naturalSmoke.roster.length, 0); assert.equal(naturalSmoke.rounds, naturalEntry.rounds);
      record('Ordinary ocean survival uses swimming, splash audio and real radio/smoke without spawning terrestrial people at sea', { fixture: oceanFixture, oceanLanding, naturalEntry, moved, swim, naturalRadio, naturalSmoke });

      const shoreFixture = await page.evaluate(() => {
        const g = App.game, e = g.evade, z = e.p[2]; let lo = coastAt(z) - 1000, hi = coastAt(z) + 1000;
        for (let i = 0; i < 45; i++) { const x = (lo + hi) / 2; if (terrainH(x, z) > -.6) lo = x; else hi = x; }
        e.p = [hi + .9, 0, z]; e.hdg = -Math.PI / 2; e.crouch = false; g.camSm = null; LandingWater.enterGround(g); g.render(0);
        return { p: e.p.slice(), terrain: terrainH(e.p[0], e.p[2]), swimming: LandingWater.swimming(g), scope: 'Explicit near-shore feet fixture on original terrain. Subsequent water-to-land crossing uses unchanged controls, collision and hysteresis.' };
      });
      assert.equal(shoreFixture.swimming, true); assert.ok(shoreFixture.terrain < -.4);
      const ashore = await forward(180, false, 1, true); assert.equal(ashore.landing.swimming, false); assert.ok(ashore.p[0] < shoreFixture.p[0] - 1.5);
      await tick(1); await shot('shore-exit'); record('Native movement physically crosses the original shoreline and restores land movement/camera', { fixture: shoreFixture, ashore });
      }

      await page.evaluate(() => { App.set.sound = 0; App.startPOW(null, 'river'); });
      await page.waitForFunction(() => App.game && document.getElementById('loader').style.display === 'none', null, { polling: 50, timeout: 20000 });
      await page.evaluate(() => window.__survivalOriginalFrame.call(App, performance.now()));
      await page.waitForFunction(() => App.game?.pow?.stage === 'river', null, { polling: 50, timeout: 10000 });
      await page.evaluate(() => { const g = App.game; if (POW.Guidance) POW.Guidance.skip(g); g.evade.searchers = []; g.pow.actors = g.evade.searchers; g.evade.hdg = Math.PI / 2; g.render(0); g.syncControls(); });
      await tick(.1); await interact(.25); await tick(.05);
      assert.equal(await page.evaluate(() => App.game.pow.river.mode), 'swim');
      const riverBefore = await page.evaluate(() => ({ p: App.game.evade.p.slice(), center: App.game.pow.base[0] + 94, mode: App.game.pow.river.mode }));
      const bank = await forward(22); const bankView = await page.evaluate(() => ({ p: App.game.evade.p.slice(), mode: App.game.pow.river.mode, waterY: App.game.pow.river.waterY }));
      assert.equal(bankView.mode, 'bank'); assert.ok(Math.abs(bankView.p[0] - riverBefore.center) >= 14.5);
      await page.evaluate(() => { App.game.evade.hdg = -Math.PI / 2; });
      const reenter = await forward(12); const riverAfter = await page.evaluate(() => ({ p: App.game.evade.p.slice(), mode: App.game.pow.river.mode, waterY: App.game.pow.river.waterY }));
      assert.ok(['float', 'swim'].includes(riverAfter.mode)); assert.ok(Math.abs(riverAfter.p[0] - riverBefore.center) < 14.5);
      await shot('river-bank-reentry'); record('Original Red River chapter supports physical bank exit and water reentry using normal controls', { before: riverBefore, bank, bankView, reenter, riverAfter });

      const pursuitFixture = await page.evaluate(async () => {
        const g = App.game, e = g.evade, s = g.pow, r = s.river, x = s.base[0] + 94;
        await PhotoCutouts.prepareMotion(g.rend, 'nva', 'swim'); await PhotoCutouts.prepareMotion(g.rend, 'militia', 'swim');
        let z;
        for (let dz = -15; dz < 45 && z === undefined; dz += 3) {
          const q = e.p[2] + dz;
          if (![x, x - 15.5, x + 15.5].some(xx => POW.blocked(g, xx, q, .35, r.waterY + .35))) z = q;
        }
        if (z === undefined) throw Error('No actual solid-free river entry fixture');
        e.p = [x, r.waterY - .42, z]; e.hdg = Math.PI; r.mode = 'swim';
        e.searchers = [-1, 1].map((side, i) => {
          const a = POW.AI.makeActor({ id: 'swim-entry-' + i, kind: i ? 'militia' : 'nva', p: [x + side * 15.5, r.waterY + .35, z + (i ? 2 : -2)] });
          Object.assign(a, { state: 'pursuit', visible: true, seen: 1.3, sus: 1.3, lastSight: s.aiClock, lastKnown: e.p.slice(), face: Math.atan2(e.p[0] - a.p[0], -(e.p[2] - a.p[2])) });
          return a;
        }); s.actors = e.searchers; s.p = e.p;
        g.render(0); return { player: e.p.slice(), actors: e.searchers.map(a => ({ id: a.id, kind: a.kind, p: a.p.slice() })), scope: 'Positioned initial alerted-patrol encounter on genuine riverbanks; native AI, warnings, entry lunge, collision, swimming and contact remain authoritative.' };
      });
      const enter = await tick(3.3);
      const swimmingPursuers = await page.evaluate(() => {
        const g = App.game, R = g.rend, calls = [], draw = R.drawSprites;
        R.drawSprites = function (texture, list, ...rest) { for (const q of list) if (q.owner?.swimming) calls.push({ kind: q.owner.kind, pose: q.photoPose, asset: q.photoAsset, frame: q.photoFrame, h: q.h, p: q.p.slice() }); return draw.call(this, texture, list, ...rest); };
        try { g.render(0); } finally { R.drawSprites = draw; }
        return { actors: g.evade.searchers.map(a => ({ id: a.id, kind: a.kind, p: a.p.slice(), swimming: a.swimming, phase: a.swimPhase, spd: a.spd, pursuit: a.riverPursuit })), waterY: g.pow.river.waterY, calls, gl: R.gl.getError() };
      });
      assert.equal(swimmingPursuers.actors.filter(a => a.swimming).length, 2); assert.equal(swimmingPursuers.gl, 0);
      assert.equal(new Set(swimmingPursuers.calls.map(a => a.kind)).size, 2);
      for (const a of swimmingPursuers.actors) { assert.ok(a.spd <= 1.36); assert.ok(a.p[1] > swimmingPursuers.waterY - .46 && a.p[1] < swimmingPursuers.waterY - .38); }
      for (const q of swimmingPursuers.calls) { assert.equal(q.pose, 'swim'); assert.ok(q.h < 1.0); }
      await shot('river-pursuers'); record('Two alerted NVA/VC physically enter the river and render complete horizontal swimming photographs', { fixture: pursuitFixture, enter, swimmingPursuers });

      if (!options.hasTouch) {
        const preview = await page.evaluate(() => {
          const g = App.game, R = g.rend, frames = [], camera = R.setCamera;
          const scale = R.quality === 0 ? .72 : R.quality === 1 ? .88 : 1;
          R.resize(640 / scale, 360 / scale, 1);
          // A declared three-metre inspection camera follows an actual native
          // pursuer; player, actor trajectories, AI, water and pose phases stay
          // unchanged. Native first-person stills above retain normal quality.
          R.setCamera = function (eye, fwd, up, fov, near, far, asp) {
            const n = g.evade.searchers[0], y = g.pow.river.waterY;
            const p = [n.p[0] + 2.8, y + 1.0, n.p[2] + 1.1], target = [n.p[0], y - .05, n.p[2]];
            return camera.call(this, p, vsub(target, p), [0, 1, 0], 50, .12, far, asp);
          };
          try {
            for (let i = 0; i < 25; i++) {
              for (let j = 0; j < 5; j++) g.update(.016);
              g.render(0);
              frames.push({ seconds: (i + 1) * .08, p: g.evade.searchers[0].p.slice(), phase: g.evade.searchers[0].swimPhase, png: R.canvas.toDataURL('image/png'), gl: R.gl.getError() });
            }
          } finally { R.setCamera = camera; App.resize(); g.render(0); }
          return { width: 640, height: 360, frames };
        });
        for (let i = 0; i < preview.frames.length; i++) {
          const frame = preview.frames[i], file = name + '-river-stroke-' + String(i).padStart(3, '0') + '.png';
          assert.equal(frame.gl, 0); await fs.writeFile(path.join(out, file), Buffer.from(frame.png.split(',')[1], 'base64')); delete frame.png; frame.file = file;
        }
        const video = name + '-native-river-stroke.mp4';
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '12.5', '-i', path.join(out, name + '-river-stroke-%03d.png'), '-r', '25', '-c:v', 'libx264', '-threads', '2', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, video)], { stdio: 'pipe' });
        videos.push({ file: 'landing-survival/' + video, ...preview, scope: 'Two simulated seconds of original native pursuer movement/water with a declared3m inspection camera and640x360 capture.25 original renders at .08s intervals, encoded at25FPS without invented pose pixels. This is not measured hardware frame rate or the native player camera.' });
      }

      const gpuSwim = await page.evaluate(auditSwimGPU);
      assert.equal(gpuSwim.poses, 24);
      record('All24 complete NVA, VC and aviator stroke photographs survive real GPU upload, mipmaps, alpha and bounded caches', gpuSwim);

      await Promise.all(jobs); assert.deepEqual(errors, []); assert.deepEqual(missing, []);
      assert.equal(new Set(hashes.map(h => h.file)).size, 10, 'All ten executed survival/equipment/photo/POW modules are bound to HTTP response digests');
      const finalGL = await page.evaluate(() => App.rend.gl.getError()); assert.equal(finalGL, 0);
      record('Integrated survival modules execute with no JavaScript, asset HTTP or WebGL errors', { hashes, errors, missing, gl: finalGL });
    } catch (error) {
      const diagnostic = await page.evaluate(() => {
        const a = window.App, g = a?.game;
        return { screen: a?.screen, phase: g?.phase, paused: g?.paused, result: g?.result, player: g?.evade?.p, camera: window.__survivalCameraDiagnostic, chute: g?.chute && { p: g.chute.p, open: g.chute.open, landing: g.chute.landing }, landing: window.LandingWater && g && LandingWater.view(g), companion: window.AviatorCompanion && g && AviatorCompanion.view(g), pow: g?.pow && { stage: g.pow.stage, river: g.pow.river, input: g.pow.input }, photos: a?.rend && window.PhotoCutouts && PhotoCutouts.inspect(a.rend), bodyClass: document.body.className, loader: document.getElementById('loader')?.style.display };
      }).catch(() => null);
      await fs.writeFile(path.join(out, name + '-failure.json'), JSON.stringify({ message: String(error.message || error), errors, missing, checks, diagnostic }, null, 2) + '\n');
      await page.screenshot({ path: path.join(out, name + '-failure.png'), timeout: 30000 }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  assert.ok(checks.length > 0, 'No matching survival profile');
  assert.equal(checks.length, profiles.length * (section === 'all' ? 14 : section === 'ocean' ? 8 : 5), 'Every requested profile completes all checks in its declared section');
  const repo = path.resolve(__dirname, '..'), currentIndex = createHash('sha256').update(await fs.readFile(path.join(repo, 'index.html'))).digest('hex');
  for (const source of sourceHashes) assert.equal(source.indexSHA256, currentIndex, 'The actual executed HTML must still match the tested final source');
  for (const check of checks) for (const source of check.actual?.hashes || []) {
    const current = createHash('sha256').update(await fs.readFile(path.join(repo, source.file.replace(/^\//, '')))).digest('hex');
    assert.equal(source.sha256, current, 'The actual executed module changed during verification: ' + source.file);
  }
  return { suite: 'landing-survival', passed: true, sourceStable: true, section, fullCoverage: section === 'all' && profiles.length === 2, checks, screenshots, videos, sourceHashes, scope: 'Production Chromium WebGL2 at normal High desktop / Medium phone-layout quality. Native keyboard and CDP touch controls. Positioned-aircraft, near-shore and isolated-encounter fixtures are explicitly labeled. Original ejection, descent, tree contact, cutaway, injury, swimming and bank physics remain authoritative. The section field identifies explicit debugging subsets; only fullCoverage true means all28 checks/bothprofiles. This is not physical iPhone Safari, hardware frame-rate evidence or a complete mission run.' };
};

if (require.main === module) (async () => {
  const { chromium } = require('playwright'), { createServer } = require('../tools/dev-server.cjs');
  const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const out = process.argv[2] || 'test-results/landing-survival'; await fs.mkdir(out, { recursive: true });
    const result = await module.exports(browser, 'http://127.0.0.1:' + server.address().port + '/', out);
    await fs.writeFile(path.join(out, 'landing-survival.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ passed: result.passed, checks: result.checks.length, screenshots: result.screenshots.length }));
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
