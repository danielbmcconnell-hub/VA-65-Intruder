'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');

// Pure fixtures exercise the actual core, collision, patrol and chapter modules.
// They do not establish WebGL quality or physical Windows/iPhone performance.
function fixture() {
  const storage=new Map(),document={body:{classList:{toggle(){}}},getElementById(){return null;},pointerLockElement:null,activeElement:null};
  const window={document},sandbox={window,document,Date,console};vm.createContext(sandbox);
  for(const file of ['core.js','ai.js','regular-confinement.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow/',file),'utf8'),sandbox);
  const P=window.POW;P.mountUI=()=>{};P.updateUI=()=>{};P.activate=()=>{};
  P.ctx={terrainH:()=>0,Store:{get:(key,value)=>storage.has(key)?storage.get(key):value,set:(key,value)=>storage.set(key,JSON.parse(JSON.stringify(value)))}};
  const game={ac:{p:[0,2,0]},app:{keys:{},gctl:{},set:{sound:0}},world:{_cells:new Map()},setHour(hour){this.hour=hour;}};
  P.begin(game,'cell');
  game.pow.day=40;game.pow.captivity={captureDay:1,minute:970,observations:2,rewards:{car:30,architecture:31,city:33},tap:{received:2,sent:1}};
  game.pow.stats={physical:70,fatigue:20,resilience:65,morale:60,memory:65,hope:60};
  P.Captivity={advance(g,minutes){const c=g.pow.captivity;c.minute+=minutes;while(c.minute>=1440){c.minute-=1440;g.pow.day++;}}};
  const R=P.RegularConfinement;R.enter(game);return {P,R,game,storage,sandbox};
}
function relocate(game,x,z) {const b=game.pow.base;game.evade.p.splice(0,3,b[0]+x,b[1],b[2]+z);}
function away(game) {for(let i=0;i<game.evade.searchers.length;i++)game.evade.searchers[i].p=[25,game.pow.base[1],-35-i*.9];}
function openRoute(R,game) {away(game);R.observe(game);R.openCell(game);R.tool(game);R.workshop(game);for(let i=0;i<3;i++)R.hatch(game);R.gate(game);}

test('regular transfer eligibility requires elapsed time, distinct projects, contact, observation and recoverable condition',()=>{
  const {R,game}=fixture();assert(R.eligible(game));
  game.pow.day=14;assert(!R.eligible(game));assert(R.eligibility(game).missing.some(t=>t.includes('four weeks')));
  game.pow.day=40;delete game.pow.captivity.rewards.city;assert(!R.eligible(game));
  game.pow.captivity.rewards.city=33;game.pow.captivity.tap.sent=0;assert(!R.eligible(game));
  game.pow.captivity.tap.sent=1;game.pow.stats.physical=29;assert(!R.eligible(game));
  game.pow.stats.physical=40;game.pow.stats.fatigue=86;assert(!R.eligible(game));
  game.pow.stats.fatigue=30;assert(R.eligible(game));assert.equal(game.pow.complete,false,'transfer readiness is not freedom');
});

test('entering regular confinement preserves projects and identities while providing a secure physical cell',()=>{
  const {P,R,game}=fixture(),s=game.pow,b=s.base;
  assert.equal(s.stage,'regular');assert.equal(s.captivity.rewards.architecture,31);assert.equal(s.day,40);
  P.move(game,game.evade,0,-20,.32);assert(game.evade.p[2]>b[2]-2.82,'locked cell door blocks a long swept move');
  assert.equal(s.regular.flags.gateOpen,false);assert.equal(s.regular.escaped,false);assert(!s.outcome);
  assert(s.objective.includes('Fictional'));assert.equal(game.evade.searchers.length,4);
  assert(!R.isSuspicious(game),'ordinary motion inside the assigned cell is permitted');
});

test('historically available Alcatraz network requires its full meaningful course, while earlier generic confinement keeps the anonymous path',()=>{
  const {P,R,game}=fixture();let available=true,ready=false;
  P.Solidarity={available:()=>available,ready:()=>ready};assert(!R.eligible(game));
  assert(R.eligibility(game).historicalNetwork);assert(R.eligibility(game).missing.some(t=>t.includes('covert communication course')));
  ready=true;assert(R.eligible(game));ready=false;available=false;assert(R.eligible(game));
  assert(!R.eligibility(game).historicalNetwork,'earlier captures do not place real POWs together prematurely');
});

test('supervised exercise door opens during a schedule, and lawful yard behavior differs from illegal workshop movement',()=>{
  const {P,R,game}=fixture();assert(R.openCell(game));P.move(game,game.evade,0,-8,.32);
  assert(game.evade.p[2]<-6);assert(!R.isSuspicious(game));
  game.evade.running=true;assert(R.isSuspicious(game));game.evade.running=false;
  relocate(game,12,-15);assert(R.isSuspicious(game));
  relocate(game,0,-5);game.pow.regular.minute=1100;assert(R.isSuspicious(game),'outside the permitted time is suspicious');
});

