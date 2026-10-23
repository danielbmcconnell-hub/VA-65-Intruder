'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
  const calls=[];
  class Game{update(){this.updates++;}render(){this.renders++;}captured(){calls.push('legacy');}recapturedInCamp(){calls.push('legacy-solitary');this._solitaryActive=true;}}
  const root={POW:{begin(g,stage){calls.push(stage);g.pow={stage,flags:{},stats:{}};g.evade={p:[100,0,100]};g.phase='evade';}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/survival/capture-transition.js'),'utf8'),{window:root,WeakMap,Number,Math});
  const App={game:null,keys:{w:true},gctl:{run:1},audio:{burst(){},setEngine(){},setTone(){}}};
  App.captivity=g=>root.POW.begin(g,'solitary');App.cokerCamp=g=>root.POW.begin(g,'cell');App.cokerEnd=()=>calls.push('ending');
  const g=new Game();Object.assign(g,{app:App,evade:{p:[2,0,3],moving:true,blood:'carry',hurt:true},mis:{escape:false},phase:'evade',updates:0,renders:0});App.game=g;
  const T=root.CaptureTransition;T.install({Game,App});
  const tick=seconds=>{for(let i=0;i<Math.ceil(seconds/.05);i++)g.update(.05);};
  return {g,App,Game,T,tick,calls};
}
test('capture retains first-person ground until one simulated transfer, never legacy cockpit path',()=>{
  const {g,T,tick,calls}=fixture(),actor=g.evade;
  g.captured();g.captured();assert.equal(g.evade,actor);assert.equal(g.phase,'evade');assert.equal(actor.frozen,1);assert.equal(g._blood,'carry');assert.equal(g._hurt,true);assert.equal(T.active(g),true);assert.deepEqual(calls,[]);
  tick(4);assert.equal(g.evade,actor);assert.equal(g.updates,0);assert.deepEqual(calls,[]);
  tick(1);assert.notEqual(g.evade,actor);assert.equal(g.pow.stage,'solitary');assert.deepEqual(calls,['solitary']);assert.equal(T.inspect(g).arriving,true);
  tick(1);assert.equal(T.active(g),false);assert.equal(g._capturePending,false);assert.deepEqual(calls,['solitary']);tick(.1);assert.ok(g.updates>0);
});
test('pause and large dt cannot skip the readable transfer or advance the prison',()=>{
  const {g,T,tick,calls}=fixture();g.captured();g.update(100);assert.equal(T.inspect(g).age,.1);g.paused=true;tick(30);assert.equal(T.inspect(g).age,.1);assert.deepEqual(calls,[]);g.paused=false;tick(6);assert.deepEqual(calls,['solitary']);
});
test('replacing the game abandons the transfer without mutating a newer mission',()=>{
  const {g,App,T,tick,calls}=fixture();g.captured();App.game={};tick(10);assert.equal(T.active(g),false);assert.deepEqual(calls,[]);
});
test('explicitly entering a new ground actor abandons the obsolete transfer',()=>{
  const {g,T,tick,calls}=fixture();g.captured();g.evade={p:[40,0,40]};assert.equal(T.active(g),false);tick(10);assert.deepEqual(calls,[]);assert.equal(g._capturePending,false);
});
test('ending the chapter cancels a pending transfer',()=>{
  const {g,T,tick,calls}=fixture();g.captured();g.phase='done';assert.equal(T.active(g),false);tick(10);assert.deepEqual(calls,[]);
});
test('recapture counts once and preserves the old POW chapter until its transfer',()=>{
  const {g,T,tick,calls}=fixture();g.pow={stage:'river',flags:{recaptures:2},stats:{recaptures:2}};const prior=g.pow;
  g.captured();g.captured();assert.equal(prior.flags.recaptures,3);assert.equal(prior.stats.recaptures,3);assert.equal(T.inspect(g).recapture,true);assert.equal(g.pow.stage,'river');tick(6);assert.deepEqual(calls,['solitary']);
});
test('Coker landing still arrives at the escape cell rather than solitary',()=>{
  const {g,tick,calls}=fixture();g.mis.escape=true;g._escStage='landing';g.captured();tick(6);assert.deepEqual(calls,['cell']);
});
test('legacy compound recapture retains its original solitary continuation',()=>{
  const {g,tick,calls}=fixture();g.mis.escape=true;g._escStage='yard';g.evade.camp=true;g.captured();tick(6);assert.deepEqual(calls,['legacy-solitary']);assert.equal(g._solitaryActive,true);
});
