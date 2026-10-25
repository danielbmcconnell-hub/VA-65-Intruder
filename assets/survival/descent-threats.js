/* Existing armed field positions can engage the descending crew. Their
 * photographic gunmen occupy the same world positions, then join normal NPC
 * ownership on landing. Civilian scenery never becomes a shooter. Separate
 * seeded presentation/encounter randomness never consumes gameplay Math.random.
 * Injury is deliberately bounded; open ground is dangerous without an
 * unavoidable random death while the player has limited canopy control. */
(function(root){
 'use strict';
 const LIMITS=Object.freeze({shooters:4,range:400,height:300,grace:4,open:.85,step:.05,maxStep:.25,lookInterval:.45,scanInterval:.8,terrainSamples:64,coverObjects:1800,maxInjuries:2,history:12});
 const records=new WeakMap(),installed=new WeakSet();let context={};
 const finite=(n,d=0)=>Number.isFinite(n)?n:d,point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite),clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 function configure(o={}){if(typeof o.terrainH!=='function')return false;context={...context,...o};return true;}
 function terrain(x,z){return typeof context.terrainH==='function'?context.terrainH(x,z):NaN;}
 function hash(text){let v=2166136261;for(const c of String(text)){v^=c.charCodeAt(0);v=Math.imul(v,16777619);}return v>>>0||1;}
 function random(s){let n=s.rng>>>0;n^=n<<13;n^=n>>>17;n^=n<<5;s.rng=n>>>0||1;return s.rng/4294967296;}
 function companion(g){return (context.AviatorCompanion||root.AviatorCompanion)?.view?.(g);}
 function targets(g){
  const out=[],crew=g?.ac?.crew||{},role=g?.rightSeat?'bn':'pilot',c=g?.chute;
  if(g?.phase==='chute'&&c&&point(c.p)&&crew[role]>0&&c.live?.[role]!==false)out.push({role,p:[c.p[0],c.p[1]-.4,c.p[2]],open:finite(c.open),v:point(c.v)?c.v:[0,0,0],player:true});
  const other=companion(g),o=other?.chute;
  if(other?.active&&o&&point(o.p)&&crew[other.role]>0&&!['captured','rescued'].includes(other.mode))out.push({role:other.role,p:[o.p[0],o.p[1]-.4,o.p[2]],open:finite(o.open),v:point(o.v)?o.v:[0,0,0],player:false});
  return out;
 }
 function visible(g){return !!(g&&g.world&&!g.pow&&!g.result&&!g._capturePending&&['chute','evade'].includes(g.phase)&&(!g.evade||!g.evade.camp&&!g.evade.river)&&(!g.app||(!g.app.game||g.app.game===g)&&(!g.app.screen||['game','fixture'].includes(g.app.screen))&&!g.app.graphicsContextLost));}
 function active(g){if(!visible(g)||g.paused||g.evade?.held||g.evade?.frozen||['legend','knee','pauseVeil','captVeil'].some(id=>root.document?.getElementById?.(id)?.classList?.contains('on'))||root.document?.hidden||root.document?.visibilityState==='hidden')return false;const photos=root.PhotoCutouts;if(g.rend&&photos?.inspect&&photos.inspect(g.rend).status!=='ready')return false;return targets(g).length>0;}
 function boxHit(a,b,o,half,height){
  const yaw=finite(o.y),co=Math.cos(yaw),si=Math.sin(yaw),local=p=>{const x=p[0]-o.p[0],z=p[2]-o.p[2];return [x*co+z*si,p[1]-o.p[1]-height/2,-x*si+z*co];},p=local(a),q=local(b),bounds=[half[0],height/2,half[1]];let low=.002,high=.998;
  for(let k=0;k<3;k++){const d=q[k]-p[k];if(Math.abs(d)<1e-9){if(Math.abs(p[k])>bounds[k])return false;continue;}let x=(-bounds[k]-p[k])/d,y=(bounds[k]-p[k])/d;if(x>y)[x,y]=[y,x];low=Math.max(low,x);high=Math.min(high,y);if(low>high)return false;}return true;
 }
 function cover(g,a,b){
  const table={bldg:[4.2,4.2,7],hut:[2.5,3.3,4.7],barrack:[2.7,9.2,5],cellblock:[3.8,11.2,6.5],cwall:[.34,6.05,3.2],tower:[1.55,1.55,9],truck:[1.35,2.7,3],vehicle:[1.5,3,2.8],jeep:[1.1,2.2,1.9],tree:[.85,.85,14],palm:[.44,.44,10],bamboo:[.8,.8,9],stump:[.65,.65,1.3]},seen=new Set();let checked=0,blocked=false;
  const test=o=>{if(blocked||!o||seen.has(o)||!point(o.p)||!table[o.m])return;seen.add(o);const s=finite(o.s,1),d=table[o.m],margin=Math.max(d[0],d[1])*s+1;if(o.p[0]<Math.min(a[0],b[0])-margin||o.p[0]>Math.max(a[0],b[0])+margin||o.p[2]<Math.min(a[2],b[2])-margin||o.p[2]>Math.max(a[2],b[2])+margin)return;
   if(++checked>LIMITS.coverObjects){blocked=true;return;}const base=terrain(o.p[0],o.p[2]);if(!Number.isFinite(base)){blocked=true;return;}const building=o.village?2.6:d[2]*s,half=typeof g._solidHalf==='function'?g._solidHalf(o.m,s):[d[0]*s,d[1]*s];if(half&&boxHit(a,b,{...o,p:[o.p[0],Math.max(base,finite(o.p[1],base)),o.p[2]]},half,building))blocked=true;
  };
  for(const o of g.world.scenery||[])test(o);
  const cells=g.world._cells;if(cells?.get){const ci0=Math.floor(Math.min(a[0],b[0])/170)-1,ci1=Math.ceil(Math.max(a[0],b[0])/170)+1,cj0=Math.floor(Math.min(a[2],b[2])/170)-1,cj1=Math.ceil(Math.max(a[2],b[2])/170)+1;for(let i=ci0;i<=ci1&&!blocked;i++)for(let j=cj0;j<=cj1&&!blocked;j++)for(const o of cells.get(i*65536+j)||[])test(o);}
  for(const target of g.world.targets||[])if(target.alive&&target.mesh)test({m:target.mesh,p:target.p,y:target.yaw,s:1});
  return !blocked;
 }
 function lineOfSight(g,a,b){
  if(!g?.world||!point(a)||!point(b))return false;const d=distance(a,b);if(d>LIMITS.range+.01)return false;const count=Math.min(LIMITS.terrainSamples,Math.max(3,Math.ceil(d/8)));
  for(let i=1;i<count;i++){const f=i/count,h=terrain(a[0]+(b[0]-a[0])*f,a[2]+(b[2]-a[2])*f);if(!Number.isFinite(h)||h>a[1]+(b[1]-a[1])*f-.18)return false;}return cover(g,a,b);
 }
 function knownSource(source){return !!(source&&point(source.p)&&source.alive!==false&&source.armed!==false&&!['farmer','villager','cow'].includes(source.kind));}
 function begin(g,options={}){
  if(!g?.chute||!point(g.chute.p)||!g.world||!g.ac?.crew)return null;const seed=Number.isFinite(options.seed)?options.seed>>>0:hash([g.mis?.id,g.mis?.env?.seed,...g.chute.p.map(n=>n.toFixed(1))].join(':'));
  const s={world:g.world,chute:g.chute,rng:seed||1,clock:0,remainder:0,nextScan:0,rows:[],bySource:new Map(),shots:0,injuries:{pilot:0,bn:0},lastWarning:-99,lastInjury:-99,events:[],transferred:false,checks:0};records.set(g,s);scan(g,s);return inspect(g);
 }
 function event(s,item){s.events.push({...item,at:s.clock});if(s.events.length>LIMITS.history)s.events.shift();}
 function scan(g,s){
  if(s.transferred)return;const crew=targets(g),rows=[];for(let index=0;index<(g.world.saf||[]).length;index++){const source=g.world.saf[index];if(!knownSource(source))continue;const d=Math.min(...crew.map(t=>distance(source.p,t.p)));if(!(d<LIMITS.range))continue;const y=terrain(source.p[0],source.p[2]);if(!Number.isFinite(y)||y<1||typeof g._localSolidAt==='function'&&g._localSolidAt(source.p[0],source.p[2],.28))continue;
   let row=s.bySource.get(source);if(!row){const k=hash(String(index)+':'+source.p.join(':')),actor={id:'descent-rifle-'+index,kind:['nva','vc','militia'].includes(source.kind)?source.kind:'militia',p:[source.p[0],y,source.p[2]],goal:[source.p[0],y,source.p[2]],home:[source.p[0],source.p[2]],loiter:0,wander:3,local:true,yaw:(k/4294967296)*Math.PI*2,face:(k/4294967296)*Math.PI*2,alive:true,armed:true,seen:0,sus:0,spd:0,ph:(k%100)/100,descentThreat:true};row={source,index,actor,nextShot:s.clock+1.2+(k%180)/100,nextLook:0,clear:false,target:null};s.bySource.set(source,row);}
   if(row.actor.alive!==false&&row.actor.armed!==false)rows.push({row,d});
  }rows.sort((a,b)=>a.d-b.d||a.row.index-b.row.index);s.rows=rows.slice(0,LIMITS.shooters).map(q=>q.row);s.nextScan=s.clock+LIMITS.scanInterval;
 }
 // Normal NPC owners keep p.y at zero and render against current terrain.
 // Refresh the same ground anchor once per fixed tick, including after reuse
 // and uphill movement, so their actual rifles never fire from underground.
 function muzzle(row){const p=row.actor.p;return [p[0],row.ground+1.6,p[2]];}
 function eligibleTarget(g,row,t){const ground=terrain(t.p[0],t.p[2]);return t.open>=LIMITS.open&&Number.isFinite(ground)&&t.p[1]-Math.max(ground,0)>3&&t.p[1]-Math.max(ground,0)<=LIMITS.height&&distance(muzzle(row),t.p)<=LIMITS.range;}
 function tell(g,s,text,tone='warn'){if(s.clock-s.lastWarning<8&&tone!=='bad')return;s.lastWarning=s.clock;g.app?.radio?.('CREW',text,tone);}
 function injure(g,s,t){
  if(s.injuries[t.role]>=LIMITS.maxInjuries||!(g.ac.crew[t.role]>0))return false;const old=g.ac.crew[t.role];g.ac.crew[t.role]=Math.max(Math.min(old,.1),old-.16);s.injuries[t.role]++;
  if(!t.player)(context.AviatorCompanion||root.AviatorCompanion)?.receiveInjury?.(g,{source:'descent-small-arms'});
  if(s.clock-s.lastInjury>=5){s.lastInjury=s.clock;tell(g,s,t.player?'Hit under the canopy. Still able to steer — get clear of the rifles.':'The other aviator is hit under his chute. He is still descending.','bad');}
  if(t.player){g.shake=Math.max(finite(g.shake),.45);g.flash=Math.max(finite(g.flash),.12);}event(s,{type:'injury',role:t.role});return true;
 }
 function shoot(g,s,row,t){
  const from=muzzle(row),d=distance(from,t.p),moving=Math.hypot(t.v[0],t.v[2])>.7?.72:1,chance=clamp(.018+.055*(1-d/LIMITS.range),.018,.073)*moving,hit=random(s)<chance;
  const miss=hit?[0,0,0]:[(random(s)-.5)*16,(random(s)-.5)*12,(random(s)-.5)*16],aim=t.p.map((n,i)=>n+miss[i]),length=distance(from,aim)||1,v=aim.map((n,i)=>(n-from[i])/length*190);
  row.actor.flash=finite(g.t);row.actor.seen=1;row.actor.sus=1.15;s.shots++;row.nextShot=s.clock+2.2+random(s)*2.2;
  try{g.world.fx?.streak?.(from,v,[1,.72,.28],.35,Math.min(2.4,length/190+.12),0,4.5);const add=g.world.fx?.add;if(Array.isArray(add)&&add.length<1500)add.push({p:from.slice(),c:[1,.73,.30],a:1,s:.45,s0:.45,k:1,t:0,life:.09,vel:[0,0,0],g:0,rot:0});}catch(_){/* cosmetic FX cannot change the shot */}
  if(g.app?.set?.sound)g.app.audio?.burst?.('gun',clamp(.3-d/1800,.07,.3));
  tell(g,s,t.player?'Rifle fire from the ground. Steer away from the armed positions.':'Rifle fire toward the other chute. Look for cover below.');event(s,{type:'shot',role:t.role,source:row.index,distance:d,hit:false});if(hit&&injure(g,s,t))s.events[s.events.length-2].hit=true;
 }
 function tick(g,s,dt){
  s.clock+=dt;if(s.clock>=s.nextScan)scan(g,s);if(s.clock<LIMITS.grace)return;const crew=targets(g);
  for(const row of s.rows){const a=row.actor;if(s.transferred&&!(g.evade?.locals||[]).includes(a)&&!(g.evade?.searchers||[]).includes(a))continue;if(!knownSource(row.source)||a.alive===false||a.armed===false||finite(a.suppress,-1)>finite(g.t)||finite(a.stunUntil,-1)>finite(g.t))continue;row.ground=terrain(a.p[0],a.p[2]);if(!Number.isFinite(row.ground))continue;const possible=crew.filter(t=>eligibleTarget(g,row,t)).sort((x,y)=>distance(muzzle(row),x.p)-distance(muzzle(row),y.p));let t=possible[0];if(!t)continue;
   const bearing=Math.atan2(t.p[0]-a.p[0],-(t.p[2]-a.p[2])),turn=angle(bearing-finite(a.face));a.face=angle(finite(a.face)+clamp(turn,-dt*1.8,dt*1.8));a.yaw=a.face;
   if(s.clock>=row.nextLook||row.target!==t.role){row.nextLook=s.clock+LIMITS.lookInterval;row.target=t.role;row.clear=lineOfSight(g,muzzle(row),t.p);s.checks++;}
   if(Math.abs(angle(bearing-a.face))>.5||!row.clear||s.clock<row.nextShot)continue;
   // Recheck at the actual firing instant: a newly intervening ridge or wall
   // must prevent a previously acquired shot from crossing solid scenery.
   if(!lineOfSight(g,muzzle(row),t.p)){row.clear=false;continue;}shoot(g,s,row,t);
  }
 }
 function enterGround(g){
  const s=records.get(g),e=g?.evade;if(!s||s.world!==g.world||!e||g.pow||e.camp||e.river||s.transferred)return false;s.transferred=true;
  const role=g.rightSeat?'bn':'pilot',n=s.injuries[role]||0;if(n){e.hurt=1;e.hits=finite(e.hits)+n;e.descentInjuries=n;}
  e.locals=e.locals||[];const existing=(e.searchers||[]).concat(e.locals),owned=[];
  for(const row of s.rows){const a=row.actor;if(a.alive===false||Math.hypot(a.p[0]-e.p[0],a.p[2]-e.p[2])>LIMITS.range)continue;const old=existing.find(o=>o.alive!==false&&point(o.p)&&Math.hypot(o.p[0]-a.p[0],o.p[2]-a.p[2])<1.2);if(old){if(old.armed){row.actor=old;owned.push(row);}continue;}a.goal=e.p.slice();a.seen=1;a.sus=1.15;a.fireT=finite(g.t)+1.8;e.locals.push(a);existing.push(a);owned.push(row);}
  // Only a gunman retained by the normal NPC owner may keep engaging the
  // other canopy. Rejected overlaps/culls cannot become invisible attackers.
  s.rows=owned;return true;
 }
 function step(g,dt){
  if(!active(g)||!Number.isFinite(dt)||dt<=0)return false;let s=records.get(g);if(!s||s.world!==g.world||g.phase==='chute'&&s.chute!==g.chute){if(!g.chute)return false;begin(g);s=records.get(g);}s.remainder+=Math.min(dt,LIMITS.maxStep);
  while(s.remainder+1e-9>=LIMITS.step){s.remainder-=LIMITS.step;tick(g,s,LIMITS.step);}return true;
 }
 function actors(g){const s=records.get(g);return visible(g)&&g.phase==='chute'&&s?s.rows.filter(row=>knownSource(row.source)&&row.actor.alive!==false).map(row=>row.actor):[];}
 function inspect(g){const s=records.get(g);return {active:active(g),clock:finite(s?.clock),shots:finite(s?.shots),injuries:{pilot:finite(s?.injuries.pilot),bn:finite(s?.injuries.bn)},transferred:!!s?.transferred,checks:finite(s?.checks),shooters:s?s.rows.map(row=>({id:row.actor.id,p:row.actor.p.slice(),face:row.actor.face,alive:row.actor.alive,armed:row.actor.armed,source:row.index})):[],events:s?s.events.map(e=>({...e})):[],limits:{...LIMITS}};}
 function install(o){
  if(!o?.Game?.prototype||typeof o.terrainH!=='function')return false;configure(o);const p=o.Game.prototype;if(installed.has(p))return true;const eject=p.eject,update=p.update,ground=p._startGroundPhase;if(typeof eject!=='function'||typeof update!=='function'||typeof ground!=='function')return false;installed.add(p);
  p.eject=function(){const before=this.chute,result=eject.apply(this,arguments);if(this.chute&&this.chute!==before)begin(this);return result;};
  p.update=function(dt){const result=update.apply(this,arguments);step(this,dt);return result;};
  p._startGroundPhase=function(){const result=ground.apply(this,arguments);enterGround(this);return result;};return true;
 }
 root.DescentThreats=Object.freeze({configure,begin,step,actors,inspect,enterGround,install,lineOfSight,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);
