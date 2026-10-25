'use strict';
// Pure placement and isolated canvas/upload-adapter checks. Actual photographs,
// WebGL output and native game navigation are verified by browser coverage.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/render/jungle-scenery.js'),'utf8');
function rgba(width,height,edge=false){const data=new Uint8ClampedArray(width*height*4);for(let y=4;y<height-4;y++)for(let x=8;x<width-8;x++){const i=(y*width+x)*4;data[i]=45;data[i+1]=112;data[i+2]=34;data[i+3]=255;}if(edge)data[3]=255;return data;}
function fixture(options={}){
 const math=Object.create(Math);math.random=()=>{throw Error('Scenery must not consume gameplay RNG')};
 const document={createElement(){return {width:0,height:0,getContext(){const cv=this;return {drawImage(im){cv.imageSource=im;},getImageData(){let data;if(cv.imageSource?._src.includes('forest-floor')){data=new Uint8ClampedArray(cv.width*cv.height*4);for(let i=0;i<data.length;i+=4){data[i]=50;data[i+1]=40;data[i+2]=28;data[i+3]=255;}if(options.floorHole)data[3]=0;}else data=rgba(cv.width,cv.height);if(options.offCentre)for(let y=0;y<cv.height;y++)for(let x=0;x<Math.floor(cv.width*.28);x++)data[(y*cv.width+x)*4+3]=0;return {data};}};}};}};
 const window={document,fetch:async()=>({ok:true,json:async()=>({version:1,...(options.floor?{floor:{file:'forest-floor.webp',width:1254,height:1254,worldSize:3,gpuHigh:512,gpuTouch:384}}:{}),plants:Object.fromEntries(['canopy','bamboo','nipa','fern','liana','litter'].map(kind=>[kind,{file:kind+'.webp'}]))})})};
 window.Image=class{constructor(){this.naturalWidth=1024;this.naturalHeight=1536;}set src(value){this._src=value;if(value.includes('forest-floor'))this.naturalWidth=this.naturalHeight=1254;queueMicrotask(()=>value.includes(options.fail||'never-fail')?this.onerror():this.onload());}};
 vm.runInNewContext(source,{window,Math:math});
 let allocations=0;const gl={TEXTURE_2D:1,TEXTURE_MIN_FILTER:2,LINEAR_MIPMAP_LINEAR:3,TEXTURE_WRAP_S:4,TEXTURE_WRAP_T:5,REPEAT:6,parameters:[],isContextLost:()=>false,bindTexture(target,T){this.bound=T;},generateMipmap(){},texParameteri(target,p,value){this.parameters.push({texture:this.bound?.name,p,value});},deleteTexture(){allocations--;}};
 const r={eye:[0,12,0],quality:2,textures:{},gl,texFromCanvas(name,cv){allocations++;return this.textures[name]={tex:{name},w:cv.width,h:cv.height};},_drawSpriteBatch(name,list,wind){this.draws.push({name,list,wind});},draws:[]};
 const g={phase:'evade',t:0,world:{},evade:{p:[0,10,0]},atm:{fogDens:.0001,fogHeight:1200,wet:.5}};
 return {M:window.JungleScenery,g,r,window,allocations:()=>allocations};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

function practiceFixture(dryBeyond){
 const {M}=fixture(),index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=index.indexOf('function wildlifePracticePoint(game){'),end=index.indexOf('\nfunction beginWildlifePractice',start);assert.ok(start>0&&end>start);
 const calls={terrain:0,clutter:0,sites:[]},fbm=(x,z)=>x>5?.3:Math.abs((x-3.7)/.00006)>=dryBeyond?.6:.5;
 const context={Math,JungleScenery:M,terrainH(x,z){calls.terrain++;calls.sites.push([x,z]);return 10;},fbm,dryJungleAt:(x,z)=>M.habitat(fbm(x*.00021+11.7,z*.00021+11.7),fbm(x*.00006+3.7,z*.00006-2.1))};
 const find=vm.runInNewContext('('+index.slice(start,end)+')',context),game={world:{tgtCenter:[0,0,0],clutter(){calls.clutter++;}},ac:{p:[40,19,7]},evade:{p:[4,10,7]},_localSolidAt:()=>false};
 return {find,game,calls};
}

test('production practice finder preserves a local clearing and expands only when the native wet delta has no dry site',()=>{
 const nearSite=practiceFixture(0),nearBefore=JSON.stringify({ac:nearSite.game.ac,evade:nearSite.game.evade,centre:nearSite.game.world.tgtCenter}),nearPoint=nearSite.find(nearSite.game);assert.deepEqual(Array.from(nearPoint),[0,10,0]);assert.ok(nearSite.calls.sites.every(p=>Math.max(...p.map(Math.abs))<=1708));assert.equal(nearSite.calls.clutter,1);assert.equal(JSON.stringify({ac:nearSite.game.ac,evade:nearSite.game.evade,centre:nearSite.game.world.tgtCenter}),nearBefore);
 const farSite=practiceFixture(2300),before=JSON.stringify({ac:farSite.game.ac,evade:farSite.game.evade,centre:farSite.game.world.tgtCenter}),farPoint=farSite.find(farSite.game);assert.ok(Math.abs(farPoint[0])>=2300&&Math.abs(farPoint[0])<=3400);assert.equal(farPoint[1],10);assert.equal(farSite.calls.clutter,1);assert.ok(farSite.calls.terrain<=1081*5);assert.equal(JSON.stringify({ac:farSite.game.ac,evade:farSite.game.evade,centre:farSite.game.world.tgtCenter}),before,'Selecting an isolated practice site cannot move an actor or modify terrain/campaign inputs');
});

test('production practice finder exhausts a fixed query budget and gives a clear error when every bounded site is wet',()=>{
 const {find,game,calls}=practiceFixture(Infinity);assert.throws(()=>find(game),/dry forest clearing could not be found/);assert.equal(calls.terrain,1081,'441 original candidates plus320 in each outer ring');assert.equal(calls.clutter,0);assert.ok(calls.sites.every(p=>Math.max(...p.map(Math.abs))<=6800));
});

test('dry forest habitat excludes the real river and flood banks even when its biome is dense forest',async()=>{
 const {M,g,r}=fixture();assert.equal(M.habitat(.34994789969356976,.5020693424745254),false,'The measured8m native riverbed is not a dry forest clearing');assert.equal(M.habitat(.3854822668400707,.5638508913698776),true,'The measured48m clearing remains forest');
 for(const river of [.4451,.47,.5,.53,.5549])assert.equal(M.habitat(.3,river),false);
 for(const value of [NaN,Infinity,undefined]){assert.equal(M.habitat(value,.6),false);assert.equal(M.habitat(.3,value),false);}assert.equal(M.habitat(.6,.6),false);
 M.configure({terrainH:()=>10,jungle:(x,z)=>M.habitat(.3,Math.abs(x)<12?.5:.6)});await M.load(r);
 for(let i=0;i<18;i++){M.beginFrame(g,r);assert.equal(M.queue(g,r,'tree',[0,10,0],[1,1,1]),false,'Existing world geometry retains its original fallback rather than adding a photograph on river paint');M.populate(g,r,{solid:()=>false});M.draw(g,r);}
 assert.ok(M.inspect(g,r).plants.length>10);assert.ok(M.inspect(g,r).plants.every(p=>Math.abs(p.groundRoot[0])>=12));assert.ok(M.obstacles(g).every(o=>Math.abs(o.x)>=12));
});

test('complete-source alpha measurement rejects clipped/empty plants and registers the actual visible base',()=>{
 const {M}=fixture(),a=M.measure(64,96,rgba(64,96));assert.deepEqual(Array.from(a.bounds),[8,4,56,92]);near(a.baseline,92/96);near(a.center,.5);near(a.bodyFraction,88/96);assert.equal(a.visiblePixels,48*88);
 assert.throws(()=>M.measure(64,96,new Uint8ClampedArray(64*96*4)),/Empty/);assert.throws(()=>M.measure(64,96,rgba(64,96,true)),/boundary/);assert.throws(()=>M.measure(64,96,[]),/Invalid/);
});

test('complete photographic anchoring preserves source aspect and true root position for every camera bearing',()=>{
 const {M}=fixture(),record={kind:'fern',textureName:'jungle_fern',width:768,height:1024,bodyFraction:.8,baseline:.94,center:.43};
 for(const eye of [[0,12,5],[8,12,0],[-7,12,-4]]){
  const p=[2,10,-3],q=M.anchor(record,p,1.6,eye),dx=eye[0]-p[0],dz=eye[2]-p[2],length=Math.hypot(dx,dz),offset=(record.center-.5)*q.w;
  const actualDx=eye[0]-q.p[0],actualDz=eye[2]-q.p[2],actualLength=Math.hypot(actualDx,actualDz);near(q.h*.8,1.6);near(q.w/q.h,.75);near(q.p[1]+q.h*(1-record.baseline),10);near(q.p[0]+actualDz/actualLength*offset,2);near(q.p[2]-actualDx/actualLength*offset,-3);
  assert.equal(q.cols,1);assert.equal(q.rows,1);assert.equal(q.cell,0);assert.equal(q.motion[1],0,'Wind must not engage human gait deformation');
 }
});

test('deterministic layered understory is grounded, nearest-first and bounded without consuming gameplay RNG',()=>{
 const a=fixture(),b=fixture();let calls=0;a.M.configure({terrainH:(x,z)=>{calls++;return 10+.1*x-.07*z},jungle:()=>true});b.M.configure({terrainH:(x,z)=>10+.1*x-.07*z,jungle:()=>true});
 let pa,pb;
 for(let frame=0;frame<30;frame++){
  a.M.beginFrame(a.g,a.r);b.M.beginFrame(b.g,b.r);const before=calls;pa=a.M.plan(a.g,a.r);pb=b.M.plan(b.g,b.r);
  assert.ok(calls-before<=54);assert.ok(a.M.inspect(a.g,a.r).terrainSamples<=54);assert.ok(a.M.inspect(a.g,a.r).cellUpdates<=6);assert.ok(pa.length<=90);
 }
 assert.ok(pa.length>40);assert.equal(JSON.stringify(pa),JSON.stringify(pb));
 let previous=0;for(const p of pa){near(p.p[1],10+.1*p.p[0]-.07*p.p[2]);assert.ok(p.distance>=2.5&&p.distance>=previous);previous=p.distance;assert.ok(['canopy','liana','bamboo','fern','nipa','litter'].includes(p.kind));}
 const before=calls;a.M.beginFrame(a.g,a.r);a.M.plan(a.g,a.r);assert.equal(calls,before,'Static warmed plants do not repeatedly sample terrain');
});

test('water, steep slopes, cultivated fields, solid structures and invalid terrain reject new understory',()=>{
 for(const terrain of [()=>0,()=>NaN,x=>10+2*x,()=>{throw Error('bad terrain')}]){
  const {M,g,r}=fixture();M.configure({terrainH:terrain,jungle:()=>true});for(let i=0;i<5;i++){M.beginFrame(g,r);assert.equal(M.plan(g,r).length,0);}
 }
 for(const options of [{forest:false,solid:false},{forest:true,solid:true}]){
  const {M,g,r}=fixture();M.configure({terrainH:()=>10,jungle:()=>options.forest});for(let i=0;i<10;i++){M.beginFrame(g,r);assert.equal(M.plan(g,r,{solid:()=>options.solid}).length,0);assert.ok(M.inspect(g,r).solidChecks<=36);}
 }
});

test('world replacement and terrain revision invalidate cached placement without modifying actor/save state',()=>{
 const {M,g,r}=fixture();M.configure({terrainH:()=>10,jungle:()=>true});const before=JSON.stringify(g);M.beginFrame(g,r);M.plan(g,r);assert.equal(JSON.stringify(g),before);
 M.configure({terrainH:()=>30,jungle:()=>true});M.beginFrame(g,r);assert.ok(M.plan(g,r).every(p=>p.p[1]===30));g.world={newWorld:true};M.beginFrame(g,r);assert.equal(M.inspect(g,r).cache,0);
 for(let n=0;n<100;n++){g.evade.p[0]=n*100;M.beginFrame(g,r);M.plan(g,r);}assert.ok(M.inspect(g,r).cache<=256);
});

test('flight, prison, camp and invalid positions leave source atmosphere and placement untouched',()=>{
 for(const condition of [{evade:null},{pow:{stage:'cell'}},{evade:{p:[0,10,0],camp:true}},{evade:{p:[NaN,10,0]}}]){
  const {M,g,r}=fixture();M.configure({terrainH:()=>10,jungle:()=>true});Object.assign(g,condition);const base=g.atm;assert.equal(M.beginFrame(g,r),false);assert.equal(M.plan(g,r).length,0);assert.equal(M.atmosphere(g,base),base);assert.equal(M.queue(g,r,'tree',[4,10,4],[1,1,1]),false);
 }
 const {M,g}=fixture();M.configure({terrainH:()=>10,jungle:()=>true});const before=JSON.stringify(g.atm),result=M.atmosphere(g,g.atm);assert.ok(result.fogDens>g.atm.fogDens);assert.equal(JSON.stringify(g.atm),before);assert.equal(result.wet,g.atm.wet);
});

test('isolated uploads use complete textures, bounded optional wind and real ground roots for projected shadows',async()=>{
 const {M,g,r}=fixture();M.configure({terrainH:()=>10,jungle:()=>true});const loaded=await M.load(r);assert.equal(loaded.status,'ready');assert.equal(loaded.records.length,6);assert.ok(loaded.bytes<=loaded.budget);assert.deepEqual(Array.from(loaded.failures),[]);
 for(let frame=0;frame<12;frame++){
  M.beginFrame(g,r);for(let i=0;i<160;i++)M.queue(g,r,'tree',[(i%16-8)*5,10,(Math.floor(i/16)+1)*5],[1,1,1]);M.populate(g,r,{solid:()=>false});
  const s=M.inspect(g,r);assert.ok(s.terrainSamples<=72);assert.ok(s.queueSamples<=18);assert.ok(s.count<=240);assert.ok(s.counts.canopy+s.counts.liana<=72);
 }
 const count=M.draw(g,r),s=M.inspect(g,r);assert.ok(count>50);assert.ok(s.wind<=32);assert.ok(r.draws.every(d=>d.list.every(p=>p.cols===1&&p.rows===1&&p.cell===0)));
 for(const sh of M.shadowSprites(g,r))near(sh.p[1],10);assert.ok(M.shadowSprites(g,r).length<=32);
 const snapshot=M.inspect(g,r);snapshot.counts.fern=999;snapshot.records[0].bounds[0]=999;assert.notEqual(M.inspect(g,r).counts.fern,999);assert.notEqual(M.inspect(g,r).records[0].bounds[0],999);
});

test('one failed botanical photograph is reported and keeps the original per-kind fallback available',async()=>{
 const {M,g,r}=fixture({fail:'bamboo.webp'});M.configure({terrainH:()=>10,jungle:()=>true});const s=await M.load(r);assert.equal(s.status,'ready');assert.equal(s.records.length,5);assert.equal(s.failures.length,1);assert.equal(s.failures[0].kind,'bamboo');M.beginFrame(g,r);assert.equal(M.queue(g,r,'bamboo',[5,10,5],[1,1,1]),false);assert.equal(M.queue(g,r,'palm',[5,10,5],[1,1,1]),true);
 assert.equal(M.dispose(r),true);assert.equal(M.inspect(g,r).status,'idle');
});


test('top-down litter uses horizontal ground surfaces and ant nests receive a visible rooted fern',async()=>{
 const {M,g,r,window}=fixture();M.configure({terrainH:()=>10,jungle:()=>true});await M.load(r);let surfaces=[];window.WildlifeRender={drawSurfaces(game,renderer,items){surfaces=items;return items.length;}};window.Wildlife={view:()=>({colonies:[{id:'colony',p:[4,10,-3],anchorHeight:1.3}]})};
 for(let i=0;i<12;i++){M.beginFrame(g,r);M.populate(g,r,{solid:()=>false});}M.draw(g,r);assert.ok(surfaces.length);assert.ok(surfaces.every(s=>s.record.kind==='litter'&&s.p[1]===10&&s.length>0&&s.width>0));assert.ok(r.draws.every(group=>group.list.every(s=>s.plantKind!=='litter')),'A top-down leaf photograph cannot become an upright card');
 const record=M.inspect(g,r).records.find(p=>p.kind==='fern'),support=M.inspect(g,r).plants.find(p=>p.id==='nest-support:colony');assert.ok(support);near(support.h*record.bodyFraction,1.3*1.25);near(support.p[1]+(1-record.baseline)*support.h,10);
});


test('dense forest adds midstory and canopy with only actually submitted trunk collision',async()=>{
 const {M,g,r}=fixture();M.configure({terrainH:()=>10,jungle:()=>true});await M.load(r);let plants=[];
 for(let i=0;i<20;i++){M.beginFrame(g,r);M.populate(g,r,{solid:()=>false});assert.ok(M.inspect(g,r).terrainSamples<=72);assert.ok(M.inspect(g,r).solidChecks<=36);M.draw(g,r);plants=M.inspect(g,r).plants;}
 assert.ok(plants.filter(p=>['canopy','liana'].includes(p.kind)).length>=20);assert.ok(plants.filter(p=>p.kind==='bamboo').length>=20);const obstacles=M.obstacles(g);assert.ok(obstacles.length>=40);
 for(const o of obstacles){assert.ok(plants.some(p=>p.id===o.id));assert.ok(o.radius>.2&&o.radius<1);assert.equal(M.blockedAt(g,o.x,o.z,.28),true);assert.equal(o.p[1],10);assert.ok(Math.hypot(o.x-g.evade.p[0],o.z-g.evade.p[2])>=2.5);}
 const chosen=obstacles[0];g.evade.p=[chosen.x+.9,10,chosen.z];r.eye=[chosen.x+.9,11.6,chosen.z];M.beginFrame(g,r);M.populate(g,r,{solid:()=>false});M.draw(g,r);assert.ok(M.obstacles(g).some(o=>o.id===chosen.id),'Established trunk stays visible at real collision distance');
 const copy=M.obstacles(g);copy[0].radius=99;assert.notEqual(M.obstacles(g)[0].radius,99);g.pow={};assert.equal(M.blockedAt(g,chosen.x,chosen.z,.28),false);delete g.pow;g.phase='flight';assert.equal(M.blockedAt(g,chosen.x,chosen.z,.28),false);g.phase='evade';const originalEvade=g.evade;g.evade={p:[0,10,0]};assert.equal(M.obstacles(g).length,0,'Stale evade references cannot retain phantom obstacles');g.evade=originalEvade;assert.ok(M.obstacles(g).length);M.dispose(r);assert.equal(M.blockedAt(g,chosen.x,chosen.z,.28),false,'Disposed photos cannot leave invisible trunk collision');
});

test('near source trees are selected before distant clutter and share bounded new forest reservations',async()=>{
 const {M,g,r}=fixture();M.configure({terrainH:()=>10,jungle:()=>true});await M.load(r);
 for(let frame=0;frame<20;frame++){M.beginFrame(g,r);for(let i=0;i<120;i++)M.queue(g,r,'tree',[100+i*.1,10,0],[1,1,1]);M.queue(g,r,'tree',[3,10,0],[1,1,1]);M.populate(g,r,{solid:()=>false});M.draw(g,r);}
 const s=M.inspect(g,r);assert.ok(s.plants.some(p=>p.id==='tree:3.000:0.000'));assert.ok(s.obstacles.length>=20);assert.ok(s.count<=240);assert.ok((s.counts.canopy||0)+(s.counts.liana||0)<=72);
});

test('forest floor is a ground-phase presentation mode and nearby leaf detail stays bounded and rooted',async()=>{
 const {M,g,r,window}=fixture();M.configure({terrainH:()=>10,jungle:()=>true});await M.load(r);let surfaces=[];window.WildlifeRender={drawSurfaces(game,renderer,items){surfaces=items;return items.length;}};
 assert.equal(M.floorMode(g),1);
 for(let frame=0;frame<14;frame++){M.beginFrame(g,r);M.populate(g,r,{solid:()=>false});M.draw(g,r);const s=M.inspect(g,r);assert.ok(s.terrainSamples<=72);assert.ok(s.fineUpdates<=3);assert.ok(s.fineCache<=128);}
 const fine=surfaces.filter(s=>s.id.startsWith('floor-leaf:'));assert.ok(fine.length>=24&&fine.length<=M.profiles[2].floor);assert.ok(fine.every(s=>s.p[1]===10&&Math.hypot(s.p[0]-g.evade.p[0],s.p[2]-g.evade.p[2])<=11));
 for(let region=0;region<56;region++){g.evade.p[0]+=100;r.eye[0]=g.evade.p[0];M.beginFrame(g,r);M.populate(g,r,{solid:()=>false});const s=M.inspect(g,r);assert.ok(s.terrainSamples<=72&&s.fineUpdates<=3&&s.fineCache<=128);}
 assert.equal(M.inspect(g,r).fineCache,128,'A long walk exercises actual leaf-cell eviction instead of only checking a small warm cache');
 for(const condition of [{phase:'flight'},{pow:{}},{evade:{p:[0,10,0],camp:true}},{evade:{p:[0,10,0],river:true}},{evade:{p:[NaN,10,0]}}])assert.equal(M.floorMode({...g,...condition}),0);
});

test('whole-source mirroring retains the measured asymmetric root at its physical ground centre',async()=>{
 const {M,g,r}=fixture({offCentre:true});M.configure({terrainH:()=>10,jungle:()=>true});await M.load(r);const rs=M.inspect(g,r).records;
 for(let i=0;i<20;i++){M.beginFrame(g,r);M.populate(g,r,{solid:()=>false});}
 for(const eye of [[0,12,0],[7,12,-4],[-6,12,5]]){
  r.eye=eye;r.draws=[];M.beginFrame(g,r);M.populate(g,r,{solid:()=>false});M.draw(g,r);
  const plants=r.draws.flatMap(d=>d.list);assert.ok(plants.some(p=>p.flip)&&plants.some(p=>!p.flip));
  for(const p of plants){const record=rs.find(s=>s.kind===p.plantKind),dx=r.eye[0]-p.p[0],dz=r.eye[2]-p.p[2],length=Math.hypot(dx,dz),center=p.flip?1-record.center:record.center,offset=(center-.5)*p.w;near(p.p[0]+dz/length*offset,p.groundRoot[0]);near(p.p[2]-dx/length*offset,p.groundRoot[2]);near(p.p[1]+p.h*(1-record.baseline),p.groundRoot[1]);}
 }
});

test('fine cover reserves leaves and low ferns at every quality while keeping the existing total and sample budgets',async()=>{
 for(const q of [0,1,2]){
  const {M,g,r,window}=fixture();r.quality=q;M.configure({terrainH:()=>10,jungle:()=>true});await M.load(r);let surfaces=[];window.WildlifeRender={drawSurfaces(game,renderer,rows){surfaces=rows;}};
  for(let i=0;i<24;i++){M.beginFrame(g,r);for(let j=0;j<160;j++)M.queue(g,r,'tree',[(j%16-8)*5,10,(Math.floor(j/16)+1)*5],[1,1,1]);M.populate(g,r,{solid:()=>false});M.draw(g,r);const s=M.inspect(g,r);assert.ok(s.count<=M.profiles[q].total);assert.ok(s.terrainSamples<=72&&s.solidChecks<=36&&s.fineUpdates<=2);}
  const s=M.inspect(g,r),near=s.plants.filter(p=>p.id.startsWith('floor-fern:')),leaves=surfaces.filter(p=>p.id.startsWith('floor-leaf:'));assert.equal(near.length,M.profiles[q].soft);assert.ok(leaves.length>=M.profiles[q].floor*.8&&leaves.length<=M.profiles[q].floor);assert.ok(near.every(p=>p.h*s.records.find(r=>r.kind==='fern').bodyFraction<1.02));assert.ok(near.every(p=>!s.obstacles.some(o=>o.id===p.id)),'Soft understory must not create invisible trunk collision');
  const trees=s.plants.filter(p=>p.kind==='canopy'&&p.id.startsWith('tree:')).map(p=>p.h*s.records.find(r=>r.kind==='canopy').bodyFraction);assert.ok(Math.max(...trees)-Math.min(...trees)>3,'Repeated source trees receive stable natural size variation');
 }
});

test('opaque photographic floor shares the existing botanical budget and exposes its real repeat/mipmap texture',async()=>{
 for(const touch of [false,true]){
  const {M,r,allocations}=fixture({floor:true});const result=await M.load(r,{touch});assert.equal(result.expectedSources,7);assert.equal(result.readySources,7);assert.equal(result.records.length,6);assert.equal(result.floor.status,'ready');assert.equal(result.floor.opaque,true);assert.deepEqual(Array.from(result.failures),[]);assert.ok(result.bytes<=result.budget);
  const floor=M.floorTexture(r);assert.ok(floor&&floor.tex===r.textures.jungle_floor.tex);assert.equal(floor.w,touch?384:512);assert.equal(floor.h,floor.w);assert.equal(floor.worldSize,3);assert.equal(floor.sourceWidth,1254);assert.equal(floor.sourceHeight,1254);
  const params=r.gl.parameters.filter(p=>p.texture==='jungle_floor');for(const p of [r.gl.TEXTURE_WRAP_S,r.gl.TEXTURE_WRAP_T])assert.ok(params.some(v=>v.p===p&&v.value===r.gl.REPEAT));assert.ok(params.some(v=>v.p===r.gl.TEXTURE_MIN_FILTER&&v.value===r.gl.LINEAR_MIPMAP_LINEAR));
  floor.worldSize=99;assert.equal(M.floorTexture(r).worldSize,3,'Public texture descriptor cannot alter registration');assert.equal(allocations(),7);M.dispose(r);assert.equal(allocations(),0);assert.equal(M.floorTexture(r),null);
 }
});

test('floor failure is explicit and never silently consumes a seventh texture or replaces valid plants',async()=>{
 for(const option of [{floorHole:true},{fail:'forest-floor.webp'}]){
  const {M,r,allocations}=fixture({floor:true,...option}),s=await M.load(r);assert.equal(s.expectedSources,7);assert.equal(s.readySources,6);assert.equal(s.records.length,6);assert.equal(s.floor.status,'error');assert.equal(s.floor.ready,false);assert.equal(M.floorTexture(r),null);assert.ok(s.failures.some(f=>f.kind==='floor'));assert.equal(allocations(),6);
 }
 const {M,r}=fixture({floor:true});let current=true;await M.load(r,{current:()=>current});assert.ok(M.floorTexture(r));current=false;assert.equal(M.floorTexture(r),null);current=true;r.gl.isContextLost=()=>true;assert.equal(M.floorTexture(r),null);
});

test('actual floor manifest and lossless encoding retain the unchanged generated source and recorded provenance',()=>{
 const crypto=require('node:crypto'),dir=path.join(__dirname,'../assets/jungle'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),proof=JSON.parse(fs.readFileSync(path.join(dir,'floor-provenance.json'))),png=fs.readFileSync(path.join(dir,'forest-floor.png')),webp=fs.readFileSync(path.join(dir,'forest-floor.webp')),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(Object.keys(manifest.plants).length,6);assert.equal(manifest.floor.file,'forest-floor.webp');assert.equal(manifest.floor.worldSize,3);assert.equal(manifest.floor.gpuHigh,512);assert.equal(manifest.floor.gpuTouch,384);assert.equal(manifest.floor.width,png.readUInt32BE(16));assert.equal(manifest.floor.height,png.readUInt32BE(20));assert.equal(manifest.floor.width,1254);
 assert.equal(sha(png),'48b60e0d211034c7f78d1882e79fd06d0609336867ec9de4fc4a4e0e85639604');assert.equal(sha(png),proof.sourceSHA256);assert.equal(proof.sourceSHA256,proof.rawSHA256);assert.equal(sha(webp),proof.runtimeSHA256);assert.equal(proof.rawSourceByteIdentical,true);assert.equal(proof.allDecodedRGBAIdentical,true);assert.equal(proof.fullyOpaque,true);assert.equal(png.length,proof.sourceBytes);assert.equal(webp.length,proof.runtimeBytes);
 assert.equal(webp.toString('ascii',0,4),'RIFF');assert.equal(webp.toString('ascii',8,12),'WEBP');assert.equal(webp.toString('ascii',12,16),'VP8L','The shipped floor is a lossless WebP stream, not a lossy replacement');
});
