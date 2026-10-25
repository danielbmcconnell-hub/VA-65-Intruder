'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/survival/ground-items.js'),'utf8'),clone=q=>JSON.parse(JSON.stringify(q));
function fixture(options={}){
 const window={},sandbox={window};vm.runInNewContext(source,sandbox);const D=window.GroundItems,notices=[],geometry={blocked:false,los:true,water:false,slope:false};let samples=0;
 const g={phase:'evade',t:0,evade:{p:[0,0,0],hdg:0,alive:true,weaponMode:'fists',searchers:[],locals:[],hasPistol:true,hasKnife:true,drawn:0},mis:{id:'m1'},world:{scenery:[]},app:{screen:'game'}};g.app.game=g;
 D.configure({terrainH:(x,z)=>{samples++;return geometry.slope?4+x*2:4;},solidAt:()=>geometry.blocked,dryAt:()=>!geometry.water,lineOfSight:()=>geometry.los,villageAt:()=>options.village!==false,notice:(g,s)=>notices.push(s)});
 return {D,g,window,geometry,notices,samples:()=>samples,step(dt=.1){g.t+=dt;return D.step(g,dt);}};
}
function approach(f,kind){const q=f.D.items(f.g).find(q=>q.kind===kind);assert.ok(q,'generated '+kind);f.g.evade.p=[q.p[0],0,q.p[2]+.4];f.g.evade.hdg=0;assert.equal(f.D.target(f.g)?.id,q.id);return q;}
test('deterministic finite natural supplies are physically grounded and hats require a real village context',()=>{
 const a=fixture(),b=fixture();a.step();b.step();assert.deepEqual(clone(a.D.items(a.g)),clone(b.D.items(b.g)));const items=a.D.items(a.g);assert.ok(items.length>15&&items.length<=64);for(const q of items){assert.equal(q.p[1],4.018);assert.ok(['food','foliage','hat','stick'].includes(q.kind));}assert.equal(items.some(q=>q.kind==='rifle'),false);
 const c=fixture({village:false});c.step();assert.equal(c.D.items(c.g).some(q=>q.kind==='hat'),false);assert.ok(c.D.items(c.g).some(q=>q.kind==='food'));
});
test('water, steep terrain and actual solid footprints cannot receive floating or embedded supplies',()=>{
 for(const key of ['water','slope','blocked']){const f=fixture();f.geometry[key]=true;f.step();assert.deepEqual(clone(f.D.items(f.g)),[],key);}
 const f=fixture();f.D.configure({terrainH:()=>-10});f.step();assert.deepEqual(clone(f.D.items(f.g)),[]);
});
test('native rising-edge pickup requires real reach, heading and low solid/visibility clearance',()=>{
 const f=fixture();f.step();const q=approach(f,'stick');f.g.evade.p[2]+=2;assert.equal(f.D.interact(f.g),false);f.g.evade.p[2]-=2;f.g.evade.hdg=Math.PI;assert.equal(f.D.interact(f.g),false);f.g.evade.hdg=0;
 f.geometry.los=false;assert.equal(f.D.interact(f.g),false);f.geometry.los=true;f.geometry.blocked=true;assert.equal(f.D.interact(f.g),false);f.geometry.blocked=false;assert.equal(f.D.pickup(f.g,'wrong-id'),false);assert.match(f.D.prompt(f.g),/F \/ Interact.*branch/i);
 assert.equal(f.D.handle(f.g,true),true);assert.equal(f.D.inventory(f.g).stick,true);assert.equal(f.g.evade.weaponMode,'stick');assert.deepEqual(clone(f.D.handItems(f.g)),{right:'stick',left:null});assert.equal(f.D.handle(f.g,true),false);assert.equal(f.D.items(f.g).some(x=>x.id===q.id),false);
});
test('fruit is consumed once, improves finite energy and preserves actual wounds and firearm ammunition',()=>{
 const f=fixture();f.step();f.g.evade.groundItems.energy=.2;f.g.evade.hurt=true;f.g.evade.rounds=3;const q=approach(f,'food'),before=f.D.movementFactor(f.g);assert.equal(f.D.pickup(f.g,q.id),true);const i=f.D.inventory(f.g);assert.equal(i.foodEaten,1);assert.equal(i.energy,.45);assert.ok(f.D.movementFactor(f.g)>before);assert.equal(f.g.evade.hurt,true);assert.equal(f.g.evade.rounds,3);assert.equal(f.D.pickup(f.g,q.id),false);
 for(let n=0;n<100;n++)f.step(.25);assert.equal(f.D.items(f.g).some(x=>x.id===q.id),false);assert.equal(f.D.inventory(f.g).foodEaten,1);
});
test('foliage has a real movement/visibility tradeoff and neither cover nor hat conceals close contact or an established sighting',()=>{
 const f=fixture();f.step();approach(f,'foliage');assert.equal(f.D.interact(f.g),true);assert.ok(f.D.movementFactor(f.g)<.9);assert.ok(f.D.visibilityFactor(f.g,40)<.75);assert.equal(f.D.visibilityFactor(f.g,8),1);assert.equal(f.D.visibilityFactor(f.g,40,{seen:true}),1);
 const walking=f.D.visibilityFactor(f.g,40);f.g.evade.running=true;assert.ok(f.D.visibilityFactor(f.g,40)>walking);f.g.evade.running=false;approach(f,'hat');assert.equal(f.D.interact(f.g),true);assert.equal(f.D.inventory(f.g).hat,true);assert.ok(f.D.visibilityFactor(f.g,40)<walking);assert.deepEqual(clone(f.D.handItems(f.g)),{right:null,left:null});assert.equal(f.D.equip(f.g,'foliage'),true);assert.equal(f.D.inventory(f.g).foliage,false);
});
test('only an observed live armed NVA that really becomes incapacitated can drop a finite rifle',()=>{
 const f=fixture(),nva={id:'real-nva',kind:'nva',p:[1,0,-1],alive:true,armed:true,ammo:5};f.g.evade.searchers=[nva];assert.equal(f.D.dropped(f.g,nva),false);f.step();assert.equal(f.D.items(f.g).some(x=>x.kind==='rifle'),false);
 nva.stunUntil=f.g.t+10;f.step();const rifles=f.D.items(f.g).filter(x=>x.kind==='rifle');assert.equal(rifles.length,1);assert.equal(rifles[0].ammo,5);assert.equal(nva.armed,false);for(let n=0;n<10;n++)f.step();assert.equal(f.D.items(f.g).filter(x=>x.kind==='rifle').length,1);assert.equal(f.D.dropped(f.g,nva),false);
 for(const kind of ['farmer','vc','militia']){const q={kind,p:[2,0,-2],alive:true,armed:true};f.g.evade.locals=[q];f.step();q.alive=false;f.step();assert.equal(f.D.dropped(f.g,q),false);}assert.equal(f.D.items(f.g).filter(x=>x.kind==='rifle').length,1);
 const dead={kind:'nva',p:[3,0,-3],alive:false,armed:true};f.g.evade.locals=[dead];f.step();assert.equal(f.D.dropped(f.g,dead),false,'preexisting corpses do not generate unlimited rifles');
});
test('rifle pickup uses both hands, finite separate ammunition and one accepted spend per explicit firing call',()=>{
 const f=fixture(),nva={id:'ammo',kind:'nva',p:[1,0,-1],alive:true,armed:true,rifleAmmo:3};f.g.evade.searchers=[nva];f.g.evade.rounds=6;f.step();nva.alive=false;f.step();approach(f,'rifle');assert.equal(f.D.interact(f.g),true);assert.equal(f.g.evade.weaponMode,'rifle');assert.deepEqual(clone(f.D.handItems(f.g)),{right:'rifle',left:'rifle'});assert.equal(f.D.rifleAmmo(f.g),3);
 f.g.paused=true;assert.equal(f.D.spendRifle(f.g),false);f.g.paused=false;for(let n=0;n<3;n++)assert.equal(f.D.spendRifle(f.g),true);assert.equal(f.D.spendRifle(f.g),false);assert.equal(f.D.rifleAmmo(f.g),0);assert.equal(f.g.evade.rounds,6);assert.equal(f.D.equip(f.g,'fists'),true);assert.equal(f.D.spendRifle(f.g),false);assert.deepEqual(clone(f.D.handItems(f.g)),{right:null,left:null});
});
test('the actual strike can atomically observe a newly spawned living roster member before incapacitation, never an invented or already dead actor',()=>{
 const f=fixture(),actor={id:'new-live-nva',kind:'nva',p:[0,0,-1],alive:true,armed:true};assert.equal(f.D.observe(f.g,actor),false);f.g.evade.searchers.push(actor);assert.equal(f.D.observe(f.g,actor),true);actor.alive=false;assert.equal(f.D.dropped(f.g,actor),true);assert.equal(f.D.items(f.g).filter(q=>q.kind==='rifle').length,1);assert.equal(f.D.observe(f.g,actor),false);assert.equal(f.D.dropped(f.g,actor),false);
});
test('pauses, capture, swimming, frozen actors and replaced missions cannot spawn, loot, heal or spend ammunition',()=>{
 for(const flag of ['paused','capture','swimming','frozen','held','handsUp','replaced']){const f=fixture();f.step();approach(f,'food');const before=clone(f.D.snapshot(f.g));if(flag==='paused')f.g.paused=true;else if(flag==='capture')f.g._capturePending=true;else if(flag==='replaced')f.g.app.game={};else f.g.evade[flag]=true;assert.equal(f.step(1),false,flag);assert.equal(f.D.interact(f.g),false,flag);assert.equal(f.D.spendRifle(f.g),false);assert.deepEqual(clone(f.D.inventory(f.g)),before.inventory);}
});
test('real prison chapters confiscate new arms and cover without granting a pistol, knife, ammo or a prison pickup',()=>{
 for(const stage of ['cell','compound','solitary','regular']){const f=fixture();f.step();Object.assign(f.g.evade.groundItems,{stick:true,rifle:true,rifleAmmo:20,foliage:true,hat:true});f.g.evade.weaponMode='rifle';f.g.evade.drawn=1;f.g.evade.hasPistol=false;f.g.evade.hasKnife=false;f.g.pow={stage};assert.equal(f.step(),false);const i=f.D.inventory(f.g);assert.equal(i.rifle,false);assert.equal(i.rifleAmmo,0);assert.equal(i.stick,false);assert.equal(i.foliage,false);assert.equal(i.hat,false);assert.equal(f.g.evade.weaponMode,'fists');assert.equal(f.g.evade.hasPistol,false);assert.equal(f.g.evade.hasKnife,false);assert.deepEqual(clone(f.D.items(f.g)),[]);assert.equal(f.D.snapshot(f.g),null);}
});
test('valid checkpoints preserve finite remaining drops and consumed ids; malformed or cross-mission states cannot mint equipment',()=>{
 const f=fixture();f.step();const q=approach(f,'food');f.D.interact(f.g);const saved=clone(f.D.snapshot(f.g)),next=fixture();assert.equal(next.D.restore(next.g,saved),true);assert.deepEqual(clone(next.D.inventory(next.g)),saved.inventory);next.step();assert.equal(next.D.items(next.g).some(x=>x.id===q.id),false);
 for(const change of [s=>s.mission='different',s=>s.epoch='solitary',s=>s.inventory.rifleAmmo=999,s=>s.items.push(s.items[0]),s=>s.items[0].p[0]=NaN,s=>s.items[0].id=s.consumed[0],s=>s.cells=new Array(257).fill('x')]){const broken=clone(saved);change(broken);const before=clone(next.D.inventory(next.g));assert.equal(next.D.restore(next.g,broken),false);assert.deepEqual(clone(next.D.inventory(next.g)),before);}
 const badGround=fixture();badGround.geometry.water=true;assert.equal(badGround.D.restore(badGround.g,saved),true);assert.deepEqual(clone(badGround.D.items(badGround.g)),[],'saved props cannot float after terrain changes');
});
test('render and inspect return detached descriptors and cannot move originals, grant loot or advance simulation',()=>{
 const f=fixture();f.step();const before=clone(f.D.snapshot(f.g)),items=f.D.items(f.g);items[0].p[1]=999;const inventory=f.D.inventory(f.g);inventory.rifle=true;const info=f.D.inspect(f.g);info.inventory.energy=0;for(let n=0;n<30;n++){f.D.items(f.g);f.D.target(f.g);f.D.prompt(f.g);f.D.inspect(f.g);}assert.deepEqual(clone(f.D.snapshot(f.g)),before);assert.equal(f.D.inventory(f.g).rifle,false);
});
test('spawn scans and retained item/cell ledgers remain bounded during long travel and never regenerate a consumed cell',()=>{
 const f=fixture();f.step();const q=approach(f,'food');f.D.interact(f.g);for(let n=0;n<1200;n++){f.g.evade.p=[n*12,0,0];f.step(.25);const s=f.D.inspect(f.g);assert.ok(s.items<=64&&s.cells<=256&&s.consumed<=1024);}f.g.evade.p=[q.p[0],0,q.p[2]+.4];for(let n=0;n<12;n++)f.step(.25);assert.equal(f.D.items(f.g).some(x=>x.id===q.id),false);assert.equal(f.D.inspect(f.g).cells,256);
});
test('original pistol and knife hand ownership works before any new pickup state exists',()=>{
 const f=fixture();f.g.evade.weaponMode='pistol';f.g.evade.drawn=1;assert.deepEqual(clone(f.D.handItems(f.g)),{right:'pistol',left:null});f.g.evade.drawn=0;assert.deepEqual(clone(f.D.handItems(f.g)),{right:null,left:null});f.g.evade.weaponMode='knife';assert.deepEqual(clone(f.D.handItems(f.g)),{right:'knife',left:null});
});
test('explicit physical street-to-river transfers carry inventory but never teleport old world props or bypass confiscation',()=>{
 const f=fixture();f.step();approach(f,'stick');f.D.interact(f.g);const saved=f.D.snapshot(f.g),next=fixture();next.g.pow={stage:'river',base:[0,4,0],river:{waterY:4,mode:'bank'}};assert.equal(next.D.restore(next.g,saved),false);assert.equal(next.D.carry(next.g,saved),true);assert.equal(next.D.inventory(next.g).stick,true);assert.equal(next.D.items(next.g).length,0);next.g.pow.stage='solitary';assert.equal(next.D.carry(next.g,saved),false);const other=fixture();other.g.mis.id='m2';assert.equal(other.D.carry(other.g,saved),false);
});
test('null current games, ready screens and hidden documents cannot mutate an abandoned or obscured actor',()=>{
 for(const mode of ['null','ready','hidden','dead']){const f=fixture();f.step();approach(f,'food');const inv=clone(f.D.inventory(f.g));if(mode==='null')f.g.app.game=null;else if(mode==='ready')f.g.app.screen='ready';else if(mode==='hidden')f.window.document={visibilityState:'hidden'};else f.g.evade.alive=false;assert.equal(f.step(),false);assert.equal(f.D.interact(f.g),false);assert.equal(f.D.equip(f.g,'fists'),false);assert.deepEqual(clone(f.D.inventory(f.g)),inv);}
});
test('actual POW.begin and POW.save transfer field inventory, store it before checkpoint writes, restore finite state and confiscate on prison entry',()=>{
 const f=fixture();f.step();approach(f,'stick');f.D.interact(f.g);const document={getElementById:()=>null,body:{classList:{toggle(){}}}},stored=new Map();
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/pow/core.js'),'utf8'),{window:f.window,document});const P=f.window.POW;P.mountUI=P.updateUI=P.activate=()=>{};P.ctx={terrainH:()=>4,Store:{get:(key,fallback)=>stored.has(key)?stored.get(key):fallback,set:(key,value)=>stored.set(key,clone(value))}};
 P.begin(f.g,'hanoi');assert.equal(f.D.inventory(f.g).stick,true);const saved=P.save(f.g);assert.equal(saved.groundItems.epoch,'hanoi');assert.equal(stored.get('pow_checkpoint').groundItems.inventory.stick,true,'actual stored snapshot includes carried supplies');
 f.g.evade.groundItems.stick=false;P.begin(f.g,'hanoi',saved);assert.equal(f.D.inventory(f.g).stick,true);assert.equal(f.D.inventory(f.g).rifleAmmo,0);P.begin(f.g,'cell');assert.equal(f.D.inventory(f.g).stick,false);assert.equal(P.save(f.g).groundItems,undefined);assert.equal(f.g.evade.hasPistol,false);assert.equal(f.g.evade.hasKnife,false);
});
