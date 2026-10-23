import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {retroStyle} from './retro-style.js';

// Reflector's r180 clipping assumes perspective. The room uses an orthographic
// camera, so reflect its camera type and use the general oblique near plane.
export function createWallMirror(width,height) {
  const mirror=new Reflector(new THREE.PlaneGeometry(width,height),{
    color:0x7f7f7f,textureWidth:128,textureHeight:128,multisample:4,
  });
  mirror.name='Espejo de pared';
  const target=mirror.getRenderTarget(),textureMatrix=mirror.material.uniforms.textureMatrix.value;
  const normal=new THREE.Vector3(),origin=new THREE.Vector3(),eye=new THREE.Vector3();
  const direction=new THREE.Vector3(),up=new THREE.Vector3(),lookAt=new THREE.Vector3();
  const plane=new THREE.Plane(),clip=new THREE.Vector4(),corner=new THREE.Vector4();
  const rotation=new THREE.Matrix4(),inverseProjection=new THREE.Matrix4();
  const frustum=new THREE.Frustum(),projectionView=new THREE.Matrix4();
  const crop=new THREE.Matrix4(),projected=new THREE.Vector4(),bufferSize=new THREE.Vector2();
  const corners=Array.from(mirror.geometry.attributes.position.array);
  let virtualCamera;

  // Rendered by the caller before the frame, never from inside it: a nested
  // render gets its own light state, and alternating states made three.js
  // re-resolve every material's program twice per frame.
  mirror.onBeforeRender=()=>{};
  mirror.renderReflection=(renderer,scene,camera)=>{
    for(let object=mirror;object;object=object.parent)if(!object.visible)return false;
    camera.updateMatrixWorld();
    mirror.updateWorldMatrix(true,false);
    projectionView.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projectionView);
    if(!frustum.intersectsObject(mirror))return false;
    origin.setFromMatrixPosition(mirror.matrixWorld);
    rotation.extractRotation(mirror.matrixWorld);
    normal.set(0,0,1).applyMatrix4(rotation);
    eye.setFromMatrixPosition(camera.matrixWorld);
    if(direction.subVectors(eye,origin).dot(normal)<=0)return false;

    if(!virtualCamera||virtualCamera.type!==camera.type)virtualCamera=camera.clone();
    virtualCamera.copy(camera,false);
    mirror.camera=virtualCamera;
    virtualCamera.position.copy(eye).addScaledVector(normal,-2*direction.dot(normal));
    camera.getWorldDirection(direction).reflect(normal);
    rotation.extractRotation(camera.matrixWorld);
    up.set(0,1,0).applyMatrix4(rotation).reflect(normal);
    virtualCamera.up.copy(up);
    virtualCamera.lookAt(lookAt.copy(virtualCamera.position).add(direction));
    virtualCamera.updateMatrixWorld(true);

    // Spend the reflection's pixels on the glass, not on the entire room.
    // Crop in clip space so the same mapping works for orbiting and zooming.
    projectionView.multiplyMatrices(virtualCamera.projectionMatrix,virtualCamera.matrixWorldInverse).multiply(mirror.matrixWorld);
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
    for(let i=0;i<corners.length;i+=3){
      projected.set(corners[i],corners[i+1],corners[i+2],1).applyMatrix4(projectionView);
      // A perspective view crossing the eye plane cannot use corner bounds.
      if(projected.w<=0){left=bottom=-1;right=top=1;break;}
      const x=projected.x/projected.w,y=projected.y/projected.w;
      left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);
    }
    // A small border keeps linear filtering away from the texture's edge.
    const padX=Math.max((right-left)*.01,1e-5),padY=Math.max((top-bottom)*.01,1e-5);
    left-=padX;right+=padX;bottom-=padY;top+=padY;
    const spanX=right-left,spanY=top-bottom;
    crop.set(2/spanX,0,0,-(right+left)/spanX,0,2/spanY,0,-(top+bottom)/spanY,0,0,1,0,0,0,0,1);
    virtualCamera.projectionMatrix.premultiply(crop);

    // Twice the displayed pixel density, including Retina, with bounded GPU
    // memory. Buckets avoid reallocating for every small camera movement.
    renderer.getDrawingBufferSize(bufferSize);
    const maxSize=Math.min(2048,renderer.capabilities.maxTextureSize);
    const size=value=>Math.min(maxSize,Math.max(128,Math.ceil(value/128)*128));
    const textureWidth=size(spanX*bufferSize.x),textureHeight=size(spanY*bufferSize.y);
    if(target.width!==textureWidth||target.height!==textureHeight)target.setSize(textureWidth,textureHeight);

    textureMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1)
      .multiply(virtualCamera.projectionMatrix).multiply(virtualCamera.matrixWorldInverse).multiply(mirror.matrixWorld);

    // Clip the wall and everything behind the glass out of the reflected view.
    plane.setFromNormalAndCoplanarPoint(normal,origin).applyMatrix4(virtualCamera.matrixWorldInverse);
    clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
    inverseProjection.copy(virtualCamera.projectionMatrix).invert();
    corner.set(Math.sign(clip.x),Math.sign(clip.y),1,1).applyMatrix4(inverseProjection);
    clip.multiplyScalar(2/clip.dot(corner));
    const p=virtualCamera.projectionMatrix.elements;
    p[2]=clip.x-p[3];p[6]=clip.y-p[7];p[10]=clip.z-p[11];p[14]=clip.w-p[15];
    virtualCamera.projectionMatrixInverse.copy(virtualCamera.projectionMatrix).invert();

    const previousTarget=renderer.getRenderTarget(),xr=renderer.xr.enabled;
    const shadowAutoUpdate=renderer.shadowMap.autoUpdate,shadowNeedsUpdate=renderer.shadowMap.needsUpdate;
    mirror.visible=false;
    try {
      renderer.xr.enabled=false;
      renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false;
      renderer.setRenderTarget(target);
      renderer.state.buffers.depth.setMask(true);
      if(!renderer.autoClear)renderer.clear();
      // The reflection is minified on screen: posterized color only, no ink layers.
      retroStyle.uniforms.retroMirror.value=1;
      renderer.render(scene,virtualCamera);
    } finally {
      retroStyle.uniforms.retroMirror.value=0;
      mirror.visible=true;
      renderer.xr.enabled=xr;
      renderer.shadowMap.autoUpdate=shadowAutoUpdate;renderer.shadowMap.needsUpdate=shadowNeedsUpdate;
      renderer.setRenderTarget(previousTarget);
      if(camera.viewport)renderer.state.viewport(camera.viewport);
    }
    return true;
  };
  return mirror;
}
