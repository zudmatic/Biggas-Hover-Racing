import {AnimationMixer, Box3, MathUtils, Quaternion, Vector3, type Bone, type Group, type Mesh, type Object3D} from 'three';
import {AssetLoader, type GLTF} from '@/core/assets/asset-loader';
import type {SeatFit, Vec3Tuple} from '@/core/types';
import {Character, type CharacterDefinition, type CharacterOptions} from '../character';
import {BoneMap, isBone, isMesh, ModelResources} from './object-guards';
import {SaddleSupports} from './pilot-supports';
import {ControlExtensions} from './seating';

// Seats any racer on the UE mannequin skeleton; the spec holds what differs per rig.

export type MannequinSide = 'l' | 'r';

/** What differs between UE-mannequin racers. Plain data plus a few per-rig probes. */
export interface MannequinSpec {
  /** GLB path relative to public/. */
  url: string;
  /** Standing idle clip. */
  idle?: string;
  /** Clip whose first frame the seats were fitted from (defaults to `idle`). */
  seatFrom?: string;
  /** Still standing arm pose, left arm in model space; x is mirrored for the right. */
  stance?: {arm: Vec3Tuple; forearm: Vec3Tuple; hand: Vec3Tuple};
  castShadow?: (mesh: Mesh) => boolean;
  /** Meshes that count toward the standing height (default: all). */
  standingHeight?: (mesh: Mesh) => boolean;
  /** Uniform model scale per seat. Karts use the cockpit fit. */
  scale: {cockpit: number; saddle: number};
  /** Nómada footrest contact below the ankle joint, in model units. */
  sole: {down: number; forward: number};
  /** Arms too short for the Nómada's grips get handlebar extensions instead. */
  handlebarExtensions?: boolean;
  /** World position of the palm on `side`. */
  palm: (rig: MannequinRig, side: MannequinSide) => Vector3;
}

/** The posed skeleton and skinned meshes a spec's probes can read. */
export interface MannequinRig {
  readonly bones: BoneMap;
  readonly meshes: readonly Mesh[];
}

// Midpoints between the authored grip rings 001/002 and 007/008 in
// nomada-038.glb, after its +X to +Z conversion.
const NOMADA_GRIPS: Record<MannequinSide, Vector3> = {r: new Vector3(-0.4862, 1.6809, 0.534), l: new Vector3(0.4862, 1.6809, 0.534)};
const SIDES: readonly [MannequinSide, number][] = [
  ['l', 1],
  ['r', -1],
];

// Cache bytes, not a live rig (AssetLoader): each preview/ship owns its pose and GPU resources.
async function loadModel(spec: MannequinSpec, name: string): Promise<GLTF> {
  try {
    return await AssetLoader.shared.gltf(spec.url);
  } catch (error) {
    throw new Error(`No se pudo cargar ${name}`, {cause: error});
  }
}

const parentOf = (object: Object3D): Object3D => {
  if (!object.parent) throw new Error(`${object.name} no tiene padre`);
  return object.parent;
};

/** A racer on the UE mannequin skeleton (Ajo, Lomi), standing or seated. */
export class MannequinCharacter extends Character implements MannequinRig {
  readonly model: Group;
  readonly bones = new BoneMap();
  readonly meshes: Mesh[] = [];
  readonly mixer: AnimationMixer;
  readonly seat: SeatFit | null;
  private readonly head: Bone;
  private readonly headRest: Quaternion;
  private lastTime = -1;
  private lastMoving: boolean | null = null;

  // Setup scratch: exported joints have different local axes, so poses aim from the authored pose.
  private readonly parentRotation = new Quaternion();
  private readonly rotation = new Quaternion();
  private readonly from = new Vector3();
  private readonly to = new Vector3();

  static async load(spec: MannequinSpec, definition: CharacterDefinition, options: CharacterOptions): Promise<MannequinCharacter> {
    return new MannequinCharacter(spec, definition, await loadModel(spec, definition.name), options);
  }

  constructor(
    private readonly spec: MannequinSpec,
    definition: CharacterDefinition,
    gltf: GLTF,
    {seated, seat = 'cockpit', offset = [0, 0, 0]}: CharacterOptions,
  ) {
    super(definition);
    const {root, bones, meshes} = this;
    const model = (this.model = gltf.scene);
    root.add(model);
    const resources = this.resources.add(new ModelResources());
    model.traverse((object) => {
      if (isBone(object)) bones.add(object);
      if (!isMesh(object)) return;
      meshes.push(object);
      resources.addMesh(object);
      object.castShadow = spec.castShadow?.(object) ?? true;
      object.receiveShadow = true;
      object.frustumCulled = false;
      object.userData.system = 'cockpit';
    });
    const mixer = (this.mixer = new AnimationMixer(model));
    this.resources.add(() => {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    });
    const idle = gltf.animations.find((clip) => clip.name === (seated ? (spec.seatFrom ?? spec.idle) : spec.idle));
    if (idle) mixer.clipAction(idle).play();
    mixer.update(0);
    root.updateMatrixWorld(true);
    this.seat = seated ? seat : null;
    if (seated) this.sit(seat, offset);
    else this.stand();
    this.head = bones.get('Head');
    this.headRest = this.head.quaternion.clone();
  }

