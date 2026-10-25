'use strict';
// Controller/lifecycle tests with an explicit simulation adapter. Actual game
// mission completion is verified separately with the original browser engine.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(process.env.MISSION_DEMO_SOURCE||path.join(__dirname,'../assets/flight/mission-demo.js'),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(options={}){
 const window={},writes=[],values=new Map([['prog',{done:{m1:1},grade:{m1:'A'}}],['pow_checkpoint',{version:2,stage:'river'}]]),calls=[];
 const Store={get(key,fallback){return clone(values.has(key)?values.get(key):fallback);},set(key,value){writes.push([key,clone(value)]);values.set(key,clone(value));}};
 class Game{
  constructor(app,mis){this.app=app;this.mis=mis;this.t=0;this.phase='deck';this.paused=false;this.result=null;this.rightSeat=false;this.departed=false;this.shipRange=100;this.ac={p:[0,21,0],v:[0,0,-10],yaw:0,ias:50,gear:true,hook:true,onDeck:true,bombs:12,arms:0,alive:true,crew:{pilot:1,bn:1},dmg:{diane:0}};this.world={carrier:{p:[0,19,0],hdg:0},route:[],rtIdx:0,targets:[{p:[500,5,-12000],alive:true,hp:55}],score:{hits:0,misses:0,dropped:0},bombs:[],ipoint:[500,5,-12000],briefed:[500,5,-12000],sysPos:p=>p.slice()};this.hud=app.hud;this.st={p:this.ac.p.slice(),yaw:0};}
  autoFly(){calls.push('original-pilot');return {cat:true,thr:1};}
  update(dt){this.t+=dt;calls.push(['simulation',dt,this.autoFly(dt,this.ac,this.world),this.app.gctl.commit]);}
  debrief(){this.app.prog.done[this.mis.id]=1;Store.set('prog',this.app.prog);this.result={pass:true};}
  objState(){return [['Attack','pending',false],['Return','pending',false]];}
 }
 if(options.pilot)Game.prototype.autoFly=options.pilot;
 const missions=Array.from({length:12},(_,i)=>({id:i===11?'willard':'m'+(i+1),num:String(i+1),title:'Mission '+(i+1),type:i===0?'carrier_only':'strike',obj:[['Attack','targets'],['Return','trap']]}));
 const App={set:{seat:0,assist:1,mouse:1},prog:{done:{m1:1},grade:{m1:'A'}},keys:{},gctl:{},screen:'ready',game:null,hud:{scope:false,slewTo(){calls.push('slew');return true;}},frame(){calls.push('frame');},renderReady(){calls.push('ready');},show(id){this.screen=id;},start(m){this._missionStart=(this._missionStart||0)+1;this.show('game');this.game=new Game(this,m);},lockTarget(){calls.push('lock');},toggleGear(){this.game.ac.gear=!this.game.ac.gear;this.game.ac.hook=this.game.ac.gear;}};
 vm.runInNewContext(source,{window,console});const M=window.MissionDemo;
 assert.equal(M.install({App,Game,Store,missions,terrainH:options.terrain||(()=>5),CV:{angle:.15,aim:40,wire:[20,30]},localToWorld:(p,h,x,y,z)=>[p[0]+x,p[1]+y,p[2]+z],worldToLocal:(p,h,q)=>q.map((n,i)=>n-p[i])}),true);
 function start(id='m2'){assert.equal(M.start(id),true);App.frame(0);return App.game;}
 return {M,App,Game,Store,missions,calls,writes,values,start,window};
}
test('all twelve registered missions can start a computer practice without changing mission definitions',()=>{
 const f=fixture(),before=JSON.stringify(f.missions);for(const m of f.missions){f.start(m.id);assert.equal(f.M.snapshot().missionId,m.id);assert.equal(f.M.snapshot().computerPlaying,true);f.M.stop(false);}assert.equal(JSON.stringify(f.missions),before);
 assert.equal(f.M.start('not-a-mission'),false);
});
test('persistent progress, logs and chapter checkpoints are isolated and restored on stop',()=>{
 const f=fixture(),progress=f.App.prog,settings=clone(f.App.set),prior=clone(Object.fromEntries(f.values));f.start();
 f.Store.set('prog',{done:{m2:1}});f.Store.set('log',[{pass:true}]);f.Store.set('pow_checkpoint',{version:2,stage:'cell'});f.Store.set('willard_checkpoint_v1',{test:true});f.App.prog.done.m2=1;
 assert.equal(f.writes.length,0);assert.equal(f.Store.get('pow_checkpoint').stage,'cell');assert.equal(f.M.snapshot().campaignIsolated,true);f.M.stop(false);
 assert.equal(f.App.prog,progress);assert.deepEqual(f.App.set,settings);assert.deepEqual(clone(Object.fromEntries(f.values)),prior);assert.equal(f.Store.get('pow_checkpoint').stage,'river');
});
test('isolated reads cannot mutate ephemeral saved values',()=>{
 const f=fixture();f.start();f.Store.set('x',{a:[1]});const a=f.Store.get('x');a.a[0]=999;assert.equal(f.Store.get('x').a[0],1);f.M.stop(false);
});
test('a second demonstration restores the first session before installing fresh isolation',()=>{
 const f=fixture(),settings=clone(f.App.set),progress=f.App.prog;f.start('m2');f.Store.set('log',[{old:true}]);f.start('m3');assert.deepEqual(f.Store.get('log',[]),[]);f.M.stop(false);assert.equal(f.App.prog,progress);assert.deepEqual(f.App.set,settings);
});
test('clearing the game pointer before Ready Room still restores persistence and removes the demonstration',()=>{
 const f=fixture(),progress=f.App.prog;f.start();f.App.game=null;f.App.show('ready');assert.equal(f.M.snapshot().active,false);assert.equal(f.App.prog,progress);f.Store.set('normal-progress',{saved:true});assert.equal(f.writes.length,1);
});
test('a replaced normal game discards the stale demonstration before running its frame',()=>{
 const f=fixture(),old=f.start();f.App.game=new f.Game(f.App,f.missions[0]);f.App.frame(0);assert.equal(f.M.snapshot().active,false);assert.equal(old.paused,true);f.Store.set('normal-progress',{saved:true});assert.equal(f.writes.length,1);
});
test('a deferred debrief cannot award progress after its demonstration was stopped',()=>{
 const f=fixture(),g=f.start(),before=clone(f.App.prog);f.M.stop(false);g.debrief();assert.deepEqual(f.App.prog,before);assert.equal(f.writes.length,0);assert.equal(g.result,null);
});
test('launch commands use the existing pilot and do not edit aircraft positions or target health',()=>{
 const f=fixture(),g=f.start(),before=clone({ac:g.ac,targets:g.world.targets});g.update(.05);assert(f.calls.includes('original-pilot'));assert.deepEqual(clone({ac:g.ac,targets:g.world.targets}),before);assert.equal(f.M.snapshot(g).stage,'launch');f.M.stop(false);
});
test('a caught wire retains control of arrestment and the director waits for the original result',()=>{
 const f=fixture(),g=f.start();g.phase='arresting';g.ac.onDeck=false;g.app.gctl.commit=1;const p=g.ac.p.slice();g.update(.02);assert.equal(f.M.snapshot(g).stage,'landing');assert.equal(f.M.snapshot(g).success,false);assert.equal(g.app.gctl.commit,0);assert.equal(f.calls.includes('original-pilot'),false);assert.deepEqual(g.ac.p,p);f.M.stop(false);
});
test('return transit stays clean at cruise speed, slows on the stern setup and rebuilds the approach after a real bolter',()=>{
 const f=fixture(),g=f.start();g.ac.onDeck=false;g.ac.p=[0,800,-25000];g.ac.ias=160;g.objState=()=>[['Attack','complete',true],['Return','pending',false]];g.update(.02);
 const command=()=>f.calls.filter(v=>Array.isArray(v)&&v[0]==='simulation').at(-1)[2];assert.equal(command().ias,300);assert.equal(g.ac.gear,false);
 const z=12540;g.ac.p=[z*Math.sin(.15),800,z*Math.cos(.15)];g.ac.ias=65;for(let i=0;i<65;i++)g.update(.02);assert.equal(command().ias,140);assert.equal(g.ac.gear,true);
 g.bolters=1;g.ac.p=[0,100,-1000];for(let i=0;i<65;i++)g.update(.02);assert.equal(command().ias,300);assert.equal(g.ac.gear,false);assert.equal(f.M.snapshot(g).success,false);f.M.stop(false);
});
test('a low SAM egress never overrides the established carrier approach altitude',()=>{
 const f=fixture(),g=f.start('m6');g.ac.onDeck=false;g.ac.gear=false;g.ac.p=[0,200,-1000];g.world.sites=[{alive:true,p:[0,5,2000]}];g.objState=()=>[['Attack','complete',true],['Return','pending',false]];g.update(.02);
 const command=()=>f.calls.filter(v=>Array.isArray(v)&&v[0]==='simulation').at(-1)[2];assert.equal(command().alt,150);
 const z=12540;g.ac.p=[z*Math.sin(.15),800,z*Math.cos(.15)];g.update(.02);assert.ok(command().alt>500,'stern approach uses the carrier profile rather than low terrain-following egress');f.M.stop(false);
});
test('ARM consent waits for a real terrain-clear shot and observes its flight before spending the second missile',()=>{
 const f=fixture({terrain:(x,z)=>z< -5000&&z> -9000?450:5}),g=f.start('m8');g.mis.type='ironhand';g.ac.onDeck=false;g.ac.gear=false;g.ac.p=[0,120,0];g.ac.arms=2;g.world.radar={p:[0,50,-12000],alive:true,emitting:true};g.world.targets=[g.world.radar];g.world.arms=[];
 const height=f.M.emitterAltitude(g,g.world.radar.p);assert.ok(height>1000);g.update(.02);assert.equal(g.app.gctl.commit,0);assert.equal(g.ac.arms,2);assert.equal(g.world.radar.alive,true);
 g.ac.p=[0,0,15000];g.ac.p[1]=Math.max(1800,f.M.emitterAltitude(g,g.world.radar.p)+150);g.update(.02);g.ac.p[2]=11000;g.ac.p[1]=Math.max(g.ac.p[1],f.M.emitterAltitude(g,g.world.radar.p)+150);const prior=f.calls.length;g.update(.02);assert.ok(f.calls.slice(prior).some(c=>c[0]==='simulation'&&c[3]===1));g.world.arms=[{p:[0,height,-1000]}];for(let i=0;i<30;i++)g.update(.25);assert.equal(g.app.gctl.commit,0);assert.ok(f.calls.filter(c=>c[0]==='simulation').at(-1)[2].alt<height,'crew descends after actual launch instead of waiting high');g.world.arms=[];g.world.radar.emitting=false;g.update(.02);assert.equal(g.app.gctl.commit,0);assert.equal(f.M.snapshot(g).success,false);f.M.stop(false);
});
test('a missed release gate conserves stores instead of consenting to a late overshoot',()=>{
 const f=fixture(),g=f.start('m8');g.mis.type='ironhand';g.ac.onDeck=false;g.ac.gear=false;g.world.designated=g.world.targets[0];g.sol={tRel:-.8,valid:true,az:.01};const bombs=g.ac.bombs,health=g.world.targets[0].hp;g.update(.02);assert.equal(g.app.gctl.commit,0);assert.equal(g.ac.bombs,bombs);assert.equal(g.world.targets[0].hp,health);g.sol.tRel=8;g.update(.02);assert.equal(g.app.gctl.commit,1);f.M.stop(false);
});
test('after radar suppression the crew earns a stable climb before conventional attacks without changing guns or health',()=>{
 const f=fixture(),g=f.start('m8');g.mis.type='ironhand';g.ac.onDeck=false;g.ac.gear=false;g.ac.p=[0,700,0];g.ac.radalt=700;g.world.radar={p:[0,5,-12000],alive:false};const before=clone(g.world.targets);g.update(.02);assert.equal(g.apAGL,1700);assert.equal(f.M.snapshot(g).stage,'departure');assert.ok(f.calls.filter(c=>c[0]==='simulation').at(-1)[2].alt>1600);assert.deepEqual(g.world.targets,before);g.ac.radalt=1750;g.ac.p[1]=1755;g.update(.02);assert.equal(f.M.snapshot(g).stage,'acquire');f.M.stop(false);
});
test('a failed designation system interrupts practice honestly instead of orbiting for an unobtainable lock',()=>{
 const f=fixture(),g=f.start();g.ac.onDeck=false;g.ac.gear=false;g.ac.dmg.diane=.9;g.update(.02);assert.equal(f.M.snapshot(g).stage,'failed');assert.equal(f.M.snapshot(g).success,false);assert.equal(f.M.snapshot(g).paused,true);assert.equal(f.M.snapshot(g).computerPlaying,false);assert.equal(g.result,null);assert.equal(g.rightSeat,false);assert.equal(f.writes.length,0);f.M.stop(false);
});
test('ship coupling is withheld far astern and until the actual groove has safe height, speed and lineup',()=>{
 const f=fixture(),g=f.start();g.ac.onDeck=false;g.ac.gear=false;g.ac.ias=70;g.ac.yaw=-.15;g.departed=true;g.objState=()=>[['Attack','complete',true],['Return','pending',false]];
 const place=(z,offset=15)=>{const slope=1.55+(z-32)*Math.tan(3.5*Math.PI/180);g.ac.p=[z*Math.sin(.15),19+slope+offset,z*Math.cos(.15)];};
 place(4500);g.update(.02);assert.equal(f.calls.includes('original-pilot'),false);place(1500,-40);g.update(.02);assert.equal(f.calls.includes('original-pilot'),false);place(1500,15);g.update(.02);assert.equal(f.calls.includes('original-pilot'),true);assert.equal(f.M.snapshot(g).success,false);f.M.stop(false);
});
test('return energy is shed with the real speedbrake control without editing aircraft speed',()=>{
 const f=fixture(),g=f.start();g.ac.onDeck=false;g.ac.gear=false;g.ac.ias=170;g.ac.v=[0,0,-170];g.objState=()=>[['Attack','complete',true],['Return','pending',false]];const z=12540;g.ac.p=[z*Math.sin(.15),750,z*Math.cos(.15)];const speed=g.ac.ias,velocity=g.ac.v.slice();g.update(.02);assert.equal(g.brakeHold,true);assert.equal(g.ac.ias,speed);assert.deepEqual(g.ac.v,velocity);g.ac.ias=75;g.update(.02);assert.equal(g.brakeHold,false);f.M.stop(false);
});
test('normal simulation receives bounded substeps and optional 4x speed retains the complete elapsed time',()=>{
 const f=fixture();f.M.start('m2',{speed:4});f.App.frame(0);const g=f.App.game;g.update(.1);const steps=f.calls.filter(x=>Array.isArray(x)&&x[0]==='simulation');assert.equal(steps.length,24);assert.ok(steps.every(x=>x[1]<=1/60));assert.ok(Math.abs(g.t-.4)<1e-8);f.M.stop(false);
});
test('pause freezes both simulation and director time, then resume uses ordinary update again',()=>{
 const f=fixture(),g=f.start();g.update(.1);const before=f.M.snapshot(g).elapsed,time=g.t;f.M.setPaused(true);g.update(2);assert.equal(g.t,time);assert.equal(f.M.snapshot(g).elapsed,before);f.M.setPaused(false);g.update(.1);assert(g.t>time);f.M.stop(false);
});
test('taking control releases injected inputs and stops the AI from replacing player commands',()=>{
 const f=fixture(),g=f.start();g.app.keys.KeyW=1;g.app.gctl.commit=1;f.M.takeControl();assert.equal(g.app.keys.KeyW,0);assert.equal(g.app.gctl.commit,0);g.app.gctl.pitch=.7;g.update(.05);assert.equal(g.app.gctl.pitch,.7);assert.equal(f.M.snapshot(g).computerPlaying,false);assert.equal(g.rightSeat,false);f.M.resume();assert.equal(f.M.snapshot(g).computerPlaying,true);f.M.stop(false);
});
test('only original positive outcomes count as successful completion',()=>{
 const f=fixture(),g=f.start();assert.equal(f.M.completed(g),null);g.result={pass:false};g.update(.01);assert.equal(f.M.snapshot(g).success,false);assert.equal(f.M.snapshot(g).stage,'failed');
 const h=f.start();h.result={pass:true,recovered:true};h.update(.01);assert.equal(f.M.snapshot(h).success,true);assert.equal(f.M.snapshot(h).stage,'completed');assert.equal(f.App.prog.done.m2,undefined);f.M.stop(false);
});
test('a historical captivity ending is represented separately from an earned counterfactual escape',()=>{
 const f=fixture(),g=f.start('m11');g.pow={complete:true,outcome:{historical:true}};assert.equal(f.M.completed(g),'historical');g.pow.outcome={escaped:true};assert.equal(f.M.completed(g),'completed');f.M.stop(false);
});
test('recce control never consents to release, and navigation uses the actual public slew and lock actions',()=>{
 const f=fixture(),g=f.start();g.ac.onDeck=false;g.ac.gear=false;g.mis.type='recce';g.world.targets[0].ident=false;g.update(.02);assert.equal(g.app.gctl.commit,0);assert.equal(f.M.snapshot(g).stage,'identify');
 g.mis.type='strike';g.world.route=[{p:[0,5,-3000],label:'Checkpoint'}];g.update(.02);assert(f.calls.includes('slew'));assert(f.calls.includes('lock'));assert.equal(g.world.targets[0].hp,55);f.M.stop(false);
});
test('controller headings and terrain clearance are finite and query only a bounded lookahead',()=>{
 const f=fixture(),g=f.start();const q=f.M.targetCommand(g,[100,0,-100],600,300);assert.ok(Math.abs(q.hdg-Math.PI/4)<1e-8);assert.equal(q.alt,600);assert.equal(q.ias,300);assert.equal(f.M.targetCommand(g,[NaN,0,0],100),null);assert.equal(f.M.highest(g,[100,0,-100],500),505);f.M.stop(false);
});
test('stale games and invalid time cannot consume a newer demonstration session',()=>{
 const f=fixture(),old=f.start('m2'),fresh=f.start('m3'),before=f.M.snapshot(fresh).elapsed;old.result={pass:true};old.update(.1);assert.equal(f.M.snapshot(fresh).elapsed,before);fresh.update(NaN);assert.equal(f.M.snapshot(fresh).elapsed,before);f.M.stop(false);
});
test('uninstall restores original update, pilot and app hooks and releases all persistent isolation',()=>{
 const f=fixture();f.start();assert.equal(f.M.uninstall(),true);assert.equal(f.M.uninstall(),false);f.Store.set('new',{test:true});assert.equal(f.writes.length,1);assert.equal(f.App.prog.done.m2,undefined);
});
test('computer physically completes the POW escape and fictional river rescue using real collision, patrols, finite distraction and held interactions',()=>{
 const document={body:{classList:{toggle(){}}},getElementById(){return null;},pointerLockElement:null,activeElement:null},window={document},sandbox={window,document,console,Date};vm.createContext(sandbox);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow/core.js'),'utf8'),sandbox);
 const P=window.POW,values=new Map(),Store={get:(k,d)=>values.has(k)?clone(values.get(k)):d,set:(k,v)=>values.set(k,clone(v))};P.mountUI=()=>{};P.updateUI=()=>{};P.activate=()=>{};P.ui={end:{querySelector(){return {textContent:''};}}};P.ctx={terrainH:()=>4,Store};
 for(const file of ['ai.js','episode-stealth.js','river.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow',file),'utf8'),sandbox);
 class Game{constructor(app,mis){this.app=app;this.mis=mis;this.ac={p:[0,5,0]};this.world={_cells:new Map()};this.hud={};this.t=0;P.begin(this,'cell');}update(dt){this.t+=dt;P.tick(this,dt);}autoFly(){return {};}objState(){return [];}setHour(){}}
 const mission={id:'m11',escape:true},App={set:{seat:0,assist:0,mouse:0,sound:0},prog:{done:{},grade:{}},keys:{},gctl:{},screen:'ready',frame(){},renderReady(){},show(id){this.screen=id;},start(m){this._missionStart=(this._missionStart||0)+1;this.screen='game';this.game=new Game(this,m);}};
 vm.runInContext(source,sandbox);const M=window.MissionDemo;M.install({App,Game,Store,missions:[mission],terrainH:()=>4,POW:P});M.start('m11');App.frame(0);const g=App.game;
 for(let i=0;i<40000&&!g.pow.complete;i++)g.update(.05);
 assert.equal(g.pow.complete,true,'original rescue must finish: '+JSON.stringify({stage:g.pow.stage,p:g.evade.p,river:g.pow.river&&{phase:g.pow.river.phase,mode:g.pow.river.mode,distance:g.pow.river.logicalDistance,signal:g.pow.river.signaling,progress:g.pow.river.signalProgress,gap:Math.hypot(g.evade.p[0]-g.pow.river.recoveryPoint?.[0],g.evade.p[2]-g.pow.river.recoveryPoint?.[2])}}));assert.equal(g.pow.outcome.escaped,true);assert.equal(g.pow.flags.outside,true);assert.equal(g.pow.flags.roofCrossed,true);assert.equal(g.pow.inventory.bracket,true);assert.equal(g.pow.inventory.rope,true);assert.equal(values.size,0,'all real chapter saves remain in practice isolation');assert.equal(M.snapshot(g).success,true);M.stop(false);
});
test('emergency ejection requires completed objectives and real damage or repeated failed recoveries, without changing health or outcomes',()=>{
 const f=fixture({terrain:()=>-60}),g=f.start('m6');g.ac.onDeck=false;g.ac.gear=false;g.ac.p=[4000,500,0];g.ac.dmg.hyd=.9;let ejections=0;g.eject=()=>ejections++;const p=g.ac.p.slice(),health=g.ac.crew.pilot;g.update(.02);assert.equal(ejections,0,'an incomplete strike still needs its real objectives');
 g.objState=()=>[['Attack','complete',true],['Return','pending',false]];for(let i=0;i<55;i++)g.update(.02);assert.equal(ejections,1);assert.equal(f.M.snapshot(g).stage,'emergency');assert.deepEqual(g.ac.p,p);assert.equal(g.ac.crew.pilot,health);assert.equal(g.result,null);assert.equal(g.rescuedOK,undefined);f.M.stop(false);
});
test('damaged emergency crew uses normal flight to open water rather than moving the aircraft',()=>{
 const f=fixture({terrain:(x)=>x>3000?-60:50}),g=f.start();g.ac.onDeck=false;g.ac.gear=false;g.ac.dmg.hyd=1;g.ac.p=[0,500,0];g.objState=()=>[['Attack','complete',true],['Return','pending',false]];let ejected=0;g.eject=()=>ejected++;const p=g.ac.p.slice();g.update(.02);const command=f.calls.filter(c=>c[0]==='simulation').at(-1)[2];assert.ok(Math.sin(command.hdg)>.4,'fly offshore toward a sampled water area');assert.ok(command.alt>=250);assert.equal(ejected,0);assert.deepEqual(g.ac.p,p);f.M.stop(false);
});

