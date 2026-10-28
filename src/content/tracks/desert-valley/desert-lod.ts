import {Box3, DynamicDrawUsage, Group, InstancedMesh, Matrix4, Mesh, Sphere, Vector3} from 'three';
import type {BufferGeometry, Material, Object3D} from 'three';
import type {Position3} from '@/sim/hover-state';
import {isMesh} from '../scene-utils';
import type {DesertDetailFamily, DesertDetailManifest} from './desert-asset';

export type DesertLodMode = 'adaptive' | 'full';

export interface DesertLodStats {
  mode: DesertLodMode;
  instances: number;
  vegetation: number;
  /** Instances drawn at LOD 0, 1 and 2. */
  levels: [number, number, number];
  culled: number;
  triangles: number;
  fullTriangles: number;
  /** Draw objects (instanced batches and static meshes). */
  batches: number;
  switches: number;
  updates: number;
  updateMs: number;
}

export interface DesertLodOptions {
  /** Spatial grouping when a batch needs more than one buffer. */
  cellSize?: number;
  /** Instances per buffer: r182 keeps small instance arrays in 16 KB-safe uniform blocks. */
  maxInstances?: number;
  mode?: DesertLodMode;
}

const CULLED = 3;

// Distances are measured from the ship, not the orbit/follow camera. Level 3
// means culled. Separate enter/exit thresholds prevent boundary oscillation.
export function selectDesertLod(
  distance: number,
  previous: number,
  distances: readonly number[],
  cullDistance: number | null,
  hysteresis = 0.12,
): number {
  return selectLevel(distance, previous, [...distances, cullDistance ?? Infinity], hysteresis);
}

function selectLevel(distance: number, previous: number, limits: readonly number[], hysteresis: number): number {
  if (previous < 0) return distance < limits[0] ? 0 : distance < limits[1] ? 1 : distance < limits[2] ? 2 : 3;
  let level = previous;
  while (level < 3 && distance > limits[level] * (1 + hysteresis)) level++;
  while (level > 0 && distance < limits[level - 1] * (1 - hysteresis)) level--;
  return level;
}

/** One placed detail and the draw it belongs to at each LOD. */
interface LodInstance {
  family: DesertDetailFamily;
  limits: readonly number[];
  x: number;
  y: number;
  z: number;
  /** Mesas measure distance to their footprint, not their pivot. */
  bounds: Box3 | null;
  state: number;
  /** Draw holding the instance at LOD 0, 1 and 2. */
  draws: LodDraw[];
}

/** Instances sharing geometry, material, prototype transform and shadow mode. */
interface DrawSpec {
  key: string;
  geometry: BufferGeometry;
  material: Material;
  prototype: Matrix4;
  castShadow: boolean;
  families: Set<string>;
  levels: Set<number>;
  members: LodInstance[];
}

/**
 * Instances of one draw: either a compacted InstancedMesh, rewritten only when
 * the LOD selection changes, or (never-culled, level-invariant details such as
 * the mesas) plain static meshes.
 */
class LodDraw {
  readonly objects: Object3D[] = [];
  readonly members: LodInstance[] = [];
  mesh: InstancedMesh | null = null;
  dirty = true;
  private matrices = new Float32Array(0);
  private spheres = new Float32Array(0);
  private readonly sphere = new Sphere();
  private readonly box = new Box3();
  private readonly point = new Vector3();

  /** Precomputes each member's instance matrix and world bounding sphere. */
  prepare(spec: DrawSpec, members: LodInstance[], placements: Map<LodInstance, Matrix4>): void {
    const matrix = new Matrix4();
    const geometry = spec.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const local = geometry.boundingSphere!;
    this.matrices = new Float32Array(members.length * 16);
    this.spheres = new Float32Array(members.length * 4);
    members.forEach((member, i) => {
      matrix.multiplyMatrices(placements.get(member)!, spec.prototype);
      matrix.toArray(this.matrices, i * 16);
      this.point.copy(local.center).applyMatrix4(matrix);
      this.point.toArray(this.spheres, i * 4);
      this.spheres[i * 4 + 3] = local.radius * matrix.getMaxScaleOnAxis();
      this.members.push(member);
    });
  }

