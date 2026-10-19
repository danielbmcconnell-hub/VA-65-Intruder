'use strict';
// Domain validation uses the production World layout, newAircraft, ordnance
// release and damage routines with explicitly flat terrain/visual fixtures.
// These are not browser, hardware or whole-sortie acceptance tests.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const src=fs.readFileSync(path.join(__dirname,'../assets/flight/strike-checkpoint.js'),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(seed=17){
  const math=Object.create(Math);math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const window={},storage=new Map(),sandbox={window,Math:math,Number,Float32Array,Map,TAU:Math.PI*2,PI:Math.PI,DEG:Math.PI/180,RAD:180/Math.PI,M2FT:3.28084,
    TER:{},CV:{deckY:20},terrainH:()=>40,coastAt:()=>6000,fbm:()=>.5,
    smoothstep:(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);},
    rnd:(a,b)=>a+(b-a)*math.random(),clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),findFlat:(x,z)=>[x,40,z],
    vadd:(a,b)=>a.map((v,i)=>v+b[i]),vmul:(a,s)=>a.map(v=>v*s),vdist:(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),
    bodyAxes:()=>({right:[1,0,0],up:[0,1,0],fwd:[0,0,-1]}),
    FX:class{constructor(){this.cleared=0;}clear(){this.cleared++;}explosion(){}},};
  vm.createContext(sandbox);vm.runInContext(src,sandbox);
  const start=html.indexOf('const MISSIONS = ['),end=html.indexOf('\n];',start);
  vm.runInContext(html.slice(start,end)+'\n];\nglobalThis.mis=MISSIONS.find(m=>m.id==="m2");',sandbox);
  vm.runInContext(html.slice(html.indexOf('function newAircraft() {'),html.indexOf('function acStep('))+'\nglobalThis.aircraft=newAircraft;',sandbox);
  vm.runInContext(html.slice(html.indexOf('class World {'),html.indexOf('/* ===== src/09-chart.js ===== */'))+'\nglobalThis.WorldClass=World;',sandbox);
  const C=window.FlightStrikeCheckpoint;C.configure({Store:{get:(k,d)=>storage.has(k)?storage.get(k):d,set:(k,v)=>storage.set(k,v)}});
  const world=new sandbox.WorldClass(sandbox.mis,{quality:0},.55),ac=sandbox.aircraft();
  ac.p=[-1000,740,400];ac.v=[-175,0,0];ac.yaw=Math.PI/2;ac.onDeck=false;ac.gear=false;ac.cat=0;ac.ias=175;ac.radalt=700;
  let resets=0;const hud={scope:true,cross:[.1,.45],radar:{maxR:18520,reset(){resets++;}}};
  const game={mis:sandbox.mis,world,ac,hud,bombsMax:12,armsMax:0,t:78,phase:'airborne',departed:true,rightSeat:true,extView:false,ripple:4,
    masterArm:false,apAGL:700,steer:Math.PI/2,egressCalled:false,aclsCoupled:false,taught:{airborne:1},ev:{coast:31},
    strikeExperience:{version:1,phase:'navigation',elapsed:70,phaseTime:70,tutorial:true,retries:0,checkedVisual:false,observations:[],events:[],
      lastDropped:0,lastImpacts:0,lastFixes:0,firstReleaseAt:null,impactAt:null,assessment:null,checkpointLabel:null,completed:false}};
  world.t=78;world.carrier.heave=.2;world.nav.lastX=ac.p[0];world.nav.lastZ=ac.p[2];
  return {C,game,world,ac,storage,sandbox,resets:()=>resets};
}

test('actual production Dixie world and aircraft generate a bounded detached persistent approach record',()=>{
 const f=fixture(),before=clone(f.game),saved=f.C.capture(f.game,'approach');assert(saved,'production-generated layout must capture');assert(f.C.valid(saved));
 assert(JSON.stringify(saved).length<200000);assert.deepEqual(clone(f.game),before);assert.equal(saved.world.targets.length,5);
 assert.deepEqual(clone(f.C.saved()),clone(saved));saved.aircraft.p[0]=0;assert.equal(f.game.ac.p[0],-1000);assert.notEqual(f.C.saved().aircraft.p[0],0);
});

