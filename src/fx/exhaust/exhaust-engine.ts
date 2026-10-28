import type {Object3D, PerspectiveCamera} from 'three';
import type {Disposable} from '@/core/disposable';
import type {VehicleDefinition} from '@/content/vehicles/vehicle-definition';
import type {HeatField} from '../heat/heat-field';
import type {ThrustState} from '../lomi/lomi-energy';
import type {LomiPlasma} from '../lomi/lomi-plasma';
import type {LensUniforms} from '../singularity/singularity-lens';

/** Throttle modes named by the game and the dials; any other mode reads as off. */
export type ExhaustMode = 'Turbo' | 'Aceleración' | 'Reposo' | 'Soltar';

/** Live counters the HUD and the dev tools read. */
export interface ExhaustStats {
  emitted: number;
  power: number;
  /** Spanish palette label shown in the tools. */
  palette: string;
  capacity: number;
  /** Per particle layer (fragments, embers, sparks). */
  particleLifetimes: number[];
  emittedByLayer: number[];
}

/** The post-processing pass an engine writes its screen-space effects into. */
export interface ExhaustPost {
  readonly heat: HeatField;
}

/** What an exhaust engine reads from the vehicle it is mounted on. */
export interface ExhaustShip {
  readonly root: Object3D;
  readonly definition: Pick<VehicleDefinition, 'engine'>;
  /** Singularity ships: thrust anchors the lenses project from. */
  readonly anchors?: readonly Object3D[];
  /** Singularity ships: the plasma the engine drives. */
  readonly plasma?: LomiPlasma | null;
}

export interface ExhaustEngineOptions {
  camera: PerspectiveCamera;
  /** Comic-pass lens uniforms; only the singularity engine uses them. */
  lens: LensUniforms | null;
}

/**
 * One exhaust/boost effect family. The flame boost and the singularity engine
 * implement it; the renderer drives whichever the vehicle's engine kind picks.
 */
export interface ExhaustEngine extends Disposable {
  readonly stats: ExhaustStats;
  /** Drops trails and particles (teleport, restart). */
  clear(): void;
  setQuality(lite: boolean): void;
  /**
   * @param mode an ExhaustMode; unknown modes read as off.
   * @param enabled false while effects are off (reduced motion, VFX toggle).
   * @param padBoost a boost pad, not manual nitro, is driving the turbo.
   */
  update(dt: number, mode: string, enabled: boolean, padBoost?: boolean, state?: ThrustState): Promise<void>;
  /** Writes screen-space effects (heat, lensing) after the camera moved. */
  updatePost(post: ExhaustPost): void;
}
