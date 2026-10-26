'use strict';

// Native forest entry and the original river chapter are the gameplay oracle.
// Cache preparation only calls production visual helpers; it never advances
// time, moves an actor, changes health, or supplies a successful objective.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),TEST='tests/living-forest-browser.cjs',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function snapshot(){
 const files=['index.html',TEST];
 async function walk(dir){for(const entry of await fs.readdir(path.join(ROOT,dir),{withFileTypes:true})){const f=dir+'/'+entry.name;if(entry.isDirectory())await walk(f);else if(/\.(js|css|json|glsl)$/.test(f)||f.startsWith('assets/jungle/')&&f.endsWith('.webp'))files.push(f);}}
 await walk('assets');return Object.fromEntries(await Promise.all(files.sort().map(async f=>[f,sha(await fs.readFile(path.join(ROOT,f)))])));
}
function actors(){
 const g=App.game,e=g.evade,r=g.pow?.river;
 return {mission:g.mis.id,phase:g.phase,time:g.t,position:e?.p?.slice(),aircraftPosition:g.ac.p.slice(),crew:{...g.ac.crew},rounds:e?.rounds,
  searchers:(e?.searchers||[]).map(a=>({id:a.id,p:a.p?.slice(),alive:a.alive})),locals:(e?.locals||[]).map(a=>({id:a.id,p:a.p?.slice(),alive:a.alive})),
  targets:g.world.targets.map(t=>({id:t.id,alive:t.alive,hp:t.hp,p:t.p.slice()})),stage:g.pow?.stage||null,complete:!!g.pow?.complete,
  river:r?{distance:r.logicalDistance,mode:r.mode,breath:r.breath,waterY:r.waterY,streamOffset:r.streamOffset}:null,
  flags:g.pow?JSON.parse(JSON.stringify(g.pow.flags)):null,stats:g.pow?{...g.pow.stats}:null};
}
function observeFrame(){
 const g=App.game,R=g.rend,gl=R.gl,photos=[],meshes={},sprite=R._drawSpriteBatch,mesh=R.drawMesh;
 R._drawSpriteBatch=function(name,list,wind){if(name.startsWith('jungle_'))for(const p of list)photos.push({texture:name,id:p.id,kind:p.plantKind,p:p.p.slice(),root:p.groundRoot?.slice(),cols:p.cols,rows:p.rows,cell:p.cell,h:p.h,w:p.w});return sprite.call(this,name,list,wind);};
 R.drawMesh=function(name,data,count){meshes[name]=(meshes[name]||0)+(count||0);return mesh.call(this,name,data,count);};
 try{g.render(0);g.syncControls();}finally{R._drawSpriteBatch=sprite;R.drawMesh=mesh;}
 const target=window.__livingForestTarget,m=R.matVP;let projected=null;
 if(target){const [x,y,z]=target,w=m[3]*x+m[7]*y+m[11]*z+m[15];projected={w,x:(m[0]*x+m[4]*y+m[8]*z+m[12])/w,y:(m[1]*x+m[5]*y+m[9]*z+m[13])/w};}
 return {photos,meshes,jungle:JungleScenery.inspect(g,R),banks:RiverBanks.inspect(g),profile:{...JungleScenery.profiles[R.quality]},limits:{...JungleScenery.limits},eye:R.eye.slice(),forward:R.matV?[R.matV[2],R.matV[6],R.matV[10]]:null,projected,quality:R.quality,canvas:[R.W,R.H],webgl:gl.getParameter(gl.VERSION),gl:gl.getError(),contextLost:gl.isContextLost()};
}
function steerView(kind){
 const g=App.game,e=g.evade,j=JungleScenery.inspect(g,g.rend),p=e.p,bank=!!g.pow?.river;
 const rows=j.plants.map(plant=>{const source=j.records.find(r=>r.kind===plant.kind);return {...plant,height:plant.h*source.bodyFraction,distance:Math.hypot(plant.groundRoot[0]-p[0],plant.groundRoot[2]-p[2])};});
 let candidates;
 if(kind==='forest-near')candidates=rows.filter(r=>r.id.startsWith('thicket:')&&r.distance>3&&r.distance<18);
 else if(kind==='forest-mid')candidates=rows.filter(r=>['canopy','bamboo','liana'].includes(r.kind)&&r.distance>14&&r.distance<75);
 else if(kind==='bank-near')candidates=rows.filter(r=>r.id.startsWith('nipa:')&&r.distance>14&&r.distance<60);
 else candidates=rows.filter(r=>r.id.startsWith('river-canopy-photo:')&&r.distance>25&&r.distance<100);
 candidates.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
 const target=candidates[0];if(!target)throw Error('The original scene has no visible source for '+kind+': '+JSON.stringify({count:j.count,kinds:j.counts}));
 const eyeY=bank?p[1]+g.pow.river.eyeHeight:p[1]+1.68,aimY=Math.min(target.groundRoot[1]+target.height*.48,eyeY+(kind==='forest-mid'?1.1:1.8)),dx=target.groundRoot[0]-p[0],dz=target.groundRoot[2]-p[2];
 e.hdg=Math.atan2(dx,-dz);e.look=e.pitchCmd=Math.max(-.38,Math.min(.30,Math.atan2(aimY-eyeY,Math.hypot(dx,dz))+.04));
 window.__livingForestTarget=[target.groundRoot[0],aimY,target.groundRoot[2]];
 return {kind,id:target.id,sourceKind:target.kind,distance:target.distance,heading:e.hdg,look:e.look,target:window.__livingForestTarget.slice(),scope:'View steering only; physical actor positions and simulation time are unchanged.'};
}

