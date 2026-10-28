import type {CheckpointData, GameplayData, RouteData, RouteSample, SpawnPosition, Vec3Array} from '@/sim/route-data';

/** driving-guides.json: polylines modelled along each road section. */
export interface DrivingGuides {
  map_size_m: number;
  map_half_m?: number;
  guides: DrivingGuide[];
}

export interface DrivingGuide {
  /** "S07_ROUTE <section> - <label>". */
  name: string;
  length_m?: number;
  points_gltf: Vec3Array[];
}

/** The legacy gameplay.json, authored for an older map scale. */
export interface DesertLegacyGameplay extends GameplayData {
  map_size_m: number;
  road_width_m: number;
}

export interface DesertRouteSample extends RouteSample {
  width_m: number;
  /** Guide section the sample was taken from. */
  section: number;
}

export interface DesertRouteSection {
  section: number;
  start: number;
  count: number;
}

export interface DesertRoute extends RouteData {
  samples: DesertRouteSample[];
  sections: DesertRouteSection[];
  shortcut: Vec3Array[];
  shortcut_length_m: number;
  start?: {name: string; position: Vec3Array; forward: Vec3Array};
}

export interface DesertGameplay extends DesertLegacyGameplay {
  checkpoints: CheckpointData[];
  spawn_positions: SpawnPosition[];
}

// Modeling guides use the current 875 m scene. Keep the legacy gameplay JSON
// as a template for gate order/spawn intent, and project it onto these guides.
const MAIN_SECTIONS = [1, 2, 4, 5, 6, 7];
const SAMPLE_SPACING = 4.5;

export const DESERT_START = Object.freeze({
  sourceObject: 'SM_S17_FuelCanopy',
  fallbackPosition: [-20, 21.1, -319.2] as Vec3Array,
  gridBehindLineM: 8,
  gridTowardStationM: 6,
  minimumGateSpacingM: 45,
});

const distance = (a: Vec3Array, b: Vec3Array): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const lerp3 = (a: Vec3Array, b: Vec3Array, t: number): Vec3Array => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function measure(points: Vec3Array[]): {points: Vec3Array[]; distances: number[]; length: number} {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + distance(points[i - 1], points[i]));
  return {points, distances, length: distances[distances.length - 1]};
}

function resample(guide: DrivingGuide, includeEnd = false): {samples: {position: Vec3Array; distance_m: number}[]; length: number} {
  const {points, distances, length} = measure(guide.points_gltf);
  const count = Math.max(1, Math.ceil(length / SAMPLE_SPACING));
  const samples: {position: Vec3Array; distance_m: number}[] = [];
  let segment = 0;
  for (let i = 0; i < count + (includeEnd ? 1 : 0); i++) {
    const d = (i * length) / count;
    while (segment < points.length - 2 && distances[segment + 1] < d) segment++;
    const t = (d - distances[segment]) / (distances[segment + 1] - distances[segment] || 1);
    samples.push({position: lerp3(points[segment], points[segment + 1], t), distance_m: d});
  }
  return {samples, length};
}

