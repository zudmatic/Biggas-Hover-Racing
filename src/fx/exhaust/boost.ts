import {CapsuleGeometry, Color, Vector3, type Node, type Object3D, type Scene, type UniformNode, type WebGPURenderer} from 'three/webgpu';
import {float, mix, smoothstep, step, uniform, uv, vec4} from 'three/tsl';
import type {ExhaustMount} from '@/content/vehicles/vehicle-definition';
import {createDialKit, type DialConfig, type DialKitController, type ResolvedValues} from '@/core/debug/dials';
import {EngineCore, type EngineCoreSettings} from './engine-core';
import type {ExhaustEngine, ExhaustPost, ExhaustShip, ExhaustStats} from './exhaust-engine';
import {FlameMaterial} from './flame-material';
import {FlameTrail, type FlameTrailSettings} from './flame-trail';
import {combineMouths, measureNozzleMouths, type NozzleMouth} from './nozzle-mouth';
import {Appearance, Blending, VFXParticles} from '../particles/vfx-particles';
import {PadBoostPalette, smoothBoostPower} from './pad-boost-palette';

const DIALS = {
  Llama: true,
  Motor: true,
  'Densidad llama': [1, 0.1, 1, 0.01],
  Longitud: [4.6, 0.2, 9, 0.1],
  Ancho: [1.22, 0.1, 3, 0.02],
  Turbulencia: [0.4, 0, 6, 0.1],
  'Fade base': [0.25, 0, 0.5, 0.01],
  'Separación boca': [0, -0.3, 0.5, 0.01],
  'Llama mínima': [0.7, 0, 2, 0.05],
  'Retraso curva': [0.12, 0, 0.4, 0.01],
  'Curva máxima': [14, 0, 35, 1],
  Trama: {type: 'select', options: ['Apagado', 'Damero', 'Dither'], default: 'Dither'},
  'Intensidad trama': [0.6, 0, 1, 0.05],
  'Tamaño trama': [2, 1, 8, 1],
  'Estela partículas': [8, 0.5, 8, 0.1],
  'Seguir nave': [1, 0, 1, 0.05],
  Fragmentos: true,
  'Cantidad fragmentos': [600, 0, 600, 5],
  'Tamaño fragmentos': [0.6, 0.05, 1.2, 0.01],
  'Duración fragmentos': [0.5, 0.09, 1, 0.01],
  'Opacidad fragmentos': [0.13, 0, 1, 0.01],
  Brasas: true,
  'Cantidad brasas': [71, 0, 300, 1],
  'Tamaño brasas': [0.1, 0.03, 0.4, 0.01],
  'Duración brasas': [0.65, 0.09, 1, 0.01],
  'Chispas lineales': true,
  'Cantidad chispas': [22, 0, 150, 1],
  'Tamaño chispas': [0.55, 0.1, 1.5, 0.05],
  'Duración chispas': [0.4, 0.09, 1, 0.01],
  Calor: true,
  'Intensidad calor': [2, 0, 2, 0.05],
} satisfies DialConfig;

type BoostDials = ResolvedValues<typeof DIALS>;

/** Target power per throttle mode. */
const MODE_POWER: Partial<Record<string, number>> = {Turbo: 1, Aceleración: 0.45, Reposo: 0.13, Soltar: 0};
/** Per particle layer: fragments, embers, linear sparks. */
const LAYER_SPEED = [7.5, 12, 14];
const LAYER_SPREAD = [0.33, 0.64, 0.22];

/** Reused spawn overrides; the particle system reads them synchronously inside spawn(). */
interface SpawnOverrides {
  lifetime: [number, number];
  direction: [[number, number], [number, number], [number, number]];
  speed: [number, number];
  [key: string]: unknown;
}

interface ParticleLayers {
  readonly systems: readonly [VFXParticles, VFXParticles, VFXParticles];
  readonly lineGeometry: CapsuleGeometry;
  readonly opacity: UniformNode<number>;
  readonly color: UniformNode<Color>;
  readonly hot: UniformNode<Color>;
  readonly emberTint: UniformNode<Color>;
  readonly lineTint: UniformNode<Color>;
}

