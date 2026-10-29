import {WebGLRenderer} from 'three/src/renderers/WebGLRenderer.js';
import {AssetLoader} from '@/core/assets/asset-loader';
import {Vector3, type PerspectiveCamera, type Scene} from 'three';
import {WebGPURenderer} from 'three/webgpu';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createDialKit, createDialRoot, type DialKitController, type ResolvedValues} from '@/core/debug/dials';
import 'dialkit/vanilla/styles.css';
import {tracks, type Track} from '@/content/tracks';
import {vehicles} from '@/content/vehicles';
import type {Vehicle} from '@/content/vehicles/vehicle';
import {LensUniforms} from '@/fx/singularity/singularity-lens';
import {isWebGPUBackend} from '@/render/game-renderer';
import {TrackLighting} from '@/render/lighting/track-lighting';
import {BaseMaterials} from '@/render/materials/base-materials';
import {CharacterComic} from '@/render/materials/character-comic';
import {ComicMaterials, createComicStyle, type ComicStyle} from '@/render/materials/comic-materials';
import {retroStyle, RETRO_DEFAULTS} from '@/render/materials/retro-style';
import {ComicPipeline} from '@/render/post/comic-post';
import {BoostPadDials} from '@/game/boost-pads/boost-pad-dials';
import {createHoverState, type HoverState, type Position3} from '@/sim/hover-physics';
import {
  PREVIEW_SCALE as SCALE,
  SMOKE_DIALS,
  applySmokeDials,
  configurePreviewRenderer,
  createPreviewOrbit,
  createPreviewScene,
  fitToWindow,
  framePadOrbit,
  frameShipOrbit,
  loadPreviewContent,
  loadPreviewEffects,
  messageOf,
  requireElement,
  scaleHull,
  type PreviewEffects,
} from '../shared/preview-kit';
import {createLegacySmokeMaterial} from './legacy-smoke-material';
import './webgpu-preview.css';

// WebGPU comparison bench: the TSL comic look and VFX on a circuit, side by side with the original
// GLSL renderer (`?backend=webgl`) and the WebGL2 fallback (`?backend=webgl2`).

const FX_MODES = ['Aceleración', 'Turbo', 'Reposo', 'Soltar'];

// --- Dial panels (ids and labels are what people saved tweaks under) ---------------------------

function createFxKit(query: URLSearchParams, onAction: (action: string) => void) {
  return createDialKit(
    'VFX · pruebas',
    {
      Activos: query.get('vfx') !== 'off',
      Pausa: false,
      Modo: {type: 'select', options: FX_MODES, default: 'Aceleración'},
      Derrape: false,
      Frenado: false,
      Aceite: {type: 'action', label: 'Soltar aceite'},
      Limpiar: {type: 'action', label: 'Limpiar efectos'},
    },
    {id: 'webgpu-vfx', persist: false, onAction},
  );
}

const createSmokeKit = () => createDialKit('Humo · comparación', SMOKE_DIALS, {id: 'webgpu-smoke', persist: false, defaultCollapsed: true});

function createComicKit(query: URLSearchParams, onAction: () => void) {
  return createDialKit(
    'Validación · cómic',
    {
      Mapa: {type: 'select', options: tracks.list().map((track) => track.name), default: tracks.resolve(query.get('map')).name},
      Nave: {type: 'select', options: vehicles.ids, default: vehicles.resolve(query.get('vehicle') ?? '037').id},
      Cómic: query.get('look') !== 'base',
      Trama: [1.03, 0, 2, 0.01],
      Puntos: true,
      Rayado: true,
      Contornos: true,
      'Color cómic': true,
      'Espacio trama': {type: 'select', options: ['Objeto', 'Pantalla'], default: 'Objeto'},
      Noche: false,
      Faros: false,
      Sombras: true,
      Recorrer: false,
      'Velocidad recorrido': [15, 0, 50, 1],
      'Posición en pista': [0, 0, 100, 1],
      Encuadrar: {type: 'action', label: 'Encuadrar nave'},
    },
    {id: 'webgpu-base-preview', persist: false, onAction},
  );
}

type FxKit = ReturnType<typeof createFxKit>;
type SmokeKit = ReturnType<typeof createSmokeKit>;
type ComicKit = ReturnType<typeof createComicKit>;
type Values<K> = K extends DialKitController<infer T> ? ResolvedValues<T> : never;

// -------------------------------------------------------------------------------------------------

/** The node-renderer bench: TSL comic print and every VFX. */
interface GpuParts {
  renderer: WebGPURenderer;
  comicMaterials: ComicMaterials;
  comicPost: ComicPipeline;
  effects: PreviewEffects;
  padControls: BoostPadDials;
  fxKit: FxKit;
  smokeKit: SmokeKit;
}

