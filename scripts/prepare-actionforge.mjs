// Convert the animation-only ActionForge export into small, deterministic pose
// tables for Zud's shell rig. No network or browser is needed to rebuild these.
import {readFile,writeFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Euler,Quaternion} from 'three';
const source=new URL('../public/animations/actionforge/zud-clips.glb',import.meta.url);
const bytes=await readFile(source);
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
const bones=['Hips','RightArm','LeftArm','RightUpLeg','LeftUpLeg','RightForeArm','LeftForeArm','RightLeg','LeftLeg'];
const names={idle_loop_fit:'idle',walk_loop_fit:'walk',jump_start_fit:'takeoff',jump_loop_fit:'air',jump_land_fit:'land',dance_loop_fit:'dance'};
const result={fps:30,bones,clips:{}};
const q=new Quaternion(),e=new Euler();
for(const clip of gltf.animations){
  const name=names[clip.name];if(!name)continue;
  const tracks=bones.map(bone=>{
    const track=clip.tracks.find(t=>t.name===`${bone}.quaternion`);
    if(!track)throw new Error(`Missing ${bone} in ${clip.name}`);
    return track.createInterpolant();
  });
  const count=Math.round(clip.duration*30),frames=[];
  for(let f=0;f<=count;f++){
    const frame=[];
    for(const track of tracks){
      e.setFromQuaternion(q.fromArray(track.evaluate(f/count*clip.duration)));
      frame.push(...[e.x,e.y,e.z].map(v=>+v.toFixed(5)));
    }
    // Unwrap each Euler channel for interpolation across ±π.
    if(f)frame.forEach((v,i)=>{frame[i]=+(frames[f-1][i]+Math.atan2(Math.sin(v-frames[f-1][i]),Math.cos(v-frames[f-1][i]))).toFixed(5);});
    frames.push(frame);
  }
  // Exported loops have tiny end-frame differences. Close them explicitly.
  if(['idle','walk','air','dance'].includes(name))frames[count]=[...frames[0]];
  result.clips[name]={duration:clip.duration,frames};
}
if(Object.keys(result.clips).length!==6)throw new Error('Expected six ActionForge clips');
await writeFile(new URL('../src/animation-data/actionforge.json',import.meta.url),JSON.stringify(result)+'\n');
console.log('Prepared six ActionForge clips at 30 fps');
