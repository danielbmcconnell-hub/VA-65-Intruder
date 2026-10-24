'use strict';
// Stateful companion physics/AI contracts. These do not claim browser visuals,
// device frame rate, or a flown mission; those use the production browser suite.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/survival/aviator-companion.js'),'utf8');
function fixture(options={}){
  const calls=[],window={document:{hidden:false,visibilityState:'visible'}};vm.runInNewContext(source,{window});
  const g={phase:'chute',t:0,paused:false,rightSeat:!!options.rightSeat,world:{},mis:{id:options.mission||'m2',env:{seed:4}},ac:{crew:{pilot:1,bn:1},yaw:0},chute:{p:[0,80,0],v:[0,12,0],open:0,drift:0},app:{screen:'game',graphicsContextLost:false,radio:(...args)=>calls.push(args)}};g.app.game=g;
  if(options.crew)g.ac.crew=options.crew;
  const M=window.AviatorCompanion;M.configure({terrainH:options.floor||(()=>5),lineOfSight:options.sight,move:options.move,LandingWater:options.water});
  M.begin(g,{seed:options.seed??1});return {M,g,window,calls};
}
function ground(options={}){
  const f=fixture(options),s=f.M.snapshot(f.g);assert.ok(s);f.g.phase='evade';f.g.chute=null;f.g.evade={p:[0,5,0],hdg:0,searchers:[],locals:[],cattle:[],hurt:0};
  s.chute=null;s.mode='separated';s.landedAt=0;s.landing=options.p||[0,5,-20];s.actor.p=(options.p||[0,5,-20]).slice();s.actor.goal=s.actor.p.slice();s.actor.airborne=false;s.reunited=!!options.reunited;s.known=!!options.known;s.injured=false;s.order=options.order||'follow';
  assert.equal(f.M.restore(f.g,s),true);return f;
}
function tick(f,seconds,dt=.05){for(let t=0;t<seconds-1e-9;t+=dt){const step=Math.min(dt,seconds-t);f.g.t+=step;f.M.step(f.g,step);}return f.M.view(f.g);}
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test('command ejection creates only the other surviving aviator and respects the selected seat',()=>{
  const pilot=fixture();assert.equal(pilot.M.view(pilot.g).role,'bn');const bn=fixture({rightSeat:true});assert.equal(bn.M.view(bn.g).role,'pilot');
  for(const options of [{crew:{pilot:1,bn:0}},{rightSeat:true,crew:{pilot:0,bn:1}}]){const f=fixture(options);assert.equal(f.M.view(f.g).active,false);assert.equal(f.M.actors(f.g).length,0);assert.equal(f.M.instances(f.g,()=>{}),0);}
});

test('the second parachute advances independently from the actual starting pose without changing the player chute',()=>{
  const f=fixture(),player=JSON.stringify(f.g.chute),before=f.M.snapshot(f.g);tick(f,3);const after=f.M.snapshot(f.g);
  assert.equal(JSON.stringify(f.g.chute),player);assert.notDeepEqual(after.chute.p,before.chute.p);assert.ok(after.chute.open>.9);assert.ok(after.chute.t>2.9);
  const draws=[];assert.equal(f.M.instances(f.g,(...args)=>draws.push(args)),1);assert.equal(draws[0][0],'chute');near(draws[0][1][0],after.chute.p[0]);near(draws[0][1][2],after.chute.p[2]);
  after.chute.p[0]=999;assert.notEqual(f.M.snapshot(f.g).chute.p[0],999,'Diagnostic copies do not expose mutable trajectory state');
});

test('a ready suspended photograph replaces only its own chute body and never creates an invisible or walking aviator while loading',()=>{
  const f=fixture();f.g.rend={};let ready=false;f.window.PhotoCutouts={hasPose:(r,name,pose)=>r===f.g.rend&&name==='aviator'&&pose==='harness'&&ready};tick(f,3);
  assert.equal(f.M.actors(f.g).length,0);let draws=[];f.M.instances(f.g,(...a)=>draws.push(a));assert.equal(draws[0][0],'chute');
  ready=true;const actor=f.M.actors(f.g)[0];assert.ok(actor);assert.equal(actor.suspended,true);assert.equal(actor.airborne,true);assert.equal(actor.moving,false);assert.equal(f.M.actors(f.g)[0],actor);
  draws=[];f.M.instances(f.g,(...a)=>draws.push(a));assert.equal(draws[0][0],'chuteEmpty');
  ready=false;assert.equal(f.M.actors(f.g).length,0);draws=[];f.M.instances(f.g,(...a)=>draws.push(a));assert.equal(draws[0][0],'chute');
  const falling=f.M.snapshot(f.g);falling.mode='falling';falling.chute.open=0;assert.equal(f.M.restore(f.g,falling),true);assert.equal(f.M.actors(f.g).length,0);draws=[];f.M.instances(f.g,(...a)=>draws.push(a));assert.equal(draws[0][0],'chuteBody','Cold cutaway fallback contains only the aviator, no cut canopy or upright photograph');
  ready=true;assert.equal(f.M.actors(f.g)[0].suspended,true);assert.equal(f.M.instances(f.g,()=>{}),0);
  ready=true;f.g.app.graphicsContextLost=true;assert.equal(f.M.actors(f.g).length,0);assert.equal(f.M.instances(f.g,()=>{}),0);
});

