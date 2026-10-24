'use strict';
// Real deck-frame math and original carrier geometry. WebGL/native launch
// validation is separate; these checks do not claim device performance.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/flight/carrier-launch.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function fixture(options={}){const window={setTimeout:options.schedule||(()=>0)};vm.runInNewContext(source,{window});return window.CarrierLaunch;}
const near=(a,b,reason='')=>assert.ok(Math.abs(a-b)<1e-8,`${reason} ${a} != ${b}`),nearPoint=(a,b)=>a.forEach((n,i)=>near(n,b[i]));
function carrier(){return {p:[16000,19,250],hdg:Math.PI*1.5,pitch:.027,roll:-.039,heave:.84,spd:12};}
function originalFunction(name){const at=html.indexOf('function '+name+'(');assert.ok(at>=0);let i=html.indexOf('{',at),depth=1,j=i+1;for(;j<html.length&&depth;j++){if(html[j]==='{')depth++;else if(html[j]==='}')depth--;}return html.slice(at,j);}

test('deck transform matches the original mesh basis and has an exact inverse across ship motion',()=>{
 const M=fixture(),scope={};vm.runInNewContext(`const vadd=(a,b)=>a.map((n,i)=>n+b[i]),vmul=(a,n)=>a.map(x=>x*n),vcross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],vlen2=a=>a.reduce((s,n)=>s+n*n,0),vnorm=a=>{const l=Math.hypot(...a);return a.map(n=>n/l)};${originalFunction('bodyAxes')};this.axes=bodyAxes;`,scope);
 for(let i=0;i<25;i++){
  const c=carrier();c.hdg=i*.31;c.pitch=Math.sin(i)*.05;c.roll=Math.cos(i)*.06;c.heave=Math.sin(i*.3)*1.2;
  const p=[-9,1.62,-150+i*12],a=scope.axes(c.hdg,c.pitch,c.roll),expected=c.p.map((n,k)=>n+(k===1?c.heave:0)+a.right[k]*p[0]+a.up[k]*p[1]-a.fwd[k]*p[2]);nearPoint(M.deckPoint(c,p),expected);nearPoint(M.deckLocal(c,expected),p);
 }
 assert.equal(M.deckPoint({},[0,0,0]),null);assert.equal(M.deckLocal(carrier(),[NaN,0,0]),null);
});

test('bow camera/deck intersection is reproduced by the old flat anchor and removed by the full frame',()=>{
 const M=fixture(),c=carrier();c.pitch=.035;c.roll=0;c.heave=.9;
 // Original setupDeck/localToWorld raises every point by1.62m regardless
 // of the pitched bow, which here is over5m above the flat deck datum.
 const flat=[c.p[0]-9*Math.cos(c.hdg)+150*Math.sin(c.hdg),c.p[1]+1.62,c.p[2]-9*Math.sin(c.hdg)-150*Math.cos(c.hdg)];
 assert.ok(M.deckLocal(c,flat)[1]<-3,'Flat aircraft origin is below the visible bow deck');
 const full=M.deckPoint(c,[-9,1.62,-150]);near(M.deckLocal(c,full)[1],1.62);assert.ok(full[1]>flat[1]+4);
});

test('the original real catapult integrator sinks through a flat deck without its wheel constraint',()=>{
 const M=fixture(),s={};
 vm.runInNewContext(`const PI=Math.PI,TAU=2*Math.PI,DEG=Math.PI/180,G=9.80665,performance={now:()=>0},clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,t)=>a+(b-a)*t,vadd=(a,b)=>a.map((n,i)=>n+b[i]),vsub=(a,b)=>a.map((n,i)=>n-b[i]),vmul=(a,n)=>a.map(x=>x*n),vcross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],vdot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0),vlen2=a=>vdot(a,a),vlen=a=>Math.hypot(...a),vnorm=a=>{const l=vlen(a);return a.map(n=>n/l)},terrainH=()=>-20;${html.match(/const AC = \{[^;]+\};/)[0]};${originalFunction('bodyAxes')};${originalFunction('acMass')};${originalFunction('newAircraft')};${originalFunction('acStep')};this.newAircraft=newAircraft;this.step=acStep;`,s);
 const old=s.newAircraft();old.p=[0,20.62,12];old.v=[0,0,-12];old.cat=2.1;old.thr=1;const g={phase:'deck',world:{carrier:{p:[0,19,0],hdg:0,pitch:0,roll:0,heave:0}},ac:JSON.parse(JSON.stringify(old))};
 for(let i=0;i<60;i++){
  const before=M.capture(g);s.step(old,1/60,{pitch:.22,roll:0,yaw:0},g.world);s.step(g.ac,1/60,{pitch:.22,roll:0,yaw:0},g.world);const position=g.ac.p.slice(),velocity=g.ac.v.slice();g.world.carrier.p[2]-=.2;M.synchronize(g,before);near(M.deckLocal(g.world.carrier,g.ac.p)[1],1.62);near(g.ac.p[0],position[0]);near(g.ac.p[2],position[2]);nearPoint(g.ac.v,velocity);
 }
 assert.equal(old.onDeck,true);assert.ok(old.p[1]<18,'One second into the original catapult stroke the cockpit origin sinks below the19mdeck');assert.ok(g.ac.p[1]>20);
});

