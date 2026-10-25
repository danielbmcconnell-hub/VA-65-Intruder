/* Finite, physical countryside supplies. Existing terrain, solids and original
 * NPC incapacitation own placement and rifle drops; no timers or free rifles. */
(function(root){
 'use strict';
 const states=new WeakMap(),KINDS=new Set(['food','foliage','hat','stick','rifle']),PRISON=new Set(['cell','compound','solitary','regular']);
 const LIMITS=Object.freeze({items:64,cells:256,consumed:1024,cellSize:48,range:1.8,scanActors:96,spawnInterval:1,renderRange:85,rifleAmmo:30,dropAmmo:12});
 let context=null;
 const finite=(n,d=0)=>Number.isFinite(n)?n:d,clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite),clone=q=>JSON.parse(JSON.stringify(q));
 const mission=g=>String(g?.mis?.id||'ground');
 const restricted=g=>!!(g?.pow&&PRISON.has(g.pow.stage)||g?.evade?.camp&&!g.pow);
 const owned=g=>!g?.app||g.app.game===undefined||g.app.game===g;
 function allowed(g){return !!(g?.evade&&g.evade.alive!==false&&point(g.evade.p)&&(!g.phase||g.phase==='evade')&&!restricted(g)&&!g.result&&owned(g));}
 function swimming(g){const r=g?.pow?.river;return !!(g?.evade?.swimming||r&&!['bank','hidden'].includes(r.mode)||root.LandingWater?.swimming?.(g));}
 function active(g){return allowed(g)&&(!g.app?.screen||g.app.screen==='game')&&!g.paused&&!g.evade.frozen&&!g.evade.held&&!g.evade.handsUp&&!g._capturePending&&!swimming(g)&&!(root.document?.hidden||root.document?.visibilityState==='hidden'||g.app?.graphicsContextLost);}
 function initial(){return {version:1,stick:false,rifle:false,rifleAmmo:0,foliage:false,hat:false,energy:.75,foodEaten:0};}
 const cleanInventory=i=>Object.fromEntries(Object.keys(initial()).map(k=>[k,i[k]]));
 const cleanItem=q=>({id:q.id,kind:q.kind,p:q.p.slice(0,3),ammo:q.ammo,yaw:q.yaw,source:typeof q.source==='string'?q.source.slice(0,90):null});
 function inventoryValid(i){return !!(i&&i.version===1&&['stick','rifle','foliage','hat'].every(k=>typeof i[k]==='boolean')&&Number.isInteger(i.rifleAmmo)&&i.rifleAmmo>=0&&i.rifleAmmo<=LIMITS.rifleAmmo&&Number.isFinite(i.energy)&&i.energy>=0&&i.energy<=1&&Number.isInteger(i.foodEaten)&&i.foodEaten>=0);}
 function state(g){
  if(!g?.evade)return null;let s=states.get(g);
  if(!s||s.actor!==g.evade||s.mission!==mission(g)){
   const inv=inventoryValid(g.evade.groundItems)?g.evade.groundItems:initial();g.evade.groundItems=inv;
   s={actor:g.evade,mission:mission(g),inventory:inv,items:[],cells:new Set(),consumed:new Set(),observed:new WeakMap(),dropped:new WeakSet(),clock:0,spawnAge:LIMITS.spawnInterval,scanAt:0,nextDrop:0,keyDown:false,notice:'',epoch:g.pow?.stage||'field'};states.set(g,s);
  }
  const epoch=g.pow?.stage||'field';if(epoch!==s.epoch){s.items=[];s.cells.clear();s.epoch=epoch;s.spawnAge=LIMITS.spawnInterval;}
  return s;
 }
 function configure(c){if(!c||typeof c.terrainH!=='function')return false;context=c;return true;}
 function floor(g,x,z){
  if(typeof context?.floorAt==='function')return context.floorAt(g,x,z);
  if(g.pow?.river)return g.pow.river.waterY+.35;
  if(g.pow)return root.POW?.floorY?root.POW.floorY(g,x,z,g.evade.p[1]):g.pow.base[1];
  return context?.terrainH(x,z);
 }
 function dry(g,x,z){
  if(typeof context?.dryAt==='function')return !!context.dryAt(g,x,z);
  if(g.pow?.river){const r=g.pow.river,b=g.pow.base;return r.phase==='gulf'?z<=b[2]-61.4:Math.abs(x-b[0]-94)>finite(root.POW?.River?.constants?.channelHalfWidth,16)+.4;}
  return floor(g,x,z)>.8;
 }
 function solid(g,x,z,r){
  if(typeof context?.solidAt==='function')return !!context.solidAt(g,x,z,r);
  if(g.pow&&root.POW?.blocked)return root.POW.blocked(g,x,z,r,floor(g,x,z));
  return typeof g._localSolidAt==='function'?!!g._localSolidAt(x,z,r):false;
 }
 function ground(g,x,z){
  const y=floor(g,x,z);if(!Number.isFinite(y)||!dry(g,x,z)||solid(g,x,z,.18))return null;
  for(const [dx,dz]of [[.35,0],[-.35,0],[0,.35],[0,-.35]]){const h=floor(g,x+dx,z+dz);if(!Number.isFinite(h)||Math.abs(h-y)>.28||!dry(g,x+dx,z+dz))return null;}
  return [x,y+.018,z];
 }
 function sight(g,p){
  const e=g.evade,y=floor(g,e.p[0],e.p[2]);if(!Number.isFinite(y)||Math.abs(p[1]-y)>1.25)return false;
  const a=[e.p[0],y+.65,e.p[2]],b=[p[0],p[1]+.08,p[2]];
  if(typeof context?.lineOfSight==='function'&&!context.lineOfSight(g,a,b))return false;
  if(g.pow&&root.POW?.los&&!root.POW.los(g,a,b))return false;
  if(typeof g._groundLineOfSight==='function'&&!g._groundLineOfSight(a,b,e))return false;
  // Direct low reach also checks solid geometry; the inherited chest-height
  // visibility ray alone must not allow a pickup through a low wall.
  const n=Math.max(1,Math.ceil(Math.hypot(p[0]-a[0],p[2]-a[2])/.12));
  for(let i=1;i<n;i++){const t=i/n,x=a[0]+(p[0]-a[0])*t,z=a[2]+(p[2]-a[2])*t;if(solid(g,x,z,.035))return false;const h=floor(g,x,z);if(!Number.isFinite(h)||h>a[1]+(b[1]-a[1])*t+.05)return false;}
  return true;
 }
 function hash(x,z,n){let v=(Math.imul(x|0,73856093)^Math.imul(z|0,19349663)^Math.imul(n|0,83492791))>>>0;v^=v>>>13;return (Math.imul(v,1274126177)>>>0)/4294967296;}
 function village(g,x,z){
  if(typeof context?.villageAt==='function')return !!context.villageAt(g,x,z);
  return (g.evade.locals||[]).some(a=>a?.alive!==false&&['farmer','villager'].includes(a.kind)&&point(a.p)&&Math.hypot(a.p[0]-x,a.p[2]-z)<55)||(g.world?.scenery||[]).some(a=>['hut','bldg'].includes(a.m)&&point(a.p)&&Math.hypot(a.p[0]-x,a.p[2]-z)<55);
 }
 function add(g,s,id,kind,p,ammo=0,source=null){
  if(!KINDS.has(kind)||!point(p)||s.items.length>=LIMITS.items||s.consumed.has(id)||s.items.some(q=>q.id===id)||s.consumed.size>=LIMITS.consumed)return null;
  const q={id,kind,p:p.slice(),ammo:Math.floor(clamp(ammo,0,LIMITS.rifleAmmo)),yaw:hash(Math.round(p[0]),Math.round(p[2]),4)*Math.PI*2,source};s.items.push(q);return q;
 }
 function populate(g,s){
  if(!context||s.cells.size>=LIMITS.cells)return;
  const cx=Math.floor(g.evade.p[0]/LIMITS.cellSize),cz=Math.floor(g.evade.p[2]/LIMITS.cellSize);
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
   const x=cx+dx,z=cz+dz,key=x+':'+z;if(s.cells.has(key)||s.cells.size>=LIMITS.cells)continue;s.cells.add(key);
   for(const [n,kind]of ['stick','foliage','food','hat'].entries()){
    const px=(x+.12+hash(x,z,n*2)*.76)*LIMITS.cellSize,pz=(z+.12+hash(x,z,n*2+1)*.76)*LIMITS.cellSize;
    if(kind==='hat'&&!village(g,px,pz))continue;
    const p=ground(g,px,pz);if(p)add(g,s,'natural:'+key+':'+kind,kind,p);
   }
  }
 }
 function incapacitated(g,a){return a.alive===false||a.incapacitated===true||a.knockedOut===true||Number.isFinite(a.stunUntil)&&a.stunUntil>finite(g.t);}
 function observe(g,a){
  if(!active(g)||!a||a.kind!=='nva'||a.armed!==true||a.alive===false||incapacitated(g,a)||!point(a.p)||!((g.evade.searchers||[]).includes(a)||(g.evade.locals||[]).includes(a)))return false;
  state(g).observed.set(a,{armed:true,ammo:Math.floor(clamp(finite(a.rifleAmmo,finite(a.ammo,LIMITS.dropAmmo)),0,LIMITS.rifleAmmo))});return true;
 }
 function dropped(g,a){
  if(!allowed(g)||!context||!a||a.kind!=='nva'||!point(a.p))return false;const s=state(g),seen=s.observed.get(a);
  if(!seen||!seen.armed||s.dropped.has(a)||!incapacitated(g,a))return false;s.dropped.add(a);
  const p=ground(g,a.p[0],a.p[2]);if(!p)return false;
  const id='nva-drop:'+(typeof a.id==='string'?a.id.slice(0,90):++s.nextDrop),ammo=Math.floor(clamp(finite(a.rifleAmmo,finite(a.ammo,seen.ammo)),0,LIMITS.rifleAmmo));
  const q=add(g,s,id,'rifle',p,ammo,typeof a.id==='string'?a.id:null);if(!q)return false;a.armed=false;return true;
 }
 function scan(g,s){
  const all=(g.evade.searchers||[]).concat(g.evade.locals||[]),count=Math.min(all.length,LIMITS.scanActors);
  for(let j=0;j<count;j++){const a=all[(s.scanAt+j)%all.length];if(!a||a.kind!=='nva'||!point(a.p))continue;
   if(a.alive!==false&&!incapacitated(g,a)&&a.armed===true)observe(g,a);
   else dropped(g,a);
  }s.scanAt=all.length?(s.scanAt+count)%all.length:0;
 }
 function confiscate(g){const s=state(g);if(!s)return false;Object.assign(s.inventory,{stick:false,rifle:false,rifleAmmo:0,foliage:false,hat:false});s.items=[];if(['stick','rifle'].includes(g.evade.weaponMode)){g.evade.weaponMode='fists';g.evade.drawn=0;}return true;}
 function step(g,dt){
  if(!g?.evade||!owned(g))return false;if(restricted(g)){if(states.has(g)||g.evade.groundItems)confiscate(g);return false;}
  if(!active(g)||!Number.isFinite(dt)||dt<=0)return false;const s=state(g),elapsed=Math.min(dt,.25);s.clock+=elapsed;s.spawnAge+=elapsed;
  s.inventory.energy=Math.max(0,s.inventory.energy-elapsed*(g.evade.running?.0018:g.evade.moving?.0005:0));
  s.items=s.items.filter(q=>Math.hypot(q.p[0]-g.evade.p[0],q.p[2]-g.evade.p[2])<180);
  scan(g,s);if(s.spawnAge>=LIMITS.spawnInterval){s.spawnAge%=LIMITS.spawnInterval;populate(g,s);}return true;
 }
 function wanted(s,q){return q.kind==='food'?s.inventory.energy<.995:q.kind==='rifle'?!s.inventory.rifle||s.inventory.rifleAmmo<LIMITS.rifleAmmo:!s.inventory[q.kind];}
 function target(g){
  if(!active(g))return null;const s=state(g),e=g.evade,heading=finite(e.hdg);let best=null;
  for(const q of s.items){if(!wanted(s,q))continue;const dx=q.p[0]-e.p[0],dz=q.p[2]-e.p[2],distance=Math.hypot(dx,dz);if(distance>LIMITS.range)continue;
   if(distance>.25&&(dx*Math.sin(heading)-dz*Math.cos(heading))/distance<.25)continue;if(!sight(g,q.p))continue;if(!best||distance<best.distance)best={...clone(q),distance};
  }return best;
 }
 const label=q=>({food:'Eat fallen fruit',foliage:'Wear leafy camouflage · slower movement',hat:'Wear conical hat · no protection at close range',stick:'Take branch · blunt weapon',rifle:'Take dropped NVA rifle · '+q.ammo+' rounds'})[q.kind];
 function prompt(g){const q=target(g);return q?'F / Interact · '+label(q):'';}
 function notify(g,s,text){s.notice=text;if(typeof context?.notice==='function')context.notice(g,text);}
 function equip(g,mode){
  if(!active(g))return false;const s=state(g),i=s.inventory,e=g.evade;
  if(mode==='foliage'||mode==='hat'){if(!i[mode])return false;i[mode]=false;notify(g,s,mode==='foliage'?'Leafy camouflage removed.':'Conical hat removed.');return true;}
  if(mode==='stick'&&!i.stick||mode==='rifle'&&!i.rifle||!['stick','rifle','fists'].includes(mode))return false;
  e.weaponMode=mode;e.drawn=mode==='rifle'?1:0;return true;
 }
 function interact(g){
  const picked=target(g);if(!picked)return false;const s=state(g),q=s.items.find(x=>x.id===picked.id);if(!q||s.consumed.size>=LIMITS.consumed)return false;const i=s.inventory;
  if(q.kind==='food'){i.energy=clamp(i.energy+.25,0,1);i.foodEaten++;if(g.pow?.stats){g.pow.stats.fatigue=Math.max(0,finite(g.pow.stats.fatigue)-7);g.pow.stats.physical=Math.min(100,finite(g.pow.stats.physical,70)+2);}notify(g,s,'Fruit eaten. Energy restored; wounds still need care.');}
  else if(q.kind==='rifle'){i.rifle=true;i.rifleAmmo=Math.min(LIMITS.rifleAmmo,i.rifleAmmo+q.ammo);equip(g,'rifle');notify(g,s,'Rifle recovered · '+i.rifleAmmo+' rounds. Both hands occupied.');}
  else {i[q.kind]=true;if(q.kind==='stick')equip(g,'stick');notify(g,s,q.kind==='foliage'?'Leafy camouflage worn. Move slowly; close observers can still identify you.':q.kind==='hat'?'Conical hat worn. It reduces your outline at a distance; it is not a disguise at close range.':'Branch taken. A blunt weapon in your right hand.');}
  s.consumed.add(q.id);s.items=s.items.filter(x=>x!==q);return true;
 }
 function handle(g,down){if(!g?.evade)return false;const s=state(g),pressed=!!down&&!s.keyDown;s.keyDown=!!down;return pressed?interact(g):false;}
 function pickup(g,id){const q=target(g);return q&&(!id||q.id===id)?interact(g):false;}
 function inventory(g){const s=g?.evade&&state(g);return s?clone(s.inventory):null;}
 function handItems(g){const i=g?.evade?.groundItems,e=g?.evade;if(!e||restricted(g))return {right:null,left:null};const mode=e.weaponMode;if(mode==='rifle'&&inventoryValid(i)&&i.rifle)return {right:'rifle',left:'rifle'};if(mode==='stick'&&inventoryValid(i)&&i.stick)return {right:'stick',left:null};return {right:mode==='pistol'&&e.hasPistol!==false&&e.drawn?'pistol':mode==='knife'&&(e.hasKnife!==false||e.fitting)?'knife':null,left:null};}
 function movementFactor(g){const i=g?.evade?.groundItems;return allowed(g)&&inventoryValid(i)?(.94+.06*i.energy)*(i.foliage?.88:1):1;}
 function visibilityFactor(g,distance=Infinity,observer){const i=g?.evade?.groundItems,e=g?.evade;if(!allowed(g)||!inventoryValid(i)||distance<12||observer?.seen||e.handsUp)return 1;return (i.foliage?(e.running?.90:.72):1)*(i.hat&&!e.drawn?.94:1);}
 function rifleAmmo(g){return allowed(g)&&inventoryValid(g.evade.groundItems)&&g.evade.groundItems.rifle?g.evade.groundItems.rifleAmmo:0;}
 function spendRifle(g){if(!active(g)||g.evade.weaponMode!=='rifle'||!g.evade.drawn||rifleAmmo(g)<1)return false;g.evade.groundItems.rifleAmmo--;return true;}
 function items(g){const s=allowed(g)&&state(g);return s?s.items.filter(q=>Math.hypot(q.p[0]-g.evade.p[0],q.p[2]-g.evade.p[2])<LIMITS.renderRange).map(q=>clone(q)):[];}
 function snapshot(g){const s=allowed(g)&&state(g);return s?{version:1,mission:s.mission,epoch:s.epoch,inventory:clone(s.inventory),items:clone(s.items),cells:[...s.cells],consumed:[...s.consumed],nextDrop:s.nextDrop,clock:s.clock}:null;}
 function restore(g,saved){
  if(!allowed(g)||!saved||saved.version!==1||saved.mission!==mission(g)||saved.epoch!==(g.pow?.stage||'field')||!inventoryValid(saved.inventory)||!Array.isArray(saved.items)||saved.items.length>LIMITS.items||!Array.isArray(saved.cells)||saved.cells.length>LIMITS.cells||!Array.isArray(saved.consumed)||saved.consumed.length>LIMITS.consumed||!saved.cells.every(q=>typeof q==='string'&&q.length<80)||!saved.consumed.every(q=>typeof q==='string'&&q.length<140)||!saved.items.every(q=>q&&typeof q.id==='string'&&q.id.length<140&&KINDS.has(q.kind)&&point(q.p)&&Number.isInteger(q.ammo)&&q.ammo>=0&&q.ammo<=LIMITS.rifleAmmo&&Number.isFinite(q.yaw)))return false;
  if(new Set(saved.items.map(q=>q.id)).size!==saved.items.length||saved.items.some(q=>saved.consumed.includes(q.id)))return false;
  g.evade.groundItems=cleanInventory(saved.inventory);states.delete(g);const s=state(g);s.items=saved.items.map(cleanItem).filter(q=>ground(g,q.p[0],q.p[2])&&Math.abs(floor(g,q.p[0],q.p[2])+.018-q.p[1])<.05);s.cells=new Set(saved.cells);s.consumed=new Set(saved.consumed);s.nextDrop=Math.max(0,Math.min(1000000,Math.floor(finite(saved.nextDrop))));s.clock=Math.max(0,finite(saved.clock));return true;
 }
 function carry(g,saved){
  // Explicit physical chapter transfer, such as street to river: equipment
  // travels with its owner; the old street's props do not move to the river.
  if(!allowed(g)||!saved||saved.version!==1||saved.mission!==mission(g)||!['field','hanoi','river'].includes(saved.epoch)||!inventoryValid(saved.inventory))return false;
  g.evade.groundItems=cleanInventory(saved.inventory);states.delete(g);state(g);return true;
 }
 function inspect(g){const s=g?.evade&&states.get(g);return s?{active:active(g),inventory:clone(s.inventory),items:s.items.length,cells:s.cells.size,consumed:s.consumed.size,clock:s.clock,notice:s.notice,mission:s.mission,epoch:s.epoch}:null;}
 function reset(g){return !!g&&states.delete(g);}
 root.GroundItems=Object.freeze({configure,step,target,nearest:target,prompt,interact,pickup,handle,equip,inventory,handItems,movementFactor,visibilityFactor,rifleAmmo,spendRifle,items,snapshot,restore,carry,confiscate,observe,dropped,inspect,reset,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);
