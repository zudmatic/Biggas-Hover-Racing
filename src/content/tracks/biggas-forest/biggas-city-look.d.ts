import type {Object3D} from 'three';
import type {Renderer,UniformNode} from 'three/webgpu';
export interface ForestLook {
  readonly warmth:UniformNode<number>;
  readonly settings: {enabled:boolean;warmth:number;jitter:number;resolution:number};
  setOverride(mode:'base'|'jitter'|'ps2'|null):void;
  update(options?:{enabled?:boolean;reducedMotion?:boolean}):void;
  dispose():void;
}
export function createBiggasCityLook(scene:Object3D,renderer:Pick<Renderer,'getDrawingBufferSize'>):ForestLook;
