'use strict';
// Pure geometry and isolated image/upload adapters. These do not claim real
// WebGL output; the browser suite exercises the actual shaders and photographs.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/render/wildlife-render.js'),'utf8');
const kinds=['boar','tiger','krait','cobra','pit-viper','scorpion','centipede','weaver-ants'];
function clip(kind,name,frames,mode){return {plates:Array.from({length:frames/4},(_,i)=>kind+'-'+name+'-'+String.fromCharCode(97+i)+'.webp'),frames,cols:2,rows:2,frameSize:[768,512],sourceRegions:Array.from({length:frames},(_,i)=>({source:[i%2*768,Math.floor(i%4/2)*512,768,512],dest:[0,0]})),bounds:Array.from({length:frames},()=>[12,12,756,500]),registration:Array.from({length:frames},()=>({baseline:500/512,center:.5})),bodyHeight:488/512,baseline:500/512,mode,facing:'right'};}
function manifest(){return {version:1,subjects:Object.fromEntries(kinds.map(kind=>{const mammal=['boar','tiger'].includes(kind),snake=['krait','cobra','pit-viper'].includes(kind),animations=mammal?{walk:clip(kind,'walk',16,'billboard'),run:clip(kind,'run',16,'billboard')}:{crawl:clip(kind,'crawl',8,'ground'),...(snake?{threat:clip(kind,'threat',4,'billboard')}:{})};return [kind,{mode:mammal?'billboard':'ground',length:mammal?2:1,width:.5,height:mammal?1:.08,animations}];})),nest:{file:'nest.webp',width:1024,height:1536,bounds:[12,12,1012,1524],baseline:1524/1536,center:.5,bodyHeight:1512/1536}};}
function fixture(extra={}){
 const control={time:0,fail:null,requests:[],copies:[],draws:[],current:true},m=manifest(),window={performance:{now:()=>control.time},fetch:async()=>({ok:true,json:async()=>structuredClone(m)})};
 window.document={createElement(){return {width:0,height:0,getContext(){return {drawImage(...args){control.copies.push(args.slice(1));}};}};}};
 window.Image=class{set src(file){this.naturalWidth=file.endsWith('nest.webp')?1024:1536;this.naturalHeight=file.endsWith('nest.webp')?1536:1024;control.requests.push(file);queueMicrotask(()=>control.fail&&file.includes(control.fail)?this.onerror():this.onload());}};
 const gl={TEXTURE_2D:1,TEXTURE_MIN_FILTER:2,LINEAR_MIPMAP_LINEAR:3,isContextLost:()=>false,bindTexture(){},generateMipmap(){},texParameteri(){},deleteTexture(){}};
 const r={quality:2,eye:[0,1.6,0],textures:{},gl,texFromCanvas(name,canvas){return this.textures[name]={tex:{name},w:canvas.width,h:canvas.height};},drawSprites(name,list){control.draws.push({name,list});}};
 const math=Object.create(Math);math.random=()=>{throw Error('Rendering cannot consume gameplay RNG')};vm.runInNewContext(source,{window,Math:math});const M=window.WildlifeRender;M.configure({terrainH:(x,z)=>10+.2*x-.1*z});Object.assign(control,extra);return {M,r,control,m,g:{world:{},t:0,evade:{p:[0,10,0]}}};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('manifest validation requires all 124 complete poses and the nest, rejecting missing or clipped regions',()=>{
 const {M,m}=fixture();assert.equal(M.validateManifest(m),m);let count=0;for(const s of Object.values(m.subjects))for(const c of Object.values(s.animations))count+=c.frames;assert.equal(count,124);
 for(const mutate of [m=>delete m.nest,m=>delete m.subjects.cobra.animations.threat,m=>m.subjects.tiger.animations.run.frames=4,m=>m.subjects.scorpion.animations.crawl.sourceRegions[0].dest=[900,0],m=>m.subjects.krait.animations.crawl.bounds[0][2]=1000]){const value=structuredClone(m);mutate(value);assert.throws(()=>M.validateManifest(value));}
});

test('measured whole-source regions support 1×4 physical packing without assuming a source atlas grid',async()=>{
 const {M,r,m,control}=fixture();for(const subject of Object.values(m.subjects))for(const c of Object.values(subject.animations))c.sourceRegions=c.sourceRegions.map((_,i)=>({source:[0,i%4*200,700,200],dest:[34,156]}));
 await M.load(r);assert.equal(M.ready(r),true);await M.prepareFrame(r,'tiger','run',3);const copy=control.copies.at(-1);assert.deepEqual(copy.slice(0,4),[0,600,700,200]);assert.equal(M.inspect(r).frames.find(f=>f.key==='tiger:run:3').frame,3);
});

test('reviewed camera scale uniformly transforms the whole photograph and leaves source pixels and the registered ground pivot intact',async()=>{
 const {M,r,m,control}=fixture(),c=m.subjects.tiger.animations.run,index=5;
 c.sourceRegions[index]={source:[22,300,700,200],dest:[46,100],scale:.88};c.bounds[index]=[46,100,662,276];c.registration[index]={baseline:276/512,center:354/768};
 const before=JSON.stringify(c);await M.load(r);await M.prepareFrame(r,'tiger','run',index);
 const copy=control.copies.at(-1);assert.deepEqual(copy.slice(0,4),[22,300,700,200],'Uniform camera registration must not crop or rewrite the original source region');
 assert.deepEqual(copy.slice(4),[46,100,616,176]);near(copy[6]/copy[2],copy[7]/copy[3]);assert.equal(JSON.stringify(c),before);
 const record=M.inspect(r).frames.find(f=>f.key==='tiger:run:'+index);assert.deepEqual(Array.from(record.bounds),[46,100,662,276]);
 const animal={p:[2,10,-4],height:1.05,yaw:Math.PI/2},eye=[0,1.6,0],q=M.billboard(record,animal,eye),dx=eye[0]-q.p[0],dz=eye[2]-q.p[2],distance=Math.hypot(dx,dz),offset=((q.flip?1-record.center:record.center)-.5)*q.w;
 near(q.p[1]+q.h*(1-record.baseline),10);near(q.p[0]+dz/distance*offset,2);near(q.p[2]-dx/distance*offset,-4);
 for(const scale of [0,.49,1.51,NaN,Infinity]){const invalid=structuredClone(m);invalid.subjects.tiger.animations.run.sourceRegions[index].scale=scale;assert.throws(()=>M.validateManifest(invalid),/source region/);}
 const clipped=structuredClone(m);clipped.subjects.tiger.animations.run.sourceRegions[index].dest=[200,100];assert.throws(()=>M.validateManifest(clipped),/source region/);
});

test('nine whole fallback photographs establish readiness and remain resident while motion LRU stays bounded',async()=>{
 for(const touch of [false,true]){
  const {M,r}=fixture();const loaded=await M.load(r,{touch});assert.equal(loaded.status,'ready');assert.equal(loaded.requiredMissing.length,0);assert.equal(loaded.frames.filter(f=>f.resident).length,9);
  for(const kind of kinds){const current=manifest().subjects[kind];for(const action of Object.keys(current.animations))await M.prepareMotion(r,kind,action);}
  const s=M.inspect(r);assert.ok(s.bytes<=s.budget);assert.ok(s.cpuBytes<=s.cpuBudget);assert.ok(s.frames.some(f=>!f.resident),'Motion pressure must actually exercise eviction');
  for(const kind of kinds)assert.ok(s.frames.some(f=>f.kind===kind&&f.frame===0&&f.action!== 'run'&&f.action!=='threat'&&f.resident),'A complete same-species fallback remains visible');
  assert.ok(s.frames.some(f=>f.kind==='nest'&&f.resident));
 }
});

test('fine centipede and ant legs retain512px complete phone textures without changing geometry or cache budgets',async()=>{
 for(const touch of [false,true]){
  const {M,r,m}=fixture();await M.load(r,{touch});for(const kind of ['centipede','weaver-ants'])await M.prepareMotion(r,kind,'crawl');const s=M.inspect(r),frames=s.frames.filter(f=>['centipede','weaver-ants'].includes(f.kind));assert.equal(frames.length,16);assert.ok(frames.every(f=>Math.max(f.gpuWidth,f.gpuHeight)===(touch||f.frame!==0?512:384)));assert.ok(frames.every(f=>f.width===m.subjects[f.kind].animations.crawl.frameSize[0]&&f.height===m.subjects[f.kind].animations.crawl.frameSize[1]));
  for(const kind of kinds){const subject=m.subjects[kind];for(const action of Object.keys(subject.animations))await M.prepareMotion(r,kind,action);}
  const pressured=M.inspect(r);assert.equal(pressured.budget,(touch?14:24)*1024*1024);assert.ok(pressured.bytes<=pressured.budget&&pressured.cpuBytes<=pressured.cpuBudget);assert.equal(pressured.requiredMissing.length,0);assert.ok(pressured.frames.some(f=>!f.resident),'Mixed motion really exercises LRU pressure');for(const kind of ['centipede','weaver-ants'])assert.ok(pressured.frames.find(f=>f.key===kind+':crawl:0').resident,'The complete sharp fallback cannot be evicted');
 }
});

test('optional image failures coalesce, back off, recover and keep the required same-animal body',async()=>{
 const {M,r,control}=fixture();await M.load(r);control.fail='boar-run-a.webp';const before=control.requests.length;
 await Promise.all(Array.from({length:100},()=>M.prepareFrame(r,'boar','run',1)));assert.equal(control.requests.length-before,1);assert.equal(M.ready(r),true);
 await M.prepareFrame(r,'boar','run',1);assert.equal(control.requests.length-before,1);control.time+=1100;await M.prepareFrame(r,'boar','run',1);assert.equal(control.requests.length-before,2);
 control.fail=null;control.time+=4100;await M.prepareFrame(r,'boar','run',1);assert.equal(control.requests.length-before,3);assert.ok(M.inspect(r).frames.find(f=>f.key==='boar:run:1').resident);assert.equal(M.inspect(r).failures.length,0);
});

test('required photograph errors prevent readiness and retry establishes a complete fresh context',async()=>{
 const {M,r,control}=fixture({fail:'nest.webp'});await M.load(r);assert.equal(M.ready(r),false);assert.equal(M.inspect(r).status,'error');assert.ok(M.inspect(r).requiredMissing.includes('nest'));
 control.fail=null;await M.retry(r);assert.equal(M.ready(r),true);assert.equal(M.inspect(r).requiredMissing.length,0);assert.equal(M.inspect(r).failures.length,0);
});

test('stale renderer ownership prevents asynchronous uploads after context replacement',async()=>{
 const {M,r,control}=fixture();await M.load(r,{current:()=>control.current});const count=Object.keys(r.textures).length;control.current=false;await M.prepareFrame(r,'boar','run',1);assert.equal(Object.keys(r.textures).length,count);
});

test('ground patches orient the photographed head right along actual yaw and follow the real terrain corners',()=>{
 for(const yaw of [0,Math.PI/2,-1.7]){
  const {M,r,g}=fixture(),a={p:[2,10.4,0],yaw,length:1.2,width:.45,height:.04},record={referenceWidth:.8,bodyHeight:.75,textureName:'test'},p=M.geometry(g,r,a,record);
  assert.ok(p);for(const corner of p.vertices)near(corner[1],10+.2*corner[0]-.1*corner[2]+p.groundLift);
  const head=[(p.vertices[1][0]+p.vertices[2][0])*.5,(p.vertices[1][2]+p.vertices[2][2])*.5],tail=[(p.vertices[0][0]+p.vertices[3][0])*.5,(p.vertices[0][2]+p.vertices[3][2])*.5];
  near((head[0]-tail[0])/(a.length/.8),Math.sin(yaw));near((head[1]-tail[1])/(a.length/.8),-Math.cos(yaw));near(Math.hypot(...p.normal),1);assert.ok(p.normal[1]>0);assert.equal(p.data.length,48);
 }
});

test('ground sampling is cached and capped, with cold steep/invalid surfaces omitted rather than floating',()=>{
 const {M,r,g}=fixture(),record={referenceWidth:.8,bodyHeight:.75,textureName:'test'},a={p:[2,10,0],yaw:0,length:1,width:.5,height:.04};const first=M.geometry(g,r,a,record,'a');assert.ok(first);const before=M.inspect(r).terrainSamples;for(let i=0;i<50;i++)assert.ok(M.geometry(g,r,a,record,'a'));assert.equal(M.inspect(r).terrainSamples,before);
 for(let i=0;i<50;i++)M.geometry(g,r,{...a,p:[i*2,10,3]},record,'new'+i);assert.ok(M.inspect(r).terrainSamples<=40);assert.ok(M.inspect(r).groundUpdates<=8);
 for(const bad of [()=>NaN,x=>x>2?40:0,()=>{throw Error('terrain')}]){const f=fixture();f.M.configure({terrainH:bad});assert.equal(f.M.geometry(f.g,f.r,a,record),null);}
});

test('billboard full body registration holds the source baseline/aspect and mirrors the whole animal',()=>{
 const {M}=fixture(),record={kind:'tiger',width:768,height:512,bodyHeight:.75,baseline:.95,center:.53,referenceWidth:.8,textureName:'tiger',facing:'right',frame:0,action:'walk'},a={p:[1,10,-4],height:1,yaw:Math.PI/2};
 const q=M.billboard(record,a,[0,1.6,0]);near(q.h*.75,1);near(q.w/q.h,1.5);near(q.p[1]+q.h*(1-.95),10);assert.equal(q.cols,1);assert.equal(q.rows,1);assert.equal(q.motion,null);
 const reverse=M.billboard(record,{...a,yaw:-Math.PI/2},[0,1.6,0]);assert.notEqual(q.flip,reverse.flip);
});

test('run photograph contact holds vary subtly, while crawl and warned threat poses stay chronological',()=>{
 const {M,m}=fixture(),c=m.subjects.boar.animations.run;c.sourceRegions[4].source[3]=300;
 const counts=Array(16).fill(0);for(let i=0;i<16000;i++)counts[M.frameAt(c,(i+.5)/16000,'run')]++;assert.ok(counts[4]<counts[0]);assert.ok(counts.every(n=>n>=880&&n<=1120));
 assert.deepEqual(Array.from({length:8},(_,i)=>M.frameAt(m.subjects.scorpion.animations.crawl,(i+.5)/8,'crawl')),Array.from({length:8},(_,i)=>i));assert.deepEqual([.15,.4,.6,.85].map(p=>M.frameAt(m.subjects.cobra.animations.threat,p,'threat')),[0,1,2,3]);
});

test('visible mammal descriptors use the real prepared pose, preserve actor data and expose actual draw evidence',async()=>{
 const {M,r,g,control}=fixture();await M.load(r);await M.prepareFrame(r,'tiger','run',5);const animal={id:'t',kind:'tiger',p:[0,10,-4],yaw:Math.PI/2,length:2.65,width:.72,height:1,moving:true,clip:'run',phase:5.5/16},before=JSON.stringify(animal),view={active:true,clock:1,animals:[animal],colonies:[]};
 M.draw(g,r,view);assert.equal(JSON.stringify(animal),before);const d=M.inspect(r).lastDraw[0];assert.equal(d.kind,'tiger');assert.equal(d.frame,5);assert.equal(d.fallback,false);assert.equal(d.drawn,true);assert.equal(d.quad.cols,1);assert.ok(control.draws.length);assert.ok(d.gpuWidth>=576);
});


test('colony ants move at centimetre scale, face their path and freeze on the simulation clock',async()=>{
 const {M,r,g}=fixture();await M.load(r);const view={active:true,clock:10,animals:[],colonies:[{id:'n',p:[0,10,-2],anchorHeight:1.3,height:.55,activity:1}]};M.draw(g,r,view);const first=M.inspect(r).lastDraw.map(a=>({...a,p:a.p.slice()}));assert.equal(first.length,8);view.clock+=.1;M.draw(g,r,view);const next=M.inspect(r).lastDraw;
 for(let i=0;i<8;i++){const dx=next[i].p[0]-first[i].p[0],dz=next[i].p[2]-first[i].p[2],distance=Math.hypot(dx,dz);assert.ok(distance>.0049&&distance<.0051);const dot=(dx*Math.sin(first[i].yaw)-dz*Math.cos(first[i].yaw))/distance;assert.ok(dot>.999,'Whole ant heads follow the tangent rather than point sideways');}
 M.draw(g,r,view);assert.deepEqual(M.inspect(r).lastDraw.map(a=>a.p),next.map(a=>a.p));M.draw(g,r,{active:false});assert.equal(M.inspect(r).lastDraw.length,0);assert.equal(M.inspect(r).groundDraws,0);assert.equal(M.inspect(r).nestDraws,0);
});

test('generic leaf-litter surfaces render horizontally with 12mm lift before wildlife assets are ready',()=>{
 const {M,r,g}=fixture();r.textures.leaf={tex:{}};const record={kind:'litter',textureName:'leaf',referenceWidth:1,bodyHeight:1},items=Array.from({length:20},(_,i)=>({id:'leaf'+i,p:[i*2,10,-3],yaw:i*.1,length:1.2,width:.8,record}));
 for(let i=0;i<6;i++){M.drawSurfaces(g,r,items);assert.ok(M.inspect(r).surfaceTerrainSamples<=20);assert.equal(M.ready(r),false);}
 const s=M.inspect(r);assert.equal(s.surfaceDraws,20);for(const patch of s.lastSurfaces){near(patch.groundLift,.012);for(const p of patch.vertices)near(p[1],10+.2*p[0]-.1*p[2]+.012);}
});
test('pickup surfaces use their actual floor sampler and bounded lift with cache invalidation between field and raised banks',()=>{
 const {M,r,g}=fixture(),record={referenceWidth:.9,bodyHeight:.8,textureName:'pickup'},base={id:'pickup:food',p:[2,80,1],yaw:.4,record,length:.4,width:.3,groundLift:.028,floorKey:'field',floorAt:(x,z)=>80+.03*x-.02*z};r.textures.pickup={tex:{}};
 M.drawSurfaces(g,r,[base]);let s=M.inspect(r);assert.equal(s.surfaceDraws,1);assert.equal(s.surfaceTerrainSamples,5);for(const p of s.lastSurfaces[0].vertices)near(p[1],base.floorAt(p[0],p[2])+.028);near(s.lastSurfaces[0].groundLift,.028);
 M.drawSurfaces(g,r,[base]);assert.equal(M.inspect(r).surfaceTerrainSamples,0,'Stable same-floor item reuses its four-corner surface');
 M.drawSurfaces(g,r,[{...base,floorKey:'riverbank',floorAt:()=>126.35}]);s=M.inspect(r);assert.equal(s.surfaceTerrainSamples,5);for(const p of s.lastSurfaces[0].vertices)near(p[1],126.378);
 M.drawSurfaces(g,r,[{...base,floorKey:'riverbank',floorAt:()=>126.35,groundLift:5}]);near(M.inspect(r).lastSurfaces[0].groundLift,.08,'External surfaces cannot request an unbounded hover offset');
});


test('off-center whole-body poses keep their actual world pivot when the shader turns the registered quad',()=>{
 const {M}=fixture();for(const center of [.28,.43,.68,.75])for(const yaw of [-Math.PI/2,Math.PI/2]){const record={kind:'tiger',width:1100,height:512,bodyHeight:.75,baseline:.95,center,referenceWidth:.8,textureName:'tiger',facing:'right',frame:0,action:'walk'},a={p:[2,10,-4],height:1,yaw},eye=[0,1.6,0],q=M.billboard(record,a,eye),dx=eye[0]-q.p[0],dz=eye[2]-q.p[2],distance=Math.hypot(dx,dz),offset=((q.flip?1-center:center)-.5)*q.w;near(q.p[0]+dz/distance*offset,a.p[0]);near(q.p[2]-dx/distance*offset,a.p[2]);}
});
