'use strict';
// Pass this actual-browser function to page.evaluate(). It only inspects the
// production cutout textures/descriptor routing; the surrounding survival
// suite owns gameplay and actual water/depth-render checks.
module.exports=async function auditSwimGPU(){
  const R=App.rend,C=PhotoCutouts,gl=R.gl,rows=[];
  const fail=message=>{throw Error('Swim GPU audit: '+message);};
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
  for(const subject of ['nva','militia','aviator']){
    C.beginFrame(R);await C.prepareMotion(R,subject,'swim');
    for(let frame=0;frame<8;frame++){
      C.beginFrame(R);
      const actor={kind:subject,p:[0,-.42,-5],alive:true,armed:false,swimming:true,swimPhase:(frame+.4)/8,yaw:Math.PI/2};
      const d=C.describe(actor,{renderer:R,photoName:subject,camera:[0,.4,0],height:1.76}),q=C.anchor({...d,p:actor.p.slice()});
      if(!d||d.photoPose!=='swim'||d.photoFrame!==frame||Math.abs(d.h-.70)>1e-8)fail(subject+' frame '+frame+' did not route true horizontal photo');
      const record=C.inspect(R).motions.records.find(r=>r.key===d.photoAsset),texture=R.textures[d.textureName];
      if(!record||!texture||!gl.isTexture(texture.tex))fail(subject+' frame '+frame+' has no live texture');
      const oldRead=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),oldTexture=gl.getParameter(gl.TEXTURE_BINDING_2D),fb=gl.createFramebuffer();
      const rgba=new Uint8Array(record.gpuWidth*record.gpuHeight*4);
      let complete,minFilter,magFilter;
      try{
        gl.bindTexture(gl.TEXTURE_2D,texture.tex);minFilter=gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER);magFilter=gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture.tex,0);
        complete=gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
        if(!complete)fail(subject+' frame '+frame+' read framebuffer incomplete');
        gl.readPixels(0,0,record.gpuWidth,record.gpuHeight,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
      }finally{gl.bindFramebuffer(gl.READ_FRAMEBUFFER,oldRead);gl.bindTexture(gl.TEXTURE_2D,oldTexture);gl.deleteFramebuffer(fb);}
      let visible=0,opaque=0,border=0,x0=record.gpuWidth,y0=record.gpuHeight,x1=0,y1=0;
      for(let y=0;y<record.gpuHeight;y++)for(let x=0;x<record.gpuWidth;x++){
        const a=rgba[(y*record.gpuWidth+x)*4+3];
        if(a>8&&(x===0||y===0||x===record.gpuWidth-1||y===record.gpuHeight-1))border++;
        if(a>128){visible++;if(a>=240)opaque++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}
      }
      const gpuBounds=[x0,y0,x1,y1],expected=record.bounds.map((n,i)=>n*(i%2?record.gpuHeight/record.sourceHeight:record.gpuWidth/record.sourceWidth));
      if(visible<20000||opaque/visible<.89||border)fail(subject+' frame '+frame+' GPU body empty/patchy/clipped');
      if(gpuBounds.some((n,i)=>Math.abs(n-expected[i])>2.5))fail(subject+' frame '+frame+' GPU bounds differ from full registered ROI');
      if(minFilter!==gl.LINEAR_MIPMAP_LINEAR||magFilter!==gl.LINEAR)fail(subject+' frame '+frame+' has wrong filtering');
      if(gl.getError()!==gl.NO_ERROR)fail(subject+' frame '+frame+' produced GL error');
      rows.push({subject,frame,key:d.photoAsset,sourceRegion:record.sourceRegion,sourceDestination:record.sourceDestination,
        source:[record.sourceWidth,record.sourceHeight],gpu:[record.gpuWidth,record.gpuHeight],gpuBounds,expectedBounds:expected,
        visible,opaqueFraction:opaque/visible,borderAlphaPixels:border,rgbaSHA256:await hash(rgba),minFilter,magFilter,
        worldHeight:d.h,quad:[...q.p,q.w,q.h],torsoHeight:q.p[1]+q.h*(1-280/512),complete});
      C.endFrame(R);
    }
    if(new Set(rows.filter(r=>r.subject===subject).map(r=>r.rgbaSHA256)).size!==8)fail(subject+' did not upload eight unique GPU photographs');
  }
  const final=C.inspect(R);if(final.bytes>final.budget||final.motions.cpuBytes>final.motions.cpuBudget)fail('cache exceeds budget');
  return {poses:rows.length,rows,gpuBytes:final.bytes,gpuBudget:final.budget,cpuBytes:final.motions.cpuBytes,cpuBudget:final.motions.cpuBudget,
    scope:'Actual GPU texture alpha/whole-frame bounds/uniqueness/filtering/readback and production descriptor routing; surrounding native survival checks own world water immersion and travel.'};
};