  update(time = 0, moving = false): void {
    if (time === this.lastTime && moving === this.lastMoving) return;
    this.lastTime = time;
    this.lastMoving = moving;
    if (this.seat) {
      // Only the head moves once seated; the seat supports were fitted once.
      this.head.quaternion.copy(this.headRest);
      if (moving) this.head.rotateY(Math.sin(time * 1.3) * 0.025);
    } else this.mixer.setTime(time);
  }

  private sit(seat: SeatFit, offset: Vec3Tuple): void {
    const {spec, bones, model, root} = this;
    const bike = seat === 'saddle';
    model.scale.setScalar(bike ? spec.scale.saddle : spec.scale.cockpit);
    root.updateMatrixWorld(true);
    const extremityRotations = new Map(
      ['foot_l', 'foot_r', 'hand_l', 'hand_r'].map((name) => [name, bones.get(name).getWorldQuaternion(new Quaternion())]),
    );
    if (bike) {
      // Hinge forward from the hips, while keeping the gaze on the road.
      const head = bones.get('Head'),
        pelvis = bones.get('pelvis');
      const headRotation = head.getWorldQuaternion(new Quaternion());
      this.rotation.setFromAxisAngle(new Vector3(1, 0, 0), MathUtils.degToRad(25)).multiply(pelvis.getWorldQuaternion(this.parentRotation));
      this.setWorldRotation(pelvis, this.rotation);
      this.setWorldRotation(head, headRotation);
    }
    for (const [side, sign] of SIDES) {
      const foot = bones.get(`foot_${side}`),
        hand = bones.get(`hand_${side}`);
      const footRotation = extremityRotations.get(foot.name)!,
        handRotation = extremityRotations.get(hand.name)!;
      this.aim(bones.get(`thigh_${side}`), bones.get(`calf_${side}`), new Vector3(sign * (bike ? 0.95 : 0.12), bike ? -0.55 : -0.08, 1));
      this.aim(bones.get(`calf_${side}`), foot, new Vector3(sign * (bike ? 0.2 : 0), -1, bike ? 0.15 : 0));
      this.setWorldRotation(foot, footRotation);
      this.aim(bones.get(`upperarm_${side}`), bones.get(`lowerarm_${side}`), new Vector3(sign * 0.22, -0.7, bike ? 0.7 : 0.4));
      this.aim(bones.get(`lowerarm_${side}`), hand, new Vector3(sign * 0.1, 0.03, 1));
      this.setWorldRotation(hand, handRotation);
    }
    const pelvis = bones.get('pelvis').getWorldPosition(new Vector3());
    model.position.add(new Vector3(0, bike ? 1.41 : 1.16, bike ? -0.18 : -0.32).sub(pelvis));
    root.updateMatrixWorld(true);
    if (bike) {
      for (const side of ['r', 'l'] as const) {
        if (!spec.handlebarExtensions) {
          this.gripHandlebar(side, NOMADA_GRIPS[side]);
          continue;
        }
        // Arms that cannot reach the grips point at them; extensions meet the palms.
        const upper = bones.get(`upperarm_${side}`),
          elbow = bones.get(`lowerarm_${side}`),
          hand = bones.get(`hand_${side}`);
        const handRotation = hand.getWorldQuaternion(new Quaternion());
        this.aim(upper, elbow, NOMADA_GRIPS[side].clone().sub(upper.getWorldPosition(this.from)));
        this.aim(elbow, hand, NOMADA_GRIPS[side].clone().sub(elbow.getWorldPosition(this.from)));
        this.setWorldRotation(hand, handRotation);
      }
    }
    root.position.fromArray(offset);
    root.userData.fit = seat;
    root.updateMatrixWorld(true);
    if (bike) {
      // Fitted once: seated bones never move again except the head.
      const scale = model.scale.x;
      const supports = this.resources.add(
        new SaddleSupports(root, {
          hands: spec.handlebarExtensions
            ? (['r', 'l'] as const).map((side) => (target: Vector3) => root.worldToLocal(target.copy(spec.palm(this, side))))
            : [],
          soles: (['r', 'l'] as const).map((side) => (target: Vector3) => {
            bones.get(`foot_${side}`).getWorldPosition(target);
            root.worldToLocal(target);
            target.y -= spec.sole.down * scale;
            target.z += spec.sole.forward * scale;
            return target;
          }),
        }),
      );
      supports.update();
    } else {
      // Short arms retain their proportions; control extensions meet the hands.
      const controls = this.resources.add(
        new ControlExtensions(root, {
          sides: SIDES.map(([, sign]) => sign),
          rodName: `Extensión del control de ${this.definition.name}`,
          gripName: `Agarre de ${this.definition.name}`,
        }),
      );
      SIDES.forEach(([side], index) => controls.reach(index, root.worldToLocal(bones.get(`hand_${side}`).getWorldPosition(new Vector3()))));
    }
  }

