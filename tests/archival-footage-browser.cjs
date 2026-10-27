'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=['index.html','assets/ui/archival-footage.js','assets/ui/archival-footage.css','assets/audio/voice-profiles.js','assets/video/provenance.json','assets/video/carrier-launch.mp4','assets/video/carrier-approach.mp4','assets/video/carrier-night.mp4'];
const snapshot=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,sha(await fs.readFile(path.join(root,f)))])));
module.exports=async function footage(browser,target,evidence){
  const out=path.join(evidence,'archival-footage');await fs.mkdir(out,{recursive:true});
  const before=await snapshot(),harness=sha(await fs.readFile(__filename)),checks=[],screenshots=[],errors=[],missing=[],media=[];
  for(const {name,...options}of[{name:'desktop',viewport:{width:1280,height:720}},{name:'phone',viewport:{width:844,height:390},isMobile:true,hasTouch:true}]){
    const c=await browser.newContext(options),p=await c.newPage(),click=n=>options.hasTouch?n.tap():n.click();
    const record=(label,actual)=>{checks.push({profile:name,name:label,passed:true,actual});console.log('PASS footage '+name+' '+label);};
    p.setDefaultTimeout(90000);
    p.on('pageerror',e=>errors.push(e.message));
    p.on('response',r=>{if(r.status()>=400)missing.push({url:r.url(),status:r.status()});if(/\.mp4/.test(r.url()))media.push({profile:name,url:r.url(),status:r.status(),type:r.headers()['content-type'],range:r.headers()['content-range']});});
    try{
      await c.addInitScript(()=>{localStorage.setItem('a6_set',JSON.stringify({quality:1,sound:0,voices:0,mouse:0,seat:0,assist:1}));localStorage.setItem('a6_sawkeys','1');});
      await p.goto(target);await click(p.locator('#bootGo'));await p.locator('#archivalFootage').waitFor({state:'visible'});
      await p.waitForFunction(()=>document.getElementById('archivalFootageVideo').currentTime>.12,null,{polling:100});
      if(name==='desktop')await p.evaluate(()=>{
        const v=document.getElementById('archivalFootageVideo');window.__archivalAutoClips=[];window.__archivalAutoStarted=performance.now();
        const observe=()=>{const s=ArchivalFootage.inspect();if(s.active&&v.currentTime>.08&&v.videoWidth>0&&!window.__archivalAutoClips.some(c=>c.index===s.index))window.__archivalAutoClips.push({index:s.index,clip:s.clip,source:v.currentSrc,time:v.currentTime,width:v.videoWidth,height:v.videoHeight,decoded:v.getVideoPlaybackQuality?.().totalVideoFrames||0,muted:s.muted});};
        v.addEventListener('timeupdate',observe);observe();
      });
      const first=await p.evaluate(()=>{
        const v=document.getElementById('archivalFootageVideo'),b=document.getElementById('archivalFootageSkip'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);window.__footageProgress=JSON.stringify(App.prog);
        return {state:ArchivalFootage.inspect(),time:v.currentTime,size:[v.videoWidth,v.videoHeight],decoded:v.getVideoPlaybackQuality?.().totalVideoFrames||0,inline:v.playsInline,screen:App.screen,game:!!App.game,skip:{w:r.width,h:r.height,hit:hit===b||b.contains(hit)}};
      });
      assert.equal(first.screen,'ready');assert.equal(first.game,false);assert.equal(first.state.muted,true);assert.ok(first.inline&&first.time>0&&first.size.every(n=>n>0));assert.ok(first.skip.w>=44&&first.skip.h>=44&&first.skip.hit);
      const file=name+'-actual-opening.png';await p.screenshot({path:path.join(out,file)});screenshots.push(file);record('Actual uploaded clip decodes in the silent skippable opening',first);
      if(name==='desktop'){
        // Let the actual decoder reach ended events. No seeking, playback-rate
        // changes, synthetic ended dispatch or programmatic clip progression.
        await p.waitForFunction(()=>!ArchivalFootage.inspect().active&&ArchivalFootage.inspect().lastClose==='complete',null,{polling:100,timeout:35000});
        const completed=await p.evaluate(()=>({clips:window.__archivalAutoClips,elapsedSeconds:(performance.now()-window.__archivalAutoStarted)/1000,state:ArchivalFootage.inspect(),screen:App.screen,game:!!App.game,readyInert:document.getElementById('ready').inert,progressUnchanged:JSON.stringify(App.prog)===window.__footageProgress,paused:document.getElementById('archivalFootageVideo').paused}));
        assert.deepEqual(completed.clips.map(c=>c.index),[0,1,2]);assert.ok(completed.clips.every(c=>c.time>0&&c.width>0&&c.height>0&&c.decoded>0&&c.muted));assert.equal(completed.state.lastClose,'complete');assert.equal(completed.screen,'ready');assert.equal(completed.game,false);assert.equal(completed.readyInert,false);assert.ok(completed.progressUnchanged&&completed.paused);assert.ok(completed.elapsedSeconds>=10&&completed.elapsedSeconds<30);
        record('All three actual clips advance automatically and completion returns to Ready Room',completed);
        // A separate native replay/close still covers the Skip control after
        // the automatic opening has completed naturally.
        await click(p.locator('#archivalFootageReplay'));await p.locator('#archivalFootage').waitFor({state:'visible'});
      }
      await click(p.locator('#archivalFootageSkip'));assert.equal(await p.locator('#archivalFootage').isVisible(),false);
      const skipped=await p.evaluate(()=>({state:ArchivalFootage.inspect(),ready:App.screen,game:!!App.game,progressUnchanged:JSON.stringify(App.prog)===window.__footageProgress,paused:document.getElementById('archivalFootageVideo').paused}));
      assert.equal(skipped.ready,'ready');assert.equal(skipped.game,false);assert.ok(skipped.progressUnchanged&&skipped.paused);record('Native Skip restores Ready Room without changing campaign or mission',skipped);
      await click(p.locator('#archivalFootageReplay'));const clips=[];
      for(let i=0;i<3;i++){
        await p.waitForFunction(i=>{const v=document.getElementById('archivalFootageVideo');return ArchivalFootage.inspect().index===i&&v.currentTime>.08&&v.videoWidth>0;},i,{polling:100});
        const clip=await p.evaluate(()=>{const v=document.getElementById('archivalFootageVideo');return {state:ArchivalFootage.inspect(),time:v.currentTime,width:v.videoWidth,height:v.videoHeight,decoded:v.getVideoPlaybackQuality?.().totalVideoFrames||0};});assert.ok(clip.time>0&&clip.state.muted);clips.push(clip);if(i<2)await click(p.locator('#archivalFootageNext'));
      }
      record('Replay and Next play all three source-derived carrier clips',clips);await click(p.locator('#archivalFootageSkip'));
      if(name==='desktop'){
        // Explicit provider-return fixtures exercise the actual App.radio
        // dispatch in this browser. They do not claim audible voice quality.
        const routing=await p.evaluate(()=>{
          const app=App,a=app.audio,original={sound:app.set.sound,voices:app.set.voices,spoken:a.spoken,speak:a.speak,voice:a.voice,burst:a.burst},campaign=JSON.stringify(app.prog),rows=[];
          let accepted=false,events=[];
          try{
            a.speak=function(){events.push('speech');return accepted;};a.voice=function(){events.push('synthetic-noise');};a.burst=function(){events.push('chirp');};app.set.sound=1;
            for(const language of['en-US','vi-VN'])for(const mode of[2,1,0])for(const speaks of mode===2?[true,false]:[false]){
              app.set.voices=mode;accepted=speaks;events=[];app.radio(language==='vi-VN'?'GUARD':'BN',language==='vi-VN'?'Đứng lại!':'Hold your course.','',language);rows.push({language,mode,providerAccepted:speaks,events:events.slice()});
            }
          }finally{app.set.sound=original.sound;app.set.voices=original.voices;a.spoken=original.spoken;a.speak=original.speak;a.voice=original.voice;a.burst=original.burst;}
          return {rows,progressUnchanged:JSON.stringify(app.prog)===campaign,screen:app.screen,game:!!app.game};
        });
        assert.ok(routing.progressUnchanged);assert.equal(routing.screen,'ready');assert.equal(routing.game,false);
        for(const row of routing.rows){if(row.mode===2){assert.equal(row.events.filter(e=>e==='speech').length,1);assert.equal(row.events.includes('synthetic-noise'),false);assert.equal(row.events.includes('chirp'),false);}else if(row.mode===1)assert.deepEqual(row.events,['synthetic-noise']);else assert.deepEqual(row.events,[]);}
        record('Actual browser radio dispatch keeps Spoken mode free of synthetic fallback noise',routing);
      }
      await p.reload();await click(p.locator('#bootGo'));assert.equal(await p.locator('#archivalFootage').isVisible(),false);assert.equal(await p.evaluate(()=>ArchivalFootage.inspect().seen),true);record('Same-session restart does not repeat the automatic intro',{});
      await click(p.locator('#archivalFootageReplay'));
      const mission=await p.evaluate(()=>{const before=JSON.stringify(App.prog);App.start(MISSIONS[0]);return {active:ArchivalFootage.inspect().active,reopen:ArchivalFootage.open('viewer'),paused:document.getElementById('archivalFootageVideo').paused,progressUnchanged:JSON.stringify(App.prog)===before,screen:App.screen};});
      assert.equal(mission.active,false);assert.equal(mission.reopen,false);assert.ok(mission.paused&&mission.progressUnchanged);assert.equal(mission.screen,'game');await p.waitForFunction(()=>App.game&&document.getElementById('loader').style.display==='none',null,{polling:100});assert.equal(await p.evaluate(()=>App.rend.gl.getError()),0);record('Original mission start closes footage and prevents a live-game overlay',mission);
    }catch(e){await p.screenshot({path:path.join(out,name+'-failure.png'),timeout:30000}).catch(()=>{});await fs.writeFile(path.join(out,name+'-failure.json'),JSON.stringify({error:e.stack,checks,errors,missing},null,2));throw e;}
    finally{await c.close();}
  }
  const reduced=await browser.newContext({viewport:{width:844,height:390},reducedMotion:'reduce'});
  try{const p=await reduced.newPage();await p.goto(target);await p.click('#bootGo');assert.equal(await p.evaluate(()=>ArchivalFootage.inspect().active),false);assert.equal(await p.locator('#archivalFootageReplay').isVisible(),true);checks.push({name:'Reduced motion skips automatic footage while retaining explicit Replay',passed:true});}finally{await reduced.close();}
  const range=await fetch(target+'assets/video/carrier-night.mp4',{headers:{Range:'bytes=0-1'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-type'),'video/mp4');assert.equal((await range.arrayBuffer()).byteLength,2);checks.push({name:'Actual media endpoint supports Safari-style initial byte requests',passed:true,range:range.headers.get('content-range')});
  assert.deepEqual(await snapshot(),before);assert.equal(sha(await fs.readFile(__filename)),harness);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.ok(media.length>=6&&media.every(m=>m.type==='video/mp4'));
  const report={passed:true,suite:'archival-footage',sourceStable:true,sourceSHA256:before,testSHA256:harness,checks,screenshots,media,errors,missing,scope:'Actual Chromium desktop/phone media decoding, natural automatic progression/completion on desktop, native Skip/Replay/Next, session and reduced-motion policy, original mission-start closure and real byte-range HTTP. Radio routing uses explicit stubbed provider acceptance/decline through actual App.radio; it is not a listening test. Phone layout is not physical iPhone Safari. Clips are silent.'};
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));return report;
};
