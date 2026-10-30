import type {BufferGeometry, Material, MeshBasicMaterial, Object3D, Texture} from 'three';
import {AssetLoader} from '@/core/assets/asset-loader';
import {DriftFx} from '@/fx/drift/drift-fx';
import type {TrackLighting} from '@/render/lighting/track-lighting';
import {Landscape} from '@/sim/landscape';
import type {HoverState, Position3} from '@/sim/hover-state';
import type {GameplayData, RouteData, Vec3Array} from '@/sim/route-data';
import {TrackCollision} from '@/sim/track-collision';
import {Track, effectsFrame, type EffectsFrame, type TrackUpdateContext} from '../track';
import {trackFile, type TrackDefinition, type TrackLoadOptions} from '../track-definition';
import {isMesh, isTexture, materialsOf} from '../scene-utils';
import {TokyoLighting, type TokyoFixture} from './tokyo-lighting';
import {extractTokyoCollision, isTokyoFloor, type TokyoSurface} from './tokyo-surface';

export class TokyoHighwayTrack extends Track {
  readonly textures = {count: 9, applyRoot() {}};
  readonly detailCount: number;
  override readonly clipCamera;
  readonly surfaceHeight;
  override readonly glow;
  private frame: EffectsFrame | null = null;

  private constructor(
    readonly definition: TrackDefinition,
    readonly root: Object3D,
    readonly landscape: Landscape,
    readonly fx: DriftFx,
    private readonly surface: TokyoSurface,
    private readonly collision: TrackCollision,
    private readonly lights: TokyoLighting,
  ) {
    super();
    this.surfaceHeight = surface.height;
    this.glow = lights.glow;
    this.clipCamera = collision.clipCamera;
    this.detailCount = lights.fixtureCount;
  }

  static async load(definition: TrackDefinition, options: TrackLoadOptions): Promise<TokyoHighwayTrack> {
    const loader = AssetLoader.shared;
    const [asset, colliderAsset, route, gameplay, fixtures, testSpawns] = await Promise.all([
      loader.gltf(trackFile(definition, definition.model), {onProgress: options.onProgress}),
      loader.gltf(trackFile(definition, 'tokyo-collision.glb')),
      loader.json<RouteData>(trackFile(definition, 'route_gltf.json')),
      loader.json<GameplayData>(trackFile(definition, 'gameplay.json')),
      loader.json<TokyoFixture[]>(trackFile(definition, 'lights.json')),
      loader.json<Record<string, {position: Vec3Array; forward: Vec3Array}>>(trackFile(definition, 'test-spawns.json')),
    ]);
    const root = asset.scene;
    const landscape = new Landscape(route, gameplay);
    landscape.map = definition.id;
    landscape.physicalBoundaries = true;
    landscape.allowJumps = true;
    landscape.shortcuts = route.shortcuts ?? [];
    // The authored elevation is unambiguous even where the spiral overlaps.
    const grid = gameplay.spawn_positions[0].position_gltf;
    landscape.spawn = {x: grid[0], y: grid[1] + 0.65, z: grid[2]};
    if (import.meta.env.DEV) {
      const section = testSpawns[new URLSearchParams(location.search).get('testSpawn') ?? ''];
      if (section) {
        const [x, y, z] = section.position;
        landscape.spawn = {x, y: y + 0.65, z};
        landscape.yaw = Math.atan2(section.forward[0], section.forward[2]);
      }
    }
    root.traverse(object => {
      if (!isMesh(object)) return;
      const materials = materialsOf(object.material);
      const backdrop = materials.some(m => /Backdrop/.test(m.name));
      object.castShadow = !backdrop && !materials.some(m => /Emitter|Light|Beacon|Lens/.test(m.name));
      object.receiveShadow = !backdrop;
      for (const material of materials) {
        if (backdrop) { (material as MeshBasicMaterial).fog = false; material.toneMapped = false; }
        for (const value of Object.values(material)) if (isTexture(value)) value.anisotropy = options.anisotropy;
      }
    });
    const extracted = extractTokyoCollision(colliderAsset.scene);
    extracted.surface.referenceHeight = landscape.spawn.y - 0.65;
    const collision = new TrackCollision(extracted.root, {isFloor: isTokyoFloor, exploration: true, surfaceHeightOverride: extracted.surface.height});
    disposeScene(colliderAsset.scene);
    loader.evict(trackFile(definition, 'tokyo-collision.glb'));
    const lights = new TokyoLighting(root, fixtures, options.mobile);
    try {
      const fx = await DriftFx.load(root, {surfaceHeight: extracted.surface.height, mobile: options.mobile, materialFactory: options.fxMaterialFactory});
      return new TokyoHighwayTrack(definition, root, landscape, fx, extracted.surface, collision, lights);
    } catch (error) {
      lights.dispose(); collision.dispose(); disposeScene(root);
      loader.evict(trackFile(definition, definition.model));
      throw error;
    }
  }

  override initLighting(lighting: TrackLighting): void { this.lights.bindGlobal(lighting); }

  step(state: HoverState, dt: number, previous?: Position3): void {
    this.surface.referenceHeight = state.y - 0.65;
    this.collision.step(state, dt, this.landscape, previous);
  }

  update(time: number, reduced: boolean, context: TrackUpdateContext): void {
    this.surface.referenceHeight = context.state.y - 0.65;
    this.lights.update(time, reduced, context);
    this.frame = effectsFrame(this.frame, context, reduced);
    this.fx.update(context.dt ?? 0, this.frame);
  }

  reset(): void { this.fx.reset(); this.surface.referenceHeight = this.landscape.spawn.y - 0.65; }

  dispose(): void {
    this.fx.dispose();
    this.lights.dispose();
    this.collision.dispose();
    disposeScene(this.root);
    this.root.removeFromParent();
    AssetLoader.shared.evict(trackFile(this.definition, this.definition.model));
  }
}

function disposeScene(root: Object3D): void {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
  root.traverse(object => {
    if (!isMesh(object)) return;
    geometries.add(object.geometry);
    for (const material of materialsOf(object.material)) {
      materials.add(material);
      for (const value of Object.values(material)) if (isTexture(value)) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
