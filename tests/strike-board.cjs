'use strict';
// Worksheet domain and DOM-event fixtures. Actual native input/WebGL target
// designation acceptance is a separate Chromium suite.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/flight/strike-board.js'), 'utf8');
const tests = [], test = (name, run) => tests.push({ name, run });
const unchanged = game => JSON.stringify({ ...game, app: { screen: game.app.screen, keys: game.app.keys, gctl: game.app.gctl } });
function fixture(document) {
  const window = {}, scope = vm.createContext({ window, document }); vm.runInContext(source, scope);
  const radar = { NA: 96, NR: 112, maxR: 18520, buf: new Float32Array(96 * 112), hard: new Float32Array(96 * 112), age: new Float32Array(96).fill(.1) };
  const game = { phase: 'airborne', t: 42, paused: false, rightSeat: true, ripple: 4, bombsMax: 12, masterArm: false, app: { screen: 'game', keys: {}, gctl: {} },
    hud: { scope: true, cross: [0, .2], radar }, mis: { id: 'm2', type: 'strike', targets: { kind: 'depot', label: 'DEPOT' }, brief: { ac: 'A-6A Intruder', target: 'River-bend depot', roe: 'Visual identification required.', ord: '12 × Mk 82' } },
    ac: { alive: true, onDeck: false, p: [0, 500, 8000], yaw: 0, bombs: 12, arms: 0, dmg: { diane: 0 }, v: [0, 0, -160], roll: 0 },
    world: { nav: { ex: 300, ez: 400, fixes: 1 }, route: [], rtIdx: 0, score: { dropped: 0, hits: 0, misses: 0, killed: 0, cep: [] }, briefed: [0, 0, 0], sysPos(p) { return [p[0] + this.nav.ex, p[1], p[2] + this.nav.ez]; }, designated: null, lock: false } };
  game.app.hud = game.hud; game.app.game = game;
  return { C: window.FlightStrikeBoard, game, window };
}
function hard(f, a = 48, r = 22) {
  for (let aa = a - 1; aa <= a + 1; aa++) for (let rr = r - 1; rr <= r + 1; rr++) { const i = aa * 112 + rr; f.game.hud.radar.buf[i] = .95; f.game.hud.radar.hard[i] = .9; }
}
test('worksheet starts collapsed and respects all original flight-state exclusions', () => {
  const f = fixture(); assert.equal(f.C.snapshot(f.game).open, false);
  for (const mutate of [g => g.pow = {}, g => g.evade = {}, g => g.chute = {}, g => g.result = {}, g => g.ac.alive = false, g => g.app.screen = 'ready', g => g.phase = 'done']) {
    const x = fixture(); mutate(x.game); assert.equal(x.C.snapshot(x.game), null); assert.equal(x.C.setOpen(x.game, true), false);
  }
});
test('reads only authentic game units, system-position briefing and existing stores', () => {
  const f = fixture(), d = f.C.snapshot(f.game);
  assert.ok(Math.abs(d.navErrorYd - 546.80665) < .001); assert.equal(d.stores.bombs, 12); assert.equal(d.brief.aircraft, 'A-6A Intruder');
  assert.ok(Math.abs(d.briefed.rangeNM - Math.hypot(300, 7600) / 1852) < .00001); // actual system position, not truth position
  assert.equal(d.cursor.bearing, '000'); assert.ok(Math.abs(d.cursor.rangeNM - (300 + .2 * 18520) / 1852) < .00001);
});
test('target recognition comes from the assigned brief and never exposes hidden target identities', () => {
  const f = fixture(); Object.defineProperty(f.game.world, 'targets', { get() { throw new Error('Omniscient targets read'); } });
  hard(f); const d = f.C.snapshot(f.game); assert.equal(d.brief.expected, 'cluster'); assert.equal(d.cursor.description, 'Broad hard return');
  assert.match(d.brief.observation, /Visual identification remains required/); assert.doesNotMatch(d.cursor.description, /DEPOT|enemy|hostile|confirmed/i);
});
test('actual soft/dark samples do not acquire a semantic identity from the nearby brief', () => {
  const f = fixture(); assert.equal(f.C.sample(f.game).description, 'Weak or dark return');
  f.game.hud.radar.buf.fill(.5); assert.equal(f.C.sample(f.game).description, 'Ground / soft return');
});
test('freshness follows the selected column rather than a newer neighboring sweep', () => {
  const f = fixture(); hard(f); f.game.hud.radar.age[48] = 9; f.game.hud.radar.age[47] = 0;
  assert.equal(f.C.sample(f.game).fresh, false); assert.match(f.C.sample(f.game).description, /Old/);
  f.C.interpret(f.game, 'cluster'); assert.equal(f.C.mark(f.game).ok, false);
});
test('bounds sampling at both scope edges without wrapped radar cells or NaN readbacks', () => {
  const f = fixture();
  for (const x of [-1, 1]) for (const y of [0, 1]) {
    f.game.hud.cross = [x, y]; const d = f.C.sample(f.game); assert.ok(Number.isFinite(d.strength)); assert.ok(Number.isFinite(d.rangeNM)); assert.equal(Math.abs(d.relativeDeg), 35);
  }
});
test('no scope, damaged DIANE and missing radar buffers clearly report unavailable data', () => {
  const f = fixture(); f.game.hud.scope = false; assert.match(f.C.sample(f.game).reason, /Open SCOPE/);
  f.game.hud.scope = true; f.game.ac.dmg.diane = .81; assert.match(f.C.sample(f.game).reason, /DIANE/);
  f.game.ac.dmg.diane = 0; f.game.hud.radar.hard = null; assert.equal(f.C.sample(f.game).available, false);
});
test('uncertain returns cannot silently become a marked target correlation', () => {
  const f = fixture(); assert.equal(f.C.mark(f.game).ok, false); assert.equal(f.C.debrief(f.game), null);
  assert.equal(f.C.interpret(f.game, 'invented-enemy-id'), false); assert.equal(f.C.snapshot(f.game).interpretation, 'unknown');
});
test('a note records the actual cursor bearing, range and player judgment with no score mutation', () => {
  const f = fixture(); hard(f); f.game.hud.cross[0] = .5;
  const before = unchanged(f.game); f.C.interpret(f.game, 'linear'); const note = f.C.mark(f.game);
  assert.equal(note.ok, true); assert.equal(note.note.interpretation, 'linear'); assert.equal(note.note.bearing, '018'); assert.equal(note.note.time, 42); assert.equal(unchanged(f.game), before);
  assert.match(note.reason, /does not authorize/); assert.equal(f.C.snapshot(f.game).notes.length, 1);
});
test('briefed coordinate attacks permit notes without inventing target returns or accuracy', () => {
  const f = fixture(); f.game.world.blind = true; f.game.hud.radar.age.fill(9); hard(f);
  const d = f.C.snapshot(f.game); assert.equal(d.step, 'coordinates'); assert.equal(d.brief.expected, 'coordinates'); assert.match(d.cursor.description, /do not infer/);
  f.C.interpret(f.game, 'coordinates'); assert.equal(f.C.mark(f.game).ok, true); assert.equal(f.game.world.lock, false);
});
test('concealed target recognition preserves the existing two-press offset workflow', () => {
  const f = fixture(); f.game.world.softTargets = true; f.game.world.oap = { label: 'River junction', p: [0, 0, 0], brg: 90, rng: 914.4 };
  assert.equal(f.C.snapshot(f.game).brief.expected, 'offset'); assert.equal(f.C.snapshot(f.game).offset.yards, 1000);
  f.game.world.oapLocked = true; assert.equal(f.C.snapshot(f.game).step, 'offset'); assert.match(f.C.snapshot(f.game).next, /LOCK again/);
});
test('real checkpoint fixes take precedence over attack designation and preserve their navigation meaning', () => {
  const f = fixture(); f.game.world.route = [{ label: 'Coast bend', p: [1852, 0, 8000] }];
  const d = f.C.snapshot(f.game); assert.equal(d.step, 'fix'); assert.equal(d.checkpoint.bearing, '090'); assert.equal(d.checkpoint.rangeNM, 1); assert.match(d.next, /not the attack target/);
});
test('designation delegates unchanged production LOCK at the same crosshairs, never slewing or releasing', () => {
  const f = fixture(); let calls = 0;
  f.game.app.lockTarget = () => { calls++; f.game.world.designated = { p: [10, 0, 0], label: 'MANUAL POINT' }; f.game.world.lock = true; };
  f.C.install({ App: f.game.app }); f.C.interpret(f.game, 'linear'); f.C.mark(f.game);
  const cursor = f.game.hud.cross.slice(); assert.equal(f.C.designate(f.game), true); assert.equal(calls, 1);
  assert.deepEqual(f.game.hud.cross, cursor); assert.equal(f.game.ac.bombs, 12); assert.equal(f.game.world.score.dropped, 0); assert.equal(f.C.snapshot(f.game).notes[0].designation, 'MANUAL POINT');
});
test('pause, closed scope, another game and damaged DIANE cannot invoke production LOCK', () => {
  for (const mutate of [g => g.paused = true, g => g.hud.scope = false, g => g.app.game = {}, g => g.ac.dmg.diane = .9]) {
    const f = fixture(); let calls = 0; f.game.app.lockTarget = () => calls++; f.C.install({ App: f.game.app }); mutate(f.game);
    assert.equal(f.C.designate(f.game), false); assert.equal(calls, 0);
  }
});
test('attack guidance reads real ASQ-61 validity and azimuth without calculating an extra solution', () => {
  const f = fixture(); f.game.world.designated = { p: [0, 0, 0], label: 'Depot' };
  assert.equal(f.C.snapshot(f.game).step, 'solution'); f.game.sol = { valid: true, tRel: 4.25, az: .05, tof: 8 };
  assert.equal(f.C.snapshot(f.game).step, 'align'); f.game.sol.az = 0;
  const d = f.C.snapshot(f.game); assert.equal(d.step, 'consent'); assert.equal(d.solution.releaseSeconds, 4.25); assert.match(d.next, /ASQ-61 chooses release/);
  f.game._relArm = 0; assert.equal(f.C.snapshot(f.game).step, 'observe'); assert.match(f.C.snapshot(f.game).next, /Do not orbit under fire/);
});
test('weapons-tight sorties preserve identification by actual overflight and never authorize consent', () => {
  const f = fixture(); f.game.mis.type = 'recce'; f.game.mis.noRelease = true;
  const d = f.C.snapshot(f.game); assert.equal(d.step, 'identify'); assert.match(d.next, /Keep COMMIT released/); assert.equal(f.game.world.score.dropped, 0);
});
test('unarmed carrier practice remains navigation practice rather than a falsely completed attack', () => {
  const f = fixture(); f.game.mis.type = 'carrier_only'; f.game.ac.bombs = 0;
  const d = f.C.snapshot(f.game); assert.equal(d.step, 'navigation'); assert.match(d.next, /no attack stores or targets assigned/);
});
test('A-6B Iron Hand remains separately identified and no internal aircraft gun is invented', () => {
  const f = fixture(); f.game.mis.type = 'ironhand'; f.game.mis.brief.ac = 'A-6B Intruder'; f.game.ac.arms = 2; f.game.world.radar = { alive: true, emitting: false };
  assert.match(f.C.snapshot(f.game).next, /existing A-6B|Existing A-6B/); assert.match(f.C.snapshot(f.game).next, /silent/);
  f.game.world.radar.emitting = true; assert.match(f.C.snapshot(f.game).next, /does not fire a gun/); assert.equal(f.game.ac.arms, 2);
});
test('production World.fireArm counts accepted missiles separately and drives honest Iron Hand observation/debrief', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'), start = html.indexOf('  fireArm(ac) {'), end = html.indexOf('  /* ---------------- DIANE ballistics', start);
  assert.ok(start > 0 && end > start, 'Unchanged production fireArm method boundary');
  // Vector helpers are explicit launch-geometry fixtures. The inventory gate,
  // actual missile creation and accepted-launch counter execute production
  // World.fireArm, not a hand-written notification of a hypothetical launch.
  const sandbox = vm.createContext({ bodyAxes: () => ({ fwd: [0, 0, -1], right: [1, 0, 0] }), vadd: (a, b) => a.map((v, i) => v + b[i]), vmul: (a, n) => a.map(v => v * n) });
  vm.runInContext('globalThis.ActualWorld = class {\n' + html.slice(start, end) + '\n};', sandbox);
  const f = fixture(); f.game.mis.type = 'ironhand'; f.game.mis.brief.ac = 'A-6B Intruder'; f.game.ac.arms = 2; f.game.ac.pitch = 0;
  f.game.world.arms = []; f.game.world.radar = { p: [0, 0, 0], alive: true, emitting: true };
  f.C.interpret(f.game, 'cluster'); assert.equal(f.C.mark(f.game).ok, true);
  const originalScore = { ...f.game.world.score };
  assert.equal(sandbox.ActualWorld.prototype.fireArm.call(f.game.world, f.game.ac), true); assert.equal(f.game.ac.arms, 1); assert.equal(f.game.world.arms.length, 1);
  let d = f.C.snapshot(f.game); assert.equal(d.stores.released, 1); assert.equal(d.stores.armsReleased, 1); assert.equal(d.stores.bombsReleased, 0); assert.equal(d.step, 'observe-arm');
  assert.match(d.next, /not confirmation/); assert.equal(f.game.world.score.hits, originalScore.hits); assert.equal(f.game.world.score.killed, originalScore.killed);
  f.game.world.arms.length = 0; d = f.C.snapshot(f.game); assert.equal(d.step, 'arm'); assert.match(d.next, /1 ARM launched/);
  assert.equal(sandbox.ActualWorld.prototype.fireArm.call(f.game.world, f.game.ac), true); assert.equal(sandbox.ActualWorld.prototype.fireArm.call(f.game.world, f.game.ac), false);
  assert.equal(f.game.world.score.armsReleased, 2); assert.equal(f.game.world.score.dropped, 0); assert.equal(f.game.ac.arms, 0);
  f.C.tick(f.game, .1); const report = f.C.debrief(f.game); assert.equal(report.released, 2); assert.equal(report.armsReleased, 2); assert.equal(report.bombsReleased, 0); assert.equal(report.impacts, 0);
  assert.match(report.note, /do not establish a missile hit or radar kill/);
});
test('mixed accepted bomb and ARM expenditure is totaled without moving ARM launches into bomb grading', () => {
  const f = fixture(); f.C.interpret(f.game, 'cluster'); f.C.mark(f.game); f.game.world.score.dropped = 4; f.game.world.score.armsReleased = 1; f.game.world.score.hits = 2; f.game.world.score.misses = 2;
  const before = unchanged(f.game); f.C.tick(f.game, .1); const d = f.C.snapshot(f.game), report = f.C.debrief(f.game);
  assert.equal(d.stores.released, 5); assert.equal(d.stores.bombsReleased, 4); assert.equal(d.stores.armsReleased, 1); assert.equal(report.released, 5); assert.equal(report.impacts, 4); assert.equal(unchanged(f.game), before);
});
test('release and impact disposition is measured from original score, not invented visibility or bonus kills', () => {
  const f = fixture(); f.C.interpret(f.game, 'cluster'); f.C.mark(f.game); f.game.world.score.dropped = 4; f.game.world.score.hits = 2; f.game.world.score.misses = 2; f.game.world.score.cep = [10, 20];
  f.C.tick(f.game, .1); const d = f.C.debrief(f.game); assert.equal(d.released, 4); assert.equal(d.impacts, 4); assert.equal(d.killed, 0); assert.ok(Math.abs(d.meanMissYd - 16.4041995) < .00001);
  assert.match(d.note, /do not establish what the crew could see/);
});
test('the worksheet and ticks never mutate aircraft, target states, controller input, stores or mission grade', () => {
  const f = fixture(); hard(f); const before = unchanged(f.game);
  f.C.setOpen(f.game, true); f.C.interpret(f.game, 'cluster'); f.C.mark(f.game);
  for (let i = 0; i < 40; i++) f.C.tick(f.game, .05);
  f.C.snapshot(f.game); f.C.debrief(f.game); assert.equal(unchanged(f.game), before);
});
test('notes are bounded, independent across sorties and reset without altering mission progress', () => {
  const f = fixture(); f.C.interpret(f.game, 'cluster');
  for (let i = 0; i < 15; i++) { f.game.t = i; assert.equal(f.C.mark(f.game).ok, true); }
  assert.equal(f.C.snapshot(f.game).notes.length, 10); assert.equal(f.C.debrief(f.game).correlations, 15);
  const g2 = fixture().game; assert.equal(f.C.snapshot(g2).notes.length, 0); const before = unchanged(f.game);
  f.C.reset(f.game); assert.equal(f.C.snapshot(f.game).notes.length, 0); assert.equal(unchanged(f.game), before);
});
// A small DOM fixture verifies production-control delegation and prevents
// form events from reaching the flight's keyboard weapon controls.
function dom() {
  const ids = new Map();
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; this.classList = { contains: () => false }; this.value = ''; this.textContent = ''; this.blurred = false; }
    set id(v) { this._id = v; ids.set(v, this); } get id() { return this._id; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(k, v) { this.attributes[k] = v; }
    addEventListener(k, fn) { this.listeners[k] = fn; }
    blur() { this.blurred = true; }
    getBoundingClientRect() { return { left: 10, right: 110, top: 20, bottom: 70 }; }
    querySelector(selector) { const key = selector.slice(1, -1); const walk = n => n.attributes[key] !== undefined ? n : n.children.map(walk).find(Boolean); return walk(this) || null; }
  }
  const host = new Node('section'); host.id = 'game'; const debrief = new Node('div'); debrief.id = 'debriefBody';
  return { document: { createElement: tag => new Node(tag), getElementById: id => ids.get(id) || null }, ids };
}
test('native DOM controls stay initially collapsed and delegate real scope/lock only once per click', () => {
  const d = dom(), f = fixture(d.document); let scopes = 0, locks = 0;
  f.game.app.toggleScope = () => { scopes++; f.game.hud.scope = !f.game.hud.scope; }; f.game.app.lockTarget = () => locks++;
  f.C.install({ App: f.game.app }); f.C.render(f.game); const box = d.ids.get('flightStrikeBoard'), panel = d.ids.get('flightStrikePanel'); assert.equal(panel.hidden, true);
  const click = n => n.onclick({ stopPropagation() {}, currentTarget: n }); click(d.ids.get('flightStrikeBoardToggle')); assert.equal(panel.hidden, false);
  click(box.querySelector('[data-strike-lock]')); assert.equal(locks, 1); click(box.querySelector('[data-strike-scope]')); assert.equal(scopes, 1); assert.equal(f.game.hud.scope, false);
  assert.equal(box.querySelector('[data-strike-lock]').blurred, true); assert.equal(f.game.world.score.dropped, 0);
});
function touchControl(n) {
  const event = extra => Object.assign({ pointerType: 'touch', pointerId: 1, clientX: 50, clientY: 40, detail: 1, currentTarget: n, stopPropagation() {} }, extra);
  return { send: (type, extra) => n.listeners[type]?.(event(extra)), click: extra => n.onclick(event(extra)),
    tap() { this.send('pointerdown'); this.send('pointerup'); } };
}
test('all four worksheet buttons activate a real released touch without a compatibility click and deduplicate generated clicks', () => {
  const d = dom(), f = fixture(d.document); hard(f); let scopes = 0, locks = 0;
  f.game.app.toggleScope = () => scopes++; f.game.app.lockTarget = () => locks++;
  f.C.install({ App: f.game.app }); f.C.interpret(f.game, 'cluster');
  const box = d.ids.get('flightStrikeBoard'), toggle = touchControl(d.ids.get('flightStrikeBoardToggle'));
  toggle.tap(); assert.equal(f.C.snapshot(f.game).open, true); toggle.click(); assert.equal(f.C.snapshot(f.game).open, true);
  for (const [selector, check] of [['[data-strike-scope]', () => scopes], ['[data-strike-lock]', () => locks], ['[data-strike-mark]', () => f.C.snapshot(f.game).notes.length]]) {
    const control = touchControl(box.querySelector(selector)); control.tap(); assert.equal(check(), 1, selector); control.click(); assert.equal(check(), 1, selector + ' generated click');
  }
});
test('worksheet scrolling, cancelled touches and releases outside the button do not activate', () => {
  for (const mode of ['drag', 'cancel', 'outside']) {
    const d = dom(), f = fixture(d.document); f.C.install({ App: f.game.app }); const c = touchControl(d.ids.get('flightStrikeBoardToggle'));
    c.send('pointerdown');
    if (mode === 'drag') { c.send('pointermove', { clientX: 80 }); c.send('pointermove', { clientX: 50 }); }
    if (mode === 'cancel') c.send('pointercancel');
    c.send('pointerup', mode === 'outside' ? { clientX: 120 } : {}); c.click(); assert.equal(f.C.snapshot(f.game).open, false, mode);
  }
});
test('keyboard activation and genuine mouse clicks remain available immediately after a touch', () => {
  const d = dom(), f = fixture(d.document); f.C.install({ App: f.game.app }); const c = touchControl(d.ids.get('flightStrikeBoardToggle'));
  c.tap(); assert.equal(f.C.snapshot(f.game).open, true);
  c.click({ pointerType: undefined, detail: 0 }); assert.equal(f.C.snapshot(f.game).open, false);
  c.click({ pointerType: 'mouse', detail: 1 }); assert.equal(f.C.snapshot(f.game).open, true);
  c.tap(); assert.equal(f.C.snapshot(f.game).open, false);
});
test('disabled buttons, unmatched releases and overlapping pointers cannot open the worksheet', () => {
  for (const mode of ['disabled', 'unmatched', 'overlap']) {
    const d = dom(), f = fixture(d.document); f.C.install({ App: f.game.app }); const n = d.ids.get('flightStrikeBoardToggle'), c = touchControl(n);
    if (mode === 'disabled') { n.disabled = true; c.tap(); c.click(); }
    if (mode === 'unmatched') c.send('pointerup');
    if (mode === 'overlap') { c.send('pointerdown'); c.send('pointerdown', { pointerId: 2 }); c.send('pointerup'); c.send('pointerup', { pointerId: 2 }); c.click(); }
    assert.equal(f.C.snapshot(f.game).open, false, mode);
  }
});
test('worksheet form keyboard events stop propagation but retain native input behavior', () => {
  const d = dom(), f = fixture(d.document); f.C.install({ App: f.game.app });
  let stopped = 0; const box = d.ids.get('flightStrikeBoard'); const select = d.ids.get('flightStrikeInterpretation');
  box.listeners.keydown({ target: select, stopPropagation() { stopped++; } }); box.listeners.keyup({ target: { tagName: 'BUTTON' }, stopPropagation() { stopped++; } });
  assert.equal(stopped, 2); assert.equal(f.game.app.keys.Space, undefined);
});
test('an expanded worksheet disappears on pause, graphics-context loss, captivity and menu cleanup', () => {
  for (const mutate of [g => g.paused = true, g => g.app.graphicsContextLost = true, g => g.pow = {}, g => g.app.screen = 'ready']) {
    const d = dom(), f = fixture(d.document); f.C.install({ App: f.game.app }); f.C.setOpen(f.game, true); const box = d.ids.get('flightStrikeBoard'); assert.equal(box.hidden, false);
    mutate(f.game); f.C.render(f.game); assert.equal(box.hidden, true); assert.equal(d.ids.get('flightStrikePanel').hidden, true);
  }
  const d = dom(), f = fixture(d.document); f.C.install({ App: f.game.app }); f.C.setOpen(f.game, true); f.C.render(null); assert.equal(d.ids.get('flightStrikeBoard').hidden, true);
});
test('debrief DOM uses text nodes, appends actual evidence once and preserves authored-history distinction', () => {
  const d = dom(), f = fixture(d.document); f.C.install({ App: f.game.app }); f.C.interpret(f.game, 'cluster'); f.C.mark(f.game);
  assert.equal(f.C.appendDebrief(f.game), true); assert.equal(f.C.appendDebrief(f.game), false);
  const host = d.ids.get('debriefBody'), report = host.querySelector('[data-strike-report]'); assert.ok(report); assert.match(report.children.at(-1).textContent, /not historical testimony/);
});
let failed = 0;
for (const t of tests) { try { t.run(); console.log('PASS ' + t.name); } catch (e) { failed++; console.error('FAIL ' + t.name + '\n' + e.stack); } }
console.log(JSON.stringify({ suite: 'strike-board-domain-and-dom', passed: tests.length - failed, failed, total: tests.length }));
if (failed) process.exitCode = 1;
