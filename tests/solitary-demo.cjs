'use strict';
// CPU integration: the actual POW collision, activity timers, DOM button
// listeners and chapter entry run against a small document adapter. This is
// not a browser/GPU or iPhone Safari rendering test.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(options={}){
 const clicks=[],events=[],scrolls=[],nodes=[];let hideMemory=false;
 class Node{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.style={};this.listeners={};this._text='';this.className='';this.disabled=false;this.hidden=false;nodes.push(this);this.classList={contains:name=>!(hideMemory&&this.dataset.memoryPosition!==undefined)&&this.className.split(/\s+/).includes(name),toggle:(name,on)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));if(on===undefined?set.has(name):!on)set.delete(name);else set.add(name);this.className=[...set].join(' ');},remove:name=>this.classList.toggle(name,false)};}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}set textContent(value){this._text=String(value);this.children=[];}
  setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
  getAttribute(name){return name==='src'?this.src:this.attributes[name]??null;}
  append(...items){for(const node of items){this.children.push(node);node.parentNode=this;}}appendChild(node){this.append(node);return node;}
  replaceChildren(...items){for(const n of this.children)n.parentNode=null;this.children=[];this._text='';this.append(...items);}
  contains(node){return node===this||this.children.some(n=>n.contains(node));}
  querySelectorAll(selector){const parts=selector.split(' '),part=parts.pop(),match=node=>{if(part.startsWith('[')){const key=part.slice(1,-1).split('=')[0];return key.startsWith('data-')?node.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]!==undefined:node.attributes[key]!==undefined;}return part.startsWith('#')?node.id===part.slice(1):node.tagName===part.toUpperCase();};return this.children.flatMap(n=>(match(n)&&(!parts.length||n.parentNode?.tagName===parts.at(-1).toUpperCase())?[n]:[]).concat(n.querySelectorAll(selector)));}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(){return null;}
  addEventListener(type,fn){(this.listeners[type]||(this.listeners[type]=[])).push(fn);}
  dispatchEvent(event){events.push({type:event.type,label:this.textContent});for(const fn of this.listeners[event.type]||[])fn(event);return true;}
  click(){if(this.disabled)return;clicks.push(this.textContent);const e={type:'click',preventDefault(){},stopPropagation(){}};if(this.onclick)this.onclick(e);this.dispatchEvent(e);}
  scrollIntoView(options){scrolls.push({label:this.textContent,options});}
  focus(){document.activeElement=this;}blur(){if(document.activeElement===this)document.activeElement=null;this.dispatchEvent({type:'blur'});}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);}
 }
 const body=new Node('body'),head=new Node('head'),document={body,head,hidden:false,activeElement:null,pointerLockElement:null,createElement:tag=>new Node(tag),getElementById:id=>[body,head].flatMap(n=>n.querySelectorAll('#'+id))[0]||null,querySelectorAll:selector=>body.querySelectorAll(selector),querySelector:selector=>body.querySelector(selector)};
 const window={document,KeyboardEvent:class{constructor(type,props){this.type=type;Object.assign(this,props);}preventDefault(){}stopPropagation(){}}},sandbox=vm.createContext({window,document,console,Date});
 const values=new Map([['prog',{done:{m1:1},grade:{m1:'A'}}],['pow_checkpoint',{version:2,stage:'river'}],['pow_preferences',{intensity:options.intensity||'standard'}]]),writes=[];
 const Store={get:(k,d)=>clone(values.has(k)?values.get(k):d),set:(k,v)=>{values.set(k,clone(v));writes.push(k);}};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow/core.js'),'utf8'),sandbox);
 const P=window.POW;P.mountUI=P.updateUI=P.activate=P.notify=()=>{};P.ctx={Store,terrainH:()=>4};
 for(const file of ['captivity.js','onboarding.js','confinement-goals.js','prison-food.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow',file),'utf8'),sandbox);
 const entries=[],nativeEntry=P.Guidance.startChapter;P.Guidance.startChapter=function(g,kind){entries.push(kind);return nativeEntry(g,kind);};
 class Game{constructor(app,mis){this.app=app;this.mis=mis;this.ac={p:[0,20,0]};this.hud={};this.world={_cells:new Map()};this.t=0;this.phase='deck';this.result=null;}update(dt){this.t+=dt;if(this.pow)P.tick(this,dt);}render(){}autoFly(){return {};}objState(){return [['Campaign escape','pending',false]];}setHour(){}debrief(){throw Error('Survival practice cannot debrief');}}
 const mission={id:'m11',escape:true,title:'Escape'},App={set:{seat:0,assist:1,mouse:1,sound:0},prog:{done:{m1:1},grade:{m1:'A'}},keys:{},gctl:{},screen:'ready',frame(){},renderReady(){},show(id){this.screen=id;},start(m){this._missionStart=(this._missionStart||0)+1;this.screen='game';this.game=new Game(this,m);}};
 P.ctx.App=App;window.PrisonFood.install({App,Game});
 vm.runInContext(fs.readFileSync(process.env.MISSION_DEMO_SOURCE||path.join(__dirname,'../assets/flight/mission-demo.js'),'utf8'),sandbox);
 const M=window.MissionDemo;assert(M.install({App,Game,Store,missions:[mission],terrainH:()=>4,POW:P}));
 const initial=clone(Object.fromEntries(values)),settings=clone(App.set),progress=App.prog;
 const start=(opts={})=>{assert(M.startChapter('solitary',opts));App.frame(0);return App.game;};
 const tick=seconds=>{for(let n=0;n<Math.ceil(seconds*60);n++)App.game.update(1/60);};
 const until=(condition,max=180)=>{for(let n=0;n<max*60&&!condition();n++)App.game.update(1/60);assert(condition(),'timed out: '+JSON.stringify({snapshot:M.snapshot(),goals:P.ConfinementGoals.view(App.game)?.practice,feedback:App.game.pow.captivity.feedback,focus:App.game.pow.focus?.id}));};
 return {M,P,App,Store,values,writes,entries,clicks,events,scrolls,initial,settings,progress,start,tick,until,hideMemory:()=>{hideMemory=true;}};
}
for(const intensity of ['standard','reduced'])test(intensity+' solitary computer earns all seven tasks through original physical controls, visible cues and activity listeners',()=>{
 const f=fixture({intensity}),g=f.start();assert.deepEqual(f.entries,['solitary']);assert.equal(g.pow.practice,'solitary');assert.equal(g.pow.day,17);assert.equal(f.M.snapshot().chapter,'solitary');assert.equal(f.M.completed(g),null);
 f.until(()=>f.M.snapshot().success,180);const v=f.P.ConfinementGoals.view(g).practice;
 assert.equal(v.done,7);assert(v.complete);assert.equal(g.pow.complete,undefined);assert.equal(g.pow.outcome,undefined);assert.equal(g.result,null);assert.equal(g.pow.stage,'solitary');assert.equal(g.pow.flags.outside,undefined);assert.equal(g.pow.flags.doorOpen,undefined);assert.equal(g.pow.inventory.bracket,undefined);assert.equal(g.pow.inventory.rope,undefined);
 assert(f.scrolls.some(q=>q.label==='Eat today’s ration'));assert(f.scrolls.some(q=>/^(Upper|Lower) (left|right)$/.test(q.label)));assert(f.scrolls.some(q=>/^(Row|Column) •$/.test(q.label)));assert(f.scrolls.every(q=>q.options.block==='nearest'&&q.options.behavior==='instant'));assert(f.clicks.includes('Eat today’s ration'));assert(f.clicks.includes('Show sequence'));assert(f.clicks.includes('Left shoulder'));assert(f.clicks.includes('Right shoulder'));assert(f.clicks.includes('Listen / replay message'));assert(f.clicks.some(x=>/^Transmit [A-Z]+$/.test(x)));assert(f.clicks.includes('Rest up to two hours'));assert(f.events.some(e=>e.type==='keydown'&&e.label==='Press and hold: quiet breathing'));assert(f.events.some(e=>e.type==='keyup'));
 assert.equal(f.writes.length,0);assert.deepEqual(clone(Object.fromEntries(f.values)),f.initial);assert.equal(f.M.snapshot().campaignIsolated,true);f.Store.set('pow_checkpoint',{stage:'solitary',practice:true});f.App.show('ready');assert.equal(f.M.snapshot().active,false);assert.equal(f.App.prog,f.progress);assert.deepEqual(f.App.set,f.settings);assert.deepEqual(clone(Object.fromEntries(f.values)),f.initial);
});
test('pause and taking controls release an actual breathing hold, and resuming reacquires the normal hold event',()=>{
 const f=fixture(),g=f.start();f.until(()=>!!g.pow.captivity.exercise?.holding,80);const held=g.pow.captivity.exercise,elapsed=f.M.snapshot().elapsed,initialHold=held.hold;f.M.setPaused(true);assert.equal(held.holding,false);f.tick(4);assert.equal(held.hold,initialHold);assert.equal(f.M.snapshot().elapsed,elapsed);f.M.setPaused(false);f.tick(.2);assert.equal(held.holding,true);f.M.takeControl();assert.equal(held.holding,false);const at=held.hold;f.tick(4);assert.equal(held.hold,at);f.M.resume();f.until(()=>f.M.snapshot().success,180);assert.equal(g.pow.outcome,undefined);f.M.stop(false);assert.deepEqual(f.App.set,f.settings);
});
test('visible memory highlights are required: hidden cue data does not grant a project or finish',()=>{
 const f=fixture(),g=f.start();f.hideMemory();f.tick(35);assert.equal(f.P.ConfinementGoals.view(g).practice.tasks.find(q=>q.id==='project').done,false);assert.equal(f.M.snapshot().success,false);assert.equal(g.pow.captivity.rewards.memory,undefined);f.M.stop(false);
});
test('a campaign outcome cannot substitute for the seven survival tasks and invalid chapter entry does not start',()=>{
 const f=fixture();assert.equal(f.M.startChapter('river'),false);assert.equal(f.App.game,undefined);const g=f.start();g.result={pass:true};g.pow.complete=true;g.pow.outcome={escaped:true};assert.equal(f.M.completed(g),null);assert.equal(f.M.snapshot().success,false);f.M.stop(false);assert.deepEqual(f.App.set,f.settings);assert.deepEqual(clone(Object.fromEntries(f.values)),f.initial);
});

test('four-times playback retains every visible memory and tap pulse through bounded native substeps',()=>{
 const f=fixture({intensity:'reduced'}),g=f.start({speed:4});f.until(()=>f.M.snapshot().success,60);assert.equal(f.P.ConfinementGoals.view(g).practice.done,7);assert.equal(g.result,null);assert.equal(g.pow.outcome,undefined);assert.equal(f.M.snapshot().objectives.length,7);assert(f.M.snapshot().objectives.every(row=>row[2]));f.M.stop(false);assert.deepEqual(f.App.set,f.settings);
});
