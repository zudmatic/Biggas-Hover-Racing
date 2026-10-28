import {AssetLoader} from '@/core/assets/asset-loader';
import {MathUtils, Quaternion, Vector3, type PerspectiveCamera, type Scene} from 'three';
import {WebGPURenderer} from 'three/webgpu';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createDialKit, createDialRoot, type DialKitController, type ResolvedValues} from '@/core/debug/dials';
import 'dialkit/vanilla/styles.css';
import {tracks, type Track} from '@/content/tracks';
import {vehicles} from '@/content/vehicles';
import type {Vehicle} from '@/content/vehicles/vehicle';
import {LensUniforms} from '@/fx/singularity/singularity-lens';
import {isWebGPUBackend} from '@/render/game-renderer';
import {ComicMaterials, createComicStyle, type ComicStyle} from '@/render/materials/comic-materials';
import {ComicPipeline} from '@/render/post/comic-post';
import {TrackLighting} from '@/render/lighting/track-lighting';
import {BaseMaterials} from '@/render/materials/base-materials';
import {HoverPhysics, createHoverState, type HoverInput, type HoverState, type Position3} from '@/sim/hover-physics';
import {RenderInterpolator} from '@/sim/render-interpolator';
import {scaledHull} from '@/game/model-scale';
import {BoostPadDials} from '@/game/boost-pads/boost-pad-dials';
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
import './playground.css';

// Debug playground: the preview scene plus reproducible camera views, ship states and time control,
// all scriptable through window.playground so checks and screenshots don't depend on mouse drags.

type Vec3 = readonly [number, number, number];

/** Free orbit, a fixed offset in the ship's frame, or a look at the main nozzle. */
type ViewSpec =
  | {label: string; camera?: undefined}
  | {label: string; camera: Vec3; target: Vec3; nozzle?: undefined}
  | {label: string; camera: Vec3; nozzle: true; target?: undefined};

// Offsets are world units in the ship's frame (forward +z, flames leave toward -z).
const VIEWS = {
  libre: {label: 'Libre'},
  carrera: {label: 'Carrera', camera: [0, 4, -8.5], target: [0, 1, 0]},
  trasera: {label: 'Trasera', camera: [0, 1.3, -5.5], target: [0, 0.8, -1.8]},
  tobera: {label: 'Tobera', camera: [0.9, 0.55, -2.4], nozzle: true},
  costado: {label: 'Costado', camera: [7, 1.4, -1.2], target: [0, 0.8, -0.8]},
  arriba: {label: 'Arriba', camera: [0, 11, -0.6], target: [0, 0, 0]},
  frontal: {label: 'Frontal', camera: [0, 1.6, 7.5], target: [0, 0.9, 0]},
} satisfies Record<string, ViewSpec>;
type ViewId = keyof typeof VIEWS;

interface StateSpec {
  label: string;
  /** Engine mode fed to the exhaust: 'Aceleración', 'Turbo', 'Reposo' or 'Soltar'. */
  mode: string;
  /** Factor of the "Velocidad" dial. */
  speed: number;
  manual?: boolean;
  wall?: boolean;
  braking?: boolean;
  drift?: boolean;
  turn?: boolean;
}

// Speed is a factor of the "Velocidad" dial; "wall" pins the ship and shakes it against the barrier;
// "turn" leaves the track and circles at Radio giro, nose turned into the curve by Deriva degrees;
// "manual" hands the ship to the game's own hover physics and the keyboard (W/S, A/D, Shift, Space, E, R).
const STATES = {
  manejar: {label: 'Manejar', mode: 'Aceleración', speed: 0, manual: true},
  parada: {label: 'Parada', mode: 'Reposo', speed: 0},
  acelerando: {label: 'Acelerando', mode: 'Aceleración', speed: 1},
  turbo: {label: 'Turbo', mode: 'Turbo', speed: 1.4},
  'contra-muro': {label: 'Contra muro', mode: 'Reposo', speed: 0, wall: true},
  frenando: {label: 'Frenando', mode: 'Aceleración', speed: 0.5, braking: true},
  derrape: {label: 'Derrape', mode: 'Aceleración', speed: 1, drift: true},
  girando: {label: 'Girando', mode: 'Aceleración', speed: 1, turn: true},
  soltar: {label: 'Soltar', mode: 'Soltar', speed: 0},
} satisfies Record<string, StateSpec>;
type StateId = keyof typeof STATES;

