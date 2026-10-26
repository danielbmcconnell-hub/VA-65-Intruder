'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// CPU-only calls to complete production Game methods. Terrain and unrelated
// controls/audio/world services are fixtures; spawning and movement are real.
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const gameSource = source.slice(source.indexOf('class Game {'));
function readMethod(name) {
  const start = gameSource.indexOf('\n  ' + name + '(');
  assert.ok(start >= 0, 'Production Game.' + name + ' exists');
  const body = gameSource.slice(start + 1);
  const end = body.slice(1).search(/\n  [A-Za-z_$][\w$]*\([^;\n]*\)\s*\{/);
  assert.ok(end > 0, 'Production Game.' + name + ' has a following method');
  return body.slice(0, end + 1);
}
const methods = ['_startGroundPhase', 'stepEvade', '_stepCSAR'].map(readMethod).join('\n');

function fixture({terrain = () => 12, random = () => .25, evade = {}} = {}) {
  const messages = [], contacts = [], effects = [], terrainCalls = [];
  const math = Object.create(Math); math.random = random;
  const sandbox = {
    Math: math, Number, PI: Math.PI, TAU: Math.PI * 2, DEG: Math.PI / 180, IS_TOUCH: false,
    terrainH(x, z) { const h = terrain(x, z); terrainCalls.push({x, z, h}); return h; },
    rnd: (lo, hi) => lo + (hi - lo) * random(),
    clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)),
    GroundView: {holdPitch: () => false}, Wildlife: {movementFactor: () => 1},
    AviatorCompanion: {movementFactor: () => 1},
    setTimeout() { throw new Error('Unexpected deferred scene transition in ocean fixture'); }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/survival/ground-controls.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/survival/ground-items.js'),'utf8'),sandbox);
  sandbox.GroundItems.configure({terrainH:sandbox.terrainH});
  const Fixture = vm.runInContext('(class OceanFixture {' + methods + '\n})', sandbox);
  const G = new Fixture();
  G.t = 20; G.phase = 'evade'; G.atm = {night: false}; G.mis = {escape: false};
  G.world = {saf: [{p: [0, 0, 0]}], fx: {smoke: (...args) => effects.push(args)}};
  G.app = {
    keys: {}, audio: {on: false, burst() {}},
    radio: (...args) => messages.push(args), vn() {},
    firstContact: (...args) => contacts.push(args)
  };
  G.evade = {
    p: [0, 0, 0], hdg: 0, t: 0, chute: [0, 0], pickup: [600, 0],
    searchers: [], locals: [], cattle: [], spawn: 0, exposure: .7,
    radio: 0, lastTx: -99, rescue: 0, eta: 100, ...evade
  };
  // These methods are independent systems, not the behavior under test.
  for (const name of ['_groundFootfalls', '_noticeAtCloseRange', '_stepCattle',
    '_stepLivingWorld', '_stepReactions', '_pushPeople', '_weapons', '_seedLivingWorld',
    '_groundFire', 'teach', 'startDoomClock', 'setHour']) G[name] = () => {};
  G._moveOnFoot = (x, z, dx, dz) => [x + dx, z + dz];
  G._localSolidAt = () => false;
  G._coverAt = () => 1;
  G._groundAwareness = G._groundLineOfSight = () => false;
  G.captured = G.escaped = G.rescued = () => { throw new Error('Unexpected mission outcome'); };
  return {G, messages, contacts, effects, terrainCalls};
}

for (const height of [-8, 0, 1.1]) {
  test('ordinary search parties cannot spawn on terrain at ' + height + ' metres', () => {
    const {G, terrainCalls} = fixture({terrain: () => height});
    G.stepEvade(.1);
    assert.equal(G.evade.searchers.length, 0);
    assert.ok(terrainCalls.some(p => Math.hypot(p.x, p.z) > 300), 'A spawn site was attempted');
    assert.ok(G.evade.spawn > 0, 'The ordinary spawn timer was processed');
  });
}

test('ordinary land spawning still creates an armed search party', () => {
  const {G} = fixture({terrain: () => 1.1001});
  G.stepEvade(.1);
  assert.equal(G.evade.searchers.length, 2);
  for (const s of G.evade.searchers) {
    assert.equal(s.kind, 'nva'); assert.equal(s.armed, true); assert.equal(s.alive, true);
    assert.deepEqual(Array.from(s.goal), [0, 0, 0]);
  }
});

test('each search-party companion needs its own dry spawn site', () => {
  // At random=.25 the lead spawn is z=525 and its companion is z=512.
  const terrain = (x, z) => z > 520 ? 12 : -8;
  const {G, terrainCalls} = fixture({terrain});
  G.stepEvade(.1);
  assert.equal(G.evade.searchers.length, 1);
  assert.ok(terrainCalls.some(p => p.z > 500 && p.h < 0), 'A companion water site was attempted');
  assert.ok(G.evade.searchers.every(s => terrain(s.p[0], s.p[2]) > 1.1));
});