test('seat sequencing separates full canopies using real initial velocity rather than the same opening centre',()=>{
  const f=fixture();f.g.chute.v=[40,12,0];f.M.begin(f.g,{seed:1});const bn=f.M.snapshot(f.g).chute;assert.ok(bn.p[0]-f.g.chute.p[0]>7);near(bn.t,.18);assert.ok(bn.open>0);
  const right=fixture({rightSeat:true}),before=right.M.snapshot(right.g).chute.p.slice();tick(right,.1);assert.deepEqual(right.M.snapshot(right.g).chute.p,before,'The pilot seat waits its actual separation delay');
});

test('seeded independent drift creates reproducible possible landing separation rather than teleporting to the player',()=>{
  const land=seed=>{const f=fixture({seed});tick(f,24);const s=f.M.snapshot(f.g);assert.equal(s.chute,null);assert.equal(s.mode,'separated');near(s.actor.p[1],5);assert.ok(Math.hypot(s.actor.p[0],s.actor.p[2])>10);return s.actor.p;};
  assert.deepEqual(Array.from(land(4)),Array.from(land(4)));assert.notDeepEqual(Array.from(land(4)),Array.from(land(91)));
});

test('pause, hidden tabs, capture, POW, frozen ground and inactive menus freeze both trajectory and crew clock',()=>{
  for(const change of [f=>{f.g.paused=true;},f=>{f.window.document.hidden=true;},f=>{f.window.document.visibilityState='hidden';},f=>{f.g._capturePending=true;},f=>{f.g.pow={stage:'cell'};},f=>{f.g.app.screen='ready';},f=>{f.g.app.graphicsContextLost=true;},f=>{f.g.evade={p:[0,5,0],frozen:true};}]){
    const f=fixture();change(f);const before=JSON.stringify(f.M.snapshot(f.g));tick(f,2);assert.equal(JSON.stringify(f.M.snapshot(f.g)),before);
  }
  const f=ground();f.g.rend={};f.window.PhotoCutouts={inspect:()=>({status:'loading'})};const before=f.M.snapshot(f.g);tick(f,2);assert.equal(f.M.view(f.g).clock,before.clock,'Required photograph loading freezes companion AI with the rest of ground simulation');
});

test('swept real canopy contact can hang the other chute; knife cutaway produces a physical fall and bounded injury',()=>{
  let caught=false,queries=0;const f=fixture({water:{surface:()=>0,collectTrees(g,a,b){queries++;assert.notEqual(a,b);return [{id:'actual-tree'}];},canopyContact(a,b){if(caught)return null;caught=true;return {p:[1,11,-3],branch:true,tree:{id:'actual-tree'}};}}});
  tick(f,.1);let s=f.M.snapshot(f.g);assert.equal(s.mode,'hung');assert.ok(queries>0);assert.deepEqual(Array.from(s.chute.p),[1,11,-3]);
  tick(f,3.6);s=f.M.snapshot(f.g);assert.equal(s.mode,'hung');near(s.chute.p[1],11);
  f.g.rend={};f.window.PhotoCutouts={hasPose:()=>true};
  tick(f,.6);s=f.M.snapshot(f.g);assert.equal(s.mode,'falling');assert.ok(s.chute.p[1]<11&&s.chute.p[1]>8);assert.equal(f.M.instances(f.g,()=>{}),0,'Cut canopy is not retained around the photographed falling body');assert.equal(f.M.actors(f.g)[0].airborne,true,'Falling body remains available for genuine suspended photographic rendering');
  tick(f,2);s=f.M.snapshot(f.g);assert.equal(s.mode,'separated');assert.equal(s.chute,null);near(s.actor.p[1],5);assert.equal(s.injured,true);assert.notEqual(f.g.phase,'done');
});

