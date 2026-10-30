import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BufferGeometry, BufferAttribute, Group, Mesh, MeshBasicMaterial} from 'three';
import {createIO} from './io.ts';
import {extractTokyoCollision, isTokyoFloor} from '../../src/content/tracks/tokyo-highway/tokyo-surface.ts';
import {TrackCollision} from '../../src/sim/track-collision.ts';
import {Landscape} from '../../src/sim/landscape.ts';
import {createHoverState} from '../../src/sim/hover-state.ts';

const folder = 'public/models/tokyo-highway';
const document = await (await createIO()).read(`${folder}/tokyo-collision.glb`);
const root = new Group();
let triangleCount = 0;
for (const node of document.getRoot().listNodes()) {
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(primitive.getAttribute('POSITION').getArray(), 3));
    geometry.setIndex(new BufferAttribute(primitive.getIndices().getArray(), 1));
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.name = node.getName(); mesh.userData = node.getExtras();
    mesh.matrix.fromArray(node.getWorldMatrix()); mesh.matrixAutoUpdate = false;
    triangleCount += geometry.index.count / 3;
    root.add(mesh);
  }
}
const {surface} = extractTokyoCollision(root);
const route = JSON.parse(await readFile(`${folder}/route_gltf.json`, 'utf8'));
const gameplay = JSON.parse(await readFile(`${folder}/gameplay.json`, 'utf8'));
let queried = 0;
for (const [name, points, tolerance] of [
  ['main', route.samples.map(s => s.position), .08],
  ...route.shortcuts.map((points, i) => [`alternative-${i}`, points, .8]),
]) {
  for (const [i, p] of points.entries()) {
    surface.referenceHeight = p[1];
    const y = surface.height(p[0], p[2]);
    assert(y !== null && Math.abs(y - p[1]) < tolerance, `${name}:${i} floor mismatch: ${y} vs ${p[1]}`);
    queried++;
  }
}
// Same X/Z, two spiral levels: both must resolve according to vehicle elevation.
const positions = route.samples.map(s => s.position);
let stacked = 0;
for (let i = 0; i < positions.length; i++) {
  const a = positions[i];
  for (let j = i + 20; j < positions.length; j++) {
    const b = positions[j];
    if (Math.hypot(a[0] - b[0], a[2] - b[2]) > 1.5 || Math.abs(a[1] - b[1]) < 8) continue;
    surface.referenceHeight = a[1]; const low = surface.height(a[0], a[2]);
    surface.referenceHeight = b[1]; const high = surface.height(a[0], a[2]);
    assert(low !== null && high !== null && Math.abs(high - low) > 8, 'Spiral levels collapsed');
    surface.referenceHeight = Math.max(low, high) - 2;
    assert(Math.abs(surface.height(a[0], a[2]) - Math.min(low, high)) < .1, 'A vehicle below the upper deck snapped upward');
    stacked++;
  }
}
assert(stacked > 0, 'No stacked-road probes found');
const landscape = new Landscape(route, gameplay);
const collision = new TrackCollision(root, {isFloor: isTokyoFloor, exploration: true, surfaceHeightOverride: surface.height});
const p = gameplay.checkpoints[0].position_gltf, f = gameplay.checkpoints[0].forward_gltf;
for (const side of [-1, 1]) {
  surface.referenceHeight = p[1];
  const state = createHoverState(landscape);
  Object.assign(state, {x:p[0] - f[2]*12*side, y:p[1]+.65, z:p[2]+f[0]*12*side, vx:-f[2]*10*side, vz:f[0]*10*side});
  let hit = false;
  for (let step=0; step<90; step++) {
    state.x += state.vx / 60; state.z += state.vz / 60;
    collision.step(state, 1/60, landscape);
    hit ||= state.wallHit;
    assert(state.y > 30 && !state.recoverNeeded, `Guardrail ${side} lost the elevated floor`);
  }
  assert(hit, `Guardrail ${side} did not block an approaching vehicle`);

}
assert(gameplay.checkpoints.every((cp,i,a) => i === 0 || cp.route_index > a[i-1].route_index), 'Checkpoint order must follow the lap');
for (const [i,p] of positions.entries()) {
  surface.referenceHeight=p[1];const f=route.samples[i].forward;
  const state=createHoverState(landscape);
  Object.assign(state,{x:p[0],y:p[1]+.65,z:p[2],yaw:Math.atan2(f[0],f[2])});
  collision.step(state,1/60,landscape);
  assert(!state.wallHit, `Racing guide intersects a blocker at sample ${i}`);
}
collision.dispose();
console.log(JSON.stringify({triangleCount, surfaceQueries:queried, stackedRoadPairs:stacked, guardrails:'both sides passed', checkpoints:gameplay.checkpoints.length}, null, 2));
