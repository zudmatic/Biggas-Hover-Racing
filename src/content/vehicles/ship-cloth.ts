import {DynamicDrawUsage, MathUtils, Matrix4, Vector3, type BufferAttribute, type BufferGeometry, type Mesh} from 'three';
import type {VehicleAssembly, VehicleComponent, VehicleFrame} from './vehicle-component';
import {ensureFloat32} from './vehicle-model';

const FRAME_RATE = 24;
const IDENTITY = new Matrix4();

export interface ShipClothOptions {
  /** Mesh-to-ship transform; identity when the geometry is already in vehicle space. */
  toShip?: Matrix4;
  /**
   * Shade every triangle flat, the flight look. An indexed geometry is expanded
   * once; the ripple is still evaluated per shared vertex and copied to each corner.
   */
  facetNormals?: boolean;
}

// Deform the actual cloth (including its frayed threads), so PBR, comic ink,
// silhouettes and shadows all see the same flag. The mast edge stays pinned.
export class ShipCloth implements VehicleComponent {
  /** One cloth per merged cloth mesh of the vehicle. */
  static attach({clothMeshes}: VehicleAssembly): ShipCloth[] {
    return clothMeshes.map((mesh) => new ShipCloth(mesh, {facetNormals: true}));
  }

  private readonly geometry: BufferGeometry;
  private readonly position: BufferAttribute;
  private readonly normal: BufferAttribute;
  /** Drawn vertices at rest, mesh space; restored under reduced motion. */
  private readonly restPositions: Float32Array;
  private readonly restNormals: Float32Array;
  /** Shared vertices at rest, ship space, and how freely each one moves. */
  private readonly shipPositions: Float32Array;
  private readonly weights: Float32Array;
  private readonly deformed: Float32Array;
  /** Drawn vertex → shared vertex, when the drawn geometry was expanded from an indexed one. */
  private readonly corners: ArrayLike<number> | null = null;
  private readonly fromShip: Matrix4 | null;
  private readonly point = new Vector3();
  private lastFrame = Number.NaN;
  private lastFlow = Number.NaN;
  private atRest = true;

  constructor(
    readonly mesh: Mesh,
    {toShip = IDENTITY, facetNormals = false}: ShipClothOptions = {},
  ) {
    let geometry = mesh.geometry;
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const shared = ensureFloat32(geometry, 'position');
    ensureFloat32(geometry, 'normal');
    if (!shared) throw new Error(`Tela sin posiciones: ${mesh.name}`);
    if (facetNormals && geometry.index) {
      this.corners = geometry.index.array;
      const expanded = geometry.toNonIndexed();
      geometry.dispose();
      mesh.geometry = geometry = expanded;
    }
    this.geometry = geometry;
    this.position = geometry.getAttribute('position') as BufferAttribute;
    this.normal = geometry.getAttribute('normal') as BufferAttribute;
    this.restPositions = Float32Array.from(this.position.array);
    this.restNormals = Float32Array.from(this.normal.array);

    const count = shared.count;
    this.shipPositions = new Float32Array(count * 3);
    this.weights = new Float32Array(count);
    this.deformed = new Float32Array(count * 3);
    const point = this.point;
    for (let i = 0; i < count; i++) {
      point.fromBufferAttribute(shared, i).applyMatrix4(toShip);
      point.toArray(this.shipPositions, i * 3);
      this.weights[i] = MathUtils.smoothstep(Math.abs(point.x), 0.025, 0.55);
    }
    this.fromShip = toShip.equals(IDENTITY) ? null : toShip.clone().invert();

    this.position.setUsage(DynamicDrawUsage);
    this.normal.setUsage(DynamicDrawUsage);
    geometry.computeBoundingBox();
    geometry.boundingBox?.expandByScalar(0.4);
    geometry.computeBoundingSphere();
    if (geometry.boundingSphere) geometry.boundingSphere.radius += 0.4;
    mesh.userData.cloth = true;
  }

  update({time, speed, boosting, reducedMotion}: Readonly<VehicleFrame>): void {
    this.animate(time, speed, boosting, reducedMotion);
  }

  /** Ripples the cloth at 24 fps; the wind grows with speed and boost. No-op while nothing changes. */
  animate(time = 0, speed = 0, boosting = false, reducedMotion = false): void {
    if (reducedMotion) {
      this.settle();
      return;
    }
    const frame = Math.floor(time * FRAME_RATE);
    const flow = MathUtils.clamp(speed / 52, 0, 1) + (boosting ? 0.45 : 0);
    if (frame === this.lastFrame && flow === this.lastFlow) return;
    this.lastFrame = frame;
    this.lastFlow = flow;
    this.atRest = false;
    this.deform(frame / FRAME_RATE, flow);
  }

  /** The geometry belongs to the mesh; its owner releases it. */
  dispose(): void {}

  private deform(t: number, flow: number): void {
    const {shipPositions, weights, deformed, point, fromShip} = this;
    const amplitude = 0.075 + flow * 0.12;
    const frequency = 3.5 + flow * 4;
    for (let i = 0; i < weights.length; i++) {
      const k = i * 3;
      const x = shipPositions[k];
      const y = shipPositions[k + 1];
      const z = shipPositions[k + 2];
      const weight = weights[i];
      const phase = t * frequency + z * 8 + y * 5;
      const ripple = Math.sin(phase) + 0.32 * Math.sin(phase * 1.9 - t * 2.1);
      point.set(
        x + weight * amplitude * ripple,
        y + weight * 0.025 * Math.sin(phase + 1.2),
        z - weight * (flow * 0.06 + 0.018 * Math.cos(phase)),
      );
      if (fromShip) point.applyMatrix4(fromShip);
      deformed[k] = point.x;
      deformed[k + 1] = point.y;
      deformed[k + 2] = point.z;
    }
    const drawn = this.position.array;
    const corners = this.corners;
    if (corners) {
      for (let corner = 0; corner < corners.length; corner++) {
        const from = corners[corner] * 3;
        const to = corner * 3;
        drawn[to] = deformed[from];
        drawn[to + 1] = deformed[from + 1];
        drawn[to + 2] = deformed[from + 2];
      }
    } else {
      drawn.set(deformed);
    }
    this.geometry.computeVertexNormals();
    this.position.needsUpdate = true;
  }

  private settle(): void {
    if (this.atRest) return;
    this.atRest = true;
    this.lastFrame = Number.NaN;
    this.position.array.set(this.restPositions);
    this.normal.array.set(this.restNormals);
    this.position.needsUpdate = true;
    this.normal.needsUpdate = true;
  }
}