const VIEW_IDS = Object.keys(VIEWS) as ViewId[];
const STATE_IDS = Object.keys(STATES) as StateId[];
const view = (id: ViewId): ViewSpec => VIEWS[id];
const stateSpec = (id: StateId): StateSpec => STATES[id];
const isViewId = (id: string | null | undefined): id is ViewId => id != null && Object.hasOwn(VIEWS, id);
const isStateId = (id: string | null | undefined): id is StateId => id != null && Object.hasOwn(STATES, id);
const viewByLabel = (label: string): ViewId | undefined => VIEW_IDS.find((id) => VIEWS[id].label === label);
const stateByLabel = (label: string): StateId | undefined => STATE_IDS.find((id) => STATES[id].label === label);

const DRIVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
  'Space',
  'KeyE',
]);
const STEP = 1 / 60;
const HUD_INTERVAL_MS = 250;

// --- Dial panels (ids and labels are what people saved tweaks under) ---------------------------

function createCameraKit(query: URLSearchParams, onAction: () => void) {
  const viewParam = query.get('view');
  return createDialKit(
    'Cámara',
    {
      Vista: {
        type: 'select',
        options: VIEW_IDS.map((id) => VIEWS[id].label),
        default: isViewId(viewParam) ? VIEWS[viewParam].label : 'Libre',
      },
      FOV: [62, 30, 100, 1],
      Encuadrar: {type: 'action', label: 'Encuadrar nave'},
    },
    {id: 'playground-camera', persist: false, onAction},
  );
}

function createStateKit(query: URLSearchParams, onAction: (action: string) => void) {
  const stateParam = query.get('state');
  return createDialKit(
    'Estado nave',
    {
      Estado: {
        type: 'select',
        options: STATE_IDS.map((id) => STATES[id].label),
        default: isStateId(stateParam) ? STATES[stateParam].label : 'Acelerando',
      },
      Velocidad: [30, 0, 80, 1],
      'Radio giro': [14, 4, 60, 1],
      Sentido: {type: 'select', options: ['Izquierda', 'Derecha'], default: 'Izquierda'},
      Deriva: [0, -30, 40, 1],
      'Mover nave': true,
      'Activar placas': false,
      'VFX activos': query.get('vfx') !== 'off',
      Aceite: {type: 'action', label: 'Soltar aceite'},
      Limpiar: {type: 'action', label: 'Limpiar efectos'},
    },
    {id: 'playground-state', persist: false, onAction},
  );
}

function createTimeKit(onAction: () => void) {
  return createDialKit(
    'Tiempo',
    {
      Pausa: false,
      'Velocidad tiempo': [1, 0.05, 2, 0.05],
      Avanzar: {type: 'action', label: 'Avanzar un cuadro'},
    },
    {id: 'playground-time', persist: false, onAction},
  );
}

function createSceneKit(query: URLSearchParams, mapId: string, vehicleId: string) {
  return createDialKit(
    'Escena',
    {
      Mapa: {type: 'select', options: tracks.list().map((track) => track.name), default: tracks.resolve(mapId).name},
      Nave: {type: 'select', options: vehicles.ids, default: vehicles.resolve(vehicleId).id},
      Cómic: query.get('look') !== 'base',
      Trama: [1.03, 0, 2, 0.01],
      Puntos: true,
      Rayado: true,
      Contornos: true,
      'Color cómic': true,
      Noche: false,
      Faros: false,
      Sombras: true,
      'Posición en pista': [0, 0, 100, 1],
    },
    {id: 'playground-scene', persist: false, defaultCollapsed: true},
  );
}

const createSmokeKit = () => createDialKit('Humo', SMOKE_DIALS, {id: 'playground-smoke', persist: false, defaultCollapsed: true});

type CameraKit = ReturnType<typeof createCameraKit>;
type StateKit = ReturnType<typeof createStateKit>;
type TimeKit = ReturnType<typeof createTimeKit>;
type SceneKit = ReturnType<typeof createSceneKit>;
type SmokeKit = ReturnType<typeof createSmokeKit>;
type Values<K> = K extends DialKitController<infer T> ? ResolvedValues<T> : never;

// --- Scripting API -------------------------------------------------------------------------------

export interface PlaygroundInfo {
  view: ViewId;
  state: StateId;
  mode: string;
  speed: number;
  time: number;
  paused: boolean;
  power: number;
  palette: string;
  /** Camera position in the ship's local frame. */
  cameraLocal: {x: number; y: number; z: number};
  camera: number[];
  ship: {position: number[]; yaw: number; travel: number};
  pendingSteps: number;
  frame: number;
  backend: string;
}

/** `window.playground`: views and states by id, time control and a state snapshot for scripted checks. */
export interface PlaygroundApi {
  views: string[];
  states: string[];
  setView(id: string): void;
  setState(id: string): void;
  setTurn(options?: {radius?: number; direction?: string; drift?: number}): void;
  info(): PlaygroundInfo;
  clearFx(): void;
  pause(on?: boolean): void;
  step(count?: number): void;
}

