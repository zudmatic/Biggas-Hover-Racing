import {positionLocal} from 'three/tsl';
import type {Node} from 'three/webgpu';
import {VehicleLivery} from '@/content/vehicles/vehicle-livery';
import {shipLivery, shipLiveryChoice} from '@/content/vehicles/zudoneta-037/liveries';
import {createExhaustEngine} from '@/fx/exhaust/engines';
import type {ExhaustEngine} from '@/fx/exhaust/exhaust-engine';
import {LensUniforms} from '@/fx/singularity/singularity-lens';
import '@/ui/renderer-navigation';
import {
  ACESFilmicToneMapping,
  Box3,
  Clock,
  Color,
  Group,
  MathUtils,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  type AnimationClip,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {WebGPURenderer} from 'three/webgpu';
import {AssetLoader} from '@/core/assets/asset-loader';
import {DisposableGroup} from '@/core/disposable';
import {vehicles, type VehicleDefinition, type VehiclePart} from '@/content/vehicles';
import {flightPose, FLIGHT_DURATION} from '@/content/vehicles/parts';
import {ShipCloth} from '@/content/vehicles/ship-cloth';
import {seatPilot} from '@/content/vehicles/ship-pilot';
import {findCanopy, prepareVehicleModel} from '@/content/vehicles/vehicle-model';
import {pilotChoice, pilotQuery} from '@/content/characters/selection';
import {characters} from '@/content/characters';
import {GameRenderer} from '@/render/game-renderer';
import {ComicView} from '@/render/comic-view';
import {LomiPlasma} from '@/fx/lomi/lomi-plasma';
import {IDLE_STATE, loadEnergyTextures, type EnergyTextures} from '@/fx/lomi/lomi-energy';
import {HANGAR_VIEWS, hangarMarkup, type HangarViewName} from './hangar-markup';
import {HangarStage} from './hangar-stage';
import './hangar.css';

// The hangar only needs the pilot selection and seated actor contract.

interface HangarPilotChoice {
  pilot: string;
  palette: string;
  hat: string;
}

interface HangarPilot {
  root: Object3D;
  update(time: number, animate?: boolean): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------

type Vec3 = readonly [number, number, number];

/** Materials the highlight can tint. Unlit graphic surfaces (the Bulldog's eyes) have no emission. */
interface EmissiveMaterial extends Material {
  emissive: Color;
  emissiveIntensity: number;
}

/** A ship mesh with what the hangar remembers about it. */
interface HangarMesh {
  mesh: Mesh<BufferGeometry, Material>;
  system: string;
  emissive: {material: EmissiveMaterial; color: Color; intensity: number} | null;
  /** Rest position, for split parts that slide apart sideways. */
  rest: Vector3;
  /** Which side of the ship's centre line the mesh sits on. */
  side: 1 | -1;
}

interface PartLabel {
  part: VehiclePart;
  element: HTMLElement;
  anchor: Vector3;
}

interface ViewTween {
  from: Vector3;
  to: Vector3;
  target: Vector3;
  elapsed: number;
}

const VIEW_POSITIONS: Record<HangarViewName, Vec3> = {
  perspective: [6.4, 4.7, 7.6],
  front: [0, 3, 10],
  side: [10, 3, 0],
  back: [4, 3.2, -9],
  top: [0.01, 11, 0.01],
};
/** Looking down into the cockpit, for the canopy and pilot toggles. */
const COCKPIT_VIEW: Vec3 = [4.9, 7.4, 7.4];
const INITIAL_TARGET = new Vector3(0, 1.35, 0);
const HIGHLIGHT = new Color(0xd6632e);
const BACKGROUND = '#e8e9e2';
const VIEW_TWEEN_SECONDS = 0.28;
const LOST_MESSAGE = 'Se interrumpió la vista 3D. Recargá el hangar para continuar.';

const isMesh = (object: Object3D): object is Mesh => (object as Mesh).isMesh === true;
const isEmissive = (material: Material): material is EmissiveMaterial => Boolean((material as Partial<EmissiveMaterial>).emissive);
const systemOf = (object: Object3D): string | null => (typeof object.userData.system === 'string' ? object.userData.system : null);
const isViewName = (value: string | undefined): value is HangarViewName => HANGAR_VIEWS.some(([view]) => view === value);

function element<T extends Element>(root: ParentNode, selector: string, type: abstract new () => T): T {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`Hangar: falta ${selector}.`);
  return found;
}

/** The hangar's DOM: markup, the controls the viewer drives, and the failure overlay. */
class HangarPage {
  readonly app: HTMLElement;
  readonly viewport: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly loader: HTMLElement;
  readonly specs: HTMLElement;
  readonly phaseLabel: HTMLElement;
  readonly description: HTMLElement;
  readonly simulatorLink: HTMLAnchorElement;
  readonly playButton: HTMLButtonElement;
  readonly playStatus: HTMLElement;
  readonly timeInput: HTMLInputElement;
  readonly timeLabel: HTMLElement;
  readonly speedSelect: HTMLSelectElement;
  readonly loopButton: HTMLButtonElement;
  readonly rotateButton: HTMLButtonElement;
  readonly resetButton: HTMLButtonElement;
  readonly canopyInput: HTMLInputElement;
  readonly hideCanopyInput: HTMLInputElement;
  readonly pilotInput: HTMLInputElement;
  readonly explodeInput: HTMLInputElement;
  readonly labelsInput: HTMLInputElement;
  readonly comicButton: HTMLButtonElement;
  /** Parts list buttons and their 3D hotspots. */
  readonly partButtons: HTMLButtonElement[];
  readonly viewButtons: HTMLButtonElement[];
  /** Keyboard users jump straight to views instead of watching tweens. */
  keyboardInput = false;

  constructor() {
    const body = document.body;
    this.app = element(body, '.ship-app', HTMLElement);
    this.viewport = element(body, '.ship-viewport', HTMLElement);
    this.canvas = element(body, '.ship-canvas', HTMLCanvasElement);
    this.loader = element(body, '.ship-loader', HTMLElement);
    this.specs = element(body, '.ship-stage-specs p', HTMLElement);
    this.phaseLabel = element(body, '#ship-phase', HTMLElement);
    this.description = element(body, '#ship-description', HTMLElement);
    this.simulatorLink = element(body, '.ship-simulator', HTMLAnchorElement);
    this.playButton = element(body, '#ship-play', HTMLButtonElement);
    this.playStatus = element(body, '#ship-play-status', HTMLElement);
    this.timeInput = element(body, '#ship-time', HTMLInputElement);
    this.timeLabel = element(body, '#ship-time-label', HTMLElement);
    this.speedSelect = element(body, '#ship-speed', HTMLSelectElement);
    this.loopButton = element(body, '#ship-loop', HTMLButtonElement);
    this.rotateButton = element(body, '#ship-rotate', HTMLButtonElement);
    this.resetButton = element(body, '#ship-reset', HTMLButtonElement);
    this.canopyInput = element(body, '#ship-canopy', HTMLInputElement);
    this.hideCanopyInput = element(body, '#ship-hide-canopy', HTMLInputElement);
    this.pilotInput = element(body, '#ship-pilot', HTMLInputElement);
    this.explodeInput = element(body, '#ship-explode', HTMLInputElement);
    this.labelsInput = element(body, '#ship-label-toggle', HTMLInputElement);
    this.comicButton = element(body, '#ship-comic', HTMLButtonElement);
    this.partButtons = [...body.querySelectorAll<HTMLButtonElement>('[data-part],[data-hotspot]')];
    this.viewButtons = [...body.querySelectorAll<HTMLButtonElement>('[data-ship-view]')];
    document.addEventListener(
      'pointerdown',
      () => {
        this.keyboardInput = false;
      },
      true,
    );
    document.addEventListener(
      'keydown',
      () => {
        this.keyboardInput = true;
      },
      true,
    );
  }

  hotspot(partId: string): HTMLElement {
    return element(this.viewport, `[data-hotspot="${partId}"]`, HTMLElement);
  }

  /** Replaces the loader with an error message and a reload button. */
  fail(message: string): void {
    const {loader} = this;
    loader.hidden = false;
    loader.replaceChildren();
    const text = document.createElement('p');
    text.textContent = message;
    const button = document.createElement('button');
    button.textContent = 'Reintentar';
    button.onclick = () => location.reload();
    loader.append(text, button);
  }

  /** Enables every control once the ship is ready. */
  enableControls(): void {
    for (const control of this.app.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('[disabled]'))
      control.disabled = false;
  }
}

/** Renderer, camera and the empty ship rig, built before the GLB arrives. */
interface HangarViewer {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  stage: HangarStage;
  ship: Group;
  /** One group per inspectable system (part id), children of `ship`. */
  systems: Map<string, Group>;
}

interface HangarAssets {
  model: Object3D;
  pilot: HangarPilot;
  energy: EnergyTextures | null;
}

interface HangarContext {
  page: HangarPage;
  ship: VehicleDefinition;
  choice: HangarPilotChoice;
  pilotParams: string;
  base: string;
  reducedMotion: MediaQueryList;
}

/**
 * Interactive ship inspection (`?view=spaceship` and spaceship.html): orbit the ship, identify parts,
 * explode it, open the canopy, seat the pilot and scrub through the 18-second flight sequence.
 */
export class Hangar {
  private readonly page: HangarPage;
  private readonly config: VehicleDefinition;
  private readonly parts: readonly VehiclePart[];
  private readonly reducedMotion: MediaQueryList;
  private readonly renderer: WebGPURenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly stage: HangarStage;
  private readonly ship: Group;
  private readonly systems: Map<string, Group>;
  private readonly pilot: HangarPilot;
  private readonly comic: ComicView;
  private readonly canopy: Object3D | null;
  private readonly canopyRest: Vector3 | null;
  private readonly canopyMeshes = new Set<Object3D>();
  private readonly meshes: HangarMesh[] = [];
  private readonly pilotMeshes: Object3D[] = [];
  private readonly plasma: LomiPlasma | null = null;
  private readonly cloth: ShipCloth[];
  private readonly livery: VehicleLivery;
  private selectedLivery: string;
  private readonly lens: LensUniforms | null;
  private readonly anchors: Object3D[] = [];
  private propulsion: ExhaustEngine | null = null;
  private propulsionSeek = true;
  private propulsionActive = false;
  private readonly labels: PartLabel[];
  private readonly splitMeshes = new Map<string, HangarMesh[]>();
  private readonly showPilot: boolean;
  private readonly initialComic: boolean;
  private readonly simulatorBase: string;
  private readonly listeners = new DisposableGroup();
  private readonly sizeObserver: ResizeObserver;
  private readonly clock = new Clock();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly projected = new Vector3();
  /** Screen positions of the labels placed this frame, as x, y pairs. */
  private readonly occupied: Float64Array;

  private comicEnabled: boolean;
  private selected: string | null = null;
  private elapsed = 0;
  private playing = false;
  private loop = false;
  private speed = 1;
  private explode = 0;
  private open = 0;
  private idleTime = 0;
  private cameraLift = 0;
  private viewTween: ViewTween | null = null;
  private down: {x: number; y: number} | null = null;
  private lastPhase = '';
  private rendering = false;
  private disposed = false;
  private renderTask: Promise<void> = Promise.resolve();

  /** Builds the page, loads the ship and pilot, and starts rendering. Resolves to null if the hangar could not start. */
  static async mount(): Promise<Hangar | null> {
    const query = new URLSearchParams(location.search);
    const config = vehicles.resolve(query.get('vehicle'));
    const choice: HangarPilotChoice = pilotChoice();
    const selectedLivery = shipLiveryChoice(query);
    const pilotParams = `${pilotQuery(choice)}&livery=${selectedLivery}`;
    const base = import.meta.env.BASE_URL;
    document.title = `${config.id} · ${config.title}`;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    document.body.innerHTML = hangarMarkup({
      base,
      ship: {
        id: config.id,
        name: config.name,
        title: config.title,
        file: config.model.slice(config.model.lastIndexOf('/') + 1),
        windshield: config.canopy?.kind === 'windshield',
        paint: !!config.paint,
      },
      parts: config.hangar.parts,
      ships: vehicles.list(),
      pilotParams,
      hat: choice.hat,
      livery: selectedLivery,
      pilotName: characters.resolve(choice.pilot).name,
      downloadUrl: `${base}${config.model}`,
    });
    const page = new HangarPage();
    const context: HangarContext = {page, ship: config, choice, pilotParams, base, reducedMotion};

    let renderer: WebGPURenderer;
    try {
      renderer = (await GameRenderer.create(page.canvas, {alpha: true})).renderer;
      page.viewport.dataset.backend = page.canvas.dataset.backend;
    } catch {
      page.fail('No pudimos iniciar el visor 3D. Probá con un navegador con aceleración gráfica habilitada.');
      return null;
    }
    const viewer = Hangar.createViewer(renderer, context);
    const assets = await Hangar.loadAssets(viewer, context);
    if (!assets) {
      renderer.dispose();
      return null;
    }
    const hangar = new Hangar(context, viewer, assets);
    try {
      await hangar.start();
      return hangar;
    } catch (error) {
      console.error(error);
      page.fail('No se pudo iniciar el motor de la nave. Intentá de nuevo.');
      hangar.dispose();
      return null;
    }
  }

  private static createViewer(renderer: WebGPURenderer, {page, ship: config, reducedMotion}: HangarContext): HangarViewer {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new Scene();
    const camera = new PerspectiveCamera(36, 1, 0.1, 100);
    const controls = new OrbitControls(camera, page.canvas);
    controls.enableDamping = !reducedMotion.matches;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.enablePan = false;
    controls.autoRotateSpeed = 0.55;
    const stage = new HangarStage(renderer, scene);
    const ship = new Group();
    scene.add(ship);
    const systems = new Map<string, Group>();
    for (const part of config.hangar.parts) {
      const group = new Group();
      group.name = part.id;
      ship.add(group);
      systems.set(part.id, group);
    }
    return {renderer, scene, camera, controls, stage, ship, systems};
  }

  /** Ship GLB, then its pilot (which may take over a rig baked into the GLB). Shows the error and resolves null on failure. */
  private static async loadAssets(
    {renderer}: HangarViewer,
    {page, ship: config, choice, base}: HangarContext,
  ): Promise<HangarAssets | null> {
    let model: Object3D;
    let animations: AnimationClip[];
    try {
      const loader = AssetLoader.shared;
      loader.configure(renderer);
      ({scene: model, animations} = await loader.gltf(config.model));
    } catch {
      page.fail('No se pudo cargar la nave. Comprobá la conexión e intentá de nuevo.');
      return null;
    }
    prepareVehicleModel(model, config);
    let pilot: HangarPilot;
    try {
      pilot = await seatPilot(model, animations, config, {character: choice.pilot, palette: choice.palette, hat: choice.hat});
    } catch {
      page.fail('No se pudo cargar el piloto. Intentá de nuevo.');
      return null;
    }
    const energy = config.engine.kind === 'singularity' ? await loadEnergyTextures(base) : null;
    return {model, pilot, energy};
  }

  private constructor(context: HangarContext, viewer: HangarViewer, {model, pilot, energy}: HangarAssets) {
    const {page, ship: config, choice, base, reducedMotion} = context;
    this.page = page;
    this.config = config;
    this.parts = config.hangar.parts;
    this.reducedMotion = reducedMotion;
    ({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      controls: this.controls,
      stage: this.stage,
      ship: this.ship,
      systems: this.systems,
    } = viewer);
    this.pilot = pilot;

    const dimensions = new Box3().setFromObject(model).getSize(new Vector3());
    page.specs.textContent = `${[dimensions.x, dimensions.y, dimensions.z].map((value) => value.toFixed(2).replace('.', ',')).join(' × ')} u.`;

    this.canopy = findCanopy(model, config);
    this.canopy?.traverse((object) => {
      if (isMesh(object)) this.canopyMeshes.add(object);
    });
    this.collectMeshes(model);
    if (this.canopy) this.system('cockpit').attach(this.canopy);
    this.livery = new VehicleLivery(this.ship, config.paint);
    this.selectedLivery = shipLiveryChoice();
    page.viewport.dataset.livery = this.livery.set(this.selectedLivery);
    for (const item of this.meshes) item.rest = item.mesh.position.clone();

    if (energy) this.plasma = this.createPlasma(model, energy);
    this.cloth = this.meshes
      .filter(({mesh}) => config.cloth?.meshes.test(mesh.name))
      .map(({mesh}) => new ShipCloth(mesh, {toShip: mesh.matrixWorld.clone()}));
    this.canopyRest = this.canopy?.position.clone() ?? null;

    this.system('cockpit').add(pilot.root);
    this.showPilot = choice.pilot === 'bluleet';
    const query = new URLSearchParams(location.search);
    this.initialComic = query.has('comic') ? query.get('comic') !== '0' : !this.showPilot;
    this.comicEnabled = this.initialComic;
    this.simulatorBase = `${base}?vehicle=${config.id}&${pilotQuery(choice)}`;
    pilot.root.visible = this.showPilot;
    page.pilotInput.checked = this.showPilot;
    page.comicButton.setAttribute('aria-pressed', String(this.initialComic));
    this.updateSimulatorLink();
    pilot.root.traverse((object) => {
      if (isMesh(object)) this.pilotMeshes.push(object);
    });
    this.lens = config.engine.kind === 'singularity' ? new LensUniforms() : null;
    this.comic = new ComicView(this.renderer, this.scene, this.camera, {lens: this.lens});

    this.bindControls();
    this.sizeObserver = new ResizeObserver(() => this.resize());
    this.sizeObserver.observe(page.viewport);
    this.camera.position.copy(this.viewDestination(VIEW_POSITIONS.perspective));
    this.controls.target.copy(INITIAL_TARGET);
    this.controls.update();

    this.labels = this.parts.map((part) => ({part, element: page.hotspot(part.id), anchor: new Vector3().fromArray(part.anchor)}));
    this.occupied = new Float64Array(this.labels.length * 2);
    for (const part of this.parts) {
      if (part.split)
        this.splitMeshes.set(
          part.id,
          this.meshes.filter((item) => item.system === part.id),
        );
    }

    page.enableControls();
    if (!this.canopy) {
      for (const input of [page.canopyInput, page.hideCanopyInput]) {
        const label = input.closest('label');
        if (label) label.hidden = true;
      }
    }
    this.syncCanopyControls();
    page.viewport.dataset.meshCount = String(this.meshes.length);
    this.updateTransport();
    for (const type of ['webglcontextlost', 'graphicslost']) {
      this.listeners.listen(page.canvas, type, (event) => {
        event.preventDefault();
        this.playing = false;
        this.renderer.setAnimationLoop(null);
        page.fail(LOST_MESSAGE);
      });
    }
    this.listeners.listen(window, 'pagehide', () => this.dispose(), {once: true});
  }

  /** Stops rendering and releases GPU resources once the in-flight frame settles. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.sizeObserver.disconnect();
    this.controls.dispose();
    this.listeners.dispose();
    void this.renderTask.finally(() => {
      this.propulsion?.dispose();
      this.comic.dispose();
      this.livery.dispose();
      this.plasma?.dispose();
      this.pilot.dispose();
      this.stage.dispose();
      this.renderer.dispose();
    });
  }

  // --- Setup ---------------------------------------------------------------------------------

  private system(id: string): Group {
    const group = this.systems.get(id);
    if (!group) throw new Error(`Hangar: sistema desconocido ${id}.`);
    return group;
  }

  /** Classifies every ship mesh into its system group and gives it its own material for highlighting. */
  private collectMeshes(model: Object3D): void {
    const found: Mesh<BufferGeometry, Material>[] = [];
    // GLTFLoader builds one mesh per primitive, each with a single material.
    model.traverse((object) => {
      if (isMesh(object)) found.push(object as Mesh<BufferGeometry, Material>);
    });
    for (const mesh of found) {
      const inCanopy = this.canopyMeshes.has(mesh);
      const system = this.config.hangar.classify(mesh.name, inCanopy);
      mesh.userData.system = system;
      const material = mesh.material.clone() as Material & {positionNode?: Node};
      // Three r182 otherwise reuses stale per-object transforms after an exploded view.
      material.positionNode ??= positionLocal;
      mesh.material = material;
      const emissive = isEmissive(material) ? {material, color: material.emissive.clone(), intensity: material.emissiveIntensity} : null;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (!inCanopy) this.system(system).attach(mesh);
      const side = new Box3().setFromObject(mesh).getCenter(new Vector3()).x < 0 ? -1 : 1;
      this.meshes.push({mesh, system, emissive, rest: mesh.position.clone(), side});
    }
  }

  /** Lomi's singularity engine: crystals and nozzles tagged in the GLB drive the plasma. */
  private createPlasma(model: Object3D, textures: EnergyTextures): LomiPlasma {
    const anchors: Object3D[] = [];
    model.traverse((object) => {
      if (!isMesh(object) && object.userData.shader === 'lomi_ship_thrust') anchors.push(object);
    });
    for (const anchor of anchors) this.system('engines').attach(anchor);
    this.anchors.push(...anchors);
    const tagged = (shader: string): Mesh[] => this.meshes.filter(({mesh}) => mesh.userData.shader === shader).map(({mesh}) => mesh);
    return new LomiPlasma(this.ship, {
      crystals: tagged('lomi_ship_crystal'),
      exhausts: anchors,
      nozzles: tagged('lomi_ship_thrust'),
      scale: this.config.transform?.scale ?? 1,
      textures,
    });
  }

  private async start(): Promise<void> {
    this.propulsion = await createExhaustEngine(this.config.engine.kind, this.renderer, this.scene, {
      root: this.system('engines'), definition: this.config, anchors: this.anchors, plasma: this.plasma,
    }, {camera: this.camera, lens: this.lens});
    this.page.viewport.dataset.engine = this.config.engine.kind;
    this.renderer.setAnimationLoop(this.frame);
  }

  private bindControls(): void {
    const {page, controls, listeners} = this;
    for (const button of page.partButtons) {
      listeners.listen(button, 'click', () => this.selectPart(button.dataset.part ?? button.dataset.hotspot ?? null));
    }
    for (const button of page.viewButtons) {
      listeners.listen(button, 'click', () => {
        const view = button.dataset.shipView;
        if (isViewName(view)) this.goToView(VIEW_POSITIONS[view], view);
      });
    }
    for (const button of page.app.querySelectorAll<HTMLButtonElement>('button[data-livery]')) {
      listeners.listen(button, 'click', () => {
        this.selectedLivery = this.livery.set(button.dataset.livery);
        page.viewport.dataset.livery = this.selectedLivery;
        page.app.querySelector<HTMLElement>('.ship-livery-name')!.textContent = shipLivery(this.selectedLivery).name;
        for (const item of page.app.querySelectorAll<HTMLButtonElement>('button[data-livery]')) {
          item.setAttribute('aria-pressed', String(item.dataset.livery === this.selectedLivery));
        }
        const url = new URL(location.href);
        url.searchParams.set('livery', this.selectedLivery);
        history.replaceState(null, '', url);
        for (const link of page.app.querySelectorAll<HTMLAnchorElement>('.ship-back,.ship-picker a,.ship-simulator')) {
          const target = new URL(link.href);
          target.searchParams.set('livery', this.selectedLivery);
          link.href = target.href;
        }
      });
    }
    listeners.listen(page.playButton, 'click', () => this.togglePlay());
    listeners.listen(page.resetButton, 'click', () => this.reset());
    listeners.listen(page.timeInput, 'input', () => {
      this.playing = false;
      this.elapsed = Number(page.timeInput.value);
      this.propulsionSeek = true;
      page.canopyInput.checked = false;
      page.explodeInput.checked = false;
      this.updateTransport();
    });
    listeners.listen(page.speedSelect, 'change', () => {
      this.speed = Number(page.speedSelect.value);
    });
    listeners.listen(page.loopButton, 'click', () => {
      this.loop = !this.loop;
      page.loopButton.setAttribute('aria-pressed', String(this.loop));
    });
    listeners.listen(page.rotateButton, 'click', () => {
      this.viewTween = null;
      controls.autoRotate = !controls.autoRotate;
      page.rotateButton.setAttribute('aria-pressed', String(controls.autoRotate));
    });
    for (const input of [page.canopyInput, page.explodeInput]) {
      listeners.listen(input, 'change', () => {
        this.stopFlight();
        if (input === page.canopyInput && page.canopyInput.checked) this.goToView(COCKPIT_VIEW);
      });
    }
    listeners.listen(page.hideCanopyInput, 'change', () => this.syncCanopyControls());
    listeners.listen(page.pilotInput, 'change', () => {
      this.pilot.root.visible = page.pilotInput.checked;
      if (page.pilotInput.checked) {
        this.goToView(COCKPIT_VIEW);
      }
      this.syncCanopyControls();
    });
    listeners.listen(page.comicButton, 'click', () => {
      this.comicEnabled = !this.comicEnabled;
      page.comicButton.setAttribute('aria-pressed', String(this.comicEnabled));
      this.updateSimulatorLink();
    });
    listeners.listen(this.reducedMotion, 'change', () => {
      this.propulsionSeek = true;
      controls.enableDamping = !this.reducedMotion.matches;
      if (!this.reducedMotion.matches) return;
      this.playing = false;
      this.loop = false;
      this.viewTween = null;
      controls.autoRotate = false;
      page.loopButton.setAttribute('aria-pressed', 'false');
      page.rotateButton.setAttribute('aria-pressed', 'false');
      this.updateTransport();
    });
    listeners.listen(page.canvas, 'pointerdown', (event) => {
      this.down = event.isPrimary ? {x: event.clientX, y: event.clientY} : null;
    });
    listeners.listen(page.canvas, 'pointerup', (event) => this.pick(event));
    listeners.listen(page.canvas, 'pointercancel', () => {
      this.down = null;
    });
    const onControlStart = (): void => {
      this.viewTween = null;
      for (const button of page.viewButtons) button.setAttribute('aria-pressed', 'false');
    };
    controls.addEventListener('start', onControlStart);
    listeners.add(() => controls.removeEventListener('start', onControlStart));
    listeners.listen(document, 'keydown', (event) => {
      const tag = event.target instanceof Element ? event.target.tagName : '';
      if (event.code === 'Space' && !/INPUT|SELECT|BUTTON|A|TEXTAREA/.test(tag)) {
        event.preventDefault();
        this.togglePlay();
      }
      if (event.key === 'Escape') this.selectPart(null, {focus: false});
    });
  }

  // --- Interaction ---------------------------------------------------------------------------

  /** Portrait viewports step the camera back a little. */
  private responsiveDistance(): number {
    const {viewport} = this.page;
    return viewport.clientWidth / viewport.clientHeight < 1 ? 1.2 : 1;
  }

  private viewDestination(position: Vec3): Vector3 {
    return new Vector3(...position).sub(INITIAL_TARGET).multiplyScalar(this.responsiveDistance()).add(INITIAL_TARGET);
  }

  private goToView(position: Vec3, viewName: HangarViewName | null = null): void {
    const {camera, controls, page} = this;
    const destination = this.viewDestination(position);
    if (this.reducedMotion.matches || page.keyboardInput) {
      camera.position.copy(destination);
      controls.target.copy(INITIAL_TARGET);
      camera.position.y += this.cameraLift;
      controls.target.y += this.cameraLift;
      controls.update();
    } else {
      const lift = new Vector3(0, this.cameraLift, 0);
      this.viewTween = {from: camera.position.clone().sub(lift), to: destination, target: controls.target.clone().sub(lift), elapsed: 0};
    }
    for (const button of page.viewButtons) button.setAttribute('aria-pressed', String(button.dataset.shipView === viewName));
    controls.autoRotate = false;
    page.rotateButton.setAttribute('aria-pressed', 'false');
  }

  private selectPart(id: string | null, {focus = true}: {focus?: boolean} = {}): void {
    const {page} = this;
    this.selected = id;
    const part = this.parts.find((item) => item.id === id);
    page.viewport.dataset.selected = id ?? '';
    for (const button of page.partButtons)
      button.setAttribute('aria-pressed', String((button.dataset.part ?? button.dataset.hotspot) === id));
    page.description.textContent = part?.name ?? '';
    for (const {system, emissive} of this.meshes) {
      if (!emissive) continue;
      const active = system === id;
      emissive.material.emissive.copy(active ? HIGHLIGHT : emissive.color);
      emissive.material.emissiveIntensity = active ? 0.2 : emissive.intensity;
    }
    if (part && focus) this.goToView(part.view);
    if (id === 'cockpit') {
      page.canopyInput.checked = !!this.canopy;
      this.stopFlight();
    }
  }

  /** A click (not a drag) on the ship identifies the part under the pointer. */
  private pick(event: PointerEvent): void {
    const {down, page, canopy} = this;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
    this.down = null;
    const bounds = page.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, (-(event.clientY - bounds.top) / bounds.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const candidates: Object3D[] = this.meshes
      .filter(({mesh}) => !this.canopyMeshes.has(mesh) || canopy?.visible === true)
      .map(({mesh}) => mesh);
    if (this.pilot.root.visible) candidates.push(...this.pilotMeshes);
    const hit = this.raycaster.intersectObjects(candidates, false)[0];
    if (hit) this.selectPart(systemOf(hit.object), {focus: false});
  }

  private updateTransport(): void {
    const {page, playing, elapsed} = this;
    page.playButton.textContent = playing ? 'Ⅱ' : '▶';
    page.playButton.setAttribute(
      'aria-label',
      playing ? 'Pausar vuelo' : elapsed >= FLIGHT_DURATION ? 'Repetir secuencia de vuelo' : 'Iniciar vuelo',
    );
    page.playStatus.textContent = playing ? 'EN CURSO' : elapsed > 0 && elapsed < FLIGHT_DURATION ? 'EN PAUSA' : '18 SEGUNDOS';
    page.viewport.dataset.playing = String(playing);
  }

  private stopFlight(): void {
    this.playing = false;
    this.elapsed = 0;
    this.propulsionSeek = true;
    this.updateTransport();
  }

  private togglePlay(): void {
    const {page} = this;
    this.playing = !this.playing;
    if (this.playing) {
      if (this.elapsed >= FLIGHT_DURATION) {
        this.elapsed = 0;
        this.propulsionSeek = true;
      }
      page.canopyInput.checked = false;
      page.explodeInput.checked = false;
    }
    this.updateTransport();
  }

  private reset(): void {
    const {page} = this;
    this.stopFlight();
    this.selectPart(null, {focus: false});
    page.hideCanopyInput.checked = false;
    page.pilotInput.checked = this.showPilot;
    this.pilot.root.visible = this.showPilot;
    this.comicEnabled = this.initialComic;
    page.comicButton.setAttribute('aria-pressed', String(this.comicEnabled));
    this.updateSimulatorLink();
    page.canopyInput.checked = false;
    this.syncCanopyControls();
    page.explodeInput.checked = false;
    page.labelsInput.checked = false;
    this.goToView(VIEW_POSITIONS.perspective, 'perspective');
  }

  private syncCanopyControls(): void {
    const {page, canopy} = this;
    const hidden = page.hideCanopyInput.checked;
    page.canopyInput.disabled = !canopy || hidden;
    page.hideCanopyInput.disabled = !canopy;
    if (canopy) canopy.visible = !hidden;
  }

  private updateSimulatorLink(): void {
    this.page.simulatorLink.href = `${this.simulatorBase}&livery=${this.selectedLivery}&comic=${this.comicEnabled ? '1' : '0'}`;
  }

  private resize(): void {
    const {viewport} = this.page;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  // --- Frame ---------------------------------------------------------------------------------

  private readonly frame = (): void => {
    if (this.rendering || this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (document.hidden) return;
    const {page, controls} = this;
    const reduced = this.reducedMotion.matches;

    if (this.playing) {
      this.elapsed += dt * this.speed;
      if (this.elapsed >= FLIGHT_DURATION) {
        if (this.loop) {
          this.elapsed %= FLIGHT_DURATION;
          this.propulsionSeek = true;
        } else {
          this.elapsed = FLIGHT_DURATION;
          this.playing = false;
          this.updateTransport();
        }
      }
    }
    const elapsed = this.elapsed;
    // Reduced motion holds each phase still instead of animating through it.
    const pose = flightPose(reduced ? (elapsed < 2 ? 0 : elapsed < 6 ? 4 : elapsed < 13 ? 9 : elapsed < 17 ? 15 : 18) : elapsed);
    if (reduced) {
      pose.roll = 0;
      pose.pitch = 0;
      pose.bob = 0;
    }
    if (!reduced && elapsed === 0) this.idleTime += dt;
    const clothTime = elapsed > 0 ? elapsed : this.idleTime;
    for (const flag of this.cloth) flag.animate(clothTime, pose.power * 28, false, reduced);

    const ease = reduced || page.keyboardInput ? 1 : 1 - Math.exp(-dt * 6);
    this.explode = MathUtils.lerp(this.explode, page.explodeInput.checked ? 1 : 0, ease);
    this.open = MathUtils.lerp(this.open, page.canopyInput.checked ? 1 : 0, ease);
    this.poseShip(pose.altitude + pose.bob, pose.roll, pose.pitch);
    if (this.pilot.root.visible) this.pilot.update(clothTime, !reduced && elapsed > 0 && elapsed < FLIGHT_DURATION);
    this.stage.update(pose.altitude);

    this.updateCamera(dt, pose.altitude);
    controls.update(dt);
    this.scene.updateMatrixWorld(true);
    this.placeLabels();

    const phase = page.explodeInput.checked
      ? 'VISTA DESARMADA'
      : elapsed > 0
        ? pose.phase.toUpperCase()
        : page.hideCanopyInput.checked
          ? 'CABINA OCULTA'
          : page.canopyInput.checked
            ? 'CABINA ABIERTA'
            : 'EN HANGAR';
    if (phase !== this.lastPhase) {
      page.phaseLabel.textContent = phase;
      this.lastPhase = phase;
    }
    page.timeInput.value = String(elapsed);
    const timeText = `00:${String(Math.floor(elapsed)).padStart(2, '0')} / 00:18`;
    if (page.timeLabel.textContent !== timeText) page.timeLabel.textContent = timeText;
    const {dataset} = page.viewport;
    dataset.altitude = pose.altitude.toFixed(3);
    dataset.canopy = this.open.toFixed(2);
    dataset.exploded = this.explode.toFixed(2);
    dataset.canopyHidden = String(this.canopy ? !this.canopy.visible : false);
    dataset.pilot = String(this.pilot.root.visible);
    dataset.comic = String(this.comicEnabled);

    this.rendering = true;
    this.renderTask = this.renderWithEngine(dt, pose.power)
      .then(this.onRendered)
      .catch(this.onRenderError)
      .finally(this.onRenderSettled);
  };

  private readonly onRendered = (): void => {
    const {viewport, loader} = this.page;
    viewport.dataset.frame = String(Number(viewport.dataset.frame ?? 0) + 1);
    viewport.dataset.ready = 'true';
    loader.hidden = true;
  };

  private readonly onRenderError = (error: unknown): void => {
    if (this.disposed) return;
    console.error(error);
    this.renderer.setAnimationLoop(null);
    this.page.fail(LOST_MESSAGE);
  };

  private readonly onRenderSettled = (): void => {
    this.rendering = false;
  };

  /** Flight pose plus the exploded view: systems slide out along their offsets, split parts to both sides. */
  private poseShip(height: number, roll: number, pitch: number): void {
    const {ship, explode} = this;
    ship.position.y = height + explode * 0.55;
    ship.rotation.z = roll;
    ship.rotation.x = pitch;
    for (const part of this.parts) {
      const group = this.system(part.id);
      group.position.fromArray(part.offset).multiplyScalar(explode);
      if (!part.split) continue;
      group.position.x = 0;
      for (const item of this.splitMeshes.get(part.id) ?? []) item.mesh.position.x = item.rest.x + part.offset[0] * explode * item.side;
    }
    if (this.canopy && this.canopyRest) {
      this.canopy.position.copy(this.canopyRest);
      this.canopy.position.y += this.open * 0.95;
      this.canopy.position.x -= this.open * 0.75;
    }
  }

  private async renderWithEngine(dt: number, power: number): Promise<void> {
    const engine = this.propulsion!;
    const idle = this.config.engine.kind === 'singularity' && this.elapsed === 0;
    const active = !this.reducedMotion.matches && (power > 0 || idle);
    const seek = this.propulsionSeek;
    this.propulsionSeek = false;
    const clear = seek || this.propulsionActive !== active;
    this.propulsionActive = active;
    const step = active ? (seek ? 0.1 : this.playing ? dt * this.speed : idle ? dt : 0) : 0;
    if (clear) {
      engine.clear();
      await engine.update(0, 'Soltar', false);
    }
    await engine.update(step, power > 0.1 ? 'Aceleración' : 'Reposo', active, false, {
      ...IDLE_STATE, throttle: power, speed: power * 28,
    });
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    engine.updatePost(this.comic);
    this.page.viewport.dataset.enginePower = engine.stats.power.toFixed(3);
    this.page.viewport.dataset.engineParticles = String(engine.stats.emitted);
    await this.comic.render(this.comicEnabled, BACKGROUND);
  }

  /** View tweens run in lift-free space; the camera then rises with the ship and the exploded view. */
  private updateCamera(dt: number, altitude: number): void {
    const {camera, controls} = this;
    camera.position.y -= this.cameraLift;
    controls.target.y -= this.cameraLift;
    const tween = this.viewTween;
    if (tween) {
      tween.elapsed += dt;
      const t = Math.min(tween.elapsed / VIEW_TWEEN_SECONDS, 1);
      const u = t * t * (3 - 2 * t);
      camera.position.lerpVectors(tween.from, tween.to, u);
      controls.target.lerpVectors(tween.target, INITIAL_TARGET, u);
      if (t === 1) this.viewTween = null;
    }
    const lift = altitude * 0.7 + this.explode * 0.45;
    camera.position.y += lift;
    controls.target.y += lift;
    this.cameraLift = lift;
    const fieldOfView = 36 + this.explode * 12;
    if (Math.abs(camera.fov - fieldOfView) > 0.01) {
      camera.fov = fieldOfView;
      camera.updateProjectionMatrix();
    }
  }

  /** Projects each part's hotspot; hides labels that leave the safe area or would overlap one already placed. */
  private placeLabels(): void {
    const {projected, occupied, explode, camera} = this;
    const width = this.page.viewport.clientWidth;
    const height = this.page.viewport.clientHeight;
    const labelVisible = this.page.labelsInput.checked;
    let placed = 0;
    for (const {part, element: label, anchor} of this.labels) {
      projected.copy(anchor);
      if (part.split) projected.x += Math.sign(projected.x) * part.offset[0] * explode;
      this.system(part.id).localToWorld(projected);
      projected.project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      let visible = labelVisible && projected.z > -1 && projected.z < 1 && x > 16 && x < width - 16 && y > 50 && y < height - 70;
      for (let i = 0; visible && i < placed; i++) {
        if (Math.hypot(occupied[i * 2] - x, occupied[i * 2 + 1] - y) < 44) visible = false;
      }
      label.hidden = !visible;
      if (visible) {
        label.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
        occupied[placed * 2] = x;
        occupied[placed * 2 + 1] = y;
        placed++;
      }
    }
  }
}