test('parked aircraft orientations share the real deck normal at every local heading',()=>{
 const M=fixture(),c=carrier(),up=M.deckPoint(c,[0,1,0]).map((n,i)=>n-M.deckPoint(c,[0,0,0])[i]);
 for(const heading of [0,.3,1.4,2.4,Math.PI]){
  const p=M.parked(c,[26,-128,heading]),n=M.orientation({...c,hdg:p.rot[0],pitch:p.rot[1],roll:p.rot[2]},0),small=M.deckPoint({...c,hdg:p.rot[0],pitch:p.rot[1],roll:p.rot[2]},[0,1,0]).map((v,i)=>v-M.deckPoint({...c,hdg:p.rot[0],pitch:p.rot[1],roll:p.rot[2]},[0,0,0])[i]);
  nearPoint(small,up);near(M.deckLocal(c,p.p)[1],1.62);assert.ok(n.every(Number.isFinite));
 }
});

test('waiting and catapult progress stay rigidly over the moving deck without changing velocity or loadout',()=>{
 const M=fixture(),g={phase:'deck',world:{carrier:carrier()},ac:{p:[0,0,0],pitch:.035,roll:0,yaw:Math.PI*1.5,v:[-12,0,0],onDeck:true,alive:true,cat:0,fuel:8000,bombs:12}};
 g.ac.p=M.deckPoint(g.world.carrier,[-9,1.62,12]);
 for(let i=0;i<60;i++){
  const before=M.capture(g),c=g.world.carrier;c.p[0]-=.2;c.heave=Math.sin(i*.2);c.pitch=Math.sin(i*.13)*.035;c.roll=Math.cos(i*.09)*.04;
  g.ac.p[0]-=.2;const retained=JSON.stringify({v:g.ac.v,fuel:g.ac.fuel,bombs:g.ac.bombs});assert.equal(M.synchronize(g,before),true);nearPoint(M.deckLocal(c,g.ac.p),[-9,1.62,12]);assert.equal(JSON.stringify({v:g.ac.v,fuel:g.ac.fuel,bombs:g.ac.bombs}),retained);
 }
 const before=M.capture(g);g.ac.p[0]-=10;g.world.carrier.p[0]-=.2;M.synchronize(g,before);near(M.deckLocal(g.world.carrier,g.ac.p)[2],12-9.8);
 const airborne=JSON.stringify(g);g.ac.onDeck=false;const off=JSON.stringify(g);assert.equal(M.synchronize(g,M.capture(g)),false);assert.equal(JSON.stringify(g),off);assert.notEqual(airborne,off);
});

test('installation is idempotent, pause holds the deck state and airborne updates remain untouched',()=>{
 const M=fixture();class Game{setupDeck(){this.ac={p:[0,20.62,12],pitch:.035,roll:0,onDeck:true,alive:true};this.world={carrier:{p:[0,19,0],hdg:0,pitch:.03,roll:.02,heave:.5}};}update(dt){if(this.paused)return;this.t=(this.t||0)+dt;this.world.carrier.heave+=.01;}}
 assert.equal(M.install({Game}),true);assert.equal(M.install({Game}),false);const g=new Game();g.setupDeck();near(M.deckLocal(g.world.carrier,g.ac.p)[1],1.62);g.paused=true;const before=JSON.stringify(g);g.update(.1);assert.equal(JSON.stringify(g),before);g.paused=false;g.ac.onDeck=false;const p=g.ac.p.slice();g.update(.1);nearPoint(g.ac.p,p);near(g.t,.1);
});

test('crew keep original role colors and derived walking is continuous without mutating deck arrays',()=>{
 const M=fixture(),colors={yellow:[1,.84,.26],green:[.42,.72,.42],red:[.86,.36,.28],blue:[.42,.55,.86],brown:[.70,.52,.33],white:[1,1,.98]};
 for(const [name,color]of Object.entries(colors)){const d=[-29,30,.9,color,0],before=JSON.stringify(d);assert.equal(M.role(d),name);for(const t of [0,.016,1,2,6,12]){const g={t,ac:{onDeck:true,cat:0}},a=M.crewMotion(g,d,7),b=M.crewMotion(g,d,7);assert.equal(JSON.stringify(a),JSON.stringify(b));assert.ok(a.phase>=0&&a.phase<1);if(name==='blue')assert.ok(Math.abs(a.offset)<=1.8);}assert.equal(JSON.stringify(d),before);}
 const d=[-19,-4,1.3,colors.yellow,1];assert.equal(M.crewMotion({t:20,ac:{onDeck:true,cat:1}},d,0).phase,.52);
});

