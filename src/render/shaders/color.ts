import {ACESFilmicToneMapping, Color, SRGBColorSpace, type ColorRepresentation} from 'three';
import type {Node} from 'three/webgpu';
import {color as tslColor, toneMapping, vec3, vec4, workingToColorSpace} from 'three/tsl';

// Color building blocks shared by the post pipelines and materials.
// Colors must use tslColor: vec3(Color) reads x/y/z rather than r/g/b.

/** Rec. 709 luma of a linear color. */
export function luma709(color: Node): Node {
  return color.dot(vec3(0.2126, 0.7152, 0.0722));
}

/** Rec. 601 luma, as the GLSL print pass measures sRGB-encoded color. */
export function luma601(color: Node): Node {
  return color.dot(vec3(0.299, 0.587, 0.114));
}

/** Linear working color to sRGB-encoded rgb. */
export function toSRGB(color: Node): Node {
  return workingToColorSpace(vec4(color.rgb, 1), SRGBColorSpace).rgb;
}

/** three's own ACES filmic curve, so post passes match the renderer's tone mapping. */
export function acesFilmic(exposure: Node, hdr: Node): Node {
  return toneMapping(ACESFilmicToneMapping, exposure, hdr);
}

/** Straight color of a premultiplied scene sample (alpha floored against division by zero). */
export function unpremultiply(sample: Node): Node {
  return sample.rgb.div(sample.a.max(0.001));
}

/** A color as an sRGB-encoded constant, for passes that blend after the sRGB encode. */
export function srgbConstant(value: ColorRepresentation): Node {
  return tslColor(new Color(value).convertLinearToSRGB());
}
