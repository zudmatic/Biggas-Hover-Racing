import {MathUtils, Mesh, type AnimationClip, type KeyframeTrack, type Object3D} from 'three';
import type {VehicleAssembly, VehicleComponent, VehicleFrame, VehicleMotion} from './vehicle-component';
import type {EyesDefinition} from './vehicle-definition';

// Bulldog 039's face rig (Bulldog_Racer_Animated_Prototype, README_controles):
// - CTRL_Eye_L/R pivots yaw the lenses, limited to ±3°; rose and highlight move with them.
// - Lid_L/R morph along four trajectory targets (25/50/75/100 %). Never drive
//   only the 100 % target: the straight path would cut through the lens.
// - Tongue_Recoil, on both tongue meshes, pulls the free tip back.
// Steering drives the gaze; the authored Blink clip plays at idle and the
// Collision clip (lids shut, tongue recoils, recovery) after a hard impact.
export const EYE_CLOSED = 0;
export const GAZE_LIMIT = 0.0523599;
const LOOK_RESPONSE = 9;
const BLINK_GAP = [3.2, 6.4] as const;
const REARM = 0.8;
const LID_TARGETS = 4;
const EYE_PIVOTS = ['CTRL_Eye_L', 'CTRL_Eye_R'];
const LIDS = ['Lid_L', 'Lid_R'];
const TONGUE_RECOIL = 'Tongue_Recoil';

const closureOf = (lidWeights: ArrayLike<number>): number => {
  let sum = 0;
  for (let i = 0; i < lidWeights.length; i++) sum += (lidWeights[i] * (i + 1)) / 4;
  return sum;
};

// Contract: q=4t, weights shared between the two poses around q (pose 0 is Basis).
export function blinkWeights(t: number, out: number[] = [0, 0, 0, 0]): number[] {
  const q = MathUtils.clamp(t, 0, 1) * LID_TARGETS;
  const lower = Math.floor(q);
  const frac = q - lower;
  out.fill(0);
  if (lower > 0) out[lower - 1] = 1 - frac;
  if (lower < LID_TARGETS) out[lower] += frac;
  return out;
}

// Positive turn input lowers yaw, so a right turn has a negative yaw rate.
export const gazeTarget = (state?: VehicleMotion): number => MathUtils.clamp(-(state?.yawRate ?? 0) / 1.4, -1, 1);

type Curve = Array<[time: number, value: number]>;

/** A reaction sampled by time since it started. */
interface ReactionCurves {
  /** Seconds, trimmed to the keys that move. */
  duration: number;
  closure(time: number): number;
  recoil(time: number): number;
}

// An authored clip as scalar curves: lid closure t and tongue recoil. Lids
// are re-posed through blinkWeights, so blending between keys follows the
// trajectory instead of fading straight across the lens. The demo's still
// lead-in is trimmed so the reaction starts on the triggering frame.
function clipCurves(clip: AnimationClip | undefined): ReactionCurves | null {
  const track = (name: string): KeyframeTrack | undefined => clip?.tracks.find((candidate) => candidate.name === name);
  const lid = track('LidCaps_L.morphTargetInfluences');
  const tongue = track('Candidate_thin_curved_tongue_editable_surface.morphTargetInfluences');
  if (!lid) return null;
  const keys = (source: KeyframeTrack | undefined, scalar: (values: Float32Array) => number): Curve => {
    if (!source) return [[0, 0]];
    const size = source.getValueSize();
    return Array.from(source.times, (time, i): [number, number] => [time, scalar(source.values.subarray(i * size, (i + 1) * size))]);
  };
  const lids = keys(lid, closureOf);
  const recoil = keys(tongue, (values) => values[0]);
  const moving = [...lids, ...recoil].filter(([, value]) => value > 1e-4).map(([time]) => time);
  const step = lids.length > 1 ? lids[1][0] - lids[0][0] : 0;
  const start = Math.max(0, Math.min(...moving) - step);
  const end = Math.max(...moving) + step;
  const sample = (curve: Curve, time: number): number => {
    time += start;
    if (time <= curve[0][0]) return curve[0][1];
    for (let i = 1; i < curve.length; i++) {
      if (time <= curve[i][0]) {
        const [t0, v0] = curve[i - 1];
        const [t1, v1] = curve[i];
        return v0 + ((v1 - v0) * (time - t0)) / (t1 - t0);
      }
    }
    return curve[curve.length - 1][1];
  };
  return {duration: end - start, closure: (time) => sample(lids, time), recoil: (time) => sample(recoil, time)};
}

/** First node called `name` in the subtrees, in order (like `getObjectByName` on their parent). */
function findNode(nodes: readonly Object3D[], name: string): Object3D | undefined {
  for (const node of nodes) {
    const found = node.getObjectByName(name);
    if (found) return found;
  }
  return undefined;
}

