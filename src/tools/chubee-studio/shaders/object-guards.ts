import type {Bone, Material, Mesh, Object3D, SkinnedMesh, Texture} from 'three';

// Duck-typed checks (the `is*` flags three sets on every instance), so they also hold across bundles.
export const isMesh = (object: Object3D): object is Mesh => (object as Mesh).isMesh === true;
export const isSkinnedMesh = (object: Object3D): object is SkinnedMesh => (object as SkinnedMesh).isSkinnedMesh === true;
export const isBone = (object: Object3D): object is Bone => (object as Bone).isBone === true;
export const isTexture = (value: unknown): value is Texture =>
  typeof value === 'object' && value !== null && (value as Texture).isTexture === true;

/** A mesh's material slot as a list, whether it holds one material or several. */
export const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
