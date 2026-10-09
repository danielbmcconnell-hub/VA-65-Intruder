'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async(browser,target,evidenceDir)=>{
 const results=[];
 for(const profile of [{name:'desktop',viewport:{width:1280,height:720}},{name:'iphone-layout-chromium',viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:3},{name:'iphone-portrait-chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3}]){
  const {name,...options}=profile,context=await browser.newContext(options),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(target,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.App);
   await page.click('#bootGo');await page.locator('#powChapter').getByRole('button',{name:'Historical photographs',exact:true}).click();
   for(const key of ['rollCall','coker','aerial','courtyard','interrogation','repatriation','denton','stockdale']){
    const label=await page.evaluate(key=>POWPhotos.historicalPhotoAssets[key].title.split(' — ')[0],key);
    const button=page.locator('#powHistory').getByRole('button',{name:label,exact:true});
    if(options.hasTouch)await button.tap();else await button.click();
    const observed=await page.evaluate(async key=>{
     const im=document.querySelector('#powHistory img');await im.decode();const style=getComputedStyle(im),box=im.getBoundingClientRect();
     return {src:im.getAttribute('src'),width:im.naturalWidth,height:im.naturalHeight,ratioError:Math.abs(box.width/box.height-im.naturalWidth/im.naturalHeight),fits:box.width<=innerWidth,opacity:style.opacity,filter:style.filter,fit:style.objectFit,caption:document.querySelector('#powHistory figcaption').textContent};
    },key);
    assert.ok(observed.width>100&&observed.height>100&&observed.fits);assert.ok(observed.ratioError<.015);assert.equal(observed.opacity,'1');assert.equal(observed.filter,'none');assert.equal(observed.fit,'contain');
    if(key==='coker'||key==='aerial')assert.match(observed.caption,/Interpretive estimated coloring/);
    if(key==='denton'||key==='stockdale'){
     assert.equal(observed.width,589);assert.equal(observed.height,key==='denton'?360:585);
     assert.match(observed.caption,/supplied color version is preserved unchanged/i);
     assert.match(observed.caption,/identified.*by the user/i);
    }
    results.push({profile:name,name:key+' unchanged photograph displays with native proportions',passed:true,observed});
    await page.locator('#powHistory img').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidenceDir,'pow-photo-'+name+'-'+key+'.png')});
   }
   await page.getByRole('button',{name:'Close history',exact:true}).click();assert.equal(await page.locator('#powHistory').count(),0);assert.deepEqual(errors,[]);
   results.push({profile:name,name:'History closes and Ready Room remains usable',passed:true,errors});
   await page.evaluate(()=>App.startPOW());
   await page.waitForFunction(()=>App.game?.pow&&document.getElementById('loader').style.display==='none',null,{timeout:90000});
   await page.evaluate(()=>{App.screen='game';POW.begin(App.game,'solitary');App.game.paused=false;POW.Captivity.open(App.game,'history')});
   const panel=page.locator('#pow-captivity');
   for(const [key,label] of [['denton','Jeremiah Denton photograph'],['stockdale','James Stockdale photograph']]){
    const prior=key==='stockdale';await page.evaluate(prior=>{App.game.paused=prior;App.keys.KeyW=1;App.game.pow.touchInteract=true},prior);
    if(options.hasTouch)await panel.getByRole('button',{name:label,exact:true}).tap();else await panel.getByRole('button',{name:label,exact:true}).click();
    const opened=await page.evaluate(async()=>{const im=document.querySelector('#powHistory img');await im.decode();return {asset:im.dataset.asset,paused:App.game.paused,key:App.keys.KeyW,touch:App.game.pow.touchInteract,time:App.game.pow.time,p:App.game.evade.p.slice(),minute:App.game.pow.captivity.minute}});
    assert.equal(opened.asset,key);assert.equal(opened.paused,true);assert.equal(opened.key,0);assert.equal(opened.touch,false);
    await page.evaluate(()=>new Promise(resolve=>{let frames=0;const step=()=>++frames===5?resolve():requestAnimationFrame(step);requestAnimationFrame(step)}));
    const frozen=await page.evaluate(()=>({time:App.game.pow.time,p:App.game.evade.p.slice(),minute:App.game.pow.captivity.minute}));
    assert.deepEqual(frozen,{time:opened.time,p:opened.p,minute:opened.minute});
    if(key==='denton')await page.keyboard.press('Escape');else await page.getByRole('button',{name:'Close history',exact:true}).click();
    const closed=await page.evaluate(()=>({viewer:!!document.getElementById('powHistory'),paused:App.game.paused,pauseOverlay:document.getElementById('pauseVeil').classList.contains('on'),tab:App.game.pow.captivity.tab,open:App.game.pow.captivity.open,gpuError:App.game.rend.gl.getError()}));
    assert.equal(closed.viewer,false);assert.equal(closed.paused,prior);assert.equal(closed.pauseOverlay,false);assert.equal(closed.tab,'history');assert.equal(closed.open,true);assert.equal(closed.gpuError,0);
    results.push({profile:name,name:key+' captivity link pauses safely and restores prior state',passed:true,observed:{opened,closed}});
   }
   assert.deepEqual(errors,[]);
  }finally{await context.close()}
 }
 return {scope:'Actual Chromium image decoding and native aspect rendering on desktop and touch layout; no physical iPhone Safari claim',results,physicalIPhoneTested:false};
};