test('a companion canopy hitting a trunk centre hangs beside the wood and cuts down outside its collision core',()=>{
  let caught=false;const tree={id:'solid-trunk',p:[0,5,0],trunkRadius:.85};
  const f=fixture({water:{surface:()=>0,collectTrees:()=>[tree],canopyContact(){if(caught)return null;caught=true;return {p:[0,11,0],branch:true,tree};}}});
  tick(f,.1);const hang=f.M.snapshot(f.g);assert.equal(hang.mode,'hung');assert.ok(Math.hypot(hang.chute.p[0],hang.chute.p[2])>Math.SQRT2*.85+.35);
  tick(f,6.5);const s=f.M.snapshot(f.g);assert.equal(s.chute,null);assert.equal(s.mode,'separated');assert.ok(Math.hypot(s.actor.p[0],s.actor.p[2])>Math.SQRT2*.85+.35);near(s.actor.p[1],5);
});

test('reunion requires actual proximity and line of sight, and exposes the same stable aviator owner for gait tracking',()=>{
  const f=ground({p:[0,5,-4],sight:()=>false});tick(f,.2);assert.equal(f.M.view(f.g).reunited,false);assert.equal(f.M.command(f.g,'follow'),false);
  f.M.configure({lineOfSight:()=>true});tick(f,.1);const v=f.M.view(f.g);assert.equal(v.reunited,true);assert.equal(v.order,'follow');assert.equal(f.M.actors(f.g)[0],f.M.actors(f.g)[0]);assert.equal(f.M.actors(f.g)[0].kind,'aviator');assert.equal(f.M.actors(f.g)[0].armed,false);
  v.actors[0].p[0]=999;assert.notEqual(f.M.actors(f.g)[0].p[0],999);
});

test('a distant unidentified crewmate searches locally and cannot hear a call across the map',()=>{
  const f=ground({p:[0,5,-400]});assert.equal(f.M.command(f.g,'call'),true);assert.equal(f.M.view(f.g).known,false);assert.equal(f.M.view(f.g).distance,null);tick(f,45);const s=f.M.snapshot(f.g);
  assert.equal(s.reunited,false);assert.ok(Math.hypot(s.actor.p[0],s.actor.p[2]+400)<25,'Independent search stays around the real landing location');assert.ok(Math.hypot(s.actor.p[0],s.actor.p[2])>370);
});

test('a nearby audible call starts a physical search, is rate-limited and can lead to reunion',()=>{
  const f=ground({p:[0,5,-45]});assert.equal(f.M.command(f.g,'call'),true);assert.equal(f.M.command(f.g,'call'),false);assert.ok(f.g.evade.noise>0);assert.equal(f.M.view(f.g).known,true);const before=f.M.snapshot(f.g).actor.p.slice();tick(f,.1);const next=f.M.snapshot(f.g).actor.p;
  assert.ok(Math.hypot(next[0]-before[0],next[2]-before[2])<.3,'Search travels at a speed rather than a position jump');tick(f,30);assert.equal(f.M.view(f.g).reunited,true);
});

test('Follow and Wait control real bounded movement, while original swept collision can block the route',()=>{
  const f=ground({p:[0,5,-16],reunited:true});tick(f,1);let actor=f.M.actors(f.g)[0];assert.ok(actor.p[2]>-16&&actor.spd>0);assert.equal(f.M.command(f.g,'wait'),true);const before=actor.p.slice();tick(f,2);assert.deepEqual(f.M.actors(f.g)[0].p,before);assert.equal(f.M.command(f.g,'follow'),true);tick(f,.2);assert.ok(f.M.actors(f.g)[0].moving);
  const wall=ground({p:[0,5,-12],reunited:true,move:(g,x,z)=>[x,z]});tick(wall,3);actor=wall.M.actors(wall.g)[0];assert.deepEqual(Array.from(actor.p),[0,5,-12]);near(actor.spd,0);assert.equal(actor.moving,false);
});

test('companion collision cannot self-block and allows the player to leave an initial overlap',()=>{
  const f=ground({p:[0,5,-1],reunited:true,order:'wait'}),a=f.M.actors(f.g)[0];assert.equal(f.M.blockedAt(f.g,a.p[0],a.p[2],.43,{p:[0,5,0]}),true);assert.equal(f.M.blockedAt(f.g,a.p[0],a.p[2],.43,{p:a.p,_companionMoving:true}),false);
  const e={p:[0,5,-.8]};assert.equal(f.M.blockedAt(f.g,0,-.7,.43,e),false,'Movement out of overlap is permitted');assert.equal(f.M.blockedAt(f.g,0,-.9,.43,e),true,'Movement farther into overlap stays blocked');
});

