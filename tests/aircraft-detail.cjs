'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/flight/aircraft-detail.js'),'utf8'),{window});const D=window.AircraftDetail;
function builder(){return {p:[],n:[],c:[],i:[]};}
function quad(m,points,normal,col=[.4,.4,.4]){const start=m.p.length/3;for(const p of points){m.p.push(...p);m.n.push(...normal);m.c.push(...col);}m.i.push(start,start+1,start+2,start,start+2,start+3);}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('aircraft material ownership is explicit and excludes ships, people, photographs and glass',()=>{for(const [name,k]of [['intruder',1],['sandy',2],['jolly',3],['gear',4]])assert.equal(D.kind(name),k);for(const n of ['carrier','canopy','sandyGlass','jollyGlass','people','photo_aviator','MiG17PF','__proto__','constructor',null])assert.equal(D.kind(n),0);});
test('subpixel rivet and panel detail fades monotonically rather than aliasing at distance',()=>{for(const q of [0,1,2]){assert.equal(D.detailWeight(10,.001,q),1);assert.equal(D.detailWeight(500,.001,q),0);assert.equal(D.detailWeight(10,.055,q),0);let old=1;for(let p=0;p<.07;p+=.0007){const w=D.detailWeight(60,p,q);assert.ok(w>=0&&w<=old+1e-12);old=w;}}for(const args of [[NaN,0,1],[1,-1,1],[1,0,Infinity]])assert.equal(D.detailWeight(...args),0);});
test('only the two running rotor meshes select the neutral exposure material',()=>{assert.equal(D.rotorKind('sandyDisc'),1);assert.equal(D.rotorKind('jollyDisc'),2);for(const n of ['canopy','sandyGlass','jollyGlass','intruder','jolly','carrier','__proto__',null])assert.equal(D.rotorKind(n),0);assert.match(D.rotorGLSL,/vec4 rotorMotion/);assert.doesNotMatch(D.rotorGLSL,/Math\.random|texture\s*\(|reflect\s*\(/);});
test('curved airframe normals smooth coincident strips while all geometry, colours and triangles stay exact',()=>{const m=builder(),angle=Math.PI/8;quad(m,[[0,0,0],[0,0,1],[1,0,1],[1,0,0]],[0,1,0]);quad(m,[[1,0,0],[1,0,1],[2,-Math.tan(angle),1],[2,-Math.tan(angle),0]],[Math.sin(angle),Math.cos(angle),0]);const saved={p:m.p.slice(),c:m.c.slice(),i:m.i.slice(),n:m.n.slice()};assert.equal(D.refine(m,'intruder'),m);assert.deepEqual(m.p,saved.p);assert.deepEqual(m.c,saved.c);assert.deepEqual(m.i,saved.i);assert.notDeepEqual(m.n,saved.n);for(let i=0;i<m.n.length;i+=3)close(Math.hypot(...m.n.slice(i,i+3)),1);assert.ok(D.inspect(m).smoothedVertices>0);});
test('sharp trailing edges, panel corners and intake lips retain separate face normals',()=>{const m=builder();quad(m,[[0,0,0],[0,0,1],[1,0,1],[1,0,0]],[0,1,0]);quad(m,[[1,0,0],[1,0,1],[1,-1,1],[1,-1,0]],[1,0,0]);const old=m.n.slice();D.refine(m,'jolly');assert.deepEqual(m.n,old);assert.equal(D.inspect(m).smoothedVertices,0);});
test('non-aircraft, malformed and already processed builders are left alone without gameplay RNG',()=>{const m=builder();quad(m,[[0,0,0],[0,0,1],[1,0,1],[1,0,0]],[0,1,0]);const old=JSON.stringify(m);D.refine(m,'carrier');assert.equal(JSON.stringify(m),old);assert.equal(D.inspect(m),null);D.refine(m,'sandy');const processed=m.n.slice();D.refine(m,'sandy');assert.deepEqual(m.n,processed);const broken={...m,p:[NaN,0,0]};assert.equal(D.refine(broken,'sandy'),broken);});
test('surface code keeps wear on the aircraft and does not add image requests, markings or geometry edits',()=>{assert.match(D.glsl,/aircraftProjection\(local/);assert.doesNotMatch(D.glsl,/sampler|texture\s*\(|gl_Position|discard|NAVY|VA-65/);assert.equal(Object.isFrozen(D),true);});
function productionModels(){
  const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const region=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end);};
  const ctx={TAU:Math.PI*2,PI:Math.PI,DEG:Math.PI/180,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),lerp:(a,b,t)=>a+(b-a)*t,vsub:(a,b)=>a.map((v,i)=>v-b[i]),vadd:(a,b)=>a.map((v,i)=>v+b[i]),vnorm:a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);},vcross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]};
  vm.runInNewContext(region('class MB {','/* ============================ Renderer')+'\n'+region('MB.prototype.loft =','/* ------------------------- CARRIER (CVA-63)')+'\nglobalThis.models={intruder:buildIntruder("NH-505","155585","USS KITTY HAWK"),canopy:buildIntruder.glass,gear:buildGear(),sandy:buildSandy(),sandyGlass:buildSandy.glass,sandyDisc:buildSandy.disc,jolly:buildJolly(),jollyGlass:buildJolly.glass,jollyDisc:buildJolly.disc};',ctx);
  return ctx;
}
test('the independent normals-only baseline preserves all actual original geometry',()=>{
  const ctx=productionModels();
  for(const [name,m] of Object.entries(ctx.models)){
    const geometry=JSON.stringify([m.p,m.c,m.i]),oldNormals=m.n.slice();D.refineNormals(m,name);assert.equal(JSON.stringify([m.p,m.c,m.i]),geometry,name);
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
function ray(m,origin,direction){
 const sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);let best=null;
 for(let k=0;k<m.i.length;k+=3){
  const ids=m.i.slice(k,k+3),a=m.p.slice(ids[0]*3,ids[0]*3+3),b=m.p.slice(ids[1]*3,ids[1]*3+3),c=m.p.slice(ids[2]*3,ids[2]*3+3),e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)continue;
  const inv=1/det,tv=sub(origin,a),u=dot(tv,p)*inv;if(u<0||u>1)continue;const q=cross(tv,e1),v=dot(direction,q)*inv;if(v<0||u+v>1)continue;const t=dot(e2,q)*inv;
  if(t>1e-6&&(!best||t<best.t))best={t,p:origin.map((n,i)=>n+direction[i]*t),color:m.c.slice(ids[0]*3,ids[0]*3+3),ids};
 }return best;
}
test('actual A6 and Sandy intakes have physical depth instead of an opaque lip cap',()=>{
 const ctx=productionModels();
 for(const [name,o]of [['intruder',[1.23,.02,-7]],['sandy',[.38,.10,-7]]]){
  const m=ctx.models[name],before=ray(m,o,[0,0,1]);D.refine(m,name);const after=ray(m,o,[0,0,1]);assert.ok(before&&after,name);assert.ok(after.p[2]>before.p[2]+.10,name+' mouth must be recessed');assert.ok(after.color.reduce((s,n)=>s+n,0)<before.color.reduce((s,n)=>s+n,0),name+' dark interior must be visible');assert.ok(D.inspect(m).geometry.removedCapTriangles>=28);
 }
});
test('the A6 cockpit shell no longer hides the actual side-by-side crew behind solid skin',()=>{
 const m=productionModels().models.intruder,o=[5,1.00,-4.80],before=ray(m,o,[-1,0,0]);D.refine(m,'intruder');const after=ray(m,o,[-1,0,0]);assert.ok(before&&after);assert.ok(before.color[0]<.4);assert.ok(after.color[0]>.6,'a helmet is visible through the repaired opening');assert.ok(D.inspect(m).geometry.openedShellTriangles>20);
});
test('HH3 windshield and cabin openings expose a bounded cockpit behind the glazing',()=>{
 const m=productionModels().models.jolly,o=[.60,.65,-10],before=ray(m,o,[0,0,1]);D.refine(m,'jolly');const after=ray(m,o,[0,0,1]);assert.ok(before&&after);assert.ok(after.p[2]>before.p[2]+.5,'windshield must show recessed crew instead of boat hull');assert.ok(D.inspect(m).geometry.openedShellTriangles>20);assert.ok(after.color[0]>.4,'pilot helmet is visible inside the windshield');
});
test('running aircraft lose only their exact frozen outer blade faces and retain physical hubs',()=>{
 const ctx=productionModels();
 for(const [name,origin,direction,count]of [['sandy',[0,.10,-7],[0,0,1],288],['jolly',[0,4,-1.1],[0,-1,0],660]]){
  const m=ctx.models[name],before=ray(m,origin,direction);D.refine(m,name);const after=ray(m,origin,direction);assert.ok(before&&after);assert.ok(Math.abs(before.t-after.t)<1e-9,name+' original hub remains');assert.deepEqual(Array.from(before.color),Array.from(after.color));assert.equal(D.inspect(m).geometry.removedRotorTriangles,count,name+' exact authored blade/tip faces');
 }
});
test('rotor blur is a single physical surface with the original authored radii and axes',()=>{
 const ctx=productionModels();
 for(const [name,triangles]of [['sandyDisc',48],['jollyDisc',80]]){
  const m=ctx.models[name];D.refine(m,name);assert.equal(m.i.length/3,triangles);assert.equal(D.inspect(m).geometry.singleSurface,true);
  for(let k=0;k<m.i.length;k+=3){
   const p=m.i.slice(k,k+3).map(i=>m.p.slice(i*3,i*3+3));
   if(name==='sandyDisc'){assert.ok(p.every(p=>Math.abs(p[2]+6.26)<1e-10));for(const q of p)assert.ok(Math.hypot(q[0],q[1]-.10)<=2.05500001);}
   else if(p.every(p=>Math.abs(p[1]-2.16)<1e-10)){for(const q of p)assert.ok(Math.hypot(q[0],q[2]+1.10)<=9.44000001);}
   else{assert.ok(p.every(p=>Math.abs(p[0]+.46)<1e-10));for(const q of p)assert.ok(Math.hypot(q[2]-8.86,q[1]-2.62)<=1.60000001);}
  }
 }
});
test('higher resolution glazing keeps exact section extrema and complete HH3 side windows',()=>{
 const ctx=productionModels();for(const name of ['canopy','sandyGlass','jollyGlass']){
  const m=ctx.models[name],before={p:m.p.slice(),i:m.i.slice()},bounds=p=>[0,1,2].map(k=>[Math.min(...p.filter((_,i)=>i%3===k)),Math.max(...p.filter((_,i)=>i%3===k))]);D.refine(m,name);const old=bounds(before.p),now=bounds(m.p);
  for(let k=0;k<3;k++)for(let j=0;j<2;j++)assert.ok(Math.abs(old[k][j]-now[k][j])<.035,name+' original envelope');assert.equal(D.inspect(m).geometry.glazingSegments,32);assert.ok(m.i.length>before.i.length);
  if(name==='jollyGlass')assert.deepEqual(Array.from(m.p.slice(-432)),Array.from(before.p.slice(-432)),'all six original side-window boxes remain intact');
 }
});
test('production repairs keep all pre-existing painted markings and vertex coordinates immutable',()=>{
 const ctx=productionModels();for(const name of ['intruder','sandy','jolly']){
  const m=ctx.models[name],p=m.p.slice(),c=m.c.slice(),oldCount=p.length/3;D.refine(m,name);assert.deepEqual(Array.from(m.p.slice(0,p.length)),Array.from(p),name+' original coordinates');assert.deepEqual(Array.from(m.c.slice(0,c.length)),Array.from(c),name+' original colors');assert.ok(m.p.length/3<oldCount+12000,name+' bounded added detail');
  const report=D.inspect(m);assert.ok(report.geometry);assert.ok(report.geometry.addedDetailTriangles>100);for(const i of m.i)assert.ok(Number.isInteger(i)&&i>=0&&i<m.p.length/3,name+' valid index');
  for(let i=0;i<m.n.length;i+=3){const length=Math.hypot(...m.n.slice(i,i+3));assert.ok(Number.isFinite(length));assert.ok(length<1e-9||Math.abs(length-1)<1e-7);}
  const saved=JSON.stringify([m.p,m.n,m.c,m.i]);D.refine(m,name);assert.equal(JSON.stringify([m.p,m.n,m.c,m.i]),saved,name+' repair is idempotent');
 }
});
