'use strict';
// Declared actor/wall/view fixtures exercise original weapon methods, native
// keyboard/CDP fire, exact ammunition accounting and actual WebGL2 rendering.
// Deterministic zero random samples prove target eligibility, not difficulty.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async function(browser,target,evidenceDir){
 const checks=[],screenshots=[],errors=[],missing=[];const out=path.join(evidenceDir,'ground-combat');await fs.mkdir(out,{recursive:true});
 for(const profile of [{name:'desktop',viewport:{width:1280,height:720},deviceScaleFactor:1},{name:'iphone-layout-chromium',viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true}]){
  const {name,...options}=profile,context=await browser.newContext(options),page=await context.newPage();
  const record=(name2,actual)=>{checks.push({name:name+' '+name2,passed:true,actual});console.log('PASS ground-combat '+name+' '+name2)};
  const shot=async label=>{await page.evaluate(()=>{FlightCoach.tick(App.game,0);App.game.render(0);App.game.syncControls();if(App.rend.gl.getError())throw Error('GL capture error')});await page.screenshot({path:path.join(out,name+'-'+label+'.png'),timeout:90000});screenshots.push('ground-combat/'+name+'-'+label+'.png')};
  page.on('pageerror',e=>errors.push({profile:name,error:e.message}));page.on('response',r=>{if(r.url().startsWith(target)&&r.status()>=400)missing.push(r.url())});
  try{
   await context.addInitScript(()=>{localStorage.setItem('a6_set',JSON.stringify({quality:0,sound:0,voices:0,mouse:0,seat:0,assist:1,sens:1}));localStorage.setItem('a6_sawkeys','1')});
   await page.goto(target,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.App&&window.GroundCombat);await page.locator('#bootFly').click();await page.waitForFunction(()=>App.game?.st&&document.getElementById('loader').style.display==='none',null,{timeout:90000});
   await page.evaluate(()=>{App.frame=function(){};App.game.paused=true;});
   await page.waitForFunction(()=>{const s=window.PhotoCutouts&&PhotoCutouts.inspect(App.rend);if(s?.status==='error')throw Error(s.failures.join('; '));return s?.status==='ready';},null,{polling:50,timeout:90000});
   await page.evaluate(()=>{App.frame=function(){};App.screen='game';const G=App.game;G.paused=false;G.t=20;G.startCamp(1);let p;for(let r=80;r<2600&&!p;r+=60)for(let a=0;a<Math.PI*2;a+=Math.PI/8){const x=G.evade.p[0]+Math.cos(a)*r,z=G.evade.p[2]+Math.sin(a)*r;if(terrainH(x,z)>10&&!G._localSolidAt(x,z,.5)&&!G._localSolidAt(x,z-8,.5)&&Array.from({length:48},(_,i)=>(i+1)/6).every(d=>Math.abs(terrainH(x,z-d)-terrainH(x,z))<.2&&!G._localSolidAt(x,z-d,.5))){p=[x,0,z];break}}if(!p)throw Error('No dry actor fixture');window.__combatBase=p;window.__combatSet=(look=0,distance=8)=>{const target={p:[p[0],0,p[2]-distance],goal:[...p],kind:'nva',armed:true,alive:true,face:Math.PI,spd:0,ph:0};G.evade={p:[...p],hdg:0,look,pitchCmd:look,t:0,rounds:6,hasPistol:true,hasKnife:true,drawn:1,weaponMode:'pistol',lastShot:-99,kills:0,noise:0,searchers:[target],locals:[],cattle:[],spawn:1e9,radio:0,rescue:0,eta:120,exposure:0,pickup:[p[0]+300,p[2]],chute:[p[0],p[2]]};G.shake=0;G.flash=0;G.t+=2;return target};__combatSet();for(const k of Object.keys(App.keys))App.keys[k]=0;for(const id of ['teach','teachPeek','legend'])document.getElementById(id)?.classList.remove('on')});
   const eligibility=await page.evaluate(()=>{const G=App.game,rows=[];for(const [look,distance] of [[0,8],[1.1,2],[-.55,8],[-.55,2]]){const actor=__combatSet(look,distance);G._weapons(1/60,G.evade,App,{});rows.push({look,distance,aim:G.evade.aim,wounds:actor.wounds||0})}return rows});
   assert.equal(eligibility[0].aim,8);assert.equal(eligibility[1].aim,null);assert.equal(eligibility[2].aim,null);assert.equal(eligibility[3].aim,2);assert.ok(eligibility.every(r=>r.wounds===0));record('camera pitch selects body volume and rejects clear sky/ground misses',eligibility);
   const reticle=await page.evaluate(()=>{const G=App.game;__combatSet(0,8);G._weapons(1/60,G.evade,App,{});const ctx=G.hud.g,moves=[],original=ctx.moveTo;ctx.moveTo=function(x,y){moves.push([x,y]);return original.call(this,x,y)};try{G.render(0)}finally{ctx.moveTo=original}const e=G.evade,q=GroundCombat.target(G,e,{floorAt:p=>Math.max(0,terrainH(p[0],p[2])),eyeHeight:GroundView.eyeHeight(G,1.68),bodyHeight:o=>PhotoSprites.describe(o,{renderer:G.rend,camera:G.rend.eye})?.h||1.76,lineOfSight:o=>G._groundLineOfSight(e.p,o.p,e)});if(!q)throw Error('No centered target');const p=q.hitPoint,m=G.rend.matVP,c=[0,1,2,3].map(r=>m[r]*p[0]+m[r+4]*p[1]+m[r+8]*p[2]+m[r+12]),projected=[(c[0]/c[3]*.5+.5)*G.hud.W,(.5-c[1]/c[3]*.5)*G.hud.H];return {W:G.hud.W,H:G.hud.H,moves,projected,aim:e.aim,gl:G.rend.gl.getError()}});
   await fs.writeFile(path.join(out,name+'-reticle-measurement.json'),JSON.stringify(reticle,null,2)+'\n');
   // Original Float32 VP matrices at14km world coordinates have subpixel rounding; HUD draw commands remain exact.
   for(const expected of [[reticle.W/2-15,reticle.H/2],[reticle.W/2+4,reticle.H/2],[reticle.W/2,reticle.H/2-15]])assert.ok(reticle.moves.some(v=>Math.hypot(v[0]-expected[0],v[1]-expected[1])<1e-5));assert.ok(Math.abs(reticle.projected[0]-reticle.W/2)<.5&&Math.abs(reticle.projected[1]-reticle.H/2)<.5,JSON.stringify(reticle));assert.equal(reticle.gl,0);record('actual HUD reticle and production view ray share the projected center',reticle);await shot('centered-body-reticle');
   const results=[];for(const look of [1.1,0]){
    const before=await page.evaluate(look=>{__combatSet(look,2);return SurvivalAmmunition.view(App.game).bulletsExpended},look);
    let session;if(options.hasTouch){session=await context.newCDPSession(page);const box=await page.locator('#btnFire').boundingBox();assert.ok(box,'Actual on-foot Fire must be visible');await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.evaluate(()=>App.game.evade.attackWant),1,'Native Fire click must queue an actual accepted action')}else{const b=await page.locator('#gl').boundingBox();assert.ok(b);await page.mouse.move(b.x+b.width*.52,b.y+b.height*.36);await page.mouse.down();assert.equal(await page.evaluate(()=>App.game.evade.primaryAttackDown),true,'Trusted primary pointer must hold the selected weapon');}
    try{results.push(await page.evaluate(before=>{const G=App.game,e=G.evade,r=Math.random;Math.random=()=>0;try{G._weapons(1/60,e,App,App.keys)}finally{Math.random=r}return {look:e.look,rounds:e.rounds,wounds:e.searchers[0].wounds||0,expended:SurvivalAmmunition.view(G).bulletsExpended-before}},before))}finally{if(session){await session.detach()}else{await page.mouse.up();assert.equal(await page.evaluate(()=>App.game.evade.primaryAttackDown),false,'Releasing primary pointer must clear selected-weapon hold');}}
   }
   assert.equal(results[0].wounds,0);assert.equal(results[1].wounds,1);assert.ok(results.every(r=>r.rounds===5&&r.expended===1));record('native accepted fire spends one bullet for either a sky miss or an aligned real hit',results);await shot('actual-accepted-hit');
   const punchBefore=await page.evaluate(()=>{__combatSet(0,2);App.game._weapons(1/60,App.game.evade,App,{});return SurvivalAmmunition.view(App.game).bulletsExpended;});
   await page.keyboard.down('Space');let freePunch;
   try{freePunch=await page.evaluate(before=>{const g=App.game;for(let i=0;i<40;i++){g.t+=1/60;g._weapons(1/60,g.evade,App,App.keys);}return {rounds:g.evade.rounds,mode:g.evade.weaponMode,expended:SurvivalAmmunition.view(g).bulletsExpended-before,punch:GroundCombat.inspectPunch(g)};},punchBefore);}finally{await page.keyboard.up('Space');await page.evaluate(()=>App.game._weapons(1/60,App.game.evade,App,App.keys));}
   assert.equal(freePunch.rounds,6);assert.equal(freePunch.mode,'pistol');assert.equal(freePunch.expended,0);assert.equal(freePunch.punch.serial,1);record('Native held Space makes one free-hand punch while the selected pistol retains every round',freePunch);
   // Native selection and input cover the held-tool paths separately from the
   // legacy target/occlusion fixtures above. Only the actor's starting encounter
   // is declared; original input, weapon acceptance, animation and ledger run.
   const activate=async selector=>options.hasTouch?page.locator(selector).tap():page.locator(selector).click();
   const advancePrimary=seconds=>page.evaluate(seconds=>{
    const g=App.game,e=g.evade,r=Math.random;let left=seconds;
    Math.random=()=>0;try{while(left>1e-10){const dt=Math.min(left,1/60);g.t+=dt;g._weapons(dt,e,App,App.keys);EquipmentView.step(g,dt,0);left-=dt;}}finally{Math.random=r;}
    g.render(0);g.syncControls();return {mode:e.weaponMode,rounds:e.rounds,action:e.actionT??null,melee:e._meleeT??null,queued:e.attackWant||0,held:!!e.primaryAttackDown,
      bullets:SurvivalAmmunition.view(g).bulletsExpended,punch:GroundCombat.inspectPunch(g),equipment:EquipmentView.inspect(g),target:{alive:e.searchers[0]?.alive,wounds:e.searchers[0]?.wounds||0}};
   },seconds);
   const select=async mode=>{
    await page.evaluate(()=>{const g=App.game;__combatSet(0,2);g.evade.weaponMode='fists';g.evade.drawn=0;GroundCombat.resetPunch(g);EquipmentView.reset(g);g.render(0);g.syncControls();});
    await activate(mode==='knife'?'#btnKnife':'#btnPistol');
    const selected=await advancePrimary(1/60);assert.equal(selected.mode,mode);
    return selected;
   };
   const knifeBefore=await select('knife');
   if(!options.hasTouch)assert.equal(await page.evaluate(()=>document.activeElement.id),'btnKnife','Native weapon-selector focus must not block T');
   await page.keyboard.down('t');const knifeFirst=await advancePrimary(.12);await page.keyboard.down('t');const knifeHeld=await advancePrimary(.95);await page.keyboard.up('t');
   assert.equal(knifeFirst.rounds,6);assert.equal(knifeFirst.target.alive,false);assert.ok(knifeFirst.action>0);assert.equal(knifeFirst.equipment.pulses,1);
   assert.equal(knifeHeld.action,knifeFirst.action);assert.equal(knifeHeld.equipment.pulses,1);assert.equal(knifeHeld.bullets,knifeBefore.bullets);assert.equal(knifeHeld.queued,0);
   record('Original Knife selector then native T accepts one animated stab; repeated held key cannot replay it',{before:knifeBefore,first:knifeFirst,held:knifeHeld});
   const pistolBefore=await select('pistol');await page.keyboard.down('t');const pistolFirst=await advancePrimary(.12);await page.keyboard.down('t');const pistolHeld=await advancePrimary(1.1);await page.keyboard.up('t');
   assert.equal(pistolFirst.rounds,5);assert.equal(pistolFirst.bullets-pistolBefore.bullets,1);assert.equal(pistolFirst.equipment.pulses,1);
   assert.equal(pistolHeld.rounds,5);assert.equal(pistolHeld.bullets,pistolFirst.bullets);assert.equal(pistolHeld.equipment.pulses,1);
   record('Native T fires the selected pistol once with exact ammunition accounting and no held-key replay',{before:pistolBefore,first:pistolFirst,held:pistolHeld});
   await select('knife');await page.keyboard.down('Space');const knifePunch=await advancePrimary(1/60),knifePunchHeld=await advancePrimary(.6);await page.keyboard.up('Space');await advancePrimary(1/60);
   assert.ok(knifePunch.punch.left);assert.equal(knifePunch.punch.right,null);assert.equal(knifePunch.punch.hands.right,'knife');assert.equal(knifePunch.punch.serial,1);
   assert.equal(knifePunchHeld.punch.serial,1);assert.equal(knifePunchHeld.rounds,6);assert.equal(knifePunchHeld.action,null);assert.equal(knifePunchHeld.equipment.pulses,0);
   record('Native Space with a held knife animates only the empty left hand and never stabs or spends a round',{first:knifePunch,held:knifePunchHeld});
   await select('knife');
   const actionButton=await page.locator('#btnFire').evaluate(b=>{const r=b.getBoundingClientRect();return {text:b.textContent,label:b.getAttribute('aria-label'),rect:{x:r.x,y:r.y,width:r.width,height:r.height},hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b,keyboardHint:getComputedStyle(b,'::after').content};});
   assert.equal(actionButton.text,'STAB');assert.match(actionButton.label,/stab.*knife/i);assert.equal(actionButton.hit,true);assert.ok(actionButton.rect.width>=44&&actionButton.rect.height>=44);
   if(!options.hasTouch){assert.ok(actionButton.rect.height<=44);assert.match(actionButton.keyboardHint,/T/);}
   await activate('#btnFire');const buttonStab=await advancePrimary(.12);assert.equal(buttonStab.equipment.pulses,1);assert.equal(buttonStab.rounds,6);assert.equal(buttonStab.target.alive,false);
   await page.waitForFunction(()=>{const a=document.getElementById('weaponArt');return a.complete&&a.naturalWidth>0;});
   await page.locator('#radio .rmsg').last().evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{}))));
   const groundCaption=await page.evaluate(()=>{
    HUDLayout.update();const row=document.getElementById('groundItemsUI'),latest=document.getElementById('radio').lastElementChild,b=latest.getBoundingClientRect(),r=row.getBoundingClientRect(),css=getComputedStyle(latest);
    const buttons=[...row.querySelectorAll('button')].filter(n=>n.getClientRects().length&&!n.hidden).map(n=>{const q=n.getBoundingClientRect(),hit=document.elementFromPoint(q.x+q.width/2,q.y+q.height/2);return {id:n.id,hit:n===hit||n.contains(hit)};});
    return {caption:{left:b.left,top:b.top,right:b.right,bottom:b.bottom,text:latest.textContent,clientHeight:latest.clientHeight,scrollHeight:latest.scrollHeight,overflow:css.overflowY,shown:css.display!=='none'},row:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},gap:r.top-b.bottom,buttons,viewport:[innerWidth,innerHeight]};
   });
   assert.ok(groundCaption.gap>=7.5,'Latest caption must clear the Supplies/free-hand row by at least8px');assert.ok(groundCaption.buttons.length>=2&&groundCaption.buttons.every(b=>b.hit));
   assert.equal(groundCaption.caption.shown,true);assert.ok(groundCaption.caption.text.trim().length);assert.ok(groundCaption.caption.top>=0&&groundCaption.caption.left>=0&&groundCaption.caption.right<=groundCaption.viewport[0]&&groundCaption.caption.bottom<=groundCaption.viewport[1]);
   assert.ok(groundCaption.caption.scrollHeight<=groundCaption.caption.clientHeight+1||groundCaption.caption.overflow==='auto','Latest caption must fit or remain scrollable');
   record('Visible STAB action is an actual unobscured native hit target and accepts the selected knife',{actionButton,accepted:buttonStab,groundCaption});await shot('native-stab-action-and-prompt');
   if(!options.hasTouch){
    const locked=[];
    for(const mode of ['knife','pistol']){
     const before=await select(mode);await page.mouse.move(600,250);await page.keyboard.press('y');
     await page.waitForFunction(()=>document.pointerLockElement===document.getElementById('stack'),null,{timeout:5000});
     await page.evaluate(()=>{window.__lockedPrimaryTarget=null;document.getElementById('stack').addEventListener('pointerdown',event=>{if(event.isTrusted&&event.pointerType==='mouse'&&event.button===0)window.__lockedPrimaryTarget=event.target.id;},{once:true});});
     await page.mouse.down();assert.equal(await page.evaluate(()=>App.game.evade.primaryAttackDown),true);
     const actual=await advancePrimary(.12);await page.mouse.up();
     assert.equal(await page.evaluate(()=>window.__lockedPrimaryTarget),'stack','Actual locked browser input must retarget to #stack');
     assert.equal(actual.equipment.pulses,1);assert.equal(actual.rounds,mode==='pistol'?5:6);assert.equal(actual.bullets-before.bullets,mode==='pistol'?1:0);
     locked.push({mode,before,actual,target:await page.evaluate(()=>window.__lockedPrimaryTarget)});
     await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>!document.pointerLockElement);
    }
    record('Real browser pointer lock acquired by native Y accepts retargeted knife and pistol primary clicks',locked);
   }
   // Real Controls, Supplies and Pause interactions must consume primary input
   // while open. A genuine key queued immediately before opening is discarded.
   const blocked=[];
   for(const menu of ['controls','supplies','pause']){
    const before=await select('pistol');
    await page.keyboard.press('t');assert.equal(await page.evaluate(()=>App.game.evade.attackWant),1);
    if(menu==='controls'){
     if(options.hasTouch){await activate('#pauseBtn');await page.locator('#pauseBody').getByRole('button',{name:'Controls',exact:true}).tap();assert.equal(await page.evaluate(()=>App.game.paused),false);}
     else await activate('#btnKeys');
    }else if(menu==='supplies')await activate('#groundItemsToggle');else await activate('#pauseBtn');
    await page.waitForFunction(()=>!App.game.evade.attackWant&&!App.game.evade.primaryAttackDown);
    await page.keyboard.down('t');await page.keyboard.down('t');
    const open=await advancePrimary(.05);assert.equal(open.rounds,6);assert.equal(open.queued,0);
    if(menu==='controls')await activate('#legend [data-close-controls]');else if(menu==='supplies')await activate('#groundItemsClose');else await page.keyboard.press('Escape');
    const resumed=await advancePrimary(1.1);await page.keyboard.up('t');assert.equal(resumed.rounds,6);assert.equal(resumed.bullets,before.bullets);assert.equal(resumed.queued,0);
    blocked.push({menu,open,resumed});
   }
   record('Actual Controls Supplies and Pause discard queued primary actions and held menu keys cannot fire on close',blocked);
   const focusBefore=await select('pistol');
   await page.evaluate(()=>{const input=document.createElement('input');input.id='combatFocusFixture';input.setAttribute('aria-label','Declared text-focus input fixture');Object.assign(input.style,{position:'fixed',top:'120px',left:'20px',zIndex:'9999'});document.body.appendChild(input);});
   await page.locator('#combatFocusFixture').fill('t');await page.keyboard.press('t');const typed=await advancePrimary(.05);
   assert.equal(typed.rounds,6);assert.equal(typed.queued,0);assert.equal(typed.bullets,focusBefore.bullets);
   await page.locator('#combatFocusFixture').evaluate(n=>n.remove());const afterTyping=await advancePrimary(1.1);assert.equal(afterTyping.rounds,6);
   record('Native typing in a declared focused text input does not queue a weapon action during or after focus',{typed,afterTyping});
   // Declared UI-visibility fixture: briefly expose the original POW HUD over
   // this field encounter, without granting a POW stage, escape or equipment.
   // Attribute changes exercise the real mounted Camp/Condition details and
   // native T input while no unrelated text field holds focus.
   const powReading=[];
   for(const selector of ['.pow-tools-menu','.pow-condition']){
    const before=await select('pistol');
    const wasHidden=await page.evaluate(()=>{const n=document.getElementById('powHUD'),old=n.hidden;n.hidden=false;return old;});
    await page.keyboard.press('t');assert.equal(await page.evaluate(()=>App.game.evade.attackWant),1);
    const visible=await page.locator('#powHUD '+selector).evaluate(n=>{n.open=true;return n.getClientRects().length>0;});assert.equal(visible,true);
    await page.waitForFunction(()=>!App.game.evade.attackWant&&!App.game.evade.primaryAttackDown);
    await page.keyboard.press('t');assert.equal(await page.evaluate(()=>App.game.evade.attackWant||0),0);
    await page.locator('#powHUD '+selector).evaluate(n=>{n.open=false;});await page.evaluate(hidden=>{document.getElementById('powHUD').hidden=hidden;},wasHidden);
    const after=await advancePrimary(1.1);assert.equal(after.rounds,6);assert.equal(after.bullets,before.bullets);powReading.push({selector,visible,after});
   }
   record('Declared original Camp and Condition visibility consumes queued attacks and blocks native T without a later shot',powReading);
   const occlusion=await page.evaluate(()=>{const G=App.game;G.startCamp(1);const E=G.evade;E.locals=[];E.cattle=[];let fixture;for(const wall of G.campGeo){const d=G._solidHalf(wall.m,wall.s||1);if(!d)continue;const cs=Math.cos(wall.y||0),sn=Math.sin(wall.y||0);for(const side of [-1,1]){const x=wall.p[0]+side*(d[0]+.355)*cs,z=wall.p[2]+side*(d[0]+.355)*sn;if(G._campSolidAt(x,z,.35)||Math.hypot(x-E.p[0],z-E.p[2])<2)continue;const rows=[];for(const alive of [true,false]){const actor={p:[x,0,z],goal:[x+2,0,z],kind:'nva',armed:true,alive,kick:{a:Math.atan2(-side*cs,side*sn),v:3.4},downAt:G.t};E.searchers=[actor];const before=actor.p.slice();G._stepReactions(.2,E);rows.push({alive,before,after:actor.p.slice(),blocked:G._campSolidAt(actor.p[0],actor.p[2],.35),moved:Math.hypot(actor.p[0]-before[0],actor.p[2]-before[2])})}fixture={wall:{m:wall.m,p:wall.p,half:d,y:wall.y},rows};break}if(fixture)break}if(!fixture)throw Error('No original camp-wall fixture');return fixture});
   assert.ok(occlusion.rows.every(r=>!r.blocked&&r.moved<.02));record('original swept collision stops both living and fallen NPC knockback at a real camp wall',occlusion);await shot('original-wall-stops-reaction');
   const volume=await page.evaluate(()=>{const G=App.game;const a=__combatSet(0,8),e=G.evade;const options={floorAt:p=>p[1],eyeHeight:1.68};e.p[1]=0;a.p[1]=5;let q=GroundCombat.target(G,e,options);const flat=q===null;e.look=Math.atan2(5,8)+.04;q=GroundCombat.target(G,e,options);const raised=q&&q.actor===a;e.look=0;a.p[1]=0;const nearer={...a,p:[e.p[0],0,e.p[2]-4]};e.locals=[nearer];q=GroundCombat.target(G,e,options);const nearest=q&&q.actor===nearer;return {flat,raised,nearest}});assert.deepEqual(volume,{flat:true,raised:true,nearest:true});record('declared floor and nearer-body fixtures respect vertical placement and physical occlusion order',volume);
   const terrainFixture=await page.evaluate(()=>{const G=App.game;__combatSet(0,8);const e=G.evade,a=e.searchers[0],bx=e.p[0],bz=e.p[2],original=terrainH,base=Math.max(0,original(bx,bz));window.__combatOriginalTerrain=original;terrainH=function(x,z){if(Math.abs(x-bx)<.8&&Math.abs(z-bz)<.8)return base+.5;if(Math.abs(x-bx)<3&&Math.abs(z-(bz-4))<.5)return base+1.5;if(Math.abs(x-bx)<3&&z>=bz-9&&z<=bz+1)return base;return original(x,z)};const mb=new MB();mb.box(0,-.025,-4,3,.025,5,[.24,.2,.13]);mb.box(0,.25,0,.8,.25,.8,[.24,.2,.13]);mb.box(0,.75,-4,3,.75,.5,[.29,.25,.16]);G.rend.meshFromBuilder('groundCombatDeclaredRidge',mb);const instance=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,bx,base,bz,1,1,1,0]),end=G.rend.end;window.__combatOriginalEnd=end;G.rend.end=function(...args){this.drawMesh('groundCombatDeclaredRidge',instance,1);return end.apply(this,args)};const solve=height=>{const slope=(Math.max(0,terrainH(a.p[0],a.p[2]))+height-base-.5-1.68)/8;let lo=-.55,hi=1.15;for(let i=0;i<24;i++){const m=(lo+hi)/2;if((-.04+Math.sin(m))/Math.cos(m)<slope)lo=m;else hi=m}return (lo+hi)/2};const look=solve(.4),upperLook=solve(1.3);e.look=e.pitchCmd=look;const options={floorAt:p=>Math.max(0,terrainH(p[0],p[2])),eyeHeight:1.68,bodyHeight:()=>1.76,lineOfSight:o=>G._groundLineOfSight(e.p,o.p,e)},chestClear=options.lineOfSight(a),former=GroundCombat.target({pow:{}},e,options);e.look=upperLook;const upper=GroundCombat.target(G,e,options);e.look=e.pitchCmd=look;G.shake=0;G.flash=0;G._weapons(1/60,e,App,{});return {fixture:'Declared temporary flat 6x10m base corridor around the eight-metre encounter, with raised platform/ridge floor patches and matching MB baseplate/platform/ridge in the production GPU pass. Terrain outside the rectangle and all source files remain original. This is not a naturally encountered ridge or mission-success claim.',player:e.p.slice(),target:a.p.slice(),look,upperLook,chestClear,previousEligible:!!former,upperVisible:!!upper,aim:e.aim,base}});
   await fs.writeFile(path.join(out,name+'-terrain-fixture.json'),JSON.stringify(terrainFixture,null,2)+'\n');
   assert.equal(terrainFixture.aim,null);assert.equal(terrainFixture.chestClear,true);assert.equal(terrainFixture.previousEligible,true);assert.equal(terrainFixture.upperVisible,true);
   const beforeTerrainShot=await page.evaluate(()=>SurvivalAmmunition.view(App.game).bulletsExpended);let terrainSession;
   if(options.hasTouch){terrainSession=await context.newCDPSession(page);const b=await page.locator('#btnFire').boundingBox();await terrainSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:5}]});await terrainSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.evaluate(()=>App.game.evade.attackWant),1)}else{const b=await page.locator('#gl').boundingBox();assert.ok(b);await page.mouse.move(b.x+b.width*.52,b.y+b.height*.36);await page.mouse.down();assert.equal(await page.evaluate(()=>App.game.evade.primaryAttackDown),true,'Trusted primary pointer must hold the selected weapon');}
   let blockedShot;try{blockedShot=await page.evaluate(before=>{const G=App.game,e=G.evade,r=Math.random;Math.random=()=>0;try{G._weapons(1/60,e,App,App.keys)}finally{Math.random=r}return {rounds:e.rounds,wounds:e.searchers[0].wounds||0,expended:SurvivalAmmunition.view(G).bulletsExpended-before,aim:e.aim}},beforeTerrainShot)}finally{if(terrainSession)await terrainSession.detach();else{await page.mouse.up();assert.equal(await page.evaluate(()=>App.game.evade.primaryAttackDown),false,'Releasing primary pointer must clear selected-weapon hold');}}
   assert.deepEqual(blockedShot,{rounds:5,wounds:0,expended:1,aim:null});record('declared rendered terrain ridge blocks a leg-aimed accepted shot while higher visible body remains targetable',{...terrainFixture,shot:blockedShot});await shot('actual-terrain-blocks-lower-body');await page.evaluate(look=>{const G=App.game;G.shake=0;G.flash=0;G.evade.look=G.evade.pitchCmd=look;G._weapons(1/60,G.evade,App,{});if(G.evade.aim!==8)throw Error('Higher visible body must stay targetable')},terrainFixture.upperLook);await shot('visible-upper-body-above-declared-ridge');await page.evaluate(()=>{terrainH=window.__combatOriginalTerrain;App.rend.end=window.__combatOriginalEnd});
   assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);record('actual game, assets and WebGL complete without errors',{gl:await page.evaluate(()=>App.rend.gl.getError()),errors,missing});
  }finally{await context.close()}
 }
 const report={suite:'ground-combat',passed:true,checks,screenshots,browserErrors:errors,missing,physicalWindowsTested:false,actualIPhoneSafariTested:false,scope:'Actual Chromium/SwiftShader WebGL2 desktop and simulated iPhone landscape. Native primary-pointer/CDP accepted-fire and keyboard free-hand punch input plus declared actor/view/floor/wall fixtures call original _weapons, ammunition and _moveOnFoot. Camera shake is zeroed for projection/visibility measurements only. The ridge case declares a temporary flat 6x10m base corridor around the eight-metre encounter, raised platform/ridge floor patches and matching MB baseplate/platform/ridge geometry; terrain outside that rectangle remains original. It is not a naturally encountered terrain feature. Controlled Math.random=0 in isolated hit eligibility checks does not establish combat difficulty or full mission success. Original LOS remains conservative 2D solid sampling; capsules approximate source body proportions, not per-pixel silhouettes.'};await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');return report;
};
if(require.main===module)(async()=>{const {chromium}=require('playwright'),{createServer}=require('../tools/dev-server.cjs');const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{const report=await module.exports(browser,'http://127.0.0.1:'+server.address().port+'/',process.argv[2]||path.join(__dirname,'../test-results/ground-combat'));console.log(JSON.stringify({checks:report.checks.length,passed:report.passed}))}finally{await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
