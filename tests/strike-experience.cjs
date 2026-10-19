'use strict';
// Production presentation, flight-checkpoint and original pilot-guidance logic
// in a Node VM. DOM events below are explicit domain fixtures, not native
// browser controls, a WebGL render or physical Windows/iPhone validation.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const base = path.join(__dirname, '..'), html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(options = {}) {
  let seed = 17;
  const math = Object.create(Math); math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const nodes = new Map(), storage = new Map(), calls = [], effects = [];
  class Node {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.listeners = {}; this.classes = new Set(); this.hidden = false;
      this.classList = { add: (...v) => v.forEach(x => this.classes.add(x)), remove: (...v) => v.forEach(x => this.classes.delete(x)),
        toggle: (x, on) => { const yes = on === undefined ? !this.classes.has(x) : !!on; yes ? this.classes.add(x) : this.classes.delete(x); return yes; }, contains: x => this.classes.has(x) }; }
    set id(id) { this._id = id; nodes.set(id, this); } get id() { return this._id; }
    setAttribute(k, v) { this[k] = String(v); }
    focus() { document.activeElement = this; }
    blur() { this.blurCount = (this.blurCount || 0) + 1; if (document.activeElement === this) document.activeElement = null; }
    append(...items) { for (const n of items) { n.parentNode = this; this.children.push(n); } }
    prepend(...items) { for (const n of items.reverse()) { n.parentNode = this; this.children.unshift(n); } }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    querySelector(selector) { return selector[0] === '#' && this.children.some(c => c.id === selector.slice(1) || c.querySelector(selector)) ? nodes.get(selector.slice(1)) : null; }
  }
  const document = { body: new Node('body'), activeElement: null, createElement: tag => new Node(tag), getElementById: id => nodes.get(id) || null };
  for (const id of ['game', 'briefBody', 'pauseBody', 'debriefBody', 'btnScope', 'btnGear', 'teach', 'teachPeek', 'legend']) { const n = new Node(); n.id = id; document.body.append(n); }
  const window = { WillardPresentation: { bindButton: (n, fn) => { n.action = fn; } },
    FlightStrikeCrew: { install: () => calls.push('crew-install'), render: () => {}, tick: () => {}, dispose: g => calls.push(['dispose', g]) },
    FlightStrikeBoard: { snapshot: () => ({ open: false }) }, FlightStrikeEffects: { inspect: () => ({ targets: effects }), clear: () => calls.push('effects-clear') } };
  const flat = () => 40;
  const sandbox = { window, document, Math: math, Number, Float32Array, Map, TAU: Math.PI * 2, PI: Math.PI, DEG: Math.PI / 180, RAD: 180 / Math.PI,
    MS2KT: 1.943844492, M2FT: 3.28084, TER: {}, CV: { deckY: 19, angle: -9.5 * Math.PI / 180, aim: 72, wire: [96,84,72,60], ramp: 142 },
    terrainH: flat, coastAt: () => 6000, fbm: () => .5,
    smoothstep: (a,b,x) => { const t = Math.max(0, Math.min(1, (x-a)/(b-a))); return t*t*(3-2*t); },
    rnd: (a,b) => a+(b-a)*math.random(), clamp: (n,a,b) => Math.max(a, Math.min(b,n)), findFlat: (x,z) => [x,40,z],
    vadd: (a,b) => a.map((v,i) => v+b[i]), vmul: (a,s) => a.map(v => v*s), vdist: (a,b) => Math.hypot(...a.map((v,i) => v-b[i])),
    bodyAxes: () => ({ right:[1,0,0], up:[0,1,0], fwd:[0,0,-1] }),
    FX: class { clear() {} explosion() {} },
    setTimeout() { throw Error('The guided presentation must not own timers'); }, setInterval() { throw Error('The guided presentation must not own intervals'); } };
  vm.createContext(sandbox);
  const missionStart = html.indexOf('const MISSIONS = ['), missionEnd = html.indexOf('\n];', missionStart);
  vm.runInContext(html.slice(missionStart, missionEnd) + '\n];\nglobalThis.missions=MISSIONS;', sandbox);
  vm.runInContext(html.slice(html.indexOf('function newAircraft() {'), html.indexOf('function acStep(')) + '\nglobalThis.aircraft=newAircraft;', sandbox);
  vm.runInContext(html.slice(html.indexOf('class World {'), html.indexOf('/* ===== src/09-chart.js ===== */')) + '\nglobalThis.WorldClass=World;', sandbox);
  const localStart = html.indexOf('function localToWorld('), localEnd = html.indexOf('// Aircraft body->world', localStart);
  vm.runInContext(html.slice(localStart, localEnd), sandbox);
  const autoStart = html.indexOf('  autoFly(dt, ac, W) {'), autoEnd = html.indexOf('  /* ---------------- flying it', autoStart);
  vm.runInContext('globalThis.flightMethods={' + html.slice(autoStart, autoEnd) + '};', sandbox);
  for (const name of ['strike-checkpoint', 'strike-experience']) vm.runInContext(fs.readFileSync(path.join(base, 'assets/flight', name + '.js'), 'utf8'), sandbox);
  const E = window.FlightStrikeExperience, C = window.FlightStrikeCheckpoint;
  const Store = { get: (k,d) => storage.has(k) ? clone(storage.get(k)) : d, set: (k,v) => storage.set(k, clone(v)) };
  const App = { _missionStart: 0, screen: 'game', graphicsContextLost: false, set: { sound: 0 }, game: null,
    radio(...args) { calls.push(['radio',...args]); },
    start(mis) { calls.push(['original-start', mis]); this._missionStart++; this.game = make(mis); E.begin(this.game); return 'original-start-result'; },
    brief(mis) { calls.push(['brief', mis]); return 'brief-result'; }, renderOps() { return 'ops-result'; },
    show(name) { this.screen = name; return 'show-result'; }, pause(on) { this.game.paused = on; return 'pause-result'; } };
  function make(mis = sandbox.missions.find(m => m.id === 'm2')) {
    const world = new sandbox.WorldClass(mis, { quality: 0 }, .55), ac = sandbox.aircraft();
    const g = { app: App, mis, world, ac, hud: { scope: false, cross: [.1,.45], radar: { maxR:18520, reset() { calls.push('radar-reset'); } } },
      rend: { eye: [0,740,0] }, bombsMax: 12, armsMax: 0, t: 0, phase: 'deck', paused:false, departed:false,
      rightSeat:false, extView:false, ripple:4, masterArm:false, apAGL:700, steer:null, egressCalled:false, aclsCoupled:false,
      result:null, taught:{}, ev:{}, approachLog:[], _ahead:()=>0 };
    g.autoFly = sandbox.flightMethods.autoFly; return g;
  }
  const context = { App, Store, missions: sandbox.missions, terrainH: options.terrainH || flat };
  assert.equal(E.install(context), true);
  if (options.start !== false) assert.equal(E.start({ tutorial: options.tutorial !== false }), true);
  function air(g = App.game) {
    const target = g.world.briefed; g.ac.p = [target[0],740,target[2]+11000]; g.ac.v=[0,0,-160]; g.ac.yaw=0;
    g.ac.onDeck=false; g.ac.gear=false; g.ac.hook=false; g.ac.cat=0; g.ac.ias=160; g.ac.radalt=700;
    g.phase='airborne'; g.departed=true; g.rend.eye=g.ac.p.slice(); return g;
  }
  function action(id) { assert(nodes.get(id)?.action, id + ' is bound'); return nodes.get(id).action({stopPropagation(){}}); }
  return { E, C, App, Store, context, game:App.game, make, air, action, nodes, document, calls, effects, storage, sandbox };
}
const flightState = g => clone({ ac:g.ac, score:g.world.score, targets:g.world.targets, designated:g.world.designated,
  lock:g.world.lock, wire:g.wire??null, result:g.result, phase:g.phase, approachLog:g.approachLog });

