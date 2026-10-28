import {Box3, ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace, RGBAFormat, Vector3} from 'three';
import type {BufferAttribute, Mesh, Object3D} from 'three';
import {isInstancedMesh, isMesh} from '../../scene-utils';
import type {WaterContact} from './water';

// A one-time shoreline distance field, generated from the actual bank/terrain
// triangles. R = shore distance; G stays white because there is no boat mask.
export function createDesertWaterContact(root: Object3D, surface: Mesh): {texture: DataTexture; info: WaterContact} {
  const resolution = 512;
  const maxDistance = 4;
  const epsilon = 1e-5;
  root.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(surface);
  const valid =
    !bounds.isEmpty() && [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite);
  const minX = valid ? bounds.min.x - maxDistance : 0;
  const minZ = valid ? bounds.min.z - maxDistance : 0;
  const sizeX = valid ? Math.max(0.001, bounds.max.x - bounds.min.x) + maxDistance * 2 : 1;
  const sizeZ = valid ? Math.max(0.001, bounds.max.z - bounds.min.z) + maxDistance * 2 : 1;
  const waterLevel = valid ? (bounds.min.y + bounds.max.y) * 0.5 : 0;
  const bytes = new Uint8Array(resolution * resolution * 4).fill(255);
  const pixelX = sizeX / resolution;
  const pixelZ = sizeZ / resolution;
  const vertices = [new Vector3(), new Vector3(), new Vector3()];
  const heights = [0, 0, 0];
  const intersections = [new Vector3(), new Vector3(), new Vector3()];
  const intersection = new Vector3();
  let found = 0;

  function rasterize(a: Vector3, b: Vector3): void {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared < epsilon * epsilon) return;
    // Keep the outermost texels white: ClampToEdge must never repeat foam
    // outside this padded water footprint.
    const x0 = Math.max(1, Math.floor((Math.min(a.x, b.x) - maxDistance - minX) / pixelX));
    const x1 = Math.min(resolution - 2, Math.ceil((Math.max(a.x, b.x) + maxDistance - minX) / pixelX));
    const z0 = Math.max(1, Math.floor((Math.min(a.z, b.z) - maxDistance - minZ) / pixelZ));
    const z1 = Math.min(resolution - 2, Math.ceil((Math.max(a.z, b.z) + maxDistance - minZ) / pixelZ));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const px = minX + (x + 0.5) * pixelX - a.x;
        const pz = minZ + (z + 0.5) * pixelZ - a.z;
        const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / lengthSquared));
        const distance = Math.hypot(px - t * dx, pz - t * dz);
        if (distance >= maxDistance) continue;
        const offset = (z * resolution + x) * 4;
        bytes[offset] = Math.min(bytes[offset], Math.round((distance / maxDistance) * 255));
      }
    }
  }

  function add(point: Vector3): void {
    for (let j = 0; j < found; j++) if (intersections[j].distanceToSquared(point) < epsilon * epsilon) return;
    if (found < 3) intersections[found++].copy(point);
  }

  if (valid) {
    root.traverse((object) => {
      if (!isMesh(object) || isInstancedMesh(object) || object === surface || !/S07_(TERRAIN|BANK)/.test(object.name)) return;
      const geometry = object.geometry;
      const position = geometry?.attributes.position as BufferAttribute | undefined;
      const index = geometry?.index;
      if (!position) return;
      const count = index?.count ?? position.count;
      for (let i = 0; i + 2 < count; i += 3) {
        for (let k = 0; k < 3; k++) {
          vertices[k].fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(object.matrixWorld);
          heights[k] = vertices[k].y - waterLevel;
        }
        const low = Math.min(heights[0], heights[1], heights[2]);
        const high = Math.max(heights[0], heights[1], heights[2]);
        if (low > epsilon || high < -epsilon || heights.every((h) => Math.abs(h) <= epsilon)) continue;
        found = 0;
        for (let edge = 0; edge < 3; edge++) {
          const next = (edge + 1) % 3;
          const a = vertices[edge];
          const b = vertices[next];
          const ha = heights[edge];
          const hb = heights[next];
          if (Math.abs(ha) <= epsilon) add(a);
          if ((ha < -epsilon && hb > epsilon) || (ha > epsilon && hb < -epsilon)) {
            intersection.copy(a).lerp(b, ha / (ha - hb));
            add(intersection);
          }
        }
        if (found >= 2) rasterize(intersections[0], intersections[1]);
      }
    });
  }

  const texture = new DataTexture(bytes, resolution, resolution, RGBAFormat);
  texture.name = 'Desert Valley shoreline distance';
  texture.colorSpace = NoColorSpace;
  texture.flipY = false;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return {texture, info: {minXZ: [minX, minZ], sizeXZ: [sizeX, sizeZ], maxDistance, waterLevel}};
}
