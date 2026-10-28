import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  CylinderGeometry,
  Group,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type {Object3D} from 'three';
import type {TrackUpdateContext} from '../track';
import type {CircuitAnchor, CircuitDetailLayer} from '../circuit/circuit-track';
import {DetailInstances} from '../circuit/detail-instances';
import {isMesh} from '../scene-utils';

const SIGNAL_MATERIAL = /^(CITY|INFILL)_(cyan|amber|glasslight|glass[0-9]?)$/;

// City-specific life stays on rooftops, leaving the authored streets and
// architectural passage clear. Shared race effects live in circuit-details.
export class NexusDetails implements CircuitDetailLayer {
  readonly group = new Group();
  readonly detailCount: number;
  private readonly fans: Group[] = [];
  private readonly vents: Vector3[] = [];
  private readonly signals = new Set<MeshStandardMaterial>();
  private readonly batches: DetailInstances[];
  private readonly steam: Points<BufferGeometry, PointsMaterial>;
  private readonly positions: Float32Array;
  private readonly count: number;
  private tick = -1;

  constructor(root: Object3D, anchors: CircuitAnchor[], {mobile = false}: {mobile?: boolean} = {}) {
    this.group.name = 'Nexus · actividad urbana';
    root.add(this.group);
    const metal = new MeshStandardMaterial({name: 'CITY_steel', color: 0x4b656b, roughness: 0.6});
    const light = new MeshBasicMaterial({name: 'Light lens', color: 0x72e8ee});
    let detailCount = 0;
    root.traverse((object) => {
      if (!isMesh(object) || Array.isArray(object.material)) return;
      const material = object.material as MeshStandardMaterial;
      if (SIGNAL_MATERIAL.test(material.name ?? '')) this.signals.add(material);
    });
    const selected = anchors.filter((a) => /Factory|Utility|Research|Transit|Logistics/.test(a.name)).slice(0, mobile ? 6 : 10);
    const bases = new DetailInstances(this.group, new CylinderGeometry(1.4, 1.55, 0.4, 12), metal, selected.length, {
      name: 'Bases de ventilación',
    });
    const blades = new DetailInstances(this.group, new BoxGeometry(2.45, 0.08, 0.32), metal, selected.length * 3, {
      name: 'Aspas de ventilación',
      dynamic: true,
    });
    const lenses = new DetailInstances(this.group, new SphereGeometry(0.2, 8, 6), light, selected.length, {
      name: 'Luces de ventilación',
      dynamic: true,
    });
    const beacons = new DetailInstances(this.group, new CylinderGeometry(0.12, 0.12, 1, 6), light, selected.length, {
      name: 'Balizas urbanas',
    });
    this.batches = [bases, blades, lenses, beacons];
    for (const {box, position} of selected) {
      const center = box.getCenter(new Vector3());
      const base = new Group();
      base.position.copy(position ?? new Vector3(center.x, box.max.y, center.z));
      base.position.y += 0.3;
      base.name = 'Ventilación urbana';
      this.group.add(base);
      this.vents.push(base.position.clone());
      bases.add(base);
      detailCount += 6;
      const rotor = new Group();
      rotor.position.y = 0.28;
      base.add(rotor);
      for (let j = 0; j < 3; j++) blades.add(rotor).rotation.y = (j * Math.PI) / 3;
      lenses.add(rotor).position.y = 0.15;
      this.fans.push(rotor);
      beacons.add(base).position.set(1.7, 0.5, 0);
    }
    this.count = this.vents.length * (mobile ? 8 : 14);
    this.positions = new Float32Array(this.count * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.steam = new Points(
      geometry,
      new PointsMaterial({color: 0xc5dbd9, size: 0.7, transparent: true, opacity: 0.24, depthWrite: false}),
    );
    this.steam.name = 'Vapor industrial';
    this.steam.frustumCulled = false;
    this.group.add(this.steam);
    detailCount += this.count;
    this.detailCount = detailCount;
    for (const batch of this.batches) batch.update();
  }

  update(time: number, reduced: boolean, {night = false}: Pick<TrackUpdateContext, 'night'> = {}): void {
    const t = reduced ? 0 : time;
    const next = Math.floor(t * 18);
    for (const material of this.signals) {
      material.emissive.copy(material.color);
      material.emissiveIntensity = (night ? 0.9 : 0.08) * (reduced ? 1 : 0.93 + Math.sin(t * 0.7) * 0.07);
    }
    if (next !== this.tick) {
      this.tick = next;
      this.fans.forEach((fan, i) => (fan.rotation.y = t * (2 + i * 0.15)));
      const {positions, vents} = this;
      for (let i = 0; i < this.count; i++) {
        const origin = vents[i % vents.length];
        const life = (t * 0.18 + i * 0.137) % 1;
        const a = i * 2.4 + t * 0.2;
        positions[i * 3] = origin.x + Math.sin(a) * life * 2;
        positions[i * 3 + 1] = origin.y + 0.6 + life * 7;
        positions[i * 3 + 2] = origin.z + Math.cos(a) * life * 2;
      }
      if (this.count) this.steam.geometry.attributes.position.needsUpdate = true;
    }
    // No vents, no steam draw.
    this.steam.visible = !reduced && this.count > 0;
    for (const batch of this.batches) batch.update();
  }
}
