'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The exported suite uses the existing browser supplied by run-browser. Executing
// this file directly runs isolated real-method tests and does not launch a GPU.
function methods() {
  const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const html = source.slice(source.indexOf('class Game {'));
  const read = name => {
    const start = html.indexOf('\n  ' + name + '(');
    assert.ok(start >= 0, name + ' must exist');
    const body = html.slice(start + 1), end = body.slice(1).search(/\n  [A-Za-z_$][\w$]*\([^;\n]*\)\s*\{/);
    return end < 0 ? body : body.slice(0, end + 1);
  };
  return ['_groundAwareness', '_stepLivingWorld', '_alertWitnesses', '_groundLineOfSight', '_weapons'].map(read).join('\n');
}
function fixture() {
  const boxes = [], messages = [];
  const math = Object.create(Math); math.random = () => .5;
  const sandbox = {Math: math, Number, PI: Math.PI, TAU: Math.PI * 2, IS_TOUCH: false,
    terrainH: () => 10, rnd: (a, b) => (a + b) / 2, clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n))};
  const Fixture = vm.runInNewContext('(class GroundFixture {' + methods() + '\n})', sandbox);
  const G = new Fixture(); G.t = 20; G.world = {fx: {glow() {}, smoke() {}}};
  G.app = {radio(...args) { messages.push(args); }, vn() {}, audio: {burst() {}}};
  G._seedLivingWorld = () => { throw new Error('Fixture must not refill'); };
  G._localSolidAt = (x, z, r) => boxes.some(b => Math.abs(x - b.x) < b.hw + r && Math.abs(z - b.z) < b.hl + r);
  G._campSolidAt = G._localSolidAt;
  const e = {p: [0, 0, 0], hdg: 0, noise: 0, searchers: [], locals: [], cattle: [], localRefill: 1e9, spawn: 1e9};
  G.evade = e;
  const add = (kind = 'nva', p = [0, 0, 8], face = 0, local = true) => {
    const a = {kind, p: p.slice(), goal: p.slice(), home: [p[0], p[2]], face, alive: true, seen: 0, sus: 0,
      spd: 0, ph: 0, wander: 100, loiter: 0};
    (local ? e.locals : e.searchers).push(a); return a;
  };
  return {G, e, boxes, messages, add};
}
function pure() {
  let count = 0;
  const test = (name, check) => { check(); count++; process.stdout.write('PASS ' + name + '\n'); };
  test('locals require cone and LOS, while two-metre contact tolerates missing facing', () => {
    const f = fixture(), a = f.add(); f.e.running = true;
    f.G._stepLivingWorld(.1, f.e); assert.equal(a.seen, 1);
    const hidden = fixture(); hidden.boxes.push({x: 0, z: 0, hw: 4.2, hl: 4.2}); hidden.e.p = [7, 0, 0]; hidden.e.running = true;
    const guard = hidden.add('nva', [-7, 0, 0], Math.PI / 2), farmer = hidden.add('farmer', [-7, 0, 1], Math.PI / 2);
    hidden.G._stepLivingWorld(.1, hidden.e); assert.equal(guard.seen, 0); assert.equal(farmer.flee || 0, 0);
    const behind = fixture(), b = behind.add('nva', [0, 0, -10], 0); behind.e.running = true;
    behind.G._stepLivingWorld(.1, behind.e); assert.equal(b.seen, 0);
    b.p = [0, 0, -2]; b.face = undefined; behind.G.t += 1; behind.G._stepLivingWorld(.1, behind.e);
    assert.equal(b.seen, 1); assert.ok(Number.isFinite(b.face)); assert.equal(b.armed, true);
  });
  test('heard noise investigates its stored location without supplying sight', () => {
    const f = fixture(); f.boxes.push({x: 0, z: 0, hw: 4.2, hl: 4.2}); f.e.p = [7, 0, 0]; f.e.noise = 1;
    const a = f.add('nva', [-7, 0, 0], Math.PI / 2); f.G._stepLivingWorld(.1, f.e);
    assert.equal(a.seen, 0); assert.deepEqual(Array.from(a.lastNoise), [7, 0, 0]);
    f.e.noise = 0; f.e.p = [17, 0, 0]; f.G.t += .4; f.G._stepLivingWorld(.1, f.e);
    assert.deepEqual(Array.from(a.goal), [7, 0, 0]);
  });
  test('pursuing locals stop tracking a hidden player and deescalate', () => {
    const f = fixture(); f.e.p = [7, 0, 0]; f.e.running = true;
    const a = f.add('nva', [-7, 0, 0], Math.PI / 2); f.G._stepLivingWorld(.1, f.e);
    assert.equal(a.seen, 1);
    f.boxes.push({x: 0, z: 0, hw: 4.2, hl: 4.2}); f.e.p = [17, 0, 0]; f.e.running = false;
    f.G.t += .4; f.G._stepLivingWorld(.1, f.e); assert.deepEqual(Array.from(a.goal), [7, 0, 0]);
    f.G.t += 8; f.G._stepLivingWorld(.1, f.e); assert.equal(a.seen, 0);
  });
  test('civilian report is delayed and cannot grant guard sight through a wall', () => {
    const f = fixture(); const farmer = f.add('farmer', [0, 0, 2], 0);
    const guard = f.add('nva', [12, 0, 0], -Math.PI / 2);
    f.boxes.push({x: 6, z: 0, hw: .1, hl: 5}); f.G._stepLivingWorld(.1, f.e);
    assert.equal(farmer.flee, 1); assert.equal(farmer.reported || false, false); assert.equal(guard.seen, 0);
    f.G.t += 3; f.G._stepLivingWorld(.1, f.e);
    assert.equal(farmer.reported, true); assert.equal(guard.seen, 0); assert.ok(guard.sus >= .7);
    const count = f.messages.length; f.G.t += 1; f.G._stepLivingWorld(.1, f.e); assert.equal(f.messages.length, count);
  });
  test('actual pistol fire consumes ammunition and causes hearing without global sight', () => {
    const f = fixture(); f.e.p = [7, 0, 0]; f.e.hdg = -Math.PI / 2;
    Object.assign(f.e, {weaponMode: 'pistol', drawn: 1, rounds: 1, hasPistol: true, lastShot: -99});
    const a = f.add('nva', [-7, 0, 0], Math.PI / 2); f.boxes.push({x: 0, z: 0, hw: 4.2, hl: 4.2});
    f.G._weapons(.1, f.e, f.G.app, {Space: true});
    assert.equal(f.e.rounds, 0); assert.equal(a.seen, 0); assert.ok(a.sus >= .7); assert.deepEqual(Array.from(a.lastNoise), [7, 0, 0]);
  });
  test('sight cache preserves the last validated position and bounds repeated LOS work', () => {
    const f = fixture(), a = f.add(); let calls = 0;
    const original = f.G._groundLineOfSight; f.G._groundLineOfSight = function(...args) { calls++; return original.apply(this, args); };
    assert.equal(f.G._groundAwareness(f.e, a, 120), true);
    f.e.p[0] = .1; for (let i = 0; i < 9; i++) f.G._groundAwareness(f.e, a, 120);
    assert.equal(calls, 1); assert.deepEqual(Array.from(a.lastKnown), [0, 0, 0]);
    f.G.t += .21; f.G._groundAwareness(f.e, a, 120); assert.equal(calls, 2); assert.deepEqual(Array.from(a.lastKnown), [.1, 0, 0]);
  });
  process.stdout.write(`${count} isolated legacy awareness method tests passed. No browser/GPU was launched.\n`);
  return count;
}

