/* Preserve the supplied photographic atlas identities and cell proportions.
 * Movement selects source poses; it never substitutes or warps another figure.
 */
(function (root) {
  'use strict';
  const IDENTITIES = Object.freeze({ farmer:'farmer', farmerC:'farmer', villager:'farmer', villagerC:'farmer',
    vc:'militia', militia:'militia', vcFem:'female_vc', female_vc:'female_vc',
    nva:'nva', soldier:'nva', sentry:'nva', guard:'nva', guardAim:'nva', aviator:'aviator', cow:'cow' });
  const finite = (n, fallback=0) => Number.isFinite(n) ? n : fallback;
  const mod = (n, d) => ((n % d) + d) % d;
  let metadata = null;
  function configure(atlas) { metadata = atlas || null; }
  function identity(actor) { return actor && IDENTITIES[actor.kind] || null; }
  function describe(actor, options={}) {
    const photoName=identity(actor); if(!photoName)return null;
    const camera=options.camera || [0,0,0], p=actor.p || [0,0,0];
    const face=finite(actor.face,finite(actor.yaw));
    const heading=Math.atan2(camera[0]-p[0],-(camera[2]-p[2]));
    const relative=Math.atan2(Math.sin(face-heading),Math.cos(face-heading));
    const front=Math.abs(relative)<Math.PI/3, back=Math.abs(relative)>2*Math.PI/3;
    const moving=options.moving === undefined ? finite(actor.spd,finite(actor.speed,finite(actor.walk)))>.12 : !!options.moving;
    const phase=finite(options.phase,finite(actor.ph));
    let photoFrame=front?0:back?(photoName==='farmer'?2:3):2;
    let flip=!front&&!back&&relative>0;
    if(photoName==='cow') {
      // Grazing photos alternate with standing photos in row4. Do not cycle
      // them on a clock: a stationary animal must keep its pose and heading.
      photoFrame=actor.alive===false?44:moving?8+mod(Math.floor(phase*4/Math.PI),8):32;
      flip=relative>0;
    } else if(actor.alive===false) {
      photoFrame=photoName==='farmer'?47:photoName==='female_vc'?40:(photoName==='nva'||photoName==='aviator')?43:40;
      flip=false;
    } else if(actor.crouch || actor.crouched) {
      photoFrame=photoName==='farmer'?45:photoName==='female_vc'?25:photoName==='nva'?28:33;
      flip=false;
    } else if(actor.armed!==false && (actor.seen || actor.kind==='guardAim' || actor.state==='pursuit')) {
      photoFrame=photoName==='farmer'?photoFrame:(photoName==='female_vc'||photoName==='aviator')?24:16;
      flip=false;
    } else if(options.working && photoName==='farmer') {
      photoFrame=24+mod(Math.floor(phase),5); flip=false;
    } else if(moving) photoFrame=8+mod(Math.floor(phase*4/Math.PI),8);
    const baseHeight=finite(options.height,photoName==='cow'?1.42:1.76);
    const photoVariant=photoName==='nva' && photoFrame===0 && !options.forceAtlas ? 'nva_front' : null;
    // The damaged frontal atlas pose ends at the thigh. A separate restored
    // full-body image supplies that relaxed pose; aimed/walking poses stay in
    // the repaired atlas. This is an edited derivative, never a pixel-exact original.
    const meta=metadata && metadata[photoVariant||photoName], frame=meta && meta.frames[photoFrame];
    const reference=meta && Math.max(...meta.frames.slice(0,8).map(f=>f.height));
    // Source crouches/lying poses retain their lower stature. No stretched
    // crouching people, compressed side-view cattle or bobbing foot anchors.
    const h=frame&&reference>0?baseHeight*frame.height/reference:baseHeight;
    return {photoName,photoFrame,flip,h,...(photoVariant?{photoVariant,textureName:'photo_'+photoVariant}:{})};
  }
  function anchor(sprite, atlas=metadata) {
    const name=sprite.photoVariant||sprite.photoName, meta=atlas && atlas[name], cols=meta&&meta.cols||8,rows=meta&&meta.rows||6;
    const frame=Math.max(0,Math.min(cols*rows-1,finite(sprite.photoFrame)|0));
    const f=meta && meta.frames[frame];
    if(!f || !(f.height>0))return {...sprite,cell:frame,cols,rows,motion:null};
    const h=sprite.h/f.height;
    const w=h*(meta.width/cols)/(meta.height/rows);
    return {...sprite,p:[sprite.p[0],sprite.p[1]-f.bottom*h,sprite.p[2]],h,w,cell:frame,cols,rows,motion:null};
  }
  root.PhotoSprites=Object.freeze({configure,identity,describe,anchor,identities:IDENTITIES});
})(window);
