'use strict';
// Genuine WebGL/F/CDP touch acceptance of authored imagined details. The dated
// standalone solitary chapter and explicit clock stepping are fixtures; puzzle
// choices, completion, player movement, collision and saved progress are real.
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), { createHash } = require('node:crypto');
module.exports = async function memoryBrowser(browser, target, evidenceDir) {
  const out = path.join(evidenceDir, 'pow-memory-detail'); await fs.mkdir(out, { recursive: true });
  const checks = [], screenshots = [], browserErrors = [], sourceHashes = [];
  for (const layout of [{ name: 'desktop', viewport: { width: 1100, height: 650 }, deviceScaleFactor: 1, hasTouch: false }, { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }]) {
    const context = await browser.newContext(layout), page = await context.newPage(), errors = [];
    page.on('pageerror', error => { errors.push(error.message); browserErrors.push({ layout: layout.name, error: error.message }); });
    const session = layout.hasTouch ? await context.newCDPSession(page) : null;
    const click = locator => layout.hasTouch ? locator.tap() : locator.click();
    const tick = seconds => page.evaluate(seconds => { const g = App.game; for (let n = 0; n < Math.ceil(seconds * 20); n++) g.stepEvade(.05); }, seconds);
    const record = (name, actual) => { checks.push({ name: layout.name + ': ' + name, passed: true, actual }); console.log('PASS memory-detail ' + layout.name + ' ' + name); };
    async function shot(name) { const gl = await page.evaluate(() => { App.game.render(1 / 60); App.game.syncControls(); return App.game.rend.gl.getError(); }); assert.equal(gl, 0, 'Actual memory gameplay screenshot renders without GL errors'); const file = layout.name + '-' + name + '.png'; await page.screenshot({ path: path.join(out, file), timeout: 90000 }); screenshots.push('pow-memory-detail/' + file); }
    async function open(kind) { await page.evaluate(kind => POW.Captivity.open(App.game, kind), kind); await click(page.locator('[data-mind-open="' + kind + '"]')); await tick(.1); }
    async function walk(x, z) {
      await page.keyboard.down('w'); let actual;
      try { actual = await page.evaluate(({ x, z }) => {
        const g = App.game, b = g.pow.base, target = [b[0] + x, g.evade.p[1], b[2] + z], route = POW.AI.planPath(g, { p: g.evade.p.slice() }, target);
        const goals = route.concat([target]); let frames = 0;
        for (const goal of goals) for (let n = 0; n < 1500; n++) {
          const dx = goal[0] - g.evade.p[0], dz = goal[2] - g.evade.p[2], d = Math.hypot(dx, dz); if (d < .06) break;
          g.evade.hdg = Math.atan2(dx, -dz); g.stepEvade(Math.min(.05, d / 2.4)); frames++;
        }
        return { distance: Math.hypot(target[0] - g.evade.p[0], target[2] - g.evade.p[2]), frames, feet: g.evade.p.slice() };
      }, { x, z }); } finally { await page.keyboard.up('w'); }
      assert.ok(actual.distance < .09, 'Real collision-checked movement reaches the project: ' + JSON.stringify(actual)); return actual;
    }
    async function use(id, approach) {
      const o = await page.evaluate(id => { const g = App.game, q = g.pow.objects.find(q => q.id === id); if (!q) throw Error('Missing live imagined object ' + id); return { p: q.p.slice(), x: q.p[0] - g.pow.base[0], z: q.p[2] - g.pow.base[2], hold: q.hold || .2 }; }, id);
      await walk(approach?.x ?? o.x, approach?.z ?? o.z + 1); await page.evaluate(p => { const e = App.game.evade; e.hdg = Math.atan2(p[0] - e.p[0], -(p[2] - e.p[2])); }, o.p); await tick(.1);
      assert.equal(await page.evaluate(() => App.game.pow.focus?.id), id, 'The actual aimed prompt selects the physical object');
      if (session) { const point = await page.locator('#powHUD .pow-context-controls button:first-child').evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 8, radiusX: 7, radiusY: 7, force: 1 }] }); try { await tick(o.hold + .15); } finally { await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } }
      else { await page.keyboard.down('f'); try { await tick(o.hold + .15); } finally { await page.keyboard.up('f'); } }
      await tick(.1);
    }
    async function back() { await click(page.locator('[data-mind-return]')); await tick(.1); }
    async function init() { const coreResponse = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/assets/pow/core.js')); const entry = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 }); const core = await coreResponse; sourceHashes.push({ layout: layout.name, entrySHA256: createHash('sha256').update(await entry.body()).digest('hex'), coreSHA256: createHash('sha256').update(await core.body()).digest('hex') }); await page.waitForFunction(() => window.App && window.POW?.MemoryDetail); await click(page.locator('#bootGo')); }
    async function freeze(stage = 'solitary') { await page.waitForFunction(stage => App.game?.pow?.stage === stage && document.getElementById('loader').style.display === 'none', stage, { timeout: 90000 }); await page.evaluate(() => { App.frame = () => {}; App.screen = 'game'; App.game.paused = false; for (const k of Object.keys(App.keys)) App.keys[k] = 0; App.gctl.pitch = App.gctl.roll = 0; }); if (await page.locator('#powHUD [data-guide-skip]').isVisible()) await click(page.locator('#powHUD [data-guide-skip]')); }
    try {
      await page.addInitScript(() => { localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 })); localStorage.setItem('a6_sawkeys', '1'); });
      await init(); await click(page.locator('#powChapter [data-pow-chapter="solitary"]')); await freeze();
      const physical = await page.evaluate(() => ({ p: App.game.evade.p.slice(), base: App.game.pow.base.slice(), atmosphere: JSON.stringify(App.game.atm), time: App.game.pow.time }));
      await open('car'); const initial = await page.evaluate(() => App.game.campGeo.filter(q => q.id.startsWith('memory-detail:')).length); assert.equal(initial, 0);
      await use('mind-car-block'); const first = await page.evaluate(() => ({ installed: App.game.pow.captivity.car.installed.slice(), count: App.game.campGeo.filter(q => q.id.startsWith('memory-detail:')).length })); assert.deepEqual(first.installed, ['block']); assert.equal(first.count, 2);
      const parts = await page.evaluate(() => POW.Captivity.data.car.map(q => q.id).slice(1)); for (const part of parts) await use('mind-car-' + part);
      await walk(-2.3, -.7); await page.evaluate(() => { const e = App.game.evade; e.hdg = Math.atan2(2.3, 1.8); e.look = .05; }); await shot('restorative-engine');
      const engine = await page.evaluate(() => ({ installed: App.game.pow.captivity.car.installed.length, count: App.game.campGeo.filter(q => q.id.startsWith('memory-detail:')).length, cabin: App.game.campGeo.some(q => q.id === 'memory-detail:remembered-cabin-roof'), imaginary: App.game.rend.episode?.imagined, realNight: App.game.atm.night, renderedNight: App.game.rend.atm.night })); assert.equal(engine.installed, 10); assert.equal(engine.cabin, true); assert.equal(engine.imaginary, true); assert.equal(engine.realNight, true); assert.equal(engine.renderedNight, false); record('Real component interactions grow the remembered car and a warm imagined scene without changing actual night', engine);
      await back(); assert.deepEqual(await page.evaluate(() => App.game.evade.p.slice()), physical.p);
      await open('architecture'); for (const id of ['concrete', 'timber', 'pitched', 'gravity', 'conduit', 'clear']) await use('mind-house-' + id);
      await walk(0, -.30); await walk(-2.1, -5); await page.evaluate(() => { App.game.evade.hdg = Math.PI / 2; App.game.evade.look = -.05; }); await shot('restorative-house');
      const house = await page.evaluate(() => ({ round: App.game.pow.captivity.architecture.round, count: App.game.campGeo.filter(q => q.id.startsWith('memory-detail:')).length, bedding: App.game.campGeo.some(q => q.id === 'memory-detail:bed-pillow'), curtains: App.game.campGeo.filter(q => q.id.includes('memory-detail:curtain')).length, floor: App.game.evade.p[1] - App.game.pow.base[1] })); assert.equal(house.round, 2); assert.equal(house.bedding, true); assert.equal(house.curtains, 4); assert.ok(Math.abs(house.floor - .16) < 1e-5); record('Real structural and service decisions complete a furnished remembered house with its original walked floor', house); await back();
      await open('city'); for (const [tool, index] of [['water', 5], ['utility', 9], ['housing', 16], ['housing', 18], ['school', 22], ['park', 17], ['stop', 12]]) { await page.locator('[data-mind-tool]').selectOption(tool); await use('mind-city-' + index); }
      await use('mind-city-survey'); await walk(-6, 2); await page.evaluate(() => { App.game.evade.hdg = Math.atan2(4, -2); App.game.evade.look = .04; }); await shot('restorative-city');
      const city = await page.evaluate(() => ({ round: App.game.pow.captivity.city.round, count: App.game.campGeo.filter(q => q.id.startsWith('memory-detail:')).length, homeDoors: App.game.campGeo.filter(q => q.id.includes('memory-detail:city-door')).length, service: App.game.campGeo.some(q => q.id === 'memory-detail:water-valve-5'), solids: App.game.pow.solids.length })); assert.equal(city.round, 2); assert.equal(city.homeDoors, 3); assert.equal(city.service, true); assert.ok(city.count <= 32); record('Physical plot placement and a real survey grow a remembered neighbourhood without new collision objects', city);
      await click(page.locator('#powHUD .pow-tools button').filter({ hasText: /^Save$/ })); const saved = await page.evaluate(() => POW.ctx.Store.get('pow_checkpoint', null)); assert.deepEqual(saved.p, physical.p); assert.equal(saved.stage, 'solitary');
      await init(); await click(page.locator('#powChapter button').filter({ hasText: /^Continue POW checkpoint$/ })); await freeze();
      const restored = await page.evaluate(() => ({ p: App.game.evade.p.slice(), active: POW.Mindscape.active(App.game), details: App.game.campGeo.filter(q => q.id.startsWith('memory-detail:')).length, cityRound: App.game.pow.captivity.city.round, houseRound: App.game.pow.captivity.architecture.round, gl: App.game.rend.gl.getError() })); assert.deepEqual(restored.p, physical.p); assert.equal(restored.active, false); assert.equal(restored.details, 0); assert.equal(restored.cityRound, 2); assert.equal(restored.houseRound, 2); assert.equal(restored.gl, 0); record('Reload restores the physical cell and earned project progress without leaking imagined geometry', restored);
      await open('architecture'); await tick(.1); assert.equal(await page.evaluate(() => App.game.campGeo.some(q => q.id === 'memory-detail:bed-pillow')), true); await back(); assert.deepEqual(errors, []); record('Completed decoration rebuilds from saved real project state without JavaScript errors', { errors, screenshots: screenshots.filter(q => q.includes(layout.name)).length });
      // Solitary has no switchable scene lights. Start the ordinary physical
      // cell and earn notebook access, so this catches physical lamp state
      // accidentally being reset when Save runs inside an imagined activity.
      await init(); await click(page.locator('#powChapter [data-pow-chapter="escape"]')); await freeze('cell'); await tick(.1);
      await use('bunk-bracket', { x: 0, z: -.8 }); assert.equal(await page.evaluate(() => App.game.pow.inventory.bracket), true);
      await use('episode-lamp:cell-bulb', { x: .5, z: -3.0 }); assert.equal(await page.evaluate(() => App.game.pow.episodeScene.lamps['cell-bulb']), false);
      for (const [kind, label, object] of [['car', 'Engine', 'mind-car-block'], ['architecture', 'House', 'mind-house-concrete']]) {
        await use('mental-notebook', { x: 0, z: -.25 });
        await click(page.locator('#pow-captivity').getByRole('button', { name: label, exact: true }));
        const before = await page.evaluate(() => ({ stage: App.game.pow.stage, p: App.game.evade.p.slice(), scene: POW.EpisodeScene.snapshot(App.game), ai: POW.AI.snapshot(App.game) }));
        assert.equal(before.stage, 'cell'); assert.equal(before.scene.lamps['cell-bulb'], false); assert.ok(before.scene.clock > 0);
        await click(page.locator('[data-mind-open="' + kind + '"]')); await tick(.1); await use(object);
        const imagined = await page.evaluate(kind => ({ active: POW.Mindscape.active(App.game), scene: POW.EpisodeScene.snapshot(App.game), selected: kind === 'car' ? App.game.pow.captivity.car.installed.slice() : App.game.pow.captivity.architecture.choices.foundation }), kind);
        assert.equal(imagined.active, true); assert.deepEqual(imagined.scene, before.scene);
        if (kind === 'car') assert.deepEqual(imagined.selected, ['block']); else assert.equal(imagined.selected, 'concrete');
        await shot('physical-cell-' + kind + '-imagined-checkpoint');
        await click(page.locator('#powHUD .pow-tools button').filter({ hasText: /^Save$/ }));
        const checkpoint = await page.evaluate(() => POW.ctx.Store.get('pow_checkpoint', null));
        assert.equal(checkpoint.stage, 'cell'); assert.deepEqual(checkpoint.p, before.p); assert.deepEqual(checkpoint.episodeScene, before.scene); assert.deepEqual(checkpoint.ai, before.ai);
        await page.evaluate(() => { window.__memoryPhysicalContinue = App.game.pow; });
        await click(page.locator('#powHUD .pow-tools button').filter({ hasText: /^Continue$/ }));
        await page.waitForFunction(() => App.game?.pow?.stage === 'cell' && App.game.pow !== window.__memoryPhysicalContinue && !POW.Mindscape.active(App.game), null, { timeout: 30000 });
        const resumed = await page.evaluate(kind => ({ active: POW.Mindscape.active(App.game), p: App.game.evade.p.slice(), scene: POW.EpisodeScene.snapshot(App.game), selected: kind === 'car' ? App.game.pow.captivity.car.installed.slice() : App.game.pow.captivity.architecture.choices.foundation, ai: POW.AI.snapshot(App.game) }), kind);
        assert.equal(resumed.active, false); assert.deepEqual(resumed.p, before.p); assert.deepEqual(resumed.scene, before.scene); assert.deepEqual(resumed.selected, imagined.selected); assert.deepEqual(resumed.ai, before.ai);
        await shot('physical-cell-lamp-off-restored-' + kind);
        record('Physical lamp OFF and scene clock survive genuine ' + kind + ' activity, Save and Continue with patrol memory intact', { before, imagined, checkpoint: { stage: checkpoint.stage, p: checkpoint.p, episodeScene: checkpoint.episodeScene }, resumed });
        // Continued cells install their ordinary activity objects on their
        // first physical update. Verify exact restoration before that frame,
        // then let the real update run before the next notebook interaction.
        await tick(.1);
      }
      assert.deepEqual(errors, [], 'Physical cell lamp-memory restoration introduces no JavaScript errors');
    } catch (error) {
      const state = await page.evaluate(() => {
        const g = App.game, s = g?.pow, saved = POW.ctx.Store.get('pow_checkpoint', null);
        return { stage: s?.stage, p: g?.evade?.p, focus: s?.focus?.id, holding: s?.holding, imagined: g && POW.Mindscape.active(g), scene: s?.episodeScene, inventory: s?.inventory, car: s?.captivity?.car, architecture: s?.captivity?.architecture, message: s?.message, checkpoint: saved && { stage: saved.stage, p: saved.p, episodeScene: saved.episodeScene } };
      }).catch(() => null);
      await fs.writeFile(path.join(out, layout.name + '-failure.json'), JSON.stringify({ error: String(error), state, browserErrors: errors }, null, 2) + '\n'); throw error;
    } finally { await context.close(); }
  }
  return { suite: 'memory-detail', checks, screenshots, browserErrors, sourceHashes, limitations: ['Chromium software WebGL2 and simulated phone layout; not a physical iPhone Safari or Windows device test.', 'Camera steering, explicit stepping, and the dated standalone solitary chapter are fixtures. Movement and held component/plot interactions execute production code. Physical cell lamp/imagined activity Save/Continue checks earn their notebook access through actual held bunk work and preserve normal patrol memory.'] };
};