test('the crewmate gives bounded patrol warnings and can be captured if left alone beside an alert enemy',()=>{
  const f=ground({p:[0,5,-3],reunited:true,order:'wait'});f.g.evade.searchers=[{p:[4,5,-3],alive:true,armed:true,seen:1}];tick(f,.1);assert.ok(f.calls.some(row=>/patrol/.test(row[1])));const count=f.calls.length;tick(f,3);assert.equal(f.calls.length,count,'Warnings do not queue every frame');
  const left=ground({p:[0,5,-40],reunited:true,order:'wait'});left.g.evade.searchers=[{p:[.5,5,-40],alive:true,armed:true,seen:1}];tick(left,.1);assert.equal(left.M.view(left.g).mode,'captured');assert.equal(left.M.actors(left.g).length,0);assert.equal(left.g.phase,'evade','A separate crewmate outcome does not force player capture');
});

test('team assistance is local, modest, injury-only and never heals or changes the original injury flag',()=>{
  const f=ground({p:[0,5,-2],reunited:true});assert.equal(f.M.movementFactor(f.g),1);f.g.evade.hurt=1;near(f.M.movementFactor(f.g),1.08);assert.equal(f.g.evade.hurt,1);f.g.evade.hurt=0;f.M.configure({LandingWater:{movementFactor:()=>.68}});near(f.M.movementFactor(f.g),1.08);f.M.command(f.g,'wait');assert.equal(f.M.movementFactor(f.g),1);
});

test('a pre-existing wounded crewmate is not healed when the temporary landing-injury interval expires',()=>{
  const f=fixture({crew:{pilot:1,bn:.3}});tick(f,24);const s=f.M.snapshot(f.g);f.g.phase='evade';f.g.chute=null;f.g.evade={p:[0,5,0],hdg:0,searchers:[],locals:[],cattle:[]};s.reunited=s.known=true;s.mode='following';s.actor.p=[0,5,-15];s.actor.goal=s.actor.p.slice();assert.equal(f.M.restore(f.g,s),true);tick(f,95);assert.equal(f.M.view(f.g).injured,true);near(f.g.ac.crew.bn,.3);f.g.evade.p[2]-=30;tick(f,.1);assert.ok(f.M.actors(f.g)[0].spd<2.1,'A wounded aviator keeps a slower physical pace');
});

test('rescue wording depends on actual cable proximity and never invents a second recovery',()=>{
  const f=ground({p:[0,5,-3],reunited:true});f.g.evade.jolly={p:[0,25,-2],down:1,hoist:1};assert.equal(f.M.prepareRescue(f.g),false,'Proximity alone cannot instantly board the other aviator');tick(f,3.5);assert.equal(f.M.prepareRescue(f.g),true);assert.equal(f.M.view(f.g).rescued,true);assert.match(f.M.rescueLine(f.g),/Both crewmen/);assert.equal(f.g.phase,'evade');
  const far=ground({p:[0,5,-100],reunited:true});far.g.evade.jolly={p:[0,25,-2],down:1,hoist:1};assert.equal(far.M.prepareRescue(far.g),false);assert.match(far.M.rescueLine(far.g),/not reached/);
});

test('deep-water landings preserve the aviator identity and immerse the body using the actual water surface',()=>{
  const f=fixture({floor:()=>-4,water:{surface:()=>.3}});tick(f,24);let s=f.M.snapshot(f.g);assert.equal(s.chute,null);assert.equal(s.actor.swimming,true);near(s.actor.p[1],.3-.42);near(s.actor.swimSurface,.3);
  f.g.phase='evade';f.g.chute=null;f.g.evade={p:[0,0,0],hdg:0,searchers:[],locals:[],cattle:[]};s.actor.p=[0,.3-.42,-10];s.actor.goal=s.actor.p.slice();s.reunited=true;s.known=true;s.order='follow';s.mode='following';assert.equal(f.M.restore(f.g,s),true);tick(f,1);const a=f.M.actors(f.g)[0];assert.equal(a.kind,'aviator');assert.ok(a.spd<=.881);assert.ok(a.swimPhase>0);near(a.swimSurface,.3);
});

