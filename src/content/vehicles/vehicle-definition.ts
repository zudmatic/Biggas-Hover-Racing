import type {VehiclePaint} from './vehicle-livery';
import type {SeatFit, Vec3Tuple} from '@/core/types';
import type {VehicleComponentFactory} from './vehicle-component';

/** Collision hull used by the hover physics, in metres at model scale 1. */
export interface HullShape {
  halfWidth: number;
  halfLength: number;
  capsuleRadius: number;
  capsuleSpacing: number;
  capsuleBottom: number;
  capsuleTop: number;
}

/** Nozzle position and radius in vehicle space: [x, y, z, radius]. */
export type ExhaustMount = [x: number, y: number, z: number, radius: number];

/** Exhaust/boost effect family. New families register in fx/. */
export type EngineKind = 'flame' | 'singularity';

/** Hangar inspection group. Coordinates are authoring units in vehicle space. */
export interface VehiclePart {
  id: string;
  name: string;
  /** Hotspot position. */
  anchor: Vec3Tuple;
  /** Two-digit label on the hotspot and in the parts list. */
  tag: string;
  /** Displacement in the exploded view. */
  offset: Vec3Tuple;
  /** Camera position when the part is focused. */
  view: Vec3Tuple;
  /** The exploded view pushes left and right meshes apart along X instead of moving the group. */
  split?: boolean;
}

/** Hangar inspection: part groups and which group each GLB mesh belongs to. */
export interface HangarLayout {
  parts: VehiclePart[];
  /** Part id for a GLB mesh name; `inCanopy` is true for meshes under the canopy. */
  classify: (meshName: string, inCanopy?: boolean) => string;
}

/** Places the GLB on the game's grid: +Z forward, +Y up, resting on y = 0. */
export interface VehicleTransform {
  /** Uniform scale. */
  scale?: number;
  /** Translation in model units, before scaling. */
  offset?: Vec3Tuple;
  /** Extra rotation about +Y, in radians. */
  yaw?: number;
}

/** A pilot exported already seated in the GLB, animated by its own clip. */
export interface BuiltInPilot {
  /** Character id the rig depicts; anyone else gets a selectable pilot and the rig is removed. */
  character: string;
  /** Root node of the rig. */
  node: string;
  /** Looping clip the rig plays. */
  clip: string;
}

export interface VehicleSeat {
  fit: SeatFit;
  offset: Vec3Tuple;
  /** Per-character seat corrections. */
  offsets?: Readonly<Record<string, Vec3Tuple>>;
  /** Character picked when the URL names only the vehicle. */
  defaultPilot?: string;
  builtInPilot?: BuiltInPilot;
}

export interface VehicleLights {
  /** Track-lighting spot mounts, in vehicle space. */
  headlights: Vec3Tuple[];
  /** Cyan hover light under the hull. */
  underglow: boolean;
  /** Lamp lens meshes; they get their own material so the headlight switch only dims them. */
  lampLens?: RegExp;
}

/** The part the hangar opens or hides to show the pilot. */
export type CanopyDefinition =
  /** A closed cockpit exported as one node. */
  | {
      kind: 'node';
      node: string;
      /** Left out of the flight model so the pilot stays visible. */
      removeInFlight: boolean;
    }
  /** An open cockpit: only the windshield moves, gathered from loose meshes into one group. */
  | {
      kind: 'windshield';
      meshes: RegExp;
      /** Name of the group created for the windshield meshes. */
      group: string;
    };

/** Meshes deformed as cloth in flight. */
export interface ClothDefinition {
  meshes: RegExp;
  /** Name of the merged cloth mesh. */
  name: string;
}

/** Face rig: steering moves the gaze, the lids blink at idle and shut on hard impacts. */
export interface EyesDefinition {
  /** Minimum hover-state `impact` that plays the collision reaction. */
  impactThreshold: number;
}

/**
 * Everything the game needs to know about a vehicle, as data. Add a vehicle by
 * creating `content/vehicles/<folder>/index.ts` with one of these and registering it.
 */
export interface VehicleDefinition {
  /** Stable id: it appears in URLs and saved choices. */
  readonly id: string;
  readonly name: string;
  readonly title: string;
  /** Lobby card: public/images/flight/<image>.png (+ -paper.png). */
  readonly image: string;
  /** GLB path relative to public/. */
  readonly model: string;
  /** Optional body paint variants; mechanical surfaces retain their authored PBR maps. */
  readonly paint?: VehiclePaint;
  readonly transform?: VehicleTransform;
  /** Omitted: the hover physics' default hull. */
  readonly hull?: HullShape;
  readonly seat: VehicleSeat;
  readonly engine: {kind: EngineKind; exhausts: ExhaustMount[]};
  readonly lights: VehicleLights;
  /** Optional cinematic played before driving (registered in game/intro). */
  readonly intro?: string;
  readonly hangar: HangarLayout;
  readonly canopy?: CanopyDefinition;
  /** Nodes that stay live objects instead of being baked into static batches (rigs, animated parts). */
  readonly liveNodes?: RegExp;
  readonly cloth?: ClothDefinition;
  readonly eyes?: EyesDefinition;
  /** The GLB bakes a toon ramp into unlit materials; relight it so the comic shader sees the sun. */
  readonly toonSurfaces?: boolean;
  /** Extra behaviour for this vehicle, attached after the built-in ones (cloth, eyes, plasma). */
  readonly components?: readonly VehicleComponentFactory[];
}
