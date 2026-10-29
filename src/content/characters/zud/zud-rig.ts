import {DynamicDrawUsage, Group, MathUtils, Matrix4, Vector3, type BufferGeometry, type Mesh, type Object3D} from 'three';
import type {Disposable} from '@/core/disposable';
import {attributeOf, isMesh, positionsOf} from '../shared/object-guards';

/** A sub-range of a merged arm asset (armor plate, hose, hand…). */
interface ArmPart {
  name: string;
  start: number;
  count: number;
}

interface Binding {
  mesh: Mesh;
  joint: Object3D;
  rigidParts: boolean;
  /** Our deformable clone; null until prepared. */
  geometry: BufferGeometry | null;
  pivot: Vector3;
  weights: Float32Array;
  positions: Float32Array;
  normals: Float32Array;
  lastAngle: number;
}

function armParts(mesh: Mesh): ArmPart[] {
  const parts: unknown = mesh.userData.parts;
  return Array.isArray(parts) ? (parts as ArmPart[]) : [];
}

function findMesh(parent: Object3D, name: string): Mesh {
  const mesh = parent.getObjectByName(name);
  if (!mesh || !isMesh(mesh)) throw new Error(`Zud: falta la malla ${name}`);
  return mesh;
}

/**
 * Bend the authored, continuous shells in their rest frame. Keeping the
 * shoulder/hip band rigid preserves the buried joins and the original outline.
 * CPU deformation also serves raycasting, shadows and the comic depth pass.
 */
export class ZudRig implements Disposable {
  readonly elbows: Group[];
  readonly knees: Group[];
  readonly hands: Group[];
  private readonly bindings: Binding[] = [];
  private readonly owned = new Set<BufferGeometry>();
  private readonly supportMatrix = new Matrix4();
  private readonly legMatrix = new Matrix4();

  constructor(private readonly limbs: {arms: readonly Object3D[]; feet: readonly Object3D[]}) {
    const {arms, feet} = limbs;
    this.elbows = arms.map((arm, i) => joint(arm, 'Codo', new Vector3(i ? 0.12 : -0.12, -0.27, 0)));
    this.knees = feet.map((hip, i) => joint(hip, 'Rodilla', new Vector3(i ? 0.08 : -0.08, -0.27, 0.015)));
    this.hands = this.elbows.map((elbow, i) => joint(elbow, 'Agarre', new Vector3(i ? 0.16 : -0.16, -0.51, 0.13).sub(elbow.position)));
    arms.forEach((arm, i) => this.bind(findMesh(arm, 'Brazo'), this.elbows[i]));
    feet.forEach((hip, i) => this.bind(findMesh(hip, 'Pierna'), this.knees[i]));
  }

  /** Re-bends every shell whose joint angle changed. */
  update(): void {
    for (const binding of this.bindings) {
      if (binding.mesh.geometry !== binding.geometry) this.prepare(binding);
      const {geometry, joint, pivot, weights, positions, normals} = binding,
        angle = joint.rotation.x;
      if (angle === binding.lastAngle || !geometry) continue;
      const position = geometry.attributes.position,
        normal = geometry.attributes.normal;
      const p = position.array,
        n = normal.array;
      for (let i = 0; i < weights.length; i++) {
        const offset = i * 3,
          a = angle * weights[i],
          c = Math.cos(a),
          s = Math.sin(a);
        const y = positions[offset + 1] - pivot.y,
          z = positions[offset + 2] - pivot.z;
        p[offset] = positions[offset];
        p[offset + 1] = pivot.y + y * c - z * s;
        p[offset + 2] = pivot.z + y * s + z * c;
        n[offset] = normals[offset];
        n[offset + 1] = normals[offset + 1] * c - normals[offset + 2] * s;
        n[offset + 2] = normals[offset + 1] * s + normals[offset + 2] * c;
      }
      position.needsUpdate = true;
      normal.needsUpdate = true;
      geometry.boundingBox = null;
      binding.lastAngle = angle;
    }
  }

