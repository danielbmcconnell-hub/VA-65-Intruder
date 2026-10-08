'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'reference_media/historical_photos_enhanced/Intruder_Yankee_Station_Historical_Photo_Assets');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/history/manifest.json')));
assert.equal(manifest.length,6);
for(const asset of manifest)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/history',asset.file))).digest('hex'),asset.sha256);
for(const name of fs.readdirSync(path.join(root,'assets/history')).filter(n=>n.endsWith('.webp'))){
 const actual=fs.readFileSync(path.join(root,'assets/history',name)),original=fs.readFileSync(path.join(source,name));assert.ok(actual.equals(original),name+' altered');
 console.log('PASS unchanged supplied WebP '+name+' '+crypto.createHash('sha256').update(actual).digest('hex'));
}