function createParticleLayers(renderer: WebGPURenderer, flame: FlameMaterial): ParticleLayers {
  const emberTint = uniform(new Color('#ff861f'));
  const lineTint = uniform(new Color('#ffd18a'));
  const color = uniform(new Color('#ff6b16'));
  const hot = uniform(new Color('#fff1bc'));
  const opacity = uniform(0.13);
  const round = float(1).sub(smoothstep(0.72, 1, uv().mul(2).sub(1).length()));
  const fragments = new VFXParticles(renderer, {
    autoStart: false,
    maxParticles: 1800,
    size: [0.36, 0.6],
    lifetime: [0.25, 0.5],
    speed: [6, 9],
    fadeSize: [1, 0],
    fadeOpacity: [1, 0],
    appearance: Appearance.DEFAULT,
    blending: Blending.NORMAL,
    gravity: [0, 0.8, 0],
    friction: {intensity: 0.12},
    turbulence: {intensity: 8, frequency: 2.3, speed: 2.5},
    alphaTestNode: float(0.01),
    opacityNode: () => opacity.mul(round),
    colorNode: ({progress}: {progress: Node}, base: Node) => vec4(mix(hot, color, step(0.25, progress)), flame.ditherAlpha(base.a)),
  });
  const embers = new VFXParticles(renderer, {
    autoStart: false,
    maxParticles: 400,
    size: [0.04, 0.1],
    lifetime: [0.26, 0.65],
    speed: [9, 15],
    gravity: [0, -0.3, 0],
    fadeSize: [1, 0],
    fadeOpacity: [1, 0],
    appearance: Appearance.GRADIENT,
    blending: Blending.ADDITIVE,
    turbulence: {intensity: 8, frequency: 2, speed: 1},
    stretchBySpeed: {factor: 0.15, maxStretch: 4},
    colorNode: (_data: unknown, base: Node) => vec4(emberTint, flame.ditherAlpha(base.a)),
  });
  const lineGeometry = new CapsuleGeometry(0.025, 0.4, 2, 6);
  const lines = new VFXParticles(renderer, {
    autoStart: false,
    maxParticles: 200,
    geometry: lineGeometry,
    orientToDirection: true,
    orientAxis: 'y',
    size: [0.3, 0.55],
    lifetime: [0.2, 0.4],
    speed: [10, 18],
    gravity: [0, 0.1, 0],
    fadeSize: [1, 0],
    fadeOpacity: [1, 0],
    blending: Blending.ADDITIVE,
    turbulence: {intensity: 2, frequency: 2, speed: 1},
    stretchBySpeed: {factor: 0.15, maxStretch: 6},
    opacityNode: () => float(0.8),
    colorNode: (_data: unknown, base: Node) => vec4(lineTint, flame.ditherAlpha(base.a)),
  });
  return {systems: [fragments, embers, lines], lineGeometry, opacity, color, hot, emberTint, lineTint};
}

/**
 * The flame engine: nozzle inserts, camera-facing flame ribbons and three
 * GPU particle layers, tinted by the throttle mode and boost-pad palette.
 */
export class Boost implements ExhaustEngine {
  readonly kit: DialKitController<typeof DIALS>;
  readonly stats: ExhaustStats = {
    emitted: 0,
    power: 0,
    palette: 'Rojo',
    capacity: 2400,
    particleLifetimes: [0, 0, 0],
    emittedByLayer: [0, 0, 0],
  };

  private values: BoostDials;
  private readonly unsubscribe: () => void;
  private readonly padPalette = new PadBoostPalette();
  private readonly fireColor = new Color();
  private readonly coreColor = new Color();
  private readonly edgeColor = new Color();
  private readonly engineColor = new Color();
  // Model mouths are static: measure once (the engine insert is skipped and reports its own lip per frame).
  private readonly modelMouths: NozzleMouth[];
  private readonly mouths: NozzleMouth[] = [];
  private readonly engineSettings: EngineCoreSettings;
  private readonly trailSettings: FlameTrailSettings;
  private readonly spawnOverrides: SpawnOverrides = {
    lifetime: [0, 0],
    direction: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    speed: [0, 0],
  };
  private readonly accumulators = [0, 0, 0];
  private readonly rates = [0, 0, 0];
  private readonly durations = [0, 0, 0];
  private readonly previous = new Vector3();
  private readonly worldPosition = new Vector3();
  private readonly velocity = new Vector3();
  private readonly origin = new Vector3();
  private readonly direction = new Vector3();
  private power = 0;
  private time = 0;
  private quality = 1;
  private positioned = false;

