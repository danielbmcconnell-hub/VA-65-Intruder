/* Optional physical stealth for the reconstructed October escape. Stones are
   finite environmental distractions, not weapons. Dialogue is authored game
   dialogue; none is attributed to a historical prisoner. */
(function (global) {
  'use strict';
  const P=global.POW;
  if(!P)throw new Error('POW core must load before episode stealth.');
  const STAGES=new Set(['cell','compound','hanoi']);
  const PREFIX='episode-stone:',STONE_RADIUS=.055,GRAVITY=9.81,COOLDOWN=1.15;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const finite=(n,d)=>Number.isFinite(n)?n:d;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const length=p=>Math.hypot(p[0],p[1],p[2]);
  const point=p=>Array.isArray(p) && p.length===3 && p.every(Number.isFinite);
  const clock=g=>finite(g.pow.time,0);
  const aiClock=g=>finite(g.pow.aiClock,clock(g));
  function initial(){return {version:1,stones:0,pileRemaining:3,nextThrowAt:0,sequence:0,projectiles:[],impacts:[],tamper:{triggered:false,concealed:false,seenBy:[]}};}
  function state(game){
    const s=game.pow;if(!s.episodeStealth)s.episodeStealth=initial();const r=s.episodeStealth;
    r.stones=clamp(Math.floor(finite(r.stones,0)),0,3);r.pileRemaining=clamp(Math.floor(finite(r.pileRemaining,3)),0,3-r.stones);
    r.nextThrowAt=Math.max(0,finite(r.nextThrowAt,0));r.sequence=Math.max(0,Math.floor(finite(r.sequence,0)));
    if(!Array.isArray(r.projectiles))r.projectiles=[];if(!Array.isArray(r.impacts))r.impacts=[];
    if(!r.tamper || typeof r.tamper!=='object')r.tamper={triggered:false,concealed:false,seenBy:[]};
    if(!Array.isArray(r.tamper.seenBy))r.tamper.seenBy=[];
    return r;
  }
  function supported(game){return !!(game && game.pow && game.evade && STAGES.has(game.pow.stage));}
  function inactive(game){return !supported(game) || game.paused || game.pow.complete || game.pow.modalOpen || game.pow.traversal || game.pow.holding || game.pow.captivity && game.pow.captivity.open || P.Mindscape && P.Mindscape.active(game) || P.EpisodeActions && typeof P.EpisodeActions.busy==='function' && P.EpisodeActions.busy(game);}
  function notify(game,message){if(P.notify)P.notify(game,message);}
  function save(game){if(P.save)P.save(game);}
  function at(game,x,y,z){const b=game.pow.base;return [b[0]+x,b[1]+y,b[2]+z];}
  function geometry(game,id,p,scale,tint){
    let q=(game.campGeo || []).find(q=>q.id===id);
    if(!q){q={id,m:'powStone',p:p.slice(),y:0,s:1,scale:scale.slice(),t:tint || [1.3,1.2,1.0,0]};(game.campGeo || (game.campGeo=[])).push(q);}
    else{q.p.splice(0,3,...p);q.scale=scale.slice();}
    return q;
  }
  function remove(game,id){const geometry=game.campGeo || [];if(geometry.some(q=>q.id===id))game.campGeo=geometry.filter(q=>q.id!==id);}
  function showProjectile(game,shot){geometry(game,PREFIX+shot.id,shot.p,[.11,.09,.13],[1.5,1.42,1.2,0]);}
  function showPile(game){
    const r=state(game);
    for(let i=0;i<3;i++){
      const id='episode-pebble-pile:'+i;
      if(i<r.pileRemaining)geometry(game,id,at(game,.14+(i-1)*.10,.065,.28+(i%2)*.08),[.09,.07,.10]);else remove(game,id);
    }
  }
  function collect(game){
    if(!supported(game))return false;const r=state(game);
    if(!r.pileRemaining){notify(game,'The small stone pile is empty. Your remaining stones are finite.');return false;}
    const n=r.pileRemaining;r.stones+=n;r.pileRemaining=0;showPile(game);
    notify(game,'Collected '+n+' small stones. Aim with your view, then use Throw stone / R. A guard can hear the actual impact; a closed wall blocks the throw.');save(game);return true;
  }
  function register(game,id,name,p,action,extra){
    if(game.pow.objects.some(o=>o.id===id))return;
    P.addObject(game,Object.assign({id,name,p:p.slice(),radius:1.35,hold:1.4,view:true,action},extra || {}));
  }
  function scene(){return P.EpisodeScene || P.Scene;}
  function lights(game){const sc=scene(),r=sc && sc.renderState?sc.renderState(game):null;return r && Array.isArray(r.lights)?r.lights:[];}
  function toggleLamp(game,id){
    const sc=scene(),lamp=lights(game).find(l=>l.id===id);if(!sc || !lamp || !sc.switchLamp)return false;
    if(!sc.switchLamp(game,id)){notify(game,'Move within reach and face the actual lamp switch. A solid wall blocks access.');return false;}
    if(P.AI && P.AI.noise)P.AI.noise(game,lamp.switchPosition,.045,'lamp-switch','player');
    notify(game,'The local lamp is now '+(lights(game).find(l=>l.id===id)?.on?'on':'off')+'. Other lights and patrols continue.');decorate(game);save(game);return true;
  }
  function markTamper(game){
    const r=state(game);if(!game.pow.flags.doorOpen || r.tamper.triggered)return;
    r.tamper.triggered=true;r.tamper.p=at(game,.30,.80,-3.58);r.tamper.at=clock(game);
  }
  function concealFitting(game){
    if(!supported(game) || !game.pow.flags.doorOpen)return false;const r=state(game);markTamper(game);
    if(r.tamper.concealed)return false;
    r.tamper.concealed=true;remove(game,'episode-door-evidence');
    notify(game,'The fresh fitting marks are covered. The doorway remains physically open; guards who already saw evidence retain their investigation.');save(game);return true;
  }
  function decorate(game){
    if(!supported(game))return;
    const r=state(game),s=game.pow;
    if(s.stage==='cell' || s.stage==='compound'){
      showPile(game);
      register(game,'episode-pebbles','Collect the three loose floor stones',at(game,.14,.12,.28),()=>collect(game),{enabled:()=>state(game).pileRemaining>0});
      register(game,'episode-conceal-fitting','Cover fresh marks on the loose door fitting',at(game,.30,.8,-3.40),()=>concealFitting(game),{hold:2.4,radius:1.2,enabled:()=>!!game.pow.flags.doorOpen && !state(game).tamper.concealed});
    }
    for(const lamp of lights(game))if(point(lamp.switchPosition)){
      const id='episode-lamp:'+lamp.id;
      register(game,id,'Switch '+lamp.id.replaceAll('-',' ')+' '+(lamp.on?'off':'on'),lamp.switchPosition,()=>toggleLamp(game,lamp.id),{hold:.7,radius:1.35,enabled:()=>lights(game).some(l=>l.id===lamp.id)});
      const o=s.objects.find(o=>o.id===id);o.name='Switch '+lamp.id.replaceAll('-',' ')+' '+(lamp.on?'off':'on');
    }
    markTamper(game);
    if(r.tamper.triggered && !r.tamper.concealed && point(r.tamper.p))geometry(game,'episode-door-evidence',r.tamper.p,[.13,.045,.028],[1.6,1.3,.75,0]);
    else remove(game,'episode-door-evidence');
    for(const shot of r.projectiles)if(point(shot.p))showProjectile(game,shot);
  }
  // Segment against an expanded solid box. The earliest interval is used, so a
  // thin wall cannot be skipped and a farther surface cannot win the collision.
  function hitBox(from,to,b,radius){
    if(b.active===false)return null;
    const min=[b.x-b.hw-radius,b.yMin-radius,b.z-b.hl-radius],max=[b.x+b.hw+radius,b.yMax+radius,b.z+b.hl+radius];
    let lo=0,hi=1;
    for(let k=0;k<3;k++){
      const d=to[k]-from[k];
      if(Math.abs(d)<1e-9){if(from[k]<min[k] || from[k]>max[k])return null;}
      else{let a=(min[k]-from[k])/d,c=(max[k]-from[k])/d;if(a>c){const t=a;a=c;c=t;}lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi)return null;}
    }
    return lo>=0 && lo<=1?lo:null;
  }
  function floor(game,p,reference){return P.floorY?P.floorY(game,p[0],p[2],reference):game.pow.base[1];}
  function trace(game,from,to){
    let best=null;
    const accept=(t,kind,id)=>{if(t!==null && (!best || t<best.t))best={t,kind,id,p:from.map((v,k)=>v+(to[k]-v)*t)};};
    for(const b of game.pow.solids || [])accept(hitBox(from,to,b,STONE_RADIUS),'solid',b.id);
    for(const a of game.evade.searchers || [])if(a.alive!==false && point(a.p))accept(hitBox(from,to,{x:a.p[0],z:a.p[2],hw:.28,hl:.28,yMin:a.p[1],yMax:a.p[1]+1.7},STONE_RADIUS),'actor',a.id);
    const f=floor(game,to,Math.max(from[1],to[1])+.08)+STONE_RADIUS;
    if(to[1]<=f && from[1]>=f-.005 && to[1]<from[1])accept(clamp((from[1]-f)/(from[1]-to[1] || 1),0,1),'floor','floor');
    return best;
  }
  function impact(game,shot,hit){
    if(shot.impacted)return;shot.impacted=true;shot.p=hit.p.slice();shot.v=[0,0,0];shot.settle=6;
    const r=state(game),event={id:shot.id,p:shot.p.slice(),kind:hit.kind,surface:hit.id,at:clock(game)};
    r.impacts.push(event);if(r.impacts.length>8)r.impacts.shift();
    if(P.AI && P.AI.noise)P.AI.noise(game,shot.p,hit.kind==='floor'?.55:.75,'stone-impact',PREFIX+shot.id);
    if(P.EpisodeActions && P.EpisodeActions.event)P.EpisodeActions.event(game,'pebble-impact',shot.p.slice());
    save(game);
  }
  function throwStone(game){
    if(inactive(game))return false;const r=state(game),e=game.evade;
    if(!r.stones){notify(game,'No stones remain. Find the small floor pile in the cell before leaving.');return false;}
    if(clock(game)<r.nextThrowAt || r.projectiles.filter(p=>!p.impacted).length>=2)return false;
    const heading=finite(e.hdg,0),look=clamp(finite(e.look,0),-.85,1.2),n=Math.sqrt(1+look*look),direction=[Math.sin(heading)/n,look/n,-Math.cos(heading)/n];
    const start=[e.p[0]+direction[0]*.34+Math.cos(heading)*.16,e.p[1]+(e.crouch?1.0:1.36)+direction[1]*.34,e.p[2]+direction[2]*.34+Math.sin(heading)*.16];
    const shot={id:++r.sequence,p:start,v:[direction[0]*9.2,direction[1]*9.2+2.1,direction[2]*9.2],age:0,impacted:false,radius:STONE_RADIUS};
    r.stones--;r.nextThrowAt=clock(game)+COOLDOWN;r.projectiles.push(shot);showProjectile(game,shot);save(game);
    if(P.EpisodeActions && P.EpisodeActions.event)P.EpisodeActions.event(game,'throw',start.slice());
    // Starting beside a solid surface cannot teleport the hand through it.
    const hand=[e.p[0],e.p[1]+(e.crouch?1.0:1.36),e.p[2]],early=trace(game,hand,start);
    if(early)impact(game,shot,early);
    return true;
  }
  function inspectTamper(game){
    const r=state(game),t=r.tamper;if(!t.triggered || t.concealed || !point(t.p))return;
    for(const a of game.evade.searchers || []){
      if(a.alive===false || a.armed===false || !point(a.p) || !a.id || t.seenBy.includes(a.id))continue;
      const dx=t.p[0]-a.p[0],dz=t.p[2]-a.p[2],d=Math.hypot(dx,dz);
      if(d>6 || Math.abs(t.p[1]-a.p[1])>2.5)continue;
      const sc=scene(),illumination=clamp(finite(sc && sc.lightAt?sc.lightAt(game,t.p,{requireLOS:true}):game.pow.light,.16),0,1);
      if(d>Math.min(6,1.7+illumination*5.3))continue;
      const bearing=Math.atan2(dx,-dz)-finite(a.face,0),angle=Math.abs(Math.atan2(Math.sin(bearing),Math.cos(bearing)));
      if(d>1.5 && angle>.92 || P.los && !P.los(game,[a.p[0],a.p[1]+1.55,a.p[2]],t.p))continue;
      t.seenBy.push(a.id);a.evidenceFound={id:'door-fitting',p:t.p.slice(),at:aiClock(game)};
      // Environmental evidence supplies a door location, never player location.
      if(a.state!=='pursuit'){
        const b=game.pow.base;a.state='investigate';a.sus=Math.max(finite(a.sus,0),.58);a.goal=[b[0],b[1],b[2]-5.1];
        a.investigateOrigin=a.goal.slice();a.investigateUntil=aiClock(game)+12;a.seen=0;a.path=[];a.pathIndex=0;a.nextPlan=0;
        a.attention={reason:'evidence',kind:'door-fitting',at:aiClock(game),muffled:false};
      }
      if(P.Feedback && P.Feedback.say)P.Feedback.say(game,a,'investigate',['Ai đã mở cửa?','Who opened the door?']);
      save(game);
    }
  }
  function step(game,dt){
    if(!supported(game) || game.paused || game.pow.complete || P.Mindscape && P.Mindscape.active(game))return;
    dt=clamp(finite(dt,0),0,.25);const r=state(game);
    for(const shot of r.projectiles){
      if(shot.impacted){shot.settle=finite(shot.settle,6)-dt;continue;}
      let left=dt;
      while(left>1e-8 && !shot.impacted){
        const h=Math.min(left,1/120,.075/Math.max(1,length(shot.v))),from=shot.p.slice();
        const to=from.map((v,k)=>v+shot.v[k]*h+(k===1?-.5*GRAVITY*h*h:0));
        shot.v[1]-=GRAVITY*h;shot.age+=h;left-=h;
        const hit=trace(game,from,to);if(hit)impact(game,shot,hit);else shot.p=to;
        if(shot.age>6 && !shot.impacted){remove(game,PREFIX+shot.id);shot.settle=0;break;}
      }
      if(finite(shot.settle,1)>0)showProjectile(game,shot);
    }
    r.projectiles=r.projectiles.filter(shot=>{if(shot.settle!==undefined && shot.settle<=0){remove(game,PREFIX+shot.id);return false;}return true;});
    markTamper(game);inspectTamper(game);
    r.decorateTick=finite(r.decorateTick,0)+dt;if(r.decorateTick>.35){r.decorateTick=0;decorate(game);}
  }
  function snapshot(game){return game && game.pow && game.pow.episodeStealth?copy(game.pow.episodeStealth):null;}
  function enter(game,saved){
    if(!game || !game.pow)return false;
    game.pow.episodeStealth=saved && typeof saved==='object'?Object.assign(initial(),copy(saved)):initial();
    const r=state(game);r.projectiles=r.projectiles.filter(p=>point(p.p) && point(p.v) && Number.isFinite(p.id)).slice(-8);
    r.projectiles.forEach(p=>{p.age=clamp(finite(p.age,0),0,6);p.impacted=!!p.impacted;});
    if(supported(game))decorate(game);return supported(game);
  }
  P.EpisodeStealth={initial,state,supported,enter,decorate,step,throwStone,snapshot,collect,concealFitting,toggleLamp,trace,
    constants:{stoneRadius:STONE_RADIUS,gravity:GRAVITY,cooldown:COOLDOWN},projectilePrefix:PREFIX};
})(typeof window==='undefined'?globalThis:window);
