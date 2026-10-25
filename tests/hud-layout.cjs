'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/ui/hud-layout.js'),'utf8'),window={};vm.runInNewContext(source,{window});const H=window.HUDLayout;
test('utility dock remains inside supported desktop and phone viewports with a separate control margin',()=>{
 for(const [width,height,controlTop]of [[1280,720,620],[844,390,264],[390,844,718],[568,320,200],[320,568,440]]){
  const p=H.plan(width,height,{controlTop});assert.ok(p.left>=0&&p.top>=0);assert.ok(p.width>=120);assert.ok(p.left+p.width<=width-10);assert.ok(p.bottom<=height-40);assert.ok(p.bottom<=controlTop);
 }
});
test('landscape POW utilities sit beside the measured status card and outside the right-side controls',()=>{
 const status={left:56,top:10,right:396,bottom:134};const p=H.plan(844,390,{powStatus:status,controlTop:264});assert.ok(p.left>status.right);assert.ok(p.left+p.width<710);assert.ok(p.top<status.bottom,'use the free side rather than covering the room with stacked cards');
});
test('portrait POW utilities move below the measured objective and condition card',()=>{
 const status={left:12,top:68,right:378,bottom:245};const p=H.plan(390,844,{powStatus:status,controlTop:718});assert.ok(p.top>status.bottom);assert.ok(p.left+p.width<=390-12);assert.ok(p.bottom<=718);
});
test('a narrow landscape falls back below status instead of squeezing two unreadable columns',()=>{
 const status={left:56,top:10,right:350,bottom:120};const p=H.plan(600,500,{powStatus:status,controlTop:372});assert.ok(p.top>status.bottom);assert.ok(p.width>300);assert.ok(p.left+p.width<=588);
});
test('install requires actual application, renderer owner and document without mutating gameplay on a missing context',()=>{
 assert.equal(H.install(null),false);assert.equal(H.install({App:{},Game:function Game(){}}),false);
});
test('flight utilities avoid the original canvas telemetry and radar repeater, including their non-DOM pixels',()=>{
 for(const [width,height]of [[1280,720],[844,390]]){
  const reservations=H.canvasReservations({hud:{scope:false},st:{approach:false}},width,height),p=H.plan(width,height,{canvasReservations:reservations});
  for(const r of reservations)assert.ok(p.left>=r.right+8||p.top>=r.bottom+8,'Toolbar must clear '+r.id);
 }
});
test('a parachute utility toolbar sits below the actual canopy/altitude readout',()=>{
 const reservations=H.canvasReservations({chute:{}},844,390),p=H.plan(844,390,{canvasReservations:reservations});assert.ok(p.top>106);
});
test('scope navigation header and ground survival telemetry keep their own reserved space',()=>{
 const scope=H.plan(844,390,{canvasReservations:H.canvasReservations({hud:{scope:true}},844,390)});assert.ok(scope.top>=60);
 const ground=H.plan(844,390,{canvasReservations:H.canvasReservations({evade:{}},844,390)});assert.ok(ground.left>=156);
});
test('B/N utilities occupy the column between real attack navigation and the radar disk',()=>{
 for(const [width,height]of [[844,390],[1280,720]]){
  const reservations=H.canvasReservations({hud:{scope:true},st:{nav:{},route:[{}],crew:{pilot:1,bn:1}}},width,height),p=H.plan(width,height,{canvasReservations:reservations});
  const nav=reservations.find(r=>r.id==='B/N heading steering and ship navigation'),radar=reservations.find(r=>r.id==='radar scope');assert.ok(p.left>=nav.right+8);assert.ok(p.left+p.width<radar.left);assert.ok(p.top>=60);
 }
});
