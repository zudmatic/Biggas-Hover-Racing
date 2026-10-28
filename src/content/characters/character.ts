import {Group} from 'three';
import type {BabbleOptions} from '@gitchad/babble';
import {DisposableGroup, type Disposable} from '@/core/disposable';
import type {SeatFit, Vec3Tuple} from '@/core/types';

export interface CharacterOptions {
  /** Seated in a vehicle; false = standing pose for menus and previews. */
  seated: boolean;
  /** Seat archetype of the vehicle the character rides. */
  seat?: SeatFit;
  /** Pilot root offset inside the vehicle, in vehicle model units. */
  offset?: Vec3Tuple;
  palette?: string;
  hat?: string;
}

/**
 * A loaded character. Subclasses build `root`, register every GPU resource in
 * `resources`, and animate in `update`.
 */
export abstract class Character implements Disposable {
  readonly root = new Group();
  protected readonly resources = new DisposableGroup();

  constructor(readonly definition: CharacterDefinition) {
    this.root.name = definition.name;
    this.root.userData.pilot = definition.id;
  }

  /** Advances idle or driving animation. `time` is in seconds. */
  abstract update(time: number, moving: boolean): void;

  /** Present on characters with `customization.palettes`. */
  setPalette?(name: string): void;

  /** Present on characters with `customization.hats`; resolves once the hat is worn. */
  setHat?(id: string): Promise<void>;

  dispose(): void {
    this.resources.dispose();
    this.root.removeFromParent();
  }
}

export interface CharacterDefinition {
  readonly id: string;
  readonly name: string;
  /** Lobby face card: public/images/flight/<portrait>.png (+ -paper.png). */
  readonly portrait: string;
  /** Lobby full-body card: public/images/flight/<preview>.png. */
  readonly preview: string;
  /** False when the lobby cards have no -paper.png variants. */
  readonly paperImages?: boolean;
  readonly customization: {readonly hats: boolean; readonly palettes: boolean};
  /** Procedural voice (@gitchad/babble) used by the voice system. */
  readonly voice?: BabbleOptions;
  /** Loads the model lazily; keep heavy imports inside. */
  create(options: CharacterOptions): Promise<Character>;
}

/** Seat names used by older vehicle data: the Nómada hoverbike and the Bluleet kart. */
export type LegacySeatFit = 'cockpit' | 'nomada' | 'bluleet';

/** Accepts both the SeatFit names and the legacy ones; anything else is a cockpit. */
export function toSeatFit(fit: SeatFit | LegacySeatFit | null | undefined): SeatFit {
  if (fit === 'saddle' || fit === 'nomada') return 'saddle';
  if (fit === 'kart' || fit === 'bluleet') return 'kart';
  return 'cockpit';
}
