import {Emitter} from './emitter';

export type QualityMode = 'auto' | 'high' | 'performance';

export interface GameSettings {
  /** Graphics preset. `auto` adapts the render scale to the device. */
  quality: QualityMode;
  /** Master sound switch (the M key). */
  soundEnabled: boolean;
  musicVolume: number;
  effectsVolume: number;
  voiceVolume: number;
}

// Storage keys predate this module; keep them so saved preferences survive.
const KEYS: Record<keyof GameSettings, string> = {
  quality: 'biggas-hover-racing-quality',
  soundEnabled: 'biggas-hover-racing-sound',
  musicVolume: 'biggas-hover-racing-music-volume',
  effectsVolume: 'biggas-hover-racing-effects-volume',
  voiceVolume: 'biggas-hover-racing-voice-volume',
};

const DEFAULTS: GameSettings = {
  quality: 'auto',
  soundEnabled: true,
  musicVolume: 0.32,
  effectsVolume: 1,
  voiceVolume: 0.8,
};

const QUALITY_MODES: readonly QualityMode[] = ['auto', 'high', 'performance'];
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function parse<K extends keyof GameSettings>(key: K, raw: string | null): GameSettings[K] | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  switch (key) {
    case 'quality':
      return (QUALITY_MODES.includes(raw as QualityMode) ? raw : undefined) as GameSettings[K] | undefined;
    case 'soundEnabled':
      return (raw !== 'off') as GameSettings[K];
    default: {
      const value = Number(raw);
      return (Number.isFinite(value) ? clamp01(value) : undefined) as GameSettings[K] | undefined;
    }
  }
}

function serialize<K extends keyof GameSettings>(key: K, value: GameSettings[K]): string {
  if (key === 'soundEnabled') return value ? 'on' : 'off';
  return String(value);
}

/** Player preferences persisted in localStorage. Storage failures are ignored. */
export class Settings extends Emitter<{change: {key: keyof GameSettings; settings: Readonly<GameSettings>}}> {
  private values: GameSettings = {...DEFAULTS};

  constructor(private readonly storage: Storage | null = safeStorage()) {
    super();
    for (const key of Object.keys(KEYS) as (keyof GameSettings)[]) {
      const value = parse(key, this.read(KEYS[key]));
      if (value !== undefined) (this.values as unknown as Record<string, unknown>)[key] = value;
    }
  }

  get<K extends keyof GameSettings>(key: K): GameSettings[K] {
    return this.values[key];
  }

  get snapshot(): Readonly<GameSettings> {
    return {...this.values};
  }

  set<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    const next = (typeof value === 'number' ? clamp01(value) : value) as GameSettings[K];
    if (Object.is(this.values[key], next)) return;
    this.values[key] = next;
    try {
      this.storage?.setItem(KEYS[key], serialize(key, next));
    } catch {
      // Private mode or quota: the setting still applies for this session.
    }
    this.emit('change', {key, settings: this.snapshot});
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Shared instance: every screen reads and writes the same preferences. */
export const settings = new Settings();
