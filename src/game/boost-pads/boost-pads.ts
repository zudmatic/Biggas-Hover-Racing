import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  InstancedMesh,
  MathUtils,
  Mesh,
  Object3D,
  OctahedronGeometry,
  Vector3,
  type MeshStandardMaterial,
  type Texture,
} from 'three';
import {MeshBasicNodeMaterial, MeshStandardNodeMaterial, type UniformNode} from 'three/webgpu';
import {float, fract, mix, positionLocal, smoothstep, texture, uniform, uv, vec2, vec3} from 'three/tsl';
import {AssetLoader} from '@/core/assets/asset-loader';
import type {Disposable} from '@/core/disposable';
import {Dither} from '@/render/shaders/dither';
import {BoostPadSimulation, type BoostPadEntry} from '@/sim/boost-pad-simulation';
import {PadEnvelope, type PadEnvelopeValues} from '@/sim/boost-pad-envelope';
import type {SurfaceHeight} from '@/sim/hover-physics';
import type {HoverState, Position3} from '@/sim/hover-state';
import type {Landscape, RoadPoint} from '@/sim/landscape';
import {BOOST_PAD_PRESET, type BoostPadSettings} from './boost-pad-preset';

const MODEL_PATH = 'models/boost-pad/boost-pad.glb';
/** Spark pool size (also the DialKit maximum). */
const MAX_SPARKS = 72;
/** The GLB is authored narrow; every pad and its field use this footprint. */
const PAD_SCALE_X = 1.8;
const PAD_SCALE_Z = 1.4;

export interface BoostPadsOptions {
  scene: Object3D;
  landscape: Landscape;
  surfaceHeight: SurfaceHeight;
  /** Called after a pad grants its boost (sparks already emitted). */
  onActivate?: (pad: BoostPadEntry) => void;
  /** Distances along the lap; defaults to three pads spread over the circuit. */
  distances?: readonly number[];
}

/** Where a pad sits: the road point under it plus its trigger box. */
export interface BoostPadLocation extends RoadPoint {
  halfWidth: number;
  halfLength: number;
}

export type BoostPad = BoostPadEntry & BoostPadLocation;

/** Heat-distortion source above an active pad (read by the post heat field). */
export interface BoostPadHeatField {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly nz: number;
  height: number;
  intensity: number;
}

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  seed: number;
}

/** Per-pad shader inputs and envelope. */
interface PadView {
  ready: UniformNode<number>;
  flash: UniformNode<number>;
  pulse: UniformNode<number>;
  fieldLevel: UniformNode<number>;
  scroll: UniformNode<number>;
  field: Mesh;
  envelope: PadEnvelope;
  visual: PadEnvelopeValues;
  heat: BoostPadHeatField;
}

/** The light-field prism standing on the screen outline. */
interface FieldShape {
  geometry: BufferGeometry;
  /** Unspread vertex positions (base y = 0, top y = 1). */
  base: readonly number[];
  /** Screen surface height above the pad origin. */
  panelHeight: number;
}

/**
 * Track boost pads: the pad simulation plus its look — animated arrow screens,
 * a rising light field, activation sparks and heat-distortion sources.
 */
export class BoostPads implements Disposable {
  readonly sim: BoostPadSimulation<BoostPadLocation>;
  /** Live settings (mutated by `configure`, shared with the simulation). */
  readonly settings: BoostPadSettings;
  private readonly root = new Group();
  private readonly onActivate: (pad: BoostPadEntry) => void;
  private readonly source: Mesh<BufferGeometry, MeshStandardMaterial>;
  private readonly field: FieldShape;
  private readonly views: PadView[] = [];
  private readonly heat: BoostPadHeatField[] = [];
  private readonly materials: (MeshStandardNodeMaterial | MeshBasicNodeMaterial)[] = [];
  private readonly particleMaterial: MeshBasicNodeMaterial;
  private readonly particles: InstancedMesh<OctahedronGeometry, MeshBasicNodeMaterial>;
  private readonly sparks: Spark[] = [];
  private readonly dummy = new Object3D();
  private reduced = false;

