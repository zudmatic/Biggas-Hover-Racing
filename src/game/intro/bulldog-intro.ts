import {MathUtils, Vector3, type PerspectiveCamera} from 'three';
import type {SurfaceHeight} from '@/sim/hover-physics';
import type {HoverInput, HoverState} from '@/sim/hover-state';
import type {Landscape} from '@/sim/landscape';
import {AutopilotController} from '@/game/controllers/autopilot-controller';
import {IDLE_INPUT, type RacerController} from '@/game/controllers/controller';

export type IntroShotId = 'ignition' | 'launch' | 'turbine' | 'flyby';

export interface IntroShot {
  readonly id: IntroShotId;
  /** Overlay caption (Spanish). */
  readonly caption: string;
  readonly start: number;
  readonly end: number;
}

// Bulldog 039's cameo before free driving: ignition on the grid, then the real
// hover physics under an autopilot while four shots cut around the ship.
// Times are seconds; offsets are model units, multiplied by the ship scale.
export const BULLDOG_INTRO: readonly IntroShot[] = [
  {id: 'ignition', caption: 'Encendido', start: 0, end: 2.6},
  {id: 'launch', caption: 'Salida', start: 2.6, end: 5},
  {id: 'turbine', caption: 'Turbina', start: 5, end: 7.4},
  {id: 'flyby', caption: 'Pasada', start: 7.4, end: 10},
];
const LAST_SHOT = BULLDOG_INTRO[BULLDOG_INTRO.length - 1];
export const BULLDOG_INTRO_DURATION = LAST_SHOT.end;
// The eyes blink on, then the engine catches and the ship lifts.
export const INTRO_BLINKS: readonly (readonly [from: number, to: number])[] = [
  [0.35, 0.5],
  [0.62, 0.75],
];
export const INTRO_EYES_ON = 0.9;
export const INTRO_IGNITION = 1;

export const introShot = (time: number): IntroShot => BULLDOG_INTRO.find((shot) => time < shot.end) ?? LAST_SHOT;
export const introEyes = (time: number): boolean => time >= INTRO_EYES_ON || INTRO_BLINKS.some(([from, to]) => time >= from && time < to);

