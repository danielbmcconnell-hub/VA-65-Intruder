'use strict';

// Real MB geometry and pure shoreline registration checks. These do not
// establish visual acceptance, browser WebGL, or physical iPhone behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const from = index.indexOf('class MB {');
const to = index.indexOf('/* ============================ Renderer', from);
assert.ok(from >= 0 && to > from);
const math = Object.create(Math);
math.random = () => { throw new Error('River shoreline must not consume gameplay randomness'); };
const context = {
  window: {}, Math: math, TAU: Math.PI * 2,
  vsub: (a, b) => a.map((n, i) => n - b[i]),
  vcross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  vnorm: a => { const length = Math.hypot(...a) || 1; return a.map(n => n / length); }
};
vm.runInNewContext(index.slice(from, to) + '\nglobalThis.Builder = MB;', context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/render/river-bank.js'), 'utf8'), context,
  { filename: 'assets/render/river-bank.js' });
const Banks = context.window.RiverBanks, MB = context.Builder;

test('both shores rise continuously through a varying waterline into the unchanged walk plane', () => {
  assert.equal(typeof Banks.profile, 'function');
  const shapes = new Set(), toes = new Set(), waterlines = new Set();
  for (const side of [-1, 1]) {
    for (let z = -400; z <= 400; z += 7) {
      const p = Banks.profile(side, z), points = clone(p.points);
      assert.ok(points.length >= 4);
      assert.ok(points.flat().every(Number.isFinite));
      assert.ok(p.toe > 11.5 && p.toe < 14.5, 'submerged toe stays outside the open central channel');
      assert.equal(p.shoulder, 14.5); near(p.height, .35);
      const water = points.find(point => Math.abs(point[1]) < 1e-10);
      assert.ok(water, 'the physical sloped surface has a vertex at water Y=0');
      near(water[0], p.waterline);
      assert.ok(p.toe < p.waterline && p.waterline < p.shoulder);
      near(points[0][0], p.toe); assert.ok(points[0][1] < 0);
      const shoulder = points.find(point => Math.abs(point[0] - p.shoulder) < 1e-10);
      assert.ok(shoulder); near(shoulder[1], .35);
      points.slice(1).forEach((point, n) => {
        assert.ok(point[0] > points[n][0], 'profile never doubles back or creates a vertical wall');
        assert.ok(point[1] >= points[n][1] - 1e-10, 'mud slope rises monotonically out of the river');
      });
      for (const point of points.filter(point => point[0] >= 14.5)) near(point[1], .35);
      toes.add(p.toe.toFixed(4)); waterlines.add(p.waterline.toFixed(4));
      shapes.add(JSON.stringify(points));
    }
  }
  assert.ok(toes.size > 150 && waterlines.size > 150, 'shoreline varies along the river and between banks');
  assert.ok(shapes.size > 150);
});

test('actual shore mesh has finite upward faces, sloped mud and a flat walkable bank without wall end caps', () => {
  for (const side of [-1, 1]) {
    const mesh = Banks.buildBank(MB, side, 0);
    assert.ok(mesh.p.length > 0 && mesh.i.length > 0);
    assert.ok(mesh.p.every(Number.isFinite) && mesh.n.every(Number.isFinite) && mesh.c.every(Number.isFinite));
    assert.equal(mesh.p.length, mesh.n.length); assert.equal(mesh.p.length, mesh.c.length);
    assert.ok(mesh.p.length / 3 < 65535, 'shore remains within the existing index budget');
    assert.ok(mesh.i.every(i => Number.isInteger(i) && i >= 0 && i < mesh.p.length / 3));
    let wetVertices = 0, levelVertices = 0, dryVertices = 0;
    for (let n = 0; n < mesh.p.length; n += 3) {
      const [x, y, z] = mesh.p.slice(n, n + 3);
      assert.ok(side * x > 11.5 && side * x <= 65 + 1e-8);
      assert.ok(z >= Banks.constants.zMin - 1e-8 && z <= Banks.constants.zMax + 1e-8);
      assert.ok(y >= -.36 && y <= .35000001);
      if (y < -1e-8) wetVertices++;
      if (Math.abs(y) < 1e-8) levelVertices++;
      if (Math.abs(y - .35) < 1e-8) dryVertices++;
      if (side * x >= 14.5 - 1e-8) near(y, .35);
      near(Math.hypot(...mesh.n.slice(n, n + 3)), 1);
    }
    for (let n = 0; n < mesh.i.length; n += 3) {
      const [a, b, c] = mesh.i.slice(n, n + 3).map(i => mesh.p.slice(i * 3, i * 3 + 3));
      const normal = context.vcross(context.vsub(b, a), context.vsub(c, a));
      assert.ok(Math.hypot(...normal) > 1e-7, 'every actual triangle has positive area');
      assert.ok(normal[1] > 1e-7, 'every face points upward; no vertical wall or end-cap triangles');
    }
    assert.ok(wetVertices > 0 && levelVertices > 0 && dryVertices > 0);
  }
});

