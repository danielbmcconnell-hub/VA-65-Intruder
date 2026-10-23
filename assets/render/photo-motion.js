/* Photographic gait playback follows measured ground displacement. This owns
 * presentation state only: AI, collisions, headings and source art are untouched. */
(function(root){
  'use strict';
  const TAU=Math.PI*2,MAX_ACTORS=160;
  const KINDS=new Set(['farmer','farmerC','villager','villagerC','vc','militia','vcFem','female_vc','nva','soldier','sentry','guard','guardAim','aviator','cow']);
  const IDENTITIES={farmer:'farmer',farmerC:'farmer',villager:'farmer',villagerC:'farmer',vc:'militia',militia:'militia',vcFem:'female_vc',female_vc:'female_vc',nva:'nva',soldier:'nva',sentry:'nva',guard:'nva',guardAim:'nva',aviator:'aviator',cow:'cow'};
  let games=new WeakMap();
  let strides={};
  const finite=(n,f=0)=>Number.isFinite(n)?n:f;
  const point=p=>Array.isArray(p)&&p.length>=3&&p.slice(0,3).every(Number.isFinite);
  const clock=g=>g.pow&&Number.isFinite(g.pow.time)?g.pow.time:finite(g.t);
  const active=g=>!!(g&&g.evade&&(!g.phase||g.phase==='evade')&&(!g.pow||!g.pow.complete));
  function context(game){let s=games.get(game);if(!s){s={actors:new WeakMap(),stamp:null,count:0,steps:0,ground:game.evade};games.set(game,s);}return s;}
  function cattle(actor,game){return actor.kind==='cow'||!!(game.evade.cattle&&game.evade.cattle.includes(actor));}
  function known(actor,game){return !!actor&&(KINDS.has(actor.kind)||cattle(actor,game));}
  function entry(actor,game){
    const s=context(game);let a=s.actors.get(actor);
    if(!a){a={p:point(actor.p)?actor.p.slice(0,3):null,phase:((finite(actor.ph)/TAU)%1+1)%1,speed:0,distance:0,velocity:[0,0],clip:'idle',moving:false,teleported:false};s.actors.set(actor,a);}
    return a;
  }
  function stopped(actor,game){return actor.alive===false||actor.stunned||finite(actor.stunUntil,-1)>finite(game.t,clock(game));}
  function step(game,dt){
    if(!active(game)||game.paused||game._capturePending||game.evade.frozen)return 0;
    dt=Math.max(0,Math.min(.25,finite(dt)));if(!dt)return 0;
    let group=context(game);const now=clock(game);
    if(group.ground!==game.evade||group.stamp!==null&&now<group.stamp){games.delete(game);group=context(game);}
    if(group.stamp===now)return 0;group.stamp=now;group.steps++;
    const all=(game.evade.searchers||[]).concat(game.evade.locals||[],game.evade.cattle||[]),seen=new Set();let count=0;
    for(const actor of all){
      if(count>=MAX_ACTORS)break;if(!known(actor,game)||seen.has(actor))continue;seen.add(actor);
      const a=entry(actor,game),p=point(actor.p)?actor.p:null;
      let distance=p&&a.p?Math.hypot(p[0]-a.p[0],p[2]-a.p[2]):0;
      a.teleported=!!(p&&a.p&&(distance>Math.max(.65,dt*8+.2)||Math.abs(p[1]-a.p[1])>3));
      if(a.teleported||!p||stopped(actor,game))distance=0;
      a.velocity=distance>0?[(p[0]-a.p[0])/dt,(p[2]-a.p[2])/dt]:[0,0];
      a.speed=distance/Math.max(dt,.001);
      a.clip=a.speed>1.9||a.clip==='run'&&a.speed>1.5?'run':a.speed>.12||a.moving&&a.speed>.05?'walk':'idle';
      a.moving=a.clip!=='idle';
      if(distance>0){const subject=cattle(actor,game)?'cow':IDENTITIES[actor.kind],configured=strides[subject]&&strides[subject][a.clip],stride=configured||(subject==='cow'?a.clip==='run'?3:2.2:a.clip==='run'?2.4:1.56);a.phase=(a.phase+distance/stride)%1;}
      a.distance+=distance;a.p=p?p.slice(0,3):null;count++;
    }
    group.count=count;return count;
  }
  function pose(actor,game){
    if(!active(game)||!known(actor,game))return {enabled:false,clip:'idle',phase:0,speed:0,distance:0,moving:false,teleported:false};
    const a=entry(actor,game),halt=stopped(actor,game)||game._capturePending||game.evade.frozen;
    return {enabled:true,clip:halt?'idle':a.clip,phase:a.phase,speed:halt?0:a.speed,distance:a.distance,moving:!halt&&a.moving,teleported:a.teleported,velocity:a.velocity.slice()};
  }
  function reset(game){if(game)return games.delete(game);games=new WeakMap();return true;}
  function configure(manifest){
    const values={};for(const [name,subject]of Object.entries(manifest&&manifest.subjects||{}))for(const [clip,entry]of Object.entries(subject.animations||{}))if(['walk','run'].includes(clip)&&Number.isFinite(entry.stride)&&entry.stride>=.5&&entry.stride<=6){values[name]=values[name]||{};values[name][clip]=entry.stride;}
    strides=values;return true;
  }
  function inspect(game){const s=game&&games.get(game);return s?{steps:s.steps,count:s.count,stamp:s.stamp,maxActors:MAX_ACTORS}: {steps:0,count:0,stamp:null,maxActors:MAX_ACTORS};}
  root.PhotoMotion=Object.freeze({step,pose,reset,inspect,configure});
})(window);
