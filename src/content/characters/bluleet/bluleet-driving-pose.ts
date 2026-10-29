import {MathUtils, Matrix4, Quaternion, Vector3, type Bone, type Object3D, type Vector3Tuple} from 'three';
import {BoneMap, isSkinnedMesh} from '../shared/object-guards';

/** The actor a driving pose drives: its rig root and two hooks for rest pose and height. */
export interface PoseableActor {
  root: Object3D;
  setPose(name: string): void;
  set(options: {height: number; gaze: boolean}): void;
}

export interface DrivingPoseOptions {
  height?: number;
  seatY?: number;
  seatZ?: number;
  gripX?: number;
  gripY?: number;
  gripZ?: number;
  footX?: number;
  lean?: number;
  /** Hands hold the kart's tilted steering rim (false: straight bars/grips). */
  steering?: boolean;
}

export interface DrivingPoseStats {
  handErrors: number[];
  contacts: {palm: Vector3Tuple; target: Vector3Tuple}[];
  pelvis: Vector3Tuple;
}

type Side = 'l' | 'r';
const SIDES: readonly [Side, number][] = [
  ['l', 1],
  ['r', -1],
];
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

interface ArmFrame {
  inverse: Matrix4;
  rotation: Quaternion;
}

interface HandRest {
  frame: Matrix4;
  rotation: Quaternion;
  /** Palm contact in hand-local space. */
  contact: Vector3;
  hinges: Map<Bone, Vector3>;
}

interface Hold {
  rotation: Quaternion;
  contact: Vector3;
  wrist: Vector3;
  forward: Vector3;
  width: Vector3;
  radial: Vector3;
}

const position = (bone: Object3D): Vector3 => bone.getWorldPosition(new Vector3());

const parentOf = (object: Object3D): Object3D => {
  if (!object.parent) throw new Error(`${object.name} no tiene padre`);
  return object.parent;
};

const frame = (direction: Vector3, hinge: Vector3): Matrix4 => {
  const along = direction.clone().normalize(),
    axis = hinge.clone().addScaledVector(along, -hinge.dot(along)).normalize();
  return new Matrix4().makeBasis(along, axis, along.clone().cross(axis));
};

/**
 * Pose the original rig at runtime. No changes to skin weights or source GLB.
 * Setup-time IK: every step refreshes world matrices, so keep it out of frame loops.
 */
export class BluleetDrivingPose {
  private readonly root: Object3D;
  private readonly bones = new BoneMap();
  private readonly rest = new Map<Bone, Quaternion>();
  private readonly restFeet: Record<Side, Quaternion>;
  private readonly restHead: Quaternion;
  private readonly hands = {} as Record<Side, HandRest>;
  private readonly arms = {} as Record<Side, [ArmFrame, ArmFrame]>;

  constructor(private readonly actor: PoseableActor) {
    const root = (this.root = actor.root);
    const mesh = root.getObjectByName('Bluleet');
    if (!mesh || !isSkinnedMesh(mesh)) throw new Error('Bluleet: falta la malla con esqueleto');
    const bones = this.bones;
    for (const bone of mesh.skeleton.bones) bones.add(bone);
    actor.setPose('tpose');
    root.updateMatrixWorld(true);
    for (const bone of mesh.skeleton.bones) this.rest.set(bone, bone.quaternion.clone());
    this.restFeet = {
      l: bones.get('foot_l').getWorldQuaternion(new Quaternion()),
      r: bones.get('foot_r').getWorldQuaternion(new Quaternion()),
    };
    this.restHead = bones.get('Head').getWorldQuaternion(new Quaternion());
    for (const [s, sign] of SIDES) {
      // The authored arm is already slightly bent. Its bend plane defines the
      // elbow hinge; retaining this frame avoids twisting the sleeve at the joint.
      const upper = bones.get(`upperarm_${s}`),
        lower = bones.get(`lowerarm_${s}`);
      const upperDirection = position(lower).sub(position(upper)),
        lowerDirection = position(bones.get(`hand_${s}`)).sub(position(lower));
      const hinge = upperDirection.clone().cross(lowerDirection).normalize();
      const armFrame = (bone: Bone, i: number): ArmFrame => ({
        inverse: frame(i ? lowerDirection : upperDirection, hinge).invert(),
        rotation: bone.getWorldQuaternion(new Quaternion()),
      });
      this.arms[s] = [armFrame(upper, 0), armFrame(lower, 1)];
      const hand = bones.get(`hand_${s}`),
        wrist = position(hand),
        middle = position(bones.get(`middle_01_${s}`));
      const forward = middle.clone().sub(wrist).normalize(),
        width = position(bones.get(`index_01_${s}`)).sub(position(bones.get(`pinky_01_${s}`)));
      width.addScaledVector(forward, -width.dot(forward)).normalize();
      const normal = forward.clone().cross(width).normalize(),
        palmNormal = normal.clone().multiplyScalar(sign);
      const bindFrame = new Matrix4().makeBasis(forward, width, normal);
      const contact = position(bones.get(`index_01_${s}`))
        .add(position(bones.get(`pinky_01_${s}`)))
        .multiplyScalar(0.5)
        .lerp(wrist, 0.25)
        .addScaledVector(palmNormal, middle.distanceTo(wrist) * 0.15);
      const hinges = new Map<Bone, Vector3>();
      for (const finger of FINGERS) {
        for (let i = 1; i <= 3; i++) {
          const bone = bones.get(`${finger}_0${i}_${s}`),
            child = bones.get(i === 3 ? `${finger}_04_leaf_${s}` : `${finger}_0${i + 1}_${s}`);
          const axis = position(child).sub(position(bone)).normalize().cross(palmNormal).normalize();
          hinges.set(bone, axis.applyQuaternion(bone.getWorldQuaternion(new Quaternion()).invert()));
        }
      }
      this.hands[s] = {frame: bindFrame, rotation: hand.getWorldQuaternion(new Quaternion()), contact: hand.worldToLocal(contact), hinges};
    }
  }

