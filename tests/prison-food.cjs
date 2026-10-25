'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(stage='solitary'){
 const window={},sandbox=vm.createContext({window});
 for(const file of ['core.js','captivity.js','regular-confinement.js','prison-food.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow',file),'utf8'),sandbox);
 const P=window.POW,saves=[];P.notify=()=>{};P.save=g=>saves.push(clone(g.pow));P.updateUI=P.activate=P.mountUI=()=>{};
 P.ctx={terrainH:()=>0,Store:{get:(k,d)=>d,set(){}}};
 class MB{constructor(){this.calls=[];}box(...args){this.calls.push(['box',...args]);}blob(...args){this.calls.push(['blob',...args]);}quad(...args){this.calls.push(['quad',...args]);}tri(...args){this.calls.push(['tri',...args]);}}
 class Game{update(dt){this.pow.time+=dt;this.evade.p[0]+=dt;this.updates++;}render(){this.renders++;}}
 const game=new Game();Object.assign(game,{phase:'evade',updates:0,renders:0,pow:{stage:'solitary',base:[100,20,300],day:1,time:0,difficulty:'normal',intensity:'standard',flags:{},inventory:{},stats:{physical:65,fatigue:25,resilience:60,morale:60,memory:60,hope:60},solids:[],objects:[],surfaces:[]},evade:{p:[100,20,300],searchers:[],locals:[]},campGeo:[],app:{keys:{KeyW:1},gctl:{pitch:1},set:{sound:0}},rend:{meshes:{},meshFromBuilder(name,m){this.meshes[name]=m;}},setHour(){},mis:{title:'Coker · 1967'}});game.app.game=game;
 P.Captivity.enter(game);if(stage==='regular'){game.pow.stage='regular';game.pow.regular=P.RegularConfinement.initial();P.RegularConfinement.build(game);}
 const Food=window.PrisonFood;Food.install({Game,MB});Food.prepare(game);
 const object=game.pow.objects.find(o=>o.id===(stage==='regular'?'regular-meal':'cell-tray'));
 return {game,P,Food,object,saves};
}
for(const stage of ['solitary','regular'])test(stage+' ration inspection invokes the real daily meal once and persists only its original effects',()=>{
 const {game,P,Food,object,saves}=fixture(stage),initial=clone(game.pow.stats),day=game.pow.day;
 assert.ok(object);assert.equal(object.action(game),true);assert.equal(Food.active(game),true);assert.equal(game.pow.modalOpen,true);assert.equal(Food.eaten(game),false);assert.deepEqual(clone(game.pow.stats),initial);
 const time=game.pow.time,position=clone(game.evade.p);game.update(5);assert.equal(game.pow.time,time);assert.deepEqual(clone(game.evade.p),position);assert.equal(game.app.keys.KeyW,0);
 game.paused=true;assert.equal(Food.consume(game),false);game.paused=false;assert.equal(Food.consume(game),true);assert.equal(Food.eaten(game),true);assert.equal(game.pow.day,day);const after=clone(game.pow.stats),n=saves.length;
 assert.equal(Food.consume(game),false);assert.deepEqual(clone(game.pow.stats),after);assert.equal(saves.length,n);assert.ok(n>0);
 if(stage==='regular'){assert.equal(after.physical,initial.physical+3);assert.equal(after.morale,initial.morale+1);}else{assert.ok(after.physical>initial.physical);assert.ok(after.fatigue<initial.fatigue);}
 Food.close();assert.equal(Food.active(game),false);assert.equal(game.pow.modalOpen,undefined);game.update(.1);assert.equal(game.updates,1);
 game.pow.day++;assert.equal(Food.eaten(game),false);assert.equal(object.action(game),true);assert.equal(Food.consume(game),true);Food.close();
});
test('inspection closes safely when a mission, actor or captivity chapter is replaced',()=>{
 for(const kind of ['mission','ready','actor','chapter']){const {game,Food,object}=fixture();object.action(game);const original=game.pow;
  if(kind==='mission')game.app.game={};else if(kind==='ready'){game.app.game=null;game.app.screen='ready';}else if(kind==='actor')game.evade={p:[0,0,0]};else game.pow={...game.pow,stage:'river'};
  assert.equal(Food.active(game),false);assert.equal(original.modalOpen,undefined);assert.equal(Food.consume(game),false);
 }
});
test('food presentation keeps original tray position, dimensions, collision solids and interaction anchors',()=>{
 const {game,Food}=fixture(),before=clone({geo:game.campGeo,solids:game.pow.solids,objects:game.pow.objects.map(o=>({id:o.id,p:o.p,radius:o.radius}))});
 const tray=game.campGeo.find(x=>x.id==='tray'),full=Food.decorate(game,tray);assert.equal(full.m,'prisonRationFull');assert.deepEqual(clone(full.p),clone(tray.p));assert.deepEqual(clone(full.scale),clone(tray.scale));assert.equal(tray.m,'powMetal');
 game.pow.captivity.daily.meal=game.pow.day;assert.equal(Food.decorate(game,tray).m,'prisonRationEmpty');
 assert.deepEqual(clone({geo:game.campGeo,solids:game.pow.solids,objects:game.pow.objects.map(o=>({id:o.id,p:o.p,radius:o.radius}))}),before);
 const fullMesh=game.rend.meshes.prisonRationFull,empty=game.rend.meshes.prisonRationEmpty;assert.ok(fullMesh&&empty);assert.equal(fullMesh.calls.filter(c=>c[0]==='blob').length-empty.calls.filter(c=>c[0]==='blob').length,48);
 for(const m of [fullMesh,empty])for(const c of m.calls)assert.ok(c.slice(1).flat(Infinity).every(Number.isFinite));
});
test('food view cannot bypass another modal, paused play or unsupported gameplay stages',()=>{
 const {game,Food,object}=fixture();game.pow.modalOpen=true;assert.equal(object.action(game),false);game.pow.modalOpen=false;game.paused=true;assert.equal(object.action(game),false);game.paused=false;game.pow.stage='river';assert.equal(object.action(game),false);assert.equal(Food.active(game),false);
});
test('ration and materials preserve unchanged generated originals and declared exact-lossless encoded streams',()=>{
 const folder=path.join(__dirname,'../assets/prison'),p=JSON.parse(fs.readFileSync(path.join(folder,'provenance.json')));
 for(const [name,a]of Object.entries(p.assets))for(const [suffix,expected]of [['png',a.sourceSHA256],['webp',a.runtimeSHA256]])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(folder,name+'.'+suffix))).digest('hex'),expected);
 assert.equal(p.assets.materials.alpha.min,255);assert.ok(p.assets.ration.alpha.transparentPixels>800000);assert.ok(p.assets.ration.size[0]>=1500);assert.ok(p.assets.ration.allDecodedRGBAIdentical);
});
