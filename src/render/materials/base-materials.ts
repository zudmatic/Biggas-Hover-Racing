import {MeshLambertMaterial, type Material, type Mesh, type Object3D} from 'three';
import type {Disposable} from '@/core/disposable';
import {asSurface, isMesh, materialList, type MeshMaterial} from '../scene-utils';

export interface BaseMaterialStats {
  meshes: number;
  textured: number;
  transparent: number;
  /** Meshes hidden because they use custom GLSL. */
  customExcluded: number;
}

/**
 * The stage-one baseline deliberately excludes custom GLSL. Keep maps, alpha,
 * sides, emissive, skinning and the native lighting model on both backends:
 * retro() materials become plain Lambert copies, ShaderMaterial meshes are
 * hidden until dispose() restores everything.
 */
export class BaseMaterials implements Disposable {
  readonly stats: BaseMaterialStats = {meshes: 0, textured: 0, transparent: 0, customExcluded: 0};

  private readonly replacements = new Map<Material, MeshLambertMaterial>();
  private readonly originals: [Mesh, MeshMaterial][] = [];
  private readonly hidden: [Mesh, boolean][] = [];

  constructor(root: Object3D) {
    root.traverse((object) => {
      if (!isMesh(object)) return;
      const materials = materialList(object.material);
      if (materials.some((material) => asSurface(material).isShaderMaterial)) {
        this.hidden.push([object, object.visible]);
        object.visible = false;
        this.stats.customExcluded++;
        return;
      }
      this.stats.meshes++;
      if (materials.some((material) => (material as Material & {map?: unknown}).map)) this.stats.textured++;
      if (materials.some((material) => material.transparent)) this.stats.transparent++;
      this.originals.push([object, object.material]);
      object.material = Array.isArray(object.material) ? materials.map((material) => this.base(material)) : this.base(object.material);
    });
  }

  dispose(): void {
    for (const [mesh, material] of this.originals) mesh.material = material;
    for (const [mesh, visible] of this.hidden) mesh.visible = visible;
    for (const material of this.replacements.values()) material.dispose();
  }

  private base(source: Material): Material {
    if (asSurface(source).isNodeMaterial || !source.userData.retro) return source;
    const cached = this.replacements.get(source);
    if (cached) return cached;
    const material = new MeshLambertMaterial();
    material.copy(source as MeshLambertMaterial);
    material.userData = {};
    material.defines = {};
    this.replacements.set(source, material);
    return material;
  }
}
