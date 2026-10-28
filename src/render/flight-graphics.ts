import type {Object3D, PerspectiveCamera, Scene} from 'three';
import type {WebGPURenderer} from 'three/webgpu';
import {attribute} from 'three/tsl';
import type {Disposable} from '@/core/disposable';
import type {GamePhase} from '@/core/types';
import type {EngineKind, ExhaustMount} from '@/content/vehicles/vehicle-definition';
import {DesertLook} from '@/content/tracks/desert-valley/desert-look';
import {createSmokeMaterial} from '@/fx/drift/smoke-material';
import {createExhaustEngine, exhaustEngines} from '@/fx/exhaust/engines';
import type {ExhaustEngine, ExhaustEngineOptions, ExhaustShip} from '@/fx/exhaust/exhaust-engine';
import {FlameMaterial, type FlameLookSettings} from '@/fx/exhaust/flame-material';
import {FlameTrail, type FlameTrailSettings} from '@/fx/exhaust/flame-trail';
import type {PadHeatField} from '@/fx/heat/heat-field';
import type {ThrustState} from '@/fx/lomi/lomi-energy';
import {createOilMaterial} from '@/fx/oil/oil-material';
import {LensUniforms} from '@/fx/singularity/singularity-lens';
import {GameRenderer} from './game-renderer';
import {BaseMaterials} from './materials/base-materials';
import {ComicMaterials, createComicStyle, type ComicStyle} from './materials/comic-materials';
import {createPipeline} from './post/pipelines';
import type {LookId, PipelineQuality, RenderPipeline} from './post/render-pipeline';
import {preventShadowVersionChurn} from './three-fixes';

export {createSmokeMaterial};

/** The player's vehicle as the graphics read it: an exhaust ship with an engine kind. */
export type FlightVehicle = ExhaustShip;

/** The oil gameplay's bot, whose flame the graphics draw. */
export interface BotFlameSource {
  readonly sim: {readonly time: number};
  readonly botShip: ExhaustShip;
}

export interface BoostPadHeat {
  readonly heatFields?: readonly PadHeatField[];
}

export interface FlightGraphicsOptions {
  /** Desert Valley: the natural (non-comic) look uses the PS2 desert pipeline. */
  naturalDesert?: boolean;
  boostPads?: BoostPadHeat | null;
}

/** The vehicle state a frame is drawn from. */
export type FlightFrameState = ThrustState & {padBoostRemaining?: number};

export interface FlightFrame {
  dt?: number;
  state: FlightFrameState;
  phase: GamePhase;
  /** Comic print (true) or the track's natural look. */
  comic?: boolean;
  /** Reduced motion: effects off. */
  reduced?: boolean;
}

/** Quality input: the controller's settings (or the perf review's measurement override). */
export interface FlightQuality {
  samples: number | boolean;
  lite?: boolean;
}

/** Post-processing knobs currently applied, read into the HUD's data attributes. */
export interface FlightGraphicsStats {
  glowSamples: number;
  samples: number;
}

/** Fixed look of the oil bot's flame. */
const BOT_FLAME: FlameLookSettings & FlameTrailSettings = {
  Activa: true,
  Longitud: 2.7,
  Ancho: 0.7,
  Pulsación: 0.02,
  Turbulencia: 1.3,
  Trama: 'Dither',
};
const NO_PADS: readonly PadHeatField[] = [];

interface FlightGraphicsParts {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  vehicle: FlightVehicle;
  oil: BotFlameSource;
  boostPads: BoostPadHeat | null;
  naturalDesert: boolean;
  baseline: BaseMaterials;
  look: DesertLook | null;
  lens: LensUniforms | null;
  engine: ExhaustEngine;
}

/**
 * Per-frame render orchestration of a race: material looks (comic print or
 * the natural desert), the post pipeline of the active look, the player's
 * exhaust engine and the oil bot's flame. Rendering adapter only: the
 * simulator owns physics, race timing, cameras and the scene's matrices.
 */
export class FlightGraphics implements Disposable {
  /** Creates the graphics of a loaded race; the engine kind of the vehicle picks its exhaust. */
  static async create(
    renderer: WebGPURenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    vehicle: FlightVehicle,
    oil: BotFlameSource,
    {naturalDesert = false, boostPads = null}: FlightGraphicsOptions = {},
  ): Promise<FlightGraphics> {
    preventShadowVersionChurn(scene);
    // Order matters: the desert look binds the scene's materials after the
    // baseline swap and before the exhaust adds its own meshes.
    const baseline = new BaseMaterials(scene);
    const look = naturalDesert ? new DesertLook(scene, renderer) : null;
    const family = exhaustEngines.resolve(vehicle.definition.engine.kind);
    const lens = family.needsLens ? new LensUniforms() : null;
    let engine: ExhaustEngine;
    try {
      engine = await family.create(renderer, scene, vehicle, {camera, lens});
    } catch (error) {
      look?.dispose();
      baseline.dispose();
      throw error;
    }
    return new FlightGraphics({renderer, scene, camera, vehicle, oil, boostPads, naturalDesert, baseline, look, lens, engine});
  }

  readonly stats: FlightGraphicsStats = {glowSamples: 12, samples: 4};
  /** The PS2 desert look (Desert Valley only). */
  readonly look: DesertLook | null;
  readonly engine: ExhaustEngine;

