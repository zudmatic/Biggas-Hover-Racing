import type {HoverState, Position3} from './hover-state';
import type {SurfaceHeight} from './hover-physics';
import type {Landscape} from './landscape';

export interface OilSettings {
  width: number;
  endWidth: number;
  spread: number;
  endSpread: number;
  spacing: number;
  variation: number;
  taper: number;
  entryTime: number;
  recoveryTime: number;
  pourDuration: number;
  lifetime: number;
  slowdown: number;
  respawn: number;
  botSpeed: number;
}

export const OIL_DEFAULTS: OilSettings = {
  width: 2.6,
  endWidth: 2.6,
  spread: 0,
  endSpread: 0,
  spacing: 0.8,
  variation: 0,
  taper: 1,
  entryTime: 3 / 14,
  recoveryTime: 1,
  pourDuration: 2,
  lifetime: 5,
  slowdown: 0.3,
  respawn: 8,
  botSpeed: 22,
};

export interface OilPatch {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  born: number;
  expires: number;
}

export interface OilPickup {
  x: number;
  y: number;
  z: number;
  readyAt: number;
}

type OilEmitter = Pick<HoverState, 'x' | 'z' | 'yaw'> & {modelScale?: number};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const noise = (seed: number) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
};

export function clearOilEffect(state: Pick<HoverState, 'oilContact' | 'oilFactor'>): void {
  state.oilContact = false;
  state.oilFactor = 1;
}

export function updateOilResistance(
  state: Pick<HoverState, 'oilContact' | 'oilFactor'>,
  touching: boolean,
  dt: number,
  slowdown: number,
  settings: OilSettings = OIL_DEFAULTS,
): void {
  state.oilContact = touching;
  const target = touching ? 1 - slowdown : 1;
  const duration = touching ? settings.entryTime : settings.recoveryTime;
  state.oilFactor = (state.oilFactor ?? 1) + (target - (state.oilFactor ?? 1)) * (1 - Math.exp((-dt * 3) / Math.max(0.05, duration)));
}

/**
 * Oil slicks: pickups along the route, a timed pour behind the emitter and
 * expiring patches that slow whoever touches them. Simulation time advances
 * only when the host is flying. Oil is shared by every racer; overlapping
 * patches never multiply the penalty.
 */
export class OilSimulation {
  readonly config: OilSettings;
  readonly patches: OilPatch[] = [];
  readonly pickups: OilPickup[] = [];
  private elapsed = 0;
  private hasOil = false;
  private pourLeft = 0;
  private pourTotal = 0;
  private lastDrop: {x: number; z: number} | null = null;
  private serial = 0;

  constructor(
    private readonly landscape: Landscape,
    private readonly surfaceHeight: SurfaceHeight,
    settings: Partial<OilSettings> = {},
  ) {
    this.config = {...OIL_DEFAULTS, ...settings};
    const start = landscape.roadAt(landscape.spawn.x, landscape.spawn.z).distance;
    for (let d = 14; d < landscape.length - 15; d += 150) {
      const road = landscape.atDistance(start + d);
      for (const offset of [-2.6, 0, 2.6]) {
        const x = road.x - road.nz * offset;
        const z = road.z + road.nx * offset;
        const y = this.floor(x, z);
        if (y !== null) this.pickups.push({x, y, z, readyAt: 0});
      }
    }
  }

  get time(): number {
    return this.elapsed;
  }

  get inventory(): boolean {
    return this.hasOil;
  }

  get pouring(): boolean {
    return this.pourLeft > 0;
  }

  /** Drivable road height at (x, z), or null on curbs, voids and other levels. */
  floor = (x: number, z: number): number | null => {
    const road = this.landscape.roadAt(x, z);
    const y = this.surfaceHeight(x, z);
    return y != null && Number.isFinite(y) && Math.abs(road.offset) < road.width / 2 - 0.25 && Math.abs(y - road.y) < 2 ? y : null;
  };

  contact = (state: Pick<HoverState, 'x' | 'y' | 'z' | 'hover'>): boolean =>
    this.patches.some((p) => Math.abs(state.y - (state.hover ?? 0.65) - p.y) < 1.5 && Math.hypot(state.x - p.x, state.z - p.z) < p.radius);