test('signal timing varies holds while every authored pose remains reachable in order',()=>{
 const M=fixture(),clip={frames:8,weights:[1.3,1.1,.9,.8,.8,.9,1.1,1.3]},seen=[];for(let i=0;i<1000;i++){const frame=M.frameAt(clip,(i+.5)/1000);if(seen.at(-1)!==frame)seen.push(frame);}assert.equal(JSON.stringify(seen),JSON.stringify([0,1,2,3,4,5,6,7]));const durations=Array(8).fill(0);for(let i=0;i<10000;i++)durations[M.frameAt(clip,(i+.5)/10000)]++;assert.ok(durations[0]>durations[3]);
});

test('crew contact shadows follow the pitched deck plane rather than the ocean underneath',()=>{
 const M=fixture(),c=carrier(),foot=M.deckPoint(c,[-19,.025,-4]),g={world:{carrier:c}},sh=M.shadows(g,[{crewFoot:foot,crewAction:'signal'}])[0];nearPoint(sh.p,foot);for(const offset of [[.2,.1],[-.3,.2]]){const y=foot[1]+offset[0]*sh.slope[0]+offset[1]*sh.slope[1],local=M.deckLocal(c,[foot[0]+offset[0],y,foot[2]+offset[1]]);near(local[1],.025);}assert.ok(sh.r<.5&&sh.d<.4);
});

test('catapult steam starts above the moving flight deck instead of near the sea surface',()=>{
 const M=fixture(),c=carrier(),g={world:{carrier:c},ac:{p:M.deckPoint(c,[-9,1.62,12])}};
 for(const height of [.2,1,2.8]){const p=M.steamPoint(g,2,height,-4);nearPoint(M.deckLocal(c,p),[-7,height,8]);assert.ok(p[1]>15,'Smoke belongs above the carrier deck, not worldy1');}
});

const CV={angle:-9.5*Math.PI/180,wire:[96,84,72,60],ramp:142,aim:72};
function recovery(M,options={}){
 const c=carrier();if(options.flat)Object.assign(c,{hdg:0,pitch:0,roll:0,heave:0});
 const rot=M.orientation(c,-CV.angle),normal=M.deckPoint(c,[0,1,0]).map((n,i)=>n-M.deckPoint(c,[0,0,0])[i]),origin=M.deckPoint(c,[0,0,0]),f=M.deckPoint(c,M.straight([0,0,-1],CV)).map((n,i)=>n-origin[i]),calls=[],sounds=[],smoke=[];
 const g={t:10,departed:true,phase:'recovery',shake:0,app:{radio:(...a)=>calls.push(a),audio:{burst:(...a)=>sounds.push(a),setEngine(){}}},ac:{p:[],v:[],yaw:rot[0],pitch:rot[1]+8.2*Math.PI/180,roll:rot[2],gear:true,hook:options.hook!==false,onDeck:false,alive:true,thr:.46,fuel:3500,ias:65},world:{carrier:c,fx:{smoke:(...a)=>smoke.push(a)},kill(a,why){a.alive=false;g.reason=why;}},calls,sounds,smoke,teach(){},debrief(pass){this.debriefed=pass;}};
 g.place=(z,y=1.62,x=0,speed=60,sink=3)=>{g.ac.p=M.deckPoint(c,M.straight([x,y,z],CV));const dv=M.deckVelocity(g,M.straight([x,y,z],CV));g.ac.v=dv.map((n,i)=>n+f[i]*speed-normal[i]*sink);};g.place(69);
 return g;
}

test('full moving-deck contact measures sink against the deck normal and velocity',()=>{
 const M=fixture(),g=recovery(M);g._carrierFrameBefore=JSON.parse(JSON.stringify(g.world.carrier));g._carrierFrameDT=.1;g.world.carrier.heave+=.4;
 const p=M.straight([0,1.62,100],CV),n=M.deckPoint(g.world.carrier,[0,1,0]).map((v,i)=>v-M.deckPoint(g.world.carrier,[0,0,0])[i]),dv=M.deckVelocity(g,p);
 g.ac.p=M.deckPoint(g.world.carrier,p);g.ac.v=dv.map((v,i)=>v-n[i]*3);const L=M.landingFrame(g,.1,CV);nearPoint(L,[0,1.62,100]);near(g._carrierApproach.sink,3);assert.ok(g.ac.v[1]>0,'A rising deck can be struck while the aircraft is rising in world coordinates');
});

