import {Box3, BoxGeometry, InstancedMesh, MathUtils, Matrix4, MeshStandardMaterial, Object3D, Vector3} from 'three';
import type {HoverState, Position3} from '@/sim/hover-state';
import type {Vec3Array} from '@/sim/route-data';
import {isMesh} from '../scene-utils';

// Distances are metres and speed is metres/second. Intervals are measured from
// one locomotive departure to the next; a new pass also waits for the last car.
export const TRAIN_SETTINGS = Object.freeze({
  speedMps: 60, // 216 km/h
  initialDelaySeconds: 8,
  minIntervalSeconds: 45,
  maxIntervalSeconds: 60,
  endpointMarginM: 1,
  couplingThicknessM: 0.16,
});

/** railway.json: the rail centreline and the authored formation. */
export interface RailwayData {
  path: {distance_m: number; position: Vec3Array}[];
  path_length_m: number;
  rail_top_offset_m?: number;
  /** 1 or -1: direction of the first pass. */
  current_direction: number;
  units_in_formation: TrainUnitInfo[];
}

export interface TrainUnitInfo {
  /** Vehicle node name in the train GLB. */
  node: string;
  distance_from_locomotive_m: number;
  /** Front and back coupler, vehicle space. */
  coupler_local_gltf: [Vec3Array, Vec3Array];
  /** Front and back bogie centre, vehicle space (+X forward). */
  bogie_centers_local_gltf: [Vec3Array, Vec3Array];
}

/** What the train sound needs each frame (a reused object). */
export interface TrainAudioState {
  active: boolean;
  passId: number;
  locomotive: Vector3;
  locomotiveVisible: boolean;
  /** Closest point of the formation to the listener. */
  rolling: Vector3;
  speedMps: number;
}

interface TrainUnit {
  node: Object3D;
  info: TrainUnitInfo;
  bounds: Box3;
  worldBounds: Box3;
  position: Vector3;
  previous: Vector3;
  forward: Vector3;
  front: Vector3;
  back: Vector3;
  halfLength: number;
  halfWidth: number;
  previousMinY: number;
  previousMaxY: number;
  visible: boolean;
  wasVisible: boolean;
}

interface SweepHit {
  nx: number;
  nz: number;
  depth: number;
  t: number;
}

const clamp = MathUtils.clamp;
const UP = new Vector3(0, 1, 0);

/**
 * The freight train: it waits, crosses the valley along the railway at full
 * speed, then waits again, alternating direction. Cars emerge progressively
 * from the tunnel and push the ship away on contact.
 *
 * The runtime owns only the generated couplers. The world owns the loaded GLB
 * meshes/materials, so shared wagon geometry is never cloned or disposed here.
 */
export class DesertTrain {
  readonly settings = TRAIN_SETTINGS;
  private readonly path: RailwayData['path'];
  private readonly pathLength: number;
  private readonly units: TrainUnit[];
  private readonly locomotive: TrainUnit;
  private readonly couplingGeometry = new BoxGeometry(1, 1, 1);
  private readonly couplingMaterial = new MeshStandardMaterial({color: 0x34302b, roughness: 0.82, metalness: 0.45});
  private readonly couplings: InstancedMesh;
  private readonly clearTravel: number;
  // Scratch objects.
  private readonly front = new Vector3();
  private readonly back = new Vector3();
  private readonly axisX = new Vector3();
  private readonly axisY = new Vector3();
  private readonly axisZ = new Vector3();
  private readonly basis = new Matrix4();
  private readonly dummy = new Object3D();
  private readonly delta = new Vector3();
  private readonly offsets = [0, 0, 0];
  private readonly hit: SweepHit = {nx: 0, nz: 0, depth: 0, t: 0};
  private readonly audible: TrainAudioState;
  private readonly candidate = new Vector3();
  private isActive = false;
  private wait: number = TRAIN_SETTINGS.initialDelaySeconds;
  private direction: number;
  private nextDirection: number;
  private headTravel = 0;
  private passElapsed = 0;
  private interval = 0;
  private pass = 0;
  private disposed = false;

