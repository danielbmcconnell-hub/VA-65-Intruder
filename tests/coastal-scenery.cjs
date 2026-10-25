'use strict';
// CPU geometry/math regressions. Actual shader coverage, moving-camera images
// and ejection remain separate native WebGL checks.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const file=path.join(__dirname,'../assets/render/coastal-scenery.js');
const N=48,BASE_CELL=8,HOLE_CELLS=23;
function load(){
 const window={},math=Object.create(Math);math.random=()=>{throw Error('Scenery math must not consume gameplay randomness');};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{window,console,Math:math});
 assert.ok(window.CoastalScenery);return window.CoastalScenery;
}
function layers(M,eye,count=9){return Array.from({length:count},(_,L)=>M.clipmapLayer(eye,N,BASE_CELL*2**L,L));}
function distanceFrom(point,origin){return Math.max(Math.abs(point[0]-origin[0]),Math.abs(point[1]-origin[1]));}
function owns(point,layer,L){
 // Strict interiors avoid the zero-area outer edges handled by rasterization.
 if(distanceFrom(point,layer.origin)>=layer.half)return false;
 const cell=BASE_CELL*2**L;
 if(L>0&&distanceFrom(point,layer.origin)<HOLE_CELLS*cell)return false;
 return layer.innerHalf<=0||distanceFrom(point,layer.innerOrigin)>=layer.innerHalf;
}
function close(a,b,epsilon=1e-9,label='number'){assert.ok(Math.abs(a-b)<=epsilon,`${label}: ${a} versus ${b}`);}
const eyes=[];
for(const base of [-8192,-64,-32,-16,0,16,32,64,8192])for(const delta of [-.001,.001])eyes.push([base+delta,650,base*.75-delta]);
// Exercise independent X/Z snap quadrants at every actual ring scale, including
// the finer half-step snaps and coarser full-step snaps on either side of zero.
for(let L=1;L<9;L++){
 const cell=BASE_CELL*2**L,phases=[-1.001,-.999,-.501,-.499,.499,.501,.999,1.001];
 for(const x of phases)for(const z of phases)eyes.push([x*cell,650,z*cell]);
}
eyes.push([-10004.696291530692,350,2678.979328461221],[-7373.052766401496,90,-1608.5256779467709]);

test('terrain layer descriptors retain the original eight-metre core and nine-level coverage',()=>{
 const M=load(),eye=[-8003.2,650,2639.7],result=layers(M,eye);
 assert.equal(result.length,9);assert.equal(result[0].half,384);assert.equal(result[8].half,98304);assert.equal(result[0].innerHalf,0);
 for(let L=0;L<result.length;L++){
  const layer=result[L],cell=BASE_CELL*2**L;
  assert.equal(layer.half,N*cell);assert.equal(layer.innerHalf,L?N*cell/2:0);
  for(let axis=0;axis<2;axis++){close(layer.origin[axis]/(2*cell),Math.round(layer.origin[axis]/(2*cell)));assert.ok(Math.abs(layer.origin[axis]-eye[axis*2])<=cell);}
 }
});

test('every coarse mesh hole stays inside the finer level coverage across camera snaps',()=>{
 const M=load();
 for(const eye of eyes){const ls=layers(M,eye);
  for(let L=1;L<ls.length;L++){
   const cell=BASE_CELL*2**L,coarse=ls[L],fine=ls[L-1];
   assert.deepEqual(Array.from(coarse.innerOrigin),Array.from(fine.origin));assert.equal(coarse.innerHalf,fine.half);
   for(const sx of [-1,1])for(const sz of [-1,1]){
    const corner=[coarse.origin[0]+sx*HOLE_CELLS*cell,coarse.origin[1]+sz*HOLE_CELLS*cell];
    assert.ok(distanceFrom(corner,fine.origin)<=fine.half+1e-8,'Existing ring hole must be covered; clipping overlap cannot open a gap');
   }
  }
 }
});

test('adjacent terrain levels give every seam probe exactly one physical mesh owner',()=>{
 const M=load();
 for(const eye of eyes){const ls=layers(M,eye);
  for(let L=1;L<ls.length;L++){
   const coarse=ls[L],H=coarse.innerHalf,c=coarse.innerOrigin,epsilon=BASE_CELL*.0001;
   for(const side of [-1,1])for(const tangent of [-.83,-.33,.17,.73])for(const shift of [-epsilon,epsilon]){
    const probes=[[c[0]+side*(H+shift),c[1]+tangent*H],[c[0]+tangent*H,c[1]+side*(H+shift)]];
    for(const p of probes){const owners=ls.map((layer,k)=>owns(p,layer,k)).filter(Boolean).length;assert.equal(owners,1,`Seam at level ${L}, camera ${eye}, point ${p}`);}
   }
  }
 }
});

test('level interiors have no duplicate coverage or uncovered strips away from mathematical edges',()=>{
 const M=load();
 for(const eye of eyes.slice(0,12)){const ls=layers(M,eye,5),outer=ls.at(-1);
  for(let iz=-12;iz<=12;iz++)for(let ix=-12;ix<=12;ix++){
   const p=[outer.origin[0]+(ix+.137)*outer.half/13,outer.origin[1]+(iz+.271)*outer.half/13];
   assert.ok(distanceFrom(p,outer.origin)<outer.half);assert.equal(ls.filter((layer,L)=>owns(p,layer,L)).length,1);
  }
 }
});