function walker(height, river = false) {
  const f = fixture({terrain: x => x < 1 ? 12 : height,
    evade: {p: [-1000, 0, -1000], spawn: 1e9, river, light: 0, goal: [10000, 10000]}});
  const actor = {p: [0, 0, 10], goal: [100, 0, 10], kind: 'nva', armed: true,
    alive: true, seen: 0, sus: 0};
  f.G.evade.searchers.push(actor);
  return {...f, actor};
}

for (const height of [-8, .119]) {
  test('ordinary searchers stop before stepping onto terrain at ' + height + ' metres', () => {
    const {G, actor, terrainCalls} = walker(height);
    G.stepEvade(1);
    assert.deepEqual(Array.from(actor.p), [0, 0, 10]);
    assert.ok(terrainCalls.some(p => p.x > 1 && p.h === height), 'The destination terrain was checked');
  });
}

test('ordinary searchers can still walk on the .12 metre land boundary', () => {
  const {G, actor} = walker(.12);
  G.stepEvade(1);
  assert.ok(Math.abs(actor.p[0] - 1.7) < 1e-9);
  assert.equal(actor.p[2], 10);
});

test('legacy river countryside spawning and movement retain their terrain exemption', () => {
  const {G} = fixture({terrain: () => -8,
    evade: {river: true, light: 0, goal: [10000, 10000]}});
  G.stepEvade(.1);
  assert.equal(G.evade.searchers.length, 1);
  assert.equal(G.evade.searchers[0].kind, 'farmer');
  assert.equal(G.evade.searchers[0].armed, false);
  const {G: moving, actor} = walker(-8, true);
  moving.stepEvade(1);
  assert.ok(Math.abs(actor.p[0] - 1.7) < 1e-9);
});

function signalFixture(options = {}) {
  return fixture({...options, evade: {sandy: [], rescue: 60, eta: 100, smokeWant: 1,
    ...options.evade}});
}
function threatWarnings(messages) {
  return messages.filter(row => row[0] === 'SANDY' && row[2] === 'warn');
}

for (const height of [-8, 1.1]) {
  test('rescue smoke over terrain at ' + height + ' metres creates no walking reinforcements or threat warning', () => {
    const {G, messages, effects} = signalFixture({terrain: () => height});
    G._stepCSAR(.1, G.evade, G.app, 600);
    assert.equal(G.evade.searchers.length, 0);
    assert.equal(threatWarnings(messages).length, 0);
    assert.deepEqual(Array.from(G.evade.smoke), [0, Math.max(height, 0), 0]);
    assert.equal(G.evade.smokeWant, 0);
    assert.ok(effects.length > 0, 'The real smoke effect still runs');
  });
}

test('rescue smoke on land retains armed reinforcements and the Sandy threat warning', () => {
  const {G, messages} = signalFixture({terrain: () => 1.1001});
  G._stepCSAR(.1, G.evade, G.app, 600);
  assert.equal(G.evade.searchers.length, 6);
  for (const s of G.evade.searchers) {
    assert.equal(s.alive, true); assert.equal(s.armed, true); assert.equal(s.seen, 1);
    assert.deepEqual(Array.from(s.goal), [0, 0, 0]); assert.ok(s.fireT > G.t);
  }
  assert.equal(threatWarnings(messages).length, 1);
});

test('coastal smoke accepts only the dry reinforcement candidates', () => {
  let state = 381;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const terrain = x => x > 0 ? 12 : -8;
  const {G, messages, terrainCalls} = signalFixture({terrain, random});
  G._stepCSAR(.1, G.evade, G.app, 600);
  const candidates = terrainCalls.filter(p => Math.hypot(p.x, p.z) > 180);
  const dry = candidates.filter(p => p.h > 1.1);
  assert.ok(dry.length > 0 && dry.length < candidates.length, 'Fixture attempted both coastal land and water');
  assert.equal(G.evade.searchers.length, dry.length);
  assert.ok(G.evade.searchers.every(s => terrain(s.p[0], s.p[2]) > 1.1));
  assert.equal(threatWarnings(messages).length, 1);
});

for (const escape of [false, true]) {
  test('ocean landing skips terrestrial first contact with escape=' + escape, () => {
    const {G, contacts, messages} = fixture({terrain: () => -.4001});
    G.mis.escape = escape;
    G._startGroundPhase(0, 0, .7, 'chute');
    assert.equal(G.phase, 'evade'); assert.equal(G._outOfAircraft, true);
    assert.deepEqual(Array.from(G.evade.p), [0, 0, 0]); assert.equal(G.evade.hdg, .7);
    assert.equal(G.evade.exposure, 1, 'Nearby threats would otherwise trigger first contact');
    assert.equal(contacts.length, 0); assert.equal(G.evade.held || 0, 0);
    assert.equal(messages.length, 0, 'Ocean entry has no terrestrial landing announcement');
  });
}

for (const height of [-.4, 12]) {
  test('land first contact remains available at terrain height ' + height, () => {
    const {G, contacts} = fixture({terrain: () => height});
    G._startGroundPhase(0, 0, 0, 'chute');
    assert.equal(contacts.length, 1); assert.equal(contacts[0][0], G);
    assert.equal(contacts[0][1], 'militia'); assert.ok(contacts[0][2] >= 30);
    assert.equal(typeof contacts[0][3], 'function'); assert.equal(G.evade.held, 1);
  });
}
