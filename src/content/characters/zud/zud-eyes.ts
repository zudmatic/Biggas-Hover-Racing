import {BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, MathUtils, Mesh, type Material} from 'three';
import {EYE_DEFAULTS, EYE_RANGES, type EyeSettings, type EyeShapeKey} from './eye-settings';

const RX = 0.285;
const RY = 0.23;
const CY = -0.015;
const GRID = 24;
const {clamp, lerp} = MathUtils;
const SHAPE_KEYS = Object.keys(EYE_RANGES) as EyeShapeKey[];

/** Head ellipsoid radii and centre, in Zud root units. */
export interface HeadShape {
  x: number;
  y: number;
  z: number;
  centerY: number;
}

export type EyePart = 'eye' | 'pupil';
export type EyeMesh = Mesh<BufferGeometry, Material>;

/** [low, high] of a column, in eye-local Y. */
type Interval = [low: number, high: number];
type Limits = (x: number, out: Interval) => void;

interface Segment {
  left: number;
  right: number;
  start: Interval;
  end: Interval;
}

interface EyeEntry {
  side: -1 | 1;
  eye: Group;
  white: EyeStrip;
  pupil: EyeStrip;
  crease: EyeStrip;
}

/** A vertex on the eye surface. Pooled: rebuilding a blink allocates nothing. */
class SurfacePoint {
  x = 0;
  y = 0;
  z = 0;
  nx = 0;
  ny = 0;
  nz = 0;
  u = 0;
  v = 0;
}

class PointPool {
  private readonly items: SurfacePoint[] = [];
  private used = 0;

  reset(): void {
    this.used = 0;
  }

  next(): SurfacePoint {
    if (this.used === this.items.length) this.items.push(new SurfacePoint());
    return this.items[this.used++];
  }
}

/** Mutable vertex count over a fixed-capacity buffer. */
class LiveAttribute extends BufferAttribute {
  declare count: number;
  declare array: Float32Array;
}

/**
 * One eye surface (white, pupil or crease) with fixed-capacity buffers.
 * Vertices are written straight into the GPU arrays as the strip is built.
 */
class EyeStrip {
  private attributes: {position: LiveAttribute; normal: LiveAttribute; uv: LiveAttribute; uv1: LiveAttribute} | null = null;
  private count = 0;

  constructor(readonly mesh: EyeMesh) {}

  begin(capacity: number): void {
    // Fixed-capacity buffers prevent GPU allocations as the aperture changes.
    // count and drawRange expose only the live triangles to bounds and raycasts.
    if (!this.attributes) {
      const geometry = this.mesh.geometry;
      const create = (key: string, size: number): LiveAttribute => {
        const attribute = new LiveAttribute(new Float32Array(capacity * size), size).setUsage(DynamicDrawUsage);
        geometry.setAttribute(key, attribute);
        return attribute;
      };
      this.attributes = {position: create('position', 3), normal: create('normal', 3), uv: create('uv', 2), uv1: create('uv1', 2)};
    }
    this.count = 0;
  }

  push(point: SurfacePoint): void {
    const {position, normal, uv, uv1} = this.attributes!;
    const i3 = this.count * 3;
    const i2 = this.count * 2;
    position.array[i3] = point.x;
    position.array[i3 + 1] = point.y;
    position.array[i3 + 2] = point.z;
    normal.array[i3] = point.nx;
    normal.array[i3 + 1] = point.ny;
    normal.array[i3 + 2] = point.nz;
    uv.array[i2] = point.u;
    uv.array[i2 + 1] = point.v;
    uv1.array[i2] = point.u * 8;
    uv1.array[i2 + 1] = point.v * 8;
    this.count++;
  }

