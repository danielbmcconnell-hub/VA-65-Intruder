'use strict';
// Real motion/geometry descriptor logic without a browser, GPU or AI mocks.
// Root's browser suite separately verifies the rendered, physically moving NPCs.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const base = path.resolve(__dirname, '..'), source = fs.readFileSync(path.join(base, 'assets/pow/figure-motion.js'), 'utf8');
function fixture(kind = 'nva') {
  const window = { POW: {} }, context = vm.createContext({ window }); vm.runInContext(source, context);
  const actor = { id: 'motion-fixture', kind, p: [0, 0, 0], face: 0, ph: 0, spd: 0, state: 'patrol', alive: true, armed: !['farmer', 'villager'].includes(kind) };
  const game = { pow: { time: 0, stage: 'cell' }, t: 0, paused: false, evade: { searchers: [actor], locals: [] }, rend: { eye: [0, 1.5, 8] } };
  const M = window.POW.FigureMotion; M.pose(actor, game); return { M, actor, game };
}
function step(f, distance = 0, dt = .1, face) {
  f.actor.p[0] += distance; if (face !== undefined) f.actor.face = face;
  f.game.pow.time += dt; f.game.t += dt; f.M.step(f.game, dt); return f.M.pose(f.actor, f.game);
}
const tests = [], test = (name, run) => tests.push({ name, run });
test('the visually inspected original sheet remains byte-identical and source limitations are explicit', () => {
  const f = fixture(), digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(base, f.M.source.file))).digest('hex');
  assert.equal(digest, f.M.source.sha256); assert.equal(f.M.source.columns, 8); assert.equal(f.M.source.rows, 9);
  assert.match(f.M.source.limitations, /not leg-stride frames/); assert.match(f.M.source.limitations, /already kneeling/);
});
test('motion is limited to the extended POW chapter and never changes portraits or legacy survival', () => {
  const f = fixture(); delete f.game.pow;
  assert.equal(f.M.step(f.game, .1), 0); assert.equal(f.M.pose(f.actor, f.game).enabled, false);
  f.game.pow = { time: 0, complete: true }; assert.equal(f.M.pose(f.actor, f.game).enabled, false);
  for (const kind of ['portrait', 'stockdale', 'denton', 'cow', 'aviator', 'vegetation', 'pow']) {
    const g = fixture(kind); assert.equal(g.M.pose(g.actor, g.game).enabled, false);
  }
});
test('cadence advances by actual horizontal distance rather than declared speed or elapsed time', () => {
  const f = fixture(); f.actor.spd = 3;
  const idle = step(f, 0, .2); assert.equal(idle.phase, 0); assert.equal(idle.stride, 0); assert.equal(idle.state, 'idle');
  const moved = step(f, .13, .1); assert.ok(moved.phase > 0); assert.ok(moved.stride > .5);
  assert.ok(Math.abs(moved.phase - .13 * Math.PI * 2 / 1.56) < 1e-10);
});
test('one measured stride cycle and matching paths at different update frequencies have the same phase', () => {
  const slow = fixture(), fast = fixture();
  for (let i = 0; i < 12; i++) step(slow, .13, .1);
  for (let i = 0; i < 120; i++) step(fast, .013, .01);
  const a = slow.M.pose(slow.actor, slow.game), b = fast.M.pose(fast.actor, fast.game);
  assert.ok(Math.abs(Math.sin(a.phase)) < 1e-10); assert.ok(Math.abs(Math.sin(b.phase)) < 1e-10);
  assert.ok(Math.abs(a.distance - b.distance) < 1e-10); assert.ok(Math.abs(a.distance - 1.56) < 1e-10);
});
test('running follows actual speed and selects the supplied charging guard pose after a short transition', () => {
  const f = fixture(); f.actor.state = 'pursuit'; f.actor.seen = 1;
  const first = step(f, .26, .1); assert.equal(first.state, 'running'); assert.equal(first.row, 0);
  const second = step(f, .26, .1); assert.equal(second.row, 8); assert.equal(second.heightRatio, 1); assert.equal(second.stride, .96);
});
test('a stopped threatening guard uses the genuine aiming row without transparent crossfading', () => {
  const f = fixture(); f.actor.state = 'pursuit'; f.actor.seen = 1;
  step(f); const pose = step(f); assert.equal(pose.row, 1); assert.equal(pose.heightRatio, 1); assert.equal(pose.stride, 0);
  assert.ok(Number.isInteger(pose.cell)); assert.equal(Object.prototype.hasOwnProperty.call(pose, 'alphaBlend'), false);
});
test('stopping eases the movement envelope while the stride phase immediately stops advancing', () => {
  const f = fixture(); for (let i = 0; i < 5; i++) step(f, .12);
  const before = f.M.pose(f.actor, f.game), first = step(f);
  assert.equal(first.phase, before.phase); assert.ok(first.stride < before.stride && first.stride > 0);
  for (let i = 0; i < 5; i++) step(f); assert.equal(f.M.pose(f.actor, f.game).stride, 0);
});
test('turning uses shortest-angle real heading changes and decays when the actor stops turning', () => {
  const f = fixture(); step(f, 0, .1, Math.PI - .05); const across = step(f, 0, .1, -Math.PI + .05);
  assert.ok(across.turn > 0 && across.turn <= 1);
  for (let i = 0; i < 15; i++) step(f); assert.ok(Math.abs(f.M.pose(f.actor, f.game).turn) < .000001);
});
test('camera-relative source column selection never alters actor heading or motion phase', () => {
  const f = fixture(); const original = f.M.pose(f.actor, f.game); f.game.rend.eye = [8, 1.5, 0]; const quarter = f.M.pose(f.actor, f.game);
  assert.notEqual(original.column, quarter.column); assert.equal(original.phase, quarter.phase); assert.equal(f.actor.face, 0);
  assert.ok(quarter.cell >= 0 && quarter.cell < 72);
});
test('renderer reads do not advance cadence or any motion cache', () => {
  const f = fixture(); step(f, .12); const before = f.M.pose(f.actor, f.game);
  for (let i = 0; i < 200; i++) assert.deepEqual(f.M.pose(f.actor, f.game), before);
});
test('the same physics stamp and duplicate actor references cannot advance cadence twice', () => {
  const f = fixture(); f.game.evade.locals.push(f.actor); const before = step(f, .12), phase = before.phase;
  assert.equal(f.M.step(f.game, .1), 0); assert.equal(f.M.pose(f.actor, f.game).phase, phase);
  f.game.pow.time += .1; f.game.t += .1; f.actor.p[0] += .12;
  assert.equal(f.M.step(f.game, .1), 1); assert.ok(f.M.pose(f.actor, f.game).phase > phase);
});
test('source identities remain stable when farmers, villagers, militia and VC become suspicious or flee', () => {
  for (const [kind, row] of [['farmer', 6], ['villager', 5], ['militia', 2], ['vc', 3], ['vcFem', 4]]) {
    const f = fixture(kind); f.actor.state = 'pursuit'; f.actor.seen = 1; f.actor.armed = true;
    step(f, .26); const pose = step(f, .26); assert.equal(pose.row, row); assert.equal(pose.kind, kind);
  }
});
test('the already-kneeling female photograph and shorter farmer retain natural source proportions', () => {
  const woman = fixture('vcFem'), farmer = fixture('farmer');
  const w = woman.M.pose(woman.actor, woman.game), f = farmer.M.pose(farmer.actor, farmer.game);
  assert.ok(Math.abs(w.heightRatio - 309 / 352) < 1e-10); assert.ok(Math.abs(f.heightRatio - 346 / 352) < 1e-10);
  assert.equal(w.crouch, 1); assert.match(w.crouchPresentation, /Already kneeling/);
  assert.equal(w.anchorBottom, 16 / 384); assert.equal(f.anchorBottom, 6 / 384);
});
test('real atlas metadata anchors are snapshotted and malformed metadata cannot replace them', () => {
  const f = fixture(), scope = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(base, 'assets/atlas-metadata.js'), 'utf8') + '\nthis.meta = PHOTO_ATLAS.people;', scope);
  assert.equal(f.M.configure({ metadata: scope.meta }), true); const before = f.M.pose(f.actor, f.game);
  scope.meta.frames[0].height = .01; assert.equal(f.M.pose(f.actor, f.game).sourceHeight, before.sourceHeight);
  assert.equal(f.M.configure({ metadata: { frames: [] } }), false); assert.equal(f.M.pose(f.actor, f.game).heightRatio, 1);
});
test('stunning and death immediately suppress stride, turning and cadence', () => {
  const f = fixture(); step(f, .2); const phase = f.M.pose(f.actor, f.game).phase;
  f.actor.stunned = true; let pose = step(f, .2, .1, 1);
  assert.equal(pose.state, 'stunned'); assert.equal(pose.stride, 0); assert.equal(pose.turn, 0); assert.equal(pose.phase, phase);
  f.actor.stunned = false; f.actor.alive = false; f.actor.downAt = f.game.t; pose = step(f, .2, .1, 2);
  assert.equal(pose.row, 7); assert.equal(pose.stride, 0); assert.equal(pose.turn, 0); assert.equal(pose.phase, phase); assert.equal(pose.visible, true);
  for (let i = 0; i < 10; i++) step(f); assert.equal(f.M.pose(f.actor, f.game).visible, false);
});
test('game pause freezes cadence and exposes zero procedural movement to the renderer', () => {
  const f = fixture(); step(f, .2); const before = f.M.pose(f.actor, f.game).phase; f.game.paused = true;
  assert.equal(f.M.step(f.game, .1), 0); const p = f.M.pose(f.actor, f.game); assert.equal(p.phase, before); assert.equal(p.stride, 0); assert.equal(p.turn, 0);
});
test('large recentering jumps reset movement instead of playing a sprint across the new origin', () => {
  const f = fixture(); step(f, .12); const phase = f.M.pose(f.actor, f.game).phase;
  const p = step(f, 800); assert.equal(p.teleported, true); assert.equal(p.stride, 0); assert.equal(p.phase, phase);
  const next = step(f, .12); assert.equal(next.teleported, false); assert.ok(next.stride > 0);
});
test('save/load reset starts from the existing saved phase and does not leak motion between games', () => {
  const f = fixture(); step(f, .2); assert.equal(f.M.reset(f.game), true); f.actor.ph = 1.23;
  assert.ok(Math.abs(f.M.pose(f.actor, f.game).phase - 1.23) < 1e-12); f.game.pow.time = -1; assert.equal(f.M.step(f.game, .1), 1);
  assert.ok(Math.abs(f.M.pose(f.actor, f.game).phase - 1.23) < 1e-12);
  const another = { ...f.game, pow: { time: 0 }, evade: { searchers: [f.actor], locals: [] } }; f.actor.ph = 0;
  assert.equal(f.M.pose(f.actor, another).phase, 0);
});
test('motion cache does not mutate positions, flags, AI schedules, saved state or source actors', () => {
  const f = fixture(); f.actor.route = [[0, 0, 1]]; f.actor.goal = [0, 0, 1]; f.actor.attention = { reason: 'routine' };
  f.actor.p[0] = .12; f.game.pow.time = .1; f.game.t = .1;
  const before = JSON.stringify(f.game); f.M.step(f.game, .1); f.M.pose(f.actor, f.game); assert.equal(JSON.stringify(f.game), before);
});
test('invalid input remains finite and per-frame actor work has a hard upper bound', () => {
  const f = fixture(); f.actor.face = NaN; f.actor.ph = Infinity; f.actor.p = [NaN, 0, 0];
  const p = step(f, 0); assert.ok([p.phase, p.stride, p.turn, p.crouch, p.heightRatio].every(Number.isFinite));
  f.game.evade.searchers = Array.from({ length: 500 }, (_, i) => ({ ...f.actor, id: 'extra-' + i, p: [i, 0, 0], face: 0 }));
  f.game.pow.time += .1; assert.equal(f.M.step(f.game, .1), f.M.limits.maxActors);
});
test('lower legs move in opposition rather than applying the same shear to both sides', () => {
  const f = fixture(), motion = { phase: Math.PI / 2, stride: 1, turn: 0 };
  const left = f.M.deform(-.25, .12, motion), right = f.M.deform(.25, .12, motion);
  assert.ok(left.dx < 0); assert.ok(right.dx > 0); assert.ok(Math.abs(left.dx + right.dx) < 1e-12);
  assert.equal(f.M.deform(0, .12, motion).dx, 0);
});
test('bounded shared-vertex deformation keeps tile foot/top anchors and finite NPC proportions', () => {
  const f = fixture();
  for (let phase = 0; phase < Math.PI * 2; phase += .12) for (const turn of [-1, 0, 1]) {
    const motion = { phase, stride: 1, turn };
    for (let row = 0; row <= 12; row++) for (let column = 0; column <= 4; column++) {
      const x = column / 4 - .5, y = row / 12, p = f.M.deform(x, y, motion);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); assert.ok(Math.abs(p.dx) <= .045); assert.ok(Math.abs(p.dy) <= .006 + 1e-12);
      if (y === 0) { assert.ok(Math.abs(p.y) < 1e-12); assert.ok(Math.abs(p.dx) < 1e-12); }
      if (y === 1) assert.ok(Math.abs(p.y - 1) < 1e-12);
    }
    for (const bottom of [6 / 384, 16 / 384]) assert.ok(Math.abs(f.M.deform(.25, bottom, motion).dy) * 1.92 < .003);
  }
});
test('the actual four-by-twelve grid stays consistently wound without gaps, inverted triangles or alpha-layer cuts', () => {
  const f = fixture(), area = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let phase = 0; phase < Math.PI * 2; phase += .2) for (const turn of [-1, 1]) {
    const motion = { phase, stride: 1, turn };
    for (let row = 0; row < 12; row++) for (let column = 0; column < 4; column++) {
      const x = column / 4 - .5, y = row / 12, a = f.M.deform(x, y, motion), b = f.M.deform(x + .25, y, motion),
        c = f.M.deform(x, y + 1 / 12, motion), d = f.M.deform(x + .25, y + 1 / 12, motion);
      assert.ok(area(a, b, c) > 0); assert.ok(area(b, d, c) > 0);
    }
  }
});
let passed = 0;
for (const test of tests) { try { test.run(); passed++; console.log('PASS ' + test.name); } catch (error) { console.error('FAIL ' + test.name); throw error; } }
console.log(passed + ' intact figure-motion domain/geometry checks passed.');
