import {Group, type MeshStandardMaterial, type Object3D} from 'three';
import {AssetLoader} from '@/core/assets/asset-loader';
import type {Disposable} from '@/core/disposable';
import {LocalExhaust} from '@/fx/exhaust/local-exhaust';
import type {LomiPlasma} from '@/fx/lomi/lomi-plasma';
import {VehicleLivery} from './vehicle-livery';
import {ResourceSet} from './resources';
import {ShipCloth} from './ship-cloth';
import {ShipEyes} from './ship-eyes';
import {seatPilot, type SeatedPilot} from './ship-pilot';
import {SingularityPlasma} from './singularity-plasma';
import {bakeVehicle} from './vehicle-batches';
import type {
  VehicleAssembly,
  VehicleComponent,
  VehicleComponentFactory,
  VehicleFrame,
  VehicleLoadOptions,
  VehicleMotion,
} from './vehicle-component';
import type {VehicleDefinition} from './vehicle-definition';
import {prepareVehicleModel} from './vehicle-model';

/** Behaviour every vehicle gets when its definition asks for it, in update order. */
const BUILT_IN_COMPONENTS: readonly VehicleComponentFactory[] = [ShipCloth.attach, ShipEyes.attach, SingularityPlasma.attach];

const NO_ANCHORS: Object3D[] = [];

type ComponentClass<T> = abstract new (...args: never[]) => T;

const isComponentList = (value: VehicleComponent | readonly VehicleComponent[]): value is readonly VehicleComponent[] =>
  Array.isArray(value);

/**
 * A drivable vehicle model: static parts baked into one batch per material, live
 * rigs, the seated pilot, a local exhaust for viewers and per-vehicle components.
 * Create with `Vehicle.load(definition, options)`.
 */
export class Vehicle implements Disposable {
  static async load(definition: VehicleDefinition, options: VehicleLoadOptions = {}): Promise<Vehicle> {
    const gltf = await AssetLoader.shared.gltf(definition.model);
    const source = prepareVehicleModel(gltf.scene, definition);
    // Seated before baking: a built-in pilot rig leaves the model either way.
    const pilot = await seatPilot(source, gltf.animations, definition, {
      character: options.character ?? definition.seat.defaultPilot,
      palette: options.palette,
      hat: options.hat,
    });
    const root = new Group();
    root.name = `${definition.title} · vuelo`;
    root.userData.vehicle = definition.id;
    const {liveNodes, clothMeshes, headlamps} = bakeVehicle(source, root, definition);
    pilot.root.visible = true;
    root.add(pilot.root);
    const exhaust = options.exhaust === false ? null : new LocalExhaust(root, definition.engine.exhausts);
    const vehicle = new Vehicle(definition, root, pilot, exhaust, headlamps);
    vehicle.resources.addMaterialsOf(source);
    vehicle.resources.addMaterialsOf(root);
    vehicle.setLivery(options.livery);
    const assembly: VehicleAssembly = {definition, root, clips: gltf.animations, liveNodes, clothMeshes, options};
    try {
      for (const attach of [...BUILT_IN_COMPONENTS, ...(definition.components ?? [])]) {
        const created = await attach(assembly);
        if (created === null) continue;
        vehicle.components.push(...(isComponentList(created) ? created : [created]));
      }
    } catch (error) {
      vehicle.dispose();
      throw error;
    }
    return vehicle;
  }

  /** Attached components in update order: built-ins first, then the definition's own. */
  readonly components: VehicleComponent[] = [];
  private readonly livery: VehicleLivery;
  /** Source materials and textures only reachable from the unbaked model. */
  private readonly resources = new ResourceSet();
  private readonly frame: VehicleFrame = {time: 0, speed: 0, boosting: false, reducedMotion: false};

  private constructor(
    readonly definition: VehicleDefinition,
    readonly root: Group,
    readonly pilot: SeatedPilot,
    /** Local flame jets; null when the caller draws its own exhaust. */
    readonly exhaust: LocalExhaust | null,
    private readonly headlamps: ReadonlyMap<MeshStandardMaterial, MeshStandardMaterial>,
  ) {
    this.livery = new VehicleLivery(root, definition.paint);
  }

  setLivery(id?: string): string {
    return this.livery.set(id);
  }

  /** The first attached component of a class, e.g. `vehicle.component(ShipEyes)`. */
  component<T extends VehicleComponent>(type: ComponentClass<T>): T | null {
    for (const component of this.components) if (component instanceof type) return component;
    return null;
  }

  /** Face rig, on vehicles that have one; cinematics hold it open or shut. */
  get eyes(): ShipEyes | null {
    return this.component(ShipEyes);
  }

  /** Singularity plasma; fx/singularity drives it while racing. */
  get plasma(): LomiPlasma | null {
    return this.component(SingularityPlasma)?.plasma ?? null;
  }

  /** Thrust anchors of a singularity engine. */
  get anchors(): Object3D[] {
    return this.component(SingularityPlasma)?.anchors ?? NO_ANCHORS;
  }

  setHeadlights(enabled: boolean): void {
    for (const [source, lamp] of this.headlamps) lamp.emissiveIntensity = enabled ? source.emissiveIntensity : 0;
  }

  /** `time` in seconds; the pilot animates at 24 fps and only while moving. */
  update(time: number, speed: number, boosting: boolean, reducedMotion: boolean, state?: VehicleMotion): void {
    this.pilot.update(Math.floor(time * 24) / 24, !reducedMotion && speed > 1);
    const frame = this.frame;
    frame.time = time;
    frame.speed = speed;
    frame.boosting = boosting;
    frame.reducedMotion = reducedMotion;
    frame.state = state;
    for (const component of this.components) component.update(frame);
    this.exhaust?.animate(time, speed, boosting, reducedMotion, state);
  }

  dispose(): void {
    this.livery.dispose();
    this.exhaust?.dispose();
    for (const component of this.components) component.dispose();
    this.pilot.dispose();
    this.resources.addTree(this.root);
    for (const lamp of this.headlamps.values()) this.resources.addMaterial(lamp);
    this.resources.dispose();
    this.root.removeFromParent();
  }
}
