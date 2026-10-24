/* Aircraft-only finish and shading normals. Existing vertex positions,
 * triangles, markings, dimensions, collisions and flight data are retained.
 * Panel/rivet detail is evaluated in aircraft space and filtered to its actual
 * pixel footprint; it therefore stays on the airframe as it moves. */
(function(root){
  'use strict';
  const PAINT=Object.freeze(Object.assign(Object.create(null),{intruder:1,sandy:2,jolly:3,gear:4}));
  const SMOOTH=new Set(['intruder','canopy','sandy','sandyGlass','jolly','jollyGlass','gear']);
  const records=new WeakMap(),CREASE=Math.cos(Math.PI/4),EPS=1e-9;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function kind(name){return PAINT[name]||0;}
  function detailWeight(distance,footprint,quality){
    if(![distance,footprint,quality].every(Number.isFinite)||distance<0||footprint<0)return 0;
    const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    return (1-smooth(45,quality<.5?180:420,distance))*(1-smooth(.012,.055,footprint));
  }
  function refine(builder,name){
    if(!builder||!SMOOTH.has(name)||records.has(builder)||!Array.isArray(builder.p)||!Array.isArray(builder.n)||!Array.isArray(builder.i)||builder.p.length!==builder.n.length||builder.p.length%3||builder.i.length%3)return builder;
    const count=builder.p.length/3,old=builder.n.slice(),weighted=new Float64Array(builder.p.length),groups=new Map();
    for(let i=0;i<count;i++){
      const o=i*3,p=builder.p.slice(o,o+3),n=old.slice(o,o+3);
      if(!p.every(Number.isFinite)||!n.every(Number.isFinite))return builder;
      const key=p.map(v=>Math.round(v*100000)).join(',');let group=groups.get(key);if(!group){group=[];groups.set(key,group);}group.push(i);
    }
    // Area and corner-angle weights keep elongated loft strips from favouring
    // repeated diagonal corners. Existing face normals define each crease.
    for(let k=0;k<builder.i.length;k+=3){
      const ids=builder.i.slice(k,k+3);if(!ids.every(i=>Number.isInteger(i)&&i>=0&&i<count))return builder;
      const a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,p=builder.p,ab=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],ac=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]];
      const area=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);
      if(!Number.isFinite(area)||area<EPS)continue;
      for(let corner=0;corner<3;corner++){
        const id=ids[corner],o=id*3,a=ids[(corner+1)%3]*3,b=ids[(corner+2)%3]*3;
        const u=[p[a]-p[o],p[a+1]-p[o+1],p[a+2]-p[o+2]],v=[p[b]-p[o],p[b+1]-p[o+1],p[b+2]-p[o+2]],den=Math.hypot(...u)*Math.hypot(...v);
        const angle=den>EPS?Math.acos(clamp((u[0]*v[0]+u[1]*v[1]+u[2]*v[2])/den,-1,1)):0;
        for(let j=0;j<3;j++)weighted[o+j]+=old[o+j]*area*angle;
      }
    }
    const result=old.slice();let changed=0;
    for(const group of groups.values())for(const id of group){
      const o=id*3,n=old.slice(o,o+3),length=Math.hypot(...n);if(length<EPS)continue;let x=0,y=0,z=0;
      for(const other of group){const q=other*3,mLength=Math.hypot(old[q],old[q+1],old[q+2]);if(mLength<EPS)continue;const dot=(n[0]*old[q]+n[1]*old[q+1]+n[2]*old[q+2])/(length*mLength);if(dot<CREASE)continue;x+=weighted[q];y+=weighted[q+1];z+=weighted[q+2];}
      const total=Math.hypot(x,y,z);if(total<EPS)continue;const next=[x/total,y/total,z/total];if(Math.hypot(next[0]-n[0],next[1]-n[1],next[2]-n[2])>1e-6)changed++;
      for(let j=0;j<3;j++)result[o+j]=next[j];
    }
    for(let i=0;i<result.length;i++)builder.n[i]=result[i];
    records.set(builder,{name,vertices:count,triangles:builder.i.length/3,smoothedVertices:changed,creaseDegrees:45,positionsChanged:false,colorsChanged:false,indicesChanged:false});
    return builder;
  }
  function inspect(builder){const s=builder&&records.get(builder);return s?{...s}:null;}
  const glsl=`
uniform float uAircraftKind;
float aircraftDetailWeight(float distanceToEye,float pixelFootprint,float quality){
  return (1.0-smoothstep(45.0,quality<0.5?180.0:420.0,distanceToEye))
       * (1.0-smoothstep(0.012,0.055,pixelFootprint));
}
float aircraftLine(float coordinate,float spacing,float width){
  float edge=abs(mod(coordinate+spacing*0.5,spacing)-spacing*0.5);
  float aa=max(fwidth(coordinate),0.0003);
  return 1.0-smoothstep(width-aa,width+aa,edge);
}
vec2 aircraftProjection(vec3 local,vec3 normal){
  vec3 n=abs(normal);
  return n.y>n.x&&n.y>n.z?local.xz:n.x>n.z?local.zy:local.xy;
}
float aircraftPaintMask(vec3 local,vec3 alb){
  float brightness=dot(alb,vec3(0.333333));
  float chroma=max(max(alb.r,alb.g),alb.b)-min(min(alb.r,alb.g),alb.b);
  float mask=smoothstep(0.07,0.18,brightness)*(1.0-smoothstep(0.12,0.24,chroma));
  // Fibreglass radome, occupied cockpit, tyres and painted markings retain
  // their own material instead of receiving fictitious rivets.
  if(uAircraftKind<1.5&&(local.z< -6.28||(abs(local.x)<1.05&&local.y>0.4&&local.z> -5.9&&local.z< -2.4)))mask=0.0;
  if(uAircraftKind>3.5)mask=0.0;
  return mask;
}
vec3 aircraftPaint(vec3 alb,vec3 local,vec3 normal,float distanceToEye,float quality){
  if(uAircraftKind<0.5)return alb;
  vec2 uv=aircraftProjection(local,normal);
  float footprint=max(length(dFdx(uv)),length(dFdy(uv)));
  float detail=aircraftDetailWeight(distanceToEye,footprint,quality),mask=aircraftPaintMask(local,alb);
  vec2 spacing=uAircraftKind<1.5?vec2(0.92,0.64):uAircraftKind<2.5?vec2(0.88,0.71):vec2(1.10,0.78);
  float seamU=aircraftLine(uv.x,spacing.x,0.0024),seamV=aircraftLine(uv.y,spacing.y,0.0024);
  float seams=max(seamU,seamV);
  // Millimetre-scale fasteners vanish before they become a screen pattern.
  float rivetAA=max(footprint,0.0004),rivetFine=1.0-smoothstep(0.002,0.010,footprint);
  float rivetAlongU=1.0-smoothstep(0.002-rivetAA,0.002+rivetAA,abs(mod(uv.x+0.06,0.12)-0.06));
  float rivetAlongV=1.0-smoothstep(0.002-rivetAA,0.002+rivetAA,abs(mod(uv.y+0.06,0.12)-0.06));
  float rivets=max(rivetAlongU*aircraftLine(uv.y,spacing.y,0.008),rivetAlongV*aircraftLine(uv.x,spacing.x,0.008))*rivetFine;
  float broad=vnoise(uv*0.33+vec2(19.7,6.1)),grain=vnoise(uv*31.0);
  float finish=1.0+(broad-0.5)*0.046+(grain-0.5)*0.010*rivetFine-seams*0.105-rivets*0.075;
  return max(alb*mix(1.0,finish,mask*detail),vec3(0.0));
}
vec3 aircraftNormal(vec3 normal,vec3 world,vec3 local,vec3 localNormal,float distanceToEye,float quality){
  vec2 uv=aircraftProjection(local,localNormal);
  float footprint=max(length(dFdx(uv)),length(dFdy(uv)));
  float weight=aircraftDetailWeight(distanceToEye,footprint,quality);
  if(uAircraftKind<0.5)return normal;
  // Tiny paint tooth in aircraft space. Screen derivatives transform the
  // surface gradient without changing geometric normals or any silhouette.
  float height=vnoise(uv*18.0)*0.00010*weight;
  vec3 dx=dFdx(world),dy=dFdy(world),r1=cross(dy,normal),r2=cross(normal,dx);
  vec2 slope=vec2(dFdx(height),dFdy(height));
  float det=dot(dx,r1);if(abs(det)<0.0000001)return normal;
  vec3 gradient=sign(det)*(slope.x*r1+slope.y*r2);
  return normalize(abs(det)*normal-gradient);
}
vec4 aircraftLighting(vec3 alb){
  // Default exactly preserves non-aircraft lighting. Painted military skin
  // has a broad restrained sheen, unlike lacquered scenery or chrome.
  if(uAircraftKind<0.5)return vec4(1.0,46.0,0.30,0.18);
  if(uAircraftKind<1.5)return vec4(0.48,62.0,0.105,0.050);
  if(uAircraftKind<2.5)return vec4(0.37,46.0,0.080,0.040);
  if(uAircraftKind<3.5)return vec4(0.26,34.0,0.055,0.028);
  float bright=smoothstep(0.10,0.28,dot(alb,vec3(0.333333)));
  return mix(vec4(0.09,24.0,0.025,0.020),vec4(0.90,105.0,0.18,0.045),bright);
}
`;
  root.AircraftDetail=Object.freeze({kind,refine,inspect,detailWeight,glsl});
})(typeof window!=='undefined'?window:globalThis);
