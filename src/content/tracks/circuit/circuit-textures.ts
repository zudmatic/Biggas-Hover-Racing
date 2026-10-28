import {BufferAttribute, DataTexture, LinearFilter, LinearMipmapLinearFilter, MathUtils, RepeatWrapping} from 'three';
import type {Material, MeshBasicMaterial, Object3D, Texture} from 'three';
import type {TrackTextures} from '../track';
import {isMesh} from '../scene-utils';

export type CircuitSurfaceKind =
  | 'asphalt'
  | 'bark'
  | 'foliage'
  | 'moss'
  | 'foam'
  | 'water'
  | 'rock'
  | 'brick'
  | 'glass'
  | 'fabric'
  | 'paint'
  | 'metal'
  | 'concrete';

// Small, seamless, deterministic material tiles. UVs are measured in metres so
// merged scenery keeps the same grain scale across walls, ramps and cliff faces.
export function circuitSurface(name = ''): CircuitSurfaceKind {
  if (/road|asphalt|grid/i.test(name)) return 'asphalt';
  if (/bark|wood/i.test(name)) return 'bark';
  if (/pine|fern|foliage|leaf/i.test(name)) return 'foliage';
  if (/moss|soil/i.test(name)) return 'moss';
  if (/foam/i.test(name)) return 'foam';
  if (/water|fall|océano/i.test(name)) return 'water';
  if (/rock|island|stone/i.test(name)) return 'rock';
  if (/brick/i.test(name)) return 'brick';
  if (/glazing|glass/i.test(name)) return 'glass';
  if (/flag|bandera|cloth|awning/i.test(name)) return 'fabric';
  if (/kerb|marking|paint|cone/i.test(name)) return 'paint';
  if (/graphite|mechanism|metal|signage|farola|light|lens|steel|copper|cyan|amber/i.test(name)) return 'metal';
  return 'concrete';
}

/** [UV tile size in metres, bump scale, roughness]. */
const PROFILES: Record<CircuitSurfaceKind, readonly [number, number, number]> = {
  brick: [3, 0.035, 0.92],
  asphalt: [4, 0.035, 0.97],
  concrete: [6, 0.065, 0.93],
  rock: [8, 0.13, 0.96],
  bark: [2, 0.09, 0.95],
  foliage: [1.4, 0.025, 0.94],
  moss: [2.5, 0.055, 1],
  water: [9, 0.045, 0.38],
  foam: [2, 0.015, 0.85],
  glass: [5, 0.005, 0.25],
  fabric: [1, 0.018, 0.95],
  paint: [2, 0.018, 0.8],
  metal: [2, 0.016, 0.58],
};

const fract = (x: number): number => x - Math.floor(x);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const hash = (x: number, y: number): number => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);

function noise(u: number, v: number, n: number): number {
  const x = u * n;
  const y = v * n;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const a = fract(x);
  const b = fract(y);
  const s = a * a * (3 - 2 * a);
  const t = b * b * (3 - 2 * b);
  const h = (i: number, j: number): number => hash((i + n) % n, (j + n) % n);
  return mix(mix(h(ix, iy), h(ix + 1, iy), s), mix(h(ix, iy + 1), h(ix + 1, iy + 1), s), t);
}

// Broken cell edges form irregular, branching asphalt fissures rather than stripes.
function crackDistance(u: number, v: number): number {
  const cells = 3;
  const x = fract(u) * cells;
  const y = fract(v) * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let first = Infinity;
  let second = Infinity;
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      const cx = ix + a;
      const cy = iy + b;
      const hx = (cx + cells) % cells;
      const hy = (cy + cells) % cells;
      const dx = cx + 0.15 + hash(hx, hy) * 0.7 - x;
      const dy = cy + 0.15 + hash(hx + 19, hy + 7) * 0.7 - y;
      const d = dx * dx + dy * dy;
      if (d < first) {
        second = first;
        first = d;
      } else if (d < second) {
        second = d;
      }
    }
  }
  return second - first;
}

