import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SpotLight,
  Vector3,
  type Fog,
  type FogExp2,
  type Light,
  type Scene,
} from 'three';
import type {Disposable} from '@/core/disposable';
import type {Vec3Tuple} from '@/core/types';
import {isMesh, materialList} from '../scene-utils';

export interface TrackLightingOptions {
  mobile?: boolean;
  /** Ship-space [side, height, forward] of each headlight. */
  headlightMounts?: readonly (readonly [number, number, number] | Vec3Tuple)[];
  underglow?: boolean;
}

/** A road sample lamp posts are placed beside. */
export interface LightingRoadSample {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  width?: number;
}

/** The track the lights are dressed for. */
export interface LightingTrack {
  map: string;
  length: number;
  atDistance(distance: number): LightingRoadSample;
}

/** The ship pose and drive state the sun, headlights and underglow follow. */
export interface LightingState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  modelScale?: number;
  braking?: boolean;
  drifting?: boolean;
  boosting?: boolean;
}

export interface LightingUpdateOptions {
  dt?: number;
  reducedMotion?: boolean;
  paused?: boolean;
}

export interface NightLightingProfile {
  sky: Color; ground: Color; sun: Color; fog: Color;
  skyIntensity: number; sunIntensity: number; fillIntensity: number;
  direction: Vector3;
}

interface Headlight {
  light: SpotLight;
  offset: number;
  height: number;
  forward: number;
}

/** Spacing of lamp posts along the road. */
const LAMP_SPACING = 28;
/** Lamps beyond this distance are dark; they fade in over the last 12 units. */
const LAMP_REACH = 40;

const isLight = (object: object): object is Light => (object as Partial<Light>).isLight === true;
const isColor = (value: unknown): value is Color => (value as Partial<Color> | null)?.isColor === true;
const isLinearFog = (fog: Fog | FogExp2 | null): fog is Fog => fog !== null && (fog as Partial<Fog>).isFog === true;

/**
 * Global sky/ground fill plus a shadowed sun; a bounded pool lights the road
 * near the player. Actual Lambert-compatible lights also work in comic mode.
 */
export class TrackLighting implements Disposable {
  nightProfile: NightLightingProfile | null = null;
  readonly root = new Group();
  readonly sky = new HemisphereLight(0xc4dcf2, 0x927b59, 1.7);
  readonly sun = new DirectionalLight(0xffd8a0, 3.4);
  readonly fill = new DirectionalLight(0x87bbdc, 0.45);
  /**
   * Pooled road lamps, moved to the nearest posts every frame. Created by
   * setTrack() only for tracks with lamp posts: every light costs every lit
   * fragment, even at intensity 0, and lights added after materials compile
   * rebuild them (setTrack runs before the first render).
   */
  readonly lamps: PointLight[] = [];
  readonly headlights: SpotLight[];
  /** Underglow, tinted by the drive state. */
  readonly engine = new PointLight(0x64e9ff, 12, 9, 2);

  private readonly mobile: boolean;
  private readonly mounts: Headlight[];
  private readonly fixtures: Vector3[] = [];
  /** Nearest fixtures this frame, by ascending squared distance. */
  private readonly nearestIndex: number[] = [];
  private readonly nearestDistance: number[] = [];
  private readonly anchor = new Vector3();
  private nightOn = false;
  private blend = 0;
  private headlightsOn = false;
  private desert = false;

  private readonly dayFog = new Color(0xb6c6bd);
  private readonly nightFog = new Color(0x182c43);
  private readonly daySky = new Color(0xc4dcf2);
  private readonly nightSky = new Color(0x668fce);
  private readonly dayGround = new Color(0x927b59);
  private readonly nightGround = new Color(0x305468);
  private readonly daySun = new Color(0xffd8a0);
  private readonly nightSun = new Color(0xa9c8ff);

  constructor(
    private readonly scene: Scene,
    {
      mobile = false,
      headlightMounts = [
        [-0.8, 1.05, 1.7],
        [0.8, 1.05, 1.7],
      ],
      underglow = true,
    }: TrackLightingOptions = {},
  ) {
    const {root, sky, sun, fill, engine} = this;
    this.mobile = mobile;
    root.name = 'Iluminación del circuito';
    scene.add(root);
    fill.position.set(80, 50, -120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {left: -65, right: 65, top: 65, bottom: -65, near: 5, far: 450});
    sun.shadow.normalBias = 0.12;
    sun.shadow.bias = -0.0002;
    root.add(sky, sun, sun.target, fill);
    this.mounts = headlightMounts.map(([offset, height, forward]) => {
      const light = new SpotLight(0xd8f4ff, 0, 55, 0.48, 0.65, 1.2);
      root.add(light, light.target);
      return {light, offset, height, forward};
    });
    this.headlights = this.mounts.map((mount) => mount.light);
    engine.visible = underglow;
    root.add(engine);
  }

