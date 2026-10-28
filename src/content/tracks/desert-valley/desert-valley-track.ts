import {Box3, TextureLoader, Vector3} from 'three';
import type {BufferGeometry, DirectionalLight, Material, Mesh, MeshStandardMaterial, Object3D, Texture} from 'three';
import {AssetLoader, publicUrl} from '@/core/assets/asset-loader';
import {DriftFx} from '@/fx/drift/drift-fx';
import {HoverWaterEffects} from '@/fx/water/hover-effects';
import {Landscape} from '@/sim/landscape';
import type {HoverState, Position3} from '@/sim/hover-state';
import type {Vec3Array} from '@/sim/route-data';
import {SurfaceIndex, TrackCollision} from '@/sim/track-collision';
import {effectsFrame, Track} from '../track';
import type {ClipCamera, EffectsFrame, FlightFx, TrackSurfaceHeight, TrackTextures, TrackUpdateContext, WaterStats} from '../track';
import {trackFile} from '../track-definition';
import type {TrackDefinition, TrackLoadOptions} from '../track-definition';
import {isInstancedMesh, isMesh, isTexture, materialsOf} from '../scene-utils';
import {extractDesertRuntimeData} from './desert-asset';
import {DESERT_JUMPS} from './desert-handling';
import {partitionDesertInstances} from './desert-instances';
import {DesertLod} from './desert-lod';
import {createDesertRoute, DESERT_START} from './desert-route';
import type {DesertLegacyGameplay, DesertRoute, DrivingGuides} from './desert-route';
import {DesertTrain} from './desert-train';
import type {RailwayData} from './desert-train';
import {DesertTrainAudio} from './desert-train-audio';
import {createDesertWaterContact} from './water/desert-contact';
import {DesertRiver, RIVER_SURFACE} from './water/desert-surface';
import {applyDesertWaterPreset} from './water/preset';
import {Water} from './water/water';

const TRAIN_MODEL = 'freight-train-40-game.glb';
/** Warm ochre sand. Scoped to Desert Valley; the water preset is untouched. */
const SAND_MATERIALS = new Set(['MAT_Desert_SandTile', 'MAT_Export25_PaintedGround_Baked']);
const SAND_COLOR = 0xf3d5b8;
/** Direction toward the sun at load; follows the sun light once water exists. */
const SUN_DIRECTION = new Vector3(-160, 220, -120).normalize();

/** Everything the track must dispose: GLB geometry, materials and textures. */
class OwnedResources {
  readonly geometries = new Set<BufferGeometry>();
  readonly materials = new Set<Material>();
  readonly textures = new Set<Texture>();

  constructor(private readonly anisotropy: number) {}

  /** Records a mesh's resources and applies the desert shadow policy. */
  collect = (object: Object3D): void => {
    if (!isMesh(object)) return;
    this.geometries.add(object.geometry);
    for (const material of materialsOf(object.material)) {
      this.materials.add(material);
      for (const value of Object.values(material)) {
        if (!isTexture(value)) continue;
        this.textures.add(value);
        value.anisotropy = this.anisotropy;
      }
    }
    const instanced = isInstancedMesh(object);
    if (instanced) {
      object.computeBoundingBox();
      object.computeBoundingSphere();
    }
    object.castShadow = !instanced && !/TERRAIN|BANK|SHOULDERS|SM_Water/.test(object.name);
    object.receiveShadow = true;
  };

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
  }
}

/** The unified, compressed Desert Valley map plus its live systems. */
interface DesertScene {
  root: Object3D;
  landscape: Landscape;
  collision: TrackCollision;
  river: DesertRiver;
  surface: Mesh;
  lod: DesertLod;
  train: DesertTrain;
  fx: FlightFx;
  resources: OwnedResources;
  /** Filled by `initWater`; the height closures read the wave uniforms through it. */
  water: {current: Water | null};
  riverHeight: (x: number, z: number) => number;
  instanceCount: number;
  mobile: boolean;
  files: string[];
}

/**
 * Desert Valley 039. Keeps the authored scene hierarchy and
 * EXT_mesh_gpu_instancing (the generic circuit batcher bakes only a mesh's
 * base geometry, losing instance transforms), adds distance LOD for the
 * vegetation and mesas, a freight train, and an animated river.
 */
