/* Reconstructed rural exteriors inspired by the supplied architecture views.
 * No reference photograph is embedded. Only tagged procedural hamlet scenery
 * is replaced; original positions, 4.2*s collision bounds and AI stay owned by
 * World. Military warehouses, targets, prison buildings and boats are untouched. */
(function(root){
 'use strict';
 const MARKER='villageHouse',HALF=4.2,profiles=Object.freeze([{near:16,far:80,detailRange:170,range:1150},{near:24,far:120,detailRange:210,range:1500},{near:32,far:160,detailRange:250,range:1900}]);
 const meshes=new WeakSet(),frames=new WeakMap();let MB=null;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),finite=(n,d=0)=>Number.isFinite(n)?n:d;
 const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
 const hash=(x,z)=>{let h=Math.imul(Math.round(x*10),374761393)^Math.imul(Math.round(z*10),668265263);h=Math.imul(h^(h>>>13),1274126177);return (h^(h>>>16))>>>0;};
 const noise=(n,k)=>{let h=Math.imul(n^k,1597334677);return ((h^(h>>>15))>>>0)/4294967296;};
 function configure(context){if(!context||typeof context.MB!=='function')return false;MB=context.MB;return true;}
 function build(stilt,detail=true){
  const b=new MB(),floor=stilt?.56:.13,eave=floor+1.96,ridge=eave+1.04;
  const wood=[.23,.18,.105],pole=[.29,.255,.15],dark=[.095,.085,.055],weave=[.39,.34,.20];
  // The closed household occupies exactly the existing square collision plot.
  // The low stilt clearance and front rail do not imply a new enter action.
  b.box(0,floor+ .93,.84,3.96,.93,3.10,dark);
  b.box(0,floor-.04,0,4.14,.06,4.14,wood);
  for(const x of [-3.93,3.93])for(const z of [-3.94,3.94])b.cyl(x,(eave-.01)/2,z,.24,(eave-.01)/2,pole,detail?8:5);
  // Thatch has real depth and a pitched profile at every level of detail.
  b.quad([-4.70,eave-.10,4.70],[0,ridge,4.70],[0,ridge,-4.70],[-4.70,eave-.10,-4.70],[.34,.30,.16]);
  b.quad([0,ridge,4.70],[4.70,eave-.10,4.70],[4.70,eave-.10,-4.70],[0,ridge,-4.70],[.31,.275,.14]);
  b.quad([-4.70,eave-.13,-4.70],[0,ridge-.12,-4.70],[0,ridge-.12,4.70],[-4.70,eave-.13,4.70],dark);
  b.quad([0,ridge-.12,-4.70],[4.70,eave-.13,-4.70],[4.70,eave-.13,4.70],[0,ridge-.12,4.70],dark);
  for(const z of [-4.67,4.67]){const q=[[-4.68,eave-.10,z],[4.68,eave-.10,z],[0,ridge-.015,z]];b.tri(...(z<0?q.slice().reverse():q),weave);}
  if(!detail){b.box(0,floor+.80,-2.275,1.05,.80,.045,wood);return b;}
  // Crossing laths, with alternating raised intersections, read as woven
  // bamboo rather than uniform painted rectangles. All lie within HALF.
  for(let row=0;row<18;row++){
   const y=floor+.065+row*.105,tone=row%3*.018,c=[weave[0]+tone,weave[1]+tone,weave[2]+tone*.55];
   for(const z of [-2.30,3.97])for(let col=0;col<12;col++){
    const x=-3.63+col*.66,lift=(row+col)%2?.038:.058;b.box(x,y,z+(z>0?lift:-lift),.325,.035,.023,c);
   }
   for(const x of [-3.97,3.97])for(let col=0;col<9;col++)b.box(x+(x>0?.04:-.04),y,-1.94+col*.66,.023,.035,.325,c);
  }
  for(let col=0;col<13;col++)for(const z of [-2.34,4.01])b.box(-3.84+col*.64,floor+.96,z,.032,.91,.020,pole);
  for(let col=0;col<10;col++)for(const x of [-4.01,4.01])b.box(x,floor+.96,-2.06+col*.65,.020,.91,.032,pole);
  // Closed plank door, raised sill and simple side shutters remain legible
  // from the path without offering an unusable interior interaction.
  b.box(0,floor+.84,-2.39,1.09,.84,.045,dark);
  for(let i=0;i<5;i++)b.box(-.86+i*.43,floor+.84,-2.45,.20,.82,.025,wood);
  for(const x of [-1.15,1.15])b.box(x,floor+.89,-2.46,.075,.90,.055,pole);
  b.box(0,floor+1.79,-2.46,1.23,.065,.06,pole);b.box(0,floor+.06,-2.49,1.23,.055,.09,pole);
  for(const x of [-4.075,4.075]){
   b.box(x,floor+1.22,.62,.023,.34,.86,dark);
   for(let i=0;i<6;i++)b.box(x+(x>0?.02:-.02),floor+.94+i*.105,.62,.021,.035,.83,wood);
   b.box(x,floor+.84,.62,.045,.055,.94,pole);
  }
  // A small covered veranda and low front screen stay inside the old plot.
  for(let i=0;i<14;i++)b.box(-3.83+i*.59,floor+.04,-3.20,.275,.025,.86,[.30+(i%3)*.016,.25+(i%3)*.012,.15]);
  b.box(0,floor+.66,-4.10,4.08,.045,.055,pole);
  for(let i=0;i<13;i++)b.box(-3.84+i*.64,floor+.34,-4.10,.055,.30,.045,wood);
  if(stilt){
   for(const x of [-3.2,3.2])for(const z of [-1.4,2.6])b.cyl(x,floor/2,z,.27,floor/2,wood,7);
   for(const x of [-3.9,3.9])b.box(x,.26,.3,.08,.06,3.6,wood);
   // Lashings and stored woven panels fill the unwalkably low undercroft.
   for(let k=0;k<4;k++)b.box(-2.9+k*1.85,.23,.9,.73,.21,1.08,[.22,.195,.11]);
  }
  // Overlapping bundles have staggered edges and small height variation;
  // the continuous backing above prevents cracks through the roof.
  for(const side of [-1,1])for(let row=0;row<9;row++)for(let col=0;col<13;col++){
   const n=row*13+col+(side>0?151:0),x0=side*(row*.515),x1=side*Math.min(4.76,(row+1)*.515+.15),z0=-4.74+col*.73,z1=z0+.74+(noise(991,n)-.5)*.11;
   const y=x=>ridge-Math.abs(x)/4.7*1.14+.018+(noise(347,n)-.5)*.018,c=.27+noise(71,n)*.015,color=[c*1.07,c*.98,c*.60];
   const q=[[x0,y(x0),z0],[x1,y(x1),z0],[x1,y(x1),z1],[x0,y(x0),z1]];b.quad(...(side>0?q.slice().reverse():q),color);
  }
  for(const side of [-1,1])for(let i=0;i<26;i++){
   const z=-4.60+i*.36,drop=.05+noise(137,i+(side>0?51:0))*.11;
   b.quad([side*4.71,eave-.08,z],[side*4.77,eave-.11-drop,z+.08],[side*4.76,eave-.11-drop,z+.23],[side*4.71,eave-.08,z+.29],[.31,.27,.14]);
  }
  b.cyl(0,ridge+.015,0,.105,4.76,pole,8,'z');
  return b;
 }
 function ensureMeshes(r){
  if(!MB||!r||typeof r.meshFromBuilder!=='function')return false;if(meshes.has(r))return true;
  r.meshFromBuilder('villageBambooHouse',build(false));r.meshFromBuilder('villageStiltHouse',build(true));r.meshFromBuilder('villageHouseFar',build(false,false));r.meshFromBuilder('villageStiltFar',build(true,false));meshes.add(r);return true;
 }
 function beginFrame(game,r){if(!game||!r)return false;frames.set(r,{game,near:0,far:0,omitted:0,rows:[]});return true;}
 function describe(game,r,item){
  if(!item||item.m!==MARKER||!point(item.p)||!point(item.scale)||item.scale[0]<=0||item.scale[2]<=0||!ensureMeshes(r))return null;
  const frame=frames.get(r);if(!frame||frame.game!==game)return null;
  const eye=point(r.eye)?r.eye:game.evade?.p||game.ac?.p;if(!point(eye))return null;
  const profile=profiles[clamp(Math.round(finite(r.quality,1)),0,2)],distance=Math.hypot(item.p[0]-eye[0],item.p[2]-eye[2]),near=distance<profile.detailRange&&Math.abs(eye[1]-item.p[1])<80;
  if(distance>profile.range||(near?frame.near>=profile.near:frame.far>=profile.far)){frame.omitted++;return null;}
  const seed=hash(item.p[0],item.p[2]),stilt=seed%3===0,m=near?(stilt?'villageStiltHouse':'villageBambooHouse'):(stilt?'villageStiltFar':'villageHouseFar'),height=stilt?clamp(item.scale[1]/item.scale[0]*.57,.52,.62):clamp(item.scale[1]/item.scale[0]*.66,.60,.72),tint=item.tint||[1,1,1,0];
  const result={...item,m,scale:[item.scale[0],height,item.scale[2]],tint:tint.slice()};if(near)frame.near++;else frame.far++;
  frame.rows.push({m,p:item.p.slice(),scale:result.scale.slice(),halfExtent:[HALF*item.scale[0],HALF*item.scale[2]],distance,near,variant:stilt?'stilt':'ground'});return result;
 }
 function inspect(r){const s=frames.get(r),q=profiles[clamp(Math.round(finite(r?.quality,1)),0,2)];return {ready:meshes.has(r),near:s?.near||0,far:s?.far||0,omitted:s?.omitted||0,limits:{...q},rows:s?s.rows.map(row=>({...row,p:row.p.slice(),scale:row.scale.slice(),halfExtent:row.halfExtent.slice()})):[],photographsMapped:false,originalCollisionHalfExtent:HALF};}
 root.VillageDetail=Object.freeze({configure,ensureMeshes,beginFrame,describe,inspect,marker:MARKER,limits:Object.freeze({halfExtent:HALF,profiles})});
})(typeof window!=='undefined'?window:globalThis);
