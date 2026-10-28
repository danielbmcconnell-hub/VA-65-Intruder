'use strict';
// Focused browser lifecycle and reachable-control smoke. Chromium/WebKit is not physical Safari.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const touchIds = ['#pauseBtn','#stick','#btnScope','#btnView','#btnGear',
  '#btnChart','#btnEject','#thrUp','#thrDn','#btnBrake','#pickle'];
const groundIds = ['#pauseBtn','#stick','#btnRun','#btnCrouch','#btnRadio',
  '#btnSmoke','#btnPistol','#btnKnife','#btnPunch','#btnSurrender','#btnFire'];

async function geometry(page, ids) {
  return page.evaluate(ids => {
    const all = ids.map(id => {
      const el = document.querySelector(id);
      if (!el) throw Error('Missing control ' + id);
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden')
        throw Error('Hidden control ' + id);
      const r = el.getBoundingClientRect();
      if (r.width < 26 || r.height < 26 || r.left < 0 || r.top < 0 ||
          r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
        throw Error('Control outside visible viewport ' + id + ': ' + JSON.stringify(r.toJSON()));
      return { id, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    // Major flight/ground touch targets must not obscure one another.
    for (let i = 0; i < all.length; i++) for (let j = i+1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const x = Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
      const y = Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
      if (x > 4 && y > 4) throw Error('Overlapping controls ' + a.id + ' and ' + b.id);
    }
    return all;
  }, ids);
}

module.exports = async function lifecycleChecks(browser, baseURL, output) {
  fs.mkdirSync(output,{recursive:true});
  const profiles = [
    {name:'desktop',viewport:{width:1280,height:720},deviceScaleFactor:1,hasTouch:false,isMobile:false},
    {name:'iphone-layout',viewport:{width:844,height:390},deviceScaleFactor:3,hasTouch:true,isMobile:true}
  ];
  const result = [];
  for (const profile of profiles) {
    const {name,...settings} = profile;
    const ctx = await browser.newContext(settings);
    const page = await ctx.newPage();
    const errors=[];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(baseURL,{waitUntil:'domcontentloaded',timeout:30000});
      await page.click('#bootFly');
      await page.waitForFunction(() => App.game &&
        document.querySelector('#loader').style.display === 'none' &&
        !document.querySelector('#graphicError'),null,{timeout:60000});
      const initial = await page.evaluate(() => ({
        t:App.game.t,paused:App.game.paused,
        gl:App.rend.gl.getParameter(App.rend.gl.VERSION),
        sound:App.audio.ctx ? App.audio.ctx.state : 'unavailable'
      }));
      assert.ok(initial.gl.includes('WebGL'),'WebGL flight display starts');
      if (name === 'iphone-layout') {
        // The portrait warning must not leave a running aircraft behind it.
        await geometry(page,touchIds);
        await page.evaluate(() => {
          for (const id of ['teach','teachPeek','legend'])
            document.querySelector('#'+id)?.classList.remove('on');
          document.body.classList.add('onfoot');
        });
        await geometry(page,groundIds);
        await page.evaluate(() => document.body.classList.remove('onfoot'));
        await page.setViewportSize({width:390,height:844});
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#rotate')).display !== 'none'
          && App.game.paused);
        await page.setViewportSize({width:844,height:390});
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#rotate')).display === 'none');
        assert.equal(await page.evaluate(() => App.game.paused),true,
          'Landscape return requires deliberate resume');
        await page.locator('#pauseBody').getByRole('button',{name:'Resume',exact:true}).click();
        assert.equal(await page.evaluate(() => App.game.paused),false);
      }
      // Simulate desktop window switching / iPhone application backgrounding.
      await page.evaluate(() => {
        App.keys.KeyW=1;App.gctl.roll=.7;App.gctl.thrUp=1;
        window.dispatchEvent(new Event('blur'));
      });
      assert.deepEqual(await page.evaluate(() => ({
        paused:App.game.paused,roll:App.gctl.roll,thr:App.gctl.thrUp,
        key:App.keys.KeyW,menu:document.querySelector('#pauseVeil').classList.contains('on')
      })),{paused:true,roll:0,thr:0,key:0,menu:true});
      const frozen = await page.evaluate(() => App.game.t);
      await page.waitForTimeout(220);
      assert.equal(await page.evaluate(() => App.game.t),frozen,'Paused physics stay frozen');
      await page.locator('#pauseBody').getByRole('button',{name:'Resume',exact:true}).click();
      assert.equal(await page.evaluate(() => App.game.paused),false);
      // Pagehide must also freeze and clear held pointer controls.
      await page.evaluate(() => {
        App.gctl.pitch=.9;
        window.dispatchEvent(new Event('pagehide'));
      });
      assert.equal(await page.evaluate(() => App.game.paused && App.gctl.pitch===0),true);
      await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
      assert.equal(await page.evaluate(() => App.game.paused),true,
        'Browser page restoration does not resume flight without consent');
      await page.locator('#pauseBody').getByRole('button',{name:'Resume',exact:true}).click();
      const running = await page.evaluate(() => ({
        paused:App.game.paused,finite:[...App.game.ac.p,...App.game.ac.v].every(Number.isFinite),
        error:App.rend.gl.getError()
      }));
      assert.equal(running.paused,false);
      assert.equal(running.finite,true);
      assert.equal(running.error,0);
      assert.deepEqual(errors,[],'No uncaught runtime errors');
      await page.screenshot({path:path.join(output,'lifecycle-'+name+'.png')});
      result.push({name,initial,running,checks:['startup','interruption','input reset',
        'explicit resume','pagehide/pageshow','finite physics','zero WebGL errors',
        ...(name==='iphone-layout'?['rotation','flight controls','on-foot controls']:[])]});
      console.log('PASS lifecycle '+name);
    } finally {
      await ctx.close();
    }
  }
  return {suite:'lifecycle',results:result,complete:result.length===2,
    physicalIPhoneSafariTested:false,physicalWindowsHardwareTested:false};
};
