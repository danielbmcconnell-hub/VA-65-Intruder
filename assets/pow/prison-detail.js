/* Photographic prison materials and bounded architectural detail.
 * Original camp geometry, solids, interaction anchors and capture actors are
 * never moved or replaced by this presentation module. */
(function(root){
  'use strict';
  const renderers=new WeakMap(),owners=new WeakMap(),holdings=new WeakMap();
  const STAGES=new Set(['cell','compound','solitary','regular']);
  const BASE='assets/prison/',NAMES=['prison_plaster','prison_steel','prison_cell_plaster','prison_cell_steel'];
  const KINDS=Object.freeze({prisonWall:1,prisonDoorCell:2,prisonDoorRegular:2,prisonDoorNarrow:2,prisonSteel:2,prisonBunk:3,prisonBamboo:4,prisonDeck:4,prisonThatch:4,prisonLashing:4,prisonCellWall:5,prisonCellLeftWall:5,prisonCellRightWall:5,prisonCellArch:5,prisonDoorEscape:6,prisonCellSteel:6,prisonCellBunk:7,prisonCellFloor:7});
  const LIMITS=Object.freeze({high:512,touch:384,highBytes:6*1024*1024,touchBytes:Math.floor(3.2*1024*1024),trim:56,holdingInstances:100});
  let context=null;
  const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
  const finite=(n,f=0)=>Number.isFinite(n)?n:f;
  function active(g){return !!(g&&g.pow&&g.evade&&STAGES.has(g.pow.stage)&&!(context?.POW?.Mindscape?.active?.(g)));}
  function configure(c){if(!c||typeof c.MB!=='function'||!c.POW)return false;context=c;return true;}
  function kind(name){return Object.prototype.hasOwnProperty.call(KINDS,name)?KINDS[name]:0;}
  function mipBytes(w,h){let n=0;for(;;){n+=w*h*4;if(w===1&&h===1)return n;w=Math.max(1,w>>1);h=Math.max(1,h>>1);}}
  function valid(r,s){return !!(r&&r.gl&&renderers.get(r)===s&&!r.gl.isContextLost()&&(!s.current||s.current()));}
  function texture(r,name,im,region,size){
    const cv=root.document.createElement('canvas');cv.width=cv.height=size;
    const c=cv.getContext('2d',{willReadFrequently:true});if(!c)throw Error('Prison material canvas unavailable');
    c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(im,...region,0,0,size,size);
    const pixels=c.getImageData(0,0,size,size).data;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255)throw Error('Prison material must remain opaque');
    const gl=r.gl,previous=r.textures?.[name];let T;
    try{T=r.texFromCanvas(name,cv);gl.bindTexture(gl.TEXTURE_2D,T.tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    const ext=gl.getExtension('EXT_texture_filter_anisotropic');
    if(ext)gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('Prison material GPU upload failed: '+error);
    return {name,tex:T.tex,width:size,height:size,bytes:mipBytes(size,size),opaque:true,region:region.slice()};
    }catch(e){const allocated=T?.tex||r.textures?.[name]?.tex;if(allocated&&allocated!==previous?.tex){gl.deleteTexture(allocated);if(r.textures?.[name]?.tex===allocated)delete r.textures[name];}throw e;}
    finally{cv.width=cv.height=1;}
  }
  function image(url){return new Promise((resolve,reject)=>{const im=new root.Image();im.decoding='async';im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Prison material failed to load: '+url));im.src=url;});}
  function load(r,options={}){
    if(!r||!r.gl)return Promise.resolve(null);const previous=renderers.get(r);if(previous)return previous.promise;
    const s={status:'loading',records:[],bytes:0,budget:options.touch?LIMITS.touchBytes:LIMITS.highBytes,current:options.current,failures:[],touch:!!options.touch};
    renderers.set(r,s);s.promise=(async()=>{
      const images=[];
      try{
        const response=await root.fetch(BASE+'manifest.json');if(!response.ok)throw Error('Prison material manifest HTTP '+response.status);
        const m=await response.json(),material=m.materials||m,cell=m.cellMaterials||{...material,file:'cell-materials.webp'};
        const size=options.touch?LIMITS.touch:LIMITS.high;
        for(const [atlas,definition]of [material,cell].entries()){
          const file=definition.file;if(typeof file!=='string'||!/^[a-z0-9_-]+\.webp$/.test(file))throw Error('Invalid prison material filename');
          const regions=definition.regions;if(!regions||!Array.isArray(regions.plaster)||!Array.isArray(regions.metal))throw Error('Missing prison material source regions');
          const im=await image(BASE+file);images.push(im);if(!valid(r,s)){for(const q of s.records){r.gl.deleteTexture(q.tex);if(r.textures?.[q.name]?.tex===q.tex)delete r.textures[q.name];}s.records.length=0;s.bytes=0;s.status='retired';return inspect(r);}
          for(const [i,key]of ['plaster','metal'].entries()){
          const region=regions[key];
          if(region.length!==4||!region.every(Number.isInteger)||region[0]<0||region[1]<0||region[2]<=0||region[3]<=0||region[0]+region[2]>im.naturalWidth||region[1]+region[3]>im.naturalHeight)throw Error('Prison material source region exceeds complete atlas');
          if(!valid(r,s)){s.status='retired';return inspect(r);}
          const bytes=mipBytes(size,size);if(s.bytes+bytes>s.budget)throw Error('Prison texture budget exceeded');
          const record=texture(r,NAMES[atlas*2+i],im,region,size);record.file=file;s.records.push(record);s.bytes+=record.bytes;
          }
        }
        s.status='ready';return inspect(r);
      }catch(e){for(const record of s.records){r.gl.deleteTexture(record.tex);if(r.textures?.[record.name]?.tex===record.tex)delete r.textures[record.name];}s.records.length=0;s.bytes=0;s.status='error';s.failures.push(String(e&&e.message||e));return inspect(r);}
      finally{for(const im of images)im.src='';}
    })();return s.promise;
  }
  function dispose(r){const s=r&&renderers.get(r);if(!s)return false;s.current=()=>false;
    for(const record of s.records){if(record.tex)r.gl.deleteTexture(record.tex);if(r.textures?.[record.name]?.tex===record.tex)delete r.textures[record.name];}
    s.records.length=0;s.bytes=0;s.status='retired';renderers.delete(r);owners.delete(r);return true;
  }
  function inspect(r){const s=r&&renderers.get(r);return s?{status:s.status,bytes:s.bytes,budget:s.budget,ready:s.records.length,expected:4,records:s.records.map(q=>({name:q.name,file:q.file,width:q.width,height:q.height,bytes:q.bytes,opaque:q.opaque,region:q.region.slice()})),failures:s.failures.slice()}:{status:'idle',bytes:0,budget:0,ready:0,expected:4,records:[],failures:[]};}
  function rivet(b,x,y,z,r=.009){
    const c=[.16,.19,.16],n=8;
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2,d=(i+1)/n*Math.PI*2;
      const p=[x+Math.cos(a)*r,y+Math.sin(a)*r,z],q=[x+Math.cos(d)*r,y+Math.sin(d)*r,z];
      b.tri([x,y,z+.012],[q[0],q[1],z+.012],[p[0],p[1],z+.012],c);
      b.quad(p,q,[q[0],q[1],z+.012],[p[0],p[1],z+.012],c);
    }
  }
  function door(MB,regular,escape){
    const b=new MB(),c=[.15,.22,.17],iron=[.12,.15,.13];
    const h=escape?{x:0,y:.2/2.44,hw:.11/.92,hh:.12/2.44}:regular?{x:.282,y:.227,hw:.086,hh:.068}:{x:0,y:.286,hw:.148,hh:.085};
    const left=h.x-h.hw,right=h.x+h.hw,bottom=h.y-h.hh,top=h.y+h.hh;
    b.box((-.5+left)/2,0,0,(left+.5)/2,.5,.5,c);
    b.box((right+.5)/2,0,0,(.5-right)/2,.5,.5,c);
    b.box(h.x,(-.5+bottom)/2,0,h.hw,(bottom+.5)/2,.5,c);
    b.box(h.x,(top+.5)/2,0,h.hw,(.5-top)/2,.5,c);
    // Physical bars span the opening; there is no opaque sheet over the hatch.
    for(let i=-1;i<=1;i++)b.box(h.x+i*h.hw*.49,h.y,0,.007,h.hh,.45,iron);
    if(escape){
      // The supplied chamber shows a closed hinged inspection flap. The
      // separate arched transom above the door remains genuinely barred/open.
      b.box(h.x,h.y,.560,h.hw+.018,h.hh+.010,.015,c);
      b.box(h.x,h.y+h.hh+.016,.580,h.hw*.78,.005,.020,iron);
      for(const x of [-.65,.65])b.box(h.x+x*h.hw,h.y+h.hh+.012,.578,.010,.010,.024,iron);
    }
    for(const z of [-.515,.515]){
      b.box(0,.475,z,.48,.018,.012,iron);b.box(0,-.475,z,.48,.018,.012,iron);
      for(const x of [-.475,.475])b.box(x,0,z,.018,.475,.012,iron);
      for(const y of [-.31,.30])b.box(-.45,y,z,.033,.047,.045,iron);
      b.box(.30,escape?(1.05-1.22)/2.44:-.20,z,.13,.012,.025,iron);b.box(.32,escape?(.92-1.22)/2.44:-.25,z,.035,.045,.026,iron);
      b.box(.32,escape?(.77-1.22)/2.44:-.306,z,.026,.033,.025,[.20,.19,.13]);
      for(const y of [-.44,-.22,0,.22,.44])for(const x of [-.47,.47])rivet(b,x,y,z,.010);
      for(const x of [-.27,0,.27])for(const y of [-.47,.47])rivet(b,x,y,z,.009);
    }
    return b;
  }
  function cellArch(MB){
    const b=new MB(),c=[.31,.245,.18],n=32,r=.45;
    for(const x of [-.475,.475])b.box(x,0,0,.025,.5,.5,c);
    for(let i=0;i<n;i++){
      const a=Math.PI-i/n*Math.PI,d=Math.PI-(i+1)/n*Math.PI,x0=Math.cos(a)*r,x1=Math.cos(d)*r,y0=-.5+Math.sin(a)*.82,y1=-.5+Math.sin(d)*.82;
      b.quad([x0,y0,.5],[x1,y1,.5],[x1,.5,.5],[x0,.5,.5],c);
      b.quad([x1,y1,-.5],[x0,y0,-.5],[x0,.5,-.5],[x1,.5,-.5],c);
      b.quad([x0,y0,.5],[x0,y0,-.5],[x1,y1,-.5],[x1,y1,.5],c);
    }
    b.quad([-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],c);return b;
  }
  function cellSide(MB,side){
    const b=new MB(),c=[.31,.245,.18],inner=side*.5;b.box(0,0,0,.5,.5,.5,c);
    const kept=[];for(let i=0;i<b.i.length;i+=3){const ids=b.i.slice(i,i+3);if(!ids.every(k=>Math.abs(b.p[k*3]-inner)<1e-8))kept.push(...ids);}b.i=kept;
    const cy=.35/3.1,hy=.11/3.1,cz=(-2.05+1.375)/4.45,hz=.20/4.45,y0=cy-hy,y1=cy+hy,z0=cz-hz,z1=cz+hz;
    const f=(points,col=c,x=inner)=>{const q=points.map(([y,z])=>[x,y,z]);if(side>0)b.quad(...q,col);else b.quad(...q.reverse(),col);};
    const rect=(a,d,e,h)=>f([[a,e],[d,e],[d,h],[a,h]]);
    rect(-.5,.5,-.5,z0);rect(-.5,.5,z1,.5);rect(-.5,y0,z0,z1);rect(y1,.5,z0,z1);
    const P=[[y1,z0],[y1,z1],[y0,z1]],remaining=[[y0,z0],[y1,z0],[y0,z1]],triangle=(p,x,col)=>{const q=p.map(([y,z])=>[x,y,z]);if(side>0)b.tri(...q,col);else b.tri(...q.reverse(),col);};
    triangle(remaining,inner,c);const back=inner-side*.24,dark=[.018,.014,.009];triangle(P,back,dark);
    for(let i=0;i<3;i++){const a=P[i],d=P[(i+1)%3],q=[[inner,a[0],a[1]],[back,a[0],a[1]],[back,d[0],d[1]],[inner,d[0],d[1]]];if(side>0)q.reverse();b.quad(...q,dark);}return b;
  }
  function ensureMeshes(r){
    if(!context||!r)return false;const MB=context.MB,makers={
      prisonWall:()=>{const b=new MB();b.box(0,0,0,.5,.5,.5,[.64,.62,.56]);return b;},
      prisonBunk:()=>{const b=new MB();b.box(0,0,0,.5,.5,.5,[.43,.42,.37]);return b;},
      prisonSteel:()=>{const b=new MB();b.box(0,0,0,.5,.5,.5,[.15,.22,.17]);return b;},
      prisonDoorCell:()=>door(MB,false),prisonDoorRegular:()=>door(MB,true),prisonDoorNarrow:()=>door(MB,false),
      prisonDoorEscape:()=>door(MB,false,true),prisonCellArch:()=>cellArch(MB),prisonCellLeftWall:()=>cellSide(MB,1),prisonCellRightWall:()=>cellSide(MB,-1),
      prisonCellWall:()=>{const b=new MB();b.box(0,0,0,.5,.5,.5,[.31,.245,.18]);return b;},
      prisonCellBunk:()=>{const b=new MB();b.box(0,0,0,.5,.5,.5,[.29,.23,.17]);return b;},
      prisonCellFloor:()=>{const b=new MB();b.box(0,0,0,.5,.5,.5,[.26,.21,.14]);return b;},
      prisonCellSteel:()=>{const b=new MB();b.box(0,0,0,.5,.5,.5,[.16,.19,.16]);return b;},
      prisonBamboo:()=>{const b=new MB(),c=[.28,.25,.12];b.cyl(0,0,0,.035,.5,c,8);for(const y of [-.35,0,.35])b.cyl(0,y,0,.043,.015,[.21,.20,.10],8);return b;},
      prisonDeck:()=>{const b=new MB();for(let i=0;i<15;i++)b.box(-.467+i/15,0,0,.030,.5,.5,[.23+i%3*.018,.20+i%3*.015,.11]);return b;},
      prisonThatch:()=>{
        const b=new MB();
        // Overlapping thatch courses make two opaque pitched slopes; the
        // broken eaves and layered ends have physical depth from every side.
        for(const side of [-1,1])for(let row=0;row<11;row++)for(let col=0;col<24;col++){
          const z=side*(row*.19),x=-2.28+col*.195,roofY=.76-Math.abs(z)*.34;
          const c=[.25+((row+col)%4)*.015,.23+((row+col)%3)*.013,.12];
          const a=[x,roofY+.025,z],d=[x+.207,roofY+.025,z],q=[x+.207,roofY-.073,z+side*.275],p=[x,roofY-.073,z+side*.275];
          b.quad(a,d,q,p,c);b.quad(p,q,d,a,[c[0]*.66,c[1]*.66,c[2]*.66]);
        }return b;
      },
      prisonLashing:()=>{const b=new MB();for(let i=-2;i<=2;i++)b.cyl(0,i*.015,0,.052,.005,[.32,.27,.14],8);return b;}
    };
    for(const [name,make]of Object.entries(makers))if(!r.meshes?.[name])r.meshFromBuilder(name,make());return true;
  }
  function prepare(game){
    if(!game||!game.rend||!context)return false;const hs=holdings.get(game),enabled=active(game)||!!(hs&&hs.visible);
    if(!enabled){owners.delete(game.rend);return false;}
    owners.set(game.rend,game);ensureMeshes(game.rend);
    if(active(game)){
      const app=game.app,renderer=game.rend;
      load(renderer,{touch:typeof root.matchMedia==='function'&&root.matchMedia('(pointer: coarse)').matches,current:()=>!app||app.rend===renderer});
    }
    return true;
  }
  function decorate(game,item){
    if(!item||!active(game))return item;const id=String(item.id||'').replace(/^regular:/,''),scale=item.scale;
    // The photograph supplies continuous damp/wear detail. Former flat color
    // rectangles otherwise cover that image with conspicuous beige patches.
    // Omit these non-collision render overlays without editing their owners.
    if(item.m==='powStone'&&/^episode-scene:cell-(?:wear-|damp-band-|rear-damp$)/.test(id))return null;
    // Only the old visual cover and redundant slot bars disappear. Original
    // collision, bolt/fitting interaction and episode action records survive.
    if((id==='door-hatch'||id.startsWith('door-bars:'))&&(game.campGeo||[]).some(q=>q.id==='cell-door'))return null;
    if((id==='door-slot'||id.startsWith('slotbar:'))&&(game.campGeo||[]).some(q=>q.id==='regular:cell-door'))return null;
    if(!Array.isArray(scale)||scale.length<3)return item;
    let mesh=null,rotation=finite(item.y),nextScale=scale.slice();
    const escapeCell=!String(item.id||'').startsWith('regular:')&&game.pow.stage!=='solitary';
    const isDoor=id==='cell-door'||id==='door-open'||/^(isolated-.+-door|yard-door:|workshop-door|exit-gate)/.test(id);
    if(isDoor&&(item.m==='powWood'||item.m==='powMetal')){
      mesh=escapeCell&&(id==='cell-door'||id==='door-open')?'prisonDoorEscape':game.pow.stage==='regular'&&id==='cell-door'?'prisonDoorRegular':game.pow.stage==='solitary'?'prisonDoorNarrow':'prisonDoorCell';
      if(scale[0]<scale[2]){nextScale=[scale[2],scale[1],scale[0]];rotation+=id==='door-open'?-Math.PI/2:Math.PI/2;}
    }else if(escapeCell&&id==='cell-west')mesh='prisonCellLeftWall';
    else if(escapeCell&&id==='cell-east')mesh='prisonCellRightWall';
    else if(escapeCell&&id==='cell-arched-transom')mesh='prisonCellArch';
    else if(escapeCell&&id==='cell-floor')mesh='prisonCellFloor';
    else if(escapeCell&&item.m==='powStone'&&/^cell-(?:back|front-|lintel|roof)/.test(id))mesh='prisonCellWall';
    else if((id==='bunk'||id==='bunk-right'||id==='bed')&&item.m==='powWood')mesh=escapeCell&&id!=='bed'?'prisonCellBunk':'prisonBunk';
    else if(escapeCell&&/^(?:ankle-|door-bolt$|fitting$)/.test(id)&&item.m==='powMetal')mesh='prisonCellSteel';
    else if((id==='service-hatch'||id==='drain-panel')&&item.m==='powWood')mesh='prisonSteel';
    else if(item.m==='powStone'&&scale[1]>1.0&&Math.min(scale[0],scale[2])<1.6&&!/stair|floor|roof|deck|path|trough/.test(id))mesh='prisonWall';
    if(!mesh)return item;
    return {...item,m:mesh,y:rotation,scale:nextScale,t:[1,1,1,finite(item.t?.[3])]};
  }
  function instances(game,push){
    if(!active(game)||typeof push!=='function')return 0;
    // Use the existing collision-backed wall faces and furniture. These small
    // collar/edge details do not create false doors or steal walking space.
    let count=0;
    for(const q of game.campGeo||[]){
      if(count>=LIMITS.trim)break;
      if((q.id==='cell-lintel'||q.id==='door-transom')&&q.scale){
        push('prisonSteel',[q.p[0],q.p[1]-.035,q.p[2]-.012],[finite(q.y),0,0],[q.scale[0]*.94,.028,.026],[1,1,1,0]);count++;
      }
    }
    const arch=(game.campGeo||[]).find(q=>q.id==='cell-arched-transom');
    if(arch?.scale){
      for(let i=-2;i<=2;i++){
        const x=i*.17,h=Math.sqrt(Math.max(0,1-(x/.459)**2))*.451,base=arch.p[1]-.275;
        push('prisonCellSteel',[arch.p[0]+x,base+h/2,arch.p[2]],[0,0,0],[.018,h,.026],[1,1,1,0]);count++;
      }
      push('prisonCellSteel',[arch.p[0],arch.p[1]-.275,arch.p[2]],[0,0,0],[.94,.026,.045],[1,1,1,0]);count++;
    }
    if(game.pow.stage==='solitary'){
      const b=game.pow.base,floor=(game.campGeo||[]).find(q=>q.id==='corridor-floor');
      if(floor?.scale&&floor.p){
        // The pre-existing solitary corridor has a floor and patrols but no
        // exterior enclosure. Place its distant face beyond that floor's
        // edge, clear of both actual guard routes (-2.5m and -3.4m). This
        // closes the sea/sky sightline through the genuinely open door slot.
        const width=floor.scale[0]+.20,depth=floor.scale[2]+.18,rear=floor.p[2]-floor.scale[2]/2-.12;
        push('prisonWall',[floor.p[0],b[1]+1.35,rear],[0,0,0],[width,2.70,.12],[1,1,1,0]);
        push('prisonBunk',[floor.p[0],b[1]+2.66,floor.p[2]-.02],[0,0,0],[width,.12,depth],[1,1,1,0]);count+=2;
      }
    }
    return count;
  }
  function bind(r,p,name){
    const gl=r&&r.gl;if(!gl||!p?.u)return;const owner=owners.get(r),n=owner&&(active(owner)||holdings.get(owner)?.visible)?kind(name):0;
    const h=owner&&holdings.get(owner),base=owner&&active(owner)?owner.pow.base:h?.origin||[0,0,0],s=renderers.get(r),ready=s&&s.status==='ready'&&valid(r,s)&&s.records.length===4,offset=n>4.5?2:0;
    gl.uniform1f(p.u.uPrisonKind,n);gl.uniform3fv(p.u.uPrisonBase,base);gl.uniform1f(p.u.uPrisonTexOn,ready?1:0);
    const leaf=n===6&&name==='prisonDoorEscape'&&(owner.campGeo||[]).find(q=>q.id==='cell-door'||q.id==='door-open');
    const mapped=!!(leaf?.scale&&leaf.p&&leaf.scale.every(v=>Number.isFinite(v)&&v>0));
    gl.uniform1f(p.u.uPrisonDoorMap,mapped?1:0);
    if(gl.uniform4fv){const across=mapped&&leaf.scale[0]<leaf.scale[2]?2:0,w=mapped?leaf.scale[across]:1,h=mapped?leaf.scale[1]:1;gl.uniform4fv(p.u.uPrisonDoorUV,mapped?[leaf.p[across]-base[across]-w/2,leaf.p[1]-base[1]-h/2,1/w,1/h]:[0,0,1,1]);}
    for(let i=0;i<2;i++){gl.activeTexture(gl.TEXTURE0+9+i);gl.bindTexture(gl.TEXTURE_2D,ready?s.records[offset+i].tex:r.textures?.wear?.tex||null);gl.uniform1i(p.u[i?'uPrisonSteel':'uPrisonPlaster'],9+i);}
    gl.activeTexture(gl.TEXTURE0);
  }
  function beginHolding(game){
    if(!game?.evade||!point(game.evade.p))return false;
    const origin=game.evade.p.slice(),yaw=finite(game.evade.hdg),terrain=context?.terrainH;
    // A field cage needs a verified dry, nearly level footprint. Rejecting an
    // ocean/slope capture retains the ordinary fade-to-prison timeline.
    if(typeof terrain!=='function')return false;
    const heights=[];
    for(const [x,z]of [[0,0],[-3,-2.3],[-3,2.3],[3,-2.3],[3,2.3]]){
      const y=terrain(origin[0]+x*Math.cos(yaw)-z*Math.sin(yaw),origin[2]+x*Math.sin(yaw)+z*Math.cos(yaw));
      if(!Number.isFinite(y)||y<=.75)return false;heights.push(y);
    }
    // Ordinary countryside actors retain p[1] === 0; the renderer derives
    // their ground height from terrain. Only this visual origin is elevated.
    if(Math.max(...heights)-Math.min(...heights)>.60)return false;
    origin[1]=Math.max(...heights)+.04;
    const transform=(x,y,z)=>[origin[0]+x*Math.cos(yaw)-z*Math.sin(yaw),origin[1]+y,origin[2]+x*Math.sin(yaw)+z*Math.cos(yaw)];
    const guards=[-1,1].map((side,i)=>({kind:'nva',photoName:'nva',p:transform(side*1.55,0,-2.05),face:yaw+(side>0?-.8:.8),alive:true,armed:true,moving:false,spd:0,ph:0,_prisonHoldingOwner:i}));
    holdings.set(game,{actor:game.evade,origin,yaw,visible:false,guards,submitted:0,meshCounts:{}});ensureMeshes(game.rend);return true;
  }
  function holding(game,visible){
    const s=game&&holdings.get(game);if(!s)return null;
    if(s.actor!==game.evade||game.app?.game&&game.app.game!==game){holdings.delete(game);return null;}
    if(typeof visible==='boolean')s.visible=visible;
    return {active:true,visible:s.visible,origin:s.origin.slice(),yaw:s.yaw};
  }
  function endHolding(game){return !!game&&holdings.delete(game);}
  function inspectHolding(game){
    const state=holding(game),s=game&&holdings.get(game);return state?{...state,originalActorRetained:s.actor===game.evade,submitted:s.submitted,meshCounts:{...s.meshCounts},guards:s.guards.map(a=>({kind:a.kind,photoName:a.photoName,p:a.p.slice()})),visualOnly:true}:null;
  }
  function holdingCamera(game){
    const s=holding(game);if(!s?.visible)return null;
    return {eye:[s.origin[0],s.origin[1]+1.12,s.origin[2]],fwd:[Math.sin(s.yaw),-.035,-Math.cos(s.yaw)],up:[0,1,0],fov:64,near:.08};
  }
  function fieldInstances(game,push){
    const state=holding(game);if(!state?.visible||typeof push!=='function')return 0;prepare(game);
    const o=state.origin,yaw=state.yaw,c=Math.cos(yaw),s=Math.sin(yaw),raw=holdings.get(game);let count=0;raw.meshCounts={};
    const put=(name,x,y,z,rotation,scale,tint)=>{
      if(count>=LIMITS.holdingInstances)return;x*=.60;y*=.74;z*=.60;
      const axes=Math.abs(rotation[1]||0)>.5?[.60,.60,.74]:Math.abs(rotation[2]||0)>.5?[.74,.60,.60]:[.60,.74,.60];
      push(name,[o[0]+x*c-z*s,o[1]+y,o[2]+x*s+z*c],[yaw+(rotation[0]||0),rotation[1]||0,rotation[2]||0],scale.map((v,i)=>v*axes[i]),tint||[1,1,1,0]);count++;raw.meshCounts[name]=(raw.meshCounts[name]||0)+1;
    };
    // The staged holding scene has real depth and openings. It is visual
    // custody scenery while the authoritative original actor stays frozen.
    put('prisonDeck',0,-.045,0,[0,0,0],[4.15,.09,3.7]);
    for(const x of [-1.95,1.95])for(let z=-1.65;z<=1.66;z+=.275)put('prisonBamboo',x,1.25,z,[0,0,0],[1,2.5,1]);
    for(const z of [-1.75,1.75])for(let x=-1.65;x<=1.66;x+=.275)put('prisonBamboo',x,1.25,z,[0,0,0],[1,2.5,1]);
    for(const y of [.24,1.28,2.48]){
      for(const z of [-1.75,1.75])put('prisonBamboo',0,y,z,[0,0,Math.PI/2],[1,4.05,1]);
      for(const x of [-1.95,1.95])put('prisonBamboo',x,y,0,[0,Math.PI/2,0],[1,3.65,1]);
    }
    for(const x of [-1.5,-.75,0,.75,1.5])put('prisonBamboo',x,2.52,0,[0,Math.PI/2,0],[1,3.7,1],[.82,.88,.68,0]);
    for(const x of [-1.95,1.95])for(const z of [-1.75,1.75])for(const y of [.24,1.28,2.48])put('prisonLashing',x,y,z,[0,0,0],[1,1,1]);
    put('prisonThatch',0,2.50,0,[0,0,0],[1,1,1]);raw.submitted=count;
    return count;
  }
  function fieldActors(game){const s=holding(game),raw=game&&holdings.get(game);return s?.visible?raw.guards.slice():[];}
  const glsl=`
uniform float uPrisonKind,uPrisonTexOn,uPrisonDoorMap;
uniform vec3 uPrisonBase;
uniform vec4 uPrisonDoorUV;
uniform sampler2D uPrisonPlaster,uPrisonSteel;
vec2 prisonProjection(vec3 p,vec3 n){
  vec3 a=abs(n);return a.y>a.x&&a.y>a.z?p.xz:a.x>a.z?p.zy:p.xy;
}
vec3 prisonSurface(vec3 original,vec3 world,vec3 normal){
  if(uPrisonKind<0.5)return original;
  float kind=uPrisonKind>4.5?uPrisonKind-4.0:uPrisonKind;
  vec3 p=world-uPrisonBase;vec2 uv=prisonProjection(p,normal);
  if(kind>3.5){
    float fibre=sin(p.y*58.0+sin(p.x*7.0+p.z*9.0)*0.7)*0.025;
    return max(original*(0.94+fibre),vec3(0.0));
  }
  if(kind>1.5&&kind<2.5){
    vec2 steelUV=uPrisonDoorMap>0.5?clamp((uv-uPrisonDoorUV.xy)*uPrisonDoorUV.zw,vec2(0.002),vec2(0.998)):uv*1.20;
    return uPrisonTexOn>0.5?pow(texture(uPrisonSteel,steelUV).rgb,vec3(2.2))*(uPrisonKind>4.5?1.65:1.0):original;
  }
  vec3 plaster=uPrisonTexOn>0.5?pow(texture(uPrisonPlaster,uv*(uPrisonKind>4.5?1.10:0.65)).rgb,vec3(2.2)):original;
  if(uPrisonKind>4.5)plaster=mix(plaster,vec3(dot(plaster,vec3(0.2126,0.7152,0.0722))),0.35);
  if(kind>2.5)return plaster*(uPrisonKind>4.5?vec3(0.78,0.78,0.75):vec3(0.62,0.63,0.60));
  if(uPrisonKind>4.5){
    float damp=1.0-smoothstep(0.0,0.80,p.y),cavity=1.0-step(0.06,dot(original,vec3(0.333333)));
    return plaster*mix(vec3(0.93,0.94,0.91)*(1.0-0.24*damp),vec3(0.045),cavity);
  }
  // Material height follows the same base as the actual cell, not the camera.
  float dado=1.0-smoothstep(1.27,1.31,p.y);
  vec3 upper=plaster*vec3(0.95,0.96,0.91);
  vec3 lower=plaster*vec3(0.17,0.21,0.18);
  float damp=1.0-smoothstep(0.0,0.55,p.y);
  return mix(upper,lower,dado)*(1.0-0.14*damp);
}
vec4 prisonLighting(vec4 original){
  if(uPrisonKind<0.5)return original;
  float kind=uPrisonKind>4.5?uPrisonKind-4.0:uPrisonKind;
  if(kind>1.5&&kind<2.5)return vec4(0.20,42.0,0.035,0.008);
  if(uPrisonKind>4.5)return vec4(0.0,18.0,0.0,0.0);
  return vec4(0.035,18.0,0.008,0.003);
}
`;
  root.PrisonDetail=Object.freeze({configure,prepare,ensure:prepare,decorate,instances,bind,kind,load,inspect,dispose,glsl,beginHolding,holding,inspectHolding,endHolding,holdingCamera,fieldInstances,fieldActors,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);
