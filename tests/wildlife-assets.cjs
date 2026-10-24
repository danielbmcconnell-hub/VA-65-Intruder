'use strict';
// Runtime registration/source-preservation checks. Decoded pixels and complete
// component bounds are independently measured by check-wildlife-assets.py;
// browser tests additionally exercise the actual retained WebGL textures.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'assets/wildlife/hires');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const wildlife=()=>read(path.join(folder,'manifest.json'));

test('all eight wildlife identities have the complete required photographic cycles and actual source regions',()=>{
 const m=wildlife();assert.equal(m.version,1);
 const expected={boar:{walk:16,run:16},tiger:{walk:16,run:16},krait:{crawl:8,threat:4},cobra:{crawl:8,threat:4},'pit-viper':{crawl:8,threat:4},scorpion:{crawl:8},centipede:{crawl:8},'weaver-ants':{crawl:8}};
 assert.deepEqual(Object.keys(m.subjects).sort(),Object.keys(expected).sort());let total=0,plates=0;
 for(const [name,clips]of Object.entries(expected)){
  const subject=m.subjects[name];assert.ok(['ground','billboard'].includes(subject.mode));
  for(const dimension of ['length','width','height'])assert.ok(Number.isFinite(subject[dimension])&&subject[dimension]>0,name+' physical '+dimension);
  assert.deepEqual(Object.keys(subject.animations).sort(),Object.keys(clips).sort());
  for(const [action,count]of Object.entries(clips)){
   const c=subject.animations[action];assert.equal(c.frames,count,name+':'+action);assert.equal(c.cols*c.rows,4);assert.equal(c.plates.length,count/4);plates+=c.plates.length;total+=count;
   assert.equal(c.sourceRegions.length,count);assert.equal(c.registration.length,count);assert.equal(c.bounds.length,count);assert.equal(c.plateLayouts.length,c.plates.length);
   assert.equal(c.facing,'right');assert.ok(Number.isFinite(c.stride)&&c.stride>0);
   assert.ok(c.frameSize[0]>=768&&c.frameSize[1]>=512);
   for(let i=0;i<count;i++){
    const region=c.sourceRegions[i],scale=region.scale===undefined?1:region.scale;
    assert.equal(region.source.length,4);assert.ok(region.source.every(Number.isInteger));assert.ok(region.source[0]>=0&&region.source[1]>=0&&region.source[2]>0&&region.source[3]>0);
    assert.ok(region.dest.every(Number.isFinite)&&region.dest[0]>=0&&region.dest[1]>=0);assert.ok(Number.isFinite(scale)&&scale>0);
    assert.ok(region.dest[0]+region.source[2]*scale<=c.frameSize[0]+1e-6&&region.dest[1]+region.source[3]*scale<=c.frameSize[1]+1e-6,'A whole photograph fits its common canvas without clipping');
    const b=c.bounds[i];assert.ok(b[0]>=0&&b[1]>=0&&b[2]>b[0]&&b[3]>b[1]&&b[2]<=c.frameSize[0]&&b[3]<=c.frameSize[1]);
    assert.ok(c.registration[i].baseline>0&&c.registration[i].baseline<=1&&c.registration[i].center>=0&&c.registration[i].center<=1);
   }
   for(const [index,file]of c.plates.entries()){
    assert.match(file,/^[a-z0-9-]+\.webp$/);assert.ok(fs.statSync(path.join(folder,file)).size>1000);
    const layout=c.plateLayouts[index];assert.equal(layout.cols*layout.rows,4);assert.ok(layout.cols===1&&layout.rows===4||layout.cols===2&&layout.rows===2,'Actual source packing is recorded separately from logical frame slots');
   }
  }
 }
 assert.equal(total,124);assert.equal(plates,31);assert.equal(m.nest.file,'nest.webp');assert.ok(fs.statSync(path.join(folder,m.nest.file)).size>1000);
});

