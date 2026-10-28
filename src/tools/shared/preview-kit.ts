// Shared building blocks of the circuit preview benches (playground and webgpu-preview):
// scene, camera rig, world + ship loading, VFX and the smoke comparison dials.
import {
  ACESFilmicToneMapping,
  Color,
  Fog,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  type Camera,
  type Object3D,
  type ShadowMapType,
  type ToneMapping,
} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {WebGPURenderer} from 'three/webgpu';
import type {DialConfig, ResolvedValues} from '@/core/debug/dials';
import type {HullShape} from '@/content/vehicles';
import {tracks} from '@/content/tracks';
import type {Track} from '@/content/tracks/track';
import type {FxMaterialFactory} from '@/content/tracks/track-definition';
import {Vehicle} from '@/content/vehicles/vehicle';
import {vehicles} from '@/content/vehicles';
import {createExhaustEngine} from '@/fx/exhaust/engines';
import type {ExhaustEngine} from '@/fx/exhaust/exhaust-engine';
import {DriftFx, type SmokeStyle} from '@/fx/drift/drift-fx';
import {createSmokeMaterial} from '@/fx/drift/smoke-material';
import {OilPreview} from '@/fx/oil/oil-material';
import type {LensUniforms} from '@/fx/singularity/singularity-lens';
import {BoostPads} from '@/game/boost-pads/boost-pads';
import type {Position3} from '@/sim/hover-physics';

/** Both benches render the ship at three quarters of its authored size. */
export const PREVIEW_SCALE = 0.75;
const BACKGROUND = 0xb6c6bd;
const UP = new Vector3(0, 1, 0);

/** Renderer fields shared by WebGPURenderer and the legacy WebGLRenderer. */
interface ToneMappedRenderer {
  shadowMap: {enabled: boolean; type: ShadowMapType | null};
  toneMapping: ToneMapping;
  toneMappingExposure: number;
}

/** Soft shadows and ACES, exactly like the race. */
export function configurePreviewRenderer(renderer: ToneMappedRenderer): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
}

/** Sage backdrop with distance fog; `background` is the scene's background colour. */
export function createPreviewScene(): {scene: Scene; camera: PerspectiveCamera; background: Color} {
  const scene = new Scene();
  const background = new Color(BACKGROUND);
  scene.background = background;
  scene.fog = new Fog(BACKGROUND, 220, 1100);
  const camera = new PerspectiveCamera(62, innerWidth / innerHeight, 0.15, 7000);
  return {scene, camera, background};
}

export function createPreviewOrbit(camera: PerspectiveCamera, canvas: HTMLCanvasElement, minDistance: number): OrbitControls {
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.maxDistance = 1000;
  orbit.minDistance = minDistance;
  return orbit;
}

/** Points the orbit at `target` from `offset`, turned by `yaw` around the vertical. */
function orbitAround(orbit: OrbitControls, camera: Camera, target: Position3, offset: Vector3, yaw: number): void {
  orbit.target.set(target.x, target.y, target.z);
  camera.position.copy(orbit.target).add(offset.applyAxisAngle(UP, yaw));
  orbit.update();
}

/** The default close-up: a little above the ship, behind and to its right. */
export function frameShipOrbit(orbit: OrbitControls, camera: Camera, ship: Object3D, yaw: number): void {
  orbitAround(orbit, camera, ship.position.clone().add(new Vector3(0, 1, 0)), new Vector3(7, 5, -10), yaw);
}

/** Looks at a boost pad from above and behind. */
export function framePadOrbit(orbit: OrbitControls, camera: Camera, pad: Position3 & {nx: number; nz: number}): void {
  orbitAround(orbit, camera, pad, new Vector3(7, 7, -9), Math.atan2(pad.nx, pad.nz));
}

export interface PreviewContentOptions {
  map: string;
  vehicle: string;
  onProgress(progress: number): void;
  fxMaterialFactory?: FxMaterialFactory;
}

