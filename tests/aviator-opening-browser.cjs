'use strict';
// Native ejection controls and adjacent production renders. The only spatial
// fixture is the aircraft before ejection; chute positions, clocks, camera,
// opening, crew survival and trajectories remain owned by the application.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=['index.html','assets/survival/aviator-companion.js','assets/survival/landing-water.js'];

function selectStart(){
  window.__openingBounded=true;App.frame=()=>{};
  const g=App.game;g.paused=false;g.ac.p=[coastAt(0)+1800,650,0];g.ac.v=[0,0,0];g.ac.onDeck=false;g.ac.gear=false;g.ac.yaw=-Math.PI/2;g.phase='airborne';
  for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on');
  window.__openingRandom=Math.random;Math.random=()=>.75;g.render(0);g.syncControls();
  return {aircraft:g.ac.p.slice(),velocity:g.ac.v.slice(),yaw:g.ac.yaw,rightSeat:g.rightSeat,terrain:terrainH(g.ac.p[0],g.ac.p[2]),scope:'Declared zero-speed aircraft start over original ocean before native J/two-tap EJECT. Scheduler alone is bounded; all subsequent update/render frames are original production calls.'};
}

function frame({advance,capture}){
  Math.random=window.__openingRandom;
  const g=App.game,R=g.rend,calls=[],photos=[],draw=R.drawMesh,drawSprites=R.drawSprites;
  R.drawMesh=function(name,data,count){
    if(/^chute(?:Empty|Stream)?$/.test(name))for(let i=0;i<count;i++)calls.push({name,p:Array.from(data.slice(i*20+12,i*20+15)),scale:[Math.hypot(...data.slice(i*20,i*20+3)),Math.hypot(...data.slice(i*20+4,i*20+7)),Math.hypot(...data.slice(i*20+8,i*20+11))]});
    return draw.apply(this,arguments);
  };
  R.drawSprites=function(texture,list){for(const q of list)if(q.owner?.suspended)photos.push({pose:q.photoPose,suspended:q.photoSuspended,asset:q.photoAsset,companion:!!q.owner.companion,p:q.p.slice()});return drawSprites.apply(this,arguments);};
  try{if(advance)g.update(1/60);g.render(1/60);g.syncControls();}finally{R.drawMesh=draw;R.drawSprites=drawSprites;}
  const c=g.chute,b=AviatorCompanion.view(g).chute;
  const project=p=>{const m=R.matVP,v=[...p,1],q=[0,0,0,0];for(let i=0;i<4;i++)for(let k=0;k<4;k++)q[i]+=m[k*4+i]*v[k];return {x:(q[0]/q[3]+1)*R.W/2,y:(1-q[1]/q[3])*R.H/2,w:q[3]};};
  const canopy=p=>{const points=[];for(let i=0;i<16;i++){const a=i*Math.PI/8;points.push(project([p[0]+Math.cos(a)*4.26,p[1]+5.8,p[2]+Math.sin(a)*4.26]));}return {centre:project([p[0],p[1]+5.8,p[2]]),bounds:{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))}};};
  let pixels;
  if(capture){
    const rgba=new Uint8Array(R.W*R.H*4);R.gl.readPixels(0,0,R.W,R.H,R.gl.RGBA,R.gl.UNSIGNED_BYTE,rgba);
    let nearBlackPixels=0;for(let i=0;i<rgba.length;i+=4)if(rgba[i]+rgba[i+1]+rgba[i+2]<=3)nearBlackPixels++;
    pixels={nearBlackPixels,total:R.W*R.H};
  }
  return {phase:g.phase,time:g.t,player:c&&{p:c.p.slice(),v:c.v.slice(),open:c.open,t:c.t,cineT:c.cineT,cine:c.cine,seats:c.seats.map(s=>({lead:s.lead,t:s.t,p:s.p.slice()})),live:c.live},companion:b,metres:c&&b?Math.hypot(c.p[0]-b.p[0],c.p[2]-b.p[2]):null,eye:R.eye.slice(),canvas:[R.W,R.H],quality:R.quality,gl:R.gl.getError(),draws:calls,photos,projected:c&&b?[canopy(c.p),canopy(b.p)]:null,...(capture?{pixels,png:R.canvas.toDataURL('image/png')}:{} )};
}

