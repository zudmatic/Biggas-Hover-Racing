import {shipParts} from '../parts';
import type {VehicleDefinition} from '../vehicle-definition';

/** Bluleet's hover kart: one rigid body, inspected as hull, seat and engine. */
export const bluleetKart: VehicleDefinition = {
  id: 'bluleet',
  name: 'Bluleet',
  title: 'Bluleet Hover Kart',
  image: 'bluleet',
  model: 'models/spaceship/bluleet-car-web.glb',
  transform: {scale: 5},
  hull: {halfWidth: 1.78, halfLength: 2.51, capsuleRadius: 1.5, capsuleSpacing: 1, capsuleBottom: 0.15, capsuleTop: 1.8},
  seat: {fit: 'kart', offset: [0, -0.32, 0.08], offsets: {bluleet: [0, 0, 0]}, defaultPilot: 'bluleet'},
  engine: {kind: 'flame', exhausts: [[0, 1.3, -2.5, 0.3]]},
  lights: {
    headlights: [
      [-1.1, 0.75, 2.4],
      [1.1, 0.75, 2.4],
    ],
    underglow: true,
  },
  hangar: {
    parts: shipParts({engines: {name: 'Propulsor central', anchor: [0, 1.3, -2.5]}}, {only: ['hull', 'cockpit', 'engines']}),
    classify: () => 'hull',
  },
};
