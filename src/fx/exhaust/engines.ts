import type {Scene, WebGPURenderer} from 'three/webgpu';
import {Registry} from '@/core/registry';
import type {EngineKind} from '@/content/vehicles/vehicle-definition';
import {SingularityEngine, asSingularityShip} from '../singularity/singularity-engine';
import {Boost} from './boost';
import type {ExhaustEngine, ExhaustEngineOptions, ExhaustShip} from './exhaust-engine';

/** An exhaust effect family a vehicle picks by `engine.kind`. */
export interface ExhaustEngineFamily {
  readonly id: EngineKind;
  /** The post pass must compile the singularity lens warp (pass LensUniforms in the options). */
  readonly needsLens: boolean;
  create(renderer: WebGPURenderer, scene: Scene, ship: ExhaustShip, options: ExhaustEngineOptions): Promise<ExhaustEngine>;
}

/** Engine families by kind; unknown or missing kinds fall back to the flame. */
export const exhaustEngines = new Registry<ExhaustEngineFamily>('Motor', 'flame');

exhaustEngines.register({
  id: 'flame',
  needsLens: false,
  create: (renderer, scene, ship) => Boost.create(renderer, scene, ship.root, ship.definition.engine.exhausts),
});

exhaustEngines.register({
  id: 'singularity',
  needsLens: true,
  create: (renderer, _scene, ship, {camera, lens}) => {
    if (!lens) throw new Error('El motor de singularidad necesita las lentes del pase cómic.');
    return SingularityEngine.create(renderer, asSingularityShip(ship), camera, lens);
  },
});

/** Builds the exhaust engine of a vehicle's engine kind. */
export function createExhaustEngine(
  kind: EngineKind | null | undefined,
  renderer: WebGPURenderer,
  scene: Scene,
  ship: ExhaustShip,
  options: ExhaustEngineOptions,
): Promise<ExhaustEngine> {
  return exhaustEngines.resolve(kind).create(renderer, scene, ship, options);
}