export class DesertValleyTrack extends Track {
  readonly root: Object3D;
  readonly landscape: Landscape;
  readonly fx: FlightFx;
  override readonly lod: DesertLod;
  override readonly train: DesertTrain;
  override readonly instanceCount: number;
  override readonly clipCamera: ClipCamera;
  readonly textures: TrackTextures = {count: 3, applyRoot() {}};
  private readonly collision: TrackCollision;
  private readonly river: DesertRiver;
  private readonly surface: Mesh;
  private readonly trainAudio: DesertTrainAudio;
  private readonly resources: OwnedResources;
  private readonly files: string[];
  private readonly waterRef: {current: Water | null};
  private readonly riverHeight: (x: number, z: number) => number;
  private readonly mobile: boolean;
  private readonly toSun = SUN_DIRECTION.clone();
  private waterFx: HoverWaterEffects | null = null;
  private sun: DirectionalLight | null = null;
  private waterSpeed = 0;
  private fxFrame: EffectsFrame | null = null;

  private constructor(
    readonly definition: TrackDefinition,
    scene: DesertScene,
  ) {
    super();
    this.root = scene.root;
    this.landscape = scene.landscape;
    this.collision = scene.collision;
    this.clipCamera = scene.collision.clipCamera;
    this.river = scene.river;
    this.surface = scene.surface;
    this.lod = scene.lod;
    this.train = scene.train;
    this.fx = scene.fx;
    this.resources = scene.resources;
    this.instanceCount = scene.instanceCount;
    this.waterRef = scene.water;
    this.riverHeight = scene.riverHeight;
    this.mobile = scene.mobile;
    this.files = scene.files;
    this.trainAudio = new DesertTrainAudio(scene.train);
  }

  get detailCount(): number {
    return this.instanceCount;
  }

  override get water(): Water | null {
    return this.waterRef.current;
  }

  override get waterStats(): WaterStats {
    return {surfaceTriangles: this.river.triangles, effectTriangles: this.waterFx?.triangles ?? 0};
  }

  /** Dry ground, or the animated river surface where it is higher. */
  readonly surfaceHeight: TrackSurfaceHeight = (x, z) => this.collision.surfaceHeight(x, z);

