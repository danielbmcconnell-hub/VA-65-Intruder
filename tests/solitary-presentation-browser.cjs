'use strict';
// Real chapter chooser, original activity inputs and original game updates.
// Geometry is read without scrolling a cue into view from the test.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
module.exports=async function solitaryPresentation(browser,target,evidenceDir){
 const out=path.join(evidenceDir,'solitary-presentation');await fs.mkdir(out,{recursive:true});
 const files=['assets/flight/mission-demo.js','assets/pow/confinement-goals.js','assets/pow/confinement-goals.css','assets/pow/captivity.js'],sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await fs.readFile(path.join(ROOT,f)))]))),errors=[],samples=[],screenshots=[];
 const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await context.addInitScript(()=>{localStorage.setItem('a6_set',JSON.stringify({quality:1,sound:0,voices:0,mouse:0,seat:0,assist:1,sens:1}));localStorage.setItem('a6_sawkeys','1');});
  await page.goto(target,{waitUntil:'domcontentloaded'});await page.locator('#bootGo').tap();await page.locator('#powChapter [data-solitary-demo]').tap();await page.waitForFunction(()=>App.game?.pow?.stage==='solitary'&&document.getElementById('loader').style.display==='none',null,{polling:50});await page.evaluate(()=>{App.frame=()=>{};POW.updateUI(App.game);MissionDemo.render(App.game);});
  let result;
  for(let chunk=0;chunk<90;chunk++){
   result=await page.evaluate(seen=>{
    const g=App.game,rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};let sample=null,miss=null;
    for(let step=0;step<60&&!MissionDemo.snapshot(g).finished;step++){
     g.update(.1);MissionDemo.render(g);const c=g.pow.captivity,panel=document.getElementById('pow-captivity'),header=panel?.querySelector('.pow-top[data-demo-controls-active]');if(!c.open||!header)continue;
     let kind,node;if(c.tab==='memory'){kind='memory';node=panel.querySelector('[data-memory-position].pow-active');}else if(c.tab==='exercise'){kind='exercise';node=[...panel.querySelectorAll('button')].find(b=>!b.disabled&&/^(Left shoulder|Right shoulder)$/.test(b.textContent));}else if(c.tab==='tap'){kind='tap';node=panel.querySelector('[data-tap-signal]');if(!node?.textContent.includes('•'))node=null;}
     if(!node||seen.includes(kind))continue;const cue=rect(node),head=rect(header),controls=rect(header.querySelector('.mission-demo-controls')),bounds=rect(panel),fits=cue.top>=head.bottom-1&&cue.bottom<=Math.min(innerHeight,bounds.bottom)+1&&controls.top>=0&&controls.bottom<=innerHeight;
     const observed={kind,text:node.textContent,cue,header:head,controls,modal:bounds,viewport:[innerWidth,innerHeight],scroll:panel.scrollTop,time:MissionDemo.snapshot(g).elapsed};
     if(fits){sample=observed;break;}miss=observed;
    }
    return {sample,miss,demo:MissionDemo.snapshot(g),practice:POW.ConfinementGoals.view(g).practice,complete:!!g.pow.complete,outcome:g.pow.outcome||null,gl:g.rend.gl.getError()};
   },samples.map(s=>s.kind));
   if(result.sample){samples.push(result.sample);await page.evaluate(()=>{App.game.render(0);App.game.syncControls();});const file='phone-'+result.sample.kind+'-visible.png';await page.screenshot({path:path.join(out,file)});screenshots.push(file);console.log('PASS solitary presentation '+result.sample.kind+' cue and original demo controls visible together');}
   if(result.demo.finished||result.demo.paused)break;
  }
  assert.deepEqual(samples.map(s=>s.kind).sort(),['exercise','memory','tap'],'Each actual activity cue must be visible below the existing sticky controls without test scrolling: '+JSON.stringify(result));assert(result.demo.finished&&result.demo.success);assert.equal(result.practice.done,7);assert.equal(result.complete,false);assert.equal(result.outcome,null);assert.equal(result.gl,0);assert.deepEqual(errors,[]);
  for(const f of files)assert.equal(hash(await fs.readFile(path.join(ROOT,f))),sources[f],f+' changed during presentation proof');
  const report={passed:true,sources,samples,screenshots,result,errors,scope:'Native phone-layout Chromium chooser and original computer inputs, original fixed-step updates and WebGL renders. Actual lit memory tile, exercise control and incoming tap pulse each share the viewport with the original demonstration controls. The test never scrolls the activity or injects answers, rewards, condition or completion. All seven tasks are subsequently earned; original POW outcomes remain unset. Physical iPhone Safari remains untested.'};await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');return report;
 }catch(error){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:error.stack,samples,errors,diagnostic:await page.evaluate(()=>({demo:MissionDemo.snapshot(),goals:POW.ConfinementGoals.view(App.game)})).catch(()=>null)},null,2)+'\n');throw error;}finally{await context.close();}
};
if(require.main===module)(async()=>{const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs'),server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{const r=await module.exports(browser,'http://127.0.0.1:'+server.address().port+'/',process.argv[2]||'test-results/objective-presentation');console.log(JSON.stringify({passed:r.passed,samples:r.samples.length}));}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
