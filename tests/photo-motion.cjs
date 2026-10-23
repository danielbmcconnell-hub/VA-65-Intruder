'use strict';
// Measured locomotion tests. No browser/GPU or reconstruction of the renderer.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function fixture(kind='nva'){
  const window={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/render/photo-motion.js'),'utf8'),{window});
  const actor={kind,p:[0,0,0],alive:true,armed:!['farmer','cow'].includes(kind),spd:0,state:'patrol'},game={phase:'evade',t:0,paused:false,evade:{searchers:[],locals:[],cattle:[]}};
  (kind==='cow'?game.evade.cattle:game.evade.searchers).push(actor);
  const M=window.PhotoMotion;M.pose(actor,game);M.step(game,.05);
  return {M,actor,game};
}
function advance(f,metres=0,dt=.05){f.actor.p[0]+=metres;f.game.t+=dt;f.M.step(f.game,dt);return f.M.pose(f.actor,f.game);}
const near=(a,b,reason)=>assert.ok(Math.abs(a-b)<1e-8,(reason||'')+' '+a+' != '+b);

test('requested speed cannot animate a figure stopped against an obstacle',()=>{
  const f=fixture();f.actor.spd=99;f.actor.state='pursuit';
  const before=f.M.pose(f.actor,f.game);
  for(let i=0;i<30;i++){const p=advance(f);assert.equal(p.moving,false);assert.equal(p.clip,'idle');near(p.speed,0);near(p.phase,before.phase);near(p.distance,0);}
});

test('actual walk and run movement selects distinct clips without mutating gameplay actors',()=>{
  for(const kind of ['farmer','villager','vc','militia','vcFem','female_vc','nva','guard','guardAim','sentry','aviator','cow']){
    const f=fixture(kind);let p;
    for(let i=0;i<8;i++)p=advance(f,.05,.05);
    assert.equal(p.enabled,true,kind);assert.equal(p.clip,'walk',kind);assert.ok(p.phase>=0&&p.phase<1);near(p.speed,1);near(p.distance,.4);
    for(let i=0;i<8;i++)p=advance(f,.2,.05);
    assert.equal(p.clip,'run',kind);near(p.speed,4);near(p.distance,2);
    const before=JSON.stringify(f.actor);for(let i=0;i<100;i++)f.M.pose(f.actor,f.game);assert.equal(JSON.stringify(f.actor),before,'Presentation cannot alter AI/health/position');
  }
});

test('matching measured paths retain cadence at 30, 60 and 120 simulation updates per second',()=>{
  for(const speed of [1,4]){
    const poses=[30,60,120].map(hz=>{const f=fixture();for(let i=0;i<hz*2;i++)advance(f,speed/hz,1/hz);return f.M.pose(f.actor,f.game);});
    for(const p of poses){near(p.distance,speed*2);near(p.speed,speed);assert.equal(p.clip,speed===1?'walk':'run');near(p.phase,poses[0].phase,'Cadence depends on distance, not frame rate');}
  }
});

test('stopping freezes gait phase immediately even while AI requests movement',()=>{
  const f=fixture();for(let i=0;i<10;i++)advance(f,.06);const before=f.M.pose(f.actor,f.game);f.actor.spd=3;
  for(let i=0;i<20;i++){const p=advance(f);assert.equal(p.clip,'idle');assert.equal(p.moving,false);near(p.phase,before.phase);near(p.distance,before.distance);}
});

test('walk and run transitions resist speed jitter and reverse velocity follows actual travel',()=>{
  const f=fixture();advance(f,.15,.05);assert.equal(f.M.pose(f.actor,f.game).clip,'run');
  for(const speed of [1.6,1.8,1.65,1.7])assert.equal(advance(f,speed*.05,.05).clip,'run');
  assert.equal(advance(f,1.2*.05,.05).clip,'walk');
  for(const speed of [1.6,1.8,1.65,1.7])assert.equal(advance(f,speed*.05,.05).clip,'walk');
  const reversed=advance(f,-.05,.05);near(reversed.velocity[0],-1);near(reversed.velocity[1],0);assert.equal(reversed.clip,'walk');
  reversed.velocity[0]=999;near(f.M.pose(f.actor,f.game).velocity[0],-1,'Descriptor vectors must not expose mutable motion state');
});

test('pause and repeated rendering cannot advance a measured cycle',()=>{
  const f=fixture();advance(f,.05);const before=f.M.pose(f.actor,f.game);f.game.paused=true;
  for(let i=0;i<20;i++){f.game.t+=.05;f.M.step(f.game,.05);const p=f.M.pose(f.actor,f.game);near(p.phase,before.phase);near(p.distance,before.distance);}
  f.game.paused=false;const stamp=f.game.t;f.M.step(f.game,.05);const resumed=f.M.pose(f.actor,f.game);
  for(let i=0;i<30;i++){assert.equal(f.game.t,stamp);f.M.step(f.game,.05);const p=f.M.pose(f.actor,f.game);near(p.phase,resumed.phase);near(p.distance,resumed.distance);}
});

