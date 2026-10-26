'use strict';
// Domain checks execute the production wildlife engine and river adapter.
// Native GPU photographs and full mission outcomes are checked separately.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function fixture({bank=false,ready=true}={}){
  const warnings=[],window={document:{hidden:false},WildlifeRender:{ready:()=>ready,load:()=>Promise.resolve(),draw:(g,r,v)=>v.animals.length}};
  let randomCalls=0;const taskMath=Object.create(Math);taskMath.random=()=>{randomCalls++;return .5;};
  const ctx={window,console,Math:taskMath};vm.createContext(ctx);
  for(const file of ['assets/survival/ground-combat.js','assets/survival/wildlife.js','assets/survival/wildlife-targeting.js','assets/survival/riverbank-wildlife.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
  const g={t:0,phase:'evade',app:{screen:'game',set:{sound:0},radio:(who,text)=>warnings.push(text)},mis:{id:'m11',env:{seed:17}},world:{},pow:{stage:'river',base:[0,0,0],stats:{physical:90,fatigue:0},river:{phase:'stream',waterY:12,mode:bank?'bank':'float',logicalDistance:0,routeOriginZ:0,streamOffset:0}},evade:{p:[bank?74:91,bank?12.35:11.58,0],hdg:Math.PI,look:0,searchers:[],locals:[],cattle:[],weaponMode:'fists'}};
  g.app.game=g;window.POW={notify:(g,t)=>warnings.push(t),blocked:()=>false,los:()=>true,move:(g,a,dx,dz)=>{a.p[0]+=dx;a.p[2]+=dz;return a.p;}};
  return {g,R:window.RiverbankWildlife,W:window.Wildlife,C:window.GroundCombat,window,warnings,randomCalls:()=>randomCalls};
}
function tick(f,n=1,dt=.05){for(let i=0;i<n;i++){f.g.t+=dt;f.R.step(f.g,dt);}}
function first(f){return f.R.inspect(f.g).entries[0]?.actor;}
function approach(f,distance=2.8){
  for(let i=0;i<900;i++){
    const a=first(f);if(!a)throw Error('No natural bank animal');const e=f.g.evade,dx=a.p[0]-e.p[0],dz=a.p[2]-e.p[2],d=Math.hypot(dx,dz);
    if(d<distance)return;e.hdg=Math.atan2(dx,-dz);e.p[0]+=dx/d*.1;e.p[2]+=dz/d*.1;tick(f);
  }
  throw Error('No actual approach');
}
test('only a live river chapter can own bank wildlife; no prison roster changes',()=>{
  const f=fixture(),before=JSON.stringify({people:f.g.evade.searchers,locals:f.g.evade.locals,stats:f.g.pow.stats});tick(f);
  assert.equal(f.R.inspect(f.g).spawned,1);assert.equal(JSON.stringify({people:f.g.evade.searchers,locals:f.g.evade.locals,stats:f.g.pow.stats}),before);
  for(const stage of ['cell','compound','solitary','regular','hanoi']){f.g.pow.stage=stage;assert.equal(f.R.eligible(f.g),false);assert.equal(f.R.draw(f.g,{}),0);}
});
test('natural encounters begin away from player and stand on virtual bank, not procedural terrain',()=>{
  const f=fixture();tick(f);const a=first(f);assert.equal(a.kind,'boar');assert.equal(a.p[1],12.35);assert.ok(Math.abs(a.p[0]-94)>=14.8);assert.ok(Math.hypot(a.p[0]-f.g.evade.p[0],a.p[2])>=f.R.limits.minimumSpawnRange);
  const render=f.R.view(f.g).animals[0];assert.equal(render.floorAt(a.p[0],a.p[2]),12.35);assert.equal(render.floorAt(94,a.p[2]),0);assert.match(render.floorKey,/riverbank/);
});
test('pause, modal and hidden page freeze animal clocks and damage',()=>{
  const f=fixture();tick(f);const before=JSON.stringify(f.R.inspect(f.g));
  for(const type of ['pause','modal','hidden']){if(type==='pause')f.g.paused=true;if(type==='modal')f.g.pow.modalOpen=true;if(type==='hidden')f.window.document.hidden=true;tick(f,20);assert.equal(JSON.stringify(f.R.inspect(f.g)),before);f.g.paused=false;f.g.pow.modalOpen=false;f.window.document.hidden=false;}
});
test('undecoded wildlife textures cannot spawn invisible attacks',()=>{
  const f=fixture({bank:true,ready:false});f.g.rend={};tick(f,800);assert.equal(f.R.inspect(f.g).spawned,0);assert.equal(f.g.pow.stats.physical,90);
});
test('bank animals never inflict phantom damage on a floating or submerged swimmer',()=>{
  const f=fixture();tick(f);for(let i=0;i<1200;i++){f.g.evade.p[2]+=.035;tick(f);}assert.equal(f.g.pow.stats.physical,90);assert.equal(f.R.inspect(f.g).hits,0);
  f.g.pow.river.mode='dive';f.g.pow.river.submerged=true;tick(f,200);assert.equal(f.g.pow.stats.physical,90);assert.equal(f.R.targets(f.g).length,0);
});
test('actual proximity warning precedes a boar contact and injury stays bounded',()=>{
  const f=fixture({bank:true});tick(f);approach(f,3);tick(f,240);
  assert.ok(f.warnings.some(t=>/boar/i.test(t)));assert.equal(f.g.pow.stats.physical,86);assert.equal(f.R.inspect(f.g).hits,1);
});
test('the shared swept blocker prevents a charging animal crossing an obstruction',()=>{
  const f=fixture({bank:true});tick(f);approach(f,4);const obstacleZ=(first(f).p[2]+f.g.evade.p[2])/2;
  f.window.POW.blocked=(g,x,z,r)=>Math.abs(z-obstacleZ)<r+.1;f.window.POW.move=(g,a,dx,dz,r)=>{if(!f.window.POW.blocked(g,a.p[0]+dx,a.p[2]+dz,r)){a.p[0]+=dx;a.p[2]+=dz;}return a.p;};
  tick(f,240);assert.equal(f.g.pow.stats.physical,90);
});
test('stream recentring translates existing animal once and cannot fabricate a contact',()=>{
  const f=fixture({bank:true});tick(f);const before=first(f).p.slice();f.g.evade.p[2]-=112;f.g.pow.base[2]-=0;f.g.pow.river.streamOffset+=112;f.R.view(f.g);const after=first(f).p.slice();assert.equal(after[2],before[2]-112);f.R.view(f.g);assert.equal(first(f).p[2],after[2]);tick(f);assert.equal(f.g.pow.stats.physical,90);
});
test('close real free-hand contact repels the boar continuously; occupied hands cannot punch',()=>{
  const f=fixture({bank:true});tick(f);approach(f,1.7);const a=first(f),p=a.p.slice();f.g.evade.weaponMode='rifle';assert.equal(f.R.punch(f.g,a.id),false);f.g.evade.weaponMode='fists';assert.equal(f.R.punch(f.g,a.id),true);assert.deepEqual(first(f).p,p);assert.equal(first(f).state,'recover');tick(f,40);assert.equal(first(f).state,'flee');assert.equal(f.g.pow.stats.physical,90);
});
test('knife defence requires real reach and line of sight and never changes human targets',()=>{
  const f=fixture({bank:true});tick(f);const id=first(f).id;assert.equal(f.R.weaponHit(f.g,id,{weapon:'knife'}),false);approach(f,1.8);f.window.POW.los=()=>false;assert.equal(f.R.weaponHit(f.g,id,{weapon:'knife'}),false);f.window.POW.los=()=>true;assert.ok(f.R.weaponHit(f.g,id,{weapon:'knife'}));assert.equal(first(f).defenseWeapon,'knife');assert.equal(f.g.evade.searchers.length,0);
});
test('full-body boar targeting uses the real view ray on the bank and excludes water modes',()=>{
  const f=fixture({bank:true});tick(f);approach(f,4);const a=first(f),e=f.g.evade;const eye=1.56;f.g.pow.river.eyeHeight=eye;e.hdg=Math.atan2(a.p[0]-e.p[0],-(a.p[2]-e.p[2]));const d=Math.hypot(a.p[0]-e.p[0],a.p[2]-e.p[2]);e.look=Math.atan((a.p[1]+.475-e.p[1]-eye)/d)+.04;
  const hit=f.R.target(f.g);assert.equal(hit?.actor.id,a.id);assert.equal(hit.actor.riverbankWildlife,true);f.g.pow.river.mode='float';assert.equal(f.R.target(f.g),null);
});
test('at most three route encounters remain live, and seen route markers persist in the river checkpoint',()=>{
  const f=fixture();for(let n=0;n<900;n++){const r=f.g.pow.river;r.logicalDistance=n*100;r.streamOffset=Math.floor(n/112)*112;f.g.evade.p[2]=n-r.streamOffset;r.routeOriginZ=0;tick(f);assert.ok(f.R.inspect(f.g).entries.length<=3);}assert.ok(f.g.pow.river.bankWildlifeSeen.length<=6);const used=f.g.pow.river.bankWildlifeSeen.slice();assert.ok(used.length>=3);assert.equal(f.g.pow.river.finished,undefined);assert.equal(f.g.pow.complete,undefined);
});
test('encounters never consume the original mission random stream',()=>{
  const f=fixture({bank:true});tick(f);approach(f,3);tick(f,240);assert.equal(f.randomCalls(),0);assert.equal(f.g.pow.river.finished,undefined);assert.equal(f.g.result,undefined);
});
