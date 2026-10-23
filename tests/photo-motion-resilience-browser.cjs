'use strict';
// Production photo modules in an isolated real WebGL2 texture adapter. This
// deliberately excludes the full game, AI navigation and device frame rate.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

module.exports=async function resilience(browser,target,evidenceDir){
  const files=['photo-cutouts.js','photo-motion.js','photographic-sprites.js'],sources={};
  for(const file of files)sources[file]=await fs.readFile(path.join(root,'assets/render',file));
  const manifest=JSON.parse(await fs.readFile(path.join(root,'assets/sprites/hires/manifest.json'),'utf8'));
  for(const name of ['farmer','nva'])assert.equal(manifest.subjects[name]?.animations?.walk?.frames,16,'A complete real walking clip is required for '+name);
  const sourceHashes=Object.fromEntries(files.map(file=>['assets/render/'+file,sha(sources[file])])),checks=[];
  const record=(name,actual)=>{checks.push({name,passed:true,actual});console.log('PASS photo-motion-resilience '+name);};
  async function contextFor(testManifest,fault){
    const context=await browser.newContext({viewport:{width:512,height:384}}),page=await context.newPage();page.setDefaultTimeout(20000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url=new URL('motion-resilience-probe.html',target).href;
    await page.route('**/motion-resilience-probe.html',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><canvas id="c" width="32" height="32"></canvas>'+files.map(file=>'<script src="'+new URL('assets/render/'+file,target).href+'"></script>').join('')}));
    for(const file of files)await page.route('**/assets/render/'+file,r=>r.fulfill({status:200,contentType:'text/javascript',body:sources[file]}));
    await page.route('**/assets/sprites/hires/manifest.json',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(testManifest)}));
    if(fault)await page.route('**/assets/sprites/hires/review-missing-*.webp',fault);
    await page.goto(url);
    const loaded=await page.evaluate(async()=>{
      const gl=document.getElementById('c').getContext('webgl2');if(!gl)throw Error('Real WebGL2 context unavailable');
      window.reviewRenderer={gl,textures:{},texFromCanvas(name,canvas){
        const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        return this.textures[name]={tex,w:canvas.width,h:canvas.height,premultiplied:true};
      }};
      return PhotoCutouts.load(reviewRenderer);
    });
    assert.equal(loaded.status,'ready',JSON.stringify(loaded.failures));assert.equal(loaded.records.length,15);
    return {context,page,errors};
  }

  // Deliberate 404s verify request coalescing, cooldown and recovery using
  // actual browser Image decoding. Only the monotonic clock offset is a fixture.
  const faultManifest=structuredClone(manifest),original=faultManifest.subjects.farmer.animations.walk.plates.slice();
  for(const [name,subject]of Object.entries(faultManifest.subjects))if(name!=='farmer')delete subject.animations;
  delete faultManifest.subjects.farmer.animations.run;
  faultManifest.subjects.farmer.animations.walk.plates=original.map((_,i)=>'review-missing-'+i+'.webp');
  const attempts=[];let recover=false;
  const fault=await contextFor(faultManifest,async route=>{
    const index=Number(route.request().url().match(/review-missing-(\d)/)[1]);attempts.push({index,recovery:recover});
    return recover?route.fulfill({status:200,contentType:'image/webp',body:await fs.readFile(path.join(root,'assets/sprites/hires',original[index]))}):route.fulfill({status:404,body:'Intentional optional photographic asset failure'});
  });
  try{
    const {page}=fault;
    await page.evaluate(()=>{
      window.reviewOffset=0;const realNow=performance.now.bind(performance);Object.defineProperty(performance,'now',{value:()=>realNow()+reviewOffset});
      window.reviewActor={kind:'farmer',alive:true,armed:false,p:[0,0,-4]};
      window.describeReview=()=>PhotoSprites.describe(reviewActor,{renderer:reviewRenderer,camera:[0,1,0],photoMotion:{enabled:true,moving:true,clip:'walk',phase:.001,velocity:[0,-1]}});
      for(let i=0;i<200;i++)describeReview();
    });
    await page.waitForFunction(()=>PhotoCutouts.inspect(reviewRenderer).motions.retries.length===2,null,{polling:25});
    const initial=await page.evaluate(()=>({pose:describeReview().photoPose,state:PhotoCutouts.inspect(reviewRenderer),gl:reviewRenderer.gl.getError()}));
    assert.equal(initial.pose,'idle');assert.equal(initial.gl,0);assert.equal(attempts.length,2);assert.equal(initial.state.motions.failures.length,2);
    await page.evaluate(()=>{for(let i=0;i<1000;i++)describeReview();});assert.equal(attempts.length,2,'Render bursts cannot retry a failed image immediately');
    await page.evaluate(()=>{reviewOffset+=1100;for(let i=0;i<500;i++)describeReview();});
    await page.waitForFunction(()=>PhotoCutouts.inspect(reviewRenderer).motions.retries.every(r=>r.attempts===2),null,{polling:25});assert.equal(attempts.length,4);
    await page.evaluate(()=>{for(let i=0;i<1000;i++)describeReview();});assert.equal(attempts.length,4,'The second failure has a longer cooldown');
    recover=true;await page.evaluate(()=>{reviewOffset+=4100;for(let i=0;i<500;i++)describeReview();});
    await page.waitForFunction(()=>PhotoCutouts.inspect(reviewRenderer).motions.retries.length===0,null,{polling:25});
    const recovered=await page.evaluate(()=>{const descriptor=describeReview();return {pose:descriptor.photoPose,asset:descriptor.photoAsset,texture:!!reviewRenderer.textures[descriptor.textureName],state:PhotoCutouts.inspect(reviewRenderer),gl:reviewRenderer.gl.getError()};});
    assert.equal(attempts.length,6);assert.equal(recovered.pose,'walk');assert.ok(recovered.texture);assert.equal(recovered.gl,0);
    assert.equal(recovered.state.motions.failures.length,2,'Identical optional failures cannot grow diagnostics indefinitely');
    assert.ok(recovered.state.bytes<=recovered.state.budget);assert.deepEqual(fault.errors,[]);
    record('Optional image failures coalesce, back off, fall back to a whole photograph and recover into a real GPU gait texture',{attempts,initialPose:initial.pose,initialRetries:initial.state.motions.retries,recoveredPose:recovered.pose,recoveredAsset:recovered.asset,recoveredBytes:recovered.state.bytes,budget:recovered.state.budget,errors:recovered.state.motions.failures,gl:recovered.gl});
  }finally{await fault.context.close();}

  const pressure=await contextFor(manifest);
  try{
    const result=await pressure.page.evaluate(async()=>{
      const R=reviewRenderer,C=PhotoCutouts;
      await C.prepareMotion(R,'nva','walk');await C.prepareMotion(R,'farmer','walk');const initial=C.inspect(R);
      C.beginFrame(R);const far=[];
      for(const subject of ['nva','farmer'])for(let frame=0;frame<16;frame++){
        const actor={kind:subject,alive:true,p:[1000,0,-1000]};
        far.push(PhotoSprites.describe(actor,{renderer:R,camera:[0,100,0],photoMotion:{enabled:true,moving:true,clip:'walk',phase:(frame+.1)/16,velocity:[1,0]}}).photoPose);
      }
      const afterFar=C.inspect(R),near=[];
      for(const subject of ['nva','farmer'])for(let frame=0;frame<16;frame++){
        const actor={kind:subject,alive:true,p:[0,0,-4]};
        near.push(PhotoSprites.describe(actor,{renderer:R,camera:[0,100,0],photoMotion:{enabled:true,moving:true,clip:'walk',phase:(frame+.1)/16,velocity:[1,0]}}).photoPose);
      }
      const pinned=C.inspect(R),duringBuild=await C.preparePose(R,'nva','fallen');
      // Real Game.render calls endFrame only after submitting every sprite
      // draw. This isolated texture adapter checks the same cache lifecycle.
      C.endFrame(R);const afterEnd=await C.preparePose(R,'nva','fallen'),final=C.inspect(R);
      return {initial:{bytes:initial.bytes,motions:initial.motions.records.length},far:{poses:far,bytes:afterFar.bytes,motions:afterFar.motions.records.length},near:{gait:near.filter(p=>p==='walk').length,idle:near.filter(p=>p==='idle').length,bytes:pinned.bytes,budget:pinned.budget,motions:pinned.motions.records.length},duringBuild:{success:!!duringBuild},afterEnd:{success:!!afterEnd,resident:final.records.find(r=>r.key==='nva:fallen').resident,bytes:final.bytes,budget:final.budget},cpuBytes:final.motions.cpuBytes,cpuBudget:final.motions.cpuBudget,failures:final.motions.failures,gl:R.gl.getError()};
    });
    assert.ok(result.far.poses.every(p=>p==='idle'));assert.equal(result.initial.bytes,result.far.bytes);assert.equal(result.initial.motions,result.far.motions);
    record('Thirty-two distant moving actors retain complete idle photographs without allocating or pinning gait textures',{initial:result.initial,far:result.far});
    assert.ok(result.near.gait>=16);assert.ok(result.near.idle>0,'The declared crowd must actually reach cache pressure');assert.ok(result.near.bytes<=result.near.budget);
    assert.equal(result.duringBuild.success,false,'Queued current-frame textures stay pinned during sprite-list construction');
    assert.ok(result.afterEnd.success&&result.afterEnd.resident,'A cold fallen pose uploads after submitted draws release their pins');
    assert.ok(result.afterEnd.bytes<=result.afterEnd.budget);assert.ok(result.cpuBytes<=result.cpuBudget);assert.deepEqual(result.failures,[]);assert.equal(result.gl,0);assert.deepEqual(pressure.errors,[]);
    record('A full nearby gait cache protects queued textures and admits a cold fallen photograph after endFrame',{near:result.near,duringBuild:result.duringBuild,afterEnd:result.afterEnd,cpuBytes:result.cpuBytes,cpuBudget:result.cpuBudget,gl:result.gl});
  }finally{await pressure.context.close();}
  const report={passed:true,scope:'Actual Chromium WebGL2 with unchanged production PhotoCutouts/PhotoMotion/PhotoSprites modules and a minimal texture-upload adapter. Deliberate failed HTTP routes, clock offsets and crowded positions are fixtures. This is not full game, AI navigation, physical iPhone Safari or measured FPS evidence.',sourceHashes,checks};
  await fs.mkdir(evidenceDir,{recursive:true});await fs.writeFile(path.join(evidenceDir,'photo-motion-resilience.json'),JSON.stringify(report,null,2)+'\n');return report;
};

if(require.main===module)(async()=>{
  const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs'),server=createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});console.log(JSON.stringify(await module.exports(browser,'http://127.0.0.1:'+server.address().port+'/',path.resolve(process.argv[2]||'test-results/photo-motion-resilience')),null,2));}
  finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
