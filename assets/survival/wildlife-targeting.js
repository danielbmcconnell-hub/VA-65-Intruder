/* Defensive wildlife hits use the actual view ray and a camera-facing body
 * ellipsoid. Dimensions are the animal's full length/height/width in metres;
 * this approximates its complete photograph, not per-pixel hit detection.
 * Existing human/cattle ballistics and trigger/ammunition rules stay in Game. */
(function(root){
  'use strict';
  const RANGE=60,SPACING=.25,MAX_SAMPLES=240,EPS=1e-10;
  const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
  const finite=(n,f)=>Number.isFinite(n)?n:f;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function intersection(origin,direction,center,right,front,length,height,width){
    const delta=origin.map((n,i)=>n-center[i]);
    const o=[dot(delta,right)/(length*.5),delta[1]/(height*.5),dot(delta,front)/(width*.5)];
    const d=[dot(direction,right)/(length*.5),direction[1]/(height*.5),dot(direction,front)/(width*.5)];
    const a=dot(d,d),b=dot(o,d),c=dot(o,o)-1;
    if(c<=0)return 0;
    const discriminant=b*b-a*c;if(a<=EPS||discriminant<0)return Infinity;
    const first=(-b-Math.sqrt(discriminant))/a;
    return first>=0?first:Infinity;
  }
  function target(game,e,options={}){
    if(!e||!point(e.p)||e.camp||e.river||game&&(game.pow||game.result||game.phase&&game.phase!=='evade')||!root.GroundCombat)return null;
    const floorAt=typeof options.floorAt==='function'?options.floorAt:p=>p[1];
    const floor=p=>{try{return floorAt(p);}catch(_){return NaN;}};
    const ground=floor(e.p);if(!Number.isFinite(ground))return null;
    const eye=clamp(finite(options.eyeHeight,e.crouch?1.16:1.68),.15,2.2);
    const origin=[e.p[0],ground+eye,e.p[2]],direction=root.GroundCombat.direction(e);
    if(!point(direction))return null;
    const requested=options.actors||root.Wildlife&&root.Wildlife.targets(game)||[],actors=Array.isArray(requested)?requested.slice(0,8):[];
    let nearest=null;
    for(const actor of actors){
      if(!actor||actor.alive!==true||!actor.wildlife||!['boar','tiger'].includes(actor.kind)||!point(actor.p))continue;
      const {length,height,width}=actor;
      if(!Number.isFinite(length)||length<=.3||length>6||!Number.isFinite(height)||height<=.1||height>2.2||!Number.isFinite(width)||width<=.1||width>2)continue;
      const distance=Math.hypot(actor.p[0]-e.p[0],actor.p[2]-e.p[2]);
      if(distance>RANGE+length*.5)continue;
      const bottom=floor(actor.p);if(!Number.isFinite(bottom))continue;
      const center=[actor.p[0],bottom+height*.5,actor.p[2]],camera=point(options.camera)?options.camera:origin;
      let dx=camera[0]-center[0],dz=camera[2]-center[2],horizontal=Math.hypot(dx,dz);
      if(horizontal<EPS){dx=-Math.sin(finite(e.hdg,0));dz=Math.cos(finite(e.hdg,0));horizontal=1;}
      const right=[dz/horizontal,0,-dx/horizontal],front=[dx/horizontal,0,dz/horizontal];
      const rayDistance=intersection(origin,direction,center,right,front,length,height,width);
      if(!Number.isFinite(rayDistance)||rayDistance>RANGE||nearest&&rayDistance>=nearest.rayDistance)continue;
      const hitPoint=origin.map((n,i)=>n+direction[i]*rayDistance);
      try{if(typeof options.lineOfSight==='function'&&!options.lineOfSight(actor,origin,hitPoint))continue;}catch(_){continue;}
      const samples=Math.max(1,Math.min(MAX_SAMPLES,Math.ceil(Math.hypot(hitPoint[0]-origin[0],hitPoint[2]-origin[2])/SPACING)));
      let clear=true;
      for(let i=1;i<=samples;i++){
        const t=i/samples,x=origin[0]+(hitPoint[0]-origin[0])*t,z=origin[2]+(hitPoint[2]-origin[2])*t,terrain=floor([x,0,z]);
        if(!Number.isFinite(terrain)||terrain>origin[1]+(hitPoint[1]-origin[1])*t+.015){clear=false;break;}
      }
      if(clear)nearest={actor,distance,rayDistance,hitPoint,assisted:false,isCow:false};
    }
    return nearest;
  }
  root.WildlifeTargeting=Object.freeze({target,limits:Object.freeze({range:RANGE,terrainSpacing:SPACING,maxTerrainSamples:MAX_SAMPLES,model:'camera-facing-ellipsoid'})});
})(typeof window!=='undefined'?window:globalThis);
