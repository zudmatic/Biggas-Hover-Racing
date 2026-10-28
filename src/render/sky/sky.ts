import {
  Float32BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  type Camera,
  type Group,
} from 'three';
import type {Disposable} from '@/core/disposable';

export interface SkyUpdateOptions {
  night?: boolean;
  dt?: number;
  reducedMotion?: boolean;
}

/** A track's sky: a camera-following dome with sun/moon and stars. */
export interface Sky extends Disposable {
  readonly root: Group;
  readonly dome: Mesh;
  readonly sun: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly stars: Points<BufferGeometry, PointsMaterial>;
  /** Cloud instances drawn (0 when the clouds are painted into the dome). */
  readonly cloudCount: number;
  update(camera: Camera, time: number, options?: SkyUpdateOptions): void;
}

/** Deterministic LCG in [0, 1): the same sky on every load. */
export function seededRandom(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** The sun (and, blended at night, the moon) disc. */
export function createSunDisc(): Mesh<SphereGeometry, MeshBasicMaterial> {
  const sun = new Mesh(new SphereGeometry(38, 20, 12), new MeshBasicMaterial({color: 0xffe4a2, fog: false, depthWrite: false}));
  sun.name = 'Sol y luna';
  sun.renderOrder = -900;
  return sun;
}

/** Stars on the upper hemisphere, faded in by night. */
export function createStarField(random: () => number, count: number): Points<BufferGeometry, PointsMaterial> {
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const y = 0.13 + random() * 0.85;
    const r = Math.sqrt(1 - y * y);
    positions.push(Math.cos(angle) * r * 3900, y * 3900, Math.sin(angle) * r * 3900);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new PointsMaterial({color: 0xd6e9ff, size: 7, transparent: true, opacity: 0, depthWrite: false, fog: false});
  const stars = new Points(geometry, material);
  stars.name = 'Estrellas';
  stars.renderOrder = -950;
  return stars;
}
