import {Mesh, Texture, type BufferGeometry, type Material, type Object3D} from 'three';
import type {Disposable} from '@/core/disposable';

export const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/** Geometries, materials and material textures reachable from some objects, released together. */
export class ResourceSet implements Disposable {
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly textures = new Set<Texture>();

  /** Every mesh geometry, material and texture under `root`. */
  addTree(root: Object3D): this {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      this.geometries.add(object.geometry);
      for (const material of materialsOf(object)) this.addMaterial(material);
    });
    return this;
  }

  /** Materials and textures only; for trees whose geometry is released separately. */
  addMaterialsOf(root: Object3D): this {
    root.traverse((object) => {
      if (object instanceof Mesh) for (const material of materialsOf(object)) this.addMaterial(material);
    });
    return this;
  }

  addMaterial(material: Material): this {
    this.materials.add(material);
    const values: unknown[] = Object.values(material);
    for (const value of values) if (value instanceof Texture) this.textures.add(value);
    return this;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
  }
}
