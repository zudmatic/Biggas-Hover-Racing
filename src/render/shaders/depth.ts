import type {Node, TextureNode} from 'three/webgpu';

/** Reads view-space depth at a screen uv. */
export type DepthSampler = (uv: Node) => Node;

/** Perspective view distance (world units) of a [0, 1] depth-buffer value. */
export function perspectiveViewDepth(depth: Node, near: Node, far: Node): Node {
  return near.mul(far).div(far.sub(depth.mul(far.sub(near))));
}

/** Samples a scene pass's depth texture as perspective view distance. */
export function viewDepthSampler(depthTexture: TextureNode, near: Node, far: Node): DepthSampler {
  return (uv) => perspectiveViewDepth(depthTexture.sample(uv).r, near, far);
}
