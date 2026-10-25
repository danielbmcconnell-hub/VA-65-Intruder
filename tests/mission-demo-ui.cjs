'use strict';
// DOM/lifecycle checks for the real demo UI functions. Browser geometry is
// verified separately; this adapter does not render a cockpit or run WebGL.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 class Node{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.style={};this.hidden=false;this.className='';this._text='';this.classList={remove(){}};}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}set textContent(v){this._text=String(v);this.children=[];}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='id')this.id=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);}getAttribute(k){return this.attributes[k]??null;}removeAttribute(k){delete this.attributes[k];}
  append(...items){for(const n of items){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);this.children.push(n);n.parentNode=this;}}appendChild(n){this.append(n);return n;}
  insertBefore(n,before){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,n);n.parentNode=this;return n;}
  replaceChildren(...items){this.children=[];this._text='';this.append(...items);}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);}
  querySelectorAll(selector){const match=n=>selector[0]==='#'?n.id===selector.slice(1):selector[0]==='.'?n.className.split(/\s+/).includes(selector.slice(1)):selector[0]==='['?n.getAttribute(selector.slice(1,-1))!==null:n.tagName===selector.toUpperCase();return this.children.flatMap(n=>(match(n)?[n]:[]).concat(n.querySelectorAll(selector)));}querySelector(s){return this.querySelectorAll(s)[0]||null;}
  click(){this.onclick?.({stopPropagation(){}});}blur(){}
 }
 const body=new Node('body'),gameNode=new Node('div');gameNode.id='game';body.append(gameNode);
 const document={body,hidden:false,createElement:tag=>new Node(tag),getElementById:id=>body.querySelector('#'+id),querySelector:s=>body.querySelector(s)},window={document};
 const tasks=Array.from({length:7},(_,i)=>({label:'Task '+(i+1),done:false,where:'Original activity '+(i+1)}));
 window.POW={Guidance:{startChapter(g){g.pow={stage:'solitary',practice:'solitary',captivity:{open:false}};}},ConfinementGoals:{view(){return {practice:{tasks,done:tasks.filter(q=>q.done).length,total:7,complete:tasks.every(q=>q.done)}};}}};
 const Store={get:(k,d)=>d,set(){}},missions=[{id:'m1',title:'Carrier circuit',obj:[['Circuit','circuit'],['Recovery','trap']]},{id:'m2',title:'Supply depot',obj:[['Attack','targets'],['Recovery','trap']]},{id:'m11',title:'Escape',escape:true,obj:[]}];
 class Game{constructor(app,mis){this.app=app;this.mis=mis;this.hud={};this.ac={p:[0,20,0]};this.t=0;this.result=null;this.done=false;}update(dt){this.t+=dt;}autoFly(){return {};}objState(){return this.mis.obj.map(q=>[q[0],this.done?'complete':'pending',this.done]);}}
 const App={set:{seat:0,assist:1,mouse:0},prog:{done:{},grade:{}},keys:{},gctl:{},screen:'ready',game:null,frame(){},renderReady(){},show(id){this.screen=id;},start(m){this._missionStart=(this._missionStart||0)+1;this.show('game');this.game=new Game(this,m);}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/flight/mission-demo.js'),'utf8'),{window});const M=window.MissionDemo;assert(M.install({App,Game,Store,missions,terrainH:()=>0}));
 const start=id=>{assert(M.start(id||'m1'));App.frame(0);M.render(App.game);return App.game;};
 return {M,App,document,Node,gameNode,tasks,start,box:()=>document.getElementById('missionDemo'),button:key=>document.getElementById('missionDemo').querySelectorAll('button').find(n=>n.dataset.demoAction===key)};
}
test('new demo starts compact with real WIN/progress/Next and reachable Pause/Take/Stop outside the closed drawer',()=>{
 const f=fixture(),g=f.start(),box=f.box(),panel=box.querySelector('.demo-panel'),compact=box.querySelector('.demo-compact'),toggle=box.children.find(n=>n.tagName==='BUTTON');
 assert.equal(panel.hidden,true);assert.equal(toggle.textContent,'GUIDE');assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.match(compact.textContent,/WIN · Fly circuit; catch a wire/);assert.match(compact.textContent,/Progress 0\/2/);assert.match(compact.textContent,/Next:/);
 for(const key of ['pause','take','stop']){const button=f.button(key);assert(button&&!button.hidden);assert.equal(button.parentNode.parentNode,box);assert.equal(panel.children.includes(button.parentNode),false);}
 const before=g.t;f.button('pause').click();g.update(.1);assert.equal(g.t,before);assert(f.M.snapshot().paused);f.button('pause').click();assert(!f.M.snapshot().paused);f.button('take').click();assert.equal(f.M.snapshot().computerPlaying,false);assert.equal(panel.hidden,true);f.button('stop').click();assert.equal(f.App.screen,'ready');
});
test('GUIDE opens full instructions/checklist without moving or hiding the original controls, then returns to compact state',()=>{
 const f=fixture(),g=f.start('m2'),box=f.box(),toggle=box.children.find(n=>n.tagName==='BUTTON'),actions=f.button('pause').parentNode,panel=box.querySelector('.demo-panel');toggle.click();assert.equal(panel.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(f.button('pause').parentNode,actions);assert.equal(actions.parentNode,box);assert.match(panel.textContent,/Destroy the required supply-depot targets/);assert.match(panel.textContent,/Features:/);assert.equal(panel.querySelector('.demo-guide').querySelectorAll('li').length,2);g.done=true;f.M.render(g);assert.match(box.querySelector('.demo-compact').textContent,/Progress 2\/2/);assert.equal(g.result,null);toggle.click();assert.equal(panel.hidden,true);assert.equal(toggle.getAttribute('aria-expanded'),'false');f.M.stop(false);
});
test('a fresh demonstration resets only its drawer presentation to compact',()=>{
 const f=fixture();f.start();f.box().children.find(n=>n.tagName==='BUTTON').click();assert.equal(f.box().querySelector('.demo-panel').hidden,false);f.start('m2');assert.equal(f.box().querySelector('.demo-panel').hidden,true);assert.equal(f.M.snapshot().computerPlaying,true);f.M.stop(false);
});
test('solitary still reuses the same controls inside its existing activity header and restores them on Stop',()=>{
 const f=fixture();assert(f.M.startChapter('solitary'));f.App.frame(0);const g=f.App.game,box=f.box(),actions=f.button('pause').parentNode,modal=new f.Node('section'),header=new f.Node('div');modal.id='pow-captivity';header.className='pow-top';modal.append(header);f.document.body.append(modal);g.pow.captivity.open=true;f.M.render(g);assert.equal(box.hidden,true);assert.equal(actions.parentNode,header);assert.match(actions.textContent,/WIN: 7 survival tasks · 0\/7/);f.M.stop(false);assert.equal(actions.parentNode,box);assert.equal(header.getAttribute('data-demo-controls-active'),null);assert.equal(box.hidden,true);
});
