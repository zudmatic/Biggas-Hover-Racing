import {Color, DoubleSide, MeshBasicNodeMaterial, type Node} from 'three/webgpu';
import {attribute, float, floor, fract, mix, sin, uniform, uv, vec2} from 'three/tsl';
import type {Disposable} from '@/core/disposable';
import {Dither} from '@/render/shaders/dither';

export type WaterFxKind = 'foam' | 'spray' | 'splash';

const DAY_TINT = new Color('#d9ece5');
const NIGHT_TINT = new Color('#759fa6');

// Thruster grain and drift-style seeded silhouettes; water is non-emissive.
export class WaterFxMaterial implements Disposable {
  readonly material: MeshBasicNodeMaterial;
  private readonly tint = uniform(DAY_TINT.clone());
  private readonly dither = new Dither();
  /** Reused; the dither only reconfigures when night or amount change. */
  private readonly ditherSettings = {Fuego: 'Dither', 'Fuego intensidad': 0, 'Fuego tamaño': 1, 'Niveles escena': 6};
  private night: boolean | null = null;

  constructor(kind: WaterFxKind, wetMask: Node) {
    const material = new MeshBasicNodeMaterial({
      name: `Water ${kind}`,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      forceSinglePass: true,
    });
    const data = attribute('waterFxData', 'vec3');
    const p = uv();
    const q = p.sub(0.5).mul(2);
    const seed = data.y;
    const grain = fract(sin(floor(p.mul(36)).dot(vec2(12.9898, 78.233)).add(seed.mul(17))).mul(43758.5453));
    const ragged = sin(q.y.mul(11).add(seed))
      .mul(0.09)
      .add(sin(q.x.mul(9).sub(seed.mul(2))).mul(0.07));
    let mask: Node;
    if (kind === 'foam') {
      const rim = q.length().add(ragged).smoothstep(0.42, 0.98).oneMinus();
      const holes = grain.add(sin(q.x.mul(14).add(q.y.mul(9)).add(seed)).mul(0.13)).smoothstep(0.12, 0.4);
      mask = rim.mul(holes);
    } else if (kind === 'splash') {
      const width = p.y.mul(0.7).add(0.18);
      const edge = q.x.abs().div(width).add(ragged).smoothstep(0.55, 1).oneMinus();
      const fingers = sin(q.x.mul(19).add(seed)).mul(0.5).add(0.5).smoothstep(0.12, 0.45);
      mask = edge.mul(fingers).mul(p.y.smoothstep(0, 0.12)).mul(p.y.smoothstep(0.55, 1).oneMinus());
    } else {
      mask = q.length().add(ragged.mul(0.35)).smoothstep(0.5, 1).oneMinus();
    }
    material.colorNode = mix(this.tint.mul(0.82), this.tint, grain.smoothstep(0.15, 0.65));
    material.opacityNode = this.dither.alpha(data.x.mul(mask)).mul(wetMask);
    material.alphaTestNode = float(0.012);
    this.material = material;
  }

  configure(night: boolean, amount: number): void {
    if (night === this.night && amount === this.ditherSettings['Fuego intensidad']) return;
    this.night = night;
    this.tint.value.copy(night ? NIGHT_TINT : DAY_TINT);
    this.ditherSettings['Fuego intensidad'] = amount;
    this.dither.configure(this.ditherSettings, 'Fuego');
  }

  dispose(): void {
    this.material.dispose();
  }
}
