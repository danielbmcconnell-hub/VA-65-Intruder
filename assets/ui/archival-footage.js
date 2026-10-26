/* User-supplied carrier footage belongs to the Ready Room, never the flight
 * simulation. Silent derivatives retain their source image and creator marks. */
(function (root) {
  'use strict';
  const KEY = 'a6_archival_intro_seen';
  const CLIPS = Object.freeze([
    Object.freeze({id:'launch', file:'assets/video/carrier-launch.mp4', title:'Catapult departure', duration:5}),
    Object.freeze({id:'approach', file:'assets/video/carrier-approach.mp4', title:'Carrier approach', duration:5}),
    Object.freeze({id:'night', file:'assets/video/carrier-night.mp4', title:'Night recovery', duration:2.2})
  ]);
  const LIMITS = Object.freeze({clips:3, montageSeconds:12.2, watchdogMs:26000, minimumTouchPixels:44});
  let ctx=null, ui=null, seenInMemory=false, active=false, mode='intro', index=0;
  let timer=null, token=0, oldFocus=null, readyInert=null, opens=0, lastClose=null, playing=false;
  const wrappedBoots=new WeakSet();

  function reduced() {
    try { return !!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
    catch (_) { return false; }
  }
  function seen() {
    try { return seenInMemory || root.sessionStorage?.getItem(KEY)==='1'; }
    catch (_) { return seenInMemory; }
  }
  function remember() {
    seenInMemory=true;
    try { root.sessionStorage?.setItem(KEY,'1'); } catch (_) {}
  }
  function allowed(options) {
    return !!options && options.screen==='ready' && !options.hasGame && !options.hidden;
  }
  function shouldAutoOpen(options) {
    return allowed(options) && !options.seen && !options.reduced;
  }
  function nextIndex(current) {
    return Number.isInteger(current) && current>=0 && current<CLIPS.length-1 ? current+1 : -1;
  }
  function options() {
    return {screen:ctx?.App.screen, hasGame:!!ctx?.App.game, hidden:!!root.document?.hidden, seen:seen(), reduced:reduced()};
  }
  function node(tag, id, parent, text) {
    const n=root.document.createElement(tag); if(id)n.id=id;
    if(text!==undefined)n.textContent=text; if(parent)parent.appendChild(n); return n;
  }
  function silence(video) {
    video.muted=true; video.defaultMuted=true; video.volume=0;
    video.setAttribute('muted',''); video.setAttribute('playsinline','');
  }
  function setPlaying(on) {
    playing=!!on;
    if(ui){ui.play.textContent=playing?'Pause footage':'Play footage';ui.play.setAttribute('aria-pressed',String(playing));}
  }
  function requestPlay() {
    if(!active || !ui)return false;
    const own=token; silence(ui.video);
    try {
      const p=ui.video.play();
      if(p?.then)p.then(()=>{if(active&&own===token)setPlaying(true);},()=>{if(active&&own===token)setPlaying(false);});
      else setPlaying(true);
    } catch (_) {setPlaying(false);}
    return true;
  }
  function stopVideo() {
    if(!ui)return;
    try {ui.video.pause();}catch(_){}
    setPlaying(false);
  }
  function close(reason='skip', restore=true) {
    if(!active)return false;
    active=false;token++;lastClose=reason;
    if(timer!==null){root.clearTimeout?.(timer);timer=null;}
    stopVideo();
    if(ui){ui.box.hidden=true;ui.video.removeAttribute('src');try{ui.video.load();}catch(_){} }
    const ready=root.document?.getElementById('ready');
    if(ready&&readyInert!==null)ready.inert=readyInert;
    readyInert=null;
    if(restore && ctx?.App.screen==='ready' && oldFocus?.isConnected!==false)oldFocus?.focus?.({preventScroll:true});
    oldFocus=null;
    return true;
  }
  function selectClip(value) {
    if(!active||!ui||!Number.isInteger(value)||!CLIPS[value])return false;
    token++;index=value;const clip=CLIPS[index];
    stopVideo();silence(ui.video);ui.video.src=clip.file;
    ui.box.dataset.clip=clip.id;
    ui.caption.textContent=clip.title+' · '+(index+1)+' / '+CLIPS.length;
    ui.next.hidden=mode==='intro';ui.next.textContent=index===CLIPS.length-1?'Replay montage':'Next clip';
    try{ui.video.load();}catch(_){}
    requestPlay();return true;
  }
  function next() {
    if(!active)return false;
    const value=nextIndex(index);
    if(value<0){if(mode==='viewer')return selectClip(0);return close('complete');}
    return selectClip(value);
  }
  function mount() {
    const d=root.document;if(ui||!d?.body||!d.createElement)return ui;
    const box=node('section','archivalFootage',d.body);box.hidden=true;
    box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','archivalFootageTitle');
    const header=node('header','',box);
    node('h2','archivalFootageTitle',header,'A-6 carrier operations · reference footage');
    node('p','',header,'Footage supplied for the game. Your mission uses the live flight simulation.');
    const video=node('video','archivalFootageVideo',box);
    silence(video);video.controls=false;video.playsInline=true;video.preload='metadata';
    video.disablePictureInPicture=true;video.disableRemotePlayback=true;
    const footer=node('footer','',box),caption=node('p','archivalFootageCaption',footer);
    caption.setAttribute('aria-live','polite');
    const controls=node('div','',footer);controls.className='archival-footage-controls';
    const play=node('button','archivalFootagePlay',controls,'Pause footage');play.type='button';
    play.onclick=()=>{if(playing)stopVideo();else requestPlay();};
    const nextButton=node('button','archivalFootageNext',controls,'Next clip');nextButton.type='button';nextButton.onclick=()=>next();
    const skip=node('button','archivalFootageSkip',controls,'Skip to Ready Room');skip.type='button';skip.onclick=()=>close('skip');
    video.addEventListener('ended',()=>{if(active){if(mode==='viewer'&&nextIndex(index)<0)setPlaying(false);else next();}});
    video.addEventListener('error',()=>{if(active)nextIndex(index)<0?close('unavailable'):selectClip(index+1);});
    video.addEventListener('pause',()=>{if(active)setPlaying(false);});
    video.addEventListener('playing',()=>{if(active)setPlaying(true);});
    // No underlying menu or flight handler receives gestures from the dialog.
    for(const type of ['pointerdown','pointerup','click','wheel'])box.addEventListener(type,e=>e.stopPropagation());
    ui={box,video,caption,play,next:nextButton,skip};return ui;
  }
  function open(kind='viewer') {
    if(!ctx || !allowed(options()))return false;
    if(kind==='intro'&&!shouldAutoOpen(options()))return false;
    if(active)return true;
    const u=mount();if(!u)return false;
    remember();mode=kind==='intro'?'intro':'viewer';active=true;opens++;lastClose=null;
    oldFocus=root.document.activeElement;
    const ready=root.document.getElementById('ready');
    if(ready){readyInert=!!ready.inert;ready.inert=true;}
    u.box.hidden=false;u.box.dataset.mode=mode;
    u.skip.textContent=mode==='intro'?'Skip to Ready Room':'Close footage';
    selectClip(0);u.skip.focus?.({preventScroll:true});
    // A missing/blocked media decoder must never strand the Ready Room.
    if(mode==='intro')timer=root.setTimeout?.(()=>{if(active)close('timeout');},LIMITS.watchdogMs)??null;
    return true;
  }
  function onBoot() {
    if(shouldAutoOpen(options()))open('intro');
    else if(reduced())remember();
  }
  function bindBoot() {
    const b=root.document?.getElementById('bootGo');
    if(!b||wrappedBoots.has(b)||typeof b.onclick!=='function')return;
    const old=b.onclick;b.onclick=function(){const result=old.apply(this,arguments);onBoot();return result;};wrappedBoots.add(b);
  }
  function readyCard() {
    const d=root.document,host=d?.getElementById('readyBody');
    if(!host||ctx?.App.tab!=='ops'||d.getElementById('archivalFootageCard'))return;
    const card=node('div','archivalFootageCard',host);card.className='card archival-footage-card';
    const body=node('div','',card);body.className='body';
    node('h2','',body,'Carrier footage');node('p','',body,'Watch the short carrier-operations montage again.');
    const button=node('button','archivalFootageReplay',body,'Watch reference footage');button.type='button';button.className='btn';button.onclick=()=>open('viewer');
  }
  function inspect() {
    return {active,mode:active?mode:null,index:active?index:null,clip:active?CLIPS[index].id:null,seen:seen(),reduced:reduced(),
      playing,muted:!ui||ui.video.muted&&ui.video.defaultMuted&&ui.video.volume===0,opens,lastClose,source:active?CLIPS[index].file:null};
  }
  function install(c) {
    if(ctx)return ctx.App===c?.App;
    if(!c?.App||!root.document?.createElement)return false;
    ctx=c;const app=c.App,show=app.show,start=app.start,bind=app.bindUI,renderReady=app.renderReady;
    if(typeof bind==='function')app.bindUI=function(){const r=bind.apply(this,arguments);bindBoot();return r;};
    if(typeof show==='function')app.show=function(id){if(id!=='ready')close('screen-change',false);return show.apply(this,arguments);};
    if(typeof start==='function')app.start=function(){close('mission-start',false);return start.apply(this,arguments);};
    if(typeof renderReady==='function')app.renderReady=function(){const r=renderReady.apply(this,arguments);readyCard();return r;};
    root.addEventListener?.('keydown',e=>{
      if(!active)return;
      e.stopImmediatePropagation?.();
      if(e.code==='Escape'){e.preventDefault();close('escape');return;}
      if(e.code==='Tab'){
        const controls=[ui.play,ui.next,ui.skip].filter(n=>!n.hidden&&!n.disabled),at=controls.indexOf(root.document.activeElement),step=e.shiftKey?-1:1;
        e.preventDefault();controls[(at+step+controls.length)%controls.length]?.focus?.();
      }else if(e.code==='Space'&&root.document.activeElement?.tagName!=='BUTTON'){e.preventDefault();playing?stopVideo():requestPlay();}
    },true);
    root.addEventListener?.('keyup',e=>{if(active)e.stopImmediatePropagation?.();},true);
    root.document.addEventListener?.('visibilitychange',()=>{if(root.document.hidden)close('hidden',false);});
    bindBoot();readyCard();return true;
  }
  root.ArchivalFootage=Object.freeze({install,open,close,next,inspect,clips:CLIPS,limits:LIMITS,policy:Object.freeze({allowed,shouldAutoOpen,nextIndex})});
})(typeof window!=='undefined'?window:globalThis);
