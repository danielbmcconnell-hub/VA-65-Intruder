/* Aircraft-only geometry repairs, finish and shading normals. Markings,
 * external dimensions, collisions and flight data are retained.
 * Panel/rivet detail is evaluated in aircraft space and filtered to its actual
 * pixel footprint; it therefore stays on the airframe as it moves. */
(function(root){
  'use strict';
  const PAINT=Object.freeze(Object.assign(Object.create(null),{intruder:1,sandy:2,jolly:3,gear:4}));
  const ROTOR=Object.freeze(Object.assign(Object.create(null),{sandyDisc:1,jollyDisc:2}));
  const SMOOTH=new Set(['intruder','canopy','sandy','sandyGlass','jolly','jollyGlass','gear','sandyDisc','jollyDisc']);
  const records=new WeakMap(),geometryRecords=new WeakMap(),CREASE=Math.cos(Math.PI/4),EPS=1e-9;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const near=(a,b,e=1e-6)=>Math.abs(a-b)<e;
  const GULL=[.315,.335,.350],WHITE=[.80,.80,.78],DARK=[.055,.06,.065],GLASS=[.055,.085,.105];
  function sameColor(a,b){return a.every((v,i)=>near(v,b[i]));}
  function at(p,q){return p.every((v,i)=>near(v,q[i]));}
  function boxFace(points,centre,half){return points.every(p=>p.every((v,k)=>near(v,centre[k]-half[k])||near(v,centre[k]+half[k])));}
  // Clip a polygon against a half-space. This is used only for the painted
  // shell under a window, never for markings, glass, physical collision or flight.
  function half(poly,f,positive){
    if(poly.every(p=>Math.abs(f(p))<1e-8))return positive?poly.slice():[];
    const out=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],fa=f(a)*(positive?1:-1),fb=f(b)*(positive?1:-1),ia=fa>=-1e-8,ib=fb>=-1e-8;
      if(ia)out.push(a);
      if(ia!==ib){const t=fa/(fa-fb);out.push(a.map((v,k)=>v+(b[k]-v)*t));}
    }
    return out.filter((p,i)=>!i||!at(p,out[i-1],1e-8));
  }
  function subtract(poly,planes){
    let inside=poly;const outside=[];
    for(const f of planes){
      const a=half(inside,f,false);if(a.length>=3)outside.push(a);
      inside=half(inside,f,true);if(inside.length<3)break;
    }
    return outside;
  }
  function cockpitCells(sections,floor,ceiling=Infinity){
    return sections.slice(1).map((s,i)=>{const a=sections[i],slope=(s[1]-a[1])/(s[0]-a[0]),width=p=>a[1]+(p[2]-a[0])*slope;
      return [p=>p[1]-floor,p=>ceiling-p[1],p=>p[2]-a[0],p=>s[0]-p[2],p=>p[0]+width(p),p=>width(p)-p[0]];
    });
  }
  function inletCells(){
    return [-1,1].map(sg=>{
      const t=p=>(p[2]+5.145)/(.655),cx=p=>1.22+(1.04-1.22)*t(p),cy=p=>.02+(.01-.02)*t(p);
      const planes=[p=>p[2]+5.145,p=>-4.49-p[2]];
      for(let k=0;k<16;k++){const a=k/16*Math.PI*2;planes.push(p=>1-(sg*p[0]-cx(p))/.30*Math.cos(a)-(p[1]-cy(p))/.49*Math.sin(a));}
      return planes;
    });
  }
  function fan(points,centres){return centres.some(c=>points.some(p=>at(p,c))&&points.every(p=>near(p[2],c[2])));}
  function production(builder,name){
    if(!builder||typeof builder.tri!=='function'||typeof builder.loft!=='function'||!Array.isArray(builder.p)||!Array.isArray(builder.n)||!Array.isArray(builder.c)||!Array.isArray(builder.i)||builder.p.length<120||builder.p.length!==builder.n.length||builder.p.length!==builder.c.length||!builder.p.every(Number.isFinite)||!builder.i.every(i=>Number.isInteger(i)&&i>=0&&i<builder.p.length/3))return false;
    const p=builder.p.slice(0,3);
    return name==='intruder'?at(p,[.09,-.44,-8.70]) :
      name==='sandy'?at(p,[.70,.10,-5.92]) :
      name==='jolly'?at(p,[.42,.60,-8.20]) :
      name==='canopy'?at(p,[.38,.40,-6.42]) :
      name==='sandyGlass'?at(p,[.42,.86,-3.05]) :
      name==='jollyGlass'?at(p,[.40,.62,-8.16]) :
      name==='sandyDisc'?at(p,[2.055,.10,-6.27]) :
      name==='jollyDisc'?at(p,[9.44,2.148,-1.10]):false;
  }
  function curveSections(sections,steps=3){
    const result=[];
    const mix=(a,b,t)=>a+(b-a)*t;
    for(let i=0;i<sections.length-1;i++)for(let k=0;k<steps;k++){
      const t=k/steps,a=sections[i],b=sections[i+1],before=sections[Math.max(0,i-1)],after=sections[Math.min(sections.length-1,i+2)],next={z:mix(a.z,b.z,t)};
      for(const key of ['y','rx','ry']){
        const m0=(b[key]-before[key])/(b.z-before.z)*(b.z-a.z),m1=(after[key]-a[key])/(after.z-a.z)*(b.z-a.z);
        const v=(2*t*t*t-3*t*t+1)*a[key]+(t*t*t-2*t*t+t)*m0+(-2*t*t*t+3*t*t)*b[key]+(t*t*t-t*t)*m1;
        next[key]=clamp(v,Math.min(a[key],b[key]),Math.max(a[key],b[key]));
      }
      result.push(next);
    }
    result.push({...sections.at(-1)});return result;
  }
  const glazing={
    canopy:[{z:-6.42,y:.40,rx:.38,ry:.09},{z:-6.08,y:.68,rx:.70,ry:.30},{z:-5.74,y:.90,rx:.88,ry:.46},{z:-5.16,y:.97,rx:.99,ry:.54},{z:-4.38,y:.99,rx:1.02,ry:.58},{z:-3.70,y:.94,rx:.96,ry:.53},{z:-3.16,y:.84,rx:.76,ry:.39},{z:-2.70,y:.72,rx:.50,ry:.21}],
    sandyGlass:[{z:-3.05,y:.86,rx:.42,ry:.16},{z:-2.70,y:1.06,rx:.56,ry:.36},{z:-1.90,y:1.14,rx:.60,ry:.46},{z:-.85,y:1.10,rx:.58,ry:.42},{z:.05,y:.96,rx:.40,ry:.24}],
    jollyGlass:[{z:-8.16,y:.62,rx:.40,ry:.40},{z:-7.66,y:.46,rx:.84,ry:.74},{z:-6.95,y:.30,rx:1.16,ry:.96},{z:-6.30,y:.26,rx:1.26,ry:.92}]
  };
  function arch(m,z,y,rx,ry,col){
    const N=28;
    for(let i=0;i<N;i++){
      const a=i/N*Math.PI,b=(i+1)/N*Math.PI;
      const p=(th,dz,extra)=>[Math.cos(th)*(rx+extra),y+Math.sin(th)*(ry+extra),z+dz];
      m.quad(p(a,-.025,0),p(b,-.025,0),p(b,.025,0),p(a,.025,0),col);
      m.quad(p(a,-.025,.035),p(a,.025,.035),p(b,.025,.035),p(b,-.025,.035),col);
      m.quad(p(a,-.025,0),p(a,-.025,.035),p(b,-.025,.035),p(b,-.025,0),col);
      m.quad(p(a,.025,0),p(b,.025,0),p(b,.025,.035),p(a,.025,.035),col);
    }
  }
  function aperture(m,cx,cy,z,rx,ry,ix,iy,col,rear=false){
    const N=32,point=(a,inner)=>[cx+Math.cos(a)*(inner?ix:rx),cy+Math.sin(a)*(inner?iy:ry),z+(inner?(rear?-.045:.045):0)];
    for(let k=0;k<N;k++){
      const a=k/N*Math.PI*2,b=(k+1)/N*Math.PI*2;
      if(rear)m.quad(point(a,false),point(b,false),point(b,true),point(a,true),col);
      else m.quad(point(a,false),point(a,true),point(b,true),point(b,false),col);
    }
  }
  function innerLoft(m,sections,col,segments=32,front=true){
    const start=m.i.length,nStart=m.n.length;m.loft(sections,col,segments,false,true);
    if(front){for(let t=start;t<m.i.length;t+=3){const v=m.i[t+1];m.i[t+1]=m.i[t+2];m.i[t+2]=v;}for(let i=nStart;i<m.n.length;i++)m.n[i]*=-1;}
  }
  function helmet(m,x,y,z,scale=1){
    const shell=[.78,.78,.76],visor=[.075,.078,.073],mask=[.10,.115,.12];
    m.blob(x,y,z+.015*scale,.185*scale,.195*scale,.245*scale,shell,24,12);
    for(let row=0;row<3;row++)for(let k=0;k<20;k++){
      const a=-1.12+k/20*2.24,b=-1.12+(k+1)/20*2.24;
      const ya=(-.025+row*.040)*scale,yb=ya+.040*scale;
      const point=(a,h)=>{const s=Math.sqrt(Math.max(0,1-(h/(.195*scale))**2));return [x+Math.sin(a)*.190*scale*s,y+h,z+.015*scale-Math.cos(a)*.253*scale*s];};
      m.quad(point(a,ya),point(a,yb),point(b,yb),point(b,ya),visor);
    }
    m.blob(x,y-.115*scale,z-.210*scale,.110*scale,.082*scale,.090*scale,mask,16,8);
    for(const sg of [-1,1])m.blob(x+sg*.17*scale,y-.015*scale,z+.04*scale,.035*scale,.080*scale,.09*scale,shell,12,8);
  }
  function rotorDisc(m,axis,centre,radius,segments){
    const point=a=>axis==='y'?[centre[0]+Math.cos(a)*radius,centre[1],centre[2]+Math.sin(a)*radius]:
      axis==='z'?[centre[0]+Math.cos(a)*radius,centre[1]+Math.sin(a)*radius,centre[2]]:
      [centre[0],centre[1]+Math.sin(a)*radius,centre[2]+Math.cos(a)*radius];
    for(let k=0;k<segments;k++){
      const a=point(k/segments*Math.PI*2),b=point((k+1)/segments*Math.PI*2);
      if(axis==='y'||axis==='z')m.tri(centre,b,a,[.30,.31,.32]);else m.tri(centre,a,b,[.30,.31,.32]);
    }
  }
  function interior(m,name){
    const rubber=[.032,.037,.038],cloth=[.16,.17,.13],strap=[.36,.34,.25],metal=[.20,.21,.21];
    if(name==='intruder'){
      m.box(0,.16,-4.55,.88,.06,1.35,rubber);
      m.box(0,.70,-5.44,.82,.17,.08,DARK);
      for(const sg of [-1,1]){
        const x=sg*.52,z=sg<0?-4.892:-4.56,y=sg<0?.894:.84,seatZ=sg<0?-4.30:-4.10;
        helmet(m,x,y,z);
        m.box(x,.28,seatZ+.03,.28,.055,.36,cloth);
        m.tube([{p:[x,.30,seatZ+.42],r:.27,rv:.13},{p:[x,.77,seatZ+.37],r:.23,rv:.12},{p:[x,.99,seatZ+.30],r:.15,rv:.09}],cloth,12);
        m.tube([{p:[x-.105,y-.10,z-.20],r:.025},{p:[x-.12,y-.23,z-.08],r:.024},{p:[x-.12,y-.34,z+.08],r:.022}],rubber,8);
        m.tube([{p:[x-.18,.83,z+.47],r:.022},{p:[x-.11,.72,z+.09],r:.022},{p:[x+.10,.65,z+.10],r:.022}],strap,8);
        m.box(x,.61,-5.29,.25,.12,.05,metal);
        m.box(x,.64,-5.35,.10,.07,.012,[.025,.10,.065]);
      }
      m.tube([{p:[0,.505,-6.42],r:.027},{p:[0,.995,-6.08],r:.027},{p:[0,1.38,-5.74],r:.027}],GULL,12);
      // The openings have a dark recessed end wall, not a floating black disc.
      for(const sg of [-1,1]){
        m.loft([{x:sg*1.22,z:-5.16,y:.02,rx:.38,ry:.58},{x:sg*1,z:-4.95,y:.02,rx:.40,ry:.56}],GULL,32,false,false,WHITE);
        aperture(m,sg*1.22,.02,-5.16,.38,.58,.30,.49,GULL);
        innerLoft(m,[{x:sg*1.22,z:-5.105,y:.02,rx:.30,ry:.487},{x:sg*1.04,z:-4.49,y:.01,rx:.285,ry:.415}],rubber);
        aperture(m,sg*1.01,-.31,2.30,.33,.37,.265,.30,metal,true);
        innerLoft(m,[{x:sg*1.01,z:2.295,y:-.31,rx:.265,ry:.30},{x:sg*.98,z:1.70,y:-.28,rx:.22,ry:.26}],rubber,32,false);
        for(let k=0;k<6;k++){const z=1.98+k*.065;m.loft([{x:sg*1.01,z,y:-.31,rx:.329,ry:.369},{x:sg*1.01,z:z+.016,y:-.31,rx:.329,ry:.369}],metal,24,false,false);}
        const hull=z=>{const t=(z-1.8)/(3.2-1.8);return {rx:.90+(.72-.90)*t,ry:.95+(.78-.95)*t,y:.02+(.05-.02)*t};};
        const point=(z,y)=>{const h=hull(z);return [sg*(h.rx*Math.sqrt(Math.max(.01,1-((y-h.y)/h.ry)**2))+.006),y,z];};
        for(let k=0;k<8;k++){const z=2.35+k*.16,b=z+.16,a=point(z,-.55),c=point(b,-.05),d=point(z,-.05),e=point(b,-.55);if(sg>0)m.quad(a,d,c,e,[.085,.080,.075]);else m.quad(a,e,c,d,[.085,.080,.075]);}
      }
    }else if(name==='sandy'){
      m.box(0,.73,-1.65,.49,.045,.98,rubber);
      m.box(0,.85,-2.54,.40,.10,.07,DARK);
      helmet(m,0,1.01,-1.90,.86);
      aperture(m,0,.10,-6.08,.78,.78,.60,.60,[.20,.21,.22]);
      innerLoft(m,[{z:-6.035,y:.10,rx:.60,ry:.60},{z:-5.58,y:.10,rx:.52,ry:.52}],rubber);
      for(let row=0;row<2;row++)for(let k=0;k<9;k++){
        const a=(k+row*.5)*Math.PI*2/9,r=.40;
        m.cyl(Math.cos(a)*r,.10+Math.sin(a)*r,-5.86+row*.13,.10,.10,row?rubber:metal,12,'z');
      }
      arch(m,-2.70,1.06,.58,.38,GULL);arch(m,-.85,1.10,.60,.44,GULL);
    }else if(name==='jolly'){
      m.box(0,-.65,-2.2,1.24,.045,4.3,rubber);
      m.box(0,.40,-7.02,.96,.15,.10,DARK);
      for(const sg of [-1,1]){
        const x=sg*.60;
        m.box(x,.10,-6.18,.29,.35,.12,cloth);
        m.tube([{p:[x,-.16,-6.48],r:.25,rv:.20},{p:[x,.15,-6.58],r:.27,rv:.20}],cloth,12);
        m.blob(x,.65,-6.68,.185,.20,.19,[.60,.60,.56],20,12);
        m.box(x,.66,-6.84,.145,.075,.025,[.07,.08,.07]);
        m.tube([{p:[x-.18,.22,-6.56],r:.025},{p:[x+.12,-.10,-6.66],r:.025}],strap,8);
      }
      // Thin windscreen mullions and visible cabin seat benches.
      m.tube([{p:[0,.34,-8.12],r:.027},{p:[0,1.12,-7.05],r:.027},{p:[0,1.18,-6.32],r:.027}],metal,8);
      for(const sg of [-1,1])m.box(sg*1.05,-.26,-1.40,.18,.045,2.9,cloth);
      const stations=[[-7.7,.42,.86,.78],[-6.9,.22,1.22,1.06],[-5.6,.06,1.46,1.26],[-3.6,0,1.52,1.34],[-1.2,0,1.52,1.34],[1,.04,1.46,1.28],[2.6,.14,1.28,1.10]];
      for(let k=1;k<stations.length;k++)for(let j=0;j<8;j++){
        const point=(s,j)=>{const a=Math.PI*(1.18+j/8*.64);return [Math.cos(a)*s[2],s[1]+Math.sin(a)*s[3]-.008,s[0]];};
        m.quad(point(stations[k-1],j),point(stations[k-1],j+1),point(stations[k],j+1),point(stations[k],j),[.1488,.1552,.1504]);
      }
    }
  }
  function repair(builder,name){
    if(!production(builder,name)||geometryRecords.has(builder))return null;
    const before={vertices:builder.p.length/3,triangles:builder.i.length/3},report={name,...before,removedCapTriangles:0,removedRotorTriangles:0,openedShellTriangles:0,addedDetailTriangles:0,glazingSegments:0};
    if(ROTOR[name]){
      // A closed wafer blends both caps when depth-writes and culling are off.
      // One two-sided surface represents one physical rotor exposure.
      builder.p=[];builder.n=[];builder.c=[];builder.i=[];
      if(name==='sandyDisc')rotorDisc(builder,'z',[0,.10,-6.26],2.055,48);
      else{rotorDisc(builder,'y',[0,2.16,-1.10],9.44,48);rotorDisc(builder,'x',[-.46,2.62,8.86],1.60,32);}
      report.singleSurface=true;
    }else if(glazing[name]){
      const old=builder.p.length/3;
      const side=name==='jollyGlass'?{p:builder.p.slice(468),n:builder.n.slice(468),c:builder.c.slice(468),i:builder.i.filter(i=>i>=156).map(i=>i-156)}:null;
      builder.p=[];builder.n=[];builder.c=[];builder.i=[];
      builder.loft(curveSections(glazing[name]),GLASS,32,false,false);
      if(side&&side.p.length){const offset=builder.p.length/3;builder.p.push(...side.p);builder.n.push(...side.n);builder.c.push(...side.c);builder.i.push(...side.i.map(i=>i+offset));}
      report.glazingSegments=32;report.originalGlazingVertices=old;
    }else{
      const original=builder.i.slice(),kept=[],added=[],centres=[];
      if(name==='intruder'){
        for(const sg of [-1,1])for(const z of [-5.16,-4.95])centres.push([sg*1,.02,z]);
        for(const sg of [-1,1]){centres.push([sg*1.02,-.26,1.85]);centres.push([sg*1.01,-.31,2.30]);}
        for(const [z,y]of [[-5.74,.90],[-4.36,.99],[-2.70,.72]])for(const dz of [-.035,.035])centres.push([0,y,z+dz]);
      }else if(name==='sandy')for(const z of [-6.08,-5.92])centres.push([0,.10,z]);
      const cells=name==='intruder'?cockpitCells([[-6.18,.58],[-5.74,.84],[-5.16,.94],[-4.38,.97],[-3.70,.90],[-3.16,.70],[-2.80,.43]],.59):
        name==='sandy'?cockpitCells([[-2.98,.31],[-2.70,.48],[-1.90,.56],[-.85,.53],[-.04,.31]],.76):[];
      const sideWindows=name==='jolly'?[-5.2,-3.3,-1.6].map((z,i)=>cockpitCells([[z-(i?.60:.68),1.9],[z+(i?.60:.68),1.9]],i?-.20:-.10,i?.54:.70)[0]):[];
      const frontWindow=name==='jolly'?cockpitCells([[-8.18,1.9],[-6.31,1.9]],.31):[];
      for(let t=0;t<original.length;t+=3){
        const ids=original.slice(t,t+3),points=ids.map(i=>builder.p.slice(i*3,i*3+3)),color=builder.c.slice(ids[0]*3,ids[0]*3+3);
        if(fan(points,centres)){report.removedCapTriangles++;continue;}
        if(name==='intruder'&&sameColor(color,GULL)&&points.every(p=>near(p[2],-5.16)||near(p[2],-4.95))&&points.every(p=>Math.abs(p[0])>.55&&Math.abs(p[0])<1.45&&p[1]>-.57&&p[1]<.61))continue;
        if(name==='intruder'&&sameColor(color,[.045,.05,.055])&&points.every(p=>p[2]>=-5.120001&&p[2]<=-4.499999))continue;
        if(name==='intruder'&&sameColor(color,GULL)&&boxFace(points,[0,1.12,-6.04],[.032,.34,.38]))continue;
        if(name==='intruder'&&points.every(p=>Math.abs(p[0])<.90&&p[1]>.35&&p[2]>-5.2&&p[2]<-3.4)&&[[.78,.78,.76],[.10,.09,.08],[.11,.12,.13],[.17,.18,.16]].some(c=>sameColor(c,color)))continue;
        if(name==='intruder'&&sameColor(color,[.17,.18,.16])&&(boxFace(points,[.52,.64,-3.78],[.31,.44,.19])||boxFace(points,[-.52,.70,-3.96],[.31,.44,.19])))continue;
        if(name==='intruder'&&sameColor(color,[.17,.16,.15])&&points.every(p=>p[2]>=2.259999&&p[2]<=2.460001))continue;
        if(name==='intruder'&&sameColor(color,[.085,.080,.075])&&[-1,1].some(sg=>boxFace(points,[sg*1,-.30,2.95],[.045,.30,.72])))continue;
        if(name==='sandy'&&sameColor(color,[.78,.78,.76])&&points.every(p=>Math.abs(p[0])<.2&&p[2]>-2.1&&p[2]<-1.6))continue;
        if(name==='jolly'&&((sameColor(color,[.186,.194,.188])&&boxFace(points,[0,-1.22,-2.40],[1.30,.14,4.60]))||(sameColor(color,[.1488,.1552,.1504])&&[-1,1].some(sg=>boxFace(points,[sg*1.34,-.96,-2.40],[.22,.09,4.80])))))continue;
        const sandyBlade=name==='sandy'&&((sameColor(color,[.10,.10,.10])&&points.every(p=>Math.abs(p[2]+6.26)<=.035001))||(sameColor(color,[.52,.40,.06])&&points.every(p=>Math.abs(p[2]+6.26)<=.038001)));
        const jollyBlade=name==='jolly'&&sameColor(color,[.070,.070,.068])&&(points.every(p=>p[1]>1.94&&p[1]<2.20)||points.every(p=>Math.abs(p[0]+.46)<=.026001));
        if(sandyBlade||jollyBlade){report.removedRotorTriangles++;continue;}
        if(name==='sandy'&&sameColor(color,GULL)&&[-2.70,-.85].some(z=>points.every(p=>Math.abs(p[0])<=.600001&&p[1]>=1.109999&&p[1]<=1.210001&&Math.abs(p[2]-z)<=.050001)))continue;
        const core=name==='intruder'?ids.every(i=>i>=432&&i<1248):name==='sandy'?ids.every(i=>i<504):ids.every(i=>i<448);
        let volumes=core?cells.slice():[];
        if(core&&name==='intruder')volumes.push(...inletCells());
        if(name==='jolly'){
          const skin=[GULL,WHITE,[.252,.196,.104],[.124,.166,.088],[.068,.094,.058],[.186,.194,.188]].some(c=>sameColor(c,color));
          volumes=core?frontWindow.slice():[];if(skin)volumes.push(...sideWindows);
        }
        let polys=[points];
        for(const volume of volumes)polys=polys.flatMap(poly=>subtract(poly,volume));
        if(polys.length===1&&polys[0].length===3&&polys[0].every((p,i)=>at(p,points[i]))){kept.push(...ids);continue;}
        report.openedShellTriangles++;
        for(const poly of polys)for(let k=1;k<poly.length-1;k++){
          const a=poly[0],b=poly[k],c=poly[k+1],u=b.map((v,j)=>v-a[j]),v=c.map((n,j)=>n-a[j]);
          if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-10)continue;
          const start=builder.i.length;builder.tri(poly[0],poly[k],poly[k+1],color);
          added.push(...builder.i.slice(start));
        }
      }
      builder.i=kept.concat(added);
      const beforeDetail=builder.i.length;interior(builder,name);report.addedDetailTriangles=(builder.i.length-beforeDetail)/3;
    }
    report.resultVertices=builder.p.length/3;report.resultTriangles=builder.i.length/3;geometryRecords.set(builder,report);return report;
  }
  function kind(name){return PAINT[name]||0;}
  function rotorKind(name){return ROTOR[name]||0;}
  function detailWeight(distance,footprint,quality){
    if(![distance,footprint,quality].every(Number.isFinite)||distance<0||footprint<0)return 0;
    const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    return (1-smooth(45,quality<.5?180:420,distance))*(1-smooth(.012,.055,footprint));
  }
  function refineNormals(builder,name){
    if(!builder||!SMOOTH.has(name)||records.has(builder)||!Array.isArray(builder.p)||!Array.isArray(builder.n)||!Array.isArray(builder.i)||builder.p.length!==builder.n.length||builder.p.length%3||builder.i.length%3)return builder;
    const count=builder.p.length/3,old=builder.n.slice(),weighted=new Float64Array(builder.p.length),groups=new Map();
    for(let i=0;i<count;i++){
      const o=i*3,p=builder.p.slice(o,o+3),n=old.slice(o,o+3);
      if(!p.every(Number.isFinite)||!n.every(Number.isFinite))return builder;
      const key=p.map(v=>Math.round(v*100000)).join(',');let group=groups.get(key);if(!group){group=[];groups.set(key,group);}group.push(i);
    }
    // Area and corner-angle weights keep elongated loft strips from favouring
    // repeated diagonal corners. Existing face normals define each crease.
    for(let k=0;k<builder.i.length;k+=3){
      const ids=builder.i.slice(k,k+3);if(!ids.every(i=>Number.isInteger(i)&&i>=0&&i<count))return builder;
      const a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,p=builder.p,ab=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],ac=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]];
      const area=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);
      if(!Number.isFinite(area)||area<EPS)continue;
      for(let corner=0;corner<3;corner++){
        const id=ids[corner],o=id*3,a=ids[(corner+1)%3]*3,b=ids[(corner+2)%3]*3;
        const u=[p[a]-p[o],p[a+1]-p[o+1],p[a+2]-p[o+2]],v=[p[b]-p[o],p[b+1]-p[o+1],p[b+2]-p[o+2]],den=Math.hypot(...u)*Math.hypot(...v);
        const angle=den>EPS?Math.acos(clamp((u[0]*v[0]+u[1]*v[1]+u[2]*v[2])/den,-1,1)):0;
        for(let j=0;j<3;j++)weighted[o+j]+=old[o+j]*area*angle;
      }
    }
    const result=old.slice();let changed=0;
    for(const group of groups.values())for(const id of group){
      const o=id*3,n=old.slice(o,o+3),length=Math.hypot(...n);if(length<EPS)continue;let x=0,y=0,z=0;
      for(const other of group){const q=other*3,mLength=Math.hypot(old[q],old[q+1],old[q+2]);if(mLength<EPS)continue;const dot=(n[0]*old[q]+n[1]*old[q+1]+n[2]*old[q+2])/(length*mLength);if(dot<CREASE)continue;x+=weighted[q];y+=weighted[q+1];z+=weighted[q+2];}
      const total=Math.hypot(x,y,z);if(total<EPS)continue;const next=[x/total,y/total,z/total];if(Math.hypot(next[0]-n[0],next[1]-n[1],next[2]-n[2])>1e-6)changed++;
      for(let j=0;j<3;j++)result[o+j]=next[j];
    }
    for(let i=0;i<result.length;i++)builder.n[i]=result[i];
    const geometry=geometryRecords.get(builder);
    records.set(builder,{name,vertices:count,triangles:builder.i.length/3,smoothedVertices:changed,creaseDegrees:45,positionsChanged:!!geometry,colorsChanged:!!geometry,indicesChanged:!!geometry,geometry:geometry?{...geometry}:null});
    return builder;
  }
  function refine(builder,name){if(!builder||!SMOOTH.has(name)||records.has(builder))return builder;repair(builder,name);return refineNormals(builder,name);}
  function inspect(builder){const s=builder&&records.get(builder);return s?{...s}:null;}
  const rotorGLSL=`
// Exposure-averaged running rotors. This low-contrast texture phase is
// presentation shimmer, not a claim to resolve physical blade RPM at 60 FPS.
vec4 rotorMotion(vec3 local,vec3 world,vec3 normal,float kind,float time){
  vec2 uv;float blades,opacity,phase;
  if(kind<1.5){uv=vec2(local.x,local.y-0.10)/2.055;blades=4.0;opacity=0.135;phase=time*1.7;}
  else{
    // Local derivatives retain the correct main/tail plane under any bank,
    // yaw or translation of the whole helicopter instance.
    vec3 ln=normalize(cross(dFdx(local),dFdy(local)));
    bool tail=abs(ln.x)>0.6;
    uv=tail?vec2(local.z-8.86,local.y-2.62)/1.60:vec2(local.x,local.z+1.10)/9.44;
    blades=5.0;opacity=tail?0.145:0.090;phase=time*1.2;
  }
  float radius=length(uv),footprint=max(length(dFdx(uv)),length(dFdy(uv)));
  float inner=smoothstep(0.075,0.16,radius),outer=1.0-smoothstep(0.88,1.0,radius);
  float angle=radius>0.00001?atan(uv.y,uv.x):0.0;
  float textureFade=1.0-smoothstep(0.01,0.06,footprint);
  float streak=sin(angle*blades-phase)*0.006*textureFade;
  float band=sin(radius*18.0)*0.004*textureFade;
  float alpha=clamp((opacity+streak+band)*inner*outer,0.0,0.18);
  return vec4(vec3(0.048,0.052,0.050),alpha);
}
`;
  const glsl=`
uniform float uAircraftKind;
float aircraftDetailWeight(float distanceToEye,float pixelFootprint,float quality){
  return (1.0-smoothstep(45.0,quality<0.5?180.0:420.0,distanceToEye))
       * (1.0-smoothstep(0.012,0.055,pixelFootprint));
}
float aircraftLine(float coordinate,float spacing,float width){
  float edge=abs(mod(coordinate+spacing*0.5,spacing)-spacing*0.5);
  float aa=max(fwidth(coordinate),0.0003);
  return 1.0-smoothstep(width-aa,width+aa,edge);
}
vec2 aircraftProjection(vec3 local,vec3 normal){
  vec3 n=abs(normal);
  return n.y>n.x&&n.y>n.z?local.xz:n.x>n.z?local.zy:local.xy;
}
float aircraftPaintMask(vec3 local,vec3 alb){
  float brightness=dot(alb,vec3(0.333333));
  float chroma=max(max(alb.r,alb.g),alb.b)-min(min(alb.r,alb.g),alb.b);
  float mask=smoothstep(0.07,0.18,brightness)*(1.0-smoothstep(0.12,0.24,chroma));
  // Fibreglass radome, occupied cockpit, tyres and painted markings retain
  // their own material instead of receiving fictitious rivets.
  if(uAircraftKind<1.5&&(local.z< -6.28||(abs(local.x)<1.05&&local.y>0.4&&local.z> -5.9&&local.z< -2.4)))mask=0.0;
  if(uAircraftKind>1.5&&uAircraftKind<2.5&&abs(local.x)<0.65&&local.y>0.70&&local.z> -3.1&&local.z<0.15)mask=0.0;
  if(uAircraftKind>2.5&&uAircraftKind<3.5&&abs(local.x)<1.05&&local.y>0.15&&local.z> -7.2&&local.z< -5.9)mask=0.0;
  if(uAircraftKind>3.5)mask=0.0;
  return mask;
}
vec3 aircraftPaint(vec3 alb,vec3 local,vec3 normal,float distanceToEye,float quality){
  if(uAircraftKind<0.5)return alb;
  vec2 uv=aircraftProjection(local,normal);
  float footprint=max(length(dFdx(uv)),length(dFdy(uv)));
  float detail=aircraftDetailWeight(distanceToEye,footprint,quality),mask=aircraftPaintMask(local,alb);
  vec2 spacing=uAircraftKind<1.5?vec2(0.92,0.64):uAircraftKind<2.5?vec2(0.88,0.71):vec2(1.10,0.78);
  float seamU=aircraftLine(uv.x,spacing.x,0.0024),seamV=aircraftLine(uv.y,spacing.y,0.0024);
  float seams=max(seamU,seamV);
  // Millimetre-scale fasteners vanish before they become a screen pattern.
  float rivetAA=max(footprint,0.0004),rivetFine=1.0-smoothstep(0.002,0.010,footprint);
  float rivetAlongU=1.0-smoothstep(0.002-rivetAA,0.002+rivetAA,abs(mod(uv.x+0.06,0.12)-0.06));
  float rivetAlongV=1.0-smoothstep(0.002-rivetAA,0.002+rivetAA,abs(mod(uv.y+0.06,0.12)-0.06));
  float rivets=max(rivetAlongU*aircraftLine(uv.y,spacing.y,0.008),rivetAlongV*aircraftLine(uv.x,spacing.x,0.008))*rivetFine;
  float broad=vnoise(uv*0.33+vec2(19.7,6.1)),grain=vnoise(uv*31.0);
  float finish=1.0+(broad-0.5)*0.046+(grain-0.5)*0.010*rivetFine-seams*0.105-rivets*0.075;
  return max(alb*mix(1.0,finish,mask*detail),vec3(0.0));
}
vec3 aircraftNormal(vec3 normal,vec3 world,vec3 local,vec3 localNormal,float distanceToEye,float quality){
  vec2 uv=aircraftProjection(local,localNormal);
  float footprint=max(length(dFdx(uv)),length(dFdy(uv)));
  float weight=aircraftDetailWeight(distanceToEye,footprint,quality);
  if(uAircraftKind<0.5)return normal;
  // Tiny paint tooth in aircraft space. Screen derivatives transform the
  // surface gradient without changing geometric normals or any silhouette.
  float height=vnoise(uv*18.0)*0.00010*weight;
  vec3 dx=dFdx(world),dy=dFdy(world),r1=cross(dy,normal),r2=cross(normal,dx);
  vec2 slope=vec2(dFdx(height),dFdy(height));
  float det=dot(dx,r1);if(abs(det)<0.0000001)return normal;
  vec3 gradient=sign(det)*(slope.x*r1+slope.y*r2);
  return normalize(abs(det)*normal-gradient);
}
vec4 aircraftLighting(vec3 alb){
  // Default exactly preserves non-aircraft lighting. Painted military skin
  // has a broad restrained sheen, unlike lacquered scenery or chrome.
  if(uAircraftKind<0.5)return vec4(1.0,46.0,0.30,0.18);
  if(uAircraftKind<1.5)return vec4(0.48,62.0,0.105,0.050);
  if(uAircraftKind<2.5)return vec4(0.37,46.0,0.080,0.040);
  if(uAircraftKind<3.5)return vec4(0.26,34.0,0.055,0.028);
  float bright=smoothstep(0.10,0.28,dot(alb,vec3(0.333333)));
  return mix(vec4(0.09,24.0,0.025,0.020),vec4(0.90,105.0,0.18,0.045),bright);
}
`;
  root.AircraftDetail=Object.freeze({kind,rotorKind,rotorGLSL,refine,refineNormals,inspect,detailWeight,glsl});
})(typeof window!=='undefined'?window:globalThis);
