export type HatModelId = 'samurai_kasa' | 'cloud_chef' | 'crescent_wizard';

/** A restored hat GLB, in public/models/hats/. */
export interface HatEntry {
  readonly id: HatModelId;
  readonly name: string;
  readonly file: string;
  readonly preview: string;
  readonly triangles: number;
}

/** Fit and finish of the worn hat. `hatModel` is a HatModelId, 'beanie' or 'none'. */
export interface HatSettings {
  hatModel: string;
  hatOffsetX: number;
  hatOffsetY: number;
  hatOffsetZ: number;
  hatYaw: number;
  hatTilt: number;
  hatTint: string;
  hatRoughness: number;
  hatMetalness: number;
  hatAutoFit: boolean;
  hatCrownHeight: number;
  hatSize: number;
  showHat: boolean;
  showPompom?: boolean;
  wireframe?: boolean;
}

type HatDefaults = Omit<HatSettings, 'hatSize' | 'showHat' | 'showPompom' | 'wireframe'>;
type HatPreset = Partial<
  Pick<HatSettings, 'hatOffsetY' | 'hatYaw' | 'hatTilt' | 'hatTint' | 'hatMetalness' | 'hatCrownHeight' | 'hatSize'>
>;

// Triangle counts describe the source GLBs; runtime meshes include repaired surfaces and attached details.
// Final revisions selected by the supplied catalog; earlier exports are not additional hats.
export const HAT_CATALOG: readonly HatEntry[] = [
  {
    id: 'samurai_kasa',
    name: 'Samurai Kasa',
    file: '001_samurai_kasa_detailed_v01.glb',
    preview: '001_samurai_kasa_detailed_v01.jpg',
    triangles: 6728,
  },
  {
    id: 'cloud_chef',
    name: 'Cloud Chef',
    file: '006_cloud_chef_detailed_v03.glb',
    preview: '006_cloud_chef_detailed_v03.jpg',
    triangles: 6416,
  },
  {
    id: 'crescent_wizard',
    name: 'Crescent Wizard',
    file: '007_crescent_wizard_detailed_v01.glb',
    preview: '007_crescent_wizard_detailed_v01.jpg',
    triangles: 3656,
  },
];

export const HAT_DEFAULTS: Readonly<HatDefaults> = Object.freeze({
  hatModel: 'beanie',
  hatOffsetX: 0,
  hatOffsetY: 0,
  hatOffsetZ: 0,
  hatYaw: 0,
  hatTilt: 0,
  hatTint: '#ffffff',
  hatRoughness: 1,
  hatMetalness: 0,
  hatAutoFit: true,
  hatCrownHeight: 1,
});

export const hatAssetUrl = (file: string): string => `${import.meta.env?.BASE_URL ?? '/'}models/hats/${file}`;

/** Path relative to public/, for AssetLoader. */
export const hatAssetPath = (file: string): string => `models/hats/${file}`;

// Approved fits shared by the editor, reset action and scene.
export const HAT_PRESETS: Readonly<Record<HatModelId, HatPreset>> = Object.freeze({
  crescent_wizard: {hatOffsetY: -0.35, hatYaw: 10, hatTilt: 5, hatTint: '#bcc6fb', hatMetalness: 0.58, hatCrownHeight: 1.2, hatSize: 1.07},
  samurai_kasa: {hatOffsetY: -0.35, hatTilt: 2, hatTint: '#fff8e0', hatMetalness: 0.34, hatCrownHeight: 1.2, hatSize: 1.03},
  cloud_chef: {hatOffsetY: -0.35, hatMetalness: 0.35, hatCrownHeight: 1.2, hatSize: 1.04},
});

export const isHatModelId = (id: string | null | undefined): id is HatModelId => HAT_CATALOG.some((hat) => hat.id === id);

export const hatDefaults = (id: string | null | undefined): HatSettings => ({
  ...HAT_DEFAULTS,
  hatSize: 1,
  showHat: true,
  ...(isHatModelId(id) ? HAT_PRESETS[id] : undefined),
  hatModel: isHatModelId(id) || id === 'none' ? id : 'beanie',
});

export interface ZudHat {
  readonly id: string;
  readonly name: string;
}

// Racing keeps the original beanie alongside the three restored alternatives.
export const ZUD_HATS: readonly ZudHat[] = [{id: 'beanie', name: 'Gorro original'}, ...HAT_CATALOG];
export const zudHat = (id: string | null | undefined): ZudHat => ZUD_HATS.find((hat) => hat.id === id) ?? ZUD_HATS[0];