/** `?backend=webgl`: the original GLSL comic over WebGLRenderer, without VFX. */
interface LegacyParts {
  renderer: WebGLRenderer;
  originalComic: CharacterComic;
}

/** Exactly one renderer drives the bench. */
type BenchRenderer = {gpu: WebGPURenderer; legacy: null} | {gpu: null; legacy: WebGLRenderer};

interface PreviewParts {
  mode: {gpu: GpuParts; legacy: null} | {gpu: null; legacy: LegacyParts};
  renderer: WebGPURenderer | WebGLRenderer;
  backend: string;
  paper: string;
  scene: Scene;
  camera: PerspectiveCamera;
  orbit: OrbitControls;
  world: Track;
  ship: Vehicle;
  lighting: TrackLighting;
  baseline: BaseMaterials;
  state: HoverState;
  comicStyle: ComicStyle;
  dialRoot: {destroy(): void};
  comicKit: ComicKit;
}

/** The `/webgpu-preview.html` bench. */
export class WebgpuPreview {
  private readonly gpu: GpuParts | null;
  private readonly legacy: LegacyParts | null;
  private readonly renderer: WebGPURenderer | WebGLRenderer;
  private readonly backend: string;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly orbit: OrbitControls;
  private readonly world: Track;
  private readonly ship: Vehicle;
  private readonly lighting: TrackLighting;
  private readonly baseline: BaseMaterials;
  private readonly state: HoverState;
  private readonly comicStyle: ComicStyle;
  private readonly dialRoot: {destroy(): void};
  private readonly comicKit: ComicKit;
  private readonly query: URLSearchParams;
  private readonly status: HTMLElement;
  /** Background as the GLSL comic's paper colour. */
  private readonly paper: string;
  private readonly unsubscribers: (() => void)[] = [];
  private readonly lastPosition = new Vector3();
  private readonly delta = new Vector3();
  private readonly previousPadPosition: Position3 = {x: 0, y: 0, z: 0};

  // Latest panel values, kept by subscriptions (reading `kit.values` builds a new object each time).
  private comicValues: Values<ComicKit>;
  private fxValues: Values<FxKit> | null;

  private route = 0;
  private lastRoute = 0;
  private time = 0;
  private previous = performance.now();
  private busy = false;

