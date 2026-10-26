'use strict';
// Actual roster, checkpoint and photographic-identity owners. Native WebGL is
// verified separately; these checks do not establish physical-device visuals.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),clone=v=>JSON.parse(JSON.stringify(v));
function fixture(stage='cell'){
 const storage=new Map(),document={body:{classList:{toggle(){}}},getElementById(){return null;},pointerLockElement:null,activeElement:null};
 const window={document},sandbox={window,document,console,Date};vm.createContext(sandbox);
 for(const file of ['assets/pow/core.js','assets/pow/ai.js','assets/pow/regular-confinement.js','assets/render/photographic-sprites.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file});
 const P=window.POW;P.mountUI=P.updateUI=P.activate=()=>{};
 P.ctx={terrainH:()=>5,Store:{get:(key,d)=>storage.has(key)?storage.get(key):d,set:(key,v)=>storage.set(key,clone(v))}};
 const game={ac:{p:[120,8,300]},app:{keys:{},gctl:{},set:{sound:0}},world:{_cells:new Map()},setHour(){}};
 P.begin(game,stage);return {game,P,photos:window.PhotoSprites,storage};
}
function expectedSoldiers(f){
 assert.ok(f.game.evade.searchers.length>0);
 for(const a of f.game.evade.searchers){assert.equal(a.kind,'nva',a.id);assert.equal(f.photos.identity(a),'nva',a.id);assert.equal(f.photos.describe(a,{camera:f.game.evade.p}).photoName,'nva',a.id);}
 assert.equal(f.game.evade.locals.length,0);assert.equal((f.game.evade.cattle||[]).length,0);
}
for(const stage of ['cell','compound','solitary','regular'])test(stage+' constructs only North Vietnamese military identities with real role-specific patrols',()=>{
 const f=fixture(stage);expectedSoldiers(f);
 const roster=f.game.evade.searchers;assert.equal(new Set(roster.map(a=>a.id)).size,roster.length);assert.ok(roster.some(a=>a.lamp));assert.ok(new Set(roster.map(a=>JSON.stringify(a.route))).size>1);
 const before=roster.map(a=>({actor:a,route:JSON.stringify(a.route),p:JSON.stringify(a.p),alive:a.alive}));f.P.AI.enforcePrisonRoster(f.game);
 before.forEach((b,i)=>{assert.equal(f.game.evade.searchers[i],b.actor);assert.equal(JSON.stringify(b.actor.route),b.route);assert.equal(JSON.stringify(b.actor.p),b.p);assert.equal(b.actor.alive,b.alive);});
});
test('cell-to-compound transition keeps the same actual guards and their acquired state',()=>{
 const f=fixture('cell'),list=f.game.evade.searchers,guard=list.find(a=>a.id==='west-watch');guard.wounds=2;guard.stunUntil=17;guard.state='investigate';const route=JSON.stringify(guard.route);
 f.P.transition(f.game,'compound');expectedSoldiers(f);assert.equal(f.game.evade.searchers,list);assert.equal(f.game.evade.searchers.find(a=>a.id==='west-watch'),guard);assert.equal(guard.wounds,2);assert.equal(guard.stunUntil,17);assert.equal(guard.state,'investigate');assert.equal(JSON.stringify(guard.route),route);
});
test('legacy prison snapshots migrate guard duties and remove misplaced civilians without arming them',()=>{
 const f=fixture('compound'),saved=f.P.AI.snapshot(f.game),a=saved.actors[0];a.kind='vc';a.armed=true;a.wounds=3;a.stunUntil=19;a.lastKnown=[124,5,289];a.state='search';a.path=[[120,5,290],[121,5,290]];
 const civilian={...clone(a),id:'misplaced-farmer',kind:'farmer',armed:false};saved.actors=[a,civilian,{...clone(civilian),id:'cow',kind:'cow'}];const old=clone(saved);f.game.evade.locals=[{kind:'vc',armed:true,p:[120,5,300]}];f.game.evade.cattle=[{p:[120,5,300]}];assert.equal(f.P.AI.restore(f.game,saved),true);expectedSoldiers(f);assert.equal(f.game.evade.searchers.length,1);const restored=f.game.evade.searchers[0];
 assert.equal(restored.kind,'nva');assert.equal(restored.armed,true);assert.equal(restored.wounds,3);assert.equal(restored.stunUntil,19);assert.equal(restored.state,'search');assert.deepEqual(clone(restored.lastKnown),old.actors[0].lastKnown);assert.deepEqual(clone(restored.path),old.actors[0].path);assert.deepEqual(clone(saved),old);assert.equal(civilian.armed,false);
});
test('an entirely civilian legacy prison snapshot uses the genuine chapter guard roster, but empty/dead rosters stay empty/dead',()=>{
 const f=fixture('solitary'),current=f.game.evade.searchers.slice(),saved=f.P.AI.snapshot(f.game);saved.actors=[{...saved.actors[0],kind:'farmer',armed:false}];assert.equal(f.P.AI.restore(f.game,saved),true);expectedSoldiers(f);assert.equal(f.game.evade.searchers[0],current[0]);
 const dead=f.P.AI.snapshot(f.game);dead.actors.forEach(a=>a.alive=false);f.P.AI.restore(f.game,dead);assert.ok(f.game.evade.searchers.every(a=>a.alive===false));dead.actors=[];f.P.AI.restore(f.game,dead);assert.equal(f.game.evade.searchers.length,0);
});
test('prison save and first AI step cannot retain misplaced countryside residents or VC appearances',()=>{
 const f=fixture('compound'),a=f.game.evade.searchers[0];a.kind='militia';f.game.evade.searchers.push(f.P.AI.makeActor({kind:'farmer',p:f.game.evade.p.slice()}));f.game.evade.locals=[{kind:'farmer'}];f.game.evade.cattle=[{}];const snapshot=f.P.AI.snapshot(f.game);expectedSoldiers(f);assert.ok(snapshot.actors.every(a=>a.kind==='nva'));a.kind='female_vc';f.P.AI.step(f.game,.01);assert.equal(a.kind,'nva');
});
test('legacy camp guards become real NVA identities without changing their original position or route',()=>{
 const f=fixture('cell');delete f.game.pow;const e=f.game.evade,actor={p:[120,0,300],route:[[120,0,300],[125,0,300]],alive:true,seen:1,face:0};e.searchers=[actor];e.locals=[{kind:'farmer'}];e.cattle=[{}];const p=actor.p,route=actor.route;
 assert.equal(f.P.AI.enforcePrisonRoster(f.game),true);assert.equal(e.searchers[0],actor);assert.equal(actor.kind,'nva');assert.equal(actor.armed,true);assert.equal(actor.p,p);assert.equal(actor.route,route);assert.equal(f.photos.identity(actor),'nva');assert.equal(e.locals.length,0);assert.equal(e.cattle.length,0);
});
test('Hanoi streets and river countryside retain their farmers, VC, militia and cattle',()=>{
 const f=fixture('hanoi'),kinds=f.game.evade.searchers.map(a=>a.kind);assert.ok(kinds.includes('farmer'));assert.ok(kinds.includes('vcFem'));assert.ok(kinds.includes('militia'));const local={kind:'farmer',armed:false},cow={p:[0,0,0]};f.game.evade.locals=[local];f.game.evade.cattle=[cow];const list=f.game.evade.searchers;assert.equal(f.P.AI.enforcePrisonRoster(f.game),false);assert.equal(f.game.evade.searchers,list);assert.equal(f.game.evade.locals[0],local);assert.equal(f.game.evade.cattle[0],cow);assert.deepEqual(f.game.evade.searchers.map(a=>a.kind),kinds);
 const saved=f.P.AI.snapshot(f.game);f.P.AI.restore(f.game,saved);assert.deepEqual(f.game.evade.searchers.map(a=>a.kind),kinds);f.game.pow.stage='river';assert.equal(f.P.AI.enforcePrisonRoster(f.game),false);assert.equal(f.game.evade.locals[0],local);
});
