import type {HoverState, Position3} from './hover-state';
import type {GameplayData, RouteData, RouteSample, Vec3Array} from './route-data';

/** Resting hover height above the driving surface, in metres. */
export const HOVER_HEIGHT = 0.65;

/** A point on the route centreline plus the query point's lateral offset. */
export interface RoadPoint {
  x: number;
  y: number;
  z: number;
  /** Unit forward direction of the route segment (XZ plane). */
  nx: number;
  nz: number;
  grade: number;
  /** Segment index (start sample). */
  index: number;
  /** Distance along the lap, in metres. */
  distance: number;
  /** Signed lateral offset of the queried point from the centreline. */
  offset: number;
  width: number;
  bank?: number;
}

export interface RoadQuery extends RoadPoint {
  distanceToRoad: number;
}

/** A checkpoint plane, crossed in order. */
export interface Gate {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  radius: number;
  order: number;
  distance: number;
  alternatives?: Gate[];
}

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
}

/** Desert Valley airborne tuning (see content/tracks/desert-valley). */
export interface JumpSettings {
  takeoffDropM: number;
  minimumSpeedMps: number;
  gravityUp: number;
  gravityDown: number;
  maxRiseSpeedMps: number;
  terminalFallMps: number;
  landingRestitution: number;
  minimumBounceMps: number;
  maximumBounceMps: number;
  bounceDuration: number;
  landingCompressionM: number;
  landingSpring: number;
  landingDamping: number;
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const CELL = 32;

/**
 * The closed route of a track (metres, +Y up, +Z forward): nearest-road
 * queries, distance lookups, gates and spawn. Pure data + math, shared by the
 * player, AI rivals and (later) network peers.
 */
export class Landscape {
  readonly type = 'circuit';
  readonly samples: RouteSample[];
  readonly length: number;
  readonly gates: Gate[];
  /** Legacy seed kept for compatibility with saved records. */
  readonly seed: number;
  spawn: SpawnPoint;
  yaw: number;
  /** Half extent of the minimap, in metres. */
  mapHalf: number;
  /** Track id (set by the track). */
  map = '';
  /** Collision meshes bound the track; no virtual walls from route width. */
  physicalBoundaries = false;
  /** Desert Valley allows airborne traversal over gaps and ramps. */
  allowJumps = false;
  /** Authored forest ramp; independent of Desert Valley ledge physics. */
  launchAt?: (previous: Position3, state: HoverState) => {height: number; velocity: number} | null;
  surfaceGradeAt?: (x: number, z: number, yaw: number) => number | undefined;
  jumpSettings: JumpSettings | null = null;
  shortcut: Vec3Array[] | null = null;

  private readonly grid: Map<number, number[]>;
  private readonly gridMin: [number, number];
  private readonly gridSize: [number, number];

  constructor(route: RouteData, gameplay: GameplayData) {
    const samples = route.samples;
    this.samples = samples;
    this.length = route.length_m;
    const checkpoints: Gate[] = gameplay.checkpoints.map((cp) => ({
      x: cp.position_gltf[0],
      y: cp.position_gltf[1] + HOVER_HEIGHT,
      z: cp.position_gltf[2],
      nx: cp.forward_gltf[0],
      nz: cp.forward_gltf[2],
      radius: (cp.width_m ?? gameplay.road_width_m ?? 12) / 2,
      order: cp.order,
      distance: samples[cp.route_index].distance_m,
    }));
    // Cross start, CP01…CP15, then start again; crossing the grid is not a lap.
    this.gates = [...checkpoints, {...checkpoints[0]}];
    this.seed = gameplay.road_width_m === 18 ? 35 : 34;
    ({grid: this.grid, min: this.gridMin, size: this.gridSize} = buildGrid(samples));
    const grid = gameplay.spawn_positions[0];
    const p = grid.position_gltf;
    const road = this.roadAt(p[0], p[2]);
    this.spawn = {x: p[0], y: road.y + HOVER_HEIGHT, z: p[2]};
    this.yaw = Math.atan2(grid.forward_gltf[0], grid.forward_gltf[2]);
    this.mapHalf = Math.max(...samples.map((s) => Math.max(Math.abs(s.position[0]), Math.abs(s.position[2])))) + 28;
  }

  /** Route surface height under (x, z); tracks with real collision override this. */
  height = (x: number, z: number): number => this.roadAt(x, z).y;

  /** Nearest point on the route centreline. */
  roadAt(x: number, z: number): RoadQuery {
    const {index, t, squared} = this.nearestSegment(x, z);
    return {...this.segment(index, t, x, z), distanceToRoad: Math.sqrt(squared)};
  }