module.exports = async function groundAwareness(browser, target) {
  const page = await browser.newPage({viewport: {width: 640, height: 360}, deviceScaleFactor: 1}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1}));
      localStorage.setItem('a6_sawkeys', '1');
    });
    await page.goto(target, {waitUntil: 'domcontentloaded', timeout: 30000});
    await page.waitForFunction(() => window.App);
    await page.evaluate(() => App.start(MISSIONS.find(m => !m.escape)));
    await page.waitForFunction(() => App.game?.st && document.getElementById('loader').style.display === 'none', null, {timeout: 90000});
    const results = await page.evaluate(() => {
      const G = App.game; App.screen = 'fixture'; G.paused = true; G.t = 20; G.startCamp(1);
      let p;
      for (let radius = 160; radius < 1300 && !p; radius += 80) for (let heading = 0; heading < TAU; heading += PI / 4) {
        const x = G.evade.p[0] + Math.cos(heading) * radius, z = G.evade.p[2] + Math.sin(heading) * radius;
        if (terrainH(x, z) > 10 && !G._localSolidAt(x, z, 18)) {p = [x, 0, z]; break;}
      }
      if (!p) throw new Error('No clear dry terrain for awareness fixture');
      const results = [];
      const record = (name, passed, actual) => results.push({name, passed, actual});
      const reset = (position = p) => G.evade = {p: position.slice(), hdg: 0, noise: 0, searchers: [], locals: [], cattle: [], localRefill: 1e9, spawn: 1e9};
      const add = (e, kind, x, z, face) => {
        const a = {p: [x, 0, z], goal: [x, 0, z], home: [x, z], kind, alive: true, face, seen: 0, sus: 0, spd: 0, ph: 0, wander: 100, loiter: 0}; e.locals.push(a); return a;
      };
      let e = reset(), close = add(e, 'nva', p[0], p[2] - 2, undefined);
      G._stepLivingWorld(.1, e); record('missing-facing-close-awareness', close.seen === 1 && Number.isFinite(close.face) && close.armed, {seen: close.seen, face: close.face});
      e = reset(); e.running = true;
      const back = add(e, 'nva', p[0], p[2] - 12, 0); G.t += 1; G._stepLivingWorld(.1, e);
      record('behind-cone-unseen', !back.seen, {seen: back.seen});
      const wall = {m: 'bldg', p: [p[0], terrainH(p[0], p[2]), p[2]], y: 0, s: 1}; G.world.scenery.push(wall);
      e = reset([p[0] + 7, 0, p[2]]); e.running = true;
      const hidden = add(e, 'nva', p[0] - 7, p[2], PI / 2); G.t += 1; G._stepLivingWorld(.1, e);
      record('building-occludes-close-local', !hidden.seen, {seen: hidden.seen, sight: hidden._sight});
      e.noise = 1; G.t += .3; G._stepLivingWorld(.1, e);
      record('building-muffles-noise-without-sight', !hidden.seen && hidden.lastNoise && hidden.goal[0] === e.p[0], {seen: hidden.seen, goal: hidden.goal});
      e.noise = 0; e.p[0] += 10; G.t += .3; G._stepLivingWorld(.1, e);
      record('hidden-relocation-keeps-heard-destination', hidden.goal[0] === p[0] + 7, {goal: hidden.goal, player: e.p});
      Object.assign(e, {weaponMode: 'pistol', drawn: 1, rounds: 1, hasPistol: true, lastShot: -99, hdg: -PI / 2});
      G.t += 1; G._weapons(.1, e, App, {Space: true});
      record('pistol-hearing-does-not-grant-xray-sight', e.rounds === 0 && !hidden.seen && hidden.sus >= .7, {rounds: e.rounds, seen: hidden.seen, suspicion: hidden.sus});
      G.world.scenery.splice(G.world.scenery.indexOf(wall), 1);
      return results;
    });
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.ok(results.every(r => r.passed), JSON.stringify(results.filter(r => !r.passed)));
    return {suite: 'ground-awareness', passed: true, checks: results.length, results,
      evidence: 'Fixture-assisted calls to real Game awareness, movement and weapon methods in the actual browser. Not an iPhone or human playthrough test.'};
  } finally { await page.close(); }
};
module.exports.pure = pure;
if (require.main === module) pure();
