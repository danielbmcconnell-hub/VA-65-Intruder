'use strict';
// Native mission entry is the regression oracle. The separately labelled
// aerial camera and geometric control are renderer coverage fixtures only.
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const harnessSHA256=sha(fs.readFileSync(__filename));
const VEGETATION=['tree','palm','bamboo','bush'];

async function sourceSnapshot(){
 const files=new Set(['index.html','tests/jungle-world-browser.cjs']);
 async function walk(dir){
  for(const entry of await fsp.readdir(path.join(ROOT,dir),{withFileTypes:true})){
   const file=dir+'/'+entry.name;
   if(entry.isDirectory())await walk(file);
   else if(/\.(js|css|json|glsl)$/.test(file)||file.startsWith('assets/jungle/')&&file.endsWith('.webp'))files.add(file);
  }
 }
 await walk('assets');
 return Object.fromEntries(await Promise.all([...files].sort().map(async file=>[file,sha(await fsp.readFile(path.join(ROOT,file)))])));
}

// Serialized into the production page; only observes actors and rendering.
function captureProductionFrame(renderCount){
 const g=App.game,R=App.rend,meshes={},photographs={};
 const actors=()=>({phase:g.phase,time:g.t,mission:g.mis.id,aircraft:{p:g.ac.p.slice(),v:g.ac.v?.slice(),yaw:g.ac.yaw,pitch:g.ac.pitch,roll:g.ac.roll},evade:!!g.evade,chute:!!g.chute});
 const before=actors(),mesh=R.drawMesh,sprite=R._drawSpriteBatch;
 R.drawMesh=function(name,data,count){meshes[name]=(meshes[name]||0)+count;return mesh.call(this,name,data,count);};
 R._drawSpriteBatch=function(name,list,wind){if(name.startsWith('jungle_'))photographs[name]=(photographs[name]||0)+list.length;return sprite.call(this,name,list,wind);};
 try{for(let i=0;i<renderCount;i++)g.render(0);}
 finally{R.drawMesh=mesh;R._drawSpriteBatch=sprite;}
 const gl=R.gl,jungle=JungleScenery.inspect(g,R),surfaces=WildlifeRender.inspect(R);
 return {renderCount,actorsBefore:before,actorsAfter:actors(),eye:R.eye.slice(),quality:R.quality,canvas:[R.W,R.H],webgl2:gl instanceof WebGL2RenderingContext,renderer:gl.getParameter(gl.RENDERER),vendor:gl.getParameter(gl.VENDOR),jungle,surfaces:{drawCalls:surfaces.surfaceDrawCalls||0,count:surfaces.surfaceDraws||0,crowns:(surfaces.lastSurfaces||[]).filter(s=>s.textureName==='jungle_crown')},profile:{...JungleScenery.profiles[R.quality]},limits:{...JungleScenery.limits},meshes,photographs,contextLost:gl.isContextLost(),gl:gl.getError()};
}

