import {
  BufferAttribute,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
} from 'three';

// One visual scale for the room and the enlarged model in the lab. Values are
// in room units; the lab keeps the character's authored size for inspection.
export const CHARACTER_SURFACE_SCALE = 0.44;
export const SURFACE_REFERENCE = Object.freeze({repeat: 3, bump: 0.1});

export interface SurfaceFamily {
  readonly label: string;
  /** Texture repeats per UV unit. */
  readonly density: number;
  readonly contrast: number;
  readonly bump: number;
  readonly mottle: number;
  readonly facets: number;
}

const family = (label: string, density: number, contrast: number, bump: number, mottle: number, facets: number): SurfaceFamily =>
  Object.freeze({label, density, contrast, bump, mottle, facets});

export const SURFACE_FAMILIES = Object.freeze({
  skin: family('Piel mate', 3.6, 0.045, 0.0025, 0, 0.1),
  fabric: family('Tejido suave', 6, 0.1, 0.002, 0.015, 0.12),
  wood: family('Madera', 1.6, 0.14, 0.018, 0.02, 0.14),
  plaster: family('Yeso', 2.8, 0.065, 0.005, 0.02, 0.1),
  metal: family('Metal satinado', 3, 0.035, 0.0015, 0, 0.06),
});

export type SurfaceKind = keyof typeof SURFACE_FAMILIES;

// Keep the approved warm palette in one place. Textures are neutral and never
// bake a second tint into these dyes.
export const ROOM_SURFACE_COLORS = Object.freeze({
  plaster: 0xf0dcb9,
  plasterTop: 0xfaf6f0,
  wood: 0xc0834f,
  woodDark: 0x9a6238,
  planks: Object.freeze([0xbf8350, 0xb07446, 0xc98f5a, 0xa56a3e]),
  blanket: 0x565d86,
  linen: 0xf4f1ec,
  rug: 0x1f1d22,
  blind: 0xc9b391,
  steel: 0xa5a0b5,
});

const SIZE = 128;
const TAU = Math.PI * 2;

const hash = (x: number, y: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const fade = (x: number): number => x * x * (3 - 2 * x);

// Periodic bilinear noise: all presets tile seamlessly, including their height
// maps. Fixed seeds make the room and lab deterministic across reloads.
function noise(u: number, v: number, cells = 16): number {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const at = (dx: number, dy: number) => hash((ix + dx) % cells, (iy + dy) % cells);
  return MathUtils.lerp(MathUtils.lerp(at(0, 0), at(1, 0), fx), MathUtils.lerp(at(0, 1), at(1, 1), fx), fy);
}

function height(kind: SurfaceKind, u: number, v: number): number {
  if (kind === 'fabric') {
    // Four repeating V-shaped stitches per tile, softened for the small room.
    const x = (u * 4) % 1;
    const y = (v * 4) % 1;
    const stitch = Math.cos(TAU * (y - Math.abs(x - 0.5) * 1.15));
    return 0.5 + 0.38 * stitch + 0.06 * (noise(u, v, 32) - 0.5);
  }
  if (kind === 'wood')
    return 0.5 + 0.3 * Math.sin(TAU * (v * 8 + 0.24 * Math.sin(TAU * u) + 0.12 * Math.sin(TAU * u * 3))) + 0.12 * (noise(u, v, 32) - 0.5);
  if (kind === 'metal') return 0.5 + 0.15 * Math.sin(TAU * v * 32) + 0.02 * Math.sin(TAU * u * 2) * Math.sin(TAU * v * 16);
  return 0.15 + 0.7 * noise(u, v, kind === 'skin' ? 48 : 24);
}

const isSurfaceKind = (kind: string): kind is SurfaceKind => Object.hasOwn(SURFACE_FAMILIES, kind);

/** A neutral, tileable color (or height) texture of one surface family. */
export function createSurfaceTexture(kind: string, {heightMap = false}: {heightMap?: boolean} = {}): DataTexture {
  if (!isSurfaceKind(kind)) throw new Error(`Unknown surface family: ${kind}`);
  const preset = SURFACE_FAMILIES[kind];
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const value = MathUtils.clamp(height(kind, x / SIZE, y / SIZE), 0, 1);
      const gray = Math.round(255 * (heightMap ? value : 1 - preset.contrast * (1 - value)));
      const i = (y * SIZE + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
      pixels[i + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, SIZE, SIZE);
  texture.name = `${preset.label} · ${heightMap ? 'relieve' : 'color'}`;
  texture.colorSpace = heightMap ? NoColorSpace : SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.setScalar(preset.density);
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  texture.userData.surfaceFamily = kind;
  return texture;
}

// Box-like room surfaces use physical coordinates instead of stretching one
// tile over every object. Logos and photographic maps keep their authored UVs.
export function setRoomSurfaceUV(geometry: BufferGeometry, scale = new Vector3(1, 1, 1)): BufferGeometry {
  const p = geometry.attributes.position;
  const n = geometry.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = Math.abs(n.getX(i));
    const y = Math.abs(n.getY(i));
    const z = Math.abs(n.getZ(i));
    const a = y >= x && y >= z ? p.getX(i) * scale.x : x >= z ? p.getZ(i) * scale.z : p.getX(i) * scale.x;
    const b = y >= x && y >= z ? p.getZ(i) * scale.z : p.getY(i) * scale.y;
    uv[i * 2] = a;
    uv[i * 2 + 1] = b;
  }
  const current = geometry.getAttribute('uv');
  if (current && current.array.length === uv.length) {
    current.array.set(uv);
    current.needsUpdate = true;
  } else geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  return geometry;
}
