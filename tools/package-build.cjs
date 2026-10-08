'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),site=path.join(root,'dist/site');
fs.rmSync(site,{recursive:true,force:true});
fs.mkdirSync(site,{recursive:true});
// Explicit runtime allowlist. Never deploy the checkout, archive, reference_media,
// test screenshots, Git history, node_modules or development tooling.
const allow=['index.html','assets/atlas-metadata.js','assets/figures-original.png'];
for(const directory of ['photos','processed'])for(const name of fs.readdirSync(path.join(root,'assets',directory)))if(/\.(jpg|jpeg|png|webp)$/.test(name))allow.push('assets/'+directory+'/'+name);
for(const name of ['aviator','cow','farmer','female_vc','militia','nva','vegetation'])allow.push('assets/'+name+'.webp');
for(const item of allow){const dst=path.join(site,item);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,item),dst);}
fs.writeFileSync(path.join(site,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  Cache-Control: no-cache\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=allow.map(file=>({file,sha256:sha(fs.readFileSync(path.join(site,file)))}));
const metadata={commit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),entrySHA256:sha(fs.readFileSync(path.join(site,'index.html'))),files};
fs.writeFileSync(path.join(root,'dist/build-manifest.json'),JSON.stringify(metadata,null,2)+'\n');
// Python's standard-library zipper makes packaging portable in this cloud image.
cp.execFileSync('python3',['-c',"import pathlib,zipfile; p=pathlib.Path('dist/site'); z=zipfile.ZipFile('dist/Intruder_Yankee_Station_Milestone1.zip','w',zipfile.ZIP_DEFLATED); [z.write(f,f.relative_to(p)) for f in sorted(p.rglob('*')) if f.is_file()]; z.close()"],{cwd:root});
console.log('Built runtime-only Netlify folder and ZIP: dist/site, dist/Intruder_Yankee_Station_Milestone1.zip ('+allow.length+' game files)');