test('an actual incoming SAM triggers original offshore ejection only after combat goals are complete',()=>{
 const f=fixture({terrain:()=>-60}),g=f.start('m6');g.ac.onDeck=false;g.ac.gear=false;g.phase='airborne';g.ac.p=[8000,500,0];g.world.sams=[{p:[3000,150,0],v:[700,0,0],armed:1}];let ejections=0;g.eject=()=>{ejections++;g.ejected=true;g.chute={};g.phase='chute';};const before=clone({p:g.ac.p,crew:g.ac.crew,damage:g.ac.dmg,targets:g.world.targets,bombs:g.ac.bombs,sams:g.world.sams});
 g.update(.02);assert.equal(ejections,0,'the threat cannot grant an unfinished combat objective');g.objState=()=>[['Attack','complete',true],['Return','pending',false]];g.update(.02);assert.equal(ejections,1);assert.ok(f.M.snapshot(g).events.some(e=>e.stage==='emergency'&&/incoming SAM/.test(e.detail)));assert.deepEqual(clone({p:g.ac.p,crew:g.ac.crew,damage:g.ac.dmg,targets:g.world.targets,bombs:g.ac.bombs,sams:g.world.sams}),before);assert.equal(g.result,null);assert.equal(g.rescuedOK,undefined);f.M.stop(false);
});

