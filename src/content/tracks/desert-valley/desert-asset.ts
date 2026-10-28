import {Group} from 'three';
import type {Object3D} from 'three';
import type {GLTF} from '@/core/assets/asset-loader';

/** One authored placement of a detail family (column-major world matrix). */
export interface DesertDetailPlacement {
  matrix: number[];
  source?: string;
  parent?: string;
}

/** A detail species/rock with three LOD prototypes and its placements. */
export interface DesertDetailFamily {
  id: string;
  role: string;
  /** Prototype node names for LOD 0, 1 and 2. */
  nodes: string[];
  /** Triangles per instance at each LOD. */
  triangles: [number, number, number];
  /** Ship distances where LOD 1 and LOD 2 start. */
  distances: [number, number];
  /** Beyond this distance the instance is not drawn (null: never culled). */
  cullDistance: number | null;
  placements: DesertDetailPlacement[];
  /** Authored scenery object this family replaces visually. */
  replacesSource?: string;
}

export interface DesertDetailReplacement {
  source: string;
  node: string;
}

/** `desertDetailManifest` in the GLB scene extras. */
export interface DesertDetailManifest {
  families: DesertDetailFamily[];
  replacements: DesertDetailReplacement[];
  hysteresis: number;
  instanceCount: number;
  vegetationCount: number;
}

export interface DesertRuntimeData {
  /** LOD prototypes and replacement meshes (never shown as they are). */
  details: Object3D | undefined;
  /** Original collision-only scenery replaced by visual details. */
  collisions: Object3D | undefined;
  /** Full-detail placed instances for ordinary viewers. */
  placed: Object3D | undefined;
  manifest: DesertDetailManifest | undefined;
}

// Optimizers may remove identity-only grouping nodes. Recover their roles from
// the retained scene and mesh metadata, without changing authored transforms.
export function extractDesertRuntimeData(asset: GLTF): DesertRuntimeData {
  const root = asset.scene;
  const manifest = root.userData.desertDetailManifest as DesertDetailManifest | undefined;
  const runtime = asset.scenes.find((scene) => scene.userData.desertRuntimeData === true);
  root.updateMatrixWorld(true);
  runtime?.updateMatrixWorld(true);
  let details = runtime?.getObjectByName('DESERT_VISUAL_DETAILS') ?? root.getObjectByName('DESERT_VISUAL_DETAILS');
  let collisions = runtime?.getObjectByName('DESERT_COLLISION_REPLACEMENTS');
  let placed = root.getObjectByName('DESERT_PLACED_DETAILS');
  if (runtime && manifest?.families) {
    if (!details) {
      const group = new Group();
      group.name = 'DESERT_VISUAL_DETAILS';
      const names = new Set([...manifest.families.flatMap((f) => f.nodes), ...manifest.replacements.map((r) => r.node)]);
      const nodes: Object3D[] = [];
      runtime.traverse((node) => {
        if (names.has(node.name)) nodes.push(node);
      });
      for (const node of nodes) group.attach(node);
      details = group;
    }
    if (!collisions) {
      const group = new Group();
      group.name = 'DESERT_COLLISION_REPLACEMENTS';
      const sources = new Set(
        [...manifest.families.map((f) => f.replacesSource), ...manifest.replacements.map((r) => r.source)].filter(Boolean),
      );
      const nodes: Object3D[] = [];
      runtime.traverse((node) => {
        if (node.userData.role === 'vegetation' || sources.has(node.userData.source_object as string | undefined)) nodes.push(node);
      });
      for (const node of nodes) group.attach(node);
      collisions = group;
    }
    if (!placed) {
      const group = new Group();
      group.name = 'DESERT_PLACED_DETAILS';
      const nodes: Object3D[] = [];
      root.traverse((node) => {
        if (node.userData.visualDetail && node.userData.detailFamily) nodes.push(node);
      });
      for (const node of nodes) group.attach(node);
      placed = group;
    }
  }
  return {details, collisions, placed, manifest};
}
