import {CylinderGeometry, Mesh, MeshStandardMaterial, SphereGeometry, Vector3, type Matrix4, type Object3D, type Quaternion} from 'three';
import type {Disposable} from '@/core/disposable';

const UP = new Vector3(0, 1, 0);
const span = new Vector3();

/** Produces a point in the pilot root's space. */
export type PointSource = (target: Vector3) => Vector3;

/**
 * `object`'s origin in `root` space, composed from the local transforms in
 * between. Unlike getWorldPosition + worldToLocal it never refreshes the
 * vehicle's or the scene's world matrices, so per-frame seat updates stay cheap.
 */
export function positionIn(root: Object3D, object: Object3D, target: Vector3): Vector3 {
  target.set(0, 0, 0);
  for (let node: Object3D | null = object; node && node !== root; node = node.parent) {
    node.updateMatrix();
    target.applyMatrix4(node.matrix);
  }
  return target;
}

/** `object`'s transform in `root` space (see positionIn). */
export function matrixIn(root: Object3D, object: Object3D, target: Matrix4): Matrix4 {
  target.identity();
  for (let node: Object3D | null = object; node && node !== root; node = node.parent) {
    node.updateMatrix();
    target.premultiply(node.matrix);
  }
  return target;
}

/** `object`'s rotation in `root` space: the product of the local rotations in between. */
export function rotationIn(root: Object3D, object: Object3D, target: Quaternion): Quaternion {
  target.identity();
  for (let node: Object3D | null = object; node && node !== root; node = node.parent) target.premultiply(node.quaternion);
  return target;
}

/** Stretches a unit-height cylinder from `base` to `end`. */
export function spanRod(rod: Object3D, base: Vector3, end: Vector3): void {
  span.copy(end).sub(base);
  rod.position.copy(base).add(end).multiplyScalar(0.5);
  rod.scale.y = span.length();
  rod.quaternion.setFromUnitVectors(UP, span.normalize());
}

export interface ControlExtensionOptions {
  /** Side sign of each extension, in creation order (+1 = pilot's left). */
  sides: readonly number[];
  rodName: string;
  gripName: string;
}

interface ControlLink {
  rod: Mesh<CylinderGeometry, MeshStandardMaterial>;
  handle: Mesh<SphereGeometry, MeshStandardMaterial>;
  base: Vector3;
}

/**
 * Cockpit controls for racers whose arms are shorter than the seat expects:
 * a steel rod from the console to each hand, ending in a grip. The racer
 * keeps its proportions; the controls come to meet the hands.
 */
export class ControlExtensions implements Disposable {
  readonly steel = new MeshStandardMaterial({color: 0x566165, roughness: 0.65});
  readonly grip = new MeshStandardMaterial({color: 0xb94b08, roughness: 0.8});
  private readonly rodGeometry = new CylinderGeometry(0.018, 0.018, 1, 6);
  private readonly gripGeometry = new SphereGeometry(0.038, 8, 6);
  private readonly links: ControlLink[];

  constructor(root: Object3D, {sides, rodName, gripName}: ControlExtensionOptions) {
    this.links = sides.map((side) => {
      const rod = new Mesh(this.rodGeometry, this.steel);
      const handle = new Mesh(this.gripGeometry, this.grip);
      rod.name = rodName;
      handle.name = gripName;
      root.add(rod, handle);
      return {rod, handle, base: new Vector3(side * 0.32, 1.15, 0.069)};
    });
  }

  /** Meets extension `index` with a hand at `point` (root space). */
  reach(index: number, point: Vector3): void {
    const {rod, handle, base} = this.links[index];
    handle.position.copy(point);
    spanRod(rod, base, point);
  }

  dispose(): void {
    for (const {rod, handle} of this.links) {
      rod.removeFromParent();
      handle.removeFromParent();
    }
    this.rodGeometry.dispose();
    this.gripGeometry.dispose();
    this.steel.dispose();
    this.grip.dispose();
  }
}
