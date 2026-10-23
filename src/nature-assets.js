import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

// Geometry and texture sources belong to this cache. Each consumer gets its
// own object hierarchy and creates its own materials/lighting uniforms.
export function createNatureAssetCache() {
  const models=new Map(),images=new Map(),manager=new THREE.LoadingManager();
  const textures=new THREE.TextureLoader(manager);
  manager.addHandler(/\.(png|jpe?g|webp)(?:\?.*)?$/i,{
    load(url,onLoad,onProgress,onError){
      if(!images.has(url))images.set(url,textures.loadAsync(url).catch(error=>{images.delete(url);throw error;}));
      images.get(url).then(texture=>onLoad(texture.clone()),onError);
    },
  });
  const loader=new GLTFLoader(manager);
  return {
    async load(name){
      if(!models.has(name))models.set(name,loader.loadAsync(`${import.meta.env.BASE_URL}models/nature/${name}.gltf`)
        .catch(error=>{models.delete(name);throw error;}));
      const gltf=await models.get(name);
      return {scene:gltf.scene.clone(true)};
    },
  };
}
export const natureAssets=createNatureAssetCache();
