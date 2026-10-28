/** Eye shape and gaze. Ranges below clamp every editable value. */
export interface EyeSettings {
  eyeOpening: number;
  eyeTilt: number;
  pupilSize: number;
  gazeX: number;
  gazeY: number;
  eyeDepth: number;
  eyeBlink: boolean;
}

export type EyeShapeKey = Exclude<keyof EyeSettings, 'eyeBlink'>;

export const EYE_DEFAULTS: Readonly<EyeSettings> = Object.freeze({
  eyeOpening: 0.58,
  eyeTilt: 30,
  pupilSize: 1.12,
  gazeX: 0,
  gazeY: 0,
  eyeDepth: 0.018,
  eyeBlink: true,
});

export const EYE_RANGES: Readonly<Record<EyeShapeKey, readonly [min: number, max: number]>> = {
  eyeOpening: [0, 1],
  eyeTilt: [-15, 40],
  pupilSize: [0.5, 1.5],
  gazeX: [-1, 1],
  gazeY: [-1, 1],
  eyeDepth: [0, 0.05],
};
