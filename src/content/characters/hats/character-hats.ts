import * as THREE from 'three';
import {AssetLoader} from '@/core/assets/asset-loader';
import type {Disposable} from '@/core/disposable';
import {HAT_CATALOG, hatAssetPath, type HatSettings} from './hat-catalog';
import {isMesh} from './hat-attachments';
import {refineHat, fitHatToHead, type HatOriginalFinish} from './hat-refinements';

/** What CharacterHats reports after every load transition. */
export interface HatState {
  state: 'ready' | 'loading' | 'error';
  /** Hat currently shown: a hat id, 'beanie' or 'none'. */
  active: string;
  requested: string | null;
  error: unknown;
}

export interface CharacterHatsOptions {
  onChange?: (state: HatState) => void;
  /** Loads a hat GLB by its path relative to public/. */
  load?: (path: string) => Promise<{scene: THREE.Object3D}>;
}

const isTexture = (value: unknown): value is THREE.Texture =>
  typeof value === 'object' && value !== null && (value as THREE.Texture).isTexture === true;

const isStandardMaterial = (material: THREE.Material): material is THREE.MeshStandardMaterial =>
  (material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;

const materialList = (material: THREE.Material | THREE.Material[]): THREE.Material[] => (Array.isArray(material) ? material : [material]);

function disposeHat(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((mesh) => {
    if (!isMesh(mesh)) return;
    geometries.add(mesh.geometry);
    for (const material of materialList(mesh.material)) {
      materials.add(material);
      for (const value of Object.values(material) as unknown[]) if (isTexture(value)) textures.add(value);
    }
  });
  geometries.forEach((value) => value.dispose());
  materials.forEach((value) => value.dispose());
  textures.forEach((value) => value.dispose());
}

/** Every standard material of a refined hat (all of them are). */
function forEachHatMaterial(root: THREE.Object3D, callback: (material: THREE.MeshStandardMaterial) => void): void {
  root.traverse((mesh) => {
    if (!isMesh(mesh)) return;
    for (const material of materialList(mesh.material)) if (isStandardMaterial(material)) callback(material);
  });
}

// Authored in Zud root coordinates (+Y up, +Z front). Refined models stay in
// those coordinates; adjustments pivot at the head and retain a fitted opening.
// The anchor can follow the lab's head proportions without altering GLB roots.
export class CharacterHats implements Disposable {
  readonly anchor = new THREE.Group();
  private readonly mount = new THREE.Group();
  private readonly beanie: THREE.Object3D | undefined;
  private readonly head: THREE.Mesh | undefined;
  private readonly pivot = new THREE.Vector3(0, 0.49, 0);
  private readonly tint = new THREE.Color();
  private readonly onChange: (state: HatState) => void;
  private readonly load: (path: string) => Promise<{scene: THREE.Object3D}>;
  private current: THREE.Group | null = null;
  private requested: string | null = null;
  private revision = 0;
  private disposed = false;
  private settings: HatSettings | undefined;
  private state: HatState['state'] = 'ready';
  private active = 'beanie';
  private lastFit = '';

  constructor(
    model: {root: THREE.Object3D},
    {onChange = () => {}, load = (path) => AssetLoader.shared.gltf(path)}: CharacterHatsOptions = {},
  ) {
    this.onChange = onChange;
    this.load = load;
    this.anchor.name = 'Sombreros de Zud';
    this.anchor.add(this.mount);
    model.root.add(this.anchor);
    this.beanie = model.root.getObjectByName('Beanie de Zud');
    const head = model.root.getObjectByName('Cabeza de Zud');
    this.head = head && isMesh(head) ? head : undefined;
  }

  async update(next: HatSettings): Promise<void> {
    if (this.disposed) return;
    const settings = (this.settings = {...next});
    this.apply();
    if (this.requested === settings.hatModel) return;
    const requested = (this.requested = settings.hatModel);
    const token = ++this.revision;
    this.clear();
    this.active = requested === 'none' ? 'none' : 'beanie';
    const entry = HAT_CATALOG.find((hat) => hat.id === requested);
    this.state = entry ? 'loading' : 'ready';
    this.apply();
    this.report();
    if (!entry) return;
    try {
      const gltf = await this.load(hatAssetPath(entry.file));
      if (this.disposed || token !== this.revision) {
        disposeHat(gltf.scene);
        return;
      }
      let current: THREE.Group;
      try {
        current = refineHat(gltf.scene, entry.id);
      } finally {
        disposeHat(gltf.scene);
      }
      this.current = current;
      current.name = entry.name;
      current.traverse((mesh) => {
        if (!isMesh(mesh)) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      forEachHatMaterial(current, (material) => {
        const original: HatOriginalFinish = {color: material.color.clone(), roughness: material.roughness, metalness: material.metalness};
        material.userData.hatOriginal = original;
      });
      this.mount.add(current);
      this.active = entry.id;
      this.state = 'ready';
      this.apply();
      this.report();
    } catch (error) {
      if (this.disposed || token !== this.revision) return;
      this.clear();
      this.active = 'beanie';
      this.state = 'error';
      this.apply();
      this.report(error);
    }
  }

  /** Reloads the last requested hat, e.g. after a network error. */
  retry(): Promise<void> {
    this.requested = null;
    return this.settings ? this.update(this.settings) : Promise.resolve();
  }

  dispose(): void {
    this.disposed = true;
    this.revision++;
    this.clear();
    this.anchor.removeFromParent();
  }

  private apply(): void {
    const {settings, beanie, mount, pivot, head, current} = this;
    if (!settings) return;
    if (beanie) {
      beanie.visible = settings.showHat && this.active === 'beanie';
      beanie.scale.setScalar(settings.hatSize);
      const pompom = beanie.getObjectByName('Pompón');
      // An unset flag leaves the pompom visible, as the renderer treats it.
      if (pompom) pompom.visible = settings.showPompom !== false;
    }
    this.anchor.visible = settings.showHat;
    mount.scale.setScalar(settings.hatSize);
    mount.rotation.set(THREE.MathUtils.degToRad(settings.hatTilt), THREE.MathUtils.degToRad(settings.hatYaw), 0, 'YXZ');
    mount.position.copy(pivot).sub(pivot.clone().multiplyScalar(settings.hatSize).applyQuaternion(mount.quaternion));
    mount.position.add(new THREE.Vector3(settings.hatOffsetX, settings.hatOffsetY, settings.hatOffsetZ));
    if (current && head) {
      const fitKey = JSON.stringify([
        settings.hatSize,
        settings.hatTilt,
        settings.hatYaw,
        settings.hatOffsetX,
        settings.hatOffsetY,
        settings.hatOffsetZ,
        settings.hatAutoFit,
        settings.hatCrownHeight,
        ...head.scale.toArray(),
        head.geometry.uuid,
      ]);
      if (fitKey !== this.lastFit) {
        fitHatToHead(current, mount, this.anchor, head, {
          autoFit: settings.hatAutoFit !== false,
          crownHeight: settings.hatCrownHeight ?? 1,
        });
        this.lastFit = fitKey;
      }
    }
    this.tint.set(settings.hatTint);
    if (!current) return;
    forEachHatMaterial(current, (material) => {
      const original = material.userData.hatOriginal as HatOriginalFinish;
      material.color.copy(original.color).multiply(this.tint);
      material.roughness = original.roughness * settings.hatRoughness;
      material.metalness = THREE.MathUtils.lerp(original.metalness, 1, settings.hatMetalness);
      material.wireframe = Boolean(settings.wireframe);
    });
  }

  private report(error: unknown = null): void {
    this.onChange({state: this.state, active: this.active, requested: this.requested, error});
  }

  private clear(): void {
    this.lastFit = '';
    if (this.current) {
      this.mount.remove(this.current);
      disposeHat(this.current);
      this.current = null;
    }
  }
}
