import {
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Object3D,
  PlaneGeometry,
  Vector3,
  type Node,
  type Texture,
} from 'three/webgpu';
import {float, positionWorld, texture, vec2} from 'three/tsl';
import {createDialKit, type DialConfig, type DialKitController, type ResolvedValues} from '@/core/debug/dials';
import {CIRCUIT_BOOST} from '@/sim/hover-physics';
import type {Effect, FxFrame, FxQuality} from '../effect';
import {WaterFxMaterial, type WaterFxKind} from './hover-material';

export const HOVER_WATER_FX = Object.freeze({
  foamCount: 192,
  sprayCount: 128,
  splashCount: 24,
  mobileFoamCount: 96,
  mobileSprayCount: 64,
  mobileSplashCount: 16,
  gravity: 12,
  maxBirthsPerFrame: 16,
});

/** The river the hover skims: a wet test and a coverage mask texture over its bounds. */
export interface WaterRiver {
  readonly coverage: Texture;
  readonly coverageInfo: {readonly minXZ: readonly number[]; readonly sizeXZ: readonly number[]};
  isWet(x: number, z: number): boolean;
}

export interface HoverWaterOptions {
  root: Object3D;
  river: WaterRiver;
  /** Animated water surface height. */
  heightAt(x: number, z: number): number;
  mobile?: boolean;
}

const DIALS = {
  Activo: true,
  Intensidad: [1, 0, 2, 0.05],
  Densidad: [1, 0, 2, 0.05],
  Espuma: true,
  Salpicones: true,
  'Ancho espuma': [1.1, 0.25, 3, 0.05],
  'Persistencia espuma': [1.35, 0.2, 4, 0.05],
  'Tamaño lento': [0.1, 0.05, 0.6, 0.01],
  'Tamaño rápido': [0.6, 0.1, 0.6, 0.01],
  'Altura salpicón': [1.1, 0.2, 2.6, 0.05],
  'Altura máxima': [2.6, 0.2, 2.6, 0.05],
  'Alcance lateral': [1, 0.2, 2, 0.05],
  'Cerca del agua': [0.9, 0.2, 2, 0.05],
  'Altura de corte': [3.2, 1, 8, 0.1],
  'Velocidad mínima': [3, 0, 25, 1],
  'Velocidad plena': [35, 10, 80, 1],
  'Respuesta velocidad': [0.7, 0.3, 2, 0.05],
  Trama: [0.3, 0, 1, 0.05],
} satisfies DialConfig;

class WaterParticle {
  life = 0;
  total = 1;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  width = 1;
  length = 1;
  angle = 0;
  opacity = 0;
  seed = 0;
}

/** One bounded instance pool. Live instances are packed at the front, in slot order, and only they are drawn and uploaded. */
class WaterPool {
  readonly mesh: InstancedMesh;
  readonly geometry = new PlaneGeometry(1, 1);
  readonly shader: WaterFxMaterial;
  /** Per instance: opacity, seed, age. */
  readonly data: InstancedBufferAttribute;
  readonly items: WaterParticle[];
  cursor = 0;
  emission = 0;

  constructor(
    readonly kind: WaterFxKind,
    count: number,
    wetMask: Node,
    group: Group,
  ) {
    if (kind === 'foam') this.geometry.rotateX(-Math.PI / 2);
    this.data = new InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('waterFxData', this.data);
    this.shader = new WaterFxMaterial(kind, wetMask);
    this.mesh = new InstancedMesh(this.geometry, this.shader.material, count);
    this.mesh.name = 'Water ' + kind + ' pool';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    group.add(this.mesh);
    this.items = Array.from({length: count}, () => new WaterParticle());
  }

  /** Draws the first `alive` instances; nothing is drawn or uploaded for an empty pool. */
  commit(alive: number): void {
    const {mesh, data} = this;
    mesh.count = alive;
    mesh.visible = alive > 0;
    if (alive === 0) return;
    data.clearUpdateRanges();
    data.addUpdateRange(0, alive * 3);
    data.needsUpdate = true;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, alive * 16);
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.shader.dispose();
  }
}

