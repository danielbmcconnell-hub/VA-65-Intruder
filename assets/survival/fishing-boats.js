/* Original Vietnamese fishing boats, reconstructed from the supplied visual
 * references. Civilian traffic owns its own actors; none are prison guards.
 * Logical positions survive river tile recentring and saved checkpoints. */
(function(root){
  'use strict';
  const VERSION=1,SCALE=100,PREFIX='fishing-hull:',MAX_BOATS=4,MAX_REPORTS=3;
  const records=new WeakMap(),crewLoads=new WeakMap(),installed=new WeakSet();
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),finite=(n,f=0)=>Number.isFinite(n)?n:f;
  const flat=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
  const definitions=Object.freeze({
    sampan:{mesh:'fishingSampan',length:5.6,beam:1.12,freeboard:.34,speed:-.36,crew:1},
    canopy:{mesh:'fishingCanopyHull',length:6.2,beam:1.42,freeboard:.39,speed:.27,crew:1},
    net:{mesh:'fishingSampan',length:5.6,beam:1.12,freeboard:.34,speed:.08,crew:1},
    workboat:{mesh:'fishingWorkboat',length:8.2,beam:2.48,freeboard:.55,speed:.40,crew:1}
  });
  const stations=Object.freeze(Array.from({length:18},(_,i)=>({id:'fisher-'+i,at:2400+i*5200,kind:i>2&&i%5===4?'workboat':i%3===1?'canopy':i%3===2?'net':'sampan',lane:i%3===2?(i%2?-10.6:10.6):i%2?6.8:-6.8,reporter:i%3===1})));
  let config={};
  function configure(c){config={...config,...c};return true;}
  function eligible(g){return !!(g?.pow?.river&&g.evade&&!g.pow.complete&&!g.pow.river.finished&&g.pow.river.phase!=='gulf'&&!g.result);}
  function active(g){const a=g?.app;return eligible(g)&&!g.paused&&!g.evade.frozen&&!g.evade.held&&!g._capturePending&&!g.pow.modalOpen&&!root.document?.hidden&&(!a||a.screen==='game'&&!a.graphicsContextLost);}
  function saved(g){const r=g.pow.river;let s=r.fishingTraffic;if(!s||s.version!==VERSION||!Array.isArray(s.boats)||!Array.isArray(s.used))s=r.fishingTraffic={version:VERSION,clock:0,boats:[],used:[],reports:0,nextWarning:0};s.clock=finite(s.clock);s.reports=clamp(finite(s.reports),0,MAX_REPORTS);s.boats=s.boats.filter(b=>b&&definitions[b.kind]&&Number.isFinite(b.logical)&&Number.isFinite(b.lane)).slice(0,MAX_BOATS);for(const b of s.boats){b.homeLane=finite(b.homeLane,b.lane);b.yaw=finite(b.yaw,definitions[b.kind].speed<0?0:Math.PI);b.phase=finite(b.phase);b.age=finite(b.age);b.interest=clamp(finite(b.interest),0,6);b.reportAt=Number.isFinite(b.reportAt)?b.reportAt:null;}return s;}
  function transient(g){let t=records.get(g);if(!t||t.river!==g.pow.river){t={river:g.pow.river,lastCells:'',solidsArray:null,actors:[],meshes:null,lastSplash:0,drawn:0};records.set(g,t);}return t;}
  function boatPosition(g,b){const r=g.pow.river;return[g.pow.base[0]+94+b.lane,r.waterY+.025,r.routeOriginZ+b.logical/SCALE-r.streamOffset];}
  function localPoint(g,b,p){const base=boatPosition(g,b),c=Math.cos(b.yaw),s=Math.sin(b.yaw);return[base[0]+p[0]*c+p[2]*s,base[1]+p[1],base[2]-p[0]*s+p[2]*c];}
  function notify(g,text){const s=saved(g);if(s.clock<s.nextWarning)return;s.nextWarning=s.clock+8;(config.POW||root.POW)?.notify?.(g,text);g.app?.radio?.('CREW',text,'warn');}
  function hullBoxes(g,b){const d=definitions[b.kind],p=boatPosition(g,b),c=Math.cos(b.yaw),s=Math.sin(b.yaw),out=[];
    for(let j=0;j<5;j++){const z=(j-2)*d.length/5,width=d.beam*.5*(j===0||j===4?.55:1),half=d.length/10;
      out.push({id:PREFIX+b.id+':'+j,x:p[0]+z*s,z:p[2]+z*c,hw:Math.abs(c)*width+Math.abs(s)*half,hl:Math.abs(s)*width+Math.abs(c)*half,yMin:g.pow.river.waterY-.46,yMax:g.pow.river.waterY+d.freeboard+.02,active:true,boatId:b.id});}
    return out;
  }
  function collisionBoxes(g){return eligible(g)?saved(g).boats.flatMap(b=>hullBoxes(g,b)):[];}
  function syncSolids(g){if(!g?.pow)return;const old=g.pow.solids||[],own=eligible(g)?collisionBoxes(g):[],t=eligible(g)?transient(g):records.get(g);g.pow.solids=old.filter(q=>!q.id?.startsWith(PREFIX)).concat(own);if(!t)return;const cells=own.map(q=>q.id+':'+Math.floor(q.x)+':'+Math.floor(q.z)).join('|');if(cells!==t.lastCells||old!==t.solidsArray){t.lastCells=cells;g.pow.navVersion=finite(g.pow.navVersion)+1;}t.solidsArray=g.pow.solids;}
  function boxContains(q,x,z,r,y){if(y>=q.yMax-.035||y+1.48<=q.yMin+.025)return false;const dx=Math.max(0,Math.abs(x-q.x)-q.hw),dz=Math.max(0,Math.abs(z-q.z)-q.hl);return dx*dx+dz*dz<r*r-1e-8;}
  function blocked(g,x,z,r=.32,y=g?.evade?.p?.[1]){return eligible(g)&&collisionBoxes(g).some(q=>boxContains(q,x,z,r,finite(y,g.pow.river.waterY-.42)));}
  function safeCandidate(g,b,lane,logical){const d=definitions[b.kind],e=g.evade,p=[g.pow.base[0]+94+lane,g.pow.river.waterY,g.pow.river.routeOriginZ+logical/SCALE-g.pow.river.streamOffset];
    // Never paddle a hull over an existing swimmer or a boarded player.
    const radius=g.pow.river.boatOwned?.92:.40,other={...b,lane,logical};
    if(hullBoxes(g,other).some(q=>boxContains(q,e.p[0],e.p[2],radius,e.p[1])))return false;
    for(const boat of saved(g).boats){if(boat.id===b.id)continue;const q=boatPosition(g,boat),bd=definitions[boat.kind];if(Math.abs(p[0]-q[0])<(d.beam+bd.beam)*.55+.3&&Math.abs(p[2]-q[2])<(d.length+bd.length)*.52+.5)return false;}
    // Respect original logs, landing posts and bridge piers. Check the whole
    // five-piece hull; elevated bridge decks do not obstruct boats below.
    for(const q of g.pow.solids||[]){if(q.active===false||q.id?.startsWith(PREFIX)||q.yMin>p[1]+1.5||q.yMax<p[1]-.38)continue;
      if(hullBoxes(g,other).some(h=>Math.abs(h.x-q.x)<h.hw+q.hw+.08&&Math.abs(h.z-q.z)<h.hl+q.hl+.08))return false;}
    return true;
  }
  function spawn(g){const s=saved(g),r=g.pow.river;for(const station of stations){if(s.boats.length>=MAX_BOATS)break;if(s.used.includes(station.id))continue;const distance=(station.at-r.logicalDistance)/SCALE;if(distance<18){s.used.push(station.id);continue;}if(distance>100)continue;
      const d=definitions[station.kind],b={id:station.id,kind:station.kind,lane:station.lane,homeLane:station.lane,logical:station.at,yaw:d.speed<0?0:Math.PI,phase:station.at*.001,interest:0,warned:false,reporter:station.reporter,reportAt:null,reported:false,speed:d.speed,held:false,age:0};
      if(flat(boatPosition(g,b),g.evade.p)<18)continue;
      if(!safeCandidate(g,b,b.lane,b.logical))continue;s.used.push(station.id);s.boats.push(b);
    }}
  function moveBoats(g,dt){if(!active(g)||!Number.isFinite(dt)||dt<=0)return false;const s=saved(g),h=Math.min(dt,.1),r=g.pow.river;s.clock+=h;spawn(g);
    s.boats=s.boats.filter(b=>{const d=(b.logical-r.logicalDistance)/SCALE;return d>-75&&d<180;});
    for(const b of s.boats){const d=definitions[b.kind];b.age=finite(b.age)+h;b.phase=(finite(b.phase)+h*(b.kind==='workboat'?.46:.80))%(Math.PI*2);b.speed=d.speed;
      const weave=b.kind==='net'?0:Math.sin(b.age*.09+Number(b.id.split('-')[1]))*.20,target=clamp(b.homeLane+weave,-11,11),dx=clamp(target-b.lane,-.10*h,.10*h),dz=d.speed*h*SCALE;
      const choices=[[b.lane+dx,b.logical+dz],[b.lane+Math.abs(dz/SCALE)*.7,b.logical+dz*.7],[b.lane-Math.abs(dz/SCALE)*.7,b.logical+dz*.7]],next=choices.find(([x,z])=>Math.abs(x)<11.3&&safeCandidate(g,b,x,z));
      b.held=!next;if(next){const wx=next[0]-b.lane,wz=(next[1]-b.logical)/SCALE,desired=Math.atan2(wx,-wz),turn=Math.atan2(Math.sin(desired-b.yaw),Math.cos(desired-b.yaw)),yaw=b.yaw+clamp(turn,-h*.45,h*.45);if(safeCandidate(g,{...b,yaw},next[0],next[1])){b.yaw=yaw;b.lane=next[0];b.logical=next[1];}else b.held=true;}
    }
    syncSolids(g);return true;
  }
  function hullOccludes(g,from,to,ignoreId){if(!point(from)||!point(to))return false;for(const q of collisionBoxes(g)){if(q.boatId===ignoreId)continue;let lo=0,hi=1;const mn=[q.x-q.hw,q.yMin,q.z-q.hl],mx=[q.x+q.hw,q.yMax,q.z+q.hl];for(let k=0;k<3;k++){const d=to[k]-from[k];if(Math.abs(d)<1e-8){if(from[k]<mn[k]||from[k]>mx[k]){lo=2;break;}}else{let a=(mn[k]-from[k])/d,b=(mx[k]-from[k])/d;if(a>b){const n=a;a=b;b=n;}lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)break;}}if(lo<=hi&&hi>.015&&lo<.985)return true;}return false;}
  function visibility(g,b){const r=g.pow.river,e=g.evade,p=boatPosition(g,b),distance=flat(p,e.p);if(r.submerged||e.underwater||e.submerged||distance>28)return 0;const daylight=clamp(finite(r.daylight,.45),0,1),range=10+daylight*18;if(distance>range)return 0;
    const eye=[p[0],r.waterY+1.18,p[2]],target=[e.p[0],r.waterY+(r.mode==='bank'?.9:.25),e.p[2]],face=b.yaw+Math.sin(saved(g).clock*.24+b.phase)*.75,bearing=Math.atan2(e.p[0]-p[0],-(e.p[2]-p[2]));
    if(distance>3&&Math.abs(Math.atan2(Math.sin(bearing-face),Math.cos(bearing-face)))>1.25)return 0;
    const P=config.POW||root.POW;if(P?.los&&!P.los(g,eye,target)||hullOccludes(g,eye,target,b.id))return 0;
    const cover=clamp(Math.max(finite(r.cover),finite(root.RiverThreats?.concealment?.(g))),0,1),foliage=root.GroundItems?.visibilityFactor?.(g,distance,{p})||1,posture=r.mode==='hidden'?.18:r.mode==='bank'?1:.54;
    return clamp((1-distance/range)*posture*(1-cover*.88)*foliage*(e.running?1.35:1)*(1-finite(r.rain)*.3),0,1.5);
  }
  function observe(g,dt){if(!active(g)||!Number.isFinite(dt)||dt<=0)return false;const s=saved(g),r=g.pow.river,h=Math.min(dt,.1);for(const b of s.boats){const visible=visibility(g,b);b.interest=clamp(finite(b.interest)+(visible>0?visible*1.1:-.65)*h,0,6);
      if(b.interest>1&&!b.warned){b.warned=true;notify(g,b.reporter?'A fisherman has noticed movement. He is looking toward the bank. Dive or break sight behind a hull, log or reeds before he calls out.':'The fisherman is watching the water. Keep clear of the oar and hull; dive or use the boat as cover.');}
      if(b.reporter&&!b.reported&&s.reports<MAX_REPORTS&&b.interest>2.1&&visible>.08&&b.reportAt===null){b.reportAt=s.clock+4;notify(g,'The fisherman starts calling toward the bank. Break his sight line now; diving or solid hull cover stops a clear sighting.');}
      if(b.reportAt!==null){if(visible<.04){b.reportAt=null;b.interest=Math.min(b.interest,.9);}else if(s.clock>=b.reportAt){const p=boatPosition(g,b),guards=(g.evade.searchers||[]).filter(a=>a.alive!==false&&a.armed===true&&a.kind==='nva'&&point(a.p)&&flat(a.p,p)<48);b.reportAt=null;b.reported=true;if(guards.length&&s.reports<MAX_REPORTS){s.reports++;(config.POW||root.POW)?.AI?.noise?.(g,p,2,'fisher calling from a boat',b.id);g.app?.radio?.('FISHER','Có người dưới nước! <span class="dim">Someone is in the water!</span>','warn','vi-VN','Có người dưới nước!');notify(g,'A fisherman calls from the boat. Nearby North Vietnamese soldiers can investigate the sound; dive, use a hull or reach the reeds.');}}}
      if(!b.held&&b.kind!=='workboat'&&Math.sin(b.phase)>.94&&flat(boatPosition(g,b),g.evade.p)<18&&s.clock-transient(g).lastSplash>.7){transient(g).lastSplash=s.clock;if(g.app?.set?.sound)g.app.audio?.swimStroke?.(.12*(1-flat(boatPosition(g,b),g.evade.p)/22),false);}
    }return true;
  }
  function step(g,dt){const moved=moveBoats(g,dt);observe(g,dt);return moved;}
  function boats(g){return eligible(g)?saved(g).boats.map(b=>({...b,p:boatPosition(g,b),armed:false,civilian:true})):[];}
  function view(g){if(!eligible(g))return{active:false,boats:[],reports:0,cover:false};const s=saved(g),list=boats(g),nearest=list.slice().sort((a,b)=>flat(a.p,g.evade.p)-flat(b.p,g.evade.p))[0],guards=(g.evade.searchers||[]).filter(a=>a.alive!==false&&a.armed===true&&point(a.p)),eye=[g.evade.p[0],g.pow.river.waterY+.25,g.evade.p[2]],cover=guards.some(a=>hullOccludes(g,[a.p[0],a.p[1]+1.5,a.p[2]],eye));return {active:true,boats:list.map(b=>({id:b.id,kind:b.kind,p:b.p,yaw:b.yaw,phase:b.phase,distance:flat(b.p,g.evade.p),interest:b.interest,reportIn:b.reportAt===null?null:Math.max(0,b.reportAt-s.clock),held:b.held,civilian:true,armed:false})),reports:s.reports,clock:s.clock,cover,nearest:nearest?{id:nearest.id,kind:nearest.kind,distance:flat(nearest.p,g.evade.p),interest:nearest.interest}:null,solids:collisionBoxes(g).length};}

  // Hull stations and individual planks keep the bow narrow and gunwales
  // curved. There is no closed rectangular boat proxy in the rendered model.
  function hull(MB,length,beam,blue=false){const m=new MB(),n=28,rings=[],outer=[.28,.195,.115],inner=[.39,.30,.19];
    for(let i=0;i<=n;i++){const t=i/n,u=t*2-1,width=.055+.945*Math.pow(Math.sin(Math.PI*t),.64),rise=Math.pow(Math.abs(u),3)*.30,z=u*length*.5,top=.34+rise,ring=[[-.5,.34],[-.43,0],[-.16,-.22],[.16,-.22],[.43,0],[.5,.34]].map(([x,y])=>[x*beam*width,y+rise,z]);rings.push(ring);
      if(i){const prev=rings[i-1];for(let j=0;j<5;j++){const shade=.91+.14*((i+j)%4)/3,col=blue&&j!==2?[.055*shade,.25*shade,.32*shade]:outer.map(c=>c*shade);m.quad(prev[j],prev[j+1],ring[j+1],ring[j],col);const inset=p=>[p[0]*.93,p[1]+.028,p[2]];m.quad(inset(prev[j]),inset(ring[j]),inset(ring[j+1]),inset(prev[j+1]),inner);}}
      if(i>0&&i<n&&i%2===0)m.tube(ring.map(p=>({p:[p[0]*.90,p[1]+.05,p[2]],r:.023})),[.31,.23,.14],5);
    }
    for(const side of[0,5])m.tube(rings.map(r=>({p:r[side],r:.032})),blue?[.49,.34,.14]:[.43,.32,.19],6);
    for(let j=0;j<5;j++)m.tube(rings.map((r,i)=>({p:[r[j][0]+(r[j+1][0]-r[j][0])*.93,r[j][1]+(r[j+1][1]-r[j][1])*.93+.004,r[j][2]],r:.005})),[.13,.095,.06],4);
    for(const end of[0,n]){const r=rings[end];for(let j=1;j<4;j++)m.tri(r[0],r[j],r[j+1],[.25,.18,.105]);m.tri(r[0],r[4],r[5],[.25,.18,.105]);}
    for(let j=-2;j<2;j++)m.box((j+.5)*beam*.15,-.10,0,beam*.073,.025,length*.36,[.34+(j+2)*.014,.25,.15]);
    for(const z of[-length*.25,length*.26])m.box(0,.19,z,beam*.39,.045,.14,[.40,.30,.18]);
    m.fishingHull={length,beam,openInterior:true,longitudinalStations:n+1,ribs:13,curvedBow:true};return m;
  }
  function torus(m,x,y,z,R,r){const point=(u,v)=>[x+Math.cos(v)*r,y+Math.cos(u)*(R+Math.sin(v)*r),z+Math.sin(u)*(R+Math.sin(v)*r)];for(let i=0;i<16;i++)for(let j=0;j<6;j++){const a=i/16*Math.PI*2,b=(i+1)/16*Math.PI*2,c=j/6*Math.PI*2,d=(j+1)/6*Math.PI*2;m.quad(point(a,c),point(b,c),point(b,d),point(a,d),[.055,.057,.054]);}}
  function canopy(MB){const m=hull(MB,6.2,1.42),col=[.52,.40,.23];for(let i=0;i<=10;i++){const z=-1.18+i*.27,points=[];for(let j=0;j<=16;j++){const a=j/16*Math.PI;points.push({p:[Math.cos(a)*.67,.36+Math.sin(a)*.91,z],r:.014});}m.tube(points,col,5);}for(let j=0;j<=16;j++){const a=j/16*Math.PI;m.tube([{p:[Math.cos(a)*.67,.36+Math.sin(a)*.91,-1.18],r:.009},{p:[Math.cos(a)*.67,.36+Math.sin(a)*.91,1.52],r:.009}],j%2?[.39,.30,.18]:[.60,.48,.29],4);}for(let j=0;j<16;j++){const a=j/16*Math.PI,b=(j+1)/16*Math.PI;m.quad([Math.cos(a)*.672,.36+Math.sin(a)*.915,-1.18],[Math.cos(a)*.672,.36+Math.sin(a)*.915,1.52],[Math.cos(b)*.672,.36+Math.sin(b)*.915,1.52],[Math.cos(b)*.672,.36+Math.sin(b)*.915,-1.18],j%2?[.49,.39,.23]:[.56,.44,.27]);m.quad([Math.cos(a)*.672,.36+Math.sin(a)*.915,-1.18],[Math.cos(b)*.672,.36+Math.sin(b)*.915,-1.18],[Math.cos(b)*.672,.36+Math.sin(b)*.915,1.52],[Math.cos(a)*.672,.36+Math.sin(a)*.915,1.52],j%2?[.49,.39,.23]:[.56,.44,.27]);}return m;}
  function workboat(MB){const m=hull(MB,8.2,2.48,true);m.box(0,.40,.7,.78,.06,2.05,[.18,.28,.25]);
    for(const x of[-.80,.80]){m.box(x,1.02,1.05,.055,.58,1.13,[.065,.34,.35]);m.box(x,1.40,.74,.058,.22,.49,[.055,.095,.095]);for(const z of[.20,1.28])m.box(x,1.39,z,.07,.26,.035,[.33,.26,.14]);}
    m.box(0,1.02,2.20,.78,.58,.055,[.06,.32,.34]);m.box(0,1.66,1.05,.94,.055,1.34,[.27,.23,.15]);
    for(const x of[-1.28,1.28])for(const z of[-2.2,.05,2.40])torus(m,x,.16,z,.23,.05);
    for(let i=0;i<5;i++)m.tube([{p:[-.93+i*.44,.42,-2.5],r:.014},{p:[-.93+i*.44,.42,-.9],r:.014}],[.25,.31,.25],4);
    m.box(0,.52,-1.60,.70,.12,.58,[.32,.35,.28]);return m;
  }
  function oar(MB){const m=new MB();m.tube([{p:[0,0,0],r:.023},{p:[1.65,-.35,.07],r:.022},{p:[2.05,-.44,.1],r:.026}],[.41,.29,.15],7);m.box(1.97,-.43,.10,.28,.027,.095,[.46,.32,.17],-.1);return m;}
  function net(MB){const m=new MB(),r=.77,col=[.32,.34,.26];for(let i=0;i<16;i++){const a=i/16*Math.PI*2,points=[];for(let j=0;j<=6;j++){const q=j/6;points.push({p:[Math.cos(a)*r*q,-.16*q*(1-q),Math.sin(a)*r*q],r:.006});}m.tube(points,col,4);}for(let j=1;j<=5;j++){const points=[];for(let i=0;i<=28;i++){const a=i/28*Math.PI*2,q=j/5;points.push({p:[Math.cos(a)*r*q,-.16*q*(1-q),Math.sin(a)*r*q],r:.005});}m.tube(points,col,4);}return m;}
  function wake(MB){const m=new MB();for(const side of[-1,1])for(let j=0;j<9;j++){const z=j*.28,x=side*(.10+j*.065),nextX=side*(.10+(j+1)*.065);m.quad([x,.005,z],[nextX,.005,z+.28],[nextX+side*.028,.005,z+.28],[x+side*.028,.005,z],[.25,.36,.35]);}return m;}
  function buildMeshes(MB=config.MB){if(!MB)return{};return{fishingSampan:hull(MB,5.6,1.12),fishingCanopyHull:canopy(MB),fishingWorkboat:workboat(MB),fishingOar:oar(MB),fishingNet:net(MB),fishingWake:wake(MB)};}
  function ensureMeshes(g){const r=g?.rend;if(!r?.meshFromBuilder||!config.MB)return false;if(!r.meshes?.fishingSampan)for(const [name,m]of Object.entries(buildMeshes()))r.meshFromBuilder(name,m);return true;}
  function props(g,push){if(!eligible(g))return 0;ensureMeshes(g);const s=saved(g);let count=0;for(const b of s.boats){const p=boatPosition(g,b);if(flat(p,g.evade.p)>115)continue;const d=definitions[b.kind],wave=Math.sin(s.clock*1.15+b.phase)*.018,pitch=Math.sin(s.clock*.77+b.phase)*.012,roll=Math.sin(s.clock*.93+b.phase)*.025;p[1]+=wave;push(d.mesh,p,[b.yaw,pitch,roll],[1,1,1],[1,1,1,.018]);count++;
      if(b.kind!=='workboat'){const shaft=localPoint(g,b,[d.beam*.40,.38,-.75]);shaft[1]+=wave;push('fishingOar',shaft,[b.yaw+Math.sin(b.held?0:b.phase)*.30,pitch,.05+Math.cos(b.held?0:b.phase)*.15],[1,1,1],[1,1,1,.01]);count++;}
      if(b.kind==='net'){const at=localPoint(g,b,[-.2,.39,.8]);at[1]+=wave;const t=(s.clock+b.phase*2)%22,cast=t<2?Math.sin(t/2*Math.PI):0;at[0]-=cast*.55;at[1]+=.15*cast;push('fishingNet',at,[b.yaw,cast*.18,cast*.30],[.70+cast*.8,1,.70+cast*.8],[1,1,1,.015]);count++;}
      if(!b.held&&Math.abs(b.speed)>.15){const at=localPoint(g,b,[0,0,d.length*.48]);at[1]=g.pow.river.waterY+.045;push('fishingWake',at,[b.yaw,0,0],[d.beam*.65,1,1],[1,1,1,.03]);count++;}
    }return count;
  }
  function prepareCrew(r){const file=config.crewFile||'assets/fishing/fisher-paddle.webp';if(r.textures?.fishingCrew&&(!r.gl?.isTexture||r.gl.isTexture(r.textures.fishingCrew.tex)))return true;if(!root.Image||!r.texFromCanvas)return false;let s=crewLoads.get(r);if(s?.status==='loading'||s?.status==='error')return false;s={status:'loading'};crewLoads.set(r,s);const image=new root.Image();image.onload=()=>{if(r.gl?.isContextLost?.()){s.status='context-lost';crewLoads.delete(r);return;}const gl=r.gl,active=gl?.getParameter(gl.ACTIVE_TEXTURE),binding=gl?.getParameter(gl.TEXTURE_BINDING_2D),flip=gl?.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiply=gl?.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);try{r.texFromCanvas('fishingCrew',image);s.status='ready';}catch(e){s.status='error';s.error=String(e);}finally{if(gl){gl.activeTexture(active);gl.bindTexture(gl.TEXTURE_2D,binding);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premultiply);}}};image.onerror=()=>s.status='error';image.src=file;return false;}
  function draw(g,r){if(!eligible(g)||!r?._drawSpriteBatch)return 0;const s=saved(g),ready=prepareCrew(r),P=config.PhotoSprites||root.PhotoSprites,groups=new Map(),actors=[];for(const b of s.boats){const p=localPoint(g,b,[b.kind==='workboat'?-.30:0,b.kind==='workboat'?.48:.20,b.kind==='workboat'?-1.9:-.62]);p[1]+=Math.sin(s.clock*1.15+b.phase)*.018;const actor={id:b.id+'-civilian',kind:'farmer',p,armed:false,civilian:true,crouched:true,face:b.yaw,alive:true,boatFisher:true};actors.push(actor);if(flat(p,g.evade.p)>100)continue;let sprite,texture;if(ready){texture='fishingCrew';sprite={p,h:1.12,w:1.12,cols:4,rows:2,cell:b.held?0:Math.floor((b.phase/(Math.PI*2))*8)%8,flip:Math.sin(b.yaw-Math.atan2(r.eye[0]-p[0],-(r.eye[2]-p[2])))>0,t:[1.12,1.12,1.12],motion:[0,0,0,0]};}
      // A correct seated photograph is preferred over a standing loading
      // placeholder. Incomplete fallback descriptors stay invisible.
      else if(P?.describe){const described=P.describe(actor,{camera:r.eye,renderer:r,height:1.65,moving:false,working:false});if(described?.photoCutout&&described.h<1.3&&described.textureName&&r.textures?.[described.textureName]){sprite={...described,p:p.slice(),motion:[0,0,0,0]};texture=described.textureName;}}
      if(sprite){if(!groups.has(texture))groups.set(texture,[]);groups.get(texture).push(sprite);}}
    transient(g).actors=actors;let count=0;for(const [texture,list]of groups){r._drawSpriteBatch(texture,list,false);count+=list.length;}transient(g).drawn=count;return count;
  }
  function inspect(g){const t=g&&records.get(g),r=g?.rend,load=r&&crewLoads.get(r);return {...view(g),crewReady:!!r?.textures?.fishingCrew,crewStatus:load?.status||'idle',crewDrawn:t?.drawn||0,civilianActors:(t?.actors||[]).map(a=>({id:a.id,p:a.p.slice(),kind:a.kind,armed:false,civilian:true})),meshReady:!!r?.meshes?.fishingSampan};}
  function install(c){if(!c?.POW?.River||!c.Game)return false;configure(c);const river=c.POW.River;if(installed.has(river))return false;installed.add(river);const original=river.step;river.step=function(g,dt){if(eligible(g)&&!active(g))return false;if(active(g))moveBoats(g,dt);else if(g?.pow&&!eligible(g))syncSolids(g);const result=original.apply(this,arguments);if(eligible(g)){syncSolids(g);observe(g,dt);}else if(g?.pow)syncSolids(g);return result;};return true;}
  root.FishingBoats=Object.freeze({configure,install,eligible,step,moveBoats,observe,boats,view,inspect,blocked,hullOccludes,collisionBoxes,syncSolids,visibility,buildMeshes,props,draw,definitions,stations,limits:Object.freeze({boats:MAX_BOATS,boxesPerBoat:5,reports:MAX_REPORTS,spawnClearance:18,nearRange:100})});
})(typeof window!=='undefined'?window:globalThis);
