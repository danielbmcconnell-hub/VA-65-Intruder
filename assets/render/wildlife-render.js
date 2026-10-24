/* Wildlife photographs are complete isolated poses, never tiny atlas cells.
 * Mammals/raised snake displays use the world sprite pass; crawling animals
 * use terrain-conforming, yaw-oriented textured ground patches. */
(function(root){
 'use strict';
 const KINDS=Object.freeze(['boar','tiger','krait','cobra','pit-viper','scorpion','centipede','weaver-ants']);
 const LIMITS=Object.freeze({desktopGPU:24*1024*1024,touchGPU:14*1024*1024,desktopCPU:96*1024*1024,touchCPU:48*1024*1024,groundUpdates:8,groundSamples:40,groundCache:512,actors:16,antsPerColony:8,colonies:3,jobs:12,failures:16});
 const states=new WeakMap();let terrain=null,makeProgram=null,glsl='',revision=0;
 const finite=(n,f=0)=>Number.isFinite(n)?n:f,clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite),wrap=n=>((finite(n)%1)+1)%1;
 const clock=()=>root.performance&&typeof root.performance.now==='function'?root.performance.now():Date.now();
 const filename=n=>typeof n==='string'&&/^[a-z0-9_-]+\.(png|webp)$/.test(n);
 function configure(o){if(!o||typeof o.terrainH!=='function')return false;if(terrain!==o.terrainH){terrain=o.terrainH;revision++;}if(typeof o.program==='function')makeProgram=o.program;if(typeof o.glsl==='string')glsl=o.glsl;return true;}
 function mipBytes(w,h){let b=0;for(;;){b+=w*h*4;if(w===1&&h===1)return b;w=Math.max(1,Math.floor(w/2));h=Math.max(1,Math.floor(h/2));}}
 function median(values){const a=values.slice().sort((x,y)=>x-y);return a.length%2?a[a.length>>1]:(a[a.length/2-1]+a[a.length/2])*.5;}
 function validateManifest(m){
  if(!m||m.version!==1||!m.subjects||!m.nest||!filename(m.nest.file))throw Error('Wildlife manifest is incomplete');
  for(const kind of KINDS){const subject=m.subjects[kind];if(!subject||!['ground','billboard'].includes(subject.mode)||![subject.length,subject.width,subject.height].every(n=>Number.isFinite(n)&&n>0)||!subject.animations||!Object.keys(subject.animations).length)throw Error('Missing complete wildlife subject '+kind);
   const expected=kind==='boar'||kind==='tiger'?{walk:16,run:16}:['krait','cobra','pit-viper'].includes(kind)?{crawl:8,threat:4}:{crawl:8};for(const [clip,frames]of Object.entries(expected))if(subject.animations[clip]?.frames!==frames)throw Error('Missing complete wildlife cycle '+kind+':'+clip);
   for(const [name,c]of Object.entries(subject.animations)){
    if(!c||!Array.isArray(c.plates)||!c.plates.length||!c.plates.every(filename)||c.cols!==2||c.rows!==2||!Number.isInteger(c.frames)||c.frames!==c.plates.length*4||!Array.isArray(c.frameSize)||c.frameSize.length!==2||!c.frameSize.every(n=>Number.isInteger(n)&&n>=384&&n<=2048)||!Array.isArray(c.sourceRegions)||c.sourceRegions.length!==c.frames||!Array.isArray(c.bounds)||c.bounds.length!==c.frames||!Number.isFinite(c.bodyHeight)||c.bodyHeight<=0||c.bodyHeight>1||!Number.isFinite(c.baseline)||c.baseline<=0||c.baseline>1)throw Error('Invalid complete wildlife clip '+kind+':'+name);
    for(let i=0;i<c.frames;i++){const region=c.sourceRegions[i],b=c.bounds[i];if(!region||!Array.isArray(region.source)||region.source.length!==4||!region.source.every(Number.isInteger)||region.source[0]<0||region.source[1]<0||region.source[2]<=0||region.source[3]<=0||!Array.isArray(region.dest)||region.dest.length!==2||!region.dest.every(Number.isFinite)||region.dest[0]<0||region.dest[1]<0||(region.scale!==undefined&&(!Number.isFinite(region.scale)||region.scale<.5||region.scale>1.5))||region.dest[0]+region.source[2]*finite(region.scale,1)>c.frameSize[0]+1e-6||region.dest[1]+region.source[3]*finite(region.scale,1)>c.frameSize[1]+1e-6||!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[0]<0||b[1]<0||b[2]>c.frameSize[0]||b[3]>c.frameSize[1]||b[2]<=b[0]||b[3]<=b[1])throw Error('Incomplete wildlife source region '+kind+':'+name+':'+i);}
   }
  }
  const n=m.nest;if(![n.width,n.height].every(v=>Number.isInteger(v)&&v>=512)||!Array.isArray(n.bounds)||n.bounds.length!==4||!n.bounds.every(Number.isFinite)||!Number.isFinite(n.baseline)||!Number.isFinite(n.center)||!Number.isFinite(n.bodyHeight)||n.bodyHeight<=0)throw Error('Incomplete weaver-ant nest photograph');
  return m;
 }
 function subjectClip(subject,action){const a=subject.animations;if(action==='threat'&&a.threat)return ['threat',a.threat];if(action==='run'&&a.run)return ['run',a.run];if(action==='idle')return a.walk?['walk',a.walk]:a.crawl?['crawl',a.crawl]:Object.entries(a)[0];return a.walk?['walk',a.walk]:a.crawl?['crawl',a.crawl]:Object.entries(a)[0];}
 function frameAt(c,phase,action){
  phase=wrap(phase);if(c.frames===4&&action==='threat'){const ends=[.30,.525,.7125,1];return Math.max(0,ends.findIndex(v=>phase<v));}
  if(action==='run'){
   const contact=c.sourceRegions.map(r=>1-clamp((c.baseline-(r.dest[1]+r.source[3]*finite(r.scale,1))/c.frameSize[1])/.08,0,1)),mean=contact.reduce((s,n)=>s+n,0)/contact.length,spread=Math.max(...contact.map(n=>Math.abs(n-mean)));
   if(spread>1e-6){let end=0;for(let i=0;i<c.frames;i++){end+=(1+.12*(contact[i]-mean)/spread)/c.frames;if(phase<end||i===c.frames-1)return i;}}
  }
  return Math.min(c.frames-1,Math.floor(phase*c.frames));
 }
 function state(r){let s=states.get(r);if(!s){s={alive:true,status:'idle',touch:false,options:{},promise:null,manifest:null,records:new Map(),bases:new Map(),required:new Set(),initialized:new Set(),jobs:new Map(),plates:new Map(),plateJobs:new Map(),retries:new Map(),failures:[],optionalFailures:[],bytes:0,cpuBytes:0,use:0,pins:new Set(),ground:new Map(),groundWorld:null,groundRevision:-1,groundUpdates:0,groundSamples:0,groundDraws:0,billboardDraws:0,nestDraws:0,program:null,vao:null,buffer:null,lastDraw:[]};states.set(r,s);}return s;}
 function live(r,s){return s.alive&&states.get(r)===s&&(!s.options.current||s.options.current())&&!(r.gl&&r.gl.isContextLost());}
 function fail(s,key,error,required){const list=required?s.failures:s.optionalFailures;if(!list.some(row=>row.key===key)){list.push({key,message:String(error&&error.message||error)});if(list.length>LIMITS.failures)list.shift();}}
 function trimCPU(s,keep){const budget=s.touch?LIMITS.touchCPU:LIMITS.desktopCPU;for(const [key,p]of [...s.plates].sort((a,b)=>a[1].used-b[1].used)){if(s.cpuBytes<=budget)break;if(key===keep)continue;s.plates.delete(key);s.cpuBytes-=p.bytes;}}
 async function plate(r,s,file){
  const cached=s.plates.get(file);if(cached){cached.used=++s.use;return cached;}if(s.plateJobs.has(file))return s.plateJobs.get(file);
  const retry=s.retries.get(file);if(retry&&clock()<retry.after)return null;
  const task=(async()=>{try{
   const im=await new Promise((resolve,reject)=>{const image=new root.Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Wildlife image unavailable: '+file));image.src='assets/wildlife/hires/'+file;});if(!live(r,s))return null;
   const bytes=im.naturalWidth*im.naturalHeight*4;if(Math.max(im.naturalWidth,im.naturalHeight)<1024||Math.min(im.naturalWidth,im.naturalHeight)<512)throw Error('Wildlife source photograph below required resolution');
   const p={im,bytes,used:++s.use};s.plates.set(file,p);s.cpuBytes+=bytes;s.retries.delete(file);trimCPU(s,file);return p;
  }catch(error){const attempts=(s.retries.get(file)?.attempts||0)+1,delay=[1000,4000,15000,60000][Math.min(3,attempts-1)];s.retries.set(file,{attempts,after:clock()+delay});fail(s,file,error,false);return null;}finally{s.plateJobs.delete(file);}})();s.plateJobs.set(file,task);return task;
 }
 function evict(r,s,bytes){const budget=s.touch?LIMITS.touchGPU:LIMITS.desktopGPU;for(const record of [...s.records.values()].filter(v=>v.resident&&!s.required.has(v.key)&&!s.pins.has(v.key)).sort((a,b)=>a.used-b.used)){if(s.bytes+bytes<=budget)break;const T=r.textures&&r.textures[record.textureName];if(T&&T.tex&&r.gl&&!r.gl.isContextLost())r.gl.deleteTexture(T.tex);if(r.textures)delete r.textures[record.textureName];record.resident=false;s.bytes-=record.bytes;}return s.bytes+bytes<=budget;}
 function upload(r,s,key,kind,action,c,index,p,required){
  const region=c.sourceRegions[index],src=region.source,dest=region.dest,cameraScale=finite(region.scale,1),mode=c.mode||s.manifest.subjects[kind]?.mode||'billboard',base=required&&kind!=='nest';
  if(src[0]+src[2]>p.im.naturalWidth||src[1]+src[3]>p.im.naturalHeight)throw Error('Complete wildlife region exceeds its source photograph');
  // Thin centipede/ant legs lose their opaque interior at compact phone
  // sizes. Preserve the complete photographs without enlarging them in-world.
  const fineLegs=s.touch&&mode==='ground'&&(kind==='centipede'||kind==='weaver-ants');
  const edge=fineLegs?512:base&&mode==='ground'?(s.touch?288:384):mode==='ground'?(s.touch?384:512):(s.touch?576:768),scale=Math.min(1,edge/Math.max(...c.frameSize)),w=Math.max(1,Math.round(c.frameSize[0]*scale)),h=Math.max(1,Math.round(c.frameSize[1]*scale)),bytes=mipBytes(w,h);
  if(!evict(r,s,bytes))return null;
  const cv=root.document.createElement('canvas');cv.width=w;cv.height=h;const ctx=cv.getContext('2d');if(!ctx)throw Error('Wildlife decode canvas unavailable');ctx.imageSmoothingQuality='high';ctx.drawImage(p.im,...src,dest[0]*w/c.frameSize[0],dest[1]*h/c.frameSize[1],src[2]*cameraScale*w/c.frameSize[0],src[3]*cameraScale*h/c.frameSize[1]);
  if(!live(r,s)){cv.width=cv.height=1;return null;}
  const name='wildlife_'+key.replace(/:/g,'_'),gl=r.gl,before=gl&&typeof gl.getParameter==='function'?{active:gl.getParameter(gl.ACTIVE_TEXTURE),texture:gl.getParameter(gl.TEXTURE_BINDING_2D),flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiplied:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)}:null;let T;
  try{T=r.texFromCanvas(name,cv);if(!T||!T.tex)throw Error('Wildlife texture upload failed');if(gl){gl.bindTexture(gl.TEXTURE_2D,T.tex);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}}
  finally{if(before){gl.activeTexture(before.active);gl.bindTexture(gl.TEXTURE_2D,before.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,before.flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,before.premultiplied);}}
  const reg=c.registration&&c.registration[index]||{baseline:c.baseline,center:.5},record={key,kind,action,frame:index,textureName:name,resident:true,used:++s.use,bytes,gpuWidth:w,gpuHeight:h,width:c.frameSize[0],height:c.frameSize[1],bounds:c.bounds[index].slice(),baseline:reg.baseline,center:reg.center,bodyHeight:c.bodyHeight,facing:c.facing||'right',mode,referenceWidth:median(c.bounds.map(b=>b[2]-b[0]))/c.frameSize[0]};s.records.set(key,record);s.bytes+=bytes;cv.width=cv.height=1;return record;
 }
 async function ensure(r,s,kind,action,c,index,required=false){
  const key=kind+':'+action+':'+index,record=s.records.get(key);if(record&&record.resident&&r.textures&&r.textures[record.textureName]){record.used=++s.use;return record;}if(s.jobs.has(key))return s.jobs.get(key);if(s.jobs.size>=LIMITS.jobs&&!required)return null;
  const task=(async()=>{try{const file=c.plates[Math.floor(index/4)],p=await plate(r,s,file);if(!p||!live(r,s))return null;const result=upload(r,s,key,kind,action,c,index,p,required);if(result&&required){s.required.add(key);s.initialized.add(kind);s.bases.set(kind,key);}return result;}catch(error){fail(s,key,error,required);return null;}finally{s.jobs.delete(key);}})();s.jobs.set(key,task);return task;
 }
 function nestClip(n){return {plates:[n.file],frameSize:[n.width,n.height],sourceRegions:[{source:[0,0,n.width,n.height],dest:[0,0]}],bounds:[n.bounds],registration:[{baseline:n.baseline,center:n.center}],baseline:n.baseline,bodyHeight:n.bodyHeight,frames:1,mode:'billboard'};}
 const vertex=`layout(location=0) in vec3 aP;layout(location=1) in vec2 aUV;layout(location=2) in vec3 aNormal;uniform mat4 uVP;out vec2 vUV;out vec3 vW,vN;void main(){vUV=aUV;vW=aP;vN=aNormal;gl_Position=uVP*vec4(aP,1.0);}`;
 const fragment=`in vec2 vUV;in vec3 vW,vN;uniform sampler2D uTex;uniform float uAlphaPass,uPhotoExposure;uniform vec3 uCam;out vec4 o;void main(){vec4 t=texture(uTex,clamp(vUV,vec2(.0001),vec2(.9999)));if(t.a<=1.0/255.0)discard;if(uAlphaPass<.5?t.a<.98:t.a>=.98)discard;vec3 alb=pow(max(t.rgb/max(t.a,1.0/255.0),vec3(0.0)),vec3(2.2));vec3 n=normalize(vN);float vis=sunVis(vW+n*.025,n,max(dot(n,uSunDir),0.0));vec3 hemi=mix(uGround,uAmb*2.05,.66);vec3 shaded=alb*(hemi+uSunCol*(.30+.62*max(dot(n,uSunDir),0.0))*vis);float day=clamp(length(uSunCol)*.65,0.0,1.0);vec3 fill=mix(vec3(.035,.045,.060),vec3(.91),day);vec3 col=mix(alb*fill,shaded,.44)/max(1.0,uPhotoExposure);col+=alb*fireLight(vW,n);float alpha=uAlphaPass<.5?1.0:t.a;o=vec4(applyFog(col,vW,uCam)*alpha,alpha);}`;
 function groundProgram(r,s){
  if(s.program)return true;if(!r.gl||typeof r.gl.createShader!=='function')return true;if(!makeProgram||!glsl)throw Error('Wildlife ground renderer requires the shared lighting shader');
  const gl=r.gl,p=makeProgram(gl,vertex,glsl+fragment),vao=gl.createVertexArray(),buffer=gl.createBuffer();if(!vao||!buffer)throw Error('Wildlife ground GPU buffers unavailable');const oldVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING),oldBuffer=gl.getParameter(gl.ARRAY_BUFFER_BINDING);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);for(const [loc,size,offset]of [[0,3,0],[1,2,12],[2,3,20]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,32,offset);}gl.bindVertexArray(oldVAO);gl.bindBuffer(gl.ARRAY_BUFFER,oldBuffer);s.program=p;s.vao=vao;s.buffer=buffer;return true;
 }
 async function load(r,options={}){
  if(!r||typeof r.texFromCanvas!=='function')return null;const s=state(r);if(s.promise)return s.promise;s.options={...options};s.touch=!!options.touch;s.status='loading';
  s.promise=(async()=>{try{
   const response=await root.fetch(options.manifest||'assets/wildlife/hires/manifest.json');if(!response.ok)throw Error('Wildlife manifest HTTP '+response.status);const manifest=validateManifest(await response.json());if(!live(r,s))return inspect(r);s.manifest=manifest;groundProgram(r,s);
   for(const kind of KINDS){const [action,c]=subjectClip(manifest.subjects[kind],'idle');const record=await ensure(r,s,kind,action,c,0,true);if(!record)fail(s,kind,Error('Required wildlife photograph unavailable: '+kind),true);}
   const n=await ensure(r,s,'nest','idle',nestClip(manifest.nest),0,true);if(!n)fail(s,'nest',Error('Required weaver-ant nest photograph unavailable'),true);
   if(!live(r,s))return inspect(r);s.status=s.initialized.size===KINDS.length+1?'ready':'error';return inspect(r);
  }catch(error){if(live(r,s)){s.status='error';fail(s,'startup',error,true);}return inspect(r);}})();return s.promise;
 }
 function ready(r){return !!(r&&states.get(r)?.status==='ready');}
 function shape(record,a){
  const length=finite(a.length,1),width=finite(a.width,.1),h=finite(a.height,.1);return {length:length/Math.max(.1,record.referenceWidth),width:width/Math.max(.1,record.bodyHeight),lift:.012+Math.min(.04,h*.15)};
 }
 function groundPatch(r,s,a,record,id,world,budget=LIMITS.groundUpdates){
  if(!terrain||!point(a.p))return null;if(s.groundWorld!==world||s.groundRevision!==revision){s.ground.clear();s.groundWorld=world;s.groundRevision=revision;}
  const box=shape(record,a),yaw=finite(a.yaw),forward=[Math.sin(yaw),-Math.cos(yaw)],across=[Math.cos(yaw),Math.sin(yaw)],corners=[[0,0],[1,0],[1,1],[0,1]].map(uv=>{const x=(uv[0]-.5)*box.length,z=(uv[1]-.5)*box.width;return [a.p[0]+forward[0]*x+across[0]*z,a.p[2]+forward[1]*x+across[1]*z];});
  let patch=s.ground.get(id),reuse=patch&&Math.hypot(a.p[0]-patch.x,a.p[2]-patch.z)<.035&&Math.abs(Math.atan2(Math.sin(yaw-patch.yaw),Math.cos(yaw-patch.yaw)))<.08&&Math.abs(box.length-patch.length)<.01&&Math.abs(box.width-patch.width)<.01;
  if(!reuse){if(s.groundUpdates>=budget)return null;s.groundUpdates++;let heights;
   try{const sample=(x,z)=>{s.groundSamples++;return terrain(x,z);};heights=corners.map(p=>sample(...p));const center=sample(a.p[0],a.p[2]);if(!heights.every(Number.isFinite)||!Number.isFinite(center)||Math.max(...heights)-Math.min(...heights)>Math.max(.25,box.length*.9)||Math.abs(heights.reduce((sum,n)=>sum+n,0)/4-center)>.15)return null;patch={x:a.p[0],z:a.p[2],yaw,length:box.length,width:box.width,corners:corners.map(p=>p.slice()),heights,center};s.ground.delete(id);s.ground.set(id,patch);while(s.ground.size>LIMITS.groundCache)s.ground.delete(s.ground.keys().next().value);}catch(_){return null;}
  }
  const du=[patch.corners[1][0]-patch.corners[0][0],patch.corners[1][1]-patch.corners[0][1]],dv=[patch.corners[3][0]-patch.corners[0][0],patch.corners[3][1]-patch.corners[0][1]],det=du[0]*dv[1]-du[1]*dv[0],dhU=patch.heights[1]-patch.heights[0],dhV=patch.heights[3]-patch.heights[0],sx=det?(dhU*dv[1]-dhV*du[1])/det:0,sz=det?(du[0]*dhV-dv[0]*dhU)/det:0,nLength=Math.hypot(sx,1,sz),normal=[-sx/nLength,1/nLength,-sz/nLength];
  const vertices=corners.map((p,i)=>[p[0],reuse?patch.center+(p[0]-patch.x)*sx+(p[1]-patch.z)*sz+box.lift:patch.heights[i]+box.lift,p[1]]),data=[];for(const i of [0,1,2,0,2,3])data.push(...vertices[i],...[[0,0],[1,0],[1,1],[0,1]][i],...normal);
  return {id,vertices,normal,data:new Float32Array(data),groundLift:box.lift,sampled:!reuse,textureName:record.textureName};
 }
 function geometry(g,r,a,record,id='probe'){const s=state(r);return groundPatch(r,s,a,record,id,g&&g.world);}
 function billboard(record,a,eye,mode){
  const displayHeight=record.kind!=='nest'&&!['boar','tiger'].includes(record.kind)?Math.max(finite(a.height,.1),finite(a.width,.5)*record.bodyHeight/(Math.max(.1,record.referenceWidth)*record.width/record.height)):finite(a.height,1),h=displayHeight/record.bodyHeight,w=h*record.width/record.height,dx=eye[0]-a.p[0],dz=eye[2]-a.p[2],length=Math.hypot(dx,dz)||1,travel=(Math.sin(finite(a.yaw))*dz+Math.cos(finite(a.yaw))*dx)/length,flip=record.kind==='nest'?false:record.facing==='left'?travel>0:travel<0,center=flip?1-record.center:record.center,offset=(center-.5)*w;
  const ratio=clamp(offset/length,-.999,.999),side=Math.sqrt(1-ratio*ratio),right=[dz/length*side-dx/length*ratio,-dx/length*side-dz/length*ratio];
  return {p:[a.p[0]-right[0]*offset,a.p[1]-(1-record.baseline)*h,a.p[2]-right[1]*offset],h,w,cols:1,rows:1,cell:0,flip,textureName:record.textureName,wildlifeKind:record.kind,wildlifeFrame:record.frame,wildlifeClip:record.action,t:[1,1,1],motion:null};
 }
 function preserve(gl){const active=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0);return {active,texture:gl.getParameter(gl.TEXTURE_BINDING_2D),program:gl.getParameter(gl.CURRENT_PROGRAM),vao:gl.getParameter(gl.VERTEX_ARRAY_BINDING),buffer:gl.getParameter(gl.ARRAY_BUFFER_BINDING),blend:gl.isEnabled(gl.BLEND),depth:gl.isEnabled(gl.DEPTH_TEST),cull:gl.isEnabled(gl.CULL_FACE),mask:gl.getParameter(gl.DEPTH_WRITEMASK),func:gl.getParameter(gl.DEPTH_FUNC),srcRGB:gl.getParameter(gl.BLEND_SRC_RGB),dstRGB:gl.getParameter(gl.BLEND_DST_RGB),srcA:gl.getParameter(gl.BLEND_SRC_ALPHA),dstA:gl.getParameter(gl.BLEND_DST_ALPHA)};}
 function restore(gl,b){gl.bindVertexArray(b.vao);gl.bindBuffer(gl.ARRAY_BUFFER,b.buffer);gl.useProgram(b.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.activeTexture(b.active);for(const [key,on]of [[gl.BLEND,b.blend],[gl.DEPTH_TEST,b.depth],[gl.CULL_FACE,b.cull]])on?gl.enable(key):gl.disable(key);gl.depthMask(b.mask);gl.depthFunc(b.func);gl.blendFuncSeparate(b.srcRGB,b.dstRGB,b.srcA,b.dstA);}
 function drawGround(r,s,patches){
  if(!patches.length||!s.program)return 0;const gl=r.gl,before=preserve(gl),p=s.program,groups=new Map();let floats=0,calls=0;
  for(const patch of patches){let group=groups.get(patch.textureName);if(!group){group={name:patch.textureName,patches:[]};groups.set(patch.textureName,group);}group.patches.push(patch);floats+=patch.data.length;}
  const vertices=new Float32Array(floats);let offset=0;for(const group of groups.values()){group.first=offset/8;for(const patch of group.patches){vertices.set(patch.data,offset);offset+=patch.data.length;}group.count=offset/8-group.first;}
  try{gl.useProgram(p);r._atmosUniforms(p);gl.uniformMatrix4fv(p.u.uVP,false,r.matVP);gl.uniform3fv(p.u.uCam,r.eye);gl.uniform1f(p.u.uPhotoExposure,Math.max(1,finite(r.atm&&r.atm.exposure,1)));gl.uniform1i(p.u.uTex,0);gl.bindVertexArray(s.vao);gl.bindBuffer(gl.ARRAY_BUFFER,s.buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
   for(const pass of [0,1]){gl.uniform1f(p.u.uAlphaPass,pass);gl.depthMask(pass===0);if(pass===0)gl.disable(gl.BLEND);else{gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);}
    for(const group of groups.values()){const T=r.textures[group.name];if(!T)continue;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,T.tex);gl.drawArrays(gl.TRIANGLES,group.first,group.count);calls++;}
   }
   return calls;
  }finally{restore(gl,before);}
 }
 function drawSurfaces(g,r,items){
  if(!r||!g||!Array.isArray(items)||!terrain)return 0;const s=state(r);groundProgram(r,s);
  const surface=s.surfaces||(s.surfaces={ground:new Map(),groundWorld:null,groundRevision:-1,groundUpdates:0,groundSamples:0});surface.groundUpdates=surface.groundSamples=0;const patches=[];
  for(const item of items){if(!item||!point(item.p)||!item.record||!r.textures[item.record.textureName])continue;const a={p:item.p,yaw:finite(item.yaw),length:item.length,width:item.width,height:0},patch=groundPatch(r,surface,a,item.record,String(item.id),g.world,4);if(patch)patches.push(patch);}
  patches.sort((a,b)=>Math.hypot(b.vertices[0][0]-r.eye[0],b.vertices[0][2]-r.eye[2])-Math.hypot(a.vertices[0][0]-r.eye[0],a.vertices[0][2]-r.eye[2]));s.surfaceDrawCalls=drawGround(r,s,patches);s.surfaceDraws=patches.length;s.lastSurfaces=patches.map(p=>({id:p.id,vertices:p.vertices.map(v=>v.slice()),normal:p.normal.slice(),groundLift:p.groundLift,textureName:p.textureName}));return patches.length;
 }
 function draw(g,r,viewOverride){
  const s=r&&states.get(r);if(!s||s.status!=='ready'||!point(r.eye))return 0;const view=viewOverride||root.Wildlife&&root.Wildlife.view(g);s.groundUpdates=s.groundSamples=s.groundDraws=s.billboardDraws=s.nestDraws=0;s.lastDraw=[];if(!view||!view.active)return 0;
  s.pins=new Set(s.required);const patches=[],groups=new Map();
  const enqueue=(a,kind,index)=>{
   const subject=s.manifest.subjects[kind];if(!subject||!point(a.p))return;const distance=Math.hypot(a.p[0]-r.eye[0],a.p[2]-r.eye[2]),range=subject.mode==='ground'?(kind==='weaver-ants'?4:30):120;if(distance>range)return;
   const [action,c]=subjectClip(subject,a.clip||'idle'),phase=action==='threat'?wrap(view.clock*.65+finite(a.phase)):a.moving===false||a.clip==='idle'?0:wrap(a.phase),frame=frameAt(c,phase,action),key=kind+':'+action+':'+frame;
   let record=s.records.get(key);if(!record?.resident){ensure(r,s,kind,action,c,frame);record=s.records.get(s.bases.get(kind));}if(!record?.resident)return;
   record.used=++s.use;s.pins.add(record.key);const next=(frame+1)%c.frames;if(a.moving||action==='threat')ensure(r,s,kind,action,c,next);
   const mode=record.mode||subject.mode;let patch=null,quad=null,drawn=false;if(mode==='ground'){patch=groundPatch(r,s,a,record,String(a.id||kind+':'+index),g.world);if(patch){patches.push(patch);s.groundDraws++;drawn=true;}}
   else {const q=billboard(record,a,r.eye,mode);quad=q;drawn=true;let list=groups.get(record.textureName);if(!list){list=[];groups.set(record.textureName,list);}list.push(q);s.billboardDraws++;}
   s.lastDraw.push({id:String(a.id||kind+':'+index),kind,yaw:finite(a.yaw),requestedFrame:frame,frame:record.frame,clip:record.action,mode,textureName:record.textureName,fallback:record.key!==key,drawn,key:record.key,gpuWidth:record.gpuWidth,gpuHeight:record.gpuHeight,bounds:record.bounds.slice(),quad:quad?{p:quad.p.slice(),h:quad.h,w:quad.w,flip:quad.flip,cols:1,rows:1,cell:0}:null,patch:patch?{vertices:patch.vertices.map(v=>v.slice()),normal:patch.normal.slice(),groundLift:patch.groundLift}:null,p:a.p.slice()});
  };
  try{
   const animals=(view.animals||[]).slice().filter(a=>point(a.p)).sort((a,b)=>Math.hypot(a.p[0]-r.eye[0],a.p[2]-r.eye[2])-Math.hypot(b.p[0]-r.eye[0],b.p[2]-r.eye[2]));for(const [i,a]of animals.slice(0,LIMITS.actors).entries())enqueue(a,a.kind,i);
   for(const [i,n]of (view.colonies||[]).slice(0,LIMITS.colonies).entries()){
    if(!point(n.p)||Math.hypot(n.p[0]-r.eye[0],n.p[2]-r.eye[2])>60)continue;const record=s.records.get(s.bases.get('nest'));if(record?.resident){const a={p:[n.p[0],n.p[1]+finite(n.anchorHeight,1.3),n.p[2]],height:finite(n.height,.55),yaw:0},q=billboard(record,a,r.eye);let list=groups.get(record.textureName);if(!list){list=[];groups.set(record.textureName,list);}list.push(q);s.nestDraws++;s.pins.add(record.key);}
    if(Math.hypot(n.p[0]-r.eye[0],n.p[2]-r.eye[2])<4){const spec=s.manifest.subjects['weaver-ants'];for(let j=0;j<LIMITS.antsPerColony;j++){const radius=.12+(j%3)*.07,travel=finite(view.clock)*(.018+.032*clamp(finite(n.activity),0,1)),angle=j/LIMITS.antsPerColony*Math.PI*2+travel/radius,phase=wrap(travel/finite(spec.animations.crawl.stride,.025)+j/LIMITS.antsPerColony);enqueue({id:'ants:'+String(n.id||i)+':'+j,kind:'weaver-ants',p:[n.p[0]+Math.cos(angle)*radius,n.p[1],n.p[2]+Math.sin(angle)*radius],yaw:angle+Math.PI,length:spec.length,width:spec.width,height:spec.height,moving:true,phase,clip:'walk'},'weaver-ants',j);}}
   }
   patches.sort((a,b)=>Math.hypot(b.vertices[0][0]-r.eye[0],b.vertices[0][2]-r.eye[2])-Math.hypot(a.vertices[0][0]-r.eye[0],a.vertices[0][2]-r.eye[2]));s.groundDrawCalls=drawGround(r,s,patches);for(const [name,list]of groups)r.drawSprites(name,list);return s.groundDraws+s.billboardDraws+s.nestDraws;
  }catch(error){s.status='error';fail(s,'ground-renderer',error,true);return 0;}finally{s.pins=new Set(s.required);}
 }
 async function prepareFrame(r,kind,action,index){const s=r&&states.get(r),subject=s&&s.manifest&&s.manifest.subjects[kind],c=subject&&subject.animations[action];if(!s||!c||!Number.isInteger(index)||index<0||index>=c.frames)return null;await ensure(r,s,kind,action,c,index);return inspect(r);}
 async function prepareMotion(r,kind,action){const s=r&&states.get(r),subject=s&&s.manifest&&s.manifest.subjects[kind],c=subject&&subject.animations[action];if(!s||!c)return null;for(let i=0;i<c.frames;i++)await ensure(r,s,kind,action,c,i);return inspect(r);}
 function inspect(r){const s=r&&states.get(r);return s?{status:s.status,ready:s.status==='ready',requiredMissing:KINDS.concat('nest').filter(kind=>!s.initialized.has(kind)),failures:s.failures.map(v=>({...v})),optionalFailures:s.optionalFailures.map(v=>({...v})),bytes:s.bytes,budget:s.touch?LIMITS.touchGPU:LIMITS.desktopGPU,cpuBytes:s.cpuBytes,cpuBudget:s.touch?LIMITS.touchCPU:LIMITS.desktopCPU,plates:s.plates.size,pending:s.jobs.size,groundUpdates:s.groundUpdates,terrainSamples:s.groundSamples,groundDrawCalls:s.groundDrawCalls||0,surfaceDrawCalls:s.surfaceDrawCalls||0,surfaceDraws:s.surfaceDraws||0,surfaceTerrainSamples:s.surfaces?s.surfaces.groundSamples:0,surfaceCache:s.surfaces?s.surfaces.ground.size:0,lastSurfaces:s.lastSurfaces?s.lastSurfaces.map(v=>({...v,vertices:v.vertices.map(p=>p.slice()),normal:v.normal.slice()})):[],groundCache:s.ground.size,groundDraws:s.groundDraws,billboardDraws:s.billboardDraws,nestDraws:s.nestDraws,frames:[...s.records.values()].map(v=>({...v,bounds:v.bounds.slice()})),lastDraw:s.lastDraw.map(v=>({...v,p:v.p.slice()})),retries:[...s.retries.entries()].map(([file,v])=>({file,...v}))}:{status:'idle',ready:false,requiredMissing:KINDS.concat('nest'),failures:[],optionalFailures:[],bytes:0,budget:LIMITS.desktopGPU,cpuBytes:0,cpuBudget:LIMITS.desktopCPU,frames:[],lastDraw:[]};}
 function dispose(r){const s=r&&states.get(r);if(!s)return false;s.alive=false;for(const record of s.records.values()){const T=r.textures&&r.textures[record.textureName];if(T&&T.tex&&r.gl&&!r.gl.isContextLost())r.gl.deleteTexture(T.tex);if(r.textures)delete r.textures[record.textureName];}if(r.gl&&!r.gl.isContextLost()){if(s.program)r.gl.deleteProgram(s.program);if(s.vao)r.gl.deleteVertexArray(s.vao);if(s.buffer)r.gl.deleteBuffer(s.buffer);}s.plates.clear();s.jobs.clear();states.delete(r);return true;}
 function retry(r){const options=states.get(r)?.options||{};dispose(r);return load(r,options);}
 root.WildlifeRender=Object.freeze({configure,load,ready,draw,inspect,retry,dispose,validateManifest,frameAt,geometry,billboard,prepareFrame,prepareMotion,drawSurfaces,limits:LIMITS,kinds:KINDS});
})(typeof window!=='undefined'?window:globalThis);