/** Loads the circuit and the ship together; if either fails, releases the other and rethrows. */
export async function loadPreviewContent({
  map,
  vehicle,
  onProgress,
  fxMaterialFactory,
}: PreviewContentOptions): Promise<{world: Track; ship: Vehicle}> {
  const worldTask = tracks.resolve(map).load({mobile: false, anisotropy: 4, onProgress, fxMaterialFactory});
  const shipTask = Vehicle.load(vehicles.resolve(vehicle), {exhaust: false});
  const [world, ship] = await Promise.allSettled([worldTask, shipTask]);
  if (world.status === 'fulfilled' && ship.status === 'fulfilled') return {world: world.value, ship: ship.value};
  if (world.status === 'fulfilled') world.value.dispose();
  if (ship.status === 'fulfilled') ship.value.dispose();
  throw world.status === 'rejected' ? world.reason : (ship as PromiseRejectedResult).reason;
}

export interface PreviewEffects {
  boost: ExhaustEngine;
  smoke: DriftFx;
  oil: OilPreview;
  pads: BoostPads;
}

/** Exhaust engine, drift smoke, oil and one boost pad 12 m down the road. */
export async function loadPreviewEffects(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  world: Track,
  ship: Vehicle,
  lens: LensUniforms | null,
): Promise<PreviewEffects> {
  const boost = await createExhaustEngine(ship.definition.engine.kind, renderer, scene, ship, {camera, lens});
  const smoke = await DriftFx.load(scene, {surfaceHeight: world.surfaceHeight, materialFactory: createSmokeMaterial});
  const oil = new OilPreview(scene, world);
  const pads = await BoostPads.load({scene, landscape: world.landscape, surfaceHeight: world.surfaceHeight, distances: [12]});
  return {boost, smoke, oil, pads};
}

/** The smoke comparison dials, shared by both benches (each under its own panel name and id). */
export const SMOKE_DIALS = {
  Tamaño: [1.3, 0.5, 2.5, 0.05],
  Duración: [1.5, 0.5, 3, 0.05],
  'Color humo': {type: 'color', default: '#bababa'},
  Densidad: [1, 0.15, 1, 0.05],
  Trama: [1.5, 1, 4, 0.1],
  'Cuatro ruedas': false,
  Estilo: {type: 'select', options: ['Híbrido', 'Procedural', 'Mixto'], default: 'Híbrido'},
} satisfies DialConfig;

const SMOKE_STYLES: Partial<Record<string, SmokeStyle>> = {Híbrido: 'hybrid', Procedural: 'procedural', Mixto: 'mixed'};

export function applySmokeDials(smoke: DriftFx, values: ResolvedValues<typeof SMOKE_DIALS>): void {
  smoke.configure({
    size: values.Tamaño,
    lifetime: values.Duración,
    color: values['Color humo'],
    density: values.Densidad,
    grain: values.Trama,
    fourSupports: values['Cuatro ruedas'],
  });
  smoke.setStyle(SMOKE_STYLES[values.Estilo]);
}

/** Collision hull for the scripted (non-physics) states, scaled like the rendered ship. */
export function scaleHull(hull: HullShape | undefined, scale: number): HullShape | undefined {
  if (!hull) return undefined;
  return {
    halfWidth: hull.halfWidth * scale,
    halfLength: hull.halfLength * scale,
    capsuleRadius: hull.capsuleRadius * scale,
    capsuleSpacing: hull.capsuleSpacing * scale,
    capsuleBottom: hull.capsuleBottom * scale,
    capsuleTop: hull.capsuleTop * scale,
  };
}

/** Viewport-filling canvas: keeps camera aspect and drawing buffer in sync with the window. */
export function fitToWindow(camera: PerspectiveCamera, renderer: {setSize(width: number, height: number): void}): void {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

/** Required element lookup with a type check. */
export function requireElement<T extends Element>(selector: string, type: abstract new () => T): T {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`Falta ${selector}.`);
  return found;
}

/** Error text for the status line. */
export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
