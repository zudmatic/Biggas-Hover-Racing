import {execFileSync} from 'node:child_process';
import {mkdirSync,statSync} from 'node:fs';
import {resolve} from 'node:path';

// Run after export-desert-detail.py in the authoring workspace. This only
// writes the detail package; neither the base map nor the train is recompressed.
const directory=resolve('output/desert-detail-export');mkdirSync(directory,{recursive:true});
const raw=resolve(process.argv[2]??`${directory}/desert-detail-raw.glb`);
const textures=`${directory}/desert-detail-webp.glb`,destination=resolve('public/models/desert-valley/desert-detail-game.glb');
const run=(...args)=>execFileSync('npx',['--yes','@gltf-transform/cli@4.5.1',...args],{stdio:'inherit'});
run('webp',raw,textures,'--quality','90');
run('draco',textures,destination,'--method','edgebreaker');
console.log(JSON.stringify({rawBytes:statSync(raw).size,compressedBytes:statSync(destination).size,destination}));
