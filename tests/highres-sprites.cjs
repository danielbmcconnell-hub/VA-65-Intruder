'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),window={};
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/render/photo-cutouts.js'),'utf8'),{window});
const C=window.PhotoCutouts,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);

test('whole portrait and landscape sources keep their original aspect, visible height and sole line',()=>{
  for(const [width,height,bounds,bodyHeight]of [[1024,1536,[210,45,850,1480],1.76],[1536,1024,[30,180,1500,990],1.42],[1024,1536,[42,150,985,1300],1.25]]){
    const s={photoCutout:true,photoWidth:width,photoHeight:height,photoBounds:bounds,p:[7,12,-9],h:bodyHeight,photoName:'nva'},before=JSON.stringify(s);
    const q=C.anchor(s);
    assert.equal(q.cell,0);assert.equal(q.cols,1);assert.equal(q.rows,1);assert.equal(q.motion,null);
    near(q.w/q.h,width/height);near(q.h*(bounds[3]-bounds[1])/height,bodyHeight);
    near(q.p[1]+q.h*(1-bounds[3]/height),12);assert.equal(q.p[0],7);assert.equal(q.p[2],-9);
    assert.equal(JSON.stringify(s),before,'Measuring/rendering a photograph cannot alter its source descriptor');
  }
});

test('unsupported or empty whole-image descriptors cannot emit a broken render quad',()=>{
  for(const value of [null,{}, {photoCutout:true}, {photoCutout:true,photoWidth:1024,photoHeight:1536,photoBounds:[0,30,800,30],p:[0,0,0],h:1.76}])assert.equal(C.anchor(value),null);
});

test('every base photographic subject has a separate high-resolution PNG instead of a tiny atlas cell',()=>{
  const folder=path.join(root,'assets/sprites/hires'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
  assert.equal(manifest.version,1);
  for(const name of ['farmer','militia','female_vc','nva','aviator','cow']){
    const subject=manifest.subjects[name];assert.ok(subject&&subject.poses&&subject.poses.idle,name);
    for(const [pose,value]of Object.entries(subject.poses)){
      const file=typeof value==='string'?value:value.file;
      // The optional suspended-harness pose has an exact lossless WebP runtime
      // plus unchanged PNG source; the base portraits remain original PNGs.
      const sourceFile=pose==='harness'?(assert.equal(name,'aviator'),assert.equal(file,'aviator-harness.webp'),file.replace(/\.webp$/,'.png')):file;
      const bytes=fs.readFileSync(path.join(folder,sourceFile));
      assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
      const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
      assert.ok(Math.min(width,height)>=768 && Math.max(width,height)>=1024,name+':'+pose+' '+width+'x'+height);
      assert.ok(bytes.length>100000,'A complete photographic source must retain image detail: '+file);
    }
  }
  for(const name of ['nva','militia','female_vc'])assert.ok(manifest.subjects[name].poses.aim,'Complete aimed photograph missing for '+name);
});
