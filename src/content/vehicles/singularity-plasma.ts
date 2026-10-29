import {Mesh, type Object3D} from 'three';
import {loadEnergyTextures} from '@/fx/lomi/lomi-energy';
import {LomiPlasma} from '@/fx/lomi/lomi-plasma';
import type {VehicleAssembly, VehicleComponent, VehicleFrame} from './vehicle-component';

const CRYSTAL = 'lomi_ship_crystal';
const THRUST = 'lomi_ship_thrust';

/**
 * The hull half of a singularity engine: crystals and thrust nozzles tagged in
 * the GLB (`userData.shader`) carry Lomi's plasma. While racing, fx/singularity
 * drives the plasma and anchors its lenses on `anchors`; viewers let it idle here.
 */
export class SingularityPlasma implements VehicleComponent {
  static async attach({definition, root, liveNodes, options}: VehicleAssembly): Promise<SingularityPlasma | null> {
    if (definition.engine.kind !== 'singularity') return null;
    const anchors = liveNodes.filter((node) => !(node instanceof Mesh) && node.userData.shader === THRUST);
    // TSL plasma; the WebGL thumbnail script opts out.
    if (options.plasma === false) return new SingularityPlasma(anchors, null);
    const plasma = new LomiPlasma(root, {
      crystals: liveNodes.filter((node) => node.userData.shader === CRYSTAL),
      exhausts: anchors,
      nozzles: liveNodes.filter((node) => node instanceof Mesh && node.userData.shader === THRUST),
      scale: definition.transform?.scale ?? 1,
      textures: await loadEnergyTextures(),
    });
    return new SingularityPlasma(anchors, plasma);
  }

  constructor(
    /** Thrust anchors (empties at the nozzle mouths). */
    readonly anchors: Object3D[],
    readonly plasma: LomiPlasma | null,
  ) {}

  update({time, reducedMotion}: Readonly<VehicleFrame>): void {
    if (this.plasma && !this.plasma.driven) this.plasma.idle(time, reducedMotion);
  }

  dispose(): void {
    this.plasma?.dispose();
  }
}
