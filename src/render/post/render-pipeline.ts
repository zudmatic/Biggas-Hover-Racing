import type {Color, ColorRepresentation, PerspectiveCamera, Scene, Texture} from 'three';
import {PostProcessing, type Node, type PassNode, type UniformNode, type WebGPURenderer} from 'three/webgpu';
import {uniform} from 'three/tsl';
import type {Disposable} from '@/core/disposable';
import type {HeatField} from '@/fx/heat/heat-field';
import type {LensUniforms} from '@/fx/singularity/singularity-lens';

/** Post-processing looks. Add an id here and a factory in pipelines.ts to plug in a new one. */
export type LookId = 'comic' | 'natural';

export type {HeatField} from '@/fx/heat/heat-field';
export type {LensUniforms} from '@/fx/singularity/singularity-lens';

/** The post-processing cost knobs a pipeline compiles into its graph. */
export interface PipelineQuality {
  /** MSAA samples of the scene pass (0 or 4). */
  samples: number;
  /** Glow and paper-halo taps of looks that have them. */
  glowSamples: number;
}

/** Everything a pipeline renders from. */
export interface PipelineContext {
  readonly renderer: WebGPURenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Singularity ships only; without it the graph is unchanged. */
  readonly lens?: LensUniforms | null;
  /** The natural look's desert warmth (0: none); owned by the desert look. */
  readonly warmth?: UniformNode<number>;
}

/** One compiled chain: a scene pass and its output graph, at one quality. */
export class PostChain implements Disposable {
  private readonly post: PostProcessing;

  constructor(
    renderer: WebGPURenderer,
    private readonly scenePass: PassNode,
    /** Heat shimmer sampling this chain's own depth. */
    readonly heat: HeatField,
    output: Node,
  ) {
    this.post = new PostProcessing(renderer);
    this.post.outputColorTransform = false;
    this.post.outputNode = output;
  }

  render(): void {
    this.post.render();
  }

  dispose(): void {
    this.post.dispose();
    this.scenePass.dispose();
  }
}

/**
 * A post-processing look: renders the scene through a pass and grades it to
 * the canvas. Quality changes switch between chains compiled once per quality
 * (MSAA and tap counts are compile-time), kept so switching back is free.
 * Per-frame camera and viewport values are read at render time, so a resize
 * needs no call here.
 */
export abstract class RenderPipeline implements Disposable {
  abstract readonly look: LookId;
  /** 1 prints the comic look over the developed frame, 0 shows the plain frame; looks without a print ignore it. */
  readonly comic = uniform(1);
  readonly lens: LensUniforms | null;

  protected readonly renderer: WebGPURenderer;
  protected readonly scene: Scene;
  protected readonly camera: PerspectiveCamera;

  private readonly chains = new Map<string, PostChain>();
  private quality: PipelineQuality;

  protected constructor(context: PipelineContext, quality: PipelineQuality) {
    this.renderer = context.renderer;
    this.scene = context.scene;
    this.camera = context.camera;
    this.lens = context.lens ?? null;
    this.quality = {...quality};
  }

  get currentQuality(): Readonly<PipelineQuality> {
    return this.quality;
  }

  /** Takes effect on the next frame; a new quality compiles its chain once. */
  setQuality(quality: PipelineQuality): void {
    this.quality = {samples: quality.samples, glowSamples: quality.glowSamples};
  }

  /** The heat field of the current quality's chain (the game feeds it nozzles and pad fields). */
  get heat(): HeatField {
    return this.chain.heat;
  }

  /** Renders the frame; `background` overrides the paper color of looks that print on paper. */
  abstract render(background?: ColorRepresentation): void;

  dispose(): void {
    for (const chain of this.chains.values()) chain.dispose();
    this.chains.clear();
  }

  protected get chain(): PostChain {
    const key = this.qualityKey(this.quality);
    let chain = this.chains.get(key);
    if (!chain) {
      chain = this.createChain(this.quality);
      this.chains.set(key, chain);
    }
    return chain;
  }

  /** Chains are shared between qualities with the same key. */
  protected qualityKey({samples, glowSamples}: PipelineQuality): string {
    return `${samples}/${glowSamples}`;
  }

  protected abstract createChain(quality: PipelineQuality): PostChain;
}

/** Paper color: an explicit override, else the scene's background color, else white. */
export function paperSource(override: ColorRepresentation | undefined, background: Scene['background']): ColorRepresentation {
  return override ?? (isColor(background) ? background : 0xffffff);
}

function isColor(value: Color | Texture | null): value is Color {
  return (value as Partial<Color> | null)?.isColor === true;
}
