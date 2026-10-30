import {Vector3, type Object3D} from 'three';
import {isMesh} from '../scene-utils';

type Triangle = readonly [Vector3, Vector3, Vector3];
const CELL = 16;

/** Layered road query: at the overpass, keep the carriageway the ship is on. */
export class TokyoSurface {
  referenceHeight = 28;
  private readonly cells = new Map<string, Triangle[]>();

  constructor(triangles: Triangle[]) {
    for (const triangle of triangles) {
      const xs = triangle.map(p => p.x), zs = triangle.map(p => p.z);
      for (let x = Math.floor(Math.min(...xs) / CELL); x <= Math.floor(Math.max(...xs) / CELL); x++) {
        for (let z = Math.floor(Math.min(...zs) / CELL); z <= Math.floor(Math.max(...zs) / CELL); z++) {
          const key = `${x},${z}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key)!.push(triangle);
        }
      }
    }
  }

  height = (x: number, z: number): number | null => {
    const triangles = this.cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    let best: number | null = null, delta = Infinity;
    for (const [a, b, c] of triangles ?? []) {
      const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(den) < 1e-8) continue;
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den;
      const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den;
      // Millimetre-rounded route points can land just outside a Draco seam.
      if (u < -0.0002 || v < -0.0002 || u + v > 1.0002) continue;
      const y = u * a.y + v * b.y + (1 - u - v) * c.y;
      // A falling vehicle below an overpass cannot land on its upper face.
      // One metre allows the local rise of ramps and the suspension travel.
      if (y > this.referenceHeight + 1) continue;
      const d = Math.abs(y - this.referenceHeight);
      if (d < delta) { best = y; delta = d; }
    }
    return best;
  };
}

/** Floor/solid roles are authored in Blender, independently of render materials. */
export const isTokyoFloor = (object: Object3D): boolean =>
  object.userData.collision_role === 'floor' || object.name.startsWith('COL_FLOOR_');

export function extractTokyoCollision(root: Object3D): {root: Object3D; surface: TokyoSurface} {
  const triangles: Triangle[] = [];
  let solidCount = 0;
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!isMesh(object)) return;
    const {geometry} = object;
    const positions = geometry.attributes.position, index = geometry.index;
    const count = index?.count ?? positions.count;
    if (!isTokyoFloor(object)) { solidCount += count / 3; return; }
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map(k => new Vector3()
        .fromBufferAttribute(positions, index ? index.getX(i + k) : i + k)
        .applyMatrix4(object.matrixWorld));
      triangles.push(points as unknown as Triangle);
    }
  });
  if (!triangles.length || !solidCount) throw new Error('Tokyo: faltan superficies o paredes en el archivo de colisión.');
  return {root, surface: new TokyoSurface(triangles)};
}