test('a post-combat missile beyond the actual threat gate does not force ejection',()=>{
 const f=fixture({terrain:()=>-60}),g=f.start('m6');g.ac.onDeck=false;g.ac.gear=false;g.ac.p=[8000,500,0];g.world.sams=[{p:[-5000,100,0]}];g.objState=()=>[['Attack','complete',true],['Return','pending',false]];let ejections=0;g.eject=()=>ejections++;g.update(.02);assert.equal(ejections,0);assert.equal(f.M.snapshot(g).stage,'home');assert.equal(g.result,null);f.M.stop(false);
});
test('ordinary SAR transmits, signals only after the real ETA gate, and swims toward the physical cable without awarding rescue',()=>{
 const f=fixture({terrain:()=>-60}),g=f.start();g.ac.onDeck=false;g.evade={p:[0,-.4,0],hdg:0,radio:0,rescue:0,eta:120};const p=g.evade.p.slice();g.update(.02);assert.equal(g.app.keys.KeyR,1);assert.equal(g.app.keys.KeyG,0);assert.equal(g.evade.radio,0);g.evade.radio=1;g.evade.rescue=60;g.update(.02);assert.equal(g.app.keys.KeyG,0);g.evade.rescue=70;g.update(.02);assert.equal(g.app.keys.KeyG,1);g.evade.smoke=[0,0,0];g.evade.jolly={p:[0,22,-10],down:true,hoist:.8};g.update(.02);assert.equal(g.app.gctl.pitch,1);assert.deepEqual(g.evade.p,p);assert.equal(g.rescuedOK,undefined);assert.equal(g.result,null);f.M.takeControl();assert.equal(g.app.keys.KeyR,0);assert.equal(g.app.keys.KeyG,0);f.M.stop(false);
});
test('an off-scope offset point receives a real navigation command while LOCK is retried',()=>{
 const f=fixture(),g=f.start('m8');g.ac.onDeck=false;g.ac.gear=false;g.mis.type='ironhand';g.world.oapLocked=true;g.world.oap={p:[10000,5,-15000]};g.update(.02);const command=f.calls.filter(c=>c[0]==='simulation').at(-1)[2];assert.equal(command.ias,300);assert.ok(command.alt>1600);assert.ok(f.calls.includes('lock'));assert.equal(g.world.targets[0].hp,55);f.M.stop(false);
});
test('ARM release requires a forward radar aspect and Coker climbs clear of ordinary light guns before the original scripted missile',()=>{
 const f=fixture(),g=f.start('m8');g.mis.type='ironhand';g.ac.onDeck=false;g.ac.gear=false;g.ac.arms=2;g.ac.p=[0,2200,15000];g.ac.yaw=Math.PI;g.world.radar={p:[0,5,-12000],alive:true,emitting:true};g.world.arms=[];g.update(.02);assert.equal(g.app.gctl.commit,0);g.ac.yaw=0;g.ac.p[2]=11000;const prior=f.calls.length;g.update(.02);assert.ok(f.calls.slice(prior).some(c=>c[0]==='simulation'&&c[3]===1));f.M.stop(false);
 const h=f.start('m11');h.mis.escape=true;h.ac.onDeck=false;h.ac.gear=false;h.update(.02);assert.ok(f.calls.filter(c=>c[0]==='simulation').at(-1)[2].alt>=1700);assert.equal(h._samDone,undefined);assert.equal(h.ac.alive,true);f.M.stop(false);
});

