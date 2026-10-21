'use strict';
// Camera/input domain fixtures execute production code with an explicit DOM
// double. Actual pointer lock/touch and rendering are verified separately.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/survival/ground-view.js'),'utf8');
function fixture(){const events={},stack={},doc={hidden:false,pointerLockElement:null,activeElement:null,getElementById:id=>id==='stack'?stack:null,addEventListener:(n,f)=>(events[n]??=[]).push(f)};const window={document:doc,addEventListener:(n,f)=>(events[n]??=[]).push(f)};vm.runInNewContext(source,{window,Math,Number,Object,Array,WeakMap});const g={phase:'evade',t:1,paused:false,evade:{p:[1,2,3],hdg:0,pitchCmd:0,look:0,crouch:false}},App={game:g,screen:'game',set:{sens:1},gctl:{mx:.3,my:.4}};const M=window.GroundView;M.install({App});return{M,g,App,doc,events,stack};}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('fresh ground view starts at the actual current posture without changing the actor',()=>{const f=fixture(),before=JSON.stringify(f.g);assert.equal(f.M.eyeHeight(f.g,1.68),1.68);assert.equal(JSON.stringify(f.g),before);const c=fixture();c.g.evade.crouch=true;assert.equal(c.M.eyeHeight(c.g,1.16),1.16);});
test('crouch eye moves continuously while physical crouch and actor feet change immediately only through original input',()=>{const f=fixture();f.M.eyeHeight(f.g,1.68);f.g.evade.crouch=true;const p=f.g.evade.p.slice();f.M.step(f.g,1/60);const h=f.M.eyeHeight(f.g,1.16);assert.ok(h<1.68&&h>1.16);assert.equal(f.g.evade.crouch,true);assert.deepEqual(f.g.evade.p,p);});
test('30, 60 and 120 Hz produce the same crouch and standing response for equal simulated time',()=>{
  for(const target of [true,false])for(const seconds of [.1,.25,.5]){
    const heights=[];
    for(const hz of [30,60,120]){
      const f=fixture();f.g.evade.crouch=!target;
      f.M.eyeHeight(f.g,f.g.evade.crouch?1.16:1.68);f.g.evade.crouch=target;
      let elapsed=0;
      while(elapsed<seconds-1e-12){const dt=Math.min(1/hz,seconds-elapsed);f.M.step(f.g,dt);elapsed+=dt;}
      heights.push(f.M.eyeHeight(f.g,target?1.16:1.68));
    }
    near(heights[0],heights[1]);near(heights[1],heights[2]);
    const origin=target?1.68:1.16,destination=target?1.16:1.68;
    near(heights[0],origin+(destination-origin)*(1-Math.exp(-12*seconds)));
  }
});
test('stance remains bounded and settles without bobbing, overshoot or changing walking positions',()=>{const f=fixture();f.M.eyeHeight(f.g,1.68);for(let cycle=0;cycle<12;cycle++){f.g.evade.crouch=!f.g.evade.crouch;for(let i=0;i<90;i++){f.M.step(f.g,1/60);const h=f.M.eyeHeight(f.g,f.g.evade.crouch?1.16:1.68);assert.ok(h>=1.16&&h<=1.68);}}assert.equal(f.M.eyeHeight(f.g,1.68),1.68);assert.deepEqual(f.g.evade.p,[1,2,3]);});
test('render reads and duplicate reads do not advance stance animation',()=>{const f=fixture();f.M.eyeHeight(f.g,1.68);f.g.evade.crouch=true;const before=f.M.view(f.g);for(let i=0;i<500;i++)assert.equal(f.M.eyeHeight(f.g,1.16),before.height);assert.deepEqual(f.M.view(f.g),before);});
test('pause freezes a mid-transition camera and unpause resumes without a height jump',()=>{const f=fixture();f.M.eyeHeight(f.g,1.68);f.g.evade.crouch=true;f.M.step(f.g,.05);const before=f.M.view(f.g).height;f.g.paused=true;for(let i=0;i<30;i++)assert.equal(f.M.step(f.g,.1),false);assert.equal(f.M.eyeHeight(f.g,1.16),before);f.g.paused=false;f.M.step(f.g,.01);assert.ok(f.M.view(f.g).height<before&&f.M.view(f.g).height>1.16);});
test('menu, stale owner, graphics context loss, completion and hidden document do not advance stance',()=>{for(const condition of ['menu','stale','context','complete','hidden','result']){const f=fixture();f.M.eyeHeight(f.g,1.68);f.g.evade.crouch=true;if(condition==='menu')f.App.screen='ready';if(condition==='stale')f.App.game={};if(condition==='context')f.App.graphicsContextLost=true;if(condition==='complete')f.g.pow={complete:true};if(condition==='hidden')f.doc.hidden=true;if(condition==='result')f.g.result={pass:false};assert.equal(f.M.step(f.g,.1),false,condition);assert.equal(f.M.eyeHeight(f.g,1.16),1.68,condition);}});
test('invalid or negative time cannot advance or poison the camera',()=>{const f=fixture();f.M.eyeHeight(f.g,1.68);f.g.evade.crouch=true;for(const dt of [NaN,Infinity,-1,undefined,0])assert.equal(f.M.step(f.g,dt),false);assert.equal(f.M.view(f.g).height,1.68);});
test('a delayed frame has bounded easing without snapping directly to crouch',()=>{const f=fixture();f.M.eyeHeight(f.g,1.68);f.g.evade.crouch=true;f.M.step(f.g,7);const h=f.M.view(f.g).height;assert.ok(h>1.16&&h<1.2);});
test('large checkpoint/vertical transitions reset the presentation to the saved current posture',()=>{for(const axis of [0,1]){const f=fixture();f.M.eyeHeight(f.g,1.68);f.g.evade.crouch=true;f.g.evade.p[axis]+=axis===0?80:4;f.M.step(f.g,.01);assert.equal(f.M.view(f.g).height,1.16);}});
test('fresh actor and explicit reset cannot carry an old stance animation into a new chapter',()=>{const f=fixture();f.M.eyeHeight(f.g,1.68);f.g.evade.crouch=true;f.M.step(f.g,.02);f.g.evade={...f.g.evade,p:[2,3,4]};assert.equal(f.M.eyeHeight(f.g,1.16),1.16);f.g.evade.crouch=false;assert.equal(f.M.reset(f.g),true);assert.equal(f.M.eyeHeight(f.g,1.68),1.68);});
test('river underwater/boat eye heights remain owned by the original river system',()=>{const f=fixture();f.M.eyeHeight(f.g,1.68);f.g.pow={river:{eyeHeight:.25}};assert.equal(f.M.step(f.g,.1),false);for(const raw of [.25,.8,1.3,2])assert.equal(f.M.eyeHeight(f.g,raw),raw);});
test('flight and parachute camera heights are returned unchanged',()=>{const f=fixture();delete f.g.evade;assert.equal(f.M.eyeHeight(f.g,.92),.92);assert.equal(f.M.step(f.g,.1),false);f.g.evade={p:[1,2,3]};f.g.phase='chute';assert.equal(f.M.eyeHeight(f.g,1.68),1.68);assert.equal(f.M.step(f.g,.1),false);});
test('private stance cache never changes actor, saved state, flags, routes, crew or physics',()=>{const f=fixture();f.g.pow={stats:{fatigue:20},flags:{doorOpen:true}};f.g.evade.route=[[1,2,3]];f.M.eyeHeight(f.g,1.68);f.g.evade.crouch=true;const before=JSON.stringify(f.g);for(let i=0;i<100;i++)f.M.step(f.g,.01);assert.equal(JSON.stringify(f.g),before);});
test('legacy pointer lock applies event deltas directly without writing aircraft mouse accumulators',()=>{const f=fixture();f.doc.pointerLockElement=f.stack;const mouse={...f.App.gctl};assert.equal(f.M.mouse(f.g,{movementX:40,movementY:-20}),true);near(f.g.evade.hdg,.1);near(f.g.evade.look,.05);assert.deepEqual(f.App.gctl,mouse);assert.equal(f.M.holdPitch(f.g),true);});
test('event partitioning does not change the final horizontal look angle',()=>{const a=fixture(),b=fixture();a.doc.pointerLockElement=a.stack;b.doc.pointerLockElement=b.stack;a.M.mouse(a.g,{movementX:120,movementY:-60});for(let n=0;n<12;n++)b.M.mouse(b.g,{movementX:10,movementY:-5});near(a.g.evade.hdg,b.g.evade.hdg);near(a.g.evade.look,b.g.evade.look);});
test('sensitivity is respected, nonfinite event deltas ignored and pitch constrained to existing legacy limits',()=>{const f=fixture();f.doc.pointerLockElement=f.stack;f.App.set.sens=2;f.M.mouse(f.g,{movementX:20,movementY:-1e5});near(f.g.evade.hdg,.1);assert.equal(f.g.evade.look,1.15);f.M.mouse(f.g,{movementX:NaN,movementY:1e5});near(f.g.evade.hdg,.1);assert.equal(f.g.evade.look,-.55);f.M.mouse(f.g,{movementX:Infinity,movementY:NaN});assert.ok(Number.isFinite(f.g.evade.look));});
test('flight, POW, unlocked, paused, menu, stale and hidden input cannot change legacy look',()=>{for(const condition of ['flight','pow','unlocked','paused','menu','stale','hidden','context','input']){const f=fixture();f.doc.pointerLockElement=f.stack;if(condition==='flight')delete f.g.evade;if(condition==='pow')f.g.pow={};if(condition==='unlocked')f.doc.pointerLockElement=null;if(condition==='paused')f.g.paused=true;if(condition==='menu')f.App.screen='ready';if(condition==='stale')f.App.game={};if(condition==='hidden')f.doc.hidden=true;if(condition==='context')f.App.graphicsContextLost=true;if(condition==='input')f.doc.activeElement={closest:()=>({})};const before=JSON.stringify(f.g);assert.equal(f.M.mouse(f.g,{movementX:200,movementY:100}),false,condition);assert.equal(JSON.stringify(f.g),before,condition);assert.equal(f.M.holdPitch(f.g),false,condition);}});
test('declared App mouse-lock flag without actual browser pointer lock never rotates the view',()=>{const f=fixture();f.App.mouseLocked=true;assert.equal(f.M.mouse(f.g,{movementX:100}),false);assert.equal(f.g.evade.hdg,0);});
test('installation is idempotent and pointer-lock loss/blur flush only ground flight accumulators',()=>{const f=fixture();assert.equal(f.M.install({App:f.App}),false);assert.equal(f.events.pointerlockchange.length,1);assert.equal(f.events.blur.length,1);f.events.pointerlockchange[0]();assert.deepEqual(f.App.gctl,{mx:0,my:0});f.App.gctl.mx=.4;delete f.g.evade;f.events.blur[0]();assert.equal(f.App.gctl.mx,.4);});

