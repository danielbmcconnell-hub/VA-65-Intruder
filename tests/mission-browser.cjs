const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const crypto = require('node:crypto');

module.exports = async function missionChecks(browser, baseURL, output) {
  fs.mkdirSync(output, {recursive:true});
  const results=[];
  try {
    for (const profile of [
      {name:'desktop',viewport:{width:960,height:600},deviceScaleFactor:1,isMobile:false,hasTouch:false},
      {name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true},
    ]) {
      const {name,...options}=profile;
      const context=await browser.newContext(options);
      await context.addInitScript(()=>localStorage.setItem('a6_set',JSON.stringify({quality:0,assist:0,sound:0,voices:0,invert:0,sens:1,mouse:0,seat:0})));
      const page=await context.newPage();
      const errors=[], requests=[], warnings=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('requestfailed',r=>requests.push({url:r.url(),error:r.failure()?.errorText}));
      page.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
      const response = await page.goto(baseURL,{waitUntil:'domcontentloaded',timeout:30000});
      assert.equal(response.status(),200);
      const sourceSha256 = crypto.createHash('sha256').update(await response.text()).digest('hex');
      await page.waitForFunction(()=>window.App && App.screen==='boot');
      await page.click('#bootGo');
      await page.click('#tabs [data-tab="set"]');
      await page.getByRole('button',{name:'Unlock all missions',exact:true}).click();
      assert.equal(await page.locator('#readyBody .mcard').count(),11);
      const cdp=profile.hasTouch ? await context.newCDPSession(page) : null;
      for(let i=0;i<11;i++) {
        await page.locator('#readyBody .mcard').nth(i).click();
        const mission=await page.evaluate(()=>({id:App.mission.id,title:App.mission.title,airStart:!!App.mission.airStart}));
        await page.getByRole('button',{name:'Man Aircraft',exact:true}).click();
        await page.waitForFunction(id=>document.getElementById('graphicError') ||
          (App.game?.mis.id===id && document.getElementById('loader').style.display==='none' && App.game.t>0),mission.id,{timeout:45000});
        assert.equal(await page.locator('#graphicError').count(),0,'Renderer must remain usable');
        await page.waitForFunction(()=>['nva','female_vc','militia','farmer','cow','aviator','vegetation'].every(n=>App.rend.textures['photo_'+n]),null,{timeout:30000});
        if(!mission.airStart) {
          if(cdp) {
            const b=await page.locator('#pickle').boundingBox();
            assert.ok(b,'Touch commit control must be visible');
            await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});
            assert.equal(await page.evaluate(()=>App.gctl.commit),1);
          } else await page.keyboard.down('Space');
        }
        const state=await page.evaluate(()=>{
          const g=App.game;
          g.paused=false;
          // Accelerate four seconds through the real fixed-step engine using
          // keyboard/native emulated-touch input. No physics or renderer mocks.
          for(let n=0;n<240;n++)g.update(1/60);
          g.paused=true;
          g.render(1/60);g.syncControls();
          return {time:g.t,phase:g.phase,alive:g.ac.alive,onDeck:g.ac.onDeck,
            finite:[...g.ac.p,...g.ac.v,g.ac.yaw,g.ac.pitch,g.ac.roll].every(Number.isFinite),
            webgl:g.rend.gl.getParameter(g.rend.gl.VERSION),textures:Object.keys(g.rend.textures),
            objectives:g.objState(),bombs:g.ac.bombs,gpuError:g.rend.gl.getError()};
        });
        if(!mission.airStart) {
          if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          else await page.keyboard.up('Space');
        }
        assert.equal(state.alive,true,mission.id+' aircraft remains alive');
        assert.equal(state.onDeck,false,mission.id+' becomes airborne');
        assert.equal(state.finite,true,mission.id+' finite physics state');
        assert.ok(state.time>=4);
        assert.equal(state.gpuError,0,mission.id+' actual render has no GPU errors');
        // Remove optional help overlays through their existing click controls.
        // This optional teaching overlay can expire between a visibility check
        // and a native click; dispatch its existing close handler without waiting.
        await page.locator('#teach').dispatchEvent('click');
        if(await page.locator('#legend.on').count())await page.keyboard.press('h');
        const screenshot=path.join(output,`${name}-${mission.id}-flight.png`);
        await page.screenshot({path:screenshot});
        assert.deepEqual(errors,[],'No uncaught browser errors');
        results.push({profile:name,sourceSha256,...mission,...state,screenshot,result:'passed',scope:'mission briefing/startup, input-driven launch, four simulated seconds, real WebGL render; not full mission completion'});
        console.log(`PASS ${name} ${mission.id} ${mission.title}: ${state.phase}, ${state.time.toFixed(2)}s`);
        await page.click('#pauseBtn');
        await page.locator('#pauseBody').getByRole('button',{name:'Ready Room',exact:true}).click();
        assert.equal(await page.evaluate(()=>App.game),null);
      }
      fs.writeFileSync(path.join(output,`${name}-requests.json`),JSON.stringify({requests,warnings,uncaughtErrors:errors},null,2));
      await context.close();
    }
  } finally {
    fs.writeFileSync(path.join(output,'mission-results.json'),JSON.stringify({results,total:results.length,
      expected:22,complete:results.length===22,actualIPhoneSafariTested:false,fullMissionCompletionTested:false},null,2));
  }
  assert.equal(results.length,22);
  return {suite:'missions',results,total:results.length,expected:22,complete:true,actualIPhoneSafariTested:false,fullMissionCompletionTested:false};
};
