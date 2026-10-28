import {createHoverState, type HoverInput, type HoverState, type Position3} from './hover-state';
import {HOVER_HEIGHT, Landscape, type Gate} from './landscape';

export {HOVER_HEIGHT, Landscape} from './landscape';
export {createHoverState, type HoverInput, type HoverState, type Position3} from './hover-state';

// Hover racing uses the supplied closed route in metres (+Y up, +Z forward).
export const CIRCUIT_SPEED = 52;
export const CIRCUIT_BOOST = 72;
export const MIN_HOVER_HEIGHT = 0.43;
export const MAX_HOVER_HEIGHT = 1.25;
// Rates are per second, spring stiffness per second squared. Keep the handling
// together so playtesting can tune the air cushion independently of propulsion.
export const HOVER_HANDLING = Object.freeze({
  grip: 4.8,
  driftGrip: 1.6,
  brakeGrip: 9,
  steeringResponse: 8.5,
  steeringRelease: 5.8,
  countersteerResponse: 14,
  liftStiffness: 64,
  liftDamping: 9,
  pitchStiffness: 65,
  pitchDamping: 12,
  rollStiffness: 55,
  rollDamping: 10,
});

/** Height of the drivable surface at (x, z), or null where there is none. */
export type SurfaceHeight = (x: number, z: number) => number | null | undefined;

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const angle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));

/**
 * Deterministic hover-vehicle integrator for one track. Holds no per-vehicle
 * state: the same instance steps the player, AI rivals and remote racers.
 */
export class HoverPhysics {
  constructor(
    readonly landscape: Landscape,
    readonly surfaceHeight: SurfaceHeight = landscape.height,
  ) {}

