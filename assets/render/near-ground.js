/* Nearby terrain vertices use the unchanged CPU collision height field. A small
 * streamed texture corrects GPU noise precision differences, without changing
 * actor positions, aircraft physics, the clipmap topology or raised POW floors. */
(function(root){
 'use strict';
 const SIZE=33,CELL=8,SNAP=32,HALF=(SIZE-1)*CELL*.5,BUDGET=128,UNIT=8;
 const states=new WeakMap();let terrain=null,revision=0;
 const finite=Number.isFinite,point=p=>Array.isArray(p)&&[0,1,2].every(i=>finite(p[i]));
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
 const glsl=`
 uniform highp sampler2D uNearGround;
 uniform vec4 uNearPatch;
 uniform vec2 uNearCentre;
 float nearGroundHeight(vec2 w,float originalHeight){
   if(uNearPatch.w<0.5)return originalHeight;
   vec2 q=(w-uNearPatch.xy)/uNearPatch.z;
   if(any(lessThan(q,vec2(0.0)))||any(greaterThan(q,vec2(32.0))))return originalHeight;
   ivec2 i=ivec2(clamp(floor(q+vec2(0.0001)),vec2(0.0),vec2(32.0)));
   float corrected=texelFetch(uNearGround,i,0).r;
   float weight=1.0-smoothstep(64.0,112.0,length(w-uNearCentre));
   // Keep shoreline/water ownership with the original sea renderer.
   weight*=smoothstep(1.0,4.0,min(originalHeight,corrected));
   return mix(originalHeight,corrected,weight);
 }
 `;
 function configure(o){if(!o||typeof o.terrainH!=='function')return false;if(terrain!==o.terrainH){terrain=o.terrainH;revision++}return true}
 function state(r){let s=states.get(r);if(!s){s={world:null,revision:-1,complete:null,pending:null,texture:null,samples:0,totalSamples:0,uploads:0,active:false,centre:[0,0],failures:0};states.set(r,s)}return s}
 function eligible(g){return !!(g&&g.evade&&point(g.evade.p)&&!g.pow&&!g.evade.camp&&!g.evade.river&&!g.result&&terrain)}
 function start(x,z){const ox=Math.round(x/SNAP)*SNAP-HALF,oz=Math.round(z/SNAP)*SNAP-HALF;return {x:ox,z:oz,data:new Float32Array(SIZE*SIZE),next:0}}
 function upload(r,s,data){
  const gl=r&&r.gl;if(!gl||gl.isContextLost())return false;
  const active=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0+UNIT);
  const binding=gl.getParameter(gl.TEXTURE_BINDING_2D),keys=[gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,gl.UNPACK_ALIGNMENT,gl.UNPACK_ROW_LENGTH,gl.UNPACK_IMAGE_HEIGHT,gl.UNPACK_SKIP_PIXELS,gl.UNPACK_SKIP_ROWS,gl.UNPACK_SKIP_IMAGES],pixels=keys.map(k=>[k,gl.getParameter(k)]);
  let made=false;
  try{
   if(!s.texture||!gl.isTexture(s.texture)){s.texture=gl.createTexture();made=true;if(!s.texture)throw Error('Near terrain texture allocation failed')}
   gl.bindTexture(gl.TEXTURE_2D,s.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);for(const k of keys.slice(3))gl.pixelStorei(k,0);
   if(made){gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,SIZE,SIZE,0,gl.RED,gl.FLOAT,data||new Float32Array(SIZE*SIZE));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)}
   else if(data)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,SIZE,SIZE,gl.RED,gl.FLOAT,data);
   if(data)s.uploads++;return true;
  }catch(_){s.failures++;if(made&&s.texture)gl.deleteTexture(s.texture);s.texture=null;return false}
  finally{for(const [k,v]of pixels)gl.pixelStorei(k,v);gl.bindTexture(gl.TEXTURE_2D,binding);gl.activeTexture(active)}
 }
 function prepare(g,r){
  if(!r||typeof r!=='object')return false;const s=state(r);s.samples=0;
  if(s.world!==g?.world||s.revision!==revision){s.world=g?.world;s.revision=revision;s.complete=s.pending=null}
  s.active=eligible(g);if(!s.active){s.pending=null;return false}
  s.centre=[g.evade.p[0],g.evade.p[2]];
  const ox=Math.round(s.centre[0]/SNAP)*SNAP-HALF,oz=Math.round(s.centre[1]/SNAP)*SNAP-HALF,same=p=>p&&p.x===ox&&p.z===oz;
  if(!same(s.complete)&&!same(s.pending))s.pending=start(...s.centre);
  else if(same(s.complete))s.pending=null;
  const p=s.pending;
  if(p){
   try{for(let count=0;count<BUDGET&&p.next<p.data.length;count++,p.next++){
     const x=p.x+(p.next%SIZE)*CELL,z=p.z+Math.floor(p.next/SIZE)*CELL,y=terrain(x,z);s.samples++;s.totalSamples++;if(!finite(y))throw Error('Invalid near terrain sample');p.data[p.next]=y;
    }
    if(p.next===p.data.length&&upload(r,s,p.data)){s.complete=p;s.pending=null}
   }catch(_){s.failures++;s.pending=null;s.active=false}
  }
  if(s.complete&&(!s.texture||r.gl&&!r.gl.isContextLost()&&!r.gl.isTexture(s.texture)))upload(r,s,s.complete.data);
  return !!s.complete;
 }
 function bind(r,p){
  const gl=r&&r.gl;if(!gl||!p||!p.u||gl.isContextLost())return false;
  const s=state(r);if(!s.texture||!gl.isTexture(s.texture))upload(r,s,s.complete&&s.complete.data);
  const enabled=s.active&&s.complete&&s.texture,field=s.complete;
  if(p.u.uNearGround!=null)gl.uniform1i(p.u.uNearGround,UNIT);
  if(p.u.uNearPatch!=null)gl.uniform4f(p.u.uNearPatch,field?field.x:0,field?field.z:0,CELL,enabled?1:0);
  if(p.u.uNearCentre!=null)gl.uniform2f(p.u.uNearCentre,...s.centre);
  const active=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0+UNIT);gl.bindTexture(gl.TEXTURE_2D,s.texture);gl.activeTexture(active);return !!enabled;
 }
 function heightAt(r,x,z){
  const s=states.get(r),p=s&&s.complete;if(!s||!s.active||!p||!finite(x)||!finite(z))return null;
  const qx=(x-p.x)/CELL,qz=(z-p.z)/CELL;if(qx<0||qz<0||qx>SIZE-1||qz>SIZE-1)return null;
  const ix=Math.min(SIZE-2,Math.floor(qx)),iz=Math.min(SIZE-2,Math.floor(qz)),u=qx-ix,v=qz-iz,a=p.data[iz*SIZE+ix],b=p.data[iz*SIZE+ix+1],c=p.data[(iz+1)*SIZE+ix+1],d=p.data[(iz+1)*SIZE+ix];
  return u>=v?a+(b-a)*u+(c-b)*v:a+(c-d)*u+(d-a)*v;
 }
 function inspect(r){const s=states.get(r);return s?{active:s.active,complete:!!s.complete,pending:!!s.pending,samples:s.samples,totalSamples:s.totalSamples,uploads:s.uploads,failures:s.failures,bytes:s.texture?SIZE*SIZE*4:0,origin:s.complete?[s.complete.x,s.complete.z]:null,centre:s.centre.slice(),remaining:s.pending?s.pending.data.length-s.pending.next:0}:null}
 function dispose(r){const s=states.get(r);if(!s)return false;if(s.texture&&r.gl&&!r.gl.isContextLost())r.gl.deleteTexture(s.texture);states.delete(r);return true}
 root.NearGround=Object.freeze({glsl,configure,prepare,bind,inspect,dispose,heightAt,limits:Object.freeze({size:SIZE,cell:CELL,snap:SNAP,samplesPerPrepare:BUDGET,textureUnit:UNIT,bytes:SIZE*SIZE*4,fullRadius:64,outerRadius:112})});
})(typeof window!=='undefined'?window:globalThis);