  constructor(
    readonly root: Object3D,
    private readonly railway: RailwayData,
  ) {
    const path = railway.path;
    if (!Array.isArray(path) || path.length < 2) throw new Error('Desert Valley: invalid railway path.');
    this.path = path;
    this.pathLength = railway.path_length_m;
    this.direction = this.nextDirection = railway.current_direction === 1 ? 1 : -1;
    const staticCouplings = root.getObjectByName('TRAIN_StaticCouplingPreview');
    if (staticCouplings) staticCouplings.visible = false;
    root.updateMatrixWorld(true);
    const inverse = new Matrix4();
    const relative = new Matrix4();
    const box = new Box3();
    this.units = railway.units_in_formation.map((info) => {
      const node = root.getObjectByName(info.node);
      if (!node) throw new Error(`Desert Valley: missing train vehicle ${info.node}.`);
      // All authored pivots use local +X forward and wheel contact at local Y=0.
      // Keep multi-material child meshes and their shared geometry intact.
      root.attach(node);
      node.updateMatrixWorld(true);
      inverse.copy(node.matrixWorld).invert();
      const bounds = new Box3();
      node.traverse((mesh) => {
        if (!isMesh(mesh)) return;
        mesh.geometry.computeBoundingBox();
        relative.multiplyMatrices(inverse, mesh.matrixWorld);
        box.copy(mesh.geometry.boundingBox!).applyMatrix4(relative);
        bounds.union(box);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      const scale = node.scale;
      return {
        node,
        info,
        bounds,
        worldBounds: new Box3(),
        position: new Vector3(),
        previous: new Vector3(),
        forward: new Vector3(1, 0, 0),
        front: new Vector3(),
        back: new Vector3(),
        halfLength: Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) * Math.abs(scale.x),
        halfWidth: Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) * Math.abs(scale.z),
        previousMinY: 0,
        previousMaxY: 0,
        visible: false,
        wasVisible: false,
      };
    });
    this.couplings = new InstancedMesh(this.couplingGeometry, this.couplingMaterial, Math.max(0, this.units.length - 1));
    this.couplings.name = 'TRAIN_DynamicCouplings';
    this.couplings.castShadow = true;
    this.couplings.receiveShadow = true;
    // Forty short bars span a long moving formation. Bounds change every tick.
    this.couplings.frustumCulled = false;
    root.add(this.couplings);
    this.locomotive = this.units[0];
    const last = this.units[this.units.length - 1];
    this.clearTravel = this.pathLength + last.info.distance_from_locomotive_m + last.halfLength + TRAIN_SETTINGS.endpointMarginM;
    this.audible = {
      active: false,
      passId: 0,
      locomotive: this.locomotive.position,
      locomotiveVisible: false,
      rolling: new Vector3(),
      speedMps: TRAIN_SETTINGS.speedMps,
    };
    this.reset();
  }

  get active(): boolean {
    return this.isActive;
  }

  get passId(): number {
    return this.pass;
  }

  /** Advances the schedule and the formation (fixed simulation step). */
  step(dt: number): void {
    if (this.disposed || dt <= 0) return;
    if (!this.isActive) {
      this.wait -= dt;
      if (this.wait > 0) return;
      this.beginPass();
    }
    this.passElapsed += dt;
    this.headTravel += TRAIN_SETTINGS.speedMps * dt;
    if (this.headTravel > this.clearTravel) {
      this.isActive = false;
      this.wait = Math.max(0, this.interval - this.passElapsed);
    }
    this.placeUnits();
  }

  reset(): void {
    this.isActive = false;
    this.wait = TRAIN_SETTINGS.initialDelaySeconds;
    this.nextDirection = this.railway.current_direction === 1 ? 1 : -1;
    this.headTravel = -this.locomotive.halfLength - TRAIN_SETTINGS.endpointMarginM;
    this.placeUnits();
  }

