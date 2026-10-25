/* Display finish for readable photographic detail. Lighting and motion supply
 * the cinematic treatment; the default output adds no animated film noise. */
(function(root){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const palettes=Object.freeze({
    day:Object.freeze({top:'#2d3335',lip:'#171c1e',middle:'#101416',base:'#070a0b',console:'rgba(26,31,33,.96)',rim:'rgba(176,186,190,.50)',frameLight:'rgba(168,178,183,.42)',frameDim:'rgba(132,142,148,.26)'}),
    night:Object.freeze({top:'#301a1b',lip:'#201112',middle:'#150c0e',base:'#08090b',console:'rgba(28,15,18,.96)',rim:'rgba(171,96,83,.42)',frameLight:'rgba(157,93,81,.35)',frameDim:'rgba(113,73,69,.24)'})
  });
  function profile(night){
    const n=night===true?1:Number.isFinite(night)?clamp(night,0,1):0;
    return Object.freeze({night:n,bloom:.18+.20*n,grain:0,vignette:.10+.08*n});
  }
  function cockpit(night){return palettes[night?'night':'day'];}
  const glsl=`
vec3 clarityGrade(vec3 radiance,float night){
  vec3 x=max(radiance,vec3(0.0));
  vec3 c=clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);
  // A restrained neutral curve retains fine airframe/leaf/skin detail. The
  // scene's own lamps and sky supply colour, rather than a global blue cast.
  c=clamp((c-0.5)*mix(1.08,1.04,night)+0.5,0.0,1.0);
  float luminance=dot(c,vec3(0.2126,0.7152,0.0722));
  c+=vec3(0.004)*(1.0-smoothstep(0.0,0.15,luminance));
  luminance=dot(c,vec3(0.2126,0.7152,0.0722));
  return clamp(mix(vec3(luminance),c,mix(1.0,0.90,night)),0.0,1.0);
}
`;
  root.VisualClarity=Object.freeze({profile,cockpit,glsl});
})(typeof window!=='undefined'?window:globalThis);