test('recentering by the actual 112m segment preserves overlapping shore positions', () => {
  assert.equal(Banks.constants.walkEdge, 14.5); near(Banks.constants.walkY, .35);
  assert.equal(Banks.constants.zStep, 2);
  for (const side of [-1, 1]) {
    const old = Banks.buildBank(MB, side, 0), next = Banks.buildBank(MB, side, 112);
    const rows = (mesh, offset) => {
      const all = new Map();
      for (let n = 0; n < mesh.p.length; n += 3) {
        const z = mesh.p[n + 2] + offset;
        if (!all.has(z)) all.set(z, new Set());
        all.get(z).add(mesh.p.slice(n, n + 2).map(v => v.toFixed(8)).join(','));
      }
      return all;
    };
    const before = rows(old, 0), after = rows(next, 112);
    let overlap = 0;
    for (const [z, points] of after) if (before.has(z)) {
      assert.deepEqual([...points].sort(), [...before.get(z)].sort(), `side ${side}, logical Z ${z}`);
      overlap++;
    }
    assert.ok(overlap >= 75, 'a substantial shared reach is checked after scene recentring');
  }
});

test('shore decoration adds bounded non-solid props without changing movement, boat, pursuit or interaction state', () => {
  const uploads = [];
  const renderer = { meshes: {}, meshFromBuilder(name, builder) { uploads.push(name); this.meshes[name] = builder; } };
  const game = {
    rend: renderer,
    campGeo: [{ id: 'existing-river-landmark', m: 'powWood', p: [121, 20.5, 312] }],
    pow: {
      base: [100, 20, 300], nav: { xmin: 129, xmax: 259, zmin: 198, zmax: 470 },
      solids: [{ id: 'river-log-0', x: 201, z: 242, hw: 3.1, hl: .44 }],
      surfaces: [{ id: 'original-walk-floor' }], objects: [{ id: 'river-hide-1-2', p: [212, 20.35, 324] }],
      river: { waterY: 20, phase: 'delta', streamOffset: 0, logicalDistance: 72500, segment: 4,
        boat: { p: [205, 20.03, 338], speed: .42 }, boatOwned: false, mode: 'swim' }
    },
    evade: { p: [194, 19.58, 300], hdg: Math.PI, searchers: [{ id: 'pursuer', p: [217, 20.35, 319],
      seen: 1, state: 'chase', goal: [194, 20.35, 300], route: [[217, 20.35, 319]] }] }
  };
  assert.equal(Banks.configure({ MB }), true);
  const protectedState = clone({ pow: game.pow, evade: game.evade });
  const refs = [game.pow.solids, game.pow.surfaces, game.pow.nav, game.pow.objects, game.evade.p, game.evade.searchers];
  assert.equal(Banks.build(game), true);
  assert.deepEqual(clone({ pow: game.pow, evade: game.evade }), protectedState);
  assert.deepEqual([game.pow.solids, game.pow.surfaces, game.pow.nav, game.pow.objects, game.evade.p, game.evade.searchers], refs);
  assert.equal(game.campGeo[0].id, 'existing-river-landmark');
  const info = Banks.inspect(game);
  assert.equal(info.surfaces, 2); assert.equal(info.collisionSolids, 0);
  assert.equal(info.additionalTextureBytes, 0, 'shore reuses the existing floor material texture');
  assert.ok(info.roots > 0 && info.roots <= Banks.constants.maxRoots);
  assert.ok(info.reeds > 0 && info.reeds <= Banks.constants.maxReeds);
  assert.ok(info.plants > 0 && info.plants <= Banks.constants.maxPlants);
  near(info.waterY, 20); near(info.walkY, 20.35);
  assert.ok(game.campGeo.slice(1).every(prop => prop.p.concat(prop.scale).every(Number.isFinite)));
  assert.ok(game.campGeo.slice(1).every(prop => prop.id.startsWith('natural-bank-') && !prop.solid));
  const oldProps = clone(game.campGeo.slice(1)), count = uploads.length;
  game.campGeo = []; Banks.build(game);
  assert.equal(uploads.length, count, 'a normal same-segment rebuild reuses the shore and detail meshes');
  assert.deepEqual(clone(game.campGeo), oldProps, 'shore decoration is deterministic');
  info.bankMeshes.length = 0; assert.equal(Banks.inspect(game).bankMeshes.length, 2, 'inspection returns independent arrays');
  game.pow.river.streamOffset = 112; game.campGeo = []; Banks.build(game);
  assert.equal(uploads.length, count + 2, 'recentering only rebuilds the two banks');
  assert.equal(Object.keys(renderer.meshes).length, count, 'recenter does not accumulate additional mesh names');
  const propKey = (prop, offset) => [prop.m, ...prop.p.slice(0, 2), prop.p[2] + offset,
    ...prop.scale, prop.y].map(value => typeof value === 'number' ? value.toFixed(7) : value).join(',');
  const previous = new Set(oldProps.filter(prop => !prop.id.includes('surface')).map(prop => propKey(prop, 0)));
  const retained = game.campGeo.filter(prop => !prop.id.includes('surface') && previous.has(propKey(prop, 112)));
  assert.ok(retained.length > 25, 'roots, reeds and understory retain logical world positions after recenter');
  game.pow.river.phase = 'gulf'; game.campGeo = [];
  assert.equal(Banks.build(game), false, 'offshore geometry is not altered');
  assert.equal(game.campGeo.length, 0);
});

