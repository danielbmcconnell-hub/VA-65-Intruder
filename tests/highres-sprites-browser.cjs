'use strict';
// Actual WebGL2 textures, native prison entry and declared clarity/ground
// fixtures. These are image-quality checks, not physical-device FPS evidence.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto');

module.exports=async function highresSprites(browser,target,evidenceDir){
  const out=path.join(evidenceDir,'highres-sprites'),checks=[],screenshots=[],errors=[],missing=[],sourceHashes=[];
  await fs.mkdir(out,{recursive:true});
  const profiles=[{name:'desktop',viewport:{width:1280,height:720},deviceScaleFactor:1},
    {name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}]
    .filter(p=>!process.env.INTRUDER_HIGHRES_PROFILE||p.name===process.env.INTRUDER_HIGHRES_PROFILE);
  const record=(layout,name,actual)=>{checks.push({layout,name,passed:true,actual});console.log('PASS highres-sprites '+layout+' '+name);};
  for(const profile of profiles){
    const {name,...options}=profile,context=await browser.newContext(options),page=await context.newPage();
    page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push({layout:name,message:e.message}));
    page.on('response',r=>{if(r.status()>=400&&r.url().includes('/assets/'))missing.push(r.url());});
    const click=locator=>profile.hasTouch?locator.tap():locator.click();
    const shot=async label=>{const file=name+'-'+label+'.png';await page.screenshot({path:path.join(out,file),timeout:90000});screenshots.push('highres-sprites/'+file);};
    try{
      await context.addInitScript(q=>{localStorage.setItem('a6_set',JSON.stringify({quality:q,sound:0,voices:0,mouse:0,seat:0,assist:1,sens:1}));localStorage.setItem('a6_sawkeys','1');},profile.hasTouch?1:2);
      const response=await page.goto(target,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
      sourceHashes.push({layout:name,indexSHA256:createHash('sha256').update(await response.body()).digest('hex')});
      await page.waitForFunction(()=>window.App&&window.PhotoCutouts&&window.PhotoSprites);
      await click(page.locator('#bootGo'));await click(page.locator('#powChapter [data-pow-chapter="escape"]'));
      await page.waitForFunction(()=>App.game?.pow?.stage==='cell'&&document.getElementById('loader').style.display==='none'&&['ready','error'].includes(PhotoCutouts.inspect(App.rend).status),null,{polling:50});
      const native=await page.evaluate(()=>{
        const g=App.game,R=App.rend,calls=[],draw=R.drawSprites;window.__highresFrame=App.frame;App.frame=()=>{};g.paused=true;
        for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on');document.getElementById('radio').innerHTML='';
        R.drawSprites=function(name,list,...rest){for(const s of list)if(s.owner)calls.push({name,kind:s.owner.kind,asset:s.photoAsset,cutout:s.photoCutout,cols:s.cols,rows:s.rows,cell:s.cell,motion:s.motion});return draw.call(this,name,list,...rest);};
        try{g.render(0);}finally{R.drawSprites=draw;}
        return {stage:g.pow.stage,quality:R.quality,canvas:[R.W,R.H],calls,loaded:PhotoCutouts.inspect(R),gl:R.gl.getError()};
      });
      assert.equal(native.loaded.status,'ready',JSON.stringify(native.loaded));assert.equal(native.loaded.failures.length,0);
      assert.ok(native.loaded.ready>=9&&native.loaded.ready===native.loaded.expected);assert.ok(native.loaded.bytes<=native.loaded.budget);
      assert.equal(native.stage,'cell');assert.equal(native.quality,profile.hasTouch?1:2);assert.ok(native.calls.length>0);
      for(const c of native.calls){assert.match(c.name,/^photo_hr_/);assert.equal(c.cutout,true);assert.equal(c.cols,1);assert.equal(c.rows,1);assert.equal(c.cell,0);assert.ok(!c.motion);}
      assert.equal(native.gl,0);await shot('native-prison-complete-photos');record(name,'Native prison renders complete one-image photographs at the normal desktop/touch quality',native);

      const assets=await page.evaluate(async()=>{
        const R=App.rend,gl=R.gl,report=[];
        for(const entry of PhotoCutouts.inspect(R).records){
          const im=new Image();im.src=entry.url;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
          const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
          let x0=c.width,y0=c.height,x1=0,y1=0,visible=0,opaque=0,transparent=0;const colors=new Set();
          for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
            const i=(y*c.width+x)*4,a=data[i+3];if(a>128){visible++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);if(a>=250)opaque++;if((x+y)%13===0)colors.add((data[i]>>3)+','+(data[i+1]>>3)+','+(data[i+2]>>3));}if(a===0)transparent++;
          }
          // A contiguous core of the photographed body must be opaque. Choose
          // the best narrow torso window, so natural arm/rifle gaps are not
          // mistaken for damaged rectangular alpha holes in the body itself.
          const bw=x1-x0,bh=y1-y0,top=Math.round(y0+bh*.30),bottom=Math.round(y0+bh*.57),windowWidth=Math.max(8,Math.round(bw*.12));
          const columns=new Float64Array(c.width);for(let x=x0;x<x1;x++)for(let y=top;y<bottom;y++)columns[x]+=data[(y*c.width+x)*4+3]>=250?1:0;
          let best=0,bestX=x0;for(let x=Math.round(x0+bw*.12);x+windowWidth<x0+bw*.88;x++){let sum=0;for(let k=0;k<windowWidth;k++)sum+=columns[x+k];if(sum>best){best=sum;bestX=x;}}
          const torsoOpaqueFraction=best/(windowWidth*(bottom-top));
          const probeY=Math.round(y0+bh*.42);let longest=0,start=0,probeX=Math.round((x0+x1)/2);
          for(let x=x0;x<=x1;x++){if(x<x1&&data[(probeY*c.width+x)*4+3]>=250){if(!start)start=x+1;}else if(start){const length=x-start+1;if(length>longest){longest=length;probeX=Math.round((start-1+x-1)/2);}start=0;}}
          const active=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0);const oldTexture=gl.getParameter(gl.TEXTURE_BINDING_2D),oldFrame=gl.getParameter(gl.FRAMEBUFFER_BINDING);
          const texture=R.textures[entry.textureName],fb=gl.createFramebuffer(),pixel=new Uint8Array(4);
          gl.bindTexture(gl.TEXTURE_2D,texture.tex);const min=gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER),mag=gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER);
          gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture.tex,0);
          const framebufferComplete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
          gl.readPixels(Math.min(entry.gpuWidth-1,Math.floor(probeX/c.width*entry.gpuWidth)),Math.min(entry.gpuHeight-1,Math.floor(probeY/c.height*entry.gpuHeight)),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
          gl.bindFramebuffer(gl.FRAMEBUFFER,oldFrame);gl.bindTexture(gl.TEXTURE_2D,oldTexture);gl.activeTexture(active);gl.deleteFramebuffer(fb);
          report.push({...entry,decoded:[c.width,c.height],visible,opaque,transparent,colors:colors.size,measuredBounds:[x0,y0,x1,y1],torsoOpaqueFraction,
            torsoWindow:[bestX,top,bestX+windowWidth,bottom],probe:[probeX,probeY],actualGPUAlpha:pixel[3],framebufferComplete,linearMin:min===gl.LINEAR_MIPMAP_LINEAR,linearMag:mag===gl.LINEAR,gl:gl.getError()});c.width=c.height=1;
        }
        return report;
      });
      for(const a of assets){
        assert.ok(Math.min(...a.decoded)>=768&&Math.max(...a.decoded)>=1024,a.key+' original resolution');
        assert.ok(Math.min(a.gpuWidth,a.gpuHeight)>=512&&Math.max(a.gpuWidth,a.gpuHeight)>=768,a.key+' actual GPU resolution');
        assert.ok(a.visible>100000&&a.transparent>10000&&a.colors>128,JSON.stringify(a));
        assert.ok(a.torsoOpaqueFraction>.97,a.key+' solid photographic body: '+a.torsoOpaqueFraction);
        assert.ok(a.actualGPUAlpha>=250,a.key+' uploaded opaque body pixel');assert.ok(a.framebufferComplete&&a.linearMin&&a.linearMag);assert.equal(a.gl,0);
        assert.deepEqual(a.measuredBounds,a.bounds,a.key+' source bounds');
      }
      record(name,'Every full photograph has native detail, a solid body core, transparent surrounding pixels and smooth whole-image GPU filtering',assets);

      const roster=await page.evaluate(()=>{
        const g=App.game,R=g.rend,center=g.world.briefed||g.world.tgtCenter;let p;delete g.pow;
        for(let r=900;r<7000&&!p;r+=160)for(let a=0;a<Math.PI*2&&!p;a+=Math.PI/8){const x=center[0]+Math.sin(a)*r,z=center[2]-Math.cos(a)*r,y=terrainH(x,z);if(y>8&&!g._localSolidAt(x,z,.5)&&Math.abs(terrainH(x+10,z-10)-y)<2)p=[x,y,z];}
        if(!p)throw Error('No dry ground for declared clarity fixture');g._startGroundPhase(p[0],p[2],0,'chute');const e=g.evade;
        e.held=0;e.spawn=e.localRefill=e.cowT=1e9;e.hdg=e.look=e.pitchCmd=0;e.locals=[];
        e.searchers=['farmer','vc','vcFem','nva','guard','aviator'].map((kind,i)=>({id:'highres-'+kind,kind,p:[p[0]+(i-2.5)*1.65,0,p[2]-8],face:Math.PI,goal:[p[0],p[2]-8],alive:true,armed:kind!=='farmer',spd:0,ph:0,seen:0}));
        e.cattle=[{id:'highres-cow',kind:'cow',p:[p[0]-3,0,p[2]-4.5],alive:true,yaw:Math.PI/2,walk:0,t:0}];
        g.atm=g.makeAtmos({...g.mis.env,hour:12});g.wreck=null;g.world.scenery=[];g.world._cells=new Map();g.world.targets=[];g.world.saf=[];g._collisionCache=null;g.paused=true;App.screen='game';
        for(const id of ['teach','teachPeek','legend','captVeil'])document.getElementById(id)?.classList.remove('on');document.getElementById('radio').innerHTML='';
        for(let n=0;n<10;n++)g.render(0);const draw=R.drawSprites,calls=[];
        R.drawSprites=function(name,list,...rest){for(const s of list)if(s.owner){const bottom=1-s.photoBounds[3]/s.photoHeight;calls.push({name,kind:s.owner.kind,asset:s.photoAsset,cols:s.cols,rows:s.rows,aspect:s.w/s.h,expectedAspect:s.photoWidth/s.photoHeight,feet:s.p[1]+s.h*bottom,ground:Math.max(0,terrainH(s.owner.p[0],s.owner.p[2])),motion:s.motion});}return draw.call(this,name,list,...rest);};
        try{g.render(0);g.syncControls();}finally{R.drawSprites=draw;}
        return {calls,quality:R.quality,canvas:[R.W,R.H],gl:R.gl.getError(),nearGround:NearGround.inspect(R)};
      });
      for(const kind of ['farmer','vc','vcFem','nva','guard','aviator','cow']){
        const c=roster.calls.find(c=>c.kind===kind);assert.ok(c,'Missing actual whole-photo '+kind);assert.match(c.name,/^photo_hr_/);assert.equal(c.cols,1);assert.equal(c.rows,1);assert.ok(!c.motion);
        assert.ok(Math.abs(c.aspect-c.expectedAspect)<1e-6);assert.ok(Math.abs(c.feet-c.ground)<1e-5);
      }
      assert.equal(roster.gl,0);await shot('daylight-ground-complete-photographs-8m');record(name,'Daylight countryside uses complete farmer, VC, NVA, guard, aviator and cow images with original aspect and grounded soles',roster);

      const states=await page.evaluate(()=>{
        const R=App.rend,result=[];for(const kind of ['farmer','vc','vcFem','nva','guard','aviator','cow'])for(const state of [{},{spd:2,walk:2,ph:3},{seen:1,state:'pursuit'},{hurt:true,flinch:1},{alive:false,downAt:1}]){
          const actor={kind,p:[0,0,-8],alive:true,armed:!['farmer','cow'].includes(kind),...state},before=JSON.stringify(actor),d=PhotoSprites.describe(actor,{renderer:R,camera:[0,1,0]});
          result.push({kind,state,asset:d.photoAsset,pose:d.photoPose,texture:d.textureName,complete:d.photoCutout,unchanged:before===JSON.stringify(actor)});
        }return result;
      });
      for(const s of states){assert.equal(s.complete,true);assert.equal(s.unchanged,true);assert.match(s.texture,/^photo_hr_/);if(s.state.alive===false)assert.equal(s.pose,'fallen',s.kind+' must use complete fallen photograph');}
      record(name,'Movement, aiming, wounds and fallen states retain complete images and never sample tiny legacy cells',states);

      const clarity=await page.evaluate(async()=>{
        const R=App.rend,gl=R.gl;R.bloomOn=false;R.setEpisode(null);R.setFires([]);
        R.setAtmos({...R.atm,amb:[.55,.55,.55],gnd:[.12,.12,.12],sunCol:[.55,.55,.55],sunDir:[.2,.9,.3],fogDens:0,night:false,exposure:1});
        const records=PhotoCutouts.inspect(R).records,results=[];
        const capture=(label,sprites,distance)=>{
          R.setCamera([0,1.0,0],[0,0,-1],[0,1,0],50,.1,400,R.W/R.H);R.begin();gl.clearColor(.075,.095,.12,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
          for(const s of sprites)R.drawSprites(s.textureName,[s]);R.end(0,0,1);
          const png=R.canvas.toDataURL('image/png'),pixels=new Uint8Array(R.W*R.H*4);gl.readPixels(0,0,R.W,R.H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          const colors=new Set();for(let i=0;i<pixels.length;i+=52)colors.add((pixels[i]>>3)+','+(pixels[i+1]>>3)+','+(pixels[i+2]>>3));
          return {label,distance,canvas:[R.W,R.H],quality:R.quality,colors:colors.size,png,gl:gl.getError(),sprites:sprites.map(s=>({texture:s.textureName,asset:s.photoAsset,cols:s.cols,rows:s.rows,width:s.w,height:s.h}))};
        };
        for(const entry of records){
          const record=entry,meta=PhotoCutouts.inspect(R),name=record.subject;
          const actor={kind:name,p:[0,0,-3],alive:record.pose!=='fallen',armed:true,seen:record.pose==='aim',crouch:record.pose==='crouch'};
          let d=PhotoSprites.describe(actor,{renderer:R,camera:[0,1,0]});
          if(d.photoAsset!==record.key)throw Error('Pose fixture did not select complete '+record.key+': '+d.photoAsset);
          const sprite=PhotoSprites.anchor({...d,p:actor.p.slice(),sourcePhotograph:true});results.push(capture('near-3m-'+record.key.replace(':','-'),[sprite],3));
        }
        for(const distance of [8,18]){
          const sprites=['farmer','militia','female_vc','nva','aviator','cow'].map((kind,i)=>{
            const p=[(i-2.5)*1.7,0,-distance],d=PhotoSprites.describe({kind,p,alive:true,armed:true},{renderer:R,camera:[0,1,0]});return PhotoSprites.anchor({...d,p,sourcePhotograph:true});
          });results.push(capture('complete-roster-'+distance+'m',sprites,distance));
        }
        return results;
      });
      for(const item of clarity){
        assert.equal(item.gl,0);assert.ok(item.colors>100,'Actual photographic image detail: '+item.label);
        const file=name+'-'+item.label+'.png';await fs.writeFile(path.join(out,file),Buffer.from(item.png.split(',')[1],'base64'));screenshots.push('highres-sprites/'+file);delete item.png;
        for(const s of item.sprites){assert.match(s.texture,/^photo_hr_/);assert.equal(s.cols,1);assert.equal(s.rows,1);}
      }
      record(name,'Actual production WebGL shows each complete pose at 3m and the full roster at 8m and 18m without atlas magnification',clarity);
      assert.deepEqual(errors.filter(e=>e.layout===name),[]);assert.deepEqual(missing,[]);
    }catch(error){await shot('failure').catch(()=>{});await fs.writeFile(path.join(out,name+'-failure.json'),JSON.stringify({error:String(error),checks,errors,missing},null,2));throw error;}
    finally{await context.close();}
  }
  const report={suite:'highres-sprites',passed:true,checks,screenshots,errors,missing,sourceHashes,
    moduleSHA256:createHash('sha256').update(await fs.readFile(path.resolve(__dirname,'../assets/render/photo-cutouts.js'))).digest('hex'),
    scope:'Actual Chromium/SwiftShader WebGL2 desktop high quality and simulated iPhone landscape medium quality at native render-canvas resolution. Native Ready Room prison entry; declared daylight mixed-roster countryside and isolated 3m/8m/18m production-renderer fixtures. All source alpha/colour measurements decode the actual delivered PNGs. New complete photographs reconstruct details from supplied references; they are not pixel-identical originals or photographed gait sequences. No physical iPhone Safari, Windows GPU, hardware FPS or complete-mission claim.'};
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');return report;
};

if(require.main===module)(async()=>{
  const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs'),server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const r=await module.exports(browser,'http://127.0.0.1:'+server.address().port+'/',process.argv[2]||path.resolve(__dirname,'../test-results'));console.log(JSON.stringify({passed:true,checks:r.checks.length,screenshots:r.screenshots.length}));}
  finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
