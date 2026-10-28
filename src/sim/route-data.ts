/** JSON formats exported from Blender for each track (public/models/<track>/). */

export type Vec3Array = [number, number, number];

/** route_gltf.json: the closed driving line, sampled every few metres. */
export interface RouteData {
  length_m: number;
  samples: RouteSample[];
  /** Desert Valley: optional shortcut polyline drawn on the minimap. */
  shortcut?: Vec3Array[];
}

export interface RouteSample {
  index?: number;
  distance_m: number;
  position: Vec3Array;
  forward?: Vec3Array;
  width_m?: number;
}

/** gameplay.json: checkpoints and grid. Coordinates in glTF space (+Y up). */
export interface GameplayData {
  name?: string;
  lap_length_m?: number;
  road_width_m?: number;
  start_route_distance_m?: number;
  spawn_positions: SpawnPosition[];
  checkpoints: CheckpointData[];
}

export interface SpawnPosition {
  grid_position?: number;
  route_index?: number;
  position_gltf: Vec3Array;
  forward_gltf: Vec3Array;
}

export interface CheckpointData {
  order: number;
  route_index: number;
  position_gltf: Vec3Array;
  forward_gltf: Vec3Array;
  width_m?: number;
  height_m?: number;
}
