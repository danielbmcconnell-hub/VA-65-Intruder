/* Bundled generic neural male performances, generated locally from licensed
 * models. No family voice or authentic historical recording is represented. */
(function(root){'use strict';
 const records=new WeakMap(),owners=new Set(),wrapped=new WeakSet();
 const LIMITS=Object.freeze({cacheBytes:12*1024*1024,cacheClips:24,staleMilliseconds:6500});
 const now=()=>root.performance?.now?.()??Date.now();
 const role=who=>/^(?:PILOT|TURCZYN)$/.test(String(who).toUpperCase())?'pilot':/^(?:SHIP|AIR BOSS|LSO|SANDY|JOLLY|US NAVY|GUARD|ATC)$/.test(String(who).toUpperCase())?'radio':'navigator';
 const clean=(text,lang)=>String(root.VoiceProfiles?.spokenText?.(text,lang)||text||'').replace(/’/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
 function lookup(who,text,lang='en-US'){
  if(!String(lang||'en-US').toLowerCase().replace('_','-').startsWith('en'))return null;
  const key=role(who)+'|'+clean(text,lang),clips=root.NeuralDialogueCatalog?.clips||[];return clips.find(c=>c.key===key)||clips.find(c=>c.captionPrefix&&key.startsWith(c.key+' '))||null;
 }
 function state(owner){let s=records.get(owner);if(!s){s={cache:new Map(),bytes:0,last:new Map(),accepted:0,started:0,completed:0,failed:0,suppressed:0,lastClip:null,lastError:null};records.set(owner,s);}return s;}
 function finish(owner,record){if(record.duckUntil&&owner.duckUntil===record.duckUntil)owner.duckUntil=Math.max(record.previousDuck||0,owner.ctx?.currentTime||0);if(owner._speechActive===record)owner._speechActive=null;}
 function stop(owner){const record=owner?._speechActive;if(!record)return false;
  record.cancelled=true;record.abort?.abort();try{record.source?.stop();}catch(_){}
  if(record.utterance)try{root.speechSynthesis?.cancel();}catch(_){}
  finish(owner,record);return true;
 }
 function permitted(owner,record){const app=root.App;
  return owner._speechActive===record&&!record.cancelled&&owner.spoken&&owner.on&&owner.ctx?.state==='running'&&!root.document?.hidden&&now()-record.at<LIMITS.staleMilliseconds&&(!app||app.audio!==owner||app.set?.sound!==0&&app.set?.voices!==0&&app._missionStart===record.mission);
 }
 function install(owner){owners.add(owner);const app=root.App;if(!app||wrapped.has(app))return;wrapped.add(app);
  const start=app.start,show=app.show,pause=app.pause;
  if(typeof start==='function')app.start=function(){stop(this.audio);return start.apply(this,arguments);};
  if(typeof show==='function')app.show=function(id){if(id!=='game')stop(this.audio);return show.apply(this,arguments);};
  if(typeof pause==='function')app.pause=function(on){const r=pause.apply(this,arguments);if(this.game?.paused)stop(this.audio);return r;};
 }
 async function buffer(owner,clip,record){const s=state(owner),cached=s.cache.get(clip.file);if(cached){s.cache.delete(clip.file);s.cache.set(clip.file,cached);return cached;}
  const response=await root.fetch('assets/audio/dialogue/'+clip.file,{signal:record.abort?.signal});if(!response.ok)throw Error('Dialogue HTTP '+response.status);
  const decoded=await owner.ctx.decodeAudioData(await response.arrayBuffer());const bytes=decoded.length*decoded.numberOfChannels*4;
  if(bytes<=LIMITS.cacheBytes){while(s.cache.size&&(s.bytes+bytes>LIMITS.cacheBytes||s.cache.size>=LIMITS.cacheClips)){const first=s.cache.keys().next().value,old=s.cache.get(first);s.bytes-=old.length*old.numberOfChannels*4;s.cache.delete(first);}s.cache.set(clip.file,decoded);s.bytes+=bytes;}return decoded;
 }
 function speak(owner,who,text,lang,tone){const clip=lookup(who,text,lang);if(!clip)return null;
  if(!owner?.on||!owner.spoken||owner.ctx?.state!=='running'||!owner.master||!root.fetch)return null;
  install(owner);const s=state(owner),priority=root.VoiceProfiles?.mood(text,tone)==='urgent'?2:root.VoiceProfiles?.mood(text,tone)==='alert'?1:0,t=now(),active=owner._speechActive,browserBusy=root.speechSynthesis&&(root.speechSynthesis.speaking||root.speechSynthesis.pending);
  if((active||browserBusy)&&(!active||priority<=active.priority)){s.suppressed++;return false;}
  if(t-(s.last.get(clip.key)??-Infinity)<(priority===2?2800:10000)){s.suppressed++;return false;}
  if(active)stop(owner);
  const record={kind:'neural',priority,at:t,mission:root.App?._missionStart,id:clip.id,abort:root.AbortController?new root.AbortController():null,cancelled:false};owner._speechActive=record;s.accepted++;s.lastClip=clip.id;s.lastError=null;s.last.set(clip.key,t);while(s.last.size>48)s.last.delete(s.last.keys().next().value);
  buffer(owner,clip,record).then(decoded=>{if(!permitted(owner,record)){finish(owner,record);return;}const source=owner.ctx.createBufferSource(),gain=owner.ctx.createGain();source.buffer=decoded;source.playbackRate.value=1;gain.gain.value=priority===2?1:.93;source.connect(gain);gain.connect(owner.master);record.source=source;record.previousDuck=owner.duckUntil||0;record.duckUntil=Math.max(record.previousDuck,(owner.ctx.currentTime||0)+(decoded.duration||decoded.length/(decoded.sampleRate||24000))+.15);owner.duckUntil=record.duckUntil;source.onended=()=>{if(!record.cancelled)s.completed++;finish(owner,record);try{source.disconnect();gain.disconnect();}catch(_){}};s.started++;source.start();}).catch(error=>{if(!record.cancelled){s.failed++;s.lastError=String(error?.message||error);}finish(owner,record);});
  return true;
 }
 // Upgrade the legacy noise-only choice once; later explicit Tones choices
 // remain intentional. Never enable a muted game or replace an Off choice.
 function preferenceUpgrade(settings,migrated=false,available=true){const next={...(settings||{})},changed=!!available&&!migrated&&next.voices===1;if(changed)next.voices=2;return {settings:next,changed,mark:!!available&&!migrated};}
 function migrate(settings,store){if(!settings||!store?.get||!store?.set||!root.NeuralDialogueCatalog?.clips?.length)return false;const key='neuralDialoguePreferenceV1',result=preferenceUpgrade(settings,!!store.get(key,false),true);if(!result.mark)return false;if(result.changed){settings.voices=result.settings.voices;store.set('set',settings);}store.set(key,true);return result.changed;}
 function inspect(owner){const s=records.get(owner),r=owner?._speechActive;return {available:root.NeuralDialogueCatalog?.clips?.length||0,active:r?.kind==='neural',clip:r?.kind==='neural'?r.id:null,accepted:s?.accepted||0,started:s?.started||0,completed:s?.completed||0,failed:s?.failed||0,suppressed:s?.suppressed||0,cacheClips:s?.cache.size||0,cacheBytes:s?.bytes||0,lastClip:s?.lastClip||null,lastError:s?.lastError||null};}
 root.document?.addEventListener?.('visibilitychange',()=>{if(root.document.hidden)for(const owner of owners)stop(owner);});
 root.NeuralDialogue=Object.freeze({lookup,speak,stop,install,inspect,role,migrate,preferenceUpgrade,limits:LIMITS});
})(typeof window!=='undefined'?window:globalThis);