  /** Seats the rig and returns how far each palm ended from its target. */
  apply({
    height = 2.8,
    seatY = 1.225,
    seatZ = -0.1,
    gripX = 0.375,
    gripY = 1.35,
    gripZ = 0.625,
    footX = 0.29,
    lean = (7 * Math.PI) / 180,
    steering = true,
  }: DrivingPoseOptions = {}): DrivingPoseStats {
    const {root, bones, actor} = this;
    actor.set({height, gaze: false});
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    for (const [bone, quaternion] of this.rest) bone.quaternion.copy(quaternion);
    root.updateMatrixWorld(true);
    root.position.add(new Vector3(0, seatY, seatZ).sub(position(bones.get('pelvis'))));
    root.updateMatrixWorld(true);
    // Sit back in the bucket seat with only a slight forward lean.
    const spine = bones.get('spine_01'),
      world = spine.getWorldQuaternion(new Quaternion());
    world.premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), lean));
    this.setWorldRotation(spine, world);
    this.setWorldRotation(bones.get('Head'), this.restHead);
    const errors: number[] = [],
      contacts: DrivingPoseStats['contacts'] = [];
    for (const [s, sign] of SIDES) {
      this.limb(
        bones.get(`thigh_${s}`),
        bones.get(`calf_${s}`),
        bones.get(`foot_${s}`),
        new Vector3(sign * footX, 0.46, 0.66),
        new Vector3(sign * Math.max(0.36, footX), 0.98, 0.9),
      );
      this.setWorldRotation(bones.get(`foot_${s}`), this.restFeet[s]);
      if (steering) {
        // Let the shoulders reach forward independently of the torso, keeping
        // the head over the seat and preserving the authored arm lengths.
        const shoulder = bones.get(`clavicle_${s}`),
          rotation = shoulder.getWorldQuaternion(new Quaternion());
        rotation.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -sign * 0.9));
        this.setWorldRotation(shoulder, rotation);
      }
      const grip = new Vector3(sign * gripX, gripY, gripZ),
        hold = steering ? this.steeringHand(s, sign, grip) : null,
        hand = bones.get(`hand_${s}`);
      this.limb(
        bones.get(`upperarm_${s}`),
        bones.get(`lowerarm_${s}`),
        hand,
        hold?.wrist ?? grip,
        new Vector3(sign * 0.34, 1.12, 0.1),
        this.arms[s],
      );
      if (hold) this.setWorldRotation(hand, hold.rotation);
      for (const finger of FINGERS) {
        for (const [i, angle] of [
          [1, 25],
          [2, 65],
          [3, 40],
        ] as const) {
          const bone = bones.find(`${finger}_0${i}_${s}`);
          const hinge = bone && this.hands[s].hinges.get(bone);
          if (bone && hinge) bone.quaternion.multiply(new Quaternion().setFromAxisAngle(hinge, (angle * Math.PI) / 180));
        }
      }
      root.updateMatrixWorld(true);
      if (hold) {
        // Oppose the thumb against the inside of the rim instead of leaving it
        // spread in the bind pose. Preserve both phalanx lengths.
        const tip = grip.clone().addScaledVector(hold.width, 0.05).addScaledVector(hold.radial, -0.07).addScaledVector(hold.forward, -0.06);
        const pole = grip.clone().addScaledVector(hold.radial, -0.09).addScaledVector(hold.forward, -0.16);
        this.limb(bones.get(`thumb_02_${s}`), bones.get(`thumb_03_${s}`), bones.get(`thumb_04_leaf_${s}`), tip, pole);
      }
      const palm = hand.localToWorld(this.hands[s].contact.clone());
      errors.push(hold ? palm.distanceTo(hold.contact) : position(hand).distanceTo(grip));
      contacts.push({palm: palm.toArray(), target: (hold?.contact ?? grip).toArray()});
    }
    root.updateMatrixWorld(true);
    return {handErrors: errors, contacts, pelvis: position(bones.get('pelvis')).toArray()};
  }

  /** Sets a bone's world rotation and refreshes the rig. */
  private setWorldRotation(bone: Bone, rotation: Quaternion): void {
    bone.quaternion.copy(parentOf(bone).getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
    this.root.updateMatrixWorld(true);
  }

  private steeringHand(s: Side, sign: number, grip: Vector3): Hold {
    // Follow the tilted rim as the studio's hand-height controls change.
    // The palm faces inward and the thumb follows the tangent toward the top.
    const forward = new Vector3(0, -0.5, 0.8660254);
    const angle = Math.atan2((grip.y - 1.45) * 0.8660254 + (grip.z - 0.67) * 0.5, Math.abs(grip.x));
    const width = new Vector3(-sign * Math.sin(angle), Math.cos(angle) * 0.8660254, Math.cos(angle) * 0.5);
    const radial = forward.clone().cross(width).normalize().multiplyScalar(-sign);
    const normal = forward.clone().cross(width).normalize();
    const h = this.hands[s];
    const rotation = new Quaternion()
      .setFromRotationMatrix(new Matrix4().makeBasis(forward, width, normal).multiply(h.frame.clone().invert()))
      .multiply(h.rotation);
    // Leave room for the actual thickness of the mitten, not just its bones.
    const contact = grip.clone().addScaledVector(radial, 0.12).addScaledVector(forward, -0.15);
    const offset = h.contact
      .clone()
      .multiply(this.bones.get(`hand_${s}`).getWorldScale(new Vector3()))
      .applyQuaternion(rotation);
    return {rotation, contact, wrist: contact.clone().sub(offset), forward, width, radial};
  }

  private aim(bone: Bone, child: Bone, target: Vector3): void {
    this.root.updateMatrixWorld(true);
    const from = position(child).sub(position(bone)).normalize(),
      to = target.clone().sub(position(bone)).normalize();
    const world = new Quaternion().setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(new Quaternion()));
    this.setWorldRotation(bone, world);
  }

  /** Two-bone IK from `a` through `b` to `c`; returns the remaining distance to `target`. */
  private limb(a: Bone, b: Bone, c: Bone, target: Vector3, pole: Vector3, frames: [ArmFrame, ArmFrame] | null = null): number {
    const origin = position(a),
      l1 = origin.distanceTo(position(b)),
      l2 = position(b).distanceTo(position(c));
    const dir = target.clone().sub(origin),
      distance = MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 0.001, l1 + l2 - 0.001);
    dir.normalize();
    const bend = pole.clone().sub(origin);
    bend.addScaledVector(dir, -bend.dot(dir)).normalize();
    const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance),
      height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const joint = origin.clone().addScaledVector(dir, along).addScaledVector(bend, height),
      end = origin.clone().addScaledVector(dir, distance);
    if (frames) {
      const upper = joint.clone().sub(origin),
        lower = end.clone().sub(joint),
        hinge = upper.clone().cross(lower).normalize();
      for (const [i, bone, direction] of [
        [0, a, upper],
        [1, b, lower],
      ] as const) {
        const world = new Quaternion()
          .setFromRotationMatrix(frame(direction, hinge).multiply(frames[i].inverse))
          .multiply(frames[i].rotation);
        this.setWorldRotation(bone, world);
      }
    } else {
      this.aim(a, b, joint);
      this.aim(b, c, end);
    }
    return position(c).distanceTo(target);
  }
}