test('switching from eased keyboard look to the mouse starts at the current visible pitch',()=>{const f=fixture();f.doc.pointerLockElement=f.stack;f.g.evade.pitchCmd=-.35;f.g.evade.look=.2;f.M.mouse(f.g,{movementX:0,movementY:-20});near(f.g.evade.look,.25);near(f.g.evade.pitchCmd,.25);});

function touchFixture(){
 const events={},captured=new Set();
 const stack={addEventListener:(n,f)=>(events['stack:'+n]??=[]).push(f),setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)};
 const canvas={addEventListener:(n,f)=>(events['gl:'+n]??=[]).push(f)};
 const doc={hidden:false,pointerLockElement:null,activeElement:null,getElementById:id=>id==='stack'?stack:id==='gl'?canvas:null,addEventListener:(n,f)=>(events[n]??=[]).push(f)};
 const window={innerWidth:844,document:doc,addEventListener:(n,f)=>(events[n]??=[]).push(f)};
 vm.runInNewContext(source,{window,Math,Number,Object,Array,WeakMap});
 const g={phase:'evade',t:1,paused:false,evade:{p:[1,2,3],hdg:0,pitchCmd:0,look:0,crouch:false}},App={game:g,screen:'game',set:{sens:1},gctl:{mx:.3,my:.4},pause(on){g.paused=!!on},show(screen){this.screen=screen}};
 const M=window.GroundView;M.install({App});
 const emit=(name,extra={})=>{const event={pointerId:1,pointerType:'touch',clientX:510,clientY:190,target:{closest:()=>null},preventDefault(){this.prevented=true},...extra};for(const f of events[name]||[])f(event);return event};
 return{M,g,App,doc,events,stack,captured,emit};
}
test('legacy right drag uses visible pitch, sensitivity and exact touch deltas while retaining aim after release',()=>{
 const f=touchFixture();f.App.set.sens=2;f.g.evade.look=.2;f.g.evade.pitchCmd=-.3;
 f.emit('stack:pointerdown');f.emit('stack:pointermove',{clientX:530,clientY:180});near(f.g.evade.hdg,.24);near(f.g.evade.look,.32);assert.ok(f.captured.has(1));
 f.emit('stack:pointerup');assert.equal(f.captured.size,0);assert.equal(f.M.holdPitch(f.g),true);assert.deepEqual(f.App.gctl,{mx:.3,my:.4});
 f.emit('stack:pointerdown');near(f.g.evade.look,.32);f.emit('stack:pointermove',{clientY:-1e6});assert.equal(f.g.evade.look,1.15);f.emit('stack:pointermove',{clientY:1e6});assert.equal(f.g.evade.look,-.55);
});
test('touch aiming leaves mouse, left stick, buttons, POW, held encounters and inactive games to their original controls',()=>{
 for(const condition of ['mouse','left','button','pow','held','paused','menu','hidden','context','stale','input']){
  const f=touchFixture();let extra={};if(condition==='mouse')extra.pointerType='mouse';if(condition==='left')extra.clientX=100;if(condition==='button')extra.target={closest:()=>({})};
  if(condition==='pow')f.g.pow={};if(condition==='held')f.g.evade.held=true;if(condition==='paused')f.g.paused=true;if(condition==='menu')f.App.screen='ready';if(condition==='hidden')f.doc.hidden=true;if(condition==='context')f.App.graphicsContextLost=true;if(condition==='stale')f.App.game={};if(condition==='input')f.doc.activeElement={closest:()=>({})};
  const before=JSON.stringify(f.g);f.emit('stack:pointerdown',extra);f.emit('stack:pointermove',{...extra,clientX:650,clientY:100});assert.equal(JSON.stringify(f.g),before,condition);assert.equal(f.captured.size,0,condition);
 }
});
test('pause, menu, blur, hidden tab and graphics loss cancel held drags without a resumed movement jump',()=>{
 for(const reason of ['pause','menu','blur','hidden','context']){
  const f=touchFixture();f.emit('stack:pointerdown');f.emit('stack:pointermove',{clientX:530,clientY:180});const before={hdg:f.g.evade.hdg,look:f.g.evade.look};
  if(reason==='pause'){f.App.pause(true);f.App.pause(false)}if(reason==='menu'){f.App.show('ready');f.App.show('game')}if(reason==='blur')f.emit('blur');if(reason==='hidden'){f.doc.hidden=true;f.emit('visibilitychange');f.doc.hidden=false}if(reason==='context')f.emit('gl:webglcontextlost');
  f.emit('stack:pointermove',{clientX:700,clientY:50});assert.deepEqual({hdg:f.g.evade.hdg,look:f.g.evade.look},before,reason);assert.equal(f.captured.size,0,reason);
  f.emit('stack:pointerdown');f.emit('stack:pointermove',{clientX:520,clientY:185});near(f.g.evade.hdg,before.hdg+.06);near(f.g.evade.look,before.look+.03);
 }
});
test('checkpoint owner changes and lost capture cannot transfer held touch input to another actor',()=>{
 const f=touchFixture();f.emit('stack:pointerdown');f.emit('stack:pointermove',{clientX:530,clientY:180});f.g.evade={...f.g.evade,p:[7,2,3]};const before=JSON.stringify(f.g.evade);f.App.show('game');f.emit('stack:pointermove',{clientX:700,clientY:80});assert.equal(JSON.stringify(f.g.evade),before);assert.equal(f.M.holdPitch(f.g),false);
 f.emit('stack:pointerdown');f.emit('stack:lostpointercapture');f.emit('stack:pointermove',{clientX:700,clientY:80});assert.equal(JSON.stringify(f.g.evade),before);assert.equal(f.captured.size,0);
});
test('a second finger can operate another control without replacing the first look pointer',()=>{
 const f=touchFixture();f.emit('stack:pointerdown');f.emit('stack:pointerdown',{pointerId:2,clientX:700,clientY:300,target:{closest:()=>({})}});f.emit('stack:pointermove',{pointerId:2,clientX:800,clientY:50});near(f.g.evade.hdg,0);f.emit('stack:pointermove',{clientX:520,clientY:185});near(f.g.evade.hdg,.06);near(f.g.evade.look,.03);assert.ok(f.captured.has(1));assert.equal(f.captured.size,1);
});
