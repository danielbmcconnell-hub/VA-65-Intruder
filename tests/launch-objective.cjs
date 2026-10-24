'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=source.indexOf('  objState() {'),end=source.indexOf('  checkObjectives() {',start);
assert.ok(start>0&&end>start);const objState=vm.runInNewContext('({'+source.slice(start,end)+'}).objState');
const fixture=values=>({mis:{obj:[['Launch','launch'],['Recover','trap']]},world:{targets:[],score:{dropped:0}},ac:{onDeck:true},departed:false,_launched:false,...values});
test('being parked on the catapult does not earn launch or recovery',()=>{const rows=objState.call(fixture());assert.equal(rows[0][2],false);assert.equal(rows[1][2],false);});
test('a real prior launch remains complete after an arrested short-pattern recovery',()=>{const rows=objState.call(fixture({_launched:true,wire:2}));assert.equal(rows[0][2],true);assert.equal(rows[0][1],'launched and recovered');assert.equal(rows[1][2],true);});
test('existing airborne checkpoints retain launch completion without requiring a new catapult event',()=>{const rows=objState.call(fixture({departed:true}));assert.equal(rows[0][2],true);});
test('new prison objectives follow earned roof crossing and require a completed offshore escape',()=>{
  const g=fixture({mis:{obj:[['Break out','breakout'],['Escape','escape']]},breakoutOK:true,escapedOK:true,pow:{flags:{},complete:false,outcome:null}});
  assert.deepEqual(Array.from(objState.call(g),r=>r[2]),[false,false]);g.pow.flags.roofCrossed=true;
  assert.deepEqual(Array.from(objState.call(g),r=>r[2]),[true,false]);g.pow.flags.deltaReached=true;
  assert.equal(objState.call(g)[1][2],false);g.pow.complete=true;g.pow.outcome={escaped:true,rescued:true};
  assert.equal(objState.call(g)[1][2],true);
});
test('historical recapture and reset outside flags cannot earn fictional escape objectives',()=>{
  const g=fixture({mis:{obj:[['Break out','breakout'],['Escape','escape']]},pow:{flags:{outside:true},complete:true,outcome:{escaped:false}}});
  assert.deepEqual(Array.from(objState.call(g),r=>r[2]),[true,false]);delete g.pow.flags.outside;
  assert.equal(objState.call(g)[0][2],false);
});
