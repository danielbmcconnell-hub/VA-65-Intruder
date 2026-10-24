'use strict';
// Stateful ecology tests use the production module, deterministic land/solid
// adapters and measured player paths. They do not claim browser or GPU proof.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/survival/wildlife.js'),'utf8');
const KINDS=['krait','cobra','pit-viper','scorpion','centipede','boar','tiger','weaver-ants'];
function fixture(encounters=[],extra={}){
 const window={document:{hidden:false,visibilityState:'visible'}},warnings=[],hits=[];
 vm.runInNewContext(source,{window});const W=window.Wildlife,g={phase:'evade',paused:false,t:0,mis:{id:'fixture'},evade:{p:[0,5,0],searchers:[],locals:[],cattle:[]}};
 const c={terrainH:()=>5,solidAt:()=>false,coverAt:()=>1,night:true,warn:text=>warnings.push({at:g.evade.wildlife.clock,text}),hurt:event=>hits.push({at:g.evade.wildlife.clock,...event}),...extra};
 W.enter(g,{seed:123,disableSpawns:true,encounters});return {window,W,g,c,warnings,hits};
}
function tick(f,seconds,{vx=0,vz=0,dt=.05}={}){for(let t=0;t<seconds-1e-9;){const step=Math.min(dt,seconds-t);f.g.evade.p[0]+=vx*step;f.g.evade.p[2]+=vz*step;f.g.t+=step;f.W.step(f.g,step,f.c);t+=step;}return f.W.view(f.g);}
const animal=(kind,z=-4,more={})=>({kind,id:'test-'+kind,p:[0,5,z],yaw:Math.PI,...more});
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,a+' != '+b);
const state=f=>f.g.evade.wildlife;

test('all eight reference species enter distinct bounded view records without sharing mutable positions',()=>{
 const f=fixture(KINDS.map((kind,i)=>animal(kind,-4-i*3)));const v=f.W.view(f.g);
 assert.equal(v.animals.length,7);assert.equal(v.colonies.length,1);assert.equal(new Set(v.animals.map(n=>n.kind)).size,7);assert.equal(v.colonies[0].kind,'weaver-ants');
 v.animals[0].p[0]=999;v.colonies[0].p[0]=999;assert.equal(f.W.view(f.g).animals[0].p[0],0);assert.equal(f.W.view(f.g).colonies[0].p[0],0);
 assert.equal(f.W.limits.kindCount,8);assert.equal(f.W.limits.timers,0);
});

test('enter enforces separate snake, mammal, crawler and colony population caps',()=>{
 const f=fixture(Array.from({length:10},(_,i)=>KINDS.map(kind=>animal(kind,-i-2))).flat());const s=state(f);
 assert.equal(s.snakes.length,3);assert.equal(s.ecology.mammals.length,2);assert.equal(s.ecology.crawlers.length,3);assert.equal(s.ecology.colonies.length,3);
});

test('boar warns and holds its windup before one contact, then recovers and withdraws',()=>{
 const f=fixture([animal('boar')]);tick(f,1.65);assert.equal(f.hits.length,0);assert.equal(f.W.view(f.g).animals[0].state,'warn');assert.match(f.warnings[0].text,/boar/);
 const v=tick(f,2);assert.equal(f.hits.length,1);assert.ok(f.hits[0].at-f.warnings[0].at>=1.7);assert.ok(v.injury&&v.injury.kind==='boar');assert.ok(v.movementFactor>=.82&&v.movementFactor<1);
 tick(f,15);assert.equal(f.hits.length,1);assert.equal(state(f).ecology.mammals[0].spent,true);assert.equal(f.g.phase,'evade');assert.equal(f.g.evade.hurt,undefined);assert.equal(f.g.evade.hits,undefined);
});

test('a boar commits its charge direction so actual sideways travel can dodge it',()=>{
 const f=fixture([animal('boar')]);tick(f,1.85);const n=state(f).ecology.mammals[0];assert.equal(n.state,'charge');const heading=n.chargeYaw;
 tick(f,1.4,{vx:3.6});tick(f,3);assert.equal(f.hits.length,0);near(n.chargeYaw,heading);assert.equal(n.spent,true);
});

