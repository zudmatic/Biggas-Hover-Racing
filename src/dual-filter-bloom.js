// Reused from portfolio-27/components/train/dual-filter-bloom.ts (user supplied).
// Jimenez 13-tap downsample + 9-tap tent upsample: four down, two up stages.
// Finish at quarter resolution; combine inside the existing color-grade pass.
import { rtt, screenUV, uniform, vec2, vec3, vec4 } from "three/tsl";
import * as THREE from "three/webgpu";
function createDualFilterBloom(input) {
  const strength = uniform(0.09);
  const source = input.sample(screenUV).rgb;
  const brightness = source.dot(vec3(0.2126, 0.7152, 0.0722));
  const stages = [];
  const texels = Array.from(
    { length: 4 },
    () => uniform(new THREE.Vector2(1, 1))
  );
  const stage = (rgb, divisor) => {
    const node = rtt(vec4(rgb, 1), 1, 1, {
      type: THREE.HalfFloatType
    });
    node.updateBeforeType = THREE.NodeUpdateType.FRAME;
    node.renderTarget.depthBuffer = false;
    node.renderTarget.texture.minFilter = THREE.LinearFilter;
    node.renderTarget.texture.magFilter = THREE.LinearFilter;
    node.renderTarget.texture.generateMipmaps = false;
    stages.push({ node, divisor });
    return node;
  };
  const down = [stage(source.mul(brightness.smoothstep(2, 2.1)), 2)];
  for (let level = 1; level < 4; level++) {
    const previous = down[level - 1];
    const texel = texels[level - 1];
    const tap = (x, y) => previous.sample(screenUV.add(vec2(x, y).mul(texel))).rgb;
    const filtered = tap(0, 0).mul(0.125).add(
      tap(-1, -1).add(tap(1, -1)).add(tap(-1, 1)).add(tap(1, 1)).mul(0.125)
    ).add(tap(-2, 0).add(tap(2, 0)).add(tap(0, -2)).add(tap(0, 2)).mul(0.0625)).add(
      tap(-2, -2).add(tap(2, -2)).add(tap(-2, 2)).add(tap(2, 2)).mul(0.03125)
    );
    down.push(stage(filtered, 2 ** (level + 1)));
  }
  let coarse = down[3];
  for (let level = 2; level >= 1; level--) {
    const current = coarse;
    const texel = texels[level + 1];
    const tap = (x, y) => current.sample(screenUV.add(vec2(x, y).mul(texel))).rgb;
    const tent = tap(0, 0).mul(0.25).add(tap(-1, 0).add(tap(1, 0)).add(tap(0, -1)).add(tap(0, 1)).mul(0.125)).add(
      tap(-1, -1).add(tap(1, -1)).add(tap(-1, 1)).add(tap(1, 1)).mul(0.0625)
    );
    coarse = stage(
      down[level].sample(screenUV).rgb.add(tent),
      2 ** (level + 1)
    );
  }
  let lastWidth = 0;
  let lastHeight = 0;
  const size = new THREE.Vector2();
  return {
    strength,
    sample: (coord) => coarse.sample(coord).rgb.mul(4.4 / 4).mul(strength).clamp(0, 2),
    resize(renderer) {
      renderer.getDrawingBufferSize(size);
      if (size.x === lastWidth && size.y === lastHeight) return;
      lastWidth = size.x;
      lastHeight = size.y;
      for (const { node, divisor } of stages)
        node.setSize(
          Math.max(1, Math.floor(size.x / divisor)),
          Math.max(1, Math.floor(size.y / divisor))
        );
      down.forEach((node, i) => {
        texels[i].value.set(
          1 / node.renderTarget.width,
          1 / node.renderTarget.height
        );
      });
    },
    dispose() {
      for (const { node } of stages) {
        node.renderTarget.dispose();
        node._quadMesh.material.dispose();
        node.dispose();
      }
    }
  };
}
export {
  createDualFilterBloom
};
