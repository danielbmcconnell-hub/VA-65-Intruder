'use strict';
// CPU/renderer-adapter checks of the production cutout routing/cache. These do
// not certify GPU pixels; check-swim-assets.py audits real source/runtime RGBA,
// and the survival native-browser suite checks actual water rendering.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/sprites/hires/manifest.json')));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
async function fixture(touch=false){
  const gl={NO_ERROR:0,TEXTURE_2D:3553,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,LINEAR_MIPMAP_LINEAR:9987,LINEAR:9729,
    isContextLost:()=>false,isTexture:tex=>!!tex?.alive,bindTexture(){},generateMipmap(){},texParameteri(){},getExtension:()=>null,getError:()=>0,deleteTexture(tex){tex.alive=false;}};
  const renderer={gl,textures:{},eye:[0,.4,0],texFromCanvas(name,c){const t={tex:{name,alive:true},width:c.width,height:c.height};this.textures[name]=t;return t;}};
  const canvases=[];
  const document={getElementById:()=>null,createElement(tag){assert.equal(tag,'canvas');const c={width:1,height:1,getContext(){return {
    // A single synthetic alpha sample is enough to exercise descriptor/cache
    // state. This deliberately makes no photographic-content assertion.
    drawImage(){},getImageData(){const a=new Uint8ClampedArray(c.width*c.height*4),i=(Math.floor(c.height/2)*c.width+Math.floor(c.width/2))*4;a[i]=90;a[i+1]=100;a[i+2]=75;a[i+3]=255;return {data:a};},
  };}};canvases.push(c);return c;}};
  const window={document,performance:{now:()=>0},fetch:async()=>({ok:true,json:async()=>manifest}),Image:class{
    // Full portrait dimensions only for animation-plate schema/cache paths.
    // Base-photo pixel detail is audited from actual files by its own suite;
    // small synthetic base canvases keep this routing adapter inexpensive.
    set src(url){this.url=url;if(!url)return;const plate=/-(?:swim|walk|run)-/.test(url);this.naturalWidth=plate?1024:128;this.naturalHeight=plate?1536:128;queueMicrotask(()=>this.onload());}
    get src(){return this.url;}
  }};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'assets/render/photo-cutouts.js'),'utf8'),{window,console,Date,Uint8ClampedArray});
  await window.PhotoCutouts.load(renderer,{touch});
  return {C:window.PhotoCutouts,renderer,canvases};
}
function describe(f,actor,more={}){return f.C.describe(actor,{renderer:f.renderer,photoName:actor.kind,camera:[0,.4,0],height:1.76,photoMotion:{enabled:true,moving:true,clip:'run',phase:.99,velocity:[1,0]},...more});}

test('adding swimming preserves every existing base/standing/walk/run registration',()=>{
  const original=JSON.parse(cp.execFileSync('git',['show','HEAD:assets/sprites/hires/manifest.json'],{cwd:ROOT,encoding:'utf8'}));
  const current=JSON.parse(JSON.stringify(manifest));for(const m of [original,current]){for(const s of Object.values(m.subjects))delete s.animations.swim;delete m.subjects.aviator.poses.harness;}
  assert.deepEqual(current,original);
  let frames=0;for(const s of Object.values(current.subjects))for(const c of Object.values(s.animations))frames+=c.frames;assert.equal(frames,192);
});

test('all three subjects preload a complete horizontal fallback within the shared cache budget',async()=>{
  for(const touch of [false,true]){
    const f=await fixture(touch),s=f.C.inspect(f.renderer);assert.equal(s.status,'ready');assert.deepEqual([...s.failures],[]);assert.deepEqual([...s.motions.failures],[]);
    assert.equal(s.records.filter(r=>r.pose==='idle').length,6);assert.equal(s.motions.records.filter(r=>r.clip==='swim'&&r.frame===0).length,3);
    assert.ok(s.bytes<=s.budget);assert.ok(s.motions.cpuBytes<=s.motions.cpuBudget);
    for(const subject of ['nva','militia','aviator'])assert.ok(s.motions.clips.some(c=>c.subject===subject&&c.clip==='swim'&&c.frames===8));
  }
});