test('real releases, damage, dead targets and navigation survive a differently randomized new world',()=>{
 const f=fixture();f.world.release(f.ac,4);f.world.bombs=[];f.world.designated=f.world.targets[0];f.world.lock=true;
 for(let i=0;i<4;i++)f.world.detonate(f.world.targets[0].p,1,18,18,'bomb');f.world.hitAircraft(f.ac,.16,'aaa');
 f.world.nav.ex=151;f.world.nav.ez=-71;f.world.nav.fixes=2;f.world.rtIdx=2;f.world.nav.flown=9400;f.world.navErrAtRelease=167.1;
 f.game._lastRel=77;f.game._relArm=0;f.game.strikeExperience.phase='egress';f.game.strikeExperience.lastDropped=4;
 const d=f.C.capture(f.game,'egress');assert(d);const fresh=fixture(819),wrong=fresh.world.targets[0].p.slice();
 assert.notDeepEqual(wrong,f.world.targets[0].p);const acRef=fresh.ac,worldRef=fresh.world,callback=()=>1;fresh.world.onHit=callback;
 fresh.world.bombs=[{p:[0,0,0]}];fresh.world.sams=[{p:[0,0,0]}];fresh.world._cells.set('old',1);
 assert(fresh.C.restore(fresh.game,d));assert.equal(fresh.game.ac,acRef);assert.equal(fresh.world,worldRef);assert.equal(fresh.world.onHit,callback);
 assert.deepEqual(clone(fresh.ac),clone(f.ac));assert.deepEqual(clone(fresh.world.targets),clone(f.world.targets));assert.deepEqual(clone(fresh.world.score),clone(f.world.score));
 assert.deepEqual(clone(fresh.world.scenery),clone(f.world.scenery));assert.deepEqual(clone(fresh.world.saf),clone(f.world.saf));
 assert.deepEqual(clone(fresh.world.threats),clone(f.world.threats));assert.deepEqual(clone(fresh.world.carrier),clone(f.world.carrier));
 assert.deepEqual(clone(fresh.world.nav),clone(f.world.nav));assert.equal(fresh.world.navErrAtRelease,167.1);
 assert.equal(fresh.world.designated,fresh.world.targets[0]);assert.equal(fresh.world.lock,true);assert.equal(fresh.game._relArm,0);
 assert.equal(fresh.game.t,f.game.t);assert.equal(fresh.world.t,f.world.t);assert.equal(fresh.game.bombsMax,12);assert.equal(fresh.ac.bombs,8);
 assert.equal(fresh.world.bombs.length,0);assert.equal(fresh.world.sams.length,0);assert.equal(fresh.world._cells.size,0);
 assert.equal(fresh.world.fx.cleared,1);assert.equal(fresh.resets(),1);assert.deepEqual(clone(fresh.game.hud.cross),clone(f.game.hud.cross));
});

