import {BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, type Material} from 'three';
import type {SurfaceHeight} from '@/sim/hover-physics';
import type {OilPatch} from '@/sim/oil-simulation';

/** The simulation never keeps more patches than this. */
const MAX_PATCHES = 256;
/** Perimeter points per patch; each patch is a fan of RING triangles. */
const RING = 8;
const VERTICES = RING * 3;
/** Lift above the road against z-fighting. */
const LIFT = 0.025;
/** Seconds over which an expiring patch fades out. */
const FADE = 0.8;

/**
 * One bounded draw for all patches. Every perimeter vertex is projected onto
 * the actual road surface, so oil follows ramps instead of floating above them.
 *
 * Vertex data is kept in patch order. A patch is projected once, when it
 * appears; afterwards it only moves between slots (when older patches expire)
 * or changes alpha (while fading). Only the changed range is uploaded, and
 * the mesh is hidden while there is no oil.
 */
export class OilSlickMesh {
  readonly mesh: Mesh<BufferGeometry, Material>;
  private readonly geometry = new BufferGeometry();
  private readonly positions = new BufferAttribute(new Float32Array(MAX_PATCHES * VERTICES * 3), 3).setUsage(DynamicDrawUsage);
  // RGB stays white; the material reads the alpha channel.
  private readonly colors = new BufferAttribute(new Float32Array(MAX_PATCHES * VERTICES * 4).fill(1), 4).setUsage(DynamicDrawUsage);
  private readonly uvs = new BufferAttribute(new Float32Array(MAX_PATCHES * VERTICES * 2), 2).setUsage(DynamicDrawUsage);
  /** Patch id drawn in each slot. */
  private readonly ids = new Float64Array(MAX_PATCHES);
  /** Scratch perimeter: x, y, z, u, v per ring point. */
  private readonly ring = new Float64Array(RING * 5);
  private count = 0;

  constructor(
    material: Material,
    private readonly surfaceHeight: SurfaceHeight,
  ) {
    const {geometry} = this;
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('color', this.colors);
    geometry.setAttribute('uv', this.uvs);
    // Until the first update, draw one degenerate (invisible) triangle: the
    // pipeline compiles while loading instead of at the first pour, without
    // issuing an empty draw.
    geometry.setDrawRange(0, 3);
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Syncs the vertex buffers with `patches` (ordered by id, as the simulation keeps them). */
  update(patches: readonly OilPatch[], time: number): void {
    const n = Math.min(patches.length, MAX_PATCHES);
    let changedFrom = n;
    let old = 0;
    let reuse = true;
    for (let slot = 0; slot < n; slot++) {
      const patch = patches[slot];
      if (reuse) {
        // Ids only grow, so expired patches are simply skipped.
        while (old < this.count && this.ids[old] < patch.id) old++;
        if (old < this.count && this.ids[old] === patch.id) {
          if (old !== slot) {
            this.move(old, slot);
            changedFrom = Math.min(changedFrom, slot);
          }
          old++;
          continue;
        }
        // A new patch: everything after it is new too (or the order changed).
        reuse = false;
      }
      this.project(slot, patch);
      changedFrom = Math.min(changedFrom, slot);
    }

    let alphaFrom = n;
    let alphaTo = 0;
    const colors = this.colors.array as Float32Array;
    for (let slot = 0; slot < n; slot++) {
      const patch = patches[slot];
      const opacity = Math.fround(Math.min(1, (patch.expires - time) / FADE) * 0.95);
      // A slot's 24 vertices always share one alpha.
      const first = slot * VERTICES * 4 + 3;
      if (colors[first] === opacity) continue;
      for (let i = 0; i < VERTICES; i++) colors[first + i * 4] = opacity;
      alphaFrom = Math.min(alphaFrom, slot);
      alphaTo = slot + 1;
    }

    if (changedFrom < n) {
      markDirty(this.positions, changedFrom, n);
      markDirty(this.uvs, changedFrom, n);
    }
    if (alphaFrom < alphaTo) markDirty(this.colors, alphaFrom, alphaTo);
    this.geometry.setDrawRange(0, n * VERTICES);
    this.count = n;
    this.mesh.visible = n > 0;
  }

  /** Also disposes the material it was given. */
  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.mesh.material.dispose();
  }

  /** Projects a new patch's fan onto the road and writes it to `slot`. */
  private project(slot: number, p: OilPatch): void {
    const {ring} = this;
    for (let i = 0; i < RING; i++) {
      const angle = (i * Math.PI) / 4;
      const r = p.radius * (0.87 + 0.1 * Math.sin(i * 7 + p.id * 3));
      const x = p.x + Math.cos(angle) * r;
      const z = p.z + Math.sin(angle) * r;
      ring[i * 5] = x;
      ring[i * 5 + 1] = this.surfaceHeight(x, z) ?? p.y;
      ring[i * 5 + 2] = z;
      ring[i * 5 + 3] = 0.5 + (x - p.x) / (2 * p.radius);
      ring[i * 5 + 4] = 0.5 + (z - p.z) / (2 * p.radius);
    }
    let vertex = slot * VERTICES;
    for (let i = 0; i < RING; i++) {
      this.vertex(vertex++, p.x, p.y, p.z, 0.5, 0.5);
      this.ringVertex(vertex++, i);
      this.ringVertex(vertex++, (i + 1) % RING);
    }
    this.ids[slot] = p.id;
  }

  private ringVertex(index: number, point: number): void {
    const {ring} = this;
    const k = point * 5;
    this.vertex(index, ring[k], ring[k + 1], ring[k + 2], ring[k + 3], ring[k + 4]);
  }

  private vertex(index: number, x: number, y: number, z: number, u: number, v: number): void {
    const position = this.positions.array as Float32Array;
    const uv = this.uvs.array as Float32Array;
    position[index * 3] = x;
    position[index * 3 + 1] = y + LIFT;
    position[index * 3 + 2] = z;
    uv[index * 2] = u;
    uv[index * 2 + 1] = v;
  }

  /** Shifts a projected patch down to an earlier slot (`to` <= `from`). Alpha is rewritten separately. */
  private move(from: number, to: number): void {
    const position = this.positions.array as Float32Array;
    const uv = this.uvs.array as Float32Array;
    position.copyWithin(to * VERTICES * 3, from * VERTICES * 3, (from + 1) * VERTICES * 3);
    uv.copyWithin(to * VERTICES * 2, from * VERTICES * 2, (from + 1) * VERTICES * 2);
    this.ids[to] = this.ids[from];
  }
}

/**
 * Queues an upload of slots [from, to). Merges with a range still pending
 * (updated twice before a render) so nothing is lost.
 */
function markDirty(attribute: BufferAttribute, from: number, to: number): void {
  const size = VERTICES * attribute.itemSize;
  let start = from * size;
  let end = to * size;
  for (const range of attribute.updateRanges) {
    start = Math.min(start, range.start);
    end = Math.max(end, range.start + range.count);
  }
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(start, end - start);
  attribute.needsUpdate = true;
}
