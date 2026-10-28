import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  MeshBasicNodeMaterial,
  type Node,
  type Object3D,
} from 'three/webgpu';
import {
  Fn,
  attribute,
  cameraPosition,
  cos,
  dFdx,
  dFdy,
  float,
  floor,
  fract,
  mix,
  positionWorld,
  reflect,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type {Disposable} from '@/core/disposable';
import type {HoverState, Landscape, SurfaceHeight} from '@/sim/hover-physics';
import {OilSimulation} from '@/sim/oil-simulation';

export function createOilMaterial(alpha: Node = attribute('oilAlpha', 'float')): MeshBasicNodeMaterial {
  const hash = (q: Node): Node => fract(sin(q.dot(vec2(127.1, 311.7))).mul(43758.5453));
  const noise = Fn(([q]: [Node]) => {
    const i = floor(q);
    const f = fract(q);
    const s = f.mul(f).mul(float(3).sub(f.mul(2)));
    return mix(mix(hash(i), hash(i.add(vec2(1, 0))), s.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(1)), s.x), s.y);
  });
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const p = positionWorld.xz;
  const n = noise(p.mul(0.65)).add(noise(p.mul(1.8)).mul(0.35));
  const edge = float(1).sub(smoothstep(0.34, 0.455, uv().sub(0.5).length().add(n.sub(0.65).mul(0.015))));
  const surface = dFdx(positionWorld).cross(dFdy(positionWorld)).normalize();
  const normal = surface.y
    .lessThan(0)
    .select(surface.negate(), surface)
    .add(vec3(sin(p.x.mul(0.8).add(n)).mul(0.014), 0, cos(p.y.mul(0.9).add(n)).mul(0.014)))
    .normalize();
  const view = cameraPosition.sub(positionWorld).normalize();
  const facing = normal.dot(view).clamp();
  const fresnel = float(1).sub(facing).pow(4);
  const glint = reflect(view.negate(), normal)
    .dot(vec3(-0.4, 0.8, 0.25).normalize())
    .max(0)
    .pow(32);
  const film = cos(
    n
      .mul(0.8)
      .add(facing.mul(0.6))
      .add(vec3(0, 0.33, 0.67))
      .mul(6.28318),
  )
    .mul(0.5)
    .add(0.5);
  material.colorNode = mix(vec3(0.006, 0.008, 0.011), vec3(0.018, 0.022, 0.028), n.mul(0.55))
    .add(vec3(0.065, 0.085, 0.11).mul(fresnel))
    .add(
      film
        .mul(0.018)
        .mul(smoothstep(0.4, 0.85, n))
        .mul(fresnel.mul(0.75).add(0.25)),
    )
    .add(vec3(0.18, 0.2, 0.21).mul(glint));
  material.opacityNode = edge.mul(alpha);
  material.alphaTestNode = uniform(0.01);
  return material;
}

/** What the oil preview needs from the loaded track. */
export interface OilPreviewWorld {
  readonly landscape: Landscape;
  readonly surfaceHeight: SurfaceHeight;
}

const MAX_PATCHES = 256;
/** 8 fan triangles per patch. */
const VERTICES_PER_PATCH = 24;
const RING = 8;

/** Oil drops for the dev benches: the shared simulation drawn as one fan per patch. */
export class OilPreview implements Disposable {
  readonly sim: OilSimulation;
  private readonly geometry = new BufferGeometry();
  private readonly material = createOilMaterial();
  private readonly mesh: Mesh;
  private readonly position: BufferAttribute;
  private readonly uv: BufferAttribute;
  private readonly alpha: BufferAttribute;
  /** Rim scratch: x, y, z, u, v per ring point. */
  private readonly ring = new Float64Array(RING * 5);

  constructor(
    scene: Object3D,
    private readonly world: OilPreviewWorld,
  ) {
    this.sim = new OilSimulation(world.landscape, world.surfaceHeight);
    const attribute = (size: number) =>
      new BufferAttribute(new Float32Array(MAX_PATCHES * VERTICES_PER_PATCH * size), size).setUsage(DynamicDrawUsage);
    this.position = attribute(3);
    this.uv = attribute(2);
    this.alpha = attribute(1);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('uv', this.uv);
    this.geometry.setAttribute('oilAlpha', this.alpha);
    this.geometry.setDrawRange(0, 0);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  clear(): void {
    this.sim.reset();
    this.finish(0);
  }

  drop(): void {
    this.sim.startPour();
  }

  update(dt: number, state: HoverState): void {
    const {sim, ring} = this;
    sim.step(dt, state);
    let at = 0;
    for (const patch of sim.patches) {
      const a = Math.min(1, (patch.expires - sim.time) / 0.8) * 0.95;
      for (let i = 0; i < RING; i++) {
        const angle = (i * Math.PI) / 4;
        const r = patch.radius * (0.87 + 0.1 * Math.sin(i * 7 + patch.id * 3));
        const x = patch.x + Math.cos(angle) * r;
        const z = patch.z + Math.sin(angle) * r;
        ring[i * 5] = x;
        ring[i * 5 + 1] = this.world.surfaceHeight(x, z) ?? patch.y;
        ring[i * 5 + 2] = z;
        ring[i * 5 + 3] = 0.5 + (x - patch.x) / (2 * patch.radius);
        ring[i * 5 + 4] = 0.5 + (z - patch.z) / (2 * patch.radius);
      }
      for (let i = 0; i < RING; i++) {
        const j = (i + 1) % RING;
        this.vertex(at++, patch.x, patch.y, patch.z, 0.5, 0.5, a);
        this.vertex(at++, ring[i * 5], ring[i * 5 + 1], ring[i * 5 + 2], ring[i * 5 + 3], ring[i * 5 + 4], a);
        this.vertex(at++, ring[j * 5], ring[j * 5 + 1], ring[j * 5 + 2], ring[j * 5 + 3], ring[j * 5 + 4], a);
      }
    }
    this.finish(at);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }

  private vertex(index: number, x: number, y: number, z: number, u: number, v: number, a: number): void {
    this.position.array[index * 3] = x;
    this.position.array[index * 3 + 1] = y + 0.025;
    this.position.array[index * 3 + 2] = z;
    this.uv.array[index * 2] = u;
    this.uv.array[index * 2 + 1] = v;
    this.alpha.array[index] = a;
  }

  /** Draws the first `count` vertices, uploads only those, and skips empty draws. */
  private finish(count: number): void {
    this.geometry.setDrawRange(0, count);
    this.mesh.visible = count > 0;
    if (count === 0) return;
    for (const attribute of [this.position, this.uv, this.alpha]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }
}
