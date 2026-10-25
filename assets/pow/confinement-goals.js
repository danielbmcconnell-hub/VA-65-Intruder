/* Measured, fictional survival goals. This view reads the existing condition,
 * daily activity, transfer and vent state; viewing it never advances a route. */
(function(root){
 'use strict';
 const P=root.POW;if(!P)throw Error('POW core must load before confinement goals.');
 const finite=(n,d=0)=>Number.isFinite(n)?n:d,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const PROJECTS=['car','architecture','city','memory'],touchSummaries=new WeakSet(),menuOverlays=new WeakMap();let installed=false,mountedHUD=null;
 function view(game){
  const s=game&&game.pow,c=s&&s.captivity;if(!s||!c||s.stage!=='solitary')return null;
  const stats=s.stats||{},day=Math.max(1,finite(s.day,1)),rewards=c.rewards||{},daily=c.daily||{},tap=c.tap||{},vent=c.vent||{};
  const condition=[
   {id:'body',label:'Physical health',value:clamp(finite(stats.physical),0,100),help:'Eat the daily ration, rest and complete gentle seated exercise.'},
   {id:'mind',label:'Mental reserve',value:clamp(finite(stats.resilience),0,100),help:'Complete remembered projects, use memory exercises and maintain contact. Memory '+Math.round(finite(stats.memory))+'/100; morale '+Math.round(finite(stats.morale))+'/100.'},
   {id:'hope',label:'Hope / personal spirit',value:clamp(finite(stats.hope),0,100),help:'Decoded contact and optional personal anchors support hope. Prayer and secular reflection have the same small daily benefit.'},
   {id:'fatigue',label:'Fatigue · lower is better',value:clamp(finite(stats.fatigue),0,100),help:'Rest or sleep at the mat before exhaustion.'}
  ];
  const tasks=[
   {id:'meal',label:'Take today’s ration',done:daily.meal===day,where:'Face the food tray in the cell and hold F or Interact.'},
   {id:'project',label:'Complete one mental project or memory sequence',done:PROJECTS.some(id=>rewards[id]===day),tab:'notebook',where:'Choose Engine, House, City or Memory and finish its steps.'},
   {id:'exercise',label:'Gentle movement and breathing',done:rewards.exercise===day,tab:'exercise',where:'Alternate eight seated presses, then hold quiet breathing for three seconds.'},
   {id:'contact',label:'Receive or send a decoded message',done:rewards.tapReceive===day||rewards.tapSend===day,tab:'tap',where:'Use Tap code to count a received word or transmit a correct reply.'},
   {id:'anchor',label:'Optional personal anchor',done:rewards.code===day,tab:'exercise',where:'Choose quiet reflection, prayer or another personal anchor; belief is never required.'}
  ];
  const eligibility=P.RegularConfinement&&P.RegularConfinement.eligibility?P.RegularConfinement.eligibility(game):{ready:false,requirements:[],missing:['Establish a confinement routine first.']};
  const requirements=(eligibility.requirements||[]).map(q=>({...q})),observations=finite(c.observations),work=clamp(finite(vent.work),0,3);
  const escapeReady=!!vent.route&&observations>=2&&finite(c.inspectionUntil)<=finite(c.elapsedMinutes);
  let next;
  if(c.releaseAvailable)next={text:'The 1973 release ending is available. Review it at the cell door.',tab:'release'};
  else if(c.pendingEvent)next={text:'An interview request is waiting. Consider your response; recovering afterwards is part of survival.',tab:'interview'};
  else if(c.sleeping)next={text:'A rest interval is running. Allow recovery or wake when ready.',tab:'rest'};
  else if(c.routine&&c.routine.active){const target=Math.max(.001,finite(c.routine.target,7)),elapsed=clamp(finite(c.routine.elapsed),0,target);next={text:'Established routine: '+elapsed.toFixed(1)+'/'+target.toFixed(1)+' days. Open Rest / time to pause; review opportunities when it stops.',tab:'rest'};}
  else if(finite(stats.fatigue)>82)next={text:'Rest at the sleeping mat before further physical work.',tab:'rest'};
  else if(!tasks[0].done)next={text:'Take today’s ration: face the tray and hold F or Interact.'};
  else if(!tasks[1].done)next={text:'Choose one remembered project or memory sequence and complete its steps.',tab:'notebook'};
  else if(!tasks[3].done)next={text:'Listen and decode a message, or send a correctly counted reply.',tab:'tap'};
  else if(eligibility.ready)next={text:'Regular imprisonment is available. Return to the cell, face the door and hold F. Transfer is not escape.',tab:'door'};
  else if(escapeReady)next={text:'A fictional physical escape attempt is ready. Review the route; guards and barriers remain.',tab:'route'};
  else if(vent.noticed&&work<3)next={text:vent.lastDay===day?'Vent work is done for today. Rest, maintain contact and return on another day.':'A loose vent fastener can be worked during daylight. Face it and hold F; one careful attempt per day.',tab:'route'};
  else if(observations<2)next={text:'Face the cell door and hold F to record the corridor routine on separate occasions.',tab:'door'};
  else next={text:'Maintain the routine, review your condition and watch for a safe opportunity.',tab:'rest'};
  return {day,condition,tasks,dailyDone:tasks.filter(q=>q.done).length,dailyTotal:tasks.length,next,transfer:{ready:!!eligibility.ready,requirements,done:requirements.filter(q=>q.ready).length,total:requirements.length,missing:(eligibility.missing||[]).slice()},escape:{noticed:!!vent.noticed,work,observations,ready:escapeReady,inspection:finite(c.inspectionUntil)>finite(c.elapsedMinutes)},elapsedDays:Math.max(0,day-finite(c.captureDay,1)),complete:!!s.complete};
 }
 function el(tag,text,cls){const n=root.document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
 function current(){return P.ctx&&P.ctx.App&&P.ctx.App.game;}
 function blurInside(node){const a=root.document.activeElement;if(a&&node.contains(a)&&a.blur)a.blur();}
 function closeMenu(menu){if(!menu)return;menu.open=false;menuOverlays.get(menu)?.sync();blurInside(menu);}
 function bindMenuOverlay(menu,overlay){
  if(!menu||!overlay||!overlay.style)return null;
  if(menuOverlays.has(menu))return menuOverlays.get(menu);
  let before=null;
  const restore=()=>{if(!before)return;if(before.value)overlay.style.setProperty('visibility',before.value,before.priority);else overlay.style.removeProperty('visibility');before=null;};
  const sync=()=>{
   if(menu.open&&menu.isConnected!==false){
    if(!before)before={value:overlay.style.getPropertyValue('visibility'),priority:overlay.style.getPropertyPriority('visibility')};
    overlay.style.setProperty('visibility','hidden','important');
   }else restore();
  };
  const binding={sync,dispose(){restore();menu.removeEventListener('toggle',sync);menuOverlays.delete(menu);}};
  menu.addEventListener('toggle',sync);menuOverlays.set(menu,binding);sync();return binding;
 }
 function bindSummaryTouch(summary){
  if(!summary||typeof summary.addEventListener!=='function'||touchSummaries.has(summary))return false;
  touchSummaries.add(summary);let press=null,touchClickUntil=0;
  summary.addEventListener('pointerdown',event=>{
   if(event.pointerType!=='touch')return;
   if(event.isPrimary===false){if(press)press.moved=true;touchClickUntil=Date.now()+700;return;}
   if(press&&press.id!==event.pointerId){press.moved=true;return;}
   press={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
  });
  summary.addEventListener('pointermove',event=>{if(press&&press.id===event.pointerId&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>7)press.moved=true;});
  const cancel=event=>{if(press&&press.id===event.pointerId){touchClickUntil=Date.now()+700;press=null;}};
  summary.addEventListener('pointercancel',cancel);summary.addEventListener('lostpointercapture',cancel);
  summary.addEventListener('pointerup',event=>{
   const p=press;if(!p)return;touchClickUntil=Date.now()+700;
   if(p.id!==event.pointerId){p.moved=true;return;}
   press=null;const r=summary.getBoundingClientRect();
   if(p.moved||event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)return;
   // Touch look/joystick navigation can suppress the compatibility click.
   // A released tap activates the original summary once, like POW buttons.
   summary.click();
  });
  summary.addEventListener('click',event=>{
   const touch=event.pointerType==='touch'||event.sourceCapabilities?.firesTouchEvents||!event.pointerType&&!event.sourceCapabilities;
   if(event.detail>0&&touch&&Date.now()<touchClickUntil){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  return true;
 }
 function attachHUD(){
  const u=P.ui;if(mountedHUD&&(mountedHUD.ui!==u||mountedHUD.menu.isConnected===false)){mountedHUD.overlay?.dispose();mountedHUD=null;}
  if(!root.document||!u||u.confinementGoals)return;
  const tools=u.root.querySelector('.pow-tools'),menu=el('details',undefined,'pow-tools-menu'),summary=el('summary','Camp menu'),actions=el('div',undefined,'pow-menu-actions');
  if(tools){const children=Array.from(tools.children);menu.appendChild(summary);menu.appendChild(actions);for(const n of children)actions.appendChild(n);tools.appendChild(menu);menu.addEventListener('toggle',()=>{if(menu.open){for(const d of u.header.querySelectorAll('details[open]'))d.open=false;if(root.HUDLayout&&root.HUDLayout.closePanels)root.HUDLayout.closePanels('pow-menu');}else blurInside(menu);});actions.addEventListener('click',event=>{if(event.target.closest('button'))closeMenu(menu);});}
  const row=el('div',undefined,'pow-goals-toolbar'),condition=u.header.querySelector('.pow-condition'),button=el('button','Goals / progress','pow-goals-open');button.type='button';button.setAttribute('data-confinement-goals','');button.addEventListener('click',()=>{const g=current();if(g&&P.Captivity){closeMenu(menu);P.Captivity.open(g,'goals');}});
  if(condition)row.appendChild(condition);row.appendChild(button);u.header.insertBefore(row,u.river||null);
  if(condition)condition.addEventListener('toggle',()=>{if(condition.open)closeMenu(menu);});
  for(const node of [summary,condition&&condition.querySelector('summary'),u.settings&&u.settings.querySelector('summary')])bindSummaryTouch(node);
  const contextOverlay=bindMenuOverlay(menu,u.root.querySelector('.pow-context-controls'));mountedHUD={ui:u,menu,overlay:contextOverlay};
  u.confinementGoals={row,button,condition,summary:condition&&condition.querySelector('summary'),menu,contextOverlay,lastGame:null};
 }
 function renderHUD(game){
  attachHUD();const u=P.ui,g=u&&u.confinementGoals;if(!g)return;const model=view(game);g.button.hidden=!model;
  const modal=!!(game&&game.pow&&(game.pow.modalOpen||game.pow.captivity&&game.pow.captivity.open));
  if(modal)closeMenu(g.menu);
  if(g.lastGame!==game){closeMenu(g.menu);if(g.condition)g.condition.open=false;g.lastGame=game;}
  if(u.root.hidden)closeMenu(g.menu);else g.contextOverlay?.sync();
  if(!model){if(g.summary)g.summary.textContent='Condition';return;}
  if(g.summary)g.summary.textContent='Body '+Math.round(model.condition[0].value)+' · Mind '+Math.round(model.condition[1].value)+' · Hope '+Math.round(model.condition[2].value);
  g.button.textContent='Goals · '+model.dailyDone+'/'+model.dailyTotal;
  u.objective.textContent='NEXT · '+model.next.text;
 }
 function metric(parent,q){const label=el('label',undefined,'pow-goal-metric');label.appendChild(el('span',q.label));label.appendChild(el('strong',Math.round(q.value)+'/100'));const meter=el('meter');meter.min=0;meter.max=100;meter.low=30;meter.high=70;meter.optimum=q.id==='fatigue'?0:100;meter.value=q.value;meter.setAttribute('aria-label',q.label);meter.setAttribute('data-condition-meter',q.id);label.appendChild(meter);parent.appendChild(label);return label;}
 function renderPanel(game,panel,options={}){
  const model=view(game);if(!model||!root.document)return;const section=el('section',undefined,'pow-confinement-goals');section.setAttribute('data-confinement-progress','');panel.appendChild(section);
  section.appendChild(el('h3','Survive, maintain yourself and prepare opportunities'));
  section.appendChild(el('p','Protect your body, keep your mind active, sustain hope and observe the routine. Escape is an optional physical attempt; a transfer only moves you to another secure part of the camp.'));
  const metrics=el('div',undefined,'pow-goal-metrics');section.appendChild(metrics);for(const q of model.condition)metric(metrics,q);
  section.appendChild(el('p','Next: '+model.next.text,'pow-goal-next'));
  if(options.compact){section.appendChild(el('p','Today’s optional routine '+model.dailyDone+'/'+model.dailyTotal+' · transfer requirements '+model.transfer.done+'/'+model.transfer.total+' · vent work '+model.escape.work+'/3 days. Open Goals / progress for the checklist.','pow-dim'));return;}
  const routine=el('div',undefined,'pow-goal-block');section.appendChild(routine);routine.appendChild(el('h3','Today’s optional routine · '+model.dailyDone+'/'+model.dailyTotal));
  const list=el('ul');routine.appendChild(list);for(const q of model.tasks){const li=el('li');li.dataset.ready=String(q.done);li.appendChild(el('strong',(q.done?'✓ ':'○ ')+q.label));li.appendChild(el('span',q.where));list.appendChild(li);}
  section.appendChild(el('p','Activities give one daily benefit. Prayer and quiet reflection are equally useful choices.','pow-dim'));
  const transfer=el('div',undefined,'pow-goal-block');section.appendChild(transfer);transfer.appendChild(el('h3','Return to regular imprisonment · '+model.transfer.done+'/'+model.transfer.total+' requirements'));
  const requirements=el('ul');transfer.appendChild(requirements);for(const q of model.transfer.requirements){const li=el('li');li.dataset.ready=String(q.ready);li.appendChild(el('strong',(q.ready?'✓ ':'○ ')+q.label));li.appendChild(el('span',q.detail));const p=el('progress');p.max=1;p.value=clamp(q.value/Math.max(.00001,q.target),0,1);p.setAttribute('aria-label',q.label+' progress');li.appendChild(p);requirements.appendChild(li);}
  transfer.appendChild(el('p',model.transfer.ready?'Ready: return to the cell, face the door and hold F or Interact. This is a transfer, not freedom.':'Complete these requirements through the cell’s activities, then use the door when ready.','pow-dim'));
  const escape=el('div',undefined,'pow-goal-block');section.appendChild(escape);escape.appendChild(el('h3','Optional physical escape preparation'));
  escape.appendChild(el('p',(model.escape.noticed?'Loose vent discovered.':'The vent opportunity emerges after weeks of observation.')+' Controlled fastener work: '+model.escape.work+'/3 separate days. Corridor observations: '+Math.min(2,model.escape.observations)+'/2.'));
  escape.appendChild(el('p',model.escape.ready?'The route is available in the cell. Review the physical route; guards, barriers and recapture still apply.':model.escape.inspection?'Wait until the current corridor inspection ends before working the vent.':'Use the real cell interactions during daylight; rest before physical work and do not repeat fastener work on the same day.'));
  section.appendChild(el('p','Use the meters to balance recovery, practice and contact. Lower fatigue is better. The accelerated calendar and escape opportunities represent fictional gameplay.','pow-dim'));
 }
 function install(){
  if(installed||typeof P.mountUI!=='function'||typeof P.updateUI!=='function')return false;installed=true;
  const mount=P.mountUI,update=P.updateUI;P.mountUI=function(){const result=mount.apply(this,arguments);attachHUD();return result;};P.updateUI=function(game){const result=update.apply(this,arguments);renderHUD(game);return result;};
  if(root.addEventListener)root.addEventListener('keydown',event=>{
   const u=P.ui,g=u&&u.confinementGoals;if(!g)return;const active=root.document.activeElement;
   if(event.code==='Escape'&&g.menu&&g.menu.open){event.preventDefault();event.stopImmediatePropagation();closeMenu(g.menu);}
   else if((event.code==='Space'||event.code==='Enter')&&active){
    const summary=active.tagName==='SUMMARY'&&active.closest('#powHUD'),button=active.tagName==='BUTTON'&&g.menu&&g.menu.open&&g.menu.contains(active);
    if(summary||button){
     // The game's capturing Space handler otherwise consumes the UI key.
     // Activate the original control once and cancel the keyboard default,
     // including Enter's default click, so its action cannot run twice.
     event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)active.click();
    }
   }
  },true);
  return true;
 }
 P.ConfinementGoals=Object.freeze({view,renderHUD,renderPanel,install,bindSummaryTouch,bindMenuOverlay});install();
})(typeof window!=='undefined'?window:globalThis);
