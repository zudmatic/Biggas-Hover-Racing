import * as THREE from 'three';
import {inkShadingGLSL} from './ink-shader';
// textureFx (opcional, solo atlas de personaje): uTexturePixels pixela el muestreo (0 = original),
// uTextureLevels posteriza con tinta (<2 = original), uSkin/uSkinMix tiñen las zonas azules.
const textureFxGLSL=`#ifdef USE_MAP
 vec2 inkUv=uTexturePixels>.5?(floor(vMapUv*uTexturePixels)+.5)/uTexturePixels:vMapUv;
 vec4 sampledDiffuseColor=textureGrad(map,inkUv,dFdx(vMapUv),dFdy(vMapUv));
 vec3 texel=sampledDiffuseColor.rgb;
 float skinMask=smoothstep(.3,.6,texel.b-max(texel.r,texel.g));
 texel=mix(texel,uSkin*clamp(texel.b/.87,0.,1.2),skinMask*uSkinMix);
 // Posteriza solo el valor (canal más alto) y escala el color: conserva matiz y saturación del atlas.
 // Redondear R, G y B por separado volvía rojo el camuflado (v1 en work/bluleet-integration/before-hue-posterize/).
 if(uInk>.5&&uTextureLevels>1.5){vec3 tone=pow(max(texel,0.),vec3(1./2.2));float value=max(max(tone.r,tone.g),tone.b),steps=uTextureLevels-1.;tone*=value>1e-4?(floor(value*steps+.5)/steps)/value:0.;texel=pow(tone,vec3(2.2));}
 sampledDiffuseColor.rgb=texel;
 diffuseColor*=sampledDiffuseColor;
#endif`;
export function createPrintMaterial(source,ink,flatInk=false,preserveTexture=false,textureFx=null){
 const material=source.clone();
 material.onBeforeCompile=shader=>{
  shader.uniforms.uInk=ink;
  if(textureFx){
   Object.assign(shader.uniforms,textureFx);
   shader.fragmentShader='uniform float uTexturePixels; uniform float uTextureLevels; uniform vec3 uSkin; uniform float uSkinMix;\n'+shader.fragmentShader.replace('#include <map_fragment>',textureFxGLSL);
  }
  shader.uniforms.uFlatInk={value:flatInk?1:0};
  shader.uniforms.uPigment={value:material.color};
  shader.vertexShader='varying vec3 vPrintNormal; varying vec3 vPrintPoint;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\nvPrintNormal=inverseTransformDirection(transformedNormal,viewMatrix); vPrintPoint=position;');
  shader.fragmentShader=inkShadingGLSL+'uniform float uFlatInk; uniform float uInk; uniform vec3 uPigment; varying vec3 vPrintNormal; varying vec3 vPrintPoint;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
   if(uInk>.5){
    gl_FragColor.rgb=uFlatInk>.5?shadeFlatPrintInk(uPigment,vPrintPoint):shadePrintInk(uPigment,vPrintPoint,vPrintNormal);
   }
  `);
  if(preserveTexture)shader.fragmentShader=shader.fragmentShader.replaceAll('shadeFlatPrintInk(uPigment,','shadeFlatPrintInk(diffuseColor.rgb,').replaceAll('shadePrintInk(uPigment,','shadePrintInk(diffuseColor.rgb,');
 };
 material.customProgramCacheKey=()=> 'chubee-all-material-print-v2'+(preserveTexture?'-textured':'')+(textureFx?'-texture-fx':'');
 return material;
}
// Mallas facetadas (Chubee low-poly): en cada arista dura el vértice está repetido con normales
// distintas y la cáscara se abriría. El contorno usa la normal promedio de los que comparten posición.
export function outlineGeometry(source){
 // Comparte los demás atributos: lo que se corrija después en los pesos (character-locomotion) llega igual.
 const geometry=new THREE.BufferGeometry();for(const [name,a] of Object.entries(source.attributes))geometry.setAttribute(name,a);geometry.setIndex(source.index);
 const p=geometry.attributes.position,n=source.attributes.normal,sum=new Map(),key=i=>`${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`;
 for(let i=0;i<p.count;i++){const k=key(i),s=sum.get(k)||[0,0,0];s[0]+=n.getX(i);s[1]+=n.getY(i);s[2]+=n.getZ(i);sum.set(k,s);}
 const normals=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i++){const [x,y,z]=sum.get(key(i)),l=Math.hypot(x,y,z)||1;normals.set([x/l,y/l,z/l],i*3);}
 geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));return geometry;
}
export function createCharacterOutlines(root,selectSource=o=>o.isSkinnedMesh&&o.name.startsWith('Chubee_')){
const outlineThickness={value:1},outlineSpeed={value:1},outlineWiggle={value:1},outlineMode={value:0},outlineTime={value:0},outlineResolution={value:new THREE.Vector2(1,1)};
const outlineMeshes=[];
function buildOutlines(){
 const sources=[];root.traverse(o=>{if(selectSource(o))sources.push(o);});
 for(const {source,pass} of sources.flatMap(source=>[{source,pass:0},{source,pass:1},{source,pass:2}])){
  const mat=new THREE.MeshStandardMaterial({color:0xff152b,emissive:0xff152b,emissiveIntensity:1,side:THREE.BackSide,depthWrite:false,stencilWrite:true,stencilRef:1,stencilFunc:THREE.NotEqualStencilFunc,stencilFail:THREE.KeepStencilOp,stencilZFail:THREE.KeepStencilOp,stencilZPass:THREE.KeepStencilOp});
  mat.toneMapped=false;
  mat.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,{uOutlineThickness:outlineThickness,uOutlineWiggle:outlineWiggle,uOutlineMode:outlineMode,uOutlineTime:outlineTime,uOutlineResolution:outlineResolution,uOutlinePass:{value:pass}});
   shader.vertexShader='varying vec3 vBrushPoint; uniform float uOutlineThickness; uniform float uOutlineWiggle; uniform float uOutlinePass; uniform float uOutlineMode; uniform float uOutlineTime; uniform vec2 uOutlineResolution;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
    vBrushPoint=position;
    vec2 direction=normalize(transformedNormal.xy+vec2(.00001));
    float tick=floor(uOutlineTime*8.)/8.;
    float wobble=sin(position.x*37.+position.y*19.+tick*4.)*.65+sin(position.z*29.-position.y*43.-tick*3.)*.35;
    float pressure=.5+.5*sin(position.y*11.+position.x*13.+position.z*7.+tick*.8);
    float cleanWobble=sin(position.y*7.+position.x*5.+tick*3.);
    float width=uOutlineMode>1.5?max(.6,2.+pressure*3.+uOutlinePass*2.3+wobble*2.2*uOutlineWiggle):max(.8,2.7+cleanWobble*.5*uOutlineWiggle);
    width*=uOutlineThickness;
    vec2 tangent=vec2(-direction.y,direction.x);
    if(uOutlineMode>1.5)gl_Position.xy+=tangent*sin(position.y*18.+tick*5.+uOutlinePass)*uOutlineWiggle*.9*2./uOutlineResolution*gl_Position.w;
    gl_Position.xy-=direction*width*2./uOutlineResolution*gl_Position.w;
   `);
   shader.fragmentShader='varying vec3 vBrushPoint; uniform float uOutlineMode; uniform float uOutlinePass; uniform float uOutlineTime;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\nif(uOutlineMode>1.5){float stroke=sin(vBrushPoint.y*13.+vBrushPoint.x*9.+vBrushPoint.z*17.+uOutlinePass*2.1);float bristle=sin(vBrushPoint.y*187.+vBrushPoint.x*123.+vBrushPoint.z*151.);if(uOutlinePass>.5 && (stroke<-.1 || bristle>.55))discard;} gl_FragColor.rgb=vec3(1.,.008,.022);');
  };
  mat.customProgramCacheKey=()=> 'chubee-outline-stencil-v4';
  if(!source.userData.outlineGeometry)source.userData.outlineGeometry=outlineGeometry(source.geometry);
  const shell=source.isSkinnedMesh?new THREE.SkinnedMesh(source.userData.outlineGeometry,mat):new THREE.Mesh(source.userData.outlineGeometry,mat);
  shell.renderOrder=2;
  shell.name='Red outline';shell.userData.outlinePass=pass;shell.position.copy(source.position);shell.quaternion.copy(source.quaternion);shell.scale.copy(source.scale);
  if(source.isSkinnedMesh){shell.bindMode=source.bindMode;shell.bind(source.skeleton,source.bindMatrix);}shell.frustumCulled=false;shell.visible=false;
  source.parent.add(shell);outlineMeshes.push(shell);
 }
}
buildOutlines();
return {set(mode,wiggle,speed,thickness=1){outlineThickness.value=THREE.MathUtils.clamp(Number.isFinite(thickness)?thickness:1,.1,4);outlineMode.value=Number(mode);outlineWiggle.value=wiggle;outlineSpeed.value=speed;for(const shell of outlineMeshes)shell.visible=outlineMode.value>0&&(shell.userData.outlinePass===0||outlineMode.value===2);},update(dt,width,height){outlineTime.value+=dt*outlineSpeed.value;outlineResolution.value.set(width,height);}};
}