  /** Builds the effect and waits for the particle systems' GPU setup. */
  static async create(renderer: WebGPURenderer, scene: Scene, root: Object3D, nozzles: readonly ExhaustMount[]): Promise<Boost> {
    const flame = new FlameMaterial();
    const trail = new FlameTrail(scene, flame.material, nozzles);
    const engine = new EngineCore(root, nozzles);
    const layers = createParticleLayers(renderer, flame);
    try {
      for (const system of layers.systems) {
        await system.init();
        system.stop();
        scene.add(system.object3D);
      }
    } catch (error) {
      for (const system of layers.systems) system.dispose();
      trail.dispose();
      engine.dispose();
      flame.dispose();
      layers.lineGeometry.dispose();
      throw error;
    }
    return new Boost(root, nozzles, flame, trail, engine, layers);
  }

  private constructor(
    private readonly root: Object3D,
    private readonly nozzles: readonly ExhaustMount[],
    private readonly flame: FlameMaterial,
    private readonly trail: FlameTrail,
    private readonly engine: EngineCore,
    private readonly layers: ParticleLayers,
  ) {
    this.kit = createDialKit('Propulsor · WebGPU', DIALS, {id: 'webgpu-boost', persist: false, defaultCollapsed: true});
    this.values = this.kit.values;
    const [fragments, embers, lines] = layers.systems;
    // Cache the values here: reading kit.values rebuilds the whole object.
    this.unsubscribe = this.kit.subscribe((v) => {
      this.values = v;
      layers.opacity.value = v['Opacidad fragmentos'];
      fragments.setProps({
        size: [v['Tamaño fragmentos'] * 0.6, v['Tamaño fragmentos']],
        lifetime: [v['Duración fragmentos'] * 0.5, v['Duración fragmentos']],
      });
      embers.setProps({size: [v['Tamaño brasas'] * 0.4, v['Tamaño brasas']]});
      lines.setProps({size: [v['Tamaño chispas'] * 0.55, v['Tamaño chispas']]});
      const shown = [v.Fragmentos, v.Brasas, v['Chispas lineales']];
      layers.systems.forEach((system, i) => {
        system.object3D.visible = shown[i];
        if (!shown[i]) system.clear();
      });
    });
    this.modelMouths = measureNozzleMouths(root, nozzles);
    this.engineSettings = {
      active: false,
      depth: 2.25,
      intensity: 1.1,
      size: 1.225,
      cooling: 0.85,
      pulse: 0.04,
      nearLight: 0.5,
      edgeColor: this.edgeColor,
      centerColor: this.engineColor,
    };
    this.trailSettings = {
      Activa: false,
      Longitud: 0,
      Ancho: 0,
      Pulsación: 0.02,
      Bocas: null,
      Separación: 0,
      Mínima: 0,
      Retraso: 0,
      CurvaMáx: 0,
    };
  }

  clear(): void {
    for (const system of this.layers.systems) system.clear();
    this.trail.clear();
    this.accumulators.fill(0);
    this.stats.emitted = 0;
    this.stats.emittedByLayer.fill(0);
    this.positioned = false;
  }

  setQuality(lite: boolean): void {
    this.quality = lite ? 0.55 : 1;
  }

