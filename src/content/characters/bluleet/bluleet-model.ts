import {Box3, Group, Quaternion, Vector3, type Bone, type Mesh} from 'three';
import {AssetLoader, type GLTF} from '@/core/assets/asset-loader';
import type {SeatFit} from '@/core/types';
import {Character, type CharacterDefinition, type CharacterOptions} from '../character';
import {BoneMap, isBone, isMesh, isSkinnedMesh, ModelResources} from '../shared/object-guards';
import {BluleetDrivingPose, type DrivingPoseOptions, type DrivingPoseStats} from './bluleet-driving-pose';
import {BluleetInk} from './bluleet-ink';

// Each actor owns its rig and GPU resources; only the downloaded bytes are shared (AssetLoader).
async function loadModel(): Promise<GLTF> {
  try {
    return await AssetLoader.shared.gltf('models/bluleet/bluleet-motionlab-dedos.glb');
  } catch (error) {
    throw new Error('No se pudo cargar Bluleet', {cause: error});
  }
}

/** Driving pose per seat. The kart uses the solver's steering-rim defaults. */
const SEAT_POSES: Record<SeatFit, DrivingPoseOptions> = {
  kart: {},
  saddle: {seatY: 1.38, seatZ: -0.1, gripY: 1.68, gripZ: 0.534, gripX: 0.486, footX: 0.7, lean: 0.44, steering: false},
  cockpit: {seatY: 1.16, seatZ: -0.32, gripY: 1.35, gripZ: 0.25, gripX: 0.29, lean: 0.3, steering: false},
};

export interface BluleetOptions extends CharacterOptions {
  /** Chubee's ink finish (default on); off shows the authored materials. */
  ink?: boolean;
}

/** Bluleet, posed at runtime on the original rig, with the optional ink finish. */
export class BluleetCharacter extends Character {
  readonly model: Group;
  /** Scaled and posed by the driving pose; the root only carries the seat offset. */
  readonly rig = new Group();
  readonly bones = new BoneMap();
  readonly meshes: Mesh[] = [];
  readonly seat: SeatFit | null;
  /** Palm-to-grip errors of the seated pose (null when standing). */
  readonly poseStats: DrivingPoseStats | null = null;
  private readonly head: Bone;
  private readonly headRest: Quaternion;
  private readonly finish: BluleetInk | null;

  static async load(definition: CharacterDefinition, options: BluleetOptions): Promise<BluleetCharacter> {
    return new BluleetCharacter(definition, await loadModel(), options);
  }

  constructor(definition: CharacterDefinition, gltf: GLTF, {seated, seat = 'cockpit', offset = [0, 0, 0], ink = true}: BluleetOptions) {
    super(definition);
    const {root, rig, bones, meshes} = this;
    const model = (this.model = gltf.scene);
    root.name = 'Bluleet · piloto';
    root.userData.fit = seat;
    root.add(rig);
    rig.add(model);
    const rest = new Map<Bone, Quaternion>();
    const resources = this.resources.add(new ModelResources());
    model.traverse((object) => {
      if (isBone(object)) {
        bones.add(object);
        rest.set(object, object.quaternion.clone());
      }
      if (!isMesh(object)) return;
      meshes.push(object);
      // Retain authored materials for native comparisons and ownership/disposal.
      // The optional ink finish is attached after the rig is posed.
      resources.addMesh(object);
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
      object.userData.system = 'cockpit';
    });
    model.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(model, true),
      sourceHeight = bounds.getSize(new Vector3()).y;
    model.position.set(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
    this.seat = seated ? seat : null;
    if (seated) {
      const pose = new BluleetDrivingPose({
        root: rig,
        setPose() {
          for (const [bone, quaternion] of rest) bone.quaternion.copy(quaternion);
        },
        set({height}) {
          rig.scale.setScalar(height / sourceHeight);
        },
      });
      this.poseStats = pose.apply(SEAT_POSES[seat]);
      root.position.fromArray(offset);
    } else {
      rig.scale.setScalar(3.2 / sourceHeight);
      root.updateMatrixWorld(true);
      for (const [side, sign] of [
        ['l', 1],
        ['r', -1],
      ] as const) {
        const arm = bones.get(`upperarm_${side}`),
          world = arm.getWorldQuaternion(new Quaternion());
        world.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -sign * 0.87));
        arm.quaternion.copy(arm.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(world));
        root.updateMatrixWorld(true);
      }
    }
    const body = meshes.find((mesh) => isSkinnedMesh(mesh) && mesh.name === 'Bluleet');
    this.finish = ink && body && isSkinnedMesh(body) ? this.resources.add(new BluleetInk(body)) : null;
    root.userData.ink = ink;
    this.head = bones.get('Head');
    this.headRest = this.head.quaternion.clone();
  }

  update(time = 0, moving = false): void {
    this.head.quaternion.copy(this.headRest);
    if (moving) this.head.rotateY(Math.sin(time * 1.3) * 0.025);
    this.finish?.update(time);
  }
}

export const createBluleet = (definition: CharacterDefinition, options: BluleetOptions): Promise<BluleetCharacter> =>
  BluleetCharacter.load(definition, options);
