import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Group,
  MathUtils,
  Mesh,
  NearestFilter,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Color,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import type {SurfaceHeight} from '@/sim/hover-physics';
import type {Effect, FxFrame, VehicleFxState} from '../effect';
import {createSmokeMaterial} from './smoke-material';

/**
 * Builds the smoke (ground = false) or skid-mark (ground = true) material over the pixel-comic atlas.
 * The material must expose `uniforms.{style, smokeColor, smokeDensity, screenGrain}` as `{value}` slots.
 */
export type SmokeMaterialFactory = (atlas: Texture, ground: boolean) => Material;

/** Uniform slots of a smoke material: the TSL material's uniform nodes or the GLSL reference's `{value}` holders. */
export type SmokeUniformSlots = Record<string, {value: unknown}>;
type SmokeMaterialLike = Material & {uniforms: SmokeUniformSlots};

const hasSmokeUniforms = (material: Material): material is SmokeMaterialLike => {
  const uniforms: unknown = (material as Partial<SmokeMaterialLike>).uniforms;
  return typeof uniforms === 'object' && uniforms !== null;
};

/** A: procedural fragments · B: hybrid atlas smoke · C: a mix of both. */
export type SmokeStyle = 'procedural' | 'hybrid' | 'mixed';
const SMOKE_STYLES: readonly string[] = ['procedural', 'hybrid', 'mixed'] satisfies SmokeStyle[];
const isSmokeStyle = (value: unknown): value is SmokeStyle => typeof value === 'string' && SMOKE_STYLES.includes(value);

/** Live tweaks from the comparison dials; invalid values are ignored. */
export interface DriftFxConfig {
  size?: number;
  lifetime?: number;
  fourSupports?: boolean;
  /** '#rrggbb' */
  color?: string;
  density?: number;
  grain?: number;
}

export interface DriftFxStats {
  air: number;
  marks: number;
  emitted: number;
  markEmitted: number;
  time: number;
}

export interface DriftFxOptions {
  surfaceHeight: SurfaceHeight;
  texture: Texture;
  /** Smaller pools and emission for phones. */
  mobile?: boolean;
  random?: () => number;
  materialFactory?: SmokeMaterialFactory;
}

// Two triangles per quad: (u offset, v) of each corner.
const CORNER_U = [-0.5, 0.5, 0.5, -0.5, 0.5, -0.5];
const CORNER_V = [0, 0, 1, 0, 1, 1];

const isColor = (value: unknown): value is Color => typeof value === 'object' && value !== null && (value as Color).isColor === true;

/** One pooled quad batch: positions, uvs and per-vertex (fade, frame, warm). */
class QuadBatch {
  readonly geometry = new BufferGeometry();
  readonly material: SmokeMaterialLike;
  readonly mesh: Mesh;
  private readonly position: BufferAttribute;
  private readonly uv: BufferAttribute;
  private readonly fx: BufferAttribute;

  constructor(root: Object3D, capacity: number, texture: Texture, ground: boolean, factory: SmokeMaterialFactory) {
    const attribute = (size: number) => new BufferAttribute(new Float32Array(capacity * 6 * size), size).setUsage(DynamicDrawUsage);
    this.position = attribute(3);
    this.uv = attribute(2);
    this.fx = attribute(3);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('uv', this.uv);
    this.geometry.setAttribute('fx', this.fx);
    this.geometry.setDrawRange(0, 0);
    const material = factory(texture, ground);
    if (!hasSmokeUniforms(material))
      throw new Error('El material de humo necesita uniforms (style, smokeColor, smokeDensity, screenGrain).');
    this.material = material;
    this.material.userData.retro = true;
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = ground ? 'FX · roces de hover' : 'FX · humo y chispas';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    root.add(this.mesh);
  }

  write(i: number, x: number, y: number, z: number, u: number, v: number, fade: number, frame: number, warm = 0): void {
    const {position, uv, fx} = this;
    position.array[i * 3] = x;
    position.array[i * 3 + 1] = y;
    position.array[i * 3 + 2] = z;
    uv.array[i * 2] = u;
    uv.array[i * 2 + 1] = v;
    fx.array[i * 3] = fade;
    fx.array[i * 3 + 1] = frame;
    fx.array[i * 3 + 2] = warm;
  }

