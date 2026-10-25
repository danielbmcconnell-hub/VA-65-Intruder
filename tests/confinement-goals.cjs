'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const window={},context=vm.createContext({window,console});for(const file of ['core.js','captivity.js','regular-confinement.js','confinement-goals.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/pow',file),'utf8'),context);
 const P=window.POW,calls={saves:0,begins:[],notices:[]};P.notify=(g,m)=>calls.notices.push(m);P.save=g=>{calls.saves++;return clone({stage:g.pow.stage,day:g.pow.day,flags:g.pow.flags,inventory:g.pow.inventory,stats:g.pow.stats,captivity:g.pow.captivity,base:g.pow.base});};P.begin=(g,stage)=>calls.begins.push(stage);
 const game={pow:{stage:'solitary',day:1,time:0,base:[100,20,300],flags:{},inventory:{},stats:{physical:65,fatigue:25,resilience:60,memory:58,morale:55,hope:54},difficulty:'normal',intensity:'standard',solids:[],surfaces:[],objects:[],motion:{radius:.19,speed:0}},evade:{p:[100,20,300],searchers:[],locals:[]},app:{keys:{},gctl:{},set:{sound:0}},mis:{date:'1967'},campGeo:[],setHour(){}};
 P.Captivity.state(game);return {P,C:P.Captivity,G:P.ConfinementGoals,R:P.RegularConfinement,game,c:game.pow.captivity,calls};
}
test('goals display the existing condition and reading them changes no simulation, save, route or clock',()=>{
 const f=fixture(),before=clone(f.game),calls=clone(f.calls),v=f.G.view(f.game);
 assert.deepEqual(clone(v.condition.map(q=>q.value)),[65,60,54,25]);assert.match(v.condition[1].help,/Memory 58/);assert.match(v.condition[2].help,/same small daily benefit/);
 assert.deepEqual(clone(f.game),before);assert.deepEqual(f.calls,calls);assert.equal(v.dailyDone,0);assert.equal(v.dailyTotal,5);assert.match(v.next.text,/ration/);
});
test('daily checklist reads actual current-day completions rather than lifetime awards',()=>{
 const f=fixture();f.game.pow.day=20;f.c.daily.meal=20;f.c.rewards={car:19,architecture:20,exercise:20,tapReceive:18,tapSend:20,code:20};
 let v=f.G.view(f.game);assert.equal(v.dailyDone,5);assert(v.tasks.every(q=>q.done));
 f.game.pow.day=21;v=f.G.view(f.game);assert.equal(v.dailyDone,0);assert.equal(v.transfer.requirements.find(q=>q.id==='projects').value,2,'both completed project types remain actual lifetime progress');
});
test('actual original meal changes body condition and its checklist once, without removing fatigue or granting passage',()=>{
 const f=fixture(),physical=f.game.pow.stats.physical;assert(f.C.meal(f.game));let v=f.G.view(f.game);assert(v.condition[0].value>physical);assert(v.tasks.find(q=>q.id==='meal').done);assert.equal(v.dailyDone,1);
 const after=f.game.pow.stats.physical;assert.equal(f.C.meal(f.game),false);assert.equal(f.game.pow.stats.physical,after);assert.equal(f.calls.begins.length,0);assert.equal(f.game.pow.stage,'solitary');
});
test('all personal anchor choices give equal bounded hope, and repeating on the same day cannot stack it',()=>{
 const outcomes=[];
 for(const intention of ['prayer','quiet','duty','help','truth']){
  const f=fixture(),hope=f.game.pow.stats.hope;assert(f.C.personalAnchor(f.game,intention));assert.equal(f.game.pow.stats.hope,hope+1);assert(f.G.view(f.game).tasks.find(q=>q.id==='anchor').done);
  f.C.personalAnchor(f.game,intention);assert.equal(f.game.pow.stats.hope,hope+1);outcomes.push(f.game.pow.stats.hope);
 }
 assert(outcomes.every(n=>n===55));
});
test('real rest recovers fatigue and the next-action advice respects exhaustion before suggesting physical work',()=>{
 const f=fixture();f.game.pow.stats.fatigue=90;assert.match(f.G.view(f.game).next.text,/Rest at the sleeping mat/);assert(f.C.restStart(f.game,'sleep'));
 for(let i=0;i<160;i++)f.C.step(f.game,.1);
 assert(f.game.pow.stats.fatigue<60);assert(f.G.view(f.game).condition.find(q=>q.id==='fatigue').value<60);assert.equal(f.calls.begins.length,0);
});
test('visible seven-part transfer progress is the same authoritative eligibility used by the door',()=>{
 const f=fixture();f.game.pow.day=29;f.c.rewards={car:3,architecture:4,city:5};f.c.observations=2;f.c.tap.received=f.c.tap.sent=1;
 let v=f.G.view(f.game);assert.equal(v.transfer.total,7);assert.equal(v.transfer.done,7);assert(v.transfer.ready);assert(f.R.eligible(f.game));assert.equal(f.game.pow.stage,'solitary');assert.equal(f.calls.begins.length,0);
 for(const [key,value,id]of [['physical',29,'physical'],['resilience',24,'mental'],['morale',19,'mental'],['fatigue',86,'fatigue']]){
  const before=f.game.pow.stats[key];f.game.pow.stats[key]=value;v=f.G.view(f.game);assert(!v.transfer.ready);assert(!v.transfer.requirements.find(q=>q.id===id).ready);assert(!f.R.eligible(f.game));f.game.pow.stats[key]=before;
 }
});
test('historical-network progress cannot be satisfied by the easier anonymous tap exchange',()=>{
 const f=fixture();f.game.pow.day=29;f.c.rewards={car:3,architecture:4,city:5};f.c.observations=2;f.c.tap.received=f.c.tap.sent=1;let ready=false;f.P.Solidarity={available:()=>true,ready:()=>ready};
 let q=f.G.view(f.game).transfer.requirements.find(q=>q.id==='contact');assert(!q.ready);assert.match(q.label,/network/);ready=true;assert(f.G.view(f.game).transfer.ready);
});
test('escape preparation records actual separate-day vent work and observations without claiming successful escape',()=>{
 const f=fixture();f.game.pow.day=28;f.c.minute=480;f.c.vent.noticed=true;f.c.observations=1;
 for(let i=0;i<3;i++){
  assert(f.C.inspectVent(f.game));assert.equal(f.G.view(f.game).escape.work,i+1);if(i<2)f.C.advance(f.game,1440,'sleep');
 }
 let v=f.G.view(f.game);assert(!v.escape.ready);assert.equal(f.calls.begins.length,0);assert(!f.game.pow.complete);
 f.C.inspectDoor(f.game);v=f.G.view(f.game);assert(v.escape.ready);assert.equal(f.calls.begins.length,0,'viewing a ready route is not an escape');
 assert(f.C.leaveCell(f.game));assert.deepEqual(f.calls.begins,['cell']);assert(!f.game.pow.complete,'the existing physical chapter must still be played');
});
test('hope is a resource rather than a belief gate or fabricated escape percentage',()=>{
 const f=fixture();f.game.pow.day=29;f.c.rewards={car:3,architecture:4,city:5};f.c.observations=2;f.c.tap.received=f.c.tap.sent=1;f.game.pow.stats.hope=0;
 const v=f.G.view(f.game);assert(v.transfer.ready);assert.equal(v.condition.find(q=>q.id==='hope').value,0);assert(!('escapeChance'in v.escape));assert.equal(f.c.code.intention,'');
});
test('an active established interval shows actual elapsed progress and its existing pause control',()=>{
 const f=fixture();f.c.routine={active:true,elapsed:2.5,target:7,mode:'earned'};const before=clone(f.game),v=f.G.view(f.game);
 assert.match(v.next.text,/2\.5\/7\.0 days/);assert.match(v.next.text,/Rest \/ time to pause/);assert.equal(v.next.tab,'rest');assert(!v.next.text.includes('ration'));assert.deepEqual(clone(f.game),before);
});
test('goals are scoped to solitary and do not replace ordinary cell, river or flight objectives',()=>{
 const f=fixture();for(const stage of ['cell','compound','regular','hanoi','river']){f.game.pow.stage=stage;assert.equal(f.G.view(f.game),null);}assert.equal(f.G.view({}),null);
});
function summaryFixture(){
 const f=fixture(),listeners=new Map(),node={open:false,activations:0,addEventListener(type,fn){const rows=listeners.get(type)||[];rows.push(fn);listeners.set(type,rows);},getBoundingClientRect(){return {left:0,top:0,right:120,bottom:44};},click(){return this.emit('click',{detail:0});},emit(type,fields={}){const event={type,detail:0,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...fields};for(const fn of listeners.get(type)||[]){fn(event);if(event.stopped)break;}if(type==='click'&&!event.defaultPrevented){this.open=!this.open;this.activations++;}return event;}};
 assert(f.G.bindSummaryTouch(node));return {...f,node};
}
const finger=(pointerId=1,x=10,y=10)=>({pointerType:'touch',pointerId,clientX:x,clientY:y});
test('a released touch opens the original summary even when navigation suppressed its compatibility click',()=>{
 const {node}=summaryFixture();node.emit('pointerdown',finger());node.emit('pointerup',finger());assert.equal(node.open,true);assert.equal(node.activations,1);
 const duplicate=node.emit('click',{detail:1,pointerType:'touch'});assert(duplicate.defaultPrevented);assert.equal(node.open,true);assert.equal(node.activations,1);
 node.emit('pointerdown',finger());node.emit('pointerup',finger());assert.equal(node.open,false);assert.equal(node.activations,2);
});
test('summary touch deduplication preserves keyboard/programmatic clicks and real mouse activation',()=>{
 const {node}=summaryFixture();node.emit('pointerdown',finger());node.emit('pointerup',finger());node.click();assert.equal(node.activations,2);node.emit('click',{detail:1,pointerType:'mouse'});assert.equal(node.activations,3);
});
test('dragging or releasing outside a summary cannot activate it through the fallback or a later compatibility click',()=>{
 for(const mode of ['drag','outside']){const {node}=summaryFixture();node.emit('pointerdown',finger());if(mode==='drag')node.emit('pointermove',finger(1,35,10));node.emit('pointerup',mode==='outside'?finger(1,150,10):finger(1,35,10));const duplicate=node.emit('click',{detail:1,pointerType:'touch'});assert(duplicate.defaultPrevented);assert.equal(node.activations,0);}
});
test('cancelled, lost-capture and multi-touch summary gestures do not toggle a menu',()=>{
 for(const type of ['pointercancel','lostpointercapture']){const {node}=summaryFixture();node.emit('pointerdown',finger());node.emit(type,finger());node.emit('pointerup',finger());const duplicate=node.emit('click',{detail:1,pointerType:'touch'});assert(duplicate.defaultPrevented);assert.equal(node.activations,0);}
 const {node}=summaryFixture();node.emit('pointerdown',finger(1));node.emit('pointerdown',finger(2));node.emit('pointerup',finger(2));node.emit('pointerup',finger(1));assert.equal(node.activations,0);
});
test('a secondary touch cannot open a summary while another control owns the primary touch',()=>{
 const {node}=summaryFixture(),secondary={...finger(2),isPrimary:false};node.emit('pointerdown',secondary);node.emit('pointerup',secondary);const duplicate=node.emit('click',{detail:1,pointerType:'touch'});assert(duplicate.defaultPrevented);assert.equal(node.activations,0);
});
test('a reused summary cannot acquire a second fallback listener and double-toggle',()=>{
 const {G,node}=summaryFixture();assert.equal(G.bindSummaryTouch(node),false);node.emit('pointerdown',finger());node.emit('pointerup',finger());assert.equal(node.activations,1);
});
function overlayFixture(value='',priority=''){
 const {G}=fixture(),listeners=new Map(),values=new Map(value?[['visibility',{value,priority}]]:[]);values.set('display',{value:'flex',priority:''});
 const overlay={style:{getPropertyValue(k){return values.get(k)?.value||'';},getPropertyPriority(k){return values.get(k)?.priority||'';},setProperty(k,value,priority=''){values.set(k,{value,priority});},removeProperty(k){values.delete(k);}}},menu={open:false,isConnected:true,addEventListener(k,f){listeners.set(k,f);},removeEventListener(k,f){if(listeners.get(k)===f)listeners.delete(k);}};
 const binding=G.bindMenuOverlay(menu,overlay);return {G,menu,overlay,binding,values,toggle(open){menu.open=open;listeners.get('toggle')?.();},listenerCount:()=>listeners.size};
}
test('Camp opening suspends only context-overlay visibility and restores its exact prior presentation on close',()=>{
 for(const [value,priority]of [['',''],['visible','important'],['hidden','']]){const f=overlayFixture(value,priority);f.toggle(true);f.binding.sync();assert.deepEqual(f.values.get('visibility'),{value:'hidden',priority:'important'});assert.deepEqual(f.values.get('display'),{value:'flex',priority:''});f.toggle(false);assert.equal(f.overlay.style.getPropertyValue('visibility'),value);assert.equal(f.overlay.style.getPropertyPriority('visibility'),priority);assert.deepEqual(f.values.get('display'),{value:'flex',priority:''});}
});
test('context-overlay suspension is idempotent and restores the original style on menu cleanup or disconnection',()=>{
 const f=overlayFixture('visible','important');assert.equal(f.G.bindMenuOverlay(f.menu,f.overlay),f.binding);assert.equal(f.listenerCount(),1);f.toggle(true);f.binding.dispose();assert.equal(f.listenerCount(),0);assert.deepEqual(f.values.get('visibility'),{value:'visible',priority:'important'});const next=f.G.bindMenuOverlay(f.menu,f.overlay);assert.notEqual(next,f.binding);f.menu.isConnected=false;next.sync();assert.deepEqual(f.values.get('visibility'),{value:'visible',priority:'important'});
});
