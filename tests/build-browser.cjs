'use strict';
// Release verification: serve only the generated deployment folder, verify all
// packaged bytes over HTTP, then launch a real flight in both browser layouts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),site=path.join(root,'dist/site');
const {chromium}=require(path.join(root,'node_modules/playwright'));
const mime={'.html':'text/html','.js':'text/javascript','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
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
  for(const item of manifest.files){const response=await fetch(target+item.file);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256)}
  checks.push({name:'All '+manifest.files.length+' packaged runtime files served with exact hashes',passed:true});
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const profile of [{name:'desktop',viewport:{width:1280,height:720}},{name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}]){
   const {name,...opts}=profile,ctx=await browser.newContext(opts),page=await ctx.newPage(),errors=[],missing=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(target))missing.push(r.url())});
   await page.goto(target,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.App);await page.click('#bootGo');await page.locator('#readyBody .mcard').first().click();await page.getByRole('button',{name:'Man Aircraft',exact:true}).click();
   await page.waitForFunction(()=>App.game&&document.getElementById('loader').style.display==='none',null,{timeout:60000});
   await page.waitForFunction(()=>FIGIMG&&['aviator','cow','farmer','female_vc','militia','nva','vegetation'].every(n=>App.rend.textures['photo_'+n]),null,{timeout:30000});
   await page.evaluate(()=>{App.game.paused=true;App.screen='build-test';for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on')});
   const cdp=opts.hasTouch?await ctx.newCDPSession(page):null;
   if(cdp){const b=await page.locator('#pickle').boundingBox();assert.ok(b);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});assert.equal(await page.evaluate(()=>App.gctl.commit),1)}else await page.keyboard.down('Space');
   const observed=await page.evaluate(()=>{const G=App.game;G.paused=false;for(let i=0;i<240;i++)G.update(1/60);G.paused=true;G.render(1/60);G.syncControls();return {mission:G.mis.id,quality:App.set.quality,shadowSize:G.rend.shadowSize,alive:G.ac.alive,onDeck:G.ac.onDeck,phase:G.phase,finite:[...G.ac.p,...G.ac.v].every(Number.isFinite),gpuError:G.rend.gl.getError(),webgl:G.rend.gl.getParameter(G.rend.gl.VERSION)}});
   if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('Space');
   assert.ok(observed.alive&&observed.finite&&!observed.onDeck);assert.equal(observed.gpuError,0);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   observed.photosDecoded=await page.evaluate(async()=>{const sources=[IMG_HERO,IMG_PHOTO,IMG_BN_STAND,IMG_BN_CROUCH,IMG_TIGER,FIG_SRC,...Object.values(PHOTOS).map(p=>p.s)];for(const src of sources){const im=new Image();im.src=src;await im.decode();if(!(im.naturalWidth>0&&im.naturalHeight>0))throw Error('Invalid photograph '+src)}return sources.length});assert.equal(observed.photosDecoded,18);
   assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
   await page.locator('#teach').dispatchEvent('click');await page.screenshot({path:path.join(root,'test-results','build-'+name+'-flight.png')});
   checks.push({name:name+' packaged flight launches and renders with fresh default settings',passed:true,observed,errors,missing});console.log('PASS '+name+' packaged flight: default quality '+observed.quality+', '+observed.photosDecoded+' images decoded');await ctx.close();
  }
  fs.writeFileSync(path.join(root,'test-results/build.json'),JSON.stringify({scope:'Runtime deployment folder byte checks and actual Chromium WebGL2 flight smoke; physical devices not tested',sourceSha256:manifest.entrySHA256,checks,recordedAt:new Date().toISOString()},null,2)+'\n');
  console.log('PASS deployment folder: all exact runtime hashes and desktop/native-touch flight, zero missing local assets or JavaScript/WebGL errors');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
