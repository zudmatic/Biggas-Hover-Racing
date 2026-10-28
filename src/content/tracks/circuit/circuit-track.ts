import {Box3, BufferAttribute, Float32BufferAttribute, Group, Mesh, Vector3} from 'three';
import type {BufferGeometry, Material, MeshStandardMaterial, Object3D, Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {AssetLoader, publicUrl} from '@/core/assets/asset-loader';
import {DriftFx} from '@/fx/drift/drift-fx';
import {Landscape} from '@/sim/landscape';
import type {HoverState, Position3} from '@/sim/hover-state';
import type {GameplayData, RouteData} from '@/sim/route-data';
import {collisionMaterials, SurfaceIndex, TrackCollision} from '@/sim/track-collision';
import {Track} from '../track';
import {effectsFrame} from '../track';
import type {ClipCamera, EffectsFrame, FlightFx, TrackSurfaceHeight, TrackUpdateContext} from '../track';
import {trackFile} from '../track-definition';
import type {TrackDefinition, TrackLoadOptions} from '../track-definition';
import {isInstancedMesh, isMesh, materialsOf} from '../scene-utils';
import {CircuitDetails} from './circuit-details';
import {CircuitTextures} from './circuit-textures';

/** A large flat rooftop of a city building, where urban details can stand. */
export interface CircuitAnchor {
  name: string;
  box: Box3;
  position: Vector3;
}

/** Track-specific decoration on top of the shared circuit details. */
export interface CircuitDetailLayer {
  readonly detailCount: number;
  update(time: number, reduced: boolean, context: TrackUpdateContext): void;
}

export interface CircuitDetailScene {
  root: Group;
  /** Rooftop anchors (urban circuits only). */
  anchors: CircuitAnchor[];
  mobile: boolean;
}

/** How a generic GLB + collider circuit dresses itself. */
export interface CircuitFeatures {
  /** Urban circuit: scenery is batched per 80 m cell so the renderer can cull the city; drones fly higher. */
  city?: boolean;
  /** Ocean, island rocks, ferns, waterfall mist and ripples. */
  islands?: boolean;
  /** Extra life for this circuit (e.g. Nexus rooftop vents). */
  createDetails?(scene: CircuitDetailScene): CircuitDetailLayer;
}

interface Batch {
  material: Material;
  parts: BufferGeometry[];
}

const KEPT_ATTRIBUTES = ['position', 'normal', 'uv', 'color'];
const CITY_CELL = 80;
const START_GREEN = 0x65dd9a;
const START_IDLE = 0x4b5c51;

/**
 * Generic circuit: one visual GLB (baked into per-material batches with
 * tiling surface textures), one collider GLB and the route/gameplay JSON.
 * Ruins, Nexus and Mario Raceway.
 */
export class CircuitTrack extends Track {
  readonly detailCount: number;
  override readonly clipCamera?: ClipCamera;
  private fxFrame: EffectsFrame | null = null;

  private constructor(
    readonly definition: TrackDefinition,
    readonly root: Group,
    readonly landscape: Landscape,
    readonly textures: CircuitTextures,
    readonly fx: FlightFx,
    readonly surfaceHeight: TrackSurfaceHeight,
    private readonly collision: TrackCollision | null,
    private readonly details: CircuitDetails,
    private readonly extra: CircuitDetailLayer | null,
    private readonly startLights: Mesh<BufferGeometry, MeshStandardMaterial>[],
    private readonly files: string[],
  ) {
    super();
    this.clipCamera = collision?.clipCamera;
    this.detailCount = details.detailCount + (extra?.detailCount ?? 0);
  }

  static async load(definition: TrackDefinition, options: TrackLoadOptions, features: CircuitFeatures = {}): Promise<CircuitTrack> {
    const {mobile, anisotropy = 4, underglow, onProgress = () => {}, fxMaterialFactory} = options;
    const {model, collider, surface} = definition;
    if (!collider || !surface) throw new Error(`Circuito: ${definition.id} no define colisiones.`);
    const loader = AssetLoader.shared;
    const files = [trackFile(definition, model), trackFile(definition, collider)];
    const [asset, colliders, route, gameplay] = await Promise.all([
      loader.gltf(files[0], {onProgress: (fraction) => onProgress(fraction * 0.8)}),
      loadColliders(files[1]),
      loader.json<RouteData>(trackFile(definition, 'route_gltf.json')),
      loader.json<GameplayData>(trackFile(definition, 'gameplay.json')),
    ]);
    const city = !!features.city;
    const landscape = new Landscape(route, gameplay);
    landscape.map = definition.id;
    landscape.physicalBoundaries = definition.physicalBoundaries;
    const root = new Group();
    root.name = `${definition.name} ${definition.number}`;
    const textures = new CircuitTextures({anisotropy});
    const {anchors, startLights} = bakeScenery(asset.scene, root, textures, city);

    const floor = colliders.scene.getObjectByName(surface);
    if (!floor || !isMesh(floor)) throw new Error('Falta la superficie de pista.');
    const collision = definition.physicalBoundaries ? new TrackCollision(colliders.scene) : null;
    const surfaceHeight: TrackSurfaceHeight = collision?.surfaceHeight ?? new SurfaceIndex(floor).height;
    colliders.scene.traverse((object) => {
      if (!isMesh(object)) return;
      object.geometry.dispose();
      for (const material of materialsOf(object.material)) material.dispose();
    });
    const details = new CircuitDetails(root, landscape, {mobile, city, islands: !!features.islands, underglow});
    const extra = features.createDetails?.({root, anchors, mobile}) ?? null;
    textures.applyRoot(root);
    const fx: FlightFx = await DriftFx.load(root, {surfaceHeight, mobile, materialFactory: fxMaterialFactory});
    onProgress(1);
    return new CircuitTrack(definition, root, landscape, textures, fx, surfaceHeight, collision, details, extra, startLights, files);
  }

  step(state: HoverState, dt: number, previous?: Position3): void {
    this.collision?.step(state, dt, this.landscape, previous);
    this.details.step(state, dt);
  }

  reset(): void {
    this.details.reset();
    this.fx.reset();
  }

  update(time: number, reduced: boolean, context: TrackUpdateContext): void {
    this.details.update(time, reduced, context);
    this.extra?.update(time, reduced, context);
    this.fxFrame = effectsFrame(this.fxFrame, context, reduced);
    this.fx.update(context.dt ?? 0, this.fxFrame);
    if (context.phase === 'paused') return;
    const running = context.phase === 'flying';
    const color = running ? START_GREEN : START_IDLE;
    for (const light of this.startLights) {
      light.material.color.setHex(color);
      light.material.emissive.setHex(running ? color : 0x000000);
    }
  }

  dispose(): void {
    this.fx.dispose();
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    this.root.traverse((object) => {
      if (isInstancedMesh(object)) object.dispose();
      const drawable = object as Partial<Mesh>;
      if (drawable.geometry && drawable.material) {
        geometries.add(drawable.geometry);
        for (const material of materialsOf(drawable.material)) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    const authored = new Set<Texture>();
    for (const material of materials) {
      const map = (material as Material & {map?: Texture | null}).map;
      if (map && !material.userData.circuitSurface) authored.add(map);
      material.dispose();
    }
    for (const texture of authored) texture.dispose();
    this.textures.dispose();
    this.collision?.dispose();
    for (const file of this.files) AssetLoader.shared.evict(file);
  }
}

/** Collider GLBs need geometry only: materials become plain placeholders and embedded images are never decoded. */
async function loadColliders(path: string) {
  const data = await AssetLoader.shared.arrayBuffer(path);
  const url = publicUrl(path);
  return new GLTFLoader().register(collisionMaterials).parseAsync(data, url.slice(0, url.lastIndexOf('/') + 1));
}

/**
 * Bakes every authored mesh into world space and merges them per material
 * (and per 80 m cell in a city), giving a handful of draw calls. Start lights
 * stay separate so they can change colour.
 */
function bakeScenery(scene: Object3D, root: Group, textures: CircuitTextures, city: boolean) {
  const anchors: CircuitAnchor[] = [];
  const startLights: Mesh<BufferGeometry, MeshStandardMaterial>[] = [];
  const batches = new Map<string, Batch>();
  const originalGeometries = new Set<BufferGeometry>();
  const center = new Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!isMesh(object)) return;
    const mesh = object;
    const material = mesh.material as Material;
    originalGeometries.add(mesh.geometry);
    let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (geometry.index) {
      const indexed = geometry;
      geometry = indexed.toNonIndexed();
      indexed.dispose();
    }
    for (const key of Object.keys(geometry.attributes)) if (!KEPT_ATTRIBUTES.includes(key)) geometry.deleteAttribute(key);
    textures.apply(new Mesh(geometry, material));
    if (!geometry.attributes.uv)
      geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    if (city && /^CITY_.*__cement$/.test(mesh.name)) {
      const anchor = findRooftop(mesh.name, geometry);
      if (anchor) anchors.push(anchor);
    }
    if (/^Start_light/.test(mesh.name)) {
      const light = new Mesh(geometry, (material as MeshStandardMaterial).clone());
      light.material.emissiveIntensity = 1.2;
      root.add(light);
      startLights.push(light);
      return;
    }
    geometry.computeBoundingBox();
    geometry.boundingBox!.getCenter(center);
    const cell = city ? `${Math.floor(center.x / CITY_CELL)},${Math.floor(center.z / CITY_CELL)}` : 'all';
    const key = `${material.uuid}:${cell}`;
    let batch = batches.get(key);
    if (!batch) batches.set(key, (batch = {material, parts: []}));
    batch.parts.push(geometry);
  });
  for (const {material, parts} of batches.values()) {
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`Circuito: no se pudo agrupar ${material.name}.`);
    const mesh = new Mesh(merged, material);
    for (const part of parts) part.dispose();
    mesh.name = material.name;
    mesh.geometry.userData.circuitUV = true;
    mesh.castShadow = !/water|foam|fall|glazing|Terrain/i.test(material.name);
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  for (const geometry of originalGeometries) geometry.dispose();
  return {anchors, startLights};
}

/** The largest upward-facing triangle in the top quarter of a building. */
function findRooftop(name: string, geometry: BufferGeometry): CircuitAnchor | null {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!.clone();
  const p = geometry.attributes.position as BufferAttribute;
  const n = geometry.attributes.normal as BufferAttribute;
  let area = 0;
  let position: Vector3 | null = null;
  for (let i = 0; i < p.count; i += 3) {
    if (n.getY(i) < 0.8 || p.getY(i) < box.max.y - (box.max.y - box.min.y) * 0.25) continue;
    const a = Math.abs(
      (p.getX(i + 1) - p.getX(i)) * (p.getZ(i + 2) - p.getZ(i)) - (p.getZ(i + 1) - p.getZ(i)) * (p.getX(i + 2) - p.getX(i)),
    );
    if (a > area) {
      area = a;
      position = new Vector3((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, p.getY(i), (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3);
    }
  }
  return position && area > 12 ? {name, box, position} : null;
}
