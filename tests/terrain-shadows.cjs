'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/render/terrain-shadows.js'),'utf8');
const create=()=>{const window={},math=Object.create(Math);math.random=()=>{throw Error('Render projection must not consume gameplay RNG')};vm.runInNewContext(source,{window,Math:math});return window.TerrainShadows;};
const game=extra=>({t:0,evade:{p:[0,10,0]},rend:{eye:[0,12,0]},...extra});
const sprite=p=>({p,owner:{},photoName:'vegetation'});
const opt={ox:1,oz:-1,reach:1,radius:1.8,darkness:.7,quality:1};
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} differs from ${b}`);
function settle(M,g,s,o=opt){M.collect(g,s,o);g.t+=.2;return M.collect(g,s,o);}
test('projects the displaced centre onto the exact plane and keeps the full tangent',()=>{
 const M=create(),g=game(),h=(x,z)=>10+.55*x-.2*z;let calls=0;M.configure({terrainH:(x,z)=>{calls++;return h(x,z)}});
 const input=[sprite([2,h(2,3),3])],before=JSON.stringify(input);const a=settle(M,g,input)[0];
 near(a.p[0],2.5);near(a.p[2],2.5);near(a.p[1],h(2.5,2.5));near(a.slope[0],.55);near(a.slope[1],-.2);near(a.r,1.8);near(a.d,.7);assert.equal(calls,6);assert.equal(JSON.stringify(input),before);
});
test('nearest-first quality budgets bound both live casts and actual terrain callbacks',()=>{
 for(let q=0;q<3;q++){
  const M=create(),g=game();let calls=0;M.configure({terrainH:()=>{calls++;return 10}});
  const sprites=Array.from({length:800},(_,i)=>sprite([i*.1,10,0])).reverse(),profile=M.profiles[q];
  let out=[];for(let frame=0;frame<70;frame++){const before=calls;out=M.collect(g,sprites,{...opt,quality:q});assert.ok(calls-before<=profile.updates*6);assert.equal(M.inspect(g).terrainSamples,calls-before);g.t+=.02;}
  assert.equal(out.length,profile.count);near(out[0].p[0],.5);near(out.at(-1).p[0],(profile.count-1)*.1+.5);assert.ok(M.inspect(g).cacheSize<=1024);
  const before=calls;g.t+=100;M.collect(g,sprites,{...opt,quality:q});assert.equal(calls,before,'Unmoved static terrain must not be sampled periodically');
 }
});
test('POW, camp and raised floors retain their true height without terrain projection',()=>{
 for(const extra of [{pow:{time:2}},{evade:{p:[0,13.4,0],camp:true}}]){
  const M=create(),g=game(extra);let calls=0;M.configure({terrainH:()=>{calls++;return -100}});
  const a=M.collect(g,[sprite([2,13.4,0])],opt)[0];near(a.p[1],13.4);assert.deepEqual(Array.from(a.slope),[0,0]);assert.equal(calls,0);
 }
 const M=create(),g=game();let calls=0;M.configure({terrainH:()=>{calls++;return 10}});
 const a=settle(M,g,[sprite([2,13.4,0])])[0];near(a.p[1],13.4);assert.deepEqual(Array.from(a.slope),[0,0]);assert.equal(calls,1);
});
test('moving owners, clock rollback, world replacement and terrain revision invalidate stale geometry',()=>{
 const M=create(),g=game(),h=x=>10+.25*x;let calls=0;const terrain=x=>{calls++;return h(x)};M.configure({terrainH:terrain});
 const s=sprite([0,10,0]);settle(M,g,[s]);const before=calls;s.p=[1,h(1),0];g.t+=.01;const moved=M.collect(g,[s],opt)[0];near(moved.p[1],h(1.5));assert.equal(calls-before,6);
 g.t=0;assert.equal(M.collect(g,[s],opt).length,0);assert.equal(M.inspect(g).updates,1);
 g.t=.3;g.world={};M.collect(g,[s],opt);assert.equal(M.inspect(g).updates,1);
 M.configure({terrainH:()=>10});g.t=.6;M.collect(g,[sprite([0,10,0])],opt);assert.equal(M.inspect(g).updates,1);
});
test('strong curvature, cliffs, invalid terrain and exceptions do not emit floating fallback planes',()=>{
 for(const terrain of [(x)=>x>0?20:10,(x,z)=>10+4*x*x+4*z*z,()=>NaN,()=>{throw Error('terrain unavailable')}]){
  const M=create(),g=game();M.configure({terrainH:terrain});const s=sprite([0,10,0]);
  assert.equal(settle(M,g,[s]).length,0);assert.ok(M.inspect(g).terrainSamples<=6);
 }
});
test('true camera distance, finite input and duplicate owners constrain submitted descriptors',()=>{
 const M=create(),g=game({pow:{time:1}});M.configure({terrainH:()=>10});const s=sprite([2,10,0]);
 const out=M.collect(g,[s,s,null,{},sprite([NaN,0,0]),sprite(new Array(3)),sprite([0,400,0]),sprite([0,10,500])],opt);
 assert.equal(out.length,1);assert.ok([...out[0].p,...out[0].slope,out[0].d].every(Number.isFinite));
 g.rend.eye=[0,500,0];assert.equal(M.collect(g,[s],opt).length,0);assert.equal(M.collect(null,[s],opt).length,0);
});
test('cold-cache fade and range fade remain bounded without changing original actors or RNG',()=>{
 const M=create(),g=game();M.configure({terrainH:()=>10});const s=sprite([0,10,0]),before=JSON.stringify(g);
 assert.equal(M.collect(g,[s],opt).length,0);g.t=.09;near(M.collect(g,[s],opt)[0].d,.35);g.t=.18;near(M.collect(g,[s],opt)[0].d,.7);
 const far=M.collect({...g,pow:{time:1}},[sprite([139,10,0])],opt)[0];assert.ok(far.d>0&&far.d<.05);
 const reconstructed={...g,t:0};assert.equal(JSON.stringify(reconstructed),before);assert.equal(s.p[1],10);
});
test('cache and diagnostics remain bounded, detached and resettable',()=>{
 const M=create(),g=game();M.configure({terrainH:()=>10});
 for(let k=0;k<1200;k++){const s=sprite([0,10,0]);M.collect(g,[s],opt);g.t+=.2;}
 assert.ok(M.inspect(g).cacheSize<=1024);const a=M.inspect(g);a.count=10000;assert.notEqual(M.inspect(g).count,10000);
 assert.equal(M.reset(g),true);assert.equal(M.inspect(g).cacheSize,0);assert.equal(M.configure({terrainH:null}),false);assert.ok(Object.isFrozen(M.limits)&&Object.isFrozen(M.profiles));
});
