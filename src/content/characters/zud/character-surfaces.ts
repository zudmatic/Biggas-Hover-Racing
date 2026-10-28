import {
  BufferAttribute,
  CanvasTexture,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  MeshNormalMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {retro} from '@/render/materials/retro-material';
import {CHARACTER_SURFACE_SCALE, SURFACE_FAMILIES, SURFACE_REFERENCE, createSurfaceTexture} from '@/render/materials/surface-library';
import type {CharacterSettings} from './character-settings';

export type CharacterMaterialPart = 'skin' | 'hat' | 'eye' | 'pupil';

type RetroMaterial = ReturnType<typeof retro>;

/** Every material class `createCharacterMaterials` can produce. */
export type CharacterMaterial = MeshBasicMaterial | MeshToonMaterial | MeshNormalMaterial | MeshStandardMaterial | RetroMaterial;

export type CharacterMaterials = Record<CharacterMaterialPart, CharacterMaterial>;

/** The appearance settings that drive the shared character surfaces. */
export type CharacterSurfaceSettings = Pick<
  CharacterSettings,
  | 'material'
  | 'skinColor'
  | 'hatColor'
  | 'eyeColor'
  | 'pupilColor'
  | 'skinTexture'
  | 'hatTexture'
  | 'shading'
  | 'wireframe'
  | 'roughness'
  | 'metalness'
  | 'textureScale'
  | 'bump'
>;

type SurfaceFamily = keyof typeof SURFACE_FAMILIES;

/** Textures a material owns for its current source pattern. */
interface CharacterMaps {
  source: Texture | null;
  map: Texture | null;
  bumpMap: Texture | null;
}

const PARTS: readonly CharacterMaterialPart[] = ['skin', 'hat', 'eye', 'pupil'];

const COLOR_KEYS = {
  skin: 'skinColor',
  hat: 'hatColor',
  eye: 'eyeColor',
  pupil: 'pupilColor',
} as const satisfies Record<CharacterMaterialPart, keyof CharacterSurfaceSettings>;

const TEXTURE_KEYS = {
  skin: 'skinTexture',
  hat: 'hatTexture',
} as const satisfies Record<'skin' | 'hat', keyof CharacterSurfaceSettings>;

const isSurfaceFamily = (kind: unknown): kind is SurfaceFamily => typeof kind === 'string' && Object.hasOwn(SURFACE_FAMILIES, kind);

// All edited surfaces own their buffers, including copies of the shared print
// mesh. Smoothing welds positions before creating UVs, avoiding a seam in normals.
export function editableGeometry(source: BufferGeometry, smooth: boolean, scale = new Vector3(1, 1, 1)): BufferGeometry {
  let geometry = source.clone();
  for (const key of Object.keys(geometry.attributes)) {
    if (key !== 'position') geometry.deleteAttribute(key);
  }
  if (smooth) {
    const welded = mergeVertices(geometry);
    geometry.dispose();
    geometry = welded;
  }
  geometry.computeVertexNormals();
  // Per-triangle UVs can cross the cylindrical wrap without stretching a whole
  // image across the seam. Normals remain those of the welded geometry.
  if (geometry.index) {
    const unindexed = geometry.toNonIndexed();
    geometry.dispose();
    geometry = unindexed;
  }
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) throw new Error('editableGeometry: missing bounding box');
  const {min, max} = bounds;
  const cx = (min.x + max.x) / 2;
  const cz = (min.z + max.z) / 2;
  const positions = geometry.attributes.position;
  const uv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    uv[i * 2] = Math.atan2(positions.getX(i) - cx, positions.getZ(i) - cz) / (Math.PI * 2) + 0.5;
    uv[i * 2 + 1] = (positions.getY(i) - min.y) / Math.max(0.001, max.y - min.y);
  }
  for (let i = 0; i < positions.count; i += 3) {
    const u0 = uv[i * 2];
    const u1 = uv[(i + 1) * 2];
    const u2 = uv[(i + 2) * 2];
    if (Math.max(u0, u1, u2) - Math.min(u0, u1, u2) > 0.5) {
      for (let j = 0; j < 3; j++) {
        if (uv[(i + j) * 2] < 0.5) uv[(i + j) * 2] += 1;
      }
    }
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  // Channel 0 preserves old exports and custom images. Channel 1 measures the
  // physical surface so a stitch keeps its size on crown, cuff and pompom.
  const rx = ((max.x - min.x) * scale.x) / 2;
  const rz = ((max.z - min.z) * scale.z) / 2;
  const circumference = 2 * Math.PI * Math.sqrt((rx * rx + rz * rz) / 2) * CHARACTER_SURFACE_SCALE;
  const height = (max.y - min.y) * scale.y * CHARACTER_SURFACE_SCALE;
  const physical = uv.slice();
  for (let i = 0; i < positions.count; i++) {
    physical[i * 2] *= circumference;
    physical[i * 2 + 1] *= height;
  }
  geometry.setAttribute('uv1', new BufferAttribute(physical, 2));
  return geometry;
}

