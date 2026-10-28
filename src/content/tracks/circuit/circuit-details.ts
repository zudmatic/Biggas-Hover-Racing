import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type {Material} from 'three';
import type {Landscape} from '@/sim/landscape';
import type {HoverState} from '@/sim/hover-state';
import type {TrackUpdateContext} from '../track';
import {isMesh} from '../scene-utils';
import {DetailInstances} from './detail-instances';

export interface CircuitDetailsOptions {
  mobile?: boolean;
  /** Urban circuit: drones patrol higher, above the towers. */
  city?: boolean;
  /** Ocean, island rocks, ferns, waterfall mist and ripples (Ruins). */
  islands?: boolean;
  /** Draw the vehicle's hover ring. */
  underglow?: boolean;
}

interface WaveMesh {
  mesh: Mesh;
  base: Float32Array;
  amplitude: number;
}

interface Flag {
  mesh: Mesh;
  base: Float32Array;
  phase: number;
}

interface Cone {
  group: Group;
  origin: Vector3;
  velocity: Vector3;
  spin: number;
  age: number;
  active: boolean;
}

interface Drone {
  group: Group;
  rotors: Object3D[];
  phase: number;
}

interface Particle {
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spark: boolean;
}

const SPARK_COLOR = [1, 0.65, 0.15] as const;
const DRIFT_COLOR = [1, 0.62, 0.2] as const;
const TRAIL_COLOR = [0.42, 0.8, 0.73] as const;

