'use strict';
// Production consent, ASQ, release, trajectory and damage in a flat-terrain
// domain fixture. This is deliberately separate from native sortie evidence.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const part=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end);};
const release=part('  release(ac, n, interval, spray) {','  fireArm(ac) {');
const weapons=part('  _weapons(dt, ac) {','  detonate(p, scale, rad, dmg, weapon) {');
const detonate=part('  detonate(p, scale, rad, dmg, weapon) {','  /* A ripple is a string:');
const solve=part('  solve(ac) {','\n}\n\n/* ===== src/09-chart.js');
const consent=part('    /* weapons release */','    /* ground contact */');
function fixture({fraction=1,neighbours=true,ripple=1}={}){
 const add=(a,b)=>a.map((n,i)=>n+b[i]),mul=(a,n)=>a.map(x=>x*n),sub=(a,b)=>a.map((n,i)=>n-b[i]),len=a=>Math.hypot(...a),norm=a=>mul(a,1/(len(a)||1)),dist=(a,b)=>len(sub(a,b));
 const maths=Object.create(Math);maths.random=()=>fraction;
 const sandbox=vm.createContext({Math:maths,Number,Array,PI:Math.PI,TAU:2*Math.PI,G:9.81,BOMB_K:6.45e-5,clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),rnd:(a,b)=>a+(b-a)*fraction,vadd:add,vmul:mul,vsub:sub,vlen:len,vnorm:norm,vdist:dist,vdist2:(a,b)=>dist(a,b)**2,terrainH:()=>50,bodyAxes:()=>({fwd:[0,0,-1],right:[1,0,0],up:[0,1,0]}),setTimeout:()=>{}});
 const methods=vm.runInContext('({'+[release,weapons,detonate,solve].join(',')+'})',sandbox),target={p:[0,50,0],hp:35,r:11,alive:true,kind:'launcher'};
 const others=neighbours?[[140,0],[-140,0],[0,140],[0,-140]].map(([x,z])=>({p:[x,50,z],hp:35,r:11,alive:true,kind:'launcher'})):[];
 const world=Object.assign({targets:[target,...others],tgtSpread:140,bombs:[],arms:[],sams:[],threats:[],secs:[],score:{dropped:0,hits:0,misses:0,killed:0,cep:[]},fx:{explosion(){},smoke(){},glow(){}},designated:target,navErr:()=>240,t:0},methods);
 const ac={p:[0,1750,2000],v:[0,0,-170],yaw:0,pitch:0,roll:0,bombs:6,arms:0};ac.p[2]=world.solve(ac).rel;
 const game={mis:{type:'strike'},ripple,t:100,app:{audio:{burst(){}},radio(){}}},run=vm.runInContext('(function(g,K,W,ac){'+consent+'})',sandbox);
 run.call(game,{commit:1},{},world,ac);
 function impact(){for(let i=0;i<3600&&world.bombs.length;i++){world.t+=1/60;world._weapons(1/60,ac);}}
 return {world,target,ac,game,impact};
}
test('a single locked launcher receives ordinary Mk82 point dispersion at all ejector extremes',()=>{
 for(const fraction of [0,.1,.5,.9,1]){const f=fixture({fraction});assert.equal(f.world.bombs.length,1);f.impact();assert.equal(f.target.alive,false,'normal trajectory and blast must earn the kill at ejector fraction '+fraction);assert.ok(f.world.score.cep[0]<20);assert.equal(f.world.score.dropped,1);assert.equal(f.ac.bombs,5);}
});
test('unrelated nearby targets cannot change a single bomb initial position or velocity',()=>{
 for(const fraction of [0,.5,1]){const one=fixture({fraction,neighbours:false}),group=fixture({fraction,neighbours:true});assert.deepEqual(Array.from(one.world.bombs[0].p),Array.from(group.world.bombs[0].p));assert.deepEqual(Array.from(one.world.bombs[0].v),Array.from(group.world.bombs[0].v));}
});
test('a multi-bomb area ripple retains its broad physical swathe and actual store consumption',()=>{
 const f=fixture({ripple:4});assert.equal(f.world.bombs.length,4);assert.equal(f.world.score.dropped,4);assert.equal(f.ac.bombs,2);assert.ok(f.world.bombs.every(b=>b.v[0]>3),'area-ripple lateral scatter remains intact');const z=f.world.bombs.map(b=>b.p[2]);assert.ok(Math.max(...z)-Math.min(...z)>150,'intervalometer still walks a real physical string');
});
test('ordinary navigation-error accounting and authoritative mission outcomes are untouched',()=>{
 const f=fixture();assert.equal(f.world.navErrAtRelease,240);assert.equal(f.game.result,undefined);assert.equal(f.game.egressCalled,undefined);assert.equal(f.target.hp,35);f.impact();assert.equal(f.game.result,undefined);assert.equal(f.world.score.killed,1);
});