test('the actual checkShip method rejects the native outbound heavy-sortie false landing',()=>{
 const M=fixture(),g=recovery(M);g.departed=false;g.phase='airborne';g.ac.hook=false;g.place(10,1.4,31,55,2);
 const at=html.indexOf('  checkShip(dt) {'),end=html.indexOf('\n  tryTrap(force)',at),method=html.slice(at,end),scope={CarrierLaunch:M,CV,DEG:Math.PI/180,RAD:180/Math.PI,clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),g};
 vm.runInNewContext(`class Actual{${method}};g.tryTrap=()=>{throw Error('Outbound checkShip invoked arrestment')};Actual.prototype.checkShip.call(g,1/60);`,scope);assert.equal(g.ac.alive,true);assert.equal(g.reason,undefined);
 g._carrierApproach=null;assert.equal(M.contact(g,CV),false);assert.equal(g.ac.alive,true);
});

test('only a lowered hook sweeping an actual wire at deck height starts arrestment',()=>{
 const M=fixture(),g=recovery(M);M.landingFrame(g,.1,CV);assert.equal(M.contact(g,CV),true);assert.equal(g._carrierLanding,undefined,'Occupying an interval does not catch a wire');
 g.t+=.1;g.place(63);M.landingFrame(g,.1,CV);assert.equal(M.contact(g,CV),true);assert.equal(g._carrierLanding.wire,3);assert.equal(g._carrierLanding.mode,'arrest');assert.equal(g.phase,'arresting');assert.equal(g.ac.onDeck,false);assert.ok(!g.wire);assert.ok(Math.hypot(...g.ac.v)>60,'The catch does not zero aircraft velocity');assert.equal(g.smoke.length,2);assert.equal(g.sounds.filter(r=>r[0]==='tire').length,1);assert.equal(g.sounds.filter(r=>r[0]==='wire').length,1);
 const high=recovery(M);high.place(69,10);M.landingFrame(high,.1,CV);high.t+=.1;high.place(63,10);M.landingFrame(high,.1,CV);assert.equal(M.contact(high,CV),false);assert.ok(!high._carrierLanding);
});

test('missing wires or keeping the hook up gives a retained-speed bolter without a launch impulse',()=>{
 for(const hook of [false,true]){const M=fixture(),g=recovery(M,{flat:true,hook});g.place(52);M.landingFrame(g,.1,CV);const p=g.ac.p.slice(),v=g.ac.v.slice();assert.equal(M.contact(g,CV),true);assert.equal(g.bolters,1);assert.equal(g.ac.thr,1);assert.equal(g.aclsCoupled,false);nearPoint(g.ac.p,p);near(g.ac.v[0],v[0]);near(g.ac.v[2],v[2]);near(g.ac.v[1],0);assert.equal(g.ac.onDeck,false);assert.ok(!g.wire);assert.equal(g.phase,'recovery');g.t+=.1;g.place(48);M.landingFrame(g,.1,CV);M.contact(g,CV);assert.equal(g.bolters,1);}
});

test('deck-relative ramp, gear, sink-rate and wing-low failures remain real failures',()=>{
 for(const scenario of [{z:145,y:.2,reason:'Hit the ramp.'},{z:80,y:1.5,gear:false,reason:'Landed with the gear up.'},{z:80,y:1.5,sink:10,reason:'Excessive sink rate at touchdown.'}]){const M=fixture(),g=recovery(M);g.place(scenario.z,scenario.y,0,60,scenario.sink||3);if(scenario.gear===false)g.ac.gear=false;M.landingFrame(g,.1,CV);assert.equal(M.contact(g,CV),true);assert.equal(g.ac.alive,false);assert.equal(g.reason,scenario.reason);assert.ok(!g.wire);}
});

test('physical arrestment pays out distance, slows continuously and earns the trap only after stopping',()=>{
 const timers=[],M=fixture({schedule:fn=>{timers.push(fn);return 1;}}),g=recovery(M,{flat:true});g.place(69);M.landingFrame(g,.1,CV);M.contact(g,CV);g.t+=.1;g.place(63);M.landingFrame(g,.1,CV);M.contact(g,CV);const s=g._carrierLanding,start=M.angled(M.deckLocal(g.world.carrier,g.ac.p),CV),trace=[];
 for(let i=0;i<240&&s.mode==='arrest';i++){g._carrierFrameBefore=JSON.parse(JSON.stringify(g.world.carrier));g._carrierFrameDT=1/60;g.world.carrier.p[2]-=.2;g.world.carrier.heave=Math.sin(i*.05)*.6;g.world.carrier.pitch=Math.sin(i*.035)*.025;g.t+=1/60;M.stepArrest(g,1/60);const L=M.angled(M.deckLocal(g.world.carrier,g.ac.p),CV);trace.push({y:L[1],z:L[2],v:s.speed*(1-(s.t/s.duration)**2*(3-2*s.t/s.duration)),d:s.deceleration});if(s.mode==='arrest'){assert.equal(g.ac.onDeck,false);assert.ok(!g.wire);assert.equal(g.debriefed,undefined);}}
 assert.ok(trace.length>100&&trace.length<220);assert.ok(trace[0].v>59.9,'The catch retains speed and begins cable loading smoothly');assert.ok(trace.every(p=>p.y>=1.50&&p.y<=1.621));assert.ok(trace.every((p,i)=>!i||p.z<=trace[i-1].z+1e-7));assert.ok(trace.every(p=>p.d>=0&&p.d<=37));assert.ok(start[2]-trace.at(-1).z>65&&start[2]-trace.at(-1).z<85);assert.equal(g.ac.onDeck,true);assert.equal(g.wire,3);assert.equal(g.phase,'done');assert.equal(g.debriefed,undefined);assert.equal(timers.length,1);timers[0]();assert.equal(g.debriefed,true);assert.equal(g.sounds.filter(r=>r[0]==='wire').length,1);
});