declare global {
  interface Window {
    playground?: PlaygroundApi;
  }
}

// -------------------------------------------------------------------------------------------------

interface PlaygroundParts {
  renderer: WebGPURenderer;
  backend: string;
  scene: Scene;
  camera: PerspectiveCamera;
  orbit: OrbitControls;
  world: Track;
  ship: Vehicle;
  lighting: TrackLighting;
  baseline: BaseMaterials;
  state: HoverState;
  comicStyle: ComicStyle;
  comicMaterials: ComicMaterials;
  comicPost: ComicPipeline;
  mapId: string;
  dialRoot: {destroy(): void};
  kits: {view: CameraKit; state: StateKit; time: TimeKit; scene: SceneKit; smoke: SmokeKit};
  effects: PreviewEffects;
  padControls: BoostPadDials;
}

/** Turning rig: travel heading advances at speed / radius around a centre anchored where the turn began. */
interface TurnCircle {
  anchored: boolean;
  heading: number;
  cx: number;
  cz: number;
  y: number;
  radius: number;
  direction: number;
}

/** The `/playground/` bench: one ship on a circuit with reproducible views, states and time control. */
export class Playground {
  private readonly renderer: WebGPURenderer;
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
  private readonly comicMaterials: ComicMaterials;
  private readonly comicPost: ComicPipeline;
  private readonly effects: PreviewEffects;
  private readonly padControls: BoostPadDials;
  private readonly dialRoot: {destroy(): void};
  private readonly kits: PlaygroundParts['kits'];
  private readonly mapId: string;
  private readonly status: HTMLElement;
  private readonly hud: HTMLElement;
  /** Nozzle with the largest radius: the "Tobera" view looks into it. */
  private readonly mainNozzle: readonly number[];
  private readonly renderPose = new RenderInterpolator();
  private readonly physics: HoverPhysics;
  private readonly keys = new Set<string>();
  private readonly driveInput: HoverInput = {reducedMotion: false, turn: 0, throttle: 0, boost: false, brake: false, drift: false};
  private readonly previousPadPosition: Position3 = {x: 0, y: 0, z: 0};
  private readonly circle: TurnCircle = {anchored: false, heading: 0, cx: 0, cz: 0, y: 0, radius: 0, direction: 0};
  private readonly unsubscribers: (() => void)[] = [];

  // Follow-camera rig: track yaw arrives in per-segment steps, so the camera follows a smoothed copy of the
  // ship's rotation, and view changes glide in rig space instead of cutting.
  private readonly rig = new Quaternion();
  private readonly inverseRig = new Quaternion();
  private readonly cameraRig = new Vector3();
  private readonly targetRig = new Vector3();
  private readonly wantedCamera = new Vector3();
  private readonly wantedTarget = new Vector3();
  private readonly target = new Vector3();
  private readonly lastPosition = new Vector3();
  private readonly delta = new Vector3();
  private rigReady = false;
  private lastView: ViewId | null = null;

  // Latest panel values, kept by subscriptions (reading `kit.values` builds a new object each time).
  private viewValues: Values<CameraKit>;
  private stateValues: Values<StateKit>;
  private timeValues: Values<TimeKit>;
  private sceneValues: Values<SceneKit>;

  private route = 0;
  private lastRoute = 0;
  private time = 0;
  private previous = performance.now();
  private busy = false;
  private pendingSteps = 0;
  private frames = 0;
  private frameMs = 0;
  private lastHud = 0;
  private manualAccumulator = 0;
  private activeState: StateId | null = null;
  private currentMode = 'Aceleración';

