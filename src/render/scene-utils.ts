import type {Color, Material, Mesh, Object3D, Texture} from 'three';

/** Material type flags read when deciding which surfaces a look converts. */
export interface MaterialFlags {
  isNodeMaterial?: boolean;
  isShaderMaterial?: boolean;
  isMeshBasicMaterial?: boolean;
  isShadowMaterial?: boolean;
  isMeshStandardMaterial?: boolean;
}

/** A material with the optional color properties of three's lit materials. */
export type SurfaceMaterial = Material &
  MaterialFlags & {
    color?: Color;
    map?: Texture | null;
    emissive?: Color;
    emissiveIntensity?: number;
  };

export type MeshMaterial = Material | Material[];

export function isMesh(object: Object3D): object is Mesh {
  return (object as Partial<Mesh>).isMesh === true;
}

/** A mesh's material slot as a list. */
export function materialList(material: MeshMaterial): Material[] {
  return Array.isArray(material) ? material : [material];
}

export function asSurface(material: Material): SurfaceMaterial {
  return material as SurfaceMaterial;
}