// Bounded instance pools like skid effects. No rings, compute dependency,
// offscreen pass, texture downloads, or per-frame geometry allocation.
export class HoverWaterEffects implements Effect {
  readonly kit: DialKitController<typeof DIALS>;
  /** Triangle budget of all pools at capacity. */
  readonly triangles: number;
  private values: ResolvedValues<typeof DIALS>;
  private readonly unsubscribe: () => void;
  private readonly group = new Group();
  private readonly river: WaterRiver;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly foam: WaterPool;
  private readonly spray: WaterPool;
  private readonly splash: WaterPool;
  private readonly pools: readonly WaterPool[];
  private readonly dummy = new Object3D();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly random = Math.random;
  private readonly rates = [0, 0, 0];
  /** Emission scale: phones emit fewer particles. */
  private emissionQuality: number;
  private strength = 0;
  private lastX: number | null = null;
  private lastZ: number | null = null;
  private disposed = false;

  constructor({root, river, heightAt, mobile = false}: HoverWaterOptions) {
    const config = HOVER_WATER_FX;
    this.river = river;
    this.heightAt = heightAt;
    this.emissionQuality = mobile ? 0.65 : 1;
    this.group.name = 'Desert hover foam and splashes';
    root.add(this.group);
    const info = river.coverageInfo;
    const maskUV = positionWorld.xz.sub(vec2(info.minXZ[0], info.minXZ[1])).div(vec2(info.sizeXZ[0], info.sizeXZ[1]));
    const inBounds = maskUV.x
      .greaterThan(0)
      .and(maskUV.x.lessThan(1))
      .and(maskUV.y.greaterThan(0))
      .and(maskUV.y.lessThan(1))
      .select(float(1), float(0));
    const wetMask = texture(river.coverage, maskUV).r.mul(inBounds);
    this.foam = new WaterPool('foam', mobile ? config.mobileFoamCount : config.foamCount, wetMask, this.group);
    this.spray = new WaterPool('spray', mobile ? config.mobileSprayCount : config.sprayCount, wetMask, this.group);
    this.splash = new WaterPool('splash', mobile ? config.mobileSplashCount : config.splashCount, wetMask, this.group);
    this.pools = [this.foam, this.spray, this.splash];
    this.triangles = this.pools.reduce((sum, p) => sum + p.items.length * 2, 0);
    this.kit = createDialKit('Agua · espuma y salpicones', DIALS, {id: 'desert-water-fx-v2', persist: true, defaultCollapsed: false});
    this.values = this.kit.values;
    // Cache the values here: reading kit.values rebuilds the whole object.
    this.unsubscribe = this.kit.subscribe((v) => {
      this.values = v;
    });
    this.reset();
  }

  setQuality(level: FxQuality): void {
    this.emissionQuality = level === 'low' ? 0.65 : 1;
  }

  reset(): void {
    for (const p of this.pools) {
      for (const item of p.items) item.life = 0;
      p.emission = 0;
      p.commit(0);
    }
    this.strength = 0;
    this.lastX = this.lastZ = null;
    this.group.visible = false;
  }