test('horizontal swimming cadence follows resolved travel at30/60/120Hz and a blocked swimmer holds its photographed stroke',()=>{
  const rows=[];
  for(const hz of [30,60,120]){
    const f=ground({p:[0,-.42,-20],floor:()=>-4,reunited:true,water:{surface:()=>0}});f.g.evade.p[1]=-.42;
    tick(f,1,1/hz);const a=f.M.actors(f.g)[0];rows.push(a);near(Math.hypot(a.p[0],a.p[2]+20),.88,1e-8);near(a.swimPhase,(.88/f.M.limits.swimStrokeMetres)%1,1e-8);
  }
  for(const a of rows.slice(1)){near(a.swimPhase,rows[0].swimPhase,1e-8);near(a.p[2],rows[0].p[2],1e-8);}
  const f=ground({p:[0,-.42,-20],floor:()=>-4,reunited:true,water:{surface:()=>0},move:(g,x,z)=>[x,z]});f.g.evade.p[1]=-.42;tick(f,2);const a=f.M.actors(f.g)[0];near(a.swimPhase,0);near(a.spd,0);assert.equal(a.moving,false);
});

test('historical escape mission keeps the second descent but never overrides the documented separation with a team-up',()=>{
  const f=fixture({mission:'m11'});tick(f,2);assert.equal(f.M.instances(f.g,()=>{}),1);tick(f,23);f.g.phase='evade';f.g.evade={p:[0,5,0],hdg:0,searchers:[],locals:[]};assert.equal(f.M.view(f.g).historical,true);assert.equal(f.M.actors(f.g).length,0);assert.equal(f.M.command(f.g,'call'),false);
});

test('a historical aviator falling after cutaway retains its body when a loaded photograph is intentionally excluded',()=>{
  const f=fixture({mission:'m11'});f.g.rend={};f.window.PhotoCutouts={hasPose:()=>true};tick(f,2);const saved=f.M.snapshot(f.g);saved.mode='falling';saved.chute.open=0;saved.chute.v=[0,-1,0];assert.equal(f.M.restore(f.g,saved),true);
  assert.equal(f.M.actors(f.g).length,0,'Historical separation still excludes a fictional companion');const draws=[];assert.equal(f.M.instances(f.g,(...a)=>draws.push(a)),1);assert.equal(draws[0][0],'chuteBody','The historical falling aviator remains visible without a canopy');assert.equal(f.M.command(f.g,'follow'),false);
});

test('saved companion state is copied, validated and cannot be restored into a different mission or with invalid trajectory numbers',()=>{
  const f=fixture(),saved=f.M.snapshot(f.g);assert.equal(f.M.restore(f.g,saved),true);saved.actor.p[0]=777;assert.notEqual(f.M.snapshot(f.g).actor.p[0],777);
  for(const change of [s=>{s.mission='m9:';},s=>{s.role='enemy';},s=>{s.mode='teleport';},s=>{s.actor.p[0]=NaN;},s=>{s.chute.v[1]=Infinity;}]){const s=f.M.snapshot(f.g);change(s);assert.equal(f.M.restore(f.g,s),false);}
  const clock=f.M.view(f.g).clock;f.M.step(f.g,3);near(f.M.view(f.g).clock-clock,.25);assert.equal(f.M.step(f.g,0),false);
});

test('install composes with the original lifecycle, measures companion travel before the ground gait step and prepares actual rescue status',()=>{
  const f=fixture();class Game{constructor(){Object.assign(this,f.g);this.app={...f.g.app};this.app.game=this;this.ejected=false;this.before=[];}eject(){this.ejected=true;}update(){this.before.push(f.M.snapshot(this).clock);}rescued(){this.line=f.M.rescueLine(this);this.phase='done';this.evade=null;} _blockedAt(){return false;}syncControls(){}}
  assert.equal(f.M.install({Game,terrainH:()=>5}),true);assert.equal(f.M.install({Game}),false);const g=new Game();g.eject();g.update(.1);assert.ok(g.before[0]>.09);assert.ok(f.M.snapshot(g));
  const s=f.M.snapshot(g);s.chute=null;s.mode='following';s.reunited=s.known=true;s.actor.p=[0,5,-2];s.actor.goal=s.actor.p.slice();s.actor.airborne=false;g.phase='evade';g.evade={p:[0,5,0],jolly:{p:[0,25,-2],down:1,hoist:1},searchers:[],locals:[]};assert.equal(f.M.restore(g,s),true);for(let n=0;n<35;n++)g.update(.1);g.rescued();assert.match(g.line,/Both crewmen/);assert.equal(g.phase,'done');
});
