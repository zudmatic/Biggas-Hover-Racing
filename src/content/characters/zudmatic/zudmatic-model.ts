import {AnimationMixer, Box3, Quaternion, Vector3, type Bone, type Color, type Group, type Material, type Mesh} from 'three';
import {AssetLoader, type GLTF} from '@/core/assets/asset-loader';
import type {SeatFit, Vec3Tuple} from '@/core/types';
import {Character, type CharacterDefinition, type CharacterOptions} from '../character';
import {BoneMap, isBone, isMesh, ModelResources} from '../shared/object-guards';
import {SaddleSupports} from '../shared/pilot-supports';
import {positionIn, rotationIn} from '../shared/seating';
import {zudmaticPalette, type ZudmaticColorKey} from './palettes';

type TintedMaterial = Material & {color: Color};
type TintedMesh = Mesh & {material: TintedMaterial};

const AXIS = new Vector3(1, 0, 0);
const FORWARD = new Vector3(0, 0, 1);
const SIDES = ['L', 'R'] as const;
type Side = (typeof SIDES)[number];

function tintedMaterial(mesh: Mesh): TintedMaterial {
  const material = mesh.material;
  if (Array.isArray(material) || !('color' in material)) throw new Error(`Zudmatic: material sin color en ${mesh.name}`);
  return material as TintedMaterial;
}

// Cache only the bytes (AssetLoader). Each actor owns its skeleton, materials and GPU resources.
async function loadModel(): Promise<GLTF> {
  try {
    return await AssetLoader.shared.gltf('models/zudmatic/zudmatic.glb');
  } catch (error) {
    throw new Error('No se pudo cargar Zudmatic', {cause: error});
  }
}

interface Limb {
  thigh: Bone;
  shin: Bone;
  foot: Bone;
  upperArm: Bone;
  forearm: Bone;
  hand: Bone;
  /** The foot's authored rotation, kept flat on the floor in every pose. */
  footRotation: Quaternion;
}

/** Zudmatic with selectable palettes; a standing idle clip, or a seated driving pose. */
export class ZudmaticCharacter extends Character {
  readonly model: Group;
  readonly bones = new BoneMap();
  readonly meshes: TintedMesh[] = [];
  readonly mixer: AnimationMixer;
  readonly seat: SeatFit | null;
  private readonly limbs: Record<Side, Limb>;
  private readonly supports: SaddleSupports | null = null;
  private lastTime = -1;

  private readonly parentRotation = new Quaternion();
  private readonly rootRotation = new Quaternion();
  private readonly rotation = new Quaternion();
  private readonly spread = new Quaternion();

  static async load(definition: CharacterDefinition, options: CharacterOptions): Promise<ZudmaticCharacter> {
    return new ZudmaticCharacter(definition, await loadModel(), options);
  }

  constructor(
    definition: CharacterDefinition,
    gltf: GLTF,
    {seated, seat = 'cockpit', offset = [0, 0, 0], palette = 'Original'}: CharacterOptions,
  ) {
    super(definition);
    const {root, bones, meshes} = this;
    const model = (this.model = gltf.scene);
    root.add(model);
    const resources = this.resources.add(new ModelResources());
    model.traverse((object) => {
      if (isBone(object)) bones.add(object);
      if (!isMesh(object)) return;
      // Per-part materials preserve Bosque's individual shell, detail and shoe colors.
      object.material = tintedMaterial(object).clone();
      meshes.push(object as TintedMesh);
      resources.addMesh(object, {textures: false});
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
      object.userData.system = 'cockpit';
    });
    this.setPalette(palette);
    const mixer = (this.mixer = new AnimationMixer(model));
    this.resources.add(() => {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    });
    const idle = gltf.animations.find((clip) => clip.name === 'Reposo');
    model.updateMatrixWorld(true);
    const limb = (side: Side): Limb => ({
      thigh: bones.get(`thigh_${side}`),
      shin: bones.get(`shin_${side}`),
      foot: bones.get(`foot_${side}`),
      upperArm: bones.get(`upper_arm_${side}`),
      forearm: bones.get(`forearm_${side}`),
      hand: bones.get(`hand_${side}`),
      footRotation: bones.get(`foot_${side}`).getWorldQuaternion(new Quaternion()),
    });
    this.limbs = {L: limb('L'), R: limb('R')};
    this.seat = seated ? seat : null;
    if (seated) this.supports = this.sit(seat, offset);
    else {
      const bounds = new Box3().setFromObject(model),
        height = bounds.getSize(new Vector3()).y;
      model.scale.setScalar(3.2 / height);
      if (idle) mixer.clipAction(idle).play();
      mixer.update(0);
    }
  }

