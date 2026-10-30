import {mkdir, copyFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Matrix4, Vector3} from 'three';
import {createIO} from './io.js';

// Keep the authored GLB intact. Only derive small, reviewable runtime data.
// Usage: pnpm exec tsx scripts/assets/prepare-tokyo.ts <source.glb>
const source = process.argv[2];
if (!source) throw new Error('Supply the Tokyo Highway GLB path.');
const folder = resolve('public/models/tokyo-highway');
await mkdir(folder, {recursive: true});
const document = await (await createIO()).read(source);
type Point = [number, number, number];
const fixtures: {kind: string; position: Point}[] = [];
const stations = new Map<string, Point>();
const point = new Vector3();
const value: number[] = [];
for (const node of document.getRoot().listNodes()) {
  const matrix = new Matrix4().fromArray(node.getWorldMatrix());
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const name = primitive.getMaterial()?.getName() ?? '';
    const position = primitive.getAttribute('POSITION')!;
    const uv = primitive.getAttribute('TEXCOORD_0');
    const indices = primitive.getIndices()!.getArray()!;
    const positions: Point[] = [];
    const uvs: number[][] = [];
    for (let i = 0; i < position.getCount(); i++) {
      positions.push(point.fromArray(position.getElement(i, value)).applyMatrix4(matrix).toArray());
      if (uv) uvs.push([...uv.getElement(i, value)]);
    }
    if (node.getName() === 'HW_Sketch_Circuit' && name === 'MAT_HW_Shared_Grit_v07') {
      for (let i = 0; i < indices.length; i += 3) {
        const ids = [indices[i], indices[i + 1], indices[i + 2]];
        if (ids.some((id) => uvs[id][0] > 0.64)) continue;
        const [a, b, c] = ids.map((id) => positions[id]);
        if ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) <= 0) continue;
        for (let k = 0; k < 3; k++) {
          const x = ids[k], y = ids[(k + 1) % 3];
          if (Math.abs(uvs[x][0] - uvs[y][0]) < 0.5 || Math.abs(uvs[x][1] - uvs[y][1]) > 0.01) continue;
          const middle = positions[x].map((v, axis) => (v + positions[y][axis]) / 2) as Point;
          stations.set(middle.map((v) => v.toFixed(2)).join(','), middle);
        }
      }
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
// Follow one continuous carriageway. The only gap is the separately exported
// straight drawbridge; interpolate that span at the authored deck height.
const remaining = [...stations.values()];
const first = remaining.findIndex(p => Math.hypot(p[0] - 204, p[2] + 174) < 1);
if (first < 0) throw new Error('Tokyo export changed: could not locate the east bridge approach.');
const route = [remaining.splice(first, 1)[0]];
while (remaining.length) {
  const previous = route.at(-1)!;
  let nearest = -1, distance = Infinity;
  remaining.forEach((p, i) => {
    const d = Math.hypot(...p.map((v, axis) => v - previous[axis]));
    if (d < distance) { distance = d; nearest = i; }
  });
  if (distance > 8) break;
  route.push(remaining.splice(nearest, 1)[0]);
}
if (route.length < 400 || Math.hypot(route.at(-1)![0] + 30, route.at(-1)![2] - 14) > 3) {
  throw new Error('Tokyo export changed: inspect the road before rebuilding the route.');
}
const end = route.at(-1)!;
const span = Math.ceil(Math.hypot(...end.map((v, axis) => v - route[0][axis])) / 5);
for (let i = 1; i < span; i++) route.push(end.map((v, axis) => v + (route[0][axis] - v) * i / span) as Point);
let length = 0;
const samples = route.map((position, index) => {
  if (index) length += Math.hypot(...position.map((v, axis) => v - route[index - 1][axis]));
  return {distance_m: length, position: position.map(v => +v.toFixed(3)), width_m: 16};
});
length += Math.hypot(...route[0].map((v, axis) => v - route.at(-1)![axis]));
const direction = (i: number): Point => {
  const a = route[i], b = route[(i + 1) % route.length];
  return new Vector3(...b).sub(new Vector3(...a)).normalize().toArray();
};
await copyFile(source, resolve(folder, 'tokyo-highway.glb'));
await writeFile(resolve(folder, 'route_gltf.json'), JSON.stringify({length_m: length, samples}));
await writeFile(resolve(folder, 'gameplay.json'), JSON.stringify({
  name: 'Tokyo Highway · lighting test', road_width_m: 16,
  spawn_positions: [{position_gltf: route[0], forward_gltf: direction(0)}],
  checkpoints: Array.from({length: 16}, (_, order) => {
    const i = Math.floor(order * route.length / 16);
    return {order, route_index: i, position_gltf: route[i], forward_gltf: direction(i), width_m: 32};
  }),
}));
await writeFile(resolve(folder, 'lights.json'), JSON.stringify(fixtures));
console.log({routeSamples: route.length, length, fixtures: Object.fromEntries(['sodium', 'tunnel', 'beacon'].map(k => [k, fixtures.filter(f => f.kind === k).length]))});