test('walking away during a warning avoids the boar rather than triggering pursuit forever',()=>{
 const f=fixture([animal('boar')]);tick(f,.1);tick(f,7,{vz:2.1});assert.equal(f.hits.length,0);assert.equal(state(f).ecology.mammals[0].spent,true);
});

test('solid obstruction prevents mammal attack and a blocked charge cancels safely',()=>{
 const wall=fixture([animal('boar')],{solidAt:(x,z,r)=>Math.abs(z+2)<r+.06});tick(wall,8);assert.equal(wall.hits.length,0);assert.ok(wall.W.view(wall.g).animals[0].p[2]<-2);
 const blocked=fixture([animal('boar')]);tick(blocked,1.85);blocked.c.move=(x,z)=>[x,z];tick(blocked,1);assert.equal(blocked.hits.length,0);assert.equal(state(blocked).ecology.mammals[0].state,'recover');
});

test('even an explicit charge fixture must emit a warning and wait for a full windup',()=>{
 const f=fixture([animal('boar',-.6,{state:'charge'})]);tick(f,1);assert.equal(f.hits.length,0);assert.equal(f.W.view(f.g).animals[0].state,'warn');assert.match(f.warnings[0].text,/boar/);
});

test('tiger stalking is bounded and a retreating player is not followed indefinitely',()=>{
 const f=fixture([animal('tiger',-20)]);tick(f,1);assert.match(f.warnings[0].text,/tiger/);assert.equal(state(f).ecology.mammals[0].state,'stalk');
 tick(f,27,{vz:1.3});assert.equal(f.hits.length,0);assert.ok(!state(f).ecology.mammals.length||state(f).ecology.mammals[0].spent);assert.equal(f.g.phase,'evade');
});

test('tiger contact requires its warned windup and leaves only a bounded recoverable injury',()=>{
 const f=fixture([animal('tiger',-7)]);tick(f,2.1);assert.equal(f.hits.length,0);tick(f,3);assert.equal(f.hits.length,1);assert.ok(f.hits[0].at-f.warnings[0].at>=2.2);tick(f,31);assert.equal(f.W.view(f.g).injury,null);near(f.W.movementFactor(f.g),1);
});

test('cobra, pit viper and krait remain defensive: stationary feet are safe, actual contact can bite',()=>{
 for(const kind of ['krait','cobra','pit-viper']){
  const f=fixture([animal(kind,-.4)]);tick(f,1);assert.equal(f.W.view(f.g).bite,null);tick(f,.3,{vz:-.5});const v=f.W.view(f.g);assert.ok(v.bite,kind);assert.equal(v.bite.kind,kind);assert.equal(v.bite.possibleVenomous,true);assert.equal(f.hits.length,0);assert.equal(f.g.phase,'evade');
  tick(f,185);assert.ok(f.W.movementFactor(f.g)>=.72&&f.W.movementFactor(f.g)<=.721);assert.equal(f.g.phase,'evade');
 }
});

test('scorpion and centipede contacts require measured travel and create temporary local irritation',()=>{
 for(const kind of ['scorpion','centipede']){
  const f=fixture([animal(kind,-.2)]);tick(f,1);assert.equal(f.W.view(f.g).irritation,null);tick(f,.25,{vz:-.4});const v=f.W.view(f.g);assert.equal(v.irritation.kind,kind);assert.equal(v.bite,null);assert.ok(v.movementFactor>=.9);assert.equal(f.hits.length,0);tick(f,16);assert.equal(f.W.view(f.g).irritation,null);near(f.W.movementFactor(f.g),1);
 }
});

test('weaver ants stay at a fixed visible nest, warn before contact and stop contact when the player leaves',()=>{
 const f=fixture([animal('weaver-ants',0)]);f.g.evade.p[0]=1;state(f).previousP=f.g.evade.p.slice();tick(f,2);assert.equal(f.W.view(f.g).irritation,null);assert.match(f.warnings[0].text,/nest/);
 tick(f,.3,{vx:-1});tick(f,1);let v=f.W.view(f.g);assert.equal(v.irritation.kind,'weaver-ants');assert.ok(v.movementFactor>=.88);assert.equal(v.colonies[0].p[0],0);
 tick(f,1,{vx:2});const biteAt=state(f).ecology.colonies[0].lastBite;tick(f,8);v=f.W.view(f.g);assert.equal(v.irritation,null);assert.equal(state(f).ecology.colonies[0].lastBite,biteAt);assert.equal(state(f).ecology.colonies[0].contact,0);near(v.movementFactor,1);
});

