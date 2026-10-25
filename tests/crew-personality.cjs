'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../assets/audio/crew-personality.js'),'utf8'),{window});return {api:window.CrewPersonality,g:{t:10,mis:{id:'m2'},ac:{crew:{pilot:1,bn:1}}}};}
test('family expressions decorate actual B/N context while preserving the complete instruction',()=>{
 const {api,g}=fixture();assert.equal(api.line(g,'BN','We are hit!'),"We're in deep yogurt. We are hit!");
 assert.equal(api.line(g,'B/N','I am hit. I can still work.'),"I'm in a hurt locker! I am hit. I can still work.");
 g.t+=30;assert.equal(api.line(g,'BN','Locked. Depot, range 2.0 miles.'),'Get the gold. Locked. Depot, range 2.0 miles.');
 g.t+=30;const warning="LAUNCH! SAM at our nine o'clock — watch for the smoke!";assert.equal(api.line(g,'BN',warning),warning+' Those knuckleheads are shooting at us.');
});
test('each expression occurs at most once per sortie and chatter yields to recent calls',()=>{
 const {api,g}=fixture();api.line(g,'BN','We are hit!');g.t+=1;assert.equal(api.line(g,'BN','Locked. Target.'),'Locked. Target.');g.t+=30;assert.match(api.line(g,'BN','Locked. Target.'),/^Get the gold\./);g.t+=100;assert.equal(api.line(g,'BN','We are hit!'),'We are hit!');
});
test('other people, ordinary lines, dead B/N and separately attributed historical crews keep their dialogue',()=>{
 const {api,g}=fixture();for(const who of ['PILOT','TURCZYN','LSO','GUARD'])assert.equal(api.line(g,who,'We are hit!'),'We are hit!');assert.equal(api.line(g,'BN','Radar fix entered.'),'Radar fix entered.');
 g.ac.crew.bn=0;assert.equal(api.line(g,'BN','We are hit!'),'We are hit!');g.ac.crew.bn=1;g.mis.id='willard';assert.equal(api.line(g,'BN','We are hit!'),'We are hit!');g.mis.id='m2';g.evade={};assert.equal(api.line(g,'BN','We are hit!'),'We are hit!');
});
test('dialogue never mutates aircraft, warnings, objectives or campaign data',()=>{
 const {api,g}=fixture(),before=JSON.stringify(g);api.line(g,'BN','Locked. Target.');assert.equal(JSON.stringify(g),before);assert.equal(api.line(null,'BN','We are hit!'),'We are hit!');
});
