import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import type {WebGPURenderer} from 'three/webgpu';
import type {WebGLRenderer} from 'three';

export type {GLTF};
export type ProgressCallback = (fraction: number) => void;

export interface LoadOptions {
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

/** Resolves a path relative to `public/`, honouring Vite's base URL. */
export const publicUrl = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;

/**
 * The single entry point for loading content. Every GLB goes through one
 * GLTFLoader configured for Draco, meshopt (incl. KHR_mesh_quantization) and
 * KTX2/Basis textures, so artists can compress any asset without code changes.
 *
 * Bytes are cached per URL; each `gltf()` call parses a fresh scene so callers
 * own (and dispose) their GPU resources independently.
 */
export class AssetLoader {
  private static instance: AssetLoader | null = null;
  static get shared(): AssetLoader {
    return (AssetLoader.instance ??= new AssetLoader());
  }

  private readonly draco = new DRACOLoader().setDecoderPath(publicUrl('draco/'));
  private readonly ktx2 = new KTX2Loader().setTranscoderPath(publicUrl('basis/'));
  private readonly gltfLoader = new GLTFLoader().setDRACOLoader(this.draco).setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(this.ktx2);
  private readonly bytes = new Map<string, Promise<ArrayBuffer>>();
  private ktx2Ready = false;

  /** Must run once the renderer is initialised, before loading KTX2 textures. */
  configure(renderer: WebGPURenderer | WebGLRenderer): void {
    if (this.ktx2Ready) return;
    this.ktx2.detectSupport(renderer);
    this.ktx2Ready = true;
  }

  /** Fetches (once) and parses a GLB/GLTF from `public/`. */
  async gltf(path: string, {onProgress, signal}: LoadOptions = {}): Promise<GLTF> {
    const url = publicUrl(path);
    const data = await this.fetchBytes(url, onProgress, signal);
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    return this.gltfLoader.parseAsync(data, base);
  }

  async json<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(publicUrl(path), {signal});
    if (!response.ok) throw new Error(`${response.status} ${path}`);
    return response.json() as Promise<T>;
  }

  /** Raw bytes, cached per URL (audio files, binary data). */
  arrayBuffer(path: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    return this.fetchBytes(publicUrl(path), undefined, signal);
  }

  /** Drops cached bytes, e.g. after leaving a track. */
  evict(path?: string): void {
    if (path === undefined) this.bytes.clear();
    else this.bytes.delete(publicUrl(path));
  }

  dispose(): void {
    this.bytes.clear();
    this.draco.dispose();
    this.ktx2.dispose();
  }

  private fetchBytes(url: string, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<ArrayBuffer> {
    let request = this.bytes.get(url);
    if (!request) {
      request = download(url, onProgress, signal);
      request.catch(() => this.bytes.delete(url));
      this.bytes.set(url, request);
    } else if (onProgress) {
      request.then(
        () => onProgress(1),
        () => {},
      );
    }
    return request;
  }
}

async function download(url: string, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!onProgress || !total || !response.body) {
    const data = await response.arrayBuffer();
    onProgress?.(1);
    return data;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(Math.min(1, loaded / total));
  }
  const data = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data.buffer;
}
