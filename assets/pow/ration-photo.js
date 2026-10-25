/* Whole, unretouched full/empty ration photographs on the existing tray
 * footprint. This is a horizontal photographic surface, not a volumetric model. */
(function(root){
  'use strict';
  const states=new WeakMap(),meshes=new WeakSet(),NAMES=['ration_photo_full','ration_photo_empty'];
  const LIMITS=Object.freeze({high:[1024,683],touch:[768,512],highBytes:8*1024*1024,touchBytes:4*1024*1024,unit:11});
  let context=null;
  const goodPoint=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
  function configure(c){if(!c||typeof c.MB!=='function')return false;context=c;return true;}
  function photographic(name){return name==='rationPhotoFull'||name==='rationPhotoEmpty';}
  function mipBytes(w,h){let n=0;for(;;){n+=w*h*4;if(w===1&&h===1)return n;w=Math.max(1,w>>1);h=Math.max(1,h>>1);}}
  function valid(r,s){return !!(r&&r.gl&&states.get(r)===s&&!r.gl.isContextLost()&&(!s.current||s.current()));}
  function release(r,s){for(const q of s.records){if(q.tex)r.gl.deleteTexture(q.tex);if(r.textures?.[q.name]?.tex===q.tex)delete r.textures[q.name];}s.records=[];s.bytes=0;}
  function upload(r,name,im,size){
    const gl=r.gl,cv=root.document.createElement('canvas');cv.width=size[0];cv.height=size[1];
    const c=cv.getContext('2d',{willReadFrequently:true});if(!c)throw Error('Ration photograph canvas unavailable');
    c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(im,0,0,im.naturalWidth,im.naturalHeight,0,0,cv.width,cv.height);
    const active=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0);
    const binding=gl.getParameter(gl.TEXTURE_BINDING_2D),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premult=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);let tex;
    try{
      tex=gl.createTexture();if(!tex)throw Error('Ration photograph GPU allocation failed');gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      const ext=gl.getExtension('EXT_texture_filter_anisotropic');if(ext)gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Ration photograph GPU upload failed: '+error);
      r.textures=r.textures||{};r.textures[name]={tex,w:cv.width,h:cv.height,premultiplied:false};
      return {name,tex,width:cv.width,height:cv.height,sourceWidth:im.naturalWidth,sourceHeight:im.naturalHeight,bytes:mipBytes(cv.width,cv.height),wholeImage:true,premultiplied:false};
    }catch(e){if(tex)gl.deleteTexture(tex);if(r.textures?.[name]?.tex===tex)delete r.textures[name];throw e;}
    finally{gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premult);gl.bindTexture(gl.TEXTURE_2D,binding);gl.activeTexture(active);cv.width=cv.height=1;}
  }
  function image(url){return new Promise((resolve,reject)=>{const im=new root.Image();im.decoding='async';im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Ration photograph failed to load: '+url));im.src=url;});}
  function load(r,options={}){
    if(!r?.gl)return Promise.resolve(null);const old=states.get(r);if(old)return old.promise;
    const touch=!!options.touch,size=touch?LIMITS.touch:LIMITS.high,s={status:'loading',touch,records:[],bytes:0,budget:touch?LIMITS.touchBytes:LIMITS.highBytes,failures:[],current:options.current};states.set(r,s);
    s.promise=(async()=>{const images=[];try{
      const response=await root.fetch('assets/prison/manifest.json');if(!response.ok)throw Error('Ration manifest HTTP '+response.status);const m=await response.json(),full=m.ration||{},empty=full.empty||m.rationEmpty||{file:'ration-empty.webp',width:full.width,height:full.height};
      for(const [i,def]of [full,empty].entries()){
        if(typeof def.file!=='string'||!/^[a-z0-9_-]+\.webp$/.test(def.file))throw Error('Invalid complete ration photograph filename');
        const im=await image('assets/prison/'+def.file);images.push(im);if(!valid(r,s)){release(r,s);s.status='retired';return inspect(r);}
        if(!Number.isFinite(im.naturalWidth)||im.naturalWidth<1000||im.naturalHeight<600||(def.width&&im.naturalWidth!==def.width)||(def.height&&im.naturalHeight!==def.height))throw Error('Ration photograph dimensions differ from complete source');
        if(s.bytes+mipBytes(...size)>s.budget)throw Error('Ration photograph GPU budget exceeded');const q=upload(r,NAMES[i],im,size);s.records.push(q);s.bytes+=q.bytes;
      }s.status='ready';return inspect(r);
    }catch(e){release(r,s);s.status='error';s.failures.push(String(e?.message||e));return inspect(r);}
    finally{for(const im of images)im.src='';}})();return s.promise;
  }
  function ensureMeshes(r){if(!context||!r||meshes.has(r))return;for(const name of ['rationPhotoFull','rationPhotoEmpty']){const b=new context.MB();b.quad([-.5,0,-.5],[-.5,0,.5],[.5,0,.5],[.5,0,-.5],[1,1,1]);r.meshFromBuilder(name,b);}meshes.add(r);}
  function prepare(game){if(!context||!game?.rend||!game.pow||!['solitary','regular'].includes(game.pow.stage))return false;ensureMeshes(game.rend);const app=game.app,r=game.rend;load(r,{touch:typeof root.matchMedia==='function'&&root.matchMedia('(pointer: coarse)').matches,current:()=>!app||app.rend===r});return true;}
  function decorate(game,item,empty){
    if(!item||!['tray','regular:tray'].includes(item.id)||!goodPoint(item.p)||!goodPoint(item.scale)||!prepare(game))return item;
    const s=states.get(game.rend);if(!s||s.status!=='ready'||!valid(game.rend,s)||s.records.length!==2)return item;
    const width=Math.abs(item.scale[0]);if(!(width>0))return item;
    return {...item,m:empty?'rationPhotoEmpty':'rationPhotoFull',p:[item.p[0],item.p[1]+Math.abs(item.scale[1])*.5+.002,item.p[2]],scale:[width,1,width/1.5]};
  }
  function bind(r,p,name){const gl=r?.gl;if(!gl||!p?.u)return;const s=states.get(r),index=name==='rationPhotoEmpty'?1:0,on=photographic(name)&&s?.status==='ready'&&valid(r,s)&&s.records.length===2;
    gl.uniform1f(p.u.uRationPhotoOn,on?1:0);gl.uniform1i(p.u.uRationPhoto,LIMITS.unit);gl.activeTexture(gl.TEXTURE0+LIMITS.unit);gl.bindTexture(gl.TEXTURE_2D,on?s.records[index].tex:r.textures?.wear?.tex||null);gl.activeTexture(gl.TEXTURE0);
  }
  function inspect(r){const s=r&&states.get(r);return s?{status:s.status,bytes:s.bytes,budget:s.budget,ready:s.records.length,expected:2,touch:s.touch,records:s.records.map(({tex,...q})=>({...q})),failures:s.failures.slice()}:{status:'idle',bytes:0,budget:0,ready:0,expected:2,records:[],failures:[]};}
  function dispose(r){const s=r&&states.get(r);if(!s)return false;s.current=()=>false;release(r,s);s.status='retired';states.delete(r);return true;}
  const glsl=`
uniform float uRationPhotoOn;
uniform sampler2D uRationPhoto;
vec3 rationSurface(vec3 original,vec3 local){
  if(uRationPhotoOn<0.5)return original;
  vec4 photo=texture(uRationPhoto,local.xz+vec2(0.5));
  if(photo.a<0.45)discard;
  return pow(max(photo.rgb,vec3(0.0)),vec3(2.2));
}`;
  root.RationPhoto=Object.freeze({configure,prepare,decorate,bind,photographic,inspect,dispose,load,glsl,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);
