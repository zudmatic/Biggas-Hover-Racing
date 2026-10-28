import {WebGLRenderer} from 'three/src/renderers/WebGLRenderer.js';
import './chubee-studio.css';
import {
  ACESFilmicToneMapping,
  AlwaysStencilFunc,
  Color,
  DirectionalLight,
  HemisphereLight,
  KeepStencilOp,
  OrthographicCamera,
  ReplaceStencilOp,
  Scene,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createDialKit, createDialRoot, type DialConfig, type DialKitController, type ResolvedValues} from 'dialkit/vanilla';
import {AssetLoader} from '@/core/assets/asset-loader';
import {BluleetDrivingPose} from '@/content/characters/bluleet/bluleet-driving-pose';
import {vehicles} from '@/content/vehicles';
import {prepareVehicleModel} from '@/content/vehicles/vehicle-model';
import {createBluleet, type BluleetActor} from './shaders/capri-bluleet';
import {createPrintMaterial, createCharacterOutlines, type CharacterOutlines} from './shaders/character-finish';
import {createMiscellanySettings, createCharacterMiscellany, tickMiscellany} from './shaders/character-miscellany';
import {createRegistration, createRegistrationPass} from './shaders/cmyk-registration';
import {isMesh, isSkinnedMesh, isTexture, materialsOf} from './shaders/object-guards';

/** Pose solver built by the content domain for this rig, and the diagnostics it returns. */
type DrivingPose = BluleetDrivingPose;
type DrivingPoseStats = ReturnType<DrivingPose['apply']>;

const STUDIO_DIALS = {
  Acabado: {
    'Tinta personaje': true,
    'Tinta auto': false,
    Contorno: true,
    'Recorte amarillo': true,
    'Grosor contorno': [0.8, 0.1, 2, 0.1],
    CMYK: [1, 0, 8, 0.5],
    Movimiento: true,
  },
  Piloto: {
    _collapsed: true,
    Altura: [2.8, 2, 3, 0.05],
    'Altura asiento': [1.225, 0.75, 1.4, 0.025],
    'Posición asiento': [-0.1, -0.4, 0.3, 0.025],
    Inclinación: [7, 0, 35, 1],
    'Altura manos': [1.35, 0.9, 1.9, 0.025],
    'Posición manos': [0.625, 0.2, 1, 0.025],
  },
  Escena: {
    _collapsed: true,
    Fondo: '#e7e7e4',
    Resolución: [900, 360, 1080, 60],
    Frente: {type: 'action'},
    Costado: {type: 'action'},
    Perspectiva: {type: 'action'},
    Capturar: {type: 'action'},
    'Volver al hangar': {type: 'action'},
  },
} satisfies DialConfig;
type StudioDials = typeof STUDIO_DIALS;
type StudioValues = ResolvedValues<StudioDials>;

/** Read-only diagnostics for pose and shader integration tests (`window.__bluleetStudio`). */
export interface BluleetStudioDiagnostics {
  readonly ready: boolean;
  readonly pose: DrivingPoseStats | undefined;
  readonly actor: BluleetActor | undefined;
  readonly car: Object3D | undefined;
  readonly renderer: WebGLRenderer;
  readonly controls: DialKitController<StudioDials>;
}

declare global {
  interface Window {
    __bluleetStudio?: BluleetStudioDiagnostics;
  }
}

