import {Registry} from '@/core/registry';
import {bluleetKart} from './bluleet-kart';
import {bulldog039} from './bulldog-039';
import {lomi040} from './lomi-040';
import {nomada038} from './nomada-038';
import {oliva037} from './oliva-037';
import type {VehicleDefinition} from './vehicle-definition';
import {zud033} from './zud-033';

export type * from './vehicle-definition';

/** Every vehicle, in lobby order. URLs and saved choices fall back to the 033. */
export const vehicles = new Registry<VehicleDefinition>('Vehículo', '033');

for (const definition of [bluleetKart, zud033, oliva037, nomada038, bulldog039, lomi040]) vehicles.register(definition);
