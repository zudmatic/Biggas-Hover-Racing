import type {SeatFit, Vec3Tuple} from '@/core/types';

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

/** Hangar inspection group. */
export interface VehiclePart {
  id: string;
  name: string;
  anchor: Vec3Tuple;
  [extra: string]: unknown;
}

/**
 * Everything the game needs to know about a vehicle, as data. Add a vehicle by
 * creating `content/vehicles/<id>/index.ts` with one of these and registering it.
 */
export interface VehicleDefinition {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  /** Lobby card: public/images/flight/<image>.png (+ -paper.png). */
  readonly image: string;
  /** GLB path relative to public/. */
  readonly model: string;
  readonly transform?: {scale?: number; offset?: Vec3Tuple; yaw?: number};
  readonly hull?: HullShape;
  readonly seat: {
    fit: SeatFit;
    offset: Vec3Tuple;
    /** Per-character seat corrections. */
    offsets?: Readonly<Record<string, Vec3Tuple>>;
    /** Character picked when the URL names only the vehicle. */
    defaultPilot?: string;
  };
  readonly engine: {kind: EngineKind; exhausts: ExhaustMount[]};
  readonly lights: {headlights: Vec3Tuple[]; underglow: boolean};
  /** Optional cinematic played before driving (registered in game/intro). */
  readonly intro?: string;
}
