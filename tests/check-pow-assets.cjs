'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'reference_media/historical_photos_enhanced/Intruder_Yankee_Station_Historical_Photo_Assets');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/history/manifest.json')));
assert.equal(manifest.length,8);
assert.deepEqual(new Set(fs.readdirSync(path.join(root,'assets/history')).filter(n=>/\.(webp|png)$/.test(n))),new Set(manifest.map(a=>a.file)));
for(const asset of manifest){
 const actual=fs.readFileSync(path.join(root,'assets/history',asset.file));
 const original=fs.readFileSync(asset.source?path.join(root,asset.source):path.join(source,asset.file));
 assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),asset.sha256);
 assert.ok(actual.equals(original),asset.file+' altered');
 console.log('PASS unchanged supplied photograph '+asset.file+' '+asset.sha256);
}
