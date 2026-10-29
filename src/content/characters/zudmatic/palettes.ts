import palettes from './palettes.json';

export type ZudmaticColorKey = 'orange' | 'blue' | 'ivory' | 'dark' | 'black' | 'metal';

/** A Zudmatic paint scheme: colors per material key, with optional per-part overrides. */
export interface ZudmaticPalette {
  readonly name: string;
  readonly colors: Readonly<Record<ZudmaticColorKey, string>>;
  readonly parts?: Readonly<Record<string, string>>;
}

export const ZUDMATIC_PALETTES: readonly ZudmaticPalette[] = palettes;

/** Unknown names fall back to the original scheme. */
export const zudmaticPalette = (name: string | null | undefined): ZudmaticPalette =>
  ZUDMATIC_PALETTES.find((palette) => palette.name === name) ?? ZUDMATIC_PALETTES[0];