  // Shared uniforms: every pad reads the same tuning.
  private readonly time = uniform(0);
  private readonly flow = uniform(1.2);
  private readonly brightness = uniform(2);
  private readonly arrowCount = uniform(3);
  private readonly green = uniform(new Color(0.035, 1, 0.18));
  private readonly blue = uniform(new Color(0.02, 0.5, 1));
  private readonly dither = new Dither();
  private readonly particleAlpha = uniform(0.9);
  private readonly fieldAlpha = uniform(0.16);
  private readonly fieldPulse = uniform(1.2);
  private readonly fieldFade = uniform(1.8);
  private readonly fieldDither = new Dither();
  private readonly fieldTurbulence = uniform(0.55);
  private readonly fieldNoiseScale = uniform(2.5);
  private readonly fieldNoiseSpeed = uniform(1.2);
  private readonly screenOn = uniform(0);
  private readonly screenCells = uniform(42);
  private readonly screenGrid = uniform(0.85);
  private readonly screenScan = uniform(0.3);

  static async load(options: BoostPadsOptions): Promise<BoostPads> {
    const gltf = await AssetLoader.shared.gltf(MODEL_PATH);
    return new BoostPads(gltf.scene, options);
  }

  constructor(model: Object3D, {scene, landscape, surfaceHeight, onActivate = () => {}, distances}: BoostPadsOptions) {
    this.onActivate = onActivate;
    this.source = padMesh(model);
    const start = landscape.roadAt(landscape.spawn.x, landscape.spawn.z).distance;
    const locations = (distances ?? [start + 38, landscape.length * 0.53, landscape.length * 0.92]).map((distance): BoostPadLocation => {
      const road = landscape.atDistance(distance);
      const y = surfaceHeight(road.x, road.z) ?? road.y;
      return {...road, y, halfWidth: 2.07, halfLength: 3.64};
    });
    this.settings = {...BOOST_PAD_PRESET};
    this.sim = new BoostPadSimulation(locations, this.settings);
    this.root.name = 'Track boost pads';
    scene.add(this.root);
    this.field = fieldShape(this.source);
    for (const pad of this.sim.entries) this.addPad(pad);

    this.particleMaterial = new MeshBasicNodeMaterial({color: 0x35bcff, transparent: true, opacity: 0.9, depthWrite: false});
    this.particleMaterial.opacityNode = this.dither.alpha(this.particleAlpha);
    this.particles = new InstancedMesh(new OctahedronGeometry(0.1), this.particleMaterial, MAX_SPARKS);
    this.particles.frustumCulled = false;
    // Stays visible (drawing nothing) until the first update, so its pipeline
    // compiles while loading rather than on the first activation.
    this.particles.count = 0;
    this.root.add(this.particles);
    this.configure(this.settings);
  }

  /** Current heat sources, one per pad. The array and its objects are reused every call. */
  get heatFields(): BoostPadHeatField[] {
    for (let i = 0; i < this.views.length; i++) {
      const {visual, heat} = this.views[i];
      heat.height = this.settings.fieldHeight;
      heat.intensity = visual.level * visual.field * visual.heat * (1 + visual.pulse * 0.5);
    }
    return this.heat;
  }

  configure(values: Partial<BoostPadSettings>): void {
    const settings = Object.assign(this.settings, values);
    if (values.flow !== undefined) this.flow.value = values.flow;
    if (values.brightness !== undefined) this.brightness.value = values.brightness;
    if (values.arrowCount !== undefined) this.arrowCount.value = values.arrowCount;
    if (values.color) this.green.value.set(values.color);
    if (values.activeColor) {
      this.blue.value.set(values.activeColor);
      this.particleMaterial.color.set(values.activeColor);
    }
    this.particleAlpha.value = settings.particleOpacity;
    this.fieldAlpha.value = settings.fieldOpacity;
    this.fieldPulse.value = settings.fieldPulse;
    this.fieldFade.value = settings.fieldFade;
    this.fieldTurbulence.value = settings.fieldTurbulence;
    this.fieldNoiseScale.value = settings.fieldNoiseScale;
    this.fieldNoiseSpeed.value = settings.fieldNoiseSpeed;
    if (values.fieldSpreadX !== undefined || values.fieldSpreadZ !== undefined) this.spreadField();
    this.fieldDither.configure(
      {
        Campo: settings.fieldDither,
        'Campo intensidad': settings.fieldDitherAmount,
        'Campo tamaño': settings.fieldDitherSize,
        'Niveles escena': 6,
      },
      'Campo',
    );
    this.screenOn.value = Number(settings.screen);
    this.screenCells.value = settings.screenCells;
    this.screenGrid.value = settings.screenGrid;
    this.screenScan.value = settings.screenScan;
    this.dither.configure(
      {
        Partículas: settings.dither,
        'Partículas intensidad': settings.ditherAmount,
        'Partículas tamaño': settings.ditherSize,
        'Niveles escena': 6,
      },
      'Partículas',
    );
  }

