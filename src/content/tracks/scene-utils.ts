import type {InstancedMesh, Material, Mesh, Object3D, Texture} from 'three';

// Flag checks instead of `instanceof`: GLTF scenes, node materials and addons
// may come from different three bundles in development.
export const isMesh = (object: Object3D): object is Mesh => (object as Partial<Mesh>).isMesh === true;
export const isInstancedMesh = (object: Object3D): object is InstancedMesh => (object as Partial<InstancedMesh>).isInstancedMesh === true;
export const isTexture = (value: unknown): value is Texture =>
  typeof value === 'object' && value !== null && (value as Partial<Texture>).isTexture === true;

export const materialsOf = (material: Material | Material[]): Material[] => (Array.isArray(material) ? material : [material]);