test('arrestment owns the update before flight/ACLS and pause freezes all cable progress',()=>{
 const M=fixture();class Game{update(){if(this.paused)return;throw Error('Free-flight physics ran during cable arrestment');}aclsGuide(){throw Error('ACLS overwrote the cable force');}}
 M.install({Game});const g=Object.assign(new Game(),recovery(M,{flat:true}));g.world.step=(dt)=>{g.world.carrier.p[2]-=12*dt;};g.place(69);M.landingFrame(g,.1,CV);M.contact(g,CV);g.t+=.1;g.place(63);M.landingFrame(g,.1,CV);M.contact(g,CV);g.update(1/60);assert.ok(g._carrierLanding.t>0);g.aclsGuide();g.paused=true;const before=JSON.stringify(g._carrierLanding);const time=g.t;g.update(1/60);assert.equal(JSON.stringify(g._carrierLanding),before);near(g.t,time);g.paused=false;g._carrierBolterUntil=g.t+8;g._carrierLanding=null;g.aclsGuide();
});

test('guidance uses the completed ship-motion interval before World.step instead of reading zero aim velocity',()=>{
 const M=fixture(),local=M.straight([0,1.62,86],CV);class Ship{update(dt){if(this.paused)return;this.before=M.aimVelocity(this,local);this.world.carrier.p[2]-=12*dt;this.world.carrier.heave+=3*dt;this.after=M.aimVelocity(this,local);}}
 M.install({Game:Ship});const g=new Ship();g.world={carrier:{p:[0,19,0],hdg:0,pitch:0,roll:0,heave:0,spd:12}};g.ac={onDeck:false};g.update(.1);nearPoint(g.after,[0,3,-12]);g.update(.1);nearPoint(g.before,[0,3,-12]);nearPoint(g.after,[0,3,-12]);
});

test('a stabilized optical reference follows the real aim point without extrapolating deck pitch kilometres astern',()=>{
 const M=fixture(),g=recovery(M,{flat:true});g.ac.p=[0,350,4000];g.world.carrier.pitch=-.03;const low=M.approachReference(g,CV);g.world.carrier.pitch=.03;const high=M.approachReference(g,CV);assert.ok(Math.abs(high.targetY-low.targetY)<6,'Only the physical aim point moves, not a4000m pitch lever');
 const c=g.world.carrier;c.pitch=0;const initial=M.approachReference(g,CV),f=[Math.sin(initial.course),0,-Math.cos(initial.course)];g.ac.p=initial.aim.map((n,i)=>n-f[i]*64);g.ac.p[1]+=10;const a=M.approachReference(g,CV);g.ac.p=g.ac.p.map((n,i)=>n+f[i]*.002);const b=M.approachReference(g,CV);assert.ok(Math.abs(a.targetY-b.targetY)<.001,'Crossing the former150m gate cannot jump the target by4m');assert.ok(Math.hypot(b.command[0],b.command[2])<69,'Ship forward speed must not be added to the67m/s airspeed target');
});

test('the measured M5 low approach can command a positive climb while real ramp collision remains authoritative',()=>{
 const M=fixture(),g=recovery(M);Object.assign(g.world.carrier,{pitch:.01292,roll:.02890,heave:-.04877});g.place(161.267,-4.4497,8.6999,55,-1.0977);const r=M.approachReference(g,CV),old=Math.min(4,(1.55+(161.267-86)*Math.tan(3.5*Math.PI/180)+4.4497)*1.15)-67*Math.tan(3.5*Math.PI/180);assert.ok(old<0,'The former bound-before-feedforward could not ask this low aircraft to climb');assert.ok(r.vertical>0&&r.vertical<=4);M.landingFrame(g,1/60,CV);assert.equal(M.contact(g,CV),true);assert.equal(g.ac.alive,false);assert.equal(g.reason,'Hit the ramp.','Guidance does not confer collision immunity on an unrecoverable state');
});

