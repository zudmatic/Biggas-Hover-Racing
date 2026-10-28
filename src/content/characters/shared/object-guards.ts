import type {
  Bone,
  BufferAttribute,
  BufferGeometry,
  InterleavedBufferAttribute,
  Material,
  Mesh,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Texture,
} from 'three';
import type {Disposable} from '@/core/disposable';

// Flag checks instead of instanceof: 'three' and 'three/webgpu' can both be loaded.
export const isMesh = (object: Object3D): object is Mesh => (object as Partial<Mesh>).isMesh === true;
export const isSkinnedMesh = (object: Object3D): object is SkinnedMesh => (object as Partial<SkinnedMesh>).isSkinnedMesh === true;
export const isBone = (object: Object3D): object is Bone => (object as Partial<Bone>).isBone === true;
export const isTexture = (value: unknown): value is Texture =>
  typeof value === 'object' && value !== null && (value as Partial<Texture>).isTexture === true;

/** A geometry attribute as a plain buffer; procedural character meshes never interleave. */
export function attributeOf(geometry: BufferGeometry, name: string): BufferAttribute {
  const attribute: BufferAttribute | InterleavedBufferAttribute | undefined = geometry.attributes[name];
  if (!attribute) throw new Error(`Geometría sin atributo ${name}`);
  if ((attribute as Partial<InterleavedBufferAttribute>).isInterleavedBufferAttribute)
    throw new Error('Geometría intercalada no soportada');
  return attribute as BufferAttribute;
}

export const positionsOf = (geometry: BufferGeometry): BufferAttribute => attributeOf(geometry, 'position');

export const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/** Every texture referenced by a material's own properties (map, normalMap…). */
export function texturesOf(material: Material): Texture[] {
  return Object.values(material as unknown as Record<string, unknown>).filter(isTexture);
}

/** Named bones of a loaded rig. Throws on a missing bone so rig mismatches fail loudly. */
export class BoneMap {
  private readonly bones = new Map<string, Bone>();

  add(bone: Bone): void {
    this.bones.set(bone.name, bone);
  }

  find(name: string): Bone | undefined {
    return this.bones.get(name);
  }

  get(name: string): Bone {
    const bone = this.bones.get(name);
    if (!bone) throw new Error(`Hueso no encontrado: ${name}`);
    return bone;
  }

  entries(): IterableIterator<[string, Bone]> {
    return this.bones.entries();
  }
}

/**
 * GPU resources owned by one loaded model. Each actor parses its own scene, so
 * releasing them never affects another preview or vehicle.
 */
export class ModelResources implements Disposable {
  readonly geometries = new Set<BufferGeometry>();
  readonly materials = new Set<Material>();
  readonly textures = new Set<Texture>();
  readonly skeletons = new Set<Skeleton>();

  /** Records a mesh's geometry, skeleton and materials (with their textures unless disabled). */
  addMesh(mesh: Mesh, {textures = true}: {textures?: boolean} = {}): void {
    this.geometries.add(mesh.geometry);
    if (isSkinnedMesh(mesh) && mesh.skeleton) this.skeletons.add(mesh.skeleton);
    for (const material of materialsOf(mesh)) {
      this.materials.add(material);
      if (textures) for (const texture of texturesOf(material)) this.textures.add(texture);
    }
  }

  dispose(): void {
    this.skeletons.forEach((value) => value.dispose());
    this.geometries.forEach((value) => value.dispose());
    this.materials.forEach((value) => value.dispose());
    this.textures.forEach((value) => value.dispose());
  }
}
