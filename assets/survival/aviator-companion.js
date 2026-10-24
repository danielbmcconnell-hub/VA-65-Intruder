/* The other surviving aviator keeps a real, independent parachute trajectory.
 * Reunion and assistance require physical proximity; this never moves a man to
 * the player, changes flight results, or places a companion in a POW chapter. */
(function(root){
  'use strict';
  const TAU=Math.PI*2,VERSION=1,MAX_DT=.25,STEP=.05,SWIM_STROKE=.60;
  const MODES=new Set(['descending','hung','falling','separated','searching','following','waiting','captured','rescued']);
  const ORDERS=new Set(['follow','wait']);
  const finite=(n,f=0)=>Number.isFinite(n)?n:f;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const point=p=>Array.isArray(p)&&p.length===3&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<1e7);
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  let context={},states=new WeakMap();const installed=new WeakSet();
  function configure(o){context={...context,...o};return true;}
  function hash(value){let n=2166136261;for(const c of String(value)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0||1;}
  function random(s){let n=s.rng>>>0;n^=n<<13;n^=n>>>17;n^=n<<5;s.rng=n>>>0||1;return s.rng/4294967296;}
  function floor(g,x,z){const f=context.terrainH;return typeof f==='function'?f(x,z):0;}
  function water(g,x,z){const L=context.LandingWater||root.LandingWater;if(L&&typeof L.surface==='function'){const value=L.surface(g,x,z);if(Number.isFinite(value))return value;}return 0;}
  function mission(g){return String(g&&g.mis&&g.mis.id||'ground')+':'+String(g&&g.mis&&g.mis.env&&g.mis.env.seed||'');}
  function historical(g){return !!(g&&g.mis&&(g.mis.escape||g.mis.id==='m11'));}
  function visible(g){const a=g&&g.app;return !!(g&&!g.pow&&!g.result&&!g._capturePending&&(!g.evade||!g.evade.camp&&!g.evade.river)&&(!a||(!a.game||a.game===g)&&(!a.screen||a.screen==='game')&&!a.graphicsContextLost)&&['chute','evade'].includes(g.phase));}
  function active(g){
    const d=root.document;if(!visible(g)||g.paused||d&&(d.hidden||d.visibilityState==='hidden')||g.evade&&g.evade.frozen)return false;
    if(g.phase==='evade'&&g.rend&&root.PhotoCutouts&&typeof root.PhotoCutouts.inspect==='function'&&root.PhotoCutouts.inspect(g.rend).status!=='ready')return false;
    return true;
  }
  function say(g,s,text,tone=''){if(s.clock-s.lastSpeech<4&&tone!=='bad')return false;s.lastSpeech=s.clock;if(g.app&&typeof g.app.radio==='function')g.app.radio(s.role==='pilot'?'PILOT':'B/N',text,tone);return true;}
  function begin(g,options={}){
    if(!g||!g.chute||!point(g.chute.p)||!g.ac||!g.ac.crew)return null;
    const role=g.rightSeat?'pilot':'bn',health=finite(g.ac.crew[role]);
    if(health<=0){states.delete(g);return null;}
    const seed=Number.isFinite(options.seed)?options.seed>>>0:hash(mission(g)+':'+g.chute.p.map(n=>n.toFixed(1)).join(':')+':'+finite(g.t).toFixed(2));
    const s={version:VERSION,mission:mission(g),role,rng:seed||1,clock:0,lastSpeech:-99,lastCall:-99,lastThreat:-99,reunited:false,known:false,order:'follow',mode:'descending',landedAt:null,injured:health<.5,injuryPersistent:health<.5,injuryAge:0,cableTime:0,helped:false,rescued:false,historical:historical(g),hang:null};
    const yaw=finite(g.ac.yaw),side=role==='bn'?1:-1,offset=[Math.cos(yaw)*side*.68,0,Math.sin(yaw)*side*.68];
    // Different canopy trim creates real variation in separation. Most starts
    // remain within a possible voice search; a minority can drift much farther.
    const close=random(s)<.7,spread=(close?.08+random(s)*.20:.45+random(s)*.55)*(random(s)<.5?-1:1),lead=role==='pilot'?.18:0,advance=role==='bn'?.18:0;
    const velocity=point(g.chute.v)?g.chute.v.slice():[0,12,0];
    // The B/N fires first. When the player occupies the pilot's seat, carry
    // that preceding 0.18-second trajectory forward instead of opening
    // two full canopies at the same centre point.
    s.chute={p:g.chute.p.map((n,i)=>n+offset[i]+velocity[i]*advance),v:velocity,open:advance*.7,t:advance-lead,drift:finite(g.chute.drift)+spread,lead,trim:.92+random(s)*.12};
    s.actor={id:'crew-'+role,kind:'aviator',companion:true,airborne:true,suspended:true,p:[s.chute.p[0],s.chute.p[1]-1.6,s.chute.p[2]],goal:s.chute.p.slice(),yaw:s.chute.drift,face:s.chute.drift,alive:true,armed:false,ph:random(s)*TAU,spd:0,moving:false,crouch:false,swimming:false,swimPhase:0};
    states.set(g,s);return view(g);
  }
  function sight(g,a,b){if(typeof context.lineOfSight==='function')return !!context.lineOfSight(g,a,b);if(typeof g._groundLineOfSight==='function'&&g.evade)return !!g._groundLineOfSight(a,b,g.evade);return true;}
  function placeHeight(g,n){const h=floor(g,n.p[0],n.p[2]),surface=water(g,n.p[0],n.p[2]);if(!Number.isFinite(h))return false;n.swimming=h<surface-.8;n.swimSurface=surface;n.p[1]=n.swimming?Math.max(h,surface-.42):h;return true;}
  function settle(g,s,speed){
    const n=s.actor,h=floor(g,n.p[0],n.p[2]),surface=water(g,n.p[0],n.p[2]);if(!Number.isFinite(h))return false;
    n.airborne=false;n.suspended=false;n.swimming=h<surface-.8;n.swimSurface=surface;n.p[1]=n.swimming?Math.max(h,surface-.42):h;
    s.chute=null;s.hang=null;s.mode='separated';s.landedAt=s.clock;s.landing=n.p.slice();
    if(speed>8){s.injured=true;s.injuryAge=0;}
    if(!s.historical)say(g,s,n.swimming?'I am in the water. I have my survival gear.':'I am on the ground. Looking for cover.',s.injured?'warn':'');
    return true;
  }
  function airborne(g,s,dt){
    const c=s.chute,n=s.actor;if(!c)return;
    c.t+=dt;if(c.t<0)return;
    if(s.mode==='hung'){
      s.hang.age+=dt;n.spd=0;n.moving=false;
      if(s.hang.age>=4){s.mode='falling';c.v=[0,-1.2,0];c.open=0;s.injured=s.injured||s.hang.branch;s.injuryAge=0;say(g,s,'The chute is caught. Cutting the risers and dropping clear.','warn');}
      return;
    }
    const before=c.p.slice();
    if(s.mode==='falling'){c.v[1]=Math.max(-16,c.v[1]-9.81*dt);c.v[0]*=Math.max(0,1-dt*.5);c.v[2]*=Math.max(0,1-dt*.5);}
    else{
      c.open=Math.min(1,c.open+dt*.7);const glide=c.open*4.5*c.trim;
      c.v[0]+=(Math.sin(c.drift)*glide-c.v[0])*Math.min(dt*.8,1);c.v[2]+=(-Math.cos(c.drift)*glide-c.v[2])*Math.min(dt*.8,1);
      c.v[1]+=((c.open>.5?-6.2:-38)-c.v[1])*Math.min(dt*1.4,1);
    }
    for(let i=0;i<3;i++)c.p[i]+=c.v[i]*dt;
    if(s.mode==='descending'){
      const L=context.LandingWater||root.LandingWater;
      if(L&&typeof L.collectTrees==='function'&&typeof L.canopyContact==='function'){
        const hit=L.canopyContact(before,c.p,{open:c.open,verticalSpeed:c.v[1]},L.collectTrees(g,before,c.p));
        if(hit&&point(hit.p)){
          c.p=hit.p.slice();
          // The harness hangs beside the trunk, as it does for the player.
          // Keeping a direct centre hit inside the wood made the companion
          // fall into the trunk collider and remain permanently unable to move.
          if(point(hit.tree&&hit.tree.p)){
            const t=hit.tree,dx=c.p[0]-t.p[0],dz=c.p[2]-t.p[2],radial=Math.hypot(dx,dz),clearance=finite(t.trunkRadius,.65)+.85;
            if(radial<clearance){const a=radial>.01?Math.atan2(dx,-dz):c.drift;c.p[0]=t.p[0]+Math.sin(a)*clearance;c.p[2]=t.p[2]-Math.cos(a)*clearance;}
          }
          c.v=[0,0,0];s.mode='hung';s.hang={age:0,branch:!!hit.branch,treeId:String(hit.tree&&hit.tree.id||'tree')};say(g,s,'I am hung up in a tree. Working the knife on the risers.','warn');
        }
      }
    }
    n.p=[c.p[0],c.p[1]-1.6,c.p[2]];n.yaw=c.drift;n.face=c.drift;
    const h=floor(g,c.p[0],c.p[2]),surface=water(g,c.p[0],c.p[2]);
    if(Number.isFinite(h)&&c.p[1]<=Math.max(h,surface)+1.6){n.p=[c.p[0],Math.max(h,surface),c.p[2]];settle(g,s,Math.abs(c.v[1]));}
  }
  function move(g,s,dt,target,speed){
    const n=s.actor,e=g.evade,dx=target[0]-n.p[0],dz=target[2]-n.p[2],d=Math.hypot(dx,dz);if(d<.18||speed<=0){n.spd=0;n.moving=false;return;}
    const wanted=Math.min(d,speed*dt),yaw=Math.atan2(dx,-dz),before=n.p.slice();let best=null,bestScore=-Infinity;
    const movement={...e,p:n.p,searchers:(e.searchers||[]).concat({p:e.p,alive:true}),_companionMoving:true};
    for(const turn of [0,.52,-.52,1.05,-1.05,1.57,-1.57]){
      const a=yaw+turn,mx=Math.sin(a)*wanted,mz=-Math.cos(a)*wanted;
      const result=typeof context.move==='function'?context.move(g,n.p[0],n.p[2],mx,mz,.35,movement):typeof g._moveOnFoot==='function'?g._moveOnFoot(n.p[0],n.p[2],mx,mz,.35,movement):[n.p[0]+mx,n.p[2]+mz];
      if(!Array.isArray(result)||result.length<2||!result.every(Number.isFinite)||Math.hypot(result[0]-n.p[0],result[1]-n.p[2])>wanted*1.05)continue;
      const h=floor(g,result[0],result[1]),surface=water(g,result[0],result[1]),oldFloor=floor(g,n.p[0],n.p[2]);if(!Number.isFinite(h)||!Number.isFinite(oldFloor)||h>surface+.15&&Math.abs(h-oldFloor)>.65)continue;
      const travelled=Math.hypot(result[0]-n.p[0],result[1]-n.p[2]);if(travelled<1e-6)continue;
      const score=d-Math.hypot(target[0]-result[0],target[2]-result[1])+travelled*.15-Math.abs(turn)*wanted*.03;
      if(score>bestScore){bestScore=score;best=[result[0],h,result[1]];}
      if(turn===0&&travelled>=wanted*.98)break;
    }
    if(best)n.p=best;
    const travel=distance(before,n.p);n.spd=travel/Math.max(dt,.001);n.moving=travel>1e-6;
    if(n.moving){n.yaw=Math.atan2(n.p[0]-before[0],-(n.p[2]-before[2]));n.face=n.yaw;n.swimPhase=(n.swimPhase+travel/SWIM_STROKE)%1;}
    const h=floor(g,n.p[0],n.p[2]),surface=water(g,n.p[0],n.p[2]);n.swimming=h<surface-.8;n.swimSurface=surface;n.p[1]=n.swimming?Math.max(h,surface-.42):h;
  }
  function ground(g,s,dt){
    const e=g.evade,n=s.actor;placeHeight(g,n);if(!e||!point(e.p)||s.historical||['captured','rescued'].includes(s.mode)){n.spd=0;n.moving=false;return;}
    const d=distance(n.p,e.p);s.injuryAge+=dt;n.crouch=!!e.crouch&&!n.swimming;
    if(!s.reunited&&d<32&&sight(g,n.p,e.p)){s.known=true;s.mode='searching';}
    if(!s.reunited&&d<7&&sight(g,n.p,e.p)){s.reunited=true;s.known=true;s.mode='following';s.order='follow';say(g,s,'There you are. Stay low. We will move together.');}
    let target=n.p,speed=0;
    if(s.reunited&&s.order==='follow'){
      const hdg=finite(e.hdg),side=s.role==='bn'?1:-1;
      target=[e.p[0]-Math.sin(hdg)*2.7+Math.cos(hdg)*side*.8,n.p[1],e.p[2]+Math.cos(hdg)*2.7+Math.sin(hdg)*side*.8];
      speed=distance(n.p,target)>1.1?(d>8?3.05:1.45):0;s.mode='following';
    }else if(s.reunited){s.mode='waiting';}
    else if(s.known){target=e.p.slice();speed=d>9?2.2:1.25;s.mode='searching';}
    else if(s.landing){const angle=finite(s.actor.ph)+s.clock*.055;target=[s.landing[0]+Math.sin(angle)*12,n.p[1],s.landing[2]+Math.cos(angle)*12];speed=.62;}
    if(n.swimming)speed=Math.min(speed,.88);if(n.crouch)speed=Math.min(speed,.85);if(s.injured&&(s.injuryPersistent||s.injuryAge<90))speed*=.67;
    n.goal=target.slice();move(g,s,dt,target,speed);
    const J=e.jolly;
    if(s.reunited&&J&&J.down&&J.hoist>.7&&point(J.p)&&distance(n.p,J.p)<9)s.cableTime=Math.min(4,s.cableTime+dt);
    else s.cableTime=Math.max(0,s.cableTime-dt*.8);
    for(const enemy of (e.searchers||[]).concat(e.locals||[])){
      if(!enemy||enemy.alive===false||enemy.armed===false||!point(enemy.p))continue;
      const near=distance(n.p,enemy.p);if(near<20&&s.reunited&&s.clock-s.lastThreat>14&&sight(g,n.p,enemy.p)){s.lastThreat=s.clock;say(g,s,'Movement in the trees. Keep down and watch that patrol.','warn');}
      if(near<1.15&&d>10&&(finite(enemy.seen)>.5||enemy.state==='pursuit')&&sight(g,n.p,enemy.p)){s.mode='captured';n.moving=false;n.spd=0;say(g,s,'They have reached me. Keep clear.','bad');break;}
    }
  }
  function step(g,dt){
    const s=g&&states.get(g);if(!s||!active(g)||!Number.isFinite(dt)||dt<=0)return false;
    const total=Math.min(MAX_DT,dt),count=Math.max(1,Math.ceil(total/STEP)),sub=total/count;
    for(let i=0;i<count;i++){s.clock+=sub;if(s.chute)airborne(g,s,sub);else ground(g,s,sub);}return true;
  }
  function command(g,name){
    const s=g&&states.get(g),e=g&&g.evade;if(!s||!active(g)||!e||s.chute||s.historical||['captured','rescued'].includes(s.mode))return false;
    if(name==='call'){
      if(s.clock-s.lastCall<8)return false;s.lastCall=s.clock;e.noise=Math.max(finite(e.noise),.4);
      if(distance(s.actor.p,e.p)<75&&sight(g,s.actor.p,e.p)){s.known=true;s.mode=s.reunited?s.mode:'searching';say(g,s,'I hear you. Moving toward your voice.');}else if(g.app&&typeof g.app.radio==='function')g.app.radio('CREW','Calling for the other aviator. No answer yet.','warn');
      return true;
    }
    if(!s.reunited||!ORDERS.has(name))return false;s.order=name;s.mode=name==='wait'?'waiting':'following';say(g,s,name==='wait'?'Holding here. Signal when you want me to move.':'Following. Keep a little space between us.');return true;
  }
  function harnessReady(g){
    const C=root.PhotoCutouts;if(!g||!g.rend||!C||typeof C.hasPose!=='function')return false;
    if(C.hasPose(g.rend,'aviator','harness'))return true;
    if(typeof C.preparePose==='function')C.preparePose(g.rend,'aviator','harness');
    return false;
  }
  function actors(g){
    const s=g&&states.get(g);if(!visible(g)||!s||s.historical||['captured','rescued'].includes(s.mode))return [];
    if(s.chute&&!(s.chute.t>=0&&(s.mode==='falling'||s.chute.open>=.42)&&harnessReady(g)))return [];
    return [s.actor];
  }
  function blockedAt(g,x,z,radius=.28,e){
    const s=g&&states.get(g);if(!s||!actors(g).length||s.chute||e&&e._companionMoving||!Number.isFinite(x)||!Number.isFinite(z))return false;
    const reach=clamp(finite(radius,.28),0,2)+.35,d=Math.hypot(x-s.actor.p[0],z-s.actor.p[2]);
    if(e&&point(e.p)){const old=distance(e.p,s.actor.p);if(old<reach&&d>=old)return false;}
    return d<reach;
  }
  function instances(g,push){
    const s=g&&states.get(g),c=s&&s.chute;if(!visible(g)||!c||c.t<0||typeof push!=='function')return 0;
    if(s.mode==='falling'){
      if(!s.historical&&harnessReady(g))return 0;
      push('chuteBody',[c.p[0],c.p[1]+4.6,c.p[2]],[c.drift,0,0],[1,1,1],[1,1,1,0]);return 1;
    }
    if(c.open<.42)push('chuteStream',[c.p[0],c.p[1]+2.2+c.open*3.4,c.p[2]],[c.drift,-Math.PI/2,0],[1,.7+c.open,1],[1,1,1,0]);
    else{const bl=clamp((c.open-.42)/.4,0,1);push(!s.historical&&harnessReady(g)?'chuteEmpty':'chute',[c.p[0],c.p[1]+4.6,c.p[2]],[c.drift,0,Math.sin(s.clock*.8)*.045],[bl,.55+bl*.45,bl],[1,1,1,0]);}
    return 1;
  }
  function assistance(g){const s=g&&states.get(g),e=g&&g.evade;return !!(visible(g)&&s&&s.reunited&&s.order==='follow'&&!s.chute&&!['captured','rescued'].includes(s.mode)&&e&&distance(s.actor.p,e.p)<3.2&&!s.actor.swimming);}
  function movementFactor(g){const e=g&&g.evade;if(!assistance(g)||!e)return 1;const L=context.LandingWater||root.LandingWater,injured=!!e.hurt||!!(L&&typeof L.movementFactor==='function'&&L.movementFactor(g)<1);return injured?1.08:1;}
  function prepareRescue(g){
    const s=g&&states.get(g),e=g&&g.evade,J=e&&e.jolly;if(!s)return false;
    const recovered=!!(visible(g)&&s.reunited&&!s.chute&&!['captured','rescued'].includes(s.mode)&&J&&J.down&&J.hoist>.7&&point(J.p)&&distance(s.actor.p,J.p)<9&&s.cableTime>=3.4-1e-8);
    s.rescued=recovered;if(recovered){s.mode='rescued';s.actor.moving=false;s.actor.spd=0;}g.companionRescued=recovered;return recovered;
  }
  function rescueLine(g){const s=g&&states.get(g);return s&&s.rescued?'Both crewmen are on the cable. Going home.':s?'We have you. The other aviator has not reached this pickup.':'We have you. Going home.';}
  function view(g){const s=g&&states.get(g);if(!s)return {active:false,mode:'none',reunited:false,known:false,actors:[],chute:null};const show=visible(g);return {active:show,mode:s.mode,role:s.role,historical:s.historical,reunited:s.reunited,known:s.known,order:s.order,injured:s.injured&&(s.injuryPersistent||s.injuryAge<90),rescued:s.rescued,clock:s.clock,distance:show&&g.evade&&s.known?distance(s.actor.p,g.evade.p):null,canCall:show&&!s.chute&&!s.historical&&!['captured','rescued'].includes(s.mode)&&s.clock-s.lastCall>=8,assisting:assistance(g),actors:actors(g).map(n=>({...n,p:n.p.slice(),goal:n.goal.slice()})),chute:show&&s.chute?{...s.chute,p:s.chute.p.slice(),v:s.chute.v.slice()}:null};}
  function snapshot(g){const s=g&&states.get(g);return s?JSON.parse(JSON.stringify(s)):null;}
  function restore(g,saved){
    if(!g||!saved||saved.version!==VERSION||saved.mission!==mission(g)||saved.role!==(g.rightSeat?'pilot':'bn')||!(g.ac&&g.ac.crew&&g.ac.crew[saved.role]>0)||!MODES.has(saved.mode)||!ORDERS.has(saved.order)||!saved.actor||saved.actor.kind!=='aviator'||!point(saved.actor.p)||!point(saved.actor.goal)||!Number.isFinite(saved.clock)||saved.clock<0||!Number.isFinite(saved.rng))return false;
    if(['descending','hung','falling'].includes(saved.mode)!==!!saved.chute||saved.landing&&!point(saved.landing))return false;
    if(saved.mode==='hung'&&(!saved.hang||!Number.isFinite(saved.hang.age)||saved.hang.age<0))return false;
    if(saved.chute&&(!point(saved.chute.p)||!point(saved.chute.v)||![saved.chute.t,saved.chute.open,saved.chute.drift,saved.chute.trim].every(Number.isFinite)||saved.chute.open<0||saved.chute.open>1||saved.chute.trim<.7||saved.chute.trim>1.3||saved.chute.t<-.25))return false;
    const s=JSON.parse(JSON.stringify(saved));s.rng=s.rng>>>0||1;s.clock=clamp(s.clock,0,1e7);s.injuryPersistent=!!s.injuryPersistent;s.injuryAge=clamp(finite(s.injuryAge),0,1e7);s.cableTime=clamp(finite(s.cableTime),0,4);s.actor.alive=true;s.actor.armed=false;s.actor.companion=true;s.actor.airborne=!!s.chute;s.actor.suspended=!!s.chute;s.actor.spd=0;s.actor.moving=false;s.actor.swimPhase=clamp(finite(s.actor.swimPhase),0,1);s.lastCall=Math.min(finite(s.lastCall,-99),s.clock);s.lastSpeech=Math.min(finite(s.lastSpeech,-99),s.clock);s.lastThreat=Math.min(finite(s.lastThreat,-99),s.clock);s.historical=historical(g);states.set(g,s);return true;
  }
  function hud(g){
    const d=root.document;if(!d||typeof d.createElement!=='function')return;let node=d.getElementById('companionStatus');
    if(!node){const stack=d.getElementById('stack');if(!stack)return;node=d.createElement('aside');node.id='companionStatus';node.dataset.minimized='1';node.style.cssText='position:absolute;left:12px;bottom:180px;max-width:min(300px,calc(100% - 200px));z-index:18;padding:8px 10px;background:rgba(6,13,16,.86);border-left:2px solid #a8a67d;color:#e5e8df;font:12px/1.35 Arial,sans-serif;pointer-events:auto';node.innerHTML='<button type="button" data-companion-line style="border:0;background:transparent;color:inherit;text-align:left;padding:0"></button><div data-companion-actions style="gap:5px;flex-wrap:wrap;margin-top:6px" hidden></div>';stack.appendChild(node);
      for(const [name,label]of [['call','Call crewmate'],['follow','Follow'],['wait','Wait'],['hide','Hide']]){const b=d.createElement('button');b.type='button';b.dataset.companion=name;b.textContent=label;b.style.cssText='min-height:36px;padding:4px 8px';b.onclick=()=>{if(name==='hide'){node.dataset.minimized='1';const actions=node.querySelector('[data-companion-actions]');actions.hidden=true;actions.style.display='none';node.querySelector('[data-companion-line]').textContent='Crewmate · tap to expand';}else command(context.App&&context.App.game||g,name);};node.querySelector('[data-companion-actions]').appendChild(b);}node.querySelector('[data-companion-line]').onclick=()=>{const actions=node.querySelector('[data-companion-actions]');if(node.dataset.minimized){delete node.dataset.minimized;actions.hidden=false;actions.style.display='flex';}else{node.dataset.minimized='1';actions.hidden=true;actions.style.display='none';}};}
    const v=view(g);node.hidden=!v.active||v.historical||v.mode==='descending'||v.mode==='falling';if(node.hidden)return;if(node.dataset.minimized){node.querySelector('[data-companion-line]').textContent=v.mode==='captured'?'Crewmate captured · tap to expand':v.reunited?'Crewmate nearby · tap to expand':'Find crewmate · tap to expand';return;}
    const line=v.mode==='hung'?'The other aviator is caught in the trees.':v.mode==='captured'?'Your crewmate was caught by a patrol.':v.reunited?(v.order==='wait'?'Crewmate holding position.':'Crewmate following.')+(v.injured?' He is injured and moving slowly.':''):v.known?'Your crewmate is moving toward you.':'The other aviator landed separately. Call out when it is safe.';
    node.querySelector('[data-companion-line]').textContent=line;
    for(const b of node.querySelectorAll('[data-companion]')){const k=b.dataset.companion;b.disabled=k==='call'?!v.canCall:['follow','wait'].includes(k)?!v.reunited||['captured','rescued'].includes(v.mode):false;}
  }
  function install(o){
    configure(o);const G=o&&o.Game;if(!G||!G.prototype||installed.has(G))return false;installed.add(G);const proto=G.prototype,eject=proto.eject,update=proto.update,rescue=proto.rescued,blocked=proto._blockedAt,sync=proto.syncControls;
    if(typeof eject==='function')proto.eject=function(){const was=!!this.ejected,result=eject.apply(this,arguments);if(!was&&this.ejected&&this.chute)begin(this);return result;};
    if(typeof update==='function')proto.update=function(dt){step(this,dt);return update.apply(this,arguments);};
    if(typeof rescue==='function')proto.rescued=function(){prepareRescue(this);return rescue.apply(this,arguments);};
    if(typeof blocked==='function')proto._blockedAt=function(x,z,r,e){return blocked.apply(this,arguments)||blockedAt(this,x,z,r,e);};
    if(typeof sync==='function')proto.syncControls=function(){const result=sync.apply(this,arguments);hud(this);return result;};return true;
  }
  root.AviatorCompanion=Object.freeze({configure,install,begin,step,command,actors,instances,blockedAt,view,snapshot,restore,assistance,movementFactor,prepareRescue,rescueLine,limits:Object.freeze({maxCompanions:1,maxStep:MAX_DT,reunionDistance:7,visualSearchDistance:32,callDistance:75,callCooldown:8,followDistance:2.7,helpDistance:3.2,maxMovementHelp:1.08,swimStrokeMetres:SWIM_STROKE})});
})(typeof window!=='undefined'?window:globalThis);
