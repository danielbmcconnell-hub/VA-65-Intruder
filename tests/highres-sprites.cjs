'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),window={};
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/render/photo-cutouts.js'),'utf8'),{window});
const C=window.PhotoCutouts,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);

test('whole portrait and landscape sources keep their original aspect, visible height and sole line',()=>{
  for(const [width,height,bounds,bodyHeight]of [[1024,1536,[210,45,850,1480],1.76],[1536,1024,[30,180,1500,990],1.42],[1024,1536,[42,150,985,1300],1.25]]){
    const s={photoCutout:true,photoWidth:width,photoHeight:height,photoBounds:bounds,p:[7,12,-9],h:bodyHeight,photoName:'nva'},before=JSON.stringify(s);
    const q=C.anchor(s);
    assert.equal(q.cell,0);assert.equal(q.cols,1);assert.equal(q.rows,1);assert.equal(q.motion,null);
    near(q.w/q.h,width/height);near(q.h*(bounds[3]-bounds[1])/height,bodyHeight);
    near(q.p[1]+q.h*(1-bounds[3]/height),12);assert.equal(q.p[0],7);assert.equal(q.p[2],-9);
    assert.equal(JSON.stringify(s),before,'Measuring/rendering a photograph cannot alter its source descriptor');
  }
});

test('unsupported or empty whole-image descriptors cannot emit a broken render quad',()=>{
  for(const value of [null,{}, {photoCutout:true}, {photoCutout:true,photoWidth:1024,photoHeight:1536,photoBounds:[0,30,800,30],p:[0,0,0],h:1.76}])assert.equal(C.anchor(value),null);
});

