/* Bounded ground-wildlife simulation. Real player travel drives defensive
 * contact; no random bites, instant deaths, timers, or global RNG changes.
 * Delayed impairment is a gameplay abstraction, not a medical prediction. */
(function(root){
 'use strict';
 const VERSION=1,MAX=3,TAU=Math.PI*2,STEP=.05,MAX_DT=.25,RADIUS=.16,BITE_RADIUS=.48;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),finite=(x,f=0)=>Number.isFinite(x)?x:f;
 const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
 const states=new Set(['rest','crawl','retreat','defensive']);
 function eligible(g){return !!(g&&g.evade&&point(g.evade.p)&&(!g.phase||g.phase==='evade')&&!g.pow&&!g.evade.camp&&!g.evade.river&&!g.evade.frozen&&!g.evade.handsUp&&!g._solitaryActive&&!g._capturePending&&!g.result);}
 function visible(g){const a=g&&g.app;return eligible(g)&&(!a||(!a.game||a.game===g)&&(!a.screen||a.screen==='game')&&!a.graphicsContextLost);}
 function active(g){const d=root.document;return visible(g)&&!g.paused&&!g.evade.held&&!(d&&(d.hidden||d.visibilityState==='hidden'));}
 function hash(value){let h=2166136261;for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0||1;}
 function random(s){let n=s.rng>>>0;n^=n<<13;n^=n>>>17;n^=n<<5;s.rng=n>>>0||1;return s.rng/4294967296;}
 function floor(ctx,x,z){const f=ctx&&ctx.terrainH;return typeof f==='function'?f(x,z):0;}
 function solid(ctx,x,z,r=RADIUS){return !!(ctx&&typeof ctx.solidAt==='function'&&ctx.solidAt(x,z,r));}
 function snake(input,i){if(!input||!point(input.p))return null;return {id:String(input.id||'krait-'+i),kind:['krait','cobra','pit-viper'].includes(input.kind)?input.kind:'krait',p:input.p.slice(0,3),yaw:finite(input.yaw),scale:clamp(finite(input.scale,1),.75,1.15),state:states.has(input.state)?input.state:'rest',phase:0,turn:0,rest:finite(input.rest,5),noticed:false,blocked:0,strikes:0};}
 function enter(g,options={}){
  if(!g||!g.evade||!point(g.evade.p))return false;
  const e=g.evade,seed=Number.isFinite(options.seed)?options.seed>>>0:hash((g.mis&&g.mis.id||'ground')+':'+e.p[0].toFixed(2)+':'+e.p[2].toFixed(2));
  e.wildlife={version:VERSION,seed:seed||1,rng:seed||1,clock:0,nextSpawn:18,serial:0,disableSpawns:!!options.disableSpawns,previousP:e.p.slice(0,3),snakes:(options.encounters||[]).slice(0,MAX).map(snake).filter(Boolean),bite:null,lastWarning:-99,contactGraceUntil:.75,spawns:0};
  return true;
 }
 function valid(s){return !!(s&&s.version===VERSION&&Array.isArray(s.snakes)&&point(s.previousP)&&Number.isFinite(s.clock)&&Number.isFinite(s.rng));}
 function ensure(g){if(!valid(g.evade.wildlife))enter(g);return g.evade.wildlife;}
 function warn(s,ctx,text){if(ctx&&typeof ctx.warn==='function')ctx.warn(text);s.lastWarning=s.clock;}
 function clearLine(ctx,a,b){if(ctx&&typeof ctx.lineOfSight==='function'&&!ctx.lineOfSight(a,b))return false;const d=Math.hypot(b[0]-a[0],b[2]-a[2]),n=Math.max(1,Math.min(96,Math.ceil(d/.08)));for(let i=0;i<=n;i++){const u=i/n;if(solid(ctx,a[0]+(b[0]-a[0])*u,a[2]+(b[2]-a[2])*u,.025))return false;}return true;}
 function segmentDistance(a,b,p){const dx=b[0]-a[0],dz=b[2]-a[2],d=dx*dx+dz*dz,u=d>1e-12?clamp(((p[0]-a[0])*dx+(p[2]-a[2])*dz)/d,0,1):0;const q=[a[0]+dx*u,0,a[2]+dz*u];return {distance:Math.hypot(q[0]-p[0],q[2]-p[2]),p:q};}
 function bodyClear(ctx,p,yaw,scale){for(const back of [0,.28,.65]){const x=p[0]-Math.sin(yaw)*back*scale,z=p[2]+Math.cos(yaw)*back*scale,h=floor(ctx,x,z);if(!Number.isFinite(h)||h<1.2||Math.abs(h-p[1])>.5||solid(ctx,x,z,RADIUS*scale))return false;}return true;}
 function move(s,n,dt,ctx,player){
  const dist=Math.hypot(n.p[0]-player[0],n.p[2]-player[2]);let target=n.yaw,speed=0;
  if(dist<2.4){
   if(!n.noticed&&s.clock-s.lastWarning>8){warn(s,ctx,'Snake nearby. Watch your footing and give it space.');n.noticed=true;}
   target=Math.atan2(n.p[0]-player[0],-(n.p[2]-player[2]));
   n.state=dist<.62||n.blocked>.15?'defensive':'retreat';speed=n.state==='retreat'?.68:0;
  }else{
   n.noticed=false;n.rest-=dt;
   if(n.state==='retreat'||n.state==='defensive'){n.state='crawl';n.rest=2+random(s)*3;}
   if(n.rest<=0){n.state=n.state==='rest'?'crawl':'rest';n.rest=n.state==='rest'?4+random(s)*7:4+random(s)*6;n.turn=(random(s)-.5)*1.3;}
   if(n.state==='crawl'){speed=.12;target+=n.turn*dt;}
  }
  const delta=Math.atan2(Math.sin(target-n.yaw),Math.cos(target-n.yaw)),oldYaw=n.yaw,oldP=n.p.slice();
  const newYaw=n.yaw+clamp(delta,-2.5*dt,2.5*dt);
  if(bodyClear(ctx,n.p,newYaw,n.scale))n.yaw=newYaw;
  if(speed>0){
   const dx=Math.sin(n.yaw)*speed*dt,dz=-Math.cos(n.yaw)*speed*dt;
   let q=ctx&&typeof ctx.move==='function'?ctx.move(n.p[0],n.p[2],dx,dz,RADIUS*n.scale):[n.p[0]+dx,n.p[2]+dz];
   if(!Array.isArray(q)||!q.every(Number.isFinite)||Math.hypot(q[0]-n.p[0],q[1]-n.p[2])>speed*dt*1.05)q=[n.p[0],n.p[2]];
   const p=[q[0],floor(ctx,q[0],q[1]),q[1]],travel=Math.hypot(p[0]-n.p[0],p[2]-n.p[2]);
   const samples=Math.max(1,Math.ceil(travel/.045));let clear=true;
   for(let i=1;i<=samples;i++){const u=i/samples,x=n.p[0]+(p[0]-n.p[0])*u,z=n.p[2]+(p[2]-n.p[2])*u,h=floor(ctx,x,z);if(!bodyClear(ctx,[x,h,z],n.yaw,n.scale)){clear=false;break;}}
   // Never let a roaming snake walk into a stationary player's feet.
   if(Math.hypot(p[0]-player[0],p[2]-player[2])<.62&&dist>=.62)clear=false;
   if(clear){n.p=p;n.blocked=travel<speed*dt*.15?n.blocked+dt:Math.max(0,n.blocked-dt);n.phase=(n.phase+travel*10)%TAU;}else{n.blocked+=dt;n.yaw=oldYaw;if(dist>=2.4)n.turn=n.turn>=0?-1.2:1.2;}
  }else n.blocked=Math.max(0,n.blocked-dt*.3);
  const h=floor(ctx,n.p[0],n.p[2]);if(Number.isFinite(h))n.p[1]=h;n.speed=Math.hypot(n.p[0]-oldP[0],n.p[2]-oldP[2])/dt;
 }
 function spawn(s,g,ctx){
  if(s.disableSpawns||s.snakes.length>=MAX||s.clock<s.nextSpawn)return;
  s.nextSpawn=s.clock+42+random(s)*38;
  const night=ctx&&ctx.night!==undefined?!!ctx.night:!!(g.atm&&g.atm.night);
  if(random(s)>(night?.3:.025))return;
  const e=g.evade;
  for(let i=0;i<12;i++){
   const a=random(s)*TAU,r=14+random(s)*18,x=e.p[0]+Math.sin(a)*r,z=e.p[2]-Math.cos(a)*r,h=floor(ctx,x,z);
   const cover=ctx&&typeof ctx.coverAt==='function'?ctx.coverAt(x,z):0;
   if(!Number.isFinite(h)||h<2||!Number.isFinite(cover)||cover<.55||solid(ctx,x,z,.6))continue;
   const kind=['krait','cobra','pit-viper'][Math.floor(random(s)*3)];
   const n=snake({id:kind+'-'+(++s.serial),kind,p:[x,h,z],yaw:random(s)*TAU,state:night?'crawl':'rest'},s.serial);
   if(!bodyClear(ctx,n.p,n.yaw,n.scale))continue;s.snakes.push(n);s.spawns++;return;
  }
 }
 function step(g,dt,ctx={}){
  if(!eligible(g)||!active(g)||!Number.isFinite(dt)||dt<=0)return false;
  const s=ensure(g),e=g.evade,total=Math.min(dt,MAX_DT),start=s.previousP.slice(),end=e.p.slice(0,3),distance=Math.hypot(end[0]-start[0],end[2]-start[2]);
  const discontinuity=distance>Math.max(2,total*8),count=Math.max(1,Math.ceil(total/STEP)),sub=total/count;
  for(let i=0;i<count;i++){
   const a=discontinuity?end:[start[0]+(end[0]-start[0])*i/count,start[1],start[2]+(end[2]-start[2])*i/count],b=discontinuity?end:[start[0]+(end[0]-start[0])*(i+1)/count,end[1],start[2]+(end[2]-start[2])*(i+1)/count];
   s.clock+=sub;if(s.bite)s.bite.age+=sub;
   spawn(s,g,ctx);
   for(const n of s.snakes){
    const old=n.p.slice();move(s,n,sub,ctx,b);
    if(!s.bite&&!discontinuity&&s.clock>=finite(s.contactGraceUntil)&&Math.hypot(b[0]-a[0],b[2]-a[2])>.00001){
     const hit=segmentDistance(a,b,old),h=floor(ctx,hit.p[0],hit.p[2]);
     if(hit.distance<BITE_RADIUS&&Number.isFinite(h)&&Math.abs(h-old[1])<.32&&clearLine(ctx,hit.p,old)){
      s.bite={age:0,at:s.clock,snakeId:n.id,kind:n.kind,possibleVenomous:true};n.strikes++;n.state='retreat';
      warn(s,ctx,'Possible snake bite. Move clear and signal for rescue.');
     }
    }
   }
   s.snakes=s.snakes.filter(n=>Math.hypot(n.p[0]-b[0],n.p[2]-b[2])<=72);
  }
  s.previousP=end;return true;
 }
 function movementFactor(g){const s=g&&g.evade&&g.evade.wildlife;if(!eligible(g)||!valid(s)||!s.bite)return 1;return 1-.28*clamp((s.bite.age-25)/155,0,1);}
 function view(g){const s=g&&g.evade&&g.evade.wildlife,show=visible(g)&&valid(s);return {active:!!show,simulating:active(g)&&!!show,clock:show?s.clock:0,snakes:show?s.snakes.map(n=>({id:n.id,kind:n.kind||'krait',p:n.p.slice(),yaw:n.yaw,scale:n.scale,length:(n.kind==='cobra'?1.45:n.kind==='pit-viper'?.9:1.15)*n.scale,width:.62*n.scale,state:n.state,phase:n.phase,speed:finite(n.speed),strikes:n.strikes})):[],bite:show&&s.bite?{age:s.bite.age,kind:s.bite.kind||'krait',severity:clamp((s.bite.age-25)/155,0,1),possibleVenomous:true}:null,movementFactor:movementFactor(g)};}
 function snapshot(g){const s=g&&g.evade&&g.evade.wildlife;return valid(s)?JSON.parse(JSON.stringify(s)):null;}
 function restore(g,saved){
  if(!g||!g.evade||!point(g.evade.p)||!valid(saved)||saved.snakes.length>MAX||!saved.snakes.every(n=>point(n.p)&&Number.isFinite(n.yaw)))return false;
  const copy=JSON.parse(JSON.stringify(saved));copy.snakes=copy.snakes.map((n,i)=>Object.assign(snake(n,i),{phase:finite(n.phase),strikes:Math.max(0,Math.floor(finite(n.strikes))),turn:finite(n.turn),rest:finite(n.rest,5),noticed:!!n.noticed,blocked:Math.max(0,finite(n.blocked)),speed:Math.max(0,finite(n.speed))}));
  if(copy.bite){if(!Number.isFinite(copy.bite.age)||copy.bite.age<0)return false;copy.bite={age:copy.bite.age,at:finite(copy.bite.at),snakeId:String(copy.bite.snakeId||''),kind:['krait','cobra','pit-viper'].includes(copy.bite.kind)?copy.bite.kind:'krait',possibleVenomous:true};}
  copy.previousP=g.evade.p.slice(0,3);copy.clock=Math.max(0,copy.clock);copy.rng=copy.rng>>>0||1;copy.nextSpawn=finite(copy.nextSpawn,copy.clock+18);copy.disableSpawns=!!copy.disableSpawns;g.evade.wildlife=copy;return true;
 }
 root.Wildlife=Object.freeze({enter,step,view,movementFactor,snapshot,restore,limits:Object.freeze({maxSnakes:MAX,maxStep:MAX_DT,biteRadius:BITE_RADIUS,snakeRadius:RADIUS,delayedImpairmentSeconds:180,minimumMovementFactor:.72,timers:0})});
})(typeof window!=='undefined'?window:globalThis);