// Deterministic: island shapes, ferns and mist are identical on every load.
function createRandom(): () => number {
  let seed = 34034;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const positionsOf = (mesh: Mesh): BufferAttribute => mesh.geometry.attributes.position as BufferAttribute;

/**
 * Living circuit decoration shared by the generic circuits: flags, knockable
 * cones, patrol drones, road lights, impact sparks and the hover ring; plus
 * ocean, islands, ferns and waterfall mist on island circuits.
 */
export class CircuitDetails {
  readonly group = new Group();
  detailCount = 0;

  private readonly random = createRandom();
  private readonly mobile: boolean;
  private readonly city: boolean;
  private readonly islands: boolean;
  private readonly clay = new MeshStandardMaterial({color: 0xba572e, roughness: 0.9});
  private readonly ivory = new MeshStandardMaterial({color: 0xe3dcc0, roughness: 0.85});
  private readonly metal = new MeshStandardMaterial({color: 0x314b47, roughness: 0.7});
  private readonly green = new MeshStandardMaterial({color: 0x6c874b, roughness: 1});
  private readonly ink = new MeshBasicMaterial({color: 0x8ad8cc});
  private readonly fabric: MeshStandardMaterial;
  private readonly fabricIvory: MeshStandardMaterial;
  private readonly transforms = new Object3D();
  private readonly waves: WaveMesh[] = [];
  private readonly flags: Flag[] = [];
  private readonly cones: Cone[] = [];
  private readonly drones: Drone[] = [];
  private readonly ripples: Mesh<TorusGeometry, MeshBasicMaterial>[] = [];
  private readonly batches: DetailInstances[];
  private readonly poles: DetailInstances;
  private readonly coneBases: DetailInstances;
  private readonly coneBodies: DetailInstances;
  private readonly coneStripes: DetailInstances;
  private mist!: Points<BufferGeometry, PointsMaterial>;
  private mistPositions!: Float32Array;
  private mistSeeds: [number, number, number][] = [];
  private sparks!: Points<BufferGeometry, PointsMaterial>;
  private sparkPositions!: Float32Array;
  private sparkColors!: Float32Array;
  private particles: Particle[] = [];
  private hover!: Mesh<RingGeometry, MeshBasicMaterial>;
  private cursor = 0;
  private impactSerial = 0;
  private lastAnimation = -1;
  private colorsDirty = true;

  constructor(
    private readonly root: Object3D,
    private readonly landscape: Landscape,
    {mobile = false, city = false, islands = !city, underglow = true}: CircuitDetailsOptions = {},
  ) {
    this.mobile = mobile;
    this.city = city;
    this.islands = islands;
    this.group.name = 'Circuito · ambiente vivo';
    root.add(this.group);
    this.clay.name = 'Paint · cones';
    this.ivory.name = 'Paint · ivory';
    this.metal.name = 'Metal';
    this.green.name = 'Foliage';
    this.ink.name = 'Light lens';
    this.fabric = this.clay.clone();
    this.fabricIvory = this.ivory.clone();
    this.fabric.name = this.fabricIvory.name = 'Cloth';
    const details = this.group;
    this.poles = new DetailInstances(details, new CylinderGeometry(0.055, 0.085, 4.7, 6), this.metal, 12, {name: 'Postes de banderas'});
    this.coneBases = new DetailInstances(details, new BoxGeometry(0.48, 0.08, 0.48), this.metal, 16, {
      name: 'Bases de conos',
      dynamic: true,
    });
    this.coneBodies = new DetailInstances(details, new ConeGeometry(0.2, 0.65, 6), this.clay, 16, {name: 'Conos', dynamic: true});
    this.coneStripes = new DetailInstances(details, new CylinderGeometry(0.08, 0.12, 0.13, 6), this.ivory, 16, {
      name: 'Franjas de conos',
      dynamic: true,
    });
    this.batches = [this.poles, this.coneBases, this.coneBodies, this.coneStripes];

    // Build order matters: every builder draws from the same seeded sequence.
    // Water retains the authored materials; moving vertices also work with the comic pass.
    for (const child of root.children) if (isMesh(child) && /^ENV_water/.test(child.name)) this.registerWave(child, 0.065);
    if (islands) this.buildOcean();
    if (islands) this.buildIslands();
    this.buildRoadLights();
    this.buildFlags();
    this.buildFerns();
    this.buildCones();
    this.buildDrones();
    this.buildMist();
    this.buildRipples();
    this.buildSparks(underglow);
    for (const batch of this.batches) batch.update();
  }

  step(state: HoverState, dt: number): void {
    const {landscape} = this;
    for (const cone of this.cones) {
      const position = cone.group.position;
      if (
        !cone.active &&
        Math.hypot(position.x - state.x, position.z - state.z) < 1.85 &&
        Math.abs(position.y - state.y) < 2 &&
        state.speed > 2
      ) {
        cone.active = true;
        cone.age = 0;
        cone.velocity.set(state.vx * 0.55, 2.2, state.vz * 0.55);
        cone.spin = (this.random() - 0.5) * 10;
        state.vx *= 0.985;
        state.vz *= 0.985;
        state.speed = Math.hypot(state.vx, state.vz);
      }
      if (!cone.active) continue;
      cone.age += dt;
      cone.velocity.y -= 9.8 * dt;
      position.addScaledVector(cone.velocity, dt);
      cone.group.rotation.z += cone.spin * dt;
      cone.group.rotation.x += dt * 2;
      const floor = landscape.roadAt(position.x, position.z);
      if (Math.abs(floor.offset) < floor.width / 2 && position.y < floor.y + 0.18) {
        position.y = floor.y + 0.18;
        cone.velocity.y = Math.abs(cone.velocity.y) * 0.22;
        cone.velocity.x *= Math.exp(-dt * 4);
        cone.velocity.z *= Math.exp(-dt * 4);
        cone.spin *= Math.exp(-dt * 4);
      }
      if (cone.age > 8) {
        position.copy(cone.origin);
        cone.group.rotation.set(0, 0, 0);
        cone.active = false;
      }
    }
  }

  reset(): void {
    this.impactSerial = 0;
    for (const cone of this.cones) {
      cone.active = false;
      cone.group.position.copy(cone.origin);
      cone.group.rotation.set(0, 0, 0);
    }
    for (const particle of this.particles) particle.life = 0;
    for (const batch of this.batches) batch.update();
  }

  update(time: number, reduced: boolean, {state, phase, dt = 0}: TrackUpdateContext): void {
    const t = reduced ? 0 : time;
    const tick = Math.floor(t * 18);
    if (tick !== this.lastAnimation) {
      this.lastAnimation = tick;
      this.animate(t);
    }
    // An empty mist pool (no waterfall) is never drawn.
    this.mist.visible = !reduced && this.mistSeeds.length > 0;
    this.sparks.visible = !reduced;
    const hover = this.hover;
    hover.position.set(state.x, state.y - state.hover + 0.06, state.z);
    hover.scale.set(1.1 + state.speed * 0.004, 1, 1.65);
    hover.rotation.y = state.yaw;
    hover.material.opacity = state.boosting || state.drifting ? 0.32 : 0.16;
    hover.material.color.setHex(state.drifting ? 0xffb24c : 0x64ddc7);
    if (!reduced && dt > 0 && phase === 'flying' && state.impactSerial !== this.impactSerial) {
      this.impactSerial = state.impactSerial;
      if (state.impact > 1) {
        for (let i = 0; i < 18; i++)
          this.emit(state.impactX ?? state.x, state.y + 0.2, state.impactZ ?? state.z, -state.vx * 0.1, -state.vz * 0.1, true);
      }
    }
    this.updateSparks(dt);
    for (const batch of this.batches) batch.update();
  }

  // 18 Hz cosmetic animation: water, flags, drones, mist and ripples.
  private animate(t: number): void {
    for (const {mesh, base, amplitude} of this.waves) {
      const p = positionsOf(mesh);
      const array = p.array as Float32Array;
      for (let i = 0; i < p.count; i++)
        array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(base[i * 3] * 0.24 + base[i * 3 + 2] * 0.18 + t * 1.6) * amplitude;
      p.needsUpdate = true;
    }
    for (const {mesh, base, phase} of this.flags) {
      const p = positionsOf(mesh);
      const array = p.array as Float32Array;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3];
        array[i * 3 + 2] = Math.sin(t * 3.3 + x * 2.8 + phase) * 0.16 * x;
        array[i * 3 + 1] = base[i * 3 + 1] + Math.cos(t * 2.6 + x * 2 + phase) * 0.035 * x;
      }
      p.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
    for (const {group, rotors, phase} of this.drones) {
      const a = t * 0.045 + phase;
      group.position.set(Math.cos(a) * 120, (this.city ? 115 : 65) + Math.sin(a * 2) * 4, Math.sin(a) * 80);
      group.rotation.y = -a;
      rotors.forEach((rotor, i) => (rotor.rotation.y = t * 35 * (i % 2 ? 1 : -1)));
    }
    const mist = this.mistPositions;
    this.mistSeeds.forEach(([a, b, c], i) => {
      const outer = i % 3 === 0;
      const top = outer ? 15 : 18;
      const bottom = outer ? -5.46 : 1.54;
      const f = (b + t * 0.55) % 1;
      mist[i * 3] = (outer ? -72 : 0) + (a - 0.5) * (outer ? 7 : 9);
      mist[i * 3 + 1] = top - (top - bottom) * f;
      mist[i * 3 + 2] = (outer ? 73 : -19) - f * 4 + c * 0.3;
    });
    if (this.mistSeeds.length) this.mist.geometry.attributes.position.needsUpdate = true;
    this.ripples.forEach((ring, i) => {
      const life = (t * 0.4 + i / 14) % 1;
      ring.scale.setScalar(0.5 + life * 3);
      ring.material.opacity = (1 - life) * 0.35;
    });
  }

  private updateSparks(dt: number): void {
    const positions = this.sparkPositions;
    let changed = false;
    this.particles.forEach((p, i) => {
      if (dt > 0) {
        p.life -= dt;
        if (p.life > 0) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.spark) p.vy -= 12 * dt;
        }
      }
      const alive = p.life > 0;
      const x = alive ? p.x : -999;
      const y = alive ? p.y : -999;
      const z = alive ? p.z : -999;
      if (positions[i * 3] !== x || positions[i * 3 + 1] !== y || positions[i * 3 + 2] !== z) {
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        changed = true;
      }
    });
    // Upload only what changed: an idle pool costs no buffer writes.
    const attributes = this.sparks.geometry.attributes;
    if (changed) attributes.position.needsUpdate = true;
    if (this.colorsDirty) {
      attributes.color.needsUpdate = true;
      this.colorsDirty = false;
    }
  }

  private emit(x: number, y: number, z: number, vx: number, vz: number, spark = false, drift = false): void {
    const random = this.random;
    const index = this.cursor++ % this.particles.length;
    const p = this.particles[index];
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx + (random() - 0.5) * (spark ? 5 : 0.8);
    p.vy = random() * (spark ? 5 : 0.45);
    p.vz = vz + (random() - 0.5) * (spark ? 5 : 0.8);
    p.life = spark ? 0.25 + random() * 0.45 : 0.35 + random() * 0.4;
    p.spark = spark;
    this.sparkColors.set(spark ? SPARK_COLOR : drift ? DRIFT_COLOR : TRAIL_COLOR, index * 3);
    this.colorsDirty = true;
  }

  private make<G extends BufferGeometry, M extends Material>(geometry: G, material: M, parent: Object3D = this.group): Mesh<G, M> {
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private registerWave(mesh: Mesh, amplitude: number): void {
    const position = positionsOf(mesh);
    this.waves.push({mesh, base: (position.array as Float32Array).slice(), amplitude});
    position.setUsage(DynamicDrawUsage);
  }

  private buildOcean(): void {
    const segments = this.mobile ? 40 : 70;
    const sea = this.make(
      new PlaneGeometry(6000, 6000, segments, segments).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({color: 0x145459, roughness: 0.48, metalness: 0.15, flatShading: true}),
    );
    sea.name = 'Océano';
    sea.position.y = -6.2;
    sea.castShadow = false;
    this.registerWave(sea, 0.24);
  }

  private islandGeometry(radius: number, height: number): BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const levels = [0, 0.12, 0.34, 0.4, 0.65, 0.7, 1];
    const radii = [0.92, 1, 0.94, 0.77, 0.72, 0.5, 0.35];
    const sides = 9;
    const variation = Array.from({length: sides}, () => 0.8 + this.random() * 0.35);
    levels.forEach((y, j) => {
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const r = radius * radii[j] * variation[i];
        positions.push(Math.cos(a) * r + height * y * 0.12, y * height, Math.sin(a) * r * 0.7);
      }
    });
    for (let j = 0; j < levels.length - 1; j++) {
      for (let i = 0; i < sides; i++) {
        const a = j * sides + i;
        const b = j * sides + ((i + 1) % sides);
        indices.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
    positions.push(height * 0.12, height, 0);
    const top = positions.length / 3 - 1;
    for (let i = 0; i < sides; i++) indices.push(top, (levels.length - 1) * sides + ((i + 1) % sides), (levels.length - 1) * sides + i);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private buildIslands(): void {
    const random = this.random;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const rad = 340 + random() * 300;
      const height = 35 + random() * 85;
      const geometry = this.islandGeometry(45 + random() * 60, height);
      const island = this.make(geometry, new MeshStandardMaterial({color: i % 2 ? 0x627568 : 0x4e6862, flatShading: true, roughness: 1}));
      island.name = 'Island rock';
      island.position.set(Math.cos(a) * rad, -12, Math.sin(a) * rad);
      island.rotation.y = random() * 6;
      this.detailCount++;
    }
  }

  private buildRoadLights(): void {
    const {landscape, transforms} = this;
    const lights = new InstancedMesh(new BoxGeometry(0.2, 0.13, 0.6), this.ink, 200);
    this.group.add(lights);
    for (let i = 0; i < 100; i++) {
      for (let side = -1; side <= 1; side += 2) {
        const road = landscape.atDistance((i * landscape.length) / 100);
        transforms.position.set(
          road.x - road.nz * (road.width / 2 - 0.17) * side,
          road.y + 0.16,
          road.z + road.nx * (road.width / 2 - 0.17) * side,
        );
        transforms.rotation.set(0, Math.atan2(road.nx, road.nz), 0);
        transforms.scale.set(1, 1, 1);
        transforms.updateMatrix();
        lights.setMatrixAt(i * 2 + (side === 1 ? 1 : 0), transforms.matrix);
      }
    }
    this.detailCount += 200;
  }

  private buildFlags(): void {
    const {landscape} = this;
    for (let i = 0; i < 12; i++) {
      const road = landscape.atDistance(25 + (i * landscape.length) / 12);
      const side = i % 2 ? 1 : -1;
      const group = new Group();
      group.position.set(road.x - road.nz * (road.width / 2 + 0.8) * side, road.y, road.z + road.nx * (road.width / 2 + 0.8) * side);
      group.rotation.y = Math.atan2(road.nx, road.nz);
      this.group.add(group);
      const pole = this.poles.add(group);
      pole.position.y = 2.35;
      const cloth = this.make(new PlaneGeometry(2, 1.05, 8, 3).translate(1, 0, 0), i % 3 === 0 ? this.fabricIvory : this.fabric, group);
      cloth.name = 'Bandera';
      cloth.material.side = DoubleSide;
      cloth.position.y = 3.95;
      cloth.castShadow = false;
      this.flags.push({mesh: cloth, base: (positionsOf(cloth).array as Float32Array).slice(), phase: i * 0.6});
      this.detailCount += 2;
    }
  }

  // Ferns and broken masonry are anchored to existing cliff surfaces, clear of the roadway.
  private buildFerns(): void {
    const {landscape, random, root, transforms} = this;
    const terrain = root.children.filter((m) => isMesh(m) && /^ENV_/.test(m.name) && /rock|moss|concrete/.test(m.name));
    const ray = new Raycaster();
    const down = new Vector3(0, -1, 0);
    const locations: Vector3[] = [];
    root.updateMatrixWorld(true);
    const attempts = !this.islands ? 0 : this.mobile ? 75 : 150;
    for (let i = 0; i < attempts; i++) {
      const road = landscape.atDistance(random() * landscape.length);
      const offset = (8 + random() * 12) * (random() > 0.5 ? 1 : -1);
      const x = road.x - road.nz * offset;
      const z = road.z + road.nx * offset;
      ray.set(new Vector3(x, 90, z), down);
      const hit = ray.intersectObjects(terrain, false)[0];
      if (hit && hit.point.y > 0 && hit.point.y < road.y + 7) locations.push(hit.point.clone());
    }
    const ferns = new InstancedMesh(new ConeGeometry(0.25, 1.1, 4), this.green, locations.length * 3);
    this.group.add(ferns);
    ferns.castShadow = true;
    ferns.visible = ferns.count > 0;
    locations.forEach((p, i) => {
      for (let j = 0; j < 3; j++) {
        transforms.position.set(p.x + (j - 1) * 0.25, p.y + 0.4, p.z);
        transforms.rotation.set((random() - 0.5) * 0.4, random() * 6, (j - 1) * 0.5);
        transforms.scale.setScalar(0.6 + random() * 0.7);
        transforms.updateMatrix();
        ferns.setMatrixAt(i * 3 + j, transforms.matrix);
      }
    });
    this.detailCount += locations.length * 3;
  }

  private buildCones(): void {
    const {landscape} = this;
    for (let i = 0; i < 16; i++) {
      const road = landscape.atDistance(80 + (i * (landscape.length - 100)) / 16);
      const side = i % 2 ? 1 : -1;
      const group = new Group();
      group.position.set(
        road.x - road.nz * (road.width / 2 - 0.55) * side,
        road.y + 0.04,
        road.z + road.nx * (road.width / 2 - 0.55) * side,
      );
      this.group.add(group);
      this.coneBases.add(group).position.y = 0.04;
      this.coneBodies.add(group).position.y = 0.39;
      this.coneStripes.add(group).position.y = 0.45;
      group.name = 'Cono dinámico';
      this.cones.push({group, origin: group.position.clone(), velocity: new Vector3(), spin: 0, age: 0, active: false});
      this.detailCount += 3;
    }
  }

  // Small maintenance drones patrol above the towers, safely outside the racing volume.
  private buildDrones(): void {
    for (let i = 0; i < 2; i++) {
      const group = new Group();
      this.group.add(group);
      this.make(new BoxGeometry(1.3, 0.5, 1.5), this.metal, group);
      const lens = this.make(new SphereGeometry(0.17, 8, 6), this.ink, group);
      lens.position.set(0, 0, 0.8);
      const rotorGroup = new Group();
      group.add(rotorGroup);
      for (const x of [-1, 1]) {
        for (const z of [-0.9, 0.9]) {
          const motor = this.make(new CylinderGeometry(0.2, 0.2, 0.15, 6), this.clay, group);
          motor.position.set(x, 0.2, z);
          const rotor = this.make(new BoxGeometry(1.4, 0.03, 0.12), this.metal, rotorGroup);
          rotor.position.set(x, 0.32, z);
        }
      }
      this.drones.push({group, rotors: rotorGroup.children, phase: i * Math.PI});
      this.detailCount += 10;
    }
  }

  private buildMist(): void {
    const count = !this.islands ? 0 : this.mobile ? 60 : 130;
    this.mistPositions = new Float32Array(count * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.mistPositions, 3));
    this.mist = new Points(
      geometry,
      new PointsMaterial({color: 0xc9e4d4, size: 0.23, transparent: true, opacity: 0.65, depthWrite: false}),
    );
    this.mist.frustumCulled = false;
    this.group.add(this.mist);
    const random = this.random;
    this.mistSeeds = Array.from({length: count}, (): [number, number, number] => [random(), random(), random()]);
    this.detailCount += count;
  }

  private buildRipples(): void {
    const random = this.random;
    const count = this.islands ? 14 : 0;
    for (let i = 0; i < count; i++) {
      const ring = this.make(
        new TorusGeometry(0.5, 0.018, 3, 16).rotateX(Math.PI / 2),
        new MeshBasicMaterial({color: 0xafdad0, transparent: true, opacity: 0.4, depthWrite: false}),
      );
      ring.position.set((random() - 0.5) * 11, 1.64, -23 - random() * 3);
      ring.castShadow = false;
      this.ripples.push(ring);
    }
    this.detailCount += count;
  }

  private buildSparks(underglow: boolean): void {
    const poolSize = this.mobile ? 90 : 180;
    this.sparkPositions = new Float32Array(poolSize * 3).fill(-999);
    this.sparkColors = new Float32Array(poolSize * 3);
    this.particles = Array.from({length: poolSize}, () => ({life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spark: false}));
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.sparkPositions, 3));
    geometry.setAttribute('color', new BufferAttribute(this.sparkColors, 3));
    this.sparks = new Points(
      geometry,
      new PointsMaterial({size: 0.11, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false}),
    );
    this.sparks.name = 'Estela y chispas';
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);
    this.hover = this.make(
      new RingGeometry(0.6, 1.2, 32).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({color: 0x64ddc7, transparent: true, opacity: 0.18, depthWrite: false, side: DoubleSide}),
    );
    this.hover.castShadow = false;
    this.hover.visible = underglow;
  }
}