test('the guided workflow is opt-in and preserves ordinary m2 and unrelated mission startup', () => {
  const f=fixture({start:false});
  for(const id of ['m2','m3']) { const mis=f.context.missions.find(m=>m.id===id); assert.equal(f.App.start(mis),'original-start-result');
    assert.equal(f.App.game.mis,mis); assert.equal(f.App.game.strikeExperience,undefined); assert.equal(f.App.game.rightSeat,false); assert.equal(f.App.game.ripple,4); assert.equal(f.E.view(f.App.game),null); }
});
test('guided launch retains the original mission identity, deck launch, stores and original App lifetime token', () => {
  const f=fixture(),g=f.game; assert.equal(g.mis,f.context.missions.find(m=>m.id==='m2')); assert.equal(g.ac.onDeck,true);
  assert.equal(g.rightSeat,true); assert.equal(g.hud.scope,true); assert.equal(g.ripple,2); assert.equal(g.ac.bombs,12);
  assert.equal(g.world.score.dropped,0); assert.equal(g.world.score.killed,0); assert.equal(f.App._dixieLaunch,null);
  assert.equal(f.App._missionStart,1); assert.equal(f.E.view(g).phase,'navigation');
});
test('stale launch ownership and unrelated constructors cannot consume or activate a guided request', () => {
  const f=fixture({start:false}); f.App._missionStart=4; f.App._dixieLaunch={token:3,tutorial:true};
  const g=f.make(); assert.equal(f.E.begin(g),false); assert.equal(g.strikeExperience,undefined);
  f.App._dixieLaunch.token=4; const other=f.make(f.context.missions.find(m=>m.id==='m3'));
  assert.equal(f.E.begin(other),false); assert.equal(other.strikeExperience,undefined); assert.equal(f.App._dixieLaunch.token,4);
});
test('missing or malformed saved progress fails before starting or replacing a live mission', () => {
  const f=fixture(),g=f.game,before=f.App._missionStart;
  for(const saved of [{},{version:1,missionId:'m2'},[],{label:'victory',experience:{completed:true}}]) assert.equal(f.E.start({saved}),false);
  assert.equal(f.App.game,g); assert.equal(f.App._missionStart,before); assert.equal(f.E.retry(g),false);
});
test('short practice is explicitly airborne, clears sampled terrain and does not award or replenish anything', () => {
  const f=fixture({start:false,terrainH:()=>430}); assert(f.E.start({practice:true})); const g=f.App.game;
  assert.equal(g.ac.onDeck,false); assert.equal(g.phase,'airborne'); assert.equal(g.departed,true);
  assert.equal(g.ac.p[1],1130); assert.ok(Math.abs(Math.hypot(g.ac.v[0],g.ac.v[2])-160)<1e-8);
  assert.equal(g.ac.bombs,12); assert.equal(g.ac.fuel,8000); assert.equal(g.world.score.hits,0); assert.equal(g.world.score.killed,0);
  assert.equal(g.result,null); assert.equal(g.wire,undefined);
});
test('elapsed time alone cannot destroy targets, release weapons, grant observations or complete a sortie', () => {
  const f=fixture(),g=f.air(),before=flightState(g); f.E.tick(g,1200);
  assert.deepEqual(flightState(g),before); assert.equal(f.E.view(g).observed,false); assert.equal(g.strikeExperience.completed,false);
  assert.equal(g.strikeExperience.elapsed,1200); assert.equal(g.result,null);
});
test('a nearer briefed area guides acquisition, while a real locked designation is required for run-in', () => {
  const f=fixture(),g=f.air(); g.ac.p[2]-=2100; f.E.tick(g,.1); assert.equal(f.E.view(g).phase,'acquire');
  g.world.designated=g.world.targets[0]; g.world.lock=false; f.E.tick(g,.1); assert.equal(f.E.view(g).phase,'acquire');
  g.world.lock=true; const before=flightState(g); f.E.tick(g,.1); assert.equal(f.E.view(g).phase,'run-in'); assert.deepEqual(flightState(g),before);
});
test('original weapon release is presented as bombs away before an impact or a claimed hit', () => {
  const f=fixture(),g=f.air(); g.world.release(g.ac,2); const original=flightState(g); f.E.tick(g,.1);
  assert.equal(g.world.bombs.length,2); assert.equal(g.ac.bombs,10); assert.equal(f.E.view(g).phase,'release');
  assert.equal(g.strikeExperience.firstReleaseAt,.1); assert.equal(g.strikeExperience.impactAt,null); assert.equal(f.E.view(g).observed,false);
  assert.equal(g.world.score.hits,0); assert.deepEqual(flightState(g),original);
});
test('an original ballistic miss opens assessment without manufacturing visual evidence or target destruction', () => {
  const f=fixture(),g=f.air(); g.world.release(g.ac,1); f.E.tick(g,.1); g.world.bombs=[];
  g.world.detonate([1000000,40,1000000],1,18,18,'bomb'); const before=flightState(g); f.E.tick(g,.1);
  assert.equal(g.world.score.misses,1); assert.equal(g.world.score.hits,0); assert.equal(f.E.view(g).phase,'assess');
  assert.equal(f.E.view(g).observed,false); assert.equal(g.world.score.killed,0); assert.deepEqual(flightState(g),before);
});
test('HOME is a crew return intention and cannot fake target success, a wire, stores or a debrief', () => {
  const f=fixture(),g=f.air(),before=flightState(g); assert(f.E.returnHome(g));
  assert.equal(g.egressCalled,true); assert.equal(f.E.view(g).phase,'egress'); assert.ok(Number.isFinite(g.steer));
  assert.deepEqual(flightState(g),before); assert.equal(g.wire,undefined); assert.equal(g.result,null); assert.equal(f.C.saved().label,'egress');
});
test('another pass commands the original flown opening turn without moving the aircraft or restoring stores', () => {
  const f=fixture(),g=f.air(); g.world.designated=g.world.targets[1]; g.world.lock=true;
  const before=flightState(g); assert(f.E.anotherPass(g)); assert.equal(g._reattack,1); assert.equal(g.hud.scope,true);
  assert.deepEqual(flightState(g),before); assert.equal(f.E.view(g).phase,'acquire');
  for(const change of [()=>g.egressCalled=true,()=>{g.egressCalled=false;g.ac.bombs=0},()=>{g.ac.bombs=2;g.world.designated=null}]) {change(); assert.equal(f.E.anotherPass(g),false);}
});
test('single and ripple controls change only the original release quantity and respect pause', () => {
  const f=fixture(),g=f.air(),before=flightState(g); const seen=[];
  for(let i=0;i<4;i++){f.action('dixieRipple');seen.push(g.ripple);}
  assert.deepEqual(seen,[4,8,1,2]); assert.deepEqual(flightState(g),before); assert.equal(g.world.bombs.length,0);
  g.paused=true; f.action('dixieRipple'); assert.equal(g.ripple,2);
});
test('modeled DOM action buttons release their focus before flight consent can be pressed', () => {
  const f=fixture(),g=f.air(),ripple=f.nodes.get('dixieRipple'),before=flightState(g);
  ripple.focus(); assert.equal(f.document.activeElement,ripple); f.action('dixieRipple');
  assert.equal(f.document.activeElement,null); assert.equal(ripple.blurCount,1); assert.equal(g.ripple,4);
  assert.deepEqual(flightState(g),before);
  const look=f.nodes.get('dixieLook'); look.focus(); f.action('dixieLook');
  assert.equal(f.document.activeElement,null); assert.equal(look.blurCount,1); assert.equal(g.hud.scope,false);
});
test('LOOK OUT targets the player designation and returns to the previous scope without aircraft movement', () => {
  const f=fixture(),g=f.air(); g.world.designated=g.world.targets[0]; const before=flightState(g),p=g.world.designated.p.slice();
  assert.equal(f.E.takeLook(g),true); assert.equal(g.hud.scope,false); const cam=f.E.camera(g);
  assert.deepEqual(clone(cam.target),[p[0],p[1]+3,p[2]]); assert.ok(Math.hypot(...cam.eye.map((n,i)=>n-g.ac.p[i]))<5);
  assert.deepEqual(flightState(g),before); assert.equal(f.E.takeLook(g),false); assert.equal(g.hud.scope,true); assert.equal(f.E.camera(g),null);
  g.hud.scope=false; f.E.takeLook(g); f.E.takeLook(g); assert.equal(g.hud.scope,false);
});
test('an unobserved hidden or distant target cannot become a visual assessment from damage counters', () => {
  const f=fixture(),g=f.air(); g.world.designated=g.world.targets[0]; g.world.score.hits=5; g.world.score.killed=3;
  f.E.takeLook(g); f.E.tick(g,.1); assert.equal(f.E.view(g).observed,false);
  f.effects.push({p:g.world.designated.p.slice(),elapsed:1}); f.E.tick(g,.1); assert.equal(f.E.view(g).observed,false);
  assert.equal(g.strikeExperience.assessment,null);
});
test('line of sight rejects intervening terrain, dense weather, bad vectors and excessive range', () => {
  const f=fixture(),g=f.air(),eye=[0,700,2000],p=[0,40,0]; assert(f.E.canSeeAftermath(g,eye,p));
  f.context.terrainH=()=>900; assert.equal(f.E.canSeeAftermath(g,eye,p),false); f.context.terrainH=()=>40;
  g.mis={...g.mis,env:{...g.mis.env,fog:.66}}; assert.equal(f.E.canSeeAftermath(g,eye,p),false); g.mis.env.fog=.28;
  for(const bad of [[0,700,6000],[NaN,700,0],[0,Infinity,0]]) assert.equal(f.E.canSeeAftermath(g,bad,p),false);
  assert.equal(f.E.canSeeAftermath(g,eye,[0,NaN,0]),false);
});
test('only visible actual aftermath near the player designation is recorded, once, without changing score', () => {
  const f=fixture(),g=f.air(),p=g.world.targets[0].p.slice(); g.world.designated=g.world.targets[0];
  g.ac.p=[p[0],740,p[2]+2200]; g.rend.eye=g.ac.p.slice(); f.E.takeLook(g);
  f.effects.push({p:[p[0]+500,p[1],p[2]],elapsed:1}); f.E.tick(g,.1); assert.equal(f.E.view(g).observed,false);
  f.effects.push({p:p.slice(),elapsed:1}); const before=flightState(g); f.E.tick(g,.1);
  assert.equal(f.E.view(g).observed,true); assert.equal(g.strikeExperience.assessment.count,1); assert.match(g.strikeExperience.assessment.evidence,/only in the original debrief/);
  for(let i=0;i<30;i++)f.E.tick(g,.1); assert.equal(g.strikeExperience.observations.length,1); assert.deepEqual(flightState(g),before);
});
test('pause freezes presentation time, observations, checkpoint writes and actionable flight commands', () => {
  const f=fixture(),g=f.air(); g.world.designated=g.world.targets[0]; g.paused=true;
  const before=clone(g.strikeExperience),score=flightState(g),saved=f.C.saved();
  f.E.tick(g,100); assert.equal(f.E.takeLook(g),false); assert.equal(f.E.returnHome(g),false); assert.equal(f.E.anotherPass(g),false);
  assert.deepEqual(clone(g.strikeExperience),before); assert.deepEqual(flightState(g),score); assert.deepEqual(f.C.saved(),saved);
});
test('retired, menu-hidden and context-lost games cannot advance, command flight or overwrite a checkpoint', () => {
  for(const mode of ['retired','menu','lost']) { const f=fixture(),g=f.air(); g.world.designated=g.world.targets[0]; g.t=12;
    if(mode==='retired')f.App.game=f.make(); if(mode==='menu')f.App.screen='ready'; if(mode==='lost')f.App.graphicsContextLost=true;
    const before=clone(g.strikeExperience),score=flightState(g); f.E.tick(g,100);
    assert.equal(f.E.active(g),false); assert.equal(f.E.takeLook(g),false); assert.equal(f.E.returnHome(g),false); assert.equal(f.E.anotherPass(g),false);
    assert.deepEqual(clone(g.strikeExperience),before); assert.deepEqual(flightState(g),score); assert.equal(f.C.saved(),null);
    if(mode==='retired')assert.equal(f.E.retry(g),false);
  }
});
test('flight retry creates a new Game, preserves real saved damage and stores, and retires the old owner', () => {
  const f=fixture(),g=f.air(); g.t=37; g.world.t=37; g.ac.fuel=4123; g.ac.dmg.eng=.32;
  g.world.release(g.ac,2); g.world.bombs=[]; for(let i=0;i<2;i++)g.world.detonate([1000000,40,1000000],1,18,18,'bomb');
  g.strikeExperience.lastDropped=2; g.strikeExperience.lastImpacts=2; const saved=f.C.capture(g,'run-in'); assert(saved);
  const point=g.ac.p.slice(),before=f.App._missionStart; assert(f.E.retry(g)); const fresh=f.App.game;
  assert.notEqual(fresh,g); assert.equal(f.App._missionStart,before+1); assert.deepEqual(clone(fresh.ac.p),point);
  assert.equal(fresh.ac.fuel,4123); assert.equal(fresh.ac.dmg.eng,.32); assert.equal(fresh.ac.bombs,10); assert.equal(fresh.world.score.misses,2);
  assert.equal(fresh.strikeExperience.retries,1); assert.equal(fresh.result,null); assert.equal(fresh.wire,undefined); assert.equal(f.E.retry(g),false);
  assert(f.calls.some(c=>Array.isArray(c)&&c[0]==='dispose'&&c[1]===g));
});
test('public workflow readbacks are detached and guidance toggles cannot award success', () => {
  const f=fixture(),g=f.air(),before=flightState(g),v=f.E.view(g); v.targetArea[0]=900000; v.nextFix.p[0]=900000;
  assert.notEqual(g.world.briefed[0],900000); assert.notEqual(g.world.route[g.world.rtIdx].p[0],900000);
  assert(f.E.setTutorial(g,false)); assert.equal(f.E.view(g).tutorial,false); assert.match(f.E.view(g).objective,/original navigation/);
  assert.deepEqual(flightState(g),before); assert.equal(g.strikeExperience.completed,false);
});
test('an actual production cockpit hit that incapacitates the pilot presents manual emergency guidance without repair or rescue', () => {
  const f=fixture(),g=f.air(); f.App.keys={KeyW:1,Space:0}; f.App.gctl={pitch:.2,roll:-.3,commit:0};
  // Deterministic damage-location fixture: use the real World damage and
  // crew-injury routines, selecting a cockpit hit on the pilot's seat.
  f.sandbox.Math.random=()=>0; g.world.hitAircraft(g.ac,1,'saf');
  assert.equal(g.ac.crew.pilot,0); assert.equal(g.ac.crew.bn,1); assert.equal(g.ac.alive,true); assert.equal(g.world.score.damage,1);
  const before=flightState(g),controls=clone({keys:f.App.keys,gctl:f.App.gctl});
  f.E.tick(g,.1); const v=f.E.view(g); assert.match(v.title,/EMERGENCY.*PILOT CANNOT FLY/);
  assert.match(v.objective,/flight stick or W\/A\/S\/D/); assert.match(v.objective,/terrain/); assert.match(v.objective,/EJECT remains available/);
  f.E.setTutorial(g,false); assert.match(f.E.view(g).title,/EMERGENCY/); assert.match(f.E.view(g).objective,/You have the aircraft/);
  assert.deepEqual(flightState(g),before); assert.deepEqual(clone({keys:f.App.keys,gctl:f.App.gctl}),controls);
  assert.equal(g.result,null); assert.equal(g.wire,undefined); assert.equal(g.rescuedOK,undefined); assert.equal(g.ac.crew.pilot,0);
});
test('installation is idempotent and preserves original return values without adding timers', () => {
  const f=fixture(),start=f.App.start,pause=f.App.pause,show=f.App.show;
  assert.equal(f.E.install(f.context),false); assert.equal(f.App.start,start); assert.equal(f.App.pause,pause); assert.equal(f.App.show,show);
  assert.equal(f.App.brief(f.game.mis),'brief-result'); assert.equal(f.App.show('game'),'show-result'); assert.equal(f.App.pause(false),'pause-result');
});

