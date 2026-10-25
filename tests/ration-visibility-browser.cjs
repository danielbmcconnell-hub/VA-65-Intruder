'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),files=['assets/pow/captivity.js','assets/pow/prison-food.js','assets/pow/prison-food.css','assets/pow/ration-photo.js','tests/ration-visibility-browser.cjs'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
module.exports=async function rationVisibility(browser,target,evidenceDir){
 const out=path.resolve(evidenceDir,'ration-visibility');await fs.mkdir(out,{recursive:true});const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await fs.readFile(path.join(ROOT,f)))]))),checks=[],errors=[];
 for(const phone of [false,true]){
  const name=phone?'phone-chromium':'desktop',context=await browser.newContext(phone?{viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1}:{viewport:{width:1280,height:720}});
  try{
   const page=await context.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push({name,error:e.message}));
   await context.addInitScript(touch=>{localStorage.setItem('a6_set',JSON.stringify({quality:touch?1:2,sound:0,voices:0,mouse:0,assist:1}));localStorage.setItem('a6_sawkeys','1');const raf=requestAnimationFrame;window.requestAnimationFrame=cb=>window.__rationFixed?0:raf(t=>{if(!window.__rationFixed)cb(t);});},phone);
   const click=locator=>phone?locator.tap():locator.click();
   await page.goto(target,{waitUntil:'domcontentloaded'});await click(page.locator('#bootGo'));await click(page.locator('[data-pow-chapter=solitary]'));
   await page.waitForFunction(()=>App.game?.pow?.stage==='solitary'&&document.getElementById('loader').style.display==='none',null,{polling:50,timeout:120000});
   await page.evaluate(()=>{window.__rationFixed=true;App.game.render(0);});
   await page.waitForFunction(()=>{const p=PrisonDetail.inspect(App.rend),r=RationPhoto.inspect(App.rend);if(p.status==='error'||r.status==='error')throw Error(JSON.stringify({p,r}));return p.status==='ready'&&r.status==='ready';},null,{polling:50,timeout:120000});
   const entry=await page.evaluate(()=>{
    const g=App.game;g.update(1/60);g.render(0);g.syncControls();
    const item=g.campGeo.find(o=>o.id==='tray'),visual=PrisonFood.decorate(g,item),R=g.rend,m=R.matVP;
    const project=p=>{const v=[0,1,2,3].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);return {x:(v[0]/v[3]*.5+.5)*innerWidth,y:(.5-v[1]/v[3]*.5)*innerHeight,w:v[3]};};
    const center=project(visual.p),corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,z])=>project([visual.p[0]+x*visual.scale[0],visual.p[1],visual.p[2]+z*visual.scale[2]])),prompt=POW.ui.prompt.parentElement.getBoundingClientRect();
    window.__rationSnapshot=()=>({day:g.pow.day,actor:g.evade.p.slice(),look:g.evade.look,heading:g.evade.hdg,stats:{...g.pow.stats},meal:g.pow.captivity.daily.meal,minutes:g.pow.captivity.elapsedMinutes,quality:g.pow.captivity.foodQuality,empty:PrisonFood.eaten(g)});
    return {state:window.__rationSnapshot(),source:{p:item.p.slice(),scale:item.scale.slice()},visual:{m:visual.m,p:visual.p,scale:visual.scale},center,corners,viewport:[innerWidth,innerHeight],prompt:{x:prompt.x,y:prompt.y,width:prompt.width,height:prompt.height,text:POW.ui.prompt.textContent},focus:g.pow.focus?.id,food:PrisonFood.view(g),occluder:document.elementFromPoint(center.x,center.y)?.id,gl:R.gl.getError()};
   });
   assert.equal(entry.focus,'cell-tray');assert.equal(entry.visual.m,'rationPhotoFull');assert.ok(Math.abs(entry.visual.scale[0]-.44)<1e-8);assert.ok(entry.state.look>=-.85&&entry.state.look<=1.2);
   assert.ok(entry.center.x>0&&entry.center.x<entry.viewport[0]&&entry.center.y>0&&entry.center.y<entry.viewport[1]);assert.ok(entry.corners.every(p=>p.w>0&&p.y>0&&p.y<entry.viewport[1]));
   const width=Math.max(...entry.corners.map(p=>p.x))-Math.min(...entry.corners.map(p=>p.x));assert.ok(width>(phone?60:100),'Readable real floor photograph width '+width);
   assert.ok(entry.center.y<entry.prompt.y||entry.center.y>entry.prompt.y+entry.prompt.height,'Native prompt must leave the ration center visible');assert.equal(entry.gl,0);
   await page.screenshot({path:path.join(out,name+'-01-native-entry.png')});await fs.writeFile(path.join(out,name+'-native-entry-canvas.png'),Buffer.from((await page.locator('#gl').evaluate(c=>c.toDataURL('image/png'))).split(',')[1],'base64'));
   // Declared condition fixture only: actor, camera, tray and original callbacks
   // remain exactly where the native chapter put them. This makes capped meal
   // effects measurable without waiting hours for condition drift.
   const before=await page.evaluate(()=>{App.game.pow.stats.physical=65;App.game.pow.stats.fatigue=25;return window.__rationSnapshot();});
   let cdp;
   if(phone){const b=await page.getByRole('button',{name:'Interact · hold F',exact:true}).boundingBox();assert.ok(b);cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});}
   else await page.keyboard.down('KeyF');
   try{const opened=await page.evaluate(()=>{for(let i=0;i<40&&!PrisonFood.active(App.game);i++)App.game.update(1/60);App.game.render(0);return {open:PrisonFood.active(App.game),state:window.__rationSnapshot()};});assert.equal(opened.open,true);assert.equal(opened.state.empty,false);assert.equal(opened.state.stats.physical,before.stats.physical);assert.deepEqual(opened.state.actor,entry.state.actor);}
   finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await page.keyboard.up('KeyF');}
   await click(page.getByRole('button',{name:'Eat today’s ration',exact:true}));
   const after=await page.evaluate(()=>{App.game.render(0);return {state:window.__rationSnapshot(),feedback:document.querySelector('.prison-food-empty').textContent,src:document.querySelector('#prisonFood img').getAttribute('src'),food:PrisonFood.view(App.game),save:Store.get('pow_checkpoint',null),eatHidden:document.querySelector('#prisonFood .pri').hidden,gl:App.rend.gl.getError()};});
   assert.equal(after.state.empty,true);assert.equal(after.state.meal,before.day);assert.ok(Math.abs(after.state.stats.physical-(before.stats.physical+before.quality*1.2))<.01);assert.ok(after.state.stats.fatigue<before.stats.fatigue);assert.ok(after.state.minutes-before.minutes>=12);assert.deepEqual(after.save.stats,after.state.stats);assert.equal(after.src,'assets/prison/ration-empty.webp');assert.match(after.feedback,/Ration eaten\. Body 65\.0 →/);assert.match(after.feedback,/Fatigue 25\.0 →/);assert.match(after.feedback,new RegExp('Next serving: day '+(before.day+1)));assert.equal(after.eatHidden,true);assert.equal(after.gl,0);
   await page.screenshot({path:path.join(out,name+'-02-eaten-feedback.png')});
   const repeat=await page.evaluate(()=>{const before=window.__rationSnapshot(),saved=localStorage.getItem('a6_pow_checkpoint');document.querySelector('#prisonFood .pri').click();return {before,after:window.__rationSnapshot(),sameSave:saved===localStorage.getItem('a6_pow_checkpoint')};});assert.deepEqual(repeat.before,repeat.after);assert.equal(repeat.sameSave,true);
   await click(page.getByRole('button',{name:'Close ration view'}));
   const emptyWorld=await page.evaluate(()=>{const g=App.game;g.update(1/60);g.render(0);const item=g.campGeo.find(o=>o.id==='tray');return {m:PrisonFood.decorate(g,item).m,state:window.__rationSnapshot(),prompt:POW.ui.prompt.textContent,gl:g.rend.gl.getError()};});assert.equal(emptyWorld.m,'rationPhotoEmpty');assert.deepEqual(emptyWorld.state.actor,entry.state.actor);assert.match(emptyWorld.prompt,/Empty ration tin/);assert.equal(emptyWorld.gl,0);
   await page.screenshot({path:path.join(out,name+'-03-native-empty-tin.png')});checks.push({name,entry,before,after,repeat,emptyWorld});console.log('PASS ration visibility '+name+' native entry → held interaction → original meal → empty floor tin');
  }finally{await context.close();}
 }
 assert.deepEqual(errors,[]);for(const f of files)assert.equal(hash(await fs.readFile(path.join(ROOT,f))),sources[f],f+' changed during acceptance');
 const report={passed:true,checks,errors,sources,scope:'Actual custom WebGL2 Chromium/SwiftShader, native solitary chooser and untouched entry actor/camera. Desktop 1280×720; phone layout 844×390 with native held touch Interact. Declared physical65/fatigue25 fixture verifies original meal callback and checkpoint; no position/camera override. Physical iPhone Safari remains untested.'};await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');return report;
};
if(require.main===module)(async()=>{const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs'),server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const r=await module.exports(browser,'http://127.0.0.1:'+server.address().port+'/',process.argv[2]||path.join(ROOT,'test-results'));console.log(JSON.stringify({passed:r.passed,layouts:r.checks.length}));}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