  /** Builds the bench and starts rendering; rejects (after releasing what loaded) if the scene can't start. */
  static async start(): Promise<Playground> {
    const query = new URLSearchParams(location.search);
    const status = requireElement('#status', HTMLElement);
    const canvas = requireElement('canvas', HTMLCanvasElement);
    const webgl2 = query.get('backend') === 'webgl2';
    const renderer = new WebGPURenderer({canvas, antialias: true, forceWebGL: webgl2});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    await renderer.init();
    AssetLoader.shared.configure(renderer);
    const backend = isWebGPUBackend(renderer) ? 'WebGPU' : 'WebGL2 · fallback';
    configurePreviewRenderer(renderer);
    document.body.dataset.backend = backend;
    const mapId = query.get('map') ?? 'ruins';
    const vehicleId = query.get('vehicle') ?? '037';
    const drive = new URL('/', location.href);
    drive.search = new URLSearchParams({
      selection: 'map',
      renderer: webgl2 ? 'webgl2' : 'webgpu',
      map: mapId,
      vehicle: vehicleId,
      camera: 'klipp',
    }).toString();
    requireElement('#drive', HTMLAnchorElement).href = drive.href;
    const {scene, camera} = createPreviewScene();
    const orbit = createPreviewOrbit(camera, canvas, 1);

    let content: {world: Track; ship: Vehicle};
    try {
      content = await loadPreviewContent({
        map: mapId,
        vehicle: vehicleId,
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
    const baseline = new BaseMaterials(scene);
    const state: HoverState = {...createHoverState(world.landscape), modelScale: SCALE};
    const comicStyle = createComicStyle();
    const comicMaterials = new ComicMaterials(scene, comicStyle);
    const lens = ship.definition.engine.kind === 'singularity' ? new LensUniforms() : null;
    const comicPost = new ComicPipeline({renderer, scene, camera, lens}, {samples: 4, glowSamples: 12});

    // Panels are created in display order; their actions reach the bench once it exists.
    let bench: Playground | null = null;
    const dialRoot = createDialRoot({target: requireElement('#dials', HTMLElement), mode: 'inline', defaultOpen: true, theme: 'dark'});
    const view = createCameraKit(query, () => bench?.frameShip());
    const stateKit = createStateKit(query, (action) => {
      if (action === 'Aceite') bench?.effects.oil.drop();
      else if (action === 'Limpiar') bench?.clearFx();
    });
    const time = createTimeKit(() => {
      if (bench) bench.pendingSteps++;
    });
    const sceneKit = createSceneKit(query, mapId, vehicleId);
    const effects = await loadPreviewEffects(renderer, scene, camera, world, ship, lens);
    const padControls = new BoostPadDials(effects.pads, state, () => bench?.focusPad());
    const smoke = createSmokeKit();

    bench = new Playground(
      {
        renderer,
        backend,
        scene,
        camera,
        orbit,
        world,
        ship,
        lighting,
        baseline,
        state,
        comicStyle,
        comicMaterials,
        comicPost,
        mapId,
        dialRoot,
        kits: {view, state: stateKit, time, scene: sceneKit, smoke},
        effects,
        padControls,
      },
      query,
      vehicleId,
      status,
    );
    await bench.warmUp(query);
    return bench;
  }

  private constructor(parts: PlaygroundParts, query: URLSearchParams, vehicleId: string, status: HTMLElement) {
    ({
      renderer: this.renderer,
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
      comicMaterials: this.comicMaterials,
      comicPost: this.comicPost,
      mapId: this.mapId,
      dialRoot: this.dialRoot,
      kits: this.kits,
      effects: this.effects,
      padControls: this.padControls,
    } = parts);
    this.physics = new HoverPhysics(this.world.landscape, this.world.surfaceHeight);
    this.status = status;
    this.hud = requireElement('#hud', HTMLElement);
    const nozzles = this.ship.definition.engine.exhausts;
    this.mainNozzle = nozzles.reduce((best, nozzle) => (nozzle[3] > best[3] ? nozzle : best), nozzles[0]);
    this.viewValues = this.kits.view.values;
    this.stateValues = this.kits.state.values;
    this.timeValues = this.kits.time.values;
    this.sceneValues = this.kits.scene.values;

    window.playground = {
      views: [...VIEW_IDS],
      states: [...STATE_IDS],
      setView: (id) => this.setView(id),
      setState: (id) => this.setState(id),
      setTurn: (options) => this.setTurn(options),
      info: () => this.info(),
      clearFx: () => this.clearFx(),
      pause: (on = true) => this.kits.time.setValue('Pausa', on),
      step: (count = 1) => {
        this.kits.time.setValue('Pausa', true);
        this.pendingSteps += count;
      },
    };
    this.subscribe(vehicleId);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.onResize);
  }

  /** First placement and shader compilation, then the frame loop. */
  private async warmUp(query: URLSearchParams): Promise<void> {
    const {state, scene, camera} = this;
    this.place();
    this.lastPosition.copy(this.ship.root.position);
    this.frameShip();
    const viewParam = query.get('view');
    if (viewParam) this.setView(viewParam);
    this.lighting.update(state, 0, {dt: 1, reducedMotion: true});
    scene.updateMatrixWorld(true);
    await this.renderer.compileAsync(scene, camera);
    document.body.dataset.ready = 'true';
    this.status.textContent = `${this.backend} · ${this.ship.definition.name} · ${tracks.resolve(this.mapId).name}`;
    this.renderer.setAnimationLoop(this.frame);
    window.addEventListener('pagehide', () => this.dispose(), {once: true});
  }

  dispose(): void {
    const {kits, effects} = this;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    for (const kit of [kits.view, kits.state, kits.time, kits.scene, kits.smoke]) kit.destroy();
    this.padControls.dispose();
    effects.pads.dispose();
    effects.boost.dispose();
    effects.smoke.dispose();
    effects.oil.dispose();
    this.dialRoot.destroy();
    this.orbit.dispose();
    this.comicMaterials.dispose();
    this.comicPost.dispose();
    this.baseline.dispose();
    this.lighting.dispose();
    this.ship.dispose();
    this.world.dispose();
    this.renderer.dispose();
    delete window.playground;
  }

  // --- Scripting API ---------------------------------------------------------------------------

  setView(id: string): void {
    if (!isViewId(id)) throw new Error(`Vista desconocida: ${id}`);
    this.kits.view.setValue('Vista', VIEWS[id].label);
    document.body.dataset.view = id;
  }

  setState(id: string): void {
    if (!isStateId(id)) throw new Error(`Estado desconocido: ${id}`);
    this.kits.state.setValue('Estado', STATES[id].label);
    document.body.dataset.state = id;
  }

  setTurn({radius, direction, drift}: {radius?: number; direction?: string; drift?: number} = {}): void {
    const kit = this.kits.state;
    if (radius !== undefined) kit.setValue('Radio giro', radius);
    if (direction !== undefined) kit.setValue('Sentido', direction === 'derecha' ? 'Derecha' : 'Izquierda');
    if (drift !== undefined) kit.setValue('Deriva', drift);
  }

  info(): PlaygroundInfo {
    const {camera, ship, state, effects} = this;
    const local = ship.root.worldToLocal(camera.position.clone());
    const stateId = this.stateId();
    return {
      view: this.viewId(),
      state: stateId,
      mode: this.currentMode,
      speed: state.speed,
      time: this.time,
      paused: this.timeValues.Pausa,
      power: effects.boost.stats.power,
      palette: effects.boost.stats.palette,
      cameraLocal: {x: local.x, y: local.y, z: local.z},
      camera: camera.position.toArray(),
      ship: {position: ship.root.position.toArray(), yaw: state.yaw, travel: stateSpec(stateId).turn ? this.circle.heading : state.yaw},
      pendingSteps: this.pendingSteps,
      frame: Number(document.body.dataset.frame ?? 0),
      backend: this.backend,
    };
  }

  clearFx(): void {
    const {boost, smoke, oil} = this.effects;
    boost.clear();
    smoke.reset();
    oil.clear();
  }

  // --- Panels ----------------------------------------------------------------------------------

  private viewId(): ViewId {
    return viewByLabel(this.viewValues.Vista) ?? 'libre';
  }

  private stateId(): StateId {
    return stateByLabel(this.stateValues.Estado) ?? 'acelerando';
  }

  private subscribe(vehicleId: string): void {
    const {kits, camera} = this;
    this.unsubscribers.push(
      kits.view.subscribe((values) => {
        this.viewValues = values;
        camera.fov = values.FOV;
        camera.updateProjectionMatrix();
        document.body.dataset.view = this.viewId();
      }),
      kits.state.subscribe((values) => {
        this.stateValues = values;
        document.body.dataset.state = this.stateId();
        if (!values['VFX activos']) this.clearFx();
      }),
      kits.time.subscribe((values) => {
        this.timeValues = values;
      }),
      kits.smoke.subscribe((values) => applySmokeDials(this.effects.smoke, values)),
      kits.scene.subscribe((values) => {
        this.sceneValues = values;
        this.applyScene(values, vehicleId);
      }),
    );
  }

  private applyScene(values: Values<SceneKit>, vehicleId: string): void {
    const map = tracks.list().find((track) => track.name === values.Mapa)?.id;
    if (map !== this.mapId || values.Nave !== vehicleId) {
      const url = new URL(location.href);
      url.searchParams.set('map', String(map));
      url.searchParams.set('vehicle', values.Nave);
      location.assign(url);
      return;
    }
    const {comicStyle, comicPost, lighting} = this;
    this.comicMaterials.setEnabled(values['Cómic']);
    comicStyle.strength.value = values.Trama;
    comicStyle.hatch.value = Number(values.Rayado);
    comicStyle.dots.value = Number(values.Puntos);
    comicPost.outline.value = Number(values.Contornos);
    comicPost.grading.value = Number(values['Color cómic']);
    lighting.setNight(values.Noche);
    lighting.setHeadlights(values.Faros);
    this.ship.setHeadlights(values.Faros);
    this.renderer.shadowMap.enabled = values.Sombras;
    if (this.lastRoute !== values['Posición en pista']) {
      this.clearFx();
      this.lastRoute = values['Posición en pista'];
      this.route = (this.world.landscape.length * this.lastRoute) / 100;
      this.place();
      this.lastPosition.copy(this.ship.root.position);
      if (this.viewId() === 'libre') this.frameShip();
    }
  }

  // --- Placement and cameras -------------------------------------------------------------------

  private anchorCircle(radius: number, direction: number): void {
    const {circle, state} = this;
    circle.heading = circle.anchored ? circle.heading : state.yaw;
    circle.anchored = true;
    circle.radius = radius;
    circle.direction = direction;
    circle.cx = state.x + direction * radius * Math.cos(circle.heading);
    circle.cz = state.z - direction * radius * Math.sin(circle.heading);
    circle.y = state.y;
  }

  /** Puts the ship on the route (or on the turning circle) for the scripted states. */
  private place(): void {
    const {state, world, circle, stateValues: values} = this;
    const root = this.ship.root;
    const spec = stateSpec(this.stateId());
    if (spec.turn) {
      const direction = values.Sentido === 'Izquierda' ? 1 : -1;
      const radius = values['Radio giro'];
      if (!circle.anchored || circle.radius !== radius || circle.direction !== direction) this.anchorCircle(radius, direction);
      state.x = circle.cx - direction * radius * Math.cos(circle.heading);
      state.z = circle.cz + direction * radius * Math.sin(circle.heading);
      state.y = (world.surfaceHeight(state.x, state.z) ?? circle.y - 0.65) + 0.65;
      state.yaw = circle.heading + direction * MathUtils.degToRad(values.Deriva);
      state.pitch = 0;
      root.position.set(state.x, state.y, state.z);
      root.rotation.set(0, state.yaw, 0, 'YXZ');
      root.updateMatrixWorld();
      return;
    }
    circle.anchored = false;
    const road = world.landscape.atDistance(this.route);
    state.x = road.x;
    state.z = road.z;
    state.y = (world.surfaceHeight(road.x, road.z) ?? road.y) + 0.65;
    // Heading from a chord across the polyline: segment directions jump at every sample, the chord turns continuously.
    const back = world.landscape.atDistance(this.route - 1.5);
    const ahead = world.landscape.atDistance(this.route + 1.5);
    state.yaw = Math.atan2(ahead.x - back.x, ahead.z - back.z);
    state.pitch = Math.atan2(ahead.y - back.y, Math.hypot(ahead.x - back.x, ahead.z - back.z));
    // Pinned against a wall: small forward/back shake, the way contact resolution jitters in a race.
    const shake = spec.wall ? 0.04 * Math.sin(this.time * 55) : 0;
    state.x += Math.sin(state.yaw) * shake;
    state.z += Math.cos(state.yaw) * shake;
    root.position.set(state.x, state.y, state.z);
    root.rotation.set(-state.pitch, state.yaw, 0, 'YXZ');
    root.updateMatrixWorld();
  }

  private frameShip(): void {
    this.setView('libre');
    frameShipOrbit(this.orbit, this.camera, this.ship.root, this.state.yaw);
  }

  private focusPad(): void {
    const pad = this.effects.pads.sim.entries[0];
    this.setView('libre');
    framePadOrbit(this.orbit, this.camera, pad);
  }

  private applyView(realDt: number): void {
    const {camera, orbit, rig, ship, cameraRig, targetRig, wantedCamera, wantedTarget, target} = this;
    const id = this.viewId();
    const spec = view(id);
    orbit.enabled = !spec.camera;
    if (!spec.camera) {
      this.lastView = id;
      return;
    }
    const position = ship.root.position;
    if (!this.rigReady) {
      rig.copy(ship.root.quaternion);
      this.rigReady = true;
    } else {
      rig.slerp(ship.root.quaternion, 1 - Math.exp(-realDt * 5));
    }
    if (id !== this.lastView) {
      // Start the glide from wherever the camera is now (another view or the free orbit).
      this.inverseRig.copy(rig).invert();
      cameraRig.subVectors(camera.position, position).applyQuaternion(this.inverseRig);
      targetRig.subVectors(orbit.target, position).applyQuaternion(this.inverseRig);
      this.lastView = id;
    }
    if (spec.nozzle) wantedTarget.set(this.mainNozzle[0], this.mainNozzle[1], this.mainNozzle[2]).multiplyScalar(SCALE);
    else wantedTarget.set(...spec.target);
    wantedCamera.set(...spec.camera);
    if (spec.nozzle) wantedCamera.add(wantedTarget);
    const glide = 1 - Math.exp(-realDt * 7);
    cameraRig.lerp(wantedCamera, glide);
    targetRig.lerp(wantedTarget, glide);
    camera.position.copy(cameraRig).applyQuaternion(rig).add(position);
    target.copy(targetRig).applyQuaternion(rig).add(position);
    camera.lookAt(target);
    orbit.target.copy(target);
  }

  // --- Manual driving --------------------------------------------------------------------------
  // Same fixed 60 Hz hover physics and wall collisions as the race, rendered from an interpolated pose.

  private pressed(...codes: string[]): boolean {
    return codes.some((code) => this.keys.has(code));
  }

  private readDriveInput(): HoverInput {
    const input = this.driveInput;
    input.turn = Number(this.pressed('KeyD', 'ArrowRight')) - Number(this.pressed('KeyA', 'ArrowLeft'));
    input.throttle = Number(this.pressed('KeyW', 'ArrowUp')) - Number(this.pressed('KeyS', 'ArrowDown'));
    input.boost = this.pressed('ShiftLeft', 'ShiftRight');
    input.brake = this.pressed('Space');
    input.drift = this.pressed('KeyE');
    return input;
  }

  private backToTrack(): void {
    const {state} = this;
    this.route = this.world.landscape.roadAt(state.x, state.z).distance;
    this.place();
    Object.assign(state, {speed: 0, throttle: 0, vx: 0, vz: 0, yawRate: 0, roll: 0, pitch: 0, recoverNeeded: false, boosting: false});
    this.renderPose.reset(state);
    this.manualAccumulator = 0;
  }

  private startManual(): void {
    const {state, ship} = this;
    const hull = scaledHull(ship.definition, SCALE);
    Object.assign(state, createHoverState(this.world.landscape), {
      x: state.x,
      y: state.y,
      z: state.z,
      yaw: state.yaw,
      pitch: 0,
      roll: 0,
      hull,
      modelScale: SCALE,
    });
    this.renderPose.reset(state);
    this.manualAccumulator = 0;
    if (this.viewId() === 'libre') this.setView('carrera');
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
  };

  private readonly onResize = (): void => fitToWindow(this.camera, this.renderer);

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable]')) return;
    if (stateSpec(this.stateId()).manual) {
      if (DRIVE_KEYS.has(event.code)) {
        this.keys.add(event.code);
        event.preventDefault();
        return;
      }
      if (event.code === 'KeyR') {
        this.backToTrack();
        return;
      }
    }
    const index = Number(event.key) - 1;
    if (index >= 0 && index < VIEW_IDS.length) this.setView(VIEW_IDS[index]);
    else if (event.key === 'p' || event.key === 'P') this.kits.time.setValue('Pausa', !this.timeValues.Pausa);
    else if (event.key === '.') window.playground?.step(1);
  };

