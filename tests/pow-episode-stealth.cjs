'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

// Deterministic production-mechanic fixtures; these are not browser visuals or
// physical device tests. Guard perception/pathfinding remain the real module.
function fixture(flat=true){
  const storage=new Map(),document={body:{classList:{toggle(){}}},getElementById(){return null;},pointerLockElement:null,activeElement:null};
  const window={document},sandbox={window,document,Date,console};vm.createContext(sandbox);
  for(const file of ['core.js','ai.js','episode-stealth.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow',file),'utf8'),sandbox);
  const P=window.POW;P.mountUI=()=>{};P.updateUI=()=>{};P.activate=()=>{};
  P.ctx={terrainH:()=>0,Store:{get:(key,value)=>storage.has(key)?storage.get(key):value,set:(key,value)=>storage.set(key,JSON.parse(JSON.stringify(value)))}};
  const game={ac:{p:[0,2,0]},app:{keys:{},gctl:{},set:{sound:0}},world:{_cells:new Map()},setHour(){}};
  P.begin(game,'cell');
  if(flat){Object.assign(game.pow,{stage:'compound',base:[0,0,0],solids:[],surfaces:[],objects:[],flags:{},nav:{minX:-20,maxX:20,minZ:-20,maxZ:20,cell:1}});game.campGeo=[];game.evade.p=[1.3,0,.95];game.evade.look=game.evade.pitchCmd=0;game.evade.searchers=[];game.pow.p=game.evade.p;game.pow.actors=game.evade.searchers;}
  const E=P.EpisodeStealth;E.enter(game);
  const calls=[],realNoise=P.AI.noise;P.AI.noise=(...args)=>{calls.push({p:Array.from(args[1]),loudness:args[2],kind:args[3],source:args[4]});return realNoise(...args);};
  function step(seconds,dt=.05){for(let i=0;i<Math.ceil(seconds/dt);i++){game.pow.time+=dt;P.AI.step(game,dt);E.step(game,dt);}}
  // Flat flight scenarios keep their declared launch point; collection is
  // separately exercised from the actual reachable pile approach.
  function gather(){const launch=game.evade.p.slice();game.evade.p.splice(0,3,0,game.pow.base[1],-.15);game.evade.hdg=Math.PI;assert(P.interact(game,'episode-pebbles'));assert.equal(E.state(game).stones,3);if(flat)game.evade.p.splice(0,3,...launch);}
  return {P,E,game,storage,calls,step,gather,sandbox};
}

test('reachable held floor interaction collects three finite stones without modifying required escape tools',()=>{
  const {P,E,game}=fixture();game.evade.p.splice(0,3,0,game.pow.base[1],-.15);game.evade.hdg=Math.PI;game.app.keys.KeyF=1;
  for(let i=0;i<10;i++)P.tick(game,.1);assert.equal(E.state(game).stones,0);
  for(let i=0;i<6;i++)P.tick(game,.1);assert.equal(E.state(game).stones,3);assert.equal(E.state(game).pileRemaining,0);
  game.app.keys.KeyF=0;P.tick(game,.1);assert(!P.interact(game,'episode-pebbles'));assert(!game.pow.inventory.bracket);assert(!game.pow.inventory.rope);
  assert(!game.campGeo.some(q=>q.id.startsWith('episode-pebble-pile:')));
});

test('a throw creates a visible moving parabolic stone and no impact sound at launch',()=>{
  const {E,game,calls,step,gather}=fixture();gather();game.evade.hdg=Math.PI/2;game.evade.look=0;
  assert(E.throwStone(game));const s=E.state(game),shot=s.projectiles[0],start=Array.from(shot.p);
  assert.equal(s.stones,2);assert.equal(calls.length,0);assert(game.campGeo.some(q=>q.id==='episode-stone:1'));
  step(.15);assert(shot.p[0]>start[0]+1);assert(shot.p[1]>start[1]);assert(shot.v[1]<2.1);
  step(.35);assert(shot.p[1]<start[1]+.2,'gravity turns the arc downward');assert(!shot.impacted);
  step(.4);assert(shot.impacted);assert.equal(calls.filter(n=>n.kind==='stone-impact').length,1);
  const sound=calls.find(n=>n.kind==='stone-impact');assert(sound.p[0]>start[0]+5);assert(sound.p[1]<.06);assert.equal(sound.source,'episode-stone:1');assert.notDeepEqual(sound.p,Array.from(game.evade.p));
});