module.exports=async function jungleWorld(browser,target,evidenceDir){
 const out=path.join(evidenceDir,'jungle-world');await fsp.mkdir(out,{recursive:true});
 const beforeSource=await sourceSnapshot(),manifest=JSON.parse(await fsp.readFile(path.join(ROOT,'assets/jungle/manifest.json'),'utf8')),requiredSources=Object.keys(manifest.plants).length+(manifest.floor?1:0)+(manifest.crown?1:0),checks=[],screenshots=[],executedHTTP=[],errors=[],missing=[],bodyJobs=[];
 assert.equal(beforeSource['tests/jungle-world-browser.cjs'],harnessSHA256,'The loaded harness matches the recorded source');
 const profiles=[{name:'desktop-high',quality:2,viewport:{width:1280,height:720},deviceScaleFactor:1},{name:'iphone-layout-chromium-medium',quality:1,viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}];
 for(const profile of profiles){
  const {name,quality,...options}=profile,context=await browser.newContext(options);let page;
  const record=(label,actual)=>{checks.push({layout:name,name:label,passed:true,actual});console.log('PASS jungle-world '+name+' '+label);};
  try{
   page=await context.newPage();page.setDefaultTimeout(120000);
   page.on('pageerror',error=>errors.push({layout:name,message:error.message}));
   page.on('response',response=>{
    if(!response.url().startsWith(target))return;
    const pathname=new URL(response.url()).pathname,base=new URL(target).pathname,file=decodeURIComponent(pathname.slice(base.length))||'index.html';
    if(response.status()>=400)missing.push({layout:name,file,status:response.status()});
    if(response.status()===200&&beforeSource[file])bodyJobs.push(response.body().then(bytes=>executedHTTP.push({layout:name,file,sha256:sha(bytes)})).catch(error=>errors.push({layout:name,file,message:'HTTP body verification failed: '+error.message})));
   });
   await context.addInitScript(q=>{localStorage.setItem('a6_set',JSON.stringify({quality:q,sound:0,voices:0,seat:0,assist:1,mouse:0}));localStorage.setItem('a6_sawkeys','1');},quality);
   await page.goto(target,{waitUntil:'domcontentloaded'});
   const click=locator=>options.hasTouch?locator.tap():locator.click();
   await click(page.locator('#bootGo'));
   await click(page.locator('#tabs [data-tab="set"]'));
   await click(page.getByRole('button',{name:'Unlock all missions',exact:true}));
   await click(page.locator('#readyBody .mcard[data-mission="m11"]'));
   await click(page.getByRole('button',{name:'Man Aircraft',exact:true}));
   await page.waitForFunction(()=>window.App?.game&&document.getElementById('loader').style.display==='none',null,{polling:50,timeout:120000});
   // Pause after normal UI startup. Cache warming calls production render(0)
   // sixteen times; actor update and camera assignment are absent here.
   await page.evaluate(()=>{App.frame=()=>{};App.game.paused=true;for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on');});
   await page.waitForFunction(expected=>{
    const state=JungleScenery.inspect(App.game,App.rend);
    if(state.status==='error'||state.failures.length||App.rend.gl.isContextLost())throw Error(JSON.stringify({status:state.status,failures:state.failures,contextLost:App.rend.gl.isContextLost()}));
    return state.status==='ready'&&state.readySources===expected;
   },requiredSources,{polling:50,timeout:120000});
   const validate=(frame,{photosRequired=false,geometricControl=false}={})=>{
    assert.equal(frame.webgl2,true);assert.equal(frame.contextLost,false);assert.equal(frame.gl,0);assert.equal(frame.quality,quality);assert.equal(frame.actorsAfter.mission,'m11');assert.ok(['flight','airborne'].includes(frame.actorsAfter.phase));assert.equal(frame.actorsAfter.evade,false);assert.deepEqual(frame.actorsAfter,frame.actorsBefore,'Paused render warming does not update actors or simulation time');
    const j=frame.jungle;assert.equal(j.status,'ready');assert.equal(j.expectedSources,requiredSources);assert.equal(j.readySources,requiredSources);assert.equal(j.records.length,Object.keys(manifest.plants).length);assert.deepEqual(j.failures,[]);assert.ok(j.bytes<=j.budget);assert.ok(j.count+j.crowns.length<=frame.profile.flightTotal);assert.ok(j.crowns.length<=frame.profile.crowns);assert.ok(j.sceneryCandidates<=j.sceneryCandidateLimit);assert.ok(j.distantCandidates<=j.distantCandidateLimit);assert.ok(j.queueSamples<=frame.limits.queueSamples);assert.ok(j.terrainSamples<=frame.limits.terrainSamples);assert.equal(j.solidChecks,0);assert.equal(j.cellUpdates,0);assert.equal(j.fineUpdates,0);assert.equal(j.obstacles.length,0);
    if(manifest.crown){assert.equal(j.crown.ready,true);assert.equal(j.crown.width,options.hasTouch?manifest.crown.gpuTouch:manifest.crown.gpuHigh);}
    if(!geometricControl)for(const mesh of VEGETATION)assert.equal(frame.meshes[mesh]||0,0,'Ready photographs retire '+mesh+' blob meshes');
    if(photosRequired){assert.ok(j.count>0);assert.ok(Object.values(frame.photographs).reduce((n,v)=>n+v,0)>0,'The actual sprite renderer submits botanical photographs');}
    for(const plant of j.plants){const source=j.records.find(r=>r.kind===plant.kind);assert.ok(Math.abs(plant.p[1]+plant.h*(1-source.baseline)-plant.groundRoot[1])<1e-5);assert.ok(Math.abs(plant.w/plant.h-source.width/source.height)<1e-8);}
   };
   const capture=async(label,renderCount)=>{
    const frame=await page.evaluate(captureProductionFrame,renderCount),file=name+'-'+label+'.png';
    await page.screenshot({path:path.join(out,file),timeout:120000});screenshots.push('jungle-world/'+file);return frame;
   };
   const native=await capture('native-mission11',16);validate(native,{photosRequired:true});
   record('Native Mission11 UI startup loads all declared botanical sources and retires rounded vegetation meshes',{requiredSources,frame:native});

   // Additional coverage fixture: find a dry forest point with production's
   // bounded query, then change only the renderer camera. Aircraft, phase,
   // terrain, RNG and actor simulation stay as entered through the UI.
   const coverage=await page.evaluate(()=>{
    const g=App.game,R=App.rend,point=wildlifePracticePoint(g),trees=[];
    g.world.clutter([point[0],point[1]+1.68,point[2]],null,(mesh,p)=>{if(mesh==='tree'&&dryJungleAt(p[0],p[2]))trees.push(p.slice());});
    trees.sort((a,b)=>Math.hypot(a[0]-point[0],a[2]-point[2])-Math.hypot(b[0]-point[0],b[2]-point[2]));
    if(!trees.length)throw Error('The declared forest coverage query found no existing source tree');
    const tree=trees[0],root=[tree[0],terrainH(tree[0],tree[2]),tree[2]];
    window.__jungleWorldOriginalCamera=R.setCamera;
    R.setCamera=function(eye,forward,up,fov,near,far,aspect){return window.__jungleWorldOriginalCamera.call(this,[root[0],root[1]+70,root[2]+65],[0,-.733,-.680],[0,1,0],fov,.35,far,aspect);};
    return {point:point.slice(),sourceTree:tree.slice(),root:root.slice(),heightAboveGround:70,scope:'Declared oblique aerial coverage camera over the nearest existing source tree in a dry forest; no actor or simulation assignment.'};
   });
   try{
    const aerial=await capture('declared-aerial-coverage',16);validate(aerial,{photosRequired:true});assert.deepEqual(aerial.actorsAfter,native.actorsAfter);
    if(manifest.crown){assert.ok(aerial.jungle.crowns.length>0);assert.ok(aerial.surfaces.crowns.length>0,'The actual horizontal surface renderer submits aerial crown photographs');assert.ok(aerial.surfaces.drawCalls>0);for(const surface of aerial.surfaces.crowns){const crown=aerial.jungle.crowns.find(c=>c.id===surface.id);assert.ok(crown);assert.ok(surface.vertices.every(v=>Math.abs(v[1]-crown.p[1]-surface.groundLift)<1e-4),'Aerial crown vertices remain horizontal at their canopy height');assert.ok(Math.abs(surface.normal[1]-1)<1e-8);}}
    record('Declared aerial coverage camera submits rooted botanical photographs within the flight budget',{coverage,frame:aerial});
    await page.evaluate(()=>{window.__jungleWorldOriginalModule=window.JungleScenery;window.JungleScenery={...window.__jungleWorldOriginalModule,queue:()=>false,draw:()=>0};});
    try{
     const control=await capture('declared-geometric-control',1);validate(control,{geometricControl:true});assert.deepEqual(control.actorsAfter,native.actorsAfter);assert.deepEqual(control.eye,aerial.eye);assert.ok(VEGETATION.some(mesh=>(control.meshes[mesh]||0)>0),'Disabling photographic availability exposes the existing geometric vegetation at the same camera');
     record('Declared geometric availability control exposes the retired mesh path at the same aerial camera',{scope:'Renderer fixture disables photographic queue/draw for one frame; original source assets and actor state remain unchanged.',frame:control});
    }finally{await page.evaluate(()=>{if(window.__jungleWorldOriginalModule){window.JungleScenery=window.__jungleWorldOriginalModule;delete window.__jungleWorldOriginalModule;}});}
   }finally{await page.evaluate(()=>{if(window.__jungleWorldOriginalCamera){App.rend.setCamera=window.__jungleWorldOriginalCamera;delete window.__jungleWorldOriginalCamera;}});}
   await Promise.all(bodyJobs);
   assert.deepEqual(errors.filter(e=>e.layout===name),[]);assert.deepEqual(missing.filter(e=>e.layout===name),[]);
   const executed=executedHTTP.filter(row=>row.layout===name);
   for(const required of ['index.html','assets/render/jungle-scenery.js','assets/jungle/manifest.json'])assert.ok(executed.some(row=>row.file===required),'Executed HTTP source recorded: '+required);
   for(const row of executed)assert.equal(row.sha256,beforeSource[row.file],'Executed bytes match recorded source: '+row.file);
   record('Executed HTTP source hashes, asset requests and JavaScript errors match the recorded build',{executedFiles:executed.length,errors:0,missing:0});
  }catch(error){
   await Promise.allSettled(bodyJobs);
   const pageState=page?await page.evaluate(()=>({phase:window.App?.game?.phase,mission:window.App?.game?.mis?.id,graphicsError:document.getElementById('graphicError')?.textContent,jungle:window.App?.rend&&window.JungleScenery?.inspect(App.game,App.rend)})).catch(e=>({unavailable:e.message})):null;
   await fsp.writeFile(path.join(out,'results.failed.json'),JSON.stringify({suite:'jungle-world',passed:false,failedProfile:name,error:error.stack||String(error),pageState,checks,screenshots,sourceSHA256:beforeSource,executedHTTP,errors,missing},null,2)+'\n');throw error;
  }finally{await context.close();}
 }
 const afterSource=await sourceSnapshot();assert.deepEqual(afterSource,beforeSource,'Source files remain stable throughout browser verification');
 const report={suite:'jungle-world',passed:true,sourceStable:true,scope:'Desktop High and Chromium iPhone layout Medium. Native Mission11 UI entry without actor or camera assignments; production caches explicitly warmed with16paused render(0) calls. Separately labelled oblique aerial camera and one-frame geometric availability fixtures provide vegetation coverage without actor mutation. Actual WebGL2 output is verified; physical iPhone Safari and hardware FPS are untested.',checks,screenshots,sourceSHA256:beforeSource,executedHTTP,errors,missing,recordedAt:new Date().toISOString()};
 await fsp.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');return report;
};

if(require.main===module)(async()=>{
 const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs'),server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  await module.exports(browser,'http://127.0.0.1:'+server.address().port+'/',process.argv[2]||path.join(ROOT,'test-results'));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