module.exports=async function aviatorOpening(browser,target,out){
  await fs.mkdir(out,{recursive:true});
  const before=Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await fs.readFile(path.join(root,file)))]))),harnessSHA256=sha(await fs.readFile(__filename));
  const profiles=[
    {name:'desktop-pilot',viewport:{width:1280,height:720},deviceScaleFactor:1,seat:0},
    {name:'phone-bn',viewport:{width:844,height:390},deviceScaleFactor:3,hasTouch:true,isMobile:true,seat:1}
  ].filter(p=>!process.env.INTRUDER_OPENING_PROFILE||p.name===process.env.INTRUDER_OPENING_PROFILE),results=[];
  for(const {name,seat,...options}of profiles){
    const context=await browser.newContext(options),page=await context.newPage(),errors=[],failedHTTP=[],executedHTTP=[],jobs=[];
    page.setDefaultTimeout(120000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{const file=new URL(r.url()).pathname.slice(1)||'index.html';if(r.status()>=400)failedHTTP.push({file,status:r.status()});if(files.includes(file)&&r.ok())jobs.push(r.body().then(b=>executedHTTP.push({file,sha256:sha(b)})));});
    const frames=[],screenshots=[];
    try{
      await context.addInitScript(({quality,seat})=>{
        localStorage.setItem('a6_set',JSON.stringify({quality,seat,sound:0,voices:0,assist:1,mouse:0,sens:1}));localStorage.setItem('a6_sawkeys','1');
        const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>window.__openingBounded?0:raf(t=>{if(!window.__openingBounded)fn(t);});
      },{quality:options.hasTouch?1:2,seat});
      await page.goto(target,{waitUntil:'domcontentloaded'});
      if(options.hasTouch)await page.locator('#bootFly').tap();else await page.locator('#bootFly').click();
      await page.waitForFunction(()=>App.game?.st&&document.getElementById('loader').style.display==='none',null,{polling:50});
      const fixture=await page.evaluate(selectStart);
      assert.equal(fixture.rightSeat,!!seat);assert.ok(fixture.terrain<-.8);
      await page.waitForFunction(()=>PhotoCutouts.inspect(App.rend).status==='ready',null,{polling:50});
      await page.evaluate(()=>PhotoCutouts.preparePose(App.rend,'aviator','harness'));
      if(options.hasTouch){await page.locator('#btnEject').tap();await page.locator('#btnEject').tap();}else await page.keyboard.press('j');
      const initial=await page.evaluate(frame,{advance:false,capture:false});
      assert.equal(initial.phase,'chute');assert.ok(initial.player.live.pilot&&initial.player.live.bn);assert.equal(initial.companion.lead,seat?.18:0);
      assert.deepEqual(initial.player.seats.map(s=>s.lead),[0,.18]);
      let firstFull;
      for(let n=1;n<=120;n++){
        const capture=[36,60,66,72,78,84,96].includes(n)||n>=108;
        const actual=await page.evaluate(frame,{advance:true,capture});
        assert.equal(actual.phase,'chute');assert.equal(actual.gl,0);assert.equal(actual.quality,options.hasTouch?1:2);
        if(actual.png){const file=name+'-'+String(n).padStart(3,'0')+'.png';await fs.writeFile(path.join(out,file),Buffer.from(actual.png.split(',')[1],'base64'));delete actual.png;actual.image=file;screenshots.push(file);}
        assert.ok(actual.metres<35,'Bounded physical spread stays local');
        if(n>=108)assert.ok(actual.pixels.nearBlackPixels<256,'A daytime original canopy must not contaminate the native composite with large HDR black tiles: '+actual.pixels.nearBlackPixels);
        const previous=frames.at(-1)||initial,dt=1/60;
        assert.ok(Math.abs(actual.player.cineT-previous.player.cineT-dt)<1e-8,'Every cinematic increment is its original adjacent simulation frame');
        assert.ok(Math.hypot(...actual.companion.p.map((v,k)=>v-previous.companion.p[k]))<1,'Companion position follows bounded velocity without a frame jump');
        if(!firstFull&&actual.player.open>=.82&&actual.companion.open>=.82){firstFull={frame:n,metres:actual.metres,edgeGap:actual.metres-8.52};assert.ok(firstFull.metres>=12&&firstFull.metres<23);}
        frames.push(actual);
        if(n%30===0)console.log(name+' native opening frame '+n+'/120');
      }
      assert.ok(firstFull);assert.ok(frames.at(-1).draws.filter(d=>d.name==='chute'||d.name==='chuteEmpty').length>=2,'Two physical full canopies reach production instanced GPU submissions');
      assert.equal(frames.at(-1).photos.filter(p=>p.pose==='harness'&&p.suspended).length,2,'Both real suspended photographs remain in the production sprite draw');
      await page.screenshot({path:path.join(out,name+'-native-page.png'),timeout:90000});screenshots.push(name+'-native-page.png');
      await Promise.all(jobs);assert.deepEqual(errors,[]);assert.deepEqual(failedHTTP,[]);
      const result={name,fixture,initial,firstFull,frames,screenshots,executedHTTP,errors,failedHTTP};results.push(result);
      await fs.writeFile(path.join(out,name+'.json'),JSON.stringify(result,null,2)+'\n');
    }catch(error){await fs.writeFile(path.join(out,name+'-failure.json'),JSON.stringify({message:error.stack,frames,errors,failedHTTP,executedHTTP},null,2)+'\n');await page.screenshot({path:path.join(out,name+'-failure.png'),timeout:30000}).catch(()=>{});throw error;}
    finally{await context.close();}
  }
  const after=Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await fs.readFile(path.join(root,file)))])));
  const sourceStable=files.every(file=>before[file]===after[file])&&results.every(r=>r.executedHTTP.every(source=>source.sha256===before[source.file]));
  const report={passed:true,sourceStable,sourceSHA256:before,sourceSHA256After:after,harnessSHA256,results,scope:'Focused real Chromium/SwiftShader WebGL2 diagnostic at native High desktop and Medium phone-layout quality, with native J or original two-tap EJECT. Both seat selections and120 consecutive original60Hz update/render calls per profile are preserved. Actual original-canvas PNGs retain the rocket portion and13 adjacent visible canopy frames; composite readback rejects large HDR black tiles. Only aircraft start and initial random heading are fixtures; no post-ejection position, cinematic clock, camera or outcome is assigned. Loaded HTTP source digests are retained; sourceStable identifies edits during the focused run. Not physical iPhone Safari or measured hardware FPS.'};
  await fs.writeFile(path.join(out,'aviator-opening.json'),JSON.stringify(report,null,2)+'\n');return report;
};

if(require.main===module)(async()=>{
  const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs');
  const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{const result=await module.exports(browser,'http://127.0.0.1:'+server.address().port+'/',process.argv[2]||'test-results/aviator-opening');console.log(JSON.stringify({passed:result.passed,sourceStable:result.sourceStable,profiles:result.results.map(r=>({name:r.name,firstFull:r.firstFull}))}));}
  finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
