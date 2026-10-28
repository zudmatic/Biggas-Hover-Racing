import {Box3, BoxGeometry, Matrix4, Mesh, Vector3, type Object3D} from 'three';
import type {SeatFit} from '@/core/types';
import {Character, type CharacterDefinition, type CharacterOptions} from '../character';
import {isMesh, positionsOf} from '../shared/object-guards';
import {SaddleSupports} from '../shared/pilot-supports';
import {ControlExtensions, matrixIn, positionIn} from '../shared/seating';
import {ZudModel} from './zud-model';
import {ZudWardrobe} from './zud-wardrobe';

/**
 * Zud, with his wardrobe. Standing for menus, or seated: the original chair is
 * sized for a conventional pilot. Zud keeps his proportions; adjustable
 * control extensions and a footrest accommodate his short limbs.
 */
export class ZudCharacter extends Character {
  readonly model: ZudModel;
  readonly wardrobe: ZudWardrobe;
  /** Null when standing. */
  readonly seat: SeatFit | null;
  private readonly controls: ControlExtensions | null = null;
  private readonly supports: SaddleSupports | null = null;
  private readonly hand = new Vector3();
  private lastTime = -1;

  /** Builds Zud and waits for the requested hat (default: the beanie). */
  static async create(definition: CharacterDefinition, options: CharacterOptions): Promise<ZudCharacter> {
    const character = new ZudCharacter(definition, options);
    try {
      await character.setHat(options.hat ?? 'beanie');
    } catch (error) {
      character.dispose();
      throw error;
    }
    return character;
  }

  constructor(definition: CharacterDefinition, {seated, seat = 'cockpit', offset = [0, 0, 0]}: CharacterOptions) {
    super(definition);
    const model = (this.model = this.resources.add(new ZudModel({detail: 'medium', curve: 0, comic: false})));
    this.wardrobe = model.own(
      new ZudWardrobe(model, (hat) => {
        this.root.userData.hat = hat;
      }),
    );
    const root = this.root;
    root.add(model.root);
    this.seat = seated ? seat : null;
    if (!seated) return;

    const bike = seat === 'saddle';
    root.name = 'Zud al mando';
    root.position.fromArray(offset);
    root.userData.fit = seat;
    const zud = model.root;
    zud.scale.setScalar(bike ? 0.48 : 0.36);
    zud.position.set(0, bike ? 1.68 : 1.31, bike ? 0.04 : -0.24);
    model.feet.forEach((hip, i) => {
      hip.rotation.set(bike ? -0.9 : -1.52, 0, bike ? (i ? 0.95 : -0.95) : i ? -0.06 : 0.06);
      model.rig.knees[i].rotation.x = bike ? 0.95 : 0.85;
    });
    if (bike) {
      this.supports = this.resources.add(
        new SaddleSupports(root, {
          hands: model.rig.hands.map((hand) => (target: Vector3) => positionIn(root, hand, target)),
          soles: model.feet.map((hip) => this.soleOf(hip.getObjectByName('Pierna'))),
        }),
      );
    } else {
      const controls = (this.controls = this.resources.add(
        new ControlExtensions(root, {
          sides: [-1, 1],
          rodName: 'Extensión del control',
          gripName: 'Agarre de pilotaje',
        }),
      ));
      const restGeometry = this.resources.add(new BoxGeometry(0.43, 0.035, 0.1));
      const footrest = new Mesh(restGeometry, controls.steel);
      footrest.name = 'Reposapiés del piloto';
      footrest.position.set(0, 0.875, -0.115);
      root.add(footrest);
    }
    root.traverse((mesh) => {
      if (!isMesh(mesh)) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.system = 'cockpit';
    });
    this.update();
    // The legs are posed once; their footrests never need re-fitting.
    this.supports?.updateFeet();
  }

  override setHat(id: string): Promise<void> {
    return this.wardrobe.setHat(id);
  }

  update(time = 0, moving = false): void {
    if (this.seat === null) return;
    const t = moving ? time : 0;
    if (t === this.lastTime) return;
    this.lastTime = t;
    const {model, root, hand} = this;
    const bike = this.seat === 'saddle';
    for (let i = 0; i < model.arms.length; i++) {
      model.arms[i].rotation.set(
        (bike ? -1.55 : -1.35) + Math.sin(t * 1.3 + i) * 0.045 * Number(moving),
        0,
        bike ? (i ? 0.35 : -0.35) : i ? -0.22 : 0.22,
      );
      model.rig.elbows[i].rotation.x = -0.3;
    }
    model.rig.update();
    const blink = t % 4.8;
    model.eyeController.pose(moving && blink > 4.55 ? 1 - Math.sin(((blink - 4.55) / 0.25) * Math.PI) : 1, 1 / 60);
    this.supports?.updateHands();
    if (this.controls) {
      for (let i = 0; i < model.rig.hands.length; i++) this.controls.reach(i, positionIn(root, model.rig.hands[i], hand));
    }
  }

  /** Bottom centre of a leg's sole, in pilot space so roll/yaw never move the supports. */
  private soleOf(leg: Object3D | undefined): (target: Vector3) => Vector3 {
    if (!leg || !isMesh(leg)) throw new Error('Zud: falta la pierna');
    const matrix = new Matrix4(),
      box = new Box3(),
      point = new Vector3();
    return (target) => {
      matrixIn(this.root, leg, matrix);
      box.makeEmpty();
      const positions = positionsOf(leg.geometry);
      for (let i = 0; i < positions.count; i++) box.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(matrix));
      return target.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
    };
  }
}