  /** Advances `state` by `dt` seconds. Returns the position before the step. */
  step(state: HoverState, input: HoverInput, dt: number): Position3 {
    const {landscape, surfaceHeight} = this;
    const previous = {x: state.x, y: state.y, z: state.z};
    const turn = clamp(input.turn ?? 0, -1, 1);
    const oldSpeed = state.speed;
    state.throttle = clamp(state.throttle + (input.throttle ?? 0) * 24 * dt, 0, CIRCUIT_SPEED);
    state.braking = !!input.brake;
    // Hold E to loosen lateral grip. Braking takes priority; grip returns smoothly
    // on release, so countersteering can catch the slide without a velocity snap.
    state.drifting = !!input.drift && !state.braking && state.speed > 8;
    state.driftBlend += (Number(state.drifting) - state.driftBlend) * (1 - Math.exp(-dt * (state.drifting ? 10 : 5)));
    if (!input.boost) state.boostLocked = false;
    const padBoost = (state.padBoostRemaining ?? 0) > 0 && !input.brake;
    state.padBoostRemaining = Math.max(0, (state.padBoostRemaining ?? 0) - dt);
    const manualBoost = !!input.boost && !input.brake && !state.boostLocked && state.energy > 0;
    state.boosting = padBoost || manualBoost;
    state.energy = clamp(state.energy + (manualBoost && !padBoost ? -0.23 : 0.13) * dt, 0, 1);
    if (state.energy === 0) {
      state.boostLocked = true;
      state.boosting = padBoost;
    }
    const target = (input.brake ? 0 : state.boosting ? CIRCUIT_BOOST : state.throttle) * (state.oilFactor ?? 1);
    const acceleration = input.brake ? 65 : state.boosting ? 38 : 24;
    // A damped steering response and a separate velocity vector carry momentum into turns.
    const desiredYaw = -turn * (2.65 - (0.9 * state.speed) / CIRCUIT_BOOST) * (1 + state.driftBlend * 0.18);
    const steeringRate =
      desiredYaw * state.yawRate < 0
        ? HOVER_HANDLING.countersteerResponse
        : Math.abs(turn) < 0.001
          ? HOVER_HANDLING.steeringRelease
          : HOVER_HANDLING.steeringResponse;
    state.yawRate += (desiredYaw - state.yawRate) * (1 - Math.exp(-dt * steeringRate));
    state.yaw += state.yawRate * dt;
    const fx = Math.sin(state.yaw);
    const fz = Math.cos(state.yaw);
    const rx = -fz;
    const rz = fx;
    let longitudinal = Math.max(0, state.vx * fx + state.vz * fz);
    let lateral = state.vx * rx + state.vz * rz;
    // Limit the total propulsion energy while sideways: drift must not grant speed.
    const forwardTarget = Math.sqrt(Math.max(0, target * target - lateral * lateral));
    longitudinal += clamp(forwardTarget - longitudinal, -acceleration * dt, acceleration * dt);
    const grip = state.braking
      ? HOVER_HANDLING.brakeGrip
      : HOVER_HANDLING.grip + (HOVER_HANDLING.driftGrip - HOVER_HANDLING.grip) * state.driftBlend;
    lateral *= Math.exp(-grip * dt);
    state.vx = fx * longitudinal + rx * lateral;
    state.vz = fz * longitudinal + rz * lateral;
    state.x += state.vx * dt;
    state.z += state.vz * dt;
    const road = landscape.roadAt(state.x, state.z);
    const heading = angle(state.yaw - Math.atan2(road.nx, road.nz));
    const halfHull =
      (state.hull?.halfWidth ?? 1.52) * Math.abs(Math.cos(heading)) + (state.hull?.halfLength ?? 2.4) * Math.abs(Math.sin(heading));
    const limit = road.width / 2 - halfHull - 0.18;
    state.wallHit = !landscape.physicalBoundaries && Math.abs(road.offset) > limit;
    state.impact *= Math.exp(-dt * 7);
    if (state.wallHit) {
      const side = Math.sign(road.offset);
      const nx = -road.nz * side;
      const nz = road.nx * side;
      const offset = clamp(road.offset, -limit, limit);
      state.x = road.x - road.nz * offset;
      state.z = road.z + road.nx * offset;
      const normalSpeed = state.vx * nx + state.vz * nz;
      if (normalSpeed > 0) {
        // Inelastic normal impulse; tangent motion survives a glancing contact.
        state.vx -= normalSpeed * 1.22 * nx;
        state.vz -= normalSpeed * 1.22 * nz;
        state.vx *= 0.92;
        state.vz *= 0.92;
        state.throttle = Math.min(state.throttle, Math.hypot(state.vx, state.vz) + 4);
        if (normalSpeed > 1.5) {
          state.impact = Math.min(14, normalSpeed);
          state.impactSerial++;
          state.hoverVelocity += Math.min(0.5, normalSpeed * 0.035);
          state.impactX = state.x + nx * halfHull;
          state.impactZ = state.z + nz * halfHull;
        }
      }
    }
    state.speed = Math.hypot(state.vx, state.vz);
    state.acceleration = (state.speed - oldSpeed) / dt;
    state.slip = Math.atan2(state.vx * rx + state.vz * rz, Math.max(1, state.vx * fx + state.vz * fz));
    state.hoverTime += dt;
    // Integrate height in world space: the hull carries vertical momentum over
    // crests instead of snapping to road + hover every tick. Damping relative to
    // the moving surface supports sustained climbs without sinking into ramps.
    const surface = surfaceHeight(state.x, state.z) ?? road.y;
    const surfaceVelocity = (surface - (previous.y - state.hover)) / dt;
    const hoverTarget = HOVER_HEIGHT + (input.reducedMotion ? 0 : Math.sin(state.hoverTime * 2.4) * 0.035) + (state.boosting ? 0.08 : 0);
    const jump = landscape.jumpSettings;
    state.landingTime = Math.max(0, (state.landingTime ?? 0) - dt);
    if (
      landscape.allowJumps &&
      (state.airborne || (previous.y - state.hover - surface > (jump?.takeoffDropM ?? 0.8) && state.speed > (jump?.minimumSpeedMps ?? 3)))
    ) {
      // Preserve takeoff momentum at the broken bridge instead of snapping to
      // the river ten metres below. Only the desert enables airborne traversal.
      if (!state.airborne) state.hoverVelocity = clamp(state.hoverVelocity, 0, jump?.maxRiseSpeedMps ?? Infinity);
      const gravity = jump ? (state.hoverVelocity > 0 ? jump.gravityUp : jump.gravityDown) : 9.81;
      state.airborne = true;
      state.hoverVelocity = Math.max(-(jump?.terminalFallMps ?? Infinity), state.hoverVelocity - gravity * dt);
      state.y += state.hoverVelocity * dt;
      if (state.y <= surface + hoverTarget) {
        const impactSpeed = Math.max(0, -state.hoverVelocity);
        state.airborne = false;
        state.landingTime = jump ? jump.bounceDuration : 0;
        state.y = surface + hoverTarget - (jump ? Math.min(jump.landingCompressionM, impactSpeed * 0.008) : 0);
        state.hoverVelocity =
          jump && impactSpeed > 2 ? clamp(impactSpeed * jump.landingRestitution, jump.minimumBounceMps, jump.maximumBounceMps) : 0;
      }
      state.hover = state.y - surface;
    } else {
      const predictedHover = state.y + state.hoverVelocity * dt - surface;
      const landing = jump && state.landingTime > 0 ? jump : null;
      state.hoverVelocity +=
        ((hoverTarget - predictedHover) * (landing ? landing.landingSpring : HOVER_HANDLING.liftStiffness) -
          (state.hoverVelocity - surfaceVelocity) * (landing ? landing.landingDamping : HOVER_HANDLING.liftDamping)) *
        dt;
      state.y += state.hoverVelocity * dt;
      state.hover = clamp(state.y - surface, MIN_HOVER_HEIGHT, MAX_HOVER_HEIGHT);
      // Do not accumulate an outward velocity at the safety limits.
      if (state.y < surface + MIN_HOVER_HEIGHT) state.hoverVelocity = Math.max(surfaceVelocity, state.hoverVelocity);
      if (state.y > surface + MAX_HOVER_HEIGHT) state.hoverVelocity = Math.min(surfaceVelocity, state.hoverVelocity);
      state.y = surface + state.hover;
    }
    let groundGrade = road.grade * Math.cos(heading);
    if (landscape.allowJumps && !state.airborne) {
      // Ramp pitch follows the actual driving surface, including ramps placed
      // beside the route guide. Ignore discontinuous cliffs at a takeoff lip.
      const front = surfaceHeight(state.x + fx * 1.2, state.z + fz * 1.2);
      const rear = surfaceHeight(state.x - fx * 1.2, state.z - fz * 1.2);
      if (front != null && rear != null && Number.isFinite(front) && Number.isFinite(rear) && Math.abs(front - rear) < 3)
        groundGrade = (front - rear) / 2.4;
    }
    const pitchTarget =
      (state.airborne ? Math.atan2(state.hoverVelocity, Math.max(5, state.speed)) : Math.atan(groundGrade)) +
      clamp(state.acceleration * 0.0016, -0.07, 0.055);
    state.pitchRate += ((pitchTarget - state.pitch) * HOVER_HANDLING.pitchStiffness - state.pitchRate * HOVER_HANDLING.pitchDamping) * dt;
    state.pitch += state.pitchRate * dt;
    const rollTarget = clamp((-state.yawRate * 0.11 - state.slip * 0.18) * Math.min(1, state.speed / 12), -0.34, 0.34);
    state.rollRate += ((rollTarget - state.roll) * HOVER_HANDLING.rollStiffness - state.rollRate * HOVER_HANDLING.rollDamping) * dt;
    state.roll += state.rollRate * dt;
    state.cooldown = Math.max(0, state.cooldown - dt);
    return previous;
  }

