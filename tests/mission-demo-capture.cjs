'use strict';
// CPU controller fixtures. The final case also executes the production
// ground tick, surrender action and water-speed adapter with declared flat
// land/water and unobstructed collision services. Native outcomes are separate.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixtureSource=fs.readFileSync(path.join(__dirname,'mission-demo.cjs'),'utf8');
const {fixture}=vm.runInNewContext(fixtureSource.slice(0,fixtureSource.indexOf("test('"))+'\n({fixture});',{require,__dirname,process,console});
const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),gameSource=index.slice(index.indexOf('class Game {'));
function readMethod(name){const start=gameSource.indexOf('\n  '+name+'('),body=gameSource.slice(start+1),end=body.slice(1).search(/\n  [A-Za-z_$][\w$]*\([^;\n]*\)\s*\{/);assert.ok(start>=0&&end>0,'Original Game.'+name+' exists');return body.slice(0,end+1);}
const clone=o=>JSON.parse(JSON.stringify(o));
function captureFixture(options={}){
 const f=fixture({terrain:options.terrain||(()=>12),pilot:options.pilot}),g=f.start('m11'),document={getElementById(){return null;},querySelectorAll(){return options.buttons||[];}};
 f.window.document=document;g.mis.escape=true;g.phase='evade';g.ac.onDeck=false;g.evade={p:[0,0,0],hdg:0,searchers:[],locals:[],handsUp:false,held:0,frozen:0,...options.evade};
 const original=vm.runInNewContext('({'+readMethod('raiseHands')+'}).raiseHands',{document});g.raiseHands=function(){g.raises=(g.raises||0)+1;return original.call(g);};g._groundLineOfSight=options.los||(()=>true);g.app.radio=()=>{};
 return {...f,g};
}
function guard(p,extra={}){return {p,alive:true,armed:true,...extra};}
function unaffected(g){return clone({p:g.evade.p,people:g.evade.searchers,locals:g.evade.locals,targets:g.world.targets,crew:g.ac.crew,bombs:g.ac.bombs,result:g.result,pow:g.pow});}

test('offshore capture practice swims toward the nearest actual living armed actor instead of setting an unpolled key',()=>{
 const f=captureFixture({terrain:()=>-20,evade:{hdg:-Math.PI/2,searchers:[guard([-930,0,20]),guard([-1200,0,0])],locals:[guard([0,0,-10],{armed:false}),guard([0,0,-5],{alive:false})]}}),g=f.g,before=unaffected(g);
 g.update(.05);assert.equal(g.app.gctl.pitch,1);assert.equal(g.app.gctl.run,1);assert.equal(g.raises,undefined);assert.equal(g.app.keys.KeyX||0,0);assert.ok(g.app.gctl.roll<.1);assert.match(f.M.snapshot(g).detail,/swims toward/);assert.deepEqual(unaffected(g),before);assert.equal(g.pow,undefined);f.M.stop(false);
});

test('surrender uses the original edge action once and waits for original custody rules',()=>{
 const f=captureFixture({evade:{searchers:[guard([0,0,-5])],weaponMode:'pistol',drawn:1}}),g=f.g,before=unaffected(g);g.update(.05);assert.equal(g.raises,1);assert.equal(g.evade.handsUp,true);assert.equal(g.evade.weaponMode,'fists');assert.equal(g.app.gctl.pitch,0);for(let i=0;i<40;i++)g.update(.05);assert.equal(g.raises,1,'held hands are not toggled each frame');assert.equal(g.app.gctl.run,0);assert.deepEqual(unaffected(g),before);assert.equal(g._capturePending,undefined);assert.equal(g.pow,undefined);f.M.stop(false);
});

test('capture requires both close range and the original line of sight before raising hands',()=>{
 for(const scenario of [{distance:5.6,los:true},{distance:5,los:false}]){const f=captureFixture({evade:{searchers:[guard([0,0,-scenario.distance])]},los:()=>scenario.los}),g=f.g;g.update(.05);assert.equal(g.raises,undefined,JSON.stringify(scenario));assert.equal(g.evade.handsUp,false);assert.equal(g.app.gctl.pitch,1);assert.equal(g.pow,undefined);f.M.stop(false);}
});

test('hands raised too far from a captor are lowered by the same original action before travel resumes',()=>{
 const f=captureFixture({terrain:()=>-20,evade:{handsUp:true,searchers:[guard([0,0,-900])]}}),g=f.g;g.update(.05);assert.equal(g.raises,1);assert.equal(g.evade.handsUp,false);assert.equal(g.app.gctl.pitch,1);assert.equal(g.app.gctl.run,1);assert.equal(g.pow,undefined);f.M.stop(false);
});

test('absent captors trigger a bounded real-terrain shoreline search without creating actors or captivity',()=>{
 let samples=0;const f=captureFixture({terrain:(x,z)=>{samples++;return x>500?12:-20;},evade:{hdg:Math.PI/2}}),g=f.g,before=unaffected(g);g.update(.05);assert.ok(samples<=114,'shore search uses seven bounded rings of sixteen samples');assert.equal(g.app.gctl.pitch,1);assert.equal(g.app.gctl.run,1);assert.equal(g.raises,undefined);assert.deepEqual(unaffected(g),before);assert.equal(g.pow,undefined);f.M.stop(false);
});

test('an all-water shoreline search stays bounded and reports awaiting contact rather than granting capture',()=>{
 let samples=0;const f=captureFixture({terrain:()=>{samples++;return -20;}}),g=f.g,before=unaffected(g);g.update(1/60);assert.equal(samples,113);g.update(1/60);assert.equal(samples,114,'an unsuccessful terrain search is cached rather than repeated every frame');assert.equal(g.app.gctl.pitch,0);assert.equal(g.raises,undefined);assert.deepEqual(unaffected(g),before);assert.equal(g.pow,undefined);f.M.stop(false);
});

test('existing first-contact surrender choices run before any approach or hands action',()=>{
 let clicks=0;const f=captureFixture({buttons:[{textContent:'Go quietly — surrender',click(){clicks++;}}],evade:{held:1,searchers:[guard([0,0,-5])]}}),g=f.g;g.update(.05);assert.equal(clicks,1);assert.equal(g.raises,undefined);assert.equal(g.app.gctl.pitch,0);assert.equal(g.app.gctl.run,0);f.M.stop(false);
});

test('a frozen or already transferring actor receives no new movement or surrender request',()=>{
 for(const transferring of [false,true]){const f=captureFixture({evade:{frozen:!transferring,searchers:[guard([0,0,-5])]}}),g=f.g;if(transferring)g._capturePending=true;g.update(.05);assert.equal(g.raises,undefined);assert.equal(g.app.gctl.pitch,0);assert.equal(g.app.gctl.run,0);assert.equal(g.pow,undefined);f.M.stop(false);}
});

test('actual ground movement and water limits close the gap before original surrender timing can capture',()=>{
 const terrain=x=>x>0?-20:12,f=captureFixture({terrain,pilot:function(dt){this.stepEvade(dt);return {};},evade:{p:[10,0,0],hdg:-Math.PI/2,t:0,chute:[10,0],pickup:[100,100],searchers:[guard([-10,0,0],{goal:[-10,0,0],seen:0,sus:0,kind:'nva'})],locals:[],spawn:1e9,cowT:1e9,exposure:0,radio:0,lastTx:-99,rescue:0,eta:120,rounds:0}}),g=f.g;
 const context={window:f.window,document:f.window.document,Math,Number,PI:Math.PI,TAU:Math.PI*2,DEG:Math.PI/180,IS_TOUCH:false,terrainH:terrain,rnd:(a,b)=>(a+b)/2,clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),GroundView:{holdPitch:()=>false},Wildlife:{movementFactor:()=>1},AviatorCompanion:{movementFactor:()=>1},GroundItems:{movementFactor:()=>1,visibilityFactor:()=>1}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/survival/ground-controls.js'),'utf8'),{window:f.window});context.GroundControls=f.window.GroundControls;
 g.stepEvade=vm.runInNewContext('({'+readMethod('stepEvade')+'}).stepEvade',context);g.app.audio={on:false};g.app.vn=()=>{};g._moveOnFoot=(x,z,dx,dz)=>[x+dx,z+dz];g._coverAt=()=>1;g._groundAwareness=()=>false;g._localSolidAt=()=>false;
 for(const name of ['_groundFootfalls','_noticeAtCloseRange','_stepCattle','_stepLivingWorld','_stepReactions','_pushPeople','_weapons','_stepCSAR'])g[name]=()=>{};
 // Install only the production water-speed wrapper around this real tick.
 const adapterClass=function(){};adapterClass.prototype={stepEvade:g.stepEvade,_moveOnFoot:g._moveOnFoot,_groundFootfalls:g._groundFootfalls};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/survival/landing-water.js'),'utf8'),{window:f.window,console});assert.equal(f.window.LandingWater.install({Game:adapterClass,terrainH:terrain}),true);for(const name of ['stepEvade','_moveOnFoot','_groundFootfalls'])g[name]=adapterClass.prototype[name];
 let captures=0,firstHandsAt=null,capturedAt=null;g.captured=()=>{captures++;capturedAt=g.t;g._capturePending=true;};const start=g.evade.p.slice();g.update(.05);assert.equal(captures,0);assert.ok(Math.hypot(g.evade.p[0]-start[0],g.evade.p[2]-start[2])<=1.35*.05+.001,'water motion obeys production stroke speed');
 for(let i=0;i<1000&&!captures;i++){g.update(.05);if(g.evade.handsUp&&firstHandsAt===null)firstHandsAt=g.t;}
 assert.equal(captures,1);assert.ok(firstHandsAt>=(20-5.5)/(1.35+1.7)-.05,'both original actors must physically close the initial20m gap');assert.ok(capturedAt-firstHandsAt>1,'original held surrender time is earned');assert.ok(Math.hypot(g.evade.p[0]-g.evade.searchers[0].p[0],g.evade.p[2]-g.evade.searchers[0].p[2])<7);assert.equal(g.raises,1);assert.equal(g.result,null);assert.equal(g.pow,undefined,'the CPU outcome hook records capture rather than fabricating a prison state');f.M.stop(false);
});

test('capture tutorial escapes an actual reported rip parallel to shore without granting landfall or custody',()=>{const f=captureFixture({terrain:()=>-20,evade:{hdg:Math.PI}}),g=f.g,before=unaffected(g);f.window.RipCurrent={sample:()=>({strength:1,lateral:2,channel:{tangent:[0,1]}})};g.update(.05);assert.equal(g.app.gctl.pitch,1);assert.equal(g.app.gctl.run,0);assert.ok(Math.abs(g.app.gctl.turn)<.001);assert.match(f.M.snapshot(g).detail,/parallel to shore/);assert.deepEqual(unaffected(g),before);assert.equal(g.raises,undefined);f.M.stop(false);});

test('a physically stalled shoreline approach chooses a clear detour without moving the actor or granting custody',()=>{const f=captureFixture({terrain:x=>x<-10?12:-20,evade:{hdg:-Math.PI/2}}),g=f.g,before=unaffected(g);let probes=0;g._blockedAt=()=>{probes++;return false;};for(let i=0;i<150;i++)g.update(.05);assert.ok(probes>=4);assert.match(f.M.snapshot(g).detail,/clear route around/);assert.deepEqual(unaffected(g),before);assert.equal(g.raises,undefined);assert.equal(g.pow,undefined);f.M.stop(false);});
