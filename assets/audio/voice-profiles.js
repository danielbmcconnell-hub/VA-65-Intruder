/* Select explicit language/voice identities; a low pitch alone cannot turn a
 * British or female system voice into an American male voice. Captions remain
 * available when the device does not provide a matching installed voice. */
(function(root){
  'use strict';
  const MALE_US=/\b(aaron|alex|fred|david|mark|tom|evan|nathan|guy|christopher|eric|roger|tony|andrew|davis|jason|brandon|jacob|joey|justin|matthew|william|ken|reed|steffan|brian|male)\b/i;
  const FEMALE=/\b(samantha|susan|zira|jenny|aria|michelle|jane|sara|sarah|female)\b/i;
  const language=value=>String(value||'').replace(/_/g,'-').toLowerCase();
  const plain=value=>String(value||'').replace(/<[^>]*>/g,'').replace(/—/g,',');
  function quality(voice){const n=String(voice?.name||'');return /natural|neural|premium|enhanced|wavenet|studio/i.test(n)?100:/\b(alex|evan|aaron|reed)\b/i.test(n)?55:/compact|desktop|fred/i.test(n)?5:25;}
  function spokenText(value,lang='en-US'){
    let text=plain(value).replace(/[·•]/g,', ').replace(/\s+/g,' ').trim();
    if(!language(lang).startsWith('vi'))text=text.replace(/\bB\/?N\b/g,'navigator').replace(/\bNVA\b/g,'North Vietnamese').replace(/\bVC\b/g,'Viet Cong').replace(/\bA-6(?:A)?\b/g,'A six').replace(/\.38\b/g,'thirty-eight').replace(/\bSAM\b/g,'surface to air missile');
    const letters=text.replace(/[^a-zA-Z]/g,'');if(letters.length>5&&letters===letters.toUpperCase())text=text.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g,(_,a,b)=>a+b.toUpperCase());
    if(text.length>240){const part=text.slice(0,240),last=Math.max(part.lastIndexOf('. '),part.lastIndexOf('! '),part.lastIndexOf('? '));text=last>70?part.slice(0,last+1):part.slice(0,part.lastIndexOf(' '))+'.';}
    return text.replace(/[,;:]{2,}/g,',').replace(/\s+([,.!?])/g,'$1');
  }
  function select(voices,lang,speaker){
    const vi=language(lang).startsWith('vi'),wanted=vi?'vi-vn':'en-us';
    const candidates=(Array.isArray(voices)?voices:[]).filter(v=>v&&language(v.lang)===wanted&&(vi||MALE_US.test(v.name||'')&&!FEMALE.test(v.name||'')));
    candidates.sort((a,b)=>quality(b)-quality(a)||String(a.name).localeCompare(String(b.name)));
    if(!candidates.length)return null;
    // Prefer quality over role variety, then keep each speaker consistent.
    const best=quality(candidates[0]),pool=candidates.filter(v=>quality(v)===best);
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
    const delivery=mood(options.text||utterance.text,options.tone),profile=delivery==='urgent'?{rate:1.08,pitch:1,volume:1}:delivery==='alert'?{rate:1.00,pitch:1,volume:.94}:{rate:.98,pitch:1,volume:.88};
    utterance.text=spokenText(options.text||utterance.text,lang);
    utterance.voice=voice;utterance.lang=lang;utterance.rate=profile.rate;utterance.pitch=profile.pitch;utterance.volume=profile.volume;
    return true;
  }
  function inspect(voices){return {americanMaleAvailable:!!select(voices,'en-US','CREW'),vietnameseAvailable:!!select(voices,'vi-VN','GUARD')};}
  root.VoiceProfiles=Object.freeze({select,mood,apply,inspect,spokenText,quality});
})(typeof window!=='undefined'?window:globalThis);