test('Iron Hand departs below SAM acquisition altitude before climbing at an offshore standoff',()=>{
 const f=fixture({terrain:()=>-60}),g=f.start('m8');g.mis.type='ironhand';g.ac.onDeck=false;g.ac.gear=false;g.ac.arms=2;g.ac.p=[8000,100,0];g.world.radar={p:[-12000,5,0],alive:true,hp:40,emitting:true};g.world.arms=[];const before=clone({p:g.ac.p,radar:g.world.radar,arms:g.ac.arms});g.update(.02);const command=f.calls.filter(c=>c[0]==='simulation').at(-1)[2];assert.ok(Math.sin(command.hdg)>.99,'normal pilot first flies offshore');assert.equal(command.alt,145,'remain below the original250m SAM acquisition gate over clear water');assert.equal(g.app.gctl.commit,0);assert.deepEqual(clone({p:g.ac.p,radar:g.world.radar,arms:g.ac.arms}),before);assert.match(f.M.lesson(g,'arm').watch,/145 m/);assert.equal(g.result,null);f.M.stop(false);
});

test('Iron Hand climbs only after actual radar range clears26.5km and then turns in with the original ARM gate',()=>{
 const f=fixture({terrain:()=>-60}),g=f.start('m8');g.mis.type='ironhand';g.ac.onDeck=false;g.ac.gear=false;g.ac.arms=2;g.ac.p=[14000,100,0];g.ac.v=[0,0,0];g.world.radar={p:[-12000,5,0],alive:true,hp:40,emitting:true};g.world.arms=[];
 g.update(.02);assert.equal(f.calls.filter(c=>c[0]==='simulation').at(-1)[2].alt,145,'26km is still inside the low-departure phase');
 g.ac.p=[15000,100,0];const position=g.ac.p.slice();g.update(.02);const climb=f.calls.filter(c=>c[0]==='simulation').at(-1)[2];assert.ok(climb.alt>=1800);assert.ok(Math.sin(climb.hdg)>.99);assert.match(f.M.lesson(g,'arm').watch,/climb.*ARM altitude/);assert.deepEqual(g.ac.p,position);assert.equal(g.ac.arms,2);assert.equal(g.world.radar.hp,40);
 g.ac.p=[15000,1800,0];g.update(.02);const inbound=f.calls.filter(c=>c[0]==='simulation').at(-1)[2];assert.ok(Math.sin(inbound.hdg)<-.99,'only the physically high and distant aircraft turns toward the emitter');assert.equal(g.app.gctl.commit,0,'still outside original23km firing gate');assert.equal(g.result,null);f.M.stop(false);
});

