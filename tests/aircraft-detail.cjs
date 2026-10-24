'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/flight/aircraft-detail.js'),'utf8'),{window});const D=window.AircraftDetail;
function builder(){return {p:[],n:[],c:[],i:[]};}
function quad(m,points,normal,col=[.4,.4,.4]){const start=m.p.length/3;for(const p of points){m.p.push(...p);m.n.push(...normal);m.c.push(...col);}m.i.push(start,start+1,start+2,start,start+2,start+3);}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('aircraft material ownership is explicit and excludes ships, people, photographs and glass',()=>{for(const [name,k]of [['intruder',1],['sandy',2],['jolly',3],['gear',4]])assert.equal(D.kind(name),k);for(const n of ['carrier','canopy','sandyGlass','jollyGlass','people','photo_aviator','MiG17PF','__proto__','constructor',null])assert.equal(D.kind(n),0);});
test('subpixel rivet and panel detail fades monotonically rather than aliasing at distance',()=>{for(const q of [0,1,2]){assert.equal(D.detailWeight(10,.001,q),1);assert.equal(D.detailWeight(500,.001,q),0);assert.equal(D.detailWeight(10,.055,q),0);let old=1;for(let p=0;p<.07;p+=.0007){const w=D.detailWeight(60,p,q);assert.ok(w>=0&&w<=old+1e-12);old=w;}}for(const args of [[NaN,0,1],[1,-1,1],[1,0,Infinity]])assert.equal(D.detailWeight(...args),0);});
test('curved airframe normals smooth coincident strips while all geometry, colours and triangles stay exact',()=>{const m=builder(),angle=Math.PI/8;quad(m,[[0,0,0],[0,0,1],[1,0,1],[1,0,0]],[0,1,0]);quad(m,[[1,0,0],[1,0,1],[2,-Math.tan(angle),1],[2,-Math.tan(angle),0]],[Math.sin(angle),Math.cos(angle),0]);const saved={p:m.p.slice(),c:m.c.slice(),i:m.i.slice(),n:m.n.slice()};assert.equal(D.refine(m,'intruder'),m);assert.deepEqual(m.p,saved.p);assert.deepEqual(m.c,saved.c);assert.deepEqual(m.i,saved.i);assert.notDeepEqual(m.n,saved.n);for(let i=0;i<m.n.length;i+=3)close(Math.hypot(...m.n.slice(i,i+3)),1);assert.ok(D.inspect(m).smoothedVertices>0);});
test('sharp trailing edges, panel corners and intake lips retain separate face normals',()=>{const m=builder();quad(m,[[0,0,0],[0,0,1],[1,0,1],[1,0,0]],[0,1,0]);quad(m,[[1,0,0],[1,0,1],[1,-1,1],[1,-1,0]],[1,0,0]);const old=m.n.slice();D.refine(m,'jolly');assert.deepEqual(m.n,old);assert.equal(D.inspect(m).smoothedVertices,0);});
test('non-aircraft, malformed and already processed builders are left alone without gameplay RNG',()=>{const m=builder();quad(m,[[0,0,0],[0,0,1],[1,0,1],[1,0,0]],[0,1,0]);const old=JSON.stringify(m);D.refine(m,'carrier');assert.equal(JSON.stringify(m),old);assert.equal(D.inspect(m),null);D.refine(m,'sandy');const processed=m.n.slice();D.refine(m,'sandy');assert.deepEqual(m.n,processed);const broken={...m,p:[NaN,0,0]};assert.equal(D.refine(broken,'sandy'),broken);});
test('surface code keeps wear on the aircraft and does not add image requests, markings or geometry edits',()=>{assert.match(D.glsl,/aircraftProjection\(local/);assert.doesNotMatch(D.glsl,/sampler|texture\s*\(|gl_Position|discard|NAVY|VA-65/);assert.equal(Object.isFrozen(D),true);});
test('all actual production aircraft and glazing retain exact geometry and finite normalized shading',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const region=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end);};
  const ctx={TAU:Math.PI*2,PI:Math.PI,DEG:Math.PI/180,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),lerp:(a,b,t)=>a+(b-a)*t,vsub:(a,b)=>a.map((v,i)=>v-b[i]),vadd:(a,b)=>a.map((v,i)=>v+b[i]),vnorm:a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);},vcross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]};
  vm.runInNewContext(region('class MB {','/* ============================ Renderer')+'\n'+region('MB.prototype.loft =','/* ------------------------- CARRIER (CVA-63)')+'\nglobalThis.models={intruder:buildIntruder("NH-505","155585","USS KITTY HAWK"),canopy:buildIntruder.glass,gear:buildGear(),sandy:buildSandy(),sandyGlass:buildSandy.glass,jolly:buildJolly(),jollyGlass:buildJolly.glass};',ctx);
  for(const [name,m] of Object.entries(ctx.models)){
    const geometry=JSON.stringify([m.p,m.c,m.i]),oldNormals=m.n.slice();D.refine(m,name);assert.equal(JSON.stringify([m.p,m.c,m.i]),geometry,name);
    assert.ok(D.inspect(m).smoothedVertices>0,name);
    for(let i=0;i<m.n.length;i+=3){
      const length=Math.hypot(m.n[i],m.n[i+1],m.n[i+2]);assert.ok(Number.isFinite(length),name+' normal '+i);
      if(length===0){
        // Original collapsed rotor-tip/cap triangles have no surface to shade.
        // Keep their topology intact and verify no visible face has a zero normal.
        assert.equal(Math.hypot(...oldNormals.slice(i,i+3)),0,name);
        for(let t=0;t<m.i.length;t+=3)if(m.i.slice(t,t+3).includes(i/3)){
          const [a,b,c]=m.i.slice(t,t+3).map(k=>m.p.slice(k*3,k*3+3));assert.ok(Math.hypot(...ctx.vcross(ctx.vsub(b,a),ctx.vsub(c,a)))<1e-10,name+' non-degenerate zero normal');
        }
      }else assert.ok(Math.abs(length-1)<1e-7,name+' normal '+i);
    }
  }
});