/** Height (bump) and albedo value of one texel of a surface tile. */
function sampleSurface(kind: CircuitSurfaceKind, x: number, y: number, size: number): {height: number; value: number; fine: number} {
  const u = x / size;
  const v = y / size;
  const n = noise(u, v, 8);
  const fine = noise(u, v, 64);
  const grain = hash(x, y);
  const tau = Math.PI * 2;
  let height = 0.5;
  let value = 0.86;
  if (kind === 'asphalt') {
    const crack = crackDistance(u + n * 0.025, v + n * 0.025) < 0.018 && fine < 0.67 ? 1 : 0;
    height = 0.32 + grain * 0.4 - crack * 0.15;
    value = 0.73 + grain * 0.24 - crack * 0.15;
  }
  if (kind === 'concrete') {
    const seam = fract(v * 3) < 0.012 || fract(u * 2 + (Math.floor(v * 3) % 2) * 0.5) < 0.01;
    height = seam ? 0.1 : 0.42 + n * 0.22 + fine * 0.09;
    value = seam ? 0.48 : 0.69 + n * 0.25 + (grain - 0.5) * 0.07;
  }
  if (kind === 'rock') {
    const strata = Math.sin(tau * (v * 9 + n * 0.5));
    const crack = Math.abs(Math.sin(tau * (u * 3 + noise(u, v, 4) * 0.6))) < 0.07;
    height = 0.25 + n * 0.5 + strata * 0.07 - (crack ? 0.2 : 0);
    value = 0.62 + n * 0.3 + strata * 0.07 - (crack ? 0.15 : 0);
  }
  if (kind === 'brick') {
    const seam = fract(v * 9) < 0.06 || fract(u * 5 + (Math.floor(v * 9) % 2) * 0.5) < 0.035;
    height = seam ? 0.15 : 0.6 + n * 0.12;
    value = seam ? 0.48 : 0.7 + n * 0.23;
  }
  if (kind === 'bark') {
    const grooves = Math.pow(Math.abs(Math.sin(tau * (u * 12 + noise(u, v, 8) * 0.35))), 0.5);
    height = grooves * 0.65 + n * 0.25;
    value = 0.5 + grooves * 0.39 + grain * 0.08;
  }
  if (kind === 'foliage') {
    const needles = Math.pow(Math.abs(Math.sin(tau * (u * 17 + v * 11))), 10);
    height = 0.35 + n * 0.35 + needles * 0.15;
    value = 0.62 + n * 0.28 + needles * 0.12;
  }
  if (kind === 'moss') {
    height = 0.2 + n * 0.45 + fine * 0.3;
    value = 0.55 + n * 0.28 + fine * 0.19;
  }
  if (kind === 'water' || kind === 'foam') {
    const ripple = Math.sin(tau * (u * 4 + v * 7 + noise(u, v, 4) * 0.55));
    height = 0.5 + ripple * 0.22;
    value = kind === 'foam' ? 0.74 + fine * 0.26 : 0.72 + ripple * 0.12 + n * 0.12;
  }
  if (kind === 'glass') {
    const streak = Math.pow(Math.abs(Math.sin(tau * (u * 23 + v))), 20);
    height = 0.5;
    value = 0.91 + streak * 0.07;
  }
  if (kind === 'fabric') {
    const weave = x % 4 < 2 === y % 4 < 2 ? 1 : 0;
    height = 0.4 + weave * 0.18;
    value = 0.78 + weave * 0.11 + n * 0.08;
  }
  if (kind === 'paint') {
    const chip = grain > 0.93 && fine > 0.55;
    height = chip ? 0.2 : 0.65;
    value = chip ? 0.42 : 0.87 + n * 0.1;
  }
  if (kind === 'metal') {
    const seam = fract(u * 2) < 0.012 || fract(v * 2) < 0.012;
    const bolt = Math.hypot(fract(u * 2) - 0.06, fract(v * 2) - 0.06) < 0.018;
    height = seam ? 0.15 : bolt ? 0.85 : 0.5;
    value = seam ? 0.48 : bolt ? 0.99 : 0.79 + noise(u, v, 32) * 0.12;
  }
  return {height, value, fine};
}

interface SurfaceMaps {
  map: DataTexture;
  bumpMap: DataTexture;
  roughnessMap: DataTexture;
}

/** The texture slots a circuit material may receive. */
type SurfaceMaterial = Material & {
  map?: Texture | null;
  bumpMap?: Texture | null;
  bumpScale?: number;
  roughnessMap?: Texture | null;
  roughness?: number;
};

