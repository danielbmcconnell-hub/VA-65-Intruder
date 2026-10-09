'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

// The caller owns the browser and development server. This file never launches either.
// Physics and interactions use real Game.stepEvade and keyboard holds. Guard duty homes
// are fixture-seeded away from the happy route after live patrol behavior is checked.
module.exports=async function main(browser,target,evidenceDir) {
  const out=path.join(evidenceDir,'pow-prison');fs.mkdirSync(out,{recursive:true});
  const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
  const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
  const record=(name,actual)=>{assert.ok(actual.passed,name);results.push({name,status:'passed',actual});};
  try {
    await page.addInitScript(()=>{localStorage.setItem('a6_set',JSON.stringify({quality:0,sound:0,voices:0,mouse:0,seat:0,assist:1,sens:1}));localStorage.setItem('a6_sawkeys','1');});
    await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>window.App && window.POW);
    await page.locator('#bootGo').click();
    await page.locator('#powChapter button').filter({hasText:'Enter the prison'}).click();
    await page.waitForFunction(()=>App.game?.pow?.stage==='cell' && document.getElementById('loader').style.display==='none',null,{timeout:90000});
    record('ready-room-enters-playable-prison',await page.evaluate(()=>({passed:App.game.phase==='evade' && App.game.pow.stage==='cell' && App.game.evade.frozen===0 && document.body.classList.contains('pow-active'),stage:App.game.pow.stage,feet:App.game.evade.p.slice(),solids:App.game.pow.solids.length,controlsVisible:!document.getElementById('powHUD').hidden})));
    // Stop only automatic RAF simulation; DOM game screen remains visible. Explicit
    // steps below exercise the real simulation and render methods without method stubs.
    await page.evaluate(()=>{App.screen='fixture';App.game.paused=false;for(const key of Object.keys(App.keys))App.keys[key]=0;App.gctl.pitch=0;App.gctl.roll=0;});
    const screenshot=async name=>{await page.evaluate(()=>{App.game.render(1/60);App.game.syncControls();});await page.screenshot({path:path.join(out,name+'.png')});};
    await screenshot('01-cell');
    record('guards-patrol-with-solid-collision',await page.evaluate(()=>{
      const g=App.game,positions=g.evade.searchers.map(a=>a.p.slice());
      for(let i=0;i<100;i++)g.stepEvade(.1);
      const moved=g.evade.searchers.some((a,i)=>Math.hypot(a.p[0]-positions[i][0],a.p[2]-positions[i][2])>.2);
      const clear=g.evade.searchers.every(a=>!POW.blocked(g,a.p[0],a.p[2],.30,a.p[1]));
      return {passed:moved && clear,count:g.evade.searchers.length,moved,clear,positions:g.evade.searchers.map(a=>({id:a.id,p:a.p.slice(),state:a.state}))};
    }));
    await screenshot('02-live-patrol');
    // Explicitly declared patrol fixture: keep genuine bodies, navigation, sight,
    // hearing and capture active, but assign ground duty away from the route.
    await page.evaluate(()=>{
      window.__powDutyFixture=function() {
        const g=App.game,s=g.pow,b=s.base;
        if(s.stage==='river')return;
        for(let i=0;i<g.evade.searchers.length;i++) {
          const a=g.evade.searchers[i],roof=a.p[1]>b[1]+2.5;
          if(roof) {a.home=a.p.slice();a.route=[a.p.slice()];a.schedule={cycle:100000,rounds:0,offset:1};a.face=0;}
          else {
            const local=s.stage==='hanoi'?[38+i*4,-60]:[-22+i*.5,-25];
            const p=[b[0]+local[0],b[1],b[2]+local[1]],q=[p[0]+2,p[1],p[2]-3];
            a.p=p;a.home=p.slice();a.route=[p.slice(),q];a.schedule={cycle:105,rounds:95,offset:i*3};a.face=0;
          }
          a.goal=a.route[0].slice();a.path=[];a.pathIndex=0;a.wp=0;a.state='patrol';a.seen=0;a.sus=0;a.lastKnown=null;a.dwellUntil=0;a.grab=0;
        }
        s.actors=g.evade.searchers;s.noises=[];s.aiFixtureStage=s.stage;
      };window.__powDutyFixture();
    });
    // Wall reproduction uses real held W from the real cell spawn, before unlocking.
    await page.keyboard.down('w');
    record('closed-door-stops-long-forward-walk',await page.evaluate(()=>{const g=App.game,b=g.pow.base;g.evade.hdg=0;for(let i=0;i<60;i++)g.stepEvade(.1);return {passed:g.evade.p[2]>b[2]-3.2 && g.pow.stage==='cell',feet:g.evade.p.slice(),base:b.slice()};}));
    await page.keyboard.up('w');
    // Return from the wall and approach each target by collision-checked walking.
    const walk=async(x,z,label)=>{
      await page.keyboard.down('w');
      const actual=await page.evaluate(({x,z})=>{
        const g=App.game,b=g.pow.base,tx=b[0]+x,tz=b[2]+z;let i=0;
        for(;i<2500;i++) {
          if(g.pow.stage==='river' && x>=91)break;
          if(g.pow.stage==='solitary' || g.pow.complete)throw new Error('Unexpected capture/conclusion while physically walking');
          if(g.pow.aiFixtureStage!==g.pow.stage && g.pow.stage!=='river')window.__powDutyFixture();
          const dx=tx-g.evade.p[0],dz=tz-g.evade.p[2],d=Math.hypot(dx,dz);if(d<.075)break;
          g.evade.hdg=Math.atan2(dx,-dz);g.stepEvade(Math.min(.1,d/(g.evade.crouch?1:2.05)));
        }
        const d=Math.hypot(tx-g.evade.p[0],tz-g.evade.p[2]);return {passed:d<.08 || g.pow.stage==='river' && x>=91,steps:i,distance:d,feet:g.evade.p.slice(),stage:g.pow.stage};
      },{x,z});
      await page.keyboard.up('w');record(label,actual);
    };
    const hold=async(seconds,heading=0)=>{
      await page.evaluate(h=>{App.game.evade.hdg=h;},heading);
      await page.keyboard.down('f');
      const actual=await page.evaluate(seconds=>{const g=App.game;for(let i=0;i<Math.ceil(seconds*10);i++)g.stepEvade(.1);return {stage:g.pow.stage,inventory:{...g.pow.inventory},flags:{...g.pow.flags},holding:g.pow.holding};},seconds);
      await page.keyboard.up('f');await page.evaluate(()=>App.game.stepEvade(.1));return actual;
    };
    await walk(-.80,.9,'walk-to-bunk');const bracket=await hold(1.7);record('held-f-finds-concealed-bracket',{passed:!!bracket.inventory.bracket,...bracket});
    await walk(.3,-2.68,'walk-to-door-fitting');const early=await hold(3);record('short-hold-keeps-door-locked',{passed:!early.flags.doorOpen,...early});
    const door=await hold(7.3);record('full-hold-opens-real-door',{passed:!!door.flags.doorOpen,...door});
    await page.keyboard.down('c'); // quiet physical route, using genuine crouch mechanics
    await walk(.3,-5.6,'walk-through-open-door-into-corridor');
    await walk(14,-5.6,'walk-right-through-corridor');
    await walk(14,-22.4,'walk-up-stairs-onto-roof');
    record('roof-feet-and-render-camera-have-real-elevation',await page.evaluate(()=>{const g=App.game;g.render(1/60);const feet=g.evade.p[1],eye=g.rend.eye[1],base=g.pow.base[1];return {passed:feet>base+3.35 && eye>feet+1 && eye<feet+1.3,base,feet,eye};}));
    await screenshot('03-rooftop');
    record('roof-rope-visible-and-live-objective-points-to-it',await page.evaluate(()=>{
      const g=App.game,geo=g.campGeo;
      POW.updateUI(g);
      const coilPieces=geo.filter(q=>q.id.startsWith('roof-rope:loop-')).length;
      const signal=geo.find(q=>q.id==='roof-rope:marker-bar');
      const objective=POW.ui.objective.textContent;
      const interactable=g.pow.objects.find(o=>o.id==='roof-rope');
      return {passed:coilPieces>=12 && !!signal && signal.p[1]>g.pow.base[1]+4.7 && objective.includes('FIND ROPE') && objective.includes('m') && !!interactable && interactable.radius>=2.5 && interactable.hold<=1,coilPieces,signal:signal?.p,objective,reach:interactable?.radius};
    }));
    await walk(21,-22,'walk-to-rope-bundle');const rope=await hold(1.6);record('held-f-collects-rope',{passed:!!rope.inventory.rope,...rope});
    record('rope-pickup-clears-marker-and-guides-to-descent',await page.evaluate(()=>{
      const g=App.game,geo=g.campGeo;
      POW.updateUI(g);
      const ropeMeshes=geo.filter(q=>q.id==='roof-rope' || q.id.startsWith('roof-rope:')).length;
      const hookMarker=geo.find(q=>q.id==='roof-hook:guide-bar');
      const objective=POW.ui.objective.textContent;
      return {passed:g.pow.inventory.rope && ropeMeshes===0 && !!hookMarker && objective.includes('ROPE COLLECTED') && objective.includes('HOOK'),ropeMeshes,hookMarker:hookMarker?.p,objective};
    }));
    record('checkpoint-restores-position-height-and-patrol-memory',await page.evaluate(()=>{const g=App.game,snapshot=POW.save(g),before=JSON.stringify(snapshot.ai);g.evade.look=.8;g.evade.p[0]+=.12;POW.begin(g,snapshot.stage,snapshot);const same=JSON.stringify(POW.AI.snapshot(g))===before;g.pow.aiFixtureStage=g.pow.stage;return {passed:same && Math.hypot(g.evade.p[0]-snapshot.p[0],g.evade.p[2]-snapshot.p[2])<.001 && Math.abs(g.evade.p[1]-snapshot.p[1])<.001,stage:g.pow.stage,feet:g.evade.p.slice(),patrolRestored:same};}));
    // Resume releases controls; reinstate genuine held crouch and walk to parapet.
    await page.keyboard.up('c');await page.keyboard.down('c');
    await walk(25.25,-24,'walk-across-roof-to-east-parapet');
    await hold(2.5,Math.PI/2);
    record('rope-traversal-physically-descends-outside-wall',await page.evaluate(()=>{const g=App.game;for(let i=0;i<45;i++)g.stepEvade(.1);return {passed:g.pow.stage==='hanoi' && g.pow.flags.outside && Math.abs(g.evade.p[1]-g.pow.base[1])<.01,stage:g.pow.stage,feet:g.evade.p.slice(),outside:g.pow.flags.outside};}));
    await page.evaluate(()=>window.__powDutyFixture());
    await screenshot('04-hanoi-street');
    await walk(92,-24,'walk-night-street-to-real-river-boundary');
    record('river-reached-without-stage-teleport',await page.evaluate(()=>({passed:App.game.pow.stage==='river',stage:App.game.pow.stage,feet:App.game.evade.p.slice(),riverModulePresent:!!App.game.pow.river})));
    await screenshot('05-riverbank');
    await page.keyboard.up('c');
    assert.equal(errors.length,0,'browser JavaScript errors');
    const report={scope:'Fixture-assisted actual browser/custom WebGL checks. Ready Room launch, real keyboard holds, collision-checked movement and live AI are exercised. Ground patrol duty homes are seeded away from the happy route; roof watch is placed on an off-duty shift. No gameplay stage or player route destination is teleported. Not a human playthrough or physical iPhone Safari validation.',target,results,browserErrors:errors,screenshots:['01-cell','02-live-patrol','03-rooftop','04-hanoi-street','05-riverbank'].map(n=>'pow-prison/'+n+'.png')};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');return report;
  } finally {await page.context().close();}
};
