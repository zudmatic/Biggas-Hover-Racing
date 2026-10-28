import {Color, DoubleSide, type Texture} from 'three';
import {MeshBasicNodeMaterial, type Node, type UniformNode} from 'three/webgpu';
import {
  Discard,
  Fn,
  If,
  atan,
  attribute,
  cos,
  float,
  floor,
  fract,
  mix,
  mod,
  screenCoordinate,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

/** The smoke look's live controls (TSL uniforms; the GLSL reference mirrors them as `{value}` slots). */
export type SmokeUniforms = {
  /** 0 procedural fragments, 1 hybrid atlas smoke, 2 mixed. */
  style: UniformNode<number>;
  smokeColor: UniformNode<Color>;
  smokeDensity: UniformNode<number>;
  /** Screen pixels per ordered-dither cell. */
  screenGrain: UniformNode<number>;
};

export type SmokeNodeMaterial = MeshBasicNodeMaterial & {uniforms: SmokeUniforms};

// Same batch attributes and simulation as flight-fx; only the shader changes.
export function createSmokeMaterial(atlas: Texture, ground: boolean): SmokeNodeMaterial {
  const uniforms: SmokeUniforms = {
    style: uniform(1),
    smokeColor: uniform(new Color('#bababa')),
    smokeDensity: uniform(1),
    screenGrain: uniform(1.5),
  };
  const {style, smokeColor, smokeDensity, screenGrain} = uniforms;
  const m = new MeshBasicNodeMaterial({
    side: DoubleSide,
    depthWrite: true,
    polygonOffset: ground,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const fx = attribute('fx', 'vec3');
  const p = uv();
  const hash = (q: Node): Node => fract(sin(q.dot(vec2(12.9898, 78.233))).mul(43758.5453));
  const bayer = (q: Node): Node => mod(q.x.mul(2).add(q.y.mul(3)), 4);
  m.colorNode = Fn(() => {
    const grain = hash(floor(p.mul(48)));
    const color = vec3(0).toVar();
    const opacity = fx.x.toVar();
    if (ground) {
      If(
        p.x
          .sub(0.5)
          .abs()
          .mul(2)
          .greaterThan(grain.mul(0.35).add(0.65))
          .or(grain.lessThan(0.22))
          .or(mod(floor(p.x.mul(48)).add(floor(p.y.mul(6))), 7).lessThan(1)),
        () => Discard(),
      );
      color.assign(vec3(0.027, 0.033, 0.038));
      If(grain.greaterThan(opacity), () => Discard());
    } else {
      const local = floor(p.mul(32)).add(0.5).div(32);
      const q = local.sub(0.5).mul(2);
      const angle = atan(q.y, q.x);
      const mask = float(1).toVar();
      If(fx.y.lessThan(0), () => {
        const spike = cos(angle.mul(5)).max(0).pow(3).mul(0.74).add(0.17);
        If(q.length().greaterThan(spike), () => Discard());
        color.assign(mix(vec3(0.08, 0.95, 0.58), vec3(0.96, 0.48, 0.1), fx.z));
      }).Else(() => {
        If(style.lessThan(0.5).or(style.greaterThan(1.5).and(fx.y.lessThan(1000))), () => {
          const sector = floor(angle.add(Math.PI).mul(7 / (Math.PI * 2)));
          const radius = hash(vec2(sector, fx.y)).mul(0.33).add(0.48);
          If(q.length().greaterThan(radius), () => Discard());
          mask.assign(float(1).sub(smoothstep(radius.mul(0.45), radius, q.length())));
          color.assign(smokeColor.mul(hash(vec2(fx.y, 2)).mul(0.16).add(0.84)));
        }).Else(() => {
          const cell = vec2(mod(floor(fx.y), 2).add(1), 3);
          const sample = texture(atlas, cell.add(local.clamp(0.025, 0.975)).mul(0.25));
          If(sample.a.lessThan(0.25), () => Discard());
          mask.assign(
            smoothstep(0.25, 0.9, sample.a).mul(
              hash(floor(local.mul(8)).add(fx.y))
                .mul(0.3)
                .add(0.7),
            ),
          );
          color.assign(
            smokeColor.mul(
              sample.rgb
                .dot(vec3(0.2126, 0.7152, 0.0722))
                .greaterThan(0.45)
                .select(float(1), float(0.87)),
            ),
          );
        });
        opacity.mulAssign(smokeDensity.mul(mask));
      });
      const pixel = floor(screenCoordinate.div(screenGrain.max(1)));
      const coverage = bayer(mod(pixel, 2))
        .mul(4)
        .add(bayer(mod(floor(pixel.div(2)), 2)))
        .add(0.5)
        .div(16);
      If(coverage.greaterThan(opacity), () => Discard());
    }
    return vec4(color, 1);
  })();
  return Object.assign(m, {uniforms});
}
