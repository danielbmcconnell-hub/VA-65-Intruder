/* Simulation-driven presentation of the existing first-person equipment art.
 * Actual resolved walking distance drives gait; accepted action timestamps drive
 * recoil/strikes. This never changes artwork, weapons, actors, camera or saves. */
(function(root){
  'use strict';
  const states=new WeakMap(), TAU=Math.PI*2, RATE=12;
  const LIMITS=Object.freeze({maxStep:.25,maxGaitOffset:12,maxAttackOffset:34,maxRotation:4,maxScale:1.06,timers:0});
  let context=null, motionQuery;
  const finite=(n,otherwise=0)=>Number.isFinite(n)?n:otherwise;
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
  const mode=g=>g.evade.weaponMode||(g.evade.drawn?'pistol':'fists');
  const reduced=()=>{if(motionQuery===undefined)motionQuery=typeof root.matchMedia==='function'?root.matchMedia('(prefers-reduced-motion: reduce)'):null;return !!(motionQuery&&motionQuery.matches);};
  const appFor=g=>context&&context.App||g&&g.app;
  function eligible(g){return !!(g&&g.evade&&!g.pow&&point(g.evade.p)&&(!g.phase||g.phase==='evade')&&!g.evade.frozen&&!g.evade.handsUp&&!g.result);}
  function owned(g){const a=appFor(g);return !a||a.game===undefined||a.game===g;}
  function active(g){const a=appFor(g),d=root.document;return eligible(g)&&owned(g)&&!g.paused&&!g.evade.held&&!g._solitaryActive&&(!a||(!a.screen||a.screen==='game')&&!a.graphicsContextLost)&&!(d&&(d.hidden||d.visibilityState==='hidden'));}
  function fresh(g){return {actor:g.evade,p:g.evade.p.slice(0,3),clock:0,phase:0,gait:0,amplitude:0,run:0,crouch:0,speed:0,distance:0,steps:0,mode:mode(g),drawAge:.2,action:null,actionAge:1,actionMode:mode(g),pulses:0,reduced:reduced()};}
  function state(g){let s=states.get(g);if(!s||s.actor!==g.evade){s=fresh(g);states.set(g,s);}return s;}
  function step(g,dt,actualDistance){
    if(!eligible(g)){if(g)states.delete(g);return false;}
    if(!owned(g)){states.delete(g);return false;}
    const s=state(g);
    if(!active(g)||!Number.isFinite(dt)||dt<=0)return false;
    const elapsed=Math.min(dt,LIMITS.maxStep),p=g.evade.p;
    const delta=Math.hypot(p[0]-s.p[0],p[2]-s.p[2]);
    const distance=Number.isFinite(actualDistance)&&actualDistance>=0?actualDistance:delta;
    const discontinuity=delta>Math.max(2,elapsed*8)||distance>Math.max(2,elapsed*8);
    if(discontinuity){const replacement=fresh(g);states.set(g,replacement);return false;}
    s.p=p.slice(0,3);s.clock+=elapsed;s.steps++;s.reduced=reduced();
    const speed=distance/Math.max(dt,.000001),moving=distance>.00001;
    const e=g.evade,run=!!(e.running&&moving),crouch=!!e.crouch;
    const ease=1-Math.exp(-RATE*elapsed);
    s.speed=speed;s.distance+=distance;
    s.gait+=(+(moving)-s.gait)*ease;
    s.run+=(+(run)-s.run)*ease;s.crouch+=(+(crouch)-s.crouch)*ease;
    const target=moving?clamp(speed/2.1,0,run?1.45:1):0;
    s.amplitude+=(target-s.amplitude)*ease;
    if(moving){const stride=run?1.3:crouch?.56:.82;s.phase=(s.phase+distance*Math.PI/stride)%TAU;}
    if(s.amplitude<.00001)s.amplitude=0;
    const selected=mode(g);
    if(selected!==s.mode){s.mode=selected;s.drawAge=0;}else s.drawAge=Math.min(.2,s.drawAge+elapsed);
    const action=g.evade.actionT,now=finite(g.t,s.clock);
    if(Number.isFinite(action)&&action>=0&&action!==s.action&&now>=action&&now-action<=.6){
      s.action=action;s.actionAge=0;s.actionMode=s.mode;s.pulses++;
    }else s.actionAge=Math.min(1,s.actionAge+elapsed);
    return true;
  }
  function pose(s){
    const quiet=s.reduced?0:1,walk=s.amplitude*quiet*(1-s.crouch*.58);
    const breathe=(1-clamp(s.gait,0,1))*.95*quiet*(s.mode==='pistol'?.55:1);
    let x=Math.sin(s.phase)*3.4*walk,y=Math.cos(s.phase*2)*2.8*walk+Math.sin(s.clock*TAU/3.1)*breathe;
    let rotation=Math.sin(s.phase)*.52*walk,scale=1;
    const duration=s.actionMode==='pistol'?.22:.31,age=s.actionAge;
    if(age<duration){
      const n=clamp(age/duration,0,1),peak=s.actionMode==='pistol'?.22:.34;
      const pulse=n<peak?Math.sin(n/peak*Math.PI*.5):Math.pow(Math.cos((n-peak)/(1-peak)*Math.PI*.5),2);
      const strength=s.reduced?.22:1;
      if(s.actionMode==='pistol'){y-=10*pulse*strength;x+=1.2*pulse*strength;rotation-=2.1*pulse*strength;scale+=.015*pulse*strength;}
      else{y-=31*pulse*strength;x-=3.4*pulse*strength;rotation-=2.4*pulse*strength;scale+=.045*pulse*strength;}
    }
    const draw=1-clamp(s.drawAge/.2,0,1);y+=18*draw*draw*(s.reduced?.3:1);
    x=clamp(x,-LIMITS.maxGaitOffset,LIMITS.maxGaitOffset);y=clamp(y,-LIMITS.maxAttackOffset,24);rotation=clamp(rotation,-LIMITS.maxRotation,LIMITS.maxRotation);scale=clamp(scale,1,LIMITS.maxScale);if(!x)x=0;if(!y)y=0;if(!rotation)rotation=0;
    return {x,y,rotation,scale,transform:'translate('+x.toFixed(3)+'px,'+y.toFixed(3)+'px) rotate('+rotation.toFixed(3)+'deg) scale('+scale.toFixed(4)+')'};
  }
  function render(g,view,art){
    if(!g||!view||!art)return false;
    if(!eligible(g)||!owned(g)){if(g)states.delete(g);view.style.display='none';return false;}
    const a=appFor(g);if(a&&a.screen&&a.screen!=='game'){view.style.display='none';return false;}
    const s=state(g),p=pose(s);
    // Backstop during incremental integration: the removed CSS animations
    // cannot continue underneath this distance/simulation-driven transform.
    if(art.style.animation!=='none')art.style.animation='none';
    if(art.style.transform!==p.transform)art.style.transform=p.transform;
    view.classList.remove('walking','attacking');
    if(view.dataset)view.dataset.equipmentState=s.actionAge<(s.actionMode==='pistol'?.22:.31)?'attack':s.amplitude>.02?s.run>.5?'run':s.crouch>.5?'crouch':'walk':'idle';
    return true;
  }
  function inspect(g){if(!eligible(g))return null;const s=states.get(g);if(!s)return null;return {active:active(g),clock:s.clock,phase:s.phase,gait:s.gait,amplitude:s.amplitude,speed:s.speed,distance:s.distance,steps:s.steps,mode:s.mode,action:s.action,actionAge:s.actionAge,pulses:s.pulses,reduced:s.reduced,drawAge:s.drawAge,...pose(s)};}
  function reset(g){return !!g&&states.delete(g);}
  function install(c){if(context||!c||!c.App)return false;context=c;return true;}
  root.EquipmentView=Object.freeze({install,step,render,inspect,reset,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);
