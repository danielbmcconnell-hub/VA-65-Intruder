'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');

// Pure simulation fixtures. These do not validate WebGL or physical iPhone Safari.
function fixture() {
  const storage=new Map();
  const document={body:{classList:{toggle(){}}},getElementById(){return null},pointerLockElement:null,activeElement:null};
  const window={document};
  const sandbox={window,document,console,Date};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow/core.js'),'utf8'),sandbox);
  const P=window.POW;
  P.mountUI=()=>{};P.updateUI=()=>{};P.activate=()=>{};
  P.ctx={terrainH:()=>4,Store:{get:(key,otherwise)=>storage.has(key)?storage.get(key):otherwise,set:(key,value)=>storage.set(key,JSON.parse(JSON.stringify(value)))}};
  const game={ac:{p:[0,5,0]},app:{keys:{},gctl:{},set:{sound:0}},world:{_cells:new Map()},setHour(){}};
  P.begin(game,'cell');
  return {P,game,document,storage,sandbox};
}
function ticks(P,game,seconds) { for(let i=0;i<Math.ceil(seconds*10);i++)P.tick(game,.1); }
function obtainBracket(P,game) {const s=game.pow;game.evade.p.splice(0,3,-.8,s.base[1],.9);assert(P.interact(game,'bunk-bracket'));}
function openDoor(P,game) {obtainBracket(P,game);const s=game.pow;game.evade.p.splice(0,3,.35,s.base[1],-2.9);assert(P.interact(game,'door-fitting'));}

test('flat pad height, zero-world origin, feet-height cell position and locked door collision',()=>{
  const {P,game}=fixture(),s=game.pow,e=game.evade,y=s.base[1];
  assert.equal(y,6);assert.equal(s.base[0],0);assert.equal(s.base[2],0);
  assert.deepEqual(Array.from(game.cellPos),[0,y,0]);
  assert(P.blocked(game,2.8,0,.32,y));
  e.p.splice(0,3,0,y,0);P.move(game,e,0,-12,.32);
  assert(e.p[2]>-3.22,'a long movement cannot tunnel through the locked door');
  assert(!s.flags.doorOpen);P.interact(game,'door-fitting');assert(!s.flags.doorOpen,'hardware requires concealed bracket');
});

test('physical corridor, staircase, roof, rope descent and street crossing form a complete route',()=>{
  const {P,game}=fixture(),s=game.pow,e=game.evade,y=s.base[1];
  openDoor(P,game);P.move(game,e,0,-3,.32);assert(e.p[2]<-4,'open door removes its collision');
  P.tick(game,.1);assert.equal(s.stage,'compound');
  e.p[2]=-5.6;P.move(game,e,14-e.p[0],0,.32);assert(Math.abs(e.p[0]-14)<.01);
  P.move(game,e,0,-17,.32);assert(e.p[1]>y+3.35,'walking stairs continuously raises feet to roof');assert(e.p[2]<-21.9);
  P.move(game,e,7,0,.32);assert(P.interact(game,'roof-rope'));assert(s.inventory.rope);
  P.move(game,e,4.4,0,.32);P.move(game,e,0,-1.4,.32);assert(P.interact(game,'roof-descent'));assert(s.traversal);
  ticks(P,game,4.5);assert.equal(s.stage,'hanoi');assert(Math.abs(e.p[0]-29.1)<.01);
  P.move(game,e,63,0,.32);P.tick(game,.1);assert.equal(s.stage,'river','crossing the real street boundary changes stage');
});

test('keyboard interaction requires the full hold duration and release between objects',()=>{
  const {P,game}=fixture(),s=game.pow,e=game.evade;
  e.p.splice(0,3,-.8,s.base[1],.9);game.app.keys.KeyF=1;ticks(P,game,1);assert(!s.inventory.bracket);
  ticks(P,game,.6);assert(s.inventory.bracket);game.app.keys.KeyF=0;P.tick(game,.1);
  e.p.splice(0,3,.35,s.base[1],-2.9);game.app.keys.KeyF=1;ticks(P,game,6);assert(!s.flags.doorOpen);
  ticks(P,game,1.2);assert(s.flags.doorOpen);
});

test('vertical LOS, thin walls, corner sliding and actor bodies use independent solid collision',()=>{
  const {P}=fixture();
  const game={pow:{base:[0,0,0],solids:[{id:'thin',x:0,z:0,hw:.02,hl:5,yMin:0,yMax:3}],surfaces:[],actors:[]},evade:{p:[-2,0,0]}};
  game.pow.p=game.evade.p;
  assert(!P.los(game,[-1,1,0],[1,1,0]));assert(P.los(game,[-1,4,0],[1,4,0]));
  P.move(game,game.evade,6,1,.32);assert(game.evade.p[0]<-.3);assert(game.evade.p[2]>.9);
  game.pow.solids=[];game.pow.actors=[{p:[0,0,0],radius:.31}];game.evade.p=[-2,0,0];P.move(game,game.evade,5,0,.32);assert(game.evade.p[0]<-.61);
});