test('teleports do not run an entire cycle or inflate measured travel',()=>{
  const f=fixture();advance(f,.05);const before=f.M.pose(f.actor,f.game),teleported=advance(f,500,.05);
  assert.equal(teleported.teleported,true);assert.equal(teleported.moving,false);near(teleported.phase,before.phase);near(teleported.distance,before.distance);
  const after=advance(f,.05);assert.equal(after.teleported,false);assert.equal(after.clip,'walk');near(after.distance,before.distance+.05);
});

test('fallen and stunned actors cannot keep playing a locomotion cycle',()=>{
  for(const state of [{alive:false},{stunned:true},{stunUntil:100}]){
    const f=fixture();advance(f,.05);Object.assign(f.actor,state);const before=f.M.pose(f.actor,f.game);const p=advance(f,.08);
    assert.equal(p.moving,false);near(p.phase,before.phase);near(p.distance,before.distance);
  }
});

test('cow entries without an explicit kind receive their own measured quadruped cycle',()=>{
  const f=fixture('cow');delete f.actor.kind;f.M.reset(f.game);f.M.pose(f.actor,f.game);f.M.step(f.game,.05);
  const p=advance(f,.05);assert.equal(p.enabled,true);assert.equal(p.clip,'walk');assert.equal(p.moving,true);near(p.speed,1);
});

test('inactive flight and completed episodes cannot advance ground animation',()=>{
  for(const state of [{phase:'flight'},{pow:{complete:true}}]){
    const f=fixture();advance(f,.05);Object.assign(f.game,state);const before=f.M.pose(f.actor,f.game);advance(f,.05);const p=f.M.pose(f.actor,f.game);near(p.distance,before.distance);near(p.phase,before.phase);
  }
});

test('capture and scene freezes hold the current photographed gait instead of consuming movement',()=>{
  for(const condition of ['capture','scene']){
    const f=fixture();advance(f,.05);const before=f.M.pose(f.actor,f.game);
    if(condition==='capture')f.game._capturePending={};else f.game.evade.frozen=true;
    for(let i=0;i<8;i++){const p=advance(f);assert.equal(p.moving,false);near(p.phase,before.phase);near(p.distance,before.distance);}
  }
});

function cutout(){const window={};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/render/photo-cutouts.js'),'utf8'),{window});return window.PhotoCutouts;}
function registered(overrides={}){return {photoCutout:true,photoWidth:560,photoHeight:800,photoBounds:[80,35,505,795],photoBodyFraction:.9,photoBaseline:.995,photoCenter:.5,photoRight:[1,0],p:[7,12,-9],h:1.76,...overrides};}
test('registered gait frames preserve the shared body scale while their silhouettes change',()=>{
  const C=cutout(),a=C.anchor(registered()),b=C.anchor(registered({photoBounds:[55,64,530,790]}));
  near(a.h,b.h);near(a.w,b.w);near(a.h*.9,1.76);near(a.p[1]+a.h*(1-.995),12);near(b.p[1]+b.h*(1-.995),12);
  for(const q of [a,b]){assert.equal(q.cols,1);assert.equal(q.rows,1);assert.equal(q.cell,0);assert.equal(q.motion,null);}
});
test('torso registration stays over the actor for both mirror directions and oblique cameras',()=>{
  const C=cutout();
  for(const flip of [false,true]){
    const s=registered({photoCenter:.56,photoRight:[.6,.8],flip}),before=JSON.stringify(s),q=C.anchor(s),offset=((flip?1-.56:.56)-.5)*q.w;
    near(q.p[0]+.6*offset,7);near(q.p[2]+.8*offset,-9);assert.equal(JSON.stringify(s),before,'Anchoring cannot alter source metadata or actor position');
  }
});

test('shared running top alignment preserves photographed airborne feet instead of dropping the body',()=>{
  const C=cutout(),stance=C.anchor(registered({p:[0,0,0],photoBounds:[80,35,505,796]})),flight=C.anchor(registered({p:[0,0,0],photoBounds:[80,35,505,706]}));
  const top=q=>q.p[1]+q.h*(1-q.photoBounds[1]/q.photoHeight),foot=q=>q.p[1]+q.h*(1-q.photoBounds[3]/q.photoHeight);
  near(top(stance),top(flight));near(foot(stance),0);assert.ok(foot(flight)>.2&&foot(flight)<.25);near(stance.h,flight.h);
});
