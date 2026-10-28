import type {Node} from 'three/webgpu';
import {float, fract, smoothstep, vec2} from 'three/tsl';

// Halftone screens shared by the comic materials (surface ink) and the comic
// post pass (paper dots). Same math as surface-halftone.ts's GLSL.

/** Rotates a 2D point into a screen's grid axes (angle in degrees). */
export function rotateToGrid(point: Node, angleDegrees: number): Node {
  const angle = (angleDegrees * Math.PI) / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec2(point.dot(vec2(c, s)), point.dot(vec2(-s, c)));
}

/** Layers vanish smoothly as their coverage goes to zero. */
export function coverageFade(coverage: Node): Node {
  return smoothstep(0.005, 0.04, coverage);
}

/** 1 inside the round dot of `radius` (in cells) centered on each grid cell; `aa` is the edge width. */
export function dotMask(cell: Node, radius: Node, aa: Node): Node {
  return float(1).sub(smoothstep(radius.sub(aa.mul(0.5)), radius.add(aa.mul(0.5)), fract(cell).sub(0.5).length()));
}

/**
 * Zero-mean dot ink: printed dots minus their coverage, so the layer moves
 * energy around instead of adding it. `lod` is 0 once cells are too small to resolve.
 */
export function dotCell(cell: Node, coverage: Node, aa: Node, lod: Node): Node {
  const radius = coverage.max(0).div(Math.PI).sqrt();
  return dotMask(cell, radius, aa).sub(coverage).mul(lod).mul(coverageFade(coverage));
}

/** Zero-mean line ink: parallel lines centered on integer `cell.y`, covering a fraction of each cell. */
export function lineCell(cell: Node, coverage: Node, aa: Node, lod: Node): Node {
  const edge = float(0.5).sub(coverage.mul(0.5));
  return smoothstep(edge.sub(aa.mul(0.5)), edge.add(aa.mul(0.5)), fract(cell.y).sub(0.5).abs())
    .sub(coverage)
    .mul(lod)
    .mul(coverageFade(coverage));
}
