/* Family-supplied W. S. McConnell expressions in dramatized game dialogue.
 * No authentic recording or historical conversation is implied. This only
 * decorates an existing crew call; it cannot create a warning or objective. */
(function(root){
 'use strict';
 const records=new WeakMap();
 function event(text){
  if(/^I am hit\./.test(text))return {id:'hurt',quote:"I'm in a hurt locker!",urgent:true};
  if(/^(?:We are hit!|We took one\.|Fuel state is getting ugly\.|Scope is dead\.)/.test(text))return {id:'trouble',quote:"We're in deep yogurt."};
  if(/^(?:Locked\.|Offset applied\.|Needles settled\.)/.test(text))return {id:'objective',quote:'Get the gold.'};
  if(/^(?:LAUNCH!|Launch warning\.)/.test(text))return {id:'opponents',quote:'Those knuckleheads are shooting at us.',after:true};
  return null;
 }
 function line(game,speaker,text){
  if(typeof text!=='string'||!game||!['BN','B/N'].includes(speaker)||game.willard||game.mis?.id==='willard'||game.pow||game.evade||game.ejected||game.ac?.crew?.bn<=0)return text;
  const item=event(text);if(!item)return text;const at=Number.isFinite(game.t)?game.t:0;
  let s=records.get(game);if(!s||at<s.at){s={at,last:-Infinity,used:new Set()};records.set(game,s);}s.at=at;
  if(s.used.has(item.id)||!item.urgent&&at-s.last<25)return text;
  s.used.add(item.id);s.last=at;
  return item.after?text+' '+item.quote:item.quote+' '+text;
 }
 root.CrewPersonality=Object.freeze({line});
})(typeof window!=='undefined'?window:globalThis);