test('the actual ball and LSO keep correct low/high and left/right signs under a pitched rolling deck',()=>{
 const M=fixture(),at=html.indexOf('  checkShip(dt) {'),end=html.indexOf('\n  tryTrap(force)',at),method=html.slice(at,end),scope={CarrierLaunch:M,CV,DEG:Math.PI/180,RAD:180/Math.PI,clamp:(n,a,b)=>Math.max(a,Math.min(b,n))};vm.runInNewContext(`class Actual{${method}};this.check=Actual.prototype.checkShip;`,scope);
 for(const horizontal of [-20,20])for(const height of [-5,5]){const g=recovery(M),c=g.world.carrier;g.approachLog=[];g.ac.aoa=.15;g.tryTrap=()=>{throw Error('A safe optical reference test reached physical deck contact');};const r=M.approachReference(g,CV),f=[Math.sin(r.course),0,-Math.cos(r.course)],right=[Math.cos(r.course),0,Math.sin(r.course)];g.ac.p=r.aim.map((n,i)=>n-f[i]*500+right[i]*horizontal);g.ac.p[1]=M.approachReference(g,CV).targetY+height;const expected=M.angled(M.deckLocal(c,g.ac.p),CV);scope.check.call(g,1/60);nearPoint(g.deckL,expected);near(g.rampD,500);near(g.lineErr,horizontal);assert.equal(Math.sign(g.gsErr),Math.sign(height));assert.equal(g.ac.alive,true);}
});

test('real aircraft forces and stabilized ACLS earn swept-wire arrestments across storm phases and recoverable low captures',()=>{
 const scenarios=[{time:10,sea:2,z:240,error:0,bombs:0},...[0,10,80,160,240,320,356,365,375,390,400,460,500].flatMap(time=>[0,-40].map(error=>({time,sea:3,z:1500,error,bombs:10})))];
 for(const scenario of scenarios){
 const M=fixture(),s={CarrierLaunch:M,CV};
 const method=name=>{const at=html.indexOf('  '+name+'('),open=html.indexOf('{',at);let depth=1,j=open+1;for(;j<html.length&&depth;j++){if(html[j]==='{')depth++;else if(html[j]==='}')depth--;}return html.slice(at,j);};
 vm.runInNewContext(`const PI=Math.PI,TAU=2*Math.PI,DEG=Math.PI/180,RAD=180/Math.PI,G=9.80665,performance={now:()=>0},clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,t)=>a+(b-a)*t,vadd=(a,b)=>a.map((n,i)=>n+b[i]),vsub=(a,b)=>a.map((n,i)=>n-b[i]),vmul=(a,n)=>a.map(x=>x*n),vcross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],vdot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0),vlen2=a=>vdot(a,a),vlen=a=>Math.hypot(...a),vnorm=a=>{const l=vlen(a);return a.map(n=>n/l)},terrainH=()=>-20;${html.match(/const AC = \{[^;]+\};/)[0]};${originalFunction('bodyAxes')};${originalFunction('acMass')};${originalFunction('newAircraft')};${originalFunction('acStep')};class Flight{${method('aclsGuide')} ${method('checkShip')} ${method('tryTrap')} update(dt){if(this.paused)return;this.t+=dt;acStep(this.ac,dt,{pitch:0,roll:0,yaw:0},this.world);this.aclsGuide(dt,this.ac,this.world);this.world.step(dt);this.checkShip(dt);} };this.Flight=Flight;this.newAircraft=newAircraft;`,s);
 M.install({Game:s.Flight});const base=recovery(M),authored={...base.ac};Object.assign(base.ac,s.newAircraft(),authored,{bombs:scenario.bombs});const g=Object.assign(new s.Flight(),base);g.t=scenario.time;g.approachLog=[];g.world.t=g.t;const seaPose=()=>{const c=g.world.carrier;c.pitch=Math.sin(g.world.t*.42+1.1)*.009*scenario.sea;c.roll=Math.sin(g.world.t*.55)*.013*scenario.sea;c.heave=Math.sin(g.world.t*.38+.4)*.30*scenario.sea;};seaPose();g.place(scenario.z,1.55+(scenario.z-86)*Math.tan(3.5*Math.PI/180)+scenario.error,0,67,4.1);const c=g.world.carrier,origin=M.deckPoint(c,[0,0,0]),f=M.deckPoint(c,M.straight([0,0,-1],CV)).map((n,i)=>n-origin[i]),normal=M.deckPoint(c,[0,1,0]).map((n,i)=>n-origin[i]),dv=M.deckVelocity(g,M.deckLocal(c,g.ac.p)),rot=M.orientation(c,-CV.angle);g.ac.v=dv.map((n,i)=>n+f[i]*67-normal[i]*4.1);g.ac.yaw=rot[0];g.ac.pitch=rot[1]+8.2*Math.PI/180;g.ac.roll=rot[2];g.world.step=dt=>{g.world.t+=dt;c.p[0]+=Math.sin(c.hdg)*c.spd*dt;c.p[2]-=Math.cos(c.hdg)*c.spd*dt;seaPose();};
 const trace=[];for(let i=0;i<3600&&!g.ac.onDeck&&g.ac.alive;i++){g.update(1/60);trace.push({t:g.t,phase:g.phase,L:M.angled(M.deckLocal(g.world.carrier,g.ac.p),CV),wire:g.wire,arrest:g._carrierLanding?.wire});}
 const detail=JSON.stringify({scenario,reason:base.reason,tail:trace.slice(-5)});assert.equal(g.ac.alive,true,detail);assert.equal(g.ac.onDeck,true,detail);assert.ok(g.wire>=1&&g.wire<=4);assert.ok(trace.some(p=>p.phase==='arresting'&&!p.wire));assert.equal(g.phase,'done');assert.ok(trace.length>180&&trace.length<2400);assert.equal(g.sounds.filter(p=>p[0]==='tire').length,1);assert.equal(g.sounds.filter(p=>p[0]==='wire').length,1);
 }
});