function requireElement<E extends Element>(selector: string): E {
  const element = document.querySelector<E>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

// Stencil ref 1 marks the kart, like the character, so outlines and miscellany only draw outside both.
const STENCIL_MARK = {
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: AlwaysStencilFunc,
  stencilFail: KeepStencilOp,
  stencilZFail: KeepStencilOp,
  stencilZPass: ReplaceStencilOp,
};

/** Isolated WebGL studio: Bluleet seated in the hover kart with the original Chubee ink shaders. */
class ChubeeStudio {
  readonly renderer: WebGLRenderer;
  readonly controls: DialKitController<StudioDials>;
  private readonly scene = new Scene();
  private readonly background = new Color('#e7e7e4');
  private readonly camera = new OrthographicCamera(-5, 5, 4, -4, 0.1, 100);
  private readonly orbit: OrbitControls;
  private readonly ink = {value: 1};
  private readonly carInk = {value: 1};
  private readonly misc = createMiscellanySettings();
  private readonly registration = createRegistration();
  private readonly pass: ReturnType<typeof createRegistrationPass>;
  private actor: BluleetActor | undefined;
  private car: Object3D | undefined;
  private carOutline: CharacterOutlines | undefined;
  private pose: DrivingPose | undefined;
  private poseStats: DrivingPoseStats | undefined;
  private ready = false;
  private moving = true;
  private retro = 900;
  private last = performance.now();
  private disposed = false;
  private readonly onResize = (): void => this.resize();

  /** Builds the studio, loads both models and starts rendering. */
  static async start(): Promise<ChubeeStudio> {
    const studio = new ChubeeStudio(requireElement<HTMLCanvasElement>('#scene'), requireElement<HTMLElement>('#status'));
    await studio.load();
    studio.renderer.setAnimationLoop((now) => studio.tick(now));
    window.__bluleetStudio = studio.diagnostics();
    addEventListener('pagehide', () => studio.dispose(), {once: true});
    return studio;
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly status: HTMLElement,
  ) {
    // Chubee's onBeforeCompile ink/stencil shaders require the original WebGL renderer.
    // This isolated studio does not replace the racing game's WebGPU renderer.
    this.renderer = new WebGLRenderer({canvas, antialias: true, stencil: true, preserveDrawingBuffer: true});
    AssetLoader.shared.configure(this.renderer);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.scene.background = this.background;
    this.scene.add(new HemisphereLight(0xffffff, 0x767184, 2));
    const key = new DirectionalLight(0xffe9d5, 3);
    key.position.set(-3, 6, 5);
    this.scene.add(key);
    const fill = new DirectionalLight(0xb0c8ff, 2);
    fill.position.set(4, 3, -2);
    this.scene.add(fill);
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.pass = createRegistrationPass(this.renderer, this.registration);
    this.misc.uStrokeDensity.value = 0.25;
    this.misc.uStrokeLength.value = 1.3;
    this.resetView();
    this.resize();
    addEventListener('resize', this.onResize);
    this.controls = createDialKit('Bluleet · Hover Kart', STUDIO_DIALS, {
      id: 'bluleet-kart-shader-studio-v5',
      persist: true,
      onAction: (path) => this.onAction(path),
    });
    createDialRoot();
    this.controls.subscribe((values) => this.apply(values));
  }

  private resetView(): void {
    this.camera.position.set(6, 4.7, 8);
    this.orbit.target.set(0.65, 1.5, 0);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.orbit.update();
  }

  private resize(): void {
    const h = 7,
      w = (h * innerWidth) / innerHeight;
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.retro / innerHeight));
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  private onAction(path: string): void {
    if (path === 'Escena.Perspectiva') this.resetView();
    if (path === 'Escena.Frente' || path === 'Escena.Costado') {
      const front = path === 'Escena.Frente';
      this.camera.position.set(front ? 0 : 9, 2.3, front ? 10 : 0);
      this.orbit.target.set(0, 1.7, 0);
      this.orbit.update();
    }
    if (path === 'Escena.Volver al hangar') location.href = `${import.meta.env.BASE_URL}spaceship.html?vehicle=bluleet`;
    if (path === 'Escena.Capturar') {
      this.render(0);
      const a = document.createElement('a');
      a.download = 'bluleet-hover-tinta.png';
      a.href = this.canvas.toDataURL();
      a.click();
    }
  }

  private apply(v: StudioValues): void {
    this.ink.value = Number(v.Acabado['Tinta personaje']);
    this.carInk.value = Number(v.Acabado['Tinta auto']);
    this.moving = v.Acabado.Movimiento;
    this.actor?.outlines.set(v.Acabado.Contorno ? 2 : 0, 1, 1, v.Acabado['Grosor contorno']);
    this.carOutline?.set(v.Acabado.Contorno && v.Acabado['Tinta auto'] ? 1 : 0, 0.25, 0.3, v.Acabado['Grosor contorno'] * 0.5);
    this.misc.uCutOn.value = Number(v.Acabado['Recorte amarillo']);
    this.registration.uRegAmount.value = v.Acabado.CMYK;
    this.misc.uStrokeDensity.value = v.Acabado.Contorno ? 0.25 : 0;
    this.background.set(v.Escena.Fondo);
    this.retro = v.Escena.Resolución;
    this.resize();
    if (this.pose) {
      const p = v.Piloto;
      this.poseStats = this.pose.apply({
        height: p.Altura,
        seatY: p['Altura asiento'],
        seatZ: p['Posición asiento'],
        lean: (p.Inclinación * Math.PI) / 180,
        gripY: p['Altura manos'],
        gripZ: p['Posición manos'],
      });
    }
  }

  private async load(): Promise<void> {
    try {
      const assets = AssetLoader.shared;
      const [pilot, vehicle] = await Promise.all([
        assets.gltf('models/bluleet/bluleet-motionlab-dedos.glb'),
        assets.gltf(vehicles.require('bluleet').model),
      ]);
      const actor = createBluleet(pilot, this.ink);
      this.actor = actor;
      actor.state.uSkin.value.set('#2145ec');
      actor.state.uSkinMix.value = 1;
      actor.state.uTextureLevels.value = 5;
      actor.state.uEyeWhite.value.setRGB(0.96, 0.96, 0.96);
      actor.state.uEyeInk.value.setRGB(0.005, 0.005, 0.005);
      this.pose = new BluleetDrivingPose(actor);
      this.scene.add(actor.root);
      createCharacterMiscellany(actor.root, this.misc, (o) => isSkinnedMesh(o) && o.name === 'Bluleet', {seed: 21});
      const car: Object3D = prepareVehicleModel(vehicle.scene, vehicles.require('bluleet'));
      this.car = car;
      this.scene.add(car);
      const inkCar = (material: Material): Material => Object.assign(createPrintMaterial(material, this.carInk, false, true), STENCIL_MARK);
      car.traverse((o) => {
        if (!isMesh(o)) return;
        o.material = Array.isArray(o.material) ? o.material.map(inkCar) : inkCar(o.material);
      });
      this.carOutline = createCharacterOutlines(car, isMesh);
      this.apply(this.controls.values);
      this.ready = true;
      this.status.hidden = true;
      document.body.dataset.ready = 'true';
    } catch (error) {
      this.status.textContent = 'No se pudo preparar el estudio. Recargá para volver a intentar.';
      this.status.setAttribute('role', 'alert');
      console.error(error);
    }
  }

  private tick(now: number): void {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (!this.disposed && !document.hidden) this.render(dt);
  }

  render(dt: number): void {
    const {actor, carOutline} = this;
    if (!this.ready || !actor || !carOutline) return;
    const {width, height} = this.canvas;
    const step = this.moving ? dt : 0;
    actor.update(dt, this.moving, 0);
    actor.outlines.update(step, width, height);
    carOutline.update(step, width, height);
    tickMiscellany(this.misc, step, width, height);
    this.registration.uRegTick.value = Math.floor(this.misc.uMiscTime.value * 8);
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
    this.pass.render();
    this.canvas.dataset.frame = String(Number(this.canvas.dataset.frame ?? 0) + 1);
  }

  private diagnostics(): BluleetStudioDiagnostics {
    const studio = this;
    return {
      get ready() {
        return studio.ready;
      },
      get pose() {
        return studio.poseStats;
      },
      get actor() {
        return studio.actor;
      },
      get car() {
        return studio.car;
      },
      get renderer() {
        return studio.renderer;
      },
      get controls() {
        return studio.controls;
      },
    };
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    removeEventListener('resize', this.onResize);
    this.orbit.dispose();
    const geometry = new Set<BufferGeometry>(),
      materials = new Set<Material>(),
      textures = new Set<Texture>();
    this.scene.traverse((o) => {
      if (!isMesh(o)) return;
      geometry.add(o.geometry);
      for (const material of materialsOf(o)) {
        materials.add(material);
        const values: unknown[] = Object.values(material);
        for (const value of values) if (isTexture(value)) textures.add(value);
      }
    });
    geometry.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.pass.dispose();
    this.renderer.dispose();
  }
}

await ChubeeStudio.start();
