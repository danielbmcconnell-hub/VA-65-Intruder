/* WILLARD EGRESS. Authored, playable reconstruction; see the historical audit.
   Owns only this mission. Player forces, stores, damage and terrain collision
   remain the existing A-6A simulation. No independent timers or render loop. */
(function (root) {
  'use strict';
  const PI=Math.PI,TAU=PI*2,NM=1852,DEG=PI/180,KEY='willard_checkpoint_v1';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),copy=x=>JSON.parse(JSON.stringify(x));
  const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const flat=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const forward=y=>[Math.sin(y),0,-Math.cos(y)];
  const phases={strike:['I · THE NIGHT STRIKE','Optional strike: use the existing radar and attack computer, or continue past the target.'],contact:['II · ENEMY INTERCEPTOR','A possible fighter is closing from the rear. Check aft; keep flying the Intruder.'],defend:['III · THE FIGHT YOU CANNOT WIN','Defend with controlled turns and terrain. Keep your airspeed and listen to the B/N.'],flak:['IV · THE WILLARD EGRESS','Draw the pursuer through the gun belt. Both aircraft remain vulnerable. Break after the guns commit.'],egress:['V · FEET WET','Open the distance. Follow the B/N toward the Gulf and Constellation.'],complete:['MISSION COMPLETE — WILLARD EGRESS','Both crew members reached the safe naval approach.'],failed:['WILLARD EGRESS · SORTIE LOST','Retry the last checkpoint, or replay the mission.']};
  const definition={id:'willard',num:'12',year:'1966',code:'WILLARD EGRESS',title:'Willard Egress — Night Interception, North Vietnam, 1966',willard:true,airStart:true,visualTail:'NL 502',
    blurb:'Night, Nam Dinh, a fighter in your six. Fly the heavy Intruder through a hostile gun belt and earn the break toward the Gulf. Standalone mission; all difficulties unlocked.',chips:['NIGHT','INTERCEPTOR','PLAY NOW'],
    brief:{date:'1966 · historical reconstruction',origin:'USS Constellation (CVA-64), Yankee Station',wing:'CVW-15',tail:'NL · individual aircraft unverified',ac:'A-6A Intruder',target:'Optional night strike, then survival and coastal egress near Nam Dinh',weather:'Moonlit haze, patchy cloud, dark river valleys',threat:'Unidentified interceptor portrayed as MiG-17PF; hostile AAA threatens both aircraft',ord:'4 × Mk 82 (optional strike)',roe:'Escape, do not dogfight. The A-6A has no internal gun.'},
    steps:['Fly the original A-6A manually; the B/N supplies course and threat calls. WASD or the touch stick flies, SHIFT/CTRL or THR controls power. H / LOOK AFT checks behind.','Optional: open SCOPE, slew with X or drag, LOCK, then hold COMMIT through the existing ASQ-61 solution. Continuing past the strike is also allowed.','Keep moving when the fighter closes. Use bank, height and speed; protect your airspeed and avoid the ground.','Follow the B/N to the hostile gun belt. Let the pursuer follow, then break as actual shells approach. The guns are not friendly.','Once contact is broken, fly the long moonlit route to the Gulf. Safe-egress debrief offers the original carrier recovery as an optional continuation.'],
    note:'Based on the user-supplied account of VA-65 pilot LT R. S. Williams and B/N LT J. E. Diselrod escaping a pursuer near Nam Dinh in 1966 from USS Constellation. Independent archival retrieval is unresolved in this build. The interceptor type was not confirmed. MiG-17PF art, gun placements, route, radio lines, combat and alternate outcomes are dramatized reconstruction, not verified quotations or a confirmed MiG kill.',
    env:{hour:23.1,moon:.76,fog:.22,oc:.40,cloud:5700,sea:2},type:'strike',targets:{kind:'depot',count:1,label:'OPTIONAL STRIKE DEPOT'},threats:{aaaLight:0,aaaHeavy:0,sam:0},teach:[],obj:[['Survive the interceptor','willard-contact'],['Break pursuit through hostile defenses','willard-flak'],['Reach safe naval approach with both crew','willard-safe']]};
  let ctx=null,installed=false;
  const settings=()=>ctx.Store.get('willard_options',{difficulty:'naval',strike:true});
  function random(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
  function radio(game,text,warning){game.app.radio('B/N · DRAMATIZED',text,warning?'warn':'');}
  function phase(game,id){const s=game.willard;if(s.phase===id)return;s.phase=id;s.phaseTime=0;s.guidanceClock=0;s.phaseTitle=phases[id][0];s.objective=phases[id][1];s.events.push({at:s.elapsed,type:'phase',phase:id});if(s.events.length>100)s.events.shift();}
  function altitude(x,z,clearance){return Math.max(0,ctx.terrainH(x,z))+clearance;}
  function sampleAltitude(a,b,clearance){let h=0;for(let i=0;i<=32;i++){const f=i/32;h=Math.max(h,ctx.terrainH(a[0]+(b[0]-a[0])*f,a[2]+(b[2]-a[2])*f));}return Math.max(0,h)+clearance;}
  function route(){const z=-14000,c=ctx.coastAt(z);return {strike:[-65000,altitude(-65000,14000,0),14000],plan:[-52000,950,-10000],flak:[-34000,900,z],break:[-29200,800,z-1500],safe:[c+36000,1100,z],carrier:[c+45000,0,z]};}
  function scenery(game){const s=game.willard,w=game.world,r=s.route;
    // Only this new world's placement changes; original mission content stays.
    w.targets.forEach((t,i)=>{t.p=[r.strike[0]+i*35,altitude(r.strike[0]+i*35,r.strike[2],1),r.strike[2]];});
    w.tgtCenter=r.strike.slice();w.briefed=r.strike.slice();w.briefedR=350;w.tgtSpread=100;w.ipoint=[r.strike[0],r.strike[1],r.strike[2]+6000];w.route=[];w.rtIdx=0;w.nav=null;
    w.carrier.p=r.carrier.slice();w.carrier.hdg=0;w.saf=[];w.threats=[];w.sites=[];
    w.scenery=[];w.siteLights=[];
    for(const t of w.targets){w.scenery.push({m:'bldg',p:[t.p[0]+38,t.p[1],t.p[2]],y:0,s:.6});w.siteLights.push({p:[t.p[0],t.p[1]+4,t.p[2]],c:[1,.60,.22],f:.55,s:3});}
    for(let i=0;i<18;i++){const a=i*2.4,x=r.flak[0]+Math.cos(a)*(1400+i*70),z=r.flak[2]+Math.sin(a)*(1200+i*60),y=altitude(x,z,0);w.scenery.push({m:i%3?'bldg':'tree',p:[x,y,z],y:a,s:i%3?.42:1.6});w.siteLights.push({p:[x,y+3,z],c:[.95,.56,.23],f:.35,s:2.5});}
    if(w.rend)w.rend.tgtArea=[r.strike[0],r.strike[2],350];
  }
  function checkpoint(game,label){const s=game.willard;if(!s||!game.ac.alive||game.evade||game.chute)return false;
    const snap={version:1,missionId:'willard',label,ac:copy(game.ac),bombsMax:game.bombsMax,gameTime:game.t,worldTime:game.world.t,
      state:copy(s),score:copy(game.world.score),targets:game.world.targets.map(t=>({hp:t.hp,alive:t.alive,burn:t.burn||0})),retries:s.retries};
    // A checkpoint never restores a round already in flight into the cockpit.
    if(snap.state.enemy)snap.state.enemy.projectiles=[];
    if(snap.state.flak){snap.state.flak.shells=[];snap.state.flak.bursts=[];}
    snap.state.events=snap.state.events.slice(-30);snap.state.contact={observed:false};delete snap.state.checkpoint;
    snap.state.checkpointLabel=label;if(!validCheckpoint(snap))return false;
    s.checkpointLabel=label;s.checkpoint=snap;
    ctx.Store.set(KEY,snap);return true;
  }
  function validCheckpoint(snap){try{
    let nodes=0;
    const tree=(v,depth=0)=>{if(++nodes>18000||depth>14)return false;if(v===null||typeof v==='boolean')return true;if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<1e11;if(typeof v==='string')return v.length<3000;if(!v||typeof v!=='object')return false;if(Array.isArray(v))return v.length<=256&&v.every(x=>tree(x,depth+1));return Object.keys(v).length<100&&Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&tree(x,depth+1));};
    if(!tree(snap)||JSON.stringify(snap).length>=150000||snap.version!==1||snap.missionId!=='willard'||!Number.isInteger(snap.retries)||snap.retries<0||snap.retries>1000||snap.retries!==snap.state?.retries)return false;
    const a=snap.ac,s=snap.state,f=s&&s.flak,e=s&&s.enemy;
    const range=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
    if(!a||!point(a.p)||!point(a.v)||a.alive!==true||a.onDeck!==false||!a.dmg||!a.crew||
      !['yaw','pitch','roll','thr','fuel','bombs','arms','ias','vs','radalt','aoa','brake','flaps','cat','nz','mach','dropped','hits','crewHits','stallShake','gLoad'].every(k=>Number.isFinite(a[k]))||
      !['gear','hook'].every(k=>typeof a[k]==='boolean')||!['hyd','eng','fuelLeak','diane','fire'].every(k=>range(a.dmg[k],0,1))||!['pilot','bn'].every(k=>range(a.crew[k],.000001,1))||
      !range(a.thr,0,1)||!range(a.fuel,0,15000)||!Number.isInteger(a.bombs)||!range(a.bombs,0,4)||a.arms!==0||
      !range(snap.bombsMax,0,4)||a.bombs>snap.bombsMax||!range(snap.gameTime,0,20000)||!range(snap.worldTime,0,20000)||
      !snap.score||!['hits','misses','dropped','killed','total','damage'].every(k=>range(snap.score[k],0,10000))||
      !Array.isArray(snap.score.cep)||snap.score.cep.length>256||snap.score.total!==1)return false;
    if(!s||!['contact','defend','flak','egress'].includes(s.phase)||!['rookie','naval','ace'].includes(s.difficulty)||
      !range(s.elapsed,0,20000)||!range(s.phaseTime,0,s.elapsed)||!Number.isInteger(s.seed)||!Number.isInteger(s.rng)||
      !['strike','plan','flak','break','safe','carrier'].every(k=>point(s.route?.[k]))||
      !['flakDisrupted','flakEntered','completed','recovery'].every(k=>typeof s[k]==='boolean')||s.completed||s.recovery||
      !['distance','stallSeconds','attackBursts','cannonHits','flakHits','breaks','flakExposures','retries'].every(k=>range(s[k],0,1e8))||
      !Array.isArray(s.events)||s.events.length>100)return false;
    if(!f||f.version!==1||!point(f.center)||!Array.isArray(f.guns)||f.guns.length!==8||
      !Array.isArray(f.shells)||f.shells.length>40||!Array.isArray(f.bursts)||f.bursts.length>48||!Array.isArray(f.lights)||f.lights.length>8||
      !f.stats||!['shellsFired','a6Shots','migShots','detonated','terrainImpacts','a6Hits','a6Exposure','migExposure'].every(k=>range(f.stats[k],0,1e7))||!range(f.time,0,20000)||!Number.isInteger(f.rng)||!Number.isInteger(f.sequence)||!Number.isSafeInteger(f.beamCursor)||!range(f.beamCursor,0,1e8)||!Number.isFinite(f.beamClock)||
      f.shells.length!==0||f.bursts.length!==0||!f.lights.every(l=>point(l.p)&&point(l.dir)&&point(l.end)&&range(l.intensity,0,5))||
      !f.guns.every(g=>point(g.p)&&range(g.yaw,-PI,PI)&&['elevation','cooldown','tracking','sampleClock','shots','lastFired'].every(k=>Number.isFinite(g[k]))&&typeof g.alive==='boolean'&&g.observations&&['a6','mig'].every(k=>Array.isArray(g.observations[k])&&g.observations[k].length<=8&&g.observations[k].every(o=>point(o.p)&&point(o.v)&&Number.isFinite(o.at)&&range(o.range,0,10000)))))return false;
    if(!e||!point(e.p)||!point(e.v)||!range(e.health,0,1)||typeof e.alive!=='boolean'||
      !['PATROL','DETECT','INTERCEPT','PURSUIT','ATTACK','OVERSHOOT','REPOSITION','REACQUIRE','EVADE_FLAK','DISENGAGE','DESTROYED'].includes(e.state)||
      !['yaw','pitch','roll','speed','time','stateTime','lastSeen','flakPressure','_rng','_sensor','_shotClock','_cooldown','_burstRemaining','_id','_evadeSign','roundsFired','bursts'].every(k=>Number.isFinite(e[k]))||
      !e._profile||!['sight','reaction','sensor','spread','cooldown','burst','damage','memory','aggression'].every(k=>Number.isFinite(e._profile[k]))||
      !Array.isArray(e.projectiles)||e.projectiles.length!==0||!Array.isArray(e._flakIds)||e._flakIds.length>256||!(e._targetPrevious===null||point(e._targetPrevious))||!(e._flakAway===null||point(e._flakAway))||
      !Array.isArray(e._events)||!point(e._origin)||!point(e.lastKnownVelocity)||!(e.lastKnown===null||point(e.lastKnown))||
      !Number.isInteger(e.ammo)||!range(e.ammo,0,180))return false;
    // All scheduler fields created by the shipped modules must be present;
    // a missing clock is different from a deliberate zero or null value.
    const required=(reference,value)=>Object.entries(reference).every(([k,v])=>Object.prototype.hasOwnProperty.call(value,k)&&(typeof v==='number'?Number.isFinite(value[k]):typeof v==='boolean'?typeof value[k]==='boolean':Array.isArray(v)?Array.isArray(value[k]):true));
    if(!required(root.WillardInterceptor.create({seed:1}),e)||!required(root.WillardFlak.create({center:f.center,seed:1,terrainH:()=>0}),f))return false;
    return Array.isArray(snap.targets)&&snap.targets.length===1&&snap.targets.every(t=>typeof t.alive==='boolean'&&Number.isFinite(t.hp)&&range(t.burn,0,1)&&t.alive===(t.hp>0));
  }catch(_){return false;}}
  function start(game,options){if(!game.mis.willard)return null;
    const opt=options||settings(),seed=(Number(opt.seed)>>>0)||(Date.now()>>>0),r=route();
    const s=game.willard={version:1,phase:'strike',phaseTitle:phases.strike[0],objective:phases.strike[1],phaseTime:0,elapsed:0,seed,rng:seed,difficulty:['rookie','naval','ace'].includes(opt.difficulty)?opt.difficulty:'naval',withStrike:opt.strike!==false,route:r,enemy:null,flak:null,contact:{observed:false},events:[],checkpointLabel:null,retries:0,rear:false,flakDisrupted:false,flakEntered:false,flakExposures:0,breaks:0,distance:0,stallSeconds:0,minClearance:1e9,attackBursts:0,cannonHits:0,flakHits:0,warningClock:0,previousPosition:null,previousYaw:0,previousFlakDistance:1e9,completed:false,recovery:false};
    scenery(game);s.flak=root.WillardFlak.create({center:r.flak,seed:seed^0x1966,difficulty:s.difficulty,terrainH:ctx.terrainH});
    const ac=game.ac;ac.p=[-65000,sampleAltitude([-65000,0,18000],r.strike,550),18000];ac.yaw=0;ac.pitch=.025;ac.roll=0;ac.v=[0,0,-200];ac.onDeck=false;ac.gear=false;ac.hook=false;ac.cat=0;ac.thr=.78;ac.fuel=9500;ac.bombs=s.withStrike?4:0;ac.arms=0;game.bombsMax=ac.bombs;game.armsMax=0;
    game.phase='airborne';game.departed=true;game.rightSeat=false;game.hud.scope=false;game.extView=false;game.camSm=null;delete game._samAt;delete game._samDone;game.egressCalled=true;
    if(typeof document!=='undefined'){document.body.classList.remove('rseat');document.getElementById('btnScope')?.classList.remove('on');document.getElementById('btnGear')?.classList.remove('on');document.getElementById('teach')?.classList.remove('on');document.getElementById('legend')?.classList.remove('on');}
    const saved=game.app._willardRestore;game.app._willardRestore=null;
    if(validCheckpoint(saved)){
      const fresh=s;Object.assign(ac,copy(saved.ac));Object.assign(s,copy(saved.state));s.retries=(saved.retries||0)+1;s.checkpoint=saved;s.rear=false;s.events=s.events||[];s.contact={observed:false};s.warningClock=0;
      if(!s.flak)s.flak=fresh.flak;game.t=saved.gameTime;game.world.t=saved.worldTime;game.bombsMax=saved.bombsMax;Object.assign(game.world.score,copy(saved.score));
      game.world.targets.forEach((t,i)=>Object.assign(t,saved.targets[i]));s.grace=3;scenery(game); // consistent placement; existing recorded health survives.
      radio(game,'Checkpoint restored. Fly the aeroplane; I have the navigation.');
    }else radio(game,s.withStrike?'Night strike, then east for the Gulf. You fly; I have the target and navigation.':'Weapons already expended before this playable segment. Continue north, then turn toward the Gulf.');
    if(root.WillardSprites)root.WillardSprites.load(game.rend).catch(e=>{s.assetError=String(e.message||e);});
    updateGuidance(game);return s;
  }
  function spawn(game){const s=game.willard,a=game.ac,f=forward(a.yaw),side=forward(a.yaw+PI/2),off=(random(s)-.5)*650;
    s.enemy=root.WillardInterceptor.create({position:[a.p[0]-f[0]*3100+side[0]*off,a.p[1]+80,a.p[2]-f[2]*3100+side[2]*off],yaw:a.yaw,speed:260,seed:s.seed^0x751966,difficulty:s.difficulty});
    phase(game,'contact');checkpoint(game,'After the night strike');radio(game,'Possible contact behind us. Check aft. Hold your speed.',true);
  }
  function updateGuidance(game){const s=game.willard,a=game.ac;let p=s.route.strike,clearance=450;
    if(s.phase==='contact'||s.phase==='defend')p=s.route.plan;
    if(s.phase==='flak')p=s.flakEntered?s.route.break:s.route.flak;
    if(s.phase==='egress'||s.completed)p=s.recovery?s.route.carrier:s.route.safe;
    const h=sampleAltitude(a.p,p,clearance);s.guidance={point:p.slice(),altitude:s.recovery?Math.max(360,h):Math.max(p[1]+(p===s.route.strike?450:0),h)};
    s.guidance.point[1]=s.guidance.altitude;
  }
  function onEvents(game,events){const s=game.willard,w=game.world,a=game.ac;
    for(const e of events){
      if(e.type==='muzzle'){s.attackBursts=s.enemy.bursts;s.warningClock=4;w.fx.glow(e.p,[1,.75,.28],2.4,.045);game.shake=Math.max(game.shake,.12);if(game.app.set.sound)game.app.audio.burst('gun',.24);if(s.phase==='contact')phase(game,'defend');if(s.elapsed-(s.lastBreakCall||-20)>9){s.lastBreakCall=s.elapsed;radio(game,'BREAK! Fighter firing. Turn across his nose; keep the airspeed.',true);}}
      if(e.type==='tracer'&&point(e.p)&&point(e.v))w.fx.streak(e.p,e.v,[1,.42,.12],.50,.22,0,15);
      if(e.type==='cannonHit'){s.cannonHits++;game.flash=Math.max(game.flash,.20);game.shake=Math.max(game.shake,.6);}
      if(e.type==='enemyDestroyed'){s.enemyCause=e.source||s.enemy._damageSource||'unknown';}
      if(e.type==='state'){s.events.push({at:s.elapsed,type:'enemy',from:e.from,state:e.state});if(s.events.length>100)s.events.shift();}
    }
  }
  function hit(game,ac,severity,source){const s=game.willard;if(s.grace>0)return;const mult=s.difficulty==='rookie'?.38:s.difficulty==='ace'?1:.62;game.world.hitAircraft(ac,severity*mult,source);if(source==='flak')s.flakHits++;}
  function step(game,dt){const s=game.willard;if(!s||game.paused||game.result||!(dt>0)||!Number.isFinite(dt))return;
    if(game.chute||game.evade||game.pow){s.rear=false;s.contact.observed=false;if(root.WillardPresentation)root.WillardPresentation.stop();return;}
    const a=game.ac,w=game.world;if(!a.alive)return;
    if(a.crew.pilot<=0||a.crew.bn<=0){finish(game,false,'A crew member has been lost. The safe escape of both men is no longer possible. Retry the last checkpoint.',false);return;}
    s.elapsed+=dt;s.phaseTime+=dt;s.grace=Math.max(0,(s.grace||0)-dt);s.warningClock=Math.max(0,s.warningClock-dt);
    if(s.previousPosition)s.distance+=dist(a.p,s.previousPosition);s.previousPosition=a.p.slice();
    const agl=a.p[1]-Math.max(0,ctx.terrainH(a.p[0],a.p[2]));s.minClearance=Math.min(s.minClearance,agl);if(a.stallShake>.1)s.stallSeconds+=dt;
    if(s.phase==='strike'){
      const passed=a.p[2]<s.route.strike[2]-600||w.score.dropped>0||!s.withStrike&&s.phaseTime>12;
      if(passed)spawn(game);
    }
    const bursts=root.WillardFlak.step(s.flak,dt,{ac:a,enemy:s.enemy,terrainH:ctx.terrainH,fx:w.fx,hitAircraft:(ac,sev,src)=>hit(game,ac,sev,src),time:s.elapsed,quality:game.rend?.quality});
    if(s.enemy){
      const visibility=.9,cloud=a.p[1]>1500?.20+.18*Math.sin(s.elapsed*.013+s.seed%5):.03;
      const events=root.WillardInterceptor.step(s.enemy,dt,{targetAC:a,terrainH:ctx.terrainH,worldTime:s.elapsed,visibility,cloud,flakThreat:{level:0,impacts:bursts},hitAircraft:(ac,sev,src)=>hit(game,ac,sev,src)});onEvents(game,events);
      const enemy=s.enemy,range=dist(enemy.p,a.p),visible=range<4200&&root.WillardInterceptor.lineOfSight(a.p,enemy.p,ctx.terrainH);
      s.exhaustClock=(s.exhaustClock||0)-dt;
      if(enemy.alive&&s.exhaustClock<=0){s.exhaustClock=game.rend?.quality===0?.16:.09;const f=forward(enemy.yaw),p=[enemy.p[0]-f[0]*6,enemy.p[1],enemy.p[2]-f[2]*6];w.fx.glow(p,[1,.40,.10],enemy.speed>250?1.5:.6,.15);if(enemy.health<.78)w.fx.smoke(p,[.16,.16,.17],2.8,5,[0,2,0],.5);}
      if(visible){s.contact={observed:true,bearing:Math.atan2(enemy.p[0]-a.p[0],-(enemy.p[2]-a.p[2])),lastSeen:s.elapsed,warning:s.warningClock>0?'CANNON — BREAK':''};}
      else if(s.contact&&s.elapsed-s.contact.lastSeen>6)s.contact.observed=false;
      if(s.phase==='contact'&&(range<1200||enemy.roundsFired>0)){phase(game,'defend');radio(game,'Fighter confirmed by sight. Do not try to out-turn him. Descend or change the plane of the turn.',true);}
      if((s.phase==='contact'||s.phase==='defend')&&(s.elapsed>115||enemy.bursts>=2)){
        phase(game,'flak');checkpoint(game,'Before the Nam Dinh gun belt');radio(game,'Conventional turns are not shaking him. Gun belt to the east. Draw him into their fire, then break. Those guns will shoot at us too.',true);
      }
      if(enemy.flakPressure>.1)s.flakExposures=Math.max(s.flakExposures,enemy.flakPressure);
      if((enemy.disengaged||!enemy.alive)&&(enemy.flakPressure>=1.2||enemy._damageSource==='flak')){
        if(!s.flakDisrupted){s.flakDisrupted=true;phase(game,'egress');radio(game,'He is breaking off! Keep going east. The guns are still hostile — keep jinking until we are clear.',false);}
      }
      if(!enemy.alive&&enemy._damageSource==='terrain'&&!s.completed&&s.phase!=='egress'){s.terrainEscape=true;phase(game,'egress');radio(game,'Contact lost against the terrain. Continue east. This reconstructed outcome is not a historical confirmed kill.');}
      // A genuine prolonged loss of visual contact is an alternate evasion,
      // not a forced recapture or an omniscient reposition of the fighter.
      if(['defend','flak'].includes(s.phase)&&!enemy.visible&&enemy.time-enemy.lastSeen>70&&range>12000){s.terrainEscape=true;phase(game,'egress');radio(game,'Contact has been lost behind the terrain. Continue east. No confirmed kill.');}
    }
    const fd=flat(a.p,s.route.flak);
    if(s.phase==='flak'&&fd<6000&&s.flak.stats.shellsFired>0){
      if(!s.flakEntered){s.flakEntered=true;s.enterYaw=a.yaw;radio(game,'Inside the belt. Their shells are leading us. Break as they arrive; keep him following.',true);}
      if(Math.abs(angle(a.yaw-s.enterYaw))>28*DEG&&Math.abs(a.roll)>.3&&!s.breakRecorded){s.breakRecorded=true;s.breaks++;}
    }
    s.previousFlakDistance=fd;
    if(s.phase==='egress'&&!s.recovery){
      const safe=flat(a.p,s.route.safe)<5000,sea=a.p[0]>ctx.coastAt(a.p[2])+12000;
      const clear=!s.enemy||!s.enemy.alive||s.enemy.disengaged&&dist(a.p,s.enemy.p)>6500||s.terrainEscape&&s.enemy.time-s.enemy.lastSeen>100;
      if(safe&&sea&&clear&&a.crew.pilot>0&&a.crew.bn>0)finish(game,true,'Safe naval approach reached. Contact broken; both crew alive. Carrier landing has not yet been flown.',false);
    }
    s.guidanceClock=(s.guidanceClock||0)-dt;if(s.guidanceClock<=0){updateGuidance(game);s.guidanceClock=.25;}
    if(root.WillardPresentation)root.WillardPresentation.step(game,dt);
  }
  function objectives(game){const s=game.willard;return [['Survive the interceptor',s.enemy?'engaged':'pending',!!(s.enemy&&(s.phase==='flak'||s.phase==='egress'||s.completed))],['Break pursuit through hostile defenses',s.flakDisrupted?'flak disrupted pursuit':s.terrainEscape?'alternate terrain evasion':'pending',!!(s.flakDisrupted||s.terrainEscape)],['Reach safe naval approach with both crew',s.completed?'both crew safe':'pending',!!s.completed]];}
  function score(game,won){const s=game.willard,w=game.world,a=game.ac,integrity=clamp(1-w.score.damage/4.6,0,1);const parts={escape:won?35:0,crew:a.crew.pilot>0&&a.crew.bn>0?15:0,aircraft:Math.round(integrity*20),defense:Math.round(clamp(12-s.stallSeconds*.25,0,12)),flak:s.flakDisrupted?12:0,navigation:won?6:0};const points=clamp(Object.values(parts).reduce((x,y)=>x+y,0)-Math.min(15,s.retries*3),0,100);return {points,parts,grade:points>=90?'A':points>=77?'B':points>=62?'C':points>=45?'D':'F'};}
  function button(parent,text,fn,id){const n=document.createElement('button');n.className='btn';n.type='button';n.textContent=text;if(id)n.id=id;const action=event=>{event?.stopPropagation?.();fn();n.blur?.();};if(root.WillardPresentation?.bindButton)root.WillardPresentation.bindButton(n,action);else n.onclick=action;parent.appendChild(n);return n;}
  function finish(game,won,reason,landed){const s=game.willard;if(!s||game.app.game!==game||game.result)return false;
    if(won){const a=game.ac,e=s.enemy,earned=s.flakDisrupted||s.terrainEscape,safe=flat(a.p,s.route.safe)<5000&&a.p[0]>ctx.coastAt(a.p[2])+12000,trap=!!landed&&a.onDeck&&game.wire>=1&&game.wire<=4,clear=!e||!e.alive||e.disengaged&&dist(a.p,e.p)>6500||s.terrainEscape&&e.time-e.lastSeen>100;if(!earned||!clear||!a.alive||a.crew.pilot<=0||a.crew.bn<=0||(landed?!trap:!safe))return false;}
    s.completed=!!won;phase(game,won?'complete':'failed');s.rear=false;s.outcome=reason;const result=score(game,won);s.score=result;
    game.result={pts:result.points,grade:result.grade,pass:!!won,recovered:!!landed,safeEgress:!!won,escaped:false};game.paused=true;
    if(root.WillardPresentation)root.WillardPresentation.stop();game.app.audio.setEngine(0,0,false);game.app.audio.setTone(0,0);game.app.audio.setRadAlt(1e9,false);
    const log=ctx.Store.get('log',[]),ammo=root.SurvivalAmmunition?root.SurvivalAmmunition.view(game):{};
    const entry={t:Date.now(),id:'willard',num:'12',title:definition.title,code:definition.code,year:'1966',pts:result.points,grade:result.grade,pass:!!won,landed:!!landed,lost:!won,reason,safeEgress:!!won,willard:true,flakDisrupted:s.flakDisrupted,terrainEscape:!!s.terrainEscape,difficulty:s.difficulty,duration:s.elapsed,retries:s.retries,seat:'PILOT / B/N crew',dropped:game.world.score.dropped,killed:game.world.score.killed,total:game.world.score.total,dmg:game.world.score.damage,ejected:!!game.ejected,captured:!!game._capt,...ammo};
    const old=s.logTime&&log.findIndex(x=>x.t===s.logTime&&x.id==='willard');if(Number.isInteger(old)&&old>=0)log[old]=entry;else log.push(entry);s.logTime=entry.t;while(log.length>200)log.shift();ctx.Store.set('log',log);
    if(won){game.app.prog.done.willard=1;game.app.prog.grade.willard=result.grade;ctx.Store.set('prog',game.app.prog);}
    if(typeof document==='undefined')return true;
    const body=document.getElementById('debriefBody');body.replaceChildren();
    const h=document.createElement('h2');h.textContent=won?'MISSION COMPLETE — WILLARD EGRESS':'WILLARD EGRESS — SORTIE LOST';body.append(h);
    const p=document.createElement('p');p.textContent=reason;body.append(p);
    const grade=document.createElement('p');grade.className='grade';grade.textContent=result.grade+' · '+result.points+'/100 · '+s.difficulty.toUpperCase();body.append(grade);
    for(const [key,value]of Object.entries(result.parts)){const row=document.createElement('p');row.textContent=key.toUpperCase()+' · '+value;body.append(row);}
    const hist=document.createElement('p');hist.className='note';hist.textContent='Historical reconstruction: the reported 1966 VA-65 maneuver used hostile antiaircraft fire to shake an unidentified pursuer. The MiG-17PF, route, gun belt, combat, dialogue and outcomes here are dramatized. No confirmed fighter kill is claimed. Safe egress is not a completed carrier landing.';body.append(hist);
    const actions=document.createElement('div');actions.className='btnrow';body.append(actions);
    button(actions,'Retry checkpoint',()=>retry(game),'willardResultRetry');button(actions,'Replay mission',()=>{game.app._willardRestore=null;game.app.start(definition);},'willardReplay');
    if(won&&!landed)button(actions,'Continue carrier recovery',()=>{game.result=null;game.paused=false;s.phase='egress';s.phaseTitle='CONSTELLATION · OPTIONAL RECOVERY';s.objective='Use the original TACAN, gear/hook, ball and arresting wires.';s.recovery=true;s.rear=false;document.getElementById('debriefVeil').classList.remove('on');updateGuidance(game);},'willardRecovery');
    button(actions,'Ready Room',()=>{game.app.game=null;game.app.show('ready');},'willardReady');document.getElementById('debriefVeil').classList.add('on');return true;
  }
  function retry(game){const saved=game?.willard?.checkpoint||ctx.Store.get(KEY,null);if(!validCheckpoint(saved))return false;const next=copy(saved);next.retries=Math.max(saved.retries,Number.isSafeInteger(game?.willard?.retries)?game.willard.retries:0);next.state.retries=next.retries;ctx.Store.set(KEY,next);ctx.App._willardRestore=next;ctx.App.start(definition);return true;}
  function snapshot(game){if(!game?.willard)return null;const s=game.willard,e=s.enemy;const enemy=e?copy(Object.fromEntries(['p','v','yaw','pitch','roll','speed','health','alive','state','ammo','roundsFired','bursts','visible','lastSeen','flakPressure','disengaged','projectiles'].map(k=>[k,e[k]]))):null;return {phase:s.phase,phaseTitle:s.phaseTitle,objective:s.objective,difficulty:s.difficulty,elapsed:s.elapsed,guidance:copy(s.guidance),route:copy(s.route),contact:copy(s.contact),checkpointLabel:s.checkpointLabel,retries:s.retries,flakEntered:s.flakEntered,flakDisrupted:s.flakDisrupted,terrainEscape:!!s.terrainEscape,breaks:s.breaks,flakExposures:s.flakExposures,cannonHits:s.cannonHits,flakHits:s.flakHits,attackBursts:s.attackBursts,distance:s.distance,stallSeconds:s.stallSeconds,events:copy(s.events),enemy,flak:root.WillardFlak.inspect(s.flak),result:game.result?copy(game.result):null,assetError:s.assetError||null};}
  function lighting(game){const s=game.willard;if(!s)return null;const list=(s.flak?.lights||[]).slice().sort((a,b)=>dist(a.p,game.ac.p)-dist(b.p,game.ac.p));return {lights:list.slice(0,4).map(l=>({position:l.p.slice(),direction:l.dir.slice(),coneCos:Math.cos(.045),rgb:[.90,.84,.62],radius:6500,intensity:l.tracking?2.2:.8})),ambientLift:0,wetness:.35};}
  function brief(app,host){const old=host.querySelector('#willardBrief');if(old)old.remove();const box=document.createElement('section');box.id='willardBrief';box.className='card';
    const head=document.createElement('h3');head.textContent='MISSION: WILLARD EGRESS — NIGHT INTERCEPTION, NORTH VIETNAM, 1966';box.append(head);
    const intro=document.createElement('p');intro.textContent='You fly the heavy A-6A; the B/N is your lifeline. The pursuer is faster. The guns ahead are hostile to both of you. A successful standard run is designed for roughly 8–12 minutes, with immediate checkpoint retries. Historical crew in the supplied account: LT R. S. Williams, pilot; LT J. E. Diselrod, B/N. These identities await independent archival verification. The existing external model carries generic NL 502 markings, not an authenticated individual aircraft. All crew dialogue is dramatized.';box.append(intro);
    const label=document.createElement('label');label.textContent='Difficulty ';const select=document.createElement('select');select.id='willardDifficulty';for(const [id,text]of [['rookie','ROOKIE'],['naval','NAVAL AVIATOR'],['ace','ACE']]){const o=document.createElement('option');o.value=id;o.textContent=text;select.append(o);}select.value=settings().difficulty;label.append(select);box.append(label);
    const sl=document.createElement('label');sl.style.margin='12px';const check=document.createElement('input');check.type='checkbox';check.id='willardStrike';check.checked=settings().strike!==false;sl.append(check,document.createTextNode(' Play optional bombing pass'));box.append(sl);
    button(box,'PLAY MISSION',()=>{ctx.Store.set('willard_options',{difficulty:select.value,strike:check.checked});app._willardRestore=null;app.audio.init();app.audio.resume();app.start(definition);},'willardPlay');
    const saved=ctx.Store.get(KEY,null);if(validCheckpoint(saved))button(box,'Continue Willard checkpoint',()=>{app._willardRestore=copy(saved);app.start(definition);},'willardContinue');host.prepend(box);
    const normal=Array.from(host.querySelectorAll('button')).find(n=>n.textContent==='Man Aircraft');if(normal)normal.hidden=true;
  }
  function install(context){ctx=context;if(installed)return;installed=true;const {App,Game}=ctx;
    const originalRadio=App.radio;App.radio=function(who,message,cls,lang,say){
      if(this.game?.mis.willard){
        const neutral=text=>typeof text==='string'?text.replace(/TURCZYN|Turczyn/g,'Pilot').replace(/\bMac\b/g,'B/N').replace(/Nine seven two|Cupcake/g,'Tiger').replace(/Kitty Hawk/g,'Constellation'):text;
        who=neutral(who);message=neutral(message);say=neutral(say);
        if(/^(BN|B\/N|PILOT|Pilot|SHIP|LSO)$/.test(who))who+=' · DRAMATIZED';
      }
      return originalRadio.call(this,who,message,cls,lang,say);
    };
    const update=Game.prototype.update;Game.prototype.update=function(dt){if(!this.willard)return update.call(this,dt);if(this.paused||!(dt>0))return;let left=Math.min(dt,.25);while(left>1e-8&&!this.paused&&!this.result){const h=Math.min(left,1/60);update.call(this,h);step(this,h);left-=h;}};
    for(const name of ['director','pilotChatter','teach','checkObjectives']){const old=Game.prototype[name];Game.prototype[name]=function(){if(this.mis.willard)return;return old.apply(this,arguments);};}
    const obj=Game.prototype.objState;Game.prototype.objState=function(){return this.willard?objectives(this):obj.apply(this,arguments);};
    const task=Game.prototype.currentTask;Game.prototype.currentTask=function(){if(this.willard&&!this.evade&&!this.chute)return null;return task.apply(this,arguments);};
    const cue=Game.prototype.nextCue;Game.prototype.nextCue=function(){if(this.willard&&!this.evade&&!this.chute)return this.willard.phase==='strike'?'OPTIONAL STRIKE · TAB / SCOPE · X SLEWS · ENTER LOCKS · HOLD COMMIT':'B/N: '+this.willard.objective+' · H / LOOK AFT';return cue.apply(this,arguments);};
    const hud=Game.prototype.hudState;Game.prototype.hudState=function(){const data=hud.apply(this,arguments);if(this.willard){data.willard=true;if(this.willard.rear){data.tgtScreen=null;data.briefScreen=null;data.shipScreen=null;}}return data;};
    const dead=Game.prototype.onDead;Game.prototype.onDead=function(reason){if(!this.willard||this._walkAway)return dead.call(this,reason);this.phase='dead';return finish(this,false,reason,false);};
    const debrief=Game.prototype.debrief;Game.prototype.debrief=function(landed,reason){if(this.willard&&!this.pow)return finish(this,!!landed&&this.ac.crew.pilot>0&&this.ac.crew.bn>0,reason||'Carrier recovery complete.',!!landed);return debrief.apply(this,arguments);};
    const oldBrief=App.brief;App.brief=function(m){const r=oldBrief.call(this,m);if(m.willard)brief(this,document.getElementById('briefBody'));return r;};
    const show=App.show;App.show=function(){const r=show.apply(this,arguments);if(root.WillardPresentation)root.WillardPresentation.render(this.game);return r;};
    const pause=App.pause;App.pause=function(on){const r=pause.call(this,on);if(this.game?.willard&&on){const host=document.getElementById('pauseBody');button(host,'Retry Willard checkpoint',()=>retry(this.game),'willardPauseRetry');}if(root.WillardPresentation)root.WillardPresentation.render(this.game);return r;};
  }
  root.WillardMission=Object.freeze({definition,install,start,step,snapshot,retry,checkpoint,validCheckpoint,objectives,score,finish,lighting,KEY});
})(window);