test('crouching beneath a low leaf nest avoids disturbing its canopy contact area',()=>{
 const f=fixture([animal('weaver-ants',0,{anchorHeight:1.3})]);f.g.evade.crouch=true;tick(f,8);assert.equal(f.W.view(f.g).irritation,null);assert.equal(state(f).ecology.colonies[0].contact,0);
});

test('temporary injury factors take the minimum and never multiply or alter native wound/death fields',()=>{
 const f=fixture();state(f).bite={age:180,possibleVenomous:true};state(f).ecology.injury={kind:'boar',age:0,duration:30,factor:.82};state(f).ecology.irritation={kind:'weaver-ants',age:0,duration:6,factor:.88};near(f.W.movementFactor(f.g),.72);assert.equal(f.g.evade.hurt,undefined);assert.equal(f.g.result,undefined);
});

test('pause, hidden tabs, menus, capture and historical captivity exclude all wildlife simulation',()=>{
 const cases=[f=>{f.g.paused=true;},f=>{f.window.document.hidden=true;},f=>{f.window.document.visibilityState='hidden';},f=>{f.g._capturePending=true;},f=>{f.g.evade.held=1;},f=>{f.g.evade.frozen=true;},f=>{f.g.evade.handsUp=true;},f=>{f.g.evade.camp=true;},f=>{f.g.evade.river=true;},f=>{f.g.pow={stage:'cell'};},f=>{f.g._solitaryActive=true;},f=>{f.g.result={};},f=>{f.g.phase='flight';},f=>{f.g.app={screen:'ready'};},f=>{f.g.app={screen:'game',graphicsContextLost:true};},f=>{f.g.app={screen:'game',game:{}};}];
 for(const block of cases){const f=fixture(KINDS.map((kind,i)=>animal(kind,-2-i)));block(f);const before=JSON.stringify(f.W.snapshot(f.g));tick(f,2);assert.equal(JSON.stringify(f.W.snapshot(f.g)),before);assert.equal(f.hits.length,0);}
});

test('teleport discontinuities do not sweep new wildlife contact or turn elapsed wall time into attacks',()=>{
 const f=fixture([animal('scorpion',0),animal('weaver-ants',0)]);f.g.evade.p[0]=20;state(f).previousP=f.g.evade.p.slice();tick(f,1);f.g.evade.p[0]=0;f.W.step(f.g,10,f.c);assert.equal(f.W.view(f.g).irritation,null);assert.equal(f.hits.length,0);near(state(f).clock,1.25);tick(f,.5);assert.equal(f.W.view(f.g).irritation,null);
});

test('collision-authoritative actual movement freezes animal photographic gait when blocked',()=>{
 const f=fixture([animal('boar',-15,{state:'crawl',rest:50})],{move:(x,z)=>[x,z]});const phase=f.W.view(f.g).animals[0].phase;tick(f,2);const a=f.W.view(f.g).animals[0];near(a.phase,phase);near(a.speed,0);assert.equal(a.moving,false);assert.equal(a.clip,'idle');
});

test('mammal perception reuses bounded short-lived rays but actual near contact still checks solid obstructions',()=>{
 let rays=0;const f=fixture([animal('tiger',-20)],{lineOfSight:()=>{rays++;return true;}});tick(f,1);assert.ok(rays>=4&&rays<=7,'Perception cache should avoid a full terrain ray every simulation frame: '+rays);
 const close=fixture([animal('boar',-1)],{lineOfSight:()=>true,solidAt:(x,z,r)=>Math.abs(z+.5)<r+.04});tick(close,5);assert.equal(close.hits.length,0);
});

