import {AdditiveBlending, Color, DoubleSide, MeshBasicNodeMaterial, type Node} from 'three/webgpu';
import {abs, float, mix, sin, smoothstep, uniform, uv} from 'three/tsl';
import type {Disposable} from '@/core/disposable';
import {Dither} from '@/render/shaders/dither';

/** Flame look values; the boost passes its dial values straight through. */
export interface FlameLookSettings {
  Turbulencia: number;
  /** Screen pattern: 'Apagado', 'Damero' or 'Dither'. */
  Trama: string;
  'Densidad llama'?: number;
  'Fade base'?: number;
  'Intensidad trama'?: number;
  'Tamaño trama'?: number;
}

const FIRE = new Color('#ff6b16');
const FIRE_BLUE = new Color('#42a4ff');
const HOT = new Color('#fff1bc');
const HOT_BLUE = new Color('#9e8c00');

/** Additive, dithered flame sheet shared by every nozzle of a ship. */
export class FlameMaterial implements Disposable {
  readonly material: MeshBasicNodeMaterial;
  private readonly hot = uniform(HOT.clone());
  private readonly fire = uniform(FIRE.clone());
  private readonly clock = uniform(0);
  private readonly roughness = uniform(2);
  private readonly frequency = uniform(1.2);
  private readonly flowSpeed = uniform(1);
  private readonly brightness = uniform(1.5);
  private readonly opacity = uniform(0.7);
  private readonly taper = uniform(0.65);
  private readonly baseFade = uniform(0.25);
  private readonly fireDither = new Dither();
  /** Reused every frame; the dither only reconfigures when one of these changes. */
  private readonly ditherSettings = {Fuego: 'Dither', 'Fuego intensidad': 0.6, 'Fuego tamaño': 2, 'Niveles escena': 6};

  constructor() {
    const {hot, fire, clock, roughness, frequency, flowSpeed, brightness, opacity, taper, baseFade} = this;
    // Crossed, advected flame sheets keep combustion attached to each nozzle.
    const material = new MeshBasicNodeMaterial({transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending});
    // The translated plane starts at UV.y = 0 at the nozzle and ends at 1.
    const t = uv().y;
    const x = uv().x.sub(0.5).mul(2);
    const flow = t.mul(18).sub(clock.mul(24).mul(flowSpeed));
    const noise = sin(flow.add(x.mul(5)))
      .mul(0.5)
      .add(sin(flow.mul(1.73).add(x.mul(11))).mul(0.3))
      .add(sin(flow.mul(2.91).sub(x.mul(17))).mul(0.2));
    const bend = sin(t.mul(9).mul(frequency).sub(clock.mul(10).mul(flowSpeed)))
      .mul(t)
      .mul(0.16)
      .mul(roughness);
    const width = float(1).sub(t).pow(taper).mul(0.68).add(noise.mul(0.13).mul(t)).max(0.015);
    const edge = abs(x.add(bend)).div(width);
    // Rounded root: the sides start later than the centre, so the first row reads as the round mouth, not a straight cut.
    const root = smoothstep(float(0), baseFade.max(0.001), t.sub(x.mul(x).mul(0.15)));
    const mask = smoothstep(float(1), float(0.45), edge)
      .mul(smoothstep(float(1), float(0.72), t))
      .mul(root);
    const core = smoothstep(float(0.7), float(0.05), edge.add(t.mul(0.7)));
    material.colorNode = mix(fire, hot, core).mul(brightness);
    material.opacityNode = this.fireDither.alpha(mask.mul(opacity));
    this.fireDither.configure(this.ditherSettings, 'Fuego');
    this.material = material;
  }

  setColors(color: Color, core: Color): void {
    this.fire.value.copy(color);
    this.hot.value.copy(core);
  }

  /** The flame's screen pattern applied to any alpha (particles reuse it). */
  ditherAlpha(alpha: Node): Node {
    return this.fireDither.alpha(alpha);
  }

  update(time: number, settings: FlameLookSettings, blue: boolean): void {
    this.clock.value = time;
    this.roughness.value = settings.Turbulencia;
    this.frequency.value = 0.8;
    this.flowSpeed.value = 1.95;
    this.brightness.value = 1.75;
    this.opacity.value = settings['Densidad llama'] ?? 0.82;
    this.taper.value = 0.7;
    this.baseFade.value = settings['Fade base'] ?? 0.25;
    this.fire.value.copy(blue ? FIRE_BLUE : FIRE);
    this.hot.value.copy(blue ? HOT_BLUE : HOT);
    const dither = this.ditherSettings;
    const intensity = settings['Intensidad trama'] ?? 0.6;
    const size = settings['Tamaño trama'] ?? 2;
    if (dither.Fuego !== settings.Trama || dither['Fuego intensidad'] !== intensity || dither['Fuego tamaño'] !== size) {
      dither.Fuego = settings.Trama;
      dither['Fuego intensidad'] = intensity;
      dither['Fuego tamaño'] = size;
      this.fireDither.configure(dither, 'Fuego');
    }
  }

  dispose(): void {
    this.material.dispose();
  }
}