  // --- Frame -----------------------------------------------------------------------------------

  private readonly frame = async (now: number): Promise<void> => {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.renderFrame(now);
    } catch (error) {
      this.renderer.setAnimationLoop(null);
      this.status.textContent = `Error: ${messageOf(error)}`;
      console.error(error);
    } finally {
      this.busy = false;
    }
  };

  private async renderFrame(now: number): Promise<void> {
    const {state, ship, world, camera, orbit, effects, comicPost, comicStyle, renderer} = this;
    const {boost, smoke, oil, pads} = effects;
    const elapsed = (now - this.previous) / 1000;
    const real = Math.min(elapsed, 0.05);
    const time = this.timeValues;
    this.previous = now;
    let dt = time.Pausa ? 0 : real * time['Velocidad tiempo'];
    // Queued steps run together (n × 1/60 s), so scripted steps don't depend on the frame rate.
    if (time.Pausa && this.pendingSteps > 0) {
      dt = this.pendingSteps / 60;
      this.pendingSteps = 0;
    }
    this.time += dt;

    const id = this.stateId();
    const spec = stateSpec(id);
    const values = this.stateValues;
    const speed = spec.speed * values.Velocidad;
    const previousPadPosition = this.previousPadPosition;
    previousPadPosition.x = state.x;
    previousPadPosition.y = state.y;
    previousPadPosition.z = state.z;
    if (id !== this.activeState) {
      if (spec.manual) this.startManual();
      else if (this.activeState && stateSpec(this.activeState).manual) this.backToTrack();
      this.activeState = id;
    }
    if (spec.manual) {
      this.manualAccumulator += dt;
      while (this.manualAccumulator >= STEP - 1e-9) {
        this.renderPose.capture(state);
        const before = this.physics.step(state, this.readDriveInput(), STEP);
        world.step(state, STEP, before);
        if (values['Activar placas']) pads.step(STEP, state, before);
        if (state.recoverNeeded) this.backToTrack();
        this.manualAccumulator -= STEP;
      }
      const pose = this.renderPose.sample(state, this.manualAccumulator * 60);
      ship.root.position.set(pose.x, pose.y, pose.z);
      ship.root.rotation.set(-pose.pitch, pose.yaw, pose.roll, 'YXZ');
      ship.root.updateMatrixWorld();
      this.currentMode = state.boosting ? 'Turbo' : state.speed > 1 ? 'Aceleración' : 'Reposo';
    } else {
      if (spec.turn) {
        if (this.circle.anchored) this.circle.heading += ((values.Sentido === 'Izquierda' ? 1 : -1) * dt * speed) / values['Radio giro'];
      } else if (values['Mover nave'] && speed > 0) {
        this.route = (this.route + dt * speed) % world.landscape.length;
      }
      this.place();
      this.currentMode = spec.mode;
    }
    if (this.viewId() === 'libre') {
      this.delta.subVectors(ship.root.position, this.lastPosition);
      camera.position.add(this.delta);
      orbit.target.add(this.delta);
    }
    this.lastPosition.copy(ship.root.position);
    this.applyView(Math.min(elapsed, 0.25));
    if (!spec.manual) {
      state.speed = speed;
      state.vx = Math.sin(state.yaw) * speed;
      state.vz = Math.cos(state.yaw) * speed;
      state.drifting = Boolean(spec.drift);
      state.braking = Boolean(spec.braking);
      state.slip = spec.drift ? 0.55 : 0;
      state.boosting = values['VFX activos'] && spec.mode === 'Turbo';
      state.hull = scaleHull(ship.definition.hull, SCALE);
      state.padBoostRemaining = Math.max(0, (state.padBoostRemaining ?? 0) - dt);
      // Pads on the route would override the chosen state with their own turbo; opt in when testing them.
      if (dt > 0 && values['Activar placas']) pads.step(dt, state, previousPadPosition);
    }
    if (dt > 0 && values['Activar placas']) this.padControls.update();
    pads.update(dt, false);
    const padTurbo = state.padBoostRemaining > 0;
    state.boosting = state.boosting || padTurbo;
    await boost.update(dt, padTurbo ? 'Turbo' : this.currentMode, values['VFX activos'], padTurbo, state);
    smoke.update(dt, {state, camera, scale: SCALE, reduced: !values['VFX activos']});
    oil.update(dt, state);
    ship.pilot.update(this.time, true);
    if (orbit.enabled) orbit.update();
    this.lighting.update(state, this.time, {dt});
    boost.updatePost(comicPost);
    comicPost.heat.updatePadFields(pads.heatFields ?? []);
    comicStyle.pixelRatio.value = renderer.getPixelRatio();
    renderer.getDrawingBufferSize(comicStyle.resolution.value);
    this.comicMaterials.sync();
    comicPost.comic.value = Number(this.sceneValues['Cómic']);
    const started = performance.now();
    comicPost.render();
    this.frameMs += performance.now() - started;
    this.frames++;
    document.body.dataset.frame = String(Number(document.body.dataset.frame ?? 0) + 1);
    if (now - this.lastHud > HUD_INTERVAL_MS) this.updateHud(now, speed);
  }

  private updateHud(now: number, speed: number): void {
    const fps = (this.frames * 1000) / (now - this.lastHud || 1);
    const ms = this.frameMs / Math.max(1, this.frames);
    this.frames = 0;
    this.frameMs = 0;
    this.lastHud = now;
    const render = this.renderer.info.render;
    const info = this.info();
    const time = this.timeValues;
    this.hud.textContent = [
      `FPS ${fps.toFixed(0)} · cpu ${ms.toFixed(1)} ms`,
      `${this.backend} · draw calls ${render.drawCalls ?? render.calls ?? '-'} · tris ${Math.round((render.triangles ?? 0) / 1000)}k`,
      `Vista ${VIEWS[info.view].label} · Estado ${STATES[info.state].label}`,
      `Modo ${info.mode} · potencia ${info.power.toFixed(2)} · ${info.palette}`,
      `Velocidad ${speed.toFixed(0)} · tiempo ${this.time.toFixed(2)} s ×${time['Velocidad tiempo'].toFixed(2)}${time.Pausa ? ' · PAUSA' : ''}`,
    ].join('\n');
  }
}

Playground.start().catch((error: unknown) => {
  const message = messageOf(error);
  const status = document.querySelector('#status');
  if (status) status.textContent = `No se pudo iniciar: ${message}`;
  document.body.dataset.error = message;
  console.error(error);
});