test('Iron Hand settles actual speed with the original brake before turning in from offshore',()=>{
 const f=fixture({terrain:()=>-60}),g=f.start('m8');g.mis.type='ironhand';g.ac.onDeck=false;g.ac.gear=false;g.ac.arms=2;g.ac.p=[0,1800,15000];g.ac.v=[0,0,-269];g.ac.ias=240;g.world.radar={p:[0,5,-12000],alive:true,hp:40,emitting:true};g.world.arms=[];const p=g.ac.p.slice();g.update(.02);let command=f.calls.filter(c=>c[0]==='simulation').at(-1)[2];assert.equal(g.brakeHold,true);assert.equal(command.ias,220);assert.ok(command.hdg>3,'high actual speed keeps the aircraft flying offshore');assert.equal(g.app.gctl.commit,0);assert.deepEqual(g.ac.p,p);
 g.ac.v=[0,0,-165];g.ac.ias=140;g.update(.02);command=f.calls.filter(c=>c[0]==='simulation').at(-1)[2];assert.equal(command.hdg,0);assert.equal(command.ias,220);assert.equal(g.ac.arms,2);assert.equal(g.world.radar.hp,40);assert.equal(g.result,null);f.M.stop(false);
});

test('a dark emitter makes a physical standoff reset instead of a late shot inside the SAM launch envelope',()=>{
 const f=fixture({terrain:()=>-60}),g=f.start('m8');g.mis.type='ironhand';g.ac.onDeck=false;g.ac.gear=false;g.ac.arms=2;g.ac.p=[0,1800,15000];g.ac.v=[0,0,-165];g.ac.ias=140;g.ac.yaw=0;g.world.radar={p:[0,5,-12000],alive:true,hp:40,emitting:false};g.world.arms=[];g.update(.02);g.ac.p=[0,1800,12400];const before=clone({p:g.ac.p,radar:g.world.radar,arms:g.ac.arms});g.update(.02);let command=f.calls.filter(c=>c[0]==='simulation').at(-1)[2];assert.ok(command.hdg>3);assert.equal(g.app.gctl.commit,0);assert.match(f.M.snapshot(g).detail,/offshore/);g.world.radar.emitting=true;g.ac.p=[0,1800,10000];g.update(.02);assert.equal(g.app.gctl.commit,0,'a newly lit radar cannot draw the crew into a late22km shot while resetting');assert.equal(g.ac.arms,2);assert.equal(g.world.radar.hp,40);
 g.ac.p=[0,1800,18000];g.update(.02);g.ac.p=[0,1800,12900];const prior=f.calls.length;g.update(.02);assert.ok(f.calls.slice(prior).some(c=>c[0]==='simulation'&&c[3]===1),'a fresh settled24.9km approach may fire while the radar emits');assert.equal(g.ac.arms,before.arms);assert.equal(g.world.radar.hp,before.radar.hp);g.world.arms=[{p:[0,1750,12800]}];g.update(.02);command=f.calls.filter(c=>c[0]==='simulation').at(-1)[2];assert.ok(command.hdg>3,'after launch the normal command immediately turns away from the radar');assert.equal(command.ias,220);assert.equal(command.alt,90);assert.equal(g.app.gctl.commit,0);assert.equal(g.result,null);f.M.stop(false);
});

