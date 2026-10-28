import type {
  Camera,
  ColorRepresentation,
  DepthTexture,
  Material,
  Mesh,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Texture,
  WebGLRenderer,
} from 'three';
import type {Disposable} from '@/core/disposable';
import {asSurface, isMesh, type MeshMaterial, type SurfaceMaterial} from '../scene-utils';
import {retro, type RetroMaterial} from './retro-material';
import {retroStyle} from './retro-style';
import {PrintPass} from './retro-print';

export interface CharacterComicQuality {
  samples?: number;
  glowSamples?: number;
  lite?: boolean;
}

/** The authored properties a printed copy follows. */
type CharacterSource = SurfaceMaterial & {
  map?: Texture | null;
  bumpMap?: Texture | null;
  bumpScale?: number;
  flatShading?: boolean;
  wireframe?: boolean;
};

interface PrintedEntry {
  material: RetroMaterial;
  release(): void;
}

/**
 * Preserve the original materials while applying the shared comic ink and
 * finishing pass to the pilot and ships. WebGL only (see PrintPass).
 */
export class CharacterComic implements Disposable {
  private readonly pass: PrintPass;
  private readonly cache = new Map<Material, PrintedEntry>();
  /** Meshes whose material was swapped for this frame, and what to restore. */
  private readonly restored: Mesh[] = [];
  private readonly sources: MeshMaterial[] = [];
  private readonly arrays = new WeakMap<Material[], Material[]>();
  private readonly synced = new Set<Material>();
  private samples: number;
  private glowSamples: number;
  private lite: boolean;

  constructor(
    private readonly renderer: WebGLRenderer,
    {samples = 4, glowSamples = 12, lite = false}: CharacterComicQuality = {},
  ) {
    this.pass = new PrintPass(renderer, {comic: true});
    this.samples = samples;
    this.glowSamples = glowSamples;
    this.lite = lite;
  }

  get depthTexture(): DepthTexture | null {
    return this.pass.material.uniforms.tDepth.value as DepthTexture | null;
  }

  setQuality(options: CharacterComicQuality): void {
    this.samples = options.samples ?? this.samples;
    this.glowSamples = options.glowSamples ?? this.glowSamples;
    this.lite = options.lite ?? this.lite;
  }

  async prepare(scene: Object3D, camera: Camera): Promise<void> {
    retroStyle.setLook('comic');
    retroStyle.setLite(this.lite);
    this.apply(scene);
    try {
      await this.pass.prepare(scene, camera);
    } finally {
      this.restore();
    }
  }

  render(scene: Scene, camera: PerspectiveCamera | OrthographicCamera, background: ColorRepresentation): void {
    retroStyle.setLook('comic');
    retroStyle.setLite(this.lite);
    retroStyle.setPixelRatio(this.renderer.getPixelRatio());
    retroStyle.params.paper = background;
    const originalBackground = scene.background;
    this.apply(scene);
    scene.background = null;
    try {
      this.pass.render(scene, camera, {samples: this.samples, glowSamples: this.glowSamples});
    } finally {
      scene.background = originalBackground;
      this.restore();
    }
  }

  dispose(): void {
    for (const entry of [...this.cache.values()]) entry.release();
    this.pass.dispose();
  }

  private printed(material: Material): Material {
    const source = asSurface(material) as CharacterSource;
    if (
      source.userData.characterEyeSurface ||
      source.userData.retro ||
      !source.color ||
      source.isMeshBasicMaterial ||
      source.isShadowMaterial
    )
      return source;
    let entry = this.cache.get(source);
    if (!entry) {
      const printed = retro(source.color.clone(), {
        map: source.map,
        side: source.side,
        transparent: source.transparent,
        opacity: source.opacity,
        alphaTest: source.alphaTest,
        mottle: 0.08,
        facetVariation: 0.1,
      });
      const release = () => {
        printed.dispose();
        this.cache.delete(source);
        source.removeEventListener('dispose', release);
      };
      source.addEventListener('dispose', release);
      entry = {material: printed, release};
      this.cache.set(source, entry);
    }
    const printed = entry.material;
    if (this.synced.has(source)) return printed;
    this.synced.add(source);
    // Absent properties count as their defaults (no map, smooth shading).
    const map = source.map ?? null;
    const bumpMap = source.bumpMap ?? null;
    const flatShading = source.flatShading ?? false;
    if (
      printed.map !== map ||
      printed.bumpMap !== bumpMap ||
      printed.flatShading !== flatShading ||
      printed.vertexColors !== source.vertexColors
    ) {
      printed.needsUpdate = true;
    }
    printed.map = map;
    printed.flatShading = flatShading;
    printed.vertexColors = source.vertexColors;
    printed.bumpMap = bumpMap;
    printed.bumpScale = source.bumpScale ?? 1;
    printed.color.copy(source.color);
    printed.wireframe = source.wireframe ?? false;
    if (source.emissive) printed.emissive.copy(source.emissive);
    printed.emissiveIntensity = source.emissiveIntensity ?? 1;
    return printed;
  }

  private apply(scene: Object3D): void {
    this.synced.clear();
    scene.traverseVisible((object) => {
      if (!isMesh(object)) return;
      const source = object.material;
      this.restored.push(object);
      this.sources.push(source);
      if (Array.isArray(source)) {
        let materials = this.arrays.get(source);
        if (!materials) {
          materials = [];
          this.arrays.set(source, materials);
        }
        materials.length = source.length;
        for (let i = 0; i < source.length; i++) materials[i] = this.printed(source[i]);
        object.material = materials;
      } else object.material = this.printed(source);
    });
  }

  private restore(): void {
    for (let i = 0; i < this.restored.length; i++) this.restored[i].material = this.sources[i];
    this.restored.length = this.sources.length = 0;
  }
}
