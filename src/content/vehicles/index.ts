import {Registry} from '@/core/registry';
import {bluleetKart} from './bluleet-kart';
import {bulldog039} from './bulldog-039';
import {lomi040} from './lomi-040';
import {nomada038} from './nomada-038';
import {zudoneta037} from './zudoneta-037';
import type {VehicleDefinition} from './vehicle-definition';

export type * from './vehicle-definition';

/** Every vehicle, in lobby order. URLs and saved choices fall back to the Zudoneta 037. */
export const vehicles = new Registry<VehicleDefinition>('Vehículo', '037');

for (const definition of [bluleetKart, zudoneta037, nomada038, bulldog039, lomi040]) vehicles.register(definition);