  /** A fresh state at the last passed checkpoint (or the grid). */
  recover(gateIndex: number): HoverState {
    const {landscape, surfaceHeight} = this;
    if (gateIndex === 0) {
      const state = createHoverState(landscape);
      state.y = (surfaceHeight(state.x, state.z) ?? state.y - HOVER_HEIGHT) + HOVER_HEIGHT;
      return {...state, cooldown: 1.2};
    }
    const road = landscape.atDistance(landscape.gates[gateIndex - 1].distance + 5);
    return {
      ...createHoverState(landscape),
      x: road.x,
      y: (surfaceHeight(road.x, road.z) ?? road.y) + HOVER_HEIGHT,
      z: road.z,
      yaw: Math.atan2(road.nx, road.nz),
      speed: 0,
      throttle: 0,
      pitch: Math.atan(road.grade),
      roll: 0,
      cooldown: 1.2,
    };
  }
}

/** True when the segment a→b crosses `gate` forwards, inside its radius. */
export function crossesCircuitGate(a: Position3, b: Position3, gate: Gate): boolean {
  const da = (a.x - gate.x) * gate.nx + (a.z - gate.z) * gate.nz;
  const db = (b.x - gate.x) * gate.nx + (b.z - gate.z) * gate.nz;
  if (da >= 0 || db < 0) return false;
  const t = -da / (db - da);
  const x = a.x + (b.x - a.x) * t - gate.x;
  const z = a.z + (b.z - a.z) * t - gate.z;
  const y = a.y + (b.y - a.y) * t - gate.y;
  return Math.abs(x * -gate.nz + z * gate.nx) < (gate.radius ?? 6) && Math.abs(y) < 3;
}

export function formatRaceTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 1) * 100);
  return `${String(minutes).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}