  finish(): void {
    const geometry = this.mesh.geometry;
    for (const attribute of Object.values(this.attributes!)) {
      attribute.count = this.count;
      attribute.clearUpdateRanges();
      if (this.count) attribute.addUpdateRange(0, this.count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    geometry.setDrawRange(0, this.count);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    this.mesh.visible = this.count > 0;
  }
}

const cellColumn = (x: number): number => clamp(Math.floor(((x / RX + 1) * GRID) / 2), 0, GRID - 1);
const cellRow = (y: number): number => clamp(Math.floor((((y - CY) / RY + 1) * GRID) / 2), 0, GRID - 1);

/** Corner of a binned triangle; normals are only read for the head surface. */
interface GridVertex {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

const gridVertex = (): GridVertex => ({x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0});

/** Projected surface height and slope at an eye point. */
interface BaseSurface {
  z: number;
  dx: number;
  dy: number;
}

// Per triangle: a, b, c as (x y z nx ny nz), then the barycentric denominator.
const STRIDE = 19;

function writeVertex(values: Float64Array, offset: number, vertex: GridVertex): void {
  values[offset] = vertex.x;
  values[offset + 1] = vertex.y;
  values[offset + 2] = vertex.z;
  values[offset + 3] = vertex.nx;
  values[offset + 4] = vertex.ny;
  values[offset + 5] = vertex.nz;
}

/**
 * Triangles binned on the eye's XY grid. Reused between rebuilds: the
 * buffers only grow, so projecting during a blink allocates nothing.
 */
class TriangleGrid {
  private values = new Float64Array(256 * STRIDE);
  private cells = new Int32Array(256 * 4);
  private size = 0;
  private readonly starts = new Int32Array(GRID * GRID + 1);
  private readonly cursor = new Int32Array(GRID * GRID);
  private items = new Int32Array(1024);

  clear(): void {
    this.size = 0;
  }

  /** Adds a triangle unless it is degenerate in XY. */
  add(a: GridVertex, b: GridVertex, c: GridVertex): void {
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(denominator) < 1e-10) return;
    if ((this.size + 1) * STRIDE > this.values.length) {
      const values = new Float64Array(this.values.length * 2);
      values.set(this.values);
      this.values = values;
      const cells = new Int32Array(this.cells.length * 2);
      cells.set(this.cells);
      this.cells = cells;
    }
    const offset = this.size * STRIDE;
    writeVertex(this.values, offset, a);
    writeVertex(this.values, offset + 6, b);
    writeVertex(this.values, offset + 12, c);
    this.values[offset + 18] = denominator;
    const cell = this.size * 4;
    this.cells[cell] = cellColumn(Math.min(a.x, b.x, c.x));
    this.cells[cell + 1] = cellColumn(Math.max(a.x, b.x, c.x));
    this.cells[cell + 2] = cellRow(Math.min(a.y, b.y, c.y));
    this.cells[cell + 3] = cellRow(Math.max(a.y, b.y, c.y));
    this.size++;
  }

  /** Bins every added triangle, keeping insertion order inside each cell. */
  index(): void {
    const {starts, cursor, cells} = this;
    starts.fill(0);
    for (let t = 0; t < this.size; t++) {
      for (let y = cells[t * 4 + 2]; y <= cells[t * 4 + 3]; y++) {
        for (let x = cells[t * 4]; x <= cells[t * 4 + 1]; x++) starts[y * GRID + x + 1]++;
      }
    }
    for (let i = 1; i < starts.length; i++) starts[i] += starts[i - 1];
    const total = starts[starts.length - 1];
    if (this.items.length < total) this.items = new Int32Array(total * 2);
    cursor.set(starts.subarray(0, GRID * GRID));
    for (let t = 0; t < this.size; t++) {
      for (let y = cells[t * 4 + 2]; y <= cells[t * 4 + 3]; y++) {
        for (let x = cells[t * 4]; x <= cells[t * 4 + 1]; x++) this.items[cursor[y * GRID + x]++] = t;
      }
    }
  }

  /** Highest surface under (x, y), or -Infinity. */
  height(x: number, y: number): number {
    const cell = cellRow(y) * GRID + cellColumn(x);
    const values = this.values;
    let height = -Infinity;
    for (let i = this.starts[cell]; i < this.starts[cell + 1]; i++) {
      const o = this.items[i] * STRIDE;
      const ax = values[o],
        ay = values[o + 1],
        az = values[o + 2];
      const bx = values[o + 6],
        by = values[o + 7],
        bz = values[o + 8];
      const cx = values[o + 12],
        cy = values[o + 13],
        cz = values[o + 14];
      const denominator = values[o + 18];
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator;
      const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator,
        w = 1 - u - v;
      if (Math.min(u, v, w) >= -1e-6) height = Math.max(height, u * az + v * bz + w * cz);
    }
    return height;
  }

  /** Writes the frontmost surface at (x, y) into `out`; false when nothing covers it. */
  surface(x: number, y: number, out: BaseSurface): boolean {
    const cell = cellRow(y) * GRID + cellColumn(x);
    const values = this.values;
    let found = false;
    for (let i = this.starts[cell]; i < this.starts[cell + 1]; i++) {
      const o = this.items[i] * STRIDE;
      const ax = values[o],
        ay = values[o + 1],
        az = values[o + 2];
      const bx = values[o + 6],
        by = values[o + 7],
        bz = values[o + 8];
      const cx = values[o + 12],
        cy = values[o + 13],
        cz = values[o + 14];
      const denominator = values[o + 18];
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator;
      const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator,
        w = 1 - u - v;
      if (Math.min(u, v, w) < -1e-6) continue;
      const z = u * az + v * bz + w * cz;
      if (!found || z > out.z) {
        const nx = u * values[o + 3] + v * values[o + 9] + w * values[o + 15];
        const ny = u * values[o + 4] + v * values[o + 10] + w * values[o + 16];
        const nz = u * values[o + 5] + v * values[o + 11] + w * values[o + 17];
        out.z = z;
        out.dx = -nx / Math.max(0.1, nz);
        out.dy = -ny / Math.max(0.1, nz);
        found = true;
      }
    }
    return found;
  }
}

/**
 * Zud's eyes. The head itself forms the eyelids: trimming the white and pupil
 * reveals continuous skin, without raised patches or a second skin material
 * layer. No screen-space masks: side views, comic contours and depth all agree.
 *
 * Geometry is rebuilt only when the eye shape or aperture changes. A blink
 * changes the aperture alone, so it never rebuilds the (aperture-independent)
 * closed-lid crease.
 */
export class ZudEyes {
  readonly root = new Group();
  private settings: EyeSettings = {...EYE_DEFAULTS};
  private openness = 1;
  private lastPose = 1;
  private built = false;
  private headGrids: [TriangleGrid, TriangleGrid] | null = null;
  private readonly entries: EyeEntry[];

  // Scratch state for the rebuild; nothing here outlives a call.
  private readonly pool = new PointPool();
  private readonly columns: [SurfacePoint[], SurfacePoint[]] = [[], []];
  private readonly base: BaseSurface = {z: 0, dx: 0, dy: 0};
  private readonly whiteHeight = new TriangleGrid();
  private readonly range: Interval = [0, 0];
  private readonly innerRange: Interval = [0, 0];
  private readonly corners = [gridVertex(), gridVertex(), gridVertex()] as const;
  private lower = 0;
  private upper = 0;
  private seam = 0;

  constructor(
    private readonly head: HeadShape,
    {white, pupil}: {white: Material; pupil: Material},
    initial: Partial<EyeSettings> = EYE_DEFAULTS,
  ) {
    this.root.name = 'Ojos de Zud';
    this.entries = ([-1, 1] as const).map((side) => {
      const eye = new Group();
      eye.position.set(side * 0.435, 0.14, 0);
      this.root.add(eye);
      const make = (name: string, material: Material, part: EyePart): EyeStrip => {
        const mesh: EyeMesh = new Mesh(new BufferGeometry(), material);
        mesh.name = name;
        mesh.userData.eyePart = part;
        eye.add(mesh);
        return new EyeStrip(mesh);
      };
      return {
        side,
        eye,
        white: make('Blanco del ojo', white, 'eye'),
        pupil: make('Pupila', pupil, 'pupil'),
        crease: make('Párpado cerrado', pupil, 'pupil'),
      };
    });
    this.configure(initial);
  }

  /** Applies shape settings (clamped to EYE_RANGES); rebuilds only on change. */
  configure(input: Partial<EyeSettings>): void {
    const next = {...this.settings};
    for (const key of SHAPE_KEYS) {
      const value = input[key];
      const [min, max] = EYE_RANGES[key];
      if (typeof value === 'number' && Number.isFinite(value)) next[key] = clamp(value, min, max);
    }
    const changed = SHAPE_KEYS.some((key) => next[key] !== this.settings[key]);
    this.settings = next;
    if (changed || !this.built) this.rebuild(true);
  }

  /**
   * Bins the actual front triangles of the head in XY. Exact barycentric
   * projection is cheap during a blink and follows both the faceted and
   * rounded head.
   */
  setHeadSurface(mesh: Mesh): void {
    const head = this.head;
    const position = mesh.geometry.attributes.position;
    const normals = mesh.geometry.attributes.normal;
    const indices = mesh.geometry.index;
    const count = indices?.count ?? position.count;
    this.headGrids = ([-1, 1] as const).map((side) => {
      const grid = new TriangleGrid();
      for (let i = 0; i < count; i += 3) {
        const [a, b, c] = this.corners;
        for (let offset = 0; offset < 3; offset++) {
          const index = indices ? indices.getX(i + offset) : i + offset;
          const vertex = this.corners[offset];
          vertex.x = position.getX(index) * head.x - side * 0.435;
          vertex.y = position.getY(index) * head.y + head.centerY - 0.14;
          vertex.z = position.getZ(index) * head.z;
          vertex.nx = normals.getX(index) / head.x;
          vertex.ny = normals.getY(index) / head.y;
          vertex.nz = normals.getZ(index) / head.z;
        }
        const minX = Math.min(a.x, b.x, c.x),
          maxX = Math.max(a.x, b.x, c.x);
        const minY = Math.min(a.y, b.y, c.y),
          maxY = Math.max(a.y, b.y, c.y);
        if (Math.max(a.z, b.z, c.z) < 0 || maxX < -RX || minX > RX || maxY < CY - RY || minY > CY + RY) continue;
        grid.add(a, b, c);
      }
      grid.index();
      return grid;
    }) as [TriangleGrid, TriangleGrid];
    this.rebuild(true);
  }

  /** Eases the lids toward `amount` (1 open, 0 closed). */
  pose(amount: number, dt = 1 / 60, immediate = false): void {
    const target = clamp(amount, 0, 1);
    this.openness = immediate ? target : lerp(this.openness, target, 1 - Math.exp(-dt * (target < this.openness ? 32 : 18)));
    if (Math.abs(this.openness - target) < 0.002) this.openness = target;
    if (Math.abs(this.openness - this.lastPose) > 0.001 || immediate) {
      this.lastPose = this.openness;
      this.rebuild(false);
    }
  }

  /** Writes the lid curves at `x` into the scratch `lower`/`upper`/`seam` fields. */
  private bounds(x: number, side: number): void {
    const {settings} = this;
    const radius = RY * Math.sqrt(Math.max(0, 1 - (x / RX) ** 2)),
      bottom = CY - radius,
      top = CY + radius;
    const slope = side * Math.tan(MathUtils.degToRad(settings.eyeTilt));
    // A slight brow arc preserves the original descending, inward expression.
    const cut = clamp(CY + RY * (2 * settings.eyeOpening - 1) + slope * x + 0.35 * x * x, bottom, top);
    const seam = clamp(CY - 0.035 + slope * x * 0.25 - 0.025 * (1 - (x / RX) ** 2), bottom, top);
    const phase = settings.eyeOpening === 0 ? 0 : this.openness;
    this.lower = lerp(seam, bottom, phase);
    this.upper = lerp(seam, cut, phase);
    this.seam = seam;
  }

  private baseSurface(x: number, y: number, side: number): BaseSurface {
    const {base, head} = this;
    if (this.headGrids && this.headGrids[side === -1 ? 0 : 1].surface(x, y, base)) return base;
    const gx = x + side * 0.435,
      gy = y + 0.14,
      z = head.z * Math.sqrt(Math.max(0.05, 1 - (gx / head.x) ** 2 - ((gy - head.centerY) / head.y) ** 2));
    base.z = z;
    base.dx = (-head.z * head.z * gx) / (head.x * head.x * z);
    base.dy = (-head.z * head.z * (gy - head.centerY)) / (head.y * head.y * z);
    return base;
  }

  private surface(x: number, y: number, side: number, lift: number, flush: boolean, out: SurfacePoint): SurfacePoint {
    const {head} = this;
    const base = this.baseSurface(x, y, side),
      gx = x + side * 0.435,
      gy = y + 0.14;
    const edge = Math.max(0, 1 - (x / RX) ** 2 - ((y - CY) / RY) ** 2),
      depth = this.settings.eyeDepth;
    const t = clamp(edge / 0.2, 0, 1),
      mask = t * t * (3 - 2 * t),
      maskDerivative = edge < 0.2 ? (6 * t * (1 - t)) / 0.2 : 0;
    const rise = flush ? 0 : (0.01 + depth * edge * edge + lift) * mask;
    const derivative = flush ? 0 : 2 * depth * edge * mask + (0.01 + depth * edge * edge + lift) * maskDerivative;
    const nx = -base.dx + (derivative * 2 * x) / (RX * RX);
    const ny = -base.dy + (derivative * 2 * (y - CY)) / (RY * RY);
    const nz = 1;
    // Same arithmetic as Vector3.normalize(), without the allocation.
    const scale = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
    out.x = x;
    out.y = y;
    out.z = base.z + 0.004 + rise;
    out.nx = nx * scale;
    out.ny = ny * scale;
    out.nz = nz * scale;
    out.u = Math.atan2(gx, base.z) / (Math.PI * 2) + 0.5;
    out.v = (gy - head.centerY + head.y) / (2 * head.y);
    return out;
  }

  /**
   * Tessellates the region between `limits` over [minX, maxX] onto the head.
   * Triangles that dip under the head (or `underneath`) are subdivided twice.
   * Returns the visible column segments, used to clip the pupil.
   */
  private strip(
    target: EyeStrip,
    side: number,
    minX: number,
    maxX: number,
    columns: number,
    rows: number,
    limits: Limits,
    lift = 0,
    underneath: TriangleGrid | null = null,
    flush = false,
  ): Segment[] {
    const segments: Segment[] = [];
    const {pool, range} = this;
    const subdivide = this.headGrids !== null || underneath !== null;
    pool.reset();
    target.begin(columns * rows * 6 * 16);

    const onSurface = (x: number, y: number): SurfacePoint => {
      const point = this.surface(x, y, side, lift, flush, pool.next());
      if (underneath) point.z = Math.max(point.z, underneath.height(x, y) + 0.002);
      return point;
    };
    // Every grid vertex of a column is evaluated once and shared by its cells
    // (and by the next column when the two meet at the same x).
    const fillColumn = (points: SurfacePoint[], x: number, [low, high]: Interval): SurfacePoint[] => {
      for (let row = 0; row <= rows; row++) points[row] = onSurface(x, lerp(low, Math.max(low, high), row / rows));
      return points;
    };
    const visible = (x: number): boolean => {
      limits(x, range);
      return range[1] - range[0] > 1e-8;
    };
    const middle = (p: SurfacePoint, q: SurfacePoint): SurfacePoint => onSurface((p.x + q.x) / 2, (p.y + q.y) / 2);
    const triangle = (a: SurfacePoint, b: SurfacePoint, c: SurfacePoint, level = 0): void => {
      const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(area) < 1e-10) return;
      const x = (a.x + b.x + c.x) / 3,
        y = (a.y + b.y + c.y) / 3;
      if (
        level < 2 &&
        subdivide &&
        (a.z + b.z + c.z) / 3 < Math.max(this.baseSurface(x, y, side).z + 0.001, underneath ? underneath.height(x, y) + 0.001 : -Infinity)
      ) {
        const ab = middle(a, b),
          bc = middle(b, c),
          ca = middle(c, a);
        triangle(a, ab, ca, level + 1);
        triangle(ab, b, bc, level + 1);
        triangle(ca, bc, c, level + 1);
        triangle(ab, bc, ca, level + 1);
        return;
      }
      target.push(a);
      target.push(b);
      target.push(c);
    };

    let previousRight = NaN;
    let previousSlot = -1;
    for (let i = 0; i < columns; i++) {
      let left = lerp(minX, maxX, i / columns),
        right = lerp(minX, maxX, (i + 1) / columns);
      const leftVisible = visible(left),
        rightVisible = visible(right);
      if (!leftVisible && !rightVisible) {
        previousSlot = -1;
        continue;
      }
      if (leftVisible !== rightVisible) {
        let low = left,
          high = right;
        for (let iteration = 0; iteration < 18; iteration++) {
          const mid = (low + high) / 2;
          if (visible(mid) === leftVisible) low = mid;
          else high = mid;
        }
        if (leftVisible) right = low;
        else left = high;
      }
      const start: Interval = [0, 0],
        end: Interval = [0, 0];
      limits(left, start);
      limits(right, end);
      segments.push({left, right, start, end});
      const shared = previousSlot !== -1 && left === previousRight;
      const leftSlot = shared ? previousSlot : 0;
      const rightSlot = 1 - leftSlot;
      const leftPoints = shared ? this.columns[leftSlot] : fillColumn(this.columns[leftSlot], left, start);
      const rightPoints = fillColumn(this.columns[rightSlot], right, end);
      for (let j = 0; j < rows; j++) {
        const a = leftPoints[j],
          b = rightPoints[j],
          c = rightPoints[j + 1],
          d = leftPoints[j + 1];
        triangle(a, b, c);
        triangle(a, c, d);
      }
      previousRight = right;
      previousSlot = rightSlot;
    }
    target.finish();
    return segments;
  }

  /** `withCrease`: the closed-lid line depends on shape settings, not the aperture. */
  private rebuild(withCrease: boolean): void {
    const {settings, openness, innerRange} = this;
    for (const entry of this.entries) {
      const {side, eye} = entry;
      const aperture: Limits = (x, out) => {
        this.bounds(x, side);
        out[0] = this.lower;
        out[1] = this.upper;
      };
      const outline = this.strip(entry.white, side, -RX, RX, 40, 6, aperture);
      // Clip to the rendered polygon, including its discretized oval edge.
      // Analytic ellipse bounds alone can leave tiny pupil slivers outside it.
      const visibleAperture = (x: number, out: Interval): void => {
        let segment: Segment | undefined;
        for (const part of outline) {
          if (x >= part.left && x <= part.right) {
            segment = part;
            break;
          }
        }
        if (!segment) {
          out[0] = 0;
          out[1] = -1;
          return;
        }
        const t = (x - segment.left) / (segment.right - segment.left);
        out[0] = lerp(segment.start[0], segment.end[0], t);
        out[1] = lerp(segment.start[1], segment.end[1], t);
      };
      // Rest the pupils slightly inward and higher, as in the original gaze.
      // The upper lids then cover roughly half of each circle at neutral.
      const radius = 0.12 * settings.pupilSize,
        cx = -side * 0.025 + settings.gazeX * 0.12,
        cy = 0.005 + settings.gazeY * 0.115;
      this.whiteHeight.clear();
      this.addWhiteTriangles(entry.white.mesh.geometry);
      this.strip(
        entry.pupil,
        side,
        Math.max(-RX, cx - radius),
        Math.min(RX, cx + radius),
        36,
        4,
        (x, out) => {
          visibleAperture(x, innerRange);
          const [lower, upper] = innerRange,
            r = Math.sqrt(Math.max(0, radius * radius - (x - cx) ** 2));
          out[0] = Math.max(cy - r, lower);
          out[1] = Math.min(cy + r, upper);
        },
        0.004,
        this.whiteHeight,
      );
      if (withCrease) {
        this.strip(
          entry.crease,
          side,
          -RX * 0.88,
          RX * 0.88,
          32,
          1,
          (x, out) => {
            this.bounds(x, side);
            out[0] = this.seam - 0.0025;
            out[1] = this.seam + 0.0025;
          },
          0,
          null,
          true,
        );
      }
      entry.crease.mesh.visible = openness * settings.eyeOpening < 0.025;
      if (openness < 0.015 || settings.eyeOpening === 0) {
        entry.white.mesh.visible = false;
        entry.pupil.mesh.visible = false;
      }
      eye.userData.aperture = openness * settings.eyeOpening;
    }
    this.built = true;
  }

  /** The pupil rests on the white as rendered, so it is binned from the live buffer. */
  private addWhiteTriangles(geometry: BufferGeometry): void {
    const position = geometry.attributes.position;
    const [a, b, c] = this.corners;
    for (let i = 0; i < position.count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const vertex = this.corners[k];
        vertex.x = position.getX(i + k);
        vertex.y = position.getY(i + k);
        vertex.z = position.getZ(i + k);
        vertex.nx = vertex.ny = vertex.nz = 0;
      }
      this.whiteHeight.add(a, b, c);
    }
    this.whiteHeight.index();
  }
}
