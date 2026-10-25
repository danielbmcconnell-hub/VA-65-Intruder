/* Complete photographed supplies. Each measured source rectangle is isolated
 * before mip generation: neighbouring weapons never bleed into another item.
 * The domain owns placement, reach, inventory and finite ammunition. */
(function(root){
 'use strict';
 const KINDS=Object.freeze(['food','foliage','hat','stick','rifle','pistol','radio','flare','knife']);
 const LIMITS=Object.freeze({items:32,range:40,desktopGPU:10*1024*1024,touchGPU:3*1024*1024,touchEdge:256,desktopEdge:512,failures:12});
 const renderers=new WeakMap(),games=new WeakMap();let context=null,ui=null;
 const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
 const finite=(v,d=0)=>Number.isFinite(v)?v:d;
 const restricted=g=>!!(g?.pow&&['cell','compound','solitary','regular'].includes(g.pow.stage)||g?.evade?.camp&&!g.pow);
 const appFor=g=>g?.app||context?.App;
 function eligible(g){const a=appFor(g);return !!(g?.evade&&point(g.evade.p)&&(!g.phase||g.phase==='evade')&&!g.result&&!restricted(g)&&(!a||(a.game===undefined||a.game===g)&&(a.screen===undefined||a.screen==='game')));}
 function state(r){let s=renderers.get(r);if(!s){s={alive:true,status:'idle',promise:null,records:new Map(),bytes:0,touch:false,failures:[],drawn:0,lastItems:[],current:null};renderers.set(r,s);}return s;}
 function current(r,s){return s.alive&&renderers.get(r)===s&&(!s.current||s.current())&&!(r.gl&&r.gl.isContextLost());}
 function mipBytes(w,h){let n=0;for(;;){n+=w*h*4;if(w===1&&h===1)return n;w=Math.max(1,Math.floor(w/2));h=Math.max(1,Math.floor(h/2));}}
 function validateManifest(m){
  if(!m||m.version!==1||m.file!=='pickups.webp'||m.width!==1254||m.height!==1254||!m.items)throw Error('Invalid complete pickup photograph manifest');
  for(const kind of KINDS){const q=m.items[kind],s=q?.source,b=q?.bounds;if(!Array.isArray(s)||s.length!==4||!s.every(Number.isInteger)||s[0]<0||s[1]<0||s[2]<32||s[3]<32||s[0]+s[2]>m.width||s[1]+s[3]>m.height||!Array.isArray(b)||b.length!==4||!b.every(Number.isInteger)||b[0]<0||b[1]<0||b[2]>s[2]||b[3]>s[3]||b[2]<=b[0]||b[3]<=b[1]||!Number.isFinite(q.length)||q.length<=0||q.length>2)throw Error('Incomplete pickup source region: '+kind);}
  return m;
 }
 function fail(s,kind,error){if(s.failures.length<LIMITS.failures)s.failures.push({kind,message:String(error?.message||error)});}
 async function load(r,options={}){
  if(!r||typeof r.texFromCanvas!=='function')return null;const s=state(r);if(s.promise)return s.promise;s.status='loading';s.touch=!!options.touch;s.current=typeof options.current==='function'?options.current:null;
  s.promise=(async()=>{try{
   const response=await root.fetch(options.manifest||'assets/items/manifest.json');if(!response.ok)throw Error('Pickup manifest HTTP '+response.status);const m=validateManifest(await response.json());
   const image=await new Promise((resolve,reject)=>{const im=new root.Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Pickup photograph unavailable'));im.src='assets/items/'+m.file;});
   if(!current(r,s))return inspect(r);if(image.naturalWidth!==m.width||image.naturalHeight!==m.height)throw Error('Pickup photograph dimensions differ from complete-source manifest');
   for(const kind of KINDS){if(!current(r,s))return inspect(r);let cv,uploaded=false;const name='ground_item_'+kind;try{
    const q=m.items[kind],src=q.source,scale=Math.min(1,(s.touch?LIMITS.touchEdge:LIMITS.desktopEdge)/Math.max(src[2],src[3])),w=Math.max(1,Math.round(src[2]*scale)),h=Math.max(1,Math.round(src[3]*scale)),bytes=mipBytes(w,h),budget=s.touch?LIMITS.touchGPU:LIMITS.desktopGPU;
    if(s.bytes+bytes>budget)throw Error('Pickup texture budget exceeded');cv=root.document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d',{willReadFrequently:true});if(!c)throw Error('Pickup decode canvas unavailable');c.imageSmoothingQuality='high';c.drawImage(image,...src,0,0,w,h);
    const pixels=c.getImageData(0,0,w,h).data;let visible=0,clear=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]>16)visible++;if(pixels[i]===0)clear++;}if(visible<40||clear<40)throw Error('Pickup source must retain its photographed subject and transparent surround');
    const gl=r.gl,before=gl&&typeof gl.getParameter==='function'?{active:gl.getParameter(gl.ACTIVE_TEXTURE),texture:gl.getParameter(gl.TEXTURE_BINDING_2D),flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiplied:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)}:null;let T;
    try{T=r.texFromCanvas(name,cv);if(!T?.tex)throw Error('Pickup texture upload failed');if(gl){gl.bindTexture(gl.TEXTURE_2D,T.tex);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);if(typeof gl.getError==='function'&&gl.getError()!==(gl.NO_ERROR||0))throw Error('Pickup GPU upload reported an error');}}
    finally{if(before){gl.activeTexture(before.active);gl.bindTexture(gl.TEXTURE_2D,before.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,before.flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,before.premultiplied);}}
    s.records.set(kind,{kind,textureName:name,width:src[2],height:src[3],gpuWidth:w,gpuHeight:h,source:src.slice(),bounds:q.bounds.slice(),referenceWidth:(q.bounds[2]-q.bounds[0])/src[2],bodyHeight:(q.bounds[3]-q.bounds[1])/src[3],length:q.length,bytes});s.bytes+=bytes;uploaded=true;
   }catch(error){if(!uploaded){const T=r.textures?.[name];if(T?.tex&&r.gl&&!r.gl.isContextLost())r.gl.deleteTexture(T.tex);if(r.textures)delete r.textures[name];}fail(s,kind,error);}finally{if(cv)cv.width=cv.height=1;}}
   s.status=s.records.size===KINDS.length?'ready':'error';
  }catch(error){if(current(r,s)){s.status='error';fail(s,'manifest',error);}}return inspect(r);})();return s.promise;
 }
 function queue(g,r,sprites){
  const previous=r&&renderers.get(r);if(previous){previous.drawn=0;previous.lastItems=[];}
  if(!eligible(g)||!r||!point(r.eye)||!root.GroundItems?.items)return 0;const s=state(r);
  if(s.status==='idle'){const a=appFor(g);load(r,{touch:!!(a?.isTouch||root.matchMedia?.('(pointer: coarse)').matches),current:()=>!a||!a.rend||a.rend===r});return 0;}
  if(!current(r,s)||!s.records.size)return 0;
  const rows=root.GroundItems.items(g).filter(q=>q&&point(q.p)&&s.records.has(q.kind)&&Math.hypot(q.p[0]-r.eye[0],q.p[2]-r.eye[2])<=LIMITS.range).sort((a,b)=>Math.hypot(a.p[0]-r.eye[0],a.p[2]-r.eye[2])-Math.hypot(b.p[0]-r.eye[0],b.p[2]-r.eye[2])||String(a.id).localeCompare(String(b.id))).slice(0,LIMITS.items);
  const near=root.NearGround?.inspect?.(r),floorKey=g.pow?'pickup:'+g.pow.stage+':'+String(g.pow.base?.[1]):'pickup:country:'+String(near?.complete)+':'+String(near?.origin),floorAt=(x,z)=>{
   if(g.pow&&typeof root.POW?.floorY==='function')return root.POW.floorY(g,x,z,g.evade.p[1]);
   const corrected=root.NearGround?.heightAt?.(r,x,z);if(Number.isFinite(corrected))return corrected;
   return typeof context?.terrainH==='function'?context.terrainH(x,z):undefined;
  };
  const hasFloor=!!g.pow&&typeof root.POW?.floorY==='function'||typeof root.NearGround?.heightAt==='function'||typeof context?.terrainH==='function';
  const surfaces=rows.map(q=>{const record=s.records.get(q.kind),width=record.length*(record.bounds[3]-record.bounds[1])/(record.bounds[2]-record.bounds[0]);return {id:'pickup:'+q.id,p:q.p.slice(),yaw:finite(q.yaw),record,length:record.length,width,groundLift:.028,...(hasFloor?{floorAt,floorKey}:{})};});
  // Reuse the production terrain-conforming photographic pass. This samples
  // actual ground; it does not replace collision heights with a flat quad.
  if(surfaces.length&&typeof root.WildlifeRender?.drawSurfaces==='function'){s.drawn=root.WildlifeRender.drawSurfaces(g,r,surfaces);s.lastItems=surfaces.map(q=>({id:q.id,p:q.p.slice(),length:q.length,width:q.width,textureName:q.record.textureName}));}
  return s.drawn;
 }
 function configure(c){if(!c||!c.App)return false;context=c;return true;}
 function element(tag,id,parent,text){const e=root.document.createElement(tag);if(id)e.id=id;if(text)e.textContent=text;if(parent)parent.appendChild(e);return e;}
 function stop(event){if(event.stopPropagation)event.stopPropagation();}
 function action(event,fn){if(event.preventDefault)event.preventDefault();stop(event);fn();}
 function punchAllowed(g){
  if(!eligible(g)||!root.GroundCombat?.hands)return false;const e=g.evade,a=appFor(g),river=g.pow?.river;
  if(g.paused||e.frozen||e.held||e.handsUp||g._capturePending||g._solitaryActive||e.busy||e.swimming||e.weaponMode==='rifle'||root.document?.hidden||a?.graphicsContextLost||root.LandingWater?.swimming?.(g)||river&&!['bank','hidden'].includes(river.mode))return false;
  const focus=root.document?.activeElement;if(focus?.closest?.('input,textarea,select,[contenteditable=true],[role=dialog][aria-modal=true]'))return false;
  const slots=root.GroundCombat.hands(g);return !!slots&&!(slots.left&&slots.right);
 }
 function gameState(g){let s=games.get(g);if(!s||s.actor!==g.evade){s={actor:g.evade,open:false};games.set(g,s);}return s;}
 function ensureUI(){
  if(ui||!root.document?.createElement||!root.document.body)return ui;
  const host=element('div','groundItemsUI',root.document.getElementById('stack')||root.document.body);host.className='ground-items-ui';host.hidden=true;
  const pickup=element('button','groundItemPickup',host);pickup.type='button';pickup.hidden=true;
  const toggle=element('button','groundItemsToggle',host,'Supplies');toggle.type='button';toggle.setAttribute('aria-controls','groundItemsPanel');toggle.setAttribute('aria-expanded','false');
  const punch=element('button','groundItemsPunch',host,'Punch free hand');punch.type='button';punch.setAttribute('aria-label','Punch with a free hand without changing equipment');
  const panel=element('section','groundItemsPanel',host);panel.hidden=true;panel.setAttribute('aria-label','Carried supplies');
  const heading=element('div',null,panel);heading.className='ground-items-heading';element('strong',null,heading,'Carried supplies');
  const close=element('button','groundItemsClose',heading,'Close ×');close.type='button';close.setAttribute('aria-label','Close carried supplies');
  const summary=element('p','groundItemsSummary',panel),buttons=element('div',null,panel);buttons.className='ground-items-actions';const controls={};
  for(const [mode,label]of [['fists','Empty hands'],['stick','Equip branch'],['rifle','Equip rifle'],['foliage','Remove leafy cover'],['hat','Remove conical hat']]){const b=element('button',null,buttons,label);b.type='button';b.dataset.groundEquip=mode;controls[mode]=b;b.addEventListener('click',event=>action(event,()=>{const g=ui?.game;if(g&&eligible(g)){root.GroundItems?.equip?.(g,mode);renderUI(g);}}));}
  const hint=element('p',null,panel,'Fruit is eaten when collected. Leafy cover and hats are worn when collected.');hint.className='ground-items-hint';
  for(const name of ['pointerdown','pointerup','pointermove','mousedown','mouseup','touchstart','touchend','wheel'])host.addEventListener(name,stop,{passive:name.startsWith('touch')||name==='wheel'});
  host.addEventListener('click',stop);host.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&ui?.game&&gameState(ui.game).open){action(event,()=>{gameState(ui.game).open=false;renderUI(ui.game);toggle.focus?.();});return;}
   // Closing leaves focus on the toggle. Space remains the game's free-hand
   // punch; prevent its native button click without stopping the game input.
   if(event.key===' '||event.code==='Space'){
    if(ui?.game&&!gameState(ui.game).open){if(event.preventDefault)event.preventDefault();return;}
    stop(event);return;
   }
   if(event.key==='Enter')stop(event);
  });
  pickup.addEventListener('click',event=>action(event,()=>{const g=ui?.game;if(g&&eligible(g)){root.GroundItems?.interact?.(g);renderUI(g);}}));
  punch.addEventListener('click',event=>action(event,()=>{const g=ui?.game;if(punchAllowed(g))g.evade.punchWant=1;}));
  toggle.addEventListener('click',event=>action(event,()=>{const g=ui?.game;if(g){const s=gameState(g);s.open=!s.open;renderUI(g);}}));
  close.addEventListener('click',event=>action(event,()=>{if(ui?.game){gameState(ui.game).open=false;renderUI(ui.game);toggle.focus?.();}}));
  ui={host,pickup,toggle,punch,panel,close,summary,controls,game:null};return ui;
 }
 function renderUI(g){
  if(!eligible(g)){if(ui){ui.host.hidden=true;ui.panel.hidden=true;ui.game=null;}return false;}
  const u=ensureUI();if(!u)return false;const inv=root.GroundItems?.inventory?.(g);if(!inv){u.host.hidden=true;return false;}const s=gameState(g);u.game=g;u.host.hidden=false;
  const target=root.GroundItems?.target?.(g);u.pickup.hidden=!target;u.pickup.textContent=target?(target.kind==='food'?'Eat bananas':'Pick up '+({foliage:'leafy cover',hat:'conical hat',stick:'branch',rifle:'rifle · '+finite(target.ammo)+' rounds'}[target.kind]||target.kind))+' · F':'';
  u.pickup.dataset.itemId=target?String(target.id):'';u.panel.hidden=!s.open;u.toggle.setAttribute('aria-expanded',String(s.open));
  u.summary.textContent='Energy '+Math.round(Math.max(0,Math.min(1,finite(inv.energy)))*100)+'% · Rifle '+finite(inv.rifleAmmo)+' rounds'+(inv.foliage?' · Leafy cover worn':'')+(inv.hat?' · Conical hat worn':'');
  const river=g.pow?.river,locked=!!(g.paused||g.evade.frozen||g.evade.held||g.evade.handsUp||g._capturePending||g.evade.swimming||root.LandingWater?.swimming?.(g)||river&&!['bank','hidden'].includes(river.mode)||root.document.hidden||appFor(g)?.graphicsContextLost);
  u.punch.disabled=!punchAllowed(g);
  for(const [mode,b]of Object.entries(u.controls)){b.hidden=mode!=='fists'&&!inv[mode];b.disabled=locked;b.setAttribute('aria-pressed',String(g.evade.weaponMode===mode));}
  return true;
 }
 function inspect(r){const s=r&&renderers.get(r);return s?{status:s.status,ready:s.status==='ready',bytes:s.bytes,budget:s.touch?LIMITS.touchGPU:LIMITS.desktopGPU,records:[...s.records.values()].map(q=>({...q,source:q.source.slice(),bounds:q.bounds.slice()})),failures:s.failures.map(q=>({...q})),drawn:s.drawn,lastItems:s.lastItems.map(q=>({...q,p:q.p.slice()}))}:{status:'idle',ready:false,bytes:0,records:[],failures:[],drawn:0,lastItems:[]};}
 function dispose(r){const s=r&&renderers.get(r);if(!s)return false;s.alive=false;for(const q of s.records.values()){const T=r.textures?.[q.textureName];if(T?.tex&&r.gl&&!r.gl.isContextLost())r.gl.deleteTexture(T.tex);if(r.textures)delete r.textures[q.textureName];}s.records.clear();renderers.delete(r);return true;}
 root.GroundItemsRender=Object.freeze({configure,load,queue,renderUI,inspect,dispose,validateManifest,mipBytes,limits:LIMITS,kinds:KINDS});
})(typeof window!=='undefined'?window:globalThis);
