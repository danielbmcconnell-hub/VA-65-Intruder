/* A computer crew operating the existing sortie and escape controls.
 * Objective, damage, weapon, collision and recovery code remains authoritative.
 * The normal B/N pilot/ACLS flies commanded heading/altitude/speed targets;
 * this director never moves an aircraft, destroys a target or awards a pass.
 */
(function(root){
 'use strict';
 if(root.MissionDemo?.version===1)return;
 const TAU=Math.PI*2,DEG=Math.PI/180,CONTROL_KEYS=['KeyW','KeyS','KeyA','KeyD','KeyF','KeyV','KeyX','Space','KeyJ','KeyR','KeyG','ShiftLeft','KeyC'];
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),finite=(n,f=0)=>Number.isFinite(n)?n:f,angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
 const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v)),point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite),flat=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
 let ctx=null,hooks=null,session=null,serial=0,ui=null;
 const states=new WeakMap();
 const STEPS={
  launch:['1 · Power and catapult','The computer crew runs up the engines, holds SPACE / COMMIT and lets the aircraft fly off the bow. Gear comes up after a safe climb.'],
  departure:['2 · Climb and departure','Follow the VDI and radar altitude. Smooth pilot commands establish a safe departure before navigation or the carrier circuit.'],
  navigation:['3 · Chart and radar fixes','The crew steers toward each briefed landmark, slews the radar crosshairs and uses LOCK / ENTER. The existing navigation system measures each fix.'],
  acquire:['4 · Identify and designate','The crew compares the briefed target, points the scope and uses the existing LOCK control. A designation does not mean a weapon has hit.'],
  attack:['5 · Fly the solution','The pilot flies the steering needles. SPACE / COMMIT is held through the original ASQ-61 release gate; the original bombs and impacts decide the result.'],
  assess:['6 · Observe the impact','The weapons are in flight. The crew waits for actual impacts, checks the objective and sets up another run if stores and conditions permit.'],
  identify:['4 · Weapons tight','The computer flies close enough to identify each surface contact. It retains every weapon; identification is earned by the original range and altitude checks.'],
  arm:['4 · Emitting radar','The crew approaches the emitting radar and presses COMMIT to fire the existing ARM. The launchers still require a separate conventional attack.'],
  home:['7 · Return and approach setup','The crew returns clean, uses B / SPEEDBRAKE to shed speed, then lowers gear and hook below their operating limit. A stabilized stern approach comes before ship coupling.'],
  landing:['8 · Ball, lineup, angle of attack','The existing ship-coupled ACLS flies the groove. A real arresting wire and the original mission objectives must be satisfied before success is shown.'],
  emergency:['Emergency · reach open water','The objectives are complete, but serious control damage or repeated failed approaches make recovery unsafe. The crew flies toward open water and uses the normal J / EJECT control.'],
  rescue:['Survival · radio, signal, cable','R / RADIO sends three short transmissions. When Jolly is close, G / SMOKE marks the actual pickup. The computer swims to the visible cable and stays beneath it until the normal hoist completes.'],
  eject:['Ejection · J / EJECT','The scripted missile has damaged the aircraft. The computer uses the normal ejection control; the parachute and landing simulation remain active.'],
  capture:['Capture and transfer','This historical-inspired sortie continues through custody. The computer follows the normal surrender and transfer path; the improved ground transition remains visible.'],
  cell:['Escape · inspect and hold F','The computer takes the concealed bracket from the bunk, then holds F at the door fitting. The wall’s tap-code activities are optional; tools and the opening are earned through normal interactions.'],
  roof:['Escape · roof and rope','The computer uses the actual corridor, stairs and roof. It collects the rope and holds F / INTERACT at the outside-wall hook.'],
  hanoi:['Escape · the street','The computer follows the playable street to the river using collision-safe walking. The route and dialogue are a fictional reconstruction.'],
  river:['River · swim, observe and rest','The current and normal swimming controls carry the crew downstream. The computer watches fatigue and physically approaches available landings and the skiff.'],
  gulf:['River · signal and approach','The computer approaches the visible offshore contact and holds the normal signal interaction. This successful continuation is counterfactual; the historical escape ended in recapture.'],
  willard:['Willard · navigate and evade','The computer follows the B/N route through the hostile gun belt. Actual interceptor, terrain, flak and separation checks decide whether both crew reach safety.'],
  completed:['Demonstration complete','The game’s existing outcome reports successful completion. This practice has not changed campaign progress, saved chapters or qualifications.'],
  historical:['Historical chapter complete','The recorded ending is captivity, not an escape to safety. The demonstration does not label this outcome a successful fictional escape.'],
  failed:['Demonstration interrupted','The original game did not report success. No outcome has been forced. Retry the demonstration or take the controls.']
 };
 // Read-only lesson plans. The checklist below always comes from objState;
 // these authored descriptions never create completion or change the pilot.
 const LESSONS={
  m1:{goal:'Launch, fly the carrier circuit and catch an arresting wire.',route:['Launch and climb','Find the moving carrier','Configure gear and hook','Fly ball, lineup and angle of attack'],features:'Catapult · VDI and radar altitude · TACAN/DME · carrier recovery'},
  m2:{goal:'Destroy the required supply-depot targets, then recover aboard.',route:['Take route fixes','Identify and designate the depot','Hold consent through the release solution','Check impacts, then return'],features:'Chart and radar fixes · designation · ASQ-61 steering and release · impact assessment',focus:{acquire:'Compare the depot returns with the briefing before locking.',attack:'Keep the steering needle centered; the computer releases only through its real solution.'}},
  m3:{goal:'Destroy the highway bridge and bring the crew back to the ship.',route:['Launch and establish the low route','Check terrain clearance','Designate and attack the bridge','Return and recover'],features:'VDI terrain display · radar altitude · bridge designation · stabilized release',focus:{navigation:'Read radar altitude and the VDI together; barometric height is not terrain clearance.'}},
  m4:{goal:'Sink the hostile patrol craft and recover aboard.',route:['Find the surface contacts','Identify the hostile boats','Track and attack one boat with SINGLE releases','Confirm sinkings, then return'],features:'Maritime radar · moving-target lead · SINGLE point releases · carrier recovery',controls:{attack:'R → SINGLE (keyboard) · hold SPACE / COMMIT'},focus:{acquire:'Identify the briefed patrol boats before designating a contact.',attack:'Keep the moving boat tracked and confirm SINGLE. R cycles release quantity on keyboard; one point shot avoids an area ripple around a small craft.'}},
  m5:{goal:'Destroy the POL storage in poor weather and complete the instrument recovery.',route:['Use route checkpoints to reduce navigation error','Designate the briefed coordinates','Fly a stable blind attack','Return using the recovery instruments'],features:'Radar fixes and SYS ERR · coordinate designation · blind release · Case III recovery',focus:{navigation:'Watch SYS ERR after each checkpoint fix; navigation error carries into a coordinate attack.',acquire:'The target does not paint through the weather. Use the briefed coordinate ring.'}},
  m6:{goal:'Destroy the required rolling stock and return safely.',route:['Navigate to the railway target','Use the scope to designate rolling stock','Assess actual bomb impacts','Egress and recover'],features:'Radar target comparison · bombing solution · live target count · damage and recovery',focus:{assess:'Wait for the bombs to hit; a release alone does not complete the rolling-stock objective.'}},
  m7:{goal:'Destroy the truck park while clearing the mountain route, then recover.',route:['Follow the mountain route','Use radar altitude to clear rising ground','Assess the area ripple, then refine remaining point attacks','Watch fuel and return'],features:'Mountain navigation · VDI and radar altitude · impact assessment and SINGLE refinement · return planning',focus:{navigation:'Use the VDI and radar altitude to clear the mountain route before concentrating on the target.',attack:'Use the initial area ripple, then check actual impacts before refining the remaining attack points.'}},
  m8:{goal:'Destroy the emitting Fan Song radar and its launchers, then recover.',route:['Depart low, then climb outside the SAM envelope','Fire an ARM only while the radar emits','Attack the launchers with conventional stores','Assess both objectives and return'],features:'Low offshore departure · emitter indication · Standard ARM · separate launcher attack',focus:{arm:'An emitting radar permits the ARM shot. Destroying it does not destroy the launchers.',attack:'Check the separate launcher objective after the radar is silenced.'}},
  m9:{goal:'Identify every surface contact, release no weapons and recover.',route:['Follow the identification track','Pass close and low enough to identify each contact','Keep every weapon aboard','Return and catch a wire'],features:'Surface identification · range and altitude checks · weapons discipline · carrier recovery',focus:{identify:'Watch each contact become identified through the actual pass. Leave attack consent released.'}},
  m10:{goal:'Destroy the storage area and make a controlled recovery.',route:['Navigate and designate','Fly the release solution','Confirm the required destruction','Return to the moving deck'],features:'Radar designation · release consent · target count · instrument recovery',focus:{home:'Use TACAN/DME to find the moving carrier and establish the approach before the groove.'}},
  m11:{goal:'Survive ejection and captivity, then demonstrate the playable escape route.',route:['Eject and descend','Follow capture and transfer','Earn the bracket, door opening and rope','Cross the roof, reach the river and signal offshore'],features:'Dual-crew ejection · capture transition · held interactions · stealth · swimming and fatigue',focus:{cell:'Search the bunk, then hold the door-fitting interaction until the opening is earned.',roof:'Collect the actual rope before using the outside-wall hook.',river:'Watch fatigue and patrols. Float with the current when safe; use swimming for the offshore approach.',gulf:'Approach the contact and hold the signal. This successful continuation is explicitly fictional.'}},
  willard:{goal:'Break the interceptor pursuit and reach safe waters with both crew alive.',route:['Follow the B/N route','Watch the interceptor and gun belt','Use terrain and separation to break pursuit','Reach the safe naval approach'],features:'B/N route · interceptor warnings · flak and terrain evasion · crew survival',focus:{willard:'Watch the pursuit and gun-belt indications while following the B/N route; both crew must survive.'}}
 };
 const GUIDES={
  launch:['Shift / THR + · SPACE / COMMIT','Watch the catapult stroke and a safe climb before configuration.'],
  departure:['G / GEAR · VDI / RAD ALT','Settle the climb and confirm the aircraft is clean.'],
  navigation:['M / CHART · TAB / SCOPE · slew · ENTER / LOCK','Match a briefed landmark and watch the navigation fix register.'],
  acquire:['TAB / SCOPE · crosshairs · ENTER / LOCK','Match the briefing to a real return before designating.'],
  attack:['Hold SPACE / COMMIT','Watch steering, bank and the release gate; consent is held, not tapped.'],
  assess:['Check the objective count','Wait for actual impacts before deciding whether another run is needed.'],
  identify:['SCOPE / CHART · no release','Fly the identification pass with attack consent released.'],
  arm:['SPACE / COMMIT when emitting','Watch the emitter indication and the separate radar/launcher objectives.'],
  home:['B / SPEEDBRAKE · G / GEAR','Watch speed, TACAN/DME, gear and hook before the final approach.'],
  landing:['W A S D / stick · Shift/Ctrl / THR','Watch ball, lineup and AOA. The demonstration uses the existing ACLS; the real wire decides success.'],
  emergency:['J / EJECT after reaching open water','The crew uses ordinary flight and rescue controls when recovery is unsafe.'],
  rescue:['R / RADIO · G / SMOKE · move','Watch radio authentication, helicopter arrival and time beneath the cable.'],
  eject:['J / EJECT · V / CUT CHUTE if snagged','Both surviving aviators eject. The landing surface determines what happens next.'],
  capture:['Use the visible custody / Continue controls','Follow the ground capture, temporary holding and transfer sequence.'],
  cell:['Move and face the object · hold F / INTERACT','Watch interaction progress; the tool and opening are earned, not granted.'],
  roof:['Move · hold F / INTERACT','Use the corridor and stairs, collect the rope, then work the wall hook.'],
  hanoi:['Move · observe patrols','Follow the physical street route toward the river.'],
  river:['Move · F / FLOAT or contextual action','Watch fatigue, patrols, landings and the direction of the current.'],
  gulf:['Approach · hold F / SIGNAL','Watch the close-range signal and the actual rescue acknowledgement.'],
  willard:['CHART · B/N route · flight controls','Watch interceptor separation, terrain clearance and the gun belt.'],
  completed:['Review the completed checklist','The original game has confirmed the result; campaign saves remain protected.'],
  historical:['Review the recorded ending','Captivity is not presented as a successful escape to safety.'],
  failed:['Retry or take the controls','The game did not confirm success. The demonstration never forces a pass.']
 };
 function lesson(g,stageId){
  const m=g?.mis||ctx?.missions.find(m=>m.id===session?.missionId);if(!m)return null;
  const id=stageId||record(g)?.stage||'launch',plan=LESSONS[m.id]||{goal:(m.obj||[]).map(o=>o[0]).join('; '),route:[],features:'Follow the briefing and the actual objective checklist.'},guide=GUIDES[id]||GUIDES.navigation;
  const rows=g?objective(g):[],done=rows.filter(o=>o[2]).length,s=record(g);
  const armDeparture=m.type==='ironhand'&&id==='arm'&&s&&!s.armStandoffReady;
  const pointRefinement=m.id==='m7'&&id==='attack'&&s?.lastImpact>0;
  return {missionId:m.id,title:m.title||m.id,goal:plan.goal,route:plan.route.slice(),features:plan.features,stage:id,control:armDeparture?'Flight controls · stay low offshore, then climb':pointRefinement?'R → SINGLE (keyboard) · hold SPACE / COMMIT':plan.controls?.[id]||guide[0],watch:armDeparture?(s.armDepartureClear?'Outside 26.5 km, climb to the terrain-clear ARM altitude before turning toward the radar.':'The crew stays about 145 m clear of terrain until beyond the SAM tracking envelope.'):pointRefinement?'The first impacts have been assessed. Refine each remaining attack point with SINGLE rather than another area ripple; watch the actual objective count.':plan.focus?.[id]||guide[1],objectives:rows,completed:done,total:rows.length};
 }
 function record(g){return g&&states.get(g);}
 function current(g){const s=record(g);return !!(s&&session===s&&ctx&&ctx.App.game===g);}
 function clearInput(s){const app=s&&s.app;if(!app)return;for(const k of CONTROL_KEYS)if(app.keys)app.keys[k]=0;for(const k of ['pitch','roll','thrUp','thrDn','commit','run','crouch'])if(app.gctl)app.gctl[k]=0;}
 function stage(s,id,detail){const changed=s.stage!==id;if(changed){s.stage=id;s.stageTime=0;s.events.push({at:s.elapsed,stage:id,detail:detail||''});if(s.events.length>96)s.events.shift();}if(detail)s.detail=detail;else if(changed)s.detail='';}
 function eligible(g){return current(g)&&!root.document?.hidden&&!ctx.App.graphicsContextLost&&ctx.App.screen==='game';}
 function objective(g){try{return (g.objState&&g.objState()||[]).map(row=>[String(row[0]),String(row[1]),row[2]===true]);}catch(_){return [];}}
 function doneCombat(g){const rows=objective(g),defs=g.mis.obj||[];return rows.filter((_,i)=>defs[i]?.[1]!=='trap').every(row=>row[2]);}
 function completed(g){if(g.result)return g.result.pass===true?'completed':'failed';if(g.pow?.complete){const o=g.pow.outcome||{};return o.escaped===true||o.rescued===true?'completed':'historical';}return null;}
 function isolate(app){
  const Store=ctx.Store,oldGet=Store&&Store.get,oldSet=Store&&Store.set,memory=new Map(),savedProgress=app.prog,savedSettings={seat:app.set.seat,assist:app.set.assist,mouse:app.set.mouse};
  const owner={app,Store,oldGet,oldSet,memory,savedProgress,savedSettings,pending:true,game:null,active:true};
  if(Store&&typeof oldGet==='function'&&typeof oldSet==='function'){
   owner.get=function(key,fallback){if(owner.active&&memory.has(key))return copy(memory.get(key));return oldGet.call(this,key,fallback);};
   owner.set=function(key,value){if(owner.active){memory.set(key,copy(value));return;}return oldSet.call(this,key,value);};
   Store.get=owner.get;Store.set=owner.set;
  }
  app.prog=copy(app.prog||{done:{},grade:{}});app.set.seat=1;app.set.assist=0;app.set.mouse=0;
  // These are the existing exposed training options, confined to this session.
  memory.set('willard_options',{difficulty:'rookie',strike:true});return owner;
 }
 function restore(s){if(!s||!s.active)return;s.active=false;clearInput(s);const a=s.app;if(s.Store){if(s.Store.get===s.get)s.Store.get=s.oldGet;if(s.Store.set===s.set)s.Store.set=s.oldSet;}a.prog=s.savedProgress;Object.assign(a.set,s.savedSettings);}
 function finish(g,outcome){const s=record(g);if(!s||s.finished)return;clearInput(s);s.finished=true;s.auto=false;s.success=outcome==='completed';stage(s,outcome);s.outcome=copy(g.result||g.pow?.outcome||{});render(g);}
 function stop(returnReady=true){const s=session;if(!s)return false;const g=s.game;restore(s);s.auto=false;s.finished=true;if(g)g.paused=true;if(s.pending&&s.app._missionStart===s.token)s.app._missionStart++;session=null;if(ui)ui.box.hidden=true;if(returnReady&&ctx?.App){ctx.App.game=null;ctx.App.show('ready');}return true;}
 function start(mission,options={}){
  if(!ctx)return false;const m=typeof mission==='string'?ctx.missions.find(m=>m.id===mission):mission;if(!m||!ctx.missions.some(x=>x.id===m.id))return false;
  if(session)stop(false);const app=ctx.App,s=isolate(app);Object.assign(s,{id:++serial,missionId:m.id,auto:true,paused:false,speed:options.speed===4?4:1,elapsed:0,stage:'launch',stageTime:0,events:[],finished:false,success:false,minimized:false,command:null,lastAction:-99,releaseAt:-99,lastDropped:0,lastImpact:0,routeIndex:0,groundPath:[],groundWaypoint:0,groundBlocked:0});session=s;
  app._willardRestore=copy(options.willardRestore)||null;app._dixieRequested=null;app._powLaunch=null;app.briefWorld=null;app.start(m);s.token=app._missionStart;mount();render(null);return true;
 }
 function attach(g){const s=session;if(!s||!s.pending||!g||g.mis.id!==s.missionId||ctx.App._missionStart!==s.token)return false;s.pending=false;s.game=g;states.set(g,s);g.rightSeat=true;g.hud.scope=false;g.extView=false;s.originalSeat=s.savedSettings.seat===1;s.originalAutoFly=g.autoFly;clearInput(s);for(const id of ['teach','teachPeek','legend'])root.document?.getElementById(id)?.classList.remove('on');return true;}
 function setPaused(on){const s=session;if(!s?.game||s.finished)return false;s.paused=!!on;s.game.paused=!!on;clearInput(s);render(s.game);return true;}
 function takeControl(){const s=session;if(!s?.game||s.finished)return false;s.auto=false;s.paused=false;s.game.paused=false;s.game.rightSeat=false;s.game.hud.scope=false;clearInput(s);render(s.game);return true;}
 function resume(){const s=session;if(!s?.game||s.finished)return false;s.auto=true;s.paused=false;s.game.paused=false;s.game.rightSeat=!s.game.pow;clearInput(s);render(s.game);return true;}
 function targetCommand(g,p,altitude,speed=280){return point(p)?{hdg:Math.atan2(p[0]-g.ac.p[0],-(p[2]-g.ac.p[2])),alt:altitude,ias:speed,cat:false}:null;}
 function highest(g,p,clearance){let h=0;const terrain=ctx.terrainH;for(let i=0;i<=8;i++){const t=i/8;h=Math.max(h,finite(terrain(g.ac.p[0]+(p[0]-g.ac.p[0])*t,g.ac.p[2]+(p[2]-g.ac.p[2])*t)));}return Math.max(0,h)+clearance;}
 function emitterAltitude(g,p){let altitude=Math.max(200,finite(ctx.terrainH(g.ac.p[0],g.ac.p[2]))+170);for(let i=1;i<=14;i++){const t=i/16,h=finite(ctx.terrainH(g.ac.p[0]+(p[0]-g.ac.p[0])*t,g.ac.p[2]+(p[2]-g.ac.p[2])*t));if(h>0)altitude=Math.max(altitude,(h+65-p[1]*t)/(1-t));}return altitude;}
 function action(s,g,fn,spacing=.7){if(s.elapsed-s.lastAction<spacing)return false;s.lastAction=s.elapsed;fn();return true;}
 function speedBrake(g,on){if(!!g.brakeHold===!!on)return;const button=root.document?.getElementById('btnBrake');if(button?.click)button.click();else g.brakeHold=!!on;}
 function slew(g,p,lock){const app=ctx.App;if(!point(p)||!g.st||!g.hud?.slewTo)return false;g.hud.scope=true;if(!g.hud.slewTo(g.st,p))return false;if(lock&&typeof app.lockTarget==='function')app.lockTarget();return true;}
 function home(g,s){
  const c=g.world.carrier,CV=ctx.CV,local=ctx.localToWorld,world=ctx.worldToLocal;if(!c||!CV||!local||!world)return null;
  const bolters=finite(g.bolters);if(bolters>finite(s.lastBolters)){s.approachTurning=false;s.lastBolters=bolters;}
  const ca=Math.cos(CV.angle),sa=Math.sin(CV.angle),deck=[c.p[0],c.p[1]+finite(c.heave),c.p[2]],L=world(deck,c.hdg,g.ac.p),ax=L[0]*ca-L[2]*sa,az=L[0]*sa+L[2]*ca;
  const heading=c.hdg-CV.angle,error=Math.abs(angle(g.ac.yaw-heading)),slope=1.55+(az-(CV.wire[1]+2))*Math.tan(3.5*DEG);
  const rigid=root.CarrierLaunch?.deckLocal&&root.CarrierLaunch?.angled?root.CarrierLaunch.angled(root.CarrierLaunch.deckLocal(c,g.ac.p),CV):[ax,L[1],az],actualSlope=1.55+(rigid[2]-(CV.wire[1]+2))*Math.tan(3.5*DEG),glideError=rigid[1]-actualSlope,knots=g.ac.ias*1.9438445;
  if(g.aclsCoupled||rigid[2]>900&&rigid[2]<1800&&Math.abs(rigid[0])<250&&error<20*DEG&&glideError>=-5&&glideError<65&&knots>100&&knots<190){speedBrake(g,false);stage(s,'landing');return null;}
  if(s.approachTurning&&rigid[2]<850){s.approachTurning=false;s.goarounds=finite(s.goarounds)+1;s.detail='The approach is outside the capture limits. The crew climbs away, keeps flying and establishes a fresh stern approach.';}
  stage(s,'home');
  const z=CV.aim+(s.approachTurning?6500:12500),p=local(deck,c.hdg,z*sa,0,z*ca);
  if(flat(g.ac.p,p)<2000)s.approachTurning=true;
  const slowing=s.approachTurning||flat(g.ac.p,p)<8000;if(slowing&&knots>170)speedBrake(g,true);else if(!slowing||knots<155)speedBrake(g,false);
  const target=s.approachTurning?local(deck,c.hdg,0,0,CV.aim):p;
  let altitude=s.approachTurning?deck[1]+Math.max(55,slope+15):deck[1]+730;
  if(s.approachTurning&&rigid[2]<2600&&rigid[2]>850)altitude+=clamp(15-glideError,-40,55);
  if(!s.approachTurning&&g.ac.gear)action(s,g,()=>ctx.App.toggleGear(),1);
  else if(s.approachTurning&&g.ac.ias*1.9438445<250&&!g.ac.gear)action(s,g,()=>ctx.App.toggleGear(),1);
  const lowEgress=!s.approachTurning&&g.mis.id==='m6'&&g.world.sites?.some(site=>site.alive&&flat(site.p,g.ac.p)<23000);
  const speed=s.approachTurning?140:flat(g.ac.p,p)<6500?180:300;
  return targetCommand(g,target,lowEgress?highest(g,target,145):Math.max(altitude,highest(g,target,50)),speed);
 }
 function recoveryTerrainBlocked(g){
  const c=g.world.carrier,CV=ctx.CV,local=ctx.localToWorld;
  if(!c||!CV||!local||typeof ctx.terrainH!=='function')return false;
  const deck=[c.p[0],c.p[1]+finite(c.heave),c.p[2]],wire=CV.wire[1]+2;
  // Sample the real angled-deck glide path before committing to recovery.
  // A ship that has moved close to land must not draw the practice aircraft
  // down through terrain. Existing open-water ejection/SAR remains physical.
  for(const z of [wire,400,900,1500,2500]){
   const p=local(deck,c.hdg,z*Math.sin(CV.angle),0,z*Math.cos(CV.angle));
   const altitude=deck[1]+1.55+(z-wire)*Math.tan(3.5*DEG);
   if(finite(ctx.terrainH(p[0],p[2]))>altitude-12)return true;
  }
  return false;
 }
 function emergency(g,s){
  const ac=g.ac,damage=ac.dmg||{},crew=ac.crew||{};
  if(!s.emergency&&doneCombat(g)){
   const terrainBlocked=!g.aclsCoupled&&recoveryTerrainBlocked(g);
   if(terrainBlocked||finite(damage.hyd)>.65||finite(crew.pilot,1)<.4||finite(damage.eng)>.8||finite(g.bolters)>=2||finite(s.goarounds)>=2)s.emergency={since:s.elapsed,terrainBlocked};
  }
  if(!s.emergency)return false;
  stage(s,'emergency',s.emergency.terrainBlocked?'Terrain obstructs the moving carrier approach. The crew climbs away, flies toward open water and uses the normal ejection and rescue controls.':undefined);speedBrake(g,false);g.app.gctl.commit=0;
  const open=p=>{for(const [x,z] of [[0,0],[1500,0],[-1500,0],[0,1500],[0,-1500]])if(ctx.terrainH(p[0]+x,p[2]+z)>-.8)return false;return true;};
  if(open(ac.p)&&ac.p[1]>45){action(s,g,()=>g.eject(),1);return true;}
  if(!s.emergency.target){
   const candidates=[];for(const r of [3000,6000,12000,24000,48000])for(let i=0;i<8;i++){const a=ac.yaw+i*TAU/8,p=[ac.p[0]+Math.sin(a)*r,0,ac.p[2]-Math.cos(a)*r];if(open(p))candidates.push(p);}
   const carrier=g.world.carrier?.p;if(point(carrier)&&open(carrier))candidates.push(carrier.slice());
   s.emergency.target=candidates.sort((a,b)=>flat(a,ac.p)-flat(b,ac.p))[0]||[ac.p[0]+24000,0,ac.p[2]];
  }
  s.command=targetCommand(g,s.emergency.target,highest(g,s.emergency.target,250),310);return true;
 }
 function rescue(g,s,dt){
  const e=g.evade;stage(s,'rescue');
  if(e.held){action(s,g,()=>{const buttons=root.document?.querySelectorAll('#captVeil.on button')||[];([ ...buttons ].find(b=>/^run$/i.test(b.textContent.trim()))||[...buttons].find(b=>/lie still|go on|continue/i.test(b.textContent)))?.click();},1);return;}
  if(e.radio<1)g.app.keys.KeyR=1;
  if(e.radio>=1&&e.rescue/Math.max(1,e.eta)>.55&&!e.smoke)g.app.keys.KeyG=1;
  const buddy=root.AviatorCompanion?.view?.(g);if(buddy?.active&&!buddy.reunited)action(s,g,()=>root.AviatorCompanion.command(g,'call'),8);
  if(e.jolly?.down&&point(e.jolly.p))navigate(g,s,e.jolly.p,dt,2.5);
  else if(!e.smoke&&buddy?.known&&point(buddy.actors?.[0]?.p))navigate(g,s,buddy.actors[0].p,dt,3.5);
 }
 function flight(g,s,dt){
  const w=g.world,ac=g.ac,app=ctx.App;s.command=null;app.gctl.commit=0;
  if(g.phase==='arresting'){stage(s,'landing','The hook has caught a real wire. The moving deck and arresting gear bring the aircraft to a stop before the original debrief decides the mission outcome.');return;}
  if(ac.onDeck){stage(s,g.wire?'landing':'launch');return;}
  if(ac.alive!==false&&!g.ejected&&['airborne','recovery'].includes(g.phase)&&ac.p[1]>=25&&finite(ac.crew?.pilot,1)<=0&&finite(ac.crew?.bn,1)>0){
   s.abortDetail='The pilot can no longer fly. The surviving aviator uses the original ejection control; unfinished objectives remain incomplete.';stage(s,'emergency',s.abortDetail);app.gctl.commit=0;action(s,g,()=>g.eject(),0);return;
  }
  if(ac.gear&&ac.p[1]>100&&!g.aclsCoupled&&!['home','landing'].includes(s.stage))action(s,g,()=>app.toggleGear(),1);
  if(g.mis.id==='m6')g.apAGL=145;
  if(g.mis.type==='ironhand')g.apAGL=w.radar?.alive?(ac.arms<=0&&!w.arms?.length?145:700):1700;
  if(g.mis.escape){
   stage(s,'departure');s.command=targetCommand(g,w.ipoint||w.briefed,highest(g,w.ipoint||w.briefed,1700),340);
   if(g._samDone||w.score.damage>3.5){stage(s,'eject');action(s,g,()=>g.eject(),1);}return;
  }
  if(g.willard){
   stage(s,'willard');const a=g.willard,r=a.route;let p;
   if(a.phase==='strike')p=r.plan;
   else if(a.phase==='contact'||a.phase==='defend')p=r.plan;
   else if(a.phase==='flak')p=a.flakEntered?r.break:r.flak;
   else p=r.safe;
   const clearance=a.phase==='flak'?650:850;s.command=targetCommand(g,p,highest(g,p,clearance),a.phase==='flak'?420:410);return;
  }
  if(g.mis.type==='carrier_only'&&!g.departed){stage(s,'departure');const c=w.carrier,heading=c.hdg,p=[c.p[0]+Math.sin(heading)*11500,0,c.p[2]-Math.cos(heading)*11500];s.command=targetCommand(g,p,460,250);return;}
  if(emergency(g,s))return;
  const emitter=g.mis.type==='ironhand'&&w.radar?.alive&&(ac.arms>0||w.arms?.length),shotAltitude=emitter?emitterAltitude(g,w.radar.p):null;
  if(emitter&&!s.armStandoffReady){
   if(!s.armStandoffPoint){const c=w.carrier?.p||ac.p,dx=c[0]-w.radar.p[0],dz=c[2]-w.radar.p[2],d=Math.max(1,Math.hypot(dx,dz));s.armStandoffPoint=[w.radar.p[0]+dx/d*35000,0,w.radar.p[2]+dz/d*35000];}
   if(flat(ac.p,w.radar.p)>=26500)s.armDepartureClear=true;
   if(s.armDepartureClear&&flat(ac.p,w.radar.p)>=26500&&ac.p[1]>=Math.max(1700,shotAltitude+100)&&Math.abs(ac.v[1])<10)s.armStandoffReady=true;
  }
  const staging=emitter&&!s.armStandoffReady;
  if(emitter&&!staging&&ac.arms>0&&!w.arms?.length&&ac.p[1]>=shotAltitude&&flat(ac.p,w.radar.p)<23000&&w.radar.emitting&&Math.abs(angle(Math.atan2(w.radar.p[0]-ac.p[0],-(w.radar.p[2]-ac.p[2]))-ac.yaw))<25*DEG&&(s.lastArm===undefined||s.elapsed-s.lastArm>5)){app.gctl.commit=1;s.lastArm=s.elapsed;}
  if(emitter&&w.arms?.length){
   stage(s,'assess','ARM in flight. The crew immediately turns across the radar bearing and descends behind terrain while the real seeker continues independently.');
   const bearing=Math.atan2(w.radar.p[0]-ac.p[0],-(w.radar.p[2]-ac.p[2])),heading=bearing+(angle(ac.yaw-bearing)>=0?Math.PI/2:-Math.PI/2),p=[ac.p[0]+Math.sin(heading)*10000,0,ac.p[2]-Math.cos(heading)*10000];
   let safe=highest(g,p,90);for(const d of [250,500,1000,1800,2600,4000])safe=Math.max(safe,finite(ctx.terrainH(ac.p[0]+Math.sin(ac.yaw)*d,ac.p[2]-Math.cos(ac.yaw)*d))+90);s.command=targetCommand(g,p,safe,410);return;
  }
  const incoming=w.sams?.filter(m=>point(m.p)).sort((a,b)=>flat(a.p,ac.p)-flat(b.p,ac.p))[0];
  if(incoming&&!g.aclsCoupled&&flat(incoming.p,ac.p)<(staging?8000:12000)){
   stage(s,'departure',emitter?'SAM warning: the crew puts the missile on the beam while climbing for a terrain-clear ARM shot. Original seeker guidance, terrain and weapon impacts decide the outcome.':'SAM warning: the computer descends and puts the visible missile on the beam. Low altitude limits the missile’s turning performance; original guidance and collisions still decide the outcome.');
   const bearing=Math.atan2(incoming.p[0]-ac.p[0],-(incoming.p[2]-ac.p[2])),heading=bearing+(angle(ac.yaw-bearing)>=0?Math.PI/2:-Math.PI/2),p=[ac.p[0]+Math.sin(heading)*10000,0,ac.p[2]-Math.cos(heading)*10000];
   let safe=highest(g,p,90);for(const d of [250,500,1000,1800,2600,4000])safe=Math.max(safe,finite(ctx.terrainH(ac.p[0]+Math.sin(ac.yaw)*d,ac.p[2]-Math.cos(ac.yaw)*d))+90);s.command=targetCommand(g,p,emitter?Math.max(safe,shotAltitude+120):safe,410);return;
  }
  if(staging){
   stage(s,'arm',s.armDepartureClear?'The crew has physically cleared 26.5 km from the radar. It climbs toward a 35 km standoff outside the SAM envelope, then turns in for a terrain-clear ARM shot.':'The carrier starts inside the radar threat envelope. The crew turns offshore at about 145 m terrain clearance; it waits until beyond 26.5 km before climbing into radar view.');
   s.command=targetCommand(g,s.armStandoffPoint,s.armDepartureClear?Math.max(highest(g,s.armStandoffPoint,1800),shotAltitude+150):highest(g,s.armStandoffPoint,145),340);return;
  }
  if(g.egressCalled||doneCombat(g)){s.command=home(g,s);return;}
  if(ac.dmg?.diane>.8){stage(s,'failed','DIANE has failed and the original LOCK control cannot designate the remaining objectives. The demonstration is paused without a successful outcome. Take the controls or stop this practice.');s.auto=false;s.paused=true;g.paused=true;g.rightSeat=false;clearInput(s);return;}
  if(g.mis.type==='recce'){
   stage(s,'identify');const p=w.targets.find(t=>!t.bonus&&!t.ident)?.p;if(p)s.command=targetCommand(g,p,highest(g,p,360),285);return;
  }
  if(emitter){stage(s,'arm','The crew climbs until the actual missile line clears the coastal terrain, fires one ARM while the radar emits, and observes its flight before spending the second missile.');s.command=targetCommand(g,w.radar.p,Math.max(1700,shotAltitude+120),320);return;}
  if(g.mis.type==='ironhand'&&w.radar&&!w.radar.alive&&!s.ironClimbComplete){
   if(finite(ac.radalt,ac.p[1]-finite(ctx.terrainH(ac.p[0],ac.p[2])))>1650&&Math.abs(ac.v[1])<4)s.ironClimbComplete=true;
   else{stage(s,'departure','Radar suppressed. The crew climbs outside the site before the conventional attack. Above 1,600m the light gun ring cannot engage; the existing heavy flak remains dangerous.');const h=Math.atan2(ac.p[0]-w.radar.p[0],-(ac.p[2]-w.radar.p[2])),p=[ac.p[0]+Math.sin(h)*10000,0,ac.p[2]-Math.cos(h)*10000];s.command=targetCommand(g,p,highest(g,p,1700),260);return;}
  }
  const cp=w.route&&w.route[w.rtIdx];
  if(cp&&!w.designated&&!(g.mis.type==='ironhand'&&w.radar?.alive)){stage(s,'navigation');s.command=targetCommand(g,cp.p,highest(g,cp.p,g.mis.id==='m6'?145:g.mis.type==='ironhand'?1700:g.mis.blind?900:650),305);if(flat(ac.p,cp.p)<4500)action(s,g,()=>slew(g,cp.p,true),1.5);return;}
  const live=w.targets.filter(t=>t.alive&&!t.bonus),impact=finite(w.score.hits)+finite(w.score.misses),dropped=finite(w.score.dropped);
  if(dropped>s.lastDropped){s.releaseAt=s.elapsed;s.lastDropped=dropped;stage(s,'assess');}
  if(s.releaseAt>=0&&(w.bombs?.length||s.elapsed-s.releaseAt<3)){stage(s,'assess');return;}
  if(impact>s.lastImpact){s.lastImpact=impact;s.releaseAt=-99;s.retarget=true;}
  if(!live.length){s.command=home(g,s);return;}
  if(ac.bombs<=0){s.command=home(g,s);s.detail='Stores are exhausted and the objectives remain incomplete. The computer returns for the original debrief; no successful outcome has been forced. You can still take the controls.';return;}
  if(w.oapLocked){stage(s,'acquire');s.command=targetCommand(g,w.oap.p,highest(g,w.oap.p,g.mis.type==='ironhand'?1700:g.mis.id==='m6'?145:650),300);action(s,g,()=>slew(g,w.oap.p,true),1);return;}
  const designated=w.designated,target=g.mis.type==='ironhand'&&w.radar?.alive?w.radar:live.reduce((a,b)=>flat(a.p,ac.p)<flat(b.p,ac.p)?a:b);
  if(!designated||designated.alive===false||s.retarget){
   stage(s,'acquire');const p=s.lastImpact>0||g.mis.type==='ironhand'?target.p:(w.blind?w.sysPos(w.briefed):w.oap?.p||target.p);if(!designated)s.command=targetCommand(g,p,highest(g,p,g.mis.id==='m6'||g.mis.type==='ironhand'&&w.radar?.alive?145:g.mis.type==='ironhand'?1700:650),300);
   action(s,g,()=>{if(slew(g,p,true)){s.retarget=false;s.aimTarget=target;}},1);return;
  }
  stage(s,'attack');g.ripple=Math.min(g.mis.type==='ironhand'||g.mis.type==='maritime'||g.mis.id==='m7'&&s.lastImpact>0?1:w.targets.length<=2?4:2,ac.bombs);app.gctl.commit=!g.sol||g.sol.tRel>=-.035?1:0;if(!app.gctl.commit)s.detail='The release point has passed without a clean solution. Consent is withdrawn; the crew keeps its bombs and makes another normal run.';else s.detail='';
 }
 function navigate(g,s,p,dt,stop=.75){
  const e=g.evade,dx=p[0]-e.p[0],dz=p[2]-e.p[2],d=Math.hypot(dx,dz),desired=Math.atan2(dx,-dz),he=angle(desired-e.hdg);g.app.gctl.roll=clamp(he*2,-1,1);g.app.gctl.pitch=d>stop&&Math.abs(he)<.8?1:0;g.app.gctl.crouch=g.pow?.stage==='compound';return d<=stop;
 }
 function objectWork(g,s,id,dt){const obj=g.pow.objects.find(o=>o.id===id);if(!obj)return false;if(s.workId!==id){s.workId=id;return false;}const stop=id==='wall-contact'?1.1:id==='river-board'?2.5:id==='river-signal'?4.5:Math.min(.85,finite(obj.radius,1.2)*.65),near=navigate(g,s,obj.p,dt,stop);if(near){g.app.gctl.pitch=0;g.app.gctl.roll=clamp(angle(Math.atan2(obj.p[0]-g.evade.p[0],-(obj.p[2]-g.evade.p[2]))-g.evade.hdg)*2,-1,1);g.app.keys.KeyF=1;}return near;}
 function ground(g,s,dt){
  const p=ctx.POW||root.POW,e=g.evade;if(!e)return;
  if(!g.pow&&!g.mis.escape){rescue(g,s,dt);return;}
  if(!g.pow){stage(s,'capture');g.app.keys.KeyX=1;action(s,g,()=>{const buttons=root.document?.querySelectorAll('#captVeil.on button')||[];const b=[...buttons].find(b=>/hands|surrender|submit|go quietly|continue|go on|lie still/i.test(b.textContent));if(b)b.click();},1);return;}
  if(g.pow.traversal){stage(s,'roof');return;}
  const pow=g.pow,b=pow.base;
  if(pow.captivity?.open){action(s,g,()=>{const buttons=root.document?.querySelectorAll('button')||[];[...buttons].find(b=>b.textContent.trim()==='Return to cell')?.click();},.5);return;}
  if(pow.stage==='cell'){
   stage(s,'cell');if(pow.episodeStealth?.pileRemaining>0)objectWork(g,s,'episode-pebbles',dt);else if(!pow.inventory.bracket)objectWork(g,s,'bunk-bracket',dt);else if(!pow.flags.doorOpen)objectWork(g,s,'door-fitting',dt);else{
    const conceal=pow.objects.find(o=>o.id==='episode-conceal-fitting');
    if(conceal&&!pow.episodeStealth?.tamper?.concealed){objectWork(g,s,'episode-conceal-fitting',dt);return;}
    if(pow.episodeStealth?.stones>0&&!s.stoneThrown&&p.EpisodeStealth?.throwStone){
     if(!s.atThrow){if(navigate(g,s,[b[0],e.p[1],b[2]-3.95],dt,.10))s.atThrow=true;return;}
     g.app.gctl.roll=clamp(angle(-Math.PI/2-e.hdg)*2,-1,1);if(Math.abs(angle(-Math.PI/2-e.hdg))<.08)action(s,g,()=>{if(p.EpisodeStealth.throwStone(g))s.stoneThrown=true;},1);return;
    }
    if(!s.corridorClear){
     // The reconstructed cell's beds flank a one-metre aisle. Wait in the
     // clear apron by the left door jamb, then turn back through the door;
     // the former wide-room hiding point now lies inside a concrete slab.
     if(!s.hideReady){if(navigate(g,s,[b[0]-.65,e.p[1],b[2]-3.0],dt,.18)){s.hideReady=true;s.guardWait=s.elapsed;}return;}
     const guard=e.searchers?.find(a=>a.id==='corridor-sentry'&&a.alive!==false),door=[b[0],b[1],b[2]-5];
     const distracted=s.stoneThrown&&guard&&guard.p[0]<b[0]-4&&flat(guard.p,door)>4;
     if(guard&&!distracted&&(guard.state!=='patrol'||flat(guard.p,door)<7||s.elapsed-s.guardWait<14)){stage(s,'cell','The fitting is covered. An actual thrown stone draws attention down the corridor. The computer waits behind the wall for the patrol to move away.');return;}
     s.corridorClear=true;
    }
    navigate(g,s,[b[0],b[1],b[2]-6],dt,.5);g.app.gctl.run=1;
   }return;
  }
  if(pow.stage==='compound'){
   stage(s,'roof');if(!pow.inventory.rope){const route=[[0,-5.5],[13.8,-5.5],[13.8,-8],[13.8,-16.3],[18,-21],[21,-22]];let i=s.groundWaypoint||0;const q=route[Math.min(i,route.length-1)];if(navigate(g,s,[b[0]+q[0],e.p[1],b[2]+q[1]],dt,.45)&&i<route.length-1)s.groundWaypoint=i+1;if(i===route.length-1)objectWork(g,s,'roof-rope',dt);}else objectWork(g,s,'roof-descent',dt);g.app.gctl.run=1;g.app.gctl.crouch=false;return;
  }
  if(pow.stage==='hanoi'){
   stage(s,'hanoi');const route=[[30,-28],[44,-28],[64,-28],[66,-25],[74,-25],[87,-27],[94,-23]];let i=s.streetWaypoint||0;const q=route[Math.min(i,route.length-1)];if(navigate(g,s,[b[0]+q[0],e.p[1],b[2]+q[1]],dt,.6)&&i<route.length-1)s.streetWaypoint=i+1;g.app.gctl.run=1;return;
  }
  if(pow.stage==='river'){
   const r=pow.river,x=b[0]+94;if(!r){stage(s,'river','Waiting for the river simulation to finish loading.');return;}stage(s,r.phase==='gulf'?'gulf':'river');
   if(r.phase==='gulf'&&r.recoveryPoint){const d=flat(e.p,r.recoveryPoint);navigate(g,s,r.recoveryPoint,dt,3.5);if(r.boatOwned){if(d<17&&r.boat.speed>.45)g.app.gctl.pitch=-1;else if(d<4.5)g.app.gctl.pitch=0;else if(d<17&&r.boat.speed>.2)g.app.gctl.pitch=0;}if(d<7.5&&!r.signaling){g.app.keys.KeyF=1;if(r.boatOwned)g.app.gctl.pitch=r.boat.speed>.4?-1:0;}return;}
   if(r.boat&&!r.boatOwned&&r.phase==='delta'){
    const watched=e.searchers?.some(a=>a.alive!==false&&a.armed!==false&&point(a.p)&&(flat(a.p,r.boat.p)<60||a.state==='pursuit'&&flat(a.p,e.p)<45));
    // A patrol moving away briefly does not make a previously watched boat
    // safe. Do not swim back upstream once the current has carried us past it.
    if(watched||r.boat.p[2]<e.p[2]-8)s.bypassSkiff=true;
    if(!s.bypassSkiff){if(r.mode==='float'&&flat(e.p,r.boat.p)>9)objectWork(g,s,'river-float',dt);else objectWork(g,s,'river-board',dt);return;}
    stage(s,'river','The skiff is watched or already upstream. The computer stays in the channel, conserves strength with the current and prepares to swim toward the offshore recovery contact.');
    if(r.logicalDistance<90000&&r.mode==='swim'&&flat(e.p,r.boat.p)>10){objectWork(g,s,'river-float',dt);return;}
    if(r.logicalDistance>90000&&r.mode==='float'){objectWork(g,s,'river-float',dt);return;}
   }
   // Follow the channel through its actual scrolling geometry. No route
   // coordinates, fatigue, boats or end conditions are advanced by this AI.
   const centre=[x,e.p[1],e.p[2]+14];navigate(g,s,centre,dt,.5);g.app.gctl.crouch=false;return;
  }
  stage(s,'capture','The original game has entered a different captivity chapter. The demonstration is awaiting a normal interaction.');
 }
 function before(g,s,dt){
  clearInput(s);s.elapsed+=dt;s.stageTime+=dt;g.rightSeat=!g.pow;
  if(g.pow||g.evade)ground(g,s,dt);else if(!g.chute)flight(g,s,dt);else{stage(s,'eject',s.abortDetail);if(g.chute.landing?.mode==='hung')g.app.keys.KeyV=1;}
 }
 function after(g,s){const outcome=completed(g);if(outcome)finish(g,outcome);}
 function snapshot(g=session&&session.game){const s=g?record(g):session;if(!s)return {active:false};return {active:!s.finished,missionId:s.missionId,computerPlaying:!!s.auto,paused:!!s.paused,speed:s.speed,elapsed:s.elapsed,stage:s.stage,stageTime:s.stageTime,pending:!!s.pending,success:!!s.success,finished:!!s.finished,detail:s.detail||'',events:s.events.map(e=>({...e})),objectives:g?objective(g):[],outcome:copy(s.outcome||null),campaignIsolated:!!s.active};}
 function mount(){
  if(ui||!root.document)return ui;const host=root.document.getElementById('game');if(!host)return null;const d=root.document,box=d.createElement('section');box.id='missionDemo';box.hidden=true;box.setAttribute('aria-label','Mission demonstration');
  const style=d.createElement('style');style.textContent='#missionDemo{position:absolute;z-index:64;left:calc(80px + env(safe-area-inset-left,0px));bottom:calc(80px + env(safe-area-inset-bottom,0px));width:min(380px,calc(100vw - 175px));font:12px/1.4 system-ui,sans-serif;color:#e8eddf;pointer-events:none}#missionDemo[hidden]{display:none}#missionDemo button{pointer-events:auto;min-height:40px;padding:5px 8px;background:#14212a;color:#f0ead6;border:1px solid #829593;border-radius:3px;touch-action:manipulation;font:600 11px system-ui,sans-serif}#missionDemo .demo-panel{margin-top:4px;background:rgba(6,15,20,.94);border-left:3px solid #d3c680;padding:9px;max-height:min(245px,48vh);overflow:auto;overscroll-behavior:contain;pointer-events:auto}#missionDemo strong{display:block;color:#f0df9d}#missionDemo .demo-progress{font-size:10px;color:#c8d8c6;margin:3px 0}#missionDemo .demo-progress progress{display:block;width:100%;height:5px;margin-top:3px;accent-color:#b8c383}#missionDemo .demo-control,#missionDemo .demo-watch{margin:4px 0;font-size:11px}#missionDemo .demo-guide{border-top:1px solid #526362;margin-top:6px;padding-top:5px}#missionDemo .demo-guide summary{cursor:pointer;min-height:28px;color:#ced6b3;touch-action:manipulation}#missionDemo .demo-guide p{margin:5px 0}#missionDemo .demo-guide ul{margin:6px 0;padding-left:17px}#missionDemo .demo-guide li{margin:4px 0}#missionDemo .demo-guide li[data-complete="true"]{color:#bacf9a}#missionDemo .demo-actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}#missionDemo small{display:block;color:#afc0c6;margin-top:5px}@media(max-height:470px){#missionDemo{bottom:63px;width:min(330px,calc(100vw - 170px));font-size:11px}#missionDemo .demo-panel{max-height:150px;padding:7px}#missionDemo button{min-height:34px}}';
  const toggle=d.createElement('button');toggle.type='button';toggle.textContent='Hide demonstration explanations';toggle.setAttribute('aria-expanded','true');const panel=d.createElement('div');panel.className='demo-panel';const title=d.createElement('strong'),text=d.createElement('p'),note=d.createElement('small'),actions=d.createElement('div'),control=d.createElement('p'),watch=d.createElement('p'),progress=d.createElement('div'),progressText=d.createElement('span'),bar=d.createElement('progress'),guide=d.createElement('details'),summary=d.createElement('summary'),goal=d.createElement('p'),features=d.createElement('p'),checklist=d.createElement('ul');
  actions.className='demo-actions';control.className='demo-control';watch.className='demo-watch';progress.className='demo-progress';guide.className='demo-guide';goal.className='demo-objective';features.className='demo-feature';summary.textContent='Mission guide and objective checklist';bar.setAttribute('aria-label','Completed mission objectives');progress.append(progressText,bar);guide.append(summary,goal,features,text,checklist);note.textContent='Practice · campaign saves protected';panel.append(title,progress,control,watch,guide,actions,note);const buttons={};
  for(const [key,label,fn]of [['pause','Pause',()=>setPaused(!session?.paused)],['take','Take controls',takeControl],['resume','Computer plays',resume],['speed','1× speed',()=>{if(session)session.speed=session.speed===1?4:1;render(session?.game);}],['stop','Stop',()=>stop(true)]]){const b=d.createElement('button');b.type='button';b.dataset.demoAction=key;b.textContent=label;b.onclick=e=>{e.stopPropagation();fn();b.blur();};actions.appendChild(b);buttons[key]=b;}
  toggle.onclick=e=>{e.stopPropagation();if(session)session.minimized=!session.minimized;render(session?.game);toggle.blur();};box.append(style,toggle,panel);host.appendChild(box);ui={box,toggle,panel,title,text,note,buttons,control,watch,progressText,bar,goal,features,checklist};return ui;
 }
 function render(g){if(g){const observed=record(g);if(observed&&!observed.finished)after(g,observed);}const u=mount();if(!u)return;const s=g?record(g):session;u.box.hidden=!s;if(!s)return;const description=STEPS[s.stage]||STEPS.navigation,teaching=lesson(g,s.stage);u.title.textContent=s.pending?'Preparing the mission demonstration':description[0];u.text.textContent=s.detail||description[1];u.panel.hidden=!!s.minimized;u.toggle.textContent=s.minimized?'Show demonstration explanations':'Hide demonstration explanations';u.toggle.setAttribute('aria-expanded',String(!s.minimized));u.buttons.pause.textContent=s.paused?'Resume':'Pause';u.buttons.speed.textContent=s.speed+'× speed';u.buttons.take.hidden=s.finished||!s.auto&&!s.paused;u.buttons.resume.hidden=s.auto||s.finished;u.buttons.pause.hidden=!!s.finished;u.buttons.speed.hidden=!!s.finished;u.note.textContent=s.finished?(s.success?'Existing outcome verified · no campaign award':'Original outcome retained · no forced success'):'Practice · campaign saves protected';
  if(teaching){u.control.textContent='Control: '+teaching.control;u.watch.textContent='Watch: '+teaching.watch;u.goal.textContent='Goal: '+teaching.goal;u.features.textContent='Features: '+teaching.features;u.progressText.textContent=teaching.total?'Objectives '+teaching.completed+' / '+teaching.total+' complete':'Waiting for the mission objectives';u.bar.hidden=!teaching.total;u.bar.max=Math.max(1,teaching.total);u.bar.value=teaching.completed;const key=JSON.stringify(teaching.objectives);if(u.checklistKey!==key){u.checklistKey=key;u.checklist.replaceChildren();for(const [name,status,done]of teaching.objectives){const item=root.document.createElement('li');item.dataset.complete=String(done);item.textContent=(done?'✓ ':'○ ')+name+' · '+status;u.checklist.appendChild(item);}}}
 }
 function ready(app){if(!root.document||app.tab!=='ops')return;const host=root.document.getElementById('readyBody');if(!host||host.querySelector('#missionDemoChooser'))return;const box=root.document.createElement('article');box.id='missionDemoChooser';box.className='card';const body=root.document.createElement('div');body.className='body';const h=root.document.createElement('h2');h.textContent='Watch a mission demonstration';const p=root.document.createElement('p');p.textContent='Watch the computer complete a mission while Control and Watch cues explain its actions. Pause, open the guide or take the controls at any time. Campaign saves stay protected.';const select=root.document.createElement('select');select.id='missionDemoSelect';select.setAttribute('aria-label','Choose a mission demonstration');for(const m of ctx.missions){const o=root.document.createElement('option');o.value=m.id;o.textContent=m.num+' · '+m.title;select.appendChild(o);}const preview=root.document.createElement('section'),goal=root.document.createElement('p'),route=root.document.createElement('ol'),features=root.document.createElement('p');preview.id='missionDemoPreview';preview.setAttribute('aria-live','polite');preview.append(goal,route,features);const refresh=()=>{const m=ctx.missions.find(m=>m.id===(select.value||ctx.missions[0]?.id)),plan=m&&lesson({mis:m});if(!plan)return;goal.textContent='Goal: '+plan.goal;features.textContent='Features: '+plan.features;route.replaceChildren();for(const step of plan.route){const item=root.document.createElement('li');item.textContent=step;route.appendChild(item);}};select.onchange=refresh;refresh();const b=root.document.createElement('button');b.id='missionDemoStart';b.className='btn';b.textContent='Watch demonstration';b.onclick=()=>start(select.value);body.append(h,p,select,preview,b);box.append(body);host.insertBefore(box,host.querySelector('.secthead')||host.firstChild);}
 function install(context){
  if(hooks)return ctx?.App===context?.App;if(!context?.App||!context.Game?.prototype||!Array.isArray(context.missions)||!context.Store||typeof context.terrainH!=='function')return false;ctx=context;
  const proto=ctx.Game.prototype,update=proto.update,auto=proto.autoFly,debrief=proto.debrief,frame=ctx.App.frame,readyOld=ctx.App.renderReady,show=ctx.App.show,startOld=ctx.App.start;
  if(typeof update!=='function'||typeof auto!=='function'||typeof frame!=='function')return false;
  const wrappedUpdate=function(dt){const s=record(this);if(!s||!current(this)||!s.auto||s.finished)return update.apply(this,arguments);if(!eligible(this)||s.paused||this.paused)return;let left=Math.min(.25,Math.max(0,finite(dt)))*s.speed;while(left>1e-8&&!s.finished&&!this.paused){const h=Math.min(left,1/60);before(this,s,h);update.call(this,h);after(this,s);left-=h;}};
  const wrappedAuto=function(dt,ac,w){const s=record(this);if(s&&current(this)&&s.auto){if(this.phase==='arresting')return {};if(s.command){if(this.aclsCoupled)auto.apply(this,arguments);return {...s.command};}}return auto.apply(this,arguments);};
  const wrappedDebrief=function(){const s=record(this);if(s&&!s.active&&!this.result)return;return debrief.apply(this,arguments);};
  const wrappedFrame=function(now){if(session&&!session.pending&&this.game!==session.game)stop(false);if(session?.pending&&this.game)attach(this.game);const r=frame.apply(this,arguments);if(session?.game)render(session.game);return r;};
  const wrappedReady=function(){const r=readyOld.apply(this,arguments);ready(this);return r;};
  const wrappedStart=function(m){if(session&&!session.pending&&this.game===session.game&&ctx.missions.some(x=>x.id===m?.id))return start(m,{willardRestore:copy(this._willardRestore)});return startOld.apply(this,arguments);};
  const wrappedShow=function(id){if(session&&!session.pending&&id!=='game')stop(false);return show.apply(this,arguments);};
  proto.update=wrappedUpdate;proto.autoFly=wrappedAuto;if(typeof debrief==='function')proto.debrief=wrappedDebrief;ctx.App.frame=wrappedFrame;ctx.App.renderReady=wrappedReady;ctx.App.show=wrappedShow;ctx.App.start=wrappedStart;hooks={update,auto,debrief,frame,readyOld,show,startOld,wrappedUpdate,wrappedAuto,wrappedDebrief,wrappedFrame,wrappedReady,wrappedShow,wrappedStart};mount();return true;
 }
 function uninstall(){if(!hooks)return false;stop(false);const p=ctx.Game.prototype,h=hooks;if(p.update===h.wrappedUpdate)p.update=h.update;if(p.autoFly===h.wrappedAuto)p.autoFly=h.auto;if(p.debrief===h.wrappedDebrief)p.debrief=h.debrief;if(ctx.App.frame===h.wrappedFrame)ctx.App.frame=h.frame;if(ctx.App.renderReady===h.wrappedReady)ctx.App.renderReady=h.readyOld;if(ctx.App.show===h.wrappedShow)ctx.App.show=h.show;if(ctx.App.start===h.wrappedStart)ctx.App.start=h.startOld;ui?.box.remove();ui=null;hooks=null;ctx=null;return true;}
 root.MissionDemo=Object.freeze({version:1,install,uninstall,start,stop,setPaused,takeControl,resume,snapshot,completed,targetCommand,highest,emitterAltitude,attach,render,lesson,steps:STEPS});
})(typeof window!=='undefined'?window:globalThis);
