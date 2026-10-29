import type {AnimationClip, Group, Mesh, Object3D} from 'three';
import type {Disposable} from '@/core/disposable';
import type {HoverState} from '@/sim/hover-state';
import type {VehicleDefinition} from './vehicle-definition';

/** The slice of the hover simulation that vehicle parts react to (gaze, impacts, brake flames). */
export type VehicleMotion = Partial<Pick<HoverState, 'yawRate' | 'impact' | 'impactSerial' | 'braking'>>;

/** Per-frame inputs shared by every part of a vehicle. The object is reused; don't keep it. */
export interface VehicleFrame {
  /** Seconds. */
  time: number;
  speed: number;
  boosting: boolean;
  reducedMotion: boolean;
  /** Absent in viewers that don't simulate. */
  state?: VehicleMotion;
}

/** Behaviour attached to a loaded vehicle: a flag, a face rig, an engine glow… */
export interface VehicleComponent extends Disposable {
  update(frame: Readonly<VehicleFrame>): void;
}

export interface VehicleLoadOptions {
  /** Character id; defaults to the vehicle's `seat.defaultPilot`, then the character fallback. */
  character?: string;
  palette?: string;
  hat?: string;
  livery?: string;
  /** Local flame jets for model viewers (racing draws exhaust in fx/exhaust). Default true. */
  exhaust?: boolean;
  /** TSL plasma; the WebGL thumbnail script opts out. Default true. */
  plasma?: boolean;
}

/** What components can use while a vehicle is assembled. */
export interface VehicleAssembly {
  readonly definition: VehicleDefinition;
  /** Vehicle root: static batches, live nodes, pilot and effects. */
  readonly root: Group;
  /** Animation clips exported with the model. */
  readonly clips: readonly AnimationClip[];
  /** Nodes matched by `definition.liveNodes`, already children of `root`. */
  readonly liveNodes: readonly Object3D[];
  /** Merged cloth meshes (`definition.cloth`), indexed and in vehicle space. */
  readonly clothMeshes: readonly Mesh[];
  readonly options: Readonly<VehicleLoadOptions>;
}

/** Builds the components one behaviour needs; null (or none) when the vehicle doesn't use it. */
export type VehicleComponentFactory = (
  assembly: VehicleAssembly,
) => VehicleComponent | readonly VehicleComponent[] | null | Promise<VehicleComponent | readonly VehicleComponent[] | null>;
