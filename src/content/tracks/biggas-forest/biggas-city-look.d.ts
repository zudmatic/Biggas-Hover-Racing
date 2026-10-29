import type {Object3D} from 'three';
import type {Renderer} from 'three/webgpu';
import type {ForestLook} from './forest-anime-look';
export type {ForestLook} from './forest-anime-look';
export function createBiggasCityLook(scene:Object3D,renderer?:Pick<Renderer,'getDrawingBufferSize'>):ForestLook;
