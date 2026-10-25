'use strict';
// Execute the real objective reader and base cockpit guidance. No outcomes,
// stores or input are granted by these read-only views.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function section(name,next){return html.slice(html.indexOf('  '+name+'('),html.indexOf('  '+next+'(',html.indexOf('  '+name+'(')));}
const context={RAD:180/Math.PI,M2FT:3.280839895,MS2KT:1.943844492,IS_TOUCH:false};
vm.createContext(context);vm.runInContext('class Subject {\n'+section('currentTask','nextCue')+section('nextCue','_ctl')+section('objState','checkObjectives')+'\n};globalThis.Subject=Subject;',context);
function fixture(type='strike'){
 const g=new context.Subject();Object.assign(g,{phase:'airborne',departed:true,shipRange:20000,egressCalled:false,mis:{type,brief:{target:'Supply depot'},targets:{label:'DEPOT'},obj:[['Attack','targets'],['Recover','trap']]},ac:{alive:true,onDeck:false,p:[0,700,9000],v:[0,0,-150],ias:150,bombs:12,arms:0,gear:false},world:{carrier:{p:[20000,0,9000]},score:{damage:0,dropped:0},targets:Array.from({length:6},(_,i)=>({alive:true,kind:'depot',p:[i*10,0,0]})),route:[],rtIdx:0,briefed:[0,0,0]}});return g;
}
const view=g=>({task:g.currentTask(g.ac,g.world),cue:g.nextCue(g.ac,g.world)});
test('a loaded, designated weapons-tight reconnaissance never receives a release instruction',()=>{
 const g=fixture('recce');g.mis.obj=[['Identify','targets'],['Release nothing','discipline'],['Recover','trap']];g.world.targets=g.world.targets.slice(0,4).map(t=>({...t,kind:'contacts'}));g.world.designated=g.world.targets[0];g.world.lock=true;
 const before=JSON.stringify(g),v=view(g);assert.match(v.task.main,/Identify/);assert.match(v.task.sub,/0\/4 identified/);assert.match(v.cue,/keep weapons SAFE/);assert.doesNotMatch(v.task.main+' '+v.cue,/bomb|hold space|attack the coordinates/i);assert.equal(JSON.stringify(g),before);
});
test('identified contacts count as reconnaissance work while the actual recovery remains required',()=>{
 const g=fixture('recce');g.mis.obj=[['Identify','targets'],['Release nothing','discipline'],['Recover','trap']];g.world.targets.forEach(t=>{t.ident=true;});const v=view(g);assert.match(v.task.main,/Contacts identified/);assert.match(v.cue,/recover aboard/);assert.equal(g.objState().at(-1)[2],false);assert(g.world.targets.every(t=>t.alive));
});
test('actual weapons-discipline failure is explained without inventing a pass or modifying the release count',()=>{
 const g=fixture('recce');g.mis.obj=[['Identify','targets'],['Release nothing','discipline'],['Recover','trap']];g.world.score.dropped=1;const before=JSON.stringify(g),v=view(g);assert.match(v.task.main,/discipline violated/);assert.match(v.cue,/VIOLATED/);assert.equal(g.objState()[1][2],false);assert.equal(JSON.stringify(g),before);
});
test('empty racks with surviving required targets explain an incomplete safe return',()=>{
 const g=fixture();g.ac.bombs=0;const before=JSON.stringify(g),v=view(g);assert.match(v.task.main,/Stores expended · incomplete/);assert.match(v.cue,/objectives incomplete/);assert.doesNotMatch(v.task.main+' '+v.cue,/WORK DONE|OBJECTIVES EARNED/);assert.equal(JSON.stringify(g),before);
});
test('actual strike threshold can earn the objective while two targets survive; bonus actors never change it',()=>{
 const g=fixture();g.world.targets.slice(0,4).forEach(t=>{t.alive=false;});g.world.targets.push({alive:true,bonus:true,kind:'truck',p:[0,0,0]});const v=view(g);assert.equal(g.objState()[0][2],true);assert.match(v.task.main,/Objectives earned/);assert.match(v.cue,/recovery still required/);assert.equal(g.objState()[1][2],false);
});
test('remaining ARM stores keep Iron Hand distinct from expended bombs',()=>{
 const g=fixture('ironhand');g.mis.obj=[['Radar','radar'],['Launchers','targets'],['Recover','trap']];g.world.targets.forEach(t=>t.kind='launcher');g.world.radar={alive:true,emitting:false,p:[0,0,0]};g.ac.bombs=0;g.ac.arms=2;let v=view(g);assert.match(v.task.main,/Suppress/);assert.match(v.cue,/WAIT FOR TRANSMISSION/);assert.doesNotMatch(v.cue,/WORK DONE|STORES EXPENDED/);g.world.radar.emitting=true;assert.match(view(g).cue,/press SPACE once for an ARM/);
});
test('recovery after an incomplete attack does not rename the attack a win',()=>{
 const g=fixture();g.phase='recovery';assert.match(view(g).task.main,/objectives incomplete/);assert.equal(g.objState()[0][2],false);
});
test('carrier training names the original circuit and wire instead of requiring nonexistent three landings',()=>{
 const g=fixture('carrier_only');g.ac.onDeck=true;const t=view(g).task;assert.match(t.sub,/catch a wire/);assert.doesNotMatch(t.sub,/three landings/);
});
test('the ejection chapter and an already-open canopy retain their real controls',()=>{
 const g=fixture();g.mis.escape=true;assert.match(view(g).task.main,/Survive ejection/);assert.match(view(g).cue,/J FIRES BOTH SEATS/);g.phase='chute';assert.match(view(g).cue,/STEER THE CANOPY/);
});
