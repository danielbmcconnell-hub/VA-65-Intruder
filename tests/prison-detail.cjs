'use strict';
// Actual production geometry/collision code; CPU checks do not claim GPU proof.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),clone=x=>JSON.parse(JSON.stringify(x));
function actualBuilder(){
 const s=fs.readFileSync(path.join(root,'index.html'),'utf8'),a=s.indexOf('class MB {'),b=s.indexOf('/* ============================ Renderer',a);
 assert.ok(a>=0&&b>a);const c={TAU:Math.PI*2,vsub:(a,b)=>a.map((n,i)=>n-b[i]),vnorm:a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n);},vcross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]};
 vm.runInNewContext(s.slice(a,b)+'\nglobalThis.Builder=MB;',c);return c.Builder;
}
const MB=actualBuilder(),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/prison/manifest.json')));
function environment(options={}){
 let loaded=0;const requests=[],draws=[],uploads=[],deleted=[],uniforms=[],bound=[],params=[];
 const gl={TEXTURE_2D:3553,TEXTURE0:33984,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,REPEAT:10497,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,LINEAR_MIPMAP_LINEAR:9987,LINEAR:9729,NO_ERROR:0,
  isContextLost:()=>!!options.lost,bindTexture:(...a)=>bound.push(a),texParameteri:(...a)=>params.push(a),generateMipmap:()=>{},getExtension:()=>null,getError:()=>options.glError||0,deleteTexture:t=>deleted.push(t),activeTexture:(...a)=>bound.push(a),uniform1f:(...a)=>uniforms.push(a),uniform3fv:(...a)=>uniforms.push(a),uniform4fv:(...a)=>uniforms.push(a),uniform1i:(...a)=>uniforms.push(a)};
 const renderer={gl,meshes:{},textures:{wear:{tex:{fallback:true}}},meshFromBuilder(n,b){this.meshes[n]=b;},texFromCanvas(n,c){uploads.push({name:n,width:c.width,height:c.height});const T={tex:{id:++loaded}};this.textures[n]=T;return T;}};
 class Image{constructor(){this.naturalWidth=1774;this.naturalHeight=887;}set src(value){this._src=value;if(value)Promise.resolve().then(()=>this.onload?.());}}
 const document={body:{classList:{toggle(){}}},getElementById:()=>null,createElement(name){assert.equal(name,'canvas');return {width:0,height:0,getContext(){const cv=this;return {drawImage:(...a)=>draws.push(a.slice(1)),getImageData(){const data=new Uint8ClampedArray(cv.width*cv.height*4).fill(255);if(options.transparent)data[3]=0;return {data};}};}};}};
 const window={document,Image,fetch:async url=>{requests.push(url);if(options.wait)await options.wait;return {ok:!options.httpError,status:options.httpError||200,json:async()=>options.manifest||manifest};},matchMedia:()=>({matches:!!options.touch})};
 const sandbox=vm.createContext({window,document,console});
 for(const file of ['core.js','captivity.js','regular-confinement.js','prison-detail.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets/pow',file),'utf8'),sandbox);
 const P=window.POW,D=window.PrisonDetail;P.mountUI=P.updateUI=P.activate=()=>{};P.save=()=>{};P.ctx={terrainH:()=>4,Store:{get:(k,d)=>d,set(){}}};
 const game={ac:{p:[120,5,280]},app:{keys:{},gctl:{},set:{quality:2,sound:0}},world:{_cells:new Map()},rend:renderer,setHour(){}};game.app.game=game;game.app.rend=renderer;
 P.begin(game,'cell');D.configure({POW:P,MB,terrainH:options.terrain||(()=>game.evade.p[1])});
 return {window,P,D,game,renderer,gl,requests,draws,uploads,deleted,uniforms,bound,params,sandbox};
}
function ray(m,x,y){return ray3(m,[x,y,-2],[0,0,1]);}
function ray3(m,o,d,cull=false){
 const sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);let nearest=Infinity;
 for(let i=0;i<m.i.length;i+=3){const [a,b,c]=m.i.slice(i,i+3).map(k=>m.p.slice(k*3,k*3+3)),e=sub(b,a),f=sub(c,a),p=cross(d,f),det=dot(e,p);if(cull?det<1e-9:Math.abs(det)<1e-9)continue;const t=sub(o,a),u=dot(t,p)/det;if(u<0||u>1)continue;const q=cross(t,e),v=dot(d,q)/det;if(v<0||u+v>1)continue;const n=dot(f,q)/det;if(n>0)nearest=Math.min(nearest,n);}
 return Number.isFinite(nearest)?nearest:null;
}
test('photographic presentation preserves actual layout, colliders, interaction anchors and closed/open door traversal',()=>{
 const {P,D,game:g}=environment(),before=clone({geo:g.campGeo,solids:g.pow.solids,objects:g.pow.objects}),actor=g.evade;
 const b=g.pow.base;assert.equal(P.blocked(g,b[0],b[2]-3.6),true);
 const rendered=g.campGeo.map(q=>D.decorate(g,q)).filter(Boolean);assert.equal(rendered.find(q=>q.id==='cell-door').m,'prisonDoorEscape');assert.equal(rendered.some(q=>q.id==='door-hatch'||q.id.startsWith('door-bars:')),false);
 assert.ok(rendered.find(q=>q.id==='door-bolt'));assert.ok(rendered.find(q=>q.id==='fitting'));D.instances(g,()=>{});D.prepare(g);
 assert.deepEqual(clone({geo:g.campGeo,solids:g.pow.solids,objects:g.pow.objects}),before);assert.equal(g.evade,actor);
 actor.p=[b[0],b[1],b[2]-2.8];P.move(g,actor,0,-3);assert.ok(actor.p[2]>b[2]-3.2);
 g.pow.objects.find(o=>o.id==='bunk-bracket').action(g);g.pow.objects.find(o=>o.id==='door-fitting').action(g);
 assert.equal(g.pow.flags.doorOpen,true);assert.equal(P.blocked(g,b[0],b[2]-3.6),false);const open=g.campGeo.find(q=>q.id==='door-open'),visual=D.decorate(g,open);
 assert.equal(visual.m,'prisonDoorEscape');assert.deepEqual(clone(visual.p),clone(open.p));assert.deepEqual(clone(visual.scale),[open.scale[2],open.scale[1],open.scale[0]]);assert.equal(visual.y,-Math.PI/2);
 P.move(g,actor,0,-2);assert.ok(actor.p[2]<b[2]-4.4);
});
test('the photograph-based escape chamber has twin real slab collisions, a narrow free aisle and an uninterrupted original corridor/stair route',()=>{
 const {P,D,game:g}=environment(),b=g.pow.base,box=id=>g.campGeo.find(q=>q.id===id),e=g.evade;
 const west=box('cell-west'),east=box('cell-east'),rear=box('cell-back');assert.ok(Math.abs((east.p[0]-east.scale[0]/2)-(west.p[0]+west.scale[0]/2)-2.4)<1e-8);assert.ok(Math.abs((rear.p[2]-rear.scale[2]/2)-(box('cell-door').p[2]+box('cell-door').scale[2]/2)-4.205)<1e-8);
 for(const name of ['bunk','bunk-right']){const q=box(name);assert.equal(P.blocked(g,q.p[0],q.p[2],.32,b[1]),true);assert.equal(D.decorate(g,q).m,'prisonCellBunk');assert.ok(Math.abs(q.scale[1]-.47)<1e-8);}assert.equal(P.blocked(g,b[0],b[2]+.28,.32,b[1]),false);assert.deepEqual(Array.from(e.p),[b[0],b[1],b[2]+.28]);assert.equal(e.look,-.18);
 P.move(g,e,0,-1.08);assert.ok(Math.abs(e.p[2]-b[2]+.8)<1e-8);const anchor=g.pow.objects.find(q=>q.id==='bunk-bracket');assert.ok(Math.hypot(anchor.p[0]-e.p[0],anchor.p[2]-e.p[2])<anchor.radius);anchor.action(g);
 P.move(g,e,0,-2.2);assert.ok(Math.abs(e.p[2]-b[2]+3)<1e-8);const fitting=g.pow.objects.find(q=>q.id==='door-fitting');assert.ok(Math.hypot(fitting.p[0]-e.p[0],fitting.p[2]-e.p[2])<fitting.radius);fitting.action(g);
 P.move(g,e,0,-2.6);assert.ok(Math.abs(e.p[2]-b[2]+5.6)<1e-8);P.move(g,e,14,0);assert.ok(Math.abs(e.p[0]-b[0]-14)<1e-8);P.move(g,e,0,-16.8);assert.ok(e.p[1]>b[1]+3.3,'existing staircase still raises actual feet onto the roof');assert.ok(Math.abs(e.p[2]-b[2]+22.4)<1e-8);
});
test('the actual arched transom is open geometry and both triangular vents have depth behind their wall faces',()=>{
 const {D,game:g,renderer:r}=environment();D.prepare(g);assert.equal(ray(r.meshes.prisonCellArch,.10,-.25),null);assert.ok(ray(r.meshes.prisonCellArch,.10,.45)!==null);const flap=ray(r.meshes.prisonDoorEscape,.03,.2/2.44);assert.ok(flap>2.5,'photo-matched hinged flap sits over the actual body opening');assert.ok(ray(r.meshes.prisonDoorEscape,.03,0)<1.6,'adjacent uninterrupted steel remains full depth');
 const cy=.35/3.1,hy=.11/3.1,cz=(-2.05+1.375)/4.45,hz=.20/4.45,y=(cy+hy+cy+hy+cy-hy)/3,z=(cz-hz+cz+hz+cz+hz)/3;
 for(const [name,side]of [['prisonCellLeftWall',1],['prisonCellRightWall',-1]]){const m=r.meshes[name],opening=ray3(m,[side*2,y,z],[-side,0,0]),wall=ray3(m,[side*2,y,z+.15],[-side,0,0]);assert.ok(opening>wall+.20,name+' actual recessed triangle');}
 const pieces=[];D.instances(g,(...q)=>pieces.push(q));assert.equal(pieces.filter(q=>q[0]==='prisonCellSteel'&&q[3][0]===.018).length,5,'five real bars terminate under the arch');
});
test('old wide-cell checkpoints migrate only invalid positions to the safe aisle and retain earned inventory, day and door state',()=>{
 for(const [x,z,open]of [[-2.5,3.4,false],[2.5,.5,false],[-.85,-.8,false],[2.5,3.4,true]]){
  const {P,game:g}=environment(),b=g.pow.base.slice(),saved={version:2,stage:'cell',base:b,p:[b[0]+x,b[1],b[2]+z],day:72,time:123,inventory:{letter:true},flags:{doorOpen:open,wallContact:true},stats:clone(g.pow.stats),hdg:.4,look:.1};P.begin(g,'cell',saved);assert.deepEqual(Array.from(g.evade.p),[b[0],b[1],b[2]+.28]);assert.equal(P.blocked(g,...[g.evade.p[0],g.evade.p[2],.32,g.evade.p[1]]),false);assert.equal(g.pow.day,72);assert.equal(g.pow.time,123);assert.equal(g.pow.inventory.letter,true);assert.equal(!!g.pow.inventory.bracket,false);assert.equal(!!g.pow.inventory.rope,false);assert.equal(g.pow.flags.doorOpen,open);assert.equal(!!g.pow.flags.outside,false);assert.equal(g.pow.flags.wallContact,true);
 }
 for(const [x,z,open]of [[0,-.8,false],[6,-5.6,true]]){const {P,game:g}=environment(),b=g.pow.base.slice(),p=[b[0]+x,b[1],b[2]+z];P.begin(g,'cell',{version:2,stage:'cell',base:b,p,day:20,inventory:{bracket:true},flags:{doorOpen:open},stats:clone(g.pow.stats)});assert.deepEqual(Array.from(g.evade.p),p);assert.equal(g.pow.inventory.bracket,true);assert.equal(g.pow.flags.doorOpen,open);}
});
test('the original bounded guard pathfinder and swept body movement fit the new open door and central aisle',()=>{
 const f=environment(),{P,game:g}=f;vm.runInContext(fs.readFileSync(path.join(root,'assets/pow/ai.js'),'utf8'),f.sandbox);const b=g.pow.base;g.pow.objects.find(q=>q.id==='bunk-bracket').action(g);g.pow.objects.find(q=>q.id==='door-fitting').action(g);
 const guard=P.AI.makeActor({id:'new-cell-navigation',kind:'nva',p:[b[0],b[1],b[2]-5.5],armed:true}),routePoints=P.AI.planPath(g,guard,[b[0],b[1],b[2]-1]);assert.ok(routePoints.length>=4&&guard.planExpansions<=P.AI.limits.expansionsPerPath);
 for(const p of routePoints){assert.equal(P.blocked(g,p[0],p[2],.34,p[1]),false);P.move(g,guard,p[0]-guard.p[0],p[2]-guard.p[2],.30);}assert.ok(Math.hypot(guard.p[0]-b[0],guard.p[2]-b[2]+1)<.02,'a genuine guard capsule reaches the inner aisle');
});
test('real triangulated door apertures admit rays between bars and block rays on the sheet and bars',()=>{
 const {D,game:g,renderer:r}=environment();D.prepare(g);
 for(const [name,x,y]of [['prisonDoorCell',0,.286],['prisonDoorRegular',.282,.227],['prisonDoorNarrow',0,.286]]){
  const m=r.meshes[name];assert.ok(m.i.length>800,name);assert.equal(ray(m,x+.028,y),null,name+' actual open slot');assert.ok(ray(m,x,y)!==null,name+' center bar');assert.ok(ray(m,0,-.1)!==null,name+' sheet');
  for(const n of m.p)assert.ok(Number.isFinite(n));for(const i of m.i)assert.ok(i>=0&&i<m.p.length/3);
 }
});
test('both vent shafts remain opaque under actual backface culling from the oblique native camera',()=>{
 const {D,game:g,renderer:r}=environment();D.prepare(g);const cy=.35/3.1,hy=.11/3.1,cz=(-2.05+1.375)/4.45,hz=.20/4.45,P=[[cy+hy,cz-hz],[cy+hy,cz+hz],[cy-hy,cz+hz]];
 for(const [name,side]of [['prisonCellLeftWall',1],['prisonCellRightWall',-1]])for(const [u,v]of [[.1,.1],[.6,.1],[.2,.5],[.4,.4]]){
  const o=[side*4.25,.13/3.1,(.28+1.375)/4.45],target=[side*.5,P[0][0]+u*(P[1][0]-P[0][0])+v*(P[2][0]-P[0][0]),P[0][1]+u*(P[1][1]-P[0][1])+v*(P[2][1]-P[0][1])],hit=ray3(r.meshes[name],o,target.map((x,i)=>x-o[i]),true);assert.ok(hit!==null&&hit>=1-1e-8,name+' cannot leak blue sky through a culled recess side');
 }
});
test('regular-prefixed geometry receives its correct offset slot and preserves side-normal workshop door footprint',()=>{
 const {P,D,game:g}=environment();g.pow.stage='regular';g.pow.regular=P.RegularConfinement.initial();P.RegularConfinement.build(g);
 const before=clone({geo:g.campGeo,solids:g.pow.solids,objects:g.pow.objects}),by=id=>g.campGeo.find(q=>q.id==='regular:'+id);
 assert.equal(D.decorate(g,by('cell-door')).m,'prisonDoorRegular');assert.equal(D.decorate(g,by('door-slot')),null);assert.equal(D.decorate(g,by('slotbar:0')),null);
 const d=by('workshop-door'),v=D.decorate(g,d);assert.equal(v.m,'prisonDoorCell');assert.equal(v.y,Math.PI/2);assert.deepEqual(clone(v.scale),[d.scale[2],d.scale[1],d.scale[0]]);
 assert.equal(D.decorate(g,by('service-hatch')).m,'prisonSteel');assert.equal(D.decorate(g,by('bed')).m,'prisonBunk');assert.deepEqual(clone({geo:g.campGeo,solids:g.pow.solids,objects:g.pow.objects}),before);
});
test('the new cell maps one full steel photograph over both closed and opened door leaves without a repeating horizontal seam',()=>{
 const f=environment(),{D,P,game:g,renderer:r}=f,p={u:{uPrisonKind:'kind',uPrisonBase:'base',uPrisonTexOn:'ready',uPrisonDoorMap:'map',uPrisonDoorUV:'uv'}};D.prepare(g);D.bind(r,p,'prisonDoorEscape');assert.equal(f.uniforms.filter(q=>q[0]==='map').at(-1)[1],1);let uv=f.uniforms.filter(q=>q[0]==='uv').at(-1)[1];assert.ok(Math.abs(uv[0]+.46)<1e-8);assert.ok(Math.abs(uv[1])<1e-8);assert.ok(Math.abs(uv[2]-1/.92)<1e-8);assert.ok(Math.abs(uv[3]-1/2.44)<1e-8);
 g.pow.objects.find(q=>q.id==='bunk-bracket').action(g);g.pow.objects.find(q=>q.id==='door-fitting').action(g);D.bind(r,p,'prisonDoorEscape');uv=f.uniforms.filter(q=>q[0]==='uv').at(-1)[1];assert.ok(Math.abs(uv[0]+4.52)<1e-8);assert.ok(Math.abs(uv[2]-1/.92)<1e-8);D.bind(r,p,'prisonDoorNarrow');assert.equal(f.uniforms.filter(q=>q[0]==='map').at(-1)[1],0);
});
test('material ownership excludes aircraft, people, photos, roofs and river; fallback samplers stay complete',()=>{
 const f=environment(),{D,game:g,renderer:r}=f;D.prepare(g);
 for(const n of ['intruder','carrier','people','photo_aviator','powWater','__proto__','constructor',null])assert.equal(D.kind(n),0);
 const p={u:Object.fromEntries(['uPrisonKind','uPrisonBase','uPrisonTexOn','uPrisonPlaster','uPrisonSteel'].map(n=>[n,n]))};D.bind(r,p,'prisonWall');assert.ok(f.uniforms.some(x=>x[0]==='uPrisonKind'&&x[1]===1));assert.equal(f.bound.filter(x=>x[1]===r.textures.wear.tex).length,2);
 D.bind(r,p,'intruder');assert.equal(f.uniforms.filter(x=>x[0]==='uPrisonKind').at(-1)[1],0);g.pow.stage='river';const item={id:'river-wall',m:'powStone',scale:[1,3,1]};assert.equal(D.decorate(g,item),item);assert.equal(D.prepare(g),false);
 assert.match(D.glsl,/pow\(texture\(uPrisonSteel/);assert.match(D.glsl,/pow\(texture\(uPrisonPlaster/);assert.doesNotMatch(D.glsl,/discard|gl_Position|Math\.random/);
});
test('continuous photographic plaster omits only the old flat cell wear and damp render overlays',()=>{
 const {D,game:g}=environment(),before=clone({geo:g.campGeo,solids:g.pow.solids,objects:g.pow.objects});
 for(const id of ['episode-scene:cell-wear--1-0','episode-scene:cell-damp-band-1','episode-scene:cell-rear-damp']){const q={id,m:'powStone',p:[0,.8,0],scale:[.016,.3,.6],t:[1.2,1.2,1,0]},saved=clone(q);assert.equal(D.decorate(g,q),null);assert.deepEqual(q,saved);}
 for(const id of ['episode-scene:street-foundation-0','episode-scene:cell-roof-timber-0','door-bolt','fitting']){const q={id,m:'powStone',p:[0,.8,0],scale:[.016,.3,.6]};assert.equal(D.decorate(g,q),q);}
 g.pow.stage='hanoi';const q={id:'episode-scene:cell-wear--1-0',m:'powStone',scale:[.016,.3,.6]};assert.equal(D.decorate(g,q),q);assert.deepEqual(clone({geo:g.campGeo,solids:g.pow.solids,objects:g.pow.objects}),before);
});
test('a renderer reused by a new aircraft Game releases the prior POW owner and resets prison material state',()=>{
 const f=environment(),{D,game:g,renderer:r}=f,p={u:Object.fromEntries(['uPrisonKind','uPrisonBase','uPrisonTexOn','uPrisonPlaster','uPrisonSteel'].map(n=>[n,n]))};D.prepare(g);D.bind(r,p,'prisonWall');assert.equal(f.uniforms.filter(q=>q[0]==='uPrisonKind').at(-1)[1],1);
 const replacement={rend:r,app:g.app};g.app.game=replacement;assert.equal(D.prepare(replacement),false);D.bind(r,p,'prisonWall');assert.equal(f.uniforms.filter(q=>q[0]==='uPrisonKind').at(-1)[1],0);assert.deepEqual(clone(f.uniforms.filter(q=>q[0]==='uPrisonBase').at(-1)[1]),[0,0,0]);
});
test('solitary aperture faces a physical corridor enclosure beyond the existing floor and clear of both guard routes',()=>{
 const {D,P,window,game:g}=environment(),document=window.document;delete window.document;P.begin(g,'solitary');window.document=document;const before=clone({geo:g.campGeo,solids:g.pow.solids,objects:g.pow.objects}),floor=g.campGeo.find(q=>q.id==='corridor-floor'),pushed=[];D.instances(g,(...a)=>pushed.push(a));
 const wall=pushed.find(q=>q[0]==='prisonWall'),roof=pushed.find(q=>q[0]==='prisonBunk');assert.ok(wall&&roof);assert.ok(wall[1][2]+wall[3][2]/2<floor.p[2]-floor.scale[2]/2);
 for(const z of [-2.5,-3.4])assert.ok(g.pow.base[2]+z-.31>wall[1][2]+wall[3][2]/2,'entire guard radius clears the exterior wall');assert.ok(roof[1][1]-roof[3][1]/2>g.pow.base[1]+2.5);assert.deepEqual(clone({geo:g.campGeo,solids:g.pow.solids,objects:g.pow.objects}),before);
 g.pow.stage='regular';const regular=[];D.instances(g,(...a)=>regular.push(a));assert.equal(regular.some(q=>q[0]==='prisonWall'),false);
});
test('temporary holding has bounded real geometry, dry terrain, stable original actor and two independent photo owners',()=>{
 const {D,game:g,renderer:r}=environment(),original=g.evade,p=clone(original.p),solids=clone(g.pow.solids);delete g.pow;g.evade.hdg=.63;
 assert.equal(D.beginHolding(g),true);assert.equal(D.holdingCamera(g),null);D.holding(g,true);const camera=clone(D.holdingCamera(g)),submitted=[];
 const count=D.fieldInstances(g,(...args)=>submitted.push(args));assert.equal(count,submitted.length);assert.ok(count>70&&count<=100);assert.ok(submitted.some(x=>x[0]==='prisonThatch'));assert.ok(submitted.some(x=>x[0]==='prisonDeck'));assert.ok(r.meshes.prisonThatch.i.length>3000);
 const info=D.inspectHolding(g);assert.equal(info.submitted,count);assert.equal(info.meshCounts.prisonThatch,1);assert.equal(info.visualOnly,true);assert.equal(info.originalActorRetained,true);
 const a=D.fieldActors(g),b=D.fieldActors(g);assert.equal(a.length,2);assert.equal(a[0],b[0]);assert.notEqual(a[0],a[1]);assert.ok(a.every(x=>x.photoName==='nva'&&x.kind==='nva'));assert.equal(g.evade,original);assert.deepEqual(clone(original.p),p);assert.ok(solids.length>0);
 for(const guard of a){const dx=guard.p[0]-info.origin[0],dz=guard.p[2]-info.origin[2],localX=dx*Math.cos(info.yaw)+dz*Math.sin(info.yaw),localZ=-dx*Math.sin(info.yaw)+dz*Math.cos(info.yaw);assert.ok(Math.abs(Math.abs(localX)-1.55)<1e-8);assert.ok(Math.abs(localZ+2.05)<1e-8);assert.ok(Math.abs(localX)>1.17,'guard remains outside the compressed cage');}assert.ok(Math.abs(camera.eye[1]-info.origin[1]-1.12)<1e-8);
 g.paused=true;assert.deepEqual(clone(D.holdingCamera(g)),camera);D.holding(g,false);assert.equal(D.fieldInstances(g,()=>{}),0);assert.equal(D.holdingCamera(g),null);assert.deepEqual(clone(D.fieldActors(g)),[]);D.holding(g,true);
 g.evade={p:p.slice()};assert.equal(D.holding(g),null);assert.equal(D.inspectHolding(g),null);
});
test('ocean, sloping footprints and replaced games never stage a floating field cage',()=>{
 for(const terrain of [()=>-14,()=>0,()=>NaN,(x)=>x*.5]){const {D,game:g}=environment({terrain});assert.equal(D.beginHolding(g),false);assert.equal(D.holding(g),null);}
 const {D,game:g}=environment();assert.equal(D.beginHolding(g),true);g.app.game={};assert.equal(D.holding(g),null);
});
test('the real countryside zero-Y sentinel anchors custody scenery to terrain without changing the original actor',()=>{
 const {D,game:g}=environment({terrain:()=>20});delete g.pow;g.evade.p[1]=0;const original=g.evade,p=clone(original.p);assert.equal(D.beginHolding(g),true);D.holding(g,true);const s=D.inspectHolding(g);assert.equal(s.origin[1],20.04);assert.equal(D.holdingCamera(g).eye[1],21.16);assert.equal(g.evade,original);assert.deepEqual(clone(original.p),p);
});
for(const touch of [false,true])test((touch?'Touch':'High')+' isolated opaque material tiles upload exact source regions within the explicit mip budget',async()=>{
 const f=environment({touch}),{D,renderer:r}=f;const promise=D.load(r,{touch});assert.equal(D.load(r,{touch}),promise);const s=await promise,size=touch?384:512;
 assert.equal(s.status,'ready');assert.equal(s.ready,4);assert.ok(s.bytes<=s.budget);assert.equal(f.uploads.length,4);assert.deepEqual(f.uploads.map(x=>[x.width,x.height]),Array.from({length:4},()=>[size,size]));assert.deepEqual(f.draws.map(x=>x.slice(0,4)),[[0,0,887,887],[887,0,887,887],[0,0,887,887],[887,0,887,887]]);assert.ok(s.records.every(x=>x.opaque));assert.ok(f.params.some(x=>x[1]===f.gl.TEXTURE_WRAP_S&&x[2]===f.gl.REPEAT));
 const snapshot=D.inspect(r);snapshot.records[0].region[0]=9000;assert.equal(D.inspect(r).records[0].region[0],0);assert.equal(D.dispose(r),true);assert.equal(f.deleted.length,4);assert.equal(D.inspect(r).status,'idle');assert.equal(r.textures.prison_plaster,undefined);
});
test('load errors roll back every allocation, retain a legible fallback, and never retry or block the game',async()=>{
 for(const options of [{httpError:503},{transparent:true},{glError:1282},{manifest:{...manifest,regions:{...manifest.regions,metal:[1770,0,887,887]}}}]){
  const f=environment(options),s=await f.D.load(f.renderer);assert.equal(s.status,'error');assert.equal(s.ready,0);assert.equal(s.bytes,0);assert.ok(s.failures.length);assert.equal(f.deleted.length,f.uploads.length);assert.equal(f.renderer.textures.prison_plaster,undefined);assert.ok(f.renderer.textures.wear.tex);
  await f.D.load(f.renderer);assert.equal(f.requests.length,1);
 }
});
test('disposing or replacing an in-flight renderer cannot allocate stale textures',async()=>{
 let release;const wait=new Promise(r=>release=r),f=environment({wait}),pending=f.D.load(f.renderer);assert.equal(f.D.dispose(f.renderer),true);release();await pending;assert.equal(f.uploads.length,0);assert.equal(f.D.inspect(f.renderer).status,'idle');
 const g=environment();await g.D.load(g.renderer,{current:()=>false});assert.equal(g.D.inspect(g.renderer).status,'retired');assert.equal(g.uploads.length,0);
});