  /** Builds the bench and starts rendering; rejects (after releasing what loaded) if the scene can't start. */
  static async start(): Promise<WebgpuPreview> {
    const query = new URLSearchParams(location.search);
    const status = requireElement('#status', HTMLElement);
    const canvas = requireElement('canvas', HTMLCanvasElement);
    const legacy = query.get('backend') === 'webgl';
    const webgl2 = query.get('backend') === 'webgl2';
    const bench: BenchRenderer = legacy
      ? {gpu: null, legacy: new WebGLRenderer({canvas, antialias: true})}
      : {gpu: new WebGPURenderer({canvas, antialias: true, forceWebGL: webgl2}), legacy: null};
    const gpuRenderer = bench.gpu;
    const renderer = bench.gpu ?? bench.legacy;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    if (gpuRenderer) await gpuRenderer.init();
    AssetLoader.shared.configure(gpuRenderer ?? renderer);
    const backend = !gpuRenderer ? 'WebGL original' : isWebGPUBackend(gpuRenderer) ? 'WebGPU' : 'WebGL2 · fallback';
    configurePreviewRenderer(renderer);
    document.body.dataset.backend = backend;
    const compare = new URL(location.href);
    compare.searchParams.set('backend', legacy ? 'webgpu' : 'webgl');
    const link = requireElement('#compare', HTMLAnchorElement);
    link.href = compare.href;
    link.textContent = legacy ? 'Comparar con WebGPU' : 'Comparar con WebGL';
    const drive = new URL('./', location.href);
    drive.searchParams.set('selection', 'map');
    drive.searchParams.set('renderer', webgl2 ? 'webgl2' : 'webgpu');
    drive.searchParams.set('map', query.get('map') ?? 'ruins');
    drive.searchParams.set('vehicle', query.get('vehicle') ?? '037');
    drive.searchParams.set('camera', 'klipp');
    requireElement('#drive', HTMLAnchorElement).href = drive.href;
    const {scene, camera, background} = createPreviewScene();
    const orbit = createPreviewOrbit(camera, canvas, 3);

    let content: {world: Track; ship: Vehicle};
    try {
      content = await loadPreviewContent({
        fxMaterialFactory: legacy ? createLegacySmokeMaterial : undefined,
        map: query.get('map') ?? 'ruins',
        vehicle: query.get('vehicle') ?? '037',
        onProgress: (progress) => {
          status.textContent = `Cargando mapa · ${Math.round(progress * 100)}%`;
        },
      });
    } catch (error) {
      renderer.dispose();
      throw error;
    }
    const {world, ship} = content;
    scene.add(world.root, ship.root);
    ship.root.scale.setScalar(SCALE);
    const lighting = new TrackLighting(scene, {headlightMounts: ship.definition.lights.headlights});
    lighting.setTrack(world.landscape);
    world.textures.applyRoot(lighting.root);
    if (gpuRenderer) await world.initWater?.(lighting.sun);
    const baseline = new BaseMaterials(scene);
    const state: HoverState = {...createHoverState(world.landscape), modelScale: SCALE};
    const comicStyle = createComicStyle();
    const comicMaterials = gpuRenderer ? new ComicMaterials(scene, comicStyle) : null;
    const lens = ship.definition.engine.kind === 'singularity' ? new LensUniforms() : null;
    const comicPost = gpuRenderer ? new ComicPipeline({renderer: gpuRenderer, scene, camera, lens}, {samples: 4, glowSamples: 12}) : null;
    const originalComic = bench.legacy ? new CharacterComic(bench.legacy) : null;

    // Ship at the start of the route, framed by the orbit; panels and effects come next.
    let preview: WebgpuPreview | null = null;
    WebgpuPreview.placeAt(ship, state, world, world.landscape.atDistance(0));
    frameShipOrbit(orbit, camera, ship.root, state.yaw);
    const dialRoot = createDialRoot({target: requireElement('#dials', HTMLElement), mode: 'inline', defaultOpen: true, theme: 'dark'});

    let gpu: GpuParts | null = null;
    if (gpuRenderer && comicMaterials && comicPost) {
      const effects = await loadPreviewEffects(gpuRenderer, scene, camera, world, ship, lens);
      const focusPad = (): void => framePadOrbit(orbit, camera, effects.pads.sim.entries[0]);
      const padControls = new BoostPadDials(effects.pads, state, focusPad);
      if (query.get('effect') === 'pad') focusPad();
      const fxKit = createFxKit(query, (action) => {
        if (action === 'Aceite' && fxKit.values.Activos) effects.oil.drop();
        else if (action === 'Limpiar') preview?.clearFx();
      });
      const smokeKit = createSmokeKit();
      gpu = {renderer: gpuRenderer, comicMaterials, comicPost, effects, padControls, fxKit, smokeKit};
    }
    const comicKit = createComicKit(query, () => preview?.frameShip());
    let mode: PreviewParts['mode'];
    if (gpu) mode = {gpu, legacy: null};
    else if (bench.legacy && originalComic) mode = {gpu: null, legacy: {renderer: bench.legacy, originalComic}};
    else throw new Error('Vista previa: falta el renderizador.');
    const paper = `#${background.getHexString()}`;
    preview = new WebgpuPreview(
      {mode, renderer, backend, paper, scene, camera, orbit, world, ship, lighting, baseline, state, comicStyle, dialRoot, comicKit},
      query,
      status,
    );
    await preview.warmUp();
    return preview;
  }

  private constructor(parts: PreviewParts, query: URLSearchParams, status: HTMLElement) {
    this.gpu = parts.mode.gpu;
    this.legacy = parts.mode.legacy;
    ({
      renderer: this.renderer,
      paper: this.paper,
      backend: this.backend,
      scene: this.scene,
      camera: this.camera,
      orbit: this.orbit,
      world: this.world,
      ship: this.ship,
      lighting: this.lighting,
      baseline: this.baseline,
      state: this.state,
      comicStyle: this.comicStyle,
      dialRoot: this.dialRoot,
      comicKit: this.comicKit,
    } = parts);
    this.query = query;
    this.status = status;
    this.lastPosition.copy(this.ship.root.position);
    this.comicValues = this.comicKit.values;
    this.fxValues = this.gpu?.fxKit.values ?? null;
    this.subscribe();
    window.addEventListener('resize', this.onResize);
  }

  private async warmUp(): Promise<void> {
    const {state, scene, camera} = this;
    this.lighting.update(state, 0, {dt: 1, reducedMotion: true});
    scene.updateMatrixWorld(true);
    await this.renderer.compileAsync(scene, camera);
    document.body.dataset.ready = 'true';
    document.body.dataset.materialStats = JSON.stringify(this.baseline.stats);
    this.status.textContent = `${this.backend} · ${this.baseline.stats.textured} mallas con textura · ${this.legacy ? 'referencia GLSL sin VFX' : 'cómic + VFX TSL'}`;
    void this.renderer.setAnimationLoop(this.frame);
    window.addEventListener('pagehide', () => this.dispose(), {once: true});
  }