  static async load(
    definition: TrackDefinition,
    {mobile, anisotropy = 4, onProgress = () => {}, fxMaterialFactory}: TrackLoadOptions,
  ): Promise<DesertValleyTrack> {
    const loader = AssetLoader.shared;
    const file = (name: string): string => trackFile(definition, name);
    const files = [file(definition.model), file(TRAIN_MODEL)];
    const [asset, trainAsset, guides, legacyGameplay, railway] = await Promise.all([
      loader.gltf(files[0], {onProgress: (fraction) => onProgress(fraction * 0.75)}),
      loader.gltf(files[1]),
      loader.json<DrivingGuides>(file('driving-guides.json')),
      loader.json<DesertLegacyGameplay>(file('gameplay.json')),
      loader.json<RailwayData>(file('railway.json')),
    ]);
    const root = asset.scene;
    root.name = 'Desert Valley 039';
    const {details: detailAsset, collisions: collisionInputs, placed: placedDetails, manifest} = extractDesertRuntimeData(asset);
    if (!detailAsset || !manifest?.families) throw new Error('Desert Valley: faltan los detalles del mapa unificado.');
    // Ordinary viewers use the complete default scene. The game swaps its near
    // detail instances for adaptive LOD batches, while collision-only originals
    // and reusable prototypes are stored outside that visible scene.
    placedDetails?.removeFromParent();
    detailAsset.removeFromParent();
    if (collisionInputs) root.add(collisionInputs);
    root.updateMatrixWorld(true);
    partitionDesertInstances(root);
    const {route, gameplay} = createDesertRoute(guides, legacyGameplay, stationPosition(root));
    const landscape = new Landscape(route, gameplay);
    landscape.map = 'desert-valley';
    landscape.mapHalf = 437.5;
    landscape.physicalBoundaries = true;
    landscape.allowJumps = true;
    landscape.jumpSettings = DESERT_JUMPS;
    landscape.shortcut = route.shortcut;
    if (import.meta.env.DEV) applyTestSpawn(landscape, route);

    const resources = new OwnedResources(anisotropy);
    root.traverse(resources.collect);
    trainAsset.scene.traverse(resources.collect);
    placedDetails?.traverse((object) => {
      resources.collect(object);
      if (isInstancedMesh(object)) object.dispose();
    });
    // Art direction: warm ochre sand, with the authored atlas kept intact.
    // This is scoped to Desert Valley and does not touch the water preset.
    for (const material of resources.materials)
      if (SAND_MATERIALS.has(material.name)) (material as MeshStandardMaterial).color.set(SAND_COLOR);
    const surface = root.getObjectByName('SM_Water');
    if (!surface || !isMesh(surface)) throw new Error('Desert Valley: falta SM_Water.');
    const isRamp = (mesh: Object3D): boolean => {
      for (let node: Object3D | null = mesh; node && node !== root; node = node.parent)
        if (node.userData.role === 'driveable_ramp' || node.userData.ramp_instance) return true;
      return false;
    };
    const isDryFloor = (mesh: Object3D): boolean =>
      isRamp(mesh) || /S07_(ROAD|DIRT|TERRAIN|BANK|SHOULDERS)|BrokenBridge_Deck/.test(mesh.name);
    const floorMeshes: Mesh[] = [];
    root.traverse((object) => {
      if (isMesh(object) && object !== surface && isDryFloor(object)) floorMeshes.push(object);
    });
    const dryHeight = new SurfaceIndex(floorMeshes).height;
    const river = new DesertRiver(surface, dryHeight, {mobile});
    resources.geometries.add(river.geometry);
    // The river height depends on the water uniforms, which exist once
    // `initWater` runs; the track instance answers through this hook.
    const water = {current: null as Water | null};
    const riverHeight = (x: number, z: number): number =>
      river.heightAt(x, z, water.current?.phase.value ?? 0, water.current?.waveHeight.value ?? 0);
    const surfaceHeight = (x: number, z: number): number | null => {
      const ground = dryHeight(x, z) ?? null;
      const b = river.bounds;
      if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) return ground;
      return Math.max(ground ?? -Infinity, riverHeight(x, z));
    };
    const collision = new TrackCollision(root, {
      isFloor: (mesh) => mesh === surface || isDryFloor(mesh),
      isSolid: (mesh) => !isInstancedMesh(mesh) && !/Deck_Markings/.test(mesh.name),
      exploration: true,
      surfaceHeightOverride: surfaceHeight,
    });
    // Capture the original collision proxies first; visual detail never changes
    // driveable surfaces, train clearance or the authored collision geometry.
    detailAsset.traverse(resources.collect);
    const lodMode = import.meta.env.DEV && new URLSearchParams(location.search).get('lod') === 'full' ? 'full' : 'adaptive';
    const lod = new DesertLod(root, detailAsset, manifest, {mode: lodMode});
    collisionInputs?.removeFromParent();
    lod.update(landscape.spawn, 0, true);
    let instanceCount = manifest.instanceCount;
    root.traverse((object) => {
      if (isInstancedMesh(object) && !object.userData.visualDetail) instanceCount += object.count;
    });
    landscape.spawn.y = (surfaceHeight(landscape.spawn.x, landscape.spawn.z) ?? landscape.spawn.y - 0.65) + 0.65;
    freezeStaticScenery(root);
    // Moving vehicles must stay out of the immutable scenery octree.
    const train = new DesertTrain(trainAsset.scene, railway);
    root.add(train.root);
    const fx = await DriftFx.load(root, {surfaceHeight: collision.surfaceHeight, mobile, materialFactory: fxMaterialFactory});
    onProgress(1);
    return new DesertValleyTrack(definition, {
      root,
      landscape,
      collision,
      river,
      surface,
      lod,
      train,
      fx,
      resources,
      water,
      riverHeight,
      instanceCount,
      mobile,
      files,
    });
  }

  override async initWater(light: DirectionalLight): Promise<void> {
    if (this.waterRef.current) return;
    this.sun = light;
    const loader = new TextureLoader();
    const [pattern, bed] = await Promise.all(
      ['water-pattern.png', 'water-bed.png'].map((name) => loader.loadAsync(publicUrl(`textures/water/${name}`))),
    );
    const contact = createDesertWaterContact(this.root, this.surface);
    const {resources, surface, river, root} = this;
    for (const texture of [pattern, bed, contact.texture]) resources.textures.add(texture);
    const water = new Water(pattern, light, this.toSun, contact.texture, contact.info, surface, bed, {
      geometry: river.geometry,
      maxWaveHeight: RIVER_SURFACE.maximumWaveHeight,
      desert: true,
    });
    this.waterSpeed = applyDesertWaterPreset(water);
    surface.geometry = water.geometry;
    surface.material = water.material;
    surface.castShadow = false;
    root.add(water.seabed);
    resources.geometries.add(water.geometry);
    resources.geometries.add(water.seabed.geometry);
    resources.materials.add(water.material);
    resources.materials.add(water.seabed.material);
    this.waterRef.current = water;
    this.waterFx = new HoverWaterEffects({root, river, heightAt: this.riverHeight, mobile: this.mobile});
  }

  override resetWaterFx(): void {
    this.waterFx?.reset();
  }

  step(state: HoverState, dt: number, previous?: Position3): void {
    this.train.step(dt);
    this.collision.step(state, dt, this.landscape, previous);
    this.train.collide(state, dt, previous);
  }

  reset(): void {
    this.fx.reset();
    this.train.reset();
    this.trainAudio.reset();
    this.waterFx?.reset();
    if (this.waterRef.current) this.waterRef.current.phase.value = 0;
  }

  update(_time: number, reduced: boolean, context: TrackUpdateContext): void {
    const dt = context.dt ?? 0;
    this.lod.update(context.state, dt);
    const frame = (this.fxFrame = effectsFrame(this.fxFrame, context, reduced));
    this.fx.update(dt, frame);
    if (context.camera) this.trainAudio.update(context.camera, context.phase);
    const water = this.waterRef.current;
    const sun = this.sun;
    if (water && sun) {
      if (context.phase !== 'paused' && !reduced) water.phase.value += Math.min(dt, 0.05) * this.waterSpeed;
      this.toSun.subVectors(sun.position, sun.target.position).normalize();
      water.sunStrength.value = sun.intensity / 7;
    }
    this.waterFx?.update(dt, frame);
  }

  dispose(): void {
    this.lod.dispose();
    this.trainAudio.dispose();
    this.train.dispose();
    this.waterFx?.dispose();
    this.river.dispose();
    this.fx.dispose();
    this.collision.dispose();
    this.waterRef.current?.dispose();
    this.root.traverse((object) => {
      if (isInstancedMesh(object)) object.dispose();
    });
    this.resources.dispose();
    this.root.removeFromParent();
    for (const file of this.files) AssetLoader.shared.evict(file);
  }

  protected override prepareWarmup(): () => void {
    const restoreLod = this.lod.showAll();
    const restoreTrain = this.train.showAll();
    const restoreHidden = super.prepareWarmup();
    return () => {
      restoreHidden();
      restoreTrain();
      restoreLod();
    };
  }
}

