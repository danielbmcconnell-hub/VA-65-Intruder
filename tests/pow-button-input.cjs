'use strict';
// Isolated DOM-event fixtures for the production POW button helper. Actual
// Chromium touch navigation and Save/Continue are exercised in onboarding.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/pow/core.js'),'utf8');
const helper=source.slice(source.indexOf('  function button(label,fn,parent)'),source.indexOf('  function current()'));
function fixture(){
 const listeners=new Map(),n={disabled:false,addEventListener(type,fn){listeners.set(type,fn);},getBoundingClientRect(){return {left:10,right:110,top:20,bottom:70};}};
 let calls=0,now=1000;const sandbox={document:{createElement:()=>n},Math,Date:{now:()=>now}};
 vm.createContext(sandbox);vm.runInContext(helper+'\nthis.make=button;',sandbox);
 sandbox.make('Save',()=>calls++,{appendChild(node){assert.equal(node,n);}});
 const send=(type,extra={})=>listeners.get(type)?.({pointerType:'touch',pointerId:1,clientX:50,clientY:40,detail:1,...extra});
 return {n,send,calls:()=>calls,setTime:n=>now=n};
}
test('a real released touch activates without depending on a compatibility click',()=>{const f=fixture();f.send('pointerdown');f.send('pointerup');assert.equal(f.calls(),1);});
test('a generated touch click cannot duplicate the released action',()=>{const f=fixture();f.send('pointerdown');f.send('pointerup');f.send('click');assert.equal(f.calls(),1);});
test('ordinary mouse clicks and keyboard activation remain available, including hybrid mouse use immediately after touch',()=>{const f=fixture();f.send('pointerdown',{pointerType:'mouse'});f.send('pointerup',{pointerType:'mouse'});f.send('click',{pointerType:'mouse'});assert.equal(f.calls(),1);f.send('pointerdown');f.send('pointerup');f.send('click',{detail:0});assert.equal(f.calls(),3);f.send('click',{pointerType:'mouse'});f.send('click',{pointerType:undefined,sourceCapabilities:{firesTouchEvents:false}});assert.equal(f.calls(),5);});
test('two distinct touch taps each activate once and suppress their own generated clicks',()=>{const f=fixture();for(let i=0;i<2;i++){f.setTime(1000+i*100);f.send('pointerdown');f.send('pointerup');f.send('click');}assert.equal(f.calls(),2);});
test('cancelled touches, dragged gestures and releases outside the button do not activate, even if a compatibility click follows',()=>{for(const kind of ['cancel','drag','outside']){const f=fixture();f.send('pointerdown');if(kind==='cancel')f.send('pointercancel');if(kind==='drag'){f.send('pointermove',{clientX:80});f.send('pointermove',{clientX:50});}f.send('pointerup',kind==='outside'?{clientX:120}:{});f.send('click');assert.equal(f.calls(),0,kind);}});
test('disabled buttons, unmatched releases and overlapping touch pointers cannot activate',()=>{const f=fixture();f.n.disabled=true;f.send('pointerdown');f.send('pointerup');f.send('click');assert.equal(f.calls(),0);f.n.disabled=false;f.send('pointerup');f.send('pointerdown');f.send('pointerup',{pointerId:2});f.send('pointerup');f.send('click');assert.equal(f.calls(),0);for(const first of [1,2]){const g=fixture();g.send('pointerdown');g.send('pointerdown',{pointerId:2});g.send('pointerup',{pointerId:first});g.send('pointerup',{pointerId:first===1?2:1});g.send('click');assert.equal(g.calls(),0);}});
test('a later independent mouse click remains valid after the touch deduplication interval',()=>{const f=fixture();f.send('pointerdown');f.send('pointerup');f.setTime(1701);f.send('click');assert.equal(f.calls(),2);});
