import {Box3, Group, Vector3} from 'three';
import {AssetLoader, type GLTF} from '@/core/assets/asset-loader';
import {Character, type CharacterDefinition, type CharacterOptions} from '../character';
import {isMesh, ModelResources} from '../shared/object-guards';

/** The supplied creature is a rigid sculpture, not a humanoid skeleton.
 * Seat its bilobed base directly on the cushion and retain the authored wings.
 * The GLB is +Y up / +Z forward, matching the Bulldog without a yaw correction.
 */
export class KerryCharacter extends Character {
  readonly model: Group;

  static async load(definition: CharacterDefinition, options: CharacterOptions) {
    const gltf = await AssetLoader.shared.gltf('models/mr-kerry-capija/mr-kerry-capija.glb');
    return new KerryCharacter(definition, gltf, options);
  }

  constructor(definition: CharacterDefinition, gltf: GLTF, {seated, seat = 'cockpit', offset = [0, 0, 0]}: CharacterOptions) {
    super(definition);
    this.model = gltf.scene;
    const resources = this.resources.add(new ModelResources());
    this.model.traverse(object => {
      if (!isMesh(object)) return;
      resources.addMesh(object);
      object.castShadow = true;
      object.receiveShadow = true;
      object.userData.system = 'cockpit';
    });
    const bounds = new Box3().setFromObject(this.model, true);
    const height = bounds.getSize(new Vector3()).y;
    const scale = (seated ? 2.5 : 3.2) / height;
    this.model.scale.setScalar(scale);
    // Keep the base centered in X/Z, with its lowest point on the seat/floor.
    this.model.position.set(-(bounds.min.x + bounds.max.x) * scale / 2, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) * scale / 2);
    this.root.add(this.model);
    if (seated) this.root.position.fromArray(offset);
    this.root.userData.fit = seated ? seat : 'standing';
    this.root.userData.rigid = true;
    this.root.updateMatrixWorld(true);
  }

  // Preserve the supplied sculpture; no fabricated skeletal animation.
  update(_time = 0, _moving = false): void {}
}
