import {Group, Mesh, PlaneGeometry, type Material, type Object3D} from 'three';
import type {ExhaustMount} from '@/content/vehicles/vehicle-definition';
import type {Effect, FxFrame} from '../effect';
import {FlameMaterial, type FlameLookSettings} from './flame-material';

export interface LocalJet {
  readonly group: Group;
  readonly radius: number;
}

/** Vehicle state the idle flame reacts to. */
export interface LocalExhaustState {
  braking?: boolean;
}

// Lightweight local flame for model viewers. Racing uses the world-space
// history and particle system in boost.ts instead.
export class LocalExhaust implements Effect {
  readonly jets: LocalJet[];
  readonly flame = new FlameMaterial();
  private readonly geometry = new PlaneGeometry(1, 1, 1, 16);
  private readonly look: FlameLookSettings = {Turbulencia: 1.3, Trama: 'Dither', 'Densidad llama': 0.82};
  private lastTime = 0;
  private power = 0.45;
  private clock = 0;

  constructor(root: Object3D, nozzles: readonly ExhaustMount[]) {
    this.geometry.translate(0, 0.5, 0);
    this.geometry.rotateX(-Math.PI / 2);
    this.jets = nozzles.map(([x, y, z, radius]) => {
      const group = new Group();
      group.position.set(x, y, z);
      root.add(group);
      for (let i = 0; i < 3; i++) {
        const mesh = new Mesh(this.geometry, this.flame.material);
        mesh.rotation.z = (i * Math.PI) / 3;
        group.add(mesh);
      }
      return {group, radius};
    });
  }

  get material(): Material {
    return this.flame.material;
  }

  /** Viewer clock in seconds; `time` 0 snaps the flame to its target length. */
  animate(time: number, speed: number, boost: boolean, reduced: boolean, state?: LocalExhaustState | null): void {
    const dt = Math.max(0, Math.min(0.1, time - this.lastTime));
    this.lastTime = time;
    const target = state?.braking ? 0.2 : boost ? 3.5 : 0.45 + Math.min(speed, 55) * 0.024;
    this.power = time === 0 ? target : this.power + (target - this.power) * (1 - Math.exp(-dt * 14));
    this.look.Turbulencia = reduced ? 0 : 1.3;
    this.flame.update(reduced ? 0 : time, this.look, boost);
    for (const {group, radius} of this.jets) group.scale.set(radius * 2, radius * 2, this.power);
  }

  /** Effect step: keeps its own clock and reads speed, boost and braking from the frame state. */
  update(dt: number, frame: FxFrame): void {
    this.clock += dt;
    const state = frame.state;
    this.animate(this.clock, state?.speed ?? 0, state?.boosting ?? false, frame.reduced ?? false, state);
  }

  reset(): void {
    this.clock = 0;
    this.lastTime = 0;
    this.power = 0.45;
  }

  dispose(): void {
    for (const {group} of this.jets) group.removeFromParent();
    this.geometry.dispose();
    this.flame.dispose();
  }
}

/** The pre-class surface used by the vehicle viewers. */
export interface LocalExhaustHandle {
  readonly jets: LocalJet[];
  readonly material: Material;
  update(time: number, speed: number, boost: boolean, reduced: boolean, state?: LocalExhaustState | null): void;
  dispose(): void;
}