test('one locked maritime point uses SINGLE without area-ripple scatter or pre-awarded target damage',()=>{
 const f=fixture(),g=f.start('m4');g.mis.type='maritime';g.ac.onDeck=false;g.ac.gear=false;g.ripple=2;g.world.targets=Array.from({length:3},(_,i)=>({kind:'boat',p:[500+i*1500,0,-12000],spd:16,yaw:1,alive:true,hp:60}));g.world.designated=g.world.targets[0];g.world.lock=true;g.sol={valid:true,tRel:4,az:0};const before=clone({targets:g.world.targets,bombs:g.ac.bombs,p:g.ac.p});
 g.update(.02);assert.equal(g.ripple,1);assert.equal(g.app.gctl.commit,1);assert.deepEqual(clone({targets:g.world.targets,bombs:g.ac.bombs,p:g.ac.p}),before);assert.match(f.M.lesson(g,'attack').control,/R.*SINGLE.*SPACE/);assert.match(f.M.lesson(g,'attack').watch,/one point shot/);assert.equal(g.result,null);f.M.stop(false);
});

test('mountain interdiction retains its first area ripple and refines only after actual impacts',()=>{
 const f=fixture(),g=f.start('m7');g.ac.onDeck=false;g.ac.gear=false;g.world.targets=Array.from({length:6},(_,i)=>({p:[500+i*150,5,-12000],alive:true,hp:55}));g.world.designated=g.world.targets[0];g.sol={valid:true,tRel:4,az:0};const before=clone({targets:g.world.targets,bombs:g.ac.bombs,p:g.ac.p});
 g.update(.02);assert.equal(g.ripple,2);assert.match(f.M.lesson(g,'attack').watch,/initial area ripple/);assert.deepEqual(clone({targets:g.world.targets,bombs:g.ac.bombs,p:g.ac.p}),before);
 g.world.score.dropped=2;g.world.bombs=[{p:[0,300,0]}];g.update(.02);assert.equal(g.ripple,2,'release alone cannot switch tactics');assert.equal(f.M.snapshot(g).stage,'assess');g.world.bombs=[];for(let i=0;i<13;i++)g.update(.25);assert.equal(g.ripple,2,'elapsed flight time without recorded impacts cannot switch tactics');
 g.world.score.hits=1;g.world.score.misses=1;for(let i=0;i<5;i++)g.update(.25);assert.equal(g.ripple,1);assert.match(f.M.lesson(g,'attack').control,/R.*SINGLE.*SPACE/);assert.match(f.M.lesson(g,'attack').watch,/first impacts have been assessed/);assert.deepEqual(clone({targets:g.world.targets,bombs:g.ac.bombs,p:g.ac.p}),before);assert.equal(g.result,null);f.M.stop(false);
});

test('an emergency command retains original ACLS range disengagement instead of latching ship guidance offshore',()=>{
 // Execute the current original Game.autoFly method, rather than replacing
 // its range housekeeping with a test implementation of the same policy.
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=index.indexOf('  autoFly(dt, ac, W) {'),end=index.indexOf('\n  /* ---------------- flying it',start);assert.ok(start>0&&end>start);
 const pilot=vm.runInNewContext('({'+index.slice(start,end)+'}).autoFly',{Math,PI:Math.PI,TAU:Math.PI*2,DEG:Math.PI/180,MS2KT:1.9438445,CV:{angle:.15,aim:40,wire:[20,30]},terrainH:()=>5,localToWorld:(p,h,x,y,z)=>[p[0]+x,p[1]+y,p[2]+z],worldToLocal:(p,h,q)=>q.map((n,i)=>n-p[i])});
 const f=fixture({terrain:x=>x>3000?-60:50,pilot}),g=f.start('m7');g.ac.onDeck=false;g.ac.gear=false;g.ac.p=[0,500,0];g.ac.dmg.hyd=.9;g.ac.bombs=0;g.aclsCoupled=true;g.departed=true;g.phase='recovery';g.shipRange=8000;g._ahead=()=>0;g._apHome=1;g.objState=()=>[['Attack','complete',true],['Return','pending',false]];const before=clone({targets:g.world.targets,p:g.ac.p,crew:g.ac.crew,dmg:g.ac.dmg,bombs:g.ac.bombs});
 g.update(.02);assert.equal(f.M.snapshot(g).stage,'emergency');assert.equal(g.aclsCoupled,true,'the director cannot clear a real coupled state inside the original9km gate');g.shipRange=10000;g.update(.02);assert.equal(g.aclsCoupled,false,'original pilot range housekeeping runs despite the emergency command');const command=f.calls.filter(c=>c[0]==='simulation').at(-1)[2];assert.equal(command.ias,310);assert.ok(Math.sin(command.hdg)>.4,'ordinary offshore command survives original housekeeping');assert.deepEqual(clone({targets:g.world.targets,p:g.ac.p,crew:g.ac.crew,dmg:g.ac.dmg,bombs:g.ac.bombs}),before);assert.equal(g.result,null);assert.equal(g.rescuedOK,undefined);f.M.stop(false);
});

