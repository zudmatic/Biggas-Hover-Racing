// Opt-in local measurement UI. It never drives the vehicle or changes saved
// graphics preferences. Readable results make browser comparisons repeatable.
import type {Renderer} from 'three/webgpu';

/** `window.__desertBenchmark` as published by the flight simulator in dev (fields the review reads). */
export interface DesertBenchmark {
  resetSamples(): void;
  snapshot(): {
    backend?: string;
    viewport: [number, number];
    pixelRatio: number;
    memory: unknown;
    lod: unknown;
  };
}

/** The flight graphics' review hooks (stand-in until the render domain exports its type). */
export interface PerformanceReviewGraphics {
  readonly look: {setOverride(mode: 'base' | 'ps2' | 'jitter'): void; readonly settings: unknown} | null;
  readonly postEnabled: boolean;
  setPostEnabled(value: boolean): void;
}

export interface PerformanceReviewWorld {
  train: {
    readonly active: boolean;
    reset(): void;
    step(dt: number): void;
  };
}

export interface PerformanceReviewOptions {
  app: HTMLElement;
  renderer: Pick<Renderer, 'info'>;
  benchmark: DesertBenchmark;
  graphics: PerformanceReviewGraphics;
  world: PerformanceReviewWorld;
}

interface Sample {
  frameMs: number;
  workMs: number;
  render: Record<string, number>;
}

/** Chromium-only heap counters. */
interface PerformanceWithMemory extends Performance {
  memory?: {usedJSHeapSize: number; totalJSHeapSize: number};
}

const DURATION_MS = 5000;
const RESOURCE_PATTERN = /\/(models\/desert-valley|textures\/|draco\/)/;

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
const percentile = (values: number[], p: number): number => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] ?? 0;

/** Numeric renderer counters at this instant (the review aggregates every numeric field). */
function numericFields(source: object): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) if (typeof value === 'number') out[key] = value;
  return out;
}

/** "Medir 5 s" panel: collects per-frame timings for five seconds and prints a JSON summary. */
export class DesertPerformanceReview {
  private readonly panel = document.createElement('section');
  private readonly button = document.createElement('button');
  private readonly output = document.createElement('pre');
  private readonly app: HTMLElement;
  private readonly renderer: Pick<Renderer, 'info'>;
  private readonly benchmark: DesertBenchmark;
  private readonly graphics: PerformanceReviewGraphics;
  private readonly world: PerformanceReviewWorld;
  private started = 0;
  private rows: Sample[] = [];
  private running = false;

  static mount(options: PerformanceReviewOptions): DesertPerformanceReview {
    return new DesertPerformanceReview(options);
  }

  private constructor({app, renderer, benchmark, graphics, world}: PerformanceReviewOptions) {
    this.app = app;
    this.renderer = renderer;
    this.benchmark = benchmark;
    this.graphics = graphics;
    this.world = world;

    const {panel, button, output} = this;
    panel.className = 'desert-perf-review';
    panel.style.cssText =
      'position:fixed;right:12px;top:12px;z-index:10000;background:#101820eb;color:white;padding:12px;max-width:460px;font:12px monospace';
    button.textContent = 'Medir 5 s';
    output.id = 'desert-perf-result';
    output.style.cssText = 'max-height:58vh;overflow:auto;white-space:pre-wrap';
    output.textContent = 'Listo para medir; calidad fija, DPR 1.';

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin:8px 0';
    const add = (label: string, action: () => void): void => {
      const control = document.createElement('button');
      control.textContent = label;
      control.onclick = action;
      controls.append(control);
    };
    add('Look base', () => graphics.look?.setOverride('base'));
    add('PS2 estable', () => graphics.look?.setOverride('ps2'));
    add('Probar tembleque', () => graphics.look?.setOverride('jitter'));
    add('Post apagado', () => graphics.setPostEnabled(false));
    add('Post encendido', () => graphics.setPostEnabled(true));
    add('Tren en movimiento', () => {
      world.train.reset();
      world.train.step(7.99);
      world.train.step(0.02);
      world.train.step(6);
      this.running = true;
    });
    add('Tren detenido', () => {
      this.running = false;
      world.train.reset();
    });
    panel.append(button, controls, output);
    document.body.append(panel);

    button.onclick = () => {
      this.rows = [];
      this.started = performance.now();
      benchmark.resetSamples();
      button.disabled = true;
      output.textContent = 'Midiendo durante 5 segundos…';
    };
  }

  /** Whether the review set the train moving; the simulator keeps stepping it while true. */
  get trainRunning(): boolean {
    return this.running;
  }

  /** Called once per rendered frame by the simulator. */
  sample(frameMs: number, workMs: number): void {
    if (!this.started) return;
    this.rows.push({frameMs, workMs, render: numericFields(this.renderer.info.render)});
    if (performance.now() - this.started < DURATION_MS) return;
    this.output.textContent = JSON.stringify(this.summarize(), null, 2);
    this.button.disabled = false;
    this.started = 0;
  }

  dispose(): void {
    this.panel.remove();
  }

  private summarize(): object {
    const {app, rows, graphics, world} = this;
    const summary = this.benchmark.snapshot();
    const render: Record<string, {mean: number; max: number}> = {};
    for (const key of Object.keys(rows[0].render)) {
      const values = rows.map((row) => row.render[key]);
      render[key] = {mean: mean(values), max: Math.max(...values)};
    }
    const frameTimes = rows.map((row) => row.frameMs);
    const resources = performance
      .getEntriesByType('resource')
      .filter((entry): entry is PerformanceResourceTiming => RESOURCE_PATTERN.test(entry.name));
    const memory = (performance as PerformanceWithMemory).memory;
    return {
      view: app.dataset.artView,
      backend: summary.backend,
      look: app.dataset.look,
      settings: graphics.look?.settings,
      postEnabled: graphics.postEnabled,
      trainMoving: this.running,
      trainActive: world.train.active,
      viewport: summary.viewport,
      pixelRatio: summary.pixelRatio,
      quality: 'fixed high / 4x MSAA / DPR 1',
      visibility: document.visibilityState,
      userAgent: navigator.userAgent,
      durationMs: performance.now() - this.started,
      frames: rows.length,
      fps: 1000 / mean(frameTimes),
      frameMs: mean(frameTimes),
      p95Ms: percentile(frameTimes, 0.95),
      p99Ms: percentile(frameTimes, 0.99),
      maxFrameMs: Math.max(...frameTimes),
      workMs: mean(rows.map((row) => row.workMs)),
      render,
      memory: summary.memory,
      heap: memory ? {used: memory.usedJSHeapSize, total: memory.totalJSHeapSize} : null,
      lod: summary.lod,
      load: {
        worldReadyMs: Number(app.dataset.worldReadyMs),
        compileMs: Number(app.dataset.compileMs),
        resources: resources.map((entry) => ({
          name: entry.name.split('/').pop(),
          durationMs: entry.duration,
          transferBytes: entry.transferSize,
          encodedBytes: entry.encodedBodySize,
        })),
      },
    };
  }
}

/** Entry point dynamically imported by the flight simulator in dev with `?perfReview`. */
export function mountDesertPerformanceReview(options: PerformanceReviewOptions): DesertPerformanceReview {
  return DesertPerformanceReview.mount(options);
}