  /** Fires the first pad as if crossed (lab tools). */
  activate(state: Pick<HoverState, 'padBoostRemaining'>): boolean {
    return this.sim.activate(this.sim.entries[0], state, this.burst);
  }

  reset(): void {
    this.sim.reset();
    this.sparks.length = 0;
    this.particles.count = 0;
    for (const view of this.views) view.scroll.value = 0;
  }

  step(dt: number, state: HoverState, previous: Position3): void {
    this.sim.step(dt, state, previous, this.burst);
  }

  update(dt: number, reduced: boolean): void {
    const {settings, sim, sparks} = this;
    this.reduced = reduced;
    const time = reduced ? 0 : sim.time;
    this.time.value = time;
    for (let i = 0; i < sim.entries.length; i++) {
      const view = this.views[i];
      const visual = view.envelope.update(sim.entries[i], dt, settings);
      view.visual = visual;
      view.ready.value = visual.level;
      view.flash.value = visual.blue;
      view.pulse.value = visual.pulse;
      view.fieldLevel.value = visual.field;
      if (!reduced) view.scroll.value = (view.scroll.value + dt * this.flow.value * visual.level) % 1;
      view.field.visible = visual.level * visual.field > 0.0001;
      view.field.scale.y = settings.fieldHeight;
    }

    if (reduced) sparks.length = 0;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      s.life -= dt;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      s.vx += Math.sin(time * 7 + s.seed) * settings.turbulence * dt;
      s.vz += Math.cos(time * 5 + s.seed) * settings.turbulence * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.vy -= settings.gravity * dt;
    }

