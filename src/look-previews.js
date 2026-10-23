import * as THREE from 'three';
import {createCharacterHats} from './character-hats.js';
import {hatDefaults} from './hat-catalog.js';
import {createPrintPass} from './retro-print.js';
import {applySceneMaterials} from './scene-materials.js';
import {createRetroLighting} from './retro-lighting.js';
import {retroStyle} from './retro-style.js';

// Use the very same fitting pipeline as the worn hats. The preview roots keep
// only a head (for fitting) and the original beanie; no character is rendered.
export function createLookPreviews({container,buttons,model,getSettings,reducedMotion}) {
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
  // Share the room's live comic/mono uniforms, but keep the paper transparent
  // so the floating models compose directly over the blurred scene.
  const print=createPrintPass(renderer,{transparent:true,comic:true});
  renderer.domElement.className='look-preview-canvas';renderer.domElement.setAttribute('aria-hidden','true');container.append(renderer.domElement);
  let frame=null,running=false,lastWidth=0,lastHeight=0,time=0,lastTime=0;
  const entries=buttons.map(button=>{
    const root=new THREE.Group();
    root.add(model.root.getObjectByName('Cabeza de Zud').clone(true),model.root.getObjectByName('Beanie de Zud').clone(true));
    const scene=new THREE.Scene(),pivot=new THREE.Group();scene.add(pivot);
    const lighting=createRetroLighting(scene);lighting.update(0,{reducedMotion:true});
    const camera=new THREE.OrthographicCamera(-1.45,1.45,1.45,-1.45,.1,20);camera.position.set(0,.8,5);camera.lookAt(0,0,0);
    const controller=createCharacterHats({root});
    return {button,root,scene,pivot,camera,controller,lighting,preview:button.querySelector('.look-preview'),ready:false,loading:false};
  });
  async function load(entry){
    if(entry.ready||entry.loading)return;
    entry.loading=true;entry.preview.textContent='Cargando…';
    try{
      const settings={...getSettings(),...hatDefaults(entry.button.dataset.hat),wireframe:false};
      await entry.controller.update(settings);
      const beanie=settings.hatModel==='beanie';
      if(!beanie&&!entry.controller.anchor.children[0].children.length)throw new Error('Preview unavailable');
      const object=beanie?entry.root.getObjectByName('Beanie de Zud'):entry.controller.anchor;
      object.visible=true;
      // The cloned beanie still shares materials with Zud. Isolate those before
      // binding studio lighting so opening Look never changes the room's light.
      if(beanie){
        const copies=new Map(),copy=material=>{if(!copies.has(material))copies.set(material,material.clone());return copies.get(material);};
        object.traverse(mesh=>{if(mesh.isMesh)mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);});
      }
      applySceneMaterials(object);entry.lighting.bind(object);
      entry.pivot.add(object);
      const box=new THREE.Box3().setFromObject(object),center=box.getCenter(new THREE.Vector3());
      object.position.sub(center);
      const size=box.getSize(new THREE.Vector3());
      // Leave room for rotation, the floating motion and the dangling cords.
      entry.scale=2.5/Math.max(Math.hypot(size.x,size.z),size.y);
      entry.pivot.scale.setScalar(entry.scale);
      entry.ready=true;entry.preview.textContent='';entry.preview.dataset.ready='true';
    }catch{
      entry.preview.textContent='Vista no disponible';
      // A fresh open retries failed previews, while selection remains usable.
      await entry.controller.update({...getSettings(),...hatDefaults('beanie')});
    }finally{entry.loading=false;}
  }
  function render(now){
    if(!running)return;
    const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
    if(!reducedMotion.matches&&!document.hidden)time+=dt;
    const bounds=container.getBoundingClientRect();
    if(bounds.width!==lastWidth||bounds.height!==lastHeight){
      renderer.setSize(bounds.width,bounds.height,false);lastWidth=bounds.width;lastHeight=bounds.height;
    }
    renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);
    for(const [index,entry] of entries.entries()){
      const rect=entry.preview.getBoundingClientRect(),x=rect.left-bounds.left,y=bounds.bottom-rect.bottom;
      if(!rect.width||!rect.height)continue;
      const aspect=rect.width/rect.height;
      entry.camera.left=-1.45*aspect;entry.camera.right=1.45*aspect;entry.camera.updateProjectionMatrix();
      const focused=entry.button.matches(':hover, :focus-visible');
      if(entry.ready)entry.pivot.scale.setScalar(THREE.MathUtils.damp(entry.pivot.scale.x,entry.scale*(focused?1.1:1),12,dt));
      entry.pivot.rotation.y=.3+time*.45;
      entry.pivot.position.y=reducedMotion.matches?0:Math.sin(time*1.6+index*.8)*.075;
      entry.preview.dataset.rotation=entry.pivot.rotation.y.toFixed(3);
      renderer.setViewport(x,y,rect.width,rect.height);renderer.setScissor(x,y,rect.width,rect.height);
      const pixelRatio=retroStyle.uniforms.retroPixelRatio.value;
      try{
        retroStyle.uniforms.retroPixelRatio.value=renderer.getPixelRatio();
        print.render(entry.scene,entry.camera,{samples:renderer.getPixelRatio()<1.5?4:0,viewport:true});
      }finally{retroStyle.uniforms.retroPixelRatio.value=pixelRatio;}
    }
    frame=requestAnimationFrame(render);
  }
  return {
    start(){entries.forEach(entry=>void load(entry));if(running)return;running=true;lastTime=performance.now();frame=requestAnimationFrame(render);},
    stop(){running=false;cancelAnimationFrame(frame);},
  };
}
