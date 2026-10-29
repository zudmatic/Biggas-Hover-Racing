import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
  type Camera,
  type PerspectiveCamera,
  type Points,
  type PointsMaterial,
  type Scene,
} from 'three';
import type {Disposable} from '@/core/disposable';
import {CIRCUIT_SPEED} from '@/sim/hover-physics';
import {createBiggasCitySky} from '@/content/tracks/biggas-forest/biggas-city-sky.js';
import {DesertSky} from './desert-sky';
import {createStarField, createSunDisc, seededRandom, type Sky, type SkyUpdateOptions} from './sky';

export type {Sky, SkyUpdateOptions} from './sky';

const {clamp} = MathUtils;

const DOME_RADIUS = 4400;
/** Cloud lobes per cluster, in cluster units: [x, y, z]. */
const LOBES: readonly (readonly [number, number, number])[] = [
  [-0.52, 0, -0.08],
  [-0.28, 0.12, 0.08],
  [0, 0.25, 0],
  [0.26, 0.13, -0.06],
  [0.49, 0, 0.1],
  [-0.12, -0.02, 0.24],
  [0.2, -0.03, -0.25],
];

interface Puff {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

interface CloudCluster {
  x: number;
  y: number;
  z: number;
  width: number;
  angle: number;
  speed: number;
  puffs: Puff[];
}

export interface CircuitSkyOptions {
  mobile?: boolean;
  /** Track id; picks the palette and random seed. */
  map?: string;
}

/**
 * Procedural sky of the circuit tracks: vertex-colored gradient dome, drifting
 * instanced clouds, sun/moon and stars, blended to night.
 */
export class CircuitSky implements Sky {
  readonly root = new Group();
  readonly dome: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly clouds: InstancedMesh<SphereGeometry, MeshBasicMaterial>;
  readonly sun: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly stars: Points<BufferGeometry, PointsMaterial>;
  readonly cloudCount: number;

  private readonly desert: boolean;
  private readonly domeColors: Float32Array;
  private readonly clusters: CloudCluster[];
  private readonly puffsPerCluster = LOBES.length;
  private readonly transform = new Object3D();
  private readonly sunDirection: Vector3;
  private readonly dayTop: Color;
  private readonly nightTop = new Color(0x071329);
  private readonly dayHorizon = new Color(0xc5dce0);
  private readonly nightHorizon = new Color(0x263c58);
  private readonly horizon = new Color();
  private readonly zenith = new Color();
  private readonly tint = new Color(0x829ac4);
  private readonly sunDay = new Color(0xffe4a2);
  private readonly moon = new Color(0xdcecff);
  private readonly scratch = new Color();
  private previousTick = -1;
  private previousBlend = -1;
  private blend = 0;

  constructor(scene: Scene, {mobile = false, map = 'ruins'}: CircuitSkyOptions = {}) {
    const {root, scratch: color} = this;
    // The desert branches below are the pre-panorama desert dome (createCircuitSky uses DesertSky).
    this.desert = map === 'desert-valley';
    const random = seededRandom(map === 'nexus' ? 35035 : 34034);
    root.name = 'Cielo del circuito';
    scene.add(root);

    const domeGeometry = new SphereGeometry(DOME_RADIUS, 32, 20);
    this.domeColors = new Float32Array(domeGeometry.attributes.position.count * 3);
    domeGeometry.setAttribute('color', new BufferAttribute(this.domeColors, 3));
    this.dome = new Mesh(domeGeometry, new MeshBasicMaterial({vertexColors: true, side: BackSide, depthWrite: false, fog: false}));
    this.dome.name = 'Gradiente del cielo';
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    root.add(this.dome);
    if (this.desert) this.dome.material.toneMapped = false;

    const cloudGeometry = new SphereGeometry(1, 10, 7);
    const normals = cloudGeometry.attributes.normal;
    const cloudColors = new Float32Array(normals.count * 3);
    const shade = new Color(0x8eacc3);
    const lit = new Color(0xfffbeb);
    for (let i = 0; i < normals.count; i++) {
      const light = clamp(0.58 + normals.getY(i) * 0.36 - normals.getX(i) * 0.12, 0, 1);
      color.copy(shade).lerp(lit, light);
      color.toArray(cloudColors, i * 3);
    }
    cloudGeometry.setAttribute('color', new BufferAttribute(cloudColors, 3));
    const groups = mobile ? 18 : 30;
    this.cloudCount = groups;
    this.clouds = new InstancedMesh(cloudGeometry, new MeshBasicMaterial({vertexColors: true, fog: false}), groups * this.puffsPerCluster);
    this.clouds.name = 'Nubes volumétricas';
    this.clouds.frustumCulled = false;
    this.clouds.instanceMatrix.setUsage(DynamicDrawUsage);
    root.add(this.clouds);
    this.clusters = Array.from({length: groups}, (_, i) => {
      const angle = (i / groups) * Math.PI * 2 + random() * 0.2;
      const layer = i % 3;
      const radius = layer === 0 ? 620 + random() * 180 : 1000 + random() * 950;
      const width = layer === 0 ? 65 + random() * 50 : 100 + random() * 100;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        y: layer === 0 ? 175 + random() * 65 : 280 + random() * 170,
        width,
        angle: random() * Math.PI,
        speed: 0.65 + random() * 0.6,
        puffs: LOBES.map(([x, y, z]) => ({x, y, z, sx: 0.32 + random() * 0.13, sy: 0.2 + random() * 0.1, sz: 0.29 + random() * 0.13})),
      };
    });
    if (this.desert) this.clouds.visible = false;

