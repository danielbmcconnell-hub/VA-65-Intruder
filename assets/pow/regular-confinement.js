/* Milestone 2.2: regular imprisonment is still imprisonment. This schematic
   compound and every subsequent escape attempt are fictional gameplay, not a
   claim about the layout of Alcatraz or the adjacency of named prisoners. */
(function (global) {
  'use strict';
  const P = global.POW;
  if (!P) throw new Error('POW core must load before regular confinement.');
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const finite = (n,d) => Number.isFinite(n)?n:d;
  const copy = value => JSON.parse(JSON.stringify(value));
  const ROUTE = Object.freeze({cell:[0,.5],door:[0,-3],trough:[-5,-18],workshopDoor:[10,-15],hatch:[20,-20],gate:[20,-31],exit:[20,-32.3],cloth:[1.8,-.8],washScreen:[-6.8,-23],drain:[-2,-24],drainGate:[-2,-34.2],quietExit:[-2,-35.2],forceHatch:[19,-19.8]});
  const SUSPECT_ACTIONS = new Set(['regular-trough-tool','regular-workshop-lock','regular-hatch','regular-hatch-force','regular-exit-gate','regular-drain-panel','regular-drain-gate']);

  function initial() {
    return {version:2,minute:970,elapsedMinutes:0,visits:0,attempts:0,observations:0,
      flags:{cellOpen:false,observed:false,workshopOpen:false,hatchOpen:false,gateOpen:false,drainOpen:false,drainGateOpen:false,hatchForced:false},
      inventory:{tool:false,cloth:false},hatchFasteners:0,drainFasteners:0,suspiciousUntil:0,wantedUntil:0,sleeping:null,
      guidance:true,clueSeen:false,escaped:false,lastMealDay:0,lastRestDay:0,
      checkpoint:'regular-cell',history:'Fictional regular confinement and subsequent escape; named historical POWs remain separate.'};
  }
  function state(game) {
    const s=game.pow;
    if (!s.regular) s.regular=initial();
    const r=s.regular,defaults=initial();
    for(const key of Object.keys(defaults))if(r[key]===undefined)r[key]=copy(defaults[key]);
    for(const [key,value] of Object.entries(defaults.flags))if(r.flags[key]===undefined)r.flags[key]=value;
    r.inventory ||= {tool:false};
    if(r.inventory.cloth===undefined)r.inventory.cloth=false;
    r.minute=clamp(finite(r.minute,970),0,1439.999);r.hatchFasteners=clamp(Math.floor(finite(r.hatchFasteners,0)),0,3);r.drainFasteners=clamp(Math.floor(finite(r.drainFasteners,0)),0,4);
    return r;
  }
  function eligibility(game) {
    const s=game && game.pow,c=s && s.captivity,stats=s && s.stats || {},missing=[];
    if (!s || !c) return {ready:false,missing:['Establish a confinement routine first.'],days:0,projects:0};
    const days=Math.max(0,finite(s.day,1)-finite(c.captureDay,1));
    const projects=Object.keys(c.rewards || {}).filter(key => !['tapReceive','tapSend','exercise','anchor','code'].includes(key));
    const completed=projects.filter(key => finite(c.rewards[key],0)>0).length;
    let communication=finite(c.tap && c.tap.received,0)>=1 && finite(c.tap && c.tap.sent,0)>=1;
    const historicalNetwork=!!(P.Solidarity && P.Solidarity.available && P.Solidarity.available(game));
    if(historicalNetwork)communication=!!(P.Solidarity.ready && P.Solidarity.ready(game));
    if(days<28)missing.push('Live through four weeks of the fictional confinement routine.');
    if(completed<3)missing.push('Complete three different remembered projects or memory activities.');
    if(finite(c.observations,0)<2)missing.push('Observe the corridor on two occasions.');
    if(!communication)missing.push(historicalNetwork?'Complete the covert communication course, a thoughtful response, a remembered project and the decoded guard-routine clue.':'Receive and transmit a correctly decoded tap-code message.');
    if(finite(stats.physical,0)<30)missing.push('Food, rest and gentle conditioning can restore physical condition.');
    if(finite(stats.resilience,0)<25 || finite(stats.morale,0)<20)missing.push('Rest and supportive communication can help before the transfer.');
    if(finite(stats.fatigue,100)>85)missing.push('Rest before moving to another part of the camp.');
    return {ready:missing.length===0,missing,days,projects:completed,communication,historicalNetwork};
  }
  function eligible(game) { return eligibility(game).ready; }
  function notify(game,message) { if(P.notify)P.notify(game,message); }
  function save(game) { if(P.save)P.save(game); }
  function at(game,x,y,z) { const b=game.pow.base;return [b[0]+x,b[1]+y,b[2]+z]; }
  function box(game,id,m,x,y,z,hx,hy,hz,solid,tint) {
    return P.addBox(game,'regular:'+id,m,x,y,z,hx,hy,hz,{solid:!!solid,tint:tint || [1,1,1,0]});
  }
  function remove(game,id) {
    const name='regular:'+id;
    for(const q of game.pow.solids)if(q.id===name || q.id.startsWith(name+':'))q.active=false;
    game.campGeo=(game.campGeo || []).filter(q=>q.id!==name && !q.id.startsWith(name+':'));
    game.pow.navVersion=finite(game.pow.navVersion,0)+1;
  }
  function object(game,id,name,x,y,z,action,extra) {
    return P.object(game,'regular-'+id,name,x,y,z,action,Object.assign({view:false},extra || {}));
  }
  function yardTime(game) { const n=state(game).minute;return n>=960 && n<1080; }
  function insideCell(game) { const p=game.evade.p,b=game.pow.base;return Math.abs(p[0]-b[0])<2.45 && p[2]-b[2]>-2.65 && p[2]-b[2]<3.1; }
  function guardNearby(game,radius) {
    const p=game.evade.p;
    return (game.evade.searchers || []).some(a=>a.alive!==false && a.armed!==false && a.p && Math.hypot(a.p[0]-p[0],a.p[2]-p[2])<(radius || 6) && (!P.los || P.los(game,[a.p[0],a.p[1]+1.5,a.p[2]],[p[0],p[1]+1.0,p[2]])));
  }
  function isSuspicious(game) {
    const s=game && game.pow,e=game && game.evade;
    if(!s || s.stage!=='regular' || !e)return true;
    const r=state(game),x=e.p[0]-s.base[0],z=e.p[2]-s.base[2];
    if(r.suspiciousUntil>finite(s.time,0) || r.wantedUntil>finite(s.time,0) || s.holding && SUSPECT_ACTIONS.has(s.holding.id))return true;
    if(x>9.5 || z<-23.0 || x<-8.2 || z>7.3)return true;
    if(!yardTime(game) && !insideCell(game))return true;
    if(e.running && !insideCell(game))return true;
    return false;
  }
  function attempt(game,loudness,message) {
    const s=game.pow,r=state(game);r.suspiciousUntil=finite(s.time,0)+5;
    if(P.AI && P.AI.noise)P.AI.noise(game,game.evade.p,loudness,'concealed hardware work');
    if(guardNearby(game,5.5)){notify(game,message || 'A guard is too close. Stop work, return to an ordinary posture and wait for the patrol to move.');save(game);return false;}
    return true;
  }
  function openCell(game) {
    const r=state(game);
    if(!yardTime(game)){notify(game,'The exercise period is 16:00–18:00 in this fictional routine. Rest at the mat, observe the door, and wait; this door is not an escape.');return false;}
    if(!r.flags.cellOpen){r.flags.cellOpen=true;remove(game,'cell-door');}
    notify(game,'The supervised yard is accessible. Walking calmly in the permitted yard is allowed; entering the workshop or working hidden hardware is suspicious.');save(game);return true;
  }
  function observe(game) {
    const r=state(game);r.observations++;r.flags.observed=true;
    let clue='The yard round passes the water trough, then turns at the crate. A solid washing screen hides a covered drain passage behind the north wall: slow work with a cloth-wrapped tool is quiet. The east workshop is a shorter exposed route; forcing its hatch is loud and attracts investigation. Watch the actual guards before either attempt.';
    if(P.Solidarity && P.Solidarity.escapeClue){const value=P.Solidarity.escapeClue(game);if(value){r.clueSeen=true;clue+= ' '+(typeof value==='string'?value:value.text || value.message || 'Your received message suggests watching the change of patrol.');}}
    notify(game,'Observation '+r.observations+': '+clue+' These are fictional gameplay routines, not a documented plan of a historical escape.');save(game);return true;
  }
  function tool(game) {
    const r=state(game);
    if(!r.flags.observed){notify(game,'Observe the corridor and yard before drawing attention to the water trough.');return false;}
    if(!attempt(game,.15))return false;
    r.inventory.tool=true;remove(game,'loose-strip');notify(game,'A narrow loose strip can work a latch. Keep it concealed. The workshop door is on the east side of the yard.');save(game);return true;
  }
  function workshop(game) {
    const r=state(game);
    if(!r.inventory.tool){notify(game,'The workshop door is locked. Search the permitted yard for a usable piece of metal.');return false;}
    if(!attempt(game,.12))return false;
    r.flags.workshopOpen=true;remove(game,'workshop-door');notify(game,'The workshop latch is free. Physically enter only when the patrol is looking elsewhere. The rear service hatch still has three fasteners.');save(game);return true;
  }
  function hatch(game) {
    const r=state(game);
    if(!r.inventory.tool || !r.flags.workshopOpen){notify(game,'A narrow tool and an open workshop route are needed.');return false;}
    if(!attempt(game,.27))return false;
    r.hatchFasteners=Math.min(3,r.hatchFasteners+1);
    if(r.hatchFasteners===3){r.flags.hatchOpen=true;remove(game,'service-hatch');notify(game,'The third fastener is free. Walk through the rear opening into the narrow service passage. Its outer gate is still locked.');}
    else notify(game,'Service hatch fastener '+r.hatchFasteners+'/3. Release the interaction, listen and check the patrol before the next fastener.');
    save(game);return true;
  }
  function takeCloth(game) {
    const r=state(game);
    if(r.inventory.cloth)return false;
    r.inventory.cloth=true;remove(game,'cloth');
    notify(game,'A worn cloth can wrap the metal strip to muffle work on the drain-panel fasteners. It takes longer than forcing the workshop hatch. Carrying it does not open an escape route.');save(game);return true;
  }
  function drainPanel(game) {
    const r=state(game);
    if(!r.flags.observed || !r.inventory.tool || !r.inventory.cloth){notify(game,'Observe the yard, find the metal strip, and take the worn cloth from the cell to work this panel quietly.');return false;}
    if(!attempt(game,.035,'Wait behind the washing screen until the nearby guard has turned away.'))return false;
    r.drainFasteners=Math.min(4,r.drainFasteners+1);
    if(r.drainFasteners===4){r.flags.drainOpen=true;remove(game,'drain-panel');notify(game,'Four cloth-muffled fasteners are clear. Physically enter the covered washing passage. Its distant outside grate is still locked.');}
    else notify(game,'Quiet drain fastener '+r.drainFasteners+'/4. Release F between fasteners. The washing screen blocks sight, but footsteps at the screen’s ends still matter.');
    save(game);return true;
  }
  function drainGate(game) {
    const r=state(game);
    if(!r.flags.drainOpen || !r.inventory.tool || !r.inventory.cloth){notify(game,'The covered washing passage and a cloth-wrapped tool are needed.');return false;}
    if(!attempt(game,.04,'An outside patrol is too near the grate. Stay behind the covered passage wall and wait.'))return false;
    r.flags.drainGateOpen=true;remove(game,'drain-gate');notify(game,'The outside grate is unbolted quietly. Move through it and beyond the compound boundary. This is still an escape attempt, not freedom.');save(game);return true;
  }
  function forceHatch(game) {
    const s=game.pow,r=state(game);
    if(!r.inventory.tool || !r.flags.workshopOpen){notify(game,'The workshop must be physically accessible and a usable metal strip is required.');return false;}
    // A fast physical alternative trades time for an audible disturbance. Its
    // guards still navigate normally to the remembered sound; no capture roll.
    r.suspiciousUntil=finite(s.time,0)+25;
    if(P.AI && P.AI.noise)P.AI.noise(game,game.evade.p,2.2,'forced service-hatch hinge');
    if(guardNearby(game,2.0)){notify(game,'A guard is within reach. The attempted leverage makes a loud metallic sound; stop and evade the approaching patrol.');save(game);return false;}
    r.hatchFasteners=3;r.flags.hatchOpen=true;r.flags.hatchForced=true;remove(game,'service-hatch');
    for(let i=0;i<3;i++)remove(game,'hatch-fastener:'+i);
    notify(game,'The hinge gives with a loud crack. Guards investigate the sound. Move through the real passage, observe the outside patrol, and work the gate before the search closes in.');save(game);return true;
  }
  function gate(game) {
    const r=state(game);
    if(!r.flags.hatchOpen || !r.inventory.tool){notify(game,'The service passage is not yet accessible.');return false;}
    if(!attempt(game,.38,'A patrol is too close to the outside gate. Hide behind the passage wall and observe before working the bolt.'))return false;
    r.flags.gateOpen=true;remove(game,'exit-gate');notify(game,'The gate is open. You are still in the prison. Move through the passage and cross the outside boundary; the Hanoi street and river remain ahead.');save(game);return true;
  }
  function restStart(game) {
    const r=state(game);
    if(!insideCell(game)){notify(game,'Rest is possible at the sleeping mat inside the assigned cell.');return false;}
    if(r.sleeping)return false;
    r.sleeping={elapsed:0,duration:16,minutes:0};notify(game,'Resting on the mat. Sixteen real seconds represent eight fictional hours. Move to interrupt; the camp remains secure.');save(game);return true;
  }
  function meal(game) {
    const r=state(game),s=game.pow;
    if(r.lastMealDay===s.day){notify(game,'Today’s ration has already been eaten.');return false;}
    r.lastMealDay=s.day;s.stats.physical=clamp(finite(s.stats.physical,50)+3,0,100);s.stats.morale=clamp(finite(s.stats.morale,50)+1,0,100);
    notify(game,'A limited daily ration. It supports condition; it does not open any route out of the camp.');save(game);return true;
  }
  function addGuards(game) {
    const s=game.pow,r=state(game),attempts=finite(s.flags.recaptures,0),seed=[
      {id:'regular-corridor',route:[[-5,-5.7],[5,-5.7],[5,-8.7],[-5,-8.7]],dwell:4,lamp:true},
      {id:'regular-yard',route:[[-7,-11],[6,-11],[6,-19.2],[-7,-19.2]],dwell:3},
      {id:'regular-workshop',route:[[13,-14],[20,-14],[20,-18.5],[13,-18.5]],dwell:5},
      {id:'regular-outside',route:[[25,-34],[20,-36],[15,-34],[20,-36]],dwell:3}
    ];
    game.evade.searchers=seed.map((o,i)=>{
      const route=o.route.map(q=>at(game,q[0],0,q[1]));
      const opts={...o,kind:'nva',p:route[0],route,face:i===2?Math.PI/2:0,schedule:{cycle:112+i*9,rounds:84+i*2,offset:(i*23+attempts*17)%112}};
      return P.AI && P.AI.makeActor?P.AI.makeActor(opts):Object.assign(opts,{alive:true,armed:true,state:'patrol',sus:0,spd:0,ph:0,goal:route[0]});
    });
    s.actors=game.evade.searchers;s.aiRoster='regular';s.aiStage='regular';r.attempts=attempts;
  }
  function build(game) {
    const s=game.pow,r=state(game),b=s.base;
    game.campGeo=[];s.solids=[];s.surfaces=[];s.objects=[];
    s.nav={minX:b[0]-12,maxX:b[0]+29,minZ:b[2]-39,maxZ:b[2]+10,cell:1};s.navVersion=finite(s.navVersion,0)+1;
    box(game,'pad','powMud',8,-.55,-13,48,.55,45,false);
    box(game,'yard-path','powStone',0,.015,-14,7.6,.015,10,false,[.68,.68,.63,0]);
    box(game,'west-wall','powStone',-9,1.8,-8,.22,1.8,16,true);
    box(game,'east-wall','powStone',23,1.8,-8,.22,1.8,16,true);
    box(game,'south-wall','powStone',7,1.8,8,16.2,1.8,.22,true);
    box(game,'north-wall-a-left','powStone',-6.15,1.8,-24,2.85,1.8,.22,true);
    box(game,'north-wall-a-right','powStone',8.65,1.8,-24,9.35,1.8,.22,true);
    box(game,'north-wall-b','powStone',22.5,1.8,-24,.5,1.8,.22,true);
    box(game,'cell-west','powStone',-2.7,1.4,0,.18,1.4,3.2,true);
    box(game,'cell-east','powStone',2.7,1.4,0,.18,1.4,3.2,true);
    box(game,'cell-back','powStone',0,1.4,3.2,2.88,1.4,.18,true);
    box(game,'cell-front-a','powStone',-1.9,1.4,-3.2,.8,1.4,.18,true);
    box(game,'cell-front-b','powStone',1.9,1.4,-3.2,.8,1.4,.18,true);
    box(game,'cell-lintel','powStone',0,2.55,-3.2,1.1,.25,.18,true);
    box(game,'cell-roof','powStone',0,2.97,0,2.88,.12,3.38,true);
    box(game,'cell-door','powWood',0,1.10,-3.2,1.1,1.10,.065,true);
    box(game,'door-slot','powDark',.62,1.6,-3.11,.19,.15,.025,false);
    for(let i=-2;i<=2;i++)box(game,'slotbar:'+i,'powMetal',.62+i*.065,1.6,-3.08,.011,.15,.019,false);
    box(game,'bed','powWood',-1.7,.18,.7,.52,.18,1.2,true);
    box(game,'mat','powMud',-1.7,.38,.7,.50,.015,1.18,false,[1.4,1.25,1,0]);
    box(game,'tray','powMetal',1.85,.08,1.8,.22,.045,.20,false);
    box(game,'cloth','powPale',1.8,.32,-.8,.15,.018,.23,false,[.78,.74,.65,0]);
    box(game,'bulb-wire','powMetal',0,2.6,.4,.015,.23,.015,false);
    box(game,'bulb','powPale',0,2.38,.4,.055,.055,.055,false,[1,.85,.6,1]);
    box(game,'corridor-floor','powStone',0,-.015,-5.5,8.4,.025,2.0,false);
    box(game,'corridor-post-a','powWood',-7.7,1.6,-5.5,.065,1.6,.065,true);
    box(game,'corridor-post-b','powWood',7.7,1.6,-5.5,.065,1.6,.065,true);
    box(game,'corridor-roof','powWood',0,3.22,-5.5,8.4,.10,2,false);
    box(game,'yard-privacy-wall','powStone',-4,1.2,-16,.14,1.2,2.8,true);
    box(game,'trough','powStone',-5.3,.48,-18,.56,.48,.6,true);
    box(game,'water','powWater',-5.3,.97,-18,.49,.015,.52,false);
    box(game,'loose-strip','powMetal',-5.85,.92,-17.5,.018,.012,.15,false);
    box(game,'yard-crate','powWood',4,.60,-20.5,.7,.6,.7,true);
    box(game,'workshop-privacy-stack','powWood',8,1.05,-14.6,.25,1.05,2.8,true);
    box(game,'workshop-west-a','powStone',10,1.5,-11.9,.18,1.5,2.1,true);
    box(game,'workshop-west-b','powStone',10,1.5,-18,.18,1.5,2,true);
    box(game,'workshop-door','powWood',10,1.1,-15,.075,1.1,1.0,true);
    box(game,'workshop-south','powStone',16,1.5,-9.8,6.18,1.5,.18,true);
    box(game,'workshop-east','powStone',22,1.5,-15,.18,1.5,5.2,true);
    box(game,'workshop-north','powStone',14,1.5,-20,4,1.5,.18,true);
    box(game,'workshop-lintel','powStone',20,2.8,-20,2,.30,.18,true);
    box(game,'service-hatch','powWood',20,1.2,-20,1.82,1.2,.07,true);
    for(let i=0;i<3;i++)box(game,'hatch-fastener:'+i,'powMetal',18.35+i*1.65,1.0,-19.9,.033,.055,.033,false);
    box(game,'workbench','powWood',15,.58,-11.8,1.5,.58,.50,true);
    box(game,'tool-rack','powMetal',21.7,1.25,-14,.05,.5,.7,false);
    box(game,'shed-crate','powWood',17,.75,-16,.65,.75,.65,true);
    box(game,'passage-left','powStone',18,1.5,-25.6,.18,1.5,5.6,true);
    box(game,'passage-right','powStone',22,1.5,-25.6,.18,1.5,5.6,true);
    box(game,'passage-floor','powStone',20,-.005,-25.6,1.8,.015,5.6,false);
    box(game,'exit-gate','powWood',20,1.25,-31.2,1.82,1.25,.07,true);
    box(game,'outside-cart','powWood',25,.6,-32.0,1,.6,.65,true);
    // The quiet route has a separate locked entry and outside grate. The screen
    // and continuous passage walls provide actual LOS cover, not a hide toggle.
    box(game,'washing-screen','powWood',-2.6,1.35,-21.5,3.6,1.35,.12,true);
    for(let i=0;i<6;i++)box(game,'washing-cloth:'+i,'powPale',-5.5+i*1.0,2.10,-21.34,.39,.5,.025,false,[.60,.57,.52,0]);
    box(game,'drain-panel','powWood',-2,1.25,-24,1.28,1.25,.09,true);
    for(let i=0;i<4;i++)box(game,'drain-fastener:'+i,'powMetal',-3.0+i*.67,1.12,-23.85,.028,.04,.025,false);
    box(game,'drain-left','powStone',-3.4,1.30,-29.1,.16,1.30,5.1,true);
    box(game,'drain-right','powStone',-.6,1.30,-29.1,.16,1.30,5.1,true);
    box(game,'drain-roof','powStone',-2,2.35,-29.1,1.56,.12,5.1,true);
    box(game,'drain-floor','powStone',-2,.005,-29.1,1.22,.015,5.1,false);
    box(game,'drain-gate','powMetal',-2,1.25,-34.2,1.22,1.25,.065,true);
    // Exterior bounds prevent walking around the perimeter rather than escaping.
    box(game,'bound-west','powDark',-11,4,-15,.22,4,24,true);
    box(game,'bound-east','powDark',29,4,-15,.22,4,24,true);
    box(game,'bound-north','powDark',9,4,-39,20.2,4,.22,true);
    box(game,'bound-south','powDark',9,4,9,20.2,4,.22,true);
    s.cellDoor=at(game,0,1,-3.2);
    s.lights=[{p:at(game,0,2.38,.4),color:[1,.85,.62],radius:6,power:1,permanent:true}];
    object(game,'cell-door','Accept the supervised yard period · still imprisoned',0,1.1,-3.06,()=>openCell(game),{radius:1.5,hold:1.2,enabled:()=>!r.flags.cellOpen});
    object(game,'observe','Observe the guard routine through the door slot',.62,1.6,-2.99,()=>observe(game),{radius:1.35,hold:2.2});
    object(game,'rest','Rest on the assigned sleeping mat',-1.7,.5,.7,()=>restStart(game),{radius:1.35,hold:1.5});
    object(game,'meal','Eat the limited daily ration',1.8,.18,1.8,()=>meal(game),{radius:1.25,hold:2});
    object(game,'cloth','Take the worn cloth for muffled work',1.8,.5,-.8,()=>takeCloth(game),{radius:1.20,hold:8,view:true,enabled:()=>!r.inventory.cloth});
    object(game,'trough-tool','Work the loose metal strip quietly',-5.85,.9,-17.5,()=>tool(game),{radius:1.25,hold:4,noise:.13,view:true,enabled:()=>!r.inventory.tool});
    object(game,'workshop-lock','Work the restricted workshop latch',9.82,1,-15,()=>workshop(game),{radius:1.55,hold:6,noise:.20,view:true,enabled:()=>!r.flags.workshopOpen,canHold:()=>r.inventory.tool});
    object(game,'hatch','Loosen one service-hatch fastener · '+r.hatchFasteners+'/3',20,1,-19.8,()=>hatch(game),{radius:1.7,hold:5,noise:.20,view:true,enabled:()=>!r.flags.hatchOpen,canHold:()=>r.inventory.tool});
    object(game,'hatch-force','Force the service-hatch hinge · FAST / LOUD',19,1,-19.8,()=>forceHatch(game),{radius:1.25,hold:2.5,view:true,enabled:()=>!r.flags.hatchOpen,canHold:()=>r.inventory.tool});
    object(game,'exit-gate','Work the outside gate bolt',20,1.1,-31.05,()=>gate(game),{radius:1.6,hold:7,noise:.22,view:true,enabled:()=>!r.flags.gateOpen,canHold:()=>r.inventory.tool});
    object(game,'listen','Listen at the workshop wall',9.75,1,-12,()=>{
      const guard=(game.evade.searchers || []).find(a=>a.id==='regular-workshop');
      const p=guard && guard.p,b=s.base;
      const cue=!guard?'No clear footsteps right now.':guard.state==='pursuit' || guard.state==='investigate'?'Hurried footsteps approach the latch.':p[0]-b[0]>18.5 && p[2]-b[2]>-15.5?'Footsteps have reached the far front bench; the next round goes toward the rear.':guard.onPost?'The front post is occupied. Wait behind the stack and observe before entering.':'Footsteps continue around the work area. Listen for the far front bench, then watch the direction through the doorway.';
      notify(game,cue+' The wood stack west of the door is real cover. A quiet latch takes six seconds; forced hardware is fast and loud. No clue opens a lock for you.');
    },{radius:1.3,hold:1.2});
    object(game,'drain-panel','Work one cloth-muffled drain fastener · '+r.drainFasteners+'/4',-2,1.05,-23.80,()=>drainPanel(game),{radius:1.40,hold:8,noise:.025,view:true,enabled:()=>!r.flags.drainOpen,canHold:()=>r.inventory.tool && r.inventory.cloth});
    object(game,'drain-gate','Unbolt the outside grate · SLOW / QUIET',-2,1.05,-34.05,()=>drainGate(game),{radius:1.45,hold:12,noise:.025,view:true,enabled:()=>!r.flags.drainGateOpen,canHold:()=>r.inventory.tool && r.inventory.cloth});
    object(game,'wash-observe','Observe the covered washing passage and yard patrol',-6.9,1.4,-22.0,()=>notify(game,'The solid washing screen hides the drain-panel face. The yard guard turns at the crate, south of the screen. Four separate muffled fasteners are slower than forcing the east hatch; crouched footsteps are quieter. Wait until the actual patrol passes before moving around the screen.'),{radius:1.25,hold:1.5});
    if(r.flags.cellOpen)remove(game,'cell-door');
    if(r.inventory.tool)remove(game,'loose-strip');
    if(r.inventory.cloth)remove(game,'cloth');
    if(r.flags.workshopOpen)remove(game,'workshop-door');
    if(r.flags.hatchOpen)remove(game,'service-hatch');
    if(r.flags.gateOpen)remove(game,'exit-gate');
    if(r.flags.drainOpen)remove(game,'drain-panel');
    if(r.flags.drainGateOpen)remove(game,'drain-gate');
    for(let i=0;i<r.hatchFasteners;i++)remove(game,'hatch-fastener:'+i);
    for(let i=0;i<r.drainFasteners;i++)remove(game,'drain-fastener:'+i);
    s.motion={radius:.32,speed:1.8};s.movementScale=1;s.customMovement=false;s.light=.20;s.cover=0;
    s.objective='Regular imprisonment · observe the guards: slow covered washing passage or faster exposed workshop. Fictional schematic.';
    s.checkpoint=r.checkpoint;
  }
  function enter(game,options) {
    if(!game || !game.pow || !game.evade)return false;
    const s=game.pow,r=state(game),restore=options && options.restore;
    if(!restore){
      const visits=r.visits+1,knowledge=r.observations,guide=r.guidance;
      s.regular=Object.assign(initial(),{visits,observations:knowledge,guidance:guide,attempts:finite(s.flags.recaptures,0)});
      if(s.captivity)s.captivity.minute=970;
    }
    else state(game).sleeping=null;
    s.stage='regular';s.complete=false;s.holding=null;s.traversal=null;s.interactLatched=false;s.flags.capturePending=false;
    s.river=null;s.captivity && (s.captivity.open=false);game.paused=false;
    build(game);addGuards(game);
    if(!restore){game.evade.p.splice(0,3,...at(game,0,0,.5));game.evade.hdg=0;game.evade.look=0;game.evade.pitchCmd=0;}
    game.evade.inCell=0;game.evade.camp=true;game.evade.frozen=false;game.evade.running=false;s.p=game.evade.p;
    if(game.setHour)game.setHour(state(game).minute/60,.45);
    notify(game,'Transfer to regular confinement, not release to freedom. This fictional secure camp offers a supervised yard period and a new physical escape opportunity. Observe the slot before leaving the cell.');save(game);return true;
  }
  function prepare(game) {
    if(!game || !game.pow || game.pow.stage!=='regular')return;
    const s=game.pow,r=state(game);
    s.customMovement=false;s.motion={radius:.32,speed:r.sleeping?0:1.8};s.movementScale=1;s.cover=0;
    // Returning to a permitted area does not erase an observed escape attempt.
    // The alert decays only after the active pursuer loses sight and searches.
    if((game.evade.searchers || []).some(a=>a.alive!==false && a.state==='pursuit' && a.visible))r.wantedUntil=finite(s.time,0)+12;
    if(r.sleeping && s.input && (s.input.forward || s.input.strafe || s.input.run)){r.sleeping=null;notify(game,'Rest interrupted. You remain inside the assigned cell.');}
    s.aiRoster='regular';s.actors=game.evade.searchers;
  }
  function advance(game,minutes) {
    const s=game.pow,r=state(game);r.elapsedMinutes+=minutes;
    if(P.Captivity && P.Captivity.advance && s.captivity){P.Captivity.advance(game,minutes,'rest');r.minute=s.captivity.minute;}
    else {r.minute+=minutes;while(r.minute>=1440){r.minute-=1440;s.day++;}}
  }
  function step(game,dt) {
    const s=game && game.pow,e=game && game.evade;
    if(!s || s.stage!=='regular' || !e || s.complete || game.paused)return;
    dt=clamp(finite(dt,0),0,.25);const r=state(game);
    if(r.sleeping){
      const a=r.sleeping,elapsed=Math.min(dt,a.duration-a.elapsed);a.elapsed+=elapsed;a.minutes+=elapsed*30;advance(game,elapsed*30);
      s.stats.fatigue=clamp(finite(s.stats.fatigue,0)-elapsed*2,0,100);
      s.stats.physical=clamp(finite(s.stats.physical,50)+elapsed*.12,0,100);
      if(a.elapsed>=a.duration){r.sleeping=null;r.lastRestDay=s.day;notify(game,'Rested through eight fictional hours. The supervised yard opens again at 16:00; observe and wait safely in the cell.');save(game);}
    }else advance(game,dt);
    if(!yardTime(game) && r.flags.cellOpen && insideCell(game)){
      r.flags.cellOpen=false;box(game,'cell-door','powWood',0,1.10,-3.2,1.1,1.10,.065,true);save(game);
    }
    const x=e.p[0]-s.base[0],z=e.p[2]-s.base[2];
    const hatchObject=s.objects.find(o=>o.id==='regular-hatch');
    if(hatchObject)hatchObject.name='Loosen one service-hatch fastener · '+r.hatchFasteners+'/3';
    const drainObject=s.objects.find(o=>o.id==='regular-drain-panel');
    if(drainObject)drainObject.name='Work one cloth-muffled drain fastener · '+r.drainFasteners+'/4';
    if(r.hatchFasteners)for(let i=0;i<r.hatchFasteners;i++)removeFastenerVisual(game,i);
    if(r.drainFasteners)for(let i=0;i<r.drainFasteners;i++)removeVisual(game,'drain-fastener:'+i);
    if(r.flags.hatchOpen && z<-20.7 && r.checkpoint!=='regular-passage'){r.checkpoint='regular-passage';save(game);notify(game,'Checkpoint: narrow service passage. Observe the outside patrol and work the gate; continue moving to leave the compound.');}
    if(r.flags.drainOpen && z<-24.7 && x>-3.05 && x<-.95 && r.checkpoint!=='regular-washing-passage'){r.checkpoint='regular-washing-passage';save(game);notify(game,'Checkpoint: covered washing passage. The outside grate is a separate physical barrier. Crouch, listen, and work it quietly.');}
    const fastExit=r.flags.gateOpen && r.flags.hatchOpen && r.flags.workshopOpen && x>18.35 && x<21.65 && z<-32.0;
    const quietExit=r.flags.drainOpen && r.flags.drainGateOpen && x>-3.0 && x<-1.0 && z<-35.0;
    if((fastExit || quietExit) && !r.escaped){
      r.escaped=true;s.flags.regularEscape=true;s.flags.outside=true;
      r.escapeRoute=quietExit?'covered-washing-passage':r.flags.hatchForced?'forced-workshop-hatch':'workshop-fasteners';
      const snap=P.save?P.save(game):null;
      notify(game,'You physically crossed the outer boundary. This alternate escape continues on the Hanoi street; freedom and the river are still ahead.');
      if(P.begin && snap){delete snap.p;snap.stage='hanoi';snap.complete=false;P.begin(game,'hanoi',snap);}
      else if(P.transition)P.transition(game,'hanoi');
      return;
    }
    r.uiTick=finite(r.uiTick,0)+dt;
    if(r.uiTick>.3){
      r.uiTick=0;s.objective=(r.sleeping?'Resting on the mat':yardTime(game)?'Yard period 16:00–18:00 · calm movement allowed':'Outside the cell is restricted until 16:00')+' · '+String(Math.floor(r.minute/60)).padStart(2,'0')+':'+String(Math.floor(r.minute%60)).padStart(2,'0')+' · '+(r.flags.drainGateOpen?'Grate open: move beyond the boundary':r.flags.drainOpen?'Covered passage: quietly work the outside grate':r.flags.gateOpen?'Gate open: move through the boundary':r.flags.hatchOpen?'Enter the passage and work the outside bolt':r.flags.workshopOpen?'Three slow fasteners or quick loud hinge leverage: watch the patrol':r.inventory.tool?'Covered washing passage (cloth needed) or exposed east workshop':'Observe the slot, take the cloth, then search the yard trough quietly');
    }
  }
  function removeFastenerVisual(game,i) {
    removeVisual(game,'hatch-fastener:'+i);
  }
  function removeVisual(game,name) {
    const id='regular:'+name;
    if(game.campGeo.some(q=>q.id===id))game.campGeo=game.campGeo.filter(q=>q.id!==id);
  }
  function snapshot(game) { return game && game.pow && game.pow.regular?copy(game.pow.regular):null; }
  function restore(game,data) {
    if(!game || !game.pow || !data || typeof data!=='object')return false;
    game.pow.regular=Object.assign(initial(),copy(data));state(game);
    game.pow.regular.sleeping=null;build(game);return true;
  }
  P.RegularConfinement={initial,state,eligibility,eligible,enter,build,prepare,step,snapshot,restore,isSuspicious,guardNearby,yardTime,insideCell,openCell,observe,tool,workshop,hatch,forceHatch,takeCloth,drainPanel,drainGate,gate,restStart,meal,route:ROUTE};
})(typeof window!=='undefined'?window:globalThis);