  private stand(): void {
    const {spec, bones, meshes, model} = this;
    if (spec.stance) {
      for (const [side, sign] of SIDES) {
        const [arm, forearm, hand] = [spec.stance.arm, spec.stance.forearm, spec.stance.hand].map(
          ([x, y, z]) => new Vector3(sign * x, y, z),
        );
        this.aim(bones.get(`upperarm_${side}`), bones.get(`lowerarm_${side}`), arm);
        this.aim(bones.get(`lowerarm_${side}`), bones.get(`hand_${side}`), forearm);
        this.aim(bones.get(`hand_${side}`), bones.get(`middle_01_${side}`), hand);
      }
    }
    const bodyBounds = new Box3();
    for (const mesh of meshes) if (spec.standingHeight?.(mesh) ?? true) bodyBounds.expandByObject(mesh, true);
    model.scale.setScalar(3.2 / bodyBounds.getSize(new Vector3()).y);
  }

  /** Rotates `bone` so its child lies along `direction` (normalized in place). */
  private aim(bone: Bone, child: Object3D, direction: Vector3): void {
    const {from, to, rotation, parentRotation} = this;
    bone.getWorldPosition(from);
    child.getWorldPosition(to);
    to.sub(from).normalize();
    rotation.setFromUnitVectors(to, direction.normalize()).multiply(bone.getWorldQuaternion(parentRotation));
    bone.quaternion.copy(parentOf(bone).getWorldQuaternion(parentRotation).invert().multiply(rotation));
    bone.updateWorldMatrix(false, true);
  }

  /** Sets `bone`'s world rotation, keeping its parent where it is. */
  private setWorldRotation(bone: Bone, rotation: Quaternion): void {
    bone.quaternion.copy(parentOf(bone).getWorldQuaternion(this.parentRotation).invert().multiply(rotation));
    bone.updateWorldMatrix(false, true);
  }

  /** Two-bone IK onto a Nómada grip, placing the palm (not the wrist) on the rubber. */
  private gripHandlebar(side: MannequinSide, target: Vector3): void {
    const {bones} = this;
    const upper = bones.get(`upperarm_${side}`),
      lower = bones.get(`lowerarm_${side}`),
      hand = bones.get(`hand_${side}`);
    const shoulder = upper.getWorldPosition(new Vector3()),
      elbow = lower.getWorldPosition(new Vector3()),
      wrist = hand.getWorldPosition(new Vector3());
    const orientation = hand.getWorldQuaternion(new Quaternion()),
      palm = this.spec.palm(this, side);
    // Place the palm on the actual rubber grip, rather than the wrist joint.
    const goal = target.clone().sub(palm.sub(wrist)),
      axis = goal.clone().sub(shoulder);
    const a = shoulder.distanceTo(elbow),
      b = elbow.distanceTo(wrist),
      distance = axis.length();
    if (distance >= a + b || distance <= Math.abs(a - b)) throw new Error(`${this.definition.name} no alcanza el manillar de la Nómada`);
    axis.normalize();
    const pole = new Vector3(side === 'l' ? 0.3 : -0.3, -1, -0.3);
    pole.addScaledVector(axis, -pole.dot(axis)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance),
      bend = Math.sqrt(Math.max(0, a * a - along * along));
    const joint = shoulder.clone().addScaledVector(axis, along).addScaledVector(pole, bend);
    this.aim(upper, lower, joint.sub(shoulder));
    lower.getWorldPosition(elbow);
    this.aim(lower, hand, goal.sub(elbow));
    this.setWorldRotation(hand, orientation);
  }
}

/** Average world position of a mesh's (skinned) vertices. */
export function meshCentroid(mesh: Mesh): Vector3 {
  const center = new Vector3(),
    vertex = new Vector3(),
    count = mesh.geometry.attributes.position.count;
  for (let i = 0; i < count; i++) {
    mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
    center.add(vertex);
  }
  return center.divideScalar(count);
}
