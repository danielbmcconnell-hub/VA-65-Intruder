'use strict';
// Pure placement and isolated canvas/upload-adapter checks. Actual photographs,
// WebGL output and native game navigation are verified by browser coverage.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/render/jungle-scenery.js'),'utf8');
function rgba(width,height,edge=false){const data=new Uint8ClampedArray(width*height*4);for(let y=4;y<height-4;y++)for(let x=8;x<width-8;x++){const i=(y*width+x)*4;data[i]=45;data[i+1]=112;data[i+2]=34;data[i+3]=255;}if(edge)data[3]=255;return data;}
function fixture(options={}){
 const math=Object.create(Math);math.random=()=>{throw Error('Scenery must not consume gameplay RNG')};
 const document={createElement(){return {width:0,height:0,getContext(){const cv=this;return {drawImage(im){cv.imageSource=im;},getImageData(){let data;if(cv.imageSource?._src.includes('forest-floor')){data=new Uint8ClampedArray(cv.width*cv.height*4);for(let i=0;i<data.length;i+=4){data[i]=50;data[i+1]=40;data[i+2]=28;data[i+3]=255;}if(options.floorHole)data[3]=0;}else data=rgba(cv.width,cv.height);if(options.offCentre)for(let y=0;y<cv.height;y++)for(let x=0;x<Math.floor(cv.width*.28);x++)data[(y*cv.width+x)*4+3]=0;return {data};}};}};}};
 const window={document,fetch:async()=>({ok:true,json:async()=>({version:1,...(options.floor?{floor:{file:'forest-floor.webp',width:1254,height:1254,worldSize:3,gpuHigh:512,gpuTouch:384}}:{}),...(options.crown?{crown:{file:'canopy-crown.webp',width:1254,height:1254,gpuHigh:384,gpuTouch:256}}:{}),...(options.components?{components:JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/jungle/manifest.json'),'utf8')).components}:{}),plants:Object.fromEntries(['canopy','bamboo','nipa','fern','liana','litter'].map(kind=>[kind,{file:kind+'.webp'}]))})})};
 window.Image=class{constructor(){this.naturalWidth=1024;this.naturalHeight=1536;}set src(value){this._src=value;if(value.includes('forest-floor')||value.includes('canopy-crown'))this.naturalWidth=this.naturalHeight=1254;if(value.includes('broadleaf-sprig')){this.naturalWidth=1536;this.naturalHeight=1024;}if(value.includes('coconut-frond')){this.naturalWidth=1774;this.naturalHeight=887;}queueMicrotask(()=>value.includes(options.fail||'never-fail')?this.onerror():this.onload());}};
 vm.runInNewContext(source,{window,Math:math});
 let allocations=0;const gl={TEXTURE_2D:1,TEXTURE_MIN_FILTER:2,LINEAR_MIPMAP_LINEAR:3,TEXTURE_WRAP_S:4,TEXTURE_WRAP_T:5,REPEAT:6,parameters:[],isContextLost:()=>false,bindTexture(target,T){this.bound=T;},generateMipmap(){},texParameteri(target,p,value){this.parameters.push({texture:this.bound?.name,p,value});},deleteTexture(){allocations--;}};
 const r={eye:[0,12,0],quality:2,textures:{},gl,texFromCanvas(name,cv){allocations++;return this.textures[name]={tex:{name},w:cv.width,h:cv.height};},_drawSpriteBatch(name,list,wind){this.draws.push({name,list,wind});},draws:[]};
 const g={phase:'evade',t:0,world:{},evade:{p:[0,10,0]},atm:{fogDens:.0001,fogHeight:1200,wet:.5}};
 return {M:window.JungleScenery,g,r,window,allocations:()=>allocations};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('ordinary deck, recovery and ending views retain botanical presentation with finite aircraft positions',async()=>{
 const {M,g,r}=fixture();M.configure({terrainH:()=>10,jungle:()=>false});await M.load(r);delete g.evade;g.ac={p:[0,30,0]};
 for(const phase of ['deck','airborne','flight','recovery','chute','done','dead']){g.phase=phase;assert.equal(M.beginFrame(g,r),true);assert.equal(M.queue(g,r,'tree',[20,10,-30],[1,1,1]),true);M.populate(g,r);M.draw(g,r);const s=M.inspect(g,r);assert.equal(s.count,1,phase);assert.equal(s.obstacles.length,0);assert.equal(s.cellUpdates,0);assert.equal(M.floorMode(g),0);}
});

test('loading and failed-source prototypes contain real forks and pointed leaves without spherical crowns',()=>{
 const {M}=fixture();class Builder{constructor(){this.triangles=[];this.quads=[];}tri(...v){this.triangles.push(v);}quad(...v){this.quads.push(v);}blob(){throw Error('Rounded fallback crown must not return');}}
 for(const kind of ['tree','palm','bamboo','bush']){const m=M.buildFallback(kind,Builder),shape=M.botanicalStructure(kind);assert.ok(m.botanical.branches>=3);assert.ok(m.botanical.leafBlades>=80);assert.equal(m.botanical.sphericalCrowns,0);assert.ok(m.triangles.length>100);for(const [a,b,c]of m.triangles){const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];assert.ok(Math.hypot(...n)>1e-7);assert.ok([...a,...b,...c].every(Number.isFinite));}assert.ok(shape.cards.some(c=>Math.abs(c.u[1])+Math.abs(c.v[1])>.2));}
 const variants=[0,1,2].map(v=>M.botanicalStructure('tree',v));assert.equal(new Set(variants.map(v=>JSON.stringify(v.cards))).size,3);assert.ok(variants.every(v=>v.branches.some(b=>b.a[1]<v.height*.32&&Math.hypot(b.b[0],b.b[2])>1)),'Lower forks break the bare-stick silhouette');
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');for(const kind of ['tree','palm','bamboo','bush'])assert.ok(index.includes("P."+kind+" = JungleScenery.buildFallback('"+kind+"', MB, C)"));
});

test('registered branch and frond components share the original botanical budget and replace near whole-tree cards',async()=>{
 for(const touch of [false,true]){const {M,g,r}=fixture({floor:true,crown:true,components:true});M.configure({terrainH:()=>10,jungle:()=>true});const loaded=await M.load(r,{touch});assert.equal(loaded.expectedSources,10);assert.equal(loaded.readySources,10);assert.equal(loaded.components.length,2);assert.deepEqual(Array.from(loaded.failures),[]);assert.ok(loaded.bytes<=loaded.budget);const leaf=loaded.components.find(c=>c.kind==='broadleaf');assert.equal(leaf.width,touch?576:768);assert.equal(leaf.height,touch?384:512);assert.deepEqual(Array.from(leaf.root),[0,.92]);assert.equal(leaf.sourceWidth,1536);assert.equal(leaf.sourceHeight,1024);
  delete g.evade;g.ac={p:[0,20,0]};g.phase='recovery';for(let frame=0;frame<8;frame++){M.beginFrame(g,r);for(let i=0;i<25;i++)M.queue(g,r,i%4===0?'palm':'tree',[(i%5-2)*9,10,-12-Math.floor(i/5)*11],[1,1,1]);M.populate(g,r);M.draw(g,r);}const s=M.inspect(g,r);assert.ok(s.structural.length>0);assert.ok(s.primitiveCounts.plannedLeafCards>100);assert.ok(s.primitiveCounts.plannedLeafCards<=M.profiles[r.quality].leafCards);assert.equal(s.primitiveCounts.roundCrownSurfaces,0);assert.ok(s.structural.some(v=>v.kind==='palm'&&v.height>7));assert.equal(s.obstacles.length,0);for(const v of s.structural){const p=s.plants.find(p=>p.id===v.id);assert.ok(p);assert.deepEqual(Array.from(v.p),Array.from(p.groundRoot));}M.dispose(r);
 }
});

test('missing leaf material keeps a branched individual-leaf near fallback instead of reintroducing a sphere',async()=>{
 const {M,g,r}=fixture({components:true,fail:'broadleaf-sprig.webp'});M.configure({terrainH:()=>10,jungle:()=>true});await M.load(r);delete g.evade;g.ac={p:[0,20,0]};g.phase='deck';M.beginFrame(g,r);M.queue(g,r,'tree',[0,10,-20],[1,1,1]);M.populate(g,r);M.draw(g,r);const s=M.inspect(g,r);assert.ok(s.failures.some(f=>f.kind==='component-broadleaf'));assert.equal(s.structural[0].material,'individual-leaf-geometry');assert.equal(s.primitiveCounts.roundCrownSurfaces,0);
});

test('component registration permits only the intentional left stem entry and preserves original generated and reference files',()=>{
 const {M}=fixture(),pixels=rgba(64,96);pixels[(88*64)*4+3]=255;assert.throws(()=>M.measure(64,96,pixels),/boundary/);assert.equal(M.measure(64,96,pixels,true).bounds[0],0);pixels[(0*64+20)*4+3]=255;assert.throws(()=>M.measure(64,96,pixels,true),/boundary/);
 const crypto=require('node:crypto'),root=path.join(__dirname,'..'),proof=JSON.parse(fs.readFileSync(path.join(root,'assets/jungle/components-provenance.json'))),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(proof.records.length,2);
 for(const item of proof.records){const png=fs.readFileSync(path.join(root,'assets/jungle',item.source)),webp=fs.readFileSync(path.join(root,'assets/jungle',item.runtime));assert.equal(sha(png),item.sourceSHA256);assert.equal(sha(webp),item.runtimeSHA256);assert.equal(sha(fs.readFileSync(path.join(root,item.reference))),item.referenceSHA256);assert.equal(item.sourceByteIdenticalToGenerated,true);assert.equal(item.allDecodedRGBAIdentical,true);assert.equal(item.includesInvisibleRGB,true);assert.equal(webp.toString('ascii',12,16),'VP8L');assert.equal(png.readUInt32BE(16),item.width);assert.equal(png.readUInt32BE(20),item.height);}
});

function ecologyFixture(options={}){
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=index.indexOf('function prepareGroundEcology(game){'),end=index.indexOf('\nfunction updateWildlifeStatus',start);assert.ok(start>0&&end>start);
 const loads=[],wildlife=[],legacy=[],context={IS_TOUCH:false,LandingWater:{swimming:()=>!!options.swimming},JungleScenery:{load(renderer,settings){loads.push({renderer,options:settings});return options.reject?Promise.reject(Error('Botanical upload failed')):Promise.resolve();},ready:()=>!options.unready,inspect:()=>({failures:options.failures||[]}),kinds:['canopy','bamboo','nipa','fern','liana','litter']},WildlifeRender:{load(renderer,options){wildlife.push({renderer,options});return Promise.resolve();}}};
 const prepare=vm.runInNewContext('('+index.slice(start,end)+')',context),renderer={_loadLegacyVegetation(){legacy.push(this);}},game={phase:'flight',world:{},ac:{p:[10,120,20]},rend:renderer,app:{rend:renderer}};
 return {prepare,game,renderer,loads,wildlife,legacy};
}

test('normal flight requests complete botanical photographs once without enabling ground wildlife',async()=>{
 const {prepare,game,renderer,loads,wildlife,legacy}=ecologyFixture(),before=JSON.stringify({phase:game.phase,world:game.world,ac:game.ac});
 prepare(game);prepare(game);await Promise.resolve();
 assert.equal(loads.length,1,'Normal flight must load the photographs before an evade state exists');assert.equal(loads[0].renderer,renderer);assert.equal(loads[0].options.touch,false);assert.equal(loads[0].options.current(),true);assert.equal(wildlife.length,0);assert.equal(legacy.length,0);assert.equal(JSON.stringify({phase:game.phase,world:game.world,ac:game.ac}),before);
 game.app.rend={};assert.equal(loads[0].options.current(),false,'An old renderer cannot upload after graphics restoration');
});

test('normal flight requests existing fallback for failed plants while a failed floor alone preserves valid foliage',async()=>{
 for(const options of [{unready:true},{reject:true},{failures:[{kind:'bamboo',message:'decode failed'}]},{failures:[{kind:'floor',message:'decode failed'}]}]){
  const {prepare,game,renderer,loads,wildlife,legacy}=ecologyFixture(options);prepare(game);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(loads.length,1);assert.equal(wildlife.length,0);assert.equal(legacy.length,options.failures?.[0]?.kind==='floor'?0:1);if(legacy.length)assert.equal(legacy[0],renderer);
 }
 const stale=ecologyFixture({reject:true});stale.prepare(stale.game);stale.game.app.rend={};await new Promise(resolve=>setImmediate(resolve));assert.equal(stale.legacy.length,0,'A failed retired renderer cannot start a fallback upload');
});

test('captivity exterior and swimming still request source foliage without enabling forest wildlife',async()=>{
 for(const condition of [{pow:{stage:'yard'},evade:{p:[0,6,0]}},{evade:{p:[0,6,0],camp:true}},{evade:{p:[0,6,0],river:true}},{evade:{p:[0,6,0]},swimming:true}]){
  const {prepare,game,loads,wildlife,legacy}=ecologyFixture({swimming:condition.swimming});Object.assign(game,condition,{phase:'evade'});prepare(game);await new Promise(resolve=>setImmediate(resolve));assert.equal(loads.length,1);assert.equal(wildlife.length,0);assert.equal(legacy.length,0);
 }
});

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
 for(let i=0;i<18;i++){M.beginFrame(g,r);assert.equal(M.queue(g,r,'tree',[0,10,0],[1,1,1]),true,'Replacing an existing world tree does not introduce new vegetation habitat');M.populate(g,r,{solid:()=>false});M.draw(g,r);}
 assert.ok(M.inspect(g,r).plants.length>10);assert.ok(M.inspect(g,r).plants.filter(p=>!p.id.startsWith('tree:')).every(p=>Math.abs(p.groundRoot[0])>=12));assert.ok(M.obstacles(g).every(o=>Math.abs(o.x)>=12));
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

test('flight, prison, camp and invalid positions leave new ground ecology and atmosphere untouched',()=>{
 for(const condition of [{evade:null},{pow:{stage:'cell'}},{evade:{p:[0,10,0],camp:true}},{evade:{p:[NaN,10,0]}}]){
  const {M,g,r}=fixture();M.configure({terrainH:()=>10,jungle:()=>true});Object.assign(g,condition);const base=g.atm,began=M.beginFrame(g,r);if(!g.pow&&!g.evade?.camp)assert.equal(began,false,'A ground phase without a valid ground actor remains ineligible');assert.equal(M.inspect(g,r).eligible,false);assert.equal(M.plan(g,r).length,0);assert.equal(M.atmosphere(g,base),base);assert.equal(M.queue(g,r,'tree',[4,10,4],[1,1,1]),false,'An unloaded source retains its fallback');
 }
 const {M,g}=fixture();M.configure({terrainH:()=>10,jungle:()=>true});const before=JSON.stringify(g.atm),result=M.atmosphere(g,g.atm);assert.ok(result.fogDens>g.atm.fogDens);assert.equal(JSON.stringify(g.atm),before);assert.equal(result.wet,g.atm.wet);
});

test('authored camp and prison vegetation keeps its graded root without adding forest ecology or collision',async()=>{
 for(const condition of [{pow:{stage:'yard'}},{evade:{p:[0,6,0],camp:true}}]){
  const {M,g,r}=fixture();M.configure({terrainH:()=>80,jungle:()=>true});Object.assign(g,condition);r.eye=[0,7.68,0];await M.load(r);const before=JSON.stringify(g),base=g.atm;
  for(let frame=0;frame<3;frame++){M.beginFrame(g,r);assert.equal(M.queue(g,r,'tree',[8,6,12],[1,1,1]),true);assert.equal(M.queue(g,r,'bamboo',[20,6,12],[1,1,1]),true);M.populate(g,r,{solid:()=>{throw Error('Captivity source presentation must not add new collision');}});M.draw(g,r);}
  const s=M.inspect(g,r);assert.equal(s.plants.length,2);assert.equal(s.eligible,false);assert.equal(s.sceneryEligible,true);assert.equal(s.cache,0);assert.equal(s.fineCache,0);assert.equal(s.terrainSamples,0);assert.equal(s.solidChecks,0);assert.equal(M.floorMode(g),0);assert.equal(M.obstacles(g).length,0);assert.equal(M.atmosphere(g,base),base);assert.equal(JSON.stringify(g),before);
  for(const p of s.plants){const record=s.records.find(v=>v.kind===p.kind);near(p.groundRoot[1],6);near(p.p[1]+p.h*(1-record.baseline),6);}
 }
});

test('normal flight and descent replace source trees beyond the old ground range without ground ecology or collision',async()=>{
 for(const phase of ['flight','chute']){
  const {M,g,r}=fixture();M.configure({terrainH:()=>10,jungle:()=>false});await M.load(r);delete g.evade;g.phase=phase;g.ac={p:[0,150,0]};if(phase==='chute')g.chute={p:[0,150,0]};r.eye=[0,120,0];
  const before=JSON.stringify(g),base=g.atm;
  for(let frame=0;frame<8;frame++){M.beginFrame(g,r);assert.equal(M.queue(g,r,'tree',[4,9.2,10],[1,1,1]),true);assert.equal(M.queue(g,r,'bamboo',[35,9.7,350],[1,1,1]),true);M.populate(g,r,{solid:()=>{throw Error('Aerial presentation must not query ground collisions');}});M.draw(g,r);}
  const s=M.inspect(g,r);assert.ok(s.plants.some(p=>p.id==='tree:4.000:10.000'));assert.ok(s.plants.some(p=>p.id==='bamboo:35.000:350.000'),'Existing trees remain photographic past the old166m ground range');assert.equal(s.cache,0);assert.equal(s.fineCache,0);assert.equal(s.solidChecks,0);assert.equal(M.plan(g,r).length,0);assert.equal(M.floorMode(g),0);assert.equal(M.obstacles(g).length,0);assert.equal(M.blockedAt(g,4,10),false);assert.equal(M.atmosphere(g,base),base);assert.equal(JSON.stringify(g),before);
  for(const p of s.plants){const record=s.records.find(v=>v.kind===p.kind);near(p.p[1]+p.h*(1-record.baseline),p.groundRoot[1]);near(p.w/p.h,record.width/record.height);near(p.groundRoot[1],10);}
  assert.ok(r.draws.every(group=>group.list.every(p=>p.cols===1&&p.rows===1&&p.cell===0)));
 }
});

test('cultivated source vegetation receives whole photographs while added forest ecology stays excluded',async()=>{
 const {M,g,r}=fixture();M.configure({terrainH:()=>10,jungle:()=>false});await M.load(r);
 for(let frame=0;frame<8;frame++){M.beginFrame(g,r);for(const [mesh,x]of [['tree',7],['palm',14],['bamboo',21],['bush',28]])assert.equal(M.queue(g,r,mesh,[x,10,18],[1,1,1]),true);assert.equal(M.plan(g,r).length,0);M.populate(g,r,{solid:()=>false});M.draw(g,r);}
 const s=M.inspect(g,r);for(const mesh of ['tree','palm','bamboo','bush'])assert.ok(s.plants.some(p=>p.id.startsWith(mesh+':')),'Existing '+mesh+' receives its complete source photograph');assert.equal(M.obstacles(g).length,0);assert.ok(s.plants.every(p=>!p.id.startsWith('understory:')&&!p.id.startsWith('floor-')));
});

test('every aerial quality bounds far-first source candidates and selects nearer photographs within the declared range',async()=>{
 for(const quality of [0,1,2]){
  const {M,g,r}=fixture();r.quality=quality;M.configure({terrainH:()=>10,jungle:()=>false});await M.load(r);delete g.evade;g.phase='flight';g.ac={p:[0,120,0]};r.eye=[0,120,0];const profile=M.profiles[quality],outside=profile.horizon+10;
  for(let frame=0;frame<18;frame++){
   M.beginFrame(g,r);for(let i=1200;i>0;i--)M.queue(g,r,'tree',[0,9.2,profile.flightRange*(.2+.7*i/1200)],[1,1,1]);M.queue(g,r,'tree',[0,9.2,3],[1,1,1]);M.queue(g,r,'tree',[0,9.2,3],[1,1,1]);M.queue(g,r,'tree',[outside,9.2,0],[1,1,1]);
   const queued=M.inspect(g,r);assert.ok(queued.sceneryCandidates<=queued.sceneryCandidateLimit);assert.ok(queued.sceneryCandidateLimit<=profile.total*2);
   M.populate(g,r);M.draw(g,r);const s=M.inspect(g,r);assert.ok(s.count<=profile.flightTotal);assert.ok(s.queueSamples<=M.limits.queueSamples&&s.terrainSamples<=M.limits.queueSamples);assert.equal(s.solidChecks,0);assert.equal(s.cellUpdates,0);assert.equal(s.obstacles.length,0);
  }
  const s=M.inspect(g,r);assert.equal(s.count,profile.flightTotal);assert.equal(s.plants.filter(p=>p.id==='tree:0.000:3.000').length,1,'The nearby source survives far-first input without duplicate photographs');assert.ok(s.plants.every(p=>Math.hypot(p.groundRoot[0],p.groundRoot[2])<profile.flightRange));assert.ok(!s.plants.some(p=>p.id==='tree:'+outside.toFixed(3)+':0.000'));
 }
});

test('each aerial quality reserves visible distant trees while near clutter cannot clear the horizon',async()=>{
 for(const quality of [0,1,2]){
  const {M,g,r}=fixture();r.quality=quality;M.configure({terrainH:()=>10,jungle:()=>false});await M.load(r);delete g.evade;g.phase='flight';g.ac={p:[0,120,0]};r.eye=[0,120,0];r.matV=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];const profile=M.profiles[quality];
  for(let frame=0;frame<18;frame++){
   M.beginFrame(g,r);for(let i=0;i<700;i++)M.queue(g,r,'tree',[(i%25-12)*3,10,-10-Math.floor(i/25)*3],[1,1,1]);
   for(let i=profile.farTotal*4;i>0;i--){M.queue(g,r,'tree',[i,10,-profile.flightRange*2-i*9],[1,1,1]);M.queue(g,r,'tree',[i,10,profile.flightRange*2+i*9],[1,1,1]);}M.populate(g,r);M.draw(g,r);
   const s=M.inspect(g,r);assert.ok(s.distantCandidates<=s.distantCandidateLimit);assert.ok(s.distantCandidateLimit<=profile.farTotal*2);assert.ok(s.count<=profile.flightTotal);assert.ok(s.queueSamples<=M.limits.queueSamples);
  }
  const s=M.inspect(g,r),far=s.plants.filter(p=>Math.hypot(p.groundRoot[0],p.groundRoot[2])>=profile.flightRange);assert.equal(far.length,profile.farTotal,'Near clutter retains a reserved distant source band');assert.ok(far.every(p=>p.groundRoot[2]<0),'The distant band spends no photographs behind the camera');assert.ok(s.plants.some(p=>Math.hypot(p.groundRoot[0],p.groundRoot[2])<profile.flightRange));assert.equal(s.obstacles.length,0);
 }
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

test('native camera visibility gives source photo slots to visible trees before nearer trees behind the view',async()=>{
 const {M,g,r}=fixture();M.configure({terrainH:()=>10,jungle:()=>true});await M.load(r);delete g.evade;g.phase='flight';g.ac={p:[0,12,0]};r.quality=0;
 // Perspective inspection matrix looking down negative Z. World/actors and
 // local ecology are unchanged; this tests the production candidate ranking.
 r.matVP=[1,0,0,0,0,1,0,0,0,0,-1,-1,0,-12,0,0];
 for(let frame=0;frame<16;frame++){
  M.beginFrame(g,r);for(let i=0;i<900;i++)M.queue(g,r,'tree',[(i%15-7)*.08,10,3+i*.015],[1,1,1]);for(let i=0;i<M.profiles[0].flightTotal;i++)M.queue(g,r,'tree',[(i%14-7)*.3,10,-70-i*.1],[1,1,1]);M.populate(g,r);M.draw(g,r);
 }
 const s=M.inspect(g,r);assert.equal(s.count,M.profiles[0].flightTotal);assert.ok(s.plants.every(p=>p.groundRoot[2]<0),'A budget filled with nearer hidden trees would recreate the sparse visible forest');assert.equal(s.obstacles.length,0);
});

test('optional aerial crown uploads retain complete alpha sources within the existing shared texture budget',async()=>{
 for(const touch of [false,true]){
  const {M,r,allocations}=fixture({floor:true,crown:true});let current=true;const s=await M.load(r,{touch,current:()=>current});assert.equal(s.expectedSources,8);assert.equal(s.readySources,8);assert.equal(s.records.length,6);assert.equal(s.crown.status,'ready');assert.equal(s.crown.ready,true);assert.equal(s.crown.width,touch?256:384);assert.equal(s.crown.height,s.crown.width);assert.equal(s.crown.sourceWidth,1254);assert.equal(s.crown.sourceHeight,1254);assert.ok(s.bytes<=s.budget);assert.equal(allocations(),8);assert.deepEqual(Array.from(s.failures),[]);
  assert.ok(r.gl.parameters.some(v=>v.texture==='jungle_crown'&&v.p===r.gl.TEXTURE_MIN_FILTER&&v.value===r.gl.LINEAR_MIPMAP_LINEAR));s.crown.bounds[0]=999;assert.notEqual(M.inspect(null,r).crown.bounds[0],999,'Public crown measurements cannot change the renderer registration');current=false;assert.equal(M.inspect(null,r).crown.ready,false);current=true;r.gl.isContextLost=()=>true;assert.equal(M.inspect(null,r).crown.ready,false);r.gl.isContextLost=()=>false;M.dispose(r);assert.equal(allocations(),0);
 }
 const {M,g,r,allocations}=fixture({floor:true,crown:true,fail:'canopy-crown.webp'}),failed=await M.load(r);assert.equal(failed.expectedSources,8);assert.equal(failed.readySources,7);assert.equal(failed.records.length,6);assert.equal(failed.crown.status,'error');assert.equal(failed.crown.ready,false);assert.ok(failed.failures.some(f=>f.kind==='crown'));assert.equal(allocations(),7);M.configure({terrainH:()=>10,jungle:()=>false});delete g.evade;g.phase='flight';g.ac={p:[0,120,0]};M.beginFrame(g,r);assert.equal(M.queue(g,r,'tree',[3,10,3],[1,1,1]),true);M.populate(g,r);M.draw(g,r);assert.equal(M.inspect(g,r).plants.length,1,'A failed optional crown keeps complete upright tree photographs available');assert.equal(M.inspect(g,r).crowns.length,0);
});

test('aerial crowns remain horizontal at existing canopy height and share the total photographic submission cap',async()=>{
 for(const quality of [0,1,2]){
  const {M,g,r,window}=fixture({crown:true});r.quality=quality;M.configure({terrainH:()=>10,jungle:()=>false});await M.load(r);delete g.evade;g.phase='flight';g.ac={p:[0,120,0]};r.eye=[0,120,0];let surfaces=[];window.WildlifeRender={drawSurfaces(game,renderer,items){surfaces=items;return items.length;}};
  const profile=M.profiles[quality];for(let frame=0;frame<18;frame++){M.beginFrame(g,r);for(let i=0;i<400;i++)M.queue(g,r,'tree',[(i%20-10)*4,10,(Math.floor(i/20)+1)*4],[1,1,1]);M.populate(g,r);M.draw(g,r);const s=M.inspect(g,r);assert.ok(s.count+s.crowns.length<=profile.flightTotal);assert.ok(s.crowns.length<=profile.crowns);assert.ok(s.terrainSamples<=M.limits.queueSamples);}
  const s=M.inspect(g,r);assert.equal(s.crowns.length,profile.crowns);assert.ok(s.count>0);assert.equal(surfaces.length,s.crowns.length);assert.equal(s.obstacles.length,0);
  for(const crown of surfaces){const plant=s.plants.find(p=>crown.id==='crown:'+p.id),record=s.records.find(v=>v.kind==='canopy');assert.ok(plant);assert.equal(crown.record.kind,'crown');near(crown.p[0],plant.groundRoot[0]);near(crown.p[2],plant.groundRoot[2]);near(crown.p[1],plant.groundRoot[1]+plant.h*record.bodyFraction*.8);near(crown.floorAt(-1000,300),crown.p[1]);near(crown.floorAt(1000,-300),crown.p[1]);assert.ok(crown.length>0&&crown.width>0);}
  g.evade={p:[0,10,0]};g.phase='evade';M.beginFrame(g,r);M.queue(g,r,'tree',[4,10,5],[1,1,1]);M.populate(g,r);M.draw(g,r);assert.equal(M.inspect(g,r).crowns.length,0,'Walking scenes use rooted upright photographs');
 }
});

test('aerial crown manifest and lossless derivative preserve the complete generated source and recorded provenance',()=>{
 const crypto=require('node:crypto'),dir=path.join(__dirname,'../assets/jungle'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),proof=JSON.parse(fs.readFileSync(path.join(dir,'crown-provenance.json'))),png=fs.readFileSync(path.join(dir,'canopy-crown.png')),webp=fs.readFileSync(path.join(dir,'canopy-crown.webp')),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(manifest.crown.file,'canopy-crown.webp');assert.equal(manifest.crown.width,1254);assert.equal(manifest.crown.height,1254);assert.equal(manifest.crown.gpuHigh,384);assert.equal(manifest.crown.gpuTouch,256);assert.equal(png.readUInt32BE(16),1254);assert.equal(png.readUInt32BE(20),1254);assert.equal(sha(png),'f49d30de011f22760fad965fdbeade7c8b1ace21bbfc5ada243d339c349df85e');assert.equal(sha(png),proof.sourceSHA256);assert.equal(sha(webp),proof.runtimeSHA256);assert.equal(png.length,proof.sourceBytes);assert.equal(webp.length,proof.runtimeBytes);assert.equal(proof.sourceByteIdenticalToGenerated,true);assert.equal(proof.allDecodedRGBAIdentical,true);assert.ok(proof.transparentPixels>1254*1254*.2);assert.ok(proof.softPixels>0);assert.ok(proof.bounds[0]>0&&proof.bounds[1]>0&&proof.bounds[2]<1254&&proof.bounds[3]<1254);assert.equal(webp.toString('ascii',0,4),'RIFF');assert.equal(webp.toString('ascii',8,12),'WEBP');assert.equal(webp.toString('ascii',12,16),'VP8L');
});

test('actual floor manifest and lossless encoding retain the unchanged generated source and recorded provenance',()=>{
 const crypto=require('node:crypto'),dir=path.join(__dirname,'../assets/jungle'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),proof=JSON.parse(fs.readFileSync(path.join(dir,'floor-provenance.json'))),png=fs.readFileSync(path.join(dir,'forest-floor.png')),webp=fs.readFileSync(path.join(dir,'forest-floor.webp')),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(Object.keys(manifest.plants).length,6);assert.equal(manifest.floor.file,'forest-floor.webp');assert.equal(manifest.floor.worldSize,3);assert.equal(manifest.floor.gpuHigh,512);assert.equal(manifest.floor.gpuTouch,384);assert.equal(manifest.floor.width,png.readUInt32BE(16));assert.equal(manifest.floor.height,png.readUInt32BE(20));assert.equal(manifest.floor.width,1254);
 assert.equal(sha(png),'48b60e0d211034c7f78d1882e79fd06d0609336867ec9de4fc4a4e0e85639604');assert.equal(sha(png),proof.sourceSHA256);assert.equal(proof.sourceSHA256,proof.rawSHA256);assert.equal(sha(webp),proof.runtimeSHA256);assert.equal(proof.rawSourceByteIdentical,true);assert.equal(proof.allDecodedRGBAIdentical,true);assert.equal(proof.fullyOpaque,true);assert.equal(png.length,proof.sourceBytes);assert.equal(webp.length,proof.runtimeBytes);
 assert.equal(webp.toString('ascii',0,4),'RIFF');assert.equal(webp.toString('ascii',8,12),'WEBP');assert.equal(webp.toString('ascii',12,16),'VP8L','The shipped floor is a lossless WebP stream, not a lossy replacement');
});


test('close thickets add rooted broadleaf midstory within unchanged GPU, source and sample budgets',async()=>{
 for(const q of [0,1,2]){
  const {M,g,r,allocations}=fixture();r.quality=q;const terrain=(x,z)=>10+x*.03-z*.02;M.configure({terrainH:terrain,jungle:()=>true});await M.load(r);const saved=JSON.stringify(g),profile=M.profiles[q];
  for(let frame=0;frame<72;frame++){
   M.beginFrame(g,r);for(let i=0;i<90;i++)M.queue(g,r,'tree',[(i%10-5)*7,10,-8-Math.floor(i/10)*8],[1,1,1]);M.populate(g,r,{solid:()=>false});M.draw(g,r);
   const info=M.inspect(g,r);assert.ok(info.count<=profile.total);assert.ok(info.terrainSamples<=72&&info.solidChecks<=36);assert.ok(info.thicketUpdates<=1&&info.thicketCache<=128);
  }
  const info=M.inspect(g,r),rows=info.plants.filter(p=>p.id.startsWith('thicket:'));assert.equal(rows.length,profile.thicket);assert.ok(rows.some(p=>p.kind==='nipa')&&rows.some(p=>p.kind==='fern'));
  for(const p of rows){near(p.groundRoot[1],terrain(p.groundRoot[0],p.groundRoot[2]));assert.ok(Math.hypot(p.groundRoot[0]-g.evade.p[0],p.groundRoot[2]-g.evade.p[2])<profile.thicketRange);assert.ok(!info.obstacles.some(o=>o.id===p.id),'soft thickets never become invisible trunk colliders');}
  assert.equal(info.readySources,6);assert.equal(allocations(),6);assert.equal(JSON.stringify(g),saved,'visual density must not edit actors, AI, objectives or save state');
 }
});

test('thickets respect water, solid structures and the cultivated-land boundary',async()=>{
 for(const fixtureOptions of [{terrain:()=>0,forest:true,solid:false},{terrain:()=>10,forest:false,solid:false},{terrain:()=>10,forest:true,solid:true}]){
  const {M,g,r}=fixture();M.configure({terrainH:fixtureOptions.terrain,jungle:()=>fixtureOptions.forest});await M.load(r);for(let i=0;i<36;i++){M.beginFrame(g,r);M.populate(g,r,{solid:()=>fixtureOptions.solid});M.draw(g,r);}
  assert.equal(M.inspect(g,r).nearThickets,0);
 }
});

test('authored nipa and fern bank layers use whole photographs without forest generation or collision',async()=>{
 const {M,g,r}=fixture();M.configure({terrainH:()=>0,jungle:()=>false});await M.load(r);g.pow={stage:'river',river:{waterY:20}};g.evade.p=[0,19.58,0];r.eye=[0,20.3,0];const saved=JSON.stringify(g);
 M.beginFrame(g,r);assert.equal(M.queue(g,r,'nipa',[17,20.35,6],[.7,.6,.7]),true);assert.equal(M.queue(g,r,'fern',[-19,20.35,-4],[.7,1.3,.7]),true);M.populate(g,r,{solid:()=>{throw Error('Authored bank layers must remain visual');}});M.draw(g,r);
 const info=M.inspect(g,r);assert.equal(info.count,2);assert.equal(info.eligible,false);assert.equal(info.nearThickets,0);assert.deepEqual(Array.from(info.obstacles),[]);assert.equal(info.terrainSamples,0);assert.equal(JSON.stringify(g),saved);
 assert.ok(info.plants.some(p=>p.kind==='nipa')&&info.plants.some(p=>p.kind==='fern'));for(const plant of info.plants){const record=info.records.find(p=>p.kind===plant.kind);near(plant.p[1]+plant.h*(1-record.baseline),20.35);}
});


test('river canopy structures retain leaf detail before lower bamboo can exhaust the fixed branch budget',async()=>{
 const {M,g,r}=fixture({components:true});r.quality=1;M.configure({terrainH:()=>0,jungle:()=>false});await M.load(r);g.pow={stage:'river',river:{waterY:10}};g.evade.p=[0,9.58,0];r.eye=[0,10.3,0];const saved=JSON.stringify(g);
 M.beginFrame(g,r);for(let i=0;i<48;i++)M.queue(g,r,'bamboo',[18+(i%4),10.35,-24+Math.floor(i/4)*4],[1,.55,1]);for(let i=0;i<24;i++)M.queue(g,r,'tree',[28+(i%2)*12,10.35,-35+Math.floor(i/2)*6],[1,1.1,1]);M.populate(g,r);M.draw(g,r);
 const info=M.inspect(g,r),trees=info.structural.filter(t=>t.kind==='tree');assert.ok(trees.length>=8,'The visible bank forest must get real fork/leaf geometry, not just left-over source cards');assert.ok(trees.every(t=>t.height>10&&t.branches>10&&t.material==='photographic-components'));assert.ok(info.primitiveCounts.plannedLeafCards<=M.profiles[1].leafCards&&info.structural.length<=M.profiles[1].structuralTrees);assert.ok(info.count<=M.profiles[1].total);assert.equal(info.primitiveCounts.roundCrownSurfaces,0);assert.deepEqual(Array.from(info.obstacles),[]);assert.equal(JSON.stringify(g),saved);
});

test('rear river canopy aliases submit complete existing photographs while near trees retain branches',async()=>{
 for(const quality of [0,1,2]){
  const {M,g,r,allocations}=fixture({components:true});r.quality=quality;M.configure({terrainH:()=>0,jungle:()=>false});await M.load(r);g.pow={stage:'river',river:{waterY:10}};g.evade.p=[0,9.58,0];r.eye=[0,10.3,0];const saved=JSON.stringify(g),textures=allocations();
  M.beginFrame(g,r);assert.equal(M.queue(g,r,'tree',[28,10.35,0],[1,1.1,1]),true);assert.equal(M.queue(g,r,'river-canopy-photo',[40,10.35,10],[1,1.1,1]),true);M.populate(g,r);M.draw(g,r);
  const info=M.inspect(g,r),rear=info.plants.find(p=>p.id==='river-canopy-photo:40.000:10.000'),front=info.structural.find(p=>p.id==='tree:28.000:0.000');assert.ok(rear&&front);assert.equal(rear.kind,'canopy');assert.ok(!info.structural.some(p=>p.id===rear.id),'Rear canopy must not be replaced by sparse component leaves');
  const submitted=r.draws.flatMap(batch=>batch.list.map(sprite=>({sprite,texture:batch.name}))).find(row=>row.sprite.id===rear.id);assert.ok(submitted,'The complete rear photograph reaches the real sprite submission adapter');assert.equal(submitted.texture,'jungle_canopy');assert.equal(submitted.sprite.cols,1);assert.equal(submitted.sprite.rows,1);assert.deepEqual(Array.from(rear.groundRoot),[40,10.35,10]);
  const record=info.records.find(v=>v.kind==='canopy');near(rear.w/rear.h,record.width/record.height);assert.equal(info.count,2);assert.equal(info.primitiveCounts.photoCards,1);assert.equal(allocations(),textures);assert.ok(info.structural.length<=M.profiles[quality].structuralTrees&&info.primitiveCounts.plannedLeafCards<=M.profiles[quality].leafCards);assert.deepEqual(Array.from(info.obstacles),[]);assert.equal(JSON.stringify(g),saved);
 }
});