  /** Draws the first `count` quads; uploads only those, and skips empty draws. */
  finish(count: number): void {
    this.geometry.setDrawRange(0, count * 6);
    this.mesh.visible = count > 0;
    if (count === 0) return;
    for (const attribute of [this.position, this.uv, this.fx]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * 6 * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

class SmokeParticle {
  life = 0;
  total = 0;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  size = 0;
  angle = 0;
  spin = 0;
  /** Silhouette seed; +1000 marks a hybrid puff, sparks draw with frame -1. */
  seed = 0;
  spark = false;
  warm = 0;
}

class SkidMark {
  life = 0;
  total = 0;
  /** Six corners, xyz each. */
  readonly points = new Float32Array(18);
}

/** Cosmetic only. Pools are bounded; no vehicle state or collision data is mutated. */
export class DriftFx implements Effect {
  readonly group = new Group();
  readonly stats: DriftFxStats = {air: 0, marks: 0, emitted: 0, markEmitted: 0, time: 0};
  private readonly air: QuadBatch;
  private readonly ground: QuadBatch;
  private readonly particles: SmokeParticle[];
  private readonly marks: SkidMark[];
  private readonly surfaceHeight: SurfaceHeight;
  private readonly texture: Texture;
  private readonly mobile: boolean;
  private readonly random: () => number;
  private readonly settings = {size: 1.3, lifetime: 1.5, fourSupports: false};
  private readonly right = new Vector3(1, 0, 0);
  private readonly up = new Vector3(0, 1, 0);
  /** Corner scratch for a mark until all six corners land on the ground. */
  private readonly markPoints = new Float32Array(18);
  private readonly last = {x: 0, z: 0};
  private hasLast = false;
  private cursor = 0;
  private markCursor = 0;
  private emission = 0;
  private trailDistance = 0;
  private nextEmission = 1;
  private supportCursor = 0;
  private styleValue: SmokeStyle = 'hybrid';
  private disposed = false;

  /** Loads the pixel-comic atlas and builds the pools. */
  static async load(root: Object3D, options: Omit<DriftFxOptions, 'texture'>): Promise<DriftFx> {
    const texture = await new TextureLoader().loadAsync(`${import.meta.env.BASE_URL}images/fx/pixel-comic-source-v1.png`);
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    return new DriftFx(root, {...options, texture});
  }

  constructor(
    root: Object3D,
    {surfaceHeight, texture, mobile = false, random = Math.random, materialFactory = createSmokeMaterial}: DriftFxOptions,
  ) {
    this.surfaceHeight = surfaceHeight;
    this.texture = texture;
    this.mobile = mobile;
    this.random = random;
    this.group.name = 'FX · pixel-cómic';
    root.add(this.group);
    this.air = new QuadBatch(this.group, mobile ? 40 : 96, texture, false, materialFactory);
    this.ground = new QuadBatch(this.group, mobile ? 64 : 160, texture, true, materialFactory);
    this.particles = Array.from({length: mobile ? 40 : 96}, () => new SmokeParticle());
    this.marks = Array.from({length: mobile ? 64 : 160}, () => new SkidMark());
    this.air.material.uniforms.style.value = 1;
    this.group.userData.stats = this.stats;
  }

  get style(): SmokeStyle {
    return this.styleValue;
  }

  setStyle(value: string | null | undefined): void {
    if (!isSmokeStyle(value) || value === this.styleValue) return;
    this.styleValue = value;
    this.air.material.uniforms.style.value = value === 'mixed' ? 2 : value === 'hybrid' ? 1 : 0;
    this.reset();
  }

  configure({size, lifetime, fourSupports, color, density, grain}: DriftFxConfig = {}): void {
    const {settings} = this;
    const uniforms = this.air.material.uniforms;
    if (size !== undefined && Number.isFinite(size)) settings.size = MathUtils.clamp(size, 0.5, 2.5);
    if (lifetime !== undefined && Number.isFinite(lifetime)) settings.lifetime = MathUtils.clamp(lifetime, 0.5, 3);
    if (typeof fourSupports === 'boolean') settings.fourSupports = fourSupports;
    const smokeColor = uniforms.smokeColor.value;
    if (typeof color === 'string' && /^#[\da-f]{6}$/i.test(color) && isColor(smokeColor)) smokeColor.set(color);
    if (density !== undefined && Number.isFinite(density)) uniforms.smokeDensity.value = MathUtils.clamp(density, 0.15, 1);
    if (grain !== undefined && Number.isFinite(grain)) uniforms.screenGrain.value = MathUtils.clamp(grain, 1, 4);
  }

  reset(): void {
    for (const p of this.particles) p.life = 0;
    for (const m of this.marks) m.life = 0;
    this.emission = this.trailDistance = 0;
    this.nextEmission = 1;
    this.supportCursor = 0;
    this.hasLast = false;
    const {stats} = this;
    stats.air = stats.marks = stats.emitted = stats.markEmitted = stats.time = 0;
    this.air.finish(0);
    this.ground.finish(0);
  }

  update(dt: number, {state, phase = 'flying', camera, scale = 1, reduced = false}: FxFrame = {}): void {
    if (this.disposed || !state) return;
    const {particles, marks, stats, right, up, random} = this;
    const tick = phase === 'flying' ? Math.max(0, Math.min(dt, 0.1)) : 0;
    stats.time += tick;
    this.group.visible = !reduced;
    if (camera) {
      camera.updateMatrixWorld();
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
    }
    for (const p of particles) {
      p.life -= tick;
      if (p.life > 0) {
        p.x += p.vx * tick;
        p.y += p.vy * tick;
        p.z += p.vz * tick;
        p.vx *= Math.exp(-tick * 2);
        p.vz *= Math.exp(-tick * 2);
        p.angle += p.spin * tick;
      }
    }
    for (const m of marks) m.life -= tick;
    const slide = Math.abs(state.slip ?? 0) * state.speed;
    const active = !reduced && state.speed > 8 && (state.braking || (state.drifting && slide > 0.65));
    if (tick > 0) {
      if (active) {
        const strength = state.braking ? Math.min(1, state.speed / 28) : Math.min(1, slide / 6);
        const rate = (this.mobile ? 30 : 55) * strength;
        this.emission += tick * rate;
        while (this.emission >= this.nextEmission) {
          this.emission -= this.nextEmission;
          this.nextEmission = 0.7 + random() * 0.6;
          const outside = Math.sign(state.slip ?? 0) || 1;
          const support = this.supportCursor++ % 4;
          const side = this.settings.fourSupports ? (support % 2 === 0 ? -1 : 1) : random() < 0.68 ? outside : -outside;
          const front = this.settings.fourSupports && support >= 2;
          this.puff(state, side, scale, false, front);
          if ((state.impact > 1 || slide > 7) && random() < 0.06) this.puff(state, side, scale, true, front);
        }
        if (this.hasLast) {
          const dx = state.x - this.last.x;
          const dz = state.z - this.last.z;
          const d = Math.hypot(dx, dz);
          if (d < Math.max(4, state.speed * tick * 2)) {
            const spacing = 0.65 * scale;
            for (let offset = spacing - this.trailDistance; offset <= d; offset += spacing) {
              const f = offset / d;
              const x = this.last.x + dx * f;
              const z = this.last.z + dz * f;
              this.mark(state, -1, scale, x, z, dx, dz);
              this.mark(state, 1, scale, x, z, dx, dz);
            }
            this.trailDistance = (this.trailDistance + d) % spacing;
          } else this.trailDistance = 0;
        }
        this.last.x = state.x;
        this.last.z = state.z;
        this.hasLast = true;
      } else {
        this.emission = this.trailDistance = 0;
        this.hasLast = false;
      }
    }
    if (reduced) {
      for (const p of particles) p.life = 0;
      for (const m of marks) m.life = 0;
      this.hasLast = false;
      this.emission = this.trailDistance = 0;
    }

    const {air, ground} = this;
    let n = 0;
    for (const p of particles) {
      if (p.life <= 0) continue;
      const age = 1 - p.life / p.total;
      const size = p.size * (0.55 + age * 1.1);
      const frame = p.spark ? -1 : p.seed;
      const c = Math.cos(p.angle);
      const s = Math.sin(p.angle);
      const fade = Math.min(0.85, p.life / 0.25);
      for (let k = 0; k < 6; k++) {
        const u = CORNER_U[k];
        const v = CORNER_V[k];
        const rx = (u * c - (v - 0.5) * s) * size;
        const ry = (u * s + (v - 0.5) * c) * size;
        air.write(
          n * 6 + k,
          p.x + right.x * rx + up.x * ry,
          p.y + right.y * rx + up.y * ry,
          p.z + right.z * rx + up.z * ry,
          u + 0.5,
          v,
          fade,
          frame,
          p.warm,
        );
      }
      n++;
    }
    stats.air = n;
    air.finish(n);
    n = 0;
    for (const m of marks) {
      if (m.life <= 0) continue;
      const fade = Math.min(0.85, m.life / 0.65);
      for (let k = 0; k < 6; k++)
        ground.write(n * 6 + k, m.points[k * 3], m.points[k * 3 + 1], m.points[k * 3 + 2], CORNER_U[k] + 0.5, CORNER_V[k], fade, 0);
      n++;
    }
    stats.marks = n;
    ground.finish(n);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.air.dispose();
    this.ground.dispose();
    this.texture.dispose();
    this.group.removeFromParent();
  }

  private puff(state: VehicleFxState, side: number, scale: number, spark = false, front = false): void {
    const {random, settings} = this;
    // Pick once at birth: the mixed plume keeps both silhouettes without morphing.
    const hybrid = this.styleValue === 'hybrid' || (this.styleValue === 'mixed' && random() < 0.6);
    const half = state.hull?.halfWidth ?? 1.52 * scale;
    const rear = (state.hull?.halfLength ?? 2.4 * scale) * 0.65 * (front ? -1 : 1);
    const sx = Math.sin(state.yaw);
    const sz = Math.cos(state.yaw);
    const p = this.particles[this.cursor++ % this.particles.length];
    const life = spark ? 0.12 + random() * 0.12 : (0.4 + random() * 0.35) * settings.lifetime;
    const lateral = (state.slip ?? 0) * state.speed;
    const scatter = (random() - 0.5) * 0.4 * scale;
    p.life = life;
    p.total = life;
    p.x = state.x - sx * rear + sz * (half * side + scatter);
    p.y = state.y - 0.22 * scale;
    p.z = state.z - sz * rear - sx * (half * side + scatter);
    p.vx = state.vx * 0.08 + sz * (lateral * 0.22 + side * 0.5);
    p.vy = spark ? 0.3 : 0.15 + random() * 0.25;
    p.vz = state.vz * 0.08 - sx * (lateral * 0.22 + side * 0.5);
    p.size = (spark ? 0.65 + random() * 0.35 : (hybrid ? 1.2 + random() * 0.8 : 0.65 + random() * 0.75) * settings.size) * scale;
    p.angle = random() * Math.PI * 2;
    p.spin = (random() - 0.5) * 1.8;
    p.seed = random() * 999 + (hybrid ? 1000 : 0);
    p.spark = spark;
    p.warm = state.braking ? 1 : 0;
    this.stats.emitted++;
  }

  private mark(state: VehicleFxState, side: number, scale: number, x: number, z: number, dx: number, dz: number): void {
    const length = Math.hypot(dx, dz);
    if (length < 0.001) return;
    const nx = -dz / length;
    const nz = dx / length;
    const half = state.hull?.halfWidth ?? 1.52 * scale;
    const rear = (state.hull?.halfLength ?? 2.4 * scale) * 0.65;
    const cx = x - Math.sin(state.yaw) * rear + Math.cos(state.yaw) * half * side;
    const cz = z - Math.cos(state.yaw) * rear - Math.sin(state.yaw) * half * side;
    const width = 0.15 * scale;
    const len = 0.52 * scale;
    const points = this.markPoints;
    for (let k = 0; k < 6; k++) {
      const u = CORNER_U[k];
      const v = CORNER_V[k];
      const px = cx + nx * u * width + (dx / length) * (v - 0.5) * len;
      const pz = cz + nz * u * width + (dz / length) * (v - 0.5) * len;
      const y = this.surfaceHeight(px, pz);
      if (y == null || !Number.isFinite(y) || Math.abs(y - (state.y - state.hover)) > 1.2) return;
      points[k * 3] = px;
      points[k * 3 + 1] = y + 0.028;
      points[k * 3 + 2] = pz;
    }
    const mark = this.marks[this.markCursor++ % this.marks.length];
    mark.life = 2;
    mark.total = 2;
    mark.points.set(points);
    this.stats.markEmitted++;
  }
}
