/* Photographic flight-deck crew and the rigid deck frame. The airborne
 * aircraft model, catapult force and mission rules remain owned by Game. */
(function(root){
  'use strict';
  const ROLES=Object.freeze(['yellow','green','red','blue','brown','white']);
  const COLORS={yellow:[1,.84,.26],green:[.42,.72,.42],red:[.86,.36,.28],blue:[.42,.55,.86],brown:[.70,.52,.33],white:[1,1,.98]};
  const LIMITS=Object.freeze({desktopGPU:40*1024*1024,touchGPU:24*1024*1024,desktopCPU:48*1024*1024,touchCPU:32*1024*1024,range:420,crew:32,jobs:8,failures:12});
  const renderers=new WeakMap(),installed=new WeakSet();let exactAxes=null;
  const finite=(n,f=0)=>Number.isFinite(n)?n:f,point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite),clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const clock=()=>root.performance&&root.performance.now?root.performance.now():Date.now();
  function basis(yaw,pitch,roll){
    if(exactAxes)return exactAxes(yaw,pitch,roll);
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll),r=[cy,0,sy],u=[-sy*sp,cp,cy*sp];
    return {fwd:[sy*cp,sp,-cy*cp],right:r.map((n,i)=>n*cr-u[i]*sr),up:r.map((n,i)=>n*sr+u[i]*cr)};
  }
  function pose(c){if(!c||!point(c.p))return null;return {p:[c.p[0],c.p[1]+finite(c.heave),c.p[2]],hdg:finite(c.hdg),pitch:finite(c.pitch),roll:finite(c.roll)};}
  function deckPoint(c,local){const s=pose(c);if(!s||!point(local))return null;const a=basis(s.hdg,s.pitch,s.roll);return s.p.map((n,i)=>n+a.right[i]*local[0]+a.up[i]*local[1]-a.fwd[i]*local[2]);}
  function deckLocal(c,p){const s=pose(c);if(!s||!point(p))return null;const a=basis(s.hdg,s.pitch,s.roll),d=p.map((n,i)=>n-s.p[i]);return [dot(d,a.right),dot(d,a.up),-dot(d,a.fwd)];}
  function orientation(c,heading=0){
    const s=pose(c);if(!s)return null;const ship=basis(s.hdg,s.pitch,s.roll),si=Math.sin(heading),co=Math.cos(heading),f=ship.fwd.map((n,i)=>n*co+ship.right[i]*si),yaw=Math.atan2(f[0],-f[2]),pitch=Math.asin(clamp(f[1],-1,1)),zero=basis(yaw,pitch,0),roll=Math.atan2(dot(ship.up,zero.right),dot(ship.up,zero.up));return [yaw,pitch,roll];
  }
  function parked(c,d){return {p:deckPoint(c,[d[0],1.62,d[1]]),rot:orientation(c,finite(d[2]))};}
  function steamPoint(g,dx=0,height=.5,dz=0){const c=g&&g.world&&g.world.carrier,a=g&&g.ac;if(!c||!a||!point(a.p))return null;const local=deckLocal(c,a.p);return deckPoint(c,[local[0]+finite(dx),clamp(finite(height,.5),.05,5),local[2]+finite(dz)]);}
  const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
  function angled(local,cv){const co=Math.cos(cv.angle),si=Math.sin(cv.angle);return [local[0]*co-local[2]*si,local[1],local[0]*si+local[2]*co];}
  function straight(local,cv){const co=Math.cos(cv.angle),si=Math.sin(cv.angle);return [local[0]*co+local[2]*si,local[1],-local[0]*si+local[2]*co];}
  function deckVelocity(g,local){const c=g.world.carrier,b=g._carrierFrameBefore,dt=g._carrierFrameDT;if(b&&dt>0){const now=deckPoint(c,local),before=deckPoint(b,local);return now.map((n,i)=>(n-before[i])/dt);}return [Math.sin(finite(c.hdg))*finite(c.spd),0,-Math.cos(finite(c.hdg))*finite(c.spd)];}
  function aimVelocity(g,local){
    const c=g.world.carrier;let before=g._carrierFrameBefore,dt=g._carrierFrameDT;
    // Guidance runs before World.step; contact runs after it. Before the
    // world advances, use the preceding completed ship-motion interval.
    if(before&&before.p.every((n,i)=>n===c.p[i])&&before.hdg===finite(c.hdg)&&before.pitch===finite(c.pitch)&&before.roll===finite(c.roll)&&before.heave===finite(c.heave)){
      before=g._carrierFramePrevious;dt=g._carrierPreviousDT;
    }
    if(before&&dt>0){const now=deckPoint(c,local),old=deckPoint(before,local);return now.map((n,i)=>(n-old[i])/dt);}
    return [Math.sin(finite(c.hdg))*finite(c.spd),0,-Math.cos(finite(c.hdg))*finite(c.spd)];
  }
  function approachReference(g,cv){
    const c=g?.world?.carrier,a=g?.ac;if(!c||!a||!point(a.p))return null;
    const local=straight([0,1.62,cv.wire[1]+2],cv),aim=deckPoint(c,local),velocity=aimVelocity(g,local),course=orientation(c,-cv.angle)[0],fx=Math.sin(course),fz=-Math.cos(course),rx=Math.cos(course),rz=Math.sin(course),dx=a.p[0]-aim[0],dz=a.p[2]-aim[2],along=-(dx*fx+dz*fz),line=dx*rx+dz*rz,speed=67,slope=Math.tan(3.5*Math.PI/180),closing=Math.max(1,speed-velocity[0]*fx-velocity[2]*fz),targetY=aim[1]+along*slope,error=targetY-a.p[1],gain=along<220?1.15:.50,lateral=clamp(-line*.26+velocity[0]*rx+velocity[2]*rz,-17,17),vertical=clamp(error*gain+velocity[1]-closing*slope,-8.5,4);
    // The optical glidepath is stabilized to gravity and anchored to the
    // real moving aim point. Extending the pitching deck plane kilometres
    // astern made its apparent target height swing by tens of metres.
    // Keep the 67m/s airspeed target; ship speed changes relative closure,
    // rather than being added to the aircraft's forward speed.
    return {aim,aimVelocity:velocity,course,along,line,speed,closing,targetY,error,vertical,command:[fx*speed+rx*lateral,vertical,fz*speed+rz*lateral]};
  }
  function hookPoint(a){const axes=basis(finite(a.yaw),finite(a.pitch),finite(a.roll));return a.p.map((n,i)=>n-axes.up[i]*1.02-axes.fwd[i]*7.5);}
  function sample(g,dt,cv){
    const c=g?.world?.carrier,a=g?.ac;if(!c||!a||!point(a.p))return null;
    const local=deckLocal(c,a.p),A=basis(finite(c.hdg),finite(c.pitch),finite(c.roll)),dv=deckVelocity(g,local),relative=a.v.map((n,i)=>n-dv[i]),velocity=angled([dot(relative,A.right),dot(relative,A.up),-dot(relative,A.fwd)],cv),center=angled(local,cv),hook=angled(deckLocal(c,hookPoint(a)),cv);
    const old=g._carrierApproach,t=finite(g.t),previous=old&&t>old.t&&t-old.t<.35?old:null;
    const s={t,dt:clamp(finite(dt,1/60),.001,.25),center,hook,velocity,sink:-velocity[1],previous:previous?{t:previous.t,center:previous.center.slice(),hook:previous.hook.slice()}:null};g._carrierApproach=s;return s;
  }
  function landingFrame(g,dt,cv){const s=sample(g,dt,cv);if(s&&(s.center[1]>6||s.center[2]>500))g._carrierTouchdown=null;return s?s.center.slice():null;}
  function notice(g,who,text,kind){g.app?.radio?.(who,text,kind);}
  function sound(g,name,volume){g.app?.audio?.burst?.(name,volume);}
  function constrainWheels(g,s,cv){
    const c=g.world.carrier,a=g.ac,local=straight([s.center[0],1.62,s.center[2]],cv),normal=basis(finite(c.hdg),finite(c.pitch),finite(c.roll)).up;
    a.p=deckPoint(c,local);if(s.velocity[1]<0)a.v=a.v.map((n,i)=>n-normal[i]*s.velocity[1]);
    s.center[1]=1.62;s.hook=angled(deckLocal(c,hookPoint(a)),cv);a.vs=a.v[1];
  }
  function touchdown(g,s,cv){
    if(g._carrierTouchdown)return;g._carrierTouchdown={t:finite(g.t),sink:s.sink};g.shake=Math.max(finite(g.shake),clamp(s.sink*.065,.12,.55));sound(g,'thunk',.42);sound(g,'tire',.20);
    // A short pair of tyre puffs follows actual wheel contact. The user's
    // footage shows smoke at contact, but does not measure arresting time.
    if(g.world.fx?.smoke)for(const side of [-1,1]){const p=deckPoint(g.world.carrier,straight([s.center[0]+side*2.1,.12,s.center[2]+.2],cv));g.world.fx.smoke(p,[.68,.69,.67],.65,.65,[0,.45,0],.55);}
  }
  function bolter(g,s,cv){
    if(!g._carrierBolterUntil||g.t>=g._carrierBolterUntil){g._bolter=g.t;g.bolters=finite(g.bolters)+1;notice(g,'LSO','Bolter, bolter, bolter. Full power, come round again.','warn');}
    g._carrierBolterUntil=finite(g.t)+8;g._carrierBolterCV={...cv};g.ac.thr=1;g.aclsCoupled=false;g.phase='recovery';g._carrierLanding=null;
    // Keep the real tangent speed. No position jump or upward velocity is
    // injected; lift and the pilot's inputs fly the aircraft off the angle.
    if(s.center[1]<1.62)constrainWheels(g,s,cv);return true;
  }
  function contact(g,cv){
    const a=g?.ac,c=g?.world?.carrier;if(!a||!c||!a.alive||a.onDeck||!(g.departed||g.phase==='recovery'))return false;
    let s=g._carrierApproach;if(!s||s.t!==finite(g.t))s=sample(g,g._carrierFrameDT,cv);if(!s)return false;
    const [x,y,z]=s.center;if(y>1.80||y< -9||z>cv.ramp+20||z< -190||Math.abs(x)>44)return false;
    if(g._carrierBolterUntil>g.t){if(Math.abs(x)<26&&z<cv.ramp&&z> -130&&y<1.62)constrainWheels(g,s,cv);return true;}
    if(s.velocity[2]>=-3)return false; // an outbound catapult pass is never a landing
    if(Math.abs(x)>26){g.world.kill(a,'Struck the side of the ship.');return true;}
    if(z>cv.ramp-1){if(y<.45){g.world.kill(a,'Hit the ramp.');return true;}return false;}
    if(!a.gear){g.world.kill(a,'Landed with the gear up.');return true;}
    if(s.sink>9.5){g.world.kill(a,'Excessive sink rate at touchdown.');return true;}
    if(Math.abs(angle(a.roll-finite(c.roll)))>.40){g.world.kill(a,'Touched down with a wing low.');return true;}
    touchdown(g,s,cv);constrainWheels(g,s,cv);
    // A hook must actually sweep a wire in the inbound direction and at
    // deck height. Merely occupying a z interval can never award a trap.
    let wire=0;if(a.hook&&s.previous){const before=s.previous.hook,after=s.hook;for(let i=0;i<cv.wire.length;i++){const zWire=cv.wire[i];if(before[2]>=zWire&&after[2]<=zWire&&before[2]>after[2]){const u=(before[2]-zWire)/(before[2]-after[2]),hx=before[0]+(after[0]-before[0])*u,hy=before[1]+(after[1]-before[1])*u;if(Math.abs(hx)<=13&&hy>=-1.3&&hy<=.65){wire=i+1;break;}}}}
    if(wire){
      const speed=Math.max(0,-s.velocity[2]);if(speed>90)return bolter(g,s,cv);
      const duration=clamp(speed/24,1.25,3.5),state={mode:'arrest',wire,t:0,duration,speed,lateral:s.velocity[0],start:s.center.slice(),cv:{...cv},pitch:a.pitch,roll:a.roll,yaw:a.yaw,travel:0,deceleration:0,completed:false};g._carrierLanding=state;g.phase='arresting';g.aclsCoupled=false;a.thr=1;g.shake=Math.max(finite(g.shake),.26);sound(g,'wire',.6);return true;
    }
    if(s.hook[2]<Math.min(...cv.wire)-.3)return bolter(g,s,cv);return true;
  }
  function stepArrest(g,dt){
    const s=g._carrierLanding,a=g.ac,c=g.world.carrier;if(!s||s.mode!=='arrest'||!a.alive)return false;
    s.t=Math.min(s.duration,s.t+Math.max(0,dt));const u=s.t/s.duration,ease=u*u*(3-2*u),velocity=s.speed*(1-ease),travel=s.speed*s.duration*(u-u*u*u+.5*u*u*u*u),lateral=s.lateral*.12*(1-Math.exp(-s.t/.12));s.travel=travel;s.deceleration=s.speed/s.duration*6*u*(1-u);
    const compression=.11*Math.exp(-s.t*7)*Math.sin(Math.min(Math.PI,s.t*16)),center=[s.start[0]+lateral,1.62-compression,s.start[2]-travel],local=straight(center,s.cv),p=deckPoint(c,local),co=Math.cos(s.cv.angle),si=Math.sin(s.cv.angle),localV=[-velocity*si,0,-velocity*co],A=basis(finite(c.hdg),finite(c.pitch),finite(c.roll)),dv=deckVelocity(g,local);
    a.p=p;a.v=dv.map((n,i)=>n+A.right[i]*localV[0]-A.fwd[i]*localV[2]);a.vs=a.v[1];a.ias=Math.hypot(...a.v);a.fuel=Math.max(0,finite(a.fuel)-dt*(.9+finite(a.thr)*4.2));
    const rot=orientation(c,-s.cv.angle);a.pitch=s.pitch+(rot[1]+.015-s.pitch)*ease;a.roll=s.roll+(rot[2]-s.roll)*ease;a.yaw=s.yaw+angle(rot[0]-s.yaw)*ease;g.phase='arresting';g.shake=Math.max(0,finite(g.shake)-dt*1.8);a.onDeck=false;
    if(u>=1){s.mode='stopped';s.completed=true;s.stoppedAt=finite(g.t);g.wire=s.wire;a.onDeck=true;a.thr=0;a.p=deckPoint(c,straight([center[0],1.62,center[2]],s.cv));a.v=deckVelocity(g,straight([center[0],1.62,center[2]],s.cv));g.phase='done';g.teach?.('trapped');notice(g,'LSO','On deck. '+s.wire+' wire.');sound(g,'thunk',.16);const schedule=root.setTimeout||setTimeout;schedule(()=>{if(g.ac.alive&&g.phase==='done')g.debrief?.(true);},1700);}
    return true;
  }
  function camera(g){const s=g?._carrierLanding;if(!s||s.mode!=='arrest')return null;return {forward:clamp(s.deceleration/35,0,1)*.10,pitch:-clamp(s.deceleration/35,0,1)*.012};}
  function capture(g){const c=g&&g.world&&g.world.carrier,a=g&&g.ac;if(!c||!a||!a.onDeck||!point(a.p))return null;return {carrier:{p:c.p.slice(),hdg:finite(c.hdg),pitch:finite(c.pitch),roll:finite(c.roll),heave:finite(c.heave)},aircraft:a.p.slice(),local:deckLocal(c,a.p)};}
  function synchronize(g,before){
    const c=g&&g.world&&g.world.carrier,a=g&&g.ac;if(!c||!a||!a.onDeck||a.alive===false||!point(a.p)||g.paused)return false;
    let x,z;
    if(before&&before.local){
      const dx=a.p[0]-before.aircraft[0]-(c.p[0]-before.carrier.p[0]),dz=a.p[2]-before.aircraft[2]-(c.p[2]-before.carrier.p[2]),co=Math.cos(finite(c.hdg)),si=Math.sin(finite(c.hdg));x=before.local[0]+dx*co+dz*si;z=before.local[2]-dx*si+dz*co;
      a.pitch=finite(a.pitch)+finite(c.pitch)-before.carrier.pitch;a.roll=finite(a.roll)+finite(c.roll)-before.carrier.roll;
    }else{
      const dx=a.p[0]-c.p[0],dz=a.p[2]-c.p[2],co=Math.cos(finite(c.hdg)),si=Math.sin(finite(c.hdg));x=dx*co+dz*si;z=-dx*si+dz*co;a.pitch=finite(a.pitch)+finite(c.pitch);a.roll=finite(a.roll)+finite(c.roll);
    }
    // Wheels retain their original 1.62m model-origin clearance. Horizontal
    // catapult progress is retained; sea motion cannot put the deck through
    // the cockpit or leave a parked aeroplane behind as the ship rolls.
    a.p=deckPoint(c,[x,1.62,z]);return true;
  }
  function configure(o){if(o&&typeof o.bodyAxes==='function')exactAxes=o.bodyAxes;return true;}
  function install(o){
    const G=o&&o.Game;if(!G||!G.prototype||installed.has(G))return false;installed.add(G);configure(o);
    const setup=G.prototype.setupDeck,update=G.prototype.update;
    if(typeof setup==='function')G.prototype.setupDeck=function(){const result=setup.apply(this,arguments);synchronize(this);return result;};
    if(typeof update==='function')G.prototype.update=function(dt){
      if(this.paused||!Number.isFinite(dt)||dt<=0)return update.apply(this,arguments);
      const c=this.world?.carrier;this._carrierFramePrevious=this._carrierFrameBefore;this._carrierPreviousDT=this._carrierFrameDT;this._carrierFrameBefore=c?{p:c.p.slice(),hdg:finite(c.hdg),pitch:finite(c.pitch),roll:finite(c.roll),heave:finite(c.heave)}:null;this._carrierFrameDT=dt;
      if(this._carrierLanding?.mode==='arrest'){
        this.t+=dt;this.world.step(dt,this.ac,{pitch:0,roll:0,yaw:0});stepArrest(this,dt);this.app?.audio?.setEngine?.(this.ac.thr,Math.hypot(...this.ac.v),this.ac.alive);return;
      }
      const before=capture(this),result=update.apply(this,arguments);if(before||this.ac?.onDeck)synchronize(this,before);
      if(this._carrierLanding?.mode==='arrest')this.phase='arresting';
      if(this._carrierLanding?.mode==='stopped'&&this.ac?.onDeck){const rot=orientation(this.world.carrier,-this._carrierLanding.cv.angle);this.ac.yaw=rot[0];}
      return result;
    };
    const guide=G.prototype.aclsGuide;if(typeof guide==='function')G.prototype.aclsGuide=function(){if(this._carrierLanding?.mode==='arrest'||this._carrierBolterUntil>this.t)return;return guide.apply(this,arguments);};
    return true;
  }
  function role(d){if(d&&d[4])return 'yellow';const color=d&&d[3];if(!Array.isArray(color))return 'green';return ROLES.reduce((best,name)=>{const distance=COLORS[name].reduce((sum,n,i)=>sum+(finite(color[i])-n)**2,0);return distance<best.distance?{name,distance}:best;},{name:'green',distance:Infinity}).name;}
  function crewMotion(g,d,index){
    const kind=role(d),t=finite(g&&g.t),a=g&&g.ac,active=!!(a&&a.onDeck),phase=((t*.52+index*.173)%1+1)%1;
    const landing=g?._carrierLanding;if(landing?.mode==='arrest')return {role:kind,action:'idle',phase:0,offset:0,height:1.72,moving:false};
    if(landing?.mode==='stopped'&&kind==='yellow')return {role:kind,action:'signal',phase:((t-finite(landing.stoppedAt))*.8+index*.12)%1,offset:0,height:1.18,moving:false};
    if(kind==='yellow'&&d[4])return {role:kind,action:'signal',phase:active&&finite(a.cat)>0?.52:phase,offset:0,height:1.18,moving:false};
    if(kind==='green'&&index%2===0&&active)return {role:kind,action:'inspect',phase:((t*.20+index*.19)%1+1)%1,offset:0,height:1.18,moving:false};
    if(kind==='blue'&&active&&finite(a.cat)<=0){const distance=t*.95+index*.61,leg=3.6,u=((distance/leg)%2+2)%2,offset=(u<1?u:2-u)*leg-leg*.5;return {role:kind,action:'walk',phase:((distance/1.4)%1+1)%1,offset,height:1.72,moving:true,reverse:u>=1};}
    return {role:kind,action:'idle',phase:0,offset:0,height:1.72,moving:false};
  }
  function frameAt(clip,phase){phase=((finite(phase)%1)+1)%1;const weights=clip&&clip.weights;if(Array.isArray(weights)&&weights.length===clip.frames&&weights.every(n=>Number.isFinite(n)&&n>0)){const sum=weights.reduce((s,n)=>s+n,0);let end=0;for(let i=0;i<weights.length;i++){end+=weights[i]/sum;if(phase<end)return i;}}return Math.min(clip.frames-1,Math.floor(phase*clip.frames));}
  function state(r){let s=renderers.get(r);if(!s){s={alive:true,status:'idle',touch:false,promise:null,options:{},manifest:null,records:new Map(),bases:new Map(),jobs:new Map(),plates:new Map(),plateJobs:new Map(),retries:new Map(),bytes:0,cpuBytes:0,use:0,pins:new Set(),failures:[],optionalFailures:[],drawn:[]};renderers.set(r,s);}return s;}
  function live(r,s){return s.alive&&renderers.get(r)===s&&(!s.options.current||s.options.current())&&!(r.gl&&r.gl.isContextLost());}
  function fail(s,key,e,required){const list=required?s.failures:s.optionalFailures;if(!list.some(v=>v.key===key)){list.push({key,message:String(e&&e.message||e)});if(list.length>LIMITS.failures)list.shift();}}
  function mipBytes(w,h){let bytes=0;for(;;){bytes+=w*h*4;if(w===1&&h===1)return bytes;w=Math.max(1,Math.floor(w/2));h=Math.max(1,Math.floor(h/2));}}
  const filename=n=>typeof n==='string'&&/^[a-z0-9_-]+\.(webp|png)$/.test(n);
  function validate(m){
    const size=a=>Array.isArray(a)&&a.length===2&&a.every(n=>Number.isInteger(n)&&n>0&&n<=2048),registration=r=>r&&Number.isFinite(r.baseline)&&r.baseline>0&&r.baseline<=1&&Number.isFinite(r.center)&&r.center>=0&&r.center<=1,bounds=(b,s)=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]<=s[0]&&b[3]<=s[1]&&b[2]>b[0]&&b[3]>b[1],body=c=>Number.isFinite(c.bodyHeight)&&c.bodyHeight>0&&c.bodyHeight<=1;
    if(!m||m.version!==1||!m.roles)throw Error('Incomplete flight-deck crew manifest');for(const name of ROLES){const idle=m.roles[name]?.idle;if(!idle||!filename(idle.file)||!size(idle.frameSize)||!bounds(idle.bounds,idle.frameSize)||!registration(idle)||!body(idle))throw Error('Missing complete deck crew photograph: '+name);for(const [action,c]of Object.entries(m.roles[name].animations||{})){if(!['signal','inspect','walk'].includes(action)||!c||!Array.isArray(c.plates)||!c.plates.length||!c.plates.every(filename)||c.frames!==c.plates.length*4||!size(c.frameSize)||!body(c)||!Array.isArray(c.sourceRegions)||c.sourceRegions.length!==c.frames||!Array.isArray(c.bounds)||c.bounds.length!==c.frames||!Array.isArray(c.registration)||c.registration.length!==c.frames)throw Error('Invalid deck crew animation: '+name+':'+action);for(let i=0;i<c.frames;i++){const r=c.sourceRegions[i];if(!r||!Array.isArray(r.source)||r.source.length!==4||!r.source.every(Number.isInteger)||r.source[0]<0||r.source[1]<0||r.source[2]<=0||r.source[3]<=0||!Array.isArray(r.dest)||r.dest.length!==2||!r.dest.every(Number.isFinite)||r.dest[0]<0||r.dest[1]<0||r.dest[0]+r.source[2]>c.frameSize[0]||r.dest[1]+r.source[3]>c.frameSize[1]||!bounds(c.bounds[i],c.frameSize)||!registration(c.registration[i]))throw Error('Incomplete deck crew frame '+name+':'+action+':'+i);}}}return m;
  }
  async function plate(r,s,file){
    if(s.plates.has(file)){const p=s.plates.get(file);p.used=++s.use;return p;}if(s.plateJobs.has(file))return s.plateJobs.get(file);const retry=s.retries.get(file);if(retry&&clock()<retry.after)return null;
    const task=(async()=>{try{const image=await new Promise((resolve,reject)=>{const im=new root.Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Flight-deck photograph failed: '+file));im.src='assets/carrier/hires/'+file;});if(!live(r,s))return null;const p={im:image,bytes:image.naturalWidth*image.naturalHeight*4,used:++s.use};s.plates.set(file,p);s.cpuBytes+=p.bytes;s.retries.delete(file);const budget=s.touch?LIMITS.touchCPU:LIMITS.desktopCPU;for(const [key,old]of [...s.plates].sort((a,b)=>a[1].used-b[1].used)){if(s.cpuBytes<=budget)break;if(key!==file){s.plates.delete(key);s.cpuBytes-=old.bytes;}}return p;}catch(e){const attempts=(s.retries.get(file)?.attempts||0)+1;s.retries.set(file,{attempts,after:clock()+[1000,4000,15000,60000][Math.min(3,attempts-1)]});fail(s,file,e,false);return null;}finally{s.plateJobs.delete(file);}})();s.plateJobs.set(file,task);return task;
  }
  function evict(r,s,bytes){for(const record of [...s.records.values()].filter(v=>v.resident&&!v.required&&!s.pins.has(v.key)).sort((a,b)=>a.used-b.used)){if(s.bytes+bytes<=(s.touch?LIMITS.touchGPU:LIMITS.desktopGPU))break;const T=r.textures?.[record.textureName];if(T?.tex&&r.gl&&!r.gl.isContextLost())r.gl.deleteTexture(T.tex);if(r.textures)delete r.textures[record.textureName];record.resident=false;s.bytes-=record.bytes;}return s.bytes+bytes<=(s.touch?LIMITS.touchGPU:LIMITS.desktopGPU);}
  async function ensure(r,s,name,action,index=0,required=false){
    const key=name+':'+action+':'+index,old=s.records.get(key);if(old?.resident&&r.textures?.[old.textureName]){old.used=++s.use;return old;}if(s.jobs.has(key))return s.jobs.get(key);if(s.jobs.size>=LIMITS.jobs&&!required)return null;
    const task=(async()=>{try{const spec=s.manifest.roles[name],c=action==='idle'?spec.idle:spec.animations[action],file=action==='idle'?c.file:c.plates[Math.floor(index/4)],p=await plate(r,s,file);if(!p||!live(r,s))return null;const size=c.frameSize,src=action==='idle'?[0,0,...size]:c.sourceRegions[index].source,dest=action==='idle'?[0,0]:c.sourceRegions[index].dest,edge=action==='idle'?(s.touch?768:960):(s.touch?576:768),scale=Math.min(1,edge/Math.max(...size)),w=Math.max(1,Math.round(size[0]*scale)),h=Math.max(1,Math.round(size[1]*scale)),bytes=mipBytes(w,h);if(!evict(r,s,bytes))return null;
      if(src[0]+src[2]>p.im.naturalWidth||src[1]+src[3]>p.im.naturalHeight)throw Error('Deck crew source region exceeds photograph');const cv=root.document.createElement('canvas');cv.width=w;cv.height=h;const ctx=cv.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(p.im,...src,dest[0]*w/size[0],dest[1]*h/size[1],src[2]*w/size[0],src[3]*h/size[1]);if(!live(r,s)){cv.width=cv.height=1;return null;}const textureName='carrier_crew_'+key.replace(/:/g,'_'),T=r.texFromCanvas(textureName,cv);if(!T?.tex)throw Error('Deck crew texture upload unavailable');const gl=r.gl;if(gl){gl.bindTexture(gl.TEXTURE_2D,T.tex);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}const registration=action==='idle'?c:c.registration[index],record={key,name,action,frame:index,textureName,resident:true,required,used:++s.use,bytes,width:size[0],height:size[1],gpuWidth:w,gpuHeight:h,bounds:(action==='idle'?c.bounds:c.bounds[index]).slice(),baseline:registration.baseline,center:registration.center,bodyHeight:c.bodyHeight};s.records.set(key,record);s.bytes+=bytes;if(required)s.bases.set(name,key);cv.width=cv.height=1;return record;
    }catch(e){fail(s,key,e,required);return null;}finally{s.jobs.delete(key);}})();s.jobs.set(key,task);return task;
  }
  async function load(r,options={}){if(!r||typeof r.texFromCanvas!=='function')return null;const s=state(r);if(s.promise)return s.promise;s.touch=!!options.touch;s.options={...options};s.status='loading';s.promise=(async()=>{try{const response=await root.fetch(options.manifest||'assets/carrier/hires/manifest.json');if(!response.ok)throw Error('Flight-deck manifest HTTP '+response.status);s.manifest=validate(await response.json());for(const name of ROLES)if(!await ensure(r,s,name,'idle',0,true))fail(s,name,Error('Required flight-deck photograph unavailable: '+name),true);if(live(r,s))s.status=s.bases.size===ROLES.length?'ready':'error';return inspect(r);}catch(e){if(live(r,s)){fail(s,'manifest',e,true);s.status='error';}return inspect(r);}})();return s.promise;}
  function ready(r){return !!(r&&renderers.get(r)?.status==='ready');}
  function anchor(record,p,h,eye,flip=false){const height=h/record.bodyHeight,width=height*record.width/record.height,dx=eye[0]-p[0],dz=eye[2]-p[2],distance=Math.hypot(dx,dz)||1,center=flip?1-record.center:record.center,offset=(center-.5)*width;return {p:[p[0]-dz/distance*offset,p[1]-(1-record.baseline)*height,p[2]+dx/distance*offset],h:height,w:width,cols:1,rows:1,cell:0,flip,t:[1,1,1],motion:null,deckCrew:true,crewRole:record.name,crewAction:record.action,crewFrame:record.frame};}
  function enabled(g,r){return !!(g&&g.ac&&g.world?.carrier&&!g.evade&&!g.chute&&g.ac.alive!==false&&r&&point(r.eye)&&Math.hypot(r.eye[0]-g.world.carrier.p[0],r.eye[2]-g.world.carrier.p[2])<LIMITS.range);}
  function queue(g,r,d,index,list){
    if(!enabled(g,r)||!ready(r)||!Array.isArray(d)||!Array.isArray(list))return false;const s=renderers.get(r),m=crewMotion(g,d,index),spec=s.manifest.roles[m.role],clip=spec.animations?.[m.action];let record=s.records.get(s.bases.get(m.role));if(!record?.resident)return false;
    if(clip){const frame=frameAt(clip,m.phase),key=m.role+':'+m.action+':'+frame,warm=s.records.get(key);if(warm?.resident)record=warm;else ensure(r,s,m.role,m.action,frame);ensure(r,s,m.role,m.action,(frame+1)%clip.frames);}
    const local=[d[0],.025,d[1]+m.offset],foot=deckPoint(g.world.carrier,local),height=record.action==='idle'?1.72:m.height;
    const ship=basis(finite(g.world.carrier.hdg),finite(g.world.carrier.pitch),finite(g.world.carrier.roll)),direction=m.reverse?-1:1,dx=r.eye[0]-foot[0],dz=r.eye[2]-foot[2],flip=m.action==='walk'&&(-ship.fwd[0]*direction*dz+ship.fwd[2]*direction*dx)<0,q=anchor(record,foot,height,r.eye,flip);
    q.crewIndex=index;q.crewFoot=foot.slice();q.crewLocal=local;q.crewPhase=m.phase;q.crewMoving=m.moving;q.textureName=record.textureName;record.used=++s.use;s.pins.add(record.key);list.push(q);return true;
  }
  function beginFrame(r){const s=r&&renderers.get(r);if(s){s.pins.clear();s.drawn=[];}}
  function draw(g,r,list){const s=r&&renderers.get(r);if(!s||!Array.isArray(list)||!list.length)return 0;const groups=new Map();for(const q of list.slice(0,LIMITS.crew)){if(!r.textures?.[q.textureName])continue;const rows=groups.get(q.textureName)||[];rows.push(q);groups.set(q.textureName,rows);s.drawn.push({role:q.crewRole,action:q.crewAction,frame:q.crewFrame,index:q.crewIndex,textureName:q.textureName,foot:q.crewFoot.slice(),local:q.crewLocal.slice(),p:q.p.slice(),h:q.h,w:q.w,phase:q.crewPhase,moving:q.crewMoving});}try{for(const [texture,rows]of groups)r.drawSprites(texture,rows);return s.drawn.length;}finally{s.pins.clear();}}
  function shadows(g,list){const c=g&&g.world&&g.world.carrier;if(!c||!Array.isArray(list))return [];const n=basis(finite(c.hdg),finite(c.pitch),finite(c.roll)).up,slope=[-n[0]/Math.max(.1,n[1]),-n[2]/Math.max(.1,n[1])];return list.slice(0,LIMITS.crew).filter(q=>point(q.crewFoot)).map(q=>({p:q.crewFoot.slice(),r:q.crewAction==='signal'||q.crewAction==='inspect'?.42:.30,d:.24,sx:1.1,slope:slope.slice(),lift:.012}));}
  async function prepareFrame(r,name,action,index){const s=r&&renderers.get(r);if(!s?.manifest?.roles[name])return null;await ensure(r,s,name,action,index);return inspect(r);}
  function inspect(r){const s=r&&renderers.get(r);return s?{status:s.status,ready:s.status==='ready',bytes:s.bytes,budget:s.touch?LIMITS.touchGPU:LIMITS.desktopGPU,cpuBytes:s.cpuBytes,cpuBudget:s.touch?LIMITS.touchCPU:LIMITS.desktopCPU,required:s.bases.size,pending:s.jobs.size,failures:s.failures.map(v=>({...v})),optionalFailures:s.optionalFailures.map(v=>({...v})),frames:[...s.records.values()].map(v=>({...v,bounds:v.bounds.slice()})),drawn:s.drawn.map(v=>({...v,foot:v.foot.slice(),local:v.local.slice(),p:v.p.slice()}))}:{status:'idle',ready:false,bytes:0,budget:LIMITS.desktopGPU,cpuBytes:0,cpuBudget:LIMITS.desktopCPU,frames:[],drawn:[],failures:[],optionalFailures:[],required:0};}
  function dispose(r){const s=r&&renderers.get(r);if(!s)return false;s.alive=false;for(const record of s.records.values()){const T=r.textures?.[record.textureName];if(T?.tex&&r.gl&&!r.gl.isContextLost())r.gl.deleteTexture(T.tex);if(r.textures)delete r.textures[record.textureName];}renderers.delete(r);return true;}
  function retry(r){const options=renderers.get(r)?.options||{};dispose(r);return load(r,options);}
  root.CarrierLaunch=Object.freeze({configure,install,deckPoint,deckLocal,orientation,parked,steamPoint,angled,straight,deckVelocity,aimVelocity,approachReference,hookPoint,landingFrame,contact,stepArrest,camera,capture,synchronize,role,crewMotion,frameAt,load,ready,enabled,anchor,beginFrame,queue,draw,shadows,prepareFrame,inspect,dispose,retry,limits:LIMITS,roles:ROLES});
})(typeof window!=='undefined'?window:globalThis);