  update(dt: number, {state, camera, phase, night = false, reduced = false, scale = 1}: FxFrame): void {
    if (this.disposed || !state || !camera) return;
    const {river, heightAt, random, foam, splash, pools, rates} = this;
    const config = HOVER_WATER_FX;
    const v = this.values;
    if (reduced || !v.Activo) {
      this.reset();
      return;
    }
    const elapsed = phase === 'flying' ? Math.max(0, Math.min(dt, 0.1)) : 0;
    const distance = this.lastX === null || this.lastZ === null ? 0 : Math.hypot(state.x - this.lastX, state.z - this.lastZ);
    if (distance > 30) this.reset();
    const previousX = this.lastX ?? state.x;
    const previousZ = this.lastZ ?? state.z;
    this.lastX = state.x;
    this.lastZ = state.z;
    const wet = river.isWet(state.x, state.z);
    const altitude = state.y - heightAt(state.x, state.z);
    const cutoff = Math.max(v['Cerca del agua'] + 0.1, v['Altura de corte']);
    const proximity = wet ? 1 - MathUtils.smoothstep(altitude, v['Cerca del agua'], cutoff) : 0;
    const speed = Math.max(0, state.speed);
    const minSpeed = v['Velocidad mínima'];
    const speedStrength =
      MathUtils.clamp((speed - minSpeed) / Math.max(1, v['Velocidad plena'] - minSpeed), 0, 1) ** v['Respuesta velocidad'];
    // Dimensions follow actual m/s up to the physics turbo ceiling (72 m/s),
    // independently of the emission response and without a boost-toggle jump.
    const splashProgress = MathUtils.smoothstep(speed, minSpeed, CIRCUIT_BOOST);
    const sizeHigh = MathUtils.clamp(v['Tamaño rápido'], 0.05, 0.6);
    const sizeLow = MathUtils.clamp(v['Tamaño lento'], 0.05, sizeHigh);
    const heightHigh = MathUtils.clamp(v['Altura máxima'], 0.2, 2.6);
    const heightLow = MathUtils.clamp(v['Altura salpicón'], 0.2, heightHigh);
    const splashSize = MathUtils.lerp(sizeLow, sizeHigh, splashProgress);
    const splashHeight = MathUtils.lerp(heightLow, heightHigh, splashProgress);
    this.strength += (proximity - this.strength) * (1 - Math.exp(-elapsed * 15));
    const power = Math.min(proximity, this.strength) * v.Intensidad;
    const fx = Math.sin(state.yaw);
    const fz = Math.cos(state.yaw);
    const rx = fz;
    const rz = -fx;
    const span = Math.max(0.5, scale);
    const half = state.hull?.halfWidth ?? 1.52 * span;
    const rear = (state.hull?.halfLength ?? 2.4 * span) * 0.7;
    const moving = elapsed > 0 && wet && power > 0.01 && v.Densidad > 0;
    rates[0] = v.Espuma ? (7 + Math.min(speed, 90) * 1.6) * (0.15 + 0.85 * speedStrength) : 0;
    rates[1] = v.Salpicones ? 100 * speedStrength : 0;
    rates[2] = v.Salpicones ? 15 * speedStrength : 0;
    for (let j = 0; j < pools.length; j++) {
      const p = pools[j];
      p.shader.configure(night, v.Trama);
      const enabled = p === foam ? v.Espuma : v.Salpicones;
      if (!enabled) {
        p.emission = 0;
        for (const item of p.items) item.life = 0;
      }
      if (!moving || !enabled) {
        p.emission = 0;
        continue;
      }
      p.emission += elapsed * rates[j] * v.Densidad * Math.min(1, power) * this.emissionQuality;
      const count = Math.min(config.maxBirthsPerFrame, Math.floor(p.emission));
      p.emission -= Math.floor(p.emission);
      for (let i = 0; i < count; i++) {
        // Interpolate births along this frame's travel, as skid marks do.
        const t = (i + 0.5) / count;
        const cx = MathUtils.lerp(previousX, state.x, t);
        const cz = MathUtils.lerp(previousZ, state.z, t);
        const side = random() < 0.5 ? -1 : 1;
        const lateral = side * half * (0.75 + random() * 0.25);
        const x = cx - fx * rear + rx * lateral;
        const z = cz - fz * rear + rz * lateral;
        if (!river.isWet(cx, cz)) continue;
        if (p === foam) {
          const item = this.acquire(p, x, z, v['Persistencia espuma'] * (0.7 + random() * 0.6), 0.65 * power);
          if (!item) continue;
          item.angle = state.yaw + (random() - 0.5) * 1.4;
          item.width = v['Ancho espuma'] * span * (0.7 + random() * 0.65);
          item.length = (1.2 + random() * 1.7) * span;
          item.vx = rx * side * (0.3 + speedStrength * 0.65);
          item.vz = rz * side * (0.3 + speedStrength * 0.65);
        } else {
          const height = splashHeight * (0.45 + random() * 0.55);
          const vy = Math.sqrt(2 * config.gravity * height);
          const life = Math.min((vy * 2) / config.gravity, p === splash ? 0.4 : 1.35);
          const item = this.acquire(p, x, z, life, (p === splash ? 0.5 : 0.85) * power);
          if (!item) continue;
          const outward = side * (2 + random() * 3) * v['Alcance lateral'] * (0.4 + 0.6 * speedStrength);
          const size = splashSize * span * (0.55 + random() * 0.45);
          item.width = p === splash ? size * 4 : size;
          item.length = p === splash ? size * 5 : size * (1.8 + random() * 1.4);
          item.vx = (state.vx ?? fx * speed) * 0.72 + rx * outward - fx;
          item.vy = vy;
          item.vz = (state.vz ?? fz * speed) * 0.72 + rz * outward - fz;
        }
      }
    }

    const {dummy, right, up} = this;
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    let visible = false;
    for (const p of pools) {
      let alive = 0;
      for (const item of p.items) {
        item.life = Math.max(0, item.life - elapsed);
        if (item.life > 0) {
          item.x += item.vx * elapsed;
          item.z += item.vz * elapsed;
          if (p !== foam) {
            item.vy -= config.gravity * elapsed;
            item.y += item.vy * elapsed;
          }
          if (!river.isWet(item.x, item.z) || (p !== foam && item.y < heightAt(item.x, item.z))) item.life = 0;
        }
        if (item.life <= 0) continue;
        const age = 1 - item.life / item.total;
        const fade = Math.min(1, age / 0.07 + 0.2) * (1 - age) ** 1.35;
        if (p === foam) {
          dummy.position.set(item.x, heightAt(item.x, item.z) + 0.07, item.z);
          dummy.rotation.set(0, item.angle, 0);
          dummy.scale.set(item.width * (1 + age * 0.7), 1, item.length * (1 + age * 0.35));
        } else {
          dummy.position.set(item.x, item.y, item.z);
          dummy.quaternion.copy(camera.quaternion);
          // The droplet's long axis follows its projected velocity.
          const dx = item.vx * right.x + item.vy * right.y + item.vz * right.z;
          const dy = item.vx * up.x + item.vy * up.y + item.vz * up.z;
          dummy.rotateZ(-Math.atan2(dx, dy));
          dummy.scale.set(item.width * (1 - age * 0.35), item.length * (1 - age * 0.2), 1);
        }
        p.data.setXYZ(alive, Math.min(1, item.opacity * fade), item.seed, age);
        dummy.updateMatrix();
        p.mesh.setMatrixAt(alive, dummy.matrix);
        alive++;
      }
      p.commit(alive);
      visible ||= alive > 0;
    }
    this.group.visible = visible;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.kit.destroy();
    this.group.removeFromParent();
    for (const p of this.pools) p.dispose();
  }

  private acquire(p: WaterPool, x: number, z: number, life: number, opacity: number): WaterParticle | null {
    if (!this.river.isWet(x, z)) return null;
    const item = p.items[p.cursor];
    p.cursor = (p.cursor + 1) % p.items.length;
    item.x = x;
    item.z = z;
    item.y = this.heightAt(x, z) + 0.08;
    item.life = life;
    item.total = life;
    item.opacity = opacity;
    item.seed = this.random() * 100;
    item.vx = 0;
    item.vy = 0;
    item.vz = 0;
    item.angle = 0;
    item.width = 1;
    item.length = 1;
    return item;
  }
}