test('the original catapult remaining-time undershoot remains valid and is preserved',()=>{
 const f=fixture();f.ac.cat=-1/60;const d=f.C.capture(f.game,'approach'),fresh=fixture();assert(d);assert(fresh.C.restore(fresh.game,d));assert.equal(fresh.ac.cat,-1/60);
});
test('all three allowed checkpoint labels persist genuine state without nested snapshots',()=>{
 for(const label of ['approach','run-in','egress']){const f=fixture();const d=f.C.capture(f.game,label);assert(d);assert.equal(d.label,label);assert.equal(d.experience.checkpointLabel,label);assert.equal(d.experience.aircraft,undefined);}
});
test('capture waits for released stores to finish; it cannot discard an outstanding weapon impact',()=>{
 const f=fixture();f.world.release(f.ac,1);assert.equal(f.C.capture(f.game,'run-in'),null);assert.equal(f.C.saved(),null);
});
test('capture rejects terminal, captured, deck and non-opt-in or unrelated mission contexts',()=>{
 for(const change of [g=>g.ac.onDeck=true,g=>g.ac.alive=false,g=>g.phase='done',g=>g.phase='evade',g=>g.phase='chute',g=>g.departed=false,
   g=>g.ac.cat=1,g=>g._capt=1,g=>g._capturePending=true,g=>g.ejected=true,g=>g._outOfAircraft=true,g=>g.evade={},g=>g.chute={},g=>g.pow={},
   g=>g.result={pass:true},g=>g.strikeExperience=null,g=>g.mis={id:'m3',type:'strike'},g=>g.mis={id:'m2',type:'escape'}]){
  const f=fixture();change(f.game);assert.equal(f.C.capture(f.game,'approach'),null);assert.equal(f.C.saved(),null);
 }
});
test('retired, hidden or context-lost games cannot replace a valid saved checkpoint',()=>{
 const f=fixture(),good=f.C.capture(f.game,'approach');assert(good);
 for(const app of [{game:{},screen:'game'},{game:f.game,screen:'ready'},{game:f.game,screen:'game',graphicsContextLost:true}]){
  f.game.app=app;assert.equal(f.C.capture(f.game,'egress'),null);assert.deepEqual(clone(f.C.saved()),clone(good));
 }
 f.game.app={game:f.game,screen:'game',graphicsContextLost:false};assert(f.C.capture(f.game,'run-in'));
});
test('retries never heal an engine, replenish fuel or stores, or manufacture target kills',()=>{
 const f=fixture();f.ac.fuel=2134;f.ac.dmg.eng=.7;f.ac.dmg.hyd=.4;f.ac.crew.bn=.55;f.world.release(f.ac,8);f.world.bombs=[];for(let i=0;i<8;i++)f.world.detonate([1000000,40,1000000],1,18,18,'bomb');
 const d=f.C.capture(f.game,'egress'),fresh=fixture(2);assert(d);assert(fresh.C.restore(fresh.game,d));
 assert.equal(fresh.ac.fuel,2134);assert.equal(fresh.ac.bombs,4);assert.equal(fresh.ac.dmg.eng,.7);assert.equal(fresh.ac.crew.bn,.55);
 assert.equal(fresh.world.score.killed,0);assert.equal(fresh.world.score.hits,0);assert(fresh.world.targets.every(t=>t.alive));
});
test('original director bonus convoy and its actual destroyed-truck accounting restore coherently',()=>{
 const f=fixture();const begin=html.indexOf('  director(dt, ac, W) {'),end=html.indexOf('  /* ---------------- the next thing to do',begin);
 vm.runInContext('globalThis.directorObject={'+html.slice(begin,end)+'};',f.sandbox);
 f.game.app={screen:'game',set:{assist:0},radio(){},audio:{burst(){}}};f.game.app.game=f.game;f.game.teach=()=>{};
 f.game.ac.p=[f.world.briefed[0]+8000,740,f.world.briefed[2]];f.game.shipRange=12000;
 f.sandbox.directorObject.director.call(f.game,1/60,f.ac,f.world);
 const bonus=f.world.targets.find(t=>t.bonus);assert(bonus,'production director must create its own convoy');
 f.world.release(f.ac,1);f.world.bombs=[];f.world.detonate(bonus.p,1,12,80,'bomb');assert(f.world.score.trucks>=1);
 const saved=f.C.capture(f.game,'run-in'),fresh=fixture(330);assert(saved);assert(fresh.C.restore(fresh.game,saved));
 assert.deepEqual(clone(fresh.world.convoy),clone(f.world.convoy));assert.equal(fresh.world.score.trucks,f.world.score.trucks);
 assert.deepEqual(clone(fresh.world.targets),clone(f.world.targets));assert.equal(fresh.world.score.total,5);assert.equal(fresh.ac.bombs,11);
});
test('manual and offset designations restore independently from primary target aliases',()=>{
 for(const point of [null,{p:[-500,40,810],label:'MANUAL POINT',alive:true,r:10},{p:[-500,40,810],label:'TARGET (OFFSET)',alive:true,r:30,offset:true}]){
  const f=fixture();f.world.designated=point;f.world.lock=!!point;const d=f.C.capture(f.game,'run-in'),fresh=fixture(4);assert(d);assert(fresh.C.restore(fresh.game,d));
  assert.deepEqual(clone(fresh.world.designated),point);if(point)assert(!fresh.world.targets.includes(fresh.world.designated));
 }
});
test('saved route, chart reference, terrain scar and scenery retain original world placement',()=>{
 const f=fixture(),d=f.C.capture(f.game,'approach'),fresh=fixture(111);assert(d);assert(fresh.C.restore(fresh.game,d));
 for(const k of ['route','briefed','oap','site','tgtCenter','ipoint','scenery','lights','siteLights'])assert.deepEqual(clone(fresh.world[k]??null),clone(f.world[k]??null));
 assert.deepEqual(clone(fresh.world.rend.tgtArea),[d.world.briefed[0],d.world.briefed[2],d.world.briefedR*.95]);
});
test('every corrupt record is rejected before any mutation of a fresh aircraft or world',()=>{
 const f=fixture(),record=f.C.capture(f.game,'approach');assert(record);
 const changes=[d=>d.version=9,d=>d.missionId='m3',d=>d.missionType='escape',d=>d.label='victory',d=>delete d.flight.t,d=>delete d.world.t,
   d=>d.flight.t=NaN,d=>d.aircraft.p[0]=Infinity,d=>d.aircraft.p=Array(3),d=>delete d.aircraft.p[1],d=>d.aircraft.p.extra=1,d=>d.aircraft.v[1]=NaN,d=>d.aircraft.dmg.eng=2,d=>delete d.aircraft.crew.bn,
   d=>d.aircraft.bombs=999,d=>d.aircraft.arms=2,d=>d.world.score.dropped=1,d=>d.world.score.killed=1,d=>d.world.score.total=6,
   d=>d.world.targets[0].hp=-1,d=>d.world.targets[0].alive=false,d=>d.world.targets[0].hp=100,d=>d.world.targets[0].hp0=999,
   d=>d.world.nav.rate=10,d=>d.world.nav.fixes=9,d=>d.world.targets[0].score=900,d=>d.world.rtIdx=9,d=>d.designation.index=999,d=>d.designation.point={p:[0,NaN,1],label:'POINT',alive:true,r:10},
   d=>d.station.range=1,d=>d.station.cross=[2,1],d=>d.experience.completed=true,d=>d.experience.phase='victory',d=>d.experience.checkpoint={record},
   d=>d.experience.retries=-1,d=>d.world.route=Array(9).fill(d.world.route[0]),d=>d.world.scenery=Array(601).fill(d.world.scenery[0])];
 for(const change of changes){const d=clone(record);change(d);const fresh=fixture(),before=clone(fresh.game);assert.equal(fresh.C.valid(d),false);assert.equal(fresh.C.restore(fresh.game,d),false);assert.deepEqual(clone(fresh.game),before);}
});
test('dangerous keys, unknown flight mutations, functions, cycles and excessive nesting are rejected',()=>{
 const f=fixture(),record=f.C.capture(f.game,'approach');assert(record);
 for(const mutate of [d=>{d.experience.__proto__={polluted:true};},d=>Object.defineProperty(d.world.site,'__proto__',{enumerable:true,value:{x:1}}),
   d=>d.experience.constructor={prototype:{polluted:true}},d=>d.flight.rescuedOK=true,d=>d.aircraft.result={pass:true},
   d=>d.experience.callback=()=>true,d=>d.experience.self=d.experience,d=>{let o=d.experience;for(let i=0;i<15;i++)o=o.child={};}]){
  const d=clone(record);mutate(d);assert.equal(f.C.valid(d),false);
 }
 assert.equal({}.polluted,undefined);
});
test('missing, malformed and overlarge persisted records fail closed without altering stored progress',()=>{
 const f=fixture();for(const v of [null,[],{},'bad',{version:1,missionId:'m2'}]){f.storage.set(f.C.key,v);assert.equal(f.C.saved(),null);}
 const d=f.C.capture(f.game,'approach');assert(d);d.experience.notes=Array(1000).fill('x'.repeat(2000));f.storage.set(f.C.key,d);assert.equal(f.C.saved(),null);
});
test('restore rejects another mission or a missing initialized experience atomically',()=>{
 const f=fixture(),d=f.C.capture(f.game,'approach');assert(d);
 for(const change of [g=>g.mis={id:'m3',type:'strike'},g=>g.mis={id:'m2',type:'escape'},g=>delete g.strikeExperience,g=>delete g.hud]){
  const fresh=fixture();change(fresh.game);const before=clone(fresh.game);assert.equal(fresh.C.restore(fresh.game,d),false);assert.deepEqual(clone(fresh.game),before);
 }
});
test('restored records detach all nested arrays and experience history from localStorage references',()=>{
 const f=fixture(),d=f.C.capture(f.game,'approach'),fresh=fixture();assert(d);assert(fresh.C.restore(fresh.game,d));
 const actual=clone(fresh.game);d.world.targets[0].p[0]=0;d.aircraft.dmg.eng=1;d.experience.events.push({name:'invented'});d.station.cross[0]=-1;
 assert.deepEqual(clone(fresh.game),actual);f.C.clear();assert.equal(f.C.saved(),null);assert.equal(f.storage.get(f.C.key),null);
});
test('camera, release latch, elapsed clocks and original callback ownership survive without old timers',()=>{
 const f=fixture();f.game.extView=true;f.game._lastRel=70;f.game._lastCommit=1;f.game._relArm=0;f.game.taught.locked=1;
 f.game.strikeExperience.events.push({at:71,name:'release'});const d=f.C.capture(f.game,'run-in'),fresh=fixture();assert(d);assert(fresh.C.restore(fresh.game,d));
 assert.equal(fresh.game.extView,true);assert.equal(fresh.game._relArm,0);assert.equal(fresh.game._lastCommit,0);assert.equal(fresh.game._lastRel,70);
 assert.equal(fresh.game.taught.locked,1);assert.deepEqual(clone(fresh.game.strikeExperience.events),[{at:71,name:'release'}]);
 assert.equal(fresh.game.result,null);assert.equal(fresh.game.paused,false);assert.equal(fresh.game.camSm,null);assert.equal(fresh.game.sol,null);
 assert.equal(d.app,undefined);assert.equal(d.world.onHit,undefined);assert.equal(d.world.fx,undefined);assert.equal(d.world._cells,undefined);
});