test('aimed pitch changes the actual range and elevation, and cooldown prevents inventory spam',()=>{
  const low=fixture(),high=fixture();low.gather();high.gather();low.game.evade.hdg=high.game.evade.hdg=Math.PI/2;
  low.game.evade.look=-.7;high.game.evade.look=.45;assert(low.E.throwStone(low.game));assert(high.E.throwStone(high.game));
  assert(!high.E.throwStone(high.game));assert.equal(high.E.state(high.game).stones,2);
  low.step(3);high.step(3);const lp=low.E.state(low.game).impacts[0].p,hp=high.E.state(high.game).impacts[0].p;
  assert(hp[0]-high.game.evade.p[0]>lp[0]-low.game.evade.p[0]+4,'looking up produces a longer ballistic throw');
  assert(high.E.throwStone(high.game));high.step(1.2);assert(high.E.throwStone(high.game));high.step(2);assert.equal(high.E.state(high.game).stones,0);assert(!high.E.throwStone(high.game));
});

test('swept flight hits the near face of a thin wall instead of placing sound through it',()=>{
  const {E,game,calls,step,gather}=fixture();gather();game.evade.hdg=Math.PI/2;
  game.pow.solids.push({id:'thin-wall',x:4,z:1,hw:.012,hl:6,yMin:0,yMax:3});assert(E.throwStone(game));step(1,.25);
  const hit=E.state(game).impacts[0];assert.equal(hit.surface,'thin-wall');assert(hit.p[0]<4);assert(hit.p[0]>3.8);
  assert.equal(calls.filter(n=>n.kind==='stone-impact').length,1);assert(calls[0].p[0]<4);assert(!E.state(game).projectiles[0].p.some(n=>!Number.isFinite(n)));
});

test('upward flight respects a physical ceiling and earliest surfaces win collision ordering',()=>{
  const {E,game,step,gather}=fixture();gather();game.evade.hdg=Math.PI/2;game.evade.look=1.2;
  game.pow.solids.push({id:'far',x:5,z:1,hw:.1,hl:8,yMin:0,yMax:8},{id:'ceiling',x:0,z:0,hw:8,hl:8,yMin:2.3,yMax:2.4});
  assert(E.throwStone(game));step(.3);const hit=E.state(game).impacts[0];assert.equal(hit.surface,'ceiling');assert(hit.p[1]<2.3);
});

test('a roof throw lands on supported roof elevation rather than the lower terrain plane',()=>{
  const {E,game,step,gather}=fixture();gather();game.pow.surfaces=[{minX:-5,maxX:5,minZ:-5,maxZ:5,y:3.4}];game.evade.p.splice(0,3,0,3.4,0);game.evade.look=-.85;
  assert(E.throwStone(game));step(2);const impact=E.state(game).impacts[0];assert.equal(impact.kind,'floor');assert(impact.p[1]>=3.4 && impact.p[1]<3.5);
});

test('an actual guard hears the remote impact, investigates its location and follows a collision-safe path',()=>{
  const {P,E,game,step,gather}=fixture();gather();game.evade.hdg=Math.PI/2;
  const guard=P.AI.makeActor({id:'hear-landing',p:[9,0,4],route:[[9,0,4]],face:Math.PI/2,dwell:50});game.evade.searchers=[guard];game.pow.actors=game.evade.searchers;
  assert(E.throwStone(game));step(.5);assert.equal(guard.state,'patrol','no remote investigation before the physical landing');
  step(.5);assert.equal(guard.state,'investigate');const hit=E.state(game).impacts[0];assert.deepEqual(Array.from(guard.lastNoise),Array.from(hit.p));
  assert.deepEqual(Array.from(guard.investigateOrigin),Array.from(hit.p));assert(Math.hypot(hit.p[0]-game.evade.p[0],hit.p[2]-game.evade.p[2])>5);
  step(1);assert(guard.p[2]<4,'the guard actually walks toward the remembered impact');assert(guard.path.every(p=>!P.blocked(game,p[0],p[2],.33,p[1])));
});

