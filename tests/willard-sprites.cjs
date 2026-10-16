'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),media=path.join(root,'assets/willard/media');
const atlas=JSON.parse(fs.readFileSync(path.join(media,'MiG17PF_Willard_Egress_ATLAS.json'),'utf8'));
const ctx=vm.createContext({console});vm.runInContext(fs.readFileSync(path.join(root,'assets/willard/sprites.js'),'utf8'),ctx);const S=ctx.WillardSprites;
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
const plain=x=>JSON.parse(JSON.stringify(x)),near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]).sort();}
function decodePNG(file){
 const bytes=fs.readFileSync(file);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');let w,h,depth,type,idat=[];
 for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p),kind=bytes.toString('ascii',p+4,p+8),data=bytes.subarray(p+8,p+8+n);if(kind==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);depth=data[8];type=data[9];assert.equal(data[12],0);}if(kind==='IDAT')idat.push(data);p+=n+12;}
 assert.equal(depth,8);assert.equal(type,6);const raw=zlib.inflateSync(Buffer.concat(idat)),stride=w*4,pixels=Buffer.alloc(w*h*4);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<h;y++){const filter=raw[y*(stride+1)];assert.ok(filter<=4);for(let x=0;x<stride;x++){const a=x>=4?pixels[y*stride+x-4]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=4?pixels[(y-1)*stride+x-4]:0,v=raw[y*(stride+1)+1+x];pixels[y*stride+x]=(v+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;}}
 return {w,h,pixels};
}
const e={p:[0,0,0],yaw:0,pitch:0,roll:0,v:[0,0,-200],alive:true,health:1};
const above={eye:[0,150,0],camRight:[1,0,0],camUp:[0,0,-1]};
test('supplied 60-file archive remains byte-exact, including demonstration files retained as reference',()=>{const f=files(media);assert.equal(f.length,60);const h=crypto.createHash('sha256');for(const p of f){h.update(path.relative(media,p).split(path.sep).join('/'));h.update('\0');h.update(fs.readFileSync(p));}assert.equal(h.digest('hex'),'9ad8d08126e4c557fb8059fd52172625e70fa8fcc302117410274e75b878b049');});
test('metadata validates all 54 frames and all 48 heading/bank combinations',()=>{assert.equal(S.validateAtlas(atlas),atlas);assert.equal(Object.keys(atlas.frames).length,54);});
test('atlas rejects out-of-bounds coordinates',()=>{const a=structuredClone(atlas);a.frames.front.frame.x=4096;assert.throws(()=>S.validateAtlas(a),/Invalid Willard frame/);});
test('atlas rejects duplicate cells',()=>{const a=structuredClone(atlas);a.frames.front.frame={...a.frames.rear.frame};assert.throws(()=>S.validateAtlas(a),/Overlapping/);});
test('atlas rejects wrong documented heading',()=>{const a=structuredClone(atlas);a.frames['flight_h01_b+00'].meta.headingDegrees=24;assert.throws(()=>S.validateAtlas(a),/metadata/);});
test('all 54 original PNG alpha/visible pixels exactly match their atlas rectangles',()=>{const big=decodePNG(path.join(media,atlas.image));assert.equal(big.w,4096);assert.equal(big.h,3584);for(const [name,item] of Object.entries(atlas.frames)){const small=decodePNG(path.join(media,item.filename)),f=item.frame;assert.equal(small.w,f.w);assert.equal(small.h,f.h);for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){const a=((f.y+y)*big.w+f.x+x)*4,b=(y*f.w+x)*4;assert.equal(big.pixels[a+3],small.pixels[b+3],`${name} alpha ${x},${y}`);if(small.pixels[b+3])for(let k=0;k<3;k++)assert.equal(big.pixels[a+k],small.pixels[b+k],`${name} visible RGB ${x},${y}`);}}
 // Supplied files contain 1,400 differing RGB values under alpha zero. They are invisible; originals remain unmodified.
});
test('exact supplied pivots and half-texel inset preserve unmirrored UV order',()=>{for(const [name,item] of Object.entries(atlas.frames)){const f=S.frameUV(atlas,name);assert.deepEqual(plain(f.pivot),[item.pivot.x,item.pivot.y]);assert.ok(f.uv[2]>0&&f.uv[3]>0);near(f.uv[0],(item.frame.x+.5)/4096);near(f.uv[1],(item.frame.y+.5)/3584);near(f.uv[0]+f.uv[2],(item.frame.x+511.5)/4096);}});
for(const bank of [-30,0,30])test('camera-above orientation selects all 16 supplied headings at bank '+bank,()=>{for(let h=0;h<16;h++){const s=S.select(above,{...e,yaw:h*Math.PI/8,roll:bank*Math.PI/180});assert.equal(s.name,'flight_h'+String(h).padStart(2,'0')+'_b'+(bank<0?'-30':bank>0?'+30':'+00'));assert.equal(s.flip,false);assert.equal(s.mode,'upper-directional');near(s.angle,0);}});
test('north wrapping does not create a discontinuous 360-degree residual turn',()=>{for(const yaw of [-.0001,.0001,2*Math.PI-.0001]){const s=S.select(above,{...e,yaw});assert.equal(s.name,'flight_h00_b+00');assert.ok(Math.abs(s.angle)<.001);}});
test('camera heading, not world heading alone, determines overhead art',()=>{const rotated={...above,camRight:[0,0,1],camUp:[1,0,0]};assert.equal(S.select(rotated,e).name,'flight_h12_b+00');});
test('front aspect uses authentic front artwork when interceptor approaches camera',()=>{const s=S.select({eye:[0,0,-100],camRight:[-1,0,0],camUp:[0,1,0]},e);assert.equal(s.name,'front');assert.equal(s.flip,false);});
test('rear aspect uses authentic rear artwork when interceptor flies away',()=>{assert.equal(S.select({eye:[0,0,100],camRight:[1,0,0],camUp:[0,1,0]},e).name,'rear');});
test('side aspects keep actual nose projection without reflecting serial or markings',()=>{const left=S.select({eye:[100,0,0],camRight:[0,0,1],camUp:[0,1,0]},e),right=S.select({eye:[-100,0,0],camRight:[0,0,-1],camUp:[0,1,0]},e);assert.equal(left.name,'left_side');assert.ok(left.noseScreen[0]<0);assert.equal(right.name,'right_side');assert.ok(right.noseScreen[0]>0);assert.equal(left.flip,false);assert.equal(right.flip,false);near(left.angle,0);near(right.angle,0);});
test('below-aircraft camera selects original underside, never a mirrored top frame',()=>{const s=S.select({eye:[0,-100,0],camRight:[1,0,0],camUp:[0,0,-1]},e);assert.equal(s.name,'bottom');assert.equal(s.flip,false);assert.equal(s.limitedAspect,true);});
test('positive bank lowers physical right wing exactly as existing bodyAxes convention',()=>{const a=S.axes({...e,roll:Math.PI/6});assert.ok(a.right[1]<0);assert.ok(a.up[0]>0);near(a.f[2],-1);});
test('front and rear banking respond to true camera-relative body up',()=>{const front=S.select({eye:[0,0,-100],camRight:[-1,0,0],camUp:[0,1,0]},{...e,roll:Math.PI/6}),rear=S.select({eye:[0,0,100],camRight:[1,0,0],camUp:[0,1,0]},{...e,roll:Math.PI/6});near(front.angle,-Math.PI/6);near(rear.angle,Math.PI/6);});
test('pitch changes nose elevation without changing world location',()=>{const s=S.select({eye:[-100,0,0],camRight:[0,0,-1],camUp:[0,1,0]},{...e,pitch:.2});assert.ok(s.noseScreen[1]>0);assert.deepEqual(plain(s.worldPosition),[0,0,0]);assert.ok(s.angle<0);});
test('body axes remain finite for vertical pitch and remain unit length',()=>{const a=S.axes({...e,pitch:Math.PI/2});for(const v of Object.values(a)){assert.ok(v.every(Number.isFinite));near(Math.hypot(...v),1);}});
test('physical frame dimensions compensate original padding rather than enlarging close aircraft arbitrarily',()=>{const s=S.select(above,e);near(s.size*355/512,11.36);const front=S.select({eye:[0,0,-100],camRight:[-1,0,0],camUp:[0,1,0]},e);near(front.size*465/512,9.63);});
test('render selection preserves enemy pose, velocity and health',()=>{const original=structuredClone(e);S.select(above,e);assert.deepEqual(e,original);});
test('unloaded inspection has no GPU allocations and documentation states card limitations',()=>{assert.deepEqual(plain(S.inspect({})),{status:'unloaded',draws:0});assert.match(S.limitations,/not a physically exact 3D/);});
console.log(JSON.stringify({suite:'willard-sprites',passed,failed:0,scope:'Original asset byte/pixel validation and pure orientation geometry; actual WebGL imagery is tested separately.'}));
