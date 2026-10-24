/* Select explicit language/voice identities; a low pitch alone cannot turn a
 * British or female system voice into an American male voice. Captions remain
 * available when the device does not provide a matching installed voice. */
(function(root){
  'use strict';
  const MALE_US=/\b(aaron|alex|fred|david|mark|tom|evan|nathan|guy|christopher|eric|roger|tony|andrew|davis|jason|brandon|jacob|joey|justin|matthew|william|ken|reed|steffan|brian|male)\b/i;
  const FEMALE=/\b(samantha|susan|zira|jenny|aria|michelle|jane|sara|sarah|female)\b/i;
  const language=value=>String(value||'').replace(/_/g,'-').toLowerCase();
  const plain=value=>String(value||'').replace(/<[^>]*>/g,'').replace(/—/g,',');
  function select(voices,lang,speaker){
    const vi=language(lang).startsWith('vi'),wanted=vi?'vi-vn':'en-us';
    const candidates=(Array.isArray(voices)?voices:[]).filter(v=>v&&language(v.lang)===wanted&&(vi||MALE_US.test(v.name||'')&&!FEMALE.test(v.name||'')));
    candidates.sort((a,b)=>Number(/natural|neural|premium|enhanced/i.test(b.name||''))-Number(/natural|neural|premium|enhanced/i.test(a.name||''))||String(a.name).localeCompare(String(b.name)));
    if(!candidates.length)return null;
    // Prefer quality over role variety, then keep each speaker consistent.
    const best=/natural|neural|premium|enhanced/i.test(candidates[0].name||''),pool=best?candidates.filter(v=>/natural|neural|premium|enhanced/i.test(v.name||'')):candidates;
    let hash=0;for(const c of String(speaker||'CREW'))hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
    return pool[hash%pool.length];
  }
  function mood(text,tone){
    const line=plain(text);
    if(tone==='bad'||/eject|incoming|we(?:'re| are) hit|wave ?off|pull up|take cover|stop!|run!|bắn|đứng lại|giơ tay.*!/i.test(line))return 'urgent';
    if(tone==='warn'||tone==='alert')return 'alert';
    return 'calm';
  }
  function apply(utterance,options={},voices){
    if(!utterance)return false;const lang=language(options.lang).startsWith('vi')?'vi-VN':'en-US',voice=select(voices,lang,options.speaker);
    if(!voice)return false;
    const delivery=mood(options.text||utterance.text,options.tone),profile=delivery==='urgent'?{rate:1.10,pitch:1.01,volume:1}:delivery==='alert'?{rate:1.01,pitch:.94,volume:.92}:{rate:.93,pitch:.88,volume:.84};
    utterance.voice=voice;utterance.lang=lang;utterance.rate=profile.rate;utterance.pitch=profile.pitch;utterance.volume=profile.volume;
    return true;
  }
  function inspect(voices){return {americanMaleAvailable:!!select(voices,'en-US','CREW'),vietnameseAvailable:!!select(voices,'vi-VN','GUARD')};}
  root.VoiceProfiles=Object.freeze({select,mood,apply,inspect});
})(typeof window!=='undefined'?window:globalThis);