/**
 * Generates (once per surface kind) and applies the tiling surface textures,
 * plus world-metre planar UVs. Authored textures are left untouched.
 */
export class CircuitTextures implements TrackTextures {
  private readonly cache = new Map<CircuitSurfaceKind, SurfaceMaps>();
  private readonly anisotropy: number;
  private readonly size: number;

  constructor({anisotropy = 4, size = 256}: {anisotropy?: number; size?: number} = {}) {
    this.anisotropy = anisotropy;
    this.size = size;
  }

  get count(): number {
    return this.cache.size;
  }

  apply(object: Object3D): void {
    if (!isMesh(object) || Array.isArray(object.material)) return;
    const mesh = object;
    const material = mesh.material as SurfaceMaterial;
    if (material.transparent) return;
    const kind = (material.userData.circuitSurface as CircuitSurfaceKind | undefined) ?? circuitSurface(material.name || mesh.name);
    const profile = PROFILES[kind];
    if (material.map && !material.userData.circuitSurface) return; // Preserve any authored textures.
    if (!material.userData.circuitSurface) {
      const maps = this.tile(kind);
      material.map = maps.map;
      if (!(material as MeshBasicMaterial).isMeshBasicMaterial) {
        material.bumpMap = maps.bumpMap;
        material.bumpScale = profile[1];
        material.roughnessMap = maps.roughnessMap;
        material.roughness = profile[2];
      }
      material.userData.circuitSurface = kind;
      material.needsUpdate = true;
    }
    const geometry = mesh.geometry;
    if (geometry.userData.circuitUV) return;
    const p = geometry.attributes.position;
    const n = geometry.attributes.normal as BufferAttribute | undefined;
    const uv = new Float32Array(p.count * 2);
    const scale = 1 / profile[0];
    for (let i = 0; i < p.count; i++) {
      // Non-indexed imported faces share one projection axis per triangle.
      const j = geometry.index ? i : Math.floor(i / 3) * 3;
      const nx = Math.abs(n?.getX(j) ?? 0);
      const ny = Math.abs(n?.getY(j) ?? 1);
      const nz = Math.abs(n?.getZ(j) ?? 0);
      uv[i * 2] = (nx > ny && nx > nz ? p.getZ(i) : p.getX(i)) * scale;
      uv[i * 2 + 1] = (ny >= nx && ny >= nz ? p.getZ(i) : p.getY(i)) * scale;
    }
    geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    geometry.userData.circuitUV = true;
  }

  applyRoot(root: Object3D): void {
    root.traverse((object) => this.apply(object));
  }

  dispose(): void {
    for (const maps of this.cache.values()) {
      maps.map.dispose();
      maps.bumpMap.dispose();
      maps.roughnessMap.dispose();
    }
    this.cache.clear();
  }

  private tile(kind: CircuitSurfaceKind): SurfaceMaps {
    const cached = this.cache.get(kind);
    if (cached) return cached;
    const size = this.size;
    const color = new Uint8Array(size * size * 4);
    const height = new Uint8Array(size * size * 4);
    const rough = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const sample = sampleSurface(kind, x, y, size);
        const i = (y * size + x) * 4;
        const r = Math.round(MathUtils.clamp(sample.value, 0, 1) * 255);
        const b = Math.round(MathUtils.clamp(sample.height, 0, 1) * 255);
        const roughness = Math.round((0.78 + sample.fine * 0.22) * 255);
        color[i] = color[i + 1] = color[i + 2] = r;
        color[i + 3] = 255;
        height[i] = height[i + 1] = height[i + 2] = b;
        height[i + 3] = 255;
        rough[i] = rough[i + 1] = rough[i + 2] = roughness;
        rough[i + 3] = 255;
      }
    }
    const texture = (data: Uint8Array, label: string): DataTexture => {
      const t = new DataTexture(data, size, size);
      t.name = `Ruinas · ${kind} · ${label}`;
      t.wrapS = t.wrapT = RepeatWrapping;
      t.magFilter = LinearFilter;
      t.minFilter = LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = this.anisotropy;
      t.needsUpdate = true;
      return t;
    };
    const maps = {map: texture(color, 'color'), bumpMap: texture(height, 'relieve'), roughnessMap: texture(rough, 'rugosidad')};
    this.cache.set(kind, maps);
    return maps;
  }
}
