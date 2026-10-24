'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=source.indexOf('  postUpdate(dt) {'),end=source.indexOf('  /* ---- carrier:',start);
assert.ok(start>0&&end>start);
const postUpdate=vm.runInNewContext('({'+source.slice(start,end)+'}).postUpdate',{Math,M2FT:3.28084,coastAt:()=>-1e9,vdist2:(a,b)=>a.reduce((s,n,i)=>s+(n-b[i])**2,0)});
function fixture(values={}){const calls=[],game={ac:{p:[80,22,0],fuel:5000,alive:true,onDeck:false,bombs:13,radalt:22},world:{carrier:{p:[0,19,0]},targets:[],threats:[],score:{damage:0},samWarn:0,launchWarn:0},app:{set:{sound:0},radio(...args){calls.push(['radio',...args]);}},mis:{type:'strike'},phase:'airborne',departed:false,strikeExperience:null,shake:0,flash:0,t:6,teach(){},director(){},pilotChatter(){},recoveryCalls(){calls.push(['recovery']);},...values};return {game,calls};}
test('outbound catapult climb does not enter inbound LSO recovery calls',()=>{const {game,calls}=fixture();postUpdate.call(game,1/60);assert.equal(game.departed,false);assert.equal(game.phase,'airborne');assert.equal(calls.length,0);});
test('an actual departed sortie returning to the carrier invokes recovery normally',()=>{const {game,calls}=fixture({departed:true});postUpdate.call(game,1/60);assert.equal(calls.filter(c=>c[0]==='recovery').length,1);assert.equal(game.phase,'recovery');});
test('ongoing strike objectives keep inbound calls suppressed even after real departure',()=>{const {game,calls}=fixture({departed:true,strikeExperience:{}});postUpdate.call(game,1/60);assert.equal(calls.length,0);assert.equal(game.phase,'airborne');});
