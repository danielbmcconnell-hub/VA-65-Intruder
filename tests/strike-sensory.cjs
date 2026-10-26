'use strict';
// Read-only production effects and geometry queries. These are domain checks;
// the separate strike-sensory browser suite captures real WebGL output.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),source=fs.readFileSync(path.join(root,'assets/flight/strike-effects.js'),'utf8');
const baseline=cp.execFileSync('git',['show','2424d08:assets/flight/strike-effects.js'],{cwd:root,encoding:'utf8'}),copy=x=>JSON.parse(JSON.stringify(x));
function fixture(q=1,code=source){let randomCalls=0;const math=Object.create(Math);math.random=()=>{randomCalls++;return .375};const window={},ctx={window,Math:math,console,TAU:Math.PI*2,PI:Math.PI,rnd:(a=0,b=1)=>a+(b-a)*math.random()};vm.createContext(ctx);vm.runInContext(code,ctx);vm.runInContext(html.slice(html.indexOf('class FX {'),html.indexOf('const AC ='))+'\nwindow.FX=FX;',ctx);const w={t:0,rend:{quality:q},fx:new window.FX(),targets:[],secs:[],fires:[],score:{hits:0,killed:0}};return {E:window.FlightStrikeEffects,w,randomCalls:()=>randomCalls};}
function due(f,kind){const t={kind,p:[0,2,0],r:12,alive:false,hp:0,hp0:45,burn:1};f.w.targets.push(t);assert.equal(f.E.destroyed(f.w,t),true);const q=f.w.secs[0];f.w.t=q.at;assert.equal(f.E.secondary(f.w,q),true);return {t,q};}
test('genuinely due fuel and ammunition cook-offs have distinct visible colour and duration',()=>{const fuel=fixture(),ammo=fixture();due(fuel,'pol');due(ammo,'depot');const f=fuel.E.inspect(fuel.w).flashes[0],a=ammo.E.inspect(ammo.w).flashes[0];assert.equal(f.style,'fuel');assert.equal(a.style,'ammunition');assert.ok(f.duration>a.duration*2);const fl=fuel.E.lights(fuel.w,[0,30,80],1)[0],al=ammo.E.lights(ammo.w,[0,30,80],1)[0];assert.ok(fl[5][1]<al[5][1]);fuel.w.t+=.65;ammo.w.t+=.65;assert.equal(fuel.E.lights(fuel.w,[0,30,80],1).length,1);assert.equal(ammo.E.lights(ammo.w,[0,30,80],1).length,0);assert.equal(fuel.w.score.hits,0);assert.equal(ammo.w.score.hits,0);});
test('stronger primary bursts retain original RNG, score and bounded particle admission during ripples',()=>{
 for(const q of [0,1,2])for(const count of [0,1000,1499,1501]){
  const current=fixture(q),old=fixture(q,baseline);
  for(const f of [current,old]){f.w.fx.add=Array.from({length:count},()=>({existing:true}));
   for(let n=0;n<18;n++){f.w.fx.explosion([0,2,0],1.6,true);f.E.impact(f.w,[n*2,2,0],1.6,{surface:'land'});}}
  assert.equal(current.randomCalls(),old.randomCalls(),`quality${q}/initial${count}`);
  assert.deepEqual(copy(current.w.fx.add),copy(old.w.fx.add));assert.deepEqual(copy(current.w.fx.smk),copy(old.w.fx.smk));
  assert.ok(current.E.particles(current.w).length<=192);if(count===0)assert.ok(current.E.particles(current.w).some(p=>p.life>1&&p.c[0]===1));
  assert.deepEqual(copy(current.w.score),copy(old.w.score));assert.equal(current.w.secs.length,0);
 }
});
test('water and airborne impacts preserve original additive admission and smoke random draws',()=>{
 for(const surface of ['water','air']){const current=fixture(),old=fixture(1,baseline);
  for(const f of [current,old])f.E.impact(f.w,[0,100,0],1.6,{surface});
  assert.equal(current.randomCalls(),old.randomCalls());assert.deepEqual(copy(current.w.fx.add),copy(old.w.fx.add));assert.deepEqual(copy(current.w.fx.smk),copy(old.w.fx.smk));}
});
test('briefed tower matches the actual grounded instance and never adds a target identity',()=>{const window={},ctx={window,Math,Number,console};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'assets/flight/strike-scene.js'),'utf8'),ctx);const F=window.FlightStrikeScene;F.configure({terrainH:()=>12});const g={mis:{id:'m2'},phase:'attack',strikeExperience:{},ac:{alive:true},world:{briefed:[0,12,0],targets:[],t:0}},before=JSON.stringify(g),chart=F.chart(g),tower=chart.features.find(f=>f.id==='dixie-water-tower'),model=F.inspect(g).items.find(i=>i.mesh==='bnStrikeTower');assert.ok(tower&&model);assert.deepEqual(copy(tower.p),copy(model.p));assert.equal(tower.briefed,true);assert.match(tower.signature,/band/);assert.equal(tower.targetId,undefined);assert.equal(tower.confirmed,undefined);assert.equal(JSON.stringify(g),before);});