test('a living airborne BN uses original ejection when the pilot dies without granting unfinished objectives',()=>{
 const f=fixture({terrain:()=>-60}),g=f.start('m8');g.phase='airborne';g.ac.onDeck=false;g.ac.gear=false;g.ac.p=[8000,500,0];g.update(.02);assert.ok(f.calls.includes('lock'),'ordinary designation just used the shared action timer');g.ac.crew.pilot=0;g.ac.crew.bn=1;let ejected=0;g.eject=()=>{ejected++;g.ejected=true;g.chute={};g.phase='chute';};const before=clone({targets:g.world.targets,crew:g.ac.crew,p:g.ac.p});
 g.update(.02);assert.equal(ejected,1);assert.equal(f.M.snapshot(g).stage,'eject');assert.ok(f.M.snapshot(g).events.some(e=>e.stage==='emergency'));assert.match(f.M.snapshot(g).detail,/unfinished objectives remain incomplete/);assert.equal(g.app.gctl.commit,0);assert.deepEqual(clone({targets:g.world.targets,crew:g.ac.crew,p:g.ac.p}),before);assert.equal(g.objState()[0][2],false);assert.equal(g.result,null);f.M.stop(false);
});

test('pilot-loss emergency respects deck, minimum ejection height and original aircraft eligibility',()=>{
 for(const options of [{onDeck:true,phase:'deck',height:21,alive:true},{onDeck:false,phase:'airborne',height:24,alive:true},{onDeck:false,phase:'dead',height:500,alive:false}]){
  const f=fixture(),g=f.start('m8');g.ac.onDeck=options.onDeck;g.phase=options.phase;g.ac.p[1]=options.height;g.ac.alive=options.alive;g.ac.crew.pilot=0;let ejected=0;g.eject=()=>ejected++;g.update(.02);assert.equal(ejected,0,JSON.stringify(options));assert.equal(g.result,null);f.M.stop(false);
 }
});

test('completed practice keeps later POW saves and preferences isolated until Stop or leave',()=>{
 const f=fixture(),g=f.start('m11'),before=clone(Object.fromEntries(f.values));g.pow={complete:true,outcome:{escaped:true,rescued:true}};g.update(.01);assert.equal(f.M.snapshot(g).finished,true);assert.equal(f.M.snapshot(g).campaignIsolated,true);f.Store.set('pow_checkpoint',{version:2,stage:'river',complete:true});f.Store.set('pow_preferences',{difficulty:'practice-only'});assert.equal(f.writes.length,0);assert.deepEqual(clone(Object.fromEntries(f.values)),before);f.M.stop(false);assert.deepEqual(clone(Object.fromEntries(f.values)),before);f.Store.set('normal-save',{afterPractice:true});assert.equal(f.writes.length,1);
});
test('actual validated Willard retry remains practice through replacement, frame, original second debrief and Stop; campaign retry is unchanged',()=>{
 // Reuse the existing explicit Willard domain adapter, with original
 // interceptor/flak/mission/checkpoint validator and retry implementation.
 const file=path.join(__dirname,'willard-mission.cjs'),code=fs.readFileSync(file,'utf8'),helpers=vm.runInNewContext(code.slice(0,code.indexOf("test('"))+'\n({fixture,spawn});',{require,__dirname,console}),f=helpers.fixture({strike:false});helpers.spawn(f);const before=clone(Object.fromEntries(f.values)),progress=f.App.prog;assert.equal(f.M.validCheckpoint(f.Store.get(f.M.KEY)),true);
 Object.assign(f.App,{keys:{},gctl:{},screen:'ready',frame(){},renderReady(){},show(id){this.screen=id;},start(m){this._missionStart=(this._missionStart||0)+1;this.show('game');this.game=f.make(m);f.M.start(this.game,{seed:1966,strike:false});return this.game;}});Object.assign(f.App.set,{seat:0,assist:1,mouse:1});vm.runInNewContext(source,{window:f.window,console});const D=f.window.MissionDemo;f.Game.prototype.autoFly=function(){return {};};assert.equal(D.install({App:f.App,Game:f.Game,Store:f.Store,missions:[f.M.definition],terrainH:f.terrainH}),true);assert.equal(D.start('willard'),true);f.App.frame(0);const first=f.App.game;f.game=first;helpers.spawn(f);first.willard.retries=5;first.result={pass:true};first.update(.01);assert.equal(D.snapshot(first).finished,true);assert.equal(f.M.retry(first),true);const second=f.App.game;assert.notEqual(second,first);f.App.frame(0);assert.equal(D.snapshot(second).computerPlaying,true);assert.equal(second.willard.retries,6,'the actual earned checkpoint/retry count survives');assert.equal(D.snapshot(second).campaignIsolated,true);second.debrief(false,'Original retry debrief exercised');D.render(second);assert.equal(second.result.pass,false);assert.equal(D.snapshot(second).campaignIsolated,true);assert.deepEqual(clone(Object.fromEntries(f.values)),before,'retry and original second debrief must not touch real saves');D.stop(false);assert.deepEqual(clone(Object.fromEntries(f.values)),before);assert.equal(f.App.prog,progress);assert.equal(f.M.retry(second),true,'campaign retry remains the original action outside practice');assert.equal(f.values.get(f.M.KEY).retries,6);D.uninstall();
});


test('completed strike avoids a terrain-obstructed moving-carrier approach using normal offshore flight',()=>{
 const f=fixture({terrain:x=>x>3000?-60:90}),g=f.start('m7');g.ac.onDeck=false;g.ac.gear=false;g.ac.p=[0,500,0];
 const before=clone({p:g.ac.p,health:g.ac.crew,targets:g.world.targets,bombs:g.ac.bombs});let ejections=0;g.eject=()=>ejections++;
 g.update(.02);assert.notEqual(f.M.snapshot(g).stage,'emergency','incomplete objectives must still be earned');
 g.objState=()=>[['Attack','complete',true],['Return','pending',false]];g.update(.02);
 const command=f.calls.filter(c=>Array.isArray(c)&&c[0]==='simulation').at(-1)[2];
 assert.equal(f.M.snapshot(g).stage,'emergency');assert.match(f.M.snapshot(g).detail,/Terrain obstructs/);assert.ok(Math.sin(command.hdg)>.4);assert.ok(command.alt>=250);
 assert.equal(g.aclsCoupled,undefined);assert.equal(ejections,0,'the crew must actually reach open water');assert.deepEqual(clone({p:g.ac.p,health:g.ac.crew,targets:g.world.targets,bombs:g.ac.bombs}),before);assert.equal(g.result,null);f.M.stop(false);
});

