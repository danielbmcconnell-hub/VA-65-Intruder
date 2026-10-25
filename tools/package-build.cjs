'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),site=path.join(root,'dist/site');
// Explicit runtime allowlist. Never deploy the checkout, archive, reference_media,
// test screenshots, Git history, node_modules or development tooling.
const allow=['index.html','assets/atlas-metadata.js','assets/figures-original.png'];
allow.push('assets/render/photographic-sprites.js','assets/survival/capture-transition.js','assets/survival/capture-transition.css');
allow.push('assets/sprites/atlas-metadata.js');
allow.push('assets/render/photo-cutouts.js','assets/render/photo-motion.js','assets/sprites/hires/manifest.json');
const cutouts=JSON.parse(fs.readFileSync(path.join(root,'assets/sprites/hires/manifest.json')));
if(cutouts.version!==1||!cutouts.subjects)throw new Error('Invalid complete photographic sprite manifest');
function addPhotoFile(file){
 if(typeof file!=='string'||!/^[a-z0-9_-]+\.(png|webp)$/.test(file))throw new Error('Invalid complete photographic sprite filename');
 const item='assets/sprites/hires/'+file;if(!allow.includes(item))allow.push(item);
}
for(const name of ['farmer','militia','female_vc','nva','aviator','cow']){
 const subject=cutouts.subjects[name];if(!subject?.poses?.idle)throw new Error('Missing complete photographic sprite '+name);
 for(const pose of Object.values(subject.poses)){
  addPhotoFile(typeof pose==='string'?pose:pose.file);
 }
 for(const [action,clip] of Object.entries(subject.animations||{})){
  if(!['walk','run','swim'].includes(action)||!Array.isArray(clip.plates)||!clip.plates.length)throw new Error('Invalid photographic motion clip '+name+':'+action);
  if(!Number.isInteger(clip.cols)||!Number.isInteger(clip.rows)||!Number.isInteger(clip.frames)||clip.cols<1||clip.rows<1||clip.frames<1||clip.frames>clip.plates.length*clip.cols*clip.rows)throw new Error('Invalid photographic motion frame layout '+name+':'+action);
  if(clip.order&&(!Array.isArray(clip.order)||clip.order.length!==clip.frames||new Set(clip.order).size!==clip.frames||clip.order.some(frame=>!Number.isInteger(frame)||frame<0||frame>=clip.frames)))throw new Error('Invalid photographic motion frame order '+name+':'+action);
  for(const plate of clip.plates)addPhotoFile(typeof plate==='string'?plate:plate.file);
 }
}
// Wildlife and botanical runtime images are exact WebP derivatives. Preserve
// the generated PNG sources and supplied references in Git, outside deployment.
allow.push('assets/survival/wildlife.js','assets/survival/wildlife-targeting.js','assets/render/wildlife-render.js','assets/render/jungle-scenery.js');
allow.push('assets/wildlife/hires/manifest.json','assets/jungle/manifest.json');
const wildlife=JSON.parse(fs.readFileSync(path.join(root,'assets/wildlife/hires/manifest.json')));
const jungle=JSON.parse(fs.readFileSync(path.join(root,'assets/jungle/manifest.json')));
if(wildlife.version!==1||!wildlife.subjects||jungle.version!==1||!jungle.plants)throw new Error('Invalid wildlife/botanical manifest');
function addRuntimePhoto(folder,file){
 if(typeof file!=='string'||!/^[a-z0-9_-]+\.webp$/.test(file))throw new Error('Invalid wildlife/botanical runtime filename');
 const item=folder+'/'+file;if(!allow.includes(item))allow.push(item);
}
for(const name of ['boar','tiger','krait','cobra','pit-viper','scorpion','centipede','weaver-ants']){
 const subject=wildlife.subjects[name];
 if(!subject||!['ground','billboard'].includes(subject.mode)||!subject.animations)throw new Error('Missing complete wildlife subject '+name);
 const required=name==='boar'||name==='tiger'?{walk:16,run:16}:['krait','cobra','pit-viper'].includes(name)?{crawl:8,threat:4}:{crawl:8};
 for(const [action,count]of Object.entries(required)){
  const clip=subject.animations[action];
  if(!clip||clip.frames!==count||clip.cols!==2||clip.rows!==2||!Array.isArray(clip.plates)||clip.plates.length*4!==count)throw new Error('Incomplete wildlife movement clip '+name+':'+action);
  if(!Array.isArray(clip.frameSize)||clip.frameSize.length!==2||!clip.frameSize.every(n=>Number.isInteger(n)&&n>=512&&n<=2048)||!Array.isArray(clip.sourceRegions)||clip.sourceRegions.length!==count||!Array.isArray(clip.registration)||clip.registration.length!==count)throw new Error('Invalid complete wildlife frame registration '+name+':'+action);
  for(const region of clip.sourceRegions){
   if(!region||!Array.isArray(region.source)||region.source.length!==4||!region.source.every(Number.isInteger)||region.source[0]<0||region.source[1]<0||region.source[2]<=0||region.source[3]<=0||!Array.isArray(region.dest)||region.dest.length!==2||!region.dest.every(Number.isFinite))throw new Error('Invalid complete wildlife source region '+name+':'+action);
   const scale=region.scale===undefined?1:region.scale;
   if(!Number.isFinite(scale)||scale<=0||region.dest[0]<0||region.dest[1]<0||region.dest[0]+region.source[2]*scale>clip.frameSize[0]+1e-6||region.dest[1]+region.source[3]*scale>clip.frameSize[1]+1e-6)throw new Error('Wildlife source region exceeds common frame '+name+':'+action);
  }
  for(const plate of clip.plates)addRuntimePhoto('assets/wildlife/hires',plate);
 }
}
if(!wildlife.nest?.file)throw new Error('Missing complete weaver-ant nest photograph');
addRuntimePhoto('assets/wildlife/hires',wildlife.nest.file);
for(const kind of ['canopy','bamboo','nipa','fern','liana','litter']){
 if(!jungle.plants[kind]?.file)throw new Error('Missing complete botanical photograph '+kind);
 addRuntimePhoto('assets/jungle',jungle.plants[kind].file);
}
if(!jungle.crown?.file)throw new Error('Missing photographic aerial tree crown');
addRuntimePhoto('assets/jungle',jungle.crown.file);
if(!jungle.floor?.file||!Number.isFinite(jungle.floor.worldSize)||jungle.floor.worldSize<=0)throw new Error('Missing photographic forest-floor material');
addRuntimePhoto('assets/jungle',jungle.floor.file);
for(const kind of ['broadleaf','palm']){
 const component=jungle.components?.[kind];
 if(!component?.file||!Array.isArray(component.root)||component.root.length!==2||!component.root.every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw new Error('Missing registered photographic leaf component '+kind);
 addRuntimePhoto('assets/jungle',component.file);
}
allow.push('assets/render/visual-clarity.js','assets/flight/threat-feedback.js');
allow.push('assets/render/coastal-scenery.js','assets/render/village-detail.js');
allow.push('assets/ui/hud-layout.js','assets/ui/hud-layout.css','assets/pow/confinement-goals.js','assets/pow/confinement-goals.css');
allow.push('assets/survival/ground-items.js');
allow.push('assets/render/ground-items-render.js','assets/survival/ground-items.css','assets/items/manifest.json');
const groundItems=JSON.parse(fs.readFileSync(path.join(root,'assets/items/manifest.json')));
if(groundItems.version!==1||!groundItems.items)throw new Error('Invalid useful-item photo manifest');
addRuntimePhoto('assets/items',groundItems.file);
allow.push('assets/pow/prison-detail.js','assets/pow/prison-food.js','assets/pow/prison-food.css','assets/pow/ration-photo.js','assets/prison/manifest.json');
const prison=JSON.parse(fs.readFileSync(path.join(root,'assets/prison/manifest.json')));
const prisonFiles=new Set();
function prisonMaterials(value){
 if(typeof value==='string'&&value.endsWith('.webp')){
  addRuntimePhoto('assets/prison',value);prisonFiles.add(value);
 }else if(Array.isArray(value))value.forEach(prisonMaterials);
 else if(value&&typeof value==='object')Object.values(value).forEach(prisonMaterials);
}
prisonMaterials(prison);
for(const file of ['materials.webp','cell-materials.webp','ration.webp','ration-empty.webp'])if(!prisonFiles.has(file))throw new Error('Missing complete prison material registration: '+file);
// The moving carrier, survival and demonstration integrations are mandatory
// dependencies of index.html. Only complete runtime crew images are included.
allow.push('assets/audio/crew-personality.js','assets/audio/voice-profiles.js','assets/flight/aircraft-detail.js','assets/flight/carrier-launch.js','assets/flight/mission-demo.js');
allow.push('assets/survival/landing-water.js','assets/survival/aviator-companion.js','assets/survival/descent-threats.js');
allow.push('assets/carrier/hires/manifest.json');
const carrier=JSON.parse(fs.readFileSync(path.join(root,'assets/carrier/hires/manifest.json')));
if(carrier.version!==1||!carrier.roles)throw new Error('Invalid photographic deck-crew manifest');
for(const role of ['yellow','green','red','blue','brown','white']){
 const subject=carrier.roles[role];
 if(!subject?.idle?.file)throw new Error('Missing complete deck-crew photograph '+role);
 addRuntimePhoto('assets/carrier/hires',subject.idle.file);
 for(const [action,clip]of Object.entries(subject.animations||{})){
  if(!['signal','inspect','walk'].includes(action)||!Array.isArray(clip.plates)||!clip.plates.length||!Number.isInteger(clip.frames)||clip.frames<1||clip.frames!==clip.plates.length*clip.cols*clip.rows)throw new Error('Invalid deck-crew animation '+role+':'+action);
  if(!Array.isArray(clip.sourceRegions)||clip.sourceRegions.length!==clip.frames||!Array.isArray(clip.registration)||clip.registration.length!==clip.frames)throw new Error('Incomplete deck-crew registration '+role+':'+action);
  for(const plate of clip.plates)addRuntimePhoto('assets/carrier/hires',plate);
 }
}
for(const name of ['fists','pistol','knife','radio','smoke-day','smoke-night'])allow.push('assets/firstperson/'+name+'.png');
allow.push('assets/firstperson/punch-left.webp','assets/firstperson/punch-right.webp','assets/firstperson/stick.webp','assets/firstperson/rifle.webp');
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
if(new Set(allow).size!==allow.length)throw new Error('Duplicate deployment allowlist item');
// A newly integrated startup module must never disappear from a release just
// because the development server can read files outside this explicit list.
const startup=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const tag of startup.matchAll(/<(?:script|link)\b[^>]*>/gi)){
 for(const match of tag[0].matchAll(/(?:src|href)=["']([^"']+)["']/g)){
  const dependency=match[1].replace(/^\.\//,'').split(/[?#]/)[0];
  if(dependency.startsWith('assets/')&&!allow.includes(dependency))throw new Error('Startup dependency missing from runtime allowlist: '+dependency);
 }
}
for(const file of allow)if(!fs.statSync(path.join(root,file)).isFile())throw new Error('Runtime source is not a regular file: '+file);
fs.rmSync(site,{recursive:true,force:true});
fs.mkdirSync(site,{recursive:true});
for(const item of allow){const dst=path.join(site,item);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,item),dst);}
fs.writeFileSync(path.join(site,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n  Cache-Control: no-cache\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=[...allow,'_headers'].map(file=>({file,sha256:sha(fs.readFileSync(path.join(site,file)))}));
const archiveFile='Intruder_Yankee_Station_Cockpit_Focus.zip';
const metadata={commit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),entrySHA256:sha(fs.readFileSync(path.join(site,'index.html'))),archiveFile,files};
fs.writeFileSync(path.join(root,'dist/build-manifest.json'),JSON.stringify(metadata,null,2)+'\n');
// Python's standard-library zipper makes packaging portable in this cloud image.
cp.execFileSync('python3',['-c',"import pathlib,sys,zipfile; p=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED); [z.write(f,f.relative_to(p)) for f in sorted(p.rglob('*')) if f.is_file()]; z.close()",site,path.join(root,'dist',archiveFile)],{cwd:root});
console.log('Built runtime-only folder and ZIP: dist/site, dist/'+archiveFile+' ('+allow.length+' game files)');