    this.sunDirection = (this.desert ? new Vector3(-160, 220, -120) : new Vector3(-0.55, 0.42, 0.72)).normalize();
    this.sun = createSunDisc();
    root.add(this.sun);
    this.stars = createStarField(random, mobile ? 90 : 180);
    root.add(this.stars);

    this.dayTop = new Color(map === 'nexus' ? 0x568eb9 : 0x509bd0);
    if (this.desert) {
      this.dayTop.set(0x247db6);
      this.dayHorizon.set(0xbadbe4);
    }
  }

  update(camera: Camera, time: number, {night = false, dt = 0, reducedMotion = false}: SkyUpdateOptions = {}): void {
    const {dome, stars, sun, clouds} = this;
    const blend = (this.blend = reducedMotion ? Number(night) : MathUtils.damp(this.blend, Number(night), 5, dt));
    dome.position.copy(camera.position);
    stars.position.copy(camera.position);
    sun.position.copy(camera.position).addScaledVector(this.sunDirection, 3500);
    if (Math.abs(blend - this.previousBlend) > 0.0001) {
      this.previousBlend = blend;
      this.paintDome(blend);
      clouds.material.color.set(0xffffff).lerp(this.tint, blend);
      sun.material.color.copy(this.sunDay).lerp(this.moon, blend);
      stars.material.opacity = blend * 0.85;
    }
    const t = reducedMotion ? 0 : time;
    const tick = Math.floor(t * 12);
    if (clouds.visible && tick !== this.previousTick) {
      this.previousTick = tick;
      this.placeClouds(t);
    }
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.clouds.geometry.dispose();
    this.clouds.material.dispose();
    this.clouds.dispose();
    this.sun.geometry.dispose();
    this.sun.material.dispose();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
    this.root.removeFromParent();
  }

  private paintDome(blend: number): void {
    const {horizon, zenith, scratch: color, domeColors} = this;
    const positions = this.dome.geometry.attributes.position;
    horizon.copy(this.dayHorizon).lerp(this.nightHorizon, blend);
    zenith.copy(this.dayTop).lerp(this.nightTop, blend);
    for (let i = 0; i < positions.count; i++) {
      const height = clamp(positions.getY(i) / DOME_RADIUS, 0, 1);
      color.copy(horizon).lerp(zenith, Math.pow(height, this.desert ? 0.35 : 0.55));
      color.toArray(domeColors, i * 3);
    }
    this.dome.geometry.attributes.color.needsUpdate = true;
  }

  private placeClouds(t: number): void {
    const {transform, clouds, puffsPerCluster} = this;
    this.clusters.forEach((cluster, i) =>
      cluster.puffs.forEach((puff, j) => {
        // Bounded, slow drift keeps cloud coverage stable over long sessions.
        const drift = Math.sin(t * 0.006 * cluster.speed + i) * 45;
        transform.position.set(
          cluster.x + (puff.x * Math.cos(cluster.angle) + puff.z * Math.sin(cluster.angle)) * cluster.width + drift,
          cluster.y + puff.y * cluster.width,
          cluster.z + (-puff.x * Math.sin(cluster.angle) + puff.z * Math.cos(cluster.angle)) * cluster.width + Math.cos(t * 0.004 + i) * 22,
        );
        transform.rotation.set(0, cluster.angle, 0);
        transform.scale.set(cluster.width * puff.sx, cluster.width * puff.sy, cluster.width * puff.sz);
        transform.updateMatrix();
        clouds.setMatrixAt(i * puffsPerCluster + j, transform.matrix);
      }),
    );
    clouds.instanceMatrix.needsUpdate = true;
  }
}

/** The sky of a track: Desert Valley's painted panorama, or the procedural circuit sky. */
export function createCircuitSky(scene: Scene, {mobile = false, map = 'ruins'}: CircuitSkyOptions = {}): Sky {
  if(map==='biggas-city')return createBiggasCitySky(scene,{mobile});
  if (map === 'desert-valley') return new DesertSky(scene, {mobile});
  return new CircuitSky(scene, {mobile, map});
}

