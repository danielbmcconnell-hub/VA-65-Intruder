'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/prison-water-cpu'),label=process.argv[2]||'all-cpu-final';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Use a simple evidence label');fs.mkdirSync(out,{recursive:true});
function inventoryCPU(){const inventory={nodeTestPrograms:[],legacyAssertPrograms:[],browserOrHelperPrograms:[]};
for(const name of fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.cjs')).sort()){
 const file='tests/'+name,text=fs.readFileSync(path.join(root,file),'utf8'),browser=/browser/.test(name)||/require\(['"](?:playwright|.*\/playwright)['"]\)/.test(text)||/module\.exports\s*=\s*(?:async\s*)?function\s*\w*\s*\(\s*browser/.test(text);
 if(browser)inventory.browserOrHelperPrograms.push(file);else if(/require\(['"](?:node:)?test['"]\)/.test(text))inventory.nodeTestPrograms.push(file);else if(/require\(['"](?:node:)?assert/.test(text))inventory.legacyAssertPrograms.push(file);else inventory.browserOrHelperPrograms.push(file);
}return inventory;}
const inventory=inventoryCPU();
const files=[...inventory.nodeTestPrograms,...inventory.legacyAssertPrograms].sort();
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
function sources(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?sources(dir+'/'+e.name):/\.(js|css|json|glsl)$/.test(e.name)?[dir+'/'+e.name]:[])}
const sourceNames=['index.html',...sources('assets')].sort(),before=Object.fromEntries(sourceNames.map(f=>[f,hash(f)])),tested=Object.fromEntries(files.map(f=>[f,hash(f)])),begunAt=new Date().toISOString();
const log=path.join(out,label+'.log'),fd=fs.openSync(log,'w');fs.writeSync(fd,'CPU programs: '+files.length+'; '+begunAt+'\n');
const result=cp.spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=2',...files],{cwd:root,stdio:['ignore',fd,fd]});fs.closeSync(fd);
const afterInventory=inventoryCPU(),afterCPUFiles=[...afterInventory.nodeTestPrograms,...afterInventory.legacyAssertPrograms].sort();
const addedCPUPrograms=afterCPUFiles.filter(f=>!files.includes(f)),removedCPUPrograms=files.filter(f=>!afterCPUFiles.includes(f));
const text=fs.readFileSync(log,'utf8'),afterSourceNames=['index.html',...sources('assets')].sort(),addedSourceFiles=afterSourceNames.filter(f=>!sourceNames.includes(f)),removedSourceFiles=sourceNames.filter(f=>!afterSourceNames.includes(f)),changedFiles=sourceNames.filter(f=>removedSourceFiles.includes(f)||before[f]!==hash(f)).concat(addedSourceFiles),changedTests=files.filter(f=>!fs.existsSync(path.join(root,f))||tested[f]!==hash(f)).concat(addedCPUPrograms,removedCPUPrograms.filter(f=>fs.existsSync(path.join(root,f)))) ;
const value=key=>Number(text.match(new RegExp('^# '+key+' (\\d+)$','m'))?.[1]);
const report={suite:'all-cpu',passed:result.status===0&&!changedFiles.length&&!changedTests.length,sourceStable:!changedFiles.length&&!changedTests.length,scope:'All CPU-only node:test and legacy assertion programs; browser modules excluded. Legacy assertion scripts contribute file-level runner cases, not a fabricated count of every inner assertion.',begunAt,completedAt:new Date().toISOString(),programs:files.length,nodeTestPrograms:inventory.nodeTestPrograms.length,legacyAssertPrograms:inventory.legacyAssertPrograms.length,runnerTests:value('tests'),runnerPass:value('pass'),runnerFail:value('fail'),runnerSkipped:value('skipped'),runnerCancelled:value('cancelled'),exitCode:result.status,addedCPUPrograms,removedCPUPrograms,addedSourceFiles,removedSourceFiles,changedFiles,changedTests,sourceSHA256:before,testSHA256:tested,inventory,log};
report.checks=[{name:'All real CPU programs pass',passed:result.status===0&&report.runnerFail===0},{name:'Executed source/test files remain unchanged',passed:report.sourceStable}];
fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,sourceSHA256:undefined,testSHA256:undefined,inventory:undefined},null,2));process.exitCode=report.passed?0:1;