function placeDeck(f, ax, ay, az, headingOffset=0) {
  const g=f.air(), cv=f.sandbox.CV, c=g.world.carrier; c.p=[0,19,0]; c.hdg=270*Math.PI/180; c.heave=0;
  const ca=Math.cos(cv.angle),sa=Math.sin(cv.angle); g.ac.p=f.sandbox.localToWorld(c.p,c.hdg,ax*ca+az*sa,ay,-ax*sa+az*ca);
  g.ac.yaw=c.hdg-cv.angle+headingOffset; g.ac.ias=100; g.egressCalled=true; g.shipRange=Math.hypot(g.ac.p[0],g.ac.p[2]);
  return g;
}
test('original pilot avoids premature guided ACLS capture on the bow and keeps a valid flown approach command', () => {
  const f=fixture(),g=placeDeck(f,0,110,-3000),before=g.ac.p.slice(); const out=g.autoFly(1/60,g.ac,g.world);
  assert.equal(g.aclsCoupled,false); assert.ok(Number.isFinite(out.hdg)); assert.ok(Number.isFinite(out.alt)); assert.deepEqual(clone(g.ac.p),clone(before));
});
test('guided ACLS capture rejects lateral, heading, height, short-final and range violations', () => {
  const bad=[[450,120,2100,0],[0,120,2100,Math.PI],[0,400,2100,0],[0,40,400,0],[0,500,8500,0]];
  for(const [x,y,z,h] of bad){const f=fixture(),g=placeDeck(f,x,y,z,h),out=g.autoFly(1/60,g.ac,g.world); assert.equal(g.aclsCoupled,false); assert.ok(Number.isFinite(out.hdg));}
});
test('guided ACLS captures a real stern approach and stays latched through the wires instead of rechecking its entry gate', () => {
  const f=fixture(),g=placeDeck(f,64,106,2129); g.autoFly(1/60,g.ac,g.world); assert.equal(g.aclsCoupled,true);
  const landed=placeDeck(f,8,2,100); landed.aclsCoupled=true; const out=landed.autoFly(1/60,landed.ac,landed.world);
  assert.equal(landed.aclsCoupled,true); assert.equal(out.hdg,undefined); assert.equal(landed.wire,undefined); assert.equal(landed.ac.onDeck,false);
  landed.shipRange=9100; landed.autoFly(1/60,landed.ac,landed.world); assert.equal(landed.aclsCoupled,false);
});
test('ordinary previous-mission ACLS capture rules remain unchanged by the opt-in correction', () => {
  const f=fixture(),g=placeDeck(f,0,110,-3000); delete g.strikeExperience; g.autoFly(1/60,g.ac,g.world); assert.equal(g.aclsCoupled,true);
});
