'use strict';
// Release verification: serve only the generated deployment folder, verify all
// packaged bytes over HTTP, then launch a real flight in both browser layouts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),site=path.join(root,'dist/site');
const {chromium}=require(path.join(root,'node_modules/playwright'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 let relative;try{relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);res.end();return}
 const file=path.resolve(site,'.'+relative+(relative.endsWith('/')?'index.html':'')),rel=path.relative(site,file);
 if(rel.startsWith('..')||path.isAbsolute(rel)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const target='http://127.0.0.1:'+server.address().port+'/';let browser;
 const checks=[];
 try{
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/build-manifest.json')));
  for(const item of manifest.files){const response=await fetch(target+item.file);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),mime[path.extname(item.file)]||'text/plain');const bytes=Buffer.from(await response.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256)}
  checks.push({name:'All '+manifest.files.length+' packaged runtime files served with exact hashes',passed:true});
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const profile of [{name:'desktop',viewport:{width:1280,height:720}},{name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}]){
   const {name,...opts}=profile,ctx=await browser.newContext(opts),page=await ctx.newPage(),errors=[],missing=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(target))missing.push(r.url())});
   await ctx.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>window.__packagedFixedClock?0:raf(t=>{if(!window.__packagedFixedClock)cb(t)})});
   await page.goto(target,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.App);await page.click('#bootGo');await page.locator('#readyBody .mcard').first().click();await page.getByRole('button',{name:'Man Aircraft',exact:true}).click();
   await page.waitForFunction(()=>App.game&&document.getElementById('loader').style.display==='none',null,{timeout:60000});
   await page.waitForFunction(()=>FIGIMG&&['aviator','cow','farmer','female_vc','militia','nva','vegetation'].every(n=>App.rend.textures['photo_'+n]),null,{timeout:30000});
   // Drive original flight explicitly below. Unattended live frames during
   // slow software-GPU UI assertions can crash the pilot-seat aircraft or
   // open a timed teaching overlay between visibility and geometry reads.
   await page.evaluate(()=>{window.__packagedFixedClock=true;App.game.paused=true;App.screen='build-test';for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on')});
   const cdp=opts.hasTouch?await ctx.newCDPSession(page):null;
   if(cdp){const b=await page.locator('#pickle').boundingBox();assert.ok(b);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});assert.equal(await page.evaluate(()=>App.gctl.commit),1)}else await page.keyboard.down('Space');
   const observed=await page.evaluate(()=>{const G=App.game;G.paused=false;for(let i=0;i<240;i++)G.update(1/60);G.paused=true;G.render(1/60);G.syncControls();return {mission:G.mis.id,quality:App.set.quality,shadowSize:G.rend.shadowSize,alive:G.ac.alive,onDeck:G.ac.onDeck,phase:G.phase,finite:[...G.ac.p,...G.ac.v].every(Number.isFinite),gpuError:G.rend.gl.getError(),webgl:G.rend.gl.getParameter(G.rend.gl.VERSION)}});
   if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('Space');
   assert.ok(observed.alive&&observed.finite&&!observed.onDeck);assert.equal(observed.gpuError,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   observed.photosDecoded=await page.evaluate(async()=>{const sources=[IMG_HERO,IMG_PHOTO,IMG_BN_STAND,IMG_BN_CROUCH,IMG_TIGER,FIG_SRC,...Object.values(PHOTOS).map(p=>p.s)];for(const src of sources){const im=new Image();im.src=src;await im.decode();if(!(im.naturalWidth>0&&im.naturalHeight>0))throw Error('Invalid photograph '+src)}return sources.length});assert.equal(observed.photosDecoded,18);
   assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   await page.locator('#teach').dispatchEvent('click');
   await page.evaluate(()=>{App.screen='game';App.game.paused=false;FlightCoach.tick(App.game,0)});
   const toggle=page.locator('[data-flight-coach-toggle]');await toggle.waitFor({state:'visible'});
   assert.equal(await toggle.getAttribute('aria-pressed'),'false');const before=await toggle.boundingBox();
   if(opts.hasTouch)await toggle.tap();else await toggle.click();
   await page.waitForFunction(()=>FlightCoach.enabled(App.game)&&!document.getElementById('flightCoachCue').hidden,null,{timeout:30000});
   const after=await toggle.boundingBox();assert.ok(before&&after);assert.ok(Math.abs(before.x-after.x)<.5&&Math.abs(before.width-after.width)<.5,'Visible cue must not shift the native toggle');
   if(opts.hasTouch)await toggle.tap();else await toggle.click();
   assert.equal(await toggle.getAttribute('aria-pressed'),'false');assert.equal(await page.evaluate(()=>FlightCoach.enabled(App.game)),false);
   const m24=await page.evaluate(()=>({ammunition:!!window.SurvivalAmmunition,board:!!window.FlightStrikeBoard,effects:!!window.FlightStrikeEffects,sortie:!!window.FlightSortieCheckpoint}));
   assert.ok(Object.values(m24).every(Boolean),'All new production modules must load from the exact package');
   await page.evaluate(()=>{App.screen='game';App.game.paused=false;FlightStrikeBoard.render(App.game)});
   const boardToggle=page.locator('#flightStrikeBoardToggle');await boardToggle.waitFor({state:'visible'});
   if(opts.hasTouch)await boardToggle.tap();else await boardToggle.click();
   await page.locator('#flightStrikePanel').waitFor({state:'visible'});
   const panel=await page.locator('#flightStrikePanel').boundingBox();assert.ok(panel);
   if(opts.hasTouch){for(const id of ['stick','pickle','btnScope','btnGear','pauseBtn']){const control=await page.locator('#'+id).boundingBox();assert.ok(control,'Packaged flight control must be visible: '+id);assert.ok(panel.x+panel.width<=control.x||control.x+control.width<=panel.x||panel.y+panel.height<=control.y||control.y+control.height<=panel.y,'Packaged worksheet must not cover '+id);}}
   if(opts.hasTouch)await boardToggle.tap();else await boardToggle.click();
   assert.equal(await page.locator('#flightStrikePanel').isVisible(),false);
   checks.push({name:name+' packaged B/N worksheet opens through native input and keeps flight controls exposed',passed:true,observed:{modules:m24,panel},errors,missing});
   await page.evaluate(()=>{App.game.paused=true;App.screen='build-test';App.game.render(1/60)});
   checks.push({name:name+' packaged flight guidance toggles through native input without moving its target',passed:true,observed:{before,after},errors,missing});
   console.log('PASS '+name+' exact packaged native guidance toggle and stable target');
   await page.locator('#teach').dispatchEvent('click');await page.screenshot({path:path.join(root,'test-results','build-'+name+'-flight.png'),timeout:90000});
   checks.push({name:name+' packaged flight launches and renders with fresh default settings',passed:true,observed,errors,missing});console.log('PASS '+name+' packaged flight: default quality '+observed.quality+', '+observed.photosDecoded+' images decoded');
   // Resume the native scheduler for the real chapter's queued startup.
   await page.evaluate(()=>{window.__packagedFixedClock=false;App.show('ready');requestAnimationFrame(t=>App.frame(t))});
   await page.locator('#powChapter [data-pow-chapter="escape"]').click();
   await page.waitForFunction(()=>App.game?.pow?.stage==='cell'&&document.getElementById('loader').style.display==='none',null,{timeout:90000});
   const pow=await page.evaluate(async()=>{
     const G=App.game;G.paused=true;G.render(1/60);
     const snapshot=POW.save(G);POW.begin(G,'cell',snapshot);G.paused=true;G.render(1/60);
     let historicalPhotos=0;
     for(const item of Object.values(POWPhotos.historicalPhotoAssets)){const im=new Image();im.src=item.src;await im.decode();if(!im.naturalWidth)throw Error('Invalid historical photograph '+item.src);historicalPhotos++;}
     return {stage:G.pow.stage,solids:G.pow.solids.length,checkpoint:Store.get('pow_checkpoint',null)?.stage,savedSortie:snapshot.sortie?.missionId,restoredSortie:G.mis.id,ammunition:snapshot.ammunition,historicalPhotos,riverLoaded:!!POW.River,captivityLoaded:!!POW.Captivity,m21Loaded:['Solidarity','DentonFlashback','Mindscape','RegularConfinement'].every(name=>!!POW[name]),m22Loaded:!!POW.Guidance&&!!POW.Feedback&&!!window.FlightCoach,m23Loaded:!!window.EpisodeGLSL&&['EpisodeScene','EpisodeStealth','EpisodeActions','EpisodeAudio','FigureMotion','MemoryDetail'].every(name=>!!POW[name]),m23Scene:G.pow.episodeScene?.version,m23Pebbles:G.pow.episodeStealth?.pileRemaining,guidanceChapter:POW.Guidance.state(G).chapter,gpuError:G.rend.gl.getError(),cameraHeight:G.rend.eye[1]-G.evade.p[1]};
   });
   assert.equal(pow.stage,'cell');assert.ok(pow.solids>20&&pow.riverLoaded&&pow.captivityLoaded&&pow.m21Loaded&&pow.m22Loaded&&pow.m23Loaded);assert.equal(pow.m23Scene,1);assert.equal(pow.m23Pebbles,3);assert.equal(pow.guidanceChapter,'escape');assert.equal(pow.checkpoint,'cell');assert.equal(pow.historicalPhotos,8);assert.equal(pow.gpuError,0);assert.ok(Math.abs(pow.cameraHeight-1.68)<.01);
   assert.equal(pow.savedSortie,'m11');assert.equal(pow.restoredSortie,'m11');assert.equal(pow.ammunition.version,1);assert.equal(pow.ammunition.bulletsExpended,0);
   const refinement=await page.evaluate(()=>{const R=App.rend;return {title:document.title,modules:[!!window.SpriteLayers,!!window.ContactShadows,!!window.QualityPolicy,!!window.GroundView,!!window.EquipmentView,!!window.GroundCombat,!!window.TerrainShadows,!!window.NearGround],layers:['people','photo_vegetation'].map(n=>{const t=R.textures[n];return {name:n,layers:t.layers,width:t.width,height:t.height,array:R.gl.isTexture(t.arrayTex),proxy:R.gl.isTexture(t.tex)}}),arrays:SpriteLayers.inspect(R.gl),ground:GroundView.view(App.game),policy:QualityPolicy.inspect(App)}});
   assert.ok(refinement.title.includes('B/N Immersion & Visual Polish'));assert.ok(refinement.modules.every(Boolean));assert.deepEqual(refinement.layers.map(t=>t.layers),[72,48]);assert.ok(refinement.layers.every(t=>t.array&&t.proxy));assert.equal(refinement.arrays.liveArrays,2);assert.equal(refinement.arrays.bytes,40893696);assert.equal(refinement.arrays.failures,0);assert.equal(refinement.ground.height,1.68);assert.equal(refinement.policy.requested,opts.hasTouch?1:2);
   checks.push({name:name+' packaged native-resolution photographic arrays and ground/policy modules use complete GPU resources',passed:true,observed:refinement});
   assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   await page.screenshot({path:path.join(root,'test-results','build-'+name+'-pow.png'),timeout:90000});
   checks.push({name:name+' packaged Ready Room prison entry, tutorial, checkpoint and historical photographs',passed:true,observed:pow,errors,missing});console.log('PASS '+name+' packaged POW chapter, new guidance modules and eight historical photographs');
   // Launch through the released menu, then advance only original production
   // physics to the naturally spawned interceptor. No aircraft/enemy placement
   // or mission-phase mutation is used in this packaged integration smoke.
   await page.evaluate(()=>{App.game.paused=true;App.show('ready')});
   const willardCard=page.locator('#readyBody .mcard[data-mission="willard"]');assert.equal(await willardCard.count(),1);
   if(opts.hasTouch)await willardCard.tap();else await willardCard.click();
   await page.locator('#willardStrike').uncheck();
   assert.equal(await page.locator('#flightNightVisibility').count(),1,'Packaged night-visibility control must be available in the briefing');
   await page.evaluate(()=>{window.__packagedFixedClock=true});
   if(opts.hasTouch)await page.locator('#willardPlay').tap();else await page.locator('#willardPlay').click();
   await page.waitForFunction(()=>App.game?.mis?.id==='willard'&&document.getElementById('loader').style.display==='none',null,{polling:50,timeout:90000});
   await page.evaluate(()=>{App.screen='build-test';App.game.paused=true});
   await page.evaluate(async()=>{await WillardSprites.load(App.rend);const g=App.game;g.paused=false;for(let i=0;i<13*60&&g.ac.alive&&!g.result;i++)g.update(1/60);g.render(1/60);g.syncControls();App.screen='game';WillardPresentation.render(g)});
   if(opts.hasTouch)await page.locator('#willardRear').tap();else await page.locator('#willardRear').click();
   const willard=await page.evaluate(()=>{const g=App.game;g.paused=true;g.render(1/60);return {mission:g.mis.id,alive:g.ac.alive,phase:g.willard.phase,rear:g.willard.rear,rightSeat:g.rightSeat,checkpointValid:WillardMission.validCheckpoint(Store.get(WillardMission.KEY,null)),artwork:WillardSprites.inspect(g.rend),immersion:{nightContrast:g.rend.atm.nightContrast,meshes:['bnRouteFactory','bnRouteBridge','bnRouteRail'].every(n=>!!g.rend.meshes[n]),chart:!!FlightStrikeBoard.chart(g),rasterCPU:g.hud.radar.ctx.getContextAttributes().willReadFrequently},gpuError:g.rend.gl.getError()}});
   assert.equal(willard.mission,'willard');assert.equal(willard.alive,true);assert.equal(willard.rightSeat,false);assert.equal(willard.rear,true);assert.ok(['contact','defend'].includes(willard.phase));assert.equal(willard.checkpointValid,true);assert.equal(willard.artwork.status,'ready');assert.equal(willard.artwork.uploads,1);assert.ok(willard.artwork.draws>0);assert.equal(willard.artwork.last.visible,true);assert.equal(willard.gpuError,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   await page.screenshot({path:path.join(root,'test-results','build-'+name+'-willard.png'),timeout:90000});
   assert.deepEqual(willard.immersion,{nightContrast:1,meshes:true,chart:true,rasterCPU:true});
   checks.push({name:name+' packaged Willard mission launches through native input and renders the supplied world-space interceptor',passed:true,observed:willard,errors,missing});console.log('PASS '+name+' packaged Willard native PLAY, original flight, checkpoint and actual GPU atlas');
   await page.evaluate(()=>{App.game.paused=true;App.show('ready')});
   if(opts.hasTouch)await page.locator('#dixieReady').tap();else await page.locator('#dixieReady').click();
   if(opts.hasTouch)await page.locator('#dixiePractice').tap();else await page.locator('#dixiePractice').click();
   await page.waitForFunction(()=>App.game?.mis?.id==='m2'&&!!App.game.strikeExperience&&document.getElementById('loader').style.display==='none',null,{polling:50,timeout:90000});
   await page.evaluate(()=>{const g=App.game;g.update(1/60);g.render(1/60);g.syncControls()});
   const tacticalBefore=await page.evaluate(()=>({p:App.game.ac.p.slice(),fixes:App.game.world.nav.fixes,score:{...App.game.world.score}}));
   if(opts.hasTouch)await page.locator('#dixieApproach').tap();else await page.locator('#dixieApproach').click();
   if(opts.hasTouch)await page.locator('#dixieRouteTerrain').tap();else await page.locator('#dixieRouteTerrain').click();
   const tactical=await page.evaluate(()=>({route:FlightTacticalApproach.inspect(App.game),materials:typeof FlightVisualMaterials.glsl==='string',feedback:FlightAirframeFeedback.view(App.game),p:App.game.ac.p.slice(),clearance:App.game.apAGL,fixes:App.game.world.nav.fixes,score:{...App.game.world.score},focus:document.activeElement?.id}));
   assert.equal(tactical.route.choice,'terrain');assert.equal(tactical.route.following,true);assert.equal(tactical.clearance,320);assert.ok(tactical.materials&&tactical.feedback.active);assert.deepEqual(tactical.p,tacticalBefore.p);assert.equal(tactical.fixes,tacticalBefore.fixes);assert.deepEqual(tactical.score,tacticalBefore.score);assert.notEqual(tactical.focus,'dixieRouteTerrain');
   if(opts.hasTouch)await page.locator('#dixieApproach').tap();else await page.locator('#dixieApproach').click();
   if(opts.hasTouch)await page.locator('#dixieRouteFree').tap();else await page.locator('#dixieRouteFree').click();
   assert.equal(await page.evaluate(()=>FlightTacticalApproach.inspect(App.game).following),false);
   checks.push({name:name+' packaged native terrain route and manual override preserve aircraft position, navigation fixes and score',passed:true,observed:tactical});
   const beforeDixie=await page.evaluate(()=>({p:App.game.ac.p.slice(),bombs:App.game.ac.bombs,score:{...App.game.world.score}}));
   if(opts.hasTouch)await page.locator('#dixieRipple').tap();else await page.locator('#dixieRipple').click();
   if(opts.hasTouch)await page.locator('#dixieLook').tap();else await page.locator('#dixieLook').click();
   const dixie=await page.evaluate(()=>{const g=App.game;g.render(0);return {mission:g.mis.id,rightSeat:g.rightSeat,airborne:!g.ac.onDeck,view:FlightStrikeExperience.view(g),meshes:['bnStrikeDepot','bnStrikeRuin','bnStrikeTower'].every(n=>!!g.rend.meshes[n]),chart:FlightStrikeBoard.chart(g).features.some(f=>f.id==='dixie-road-junction'),p:g.ac.p.slice(),bombs:g.ac.bombs,score:{...g.world.score},gpuError:g.rend.gl.getError(),focused:document.activeElement?.id}});
   assert.equal(dixie.mission,'m2');assert.ok(dixie.rightSeat&&dixie.airborne&&dixie.meshes&&dixie.chart&&dixie.view.look);assert.equal(dixie.view.ripple,4);assert.notEqual(dixie.focused,'dixieLook');assert.deepEqual(dixie.p,beforeDixie.p);assert.equal(dixie.bombs,beforeDixie.bombs);assert.deepEqual(dixie.score,beforeDixie.score);assert.equal(dixie.gpuError,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   await page.screenshot({path:path.join(root,'test-results','build-'+name+'-dixie.png'),timeout:90000});
   checks.push({name:name+' packaged guided Dixie native briefing, airborne practice, scene, chart and original intervalometer',passed:true,observed:dixie,errors,missing});console.log('PASS '+name+' packaged guided Dixie native practice and controls');await ctx.close();
  }
  fs.writeFileSync(path.join(root,'test-results/build.json'),JSON.stringify({scope:'Runtime deployment folder byte checks and actual Chromium WebGL2 flight smoke; physical devices not tested',sourceSha256:manifest.entrySHA256,checks,recordedAt:new Date().toISOString()},null,2)+'\n');
  console.log('PASS deployment folder: all exact runtime hashes and desktop/native-touch flight, zero missing local assets or JavaScript/WebGL errors');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
