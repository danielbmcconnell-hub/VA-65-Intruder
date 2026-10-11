'use strict';
// WebKit iPhone-layout integration, run under Playwright Linux WebKit.
// An actual iPhone Safari hardware trial remains necessary.
const assert=require('node:assert/strict');
const {webkit}=require('playwright');
const {createServer}=require('../tools/dev-server.cjs');

(async()=>{
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const target='http://127.0.0.1:'+server.address().port+'/';
  let browser,ctx;
  const checks=[];
  const record=(name,data)=>{assert.ok(data.passed,name+' '+JSON.stringify(data));checks.push(name);console.log('PASS iPhone WebKit: '+name);};
  try{
    browser=await webkit.launch({headless:true});
    ctx=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(String(error.message)));
    await page.addInitScript(()=>{
      localStorage.setItem('a6_set',JSON.stringify({quality:0,sound:0,voices:0,mouse:0,seat:0,assist:1,sens:1}));
      localStorage.setItem('a6_sawkeys','1');
    });
    await page.goto(target,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.App && window.POW,{timeout:30000});
    await page.locator('#bootGo').tap();
    record('Safari ready room opens',await page.evaluate(()=>({passed:App.screen==='ready',screen:App.screen})));
    await page.locator('#powChapter button').filter({hasText:'Enter the prison'}).tap();
    await page.waitForFunction(()=>App.game?.pow?.stage==='cell' && document.getElementById('loader').style.display==='none',null,{timeout:120000});
    record('WebKit2 3D prison starts on touch phone',await page.evaluate(()=>{
      const gl=App.rend && App.rend.gl;
      return {passed:!!gl && gl.getParameter(gl.VERSION).includes('WebGL') && gl.getError()===0 && document.body.classList.contains('pow-active'),version:gl?.getParameter(gl.VERSION),gpuError:gl?.getError(),stage:App.game.pow.stage};
    }));
    record('POW buttons are visible, with aircraft button stacks hidden',await page.evaluate(()=>{
      const ids=['#stick','#pauseBtn','#powHUD .pow-motion-btn:first-child','#powHUD .pow-motion-btn:nth-child(2)','#powHUD .pow-context-controls button:nth-child(3)'];
      const visible=ids.every(id=>{const el=document.querySelector(id);const r=el?.getBoundingClientRect();return !!r && r.width>28 && r.height>28 && getComputedStyle(el).display!=='none';});
      const hidden=['#fcol','#rcol','#rpow','#pickle'].every(id=>getComputedStyle(document.querySelector(id)).display==='none');
      const controls=[...document.querySelectorAll('#powHUD .pow-context-controls button')].filter(el=>getComputedStyle(el).display!=='none').map(el=>el.getBoundingClientRect());
      const inView=controls.every(r=>r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1);
      const stick=document.querySelector('#stick').getBoundingClientRect();
      const distinct=controls.every(r=>!(Math.min(stick.right,r.right)>Math.max(stick.left,r.left)&&Math.min(stick.bottom,r.bottom)>Math.max(stick.top,r.top)));
      return {passed:visible&&hidden&&inView&&distinct,visible,hidden,inView,distinct,viewport:[innerWidth,innerHeight]};
    }));
    await page.evaluate(()=>{
      App.screen='fixture';App.game.paused=false;
      for(const key of Object.keys(App.keys))App.keys[key]=0;
      App.gctl.pitch=0;App.gctl.roll=0;
    });
    const start=await page.evaluate(()=>App.game.evade.p.slice());
    // WebKit executes the same pointer handlers that are used by iOS Safari.
    await page.evaluate(()=>{
      const stick=document.getElementById('stick'),r=stick.getBoundingClientRect();
      const target=(type,x,y)=>stick.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:41,pointerType:'touch',clientX:x,clientY:y}));
      target('pointerdown',r.left+r.width/2,r.top+r.height/2);
      target('pointermove',r.left+r.width/2,r.top+12);
      for(let i=0;i<30;i++)App.game.stepEvade(.05);
      target('pointerup',r.left+r.width/2,r.top+12);
    });
    record('WebKit touch joystick moves the player',await page.evaluate(start=>{
      const p=App.game.evade.p;
      const d=Math.hypot(p[0]-start[0],p[2]-start[2]);
      return {passed:d>.3,d};
    },start));
    await page.evaluate(()=>{
      const b=POW.ui.crouch;
      b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:42,pointerType:'touch'}));
      App.game.stepEvade(.05);
    });
    record('WebKit crouch touch input',await page.evaluate(()=>({passed:App.game.pow.input.crouch===true && App.game.evade.crouch===true})));
    await page.evaluate(()=>{
      const b=POW.ui.crouch;b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:42,pointerType:'touch'}));
      const run=POW.ui.run;run.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:43,pointerType:'touch'}));
      App.game.stepEvade(.05);
    });
    record('WebKit run touch input',await page.evaluate(()=>({passed:App.game.pow.input.run===true && !App.game.pow.input.crouch})));
    await page.evaluate(()=>{
      const b=POW.ui.run;b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:43,pointerType:'touch'}));
      window.dispatchEvent(new Event('blur'));
      App.game.stepEvade(.05);
    });
    record('Safari backgrounding releases all touches',await page.evaluate(()=>({passed:!App.game.pow.touchRun&&!App.game.pow.touchCrouch&&!App.game.pow.touchInteract&&!App.game.pow.touchClimb&&App.gctl.pitch===0})));
    await page.evaluate(()=>{
      POW.begin(App.game,'compound');
      App.game.paused=false;
      App.game.evade.p.splice(0,3,App.game.pow.base[0]+21,App.game.pow.base[1]+3.4,App.game.pow.base[2]-22);
      POW.updateUI(App.game);
    });
    record('rope marker and guidance render on iPhone',await page.evaluate(()=>{
      const g=App.game,geom=g.campGeo;
      return {passed:geom.some(q=>q.id==='roof-rope:marker-bar') && POW.ui.objective.textContent.includes('FIND ROPE'),objective:POW.ui.objective.textContent};
    }));
    await page.setViewportSize({width:390,height:844});
    record('portrait iPhone asks player to rotate',await page.evaluate(()=>({passed:getComputedStyle(document.getElementById('rotate')).display==='flex'})));
    await page.setViewportSize({width:844,height:390});
    record('landscape iPhone restores play without resetting checkpoint',await page.evaluate(()=>({passed:getComputedStyle(document.getElementById('rotate')).display==='none'&&App.game.pow.stage==='compound'})));
    assert.deepEqual(errors,[],'No WebKit JavaScript page errors');
    console.log('PASS: '+checks.length+' WebKit iPhone integration checks; no JS errors. Real iPhone hardware remains untested.');
  } finally {
    if(ctx)await ctx.close();
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e.stack||String(e));process.exitCode=1;});
