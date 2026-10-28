import type {Node} from 'three/webgpu';
import {Fn, float, floor, fract, mix, sin, vec2, vec3} from 'three/tsl';

/** Classic sine hash of a 3D point, in [0, 1). */
export const hash3 = Fn(([p]: [Node]) => fract(sin(p.dot(vec3(12.9898, 78.233, 37.719))).mul(43758.5453)));

/** Trilinear value noise over hash3 with a smoothstep fade, in [0, 1). */
export const valueNoise3 = Fn(([p]: [Node]) => {
  const i = floor(p);
  const f = fract(p);
  const s = f.mul(f).mul(float(3).sub(f.mul(2)));
  const plane = (z: number) =>
    mix(
      mix(hash3(i.add(vec3(0, 0, z))), hash3(i.add(vec3(1, 0, z))), s.x),
      mix(hash3(i.add(vec3(0, 1, z))), hash3(i.add(vec3(1, 1, z))), s.x),
      s.y,
    );
  return mix(plane(0), plane(1), s.z);
});

/**
 * Interleaved gradient noise of a pixel coordinate, in [0, 1): static grain
 * without the precision loss sine hashes show at large pixel coordinates.
 */
export function interleavedGradientNoise(pixel: Node): Node {
  return fract(fract(pixel.dot(vec2(0.06711056, 0.00583715))).mul(52.9829189));
}
