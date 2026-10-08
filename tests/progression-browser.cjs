'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
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
   await page.evaluate(esc=>App.start(MISSIONS.find(m=>esc?m.escape:m.id==='m1')),escape);
   await page.waitForFunction(()=>App.game?.st&&document.getElementById('loader').style.display==='none',null,{timeout:60000});
   await page.waitForFunction(()=>FIGIMG&&['nva','female_vc','militia','farmer','cow','vegetation'].every(n=>App.rend.textures['photo_'+n]),null,{timeout:30000});
   await page.evaluate(()=>{App.game.paused=true;App.screen='fixture';});await clearCards();
  };
  const advance=async seconds=>page.evaluate(sec=>{const G=App.game;G.paused=false;for(let i=0;i<sec*60;i++)G.update(1/60);G.paused=true;G.render(1/60);G.syncControls();},seconds);
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
   const descent=await page.evaluate(()=>{const G=App.game;let n=0;G.paused=false;while(G.phase==='chute'&&n++<4800)G.update(1/60);G.paused=true;G.render(1/60);G.syncControls();return {steps:n,phase:G.phase,ejected:G.ejected,out:G._outOfAircraft,held:!!G.evade?.held}});
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
   const anchors=await page.evaluate(()=>{
    const G=App.game,e=G.evade,x=e.p[0],z=e.p[2];e.hdg=0;e.hurt=false;e.look=0;
    e.locals=['farmer','vcFem','nva'].map((kind,i)=>({p:[x+(i-1)*2.3,0,z-7],goal:[x+(i-1)*2.3,0,z-6],home:[x,z],kind,armed:kind!=='farmer',alive:true,face:PI,seen:0,spd:0,ph:0}));
    const props=[{m:'palm',p:[x-9,terrainH(x-9,z-16),z-16],s:.55,y:0},{m:'bamboo',p:[x+9,terrainH(x+9,z-15),z-15],s:.7,y:0},{m:'tree',p:[x+14,terrainH(x+14,z-26),z-26],s:.65,y:0}];G.world.scenery.push(...props);
    G.setHour(12,.3);const calls=[],original=G.rend.drawSprites;
    G.rend.drawSprites=function(name,list){calls.push({name,list:list.map(s=>({...s,p:[...s.p]}))});return original.call(this,name,list)};
    try{G.render(1/60)}finally{G.rend.drawSprites=original}
    const check=[];for(const call of calls)for(const s of call.list){const nm=call.name==='people'?'people':call.name.slice(6),f=PHOTO_ATLAS[nm]?.frames[s.cell];if(!f)continue;
     const y=s.p[1]+f.bottom*s.h,ground=Math.max(0,terrainH(s.p[0],s.p[2]));
     if(Math.hypot(s.p[0]-x,s.p[2]-z)<30)check.push({name:nm,feet:y,ground,error:Math.abs(y-ground),visibleHeight:s.h*f.height});}
    return {near:check,types:[...new Set(G._sprites.map(s=>s.photoName).filter(Boolean))],glError:G.rend.gl.getError()};
   });
   assert.equal(anchors.glError,0);assert.ok(['farmer','female_vc','nva','vegetation'].every(n=>anchors.types.includes(n)));
   assert.ok(anchors.near.length>=4);assert.ok(['people','farmer','female_vc','vegetation'].every(n=>anchors.near.some(s=>s.name===n)));
   assert.ok(anchors.near.filter(s=>s.name!=='vegetation').every(s=>Math.abs(s.visibleHeight-1.76)<.01));
   // The small gait sway is horizontal; terrain under a footprint may slope slightly.
   assert.ok(anchors.near.every(s=>s.error<.15));record('Solid photographic crowd and grounded vegetation',anchors,'Existing NPC types and three existing vegetation props placed in front of camera; real draw-call instrumentation and WebGL');await page.evaluate(()=>document.getElementById('radio').innerHTML='');await shot('farmers-vc-nva-vegetation');
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
   await page.waitForFunction(()=>App.game?.pow?.stage==='cell',null,{timeout:10000});
   const prison=await page.evaluate(()=>({stage:App.game.pow?.stage,phase:App.game.phase,solidCount:App.game.pow?.solids.length,objects:App.game.pow?.objects.map(o=>o.id),checkpoint:Store.get('pow_checkpoint',null)?.stage}));
   assert.equal(prison.stage,'cell');assert.equal(prison.phase,'evade');assert.ok(prison.solidCount>20);assert.equal(prison.checkpoint,'cell');
   record('Mission11 parachute progression enters the physical prison chapter',prison,'Actual Mission11 ejection/descent; new playable chapter supersedes the former menu sequence');
   await shot('mission11-physical-cell');
   await page.evaluate(()=>{App.game=null;App.show('ready');App.renderReady();});
   // Regular flight capture now joins the same physical captivity system.
   await start(false);await ground();await page.evaluate(()=>App.game.captured());
   await page.waitForFunction(()=>App.game?.pow?.stage==='solitary',null,{timeout:10000});
   const confinement=await page.evaluate(()=>({captured:App.game._capt,stage:App.game.pow.stage,phase:App.game.phase,objects:App.game.pow.objects.map(o=>o.id),day:App.game.pow.day,captureYear:App.game.pow.captivity.captureYear,checkpoint:Store.get('pow_checkpoint',null)?.stage}));
   assert.equal(confinement.captured,1);assert.equal(confinement.stage,'solitary');assert.equal(confinement.phase,'evade');assert.equal(confinement.checkpoint,'solitary');assert.ok(confinement.objects.includes('cell-notebook'));
   record('Regular mission capture enters interactive solitary confinement',confinement,'Real flight capture callback; extended time/puzzles/release are covered by the captivity suite');
   await shot('captivity-physical-cell');
   assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);record('No uncaught JavaScript errors or missing runtime assets',{errors,badAssets},'Throughout progression');
  }finally{await ctx.close()}
 }
 return {scope:'Fixture-assisted real Chromium WebGL2 progression on desktop and emulated iPhone layout; no engine mocks. Not physical iPhone Safari or human completion of all historical missions.',results,physicalIPhoneTested:false};
};
