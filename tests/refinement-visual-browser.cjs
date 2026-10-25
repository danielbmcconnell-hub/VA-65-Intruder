'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const installCompletePhotoFixture = require('./helpers/complete-photo-fixture.cjs');

// Native prison entry and real AI movement, followed by explicitly declared
// production-WebGL fixtures. No fixture is a completed escape, new photograph,
// physical Windows/iPhone test, or device performance measurement.
module.exports = async function refinementVisual(browser, target, evidenceDir) {
  const results = [], screenshots = [], out = path.join(evidenceDir, 'refinement-visual');
  await fs.mkdir(out, { recursive: true });
  const originalPath = path.join(__dirname, '../assets/figures-original.png');
  const originalHash = createHash('sha256').update(await fs.readFile(originalPath)).digest('hex');
  assert.equal(originalHash, '2b357f1d128f3a9be324778c0fbea527c7574ff8ca328cfb5391bf811d910883');
  const profiles = [
    { name: 'desktop', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    { name: 'iphone-layout-chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  ].filter(p => !process.env.INTRUDER_REFINEMENT_VISUAL_PROFILE || p.name === process.env.INTRUDER_REFINEMENT_VISUAL_PROFILE);
  for (const profile of profiles) {
    const { name, ...options } = profile, context = await browser.newContext(options), page = await context.newPage();
    const errors = [], missing = [], digestTasks = [], runtimeSHA256 = {};
    page.setDefaultTimeout(90000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => {
      const pathname = new URL(r.url()).pathname;
      if (r.status() >= 400 && pathname.includes('/assets/')) missing.push({ path: pathname, status: r.status() });
      if (r.ok() && /\/assets\/render\/(sprite-layers|contact-shadows)\.js$/.test(pathname)) digestTasks.push(r.body().then(b => { runtimeSHA256[pathname] = createHash('sha256').update(b).digest('hex'); }));
    });
    await context.addInitScript(() => {
      localStorage.setItem('a6_set', JSON.stringify({ quality: 0, sound: 0, voices: 0, mouse: 0, seat: 0, assist: 1, sens: 1 }));
      localStorage.setItem('a6_sawkeys', '1');
      let seed = 0x196603;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => window.__refinementClock ? 0 : raf(t => { if (!window.__refinementClock) cb(t); });
    });
    const click = locator => profile.hasTouch ? locator.tap() : locator.click();
    const record = (title, actual, method) => {
      results.push({ profile: name, name: title, passed: true, actual, method });
      console.log('PASS refinement-visual ' + name + ' ' + title);
      fsSync.writeFileSync(path.join(evidenceDir, 'refinement-visual-progress.json'), JSON.stringify({ passed: false, complete: false, results, screenshots }, null, 2));
    };
    const savePNG = async (label, dataURL, dimensions) => {
      const bytes = dataURL ? Buffer.from(dataURL.split(',')[1], 'base64') : await page.screenshot({ timeout: 90000 });
      assert.deepEqual(Array.from(bytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
      const decoded = await page.evaluate(async src => {
        const im = new Image(); im.src = src; await im.decode();
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0); const p = x.getImageData(0, 0, c.width, c.height).data;
        const colors = new Set(); let opaque = 0;
        for (let i = 0; i < p.length; i += 4) { colors.add([p[i] >> 4, p[i + 1] >> 4, p[i + 2] >> 4].join(',')); if (p[i + 3] === 255) opaque++; }
        return { width: c.width, height: c.height, colors: colors.size, opaque };
      }, 'data:image/png;base64,' + bytes.toString('base64'));
      if (dimensions) {
        assert.deepEqual([decoded.width, decoded.height], [dimensions.width, dimensions.height]);
        assert(decoded.width >= 192 && decoded.height >= 192);
        assert.equal(decoded.opaque, decoded.width * decoded.height);
      } else assert(decoded.width >= 390 && decoded.height >= 390);
      assert(decoded.colors > 20, 'Screenshot must contain actual image detail: ' + label);
      const file = name + '-' + label + '.png'; await fs.writeFile(path.join(out, file), bytes); screenshots.push('refinement-visual/' + file);
      return { file: 'refinement-visual/' + file, ...decoded, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    };
    try {
      const response = await page.goto(target, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
      const sourceSHA256 = createHash('sha256').update(await response.body()).digest('hex');
      await page.waitForFunction(() => window.App && window.POW?.FigureMotion && window.SpriteLayers && window.ContactShadows);
      await click(page.locator('#bootGo')); await click(page.locator('#powChapter button').filter({ hasText: 'Enter the prison' }));
      await page.waitForFunction(() => App.game?.pow?.stage === 'cell' && document.getElementById('loader').style.display === 'none', null, { polling: 50 });
      await installCompletePhotoFixture(page); await installCompletePhotoFixture.waitPOWVegetation(page);
      await page.evaluate(() => { window.__refinementClock = true; }); await page.waitForTimeout(60);
      const entry = await page.evaluate(() => {
        const g = App.game, R = App.rend, gl = R.gl;
        for (const id of ['teach', 'teachPeek', 'legend']) document.getElementById(id)?.classList.remove('on');
        document.getElementById('radio').innerHTML = ''; g.render(1 / 60); g.syncControls();
        const meta = n => { const t = R.textures[n]; return { w: t.w, h: t.h, width: t.width, height: t.height, cols: t.cols, rows: t.rows, layers: t.layers, levels: t.levels, bytes: t.bytes, premultiplied: t.premultiplied, uploadPath: t.uploadPath, liveArray: gl.isTexture(t.arrayTex), live2D: gl.isTexture(t.tex) }; };
        return { stage: g.pow.stage, actors: g.evade.searchers.length, solids: g.pow.solids.length, webgl: gl.getParameter(gl.VERSION), legacyAtlasUploaded: !!R.textures.people, cutouts: PhotoCutouts.inspect(R), plants: meta('photo_vegetation'), memory: SpriteLayers.inspect(gl), source: FIGIMG.getAttribute('src'), gl: gl.getError() };
      });
      assert.equal(entry.stage, 'cell'); assert(entry.actors > 0 && entry.solids > 20); assert.match(entry.webgl, /^WebGL 2/);
      assert.equal(entry.legacyAtlasUploaded, false); assert.equal(entry.cutouts.status, 'ready');
      assert(entry.cutouts.records.filter(r => r.pose === 'idle' && r.resident).length === 6); assert(entry.cutouts.bytes <= entry.cutouts.budget);
      assert.deepEqual([entry.plants.width, entry.plants.height, entry.plants.layers], [192, 256, 48]);
      assert(entry.plants.liveArray && entry.plants.live2D && entry.plants.premultiplied); assert.equal(entry.source, 'assets/figures-original.png');
      assert.equal(entry.memory.liveArrays, 1); assert(entry.memory.bytes < 20 * 1024 * 1024); assert.equal(entry.gl, 0);
      record('Native prison loads complete human photographs and one bounded frame-isolated vegetation array', { sourceSHA256, originalHash, entry, screenshot: await savePNG('native-prison-cell') }, 'Actual Ready Room prison entry with mouse/emulated touch. All six complete idle images remain resident; the removed legacy people atlas remains absent. No stage teleport, actor relocation, rewritten photograph or device-performance inference.');


      const patrol = await page.evaluate(() => {
        const g = App.game, actors = g.evade.searchers, before = actors.map(a => a.p.slice()); let penetrations = 0, moving = 0, peakSpeed = 0;
        for (let i = 0; i < 160; i++) { g.t += .05; g.stepEvade(.05); for (const a of actors) { if (a.alive && POW.blocked(g, a.p[0], a.p[2], .30, a.p[1])) penetrations++; const p = POW.FigureMotion.pose(a, g); if (p.stride > .1) moving++; peakSpeed = Math.max(peakSpeed, p.speed || 0); } }
        g.render(1 / 60); g.syncControls();
        return { moved: actors.filter((a, i) => Math.hypot(a.p[0] - before[i][0], a.p[2] - before[i][2]) > .2).length, penetrations, moving, peakSpeed, stage: g.pow.stage, contacts: ContactShadows.inspect(g), gl: App.rend.gl.getError() };
      });
      assert(patrol.moved > 0 && patrol.moving > 10 && patrol.peakSpeed > .1 && patrol.peakSpeed < 6); assert.equal(patrol.penetrations, 0); assert.equal(patrol.stage, 'cell'); assert.equal(patrol.gl, 0);
      record('Original moving prison guards retain collision and bounded photographic gait', { patrol, screenshot: await savePNG('native-moving-prison-guards') }, 'Eight simulated seconds of original stepEvade from the native locked cell. Every guard is collision-checked every 50 ms. No actor position, AI-state or route assignments.');

      const roster = await page.evaluate(() => {
        const g = App.game, R = App.rend, b = g.pow.base, originalActors = g.evade.searchers, originalPOWActors = g.pow.actors;
        const actors = [['farmer', 4], ['vc', 9], ['nva', 14]].map(([kind, x]) => POW.AI.makeActor({ id: 'refinement-fixture-' + kind, kind, p: [b[0] + x, b[1], b[2] + 12], route: [[b[0] + x, b[1], b[2] + 12], [b[0] + x, b[1], b[2] + 6]], face: 0, schedule: { cycle: 10000, rounds: 9999, offset: 0 }, dwell: 0 }));
        for (const a of actors) if (POW.blocked(g, a.p[0], a.p[2], .32, a.p[1])) throw new Error('Declared actor fixture intersects solid');
        g.evade.searchers = actors; g.pow.actors = actors; POW.FigureMotion.reset(g);
        const before = actors.map(a => a.p.slice()); POW.AI.noise(g, g.evade.p, 1.4, 'gunshot', 'refinement-acceptance-fixture');
        for (let n = 0; n < 40; n++) { g.t += .05; g.stepEvade(.05); }
        const camera = R.setCamera, draw = R.drawSprites, shadowDraw = R.drawGroundShadows, calls = [], shadowCalls = [];
        R.drawGroundShadows = function (list) { shadowCalls.push({ total: list.length, contacts: list.filter(s => s.contact).length, visibleContacts: list.slice(0,600).filter(s => s.contact).length, firstContact: list.findIndex(s => s.contact) }); return shadowDraw.apply(this, arguments); };
        R.setCamera = function () { return camera.call(this, [b[0] + 9, b[1] + 1.55, b[2] + 22], [0, -.035, -1], [0, 1, 0], 58, .1, 60000, this.W / this.H); };
        R.drawSprites = function (name, sprites) { for (const s of sprites) { const a = actors.find(a => a === s.owner); if (a) calls.push({ kind: a.kind, name, ...__completePhotoFixture.meta(s), actorY: a.p[1] }); } return draw.apply(this, arguments); };
        try { g.render(1 / 60); } finally { R.setCamera = camera; R.drawSprites = draw; R.drawGroundShadows = shadowDraw; }
        const result = { calls, shadowCalls, movements: actors.map((a, i) => ({ kind: a.kind, state: a.state, moved: Math.hypot(a.p[0] - before[i][0], a.p[2] - before[i][2]), pose: POW.FigureMotion.pose(a, g) })), contacts: ContactShadows.inspect(g), gl: R.gl.getError() };
        g.evade.searchers = originalActors; g.pow.actors = originalPOWActors; POW.FigureMotion.reset(g); return result;
      });
      assert.equal(roster.calls.length, 3); assert(roster.shadowCalls.some(c => c.contacts === 3 && c.visibleContacts === 3 && c.firstContact === 0), JSON.stringify(roster.shadowCalls)); for (const a of roster.calls) { assert.match(a.name, /^photo_hr_/); assert.equal(a.complete, true); assert.equal(a.cols, 1); assert.equal(a.rows, 1); assert.equal(a.cell, 0); assert(a.liveTexture); assert(Math.abs(a.feet - a.actorY) < .001); assert(Math.abs(a.renderedAspect - a.sourceAspect) < .001); assert(a.visibleHeight > 1.2 && a.visibleHeight < 1.9); }
      for (const a of roster.movements) assert(a.moved > .2 && a.pose.stride > .1, JSON.stringify(a)); assert.equal(roster.gl, 0);
      record('Farmer, VC and NVA remain distinct, grounded and moving in the real prison world', { roster, screenshot: await savePNG('declared-roster-farmer-vc-nva') }, 'Declared actor-roster, sound and camera fixture in the existing yard. Original hearing, civilian flee, guard investigation and collision navigation generate movement. Normal prison actors restored immediately afterward.');

      const gpu = await page.evaluate(async () => {
        const R = App.rend, gl = R.gl, g = App.game, saved = { quality: R.quality, float: R.floatBuf, atm: R.atm, episode: R.episode, time: R.time, paused: g.paused, screen: App.screen };
        const dims = {}, images = [], samples = [], resources = [];
        const identity = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,1,1,1,0]);
        g.paused = true; App.screen = 'gpu-fixture'; R.quality = 0; R.floatBuf = false; R.resize(384, 384, 1); dims.width = R.W; dims.height = R.H;
        R.setCamera([0, 1, 0], [0, 0, -1], [0, 1, 0], 50, .1, 400, 1);
        R.setAtmos({ ...R.atm, amb: [.8,.8,.8], gnd: [0,0,0], sunCol: [0,0,0], horizon: [0,0,0], zenith: [0,0,0], fogDens: 0, overcast: 0 });
        R.setEpisode({ ambient: [.75,.75,.75], fogColor: [0,0,0], fogDensity: .000001, lights: [], water: { enabled: false } }, { p: [0,0,0], solids: [] }); R.setFires([]);
        const clear = () => { R.begin(); gl.clearColor(.12,.08,.15,1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); };
        const read = () => { const p = new Uint8Array(R.W * R.H * 4); gl.readPixels(0,0,R.W,R.H,gl.RGBA,gl.UNSIGNED_BYTE,p); return p; };
        const background = [31,20,38], foreground = (p, i) => Math.max(...background.map((v,j) => Math.abs(v - p[i+j]))) > 4;
        const diff = (a,b) => { let changed = 0, max = 0, sum = 0, covered = 0; for(let i=0;i<a.length;i+=4) { const d = Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2])); if(d>3)changed++; max=Math.max(max,d);sum+=d;if(foreground(a,i))covered++; } return { changed, max, mean: sum/(a.length/4), covered }; };
        const metrics = p => { let covered=0, first=R.H, last=-1, left=R.W, right=-1, mid=0, midCovered=0; for(let y=0;y<R.H;y++)for(let x=0;x<R.W;x++){const i=(y*R.W+x)*4;if(foreground(p,i)){covered++;first=Math.min(first,y);last=Math.max(last,y);left=Math.min(left,x);right=Math.max(right,x);}} if(last>=first)for(let y=Math.floor(first+(last-first)*.3);y<=Math.ceil(first+(last-first)*.7);y++)for(let x=Math.ceil(left+(right-left)*.42);x<=Math.floor(left+(right-left)*.58);x++){mid++;if(foreground(p,(y*R.W+x)*4))midCovered++;}return{covered,first,last,left,right,mid,midCovered,midCoverage:mid?midCovered/mid:0}; };
        const png = p => {const c=document.createElement('canvas');c.width=R.W;c.height=R.H;const x=c.getContext('2d'),d=x.createImageData(R.W,R.H);for(let y=0;y<R.H;y++)d.data.set(p.subarray(y*R.W*4,(y+1)*R.W*4),(R.H-1-y)*R.W*4);x.putImageData(d,0,0);return c.toDataURL('image/png');};
        const cleanup = () => { for(const n of resources){ const t=R.textures[n];if(t){SpriteLayers.dispose(gl,t);gl.deleteTexture(t.tex);delete R.textures[n];}} };
        try {
          const F = __completePhotoFixture;
          const plants = await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src='assets/processed/vegetation.webp';});
          R.texFromCanvas('refinementLegacyPlants', plants); resources.push('refinementLegacyPlants');
          for(const [kind,subject] of [['farmer','farmer'],['vc','militia'],['nva','nva']]){
            await F.prepare(subject);
            const sprite=F.sprite(subject), record=PhotoCutouts.inspect(R).records.find(r=>r.key===sprite.photoAsset), texture=R.textures[sprite.textureName];
            const image=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=record.url;});
            const canvas=document.createElement('canvas');canvas.width=texture.w;canvas.height=texture.h;const context=canvas.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
            const rawName='refinementRawComplete_'+subject;R.texFromCanvas(rawName,canvas);resources.push(rawName);canvas.width=canvas.height=1;
            gl.bindTexture(gl.TEXTURE_2D,texture.tex);const oldMin=gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
            clear();R.drawSprites(rawName,[sprite]);const raw=read();clear();R.drawSprites(sprite.textureName,[sprite]);const complete=read();const lod0=diff(raw,complete);
            gl.bindTexture(gl.TEXTURE_2D,texture.tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,oldMin);
            const distances=[];for(const distance of [3,9,18]){const at=F.sprite(subject,[0,0,-distance]);clear();R.drawSprites(at.textureName,[at]);distances.push({distance,...metrics(read())});}
            clear();R.drawSprites(sprite.textureName,[sprite]);images.push({name:'daylight-complete-'+kind,png:png(read())});samples.push({kind,source:F.meta(sprite),lod0,distances});
          }
          const plantTexture=R.textures.photo_vegetation;gl.bindTexture(gl.TEXTURE_2D_ARRAY,plantTexture.arrayTex);const savedPlantMax=gl.getTexParameter(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAX_LEVEL);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAX_LEVEL,0);
          const m=PHOTO_ATLAS.vegetation.frames[7],h=3.5/m.height,plant={p:[0,-m.bottom*h,-6],h,w:3,cell:7,cols:8,rows:6};
          clear();R.drawSprites('refinementLegacyPlants',[plant]);const oldPlant=read();clear();R.drawSprites('photo_vegetation',[plant]);const plantLOD0=diff(oldPlant,read());
          gl.bindTexture(gl.TEXTURE_2D_ARRAY,plantTexture.arrayTex);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAX_LEVEL,savedPlantMax);
          const plantDistances=[];for(const d of [6,18,36]){clear();R.drawSprites('photo_vegetation',[{...plant,p:[0,plant.p[1],-d]}]);plantDistances.push({distance:d,...metrics(read())});}
          clear();R.drawSprites('photo_vegetation',[plant]);images.push({name:'daylight-original-vegetation',png:png(read())});
          const wall=new MB();wall.quad([-2,0,-2],[2,0,-2],[2,2,-2],[-2,2,-2],[.5,.5,.5]);R.meshFromBuilder('refinementWall',wall);
          clear();R.drawMesh('refinementWall',identity,1);const wallPixels=read();const behind=F.sprite('nva');R.drawSprites(behind.textureName,[behind]);const occlusion=diff(wallPixels,read());
          // Deliberately antagonistic neighbours: target is a one-pixel green
          // checker; every other frame is magenta. Each target mip is read
          // directly from its array layer, independently of the sprite shader.
          const c=document.createElement('canvas');c.width=256;c.height=576;const x=c.getContext('2d');x.fillStyle='#ff00ff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#000';x.fillRect(0,0,32,64);x.fillStyle='#00ff00';for(let y=0;y<64;y++)for(let xx=0;xx<32;xx++)if((xx+y)%2)x.fillRect(xx,y,1,1);
          const fixture=SpriteLayers.upload(gl,'people',c);if(!fixture)throw new Error('Synthetic array upload failed');
          const dummy=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,dummy);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
          R.textures.refinementIsolated={...fixture,tex:dummy};resources.push('refinementIsolated');R.texFromCanvas('refinementLegacyChecker',c);resources.push('refinementLegacyChecker');
          const fb=gl.createFramebuffer(), mipReads=[];gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
          for(let level=1;level<fixture.levels;level++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,fixture.arrayTex,level,0);const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER),pixel=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);mipReads.push({level,status,rgba:Array.from(pixel)});}gl.deleteFramebuffer(fb);
          const temporal={};
          for(const texture of ['refinementLegacyChecker','refinementIsolated']){
            const frames=[],s={p:[0,.5,-16],h:1,w:.5,cell:0,cols:8,rows:9};
            for(let n=0;n<24;n++){R.setCamera([n*.003,1,0],[0,0,-1],[0,1,0],50,.1,400,1);clear();R.drawSprites(texture,[s]);frames.push(read());}
            let energy=0,count=0;const cx=Math.floor(R.W/2),cy=Math.floor(R.H/2);
            for(let n=1;n<frames.length;n++)for(let y=cy-5;y<=cy+5;y++)for(let xx=cx-2;xx<=cx+2;xx++){const i=(y*R.W+xx)*4;if(foreground(frames[n],i)&&foreground(frames[n-1],i)){energy+=Math.abs(frames[n][i+1]-frames[n-1][i+1]);count++;}}
            temporal[texture]={frames:frames.length,interiorSamples:count,meanGreenTemporalDifference:count?energy/count:0};
          }
          R.setCamera([0,1,0],[0,0,-1],[0,1,0],50,.1,400,1);
          const samplerSprite=F.sprite('nva');clear();R.drawSprites(samplerSprite.textureName,[samplerSprite]);const legacyUse=gl.getUniform(R.pSprite,R.pSprite.u.uUseSpriteLayers);
          clear();R.drawSprites('refinementIsolated',[{p:[0,0,-3],h:2,w:1,cell:0,cols:8,rows:9}]);
          const samplers={legacyUse,arrayUse:gl.getUniform(R.pSprite,R.pSprite.u.uUseSpriteLayers),atlas:gl.getUniform(R.pSprite,R.pSprite.u.uTex),layers:gl.getUniform(R.pSprite,R.pSprite.u.uSpriteLayers),shadow:gl.getUniform(R.pSprite,R.pSprite.u.uShadow)};
          const state={depthWrites:gl.getParameter(gl.DEPTH_WRITEMASK),depthTest:gl.isEnabled(gl.DEPTH_TEST),blending:gl.isEnabled(gl.BLEND),culling:gl.isEnabled(gl.CULL_FACE)};
          return {dims,samples,plantLOD0,plantDistances,occlusion,mipReads,temporal,samplers,state,images,gl:gl.getError()};
        } finally { cleanup();R.floatBuf=saved.float;R.quality=saved.quality;R.setAtmos(saved.atm);R.setEpisode(saved.episode);R.time=saved.time;R.resize(innerWidth,innerHeight,devicePixelRatio||1);g.paused=saved.paused;App.screen=saved.screen; }
      });
      for(const s of gpu.samples){assert(s.lod0.covered>500);assert(s.lod0.changed<s.lod0.covered*.03+4,JSON.stringify(s));assert(s.distances[0].covered>s.distances[1].covered*5);assert(s.distances[1].covered>s.distances[2].covered*2.5);for(const d of s.distances)assert(d.covered>20&&d.midCoverage>.65,JSON.stringify(s));}
      assert(gpu.plantLOD0.changed<gpu.plantLOD0.covered*.03+4,JSON.stringify(gpu.plantLOD0));assert(gpu.plantDistances[0].covered>gpu.plantDistances[1].covered*5);assert(gpu.plantDistances[1].covered>gpu.plantDistances[2].covered*2.5);
      assert.equal(gpu.occlusion.changed,0);assert.deepEqual(gpu.state,{depthWrites:true,depthTest:true,blending:false,culling:true});
      for(const m of gpu.mipReads){assert.equal(m.status,36053);assert.equal(m.rgba[0],0);assert.equal(m.rgba[2],0);assert(m.rgba[1]>=126&&m.rgba[1]<=129);assert.equal(m.rgba[3],255);}
      const oldEnergy=gpu.temporal.refinementLegacyChecker,newEnergy=gpu.temporal.refinementIsolated;
      assert(oldEnergy.interiorSamples>100&&newEnergy.interiorSamples>100);assert(oldEnergy.meanGreenTemporalDifference>1);assert(newEnergy.meanGreenTemporalDifference<oldEnergy.meanGreenTemporalDifference*.4,JSON.stringify(gpu.temporal));
      assert.equal(gpu.samplers.legacyUse,0);assert.equal(gpu.samplers.arrayUse,1);assert.equal(gpu.samplers.atlas,0);assert.equal(gpu.samplers.layers,5);assert.equal(gpu.samplers.shadow,7);assert.equal(gpu.gl,0);
      const decoded=[];for(const im of gpu.images)decoded.push(await savePNG('gpu-fixture-'+im.name,im.png,gpu.dims));
      record('Complete human photographs and vegetation LOD0 match independent uploads; near/mid/far silhouettes remain solid and occluded', { originalHash,samples:gpu.samples,plantLOD0:gpu.plantLOD0,plantDistances:gpu.plantDistances,occlusion:gpu.occlusion,state:gpu.state,samplers:gpu.samplers,decoded }, 'Declared raw production drawSprites framebuffer fixtures. Complete-image LOD0 comparison uses independently decoded and identically sized source uploads; human distances use isolated whole-image mips and vegetation uses native frame arrays. Daylight farmer/VC/NVA/vegetation fixture PNGs are real WebGL output, not normal world spawns.');
      record('Frame mipmaps contain no neighbouring magenta and reduce checker shimmer during camera motion', {mipReads:gpu.mipReads,temporal:gpu.temporal}, 'Declared hostile-neighbour synthetic atlas. Actual GPU framebufferTextureLayer reads every target mip; 24 subpixel camera positions compare interior green temporal energy against ordinary non-mipmapped legacy sampling. Synthetic result is not a universal subjective sharpness or source-detail claim.');

      const contact = await page.evaluate(() => {
        const g=App.game,R=App.rend,gl=R.gl,saved={quality:R.quality,float:R.floatBuf,atm:R.atm,episode:R.episode,paused:g.paused,screen:App.screen},identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,1,1,1,0]);
        g.paused=true;App.screen='contact-fixture';R.quality=0;R.floatBuf=false;R.resize(384,384,1);
        R.setAtmos({...R.atm,amb:[.8,.8,.8],gnd:[0,0,0],sunCol:[0,0,0],horizon:[0,0,0],zenith:[0,0,0],fogDens:0,overcast:0});R.setEpisode({ambient:[.75,.75,.75],fogColor:[0,0,0],fogDensity:.000001,lights:[],water:{enabled:false}},{p:[0,0,0],solids:[]});R.setFires([]);
        const read=()=>{const p=new Uint8Array(R.W*R.H*4);gl.readPixels(0,0,R.W,R.H,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
        const compare=(a,b)=>{let darkened=0,brightened=0,changed=0,maxDrop=0;for(let i=0;i<a.length;i+=4){const drop=(a[i]+a[i+1]+a[i+2]-b[i]-b[i+1]-b[i+2])/3;if(drop>1){darkened++;maxDrop=Math.max(maxDrop,drop);}if(drop<-1)brightened++;if(Math.abs(drop)>1)changed++;}return{darkened,brightened,changed,maxDrop};};
        const rows=[],images=[],dims={width:R.W,height:R.H};
        const png=p=>{const c=document.createElement('canvas');c.width=R.W;c.height=R.H;const x=c.getContext('2d'),d=x.createImageData(R.W,R.H);for(let yy=0;yy<R.H;yy++)d.data.set(p.subarray(yy*R.W*4,(yy+1)*R.W*4),(R.H-1-yy)*R.W*4);x.putImageData(d,0,0);return c.toDataURL('image/png');};
        const projected=p=>{const m=R.matVP,w=m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15];return [(m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12])/w*.5*R.W+R.W*.5,(m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13])/w*.5*R.H+R.H*.5];};
        try {
          for(const [label,y,slope,pow] of [['flat',0,[0,0],false],['slope',2,[.32,-.18],false],['raised-pow-floor',4,[0,0],true]]){
            const floorY=(x,z)=>y+slope[0]*x+slope[1]*(z+3);ContactShadows.configure({terrainH:floorY});
            const floor=new MB();floor.quad([-4,floorY(-4,0),0],[4,floorY(4,0),0],[4,floorY(4,-10),-10],[-4,floorY(-4,-10),-10],[.65,.65,.65]);R.meshFromBuilder('refinementContactFloor',floor);
            R.setCamera([0,y+2,2],[0,-.35,-1],[0,1,0],50,.1,100,1);
            const owner={kind:'nva',p:[0,y,-3],alive:true,armed:false},descriptor=PhotoSprites.describe(owner,{renderer:R,camera:[0,y+2,2]}),sprite={...descriptor,p:owner.p.slice(),owner,sourcePhotograph:true},fixture={evade:{p:[0,y+2,2]},rend:R,atm:{night:false},t:0,...(pow?{pow:{time:0}}:{})};
            const before=JSON.stringify(sprite),cores=ContactShadows.collect(fixture,[sprite],0),body=PhotoSprites.anchor(sprite);
            const clear=()=>{R.begin();gl.clearColor(.12,.08,.15,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);R.drawMesh('refinementContactFloor',identity,1);};
            clear();R.drawSprites(body.textureName,[body]);const plain=read();clear();R.drawGroundShadows(cores);R.drawSprites(body.textureName,[body]);const anchored=read();
            const visible=compare(plain,anchored),foot=projected(sprite.p);let footROIDarkened=0,bodyAboveChanged=0;for(let yy=0;yy<R.H;yy++)for(let xx=0;xx<R.W;xx++){const i=(yy*R.W+xx)*4,d=Math.max(Math.abs(plain[i]-anchored[i]),Math.abs(plain[i+1]-anchored[i+1]),Math.abs(plain[i+2]-anchored[i+2]));if(d>1&&Math.hypot(xx-foot[0],yy-foot[1])<24)footROIDarkened++;if(d>1&&yy>foot[1]+14&&Math.abs(xx-foot[0])<30)bodyAboveChanged++;}images.push({name:label,png:png(anchored)});
            const wall=new MB();wall.quad([-4,y,-1],[4,y,-1],[4,y+4,-1],[-4,y+4,-1],[.5,.5,.5]);R.meshFromBuilder('refinementContactWall',wall);
            clear();R.drawMesh('refinementContactWall',identity,1);const wallOnly=read();R.drawGroundShadows(cores);const wallOcclusion=compare(wallOnly,read());
            rows.push({label,cores,expectedY:y,expectedSlope:slope,unchangedSprite:before===JSON.stringify(sprite),foot,footROIDarkened,bodyAboveChanged,visible,wallOcclusion,samples:ContactShadows.inspect(fixture),gl:gl.getError()});
          }
          return {rows,images,dims,gl:gl.getError()};
        } finally {ContactShadows.configure({terrainH});R.floatBuf=saved.float;R.quality=saved.quality;R.setAtmos(saved.atm);R.setEpisode(saved.episode);R.resize(innerWidth,innerHeight,devicePixelRatio||1);g.paused=saved.paused;App.screen=saved.screen;}
      });
      for(const row of contact.rows){assert.equal(row.cores.length,1);assert.equal(row.cores[0].p[1],row.expectedY);assert(row.unchangedSprite);for(let i=0;i<2;i++)assert(Math.abs(row.cores[0].slope[i]-row.expectedSlope[i])<.0001);assert(row.visible.darkened>8&&row.visible.maxDrop>2,JSON.stringify(row));assert(row.footROIDarkened>8,JSON.stringify(row));assert.equal(row.bodyAboveChanged,0);assert.equal(row.visible.brightened,0);assert.equal(row.wallOcclusion.changed,0);assert.equal(row.gl,0);}assert.equal(contact.gl,0);
      const contactImages=[];for(const im of contact.images)contactImages.push(await savePNG('gpu-contact-'+im.name,im.png,contact.dims));delete contact.images;contact.screenshots=contactImages;
      record('Boot contact cores visibly darken flat, sloped and raised POW floors without moving the body or leaking through walls',contact,'Declared actual MB floor/body/wall GPU fixtures with matching terrain sampler. Production ContactShadows.collect and drawGroundShadows perform all placement and shading. The original terrain sampler is restored in finally; no actor or physics changes.');

      const replacement = await page.evaluate(async () => {
        const R=App.rend,gl=R.gl,old=R.textures.photo_vegetation,uploads=[],upload=gl.texImage2D;
        const idles=PhotoCutouts.inspect(R).records.filter(r=>r.pose==='idle').map(r=>({name:r.textureName,tex:R.textures[r.textureName].tex}));
        const image=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src='assets/processed/vegetation.webp';});
        gl.texImage2D=function(){uploads.push({argc:arguments.length,width:typeof arguments[3]==='number'?arguments[3]:null,height:typeof arguments[4]==='number'?arguments[4]:null});return upload.apply(this,arguments);};
        try {R.texFromCanvas('photo_vegetation',image);}finally{gl.texImage2D=upload;}
        const first=R.textures.photo_vegetation,firstState=SpriteLayers.inspect(gl);R.texFromCanvas('photo_vegetation',image);const second=R.textures.photo_vegetation;
        return {oldArrayDeleted:!gl.isTexture(old.arrayTex),old2DDeleted:!gl.isTexture(old.tex),firstArrayDeleted:!gl.isTexture(first.arrayTex),first2DDeleted:!gl.isTexture(first.tex),newArrayLive:gl.isTexture(second.arrayTex),new2DLive:gl.isTexture(second.tex),completeIdlesPreserved:idles.every(r=>R.textures[r.name].tex===r.tex&&gl.isTexture(r.tex)),legacyAtlasUploaded:!!R.textures.people,uploads,firstState,current:SpriteLayers.inspect(gl),photos:PhotoCutouts.inspect(R),gl:gl.getError()};
      });
      assert(replacement.oldArrayDeleted&&replacement.old2DDeleted&&replacement.firstArrayDeleted&&replacement.first2DDeleted&&replacement.newArrayLive&&replacement.new2DLive&&replacement.completeIdlesPreserved);assert.equal(replacement.legacyAtlasUploaded,false);assert(replacement.uploads.some(u=>u.width===1&&u.height===1));assert(replacement.uploads.every(u=>u.width===1&&u.height===1));assert.equal(replacement.firstState.liveArrays,1);assert.equal(replacement.current.liveArrays,1);assert(replacement.current.bytes<20*1024*1024);assert(replacement.photos.bytes<=replacement.photos.budget);assert.equal(replacement.gl,0);
      record('Repeated vegetation replacement deletes both old handles while complete human images remain resident',replacement,'Actual renderer texFromCanvas replacement twice with the unchanged vegetation source. Real texture deletion and 1x1 array proxies are checked; the removed people atlas is not recreated.');

      const loss = await page.evaluate(() => {
        const R=App.rend,g=App.game;window.__refinementRecovery={renderer:R,game:g,aircraft:JSON.stringify(g.ac),powStage:g.pow.stage,actors:JSON.stringify(g.evade.searchers),photos:PhotoCutouts.inspect(R).records.filter(r=>r.pose==='idle').map(r=>({name:r.textureName,tex:R.textures[r.textureName].tex})),plants:R.textures.photo_vegetation.arrayTex};
        const ext=R.gl.getExtension('WEBGL_lose_context');if(!ext)return false;window.__refinementLoss=ext;ext.loseContext();return true;
      });
      assert(loss);await page.waitForFunction(()=>App.graphicsContextLost&&App.game?.paused&&!App.rend,null,{polling:50});await page.waitForTimeout(200);await page.evaluate(()=>__refinementLoss.restoreContext());
      await page.waitForFunction(()=>!App.graphicsContextLost&&App.rend&&App.rend!==__refinementRecovery.renderer&&App.game?.paused,null,{polling:50});
      await page.evaluate(()=>App.game.render(0));await installCompletePhotoFixture(page);await installCompletePhotoFixture.waitPOWVegetation(page);
      const restored=await page.evaluate(()=>{const R=App.rend,g=App.game,b=__refinementRecovery;g.render(1/60);return{sameGame:g===b.game,sameAircraft:JSON.stringify(g.ac)===b.aircraft,sameActors:JSON.stringify(g.evade.searchers)===b.actors,sameStage:g.pow.stage===b.powStage,newPeople:b.photos.every(r=>R.textures[r.name]?.tex!==r.tex&&R.gl.isTexture(R.textures[r.name]?.tex)),newPlants:R.textures.photo_vegetation.arrayTex!==b.plants&&R.gl.isTexture(R.textures.photo_vegetation.arrayTex),memory:SpriteLayers.inspect(R.gl),gl:R.gl.getError()};});
      assert(restored.sameGame&&restored.sameAircraft&&restored.sameActors&&restored.sameStage&&restored.newPeople&&restored.newPlants);assert.equal(restored.memory.liveArrays,1);assert(restored.memory.bytes<20*1024*1024);assert.equal(restored.gl,0);
      await click(page.locator('#graphicsRecovery').getByRole('button',{name:'Resume mission',exact:true}));await page.evaluate(()=>{App.game.render(1/60);App.game.syncControls();});
      record('A true WebGL context loss restores complete human textures and vegetation while retaining the prison game', {restored,screenshot:await savePNG('native-restored-prison')},'WEBGL_lose_context loss/restore and native Resume mission control. Game object, aircraft, complete guard records and prison stage survive. Actual restored complete-image and vegetation-array handles and bounded allocations are checked.');
      await Promise.all(digestTasks);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
      record('Desktop or touch layout completes real GPU fixtures with clean assets, JavaScript and WebGL state',{runtimeSHA256,errors,missing,screenshots:screenshots.filter(s=>s.includes(name+'-')).length},'Linux Chromium/SwiftShader only. iPhone landscape uses DPR3 and actual emulated touch; physical Windows GPUs, actual iPhone Safari, device FPS and subjective playability still require the user’s hardware test.');
    } catch(error) {
      await fs.writeFile(path.join(evidenceDir,'refinement-visual-failure.json'),JSON.stringify({suite:'refinement-visual',passed:false,complete:false,profile:name,error:error.stack||String(error),errors,missing,results,screenshots},null,2));
      await page.screenshot({path:path.join(out,name+'-failure.png'),timeout:90000}).catch(()=>{});throw error;
    } finally {await context.close();}
  }
  assert.equal(createHash('sha256').update(await fs.readFile(originalPath)).digest('hex'),originalHash);
  await fs.rm(path.join(evidenceDir,'refinement-visual-progress.json'),{force:true});
  await fs.rm(path.join(evidenceDir,'refinement-visual-failure.json'),{force:true});
  return {suite:'refinement-visual',passed:true,total:results.length,results,screenshots,physicalWindowsTested:false,actualIPhoneSafariTested:false,scope:'Actual Chromium/SwiftShader WebGL2: native prison and real original guard updates; explicitly declared world actor roster, source LOD0, isolated per-layer mip, moving-camera synthetic alias, photographic perspective/depth, terrain-contact and resource fixtures; true graphics context loss/recovery. Original source PNG hash preserved. Complete authored photographs and isolated mips are tested directly; these fixtures do not establish universal photographic fidelity. No physical device, measured FPS or completed escape claim.'};
};
