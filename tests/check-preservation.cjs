'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/photos/manifest.json')));
for(const item of manifest){const bytes=fs.readFileSync(path.join(root,item.path));assert.equal(hash(bytes),item.sha256,item.path);if(!item.source.includes(':'))assert.deepEqual(bytes,fs.readFileSync(path.join(root,item.source)),item.source+' retained exactly');}
const baseline=cp.execFileSync('git',['show','chatgpt-v11-baseline:index.html'],{cwd:root,maxBuffer:8*1024*1024}).toString();
const current=fs.readFileSync(path.join(root,'index.html'),'utf8');
const region=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i,'missing protected region '+a);return s.slice(i,j);};
// These tests protect real content and simulation, rather than mirroring fixes.
assert.equal(region(current,'const MISSIONS = [','const AC ='),region(baseline,'const MISSIONS = [','const AC ='),'historical mission definitions and briefing content');
for(const marker of ['const AC = {'])assert.equal(current.match(/const AC = \{[^\n]+/)[0],baseline.match(/const AC = \{[^\n]+/)[0],'aircraft constants');
assert.equal(region(current,'const AC =', 'class World'),region(baseline,'const AC =', 'class World'),'flight simulation');
const topFunctionRegion=(source,name)=>{
  const marker='function '+name+'(',start=source.indexOf(marker);
  assert.ok(start>=0,'missing protected geometry '+name);
  const next=/^function\s+[A-Za-z_$][\w$]*\s*\(/gm;
  next.lastIndex=start+marker.length;
  const end=next.exec(source);
  assert.ok(end&&end.index>start,'missing following top-level model function');
  return source.slice(start,end.index);
};
assert.equal(topFunctionRegion(current,'buildIntruder'),topFunctionRegion(baseline,'buildIntruder'),'historical A-6A geometry and markings');
for(const name of ['aviator','cow','farmer','female_vc','militia','nva','vegetation']){const bytes=fs.readFileSync(path.join(root,'assets',name+'.webp'));const original=cp.execFileSync('git',['show','chatgpt-v11-baseline:assets/'+name+'.webp'],{cwd:root,maxBuffer:3*1024*1024});assert.equal(hash(bytes),hash(original),'original atlas '+name);}
new Function(current.match(/<script>([\s\S]*?)<\/script>/)[1]);
console.log('PASS: exact original photograph hashes, historical missions, complete aircraft physics, A-6A geometry/markings, original atlases and JavaScript syntax');
