/* Flight retries for the opt-in Dixie strike. Records describe a real airborne
 * state; restoring never creates hits, replenishes stores or repairs damage.
 * App must create a NEW Game first, retaining its existing lifetime guards. */
(function (root) {
  'use strict';
  const key = 'flight_strike_checkpoint', MAX_BYTES = 200000, MAX_NUMBER = 10000000;
  let Store = null;
  const labels = ['approach', 'run-in', 'egress'];
  const phases = ['navigation', 'acquire', 'run-in', 'release', 'assess', 'egress', 'recovery'];
  const aircraftKeys = ['p','v','yaw','pitch','roll','thr','gear','hook','brake','flaps','fuel','alive','onDeck','cat','aoa','ias','vs','radalt','nz','mach','bombs','arms','dropped','dmg','hits','crew','crewHits','stallShake','gLoad'];
  const worldKeys = ['t','carrier','targets','threats','scenery','lights','siteLights','saf','sites','score','route','rtIdx','nav','tgtCenter','ipoint','briefed','briefedR','tgtSpread','oap','site','softTargets','blind','oapLocked','navErrAtRelease','convoy','samWarn','launchWarn'];
  const flightKeys = ['t','phase','rightSeat','extView','ripple','masterArm','apAGL','steer','departed','egressCalled','aclsCoupled','_apDeck','_apCalled','_apBall','_apHome','_apThr','_aclsCall','_onBall','_reattack','_relArm','_lastRel','_lastCommit','_wob','shipRange','taught','ev','approachLog','_pLocked','_pAway','_pAgain','_pFuel'];
  const targetKeys = ['kind','p','hp','hp0','r','label','mesh','alive','score','burn','yaw','spd','ident','bonus'];
  const scoreKeys = ['hits','misses','cep','dropped','killed','total','damage','discipline','armsReleased','trucks','bulletsExpended','pistolShots'];
  const damageKeys = ['hyd','eng','diane','fuelLeak','fire'];
  const plain = o => o && typeof o === 'object' && !Array.isArray(o) && Object.prototype.toString.call(o) === '[object Object]' &&
    (Object.getPrototypeOf(o) === null || Object.getPrototypeOf(Object.getPrototypeOf(o)) === null);
  const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
  const finite = (n,a=-MAX_NUMBER,b=MAX_NUMBER) => Number.isFinite(n) && n >= a && n <= b;
  const count = (n,max=1000000) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  const vector = p => Array.isArray(p) && p.length === 3 && p.every(n=>finite(n));
  const keysOnly = (o,keys) => plain(o) && Object.keys(o).every(k=>keys.includes(k));
  const numberKeys = (o,keys,min,max) => keys.every(k=>finite(o[k],min,max));
  const booleans = (o,keys) => keys.every(k=>typeof o[k] === 'boolean');
  const bytes = s => encodeURIComponent(s).replace(/%[A-F\d]{2}/gi,'U').length;
  const text = (s,max=240) => typeof s === 'string' && s.length <= max;
  function safe(value,depth=0,budget={n:0}) {
    if (++budget.n > 24000 || depth > 12) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return finite(value);
    if (typeof value === 'string') return value.length <= 2500;
    if (Array.isArray(value)) return value.length <= 1200 && Object.keys(value).length === value.length && Array.from(value).every(v=>safe(v,depth+1,budget));
    if (!plain(value)) return false;
    return Object.keys(value).length <= 100 && Object.keys(value).every(k=>
      !['__proto__','prototype','constructor'].includes(k) && !/checkpoint/i.test(k) && safe(value[k],depth+1,budget));
  }
  // The experience's checkpointLabel is harmless presentation; no record may
  // recursively contain a checkpoint record or executable object.
  function safeRecord(value) {
    const copy = { ...value, experience: { ...value.experience } };
    delete copy.experience.checkpointLabel;
    return safe(copy) && (value.experience.checkpointLabel === null || value.experience.checkpointLabel === undefined || labels.includes(value.experience.checkpointLabel));
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  function pick(source,keys) {
    const out = {};
    for (const k of keys) if (own(source,k) && source[k] !== undefined) out[k] = source[k];
    return out;
  }
  function valid(input) {
    try {
      const d = input;
      if (!keysOnly(d,['version','missionId','missionType','label','aircraft','world','flight','experience','station','designation']) ||
        d.version !== 1 || d.missionId !== 'm2' || d.missionType !== 'strike' || !labels.includes(d.label) ||
        !plain(d.experience) || !safeRecord(d) || bytes(JSON.stringify(d)) > MAX_BYTES) return false;
      const a=d.aircraft,w=d.world,f=d.flight,e=d.experience,s=w && w.score;
      if (!keysOnly(a,aircraftKeys) || !keysOnly(w,worldKeys) || !keysOnly(f,flightKeys) ||
        !vector(a.p) || !vector(a.v) || !numberKeys(a,['yaw','pitch','roll','aoa','vs','nz','gLoad'],-100000,100000) ||
        !numberKeys(a,['thr','brake','flaps','stallShake'],0,1) || !finite(a.fuel,0,8000) ||
        !numberKeys(a,['ias','radalt','mach'],0,100000) || !count(a.hits) || !count(a.crewHits) ||
        !count(a.dropped) || a.alive !== true || a.onDeck !== false || !finite(a.cat,-1,0) ||
        !booleans(a,['gear','hook']) || !keysOnly(a.dmg,damageKeys) || !numberKeys(a.dmg,damageKeys,0,1) ||
        !keysOnly(a.crew,['pilot','bn']) || !numberKeys(a.crew,['pilot','bn'],0,1) ||
        !count(a.bombs,12) || a.arms !== 0 || !finite(f.t,0) || !finite(w.t,0) ||
        !['airborne','recovery'].includes(f.phase) || f.departed !== true ||
        !booleans(f,['rightSeat','extView','masterArm','departed','egressCalled','aclsCoupled']) ||
        ![1,2,4,6,8,12].includes(f.ripple) || !finite(f.apAGL,0,10000) ||
        !(f.steer === null || finite(f.steer)) || !count(w.rtIdx,8)) return false;
      const flightNumbers=['_apDeck','_apCalled','_apBall','_apHome','_apThr','_aclsCall','_onBall','_reattack','_relArm','_lastRel','_lastCommit','_wob','shipRange','_pLocked','_pAway','_pAgain','_pFuel'];
      if (!flightNumbers.every(k=>!own(f,k)||finite(f[k])) ||
        ['_relArm','_lastCommit'].some(k=>own(f,k)&&![0,1].includes(f[k])) ||
        own(f,'_lastRel')&&!finite(f._lastRel,0,f.t) ||
        ['taught','ev'].some(k=>own(f,k)&&!plain(f[k])) ||
        own(f,'approachLog')&&(!Array.isArray(f.approachLog)||f.approachLog.length>1200)) return false;
      if (e.version !== 1 || !phases.includes(e.phase) || e.completed !== false ||
        !finite(e.elapsed,0) || !finite(e.phaseTime,0) || !count(e.retries) || typeof e.tutorial !== 'boolean') return false;
      if (!keysOnly(s,scoreKeys) || !['hits','misses','dropped','killed','total'].every(k=>count(s[k])) ||
        s.total !== 5 || s.dropped + a.bombs !== 12 || s.hits+s.misses !== s.dropped ||
        !finite(s.damage,0,4.6) || typeof s.discipline !== 'boolean' || !Array.isArray(s.cep) || s.cep.length > 256 ||
        !s.cep.every(n=>finite(n,0)) || (own(s,'armsReleased') && s.armsReleased !== 0) ||
        ['trucks','bulletsExpended','pistolShots'].some(k=>own(s,k)&&!count(s[k]))) return false;
      if (!Array.isArray(w.targets) || w.targets.length < 5 || w.targets.length > 16 || !w.targets.every((t,i)=>
        keysOnly(t,targetKeys) && vector(t.p) && finite(t.hp,-100000,t.hp0) &&
        t.hp0 === (i < 5 ? 55 : 42) && t.kind === (i < 5 ? 'depot' : 'trucks') &&
        t.mesh === (i < 5 ? 'bldg' : 'truck') && t.r === (i < 5 ? 15 : 7) &&
        (i < 5 ? !t.bonus : t.bonus === 1) && typeof t.alive === 'boolean' &&
        (t.alive ? t.hp > 0 : t.hp <= 0) && finite(t.burn,0,1) && finite(t.yaw) && text(t.label,80) &&
        t.score === (i < 5 ? 25 : 6) && (t.alive ? t.burn === 0 : true))) return false;
      if (w.targets.some(t=>t.hp<t.hp0) && s.hits===0 ||
        s.killed !== w.targets.slice(0,5).filter(t=>!t.alive).length ||
        (s.trucks||0) !== w.targets.slice(5).filter(t=>!t.alive).length) return false;
      const arrays = [['scenery',600],['lights',1000],['siteLights',128],['saf',600],['threats',16],['sites',8],['route',8]];
      for (const [k,max] of arrays) if (own(w,k) && (!Array.isArray(w[k]) || w[k].length > max || !w[k].every(o=>plain(o)&&vector(o.p)))) return false;
      if (!w.scenery.every(o=>keysOnly(o,['m','p','y','s'])&&text(o.m,80)&&finite(o.y)&&finite(o.s,.001,100)) ||
        w.lights&&!w.lights.every(o=>keysOnly(o,['p','c','s','f'])&&vector(o.c)&&finite(o.s,0,100)&&finite(o.f,0,1)) ||
        w.siteLights&&!w.siteLights.every(o=>keysOnly(o,['p','c','s','f'])&&vector(o.c)&&finite(o.s,0,100)&&finite(o.f,0,1)) ||
        !w.threats.every(o=>keysOnly(o,['type','p','yaw','cool','alive','rng','alt','burst','hp','tracers'])&&o.type==='aaaL'&&
          numberKeys(o,['yaw','cool','rng','alt','burst','hp','tracers'])&&typeof o.alive==='boolean') ||
        w.saf&&!w.saf.every(o=>keysOnly(o,['p','cool','heavy'])&&finite(o.cool)&&typeof o.heavy==='boolean') ||
        w.sites&&w.sites.length || !w.route.every(o=>keysOnly(o,['p','label','hint'])&&text(o.label,80)&&text(o.hint,240)) ||
        ['softTargets','blind','oapLocked'].some(k=>own(w,k)&&typeof w[k]!=='boolean') ||
        ['samWarn','launchWarn','navErrAtRelease'].some(k=>own(w,k)&&!finite(w[k],0)) ||
        w.carrier&&own(w.carrier,'heave')&&!finite(w.carrier.heave,-20,20)) return false;
      if (!Array.isArray(w.scenery) || !Array.isArray(w.threats) || !Array.isArray(w.route) || !w.nav ||
        !keysOnly(w.nav,['ex','ez','dir','rate','fixes','flown','lastX','lastZ']) ||
        !numberKeys(w.nav,['ex','ez','dir']) || !finite(w.nav.rate,0,.1) || !count(w.nav.fixes,1000000) ||
        !finite(w.nav.flown,0) || !['lastX','lastZ'].every(k=>w.nav[k]===null||finite(w.nav[k])) ||
        w.rtIdx > w.route.length || w.nav.fixes !== w.rtIdx || !vector(w.briefed) || !vector(w.tgtCenter) || !vector(w.ipoint) ||
        !finite(w.briefedR,0,2000) || !finite(w.tgtSpread,0,2000) ||
        !keysOnly(w.carrier,['p','hdg','spd','roll','pitch','heave']) || !vector(w.carrier.p) ||
        !numberKeys(w.carrier,['hdg','roll','pitch']) || !finite(w.carrier.spd,0,40) ||
        !(w.oap === null || plain(w.oap) && vector(w.oap.p) && finite(w.oap.brg,0,360) && finite(w.oap.rng,0,10000)) ||
        !keysOnly(d.station,['scope','cross','range']) || typeof d.station.scope !== 'boolean' ||
        !Array.isArray(d.station.cross) || d.station.cross.length !== 2 || !finite(d.station.cross[0],-1,1) ||
        !finite(d.station.cross[1],0,1) || !finite(d.station.range,1852,100000)) return false;
      if (!keysOnly(d.designation,['index','point','lock']) || typeof d.designation.lock !== 'boolean') return false;
      if (d.designation.index === null) {
        if (!(d.designation.point === null || keysOnly(d.designation.point,['p','label','alive','r','offset']) &&
          vector(d.designation.point.p) && text(d.designation.point.label,80) && d.designation.point.alive === true &&
          finite(d.designation.point.r,0,1000))) return false;
        if (d.designation.lock && !d.designation.point) return false;
      } else if (!count(d.designation.index,w.targets.length-1) || d.designation.point !== null) return false;
      return true;
    } catch (_) { return false; }
  }
  function eligible(g) {
    return !!(g && (!g.app || g.app.game === g && g.app.screen === 'game' && !g.app.graphicsContextLost) && g.mis && g.mis.id === 'm2' && g.mis.type === 'strike' && plain(g.strikeExperience) &&
      g.ac && g.ac.alive && !g.ac.onDeck && finite(g.ac.cat,-1,0) && g.departed &&
      !g.result && !g.evade && !g.chute && !g.pow && !g._capt && !g._capturePending && !g.ejected && !g._outOfAircraft &&
      ['airborne','recovery'].includes(g.phase) && g.world && (!g.world.bombs || !g.world.bombs.length) &&
      (!g.world.arms || !g.world.arms.length));
  }
  function capture(g,label) {
    try {
      if (!eligible(g) || !labels.includes(label) || g.bombsMax !== 12 || (g.armsMax || 0) !== 0) return null;
      const w=g.world, selected=w.targets.indexOf(w.designated), h=g.hud || g.app && g.app.hud;
      if (!h || !h.radar) return null;
      const world=pick(w,worldKeys); world.targets=w.targets.map(t=>pick(t,targetKeys)); world.score=pick(w.score,scoreKeys);
      const d={version:1,missionId:'m2',missionType:'strike',label,aircraft:pick(g.ac,aircraftKeys),world,flight:pick(g,flightKeys),
        experience:{...g.strikeExperience,checkpointLabel:label},
        station:{scope:!!h.scope,cross:h.cross.slice(),range:h.radar.maxR},
        designation:{index:selected<0?null:selected,point:selected<0&&w.designated?pick(w.designated,['p','label','alive','r','offset']):null,lock:!!w.lock}};
      if (!valid(d)) return null;
      const detached=clone(d); if (Store) Store.set(key,clone(detached)); return detached;
    } catch (_) { return null; }
  }
  function restore(g,input) {
    // Validate before ANY write: a corrupt browser save cannot partially
    // repair an aircraft or replace only half of its world.
    if (!g || !g.mis || g.mis.id !== 'm2' || g.mis.type !== 'strike' || !plain(g.strikeExperience) ||
      !g.ac || !g.world || !g.hud || !g.hud.radar || !valid(input)) return false;
    const d=clone(input),w=g.world,h=g.hud;
    for (const k of aircraftKeys) { if(own(d.aircraft,k))g.ac[k]=d.aircraft[k];else delete g.ac[k]; }
    for (const k of worldKeys) { if(own(d.world,k))w[k]=d.world[k];else delete w[k]; }
    for (const k of flightKeys) { if(own(d.flight,k))g[k]=d.flight[k];else delete g[k]; }
    w.designated=d.designation.index===null?d.designation.point:w.targets[d.designation.index]; w.lock=d.designation.lock;
    // A fresh world retains its renderer, callbacks and methods; none of the
    // old Game's closures, timers, GPU arrays or cached cells are imported.
    for (const k of ['bombs','arms','sams','fires','secs']) w[k]=[];
    if(w.fx&&typeof w.fx.clear==='function')w.fx.clear();
    if(w._cells&&typeof w._cells.clear==='function')w._cells.clear();
    if(root.FlightStrikeEffects&&typeof root.FlightStrikeEffects.clear==='function')root.FlightStrikeEffects.clear(w);
    if(w.rend)w.rend.tgtArea=[w.briefed[0],w.briefed[2],w.briefedR*.95];
    g.strikeExperience=d.experience;g.bombsMax=12;g.armsMax=0;g.paused=false;g.camSm=null;g.sol=null;g.result=null;
    g.flash=0;g.shake=0;g._lastCommit=0;
    h.scope=d.station.scope;h.cross=d.station.cross;h.radar.maxR=d.station.range;
    if(typeof h.radar.reset==='function')h.radar.reset();
    return true;
  }
  function saved() { try { const d=Store&&Store.get(key,null);return valid(d)?clone(d):null; }catch(_){return null;} }
  function clear() { if(Store)Store.set(key,null); }
  function configure(c) { Store=c&&c.Store||null; }
  root.FlightStrikeCheckpoint=Object.freeze({key,configure,capture,valid,restore,saved,clear});
})(window);