  /** Packs the members currently assigned to this draw at the front of the buffer. */
  rebuild(showAll = false): void {
    this.dirty = false;
    const mesh = this.mesh;
    if (!mesh) return;
    const target = mesh.instanceMatrix.array as Float32Array;
    const {members, matrices, spheres, box} = this;
    box.makeEmpty();
    let count = 0;
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      if (!showAll && (member.state >= CULLED || member.draws[member.state] !== this)) continue;
      for (let k = 0; k < 16; k++) target[count * 16 + k] = matrices[i * 16 + k];
      const r = spheres[i * 4 + 3];
      box.expandByPoint(this.point.set(spheres[i * 4] - r, spheres[i * 4 + 1] - r, spheres[i * 4 + 2] - r));
      box.expandByPoint(this.point.set(spheres[i * 4] + r, spheres[i * 4 + 1] + r, spheres[i * 4 + 2] + r));
      count++;
    }
    mesh.count = count;
    // Empty batches are skipped entirely, not drawn with zero instances.
    mesh.visible = count > 0;
    if (!count) return;
    mesh.instanceMatrix.needsUpdate = true;
    // Bounds cover exactly the active instances, so far batches still cull.
    const sphere = box.getBoundingSphere(this.sphere);
    let radius = 0;
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      if (!showAll && (member.state >= CULLED || member.draws[member.state] !== this)) continue;
      const d =
        Math.hypot(spheres[i * 4] - sphere.center.x, spheres[i * 4 + 1] - sphere.center.y, spheres[i * 4 + 2] - sphere.center.z) +
        spheres[i * 4 + 3];
      if (d > radius) radius = d;
    }
    sphere.radius = radius;
    (mesh.boundingSphere ??= new Sphere()).copy(sphere);
  }
}

/**
 * Desert vegetation, rocks and mesas: loaded once, drawn by distance from the
 * ship. Instances that share a prototype (geometry, material, transform and
 * shadow mode) across families, cells and LOD levels share one compacted
 * buffer, so the scene holds a few dozen draw objects instead of hundreds and
 * every one of them can be compiled during loading. Only level changes
 * rewrite matrices; no per-plant Object3D traversal.
 */
export class DesertLod {
  readonly group = new Group();
  readonly stats: DesertLodStats;
  private readonly instances: LodInstance[] = [];
  private readonly draws: LodDraw[] = [];
  private readonly point = new Vector3();
  private readonly anchor = new Vector3(Infinity, Infinity, Infinity);
  private readonly hysteresis: number;
  private mode: DesertLodMode;
  private elapsed = Infinity;
  private dirty = true;