test('focused input, captivity puzzles and zero-speed confinement suppress walking and interaction',()=>{
  const {P,game,document}=fixture(),s=game.pow,e=game.evade;
  game.app.keys.KeyW=1;game.app.keys.KeyF=1;const before=e.p.slice();
  document.activeElement={closest:()=>({})};ticks(P,game,1);assert.deepEqual(Array.from(e.p),Array.from(before));assert(!s.holding);
  document.activeElement=null;s.captivity={open:true};ticks(P,game,1);assert.deepEqual(Array.from(e.p),Array.from(before));assert(!P.interact(game,'bunk-bracket'));
  s.captivity.open=false;s.motion={speed:0,radius:.19};ticks(P,game,1);assert.deepEqual(Array.from(e.p),Array.from(before));
  s.stage='solitary';s.stats.fatigue=70;ticks(P,game,1);assert.equal(s.stats.fatigue,70,'captivity module owns confinement condition');
});

test('checkpoint restores look, held items and real AI patrol memory; final outcome is persisted',()=>{
  const {P,game,sandbox,storage}=fixture();
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow/ai.js'),'utf8'),sandbox);
  P.AI.enter(game,'cell');ticks(P,game,1.5);
  game.evade.look=.4;game.evade.pitchCmd=.4;game.pow.inventory.bracket=true;
  const snapshot=P.save(game),serialized=JSON.stringify(snapshot.ai);
  game.evade.look=0;game.evade.p[0]+=.2;P.begin(game,snapshot.stage,snapshot);
  assert.equal(game.evade.pitchCmd,.4);assert(game.pow.inventory.bracket);
  assert.equal(JSON.stringify(P.AI.snapshot(game)),serialized);
  const persisted=storage.get('pow_checkpoint');assert.equal(persisted.look,.4);assert(persisted.inventory.bracket);assert.equal(JSON.stringify(persisted.ai),serialized);
  const nodes=new Map();P.ui={end:{hidden:true,querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{textContent:''});return nodes.get(selector);}}};
  P.finish(game,{title:'Fixture conclusion',text:'A saved final outcome.'});
  assert.equal(storage.get('pow_checkpoint').outcome.text,'A saved final outcome.');assert(storage.get('pow_checkpoint').complete);
});

test('recapture retains elapsed time and mental projects while confiscating escape hardware',()=>{
  const {P,game}=fixture();game.pow.time=720;game.pow.day=40;game.pow.inventory.bracket=true;game.pow.inventory.rope=true;game.pow.flags.outside=true;game.pow.captivity={architecture:{rooms:4},open:false};
  P.Captivity={enter(){}};P.begin(game,'solitary');assert.equal(game.pow.time,720);assert.equal(game.pow.day,40);assert.equal(game.pow.captivity.architecture.rooms,4);assert(!game.pow.inventory.rope);assert(!game.pow.flags.outside);
  game.pow.stage='cell';assert.doesNotThrow(()=>P.transition(game,'solitary'),'transition does not refer to a nonexistent restore snapshot');
});

test('module initialization cannot overwrite a checkpoint before complete restoration',()=>{
  const {P,game,storage}=fixture();game.pow.stage='solitary';game.pow.captivity={architecture:{rooms:7},city:{districts:3},open:false};game.pow.day=63;game.evade.look=.6;const snapshot=P.save(game),before=JSON.stringify(storage.get('pow_checkpoint'));let midRestore;
  P.Captivity={enter(g){g.pow.captivity={architecture:{rooms:0},city:{districts:0}};P.save(g);midRestore=JSON.stringify(storage.get('pow_checkpoint'));},restore(g,saved){g.pow.captivity=JSON.parse(JSON.stringify(saved));}};
  P.begin(game,'solitary',snapshot);assert.equal(midRestore,before,'initialization save must leave the valid persisted checkpoint untouched');
  const restored=storage.get('pow_checkpoint');assert.equal(JSON.stringify(restored.captivity),JSON.stringify(snapshot.captivity));assert.equal(restored.day,63);assert.equal(restored.look,.6);
  P.Captivity.enter=()=>{throw new Error('Fixture hydration failure');};assert.throws(()=>P.begin(game,'solitary',snapshot),/Fixture hydration failure/);assert.equal(JSON.stringify(storage.get('pow_checkpoint').captivity),JSON.stringify(snapshot.captivity),'failed restore must not destroy the prior checkpoint');
});
