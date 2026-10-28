import {Group, MathUtils, Mesh, MeshBasicMaterial, Ray, Vector3, type BufferGeometry, type Object3D} from 'three';
import {Capsule} from 'three/addons/math/Capsule.js';
import {Octree} from 'three/addons/math/Octree.js';
import type {GLTFLoaderPlugin, GLTFParser} from 'three/addons/loaders/GLTFLoader.js';
import type {Disposable} from '@/core/disposable';
import type {HoverState, Position3} from './hover-state';
import {MAX_HOVER_HEIGHT, MIN_HOVER_HEIGHT, type SurfaceHeight} from './hover-physics';
import type {Landscape} from './landscape';

// Ignore collider materials and embedded albedo images: only geometry is needed.
export const collisionMaterials = (parser: GLTFParser): GLTFLoaderPlugin & {loadMaterial(index: number): Promise<MeshBasicMaterial>} => ({
  name: 'collision-materials',
  loadMaterial(index: number) {
    const materials = parser.json.materials as {name?: string}[] | undefined;
    return Promise.resolve(new MeshBasicMaterial({name: materials?.[index]?.name ?? 'Collider'}));
  },
});

const CELL = 12;
// Integer cell coordinates packed into one number: no string keys per query.
const cellKey = (x: number, z: number) => (x + 32768) * 65536 + (z + 32768);

/**
 * Height field over collider triangles, bucketed on a 12 m grid. Indexed
 * triangle heights retain sidewalks and terrain under the road, but exclude
 * architecture: a bridge roof must never become the driving surface.
 */
export class SurfaceIndex {
  private readonly grid = new Map<number, number[]>();
  private readonly data: Float64Array;

  constructor(meshes: Mesh | Mesh[]) {
    const list = Array.isArray(meshes) ? meshes : [meshes];
    const count = list.reduce((n, m) => n + (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3, 0);
    const data = (this.data = new Float64Array(count * 10));
    const p = new Vector3();
    let used = 0;
    for (const mesh of list) {
      mesh.updateWorldMatrix(true, false);
      const g = mesh.geometry;
      const pos = g.attributes.position;
      const idx = g.index;
      const n = idx?.count ?? pos.count;
      for (let i = 0; i < n; i += 3) {
        const at = used * 10;
        for (let k = 0; k < 3; k++) {
          p.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld);
          data[at + k * 3] = p.x;
          data[at + k * 3 + 1] = p.y;
          data[at + k * 3 + 2] = p.z;
        }
        const ax = data[at];
        const az = data[at + 2];
        const bx = data[at + 3];
        const bz = data[at + 5];
        const cx = data[at + 6];
        const cz = data[at + 8];
        const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(den) < 1e-9) continue;
        data[at + 9] = den;
        for (let x = Math.floor(Math.min(ax, bx, cx) / CELL); x <= Math.floor(Math.max(ax, bx, cx) / CELL); x++) {
          for (let z = Math.floor(Math.min(az, bz, cz) / CELL); z <= Math.floor(Math.max(az, bz, cz) / CELL); z++) {
            const key = cellKey(x, z);
            let cell = this.grid.get(key);
            if (!cell) this.grid.set(key, (cell = []));
            cell.push(at);
          }
        }
        used++;
      }
    }
  }

  /** Highest surface under (x, z), or null off the colliders. */
  height = (x: number, z: number): number | null => {
    const {data} = this;
    const cell = this.grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!cell) return null;
    let height = -Infinity;
    for (const i of cell) {
      const ax = data[i];
      const az = data[i + 2];
      const bx = data[i + 3];
      const bz = data[i + 5];
      const cx = data[i + 6];
      const cz = data[i + 8];
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / data[i + 9];
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / data[i + 9];
      if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001)
        height = Math.max(height, u * data[i + 1] + v * data[i + 4] + (1 - u - v) * data[i + 7]);
    }
    return Number.isFinite(height) ? height : null;
  };
}

export interface TrackCollisionOptions {
  isFloor?: (mesh: Mesh) => boolean;
  isSolid?: (mesh: Mesh) => boolean;
  /** Free roaming: no off-road drag or automatic recovery. */
  exploration?: boolean;
  surfaceHeightOverride?: SurfaceHeight | null;
}

const DEFAULT_FLOOR = (mesh: Mesh) => /COL_TRACK|COL_STREET_CURB|COL_CITY_SIDEWALK|COL_ENV_TERRAIN_(CITY|DISTANT)/.test(mesh.name);

/**
 * Solid collision for tracks with physical boundaries: an octree of collider
 * meshes tested against three vertical capsules approximating the hull,
 * plus the floor height field and camera clipping.
 */
export class TrackCollision implements Disposable {
  readonly surfaceHeight: SurfaceHeight;
  private readonly octree: Octree;
  private readonly exploration: boolean;
  private readonly hull = new Capsule();
  private readonly normal = new Vector3();
  private readonly cameraRay = new Ray();
  private readonly cameraDelta = new Vector3();

