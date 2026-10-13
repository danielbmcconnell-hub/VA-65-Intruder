'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),test=require('node:test');

// Pure simulation uses the production movement, collision, timed interactions,
// hearing and patrol AI. No guard is teleported, frozen, disabled or replaced.
function fixture() {
  const storage=new Map(),document={body:{classList:{toggle(){}}},getElementById(){return null;},pointerLockElement:null,activeElement:null};
  const window={document},sandbox={window,document,Date,console};vm.createContext(sandbox);
  for(const name of ['core.js','ai.js','regular-confinement.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow',name),'utf8'),sandbox);
  const P=window.POW;P.mountUI=()=>{};P.updateUI=()=>{};P.activate=()=>{};
  P.ctx={terrainH:()=>0,Store:{get:(k,v)=>storage.has(k)?storage.get(k):v,set:(k,v)=>storage.set(k,JSON.parse(JSON.stringify(v)))}};
  P.Captivity={enter(){},advance(g,n){const c=g.pow.captivity;c.minute+=n;while(c.minute>=1440){c.minute-=1440;g.pow.day++;}}};
  const game={ac:{p:[0,2,0]},app:{keys:{},gctl:{},set:{sound:0}},world:{_cells:new Map()},setHour(){}};
  P.begin(game,'regular');game.pow.day=29;game.pow.captivity={captureDay:1,minute:970,rewards:{},tap:{received:0,sent:0}};
  const R=P.RegularConfinement,guards=game.evade.searchers.slice(),audit={ticks:0,holds:0,maxSuspicion:0,wait:0,walk:0,start:guards.map(g=>Array.from(g.p)),capture:false};
  function tick(dt=.1) {
    P.tick(game,dt);audit.ticks++;audit.maxSuspicion=Math.max(audit.maxSuspicion,game.evade.sus || 0);
    if(game.pow.stage==='solitary'){audit.capture=true;throw new Error('Actual capture: '+JSON.stringify({feet:game.evade.p,time:game.pow.time,guards:guards.map(g=>({id:g.id,p:g.p,state:g.state,sus:g.sus,visible:g.visible}))}));}
    if(game.pow.stage==='regular')for(const g of guards)assert(!P.blocked(game,g.p[0],g.p[2],.29,g.p[1]),'normal guard remains outside solid '+g.id);
  }
  function wait(seconds){for(let i=0;i<Math.ceil(seconds*10);i++)tick();audit.wait+=seconds;}
  function walk(x,z,options={}) {
    const b=game.pow.base,tx=b[0]+x,tz=b[2]+z;game.app.keys.KeyW=1;game.app.keys.KeyC=options.crouch?1:0;game.app.keys.ShiftLeft=options.run?1:0;
    let count=0;
    try{for(;count<2400;count++){
      if(game.pow.stage!=='regular')break;
      const dx=tx-game.evade.p[0],dz=tz-game.evade.p[2],d=Math.hypot(dx,dz);if(d<.13)break;
      game.evade.hdg=Math.atan2(dx,-dz);const speed=1.8*(options.crouch?.49:options.run?1.9:1)*(game.pow.stats.fatigue>80?.7:1)*(game.pow.stats.physical<40?.7:1);tick(Math.min(.1,d/speed));
    }}finally{game.app.keys.KeyW=0;game.app.keys.ShiftLeft=0;}
    assert(count<2400,'physical route reached '+x+','+z+' without tunneling: '+JSON.stringify({feet:game.evade.p,stage:game.pow.stage}));audit.walk+=count*.1;
  }
  function hold(id,seconds) {
    const q=game.pow.objects.find(o=>o.id===id);assert(q,'real interactable '+id);game.evade.hdg=Math.atan2(q.p[0]-game.evade.p[0],-(q.p[2]-game.evade.p[2]));
    game.app.keys.KeyF=1;try{for(let i=0;i<Math.ceil((seconds || q.hold+.2)*10);i++)tick();}finally{game.app.keys.KeyF=0;tick();}audit.holds++;
  }
  function intro(cloth) {
    if(cloth){walk(1.25,-.8);hold('regular-cloth');assert(R.state(game).inventory.cloth);}
    walk(.62,-2.05);hold('regular-observe');assert(R.state(game).flags.observed);
    walk(0,-2.05);hold('regular-cell-door');assert(R.state(game).flags.cellOpen);
    walk(0,-7.8);walk(-6.25,-7.8);walk(-6.25,-16.6);walk(-6.85,-17.45);
    // Wait on actual distance/line of sight, not a forced guard state.
    let waited=0;while(R.guardNearby(game,5.5) && waited<100){wait(.2);waited+=.2;}
    assert(waited<100,'the normal yard patrol provides a tool-work interval');
    game.app.keys.KeyC=1;hold('regular-trough-tool');assert(R.state(game).inventory.tool);
  }
  function quiet() {
    intro(true);walk(-7.1,-23.05,{crouch:true});walk(-2,-23.05,{crouch:true});
    for(let i=0;i<4;i++){hold('regular-drain-panel');assert.equal(R.state(game).drainFasteners,i+1);}
    assert(R.state(game).flags.drainOpen);assert(!R.state(game).flags.drainGateOpen);
    walk(-2,-25.2,{crouch:true});assert.equal(R.state(game).checkpoint,'regular-washing-passage');
    walk(-2,-33.05,{crouch:true});hold('regular-drain-gate');assert(!R.state(game).escaped,'opening a real barrier is not freedom');
    walk(-2,-35.25,{crouch:true});assert.equal(game.pow.stage,'hanoi');assert.equal(game.pow.regular.escapeRoute,'covered-washing-passage');
    return audit;
  }
  function fast() {
    intro(false);game.app.keys.KeyC=0;walk(-6.85,-10);walk(8.75,-10);walk(8.75,-15.6);
    const watch=guards.find(a=>a.id==='regular-workshop');let waited=0;
    while(!(watch.p[0]>19 && watch.p[2]>-15 && !watch.onPost) && waited<150){wait(.2);waited+=.2;}
    assert(waited<150,'actual workshop patrol provides a posting interval');hold('regular-workshop-lock');assert(R.state(game).flags.workshopOpen);
    walk(11,-15.6,{run:true});walk(14.5,-15.6,{run:true});walk(14.5,-18.6,{run:true});walk(19,-18.7,{run:true});hold('regular-hatch-force');assert(R.state(game).flags.hatchForced);
    walk(20,-21.5,{run:true});walk(20,-29.85,{run:true});hold('regular-exit-gate');walk(20,-32.25,{run:true});assert.equal(game.pow.stage,'hanoi');return audit;
  }
  return {P,R,game,guards,audit,tick,wait,walk,hold,intro,quiet,fast,storage};
}

