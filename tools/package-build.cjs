'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),site=path.join(root,'dist/site');
fs.rmSync(site,{recursive:true,force:true});
fs.mkdirSync(site,{recursive:true});
// Explicit runtime allowlist. Never deploy the checkout, archive, reference_media,
// test screenshots, Git history, node_modules or development tooling.
const allow=['index.html','assets/atlas-metadata.js','assets/figures-original.png'];
allow.push('assets/render/photographic-sprites.js','assets/survival/capture-transition.js','assets/survival/capture-transition.css');
allow.push('assets/sprites/atlas-metadata.js');
allow.push('assets/render/photo-cutouts.js','assets/sprites/hires/manifest.json');
const cutouts=JSON.parse(fs.readFileSync(path.join(root,'assets/sprites/hires/manifest.json')));
if(cutouts.version!==1||!cutouts.subjects)throw new Error('Invalid complete photographic sprite manifest');
for(const name of ['farmer','militia','female_vc','nva','aviator','cow']){
 const subject=cutouts.subjects[name];if(!subject?.poses?.idle)throw new Error('Missing complete photographic sprite '+name);
 for(const pose of Object.values(subject.poses)){
  const file=typeof pose==='string'?pose:pose.file;
  if(!/^[a-z0-9_-]+\.png$/.test(file))throw new Error('Invalid complete photographic sprite filename');
  const item='assets/sprites/hires/'+file;if(!allow.includes(item))allow.push(item);
 }
}
for(const name of ['fists','pistol','knife','radio','smoke-day','smoke-night'])allow.push('assets/firstperson/'+name+'.png');
for(const name of fs.readdirSync(path.join(root,'assets/photos')))if(/\.(jpg|jpeg|png|webp)$/.test(name))allow.push('assets/photos/'+name);
allow.push('assets/processed/vegetation.webp');
allow.push('assets/history/manifest.json');
for(const asset of JSON.parse(fs.readFileSync(path.join(root,'assets/history/manifest.json')))){
 if(!/^[a-z0-9_-]+\.(webp|png)$/.test(asset.file))throw new Error('Invalid historical runtime filename');
 allow.push('assets/history/'+asset.file);
}
for(const name of ['core.js','core.css','ai.js','river.js','captivity.js','solidarity.js','denton-flashback.js','mindscape.js','regular-confinement.js','history.js','feedback.js','onboarding.js'])allow.push('assets/pow/'+name);
for(const name of ['episode-shaders.js','episode-scene.js','episode-stealth.js','episode-actions.js','episode-actions.css','episode-audio.js','figure-motion.js','memory-detail.js'])allow.push('assets/pow/'+name);
allow.push('assets/flight/coach.js','assets/render/sprite-layers.js','assets/render/contact-shadows.js','assets/render/quality-policy.js','assets/survival/ground-view.js','assets/survival/equipment-view.js','assets/survival/ground-combat.js','assets/render/terrain-shadows.js','assets/render/near-ground.js');
allow.push('assets/survival/ammunition.js','assets/flight/strike-board.js','assets/flight/strike-board.css','assets/flight/strike-effects.js');
allow.push('assets/flight/strike-scene.js','assets/flight/strike-checkpoint.js','assets/flight/strike-crew.js','assets/flight/strike-crew.css','assets/flight/strike-experience.js','assets/flight/strike-experience.css');
allow.push('assets/flight/tactical-approach.js','assets/flight/tactical-approach.css','assets/flight/visual-materials.js','assets/flight/airframe-feedback.js','assets/flight/airframe-feedback.css');
allow.push('assets/flight/sortie-checkpoint.js','assets/flight/route-scene.js','assets/flight/immersion.js','assets/flight/immersion.css');
for(const name of ['interceptor.js','flak.js','sprites.js','presentation.js','presentation.css','mission.js'])allow.push('assets/willard/'+name);
for(const name of ['MiG17PF_Willard_Egress_ATLAS.png','MiG17PF_Willard_Egress_ATLAS.json'])allow.push('assets/willard/media/'+name);
for(const name of fs.readdirSync(path.join(root,'assets/willard/media/sprites')))if(/^[a-zA-Z0-9_+.-]+\.png$/.test(name))allow.push('assets/willard/media/sprites/'+name);
allow.push('assets/vegetation.webp');
for(const item of allow){const dst=path.join(site,item);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,item),dst);}
fs.writeFileSync(path.join(site,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  Cache-Control: no-cache\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=[...allow,'_headers'].map(file=>({file,sha256:sha(fs.readFileSync(path.join(site,file)))}));
const metadata={commit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),entrySHA256:sha(fs.readFileSync(path.join(site,'index.html'))),files};
fs.writeFileSync(path.join(root,'dist/build-manifest.json'),JSON.stringify(metadata,null,2)+'\n');
// Python's standard-library zipper makes packaging portable in this cloud image.
cp.execFileSync('python3',['-c',"import pathlib,zipfile; p=pathlib.Path('dist/site'); z=zipfile.ZipFile('dist/Intruder_Yankee_Station_High_Resolution_Photos.zip','w',zipfile.ZIP_DEFLATED); [z.write(f,f.relative_to(p)) for f in sorted(p.rglob('*')) if f.is_file()]; z.close()"],{cwd:root});
console.log('Built runtime-only Netlify folder and ZIP: dist/site, dist/Intruder_Yankee_Station_High_Resolution_Photos.zip ('+allow.length+' game files)');
