import {MeshPhysicalMaterial, MeshStandardMaterial, NearestFilter, NearestMipmapLinearFilter, Vector2} from 'three';
import type {Material, MagnificationTextureFilter, Mesh, MinificationTextureFilter, Object3D, Texture} from 'three';
import {MeshPhysicalNodeMaterial, MeshStandardNodeMaterial} from 'three/webgpu';
import type {Node, Renderer, UniformNode} from 'three/webgpu';
import {mix, uniform, vec4} from 'three/tsl';
import {createDialKit, type DialConfig, type DialKitController} from '@/core/debug/dials';
import type {Disposable} from '@/core/disposable';
import {isMesh, materialsOf} from '../scene-utils';

interface JitterUniforms {
  desertGrid: UniformNode<Vector2>;
  desertJitter: UniformNode<number>;
}

// Authored PS2 look: native PBR, original saturation and shadow model, with
// adjustable vertex snapping; no screen pixelation or affine UV warp.
function jitterProjection(material: JitterUniforms, clip: Node): Node {
  const projected = clip.toVar();
  const grid = material.desertGrid;
  const snapped = projected.xy.div(projected.w).mul(grid).round().div(grid).mul(projected.w);
  return vec4(mix(projected.xy, snapped, material.desertJitter), projected.zw);
}

class DesertJitterMaterial extends MeshStandardNodeMaterial implements JitterUniforms {
  desertGrid!: UniformNode<Vector2>;
  desertJitter!: UniformNode<number>;
  override setupModelViewProjection(): Node {
    return jitterProjection(this, super.setupModelViewProjection());
  }
}

class DesertJitterPhysicalMaterial extends MeshPhysicalNodeMaterial implements JitterUniforms {
  desertGrid!: UniformNode<Vector2>;
  desertJitter!: UniformNode<number>;
  override setupModelViewProjection(): Node {
    return jitterProjection(this, super.setupModelViewProjection());
  }
}

const DIALS = {
  Activo: true,
  'Calidez desierto': [0.18, 0, 0.6, 0.01],
  'Textura nítida': false,
  Tembleque: true,
  'Intensidad tembleque': [1, 0, 1, 0.01],
  'Resolución tembleque': [368, 160, 960, 16],
  Original: {type: 'action', label: 'Look anterior'},
  PS2: {type: 'action', label: 'PS2 estable'},
} satisfies DialConfig;

export interface DesertLookSettings {
  Activo: boolean;
  'Calidez desierto': number;
  'Textura nítida': boolean;
  Tembleque: boolean;
  'Intensidad tembleque': number;
  'Resolución tembleque': number;
}

/** Review overrides: `base` disables the look, `jitter`/`ps2` force the defaults. */
export type DesertLookOverride = 'base' | 'jitter' | 'ps2' | null;

const DEFAULTS: DesertLookSettings = {
  Activo: true,
  'Calidez desierto': 0.18,
  'Textura nítida': false,
  Tembleque: true,
  'Intensidad tembleque': 1,
  'Resolución tembleque': 368,
};

interface Binding {
  mesh: Mesh;
  source: Material | Material[];
}

type MappedMaterial = Material & {map?: Texture | null; isNodeMaterial?: boolean};

/**
 * Natural Desert Valley look ("Desierto · PS2 y luz actual" dials): warm sand
 * grade, optional sharp texels and PS2-style vertex jitter. Jitter swaps every
 * standard material in the scene for a node material copy that snaps clip
 * positions; switching it off restores the originals.
 */
export class DesertLook implements Disposable {
  /** Feeds the desert post-processing warmth. */
  readonly warmth = uniform(0.18);
  private readonly jitter = uniform(0);
  private readonly grid = uniform(new Vector2(240, 135));
  private readonly bindings: Binding[] = [];
  private readonly cache = new Map<Material, Material>();
  private readonly textures = new Map<Texture, {mag: MagnificationTextureFilter; min: MinificationTextureFilter}>();
  private readonly drawingSize = new Vector2();
  private readonly kit: DialKitController<typeof DIALS>;
  private readonly unsubscribe: () => void;
  private values: DesertLookSettings = {...DEFAULTS};
  private forced: DesertLookSettings | null = null;
  private previousJitter = false;
  private previousSharp = false;

