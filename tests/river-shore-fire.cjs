'use strict';
// Actual saved actors, POW line of sight and AI post ownership. This does not
// establish rendered quality, hardware FPS or physical iPhone behavior.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),clone=v=>JSON.parse(JSON.stringify(v));
function fixture(options={}){
 const messages=[],tracers=[],w={document:{hidden:false,getElementById:()=>null}},math=Object.create(Math);math.random=()=>{throw Error('Shore fire must not consume gameplay RNG');};const c=vm.createContext({window:w,document:w.document,Math:math});
 vm.runInContext(read('assets/pow/core.js'),c);vm.runInContext(read('assets/pow/ai.js'),c);const P=w.POW;P.notify=(g,text)=>messages.push(text);P.River={step(){return true;},movePursuer(){return false;}};
 vm.runInContext(read('assets/survival/river-threats.js'),c);const app={screen:'game',set:{sound:0},keys:{},gctl:{},radio(){}};class Game{render(){}};
 const g=new Game();Object.assign(g,{app,t:0,phase:'evade',world:{score:{hits:0,killed:0},fx:{streak:(...a)=>tracers.push(a)}},pow:{stage:'river',time:0,base:[0,0,0],nav:{xmin:-16,xmax:204,zmin:-110,zmax:235,cell:1},solids:[],surfaces:[],objects:[],stats:{physical:90,fatigue:0},flags:{},input:{forward:0,strafe:0},river:{phase:'gulf',mode:'float',waterY:10,routeOriginZ:0,streamOffset:0,logicalDistance:96000,currentWorldMps:.1,damageCooldown:0,daylight:1,rain:0,breath:100}},evade:{p:[94,9.58,options.z||0],searchers:[],locals:[],frozen:false,held:0}});app.game=g;w.RiverThreats.install({Game,App:app,POW:P});
 const advance=(seconds,ai=false)=>{for(let i=0;i<Math.ceil(seconds*10);i++){g.t+=.1;g.pow.time+=.1;g.pow.river.damageCooldown=Math.max(0,g.pow.river.damageCooldown-.1);P.River.step(g,.1);if(ai)P.AI.step(g,.1);}};
 return{g,w,P,R:w.RiverThreats,messages,tracers,advance};
}

test('gulf creates two real, separate NVA and VC shore actors without arming civilians',()=>{const {g,R,advance}=fixture();const civilian={id:'existing-fisher',kind:'farmer',armed:false,p:[120,10.35,-75],alive:true};g.evade.searchers.push(civilian);advance(.1);const v=R.view(g);assert.equal(v.coastal,true);assert.deepEqual(v.shorePosts.map(a=>a.kind).sort(),['nva','vc']);assert.equal(g.evade.searchers.length,3);assert.equal(civilian.armed,false);assert.equal(civilian.kind,'farmer');assert.ok(v.shorePosts.every(a=>a.p[1]===10.35&&a.p[2]>=-105&&a.p[2]<-61));assert.equal(g.pow.actors,g.evade.searchers);assert.equal(g.pow.flags.capturePending,undefined);});

test('shore warnings precede real visible rifle tracers and both factions can fire',()=>{const f=fixture(),{g,R,advance,messages,tracers}=f;advance(1.5);assert.equal(tracers.length,0);assert.ok(messages.some(m=>/NVA and VC/.test(m)));advance(6);assert.ok(tracers.length>0);assert.equal(R.view(g).lastShooter.kind,'nva');const nva=g.evade.searchers.find(a=>a.kind==='nva');nva.alive=false;advance(12);assert.equal(R.view(g).lastShooter.kind,'vc');assert.ok(R.view(g).lastShooter.distance<=R.limits.coastalRifleRange);assert.ok(tracers.every(t=>t[4]>=.5));assert.deepEqual(g.world.score,{hits:0,killed:0});});

