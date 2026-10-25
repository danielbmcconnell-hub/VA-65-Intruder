'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {waitCompletePhotographs,waitPOWVegetation}=require('./helpers/complete-photo-fixture.cjs');
// Actual application UI + fixed-step engine + WebGL. Fixtures place the aircraft
// over dry ground, accelerate clocks and isolate encounters; no Game methods or
// graphics calls are stubbed. This is not a human completion of every mission.
module.exports=async function progression(browser,target,evidenceDir){
 const results=[];
 for(const profile of [{name:'desktop',viewport:{width:1280,height:720}},
  {name:'iphone-layout-chromium',viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:3}]){
  const {name,...opts}=profile,ctx=await browser.newContext(opts),page=await ctx.newPage(),errors=[],badAssets=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\/assets\//.test(r.url()))badAssets.push(r.url())});
  await ctx.addInitScript(()=>{localStorage.setItem('a6_set',JSON.stringify({quality:0,sound:1,voices:0,mouse:0,seat:0,assist:1,sens:1}));localStorage.setItem('a6_sawkeys','1');});
  const record=(title,observed,fixture)=>{results.push({profile:name,name:title,passed:true,observed,fixture});console.log('PASS '+name+' '+title)};
  const shot=async key=>{await fs.mkdir(evidenceDir,{recursive:true});await page.screenshot({path:path.join(evidenceDir,name+'-'+key+'.png')})};
  const clearCards=async()=>page.evaluate(()=>{for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on');});
  const start=async escape=>{
   await page.evaluate(esc=>{if(window.__progressionNativeFrame&&App.frame!==window.__progressionNativeFrame){App.frame=window.__progressionNativeFrame;requestAnimationFrame(t=>App.frame(t));}App.start(MISSIONS.find(m=>esc?m.escape:m.id==='m1'));},escape);
   await page.waitForFunction(()=>App.game?.st&&document.getElementById('loader').style.display==='none',null,{timeout:60000});
   await page.evaluate(()=>{window.__progressionNativeFrame ||=App.frame;App.frame=()=>{};App.game.paused=false;App.screen='game';});
   await waitCompletePhotographs(page);await clearCards();
  };
  const advance=async seconds=>page.evaluate(sec=>{const G=App.game;G.paused=false;for(let i=0;i<sec*60;i++)G.update(1/60);G.paused=false;G.render(1/60);G.syncControls();},seconds);
  const click=async label=>page.locator('#captBody').getByRole('button',{name:label,exact:true}).click();
  const dryAircraft=async()=>page.evaluate(()=>{
   const G=App.game,W=G.world,t=W.briefed||W.tgtCenter;let p;
   for(let r=900;r<6000&&!p;r+=160)for(let a=0;a<TAU&&!p;a+=PI/8){const x=t[0]+Math.sin(a)*r,z=t[2]-Math.cos(a)*r,h=terrainH(x,z);
    if(h>8&&!G._localSolidAt(x,z,.5)&&Math.abs(terrainH(x+10,z-10)-h)<2)p=[x,h,z];}
   if(!p)throw Error('No dry terrain fixture');G.ac.p=[p[0],p[1]+110,p[2]];G.ac.v=[0,0,0];G.ac.onDeck=false;G.phase='airborne';G.render(1/60);return p;
  });
  const ground=async()=>{
   const p=await dryAircraft();
   await page.locator('#btnEject').dispatchEvent('click');await page.locator('#btnEject').dispatchEvent('click');
   assert.equal(await page.evaluate(()=>App.game.phase),'chute');await shot('parachute');
   const descent=await page.evaluate(()=>{const G=App.game;let n=0;G.paused=false;while(G.phase==='chute'&&n++<4800)G.update(1/60);G.paused=false;G.render(1/60);G.syncControls();return {steps:n,phase:G.phase,ejected:G.ejected,out:G._outOfAircraft,held:!!G.evade?.held}});
   assert.equal(descent.phase,'evade');assert.ok(descent.ejected&&descent.out);record('Ejection and real parachute descent',descent,'Aircraft positioned110m above dry terrain; real seat/canopy/descent simulation, UI two-tap eject');
   if(await page.locator('#captVeil.on').count()){
    await shot('survival-photo');
    const run=page.locator('#captBody').getByRole('button',{name:'Run',exact:true});
    if(await run.count())await run.click();else await click('Run for the treeline');
    await click('Go on');
   }
   await page.evaluate(()=>{const e=App.game.evade;e.searchers=[];e.locals=[];e.cattle=[];e.spawn=e.localRefill=e.cowT=1e9;delete e.doom;delete e.doomMax;App.game.wreck=null;});
   await clearCards();return p;
  };
  try{
   await page.goto(target,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.App);await shot('title');
   await page.click('#bootGo');assert.equal(await page.evaluate(()=>App.screen),'ready');await shot('ready-room');
   const audio=await page.evaluate(async()=>{const A=App.audio;if(!A.ctx)throw Error('Audio did not initialize from click');await A.ctx.resume();
    const analyser=A.ctx.createAnalyser();A.master.connect(analyser);A.burst('beep',.7);await new Promise(r=>setTimeout(r,90));
    const data=new Uint8Array(analyser.frequencyBinCount);analyser.getByteTimeDomainData(data);A.master.disconnect(analyser);
    return {state:A.ctx.state,signal:Math.max(...data.map(x=>Math.abs(x-128)))};});
   assert.equal(audio.state,'running');assert.ok(audio.signal>0);record('Audio activates from browser gesture and generates signal',audio,'Actual Web Audio analyser on the existing audio graph; not a subjective listening test');
   await start(false);await ground();
   const movement=await page.evaluate(()=>{const G=App.game,e=G.evade,b=e.p.slice();App.keys.KeyW=1;App.keys.KeyD=1;for(let i=0;i<60;i++){G.t+=1/60;G.stepEvade(1/60)}App.keys.KeyW=App.keys.KeyD=0;G.render(1/60);return {distance:Math.hypot(e.p[0]-b[0],e.p[2]-b[2]),heading:e.hdg}});
   assert.ok(movement.distance>.5);record('Ground movement and turning',movement,'Real keyboard inputs, one second simulation');
   // Place existing entity types together to inspect their actual photographic
   // sprites in the real terrain renderer, including a complete clean NVA figure.
   const anchors=await page.evaluate(async()=>{
    const G=App.game,R=G.rend,e=G.evade,x=e.p[0],z=e.p[2];e.hdg=0;e.hurt=false;e.look=0;
    e.locals=['farmer','vcFem','nva'].map((kind,i)=>({p:[x+(i-1)*2.3,0,z-7],goal:[x+(i-1)*2.3,0,z-6],home:[x,z],kind,armed:kind!=='farmer',alive:true,face:PI,seen:0,spd:0,ph:0}));
    const props=[{m:'palm',p:[x-9,terrainH(x-9,z-16),z-16],s:.55,y:0},{m:'bamboo',p:[x+9,terrainH(x+9,z-15),z-15],s:.7,y:0},{m:'tree',p:[x+14,terrainH(x+14,z-26),z-26],s:.65,y:0}];G.world.scenery.push(...props);
    G.setHour(12,.3);const calls=[],meshCalls=[],draw=R.drawSprites,mesh=R.drawMesh;
    R.drawSprites=function(name,list,...rest){calls.push({name,list:list.map(s=>({...s,p:[...s.p]}))});return draw.call(this,name,list,...rest)};
    R.drawMesh=function(name,data,count){if(['palm','bamboo','tree'].includes(name))for(let i=0;i<count;i++)meshCalls.push({kind:name,p:[data[i*20+12],data[i*20+13],data[i*20+14]]});return mesh.call(this,name,data,count)};
    try{G.render(1/60)}finally{R.drawSprites=draw;R.drawMesh=mesh}
    const metadata=PhotoCutouts.inspect(R),actors=await Promise.all(e.locals.map(async a=>{
     const call=calls.find(c=>c.list.some(s=>s.owner===a)),sprite=call?.list.find(s=>s.owner===a);
     if(!sprite)return {kind:a.kind,drawn:false};
     const record=metadata.records.find(r=>r.key===sprite.photoAsset);if(!record)throw Error('Missing complete source registration '+sprite.photoAsset);
     const im=new Image();im.src=record.url;await im.decode();const canvas=document.createElement('canvas');canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;
     const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;let opaque=0,transparent=0;
     for(let i=3;i<rgba.length;i+=4){if(rgba[i]>=250)opaque++;if(rgba[i]===0)transparent++;}
     const fraction=(sprite.photoBounds[3]-sprite.photoBounds[1])/sprite.photoHeight,bottom=1-sprite.photoBounds[3]/sprite.photoHeight;
     return {kind:a.kind,drawn:true,texture:call.name,asset:sprite.photoAsset,complete:sprite.photoCutout,cols:sprite.cols,rows:sprite.rows,cell:sprite.cell,
      source:record.url,imageWidth:im.naturalWidth,imageHeight:im.naturalHeight,registeredWidth:record.sourceWidth,registeredHeight:record.sourceHeight,
      visibleHeight:sprite.h*fraction,expectedHeight:1.76*record.heightRatio,renderedAspect:sprite.w/sprite.h,sourceAspect:sprite.photoWidth/sprite.photoHeight,
      feet:sprite.p[1]+bottom*sprite.h,ground:Math.max(0,terrainH(a.p[0],a.p[2])),opaque,transparent,live:R.gl.isTexture(R.textures[sprite.textureName]?.tex)};
    }));
    const botanicals=JungleScenery.inspect(G,R).plants,plants=props.map(prop=>{
     const same=q=>Math.hypot(q[0]-prop.p[0],q[2]-prop.p[2])<.004;
     const plant=botanicals.find(q=>same(q.groundRoot)),instance=meshCalls.find(q=>q.kind===prop.m&&same(q.p));
     const p=plant?.groundRoot||instance?.p;return {kind:prop.m,drawn:!!p,source:plant?'complete botanical photograph':'existing 3D foliage',p,ground:terrainH(prop.p[0],prop.p[2]),error:p?Math.abs(p[1]-terrainH(prop.p[0],prop.p[2])):null};
    });
    return {actors,plants,legacyPeopleUploaded:!!R.textures.people,glError:R.gl.getError()};
   });
   assert.equal(anchors.glError,0);assert.equal(anchors.legacyPeopleUploaded,false);assert.equal(anchors.actors.length,3);
   for(const [kind,subject] of [['farmer','farmer'],['vcFem','female_vc'],['nva','nva']]){
    const a=anchors.actors.find(a=>a.kind===kind);assert.ok(a?.drawn,kind+' complete photograph must reach the actual GPU draw pass');
    assert.equal(a.complete,true);assert.match(a.texture,/^photo_hr_/);assert.equal(a.asset,subject+':idle');assert.equal(a.cols,1);assert.equal(a.rows,1);assert.equal(a.cell,0);assert.equal(a.live,true);
    assert.equal(a.imageWidth,a.registeredWidth);assert.equal(a.imageHeight,a.registeredHeight);assert.ok(a.imageWidth>=1024&&a.imageHeight>=1024);
    assert.ok(Math.abs(a.visibleHeight-a.expectedHeight)<1e-8);assert.ok(Math.abs(a.renderedAspect-a.sourceAspect)<1e-8);assert.ok(Math.abs(a.feet-a.ground)<1e-7);
    assert.ok(a.opaque>10000&&a.transparent>1000);
   }
   assert.equal(anchors.plants.length,3);for(const p of anchors.plants){assert.equal(p.drawn,true,p.kind+' must reach the actual mesh or botanical renderer');assert.ok(p.error<.004,p.kind+' root must stay on the actual terrain');}
   record('Complete photographic crowd and grounded vegetation',anchors,'Declared farmer, female VC and NVA roster plus three foliage props. Actual production draw calls use complete 1x1 high-resolution figures, resident GPU textures, decoded source alpha and source-derived proportions/feet. Foliage may use its existing 3D mesh or the habitat-eligible botanical pass; both must reach rendering at actual terrain roots. Dedicated photographic/wildlife suites separately audit GPU silhouettes and mips.');await page.evaluate(()=>document.getElementById('radio').innerHTML='');await shot('farmers-vc-nva-vegetation');
   // Queued controls must survive a delayed simulation frame; no timed key pulses.
   for(const [id,mode] of [['btnKnife','knife'],['btnPistol','pistol'],['btnPunch','fists']]){
    await page.locator('#'+id).dispatchEvent('click');await page.waitForTimeout(180);await advance(.05);assert.equal(await page.evaluate(()=>App.game.evade.weaponMode),mode);
   }record('Queued weapon selections survive delayed frames',{delayMilliseconds:180},'Existing UI buttons then delayed real simulation');
   await page.evaluate(()=>{const e=App.game.evade;e.locals=[];e.searchers=[];});
   for(let i=0;i<3;i++){await page.locator('#btnRadio').dispatchEvent('click');await advance(1.3)}
   assert.equal(await page.evaluate(()=>App.game.evade.radio),1);
   await page.evaluate(()=>{const e=App.game.evade;e.rescue=e.eta*.56;});await page.locator('#btnSmoke').dispatchEvent('click');await page.waitForTimeout(200);await advance(.05);
   assert.ok(await page.evaluate(()=>!!App.game.evade.smoke));
   const pickup=await page.evaluate(()=>{
    const G=App.game,e=G.evade;e.searchers=[];e.locals=[];e.spawn=e.localRefill=e.cowT=1e9;
    // Retain actual helicopter approach/hover/hoist; accelerate elapsed rescue
    // clock to its arrival threshold and isolate ground fire for deterministic coverage.
    e.rescue=e.eta*.81;let n=0;while(G.evade&&n++<3600){G.t+=1/60;G._stepCSAR(1/60,e,App,0);G.world.fx.step(1/60)}
    G.render(1/60);return {steps:n,rescued:G.rescuedOK,phase:G.phase,jolly:e.jolly,smoke:e.smoke};
   });assert.ok(pickup.rescued);record('Radio, smoke, helicopter approach and hoist rescue',pickup,'Rescue clock accelerated and ground fire isolated; real CSAR engine');
   await page.waitForFunction(()=>document.getElementById('debriefVeil').classList.contains('on'),null,{timeout:10000});
   const photo=await page.locator('#debriefBody .bnfig img').evaluate(async im=>{await im.decode();return {src:im.getAttribute('src'),w:im.naturalWidth,h:im.naturalHeight,filter:getComputedStyle(im).filter,mask:getComputedStyle(im).maskImage}});
   assert.deepEqual(photo,{src:'assets/photos/standing-portrait.jpeg',w:864,h:1223,filter:'none',mask:'none'});await shot('recovered-debrief-photo');record('Clean standing debrief photograph',photo,'Actual SAR debrief after hoist rescue');
   await page.locator('#debriefBody').getByRole('button',{name:'Ready Room',exact:true}).click();await page.click('#tabs [data-tab="log"]');
   const log=(await page.locator('#readyBody').innerText()).toLowerCase();assert.ok(log.includes('recovered by sar'));record('Cruise Log after rescue',{hasSAR:log.includes('recovered by sar')},'Actual log UI with a stored sortie');await shot('cruise-log');
   // Mission11 now enters the physical POW chapter. Its full movement/guard/
   // river/captivity coverage is in the dedicated POW suites, not button replay.
   await start(true);await ground();
   await page.evaluate(()=>{const G=App.game;G.evade.doom=0;G.evade.doomMax=1;G.t+=1/60;G.stepEvade(1/60)});
   await page.evaluate(()=>{App.game.paused=false;for(let i=0;i<780;i++)App.game.update(1/60)});
   await page.waitForFunction(()=>App.game?.pow?.stage==='cell'&&!CaptureTransition.active(App.game),null,{timeout:10000});
   await page.evaluate(()=>App.game.render(0));await waitPOWVegetation(page);
   const prison=await page.evaluate(()=>({stage:App.game.pow?.stage,phase:App.game.phase,solidCount:App.game.pow?.solids.length,objects:App.game.pow?.objects.map(o=>o.id),checkpoint:Store.get('pow_checkpoint',null)?.stage}));
   assert.equal(prison.stage,'cell');assert.equal(prison.phase,'evade');assert.ok(prison.solidCount>20);assert.equal(prison.checkpoint,'cell');
   record('Mission11 parachute progression enters the physical prison chapter',prison,'Actual Mission11 ejection/descent; new playable chapter supersedes the former menu sequence');
   await shot('mission11-physical-cell');
   await page.evaluate(()=>{App.game=null;App.show('ready');App.renderReady();});
   // Regular flight capture now joins the same physical captivity system.
   await start(false);await ground();await page.evaluate(()=>{App.game.captured();App.game.paused=false;for(let i=0;i<780;i++)App.game.update(1/60)});
   await page.waitForFunction(()=>App.game?.pow?.stage==='solitary',null,{timeout:10000});
   const confinement=await page.evaluate(()=>({captured:App.game._capt,stage:App.game.pow.stage,phase:App.game.phase,objects:App.game.pow.objects.map(o=>o.id),day:App.game.pow.day,captureYear:App.game.pow.captivity.captureYear,checkpoint:Store.get('pow_checkpoint',null)?.stage}));
   assert.equal(confinement.captured,1);assert.equal(confinement.stage,'solitary');assert.equal(confinement.phase,'evade');assert.equal(confinement.checkpoint,'solitary');assert.ok(confinement.objects.includes('cell-notebook'));
   record('Regular mission capture enters interactive solitary confinement',confinement,'Real capture and thirteen seconds of original fixed-step transfer/reveal; extended time/puzzles/release are covered by the captivity suite');
   await shot('captivity-physical-cell');
   assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);record('No uncaught JavaScript errors or missing runtime assets',{errors,badAssets},'Throughout progression');
  }catch(error){await fs.mkdir(evidenceDir,{recursive:true});const state=await page.evaluate(()=>({screen:App.screen,game:!!App.game,phase:App.game?.phase,st:!!App.game?.st,pow:App.game?.pow?.stage,transition:App.game&&CaptureTransition.inspect(App.game)})).catch(()=>null);await fs.writeFile(path.join(evidenceDir,name+'-progression-failure.json'),JSON.stringify({passed:false,error:error.stack||String(error),results,state,errors,badAssets},null,2)+'\n');throw error}finally{await ctx.close()}
 }
 return {scope:'Fixture-assisted real Chromium WebGL2 progression on desktop and emulated iPhone layout; no engine mocks. Not physical iPhone Safari or human completion of all historical missions.',results,physicalIPhoneTested:false};
};
