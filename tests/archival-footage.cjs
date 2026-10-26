'use strict';
// DOM/media doubles exercise lifecycle and original App callbacks. Native
// browser acceptance separately checks actual MP4 decoding and gestures.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/ui/archival-footage.js'),'utf8');
function fixture(options={}){
  const byId=new Map(),listeners={},timers=new Map(),storage=options.storage||new Map(),calls=[];let nextTimer=0;
  const document={hidden:false,activeElement:null,listeners:{},getElementById(id){const n=byId.get(id);return n?.isConnected?n:null;},addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}};
  class Node{
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.dataset={};this.attributes={};this.events={};this.hidden=false;this.disabled=false;this.paused=true;this.volume=1;this.src='';}
    set id(value){this._id=value;byId.set(value,this);}get id(){return this._id||'';}
    get isConnected(){return this===document.body||!!this.parentNode?.isConnected;}
    appendChild(n){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);n.parentNode=this;this.children.push(n);return n;}
    setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
    removeAttribute(k){delete this.attributes[k];if(k==='src')this.src='';}
    addEventListener(type,fn){(this.events[type]||=[]).push(fn);}
    emit(type){for(const fn of this.events[type]||[])fn({type,target:this});}
    focus(){document.activeElement=this;}
    pause(){this.paused=true;this.emit('pause');}
    play(){if(options.blockPlay)throw Error('gesture/decoder unavailable');this.paused=false;this.plays=(this.plays||0)+1;}
    load(){this.loads=(this.loads||0)+1;}
  }
  document.createElement=tag=>new Node(tag);document.body=new Node('body');document.activeElement=document.body;
  const add=(tag,id,parent=document.body)=>{const n=document.createElement(tag);n.id=id;parent.appendChild(n);return n;};
  const ready=add('section','ready'),body=add('div','readyBody',ready),boot=add('button','bootGo');
  const window={document,matchMedia:()=>({matches:!!options.reduced}),sessionStorage:{getItem:k=>{if(options.noStorage)throw Error('blocked storage');return storage.get(k)||null;},setItem:(k,v)=>{if(options.noStorage)throw Error('blocked storage');storage.set(k,v);}},setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),addEventListener:(type,fn)=>{(listeners[type]||=[]).push(fn);}};
  const app={screen:'boot',game:null,tab:'ops',progress:{done:{m1:true}},show(id){calls.push(['show',id]);this.screen=id;},start(id){calls.push(['start',id]);this.game={id,paused:false,score:9};this.show('game');return 'original-start';},bindUI(){boot.onclick=()=>{calls.push(['boot']);this.show('ready');};},renderReady(){for(const n of body.children)n.parentNode=null;body.children=[];calls.push(['renderReady']);}};
  vm.runInNewContext(source,{window});const api=window.ArchivalFootage;
  assert.equal(api.install({App:app,Game:class{},Store:{set(){throw Error('Campaign store must not be written');}}}),true);
  app.bindUI();app.renderReady();
  const key=(code,shiftKey=false)=>{const e={code,shiftKey,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const f of listeners.keydown||[])f(e);return e;};
  return {api,window,app,document,storage,calls,timers,boot,ready,body,key,node:id=>document.getElementById(id)};
}
test('intro policy excludes live games, hidden pages, repeated sessions and reduced motion',()=>{
  const f=fixture(),p=f.api.policy,ok={screen:'ready',hasGame:false,hidden:false,seen:false,reduced:false};assert.equal(p.shouldAutoOpen(ok),true);
  for(const change of[{screen:'game'},{hasGame:true},{hidden:true},{seen:true},{reduced:true}])assert.equal(p.shouldAutoOpen({...ok,...change}),false,JSON.stringify(change));
  assert.equal(p.allowed({...ok,seen:true,reduced:true}),true,'a deliberate replay remains available');
});
test('native Boot callback still enters Ready Room; its silent intro has an immediate Skip',()=>{
  const f=fixture();f.boot.focus();f.boot.onclick();assert.equal(f.app.screen,'ready');assert.equal(f.app.game,null);assert.equal(f.api.inspect().active,true);assert.equal(f.node('archivalFootageSkip').textContent,'Skip to Ready Room');assert.equal(f.ready.inert,true);
  const v=f.node('archivalFootageVideo');assert.equal(v.muted,true);assert.equal(v.defaultMuted,true);assert.equal(v.volume,0);assert.equal(v.playsInline,true);assert.equal(v.controls,false);assert.ok(v.src.endsWith('carrier-launch.mp4'));assert.equal(f.calls.filter(c=>c[0]==='boot').length,1);
  f.node('archivalFootageSkip').onclick();assert.equal(f.api.inspect().active,false);assert.equal(f.ready.inert,false);assert.equal(v.paused,true);assert.equal(v.src,'');assert.equal(f.document.activeElement,f.boot);assert.equal(f.timers.size,0);
});
test('three actual media-ended events finish a single bounded montage',()=>{
  const f=fixture();f.boot.onclick();const v=f.node('archivalFootageVideo');for(const expected of[1,2]){v.emit('ended');assert.equal(f.api.inspect().index,expected);}v.emit('ended');assert.equal(f.api.inspect().active,false);assert.equal(f.api.inspect().lastClose,'complete');assert.equal(f.api.inspect().seen,true);assert.equal(f.app.screen,'ready');assert.equal(f.app.game,null);
  for(const bad of[-1,2,3,1.5,NaN])assert.equal(f.api.policy.nextIndex(bad),-1);
});
test('seen state is session-only and leaves campaign progress intact',()=>{
  const storage=new Map([['unrelated','retained']]),f=fixture({storage}),progress=f.app.progress;f.boot.onclick();f.api.close();f.app.show('boot');f.boot.onclick();assert.equal(f.api.inspect().opens,1);assert.equal(f.app.progress,progress);assert.deepEqual(f.app.progress,{done:{m1:true}});assert.equal(storage.get('unrelated'),'retained');assert.equal(storage.get('a6_archival_intro_seen'),'1');
  const fresh=fixture({storage});fresh.boot.onclick();assert.equal(fresh.api.inspect().active,false);assert.equal(fresh.node('archivalFootageVideo'),null);
});
test('reduced motion does not create or request autoplay media; explicit replay works',()=>{
  const f=fixture({reduced:true});f.boot.onclick();assert.equal(f.api.inspect().active,false);assert.equal(f.node('archivalFootageVideo'),null);f.node('archivalFootageReplay').onclick();assert.equal(f.api.inspect().active,true);assert.equal(f.api.inspect().mode,'viewer');assert.equal(f.node('archivalFootageSkip').textContent,'Close footage');assert.equal(f.timers.size,0);
});
test('blocked storage still prevents a second intro in the same page session',()=>{
  const f=fixture({noStorage:true});f.boot.onclick();assert.equal(f.api.inspect().active,true);f.api.close();f.app.show('boot');f.boot.onclick();assert.equal(f.api.inspect().opens,1);
});
test('decoder errors advance only through the supplied three clips and release the menu',()=>{
  const f=fixture();f.boot.onclick();const v=f.node('archivalFootageVideo');v.emit('error');v.emit('error');v.emit('error');assert.equal(f.api.inspect().active,false);assert.equal(f.api.inspect().lastClose,'unavailable');assert.equal(f.ready.inert,false);assert.equal(f.app.game,null);
});
test('blocked playback exposes Play/Skip and its bounded watchdog cannot strand Ready Room',()=>{
  const f=fixture({blockPlay:true});f.boot.onclick();assert.equal(f.node('archivalFootagePlay').textContent,'Play footage');assert.equal(f.api.inspect().playing,false);assert.equal(f.timers.size,1);const timer=[...f.timers.values()][0];timer();assert.equal(f.api.inspect().active,false);assert.equal(f.api.inspect().lastClose,'timeout');assert.equal(f.app.screen,'ready');
});
test('manual viewer finishes without looping and explicitly replays through its Next control',()=>{
  const f=fixture();f.app.show('ready');f.node('archivalFootageReplay').onclick();const v=f.node('archivalFootageVideo');v.emit('ended');v.emit('ended');v.emit('ended');assert.equal(f.api.inspect().active,true);assert.equal(f.api.inspect().index,2);assert.equal(f.api.inspect().playing,false);assert.equal(f.node('archivalFootageNext').textContent,'Replay montage');f.node('archivalFootageNext').onclick();assert.equal(f.api.inspect().index,0);assert.equal(f.api.inspect().playing,true);assert.equal(f.timers.size,0);
});
test('mission start or another screen closes footage without pausing or changing the mission',()=>{
  const f=fixture();f.boot.onclick();assert.equal(f.app.start('m3'),'original-start');assert.equal(f.api.inspect().active,false);assert.deepEqual(f.app.game,{id:'m3',paused:false,score:9});assert.equal(f.app.screen,'game');assert.equal(f.api.open('viewer'),false);
  f.app.game=null;f.app.show('ready');assert.equal(f.api.open('viewer'),true);f.app.show('brief');assert.equal(f.api.inspect().active,false);assert.equal(f.app.screen,'brief');assert.equal(f.ready.inert,false);
});
test('Skip/Escape and Tab stay in the dialog and never reach gameplay key handling',()=>{
  const f=fixture();f.boot.onclick();assert.equal(f.document.activeElement,f.node('archivalFootageSkip'));const tab=f.key('Tab');assert.equal(tab.stopped,true);assert.equal(tab.prevented,true);assert.equal(f.document.activeElement,f.node('archivalFootagePlay'));f.key('Tab',true);assert.equal(f.document.activeElement,f.node('archivalFootageSkip'));const escape=f.key('Escape');assert.equal(escape.stopped,true);assert.equal(f.api.inspect().active,false);assert.equal(f.app.game,null);
});
test('Ready Room replay card can be rebuilt and never counts as a mission card',()=>{
  const f=fixture();assert.equal(f.node('archivalFootageCard').className.split(/\s+/).includes('mcard'),false);for(let i=0;i<3;i++){f.app.renderReady();assert.equal(f.body.children.length,1);assert.ok(f.node('archivalFootageReplay'));}assert.equal(f.api.install({App:f.app}),true);f.boot.onclick();assert.equal(f.api.inspect().opens,1);
});
test('hidden pages stop media and restore the Ready Room interaction state',()=>{
  const f=fixture();f.boot.onclick();f.document.hidden=true;for(const fn of f.document.listeners.visibilitychange)fn();assert.equal(f.api.inspect().active,false);assert.equal(f.node('archivalFootageVideo').paused,true);assert.equal(f.ready.inert,false);
});
test('all actual footage files match their provenance and retain source-limited aspect ratios',()=>{
  const f=fixture(),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/video/provenance.json'),'utf8'));assert.equal(manifest.clips.length,3);assert.equal(manifest.totalDurationSeconds,f.api.limits.montageSeconds);assert.ok(manifest.totalDurationSeconds<=14);
  for(const clip of f.api.clips){const p=manifest.clips.find(p=>p.file===path.basename(clip.file));assert.ok(p);const bytes=fs.readFileSync(path.join(root,clip.file));assert.equal(bytes.length,p.outputBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),p.outputSHA256);assert.equal(p.durationSeconds,clip.duration);assert.equal(p.audioStreams,0);assert.equal(p.silent,true);assert.equal(p.codec,'h264');assert.equal(p.pixelFormat,'yuv420p');assert.equal(p.faststart,true);assert.equal(p.embeddedMarksRetained,true);assert.ok(p.width<=1280&&p.height<=720);assert.ok(p.width<=p.cropDisplayPixels.width&&p.height<=p.cropDisplayPixels.height);assert.equal(p.width*p.cropDisplayPixels.height,p.height*p.cropDisplayPixels.width);}
});