test('the production hull crown cannot protrude through the flight deck and lower hull geometry stays exact',()=>{
 const region=(a,b)=>{const start=html.indexOf(a),end=html.indexOf(b,start);assert.ok(start>=0&&end>start);return html.slice(start,end);},ctx={TAU:Math.PI*2,PI:Math.PI,DEG:Math.PI/180,clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),lerp:(a,b,t)=>a+(b-a)*t,vsub:(a,b)=>a.map((n,i)=>n-b[i]),vadd:(a,b)=>a.map((n,i)=>n+b[i]),vnorm:a=>{const d=Math.hypot(...a)||1;return a.map(n=>n/d);},vcross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]};
 vm.runInNewContext(region('class MB {','/* ============================ Renderer')+'\n'+region('MB.prototype.loft =','/* ------------------------- TARGET OBJECTS')+'\nconst originalLoft=MB.prototype.loft;MB.prototype.loft=function(){const result=originalLoft.apply(this,arguments);if(!this.originalHull)this.originalHull={p:this.p.slice(),n:this.n.slice(),c:this.c.slice(),i:this.i.slice()};return result;};this.model=buildCarrier();',ctx);
 const m=ctx.model,old=m.originalHull;let originalTop=-Infinity,newTop=-Infinity,trimmed=0,lower=0;for(let i=0;i<old.p.length;i+=3){const was=old.p[i+1];originalTop=Math.max(originalTop,was);newTop=Math.max(newTop,m.p[i+1]);near(m.p[i],old.p[i]);near(m.p[i+2],old.p[i+2]);if(was> -3.2){near(m.p[i+1],-3.2);trimmed++;}else{near(m.p[i+1],was);lower++;}nearPoint(m.c.slice(i,i+3),old.c.slice(i,i+3));assert.ok(m.n.slice(i,i+3).every(Number.isFinite));}
 assert.ok(originalTop>1.5,'The original rounded hull really crossed the deck plane');assert.equal(newTop,-3.2);assert.ok(trimmed>0&&lower>trimmed);assert.deepEqual(Array.from(m.i.slice(0,old.i.length)),Array.from(old.i));
});

