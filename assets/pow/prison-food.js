/* A visual reference for the existing fictional daily ration. Meal eligibility,
 * condition effects and save data stay with Captivity/RegularConfinement. */
(function(root){
  'use strict';
  let context=null,ui=null,session=null;
  const wrapped=new WeakMap(),meshOwners=new WeakSet();
  const allowed=new Set(['solitary','regular']);
  const owned=g=>!!g&&(!g.app||(g.app.game===undefined||g.app.game===g)&&(g.app.screen===undefined||g.app.screen==='game'));
  const valid=g=>owned(g)&&!!g.pow&&!!g.evade&&g.phase==='evade'&&allowed.has(g.pow.stage)&&!g.pow.complete;
  function eaten(game){
    const s=game&&game.pow;if(!s)return false;
    return s.stage==='regular'?!!s.regular&&s.regular.lastMealDay===s.day:
      !!s.captivity&&!!s.captivity.daily&&s.captivity.daily.meal===s.day;
  }
  function clearInput(g){
    const a=g.app;if(a){if(a.keys)for(const k of Object.keys(a.keys))a.keys[k]=0;if(a.gctl)for(const k of ['pitch','roll','run','fire','interact','climb'])a.gctl[k]=0;}
    if(g.pow){g.pow.holding=null;g.pow.touchInteract=false;g.pow.touchClimb=false;g.pow.interactLatched=false;g.pow.input={};}
    if(g.evade){g.evade.moving=false;g.evade.running=false;}
  }
  function active(game){
    if(session&&(!valid(session.game)||session.game.pow!==session.pow||session.game.evade!==session.actor))close();
    return !!session&&session.game===game;
  }
  function close(){
    if(!session)return false;const s=session;session=null;
    const focused=root.document&&root.document.activeElement;
    if(ui&&focused&&ui.node.contains(focused)&&typeof focused.blur==='function')focused.blur();
    s.pow.modalOpen=s.modalBefore;
    if(s.game.pow===s.pow&&s.game.evade===s.actor)clearInput(s.game);if(ui)ui.node.hidden=true;
    if(valid(s.game)&&s.game.pow===s.pow&&s.game.evade===s.actor&&s.focus&&s.focus.isConnected&&(!ui||!ui.node.contains(s.focus))&&typeof s.focus.focus==='function')s.focus.focus({preventScroll:true});
    return true;
  }
  function refresh(){
    if(!session||!ui)return;
    const empty=eaten(session.game);ui.image.hidden=false;ui.empty.hidden=!empty;
    const imageFile=empty?'assets/prison/ration-empty.webp':'assets/prison/ration.webp';
    if(ui.image.getAttribute('src')!==imageFile)ui.image.src=imageFile;
    ui.image.alt=empty?'Empty worn metal mess tin with a spoon':'Worn metal mess tin containing rice and greens, with a spoon';
    ui.description.textContent=empty?'The day’s portion has been eaten. The empty tin remains until the next daily ration.':'A worn mess tin, rice, a few greens and a spoon. Inspect the ration, then eat or close this view.';
    ui.eat.hidden=empty;ui.eat.disabled=!!session.game.paused;
    ui.node.dataset.empty=String(empty);
  }
  function mount(){
    if(ui||!root.document)return;
    const d=root.document,node=d.createElement('div');node.id='prisonFood';node.hidden=true;node.className='prison-food';
    const panel=d.createElement('section');panel.className='prison-food-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','prisonFoodTitle');panel.tabIndex=-1;
    const title=d.createElement('h2');title.id='prisonFoodTitle';title.textContent='Daily ration';
    const dismiss=d.createElement('button');dismiss.type='button';dismiss.className='btn gho prison-food-dismiss';dismiss.textContent='Close ×';dismiss.setAttribute('aria-label','Close ration view');dismiss.onclick=close;
    const image=d.createElement('img');image.src='assets/prison/ration.webp';image.alt='Worn metal mess tin containing rice and greens, with a spoon';image.width=1536;image.height=1024;
    const empty=d.createElement('p');empty.className='prison-food-empty';empty.textContent='The tin is empty.';
    const description=d.createElement('p');description.className='prison-food-description';
    const note=d.createElement('p');note.className='dim';note.textContent='Appearance guided by the supplied food reference. The portion and daily routine are reconstructed for the game.';
    const eat=d.createElement('button');eat.type='button';eat.className='btn pri';eat.textContent='Eat today’s ration';eat.onclick=()=>consume(session&&session.game);
    panel.append(dismiss,title,image,empty,description,eat,note);node.append(panel);
    node.addEventListener('click',event=>{if(event.target===node)close();});
    node.addEventListener('keydown',event=>{
      if(node.hidden||!session)return;
      event.stopPropagation();
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
      if(event.key==='Tab'){
        const buttons=[dismiss,eat].filter(b=>!b.hidden&&!b.disabled),i=buttons.indexOf(d.activeElement);
        event.preventDefault();buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
      }
      // Movement keys must not leak to the resumed scene when this closes.
      if(['KeyW','KeyA','KeyS','KeyD','KeyF','Space'].includes(event.code))event.stopPropagation();
    });
    d.body.append(node);ui={node,panel,image,empty,description,eat,dismiss};
  }
  function open(game,object,action){
    if(!valid(game)||game.paused||game.pow.modalOpen||game.pow.captivity&&game.pow.captivity.open||typeof action!=='function')return false;
    if(session){if(session.game===game){close();return true;}close();}
    mount();const s=game.pow;
    session={game,pow:s,actor:game.evade,object,action,modalBefore:s.modalOpen,focus:root.document&&root.document.activeElement};
    s.modalOpen=true;clearInput(game);if(root.document&&root.document.pointerLockElement)root.document.exitPointerLock?.();
    if(ui){ui.node.hidden=false;refresh();ui.dismiss.focus({preventScroll:true});}return true;
  }
  function consume(game){
    if(!active(game)||game.paused||eaten(game))return false;
    const s=session;
    // The original callable owns the once-per-day rule and persisted effects.
    const result=s.action.call(s.object,game,s.object);refresh();clearInput(game);
    if(ui&&eaten(game))ui.dismiss.focus({preventScroll:true});return result!==false;
  }
  function mesh(game){
    const R=game&&game.rend,MB=context&&context.MB;if(!R||!R.meshFromBuilder||!MB||meshOwners.has(R))return;
    function create(full){
      const m=new MB(),tin=[.38,.35,.28],edge=[.57,.54,.45],rice=[.63,.59,.43],green=[.12,.15,.055],rust=[.20,.095,.035];
      // Thin oblong pan with rounded corners, an open top and a rolled rim.
      const contour=[];for(const [cx,cz,start]of [[.34,.29,0],[-.34,.29,Math.PI/2],[-.34,-.29,Math.PI],[.34,-.29,Math.PI*1.5]])for(let i=0;i<=5;i++){const a=start+i/5*Math.PI/2;contour.push([cx+Math.cos(a)*.16,cz+Math.sin(a)*.21]);}
      for(let i=0;i<contour.length;i++){
        const a=contour[i],b=contour[(i+1)%contour.length],innerA=a.map(v=>v*.92),innerB=b.map(v=>v*.92);
        m.quad([a[0],-.48,a[1]],[b[0],-.48,b[1]],[b[0],.38,b[1]],[a[0],.38,a[1]],i%7===1?rust:tin);
        m.quad([innerB[0],-.35,innerB[1]],[innerA[0],-.35,innerA[1]],[innerA[0],.38,innerA[1]],[innerB[0],.38,innerB[1]],tin);
        m.quad([a[0],.38,a[1]],[b[0],.38,b[1]],[innerB[0],.38,innerB[1]],[innerA[0],.38,innerA[1]],edge);
        m.tri([0,-.35,0],[innerA[0],-.35,innerA[1]],[innerB[0],-.35,innerB[1]],tin);
      }
      if(full)for(let i=0;i<48;i++){
        const a=i*2.39996323,r=Math.sqrt((i+.5)/48),x=Math.cos(a)*r*.39,z=Math.sin(a)*r*.34;
        m.blob(x,-.07+.13*(1-r),z,.052,.105,.036,i%9===0?green:rice,5,3);
      }
      // Spoon stays wholly within the original non-solid tray's footprint.
      m.blob(.20,.29,-.18,.11,.045,.15,edge,10,4);m.box(.08,.34,.12,.025,.025,.25,edge,.39);
      return m;
    }
    R.meshFromBuilder('prisonRationFull',create(true));R.meshFromBuilder('prisonRationEmpty',create(false));meshOwners.add(R);
  }
  function prepare(game){
    active(game);if(!valid(game))return false;mesh(game);
    for(const obj of game.pow.objects||[]){
      if(!['cell-tray','regular-meal'].includes(obj.id)||typeof obj.action!=='function'||wrapped.has(obj))continue;
      const action=obj.action;wrapped.set(obj,action);obj.name='Inspect the daily ration';obj.action=function(g){return open(g,obj,action);};
    }
    if(active(game))refresh();return true;
  }
  function decorate(game,item){
    if(!valid(game)||!item||!['tray','regular:tray'].includes(item.id))return item;
    mesh(game);if(!meshOwners.has(game.rend))return item;
    const empty=eaten(game),fallback={...item,m:empty?'prisonRationEmpty':'prisonRationFull'};
    return root.RationPhoto?root.RationPhoto.decorate(game,fallback,empty):fallback;
  }
  function install(c){
    if(context||!c||!c.Game)return false;context=c;
    const p=c.Game.prototype,update=p.update,render=p.render;
    p.update=function(dt){prepare(this);if(active(this)){clearInput(this);return;}return update.call(this,dt);};
    p.render=function(dt){prepare(this);return render.call(this,dt);};
    const app=c.App;
    if(app){
      const show=app.show;if(typeof show==='function')app.show=function(screen){if(screen!=='game')close();return show.apply(this,arguments);};
      const start=app.start;if(typeof start==='function')app.start=function(){close();return start.apply(this,arguments);};
    }
    return true;
  }
  function inspect(game){return {supported:valid(game),open:active(game),empty:eaten(game),mealObject:(game&&game.pow&&game.pow.objects||[]).find(o=>wrapped.has(o))?.id||null};}
  root.PrisonFood=Object.freeze({install,prepare,decorate,open,consume,close,active,eaten,inspect});
})(typeof window!=='undefined'?window:globalThis);
