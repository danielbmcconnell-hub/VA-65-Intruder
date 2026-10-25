/* Measured, fictional survival goals. This view reads the existing condition,
 * daily activity, transfer and vent state; viewing it never advances a route. */
(function(root){
 'use strict';
 const P=root.POW;if(!P)throw Error('POW core must load before confinement goals.');
 const finite=(n,d=0)=>Number.isFinite(n)?n:d,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const PROJECTS=['car','architecture','city','memory'],touchSummaries=new WeakSet(),menuOverlays=new WeakMap(),continued=new WeakSet();let installed=false,mountedHUD=null;
 function chapter(game){
  const s=game&&game.pow;if(!s)return null;const f=s.flags||{},i=s.inventory||{},r=s.regular||{},rf=r.flags||{},river=s.river||{};
  const count=values=>values.filter(Boolean).length;
  if(s.stage==='cell')return {win:'Open the cell and step into the corridor',progress:count([i.bracket,f.doorOpen])+'/2 · bracket / door',continuation:'Then cross the roof, reach the river and earn offshore recovery.'};
  if(s.stage==='compound')return {win:'Collect the rope and descend the outer wall',progress:count([i.rope,f.outside])+'/2 · rope / wall descent',continuation:'Then follow the street to the river and earn offshore recovery.'};
  if(s.stage==='hanoi')return {win:'Reach the riverbank at the end of the lane',progress:'Street → river',continuation:'The river ends at a fictional offshore recovery; entering the water is a checkpoint.'};
  if(s.stage==='regular')return {win:'Cross the outer boundary into the street',progress:count([r.inventory?.tool,rf.drainOpen||rf.hatchOpen,rf.drainGateOpen||rf.gateOpen])+'/3 · tool / passage / outer gate',continuation:'Choose the cloth-muffled washing passage or exposed workshop. Then reach the river and earn offshore recovery.'};
  if(s.stage==='river')return {win:'Signal the offshore ship and be brought aboard',progress:count([river.phase==='gulf',river.ship?.acknowledged,s.complete&&s.outcome?.rescued])+'/3 · Gulf / signal / recovery',continuation:'Reach 96 route km, approach the visible contact, hold F to signal, then stay within 5 m until recovered. The skiff is optional. This successful continuation is fictional.'};
  if(s.stage==='solitary')return {win:'Survive to repatriation or earn a physical escape',progress:'Transfer is a checkpoint',continuation:'The historical ending is release in 1973. A transfer opens regular confinement; a fictional escape continues through the street and river to offshore recovery.'};
  return null;
 }
 function mealHint(game){
  const s=game.pow,e=game.evade,food=root.PrisonFood?.view?.(game),obj=food?.object||(s.objects||[]).find(o=>o.id==='cell-tray');
  if(!e?.p||!obj?.p)return 'Face the ration tin on the cell floor and hold F / Interact; choose Eat today’s ration.';
  const dx=obj.p[0]-e.p[0],dz=obj.p[2]-e.p[2],a=Math.atan2(Math.sin(Math.atan2(dx,-dz)-finite(e.hdg)),Math.cos(Math.atan2(dx,-dz)-finite(e.hdg))),direction=Math.abs(a)<.45?'ahead':Math.abs(a)>2.7?'behind you':a>0?'to your right':'to your left';
  return 'Ration tin '+direction+', on the floor ('+Math.hypot(dx,dz).toFixed(1)+' m). Look down; hold F / Interact, then choose Eat today’s ration.';
 }
 function practice(game){
  const s=game&&game.pow,c=s&&s.captivity;if(!s||s.practice!=='solitary'||!c)return null;const rewards=c.rewards||{},tap=c.tap||{},pacing=c.pacing||{};
  // Every check is a durable field earned by the original activity. This
  // short practice result never finishes the campaign or opens a route.
  const tasks=[
   {id:'meal',label:'Eat the daily ration',done:!!pacing.meal||finite(c.daily?.meal)>0,where:mealHint(game),physical:true},
   {id:'project',label:'Complete one mental project',done:PROJECTS.some(id=>finite(rewards[id])>0),where:'Open Memory, watch Show sequence and repeat the lit tiles. Engine, House or City also count.',tab:'memory'},
   {id:'exercise',label:'Finish seated exercise and breathing',done:finite(rewards.exercise)>0,where:'Exercise / anchor: Begin gentle seated set, alternate eight shoulder presses, then hold quiet breathing for three seconds.',tab:'exercise'},
   {id:'receive',label:'Decode an incoming tap message',done:finite(tap.received)>0,where:'Tap code: Listen / replay message. Count row and column pulses, enter each letter, then Check complete word.',tab:'tap'},
   {id:'reply',label:'Transmit a correct reply',done:finite(tap.sent)>0,where:'Tap code: choose Transmit, spell the displayed target with the matrix and counted taps, then Check complete word.',tab:'tap'},
   {id:'rest',label:'Complete two simulated hours of rest',done:finite(pacing.restMinutes)>=120,progress:Math.min(120,Math.floor(finite(pacing.restMinutes)))+'/120 min',where:'Rest / time: Rest up to two hours takes eight real seconds. Let the interval finish.',tab:'rest'},
   {id:'observe',label:'Observe the corridor once',done:finite(c.observations)>=1,where:'Return to the cell, face the door slot and hold F / Interact. An interview decision may need a response first.',physical:true}
  ];
  return {tasks,done:tasks.filter(q=>q.done).length,total:tasks.length,complete:tasks.every(q=>q.done)};
 }
 function view(game){
  const s=game&&game.pow,c=s&&s.captivity;if(!s||!c||s.stage!=='solitary')return null;
  const stats=s.stats||{},day=Math.max(1,finite(s.day,1)),rewards=c.rewards||{},daily=c.daily||{},tap=c.tap||{},vent=c.vent||{},training=practice(game);
  const condition=[
   {id:'body',label:'Physical health',value:clamp(finite(stats.physical),0,100),help:'Eat the daily ration, rest and complete gentle seated exercise.'},
   {id:'mind',label:'Mental reserve',value:clamp(finite(stats.resilience),0,100),help:'Complete remembered projects, use memory exercises and maintain contact. Memory '+Math.round(finite(stats.memory))+'/100; morale '+Math.round(finite(stats.morale))+'/100.'},
   {id:'hope',label:'Hope / personal spirit',value:clamp(finite(stats.hope),0,100),help:'Decoded contact and optional personal anchors support hope. Prayer and secular reflection have the same small daily benefit.'},
   {id:'fatigue',label:'Fatigue · lower is better',value:clamp(finite(stats.fatigue),0,100),help:'Rest or sleep at the mat before exhaustion.'}
  ];
  const tasks=[
   {id:'meal',label:'Take today’s ration',done:daily.meal===day,where:mealHint(game)},
   {id:'project',label:'Complete one mental project or memory sequence',done:PROJECTS.some(id=>rewards[id]===day),tab:'notebook',where:'Choose Engine, House, City or Memory and finish its steps.'},
   {id:'exercise',label:'Gentle movement and breathing',done:rewards.exercise===day,tab:'exercise',where:'Alternate eight seated presses, then hold quiet breathing for three seconds.'},
   {id:'contact',label:'Receive or send a decoded message',done:rewards.tapReceive===day||rewards.tapSend===day,tab:'tap',where:'Use Tap code to count a received word or transmit a correct reply.'},
   {id:'anchor',label:'Optional personal anchor',done:rewards.code===day,tab:'exercise',where:'Choose quiet reflection, prayer or another personal anchor; belief is never required.'}
  ];
  const eligibility=P.RegularConfinement&&P.RegularConfinement.eligibility?P.RegularConfinement.eligibility(game):{ready:false,requirements:[],missing:['Establish a confinement routine first.']};
  const requirements=(eligibility.requirements||[]).map(q=>({...q})),observations=finite(c.observations),work=clamp(finite(vent.work),0,3);
  const escapeReady=!!vent.route&&observations>=2&&finite(c.inspectionUntil)<=finite(c.elapsedMinutes);
  let next;
  if(training?.complete&&!continued.has(game))next={text:'PRACTICE COMPLETE · All seven survival tasks earned. Open Goals to return to Ready Room or continue captivity.',tab:'goals'};
  else if(c.releaseAvailable)next={text:'The 1973 release ending is available. Review it at the cell door.',tab:'release'};
  else if(c.pendingEvent)next={text:'An interview request is waiting. Consider your response; recovering afterwards is part of survival.',tab:'interview'};
  else if(c.sleeping)next={text:'A rest interval is running. Allow recovery or wake when ready.',tab:'rest'};
  else if(c.routine&&c.routine.active){const target=Math.max(.001,finite(c.routine.target,7)),elapsed=clamp(finite(c.routine.elapsed),0,target);next={text:'Established routine: '+elapsed.toFixed(1)+'/'+target.toFixed(1)+' days. Open Rest / time to pause; review opportunities when it stops.',tab:'rest'};}
  else if(finite(stats.fatigue)>82)next={text:'Rest at the sleeping mat before further physical work.',tab:'rest'};
  else if(training&&!training.complete){const task=training.tasks.find(q=>!q.done);next={text:task.where,tab:task.tab};}
  else if(!tasks[0].done)next={text:mealHint(game)};
  else if(!tasks[1].done)next={text:'Choose one remembered project or memory sequence and complete its steps.',tab:'notebook'};
  else if(!tasks[3].done)next={text:'Listen and decode a message, or send a correctly counted reply.',tab:'tap'};
  else if(eligibility.ready)next={text:'Regular imprisonment is available. Return to the cell, face the door and hold F. Transfer is not escape.',tab:'door'};
  else if(escapeReady)next={text:'A fictional physical escape attempt is ready. Review the route; guards and barriers remain.',tab:'route'};
  else if(vent.noticed&&work<3)next={text:vent.lastDay===day?'Vent work is done for today. Rest, maintain contact and return on another day.':'A loose vent fastener can be worked during daylight. Face it and hold F; one careful attempt per day.',tab:'route'};
  else if(observations<2)next={text:'Face the cell door and hold F to record the corridor routine on separate occasions.',tab:'door'};
  else next={text:'Maintain the routine, review your condition and watch for a safe opportunity.',tab:'rest'};
  return {day,condition,tasks,practice:training,dailyDone:tasks.filter(q=>q.done).length,dailyTotal:tasks.length,next,transfer:{ready:!!eligibility.ready,requirements,done:requirements.filter(q=>q.ready).length,total:requirements.length,missing:(eligibility.missing||[]).slice()},escape:{noticed:!!vent.noticed,work,observations,ready:escapeReady,inspection:finite(c.inspectionUntil)>finite(c.elapsedMinutes)},elapsedDays:Math.max(0,day-finite(c.captureDay,1)),complete:!!s.complete};
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
  if(tools){const children=Array.from(tools.children);menu.appendChild(summary);menu.appendChild(actions);for(const n of children)actions.appendChild(n);tools.appendChild(menu);menu.addEventListener('toggle',()=>{if(menu.open){for(const d of u.header.querySelectorAll('details[open]'))d.open=false;if(root.HUDLayout&&root.HUDLayout.closePanels)root.HUDLayout.closePanels('pow-menu');}else blurInside(actions);});actions.addEventListener('click',event=>{if(event.target.closest('button'))closeMenu(menu);});}
  const win=el('span',undefined,'pow-chapter-win');win.setAttribute('data-chapter-win','');u.header.insertBefore(win,u.objective);
  const row=el('div',undefined,'pow-goals-toolbar'),condition=u.header.querySelector('.pow-condition'),button=el('button','Goals / progress','pow-goals-open');button.type='button';button.setAttribute('data-confinement-goals','');button.addEventListener('click',()=>{const g=current();if(g&&P.Captivity){closeMenu(menu);P.Captivity.open(g,'goals');}});
  if(condition)row.appendChild(condition);row.appendChild(button);u.header.insertBefore(row,u.river||null);
  if(condition)condition.addEventListener('toggle',()=>{if(condition.open)closeMenu(menu);});
  for(const node of [summary,condition&&condition.querySelector('summary'),u.settings&&u.settings.querySelector('summary')])bindSummaryTouch(node);
  const contextOverlay=bindMenuOverlay(menu,u.root.querySelector('.pow-context-controls'));mountedHUD={ui:u,menu,overlay:contextOverlay};
  const route=el('p',undefined,'pow-chapter-route');if(condition)condition.appendChild(route);
  u.confinementGoals={row,button,condition,summary:condition&&condition.querySelector('summary'),menu,contextOverlay,win,route,lastGame:null};
 }
 function renderHUD(game){
  attachHUD();const u=P.ui,g=u&&u.confinementGoals;if(!g)return;const model=view(game),route=chapter(game);g.button.hidden=!model;
  g.win.hidden=!route;if(route){g.win.textContent='CHAPTER WIN · '+route.win+' · '+route.progress;g.route.textContent=route.continuation;}
  if(model?.practice){const p=model.practice;g.win.textContent=p.complete?'PRACTICE COMPLETE · '+p.done+'/'+p.total+' survival tasks earned':'WIN · Complete 7 survival tasks · '+p.done+'/'+p.total;g.route.textContent='This standalone practice ends when all seven tasks are earned. Longer captivity, transfer and physical escape remain optional; open Goals for the checklist.';}
  const modal=!!(game&&game.pow&&(game.pow.modalOpen||game.pow.captivity&&game.pow.captivity.open));
  if(modal)closeMenu(g.menu);
  if(g.lastGame!==game){closeMenu(g.menu);if(g.condition)g.condition.open=false;g.lastGame=game;}
  if(u.root.hidden)closeMenu(g.menu);else g.contextOverlay?.sync();
  if(!model){if(g.summary)g.summary.textContent='Condition';return;}
  if(g.summary)g.summary.textContent='Body '+Math.round(model.condition[0].value)+' · Mind '+Math.round(model.condition[1].value)+' · Hope '+Math.round(model.condition[2].value);
  g.button.textContent=model.practice?'Goals · '+model.practice.done+'/'+model.practice.total:'Goals · '+model.dailyDone+'/'+model.dailyTotal;
  u.objective.textContent='NEXT · '+model.next.text;
 }
 function metric(parent,q){const label=el('label',undefined,'pow-goal-metric');label.appendChild(el('span',q.label));label.appendChild(el('strong',Math.round(q.value)+'/100'));const meter=el('meter');meter.min=0;meter.max=100;meter.low=30;meter.high=70;meter.optimum=q.id==='fatigue'?0:100;meter.value=q.value;meter.setAttribute('aria-label',q.label);meter.setAttribute('data-condition-meter',q.id);label.appendChild(meter);parent.appendChild(label);return label;}
 function renderPanel(game,panel,options={}){
  const model=view(game);if(!model||!root.document)return;const section=el('section',undefined,'pow-confinement-goals');section.setAttribute('data-confinement-progress','');panel.appendChild(section);
  if(model.practice){
   const p=model.practice,training=el('div',undefined,'pow-goal-block pow-practice-goal');training.setAttribute('data-practice-goal','');training.dataset.complete=String(p.complete);section.appendChild(training);
   training.appendChild(el('h3',p.complete?'PRACTICE COMPLETE · 7/7 earned':'WIN · Complete the survival routine · '+p.done+'/'+p.total));
   training.appendChild(el('p',p.complete?'You earned the standalone survival goal through real activities. You can finish here or continue into the longer confinement and escape routes.':'Earn these seven tasks once. They remain checked after the day changes and after Save / Continue. This short practice does not require four weeks of confinement.'));
   if(!options.compact){const list=el('ul');training.appendChild(list);for(const q of p.tasks){const li=el('li');li.dataset.ready=String(q.done);li.setAttribute('data-practice-task',q.id);li.appendChild(el('strong',(q.done?'✓ ':'○ ')+q.label+(q.progress?' · '+q.progress:'')));li.appendChild(el('span',q.where));if(!q.done){const b=el('button',q.tab?'Open '+({memory:'Memory',exercise:'Exercise',tap:'Tap code',rest:'Rest / time'}[q.tab]||q.tab):q.id==='meal'?'Find ration in cell':'Find door slot in cell');b.type='button';b.addEventListener('click',()=>q.tab?P.Captivity.open(game,q.tab):P.Captivity.close(game));li.appendChild(b);}list.appendChild(li);}}
   const actions=el('div',undefined,'pow-practice-actions');training.appendChild(actions);
   const watch=el('button','Watch solitary survival');watch.type='button';watch.setAttribute('data-watch-solitary','');watch.disabled=!root.MissionDemo?.startChapter;watch.addEventListener('click',()=>{P.Captivity.close(game);root.MissionDemo.startChapter('solitary');});actions.appendChild(watch);
   if(p.complete){const leave=el('button','Return to Ready Room');leave.type='button';leave.setAttribute('data-practice-finish','');leave.addEventListener('click',()=>{P.Captivity.close(game);P.save(game);const app=game.app||P.ctx?.App;if(app){app.game=null;app.show('ready');}});actions.appendChild(leave);const keep=el('button','Continue captivity');keep.type='button';keep.setAttribute('data-practice-continue','');keep.addEventListener('click',()=>{continued.add(game);P.Captivity.close(game);P.updateUI(game);});actions.appendChild(keep);}
   if(options.compact){section.appendChild(el('p','Next: '+model.next.text,'pow-goal-next'));return;}
  }
  section.appendChild(el('h3','Survive, maintain yourself and prepare opportunities'));
  section.appendChild(el('p',model.practice?'Optional continuation: protect your body, sustain contact and prepare a transfer or physical escape. The seven-task practice goal above is separate.':'WIN · Survive to Operation Homecoming in 1973, or complete a fictional physical escape through the street and river to offshore recovery. Protect your body, sustain contact and prepare opportunities; a transfer is a checkpoint.'));
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
 P.ConfinementGoals=Object.freeze({view,practice,chapter,renderHUD,renderPanel,install,bindSummaryTouch,bindMenuOverlay});install();
})(typeof window!=='undefined'?window:globalThis);