    const {particles, dummy} = this;
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, Math.atan2(s.vx, s.vz), 0);
      dummy.scale.setScalar((MathUtils.smoothstep(s.age, 0, 0.09) * MathUtils.smoothstep(s.life, 0, 0.236) * settings.particleSize) / 0.1);
      dummy.scale.z *= settings.stretch;
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
    }
    particles.count = sparks.length;
    // No sparks: skip the draw and its matrix upload entirely.
    particles.visible = sparks.length > 0;
    if (particles.visible) particles.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const material of this.materials) material.dispose();
    this.field.geometry.dispose();
    this.particles.geometry.dispose();
    this.particles.dispose();
    this.particleMaterial.dispose();
    const {geometry, material} = this.source;
    geometry.dispose();
    for (const value of Object.values(material) as unknown[]) if (isTexture(value)) value.dispose();
    material.dispose();
  }

  private readonly burst = (pad: BoostPadEntry): void => {
    const {settings, sparks} = this;
    if (!this.reduced) {
      for (let i = 0; i < settings.particles; i++) {
        // Emit opposite the arrows, with lateral spread in the pad's local frame.
        const side = (Math.random() - 0.5) * 3;
        const along = (Math.random() - 0.5) * 5;
        const speed = settings.particleSpeed * (0.7 + Math.random() * 0.6);
        const spread = (Math.random() - 0.5) * settings.spread * 2;
        sparks.push({
          x: pad.x + pad.nz * side + pad.nx * along,
          y: pad.y + 0.4,
          z: pad.z - pad.nx * side + pad.nz * along,
          vx: -pad.nx * speed + pad.nz * spread,
          vz: -pad.nz * speed - pad.nx * spread,
          age: 0,
          vy: settings.rise * (0.5 + Math.random()),
          seed: Math.random() * 100,
          life: settings.particleLife * (0.7 + Math.random() * 0.6),
        });
      }
    }
    if (sparks.length > MAX_SPARKS) sparks.splice(0, sparks.length - MAX_SPARKS);
    this.onActivate(pad);
  };

  private addPad(pad: BoostPad): void {
    const {source, field: shape} = this;
    // glTF flips Blender's V coordinate. Recover atlas +V so the flow follows +Z.
    const ready = uniform(0);
    const flash = uniform(0);
    const pulse = uniform(0);
    const fieldLevel = uniform(0);
    const scroll = uniform(0);
    const local = vec2(uv().x, float(1).sub(uv().y))
      .sub(vec2(16 / 2048, 16 / 2048))
      .div(vec2(768 / 2048, 1984 / 2048));
    const panel = local.x.greaterThan(0).and(local.x.lessThan(1)).and(local.y.greaterThan(0)).and(local.y.lessThan(1)).select(1, 0);
    // Replace the entire panel paint, not just yellow pixels: the baked arrows
    // also contain shadows, outlines and wear that otherwise remain as ghosts.
    // Keep the original atlas on the frame, corner caps and light housings.
    const sample = texture(atlas(source.material));
    const grain = fract(local.mul(vec2(1531, 3917)).floor().dot(vec2(12.9898, 78.233)).sin().mul(43758.5453));
    const cleanPanel = vec3(0.018, 0.055, 0.075).mul(grain.mul(0.12).add(0.94));
    const paint = mix(sample.rgb, cleanPanel, panel);
    const resolution = vec2(this.screenCells, this.screenCells.mul(2));
    const cellUV = local.mul(resolution).floor().add(0.5).div(resolution);
    const displayUV = mix(local, cellUV, this.screenOn);
    const phase = fract(displayUV.y.mul(this.arrowCount).sub(scroll));
    const tip = float(0.9).sub(displayUV.x.sub(0.5).abs().mul(1.35));
    const chevron = phase
      .lessThan(tip)
      .and(phase.greaterThan(tip.sub(0.38)))
      .and(displayUV.x.sub(0.5).abs().lessThan(0.43))
      .select(1, 0)
      .mul(panel);
    const cell = fract(local.mul(resolution)).sub(0.5).abs();
    const led = float(1).sub(smoothstep(0.32, 0.49, cell.x.max(cell.y)));
    const pixels = mix(float(1), led, this.screenGrid.mul(this.screenOn));
    const scan = fract(local.y.sub(scroll.mul(0.25)))
      .sub(0.5)
      .abs();
    const scanLight = float(1)
      .sub(smoothstep(0.02, 0.16, scan))
      .mul(this.screenScan)
      .mul(this.screenOn);
    const activeColor = mix(this.green, this.blue, flash);
    const strength = ready.mul(pulse.mul(0.6).add(1));
    const material = new MeshStandardNodeMaterial({roughness: 0.7, metalness: 0.2, side: FrontSide});
    material.colorNode = mix(paint, mix(vec3(0.008, 0.014, 0.018), activeColor.mul(0.8).mul(pixels), strength.min(1)), chevron);
    const display = chevron.add(panel.mul(this.screenOn).mul(0.025)).mul(pixels).mul(scanLight.add(1));
    material.emissiveNode = activeColor.mul(display).mul(strength.mul(this.brightness));
    const mesh = new Mesh(source.geometry, material);
    mesh.position.set(pad.x, pad.y + 0.025, pad.z);
    mesh.rotation.set(-Math.atan(pad.grade), Math.atan2(pad.nx, pad.nz), 0, 'YXZ');
    mesh.scale.set(PAD_SCALE_X, 1, PAD_SCALE_Z);
    mesh.receiveShadow = true;
    this.root.add(mesh);

    const fieldMaterial = new MeshBasicNodeMaterial({transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending});
    const height = positionLocal.y.clamp(0, 1);
    const wave = height.mul(15).sub(this.time.mul(this.fieldPulse).mul(5)).sin().mul(0.15).add(0.85);
    const q = positionLocal.mul(this.fieldNoiseScale);
    const flowTime = this.time.mul(this.fieldNoiseSpeed);
    const warp = q.x.mul(1.7).add(q.z.mul(1.3)).sub(flowTime).sin();
    const coarse = q.y.mul(4).sub(flowTime.mul(2)).add(warp).add(q.x).sin();
    const detail = q.z.mul(3.1).add(q.x.mul(2.3)).sub(q.y.mul(6)).add(flowTime.mul(1.4)).sin();
    const turbulence = coarse.mul(0.65).add(detail.mul(0.35)).mul(0.5).add(0.5);
    const wisps = mix(float(1), smoothstep(0.12, 0.85, turbulence), this.fieldTurbulence);
    // Bright at the emitting screen, smoothly transparent at the top.
    const fade = float(1).sub(height).pow(this.fieldFade);
    fieldMaterial.colorNode = activeColor.mul(1.8);
    fieldMaterial.opacityNode = this.fieldDither.alpha(
      fade.mul(wave).mul(wisps).mul(this.fieldAlpha).mul(2.5).mul(strength).mul(fieldLevel).clamp(0, 1),
    );
    const field = new Mesh(shape.geometry, fieldMaterial);
    field.rotation.copy(mesh.rotation);
    field.position.copy(mesh.position).add(new Vector3(0, shape.panelHeight + 0.002, 0).applyQuaternion(mesh.quaternion));
    field.visible = false;
    this.root.add(field);

    this.materials.push(material, fieldMaterial);
    const heat: BoostPadHeatField = {x: pad.x, y: pad.y, z: pad.z, nx: pad.nx, nz: pad.nz, height: 0, intensity: 0};
    this.heat.push(heat);
    this.views.push({
      ready,
      flash,
      pulse,
      fieldLevel,
      scroll,
      field,
      envelope: new PadEnvelope(),
      visual: {level: 0, field: 0, heat: 0, pulse: 0, blue: 0},
      heat,
    });
  }

  /** Anchors the field's base to the screen and opens its top in both directions. */
  private spreadField(): void {
    const {geometry, base} = this.field;
    const spreadX = this.settings.fieldSpreadX;
    const spreadZ = this.settings.fieldSpreadZ;
    const attribute = geometry.getAttribute('position');
    for (let i = 0; i < attribute.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const z = base[i * 3 + 2];
      attribute.setXYZ(i, x + Math.sign(x) * spreadX * y, y, z + Math.sign(z) * spreadZ * y);
    }
    attribute.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
}