  /**
   * Solve in the character parent's space, before room scale, heading or
   * airborne movement. The lowest sole stays supported through hip roll.
   */
  floorHeight(root: Object3D): number {
    const {supportMatrix, legMatrix} = this;
    root.updateMatrix();
    let lowest = Infinity;
    for (const hip of this.limbs.feet) {
      const mesh = findMesh(hip, 'Pierna');
      hip.updateMatrix();
      mesh.updateMatrix();
      legMatrix.multiplyMatrices(hip.matrix, mesh.matrix);
      supportMatrix.multiplyMatrices(root.matrix, legMatrix);
      const e = supportMatrix.elements,
        p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) lowest = Math.min(lowest, e[1] * p.getX(i) + e[5] * p.getY(i) + e[9] * p.getZ(i) + e[13]);
    }
    return lowest;
  }

  /** Binds an arm accessory's meshes to an elbow; returns the release function. */
  bindArmAsset(index: number, asset: Object3D): () => void {
    const releases = asset.children.filter(isMesh).map((mesh) => this.bind(mesh, this.elbows[index], {rigidParts: true}));
    const hand = this.hands[index];
    hand.position.set(index ? 0.25 : -0.25, -0.69, 0).sub(this.elbows[index].position);
    return () => {
      releases.forEach((release) => release());
      hand.position.copy(restPosition(hand));
    };
  }

  reset(): void {
    for (const joint of [...this.elbows, ...this.knees]) joint.rotation.set(0, 0, 0);
    this.update();
  }

  dispose(): void {
    this.owned.forEach((geometry) => geometry.dispose());
    this.owned.clear();
    this.bindings.length = 0;
  }

  private bind(mesh: Mesh, joint: Object3D, {rigidParts = false}: {rigidParts?: boolean} = {}): () => void {
    const binding: Binding = {
      mesh,
      joint,
      rigidParts,
      geometry: null,
      pivot: new Vector3(),
      weights: new Float32Array(0),
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      lastAngle: NaN,
    };
    this.bindings.push(binding);
    return () => {
      const index = this.bindings.indexOf(binding);
      if (index !== -1) this.bindings.splice(index, 1);
      if (binding.geometry) {
        this.owned.delete(binding.geometry);
        binding.geometry.dispose();
      }
    };
  }

  private prepare(binding: Binding): void {
    const {mesh, joint, rigidParts} = binding;
    if (binding.geometry) {
      this.owned.delete(binding.geometry);
      binding.geometry.dispose();
    }
    // Variants may share geometry; never deform another character or the cache.
    const geometry = mesh.geometry.clone();
    mesh.geometry = geometry;
    this.owned.add(geometry);
    const position = positionsOf(geometry);
    const normal = attributeOf(geometry, 'normal');
    position.setUsage(DynamicDrawUsage);
    normal.setUsage(DynamicDrawUsage);
    const weights = new Float32Array(position.count);
    // Alternate arms are authored +X outward and mirrored by their parent.
    const pivot = joint.position.clone();
    if (rigidParts) pivot.x = Math.abs(pivot.x);
    else pivot.sub(mesh.position);
    const weight = (y: number): number => 1 - MathUtils.smoothstep(y, pivot.y - 0.1, pivot.y + 0.12);
    for (let i = 0; i < weights.length; i++) weights[i] = weight(position.getY(i));
    if (rigidParts) {
      for (const part of armParts(mesh)) {
        // Armor and hands remain rigid. Flexible hoses span the bending zone.
        if (/Conducto flexible/.test(part.name)) continue;
        let y = 0;
        for (let i = part.start; i < part.start + part.count; i++) y += position.getY(i);
        const w = y / part.count < pivot.y - 0.035 ? 1 : 0;
        weights.fill(w, part.start, part.start + part.count);
      }
    }
    geometry.computeBoundingSphere();
    // Conservative bounds contain the complete bend without scanning every
    // vertex again each frame. Positions themselves stay exact for raycasts.
    geometry.boundingSphere!.radius += 0.8;
    geometry.boundingBox = null;
    binding.geometry = geometry;
    binding.pivot = pivot;
    binding.weights = weights;
    binding.positions = Float32Array.from(position.array);
    binding.normals = Float32Array.from(normal.array);
    binding.lastAngle = NaN;
  }
}

function joint(parent: Object3D, name: string, position: Vector3): Group {
  const node = new Group();
  node.name = name;
  node.position.copy(position);
  node.userData.restPosition = position.clone();
  parent.add(node);
  return node;
}

function restPosition(object: Object3D): Vector3 {
  const rest: unknown = object.userData.restPosition;
  if (!(rest as Partial<Vector3> | undefined)?.isVector3) throw new Error(`Zud: ${object.name} no tiene posición de reposo`);
  return rest as Vector3;
}