test('loading/hidden travel synchronization never retroactively sweeps invisible creature contact',()=>{
 const f=fixture([animal('scorpion',0),animal('krait',0)]);f.g.evade.p[2]=1;state(f).previousP=f.g.evade.p.slice();tick(f,1);f.g.evade.p[2]=-.8;const clock=state(f).clock;assert.equal(f.W.synchronize(f.g),true);near(state(f).clock,clock);tick(f,.05);assert.equal(f.W.view(f.g).irritation,null);assert.equal(f.W.view(f.g).bite,null);
 f.g.paused=true;f.g.evade.p[2]=.8;f.W.step(f.g,.05,f.c);near(state(f).previousP[2],.8);near(state(f).clock,clock+.05);
});

test('confirmed pistol/knife hits interrupt only large-animal attacks, retain identity and allow retreat',()=>{
 for(const weapon of ['pistol','knife']){
  const f=fixture([animal('boar')]);tick(f,1.85);assert.equal(state(f).ecology.mammals[0].state,'charge');const list=f.W.targets(f.g);assert.equal(list.length,1);assert.equal(list[0].wildlife,true);list[0].p[0]=999;near(f.W.targets(f.g)[0].p[0],0);
  assert.equal(f.W.weaponHit(f.g,'test-boar',{weapon:'fists'}),false);assert.equal(f.W.weaponHit(f.g,'missing',{weapon}),false);assert.ok(f.W.weaponHit(f.g,'test-boar',{weapon}).retreat);tick(f,4);assert.equal(f.hits.length,0);assert.equal(state(f).ecology.mammals[0].state,'flee');assert.equal(f.g.evade.searchers.length,0);assert.equal(f.g.evade.cattle.length,0);
 }
});

test('snapshot/restore preserves charge direction, warning age and bounded effects without replaying cues',()=>{
 const f=fixture([animal('boar')]);tick(f,.8);const saved=f.W.snapshot(f.g),g=fixture();assert.equal(g.W.restore(g.g,saved),true);assert.equal(g.warnings.length,0);assert.equal(g.W.snapshot(g.g).ecology.mammals[0].stateAge,saved.ecology.mammals[0].stateAge);tick(g,.7);assert.equal(g.hits.length,0);assert.equal(g.W.view(g.g).animals[0].state,'warn');
 const before=JSON.stringify(g.W.snapshot(g.g)),bad=JSON.parse(JSON.stringify(saved));bad.ecology.mammals=Array(3).fill(bad.ecology.mammals[0]);assert.equal(g.W.restore(g.g,bad),false);assert.equal(JSON.stringify(g.W.snapshot(g.g)),before);
 const old=JSON.parse(JSON.stringify(saved));delete old.ecology;assert.equal(g.W.restore(g.g,old),true);assert.equal(g.W.view(g.g).animals.length,0);
});

test('malformed restored effects and nonfinite charge fields are rejected without mutating the current encounter',()=>{
 const f=fixture([animal('boar')]);tick(f,.5);const before=JSON.stringify(f.W.snapshot(f.g));
 for(const change of [s=>{s.ecology.mammals[0].stateAge=NaN;},s=>{s.ecology.mammals[0].chargeYaw=Infinity;},s=>{s.ecology.mammals[0].state='unknown';},s=>{s.ecology.injury={age:0,duration:9999,factor:.1};}]){const saved=f.W.snapshot(f.g);change(saved);assert.equal(f.W.restore(f.g,saved),false);assert.equal(JSON.stringify(f.W.snapshot(f.g)),before);}
});

test('natural extension spawning is deterministic, habitat-bound, safely distant and favors boar over rare tiger',()=>{
 function sample(cover=1){const f=fixture([],{coverAt:()=>cover});state(f).disableSpawns=false;const counts={};for(let i=0;i<3000;i++){const s=state(f),e=s.ecology;e.nextSpawn=s.clock;s.nextSpawn=1e9;s.snakes=[];e.mammals=[];e.crawlers=[];e.colonies=[];tick(f,.05);for(const n of e.mammals.concat(e.crawlers,e.colonies)){counts[n.kind]=(counts[n.kind]||0)+1;assert.ok(Math.hypot(n.p[0],n.p[2])>=13.9);}}return counts;}
 const a=sample(),b=sample();assert.equal(JSON.stringify(a),JSON.stringify(b));assert.ok(a.boar>150);assert.ok(a.tiger>0&&a.tiger<a.boar/4);assert.equal(Object.keys(sample(0)).length,0);
});