  private readonly renderer: WebGPURenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly vehicle: FlightVehicle;
  private readonly oil: BotFlameSource;
  private readonly boostPads: BoostPadHeat | null;
  private readonly naturalDesert: boolean;
  private readonly baseline: BaseMaterials;
  private readonly lens: LensUniforms | null;
  private readonly style: ComicStyle = createComicStyle();
  private readonly pipelines = new Map<LookId, RenderPipeline>();
  private readonly botFlame = new FlameMaterial();
  private readonly botTrail: FlameTrail;
  private readonly botTrailSettings: FlameTrailSettings = {...BOT_FLAME};
  private materials: ComicMaterials | null = null;
  private lastComic: boolean | null = null;
  private quality: PipelineQuality = {samples: 4, glowSamples: 12};
  private postOn = true;

  private constructor(parts: FlightGraphicsParts) {
    this.renderer = parts.renderer;
    this.scene = parts.scene;
    this.camera = parts.camera;
    this.vehicle = parts.vehicle;
    this.oil = parts.oil;
    this.boostPads = parts.boostPads;
    this.naturalDesert = parts.naturalDesert;
    this.baseline = parts.baseline;
    this.look = parts.look;
    this.lens = parts.lens;
    this.engine = parts.engine;
    this.botTrail = new FlameTrail(parts.scene, this.botFlame.material, parts.oil.botShip.definition.engine.exhausts);
  }

  get postEnabled(): boolean {
    return this.postOn;
  }

  /** Development only: render the scene without post-processing. */
  setPostEnabled(value: boolean): void {
    if (import.meta.env.DEV) this.postOn = !!value;
  }

  setQuality(settings: FlightQuality): void {
    const lite = !!settings.lite;
    this.quality = {samples: settings.samples ? 4 : 0, glowSamples: lite ? 4 : 12};
    this.engine.setQuality(lite);
    this.stats.glowSamples = this.quality.glowSamples;
    this.stats.samples = this.quality.samples;
  }

  /** Drops exhaust trails and particles (restart, teleport). */
  reset(): void {
    this.engine.clear();
    this.botTrail.clear();
  }

  /**
   * Draws one frame. The game loop updates the scene's matrices right before;
   * this only refreshes what it moves itself. Resolves once the exhaust's
   * particle step is queued (the post render itself is synchronous).
   */
  async render({dt = 0, state, phase, comic = true, reduced = false}: FlightFrame): Promise<void> {
    const {renderer, scene, camera, look, style, oil} = this;
    // The initial binding is explicit; it doesn't depend on a UI event.
    if (comic) look?.update({enabled: false});
    if (comic && !this.materials) this.materials = new ComicMaterials(scene, style);
    if (this.lastComic !== comic) {
      this.materials?.setEnabled(comic);
      this.lastComic = comic;
    }
    this.materials?.sync();
    style.pixelRatio.value = renderer.getPixelRatio();
    renderer.getDrawingBufferSize(style.resolution.value);
    if (!comic) look?.update();

    const running = phase === 'flying' || phase === 'countdown' || phase === 'intro';
    const mode = state.boosting ? 'Turbo' : state.speed > 1 ? 'Aceleración' : 'Reposo';
    await this.engine.update(running ? dt : 0, mode, !reduced, state.boosting && (state.padBoostRemaining ?? 0) > 0, state);
    // The engine resizes the ship's nozzle inserts: refresh that subtree only.
    this.vehicle.root.updateMatrixWorld(true);

    const bot = oil.botShip.root;
    this.botFlame.update(oil.sim.time, BOT_FLAME, false);
    this.botTrail.record(oil.sim.time, bot);
    this.botTrailSettings.Activa = bot.visible && bot.parent?.visible === true && !reduced;
    this.botTrail.draw(oil.sim.time, this.botTrailSettings, 0.45);

    const pipeline = this.pipelineFor(comic);
    camera.updateMatrixWorld();
    this.engine.updatePost(pipeline);
    pipeline.comic.value = Number(comic);
    pipeline.heat.updatePadFields(reduced ? NO_PADS : (this.boostPads?.heatFields ?? NO_PADS));
    if (this.postOn) pipeline.render();
    else renderer.render(scene, camera);
  }

  dispose(): void {
    this.botTrail.dispose();
    this.botFlame.dispose();
    this.engine.dispose();
    this.materials?.dispose();
    this.look?.dispose();
    for (const pipeline of this.pipelines.values()) pipeline.dispose();
    this.pipelines.clear();
    this.baseline.dispose();
  }

  /** The pipeline of this frame's look at the current quality (compiled once per look and quality). */
  private pipelineFor(comic: boolean): RenderPipeline {
    const lookId: LookId = this.naturalDesert && !comic ? 'natural' : 'comic';
    let pipeline = this.pipelines.get(lookId);
    if (!pipeline) {
      const {renderer, scene, camera, lens} = this;
      pipeline = createPipeline(lookId, {renderer, scene, camera, lens, warmth: this.look?.warmth}, this.quality);
      this.pipelines.set(lookId, pipeline);
    }
    pipeline.setQuality(this.quality);
    this.stats.glowSamples = lookId === 'natural' ? 0 : this.quality.glowSamples;
    return pipeline;
  }
}