test('quiet covered route completes through real W/C/F play with every normal patrol active',()=>{
  const f=fixture(),audit=f.quiet();assert(!audit.capture);assert(audit.holds>=9);assert(audit.walk>30);
  assert(f.guards.some((g,i)=>Math.hypot(g.p[0]-audit.start[i][0],g.p[2]-audit.start[i][2])>2),'patrols actually walk during the complete route');
  assert(!f.game.pow.complete);assert(f.game.pow.flags.regularEscape);assert(!f.game.pow.regular.flags.workshopOpen);
});

test('faster forced workshop route completes actual movement with normal investigating patrols',()=>{
  const f=fixture(),audit=f.fast();assert(!audit.capture);assert.equal(f.game.pow.regular.escapeRoute,'forced-workshop-hatch');assert(!f.game.pow.complete);
});

test('new quiet barriers, cloth and partial fasteners round-trip through saved checkpoints',()=>{
  const {P,R,game}=fixture(),s=game.pow,r=R.state(game);r.inventory.cloth=true;r.inventory.tool=true;r.drainFasteners=2;R.build(game);
  const snap=P.save(game);P.begin(game,'regular',snap);assert.equal(game.pow.regular.drainFasteners,2);assert(game.pow.regular.inventory.cloth);
  assert(P.blocked(game,-2,-24,.32,s.base[1]));assert(P.blocked(game,-2,-34.2,.32,s.base[1]));
  game.pow.regular.flags.drainOpen=true;game.pow.regular.flags.drainGateOpen=true;R.build(game);const open=P.save(game);P.begin(game,'regular',open);
  assert(!P.blocked(game,-2,-24,.32,s.base[1]));assert(!P.blocked(game,-2,-34.2,.32,s.base[1]));assert(!game.pow.complete);
});

test('fresh transfer after recapture confiscates cloth/tool and restores both alternate-route locks',()=>{
  const {R,game}=fixture(),r=R.state(game);r.inventory.tool=true;r.inventory.cloth=true;r.flags.drainOpen=true;r.flags.drainGateOpen=true;r.drainFasteners=4;game.pow.flags.recaptures=1;
  R.enter(game);const reset=R.state(game);assert(!reset.inventory.tool);assert(!reset.inventory.cloth);assert(!reset.flags.drainOpen);assert(!reset.flags.drainGateOpen);assert.equal(reset.drainFasteners,0);
});

test('covered-passage walls and both closed barriers resist long swept moves; clues do not open locks',()=>{
  const {P,R,game}=fixture(),b=game.pow.base;R.observe(game);assert(!R.state(game).flags.drainOpen);
  game.evade.p.splice(0,3,b[0]-2,b[1],b[2]-23);P.move(game,game.evade,0,-20,.32);assert(game.evade.p[2]>b[2]-23.6);
  R.state(game).flags.drainOpen=true;R.build(game);P.move(game,game.evade,0,-20,.32);assert(game.evade.p[2]>b[2]-34);assert(!P.blocked(game,game.evade.p[0],game.evade.p[2],.32,b[1]));
  assert(P.blocked(game,b[0]-3.4,b[2]-30,.32,b[1]));assert(P.blocked(game,b[0]-.6,b[2]-30,.32,b[1]));assert(!game.pow.complete);
});

test('forcing a real hatch emits an investigating sound and changes geometry without a capture roll or outcome menu',()=>{
  const {P,R,game}=fixture(),r=R.state(game);r.inventory.tool=true;r.flags.workshopOpen=true;R.build(game);
  game.evade.p.splice(0,3,19,game.pow.base[1],-18.8);assert(R.forceHatch(game));assert(r.flags.hatchForced);assert(r.flags.hatchOpen);assert(!r.flags.gateOpen);
  assert(game.pow.noises.some(n=>n.kind==='forced service-hatch hinge' && n.loudness===2.2));
  P.AI.step(game,.1);assert(game.evade.searchers.some(g=>g.state==='investigate' || g.state==='pursuit'));
  assert.equal(game.pow.stage,'regular');assert(!game.pow.complete);
});