export function patternTexture(kind: string): Texture {
  if (isSurfaceFamily(kind)) return createSurfaceTexture(kind);
  if (kind === 'noise') {
    const pixels = new Uint8Array(128 * 128 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      const n = Math.sin(i * 12.9898) * 43758.5453;
      const v = 180 + Math.floor((n - Math.floor(n)) * 75);
      pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
      pixels[i + 3] = 255;
    }
    const texture = new DataTexture(pixels, 128, 128);
    texture.flipY = true;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('patternTexture: 2D canvas unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  if (kind === 'checker') {
    ctx.fillStyle = '#777777';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillRect(64, 64, 64, 64);
  } else if (kind === 'knit') {
    ctx.fillStyle = '#bbbbbb';
    ctx.fillRect(0, 0, 128, 128);
    ctx.lineCap = 'round';
    for (let y = -16; y < 144; y += 16) {
      for (let x = 0; x < 128; x += 16) {
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x + 2, y);
        ctx.lineTo(x + 8, y + 12);
        ctx.lineTo(x + 14, y);
        ctx.stroke();
        ctx.strokeStyle = '#eeeeee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 3, y);
        ctx.lineTo(x + 8, y + 9);
        ctx.lineTo(x + 13, y);
        ctx.stroke();
      }
    }
  }
  return new CanvasTexture(canvas);
}

function createPartMaterial(part: CharacterMaterialPart, settings: CharacterSurfaceSettings, comic: boolean): CharacterMaterial {
  const eyes = part === 'eye' || part === 'pupil';
  if (comic && !eyes) return retro(settings[COLOR_KEYS[part]], {mottle: 0.08, facetVariation: 0.1});
  if (eyes) return new MeshBasicMaterial({side: DoubleSide});
  if (settings.material === 'toon') return new MeshToonMaterial();
  if (settings.material === 'normal') return new MeshNormalMaterial();
  return new MeshStandardMaterial();
}

// Shared by the published character and the lab: the same settings produce
// identical surface colors, UVs and texture response in either scene.
export function createCharacterMaterials(settings: CharacterSurfaceSettings, {comic = false}: {comic?: boolean} = {}): CharacterMaterials {
  const create = (part: CharacterMaterialPart): CharacterMaterial => {
    const material = createPartMaterial(part, settings, comic);
    // Keep the sclera's chosen color under the room's warm/cool lights and
    // in shadow. Its shape and pupil clipping still come from the 3D mesh.
    if (part === 'eye') {
      material.toneMapped = false;
      material.userData.characterEyeSurface = true;
    }
    material.addEventListener('dispose', () => disposeMaterialMaps(material));
    return material;
  };
  return {skin: create('skin'), hat: create('hat'), eye: create('eye'), pupil: create('pupil')};
}

function characterMaps(material: Material): CharacterMaps | undefined {
  const value: unknown = material.userData.characterMaps;
  return typeof value === 'object' && value !== null && 'source' in value ? (value as CharacterMaps) : undefined;
}

function disposeMaterialMaps(material: Material): void {
  const owned = characterMaps(material);
  if (owned) {
    new Set([owned.map, owned.bumpMap]).forEach((texture) => texture?.dispose());
    delete material.userData.characterMaps;
  }
}

export function updateCharacterMaterials(
  materials: CharacterMaterials,
  settings: CharacterSurfaceSettings,
  maps: Map<string, Texture>,
): void {
  for (const part of PARTS) {
    const material = materials[part];
    if ('color' in material) material.color.set(settings[COLOR_KEYS[part]]);
    if (part === 'eye' || part === 'pupil') continue;
    const texture = maps.get(settings[TEXTURE_KEYS[part]]) ?? null;
    const sourceFamily: unknown = texture?.userData.surfaceFamily;
    const family = isSurfaceFamily(sourceFamily) ? sourceFamily : undefined;
    const preset = family ? SURFACE_FAMILIES[family] : undefined;
    let owned = characterMaps(material);
    // MeshToonMaterial has no flatShading of its own; the first update adds it.
    const flatShading: unknown = 'flatShading' in material ? material.flatShading : undefined;
    const changed = flatShading !== (settings.shading === 'flat') || owned?.source !== texture;
    if (owned?.source !== texture) {
      disposeMaterialMaps(material);
      const map = texture?.clone() ?? null;
      const bumpMap = family ? createSurfaceTexture(family, {heightMap: true}) : map;
      if (map) map.channel = preset ? 1 : 0;
      if (bumpMap) bumpMap.channel = preset ? 1 : 0;
      owned = {source: texture, map, bumpMap};
      material.userData.characterMaps = owned;
    }
    const repeat = preset ? (preset.density * settings.textureScale) / SURFACE_REFERENCE.repeat : settings.textureScale;
    owned.map?.repeat.setScalar(repeat);
    owned.bumpMap?.repeat.setScalar(repeat);
    material.userData.surfaceFamily = family ?? null;
    Object.assign(material, {flatShading: settings.shading === 'flat'});
    material.wireframe = settings.wireframe;
    if ('map' in material) material.map = owned.map;
    if ('roughness' in material) {
      material.roughness = settings.roughness;
      material.metalness = settings.metalness;
    }
    if ('bumpMap' in material) {
      material.bumpMap = owned.bumpMap;
      material.bumpScale = preset ? (preset.bump * settings.bump) / SURFACE_REFERENCE.bump : settings.bump;
    }
    if (changed) material.needsUpdate = true;
  }
}