function sameWeights(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < LID_TARGETS; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface TongueMorph {
  influences: number[];
  index: number;
}

/** The face rig, posed every frame from steering, idle blinks and impacts. */
export class ShipEyes implements VehicleComponent {
  static attach({definition, liveNodes, clips}: VehicleAssembly): ShipEyes | null {
    return definition.eyes ? ShipEyes.find(liveNodes, definition.eyes, clips) : null;
  }

  /** Finds the rig among the live nodes; null when the model doesn't have one. */
  static find(nodes: readonly Object3D[], options: EyesDefinition, clips: readonly AnimationClip[] = []): ShipEyes | null {
    const pivots = EYE_PIVOTS.map((name) => findNode(nodes, name)).filter((node): node is Object3D => node !== undefined);
    const lids: number[][] = [];
    for (const name of LIDS) {
      findNode(nodes, name)?.traverse((object) => {
        if (object instanceof Mesh && object.morphTargetInfluences) lids.push(object.morphTargetInfluences);
      });
    }
    const tongue: TongueMorph[] = [];
    for (const node of nodes) {
      node.traverse((object) => {
        const index = object instanceof Mesh ? object.morphTargetDictionary?.[TONGUE_RECOIL] : undefined;
        if (object instanceof Mesh && object.morphTargetInfluences && index !== undefined) {
          tongue.push({influences: object.morphTargetInfluences, index});
        }
      });
    }
    if (pivots.length !== 2 || lids.length === 0) return null;
    const clip = (name: string): AnimationClip | undefined => clips.find((candidate) => candidate.name === name);
    return new ShipEyes(pivots, lids, tongue, options.impactThreshold, clipCurves(clip('Collision')), clipCurves(clip('Blink')));
  }

  private readonly weights = [0, 0, 0, 0];
  private gaze = 0;
  private lidClosure = 0;
  private lastTime: number | null = null;
  private serial: number | null = null;
  private hitAt = -Infinity;
  private blinkAt: number = BLINK_GAP[0];
  private blinks = 0;
  private held: number | null = null;
  /** Last pose written to the rig, so unchanged frames skip the writes. */
  private readonly posed = {lids: [Number.NaN, Number.NaN, Number.NaN, Number.NaN], recoil: Number.NaN, gaze: Number.NaN};

  constructor(
    private readonly pivots: readonly Object3D[],
    private readonly lids: readonly number[][],
    private readonly tongueMorphs: readonly TongueMorph[],
    private readonly impactThreshold: number,
    private readonly reaction: ReactionCurves | null,
    private readonly blink: ReactionCurves | null,
  ) {}

  get look(): number {
    return this.gaze;
  }

  /** 0 open, 1 shut: the lid trajectory position. */
  get closure(): number {
    return this.lidClosure;
  }

  get tongue(): number {
    const first = this.tongueMorphs[0];
    return first ? first.influences[first.index] : 0;
  }

  /** Applied lid target weights, per lid mesh, for inspection. */
  get lidWeights(): number[][] {
    return this.lids.map((lid) => Array.from(lid));
  }

  /** A cinematic can keep the eyes shut (EYE_CLOSED) or open (1); null returns control. */
  hold(openness: number | null): void {
    this.held = openness;
    if (openness !== null) this.pose(blinkWeights(1 - openness, this.weights), 0, this.gaze);
  }

  update({time, state, reducedMotion}: Readonly<VehicleFrame>): void {
    const dt = this.lastTime === null ? 0 : MathUtils.clamp(time - this.lastTime, 0, 0.1);
    this.lastTime = time;
    const hit = state?.impactSerial;
    // Grinding along a wall reports many impacts; restart only once the lids reopen.
    if (
      this.serial !== null &&
      hit !== undefined &&
      hit !== this.serial &&
      (state?.impact ?? 0) >= this.impactThreshold &&
      !reducedMotion &&
      !(time - this.hitAt < REARM)
    ) {
      this.hitAt = time;
    }
    if (hit !== undefined) this.serial = hit;
    // A restarted race rewinds the clock; forget the old run's reaction and blink.
    if (this.hitAt > time) this.hitAt = -Infinity;
    if (this.blinkAt > time + BLINK_GAP[1]) this.blinkAt = time + BLINK_GAP[0];

    const {reaction, blink, weights} = this;
    let lidWeights = blinkWeights(0, weights);
    let recoil = 0;
    const reacting = reaction !== null && time - this.hitAt < reaction.duration;
    if (this.held !== null) {
      lidWeights = blinkWeights(1 - this.held, weights);
    } else if (reducedMotion) {
      // Still and open.
    } else if (reacting) {
      lidWeights = blinkWeights(reaction.closure(time - this.hitAt), weights);
      recoil = reaction.recoil(time - this.hitAt);
    } else if (blink && time >= this.blinkAt) {
      if (time - this.blinkAt < blink.duration) {
        lidWeights = blinkWeights(blink.closure(time - this.blinkAt), weights);
      } else {
        // Irregular idle rhythm, deterministic per ship.
        this.blinks++;
        this.blinkAt = time + MathUtils.lerp(BLINK_GAP[0], BLINK_GAP[1], (this.blinks * 0.618034) % 1);
      }
    }
    const target = reducedMotion || closureOf(lidWeights) > 0.5 ? 0 : gazeTarget(state);
    this.gaze += (target - this.gaze) * (dt ? 1 - Math.exp(-dt * LOOK_RESPONSE) : 1);
    this.pose(lidWeights, recoil, this.gaze);
  }

  /** Leaves the face open, centred and relaxed. */
  dispose(): void {
    this.pose(blinkWeights(0, this.weights), 0, 0);
  }

  private pose(lidWeights: readonly number[], recoil: number, gaze: number): void {
    const posed = this.posed;
    if (gaze === posed.gaze && recoil === posed.recoil && sameWeights(lidWeights, posed.lids)) return;
    posed.gaze = gaze;
    posed.recoil = recoil;
    for (let i = 0; i < LID_TARGETS; i++) posed.lids[i] = lidWeights[i];
    // Looking right (the ship's -X) yaws the lenses negatively about +Y.
    for (const pivot of this.pivots) pivot.rotation.set(0, -gaze * GAZE_LIMIT, 0);
    for (const lid of this.lids) for (let i = 0; i < LID_TARGETS; i++) lid[i] = lidWeights[i];
    for (const {influences, index} of this.tongueMorphs) influences[index] = recoil;
    this.lidClosure = closureOf(lidWeights);
  }
}
