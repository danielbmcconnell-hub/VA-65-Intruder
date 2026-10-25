'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/survival/descent-threats.js'),'utf8'),plain=v=>JSON.parse(JSON.stringify(v));
function fixture(options={}){
 const math=Object.create(Math);math.random=()=>{throw Error('Descent encounter must not consume gameplay Math.random');};
 const window={document:{hidden:false,visibilityState:'visible',getElementById:()=>null}},sandbox={window,Math:math};vm.runInNewContext(source,sandbox);const D=window.DescentThreats,log={radio:[],sound:[],tracers:[],companion:[]},g={t:0,phase:'chute',rightSeat:false,paused:false,mis:{id:'m11',env:{seed:321}},ac:{crew:{pilot:1,bn:1}},chute:{p:[0,90,0],v:[0,0,0],open:1,live:{pilot:true,bn:true}},world:{saf:[{p:[0,11.6,45]}],scenery:[],targets:[],_cells:new Map(),fx:{add:[],streak(...args){log.tracers.push(args);}}},app:{screen:'game',set:{sound:1},audio:{burst(...args){log.sound.push(args);}},radio(...args){log.radio.push(args);}}};g.app.game=g;
 const other={active:true,role:'bn',mode:'descending',chute:{p:[30,90,0],v:[0,0,0],open:1}};
 D.configure({terrainH:options.terrain||(()=>10),AviatorCompanion:options.companion?{view:()=>other,receiveInjury(g,event){log.companion.push(event);return true;}}:null});
 if(options.sources)g.world.saf=options.sources;D.begin(g,{seed:options.seed??12345});
 const tick=(seconds,dt=1/60)=>{for(let i=0;i<Math.round(seconds/dt);i++){g.t+=dt;D.step(g,dt);}};
 return {D,g,window,log,tick,other};
}
test('an existing rifle position becomes a bounded whole photographic militia actor at its actual ground coordinate',()=>{
 const f=fixture(),a=f.D.actors(f.g);assert.equal(a.length,1);assert.deepEqual(plain(a[0].p),[0,10,45]);assert.equal(a[0].armed,true);assert.equal(a[0].kind,'militia');assert.deepEqual(plain(f.g.world.saf),[{p:[0,11.6,45]}]);
 const many=fixture({sources:Array.from({length:50},(_,i)=>({p:[i,11.6,45]}))});assert.equal(many.D.actors(many.g).length,4);
});
test('no armed source, civilians, dead source and ocean positions never create imaginary incoming fire',()=>{
 for(const options of [{sources:[]},{sources:[{p:[0,11.6,45],armed:false}]},{sources:[{p:[0,11.6,45],kind:'farmer'}]},{sources:[{p:[0,11.6,45],alive:false}]},{terrain:()=>0}]){const f=fixture(options);f.tick(30);assert.equal(f.D.inspect(f.g).shots,0);assert.equal(f.D.actors(f.g).length,0);assert.equal(f.g.ac.crew.pilot,1);}
});
test('static collision rejects enclosed rifle photographs and distant sources do not sample local terrain',()=>{
 let terrainCalls=0;const f=fixture({terrain:()=>{terrainCalls++;return 10;},sources:[{p:[0,11.6,45]},{p:[5000,11.6,0]}]});f.g._localSolidAt=(x,z,r)=>x===0&&z===45&&r>0;terrainCalls=0;f.D.begin(f.g,{seed:1});assert.equal(terrainCalls,1);assert.equal(f.D.actors(f.g).length,0);f.tick(20);assert.equal(f.D.inspect(f.g).shots,0);assert.deepEqual(plain(f.g.world.saf),[{p:[0,11.6,45]},{p:[5000,11.6,0]}]);
});
test('full canopy, grace, practical range and altitude are necessary before actual gunfire',()=>{
 const f=fixture(),sourcesBefore=plain(f.g.world.saf);f.tick(3.9);assert.equal(f.D.inspect(f.g).shots,0);f.tick(20);assert.deepEqual(plain(f.g.world.saf),sourcesBefore);assert.ok(f.D.inspect(f.g).shots>0);assert.ok(f.log.tracers.length>0&&f.log.sound.length>0);assert.match(f.log.radio[0][1],/Rifle fire/);
 for(const p of [[1000,90,0],[0,500,0],[0,12,0]]){const q=fixture();q.g.chute.p=p;q.D.begin(q.g,{seed:12345});q.tick(30);assert.equal(q.D.inspect(q.g).shots,0);}
 const q=fixture();q.g.chute.open=.5;q.tick(30);assert.equal(q.D.inspect(q.g).shots,0);q.g.chute.open=1;q.tick(20);assert.ok(q.D.inspect(q.g).shots>0);
});
test('terrain ridge and rotated solid walls block real firing; clearing them allows acquisition again',()=>{
 const ridge=fixture({terrain:(x,z)=>z>18&&z<27?50:10});ridge.g.chute.p[1]=28;ridge.D.begin(ridge.g,{seed:12345});ridge.tick(30);assert.equal(ridge.D.inspect(ridge.g).shots,0);
 const f=fixture({sources:[{p:[5,11.6,20]}]});f.g.chute.p=[5,14,0];const wall={m:'cwall',p:[0,10,10],y:Math.PI/2,s:1};f.g.world.scenery.push(wall);f.D.begin(f.g,{seed:12345});assert.equal(f.D.lineOfSight(f.g,[5,11.6,20],[5,13.6,0]),false);f.tick(30);assert.equal(f.D.inspect(f.g).shots,0);wall.y=0;assert.equal(f.D.lineOfSight(f.g,[5,11.6,20],[5,13.6,0]),true);f.tick(20);assert.ok(f.D.inspect(f.g).shots>0);
});
test('a cached acquired target cannot be shot after a building becomes an intervening barrier',()=>{
 const f=fixture({sources:[{p:[5,11.6,20]}]});f.g.chute.p=[5,14,0];f.D.begin(f.g,{seed:7});f.tick(12);assert.ok(f.D.inspect(f.g).shots>0);f.g.world._cells.set(0,[{m:'cwall',p:[0,10,10],y:Math.PI/2,s:1}]);const before=f.D.inspect(f.g).shots;f.tick(15);assert.equal(f.D.inspect(f.g).shots,before);
});
test('pause, menus, hidden page, context loss and suppressed or stunned gunmen stop encounter time and shots',()=>{
 for(const block of [f=>f.g.paused=true,f=>f.g.app.screen='ready',f=>f.window.document.hidden=true,f=>f.g.app.graphicsContextLost=true,f=>f.g.app.game={},f=>f.window.document.getElementById=id=>({classList:{contains:()=>id==='legend'}})]){const f=fixture();f.tick(10);const before=plain(f.D.inspect(f.g));block(f);f.tick(20);const after=f.D.inspect(f.g);assert.equal(after.clock,before.clock);assert.equal(after.shots,before.shots);}
 const f=fixture();const actor=f.D.actors(f.g)[0];actor.suppress=100;f.tick(20);assert.equal(f.D.inspect(f.g).shots,0);actor.suppress=0;actor.stunUntil=100;f.tick(20);assert.equal(f.D.inspect(f.g).shots,0);actor.stunUntil=0;f.tick(10);assert.ok(f.D.inspect(f.g).shots>0);
});
test('separate fixed-step seeded randomness gives frame-rate independent encounters and bounded history',()=>{
 const results=[];for(const dt of [1/30,1/60,1/120]){const f=fixture({seed:271828});f.tick(80,dt);results.push(plain(f.D.inspect(f.g)));assert.ok(results.at(-1).events.length<=f.D.limits.history);assert.ok(results.at(-1).shooters.length<=4);}assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
 const f=fixture();f.D.step(f.g,999);assert.ok(f.D.inspect(f.g).clock<=.25+.00001);f.D.step(f.g,NaN);f.D.step(f.g,-1);assert.ok(f.D.inspect(f.g).clock<=.25+.00001);
});
test('actual crew injuries are limited, never heal an already critical aviator and carry into original ground hurt/hit state',()=>{
 const f=fixture({sources:[-50,-20,10,40].map(x=>({p:[x,11.6,45]}))});f.tick(300);const result=f.D.inspect(f.g);assert.equal(result.injuries.pilot,2);assert.ok(f.g.ac.crew.pilot<1&&f.g.ac.crew.pilot>=.1);assert.ok(f.log.radio.some(q=>/Hit under the canopy/.test(q[1])));f.g.chute=null;f.g.phase='evade';f.g.evade={p:[0,10,0],searchers:[],locals:[],hits:1};assert.equal(f.D.enterGround(f.g),true);assert.equal(f.g.evade.hurt,1);assert.equal(f.g.evade.hits,3);assert.equal(f.g.evade.descentInjuries,2);assert.equal(f.D.enterGround(f.g),false);assert.equal(f.g.evade.hits,3);assert.equal(f.D.actors(f.g).length,0);
 const critical=fixture();critical.g.ac.crew.pilot=.02;critical.tick(300);assert.ok(critical.g.ac.crew.pilot>0&&critical.g.ac.crew.pilot<=.02);
});
test('the other living aviator has independent actual crew condition and delegates injury state to its existing owner',()=>{
 const f=fixture({companion:true,sources:[{p:[30,11.6,40]},{p:[32,11.6,45]}]});f.tick(300);assert.ok(f.D.inspect(f.g).injuries.bn>0);assert.equal(f.g.ac.crew.pilot,1);assert.ok(f.g.ac.crew.bn<1);assert.equal(f.log.companion.length,f.D.inspect(f.g).injuries.bn);f.other.chute=null;const shots=f.D.inspect(f.g).shots;f.g.ac.crew.pilot=0;f.tick(20);assert.equal(f.D.inspect(f.g).shots,shots);
});
test('the real companion owner persists descent injury into its existing following and movement state',()=>{
 const f=fixture();vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/survival/aviator-companion.js'),'utf8'),{window:f.window});const M=f.window.AviatorCompanion;M.configure({terrainH:()=>10});f.g.ac.yaw=0;f.g.chute.drift=0;assert.ok(M.begin(f.g,{seed:1}));f.g.ac.crew.bn=.84;assert.equal(M.receiveInjury(f.g,{source:'descent-small-arms'}),true);const saved=M.snapshot(f.g);assert.equal(saved.injured,true);assert.equal(saved.injuryPersistent,true);assert.equal(saved.injuryAge,0);assert.equal(M.view(f.g).injured,true);
 f.g.phase='evade';f.g.chute=null;f.g.evade={p:[0,10,0],searchers:[],locals:[],cattle:[]};saved.chute=null;saved.mode='following';saved.reunited=true;saved.known=true;saved.actor.p=[0,10,-6];saved.actor.goal=saved.actor.p.slice();saved.actor.airborne=false;saved.actor.suspended=false;assert.equal(M.restore(f.g,saved),true);for(let i=0;i<20;i++){f.g.t+=.05;M.step(f.g,.05);}assert.equal(M.view(f.g).injured,true);assert.equal(M.receiveInjury(f.g),false,'a landed companion does not receive another airborne injury');
});
test('landing reuses the exact armed gunmen once with finite normal-local AI fields and does not arm overlapping civilians',()=>{
 const f=fixture(),actor=f.D.actors(f.g)[0];f.tick(12);f.g.phase='evade';f.g.chute=null;f.g.evade={p:[0,10,0],locals:[],searchers:[]};assert.equal(f.D.enterGround(f.g),true);assert.equal(f.g.evade.locals[0],actor);assert.deepEqual(plain(actor.home),[0,45]);assert.ok(Number.isFinite(actor.wander)&&Number.isFinite(actor.loiter));assert.equal(f.D.enterGround(f.g),false);assert.equal(f.g.evade.locals.length,1);
 const q=fixture(),civilian={p:[0,10,45],alive:true,armed:false,kind:'farmer'};q.g.phase='evade';q.g.chute=null;q.g.evade={p:[0,10,0],locals:[civilian],searchers:[]};q.D.enterGround(q.g);assert.equal(q.g.evade.locals.length,1);assert.equal(civilian.armed,false);assert.equal(civilian.kind,'farmer');
});
test('a rejected or later-culled ground owner cannot remain an invisible attacker on the other descending crewman',()=>{
 const f=fixture({companion:true,sources:[{p:[30,11.6,40]}],seed:1});f.tick(8);assert.ok(f.D.inspect(f.g).shots>0);f.g.phase='evade';f.g.chute=null;const civilian={p:[30,10,40],alive:true,armed:false,kind:'farmer'};f.g.evade={p:[0,10,0],locals:[civilian],searchers:[]};f.D.enterGround(f.g);assert.equal(f.D.inspect(f.g).shooters.length,0);const shots=f.D.inspect(f.g).shots;f.tick(30);assert.equal(f.D.inspect(f.g).shots,shots);assert.equal(civilian.armed,false);
 const q=fixture({companion:true,sources:[{p:[30,11.6,40]}]});q.tick(8);q.g.phase='evade';q.g.chute=null;q.g.evade={p:[0,10,0],locals:[],searchers:[]};q.D.enterGround(q.g);assert.equal(q.g.evade.locals.length,1);q.g.evade.locals=[];const before=q.D.inspect(q.g).shots;q.tick(30);assert.equal(q.D.inspect(q.g).shots,before,'normal owner culling retires this source from firing');
});
test('a reused normal ground owner fires at the remaining canopy from current terrain despite raw p.y zero or uphill travel',()=>{
 const f=fixture({companion:true,sources:[{p:[30,11.6,40]}],terrain:(x,z)=>x>50?30:10});f.tick(8);const source=f.D.actors(f.g)[0],normal={...source,p:[30,0,40],kind:'nva'};f.g.phase='evade';f.g.chute=null;f.g.evade={p:[0,10,0],locals:[normal],searchers:[]};f.D.enterGround(f.g);assert.equal(f.g.evade.locals.length,1);assert.equal(f.D.inspect(f.g).shooters[0].id,normal.id);const before=f.D.inspect(f.g).shots;f.tick(15);assert.ok(f.D.inspect(f.g).shots>before);assert.equal(f.log.tracers.at(-1)[0][1],11.6);assert.equal(normal.p[1],0);
 normal.p=[60,0,40];const at=f.D.inspect(f.g).shots;f.tick(15);assert.ok(f.D.inspect(f.g).shots>at);assert.equal(f.log.tracers.at(-1)[0][1],31.6);assert.equal(normal.p[1],0);
});
test('the original install hooks preserve return values, begin only a new ejection and transfer injury after native landing',()=>{
 const f=fixture();class Game{constructor(){Object.assign(this,f.g);this.app={...f.g.app,game:this};delete this.chute;this.phase='airborne';}eject(){if(!this.chute){this.chute={p:[0,90,0],v:[0,0,0],open:1,live:{pilot:true,bn:true}};this.phase='chute';}return 'ejected';}update(dt){this.t+=dt;return 'updated';}_startGroundPhase(){this.phase='evade';this.chute=null;this.evade={p:[0,10,0],locals:[],searchers:[]};return 'ground';}}
 assert.equal(f.D.install({Game,terrainH:()=>10}),true);const g=new Game();assert.equal(g.eject(),'ejected');for(let i=0;i<800;i++)assert.equal(g.update(.05),'updated');const at=f.D.inspect(g);g.eject();assert.equal(f.D.inspect(g).clock,at.clock);assert.equal(g._startGroundPhase(),'ground');assert.equal(f.D.inspect(g).transferred,true);assert.equal(g.evade.locals.length,1);assert.equal(f.D.install({Game,terrainH:()=>10}),true);
});