test('surface skiff remains exposed to shore fire while a real dive immediately stops it',()=>{const {g,R,advance,tracers}=fixture();g.pow.river.boatOwned=true;g.pow.river.mode='boat';advance(9);assert.ok(tracers.length>0);const n=tracers.length;g.pow.river.boatOwned=false;g.pow.river.mode='swim';g.pow.river.submerged=true;advance(18);assert.equal(tracers.length,n);assert.equal(R.view(g).submerged,true);assert.ok(R.view(g).shorePosts.every(a=>a.exposure===0));});

test('physical line-of-sight walls, turned backs and real hull occlusion prevent shore fire',()=>{for(const kind of['wall','back','hull']){const {g,w,advance,tracers}=fixture();advance(.1);if(kind==='wall')g.pow.solids.push({id:'actual-shore-wall',x:94,z:-40,hw:60,hl:.4,yMin:9,yMax:16,active:true});if(kind==='back')for(const a of g.evade.searchers)a.face=0;if(kind==='hull')w.FishingBoats={hullOccludes:()=>true};advance(24);assert.equal(tracers.length,0,kind);}});

test('beyond the fixed coastal range there are no phantom offshore shots',()=>{const {g,R,advance,tracers}=fixture({z:180});advance(30);assert.equal(tracers.length,0);assert.ok(R.view(g).shorePosts.every(a=>!a.visible));assert.equal(g.pow.stats.physical,90);});

test('close checkpoints do not materialize new riflemen beside the swimmer',()=>{const {g,R,advance}=fixture({z:-65});advance(10);assert.equal(R.view(g).shorePosts.length,0);g.evade.p[2]=0;advance(.1);assert.equal(R.view(g).shorePosts.length,2);});

test('saved dead and live posts remain distinct and are not respawned on restore',()=>{const a=fixture();a.advance(.1);a.g.evade.searchers[0].alive=false;const b=fixture();b.g.pow.river=clone(a.g.pow.river);b.g.evade.searchers=clone(a.g.evade.searchers);b.advance(10);assert.equal(b.g.evade.searchers.length,2);assert.equal(b.g.evade.searchers[0].alive,false);assert.equal(b.R.view(b.g).lastShooter.kind,'vc');});

test('ordinary AI keeps shore posts on land and does not send them walking across the ocean',()=>{const {g,advance}=fixture();advance(.1);const initial=g.evade.searchers.map(a=>a.p.slice());advance(25,true);assert.deepEqual(g.evade.searchers.map(a=>a.p.slice()),initial);assert.ok(g.evade.searchers.every(a=>!a.swimming&&a.spd===0));});

test('pause, completed pickup and non-river scenes stop coast attacks',()=>{const {g,R,advance,tracers}=fixture();advance(8);const before=clone(R.view(g)),n=tracers.length;g.paused=true;advance(10);assert.deepEqual(clone(R.view(g)),before);g.paused=false;g.pow.complete=true;advance(10);assert.equal(tracers.length,n);assert.equal(R.view(g).active,false);g.pow.river=null;assert.equal(R.view(g).active,false);});

test('far shots have visible misses and bounded damage while the rescue remains unresolved',()=>{const {g,R,advance,tracers}=fixture({z:115});g.pow.river.signaling=true;advance(75);assert.ok(tracers.length>0);assert.ok(R.view(g).lastShooter.distance>160);assert.equal(g.pow.stats.physical,90);assert.equal(g.pow.complete,undefined);assert.equal(g.pow.flags.fictionalRescue,undefined);});


test('coastal floating cover is reachable and reduces exposed silhouette without preventing a real dive',()=>{const a=fixture(),b=fixture();a.advance(.1);b.advance(.1);a.g.evade.p=[98,9.58,10.01];b.g.evade.p=[98,9.58,10.01];assert.equal(a.R.takeCover(a.g),true);assert.equal(a.R.view(a.g).cover,'log');a.advance(2);b.advance(2);const hidden=a.R.view(a.g).shorePosts[0],exposed=b.R.view(b.g).shorePosts[0];assert.ok(hidden.exposure<exposed.exposure*.45,JSON.stringify({hidden,exposed,view:a.R.view(a.g)}));a.g.pow.river.submerged=true;a.advance(.1);assert.equal(a.R.view(a.g).cover,null);assert.equal(a.R.concealment(a.g),0);});
