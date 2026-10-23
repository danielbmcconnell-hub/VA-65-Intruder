/* Whole, high-resolution photographic subjects. Each pose owns one texture;
 * there are no atlas cells, reconstructed colour blocks or animated mattes.
 */
(function(root){
  'use strict';
  const SUBJECTS=Object.freeze(['farmer','militia','female_vc','nva','aviator','cow']);
  const BASE='assets/sprites/hires/';
  const contexts=new WeakMap();
  const finite=(n,f=0)=>Number.isFinite(n)?n:f;
  function context(renderer){return renderer&&contexts.get(renderer);}
  function mipBytes(width,height){let bytes=0;for(;;){bytes+=width*height*4;if(width===1&&height===1)break;width=Math.max(1,width>>1);height=Math.max(1,height>>1);}return bytes;}
  function dimensions(width,height,limit){const scale=Math.min(1,limit/Math.max(width,height));return [Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale))];}
  function image(url){return new Promise((resolve,reject)=>{const im=new root.Image();im.decoding='async';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Complete photographic sprite failed to load: '+url));im.src=url;});}
  function measure(im){
    const canvas=root.document.createElement('canvas');canvas.width=im.naturalWidth;canvas.height=im.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Cannot read photographic sprite alpha');
    ctx.drawImage(im,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let x0=canvas.width,y0=canvas.height,x1=0,y1=0,visible=0;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>128){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);visible++;}
    canvas.width=canvas.height=1;
    if(!visible||x1<=x0||y1<=y0)throw new Error('Photographic sprite has no complete visible subject');
    return {bounds:[x0,y0,x1,y1],visiblePixels:visible};
  }
  function inspect(renderer){
    const s=context(renderer);if(!s)return {status:'unloaded',ready:0,expected:0,bytes:0,budget:0,failures:[],records:[]};
    return {status:s.status,ready:s.records.size,expected:s.expected,bytes:s.bytes,budget:s.budget,
      failures:s.failures.slice(),records:[...s.records.values()].map(r=>({...r,bounds:r.bounds.slice()}))};
  }
  async function load(renderer,options={}){
    if(!renderer||!renderer.gl)return null;
    const prior=context(renderer);if(prior)return prior.promise;
    const s={status:'loading',records:new Map(),subjects:{},expected:0,bytes:0,budget:(options.touch?48:80)*1024*1024,failures:[],promise:null};
    contexts.set(renderer,s);
    s.promise=(async()=>{
      try{
        const response=await root.fetch(BASE+'manifest.json');if(!response.ok)throw new Error('Complete photographic sprite manifest HTTP '+response.status);
        const manifest=await response.json();if(manifest.version!==1||!manifest.subjects)throw new Error('Invalid complete photographic sprite manifest');
        const jobs=[];
        for(const name of SUBJECTS){
          const subject=manifest.subjects[name];if(!subject||!subject.poses||!subject.poses.idle)throw new Error('Missing complete photographic subject: '+name);
          s.subjects[name]={height:finite(subject.height,name==='cow'?1.42:1.76)};
          for(const [pose,value]of Object.entries(subject.poses)){
            if(!/^[a-z_]+$/.test(pose))throw new Error('Invalid photographic pose name');
            const entry=typeof value==='string'?{file:value}:value;
            if(!entry||!/^[a-z0-9_-]+\.png$/.test(entry.file))throw new Error('Invalid photographic sprite filename');
            jobs.push({name,pose,entry});
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
          let limit=options.touch?960:1248,[width,height]=dimensions(sourceWidth,sourceHeight,limit);
          while(s.bytes+mipBytes(width,height)>s.budget&&limit>384){limit=Math.floor(limit*.85);[width,height]=dimensions(sourceWidth,sourceHeight,limit);}
          const bytes=mipBytes(width,height);if(s.bytes+bytes>s.budget)throw new Error('Complete photographic sprites exceed the bounded texture budget');
          const canvas=root.document.createElement('canvas');canvas.width=width;canvas.height=height;
          const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Cannot prepare complete photographic texture');
          ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(im,0,0,width,height);
          const textureName='photo_hr_'+name+'_'+pose,texture=renderer.texFromCanvas(textureName,canvas),gl=renderer.gl;
          gl.bindTexture(gl.TEXTURE_2D,texture.tex);gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
          const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
          if(anisotropy)gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
          const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error('Complete photographic texture upload failed: '+error);
          canvas.width=canvas.height=1;
          const record={key:name+':'+pose,subject:name,pose,url,sourceWidth,sourceHeight,width,height,gpuWidth:width,gpuHeight:height,bytes,loaded:true,textureName,
            bounds:alpha.bounds,visiblePixels:alpha.visiblePixels,heightRatio:Math.max(.05,Math.min(1.5,finite(entry.heightRatio,1)))};
          s.records.set(record.key,record);s.bytes+=bytes;
          // Compatibility readiness aliases refer to a full 1x1 image. Drawing
          // always uses textureName, so no legacy 8x6 coordinates can select it.
          if(pose==='idle'){
            renderer.textures['photo_'+name]=texture;
            // A paused game does not call update; release the loading veil as
            // soon as the six complete base photographs themselves are ready.
            if(SUBJECTS.every(subject=>s.records.has(subject+':idle')))root.document.getElementById('photoLoading')?.remove();
          }
        }
        s.status='ready';return inspect(renderer);
      }catch(error){s.status='error';s.failures.push(String(error&&error.message||error));if(root.console)root.console.error(s.failures[s.failures.length-1]);return inspect(renderer);}
    })();
    return s.promise;
  }
  function describe(actor,options={}){
    const s=context(options.renderer),name=options.photoName;
    if(!s||!s.subjects[name])return null;
    let pose=actor.alive===false?'fallen':actor.crouch||actor.crouched?'crouch':actor.armed!==false&&(actor.seen||actor.kind==='guardAim'||actor.state==='pursuit')?'aim':'idle';
    const requestedPose=pose;
    let record=s.records.get(name+':'+pose);
    if(!record){pose='idle';record=s.records.get(name+':idle');}
    if(!record)return null;
    const baseHeight=finite(options.height,s.subjects[name].height);
    return {photoName:name,photoFrame:0,photoCutout:true,photoAsset:record.key,photoPose:pose,textureName:record.textureName,
      photoBounds:record.bounds.slice(),photoWidth:record.sourceWidth,photoHeight:record.sourceHeight,
      h:baseHeight*record.heightRatio,flip:false,...(requestedPose!==pose?{photoPendingPose:requestedPose}:{})};
  }
  function anchor(sprite){
    if(!sprite||!sprite.photoCutout)return null;
    const bounds=sprite.photoBounds,height=sprite.photoHeight,width=sprite.photoWidth;
    if(!bounds||!(height>0)||!(width>0)||!(bounds[3]>bounds[1]))return null;
    const fraction=(bounds[3]-bounds[1])/height,quadHeight=sprite.h/fraction,bottom=1-bounds[3]/height;
    return {...sprite,p:[sprite.p[0],sprite.p[1]-bottom*quadHeight,sprite.p[2]],h:quadHeight,w:quadHeight*width/height,cell:0,cols:1,rows:1,motion:null};
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
  root.PhotoCutouts=Object.freeze({load,describe,anchor,inspect,guard,subjects:SUBJECTS,mipBytes});
})(window);
