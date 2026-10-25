'use strict';
// Production captivity UI/state with a lightweight recording DOM. This proves
// node lifetime and real handlers, not browser layout, images or GPU rendering.
const assert=require('node:assert/strict'),test=require('node:test');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 let document;
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.style={};this.listeners={};this.replacements=0;this._text='';}
  set textContent(value){this._text=String(value??'');for(const child of this.children)child.parentNode=null;this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  appendChild(child){this.children.push(child);child.parentNode=this;return child;}
  append(...children){for(const child of children)this.appendChild(child);}
  replaceChildren(...children){this.replacements++;for(const child of this.children)child.parentNode=null;this.children=[];this._text='';this.append(...children);}
  setAttribute(key,value){this.attrs[key]=String(value);}
  addEventListener(name,handler){(this.listeners[name]||=[]).push(handler);}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  querySelectorAll(selector){
   const attr=selector.match(/^\[([^\]]+)\]$/);
   const match=node=>attr?Object.hasOwn(node.attrs,attr[1]):node.tagName===selector;
   return this.children.flatMap(child=>(match(child)?[child]:[]).concat(child.querySelectorAll(selector)));
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  focus(){document.activeElement=this;}
  blur(){if(document.activeElement===this)document.activeElement=null;}
  click(){for(const handler of this.listeners.click||[])handler({preventDefault(){},stopPropagation(){}});}
  get isConnected(){return document.body.contains(this)||document.head.contains(this);}
 }
 document={head:new Element('head'),body:new Element('body'),activeElement:null,pointerLockElement:null,createElement:tag=>new Element(tag)};
 const opened=[],window={document,POW:{},POWPhotos:{open:key=>opened.push(key)}};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow/captivity.js'),'utf8'),vm.createContext({window,document,console}));
 const game={pow:{stage:'solitary',base:[0,0,0],day:1,time:0,flags:{},inventory:{},stats:{physical:65,fatigue:25,resilience:60,morale:60,memory:60,hope:60},motion:{},intensity:'standard'},evade:{p:[0,0,0]},app:{keys:{},set:{sound:0}}};
 const C=window.POW.Captivity,c=C.state(game);C.open(game,'history');
 const panel=document.body.children.find(node=>node.id==='pow-captivity');
 const button=name=>panel.querySelectorAll('button').find(node=>node.textContent===name);
 return {C,c,game,document,panel,button,opened};
}
test('two real clock ticks retain focused history controls while updating time, condition, messages and records',()=>{
 const f=fixture(),denton=f.button('Jeremiah Denton photograph'),buttons=f.panel.querySelectorAll('button'),replacements=f.panel.replacements;
 const clock=f.panel.querySelector('[data-captivity-clock]'),oldClock=clock.textContent,minute=f.c.minute;
 denton.focus();f.C.step(f.game,1);
 f.game.pow.stats.memory=61;f.c.feedback='A new corridor message.';
 f.c.events.push({day:1,text:'A real event record.'});f.c.logs.push({day:1,message:'A new activity record.'});
 f.C.step(f.game,1);
 assert.equal(f.c.minute,minute+2);assert.equal(f.c.elapsedMinutes,2);assert.notEqual(clock.textContent,oldClock);
 assert.equal(f.panel.replacements,replacements,'Clock updates must not replace the panel');
 assert.deepEqual(f.panel.querySelectorAll('button'),buttons);assert.equal(f.document.activeElement,denton);assert.equal(denton.isConnected,true);
 assert.match(f.panel.querySelector('[data-captivity-condition]').textContent,/memory 61/);
 assert.equal(f.panel.querySelector('[data-captivity-feedback]').textContent,'A new corridor message.');
 assert.match(f.panel.querySelector('[data-history-events]').textContent,/A real event record/);
 assert.match(f.panel.querySelector('[data-history-record]').textContent,/A new activity record/);
 denton.click();assert.deepEqual(f.opened,['denton']);
});
test('a real day rollover updates calendar and guard-event records without detaching photo links',()=>{
 const f=fixture(),denton=f.button('Jeremiah Denton photograph');f.game.pow.day=6;f.c.minute=1439.5;
 denton.focus();f.C.step(f.game,1);f.C.step(f.game,1);
 assert.equal(f.game.pow.day,7);assert.equal(f.game.pow.flags.guardCycle,1);
 assert.equal(f.panel.querySelector('[data-captivity-day]').textContent,'Solitary · day 7');
 assert.match(f.panel.querySelector('[data-history-events]').textContent,/corridor duty changes/);
 assert.equal(f.button('Jeremiah Denton photograph'),denton);assert.equal(f.document.activeElement,denton);
 assert.equal(f.game.pow.flags.nightShackles,true,'The actual simulation continues through the UI update');
});
test('changing activities rebuilds the correct controls and returning to history installs working photo links',()=>{
 const f=fixture(),old=f.button('Jeremiah Denton photograph');f.button('Notebook').click();
 assert.equal(f.c.tab,'notebook');assert.equal(old.isConnected,false);assert.equal(f.button('Jeremiah Denton photograph'),undefined);
 f.button('Context / log').click();const fresh=f.button('James Stockdale photograph');
 assert.equal(f.c.tab,'history');assert.ok(fresh?.isConnected);fresh.click();assert.deepEqual(f.opened,['stockdale']);
});
