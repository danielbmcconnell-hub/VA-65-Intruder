'use strict';
// Actual network decode + production WebGL2 test. Declared isolated actor/
// camera fixture; does not claim AI navigation or device performance.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function snapshot(){const files=['index.html'];async function walk(dir){for(const e of await fs.readdir(path.join(ROOT,dir),{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())await walk(f);else if(/\.(js|css|json|glsl)$/.test(f))files.push(f);}}await walk('assets');const result={};for(const file of files.sort())result[file]=sha(await fs.readFile(path.join(ROOT,file)));return result;}
module.exports=async function photoMotionLoadingBrowser(browser,target,evidenceDir){
 const OUT=path.join(evidenceDir,'photo-motion-loading'),before=await snapshot(),checks=[],sourceHashes=[],executedHTTP=[],screenshots=[],errors=[],missing=[];
 await fs.mkdir(OUT,{recursive:true});
 try{
  for(const profile of [{name:'desktop',viewport:{width:1280,height:720}},{name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}]){
   const {name,...options}=profile,context=await browser.newContext(options),page=await context.newPage(),jobs=[];let release,releaseB,seen=false,signalB;
   const gate=new Promise(r=>release=r),gateB=new Promise(r=>releaseB=r),seenB=new Promise(r=>signalB=r);page.setDefaultTimeout(90000);
   await context.route('**/assets/sprites/hires/nva-walk-c.webp',async route=>{seen=true;await gate;await route.continue();});
   await context.route('**/assets/sprites/hires/nva-walk-b.webp',async route=>{signalB();await gateB;await route.continue();});
   page.on('pageerror',error=>errors.push({profile:name,error:error.message}));page.on('response',response=>{
    if(!response.url().startsWith(target))return;const file=new URL(response.url()).pathname.slice(1);
    if(response.status()>=400)missing.push({profile:name,file,status:response.status()});
    if(/\.(js|css|json|glsl|png|webp)$/.test(file)&&response.status()===200)jobs.push(response.body().then(bytes=>executedHTTP.push({profile:name,file,sha256:sha(bytes)})));
   });
   try{
    await context.addInitScript(touch=>{localStorage.setItem('a6_set',JSON.stringify({quality:touch?1:2,sound:0,voices:0,seat:0,assist:1,mouse:0}));localStorage.setItem('a6_sawkeys','1');const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>window.__loadingFixturePaused?0:raf(t=>{if(!window.__loadingFixturePaused)cb(t);});},!!options.hasTouch);
    const response=await page.goto(target,{waitUntil:'domcontentloaded'});sourceHashes.push({layout:name,indexSHA256:sha(await response.body())});
    const click=locator=>options.hasTouch?locator.tap():locator.click();
    await click(page.locator('#bootGo'));await click(page.locator('#readyBody .mcard').first());await click(page.getByRole('button',{name:'Man Aircraft',exact:true}));
    await page.waitForFunction(()=>App.game&&document.getElementById('loader').style.display==='none',null,{polling:50});
    await page.evaluate(()=>{window.__loadingFixturePaused=true;App.game.paused=true;});
    await page.waitForFunction(()=>{const c=PhotoCutouts.inspect(App.rend);if(c.status==='error')throw Error(c.failures.join(';'));return c.status==='ready';},null,{polling:50});
    await page.evaluate(()=>{
     const R=App.rend,C=PhotoCutouts,M=PhotoMotion,actor={kind:'nva',p:[0,0,-3.5],ph:0,alive:true,armed:true},g={phase:'evade',t:0,paused:false,evade:{searchers:[actor],locals:[],cattle:[]}};
     M.pose(actor,g);M.step(g,1/60);let cycle=0;
     const setFrame=n=>{const target=(n+.25)/16;if(target>cycle){const distance=(target-cycle)*1.56,steps=Math.max(1,Math.ceil(distance*60)),dt=distance/steps;for(let i=0;i<steps;i++){actor.p[2]-=dt;g.t+=dt;M.step(g,dt);}cycle=target;}};
     const get=n=>{setFrame(n);C.beginFrame(R);return C.describe(actor,{renderer:R,photoName:'nva',camera:[0,1,0],game:g,owner:actor});};
     const draw=n=>{
      const descriptor=get(n),q=C.anchor({...descriptor,p:[0,0,-3.5],sourcePhotograph:true});
      R.bloomOn=false;R.setEpisode(null);R.setFires([]);R.setCamera([0,1,0],[0,0,-1],[0,1,0],50,.1,400,R.W/R.H);
      R.setAtmos({...R.atm,amb:[.55,.55,.55],gnd:[.12,.12,.12],sunCol:[.55,.55,.55],sunDir:[.2,.9,.3],fogDens:0,night:false,exposure:1});
      R.begin();const gl=R.gl;gl.clearColor(.075,.095,.12,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);R.drawSprites(q.textureName,[q]);R.end(0,0,1);
      const row=C.inspect(R).motions.records.find(r=>r.key===q.photoAsset),result={descriptor:JSON.parse(JSON.stringify(descriptor)),pose:M.pose(actor,g),liveTexture:gl.isTexture(R.textures[q.textureName]?.tex),gpu:row,canvas:[R.W,R.H],png:R.canvas.toDataURL('image/png'),gl:gl.getError()};C.endFrame(R);return result;
     };
     window.__motionLoading={get,draw,g,actor,R};get(0);
    });
    await page.waitForFunction(()=>window.__motionLoading.get(0).photoPose==='walk',null,{polling:50});assert.ok(seen,'The real next-plate request must remain delayed');
    const first=await page.evaluate(()=>__motionLoading.draw(0)),held=await page.evaluate(()=>__motionLoading.draw(1));
    assert.equal(first.descriptor.photoFrame,0);assert.equal(held.descriptor.photoPose,'walk');assert.equal(held.descriptor.photoFrame,0);assert.equal(held.descriptor.photoPendingFrame,1);assert.equal(held.descriptor.photoHeldFrame,true);
    assert.equal(sha(Buffer.from(first.png.split(',')[1],'base64')),sha(Buffer.from(held.png.split(',')[1],'base64')),'A stalled decode must retain the same actual complete GPU photograph, not an idle flash');
    const paused=await page.evaluate(()=>{const f=__motionLoading,before=PhotoMotion.pose(f.actor,f.g);f.g.paused=true;for(let i=0;i<20;i++){f.g.t+=1/60;PhotoMotion.step(f.g,1/60);f.get(1);}return {before,after:PhotoMotion.pose(f.actor,f.g)};});assert.equal(paused.after.phase,paused.before.phase);assert.equal(paused.after.distance,paused.before.distance);
    checks.push({profile:name,name:'Delayed real plate decode holds the same complete GPU gait photograph and measured pause phase',passed:true,first:{...first,png:undefined},held:{...held,png:undefined},paused});
    release();await page.waitForFunction(()=>__motionLoading.get(1).photoFrame===1,null,{polling:50});
    const ready=await page.evaluate(()=>__motionLoading.draw(1));assert.equal(ready.descriptor.photoPose,'walk');assert.equal(ready.descriptor.photoHeldFrame,undefined);assert.equal(ready.descriptor.photoPendingFrame,undefined);assert.notEqual(sha(Buffer.from(ready.png.split(',')[1],'base64')),sha(Buffer.from(held.png.split(',')[1],'base64')),'The requested authored photograph must change real rendered pixels after decode');
    checks.push({profile:name,name:'Completing the real image response resumes the requested authored pose without advancing simulation',passed:true,ready:{...ready,png:undefined}});
    const lookahead=await page.evaluate(()=>{const f=__motionLoading;f.g.paused=false;return {at6:f.get(6),loaded:PhotoCutouts.inspect(App.rend)};});assert.equal(lookahead.at6.photoFrame,6);
    let timer;try{await Promise.race([seenB,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('The next interleaved plate was not prefetched at pose6')),15000);})]);}finally{clearTimeout(timer);}
    releaseB();await page.waitForFunction(()=>PhotoCutouts.inspect(App.rend).motions.plates.some(p=>p.url.endsWith('nva-walk-b.webp')),null,{polling:50});
    const boundary=await page.evaluate(()=>{const f=__motionLoading,at7=f.get(7),at8=f.draw(8);return {at7,at8,loaded:PhotoCutouts.inspect(App.rend)};});assert.equal(boundary.at7.photoFrame,7);assert.equal(boundary.at8.descriptor.photoFrame,8);assert.equal(boundary.at8.descriptor.photoHeldFrame,undefined);
    assert.ok(boundary.loaded.motions.records.filter(r=>r.clip!=='swim').every(r=>r.subject==='nva'&&r.clip==='walk'),'Rolling prefetch must not warm unrelated subjects/clips');
    checks.push({profile:name,name:'Two-pose lookahead decodes the real interleaved next plate before the visible boundary',passed:true,lookahead,boundary:{...boundary,at8:{...boundary.at8,png:undefined}}});
    for(const [label,frame]of [['first',first],['held',held],['ready',ready]]){assert.ok(frame.liveTexture);assert.equal(frame.gl,0);const file=name+'-'+label+'.png';await fs.writeFile(path.join(OUT,file),Buffer.from(frame.png.split(',')[1],'base64'));screenshots.push('photo-motion-loading/'+file);}
    const resources=await page.evaluate(()=>({photos:PhotoCutouts.inspect(App.rend),gl:App.rend.gl.getError()}));assert.ok(resources.photos.bytes<=resources.photos.budget);assert.ok(resources.photos.motions.cpuBytes<=resources.photos.motions.cpuBudget);assert.deepEqual(resources.photos.failures,[]);assert.deepEqual(resources.photos.motions.failures,[]);assert.equal(resources.gl,0);
    checks.push({profile:name,name:'Delayed decode uses live production textures within the unchanged GPU/CPU budgets',passed:true,actual:resources});await page.waitForLoadState('networkidle');await Promise.all(jobs);
    console.log('PASS '+name+' delayed-plate production GPU hold and resume');
   }finally{release();releaseB();await context.close();}
  }
  const after=await snapshot();assert.deepEqual(after,before);const bound={...before};for(const row of executedHTTP){if(!bound[row.file])bound[row.file]=sha(await fs.readFile(path.join(ROOT,row.file)));assert.equal(row.sha256,bound[row.file],row.file+' actual HTTP bytes');}for(const row of sourceHashes)assert.equal(row.indexSHA256,before['index.html']);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);const report={suite:'photo-motion-loading',passed:true,sourceStable:true,fullCoverage:true,sourceSHA256:bound,sourceHashes,executedHTTP,checks,screenshots,errors,missing,scope:'Real delayed local image response and production WebGL2 after native Mission01 startup; isolated photographic actor/camera and explicit simulation pause fixture. Both Chromium layouts, not AI navigation, physical iPhone Safari or hardware FPS.'};
  await fs.writeFile(path.join(OUT,'results.json'),JSON.stringify(report,null,2)+'\n');return report;
 }catch(error){await fs.writeFile(path.join(OUT,'results.failed.json'),JSON.stringify({passed:false,error:error.stack,checks,sourceHashes,executedHTTP,errors,missing},null,2)+'\n');throw error;}
};
if(require.main===module)(async()=>{
 const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs'),server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{const result=await module.exports(browser,'http://127.0.0.1:'+server.address().port+'/',process.argv[2]||'test-results/photo-loading');console.log(JSON.stringify({passed:result.passed,checks:result.checks.length}));}
 finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
