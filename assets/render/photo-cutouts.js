/* Complete photographic cutouts and true gait poses. Plates are decoded once
 * and individual whole frames are uploaded with isolated mipmaps. A shared LRU
 * bounds GPU memory; six complete standing subjects remain pinned throughout. */
(function(root){
  'use strict';
  const SUBJECTS=Object.freeze(['farmer','militia','female_vc','nva','aviator','cow']);
  const BASE='assets/sprites/hires/';
  const contexts=new WeakMap();
  const finite=(n,f=0)=>Number.isFinite(n)?n:f;
  function context(renderer){return renderer&&contexts.get(renderer);}
  function hasPose(renderer,name,pose){const s=context(renderer),r=s&&s.records.get(name+':'+pose),texture=r&&renderer.textures[r.textureName];return !!(s&&valid(s)&&r&&r.resident&&texture&&texture.tex&&(!renderer.gl.isTexture||renderer.gl.isTexture(texture.tex)));}
  function mipBytes(width,height){let bytes=0;for(;;){bytes+=width*height*4;if(width===1&&height===1)break;width=Math.max(1,width>>1);height=Math.max(1,height>>1);}return bytes;}
  function dimensions(width,height,limit){const scale=Math.min(1,limit/Math.max(width,height));return [Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale))];}
  function image(url){return new Promise((resolve,reject)=>{const im=new root.Image();im.decoding='async';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Complete photographic sprite failed to load: '+url));im.src=url;});}
  function measure(im,region){
    const area=region||[0,0,im.naturalWidth,im.naturalHeight];
    const canvas=root.document.createElement('canvas');canvas.width=area[2];canvas.height=area[3];
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Cannot read photographic sprite alpha');
    ctx.drawImage(im,...area,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let x0=canvas.width,y0=canvas.height,x1=0,y1=0,visible=0;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>128){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);visible++;}
    canvas.width=canvas.height=1;
    if(!visible||x1<=x0||y1<=y0)throw new Error('Photographic sprite has no complete visible subject');
    return {bounds:[x0,y0,x1,y1],visiblePixels:visible};
  }
  function inspect(renderer){
    const s=context(renderer);if(!s)return {status:'unloaded',ready:0,expected:0,bytes:0,budget:0,failures:[],records:[]};
    const copy=r=>({...r,bounds:r.bounds.slice(),...(r.sourceRegion?{sourceRegion:r.sourceRegion.slice(),sourceDestination:r.sourceDestination.slice()}: {})});
    return {status:s.status,ready:s.records.size,expected:s.expected,bytes:s.bytes,budget:s.budget,
      failures:s.failures.slice(),records:[...s.records.values()].map(copy),
      motions:{records:[...s.motionRecords.values()].map(copy),clips:[...s.clips.values()].map(c=>({subject:c.subject,clip:c.clip,frames:c.frames,ready:[...s.motionRecords.values()].filter(r=>r.subject===c.subject&&r.clip===c.clip).length,plates:c.plates.slice()})),
        plates:[...s.plates.values()].map(p=>({url:p.url,bytes:p.bytes,sourceWidth:p.im.naturalWidth,sourceHeight:p.im.naturalHeight})),loadingPlates:[...s.plateJobs.keys()],
        bytes:[...s.motionRecords.values()].reduce((sum,r)=>sum+r.bytes,0),cpuBytes:s.cpuBytes,cpuBudget:s.cpuBudget,failures:s.motionFailures.slice(),evictions:s.evictions,
        retries:[...s.retries].map(([url,r])=>({url,attempts:r.attempts,retryInMs:Math.max(0,Math.ceil(r.next-now()))}))}};
  }
  const filename=file=>typeof file==='string'&&/^[a-z0-9_-]+\.(png|webp)$/.test(file);
  const now=()=>root.performance&&typeof root.performance.now==='function'?root.performance.now():Date.now();
  const retryDelays=[1000,4000,15000,60000];
  function blocked(s,url){const r=s.retries.get(url);return !!(r&&now()<r.next);}
  function failed(s,url,error){
    const previous=s.retries.get(url),attempts=Math.min(4,(previous?previous.attempts:0)+1),message=String(error&&error.message||error);
    s.retries.set(url,{attempts,next:now()+retryDelays[attempts-1]});
    if(!s.motionFailures.includes(message)){s.motionFailures.push(message);if(s.motionFailures.length>16)s.motionFailures.shift();}
    return null;
  }
  function valid(s){return !s.renderer.gl.isContextLost()&&(!s.options.current||s.options.current());}
  function touch(s,record){record.lastUse=++s.use;return record;}
  function evict(s,record){
    const texture=s.renderer.textures[record.textureName];if(texture&&texture.tex)s.renderer.gl.deleteTexture(texture.tex);
    delete s.renderer.textures[record.textureName];s.bytes-=record.bytes;record.loaded=record.resident=false;s.evictions++;
    if(record.clip)s.motionRecords.delete(record.key);
  }
  function space(s,bytes){
    if(bytes>s.budget)return false;
    while(s.bytes+bytes>s.budget){
      const candidates=[...s.records.values(),...s.motionRecords.values()].filter(r=>r.resident&&r.pose!=='idle'&&!r.permanent&&!s.pinned.has(r.key));
      candidates.sort((a,b)=>a.lastUse-b.lastUse);if(!candidates.length)return false;evict(s,candidates[0]);
    }
    return true;
  }
  function upload(s,record,im,region,width,height,placement){
    if(!valid(s)||!space(s,mipBytes(width,height)))return null;
    const canvas=root.document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Cannot prepare complete photographic texture');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(placement){const sx=width/placement.size[0],sy=height/placement.size[1],scale=finite(placement.scale,1);ctx.drawImage(im,...region,placement.dest[0]*sx,placement.dest[1]*sy,region[2]*scale*sx,region[3]*scale*sy);}
    else if(region)ctx.drawImage(im,...region,0,0,width,height);else ctx.drawImage(im,0,0,width,height);
    const texture=s.renderer.texFromCanvas(record.textureName,canvas),gl=s.renderer.gl;
    gl.bindTexture(gl.TEXTURE_2D,texture.tex);gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
    if(anisotropy)gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    const error=gl.getError();canvas.width=canvas.height=1;if(error!==gl.NO_ERROR)throw new Error('Complete photographic texture upload failed: '+error);
    record.width=record.gpuWidth=width;record.height=record.gpuHeight=height;record.bytes=mipBytes(width,height);record.loaded=record.resident=true;
    s.bytes+=record.bytes;touch(s,record);return texture;
  }
  async function preparePose(renderer,name,pose){
    const s=context(renderer);if(!s)return null;
    const key=name+':'+pose,record=s.records.get(key);if(!record)return null;
    if(record.resident)return touch(s,record);if(s.poseJobs.has(key))return s.poseJobs.get(key);
    if(blocked(s,record.url))return null;
    const promise=(async()=>{const im=await image(record.url);s.retries.delete(record.url);const [width,height]=dimensions(im.naturalWidth,im.naturalHeight,s.options.touch?960:1248);return upload(s,record,im,null,width,height)?record:null;})()
      .catch(error=>failed(s,record.url,error)).finally(()=>s.poseJobs.delete(key));
    s.poseJobs.set(key,promise);return promise;
  }
  function trimPlates(s,keep){
    while(s.cpuBytes>s.cpuBudget){const candidates=[...s.plates.values()].filter(p=>p.url!==keep);candidates.sort((a,b)=>a.used-b.used);if(!candidates.length)break;const oldest=candidates[0];s.plates.delete(oldest.url);s.cpuBytes-=oldest.bytes;oldest.im.src='';}
  }
  function plate(s,clip,index){
    const url=BASE+clip.plates[index],cached=s.plates.get(url);if(cached){cached.used=++s.use;return Promise.resolve(cached);}
    if(s.plateJobs.has(url))return s.plateJobs.get(url);
    if(blocked(s,url))return Promise.resolve(null);
    const promise=(async()=>{
      const im=await image(url);if(!valid(s))return null;
      const width=im.naturalWidth/clip.cols,height=im.naturalHeight/clip.rows;
      if(!Number.isInteger(width)||!Number.isInteger(height)||Math.min(width,height)<384||Math.max(width,height)<576)throw new Error('Photographic animation cells are not high resolution: '+url);
      const frames=[],regions=new Map();
      if(clip.sourceRegions){
        for(let frame=0;frame<clip.frames;frame++){
          const stored=clip.order?clip.order[frame]:frame;if(Math.floor(stored/(clip.cols*clip.rows))!==index)continue;
          const region=clip.sourceRegions[frame].source;
          if(region[0]+region[2]>im.naturalWidth||region[1]+region[3]>im.naturalHeight)throw new Error('Photographic source region crosses its source image: '+url);
          regions.set(frame,{...measure(im,region),region:region.slice()});
        }
      }else for(let i=0;i<clip.cols*clip.rows;i++){const region=[i%clip.cols*width,Math.floor(i/clip.cols)*height,width,height];frames.push({...measure(im,region),region});}
      const p={url,im,width,height,frames,regions,bytes:im.naturalWidth*im.naturalHeight*4,used:++s.use};s.plates.set(url,p);s.cpuBytes+=p.bytes;s.retries.delete(url);trimPlates(s,url);return p;
    })().catch(error=>failed(s,url,error)).finally(()=>s.plateJobs.delete(url));
    s.plateJobs.set(url,promise);return promise;
  }
  function motionRecord(s,clip,frame){
    const key=clip.subject+':'+clip.clip+':'+frame,prior=s.motionRecords.get(key);if(prior)return touch(s,prior);
    const stored=clip.order?clip.order[frame]:frame,cells=clip.cols*clip.rows,index=Math.floor(stored/cells),url=BASE+clip.plates[index],p=s.plates.get(url);
    if(!p)return null;p.used=++s.use;const registration=clip.sourceRegions&&clip.sourceRegions[frame],alpha=registration?p.regions.get(frame):p.frames[stored%cells];
    if(!alpha)return null;
    const sourceWidth=registration?clip.frameSize[0]:p.width,sourceHeight=registration?clip.frameSize[1]:p.height,minShort=s.options.touch?384:512;
    let [width,height]=dimensions(sourceWidth,sourceHeight,s.options.touch?576:768);
    if(Math.min(width,height)<minShort)[width,height]=dimensions(sourceWidth,sourceHeight,Math.ceil(Math.max(sourceWidth,sourceHeight)*minShort/Math.min(sourceWidth,sourceHeight)));
    const scale=registration?finite(registration.scale,1):1;
    const bounds=registration?alpha.bounds.map((n,i)=>n*scale+registration.dest[i%2]):alpha.bounds.slice();
    const record={key,subject:clip.subject,clip:clip.clip,frame,pose:clip.clip,url,sourceWidth,sourceHeight,bounds,visiblePixels:alpha.visiblePixels,
      ...(registration?{sourceRegion:registration.source.slice(),sourceDestination:registration.dest.slice(),sourceScale:scale,sourcePlateWidth:p.im.naturalWidth,sourcePlateHeight:p.im.naturalHeight}:{}),
      textureName:'photo_hr_'+clip.subject+'_'+clip.clip+'_'+frame,heightRatio:1,permanent:clip.clip==='swim'&&frame===0};
    if(!upload(s,record,p.im,alpha.region,width,height,registration?{size:clip.frameSize,dest:registration.dest,scale}:null))return null;s.motionRecords.set(key,record);return record;
  }
  async function prepareMotion(renderer,name,mode){
    const s=context(renderer);if(!s)return null;if(s.promise)await s.promise;
    const clip=s.clips.get(name+':'+mode);if(!clip)return null;
    for(let i=0;i<clip.plates.length;i++){const p=await plate(s,clip,i);if(!p)return null;for(let frame=0;frame<clip.frames;frame++){const stored=clip.order?clip.order[frame]:frame;if(Math.floor(stored/(clip.cols*clip.rows))===i)motionRecord(s,clip,frame);}}
    return inspect(renderer).motions;
  }
  function beginFrame(renderer){const s=context(renderer);if(s)s.pinned.clear();}
  function endFrame(renderer){
    // Every sprite draw has now been submitted. WebGL retains references for
    // queued commands; asynchronous uploads may safely reuse old cache slots.
    const s=context(renderer);if(s)s.pinned.clear();
  }
  async function load(renderer,options={}){
    if(!renderer||!renderer.gl)return null;
    const prior=context(renderer);if(prior)return prior.promise;
    const s={status:'loading',renderer,options,records:new Map(),subjects:{},expected:0,bytes:0,budget:(options.touch?48:80)*1024*1024,failures:[],promise:null,
      clips:new Map(),motionRecords:new Map(),poseJobs:new Map(),plates:new Map(),plateJobs:new Map(),motionFailures:[],retries:new Map(),pinned:new Set(),flipActors:new WeakMap(),lastMotion:new WeakMap(),use:0,evictions:0,cpuBytes:0,cpuBudget:(options.touch?64:128)*1024*1024};
    contexts.set(renderer,s);
    s.promise=(async()=>{
      try{
        const response=await root.fetch(BASE+'manifest.json');if(!response.ok)throw new Error('Complete photographic sprite manifest HTTP '+response.status);
        const manifest=await response.json();if(manifest.version!==1||!manifest.subjects)throw new Error('Invalid complete photographic sprite manifest');
        if(root.PhotoMotion&&root.PhotoMotion.configure)root.PhotoMotion.configure(manifest);
        const jobs=[];
        for(const name of SUBJECTS){
          const subject=manifest.subjects[name];if(!subject||!subject.poses||!subject.poses.idle)throw new Error('Missing complete photographic subject: '+name);
          s.subjects[name]={height:finite(subject.height,name==='cow'?1.42:1.76)};
          for(const [pose,value]of Object.entries(subject.poses)){
            if(!/^[a-z_]+$/.test(pose))throw new Error('Invalid photographic pose name');
            const entry=typeof value==='string'?{file:value}:value;
            if(!entry||!filename(entry.file))throw new Error('Invalid photographic sprite filename');
            jobs.push({name,pose,entry});
          }
          for(const [mode,value]of Object.entries(subject.animations||{})){
            if(!['walk','run','swim'].includes(mode)||!value||!Array.isArray(value.plates)||!value.plates.length||!value.plates.every(filename)||(mode==='swim'?(value.cols!==1||value.rows!==4||value.frames!==8||!Number.isFinite(value.worldHeight)||value.worldHeight<.4||value.worldHeight>1):(value.cols!==2||value.rows!==2))||!Number.isInteger(value.frames)||value.frames!==value.plates.length*4)throw new Error('Invalid photographic movement clip: '+name+':'+mode);
            if(value.order&&(!Array.isArray(value.order)||value.order.length!==value.frames||new Set(value.order).size!==value.frames||!value.order.every(n=>Number.isInteger(n)&&n>=0&&n<value.frames)))throw new Error('Invalid photographic movement frame order');
            if(value.registration&&(!Array.isArray(value.registration)||value.registration.length!==value.frames||!value.registration.every(r=>r&&Number.isFinite(r.baseline)&&r.baseline>.4&&r.baseline<=1&&Number.isFinite(r.center)&&r.center>=0&&r.center<=1)))throw new Error('Invalid photographic movement registration');
            if(value.sourceRegions){
              if(!Array.isArray(value.frameSize)||value.frameSize.length!==2||!value.frameSize.every(n=>Number.isInteger(n)&&n>=384&&n<=2048)||Math.max(...value.frameSize)<768||!Array.isArray(value.sourceRegions)||value.sourceRegions.length!==value.frames||!value.sourceRegions.every(r=>r&&Array.isArray(r.source)&&r.source.length===4&&r.source.every(Number.isInteger)&&r.source[0]>=0&&r.source[1]>=0&&r.source[2]>0&&r.source[3]>0&&(r.scale===undefined||Number.isFinite(r.scale)&&r.scale>=.5&&r.scale<=1.5)&&Array.isArray(r.dest)&&r.dest.length===2&&r.dest.every(Number.isFinite)&&r.dest[0]>=-1e-6&&r.dest[1]>=-1e-6&&r.dest[0]+r.source[2]*finite(r.scale,1)<=value.frameSize[0]+1e-6&&r.dest[1]+r.source[3]*finite(r.scale,1)<=value.frameSize[1]+1e-6))throw new Error('Invalid complete photographic source regions');
            }
            s.clips.set(name+':'+mode,{...value,subject:name,clip:mode,baseline:Math.max(.5,Math.min(1,finite(value.baseline,.96))),bodyHeight:Math.max(.4,Math.min(1,finite(value.bodyHeight,.88)))});
          }
        }
        // Put each subject's complete base pose on screen before optional aim
        // pictures. Serial decode/upload also bounds temporary CPU canvases.
        const priority=pose=>pose==='idle'?0:pose==='aim'?1:2;
        jobs.sort((a,b)=>priority(a.pose)-priority(b.pose));s.expected=jobs.length;
        for(const {name,pose,entry} of jobs){
          if(renderer.gl.isContextLost()||options.current&&!options.current()){s.status='retired';return inspect(renderer);}
          const url=BASE+entry.file,im=await image(url),alpha=measure(im);
          if(renderer.gl.isContextLost()||options.current&&!options.current()){s.status='retired';return inspect(renderer);}
          const sourceWidth=im.naturalWidth,sourceHeight=im.naturalHeight;
          const [width,height]=dimensions(sourceWidth,sourceHeight,options.touch?960:1248);
          const record={key:name+':'+pose,subject:name,pose,url,sourceWidth,sourceHeight,width,height,gpuWidth:width,gpuHeight:height,bytes:mipBytes(width,height),loaded:false,resident:false,textureName:'photo_hr_'+name+'_'+pose,
            bounds:alpha.bounds,visiblePixels:alpha.visiblePixels,heightRatio:Math.max(.05,Math.min(1.5,finite(entry.heightRatio,1)))};
          const texture=upload(s,record,im,null,width,height);
          // A crowded first ground frame can pin every available gait slot.
          // Optional actions retain their metadata and reload on demand; they
          // must never turn ordinary cache pressure into a startup failure.
          if(!texture&&pose==='idle')throw new Error('Complete photographic sprites exceed the bounded texture budget');s.records.set(record.key,record);
          // Compatibility readiness aliases refer to a full 1x1 image. Drawing
          // always uses textureName, so no legacy 8x6 coordinates can select it.
          if(pose==='idle'){
            renderer.textures['photo_'+name]=texture;
            // A paused game does not call update; release the loading veil as
            // soon as the six complete base photographs themselves are ready.
            if(SUBJECTS.every(subject=>s.records.has(subject+':idle')))root.document.getElementById('photoLoading')?.remove();
          }
        }
        // Keep one complete horizontal photo for each actual swimmer ready.
        // Optional stroke frames share the existing LRU, while these three
        // small fallback slots prevent a temporary decode from standing an
        // actor upright in the water. No land-gait frames are preloaded here.
        for(const name of SUBJECTS){const clip=s.clips.get(name+':swim');if(!clip)continue;const stored=clip.order?clip.order[0]:0,index=Math.floor(stored/(clip.cols*clip.rows));if(await plate(s,clip,index))motionRecord(s,clip,0);}
        s.status='ready';return inspect(renderer);
      }catch(error){s.status='error';s.failures.push(String(error&&error.message||error));if(root.console)root.console.error(s.failures[s.failures.length-1]);return inspect(renderer);}
    })();
    return s.promise;
  }
  function describe(actor,options={}){
    const s=context(options.renderer),name=options.photoName;
    if(!s||!s.subjects[name])return null;
    const suspended=actor.alive!==false&&!!actor.suspended&&name==='aviator';
    let pose=suspended?'harness':actor.alive===false?'fallen':actor.crouch||actor.crouched?'crouch':actor.armed!==false&&(actor.seen||actor.kind==='guardAim'||actor.state==='pursuit')?'aim':'idle';
    const owner=options.owner||actor,gait=options.photoMotion||root.PhotoMotion&&options.game&&root.PhotoMotion.pose(owner,options.game);
    // Stroke phase is owned by real swimming travel, never walking distance or
    // a render-time clock. A stationary swimmer holds a complete glide pose.
    const swimming=!suspended&&actor.alive!==false&&!!actor.swimming&&s.clips.has(name+':swim');
    const motion=swimming?{enabled:true,moving:true,clip:'swim',phase:finite(actor.swimPhase),velocity:gait&&gait.velocity&&Math.hypot(...gait.velocity)>.05?gait.velocity:[Math.sin(finite(actor.yaw,finite(actor.face))),-Math.cos(finite(actor.yaw,finite(actor.face)))]}:gait;
    const camera=options.camera||options.renderer&&options.renderer.eye;
    // Ground NPC/cow source Y is often zero until terrain placement in render.
    // Horizontal camera distance therefore determines presentation detail.
    const near=!camera||!actor.p||Math.hypot(camera[0]-actor.p[0],camera[2]-actor.p[2])<=60;
    if(!suspended&&!near&&motion&&motion.moving&&actor.alive!==false)pose='idle';
    const requestedPose=pose;
    // Threat recognition alone is not a shooting pose. Pursuers keep their
    // actual armed running frames; an explicitly firing/stunned actor stops.
    const locomotion=!suspended&&(near||swimming)&&actor.alive!==false&&(swimming||!actor.crouch&&!actor.crouched&&!actor.stunned&&!actor.firing)&&motion&&motion.enabled&&motion.moving;
    const remembered=s.lastMotion.get(owner);
    if(!locomotion||swimming||remembered&&(remembered.subject!==name||remembered.clip!==motion.clip))s.lastMotion.delete(owner);
    if(locomotion){
      const clip=s.clips.get(name+':'+motion.clip);
      if(clip){
        const frame=Math.floor(((finite(motion.phase)%1+1)%1)*clip.frames)%clip.frames;
        // Authored in-between plates can be interleaved in semantic order.
        // Two upcoming poses give an interleaved next plate time to decode,
        // without warming a whole clip or any unrelated subject. CPU plates
        // retain the existing LRU; only the current pose uploads to the GPU.
        const needed=new Set();
        for(let ahead=0;ahead<=2;ahead++){
          const upcoming=(frame+ahead)%clip.frames,key=name+':'+clip.clip+':'+upcoming,stored=clip.order?clip.order[upcoming]:upcoming;
          if(!s.motionRecords.has(key))needed.add(Math.floor(stored/(clip.cols*clip.rows)));
        }
        for(const i of needed)plate(s,clip,i);
        let animated=motionRecord(s,clip,frame)||(swimming&&s.motionRecords.get(name+':swim:0')),held=false;
        // Decoding an interleaved plate must not flash a standing photograph
        // into a moving gait. Hold only this actor's last complete photograph
        // from this same clip, and only while its owned GPU texture is live.
        // Remembering a key does not pin it between frames or defeat the LRU.
        if(!animated&&!swimming){
          const last=s.lastMotion.get(owner),prior=last&&s.motionRecords.get(last.key),texture=prior&&s.renderer.textures[prior.textureName],gl=s.renderer.gl;
          if(prior&&prior.resident&&texture&&texture.tex&&(!gl.isTexture||gl.isTexture(texture.tex))){animated=touch(s,prior);held=true;}
        }
        if(animated){
          if(!swimming&&!held)s.lastMotion.set(owner,{subject:name,clip:clip.clip,key:animated.key});
          s.pinned.add(animated.key);let flip=!!s.flipActors.get(owner);
          let right=[1,0];
          if(options.camera&&actor.p&&motion.velocity){const dx=options.camera[0]-actor.p[0],dz=options.camera[2]-actor.p[2],length=Math.hypot(dx,dz)||1,travel=(motion.velocity[0]*dz-motion.velocity[1]*dx)/length;
            right=[dz/length,-dx/length];
            if(Math.abs(travel)>.08){flip=clip.facing==='left'?travel>0:travel<0;s.flipActors.set(owner,flip);}}
          const registration=clip.registration&&clip.registration[animated.frame];
          return descriptor(animated,s,swimming?{...options,height:clip.worldHeight}:options,name,clip.clip,animated.frame,{photoBodyFraction:clip.bodyHeight,photoBaseline:registration?registration.baseline:clip.baseline,photoCenter:registration?registration.center:.5,photoRight:right,flip,...(swimming?{photoSwimming:true}:{}),...(held?{photoHeldFrame:true}:{}),...(animated.frame!==frame?{photoPendingFrame:frame}:{})});
        }
      }
    }
    let record=s.records.get(name+':'+pose);
    if(record&&!record.resident){preparePose(options.renderer,name,pose);record=null;}
    // The full legacy parachute remains the render fallback until a genuine
    // suspended photograph is resident; never substitute a standing body.
    if(suspended&&!record)return null;
    if(!record){pose='idle';record=s.records.get(name+':idle');}
    if(!record)return null;
    touch(s,record);s.pinned.add(record.key);
    return descriptor(record,s,options,name,pose,0,{...(requestedPose!==pose?{photoPendingPose:requestedPose}:{}),...(suspended?{photoSuspended:true}:{})});
  }
  function descriptor(record,s,options,name,pose,frame,extra={}){
    const baseHeight=finite(options.height,s.subjects[name].height);
    return {photoName:name,photoFrame:frame,photoCutout:true,photoAsset:record.key,photoPose:pose,textureName:record.textureName,
      photoBounds:record.bounds.slice(),photoWidth:record.sourceWidth,photoHeight:record.sourceHeight,
      h:baseHeight*record.heightRatio,flip:false,...extra};
  }
  function anchor(sprite){
    if(!sprite||!sprite.photoCutout)return null;
    const bounds=sprite.photoBounds,height=sprite.photoHeight,width=sprite.photoWidth;
    if(!bounds||!(height>0)||!(width>0)||!(bounds[3]>bounds[1]))return null;
    const fraction=finite(sprite.photoBodyFraction,(bounds[3]-bounds[1])/height),quadHeight=sprite.h/fraction,bottom=1-finite(sprite.photoBaseline,bounds[3]/height),quadWidth=quadHeight*width/height;
    const center=finite(sprite.photoCenter,.5),offset=((sprite.flip?1-center:center)-.5)*quadWidth,right=sprite.photoRight||[1,0];
    return {...sprite,p:[sprite.p[0]-right[0]*offset,sprite.p[1]-bottom*quadHeight,sprite.p[2]-right[1]*offset],h:quadHeight,w:quadWidth,cell:0,cols:1,rows:1,motion:null};
  }
  function guard(game){
    const doc=root.document,node=doc&&doc.getElementById('photoLoading');
    if(!game||!game.evade||game.phase!=='evade'){if(node)node.remove();return false;}
    const s=context(game.rend);
    if(s&&s.status==='error'){
      if(node)node.remove();
      if(!s.reported&&game.app&&game.app.graphicsFailure){s.reported=true;game.app.graphicsFailure(new Error(s.failures.join('; ')));}
      return true;
    }
    const ready=s?SUBJECTS.filter(name=>s.records.has(name+':idle')).length:0;
    if(ready===SUBJECTS.length){if(node)node.remove();return false;}
    if(doc){
      let veil=node;
      if(!veil){veil=doc.createElement('div');veil.id='photoLoading';veil.setAttribute('role','status');veil.style.cssText='position:absolute;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;background:rgba(4,9,14,.72);color:#eee9dc;font:16px Arial,sans-serif;padding:24px;text-align:center';doc.getElementById('game')?.appendChild(veil);}
      veil.textContent='Loading complete photographs… '+ready+' / '+SUBJECTS.length;
    }
    return true;
  }
  root.PhotoCutouts=Object.freeze({load,describe,anchor,inspect,guard,prepareMotion,preparePose,hasPose,beginFrame,endFrame,subjects:SUBJECTS,mipBytes});
})(window);