test('a closed yard period cannot be bypassed by the supervised door interaction or communication clue',()=>{
  const {R,game}=fixture();game.pow.regular.minute=600;assert(!R.openCell(game));
  game.pow.regular.clueSeen=true;assert(!R.openCell(game));assert(!game.pow.regular.flags.cellOpen);
});

test('an observed escape attempt remains suspicious when the player returns to the permitted yard until pursuit memory fades',()=>{
  const {R,game}=fixture();relocate(game,0,-9);const guard=game.evade.searchers[0];
  guard.state='pursuit';guard.visible=true;R.prepare(game);assert(R.isSuspicious(game));
  guard.state='search';guard.visible=false;game.pow.time+=5;R.prepare(game);assert(R.isSuspicious(game));
  game.pow.time+=8;R.prepare(game);assert(!R.isSuspicious(game));
});

test('regular rest accrues real elapsed time, condition and simulated hours without unlocking escape',()=>{
  const {R,game}=fixture(),r=game.pow.regular;relocate(game,-.8,.7);
  assert(R.restStart(game));R.prepare(game);assert.equal(game.pow.motion.speed,0);
  R.step(game,.25);assert(r.sleeping);assert.equal(r.sleeping.minutes,7.5);
  const oldFatigue=game.pow.stats.fatigue;for(let i=0;i<63;i++)R.step(game,.25);
  assert.equal(r.sleeping,null);assert.equal(r.minute,10);assert.equal(game.pow.day,41);
  assert(game.pow.stats.fatigue<oldFatigue);assert(!r.flags.gateOpen);assert(!r.escaped);
  R.prepare(game);assert.equal(game.pow.motion.speed,1.8);
});

test('limited daily food supports health once per day and cannot be farmed for condition',()=>{
  const {R,game}=fixture();const initial=game.pow.stats.physical;assert(R.meal(game));assert.equal(game.pow.stats.physical,initial+3);
  assert(!R.meal(game));assert.equal(game.pow.stats.physical,initial+3);game.pow.day++;assert(R.meal(game));
});

test('contraband work requires observation and stops when a guard has nearby line of sight',()=>{
  const {R,game}=fixture();relocate(game,-6.5,-17.5);assert(!R.tool(game));R.observe(game);
  game.evade.searchers[0].p=[-6.5,game.pow.base[1],-15];assert(!R.tool(game));assert(!game.pow.regular.inventory.tool);
  assert(R.isSuspicious(game),'an interrupted hardware attempt is still suspicious for a short period');
  away(game);assert(R.tool(game));assert(game.pow.regular.inventory.tool);
  assert(game.pow.noises.some(n=>n.kind==='concealed hardware work'));
});

test('a known schedule is guidance and cannot unlock the workshop, hatch or gate',()=>{
  const {P,R,game}=fixture();P.Solidarity={escapeClue:()=> 'Watch the change of patrol.'};R.observe(game);
  assert(game.pow.regular.clueSeen);assert(!R.workshop(game));assert(!R.hatch(game));assert(!R.gate(game));
  for(const key of ['workshopOpen','hatchOpen','gateOpen'])assert(!game.pow.regular.flags[key]);
});

test('service hatch requires three discrete successful fastener interactions before its solid is removed',()=>{
  const {P,R,game}=fixture(),r=game.pow.regular;away(game);R.observe(game);R.tool(game);R.workshop(game);
  assert(R.hatch(game));assert.equal(r.hatchFasteners,1);assert(!r.flags.hatchOpen);assert(P.blocked(game,20,-20,.32,game.pow.base[1]));
  assert(R.hatch(game));assert.equal(r.hatchFasteners,2);assert(!r.flags.hatchOpen);
  assert(R.hatch(game));assert(r.flags.hatchOpen);assert(!P.blocked(game,20,-20,.32,game.pow.base[1]));
  assert(!r.flags.gateOpen);assert(P.blocked(game,20,-31.2,.32,game.pow.base[1]));
});

test('real held interaction cannot remove hatch fasteners instantly or repeat them without releasing F',()=>{
  const {P,R,game}=fixture();away(game);R.observe(game);R.tool(game);R.workshop(game);relocate(game,20,-18.5);game.evade.hdg=0;
  game.app.keys.KeyF=1;for(let i=0;i<40;i++)P.tick(game,.1);assert.equal(game.pow.regular.hatchFasteners,0);
  for(let i=0;i<15;i++)P.tick(game,.1);assert.equal(game.pow.regular.hatchFasteners,1);
  for(let i=0;i<100;i++)P.tick(game,.1);assert.equal(game.pow.regular.hatchFasteners,1,'holding F remains latched after one real fastener');
  game.app.keys.KeyF=0;P.tick(game,.1);game.app.keys.KeyF=1;for(let i=0;i<55;i++)P.tick(game,.1);
  assert.equal(game.pow.regular.hatchFasteners,2);assert(!game.pow.regular.flags.hatchOpen);assert(!game.pow.complete);
});

