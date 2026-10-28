/** Shared primitive types used across domains. */

export type Vec3Tuple = [x: number, y: number, z: number];

/** Race session lifecycle. Systems pause, mute or freeze based on it. */
export type GamePhase = 'loading' | 'intro' | 'countdown' | 'flying' | 'paused' | 'finished';

/** Phases in which the vehicle simulation advances. */
export const isDrivingPhase = (phase: GamePhase): boolean => phase === 'flying' || phase === 'intro';

/** How a pilot sits on a vehicle. Every character supports every fit. */
export type SeatFit = 'cockpit' | 'saddle' | 'kart';

/** A player's roster pick. Ids resolve through the content registries. */
export interface RacerChoice {
  character: string;
  vehicle: string;
  /** Character customization; ignored by characters that don't support it. */
  palette?: string;
  hat?: string;
  livery?: string;
}
