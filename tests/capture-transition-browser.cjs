'use strict';
// The dry-ground location and first-contact militia are declared scene fixtures.
// Native surrender/continue/pause controls call original Game/POW methods.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto'),root=path.resolve(__dirname,'..');
module.exports=async function(browser,target,evidenceDir){
  const out=path.join(evidenceDir,'capture-transition');await fs.mkdir(out,{recursive:true});
  const checks=[],screenshots=[],browserErrors=[],missing=[],sourceHashes=[],executedModules=[],sourceJobs=[];
  for(const profile of [{name:'desktop',viewport:{width:1280,height:720}},{name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}]){
    const {name,...options}=profile,context=await browser.newContext(options),page=await context.newPage();
    page.on('pageerror',e=>browserErrors.push({layout:name,message:e.message}));
    page.on('response',response=>{if(!response.url().startsWith(target))return;if(response.status()>=400)missing.push(response.url());const file=new URL(response.url()).pathname.replace(/^\//,'');if(file.endsWith('.js'))sourceJobs.push(response.body().then(bytes=>executedModules.push({layout:name,file,sha256:createHash('sha256').update(bytes).digest('hex')})).catch(error=>browserErrors.push({layout:name,message:'Source body: '+error.message})));});
    const click=node=>options.hasTouch?node.tap():node.click();
    const tick=seconds=>page.evaluate(seconds=>{for(let t=0;t<seconds-1e-6;t+=.05)App.game.update(Math.min(.05,seconds-t));App.game.render(0);App.game.syncControls();},seconds);
    const state=()=>page.evaluate(()=>{const g=App.game,s=CaptureTransition.inspect(g),node=document.getElementById('captureTransition');return {phase:g.phase,pow:g.pow?.stage||null,transition:s,p:g.evade?.p.slice(),eye:g.rend.eye.slice(),sameActor:g.evade===window.__captureActor,paused:g.paused,visible:!!node,title:node?.querySelector('h2')?.textContent,gl:g.rend.gl.getError(),recaptures:g.pow?.flags.recaptures||0}});
    const record=(label,actual)=>{checks.push({layout:name,name:label,passed:true,actual});console.log('PASS capture '+name+' '+label);};
    const shot=async label=>{const file=name+'-'+label+'.png';await page.screenshot({path:path.join(out,file)});screenshots.push('capture-transition/'+file);};
    try{
      await page.addInitScript(()=>{localStorage.setItem('a6_set',JSON.stringify({quality:0,sound:0,voices:0,mouse:0,seat:0,assist:1,sens:1}));localStorage.setItem('a6_sawkeys','1');});
      const response=await page.goto(target,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);sourceHashes.push({layout:name,indexSHA256:createHash('sha256').update(await response.body()).digest('hex')});await click(page.locator('#bootFly'));
      await page.waitForFunction(()=>App.game&&document.getElementById('loader').style.display==='none',null,{timeout:90000});
      const original=await page.evaluate(()=>{
        App.frame=()=>{};const g=App.game,t=g.world.briefed||g.world.tgtCenter;let p;
        for(let r=900;r<6000&&!p;r+=160)for(let a=0;a<TAU&&!p;a+=PI/8){const x=t[0]+Math.sin(a)*r,z=t[2]-Math.cos(a)*r,h=terrainH(x,z);if(h>8&&!g._localSolidAt(x,z,.5)&&Math.abs(terrainH(x+10,z-10)-h)<2)p=[x,h,z];}
        if(!p)throw Error('No dry ground fixture');g._startGroundPhase(p[0],p[2],0,'chute');const e=g.evade;e.searchers=[];e.locals=[];e.cattle=[];e.spawn=e.localRefill=e.cowT=1e9;e.held=0;g.wreck=null;
        App.screen='game';g.paused=false;for(const k of Object.keys(App.keys))App.keys[k]=false;App.gctl.pitch=App.gctl.roll=0;for(const id of ['teach','teachPeek','legend','captVeil'])document.getElementById(id)?.classList.remove('on');g.render(0);g.syncControls();window.__captureActor=e;
        App.firstContact(g,'militia',35,res=>g.applyFirstContact(res));return {p:e.p.slice(),eye:g.rend.eye.slice(),version:g.rend.gl.getParameter(g.rend.gl.VERSION)};
      });
      await click(page.locator('#captBody').getByRole('button',{name:'Hands up',exact:true}));await click(page.locator('#captBody').getByRole('button',{name:'Go on',exact:true}));
      await tick(.3);const taken=await state();assert.equal(taken.phase,'evade');assert.equal(taken.pow,null);assert.equal(taken.sameActor,true);assert.equal(taken.transition.stage,'taken');assert.deepEqual(taken.p,original.p);assert.deepEqual(taken.eye,original.eye);assert.equal(taken.gl,0);assert.equal(await page.locator('#captureTransition button').isVisible(),false);assert.equal(await page.locator('#radio').isVisible(),false);assert.equal(await page.locator('#flightCoach').isVisible(),false);await shot('01-captured-ground-view');record('Native surrender keeps the original ground actor and camera while capture fades in',{original,taken});
      await click(page.locator('#pauseBtn'));const paused=await state();assert.equal(paused.paused,true);
      await page.waitForTimeout(1900);await tick(4);const held=await state();assert.equal(held.transition.age,paused.transition.age);assert.equal(held.pow,null);assert.deepEqual(held.eye,paused.eye);
      await page.evaluate(()=>App.pause(false));record('Native pause retains ground view and does not permit a wall-clock prison jump',{paused,held});
      await tick(1.9);const transfer=await state();assert.equal(transfer.title,'Under guard');assert.equal(transfer.sameActor,true);assert.equal(transfer.pow,null);await shot('02-under-guard');record('The transfer beat clearly bridges the capture and prison',{transfer});
      if(options.hasTouch){await click(page.locator('#captureTransition button'));await tick(.1);}else await tick(2.65);
      const arriving=await state();assert.equal(arriving.pow,'solitary');assert.equal(arriving.transition.arriving,true);assert.equal(arriving.sameActor,false);await tick(1);const cell=await state();assert.equal(cell.visible,false);assert.equal(cell.phase,'evade');assert.equal(cell.pow,'solitary');assert.equal(cell.gl,0);await shot('03-prison-after-fade');record('The actual prison appears beneath black and reveals smoothly; phone Continue works',{arriving,cell});
      const river=await page.evaluate(()=>{const g=App.game;POW.begin(g,'river');window.__captureActor=g.evade;const count=g.pow.flags.recaptures||0;g.captured();g.captured();g.render(0);return {count,now:g.pow.flags.recaptures,stage:g.pow.stage,transition:CaptureTransition.inspect(g),p:g.evade.p.slice()};});
      assert.equal(river.now,river.count+1);assert.equal(river.stage,'river');assert.equal(river.transition.recapture,true);await tick(2);const recapture=await state();assert.equal(recapture.sameActor,true);assert.deepEqual(recapture.p,river.p);await shot('04-river-recapture-transfer');await tick(4);const returned=await state();assert.equal(returned.pow,'solitary');assert.equal(returned.visible,false);assert.equal(returned.recaptures,river.now);record('River recapture retains its ground view, transfers once, and preserves its count',{river,recapture,returned});
      assert.deepEqual(browserErrors.filter(e=>e.layout===name),[]);
    }finally{await Promise.all(sourceJobs);await context.close();}
  }
  const indexSHA256=createHash('sha256').update(await fs.readFile(path.join(root,'index.html'))).digest('hex'),moduleSHA256={};
  for(const executed of sourceHashes)assert.equal(executed.indexSHA256,indexSHA256,'Executed index changed during capture verification');
  for(const executed of executedModules){if(!moduleSHA256[executed.file])moduleSHA256[executed.file]=createHash('sha256').update(await fs.readFile(path.join(root,executed.file))).digest('hex');assert.equal(executed.sha256,moduleSHA256[executed.file],'Executed module changed: '+executed.file);}
  assert.deepEqual(browserErrors,[]);assert.deepEqual(missing,[]);assert.ok(executedModules.some(row=>row.file==='assets/survival/capture-transition.js'));
  return {suite:'capture-transition',passed:true,sourceStable:true,sourceHashes,moduleSHA256,executedModules,checks,screenshots,browserErrors,missing,scope:'Actual custom WebGL2 Chromium/SwiftShader desktop and iPhone-size landscape. Declared isolated dry-ground/militia and river entry fixtures, native surrender/pause/Continue controls, original capture/POW methods and simulation-driven fades. Does not claim natural enemy capture or physical iPhone Safari.'};
};
if(require.main===module)(async()=>{const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs');const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const evidence=process.argv[2]||path.resolve('test-results');const report=await module.exports(browser,'http://127.0.0.1:'+server.address().port+'/',evidence);await fs.writeFile(path.join(evidence,'capture-transition.json'),JSON.stringify(report,null,2)+'\n');}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