test('SAR chooses the original Run button at a held militia encounter before resuming radio controls',()=>{
 const f=fixture({terrain:()=>-60}),g=f.start('m7');g.ac.onDeck=false;g.evade={p:[0,0,0],hdg:0,radio:0,rescue:0,eta:120,held:1};let ran=0,shot=0;
 f.window.document={hidden:false,getElementById:()=>null,querySelectorAll:()=>[{textContent:'Shoot',click(){shot++;}},{textContent:'Run',click(){ran++;g.evade.held=0;}}]};
 const p=g.evade.p.slice();g.update(.02);assert.equal(ran,1);assert.equal(shot,0);assert.equal(g.evade.held,0);g.update(.02);assert.equal(g.app.keys.KeyR,1);assert.deepEqual(g.evade.p,p);assert.equal(g.result,null);assert.equal(g.rescuedOK,undefined);f.M.stop(false);
});

function deltaFixture(boatZ=26){
 const f=fixture(),g=f.start('m11');g.mis.escape=true;g.ac.onDeck=false;g.evade={p:[94,1,0],hdg:Math.PI,searchers:[]};
 g.pow={stage:'river',base:[0,2,0],objects:[{id:'river-board',p:[105.5,1,boatZ],radius:3.5},{id:'river-float',p:[94,1,0],radius:4}],stats:{fatigue:20},river:{mode:'float',phase:'delta',logicalDistance:83000,boat:{p:[105.5,1,boatZ],speed:0},boatOwned:false}};return {f,g};
}

test('a once-watched delta skiff remains bypassed when the patrol temporarily leaves',()=>{
 const {f,g}=deltaFixture();g.evade.searchers=[{p:[140,1,26],alive:true,armed:true,state:'patrol'}];const before=clone({p:g.evade.p,river:g.pow.river,stats:g.pow.stats});
 g.update(.02);g.evade.searchers=[];for(let i=0;i<8;i++)g.update(.02);
 assert.equal(g.app.keys.KeyF,0,'do not switch to swimming and reapproach a watched boat');assert.equal(g.app.gctl.pitch,1);assert.match(f.M.snapshot(g).detail,/watched or already upstream/);assert.deepEqual(clone({p:g.evade.p,river:g.pow.river,stats:g.pow.stats}),before);assert.equal(g.pow.complete,undefined);f.M.stop(false);
});

test('the delta crew follows the current instead of swimming back toward a skiff already upstream',()=>{
 const {f,g}=deltaFixture(-14),before=clone(g.pow.river);for(let i=0;i<8;i++)g.update(.02);
 assert.equal(g.app.keys.KeyF,0);assert.equal(g.app.gctl.pitch,1);assert.deepEqual(g.pow.river,before);assert.equal(g.pow.river.boatOwned,false);assert.equal(g.result,null);f.M.stop(false);
});

test('a nearby pursuing guard causes a skiff bypass even when the guard is far from the boat',()=>{
 const {f,g}=deltaFixture(40);g.evade.searchers=[{p:[94,1,-30],alive:true,armed:true,state:'pursuit'}];g.update(.02);g.evade.searchers=[];for(let i=0;i<8;i++)g.update(.02);
 assert.equal(g.app.keys.KeyF,0);assert.equal(g.app.gctl.pitch,1);assert.equal(g.pow.river.mode,'float');assert.equal(g.pow.river.logicalDistance,83000);assert.equal(g.pow.complete,undefined);f.M.stop(false);
});

test('all twelve tutorial plans explain their own goal, end-to-end route and demonstrated features',()=>{
 const f=fixture(),before=clone(f.missions),goals=new Set();
 for(const m of f.missions){const g=f.start(m.id),plan=f.M.lesson(g);assert.equal(plan.missionId,m.id);assert.equal(plan.title,m.title);assert.ok(plan.goal.length>35);assert.equal(plan.route.length,4);assert.ok(plan.route.every(step=>typeof step==='string'&&step.length>10));assert.ok(plan.features.split(' · ').length>=3);assert.ok(plan.control.length>8&&plan.watch.length>20);goals.add(plan.goal);f.M.stop(false);}
 assert.equal(goals.size,12,'each mission needs its own objective explanation');assert.deepEqual(f.missions,before,'lesson presentation cannot rewrite mission definitions');
});

test('tutorial progress reports actual objectives without granting progress, health or saves',()=>{
 const f=fixture(),g=f.start('m8'),rows=[['Destroy the radar','destroyed',true],['Destroy launchers','1 / 3',false],['Return','pending',false]];g.objState=()=>rows;
 const before=clone({ac:g.ac,world:g.world,result:g.result,progress:f.App.prog}),writes=f.writes.length;
 const plan=f.M.lesson(g,'arm');assert.equal(plan.completed,1);assert.equal(plan.total,3);assert.deepEqual(clone(plan.objectives),rows);assert.match(plan.watch,/does not destroy the launchers/);assert.match(plan.control,/when emitting/);
 rows[1][2]=true;assert.equal(f.M.lesson(g,'assess').completed,2);rows[1][2]=false;
 assert.deepEqual(clone({ac:g.ac,world:g.world,result:g.result,progress:f.App.prog}),before);assert.equal(f.writes.length,writes);f.M.stop(false);
});

test('weapons-tight and coordinate-attack lessons explain their distinct success conditions',()=>{
 const f=fixture(),g=f.start('m9'),recce=f.M.lesson(g,'identify');assert.match(recce.goal,/release no weapons/);assert.match(recce.control,/no release/);assert.match(recce.watch,/consent released/);assert.doesNotMatch(recce.control,/Hold SPACE/);f.M.stop(false);
 const h=f.start('m5');assert.match(f.M.lesson(h,'navigation').watch,/SYS ERR/);assert.match(f.M.lesson(h,'acquire').watch,/does not paint/);assert.match(f.M.lesson(h,'acquire').features,/coordinate designation/);f.M.stop(false);
});

test('escape tutorial distinguishes earned interactions and fictional offshore success',()=>{
 const f=fixture(),g=f.start('m11');assert.match(f.M.lesson(g,'cell').watch,/hold.*until.*earned/);assert.match(f.M.lesson(g,'roof').watch,/actual rope/);assert.match(f.M.lesson(g,'river').watch,/fatigue.*patrols/);assert.match(f.M.lesson(g,'gulf').watch,/explicitly fictional/);f.M.stop(false);
});

test('returned tutorial plans are detached from authored routes and live objective rows',()=>{
 const f=fixture(),g=f.start('m4'),first=f.M.lesson(g,'attack');first.route[0]='changed';first.objectives[0][0]='changed';
 const next=f.M.lesson(g,'attack');assert.notEqual(next.route[0],'changed');assert.equal(next.objectives[0][0],'Attack');assert.match(next.watch,/moving boat/);f.M.stop(false);
});
