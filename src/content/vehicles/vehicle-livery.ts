import {Source, type Color, type Object3D, type Texture} from 'three';
import type {Disposable} from '@/core/disposable';
import {asSurface, isMesh, materialList, type SurfaceMaterial} from '@/render/scene-utils';

export interface VehiclePaint {
  readonly materials: readonly string[];
  readonly variants: readonly {id: string; name: string; colors: readonly string[]}[];
}

/** Retain the authored wear while removing its hue, in linear light. */
function neutralPaintMap(source: Texture): Texture {
  const canvas = document.createElement('canvas');
  const image = source.image as HTMLImageElement;
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('No se pudo preparar la pintura de la nave.');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const linear = Array.from({length: 256}, (_, i) => {
    const c = i / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = (i: number): number => linear[data[i]] * 0.2126 + linear[data[i + 1]] * 0.7152 + linear[data[i + 2]] * 0.0722;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) total += luminance(i);
  const mean = Math.max(total / (data.length / 4), 0.001);
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.min(1, (luminance(i) / mean) * 0.8);
    const srgb = Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
    data[i] = data[i + 1] = data[i + 2] = srgb;
  }
  context.putImageData(pixels, 0, 0);
  const texture = source.clone();
  // Texture.clone shares Source; replacing it keeps the original pixels intact.
  texture.source = new Source(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Live paint on the same material objects used by the vehicle's static batches. */
export class VehicleLivery implements Disposable {
  private readonly materials = new Map<SurfaceMaterial, {index: number; map: Texture | null; color: Color}>();
  private readonly maps = new Map<Texture, Texture>();

  constructor(private readonly root: Object3D, private readonly paint?: VehiclePaint) {
    if (!paint) return;
    root.traverse((mesh) => {
      if (!isMesh(mesh)) return;
      for (const raw of materialList(mesh.material)) {
        const material = asSurface(raw);
        const index = paint.materials.indexOf(material.name);
        if (index >= 0 && material.color && !this.materials.has(material)) {
          this.materials.set(material, {index, map: material.map ?? null, color: material.color.clone()});
        }
      }
    });
  }

  set(id?: string | null): string {
    const livery = this.paint?.variants.find((variant) => variant.id === id);
    const selected = livery?.id ?? 'original';
    this.root.userData.livery = selected;
    for (const [material, original] of this.materials) {
      const previous = material.map;
      if (selected === 'original' || !livery) {
        material.map = original.map;
        material.color?.copy(original.color);
      } else {
        if (original.map && !this.maps.has(original.map)) this.maps.set(original.map, neutralPaintMap(original.map));
        material.map = original.map ? this.maps.get(original.map)! : null;
        material.color?.set(livery.colors[original.index]);
      }
      if (material.map !== previous) material.needsUpdate = true;
    }
    return selected;
  }

  dispose(): void {
    this.set('original');
    // Source textures belong to the model's ResourceSet, derived maps to this controller.
    for (const neutral of this.maps.values()) neutral.dispose();
    this.maps.clear();
    this.materials.clear();
  }
}
