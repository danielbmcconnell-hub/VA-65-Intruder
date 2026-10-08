'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async(browser,target,evidenceDir)=>{
 const results=[];
 for(const profile of [{name:'desktop',viewport:{width:1280,height:720}},{name:'iphone-layout-chromium',viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:3}]){
  const {name,...options}=profile,context=await browser.newContext(options),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(target,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.App);
   await page.click('#bootGo');await page.locator('#powChapter').getByRole('button',{name:'Historical photographs',exact:true}).click();
   for(const key of ['rollCall','coker','aerial','courtyard','interrogation','repatriation']){
    const observed=await page.evaluate(async key=>{
     const item=POWPhotos.historicalPhotoAssets[key];const buttons=[...document.querySelectorAll('#powHistory button')];buttons.find(b=>b.textContent===item.title.split(' — ')[0]).click();
     const im=document.querySelector('#powHistory img');await im.decode();const style=getComputedStyle(im),box=im.getBoundingClientRect();
     return {src:im.getAttribute('src'),width:im.naturalWidth,height:im.naturalHeight,ratioError:Math.abs(box.width/box.height-im.naturalWidth/im.naturalHeight),fits:box.width<=innerWidth,opacity:style.opacity,filter:style.filter,fit:style.objectFit,caption:document.querySelector('#powHistory figcaption').textContent};
    },key);
    assert.ok(observed.width>100&&observed.height>100&&observed.fits);assert.ok(observed.ratioError<.015);assert.equal(observed.opacity,'1');assert.equal(observed.filter,'none');assert.equal(observed.fit,'contain');
    if(key==='coker'||key==='aerial')assert.match(observed.caption,/Interpretive estimated coloring/);
    results.push({profile:name,name:key+' unchanged WebP displays with native proportions',passed:true,observed});
    await page.locator('#powHistory img').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidenceDir,'pow-photo-'+name+'-'+key+'.png')});
   }
   await page.getByRole('button',{name:'Close history',exact:true}).click();assert.equal(await page.locator('#powHistory').count(),0);assert.deepEqual(errors,[]);
   results.push({profile:name,name:'History closes and Ready Room remains usable',passed:true,errors});
  }finally{await context.close()}
 }
 return {scope:'Actual Chromium image decoding and native aspect rendering on desktop and touch layout; no physical iPhone Safari claim',results,physicalIPhoneTested:false};
};
