import {AnimationMixer, Bone, Group, Mesh, SkinnedMesh, type AnimationClip, type Object3D, type Skeleton} from 'three';
import type {Disposable} from '@/core/disposable';
import {characters} from '@/content/characters';
import type {Character} from '@/content/characters/character';
import {vehicles} from './index';
import {ResourceSet} from './resources';
import type {VehicleDefinition} from './vehicle-definition';

/** Who flies a vehicle; omitted fields fall back to the character defaults. */
export interface PilotChoice {
  character?: string;
  palette?: string;
  hat?: string;
}

export interface SelectablePilot {
  root: Group;
  actor: Character;
  update(time?: number, moving?: boolean): void;
  dispose(): void;
}

/** Whoever sits in a vehicle: a selectable character or the vehicle's own pilot rig. */
export type SeatedPilot = SelectablePilot | ShipPilot;

/** The built-in rig, shaped like a character actor. */
export interface ShipPilotActor {
  root: Group;
  model: Object3D;
  bones: Record<string, Bone>;
  meshes: Mesh[];
  mixer: AnimationMixer;
  update(time?: number): void;
  /** Built-in rigs have no wardrobe; declared so callers can test for it on any pilot. */
  setPalette?: undefined;
  setHat?: undefined;
}

/** A pilot exported seated in the vehicle GLB, playing its own clip. */
export class ShipPilot implements Disposable {
  readonly root = new Group();
  readonly actor: ShipPilotActor;
  private readonly mixer: AnimationMixer;
  private readonly resources = new ResourceSet();
  private readonly skeletons = new Set<Skeleton>();
  private lastTime = 0;

  constructor(
    private readonly model: Object3D,
    clip: AnimationClip,
    character: string,
  ) {
    this.root.name = character;
    this.root.userData.pilot = character;
    this.root.attach(model);
    const bones: Record<string, Bone> = {};
    const meshes: Mesh[] = [];
    model.traverse((object) => {
      if (object instanceof Bone) bones[object.name] = object;
      if (!(object instanceof Mesh)) return;
      meshes.push(object);
      if (object instanceof SkinnedMesh) this.skeletons.add(object.skeleton);
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
      object.userData.system = 'cockpit';
    });
    this.resources.addTree(model);
    this.mixer = new AnimationMixer(model);
    this.mixer.clipAction(clip).play();
    this.mixer.update(0);
    this.actor = {root: this.root, model, bones, meshes, mixer: this.mixer, update: this.update};
  }

  /** Poses the clip at `time` seconds; the rig ignores whether the vehicle moves. */
  readonly update = (time = 0): void => {
    if (time === this.lastTime) return;
    this.lastTime = time;
    this.mixer.setTime(time);
  };

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    for (const skeleton of this.skeletons) skeleton.dispose();
    this.resources.dispose();
    this.root.removeFromParent();
  }
}

// A ship exported with its own pilot seated keeps that rig live when that pilot
// flies it, and drops it for anyone else, who takes the ship's seat offset.
/** Seats the chosen character in a prepared vehicle model. */
export async function seatPilot(
  model: Object3D,
  clips: readonly AnimationClip[],
  definition: VehicleDefinition,
  choice: PilotChoice,
): Promise<SeatedPilot> {
  const {seat} = definition;
  const builtIn = seat.builtInPilot;
  const rig = builtIn ? model.getObjectByName(builtIn.node) : undefined;
  if (builtIn && rig && choice.character === builtIn.character) {
    const clip = clips.find((candidate) => candidate.name === builtIn.clip);
    if (!clip) throw new Error(`${definition.title}: falta la animación ${builtIn.clip}`);
    return new ShipPilot(rig, clip, builtIn.character);
  }
  rig?.removeFromParent();
  const offset = (choice.character === undefined ? undefined : seat.offsets?.[choice.character]) ?? seat.offset;
  const actor = await characters
    .resolve(choice.character)
    .create({seated: true, palette: choice.palette, hat: choice.hat, offset, seat: seat.fit});
  actor.root.visible = false;
  return {root: actor.root, actor, update: (time = 0, moving = false) => actor.update(time, moving), dispose: () => actor.dispose()};
}