  /** Applies a palette by name (unknown names use the original). */
  override setPalette(name: string | null | undefined): void {
    const selected = zudmaticPalette(name);
    this.root.userData.palette = selected.name;
    for (const mesh of this.meshes) {
      const partId: unknown = mesh.userData.partId,
        colorKey: unknown = mesh.userData.colorKey;
      const hex =
        (typeof partId === 'string' ? selected.parts?.[partId] : undefined) ??
        (typeof colorKey === 'string' ? selected.colors[colorKey as ZudmaticColorKey] : undefined);
      if (hex) mesh.material.color.set(hex);
    }
  }

  update(time = 0, moving = false): void {
    if (time === this.lastTime) return;
    this.lastTime = time;
    if (this.seat) {
      // Legs and forearm angles are fixed once seated; only the upper arms sway.
      this.swayArms(time, moving);
      this.supports?.updateHands();
    } else this.mixer.setTime(time);
  }

  private get bike(): boolean {
    return this.seat === 'saddle';
  }

  private sit(seat: SeatFit, offset: Vec3Tuple): SaddleSupports | null {
    const {model, root, bones} = this;
    const bike = seat === 'saddle';
    // Uniform scale retains the supplied proportions. Anchor the pelvis to the
    // seat. The hoverbike uses a wider leg pose and its own uniform scale.
    model.scale.setScalar(bike ? 0.44 : 0.31);
    this.drivingPose();
    const pelvis = bones.get('pelvis').getWorldPosition(new Vector3());
    model.position.add(new Vector3(0, bike ? 1.38 : 1.16, bike ? -0.06 : -0.32).sub(pelvis));
    root.position.fromArray(offset);
    root.userData.fit = seat;
    if (!bike) return null;
    const supports = this.resources.add(
      new SaddleSupports(root, {
        hands: SIDES.map((side) => (target: Vector3) => positionIn(root, this.limbs[side].hand, target)),
        soles: SIDES.map((side) => (target: Vector3) => {
          positionIn(root, this.limbs[side].foot, target);
          target.y -= 0.085;
          target.z += 0.078;
          return target;
        }),
      }),
    );
    supports.update();
    return supports;
  }

  /** Full seated pose, in root space (setup only). */
  private drivingPose(): void {
    const {bike, rotation, spread} = this;
    for (const side of SIDES) {
      const limb = this.limbs[side];
      this.setRootRotation(
        limb.thigh,
        rotation
          .setFromAxisAngle(AXIS, bike ? 2.8 : Math.PI / 2)
          .premultiply(spread.setFromAxisAngle(FORWARD, bike ? (side === 'L' ? -1.1 : 1.1) : 0)),
      );
      this.setRootRotation(limb.shin, rotation.setFromAxisAngle(AXIS, Math.PI));
      this.setRootRotation(limb.foot, limb.footRotation);
      this.setRootRotation(limb.upperArm, rotation.setFromAxisAngle(AXIS, bike ? 1.9 : 2.25));
      this.setRootRotation(limb.forearm, rotation.setFromAxisAngle(AXIS, 1.35));
    }
  }

  /** Sets `bone`'s rotation relative to the character root (setup: refreshes world matrices). */
  private setRootRotation(bone: Bone, quaternion: Quaternion): void {
    const {parentRotation, rootRotation} = this;
    bone.parent!.getWorldQuaternion(parentRotation);
    this.root.getWorldQuaternion(rootRotation);
    bone.quaternion.copy(parentRotation.invert()).multiply(rootRotation).multiply(quaternion);
    bone.updateWorldMatrix(false, true);
  }

  /**
   * The driving sway: upper arms swing with time while the forearms keep their
   * root-space angle. Pure quaternion math on local transforms, so nothing
   * above the character (vehicle, scene) is refreshed per frame.
   */
  private swayArms(time: number, moving: boolean): void {
    const {root, rotation, parentRotation, bike} = this;
    const angle = (bike ? 1.9 : 2.25) + (moving ? Math.sin(time * 1.3) * 0.025 : 0);
    for (const side of SIDES) {
      const {upperArm, forearm} = this.limbs[side];
      rotationIn(root, upperArm.parent!, parentRotation);
      upperArm.quaternion.copy(parentRotation.invert()).multiply(rotation.setFromAxisAngle(AXIS, angle));
      rotationIn(root, upperArm, parentRotation);
      forearm.quaternion.copy(parentRotation.invert()).multiply(rotation.setFromAxisAngle(AXIS, 1.35));
    }
  }
}
