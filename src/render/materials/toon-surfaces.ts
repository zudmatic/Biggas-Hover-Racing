import {MeshStandardMaterial, type Material, type MeshBasicMaterial, type Object3D} from 'three';
import {asSurface, isMesh, materialList} from '../scene-utils';

const BAND = /\s+toon\s+(\d)$/;

const isBasic = (material: Material): material is MeshBasicMaterial => asSurface(material).isMeshBasicMaterial === true;

export interface ToonSurfaceResult {
  /** Lit materials created, one per family. */
  families: number;
  /** Banded materials replaced (and disposed). */
  replaced: number;
}

// Bulldog 039's LOD0 bakes a three-band toon into unlit materials named
// "<family> toon 0|1|2" (dark, mid, light). Band 2 is the authored albedo.
// One lit material per family hands shading back to the game's comic shader,
// so the ship responds to sun, shadows, night and headlights like the others.
// Unlit materials without a band (the eye graphic) are left untouched.
export function lightToonSurfaces(root: Object3D): ToonSurfaceResult {
  const families = new Map<string, {band: number; material: MeshBasicMaterial}>();
  const replaced = new Set<Material>();
  root.traverse((object) => {
    if (!isMesh(object)) return;
    for (const material of materialList(object.material)) {
      const match = isBasic(material) ? material.name.match(BAND) : null;
      if (!match || !isBasic(material)) continue;
      const name = material.name.replace(BAND, '');
      const band = Number(match[1]);
      const family = families.get(name);
      if (!family || band > family.band) families.set(name, {band, material});
    }
  });
  const lit = new Map(
    [...families].map(([name, {material}]) => [
      name,
      new MeshStandardMaterial({name, color: material.color, side: material.side, roughness: 0.72, metalness: 0}),
    ]),
  );
  const convert = (material: Material): Material => {
    const replacement = isBasic(material) && BAND.test(material.name) ? lit.get(material.name.replace(BAND, '')) : undefined;
    if (!replacement) return material;
    replaced.add(material);
    return replacement;
  };
  root.traverse((object) => {
    if (isMesh(object)) object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
  });
  replaced.forEach((material) => material.dispose());
  return {families: lit.size, replaced: replaced.size};
}
