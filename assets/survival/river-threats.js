/* Visible river threats and usable drifting cover. Actual river movement,
 * breath, banks and mission outcomes remain owned by POW.River. */
(function(root){'use strict';
 const states=new WeakMap(),textures=new WeakMap(),clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),finite=(n,f=0)=>Number.isFinite(n)?n:f,dist=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);let ctx=null,ui=null,defenceUI=null;
 function eligible(g){return !!(g?.pow?.river&&g.evade&&!g.pow.river.finished&&!g.pow.complete&&!g.result);}
 function active(g){return eligible(g)&&!g.paused&&!g.pow.modalOpen&&!g.evade.held&&!g._capturePending&&!root.document?.hidden&&(!g.app||g.app.screen==='game'&&!g.app.graphicsContextLost);}
 function state(g){let s=states.get(g);if(!s||s.river!==g.pow.river){s={river:g.pow.river,clock:0,shots:0,nextShot:4,nextWarning:0,cover:null,log:{logical:g.pow.river.logicalDistance+1500,x:g.pow.base[0]+98,kind:'log'},foliage:{logical:g.pow.river.logicalDistance+1900,x:g.pow.base[0]+83,kind:'foliage'},croc:null,used:new Set(),nextDefend:0,defenceAt:-99,defences:0,bites:0};states.set(g,s);}return s;}
 function notify(g,text,tone='warn'){root.POW.notify(g,text);g.app?.radio?.('CREW',text,tone);}
 function position(g,item){const r=g.pow.river;return [item.x,r.waterY+.03,r.phase==='gulf'&&Number.isFinite(item.gulfZ)?item.gulfZ:r.routeOriginZ+item.logical/100-r.streamOffset];}
 function water(g){const r=g.pow.river;return !r.boatOwned&&!['bank','hidden','boat'].includes(r.mode);}
 function coverNear(g){if(!eligible(g)||!water(g)||g.pow.river.submerged)return null;const s=state(g);return [s.log,s.foliage].filter(o=>dist(position(g,o),g.evade.p)<2.8).sort((a,b)=>dist(position(g,a),g.evade.p)-dist(position(g,b),g.evade.p))[0]||null;}
 function takeCover(g){if(!active(g)||!water(g))return false;const s=state(g);if(s.cover){s.cover=null;notify(g,'Released the drifting cover. Swim or dive freely.','');return true;}const item=coverNear(g);if(!item)return false;s.cover=item;g.pow.river.mode='float';notify(g,item.kind==='log'?'Holding the floating log. Drift quietly behind it; F releases it. Diving or swimming hard lets go.':'Draw the floating foliage across your silhouette. Drift quietly; F releases the cover.');return true;}
 function concealment(g){if(!eligible(g))return 0;const s=state(g),r=g.pow.river;return s.cover&&water(g)&&!r.submerged?.72:0;}
 function usableHands(g){const h=root.GroundCombat?.hands?.(g);return !h||!h.left||!h.right;}
 function defend(g){if(!active(g)||!water(g)||!usableHands(g))return false;const s=state(g),c=s.croc;if(!c||c.mode==='retreat'||dist(c.p,g.evade.p)>3.2||s.clock<s.nextDefend||g.pow.river.submerged)return false;s.nextDefend=s.clock+.55;s.defenceAt=s.clock;s.defences++;c.repels++;const d=Math.max(.01,dist(c.p,g.evade.p)),dx=(c.p[0]-g.evade.p[0])/d,dz=(c.p[2]-g.evade.p[2])/d;c.recoil={v:[dx*3,dz*3],left:.25};c.stunnedUntil=s.clock+.9;if(c.repels>=2)c.mode='retreat';g.app?.audio?.swimStroke?.(1.2,false);notify(g,c.mode==='retreat'?'The crocodile pulls away. Reach the bank or keep clear.':'Strike landed. Keep it away and head for the bank.','');return true;}
 // Shore riflemen are actual saved world actors. They stay on the last
 // physical strip of shore, while swimmers can leave their bounded sight/range.
 const COAST_RANGE=220,SHORE_KINDS=new Set(['nva','vc','militia','guard','guardAim','soldier','sentry','vcFem','female_vc']);
 function shoreActors(g){
   const r=g.pow.river,e=g.evade;if(r.phase!=='gulf')return [];
   const list=e.searchers||(e.searchers=[]);let record=r.shoreThreats;
   if(!record||record.version!==1)record=r.shoreThreats={version:1,seeded:false,ids:[]};
   if(!record.seeded){
     const x=g.pow.base[0]+94,y=r.waterY+.35,z=g.pow.base[2];
     const options=[{id:'gulf-shore-nva',kind:'nva',p:[x-18,y,z-64]},{id:'gulf-shore-vc',kind:'vc',p:[x+18,y,z-68]}];
     // Never turn an old close checkpoint or civilian into a surprise rifleman.
     if(options.every(o=>dist(o.p,e.p)>=45)){
       for(const o of options){if(list.some(a=>a.id===o.id))continue;
         if(root.POW.blocked?.(g,o.p[0],o.p[2],.33,y))continue;
         const actor=root.POW.AI?.makeActor?.({...o,face:Math.PI,route:[o.p],dwell:8})||{...o,p:o.p.slice(),home:o.p.slice(),goal:o.p.slice(),route:[o.p.slice()],face:Math.PI,alive:true,armed:true,state:'patrol',seen:0,sus:0};
         actor.riverNPC=true;actor.riverCoastal=true;actor.shorePost=o.p.slice();actor.coastalExposure=0;list.push(actor);
       }
       record.ids=options.filter(o=>list.some(a=>a.id===o.id)).map(o=>o.id);record.seeded=record.ids.length===options.length;
     }
   }
   g.pow.actors=list;return list.filter(a=>a.riverCoastal);
 }
 function shotLine(g,a,reach){
   const r=g.pow.river,e=g.evade;if(r.submerged||e.underwater||e.submerged||dist(a.p,e.p)>reach)return null;
   const bearing=Math.atan2(e.p[0]-a.p[0],-(e.p[2]-a.p[2])),angle=Math.abs(Math.atan2(Math.sin(bearing-finite(a.face)),Math.cos(bearing-finite(a.face))));
   if(angle>=1.05)return null;
   const from=[a.p[0],a.p[1]+1.55,a.p[2]],aim=[e.p[0],r.waterY+(r.boatOwned||r.mode==='boat'?.95:.18),e.p[2]];
   if(root.POW.los&&!root.POW.los(g,from,aim))return null;
   if(root.FishingBoats?.hullOccludes?.(g,from,aim))return null;
   return {from,aim,distance:dist(a.p,e.p)};
 }
 function coastalObserve(g,s,h){
   const r=g.pow.river,posts=shoreActors(g);if(r.phase!=='gulf')return;
   if(!Number.isFinite(s.coastAt)){s.coastAt=s.clock;for(const item of[s.log,s.foliage])item.gulfZ=item===s.cover?g.evade.p[2]+1.2:g.pow.base[2]+(item.kind==='log'?10:20);}
   for(const a of posts){
     const okay=a.alive!==false&&a.armed!==false&&finite(a.stunUntil,-1)<=finite(g.t)&&!a.stunned;
     const line=okay?shotLine(g,a,COAST_RANGE):null;
     a.coastalVisible=!!line;
     const light=.28+.72*clamp(finite(r.daylight,.45),0,1),rain=1-clamp(finite(r.rain),0,1)*.55;
     const silhouette=r.boatOwned||r.mode==='boat'?1.3:r.signaling||r.waving?1.1:.65;
     const visible=line?(1-line.distance/COAST_RANGE)*light*rain*silhouette*(1-concealment(g)*.90):0;
     a.coastalExposure=clamp(finite(a.coastalExposure)+(visible>0?visible*.9:-.8)*h,0,1.2);
     if(line&&a.coastalExposure>.26){
       a.lastKnown=g.evade.p.slice();a.lastSight=finite(g.pow.aiClock,finite(g.t));a.seen=1;a.sus=Math.max(finite(a.sus),a.coastalExposure);a.state='pursuit';
       if(!s.coastWarning){s.coastWarning=true;s.nextWarning=s.clock+9;notify(g,'NVA and VC riflemen on the last shore are watching the water. Dive or use floating cover; surface to wave when their sight line is broken.');}
     }
   }
 }
 function holdShorePost(g,a){
   if(!a?.riverCoastal||g?.pow?.river?.phase!=='gulf')return false;
   a.spd=0;a.swimming=false;a.riverEntering=false;
   if(a.home)a.goal=a.home.slice();a.path=[];
   if(active(g)&&a.alive!==false&&a.coastalVisible){const e=g.evade;a.face=Math.atan2(e.p[0]-a.p[0],-(e.p[2]-a.p[2]));}
   return true;
 }
 function shoreFire(g,s,r,e,conceal){
   if((!water(g)&&!r.boatOwned&&r.mode!=='boat')||r.submerged||e.underwater||e.submerged||s.clock<s.nextShot)return;
   const coastal=r.phase==='gulf';
   const shooters=(e.searchers||[]).filter(a=>a.alive!==false&&a.armed!==false&&SHORE_KINDS.has(a.kind)&&finite(a.stunUntil,-1)<=finite(g.t)&&!a.stunned&&a.state!=='flee');
   const candidates=shooters.map(a=>({actor:a,line:shotLine(g,a,coastal?COAST_RANGE:65)})).filter(o=>o.line&&(coastal?o.actor.riverCoastal&&o.actor.coastalExposure>=.58&&s.clock-finite(s.coastAt,s.clock)>3.5:o.actor.seen||o.actor.sus>.25));
   const choice=candidates.sort((a,b)=>a.line.distance-b.line.distance)[0];
   if(!choice){s.nextShot=s.clock+.35;return;}
   const a=choice.actor,from=choice.line.from,distance=choice.line.distance;
   s.nextShot=s.clock+(coastal?4.5+distance/80:2.7)+(s.shots%3)*.45;s.shots++;s.lastShot=s.clock;s.lastShooter={id:a.id,kind:a.kind,p:a.p.slice(),distance};a.flash=finite(g.t);
   const closeShot=coastal?s.shots%5===0&&distance<160:s.shots%3===0,miss=conceal?5:closeShot?.15:coastal?3.2+distance*.018:2.1;
   const aim=[e.p[0]+miss,choice.line.aim[1],e.p[2]-miss],d=Math.hypot(...aim.map((v,i)=>v-from[i]));
   g.world?.fx?.streak?.(from,aim.map((v,i)=>(v-from[i])/Math.max(.1,d)*160),[1,.66,.28],.10,Math.max(.5,d/160+.1),0,2.2);
   if(g.app?.set?.sound)g.app.audio?.burst?.('gun',coastal?.18:.14);
   if(s.clock>=s.nextWarning){s.nextWarning=s.clock+11;notify(g,r.boatOwned?'Rifle fire from shore! Keep the skiff moving. Use distance or the Navy hull to break their view before signaling.':'Rifle fire from the bank! Hold Space / DIVE briefly, or drift behind a log and foliage. Surface again before your breath runs out.');}
   if(!conceal&&closeShot&&finite(r.damageCooldown,0)<=0){g.pow.stats.physical=Math.max(6,g.pow.stats.physical-3);g.pow.stats.fatigue=Math.min(100,g.pow.stats.fatigue+2);r.damageCooldown=5;e.hurt=true;}
 }
 function step(g,dt){if(!active(g)||!Number.isFinite(dt)||dt<=0)return false;const s=state(g),r=g.pow.river,e=g.evade,h=Math.min(dt,.1);s.clock+=h;
   coastalObserve(g,s,h);
   const input=g.pow.input||{},effort=Math.hypot(finite(input.forward),finite(input.strafe));
   for(const item of[s.log,s.foliage]){if(item===s.cover){item.x=e.p[0]+(item.kind==='log'?.3:-.2);if(r.phase==='gulf')item.gulfZ=e.p[2]+1.2;else item.logical=(e.p[2]+r.streamOffset-r.routeOriginZ)*100+120;}else if(r.phase==='gulf')item.gulfZ+=finite(r.currentWorldMps,.1)*h;else item.logical+=finite(r.currentWorldMps,.8)*h*100;}
   if(s.cover&&(!water(g)||r.submerged||effort>.72||dist(position(g,s.cover),e.p)>3.2))s.cover=null;
   const conceal=concealment(g);if(conceal){r.cover=Math.max(r.cover,conceal);r.visibility*=.24;r.noise*=.45;e.cover=r.cover;e.hidden=true;}
   shoreFire(g,s,r,e,conceal);
   if(r.phase==='gulf')s.croc=null;
   const markers=[5200,34000,63000];if(r.phase!=='gulf'&&!s.croc&&water(g)&&!r.submerged){for(const marker of markers)if(!s.used.has(marker)&&r.logicalDistance>marker-1500&&r.logicalDistance<marker+1800){s.used.add(marker);s.croc={p:[g.pow.base[0]+100,r.waterY-.34,r.routeOriginZ+marker/100-r.streamOffset],mode:'approach',age:0,repels:0,nextBite:0,stunnedUntil:0,offset:r.streamOffset,warned:false};break;}}
   const c=s.croc;if(c){const shift=r.streamOffset-c.offset;c.p[2]-=shift;c.offset=r.streamOffset;c.age+=h;const d=dist(c.p,e.p);if(c.recoil?.left>0){const u=Math.min(h,c.recoil.left);c.p[0]+=c.recoil.v[0]*u;c.p[2]+=c.recoil.v[1]*u;c.recoil.left-=u;}if(!water(g)||c.age>50||d>75)c.mode='retreat';if(d<17&&!c.warned){c.warned=true;notify(g,'Crocodile ahead. Reach a bank. If it closes in, press T / DEFEND to strike it away.');}if(s.clock>=c.stunnedUntil){const away=c.mode==='retreat',dx=e.p[0]-c.p[0],dz=e.p[2]-c.p[2],speed=away?1.9:r.submerged?.35:1.65; c.p[0]+=(away?-1:1)*dx/Math.max(.1,d)*speed*h;c.p[2]+=(away?-1:1)*dz/Math.max(.1,d)*speed*h;}
    if(c.mode!=='retreat'&&water(g)&&!r.submerged&&d<1.8&&c.age>3&&s.clock>c.nextBite&&s.clock>c.stunnedUntil){c.nextBite=s.clock+5;s.bites++;g.pow.stats.physical=Math.max(6,g.pow.stats.physical-5);g.pow.stats.fatigue=Math.min(100,g.pow.stats.fatigue+4);e.hurt=true;g.shake=Math.max(finite(g.shake),.45);notify(g,'Crocodile close! T / DEFEND strikes it away; get to the bank.','bad');if(s.bites>=3)c.mode='retreat';}if(c.mode==='retreat'&&(d>24||c.age>70))s.croc=null;}
   return true;
 }
 function view(g){if(!eligible(g))return {active:false};const s=state(g),c=s.croc;return {active:true,shots:s.shots,lastShooter:s.lastShooter?{...s.lastShooter,p:s.lastShooter.p.slice()}:null,coastal:g.pow.river.phase==='gulf',shorePosts:(g.evade.searchers||[]).filter(a=>a.riverCoastal).map(a=>({id:a.id,kind:a.kind,p:a.p.slice(),alive:a.alive!==false,visible:!!a.coastalVisible,exposure:finite(a.coastalExposure)})),concealment:concealment(g),cover:s.cover?.kind||null,nearCover:coverNear(g)?.kind||null,croc:c?{p:c.p.slice(),mode:c.mode,distance:dist(c.p,g.evade.p),repels:c.repels}:null,defending:s.clock-s.defenceAt<.46,defenceAge:s.clock-s.defenceAt,defences:s.defences,bites:s.bites,underFire:s.clock-finite(s.lastShot,-99)<7,breath:Math.round(g.pow.river.breath||100),submerged:!!g.pow.river.submerged,clock:s.clock};}
 function prepare(r){let q=textures.get(r);if(r.textures?.riverCroc&&r.gl.isTexture(r.textures.riverCroc.tex))return true;if(q?.loading)return false;if(typeof root.Image!=='function')return false;q={loading:true,error:null};textures.set(r,q);const im=new root.Image();im.onload=()=>{if(r.gl.isContextLost()){q.loading=false;return;}const gl=r.gl,active=gl.getParameter(gl.ACTIVE_TEXTURE),binding=gl.getParameter(gl.TEXTURE_BINDING_2D),flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),pre=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);try{r.texFromCanvas('riverCroc',im);q.loading=false;}catch(e){q.error=String(e);q.loading=false;}finally{gl.activeTexture(active);gl.bindTexture(gl.TEXTURE_2D,binding);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,pre);}};im.onerror=()=>{q.error='Crocodile photograph unavailable';q.loading=false;};im.src='assets/crocodile/swim.webp';return false;}
 function draw(g,r){if(!eligible(g))return 0;const s=state(g),c=s.croc,ready=prepare(r);if(!c||!ready)return 0;const frame=c.mode==='retreat'?Math.floor(s.clock*8)%6:dist(c.p,g.evade.p)<4?6+Math.floor(s.clock*5)%2:Math.floor(s.clock*8)%6;r._drawSpriteBatch('riverCroc',[{p:[c.p[0],g.pow.river.waterY-.38,c.p[2]],w:3.8,h:.82,cols:2,rows:4,cell:frame,flip:c.p[0]>g.evade.p[0],t:[1,1,1],motion:[0,0,0,0]}],false);return 1;}
 function props(g,push){if(!eligible(g))return 0;const s=state(g),r=g.pow.river;for(const item of[s.log,s.foliage]){const p=position(g,item);if(dist(p,g.evade.p)>100)continue;push(item.kind==='log'?'riverCoverLog':'bush',p,[0,Math.sin(s.clock*.3)*.05,Math.sin(s.clock*.7)*.03],item.kind==='log'?[1,1,1]:[.7,.32,.8],[.8,.88,.7,0]);}return 2;}
 function buildLog(MB){const m=new MB();m.tube([{p:[-1.6,.02,0],r:.16},{p:[-.5,.07,.04],r:.18},{p:[.7,.03,0],r:.15},{p:[1.7,.02,-.03],r:.09}],[.23,.17,.095],9);m.tube([{p:[-.4,.03,0],r:.065},{p:[-.25,.35,.2],r:.035},{p:[.1,.48,.32],r:.015}],[.21,.16,.10],6);return m;}
 function hud(g){const d=root.document,host=d?.getElementById('game');if(!host)return;if(!ui){const box=d.createElement('section');box.id='riverThreatHUD';box.hidden=true;const text=d.createElement('span'),button=d.createElement('button');button.type='button';button.onclick=e=>{e.stopPropagation();takeCover(ctx.App.game);};for(const type of['pointerdown','pointerup','keydown','keyup','wheel'])box.addEventListener(type,e=>e.stopPropagation());box.append(text,button);host.append(box);ui={box,text,button};}const v=view(g);d.body?.classList.toggle('river-defence-ready',!!v.croc&&v.croc.mode!=='retreat'&&v.croc.distance<3.2&&!v.submerged&&water(g)&&usableHands(g)&&!g.paused);ui.box.hidden=!v.active||g.paused||ctx.App.screen!=='game'||!(v.cover||v.nearCover||v.underFire||v.submerged||v.croc&&v.croc.distance<20);if(!ui.box.hidden){ui.text.textContent=v.croc&&v.croc.distance<8?'CROCODILE · T / DEFEND · reach a bank':v.submerged?'UNDERWATER · AIR '+v.breath+'% · surface before it runs out':v.underFire?(g.pow.river.boatOwned?'RIFLE FIRE · keep paddling / use hull cover':'RIFLE FIRE · Space / DIVE or drifting cover'):v.cover?'DRIFTING COVER · '+v.cover+' · quieter and harder to see':'Floating '+v.nearCover+' · F takes cover';ui.button.hidden=!v.cover&&!v.nearCover;ui.button.textContent=v.cover?'Release cover · F':'Take '+v.nearCover+' · F';}const fire=d.getElementById('btnFire');if(fire&&v.croc?.distance<3.2)fire.textContent='DEFEND';
   if(!defenceUI){defenceUI=d.createElement('div');defenceUI.id='riverDefenceHand';defenceUI.setAttribute('aria-hidden','true');d.getElementById('stack')?.appendChild(defenceUI);}defenceUI.hidden=!v.defending; if(v.defending){const frame=Math.min(7,Math.floor(v.defenceAge/.46*8));defenceUI.style.backgroundPosition=(frame%4*100/3)+'% '+Math.floor(frame/4)*100+'%';defenceUI.style.transform='translateY('+(-Math.sin(v.defenceAge/.46*Math.PI)*5)+'vh)';}
 }
 function install(c){if(ctx)return false;ctx=c;const P=c.POW,old=P.River.step,oldRender=c.Game.prototype.render,oldPursuer=P.River.movePursuer;P.River.movePursuer=function(g,a,dt){if(holdShorePost(g,a))return true;return oldPursuer?oldPursuer.apply(this,arguments):false;};P.River.step=function(g,dt){const result=old.apply(this,arguments);step(g,dt);return result;};c.Game.prototype.render=function(){const r=oldRender.apply(this,arguments);hud(this);return r;};root.addEventListener?.('keydown',e=>{const g=c.App.game;if(e.repeat||!active(g)||e.target?.matches?.('input,textarea,select'))return;if(e.code==='KeyF'&&(state(g).cover||coverNear(g))&&takeCover(g)){e.preventDefault();e.stopImmediatePropagation();}else if(e.code==='KeyT'&&defend(g)){e.preventDefault();e.stopImmediatePropagation();}},true);root.document?.getElementById('btnFire')?.addEventListener('pointerup',e=>{if(defend(c.App.game)){e.preventDefault();e.stopImmediatePropagation();}},true);return true;}
 root.RiverThreats=Object.freeze({install,step,view,defend,takeCover,concealment,props,draw,buildLog,eligible,limits:Object.freeze({coastalRifleRange:COAST_RANGE,coastalRiflemen:2})});
})(typeof window!=='undefined'?window:globalThis);
