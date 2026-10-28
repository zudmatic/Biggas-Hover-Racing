import {vehicles} from '@/content/vehicles';
import {characters} from './index';
import {zudHat} from './hats/hat-catalog';
import {zudmaticPalette} from './zudmatic/palettes';

export interface PilotChoice {
  pilot: string;
  palette: string;
  hat: string;
}

/** Resolve URL selections against the registries, preserving existing shared links. */
export function pilotChoice(query = new URLSearchParams(location.search)): PilotChoice {
  const vehicle = vehicles.resolve(query.get('vehicle'));
  return {
    pilot: characters.resolve(query.get('pilot') ?? vehicle.seat.defaultPilot).id,
    palette: zudmaticPalette(query.get('palette')).name,
    hat: zudHat(query.get('hat')).id,
  };
}

export function pilotQuery(choice: Partial<PilotChoice>): string {
  return `pilot=${characters.resolve(choice.pilot).id}&palette=${zudmaticPalette(choice.palette).name}&hat=${zudHat(choice.hat).id}`;
}
