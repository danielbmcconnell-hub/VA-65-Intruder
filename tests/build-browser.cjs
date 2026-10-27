'use strict';
// Release verification: serve only the generated deployment folder, verify all
// packaged bytes over HTTP, then launch a real flight in both browser layouts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),site=path.join(root,'dist/site'),evidenceDir=path.resolve(process.argv[2]||path.join(root,'test-results'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const {chromium}=require(path.join(root,'node_modules/playwright'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.cjs':'application/octet-stream'};
const localServerFile=path.join(site,'assets/local-server.cjs');
assert.ok(fs.existsSync(localServerFile)&&fs.statSync(localServerFile).isFile(),'The complete download must include assets/local-server.cjs');
// Exercise the exact helper shipped in the archive, rather than a source-tree
// copy which could accidentally hide a packaging or Safari range regression.
const {sendFile,createServer:packagedServer}=require(localServerFile);
assert.equal(typeof sendFile,'function');assert.equal(typeof packagedServer,'function');
const VIDEO_FILES=['assets/video/carrier-launch.mp4','assets/video/carrier-approach.mp4','assets/video/carrier-night.mp4'];
function mp4Handlers(bytes){
 const boxes=(start,end)=>{const rows=[];for(let at=start;at+8<=end;){assert.ok(rows.length<4096,'MP4 box count must stay bounded');let size=bytes.readUInt32BE(at),header=8;if(size===1){assert.ok(at+16<=end);const large=bytes.readBigUInt64BE(at+8);assert.ok(large<=BigInt(Number.MAX_SAFE_INTEGER));size=Number(large);header=16;}else if(size===0)size=end-at;assert.ok(size>=header&&at+size<=end,'MP4 box must remain within its container');rows.push({type:bytes.toString('ascii',at+4,at+8),start:at+header,end:at+size});at+=size;}return rows;};
 const movie=boxes(0,bytes.length).find(b=>b.type==='moov');assert.ok(movie,'Packaged MP4 must contain movie metadata');
 return boxes(movie.start,movie.end).filter(b=>b.type==='trak').map(track=>{const media=boxes(track.start,track.end).find(b=>b.type==='mdia');assert.ok(media,'MP4 track needs media metadata');const handler=boxes(media.start,media.end).find(b=>b.type==='hdlr');assert.ok(handler&&handler.end-handler.start>=12,'MP4 track needs a complete handler');return bytes.toString('ascii',handler.start+8,handler.start+12);});
}
const server=http.createServer((req,res)=>{
 let relative;try{relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);res.end();return}
 const file=path.resolve(site,'.'+relative+(relative.endsWith('/')?'index.html':'')),rel=path.relative(site,file);
 if(rel.startsWith('..')||path.isAbsolute(rel)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}sendFile(req,res,file,fs.statSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const target='http://127.0.0.1:'+server.address().port+'/';let browser;
 const checks=[],executedHTTP=[],rangeHTTP=[];
 try{
  fs.mkdirSync(evidenceDir,{recursive:true});
  const manifestPath=path.join(root,'dist/build-manifest.json'),manifestBytes=fs.readFileSync(manifestPath),testBytes=fs.readFileSync(__filename),manifest=JSON.parse(manifestBytes);
  for(const item of manifest.files){const response=await fetch(target+item.file);assert.equal(response.status,200);assert.equal(response.headers.get('content-type')?.split(';')[0].trim(),mime[path.extname(item.file)]||'application/octet-stream');const bytes=Buffer.from(await response.arrayBuffer()),observed=sha(bytes);assert.equal(observed,item.sha256);executedHTTP.push({file:item.file,sha256:observed,contentType:response.headers.get('content-type')});}
  checks.push({name:'All '+manifest.files.length+' packaged runtime files served with exact hashes',passed:true});
  assert.ok(manifest.files.some(item=>item.file==='assets/local-server.cjs'));
  assert.deepEqual(manifest.files.filter(item=>item.file.endsWith('.mp4')).map(item=>item.file).sort(),VIDEO_FILES.slice().sort());
  const mediaTracks=[];
  for(const file of VIDEO_FILES){
   const bytes=fs.readFileSync(path.join(site,file)),handlers=mp4Handlers(bytes);assert.ok(handlers.includes('vide'));assert.equal(handlers.includes('soun'),false,'Reference clips must contain no spoken or music audio track');mediaTracks.push({file,handlers,bytes:bytes.length});
   for(const [range,start,end]of[['bytes=0-1',0,1],['bytes=1024-1151',1024,1151],['bytes=-64',bytes.length-64,bytes.length-1]]){
    const response=await fetch(target+file,{headers:{Range:range}}),actual=Buffer.from(await response.arrayBuffer()),expected=bytes.subarray(start,end+1);
    assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'video/mp4');assert.equal(response.headers.get('accept-ranges'),'bytes');assert.equal(response.headers.get('content-range'),'bytes '+start+'-'+end+'/'+bytes.length);assert.equal(response.headers.get('content-length'),String(expected.length));assert.deepEqual(actual,expected);
    rangeHTTP.push({file,request:range,status:response.status,contentRange:response.headers.get('content-range'),bytes:actual.length,sha256:sha(actual),expectedSHA256:sha(expected)});
   }
  }
  checks.push({name:'Packaged local server returns exact HTTP 206 probes, body slices and suffixes for all three silent MP4 clips',passed:true,observed:{localServer:'assets/local-server.cjs',mediaTracks,rangeRequests:rangeHTTP.length}});
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const profile of [{name:'desktop',viewport:{width:1280,height:720}},{name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}]){
   const {name,...opts}=profile,ctx=await browser.newContext(opts),page=await ctx.newPage(),errors=[],missing=[];
   const native=locator=>opts.hasTouch?locator.tap():locator.click();
   // Utility controls keep their original owners, but flight now exposes them
   // through the native Cockpit menu. Opening that menu closes a reading panel.
   const utility=async selector=>{const control=page.locator(selector);if(!await control.isVisible())await native(page.locator('#hudUtilityToggle'));await native(control);};
   const closeUtility=async()=>{const toggle=page.locator('#hudUtilityToggle');if(await toggle.isVisible()){if(await toggle.getAttribute('aria-expanded')!=='true')await native(toggle);await page.locator('#hudUtilityMenu').waitFor({state:'visible'});await native(toggle);await page.locator('#hudUtilityMenu').waitFor({state:'hidden'});}};
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(target))missing.push(r.url())});
   await ctx.addInitScript(()=>{sessionStorage.setItem('a6_archival_intro_seen','1');const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>window.__packagedFixedClock?0:raf(t=>{if(!window.__packagedFixedClock)cb(t)})});
   await page.goto(target,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.App);await page.click('#bootGo');await page.locator('#readyBody .mcard').first().click();await page.getByRole('button',{name:'Man Aircraft',exact:true}).click();
   await page.waitForFunction(()=>App.game&&document.getElementById('loader').style.display==='none',null,{timeout:60000});
   // Drive original flight explicitly below. Unattended live frames during
   // slow software-GPU UI assertions can crash the pilot-seat aircraft or
   // open a timed teaching overlay between visibility and geometry reads. Keep
   // the genuine game screen so its coordinated HUD remains available.
   await page.evaluate(()=>{window.__packagedFixedClock=true;App.game.paused=true;App.screen='game';for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on')});
   await page.waitForFunction(()=>{const s=window.PhotoCutouts&&PhotoCutouts.inspect(App.rend);if(s?.status==='error')throw Error(s.failures.join('; '));return s?.status==='ready'&&s.records.filter(r=>r.pose==='idle').length===6;},null,{polling:50,timeout:90000});
   const cdp=opts.hasTouch?await ctx.newCDPSession(page):null;
   if(cdp){const b=await page.locator('#pickle').boundingBox();assert.ok(b);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});assert.equal(await page.evaluate(()=>App.gctl.commit),1)}else await page.keyboard.down('Space');
   const observed=await page.evaluate(()=>{const G=App.game;G.paused=false;for(let i=0;i<240;i++)G.update(1/60);G.paused=true;G.render(1/60);G.syncControls();return {mission:G.mis.id,quality:App.set.quality,shadowSize:G.rend.shadowSize,alive:G.ac.alive,onDeck:G.ac.onDeck,phase:G.phase,finite:[...G.ac.p,...G.ac.v].every(Number.isFinite),gpuError:G.rend.gl.getError(),webgl:G.rend.gl.getParameter(G.rend.gl.VERSION)}});
   if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('Space');
   assert.ok(observed.alive&&observed.finite&&!observed.onDeck);assert.equal(observed.gpuError,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   // Declared damage-event presentation fixture: original onHit creates its
   // normal B/N call. It changes no aircraft health or mission objective.
   const familyCall=await page.evaluate(()=>{const g=App.game,before={crew:{...g.ac.crew},score:{...g.world.score}};g.onHit(.4,'small-arms',g.ac.p.slice());return {before,after:{crew:{...g.ac.crew},score:{...g.world.score}},text:document.getElementById('radio').textContent};});
   assert.match(familyCall.text,/We're in deep yogurt\./);assert.match(familyCall.text,/We are hit!/);assert.deepEqual(familyCall.after,familyCall.before);
   checks.push({name:name+' packaged original damage call includes family-supplied B/N expression without changing flight state',passed:true,observed:familyCall});
   observed.photosDecoded=await page.evaluate(async()=>{const sources=[IMG_HERO,IMG_PHOTO,IMG_BN_STAND,IMG_BN_CROUCH,IMG_TIGER,...Object.values(PHOTOS).map(p=>p.s)];for(const src of sources){const im=new Image();im.src=src;await im.decode();if(!(im.naturalWidth>0&&im.naturalHeight>0))throw Error('Invalid photograph '+src)}return sources.length});assert.equal(observed.photosDecoded,17);
   assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   if(await page.locator('#teach').isVisible())await native(page.locator('#teach'));
   await page.evaluate(()=>{App.screen='game';App.game.paused=false;FlightCoach.tick(App.game,0)});
   const toggle=page.locator('[data-flight-coach-toggle]'),cockpitToggle=page.locator('#hudUtilityToggle');await cockpitToggle.waitFor({state:'visible'});
   assert.equal(await toggle.getAttribute('aria-pressed'),'false');const before=await cockpitToggle.boundingBox();
   await utility('[data-flight-coach-toggle]');
   await page.evaluate(()=>{const g=App.game;g.update(1/60);g.render(1/60);g.syncControls()});
   await page.waitForFunction(()=>FlightCoach.enabled(App.game)&&!document.getElementById('flightCoachCue').hidden,null,{polling:50,timeout:30000});
   assert.equal(await page.evaluate(()=>InstructionView.enabled()),false);await utility('#flightHelpToggle');assert.equal(await page.evaluate(()=>InstructionView.enabled()),true);
   checks.push({name:name+' packaged Help starts off and opens through native input',passed:true});
   await utility('#hudGuideDetails');await page.locator('#flightCoachCue').waitFor({state:'visible'});
   const after=await cockpitToggle.boundingBox();assert.ok(before&&after);assert.ok(Math.abs(before.x-after.x)<.5&&Math.abs(before.width-after.width)<.5,'Visible guidance must not shift the native Cockpit toggle');
   await utility('[data-flight-coach-toggle]');
   assert.equal(await toggle.getAttribute('aria-pressed'),'false');assert.equal(await page.evaluate(()=>FlightCoach.enabled(App.game)),false);
   const m24=await page.evaluate(()=>({ammunition:!!window.SurvivalAmmunition,board:!!window.FlightStrikeBoard,effects:!!window.FlightStrikeEffects,sortie:!!window.FlightSortieCheckpoint}));
   assert.ok(Object.values(m24).every(Boolean),'All new production modules must load from the exact package');
   const realismModules=await page.evaluate(()=>Object.fromEntries(['NeuralDialogue','OceanJellyfish','VoiceProfiles','AircraftDetail','CarrierLaunch','MissionDemo','LandingWater','AviatorCompanion','DescentThreats','Wildlife','WildlifeRender','WildlifeTargeting','JungleScenery','VisualClarity','FlightThreatFeedback','PrisonDetail','PrisonFood','RationPhoto','GroundItems','GroundItemsRender','CoastalScenery','HUDLayout','VillageDetail','CrewPersonality','FishingBoats','FishingMaterials','RiverbankWildlife','ArchivalFootage'].map(name=>[name,!!window[name]])));
   assert.ok(Object.values(realismModules).every(Boolean),'Every carrier, survival, wildlife, voice and demonstration module must load from the package');
   const fishingArtwork=await page.evaluate(async()=>{const rows=[];for(const file of ['assets/fishing/fisher-paddle.webp','assets/fishing/wood.webp']){const image=new Image();image.src=file;await image.decode();rows.push({file,width:image.naturalWidth,height:image.naturalHeight});}return rows;});
   assert.equal(fishingArtwork.length,2);assert.ok(fishingArtwork.every(a=>a.width===1536&&a.height===1024));
   checks.push({name:name+' packaged fishing, bank wildlife and archival modules load with complete 1536×1024 fisher and wood artwork',passed:true,observed:{modules:realismModules,fishingArtwork}});
   const clipMetadata=await page.evaluate(async()=>{
    const g=App.game,before={p:g.ac.p.slice(),crew:{...g.ac.crew},score:JSON.stringify(g.world.score),mission:g.mis.id},rows=[];
    for(const clip of ArchivalFootage.clips){
     // Metadata-only probes deliberately never call play or open the montage.
     const video=document.createElement('video');video.preload='metadata';video.muted=true;video.defaultMuted=true;video.volume=0;video.playsInline=true;video.setAttribute('muted','');video.setAttribute('playsinline','');
     try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Packaged clip metadata timed out: '+clip.file)),20000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(Error('Packaged clip metadata failed: '+clip.file+' / '+video.error?.code));};video.src=clip.file;video.load();});
      rows.push({file:clip.file,width:video.videoWidth,height:video.videoHeight,duration:video.duration,muted:video.muted&&video.defaultMuted&&video.volume===0,playsInline:video.playsInline,paused:video.paused,currentTime:video.currentTime});
     }finally{video.pause();video.removeAttribute('src');video.load();}
    }
    return {rows,before,after:{p:g.ac.p.slice(),crew:{...g.ac.crew},score:JSON.stringify(g.world.score),mission:g.mis.id},montageActive:ArchivalFootage.inspect().active};
   });
   assert.deepEqual(clipMetadata.rows.map(row=>row.file),VIDEO_FILES);assert.ok(clipMetadata.rows.every(row=>row.width>0&&row.height>0&&Number.isFinite(row.duration)&&row.duration>0&&row.muted&&row.playsInline&&row.paused&&row.currentTime===0));assert.equal(clipMetadata.montageActive,false);assert.deepEqual(clipMetadata.after,clipMetadata.before);
   checks.push({name:name+' all three packaged silent clips decode inline metadata without playback, montage opening or flight changes',passed:true,observed:clipMetadata});
   const dialogueAudio=await page.evaluate(async()=>{const m=await(await fetch('assets/audio/dialogue/manifest.json')).json(),rows=[];for(const role of Object.keys(m.roles)){const clip=m.clips.find(c=>c.role===role),response=await fetch('assets/audio/dialogue/'+clip.file),b=await App.audio.ctx.decodeAudioData(await response.arrayBuffer());rows.push({role,file:clip.file,type:response.headers.get('content-type'),channels:b.numberOfChannels,rate:b.sampleRate,duration:b.duration});}return rows;});assert.equal(dialogueAudio.length,3);assert.ok(dialogueAudio.every(c=>c.type==='audio/mpeg'&&c.duration>.4&&c.channels>=1));checks.push({name:name+' packaged generic neural male dialogue decodes for all three roles',passed:true,observed:dialogueAudio});
   const groundArtwork=await page.evaluate(async()=>{const rows=[];for(const file of ['assets/firstperson/punch-left.webp','assets/firstperson/punch-right.webp','assets/items/pickups.webp','assets/firstperson/stick.webp','assets/firstperson/rifle.webp']){const image=new Image();image.src=file;await image.decode();rows.push({file,width:image.naturalWidth,height:image.naturalHeight});}return rows;});
   const waterArtwork=await page.evaluate(async()=>{const rows=[];for(const file of ['assets/firstperson/swim-stroke-a.webp','assets/firstperson/swim-stroke-b.webp','assets/firstperson/rope-grip-open.webp','assets/firstperson/rope-grip-closed.webp','assets/crocodile/swim.webp']){const image=new Image();image.src=file;await image.decode();rows.push({file,width:image.naturalWidth,height:image.naturalHeight});}return rows;});assert.equal(waterArtwork.length,5);assert.ok(waterArtwork.every(r=>r.width>=1024&&r.height>=600));
   checks.push({name:name+' packaged swimming, rope grips and crocodile frames decode fully',passed:true,observed:waterArtwork});
   assert.equal(groundArtwork.length,5);assert.ok(groundArtwork.every(row=>row.width>=1024&&row.height>=600));
   checks.push({name:name+' packaged photographic left/right hand poses and useful-item atlas decode completely',passed:true,observed:groundArtwork});
   await page.evaluate(()=>{App.screen='game';App.game.paused=false;FlightStrikeBoard.render(App.game)});
   await utility('#flightStrikeBoardToggle');
   await page.locator('#flightStrikePanel').waitFor({state:'visible'});
   const panel=await page.locator('#flightStrikePanel').boundingBox();assert.ok(panel);
   if(opts.hasTouch){for(const id of ['stick','pickle','btnScope','btnGear','pauseBtn']){const control=await page.locator('#'+id).boundingBox();assert.ok(control,'Packaged flight control must be visible: '+id);assert.ok(panel.x+panel.width<=control.x||control.x+control.width<=panel.x||panel.y+panel.height<=control.y||control.y+control.height<=panel.y,'Packaged worksheet must not cover '+id);}}
   await closeUtility();
   assert.equal(await page.locator('#flightStrikePanel').isVisible(),false);
   checks.push({name:name+' packaged B/N worksheet opens through native input and keeps flight controls exposed',passed:true,observed:{modules:m24,panel},errors,missing});
   await page.evaluate(()=>{App.game.paused=true;App.screen='game';App.game.render(1/60)});
   checks.push({name:name+' packaged flight guidance toggles through native input without moving its target',passed:true,observed:{before,after},errors,missing});
   console.log('PASS '+name+' exact packaged native guidance toggle and stable target');
   if(await page.locator('#teach').isVisible())await native(page.locator('#teach'));await page.screenshot({path:path.join(evidenceDir,'build-'+name+'-flight.png'),timeout:90000});
   checks.push({name:name+' packaged flight launches and renders with fresh default settings',passed:true,observed,errors,missing});console.log('PASS '+name+' packaged flight: default quality '+observed.quality+', '+observed.photosDecoded+' images decoded');
   // Resume the native scheduler for the real chapter's queued startup.
   await page.evaluate(()=>{window.__packagedFixedClock=false;App.show('ready');requestAnimationFrame(t=>App.frame(t))});
   await page.locator('#powChapter [data-pow-chapter="escape"]').click();
   await page.waitForFunction(()=>App.game?.pow?.stage==='cell'&&document.getElementById('loader').style.display==='none',null,{timeout:90000});
   const pow=await page.evaluate(async()=>{
     const G=App.game;window.__packagedFixedClock=true;G.paused=true;G.render(1/60);
     const snapshot=POW.save(G);POW.begin(G,'cell',snapshot);G.paused=true;G.render(1/60);
     let historicalPhotos=0;
     for(const item of Object.values(POWPhotos.historicalPhotoAssets)){const im=new Image();im.src=item.src;await im.decode();if(!im.naturalWidth)throw Error('Invalid historical photograph '+item.src);historicalPhotos++;}
     return {stage:G.pow.stage,solids:G.pow.solids.length,checkpoint:Store.get('pow_checkpoint',null)?.stage,savedSortie:snapshot.sortie?.missionId,restoredSortie:G.mis.id,ammunition:snapshot.ammunition,historicalPhotos,riverLoaded:!!POW.River,captivityLoaded:!!POW.Captivity,m21Loaded:['Solidarity','DentonFlashback','Mindscape','RegularConfinement'].every(name=>!!POW[name]),m22Loaded:!!POW.Guidance&&!!POW.Feedback&&!!window.FlightCoach,m23Loaded:!!window.EpisodeGLSL&&['EpisodeScene','EpisodeStealth','EpisodeActions','EpisodeAudio','FigureMotion','MemoryDetail'].every(name=>!!POW[name]),m23Scene:G.pow.episodeScene?.version,m23Pebbles:G.pow.episodeStealth?.pileRemaining,guidanceChapter:POW.Guidance.state(G).chapter,gpuError:G.rend.gl.getError(),cameraHeight:G.rend.eye[1]-G.evade.p[1]};
   });
   assert.equal(pow.stage,'cell');assert.ok(pow.solids>20&&pow.riverLoaded&&pow.captivityLoaded&&pow.m21Loaded&&pow.m22Loaded&&pow.m23Loaded);assert.equal(pow.m23Scene,1);assert.equal(pow.m23Pebbles,3);assert.equal(pow.guidanceChapter,'escape');assert.equal(pow.checkpoint,'cell');assert.equal(pow.historicalPhotos,8);assert.equal(pow.gpuError,0);assert.ok(Math.abs(pow.cameraHeight-1.68)<.01);
   assert.equal(pow.savedSortie,'m11');assert.equal(pow.restoredSortie,'m11');assert.equal(pow.ammunition.version,1);assert.equal(pow.ammunition.bulletsExpended,0);
   // Whole botanical photographs now load in flight and captivity. The old
   // fragmented vegetation atlas remains a failure fallback, not a required upload.
   await page.waitForFunction(()=>{if(App.rend.gl.isContextLost())throw Error('Packaged ground context lost');const j=JungleScenery.inspect(App.game,App.rend);if(j.failures.length)throw Error(JSON.stringify(j.failures));return j.status==='ready'&&j.readySources===10;},null,{polling:50,timeout:90000});
   const refinement=await page.evaluate(()=>{const R=App.rend,gl=R.gl,plants=JungleScenery.inspect(App.game,R),cutouts=PhotoCutouts.inspect(R);return {title:document.title,modules:[!!window.SpriteLayers,!!window.PhotoCutouts,!!window.PhotoMotion,!!window.ContactShadows,!!window.QualityPolicy,!!window.GroundView,!!window.EquipmentView,!!window.GroundCombat,!!window.TerrainShadows,!!window.NearGround],cutouts:{...cutouts,records:cutouts.records.map(r=>({...r,liveTexture:gl.isTexture(R.textures[r.textureName]?.tex),textureWidth:R.textures[r.textureName]?.w,textureHeight:R.textures[r.textureName]?.h}))},plants:{...plants,records:plants.records.map(p=>({...p,liveTexture:gl.isTexture(R.textures[p.textureName]?.tex)})),components:plants.components.map(p=>({...p,liveTexture:gl.isTexture(R.textures[p.textureName]?.tex),textureWidth:R.textures[p.textureName]?.w,textureHeight:R.textures[p.textureName]?.h})),floorLive:gl.isTexture(R.textures[plants.floor.textureName]?.tex),crownLive:gl.isTexture(R.textures[plants.crown.textureName]?.tex)},legacyVegetationUploaded:!!R.textures.photo_vegetation,legacyFigureUploaded:!!R.textures.people,arrays:SpriteLayers.inspect(gl),ground:GroundView.view(App.game),policy:QualityPolicy.inspect(App),gl:gl.getError()}});
   assert.ok(refinement.title.includes('B/N Immersion & Visual Polish'));assert.ok(refinement.modules.every(Boolean));
   assert.equal(refinement.cutouts.status,'ready');assert.equal(refinement.cutouts.ready,refinement.cutouts.expected);assert.ok(refinement.cutouts.ready>=15);assert.deepEqual(refinement.cutouts.failures,[]);assert.ok(refinement.cutouts.bytes<=refinement.cutouts.budget);
   for(const subject of ['farmer','militia','female_vc','nva','aviator','cow'])for(const pose of ['idle','fallen'])assert.ok(refinement.cutouts.records.some(r=>r.subject===subject&&r.pose===pose),subject+' complete '+pose+' image must be packaged and uploaded');
   for(const r of refinement.cutouts.records){assert.ok(r.sourceWidth>=1024&&r.sourceHeight>=1024,r.key+' must use a full high-resolution source');assert.ok(Math.max(r.width,r.height)>=768,r.key+' retains useful photographic GPU resolution');if(r.pose==='idle')assert.ok(r.liveTexture,r.key+' must remain resident');if(r.resident!==false){assert.ok(r.liveTexture,r.key);assert.equal(r.textureWidth,r.width);assert.equal(r.textureHeight,r.height);}}
   assert.equal(refinement.plants.readySources,10);assert.equal(refinement.plants.records.length,6);assert.ok(refinement.plants.records.every(p=>p.liveTexture&&Math.max(p.sourceWidth,p.sourceHeight)>=1024));assert.ok(refinement.plants.floorLive&&refinement.plants.crownLive);assert.ok(refinement.plants.bytes<=refinement.plants.budget);assert.equal(refinement.legacyVegetationUploaded,false);assert.equal(refinement.legacyFigureUploaded,false);assert.equal(refinement.arrays.liveArrays,0);assert.equal(refinement.arrays.bytes,0);assert.equal(refinement.arrays.failures,0);assert.equal(refinement.ground.height,1.68);assert.equal(refinement.policy.requested,opts.hasTouch?1:2);assert.equal(refinement.gl,0);
   const botanicalManifest=JSON.parse(fs.readFileSync(path.join(site,'assets/jungle/manifest.json')));
   assert.equal(refinement.plants.components.length,2);
   for(const kind of ['broadleaf','palm']){
    const component=refinement.plants.components.find(p=>p.kind===kind),spec=botanicalManifest.components[kind];
    assert.ok(component?.liveTexture,kind+' photographic leaf component must be a live GPU texture');assert.equal(component.file,spec.file);
    assert.equal(component.sourceWidth,spec.width);assert.equal(component.sourceHeight,spec.height);assert.ok(Math.max(component.sourceWidth,component.sourceHeight)>=1024);
    const edge=opts.hasTouch?spec.gpuTouch:spec.gpuHigh,scale=Math.min(1,edge/Math.max(spec.width,spec.height));
    assert.equal(component.textureWidth,Math.round(spec.width*scale));assert.equal(component.textureHeight,Math.round(spec.height*scale));
    assert.ok(component.bytes>0&&component.bytes<=refinement.plants.budget);assert.deepEqual(component.root,spec.root);
   }
   checks.push({name:name+' packaged complete high-resolution photographs and vegetation use bounded GPU resources',passed:true,observed:refinement});
   const packagedMotion=await page.evaluate(async()=>{
    const R=App.rend,gl=R.gl;PhotoCutouts.beginFrame(R);await PhotoCutouts.prepareMotion(R,'nva','walk');
    const cutouts=PhotoCutouts.inspect(R);
    return {...cutouts,motions:{...cutouts.motions,records:cutouts.motions.records.map(r=>({...r,liveTexture:gl.isTexture(R.textures[r.textureName]?.tex)}))},gl:gl.getError()};
   });
   assert.equal(packagedMotion.status,'ready');assert.deepEqual(packagedMotion.failures,[]);assert.deepEqual(packagedMotion.motions.failures,[]);assert.ok(packagedMotion.bytes<=packagedMotion.budget);assert.ok(packagedMotion.motions.cpuBytes<=packagedMotion.motions.cpuBudget);
   for(const subject of ['farmer','militia','female_vc','nva','aviator','cow'])for(const clip of ['walk','run'])assert.ok(packagedMotion.motions.clips.some(c=>c.subject===subject&&c.clip===clip&&c.frames===16),subject+' complete '+clip+' cycle must be declared in the package');
   const walkFrames=packagedMotion.motions.records.filter(r=>r.subject==='nva'&&r.clip==='walk');assert.equal(walkFrames.length,16,'All sixteen distinct packaged NVA walking photographs must upload');
   for(const r of walkFrames){assert.ok(r.liveTexture,'Motion photograph GPU texture '+r.frame);assert.ok(r.sourceWidth>=512&&r.sourceHeight>=768,'Motion photograph source detail '+r.frame);assert.ok(r.gpuWidth>=(opts.hasTouch?384:512)&&r.gpuHeight>=(opts.hasTouch?576:768),'Motion photograph GPU detail '+r.frame);}
   assert.equal(packagedMotion.gl,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   checks.push({name:name+' packaged sixteen-frame photographic walk decodes and uploads within the shared GPU budget',passed:true,observed:packagedMotion});
   const packagedSwim=await page.evaluate(async()=>{
    const R=App.rend,gl=R.gl,clips=[];
    for(const subject of ['nva','militia','aviator']){
     PhotoCutouts.beginFrame(R);await PhotoCutouts.prepareMotion(R,subject,'swim');
     const state=PhotoCutouts.inspect(R),clip=state.motions.clips.find(c=>c.subject===subject&&c.clip==='swim');
     const frames=state.motions.records.filter(r=>r.subject===subject&&r.clip==='swim').map(r=>({...r,liveTexture:gl.isTexture(R.textures[r.textureName]?.tex)}));
     clips.push({subject,clip,frames,bytes:state.bytes,budget:state.budget,cpuBytes:state.motions.cpuBytes,cpuBudget:state.motions.cpuBudget,failures:state.motions.failures});
    }
    return {clips,gl:gl.getError()};
   });
   packagedSwim.modules=realismModules;
   for(const entry of packagedSwim.clips){assert.equal(entry.clip?.frames,8);assert.equal(entry.frames.length,8);assert.ok(entry.frames.every(r=>r.liveTexture));assert.ok(entry.bytes<=entry.budget&&entry.cpuBytes<=entry.cpuBudget);assert.deepEqual(entry.failures,[]);}
   assert.equal(packagedSwim.gl,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   checks.push({name:name+' packaged complete eight-pose swimming clips upload for NVA, VC and the companion aviator',passed:true,observed:packagedSwim});
   assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   await page.screenshot({path:path.join(evidenceDir,'build-'+name+'-pow.png'),timeout:90000});
   checks.push({name:name+' packaged Ready Room prison entry, tutorial, checkpoint and historical photographs',passed:true,observed:pow,errors,missing});console.log('PASS '+name+' packaged POW chapter, new guidance modules and eight historical photographs');
   // Rations belong to solitary/regular confinement, not the October escape
   // cell. Enter their real standalone chapter rather than changing its stage.
   await page.evaluate(()=>{window.__packagedFixedClock=false;App.show('ready');requestAnimationFrame(t=>App.frame(t))});
   if(opts.hasTouch)await page.locator('#powChapter [data-pow-chapter="solitary"]').tap();else await page.locator('#powChapter [data-pow-chapter="solitary"]').click();
   await page.waitForFunction(()=>App.game?.pow?.stage==='solitary'&&document.getElementById('loader').style.display==='none',null,{polling:50,timeout:90000});
   await page.evaluate(()=>{window.__packagedFixedClock=true;App.game.paused=true;App.game.render(0);});
   await page.waitForFunction(()=>{const p=PrisonDetail.inspect(App.rend),r=RationPhoto.inspect(App.rend);if(p.status==='error'||r.status==='error')throw Error(JSON.stringify({p,r}));return p.status==='ready'&&r.status==='ready';},null,{polling:50,timeout:90000});
   const prisonMaterials=await page.evaluate(()=>{const g=App.game,R=App.rend;g.render(0);return {stage:g.pow.stage,materials:PrisonDetail.inspect(R),ration:RationPhoto.inspect(R),meal:PrisonFood.inspect(g),fullMesh:!!R.meshes.rationPhotoFull,emptyMesh:!!R.meshes.rationPhotoEmpty,gl:R.gl.getError()};});
   assert.ok(await page.evaluate(()=>!!POW.ConfinementGoals&&POW.ConfinementGoals.view(App.game)?.condition.length===4),'Packaged solitary goals and all four condition meters must be registered');
   assert.equal(prisonMaterials.stage,'solitary');assert.equal(prisonMaterials.materials.ready,4);assert.ok(prisonMaterials.materials.bytes<=prisonMaterials.materials.budget);assert.equal(prisonMaterials.ration.ready,2);assert.ok(prisonMaterials.ration.bytes<=prisonMaterials.ration.budget);assert.equal(prisonMaterials.meal.supported,true);assert.equal(prisonMaterials.meal.mealObject,'cell-tray');assert.ok(prisonMaterials.fullMesh&&prisonMaterials.emptyMesh);assert.equal(prisonMaterials.gl,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   checks.push({name:name+' packaged prison material textures and whole-photo full/empty ration surfaces load through the native chapter',passed:true,observed:prisonMaterials});
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
   await page.evaluate(()=>{App.screen='game';App.game.paused=true});
   await page.evaluate(async()=>{await WillardSprites.load(App.rend);const g=App.game;g.paused=false;for(let i=0;i<13*60&&g.ac.alive&&!g.result;i++)g.update(1/60);g.render(1/60);g.syncControls();App.screen='game';WillardPresentation.render(g)});
   if(opts.hasTouch)await page.locator('#willardRear').tap();else await page.locator('#willardRear').click();
   const willard=await page.evaluate(()=>{const g=App.game;g.paused=true;g.render(1/60);return {mission:g.mis.id,alive:g.ac.alive,phase:g.willard.phase,rear:g.willard.rear,rightSeat:g.rightSeat,checkpointValid:WillardMission.validCheckpoint(Store.get(WillardMission.KEY,null)),artwork:WillardSprites.inspect(g.rend),immersion:{nightContrast:g.rend.atm.nightContrast,meshes:['bnRouteFactory','bnRouteBridge','bnRouteRail'].every(n=>!!g.rend.meshes[n]),chart:!!FlightStrikeBoard.chart(g),rasterCPU:g.hud.radar.ctx.getContextAttributes().willReadFrequently},gpuError:g.rend.gl.getError()}});
   assert.equal(willard.mission,'willard');assert.equal(willard.alive,true);assert.equal(willard.rightSeat,false);assert.equal(willard.rear,true);assert.ok(['contact','defend'].includes(willard.phase));assert.equal(willard.checkpointValid,true);assert.equal(willard.artwork.status,'ready');assert.equal(willard.artwork.uploads,1);assert.ok(willard.artwork.draws>0);assert.equal(willard.artwork.last.visible,true);assert.equal(willard.gpuError,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   await page.screenshot({path:path.join(evidenceDir,'build-'+name+'-willard.png'),timeout:90000});
   assert.deepEqual(willard.immersion,{nightContrast:1,meshes:true,chart:true,rasterCPU:true});
   checks.push({name:name+' packaged Willard mission launches through native input and renders the supplied world-space interceptor',passed:true,observed:willard,errors,missing});console.log('PASS '+name+' packaged Willard native PLAY, original flight, checkpoint and actual GPU atlas');
   await page.evaluate(()=>{App.game.paused=true;App.show('ready')});
   if(opts.hasTouch)await page.locator('#dixieReady').tap();else await page.locator('#dixieReady').click();
   if(opts.hasTouch)await page.locator('#dixiePractice').tap();else await page.locator('#dixiePractice').click();
   await page.waitForFunction(()=>App.game?.mis?.id==='m2'&&!!App.game.strikeExperience&&document.getElementById('loader').style.display==='none',null,{polling:50,timeout:90000});
   await page.evaluate(()=>{const g=App.game;g.update(1/60);g.render(1/60);g.syncControls()});
   const tacticalBefore=await page.evaluate(()=>({p:App.game.ac.p.slice(),fixes:App.game.world.nav.fixes,score:{...App.game.world.score}}));
   await utility('#dixieApproach');
   if(opts.hasTouch)await page.locator('#dixieRouteTerrain').tap();else await page.locator('#dixieRouteTerrain').click();
   const tactical=await page.evaluate(()=>({route:FlightTacticalApproach.inspect(App.game),materials:typeof FlightVisualMaterials.glsl==='string',feedback:FlightAirframeFeedback.view(App.game),p:App.game.ac.p.slice(),clearance:App.game.apAGL,fixes:App.game.world.nav.fixes,score:{...App.game.world.score},focus:document.activeElement?.id}));
   assert.equal(tactical.route.choice,'terrain');assert.equal(tactical.route.following,true);assert.equal(tactical.clearance,320);assert.ok(tactical.materials&&tactical.feedback.active);assert.deepEqual(tactical.p,tacticalBefore.p);assert.equal(tactical.fixes,tacticalBefore.fixes);assert.deepEqual(tactical.score,tacticalBefore.score);assert.notEqual(tactical.focus,'dixieRouteTerrain');
   await utility('#dixieApproach');
   if(opts.hasTouch)await page.locator('#dixieRouteFree').tap();else await page.locator('#dixieRouteFree').click();
   assert.equal(await page.evaluate(()=>FlightTacticalApproach.inspect(App.game).following),false);
   checks.push({name:name+' packaged native terrain route and manual override preserve aircraft position, navigation fixes and score',passed:true,observed:tactical});
   const beforeDixie=await page.evaluate(()=>({p:App.game.ac.p.slice(),bombs:App.game.ac.bombs,score:{...App.game.world.score}}));
   await utility('#dixieRipple');
   await utility('#dixieLook');
   await closeUtility();
   const dixie=await page.evaluate(()=>{const g=App.game;g.render(0);return {mission:g.mis.id,rightSeat:g.rightSeat,airborne:!g.ac.onDeck,view:FlightStrikeExperience.view(g),meshes:['bnStrikeDepot','bnStrikeRuin','bnStrikeTower'].every(n=>!!g.rend.meshes[n]),chart:FlightStrikeBoard.chart(g).features.some(f=>f.id==='dixie-road-junction'),p:g.ac.p.slice(),bombs:g.ac.bombs,score:{...g.world.score},gpuError:g.rend.gl.getError(),focused:document.activeElement?.id}});
   assert.equal(dixie.mission,'m2');assert.ok(dixie.rightSeat&&dixie.airborne&&dixie.meshes&&dixie.chart&&dixie.view.look);assert.equal(dixie.view.ripple,4);assert.notEqual(dixie.focused,'dixieLook');assert.deepEqual(dixie.p,beforeDixie.p);assert.equal(dixie.bombs,beforeDixie.bombs);assert.deepEqual(dixie.score,beforeDixie.score);assert.equal(dixie.gpuError,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   await page.screenshot({path:path.join(evidenceDir,'build-'+name+'-dixie.png'),timeout:90000});
   checks.push({name:name+' packaged guided Dixie native briefing, airborne practice, scene, chart and original intervalometer',passed:true,observed:dixie,errors,missing});console.log('PASS '+name+' packaged guided Dixie native practice and controls');
   // Enter the real jungle chooser to cover the final inventory-aware hint
   // and photographic foliage in this exact packaged build.
   await page.evaluate(()=>{window.__packagedFixedClock=false;App.show('ready');requestAnimationFrame(t=>App.frame(t));});
   await page.locator('#wildlifeKind').selectOption('forest');
   if(opts.hasTouch)await page.locator('#wildlifePractice').tap();else await page.locator('#wildlifePractice').click();
   await page.waitForFunction(()=>App.game?.evade?.wildlifePractice&&document.getElementById('loader').style.display==='none',null,{polling:50,timeout:90000});
   await page.evaluate(()=>{window.__packagedFixedClock=true;App.game.paused=true;});
   await page.waitForFunction(()=>{const j=JungleScenery.inspect(App.game,App.rend);if(j.failures.length)throw Error(JSON.stringify(j.failures));return j.status==='ready'&&j.readySources===10;},null,{polling:50,timeout:90000});
   const forest=await page.evaluate(()=>{const g=App.game;for(let i=0;i<16;i++)g.render(0);g.syncControls();const j=JungleScenery.inspect(g,g.rend);return {cue:g.nextCue(g.ac,g.world),mode:g.evade.weaponMode,sources:j.readySources,photos:j.count,bytes:j.bytes,budget:j.budget,gl:g.rend.gl.getError()};});
   assert.equal(forest.mode,'fists');assert.match(forest.cue,/PUNCH/);assert.doesNotMatch(forest.cue,/RADIO/);assert.equal(forest.sources,10);assert.ok(forest.photos>0&&forest.bytes<=forest.budget);assert.equal(forest.gl,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   await page.screenshot({path:path.join(evidenceDir,'build-'+name+'-forest.png'),timeout:90000});
   checks.push({name:name+' packaged native forest entry shows botanical photos and actual practice punch/weapon controls',passed:true,observed:forest});await ctx.close();
  }
  const sourceStable=manifestBytes.equals(fs.readFileSync(manifestPath))&&testBytes.equals(fs.readFileSync(__filename))&&manifest.files.every(item=>sha(fs.readFileSync(path.join(site,item.file)))===item.sha256);
  assert.equal(sourceStable,true,'Packaged runtime, manifest and executed test must remain unchanged');
  fs.writeFileSync(path.join(evidenceDir,'build.json'),JSON.stringify({suite:'packaged-runtime',passed:true,fullCoverage:true,sourceStable,scope:'Every exact runtime file served over HTTP; actual packaged local-server range responses and MP4 video-only track metadata; native Chromium WebGL2 desktop/touch flight, prison, photographs and mission-control smoke; metadata-only muted inline video probes, no montage playback during a live mission. Declared fixed-clock and checkpoint fixtures. Physical devices, Safari media playback and hardware FPS are not tested.',sourceSha256:manifest.entrySHA256,sourceSHA256:Object.fromEntries(manifest.files.map(item=>[item.file,item.sha256])),testSHA256:{'tests/build-browser.cjs':sha(testBytes)},executedHTTP,rangeHTTP,checks,recordedAt:new Date().toISOString()},null,2)+'\n');
  console.log('PASS deployment folder: all exact runtime hashes and desktop/native-touch flight, zero missing local assets or JavaScript/WebGL errors');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
