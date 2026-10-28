import {Vector2, type Object3D, type PerspectiveCamera} from 'three';
import type {Renderer, Scene} from 'three/webgpu';
import type {ExhaustEngine, ExhaustEngineOptions, ExhaustPost, ExhaustShip, ExhaustStats} from '../exhaust/exhaust-engine';
import {EnergySignals, IDLE_STATE, loadEnergyTextures, type ThrustState} from '../lomi/lomi-energy';
import type {LomiPlasma} from '../lomi/lomi-plasma';
import {SingularityLenses, type LensUniforms} from './singularity-lens';

/** A singularity ship: its root, the thrust anchors the holes sit on, and the plasma it owns. */
export interface SingularityShip {
  readonly root: Object3D;
  readonly anchors: readonly Object3D[];
  readonly plasma: LomiPlasma;
}

// Same contract as the flame boost; the ship owns the plasma, this drives it and the lenses.
export class SingularityEngine implements ExhaustEngine {
  readonly stats: ExhaustStats = {
    power: 0,
    palette: 'Azul',
    emitted: 0,
    capacity: 0,
    particleLifetimes: [0, 0, 0],
    emittedByLayer: [0, 0, 0],
  };
  private readonly signals = new EnergySignals();
  private readonly lenses: SingularityLenses;
  private readonly size = new Vector2();

  /** Loads the shared energy textures into the lens, then takes over the ship's plasma. */
  static async create(
    renderer: Renderer,
    ship: SingularityShip,
    camera: PerspectiveCamera,
    lens: LensUniforms,
  ): Promise<SingularityEngine> {
    lens.setTextures(await loadEnergyTextures());
    return new SingularityEngine(renderer, ship, camera, lens);
  }

  private constructor(
    private readonly renderer: Renderer,
    private readonly ship: SingularityShip,
    private readonly camera: PerspectiveCamera,
    private readonly lens: LensUniforms,
  ) {
    this.lenses = new SingularityLenses(ship.anchors, this.signals, lens);
    ship.plasma.driven = true;
  }

  clear(): void {
    this.signals.reset();
  }

  setQuality(): void {}

  async update(dt: number, _mode: string, enabled: boolean, _padBoost = false, state: ThrustState = IDLE_STATE): Promise<void> {
    const {ship, signals, stats} = this;
    const step = enabled ? dt : 0;
    ship.root.updateMatrixWorld(true);
    signals.step(ship.root, state, step);
    ship.plasma.update(signals, step);
    stats.power = signals.level;
    stats.palette = ship.plasma.uniforms.burst.value > 0.5 ? 'Ráfaga' : 'Azul';
  }

  updatePost(post: ExhaustPost): void {
    // Keep the heat field's screen metrics current for boost pads; the ship adds no heat of its own.
    post.heat.update(this.ship.root, this.signals.time * 3, 0, 0, 0.9, 8, 1.2);
    this.renderer.getDrawingBufferSize(this.size);
    this.lenses.sync(this.lenses.project(this.camera, this.size.x / Math.max(this.size.y, 1)));
  }

  dispose(): void {
    this.ship.plasma.driven = false;
    this.lens.active.value = 0;
  }
}

/** Narrows a generic exhaust ship; singularity ships must carry their anchors and plasma. */
export function asSingularityShip(ship: ExhaustShip): SingularityShip {
  const {root, anchors, plasma} = ship;
  if (!anchors || !plasma) throw new Error('El motor de singularidad necesita los anclajes y el plasma de la nave.');
  return {root, anchors, plasma};
}
