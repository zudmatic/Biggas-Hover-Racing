import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardNodeMaterial,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type Object3D,
} from 'three/webgpu';
import {float, mix, normalLocal, smoothstep, uniform} from 'three/tsl';
import type {Disposable} from '@/core/disposable';
import type {ExhaustMount} from '@/content/vehicles/vehicle-definition';
import {DEFAULT_NOZZLES, type NozzleMouth} from './nozzle-mouth';

export interface EngineCoreSettings {
  /** Shows the inserts; hidden inserts report no mouth. */
  active: boolean;
  /** Axial stretch of the insert. */
  depth: number;
  intensity: number;
  size: number;
  /** Seconds the chamber takes to cool down. */
  cooling: number;
  /** Heat flicker amplitude. */
  pulse: number;
  /** Point light intensity per unit of temperature. */
  nearLight: number;
  edgeColor: Color;
  centerColor: Color;
}

interface CoreMount {
  readonly group: Group;
  readonly light: PointLight;
  readonly radius: number;
}

// A physical nozzle insert: bevelled metal lip, recessed hot chamber and curved core.
export class EngineCore implements Disposable {
  private readonly heat = uniform(0);
  private readonly intensity = uniform(1);
  private readonly edge = uniform(new Color('#ff5812'));
  private readonly center = uniform(new Color('#fff1b0'));
  private readonly material: MeshStandardNodeMaterial;
  private readonly rimMaterial: MeshStandardNodeMaterial;
  private readonly metal: MeshStandardNodeMaterial;
  private readonly chamberMaterial: MeshStandardNodeMaterial;
  private readonly lip: LatheGeometry;
  private readonly chamber: CylinderGeometry;
  private readonly core: SphereGeometry;
  private readonly ring: TorusGeometry;
  private readonly rib: BoxGeometry;
  private readonly cores: CoreMount[] = [];
  /** Refreshed by update(); returned by mouths() while the inserts are shown. */
  private readonly mouthCache: NozzleMouth[];
  private temperature = 0;
  private active = false;

  constructor(
    private readonly ship: Object3D,
    nozzles: readonly ExhaustMount[] = DEFAULT_NOZZLES,
  ) {
    const {heat, intensity, edge, center} = this;
    this.material = new MeshStandardNodeMaterial({roughness: 0.55, metalness: 0.25, color: '#77350f'});
    const facing = normalLocal.z.negate().max(0);
    this.material.emissiveNode = mix(edge, center, smoothstep(float(0.25), float(0.95), facing))
      .mul(heat)
      .mul(intensity)
      .mul(1.3);
    this.rimMaterial = new MeshStandardNodeMaterial({color: '#6e3320', roughness: 0.65, metalness: 0.55});
    this.rimMaterial.emissiveNode = edge.mul(heat).mul(intensity).mul(0.5);
    this.metal = new MeshStandardNodeMaterial({color: '#303d43', roughness: 0.58, metalness: 0.65, flatShading: true});
    this.chamberMaterial = new MeshStandardNodeMaterial({color: '#351b12', roughness: 0.8, metalness: 0.2, side: DoubleSide});
    this.chamberMaterial.emissiveNode = edge.mul(heat).mul(intensity).mul(0.16);

    const profile = [
      [0.3, -0.09],
      [0.32, -0.01],
      [0.31, 0.055],
      [0.28, 0.08],
      [0.245, 0.045],
      [0.22, -0.09],
    ].map(([r, y]) => new Vector2(r, y));
    this.lip = new LatheGeometry(profile, 16);
    this.lip.rotateX(-Math.PI / 2);
    this.chamber = new CylinderGeometry(0.245, 0.16, 0.18, 16, 1, true);
    this.chamber.rotateX(-Math.PI / 2);
    this.core = new SphereGeometry(0.195, 20, 12);
    this.core.scale(1, 1, 0.62);
    this.ring = new TorusGeometry(0.24, 0.018, 6, 16);
    this.rib = new BoxGeometry(0.036, 0.075, 0.1);

    for (const [x, y, z, radius] of nozzles) {
      const group = new Group();
      group.position.set(x, y, z - 0.05);
      group.userData.nozzleInsert = true;
      group.add(new Mesh(this.lip, this.metal));
      const bowl = new Mesh(this.chamber, this.chamberMaterial);
      bowl.position.z = 0.025;
      group.add(bowl);
      // Apex sits just inside the lip exit (z=-.08), so the flame can start at the mouth without crossing the bulb.
      const bulb = new Mesh(this.core, this.material);
      bulb.position.z = 0.045;
      group.add(bulb);
      const hotRing = new Mesh(this.ring, this.rimMaterial);
      hotRing.position.z = -0.045;
      group.add(hotRing);
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const fin = new Mesh(this.rib, this.metal);
        fin.position.set(Math.sin(angle) * 0.285, Math.cos(angle) * 0.285, -0.005);
        fin.rotation.z = -angle;
        group.add(fin);
      }
      ship.add(group);
      const light = new PointLight('#ff5812', 0, 1.8, 2);
      light.position.set(x, y, z - 0.31);
      ship.add(light);
      this.cores.push({group, light, radius});
    }
    this.mouthCache = this.cores.map(() => ({start: 0, radius: 0}));
  }

  update(dt: number, time: number, power: number, settings: EngineCoreSettings): void {
    const target = 0.05 + power * 0.95;
    this.temperature += (target - this.temperature) * (1 - Math.exp(-dt / (target > this.temperature ? 0.12 : settings.cooling)));
    this.heat.value = this.temperature * (1 + Math.sin(time * 27) * settings.pulse);
    this.active = settings.active;
    this.intensity.value = settings.intensity;
    this.edge.value.set(settings.edgeColor);
    this.center.value.set(settings.centerColor);
    for (let i = 0; i < this.cores.length; i++) {
      const {group, light, radius} = this.cores[i];
      group.visible = settings.active;
      group.scale.set(settings.size, settings.size, settings.size * settings.depth).multiplyScalar(radius / 0.24);
      light.color.copy(this.edge.value);
      light.intensity = settings.active ? this.temperature * settings.nearLight : 0;
      // Lip exit (local z=-.08) and inner lip radius (.245) in ship units, from the scale applied above.
      const mouth = this.mouthCache[i];
      mouth.start = 0.05 + (0.08 * settings.size * settings.depth * radius) / 0.24;
      mouth.radius = (0.245 * settings.size * radius) / 0.24;
    }
  }

  /** The inserts' exits while they are shown, else null. */
  mouths(): readonly NozzleMouth[] | null {
    return this.active ? this.mouthCache : null;
  }

  dispose(): void {
    for (const {group, light} of this.cores) {
      this.ship.remove(group, light);
      light.dispose();
    }
    for (const resource of [
      this.lip,
      this.chamber,
      this.core,
      this.ring,
      this.rib,
      this.material,
      this.rimMaterial,
      this.metal,
      this.chamberMaterial,
    ])
      resource.dispose();
  }
}