  constructor(
    root: Object3D,
    {isFloor = DEFAULT_FLOOR, isSolid = () => true, exploration = false, surfaceHeightOverride = null}: TrackCollisionOptions = {},
  ) {
    const floor: Mesh[] = [];
    const solids = new Group();
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh<BufferGeometry>;
      if (isFloor(mesh)) floor.push(mesh);
      else if (isSolid(mesh)) {
        const proxy = new Mesh(mesh.geometry, mesh.material);
        proxy.matrix.copy(mesh.matrixWorld);
        proxy.matrixAutoUpdate = false;
        solids.add(proxy);
      }
    });
    this.exploration = exploration;
    this.surfaceHeight = surfaceHeightOverride ?? new SurfaceIndex(floor).height;
    this.octree = new Octree().fromGraphNode(solids);
  }

  step(state: HoverState, dt: number, landscape: Landscape, previous?: Position3): void {
    const {hull, normal, octree, exploration} = this;
    // Three vertical capsules approximate the hull. Fixed 60 Hz steps travel at
    // most 1.2 m, less than the capsule diameter, preventing thin-wall tunnelling.
    state.wallHit = false;
    const fx = Math.sin(state.yaw);
    const fz = Math.cos(state.yaw);
    const shape = state.hull;
    const spacing = shape?.capsuleSpacing ?? 0.9;
    for (let pass = 0; pass < 2; pass++) {
      for (const offset of [-spacing, 0, spacing]) {
        hull.start.set(state.x + fx * offset, state.y + (shape?.capsuleBottom ?? 1.2), state.z + fz * offset);
        hull.end.set(hull.start.x, state.y + (shape?.capsuleTop ?? 2.45), hull.start.z);
        hull.radius = shape?.capsuleRadius ?? 1.25;
        const hit = octree.capsuleIntersect(hull);
        if (!hit) continue;
        normal.copy(hit.normal);
        state.x += normal.x * hit.depth;
        state.z += normal.z * hit.depth;
        if (normal.y < -0.8 && previous) {
          state.x = previous.x;
          state.z = previous.z;
          state.wallHit = true;
          if (state.speed > 1.5) {
            state.impact = Math.min(14, state.speed);
            state.impactSerial++;
            state.impactX = state.x + fx * 2;
            state.impactZ = state.z + fz * 2;
          }
          state.vx *= -0.1;
          state.vz *= -0.1;
          state.throttle = Math.min(state.throttle, 5);
          continue;
        }
        if (Math.abs(normal.y) > 0.8) continue;
        state.wallHit = true;
        const inward = state.vx * normal.x + state.vz * normal.z;
        if (inward < 0) {
          state.vx -= inward * 1.18 * normal.x;
          state.vz -= inward * 1.18 * normal.z;
          state.vx *= 0.92;
          state.vz *= 0.92;
          state.throttle = Math.min(state.throttle, Math.hypot(state.vx, state.vz) + 3);
          if (inward < -1.5) {
            state.impact = Math.min(14, -inward);
            state.impactSerial++;
            state.impactX = state.x - normal.x * 1.3;
            state.impactZ = state.z - normal.z * 1.3;
            state.hoverVelocity += Math.min(0.4, -inward * 0.025);
          }
        }
      }
    }
    const road = landscape.roadAt(state.x, state.z);
    const offRoad = road.distanceToRoad > road.width / 2 + 1;
    if (offRoad && !exploration) {
      const drag = Math.exp(-dt * 0.65);
      state.vx *= drag;
      state.vz *= drag;
    }
    state.offTrackTime = offRoad ? (state.offTrackTime ?? 0) + dt : 0;
    const floorY = this.surfaceHeight(state.x, state.z) ?? null;
    if (floorY !== null && !state.airborne) {
      // A lateral collision can move the ship onto a different surface height.
      // Preserve suspension momentum; only correct unsafe clearance.
      state.hover = MathUtils.clamp(state.y - floorY, MIN_HOVER_HEIGHT, MAX_HOVER_HEIGHT);
      if (state.y < floorY + MIN_HOVER_HEIGHT) state.hoverVelocity = Math.max(0, state.hoverVelocity);
      if (state.y > floorY + MAX_HOVER_HEIGHT) state.hoverVelocity = Math.min(0, state.hoverVelocity);
      state.y = floorY + state.hover;
    }
    state.recoverNeeded = floorY === null || (!exploration && (road.distanceToRoad > 70 || state.offTrackTime > 10));
    state.speed = Math.hypot(state.vx, state.vz);
  }

  /** Pulls the camera in front of any collider between `from` and `to`. */
  clipCamera = (from: Vector3, to: Vector3): void => {
    const {cameraDelta, cameraRay} = this;
    cameraDelta.subVectors(to, from);
    const distance = cameraDelta.length();
    cameraRay.set(from, cameraDelta.normalize());
    const hit = this.octree.rayIntersect(cameraRay);
    if (hit && hit.distance < distance) to.copy(from).addScaledVector(cameraDelta, Math.max(0.5, hit.distance - 0.4));
  };

  dispose(): void {
    this.octree.clear();
  }
}
