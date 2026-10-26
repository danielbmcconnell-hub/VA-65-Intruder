/* Riverbank encounters adapt the existing photographed wildlife simulation.
 * They own no human NPCs and never damage a swimmer from the bank. */
(function(root){
  'use strict';
  const states=new WeakMap(),requested=new WeakSet();
  const LIMITS=Object.freeze({encounters:3,spawnRange:60,minimumSpawnRange:14,retireRange:92,bankInner:14.8,bankOuter:54,maxStep:.1,damageCooldown:12});
  const EVENTS=Object.freeze([
    {at:3800,kind:'boar',side:-1},
    {at:14500,kind:'cobra',side:1},
    {at:28500,kind:'boar',side:1},
    {at:46000,kind:'pit-viper',side:-1},
    {at:62000,kind:'boar',side:-1},
    {at:83500,kind:'tiger',side:1,rare:true}
  ]);
  const finite=(n,f=0)=>Number.isFinite(n)?n:f,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  let context=null;
  function hash(value){let n=2166136261;for(const c of String(value)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;}
  function eligible(g){return !!(g?.pow?.stage==='river'&&g.pow.river&&g.evade&&point(g.evade.p)&&!g.pow.river.finished&&g.pow.river.phase!=='gulf'&&!g.pow.complete&&!g.result);}
  function active(g){const a=g?.app;return eligible(g)&&!g.paused&&!g.pow.modalOpen&&!g.pow.captivity?.open&&!g.evade.held&&!g.evade.frozen&&!g.evade.handsUp&&!g._capturePending&&!root.document?.hidden&&(!a||a.screen==='game'&&!a.graphicsContextLost);}
  function onBank(g){return eligible(g)&&!g.pow.river.boatOwned&&!g.pow.river.submerged&&['bank','hidden'].includes(g.pow.river.mode)&&Math.abs(g.evade.p[0]-(g.pow.base[0]+94))>=14.5;}
  function bankY(g){return g.pow.river.waterY+.35;}
  function floor(g,x,z){
    const b=g.pow.base,dx=Math.abs(x-(b[0]+94));
    return dx>=LIMITS.bankInner&&dx<=LIMITS.bankOuter&&z>=b[2]-101&&z<=b[2]+168?bankY(g):0;
  }
  function blocked(g,x,z,r=.2){
    const c=g.pow.base[0]+94;
    if(Math.abs(x-c)<LIMITS.bankInner+r||Math.abs(x-c)>LIMITS.bankOuter-r||floor(g,x,z)<1.2)return true;
    return !!root.POW?.blocked?.(g,x,z,r,bankY(g));
  }
  function line(g,a,b){return !root.POW?.los||root.POW.los(g,a,b);}
  function state(g){
    let s=states.get(g);if(s&&s.river===g.pow.river)return s;
    const saved=g.pow.river.bankWildlifeSeen;
    s={river:g.pow.river,offset:finite(g.pow.river.streamOffset),clock:0,entries:[],seen:new Set(Array.isArray(saved)?saved.filter(Number.isFinite).slice(0,EVENTS.length):[]),spawned:0,hits:0,punches:0,lastHurt:-99,lastWarning:-99};
    states.set(g,s);return s;
  }
  function announce(g,text){
    const s=state(g);if(s.clock-s.lastWarning<3)return;s.lastWarning=s.clock;
    const message='Riverbank: '+text;root.POW?.notify?.(g,message);g.app?.radio?.('CREW',message,'warn');
  }
  function ready(g){return !g.rend||!root.WildlifeRender?.ready||root.WildlifeRender.ready(g.rend);}
  function proxy(g){
    const app={...g.app,screen:'game'};
    const p={phase:'evade',t:finite(g.t),world:g.world,app,paused:!!g.paused,result:null,
      evade:{p:g.evade.p.slice(),hdg:finite(g.evade.hdg),look:finite(g.evade.look),crouch:!!g.evade.crouch,moving:!!g.evade.moving,searchers:[],locals:[],cattle:[]}};
    app.game=p;return p;
  }
  function actor(entry){
    const w=entry.proxy.evade.wildlife;
    return w?.snakes?.[0]||w?.ecology?.mammals?.[0]||null;
  }
  function syncProxy(g,p){
    p.t=finite(g.t);p.paused=!!g.paused;p.evade.p=g.evade.p.slice();p.evade.hdg=finite(g.evade.hdg);p.evade.look=finite(g.evade.look);p.evade.crouch=!!g.evade.crouch;p.evade.moving=!!g.evade.moving;
  }
  function rebase(g,s){
    const offset=finite(g.pow.river.streamOffset),shift=offset-s.offset;if(!shift)return;
    for(const entry of s.entries){const w=entry.proxy.evade.wildlife;
      for(const a of [...w.snakes,...(w.ecology?.mammals||[]),...(w.ecology?.crawlers||[]),...(w.ecology?.colonies||[])]){a.p[2]-=shift;delete a._sightFrom;delete a._sightTo;}
      w.previousP[2]-=shift;entry.proxy.evade.p[2]-=shift;
    }
    s.offset=offset;
  }
  function spawn(g,s){
    if(s.entries.length>=LIMITS.encounters||!root.Wildlife)return;
    const r=g.pow.river,seed=String(g.mis?.env?.seed||g.mis?.id||'river');
    for(const event of EVENTS){
      if(s.seen.has(event.at))continue;
      if(event.rare&&hash(seed+':bank-tiger')%5!==0)continue;
      const logical=event.at-r.logicalDistance;if(logical < -800||logical>LIMITS.spawnRange*100)continue;
      const p=[g.pow.base[0]+94+event.side*(18.8+(hash(seed+':'+event.at)%31)/10),bankY(g),r.routeOriginZ+event.at/100-r.streamOffset];
      if(distance(p,g.evade.p)<LIMITS.minimumSpawnRange||distance(p,g.evade.p)>LIMITS.spawnRange||blocked(g,p[0],p[2],event.kind==='boar'||event.kind==='tiger'?.8:.35))continue;
      const pgame=proxy(g),id='riverbank-'+event.kind+'-'+event.at;
      root.Wildlife.enter(pgame,{seed:hash(seed+':wildlife:'+event.at),disableSpawns:true,encounters:[{id,kind:event.kind,p,yaw:event.side<0?Math.PI/2:-Math.PI/2}]});
      s.entries.push({id,kind:event.kind,proxy:pgame,born:s.clock});s.seen.add(event.at);r.bankWildlifeSeen=[...s.seen];s.spawned++;break;
    }
  }
  function hurt(g,s,kind,amount){
    if(!onBank(g)||!ready(g)||s.clock-s.lastHurt<LIMITS.damageCooldown)return false;
    s.lastHurt=s.clock;s.hits++;
    const stats=g.pow.stats;if(stats){stats.physical=Math.max(6,finite(stats.physical,65)-amount);stats.fatigue=Math.min(100,finite(stats.fatigue)+3);}
    g.evade.hurt=1;g.shake=Math.max(finite(g.shake),.22);g.flash=Math.max(finite(g.flash),.10);return true;
  }
  function step(g,dt){
    if(!active(g)||!Number.isFinite(dt)||dt<=0||!root.Wildlife||!ready(g))return false;
    const s=state(g),h=Math.min(dt,LIMITS.maxStep);rebase(g,s);s.clock+=h;spawn(g,s);
    for(const entry of s.entries){
      const p=entry.proxy;syncProxy(g,p);const bite=p.evade.wildlife.bite;
      root.Wildlife.step(p,h,{
        terrainH:(x,z)=>floor(g,x,z),
        solidAt:(x,z,r)=>blocked(g,x,z,r),
        move:(x,z,dx,dz,r)=>{const a={p:[x,bankY(g),z],radius:r,alive:true};if(root.POW?.move)root.POW.move(g,a,dx,dz,r);else if(!blocked(g,x+dx,z+dz,r)){a.p[0]+=dx;a.p[2]+=dz;}return [a.p[0],a.p[2]];},
        coverAt:()=>.8,lineOfSight:(a,b)=>line(g,a,b),night:finite(g.pow.river.daylight,.3)<.45,
        warn:text=>announce(g,text),hurt:event=>hurt(g,s,event.kind,event.kind==='tiger'?5:4)
      });
      if(!bite&&p.evade.wildlife.bite)hurt(g,s,entry.kind,3);
    }
    s.entries=s.entries.filter(entry=>{const a=actor(entry);return a&&distance(a.p,g.evade.p)<=LIMITS.retireRange&&s.clock-entry.born<190;});
    return true;
  }
  function view(g){
    if(!eligible(g))return {active:false,animals:[],colonies:[],clock:0};
    const s=state(g);rebase(g,s);const animals=[];
    for(const entry of s.entries){syncProxy(g,entry.proxy);const v=root.Wildlife?.view(entry.proxy);for(const a of v?.animals||[]){animals.push({...a,p:a.p.slice(),riverbankWildlife:true,floorAt:(x,z)=>floor(g,x,z),floorKey:'riverbank:'+g.pow.river.waterY});}}
    return {active:true,animals,colonies:[],clock:s.clock,spawned:s.spawned,hits:s.hits,punches:s.punches};
  }
  function targets(g){
    if(!active(g)||!onBank(g)||!ready(g))return [];
    const result=[];for(const entry of state(g).entries){syncProxy(g,entry.proxy);for(const a of root.Wildlife?.targets(entry.proxy)||[])result.push({...a,p:a.p.slice(),riverbankWildlife:true});}return result;
  }
  function target(g,e=g?.evade,options={}){
    if(!active(g)||!onBank(g)||!root.WildlifeTargeting||!e)return null;
    const p=proxy(g),actors=targets(g);if(!actors.length)return null;
    return root.WildlifeTargeting.target(p,p.evade,{...options,actors,camera:options.camera||g.rend?.eye,eyeHeight:finite(g.pow.river.eyeHeight,e.crouch?1.16:1.68),floorAt:p=>floor(g,p[0],p[2]),lineOfSight:(a,from,to)=>line(g,from,to)});
  }
  function find(g,id){return state(g).entries.find(e=>e.id===id);}
  function weaponHit(g,id,options={}){
    if(!active(g)||!onBank(g)||!ready(g)||!['pistol','knife','rifle','stick'].includes(options.weapon))return false;
    const entry=find(g,id),a=entry&&actor(entry),range=['pistol','rifle'].includes(options.weapon)?60:options.weapon==='stick'?2.4:2.1;
    if(!a||distance(a.p,g.evade.p)>range||!line(g,[g.evade.p[0],g.evade.p[1]+.9,g.evade.p[2]],[a.p[0],a.p[1]+.45,a.p[2]]))return false;
    syncProxy(g,entry.proxy);return root.Wildlife.weaponHit(entry.proxy,id,options);
  }
  function punch(g,id){
    if(!active(g)||!onBank(g)||!ready(g))return false;
    const entry=find(g,id),a=entry&&actor(entry),hands=root.GroundCombat?.hands?.(g);
    if(!a||!['boar','tiger'].includes(entry.kind)||hands?.left&&hands?.right||distance(a.p,g.evade.p)>1.9||!line(g,[g.evade.p[0],g.evade.p[1]+.9,g.evade.p[2]],[a.p[0],a.p[1]+.45,a.p[2]]))return false;
    a.defended=true;a.defenseHits=Math.min(10,finite(a.defenseHits)+1);a.defendedAt=entry.proxy.evade.wildlife.clock;a.spent=true;a.hit=true;a.state='recover';a.stateAge=0;
    state(g).punches++;announce(g,'The '+entry.kind+' recoils. Move away and let it retreat.');return true;
  }
  function draw(g,r=g?.rend){
    if(!eligible(g)||!r||!root.WildlifeRender)return 0;
    if(!requested.has(r)){requested.add(r);root.WildlifeRender.load(r,{touch:context?.touch===true,current:()=>g.rend===r&&(!g.app?.rend||g.app.rend===r)}).catch?.(()=>{});}
    return root.WildlifeRender.draw(g,r,view(g));
  }
  function inspect(g){
    if(!eligible(g))return {active:false};const s=state(g);
    return {active:true,clock:s.clock,spawned:s.spawned,hits:s.hits,punches:s.punches,seen:[...s.seen],entries:s.entries.map(e=>({id:e.id,kind:e.kind,born:e.born,actor:actor(e)?JSON.parse(JSON.stringify(actor(e))):null})),onBank:onBank(g),bankY:bankY(g)};
  }
  function install(c){
    if(context||!c?.POW?.River||!c.Game)return false;context=c;const old=c.POW.River.step;
    c.POW.River.step=function(g,dt){const result=old.apply(this,arguments);step(g,dt);return result;};return true;
  }
  root.RiverbankWildlife=Object.freeze({install,eligible,active,onBank,step,view,draw,targets,target,weaponHit,punch,inspect,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);
