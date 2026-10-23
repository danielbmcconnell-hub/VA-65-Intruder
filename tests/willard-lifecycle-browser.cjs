'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Targeted capture-transfer ownership regression, separate from the
// successful input-driven Willard combat sorties. Aircraft placement only
// shortens the original native ejection/descent; no POW/capture flag is set.
module.exports = async function willardLifecycle(browser, target, evidenceDir) {
  const out=path.join(evidenceDir,'willard-lifecycle');await fs.mkdir(out,{recursive:true});
  const results=[],screenshots=[];
  const profiles=[{name:'desktop',viewport:{width:1280,height:720}},
    {name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}]
    .filter(p=>!process.env.INTRUDER_WILLARD_PROFILE||p.name===process.env.INTRUDER_WILLARD_PROFILE);
  for(const profile of profiles){
    const {name,...options}=profile,context=await browser.newContext(options),page=await context.newPage(),errors=[];
    page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
    const click=locator=>profile.hasTouch?locator.tap():locator.click();
    await context.addInitScript(()=>{
      localStorage.setItem('a6_set',JSON.stringify({quality:0,sound:0,voices:0,seat:0,assist:1,mouse:0}));localStorage.setItem('a6_sawkeys','1');
      const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>window.__willardLifecycleClock?0:raf(t=>{if(!window.__willardLifecycleClock)cb(t);});
      window.__willardLifecycleInputs=[];for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>{window.__willardLifecycleInputs.push({type,target:event.target?.id||event.target?.tagName,trusted:event.isTrusted,pointer:event.pointerType||null,x:event.clientX,y:event.clientY});if(window.__willardLifecycleInputs.length>32)window.__willardLifecycleInputs.shift();},true);
    });
    const loaded=async(requireNewInstance=false)=>{await page.waitForFunction(requireNew=>App.game?.mis?.willard&&document.getElementById('loader').style.display==='none'&&(!requireNew||App.game!==window.__willardRetiredCapture),requireNewInstance,{polling:50});await page.evaluate(()=>{window.__willardLifecycleClock=true;for(const k of Object.keys(App.keys))App.keys[k]=0;for(const k of ['pitch','roll','commit','thrUp','thrDn'])App.gctl[k]=0;App.game.render(1/60);App.game.syncControls();});};
    const shot=async key=>{const file=name+'-'+key+'.png';await page.screenshot({path:path.join(out,file)});screenshots.push('willard-lifecycle/'+file);};
    const record=(title,passed,actual,fixture)=>{results.push({profile:name,name:title,passed,actual,fixture});console.log((passed?'PASS ':'FAIL ')+'Willard lifecycle '+name+' '+title+' '+JSON.stringify(actual));};
    const nativeGround=async()=>{
      const dry=await page.evaluate(()=>{
        const g=App.game,t=g.world.targets[0].p;let p;
        for(let r=900;r<6000&&!p;r+=160)for(let a=0;a<TAU&&!p;a+=PI/8){const x=t[0]+Math.sin(a)*r,z=t[2]-Math.cos(a)*r,h=terrainH(x,z);if(h>8&&!g._localSolidAt(x,z,.5)&&Math.abs(terrainH(x+10,z-10)-h)<2)p=[x,h,z];}
        if(!p)throw Error('No dry ejection fixture');g.ac.p=[p[0],p[1]+110,p[2]];g.ac.v=[0,0,0];g.render(1/60);g.syncControls();return p;
      });
      if(profile.hasTouch){await click(page.locator('#btnEject'));await click(page.locator('#btnEject'));}else await page.keyboard.press('j');
      assert.equal(await page.evaluate(()=>App.game.phase),'chute');
      const descent=await page.evaluate(()=>{const g=App.game;let frames=0;while(g.phase==='chute'&&frames++<4800)g.update(1/60);g.render(1/60);g.syncControls();return {phase:g.phase,frames,ejected:!!g.ejected,out:!!g._outOfAircraft};});
      assert.equal(descent.phase,'evade');assert.ok(descent.ejected&&descent.out);
      if(await page.locator('#captVeil.on').count()){
        await click(page.locator('#captBody').getByRole('button',{name:/^(Run|Run for the treeline)$/}));
        await click(page.locator('#captBody').getByRole('button',{name:'Go on',exact:true}));
      }
      await page.evaluate(()=>{for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on');App.game.render(1/60);App.game.syncControls();});
      return {dry,descent};
    };
    try{
      const response=await page.goto(target,{waitUntil:'domcontentloaded'});const sourceSHA256=createHash('sha256').update(await response.body()).digest('hex');
      console.log('Willard lifecycle '+name+' page loaded');
      await page.waitForFunction(()=>window.App&&window.WillardMission);await click(page.locator('#bootGo'));
      await click(page.locator('#readyBody .mcard').filter({hasText:/WILLARD EGRESS/i}));await page.locator('#willardStrike').uncheck();
      await page.evaluate(()=>{window.__willardLifecycleClock=true;});await click(page.locator('#willardPlay'));await loaded();
      console.log('Willard lifecycle '+name+' mission loaded');
      const earned=await page.evaluate(()=>{const g=App.game;for(let i=0;i<13*60;i++)g.update(1/60);g.render(1/60);g.syncControls();const saved=Store.get(WillardMission.KEY,null);return {phase:g.willard.phase,label:g.willard.checkpointLabel,valid:WillardMission.validCheckpoint(saved),alive:g.ac.alive};});
      assert.equal(earned.valid,true);assert.equal(earned.alive,true);
      console.log('Willard lifecycle '+name+' checkpoint earned');
      const ground=await nativeGround();
      console.log('Willard lifecycle '+name+' original ejection/descent complete');
      // Prepare the native retry before the capture transfer starts.
      await click(page.locator('#pauseBtn'));
      await page.locator('#willardPauseRetry').scrollIntoViewIfNeeded();
      const retryBox=await page.locator('#willardPauseRetry').boundingBox();assert.ok(retryBox&&retryBox.width>0&&retryBox.height>0);
      const retryPoint={x:retryBox.x+retryBox.width/2,y:retryBox.y+retryBox.height/2};
      const targetAtPoint=await page.evaluate(p=>({target:document.elementFromPoint(p.x,p.y)?.id||null,width:innerWidth,height:innerHeight}),retryPoint);
      assert.equal(targetAtPoint.target,'willardPauseRetry','The native retry tap must target the visible, scrolled button: '+JSON.stringify({retryBox,retryPoint,targetAtPoint}));
      const capture=await page.evaluate(()=>{const g=App.game;window.__willardRetiredCapture=g;window.__willardCaptureAt=Date.now();window.__willardPOWBefore=JSON.stringify(Store.get('pow_checkpoint',null));g.captured();return {at:window.__willardCaptureAt,startToken:App._missionStart,captured:!!g._capt,pending:!!g._capturePending,powAlreadyActive:!!g.pow};});
      assert.equal(capture.captured,true);assert.equal(capture.pending,true);assert.equal(capture.powAlreadyActive,false);
      if(profile.hasTouch)await page.touchscreen.tap(retryPoint.x,retryPoint.y);else await page.mouse.click(retryPoint.x,retryPoint.y);
      const requested=await page.evaluate(()=>({startToken:App._missionStart,ownerChanged:App.game!==window.__willardRetiredCapture,elapsed:Date.now()-window.__willardCaptureAt,inputs:window.__willardLifecycleInputs.slice(-8)}));
      assert.notEqual(requested.startToken,capture.startToken,'Native retry must initiate App.start: '+JSON.stringify({retryPoint,targetAtPoint,requested}));assert.equal(requested.ownerChanged,true);
      await loaded(true);
      const restarted=await page.evaluate(()=>({fresh:App.game!==window.__willardRetiredCapture,elapsed:Date.now()-window.__willardCaptureAt,alive:App.game.ac.alive,phase:App.game.willard.phase}));
      assert.equal(restarted.fresh,true);assert.equal(restarted.alive,true);
      await page.evaluate(()=>{for(let i=0;i<360;i++)window.__willardRetiredCapture.update(1/60);});
      await page.waitForTimeout(2300); // Also exclude any legacy delayed wall-clock handoff.
      const stale=await page.evaluate(()=>({sourceClock:Date.now()-window.__willardCaptureAt,
        freshGame:App.game!==window.__willardRetiredCapture,currentPOW:!!App.game.pow,retiredPOW:!!window.__willardRetiredCapture.pow,
        powClass:document.body.classList.contains('pow-active'),powHUDHidden:document.getElementById('powHUD').hidden,
        groundAudio:!!App.audio.groundMode,checkpointUnchanged:JSON.stringify(Store.get('pow_checkpoint',null))===window.__willardPOWBefore,
        checkpointStage:Store.get('pow_checkpoint',null)?.stage||null,alive:App.game.ac.alive,phase:App.game.willard.phase}));
      const coker=await page.evaluate(()=>{
        const active=App.game,retired=window.__willardRetiredCapture;
        const probe=()=>({retiredPOW:!!retired.pow,retiredStage:retired.pow?.stage||null,retiredEvade:!!retired.evade,currentPOW:!!App.game.pow,
          powClass:document.body.classList.contains('pow-active'),powHUDHidden:document.getElementById('powHUD').hidden,
          groundAudio:!!App.audio.groundMode,checkpoint:JSON.stringify(Store.get('pow_checkpoint',null))});
        const before=probe(),result=App.cokerCamp(retired),after=probe();
        return {returnedNothing:result===undefined,sameActiveGame:App.game===active,unchanged:JSON.stringify(before)===JSON.stringify(after),before,after};
      });
      await shot('retired-capture-after-native-retry');
      const stalePassed=stale.sourceClock>=2300&&stale.freshGame&&!stale.currentPOW&&!stale.retiredPOW&&!stale.powClass&&stale.powHUDHidden&&!stale.groundAudio&&stale.checkpointUnchanged&&stale.alive&&coker.returnedNothing&&coker.sameActiveGame&&coker.unchanged;
      record('Retired capture and Coker-camp entries cannot activate prison UI/audio or overwrite a checkpoint after native Willard retry',stalePassed,{sourceSHA256,earned,ground,capture,retryBox,retryPoint,targetAtPoint,requested,restarted,stale,coker},'Original native J/two-tap ejection and all original descent frames. The real pause menu is prepared and retry scrolled into view before a declared Game.captured entry-point fixture. A trusted native mouse/touch press replaces the Game. The retired Game receives six seconds of original updates, followed by a2.3-second real wait to exclude old wall-clock callbacks; App.cokerCamp is separately called with the retired Game. No capture/POW flag, chapter callback, result or save is assigned.');

      // One ordinary current-game frame also models how the flight loop would
      // heal stale DOM visibility; the save/audio/retired-state checks above
      // still expose the ownership defect even if that DOM symptom is brief.
      await page.evaluate(()=>{App.game.update(1/60);App.game.render(1/60);App.game.syncControls();});
      const positiveGround=await nativeGround();
      await page.evaluate(()=>{window.__willardCurrentCapture=App.game;window.__willardCurrentCaptureAt=Date.now();App.game.captured();});
      await page.evaluate(()=>{App.game.paused=false;for(let i=0;i<360;i++)App.game.update(1/60);});
      const positive=await page.evaluate(()=>{const g=App.game;g.render(1/60);g.syncControls();return {sameGame:g===window.__willardCurrentCapture,elapsed:Date.now()-window.__willardCurrentCaptureAt,captured:!!g._capt,stage:g.pow?.stage||null,solids:g.pow?.solids.length||0,objects:g.pow?.objects.length||0,powClass:document.body.classList.contains('pow-active'),powHUDHidden:document.getElementById('powHUD').hidden,savedStage:Store.get('pow_checkpoint',null)?.stage||null,groundAudio:!!App.audio.groundMode,gl:g.rend.gl.getError()};});
      await shot('current-capture-still-enters-solitary');
      const positivePassed=positive.sameGame&&positive.captured&&positive.stage==='solitary'&&positive.solids>0&&positive.objects>0&&positive.powClass&&!positive.powHUDHidden&&positive.savedStage==='solitary'&&positive.groundAudio&&positive.gl===0;
      record('A current-game capture transfer still enters playable solitary confinement',positivePassed,{ground:positiveGround,positive},'Second native ejection/descent from the live aircraft, followed by the production Game.captured entry point and six simulated seconds of original updates. The transition must create actual prison geometry, HUD, save and ground audio.');
      record('The targeted lifecycle paths emit no JavaScript errors',errors.length===0,{errors},'Actual original custom WebGL2 and unmodified capture/start/POW systems.');
    }finally{await context.close();}
  }
  const report={suite:'willard-lifecycle',passed:results.every(r=>r.passed),total:results.length,results,screenshots,
    actualIPhoneSafariTested:false,physicalWindowsTested:false,scope:'Targeted simulation-driven capture lifecycle after native Willard checkpoint retry, with declared ejection placement and original capture entry-point fixture. Not another full-sortie or natural enemy-capture claim.'};
  await fs.writeFile(path.join(out,'observations.json'),JSON.stringify(report,null,2)+'\n');
  await fs.writeFile(path.join(evidenceDir,'willard-lifecycle.json'),JSON.stringify(report,null,2)+'\n');
  assert.equal(report.passed,true,'Delayed capture lifecycle regression failed; complete observations were saved.');return report;
};

if(require.main===module){
  (async()=>{const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs');
    const arg=(name,fallback)=>process.argv.slice(2).find(x=>x.startsWith('--'+name+'='))?.split('=').slice(1).join('=')||fallback;
    const evidenceDir=path.resolve(arg('evidence','test-results/willard-lifecycle-development'));let server,browser;
    try{let target=arg('url','');if(!target){server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});target='http://127.0.0.1:'+server.address().port+'/';}
      browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
      const report=await module.exports(browser,target,evidenceDir);console.log(JSON.stringify(report,null,2));
    }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
  })().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
}
