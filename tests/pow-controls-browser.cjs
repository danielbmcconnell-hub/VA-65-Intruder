'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

// Chromium/CDP touch fixtures on a phone-sized, DPR 3 viewport. Not a physical
// iPhone Safari test. Browser launch and server lifetime belong to the caller.
module.exports=async function main(browser,target,evidenceDir) {
  const out=path.join(evidenceDir,'pow-controls');fs.mkdirSync(out,{recursive:true});
  const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
  const record=(name,actual)=>{assert.ok(actual.passed,name+": "+JSON.stringify(actual));results.push({name,status:'passed',actual});};
  try {
    await page.addInitScript(()=>{localStorage.setItem('a6_set',JSON.stringify({quality:0,sound:0,voices:0,mouse:0,seat:0,assist:1,sens:1}));localStorage.setItem('a6_sawkeys','1');});
    await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForFunction(()=>window.POW && window.App);
    await page.locator('#bootGo').tap();await page.locator('#powChapter button').filter({hasText:'Enter the prison'}).tap();
    await page.waitForFunction(()=>App.game?.pow?.stage==='cell' && document.getElementById('loader').style.display==='none',null,{timeout:90000});
    await page.evaluate(()=>{App.screen='fixture';App.game.paused=false;for(const key of Object.keys(App.keys))App.keys[key]=0;App.gctl.pitch=0;App.gctl.roll=0;});
    const session=await page.context().newCDPSession(page);
    const touch=async(type,points=[])=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,radiusX:7,radiusY:7,force:1}))});
    const center=async selector=>page.locator(selector).evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height};});
    const step=async seconds=>page.evaluate(seconds=>{for(let i=0;i<Math.ceil(seconds*20);i++)App.game.stepEvade(.05);},seconds);
    const render=async name=>{await page.evaluate(()=>{App.game.render(1/60);App.game.syncControls();});await page.screenshot({path:path.join(out,name+'.png')});};
    record('touch-only-survival-controls-hide-radio-and-weapons',await page.evaluate(()=>({passed:matchMedia('(pointer:coarse)').matches && getComputedStyle(document.getElementById('btnCrouch')).display!=='none' && ['weaponViewport','btnRadio','btnPistol','btnKnife','btnPunch','btnFire'].every(id=>getComputedStyle(document.getElementById(id)).display==='none'),dpr:devicePixelRatio,touch:matchMedia('(pointer:coarse)').matches})));
    const stick=await center('#stick'),start=await page.evaluate(()=>App.game.evade.p.slice());
    await touch('touchStart',[{x:stick.x,y:stick.y,id:1}]);await touch('touchMove',[{x:stick.x,y:stick.y-(stick.width/2-10)*.68,id:1}]);await step(1.5);
    record('real-touch-left-stick-translates-player',await page.evaluate(start=>({passed:Math.hypot(App.game.evade.p[0]-start[0],App.game.evade.p[2]-start[2])>.8 && App.gctl.pitch>.6,feet:App.game.evade.p.slice(),stick:{pitch:App.gctl.pitch,roll:App.gctl.roll},distance:Math.hypot(App.game.evade.p[0]-start[0],App.game.evade.p[2]-start[2])}),start));
    await touch('touchEnd');await step(.1);record('touch-release-stops-movement',await page.evaluate(()=>({passed:App.gctl.pitch===0 && App.gctl.roll===0 && !App.game.evade.moving,pitch:App.gctl.pitch,roll:App.gctl.roll})));
    const beforeLook=await page.evaluate(()=>({heading:App.game.evade.hdg,look:App.game.evade.look}));
    await touch('touchStart',[{x:490,y:165,id:2}]);await touch('touchMove',[{x:550,y:125,id:2}]);await touch('touchEnd');await step(.1);
    record('real-touch-right-drag-turns-and-looks-up',await page.evaluate(before=>({passed:Math.abs(App.game.evade.hdg-before.heading)>.2 && App.game.evade.look-before.look>.15,heading:App.game.evade.hdg,look:App.game.evade.look}),beforeLook));
    const crouch=await center('#btnCrouch');await touch('touchStart',[{x:crouch.x,y:crouch.y,id:3}]);await step(.2);
    record('real-touch-crouch-lowers-rendered-camera',await page.evaluate(()=>{const g=App.game;g.render(1/60);return {passed:g.evade.crouch && g.rend.eye[1]-g.evade.p[1]>1 && g.rend.eye[1]-g.evade.p[1]<1.3,crouch:g.evade.crouch,eyeHeight:g.rend.eye[1]-g.evade.p[1]};}));
    await touch('touchEnd');await step(.1);await render('01-touch-cell');
    // Move through real solids to the bunk rather than assigning an objective flag.
    await page.evaluate(()=>{const g=App.game,b=g.pow.base;POW.move(g,g.evade,b[0]-.8-g.evade.p[0],b[2]+.9-g.evade.p[2],.32);g.evade.hdg=0;g.stepEvade(.1);POW.updateUI(g);});
    const interact=await center('#powHUD .pow-context-controls button:first-child');
    await touch('touchStart',[{x:interact.x,y:interact.y,id:4}]);await step(.7);
    record('real-touch-interaction-shows-partial-hold',await page.evaluate(()=>({passed:!!App.game.pow.holding && App.game.pow.holding.t>.5 && !App.game.pow.inventory.bracket && POW.ui.progress.value>0,hold:App.game.pow.holding,progress:POW.ui.progress.value})));
    await step(1);await touch('touchEnd');await step(.1);
    record('real-touch-full-hold-collects-concealed-bracket',await page.evaluate(()=>({passed:!!App.game.pow.inventory.bracket && !App.game.pow.touchInteract,inventory:{...App.game.pow.inventory}})));
    await render('02-touch-hold-complete');

    // Isolate one real actor in the clear Hanoi alley. Actor constructor, perception,
    // pathfinding, hearing, solids and sustained capture are the unmodified code.
    await page.evaluate(()=>{
      const g=App.game;POW.begin(g,'hanoi');const b=g.pow.base;
      g.evade.p.splice(0,3,b[0]+31.5,b[1],b[2]-24);g.evade.hdg=Math.PI/2;
      const p=[b[0]+34,b[1],b[2]-24],actor=POW.AI.makeActor({id:'browser-corridor-guard',p,home:p,route:[p],face:Math.PI/2,lamp:false,dwell:100});
      g.evade.searchers=[actor];g.pow.actors=g.evade.searchers;g.pow.noises=[];g.pow.aiClock=0;g.pow.light=.16;g.pow.aiRoster='fixture';
    });
    await step(2);
    record('guard-looking-away-does-not-track-player-through-its-back',await page.evaluate(()=>{const a=App.game.evade.searchers[0];return {passed:!a.seen && a.sus<.05 && a.state==='patrol',seen:a.seen,suspicion:a.sus,state:a.state};}));
    await page.evaluate(()=>{const g=App.game,b=g.pow.base,a=g.evade.searchers[0];a.face=-Math.PI/2;POW.addBox(g,'browser-thin-wall','powStone',32.75,1.25,-24,.035,1.25,1.45,{solid:true});g.pow.navVersion=(g.pow.navVersion || 0)+1;});
    await step(2);
    record('thin-wall-occludes-facing-guard',await page.evaluate(()=>{const g=App.game,a=g.evade.searchers[0],p=g.evade.p;return {passed:!a.seen && !POW.los(g,[a.p[0],a.p[1]+1.5,a.p[2]],[p[0],p[1]+1.4,p[2]]),seen:a.seen,state:a.state,suspicion:a.sus};}));
    await render('03-guard-thin-wall');
    await page.evaluate(()=>{const g=App.game;POW.AI.noise(g,g.evade.p,1.2,'door-fitting');});await step(.8);
    record('guard-hears-and-investigates-without-visible-player',await page.evaluate(()=>{const a=App.game.evade.searchers[0];return {passed:a.sus>.1 && ['investigate','suspicious','search','pursuit'].includes(a.state),suspicion:a.sus,state:a.state,goal:a.goal.slice(),seen:a.seen};}));
    await page.evaluate(()=>{const g=App.game,b=g.pow.base,a=g.evade.searchers[0];for(const q of g.pow.solids)if(q.id==='browser-thin-wall')q.active=false;g.campGeo=g.campGeo.filter(q=>q.id!=='browser-thin-wall');g.pow.navVersion++;a.p=[b[0]+34,b[1],b[2]-24];a.home=a.p.slice();a.route=[a.p.slice()];a.goal=a.p.slice();a.path=[];a.sus=0;a.seen=0;a.state='patrol';a.face=-Math.PI/2;a.senseAt=0;a.grab=0;g.pow.noises=[];});
    record('visible-close-guard-pursues-and-captures-through-real-physics',await page.evaluate(()=>{const g=App.game;let pursuit=false,steps=0;for(;steps<200 && g.pow.stage!=='solitary';steps++){g.stepEvade(.05);pursuit=pursuit || g.evade.searchers.some(a=>a.state==='pursuit');}return {passed:pursuit && g.pow.stage==='solitary' && g.pow.stats.recaptures===1,pursuit,stage:g.pow.stage,recaptures:g.pow.stats.recaptures,steps};}));
    await step(3);record('sustained-capture-transitions-once',await page.evaluate(()=>({passed:App.game.pow.stage==='solitary' && App.game.pow.stats.recaptures===1,stage:App.game.pow.stage,recaptures:App.game.pow.stats.recaptures,realCaptivityModule:!!App.game.pow.captivity})));
    await render('04-recaptured-solitary');
    // Exercise the actual GPU context lifecycle with registered river meshes.
    await page.evaluate(()=>{
      const g=App.game;POW.begin(g,'river');App.screen='game';g.paused=false;
      g.pow.touchInteract=true;g.pow.touchClimb=true;g.pow.holding={id:'river-float',t:.1};
      window.__powContextGame=g;window.__powContextPosition=g.evade.p.slice();
      window.__powContextExtension=g.rend.gl.getExtension('WEBGL_lose_context');
      if(!window.__powContextExtension)throw Error('WEBGL_lose_context unavailable');
      window.__powContextExtension.loseContext();
    });
    await page.waitForFunction(()=>App.graphicsContextLost && App.rend===null);
    await page.evaluate(()=>{window.__powContextPosition=App.game.evade.p.slice();});
    record('graphics-loss-clears-held-POW-touch-actions',await page.evaluate(()=>({passed:App.game===__powContextGame && App.game.paused && !App.game.pow.touchInteract && !App.game.pow.touchClimb && !App.game.pow.holding,preservedGame:App.game===__powContextGame,paused:App.game.paused})));
    await page.waitForTimeout(200);await page.evaluate(()=>__powContextExtension.restoreContext());
    await page.waitForFunction(()=>!App.graphicsContextLost && App.rend && App.game===__powContextGame && App.rend.meshes.powRiverSkiff,null,{timeout:30000});
    record('restored-GPU-rebuilds-custom-POW-meshes-and-preserves-position',await page.evaluate(()=>{const g=App.game;g.render(1/60);return {passed:g.pow.stage==='river' && g.paused && g.evade.p.every((p,i)=>p===__powContextPosition[i]) && g.rend===App.rend && ['powStone','powWater','powRiverSkiff','powRiverNaval'].every(n=>!!g.rend.meshes[n]) && g.rend.gl.getError()===0,stage:g.pow.stage,position:g.evade.p.slice(),paused:g.paused};}));
    await page.getByRole('button',{name:'Resume mission',exact:true}).click();
    await page.evaluate(()=>{App.screen='fixture';App.game.paused=false;});
    await render('05-river-context-restored');assert.equal(errors.length,0,'browser JavaScript errors');
    const report={scope:'Chromium touch emulation at 844×390/DPR 3 using CDP touch events and the real Game simulation/custom WebGL renderer. One explicitly positioned guard isolates facing, thin-wall LOS, hearing, navigation and capture behavior. Not a physical iPhone Safari test or human escape playthrough.',target,results,browserErrors:errors};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');return report;
  } finally {await page.context().close();}
};
