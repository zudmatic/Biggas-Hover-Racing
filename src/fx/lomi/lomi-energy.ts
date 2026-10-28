import {MathUtils, NoColorSpace, RepeatWrapping, TextureLoader, Vector3, type Object3D, type Texture} from 'three';
import type {Node, TextureNode} from 'three/webgpu';
import {dFdx, dFdy, float, floor, vec2} from 'three/tsl';
import {CIRCUIT_SPEED, type HoverState} from '@/sim/hover-physics';
import {ENERGY, THRUST} from './lomi-constants';

/** Tiling noise and flow maps shared by the plasma and the singularity lens. */
export interface EnergyTextures {
  noise: Texture;
  flow: Texture;
}

/** Vehicle state the thrust signals follow. */
export type ThrustState = Pick<HoverState, 'throttle' | 'speed' | 'boosting' | 'yaw' | 'vx' | 'vz' | 'yawRate'>;

/** What the plasma animates from: idle viewers pass a still set, engines pass live EnergySignals. */
export interface PlasmaSignals {
  time: number;
  /** Thrust level, 0 idle … 1 cruise. */
  level: number;
  surge: number;
  /** Forward speed over circuit speed. */
  speed: number;
  /** Held turbo, eased. */
  boost: number;
  /** Tail drag in world space. */
  readonly bend: Vector3;
}

let pending: Promise<EnergyTextures> | null = null;

export function loadEnergyTextures(base: string = import.meta.env.BASE_URL): Promise<EnergyTextures> {
  pending ??= Promise.all(
    ['noise', 'flow'].map((name) => new TextureLoader().loadAsync(`${base}models/spaceship/lomi-040-${name}.webp`)),
  ).then(([noise, flow]) => {
    for (const map of [noise, flow]) {
      map.wrapS = map.wrapT = RepeatWrapping;
      map.colorSpace = NoColorSpace;
      map.needsUpdate = true;
    }
    return {noise, flow};
  });
  return pending;
}

/** `TextureNode.sample()` returns a TextureNode at runtime; the typings widen it to Node. */
export function sampleTexture(map: TextureNode, uv: Node): TextureNode {
  return map.sample(uv) as TextureNode;
}

// textureGrad with the x derivative wrapped to the tile period, so the seam
// where an angle wraps from 1 to 0 picks the same mip as its neighbours.
export const tiled = (map: TextureNode, uv: Node, period: Node | number): Node => {
  // Each branch resolves its own float() overload.
  const p = typeof period === 'number' ? float(period) : float(period);
  const dx = dFdx(uv).toVar();
  const dy = dFdy(uv).toVar();
  const wrap = (d: Node): Node => vec2(d.x.sub(p.mul(floor(d.x.div(p).add(0.5)))), d.y);
  return sampleTexture(map, uv).grad(wrap(dx), wrap(dy));
};

export const IDLE_STATE: ThrustState = {throttle: 0, speed: 0, boosting: false, yaw: 0, vx: 0, vz: 0, yawRate: 0};

const forward = new Vector3();
const left = new Vector3();
const velocity = new Vector3();
const lateral = new Vector3();
const drag = new Vector3();

/** Thrust, surge and tail drag of a singularity ship, eased from the vehicle state. */
export class EnergySignals implements PlasmaSignals {
  time = 0;
  thrust = THRUST.idle;
  level = 0;
  surge = 0;
  speed = 0;
  boost = 0;
  readonly aft = new Vector3(0, 0, -1);
  readonly bend = new Vector3();

  /** Back to rest, keeping the clock so the animation never jumps. */
  reset(): void {
    this.thrust = THRUST.idle;
    this.level = 0;
    this.surge = 0;
    this.speed = 0;
    this.boost = 0;
    this.aft.set(0, 0, -1);
    this.bend.set(0, 0, 0);
  }

  step(root: Object3D, state: ThrustState, dt: number): void {
    const {surge, drag: dragging} = ENERGY;
    const {damp} = MathUtils;
    const demand = Math.min(1, Math.max(state.throttle / CIRCUIT_SPEED, state.speed / CIRCUIT_SPEED, state.boosting ? 1 : 0));
    this.thrust = damp(this.thrust, THRUST.idle + (THRUST.cruise - THRUST.idle) * demand, THRUST.rate, dt);
    const level = MathUtils.inverseLerp(THRUST.idle, THRUST.cruise, this.thrust);
    const rise = Math.max(0, level - this.level) / Math.max(dt, 1e-3);
    const kick = Math.min(1, rise * surge.gain);
    this.surge = kick > this.surge ? damp(this.surge, kick, surge.attack, dt) : this.surge * Math.exp(-surge.decay * dt);
    this.level = level;
    this.time += dt;
    this.boost = damp(this.boost, state.boosting ? 1 : 0, THRUST.rate, dt);
    this.aft.set(0, 0, -1).transformDirection(root.matrixWorld);
    forward.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    left.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    velocity.set(state.vx, 0, state.vz);
    this.speed = Math.max(0, velocity.dot(forward)) / CIRCUIT_SPEED;
    lateral.copy(velocity).addScaledVector(forward, -velocity.dot(forward));
    drag
      .copy(left)
      .multiplyScalar(state.yawRate * dragging.turn)
      .addScaledVector(lateral, -dragging.slip);
    drag.addScaledVector(this.aft, -drag.dot(this.aft)).clampLength(0, dragging.max);
    this.bend.lerp(drag, 1 - Math.exp(-dragging.rate * dt));
  }
}
