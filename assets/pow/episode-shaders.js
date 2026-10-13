/* Additive shader helpers for the fictional on-foot escape episode.
   The inactive branch preserves the original flight rendering. */
(function (root) {
  'use strict';
  root.EpisodeGLSL = `
uniform float uEpisodeOn, uEpisodeTime, uEpisodeMaterial;
uniform vec3 uEpisodeAmbient, uEpisodeFogColor;
uniform vec2 uEpisodeFog;
uniform vec4 uEpisodeLight[4], uEpisodeColor[4], uEpisodeCone[4];
uniform vec3 uEpisodeBlockMin[8], uEpisodeBlockMax[8];
uniform int uEpisodeCount, uEpisodeBlockCount;
uniform vec4 uEpisodeWater;
float episodeOcclusion(vec3 p, vec3 lamp, vec3 normal) {
  vec3 start = p + normal * 0.055, ray = lamp - start;
  vec3 inv = 1.0 / (ray + vec3(0.00001));
  for (int j=0;j<8;j++) {
    if (j>=uEpisodeBlockCount) break;
    vec3 a=(uEpisodeBlockMin[j]-start)*inv, b=(uEpisodeBlockMax[j]-start)*inv;
    vec3 lo=min(a,b), hi=max(a,b);
    float near=max(max(lo.x,lo.y),lo.z), far=min(min(hi.x,hi.y),hi.z);
    if (near<=far && far>0.015 && near<0.965) return 0.0;
  }
  return 1.0;
}
vec3 episodeLight(vec3 p, vec3 normal) {
  vec3 result=vec3(0.0);
  for (int i=0;i<4;i++) {
    if (i>=uEpisodeCount) break;
    vec3 d=uEpisodeLight[i].xyz-p;
    float distance=length(d), radius=max(uEpisodeColor[i].a,0.1);
    float fall=pow(max(0.0,1.0-distance/radius),2.0);
    if (fall<0.002) continue;
    float cone=1.0;
    if (uEpisodeCone[i].a>-0.5) {
      float alignment=dot(normalize(-d),normalize(uEpisodeCone[i].xyz));
      cone=smoothstep(uEpisodeCone[i].a,min(0.999,uEpisodeCone[i].a+0.055),alignment);
    }
    if(cone<0.001)continue;
    float diffuse=0.18+0.82*max(dot(normal,normalize(d)),0.0);
    result+=uEpisodeColor[i].rgb*uEpisodeLight[i].a*fall*diffuse*cone*episodeOcclusion(p,uEpisodeLight[i].xyz,normal);
  }
  return result;
}
vec3 episodeFog(vec3 color, vec3 p, vec3 camera) {
  float distance=length(p-camera);
  float haze=clamp(1.0-exp(-distance*max(uEpisodeFog.x,0.0)),0.0,0.86);
  float low=exp(-max(p.y-uEpisodeFog.y,0.0)*0.32);
  return mix(color,uEpisodeFogColor,haze*(0.55+0.45*low));
}
vec3 episodeWater(vec3 p,vec3 camera,vec3 normal) {
  float t=uEpisodeTime, current=uEpisodeWater.y;
  float waveA=sin(p.x*1.25+p.z*0.37-t*(1.1+current));
  float waveB=sin(p.x*0.43-p.z*1.8+t*0.83);
  vec3 n=normalize(normal+vec3(waveA*0.08,0.0,waveB*0.05));
  vec3 view=normalize(camera-p);
  float fresnel=pow(1.0-clamp(dot(n,view),0.0,1.0),3.0);
  vec3 deep=vec3(0.026,0.067,0.071);
  vec3 reflection=mix(uEpisodeFogColor,vec3(0.22,0.30,0.35),0.38);
  float ripple=0.022*(waveA*waveB+1.0);
  vec3 color=mix(deep,reflection,fresnel*0.80)+vec3(ripple*0.62,ripple,ripple*1.05);
  for(int i=0;i<4;i++) {
    if(i>=uEpisodeCount)break;
    vec3 ray=normalize(uEpisodeLight[i].xyz-p);
    float glitter=pow(max(dot(n,normalize(view+ray)),0.0),72.0);
    float fall=pow(max(0.0,1.0-length(uEpisodeLight[i].xyz-p)/max(uEpisodeColor[i].a,0.1)),2.0);
    color+=uEpisodeColor[i].rgb*glitter*fall*uEpisodeLight[i].a*0.5;
  }
  return color;
}
`;
})(window);
