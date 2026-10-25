'use strict';
// Native J/touch ejection and production render programs. Coverage cameras and
// individually isolated terrain draws are declared inspection fixtures; GPU
// terrain precision is the shore oracle, while CPU/GPU differences stay visible.
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const loadedHarnessSHA256=sha(fs.readFileSync(__filename));
async function inventory(dir='assets'){
 const out=[];
 for(const entry of await fsp.readdir(path.join(root,dir),{withFileTypes:true})){
  const file=dir+'/'+entry.name;
  if(entry.isDirectory())out.push(...await inventory(file));else if(/\.(js|css|json|glsl)$/.test(file))out.push(file);
 }
 return out;
}
async function snapshot(){
 const files=['index.html',...await inventory()].sort();
 return Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await fsp.readFile(path.join(root,file)))])));
}
// These functions are serialized directly into the real application page.
// Their actual compiled function text is separately recorded below.
function installGPUHelpers(){
 const R=App.rend,gl=R.gl;
 function png(pixels){
  const canvas=document.createElement('canvas');canvas.width=R.W;canvas.height=R.H;
  const ctx=canvas.getContext('2d'),im=ctx.createImageData(R.W,R.H);
  for(let y=0;y<R.H;y++)im.data.set(pixels.subarray(y*R.W*4,(y+1)*R.W*4),(R.H-1-y)*R.W*4);
  ctx.putImageData(im,0,0);return canvas.toDataURL('image/png');
 }
 function feedback({points,inputSize,outputSize,source,expression,uniforms={}}){
  let vs,fs,program,vao,input,output;
  try{
   const compile=(type,text)=>{
    const shader=gl.createShader(type);gl.shaderSource(shader,text);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(message);}
    return shader;
   };
   const outputType=outputSize===1?'float':'vec'+outputSize;
   vs=compile(gl.VERTEX_SHADER,'#version 300 es\nprecision highp float;\nlayout(location=0)in vec'+inputSize+' samplePoint;\nout '+outputType+' sampleResult;\n'+source+'\nvoid main(){sampleResult='+expression+';gl_Position=vec4(0,0,0,1);}');
   fs=compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;\nout vec4 color;\nvoid main(){color=vec4(0);}');
   program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);
   gl.transformFeedbackVaryings(program,['sampleResult'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
   vao=gl.createVertexArray();gl.bindVertexArray(vao);
   input=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,input);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points.flat()),gl.STATIC_DRAW);
   gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,inputSize,gl.FLOAT,false,0,0);
   output=gl.createBuffer();gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER,output);gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER,points.length*outputSize*4,gl.DYNAMIC_READ);
   gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,output);gl.useProgram(program);
   for(const [name,value]of Object.entries(uniforms))gl.uniform1f(gl.getUniformLocation(program,name),value);
   gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,points.length);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);
   const values=new Float32Array(points.length*outputSize);gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER,0,values);return values;
  }finally{
   gl.disable(gl.RASTERIZER_DISCARD);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindVertexArray(null);
   if(input)gl.deleteBuffer(input);if(output)gl.deleteBuffer(output);if(vao)gl.deleteVertexArray(vao);
   if(program)gl.deleteProgram(program);if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);
  }
 }
 window.__coastGPU={png,feedback};
}
function selectEjectionFixture(){
 window.__coastBounded=true;App.frame=()=>{};const g=App.game,z=0;
 let lo=coastAt(z)-1500,hi=coastAt(z)+1500;
 for(let i=0;i<50;i++){const x=(lo+hi)/2;if(terrainH(x,z)>-.35)lo=x;else hi=x;}
 const shore=(lo+hi)/2;
 g.paused=false;g.ac.p=[shore+80,650,z];g.ac.v=[0,0,0];g.ac.onDeck=false;g.ac.gear=false;g.phase='airborne';g.ac.yaw=-Math.PI/2;
 for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on');
 window.__coastRandom=Math.random;Math.random=()=>.75;g.render(0);g.syncControls();
 return {shore,z,terrain:terrainH(shore,z),TER:{...TER},aircraft:g.ac.p.slice(),scope:'Declared aircraft start/velocity/heading over the existing coast and deterministic initial ejection random fixture. Native J/touch eject, two surviving crew, original chute update, camera and renderer remain authoritative.'};
}
function nativeFrame(steps){
 Math.random=window.__coastRandom;const g=App.game;
 for(let i=0;i<steps;i++)g.update(1/60);
 g.render(1/60);g.syncControls();
 const R=g.rend,m=R.matV,forward=[-m[2],-m[6],-m[10]],length=Math.hypot(...forward);
 return {phase:g.phase,time:g.t,chute:g.chute&&{p:g.chute.p.slice(),open:g.chute.open,t:g.chute.t,live:g.chute.live,cineT:g.chute.cineT,cine:g.chute.cine},camera:R.eye.slice(),forward:forward.map(n=>n/length),quality:R.quality,canvas:[R.W,R.H],gl:R.gl.getError()};
}
function approachHandoff(){
 const g=App.game;let steps=0;
 while(g.phase==='chute'&&g.chute.cineT<g.chute.cine-.12&&steps++<600)g.update(1/60);
 return {steps,phase:g.phase,cineT:g.chute?.cineT,cine:g.chute?.cine,scope:'Original simulation is fast-forwarded to the final120ms of the cinematic; the following adjacent frames each run the original1/60s update and full renderer. No camera or cinematic time is assigned.'};
}
function shoreCoverage(fixture){
 const g=App.game,R=g.rend,gl=R.gl;g.paused=true;App.screen='coastal-scenery-inspection';
 R.floatBuf=false;R.resize(320,180,1);R.setEpisode(null);R.setFires([]);R.shadowOn=false;NearGround.prepare(null,R);
 const {feedback,png}=window.__coastGPU;
 const project=(x,y)=>{
  const m=R.invVP,ndc=[(x+.5)/R.W*2-1,(y+.5)/R.H*2-1,1,1],p=[0,0,0,0];
  for(let a=0;a<4;a++)for(let b=0;b<4;b++)p[a]+=m[b*4+a]*ndc[b];
  for(let a=0;a<3;a++)p[a]/=p[3];
  const k=-R.eye[1]/(p[1]-R.eye[1]);
  return [R.eye[0]+(p[0]-R.eye[0])*k,R.eye[2]+(p[2]-R.eye[2])*k];
 };
 const rows=[];
 for(const offset of [0,.25,1,7.9,8.1,16.1]){
  R.setCamera([fixture.shore+offset,650,fixture.z],[0,-1,0],[0,0,-1],62,.35,60000,R.W/R.H);
  const points=[];
  for(let y=0;y<R.H;y++)for(let x=0;x<R.W;x++)points.push(project(x,y));
  const heights=feedback({points,inputSize:2,outputSize:1,source:GLSL_NOISE+GLSL_TERRAIN,expression:'terrainH(samplePoint)',uniforms:{uMtn:TER.mtn,uSeed:TER.seed}}),cpu=points.map(p=>terrainH(...p));
  const draw=()=>{
   R.begin();gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);R.drawSea(30,0,null);
   const pixels=new Uint8Array(R.W*R.H*4);gl.readPixels(0,0,R.W,R.H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
  };
  const a=draw(),b=draw(),mask=new Uint8Array(a.length);
  let considered=0,falseSea=0,falseLand=0,repeatChangedPixels=0,cpuError=0,cpuConsidered=0;
  for(let i=0;i<heights.length;i++){
   const visible=a[i*4+3]>127,wet=heights[i]<-.35;
   if([0,1,2,3].some(k=>a[i*4+k]!==b[i*4+k]))repeatChangedPixels++;
   if(Math.abs(heights[i]+.35)>.75){considered++;if(visible&&!wet)falseSea++;if(!visible&&wet)falseLand++;}
   if(Math.abs(cpu[i]+.35)>2){cpuConsidered++;if(visible!==(cpu[i]<-.35))cpuError++;}
   mask.set(visible?wet?[24,108,180,255]:[240,50,40,255]:wet?[255,220,0,255]:[30,110,45,255],i*4);
  }
  rows.push({offset,considered,falseSea,falseLand,unambiguousErrorPixels:falseSea+falseLand,repeatChangedPixels,cpuError,cpuConsidered,gl:gl.getError(),imagePNG:png(a),maskPNG:png(mask)});
 }
 return {width:R.W,height:R.H,TER:{...TER},rows,scope:'Actual production ocean program/mesh at frozen time30 and wave0, six declared downward camera translations. Alpha compared with original GLSL terrain through real GPU transform feedback at projected pixel coordinates, excluding only the .75m ambiguity band. CPU comparisons use a separate2m band and remain diagnostic because CPU/GPU noise precision differs.'};
}
function terrainOwnership(){
 const g=App.game,R=g.rend,gl=R.gl;g.paused=true;R.floatBuf=false;R.resize(400,300,1);R.setEpisode(null);NearGround.prepare(null,R);
 const x=-6000,z=0,height=terrainH(x,z);R.setCamera([x,height+1100,z],[0,-1,0],[0,0,-1],62,.35,60000,R.W/R.H);
 const draw=level=>{
  R.begin();gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const original=gl.drawElements;let calls=0;
  gl.drawElements=function(){const current=calls++;if(current===level)return original.apply(this,arguments);};
  try{R.drawTerrain(TER.mtn,TER.seed,false);}finally{gl.drawElements=original;}
  const pixels=new Uint8Array(R.W*R.H*4);gl.readPixels(0,0,R.W,R.H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {pixels,calls};
 };
 const core=draw(0),ring=draw(1),mask=new Uint8Array(core.pixels.length),covered=(pixels,i)=>pixels[i*4+3]>127;
 let corePixels=0,ringPixels=0,totalOverlapPixels=0,interiorOverlapPixels=0,boundaryTiePixels=0;
 for(let i=0;i<R.W*R.H;i++){
  const a=covered(core.pixels,i),b=covered(ring.pixels,i),x=i%R.W,y=Math.floor(i/R.W);
  const interior=a&&x>0&&x<R.W-1&&y>0&&y<R.H-1&&[i-1,i+1,i-R.W,i+R.W].every(k=>covered(core.pixels,k));
  corePixels+=a;ringPixels+=b;if(a&&b){totalOverlapPixels++;if(interior)interiorOverlapPixels++;else boundaryTiePixels++;}
  mask.set(a&&b?interior?[255,35,25,255]:[255,210,35,255]:a?[30,100,220,255]:b?[45,160,65,255]:[0,0,0,255],i*4);
 }
 const png=window.__coastGPU.png;
 return {camera:R.eye.slice(),worldTerrain:height,cmN:R.cmN,cmCell0:R.cmCell0,corePixels,ringPixels,totalOverlapPixels,interiorOverlapPixels,boundaryTiePixels,drawCalls:[core.calls,ring.calls],gl:gl.getError(),width:R.W,height:R.H,images:[{label:'core',png:png(core.pixels)},{label:'ring',png:png(ring.pixels)},{label:'ownership-mask',png:png(mask)}],scope:'Original terrain shader/uniforms/mesh, retaining only its first or second drawElements submission in a declared mainland inspection view. Interior means core coverage plus four covered direct neighbours. Total overlap is retained; shared-edge raster ties are separately counted and colored yellow rather than relabeled interior. Red marks actual interior double coverage. No terrain or collision data is changed.'};
}
function waterFeedback(){
 const bases=[[0,0,0],[-8003.2,2639.7,7.25],[257.18,-911.45,42.1],[25000,-30000,1000.25]],points=[];
 for(const p of bases)for(const footprint of [0,2,8,128])points.push([...p,footprint].map(Math.fround));
 points.push([37,-91,1.25,1e6].map(Math.fround));
 const source='uniform float uWave;\n'+CoastalScenery.wavesGLSL;
 const run=wave=>Array.from(window.__coastGPU.feedback({points,inputSize:4,outputSize:3,source,expression:'vec3(sceneryWaveHeight(samplePoint.xy,samplePoint.z,uWave,samplePoint.w),sceneryWaveGradient(samplePoint.xy,samplePoint.z,uWave,samplePoint.w))',uniforms:{uWave:wave}}));
 const actual=run(.65),flat=run(0),rows=[];let maxHeightError=0,maxGradientError=0;
 for(let i=0;i<points.length;i++){
  const [x,z,t,footprint]=points[i],cpu=CoastalScenery.waveSample(x,z,t,.65,footprint),gpu=actual.slice(i*3,i*3+3),heightError=Math.abs(gpu[0]-cpu.height),gradientError=Math.max(...cpu.gradient.map((n,k)=>Math.abs(gpu[k+1]-n)));
  maxHeightError=Math.max(maxHeightError,heightError);maxGradientError=Math.max(maxGradientError,gradientError);rows.push({point:points[i],cpu,gpu,heightError,gradientError});
 }
 return {rows,maxHeightError,maxGradientError,flatMax:Math.max(...flat.map(Math.abs)),gl:App.rend.gl.getError(),scope:'Actual shared production GLSL four-wave height/gradient functions run through GPU transform feedback at Float32 world coordinates, times and footprints. Compared with independent CPU waveSample math;2mm tolerance covers ordinary shader floating-point phase error. This is rendering math, not a change or test substitute for original swimming/ejection physics.'};
}
async function coastalSceneryBrowser(browser,target,evidenceDir){
 const out=path.join(evidenceDir,'coastal-scenery'),before=await snapshot(),checks=[],profiles=[],screenshots=[],errors=[],failedHTTP=[],executedHTTP=[],readFailures=[];
 const requested=[{name:'desktop',viewport:{width:1280,height:720}},{name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,hasTouch:true,isMobile:true}].filter(p=>!process.env.COAST_PROFILE||p.name===process.env.COAST_PROFILE);
 await fsp.mkdir(out,{recursive:true});let fatal=null;
 const savePNG=async(name,data)=>{await fsp.writeFile(path.join(out,name),Buffer.from(data.split(',')[1],'base64'));screenshots.push('coastal-scenery/'+name);return name;};
 for(const {name,...options}of requested){
  const context=await browser.newContext(options),page=await context.newPage(),jobs=[],pending=new Set();page.setDefaultTimeout(90000);
  const record=(label,observed)=>{checks.push({name:name+' '+label,profile:name,passed:true,observed});console.log('PASS coastal-scenery '+name+' '+label);};
  const local=url=>url.startsWith(target);
  page.on('pageerror',error=>errors.push({profile:name,message:error.message}));
  page.on('request',request=>{if(local(request.url()))pending.add(request);});
  page.on('requestfinished',request=>pending.delete(request));
  page.on('requestfailed',request=>{pending.delete(request);if(local(request.url()))failedHTTP.push({profile:name,url:request.url(),failure:request.failure()});});
  page.on('response',response=>{
   if(!local(response.url()))return;
   const file=new URL(response.url()).pathname.slice(1)||'index.html';
   if(response.status()>=400)failedHTTP.push({profile:name,file,status:response.status()});
   if(before[file]&&response.status()===200)jobs.push(response.body().then(bytes=>executedHTTP.push({profile:name,file,sha256:sha(bytes)})).catch(error=>readFailures.push({profile:name,file,error:String(error)})));
  });
  const drain=async()=>{
   const deadline=Date.now()+20000;let previous=-1;
   while(pending.size||previous!==jobs.length){
    if(Date.now()>deadline)throw Error('Local HTTP reads did not settle before context closure');
    previous=jobs.length;await Promise.allSettled(jobs.slice());await page.waitForTimeout(25);
   }
  };
  try{
   await context.addInitScript(quality=>{
    localStorage.setItem('a6_set',JSON.stringify({quality,sound:0,voices:0,assist:1,mouse:0,sens:1}));localStorage.setItem('a6_sawkeys','1');
    const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>window.__coastBounded?0:raf(t=>{if(!window.__coastBounded)fn(t);});
   },options.hasTouch?1:2);
   await page.goto(target,{waitUntil:'domcontentloaded'});if(options.hasTouch)await page.locator('#bootFly').tap();else await page.locator('#bootFly').click();
   await page.waitForFunction(()=>App.game?.st&&document.getElementById('loader').style.display==='none',null,{polling:50});
   const fixture=await page.evaluate(selectEjectionFixture);
   if(options.hasTouch){await page.locator('#btnEject').tap();await page.locator('#btnEject').tap();}else await page.keyboard.press('j');
   const native=[];const first=await page.evaluate(nativeFrame,0);native.push(first);
   assert.equal(first.phase,'chute');assert.ok(first.chute.live.pilot&&first.chute.live.bn);assert.equal(first.gl,0);
   const initialImage=name+'-native-ejection.png';await page.screenshot({path:path.join(out,initialImage),timeout:90000});screenshots.push('coastal-scenery/'+initialImage);
   const approach=await page.evaluate(approachHandoff);assert.equal(approach.phase,'chute');assert.ok(approach.steps<600);
   const trace=[];
   for(let i=0;i<15;i++)trace.push(await page.evaluate(nativeFrame,1));
   const boundary=trace.findIndex((frame,i)=>i>0&&trace[i-1].chute.cineT<trace[i-1].chute.cine&&frame.chute.cineT>=frame.chute.cine);
   assert.ok(boundary>0,'Original update must actually cross the cinematic-to-straps boundary');
   const pairs=trace.slice(1).map((frame,i)=>({time:frame.chute.cineT,displacement:Math.hypot(...frame.camera.map((n,k)=>n-trace[i].camera[k])),directionDot:frame.forward.reduce((sum,n,k)=>sum+n*trace[i].forward[k],0)}));
   assert.ok(trace.every(f=>f.phase==='chute'&&f.gl===0));assert.ok(pairs.every(p=>p.displacement<2&&p.directionDot>.99),'Adjacent final cinematic/strap frames must retain a continuous eye and direction');
   const boundaryImage=name+'-native-straps-handoff.png';await page.screenshot({path:path.join(out,boundaryImage),timeout:90000});screenshots.push('coastal-scenery/'+boundaryImage);
   record('native ejection keeps both aviators and hands the camera into the straps continuously',{fixture,first,approach,trace,pairs,boundary,scope:'Original J/touch eject, original updates and fifteen adjacent native WebGL frames around the real handoff. No cinematic time, camera position or direction assigned by this test.'});
   for(const steps of [90,270]){const frame=await page.evaluate(nativeFrame,steps);assert.equal(frame.phase,'chute');assert.equal(frame.gl,0);native.push(frame);}
   const descentImage=name+'-native-descent.png';await page.screenshot({path:path.join(out,descentImage),timeout:90000});screenshots.push('coastal-scenery/'+descentImage);
   await page.evaluate(installGPUHelpers);
   const coverage=await page.evaluate(shoreCoverage,fixture);
   for(let i=0;i<coverage.rows.length;i++){
    const row=coverage.rows[i];row.image=await savePNG(name+'-shore-'+i+'.png',row.imagePNG);row.maskImage=await savePNG(name+'-shore-'+i+'-error-mask.png',row.maskPNG);delete row.imagePNG;delete row.maskPNG;
    assert.ok(row.considered>1000);assert.ok(row.unambiguousErrorPixels<=4,'Actual shore mask exceeded four unambiguous error pixels: '+JSON.stringify(row));assert.equal(row.repeatChangedPixels,0);assert.equal(row.gl,0);
   }
   record('six moving-camera shore masks agree with actual GPU terrain and frozen repeats are exact',coverage);
   const ownership=await page.evaluate(terrainOwnership);
   for(const image of ownership.images){image.file=await savePNG(name+'-lod-'+image.label+'.png',image.png);delete image.png;}
   assert.equal(ownership.cmN,48);assert.equal(ownership.cmCell0,8);assert.deepEqual(ownership.drawCalls,[9,9]);assert.ok(ownership.corePixels>1000&&ownership.ringPixels>1000);assert.equal(ownership.interiorOverlapPixels,0);assert.equal(ownership.totalOverlapPixels,ownership.boundaryTiePixels);assert.equal(ownership.gl,0);
   record('adjacent original terrain levels have zero interior double coverage with boundary raster ties retained',ownership);
   const waves=await page.evaluate(waterFeedback);
   assert.ok(waves.rows.every(r=>r.gpu.every(Number.isFinite)));assert.ok(waves.maxHeightError<=.002&&waves.maxGradientError<=.002,JSON.stringify(waves));assert.equal(waves.flatMax,0);assert.equal(waves.gl,0);
   record('actual GLSL wave heights and gradients match their CPU reference across resolved and filtered bands',waves);
   profiles.push({profile:name,fixture,native,coverage,ownership,waves});
  }catch(error){
   fatal=error;
   const diagnostic=await page.evaluate(()=>({phase:App?.game?.phase,camera:App?.rend?.eye,chute:App?.game?.chute&&{p:App.game.chute.p,cineT:App.game.chute.cineT,cine:App.game.chute.cine},gl:App?.rend?.gl.getError()})).catch(()=>null);
   await fsp.writeFile(path.join(out,name+'-failure.json'),JSON.stringify({error:error.stack||String(error),diagnostic,checks},null,2)+'\n');
   await page.screenshot({path:path.join(out,name+'-failure.png'),timeout:30000}).catch(()=>{});
  }finally{
   try{await drain();}catch(error){readFailures.push({profile:name,file:'<context-drain>',error:String(error)});fatal||=error;}
   await context.close();
  }
  if(fatal)break;
 }
 const after=await snapshot(),harnessAfter=sha(await fsp.readFile(__filename)),sourceStable=JSON.stringify(before)===JSON.stringify(after)&&harnessAfter===loadedHarnessSHA256;
 const sourceMismatches=executedHTTP.filter(row=>row.sha256!==before[row.file]),fullCoverage=requested.length===2&&profiles.length===2;
 checks.push({name:'Executed source and loaded test source stay unchanged',passed:sourceStable},{name:'Actual local HTTP resources complete without script, HTTP or body-read errors',passed:!errors.length&&!failedHTTP.length&&!readFailures.length&&!sourceMismatches.length});
 const compiledFunctions=Object.fromEntries([coastalSceneryBrowser,installGPUHelpers,selectEjectionFixture,nativeFrame,approachHandoff,shoreCoverage,terrainOwnership,waterFeedback].map(fn=>[fn.name,sha(fn.toString())]));
 const report={suite:'coastal-scenery',passed:!fatal&&fullCoverage&&checks.every(c=>c.passed),sourceStable,fullCoverage,checks,profiles,screenshots,sourceSHA256:before,sourceSHA256After:after,harness:{file:__filename,sha256:loadedHarnessSHA256,afterSHA256:harnessAfter,compiledFunctionSHA256:compiledFunctions},executedHTTP,sourceMismatches,errors,failedHTTP,readFailures,fatal:fatal?.stack||null,scope:'Chromium/SwiftShader production WebGL2 desktop and phone-layout emulation. Native ejection/adjacent camera handoff, declared production sea/terrain coverage cameras, isolated original LOD submissions and real shared-GLSL transform feedback. Exact whole-source/loaded-test and actual HTTP bindings retained; actual compiled function text hashes retained, with full module compilation separately observed by the registry runner. CPU/GPU terrain differences remain diagnostic. Not physical iPhone Safari, hardware FPS, full-speed mission footage or a universal visual-quality claim.'};
 await fsp.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
 if(fatal)throw fatal;assert.equal(report.passed,true,'Coastal scenery coverage/source/error gate failed');return report;
}
module.exports=coastalSceneryBrowser;
if(require.main===module)(async()=>{
 const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs'),server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{const report=await coastalSceneryBrowser(browser,'http://127.0.0.1:'+server.address().port+'/',process.argv[2]||'test-results');console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,profiles:report.profiles.map(p=>p.profile)},null,2));}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