  get night(): boolean {
    return this.nightOn;
  }

  setNight(value: boolean, immediate = false): void {
    this.nightOn = !!value;
    if (immediate) this.blend = Number(value);
  }

  get headlightsEnabled(): boolean {
    return this.headlightsOn;
  }

  setHeadlights(value: boolean): void {
    this.headlightsOn = !!value;
    if (!this.headlightsOn) for (const light of this.headlights) light.intensity = 0;
  }

  /** Dresses the lights for a track: desert palette and shadows, or lamp posts along the road. */
  setTrack(track: LightingTrack): void {
    const {sun, scene, mobile} = this;
    // Tokyo's GLB already contains its fixtures. Its track owns the local pool.
    if (track.map === 'tokyo-highway') {
      if (isLinearFog(scene.fog)) { scene.fog.near = 280; scene.fog.far = 1800; }
      sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
      return;
    }
    if (track.map === 'desert-valley') {
      this.desert = true;
      this.dayFog.set(0xc7d9dc);
      this.daySky.set(0xb5d9ed);
      this.dayGround.set(0xa47d50);
      this.daySun.set(0xffead0);
      if (isLinearFog(scene.fog)) {
        scene.fog.near = 300;
        scene.fog.far = 1400;
      }
      sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
      Object.assign(sun.shadow.camera, {left: -55, right: 55, top: 55, bottom: -55});
      sun.shadow.camera.updateProjectionMatrix();
      return;
    }
    const count = Math.floor(track.length / LAMP_SPACING);
    const poles = new InstancedMesh(
      new CylinderGeometry(0.08, 0.12, 4.5, 6),
      new MeshStandardMaterial({color: 0x385258, roughness: 0.8}),
      count,
    );
    const caps = new InstancedMesh(new BoxGeometry(0.7, 0.16, 0.7), new MeshBasicMaterial({color: 0xffd79e}), count);
    poles.castShadow = true;
    poles.receiveShadow = true;
    poles.name = 'Farolas';
    caps.name = 'Luces de pista';
    caps.material.name = 'Light lens';
    this.root.add(poles, caps);
    const matrix = new Matrix4();
    const roadside = track.map === 'nexus' ? 2 : 0.35;
    for (let i = 0; i < count; i++) {
      const road = track.atDistance(i * LAMP_SPACING);
      const side = i % 2 ? 1 : -1;
      const reach = ((road.width ?? 12) / 2 + roadside) * side;
      const x = road.x - road.nz * reach;
      const z = road.z + road.nx * reach;
      matrix.makeTranslation(x, road.y + 2.25, z);
      poles.setMatrixAt(i, matrix);
      matrix.makeTranslation(x, road.y + 4.5, z);
      caps.setMatrixAt(i, matrix);
      this.fixtures.push(new Vector3(x, road.y + 4.25, z));
    }
    poles.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    if (this.fixtures.length && !this.lamps.length) {
      for (let i = 0; i < (mobile ? 3 : 5); i++) {
        const light = new PointLight(0xffca7d, 0, 24, 2);
        this.root.add(light);
        this.lamps.push(light);
      }
    }
  }