test('every base photographic subject has a separate high-resolution PNG instead of a tiny atlas cell',()=>{
  const folder=path.join(root,'assets/sprites/hires'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
  assert.equal(manifest.version,1);
  for(const name of ['farmer','militia','female_vc','nva','aviator','cow']){
    const subject=manifest.subjects[name];assert.ok(subject&&subject.poses&&subject.poses.idle,name);
    for(const [pose,value]of Object.entries(subject.poses)){
      const file=typeof value==='string'?value:value.file;
      // The optional suspended-harness pose has an exact lossless WebP runtime
      // plus unchanged PNG source; the base portraits remain original PNGs.
      const sourceFile=pose==='harness'?(assert.equal(name,'aviator'),assert.equal(file,'aviator-harness.webp'),file.replace(/\.webp$/,'.png')):file;
      const bytes=fs.readFileSync(path.join(folder,sourceFile));
      assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
      const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
      assert.ok(Math.min(width,height)>=768 && Math.max(width,height)>=1024,name+':'+pose+' '+width+'x'+height);
      assert.ok(bytes.length>100000,'A complete photographic source must retain image detail: '+file);
    }
  }
  for(const name of ['nva','militia','female_vc'])assert.ok(manifest.subjects[name].poses.aim,'Complete aimed photograph missing for '+name);
});

// Delayed-image/cache adapter: these tests exercise real descriptor selection
// and eviction. They do not stand in for the browser's photograph/GPU audit.
async function delayedMotion(touch=false,delayed=['nva-walk-c.webp']){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/sprites/hires/manifest.json'))),pending=new Map();
  const gl={NO_ERROR:0,TEXTURE_2D:3553,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,LINEAR_MIPMAP_LINEAR:9987,LINEAR:9729,
    isContextLost:()=>false,isTexture:t=>!!t?.alive,bindTexture(){},generateMipmap(){},texParameteri(){},getExtension:()=>null,getError:()=>0,deleteTexture(t){t.alive=false;}};
  const renderer={gl,textures:{},eye:[0,1,0],texFromCanvas(name,canvas){return this.textures[name]={tex:{alive:true},w:canvas.width,h:canvas.height};}};
  const document={getElementById:()=>null,createElement(){const c={width:1,height:1,getContext(){return {drawImage(){},getImageData(){const data=new Uint8ClampedArray(c.width*c.height*4),i=(Math.floor(c.height/2)*c.width+Math.floor(c.width/2))*4;data[i+3]=255;return {data};}};}};return c;}};
  const w={document,performance:{now:()=>0},fetch:async()=>({ok:true,json:async()=>manifest}),Image:class{
    set src(url){this.url=url;if(!url)return;const plate=/-(?:swim|walk|run)-/.test(url);this.naturalWidth=plate?1024:128;this.naturalHeight=plate?1536:128;
      if(delayed.some(file=>url.endsWith(file)))pending.set(url,this);else queueMicrotask(()=>this.onload());}
    get src(){return this.url;}
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/render/photo-cutouts.js'),'utf8'),{window:w,console,Date,Uint8ClampedArray});
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/render/photo-motion.js'),'utf8'),{window:w});w.PhotoMotion.configure(manifest);
  await w.PhotoCutouts.load(renderer,{touch});
  const actor={kind:'nva',p:[0,0,-5],alive:true,armed:true},motion={enabled:true,moving:true,clip:'walk',phase:.25/16,velocity:[1,0]};
  const describe=(who=actor,extra={})=>w.PhotoCutouts.describe(who,{renderer,photoName:who.kind,camera:[0,1,0],photoMotion:motion,...extra});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  // Frame0 is on plateA. The next chronological frame is on interleaved
  // plateC, whose actual decode remains pending until release() is called.
  describe();await flush();const first=describe();assert.equal(first.photoPose,'walk');assert.equal(first.photoFrame,0);
  motion.phase=1.25/16;
  return {C:w.PhotoCutouts,M:w.PhotoMotion,renderer,actor,motion,describe,flush,async release(file){for(const [url,im]of pending)if(!file||url.endsWith(file)){pending.delete(url);im.onload();}await flush();}};
}

test('a moving actor holds its last complete same-clip photograph while the next plate decodes',async()=>{
  const f=await delayedMotion(),actorBefore=JSON.stringify(f.actor);
  for(let i=0;i<20;i++){
    f.C.beginFrame(f.renderer);const d=f.describe();assert.equal(d.photoPose,'walk');assert.equal(d.photoFrame,0);assert.equal(d.photoPendingFrame,1);assert.equal(d.photoHeldFrame,true);assert.ok(f.renderer.gl.isTexture(f.renderer.textures[d.textureName].tex));f.C.endFrame(f.renderer);
  }
  assert.equal(JSON.stringify(f.actor),actorBefore,'Waiting/rendering cannot change AI, position, health or phase');
  await f.release();const ready=f.describe();assert.equal(ready.photoFrame,1);assert.equal(ready.photoPendingFrame,undefined);assert.equal(ready.photoHeldFrame,undefined);
});

test('a held motion photograph cannot leak to another actor, identity or gait',async()=>{
  const f=await delayedMotion(),other={...f.actor,p:f.actor.p.slice()};
  assert.equal(f.describe(other).photoPose,'idle','A newly encountered actor owns no held gait pose');
  f.actor.kind='militia';assert.equal(f.describe().photoPose,'idle','A different photographic identity cannot inherit an NVA frame');
  f.actor.kind='nva';assert.equal(f.describe().photoPose,'idle','Returning to an earlier identity cannot revive its obsolete held frame');
  await f.release();assert.equal(f.describe().photoFrame,1);
  f.motion.clip='run';assert.equal(f.describe().photoPose,'idle','Walking and running photographs never substitute for each other');
});

test('a bounded two-pose lookahead prepares an interleaved plate before its visible boundary',async()=>{
  const f=await delayedMotion(false,['nva-walk-b.webp','nva-walk-c.webp']);await f.release('nva-walk-c.webp');assert.equal(f.describe().photoFrame,1);
  // At frame6 the next frame is still on resident plateC; frame8 uses plateB.
  // A decode finishing between poses6/7 can be ready for8 only if requested
  // before the one-pose boundary. No whole clip or unrelated subject is loaded.
  f.motion.phase=6.25/16;assert.equal(f.describe().photoFrame,6);await f.release('nva-walk-b.webp');
  f.motion.phase=7.25/16;assert.equal(f.describe().photoFrame,7);
  f.motion.phase=8.25/16;const boundary=f.describe();assert.equal(boundary.photoFrame,8);assert.equal(boundary.photoHeldFrame,undefined);
  const state=f.C.inspect(f.renderer);assert.ok(state.bytes<=state.budget);assert.ok(state.motions.cpuBytes<=state.motions.cpuBudget);
  assert.ok(state.motions.records.filter(r=>r.clip==='walk').every(r=>r.subject==='nva'),'Lookahead never warms unrelated people');
});

test('paused measured motion and repeated renders hold the same pending photograph without advancing a cycle',async()=>{
  const f=await delayedMotion(),g={phase:'evade',t:0,paused:false,evade:{searchers:[f.actor],locals:[],cattle:[]}};
  f.M.pose(f.actor,g);f.M.step(g,.05);
  const dt=1.56*1.25/16;f.actor.p[0]+=dt;g.t+=dt;f.M.step(g,dt);
  const before=f.M.pose(f.actor,g),p=f.actor.p.slice();g.paused=true;
  for(let i=0;i<30;i++){
    g.t+=.05;f.M.step(g,.05);f.C.beginFrame(f.renderer);
    const measured=f.M.pose(f.actor,g),d=f.describe(f.actor,{photoMotion:measured});assert.equal(d.photoFrame,0);assert.equal(d.photoPendingFrame,1);assert.equal(d.photoHeldFrame,true);
    near(measured.phase,before.phase);near(measured.distance,before.distance);assert.deepEqual(f.actor.p,p);f.C.endFrame(f.renderer);
  }
  g.paused=false;await f.release();const ready=f.describe(f.actor,{photoMotion:f.M.pose(f.actor,g)});assert.equal(ready.photoFrame,1);near(f.M.pose(f.actor,g).phase,before.phase);
});

test('stopping and action priorities retire the held locomotion pose before a later restart',async()=>{
  for(const change of ['stop','crouch','fallen','firing','suspended']){
    const f=await delayedMotion();assert.equal(f.describe().photoHeldFrame,true);
    if(change==='stop')f.motion.moving=false;
    else if(change==='crouch')f.actor.crouched=true;
    else if(change==='fallen')f.actor.alive=false;
    else if(change==='firing')f.actor.firing=true;
    else {f.actor.kind='aviator';f.actor.suspended=true;}
    const priority=f.describe();assert.notEqual(priority?.photoPose,'walk',change+' must replace locomotion');
    f.actor.kind='nva';f.actor.alive=true;delete f.actor.crouched;delete f.actor.firing;delete f.actor.suspended;f.motion.moving=true;
    assert.equal(f.describe().photoPose,'idle',change+' must not leave a stale moving frame for restart');
  }
});

test('normal LRU eviction or a retired GPU texture cannot resurrect a remembered photograph',async()=>{
  for(const retire of ['evict','delete']){
    const f=await delayedMotion(true);assert.equal(f.describe().photoHeldFrame,true);f.C.endFrame(f.renderer);
    if(retire==='delete'){const key='photo_hr_nva_walk_0';f.renderer.gl.deleteTexture(f.renderer.textures[key].tex);delete f.renderer.textures[key];}
    else {
      for(const [subject,clip]of [['nva','run'],['militia','run'],['female_vc','walk']])await f.C.prepareMotion(f.renderer,subject,clip);
      assert.ok(!f.C.inspect(f.renderer).motions.records.some(r=>r.key==='nva:walk:0'),'Ordinary cache pressure actually evicts the remembered frame');
    }
    const d=f.describe();assert.equal(d.photoPose,'idle');assert.equal(d.photoHeldFrame,undefined);assert.ok(f.C.inspect(f.renderer).bytes<=f.C.inspect(f.renderer).budget);
  }
});