const ease = (x: number) => {
  const u = MathUtils.clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

// Visual only: the parked ship rises onto its hover cushion with a small overshoot.
export function introLift(time: number): number {
  const u = MathUtils.clamp((time - INTRO_IGNITION - 0.1) / 0.9, 0, 1);
  const c = 1.70158;
  return -0.45 * (1 - (1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2));
}

/**
 * Drives the Bulldog during its intro: idle through the ignition shot, then
 * the autopilot follows the road centreline (speed capped by the bend ahead,
 * braking before tight corners); the turbo fires for the turbine shot
 * whenever the cap leaves room. The session advances `time`.
 */
export class BulldogIntroDriver implements RacerController {
  /** Seconds since the intro started. */
  time = 0;
  private readonly autopilot: AutopilotController;

  constructor(landscape: Landscape) {
    this.autopilot = new AutopilotController(landscape, {
      boost: () => this.time >= BULLDOG_INTRO[2].start && this.time < BULLDOG_INTRO[3].start + 0.6,
    });
  }

  sample(state: HoverState): HoverInput {
    if (this.time < BULLDOG_INTRO[1].start - 0.3) return {...IDLE_INPUT};
    return this.autopilot.sample(state);
  }

  reset(): void {
    this.time = 0;
  }
}

export interface IntroCameraOptions {
  landscape: Landscape;
  surfaceHeight: SurfaceHeight;
  /** Pulls a camera point in front of the first wall between `from` and `to`. */
  clipCamera?: ((from: Vector3, to: Vector3) => void) | null;
}

/** The pose the intro camera frames. */
export type IntroCameraTarget = Pick<HoverState, 'x' | 'y' | 'z' | 'yaw' | 'speed'>;

/** Scripted camera for the four intro shots. */
export class IntroCamera {
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly ship = new Vector3();
  private readonly position = new Vector3();
  private readonly look = new Vector3();
  private readonly anchor = new Vector3();
  private readonly flyby = new Vector3();
  private flybyPlaced = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly options: IntroCameraOptions,
  ) {}

  reset(): void {
    this.flybyPlaced = false;
  }

  /** Frames `state` for intro `time` (seconds) and returns the active shot. */
  update(time: number, state: IntroCameraTarget, scale: number): IntroShot {
    const {camera, forward, right, ship, position, look, anchor} = this;
    const {surfaceHeight, clipCamera} = this.options;
    const shot = introShot(time);
    const u = ease((time - shot.start) / (shot.end - shot.start));
    const s = scale;
    let fov: number;
    forward.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    ship.set(state.x, state.y, state.z);
    if (shot.id === 'ignition') {
      // Low push-in on the face while the eyes wake up.
      position
        .copy(ship)
        .addScaledVector(forward, (7.8 - 2.2 * u) * s)
        .addScaledVector(right, (1.2 - 0.9 * u) * s)
        .setY(state.y + (1.1 + 0.2 * u) * s);
      look
        .copy(ship)
        .addScaledVector(forward, 1.6 * s)
        .setY(state.y + 1.6 * s);
      fov = 38;
    } else if (shot.id === 'launch') {
      // Low tracking shot: the ship pulls ahead of the camera.
      position
        .copy(ship)
        .addScaledVector(right, 7.5 * s)
        .addScaledVector(forward, (5 - 9 * u) * s)
        .setY(state.y + 1.3 * s);
      look.copy(ship).setY(state.y + 1.4 * s);
      fov = 46;
    } else if (shot.id === 'turbine') {
      // Tight on the turbine while the turbo lights; the lens opens with speed.
      position
        .copy(ship)
        .addScaledVector(forward, -(7.5 + 2 * u) * s)
        .addScaledVector(right, -2.4 * s)
        .setY(state.y + 2.4 * s);
      look
        .copy(ship)
        .addScaledVector(forward, 5 * s)
        .setY(state.y + 1.3 * s);
      fov = 56 + 16 * u;
    } else {
      // Locked-off roadside camera, inside the walls, that pans as the ship passes.
      if (!this.flybyPlaced) this.placeFlyby(state);
      position.copy(this.flyby);
      look.copy(ship).setY(state.y + 1.3 * s);
      fov = 44 - 6 * u;
    }
    if (shot.id !== 'flyby') {
      // Keep moving shots out of walls and terrain, as the chase camera does.
      anchor.copy(ship).setY(state.y + 1.6 * s);
      clipCamera?.(anchor, position);
      const floor = surfaceHeight(position.x, position.z);
      if (floor !== null && floor !== undefined) position.y = Math.max(position.y, floor + 0.35);
    }
    camera.position.copy(position);
    camera.lookAt(look);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    return shot;
  }

  /** The ship reaches the camera about halfway through the shot. */
  private placeFlyby(state: IntroCameraTarget): void {
    const {landscape, surfaceHeight, clipCamera} = this.options;
    const {flyby, anchor} = this;
    const road = landscape.roadAt(state.x, state.z);
    const ahead = landscape.atDistance(road.distance + Math.max(14, state.speed * 1.3));
    const side = Math.max(2, (road.width ?? 12) / 2 - 2.5);
    flyby.set(ahead.x - ahead.nz * side, 0, ahead.z + ahead.nx * side);
    flyby.y = (surfaceHeight(flyby.x, flyby.z) ?? ahead.y) + 1.1;
    anchor.set(ahead.x, (surfaceHeight(ahead.x, ahead.z) ?? ahead.y) + 1.1, ahead.z);
    clipCamera?.(anchor, flyby);
    this.flybyPlaced = true;
  }
}