test('independent source audit is complete, exact and tied to the current generated files',()=>{
 const report=read(path.join(folder,'provenance.json'));
 assert.equal(report.completeClips,13);assert.equal(report.totalFrames,124);assert.equal(report.totalPlates,31);assert.deepEqual(report.incomplete,[]);assert.deepEqual(report.invalid,[]);
 assert.equal(report.singleImages.length,7);assert.equal(report.references.reduce((n,g)=>n+g.count,0),62);
 for(const reference of report.references){assert.ok(reference.allOriginalSHA256Preserved);assert.equal(sha(path.join(root,reference.manifest)),reference.manifestSHA256);}
 for(const clip of report.clips){
  assert.equal(clip.uniqueCompleteFrames,clip.frames);assert.equal(clip.cells.length,clip.frames);
  for(const cell of clip.cells){assert.equal(cell.foreignFigurePixels,0);assert.equal(cell.componentComplete,true);assert.ok(cell.opaqueInteriorFraction>=.85);}
  for(const plate of clip.plates){assert.equal(plate.decodedRGBAIdentical,true);assert.equal(plate.includesInvisibleRGB,true);assert.equal(sha(path.join(root,plate.sourcePNG)),plate.sourceSHA256);assert.equal(sha(path.join(root,plate.runtimeWebP)),plate.runtimeSHA256);}
 }
 for(const image of report.singleImages){assert.ok(image.completeSource&&image.decodedRGBAIdentical&&image.includesInvisibleRGB);assert.equal(sha(path.join(root,image.sourcePNG)),image.sourceSHA256);assert.equal(sha(path.join(root,image.runtimeWebP)),image.runtimeSHA256);}
});

test('all six jungle plants use complete individually registered photographs with preserved source RGBA',()=>{
 const m=read(path.join(root,'assets/jungle/manifest.json'));assert.equal(m.version,1);
 assert.deepEqual(Object.keys(m.plants).sort(),['bamboo','canopy','fern','liana','litter','nipa']);
 for(const [kind,p]of Object.entries(m.plants)){
  assert.equal(p.file,kind+'.webp');assert.ok(Math.min(p.width,p.height)>=768&&Math.max(p.width,p.height)>=1024);
  assert.ok(p.bounds[0]>0&&p.bounds[1]>0&&p.bounds[2]<p.width&&p.bounds[3]<p.height,'Entire plant has a transparent margin');
  assert.ok(p.baseline>0&&p.baseline<1&&p.center>=0&&p.center<=1&&p.bodyHeight>0&&p.bodyHeight<1);
  assert.ok(fs.statSync(path.join(root,'assets/jungle',p.file)).size>1000);
 }
 const encoding=read(path.join(folder,'encoding-provenance.json'));assert.equal(encoding.count,38);assert.equal(encoding.files.length,38);
 for(const pair of encoding.files){assert.ok(pair.allRGBAIdentical&&pair.includesInvisibleRGB);assert.equal(sha(path.join(root,pair.sourcePNG)),pair.sourceSHA256);assert.equal(sha(path.join(root,pair.runtimeWebP)),pair.runtimeSHA256);}
});

test('reviewed tiger camera corrections transform complete photographs and preserve the raw source audit',()=>{
 const m=wildlife(),run=m.subjects.tiger.animations.run;
 for(let frame=0;frame<16;frame++)assert.equal(run.sourceRegions[frame].scale??1,frame<4?1:frame<8?.88:.86);
 for(const [name,subject]of Object.entries(m.subjects))for(const [action,c]of Object.entries(subject.animations))if(name!=='tiger'||action!=='run')for(const region of c.sourceRegions)assert.equal(region.scale??1,1,'Other photographs retain their measured source scale');
 const report=read(path.join(folder,'provenance.json')).clips.find(c=>c.subject==='tiger'&&c.clip==='run');
 assert.equal(report.bodyScaleReviewRequired,true,'The pre-correction silhouette flag remains visible');
 assert.deepEqual(report.cameraScaleCorrection.map(c=>[c.plate,c.scale]),[['b',.88],['c',.86],['d',.86]]);
 for(const correction of report.cameraScaleCorrection){assert.equal(sha(path.join(folder,'tiger-run-'+correction.plate+'.png')),correction.sourceSHA256);assert.equal(sha(path.join(folder,'tiger-run-'+correction.plate+'.webp')),correction.runtimeSHA256);}
 assert.equal(report.correctedPlateMedianOpaqueBodyHeights.length,4);
});
