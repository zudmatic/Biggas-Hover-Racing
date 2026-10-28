import type {ColorRepresentation, Mesh, PerspectiveCamera, Scene} from 'three';
import type {WebGPURenderer} from 'three/webgpu';
import type {Disposable} from '@/core/disposable';
import {ComicMaterials, createComicStyle, type ComicStyle} from './materials/comic-materials';
import {ComicPipeline} from './post/comic-post';
import type {HeatField, LensUniforms} from './post/render-pipeline';
import {asSurface, isMesh, materialList} from './scene-utils';
import {preventShadowVersionChurn} from './three-fixes';

export interface ComicViewOptions {
  samples?: number;
  glowSamples?: number;
  lens?: LensUniforms | null;
}

/**
 * The comic print for UI scenes (lobby previews, hangar). Preview actors, hats
 * and palettes can arrive after the first frame: new surfaces are bound lazily
 * and the authored materials are restored after each render for the UI.
 */
export class ComicView implements Disposable {
  readonly style: ComicStyle = createComicStyle();
  private readonly materials: ComicMaterials;
  private readonly pipeline: ComicPipeline;
  private readonly hidden: [Mesh, boolean][] = [];

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly scene: Scene,
    camera: PerspectiveCamera,
    {samples = 4, glowSamples = 12, lens = null}: ComicViewOptions = {},
  ) {
    preventShadowVersionChurn(scene);
    this.materials = new ComicMaterials(scene, this.style);
    this.pipeline = new ComicPipeline({renderer, scene, camera, lens}, {samples, glowSamples});
  }

  get heat(): HeatField {
    return this.pipeline.heat;
  }

  /** Renders one frame; `enabled` false shows the plain developed frame on the same paper. */
  async render(enabled = true, background?: ColorRepresentation): Promise<void> {
    const {materials, style, renderer, hidden} = this;
    materials.refresh();
    materials.setEnabled(enabled);
    materials.sync();
    style.pixelRatio.value = renderer.getPixelRatio();
    renderer.getDrawingBufferSize(style.resolution.value);
    // Custom GLSL can't render through the node pipeline.
    hidden.length = 0;
    this.scene.traverse((object) => {
      if (isMesh(object) && materialList(object.material).some((material) => asSurface(material).isShaderMaterial)) {
        hidden.push([object, object.visible]);
        object.visible = false;
      }
    });
    this.pipeline.comic.value = Number(enabled);
    try {
      this.pipeline.render(background);
    } finally {
      materials.setEnabled(false);
      for (const [mesh, visible] of hidden) mesh.visible = visible;
    }
  }

  dispose(): void {
    this.materials.dispose();
    this.pipeline.dispose();
  }
}