/** The pad mesh of the GLB (its last mesh). */
function padMesh(model: Object3D): Mesh<BufferGeometry, MeshStandardMaterial> {
  const meshes: Mesh[] = [];
  model.traverse((object) => {
    if ((object as Mesh).isMesh) meshes.push(object as Mesh);
  });
  const mesh = meshes.at(-1);
  if (!mesh) throw new Error(`${MODEL_PATH}: no mesh`);
  // glTF metallic-roughness materials load as MeshStandardMaterial.
  return mesh as Mesh<BufferGeometry, MeshStandardMaterial>;
}

const isTexture = (value: unknown): value is Texture =>
  typeof value === 'object' && value !== null && (value as Partial<Texture>).isTexture === true;

function atlas(material: MeshStandardMaterial): Texture {
  if (!material.map) throw new Error(`${MODEL_PATH}: missing atlas texture`);
  return material.map;
}

/**
 * Follow the actual screen UV island, including its clipped corners: the
 * field is a unit-height prism on that outline. Model units are scaled
 * exactly like the pad mesh.
 */
function fieldShape(source: Mesh<BufferGeometry, MeshStandardMaterial>): FieldShape {
  const sourceUV = source.geometry.getAttribute('uv');
  const sourcePosition = source.geometry.getAttribute('position');
  const screenPoints = new Map<string, Vector3>();
  for (let i = 0; i < sourceUV.count; i++) {
    const u = sourceUV.getX(i);
    const v = 1 - sourceUV.getY(i);
    if (u < 16 / 2048 - 1e-5 || u > 784 / 2048 + 1e-5 || v < 16 / 2048 - 1e-5 || v > 2000 / 2048 + 1e-5) continue;
    const point = new Vector3(sourcePosition.getX(i) * PAD_SCALE_X, sourcePosition.getY(i), sourcePosition.getZ(i) * PAD_SCALE_Z);
    screenPoints.set(`${point.x.toFixed(4)},${point.z.toFixed(4)}`, point);
  }
  const outline = [...screenPoints.values()].sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
  const panelHeight = outline.reduce((sum, p) => sum + p.y, 0) / outline.length;
  const positions: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    positions.push(a.x, 0, a.z, b.x, 0, b.z, b.x, 1, b.z, a.x, 0, a.z, b.x, 1, b.z, a.x, 1, a.z);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return {geometry, base: positions, panelHeight};
}
