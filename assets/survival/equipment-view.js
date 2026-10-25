/* Simulation-driven presentation of the existing first-person equipment art.
 * Actual resolved walking distance drives gait; accepted action timestamps drive
 * recoil/strikes. This never changes artwork, weapons, actors, camera or saves. */
(function(root){
  'use strict';
  const states=new WeakMap(), TAU=Math.PI*2, RATE=12;
  const LIMITS=Object.freeze({maxStep:.25,maxGaitOffset:12,maxAttackOffset:34,maxRotation:4,maxScale:1.06,timers:0,handFrames:8,handSheets:2});
  let context=null, motionQuery;
  let handUI=null;
  const handArt={left:'assets/firstperson/punch-left.webp',right:'assets/firstperson/punch-right.webp'},handImages={};
  const equipmentArt={fists:'assets/firstperson/fists.png',pistol:'assets/firstperson/pistol.png',knife:'assets/firstperson/knife.png',stick:'assets/firstperson/stick.webp',rifle:'assets/firstperson/rifle.webp'};
  // Authored complete-arm cells: guarded start, accelerating extension, contact,
  // and a longer recovery. A sheet is never cut into a new image or repainted.
  const handEnds=Object.freeze([.035,.065,.09,.115,.16,.25,.35,.46]);
  const finite=(n,otherwise=0)=>Number.isFinite(n)?n:otherwise;
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
  const mode=g=>g.evade.weaponMode||(g.evade.drawn?'pistol':'fists');
  const firearm=selected=>selected==='pistol'||selected==='rifle';
  const reduced=()=>{if(motionQuery===undefined)motionQuery=typeof root.matchMedia==='function'?root.matchMedia('(prefers-reduced-motion: reduce)'):null;return !!(motionQuery&&motionQuery.matches);};
  const appFor=g=>context&&context.App||g&&g.app;
  function powEquipment(g){return !!(g&&g.pow&&!['cell','compound','solitary','regular'].includes(g.pow.stage)&&mode(g)!=='fists'&&handsEligible(g)&&handOwnership(g).right);}
  function twoHandConflict(g){const slots=handOwnership(g);return mode(g)==='rifle'&&slots.left&&slots.left!=='rifle';}
  function eligible(g){return !!(g&&g.evade&&(!g.pow||powEquipment(g))&&!twoHandConflict(g)&&point(g.evade.p)&&(!g.phase||g.phase==='evade')&&!g.evade.frozen&&!g.evade.handsUp&&!g.result&&!g.evade.swimming&&!(root.LandingWater&&typeof root.LandingWater.swimming==='function'&&root.LandingWater.swimming(g)));}
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
    const breathe=(1-clamp(s.gait,0,1))*.95*quiet*(s.mode==='rifle'?.45:s.mode==='pistol'?.55:1);
    let x=Math.sin(s.phase)*3.4*walk,y=Math.cos(s.phase*2)*2.8*walk+Math.sin(s.clock*TAU/3.1)*breathe;
    let rotation=Math.sin(s.phase)*.52*walk,scale=1;
    const duration=firearm(s.actionMode)?.22:.31,age=s.actionAge;
    if(age<duration){
      const n=clamp(age/duration,0,1),peak=firearm(s.actionMode)?.22:.34;
      const pulse=n<peak?Math.sin(n/peak*Math.PI*.5):Math.pow(Math.cos((n-peak)/(1-peak)*Math.PI*.5),2);
      const strength=s.reduced?.22:1;
      if(firearm(s.actionMode)){const rifle=s.actionMode==='rifle';y-=(rifle?8:10)*pulse*strength;x+=(rifle?.8:1.2)*pulse*strength;rotation-=(rifle?1.2:2.1)*pulse*strength;scale+=(rifle?.010:.015)*pulse*strength;}
      else{y-=31*pulse*strength;x-=3.4*pulse*strength;rotation-=2.4*pulse*strength;scale+=.045*pulse*strength;}
    }
    const draw=1-clamp(s.drawAge/.2,0,1);y+=18*draw*draw*(s.reduced?.3:1);
    x=clamp(x,-LIMITS.maxGaitOffset,LIMITS.maxGaitOffset);y=clamp(y,-LIMITS.maxAttackOffset,24);rotation=clamp(rotation,-LIMITS.maxRotation,LIMITS.maxRotation);scale=clamp(scale,1,LIMITS.maxScale);if(!x)x=0;if(!y)y=0;if(!rotation)rotation=0;
    return {x,y,rotation,scale,transform:'translate('+x.toFixed(3)+'px,'+y.toFixed(3)+'px) rotate('+rotation.toFixed(3)+'deg) scale('+scale.toFixed(4)+')'};
  }
  function handFrame(age){if(!Number.isFinite(age)||age<0||age>=handEnds[7])return 0;const frame=handEnds.findIndex(end=>age<end);return frame<0?0:frame;}
  function punchRecord(g){return root.GroundCombat&&typeof root.GroundCombat.inspectPunch==='function'?root.GroundCombat.inspectPunch(g):null;}
  function handOwnership(g){
    if(root.GroundCombat&&typeof root.GroundCombat.hands==='function')return root.GroundCombat.hands(g);
    const selected=mode(g),right=selected==='fists'?null:selected;
    return {left:selected==='rifle'?'rifle':null,right};
  }
  function handsEligible(g){
    if(!g||!g.evade||!point(g.evade.p)||g.phase&&g.phase!=='evade'||g.result||g.evade.frozen||g.evade.handsUp||g.evade.held||g._solitaryActive||g._capturePending||g.evade.swimming||!owned(g))return false;
    if(root.LandingWater&&typeof root.LandingWater.swimming==='function'&&root.LandingWater.swimming(g))return false;
    const a=appFor(g);if(a&&(a.screen&&a.screen!=='game'||a.graphicsContextLost))return false;
    if(g.pow){
      if(g.pow.complete||g.pow.modalOpen||g.pow.traversal||g.pow.holding||g.pow.captivity&&g.pow.captivity.open)return false;
      const p=root.POW;if(p&&p.Mindscape&&typeof p.Mindscape.active==='function'&&p.Mindscape.active(g))return false;
      if(p&&p.EpisodeActions&&typeof p.EpisodeActions.view==='function'&&p.EpisodeActions.view(g).active)return false;
      if(g.pow.river&&!['bank','hidden'].includes(g.pow.river.mode))return false;
    }
    return true;
  }
  function handPose(g,side){
    const slots=handOwnership(g),record=punchRecord(g),action=record&&record[side],s=states.get(g),quiet=reduced()?0.25:1;
    const visible=handsEligible(g)&&!slots[side]&&!!(action||!g.pow&&mode(g)==='fists');
    const age=action?action.age:Infinity,frame=action?handFrame(age):0;
    // Smooth whole-cell placement complements the eight genuinely distinct
    // drawings; no alpha crossfade produces two simultaneous fists.
    let extension=0;
    if(action){
      const times=[0,.045,.115,.165,.46],values=[0,-.06,1,.78,0];
      for(let i=1;i<times.length;i++)if(age<=times[i]){const t=clamp((age-times[i-1])/(times[i]-times[i-1]),0,1),ease=t*t*(3-2*t);extension=values[i-1]+(values[i]-values[i-1])*ease;break;}
    }
    const direction=side==='right'?-1:1,gait=s&&!s.reduced?s.amplitude*(1-s.crouch*.58):0;
    const x=direction*18*extension*quiet+(s?Math.sin(s.phase+(side==='left'?Math.PI:0))*.38*gait:0);
    const y=-9*extension*quiet+(s?Math.cos(s.phase*2)*.3*gait:0),rotation=direction*4*extension*quiet;
    return {side,visible,item:slots[side],active:!!action,id:action&&action.id||null,age:action?action.age:null,frame,
      source:handArt[side],x,y,rotation,scale:1+Math.max(0,extension)*.06*quiet,
      backgroundPosition:(frame%4*100/3).toFixed(5)+'% '+(Math.floor(frame/4)*100)+'%',
      transform:'translate('+x.toFixed(3)+'vh,'+y.toFixed(3)+'vh) rotate('+rotation.toFixed(3)+'deg) scale('+(1+Math.max(0,extension)*.06*quiet).toFixed(4)+')'};
  }
  function inspectHands(g){if(!g||!g.evade)return null;return {eligible:handsEligible(g),left:handPose(g,'left'),right:handPose(g,'right'),timeline:handEnds.slice(),columns:4,rows:2};}
  function preloadHand(side){
    if(handImages[side]&&handImages[side].src===handArt[side])return handImages[side].image;
    if(typeof root.Image!=='function')return null;
    const image=new root.Image();image.src=handArt[side];handImages[side]={src:handArt[side],image};return image;
  }
  function configureHands(paths){
    if(!paths||typeof paths!=='object')return false;
    let changed=false;for(const side of ['left','right'])if(typeof paths[side]==='string'&&paths[side]&&paths[side]!==handArt[side]){handArt[side]=paths[side];delete handImages[side];changed=true;}
    return changed;
  }
  function weaponArt(selected){return typeof selected==='string'&&Object.prototype.hasOwnProperty.call(equipmentArt,selected)?equipmentArt[selected]:null;}
  function configureEquipment(paths){
    if(!paths||typeof paths!=='object')return false;
    let changed=false;for(const selected of Object.keys(equipmentArt))if(typeof paths[selected]==='string'&&paths[selected]&&paths[selected]!==equipmentArt[selected]){equipmentArt[selected]=paths[selected];changed=true;}
    return changed;
  }
  function ensureHands(parent){
    const d=root.document;if(!d||typeof d.createElement!=='function')return null;
    parent=parent||d.getElementById('stack');if(!parent)return null;
    if(handUI&&handUI.parent===parent)return handUI;
    if(handUI&&handUI.root&&typeof handUI.root.remove==='function')handUI.root.remove();
    const overlay=d.createElement('div');overlay.id='equipmentHands';overlay.setAttribute('aria-hidden','true');
    Object.assign(overlay.style,{display:'none',position:'absolute',inset:'0',pointerEvents:'none',zIndex:'7',overflow:'hidden'});
    const arms={};
    for(const side of ['left','right']){
      const arm=d.createElement('div');arm.dataset.punchHand=side;
      // The sleeve remains beyond the screen edge even at full extension;
      // lifting a shorter square would expose a floating flat forearm end.
      Object.assign(arm.style,{position:'absolute',bottom:'max(-11.52vw,-15.36vh)',width:'min(48vw,64vh)',height:'min(48vw,64vh)',backgroundRepeat:'no-repeat',backgroundSize:'400% 200%',transformOrigin:side==='left'?'0% 100%':'100% 100%',filter:'drop-shadow(0 2px 3px rgba(0,0,0,.25))'});
      arm.style[side]='max(0px,calc(50% - 64vh))';overlay.appendChild(arm);arms[side]=arm;preloadHand(side);
    }
    parent.appendChild(overlay);handUI={root:overlay,parent,arms};return handUI;
  }
  function renderHands(g,parent){
    const ui=ensureHands(parent),descriptor=inspectHands(g);if(!ui)return {visible:false,replacesFists:false,descriptor};
    let visible=0,ready=0;
    for(const side of ['left','right']){
      const p=descriptor&&descriptor[side],arm=ui.arms[side],image=preloadHand(side),decoded=!!(image&&image.complete&&image.naturalWidth>0&&image.naturalHeight>0);
      if(decoded)ready++;
      arm.style.display=p&&p.visible&&decoded?'block':'none';
      if(p){arm.style.backgroundImage='url("'+p.source.replace(/["\\\n\r]/g,'')+'")';arm.style.backgroundPosition=p.backgroundPosition;arm.style.transform=p.transform;arm.dataset.frame=String(p.frame);arm.dataset.action=p.active?'punch':'guard';arm.dataset.owner=p.item||'empty';if(p.visible&&decoded)visible++;}
    }
    ui.root.style.display=visible?'block':'none';
    return {visible:visible>0,replacesFists:!!(g&&g.evade&&mode(g)==='fists'&&descriptor&&descriptor.eligible&&ready===2),descriptor};
  }
  function render(g,view,art){
    if(!g||!view||!art)return false;
    const handLayer=renderHands(g,view.parentNode);
    // The paired original remains an untouched loading fallback; independent
    // arm sheets replace it only after both full sheets have decoded.
    art.style.visibility=handLayer.replacesFists?'hidden':'';
    if(!eligible(g)||!owned(g)){if(g)states.delete(g);view.style.display='none';return false;}
    const a=appFor(g);if(a&&a.screen&&a.screen!=='game'){view.style.display='none';return false;}
    const s=state(g),p=pose(s);
    // Backstop during incremental integration: the removed CSS animations
    // cannot continue underneath this distance/simulation-driven transform.
    if(art.style.animation!=='none')art.style.animation='none';
    if(art.style.transform!==p.transform)art.style.transform=p.transform;
    view.classList.remove('walking','attacking');
    if(view.dataset)view.dataset.equipmentState=s.actionAge<(firearm(s.actionMode)?.22:.31)?'attack':s.amplitude>.02?s.run>.5?'run':s.crouch>.5?'crouch':'walk':'idle';
    return true;
  }
  function inspect(g){if(!eligible(g))return null;const s=states.get(g);if(!s)return null;return {active:active(g),clock:s.clock,phase:s.phase,gait:s.gait,amplitude:s.amplitude,speed:s.speed,distance:s.distance,steps:s.steps,mode:s.mode,action:s.action,actionAge:s.actionAge,pulses:s.pulses,reduced:s.reduced,drawAge:s.drawAge,...pose(s)};}
  function reset(g){return !!g&&states.delete(g);}
  function install(c){if(context||!c||!c.App)return false;context=c;return true;}
  root.EquipmentView=Object.freeze({install,step,render,inspect,reset,renderHands,inspectHands,configureHands,handFrame,weaponArt,configureEquipment,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);
