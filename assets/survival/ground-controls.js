(function(root){'use strict';
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),num=n=>Number.isFinite(n)?n:0;
 function read(app){const k=app?.keys||{},g=app?.gctl||{};let forward=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0)+num(g.pitch),strafe=(k.KeyD?1:0)-(k.KeyA?1:0)+num(g.roll);forward=clamp(forward,-1,1);strafe=clamp(strafe,-1,1);if(Math.abs(forward)<.07)forward=0;if(Math.abs(strafe)<.07)strafe=0;const length=Math.max(1,Math.hypot(forward,strafe));return {forward:forward/length,strafe:strafe/length,turn:clamp((k.ArrowRight?1:0)-(k.ArrowLeft?1:0)+num(g.turn),-1,1),run:!!(k.ShiftLeft||k.ShiftRight||g.run)};}
 function vector(heading,input,speed){return [(Math.sin(heading)*input.forward+Math.cos(heading)*input.strafe)*speed,(-Math.cos(heading)*input.forward+Math.sin(heading)*input.strafe)*speed];}
 root.GroundControls=Object.freeze({read,vector});
})(typeof window!=='undefined'?window:globalThis);