  /** Pushes the ship out of any car it touched during this step. */
  collide(state: HoverState, dt: number, previous?: Position3): void {
    if (!this.isActive || this.disposed || dt <= 0) return;
    const shape = state.hull;
    const spacing = shape?.capsuleSpacing ?? 0.9;
    const radius = shape?.capsuleRadius ?? 1.25;
    const shipX = Math.sin(state.yaw);
    const shipZ = Math.cos(state.yaw);
    const before = previous ?? state;
    const offsets = this.offsets;
    offsets[0] = -spacing;
    offsets[1] = 0;
    offsets[2] = spacing;
    let strongest = 0;
    let impactNX = 0;
    let impactNZ = 0;
    for (const unit of this.units) {
      if (!unit.visible) continue;
      const fx = unit.forward.x;
      const fz = unit.forward.z;
      const rx = -fz;
      const rz = fx;
      const trainVX = (unit.position.x - unit.previous.x) / dt;
      const trainVZ = (unit.position.z - unit.previous.z) / dt;
      const reach = unit.halfLength + spacing + radius + Math.hypot(state.vx - trainVX, state.vz - trainVZ) * dt + 2;
      if ((state.x - unit.position.x) ** 2 + (state.z - unit.position.z) ** 2 > reach * reach) continue;
      for (const offset of offsets) {
        const dx = state.x + shipX * offset - unit.position.x;
        const dz = state.z + shipZ * offset - unit.position.z;
        const previousDX = before.x + shipX * offset - unit.previous.x;
        const previousDZ = before.z + shipZ * offset - unit.previous.z;
        const hit = this.sweep(
          previousDX * fx + previousDZ * fz,
          previousDX * rx + previousDZ * rz,
          dx * fx + dz * fz,
          dx * rx + dz * rz,
          unit.halfLength + radius,
          unit.halfWidth + radius,
        );
        if (!hit) continue;
        const shipY = before.y + (state.y - before.y) * hit.t;
        const minimumY = unit.previousMinY + (unit.worldBounds.min.y - unit.previousMinY) * hit.t;
        const maximumY = unit.previousMaxY + (unit.worldBounds.max.y - unit.previousMaxY) * hit.t;
        // Include the capsule hemispheres. A ship above the roof can jump over
        // the train; trackside elevation alone never triggers a collision.
        if (shipY + (shape?.capsuleBottom ?? 1.2) - radius > maximumY || shipY + (shape?.capsuleTop ?? 2.45) + radius < minimumY) continue;
        const nx = hit.nx * fx + hit.nz * rx;
        const nz = hit.nx * fz + hit.nz * rz;
        state.x += nx * (hit.depth + 0.02);
        state.z += nz * (hit.depth + 0.02);
        state.wallHit = true;
        const incoming = (state.vx - trainVX) * nx + (state.vz - trainVZ) * nz;
        if (incoming < 0) {
          const impulse = Math.min(85, -incoming * 1.08);
          state.vx += nx * impulse;
          state.vz += nz * impulse;
          state.throttle = Math.min(state.throttle, 8);
          if (-incoming > strongest) {
            strongest = -incoming;
            impactNX = nx;
            impactNZ = nz;
          }
        }
      }
    }
    if (strongest > 1.5) {
      state.impact = Math.min(14, strongest);
      state.impactSerial++;
      state.impactX = state.x - impactNX * radius;
      state.impactZ = state.z - impactNZ * radius;
    }
    state.speed = Math.hypot(state.vx, state.vz);
  }

  /** Sound sources for this frame. The returned object is reused. */
  audioState(listenerPosition: Vector3): TrainAudioState {
    const audible = this.audible;
    const candidate = this.candidate;
    let nearest = Infinity;
    let anyVisible = false;
    if (this.isActive) {
      for (const unit of this.units) {
        if (!unit.visible) continue;
        anyVisible = true;
        // One rolling source follows the closest portion of the long formation,
        // so the last wagons still clack when the locomotive is far away.
        const along = clamp(
          (listenerPosition.x - unit.position.x) * unit.forward.x + (listenerPosition.z - unit.position.z) * unit.forward.z,
          -unit.halfLength,
          unit.halfLength,
        );
        candidate.copy(unit.position).addScaledVector(unit.forward, along);
        candidate.y += 0.7;
        const distance = candidate.distanceToSquared(listenerPosition);
        if (distance < nearest) {
          nearest = distance;
          audible.rolling.copy(candidate);
        }
      }
    }
    audible.active = this.isActive && anyVisible;
    audible.passId = this.pass;
    audible.locomotiveVisible = this.locomotive.visible;
    return audible;
  }

