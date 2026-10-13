'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');

// Actual WebGL renders and production simulation on two Chromium layouts.
// Explicit tick steering controls the player only. All original guard schedules,
// hearing, sight, movement and capture remain active throughout both routes.
module.exports=async function(browser,target,evidenceDir){
  const out=path.join(evidenceDir,'pow-m22-escape');await fs.mkdir(out,{recursive:true});
  const checks=[],screenshots=[],errors=[];
  for(const layout of [{name:'desktop',viewport:{width:1100,height:650},hasTouch:false,deviceScaleFactor:1},{name:'iphone-layout-chromium',viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:3}]){
    const context=await browser.newContext(layout),page=await context.newPage(),touchSession=layout.hasTouch?await context.newCDPSession(page):null;page.on('pageerror',e=>errors.push({layout:layout.name,error:e.message}));
    const record=(name,actual)=>checks.push({name:layout.name+': '+name,passed:true,actual});
    async function tick(n){return page.evaluate(n=>{const g=App.game;for(let i=0;i<n;i++){g.stepEvade(.1);if(g.pow.stage==='solitary')throw new Error('Captured by actual patrol during route: '+JSON.stringify({time:g.pow.time,feet:g.evade.p,feedback:g.pow.captivity?.feedback}));}return {stage:g.pow.stage,feet:g.evade.p.slice(),time:g.pow.time};},n);}
    async function walk(x,z,{crouch=false,run=false}={}){
      if(crouch)await page.keyboard.down('c');else await page.keyboard.up('c');
      if(run)await page.keyboard.down('Shift');else await page.keyboard.up('Shift');
      await page.keyboard.down('w');
      try{return await page.evaluate(({x,z})=>{
        const g=App.game,b=g.pow.base,tx=b[0]+x,tz=b[2]+z;let n=0;
        for(;n<2400;n++){
          if(g.pow.stage==='hanoi')break;if(g.pow.stage==='solitary')throw new Error('Actual guard captured player during walking');
          const dx=tx-g.evade.p[0],dz=tz-g.evade.p[2],d=Math.hypot(dx,dz);if(d<.13)break;
          g.evade.hdg=Math.atan2(dx,-dz);const speed=1.8*(g.evade.crouch?.49:App.keys.ShiftLeft || App.keys.ShiftRight?1.9:1)*(g.pow.stats.fatigue>80?.7:1)*(g.pow.stats.physical<40?.7:1);g.stepEvade(Math.min(.1,d/speed));
          if(g.pow.stage==='regular')for(const a of g.evade.searchers)if(POW.blocked(g,a.p[0],a.p[2],.29,a.p[1]))throw new Error('Guard intersected a solid: '+a.id);
        }
        if(n===2400)throw new Error('Walking route blocked: '+JSON.stringify({target:[x,z],feet:g.evade.p,time:g.pow.time,guards:g.evade.searchers.map(a=>({id:a.id,p:a.p,state:a.state}))}));
        return {stage:g.pow.stage,steps:n,feet:g.evade.p.slice(),seconds:n*.1};
      },{x,z});}finally{await page.keyboard.up('w');await page.keyboard.up('Shift');}
    }
    async function hold(id){
      const q=await page.evaluate(id=>{const g=App.game,o=g.pow.objects.find(q=>q.id===id);if(!o)throw new Error('Missing actual object '+id);g.evade.hdg=Math.atan2(o.p[0]-g.evade.p[0],-(o.p[2]-g.evade.p[2]));return {id,hold:o.hold || .2};},id);
      if(touchSession){
        const pos=await page.locator('#powHUD .pow-context-controls button:first-child').evaluate(n=>{const b=n.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};});
        await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:11,...pos,radiusX:7,radiusY:7,force:1}]});
      }else await page.keyboard.down('f');
      let initialFocus;
      try{await tick(1);initialFocus=await page.evaluate(()=>App.game.pow.focus?.id);await tick(Math.ceil((q.hold+.2)*10)-1);}
      finally{if(touchSession)await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('f');await tick(1);}
      const actual=await page.evaluate(()=>({stage:App.game.pow.stage,regular:JSON.parse(JSON.stringify(App.game.pow.regular)),focus:App.game.pow.focus?.id}));
      assert.equal(initialFocus,id,'Held keyboard/touch must reach the actual intended world object');return actual;
    }
    async function screenshot(name){await page.evaluate(()=>{App.game.render(1/60);App.game.syncControls();});const file=layout.name+'-'+name+'.png';await page.screenshot({path:path.join(out,file)});screenshots.push('pow-m22-escape/'+file);}
    async function begin(){
      await page.evaluate(()=>{POW.begin(App.game,'regular');if(POW.Guidance?.skip)POW.Guidance.skip(App.game);App.screen='fixture';App.game.paused=false;for(const key of Object.keys(App.keys))App.keys[key]=0;App.gctl.pitch=App.gctl.roll=0;window.__m22InitialGuards=App.game.evade.searchers.map(a=>({id:a.id,p:a.p.slice(),schedule:JSON.parse(JSON.stringify(a.schedule))}));});
    }
    async function intro(cloth){
      if(cloth){await walk(1.25,-.8);const actual=await hold('regular-cloth');assert(actual.regular.inventory.cloth);}
      await walk(.62,-2.05);const watched=await hold('regular-observe');assert(watched.regular.flags.observed);
      await walk(0,-2.05);const door=await hold('regular-cell-door');assert(door.regular.flags.cellOpen);
      await walk(0,-7.8);await walk(-6.25,-7.8);await walk(-6.25,-16.6);await walk(-6.85,-17.45);
      const waited=await page.evaluate(()=>{const g=App.game;let n=0;for(;n<1000 && POW.RegularConfinement.guardNearby(g,5.5);n++){g.stepEvade(.1);if(g.pow.stage==='solitary')throw new Error('Actual capture while observing trough routine');}if(n===1000)throw new Error('Normal patrol offers no trough work interval');return n*.1;});
      await page.keyboard.down('c');const tool=await hold('regular-trough-tool');assert(tool.regular.inventory.tool);return waited;
    }
    try{
      await page.addInitScript(()=>{localStorage.setItem('a6_set',JSON.stringify({quality:0,sound:0,voices:0,mouse:0,seat:0,assist:1,sens:1}));localStorage.setItem('a6_sawkeys','1');});
      await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForFunction(()=>window.App && window.POW?.RegularConfinement);
      await page.evaluate(()=>App.startPOW());await page.waitForFunction(()=>App.game?.pow && document.getElementById('loader').style.display==='none',null,{timeout:90000});
      await begin();const waited=await intro(true);await walk(-7.1,-23.05,{crouch:true});
      await page.evaluate(()=>{const g=App.game;g.evade.hdg=Math.PI/2;g.evade.pitchCmd=g.evade.look=0;});await screenshot('01-normal-patrol-washing-screen');
      await walk(-2,-23.05,{crouch:true});
      for(let i=0;i<4;i++){const actual=await hold('regular-drain-panel');assert.equal(actual.regular.drainFasteners,i+1);assert.equal(actual.regular.flags.drainOpen,i===3);}
      record('four discrete cloth-muffled fasteners open a physical drain panel',{waitedSeconds:waited,normalPatrols:true,guardOverrides:false});
      await walk(-2,-25.2,{crouch:true});await screenshot('02-covered-passage-checkpoint');
      const restored=await page.evaluate(()=>{const g=App.game,snap=POW.save(g),ai=JSON.stringify(snap.ai);POW.begin(g,'regular',snap);return {checkpoint:g.pow.regular.checkpoint,cloth:g.pow.regular.inventory.cloth,fasteners:g.pow.regular.drainFasteners,aiRestored:JSON.stringify(POW.AI.snapshot(g))===ai,feet:g.evade.p.slice(),savedFeet:snap.p};});
      assert.equal(restored.checkpoint,'regular-washing-passage');assert(restored.aiRestored);assert.deepEqual(restored.feet,restored.savedFeet);record('covered passage restores real position, locks and normal patrol memory',restored);
      await walk(-2,-33.05,{crouch:true});const gate=await hold('regular-drain-gate');assert(gate.regular.flags.drainGateOpen);assert(!gate.regular.escaped);await screenshot('03-quiet-outside-grate');
      const escaped=await walk(-2,-35.25,{crouch:true});assert.equal(escaped.stage,'hanoi');await screenshot('04-quiet-route-hanoi');
      const outcome=await page.evaluate(()=>({route:App.game.pow.regular.escapeRoute,complete:!!App.game.pow.complete,oldWorkshopStillLocked:!App.game.pow.regular.flags.workshopOpen,patrolSeed:window.__m22InitialGuards,time:App.game.pow.time,glError:App.game.rend.gl.getError()}));
      assert.equal(outcome.route,'covered-washing-passage');assert(!outcome.complete);assert(outcome.oldWorkshopStillLocked);assert.equal(outcome.glError,0);record('complete quiet route uses actual keyboard movement and active normal guards',outcome);
      await page.keyboard.up('c');await begin();await intro(false);await page.keyboard.up('c');
      await walk(-6.85,-10);await walk(8.75,-10);await walk(8.75,-15.6);
      const posting=await page.evaluate(()=>{
        const g=App.game,guard=g.evade.searchers.find(a=>a.id==='regular-workshop'),b=g.pow.base;let n=0;
        for(;n<1500 && !(guard.p[0]-b[0]>19 && guard.p[2]-b[2]>-15 && !guard.onPost);n++){g.stepEvade(.1);if(g.pow.stage==='solitary')throw new Error('Captured while legitimately observing workshop duty');}
        if(n===1500)throw new Error('Actual workshop schedule supplies no usable bench interval');return {seconds:n*.1,guard:{id:guard.id,p:guard.p.slice(),state:guard.state,schedule:{...guard.schedule}}};
      });
      const workshop=await hold('regular-workshop-lock');assert(workshop.regular.flags.workshopOpen);
      await walk(11,-15.6,{run:true});
      await page.evaluate(()=>{const g=App.game,a=g.evade.searchers.find(q=>q.id==='regular-workshop');g.evade.hdg=Math.atan2(a.p[0]-g.evade.p[0],-(a.p[2]-g.evade.p[2]));g.evade.pitchCmd=g.evade.look=0;});await screenshot('05-normal-workshop-guard');
      await walk(14.5,-15.6,{run:true});await walk(14.5,-18.6,{run:true});await walk(19,-18.7,{run:true});
      const forced=await hold('regular-hatch-force');assert(forced.regular.flags.hatchForced);assert(!forced.regular.flags.gateOpen);
      const reactions=await page.evaluate(()=>App.game.evade.searchers.map(a=>({id:a.id,state:a.state,suspicion:a.sus,heard:a.lastNoise?.slice(),attention:a.attention})));
      assert(reactions.some(a=>['investigate','pursuit','search'].includes(a.state)),'normal guards react to the actual forced-hinge noise');
      record('fast physical hinge leverage triggers genuine normal guard investigation',{posting,reactions,touchHold:!!touchSession});await screenshot('05-forced-hatch-investigation');
      await walk(20,-21.5,{run:true});await walk(20,-29.85,{run:true});const outer=await hold('regular-exit-gate');assert(outer.regular.flags.gateOpen);assert(!outer.regular.escaped);
      await screenshot('06-fast-outer-gate');const fast=await walk(20,-32.25,{run:true});assert.equal(fast.stage,'hanoi');await screenshot('07-fast-route-hanoi');
      const fastOutcome=await page.evaluate(()=>({route:App.game.pow.regular.escapeRoute,complete:!!App.game.pow.complete,quietDrainStillLocked:!App.game.pow.regular.flags.drainOpen,glError:App.game.rend.gl.getError(),time:App.game.pow.time}));
      assert.equal(fastOutcome.route,'forced-workshop-hatch');assert(!fastOutcome.complete);assert(fastOutcome.quietDrainStillLocked);assert.equal(fastOutcome.glError,0);record('complete fast route evades investigating normal patrols through actual movement',fastOutcome);
      record('WebGL2 route screenshots render without JavaScript errors',{screenshots:screenshots.filter(q=>q.includes(layout.name)),physicalDevice:false});
    }finally{await context.close();}
  }
  assert.equal(errors.length,0,JSON.stringify(errors));return {suite:'m22-escape',passed:true,checks,screenshots,browserErrors:errors,scope:'Production collision, player keyboard holds, normal patrols and actual WebGL2 screenshots in desktop and simulated iPhone Chromium layouts. No physical Windows or Safari hardware test.'};
};