export function createDesertRoute(
  guides: DrivingGuides,
  legacyGameplay: DesertLegacyGameplay,
  startAnchor: Vec3Array = DESERT_START.fallbackPosition,
): {route: DesertRoute; gameplay: DesertGameplay} {
  const bySection = new Map(guides.guides.map((guide) => [Number(guide.name.match(/S07_ROUTE\s+(\d+)/)?.[1]), guide]));
  const guide = (section: number): DrivingGuide => {
    const found = bySection.get(section);
    if (!found) throw new Error(`Desert Valley: falta la guía ${section}.`);
    return found;
  };
  const scale = guides.map_size_m / legacyGameplay.map_size_m;
  const roadWidth = legacyGameplay.road_width_m * scale;
  const samples: DesertRouteSample[] = [];
  const sections: DesertRouteSection[] = [];
  let length = 0;
  for (const section of MAIN_SECTIONS) {
    const part = resample(guide(section));
    const start = samples.length;
    for (const sample of part.samples)
      samples.push({...sample, distance_m: length + sample.distance_m, width_m: section === 7 ? 80 * scale : roadWidth, section});
    sections.push({section, start, count: part.samples.length});
    length += part.length;
  }
  const shortcut = resample(guide(3), true);
  const detour = measure(guide(2).points_gltf).length;
  const route: DesertRoute = {
    length_m: length,
    samples,
    sections,
    shortcut: shortcut.samples.map((sample) => sample.position),
    shortcut_length_m: length - detour + shortcut.length,
  };

  function nearestIndex(position: Vec3Array): number {
    let best = Infinity;
    let index = 0;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i].position;
      const d = (position[0] - p[0]) ** 2 + (position[2] - p[2]) ** 2;
      if (d < best) {
        best = d;
        index = i;
      }
    }
    return index;
  }
  function forwardAt(index: number): Vec3Array {
    const a = samples[index].position;
    const b = samples[(index + 1) % samples.length].position;
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return [(b[0] - a[0]) / length, 0, (b[2] - a[2]) / length];
  }

  // Start on the road in front of the authored fuel canopy, facing the
  // northern guide toward the asphalt/obstacle-shortcut junction.
  const startIndex = nearestIndex(startAnchor);
  const startDistance = samples[startIndex].distance_m;
  const rotated = [...samples.slice(startIndex), ...samples.slice(0, startIndex)];
  for (const sample of rotated) sample.distance_m = (sample.distance_m - startDistance + length) % length;
  samples.splice(0, samples.length, ...rotated);
  sections.length = 0;
  samples.forEach((sample, index) => {
    const last = sections[sections.length - 1];
    if (last?.section === sample.section) last.count++;
    else sections.push({section: sample.section, start: index, count: 1});
  });
  const candidates = legacyGameplay.checkpoints
    .map((checkpoint) => {
      const index = nearestIndex(checkpoint.position_gltf.map((v) => v * scale) as Vec3Array);
      return {
        ...checkpoint,
        position_gltf: [...samples[index].position] as Vec3Array,
        forward_gltf: forwardAt(index),
        width_m: (checkpoint.width_m ?? legacyGameplay.road_width_m) * scale,
        route_index: index,
      };
    })
    .filter((cp) => samples[cp.route_index].section !== 2)
    .sort((a, b) => samples[a.route_index].distance_m - samples[b.route_index].distance_m);
  // Gates lie on the common route. Taking the shortcut must not leave an
  // unvisited mandatory checkpoint on the asphalt detour.
  const checkpoints: CheckpointData[] = [
    {order: 0, position_gltf: [...samples[0].position], forward_gltf: forwardAt(0), width_m: roadWidth, route_index: 0},
  ];
  let lastDistance = 0;
  for (const checkpoint of candidates) {
    const d = samples[checkpoint.route_index].distance_m;
    if (d - lastDistance < DESERT_START.minimumGateSpacingM || length - d < DESERT_START.minimumGateSpacingM) continue;
    checkpoints.push({...checkpoint, order: checkpoints.length});
    lastDistance = d;
  }
  const start = samples[0].position;
  const forward = forwardAt(0);
  const right: Vec3Array = [forward[2], 0, -forward[0]];
  const side = Math.sign((startAnchor[0] - start[0]) * right[0] + (startAnchor[2] - start[2]) * right[2]) || 1;
  const offset = Math.min(DESERT_START.gridTowardStationM, roadWidth / 2 - 3);
  const spawn_positions: SpawnPosition[] = [
    {
      position_gltf: start.map((v, k) => v - forward[k] * DESERT_START.gridBehindLineM + right[k] * offset * side) as Vec3Array,
      forward_gltf: forward,
    },
  ];
  route.start = {name: 'Fuel station', position: [...start], forward: [...forward]};
  return {route, gameplay: {...legacyGameplay, map_size_m: guides.map_size_m, road_width_m: roadWidth, checkpoints, spawn_positions}};
}