test('physical cell walls keep a landing inside, while an actual throw through the opened door lures a guard to its remote impact',()=>{
  for(const open of [false,true]){
    const {P,E,game,step}=fixture(false),b=game.pow.base;
    game.evade.p.splice(0,3,b[0],b[1],b[2]-.15);game.evade.hdg=Math.PI;assert(P.interact(game,'episode-pebbles'));
    if(open){game.evade.p.splice(0,3,b[0],b[1],b[2]-.8);assert(P.interact(game,'bunk-bracket'));game.evade.p.splice(0,3,b[0],b[1],b[2]-3.0);game.evade.hdg=0;assert(P.interact(game,'door-fitting'));}
    game.evade.p.splice(0,3,b[0]+.15,b[1],b[2]-2.25);game.evade.hdg=0;
    const p=[b[0]+2,b[1],b[2]-6],guard=P.AI.makeActor({id:'real-cell-listener',p,route:[p],face:Math.PI/2,dwell:100});game.evade.searchers=[guard];game.pow.actors=game.evade.searchers;
    assert(E.throwStone(game));step(.8);const landed=E.state(game).impacts[0];assert(landed);
    assert.equal(guard.state,'investigate');
    if(open){assert(landed.p[2]<b[2]-4);assert.deepEqual(Array.from(guard.investigateOrigin),Array.from(landed.p));}
    else{assert(landed.p[2]>b[2]-3.6);assert.equal(landed.surface,'cell-door');assert.deepEqual(Array.from(guard.investigateOrigin),[b[0],b[1],b[2]-5]);}
  }
});

test('mid-flight saves restore inventory, cooldown and physical trajectory without replaying impact sounds',()=>{
  const a=fixture(),b=fixture();a.gather();a.game.evade.hdg=Math.PI/2;assert(a.E.throwStone(a.game));a.step(.3);
  const saved=a.E.snapshot(a.game),json=JSON.stringify(saved);b.game.pow.time=a.game.pow.time;b.E.enter(b.game,JSON.parse(json));
  assert.equal(b.E.state(b.game).stones,2);assert.equal(b.E.state(b.game).nextThrowAt,saved.nextThrowAt);assert.equal(b.calls.length,0);
  a.step(.8);b.step(.8);assert.deepEqual(Array.from(a.E.state(a.game).impacts[0].p),Array.from(b.E.state(b.game).impacts[0].p));assert.equal(b.calls.filter(n=>n.kind==='stone-impact').length,1);
  const landed=b.E.snapshot(b.game);b.E.enter(b.game,landed);b.step(7);assert.equal(b.calls.filter(n=>n.kind==='stone-impact').length,1,'settled snapshots never replay the landing');assert(!b.game.campGeo.some(q=>q.id==='episode-stone:1'));
});

test('throwing is blocked in dialogs, traversal, busy hands and non-episode chapters without spending stones',()=>{
  const {P,E,game,gather}=fixture();gather();for(const key of ['modalOpen','complete']){game.pow[key]=true;assert(!E.throwStone(game));game.pow[key]=false;}
  game.pow.traversal={kind:'descent'};assert(!E.throwStone(game));game.pow.traversal=null;
  P.EpisodeActions={busy:()=>true};assert(!E.throwStone(game));delete P.EpisodeActions;
  game.pow.stage='solitary';assert(!E.throwStone(game));assert.equal(E.state(game).stones,3);
});

test('fresh door evidence is noticed only by a nearby facing guard with a real unobstructed sightline',()=>{
  const {P,E,game,step}=fixture(false),b=game.pow.base;
  game.evade.p.splice(0,3,b[0],b[1],b[2]-.8);assert(P.interact(game,'bunk-bracket'));
  game.evade.p.splice(0,3,b[0],b[1],b[2]-3.0);game.evade.hdg=0;assert(P.interact(game,'door-fitting'));
  const guard=P.AI.makeActor({id:'inspect-lock',p:[b[0]+1.7,b[1],b[2]-5.5],route:[[b[0]+1.7,b[1],b[2]-5.5]],face:0,dwell:100});game.evade.searchers=[guard];game.pow.actors=game.evade.searchers;
  E.step(game,.1);assert(!guard.evidenceFound,'a guard looking away cannot know the fitting was disturbed');
  guard.face=Math.atan2(.30-1.7,-(-3.58+5.5));game.pow.solids.push({id:'sight-screen',x:b[0]+1.3,z:b[2]-4.3,hw:1,hl:.05,yMin:b[1],yMax:b[1]+3});E.step(game,.1);assert(!guard.evidenceFound);
  game.pow.solids.find(q=>q.id==='sight-screen').active=false;E.step(game,.1);assert(guard.evidenceFound);assert.equal(guard.state,'investigate');
  assert.deepEqual(Array.from(guard.goal),[b[0],b[1],b[2]-5.1]);assert.equal(E.state(game).tamper.seenBy.length,1);assert(!game.pow.complete);
});

