'use strict';
// CPU/canvas-adapter and DOM event tests. Actual WebGL2 assets and touch layout
// require the separate native ground-items browser gate.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/render/ground-items-render.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/items/manifest.json')));
function fixture(o={}){
 const nodes=new Map(),draws=[],uploads=[],deleted=[],surfaceCalls=[],handlers=new Map(),calls={interact:0,equip:[]};
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.attributes={};this.hidden=false;}
  set id(v){this._id=v;nodes.set(v,this);}get id(){return this._id;}
  appendChild(v){this.children.push(v);v.parentNode=this;return v;}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k];}
  addEventListener(k,fn){(this.listeners[k]||(this.listeners[k]=[])).push(fn);}
  fire(k,event={}){for(const fn of this.listeners[k]||[])fn(event);}focus(){this.focused=true;}
  getContext(){const cv=this;return {drawImage(...args){draws.push(args);},getImageData(){const d=new Uint8ClampedArray(cv.width*cv.height*4);for(let y=5;y<cv.height-5;y++)for(let x=5;x<cv.width-5;x++)d[(y*cv.width+x)*4+3]=o.opaque?0:255;return {data:d};}};}
 }
 const document={hidden:false,createElement:tag=>new Element(tag),getElementById:id=>nodes.get(id)||null};document.body=new Element('body');const stack=new Element('div');stack.id='stack';document.body.appendChild(stack);
 const inventory={version:1,stick:true,rifle:true,rifleAmmo:12,foliage:true,hat:true,energy:.75,foodEaten:0};
 let rows=[],target=null,pendingImage=null;
 const window={document,matchMedia:()=>({matches:!!o.touch}),fetch:async()=>({ok:!o.httpFail,status:503,json:async()=>JSON.parse(JSON.stringify(manifest))}),GroundCombat:{hands:()=>o.slots||{left:null,right:null}},GroundItems:{items:()=>JSON.parse(JSON.stringify(rows)),inventory:()=>({...inventory}),target:()=>target&&JSON.parse(JSON.stringify(target)),interact(){calls.interact++;target=null;return true;},equip(g,mode){calls.equip.push(mode);return true;}},WildlifeRender:{drawSurfaces(g,r,list){surfaceCalls.push(list);return Math.min(4,list.length);}}};
 window.Image=class{constructor(){this.naturalWidth=1254;this.naturalHeight=1254;}set src(v){this.srcValue=v;if(o.deferred)pendingImage=this;else queueMicrotask(()=>o.imageFail?this.onerror():this.onload());}};
 const math=Object.create(Math);math.random=()=>{throw Error('Presentation may not consume gameplay RNG');};vm.runInNewContext(source,{window,Math:math});
 const gl={TEXTURE_2D:1,TEXTURE_MIN_FILTER:2,LINEAR_MIPMAP_LINEAR:3,TEXTURE_MAG_FILTER:4,LINEAR:5,TEXTURE_WRAP_S:6,TEXTURE_WRAP_T:7,CLAMP_TO_EDGE:8,ACTIVE_TEXTURE:9,TEXTURE_BINDING_2D:10,UNPACK_FLIP_Y_WEBGL:11,UNPACK_PREMULTIPLY_ALPHA_WEBGL:12,bound:'original',active:91,flip:false,premult:false,parameters:[],isContextLost:()=>!!o.lost,getParameter(k){return ({9:this.active,10:this.bound,11:this.flip,12:this.premult})[k];},activeTexture(v){this.active=v;},bindTexture(k,v){this.bound=v;},generateMipmap(){if(o.mipFail)throw Error('GPU mip failure');},getError(){return o.glError?1285:0;},texParameteri(k,p,v){this.parameters.push([p,v]);},pixelStorei(k,v){if(k===11)this.flip=v;else if(k===12)this.premult=v;},deleteTexture(t){deleted.push(t);}};
 const r={eye:[0,12,0],quality:2,textures:{},gl,texFromCanvas(name,cv){if(o.uploadFail)throw Error('GPU unavailable');const T={tex:{name},w:cv.width,h:cv.height};uploads.push(T);gl.bound=T.tex;return this.textures[name]=T;}};
 const g={phase:'evade',world:{},evade:{p:[0,10,0],weaponMode:'fists'}};
 return {M:window.GroundItemsRender,window,document,nodes,r,g,gl,uploads,deleted,draws,surfaceCalls,calls,inventory,rows:v=>{rows=v;},target:v=>{target=v;},finishImage:()=>pendingImage.onload(),hasImage:()=>!!pendingImage};
}
const json=x=>JSON.parse(JSON.stringify(x));
test('manifest isolates nine complete objects, including the rifle that crosses the nominal grid',()=>{
 const {M}=fixture();assert.equal(M.validateManifest(manifest),manifest);assert.equal(Object.keys(manifest.items).length,9);assert.ok(manifest.items.rifle.source[0]+manifest.items.rifle.source[2]>836);assert.ok(manifest.items.radio.source[1]<836);
 const bad=json(manifest);bad.items.rifle.source=[417,555,900,170];assert.throws(()=>M.validateManifest(bad),/Incomplete/);delete bad.items.knife;assert.throws(()=>M.validateManifest(bad),/Incomplete/);
});
test('lazy startup allocates nothing; explicit load preserves all source rectangles with independent mip chains and GL state',async()=>{
 const f=fixture();assert.equal(f.uploads.length,0);assert.equal(f.M.inspect(f.r).status,'idle');const loaded=await f.M.load(f.r);assert.equal(loaded.ready,true);assert.equal(loaded.records.length,9);assert.equal(f.uploads.length,9);assert.equal(f.draws.length,9);
 for(let i=0;i<9;i++){const kind=f.M.kinds[i],row=loaded.records[i];assert.deepEqual(Array.from(f.draws[i].slice(1,5)),manifest.items[kind].source);assert.equal(row.gpuWidth,row.width);assert.equal(row.gpuHeight,row.height);assert.equal(row.bytes,f.M.mipBytes(row.width,row.height));}
 assert.equal(loaded.bytes,loaded.records.reduce((n,r)=>n+r.bytes,0));assert.ok(loaded.bytes<=loaded.budget);assert.equal(f.gl.bound,'original');assert.equal(f.gl.active,91);assert.equal(f.gl.flip,false);assert.equal(f.gl.premult,false);assert.ok(f.gl.parameters.some(([p,v])=>p===2&&v===3));assert.ok(f.gl.parameters.some(([p,v])=>p===6&&v===8));
 await f.M.load(f.r);assert.equal(f.uploads.length,9,'Repeated requests share one immutable decode/upload job');
});
test('phone photographs retain whole-source aspect at at most256px under the3MiB all-nine budget',async()=>{
 const f=fixture();await f.M.load(f.r,{touch:true});const view=f.M.inspect(f.r);assert.equal(view.ready,true);assert.equal(view.budget,3*1024*1024);assert.ok(view.bytes<view.budget);assert.equal(view.records.length,9);
 for(const q of view.records){assert.ok(Math.max(q.gpuWidth,q.gpuHeight)<=256);assert.ok(Math.abs(q.gpuWidth/q.gpuHeight-q.width/q.height)<.02);assert.deepEqual(json(q.source),manifest.items[q.kind].source);}
});
test('bad images, failed GPU uploads and invalid alpha are explicit bounded failures',async()=>{
 for(const options of [{httpFail:true},{imageFail:true},{uploadFail:true},{opaque:true}]){const f=fixture(options);await f.M.load(f.r);const view=f.M.inspect(f.r);assert.equal(view.ready,false);assert.equal(view.bytes,0);assert.ok(view.failures.length>0&&view.failures.length<=12);assert.equal(view.records.length,0);}
});
test('retiring a pending renderer prevents all late allocations, and disposal deletes every owned texture',async()=>{
 const f=fixture({deferred:true}),job=f.M.load(f.r);for(let i=0;i<6&&!f.hasImage();i++)await Promise.resolve();assert.ok(f.hasImage());assert.equal(f.M.dispose(f.r),true);f.finishImage();await job;assert.equal(f.uploads.length,0);assert.equal(f.M.inspect(f.r).status,'idle');
 const a=fixture();await a.M.load(a.r);assert.equal(a.M.dispose(a.r),true);assert.equal(a.deleted.length,9);assert.equal(Object.keys(a.r.textures).length,0);assert.equal(a.M.dispose(a.r),false);
});
test('post-upload mip failure and real GL error roll back every texture before publication',async()=>{
 for(const o of [{mipFail:true},{glError:true}]){const f=fixture(o);await f.M.load(f.r);assert.equal(f.uploads.length,9);assert.equal(f.deleted.length,9);assert.equal(f.M.inspect(f.r).bytes,0);assert.equal(f.M.inspect(f.r).records.length,0);assert.equal(Object.keys(f.r.textures).length,0);assert.equal(f.gl.bound,'original');f.M.dispose(f.r);assert.equal(f.deleted.length,9);}
});
test('queue submits nearest32 at actual grounded positions within40m and never mutates actors, item descriptors or sprite input',async()=>{
 const f=fixture();await f.M.load(f.r);const rows=Array.from({length:60},(_,i)=>({id:'i'+i,kind:'rifle',p:[i*.7,10.018,0],yaw:i*.1}));f.rows(rows);const before=JSON.stringify([f.g,rows]),sprites=[{existing:true}];assert.equal(f.M.queue(f.g,f.r,sprites),4);assert.equal(f.surfaceCalls.length,1);const submitted=f.surfaceCalls[0];assert.equal(submitted.length,32);assert.deepEqual(json(submitted[0].p),[0,10.018,0]);assert.ok(submitted.every(q=>Math.hypot(q.p[0],q.p[2])<=40));assert.equal(submitted[0].length,.95);assert.ok(submitted[0].width>0&&submitted[0].width<.95);assert.equal(JSON.stringify([f.g,rows]),before);assert.deepEqual(sprites,[{existing:true}]);
});
test('leaving the field clears actual item draw receipts without allocating a replacement renderer',async()=>{
 const f=fixture();await f.M.load(f.r);f.rows([{id:'food',kind:'food',p:[1,10.018,0],yaw:0}]);f.M.queue(f.g,f.r,[]);assert.ok(f.M.inspect(f.r).lastItems.length);f.g.pow={stage:'cell'};assert.equal(f.M.queue(f.g,f.r,[]),0);assert.equal(f.M.inspect(f.r).drawn,0);assert.deepEqual(json(f.M.inspect(f.r).lastItems),[]);assert.equal(f.uploads.length,9);
});
test('pickup surface floor follows corrected country mesh and actual raised POW bank rather than unrelated world terrain',async()=>{
 const f=fixture();f.M.configure({App:{game:f.g},terrainH:()=>70});await f.M.load(f.r);f.rows([{id:'food',kind:'food',p:[1,70.018,0],yaw:0}]);
 f.window.NearGround={inspect:()=>({complete:true,origin:[0,0]}),heightAt:(r,x,z)=>70+.1*x-.05*z};f.M.queue(f.g,f.r,[]);let surface=f.surfaceCalls.at(-1)[0];assert.equal(surface.floorAt(2,4),70);assert.equal(surface.groundLift,.028);assert.match(surface.floorKey,/country/);
 f.g.pow={stage:'river',base:[0,126,0],river:{mode:'bank'}};f.window.POW={floorY:(g,x,z)=>126.35+.01*x};f.M.queue(f.g,f.r,[]);surface=f.surfaceCalls.at(-1)[0];assert.equal(surface.floorAt(2,4),126.36999999999999);assert.match(surface.floorKey,/river/);assert.equal(surface.p[1],70.018,'Rendering never rewrites authoritative domain placement');
});
test('prison, stale games and flight scenes cannot load supplies, submit photographs or expose UI',async()=>{
 for(const change of [g=>g.pow={stage:'cell'},g=>g.evade.camp=true,g=>g.phase='flight',g=>g.app={screen:'ready',game:g},g=>g.app={screen:'game',game:{}},g=>g.app={screen:'game',game:null}]){const f=fixture();change(f.g);assert.equal(f.M.queue(f.g,f.r,[]),0);assert.equal(f.M.renderUI(f.g),false);assert.equal(f.M.inspect(f.r).status,'idle');assert.equal(f.nodes.has('groundItemsUI'),false);}
});
test('pickup UI invokes the domain exactly once, updates its live target and supports toggle, explicit Close and Escape',()=>{
 const f=fixture();f.target({id:'food1',kind:'food',ammo:0});assert.equal(f.M.renderUI(f.g),true);const n=f.nodes,event={preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};assert.equal(n.get('groundItemPickup').textContent,'Eat bananas · F');n.get('groundItemPickup').fire('click',event);assert.equal(f.calls.interact,1);assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(n.get('groundItemPickup').hidden,true);
 const toggle=n.get('groundItemsToggle'),panel=n.get('groundItemsPanel');toggle.fire('click',event);assert.equal(panel.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');toggle.fire('click',event);assert.equal(panel.hidden,true);toggle.fire('click',event);n.get('groundItemsClose').fire('click',event);assert.equal(panel.hidden,true);assert.equal(toggle.focused,true);toggle.fire('click',event);n.get('groundItemsUI').fire('keydown',{...event,key:'Escape'});assert.equal(panel.hidden,true);
});
test('inventory actions use only domain equip; pointer events cannot propagate to world firing and pause still allows closing',()=>{
 const f=fixture();f.M.renderUI(f.g);const host=f.nodes.get('groundItemsUI'),panel=f.nodes.get('groundItemsPanel'),toggle=f.nodes.get('groundItemsToggle');let stopped=0;for(const k of ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click'])host.fire(k,{stopPropagation(){stopped++;}});assert.equal(stopped,7);
 const actions=panel.children.find(e=>e.className==='ground-items-actions');assert.ok(actions);const rifle=actions.children.find(e=>e.dataset.groundEquip==='rifle');rifle.fire('click',{preventDefault(){},stopPropagation(){}});assert.deepEqual(f.calls.equip,['rifle']);assert.equal(f.inventory.rifleAmmo,12,'UI cannot invent or spend ammo');toggle.fire('click',{});f.g.paused=true;f.M.renderUI(f.g);assert.equal(rifle.disabled,true);f.nodes.get('groundItemsClose').fire('click',{});assert.equal(panel.hidden,true);
 f.g.pow={stage:'solitary'};assert.equal(f.M.renderUI(f.g),false);assert.equal(host.hidden,true);
});
test('touch free-hand punch works with the inventory collapsed and preserves selected pistol and finite ammo',()=>{
 const f=fixture({slots:{left:null,right:'pistol'}});f.g.evade.weaponMode='pistol';f.M.renderUI(f.g);const button=f.nodes.get('groundItemsPunch');assert.equal(f.nodes.get('groundItemsPanel').hidden,true);assert.equal(button.parentNode,f.nodes.get('groundItemsUI'));assert.equal(button.disabled,false);
 let stopped=false;button.fire('click',{preventDefault(){},stopPropagation(){stopped=true;}});assert.equal(f.g.evade.punchWant,1);assert.equal(f.g.evade.weaponMode,'pistol');assert.equal(f.inventory.rifleAmmo,12);assert.equal(f.calls.interact,0);assert.deepEqual(f.calls.equip,[]);assert.equal(stopped,true);
});
test('touch punch rechecks busy, swimming and two-hand ownership at click time and never queues a blocked request',()=>{
 for(const change of [f=>f.g.paused=true,f=>f.g.evade.held=true,f=>f.g.evade.frozen=true,f=>f.g.evade.busy=true,f=>f.g.evade.swimming=true,f=>f.g.evade.weaponMode='rifle',f=>f.g._capturePending=true,f=>f.document.hidden=true,f=>f.window.GroundCombat.hands=()=>({left:'radio',right:'knife'}),f=>f.window.LandingWater={swimming:()=>true}]){
  const f=fixture();f.M.renderUI(f.g);change(f);f.M.renderUI(f.g);const b=f.nodes.get('groundItemsPunch');assert.equal(b.disabled,true);b.fire('click',{});assert.equal(f.g.evade.punchWant,undefined);
 }
});
test('swimming disables equipment actions while inventory close and toggle remain usable',()=>{
 for(const change of [f=>f.g.evade.swimming=true,f=>f.window.LandingWater={swimming:()=>true},f=>f.g.pow={stage:'river',river:{mode:'swim'}}]){const f=fixture();f.M.renderUI(f.g);const toggle=f.nodes.get('groundItemsToggle');toggle.fire('click',{});change(f);f.M.renderUI(f.g);const panel=f.nodes.get('groundItemsPanel'),actions=panel.children.find(q=>q.className==='ground-items-actions');assert.ok(actions.children.every(q=>q.disabled));assert.equal(toggle.disabled,undefined);f.nodes.get('groundItemsClose').fire('click',{});assert.equal(panel.hidden,true);toggle.fire('click',{});assert.equal(panel.hidden,false);}
});
test('closing Supplies preserves movement-key propagation while button activation and open-panel Escape remain local',()=>{
 const f=fixture();f.M.renderUI(f.g);const host=f.nodes.get('groundItemsUI'),toggle=f.nodes.get('groundItemsToggle');toggle.fire('click',{});f.nodes.get('groundItemsClose').fire('click',{});assert.equal(toggle.focused,true);
 for(const key of ['w','a','s','d','W','Shift','ArrowUp','f']){let stopped=false;host.fire('keydown',{key,stopPropagation(){stopped=true;}});assert.equal(stopped,false,key+' must reach original game input after closing');}
 let spaceStopped=false,spacePrevented=false;host.fire('keydown',{key:' ',code:'Space',preventDefault(){spacePrevented=true;},stopPropagation(){spaceStopped=true;}});assert.equal(spaceStopped,false,'Closed-panel Space must reach the actual free-hand punch input');assert.equal(spacePrevented,true,'Space must not synthesize a Supplies toggle click');
 let enterStopped=false;host.fire('keydown',{key:'Enter',stopPropagation(){enterStopped=true;}});assert.equal(enterStopped,true);
 let stopped=false;host.fire('keydown',{key:'Escape',stopPropagation(){stopped=true;}});assert.equal(stopped,false,'Escape after the panel is closed may reach the original pause handler');
 toggle.fire('click',{});spaceStopped=false;host.fire('keydown',{key:' ',code:'Space',stopPropagation(){spaceStopped=true;}});assert.equal(spaceStopped,true,'Open-panel Space remains local native button activation');host.fire('keydown',{key:'Escape',preventDefault(){},stopPropagation(){stopped=true;}});assert.equal(stopped,true);assert.equal(f.nodes.get('groundItemsPanel').hidden,true);
});