/** Field-of-view response; the game's lens dials fill it. */
export interface CameraLens {
  base?: number;
  speed?: number;
  boost?: number;
}

export interface SpeedCameraState {
  speed: number;
  boosting?: boolean;
  yawRate?: number;
}

export interface SpeedCameraOptions<L extends CameraLens> {
  reducedMotion?: boolean;
  /** 0 chase, 1 high, 2 cockpit. */
  cameraMode?: number;
  lens?: L;
}

export interface SpeedCameraProfile<L extends CameraLens> {
  fov: number;
  lens: L;
  distance: number;
  height: number;
  /** Yaw-rate lead of the look target. */
  anticipation: number;
}

/** Chase camera framing and field of view for the current speed. */
export function speedCameraProfile<L extends CameraLens = CameraLens>(
  state: SpeedCameraState,
  {reducedMotion = false, cameraMode = 0, lens = {} as L}: SpeedCameraOptions<L> = {},
): SpeedCameraProfile<L> {
  const speed = clamp(state.speed / CIRCUIT_SPEED, 0, 1);
  const rush = reducedMotion ? 0 : MathUtils.smoothstep(state.speed, 8, 60);
  const response = reducedMotion ? 0 : speed * speed * (lens.speed ?? 8) + (state.boosting ? (lens.boost ?? 7) : 0);
  return {
    fov: Math.min(110, (lens.base ?? 65) + response * (cameraMode === 1 ? 0.7 : 1)),
    lens,
    distance: cameraMode === 1 ? 24 : cameraMode === 2 ? -1.7 : 10 - rush * 1.2,
    height: cameraMode === 1 ? 12 : cameraMode === 2 ? 2.4 : 5.5 - rush * 0.65,
    anticipation: reducedMotion ? 0 : clamp((state.yawRate ?? 0) * 0.13, -0.22, 0.22) * rush,
  };
}

export interface SpeedAtmosphereState {
  speed: number;
  boosting?: boolean;
}

export interface SpeedAtmosphereUpdateOptions {
  dt?: number;
  phase?: string;
  reducedMotion?: boolean;
}

/** Speed lines around the screen edge while flying fast. */
export class SpeedAtmosphere implements Disposable {
  readonly lines: LineSegments<BufferGeometry, LineBasicMaterial>;

  private readonly seeds: {angle: number; phase: number; length: number}[];
  private readonly positions: Float32Array;
  private currentIntensity = 0;

  constructor(scene: Scene, {mobile = false}: {mobile?: boolean} = {}) {
    const count = mobile ? 24 : 42;
    const random = seededRandom(33033);
    this.seeds = Array.from({length: count}, (_, i) => ({
      angle: (i / count) * Math.PI * 2,
      phase: random(),
      length: 0.025 + random() * 0.045,
    }));
    const geometry = new BufferGeometry();
    this.positions = new Float32Array(count * 6);
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    const material = new LineBasicMaterial({
      color: 0xd5f4ff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.lines = new LineSegments(geometry, material);
    this.lines.name = 'Líneas de velocidad';
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 900;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  get intensity(): number {
    return this.currentIntensity;
  }

  update(
    camera: PerspectiveCamera,
    state: SpeedAtmosphereState,
    time: number,
    {dt = 0, phase = 'flying', reducedMotion = false}: SpeedAtmosphereUpdateOptions = {},
  ): void {
    const {lines, positions} = this;
    const material = lines.material;
    if (reducedMotion || phase !== 'flying') {
      this.currentIntensity = 0;
      lines.visible = false;
      material.opacity = 0;
      return;
    }
    const target = MathUtils.smoothstep(state.speed, 20, 68) * (state.boosting ? 1 : 0.65);
    const intensity = (this.currentIntensity = MathUtils.damp(this.currentIntensity, target, 8, dt));
    lines.visible = intensity > 0.015;
    if (!lines.visible) return;
    material.opacity = intensity * 0.4;
    lines.position.copy(camera.position);
    lines.quaternion.copy(camera.quaternion);
    const height = Math.tan(MathUtils.degToRad(camera.fov / 2)) * 8;
    const width = height * camera.aspect;
    this.seeds.forEach((seed, i) => {
      const progress = (seed.phase + time * (0.8 + state.speed / 45)) % 1;
      const radius = 0.64 + progress * 0.65;
      const length = seed.length * (0.5 + intensity * 2.8);
      for (let end = 0; end < 2; end++) {
        const r = radius + end * length;
        const offset = i * 6 + end * 3;
        positions[offset] = Math.cos(seed.angle) * r * width;
        positions[offset + 1] = Math.sin(seed.angle) * r * height;
        positions[offset + 2] = -8;
      }
    });
    lines.geometry.attributes.position.needsUpdate = true;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this.lines.removeFromParent();
  }
}