  dispose(): void {
    const {gpu} = this;
    void this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    gpu?.fxKit.destroy();
    gpu?.smokeKit.destroy();
    gpu?.padControls.dispose();
    gpu?.effects.pads.dispose();
    gpu?.effects.boost.dispose();
    gpu?.effects.smoke.dispose();
    gpu?.effects.oil.dispose();
    this.comicKit.destroy();
    this.dialRoot.destroy();
    this.orbit.dispose();
    gpu?.comicMaterials.dispose();
    gpu?.comicPost.dispose();
    this.legacy?.originalComic.dispose();
    this.baseline.dispose();
    this.lighting.dispose();
    this.ship.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }

  clearFx(): void {
    const effects = this.gpu?.effects;
    effects?.boost.clear();
    effects?.smoke.reset();
    effects?.oil.clear();
  }

  // --- Panels ----------------------------------------------------------------------------------

  private subscribe(): void {
    const {gpu} = this;
    if (gpu) {
      this.unsubscribers.push(
        gpu.smokeKit.subscribe((values) => applySmokeDials(gpu.effects.smoke, values)),
        gpu.fxKit.subscribe((values) => {
          this.fxValues = values;
          if (!values.Activos) this.clearFx();
        }),
      );
    }
    this.unsubscribers.push(
      this.comicKit.subscribe((values) => {
        this.comicValues = values;
        this.applyComic(values);
      }),
    );
  }

  private applyComic(values: Values<ComicKit>): void {
    const {query, comicStyle, gpu} = this;
    const map = tracks.list().find((track) => track.name === values.Mapa)?.id;
    if (map !== (query.get('map') ?? 'ruins') || values.Nave !== (query.get('vehicle') ?? '037')) {
      const url = new URL(location.href);
      url.searchParams.set('map', String(map));
      url.searchParams.set('vehicle', values.Nave);
      location.assign(url);
      return;
    }
    gpu?.comicMaterials.setEnabled(values['Cómic']);
    comicStyle.strength.value = values.Trama;
    comicStyle.hatch.value = Number(values.Rayado);
    comicStyle.dots.value = Number(values.Puntos);
    comicStyle.screenSpace.value = Number(values['Espacio trama'] === 'Pantalla');
    if (gpu) {
      gpu.comicPost.outline.value = Number(values.Contornos);
      gpu.comicPost.grading.value = Number(values['Color cómic']);
    }
    if (this.legacy) {
      Object.assign(retroStyle.params, {
        strength: values.Trama,
        hiOn: values.Puntos,
        hatchOn: values.Rayado,
        outlineOn: values.Contornos,
        gradeSaturation: values['Color cómic'] ? RETRO_DEFAULTS.gradeSaturation : 1,
        gradeContrast: values['Color cómic'] ? RETRO_DEFAULTS.gradeContrast : 1,
        splitAmount: values['Color cómic'] ? RETRO_DEFAULTS.splitAmount : 0,
        space: values['Espacio trama'] === 'Pantalla' ? 'screen' : 'object',
      });
      retroStyle.sync();
    }
    document.body.dataset.comic = String(values['Cómic']);
    this.lighting.setNight(values.Noche);
    this.lighting.setHeadlights(values.Faros);
    this.ship.setHeadlights(values.Faros);
    this.renderer.shadowMap.enabled = values.Sombras;
    if (this.lastRoute !== values['Posición en pista']) {
      this.clearFx();
      this.lastRoute = values['Posición en pista'];
      this.route = (this.world.landscape.length * this.lastRoute) / 100;
      this.place();
      this.lastPosition.copy(this.ship.root.position);
      this.frameShip();
    }
  }

  // --- Placement -------------------------------------------------------------------------------

  /** Puts the ship on the road point, heading along the route and pitched with its grade. */
  private static placeAt(
    ship: Vehicle,
    state: HoverState,
    world: Track,
    road: {x: number; y: number; z: number; nx: number; nz: number; grade?: number},
  ): void {
    state.x = road.x;
    state.z = road.z;
    state.y = (world.surfaceHeight(road.x, road.z) ?? road.y) + 0.65;
    state.yaw = Math.atan2(road.nx, road.nz);
    state.pitch = Math.atan(road.grade ?? 0);
    ship.root.position.set(state.x, state.y, state.z);
    ship.root.rotation.set(-state.pitch, state.yaw, 0, 'YXZ');
  }

