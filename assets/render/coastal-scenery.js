/* Rendering-only coastline ownership, clipmap seams and band-limited water.
 * The original CPU terrain, waves, collision and ejection remain authoritative. */
(function(root){
 'use strict';
 const smooth=(a,b,x)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u);};
 const bands=[[.055,0,1.7,.30],[0,.047,-1.3,.26],[.6,.42,3.1,.10],[.021,-.033,.8,.75]];
 function clipmapLayer(eye,n,cell,level){
  if(!Array.isArray(eye)||![eye[0],eye[2],n,cell,level].every(Number.isFinite)||n<=0||cell<=0||!Number.isInteger(level)||level<0)throw new RangeError('Invalid scenery clipmap');
  return {origin:[Math.round(eye[0]/(cell*2))*cell*2,Math.round(eye[2]/(cell*2))*cell*2],half:n*cell,innerOrigin:[Math.round(eye[0]/cell)*cell,Math.round(eye[2]/cell)*cell],innerHalf:level>0?n*cell*.5:0};
 }
 function waveSample(x,z,time,wave=1,footprint=0){
  if(![x,z,time,wave,footprint].every(Number.isFinite))return {height:0,gradient:[0,0]};
  let height=0,dx=0,dz=0;
  for(const [kx,kz,speed,amplitude]of bands){
   const weight=1-smooth(Math.PI*.6,Math.PI*1.2,Math.max(0,footprint)*Math.hypot(kx,kz));
   const phase=x*kx+z*kz+time*speed,a=amplitude*wave*weight;
   height+=Math.sin(phase)*a;dx+=Math.cos(phase)*a*kx;dz+=Math.cos(phase)*a*kz;
  }
  return {height,gradient:[dx,dz]};
 }
 const clipmapGLSL=`
 uniform vec2 uFinerOrigin; uniform float uFinerHalf;
 bool sceneryCoveredByFiner(vec2 w){return uFinerHalf>0.0&&max(abs(w.x-uFinerOrigin.x),abs(w.y-uFinerOrigin.y))<uFinerHalf;}
 `;
 const shorelineGLSL=`
 // These shortcuts preserve the original terrain's ocean/land decision.
 // Fully inland terrain has a guaranteed +.2m floor. Only the coastal
 // transition needs the complete height function; deep sea uses its shelf.
 float sceneryShoreHeight(vec2 w){
   float inland=(-w.x+coastAt(w.y))/1000.0;
   if(inland>=.85)return .2;
   if(smoothstep(-.05,.85,inland)<=.0005)return -14.0-46.0*smoothstep(0.0,2.6,-inland);
   return terrainH(w);
 }
 `;
 const wavesGLSL=`
 float sceneryWaveBand(vec2 k,float footprint){return 1.0-smoothstep(1.88495559,3.76991118,max(footprint,0.0)*length(k));}
 float sceneryWaveHeight(vec2 w,float t,float wave,float footprint){
   return wave*(sin(w.x*.055+t*1.7)*.30*sceneryWaveBand(vec2(.055,0),footprint)
    +sin(w.y*.047-t*1.3)*.26*sceneryWaveBand(vec2(0,.047),footprint)
    +sin(dot(w,vec2(.6,.42))+t*3.1)*.10*sceneryWaveBand(vec2(.6,.42),footprint)
    +sin(dot(w,vec2(.021,-.033))+t*.8)*.75*sceneryWaveBand(vec2(.021,-.033),footprint));
 }
 vec2 sceneryWaveGradient(vec2 w,float t,float wave,float footprint){
   return wave*(cos(w.x*.055+t*1.7)*.30*vec2(.055,0)*sceneryWaveBand(vec2(.055,0),footprint)
    +cos(w.y*.047-t*1.3)*.26*vec2(0,.047)*sceneryWaveBand(vec2(0,.047),footprint)
    +cos(dot(w,vec2(.6,.42))+t*3.1)*.10*vec2(.6,.42)*sceneryWaveBand(vec2(.6,.42),footprint)
    +cos(dot(w,vec2(.021,-.033))+t*.8)*.75*vec2(.021,-.033)*sceneryWaveBand(vec2(.021,-.033),footprint));
 }
 `;
 const glintGLSL=`
 // Broaden unresolved highlights and preserve their energy, instead of
 // alternating between a white pixel and darkness as the camera descends.
 float sceneryGlint(vec3 n,vec3 h,float exponent,float footprint,float roughness){
   float variance=pow(max(footprint,0.0)*roughness,2.0);
   float filtered=exponent/(1.0+exponent*variance);
   return pow(max(dot(n,h),0.0),max(filtered,1.0))*filtered/exponent;
 }
 `;
 root.CoastalScenery=Object.freeze({clipmapLayer,waveSample,clipmapGLSL,shorelineGLSL,wavesGLSL,glintGLSL});
})(typeof window!=='undefined'?window:globalThis);
