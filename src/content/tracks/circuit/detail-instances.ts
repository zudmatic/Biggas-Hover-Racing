import {DynamicDrawUsage, InstancedMesh, Matrix4, Object3D} from 'three';
import type {BufferGeometry, Material} from 'three';

export interface DetailInstancesOptions {
  name?: string;
  /** Objects move after creation (re-read every update). */
  dynamic?: boolean;
}

// Rendering only: logical objects keep their own transforms and gameplay state.
// Opt in with identical geometry/material; never batch deforming or transparent meshes.
export class DetailInstances {
  readonly mesh: InstancedMesh;
  private readonly objects: Object3D[] = [];
  private readonly matrices: Matrix4[] = [];
  private readonly inverse = new Matrix4();
  private readonly matrix = new Matrix4();
  private readonly dynamic: boolean;
  private initialized = false;

  constructor(
    private readonly root: Object3D,
    geometry: BufferGeometry,
    material: Material,
    private readonly capacity: number,
    {name = 'Decoración agrupada', dynamic = false}: DetailInstancesOptions = {},
  ) {
    this.dynamic = dynamic;
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.name = name;
    this.mesh.count = 0;
    // Empty batches are skipped entirely, not drawn with zero instances.
    this.mesh.visible = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    if (dynamic) this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    root.add(this.mesh);
  }

  /** Adds a logical object whose world transform drives one instance. */
  add(parent: Object3D = this.root): Object3D {
    if (this.objects.length >= this.capacity) throw new Error(`Too many instances: ${this.mesh.name}`);
    const object = new Object3D();
    parent.add(object);
    this.objects.push(object);
    this.matrices.push(new Matrix4());
    this.mesh.count = this.objects.length;
    this.mesh.visible = true;
    this.initialized = false;
    return object;
  }

  update(): void {
    if (this.initialized && !this.dynamic) return;
    const {root, mesh, matrix, matrices} = this;
    root.updateWorldMatrix(true, false);
    this.inverse.copy(root.matrixWorld).invert();
    let changed = !this.initialized;
    this.objects.forEach((object, index) => {
      object.updateWorldMatrix(true, false);
      matrix.multiplyMatrices(this.inverse, object.matrixWorld);
      if (!this.initialized || !matrix.equals(matrices[index])) {
        mesh.setMatrixAt(index, matrix);
        matrices[index].copy(matrix);
        changed = true;
      }
    });
    if (changed) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
    this.initialized = true;
  }
}
