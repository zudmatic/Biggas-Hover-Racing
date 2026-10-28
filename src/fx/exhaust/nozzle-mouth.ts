import {Matrix4, Vector3, type BufferAttribute, type InterleavedBufferAttribute, type Mesh, type Object3D} from 'three/webgpu';
import type {ExhaustMount} from '@/content/vehicles/vehicle-definition';

/** Where a flame roots, in ship units: distance behind the nozzle mount and the exit radius. */
export interface NozzleMouth {
  start: number;
  radius: number;
}

/** Twin rear nozzles, used when a ship declares none. */
export const DEFAULT_NOZZLES: readonly ExhaustMount[] = [
  [-0.68, 0.62, -2.14, 0.24],
  [0.68, 0.62, -2.14, 0.24],
];

const isMesh = (object: Object3D): object is Mesh => (object as Mesh).isMesh === true;

// Measures where each nozzle's housing ends in the ship model, so the flame can start at the mouth.
// Root-local model units; nozzles fire toward -z. Each vertex belongs only to its nearest nozzle (by radius),
// so a big housing never claims a small neighbour; the inner radial cut skips hot cores, the axial window keeps
// unrelated hull geometry further back from pulling the exit plane. Subtrees flagged nozzleInsert (the engine
// core) are skipped: they report their own mouth analytically.
export function measureNozzleMouths(root: Object3D, nozzles: readonly ExhaustMount[]): NozzleMouth[] {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const matrix = new Matrix4();
  const point = new Vector3();
  // Flat [radial, z, radial, z, …] per nozzle.
  const hits: number[][] = nozzles.map(() => []);

  const visit = (object: Object3D): void => {
    if (object.userData.nozzleInsert) return;
    const position: BufferAttribute | InterleavedBufferAttribute | undefined = isMesh(object)
      ? object.geometry?.attributes?.position
      : undefined;
    if (position) {
      matrix.multiplyMatrices(toRoot, object.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(matrix);
        let nearest = -1;
        let best = Infinity;
        let radial = 0;
        for (let n = 0; n < nozzles.length; n++) {
          const [x, y, , r] = nozzles[n];
          const d = Math.hypot(point.x - x, point.y - y);
          if (d / r < best) {
            best = d / r;
            nearest = n;
            radial = d;
          }
        }
        if (nearest < 0) continue;
        const [, , z, r] = nozzles[nearest];
        if (radial >= 0.5 * r && radial <= 2.5 * r && point.z >= z - 6 * r && point.z <= z + r) hits[nearest].push(radial, point.z);
      }
    }
    for (const child of object.children) visit(child);
  };
  visit(root);

  return nozzles.map(([, , z, r], n) => {
    const found = hits[n];
    if (!found.length) return {start: 0, radius: 1.1 * r};
    let rear = Infinity;
    let radius = Infinity;
    for (let i = 1; i < found.length; i += 2) rear = Math.min(rear, found[i]);
    for (let i = 0; i < found.length; i += 2) if (found[i + 1] <= rear + 0.25 * r) radius = Math.min(radius, found[i]);
    return {start: Math.max(0, z - rear), radius};
  });
}

/**
 * The flame roots at whichever exit is further back; while the engine insert is shown, its lip sets the width.
 * Pass `out` to reuse its entries instead of allocating every frame.
 */
export function combineMouths(
  model: readonly NozzleMouth[],
  engine: readonly NozzleMouth[] | null,
  out: NozzleMouth[] = [],
): readonly NozzleMouth[] {
  if (!engine) return model;
  out.length = model.length;
  for (let i = 0; i < model.length; i++) {
    const mouth = (out[i] ??= {start: 0, radius: 0});
    mouth.start = Math.max(model[i].start, engine[i].start);
    mouth.radius = engine[i].radius;
  }
  return out;
}
