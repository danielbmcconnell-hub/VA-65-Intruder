'use strict';
// Real mesh-builder geometry and render-description checks. Actual native
// WebGL views are required before claiming visual acceptance.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..'),index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),clone=x=>JSON.parse(JSON.stringify(x));
const builderStart=index.indexOf('class MB {'),builderEnd=index.indexOf('/* ============================ Renderer',builderStart),math=Object.create(Math);math.random=()=>{throw Error('Village scenery must not consume gameplay randomness');};
const vector={TAU:Math.PI*2,vsub:(a,b)=>a.map((v,i)=>v-b[i]),vcross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],vnorm:a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);},Math:math};vm.runInNewContext(index.slice(builderStart,builderEnd)+'\nglobalThis.Builder=MB;',vector);
function fixture(quality=2){const window={};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'assets/render/village-detail.js'),'utf8'),{window,Math:math});const V=window.VillageDetail,r={quality,eye:[0,3,0],meshes:{},uploads:0,meshFromBuilder(name,b){this.uploads++;this.meshes[name]=b;}},g={world:{},evade:{p:[0,1,0]},app:{},stats:{kept:true}};V.configure({MB:vector.Builder});V.beginFrame(g,r);return {V,r,g};}
const row=(x=0,z=-25)=>({m:'villageHouse',p:[x,8,z],rot:[.7,0,0],scale:[.27,.27,.27],tint:[.9,.88,.84,0]});
test('only explicitly tagged procedural hamlets use rural exteriors; source scenery, actor and military props remain unchanged',()=>{
 const {V,r,g}=fixture(),item=row(),before=clone({g,item}),description=V.describe(g,r,item);assert.match(description.m,/^village(?:Bamboo|Stilt)House$/);assert.deepEqual(clone(description.p),item.p);assert.deepEqual(clone(description.rot),item.rot);assert.deepEqual(clone({g,item}),before);assert.equal(description.scale[0],item.scale[0]);assert.equal(description.scale[2],item.scale[2]);assert.ok(description.scale[1]>=.52&&description.scale[1]<=.72);assert.deepEqual(clone(V.inspect(r).rows[0].halfExtent),[4.2*.27,4.2*.27]);
 for(const m of ['bldg','hut','boat','tree','bamboo','tank','carrier'])assert.equal(V.describe(g,r,{...item,m}),null,m);assert.equal(V.inspect(r).near,1);assert.equal(V.inspect(r).photographsMapped,false);
 assert.match(index,/m: 'bldg', village: true/);assert.match(index,/s\.village \? 'villageHouse' : s\.m/);
});
test('woven walls, veranda and posts stay within original collision half extents; pitched thatch has finite outward normals and irregular edges',()=>{
 const {V,r,g}=fixture();V.describe(g,r,row());assert.equal(r.uploads,4);V.ensureMeshes(r);assert.equal(r.uploads,4);
 for(const [name,b]of Object.entries(r.meshes)){
  assert.ok(b.p.length>0&&b.i.length>0);assert.ok(b.p.every(Number.isFinite)&&b.n.every(Number.isFinite)&&b.c.every(Number.isFinite));assert.ok(b.i.every(i=>Number.isInteger(i)&&i>=0&&i<b.p.length/3));assert.ok(b.p.length/3<65535);
  let upRoof=0,maxRoof=0,minBase=Infinity;const edges=new Set();for(let n=0;n<b.p.length;n+=3){const [x,y,z]=b.p.slice(n,n+3);minBase=Math.min(minBase,y);maxRoof=Math.max(maxRoof,y);if(y<1.75){assert.ok(Math.abs(x)<=4.2+1e-9,name+' body X');assert.ok(Math.abs(z)<=4.2+1e-9,name+' body Z');}if(y>2.8&&b.n[n+1]>.4)upRoof++;if(Math.abs(x)>4.7)edges.add(y.toFixed(4));}
  assert.ok(minBase>=-.001);assert.ok(maxRoof>3&&maxRoof<4);assert.ok(upRoof>0,name+' roof faces sky with culling');if(!name.endsWith('Far')){assert.ok(edges.size>10,'staggered thatch fringe');assert.ok(b.i.length>6000,'actual slats, woven bands and bundles');}else assert.ok(b.i.length<500,'bounded distant silhouette');
 }
});
test('near and distant quality budgets are independent, reset per frame and never allocate another renderer mesh set',()=>{
 for(const quality of [0,1,2]){const {V,r,g}=fixture(quality),limits=V.inspect(r).limits;
  for(let n=0;n<limits.near+20;n++)V.describe(g,r,row(n*.5,-25));assert.equal(V.inspect(r).near,limits.near);assert.equal(V.inspect(r).omitted,20);
  for(let n=0;n<limits.far+20;n++)V.describe(g,r,row(n*.5,-500));assert.equal(V.inspect(r).far,limits.far);assert.equal(V.inspect(r).omitted,40);
  assert.equal(V.describe(g,r,row(0,-5000)),null);const saved=V.inspect(r);saved.rows[0].p[0]=999;assert.notEqual(V.inspect(r).rows[0].p[0],999);V.beginFrame(g,r);assert.equal(V.inspect(r).near,0);assert.equal(V.inspect(r).rows.length,0);V.describe(g,r,row());assert.equal(r.uploads,4);
 }
});
test('house identity and detail choice are stable across frames without random timers or game writes',()=>{
 const {V,r,g}=fixture(),items=Array.from({length:16},(_,i)=>row(i*3,-30)),before=clone(g),a=items.map(item=>V.describe(g,r,item)?.m);V.beginFrame(g,r);const b=items.map(item=>V.describe(g,r,item)?.m);assert.deepEqual(a,b);assert.ok(a.includes('villageStiltHouse')&&a.includes('villageBambooHouse'));assert.deepEqual(clone(g),before);r.eye=[0,200,0];V.beginFrame(g,r);assert.match(V.describe(g,r,row()).m,/^village(?:House|Stilt)Far$/);
});
test('invalid anchors, missing frames and stale game ownership cannot submit village geometry',()=>{
 const {V,r,g}=fixture();for(const bad of [{...row(),p:[NaN,0,0]},{...row(),scale:[0,1,1]},{...row(),scale:[1,1,-1]}])assert.equal(V.describe(g,r,bad),null);assert.equal(V.describe({},r,row()),null);assert.equal(V.inspect(r).rows.length,0);
});