test('finer outer edges lie on the next coarser lattice and finish morphing before their boundary',()=>{
 const M=load();
 for(const eye of eyes){const ls=layers(M,eye);
  for(let L=0;L<ls.length-1;L++){
   const fine=ls[L],fineCell=BASE_CELL*2**L,coarseCell=2*fineCell;
   for(let axis=0;axis<2;axis++)for(const sign of [-1,1]){
    const edge=fine.origin[axis]+sign*fine.half;
    close(edge/coarseCell,Math.round(edge/coarseCell),1e-9,'Shared edge on coarse world lattice');
    assert.ok(Math.abs(edge-eye[axis*2])>fine.half*.95,'The shared edge must already use its fully morphed coarse vertices');
   }
  }
 }
});

test('camera height does not change terrain ownership or mutate the supplied camera',()=>{
 const M=load(),eye=Object.freeze([-32.001,700,15.999]),before=Array.from(eye),low=layers(M,eye),high=layers(M,[eye[0],12000,eye[2]]);
 assert.deepEqual(JSON.parse(JSON.stringify(low)),JSON.parse(JSON.stringify(high)));assert.deepEqual(Array.from(eye),before);
 low[0].origin[0]+=100;assert.notEqual(M.clipmapLayer(eye,N,BASE_CELL,0).origin[0],low[0].origin[0],'Descriptors do not share mutable cached coordinates');
});

function originalHeight(x,z,t,wave){
 return (Math.sin(x*.055+t*1.7)*.30+Math.sin(z*.047-t*1.3)*.26+Math.sin(x*.6+z*.42+t*3.1)*.10+Math.sin(x*.021-z*.033+t*.8)*.75)*wave;
}
const waterPoints=[[0,0,0],[-8003.2,2639.7,7.25],[257.18,-911.45,42.1],[25000,-30000,1000.25]];
test('unfiltered water retains the existing four-wave phase and amplitude at actual world coordinates',()=>{
 const M=load();for(const [x,z,t] of waterPoints)for(const wave of [0,.35,1])close(M.waveSample(x,z,t,wave,0).height,originalHeight(x,z,t,wave),1e-10);
});

test('analytic water gradients match independent finite differences at near and filtered footprints',()=>{
 const M=load(),h=.001;
 for(const [x,z,t] of waterPoints)for(const footprint of [0,.5,2,8,32,128]){
  const s=M.waveSample(x,z,t,.65,footprint),dx=(M.waveSample(x+h,z,t,.65,footprint).height-M.waveSample(x-h,z,t,.65,footprint).height)/(2*h),dz=(M.waveSample(x,z+h,t,.65,footprint).height-M.waveSample(x,z-h,t,.65,footprint).height)/(2*h);
  assert.equal(s.gradient.length,2);close(s.gradient[0],dx,2e-8,'Water x gradient');close(s.gradient[1],dz,2e-8,'Water z gradient');
 }
});

test('band-limited waves remain within the original displacement and slope budgets',()=>{
 const M=load(),heightBound=.30+.26+.10+.75,gxBound=.30*.055+.10*.6+.75*.021,gzBound=.26*.047+.10*.42+.75*.033;
 for(let i=0;i<240;i++){
  const x=Math.sin(i*3.1)*30000,z=Math.cos(i*1.7)*30000,t=i*.071,wave=(i%7)/6,footprint=2**((i%18)-4),s=M.waveSample(x,z,t,wave,footprint);
  assert.ok(Number.isFinite(s.height)&&s.gradient.every(Number.isFinite));assert.ok(Math.abs(s.height)<=heightBound*wave+1e-10);assert.ok(Math.abs(s.gradient[0])<=gxBound*wave+1e-10);assert.ok(Math.abs(s.gradient[1])<=gzBound*wave+1e-10);
 }
});

test('a flat sea stays flat and unresolvable wavelengths settle to a stable surface',()=>{
 const M=load();for(const [x,z,t] of waterPoints){
  const flat=M.waveSample(x,z,t,0,0),distant=M.waveSample(x,z,t,1,1e6);
  close(flat.height,0);assert.ok(flat.gradient.every(n=>Math.abs(n)<1e-12));close(distant.height,0);assert.ok(distant.gradient.every(n=>Math.abs(n)<1e-12));
 }
});

test('filtering removes the unresolved short wave while preserving resolved ocean swells',()=>{
 const M=load();
 for(const [x,z,t] of waterPoints.slice(1)){
  const short=Math.sin(x*.6+z*.42+t*3.1)*.10,long=originalHeight(x,z,t,1)-short;
  assert.ok(Math.abs(short)>.001,'The probe must actually contain short-wave energy');
  let previous=1;
  for(const footprint of [0,1,2,3,4,6,8]){
   const residual=(M.waveSample(x,z,t,1,footprint).height-long)/short;
   assert.ok(residual>=-1e-10&&residual<=1+1e-10);assert.ok(residual<=previous+1e-10,'Unresolved short-wave energy must decrease continuously');previous=residual;
  }
  close(M.waveSample(x,z,t,1,8).height,long,1e-10,'Resolved long swells survive short-wave removal');
 }
});

test('water phase is independent of camera/layer calls and sampling order',()=>{
 const M=load(),p=waterPoints[1],first=M.waveSample(...p,.7,2);
 for(const eye of eyes){layers(M,eye);M.waveSample(eye[0],eye[2],99,.2,30);}
 assert.deepEqual(JSON.parse(JSON.stringify(M.waveSample(...p,.7,2))),JSON.parse(JSON.stringify(first)));
});
