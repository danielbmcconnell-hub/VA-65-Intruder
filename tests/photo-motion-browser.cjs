'use strict';
// Production WebGL2 with native patrols and explicitly declared locomotion
// fixtures. Chromium touch layout is not a physical iPhone Safari/FPS test.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
module.exports=async function photoMotion(browser,target,evidenceDir){
  const out=path.join(evidenceDir,'photo-motion'),checks=[],screenshots=[],videos=[],errors=[],missing=[],sourceHashes=[],executedModules=[],executedAssets=[],sourceJobs=[];
  await fs.mkdir(out,{recursive:true});
  const profiles=[{name:'desktop',viewport:{width:1280,height:720},deviceScaleFactor:1},{name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}]
    .filter(p=>!process.env.INTRUDER_MOTION_PROFILE||p.name===process.env.INTRUDER_MOTION_PROFILE);
  const subjects=['farmer','militia','female_vc','nva','aviator','cow'].filter(s=>!process.env.INTRUDER_MOTION_SUBJECT||s===process.env.INTRUDER_MOTION_SUBJECT),clips=['walk','run'].filter(c=>!process.env.INTRUDER_MOTION_CLIP||c===process.env.INTRUDER_MOTION_CLIP),subset=subjects.length!==6||clips.length!==2;
  assert.ok(subjects.length&&clips.length&&profiles.length,'A requested evidence subset must match real subjects/clips/profiles');
  const record=(layout,name,actual)=>{checks.push({layout,name,passed:true,actual});console.log('PASS photo-motion '+layout+' '+name);};
  for(const profile of profiles){
    const {name,...options}=profile,context=await browser.newContext(options),page=await context.newPage();page.setDefaultTimeout(120000);
    page.on('pageerror',e=>errors.push({layout:name,message:e.message}));page.on('response',r=>{if(r.status()>=400&&r.url().includes('/assets/'))missing.push(r.url());});
    page.on('response',r=>{const module=/\/assets\/render\/(photo-motion|photo-cutouts|photographic-sprites)\.js(?:\?|$)/.exec(r.url());if(module)sourceJobs.push(r.body().then(bytes=>executedModules.push({layout:name,module:module[1],sha256:createHash('sha256').update(bytes).digest('hex')})));});
    page.on('response',r=>{const asset=/\/assets\/sprites\/hires\/([a-z0-9_-]+\.(?:json|png|webp))(?:\?|$)/.exec(r.url());if(asset&&r.status()===200)sourceJobs.push(r.body().then(bytes=>executedAssets.push({layout:name,file:asset[1],sha256:createHash('sha256').update(bytes).digest('hex')})));});
    const click=l=>profile.hasTouch?l.tap():l.click();
    const save=async(label,png)=>{const file=name+'-'+label+'.png';await fs.writeFile(path.join(out,file),Buffer.from(png.split(',')[1],'base64'));screenshots.push('photo-motion/'+file);};
    try{
      await context.addInitScript(q=>{localStorage.setItem('a6_set',JSON.stringify({quality:q,sound:0,voices:0,mouse:0,seat:0,assist:1,sens:1}));localStorage.setItem('a6_sawkeys','1');},profile.hasTouch?1:2);
      console.log('RUN photo-motion '+name+' native startup');
      const response=await page.goto(target,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
      sourceHashes.push({layout:name,indexSHA256:createHash('sha256').update(await response.body()).digest('hex')});
      await page.waitForFunction(()=>window.App&&window.PhotoCutouts&&window.PhotoMotion);
      await click(page.locator('#bootGo'));await click(page.locator('#powChapter [data-pow-chapter="escape"]'));
      await page.waitForFunction(()=>App.game?.pow?.stage==='cell'&&document.getElementById('loader').style.display==='none'&&['ready','error'].includes(PhotoCutouts.inspect(App.rend).status),null,{polling:50});
      console.log('READY photo-motion '+name+' complete base photographs');
      const native=await page.evaluate(async()=>{
        const g=App.game,R=App.rend,M=PhotoMotion;App.frame=()=>{};g.paused=false;
        for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on');document.getElementById('radio').innerHTML='';
        await PhotoCutouts.prepareMotion(R,'nva','walk');const traces=[],frames=[],before=g.evade.searchers.map(a=>a.p.slice()),normalCanvas=[R.W,R.H],videoScale=R.quality===0?.72:R.quality===1?.88:1;let moving=0,blocked=0;
        // Level rendering is expensive in software WebGL. The motion video is
        // a declared 640x360 capture fixture at the selected quality; full-size
        // native stills and every isolated photographic frame are tested below.
        R.resize(640/videoScale,360/videoScale,1);
        for(let i=0;i<50;i++){
          g.t+=.04;g.stepEvade(.04);
          for(const a of g.evade.searchers){const pose=M.pose(a,g);if(pose.moving)moving++;if(POW.blocked(g,a.p[0],a.p[2],.30,a.p[1]))blocked++;if(i%10===0)traces.push({id:a.id,p:a.p.slice(),pose});}
          if(i%2===0){g.render(0);frames.push({simulationTime:(i+1)*.04,png:R.canvas.toDataURL('image/png')});}
        }
        App.resize();const draw=R.drawSprites,calls=[];R.drawSprites=function(texture,list,...rest){for(const s of list)if(s.owner)calls.push({texture,kind:s.owner.kind,asset:s.photoAsset,pose:s.photoPose,frame:s.photoFrame,cols:s.cols,rows:s.rows,motion:s.motion});return draw.call(this,texture,list,...rest);};
        try{g.render(0);g.syncControls();}finally{R.drawSprites=draw;}
        return {stage:g.pow.stage,moving,blocked,moved:g.evade.searchers.some((a,i)=>Math.hypot(a.p[0]-before[i][0],a.p[2]-before[i][2])>.2),traces,frames,calls,normalCanvas,videoCanvas:[640,360],gl:R.gl.getError(),loaded:PhotoCutouts.inspect(R)};
      });
      assert.equal(native.stage,'cell');assert.ok(native.moved&&native.moving>10);assert.equal(native.blocked,0);assert.equal(native.gl,0);
      assert.ok(native.calls.some(c=>c.pose==='walk'),'Native moving guards must select complete gait photographs');
      for(const call of native.calls){assert.equal(call.cols,1);assert.equal(call.rows,1);assert.equal(call.motion,null);}
      for(let i=0;i<native.frames.length;i++){const f=native.frames[i],file=name+'-native-motion-'+String(i).padStart(3,'0')+'.png';await fs.writeFile(path.join(out,file),Buffer.from(f.png.split(',')[1],'base64'));delete f.png;f.file=file;}
      try{
        const file=name+'-native-prison-patrol.mp4';execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','12.5','-i',path.join(out,name+'-native-motion-%03d.png'),'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-r','25','-c:v','libx264','-threads','2','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,file)],{stdio:'pipe'});
        videos.push({file:'photo-motion/'+file,scope:'Native AI patrol through original game camera; declared 640x360 video fixture at unchanged graphics quality. Twenty-five renders at fixed .08s simulation intervals (two simulated seconds), encoded without invented pose pixels. This is not measured device frame rate.'});
      }catch(error){if(error.code!=='ENOENT')throw error;}
      await page.screenshot({path:path.join(out,name+'-native-prison-patrol.png')});screenshots.push('photo-motion/'+name+'-native-prison-patrol.png');
      record(name,'Native prison patrols select real gait frames after actual AI movement and preserve wall collision',native);

      const pause=await page.evaluate(()=>{
        const g=App.game,a=g.evade.searchers[0];g.paused=true;const before=PhotoMotion.pose(a,g),p=a.p.slice();
        for(let i=0;i<20;i++){g.update(.05);g.render(0);}
        return {before,after:PhotoMotion.pose(a,g),positionBefore:p,positionAfter:a.p.slice(),gl:App.rend.gl.getError()};
      });
      assert.equal(pause.after.phase,pause.before.phase);assert.equal(pause.after.distance,pause.before.distance);assert.deepEqual(pause.positionAfter,pause.positionBefore);assert.equal(pause.gl,0);
      record(name,'Pausing the actual game freezes both positions and photographic cycle phase',pause);

      // Each synthetic actor follows a measured constant-speed path, but is
      // drawn at the same world position so rendered-pixel differences measure
      // changing poses rather than translation. No AI or collision claim here.
      for(const subject of subjects)for(const clip of clips){
        const sample=await page.evaluate(async({subject,clip,auditComplete})=>{
          const R=App.rend,gl=R.gl,M=PhotoMotion;PhotoCutouts.beginFrame(R);await PhotoCutouts.prepareMotion(R,subject,clip);
          const manifest=await(await fetch('assets/sprites/hires/manifest.json')).json(),meta=manifest.subjects[subject].animations[clip],sources=[];
          for(let plateIndex=0;plateIndex<meta.plates.length;plateIndex++){
            const file=meta.plates[plateIndex],im=new Image();im.src='assets/sprites/hires/'+file;await im.decode();const [width,height]=meta.frameSize;
            let labels,major;
            if(auditComplete){
              // Independently label the delivered plate's alpha. A complete
              // figure can cross the nominal 2x2 cell boundary: its registered
              // ROI must include every pixel and none of a neighbouring body.
              const pc=document.createElement('canvas');pc.width=im.naturalWidth;pc.height=im.naturalHeight;const cx=pc.getContext('2d',{willReadFrequently:true});cx.drawImage(im,0,0);const rgba=cx.getImageData(0,0,pc.width,pc.height).data,W=pc.width,H=pc.height;
              labels=new Int32Array(W*H);const queue=new Int32Array(W*H),components=[];let label=0;
              for(let start=0;start<W*H;start++)if(!labels[start]&&rgba[start*4+3]>8){
                const id=++label;let head=0,tail=1,x0=W,y0=H,x1=0,y1=0;queue[0]=start;labels[start]=id;
                while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);
                  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if((!dx&&!dy)||xx<0||xx>=W||yy<0||yy>=H)continue;const n=yy*W+xx;if(!labels[n]&&rgba[n*4+3]>8){labels[n]=id;queue[tail++]=n;}}
                }
                components.push({label:id,pixels:tail,bounds:[x0,y0,x1,y1]});
              }
              major=components.sort((a,b)=>b.pixels-a.pixels).slice(0,4);pc.width=pc.height=1;
            }
            for(let logical=0;logical<meta.frames;logical++){
              const stored=meta.order?meta.order[logical]:logical;if(Math.floor(stored/4)!==plateIndex)continue;
              const region=meta.sourceRegions[logical],source=region.source,dest=region.dest,scale=region.scale??1;
              const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
              ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(im,...source,...dest,source[2]*scale,source[3]*scale);const pixels=ctx.getImageData(0,0,width,height).data;
              let completeness;
              if(auditComplete){
                const hits=new Map(major.map(c=>[c.label,0]));for(let y=source[1];y<source[1]+source[3];y++)for(let x=source[0];x<source[0]+source[2];x++){const label=labels[y*im.naturalWidth+x];if(hits.has(label))hits.set(label,hits.get(label)+1);}
                const target=major.slice().sort((a,b)=>hits.get(b.label)-hits.get(a.label))[0];
                completeness={major,selectedLabel:target.label,selectedPixels:target.pixels,includedPixels:hits.get(target.label),foreignPixels:[...hits].filter(([label])=>label!==target.label).reduce((sum,[,n])=>sum+n,0),outerMargin:Math.min(target.bounds[0],target.bounds[1],im.naturalWidth-target.bounds[2],im.naturalHeight-target.bounds[3])};
              }
              let visible=0,transparent=0,x0=width,y0=height,x1=0,y1=0,softBottom=0;const colours=new Set();
              for(let y=0;y<height;y++)for(let x=0;x<width;x++){
                const i=(y*width+x)*4,a=pixels[i+3];if(a===0)transparent++;if(a>8)softBottom=Math.max(softBottom,y+1);
                if(a>128){visible++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);if((x+y)%7===0)colours.add((pixels[i]>>3)+','+(pixels[i+1]>>3)+','+(pixels[i+2]>>3));}
              }
              // Solid torso core: find a narrow window inside the subject's
              // central body, allowing natural gaps around arms and rifles.
              const top=Math.round(y0+(y1-y0)*.30),bottom=Math.round(y0+(y1-y0)*.57),ww=Math.max(8,Math.round((x1-x0)*.12));let best=0;
              const columns=new Float64Array(width);for(let x=x0;x<x1;x++)for(let y=top;y<bottom;y++)columns[x]+=pixels[(y*width+x)*4+3]>=250?1:0;
              for(let x=Math.round(x0+(x1-x0)*.12);x+ww<x0+(x1-x0)*.88;x++){let sum=0;for(let k=0;k<ww;k++)sum+=columns[x+k];best=Math.max(best,sum);}
              sources.push({file,logical,source,dest,scale,width,height,plateWidth:im.naturalWidth,plateHeight:im.naturalHeight,visible,transparent,colours:colours.size,bounds:[x0,y0,x1,y1],softBottom,torsoOpaqueFraction:best/(ww*(bottom-top)),completeness});canvas.width=canvas.height=1;
            }
          }
          // Start inside a frame interval, avoiding a floating-point boundary
          // being classified into the neighbouring photographed pose.
          const actor={kind:subject,p:[0,0,-3.5],ph:Math.PI/meta.frames,alive:true,armed:!['farmer','cow'].includes(subject)},game={phase:'evade',t:0,paused:false,evade:{searchers:subject==='cow'?[]:[actor],locals:[],cattle:subject==='cow'?[actor]:[]}};
          M.pose(actor,game);M.step(game,.05);R.bloomOn=false;R.setEpisode(null);R.setFires([]);
          R.setCamera([0,1.0,0],[0,0,-1],[0,1,0],50,.1,400,R.W/R.H);
          R.setAtmos({...R.atm,amb:[.55,.55,.55],gnd:[.12,.12,.12],sunCol:[.55,.55,.55],sunDir:[.2,.9,.3],fogDens:0,night:false,exposure:1});
          let previous=null;const frames=[];
          for(let n=0;n<meta.frames;n++){
            const distance=meta.stride/meta.frames,speed=clip==='run'?4:1,dt=distance/speed;actor.p[2]-=distance;game.t+=dt;M.step(game,dt);
            PhotoCutouts.beginFrame(R);const d=PhotoSprites.describe(actor,{renderer:R,camera:[0,1,0],game,owner:actor}),q=PhotoSprites.anchor({...d,p:[0,0,-3.5],sourcePhotograph:true});
            R.begin();gl.clearColor(.075,.095,.12,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);R.drawSprites(q.textureName,[q]);R.end(0,0,1);
            const pixels=new Uint8Array(R.W*R.H*4);gl.readPixels(0,0,R.W,R.H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            let changed=0,lowerChanged=0;
            if(previous)for(let y=0;y<R.H;y++)for(let x=0;x<R.W;x++){
              const i=(y*R.W+x)*4;if(Math.max(Math.abs(pixels[i]-previous[i]),Math.abs(pixels[i+1]-previous[i+1]),Math.abs(pixels[i+2]-previous[i+2]))>8){changed++;if(y<R.H*.48)lowerChanged++;}
            }
            const offset=((q.flip?1-q.photoCenter:q.photoCenter)-.5)*q.w,right=q.photoRight||[1,0],gpu=PhotoCutouts.inspect(R).motions.records.find(r=>r.key===q.photoAsset),oldRead=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),fb=gl.createFramebuffer();
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,R.textures[q.textureName].tex,0);
            const complete=gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE,texels=new Uint8Array(gpu.gpuWidth*gpu.gpuHeight*4);gl.readPixels(0,0,gpu.gpuWidth,gpu.gpuHeight,gl.RGBA,gl.UNSIGNED_BYTE,texels);let gx0=gpu.gpuWidth,gy0=gpu.gpuHeight,gx1=0,gy1=0;
            for(let y=0;y<gpu.gpuHeight;y++)for(let x=0;x<gpu.gpuWidth;x++)if(texels[(y*gpu.gpuWidth+x)*4+3]>128){gx0=Math.min(gx0,x);gy0=Math.min(gy0,y);gx1=Math.max(gx1,x+1);gy1=Math.max(gy1,y+1);}
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER,oldRead);gl.deleteFramebuffer(fb);
            previous=pixels;frames.push({n,phase:M.pose(actor,game).phase,clip:M.pose(actor,game).clip,asset:q.photoAsset,pose:q.photoPose,frame:q.photoFrame,width:q.photoWidth,height:q.photoHeight,quad:[...q.p,q.w,q.h],baseline:q.photoBaseline,alphaBottom:q.photoBounds[3]/q.photoHeight,feet:q.p[1]+q.h*(1-q.photoBounds[3]/q.photoHeight),gpuBounds:[gx0,gy0,gx1,gy1],gpuFeet:q.p[1]+q.h*(1-gy1/gpu.gpuHeight),gpuTop:q.p[1]+q.h*(1-gy0/gpu.gpuHeight),gpuComplete:complete,centerline:[q.p[0]+right[0]*offset,q.p[2]+right[1]*offset],gpu,cols:q.cols,rows:q.rows,motion:q.motion,changed,lowerChanged,png:R.canvas.toDataURL('image/png'),gl:gl.getError()});
          }
          return {subject,clip,meta,sources,frames,canvas:[R.W,R.H],quality:R.quality,loaded:PhotoCutouts.inspect(R)};
        },{subject,clip,auditComplete:!profile.hasTouch});
        assert.equal(sample.frames.length,16);assert.equal(new Set(sample.frames.map(f=>f.frame)).size,16,subject+' '+clip+' selects every authored frame');
        if(sample.meta.order)assert.deepEqual([...sample.meta.order].sort((a,b)=>a-b),Array.from({length:16},(_,i)=>i),'Each authored cell appears exactly once in chronological order');
        assert.ok(sample.loaded.bytes<=sample.loaded.budget,'Combined base/motion GPU budget');assert.deepEqual(sample.loaded.failures,[]);assert.deepEqual(sample.loaded.motions.failures,[]);
        assert.ok(sample.loaded.motions.cpuBytes<=sample.loaded.motions.cpuBudget,'Decoded movement plates have a bounded CPU cache');
        const sourceMinimum=subject==='cow'?[768,512]:[512,768];
        for(const source of sample.sources){
          assert.ok(source.source[0]>=0&&source.source[1]>=0&&source.source[0]+source.source[2]<=source.plateWidth&&source.source[1]+source.source[3]<=source.plateHeight,'Complete source ROI is inside the unmodified plate');
          assert.ok(source.dest[0]>=0&&source.dest[1]>=0&&source.dest[0]+source.source[2]*source.scale<=source.width+.001&&source.dest[1]+source.source[3]*source.scale<=source.height+.001,'Common registered frame contains the complete uniformly fitted source ROI');
          assert.ok(source.width>=sourceMinimum[0]&&source.height>=sourceMinimum[1],subject+' per-frame source detail');
          assert.ok(source.visible>10000&&source.transparent>10000&&source.colours>128,subject+' complete photographic content and transparent surrounding area');
          assert.ok(source.torsoOpaqueFraction>.97,subject+' '+clip+' solid torso '+JSON.stringify(source));
          if(source.completeness){const c=source.completeness;assert.equal(c.major.length,4);assert.equal(c.includedPixels,c.selectedPixels,subject+' every alpha pixel of the complete body/weapon is retained');assert.equal(c.foreignPixels,0,subject+' cannot pick up a neighbouring hat/weapon/body fragment');assert.ok(c.outerMargin>0,subject+' source figure is complete inside the original PNG boundary');}
        }
        for(let i=0;i<sample.frames.length;i++){
          const f=sample.frames[i];assert.equal(f.clip,clip);assert.equal(f.pose,clip);assert.equal(f.cols,1);assert.equal(f.rows,1);assert.equal(f.motion,null);assert.equal(f.gl,0);
          assert.ok(f.width>=sourceMinimum[0]&&f.height>=sourceMinimum[1],subject+' complete frame dimensions');
          const gpu=f.gpu;assert.ok(gpu?.resident,subject+' rendered frame has an actual resident texture at draw time');
          assert.ok(Math.max(gpu.gpuWidth,gpu.gpuHeight)>=(profile.hasTouch?576:768),subject+' actual moving-frame GPU detail');
          assert.ok(Math.abs(gpu.gpuWidth/gpu.gpuHeight-f.width/f.height)<.003,subject+' complete moving frame preserves its source aspect');
          assert.ok(Math.abs(f.quad[1]+f.quad[4]*(1-f.baseline))<1e-8,subject+' registered sole line stays exactly on the declared ground');
          assert.ok(f.gpuComplete);assert.ok(Math.abs(f.gpuFeet-f.feet)<.012,subject+' actual GPU opaque sole agrees with the source footprint');
          const independent=sample.sources.find(source=>source.logical===f.frame),decodedFeet=f.quad[1]+f.quad[4]*(1-independent.bounds[3]/f.height);
          assert.equal(gpu.sourceScale??1,independent.scale,'Actual GPU upload uses the declared whole-figure camera fit');
          for(let axis=0;axis<2;axis++){const sourceExtent=(independent.bounds[axis+2]-independent.bounds[axis])/(axis?f.height:f.width),gpuExtent=(f.gpuBounds[axis+2]-f.gpuBounds[axis])/(axis?gpu.gpuHeight:gpu.gpuWidth);assert.ok(Math.abs(sourceExtent-gpuExtent)<.008,subject+' actual GPU silhouette extent agrees with the independently fitted whole photograph');}
          assert.ok(Math.abs(decodedFeet-f.feet)<.006,subject+' independent delivered-WebP extraction agrees with runtime world sole');
          const photographedClearance=f.quad[1]+f.quad[4]*(1-independent.softBottom/f.height);assert.ok(Math.abs(f.gpuFeet-photographedClearance)<.025,subject+' actual GPU foot clearance matches the independently decoded photographed silhouette');
          if(clip==='walk')assert.ok(Math.abs(f.gpuFeet)<.018,subject+' walking sole stays within the feathered source edge of the ground: '+f.gpuFeet);
          else assert.ok(f.gpuFeet>=-.018&&f.gpuFeet<=.52,subject+' actual photographic running foot clearance follows the bent-leg source pose: '+f.gpuFeet);
          assert.ok(Math.abs(f.centerline[0])<1e-8&&Math.abs(f.centerline[1]+3.5)<1e-8,subject+' torso stays over its actor position');
          if(i){assert.ok(f.changed>100&&f.lowerChanged>50,subject+' '+clip+' visibly changing full-resolution leg poses');assert.deepEqual(f.quad.slice(3),sample.frames[0].quad.slice(3),'A shared clip canvas must not resize when source bounds change');}
          const file=name+'-'+subject+'-'+clip+'-'+String(i).padStart(2,'0');await save(file.replace(name+'-',''),f.png);f.renderSHA256=createHash('sha256').update(Buffer.from(f.png.split(',')[1],'base64')).digest('hex');delete f.png;
        }
        assert.equal(new Set(sample.frames.map(f=>f.renderSHA256)).size,16,'Every gait frame changes actual GPU pixels');
        if(clip==='run'){assert.ok(sample.frames.some(f=>f.gpuFeet<.025),subject+' running cycle contains a photographed ground contact');assert.ok(sample.frames.some(f=>f.gpuFeet>.035),subject+' running cycle contains a photographed airborne/recovery pose');if(subject!=='cow'){const tops=sample.frames.map(f=>f.gpuTop);assert.ok(Math.max(...tops)-Math.min(...tops)<.025,subject+' top alignment prevents artificial head drops while the photographed legs bend');}}
        record(name,subject+' '+clip+' renders sixteen distinct full photographs with a stable anchor, changing leg poses and a bounded texture cache',sample);
      }
      const priorities=await page.evaluate(async()=>{
        const R=App.rend,M=PhotoMotion,actor={kind:'nva',p:[0,0,-4],alive:true,armed:true,seen:1,state:'pursuit'},game={phase:'evade',t:0,evade:{searchers:[actor],locals:[],cattle:[]}};
        PhotoCutouts.beginFrame(R);await PhotoCutouts.prepareMotion(R,'nva','walk');M.pose(actor,game);M.step(game,.05);actor.p[2]-=.05;game.t+=.05;M.step(game,.05);
        const describe=()=>PhotoSprites.describe(actor,{renderer:R,camera:[0,1,0],game,owner:actor});
        const pursuit=describe();actor.firing=true;await PhotoCutouts.preparePose(R,'nva','aim');const firing=describe();
        actor.alive=false;await PhotoCutouts.preparePose(R,'nva','fallen');const fallen=describe();
        return {pursuit,firing,fallen,loaded:PhotoCutouts.inspect(R),gl:R.gl.getError()};
      });
      assert.equal(priorities.pursuit.photoPose,'walk');assert.equal(priorities.firing.photoPose,'aim');assert.equal(priorities.fallen.photoPose,'fallen');assert.equal(priorities.gl,0);
      assert.ok(priorities.loaded.bytes<=priorities.loaded.budget);assert.deepEqual(priorities.loaded.motions.failures,[]);
      record(name,'Pursuit retains actual gait while firing and fallen photographs take priority without ghosting',priorities);
      if(name==='desktop'&&!subset){
        const ground=await page.evaluate(async()=>{
          const g=App.game,R=App.rend,M=PhotoMotion,center=g.world.briefed||g.world.tgtCenter;delete g.pow;let origin;
          for(let radius=900;radius<7000&&!origin;radius+=160)for(let a=0;a<Math.PI*2&&!origin;a+=Math.PI/8){const x=center[0]+Math.sin(a)*radius,z=center[2]-Math.cos(a)*radius,y=terrainH(x,z);if(y>8&&!g._localSolidAt(x,z,.5)&&Math.abs(terrainH(x+10,z-10)-y)<2)origin=[x,y,z];}
          if(!origin)throw Error('No dry ground for the declared moving-camera fixture');
          g._startGroundPhase(origin[0],origin[2],0,'chute');const e=g.evade;e.held=0;e.spawn=e.localRefill=e.cowT=1e9;e.hdg=e.look=e.pitchCmd=0;e.locals=[];e.cattle=[];
          e.searchers=[{id:'declared-photo-walker',kind:'nva',p:[origin[0]-.85,origin[1],origin[2]-5.8],alive:true,armed:true,spd:1.2,face:Math.PI},{id:'declared-photo-runner',kind:'vcFem',p:[origin[0]+.85,origin[1],origin[2]-10],alive:true,armed:true,spd:3.2,face:Math.PI}];
          g.atm=g.makeAtmos({...g.mis.env,hour:12});g.wreck=null;g.world.scenery=[];g.world._cells=new Map();g.world.targets=[];g.world.saf=[];g._collisionCache=null;g.paused=false;App.screen='game';
          for(const id of ['teach','teachPeek','legend','captVeil'])document.getElementById(id)?.classList.remove('on');document.getElementById('radio').innerHTML='';
          PhotoCutouts.beginFrame(R);await PhotoCutouts.prepareMotion(R,'nva','walk');await PhotoCutouts.prepareMotion(R,'female_vc','run');M.reset(g);M.step(g,1/30);
          R.resize(640,360,1);
          const frames=[],calls=[],draw=R.drawSprites;R.drawSprites=function(texture,list,...rest){for(const s of list)if(s.owner&&s.photoCutout){const ground=Math.max(0,terrainH(s.owner.p[0],s.owner.p[2]));calls.push({id:s.owner.id,pose:s.photoPose,frame:s.photoFrame,feet:s.p[1]+s.h*(1-s.photoBounds[3]/s.photoHeight),ground});}return draw.call(this,texture,list,...rest);};
          try{for(let n=0;n<60;n++){const dt=1/30;g.t+=dt;for(const actor of e.searchers){actor.p[2]+=actor.spd*dt;actor.p[1]=Math.max(0,terrainH(actor.p[0],actor.p[2]));}M.step(g,dt);g.render(0);frames.push({n,time:(n+1)/30,png:R.canvas.toDataURL('image/png')});}}
          finally{R.drawSprites=draw;g.paused=true;App.resize();}
          return {origin,frames,calls,videoCanvas:[640,360],normalCanvas:[R.W,R.H],gl:R.gl.getError(),loaded:PhotoCutouts.inspect(R),scope:'Declared constant-speed positions, not AI navigation. Original ground camera/terrain/render pass at a declared 640x360 video capture size and unchanged High graphics quality; actual measured displacement drives gait selection.'};
        });
        assert.equal(ground.gl,0);assert.ok(ground.loaded.bytes<=ground.loaded.budget);assert.deepEqual(ground.loaded.motions.failures,[]);
        for(const id of ['declared-photo-walker','declared-photo-runner']){const calls=ground.calls.filter(c=>c.id===id);assert.ok(calls.length>=50,'The production ground camera must show both moving subjects');assert.ok(new Set(calls.map(c=>c.frame)).size>=12,'Production camera cycles through many distinct poses');for(const c of calls){const clearance=c.feet-c.ground;assert.ok(c.pose==='run'?clearance>=-.018&&clearance<=.52:Math.abs(clearance)<.018,'Photographed walking contact / running flight follows the actual terrain surface');}}
        assert.ok(ground.calls.some(c=>c.pose==='walk')&&ground.calls.some(c=>c.pose==='run'));
        for(let n=0;n<ground.frames.length;n++){const f=ground.frames[n],file=name+'-ground-motion-'+String(n).padStart(3,'0')+'.png';await fs.writeFile(path.join(out,file),Buffer.from(f.png.split(',')[1],'base64'));delete f.png;f.file=file;}
        try{
          const file=name+'-ground-walk-and-run.mp4';execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','30','-i',path.join(out,name+'-ground-motion-%03d.png'),'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-threads','2','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,file)],{stdio:'pipe'});
          videos.push({file:'photo-motion/'+file,scope:ground.scope+' Sixty production renders at fixed 1/30s simulation intervals. This is not measured device frame rate.'});
        }catch(error){if(error.code!=='ENOENT')throw error;}
        record(name,'Production ground camera shows a translating walker and runner with measured cadence and terrain-aligned feet',ground);
      }
      assert.deepEqual(errors.filter(e=>e.layout===name),[]);assert.deepEqual(missing,[]);
    }catch(error){await page.screenshot({path:path.join(out,name+'-failure.png')}).catch(()=>{});await fs.writeFile(path.join(out,name+'-failure.json'),JSON.stringify({error:String(error),checks,errors,missing},null,2));throw error;}
    finally{await context.close();}
  }
  await Promise.all(sourceJobs);
  const moduleSHA256={};for(const name of ['photo-motion','photo-cutouts','photographic-sprites'])moduleSHA256[name]=createHash('sha256').update(await fs.readFile(path.join(root,'assets/render/'+name+'.js'))).digest('hex');
  for(const executed of executedModules)assert.equal(executed.sha256,moduleSHA256[executed.module],'Executed runtime bytes changed during this evidence run; repeat on the final files');
  assert.equal(executedModules.length,profiles.length*3,'Evidence must record every executed photographic runtime module');
  const assetSHA256={};for(const executed of executedAssets){if(!assetSHA256[executed.file])assetSHA256[executed.file]=createHash('sha256').update(await fs.readFile(path.join(root,'assets/sprites/hires',executed.file))).digest('hex');assert.equal(executed.sha256,assetSHA256[executed.file],'Executed image/manifest bytes changed during this evidence run; repeat on the final files');}
  const indexSHA256=createHash('sha256').update(await fs.readFile(path.join(root,'index.html'))).digest('hex');for(const source of sourceHashes)assert.equal(source.indexSHA256,indexSHA256,'Executed index changed during this evidence run');
  const report={suite:'photo-motion',passed:true,selection:{subjects,clips,profiles:profiles.map(p=>p.name),subset},checks,screenshots,videos,errors,missing,sourceHashes,moduleSHA256,executedModules,assetSHA256,executedAssets,scope:'Actual Linux Chromium/SwiftShader WebGL2 desktop High quality and simulated iPhone landscape Medium quality at native canvas resolution. Native prison patrol/pause/collision; declared measured-speed walk/run fixtures render every selected authored gait frame using the production renderer at a fixed world position. Generated photographic pose reconstructions, not filmed footage. No physical Windows GPU/iPhone Safari/FPS claim.'};
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');return report;
};
if(require.main===module)(async()=>{
  const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs'),server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const r=await module.exports(browser,'http://127.0.0.1:'+server.address().port+'/',process.argv[2]||path.join(root,'test-results'));console.log(JSON.stringify({passed:true,checks:r.checks.length,screenshots:r.screenshots.length}));}
  finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