test('all six role photographs and twenty authored motion poses bind current complete source/runtime assets',()=>{
 const folder=path.join(root,'assets/carrier/hires'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8')),proof=JSON.parse(fs.readFileSync(path.join(folder,'provenance.json'),'utf8')),sha=f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
 assert.equal(proof.sourceImages,11);assert.equal(proof.idlePoses,6);assert.equal(proof.animationPoses,20);assert.equal(proof.allDecodedRGBAIdentical,true);assert.deepEqual(Object.keys(manifest.roles).sort(),['blue','brown','green','red','white','yellow']);
 let poses=0;for(const role of Object.values(manifest.roles)){assert.deepEqual(role.idle.frameSize,[1024,1536]);for(const clip of Object.values(role.animations)){poses+=clip.frames;assert.equal(clip.sourceRegions.length,clip.frames);assert.equal(clip.registration.length,clip.frames);for(let i=0;i<clip.frames;i++){const b=clip.bounds[i],r=clip.sourceRegions[i];assert.ok(b[0]>=0&&b[1]>=0&&b[2]<=clip.frameSize[0]&&b[3]<=clip.frameSize[1]);assert.ok(r.dest[0]>=0&&r.dest[1]>=0&&r.dest[0]+r.source[2]<=clip.frameSize[0]&&r.dest[1]+r.source[3]<=clip.frameSize[1]);}}}assert.equal(poses,20);
 for(const p of proof.files){assert.equal(sha(p.sourcePNG),p.sourceSHA256);assert.equal(sha(p.runtimeWebP),p.runtimeSHA256);assert.equal(p.decodedRGBAIdentical,true);assert.equal(p.includesInvisibleRGB,true);if(p.frames)for(const f of p.frames){assert.equal(f.complete,true);assert.equal(f.foreignFigurePixels,0);assert.ok(f.opaqueInteriorFraction>.85);}}
});

test('every pose anchors its photographed torso and soles correctly after whole-image mirroring',()=>{
 const M=fixture(),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/carrier/hires/manifest.json'),'utf8'));
 for(const role of Object.values(manifest.roles)){for(const c of [role.idle,...Object.values(role.animations)])for(const reg of c.registration||[c])for(const flip of [false,true]){
  const record={name:'blue',action:'walk',frame:0,width:c.frameSize[0],height:c.frameSize[1],bodyHeight:c.bodyHeight,baseline:reg.baseline,center:reg.center},p=[10,22,-30],eye=[-7,24,13],q=M.anchor(record,p,1.72,eye,flip),dx=eye[0]-p[0],dz=eye[2]-p[2],length=Math.hypot(dx,dz),center=flip?1-reg.center:reg.center,offset=(center-.5)*q.w;
  near(q.p[1]+q.h*(1-reg.baseline),p[1]);near(q.p[0]+dz/length*offset,p[0]);near(q.p[2]-dx/length*offset,p[2]);near(q.w/q.h,record.width/record.height);assert.equal(q.cols,1);assert.equal(q.rows,1);assert.equal(q.cell,0);
 }}
});

function uploadFixture(options={}){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/carrier/hires/manifest.json'),'utf8')),dimensions=new Map(JSON.parse(fs.readFileSync(path.join(root,'assets/carrier/hires/provenance.json'),'utf8')).files.map(p=>[path.basename(p.runtimeWebP),[p.width,p.height]]));let stamp=0,fail=options.fail||'',allocations=0,deletions=0,requests=[];
 const window={performance:{now:()=>stamp},fetch:async()=>({ok:true,json:async()=>structuredClone(manifest)}),document:{createElement:()=>({width:0,height:0,getContext:()=>({imageSmoothingQuality:'high',drawImage(){}})})}};
 window.Image=class{set src(url){const file=url.split('/').at(-1),size=dimensions.get(file);requests.push(file);this.naturalWidth=size?.[0]||1;this.naturalHeight=size?.[1]||1;queueMicrotask(()=>file===fail?this.onerror():this.onload());}};
 vm.runInNewContext(source,{window});const gl={TEXTURE_2D:1,TEXTURE_MIN_FILTER:2,LINEAR_MIPMAP_LINEAR:3,bindTexture(){},generateMipmap(){},texParameteri(){},isContextLost:()=>false,deleteTexture(){deletions++;}},r={gl,textures:{},eye:[0,21,0],texFromCanvas(name,cv){allocations++;return this.textures[name]={tex:{name},w:cv.width,h:cv.height};}};
 return {M:window.CarrierLaunch,r,requests,allocations:()=>allocations,deletions:()=>deletions,advance:n=>{stamp+=n;},recover:()=>{fail='';}};
}

test('isolated uploads retain complete idle fallbacks and evict optional poses within desktop/touch budgets',async()=>{
 for(const touch of [false,true]){const f=uploadFixture();const loaded=await f.M.load(f.r,{touch});assert.equal(loaded.status,'ready');assert.equal(loaded.required,6);assert.ok(loaded.bytes<=loaded.budget);for(const [role,action,count]of [['yellow','signal',8],['green','inspect',4],['blue','walk',8]])for(let i=0;i<count;i++){await f.M.prepareFrame(f.r,role,action,i);const s=f.M.inspect(f.r);assert.ok(s.bytes<=s.budget);assert.ok(s.cpuBytes<=s.cpuBudget);assert.equal(s.frames.filter(r=>r.required&&r.resident).length,6);}assert.ok(f.deletions()>0,'The fixture reaches actual optional-cache pressure');const s=f.M.inspect(f.r);s.frames[0].bounds[0]=9999;assert.notEqual(f.M.inspect(f.r).frames[0].bounds[0],9999);assert.equal(f.M.dispose(f.r),true);assert.equal(f.M.inspect(f.r).status,'idle');}
});

test('optional photograph failures back off and recover while a missing required role remains an explicit error',async()=>{
 const f=uploadFixture({fail:'blue-walk-a.webp'});await f.M.load(f.r);for(let i=0;i<20;i++)await f.M.prepareFrame(f.r,'blue','walk',0);assert.equal(f.requests.filter(v=>v==='blue-walk-a.webp').length,1);assert.equal(f.M.inspect(f.r).status,'ready');assert.equal(f.M.inspect(f.r).frames.filter(r=>r.required&&r.resident).length,6);f.recover();f.advance(1100);await f.M.prepareFrame(f.r,'blue','walk',0);assert.ok(f.M.inspect(f.r).frames.some(r=>r.key==='blue:walk:0'&&r.resident));
 const missing=uploadFixture({fail:'red-idle.webp'}),report=await missing.M.load(missing.r);assert.equal(report.status,'error');assert.equal(report.ready,false);assert.ok(report.failures.some(r=>r.key==='red'));assert.equal(report.required,5);
});