  constructor(
    scene: Object3D,
    private readonly renderer: Pick<Renderer, 'getDrawingBufferSize'>,
  ) {
    scene.traverse((object) => {
      if (!isMesh(object)) return;
      const source = object.material;
      this.bindings.push({mesh: object, source});
      for (const material of materialsOf(source) as MappedMaterial[]) {
        if (!material.isNodeMaterial && material.map && !this.textures.has(material.map)) {
          this.textures.set(material.map, {mag: material.map.magFilter, min: material.map.minFilter});
        }
      }
    });
    this.kit = createDialKit('Desierto · PS2 y luz actual', DIALS, {
      id: 'desert-ps2-look-v1',
      persist: true,
      onAction: (action) => {
        if (action === 'Original') {
          this.kit.setValue('Activo', false);
          this.kit.setValue('Tembleque', false);
        }
        if (action === 'PS2') for (const [key, value] of Object.entries(DEFAULTS)) this.kit.setValue(key, value);
      },
    });
    this.unsubscribe = this.kit.subscribe((next) => {
      this.values = {
        Activo: next.Activo,
        'Calidez desierto': next['Calidez desierto'],
        'Textura nítida': next['Textura nítida'],
        Tembleque: next.Tembleque,
        'Intensidad tembleque': next['Intensidad tembleque'],
        'Resolución tembleque': next['Resolución tembleque'],
      };
    });
  }

  get settings(): DesertLookSettings {
    return {...(this.forced ?? this.values)};
  }

  update({enabled = true}: {enabled?: boolean} = {}): void {
    const v = this.forced ?? this.values;
    const active = enabled && v.Activo;
    const on = active && v.Tembleque;
    const sharp = active && v['Textura nítida'];
    this.warmth.value = active ? v['Calidez desierto'] : 0;
    this.jitter.value = on ? v['Intensidad tembleque'] : 0;
    const size = this.renderer.getDrawingBufferSize(this.drawingSize);
    this.grid.value.set(v['Resolución tembleque'] * 0.5, (v['Resolución tembleque'] * 0.5 * size.y) / Math.max(size.x, 1));
    if (on !== this.previousJitter) {
      for (const {mesh, source} of this.bindings)
        mesh.material = on ? (Array.isArray(source) ? source.map((m) => this.convert(m)) : this.convert(source)) : source;
      this.previousJitter = on;
    }
    if (sharp !== this.previousSharp) {
      for (const [texture, old] of this.textures) {
        texture.magFilter = sharp ? NearestFilter : old.mag;
        texture.minFilter = sharp ? NearestMipmapLinearFilter : old.min;
        texture.needsUpdate = true;
      }
      this.previousSharp = sharp;
    }
  }

  setOverride(mode: DesertLookOverride): void {
    this.forced =
      mode === 'base'
        ? {...DEFAULTS, Activo: false}
        : mode === 'jitter'
          ? {...DEFAULTS, Tembleque: true}
          : mode === 'ps2'
            ? {...DEFAULTS}
            : null;
  }

  dispose(): void {
    this.unsubscribe();
    this.kit.destroy();
    for (const {mesh, source} of this.bindings) mesh.material = source;
    for (const [texture, old] of this.textures) {
      texture.magFilter = old.mag;
      texture.minFilter = old.min;
    }
    for (const material of this.cache.values()) material.dispose();
  }

  private convert(source: Material): Material {
    if ((source as MappedMaterial).isNodeMaterial || !(source as MeshStandardMaterial).isMeshStandardMaterial) return source;
    const cached = this.cache.get(source);
    if (cached) return cached;
    const physical = (source as MeshPhysicalMaterial).isMeshPhysicalMaterial === true;
    const material = physical ? new DesertJitterPhysicalMaterial() : new DesertJitterMaterial();
    // Use the source's native property copy, retaining PBR extensions, maps,
    // alpha, normals and skinning/instancing through Three's standard path.
    if (physical) MeshPhysicalMaterial.prototype.copy.call(material, source as MeshPhysicalMaterial);
    else MeshStandardMaterial.prototype.copy.call(material, source as MeshStandardMaterial);
    material.name = `PS2 · ${source.name}`;
    material.desertGrid = this.grid;
    material.desertJitter = this.jitter;
    this.cache.set(source, material);
    return material;
  }
}
