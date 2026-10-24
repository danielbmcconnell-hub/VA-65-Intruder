/* Optional surface detail for existing custom-WebGL terrain and authored
 * scenery. No geometry/height/river/field-boundary changes, texture requests,
 * photographic edits or synthetic historical images. Fragment derivatives
 * and range fades remove detail before it falls below a resolvable pixel. */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const kinds = Object.freeze(Object.assign(Object.create(null), { bnStrikeDepot: 1, bnStrikeShed: 1, bnStrikeRuin: 2, bnStrikeRoad: 3, bnStrikeTruck: 4, bnStrikeTower: 5, carrier: 6 }));
  function detailWeight(distance, footprint, quality) {
    if (![distance, footprint, quality].every(Number.isFinite) || distance < 0 || footprint < 0) return 0;
    return (1 - smooth(180, quality < .5 ? 620 : 1450, distance)) * (1 - smooth(.16, .56, footprint));
  }
  function kind(name) {
    return kinds[name] || 0;
  }
  const glsl = `
uniform float uSurfacePolish, uSurfaceKind;
float flightSurfaceDetail(float distanceToEye,float pixelFootprint,float quality){
  return (1.0-smoothstep(180.0,quality<0.5?620.0:1450.0,distanceToEye))
       * (1.0-smoothstep(0.16,0.56,pixelFootprint));
}
float flightSurfaceLine(float coordinate,float width){
  float aa=max(fwidth(coordinate),0.0005);
  float edge=abs(fract(coordinate+0.5)-0.5);
  return 1.0-smoothstep(width-aa,width+aa,edge);
}
vec3 flightCropSurface(vec3 alb,vec3 world,vec2 field,float cultivated,float flooded,float bund,float distanceToEye,float quality){
  if(uSurfacePolish<0.5||cultivated<0.005) return alb;
  vec2 plot=floor(field),inside=fract(field);
  float seed=hash21(plot+vec2(18.73,5.91));
  bool along=seed>0.5;
  float coordinate=(along?field.x:field.y)*(42.0+floor(seed*7.0));
  float detail=flightSurfaceDetail(distanceToEye,fwidth(coordinate),quality);
  float mask=cultivated*(1.0-clamp(bund,0.0,1.0))*(1.0-flooded*0.85);
  if(detail>0.002){
    // Alternating planted rows and irregular sheaves share the original
    // warped field coordinates, so paths and chart features still agree.
    float rows=flightSurfaceLine(coordinate,0.18);
    float tufts=vnoise(world.xz*0.23+seed*11.0);
    float rowTone=(rows-0.36)*(0.14+0.035*tufts);
    alb*=1.0+rowTone*mask*detail;
    // A narrow, worn interior footpath. Existing earth bunds are excluded.
    float path=flightSurfaceLine((along?inside.y:inside.x)-0.37-seed*0.16,0.008);
    alb=mix(alb,alb*vec3(0.93,0.87,0.80),path*mask*detail*0.46);
  }
  return max(alb,vec3(0.0));
}
vec3 flightRiverNormal(vec3 world,float distanceToEye,float quality,float time){
  // Only shading: retain the existing channel mask, elevation and depth.
  // Low-frequency travelling streaks remain legible without metallic noise.
  vec2 q=world.xz;
  float coordinate=dot(q,vec2(0.055,0.023));
  float detail=flightSurfaceDetail(distanceToEye,fwidth(coordinate),quality);
  float a=sin(coordinate-time*0.45),b=sin(dot(q,vec2(-0.031,0.071))+time*0.31);
  return normalize(vec3((a+b*0.45)*0.034*detail,1.0,(b-a*0.35)*0.024*detail));
}
vec3 flightMeshSurface(vec3 alb,vec3 local,vec3 normal,float distanceToEye,float quality){
  if(uSurfacePolish<0.5||uSurfaceKind<0.5) return alb;
  if(uSurfaceKind>5.5){
    // The flight deck is matte charcoal nonskid. Local coordinates keep
    // grain and touchdown rubber on the moving ship instead of sliding.
    if(normal.y>0.9&&local.y> -0.1&&local.y<0.20){
      float grainFade=1.0-smoothstep(0.10,0.52,max(fwidth(local.x),fwidth(local.z))*22.0);
      float grain=vnoise(local.xz*22.0)-0.5;
      float ax=local.x*0.986286-local.z*(-0.165048),az=local.x*(-0.165048)+local.z*0.986286;
      float rubber=exp(-pow((abs(ax)-2.1)/1.20,2.0))*smoothstep(45.0,65.0,az)*(1.0-smoothstep(120.0,145.0,az));
      float tread=0.60+0.40*vnoise(vec2(ax*1.6,az*.17));
      float paint=1.0-smoothstep(.14,.30,dot(alb,vec3(.333333)));
      return alb*(1.0+grain*.055*grainFade)*(1.0-rubber*tread*paint*.32);
    }
    return alb;
  }
  float near=1.0-smoothstep(100.0,quality<0.5?380.0:900.0,distanceToEye);
  if(near<0.002) return alb;
  vec3 original=alb;
  if(uSurfaceKind<1.5){
    bool roof=normal.y>0.6&&local.y>4.0;
    if(roof){
      float c=local.x*2.3;
      float fine=flightSurfaceDetail(distanceToEye,fwidth(c),quality);
      float grooves=flightSurfaceLine(c,0.095);
      float laps=flightSurfaceLine(local.z/3.15,0.012);
      float rust=vnoise(vec2(local.x*0.46,local.z*0.18));
      alb*=1.0-(grooves*0.16+laps*0.11)*fine;
      alb=mix(alb,alb*vec3(1.10,0.87,0.68),smoothstep(0.55,0.78,rust)*near*0.34);
    }else if(abs(normal.y)<0.15){
      float horizontal=abs(normal.x)>0.5?local.z:local.x;
      float seam=flightSurfaceLine(horizontal/1.5,0.012);
      float streak=vnoise(vec2(horizontal*0.9,local.y*0.11));
      float damp=1.0-smoothstep(0.10,1.5,local.y);
      alb*=1.0-near*(damp*0.21+(streak-0.3)*0.07+seam*0.06);
    }
  }else if(uSurfaceKind<2.5){
    float ash=vnoise(local.xz*0.7);
    alb=mix(alb,alb*vec3(0.68,0.71,0.72),smoothstep(0.42,0.72,ash)*near*0.60);
  }else if(uSurfaceKind<3.5){
    // Paired vehicle tracks fit inside the original eight-metre road.
    float rut=exp(-pow((abs(local.x)-1.18)*5.0,2.0));
    float grain=vnoise(local.xz*0.75);
    alb*=1.0-near*(rut*0.16+(grain-0.5)*0.055);
  }else if(uSurfaceKind<4.5){
    if(local.y>1.4&&local.z>-1.3){
      float folds=flightSurfaceLine(local.z*0.73,0.065);
      alb*=1.0-folds*near*0.12;
    }
  }else{
    float rust=vnoise(vec2((local.x+local.z)*1.2,local.y*0.17));
    alb=mix(alb,alb*vec3(1.10,0.80,0.66),smoothstep(0.55,0.74,rust)*near*0.29);
  }
  // No emission or exposure lift: existing day/night lights remain in charge.
  return max(mix(original,alb,clamp(uSurfacePolish,0.0,1.0)),vec3(0.0));
}
`;
  root.FlightVisualMaterials = Object.freeze({ glsl, kind, detailWeight });
})(typeof window !== 'undefined' ? window : globalThis);
