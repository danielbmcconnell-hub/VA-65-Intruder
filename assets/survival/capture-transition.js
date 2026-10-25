/* Capture presentation on the existing ground camera. Simulation time owns
 * the fade and transfer: no wall-clock callback can move a paused or replaced
 * game into prison. Prison state/counters remain owned by the existing POW code. */
(function(root){
  'use strict';
  const states=new WeakMap();
  let context=null;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function state(game){
    const s=game&&states.get(game);
    // Starting a new ground actor/chapter explicitly abandons a pending
    // transfer, just as replacing the whole Game does.
    if(s&&!s.arriving&&(s.actor!==game.evade||game.phase!=='evade'||game.result)){remove(game);game._capturePending=false;return null;}
    return s;
  }
  function active(game){return !!state(game);}
  function inspect(game){const s=state(game);return s?{age:s.age,stage:stageAt(s),arriving:s.arriving,recapture:s.recapture,fieldHolding:s.fieldHolding,groundRetained:!!game.evade,finished:s.finished}:null;}
  function owned(game){return !!game&&(!game.app||!game.app.game||game.app.game===game);}
  function clearInput(game){
    const a=game.app;if(!a)return;
    if(a.keys)for(const key of Object.keys(a.keys))a.keys[key]=false;
    if(a.gctl)for(const key of ['pitch','roll','mx','my','run','fire','interact','climb'])a.gctl[key]=0;
    if(game.pow){game.pow.input={};game.pow.holding=null;game.pow.interactLatched=false;}
  }
  function remove(game){
    const s=states.get(game);if(!s)return;
    root.PrisonDetail?.endHolding(game);
    if(s.node)s.node.remove();states.delete(game);
    if(root.document&&!root.document.getElementById('captureTransition'))root.document.body.classList.remove('capture-active');
  }
  function stageAt(s){return s.arriving?'arrival':s.age<1.25?'taken':s.fieldHolding?(s.age<2?'transfer':s.age<9.5?'holding':'later'):(s.age<3.15?'transfer':'later');}
  function advance(game){
    const s=state(game);if(!s||s.arriving||game.paused||!owned(game)||s.age<1.25)return false;
    if(s.fieldHolding){if(s.age<2)s.age=2;else if(s.age>=3.2&&s.age<9.5)s.age=9.5;else return false;}
    else s.age=4.8;
    paint(game,s);return true;
  }
  function paint(game,s){
    // Keep the holding shot through its fade to black. Removing it when the
    // transfer caption starts would expose the original landing camera.
    const stage=stageAt(s);root.PrisonDetail?.holding(game,s.fieldHolding&&!s.arriving&&s.age>=2);
    if(!s.node)return;
    const text=stage==='taken'?[s.recapture?'Recaptured':'Captured','The guards take you into custody.']:
      stage==='transfer'?['Under guard',s.recapture?'You are escorted back into confinement.':'You are taken away from the landing site.']:
      stage==='holding'?['Temporary holding','A reconstructed field holding cage. You remain under guard before transfer to prison.']:
      stage==='later'?['Later · Confinement','The journey ends at a prison cell.']:['Confinement','You are still alive. Take a moment to find your bearings.'];
    if(s.stage!==stage){s.stage=stage;s.title.textContent=text[0];s.detail.textContent=text[1];s.node.dataset.stage=stage;}
    const shade=s.arriving?1-clamp(s.arrivalAge/.9,0,1):stage==='holding'?1-clamp((s.age-2)/.7,0,1):s.fieldHolding&&s.age>=9.5?clamp((s.age-9.5)/.6,0,1):clamp(s.age/1.6,0,1);
    // During the first second the original ground view stays visible. The
    // actual camera changes to the prison only beneath a fully opaque fade.
    s.node.style.backgroundColor='rgba(2,5,7,'+(.10+shade*.90).toFixed(3)+')';
    s.card.style.opacity=s.arriving?String(1-clamp(s.arrivalAge/.7,0,1)):'1';
    s.button.textContent=s.fieldHolding&&s.age<2?'Continue to temporary holding':stage==='holding'?'Continue to prison transfer':'Continue to captivity';
    s.button.hidden=s.arriving||s.age<1.25||s.fieldHolding&&(stage==='holding'&&s.age<3.2||stage==='later');s.button.disabled=!!game.paused;
    s.card.hidden=!!s.captionHidden;s.peek.textContent=s.captionHidden?'Show explanation':'Hide explanation';s.peek.hidden=s.arriving||s.age<1.25;
    s.node.setAttribute('aria-busy',s.arriving?'false':'true');
  }
  function mount(game,s){
    if(!root.document)return;
    const parent=root.document.getElementById('game');if(!parent)return;
    root.document.getElementById('captureTransition')?.remove();
    const node=root.document.createElement('div');node.id='captureTransition';node._captureGame=game;node.setAttribute('role','status');node.setAttribute('aria-live','polite');
    const card=root.document.createElement('div');card.className='capture-card';
    const label=root.document.createElement('p');label.className='capture-label';label.textContent='Survival · Captivity';
    const title=root.document.createElement('h2'),detail=root.document.createElement('p'),button=root.document.createElement('button');
    button.type='button';button.className='btn gho';button.textContent='Continue to captivity';button.hidden=true;
    button.addEventListener('click',()=>advance(game));
    const peek=root.document.createElement('button');peek.type='button';peek.className='btn gho capture-peek';peek.addEventListener('click',()=>{s.captionHidden=!s.captionHidden;paint(game,s);});
    card.append(label,title,detail,button);node.append(card,peek);parent.append(node);
    Object.assign(s,{node,card,title,detail,button,peek});root.document.body.classList.add('capture-active');paint(game,s);
  }
  function begin(game,finish,recapture){
    if(!owned(game)||!game.evade||active(game)||typeof finish!=='function')return false;
    const e=game.evade,s={age:0,stage:'',arriving:false,arrivalAge:0,finished:false,finish,recapture:!!recapture,actor:e};
    states.set(game,s);game._capturePending=true;game._capt=1;game.phase='evade';game.chute=null;game.extView=false;
    s.fieldHolding=!s.recapture&&!!root.PrisonDetail?.beginHolding(game);
    game._blood=e.blood||null;game._hurt=!!e.hurt;
    e.frozen=1;e.held=0;e.moving=false;e.running=false;e.handsUp=true;e.drawn=0;e.weaponMode='fists';
    game.shake=0;clearInput(game);
    for(const id of ['captVeil','teachVeil','teach','teachPeek','legend'])root.document?.getElementById(id)?.classList.remove('on');
    const audio=game.app&&game.app.audio;
    if(audio){audio.groundMode=true;if(audio.setEngine)audio.setEngine(0,0,false);if(audio.setTone)audio.setTone(0);if(audio.burst)audio.burst('thunk',.35);}
    mount(game,s);return true;
  }
  function recaptured(game){return begin(game,()=>root.POW.begin(game,'solitary'),true);}
  function step(game,dt){
    const s=state(game);if(!s)return false;
    if(!owned(game)){remove(game);return true;}
    if(game.paused||!Number.isFinite(dt)||dt<=0)return true;
    const elapsed=Math.min(dt,.1);clearInput(game);
    if(s.arriving){s.arrivalAge+=elapsed;paint(game,s);if(s.arrivalAge>=.9){game._capturePending=false;remove(game);}return true;}
    s.age+=elapsed;paint(game,s);
    if(s.age>=(s.fieldHolding?11.5:4.8)&&!s.finished){
      s.finished=true;s.arriving=true;s.arrivalAge=0;
      root.PrisonDetail?.endHolding(game);
      // Paint black before the scene handoff. Retaining the first-person
      // actor until this call prevents any intervening cockpit render.
      if(s.node)s.node.style.backgroundColor='rgb(2,5,7)';
      s.finish();game._capturePending=false;clearInput(game);paint(game,s);
    }
    return true;
  }
  function install(c){
    if(context||!c||!c.Game)return false;context=c;
    const proto=c.Game.prototype,update=proto.update,render=proto.render,captured=proto.captured,legacyRecaptured=proto.recapturedInCamp;
    proto.update=function(dt){if(step(this,dt))return;return update.call(this,dt);};
    proto.render=function(dt){
      const result=render.call(this,dt),s=state(this);if(s)paint(this,s);
      else {const node=root.document?.getElementById('captureTransition');if(node&&node._captureGame!==this)remove(node._captureGame);}
      return result;
    };
    proto.captured=function(){
      if(active(this)||this._capturePending||this.phase==='done')return;
      if(!this.evade)return captured.apply(this,arguments);
      if(this.pow){
        if(this.pow.stage==='solitary'||this.pow.complete)return;
        this.pow.flags.recaptures=(this.pow.flags.recaptures||0)+1;this.pow.stats.recaptures=(this.pow.stats.recaptures||0)+1;
        return recaptured(this);
      }
      if(this.evade.camp&&this._escStage==='yard'&&typeof legacyRecaptured==='function')return begin(this,()=>legacyRecaptured.call(this),true);
      const esc=this.mis.escape,stage=this._escStage;
      return begin(this,()=>{
        if(esc&&stage==='landing')this.app.cokerCamp(this);
        else if(esc)this.app.cokerEnd(this,'back');
        else this.app.captivity(this);
      },false);
    };
    if(typeof legacyRecaptured==='function')proto.recapturedInCamp=function(){
      if(active(this)||this._solitaryActive||!this.evade)return;
      return begin(this,()=>legacyRecaptured.call(this),true);
    };
    return true;
  }
  root.CaptureTransition=Object.freeze({install,begin,recaptured,step,active,inspect,advance});
})(typeof window!=='undefined'?window:globalThis);
