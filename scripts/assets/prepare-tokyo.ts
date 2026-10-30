import {mkdir, copyFile, writeFile, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Matrix4, Vector3} from 'three';
import {createIO} from './io.js';

// Import the Blender playtest bundle, preserving its authored collision and route.
// Usage: pnpm exec tsx scripts/assets/prepare-tokyo.ts <bundle-folder>
const bundle = process.argv[2];
if (!bundle) throw new Error('Supply the Blender playtest bundle folder.');
const source = resolve(bundle, 'tokyo-highway.glb');
const folder = resolve('public/models/tokyo-highway');
await mkdir(folder, {recursive: true});
const document = await (await createIO()).read(source);
type Point = [number, number, number];
const fixtures: {kind: string; position: Point}[] = [];
const point = new Vector3();
const value: number[] = [];
for (const node of document.getRoot().listNodes()) {
  const matrix = new Matrix4().fromArray(node.getWorldMatrix());
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const name = primitive.getMaterial()?.getName() ?? '';
    const position = primitive.getAttribute('POSITION')!;
    const indices = primitive.getIndices()!.getArray()!;
    const positions: Point[] = [];
    for (let i = 0; i < position.getCount(); i++) {
      positions.push(point.fromArray(position.getElement(i, value)).applyMatrix4(matrix).toArray());
    }
    const kind = /Sodium_Emitter/.test(name) ? 'sodium' : /Tunnel_Light/.test(name) ? 'tunnel'
      : /TokyoTower_Beacons/.test(name) ? 'beacon'
      : /LampLens/.test(name) && /Streetlamp/.test(node.getName()) ? 'sodium' : null;
    if (!kind) continue;
    // Weld coincident vertices across hard normals/UV seams, then find each lamp.
    const parent = positions.map((_, i) => i);
    const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const join = (a: number, b: number) => { parent[find(a)] = find(b); };
    const welded = new Map<string, number>();
    positions.forEach((p, i) => {
      const key = p.map((v) => v.toFixed(3)).join(',');
      const other = welded.get(key);
      if (other !== undefined) join(i, other);
      else welded.set(key, i);
    });
    for (let i = 0; i < indices.length; i += 3) {
      join(indices[i], indices[i + 1]); join(indices[i], indices[i + 2]);
    }
    const groups = new Map<number, Point[]>();
    positions.forEach((p, i) => {
      const id = find(i);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id)!.push(p);
    });
    for (const group of groups.values()) {
      const center = [0, 1, 2].map((axis) => (Math.min(...group.map(p => p[axis])) + Math.max(...group.map(p => p[axis]))) / 2) as Point;
      if (!fixtures.some(f => f.kind === kind && Math.hypot(...f.position.map((v, i) => v - center[i])) < 1.2)) {
        fixtures.push({kind, position: center.map(v => +v.toFixed(3)) as Point});
      }
    }
  }
}
// Do not infer road topology from triangle or UV ordering. Blender exports the
// editable centreline and checkpoints on the common parts of both alternatives.
const route = JSON.parse(await readFile(resolve(bundle, 'route_gltf.json'), 'utf8'));
const collision = await (await createIO()).read(resolve(bundle, 'tokyo-collision.glb'));
const roles = new Set(collision.getRoot().listNodes().map(n => n.getExtras().collision_role));
if (!roles.has('floor') || !roles.has('solid')) throw new Error('Collision bundle needs explicit floor and solid roles.');
if (route.samples.length < 100 || route.length_m < 1000) throw new Error('Invalid route bundle.');
// Keep the racing guide in the outer carriageway, away from the median.
// Checkpoint planes stay centred on the whole highway so either carriageway
// and both alternate routes remain legal.
const centerlineLength = route.length_m;
const guide: Point[] = route.samples.map((s: {position: Point; forward: Point}) => {
  const [x,y,z] = s.position, [fx,,fz] = s.forward;
  const n = Math.hypot(fx,fz);
  return [x + fz/n*8, y, z - fx/n*8];
});
let distance=0;
route.samples=guide.map((position,i) => {
  const next=guide[(i+1)%guide.length];
  const delta=next.map((v,k)=>v-position[k]);
  const length=Math.hypot(...delta);
  const sample={distance_m:distance,position,forward:delta.map(v=>v/length),width_m:16};
  distance+=length;
  return sample;
});
route.length_m=distance;
route.centerline_length_m=centerlineLength;
route.racing_line_offset_m=-8;
const gameplay=JSON.parse(await readFile(resolve(bundle,'gameplay.json'),'utf8'));
gameplay.lap_length_m=distance;
gameplay.spawn_positions[0].position_gltf=route.samples[0].position;
gameplay.spawn_positions[0].forward_gltf=route.samples[0].forward;
const spawns=JSON.parse(await readFile(resolve(bundle,'test-spawns.json'),'utf8'));
for (const [name,spawn] of Object.entries(spawns) as [string,{position:Point;forward:Point}][]) {
  if (!['start','bridge','spiral','tunnel'].includes(name)) continue;
  const [fx,,fz]=spawn.forward,n=Math.hypot(fx,fz),offset=name==='tunnel'?5:8;
  spawn.position=[spawn.position[0]+fz/n*offset,spawn.position[1],spawn.position[2]-fx/n*offset];
}
for (const file of ['tokyo-highway.glb', 'tokyo-collision.glb']) {
  await copyFile(resolve(bundle, file), resolve(folder, file));
}
await writeFile(resolve(folder,'route_gltf.json'),JSON.stringify(route));
await writeFile(resolve(folder,'gameplay.json'),JSON.stringify(gameplay));
await writeFile(resolve(folder,'test-spawns.json'),JSON.stringify(spawns));
await writeFile(resolve(folder, 'lights.json'), JSON.stringify(fixtures));
console.log({routeSamples: route.samples.length, length: route.length_m, fixtures: Object.fromEntries(['sodium', 'tunnel', 'beacon'].map(k => [k, fixtures.filter(f => f.kind === k).length]))});
