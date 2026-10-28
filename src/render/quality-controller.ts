import {Settings, settings as sharedSettings, type QualityMode} from '@/core/settings';

/** Render scale steps the `auto` mode walks down (and back up). */
const SCALES = [1, 0.85, 0.7, 0.6, 0.5] as const;
const MODES: readonly QualityMode[] = ['auto', 'high', 'performance'];

const isQualityMode = (value: unknown): value is QualityMode => MODES.includes(value as QualityMode);

/** What the game applies for the current mode and adaptive level. */
export interface QualitySettings {
  mode: QualityMode;
  /** Render scale applied to the base pixel ratio. */
  scale: number;
  /** Drawing buffer pixel ratio (the HUD and text stay native). */
  pixelRatio: number;
  /** MSAA samples of the scene pass. */
  samples: number;
  /** Comic glow and paper-halo taps. */
  glowSamples: number;
  /** Lighter effects: 4 glow taps, fewer exhaust fragments. */
  lite: boolean;
  /** Seconds between sun shadow-map updates (0: every frame). */
  shadowInterval: number;
}

/** Where the mode persists: the shared player settings by default. */
export type QualityPreferences = Pick<Settings, 'get' | 'set'>;

export interface QualityControllerOptions {
  /** Viewport size in CSS px. */
  width: number;
  height: number;
  /** Device pixel ratio. */
  pixelRatio?: number;
  mobile?: boolean;
  onChange?: (settings: QualitySettings) => void;
  preferences?: QualityPreferences;
}

/**
 * Picks the 3D drawing buffer's resolution and post-processing cost.
 * `high` and `performance` are fixed presets; `auto` measures frame times and
 * steps the render scale down when frames are slow and back up after a long
 * fast stretch. Keep HUD/text at native resolution; only resize the 3D
 * drawing buffer. Long windows and a slower recovery prevent flicker and
 * resolution oscillation.
 */
export class QualityController {
  private currentMode: QualityMode;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private readonly mobile: boolean;
  private readonly onChange: (settings: QualitySettings) => void;
  private readonly preferences: QualityPreferences;
  private level = 0;
  private elapsed = 0;
  private total = 0;
  private frames = 0;
  private slow = 0;
  private fastWindows = 0;
  private cooldown = 2000;
  private measuredFps = 0;
  private stalls = 0;

  constructor({
    width,
    height,
    pixelRatio = 1,
    mobile = false,
    onChange = () => {},
    preferences = sharedSettings,
  }: QualityControllerOptions) {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.mobile = mobile;
    this.onChange = onChange;
    this.preferences = preferences;
    this.currentMode = preferences.get('quality');
  }

  get mode(): QualityMode {
    return this.currentMode;
  }

  /** Average fps of the last measured window (0 until one completes). */
  get fps(): number {
    return this.measuredFps;
  }

  get settings(): QualitySettings {
    const {mobile, pixelRatio, currentMode: mode} = this;
    const base = Math.min(pixelRatio, mobile ? 1.25 : 1.5, Math.sqrt((mobile ? 900000 : 1600000) / Math.max(1, this.width * this.height)));
    const scale = mode === 'high' ? 1 : mode === 'performance' ? 0.7 : SCALES[this.level];
    return {
      mode,
      scale,
      pixelRatio: mode === 'high' ? Math.min(pixelRatio, 1.5) : base * scale,
      samples: mode === 'high' ? 4 : 0,
      glowSamples: mode === 'high' ? 12 : 4,
      lite: mode === 'performance' || (mode === 'auto' && this.level >= 3),
      shadowInterval: mode === 'high' ? 0 : 1 / 30,
    };
  }

  /** Switches and persists the mode; unknown values are ignored. */
  setMode(next: string): void {
    if (!isQualityMode(next)) return;
    this.currentMode = next;
    this.level = 0;
    this.reset(2000);
    this.preferences.set('quality', next);
    this.publish();
  }

  resize(width: number, height: number, pixelRatio = this.pixelRatio): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.reset();
    this.publish();
  }

  /** Discards the current measurement and waits `wait` ms before measuring again. */
  reset(wait = 1200): void {
    this.stalls = 0;
    this.elapsed = this.total = this.frames = this.slow = this.fastWindows = 0;
    this.cooldown = wait;
  }

  /** Feeds one frame time (ms). */
  sample(milliseconds: number): void {
    // Loading, a background tab, and a lone long task are not a GPU benchmark.
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
    if (milliseconds > 250) {
      if (++this.stalls < 3) return;
      milliseconds = Math.min(milliseconds, 1000);
    } else this.stalls = 0;
    if (this.cooldown > 0) {
      this.cooldown -= milliseconds;
      return;
    }
    this.elapsed += milliseconds;
    this.total += milliseconds;
    this.frames++;
    if (milliseconds > 22) this.slow++;
    if (this.elapsed < 1000 || this.frames < 8) return;
    const average = this.total / this.frames;
    this.measuredFps = Math.round(1000 / average);
    if (this.currentMode === 'auto') {
      if ((average > 20 || this.slow / this.frames > 0.25) && this.level < SCALES.length - 1) {
        this.level++;
        this.reset(1500);
        this.publish();
        return;
      }
      this.fastWindows = average < 15.5 && this.slow === 0 ? this.fastWindows + 1 : 0;
      if (this.fastWindows >= 12 && this.level > 0) {
        this.level--;
        this.reset(5000);
        this.publish();
        return;
      }
    }
    this.elapsed = this.total = this.frames = this.slow = 0;
  }

  private publish(): void {
    this.onChange(this.settings);
  }
}

export interface FlightPerformanceOptions extends Omit<QualityControllerOptions, 'preferences'> {
  /** Storage for the saved mode (the shared settings' localStorage by default). */
  storage?: Storage | null;
}