  grant(): void {
    if (!this.pourLeft) this.hasOil = true;
  }

  startPour(): boolean {
    if (this.pourLeft > 0) return false;
    this.pourTotal = this.pourLeft = this.config.pourDuration;
    this.lastDrop = null;
    return true;
  }

  use(): boolean {
    if (!this.hasOil || this.pourLeft > 0) return false;
    this.hasOil = false;
    this.pourTotal = this.pourLeft = this.config.pourDuration;
    this.lastDrop = null;
    return true;
  }

  cancelPour(): void {
    this.pourLeft = 0;
    this.lastDrop = null;
  }

  reset(): void {
    this.elapsed = 0;
    this.hasOil = false;
    this.pourLeft = 0;
    this.lastDrop = null;
    this.patches.length = 0;
    for (const pickup of this.pickups) pickup.readyAt = 0;
  }

  step(dt: number, state: HoverState, previous: Position3 = state, emitter: OilEmitter = state): void {
    const {patches, config} = this;
    this.elapsed += dt;
    const time = this.elapsed;
    for (let i = patches.length - 1; i >= 0; i--) if (patches[i].expires <= time) patches.splice(i, 1);
    if (!this.hasOil && !this.pourLeft) {
      const dx = state.x - previous.x;
      const dz = state.z - previous.z;
      const length2 = dx * dx + dz * dz;
      for (const p of this.pickups) {
        if (p.readyAt > time) continue;
        const t = length2 ? clamp(((p.x - previous.x) * dx + (p.z - previous.z) * dz) / length2, 0, 1) : 0;
        const x = previous.x + t * dx;
        const z = previous.z + t * dz;
        if (Math.hypot(p.x - x, p.z - z) < 1.6 && Math.abs(state.y - p.y) < 2.5) {
          this.hasOil = true;
          p.readyAt = time + config.respawn;
          break;
        }
      }
    }
    if (this.pourLeft > 0) {
      const rear = 2.9 * (emitter.modelScale ?? 0.75);
      const x = emitter.x - Math.sin(emitter.yaw) * rear;
      const z = emitter.z - Math.cos(emitter.yaw) * rear;
      const last = this.lastDrop;
      if (!last) {
        this.drop(x, z, emitter.yaw);
        this.lastDrop = {x, z};
      } else {
        const distance = Math.hypot(x - last.x, z - last.z);
        const spacing = Math.max(0.2, config.spacing);
        if (distance > 12) {
          this.lastDrop = null; // Recovery/teleport must not paint across the map.
        } else if (distance >= spacing) {
          const n = Math.floor(distance / spacing);
          for (let i = 1; i <= n; i++)
            this.drop(last.x + ((x - last.x) * i * spacing) / distance, last.z + ((z - last.z) * i * spacing) / distance, emitter.yaw);
          this.lastDrop = {x: last.x + ((x - last.x) * n * spacing) / distance, z: last.z + ((z - last.z) * n * spacing) / distance};
        }
      }
      this.pourLeft = Math.max(0, this.pourLeft - dt);
      if (!this.pourLeft) this.lastDrop = null;
    }
  }

  private drop(x: number, z: number, yaw: number): void {
    const {config} = this;
    if (config.lifetime <= 0) return;
    const t = Math.pow(clamp(1 - this.pourLeft / this.pourTotal, 0, 1), config.taper);
    const id = this.serial++;
    const spread = config.spread + (config.endSpread - config.spread) * t;
    const lateral = noise(id + 1) * spread;
    x += Math.cos(yaw) * lateral;
    z -= Math.sin(yaw) * lateral;
    const radius = Math.max(0.12, ((config.width + (config.endWidth - config.width) * t) / 2) * (1 + noise(id + 91) * config.variation));
    const y = this.floor(x, z);
    if (y === null) return;
    // Do not span voids, curbs or neighboring road levels.
    for (const [dx, dz] of [
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
    ]) {
      const h = this.floor(x + dx, z + dz);
      if (h === null || Math.abs(h - y) > 1.2) return;
    }
    if (this.patches.length >= 256) this.patches.shift();
    this.patches.push({id, x, y, z, radius, born: this.elapsed, expires: this.elapsed + config.lifetime});
  }
}