test('concealing actual fitting marks preserves the open physical doorway and prior guard memory',()=>{
  const {P,E,game}=fixture(false),b=game.pow.base;
  game.evade.p.splice(0,3,b[0],b[1],b[2]-.8);P.interact(game,'bunk-bracket');game.evade.p.splice(0,3,b[0],b[1],b[2]-3.0);game.evade.hdg=0;P.interact(game,'door-fitting');E.step(game,.1);
  const guard=P.AI.makeActor({id:'already-saw',p:[b[0]+1.7,b[1],b[2]-5.5],face:Math.atan2(.30-1.7,-(-3.58+5.5))});game.evade.searchers=[guard];game.pow.actors=game.evade.searchers;E.step(game,.1);
  assert(P.interact(game,'episode-conceal-fitting'));assert(E.state(game).tamper.concealed);assert(game.pow.flags.doorOpen);assert(!game.pow.solids.find(s=>s.id==='cell-door').active);assert.equal(guard.state,'investigate');assert(guard.evidenceFound);
  const snap=E.snapshot(game);E.enter(game,snap);assert(E.state(game).tamper.concealed);assert(!game.campGeo.some(q=>q.id==='episode-door-evidence'));
});

test('scene lamp switch registration uses world-space physical positions and leaves unrelated lights intact',()=>{
  const {P,E,game}=fixture();const lamps=[{id:'test-lamp',on:true,switchPosition:[1.3,1.05,.2]},{id:'remote-lamp',on:true,switchPosition:[15,1.05,15]}];
  P.EpisodeScene={renderState:()=>({lights:lamps}),switchLamp(g,id){const l=lamps.find(l=>l.id===id);if(!l)return false;const e=g.evade;if(Math.hypot(e.p[0]-l.switchPosition[0],e.p[2]-l.switchPosition[2])>4 || !P.los(g,[e.p[0],e.p[1]+1.5,e.p[2]],l.switchPosition))return false;l.on=!l.on;return true;}};
  E.decorate(game);game.evade.hdg=0;assert(P.interact(game,'episode-lamp:test-lamp'));assert(!lamps[0].on);assert(lamps[1].on);
  assert(!P.interact(game,'episode-lamp:remote-lamp'));assert(lamps[1].on);assert(!game.pow.complete);
  assert(P.interact(game,'episode-lamp:test-lamp'));assert(lamps[0].on,'an extinguished local lamp can be switched back on');
});

test('hand and impact events accompany real launch/landing exactly once and never create extra gameplay noise',()=>{
  const {P,E,game,calls,step,gather}=fixture();gather();game.evade.hdg=Math.PI/2;const events=[];
  P.EpisodeActions={busy:()=>false,event(g,kind,p){events.push({kind,p:p && Array.from(p)});}};
  assert(E.throwStone(game));assert.equal(events.length,1);assert.equal(events[0].kind,'throw');assert.equal(events[0].p.length,3);assert.equal(calls.length,0);
  assert(!E.throwStone(game));assert.equal(events.length,1);step(1.2);
  assert.equal(events.filter(e=>e.kind==='pebble-impact').length,1);assert.deepEqual(events[1].p,Array.from(E.state(game).impacts[0].p));assert.equal(calls.filter(n=>n.kind==='stone-impact').length,1);
});

test('dark local evidence stays unseen at a distance while a null or absent scene profile is safe',()=>{
  const {P,E,game}=fixture(false),b=game.pow.base;
  game.evade.p.splice(0,3,b[0],b[1],b[2]-.8);P.interact(game,'bunk-bracket');game.evade.p.splice(0,3,b[0],b[1],b[2]-3.0);game.evade.hdg=0;P.interact(game,'door-fitting');
  const guard=P.AI.makeActor({id:'night-evidence',p:[b[0]+1.7,b[1],b[2]-5.5],face:Math.atan2(.30-1.7,-(-3.58+5.5))});game.evade.searchers=[guard];game.pow.actors=game.evade.searchers;
  P.EpisodeScene={renderState:()=>null,lightAt:()=>.01};assert.doesNotThrow(()=>E.decorate(game));E.step(game,.1);assert(!guard.evidenceFound);
  P.EpisodeScene.lightAt=()=>.9;E.step(game,.1);assert(guard.evidenceFound,'illumination and local LOS permit a close inspection');
});
