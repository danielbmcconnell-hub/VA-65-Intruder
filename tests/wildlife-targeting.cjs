'use strict';
// Real production sight direction and wildlife dimensions; no browser/GPU.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function fixture(kind='boar',p=[0,10,-4]){
  const window={document:{hidden:false,visibilityState:'visible'}};
  for(const file of ['ground-combat.js','wildlife.js','wildlife-targeting.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'assets/survival',file),'utf8'),{window});
  const e={p:[0,10,0],hdg:0,look:0,searchers:[],locals:[],cattle:[]},g={phase:'evade',t:0,evade:e};
  window.Wildlife.enter(g,{seed:17,disableSpawns:true,encounters:[{id:'animal',kind,p,yaw:0}]});
  return {W:window.Wildlife,T:window.WildlifeTargeting,C:window.GroundCombat,g,e,options:{floorAt:()=>10,lineOfSight:()=>true}};
}
function aim(f,point,eye=f.e.crouch?1.16:1.68){
  const dx=point[0]-f.e.p[0],dz=point[2]-f.e.p[2],slope=(point[1]-(10+eye))/Math.hypot(dx,dz);
  f.e.hdg=Math.atan2(dx,-dz);f.e.look=Math.atan(slope)+Math.asin(.04/Math.sqrt(1+slope*slope));
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('mammal targets carry canonical full body dimensions without mutating simulation state',()=>{
  for(const [kind,length,width,height]of [['boar',1.65,.7,.95],['tiger',2.65,.68,1.05]]){
    const f=fixture(kind),before=JSON.stringify(f.W.snapshot(f.g)),a=f.W.targets(f.g)[0];
    near(a.length,length);near(a.width,width);near(a.height,height);a.length=99;a.p[0]=99;
    assert.equal(JSON.stringify(f.W.snapshot(f.g)),before);near(f.W.targets(f.g)[0].length,length);
  }
});

test('visible boar flank and tiger shoulder are hittable beyond the old human-sized centre capsule',()=>{
  for(const [kind,x,height]of [['boar',.6,.95],['tiger',1.1,1.05]]){
    const f=fixture(kind,[x,10,-4]);aim(f,[0,10+height*.5,-4]);
    const actors=f.W.targets(f.g),old=f.C.target(f.g,{...f.e,searchers:actors},{...f.options,bodyHeight:a=>a.height});
    assert.equal(old,null,'The old human-radius sight missed this visible body surface');
    const hit=f.T.target(f.g,f.e,f.options);assert.equal(hit?.actor.id,'animal');assert.equal(hit.assisted,false);
    assert.ok(hit.rayDistance>0&&hit.rayDistance<5);assert.ok(hit.hitPoint.every(Number.isFinite));
  }
});

test('the tiger head/shoulder region is part of its full body rather than only its centre',()=>{
  const f=fixture('tiger');aim(f,[1,10.6,-4]);const hit=f.T.target(f.g,f.e,f.options);
  assert.equal(hit?.actor.kind,'tiger');assert.ok(hit.hitPoint[0]>.8);
});

test('real animal height excludes shots above the body and targets behind the player',()=>{
  const f=fixture();aim(f,[0,11.3,-4]);assert.equal(f.T.target(f.g,f.e,f.options),null);
  aim(f,[0,10.44,-4]);const behind={...f.W.targets(f.g)[0],p:[0,10,4]};
  assert.equal(f.T.target(f.g,f.e,{...f.options,actors:[behind]}),null);
});

test('static obstruction and an intervening terrain rise both block the actual animal view ray',()=>{
  const f=fixture();aim(f,[0,10.44,-4]);assert.ok(f.T.target(f.g,f.e,f.options));
  assert.equal(f.T.target(f.g,f.e,{...f.options,lineOfSight:()=>false}),null);
  assert.equal(f.T.target(f.g,f.e,{...f.options,floorAt:p=>p[2]<-1&&p[2]>-2?12:10}),null);
});

test('nearest physical mammal surface wins regardless of actor-list order',()=>{
  const f=fixture();f.e.crouch=true;aim(f,[0,10.68,-4]);
  const a=f.W.targets(f.g)[0],b={...a,id:'farther',kind:'tiger',p:[0,10,-7],length:2.65,width:.72,height:.95};
  for(const actors of [[a,b],[b,a]])assert.equal(f.T.target(f.g,f.e,{...f.options,actors})?.actor.id,'animal');
});

test('existing exact human and cattle surfaces retain nearer ray distances than wildlife behind them',()=>{
  for(const cow of [false,true]){
    const f=fixture();aim(f,[0,10.44,-4]);const actor={kind:cow?'cow':'nva',p:[0,10,-2],alive:true};
    (cow?f.e.cattle:f.e.searchers).push(actor);
    const original=JSON.stringify(actor),old=f.C.target(f.g,f.e,f.options),animal=f.T.target(f.g,f.e,f.options);
    assert.equal(old.actor,actor);assert.equal(old.assisted,false);assert.ok(old.rayDistance<animal.rayDistance);
    assert.equal(JSON.stringify(actor),original);assert.equal(animal.actor.wildlife,true);
  }
});

test('crouched eye height and direct overlap remain finite without inflating the animal body',()=>{
  const f=fixture();f.e.crouch=true;aim(f,[0,10.44,-4]);assert.ok(f.T.target(f.g,f.e,f.options));
  const animal={...f.W.targets(f.g)[0],p:[0,10,0]};
  const overlap=f.T.target(f.g,f.e,{...f.options,actors:[animal],eyeHeight:.44});near(overlap.rayDistance,0);
});

test('invalid body data, nonmammals and prison/river states cannot create a wildlife target',()=>{
  const f=fixture();aim(f,[0,10.44,-4]);const animal=f.W.targets(f.g)[0];
  for(const values of [{length:NaN},{length:0},{length:99},{height:Infinity},{height:0},{width:-1},{p:[NaN,10,-4]},{kind:'nva'},{alive:false},{wildlife:false}])
    assert.equal(f.T.target(f.g,f.e,{...f.options,actors:[{...animal,...values}]}),null);
  assert.equal(f.T.target({...f.g,pow:{stage:'cell'}},f.e,{...f.options,actors:[animal]}),null);
  assert.equal(f.T.target(f.g,{...f.e,river:true},{...f.options,actors:[animal]}),null);
  assert.equal(f.T.target(f.g,f.e,{...f.options,floorAt:()=>NaN}),null);
  assert.equal(f.T.target(f.g,f.e,{...f.options,actors:{malformed:true}}),null);
});

test('range and actual-ray terrain sampling remain bounded',()=>{
  const f=fixture('tiger',[0,10,-59]);aim(f,[0,10.475,-59]);let samples=0;
  const hit=f.T.target(f.g,f.e,{...f.options,floorAt:()=>{samples++;return 10;}});assert.ok(hit);
  assert.ok(samples<=f.T.limits.maxTerrainSamples+2);
  const a={...f.W.targets(f.g)[0],p:[0,10,-70]};assert.equal(f.T.target(f.g,f.e,{...f.options,actors:[a]}),null);
});
