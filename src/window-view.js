import * as THREE from 'three';
import {natureAssets} from './nature-assets.js';
import {retro} from './retro-material.js';
import {natureMaterial} from './nature-material.js';
import {GARDEN_GROUND} from './nature-garden.js';
import {createRetroLighting} from './retro-lighting.js';
import {retroStyle} from './retro-style.js';
import {dayCycle,wrapMinutes} from './day-cycle.js';

// A small exterior scene, printed through the window. Sharing the garden's
// foliage and diffuse materials keeps the view in the same world as the room.
// It lives in its own target so no landscape can leak past the cutaway walls.
export function createWindowView({width=2.28,height=1.53,deferLoad=false}={}) {
  const scene=new THREE.Scene();scene.name='Exterior de la ventana';
  scene.background=new THREE.Color();scene.fog=new THREE.Fog(0xb8c5b4,22,65);
  const target=new THREE.WebGLRenderTarget(768,512,{type:THREE.HalfFloatType});
  // Project the exterior through the actual aperture, instead of stretching a
  // second camera's picture over its UVs. Both sides share the same world rays.
  const textureMatrix=new THREE.Matrix4();
  // Glass is composed on the existing window plane: no extra geometry, scene
  // render or transmission pass. Its texture stays attached to the pane.
  const glassLight={value:new THREE.Color()},glassAngle={value:new THREE.Vector2()};
  const material=new THREE.MeshBasicMaterial({map:target.texture,toneMapped:false});
  material.userData.textureMatrix=textureMatrix;
  material.onBeforeCompile=shader=>{
    shader.uniforms.windowProjection={value:textureMatrix};
    shader.uniforms.windowGlassLight=glassLight;
    shader.uniforms.windowGlassAngle=glassAngle;
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      uniform mat4 windowProjection;
      varying vec4 vWindowProjection;
      varying vec2 vGlassUv;`).replace('#include <begin_vertex>',`#include <begin_vertex>
      vGlassUv=uv;
      vWindowProjection=windowProjection*vec4(position,1.);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec4 vWindowProjection;
      varying vec2 vGlassUv;
      uniform vec3 windowGlassLight;
      uniform vec2 windowGlassAngle;
      float glassHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float glassNoise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(glassHash(i),glassHash(i+vec2(1,0)),f.x),
          mix(glassHash(i+vec2(0,1)),glassHash(i+vec2(1,1)),f.x),f.y);
      }`).replace('#include <map_fragment>',`
      diffuseColor*=texture2D(map,vWindowProjection.xy/vWindowProjection.w);
      // Two soft diagonal gleams shift slightly as the viewer orbits. The
      // broad tint and edge haze give the clear pane a surface between them.
      float diagonal=vGlassUv.x-vGlassUv.y*.55+windowGlassAngle.x;
      float gleam=1.-smoothstep(.065,.12,abs(diagonal-.12));
      gleam+=(1.-smoothstep(.012,.027,abs(diagonal-.31)))*.65;
      vec2 edgeDistance=min(vGlassUv,1.-vGlassUv);
      float edge=1.-smoothstep(.015,.075,min(edgeDistance.x,edgeDistance.y));
      float grain=glassNoise(vGlassUv*vec2(170.,110.))-.5;
      float smudge=glassNoise(vGlassUv*vec2(7.,11.));
      float reflection=.035+windowGlassAngle.y*.10+gleam*.23+edge*.045+smudge*.012;
      diffuseColor.rgb*=vec3(.96,.985,1.);
      diffuseColor.rgb=mix(diffuseColor.rgb,windowGlassLight,reflection);
      diffuseColor.rgb+=windowGlassLight*grain*.009;`);
  };
  material.customProgramCacheKey=()=> 'window-world-projection-glass-v2';
  const view=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
  view.name='Paisaje de la ventana';
  const scenery=new THREE.Group();scenery.name='Naturaleza exterior';scenery.matrixAutoUpdate=false;scene.add(scenery);
  const placement=new THREE.Matrix4().makeRotationY(Math.PI/4);
  placement.scale(new THREE.Vector3(.35,.35,.35));
  placement.setPosition(0,0,-.2);
  const anchor=new THREE.Matrix4(),origin=new THREE.Vector3();
  let camera;
  // World-space lights use the same solar path, dyes and fill as the garden.
  // Keeping them outside the rotated/scaled scenery avoids a second sun angle.
  const lighting=createRetroLighting(scene);
  Object.assign(lighting.key.shadow.camera,{left:-12,right:12,top:12,bottom:-12,far:50});
  const mesh=(geometry,material,x,y,z,parent=scenery)=>{
    const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
  };
  const grass=retro(0x7d9956,{mottle:.09,facetVariation:.07});
  const ground=mesh(new THREE.PlaneGeometry(180,180),grass,0,0,-25);ground.rotation.x=-Math.PI/2;ground.name='Suelo del exterior';
  // Quiet, broad hills, with haze separating them from the nearby garden.
  for(const [x,z,sx,sy] of [[-24,-46,29,8],[16,-54,34,10],[38,-38,23,6]]){
    const hill=mesh(new THREE.IcosahedronGeometry(1,2),grass,x,-2,z);hill.scale.set(sx,sy,17);
  }
  // The existing Quaternius models supply the same leaf silhouettes and texture.
  const materials=new Map();
  const layouts={
    CommonTree_1:[[-5.4,-7,3.7/.35,.3],[7,-18,7,1.1],[-10,-24,8,2]],
    CommonTree_3:[[5.6,-7.5,4.05/.35,-.5],[-8,-17,6,.8],[1,-32,8,1.5]],
    Bush_Common:[[-5,-3,1.8,.2],[5,-5,1.9,1],[-6,-11,1.2,2],[6,-17,1.8,0],[1.8,-13,1.2,.7]],
    Bush_Common_Flowers:[[-3.6,-6,1.5,.4],[3.8,-10,1.5,2],[-2,-18,1.1,1]],
    Fern_1:[[-3,-3,.9,.4],[3.4,-4,.8,1.2],[-4,-10,.7,2]],
    Rock_Medium_1:[[-4.2,-4,.65,.5],[1,-11,.6,2]],
    Flower_3_Group:[],Flower_4_Group:[],Grass_Common_Short:[],
  };
  // Irregular patches leave a clearing through the middle. Larger, nearby
  // flowers frame it; distant patches need fewer plants in the small window.
  let seed=39;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const [x,z,radius] of [[-2,-4,1.2],[2.2,-6,1.3],[-2.7,-10,1.4],[0,-11,1.3],[1,-8,1],[2,-15,1.7],[-1,-23,2]]){
    const count=z>=-6?7:z>=-11?4:3;
    for(let i=0;i<7;i++){
      const angle=random()*Math.PI*2,r=Math.sqrt(random())*radius;
      // Consume the same random samples even for omitted plants, preserving
      // all remaining positions, sizes and the grass layout.
      const placement=[x+Math.cos(angle)*r,z+Math.sin(angle)*r,.7+random()*.5,random()*Math.PI*2];
      if(i<count)layouts[i%2?'Flower_3_Group':'Flower_4_Group'].push(placement);
    }
  }
  for(let i=0;i<25;i++)layouts.Grass_Common_Short.push([(random()-.5)*12,-6-random()*12,.3+random()*.4,random()*Math.PI*2]);
  let dirty=true,lastMinute=-1,lastStyle='';
  let resolveReady,started=false;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  function load(){
    if(started)return ready;started=true;
    Promise.allSettled(Object.entries(layouts).map(async([name,placements])=>{
      const {scene:model}=await natureAssets.load(name);
      model.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
      const height=bounds.max.y-bounds.min.y;
      // Preserve every plant and its authored child transforms. Nearby copies
      // share a draw; small spatial batches still let the camera and shadows
      // cull distant plants instead of drawing the whole meadow together.
      model.position.set(-center.x,-bounds.min.y,-center.z);model.updateMatrixWorld(true);
      const group=new THREE.Group();group.name=name;
      const transform=new THREE.Object3D(),matrix=new THREE.Matrix4();
      const cells=new Map();
      for(const item of placements){
        const key=`${Math.floor(item[0]/8)},${Math.floor(item[1]/8)}`;
        if(!cells.has(key))cells.set(key,[]);
        cells.get(key).push(item);
      }
      model.traverse(object=>{
        if(!object.isMesh)return;
        if(!materials.has(object.material))materials.set(object.material,natureMaterial(object.material));
        for(const items of cells.values()){
          const mesh=new THREE.InstancedMesh(object.geometry,materials.get(object.material),items.length);
          mesh.name=object.name;mesh.castShadow=true;
          items.forEach(([x,z,h,yaw],index)=>{
            transform.position.set(x,0,z);transform.rotation.set(0,yaw,0);transform.scale.setScalar(h/height);transform.updateMatrix();
            matrix.multiplyMatrices(transform.matrix,object.matrixWorld);mesh.setMatrixAt(index,matrix);
          });
          mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
          group.add(mesh);
        }
      });
      scenery.add(group);lighting.bind(group);
      group.traverse(object=>{if(object.isMesh)object.receiveShadow=!object.material.name.includes('Leaves_');});
      dirty=true;
    })).then(results=>{
      if(results.some(result=>result.status==='rejected'))console.warn('[window] Some exterior foliage could not be loaded.');
      resolveReady();
    });
    return ready;
  }
  if(!deferLoad)load();
  const moon=mesh(new THREE.SphereGeometry(.65,12,8),new THREE.MeshBasicMaterial({color:0xe8e3bf}),7,11,-35);
  moon.castShadow=false;moon.receiveShadow=false;
  lighting.bind(scenery);
  const nightColor=new THREE.Color(0x101b30),dayColor=new THREE.Color(0xb6c9cc),duskColor=new THREE.Color(0xc4a080);
  const glassNight=new THREE.Color(0x697486),glassDay=new THREE.Color(0xdcebe8),glassDusk=new THREE.Color(0xe5bea6);
  function update(minutes){
    if(!Number.isFinite(minutes))return;
    const minute=Math.floor(wrapMinutes(minutes));if(minute===lastMinute)return;
    lastMinute=minute;dirty=true;
    const cycle=dayCycle(minute),{daylight,twilight,night}=cycle;
    glassLight.value.copy(glassNight).lerp(glassDay,daylight).lerp(glassDusk,twilight*.55);
    scene.background.copy(nightColor).lerp(dayColor,daylight).lerp(duskColor,twilight*.55);
    scene.fog.color.copy(scene.background);
    lighting.update(0,{room:true,daylight,cycle,reducedMotion:true});
    moon.visible=night>.5;
  }
  const clipPlane=new THREE.Plane();
  const lastView=new THREE.Matrix4(),lastProjection=new THREE.Matrix4(),lastPortal=new THREE.Matrix4();
  const corner=new THREE.Vector3(),crop=new THREE.Matrix4();
  const glassNormal=new THREE.Vector3(),glassRight=new THREE.Vector3(),viewDirection=new THREE.Vector3();
  const bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  function render(renderer,roomCamera){
    roomCamera.updateMatrixWorld();view.updateWorldMatrix(true,false);
    roomCamera.getWorldDirection(viewDirection);
    glassNormal.set(0,0,1).transformDirection(view.matrixWorld);
    glassRight.set(1,0,0).transformDirection(view.matrixWorld);
    glassAngle.value.set(viewDirection.dot(glassRight)*.12,Math.pow(1.-Math.abs(viewDirection.dot(glassNormal)),3));
    const style=Object.values(retroStyle.uniforms).map(uniform=>JSON.stringify(uniform.value?.toArray?.()??uniform.value)).join('|');
    if(!dirty&&lastView.equals(roomCamera.matrixWorld)&&lastProjection.equals(roomCamera.projectionMatrix)&&lastPortal.equals(view.matrixWorld)&&style===lastStyle)return;
    // Crop only the render resolution to the projected window bounds. This is
    // the room camera's projection, with no extra yaw, trucking or moving aim.
    if(!camera||camera.type!==roomCamera.type)camera=roomCamera.clone();
    camera.copy(roomCamera,false);camera.matrixAutoUpdate=false;
    camera.matrix.copy(roomCamera.matrixWorld);camera.matrixWorld.copy(roomCamera.matrixWorld);
    camera.matrixWorldInverse.copy(roomCamera.matrixWorldInverse);
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
    for(const x of [-width/2,width/2])for(const y of [-height/2,height/2]){
      corner.set(x,y,0).applyMatrix4(view.matrixWorld).project(roomCamera);
      left=Math.min(left,corner.x);right=Math.max(right,corner.x);
      bottom=Math.min(bottom,corner.y);top=Math.max(top,corner.y);
    }
    if(right-left<1e-5||top-bottom<1e-5)return;
    const w=right-left,h=top-bottom;
    crop.set(2/w,0,0,-(right+left)/w,0,2/h,0,-(top+bottom)/h,0,0,1,0,0,0,0,1);
    camera.projectionMatrix.multiplyMatrices(crop,roomCamera.projectionMatrix);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    textureMatrix.copy(bias).multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse).multiply(view.matrixWorld);
    // Anchor the meadow to the actual garden's ground, never the sill height.
    // Geometry scaling must not scale that elevation or lower the plant roots.
    anchor.copy(view.matrixWorld);origin.setFromMatrixPosition(anchor);origin.y=GARDEN_GROUND;
    anchor.setPosition(origin);scenery.matrix.multiplyMatrices(anchor,placement);
    const previous=renderer.getRenderTarget(),xr=renderer.xr.enabled,clipping=renderer.clippingPlanes;
    clipPlane.set(new THREE.Vector3(0,0,-1),0).applyMatrix4(view.matrixWorld);
    const shadowAuto=renderer.shadowMap.autoUpdate,shadowNeeds=renderer.shadowMap.needsUpdate;
    const mirror=retroStyle.uniforms.retroMirror.value;
    try{
      renderer.clippingPlanes=[...clipping,clipPlane];
      renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
      // This texture carries the exterior's surface ink; the window plane only
      // adds glass. The shader's footprint filtering handles distant patterns.
      retroStyle.uniforms.retroMirror.value=0;
      renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);
      dirty=false;lastView.copy(roomCamera.matrixWorld);lastProjection.copy(roomCamera.projectionMatrix);lastPortal.copy(view.matrixWorld);lastStyle=style;
    }finally{
      retroStyle.uniforms.retroMirror.value=mirror;
      renderer.setRenderTarget(previous);renderer.xr.enabled=xr;renderer.clippingPlanes=clipping;
      renderer.shadowMap.autoUpdate=shadowAuto;renderer.shadowMap.needsUpdate=shadowNeeds;
    }
  }
  update(610);
  return {view,texture:target.texture,scene,scenery,lighting,ground,ready,load,update,render};
}