test('the actual river rebuild submits sloped shores and preserves original core collision and hide objects', () => {
  function riverFixture(withBanks) {
    const scope = vm.createContext({ window: {}, Math: math });
    for (const file of ['assets/pow/core.js', ...(withBanks ? ['assets/render/river-bank.js'] : []), 'assets/pow/river.js']) {
      vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), scope, { filename: file });
    }
    const P = scope.window.POW;
    P.ctx = { MB }; P.save = () => {};
    if (withBanks) scope.window.RiverBanks.configure({ MB });
    const game = {
      pow: { base: [100, 20, 300], day: 3, time: 0, flags: {}, inventory: {}, stats: { physical: 100, fatigue: 0 },
        input: {}, solids: [], surfaces: [], objects: [] },
      evade: { p: [194, 20, 300], hdg: Math.PI, searchers: [] }, campGeo: [],
      rend: { meshes: {}, meshFromBuilder(name, builder) { this.meshes[name] = builder; } },
      app: { keys: {}, gctl: {} }, setHour() {}
    };
    assert.equal(P.River.enter(game), true);
    return { P, game, banks: scope.window.RiverBanks };
  }
  const decorated = riverFixture(true), original = riverFixture(false);
  const { game, P } = decorated;
  assert.deepEqual(clone(game.pow), clone(original.game.pow), 'visual module does not alter the actual river simulation state');
  assert.deepEqual(clone(game.evade), clone(original.game.evade));
  assert.equal(game.campGeo.filter(prop => /^natural-bank-surface-/.test(prop.id)).length, 2);
  assert.ok(game.campGeo.some(prop => /^natural-bank-roots-/.test(prop.id)));
  assert.ok(game.campGeo.some(prop => /^natural-bank-reeds-/.test(prop.id)));
  assert.ok(game.campGeo.some(prop => /^natural-bank-understory-/.test(prop.id)));
  assert.ok(!game.campGeo.some(prop => /^bank-/.test(prop.id) || /^reed-/.test(prop.id) || /^mud-shelter-/.test(prop.id)),
    'the former long bank boxes, reed sticks and rectangular shelter mounds are retired');
  assert.equal(game.pow.objects.filter(object => /^river-hide-/.test(object.id)).length, 10);
  assert.equal(game.pow.solids.filter(solid => /^river-log-/.test(solid.id)).length, 6);
  assert.ok(game.pow.solids.some(solid => solid.id === 'river-landmark-bridge-deck'));
  assert.ok(game.pow.solids.every(solid => !/^natural-bank-/.test(solid.id)));
  // Real module integration, rather than build(game) in isolation: actual
  // core swept movement must still cross the right shore and return to water.
  assert.equal(P.River.interact(game, 'float'), true);
  game.pow.input = { strafe: -1 };
  let frames = 0;
  while (game.pow.river.mode !== 'bank' && frames++ < 160) P.River.step(game, .1);
  assert.ok(frames < 160); near(game.evade.p[1], game.pow.river.waterY + .35);
  game.pow.input = { strafe: 1 }; frames = 0;
  while (game.pow.river.mode === 'bank' && frames++ < 80) P.River.step(game, .1);
  assert.ok(frames < 80); assert.equal(game.pow.river.mode, 'swim');
  near(game.evade.p[1], game.pow.river.waterY - .42);
  assert.equal(P.blocked(game, game.evade.p[0], game.evade.p[2], .34, game.evade.p[1]), false);
});