  constructor(
    root: Object3D,
    asset: Object3D,
    manifest: DesertDetailManifest,
    {cellSize = 96, maxInstances = 128, mode = 'adaptive'}: DesertLodOptions = {},
  ) {
    this.mode = mode;
    this.hysteresis = manifest.hysteresis;
    asset.updateMatrixWorld(true);
    this.group.name = 'Desert detail · ship distance LOD';
    root.add(this.group);
    this.stats = {
      mode,
      instances: manifest.instanceCount,
      vegetation: manifest.vegetationCount,
      levels: [0, 0, 0],
      culled: 0,
      triangles: 0,
      fullTriangles: 0,
      batches: 0,
      switches: 0,
      updates: 0,
      updateMs: 0,
    };
    const replaced = new Set(manifest.replacements.map((x) => x.source));
    for (const family of manifest.families) if (family.replacesSource) replaced.add(family.replacesSource);
    const removals: Object3D[] = [];
    root.traverse((o) => {
      if (o.userData.role === 'vegetation' || replaced.has(o.userData.source_object as string)) removals.push(o);
    });
    // Collision has already captured these geometries in its immutable octree.
    for (const o of removals) o.removeFromParent();
    const replacementMeshes = new Map<string, Object3D>();
    asset.traverse((o) => {
      if (o.userData.replaces_source) replacementMeshes.set(o.userData.replaces_source as string, o);
    });
    for (const replacement of manifest.replacements) {
      const mesh = replacementMeshes.get(replacement.source);
      if (!mesh || !isMesh(mesh)) throw new Error(`Missing desert replacement: ${replacement.node}`);
      mesh.userData.visualDetail = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.build(asset, manifest, cellSize, maxInstances);
    this.stats.batches = this.draws.reduce((n, draw) => n + (draw.mesh ? 1 : draw.objects.length), 0);
  }

  /** Re-selects levels when the ship moved ≥ 2 m and ≥ 0.12 s passed (or when forced). */
  update(position: Position3, dt = 0, force = false): void {
    this.elapsed += dt;
    const {point, anchor, stats} = this;
    point.set(position.x, position.y, position.z);
    if (!force && !this.dirty && (this.elapsed < 0.12 || point.distanceToSquared(anchor) < 4)) return;
    const start = performance.now();
    anchor.copy(point);
    this.elapsed = 0;
    stats.levels.fill(0);
    stats.culled = 0;
    stats.triangles = 0;
    const full = this.mode === 'full';
    for (const instance of this.instances) {
      const {family, bounds} = instance;
      const distance = bounds
        ? bounds.distanceToPoint(point)
        : Math.hypot(instance.x - point.x, instance.y - point.y, instance.z - point.z);
      const next = full ? 0 : selectLevel(distance, instance.state, instance.limits, this.hysteresis);
      const previous = instance.state;
      if (next !== previous) {
        if (previous >= 0) stats.switches++;
        const before = previous >= 0 && previous < CULLED ? instance.draws[previous] : null;
        const after = next < CULLED ? instance.draws[next] : null;
        if (before !== after) {
          if (before) before.dirty = true;
          if (after) after.dirty = true;
        }
        instance.state = next;
      }
      if (next === CULLED) stats.culled++;
      else {
        stats.levels[next]++;
        stats.triangles += family.triangles[next];
      }
    }
    for (const draw of this.draws) if (draw.dirty || this.dirty) draw.rebuild();
    this.dirty = false;
    stats.updates++;
    stats.updateMs = performance.now() - start;
  }

  setMode(value: string): void {
    this.mode = value === 'full' ? 'full' : 'adaptive';
    this.stats.mode = this.mode;
    this.dirty = true;
    for (const instance of this.instances) instance.state = -1;
  }

  /** Shows every instance of every draw (for shader warm-up); returns the restore function. */
  showAll(): () => void {
    for (const draw of this.draws) draw.rebuild(true);
    return () => {
      for (const draw of this.draws) draw.rebuild();
    };
  }

  dispose(): void {
    for (const draw of this.draws) draw.mesh?.dispose();
    this.group.removeFromParent();
  }

  private build(asset: Object3D, manifest: DesertDetailManifest, cellSize: number, maxInstances: number): void {
    const specs = new Map<string, DrawSpec>();
    const placements = new Map<LodInstance, Matrix4>();
    const levelSpecs = new Map<LodInstance, DrawSpec[]>();
    const matrix = new Matrix4();
    for (const family of manifest.families) {
      const prototypes = family.nodes.map((name) => {
        const mesh = asset.getObjectByName(name);
        if (!mesh || !isMesh(mesh)) throw new Error(`Missing desert LOD: ${name}`);
        mesh.geometry.computeBoundingBox();
        return mesh;
      });
      // KHR_mesh_quantization may move dequantization into each prototype's
      // transform. Keep it after the authored placement, for every LOD level.
      const prototypeMatrices = prototypes.map((prototype) => prototype.matrixWorld.clone());
      const familySpecs = prototypes.map((prototype, level) => {
        const castShadow = family.role === 'mesa' || level === 0 || (family.id.startsWith('Art28_') && level === 1);
        const material = prototype.material as Material;
        const key = `${prototype.geometry.uuid}|${material.uuid}|${prototypeMatrices[level].elements.join(',')}|${castShadow}`;
        let spec = specs.get(key);
        if (!spec) {
          spec = {
            key,
            geometry: prototype.geometry,
            material,
            prototype: prototypeMatrices[level],
            castShadow,
            families: new Set(),
            levels: new Set(),
            members: [],
          };
          specs.set(key, spec);
        }
        spec.families.add(family.id);
        spec.levels.add(level);
        return spec;
      });
      const limits = [...family.distances, family.cullDistance ?? Infinity];
      for (const placement of family.placements) {
        const a = placement.matrix;
        const placed = new Matrix4().fromArray(a);
        const bounds =
          family.role === 'mesa'
            ? prototypes[0].geometry.boundingBox!.clone().applyMatrix4(matrix.copy(placed).multiply(prototypeMatrices[0]))
            : null;
        const instance: LodInstance = {family, limits, x: a[12], y: a[13], z: a[14], bounds, state: -1, draws: []};
        placements.set(instance, placed);
        levelSpecs.set(instance, familySpecs);
        for (const spec of new Set(familySpecs)) spec.members.push(instance);
        this.instances.push(instance);
        this.stats.fullTriangles += family.triangles[0];
      }
    }
    const drawOf = new Map<DrawSpec, Map<LodInstance, LodDraw>>();
    for (const spec of specs.values()) drawOf.set(spec, this.createDraws(spec, placements, levelSpecs, cellSize, maxInstances));
    // Each instance points at the draw (chunk) holding it at each level.
    for (const instance of this.instances) instance.draws = levelSpecs.get(instance)!.map((spec) => drawOf.get(spec)!.get(instance)!);
  }

  private createDraws(
    spec: DrawSpec,
    placements: Map<LodInstance, Matrix4>,
    levelSpecs: Map<LodInstance, DrawSpec[]>,
    cellSize: number,
    maxInstances: number,
  ): Map<LodInstance, LodDraw> {
    const drawOf = new Map<LodInstance, LodDraw>();
    const name = `LOD_${[...spec.families].join('+')}_L${[...spec.levels].join('')}`;
    const userData = {detailFamily: [...spec.families][0], lodLevel: Math.min(...spec.levels), visualDetail: true};
    // Never culled and identical at every level: plain static meshes, which
    // share shader builds and are culled per object by the renderer.
    const isStatic = spec.members.every(
      (member) => member.family.cullDistance === null && levelSpecs.get(member)!.every((s) => s === spec),
    );
    if (isStatic) {
      const draw = new LodDraw();
      const matrix = new Matrix4();
      spec.members.forEach((member, i) => {
        const mesh = new Mesh(spec.geometry, spec.material);
        mesh.name = spec.members.length > 1 ? `${name}_${i}` : name;
        mesh.userData = {...userData};
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(matrix.multiplyMatrices(placements.get(member)!, spec.prototype));
        mesh.castShadow = spec.castShadow;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        draw.objects.push(mesh);
        drawOf.set(member, draw);
      });
      this.draws.push(draw);
      return drawOf;
    }
    // Larger sets split into spatially coherent chunks (Morton order of cells).
    const morton = (member: LodInstance): number => {
      const cx = Math.floor(member.x / cellSize) + 512;
      const cz = Math.floor(member.z / cellSize) + 512;
      let code = 0;
      for (let bit = 0; bit < 10; bit++) code |= (((cx >> bit) & 1) << (2 * bit)) | (((cz >> bit) & 1) << (2 * bit + 1));
      return code;
    };
    const members = spec.members.length > maxInstances ? [...spec.members].sort((a, b) => morton(a) - morton(b)) : spec.members;
    for (let offset = 0; offset < members.length; offset += maxInstances) {
      const chunk = members.slice(offset, offset + maxInstances);
      const draw = new LodDraw();
      // Few capacities, few shader variants: the instance array length is part of the shader.
      const capacity = Math.min(maxInstances, Math.max(4, 2 ** Math.ceil(Math.log2(chunk.length))));
      const mesh = new InstancedMesh(spec.geometry, spec.material, capacity);
      mesh.name = members.length > maxInstances ? `${name}_${offset / maxInstances}` : name;
      mesh.userData = {...userData};
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.castShadow = spec.castShadow;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      mesh.boundingSphere = new Sphere();
      draw.mesh = mesh;
      draw.objects.push(mesh);
      draw.prepare(spec, chunk, placements);
      this.group.add(mesh);
      this.draws.push(draw);
      for (const member of chunk) drawOf.set(member, draw);
    }
    return drawOf;
  }
}
