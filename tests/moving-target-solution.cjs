'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
// Domain tests execute the shipped ASQ-61 method. They do not render a game
// or substitute damage/objective code; live sorties are verified separately.
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const body=source.slice(source.indexOf('  solve(ac) {'),source.indexOf('\n}\n\n/* ===== src/09-chart.js'));
const solve=vm.runInNewContext('({'+body+'}).solve',{Math,Number,Array,PI:Math.PI,TAU:2*Math.PI,G:9.81,BOMB_K:6.45e-5,clamp:(n,a,b)=>Math.max(a,Math.min(b,n))});
const ac={p:[0,800,0],v:[0,0,-180]};
function world(target,lock=true){return {designated:target,targets:[target],lock};}
test('a locked crossing boat receives physically scaled current-course lead',()=>{
 const t={kind:'boat',p:[0,0,-4000],spd:16,yaw:Math.PI/2},s=solve.call(world(t),ac);
 assert.ok(s.tof>10);assert.ok(s.aim[0]>s.tof*16);assert.ok(s.az>0);assert.equal(t.p[0],0);assert.equal(t.hp,undefined);
 assert.ok(Math.abs(s.aim[0]-16*(s.tof+Math.max(s.tRel,0)))<.05);
});
test('stationary and offset aimpoints keep the original stationary solution',()=>{
 const t={kind:'depot',p:[0,0,-4000]},a=solve.call(world(t),ac),b=solve.call({designated:{...t,spd:16,yaw:1},targets:[],lock:true},ac);
 for(const k of ['gr','az','rel','tRel','tof','valid'])assert.equal(a[k],b[k]);assert.equal(a.az,0);assert.equal(a.aim,t.p);
});
test('manual coordinates cannot inherit a moving actor track',()=>{
 const p={kind:'boat',p:[0,0,-4000],spd:16,yaw:1},s=solve.call({designated:{...p,label:'MANUAL POINT'},targets:[p],lock:true},ac);
 assert.equal(s.az,0);assert.equal(s.aim[0],0);
});
test('unlocked, invalid and implausible tracks cannot poison ballistics',()=>{
 for(const [speed,yaw,lock]of [[16,1,false],[Infinity,1,true],[NaN,1,true],[101,1,true],[-1,1,true],[16,Infinity,true]]){
  const t={kind:'boat',p:[0,0,-4000],spd:speed,yaw},s=solve.call(world(t,lock),ac);
  assert.equal(s.az,0);assert.ok(Number.isFinite(s.tRel));
 }
});
test('receding and approaching tracks shift release timing in opposite directions',()=>{
 const baseline=solve.call(world({kind:'depot',p:[0,0,-4000]}),ac);
 const away=solve.call(world({kind:'boat',p:[0,0,-4000],spd:16,yaw:0}),ac);
 const toward=solve.call(world({kind:'boat',p:[0,0,-4000],spd:16,yaw:Math.PI}),ac);
 assert.ok(away.tRel>baseline.tRel);assert.ok(toward.tRel<baseline.tRel);
});
