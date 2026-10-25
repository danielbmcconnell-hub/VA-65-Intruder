/* Complete botanical photographs, registered to the existing ground surface.
 * This is presentation only: procedural terrain, collisions, AI and flight are
 * never changed. Local understory is deterministic and independently bounded. */
(function(root){
  'use strict';
  const KINDS=Object.freeze(['canopy','bamboo','nipa','fern','liana','litter']);
  const HEIGHTS=Object.freeze({canopy:13.6,bamboo:7.4,nipa:4.3,fern:1.35,liana:10.8,litter:1.2});
  const PROFILES=Object.freeze([
    Object.freeze({total:112,canopy:34,understory:42,floor:14,soft:4,range:96,sceneryRange:480,flightTotal:112,flightRange:1020,farTotal:16,horizon:14000,crowns:28,wind:0}),
    Object.freeze({total:176,canopy:52,understory:66,floor:24,soft:8,range:136,sceneryRange:760,flightTotal:176,flightRange:1530,farTotal:24,horizon:18000,crowns:44,wind:20}),
    Object.freeze({total:240,canopy:72,understory:90,floor:36,soft:12,range:166,sceneryRange:1100,flightTotal:240,flightRange:1900,farTotal:32,horizon:22000,crowns:60,wind:32})
  ]);
  const LIMITS=Object.freeze({cell:18,cellUpdates:4,candidatesPerCell:3,fineCell:4.5,fineUpdates:2,fineCache:128,terrainSamples:72,queueSamples:18,solidChecks:36,cache:256,maxDesktopEdge:1024,maxTouchEdge:768,desktopBytes:24*1024*1024,touchBytes:14*1024*1024});
  const renderers=new WeakMap(),games=new WeakMap();let terrain=null,jungle=null,revision=0;
  const finite=(n,f=0)=>Number.isFinite(n)?n:f;
  const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a),0,1);return t*t*(3-2*t);};
  const hash=(x,z,n)=>{let h=Math.imul((x|0)^Math.imul(z|0,374761393),668265263)^Math.imul(n|0,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
  // Match the terrain's full river/flood-bank band, with a small dry margin.
  // Forest biome alone includes riverbeds; their water material must remain
  // visible rather than acquiring ground leaves, trunks or animal spawns.
  function habitat(biome,river){return Number.isFinite(biome)&&Number.isFinite(river)&&biome<.5&&Math.abs(river-.5)>.055;}
  const quality=r=>clamp(Math.round(finite(r&&r.quality,1)),0,2);
  const eligible=g=>!!(g&&g.evade&&(!g.phase||g.phase==='evade')&&!g.pow&&!g.evade.camp&&!g.evade.river&&point(g.evade.p)&&terrain);
  // Replacing existing world plants is useful in flight and cultivated land
  // too. New understory, forest atmosphere and trunk collision stay on foot.
  const sceneryEligible=g=>!!(terrain&&g&&(point(g.evade?.p)||point(g.ac?.p)&&(!g.phase||['flight','airborne','chute'].includes(g.phase))));
  function configure(o){if(!o||typeof o.terrainH!=='function')return false;if(terrain!==o.terrainH||jungle!==o.jungle){terrain=o.terrainH;jungle=typeof o.jungle==='function'?o.jungle:null;revision++;}return true;}
  function renderer(r){let s=renderers.get(r);if(!s){s={status:'idle',records:new Map(),floor:null,floorStatus:'idle',crown:null,crownStatus:'idle',expectedSources:KINDS.length,failures:[],bytes:0,promise:null,touch:false};renderers.set(r,s);}return s;}
  function state(g,r){let s=games.get(g);if(!s||s.world!==g.world||s.evade!==g.evade||s.revision!==revision){s={world:g.world,evade:g.evade,revision,cells:new Map(),fine:new Map(),anchors:new Map(),scenery:[],sceneryIds:new Set(),distant:[],distantIds:new Set(),crowns:[],established:new Set(),obstacles:[],pending:[],ids:new Set(),counts:{},samples:0,queueSamples:0,solidChecks:0,fineUpdates:0,updates:0,skipped:0,wind:0};games.set(g,s);}return s;}
  function measure(width,height,pixels){
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||!pixels||pixels.length!==width*height*4)throw Error('Invalid botanical RGBA source');
    let x0=width,y0=height,x1=0,y1=0,visible=0,soft=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const a=pixels[(y*width+x)*4+3];if(a>16){visible++;if(a<250)soft++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}}
    if(visible<100||x1<=x0||y1<=y0)throw Error('Empty botanical photograph');
    if(x0===0||y0===0||x1===width||y1===height)throw Error('Botanical source touches its outer boundary');
    let sum=0,weighted=0;const from=Math.max(y0,Math.floor(y1-(y1-y0)*.1));
    for(let y=from;y<y1;y++)for(let x=x0;x<x1;x++){const a=pixels[(y*width+x)*4+3];if(a>16){sum+=a;weighted+=(x+.5)*a;}}
    return {width,height,bounds:[x0,y0,x1,y1],bodyFraction:(y1-y0)/height,baseline:y1/height,center:sum?weighted/sum/width:(x0+x1)/2/width,visiblePixels:visible,softPixels:soft};
  }
  function mipBytes(width,height){let bytes=0;for(;;){bytes+=width*height*4;if(width===1&&height===1)return bytes;width=Math.max(1,Math.floor(width/2));height=Math.max(1,Math.floor(height/2));}}
  async function load(r,options={}){
    if(!r||typeof r.texFromCanvas!=='function')return null;const s=renderer(r);if(s.promise)return s.promise;s.touch=!!options.touch;s.current=typeof options.current==='function'?options.current:null;s.status='loading';
    const current=()=>!options.current||options.current();
    s.promise=(async()=>{
      try{
        const response=await root.fetch(options.manifest||'assets/jungle/manifest.json');if(!response.ok)throw Error('Botanical manifest HTTP '+response.status);
        const manifest=await response.json();if(manifest.version!==1||!manifest.plants)throw Error('Invalid botanical manifest');
        s.expectedSources=KINDS.length+(manifest.floor?1:0)+(manifest.crown?1:0);s.floorStatus=manifest.floor?'loading':'absent';s.crownStatus=manifest.crown?'loading':'absent';
        for(const kind of KINDS){
          const spec=manifest.plants[kind];if(!spec||typeof spec.file!=='string'||!/^[a-z0-9_-]+\.(png|webp)$/.test(spec.file))throw Error('Missing complete botanical source '+kind);
          try{
            const im=await new Promise((resolve,reject)=>{const image=new root.Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Botanical image failed: '+spec.file));image.src='assets/jungle/'+spec.file;});
            if(!current()||r.gl&&r.gl.isContextLost())return inspect(null,r);
            if(Math.max(im.naturalWidth,im.naturalHeight)<1024||Math.min(im.naturalWidth,im.naturalHeight)<512)throw Error('Botanical photograph resolution below requirement');
            const max=s.touch?LIMITS.maxTouchEdge:LIMITS.maxDesktopEdge,scale=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));
            const cv=root.document.createElement('canvas');cv.width=Math.max(1,Math.round(im.naturalWidth*scale));cv.height=Math.max(1,Math.round(im.naturalHeight*scale));
            const ctx=cv.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Botanical decode canvas unavailable');ctx.imageSmoothingQuality='high';ctx.drawImage(im,0,0,cv.width,cv.height);
            const measured=measure(cv.width,cv.height,ctx.getImageData(0,0,cv.width,cv.height).data),bytes=mipBytes(cv.width,cv.height),budget=s.touch?LIMITS.touchBytes:LIMITS.desktopBytes;
            if(s.bytes+bytes>budget)throw Error('Botanical texture budget exceeded');
            const name='jungle_'+kind,gl=r.gl,before=gl&&typeof gl.getParameter==='function'?{active:gl.getParameter(gl.ACTIVE_TEXTURE),texture:gl.getParameter(gl.TEXTURE_BINDING_2D),flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiplied:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)}:null;let T;
            try{T=r.texFromCanvas(name,cv);if(!T||!T.tex)throw Error('Botanical GPU upload unavailable');if(gl){gl.bindTexture(gl.TEXTURE_2D,T.tex);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}}
            finally{if(before){gl.activeTexture(before.active);gl.bindTexture(gl.TEXTURE_2D,before.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,before.flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,before.premultiplied);}}
            s.records.set(kind,{kind,textureName:name,file:spec.file,sourceWidth:im.naturalWidth,sourceHeight:im.naturalHeight,bytes,...measured});s.bytes+=bytes;cv.width=cv.height=1;
          }catch(error){if(s.failures.length<KINDS.length)s.failures.push({kind,message:String(error&&error.message||error)});}
        }
        if(manifest.floor){
          s.floorStatus='loading';
          try{
            const spec=manifest.floor;
            if(!spec||typeof spec.file!=='string'||!/^[a-z0-9_-]+\.webp$/.test(spec.file)||!Number.isFinite(spec.worldSize)||spec.worldSize<1||spec.worldSize>8)throw Error('Invalid photographic forest-floor material');
            const im=await new Promise((resolve,reject)=>{const image=new root.Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Forest-floor image failed: '+spec.file));image.src='assets/jungle/'+spec.file;});
            if(!current()||r.gl&&r.gl.isContextLost())return inspect(null,r);
            if(im.naturalWidth!==im.naturalHeight||im.naturalWidth<1024||im.naturalWidth!==spec.width||im.naturalHeight!==spec.height)throw Error('Forest-floor photograph must retain its complete high-resolution square source');
            const edge=s.touch?384:512,cv=root.document.createElement('canvas');cv.width=cv.height=edge;const ctx=cv.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Forest-floor decode canvas unavailable');ctx.imageSmoothingQuality='high';ctx.drawImage(im,0,0,edge,edge);
            const pixels=ctx.getImageData(0,0,edge,edge).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255)throw Error('Forest-floor material must be fully opaque');
            const bytes=mipBytes(edge,edge),budget=s.touch?LIMITS.touchBytes:LIMITS.desktopBytes;if(s.bytes+bytes>budget)throw Error('Forest-floor material exceeds the shared botanical texture budget');
            const name='jungle_floor',gl=r.gl,before=gl&&typeof gl.getParameter==='function'?{active:gl.getParameter(gl.ACTIVE_TEXTURE),texture:gl.getParameter(gl.TEXTURE_BINDING_2D),flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiplied:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)}:null;let T;
            try{T=r.texFromCanvas(name,cv);if(!T||!T.tex)throw Error('Forest-floor GPU upload unavailable');if(gl){gl.bindTexture(gl.TEXTURE_2D,T.tex);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);}}
            finally{if(before){gl.activeTexture(before.active);gl.bindTexture(gl.TEXTURE_2D,before.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,before.flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,before.premultiplied);}}
            s.floor={textureName:name,file:spec.file,sourceWidth:im.naturalWidth,sourceHeight:im.naturalHeight,width:edge,height:edge,worldSize:spec.worldSize,bytes,opaque:true};s.bytes+=bytes;s.floorStatus='ready';cv.width=cv.height=1;
          }catch(error){s.floorStatus='error';s.failures.push({kind:'floor',message:String(error&&error.message||error)});}
        }else s.floorStatus='absent';
        if(manifest.crown){
          try{
            const spec=manifest.crown;if(!spec||typeof spec.file!=='string'||!/^[a-z0-9_-]+\.webp$/.test(spec.file))throw Error('Invalid aerial crown photograph');
            const im=await new Promise((resolve,reject)=>{const image=new root.Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Crown image failed: '+spec.file));image.src='assets/jungle/'+spec.file;});
            if(!current()||r.gl&&r.gl.isContextLost())return inspect(null,r);
            if(im.naturalWidth!==im.naturalHeight||im.naturalWidth<1024||im.naturalWidth!==spec.width||im.naturalHeight!==spec.height)throw Error('Aerial crown must retain its complete square source');
            const edge=s.touch?448:512,cv=root.document.createElement('canvas');cv.width=cv.height=edge;const ctx=cv.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Crown decode canvas unavailable');ctx.imageSmoothingQuality='high';ctx.drawImage(im,0,0,edge,edge);
            const measured=measure(edge,edge,ctx.getImageData(0,0,edge,edge).data),bytes=mipBytes(edge,edge),budget=s.touch?LIMITS.touchBytes:LIMITS.desktopBytes;if(s.bytes+bytes>budget)throw Error('Aerial crown exceeds the shared botanical texture budget');
            const name='jungle_crown',gl=r.gl,before=gl&&typeof gl.getParameter==='function'?{active:gl.getParameter(gl.ACTIVE_TEXTURE),texture:gl.getParameter(gl.TEXTURE_BINDING_2D),flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiplied:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)}:null;let T;
            try{T=r.texFromCanvas(name,cv);if(!T||!T.tex)throw Error('Crown GPU upload unavailable');if(gl){gl.bindTexture(gl.TEXTURE_2D,T.tex);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}}
            finally{if(before){gl.activeTexture(before.active);gl.bindTexture(gl.TEXTURE_2D,before.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,before.flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,before.premultiplied);}}
            s.crown={kind:'crown',textureName:name,file:spec.file,sourceWidth:im.naturalWidth,sourceHeight:im.naturalHeight,...measured,referenceWidth:(measured.bounds[2]-measured.bounds[0])/edge,bodyHeight:measured.bodyFraction,bytes};s.bytes+=bytes;s.crownStatus='ready';cv.width=cv.height=1;
          }catch(error){s.crownStatus='error';s.failures.push({kind:'crown',message:String(error&&error.message||error)});}
        }
        s.status=s.records.size?'ready':'error';return inspect(null,r);
      }catch(error){s.status='error';s.failures.push({kind:'manifest',message:String(error&&error.message||error)});return inspect(null,r);}
    })();return s.promise;
  }
  function ready(r){const s=r&&renderers.get(r);return !!(s&&s.status==='ready'&&s.records.size);}
  function crownReady(r){const s=r&&renderers.get(r),T=s&&s.crown&&r.textures&&r.textures[s.crown.textureName];return !!(s&&s.crownStatus==='ready'&&T&&T.tex&&(!s.current||s.current())&&!(r.gl&&r.gl.isContextLost()));}
  function floorTexture(r){const s=r&&renderers.get(r),record=s&&s.floor,T=record&&r.textures&&r.textures[record.textureName];if(!s||s.floorStatus!=='ready'||!T||!T.tex||s.current&&!s.current()||r.gl&&(r.gl.isContextLost()||typeof r.gl.isTexture==='function'&&!r.gl.isTexture(T.tex)))return null;return {...record,tex:T.tex,w:record.width,h:record.height,ready:true};}
  function beginFrame(g,r){if(!g||!r)return false;const s=state(g,r);s.renderer=r;s.pending.length=0;s.scenery.length=0;s.sceneryIds.clear();s.distant.length=0;s.distantIds.clear();s.crowns.length=0;s.ids.clear();s.counts={};s.samples=s.queueSamples=s.solidChecks=s.fineUpdates=s.updates=s.skipped=s.wind=0;return sceneryEligible(g);}
  function anchor(record,p,height,eye,tint){
    if(!record||!point(p)||!point(eye)||!Number.isFinite(height)||height<=0||!Number.isFinite(record.bodyFraction)||record.bodyFraction<=0)return null;
    const h=height/record.bodyFraction,w=h*record.width/record.height,dx=eye[0]-p[0],dz=eye[2]-p[2],length=Math.hypot(dx,dz)||1,offset=(record.center-.5)*w;
    const ratio=clamp(offset/length,-.999,.999),side=Math.sqrt(1-ratio*ratio),right=[dz/length*side-dx/length*ratio,-dx/length*side-dz/length*ratio];
    return {p:[p[0]-right[0]*offset,p[1]-(1-record.baseline)*h,p[2]-right[1]*offset],h,w,cols:1,rows:1,cell:0,textureName:record.textureName,plantKind:record.kind,junglePhotograph:true,t:tint||[1,1,1],motion:[0,0,0,1-record.baseline]};
  }
  function append(g,r,kind,p,height,seed,id,sceneryRange){
    const rs=renderers.get(r),record=rs&&rs.records.get(kind);if(!record)return false;const s=state(g,r),profile=PROFILES[quality(r)];
    if(s.pending.length>=profile.total||s.ids.has(id))return true;
    const distance=Math.hypot(p[0]-r.eye[0],p[2]-r.eye[2]),range=sceneryRange||((kind==='fern'||kind==='litter')?profile.range*.45:profile.range);
    if(distance>=range||distance<(kind==='litter'?0:kind==='fern'?1.15:['canopy','liana','bamboo'].includes(kind)?.2:2.0))return true;
    const fade=1-smooth(range*.82,range,distance);if(fade<=.015)return true;
    const variation=.88+hash(Math.floor(p[0]*10),Math.floor(p[2]*10),seed)*.15,tint=[variation*.99,variation,variation*.96];
    // Mirror complete photographs, never an atlas fragment. Mirroring also
    // mirrors the measured source root, so the trunk cannot slide off its
    // collision centre as the view turns.
    const flip=kind!=='litter'&&hash(Math.floor(p[0]*10),Math.floor(p[2]*10),seed+113)<.5;
    const sprite=anchor(flip?{...record,center:1-record.center}:record,p,height*fade,r.eye,tint);if(!sprite)return false;
    sprite.flip=flip;
    sprite.id=id;sprite.groundRoot=p.slice();s.pending.push(sprite);s.ids.add(id);s.counts[kind]=(s.counts[kind]||0)+1;return true;
  }
  function retain(rows,ids,row,cap){
    if(ids.has(row.id))return;
    const farther=(a,b)=>a.priority>b.priority||a.priority===b.priority&&a.id>b.id;
    if(rows.length>=cap){if(!farther(rows[0],row))return;ids.delete(rows[0].id);rows[0]=row;let i=0;for(;;){let child=i*2+1;if(child>=rows.length)break;if(child+1<rows.length&&farther(rows[child+1],rows[child]))child++;if(!farther(rows[child],rows[i]))break;[rows[i],rows[child]]=[rows[child],rows[i]];i=child;}}
    else{rows.push(row);let i=rows.length-1;while(i){const parent=(i-1)>>1;if(!farther(rows[i],rows[parent]))break;[rows[i],rows[parent]]=[rows[parent],rows[i]];i=parent;}}
    ids.add(row.id);
  }
  function queue(g,r,mesh,p,scale){
    if(!sceneryEligible(g)||!r||!point(r.eye)||!point(p)||!['tree','palm','bamboo','bush'].includes(mesh))return false;
    const rs=renderers.get(r);if(!rs||rs.status!=='ready')return false;
    const seed=Math.floor(p[0]*17.31+p[2]*41.73),kind=mesh==='tree'?'canopy':mesh==='palm'?'nipa':mesh==='bamboo'?'bamboo':'fern';
    if(!rs.records.has(kind))return false;const s=state(g,r),profile=PROFILES[quality(r)],distance=Math.hypot(p[0]-r.eye[0],p[2]-r.eye[2]),range=g.evade?profile.sceneryRange:profile.flightRange,distant=distance>=range;
    const size=.78+hash(seed,11,83)*.42,height=HEIGHTS[kind]*size*clamp(finite(scale&&scale[1],1),.45,2),horizon=g.evade?Math.min(3800,profile.horizon):profile.horizon;
    if(distant&&(kind==='fern'||distance>=horizon))return true;
    // Far silhouettes reserve their own small band. Prefer the largest
    // projected trees in the visible hemisphere rather than erasing every
    // plant beyond the detailed ring or spending the budget behind the view.
    if(distant&&r.matVP){const m=r.matVP,x=p[0],y=p[1]+height*.65,z=p[2],w=m[3]*x+m[7]*y+m[11]*z+m[15],cx=m[0]*x+m[4]*y+m[8]*z+m[12],cy=m[1]*x+m[5]*y+m[9]*z+m[13];if(w<=0||Math.abs(cx)>w*1.25||Math.abs(cy)>w*1.25)return true;}
    else if(distant&&r.matV){const dx=p[0]-r.eye[0],dy=p[1]+height*.65-r.eye[1],dz=p[2]-r.eye[2];if(-r.matV[2]*dx-r.matV[6]*dy-r.matV[10]*dz<0)return true;}
    const id=mesh+':'+p[0].toFixed(3)+':'+p[2].toFixed(3);
    // A fixed max-heap retains the nearest candidates even if authored
    // scenery arrives far-first. It avoids sorting thousands of world plants.
    let visible=true;
    if(!distant&&r.matVP){const m=r.matVP,x=p[0],y=p[1]+height*.55,z=p[2],w=m[3]*x+m[7]*y+m[11]*z+m[15],cx=m[0]*x+m[4]*y+m[8]*z+m[12],cy=m[1]*x+m[5]*y+m[9]*z+m[13],padding=height*Math.max(Math.hypot(m[0],m[8]),Math.hypot(m[1],m[9]),Math.abs(m[4]),Math.abs(m[5]));visible=w>0&&Math.abs(cx)<=w*1.12+padding&&Math.abs(cy)<=w*1.12+padding;}
    const projected=Math.hypot(distance,r.eye[1]-p[1])/height;
    const row={kind,p:p.slice(),height,seed,id,distance,range:distant?horizon:range,priority:distant?projected:r.matVP?projected+(visible?0:profile.horizon):distance,distant};
    retain(distant?s.distant:s.scenery,distant?s.distantIds:s.sceneryIds,row,distant?profile.farTotal*2:profile.total*2);
    return true;
  }
  function queueScenery(g,r){
    const s=state(g,r),rs=renderers.get(r),profile=PROFILES[quality(r)],ground=eligible(g),oldCanopy=ground?Math.floor(profile.canopy*.5):profile.flightTotal,cap=ground?profile.total-profile.understory-profile.floor-profile.soft-3:profile.flightTotal,far=Math.min(profile.farTotal,s.distant.length),sort=(a,b)=>a.priority-b.priority||a.id.localeCompare(b.id);
    const nearRows=s.scenery.slice().sort(sort),farRows=s.distant.slice().sort(sort),farCanopies=ground?Math.min(Math.floor(oldCanopy/3),farRows.slice(0,far).filter(c=>c.kind==='canopy').length):0,chosen=nearRows.slice(0,Math.max(0,cap-far)).concat(farRows.slice(0,far));
    for(const c of chosen){
      if(s.pending.length+s.crowns.length>=(c.distant?cap:cap-far))continue;if(ground&&['canopy','liana'].includes(c.kind)&&finite(s.counts.canopy)+finite(s.counts.liana)>=(c.distant?oldCanopy:oldCanopy-farCanopies))continue;
      let y=g.pow||g.evade?.camp?c.p[1]:s.anchors.get(c.id);if(y===undefined){if(s.queueSamples>=LIMITS.queueSamples)continue;s.queueSamples++;try{y=sample(s,c.p[0],c.p[2]);}catch(_){y=NaN;}s.anchors.set(c.id,y);while(s.anchors.size>LIMITS.cache*2)s.anchors.delete(s.anchors.keys().next().value);}
      if(Number.isFinite(y)&&y>=1.1){append(g,r,c.kind,[c.p[0],y,c.p[2]],c.height,c.seed,c.id,c.range);
        if(!g.evade&&rs.crown&&c.kind==='canopy'&&!c.distant&&s.crowns.length<profile.crowns&&s.pending.length+s.crowns.length<cap-far&&r.eye[1]-y>Math.hypot(c.p[0]-r.eye[0],c.p[2]-r.eye[2])*.70){
          const sprite=s.pending.find(p=>p.id===c.id);if(sprite){const height=sprite.h*rs.records.get('canopy').bodyFraction,top=y+height*.80,span=height*.68;s.crowns.push({id:'crown:'+c.id,p:[c.p[0],top,c.p[2]],yaw:hash(Math.floor(c.p[0]*10),Math.floor(c.p[2]*10),83)*Math.PI*2,length:span,width:span,record:rs.crown,floorAt:()=>top,floorKey:'crown:'+top.toFixed(3),groundLift:.012});}
        }
      }
    }
  }
  function sample(s,x,z){s.samples++;const h=terrain(x,z);return Number.isFinite(h)?h:NaN;}
  function makeCell(s,ix,iz){
    const out=[];
    for(let n=0;n<LIMITS.candidatesPerCell;n++){
      const x=(ix+hash(ix,iz,n*3+1)-.5)*LIMITS.cell,z=(iz+hash(ix,iz,n*3+2)-.5)*LIMITS.cell;let h,dx,dz;
      try{h=sample(s,x,z);dx=sample(s,x+.6,z)-h;dz=sample(s,x,z+.6)-h;}catch(_){continue;}
      if(![h,dx,dz].every(Number.isFinite)||h<1.1||Math.max(Math.abs(dx),Math.abs(dz))>.48)continue;
      let forest=true;try{forest=!jungle||jungle(x,z);}catch(_){forest=false;}
      if(!forest)continue;
      const pick=hash(ix,iz,n*3+3),kind=n===0?(pick<.28?'liana':'canopy'):n===1?(h<8&&pick<.35?'nipa':'bamboo'):'fern',size=['canopy','liana'].includes(kind)?.66+hash(ix,iz,n*3+4)*.64:.72+hash(ix,iz,n*3+4)*.68;
      out.push({kind,p:[x,h,z],height:HEIGHTS[kind]*size,seed:n,id:'understory:'+ix+':'+iz+':'+n,radius:['canopy','liana'].includes(kind)?.48*size:kind==='bamboo'?.34*size:0});
    }
    return out;
  }
  function plan(g,r,options={}){
    if(!eligible(g)||!r||!point(r.eye))return [];const s=state(g,r),profile=PROFILES[quality(r)],cx=Math.round(g.evade.p[0]/LIMITS.cell),cz=Math.round(g.evade.p[2]/LIMITS.cell),radius=Math.ceil(profile.range*.45/LIMITS.cell),cells=[];
    for(let z=-radius;z<=radius;z++)for(let x=-radius;x<=radius;x++)if(x*x+z*z<=(radius+.25)**2)cells.push([cx+x,cz+z,x*x+z*z]);cells.sort((a,b)=>a[2]-b[2]||a[0]-b[0]||a[1]-b[1]);
    const candidates=[];
    for(const [x,z]of cells){
      const id=x+':'+z;let rows=s.cells.get(id);
      if(!rows){if(s.updates>=LIMITS.cellUpdates)continue;s.updates++;rows=makeCell(s,x,z);s.cells.set(id,rows);while(s.cells.size>LIMITS.cache){const oldest=s.cells.keys().next().value;for(const row of s.cells.get(oldest))s.established.delete(row.id);s.cells.delete(oldest);}}
      for(const candidate of rows){const d=Math.hypot(candidate.p[0]-g.evade.p[0],candidate.p[2]-g.evade.p[2]);if(d>=profile.range*.45||d<(candidate.radius?s.established.has(candidate.id)?.2:2.5:candidate.kind==='litter'?0:1.4))continue;
        if(candidate.blocked===undefined){if(s.solidChecks>=LIMITS.solidChecks)continue;s.solidChecks++;try{candidate.blocked=!!(options.solid&&options.solid(candidate.p[0],candidate.p[2],candidate.kind==='nipa'?.6:.2));}catch(_){candidate.blocked=true;}}
        if(!candidate.blocked)candidates.push({...candidate,p:candidate.p.slice(),distance:d});}
    }
    candidates.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));return candidates.slice(0,profile.understory);
  }
  function fineLeaves(g,r,options={}){
    const s=state(g,r),profile=PROFILES[quality(r)],cx=Math.round(g.evade.p[0]/LIMITS.fineCell),cz=Math.round(g.evade.p[2]/LIMITS.fineCell),cells=[],out=[];
    for(let z=-2;z<=2;z++)for(let x=-2;x<=2;x++)if(x*x+z*z<=5)cells.push([cx+x,cz+z,x*x+z*z]);cells.sort((a,b)=>a[2]-b[2]||a[0]-b[0]||a[1]-b[1]);
    for(const [x,z]of cells){
      const id=x+':'+z;let rows=s.fine.get(id);
      if(!rows){
        if(s.fineUpdates>=LIMITS.fineUpdates)continue;s.fineUpdates++;rows=[];
        // One low fern and two independent leaf patches per small cell make
        // clustered cover rather than a row of identical tall trees. The same
        // eighteen terrain samples as before amortize over two cells/frame.
        for(let i=0;i<3;i++){
          const px=(x+(hash(x,z,i*3+701)-.5)*.92)*LIMITS.fineCell,pz=(z+(hash(x,z,i*3+702)-.5)*.92)*LIMITS.fineCell;let h,dx,dz,forest;
          try{h=sample(s,px,pz);dx=sample(s,px+.6,pz)-h;dz=sample(s,px,pz+.6)-h;forest=!jungle||jungle(px,pz);}catch(_){continue;}
          if(!forest||![h,dx,dz].every(Number.isFinite)||h<1.1||Math.max(Math.abs(dx),Math.abs(dz))>.48)continue;
          const kind=i===0?'fern':'litter',height=HEIGHTS[kind]*(i===0?.35+hash(x,z,i+703)*.4:1.15+hash(x,z,i+703)*.45);
          rows.push({id:(i===0?'floor-fern:':'floor-leaf:')+x+':'+z+':'+i,kind,p:[px,h,pz],height,seed:i});
        }
        s.fine.set(id,rows);while(s.fine.size>LIMITS.fineCache)s.fine.delete(s.fine.keys().next().value);
      }
      for(const row of rows){const d=Math.hypot(row.p[0]-g.evade.p[0],row.p[2]-g.evade.p[2]);if(d>11||row.kind==='fern'&&d<1.15)continue;if(row.blocked===undefined){if(s.solidChecks>=LIMITS.solidChecks)continue;s.solidChecks++;try{row.blocked=!!(options.solid&&options.solid(row.p[0],row.p[2],.1));}catch(_){row.blocked=true;}}if(!row.blocked)out.push({...row,p:row.p.slice(),distance:d});}
    }
    out.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));let leaves=0,ferns=0;
    return out.filter(row=>row.kind==='fern'?ferns++<profile.soft:leaves++<profile.floor);
  }
  function populate(g,r,options){
    if(!sceneryEligible(g)||!renderers.get(r)?.records.size)return [];queueScenery(g,r);if(!eligible(g))return [];
    // Weaver-ant nests belong on visible foliage rather than in empty air.
    // Reserve at most three existing soft-plant slots; collision stays owned
    // by the unchanged world and the colony's explicit contact area.
    const colonies=root.Wildlife&&root.Wildlife.view(g).colonies||[],s=state(g,r),profile=PROFILES[quality(r)];
    for(const [i,colony]of colonies.slice(0,3).entries())if(point(colony.p)&&Math.hypot(colony.p[0]-r.eye[0],colony.p[2]-r.eye[2])<54){
      if(s.pending.length>=profile.total){const removed=s.pending.pop();if(removed){s.ids.delete(removed.id);s.counts[removed.plantKind]--;}}
      append(g,r,'fern',colony.p,Math.max(.6,finite(colony.anchorHeight,1.3)*1.25),i,'nest-support:'+String(colony.id||i));
    }
    for(const leaf of fineLeaves(g,r,options))append(g,r,leaf.kind,leaf.p,leaf.height,leaf.seed,leaf.id);
    const candidates=plan(g,r,options);for(const c of candidates){
      if(c.radius&&['canopy','liana'].includes(c.kind)&&finite(s.counts.canopy)+finite(s.counts.liana)>=profile.canopy)continue;
      append(g,r,c.kind,c.p,c.height,c.seed,c.id);if(c.radius&&s.ids.has(c.id)){const sprite=s.pending.find(p=>p.id===c.id);sprite.localTrunk={id:c.id,kind:c.kind,p:c.p.slice(),x:c.p[0],z:c.p[2],radius:c.radius};s.established.add(c.id);}
    }return candidates;
  }
  function draw(g,r){
    const s=g&&games.get(g),rs=r&&renderers.get(r);if(!s||!rs||!sceneryEligible(g)||typeof r._drawSpriteBatch!=='function')return 0;
    const groups=new Map(),profile=PROFILES[quality(r)],surfaces=crownReady(r)?s.crowns.slice():[];s.wind=0;
    const ordered=s.pending.slice().sort((a,b)=>Math.hypot(a.p[0]-r.eye[0],a.p[2]-r.eye[2])-Math.hypot(b.p[0]-r.eye[0],b.p[2]-r.eye[2]));
    for(const sprite of ordered){
      if(sprite.plantKind==='litter'){
        const record=rs.records.get('litter'),length=sprite.h*record.bodyFraction*1.6,referenceWidth=(record.bounds[2]-record.bounds[0])/record.width;
        surfaces.push({id:sprite.id,p:sprite.groundRoot.slice(),yaw:hash(Math.floor(sprite.groundRoot[0]*10),Math.floor(sprite.groundRoot[2]*10),19)*Math.PI*2,length,width:length*record.bodyFraction/(referenceWidth*record.width/record.height),record:{...record,referenceWidth,bodyHeight:record.bodyFraction}});continue;
      }
      const wind=quality(r)>0&&s.wind<profile.wind&&sprite.plantKind!=='litter'&&Math.hypot(sprite.p[0]-r.eye[0],sprite.p[2]-r.eye[2])<54;if(wind)s.wind++;const key=sprite.textureName+':'+(wind?'wind':'still');let group=groups.get(key);if(!group){group={texture:sprite.textureName,wind,list:[]};groups.set(key,group);}group.list.push(sprite);}
    // The renderer resolves opaque plant interiors before soft, premultiplied
    // edges. Each source owns its mip chain, with no neighbouring atlas cell.
    if(surfaces.length&&root.WildlifeRender&&typeof root.WildlifeRender.drawSurfaces==='function')root.WildlifeRender.drawSurfaces(g,r,surfaces);
    for(const group of groups.values())r._drawSpriteBatch(group.texture,group.list,group.wind);
    s.obstacles=s.pending.filter(p=>p.localTrunk).map(p=>({...p.localTrunk,p:p.localTrunk.p.slice()}));
    return s.pending.length;
  }
  function currentObstacles(g){const s=g&&games.get(g),rs=s&&s.renderer&&renderers.get(s.renderer);return eligible(g)&&s&&rs&&rs.status==='ready'&&(!rs.current||rs.current())&&!(s.renderer.gl&&s.renderer.gl.isContextLost())&&s.world===g.world&&s.evade===g.evade&&s.revision===revision?s.obstacles:[];}
  function obstacles(g){return currentObstacles(g).map(v=>({...v,p:v.p.slice()}));}
  function blockedAt(g,x,z,radius=.28){if(!Number.isFinite(x)||!Number.isFinite(z))return false;radius=clamp(finite(radius,.28),0,2);for(const obstacle of currentObstacles(g))if(Math.abs(x-obstacle.x)<=radius+obstacle.radius&&Math.abs(z-obstacle.z)<=radius+obstacle.radius&&Math.hypot(x-obstacle.x,z-obstacle.z)<radius+obstacle.radius)return true;return false;}
  function shadowSprites(g,r){
    const s=g&&games.get(g);if(!s||!eligible(g)||!r||!point(r.eye))return [];
    return s.pending.filter(p=>p.plantKind!=='litter'&&Math.hypot(p.groundRoot[0]-r.eye[0],p.groundRoot[2]-r.eye[2])<60).sort((a,b)=>Math.hypot(a.groundRoot[0]-r.eye[0],a.groundRoot[2]-r.eye[2])-Math.hypot(b.groundRoot[0]-r.eye[0],b.groundRoot[2]-r.eye[2])).slice(0,quality(r)===0?12:32).map(p=>({p:p.groundRoot.slice(),photoName:'vegetation'}));
  }
  function floorMode(g){return eligible(g)?1:0;}
  function atmosphere(g,base){
    if(!eligible(g)||!base||!jungle)return base;let inside=false;try{inside=jungle(g.evade.p[0],g.evade.p[2]);}catch(_){}if(!inside)return base;
    return {...base,fogDens:Math.max(finite(base.fogDens),.00135+clamp(finite(base.wet),0,1)*.00055),fogHeight:Math.max(2200,finite(base.fogHeight))};
  }
  function inspect(g,r){const s=g&&games.get(g),rs=r&&renderers.get(r);return {eligible:eligible(g),sceneryEligible:sceneryEligible(g),sceneryCandidates:s?s.scenery.length:0,sceneryCandidateLimit:r?PROFILES[quality(r)].total*2:0,distantCandidates:s?s.distant.length:0,distantCandidateLimit:r?PROFILES[quality(r)].farTotal*2:0,crowns:s?s.crowns.map(c=>({id:c.id,p:c.p.slice(),length:c.length,width:c.width})):[],count:s?s.pending.length:0,obstacles:obstacles(g),counts:s?{...s.counts}:{},terrainSamples:s?s.samples:0,queueSamples:s?s.queueSamples:0,solidChecks:s?s.solidChecks:0,fineUpdates:s?s.fineUpdates:0,fineCache:s?s.fine.size:0,cellUpdates:s?s.updates:0,cache:s?s.cells.size:0,wind:s?s.wind:0,plants:s?s.pending.map(p=>({kind:p.plantKind,p:p.p.slice(),groundRoot:p.groundRoot.slice(),h:p.h,w:p.w,id:p.id,flip:!!p.flip})):[],status:rs?rs.status:'idle',bytes:rs?rs.bytes:0,budget:rs&&rs.touch?LIMITS.touchBytes:LIMITS.desktopBytes,expectedSources:rs?rs.expectedSources:KINDS.length,readySources:rs?rs.records.size+(floorTexture(r)?1:0)+(crownReady(r)?1:0):0,floor:rs?{status:rs.floorStatus,...(rs.floor||{}),ready:!!floorTexture(r)}:{status:'idle',ready:false},crown:rs?{status:rs.crownStatus,...(rs.crown?{...rs.crown,bounds:rs.crown.bounds.slice()}:{}),ready:crownReady(r)}:{status:'idle',ready:false},records:rs?[...rs.records.values()].map(v=>({...v,bounds:v.bounds.slice()})):[],failures:rs?rs.failures.map(v=>({...v})):[]};}
  function dispose(r){const rs=renderers.get(r);if(!rs)return false;for(const record of [...rs.records.values(),...(rs.floor?[rs.floor]:[]),...(rs.crown?[rs.crown]:[])]){const T=r.textures&&r.textures[record.textureName];if(T&&T.tex&&r.gl&&!r.gl.isContextLost())r.gl.deleteTexture(T.tex);if(r.textures)delete r.textures[record.textureName];}renderers.delete(r);return true;}
  root.JungleScenery=Object.freeze({configure,load,ready,floorTexture,beginFrame,queue,populate,plan,draw,obstacles,blockedAt,shadowSprites,floorMode,atmosphere,anchor,measure,habitat,inspect,dispose,kinds:KINDS,profiles:PROFILES,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);
