'use strict';
// Production WebGL shadows on an explicit slope mesh and the unchanged native
// clipmap. Camera/ground samples are declared fixtures, not flown missions.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async function(browser,target,evidenceDir){
 const checks=[],screenshots=[],errors=[],out=path.join(evidenceDir,'terrain-shadows');await fs.mkdir(out,{recursive:true});
 for(const layout of [{name:'desktop',viewport:{width:1280,height:720}},{name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}]){
  const {name,...options}=layout,context=await browser.newContext(options),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  try{
   await context.addInitScript(()=>{localStorage.setItem('a6_set',JSON.stringify({quality:0,sound:0,voices:0,assist:1,sens:1}));localStorage.setItem('a6_sawkeys','1')});
   await page.goto(target,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.App&&window.TerrainShadows);await page.click('#bootFly');await page.waitForFunction(()=>App.game?.st&&App.rend?.textures?.people,null,{timeout:90000});
   const data=await page.evaluate(()=>{
    App.screen='fixture';App.game.paused=true;const R=App.rend,gl=R.gl,M=TerrainShadows;R.quality=0;R.floatBuf=false;R.resize(420,360,1);R.setEpisode(null);R.setFires([]);R.setAtmos({...R.atm,amb:[.5,.5,.5],sunCol:[0,0,0],gnd:[0,0,0],horizon:[.1,.1,.1],zenith:[.1,.1,.1],fogDens:0,night:false});
    const read=()=>{const b=new Uint8Array(R.W*R.H*4);gl.readPixels(0,0,R.W,R.H,gl.RGBA,gl.UNSIGNED_BYTE,b);return b;};
    const diff=(a,b)=>{let dark=0,changed=0;for(let i=0;i<a.length;i+=4){if(a[i]-b[i]>1)dark++;if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>1)changed++;}return {dark,changed};};
    const png=bytes=>{const c=document.createElement('canvas');c.width=R.W;c.height=R.H;const g=c.getContext('2d'),im=g.createImageData(R.W,R.H);for(let y=0;y<R.H;y++)im.data.set(bytes.subarray(y*R.W*4,(y+1)*R.W*4),(R.H-1-y)*R.W*4);g.putImageData(im,0,0);return c.toDataURL('image/png');};
    const inst=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,1,1,1,0]),images=[];
    const slope=.55,h=x=>10+slope*x;M.configure({terrainH:h});const fixture={t:0,rend:R,evade:{p:[0,10,0]}},sprite={p:[0,10,0],owner:{}};
    const opts={ox:1,oz:0,reach:1.2,radius:2,darkness:.8,quality:0};
    R.setCamera([3.6,12.73,5],[-3,-2.4,-5],[0,1,0],52,.01,100,R.W/R.H);
    M.collect(fixture,[sprite],opts);fixture.t=.2;const projected=M.collect(fixture,[sprite],opts)[0];
    const floor=new MB();floor.quad([-4,h(-4),-4],[-4,h(-4),4],[4,h(4),4],[4,h(4),-4],[.5,.5,.5]);R.meshFromBuilder('terrainShadowAuditSlope',floor);
    const centre=[.6,h(.6),0];R.setCamera([centre[0]+3,centre[1]+2.4,5],[-3,-2.4,-5],[0,1,0],52,.01,100,R.W/R.H);
    const drawSlope=blob=>{R.begin();gl.clearColor(.08,.10,.14,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);R.drawMesh('terrainShadowAuditSlope',inst,1);if(blob)R.drawGroundShadows([blob]);return read();};
    const plain=drawSlope(null),old=drawSlope({p:[.6,10,0],r:2,d:.8}),fixed=drawSlope(projected);
    images.push({name:'declared-slope-before',png:png(old)},{name:'declared-slope-projected',png:png(fixed)});
    const slopeResult={centre:projected.p,slope:projected.slope,old:diff(plain,old),projected:diff(plain,fixed),difference:diff(old,fixed),state:{depthWrites:gl.getParameter(gl.DEPTH_WRITEMASK),blend:gl.isEnabled(gl.BLEND),cull:gl.isEnabled(gl.CULL_FACE)}};
    M.configure({terrainH});
    // Select a real moderate hillside, report analytic-vs-rendered-cell error
    // rather than assuming the native8m clipmap equals its CPU height field.
    const candidates=[];
    for(let ix=0;ix<18;ix++)for(let iz=0;iz<12;iz++){
      const x=-3500-ix*251+2.8,z=-1800+iz*307+4.8,y=terrainH(x,z);if(y<8)continue;
      const dx=(terrainH(x+1,z)-terrainH(x-1,z))*.5,dz=(terrainH(x,z+1)-terrainH(x,z-1))*.5;
      if(Math.hypot(dx,dz)<.07||Math.hypot(dx,dz)>.8)continue;
      const cx=Math.floor(x/8)*8,cz=Math.floor(z/8)*8,u=(x-cx)/8,v=(z-cz)/8;
      const a=terrainH(cx,cz),b=terrainH(cx+8,cz),c=terrainH(cx+8,cz+8),d=terrainH(cx,cz+8);
      const mesh=u>=v?a+(b-a)*u+(c-b)*v:a+(c-d)*u+(d-a)*v;
      candidates.push({x,z,y,dx,dz,mesh,heightError:y-mesh});
    }
    candidates.sort((a,b)=>Math.abs(b.heightError)-Math.abs(a.heightError));
    const native=[];
    for(const p of candidates.slice(0,3)){
      R.setCamera([p.x+4,p.y+3,p.z+6],[-4,-3,-6],[0,1,0],52,.01,3000,R.W/R.H);
      const probe={t:0,rend:R,evade:{p:[p.x,p.y,p.z]}},plant={p:[p.x,p.y,p.z],owner:{}};M.collect(probe,[plant],opts);probe.t=.2;const desc=M.collect(probe,[plant],opts)[0];
      if(!desc)continue;
      const draw=blob=>{R.begin();gl.clearColor(.08,.10,.14,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);R.drawTerrain(TER.mtn,TER.seed,false);if(blob)R.drawGroundShadows([blob]);return read();};
      const base=draw(null),before=draw({p:[p.x+.6,p.y,p.z],r:2,d:.8}),after=draw(desc);
      native.push({...p,descriptor:desc,old:diff(base,before),projected:diff(base,after),difference:diff(before,after)});
      images.push({name:'native-clipmap-'+native.length+'-before',png:png(before)},{name:'native-clipmap-'+native.length+'-projected',png:png(after)});
    }
    const budget=[];
    for(let q=0;q<3;q++){
      let calls=0;M.configure({terrainH:()=>{calls++;return 10}});const g={t:0,rend:{eye:[0,11,0]},evade:{p:[0,10,0]}},roster=Array.from({length:800},(_,i)=>({p:[i*.1,10,0],owner:{}}));
      let maximum=0,count=0;for(let n=0;n<65;n++){const before=calls;count=M.collect(g,roster,{...opts,quality:q}).length;maximum=Math.max(maximum,calls-before);g.t+=.02;}
      const before=calls;g.t+=100;M.collect(g,roster,{...opts,quality:q});budget.push({quality:q,maximum,count,staticCalls:calls-before,cache:M.inspect(g).cacheSize});
    }
    M.configure({terrainH});R.setCamera([3.6,15.8,5],[-3,-2.4,-5],[0,1,0],52,.01,100,R.W/R.H);
    const pow={t:0,pow:{time:1},rend:R,evade:{p:[0,13.4,0],camp:true}},raised=M.collect(pow,[{p:[0,13.4,0],owner:{}}],opts)[0];
    const raisedFloor=new MB();raisedFloor.quad([-4,13.4,-4],[-4,13.4,4],[4,13.4,4],[4,13.4,-4],[.5,.5,.5]);R.meshFromBuilder('terrainShadowRaisedFloor',raisedFloor);
    const drawRaised=blob=>{R.begin();gl.clearColor(.08,.10,.14,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);R.drawMesh('terrainShadowRaisedFloor',inst,1);if(blob)R.drawGroundShadows([blob]);return read();};
    const raisedPlain=drawRaised(null),raisedImage=drawRaised(raised),raisedPixels=diff(raisedPlain,raisedImage);images.push({name:'declared-raised-floor',png:png(raisedImage)});
    return {slope:slopeResult,native,budget,raised,raisedPixels,glError:gl.getError(),images,terrainCell:R.cmCell0,scope:'Explicit original-shadow/plane and actual unchanged clipmap GPU fixtures; synthetic callback pressure measures calls, not device FPS.'};
   });
   await fs.writeFile(path.join(out,name+'-observations.json'),JSON.stringify({...data,images:undefined},null,2)+'\n');
   assert.equal(data.glError,0);assert.ok(data.slope.projected.dark>100);assert.ok(data.slope.difference.changed>100);assert.ok(Math.abs(data.slope.centre[1]-10.33)<1e-8);assert.ok(Math.abs(data.slope.slope[0]-.55)<1e-8);assert.deepEqual(data.slope.state,{depthWrites:true,blend:false,cull:true});
   checks.push({name:name+' actual GPU slope projects displaced centre and preserves render state',passed:true,observed:data.slope});
   assert.equal(data.native.length,3);assert.ok(data.native.some(r=>r.projected.dark>20));checks.push({name:name+' unchanged native clipmap renders projected shadows with analytic interpolation limits recorded',passed:true,observed:{cell:data.terrainCell,samples:data.native}});
   for(const q of data.budget){assert.ok(q.maximum<=[48,72,96][q.quality]);assert.equal(q.count,[128,256,384][q.quality]);assert.equal(q.staticCalls,0);assert.ok(q.cache<=1024);}
   assert.equal(data.raised.p[1],13.4);assert.deepEqual(data.raised.slope,[0,0]);assert.ok(data.raisedPixels.dark>100);checks.push({name:name+' native JavaScript callback budgets and raised-floor preservation',passed:true,observed:{budget:data.budget,raised:data.raised,raisedPixels:data.raisedPixels}});
   for(const image of data.images){const file=name+'-'+image.name+'.png';await fs.writeFile(path.join(out,file),Buffer.from(image.png.split(',')[1],'base64'));screenshots.push('terrain-shadows/'+file);}
  }finally{await context.close();}
 }
 assert.deepEqual(errors,[]);return {suite:'terrain-shadows',passed:true,checks,screenshots,browserErrors:errors,limitations:['Two of the three selected native clipmap probes show no visible long shadow in either state; the third visibly improves. Analytic local projection does not establish universal grounding or wrapping over interpolated native terrain.','The unchanged8m clipmap and CPU analytic terrain need not coincide at every fragment; no clipmap geometry, terrain physics, source art or actor position was changed.','Callback instrumentation is a bounded-work check, not a device FPS measurement.'],scope:'Actual Chromium/SwiftShader WebGL2 desktop and simulated iPhone landscape; explicit declared GPU slope/native clipmap fixtures and bounded CPU call instrumentation; physical hardware and FPS untested.'};
};
if(require.main===module){(async()=>{const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs');const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const out=process.argv[2]||'test-results/terrain-shadows';await fs.mkdir(out,{recursive:true});const result=await module.exports(browser,'http://127.0.0.1:'+server.address().port+'/',out);await fs.writeFile(path.join(out,'terrain-shadows.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({checks:result.checks.length,screenshots:result.screenshots.length,passed:true}));}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});}
