/* Complete botanical photographs, registered to the existing ground surface.
 * This is presentation only: procedural terrain, collisions, AI and flight are
 * never changed. Local understory is deterministic and independently bounded. */
(function(root){
  'use strict';
  const KINDS=Object.freeze(['canopy','bamboo','nipa','fern','liana','litter']);
  const HEIGHTS=Object.freeze({canopy:13.6,bamboo:7.4,nipa:4.3,fern:1.35,liana:10.8,litter:1.2});
  const PROFILES=Object.freeze([
    Object.freeze({total:112,canopy:34,understory:42,floor:14,soft:4,range:96,sceneryRange:480,flightTotal:112,flightRange:1020,farTotal:16,horizon:14000,crowns:28,structuralTrees:16,leafCards:256,structureRange:500,wind:0}),
    Object.freeze({total:176,canopy:52,understory:66,floor:24,soft:8,range:136,sceneryRange:760,flightTotal:176,flightRange:1530,farTotal:24,horizon:18000,crowns:44,structuralTrees:24,leafCards:512,structureRange:750,wind:20}),
    Object.freeze({total:240,canopy:72,understory:90,floor:36,soft:12,range:166,sceneryRange:1100,flightTotal:240,flightRange:1900,farTotal:32,horizon:22000,crowns:60,structuralTrees:32,leafCards:768,structureRange:1000,wind:32})
  ]);
  const LIMITS=Object.freeze({cell:18,cellUpdates:4,candidatesPerCell:3,fineCell:4.5,fineUpdates:2,fineCache:128,terrainSamples:72,queueSamples:18,solidChecks:36,cache:256,maxDesktopEdge:1024,maxTouchEdge:768,desktopBytes:24*1024*1024,touchBytes:14*1024*1024});
  const renderers=new WeakMap(),games=new WeakMap(),structures=new Map();let terrain=null,jungle=null,revision=0,makeProgram=null,graphicsGLSL='',MeshBuilder=null;
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
  const sceneryEligible=g=>!!(terrain&&g&&(point(g.evade?.p)||point(g.ac?.p)));
  function configure(o){if(!o||typeof o.terrainH!=='function')return false;if(terrain!==o.terrainH||jungle!==o.jungle){terrain=o.terrainH;jungle=typeof o.jungle==='function'?o.jungle:null;revision++;}if(typeof o.program==='function')makeProgram=o.program;if(typeof o.glsl==='string')graphicsGLSL=o.glsl;if(typeof o.MB==='function')MeshBuilder=o.MB;return true;}
  const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,n)=>a.map(v=>v*n),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>mul(a,1/(Math.hypot(...a)||1));
  function botanicalStructure(kind,variant=0){
    variant=Math.abs(variant|0)%3;const key=kind+':'+variant;if(structures.has(key))return structures.get(key);
    const branches=[],cards=[],height=kind==='palm'?11:kind==='bamboo'?7.4:kind==='bush'?2.1:13.6;
    const branch=(a,b,r0,r1)=>branches.push({a,b,r0,r1});
    const card=(p,u,v,n)=>cards.push({p,u,v,t:[.78+hash(variant,n,2)*.22,.84+hash(variant,n,3)*.16,.72+hash(variant,n,4)*.22]});
    if(kind==='palm'){
      const stem=[[0,0,0],[.22,3.7,.1],[.74,7.4,.28],[1.35,11,.5]];for(let i=0;i<3;i++)branch(stem[i],stem[i+1],.27-i*.035,.235-i*.035);
      for(let i=0;i<11;i++){const a=i*2.399+variant*.7,len=3.9+hash(i,variant,7)*1.5,d=[Math.cos(a),0,Math.sin(a)],side=[-d[2],.12,d[0]],u=[d[0]*len,-1.1-hash(i,variant,8)*1.2,d[2]*len],p=add(stem[3],add(mul(d,len*.43),[0,-.25-(i%3)*.22,0]));branch(stem[3],add(p,mul(u,.36)),.065,.015);card(p,u,mul(side,1.25+(i%3)*.14),i);}
    }else if(kind==='bamboo'){
      for(let i=0;i<5;i++){const a=i*2.399,b=[Math.cos(a)*.65,0,Math.sin(a)*.65],top=[b[0]+Math.cos(a)*.8,height*(.77+i*.05),b[2]+Math.sin(a)*.8];branch(b,top,.075,.035);for(let j=0;j<5;j++){const y=height*(.29+j*.135),p=[b[0]+Math.cos(a)*.5,y,b[2]+Math.sin(a)*.5],bAngle=a+j*.95;card(p,[Math.cos(bAngle)*2.8,.28,Math.sin(bAngle)*2.8],[-Math.sin(bAngle)*.9,(j%2?1:-1)*1.3,Math.cos(bAngle)*.9],i*5+j);}}
    }else{
      const bush=kind==='bush',h=height,root=[0,0,0],fork=[(variant-1)*.22,h*(bush?.2:variant===1?.21:.29),.12];branch(root,fork,bush?.09:.43,bush?.055:.30);
      const n=bush?6:10;
      for(let i=0;i<n;i++){
        const a=i*2.399+variant*.83,reach=(bush?1.15:variant===1?6.4:variant===2?5.7:4.9)*(.72+hash(i,variant,21)*.35),start=[fork[0]*(1-i/n),h*(bush?.2:.16+i*.051),fork[2]],endY=h*(bush?.55+hash(i,variant,22)*.4:.50+hash(i,variant,22)*.45),elbow=[Math.cos(a)*reach*.48,start[1]+(endY-start[1])*.69,Math.sin(a)*reach*.48],tip=[Math.cos(a)*reach,endY,Math.sin(a)*reach];
        branch(start,elbow,bush?.045:.20-i*.011,bush?.025:.12-i*.006);branch(elbow,tip,bush?.025:.12-i*.006,.018);
        for(let j=0;j<(bush?3:4);j++){const q=.38+j*.21,angle=a+(hash(i,j,variant+30)-.5)*1.8,span=(bush?1.1:2.8+hash(i,j,35)*1.4),p=[tip[0]*q,(q<.48?start[1]+(elbow[1]-start[1])*q/.48:elbow[1]+(endY-elbow[1])*(q-.48)/.52),tip[2]*q],u=[Math.cos(angle)*span,(hash(i,j,36)-.6)*.9,Math.sin(angle)*span],v=[-Math.sin(angle)*span*.45,span*(.46+hash(i,j,37)*.3)*(j===3||i<4&&j===0?-1:1),Math.cos(angle)*span*.45];if(!bush&&i<4&&j===0){const attachment=p.slice();p[1]-=1.1;branch(attachment,p,.035,.012);}card(p,u,v,i*4+j);}
      }
    }
    const result={kind,variant,height,branches,cards};structures.set(key,result);return result;
  }
  function branchMesh(m,b,color){
    const axis=norm(b.b.map((v,i)=>v-b.a[i])),u=norm(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),v=cross(axis,u),p=(base,r,a)=>add(base,add(mul(u,Math.cos(a)*r),mul(v,Math.sin(a)*r)));
    for(let i=0;i<6;i++){const a=i*Math.PI/3,z=(i+1)*Math.PI/3;m.quad(p(b.a,b.r0,a),p(b.a,b.r0,z),p(b.b,b.r1,z),p(b.b,b.r1,a),color);}
  }
  function buildFallback(kind,MB,colors={},variant=0){
    const shape=botanicalStructure(kind,variant),m=new MB(),bark=colors.bark||[.24,.16,.085],green=colors.canopyG||[.10,.22,.075];for(const b of shape.branches)branchMesh(m,b,bark);
    // Individual pointed blades leave real gaps, including in loading/error
    // frames. No spherical crown or opaque rectangular leaf card is built.
    for(const [n,c]of shape.cards.entries())for(let j=0;j<(kind==='palm'?12:7);j++){
      const q=(j-3)/7,p=add(c.p,mul(c.u,q)),long=norm(add(c.u,mul(c.v,(j%2?1:-1)*.8))),wide=norm(cross(long,[0,1,.2])),len=kind==='palm'?.75:.36+(j%3)*.10,w=kind==='palm'?.09:.15,a=add(p,mul(long,-len*.5)),b=add(p,mul(wide,w)),d=add(p,mul(long,len*.5)),e=add(p,mul(wide,-w)),col=green.map((x,i)=>x*c.t[i]*(.8+(n%4)*.09));m.tri(a,b,d,col);m.tri(a,d,e,col);m.tri(d,b,a,col);m.tri(e,d,a,col);
    }
    m.botanical={kind,branches:shape.branches.length,leafBlades:shape.cards.length*(kind==='palm'?12:7),sphericalCrowns:0};return m;
  }
  function leafProgram(r,s){
    if(s.leafProgram)return true;const gl=r.gl;if(!makeProgram||!graphicsGLSL||!gl||typeof gl.createShader!=='function')return false;
    const p=makeProgram(gl,`layout(location=0)in vec2 aQ;layout(location=1)in vec3 iP;layout(location=2)in vec3 iU;layout(location=3)in vec3 iV;layout(location=4)in vec3 iTint;uniform mat4 uVP;out vec2 vUV;out vec3 vW,vN,vTint;void main(){vW=iP+iU*aQ.x+iV*aQ.y;vN=normalize(cross(iU,iV));vTint=iTint;vUV=vec2(aQ.x+.5,.5-aQ.y);gl_Position=uVP*vec4(vW,1.0);}`,graphicsGLSL+`in vec2 vUV;in vec3 vW,vN,vTint;uniform sampler2D uTex;uniform vec3 uCam;uniform float uAlphaPass,uPhotoExposure;out vec4 o;void main(){vec4 t=texture(uTex,clamp(vUV,vec2(.0001),vec2(.9999)));if(t.a<=1.0/255.0)discard;if(uAlphaPass<.5?t.a<.98:t.a>=.98)discard;vec3 alb=pow(max(t.rgb/max(t.a,1.0/255.0),vec3(0)),vec3(2.2))*vTint;vec3 n=normalize(vN);float side=abs(dot(n,uSunDir)),vis=sunVis(vW+vec3(0,.08,0),vec3(0,1,0),.65),day=clamp(length(uSunCol)*.65,0.,1.);vec3 hemi=mix(uGround,uAmb*2.05,.70),light=hemi+uSunCol*(.25+.65*side)*vis;vec3 fill=mix(vec3(.035,.045,.055),vec3(.88),day);vec3 col=mix(alb*fill,alb*light,.50)/max(1.,uPhotoExposure);col+=alb*fireLight(vW,n);float a=uAlphaPass<.5?1.:t.a;o=vec4(applyFog(col,vW,uCam)*a,a);}`);
    const oldVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING),oldBuffer=gl.getParameter(gl.ARRAY_BUFFER_BINDING),vao=gl.createVertexArray(),quad=gl.createBuffer(),instances=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,.5,.5]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,instances);for(let i=1;i<=4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,48,(i-1)*12);gl.vertexAttribDivisor(i,1);}gl.bindVertexArray(oldVAO);gl.bindBuffer(gl.ARRAY_BUFFER,oldBuffer);s.leafProgram=p;s.leafVAO=vao;s.leafQuad=quad;s.leafInstances=instances;return true;
  }
  function barkProgram(r,s){
    if(s.barkProgram)return s.barkProgram;if(!makeProgram||!graphicsGLSL||!r.gl||typeof r.gl.createShader!=='function')return null;
    s.barkProgram=makeProgram(r.gl,`layout(location=0)in vec3 aP;layout(location=1)in vec3 aN;layout(location=3)in mat4 iM;layout(location=7)in vec4 iTint;uniform mat4 uVP;out vec3 vW,vN,vLocal,vTint;void main(){vec4 w=iM*vec4(aP,1.);vW=w.xyz;vN=normalize(mat3(iM)*aN);vLocal=aP;vTint=iTint.rgb;gl_Position=uVP*w;}`,graphicsGLSL+`in vec3 vW,vN,vLocal,vTint;uniform sampler2D uTex;uniform vec3 uCam;uniform float uPhotoExposure;out vec4 o;void main(){float around=atan(vLocal.z,vLocal.x);vec2 uv=vec2(.56640625+.0234375*fract(around*1.27324+sin(vLocal.y*1.3)*.11),.7721354+.03125*fract(vLocal.y*2.1+sin(around*5.)*.23));vec4 t=texture(uTex,uv);float photo=dot(t.rgb/max(t.a,1./255.),vec3(.299,.587,.114)),mottle=clamp((photo-.34)*.32,-.045,.045),grain=sin(around*17.+sin(vLocal.y*.7)*.5)*.035+sin(around*43.+vLocal.y*.3)*.018;vec3 rgb=vec3(.32,.25,.17)*(.95+mottle+grain),alb=pow(max(rgb,vec3(0)),vec3(2.2))*vTint,n=normalize(vN);float day=clamp(length(uSunCol)*.65,0.,1.),vis=sunVis(vW+n*.05,n,.65);vec3 hemi=mix(uGround,uAmb*2.05,.63),lit=alb*(hemi+uSunCol*(.25+.65*max(dot(n,uSunDir),0.))*vis),fill=mix(vec3(.035,.045,.055),vec3(.88),day),col=mix(alb*fill,lit,.52)/max(1.,uPhotoExposure);col+=alb*fireLight(vW,n);o=vec4(applyFog(col,vW,uCam),1.);}`);return s.barkProgram;
  }
  function structureFor(g,r,sprite,used,cardsUsed){
    const rs=renderers.get(r),q=quality(r),limit=PROFILES[q].structuralTrees,cardLimit=PROFILES[q].leafCards;if(!rs?.componentRequested||used>=limit)return null;
    const kind=sprite.sourceMesh==='palm'?'palm':['canopy','liana'].includes(sprite.plantKind)?'tree':sprite.plantKind==='bamboo'?'bamboo':null;if(!kind)return null;
    const component=rs.components.get(kind==='palm'?'palm':'broadleaf')||null;
    const distance=Math.hypot(sprite.groundRoot[0]-r.eye[0],sprite.groundRoot[1]-r.eye[1],sprite.groundRoot[2]-r.eye[2]),height=kind==='palm'?sprite.displayHeight||11:sprite.h*rs.records.get(sprite.plantKind).bodyFraction,pixels=finite(r.H,720)*height/Math.max(1,distance);
    if(distance>PROFILES[q].structureRange||pixels<12)return null;
    const seed=Math.floor(sprite.groundRoot[0]*17.31+sprite.groundRoot[2]*41.73),variant=Math.abs(seed)%3,shape=botanicalStructure(kind,variant),count=kind==='palm'?shape.cards.length:Math.min(shape.cards.length,pixels>65?32:pixels>25?16:8);if(cardsUsed+count>cardLimit)return null;
    return {id:sprite.id,kind,variant,shape,component,p:sprite.groundRoot.slice(),height,scale:height/shape.height,yaw:hash(seed,31,16)*Math.PI*2,cards:count};
  }
  function drawStructures(g,r,items){
    const rs=renderers.get(r);if(!rs||!items.length)return 0;const groups=new Map(),leaves=new Map();
    for(const item of items){const {shape,scale,yaw,p,component}=item,c=Math.cos(yaw),sn=Math.sin(yaw),turn=a=>[(a[0]*c+a[2]*sn)*scale,a[1]*scale,(-a[0]*sn+a[2]*c)*scale],name=(component?'jungle_branch_':'jungle_leaf_fallback_')+item.kind+item.variant;
      if(MeshBuilder&&typeof r.meshFromBuilder==='function'&&!r.meshes[name]){let m;if(!component)m=buildFallback(item.kind,MeshBuilder,{},item.variant);else{m=new MeshBuilder();for(const b of shape.branches)branchMesh(m,b,[.24,.16,.085]);}r.meshFromBuilder(name,m);}
      let batch=groups.get(name);if(!batch){batch=[];groups.set(name,batch);}batch.push(c*scale,0,-sn*scale,0,0,scale,0,0,sn*scale,0,c*scale,0,p[0],p[1],p[2],1,.94,.92,.88,0);
      if(!component)continue;let list=leaves.get(component.textureName);if(!list){list=[];leaves.set(component.textureName,list);}for(let i=0;i<item.cards;i++){const card=shape.cards[Math.floor(i*shape.cards.length/item.cards)],u=turn(card.u),v=mul(norm(turn(card.v)),Math.hypot(...u)/(component.sourceWidth/component.sourceHeight)),attachment=item.kind==='palm'?add(p,turn([1.35,11,.5])):add(p,turn(card.p)),center=add(attachment,add(mul(u,.5-component.root[0]),mul(v,component.root[1]-.5)));list.push(...center,...u,...v,...card.t);}
    }
    if(typeof r.drawMesh==='function'){
      const gl=r.gl,T=r.textures?.jungle_canopy,wood=T&&T.tex&&barkProgram(r,rs),original=r.pMesh,active=wood?gl.getParameter(gl.ACTIVE_TEXTURE):null;let oldTexture=null;if(wood){gl.activeTexture(gl.TEXTURE0);oldTexture=gl.getParameter(gl.TEXTURE_BINDING_2D);}
      try{for(const [name,data]of groups){if(wood&&name.startsWith('jungle_branch_')){r.pMesh=wood;gl.useProgram(wood);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,T.tex);gl.uniform1i(wood.u.uTex,0);gl.uniform3fv(wood.u.uCam,r.eye);gl.uniform1f(wood.u.uPhotoExposure,Math.max(1,finite(r.atm?.exposure,1)));}else r.pMesh=original;r.drawMesh(name,new Float32Array(data),data.length/20);}}
      finally{r.pMesh=original;if(wood){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,oldTexture);gl.activeTexture(active);}}
    }
    const gl=r.gl;if(!leaves.size||!leafProgram(r,rs))return 0;const active=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0);const before={program:gl.getParameter(gl.CURRENT_PROGRAM),vao:gl.getParameter(gl.VERTEX_ARRAY_BINDING),buffer:gl.getParameter(gl.ARRAY_BUFFER_BINDING),texture:gl.getParameter(gl.TEXTURE_BINDING_2D),depth:gl.isEnabled(gl.DEPTH_TEST),blend:gl.isEnabled(gl.BLEND),cull:gl.isEnabled(gl.CULL_FACE),mask:gl.getParameter(gl.DEPTH_WRITEMASK),func:gl.getParameter(gl.DEPTH_FUNC),src:gl.getParameter(gl.BLEND_SRC_RGB),dst:gl.getParameter(gl.BLEND_DST_RGB),srcA:gl.getParameter(gl.BLEND_SRC_ALPHA),dstA:gl.getParameter(gl.BLEND_DST_ALPHA)};let count=0;
    try{const pr=rs.leafProgram;gl.useProgram(pr);r._atmosUniforms(pr);gl.uniformMatrix4fv(pr.u.uVP,false,r.matVP);gl.uniform3fv(pr.u.uCam,r.eye);gl.uniform1i(pr.u.uTex,0);gl.uniform1f(pr.u.uPhotoExposure,Math.max(1,finite(r.atm?.exposure,1)));gl.bindVertexArray(rs.leafVAO);gl.bindBuffer(gl.ARRAY_BUFFER,rs.leafInstances);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
      for(const [name,data]of leaves){const T=r.textures[name];if(!T)continue;const n=data.length/12;count+=n;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,T.tex);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);for(const pass of [0,1]){gl.uniform1f(pr.u.uAlphaPass,pass);gl.depthMask(pass===0);if(pass===0)gl.disable(gl.BLEND);else{gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);}gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,n);}}
    }finally{gl.bindVertexArray(before.vao);gl.bindBuffer(gl.ARRAY_BUFFER,before.buffer);gl.useProgram(before.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,before.texture);gl.activeTexture(active);for(const [key,on]of [[gl.DEPTH_TEST,before.depth],[gl.BLEND,before.blend],[gl.CULL_FACE,before.cull]])on?gl.enable(key):gl.disable(key);gl.depthMask(before.mask);gl.depthFunc(before.func);gl.blendFuncSeparate(before.src,before.dst,before.srcA,before.dstA);}return count;
  }
  function renderer(r){let s=renderers.get(r);if(!s){s={status:'idle',records:new Map(),components:new Map(),floor:null,floorStatus:'idle',crown:null,crownStatus:'idle',expectedSources:KINDS.length,failures:[],bytes:0,promise:null,touch:false};renderers.set(r,s);}return s;}
  function state(g,r){let s=games.get(g);if(!s||s.world!==g.world||s.evade!==g.evade||s.revision!==revision){s={world:g.world,evade:g.evade,revision,cells:new Map(),fine:new Map(),anchors:new Map(),scenery:[],sceneryIds:new Set(),distant:[],distantIds:new Set(),crowns:[],established:new Set(),obstacles:[],pending:[],ids:new Set(),counts:{},samples:0,queueSamples:0,solidChecks:0,fineUpdates:0,updates:0,skipped:0,wind:0};games.set(g,s);}return s;}
  function measure(width,height,pixels,stemEdge=false){
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||!pixels||pixels.length!==width*height*4)throw Error('Invalid botanical RGBA source');
    let x0=width,y0=height,x1=0,y1=0,visible=0,soft=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const a=pixels[(y*width+x)*4+3];if(a>16){visible++;if(a<250)soft++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}}
    if(visible<100||x1<=x0||y1<=y0)throw Error('Empty botanical photograph');
    if((x0===0&&!stemEdge)||y0===0||x1===width||y1===height)throw Error('Botanical source touches its outer boundary');
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
        s.componentRequested=!!manifest.components;s.expectedSources=KINDS.length+(manifest.floor?1:0)+(manifest.crown?1:0)+Object.keys(manifest.components||{}).length;s.floorStatus=manifest.floor?'loading':'absent';s.crownStatus=manifest.crown?'loading':'absent';
        for(const kind of KINDS){
          const spec=manifest.plants[kind];if(!spec||typeof spec.file!=='string'||!/^[a-z0-9_-]+\.(png|webp)$/.test(spec.file))throw Error('Missing complete botanical source '+kind);
          try{
            const im=await new Promise((resolve,reject)=>{const image=new root.Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Botanical image failed: '+spec.file));image.src='assets/jungle/'+spec.file;});
            if(!current()||r.gl&&r.gl.isContextLost())return inspect(null,r);
            if(Math.max(im.naturalWidth,im.naturalHeight)<1024||Math.min(im.naturalWidth,im.naturalHeight)<512)throw Error('Botanical photograph resolution below requirement');
            const max=kind==='liana'?(s.touch?384:512):s.touch?LIMITS.maxTouchEdge:LIMITS.maxDesktopEdge,scale=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));
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
            const edge=s.touch?256:384,cv=root.document.createElement('canvas');cv.width=cv.height=edge;const ctx=cv.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Crown decode canvas unavailable');ctx.imageSmoothingQuality='high';ctx.drawImage(im,0,0,edge,edge);
            const measured=measure(edge,edge,ctx.getImageData(0,0,edge,edge).data),bytes=mipBytes(edge,edge),budget=s.touch?LIMITS.touchBytes:LIMITS.desktopBytes;if(s.bytes+bytes>budget)throw Error('Aerial crown exceeds the shared botanical texture budget');
            const name='jungle_crown',gl=r.gl,before=gl&&typeof gl.getParameter==='function'?{active:gl.getParameter(gl.ACTIVE_TEXTURE),texture:gl.getParameter(gl.TEXTURE_BINDING_2D),flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiplied:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)}:null;let T;
            try{T=r.texFromCanvas(name,cv);if(!T||!T.tex)throw Error('Crown GPU upload unavailable');if(gl){gl.bindTexture(gl.TEXTURE_2D,T.tex);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}}
            finally{if(before){gl.activeTexture(before.active);gl.bindTexture(gl.TEXTURE_2D,before.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,before.flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,before.premultiplied);}}
            s.crown={kind:'crown',textureName:name,file:spec.file,sourceWidth:im.naturalWidth,sourceHeight:im.naturalHeight,...measured,referenceWidth:(measured.bounds[2]-measured.bounds[0])/edge,bodyHeight:measured.bodyFraction,bytes};s.bytes+=bytes;s.crownStatus='ready';cv.width=cv.height=1;
          }catch(error){s.crownStatus='error';s.failures.push({kind:'crown',message:String(error&&error.message||error)});}
        }
        for(const [kind,spec]of Object.entries(manifest.components||{})){
          try{
            if(!['broadleaf','palm'].includes(kind)||!spec||typeof spec.file!=='string'||!/^[a-z0-9_-]+\.webp$/.test(spec.file)||!Array.isArray(spec.root)||spec.root.length!==2||!spec.root.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid registered leaf component '+kind);
            const im=await new Promise((resolve,reject)=>{const image=new root.Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Leaf component failed: '+spec.file));image.src='assets/jungle/'+spec.file;});if(!current()||r.gl&&r.gl.isContextLost())return inspect(null,r);
            if(im.naturalWidth!==spec.width||im.naturalHeight!==spec.height||Math.max(im.naturalWidth,im.naturalHeight)<1024)throw Error('Leaf component source dimensions differ');
            const edge=s.touch?spec.gpuTouch:spec.gpuHigh;if(!Number.isInteger(edge)||edge<256||edge>768)throw Error('Leaf component GPU edge is outside its budget');const scale=Math.min(1,edge/Math.max(im.naturalWidth,im.naturalHeight)),cv=root.document.createElement('canvas');cv.width=Math.round(im.naturalWidth*scale);cv.height=Math.round(im.naturalHeight*scale);const ctx=cv.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Leaf component decode canvas unavailable');ctx.imageSmoothingQuality='high';ctx.drawImage(im,0,0,cv.width,cv.height);
            const measured=measure(cv.width,cv.height,ctx.getImageData(0,0,cv.width,cv.height).data,kind==='broadleaf'),bytes=mipBytes(cv.width,cv.height),budget=s.touch?LIMITS.touchBytes:LIMITS.desktopBytes;if(s.bytes+bytes>budget)throw Error('Leaf component exceeds the shared botanical texture budget');
            const name='jungle_component_'+kind,gl=r.gl,before=gl&&typeof gl.getParameter==='function'?{active:gl.getParameter(gl.ACTIVE_TEXTURE),texture:gl.getParameter(gl.TEXTURE_BINDING_2D),flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiplied:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)}:null;let T;
            try{T=r.texFromCanvas(name,cv);if(!T||!T.tex)throw Error('Leaf component GPU upload unavailable');if(gl){gl.bindTexture(gl.TEXTURE_2D,T.tex);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}}finally{if(before){gl.activeTexture(before.active);gl.bindTexture(gl.TEXTURE_2D,before.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,before.flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,before.premultiplied);}}
            s.components.set(kind,{kind,textureName:name,file:spec.file,sourceWidth:im.naturalWidth,sourceHeight:im.naturalHeight,root:spec.root.slice(),bytes,...measured});s.bytes+=bytes;cv.width=cv.height=1;
          }catch(error){s.failures.push({kind:'component-'+kind,message:String(error&&error.message||error)});}
        }
        s.status=s.records.size?'ready':'error';return inspect(null,r);
      }catch(error){s.status='error';s.failures.push({kind:'manifest',message:String(error&&error.message||error)});return inspect(null,r);}
    })();return s.promise;
  }
  function ready(r){const s=r&&renderers.get(r);return !!(s&&s.status==='ready'&&s.records.size);}
  function crownReady(r){const s=r&&renderers.get(r),T=s&&s.crown&&r.textures&&r.textures[s.crown.textureName];return !!(s&&s.crownStatus==='ready'&&T&&T.tex&&(!s.current||s.current())&&!(r.gl&&r.gl.isContextLost()));}
  function floorTexture(r){const s=r&&renderers.get(r),record=s&&s.floor,T=record&&r.textures&&r.textures[record.textureName];if(!s||s.floorStatus!=='ready'||!T||!T.tex||s.current&&!s.current()||r.gl&&(r.gl.isContextLost()||typeof r.gl.isTexture==='function'&&!r.gl.isTexture(T.tex)))return null;return {...record,tex:T.tex,w:record.width,h:record.height,ready:true};}
  function beginFrame(g,r){if(!g||!r)return false;const s=state(g,r);s.renderer=r;s.pending.length=0;s.scenery.length=0;s.sceneryIds.clear();s.distant.length=0;s.distantIds.clear();s.crowns.length=0;s.structural=[];s.leafCards=s.photoCards=s.plannedLeafCards=0;s.ids.clear();s.counts={};s.samples=s.queueSamples=s.solidChecks=s.fineUpdates=s.updates=s.skipped=s.wind=0;return sceneryEligible(g);}
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
    const size=.78+hash(seed,11,83)*.42,height=(mesh==='palm'?11:HEIGHTS[kind])*size*clamp(finite(scale&&scale[1],1),.45,2),horizon=g.evade?Math.min(3800,profile.horizon):profile.horizon;
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
    const row={kind,mesh,p:p.slice(),height,seed,id,distance,range:distant?horizon:range,priority:distant?projected:r.matVP?projected+(visible?0:profile.horizon):distance,distant};
    retain(distant?s.distant:s.scenery,distant?s.distantIds:s.sceneryIds,row,distant?profile.farTotal*2:profile.total*2);
    return true;
  }
  function queueScenery(g,r){
    const s=state(g,r),rs=renderers.get(r),profile=PROFILES[quality(r)],ground=eligible(g),oldCanopy=ground?Math.floor(profile.canopy*.5):profile.flightTotal,cap=ground?profile.total-profile.understory-profile.floor-profile.soft-3:profile.flightTotal,far=Math.min(profile.farTotal,s.distant.length),sort=(a,b)=>a.priority-b.priority||a.id.localeCompare(b.id);
    const nearRows=s.scenery.slice().sort(sort),farRows=s.distant.slice().sort(sort),farCanopies=ground?Math.min(Math.floor(oldCanopy/3),farRows.slice(0,far).filter(c=>c.kind==='canopy').length):0,chosen=nearRows.slice(0,Math.max(0,cap-far)).concat(farRows.slice(0,far));
    for(const c of chosen){
      if(s.pending.length+s.crowns.length>=(c.distant?cap:cap-far))continue;if(ground&&['canopy','liana'].includes(c.kind)&&finite(s.counts.canopy)+finite(s.counts.liana)>=(c.distant?oldCanopy:oldCanopy-farCanopies))continue;
      let y=g.pow||g.evade?.camp?c.p[1]:s.anchors.get(c.id);if(y===undefined){if(s.queueSamples>=LIMITS.queueSamples)continue;s.queueSamples++;try{y=sample(s,c.p[0],c.p[2]);}catch(_){y=NaN;}s.anchors.set(c.id,y);while(s.anchors.size>LIMITS.cache*2)s.anchors.delete(s.anchors.keys().next().value);}
      if(Number.isFinite(y)&&y>=1.1){append(g,r,c.kind,[c.p[0],y,c.p[2]],c.height,c.seed,c.id,c.range);const submitted=s.pending.find(p=>p.id===c.id);if(submitted){submitted.sourceMesh=c.mesh;submitted.displayHeight=c.height;}
        if(!rs.componentRequested&&!g.evade&&rs.crown&&c.kind==='canopy'&&!c.distant&&s.crowns.length<profile.crowns&&s.pending.length+s.crowns.length<cap-far&&r.eye[1]-y>Math.hypot(c.p[0]-r.eye[0],c.p[2]-r.eye[2])*.70){
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
    const groups=new Map(),profile=PROFILES[quality(r)],surfaces=crownReady(r)?s.crowns.slice():[];s.wind=0;s.structural=[];s.leafCards=0;s.photoCards=0;let plannedCards=0;
    const ordered=s.pending.slice().sort((a,b)=>Math.hypot(a.p[0]-r.eye[0],a.p[2]-r.eye[2])-Math.hypot(b.p[0]-r.eye[0],b.p[2]-r.eye[2]));
    for(const sprite of ordered){
      if(sprite.plantKind==='litter'){
        const record=rs.records.get('litter'),length=sprite.h*record.bodyFraction*1.6,referenceWidth=(record.bounds[2]-record.bounds[0])/record.width;
        surfaces.push({id:sprite.id,p:sprite.groundRoot.slice(),yaw:hash(Math.floor(sprite.groundRoot[0]*10),Math.floor(sprite.groundRoot[2]*10),19)*Math.PI*2,length,width:length*record.bodyFraction/(referenceWidth*record.width/record.height),record:{...record,referenceWidth,bodyHeight:record.bodyFraction}});continue;
      }
      const structure=structureFor(g,r,sprite,s.structural.length,plannedCards);if(structure){s.structural.push(structure);plannedCards+=structure.cards;continue;}
      const wind=quality(r)>0&&s.wind<profile.wind&&sprite.plantKind!=='litter'&&Math.hypot(sprite.p[0]-r.eye[0],sprite.p[2]-r.eye[2])<54;if(wind)s.wind++;const key=sprite.textureName+':'+(wind?'wind':'still');let group=groups.get(key);if(!group){group={texture:sprite.textureName,wind,list:[]};groups.set(key,group);}group.list.push(sprite);}
    // The renderer resolves opaque plant interiors before soft, premultiplied
    // edges. Each source owns its mip chain, with no neighbouring atlas cell.
    if(surfaces.length&&root.WildlifeRender&&typeof root.WildlifeRender.drawSurfaces==='function')root.WildlifeRender.drawSurfaces(g,r,surfaces);
    for(const group of groups.values()){r._drawSpriteBatch(group.texture,group.list,group.wind);s.photoCards+=group.list.length;}
    s.leafCards=drawStructures(g,r,s.structural);s.plannedLeafCards=plannedCards;
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
  function inspect(g,r){const s=g&&games.get(g),rs=r&&renderers.get(r);return {eligible:eligible(g),sceneryEligible:sceneryEligible(g),sceneryCandidates:s?s.scenery.length:0,sceneryCandidateLimit:r?PROFILES[quality(r)].total*2:0,distantCandidates:s?s.distant.length:0,distantCandidateLimit:r?PROFILES[quality(r)].farTotal*2:0,structural:s?(s.structural||[]).map(v=>({id:v.id,kind:v.kind,variant:v.variant,p:v.p.slice(),height:v.height,branches:v.shape.branches.length,leafCards:v.cards,material:v.component?'photographic-components':'individual-leaf-geometry'})):[],primitiveCounts:{branchTrees:s?.structural?.length||0,branches:s?.structural?.reduce((n,v)=>n+v.shape.branches.length,0)||0,leafCards:s?.leafCards||0,plannedLeafCards:s?.plannedLeafCards||0,photoCards:s?.photoCards||0,roundCrownSurfaces:rs?.componentRequested?0:s?.crowns?.length||0},components:rs?[...rs.components.values()].map(v=>({...v,root:v.root.slice(),bounds:v.bounds.slice()})):[],crowns:s?s.crowns.map(c=>({id:c.id,p:c.p.slice(),length:c.length,width:c.width})):[],count:s?s.pending.length:0,obstacles:obstacles(g),counts:s?{...s.counts}:{},terrainSamples:s?s.samples:0,queueSamples:s?s.queueSamples:0,solidChecks:s?s.solidChecks:0,fineUpdates:s?s.fineUpdates:0,fineCache:s?s.fine.size:0,cellUpdates:s?s.updates:0,cache:s?s.cells.size:0,wind:s?s.wind:0,plants:s?s.pending.map(p=>({kind:p.plantKind,p:p.p.slice(),groundRoot:p.groundRoot.slice(),h:p.h,w:p.w,id:p.id,flip:!!p.flip})):[],status:rs?rs.status:'idle',bytes:rs?rs.bytes:0,budget:rs&&rs.touch?LIMITS.touchBytes:LIMITS.desktopBytes,expectedSources:rs?rs.expectedSources:KINDS.length,readySources:rs?rs.records.size+rs.components.size+(floorTexture(r)?1:0)+(crownReady(r)?1:0):0,floor:rs?{status:rs.floorStatus,...(rs.floor||{}),ready:!!floorTexture(r)}:{status:'idle',ready:false},crown:rs?{status:rs.crownStatus,...(rs.crown?{...rs.crown,bounds:rs.crown.bounds.slice()}:{}),ready:crownReady(r)}:{status:'idle',ready:false},records:rs?[...rs.records.values()].map(v=>({...v,bounds:v.bounds.slice()})):[],failures:rs?rs.failures.map(v=>({...v})):[]};}
  function dispose(r){const rs=renderers.get(r);if(!rs)return false;for(const record of [...rs.records.values(),...rs.components.values(),...(rs.floor?[rs.floor]:[]),...(rs.crown?[rs.crown]:[])]){const T=r.textures&&r.textures[record.textureName];if(T&&T.tex&&r.gl&&!r.gl.isContextLost())r.gl.deleteTexture(T.tex);if(r.textures)delete r.textures[record.textureName];}if(r.gl&&!r.gl.isContextLost()){if(rs.barkProgram)r.gl.deleteProgram(rs.barkProgram);if(rs.leafProgram)r.gl.deleteProgram(rs.leafProgram);if(rs.leafVAO)r.gl.deleteVertexArray(rs.leafVAO);if(rs.leafQuad)r.gl.deleteBuffer(rs.leafQuad);if(rs.leafInstances)r.gl.deleteBuffer(rs.leafInstances);}renderers.delete(r);return true;}
  root.JungleScenery=Object.freeze({configure,botanicalStructure,buildFallback,load,ready,floorTexture,beginFrame,queue,populate,plan,draw,obstacles,blockedAt,shadowSprites,floorMode,atmosphere,anchor,measure,habitat,inspect,dispose,kinds:KINDS,profiles:PROFILES,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);