  private place(): void {
    WebgpuPreview.placeAt(this.ship, this.state, this.world, this.world.landscape.atDistance(this.route));
  }

  private frameShip(): void {
    frameShipOrbit(this.orbit, this.camera, this.ship.root, this.state.yaw);
  }

  private readonly onResize = (): void => fitToWindow(this.camera, this.renderer);

  // --- Frame -----------------------------------------------------------------------------------

  private readonly frame = async (now: number): Promise<void> => {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.renderFrame(now);
    } catch (error) {
      void this.renderer.setAnimationLoop(null);
      this.status.textContent = `Error: ${messageOf(error)}`;
      console.error(error);
    } finally {
      this.busy = false;
    }
  };

  private async renderFrame(now: number): Promise<void> {
    const {state, ship, camera, orbit, gpu, legacy, comicStyle, renderer, world} = this;
    const comic = this.comicValues;
    const fx = this.fxValues;
    const dt = fx?.Pausa ? 0 : Math.min((now - this.previous) / 1000, 0.05);
    this.previous = now;
    this.time += dt;
    const previousPadPosition = this.previousPadPosition;
    previousPadPosition.x = state.x;
    previousPadPosition.y = state.y;
    previousPadPosition.z = state.z;
    if (comic.Recorrer) {
      this.route = (this.route + dt * comic['Velocidad recorrido']) % world.landscape.length;
      this.place();
      this.delta.subVectors(ship.root.position, this.lastPosition);
      camera.position.add(this.delta);
      orbit.target.add(this.delta);
      this.lastPosition.copy(ship.root.position);
    }
    if (gpu && fx) {
      const {boost, smoke, oil, pads} = gpu.effects;
      state.speed = comic.Recorrer ? comic['Velocidad recorrido'] : 15;
      state.vx = Math.sin(state.yaw) * state.speed;
      state.vz = Math.cos(state.yaw) * state.speed;
      state.drifting = fx.Derrape;
      state.braking = fx.Frenado;
      state.slip = fx.Derrape ? 0.55 : 0;
      state.boosting = fx.Activos && fx.Modo === 'Turbo';
      state.hull = scaleHull(ship.definition.hull, SCALE);
      state.padBoostRemaining = Math.max(0, (state.padBoostRemaining ?? 0) - dt);
      if (dt > 0) {
        pads.step(dt, state, previousPadPosition);
        gpu.padControls.update();
      }
      pads.update(dt, false);
      const padTurbo = state.padBoostRemaining > 0;
      state.boosting = state.boosting || padTurbo;
      await boost.update(dt, padTurbo ? 'Turbo' : fx.Modo, fx.Activos, padTurbo, state);
      smoke.update(dt, {state, camera, scale: SCALE, reduced: !fx.Activos});
      oil.update(dt, state);
      const pad = pads.sim.entries[0];
      document.body.dataset.boostPad = JSON.stringify({
        remaining: pad.remaining,
        activations: pad.activations,
        turbo: state.padBoostRemaining,
      });
      document.body.dataset.vfx = JSON.stringify({
        enabled: fx.Activos,
        mode: fx.Modo,
        ...boost.stats,
        smoke: smoke.stats.air,
        marks: smoke.stats.marks,
        oil: oil.sim.patches.length,
        time: this.time,
      });
    }
    ship.pilot.update(this.time, true);
    orbit.update();
    this.lighting.update(state, this.time, {dt});
    if (gpu) {
      gpu.effects.boost.updatePost(gpu.comicPost);
      gpu.comicPost.heat.updatePadFields(gpu.effects.pads.heatFields ?? []);
    }
    comicStyle.pixelRatio.value = renderer.getPixelRatio();
    renderer.getDrawingBufferSize(comicStyle.resolution.value);
    gpu?.comicMaterials.sync();
    if (gpu) gpu.comicPost.comic.value = Number(comic['Cómic']);
    if (comic['Cómic'] || fx?.Activos) {
      if (legacy) legacy.originalComic.render(this.scene, camera, this.paper);
      else gpu?.comicPost.render();
    } else {
      renderer.render(this.scene, camera);
    }
    document.body.dataset.frame = String(Number(document.body.dataset.frame ?? 0) + 1);
  }
}

WebgpuPreview.start().catch((error: unknown) => {
  const message = messageOf(error);
  const status = document.querySelector('#status');
  if (status) status.textContent = `No se pudo iniciar: ${message}`;
  document.body.dataset.error = message;
  console.error(error);
});
