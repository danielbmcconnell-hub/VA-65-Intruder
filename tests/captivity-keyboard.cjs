'use strict';
// Unit event adapter for the actual modal keyboard listener source. Native
// focus/default button activation is verified separately in Chromium.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(process.env.CAPTIVITY_KEYBOARD_SOURCE||path.join(__dirname,'../assets/pow/captivity.js'),'utf8'),start=source.indexOf("    ui.addEventListener('keydown', event => {"),end=source.indexOf("    ui.addEventListener('pointerdown'",start);assert.ok(start>=0&&end>start);
function fixture(){
 const document={activeElement:null},listeners={},legacy=[],closed=[],game={id:'current'};
 const button=(name,options={})=>({name,hidden:!!options.hidden,disabled:!!options.disabled,getClientRects:()=>options.visible===false?[]:[{}],focus(){document.activeElement=this;}});
 const first=button('Return to cell'),pause=button('Pause'),take=button('Take controls'),buttons=[first,button('disabled',{disabled:true}),button('hidden',{hidden:true}),button('ancestor hidden',{visible:false}),pause,take];
 const ui={querySelectorAll:()=>buttons,addEventListener(type,fn){listeners[type]=fn;}};
 vm.runInNewContext(source.slice(start,end),{ui,root:{document},currentGame:game,close:g=>closed.push(g)});
 const send=(type,code,options={},targetListener)=>{const event={code,key:code==='Space'?' ':code,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...options};targetListener?.(event);listeners[type]?.(event);if(!event.stopped){legacy.push(code);if(type==='keydown'&&['Tab','Space'].includes(code))event.preventDefault();}return event;};
 return {document,first,pause,take,buttons,send,legacy,closed,game};
}
test('Tab and Shift+Tab reach live demo controls, skip unavailable buttons and wrap inside the modal',()=>{
 const f=fixture();f.first.focus();let e=f.send('keydown','Tab');assert.equal(f.document.activeElement,f.pause);assert(e.defaultPrevented);f.send('keydown','Tab');assert.equal(f.document.activeElement,f.take);f.send('keydown','Tab');assert.equal(f.document.activeElement,f.first);f.send('keydown','Tab',{shiftKey:true});assert.equal(f.document.activeElement,f.take);f.send('keydown','Tab',{shiftKey:true});assert.equal(f.document.activeElement,f.pause);assert.deepEqual(f.legacy,[]);
});
test('an outside focus enters the first or last available control and an empty dialog does not leak Tab',()=>{
 const f=fixture();f.send('keydown','Tab');assert.equal(f.document.activeElement,f.first);f.document.activeElement=null;f.send('keydown','Tab',{shiftKey:true});assert.equal(f.document.activeElement,f.take);for(const b of f.buttons)b.disabled=true;const e=f.send('keydown','Tab');assert(e.defaultPrevented);assert.deepEqual(f.legacy,[]);
});
test('Space and Enter retain native button activation defaults while game keyboard actions are blocked',()=>{
 const f=fixture();for(const code of ['Space','Enter','KeyJ','KeyB']){const down=f.send('keydown',code),up=f.send('keyup',code);assert.equal(down.defaultPrevented,false,code+' native button default');assert.equal(up.defaultPrevented,false);assert(down.stopped&&up.stopped);}assert.deepEqual(f.legacy,[]);
});
test('the original breathing target still receives its hold down and release before modal containment',()=>{
 const f=fixture();let held=false;const down=f.send('keydown','Space',{},event=>{held=true;event.preventDefault();});assert(held);assert(down.defaultPrevented);f.send('keyup','Space',{},()=>{held=false;});assert.equal(held,false);assert.deepEqual(f.legacy,[]);
});
test('Escape closes only the current captivity dialog and does not reach the game pause key',()=>{
 const f=fixture(),e=f.send('keydown','Escape');assert.deepEqual(f.closed,[f.game]);assert(e.defaultPrevented&&e.stopped);assert.deepEqual(f.legacy,[]);
});