test('stroke phase selects eight true horizontal photographs independently of walking speed or gait phase',async()=>{
  const f=await fixture();
  for(const kind of ['nva','militia','aviator']){
    await f.C.prepareMotion(f.renderer,kind,'swim');
    const actor={kind,p:[0,-.42,-5],alive:true,swimming:true,swimPhase:0,yaw:Math.PI/2};
    for(let i=0;i<8;i++){
      f.C.beginFrame(f.renderer);actor.swimPhase=(i+.25)/8;const before=JSON.stringify(actor),s=describe(f,actor);
      assert.equal(s.photoPose,'swim');assert.equal(s.photoFrame,i);assert.equal(s.photoSwimming,true);near(s.h,.70);assert.equal(JSON.stringify(actor),before);
      const q=f.C.anchor({...s,p:actor.p.slice()});near(q.w/q.h,1152/512);near(q.h,.70/(400/512));
      // Dense torso registration is at280px; its baseline is460px. Correct
      // physical waterline keeps torso slightly immersed and head above it.
      near(q.p[1]+q.h*(1-280/512),-.105);assert.ok(q.w>1.9&&q.w<2.1);f.C.endFrame(f.renderer);
    }
  }
});

test('stationary and distant swimmers hold stroke photos rather than returning to standing/run poses',async()=>{
  const f=await fixture();await f.C.prepareMotion(f.renderer,'nva','swim');
  const actor={kind:'nva',p:[0,-.42,-150],alive:true,swimming:true,swimPhase:.32};
  const options={photoMotion:{enabled:true,moving:false,clip:'idle',phase:.99,velocity:[0,0]}};
  for(let i=0;i<40;i++){const s=describe(f,actor,options);assert.equal(s.photoPose,'swim');assert.equal(s.photoFrame,2);near(s.h,.7);}
  actor.swimming=false;const dry=describe(f,actor,options);assert.equal(dry.photoPose,'idle');near(dry.h,1.76);
});

test('a pending stroke frame holds its resident horizontal fallback without showing a land pose',async()=>{
  const f=await fixture();const actor={kind:'aviator',p:[0,-.42,-5],alive:true,swimming:true,swimPhase:.51};
  const s=describe(f,actor);assert.equal(s.photoPose,'swim');assert.equal(s.photoFrame,0);assert.equal(s.photoPendingFrame,4);near(s.h,.7);
  await f.C.prepareMotion(f.renderer,'aviator','swim');const ready=describe(f,actor);assert.equal(ready.photoFrame,4);assert.equal(ready.photoPendingFrame,undefined);
});

test('ordinary cache pressure can evict motion slots while preserving all complete land and swim fallbacks',async()=>{
  const f=await fixture(true);
  for(const [kind,clip] of [['nva','walk'],['nva','run'],['militia','walk']])await f.C.prepareMotion(f.renderer,kind,clip);
  const s=f.C.inspect(f.renderer);assert.ok(s.motions.evictions>0);assert.ok(s.bytes<=s.budget);
  for(const kind of ['nva','militia','aviator']){
    const idle=s.records.find(r=>r.subject===kind&&r.pose==='idle');assert.ok(idle.resident);
    const swim=s.motions.records.find(r=>r.subject===kind&&r.clip==='swim'&&r.frame===0);assert.ok(swim&&swim.resident&&swim.permanent);
    const q=describe(f,{kind,p:[0,-.42,-5],alive:true,swimming:true,swimPhase:0});assert.equal(q.photoPose,'swim');assert.equal(q.photoFrame,0);
  }
  const harness=s.records.find(r=>r.subject==='aviator'&&r.pose==='harness');assert.equal(harness.resident,false);
  assert.equal(describe(f,{kind:'aviator',p:[0,20,-5],alive:true,suspended:true}),null,'Cold suspended pose waits for its genuine photograph, never standing fallback');
});

test('suspended aviators use the actual harness photograph and never a land or swimming pose',async()=>{
  const f=await fixture(),actor={kind:'aviator',p:[0,50,-150],alive:true,suspended:true,swimming:true,swimPhase:.7};
  assert.equal(f.C.hasPose(f.renderer,'aviator','harness'),true);
  const q=describe(f,actor);assert.equal(q.photoPose,'harness');assert.equal(q.photoSuspended,true);assert.equal(q.photoSwimming,undefined);near(q.h,1.68);
  assert.equal(f.C.hasPose(f.renderer,'nva','harness'),false);
});

test('harness readiness requires its owned live texture',async()=>{
  const f=await fixture(),actor={kind:'aviator',p:[0,20,-5],alive:true,suspended:true};
  const texture=f.renderer.textures.photo_hr_aviator_harness;assert.equal(f.C.hasPose(f.renderer,'aviator','harness'),true);
  f.renderer.gl.deleteTexture(texture.tex);assert.equal(f.C.hasPose(f.renderer,'aviator','harness'),false);
  delete f.renderer.textures.photo_hr_aviator_harness;assert.equal(f.C.hasPose(f.renderer,'aviator','harness'),false);
  const idle=f.renderer.textures.photo_hr_aviator_idle;assert.ok(idle.tex.alive);
});