test('continuous physical movement, not gate interaction, crosses the escape boundary and enters Hanoi',()=>{
  const {P,R,game}=fixture(),y=game.pow.base[1];openRoute(R,game);assert(!game.pow.regular.escaped);
  relocate(game,20,-19);P.move(game,game.evade,0,-12,.32);R.step(game,.01);assert.equal(game.pow.stage,'regular');
  assert(game.evade.p[2]<-30.9);assert(!game.pow.complete);
  P.move(game,game.evade,0,-1.5,.32);R.step(game,.01);
  assert.equal(game.pow.stage,'hanoi');assert(game.pow.flags.regularEscape);assert(!game.pow.complete);
  assert.equal(game.evade.p[1],y);assert.equal(game.evade.p[0],29.1,'the existing Hanoi chapter receives the exterior checkpoint');
});

test('solids prevent bypass around hatch and locked outer gate, including long movement steps',()=>{
  const {P,R,game}=fixture(),y=game.pow.base[1];away(game);R.observe(game);R.tool(game);R.workshop(game);
  relocate(game,20,-18);P.move(game,game.evade,0,-20,.32);assert(game.evade.p[2]>-19.7,'locked hatch cannot be tunneled');
  R.hatch(game);R.hatch(game);R.hatch(game);P.move(game,game.evade,0,-20,.32);assert(game.evade.p[2]>-30.9,'outer gate remains a separate solid');
  relocate(game,17,-22);P.move(game,game.evade,0,-20,.32);assert(game.evade.p[2]>-23.5,'perimeter wall cannot be bypassed beside the passage');
  assert(P.blocked(game,18,-27,.32,y));assert(P.blocked(game,22,-27,.32,y));
});

test('saved regular progress rebuilds physical open barriers, fasteners and tool without arbitrary release',()=>{
  const {P,R,game}=fixture();openRoute(R,game);const data=R.snapshot(game);
  game.pow.regular=null;assert(R.restore(game,data));assert.equal(JSON.stringify(R.snapshot(game)),JSON.stringify({...data,sleeping:null}));
  assert(!P.blocked(game,10,-15,.32,game.pow.base[1]));assert(!P.blocked(game,20,-20,.32,game.pow.base[1]));assert(!P.blocked(game,20,-31.2,.32,game.pow.base[1]));
  assert(!game.pow.complete);assert(!game.pow.regular.escaped);
});

test('a new transfer after recapture retains learned routines but restores physical locks and confiscates the tool',()=>{
  const {R,game}=fixture();openRoute(R,game);const observations=game.pow.regular.observations;game.pow.flags.recaptures=1;
  R.enter(game);assert.equal(game.pow.regular.visits,2);assert.equal(game.pow.regular.observations,observations);
  assert(!game.pow.regular.inventory.tool);assert(!game.pow.regular.flags.workshopOpen);assert(!game.pow.regular.flags.gateOpen);
  assert.equal(game.pow.regular.attempts,1);assert.equal(game.pow.captivity.rewards.car,30);assert.equal(game.pow.day,40);
});

test('every guard patrol segment is supported, starts outside solids and stays clear of walls',()=>{
  const {P,game}=fixture(),y=game.pow.base[1];
  for(const a of game.evade.searchers){
    for(const point of a.route)assert(!P.blocked(game,point[0],point[2],.34,y),a.id+' has a safe waypoint');
    for(let i=0;i<a.route.length;i++){
      const from=a.route[i],to=a.route[(i+1)%a.route.length],n=Math.ceil(Math.hypot(to[0]-from[0],to[2]-from[2])/.18);
      for(let j=0;j<=n;j++){const t=j/n;assert(!P.blocked(game,from[0]+(to[0]-from[0])*t,from[2]+(to[2]-from[2])*t,.34,y),a.id+' segment crosses no solid');}
    }
  }
});

test('AI pathfinding around the workshop walls never plans through the closed door or service hatch',()=>{
  const {P,game}=fixture(),guard=game.evade.searchers[1],target=[20,game.pow.base[1],-17];
  assert.equal(P.AI.planPath(game,guard,target).length,0,'restricted workshop is initially sealed');
  game.pow.regular.inventory.tool=true;away(game);P.RegularConfinement.workshop(game);
  guard.p=[6,game.pow.base[1],-11];const planned=P.AI.planPath(game,guard,target);assert(planned.length>0);
  for(const point of planned)assert(!P.blocked(game,point[0],point[2],.34,point[1]));
});