/* The original defensive-snake module above remains compatible with saved
 * encounters. The ecology extension adds bounded mammals, litter arthropods
 * and leaf nests; it does not put wildlife into armed human AI arrays. */
(function(root){
 'use strict';
 const base=root.Wildlife,TAU=Math.PI*2,CAPS={mammals:2,crawlers:3,colonies:3};
 const SPECS={
  // The sixteen photographed running poses contain two complete bounds.
  boar:{group:'mammals',length:1.65,width:.7,height:.95,radius:.43,stride:1.7,runStride:4.8,trigger:6.5,windup:1.7,chargeSpeed:6,chargeTime:1.35},
  tiger:{group:'mammals',length:2.65,width:.68,height:1.05,radius:.46,stride:2.2,runStride:6.3,trigger:11.5,windup:2.2,chargeSpeed:6.6,chargeTime:1.85},
  scorpion:{group:'crawlers',length:.14,width:.09,height:.045,radius:.045,stride:.12,contact:.27},
  centipede:{group:'crawlers',length:.23,width:.055,height:.025,radius:.035,stride:.18,contact:.28},
  'weaver-ants':{group:'colonies',length:.75,width:.6,height:.55,radius:.85}
 };
 const SNAKES=new Set(['krait','cobra','pit-viper']),STATES=new Set(['rest','crawl','retreat','defensive','stalk','warn','charge','recover','flee']);
 const finite=(n,f=0)=>Number.isFinite(n)?n:f,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite),copy=v=>JSON.parse(JSON.stringify(v));
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
 function eligible(g){return !!(g&&g.evade&&point(g.evade.p)&&(!g.phase||g.phase==='evade')&&!g.pow&&!g.evade.camp&&!g.evade.river&&!g.evade.frozen&&!g.evade.handsUp&&!g._solitaryActive&&!g._capturePending&&!g.result);}
 function active(g){const a=g&&g.app,d=root.document;return eligible(g)&&!g.paused&&!g.evade.held&&!(d&&(d.hidden||d.visibilityState==='hidden'))&&(!a||(!a.game||a.game===g)&&(!a.screen||a.screen==='game')&&!a.graphicsContextLost);}
 function random(s){let n=s.rng>>>0;n^=n<<13;n^=n>>>17;n^=n<<5;s.rng=n>>>0||1;return s.rng/4294967296;}
 function floor(c,x,z){return typeof c.terrainH==='function'?c.terrainH(x,z):0;}
 function solid(c,x,z,r=.12){return !!(typeof c.solidAt==='function'&&c.solidAt(x,z,r));}
 function clearLine(c,a,b){const d=distance(a,b);if(typeof c.lineOfSight==='function'){if(!c.lineOfSight(a,b))return false;if(d>2)return true;}const n=Math.max(1,Math.min(96,Math.ceil(d/.08)));for(let i=0;i<=n;i++){const u=i/n;if(solid(c,a[0]+(b[0]-a[0])*u,a[2]+(b[2]-a[2])*u,.025))return false;}return true;}
 function perceive(s,n,c,player){if(!n._sightFrom||!n._sightTo||s.clock>=finite(n._sightAt)||distance(n.p,n._sightFrom)>.5||distance(player,n._sightTo)>.5){n._sight=clearLine(c,n.p,player);n._sightAt=s.clock+.2;n._sightFrom=n.p.slice();n._sightTo=player.slice();}return n._sight;}
 function closest(a,b,p){const x=b[0]-a[0],z=b[2]-a[2],d=x*x+z*z,u=d>1e-12?clamp(((p[0]-a[0])*x+(p[2]-a[2])*z)/d,0,1):0;return {distance:Math.hypot(a[0]+x*u-p[0],a[2]+z*u-p[2]),p:[a[0]+x*u,0,a[2]+z*u]};}
 function actor(input,i){
  if(!input||!SPECS[input.kind]||!point(input.p))return null;
  const kind=input.kind,spec=SPECS[kind],n={id:String(input.id||kind+'-'+i),kind,p:input.p.slice(0,3)};
  if(spec.group==='colonies')return {...n,anchorHeight:clamp(finite(input.anchorHeight,1.3),.25,2.2),radius:clamp(finite(input.radius,.85),.45,1.25),noticed:false,contact:0,lastBite:-99,activity:0,phase:0};
  return {...n,yaw:finite(input.yaw),scale:clamp(finite(input.scale,1),.75,1.15),state:STATES.has(input.state)?input.state:kind==='tiger'?'stalk':'rest',phase:0,speed:0,rest:finite(input.rest,5),turn:0,noticed:false,blocked:0,strikes:0,stateAge:0,warnedAt:-99,encounterAge:0,spent:false,hit:false,chargeYaw:finite(input.yaw),lastContact:-99};
 }
 function fresh(s){return {version:1,mammals:[],crawlers:[],colonies:[],nextSpawn:14,rng:(s.seed^0x6d2b79f5)>>>0||1,serial:0,spawns:0,lastHit:-99,graceUntil:.75,injury:null,irritation:null};}
 function ecology(g){const s=g.evade.wildlife;if(!s.ecology)s.ecology=fresh(s);return s.ecology;}
 function enter(g,options={}){
  const entries=Array.isArray(options.encounters)?options.encounters:[];
  if(!base.enter(g,{...options,encounters:entries.filter(n=>n&&(!n.kind||SNAKES.has(n.kind)))}))return false;
  const e=ecology(g);for(const [i,input]of entries.entries()){const n=actor(input,i);if(n){const group=SPECS[n.kind].group;if(e[group].length<CAPS[group])e[group].push(n);}}
  return true;
 }
 function warn(s,c,text){s.lastWarning=s.clock;if(typeof c.warn==='function')c.warn(text);}
 function setState(n,state){if(n.state!==state){n.state=state;n.stateAge=0;}}
 function bodyClear(c,n,p,yaw){const a=SPECS[n.kind],reach=a.group==='mammals'?a.length*.28*n.scale:0;for(const b of reach?[0,-reach,reach]:[0]){const x=p[0]+Math.sin(yaw)*b,z=p[2]-Math.cos(yaw)*b,h=floor(c,x,z);if(!Number.isFinite(h)||h<1.2||Math.abs(h-p[1])>(a.group==='mammals'?.7:.5)||solid(c,x,z,a.radius*n.scale))return false;}return true;}
 function move(e,n,dt,c,player,target,speed,locked=false){
  const a=SPECS[n.kind],old=n.p.slice(),oldYaw=n.yaw,delta=Math.atan2(Math.sin(target-n.yaw),Math.cos(target-n.yaw)),yaw=locked?target:n.yaw+clamp(delta,-3.3*dt,3.3*dt);
  if(bodyClear(c,n,n.p,yaw))n.yaw=yaw;
  if(speed>0){
   const dx=Math.sin(n.yaw)*speed*dt,dz=-Math.cos(n.yaw)*speed*dt;let q=typeof c.move==='function'?c.move(n.p[0],n.p[2],dx,dz,a.radius*n.scale):[n.p[0]+dx,n.p[2]+dz];
   if(!Array.isArray(q)||q.length<2||!q.every(Number.isFinite)||Math.hypot(q[0]-old[0],q[1]-old[2])>speed*dt*1.05)q=[old[0],old[2]];
   const p=[q[0],floor(c,q[0],q[1]),q[1]],travel=distance(old,p),samples=Math.max(1,Math.ceil(travel/.1));let clear=true;
   for(let i=1;i<=samples;i++){const u=i/samples,x=old[0]+(p[0]-old[0])*u,z=old[2]+(p[2]-old[2])*u;if(!bodyClear(c,n,[x,floor(c,x,z),z],n.yaw)){clear=false;break;}}
   if(a.group==='crawlers'&&distance(p,player)<.6&&distance(old,player)>=.6)clear=false;
   if(a.group==='mammals')for(const other of e.mammals)if(other!==n&&distance(p,other.p)<a.radius+SPECS[other.kind].radius&&distance(p,other.p)<distance(old,other.p))clear=false;
   if(clear){n.p=p;n.blocked=travel<speed*dt*.15?n.blocked+dt:Math.max(0,n.blocked-dt);}else{n.blocked+=dt;n.yaw=oldYaw;}
  }
  const h=floor(c,n.p[0],n.p[2]);if(Number.isFinite(h))n.p[1]=h;const travel=distance(old,n.p);n.speed=travel/dt;if(travel>0)n.phase=(n.phase+travel/(n.speed>2.7&&a.runStride?a.runStride:a.stride))%1;return old;
 }
 function irritate(s,e,c,kind,duration,factor){e.irritation={kind,age:0,duration,factor};warn(s,c,kind==='weaver-ants'?'Weaver ants are biting. Move clear of the leafy nest.':kind==='scorpion'?'Scorpion sting. Move clear of the leaf litter.':'Centipede bite. Move clear of the leaf litter.');}
 function crawler(s,e,n,dt,c,a,b,contact){
  const d=distance(n.p,b);let target=n.yaw,speed=0;
  if(d<2.4){if(!n.noticed&&s.clock-s.lastWarning>5){warn(s,c,n.kind==='scorpion'?'Scorpion in the leaf litter. Step around it.':'Large centipede nearby. Step around it.');n.noticed=true;}target=Math.atan2(n.p[0]-b[0],-(n.p[2]-b[2]));setState(n,d<.62?'defensive':'retreat');speed=n.state==='retreat'?.09:0;}
  else{n.noticed=false;n.rest-=dt;if(n.state==='retreat'||n.state==='defensive'){setState(n,'crawl');n.rest=3;}if(n.rest<=0){setState(n,n.state==='rest'?'crawl':'rest');n.rest=4+random(e)*7;n.turn=(random(e)-.5)*1.3;}if(n.state==='crawl'){speed=.035;target+=n.turn*dt;}}
  const old=move(e,n,dt,c,b,target,speed),hit=closest(a,b,old),h=floor(c,hit.p[0],hit.p[2]);
  if(contact&&distance(a,b)>.00001&&hit.distance<SPECS[n.kind].contact&&Number.isFinite(h)&&Math.abs(h-old[1])<.32&&clearLine(c,hit.p,old)&&s.clock-n.lastContact>=12){n.lastContact=s.clock;n.strikes++;setState(n,'retreat');irritate(s,e,c,n.kind,n.kind==='scorpion'?15:12,n.kind==='scorpion'?.9:.92);}
 }
 function mammal(s,e,n,dt,c,a,b,contact){
  const spec=SPECS[n.kind],d=distance(n.p,b),toward=Math.atan2(b[0]-n.p[0],-(b[2]-n.p[2]));let target=n.yaw,speed=0;n.stateAge+=dt;if(n.noticed)n.encounterAge+=dt;
  if(n.state==='charge'&&n.warnedAt<0)setState(n,'warn');
  if(n.state==='warn'&&n.warnedAt<0){n.noticed=true;n.warnedAt=s.clock;n.stateAge=0;warn(s,c,n.kind==='boar'?'Wild boar is facing you. Back away; step aside if it charges.':'Tiger nearby. Keep it in sight and move away from its approach.');}
  if(n.encounterAge>24&&n.state!=='flee'){n.spent=true;setState(n,'flee');}
  if(n.state==='warn'){target=toward;if(d>spec.trigger+3||!perceive(s,n,c,b)){n.spent=true;setState(n,'flee');}else if(n.stateAge>=spec.windup){n.chargeYaw=toward;n.hit=false;setState(n,'charge');}}
  else if(n.state==='charge'){target=n.chargeYaw;speed=spec.chargeSpeed;if(n.stateAge>=spec.chargeTime||n.blocked>.12){n.spent=true;setState(n,'recover');speed=0;}}
  else if(n.state==='recover'){if(n.stateAge>=1.15){n.spent=true;setState(n,'flee');}}
  else if(n.state==='flee'||n.spent){setState(n,'flee');target=toward+Math.PI;speed=n.stateAge<12?3.6:0;}
  else if(d<=spec.trigger&&perceive(s,n,c,b)){n.noticed=true;n.warnedAt=s.clock;setState(n,'warn');target=toward;warn(s,c,n.kind==='boar'?'Wild boar is facing you. Back away; step aside if it charges.':'Tiger nearby. Keep it in sight and move away from its approach.');}
  else if(n.kind==='tiger'&&d<25&&perceive(s,n,c,b)){setState(n,'stalk');target=toward;speed=1.15;if(!n.noticed){n.noticed=true;n.warnedAt=s.clock;warn(s,c,'A tiger is moving through the cover. Keep your distance.');}}
  else{n.rest-=dt;if(n.rest<=0){n.rest=4+random(e)*7;n.turn=(random(e)-.5)*.7;setState(n,n.state==='rest'?'crawl':'rest');}if(n.state==='crawl'){target+=n.turn*dt;speed=.22;}}
  const old=move(e,n,dt,c,b,target,speed,n.state==='charge');
  if(n.state==='charge'&&contact&&!n.hit&&s.clock-n.warnedAt>=spec.windup){
   const ra=[old[0]-a[0],0,old[2]-a[2]],rb=[n.p[0]-b[0],0,n.p[2]-b[2]],hit=closest(ra,rb,[0,0,0]);
   if(hit.distance<spec.radius+.43&&Math.abs(n.p[1]-floor(c,b[0],b[2]))<.75&&clearLine(c,n.p,b)){
    n.hit=true;n.strikes++;n.spent=true;setState(n,'recover');
    if(s.clock-e.lastHit>=12){e.lastHit=s.clock;e.injury={kind:n.kind,age:0,duration:30,factor:.82};const message=n.kind==='boar'?'The boar struck you. Move clear while it recovers.':'The tiger struck you. Move clear while it withdraws.';warn(s,c,message);if(typeof c.hurt==='function')c.hurt({kind:n.kind,damage:1,message});}
   }
  }
 }
 function colony(s,e,n,dt,c,player,crouch,contact){
  const d=distance(n.p,player),near=d<n.radius+2.1;if(near&&!n.noticed){n.noticed=true;warn(s,c,'Weaver-ant nest in the low leaves. Give it space or crouch beneath it.');}
  const touch=contact&&d<n.radius&&n.anchorHeight<=(crouch?.96:1.8)&&clearLine(c,n.p,player);
  n.contact=touch?n.contact+dt:0;n.activity+=((touch?1:near?.45:.12)-n.activity)*Math.min(1,dt*4);n.phase=(n.phase+dt*(.18+n.activity*.6))%1;if(!near)n.noticed=false;
  if(touch&&n.contact>=.9&&s.clock-n.lastBite>=5){n.lastBite=s.clock;irritate(s,e,c,'weaver-ants',6,.88);}
 }
 function spawn(s,e,g,c){
  if(s.disableSpawns||s.clock<e.nextSpawn)return;e.nextSpawn=s.clock+22+random(e)*24;if(random(e)>(c.night?.42:.3))return;
  // Tiger selection is 2.5%, versus 27.5% boar; both stay out of contact range.
  const r=random(e),kind=r<.025?'tiger':r<.30?'boar':r<.59?'weaver-ants':r<.80?'scorpion':'centipede',group=SPECS[kind].group;if(e[group].length>=CAPS[group])return;
  for(let i=0;i<10;i++){const a=random(e)*TAU,reach=(group==='mammals'?24:14)+random(e)*18,x=g.evade.p[0]+Math.sin(a)*reach,z=g.evade.p[2]-Math.cos(a)*reach,h=floor(c,x,z),cover=typeof c.coverAt==='function'?c.coverAt(x,z):0;if(!Number.isFinite(h)||h<2||!Number.isFinite(cover)||cover<.55||solid(c,x,z,group==='mammals'?.9:.35))continue;const n=actor({id:kind+'-'+(++e.serial),kind,p:[x,h,z],yaw:random(e)*TAU},e.serial);if(group!=='colonies'&&!bodyClear(c,n,n.p,n.yaw))continue;e[group].push(n);e.spawns++;return;}
 }
 function synchronize(g){const s=g&&g.evade&&g.evade.wildlife;if(!s||!point(s.previousP)||!point(g.evade.p))return false;s.previousP=g.evade.p.slice(0,3);return true;}
 function step(g,dt,c={}){
  if(!Number.isFinite(dt)||dt<=0)return false;
  if(!active(g)){synchronize(g);return false;}
  if(!g.evade.wildlife||!point(g.evade.wildlife.previousP))enter(g);
  const s=g.evade.wildlife,e=ecology(g),start=s.previousP.slice(),end=g.evade.p.slice(),clock=s.clock,total=Math.min(dt,.25),count=Math.max(1,Math.ceil(total/.05)),sub=total/count,teleport=distance(start,end)>Math.max(2,total*8);
  if(teleport){e.graceUntil=clock+1;s.contactGraceUntil=clock+1;}
  base.step(g,dt,c);const finalClock=s.clock;
  for(let i=0;i<count;i++){
   s.clock=clock+(i+1)*sub;const a=teleport?end:[start[0]+(end[0]-start[0])*i/count,start[1],start[2]+(end[2]-start[2])*i/count],b=teleport?end:[start[0]+(end[0]-start[0])*(i+1)/count,end[1],start[2]+(end[2]-start[2])*(i+1)/count],contact=!teleport&&s.clock>=e.graceUntil;
   for(const key of ['injury','irritation'])if(e[key]){e[key].age+=sub;if(e[key].age>=e[key].duration)e[key]=null;}
   for(const n of e.crawlers)crawler(s,e,n,sub,c,a,b,contact);
   for(const n of e.mammals)mammal(s,e,n,sub,c,a,b,contact);
   for(const n of e.colonies)colony(s,e,n,sub,c,b,!!g.evade.crouch,contact);
   for(const group of Object.keys(CAPS))e[group]=e[group].filter(n=>distance(n.p,b)<=85);
  }
  s.clock=finalClock;spawn(s,e,g,c);return true;
 }
 function movementFactor(g){const s=g&&g.evade&&g.evade.wildlife,e=s&&s.ecology;if(!eligible(g)||!e)return base.movementFactor(g);const recovery=v=>v?1-(1-v.factor)*(1-clamp(v.age/v.duration,0,1)):1;return Math.min(base.movementFactor(g),recovery(e.injury),recovery(e.irritation));}
 function targets(g){
  const s=g&&g.evade&&g.evade.wildlife,e=s&&s.ecology;if(!active(g)||!e)return [];
  return e.mammals.map(n=>{const a=SPECS[n.kind];return {id:n.id,kind:n.kind,p:n.p.slice(),alive:true,armed:false,wildlife:true,length:a.length*n.scale,height:a.height*n.scale,bodyHeight:a.height*n.scale,width:a.width*n.scale,bodyWidth:a.width*n.scale};});
 }
 function weaponHit(g,id,options={}){
  if(!active(g)||!['pistol','knife'].includes(options.weapon))return false;
  const s=g.evade.wildlife,e=s&&s.ecology,n=e&&e.mammals.find(n=>n.id===id);if(!n)return false;
  n.defenseHits=Math.min(10,finite(n.defenseHits)+1);
  if(!n.defended){n.defended=true;n.spent=true;n.hit=true;n.speed=0;n.defenseWeapon=options.weapon;n.defendedAt=s.clock;setState(n,'recover');}
  return {id:n.id,kind:n.kind,weapon:options.weapon,retreat:true,state:n.state};
 }
 function view(g){
  const v=base.view(g),s=g&&g.evade&&g.evade.wildlife,e=s&&s.ecology;
  const animals=v.snakes.map(n=>({...n,phase:((n.phase/TAU)%1+1)%1,height:n.kind==='cobra'?.45:.1,moving:n.speed>.005,clip:n.state==='defensive'?'threat':n.speed>.005?'walk':'idle'}));
  if(v.active&&e)for(const n of e.mammals.concat(e.crawlers)){const a=SPECS[n.kind];animals.push({...n,p:n.p.slice(),length:a.length*n.scale,width:a.width*n.scale,height:a.height*n.scale,moving:n.speed>.005,clip:n.state==='warn'||n.state==='defensive'?'threat':n.speed>2.7?'run':n.speed>.005?'walk':'idle',actionPhase:n.state==='warn'?clamp(n.stateAge/a.windup,0,1):0,warning:n.state==='warn'});}
  const status=key=>v.active&&e&&e[key]?{...e[key],severity:1-clamp(e[key].age/e[key].duration,0,1)}:null;
  return {...v,animals,colonies:v.active&&e?e.colonies.map(n=>({...n,p:n.p.slice(),kind:'weaver-ants',height:.55,width:.75})):[],injury:status('injury'),irritation:status('irritation'),movementFactor:movementFactor(g)};
 }
 function restore(g,saved){
  if(!saved||!Number.isFinite(saved.clock)||!Number.isFinite(saved.rng))return false;
  let s;try{s=copy(saved);}catch(error){return false;}const e=s.ecology||fresh(s);
  if(e.version!==1)return false;
  for(const group of Object.keys(CAPS)){
   if(!Array.isArray(e[group])||e[group].length>CAPS[group])return false;
   for(let i=0;i<e[group].length;i++){
    const input=e[group][i],n=actor(input,i);if(!n||SPECS[n.kind].group!==group||group!=='colonies'&&(!Number.isFinite(input.yaw)||!STATES.has(input.state)))return false;
    for(const key of ['phase','speed','turn','rest','blocked','strikes','stateAge','warnedAt','encounterAge','chargeYaw','lastContact','lastBite','contact','activity','defenseHits','defendedAt'])if(input[key]!==undefined){if(!Number.isFinite(input[key]))return false;n[key]=input[key];}
    for(const key of ['noticed','spent','hit','defended'])if(input[key]!==undefined){if(typeof input[key]!=='boolean')return false;n[key]=input[key];}
    if(input.defenseWeapon!==undefined){if(!['pistol','knife'].includes(input.defenseWeapon))return false;n.defenseWeapon=input.defenseWeapon;}
    n.phase=((finite(n.phase)%1)+1)%1;if(group==='colonies'){n.activity=clamp(n.activity,0,1);n.contact=clamp(n.contact,0,5);}else{n.speed=clamp(n.speed,0,8);n.blocked=clamp(n.blocked,0,60);n.rest=clamp(n.rest,0,60);n.stateAge=clamp(n.stateAge,0,1e6);n.encounterAge=clamp(n.encounterAge,0,60);n.strikes=clamp(Math.floor(n.strikes),0,1e6);}
    e[group][i]=n;
   }
  }
  for(const key of ['injury','irritation'])if(e[key]){const v=e[key];if(!Number.isFinite(v.age)||v.age<0||!Number.isFinite(v.duration)||v.duration<=0||v.duration>60||!Number.isFinite(v.factor)||v.factor<.72||v.factor>1)return false;}
  for(const key of ['nextSpawn','rng','serial','spawns','lastHit','graceUntil'])if(!Number.isFinite(e[key]))return false;
  e.rng=e.rng>>>0||1;e.nextSpawn=clamp(e.nextSpawn,s.clock,s.clock+120);e.graceUntil=clamp(e.graceUntil,s.clock+.5,s.clock+2);e.lastHit=Math.min(e.lastHit,s.clock);e.serial=clamp(Math.floor(e.serial),0,1e9);e.spawns=clamp(Math.floor(e.spawns),0,1e9);
  s.ecology=e;if(!base.restore(g,s))return false;const current=g.evade.wildlife;current.contactGraceUntil=Math.max(current.clock+.5,finite(current.contactGraceUntil));return true;
 }
 root.Wildlife=Object.freeze({...base,enter,step,view,movementFactor,restore,eligible,active,targets,weaponHit,synchronize,limits:Object.freeze({...base.limits,maxMammals:CAPS.mammals,maxCrawlers:CAPS.crawlers,maxColonies:CAPS.colonies,kindCount:8,animalInjuryDuration:30,animalInjuryFactor:.82,antContactGrace:.9})});
})(typeof window!=='undefined'?window:globalThis);
