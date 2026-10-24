import {WebGPURenderer} from 'three/webgpu';

// Every production view uses the same node renderer. WebGL2 is its fallback,
// not a separate set of shaders or gameplay effects.
export async function createGameRenderer(canvas,options={}){
  const renderer=new WebGPURenderer({canvas,antialias:true,
    forceWebGL:new URLSearchParams(location.search).get('renderer')==='webgl2',...options});
  try{await renderer.init();}
  catch(error){renderer.dispose();throw error;}
  canvas.dataset.backend=renderer.backend.isWebGPUBackend?'WebGPU':'WebGL2';
  renderer.onDeviceLost=info=>{if(info.reason!=='destroyed')canvas.dispatchEvent(new Event('graphicslost'));};
  return renderer;
}
