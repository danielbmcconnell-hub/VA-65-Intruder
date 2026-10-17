'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Genuine production physics with a deterministic controller pilot. Only the
// automatic RAF clock is suspended; Game.update, aircraft forces, enemy AI,
// projectiles, collisions, mission conditions and WebGL rendering stay real.
// The successful sortie must never set position, phase, enemy or result.
module.exports = async function willardBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'willard'); await fs.mkdir(out, { recursive: true });
  const results = [], screenshots = [];
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 } },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ].filter(p => !process.env.INTRUDER_WILLARD_PROFILE || p.name === process.env.INTRUDER_WILLARD_PROFILE);
  for (const profile of profiles) {
    const { name, ...options } = profile, context = await browser.newContext(options), page = await context.newPage();
    const errors = [], missing = [], runtimeSHA256 = {}, digestTasks = [], cdp = profile.hasTouch ? await context.newCDPSession(page) : null;
    const click = locator => profile.hasTouch ? locator.tap() : locator.click();
    page.setDefaultTimeout(90000); page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && /\/assets\//.test(r.url())) missing.push({ url: r.url(), status: r.status() }); });
    page.on('response',r=>{const file=new URL(r.url()).pathname;if(r.ok()&&/\/assets\/(?:willard\/.*\.(?:js|css|json)|flight\/sortie-checkpoint\.js)$/.test(file))digestTasks.push(r.body().then(bytes=>{runtimeSHA256[file]=createHash('sha256').update(bytes).digest('hex');}));});
    await context.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, assist: 1, sound: 0, voices: 0, invert: 0, sens: 1, mouse: 0, seat: 0 }));
      localStorage.setItem('a6_sawkeys', '1');
      // Uniform repeatable randomness keeps original crew-hit probabilities,
      // FX and AI variation reproducible; no favorable random value is forced.
      let randomSeed=0x196665;Math.random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => window.__willardFixedClock ? 0 : raf(t => { if (!window.__willardFixedClock) cb(t); });
    });
    const record = (title, actual, fixture) => { results.push({ profile: name, name: title, passed: true, actual, fixture }); console.log('PASS Willard ' + name + ' ' + title); };
    const shot = async key => {
      const file = name + '-' + key + '.png';
      assert.equal(await page.evaluate(() => App.rend.gl.getError()), 0);
      await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('willard/' + file);
    };
    const state = () => page.evaluate(() => {
      const g = App.game; return { mission: g.mis.id, time: g.t, paused: g.paused, phase: g.phase,
        aircraft: { p: g.ac.p.slice(), v: g.ac.v.slice(), yaw: g.ac.yaw, pitch: g.ac.pitch, roll: g.ac.roll, alive: g.ac.alive, crew: { ...g.ac.crew }, damage: { ...g.ac.dmg }, hits: g.ac.hits },
        willard: WillardMission.snapshot(g), result: g.result, worldScore: { ...g.world.score }, gl: g.rend.gl.getError() };
    });
    const loaded = async () => {
      await page.waitForFunction(() => App.game?.mis?.willard && App.game.willard && document.getElementById('loader').style.display === 'none',null,{polling:50});
      await page.evaluate(() => { window.__willardFixedClock = true; App.game.paused = false; for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on'); for (const key of Object.keys(App.keys)) App.keys[key] = 0; for (const key of ['pitch','roll','thrUp','thrDn','commit']) App.gctl[key] = 0; });
      await page.waitForTimeout(30); // Drain the callback scheduled before clock suspension.
      await page.evaluate(() => { App.game.render(1 / 60); App.game.syncControls(); });
    };
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
      const sourceSHA256 = createHash('sha256').update(await response.body()).digest('hex');
      await page.waitForFunction(() => window.App && window.WillardMission); await click(page.locator('#bootGo'));
      const card = page.locator('#readyBody .mcard').filter({ hasText: /WILLARD EGRESS/i }); assert.equal(await card.count(), 1);
      assert.equal(await page.locator('#readyBody .mcard').count(), 12);
      await click(card);
      assert.match(await page.locator('#briefBody').innerText(), /1966/);
      assert.match(await page.locator('#briefBody').innerText(), /unconfirmed|unidentified|reconstruction/i);
      // Date.now supplies only the mission's initial PRNG seed here. Restore
      // it before flight; Game.t, world clocks and projectile time stay real.
      await page.evaluate(()=>{window.__willardFixedClock=true;window.__willardDateNow=Date.now;Date.now=()=>1966;});
      await click(page.locator('#briefBody').getByRole('button', { name: /PLAY MISSION/i })); await loaded();
      await page.evaluate(()=>{Date.now=window.__willardDateNow;delete window.__willardDateNow;});
      await Promise.all(digestTasks);
      const initial = await state(); assert.equal(initial.aircraft.alive, true); assert.equal(initial.phase, 'airborne');
      assert.equal(await page.evaluate(() => App.game.rightSeat), false, 'The combat sortie must permit direct player piloting.');
      assert.equal(initial.gl, 0); await shot('night-strike-start');
      record('Normal mission selector and PLAY MISSION launch the integrated nighttime sortie', { sourceSHA256, runtimeSHA256:{...runtimeSHA256}, initial, seedFixture:{mission:1966,uniformRandom:0x196665} }, 'Native mouse or touch mission controls; fresh pilot-seat settings. Original custom WebGL2 engine. Uniform seeded Math.random retains original damage probabilities. Date.now is briefly seeded only during native mission construction, then restored before flight. No mission start, aircraft placement or phase setter is used.');

      const controls = await page.evaluate(() => {
        const ids = ['willardRear', 'willardCamera', 'willardRetry', 'willardPause'];
        const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
        const controls = ids.map(rect), existing = ['stick', 'thrUp', 'thrDn', 'pickle'].map(rect).filter(r => r.width && r.height);
        return { controls, existing, collisions: controls.flatMap(a => existing.filter(b => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y).map(b => [a.id, b.id])) };
      });
      assert.ok(controls.controls.every(b => b.width >= 44 && b.height >= 44)); assert.deepEqual(controls.collisions, []);
      await click(page.locator('#willardRear')); assert.equal(await page.evaluate(() => App.game.willard.rear), true);
      assert.equal(await page.locator('#legend.on').count(), 0, 'Rear view must not open the legacy H controls overlay.');
      await shot('player-rear-view'); await click(page.locator('#willardRear')); assert.equal(await page.evaluate(() => App.game.willard.rear), false);
      const external = await page.evaluate(() => App.game.extView); await click(page.locator('#willardCamera')); assert.equal(await page.evaluate(() => App.game.extView), !external);
      await click(page.locator('#willardCamera')); assert.equal(await page.evaluate(() => App.game.extView), external);
      record('Native rear and camera controls operate without obscuring existing touch flight controls', controls, profile.hasTouch ? 'Actual CDP-backed Playwright touch taps on the supplied 844×390 landscape layout. This is Chromium emulation, not physical Safari.' : 'Actual native mouse clicks; rear view does not open a keyboard-help overlay.');

      await click(page.locator('#willardPause')); assert.equal(await page.evaluate(() => App.game.paused), true);
      const pausedBefore = await state(); await page.evaluate(() => { for (let n = 0; n < 120; n++) App.game.update(1 / 60); }); const pausedAfter = await state();
      assert.equal(pausedAfter.time, pausedBefore.time); assert.deepEqual(pausedAfter.aircraft.p, pausedBefore.aircraft.p); assert.deepEqual(pausedAfter.willard, pausedBefore.willard);
      await click(page.locator('#pauseBody').getByRole('button', { name: 'Resume', exact: true })); assert.equal(await page.evaluate(() => App.game.paused), false);
      record('Pause freezes original aircraft, interceptor and mission clocks until native Resume', { time: pausedAfter.time, missionPhase: pausedAfter.willard.phase }, 'Two seconds of real update attempts while paused; no timer, world or mission state replacement.');

      const steeringBefore = await state();
      if (cdp) {
        const stick = await page.locator('#stick').boundingBox();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stick.x + stick.width * .75, y: stick.y + stick.height * .5, id: 9, radiusX: 7, radiusY: 7, force: 1 }] });
      } else await page.keyboard.down('d');
      const steering = await page.evaluate(() => { const g = App.game, input = { roll: App.gctl.roll, keyD: App.keys.KeyD }; for (let n = 0; n < 60; n++) g.update(1 / 60); g.render(1 / 60); return { input, roll: g.ac.roll, yaw: g.ac.yaw, alive: g.ac.alive }; });
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.keyboard.up('d');
      assert.equal(steering.alive, true); assert.ok(Math.abs(steering.roll - steeringBefore.aircraft.roll) > .08); assert.ok(profile.hasTouch ? steering.input.roll > .1 : steering.input.keyD === 1);
      assert.equal(await page.evaluate(() => App.gctl.roll || App.keys.KeyD || 0), 0);
      record('Native keyboard or touchscreen stick commands the preserved A-6A flight forces and releases cleanly', steering, 'One second of original Game.update under an actual held D key or CDP touch inside the original virtual joystick. No attitude, velocity or position is assigned.');

      // Filled from the public read-only guidance contract once integrated.
      // This pilot commands the same normalized stick/throttle inputs as the
      // real virtual joystick. It does not invoke the game\'s automatic pilot.
      await page.evaluate(() => {
        window.__willardPilot = { samples: [], phaseHistory: [], captureFire: true, controlRange: { pitch: [1, -1], roll: [1, -1] } };
        window.__willardPilotStep = function (frames) {
          const g = App.game, trace = window.__willardPilot, dt = 1 / 60;
          const startingPhase = g.willard.phase;
          const startingRounds = g.willard.enemy?.roundsFired || 0;
          const bounded = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
          const angle = v => Math.atan2(Math.sin(v), Math.cos(v));
          for (let n = 0; n < frames && g.ac.alive && !g.result; n++) {
            const s = WillardMission.snapshot(g), a = g.ac, guidance = s.guidance || {}, waypoint = guidance.point || guidance.position || guidance.target;
            if (!Array.isArray(waypoint)) throw Error('Willard browser pilot requires a public guidance point: ' + JSON.stringify(s));
            const range = s.enemy ? Math.hypot(...s.enemy.p.map((v, i) => v - a.p[i])) : Infinity;
            const gunBeltRange = Math.hypot(a.p[0] - s.route.flak[0], a.p[2] - s.route.flak[2]);
            const defending = ['contact', 'defend', 'flak'].includes(s.phase) && range < 1600 || gunBeltRange < 7000 && s.flak.stats.shellsFired > 0;
            const weave = defending ? .52 * Math.sin(g.t * .58) : 0;
            const desiredHeading = Math.atan2(waypoint[0] - a.p[0], -(waypoint[2] - a.p[2])) + weave;
            const headingError = angle(desiredHeading - a.yaw), speed = Math.max(70, Math.hypot(...a.v));
            const desiredBank = bounded(headingError * (defending ? 3.5 : 1.25), defending ? -1.10 : -.85, defending ? 1.10 : .85), targetAltitude = (guidance.altitude || waypoint[1] || 650) + (defending ? 65 * Math.sin(g.t * .49) : 0);
            const desiredVS = bounded((targetAltitude - a.p[1]) * (defending ? .32 : .13), defending ? -24 : -13, defending ? 24 : 16);
            const rho = 1.225 * Math.exp(-a.p[1] / 8500), q = .5 * rho * speed * speed;
            const weight = (12600 + a.fuel * .4536 + a.bombs * 230 + a.arms * 620) * 9.81;
            const desiredAoA = bounded((weight / (q * 49.1 * Math.max(.45, Math.cos(a.roll))) - .06) / 4.6, .008, .20);
            const targetPitch = Math.atan2(desiredVS, speed) + desiredAoA;
            App.gctl.pitch = bounded((targetPitch - a.pitch) * 3.2, -.75, .75);
            App.gctl.roll = bounded(desiredBank / 1.30, -1, 1);
            const targetSpeed = s.phase === 'egress' ? 245 : defending ? 220 : 205;
            App.gctl.thrUp = speed < targetSpeed - 3 ? 1 : 0; App.gctl.thrDn = speed > targetSpeed + 3 ? 1 : 0;
            trace.controlRange.pitch[0] = Math.min(trace.controlRange.pitch[0], App.gctl.pitch); trace.controlRange.pitch[1] = Math.max(trace.controlRange.pitch[1], App.gctl.pitch);
            trace.controlRange.roll[0] = Math.min(trace.controlRange.roll[0], App.gctl.roll); trace.controlRange.roll[1] = Math.max(trace.controlRange.roll[1], App.gctl.roll);
            if (trace.phaseHistory.at(-1)?.phase !== s.phase) trace.phaseHistory.push({ phase: s.phase, time: g.t, p: a.p.slice() });
            if (Math.floor(g.t) !== trace.samples.at(-1)?.second) trace.samples.push({ second: Math.floor(g.t), phase: s.phase, p: a.p.slice(), yaw: a.yaw, roll: a.roll, pitch: a.pitch, speed, radalt: a.radalt, damage: { ...a.dmg }, willard: s });
            g.update(dt);
            if (g.willard.phase !== startingPhase) break;
            if (trace.captureFire && (g.willard.enemy?.roundsFired || 0) !== startingRounds) break;
          }
          g.render(dt); g.syncControls(); return { time: g.t, alive: g.ac.alive, phase: g.willard.phase, result: g.result, snapshot: WillardMission.snapshot(g) };
        };
      });
      const observedPhases = new Set([initial.willard.phase]); let finish = initial, rear = false, capturedCannon = false, capturedFlak = false;
      for (let batch = 0; batch < 500 && !finish.result && finish.aircraft?.alive !== false; batch++) {
        const advanced = await page.evaluate(() => window.__willardPilotStep(600));
        finish = await state(); observedPhases.add(finish.willard.phase);
        if (['contact', 'defend'].includes(finish.willard.phase) && !rear) { await click(page.locator('#willardRear')); rear = true; await page.evaluate(() => App.game.render(1 / 60)); await shot('interceptor-first-contact'); }
        if (finish.willard.phase === 'flak' && rear) { await click(page.locator('#willardRear')); rear = false; await page.evaluate(() => App.game.render(1 / 60)); await shot('nam-dinh-flak-approach'); }
        const combat = await page.evaluate(() => ({ enemy: App.game.willard.enemy && { state: App.game.willard.enemy.state, roundsFired: App.game.willard.enemy.roundsFired, projectiles: App.game.willard.enemy.projectiles.length }, artwork: WillardSprites.inspect(App.rend) }));
        if (!capturedCannon && combat.enemy?.roundsFired > 0 && combat.enemy.projectiles > 0) {
          const wasRear = rear; if (!rear) { await click(page.locator('#willardRear')); rear = true; }
          await page.evaluate(() => App.game.render(1 / 60));
          const actualArtwork = await page.evaluate(() => WillardSprites.inspect(App.rend));
          if (actualArtwork.last?.visible) { await shot('live-cannon-pursuit'); capturedCannon = true; await page.evaluate(() => { window.__willardPilot.captureFire = false; }); }
          if (!wasRear) { await click(page.locator('#willardRear')); rear = false; await page.evaluate(() => App.game.render(1 / 60)); }
        }
        if (!capturedFlak && finish.willard.phase === 'egress') { await shot('earned-contact-break'); capturedFlak = true; }
        if (batch % 10 === 0) console.log('Willard pilot ' + name + ' ' + JSON.stringify({ time: finish.time, phase: finish.willard.phase, p: finish.aircraft.p, enemy: combat.enemy, guidance: finish.willard.guidance }));
        if (advanced.time > 1100) break;
      }
      const pilot = await page.evaluate(() => window.__willardPilot); await fs.writeFile(path.join(out, name + '-input-driven-sortie.json'), JSON.stringify({ finish, pilot }, null, 2));
      assert.ok(finish.result, 'The original input-driven sortie must reach a natural result: ' + JSON.stringify(finish));
      assert.equal(finish.willard.phase, 'complete'); assert.equal(finish.aircraft.alive, true); assert.ok(finish.aircraft.crew.pilot > 0 && finish.aircraft.crew.bn > 0);
      for (const phase of ['strike', 'contact', 'defend', 'flak', 'egress', 'complete']) assert.ok(observedPhases.has(phase), 'Actual flight must traverse playable phase ' + phase);
      assert.ok(capturedCannon, 'The successful run must actually encounter enemy cannon fire.'); assert.ok(capturedFlak);
      await shot('mission-complete');
      record('A complete standard-difficulty Willard Egress succeeds through original input-driven flight and real enemy/flak conditions', { finish, phases: [...observedPhases], controls: pilot.controlRange, sampledSeconds: pilot.samples.length, trajectory: 'willard/' + name + '-input-driven-sortie.json' }, 'A deterministic controller reads the same navigation guidance shown to players and commands only normalized virtual stick and throttle inputs. Every 1/60-second frame runs original Game.update/acStep, interceptor/projectile/flak collision and mission conditions. No aircraft teleport, timer override, success flag, enemy state or damage setter is used. This is automated flight, not a human playthrough or physical-device FPS measurement.');

      assert.equal(finish.result.pass, true); assert.equal(finish.result.recovered, false);
      assert.ok(finish.willard.flakDisrupted && finish.willard.flakExposures >= 1.2, 'The successful run must genuinely disrupt pursuit through hostile flak.');
      const damage = { cannonHits: finish.willard.cannonHits, flakHits: finish.willard.flakHits, damage: finish.worldScore.damage, fired: finish.willard.flak.stats };
      assert.ok(damage.cannonHits > 0 && damage.flakHits > 0 && damage.damage > 0, 'Production cannon and flak collisions must damage the player during the tested run.');
      record('Actual cannon and hostile flak damage remain consequential while earned safe egress is distinguished from carrier recovery', damage, 'Observed damage from the preceding full sortie; no hitAircraft, projectile, burst or damage fixture is invoked. Both crew survive the measured damage.');

      const saved = await page.evaluate(() => Store.get(WillardMission.KEY, null));
      await fs.writeFile(path.join(out,name+'-naturally-earned-checkpoint.json'),JSON.stringify(saved,null,2));
      assert.equal(saved.state.phase, 'flak'); assert.equal(await page.evaluate(() => WillardMission.validCheckpoint(Store.get(WillardMission.KEY,null))), true);
      await click(page.locator('#willardResultRetry')); await loaded();
      const restored = await state(); assert.equal(restored.result, null); assert.equal(restored.willard.phase, saved.state.phase); assert.deepEqual(restored.aircraft.p, saved.ac.p);
      assert.equal(restored.willard.enemy.projectiles.length, 0); assert.equal(restored.willard.retries, saved.retries + 1);
      record('Native result retry restores the earned flak checkpoint and removes stale incoming rounds', { label: restored.willard.checkpointLabel, phase: restored.willard.phase, aircraft: restored.aircraft, retries: restored.willard.retries }, 'The checkpoint was written naturally by the complete preceding sortie. Native Retry checkpoint starts a fresh Game through the production validation/restore path.');

      const retries = [];
      for (let run = 0; run < 3; run++) {
        await page.evaluate(async () => { App.set.sound = 1; App.audio.init(); await App.audio.ctx.resume(); App.audio.master.gain.value = 0; App.game.update(1/60); App.game.render(1/60); window.__willardRetiredGame = App.game; });
        const before = await page.evaluate(() => ({ audio: WillardPresentation.inspect(), time: App.game.t, enemy: !!App.game.willard.enemy, range: Math.hypot(...App.game.willard.enemy.p.map((v,i)=>v-App.game.ac.p[i])) }));
        assert.equal(before.audio.ownedSources, 2, 'Exactly two mission-owned pursuit sources may play, even after retries.');
        if (run === 1) {
          await click(page.locator('#willardPause')); assert.equal(await page.evaluate(() => WillardPresentation.inspect().ownedSources), 0);
          await click(page.locator('#willardPauseRetry'));
        } else await click(page.locator('#willardRetry'));
        await loaded();
        const after = await page.evaluate(() => { const g=App.game, old=window.__willardRetiredGame, oldTime=old.t, time=g.t; g.update(1/60); g.render(1/60); return { fresh:g!==old, oldTimeUnchanged:old.t===oldTime, clockAdvance:g.t-time, enemyCount:g.willard.enemy?1:0, controls:document.querySelectorAll('#willardControls').length, rearButtons:document.querySelectorAll('#willardRear').length, audio:WillardPresentation.inspect(), projectiles:g.willard.enemy.projectiles.length, retries:g.willard.retries }; });
        assert.equal(after.fresh,true); assert.equal(after.oldTimeUnchanged,true); assert.ok(Math.abs(after.clockAdvance-1/60)<1e-8); assert.equal(after.enemyCount,1); assert.equal(after.controls,1); assert.equal(after.rearButtons,1); assert.equal(after.audio.ownedSources,2); assert.equal(after.retries,saved.retries+run+2,'Retry penalties must accumulate across repeated attempts.');
        await click(page.locator('#willardRear')); assert.equal(await page.evaluate(()=>App.game.willard.rear),true); await click(page.locator('#willardRear')); assert.equal(await page.evaluate(()=>App.game.willard.rear),false);
        retries.push({run,before,after});
      }
      record('Repeated HUD and pause-menu retries retain one fighter, one control set, one update clock and two bounded pursuit-audio sources', retries, 'Three real native restart actions using the naturally earned checkpoint. Original Game.update and Web Audio graph run; mission audio gain is muted only for automated listening comfort. A double rear toggle detects duplicated action handlers.');

      const throttleBefore=await page.evaluate(()=>App.game.ac.thr);
      if(cdp){const b=await page.locator('#thrDn').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:17,radiusX:7,radiusY:7,force:1}]});}
      else await page.keyboard.down('ControlLeft');
      const throttle=await page.evaluate(()=>{const g=App.game,input={down:App.gctl.thrDn,key:App.keys.ControlLeft};for(let i=0;i<24;i++)g.update(1/60);return {input,before:0,after:g.ac.thr,alive:g.ac.alive};});
      if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('ControlLeft');
      throttle.before=throttleBefore;assert.ok(throttle.before-throttle.after>.15);assert.equal(throttle.alive,true);assert.ok(profile.hasTouch?throttle.input.down===1:throttle.input.key===1);assert.equal(await page.evaluate(()=>App.gctl.thrDn||App.keys.ControlLeft||0),0);
      record('Native held throttle control changes engine power and clears on release',throttle,'A real held CTRL key or CDP touch on the original THR down button drives 24 original 60 Hz flight frames from the restored checkpoint. No throttle or aircraft property is assigned.');

      await page.reload({waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>window.App&&window.WillardMission); await page.evaluate(()=>{window.__willardFixedClock=true;}); await click(page.locator('#bootGo'));
      await click(page.locator('#readyBody .mcard').filter({hasText:/WILLARD EGRESS/i})); assert.equal(await page.locator('#willardContinue').count(),1);
      await click(page.locator('#willardContinue')); await loaded();
      const continued=await state(); assert.deepEqual(continued.aircraft.p,saved.ac.p); assert.equal(continued.willard.phase,'flak'); assert.equal(continued.willard.enemy.projectiles.length,0); assert.equal(continued.result,null);
      record('Page reload and native Continue Willard checkpoint resume the same saved sortie', {phase:continued.willard.phase,label:continued.willard.checkpointLabel,p:continued.aircraft.p}, 'Actual browser reload retaining localStorage, followed by normal title/mission selection/Continue controls. No checkpoint object or save bytes are assigned by the test.');

      // Failure is earned with a real held nose-down input, from the saved
      // airborne state; no death, collision, phase or result setter is used.
      if(cdp){const b=await page.locator('#stick').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width*.5,y:b.y+b.height*.92,id:19,radiusX:7,radiusY:7,force:1}]});}
      else await page.keyboard.down('s');
      const dive=await page.evaluate(()=>{const g=App.game,start=g.ac.p.slice();let frames=0;while(!g.result&&g.ac.alive&&frames++<3600)g.update(1/60);g.render(1/60);g.syncControls();return {start,frames,p:g.ac.p.slice(),alive:g.ac.alive,reason:g.world.deadReason,result:g.result,phase:g.willard.phase};});
      if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('s');
      assert.equal(dive.alive,false);assert.equal(dive.phase,'failed');assert.equal(dive.result.pass,false);assert.equal(await page.locator('#willardResultRetry').count(),1);await shot('genuine-fatal-dive');
      await click(page.locator('#willardResultRetry'));await loaded();assert.equal((await state()).aircraft.alive,true);assert.equal((await state()).result,null);
      record('A held nose-down control produces a genuine collision/loss and native failure retry returns a live aircraft', dive, 'Original saved aircraft state, original flight forces, terrain/damage failure and debrief. Held S or actual CDP touchscreen pitch input; no position, attitude, damage or death assignment.');

      for(const difficulty of ['rookie','ace']){
        await click(page.locator('#willardPause'));await click(page.locator('#pauseBody').getByRole('button',{name:'Ready Room',exact:true}));
        await click(page.locator('#readyBody .mcard').filter({hasText:/WILLARD EGRESS/i}));await page.locator('#willardDifficulty').selectOption(difficulty);await click(page.locator('#willardPlay'));await loaded();
        const before=await state();
        if(cdp){const b=await page.locator('#stick').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width*.65,y:b.y+b.height*.5,id:20,radiusX:7,radiusY:7,force:1}]});}else await page.keyboard.down('d');
        const variant=await page.evaluate(()=>{const g=App.game;for(let i=0;i<120;i++)g.update(1/60);g.render(1/60);g.syncControls();return {difficulty:g.willard.difficulty,time:g.t,roll:g.ac.roll,alive:g.ac.alive,phase:g.willard.phase,configuredAssist:App.set.assist,globalHUD:document.getElementById('willardHUD').dataset.difficulty,gl:g.rend.gl.getError()};});
        if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('d');
        assert.equal(variant.difficulty,difficulty);assert.equal(variant.globalHUD,difficulty);assert.equal(variant.alive,true);assert.ok(variant.time-before.time>1.99&&Math.abs(variant.roll-before.aircraft.roll)>.1);assert.equal(variant.gl,0);assert.equal(variant.configuredAssist,1);
        record('Native '+difficulty.toUpperCase()+' briefing selection launches an independent live-control sortie',variant,'Normal mission selector, native difficulty select events and PLAY, followed by two seconds of actual held D or CDP virtual-stick control through original flight forces. This checks launch/control compatibility, not a full win or difficulty balance at this setting. Global flight-assist preference stays unchanged.');
      }

      // Short optional-strike fixture is separate from the full unmodified
      // trajectory above. It uses actual scope drag, LOCK, held consent and
      // gravity/drag/impact, never direct designation, detonation or target HP.
      await click(page.locator('#willardPause'));await click(page.locator('#pauseBody').getByRole('button',{name:'Ready Room',exact:true}));
      await click(page.locator('#readyBody .mcard').filter({hasText:/WILLARD EGRESS/i}));await page.locator('#willardDifficulty').selectOption('naval');await page.locator('#willardStrike').check();await click(page.locator('#willardPlay'));await loaded();
      const readback=await page.evaluate(()=>{const g=App.game,a=g.ac,p=g.world.targets[0].p.slice();a.p=[p[0],p[1]+700,p[2]+3000];a.v=[0,0,-110];a.yaw=0;a.pitch=.03;a.roll=0;g.render(1/60);g.syncControls();return p;});
      if(cdp)await click(page.locator('#btnScope'));else await page.keyboard.press('Tab');
      await page.evaluate(()=>{const g=App.game;for(let i=0;i<300;i++)g.hud.radar.step(1/60,g.ac,g.world,0);g.render(1/60);g.syncControls();});
      const drag=await page.evaluate(p=>{const g=App.game,h=g.hud,dx=p[0]-g.st.p[0],dz=p[2]-g.st.p[2],r=Math.hypot(dx,dz),a=Math.atan2(dx,-dz)-g.st.yaw;return {dx:(Math.atan2(Math.sin(a),Math.cos(a))/RSECT-h.cross[0])*h.W*.55,dy:-((r-300)/h.radar.maxR-h.cross[1])*h.H*.9};},readback);
      const canvas=await page.locator('#stack').boundingBox(),dragStart={x:canvas.x+canvas.width*.70,y:canvas.y+canvas.height*.55},parts=Math.max(1,Math.ceil(Math.max(Math.abs(drag.dx)/(canvas.width*.25),Math.abs(drag.dy)/(canvas.height*.25))));
      for(let n=0;n<parts;n++){const end={x:dragStart.x+drag.dx/parts,y:dragStart.y+drag.dy/parts};if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...dragStart,id:21,radiusX:6,radiusY:6,force:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:21,radiusX:6,radiusY:6,force:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await page.mouse.move(dragStart.x,dragStart.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:5});await page.mouse.up();}}
      await page.evaluate(()=>{App.game.render(1/60);App.game.syncControls();});
      if(cdp){await click(page.locator('#flightStrikeBoardToggle'));await click(page.locator('[data-strike-lock]'));await click(page.locator('#flightStrikeBoardToggle'));}else await page.keyboard.press('Enter');
      const runIn=await page.evaluate(p=>{const g=App.game,a=g.ac,w=g.world;if(!w.designated)throw Error('Native scope did not designate optional strike');a.p=[p[0],p[1]+120,p[2]+1000];a.v=[0,0,-110];a.yaw=0;a.pitch=.03;a.roll=0;g.ripple=1;const sol=w.solve(a);a.p[2]=p[2]+sol.rel;g.render(1/60);g.syncControls();return {p:a.p.slice(),v:a.v.slice(),designation:w.designated.p.slice(),solution:w.solve(a)};},readback);
      if(cdp){const b=await page.locator('#pickle').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:22,radiusX:6,radiusY:6,force:1}]});}else await page.keyboard.down('Space');
      const released=await page.evaluate(()=>{const g=App.game;let frames=0;while(g.world.score.dropped===0&&frames++<600)g.update(1/60);return {frames,dropped:g.world.score.dropped,bombs:g.world.bombs.length,phase:g.willard.phase};});
      if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('Space');assert.equal(released.dropped,1);assert.equal(released.bombs,1);
      const impact=await page.evaluate(()=>{const g=App.game,w=g.world;let frames=0;while(w.score.hits+w.score.misses===0&&frames++<1800){w.t+=1/60;w._weapons(1/60,g.ac);w.stepSecondaries(g.ac);w._fires(1/60);FlightStrikeEffects.step(w,1/60,{quality:g.rend.quality,eye:g.ac.p});w.fx.step(1/60);}g.hud.scope=false;g.render(1/60);g.syncControls();return {frames,score:{...w.score},targets:w.targets.map(t=>({hp:t.hp,alive:t.alive,kind:t.kind})),effects:FlightStrikeEffects.inspect(w)};});
      assert.ok(impact.frames>60&&impact.frames<1800);assert.ok(impact.score.hits>0&&impact.targets.some(t=>!t.alive));assert.ok(impact.effects.flashes.some(f=>f.source==='bomb'));await shot('optional-strike-real-impact');
      record('The optional night strike accepts native radar designation and consent, releases through ASQ-61 and damages its actual depot', {readback,runIn,released,impact}, 'Explicit separate radar-readback and 120m/110m-s aircraft run-in fixtures. Native scope drag/LOCK and held Space or CDP COMMIT use original release. Isolated production weapon/FX stepping follows the real ballistic impact. Target positions, HP, damage and impact callbacks are never assigned. This is not part of the successful full-sortie trajectory.');

      // Original native ejection and landing remain available on this mission.
      await click(page.locator('#willardRetry'));await loaded();
      const dry=await page.evaluate(()=>{const g=App.game,t=g.world.targets[0].p;let p;for(let r=900;r<6000&&!p;r+=160)for(let a=0;a<TAU&&!p;a+=PI/8){const x=t[0]+Math.sin(a)*r,z=t[2]-Math.cos(a)*r,h=terrainH(x,z);if(h>8&&!g._localSolidAt(x,z,.5)&&Math.abs(terrainH(x+10,z-10)-h)<2)p=[x,h,z];}if(!p)throw Error('No dry ejection fixture');g.ac.p=[p[0],p[1]+110,p[2]];g.ac.v=[0,0,0];g.render(1/60);g.syncControls();return p;});
      if(cdp){await click(page.locator('#btnEject'));await click(page.locator('#btnEject'));}else await page.keyboard.press('j');
      assert.equal(await page.evaluate(()=>App.game.phase),'chute');await page.evaluate(()=>{App.game.render(1/60);App.game.syncControls();});await shot('original-parachute-descent');
      const descent=await page.evaluate(()=>{const g=App.game;let frames=0;while(g.phase==='chute'&&frames++<4800)g.update(1/60);g.render(1/60);g.syncControls();return {frames,phase:g.phase,ejected:g.ejected,out:g._outOfAircraft,ground:!!g.evade,willardTime:g.willard.elapsed,missionHUD:!document.getElementById('willardHUD').hidden,audio:WillardPresentation.inspect(),gl:g.rend.gl.getError()};});
      assert.equal(descent.phase,'evade');assert.ok(descent.ejected&&descent.out&&descent.ground);assert.equal(descent.missionHUD,false);assert.equal(descent.audio.ownedSources,0);assert.equal(descent.gl,0);await shot('original-ground-survival');
      record('Native ejection runs the original two-seat parachute and ground-survival transition without leaving fighter HUD or pursuit audio', {dry,descent}, 'Separate declared aircraft placement 110m above dry land with zero initial velocity, then native J or the original two-tap EJECT. Every descent frame is original Game.update; no chute, ground, alive or phase setter.');

      if(await page.locator('#captVeil.on').count()){
        const hands=page.locator('#captBody').getByRole('button',{name:'Hands up',exact:true});
        if(await hands.count()){await click(hands);await click(page.locator('#captBody').getByRole('button',{name:'Go on',exact:true}));}
        else{const run=page.locator('#captBody').getByRole('button',{name:/^(Run|Run for the treeline)$/});await click(run);await click(page.locator('#captBody').getByRole('button',{name:'Go on',exact:true}));}
      }
      if(!await page.evaluate(()=>App.game._capt)){
        await page.evaluate(()=>{const g=App.game,e=g.evade,p=e.p;e.locals.push({p:[p[0]+3,terrainH(p[0]+3,p[2]),p[2]],goal:[p[0]+3,p[2]],home:[p[0]+3,p[2]],kind:'nva',armed:true,alive:true,face:0,seen:0,spd:0,ph:0});g.render(1/60);g.syncControls();});
        await click(page.locator('#btnSurrender'));
        await page.evaluate(()=>{for(let i=0;i<180&&!App.game._capt;i++)App.game.update(1/60);});
      }
      await page.waitForFunction(()=>App.game.pow?.stage==='solitary',null,{timeout:15000,polling:50});
      const captivity=await page.evaluate(()=>{const g=App.game;g.render(1/60);g.syncControls();return {mission:g.mis.id,stage:g.pow.stage,captured:!!g._capt,stats:g.pow.stats,p:g.evade.p.slice(),solids:g.pow.solids.length,objects:g.pow.objects.length,gl:g.rend.gl.getError(),savedMission:Store.get('pow_checkpoint',null)?.sortie?.missionId};});
      assert.equal(captivity.captured,true);assert.equal(captivity.stage,'solitary');assert.equal(captivity.savedMission,'willard');assert.ok(captivity.solids>0&&captivity.objects>0);assert.equal(captivity.gl,0);await shot('preserved-solitary-captivity');
      record('Capture after the original ejection enters the existing playable solitary-confinement system', captivity, 'Native first-contact surrender when offered; otherwise a declared nearby NVA placement and native HANDS UP lets production line-of-sight/captor timing resolve capture. Original delayed captivity callback, prison geometry and mechanics remain live. No captured flag, POW stage or chapter API is assigned.');
      assert.deepEqual(errors, []); assert.deepEqual(missing, []);
      record('The complete combat sortie, retries, optional strike, fatal dive and survival/captivity transitions have no JavaScript errors or missing runtime assets', { errors, missing }, 'Real original renderer and integrated combat/navigation/mission conditions throughout all five playable phases and separately declared negative-path fixtures.');
    } catch (error) {
      const actual = await state().catch(() => null); await fs.writeFile(path.join(out, name + '-failure.json'), JSON.stringify({ error: error.stack, actual }, null, 2)); await shot('FAIL').catch(() => {}); throw error;
    } finally { await context.close(); }
  }
  return { suite: 'willard', passed: true, results, total: results.length, screenshots,
    physicalWindowsTested: false, actualIPhoneSafariTested: false, fullMissionCompletionTested: true,
    scope: 'Actual Chromium custom WebGL2 on desktop and iPhone-shaped touch layout. Explicit fixed-step clock; original flight forces and combat systems. No physical iPhone Safari or Windows hardware claim.' };
};
