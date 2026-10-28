import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from 'three';
import type {Disposable} from '@/core/disposable';
import {spanRod, type PointSource} from './seating';

export interface SaddleAnchors {
  /** Palm contacts the handlebar extensions reach (root space); empty when the arms reach the grips. */
  hands: readonly PointSource[];
  /** Sole contacts for the raised footrests, right then left (root space). */
  soles: readonly PointSource[];
}

interface Extension {
  base: Vector3;
  rod: Mesh;
  end: Mesh;
  source: PointSource;
}

/**
 * The hoverbike's full-size handlebar and low pegs need extensions for the
 * smaller racers. All endpoints are measured in the vehicle's local frame.
 *
 * Feet rarely move once seated, so `update()` fits everything and
 * `updateHands()` only re-aims the handlebar extensions.
 */
export class SaddleSupports implements Disposable {
  private readonly metal = new MeshStandardMaterial({color: 0x625d50, metalness: 0.75, roughness: 0.5});
  private readonly rubber = new MeshStandardMaterial({color: 0x493425, roughness: 0.85});
  private readonly rodGeometry = new CylinderGeometry(0.018, 0.018, 1, 8);
  private readonly gripGeometry = new SphereGeometry(0.038, 10, 6);
  private readonly plateGeometry = new BoxGeometry(0.17, 0.035, 0.19);
  private readonly controls: Extension[];
  private readonly rests: Extension[];
  private readonly target = new Vector3();

  constructor(
    private readonly root: Object3D,
    {hands, soles}: SaddleAnchors,
  ) {
    this.controls = hands.map((source, i) => ({
      base: new Vector3((i === 0 ? -1 : 1) * 0.56, 1.67, 0.51),
      rod: this.mesh(this.rodGeometry, this.metal, 'Extensión del manillar'),
      end: this.mesh(this.gripGeometry, this.rubber, 'Agarre de la Nómada'),
      source,
    }));
    this.rests = [-1, 1].map((side, i) => ({
      base: new Vector3(side * 0.72, 0.3, 0.65),
      source: soles[i],
      rod: this.mesh(this.rodGeometry, this.metal, 'Soporte del estribo elevado'),
      end: this.mesh(this.plateGeometry, this.rubber, 'Estribo adaptado al piloto'),
    }));
  }

  /** Fits grips and footrests. */
  update(): void {
    this.updateHands();
    this.updateFeet();
  }

  updateHands(): void {
    const {target} = this;
    for (const control of this.controls) {
      control.source(target);
      control.end.position.copy(target);
      spanRod(control.rod, control.base, target);
    }
  }

  updateFeet(): void {
    const {target} = this;
    for (const rest of this.rests) {
      rest.source(target);
      target.y -= 0.0175;
      rest.end.position.copy(target);
      spanRod(rest.rod, rest.base, target);
    }
  }

  dispose(): void {
    for (const item of [...this.controls, ...this.rests]) {
      item.rod.removeFromParent();
      item.end.removeFromParent();
    }
    this.rodGeometry.dispose();
    this.gripGeometry.dispose();
    this.plateGeometry.dispose();
    this.metal.dispose();
    this.rubber.dispose();
  }

  private mesh(geometry: BufferGeometry, material: MeshStandardMaterial, name: string): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.system = 'cockpit';
    this.root.add(mesh);
    return mesh;
  }
}