  /** Shows every car and coupler (for shader warm-up); returns the restore function. */
  showAll(): () => void {
    for (const unit of this.units) unit.node.visible = true;
    this.couplings.visible = true;
    return () => {
      for (const unit of this.units) unit.node.visible = unit.visible;
      this.couplings.visible = this.isActive;
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.isActive = false;
    this.couplings.removeFromParent();
    this.couplings.dispose();
    this.couplingGeometry.dispose();
    this.couplingMaterial.dispose();
  }

  private sample(distance: number, target: Vector3): Vector3 {
    // Extrapolate outside either mouth so vehicles enter in formation; no
    // wrapping or bunching at clamped rail endpoints.
    const {path, pathLength} = this;
    let a = 0;
    let b = path.length - 1;
    if (distance <= 0) b = 1;
    else if (distance >= pathLength) a = b - 1;
    else {
      while (b - a > 1) {
        const middle = (a + b) >> 1;
        if (path[middle].distance_m <= distance) a = middle;
        else b = middle;
      }
    }
    const first = path[a];
    const second = path[b];
    const t = (distance - first.distance_m) / (second.distance_m - first.distance_m);
    return target.fromArray(first.position).lerp(this.delta.fromArray(second.position), t);
  }

  private placeUnits(): void {
    const {units, front, back, axisX, axisY, axisZ, basis, dummy, delta, pathLength} = this;
    for (const unit of units) {
      unit.previous.copy(unit.position);
      unit.previousMinY = unit.worldBounds.min.y;
      unit.previousMaxY = unit.worldBounds.max.y;
      unit.wasVisible = unit.visible;
      const travel = this.headTravel - unit.info.distance_from_locomotive_m;
      const distance = this.direction === 1 ? travel : pathLength - travel;
      const bogies = unit.info.bogie_centers_local_gltf;
      this.sample(distance + this.direction * bogies[0][0], front);
      this.sample(distance + this.direction * bogies[1][0], back);
      axisX.subVectors(front, back).normalize();
      axisZ.crossVectors(axisX, UP).normalize();
      axisY.crossVectors(axisZ, axisX).normalize();
      basis.makeBasis(axisX, axisY, axisZ);
      unit.node.quaternion.setFromRotationMatrix(basis);
      unit.node.position.addVectors(front, back).multiplyScalar(0.5);
      unit.node.position.y += this.railway.rail_top_offset_m ?? 0.13;
      // Per-vehicle visibility makes the formation emerge/leave progressively.
      // The tunnel hides the inner mouth; the other endpoint is off the map.
      unit.visible = this.isActive && travel + unit.halfLength >= 0 && travel - unit.halfLength <= pathLength;
      unit.node.visible = unit.visible;
      unit.node.updateMatrix();
      unit.front.fromArray(unit.info.coupler_local_gltf[0]).applyMatrix4(unit.node.matrix);
      unit.back.fromArray(unit.info.coupler_local_gltf[1]).applyMatrix4(unit.node.matrix);
    }
    this.root.updateMatrixWorld(true);
    for (const unit of units) {
      unit.position.setFromMatrixPosition(unit.node.matrixWorld);
      unit.forward.setFromMatrixColumn(unit.node.matrixWorld, 0);
      unit.forward.y = 0;
      unit.forward.normalize();
      unit.worldBounds.copy(unit.bounds).applyMatrix4(unit.node.matrixWorld);
      if (!unit.wasVisible) {
        unit.previous.copy(unit.position);
        unit.previousMinY = unit.worldBounds.min.y;
        unit.previousMaxY = unit.worldBounds.max.y;
      }
    }
    for (let i = 0; i < units.length - 1; i++) {
      const leading = units[i];
      const trailing = units[i + 1];
      dummy.position.addVectors(leading.back, trailing.front).multiplyScalar(0.5);
      delta.subVectors(trailing.front, leading.back);
      const length = delta.length();
      if (leading.visible && trailing.visible && length > 1e-5) {
        dummy.quaternion.setFromUnitVectors(UP, delta.multiplyScalar(1 / length));
        dummy.scale.set(TRAIN_SETTINGS.couplingThicknessM, length, TRAIN_SETTINGS.couplingThicknessM);
      } else {
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      this.couplings.setMatrixAt(i, dummy.matrix);
    }
    this.couplings.instanceMatrix.needsUpdate = true;
    this.couplings.visible = this.isActive;
  }

  private beginPass(): void {
    this.direction = this.nextDirection;
    this.nextDirection = -this.direction;
    this.isActive = true;
    this.passElapsed = 0;
    this.pass++;
    this.headTravel = -this.locomotive.halfLength - TRAIN_SETTINGS.endpointMarginM;
    this.interval =
      TRAIN_SETTINGS.minIntervalSeconds + Math.random() * (TRAIN_SETTINGS.maxIntervalSeconds - TRAIN_SETTINGS.minIntervalSeconds);
  }

  // Swept point against a rectangle expanded by the ship capsule radius. Work
  // in the moving car frame so neither a fast train nor a fast ship can pass
  // through a thin side between simulation ticks.
  private sweep(x0: number, z0: number, x1: number, z1: number, hx: number, hz: number): SweepHit | null {
    let entry = 0;
    let exit = 1;
    let nx = 0;
    let nz = 0;
    for (let axis = 0; axis < 2; axis++) {
      const start = axis === 0 ? x0 : z0;
      const end = axis === 0 ? x1 : z1;
      const extent = axis === 0 ? hx : hz;
      const velocity = end - start;
      if (Math.abs(velocity) < 1e-8) {
        if (Math.abs(start) > extent) return null;
        continue;
      }
      let near = (-extent - start) / velocity;
      let far = (extent - start) / velocity;
      let sign = -1;
      if (near > far) {
        [near, far] = [far, near];
        sign = 1;
      }
      if (near > entry) {
        entry = near;
        nx = axis === 0 ? sign : 0;
        nz = axis === 1 ? sign : 0;
      }
      exit = Math.min(exit, far);
      if (entry > exit) return null;
    }
    if (exit < 0 || entry > 1) return null;
    if (nx === 0 && nz === 0) {
      if (Math.abs(x1) > hx || Math.abs(z1) > hz) return null;
      if (hx - Math.abs(x1) < hz - Math.abs(z1)) nx = Math.sign(x1) || 1;
      else nz = Math.sign(z1) || 1;
    }
    const depth = nx !== 0 ? hx - nx * x1 : hz - nz * z1;
    if (depth <= 0) return null;
    const hit = this.hit;
    hit.nx = nx;
    hit.nz = nz;
    hit.depth = depth;
    hit.t = clamp(entry, 0, 1);
    return hit;
  }
}
