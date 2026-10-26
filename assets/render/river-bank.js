/* Visual river shores, based on the preserved river-and-swamp references.
 * The old movement boundary at 14.5m and its +.35m walking floor stay exact.
 * Only the submerged toe, shore surfaces and non-solid plants change here. */
(function(root){
  'use strict';
  const C=Object.freeze({zMin:-106,zMax:166,zStep:2,walkEdge:14.5,walkY:.35,outer:65,maxPlants:64,maxRoots:28,maxReeds:44});
  const states=new WeakMap(),renderers=new WeakMap();let MB=null,makeProgram=null,glsl='';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  function configure(o){if(!o||typeof o.MB!=='function')return false;MB=o.MB;if(typeof o.program==='function')makeProgram=o.program;if(typeof o.glsl==='string')glsl=o.glsl;return true;}
  function profile(side,z){
    side=side<0?-1:1;
    const toe=12.35+.43*Math.sin(z*.073+side*1.9)+.21*Math.sin(z*.219-side*.7),waterline=toe+(C.walkEdge-toe)*.49;
    return {toe,shoulder:C.walkEdge,waterline,height:C.walkY,points:[[toe,-.35],[waterline,0],[C.walkEdge,C.walkY],[16.4,C.walkY],[21,C.walkY],[31,C.walkY],[47,C.walkY],[C.outer,C.walkY]]};
  }
  function buildBank(Builder,side,offset=0){
    const m=new Builder();let quads=0,minWaterline=Infinity,maxWaterline=-Infinity;
    for(let z=C.zMin;z<C.zMax;z+=C.zStep){
      const a=profile(side,z+offset),b=profile(side,z+C.zStep+offset);minWaterline=Math.min(minWaterline,a.waterline,b.waterline);maxWaterline=Math.max(maxWaterline,a.waterline,b.waterline);
      for(let n=0;n<a.points.length-1;n++){
        const tone=.94+.055*Math.sin((z+offset)*.173+n*.8+side),wet=n===0?.67:n===1?.79:1,col=[.26*tone*wet,.225*tone*wet,.164*tone*wet];
        const p=[side*a.points[n][0],a.points[n][1],z],q=[side*b.points[n][0],b.points[n][1],z+C.zStep],r=[side*b.points[n+1][0],b.points[n+1][1],z+C.zStep],s=[side*a.points[n+1][0],a.points[n+1][1],z];
        if(side>0)m.quad(p,q,r,s,col);else m.quad(s,r,q,p,col);quads++;
      }
    }
    m.bank={side,streamOffset:offset,rows:(C.zMax-C.zMin)/C.zStep+1,triangles:quads*2,verticalFaces:0,collisionSolids:0,walkEdge:C.walkEdge,walkY:C.walkY,waterline:[minWaterline,maxWaterline]};return m;
  }
  const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,n)=>a.map(v=>v*n),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>mul(a,1/(Math.hypot(...a)||1));
  function tube(m,a,b,r0,r1,col){
    const d=norm(b.map((v,i)=>v-a[i])),u=norm(cross(d,Math.abs(d[1])<.9?[0,1,0]:[1,0,0])),v=cross(d,u),p=(at,r,t)=>add(at,add(mul(u,Math.cos(t)*r),mul(v,Math.sin(t)*r)));
    for(let n=0;n<6;n++)m.quad(p(a,r0,n*Math.PI/3),p(a,r0,(n+1)*Math.PI/3),p(b,r1,(n+1)*Math.PI/3),p(b,r1,n*Math.PI/3),col);
  }
  function rootMesh(Builder,variant){
    const m=new Builder(),col=[.205,.15,.092];
    // Splayed roots follow the slope into the water, rather than hover at it.
    for(let n=0;n<6;n++){
      const z=(n-2.5)*.31,a=[1.2,.35,z*.35],b=[.48,.27,z*.8],c=[-.30,-.12,z*1.2];
      b[2]+=.17*Math.sin(n*2+variant);c[0]-=.14*(n%3);tube(m,a,b,.09,.055,col);tube(m,b,c,.055,.018,col);
      if(n%2===variant%2)tube(m,b,[b[0]+.16,.05,b[2]+.45],.036,.009,col);
    }return m;
  }
  function reedMesh(Builder,variant){
    const m=new Builder();
    for(let n=0;n<12;n++){
      const a=n*2.399+variant*.73,h=.65+(n%5)*.18,lean=.18+(n%4)*.075,base=[Math.cos(a)*.22,-.03,Math.sin(a)*.22],wide=[-Math.sin(a)*.022,0,Math.cos(a)*.022],bend=[Math.cos(a)*lean,0,Math.sin(a)*lean],col=n%4===0?[.29,.30,.12]:[.13+n%3*.018,.225+n%3*.019,.076];
      let p=base;for(let k=1;k<=3;k++){const t=k/3,q=add(base,add(mul(bend,t*t),[0,h*t,0])),w=mul(wide,1-t*.88),pWide=mul(wide,1-(k-1)/3*.88),quad=[add(p,pWide),add(p,mul(pWide,-1)),add(q,mul(w,-1)),add(q,w)];m.quad(...quad,col);m.quad(...quad.slice().reverse(),col);p=q;}
    }return m;
  }
  function retireMesh(r,name){
    const m=r.meshes?.[name],g=r.gl;if(!m||!g||typeof g.getVertexAttrib!=='function')return;
    const old=g.getParameter(g.VERTEX_ARRAY_BINDING);g.bindVertexArray(m.vao);const buffers=new Set([m.inst,g.getParameter(g.ELEMENT_ARRAY_BUFFER_BINDING)]);for(const i of[0,1,2])buffers.add(g.getVertexAttrib(i,g.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING));g.bindVertexArray(old===m.vao?null:old);for(const b of buffers)if(b)g.deleteBuffer(b);g.deleteVertexArray(m.vao);delete r.meshes[name];
  }
  function material(r,s){
    if(s.program)return s.program;if(!makeProgram||!glsl||!root.EpisodeGLSL)return null;
    s.program=makeProgram(r.gl,`layout(location=0)in vec3 aP;layout(location=1)in vec3 aN;layout(location=2)in vec3 aC;layout(location=3)in mat4 iM;layout(location=7)in vec4 iC;uniform mat4 uVP;out vec3 vW,vN,vC;void main(){vec4 w=iM*vec4(aP,1.);vW=w.xyz;vN=normalize(mat3(iM)*aN);vC=aC*iC.rgb;gl_Position=uVP*w;}`,glsl+root.EpisodeGLSL+`in vec3 vW,vN,vC;uniform sampler2D uBankFloor;uniform vec3 uCam;uniform float uBankWater;out vec4 o;void main(){vec3 n=normalize(vN);vec2 uv=vW.xz/3.7;vec3 photo=texture(uBankFloor,fract(uv)).rgb;float upper=smoothstep(.06,.34,vW.y-uBankWater),shade=dot(photo,vec3(.299,.587,.114));vec3 soil=vC*(.84+clamp(shade-.25,-.10,.24));vec3 alb=mix(soil,pow(max(photo,vec3(.001)),vec3(2.2))*.65,.30*upper);vec3 light=uEpisodeOn>.5?uEpisodeAmbient+episodeLight(vW,n):mix(uGround,uAmb*2.05,.85)+uSunCol*max(dot(n,uSunDir),0.);vec3 col=alb*light;if(uEpisodeOn>.5)o=vec4(episodeFog(col,vW,uCam),1.);else o=vec4(applyFog(col,vW,uCam),1.);}`);return s.program;
  }
  function installRenderer(r){
    let s=renderers.get(r);if(s)return s;s={offset:null,program:null,draws:0,photographicDraws:0};renderers.set(r,s);
    if(typeof r.drawMesh==='function'){const original=r.drawMesh;r.drawMesh=function(name,data,count){
      if(!/^powRiverBank(?:Left|Right)$/.test(name)||!count)return original.call(this,name,data,count);
      s.draws+=count;const T=root.JungleScenery?.floorTexture(this),p=T&&material(this,s);if(!p)return original.call(this,name,data,count);
      const g=this.gl,previous=this.pMesh,active=g.getParameter(g.ACTIVE_TEXTURE);g.activeTexture(g.TEXTURE0);const texture=g.getParameter(g.TEXTURE_BINDING_2D);
      try{this.pMesh=p;g.useProgram(p);g.bindTexture(g.TEXTURE_2D,T.tex);g.uniform1i(p.u.uBankFloor,0);g.uniform3fv(p.u.uCam,this.eye);g.uniform1f(p.u.uBankWater,s.waterY||0);s.photographicDraws+=count;return original.call(this,name,data,count);}
      finally{this.pMesh=previous;g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,texture);g.activeTexture(active);}
    };}return s;
  }
  function build(game){
    const r=game?.rend||game?.app?.rend,river=game?.pow?.river,b=game?.pow?.base,Builder=MB||root.POW?.ctx?.MB;if(!r||!river||!b||!Builder||typeof r.meshFromBuilder!=='function'||river.phase==='gulf')return false;
    const s=installRenderer(r),offset=Number.isFinite(river.streamOffset)?river.streamOffset:0,x=b[0]+94,y=river.waterY,z0=b[2];s.waterY=y;
    const names=['powRiverBankLeft','powRiverBankRight'];let triangles=0;
    for(const side of[-1,1]){const name=names[side<0?0:1];if(s.offset!==offset||!r.meshes?.[name]){const m=buildBank(Builder,side,offset);retireMesh(r,name);r.meshFromBuilder(name,m);s[name]=m.bank;}triangles+=s[name].triangles;}
    s.offset=offset;
    const props=[],put=(id,m,p,scale=[1,1,1],yaw=0)=>props.push({id:'natural-bank-'+id,m,p,scale,s:1,y:yaw,t:[1,1,1,0]});let roots=0,reeds=0,plants=0;
    for(const side of[-1,1]){
      put('surface-'+side,names[side<0?0:1],[x,y,z0]);
      for(let i=0;i<14;i++){
        const logical=Math.floor((C.zMin+offset)/19)*19+i*19,local=logical-offset;if(local<C.zMin||local>C.zMax)continue;
        const phase=logical*.37+side*1.4,z=local+Math.sin(phase)*2.1,shape=profile(side,z+offset),v=Math.abs(Math.floor(logical/19+side))%3,rootName='powRiverRoot'+v,reedName='powRiverReeds'+v;
        if(!r.meshes?.[rootName])r.meshFromBuilder(rootName,rootMesh(Builder,v));if(!r.meshes?.[reedName])r.meshFromBuilder(reedName,reedMesh(Builder,v));
        if(i%3!==1){put('roots-'+side+'-'+i,rootName,[x+side*13.65,y,z0+z],[1,1,1],side<0?Math.PI:0);roots++;}
        // Thin fans leave exposed mud and open access between clumps.
        put('reeds-'+side+'-'+i,reedName,[x+side*(shape.waterline+.15),y+.015,z0+z+2.7],[1,.85+(i%3)*.19,1],phase);reeds++;
        if(i%2===0){put('reeds-back-'+side+'-'+i,reedName,[x+side*(15.25+.3*Math.sin(phase)),y+C.walkY,z0+z-2.1],[1.3,1.15,1.3],phase+1);reeds++;}
        const back=17.2+(Math.sin(phase)+1)*3.3;put('understory-'+side+'-'+i,'bush',[x+side*back,y+C.walkY,z0+z+5.2],[.55,.68+(i%3)*.12,.55],phase);plants++;
      }
    }
    game.campGeo.push(...props);states.set(game,{surfaces:2,triangles,roots,reeds,plants,collisionSolids:0,streamOffset:offset,waterY:y,walkY:y+C.walkY,bankMeshes:names.slice(),referenceFiles:['river-and-swamp-references/2-Photo-2.jpg','river-and-swamp-references/4-Photo-4.jpg']});return true;
  }
  function inspect(game){const s=states.get(game),r=game?.rend||game?.app?.rend,rs=r&&renderers.get(r);return s?{...s,bankMeshes:s.bankMeshes.slice(),referenceFiles:s.referenceFiles.slice(),draws:rs?.draws||0,photographicDraws:rs?.photographicDraws||0,additionalTextureBytes:0}:null;}
  root.RiverBanks=Object.freeze({configure,profile,buildBank,build,inspect,constants:C});
})(typeof window!=='undefined'?window:globalThis);
