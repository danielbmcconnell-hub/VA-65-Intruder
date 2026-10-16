/* Supplied MiG-17PF artwork, adapted to the existing renderer's world/depth pass.
   These camera-relative cards are an artistic reconstruction, not 3D geometry.
   No flight, timers, scoring, collision or player controls live in this module. */
(function (root) {
  'use strict';
  const BASE='assets/willard/media/', HALF_TURN=Math.PI, TAU=Math.PI*2;
  const states=new WeakMap(); let mediaPromise;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const unit=a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  function axes(enemy) {
    const y=Number(enemy.yaw)||0,p=Number(enemy.pitch)||0,r=Number(enemy.roll)||0;
    const f=[Math.sin(y)*Math.cos(p),Math.sin(p),-Math.cos(y)*Math.cos(p)];
    let right0=unit(cross(f,[0,1,0]));if(Math.hypot(...right0)<.2)right0=[Math.cos(y),0,Math.sin(y)];
    const up0=cross(right0,f),c=Math.cos(r),s=Math.sin(r);
    return {f,right:right0.map((v,i)=>v*c-up0[i]*s),up:right0.map((v,i)=>v*s+up0[i]*c)};
  }
  function validateAtlas(a) {
    if(!a||a.format!=='Willard-Egress-SpriteAtlas-v1'||a.size.w!==4096||a.size.h!==3584||Object.keys(a.frames||{}).length!==54)
      throw new Error('Invalid Willard MiG atlas format/size/coverage');
    const cells=new Set();
    for(const [name,item] of Object.entries(a.frames)) {
      const f=item.frame,p=item.pivot;
      if(!f||![f.x,f.y,f.w,f.h,p&&p.x,p&&p.y].every(Number.isFinite)||f.w!==512||f.h!==512||
        f.x<0||f.y<0||f.x+f.w>a.size.w||f.y+f.h>a.size.h||p.x<0||p.x>1||p.y<0||p.y>1)
        throw new Error('Invalid Willard frame '+name);
      const key=f.x+','+f.y;if(cells.has(key))throw new Error('Overlapping Willard frame '+name);cells.add(key);
    }
    for(const name of ['front','rear','left_side','right_side','top','bottom'])if(!a.frames[name])throw new Error('Missing Willard aspect '+name);
    for(let h=0;h<16;h++)for(const bank of [-30,0,30]) {
      const name='flight_h'+String(h).padStart(2,'0')+'_b'+(bank<0?'-30':bank>0?'+30':'+00'),item=a.frames[name];
      if(!item||item.meta.headingDegrees!==h*22.5||item.meta.bankDegrees!==bank)throw new Error('Invalid directional metadata '+name);
    }
    return a;
  }
  function select(renderer,enemy) {
    const eye=renderer.eye||[0,0,0],p=enemy.p||[0,0,0],a=axes(enemy),delta=eye.map((v,i)=>v-p[i]),distance=Math.hypot(...delta);
    const toEye=unit(delta),right=renderer.camRight||[1,0,0],up=renderer.camUp||[0,1,0];
    const px=dot(a.f,right),py=dot(a.f,up),heading=Math.atan2(px,py),face=dot(a.f,toEye),elevation=Math.asin(clamp(dot(a.up,toEye),-1,1));
    let name,mode,sourceHeading=0,size;
    if(elevation>.49) {
      const h=((Math.round(heading/TAU*16)%16)+16)%16,bank=(Number(enemy.roll)||0)*180/Math.PI;
      const b=bank<-15?-30:bank>15?30:0;
      name='flight_h'+String(h).padStart(2,'0')+'_b'+(b<0?'-30':b>0?'+30':'+00');
      sourceHeading=h*TAU/16;mode='upper-directional';size=11.36*512/355;
    } else if(elevation<-.49) {name='bottom';mode='lower-reference';size=11.36*512/451;}
    else if(Math.abs(face)>.72) {name=face>0?'front':'rear';mode='end-reference';size=9.63*512/465;}
    else {name=px>=0?'right_side':'left_side';sourceHeading=px>=0?Math.PI/2:-Math.PI/2;mode='side-reference';size=11.36*512/468;}
    const angle=mode==='end-reference'?Math.atan2(dot(a.up,right),dot(a.up,up)):wrap(heading-sourceHeading);
    return {name,mode,size,angle,heading,sourceHeading,elevation,bank:Number(enemy.roll)||0,distance,
      noseScreen:[px,py],worldPosition:p.slice(),flip:false,limitedAspect:mode!=='upper-directional'};
  }
  function loadMedia() {
    if(!mediaPromise)mediaPromise=Promise.all([
      fetch(BASE+'MiG17PF_Willard_Egress_ATLAS.json').then(r=>{if(!r.ok)throw new Error('MiG atlas metadata HTTP '+r.status);return r.json();}).then(validateAtlas),
      new Promise((resolve,reject)=>{const image=new Image();image.decoding='async';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('MiG artwork failed to decode'));image.src=BASE+'MiG17PF_Willard_Egress_ATLAS.png';})
    ]).then(([atlas,image])=>{if(image.naturalWidth!==atlas.size.w||image.naturalHeight!==atlas.size.h)throw new Error('MiG atlas image dimensions mismatch');return {atlas,image};}).catch(e=>{mediaPromise=null;throw e;});
    return mediaPromise;
  }
  function shader(gl,type,source) {
    const s=gl.createShader(type);gl.shaderSource(s,'#version 300 es\nprecision highp float;\n'+source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error('MiG shader: '+error);}return s;
  }
  const vertex=`layout(location=0) in vec2 aQ;
    uniform mat4 uVP;uniform vec3 uP,uRight,uUp;uniform vec4 uFrameA,uFrameB;uniform vec2 uPivotA,uPivotB;
    uniform vec2 uSize,uAngle;uniform float uBlend;out vec2 vA,vB;out vec2 vQ;
    void main(){
      float size=mix(uSize.x,uSize.y,uBlend),angle=mix(uAngle.x,uAngle.y,uBlend);
      vec2 pivot=mix(uPivotA,uPivotB,uBlend),q=vec2(aQ.x-pivot.x,1.0-aQ.y-(1.0-pivot.y));
      vec2 spin=vec2(q.x*cos(angle)+q.y*sin(angle),-q.x*sin(angle)+q.y*cos(angle));
      gl_Position=uVP*vec4(uP+(uRight*spin.x+uUp*spin.y)*size,1.0);
      vA=uFrameA.xy+aQ*uFrameA.zw;vB=uFrameB.xy+aQ*uFrameB.zw;vQ=aQ;
    }`;
  const fragment=`in vec2 vA,vB,vQ;uniform sampler2D uAtlas;uniform float uBlend,uPass,uLight,uFog;uniform vec3 uHaze;out vec4 color;
    void main(){
      vec4 a=texture(uAtlas,vA),b=texture(uAtlas,vB);
      // Texture upload premultiplies before bilinear filtering; no dark transparent fringes.
      vec4 c=mix(a,b,uBlend);
      if(c.a<.018)discard;
      if(uPass<.5){if(c.a<.97)discard;}else{if(c.a>=.97)discard;}
      vec3 rgb=c.rgb/max(c.a,.001);rgb=mix(rgb*uLight,uHaze,uFog);
      color=vec4(rgb*c.a,c.a);
    }`;
  function allocate(renderer,media) {
    const gl=renderer.gl;if(gl.isContextLost())throw new Error('MiG graphics context unavailable');
    const p=gl.createProgram(),v=shader(gl,gl.VERTEX_SHADER,vertex),f=shader(gl,gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const error=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw new Error('MiG program: '+error);}
    const vao=gl.createVertexArray(),buffer=gl.createBuffer(),texture=gl.createTexture();
    const prevVao=gl.getParameter(gl.VERTEX_ARRAY_BINDING),prevBuf=gl.getParameter(gl.ARRAY_BUFFER_BINDING),active=gl.getParameter(gl.ACTIVE_TEXTURE);
    gl.activeTexture(gl.TEXTURE0);const prevTex=gl.getParameter(gl.TEXTURE_BINDING_2D),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premult=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,0,1,1,0,1,1]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,media.image);
    // Original cells have transparent gutters. No mipmaps means no adjacent-frame bleed.
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premult);
    gl.bindTexture(gl.TEXTURE_2D,prevTex);gl.activeTexture(active);gl.bindVertexArray(prevVao);gl.bindBuffer(gl.ARRAY_BUFFER,prevBuf);
    const uniforms={};for(const n of ['uVP','uP','uRight','uUp','uFrameA','uFrameB','uPivotA','uPivotB','uSize','uAngle','uBlend','uAtlas','uPass','uLight','uFog','uHaze'])uniforms[n]=gl.getUniformLocation(p,n);
    return {status:'ready',gl,program:p,vao,buffer,texture,u:uniforms,atlas:media.atlas,last:null,draws:0,uploads:1,enemy:null,selection:null,from:null,blend:1};
  }
  function load(renderer) {
    if(!renderer||!renderer.gl)return Promise.reject(new Error('MiG renderer missing'));
    const old=states.get(renderer);
    if(old&&old.status==='ready'&&old.gl===renderer.gl&&renderer.gl.isTexture(old.texture))return Promise.resolve(inspect(renderer));
    if(old&&old.status==='loading')return old.promise;
    const pending={status:'loading',error:null};states.set(renderer,pending);
    pending.promise=loadMedia().then(media=>{if(states.get(renderer)!==pending)return inspect(renderer);const state=allocate(renderer,media);states.set(renderer,state);return inspect(renderer);}).catch(e=>{if(states.get(renderer)===pending)states.set(renderer,{status:'error',error:e.message});throw e;});
    return pending.promise;
  }
  function frameUV(atlas,name) {
    const item=atlas.frames[name],f=item.frame;
    // Half-texel inset samples only this exact supplied frame, with no mirroring.
    return {uv:[(f.x+.5)/atlas.size.w,(f.y+.5)/atlas.size.h,(f.w-1)/atlas.size.w,(f.h-1)/atlas.size.h],pivot:[item.pivot.x,item.pivot.y]};
  }
  function projected(renderer,enemy,selection) {
    const m=renderer.matVP,p=enemy.p,w=m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];
    const x=m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],y=m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],z=m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14];
    return {ndc:[x/w,y/w,z/w],clipW:w,widthPixels:Math.abs(renderer.matP&&renderer.matP[0]||1)*selection.size/Math.max(.001,w)*(renderer.W||1)/2};
  }
  function draw(renderer,enemy,options) {
    options=typeof options==='number'?{dt:options}:options||{};
    if(!renderer||!renderer.gl||renderer.gl.isContextLost()||!enemy||enemy.alive===false||!Array.isArray(enemy.p)||!enemy.p.every(Number.isFinite))return false;
    let s=states.get(renderer);
    if(s&&s.status==='error')return false; // explicit load() may retry; never issue requests every frame
    if(!s||s.status!=='ready'||s.gl!==renderer.gl||!renderer.gl.isTexture(s.texture)){if(!s||s.status!=='loading')load(renderer).catch(()=>{});return false;}
    const choice=select(renderer,enemy),projection=projected(renderer,enemy,choice);
    if(projection.clipW<=0||projection.ndc[2]<-1||projection.ndc[2]>1||Math.abs(projection.ndc[0])>1.2||Math.abs(projection.ndc[1])>1.2){s.last={...choice,...projection,visible:false};return false;}
    if(s.enemy!==enemy){s.enemy=enemy;s.selection=choice;s.from=choice;s.blend=1;}
    if(s.selection.name!==choice.name){s.from=s.selection;s.selection=choice;s.blend=0;}
    s.selection=choice;s.blend=clamp(s.blend+clamp(Number(options.dt)||1/60,0,.1)/.14,0,1);
    const previous=s.blend<1?s.from:choice,fa=frameUV(s.atlas,previous.name),fb=frameUV(s.atlas,choice.name);
    // Unwrap before interpolation: crossing north cannot spin the card a full turn.
    const priorAngle=choice.angle+wrap(previous.angle-choice.angle),blend=s.blend*s.blend*(3-2*s.blend);
    const gl=s.gl,u=s.u;
    gl.useProgram(s.program);gl.bindVertexArray(s.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,s.texture);
    gl.uniformMatrix4fv(u.uVP,false,renderer.matVP);gl.uniform3fv(u.uP,enemy.p);gl.uniform3fv(u.uRight,renderer.camRight);gl.uniform3fv(u.uUp,renderer.camUp);
    gl.uniform4fv(u.uFrameA,fa.uv);gl.uniform4fv(u.uFrameB,fb.uv);gl.uniform2fv(u.uPivotA,fa.pivot);gl.uniform2fv(u.uPivotB,fb.pivot);
    gl.uniform2f(u.uSize,previous.size,choice.size);gl.uniform2f(u.uAngle,priorAngle,choice.angle);gl.uniform1f(u.uBlend,blend);gl.uniform1i(u.uAtlas,0);
    const atm=renderer.atm||{},night=!!atm.night,light=Number.isFinite(options.light)?options.light:(night?.46:1.05),fog=1-Math.exp(-choice.distance*(Number(atm.fogDens)||.000016)*.6);
    gl.uniform1f(u.uLight,clamp(light,.12,2.5));gl.uniform1f(u.uFog,clamp(fog,0,.92));gl.uniform3fv(u.uHaze,atm.horizon||[.035,.05,.075]);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(true);
    gl.uniform1f(u.uPass,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.uniform1f(u.uPass,1);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    // Same canonical state contract as Renderer.drawSprites/drawParticles.
    gl.disable(gl.BLEND);gl.depthMask(true);gl.enable(gl.CULL_FACE);gl.bindVertexArray(null);
    s.draws+=2;s.last={...choice,...projection,visible:true,blend,previousFrame:previous.name,frames:[previous.name,choice.name],alphaDepthPass:true,worldMetres:true};
    return true;
  }
  function inspect(renderer) {
    const s=states.get(renderer);if(!s)return {status:'unloaded',draws:0};
    return {status:s.status,error:s.error||null,draws:s.draws||0,uploads:s.uploads||0,atlasFrames:s.atlas?Object.keys(s.atlas.frames).length:0,
      atlasSize:s.atlas?[s.atlas.size.w,s.atlas.size.h]:null,last:s.last?JSON.parse(JSON.stringify(s.last)):null};
  }
  function dispose(renderer) {
    const s=states.get(renderer);states.delete(renderer);
    if(s&&s.status==='ready'&&!s.gl.isContextLost()){s.gl.deleteTexture(s.texture);s.gl.deleteBuffer(s.buffer);s.gl.deleteVertexArray(s.vao);s.gl.deleteProgram(s.program);}
  }
  root.WillardSprites=Object.freeze({load,draw,inspect,dispose,select,axes,validateAtlas,frameUV,
    limitations:'Supplied AI-rendered artwork; approximate 2D bank frames and limited orthographic side/end/bottom aspects, not a physically exact 3D aircraft model.'});
})(typeof window!=='undefined'?window:globalThis);