  /** Point at `distance` metres along the lap (wraps). */
  atDistance(distance: number): RoadPoint {
    const {samples, length} = this;
    const d = ((distance % length) + length) % length;
    let i = samples.length - 1;
    for (let j = 0; j < samples.length - 1; j++) {
      if (samples[j + 1].distance_m > d) {
        i = j;
        break;
      }
    }
    const end = i === samples.length - 1 ? length : samples[i + 1].distance_m;
    return this.segment(i, (d - samples[i].distance_m) / (end - samples[i].distance_m), 0, 0);
  }

  private segment(i: number, t: number, x: number, z: number): RoadPoint {
    const {samples, length} = this;
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    const p = a.position;
    const q = b.position;
    const dx = q[0] - p[0];
    const dz = q[2] - p[2];
    const horizontal = Math.hypot(dx, dz);
    const nx = dx / horizontal;
    const nz = dz / horizontal;
    const cx = p[0] + dx * t;
    const cz = p[2] + dz * t;
    return {
      x: cx,
      y: p[1] + (q[1] - p[1]) * t,
      z: cz,
      nx,
      nz,
      grade: (q[1] - p[1]) / horizontal,
      index: i,
      distance: a.distance_m + ((i === samples.length - 1 ? length : b.distance_m) - a.distance_m) * t,
      offset: (x - cx) * -nz + (z - cz) * nx,
      width: a.width_m ?? 12,
    };
  }

  /**
   * Same answer as scanning every segment (ties resolve to the lowest index),
   * but only visits grid rings until no unvisited segment can be closer.
   */
  private nearestSegment(x: number, z: number): {index: number; t: number; squared: number} {
    const best = {index: 0, t: 0, squared: Infinity};
    const [minX, minZ] = this.gridMin;
    const [width, depth] = this.gridSize;
    const cx = Math.floor((x - minX) / CELL);
    const cz = Math.floor((z - minZ) / CELL);
    if (cx < 0 || cz < 0 || cx >= width || cz >= depth) {
      for (let i = 0; i < this.samples.length; i++) this.test(i, x, z, best);
      return best;
    }
    const rings = Math.max(width, depth);
    for (let r = 0; r <= rings; r++) {
      for (let gz = cz - r; gz <= cz + r; gz++) {
        if (gz < 0 || gz >= depth) continue;
        const edge = gz === cz - r || gz === cz + r;
        for (let gx = cx - r; gx <= cx + r; gx += edge ? 1 : 2 * r || 1) {
          if (gx < 0 || gx >= width) continue;
          const cell = this.grid.get(gz * width + gx);
          if (cell) for (const i of cell) this.test(i, x, z, best);
        }
      }
      // Unvisited segments lie at least r cells away from the query cell.
      if (Math.sqrt(best.squared) < r * CELL) break;
    }
    return best;
  }

  private test(i: number, x: number, z: number, best: {index: number; t: number; squared: number}): void {
    const {samples} = this;
    const a = samples[i].position;
    const b = samples[(i + 1) % samples.length].position;
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const t = clamp(((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = (x - a[0] - dx * t) ** 2 + (z - a[2] - dz * t) ** 2;
    if (d < best.squared || (d === best.squared && i < best.index)) {
      best.index = i;
      best.t = t;
      best.squared = d;
    }
  }
}

function buildGrid(samples: RouteSample[]): {grid: Map<number, number[]>; min: [number, number]; size: [number, number]} {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const {position: p} of samples) {
    minX = Math.min(minX, p[0]);
    minZ = Math.min(minZ, p[2]);
    maxX = Math.max(maxX, p[0]);
    maxZ = Math.max(maxZ, p[2]);
  }
  // A margin keeps nearby off-track queries on the fast path.
  minX -= CELL * 2;
  minZ -= CELL * 2;
  const width = Math.ceil((maxX - minX) / CELL) + 3;
  const depth = Math.ceil((maxZ - minZ) / CELL) + 3;
  const grid = new Map<number, number[]>();
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i].position;
    const b = samples[(i + 1) % samples.length].position;
    const x0 = Math.floor((Math.min(a[0], b[0]) - minX) / CELL);
    const x1 = Math.floor((Math.max(a[0], b[0]) - minX) / CELL);
    const z0 = Math.floor((Math.min(a[2], b[2]) - minZ) / CELL);
    const z1 = Math.floor((Math.max(a[2], b[2]) - minZ) / CELL);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const key = gz * width + gx;
        let cell = grid.get(key);
        if (!cell) grid.set(key, (cell = []));
        cell.push(i);
      }
    }
  }
  return {grid, min: [minX, minZ], size: [width, depth]};
}
