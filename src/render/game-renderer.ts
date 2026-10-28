import {WebGPURenderer} from 'three/webgpu';
import {usePortableInstanceBuffers} from './three-fixes';
import {AssetLoader} from '@/core/assets/asset-loader';
import type {Disposable} from '@/core/disposable';

export type RenderBackend = 'WebGPU' | 'WebGL2';
export type GameRendererOptions = NonNullable<ConstructorParameters<typeof WebGPURenderer>[0]>;

declare global {
  interface Window {
    /** Development handle for scripts and the console. */
    __renderer?: WebGPURenderer;
  }
}

/** True when the renderer runs on the WebGPU backend (false on the WebGL2 fallback). */
export function isWebGPUBackend(renderer: WebGPURenderer): boolean {
  return (renderer.backend as {isWebGPUBackend?: boolean}).isWebGPUBackend === true;
}

/**
 * Every production view uses the same node renderer. WebGL2 is its fallback,
 * not a separate set of shaders or gameplay effects.
 */
export class GameRenderer implements Disposable {
  /** Dispatched on the canvas when the GPU device is lost (not when it's disposed). */
  static readonly DEVICE_LOST_EVENT = 'graphicslost';

  /** Creates and initializes the renderer; `?renderer=webgl2` forces the fallback. */
  static async create(canvas: HTMLCanvasElement, options: GameRendererOptions = {}): Promise<GameRenderer> {
    usePortableInstanceBuffers();
    const renderer = new WebGPURenderer({
      canvas,
      antialias: true,
      forceWebGL: new URLSearchParams(location.search).get('renderer') === 'webgl2',
      ...options,
    });
    try {
      await renderer.init();
      AssetLoader.shared.configure(renderer);
    } catch (error) {
      renderer.dispose();
      throw error;
    }
    return new GameRenderer(canvas, renderer);
  }

  readonly backend: RenderBackend;

  private constructor(
    readonly canvas: HTMLCanvasElement,
    readonly renderer: WebGPURenderer,
  ) {
    this.backend = isWebGPUBackend(renderer) ? 'WebGPU' : 'WebGL2';
    if (import.meta.env.DEV) window.__renderer = renderer;
    canvas.dataset.backend = this.backend;
    renderer.onDeviceLost = (info) => {
      if (info.reason !== 'destroyed') canvas.dispatchEvent(new Event(GameRenderer.DEVICE_LOST_EVENT));
    };
  }

  get isWebGPU(): boolean {
    return this.backend === 'WebGPU';
  }

  setPixelRatio(ratio: number): void {
    this.renderer.setPixelRatio(ratio);
  }

  /** Resizes the canvas (CSS px); the drawing buffer follows the pixel ratio. */
  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
