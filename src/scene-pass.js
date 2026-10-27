import {DepthStencilFormat,UnsignedInt248Type} from 'three';
import {pass} from 'three/tsl';

// Shared by comic and natural looks; preserves the pilot's stencil silhouette.
export function createScenePass(renderer,scene,camera,samples){
  const scenePass=pass(scene,camera,{samples,stencilBuffer:true});
  // Bluleet's paper edge belongs outside his silhouette, never over his eyes
  // or jacket. A shared depth/stencil attachment supports that mask on both backends.
  scenePass.renderTarget.depthTexture.format=DepthStencilFormat;
  scenePass.renderTarget.depthTexture.type=UnsignedInt248Type;
  if(renderer.backend.isWebGPUBackend){
    // Three 0.182's binding cache creates combined depth/stencil sample views
    // with aspect "all", which WebGPU rejects. Cache a depth-only sample view
    // after this pass creates/resizes its attachment. The render attachment
    // still uses both aspects. Remove when Three's binding utility handles it.
    const renderPass=scenePass.updateBefore;let lastTexture;
    scenePass.updateBefore=function(frame){
      renderPass.call(this,frame);
      const data=renderer.backend.get(this.renderTarget.depthTexture),gpu=data.texture;
      if(gpu&&gpu!==lastTexture){
        data[`view-${gpu.width}-${gpu.height}-${gpu.mipLevelCount}-0`]=gpu.createView({aspect:'depth-only',dimension:'2d',mipLevelCount:gpu.mipLevelCount,baseMipLevel:0});lastTexture=gpu;
      }
    };
  }
  return scenePass;
}
