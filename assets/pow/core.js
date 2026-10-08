/* First-person POW simulation. The compound is a playable fictional layout,
   not an architectural survey. The original flight engine remains the renderer. */
(function (global) {
  'use strict';
  const P = global.POW = global.POW || {};
  const TAU = Math.PI * 2;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const copy = v => JSON.parse(JSON.stringify(v));
  const stages = {cell:'DIRTY BIRD · CELL',compound:'DIRTY BIRD · COMPOUND',hanoi:'HANOI · NIGHT STREETS',river:'RED RIVER · OCTOBER 1967',solitary:'ALCATRAZ · SOLITARY'};
  let installed = false, touchLook = null;
  P.version = 2;
  P.ensureMeshes = function (game) {
    const r = game && game.rend, MB = P.ctx && P.ctx.MB;
    if (!r || !MB) return;
    const colors = {powStone:[.45,.40,.33],powWood:[.27,.20,.13],powMetal:[.16,.19,.18],powMud:[.24,.21,.16],powWater:[.08,.16,.19],powPale:[.70,.65,.53],powDark:[.07,.085,.078],powBrick:[.40,.22,.16]};
    for (const [id,col] of Object.entries(colors)) if (!r.meshes || !r.meshes[id]) {
      const b = new MB(); b.box(0,0,0,.5,.5,.5,col); r.meshFromBuilder(id,b);
    }
  };
  P.addBox = function (game,id,m,x,y,z,hx,hy,hz,opts) {
    const s=game.pow, o=opts || {}, b=s.base;
    const g={id,m,p:[b[0]+x,b[1]+y,b[2]+z],y:o.yaw||0,s:1,scale:[hx*2,hy*2,hz*2],t:o.tint || [1,1,1,0]};
    (game.campGeo || (game.campGeo=[])).push(g);
    if (o.solid) s.solids.push({id,x:g.p[0],z:g.p[2],hw:hx,hl:hz,yMin:g.p[1]-hy,yMax:g.p[1]+hy,active:o.active!==false});
    return g;
  };
  P.addObject = function (game,obj) { game.pow.objects.push(obj); return obj; };
  P.object = function (game,id,name,x,y,z,action,extra) {
    const b=game.pow.base;
    return P.addObject(game,Object.assign({id,name,p:[b[0]+x,b[1]+y,b[2]+z],radius:1.7,action},extra || {}));
  };
  P.notify = function (game,text) {
    if (!game || !game.pow) return;
    game.pow.message=String(text); game.pow.messageUntil=game.pow.time+8;
    if (P.ui && P.ui.notice) { P.ui.notice.textContent=String(text); P.ui.notice.hidden=false; }
  };
  // Exact circle against rectangular footprints, with vertical actor clearance.
  P.blocked = function (game,x,z,r,y) {
    const s=game.pow; if (!s) return false;
    r=r===undefined?.32:r; y=y===undefined?s.base[1]:y;
    for (const q of s.solids) {
      if (q.active===false || y>=q.yMax-.035 || y+1.48<=q.yMin+.025) continue;
      const ax=Math.max(Math.abs(x-q.x)-q.hw,0), az=Math.max(Math.abs(z-q.z)-q.hl,0);
      if (ax*ax+az*az < r*r-1e-8) return true;
    }
    return false;
  };
  P.floorY = function (game,x,z,referenceY) {
    const s=game.pow; if (!s) return 0;
    const ref=referenceY===undefined?(s.p?s.p[1]:s.base[1]):referenceY;
    let floor=s.base[1];
    for (const f of s.surfaces || []) if (x>=f.minX && x<=f.maxX && z>=f.minZ && z<=f.maxZ) {
      const y=f.ramp ? f.y0+(f.y1-f.y0)*clamp((z-f.z0)/(f.z1-f.z0),0,1) : f.y;
      if (f.ramp || y<=ref+.48) floor=Math.max(floor,y);
    }
    return floor;
  };
  function actorBlocked(game,actor,x,z,r,y) {
    const s=game.pow;
    const all=(s.actors || []).concat(actor!==game.evade?[game.evade]:[]);
    for (const a of all) {
      if (!a || a===actor || a.alive===false || !a.p || Math.abs(a.p[1]-y)>1.25) continue;
      const radius=a.radius===undefined?.31:a.radius;
      if (Math.hypot(x-a.p[0],z-a.p[2]) < r+radius) return true;
    }
    return false;
  }
  P.move = function (game,actor,dx,dz,r) {
    if (!game.pow || !actor || !actor.p) return actor && actor.p;
    const s=game.pow, p=actor.p, count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.10));
    r=r===undefined?.32:r;
    const sx=dx/count, sz=dz/count;
    function can(x,z) {
      const fy=s.customMovement?p[1]:P.floorY(game,x,z,p[1]);
      if (!s.customMovement && fy>p[1]+.50) return false;
      return !P.blocked(game,x,z,r,Math.max(p[1],fy)) && !actorBlocked(game,actor,x,z,r,Math.max(p[1],fy));
    }
    for (let i=0;i<count;i++) {
      const x=p[0]+sx,z=p[2]+sz;
      if (can(x,z)) { p[0]=x;p[2]=z; }
      else {
        // Sliding is resolved per axis for every substep, including very thin walls.
        if (Math.abs(sx)>Math.abs(sz)) { if(can(x,p[2]))p[0]=x;if(can(p[0],z))p[2]=z; }
        else { if(can(p[0],z))p[2]=z;if(can(x,p[2]))p[0]=x; }
      }
      if (!s.customMovement) p[1]=P.floorY(game,p[0],p[2],p[1]);
    }
    return p;
  };
  P.los = function (game,from,to) {
    const s=game.pow;if (!s) return true;
    for (const b of s.solids) {
      if (b.active===false)continue;
      let lo=0,hi=1;
      const mn=[b.x-b.hw,b.yMin,b.z-b.hl],mx=[b.x+b.hw,b.yMax,b.z+b.hl];
      for(let k=0;k<3;k++) {
        const d=to[k]-from[k];
        if(Math.abs(d)<1e-9) { if(from[k]<mn[k] || from[k]>mx[k]) { lo=2;break; } }
        else { let a=(mn[k]-from[k])/d,c=(mx[k]-from[k])/d;if(a>c){const t=a;a=c;c=t;}lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi)break; }
      }
      if(lo<=hi && hi>.015 && lo<.985)return false;
    }
    return true;
  };
  function noise(game,amount,kind,pos) {
    const s=game.pow; s.noise=Math.max(s.noise || 0,amount);
    if(P.AI && P.AI.noise)P.AI.noise(game,pos || game.evade.p,amount,kind);
  }
  function solid(game,id,m,x,y,z,hx,hy,hz) { return P.addBox(game,id,m,x,y,z,hx,hy,hz,{solid:true}); }
  function visual(game,id,m,x,y,z,hx,hy,hz,tint) { return P.addBox(game,id,m,x,y,z,hx,hy,hz,{tint}); }
  function remove(game,id) {
    for(const q of game.pow.solids)if(q.id===id)q.active=false;
    game.campGeo=game.campGeo.filter(q=>q.id!==id && !q.id.startsWith(id+':'));
  }
  function buildPrison(game) {
    const s=game.pow,b=s.base;game.campGeo=[];s.solids=[];s.objects=[];s.surfaces=[];
    s.nav={minX:b[0]-36,maxX:b[0]+110,minZ:b[2]-65,maxZ:b[2]+100,cell:1};
    visual(game,'pad','powMud',37,-.55,15,155,.55,155);
    visual(game,'lane','powDark',60,.012,-23,35,.014,3.25);
    // Escape chamber: continuous wall geometry, a real removable door, barred slot.
    solid(game,'cell-west','powStone',-2.8,1.55,0,.20,1.55,3.6);
    solid(game,'cell-east','powStone',2.8,1.55,0,.20,1.55,3.6);
    solid(game,'cell-back','powStone',0,1.55,3.6,3,1.55,.20);
    solid(game,'cell-front-left','powStone',-1.95,1.55,-3.6,1.05,1.55,.20);
    solid(game,'cell-front-right','powStone',1.95,1.55,-3.6,1.05,1.55,.20);
    solid(game,'cell-lintel','powStone',0,2.8,-3.6,.90,.30,.20);
    solid(game,'cell-roof','powStone',0,3.25,0,3,.15,3.8);
    solid(game,'cell-door','powWood',0,1.24,-3.6,.88,1.24,.095);
    visual(game,'door-hatch','powDark',0,1.95,-3.72,.26,.21,.025);
    for(let i=-2;i<=2;i++)visual(game,'door-bars:'+i,'powMetal',i*.10,1.95,-3.76,.018,.21,.021);
    visual(game,'door-bolt','powMetal',.59,1.05,-3.73,.24,.045,.045);
    visual(game,'fitting','powMetal',.55,.65,-3.74,.08,.11,.055);
    solid(game,'bunk','powWood',-1.83,.23,.9,.55,.23,1.24);
    visual(game,'bunk-mat','powMud',-1.83,.50,.9,.54,.038,1.22,[1.55,1.34,1.11,0]);
    for(const z of [-.15,1.95])visual(game,'bedpost:'+z,'powWood',-2.18,.55,z,.045,.32,.045);
    visual(game,'water-pot','powMetal',1.96,.22,2.52,.19,.22,.19);
    visual(game,'bulb-wire','powMetal',0,2.83,-.4,.015,.27,.015);
    visual(game,'bulb','powPale',0,2.5,-.4,.075,.075,.075,[1.35,1.08,.65,.4]);
    // Corridor is open to a courtyard at the west and the stairs at its east end.
    solid(game,'corridor-north','powStone',7.15,1.50,-7.8,9.85,1.5,.18);
    remove(game,'corridor-north');
    solid(game,'corridor-north-a','powStone',4.65,1.50,-7.8,7.35,1.5,.18);
    solid(game,'corridor-north-b','powStone',16.5,1.50,-7.8,.7,1.5,.18);
    solid(game,'corridor-south','powStone',10,1.50,-3.6,7.1,1.5,.18);
    solid(game,'corridor-end','powStone',17.15,1.50,-5.7,.18,1.5,2.3);
    solid(game,'corridor-ceiling','powStone',7.1,3.16,-5.7,10.05,.14,2.25);
    visual(game,'stairs-sign','powPale',15,1.5,-7.65,.30,.15,.027);
    // Yard walls, windows, cell blocks and posts remain solid at ground height.
    solid(game,'outer-west','powStone',-27,1.7,-4,.35,1.7,36);
    solid(game,'outer-south','powStone',0,1.7,32,27.35,1.7,.35);
    solid(game,'outer-north','powStone',0,1.7,-40,27.35,1.7,.35);
    solid(game,'outer-east','powStone',27,1.7,-4,.35,1.7,36);
    solid(game,'yard-west-block','powStone',-17,1.6,14,4,1.6,9);
    visual(game,'yard-west-roof','powWood',-17,3.35,14,4.4,.15,9.4);
    for(let z=7;z<23;z+=4) {
      visual(game,'yard-door:'+z,'powWood',-12.94,1.1,z,.05,1.1,.65);
      for(let t=-2;t<=2;t++)visual(game,'yardbar:'+z+':'+t,'powMetal',-12.86,2.5,z+t*.16,.03,.23,.021);
    }
    solid(game,'yard-barrel','powWood',-8,.60,-15,.45,.60,.45);
    solid(game,'yard-crate','powWood',-11,.5,-18,.60,.5,.6);
    for(const x of [-22,22]) {
      visual(game,'lamp-pole:'+x,'powMetal',x,2.8,12,.04,2.8,.04);
      visual(game,'lamp:'+x,'powPale',x,5.58,12,.14,.055,.14,[1.2,1,.7,.2]);
    }
    // Actual stepped stair route; floor ramp changes foot/camera height continuously.
    for(let i=0;i<17;i++)visual(game,'stair:'+i,'powStone',14,(i+1)*.1,-8.25-i*.48,1.4,(i+1)*.1,.25);
    s.surfaces.push({minX:b[0]+12.6,maxX:b[0]+15.4,minZ:b[2]-16.5,maxZ:b[2]-8,z0:b[2]-8,z1:b[2]-16,y0:b[1],y1:b[1]+3.4,ramp:true});
    solid(game,'stair-rail-left','powMetal',12.4,2.3,-12.2,.08,2.3,4.45);
    solid(game,'stair-rail-right','powMetal',15.6,2.3,-12.2,.08,2.3,4.45);
    // Building walls stop below rooftop elevation; roof supports feet and a parapet.
    solid(game,'roof-block','powStone',17.5,1.56,-25,8.5,1.56,9);
    visual(game,'roof-deck','powStone',17.5,3.25,-25,9,.15,9.25);
    s.surfaces.push({minX:b[0]+8.5,maxX:b[0]+26.5,minZ:b[2]-34.25,maxZ:b[2]-15.75,y:b[1]+3.4});
    solid(game,'roof-parapet-n','powStone',17.5,3.8,-34.4,9.2,.4,.16);
    solid(game,'roof-parapet-w','powStone',8.3,3.8,-25,.16,.4,9.4);
    solid(game,'roof-parapet-e','powStone',26.5,3.9,-25,.16,.5,9.4);
    solid(game,'roof-parapet-s-a','powStone',10.3,3.8,-15.6,2.1,.4,.16);
    solid(game,'roof-parapet-s-b','powStone',21.1,3.8,-15.6,5.6,.4,.16);
    solid(game,'roof-vent','powMetal',18,3.85,-28,.7,.45,.7);
    visual(game,'roof-rope','powWood',21,.18+3.4,-22,.25,.12,.45,[1.7,1.45,1.12,0]);
    visual(game,'roof-hook','powMetal',26.5,4.1,-24,.06,.07,.09);
    // Dense street fronts provide cover and force an actual walk to the bank.
    const blocks=[[38,-39,6,9,6],[55,-38,7,9,7],[75,-42,8,13,7],[97,-44,9,13,6],[39,0,7,16,6],[59,4,8,20,5],[80,2,7,18,7],[103,8,8,21,5]];
    for(let i=0;i<blocks.length;i++) {
      const [x,z,hx,hz,h]=blocks[i];
      solid(game,'street-block:'+i,i%2?'powBrick':'powStone',x,h/2,z,hx,h/2,hz);
      visual(game,'street-roof:'+i,'powWood',x,h+.15,z,hx+.25,.15,hz+.25);
      for(let xx=x-hx+1;xx<x+hx;xx+=2.3) {
        visual(game,'street-window:'+i+':'+xx,'powDark',xx,2.8,z+(z< -20?hz:-hz)-Math.sign(z< -20?-1:1)*.035,.34,.58,.025);
        visual(game,'street-shutter:'+i+':'+xx,'powWood',xx-.41,2.8,z+(z< -20?hz:-hz),.08,.65,.04);
      }
    }
    for(const [i,x,z] of [[0,49,-19],[1,70,-27.7],[2,86,-18.5]])solid(game,'street-cart:'+i,'powWood',x,.58,z,1.2,.58,.55);
    visual(game,'alley-mouth','powWater',99,.04,-23,7,.035,7,[.5,.85,1.1,0]);
    for(let i=0;i<7;i++)visual(game,'reeds:'+i,'powWood',90+i*.35,.7,-29+i*.30,.035,.7,.035);
    // Hard bounds prevent leaving the playable streets around their back sides.
    solid(game,'level-west','powDark',-35,4,16,.3,4,80);
    solid(game,'level-north','powDark',36,4,-64,72,4,.3);
    solid(game,'level-south','powDark',36,4,96,72,4,.3);
    solid(game,'level-east-n','powDark',109,4,-42,.3,4,22);
    solid(game,'level-east-s','powDark',109,4,42,.3,4,62);
    s.cellDoor=[b[0],b[1]+1.1,b[2]-3.6];
    P.object(game,'bunk-bracket','Inspect the bunk · concealed door bracket',-1.62,.7,.9,()=>{
      if(s.inventory.bracket)return P.notify(game,'You already carry the concealed bracket.');
      s.inventory.bracket=true;s.flags.bunkSearched=true;game.evade.fitting=1;
      P.notify(game,'A small metal bracket is loose beneath the sleeping mat. Keep it quiet.');noise(game,.10,'bunk');P.save(game);
    },{hold:1.5,enabled:()=>!s.inventory.bracket,view:false});
    P.object(game,'wall-contact','Tap a covert message through the wall',-2.53,1.15,.2,()=>{
      s.flags.wallContact=true;s.stats.hope=Math.min(100,s.stats.hope+5);s.stats.morale=Math.min(100,s.stats.morale+4);
      P.notify(game,'Two quiet taps answer: wait for footsteps to pass, then work the door fitting.');noise(game,.10,'wall-tap');P.save(game);
    },{hold:1.3,radius:1.15,enabled:()=>!s.flags.wallContact});
    P.object(game,'door-fitting','Loosen the locking hardware',.5,1.0,-3.46,()=>{
      if(!s.inventory.bracket)return P.notify(game,'Search the bunk for something narrow enough to work the fitting.');
      s.flags.doorOpen=true;remove(game,'cell-door');remove(game,'door-hatch');remove(game,'door-bars');remove(game,'door-bolt');remove(game,'fitting');
      visual(game,'door-open','powWood',-1,1.24,-4.48,.095,1.24,.88);
      P.notify(game,'The bolt drops clear. The door is open. Walk into the corridor and turn right toward the stairs.');noise(game,.45,'door');P.save(game);
    },{hold:7,radius:1.65,enabled:()=>!s.flags.doorOpen,canHold:()=>!!s.inventory.bracket,noise:.25});
    P.object(game,'roof-rope','Take the bundled rope',21,3.8,-22,()=>{
      s.inventory.rope=true;remove(game,'roof-rope');P.notify(game,'A discarded rope is long enough to reach the far side. The east parapet has an iron hook.');P.save(game);
    },{hold:1.3,enabled:()=>!s.inventory.rope,view:false});
    P.object(game,'roof-descent','Secure the rope and descend the outside wall',26,4,-24,()=>{
      if(!s.inventory.rope)return P.notify(game,'Find the bundled rope on this roof before descending.');
      if(game.evade.p[1]<b[1]+3.1)return;
      s.traversal={kind:'descent',t:0,duration:4,from:game.evade.p.slice(),to:[b[0]+29.1,b[1],b[2]-24]};
      visual(game,'escape-rope','powWood',27.7,2.1,-24,.035,2.1,.035,[2,1.7,1.3,0]);noise(game,.30,'rope');
      P.notify(game,'Hold steady. Descending the far side of the wall.');
    },{hold:2.2,radius:2.1,enabled:()=>!s.flags.outside,climb:true,view:false});
    P.object(game,'alley-rest','Rest briefly behind the handcart',49,.8,-19,()=>{
      s.stats.fatigue=Math.max(0,s.stats.fatigue-12);s.stats.physical=Math.min(100,s.stats.physical+2);P.notify(game,'Breathing slows. Watch the street before moving again.');
    },{hold:5,enabled:()=>s.stage==='hanoi',view:false});
    if(s.flags.doorOpen){remove(game,'cell-door');remove(game,'door-hatch');remove(game,'door-bars');remove(game,'door-bolt');remove(game,'fitting');visual(game,'door-open','powWood',-1,1.24,-4.48,.095,1.24,.88);}
    if(s.inventory.rope)remove(game,'roof-rope');
    if(s.flags.outside)visual(game,'escape-rope','powWood',27.7,2.1,-24,.035,2.1,.035,[2,1.7,1.3,0]);
  }
  P.begin = function (game,stage,saved) {
    stage=stage || 'cell';const old=game.pow, prior=game.evade;
    const origin=saved && saved.base || old && old.base || (game.campOrigin ? [game.campOrigin[0],0,game.campOrigin[1]] : [game.ac && Number.isFinite(game.ac.p[0])?game.ac.p[0]:1400,0,game.ac && Number.isFinite(game.ac.p[2])?game.ac.p[2]:1400]);
    let ground=origin[1];
    if(!(saved && saved.base) && !(old && old.base)) {
      const terrain=P.ctx && P.ctx.terrainH;
      if(terrain)for(let x=-125;x<=195;x+=8)for(let z=-145;z<=175;z+=8)ground=Math.max(ground,terrain(origin[0]+x,origin[2]+z));
      ground+=2;
    }
    const prefs=P.ctx && P.ctx.Store?P.ctx.Store.get('pow_preferences',{}):{};
    const s=game.pow={stage,time:saved && saved.time || old && old.time || 0,day:saved && saved.day || old && old.day || 1,difficulty:saved && saved.difficulty || old && old.difficulty || prefs.difficulty || 'normal',intensity:saved && saved.intensity || old && old.intensity || prefs.intensity || 'standard',inventory:saved && saved.inventory || old && copy(old.inventory) || {},flags:saved && saved.flags || old && copy(old.flags) || {},stats:saved && saved.stats || old && old.stats || {physical:100,fatigue:0,resilience:70,morale:65,memory:70,hope:65},solids:[],surfaces:[],objects:[],base:[origin[0],ground,origin[2]],checkpoint:stage,message:'',messageUntil:0,noise:0,input:{},light:.16,_hydrating:true};
    if(!saved && old){for(const key of ['doorOpen','outside','roofCrossed','bunkSearched','wallContact','capturePending'])delete s.flags[key];delete s.inventory.bracket;delete s.inventory.rope;}
    if(saved && saved.captivity)s.captivity=copy(saved.captivity);else if(old && old.captivity)s.captivity=old.captivity;
    if(s.captivity)s.captivity.open=false;
    const p=[origin[0]+.3,ground,origin[2]+.5];
    game.evade={camp:true,p,hdg:0,look:0,pitchCmd:0,t:0,radio:-1,rounds:0,hasPistol:false,hasKnife:false,drawn:0,weaponMode:'fists',fitting:s.inventory.bracket?1:0,alive:true,radius:.32,lastShot:-99,kills:0,noise:0,chute:[origin[0],origin[2]],searchers:[],locals:[],spawn:1e9,found:0,exposure:0,expose:0,sus:0,alarm:0,prep:0,pickup:[origin[0]+26,origin[2]-24],goal:[origin[0]+26,origin[2]-24],origin:[origin[0],origin[2]],A:27,B:36,held:0,frozen:0};
    s.p=game.evade.p;s.actors=game.evade.searchers;game.phase='evade';game.chute=null;game.ejected=true;game.extView=false;game.paused=false;game._solitaryActive=false;game.campY=ground;game.campOrigin=[origin[0],origin[2]];game.cellPos=[origin[0],ground,origin[2]];game._escStage='pow';
    if(game.world){game.world.campOrigin=game.campOrigin;if(game.world._cells)game.world._cells.clear();}
    const audio=game.app && game.app.audio;if(audio){audio.groundMode=true;if(audio.setEngine)audio.setEngine(0,0,false);if(audio.setTone)audio.setTone(0);if(audio.setRadAlt)audio.setRadAlt(99999,false);}
    game.shake=0;if(game.setHour)game.setHour(22.05,.52);
    for(const id of ['captVeil','teachVeil','legend','pauseVeil']){const n=document.getElementById(id);if(n)n.classList.remove('on');}
    if(game.app && game.app.hud)game.app.hud.scope=false;
    P.ensureMeshes(game);buildPrison(game);
    if(stage==='solitary' && P.Captivity){P.Captivity.enter(game);if(saved && saved.captivity && P.Captivity.restore)P.Captivity.restore(game,saved.captivity);}
    else if(stage==='river' && P.River){if(saved && saved.module)s.river=copy(saved.module);if(saved && saved.p)game.evade.p.splice(0,3,...saved.p);P.River.enter(game);}
    else if(stage==='compound'){game.evade.p[2]=origin[2]-5.6;s.flags.doorOpen=true;buildPrison(game);}
    else if(stage==='hanoi'){s.flags.doorOpen=true;s.flags.outside=true;game.evade.p[0]=origin[0]+29.1;game.evade.p[2]=origin[2]-24;buildPrison(game);}
    if(saved && saved.p && !saved.complete){game.evade.p.splice(0,3,...saved.p);game.evade.hdg=saved.hdg || 0;game.evade.look=saved.look || 0;game.evade.pitchCmd=game.evade.look;}
    if(P.AI && P.AI.enter)P.AI.enter(game,stage);
    if(saved && saved.ai && P.AI && P.AI.restore)P.AI.restore(game,saved.ai);
        s.p=game.evade.p;s.actors=game.evade.searchers;
    P.activate(true);P.mountUI();if(P.ui)P.ui.end.hidden=true;P.updateUI(game);
    P.notify(game,stage==='cell'?'Search the bunk, contact the man through the wall, and work the door fitting when the guard moves away.':stage==='hanoi'?'Stay in the shadows. Follow the dark lane east to the riverbank.':stage==='compound'?'Move through the corridor to the stairs. The roof leads across the east wall.':'Your body is here. Move and interact with the objects around you.');
    s._hydrating=false;P.save(game);
    return s;
  };
  P.transition = function (game,stage) {
    const s=game.pow;if(!s || s.complete || s.stage===stage)return;
    s.stage=stage;s.stageTime=0;s.holding=null;s.checkpoint=stage;
    if(stage==='river' && P.River)P.River.enter(game);
    if(stage==='solitary' && P.Captivity)P.Captivity.enter(game);
    if(P.AI && P.AI.enter)P.AI.enter(game,stage);
    s.p=game.evade.p;s.actors=game.evade.searchers;P.save(game);P.updateUI(game);
    P.notify(game,stage==='compound'?'Checkpoint: corridor. Turn right, walk up the stairs and cross the roof.':stage==='hanoi'?'Checkpoint: outside the wall. Head east along the lane and watch the patrols.':stage==='river'?'Checkpoint: riverbank. Water and reeds offer cover; daylight will change it.':'Checkpoint: solitary confinement.');
  };
  function nearestObject(game,action) {
    const s=game.pow,e=game.evade,eye=[e.p[0],e.p[1]+(e.crouch?1.12:1.65),e.p[2]];let best=null,bestD=1e9;
    for(const obj of s.objects) {
      if(obj.active===false || typeof obj.enabled==='function' && !obj.enabled(game,obj))continue;
      if(action && action!==true && action!=='interact' && action!=='climb' && obj.id!==action)continue;
      if(action==='climb' && !obj.climb)continue;
      const dx=obj.p[0]-e.p[0],dz=obj.p[2]-e.p[2],horizontal=Math.hypot(dx,dz),vertical=Math.abs(obj.p[1]-eye[1]);
      if(horizontal>(obj.radius || 1.7) || vertical>2.2)continue;
      const angle=Math.atan2(dx,-dz)-e.hdg, facing=Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)));
      if(obj.view!==false && horizontal>.50 && facing>1.10)continue;
      // Interactions may touch a wall's front surface; only test to a shortened endpoint.
      const fraction=horizontal>.15?Math.max(0,(horizontal-.14)/horizontal):0;
      const target=[eye[0]+(obj.p[0]-eye[0])*fraction,eye[1]+(obj.p[1]-eye[1])*fraction,eye[2]+(obj.p[2]-eye[2])*fraction];
      if(obj.view!==false && !P.los(game,eye,target))continue;
      if(horizontal<bestD){best=obj;bestD=horizontal;}
    }
    return best;
  }
  P.interact = function (game,action) {
    if(!game || !game.pow || !game.evade || game.paused || game.pow.complete || inputBlocked(game))return false;
    const obj=nearestObject(game,action);
    if(!obj)return false;
    if(typeof obj.action==='function'){obj.action(game,obj);return true;}
    if(P.Captivity && game.pow.stage==='solitary' && P.Captivity.interact)return P.Captivity.interact(game,obj.action || obj.id);
    return false;
  };
  P.save = function (game) {
    const s=game && game.pow,e=game && game.evade;if(!s || !e)return null;
    const snap={version:2,stage:s.stage,time:s.time,day:s.day,difficulty:s.difficulty,intensity:s.intensity,base:s.base.slice(),p:e.p.slice(),hdg:e.hdg,look:e.look,inventory:copy(s.inventory),flags:copy(s.flags),stats:copy(s.stats),complete:!!s.complete,savedAt:Date.now()};
    if(s.river)snap.module=copy(s.river);
    if(s.captivity)snap.captivity=copy(s.captivity);
    if(s.outcome)snap.outcome=copy(s.outcome);
    if(P.AI && P.AI.snapshot)snap.ai=P.AI.snapshot(game);
    if(s._hydrating)return snap;
    if(P.ctx && P.ctx.Store)P.ctx.Store.set('pow_checkpoint',snap);
    s.savedAt=snap.savedAt;s.checkpoint=s.stage;return snap;
  };
  P.finish = function (game,result) {
    if(!game || !game.pow || game.pow.complete)return;
    const s=game.pow;s.complete=true;game.paused=true;
    result=typeof result==='string'?{text:result}:result || {};s.outcome=copy(result);P.save(game);
    P.mountUI();
    const panel=P.ui.end;panel.hidden=false;panel.querySelector('h2').textContent=result.title || 'The historical record';
    panel.querySelector('[data-result]').textContent=result.text || 'No American prisoner held in North Vietnam escaped to safety. Captivity continued until repatriation in 1973.';
    panel.querySelector('[data-record]').textContent='George Coker and George McKnight escaped Dirty Bird on 12 October 1967. Their escape ended in recapture. This playable route is a fictional reconstruction, and offshore continuation is counterfactual.';
    document.exitPointerLock && document.exitPointerLock();
  };
  function inputBlocked(game) {
    const s=game.pow,active=document.activeElement;
    return !!(s && (s.modalOpen || s.captivity && s.captivity.open)) || !!(active && active.closest && active.closest('input,textarea,select,[contenteditable=true],[role=dialog][aria-modal=true]'));
  }
  function readInput(game,dt) {
    const s=game.pow,e=game.evade,a=game.app || {},k=a.keys || {},g=a.gctl || {},locked=document.pointerLockElement===document.getElementById('stack');
    if(inputBlocked(game)){for(const key of Object.keys(k))k[key]=0;for(const key of ['pitch','roll','run','crouch'])g[key]=0;s.touchInteract=false;s.touchClimb=false;s.input={forward:0,strafe:0,run:false,crouch:false,interact:false,climb:false};e.moving=false;e.running=false;return;}
    const right=(k.KeyD?1:0)-(k.KeyA?1:0),turn=(k.ArrowRight?1:0)-(k.ArrowLeft?1:0)+(locked?0:right)+clamp(g.roll || 0,-1,1);
    e.hdg=(e.hdg+turn*dt*1.65)%TAU;
    e.pitchCmd=clamp((e.pitchCmd || 0)+((k.KeyQ?1:0)-(k.KeyE?1:0))*dt*.9,-.85,1.2);
    e.look=e.pitchCmd;
    s.input={forward:clamp((k.KeyW || k.ArrowUp?1:0)-(k.KeyS || k.ArrowDown?1:0)+(g.pitch || 0),-1,1),strafe:locked?right:0,run:!!(k.ShiftLeft || k.ShiftRight || g.run),crouch:!!(k.KeyC || g.crouch),interact:!!(k.KeyF || s.touchInteract),climb:!!(k.Space || s.touchClimb)};
    e.crouch=s.input.crouch;e.weaponWant=null;e.attackWant=0;
  }
  P.tick = function (game,dt) {
    const s=game.pow,e=game.evade;if(!s || !e || game.paused || s.complete)return;
    dt=clamp(dt,0,.10);s.time+=dt;s.stageTime=(s.stageTime || 0)+dt;e.t+=dt;s.noise=Math.max(0,(s.noise || 0)-dt*.35);e.noise=s.noise;
    readInput(game,dt);
    const input=s.input,was=[e.p[0],e.p[2]];
    if(s.traversal) {
      const t=s.traversal;t.t+=dt;const f=clamp(t.t/t.duration,0,1);
      for(let j=0;j<3;j++)e.p[j]=t.from[j]+(t.to[j]-t.from[j])*f;
      e.moving=true;e.running=false;
      if(f>=1){s.flags.outside=true;s.flags.roofCrossed=true;s.traversal=null;P.transition(game,'hanoi');}
    } else if(!s.customMovement) {
      const motion=s.motion || {},fatigue=s.stats.fatigue || 0;
      const speed=(Number.isFinite(motion.speed)?motion.speed:2.05)*(s.movementScale || 1)*(input.crouch?.49:input.run?1.9:1)*(fatigue>80?.70:1)*(s.stats.physical<40?.70:1);
      const forward=input.forward,strafe=input.strafe,norm=Math.max(1,Math.hypot(forward,strafe));
      P.move(game,e,(Math.sin(e.hdg)*forward+Math.cos(e.hdg)*strafe)/norm*speed*dt,(-Math.cos(e.hdg)*forward+Math.sin(e.hdg)*strafe)/norm*speed*dt,motion.radius || .32);
      e.moving=Math.hypot(e.p[0]-was[0],e.p[2]-was[1])>.001;e.running=e.moving && input.run && !input.crouch;
      if(s.stage!=='solitary')s.stats.fatigue=clamp(fatigue+(e.running?1.5:e.moving?.065:-.34)*dt,0,100);
      if(e.moving){s.footTimer=(s.footTimer || 0)+dt;if(s.footTimer>(e.running?.32:input.crouch?.75:.54)){s.footTimer=0;noise(game,e.running?.85:input.crouch?.08:.25,'footsteps');if(game.app.audio && game.app.set && game.app.set.sound && game.app.audio.footfall)game.app.audio.footfall(false,e.running);}}
    }
    if(s.stage==='river' && P.River && P.River.step)P.River.step(game,dt);
    if(s.stage==='solitary' && P.Captivity && P.Captivity.step)P.Captivity.step(game,dt);
    if(s.stage==='cell' && P.Captivity && P.Captivity.stepCell)P.Captivity.stepCell(game,dt);
    if(P.AI && P.AI.step)P.AI.step(game,dt);
    if(game.pow!==s || s.complete)return;
    if(!s.traversal) {
      const obj=nearestObject(game,input.climb?'climb':undefined);s.focus=obj || null;
      const down=input.interact || input.climb && obj && obj.climb;
      if(down && obj) {
        if(typeof obj.canHold==='function' && !obj.canHold(game,obj)) {
          if(!s.interactLatched)P.interact(game,obj.id);s.interactLatched=true;s.holding=null;
        } else if(!s.interactLatched) {
          if(!s.holding || s.holding.id!==obj.id)s.holding={id:obj.id,t:0};
          s.holding.t+=dt;
          if(obj.noise){s.noiseTick=(s.noiseTick || 0)+dt;if(s.noiseTick>.65){noise(game,obj.noise,'door-fitting',obj.p);s.noiseTick=0;}}
          if(s.holding.t>=(obj.hold || .15)){P.interact(game,obj.id);s.interactLatched=true;s.holding=null;}
        }
      } else {s.holding=null;s.interactLatched=false;}
    }
    if(s.stage==='cell' && s.flags.doorOpen && e.p[2]<s.base[2]-4.3)P.transition(game,'compound');
    if(s.stage==='hanoi' && s.flags.outside && e.p[0]>=s.base[0]+91 && e.p[2]>s.base[2]-31 && e.p[2]<s.base[2]-13)P.transition(game,'river');
    s.uiTimer=(s.uiTimer || 0)+dt;if(s.uiTimer>.10){s.uiTimer=0;P.updateUI(game);}
  };
  P.activate = function (on) { if(typeof document!=='undefined')document.body.classList.toggle('pow-active',!!on);if(P.ui)P.ui.root.hidden=!on; };
  function button(label,fn,parent) {const n=document.createElement('button');n.type='button';n.textContent=label;n.addEventListener('click',fn);parent.appendChild(n);return n;}
  function current() { return P.ctx && P.ctx.App && P.ctx.App.game; }
  P.mountUI = function () {
    if(P.ui || typeof document==='undefined' || !document.body)return;
    const root=document.createElement('section');root.id='powHUD';root.setAttribute('aria-label','Prisoner survival controls');
    const header=document.createElement('div');header.className='pow-status';header.innerHTML='<strong data-stage></strong><span data-objective></span><span data-stats></span><span data-river></span><span data-alert></span>';root.appendChild(header);
    const tools=document.createElement('div');tools.className='pow-tools';root.appendChild(tools);
    button('Save',()=>{const g=current();if(g && g.pow){P.save(g);P.notify(g,'Checkpoint saved on this device.');}},tools);
    button('Continue',()=>{const g=current(),saved=P.ctx.Store.get('pow_checkpoint',null);if(g && saved && !saved.complete)P.begin(g,saved.stage,saved);else if(g)P.notify(g,'No unfinished checkpoint is available on this device.');},tools);
    button('History & photos',()=>{const g=current();if(global.POWPhotos && global.POWPhotos.open)global.POWPhotos.open(g);else if(P.Photos && P.Photos.open)P.Photos.open(g);},tools);
    const settings=document.createElement('details');settings.className='pow-settings';settings.innerHTML='<summary>Settings & controls</summary><label>Difficulty <select data-difficulty><option value="normal">Normal</option><option value="hard">Hard</option></select></label><label>Intensity <select data-intensity><option value="standard">Standard</option><option value="reduced">Reduced</option></select></label><p>W/S or left stick: move · A/D: turn · Shift: run · C: crouch · Q/E: look up/down · F: hold interaction · Space: climb · Y: mouse look. Drag the right side to look on touch.</p><p class="pow-layout-note">The compound and street layout is fictional. Photographs and historical records are presented separately.</p>';tools.appendChild(settings);
    for(const name of ['difficulty','intensity'])settings.querySelector('[data-'+name+']').addEventListener('change',event=>{const g=current();if(!g || !g.pow)return;g.pow[name]=event.target.value;P.ctx.Store.set('pow_preferences',{difficulty:g.pow.difficulty,intensity:g.pow.intensity});P.save(g);P.updateUI(g);});
    const notice=document.createElement('p');notice.className='pow-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');root.appendChild(notice);
    const prompt=document.createElement('div');prompt.className='pow-prompt';prompt.innerHTML='<span data-prompt></span><progress max="1" value="0" aria-label="Interaction progress"></progress>';root.appendChild(prompt);
    const controls=document.createElement('div');controls.className='pow-context-controls';root.appendChild(controls);
    const interact=button('Interact · hold F',()=>{},controls),climb=button('Climb · Space',()=>{},controls);
    function hold(node,key) {
      node.addEventListener('pointerdown',event=>{const g=current();if(!g || !g.pow)return;event.preventDefault();g.pow[key]=true;node.setPointerCapture && node.setPointerCapture(event.pointerId);});
      const release=()=>{const g=current();if(g && g.pow)g.pow[key]=false;};
      node.addEventListener('pointerup',release);node.addEventListener('pointercancel',release);node.addEventListener('lostpointercapture',release);
    }
    hold(interact,'touchInteract');hold(climb,'touchClimb');
    const end=document.createElement('div');end.className='pow-end';end.hidden=true;end.innerHTML='<article><h2></h2><p data-result></p><p data-record></p><div data-buttons></div></article>';root.appendChild(end);
    button('Historical photos',()=>{if(global.POWPhotos && global.POWPhotos.open)global.POWPhotos.open(current());},end.querySelector('[data-buttons]'));
    button('Ready room',()=>{const a=P.ctx.App;a.game=null;a.show('ready');P.activate(false);end.hidden=true;},end.querySelector('[data-buttons]'));
    document.body.appendChild(root);
    P.ui={root,header,stage:header.querySelector('[data-stage]'),objective:header.querySelector('[data-objective]'),stats:header.querySelector('[data-stats]'),river:header.querySelector('[data-river]'),alert:header.querySelector('[data-alert]'),settings,notice,prompt:prompt.querySelector('[data-prompt]'),progress:prompt.querySelector('progress'),interact,climb,end};
  };
  P.updateUI = function (game) {
    P.mountUI();if(!P.ui || !game || !game.pow)return;
    const s=game.pow,e=game.evade,u=P.ui;u.stage.textContent=(stages[s.stage] || s.stage)+' · DAY '+s.day;
    u.objective.textContent=s.objective || (s.stage==='cell'?s.inventory.bracket?'Work the door fitting quietly':'Search the bunk for a concealed bracket':s.stage==='compound'?s.inventory.rope?'Secure the rope at the east parapet':'Walk upstairs · find the rope on the roof':s.stage==='hanoi'?'Follow the lane east to the river · stay out of patrol light':s.stage==='river'?'Stay low in water and reeds · follow the river':'Protect strength, memory and contact');
    u.stats.textContent='BODY '+Math.round(s.stats.physical)+' · FATIGUE '+Math.round(s.stats.fatigue)+' · RESOLVE '+Math.round(s.stats.resilience)+' · MORALE '+Math.round(s.stats.morale)+' · MEMORY '+Math.round(s.stats.memory)+' · HOPE '+Math.round(s.stats.hope);
    if(u.river){u.river.hidden=!s.river;if(s.river){const r=s.river,h=((r.hour || 0)%24+24)%24,clock=String(Math.floor(h)).padStart(2,'0')+':'+String(Math.floor((h%1)*60)).padStart(2,'0');u.river.textContent=Number(r.distanceKm || 0).toFixed(1)+' ROUTE KM (100:1) · '+clock+' · '+String(r.weather || 'mist').toUpperCase()+' · '+String(r.mode || 'swim').toUpperCase()+' · AIR '+Math.round(r.breath || 0);}}
    const seen=e.searchers.some(a=>a.alive!==false && a.seen);u.alert.textContent=seen?'GUARD HAS SIGHT OF YOU':e.sus>.45?'PATROL INVESTIGATING':s.noise>.5?'YOUR MOVEMENT IS LOUD':'KEEP QUIET · WATCH THE PATROLS';u.alert.dataset.danger=seen?'yes':'no';
    const f=s.focus || nearestObject(game);u.prompt.textContent=f?(f.hold?'Hold F · ':'F · ')+f.name:'Look toward an object within reach';u.progress.value=s.holding && f?clamp(s.holding.t/(f.hold || .15),0,1):0;
    u.interact.disabled=!f;u.climb.hidden=!(f && f.climb) && s.stage!=='river';u.climb.textContent=s.stage==='river'?'Dive · hold Space':'Climb · Space';u.notice.hidden=s.time>s.messageUntil;if(!u.notice.hidden)u.notice.textContent=s.message;
    u.settings.querySelector('[data-difficulty]').value=s.difficulty;u.settings.querySelector('[data-intensity]').value=s.intensity;
    document.body.classList.toggle('pow-reduced',s.intensity==='reduced');
  };
  P.install = function () {
    if(installed || !P.ctx)return;installed=true;const A=P.ctx.App,G=P.ctx.Game;
    const init=A.init;A.init=function(){const result=init.apply(this,arguments);P.mountUI();P.activate(!!(this.game && this.game.pow));return result;};
    const show=A.show;A.show=function(){const result=show.apply(this,arguments);P.activate(this.screen==='game' && !!(this.game && this.game.pow));return result;};
    const sync=G.prototype.syncControls;G.prototype.syncControls=function(){const result=sync.apply(this,arguments);P.activate(!!this.pow);return result;};
    // Capture only POW input so aeroplane key and pointer behavior is preserved.
    window.addEventListener('keydown',event=>{
      const g=current();if(!g || !g.pow || A.screen!=='game' || inputBlocked(g))return;
      if(['KeyF','Space','KeyV','KeyX','KeyR','KeyM','KeyJ','Tab'].includes(event.code)) {
        event.preventDefault();event.stopImmediatePropagation();
        if(event.code==='KeyF' || event.code==='Space')A.keys[event.code]=1;
      }
    },true);
    window.addEventListener('keyup',event=>{const g=current();if(g && g.pow && A.keys)A.keys[event.code]=0;},true);
    window.addEventListener('blur',()=>{const g=current();if(g && g.pow){g.pow.touchInteract=false;g.pow.touchClimb=false;g.pow.holding=null;}touchLook=null;});
    document.addEventListener('mousemove',event=>{
      const g=current();if(!g || !g.pow || g.paused || inputBlocked(g) || document.pointerLockElement!==document.getElementById('stack'))return;
      event.stopImmediatePropagation();const e=g.evade,factor=.0025*(A.set.sens || 1);e.hdg+=event.movementX*factor;e.pitchCmd=clamp((e.pitchCmd || 0)-event.movementY*factor,-.85,1.2);e.look=e.pitchCmd;
    },true);
    const stack=document.getElementById('stack');
    const canvas=document.getElementById('gl');
    if(canvas)canvas.addEventListener('webglcontextlost',()=>{
      const g=current();touchLook=null;
      if(g && g.pow){g.pow.touchInteract=false;g.pow.touchClimb=false;g.pow.holding=null;g.pow.interactLatched=false;}
    });
    if(stack) {
      stack.addEventListener('pointerdown',event=>{const g=current();if(!g || !g.pow || g.paused || inputBlocked(g) || event.pointerType==='mouse' || event.target.closest('button,.tc,#stick') || event.clientX<innerWidth*.43)return;touchLook={id:event.pointerId,x:event.clientX,y:event.clientY};stack.setPointerCapture && stack.setPointerCapture(event.pointerId);event.preventDefault();});
      stack.addEventListener('pointermove',event=>{const g=current();if(!touchLook || touchLook.id!==event.pointerId || !g || !g.pow || inputBlocked(g))return;const e=g.evade;e.hdg+=(event.clientX-touchLook.x)*.006;e.pitchCmd=clamp((e.pitchCmd || 0)-(event.clientY-touchLook.y)*.006,-.85,1.2);e.look=e.pitchCmd;touchLook.x=event.clientX;touchLook.y=event.clientY;event.preventDefault();});
      const release=event=>{if(touchLook && event.pointerId===touchLook.id)touchLook=null;};stack.addEventListener('pointerup',release);stack.addEventListener('pointercancel',release);
    }
  };
})(window);