  async update(dt: number, mode: string, enabled: boolean, padBoost = false): Promise<void> {
    const {root, stats, padPalette, layers, worldPosition, previous, velocity, origin, direction} = this;
    root.getWorldPosition(worldPosition);
    const distance = this.positioned ? worldPosition.distanceTo(previous) : 0;
    const motionSpeed = dt > 0 && distance < 15 ? distance / dt : 0;
    velocity.subVectors(worldPosition, previous).multiplyScalar(dt > 0 && this.positioned && distance < 15 ? 1 / dt : 0);
    if (distance >= 15) this.clear();
    previous.copy(worldPosition);
    this.positioned = true;
    this.time += dt;
    const time = this.time;
    const v = this.values;
    const target = enabled ? (MODE_POWER[mode] ?? 0) : 0;
    this.power = smoothBoostPower(this.power, target, dt);
    if (!enabled) this.power = 0;
    const power = this.power;
    const blue = mode === 'Turbo';
    stats.power = power;
    stats.palette = padBoost ? 'Verde · placa' : blue ? 'Azul' : 'Rojo';

    padPalette.update(dt, enabled && padBoost);
    this.flame.update(time, v, blue);
    padPalette.apply(this.fireColor, blue ? '#42a4ff' : '#ff6b16');
    padPalette.apply(this.coreColor, blue ? '#9e8c00' : '#fff1bc', true);
    this.flame.setColors(this.fireColor, this.coreColor);
    padPalette.apply(layers.color.value, blue ? '#86a5ff' : '#ff6b16');
    padPalette.apply(layers.hot.value, '#fff1bc', true);
    padPalette.apply(layers.emberTint.value, '#ff861f');
    padPalette.apply(layers.lineTint.value, '#ffd18a', true);
    padPalette.apply(this.edgeColor, blue ? '#42a4ff' : '#ff5812');
    padPalette.apply(this.engineColor, '#fff1b0', true);

    // One world-matrix refresh serves the trail sample and the emitters below.
    root.updateMatrixWorld(true);
    this.trail.recordPose(time, root.matrixWorld);
    this.engineSettings.active = enabled && v.Motor;
    this.engine.update(dt, time, power, this.engineSettings);
    const trail = this.trailSettings;
    trail.Activa = enabled && v.Llama;
    trail.Longitud = v.Longitud;
    trail.Ancho = v.Ancho;
    trail.Bocas = combineMouths(this.modelMouths, this.engine.mouths(), this.mouths);
    trail.Separación = v['Separación boca'];
    trail.Mínima = v['Llama mínima'];
    trail.Retraso = v['Retraso curva'];
    trail.CurvaMáx = v['Curva máxima'];
    this.trail.draw(time, trail, power);

    const {rates, durations, accumulators, spawnOverrides} = this;
    rates[0] = v.Fragmentos ? v['Cantidad fragmentos'] : 0;
    rates[1] = v.Brasas ? v['Cantidad brasas'] : 0;
    rates[2] = v['Chispas lineales'] ? v['Cantidad chispas'] : 0;
    durations[0] = v['Duración fragmentos'];
    durations[1] = v['Duración brasas'];
    durations[2] = v['Duración chispas'];
    const matrix = root.matrixWorld;
    for (let j = 0; j < layers.systems.length; j++) {
      const system = layers.systems[j];
      const spread = LAYER_SPREAD[j];
      // Keep small accents in low quality; reduce only the dense flame filler.
      accumulators[j] += dt * rates[j] * Math.sqrt(power) * (j === 0 ? this.quality : 1);
      const count = Math.floor(accumulators[j]);
      accumulators[j] -= count;
      const relativeSpeed = motionSpeed * (1 - v['Seguir nave']) + LAYER_SPEED[j] * 1.25;
      const budget = v['Estela partículas'] * root.scale.x * (j === 0 ? 0.75 : 1.7);
      // A minimum visible lifespan avoids deleting a newly emitted spark in one update.
      const life = Math.max(0.09, Math.min(durations[j], budget / Math.max(1, relativeSpeed)));
      stats.particleLifetimes[j] = life;
      for (const [x, y, z] of this.nozzles) {
        origin.set(x, y, z).applyMatrix4(matrix);
        for (let i = 0; i < count; i++) {
          direction
            .set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, -1)
            .normalize()
            .transformDirection(matrix);
          direction.multiplyScalar(LAYER_SPEED[j] * (0.75 + Math.random() * 0.5)).addScaledVector(velocity, v['Seguir nave']);
          const speed = direction.length();
          direction.normalize();
          spawnOverrides.lifetime[0] = life * 0.85;
          spawnOverrides.lifetime[1] = life;
          spawnOverrides.direction[0][0] = spawnOverrides.direction[0][1] = direction.x;
          spawnOverrides.direction[1][0] = spawnOverrides.direction[1][1] = direction.y;
          spawnOverrides.direction[2][0] = spawnOverrides.direction[2][1] = direction.z;
          spawnOverrides.speed[0] = spawnOverrides.speed[1] = speed;
          system.spawn(origin.x, origin.y, origin.z, 1, spawnOverrides);
          stats.emitted++;
          stats.emittedByLayer[j]++;
        }
      }
      if (dt > 0) await system.system?.update(dt);
    }
  }

  updatePost({heat}: ExhaustPost): void {
    const v = this.values;
    heat.setNozzles(this.nozzles);
    heat.update(this.root, this.time * 3, this.power, v.Calor ? v['Intensidad calor'] : 0, 0.9, 8, 1.2);
  }

  dispose(): void {
    this.unsubscribe();
    this.kit.destroy();
    for (const system of this.layers.systems) system.dispose();
    this.layers.lineGeometry.dispose();
    this.trail.dispose();
    this.engine.dispose();
    this.flame.dispose();
  }
}
