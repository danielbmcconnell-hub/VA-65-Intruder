/* Coordinate existing informational panels. Gameplay, original buttons and
 * their state owners remain in their original modules. */
(function(root){
 'use strict';
 let context=null,dock=null,owner=null,pendingOwner=null,queued=false,closing=false,observer=null,resizer=null,updates=0,mutations=0;
 const moved=new WeakSet(),watched=new WeakSet();
 const ids=['flightCoach','flightStrikeBoard','missionDemo','teachPeek','companionStatus','dixiePanel'];
 const by=id=>root.document?.getElementById(id);
 const visible=node=>!!(node&&!node.hidden&&node.getClientRects?.().length&&root.getComputedStyle(node).display!=='none'&&root.getComputedStyle(node).visibility!=='hidden');
 const modal=()=>['pauseVeil','captVeil','debriefVeil','legend','knee'].some(id=>by(id)?.classList.contains('on'))||['groundItemsPanel','prisonFood'].some(id=>visible(by(id)))||visible(by('pow-captivity'));
 const rectangle=node=>{const b=node.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
 const set=(node,key,value)=>{if(node.style.getPropertyValue(key)!==value)node.style.setProperty(key,value);};
 const attr=(node,key,value)=>{if(node.getAttribute(key)!==value)node.setAttribute(key,value);};
 const token=(node,name,on)=>{if(node.classList.contains(name)!==on)node.classList.toggle(name,on);};
 const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 function scopeMetrics(game,width,height){
  const tiny=Math.min(width,height)<400,r=Math.max(78,Math.min(235,Math.min(width*.26,height*.40))),cx=width-r-Math.max(14,Math.min(70,width*.06)),st=game?.st;
  const rows=4+(st?.nav?1:0)+(st?.crew?.pilot<1?1:0)+(st?.crew?.bn<1?1:0)+(st?.route?.length?2:0),navTop=tiny?46:52;
  return {radarLeft:cx-r-13,radarTop:height*.5-r-13,radarRight:cx+r+13,radarBottom:height*.5+r+13,navRight:tiny?114:132,navBottom:navTop+18+rows*(tiny?14:16)+4+(tiny?24:28),navTop};
 }
 function canvasReservations(game,width,height){
  if(game?.pow)return [];
  if(game?.chute)return [{id:'canopy altitude',left:width/2-115,top:40,right:width/2+115,bottom:106}];
  if(game?.evade)return [{id:'survival status',left:12,top:60,right:144,bottom:Math.max(170,height-110)}];
  if(game?.hud?.scope){const m=scopeMetrics(game,width,height);return [{id:'radar heading and steering',left:0,top:0,right:width,bottom:52},{id:'B/N heading steering and ship navigation',left:10,top:m.navTop,right:m.navRight,bottom:m.navBottom},{id:'radar scope',left:m.radarLeft,top:m.radarTop,right:m.radarRight,bottom:m.radarBottom}];}
  const tight=height<560,rows=tight?6:7;
  const data=game?.extView?{left:12,top:52,right:120,bottom:52+rows*(tight?13:15)+8}:{left:58,top:12,right:166,bottom:12+rows*(tight?13:15)+8};
  const out=[{id:'heading fuel and ship navigation',...data}];
  if(!game?.extView&&width>860&&height>560&&!game?.st?.approach)out.push({id:'radar repeater',left:28,top:50,right:212,bottom:234});
  return out;
 }
 function plan(width,height,options={}){
  const portrait=width<600&&height>=width;
  let left=portrait?12:56,top=height<=470?48:64,right=portrait?12:144;
  const status=options.powStatus;
  if(status){
   if(!portrait&&width-status.right-right>=210){left=Math.ceil(status.right)+10;top=10;}
   else{left=12;right=12;top=Math.ceil(status.bottom)+8;}
  }
  else for(const reserved of options.canvasReservations||[]){
   if(reserved.id==='radar scope')continue;
   const candidate={left,top,right:width-right,bottom:top+44};
   if(!overlaps(candidate,reserved))continue;
   if(reserved.left<180&&reserved.right<width*.6)left=Math.ceil(reserved.right)+12;
   else top=Math.ceil(reserved.bottom)+8;
  }
  const radar=(options.canvasReservations||[]).find(r=>r.id==='radar scope'),available=radar?Math.min(width-left-right,radar.left-left-8):width-left-right;
  return {left,top,width:Math.max(120,Math.min(620,available)),bottom:Math.max(top+48,Math.min(height-60,options.controlTop||height-60)),portrait};
 }
 function expanded(name){
  const open=node=>!!node&&!node.hidden;
  if(name==='demo')return visible(by('missionDemo'))&&open(by('missionDemo')?.querySelector('.demo-panel'));
  if(name==='strike')return visible(by('flightStrikeBoard'))&&open(by('flightStrikePanel'));
  if(name==='coach')return visible(by('flightCoach'))&&open(by('flightCoachCue'));
  if(name==='scan')return visible(by('flightStrikeBoard'))&&open(by('flightStrikeScan'));
  if(name==='teach')return by('teach')?.classList.contains('on');
  if(name==='companion')return visible(by('companionStatus'))&&open(by('companionStatus')?.querySelector('[data-companion-actions]'));
  if(name==='route')return visible(by('dixiePanel'))&&open(by('dixieApproachPanel'));
  return false;
 }
 function close(name){
  if(!expanded(name))return;
  if(name==='demo')by('missionDemo')?.querySelector(':scope > button')?.click();
  if(name==='strike')by('flightStrikeBoardToggle')?.click();
  if(name==='teach')by('teach')?.click();
  if(name==='companion')by('companionStatus')?.querySelector('[data-companion="hide"]')?.click();
  if(name==='route')by('dixieApproach')?.click();
  // Guidance ON is a saved user preference. Suppress its duplicate cue rather
  // than disabling that preference when another information panel is read.
 }
 function closePanels(next=null){
  if(closing)return;closing=true;
  try{for(const name of ['demo','strike','teach','companion','route'])if(name!==next)close(name);owner=next;}
  finally{closing=false;}
  schedule();
 }
 function select(name){
  if(closing)return;
  if(expanded(name)){
   closePanels(name);
   const menu=root.document?.querySelector('#powHUD .pow-tools-menu');if(menu?.open)menu.open=false;
  }else if(owner===name)owner=null;
  schedule();
 }
 function watch(node){if(node&&resizer&&!watched.has(node)){watched.add(node);resizer.observe(node);}}
 function mount(){
  const d=root.document,host=by('stack')||by('game');if(!d||!host)return false;
  if(!dock){dock=d.createElement('div');dock.id='hudUtilityDock';dock.setAttribute('aria-label','Mission information and guidance');host.appendChild(dock);}
  for(const id of ids){const node=by(id);if(!node||moved.has(node))continue;moved.add(node);token(node,'hud-utility-entry',true);dock.appendChild(node);watch(node);}
  for(const id of ['teach','wildlifeStatus']){const node=by(id);if(node&&!moved.has(node)){moved.add(node);dock.appendChild(node);watch(node);}}
  const lesson=by('teachPeek');if(lesson?.textContent){attr(lesson,'title',lesson.textContent);attr(lesson,'aria-label',lesson.textContent);}
  for(const node of [by('flightCoachCue'),by('flightStrikePanel'),by('flightStrikeScan'),by('missionDemo')?.querySelector('.demo-panel'),by('companionStatus')?.querySelector('[data-companion-actions]'),by('dixieApproachPanel')]){
   if(node){token(node,'hud-utility-popover',true);watch(node);}
  }
  return true;
 }
 function update(){
  if(!context||!mount())return false;
  updates++;
  const app=context.App,body=root.document.body,g=app.game,blocked=app.screen!=='game'||!g||modal(),critical=!!(g?.chute?.landing?.mode==='hung'&&by('landingWaterHUD')),scopeActive=!!(g?.hud?.scope&&!g.chute&&!g.evade&&!g.pow);
  const hidden=blocked||critical;if(dock.hidden!==hidden)dock.hidden=hidden;token(body,'hud-layout-active',!blocked);token(body,'hud-modal-open',blocked);token(body,'hud-critical-landing',critical);token(body,'hud-scope-view',scopeActive);
  if(blocked)return false;
  if(critical)return true;
  if(pendingOwner&&expanded(pendingOwner))owner=pendingOwner;
  else if(owner!=='pow-menu'&&!expanded(owner))owner=null;
  const menu=root.document.querySelector('#powHUD .pow-tools-menu');if(menu?.open)owner='pow-menu';else if(owner==='pow-menu')owner=null;
  if(!owner&&!critical)owner=['demo','teach','strike','route','companion','scan','coach'].find(expanded)||null;
  if(owner&&!closing&&(!pendingOwner||expanded(pendingOwner))){closing=true;try{for(const name of ['demo','teach','strike','route','companion'])if(name!==owner)close(name);}finally{closing=false;}}
  const cue=by('flightCoachCue');if(cue){const suppressed=critical||!!owner&&owner!=='coach';token(cue,'hud-cue-suppressed',suppressed);attr(cue,'aria-hidden',String(suppressed||cue.hidden));}
  const scan=by('flightStrikeScan');if(scan){const suppressed=critical||!!owner&&owner!=='scan';token(scan,'hud-cue-suppressed',suppressed);attr(scan,'aria-hidden',String(suppressed||scan.hidden));}
  dock.dataset.panel=owner||'';
  const controls=['stick','pickle','btnFire'].map(by).filter(visible).map(rectangle);
  const controlTop=controls.length?Math.min(...controls.map(b=>b.top-8)):root.innerHeight-62;
  if(scopeActive){const m=scopeMetrics(g,root.innerWidth,root.innerHeight),top=m.navBottom+8,radio=by('radio');if(radio){set(radio,'--hud-caption-top',top+'px');set(radio,'--hud-caption-width',(m.navRight-10)+'px');set(radio,'--hud-caption-height',Math.max(32,Math.min(root.innerHeight*.26,controlTop-top-6))+'px');}}
  const status=root.document.body.classList.contains('pow-active')?root.document.querySelector('#powHUD .pow-status'):null;
  const placement=plan(root.innerWidth,root.innerHeight,{controlTop,powStatus:visible(status)?rectangle(status):null,canvasReservations:canvasReservations(g,root.innerWidth,root.innerHeight)});
  set(dock,'left',placement.left+'px');set(dock,'top',placement.top+'px');set(dock,'width',placement.width+'px');
  // Popovers are out of flow: opening one cannot move its toggle target.
  const dockBox=dock.getBoundingClientRect(),panelTop=Math.ceil(dockBox.height)+5;
  const airframe=by('flightAirframeFeedback'),feedbackTop=visible(airframe)?airframe.getBoundingClientRect().top-8:placement.bottom;
  const captions=by('radio'),captionRect=visible(captions)&&captions.children.length?captions.getBoundingClientRect():null;
  const captionTop=captionRect&&captionRect.right>placement.left&&captionRect.left<placement.left+Math.min(400,placement.width)?captionRect.top-8:placement.bottom;
  const bottom=Math.min(placement.bottom,feedbackTop,captionTop),maxHeight=Math.max(44,Math.min(280,Math.floor(bottom-placement.top-panelTop)));
  set(dock,'--hud-panel-top',panelTop+'px');set(dock,'--hud-panel-height',maxHeight+'px');
  return true;
 }
 function schedule(){if(queued||!context)return;queued=true;const run=()=>{queued=false;update();};if(typeof root.queueMicrotask==='function')root.queueMicrotask(run);else Promise.resolve().then(run);}
 function inspect(){
  const panels=['flightCoachCue','flightStrikePanel','flightStrikeScan','teach','dixieApproachPanel'].map(by).concat(by('missionDemo')?.querySelector('.demo-panel'),by('companionStatus')?.querySelector('[data-companion-actions]')).filter(visible);
  return {owner,updates,mutations,hidden:!dock||dock.hidden,dock:dock&&!dock.hidden?rectangle(dock):null,canvasReservations:canvasReservations(context?.App?.game,root.innerWidth,root.innerHeight),panels:panels.map(n=>({id:n.id||n.className,rect:rectangle(n)})),controls:['pauseBtn','stick','rcol','rpow','fcol','pickle','btnFire'].map(by).filter(visible).map(n=>({id:n.id,rect:rectangle(n)}))};
 }
 function install(c){
  if(context)return context.App===c?.App&&context.Game===c?.Game;
  if(!c?.App||!c?.Game?.prototype||!root.document)return false;context=c;
  const render=c.Game.prototype.render,show=c.App.show;
  if(typeof render==='function')c.Game.prototype.render=function(){const r=render.apply(this,arguments);update();return r;};
  if(typeof show==='function')c.App.show=function(){const r=show.apply(this,arguments);schedule();return r;};
  if(typeof root.ResizeObserver==='function')resizer=new root.ResizeObserver(schedule);
  const activate=event=>{
   if(closing)return;const t=event.target;if(!t?.closest)return;
   const name=t.closest('#missionDemo > button')?'demo':t.closest('#flightStrikeBoardToggle')?'strike':t.closest('#flightCoachToggle')?'coach':t.closest('#teachPeek')?'teach':t.closest('[data-companion-line]')?'companion':t.closest('#dixieApproach')?'route':null;
   // A microtask can run between event listeners, before the original button
   // changes its state. Reserve its owner now and settle after native dispatch.
   if(name){pendingOwner=name;root.setTimeout(()=>{if(pendingOwner===name)pendingOwner=null;select(name);},0);}
  };
  // Original touch buttons act on a released pointer; keyboard/mouse buttons
  // may act on click. Reserve ownership before either original handler runs.
  root.document.addEventListener('pointerup',activate,true);root.document.addEventListener('click',activate,true);
  root.document.addEventListener('toggle',event=>{if(event.target.matches?.('#powHUD .pow-tools-menu')&&event.target.open)closePanels('pow-menu');},true);
  if(typeof root.MutationObserver==='function'){observer=new root.MutationObserver(records=>{mutations+=records.length;schedule();});observer.observe(root.document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','open','aria-expanded','aria-pressed']});}
  root.addEventListener?.('resize',schedule);mount();schedule();return true;
 }
 root.HUDLayout=Object.freeze({install,update,inspect,closePanels,plan,canvasReservations});
})(typeof window!=='undefined'?window:globalThis);