module.exports=async function livingForestBrowser(browser,target,evidenceDir){
 const out=path.join(evidenceDir,'living-forest');await fs.mkdir(out,{recursive:true});const source=await snapshot(),harness=source[TEST],checks=[],screenshots=[],errors=[],missing=[],executedHTTP=[],bodyFailures=[],jobs=[];
 const manifest=JSON.parse(await fs.readFile(path.join(ROOT,'assets/jungle/manifest.json'),'utf8')),expectedSources=Object.keys(manifest.plants).length+(manifest.floor?1:0)+(manifest.crown?1:0)+Object.keys(manifest.components||{}).length;
 const profiles=[{name:'desktop-medium',viewport:{width:1280,height:720},deviceScaleFactor:1},{name:'phone-medium',viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true}];
 for(const {name,...options}of profiles){
  const context=await browser.newContext(options),page=await context.newPage(),click=l=>options.hasTouch?l.tap():l.click();page.setDefaultTimeout(120000);
  const record=(nameOfCheck,actual)=>{checks.push({profile:name,name:nameOfCheck,passed:true,actual});console.log('PASS living-forest '+name+' '+nameOfCheck);};
  page.on('pageerror',e=>errors.push({profile:name,error:e.message}));
  page.on('response',response=>{if(!response.url().startsWith(target))return;const file=decodeURIComponent(new URL(response.url()).pathname.slice(new URL(target).pathname.length))||'index.html';if(response.status()>=400)missing.push({profile:name,file,status:response.status()});if(response.status()===200&&source[file])jobs.push(response.body().then(b=>executedHTTP.push({profile:name,file,sha256:sha(b)})).catch(e=>bodyFailures.push({profile:name,file,error:String(e)})));});
  const image=async(label,caption)=>{const file=name+'-'+label+'.png';await page.screenshot({path:path.join(out,file),timeout:120000});const entry={profile:name,file,caption,sha256:sha(await fs.readFile(path.join(out,file)))};screenshots.push(entry);return entry;};
  const botanicalReady=()=>page.waitForFunction(expected=>{const s=JungleScenery.inspect(App.game,App.rend);if(s.failures.length||App.rend.gl.isContextLost())throw Error(JSON.stringify(s.failures));return s.readySources===expected;},expectedSources,{polling:100,timeout:120000});
  const validate=frame=>{assert.equal(frame.quality,1);assert.match(frame.webgl,/WebGL 2/);assert.equal(frame.gl,0);assert.equal(frame.contextLost,false);assert.equal(frame.jungle.readySources,expectedSources);assert.deepEqual(frame.jungle.failures,[]);assert.ok(frame.jungle.bytes<=frame.jungle.budget);assert.ok(frame.jungle.count+frame.jungle.crowns.length<=frame.profile.total);assert.ok(frame.jungle.terrainSamples<=72&&frame.jungle.solidChecks<=36);assert.ok(frame.jungle.primitiveCounts.leafCards<=frame.profile.leafCards);assert.ok(frame.jungle.structural.length<=frame.profile.structuralTrees);assert.ok(frame.photos.length>0);assert.ok(frame.photos.every(p=>p.cols===1&&p.rows===1&&p.cell===0));if(frame.projected){assert.ok(frame.projected.w>0);assert.ok(Math.abs(frame.projected.x)<.75&&Math.abs(frame.projected.y)<.80,'The target foliage stays near the centre, rather than an empty-sky view: '+JSON.stringify(frame.projected));}};
  try{
   await context.addInitScript(()=>{sessionStorage.setItem('a6_archival_intro_seen','1');localStorage.setItem('a6_set',JSON.stringify({quality:1,sound:0,voices:0,mouse:0,seat:0,assist:1}));localStorage.setItem('a6_sawkeys','1');const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>window.__livingForestBounded?0:raf(t=>{if(!window.__livingForestBounded)cb(t);});});
   await page.goto(target,{waitUntil:'domcontentloaded'});await click(page.locator('#bootGo'));await page.locator('#wildlifeKind').selectOption('forest');await click(page.locator('#wildlifePractice'));
   await page.waitForFunction(()=>App.game?.evade?.wildlifePractice&&document.getElementById('loader').style.display==='none',null,{polling:100});
   await page.evaluate(()=>{window.__livingForestBounded=true;for(const k of Object.keys(App.keys))App.keys[k]=0;App.gctl.pitch=App.gctl.roll=0;window.__livingForestDayAtmos=JSON.parse(JSON.stringify(App.game.atm));});await botanicalReady();
   const forestBefore=await page.evaluate(actors);
   const warm=await page.evaluate(()=>{const g=App.game,R=g.rend,read=()=>JungleScenery.inspect(g,R),steps=[];for(let i=0;i<72;i++){JungleScenery.beginFrame(g,R);JungleScenery.populate(g,R,{solid:(x,z,r)=>typeof _jungleOriginalLocalSolidAt==='function'?_jungleOriginalLocalSolidAt.call(g,x,z,r):g._localSolidAt(x,z,r)});const s=read();steps.push({terrain:s.terrainSamples,solids:s.solidChecks,updates:s.thicketUpdates,count:s.count});}for(let i=0;i<4;i++)g.render(0);return {steps,last:read()};});
   assert.ok(warm.steps.every(f=>f.terrain<=72&&f.solids<=36&&f.updates<=1));assert.ok(warm.last.nearThickets>=3);assert.deepEqual(await page.evaluate(actors),forestBefore);
   const nearSteering=await page.evaluate(steerView,'forest-near'),near=await page.evaluate(observeFrame);validate(near);const added=near.photos.filter(p=>p.id?.startsWith('thicket:'));assert.ok(added.length>=3);assert.ok(added.some(p=>p.kind==='nipa')&&added.some(p=>p.kind==='fern'));assert.ok(added.every(p=>!near.jungle.obstacles.some(o=>o.id===p.id)));
   await image('near-jungle','Native jungle-practice entry, close whole-source nipa/fern thickets; view heading steered toward an actually submitted plant.');
   record('Native forest entry submits rooted close thickets within unchanged sample, texture and draw budgets',{warm:{frames:warm.steps.length,last:warm.last},steering:nearSteering,frame:near});
   const middleSteering=await page.evaluate(steerView,'forest-mid'),middle=await page.evaluate(observeFrame);validate(middle);assert.ok(middle.jungle.structural.length>0);assert.ok(Object.entries(middle.meshes).some(([name,count])=>name.startsWith('jungle_branch_')&&count>0));assert.deepEqual(await page.evaluate(actors),forestBefore);await image('mid-jungle','Original forest position, with branched trees and layered midstory. Only view steering and render-cache preparation were used.');
   const lane=await page.evaluate(()=>{const g=App.game,e=g.evade,p=e.p.slice();let clear=null;for(let i=0;i<16;i++){const h=e.hdg+i*Math.PI/8,dx=Math.sin(h)*.65,dz=-Math.cos(h)*.65,q=g._moveOnFoot(p[0],p[2],dx,dz,.43,e);if(Math.hypot(q[0]-p[0],q[1]-p[2])>.64){clear={heading:h,request:[dx,dz],solverEnd:q,actualActor:e.p.slice()};break;}}return {clear,position:p,blockedAtStart:g._blockedAt(p[0],p[2],.43,e)};});assert.ok(lane.clear);assert.equal(lane.blockedAtStart,false);assert.deepEqual(lane.clear.actualActor,lane.position);assert.deepEqual(await page.evaluate(actors),forestBefore);
   record('Midstory retains original positions and a clear route through the original swept movement solver',{steering:middleSteering,frame:middle,lane});

   await click(page.locator('#pauseBtn'));await click(page.locator('#pauseBody').getByRole('button',{name:'Ready Room',exact:true}));await page.evaluate(()=>{window.__livingForestBounded=false;requestAnimationFrame(t=>App.frame(t));});await click(page.locator('#powChapter [data-pow-chapter="river"]'));
   await page.waitForFunction(()=>App.game?.pow?.stage==='river'&&document.getElementById('loader').style.display==='none',null,{polling:100});await page.evaluate(()=>{window.__livingForestBounded=true;for(const k of Object.keys(App.keys))App.keys[k]=0;App.gctl.pitch=App.gctl.roll=0;});await botanicalReady();
   const riverBefore=await page.evaluate(actors);await page.evaluate(()=>{for(let i=0;i<8;i++)App.game.render(0);});
   const bankSteering=await page.evaluate(steerView,'bank-near'),bank=await page.evaluate(observeFrame);validate(bank);assert.ok(bank.banks.plants>80);assert.ok(bank.banks.nipa>0&&bank.banks.ferns>0&&bank.banks.bamboo>0);assert.ok(bank.banks.accessGaps>0);assert.equal(bank.banks.additionalTextureBytes,0);assert.equal(bank.banks.collisionSolids,0);assert.equal(bank.banks.walkY,bank.banks.waterY+.35);assert.ok(bank.photos.some(p=>p.id?.startsWith('nipa:'))&&bank.photos.some(p=>p.id?.startsWith('fern:')));assert.ok((bank.meshes.powRiverBankLeft||0)>0&&(bank.meshes.powRiverBankRight||0)>0);assert.ok(bank.banks.photographicDraws>0);
   const rearPhotos=bank.photos.filter(p=>p.id?.startsWith('river-canopy-photo:'));assert.ok(rearPhotos.length>0,'The rear forest belt reaches actual complete-photo draw submission');assert.ok(rearPhotos.every(p=>p.texture==='jungle_canopy'&&p.kind==='canopy'&&!bank.jungle.structural.some(t=>t.id===p.id)));assert.ok(bank.jungle.structural.some(t=>t.kind==='tree'&&t.id.startsWith('tree:')),'The near bank belt retains structural branches');
   const bankLanes=await page.evaluate(()=>{const g=App.game,r=g.pow.river,b=g.pow.base,x=b[0]+94;return [-1,1].map(side=>({side,points:[-48,-24,0,24,48].map(dz=>{const p=[x+side*15.3,r.waterY+.35,b[2]+dz];return {p,blocked:POW.blocked(g,p[0],p[2],.32,p[1])};})}));});assert.ok(bankLanes.every(side=>side.points.some(p=>!p.blocked)));assert.deepEqual(await page.evaluate(actors),riverBefore);
   await image('native-river-bank','Original Red River chapter and clock: whole nipa, fern and bamboo bank layers, with the sloping mud and original open water boundary.');
   record('Original river chapter submits full-resolution layered banks and retains both bank access lanes',{steering:bankSteering,frame:bank,lanes:bankLanes});

   // A separately labelled renderer-only daylight material fixture uses the
   // actual daytime atmosphere collected in native forest practice. River
   // clock, actors, health, distance and objectives remain untouched.
   await page.evaluate(()=>{const R=App.rend,day=window.__livingForestDayAtmos;window.__livingForestAtmos=R.setAtmos;window.__livingForestEpisode=R.setEpisode;R.setAtmos=function(){return window.__livingForestAtmos.call(this,day);};R.setEpisode=function(profile,state){return window.__livingForestEpisode.call(this,profile?{...profile,ambient:day.amb.slice(),atmosphere:day}:profile,state);};});
   try{
    const dayNear=await page.evaluate(observeFrame);validate(dayNear);await image('daylight-bank-materials','Declared renderer-only daylight material view of the same riverbank. Uses the native forest atmosphere; the river clock and actors were not advanced.');
    const dayMiddleSteering=await page.evaluate(steerView,'bank-mid'),dayMiddle=await page.evaluate(observeFrame);validate(dayMiddle);assert.ok(dayMiddle.photos.some(p=>p.id===dayMiddleSteering.id&&p.texture==='jungle_canopy'));await image('daylight-bank-depth','Declared renderer-only daylight view toward the complete photographic rear tree belt, behind the branched near trees and nipa/fern layers; river positions and gameplay state are unchanged.');assert.deepEqual(await page.evaluate(actors),riverBefore);
    record('Separate daylight material fixtures expose leaf detail without moving river actors or advancing its clock',{near:dayNear,middle:dayMiddle,steering:dayMiddleSteering,scope:'Renderer atmosphere/episode ambient only; no claim that the original night chapter advanced to daytime.'});
   }finally{await page.evaluate(()=>{const R=App.rend;R.setAtmos=window.__livingForestAtmos;R.setEpisode=window.__livingForestEpisode;delete window.__livingForestAtmos;delete window.__livingForestEpisode;App.game.render(0);});}
   assert.deepEqual(await page.evaluate(actors),riverBefore);assert.deepEqual(errors.filter(e=>e.profile===name),[]);assert.deepEqual(missing.filter(e=>e.profile===name),[]);
  }catch(error){await page.screenshot({path:path.join(out,name+'-failure.png'),timeout:30000}).catch(()=>{});const state=await page.evaluate(()=>({screen:window.App?.screen,phase:window.App?.game?.phase,forest:window.App?.rend&&window.JungleScenery?.inspect(App.game,App.rend),banks:window.App?.game&&window.RiverBanks?.inspect(App.game)})).catch(()=>null);await fs.writeFile(path.join(out,name+'-failure.json'),JSON.stringify({passed:false,error:error.stack,state,checks,errors,missing},null,2));throw error;}
  finally{await Promise.all(jobs);await context.close();}
 }
 assert.deepEqual(await snapshot(),source);assert.equal(sha(await fs.readFile(path.join(ROOT,TEST))),harness);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.deepEqual(bodyFailures,[]);assert.ok(executedHTTP.every(r=>r.sha256===source[r.file]));
 for(const profile of profiles)for(const file of ['index.html','assets/render/jungle-scenery.js','assets/render/river-bank.js','assets/jungle/manifest.json'])assert.ok(executedHTTP.some(r=>r.profile===profile.name&&r.file===file));
 const report={suite:'living-forest',passed:true,sourceStable:true,sourceSHA256:source,testSHA256:{[TEST]:harness},checks,screenshots,executedHTTP,errors,missing,bodyFailures,scope:'Actual WebGL2 desktop and phone Chromium layouts at Medium quality. Native forest and river chapter entry, production visual cache warming, observed renderer submissions and original collision queries. View steering changes orientation only. The two explicitly labelled daylight bank images override renderer atmosphere/episode ambient for material inspection; original night clock and all actor/gameplay state remain unchanged. No mission success, health or player position is assigned. Physical Safari, human difficulty and hardware frame rate are not tested.'};
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 await fs.writeFile(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Living forest native visual review</title><style>body{background:#111b18;color:#e9efe6;font:16px/1.45 system-ui;max-width:1300px;margin:24px auto;padding:0 16px}a{color:#d7e8bc}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}figure{margin:0;padding:12px;background:#1e2b25}img{width:100%;height:auto}figcaption{font-size:14px;margin-top:8px}code{overflow-wrap:anywhere;font-size:11px}</style><h1>Living forest: native visual review</h1><p>'+escape(report.scope)+'</p><p><a href="results.json">Source-bound results and actual draw submissions</a></p><main>'+screenshots.map(s=>'<figure><a href="'+escape(s.file)+'"><img loading="lazy" src="'+escape(s.file)+'" alt="'+escape(s.caption)+'"></a><figcaption><strong>'+escape(s.profile)+'</strong><br>'+escape(s.caption)+'<br><code>SHA256 '+s.sha256+'</code></figcaption></figure>').join('')+'</main>');
 return report;
};
