import {BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Vector3, type Object3D} from 'three';
import {isMesh, materialsOf} from '../scene-utils';

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
      const d = Math.abs(y - this.referenceHeight);
      if (d < delta) { best = y; delta = d; }
    }
    return best;
  };
}

/**
 * The export joins road, tunnel and guardrails. Its atlas reserves U < .64
 * for asphalt. Split only the highway/bridge, keeping upward asphalt as the
 * floor and the remaining authored geometry as walls/ceiling for this test.
 * Buildings, the tower and the backdrop never become a driving surface.
 */
export function extractTokyoCollision(root: Object3D): {root: Group; surface: TokyoSurface; dispose(): void} {
  const triangles: Triangle[] = [];
  const solids: number[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const ab = new Vector3(), ac = new Vector3(), normal = new Vector3();
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!isMesh(object)) return;
    const material = materialsOf(object.material)[0];
    const road = /MAT_HW_Shared_Grit/.test(material.name);
    const bridge = /MAT_Drawbridge_Diffuse/.test(material.name);
    if (!road && !bridge) return;
    const geometry = object.geometry;
    const positions = geometry.attributes.position, index = geometry.index;
    // Bridge asphalt uses TEXCOORD_1; BufferAttribute getters decode normalized UVs.
    const channel = (material as MeshBasicMaterial).map?.channel ?? 0;
    const uv = geometry.getAttribute(channel ? `uv${channel}` : 'uv');
    const count = index?.count ?? positions.count;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k);
      a.fromBufferAttribute(positions, ids[0]).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(positions, ids[1]).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(positions, ids[2]).applyMatrix4(object.matrixWorld);
      normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
      if (road && uv && normal.y > 0.75 && ids.every(id => uv.getX(id) < 0.64)) {
        triangles.push([a.clone(), b.clone(), c.clone()]);
      } else {
        solids.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    }
  });
  if (triangles.length < 1000) throw new Error('Tokyo: no se pudo identificar la calzada del export.');
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(solids, 3));
  const material = new MeshBasicMaterial();
  const colliders = new Group();
  colliders.add(new Mesh(geometry, material));
  return {root: colliders, surface: new TokyoSurface(triangles), dispose() { geometry.dispose(); material.dispose(); }};
}
