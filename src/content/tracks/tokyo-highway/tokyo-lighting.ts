import {Color, Group, MathUtils, MeshStandardMaterial, SpotLight, Vector3, type Object3D} from 'three';
import {uniform} from 'three/tsl';
import {createDialKit, type DialConfig} from '@/core/debug/dials';
import type {TrackLighting} from '@/render/lighting/track-lighting';
import type {TrackUpdateContext} from '../track';
import {isMesh, materialsOf} from '../scene-utils';
import {TokyoWindows} from './tokyo-windows';

export interface TokyoFixture {kind: 'sodium' | 'tunnel' | 'beacon'; position: [number, number, number]}
const DIALS = {
  Luna: {Intensidad: [0.85, 0, 3, 0.05], Ambiente: [0.5, 0, 2, 0.025], Altura: [180, 50, 300, 5], Color: {type: 'color', default: '#a9c5ff'}},
  Sodio: {Intensidad: [2200, 0, 6000, 50], Emision: [5, 0, 15, 0.25], Color: {type: 'color', default: '#ffad48'}},
  Tunel: {Intensidad: [950, 0, 3000, 25], Emision: [3.5, 0, 12, 0.25], Color: {type: 'color', default: '#ffe1b0'}},
  Torre: {Fachada: [0.45, 0, 2, 0.025], Balizas: [7, 0, 20, 0.5], Parpadeo: true},
  Ventanas: {Activas: true, Densidad: [0.36, 0, 1, 0.01], Intensidad: [1.6, 0, 5, 0.1]},
  Resplandor: [1, 0, 3, 0.1],
} satisfies DialConfig;

/** Emissive fixtures stay visible everywhere; only a small nearby pool lights geometry. */
export class TokyoLighting {
  readonly glow = uniform(1);
  readonly fixtureCount: number;
  private readonly root = new Group();
  private readonly windows: TokyoWindows;
  private readonly kit = createDialKit('Tokyo · iluminación nocturna', DIALS, {id: 'tokyo-night-v1', persist: true});
  private values = this.kit.getValues();
  private readonly unsubscribe = this.kit.subscribe(v => { this.values = v; });
  private readonly lamps: SpotLight[] = [];
  private readonly sources: {kind: 'sodium' | 'tunnel'; position: Vector3}[];
  private readonly emitters: {material: MeshStandardMaterial; kind: 'sodium' | 'tunnel' | 'beacon' | 'bridge' | 'tower'}[] = [];
  private readonly nearest: number[] = [];
  private readonly distances: number[] = [];
  private readonly anchor = new Vector3();
  private global: TrackLighting | null = null;

  constructor(scene: Object3D, fixtures: TokyoFixture[], mobile: boolean) {
    this.fixtureCount = fixtures.length;
    this.sources = fixtures.filter((f): f is TokyoFixture & {kind: 'sodium' | 'tunnel'} => f.kind !== 'beacon')
      .map(f => ({kind: f.kind, position: new Vector3(...f.position)}));
    this.root.name = 'Tokyo · luces locales';
    scene.add(this.root);
    for (let i = 0; i < (mobile ? 4 : 8); i++) {
      const lamp = new SpotLight(0xffad48, 0, 38, 1.15, 0.75, 2);
      lamp.name = `Tokyo local ${i}`;
      this.root.add(lamp, lamp.target);
      this.lamps.push(lamp);
    }
    const known = new Set<MeshStandardMaterial>();
    scene.traverse(object => {
      if (!isMesh(object)) return;
      for (const m of materialsOf(object.material)) {
        const material = m as MeshStandardMaterial;
        if (!material.isMeshStandardMaterial || known.has(material)) continue;
        known.add(material);
        const kind = /Sodium_Emitter/.test(m.name) ? 'sodium' : /Tunnel_Light/.test(m.name) ? 'tunnel'
          : /TokyoTower_Beacons/.test(m.name) ? 'beacon' : /LampLens/.test(m.name) ? 'bridge'
          : /TokyoTower_Atlas/.test(m.name) ? 'tower' : null;
        if (!kind) continue;
        this.emitters.push({material, kind});
        // A low texture-modulated wash makes the tower's painted steel readable
        // at city scale. Its six red aviation beacons remain separate emitters.
        if (kind === 'tower') { material.emissiveMap = material.map; material.emissive.set('#ffb568'); }
        if (kind === 'tunnel') material.emissiveMap = null;
      }
    });
    this.windows = new TokyoWindows(scene);
  }

