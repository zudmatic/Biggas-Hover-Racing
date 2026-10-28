import {Color, InstancedMesh, Matrix4} from 'three';
import type {Object3D} from 'three';
import {isInstancedMesh} from '../scene-utils';

export interface PartitionOptions {
  cellSize?: number;
  maxInstances?: number;
  /** Instanced meshes left as they are (e.g. ones replaced right after). */
  skip?: (mesh: InstancedMesh) => boolean;
}

// r182 puts small instance arrays in uniform blocks. Some WebGL2 devices
// allow only 16 KB per block, so keep batches below that limit. Spatial cells
// also let the renderer cull vegetation without changing any placement.
export function partitionDesertInstances(root: Object3D, {cellSize = 200, maxInstances = 128, skip}: PartitionOptions = {}): void {
  root.updateMatrixWorld(true);
  const sources: InstancedMesh[] = [];
  root.traverse((object) => {
    if (isInstancedMesh(object) && !skip?.(object)) sources.push(object);
  });
  const local = new Matrix4();
  const world = new Matrix4();
  const color = new Color();
  for (const source of sources) {
    const cells = new Map<string, number[]>();
    for (let i = 0; i < source.count; i++) {
      source.getMatrixAt(i, local);
      world.multiplyMatrices(source.matrixWorld, local);
      const key = `${Math.floor(world.elements[12] / cellSize)},${Math.floor(world.elements[14] / cellSize)}`;
      let cell = cells.get(key);
      if (!cell) cells.set(key, (cell = []));
      cell.push(i);
    }
    for (const [key, indices] of cells) {
      for (let start = 0; start < indices.length; start += maxInstances) {
        const count = Math.min(maxInstances, indices.length - start);
        const batch = new InstancedMesh(source.geometry, source.material, count);
        batch.name = `${source.name}_${key}_${start}`;
        batch.userData = {...source.userData};
        batch.matrix.copy(source.matrix);
        batch.matrixAutoUpdate = false;
        for (let i = 0; i < count; i++) {
          source.getMatrixAt(indices[start + i], local);
          batch.setMatrixAt(i, local);
          if (source.instanceColor) {
            source.getColorAt(indices[start + i], color);
            batch.setColorAt(i, color);
          }
        }
        batch.instanceMatrix.needsUpdate = true;
        if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
        batch.computeBoundingBox();
        batch.computeBoundingSphere();
        source.parent?.add(batch);
      }
    }
    source.removeFromParent();
    source.dispose();
  }
  root.updateMatrixWorld(true);
}