  /** Per frame: day/night blend, sun follow, nearest lamps, headlights and underglow. */
  update(state: LightingState, time: number, {dt = 0, reducedMotion = false, paused = false}: LightingUpdateOptions = {}): void {
    const {sky, sun, fill, scene, desert, engine} = this;
    // User changes remain available while paused; decorative light movement stops.
    const blend = (this.blend = reducedMotion ? Number(this.nightOn) : MathUtils.damp(this.blend, Number(this.nightOn), 5, dt));
    sky.color.copy(this.daySky).lerp(this.nightSky, blend);
    sky.groundColor.copy(this.dayGround).lerp(this.nightGround, blend);
    sky.intensity = desert ? 1.35 - blend * 0.8 : 1.7 - blend * 0.8;
    sun.color.copy(this.daySun).lerp(this.nightSun, blend);
    sun.intensity = desert ? 4.1 - blend * 3.4 : 3.4 - blend * 2.7;
    fill.intensity = desert ? 1.0 * (1 - blend) : 0.45 - blend * 0.23;
    if (isColor(scene.background)) {
      scene.background.copy(this.dayFog).lerp(this.nightFog, blend);
      scene.fog?.color.copy(scene.background);
    }
    const arc = reducedMotion || desert ? 0 : Math.sin(time * 0.018) * 18;
    sun.position.set(state.x + (desert ? -160 : -110) + arc, state.y + (desert ? 220 : 180), state.z + (desert ? -120 : 70));
    sun.target.position.set(state.x, state.y, state.z);
    const profile = this.nightProfile;
    if (profile) {
      sky.color.copy(this.daySky).lerp(profile.sky, blend);
      sky.groundColor.copy(this.dayGround).lerp(profile.ground, blend);
      sky.intensity = MathUtils.lerp(1.7, profile.skyIntensity, blend);
      sun.color.copy(this.daySun).lerp(profile.sun, blend);
      sun.intensity = MathUtils.lerp(3.4, profile.sunIntensity, blend);
      fill.intensity = MathUtils.lerp(0.45, profile.fillIntensity, blend);
      sun.position.copy(profile.direction).add(sun.target.position);
      if (isColor(scene.background)) scene.background.copy(this.dayFog).lerp(profile.fog, blend);
      scene.fog?.color.copy(this.dayFog).lerp(profile.fog, blend);
    }

    this.anchor.set(state.x, state.y, state.z);
    const found = this.selectNearestFixtures();
    for (let i = 0; i < this.lamps.length; i++) {
      const light = this.lamps[i];
      if (i >= found) {
        light.intensity = 0;
        continue;
      }
      light.position.copy(this.fixtures[this.nearestIndex[i]]);
      light.intensity = (70 + blend * 230) * MathUtils.clamp((LAMP_REACH - Math.sqrt(this.nearestDistance[i])) / 12, 0, 1);
    }

    const scale = state.modelScale ?? 1;
    const fx = Math.sin(state.yaw);
    const fz = Math.cos(state.yaw);
    const rx = Math.cos(state.yaw);
    const rz = -fx;
    for (const {light, offset, height, forward} of this.mounts) {
      const side = offset * scale;
      light.position.set(state.x + fx * forward * scale + rx * side, state.y + height * scale, state.z + fz * forward * scale + rz * side);
      light.target.position.set(state.x + fx * 23 + rx * side, state.y - 1.4 + Math.sin(state.pitch) * 23, state.z + fz * 23 + rz * side);
      light.intensity = this.headlightsOn ? 90 + blend * 160 : 0;
    }
    engine.position.set(state.x - fx * 1.5 * scale, state.y + 0.15 * scale, state.z - fz * 1.5 * scale);
    engine.color.setHex(state.braking ? 0xff5035 : state.drifting ? 0xffb24c : 0x64e9ff);
    const pulse = reducedMotion || paused ? 1 : 1 + Math.sin(time * 19) * 0.04;
    engine.intensity = (state.boosting ? 38 : state.drifting ? 25 : 12) * pulse;
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (isLight(object)) object.dispose();
      if (isMesh(object)) {
        object.geometry.dispose();
        for (const material of materialList(object.material)) material.dispose();
      }
    });
    this.root.removeFromParent();
  }

  /**
   * Keeps the lamps.length nearest fixtures to the anchor, ascending (ties keep
   * fixture order, like a stable sort). Allocation-free; returns how many it found.
   */
  private selectNearestFixtures(): number {
    const {fixtures, nearestIndex, nearestDistance, anchor} = this;
    const capacity = Math.min(this.lamps.length, fixtures.length);
    let found = 0;
    for (let index = 0; index < fixtures.length && capacity > 0; index++) {
      const distance = fixtures[index].distanceToSquared(anchor);
      if (found === capacity && !(distance < nearestDistance[found - 1])) continue;
      let slot = found < capacity ? found++ : capacity - 1;
      while (slot > 0 && nearestDistance[slot - 1] > distance) {
        nearestDistance[slot] = nearestDistance[slot - 1];
        nearestIndex[slot] = nearestIndex[slot - 1];
        slot--;
      }
      nearestDistance[slot] = distance;
      nearestIndex[slot] = index;
    }
    return found;
  }
}
