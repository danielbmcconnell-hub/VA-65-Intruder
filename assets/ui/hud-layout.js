/* Coordinate existing informational panels. Gameplay, original buttons and
 * their state owners remain in their original modules. */
(function(root){
 'use strict';
 let context=null,dock=null,owner=null,pendingOwner=null,queued=false,closing=false,observer=null,resizer=null,updates=0,mutations=0,menu=null,menuToggle=null,guideButton=null,scanButton=null,menuOpen=false,lastGame=null,cockpit=false,requested=null;
 const moved=new WeakSet(),watched=new WeakSet(),wheelBound=new WeakSet(),homes=new Map();
 const ids=['flightCoach','flightStrikeBoard','missionDemo','teachPeek','companionStatus','dixiePanel'];
 const by=id=>root.document?.getElementById(id);
 const visible=node=>!!(node&&!node.hidden&&node.getClientRects?.().length&&root.getComputedStyle(node).display!=='none'&&root.getComputedStyle(node).visibility!=='hidden');
 const modal=()=>['pauseVeil','captVeil','debriefVeil','legend','knee'].some(id=>by(id)?.classList.contains('on'))||['groundItemsPanel','prisonFood'].some(id=>visible(by(id)))||visible(by('pow-captivity'));
 const rectangle=node=>{const b=node.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
 const set=(node,key,value)=>{if(node.style.getPropertyValue(key)!==value)node.style.setProperty(key,value);};
 const attr=(node,key,value)=>{if(node.getAttribute(key)!==value)node.setAttribute(key,value);};
 const token=(node,name,on)=>{if(node.classList.contains(name)!==on)node.classList.toggle(name,on);};
 const hide=(node,on)=>{if(node&&node.hidden!==on)node.hidden=on;};
 const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 const isCockpit=game=>!!(game&&!game.pow&&!game.evade&&!game.chute&&!game.result);
 function focusPlan(width,height,options={}){
  const scope=(options.canvasReservations||[]).find(r=>r.id==='radar scope'),nav=(options.canvasReservations||[]).find(r=>r.id==='B/N heading steering and ship navigation'),controlTop=options.controlTop||height-60;
  const left=scope?Math.ceil(nav?.right||114)+12:12;
  const telemetryBottom=Math.max(0,...(options.canvasReservations||[]).filter(r=>r.id!=='radar scope'&&r.id!=='radar heading and steering').map(r=>r.bottom));
  const armament=scope?scopeMetrics(null,width,height):null,widthAvailable=scope?armament.armamentLeft-left-8:Math.min(width*.3-24,width-24),panelTop=scope?110:Math.max(110,Math.ceil(telemetryBottom)+8),railLeft=scope?left:Math.max(58,...(options.canvasReservations||[]).map(r=>r.right))+12;
  return {left,top:scope?60:10,width:Math.max(120,Math.min(scope?334:width<900?224:320,widthAvailable)),railLeft,panelTop,panelHeight:Math.max(44,Math.min(280,controlTop-panelTop)),demoTop:panelTop,central:{id:'clear cockpit view',left:width*.3,top:height*.24,right:width*.7,bottom:height*.66}};
 }
 function scopeMetrics(game,width,height){
  const tiny=Math.min(width,height)<400,r=Math.max(78,Math.min(235,Math.min(width*.26,height*.40))),cx=width-r-Math.max(14,Math.min(70,width*.06)),st=game?.st;
  const rows=4+(st?.nav?1:0)+(st?.crew?.pilot<1?1:0)+(st?.crew?.bn<1?1:0)+(st?.route?.length?2:0),navTop=tiny?46:52;
  const armamentWidth=Math.max(96,Math.min(168,width*.17)),armamentLeft=Math.max(8,Math.min(width,cx-r-20-armamentWidth));
  return {radarLeft:cx-r-13,radarTop:height*.5-r-13,radarRight:cx+r+13,radarBottom:height*.5+r+13,navRight:tiny?114:132,navBottom:navTop+18+rows*(tiny?14:16)+4+(tiny?24:28),navTop,armamentLeft,armamentRight:armamentLeft+armamentWidth,armamentTop:height*.5-(tiny?78:104),armamentBottom:height*.5-(tiny?78:104)+20+5*(tiny?19:23)};
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
  if(name==='coach')return (!cockpit||requested==='coach')&&visible(by('flightCoach'))&&open(by('flightCoachCue'));
  if(name==='scan')return (!cockpit||requested==='scan')&&visible(by('flightStrikeBoard'))&&open(by('flightStrikeScan'));
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
  if(name==='coach'||name==='scan'){if(requested===name)requested=null;}
  // Guidance ON is a saved user preference. Suppress its duplicate cue rather
  // than disabling that preference when another information panel is read.
 }
 function closePanels(next=null){
  if(closing)return;closing=true;
  try{for(const name of ['demo','strike','teach','companion','route','coach','scan'])if(name!==next)close(name);owner=next;if(next!=='menu')menuOpen=false;}
  finally{closing=false;}
  schedule();
 }
 function select(name){
  if(closing)return;
  if(cockpit&&(name==='coach'||name==='scan'))requested=by(name==='coach'?'flightCoachCue':'flightStrikeScan')?.hidden?null:name;
  if(expanded(name)){
   closePanels(name);
   const menu=root.document?.querySelector('#powHUD .pow-tools-menu');if(menu?.open)menu.open=false;
  }else if(owner===name)owner=null;
  schedule();
 }
 function showMenu(on){
  if(on){closePanels();menuOpen=true;}else menuOpen=false;
  schedule();
 }
 function requestPanel(name){requested=name;closePanels(name);owner=expanded(name)?name:null;schedule();}
 function moveControl(node){
  if(!node||node.parentNode===menu)return;
  if(!homes.has(node))homes.set(node,{parent:node.parentNode,next:node.nextSibling});
  menu.appendChild(node);
 }
 function menuControls(){
  const controls=[['flightCoachToggle','flightCoach'],['flightStrikeBoardToggle','flightStrikeBoard'],['teachPeek',null]];
  if(cockpit){
   for(const [id,host]of controls){const node=by(id);moveControl(node);if(node&&host)token(node,'hud-control-unavailable',!!by(host)?.hidden);}
   const preference=by('flightCoachToggle');if(preference?.parentNode===menu&&preference.nextSibling!==guideButton)menu.insertBefore(preference,guideButton);
   moveControl(by('dixiePanel')?.querySelector('.dixie-actions'));
  }else for(const [node,home]of homes){if(node.parentNode===menu)home.parent.insertBefore(node,home.next?.parentNode===home.parent?home.next:null);token(node,'hud-control-unavailable',false);}
  if(guideButton){guideButton.disabled=!by('flightCoachCue')||by('flightCoachCue').hidden||!!by('flightCoach')?.hidden;hide(guideButton,!cockpit||guideButton.disabled);attr(guideButton,'aria-expanded',String(owner==='coach'));}
  if(scanButton){scanButton.disabled=!by('flightStrikeScan')||by('flightStrikeScan').hidden||!!by('flightStrikeBoard')?.hidden;hide(scanButton,!cockpit||scanButton.disabled);attr(scanButton,'aria-expanded',String(owner==='scan'));}
  hide(menuToggle,!cockpit);hide(menu,!cockpit||!menuOpen);
  if(menuToggle){attr(menuToggle,'aria-expanded',String(menuOpen));const label=menuOpen?'COCKPIT ▴':'COCKPIT ▾';if(menuToggle.textContent!==label)menuToggle.textContent=label;}
 }
 function watch(node){if(node&&resizer&&!watched.has(node)){watched.add(node);resizer.observe(node);}}
 function scrollInput(node){if(node&&!wheelBound.has(node)){wheelBound.add(node);node.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});}}
 function mount(){
  const d=root.document,host=by('stack')||by('game');if(!d||!host)return false;
  if(!dock){
   dock=d.createElement('div');dock.id='hudUtilityDock';dock.setAttribute('aria-label','Mission information and guidance');host.appendChild(dock);scrollInput(dock);
   menuToggle=d.createElement('button');menuToggle.type='button';menuToggle.id='hudUtilityToggle';menuToggle.setAttribute('aria-controls','hudUtilityMenu');menuToggle.setAttribute('aria-expanded','false');menuToggle.textContent='COCKPIT ▾';menuToggle.onclick=()=>{showMenu(!menuOpen);if(menuOpen)menuToggle.focus({preventScroll:true});else menuToggle.blur();};dock.appendChild(menuToggle);
   menu=d.createElement('div');menu.id='hudUtilityMenu';menu.hidden=true;menu.setAttribute('aria-label','Cockpit information and guidance controls');dock.appendChild(menu);
   guideButton=d.createElement('button');guideButton.type='button';guideButton.id='hudGuideDetails';guideButton.textContent='Guide details';guideButton.setAttribute('aria-controls','flightCoachCue');guideButton.onclick=()=>requestPanel('coach');menu.appendChild(guideButton);
   scanButton=d.createElement('button');scanButton.type='button';scanButton.id='hudAttackDetails';scanButton.textContent='Attack steering cue';scanButton.setAttribute('aria-controls','flightStrikeScan');scanButton.onclick=()=>requestPanel('scan');menu.appendChild(scanButton);
   dock.addEventListener('keydown',event=>{
    if(!cockpit)return;const editing=event.target.matches?.('input,select,textarea,[contenteditable=true]'),uiKey=['Space','Enter','Tab','ShiftLeft','ShiftRight','ControlLeft','ControlRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.code);if(editing||uiKey)event.stopPropagation();
    if(event.code==='Tab'&&menuOpen){const controls=[menuToggle,...menu.querySelectorAll('button,select,input,[tabindex]')].filter(n=>!n.disabled&&visible(n));if(!controls.length)return;event.preventDefault();const at=controls.indexOf(d.activeElement),step=event.shiftKey?-1:1;controls[(at+step+controls.length)%controls.length].focus();}
   });
   dock.addEventListener('keyup',event=>{if(cockpit&&(event.target.matches?.('input,select,textarea,[contenteditable=true]')||['Space','Enter','Tab','ShiftLeft','ShiftRight','ControlLeft','ControlRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.code)))event.stopPropagation();});
  }
  for(const id of ids){const node=by(id);if(!node||moved.has(node))continue;moved.add(node);token(node,'hud-utility-entry',true);dock.appendChild(node);watch(node);}
  for(const id of ['teach','wildlifeStatus']){const node=by(id);if(node&&!moved.has(node)){moved.add(node);dock.appendChild(node);watch(node);}}
  const lesson=by('teachPeek');if(lesson?.textContent){attr(lesson,'title',lesson.textContent);attr(lesson,'aria-label',lesson.textContent);}
  scrollInput(by('radio'));
  for(const node of [by('flightCoachCue'),by('flightStrikePanel'),by('flightStrikeScan'),by('missionDemo')?.querySelector('.demo-panel'),by('companionStatus')?.querySelector('[data-companion-actions]'),by('dixieApproachPanel')]){
   if(node){token(node,'hud-utility-popover',true);watch(node);}
  }
  const demonstration=by('missionDemo'),actions=root.document.querySelector('.mission-demo-controls'),speed=demonstration?.querySelector('[data-demo-action="speed"]')||actions?.querySelector('[data-demo-action="speed"]'),guide=demonstration?.querySelector('.demo-panel');
  if(speed&&actions&&guide){
   const target=!guide.hidden&&!modal()?guide:actions,before=target===guide?guide.firstChild:actions.querySelector('[data-demo-action="stop"]');
   if(speed.parentNode!==target)target.insertBefore(speed,before);
  }
  return true;
 }
 function update(){
  if(!context||!mount())return false;
  updates++;
  const app=context.App,body=root.document.body,g=app.game,blocked=app.screen!=='game'||!g||modal(),critical=!!(g?.chute?.landing?.mode==='hung'&&by('landingWaterHUD')),scopeActive=!!(g?.hud?.scope&&!g.chute&&!g.evade&&!g.pow);
  cockpit=isCockpit(g);token(body,'hud-cockpit-focus',cockpit&&!blocked);
  if(lastGame!==g){lastGame=g;pendingOwner=null;requested=null;menuOpen=false;closePanels();owner=null;}
  menuControls();
  const hidden=blocked||critical;if(dock.hidden!==hidden)dock.hidden=hidden;token(body,'hud-layout-active',!blocked);token(body,'hud-modal-open',blocked);token(body,'hud-critical-landing',critical);token(body,'hud-scope-view',scopeActive);
  const caption=by('radio'),groundItems=by('groundItemsUI');
  if(caption){
   const rows=Array.from(caption.children),priority=cockpit?(rows.filter(n=>n.classList.contains('bad')).at(-1)||rows.at(-1)):null;
   for(const node of rows)token(node,'hud-radio-suppressed',cockpit&&node!==priority);
   if(!blocked&&!critical&&g?.evade&&visible(groundItems)){watch(groundItems);set(caption,'--hud-ground-caption-bottom',Math.ceil(root.innerHeight-groundItems.getBoundingClientRect().top+8)+'px');}
   else if(caption.style.getPropertyValue('--hud-ground-caption-bottom'))caption.style.removeProperty('--hud-ground-caption-bottom');
  }
  if(blocked)return false;
  if(critical)return true;
  if(pendingOwner&&expanded(pendingOwner))owner=pendingOwner;
  else if(owner!=='pow-menu'&&!expanded(owner))owner=null;
  const menu=root.document.querySelector('#powHUD .pow-tools-menu');if(menu?.open)owner='pow-menu';else if(owner==='pow-menu')owner=null;
  if(!owner&&!critical&&!cockpit)owner=['demo','teach','strike','route','companion','scan','coach'].find(expanded)||null;
  if(cockpit&&!pendingOwner&&!owner&&!closing){closing=true;try{for(const name of ['demo','teach','strike','route','companion'])close(name);}finally{closing=false;}}
  if(owner&&!closing&&(!pendingOwner||expanded(pendingOwner))){closing=true;try{for(const name of ['demo','teach','strike','route','companion'])if(name!==owner)close(name);}finally{closing=false;}}
  const cue=by('flightCoachCue');if(cue){const suppressed=critical||(cockpit?owner!=='coach':!!owner&&owner!=='coach');token(cue,'hud-cue-suppressed',suppressed);attr(cue,'aria-hidden',String(suppressed||cue.hidden));}
  const scan=by('flightStrikeScan');if(scan){const suppressed=critical||(cockpit?owner!=='scan':!!owner&&owner!=='scan');token(scan,'hud-cue-suppressed',suppressed);attr(scan,'aria-hidden',String(suppressed||scan.hidden));}
  dock.dataset.panel=owner||'';
  const controls=['stick','pickle','btnFire'].map(by).filter(visible).map(rectangle);
  const controlTop=controls.length?Math.min(...controls.map(b=>b.top-8)):root.innerHeight-62;
  if(cockpit){
   const focus=focusPlan(root.innerWidth,root.innerHeight,{controlTop,canvasReservations:canvasReservations(g,root.innerWidth,root.innerHeight)}),demo=visible(by('missionDemo')),reading=!!owner||menuOpen,feedback=by('flightAirframeFeedback'),criticalFeedback=visible(feedback)&&feedback.dataset.kind==='critical';
   token(body,'hud-critical-feedback',criticalFeedback);token(body,'hud-reading-open',reading);attr(dock,'data-menu-open',String(menuOpen));
   set(dock,'left',focus.railLeft+'px');set(dock,'top',focus.top+'px');set(dock,'width','108px');
   for(const [key,value]of Object.entries({'--hud-panel-left':focus.left,'--hud-panel-width':focus.width,'--hud-demo-left':focus.left,'--hud-demo-width':Math.min(224,focus.width)}))set(dock,key,value+'px');
   if(feedback){set(feedback,'--hud-critical-left',focus.left+'px');set(feedback,'--hud-critical-top',focus.panelTop+'px');set(feedback,'--hud-critical-width',focus.width+'px');}
   const warningHeight=criticalFeedback?feedback.getBoundingClientRect().height+6:0,demoTop=focus.demoTop+warningHeight;
   set(dock,'--hud-demo-top',demoTop+'px');
   const panelTop=demo&&reading?Math.ceil(by('missionDemo').getBoundingClientRect().bottom)+6:demoTop,captions=by('radio'),panelHeight=Math.max(44,Math.min(280,controlTop-panelTop));
   set(dock,'--hud-panel-viewport-top',panelTop+'px');set(dock,'--hud-panel-height',panelHeight+'px');
   if(captions){
    const phone=root.innerWidth<900,m=scopeActive?scopeMetrics(g,root.innerWidth,root.innerHeight):null;
    let left=m?12:phone?294:340,top=m?m.navBottom+8:50,width=m?m.navRight-10:Math.max(140,root.innerWidth-left-(phone?224:260)),height=m?Math.max(24,Math.min(90,controlTop-top)):38;
    const conflicts=(g.hud?._warningRects||[]).some(r=>overlaps({left,top,right:left+width,bottom:top+height},r));
    if(conflicts&&!m){left=focus.left;top=Math.max(focus.panelTop+warningHeight,demo?Math.ceil(by('missionDemo').getBoundingClientRect().bottom)+4:0);width=focus.width;height=Math.max(24,Math.min(60,controlTop-top));}
    set(captions,'--hud-flight-caption-left',left+'px');set(captions,'--hud-flight-caption-top',top+'px');set(captions,'--hud-flight-caption-width',width+'px');set(captions,'--hud-flight-caption-height',height+'px');
   }
   return true;
  }
  token(body,'hud-reading-open',false);token(body,'hud-critical-feedback',false);
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
  if(cockpit&&menuOpen&&visible(menu))panels.push(menu);
  return {owner:owner||(menuOpen?'menu':null),menuOpen,cockpit,updates,mutations,hidden:!dock||dock.hidden,dock:dock&&!dock.hidden?rectangle(dock):null,clearView:cockpit&&!context?.App?.game?.hud?.scope?focusPlan(root.innerWidth,root.innerHeight).central:null,canvasReservations:canvasReservations(context?.App?.game,root.innerWidth,root.innerHeight),panels:panels.map(n=>({id:n.id||n.className,rect:rectangle(n)})),controls:['pauseBtn','stick','rcol','rpow','fcol','pickle','btnFire'].map(by).filter(visible).map(n=>({id:n.id,rect:rectangle(n)}))};
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
  root.addEventListener('keydown',event=>{if(event.code!=='Escape'||!cockpit||!menuOpen&&!owner)return;event.preventDefault();event.stopImmediatePropagation();closePanels();menuOpen=false;menuToggle?.focus();},true);
  root.document.addEventListener('toggle',event=>{if(event.target.matches?.('#powHUD .pow-tools-menu')&&event.target.open)closePanels('pow-menu');},true);
  if(typeof root.MutationObserver==='function'){observer=new root.MutationObserver(records=>{mutations+=records.length;schedule();});observer.observe(root.document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','open','aria-expanded','aria-pressed']});}
  root.addEventListener?.('resize',schedule);mount();schedule();return true;
 }
 root.HUDLayout=Object.freeze({install,update,inspect,closePanels,plan,focusPlan,canvasReservations});
})(typeof window!=='undefined'?window:globalThis);
