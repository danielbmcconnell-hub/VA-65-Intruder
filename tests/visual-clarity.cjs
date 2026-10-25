'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const window={},math=Object.create(Math);math.random=()=>{throw Error('Presentation must not consume gameplay randomness');};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/render/visual-clarity.js'),'utf8'),{window,Math:math});
const C=window.VisualClarity;
test('a stationary photographic scene receives no time-varying noise at day, night or intermediate exposure',()=>{
 for(const n of [0,.25,.5,.75,1,true,false,NaN,Infinity,-10,10]){const a=C.profile(n),b=C.profile(n);assert.equal(a.grain,0);assert.deepEqual(a,b);assert.ok(a.bloom>=.18&&a.bloom<=.38);assert.ok(a.vignette>=.10&&a.vignette<=.18);assert.ok(a.night>=0&&a.night<=1);}
});
test('day and night transitions keep finite bounded output parameters with no abrupt grade-mode switch',()=>{
 let previous=C.profile(0);
 for(let i=1;i<=100;i++){const p=C.profile(i/100);assert.ok(Math.abs(p.bloom-previous.bloom)<.003);assert.ok(Math.abs(p.vignette-previous.vignette)<.001);previous=p;}
});
test('night illumination is confined to a separate subdued cockpit material palette',()=>{
 const day=C.cockpit(false),night=C.cockpit(true);assert.notEqual(day.top,night.top);
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const a=rgb(night.top),b=rgb(night.base);
 assert.ok(a[0]>a[1]&&a[0]>a[2]);assert.ok(Math.max(...a)<64);assert.ok(Math.max(...b)<16);
 assert.equal(C.cockpit(false),day);assert.equal(C.cockpit(true),night);
});
test('shared profiles and palettes cannot be mutated by another scene',()=>{
 const p=C.profile(1),palette=C.cockpit(true);assert.ok(Object.isFrozen(C)&&Object.isFrozen(p)&&Object.isFrozen(palette));assert.throws(()=>{p.grain=1;},TypeError);assert.throws(()=>{palette.top='#ffffff';},TypeError);assert.equal(C.profile(1).grain,0);
});
