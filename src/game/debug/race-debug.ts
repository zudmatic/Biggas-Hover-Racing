import type {Disposable} from '@/core/disposable';
import type {DesertLod} from '@/content/tracks/desert-valley/desert-lod';
import type {HoverState} from '@/sim/hover-state';

/** What the debug API can read from a running race. */
export interface RaceDebugTarget {
  readonly backend: string;
  readonly phase: string;
  readonly look: string;
  readonly state: HoverState;
  readonly viewport: [number, number];
  readonly pixelRatio: number;
  readonly quality: unknown;
  readonly renderInfo: {render: Record<string, number>; memory: Record<string, number>};
  readonly lod?: DesertLod;
  teleport(x: number, z: number, yaw: number): void;
  overview(): void;
}

/**
 * Development-only window hooks for profiling scripts and the console:
 * `window.__game` (live race introspection) and `window.__desertBenchmark`
 * (kept for scripts/benchmark-desert.mjs). Production builds never create it,
 * and nothing here writes to the DOM per frame.
 */
export class RaceDebug implements Disposable {
  private readonly frameTimes = new Float64Array(1200);
  private cursor = 0;
  private samples = 0;

  constructor(private readonly target: RaceDebugTarget) {
    const api = {
      get state() {
        return target.state;
      },
      get phase() {
        return target.phase;
      },
      snapshot: () => this.snapshot(),
      resetSamples: () => this.resetSamples(),
      setLodMode: (mode: string) => {
        target.lod?.setMode(mode);
        target.lod?.update(target.state, 0, true);
      },
      teleport: (x: number, z: number, yaw = 0) => target.teleport(x, z, yaw),
      overview: () => target.overview(),
    };
    Object.assign(window, {__game: api, __desertBenchmark: api});
  }

  /** Records one frame's duration in milliseconds. */
  sample(milliseconds: number): void {
    this.frameTimes[this.cursor] = milliseconds;
    this.cursor = (this.cursor + 1) % this.frameTimes.length;
    this.samples = Math.min(this.samples + 1, this.frameTimes.length);
  }

  resetSamples(): void {
    this.frameTimes.fill(0);
    this.cursor = this.samples = 0;
  }

  snapshot() {
    const {target} = this;
    const values = Array.from(this.frameTimes.subarray(0, this.samples)).sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    return {
      backend: target.backend,
      look: target.look,
      quality: target.quality,
      viewport: target.viewport,
      pixelRatio: target.pixelRatio,
      frames: values.length,
      fps: 1000 / mean,
      frameMs: mean,
      p95Ms: values[Math.floor((values.length - 1) * 0.95)] ?? 0,
      render: {...target.renderInfo.render},
      memory: {...target.renderInfo.memory},
      lod: target.lod ? {...target.lod.stats, levels: [...target.lod.stats.levels]} : null,
      position: [target.state.x, target.state.y, target.state.z],
    };
  }

  dispose(): void {
    const scope = window as unknown as Record<string, unknown>;
    delete scope.__game;
    delete scope.__desertBenchmark;
  }
}
