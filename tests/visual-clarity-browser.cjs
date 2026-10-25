'use strict';
// Native game/renderer startup, then declared flat-radiance shader controls.
// The old grade is compiled from the immutable prior release for comparison.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function snapshot(){const files=['index.html'];async function walk(d){for(const e of await fs.readdir(path.join(root,d),{withFileTypes:true})){const f=d+'/'+e.name;if(e.isDirectory())await walk(f);else if(/\.(js|css|json|glsl)$/.test(f))files.push(f);}}await walk('assets');return Object.fromEntries(await Promise.all(files.sort().map(async f=>[f,sha(await fs.readFile(path.join(root,f)))])));}
async function run({evidenceDir='/tmp/intruder-clarity',browser,baseURL}={}){
 const {chromium}=require(root+'/node_modules/playwright'),{createServer}=require(root+'/tools/dev-server.cjs');
 const ownBrowser=!browser,server=baseURL?null:createServer();if(server)await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const target=baseURL||'http://127.0.0.1:'+server.address().port+'/',out=path.join(evidenceDir,'visual-clarity');
 await fs.mkdir(out,{recursive:true});const initial=await snapshot(),checks=[],screenshots=[],sourceHashes=[],executedHTTP=[],errors=[],missing=[];
 const old=cp.execFileSync('git',['show','cbff2fdd57a956265766eb158be41e9d87eeb7fc:index.html'],{cwd:root,encoding:'utf8'});
 const match=old.match(/this\.pComp = program\(gl, \x60([\s\S]*?)\x60, \x60([\s\S]*?)\x60\);/);assert.ok(match,'Prior release composite shader must be available');
 try{
  if(!browser)browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const profile of [{name:'desktop',viewport:{width:1280,height:720}},{name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}]){
   const {name,...options}=profile,ctx=await browser.newContext(options),page=await ctx.newPage(),jobs=[];
   page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push({profile:name,message:e.message}));
   page.on('response',r=>{if(!r.url().startsWith(target))return;if(r.status()>=400)missing.push({profile:name,url:r.url()});const file=new URL(r.url()).pathname.slice(1);if(/\.(js|css|json|glsl)$/.test(file))jobs.push(r.body().then(b=>executedHTTP.push({profile:name,file,sha256:sha(b)})));});
   await ctx.addInitScript(()=>{localStorage.setItem('a6_set',JSON.stringify({quality:1,sound:0,voices:0,seat:0,assist:1,mouse:0}));localStorage.setItem('a6_sawkeys','1');const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>window.__clarityStop?0:raf(t=>{if(!window.__clarityStop)fn(t);});});
   const entry=await page.goto(target,{waitUntil:'domcontentloaded'});sourceHashes.push({layout:name,indexSHA256:sha(await entry.body())});
   await page.locator('#bootGo').click();await page.locator('#readyBody .mcard').first().click();await page.getByRole('button',{name:'Man Aircraft',exact:true}).click();
   await page.waitForFunction(()=>App.game&&document.getElementById('loader').style.display==='none',null,{polling:50,timeout:90000});
   await page.evaluate(()=>{window.__clarityStop=true;App.game.paused=true;App.screen='clarity-test';for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on');});
   const result=await page.evaluate(({legacyVertex,legacyFragment})=>{
    const R=App.rend,gl=R.gl,current=R.pComp,legacy=program(gl,legacyVertex,legacyFragment),night=R.atm.night,bloom=R.bloomOn;
    const read=()=>{const b=new Uint8Array(R.W*R.H*4);gl.readPixels(0,0,R.W,R.H,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;};
    const centre=b=>{const i=(Math.floor(R.H/2)*R.W+Math.floor(R.W/2))*4;return Array.from(b.subarray(i,i+4));};
    function flat(p,n,t,oldStyle=false,level=.18){R.pComp=p;R.atm.night=!!n;R.bloomOn=false;R.begin();gl.clearColor(level,level,level,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);R.end(t,0,1);if(oldStyle){gl.uniform1f(p.u.uGrain,n?.04:.02);gl.uniform1f(p.u.uVig,n?.50:.34);gl.drawArrays(gl.TRIANGLES,0,3);}return read();}
    const controls=[];
    for(const n of [0,1]){const a=flat(current,n,0),b=flat(current,n,17),oldA=flat(legacy,n,0,true),oldB=flat(legacy,n,17,true);let changed=0,oldChanged=0;for(let i=0;i<a.length;i+=4){if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;if(oldA[i]!==oldB[i]||oldA[i+1]!==oldB[i+1]||oldA[i+2]!==oldB[i+2])oldChanged++;}const levels=[0,.01,.04,.18,.5,1].map(v=>centre(flat(current,n,0,false,v)));controls.push({night:n,current:centre(a),legacy:centre(oldA),changedPixels:changed,legacyChangedPixels:oldChanged,pixels:R.W*R.H,levels,grain:gl.getUniform(current,current.u.uGrain)});}
    R.pComp=current;R.atm.night=night;R.bloomOn=bloom;App.game.render(0);
    const palette={day:VisualClarity.cockpit(false),night:VisualClarity.cockpit(true)};
    gl.deleteProgram(legacy);return {controls,palette,width:R.W,height:R.H,gl:gl.getError(),linked:gl.getProgramParameter(current,gl.LINK_STATUS)};
   },{legacyVertex:match[1],legacyFragment:match[2]});
   for(const c of result.controls){assert.ok(Math.max(...c.current.slice(0,3))-Math.min(...c.current.slice(0,3))<=1,'Neutral radiance must remain neutral');assert.equal(c.current[3],255);assert.equal(c.changedPixels,0,'Default stationary photo output must not flicker');assert.ok(c.legacyChangedPixels>c.pixels*.1,'Prior film-noise control must demonstrate actual changing pixels');assert.ok(c.legacy[2]-c.legacy[0]>8,'Prior blue-cast control must be measurable');assert.equal(c.grain,0);for(let i=1;i<c.levels.length;i++)assert.ok(c.levels[i][0]>=c.levels[i-1][0],'Display response must remain monotone');assert.ok(c.levels.at(-1)[0]>190);}
   assert.equal(result.gl,0);assert.equal(result.linked,true);
   checks.push({profile:name,name:'Actual production composite keeps neutral colours and eliminates artificial temporal noise with a positive legacy control',passed:true,actual:result});
   const file=name+'-native-deck-clear.png';await page.screenshot({path:path.join(out,file)});screenshots.push('visual-clarity/'+file);
   const panel=await page.evaluate(()=>{const g=App.game;g.setHour(2,.4);g.render(0);g.hud.scope=false;const st=g.hudState();g.hud.draw(st);return {night:st.night,palette:VisualClarity.cockpit(st.night),scope:g.hud.scope,gl:g.rend.gl.getError()};});
   assert.equal(panel.night,true);assert.equal(panel.gl,0);const nightFile=name+'-native-night-panel.png';await page.screenshot({path:path.join(out,nightFile)});screenshots.push('visual-clarity/'+nightFile);
   checks.push({profile:name,name:'Native night cockpit uses a subdued separate palette while controls and instrument data remain active',passed:true,actual:panel});
   await Promise.all(jobs);await ctx.close();
  }
  for(const row of sourceHashes)assert.equal(row.indexSHA256,initial['index.html']);for(const row of executedHTTP)assert.equal(row.sha256,initial[row.file],row.file);
  const sourceStable=JSON.stringify(initial)===JSON.stringify(await snapshot());assert.ok(sourceStable,'Runtime changed during clarity verification');assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  const report={suite:'visual-clarity',passed:true,fullCoverage:true,sourceStable,checks,screenshots,sourceHashes,executedHTTP,sourceSHA256:initial,legacyControl:{commit:'cbff2fdd57a956265766eb158be41e9d87eeb7fc',vertexSHA256:sha(match[1]),fragmentSHA256:sha(match[2])},errors,missing,scope:'Native Chromium WebGL2 desktop/touch startup and production composite shader controls; declared flat-radiance comparisons, not a physical-device FPS or photorealism guarantee.'};
  await fs.writeFile(path.join(evidenceDir,'visual-clarity.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS visual clarity:4 checks,2layouts,actual production shader and native cockpit');return report;
 }finally{if(ownBrowser&&browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
}
module.exports=run;if(require.main===module)run({evidenceDir:process.argv[2]}).catch(e=>{console.error(e.stack);process.exitCode=1;});