/** Centre of the authored fuel station (the grid forms in front of it). */
function stationPosition(root: Object3D): Vec3Array {
  let station: Object3D | null = null;
  root.traverse((node) => {
    if (node.userData.source_object === DESERT_START.sourceObject) station = node;
  });
  return station ? (new Box3().setFromObject(station).getCenter(new Vector3()).toArray() as Vec3Array) : DESERT_START.fallbackPosition;
}

/** Development: `?testSpawn=bridge|river|valley` starts at that section. */
function applyTestSpawn(landscape: Landscape, route: DesertRoute): void {
  const sections: Record<string, number> = {bridge: 5, river: 7, valley: 2};
  const key = new URLSearchParams(location.search).get('testSpawn') ?? '';
  const section = sections[key];
  const samples = route.samples.filter((p) => p.section === section);
  if (!samples.length) return;
  const sample = samples[key === 'river' ? Math.floor(samples.length / 2) : 0];
  const point = landscape.atDistance(sample.distance_m - (key === 'bridge' ? 20 : 0));
  landscape.spawn = {x: point.x, y: point.y + 0.65, z: point.z};
  landscape.yaw = Math.atan2(point.nx, point.nz);
}

/**
 * The map never moves: stop recomposing ~a thousand static matrices every
 * frame (the game forces `updateMatrixWorld(true)` several times per frame).
 * Children added later (train, effects, water) keep updating normally.
 */
function freezeStaticScenery(root: Object3D): void {
  root.updateMatrixWorld(true);
  for (const child of root.children) {
    child.traverse((object) => {
      object.matrixAutoUpdate = false;
      object.matrixWorldAutoUpdate = false;
    });
  }
}
