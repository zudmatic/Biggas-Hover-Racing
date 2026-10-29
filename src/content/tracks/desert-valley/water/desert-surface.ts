import {BufferAttribute, DataTexture, MathUtils, NearestFilter, PlaneGeometry, RedFormat, Box3, Vector3} from 'three';
import type {Mesh} from 'three';
import type {Disposable} from '@/core/disposable';
import {sampleWaterHeight} from './waves';

export const RIVER_SURFACE = Object.freeze({
  segments: 128,
  mobileSegments: 80,
  coverageResolution: 256,
  shoreDepthStart: 0.15,
  shoreDepthFull: 2.5,
  maximumWaveHeight: 0.65,
});

/** Height of the dry ground under (x, z), or null where there is none. */
export type DryHeight = (x: number, z: number) => number | null | undefined;

// Runtime geometry only: the original GLB and authored two-triangle water stay
// intact. Dry cells are omitted and the displacement fades into shallow banks.
export class DesertRiver implements Disposable {
  /** Wet-cell surface grid, local to the authored water mesh, with a `waterShore` weight. */
  readonly geometry: PlaneGeometry;
  /** Conservative wet mask: effect fragments on dry ground/roads are clipped. */
  readonly coverage: DataTexture;
  readonly bounds: Box3;
  readonly waterLevel: number;
  readonly triangles: number;
  readonly coverageInfo: {minXZ: [number, number]; sizeXZ: [number, number]};

  constructor(
    surface: Mesh,
    private readonly dryHeight: DryHeight,
    {mobile = false}: {mobile?: boolean} = {},
  ) {
    surface.updateWorldMatrix(true, false);
    const bounds = (this.bounds = new Box3().setFromObject(surface));
    const size = bounds.getSize(new Vector3());
    const waterLevel = (this.waterLevel = (bounds.min.y + bounds.max.y) * 0.5);
    const segments = mobile ? RIVER_SURFACE.mobileSegments : RIVER_SURFACE.segments;
    const geometry = (this.geometry = new PlaneGeometry(size.x, size.z, segments, segments)
      .rotateX(-Math.PI / 2)
      .translate((bounds.min.x + bounds.max.x) * 0.5, waterLevel, (bounds.min.z + bounds.max.z) * 0.5));
    const positions = geometry.attributes.position;
    const weights = new Float32Array(positions.count);
    const wet = new Uint8Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      weights[i] = this.shoreWeight(x, z);
      wet[i] = Number(this.isWet(x, z));
    }
    const indices: number[] = [];
    const original = geometry.index!;
    for (let i = 0; i < original.count; i += 3) {
      const a = original.getX(i);
      const b = original.getX(i + 1);
      const c = original.getX(i + 2);
      const x = (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3;
      const z = (positions.getZ(a) + positions.getZ(b) + positions.getZ(c)) / 3;
      if (wet[a] || wet[b] || wet[c] || this.isWet(x, z)) indices.push(a, b, c);
    }
    geometry.setIndex(indices);
    geometry.setAttribute('waterShore', new BufferAttribute(weights, 1));
    geometry.applyMatrix4(surface.matrixWorld.clone().invert());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.boundingBox!.expandByScalar(RIVER_SURFACE.maximumWaveHeight);
    geometry.boundingSphere!.radius += RIVER_SURFACE.maximumWaveHeight;
    this.triangles = indices.length / 3;

    // A conservative mask clips all effect fragments on dry ground/roads. Only
    // cells with wet corners and a wet center participate; use nearest sampling.
    const n = RIVER_SURFACE.coverageResolution;
    const mask = new Uint8Array(n * n);
    const corners = new Uint8Array((n + 1) * (n + 1));
    for (let z = 0; z <= n; z++) {
      for (let x = 0; x <= n; x++)
        corners[z * (n + 1) + x] = Number(this.depthAt(bounds.min.x + (x * size.x) / n, bounds.min.z + (z * size.z) / n) > 0.1);
    }
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const a = z * (n + 1) + x;
        if (
          corners[a] &&
          corners[a + 1] &&
          corners[a + n + 1] &&
          corners[a + n + 2] &&
          this.depthAt(bounds.min.x + ((x + 0.5) * size.x) / n, bounds.min.z + ((z + 0.5) * size.z) / n) > 0.1
        )
          mask[z * n + x] = 255;
      }
    }
    const coverage = (this.coverage = new DataTexture(mask, n, n, RedFormat));
    coverage.name = 'Desert water effects coverage';
    coverage.flipY = false;
    coverage.generateMipmaps = false;
    coverage.minFilter = coverage.magFilter = NearestFilter;
    coverage.needsUpdate = true;
    this.coverageInfo = {minXZ: [bounds.min.x, bounds.min.z], sizeXZ: [size.x, size.z]};
  }

  private inside(x: number, z: number): boolean {
    const {min, max} = this.bounds;
    return x >= min.x && x <= max.x && z >= min.z && z <= max.z;
  }

  depthAt(x: number, z: number): number {
    if (!this.inside(x, z)) return -Infinity;
    const floor = this.dryHeight(x, z);
    return floor === null || floor === undefined ? 10 : this.waterLevel - floor;
  }

  shoreWeight(x: number, z: number): number {
    return MathUtils.smoothstep(this.depthAt(x, z), RIVER_SURFACE.shoreDepthStart, RIVER_SURFACE.shoreDepthFull);
  }

  isWet(x: number, z: number): boolean {
    return this.depthAt(x, z) > 0;
  }

  /** Animated surface height (same waves as the GPU surface). */
  heightAt(x: number, z: number, phase = 0, height = 0): number {
    return this.waterLevel + sampleWaterHeight(x, z, phase, height) * this.shoreWeight(x, z);
  }

  dispose(): void {
    this.coverage.dispose();
  }
}