  bindGlobal(lighting: TrackLighting): void {
    this.global = lighting;
    lighting.nightProfile = {
      sky: new Color('#718bb8'), ground: new Color('#252439'), sun: new Color('#a9c5ff'),
      skyIntensity: 0.5, sunIntensity: 0.85, fillIntensity: 0.08,
      direction: new Vector3(-160, 180, 90), fog: new Color('#0b1324'),
    };
  }

  update(time: number, reduced: boolean, context: TrackUpdateContext): void {
    const v = this.values;
    const night = context.night !== false;
    const factor = night ? 1 : 0.08;
    const profile = this.global?.nightProfile;
    if (profile) {
      profile.sunIntensity = v.Luna.Intensidad;
      profile.skyIntensity = v.Luna.Ambiente;
      profile.sun.set(v.Luna.Color);
      profile.direction.y = v.Luna.Altura;
    }
    this.glow.value = v.Resplandor * factor;
    this.windows.density.value = v.Ventanas.Activas ? v.Ventanas.Densidad : 0;
    this.windows.intensity.value = v.Ventanas.Intensidad * factor;
    for (const {material, kind} of this.emitters) {
      if (kind === 'sodium' || kind === 'tunnel') {
        const settings = kind === 'sodium' ? v.Sodio : v.Tunel;
        material.emissive.set(settings.Color);
        material.emissiveIntensity = settings.Emision * factor;
      } else if (kind === 'tower') material.emissiveIntensity = v.Torre.Fachada * factor;
      else if (kind === 'bridge') material.emissiveIntensity = v.Sodio.Emision * factor;
      else {
        const pulse = reduced || !v.Torre.Parpadeo ? 1 : 0.28 + 0.72 * Math.pow(0.5 + 0.5 * Math.sin(time * Math.PI), 6);
        material.emissiveIntensity = v.Torre.Balizas * factor * pulse;
      }
    }
    this.anchor.set(context.state.x, context.state.y, context.state.z);
    const capacity = this.lamps.length + 1;
    let count = 0;
    for (let i = 0; i < this.sources.length; i++) {
      const d = this.anchor.distanceToSquared(this.sources[i].position);
      if (count === capacity && d >= this.distances[count - 1]) continue;
      let slot = count < capacity ? count++ : capacity - 1;
      while (slot > 0 && this.distances[slot - 1] > d) {
        this.distances[slot] = this.distances[slot - 1]; this.nearest[slot] = this.nearest[slot - 1]; slot--;
      }
      this.distances[slot] = d; this.nearest[slot] = i;
    }
    const cutoff = count > this.lamps.length ? Math.sqrt(this.distances[this.lamps.length]) : 80;
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i];
      if (i >= count) { lamp.intensity = 0; continue; }
      const source = this.sources[this.nearest[i]];
      const tunnel = source.kind === 'tunnel';
      const settings = tunnel ? v.Tunel : v.Sodio;
      lamp.position.copy(source.position); lamp.position.y -= 0.25;
      lamp.target.position.copy(lamp.position); lamp.target.position.y -= 8;
      lamp.color.set(settings.Color);
      lamp.distance = tunnel ? 27 : 38;
      const distance = Math.sqrt(this.distances[i]);
      const fade = MathUtils.clamp((70 - distance) / 15, 0, 1) * MathUtils.clamp((cutoff - distance) / 8, 0, 1);
      lamp.intensity = settings.Intensidad * factor * fade;
    }
  }

  dispose(): void {
    this.unsubscribe(); this.kit.destroy(); this.windows.dispose();
    for (const light of this.lamps) light.dispose();
    this.root.removeFromParent();
    if (this.global) this.global.nightProfile = null;
  }
}
