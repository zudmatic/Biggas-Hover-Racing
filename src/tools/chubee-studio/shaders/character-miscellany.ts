import * as THREE from 'three';
import {outlineGeometry} from './character-finish';

// Misceláneas que se salen del personaje (referencias en work/miscellany/):
// - Trazos: líneas de tinta ancladas a la superficie y al rig; unas salen radiales, otras pasan el borde
//   como overshoot de boceto. Aparecen al azar en distintos lugares, a ráfagas (v1 fijo: work/miscellany/v1-fixed-strokes/).
// - Recorte: silueta de papel de color, dentada y desplazada, detrás del cuerpo y del contorno.
// Ambos usan el stencil de los personajes (ref 1): solo se dibujan afuera de la silueta.
export function createMiscellanySettings(){
 return {
  uMiscTime:{value:0},uMiscRate:{value:8},uMiscResolution:{value:new THREE.Vector2(1,1)},
  uStrokeDensity:{value:.5},uStrokeBurst:{value:.6},uStrokeLength:{value:1},uStrokeWidth:{value:1.4},uStrokeWobble:{value:1},uStrokeColor:{value:new THREE.Color('#130c29')},
  uCutOn:{value:1},uCutWidth:{value:14},uCutOffset:{value:new THREE.Vector2(6,-6)},uCutColor:{value:new THREE.Color('#f2c14e')},
 };
}

const outsideOnly=material=>Object.assign(material,{depthWrite:false,stencilWrite:true,stencilRef:1,stencilFunc:THREE.NotEqualStencilFunc,stencilFail:THREE.KeepStencilOp,stencilZFail:THREE.KeepStencilOp,stencilZPass:THREE.KeepStencilOp,toneMapped:false});
const hashGLSL='float miscHash(float n){return fract(sin(n)*43758.5453);}\n';

// Semilla fija: el mismo personaje tiene siempre los mismos trazos.
function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

export const STROKE_SEGMENTS=8;
// Hay muchos más trazos posibles que visibles: con Trazos 0,5 se ven ~35 de 220 por personaje, cada vez en otro lugar.
export const STROKE_POOL=220,STROKE_SHOWN=.32;
export function strokeGeometry(source,{count=STROKE_POOL,seed=7}={}){
 const geometry=source.geometry,position=geometry.attributes.position,normal=geometry.attributes.normal,skinIndex=geometry.attributes.skinIndex,skinWeight=geometry.attributes.skinWeight;
 const index=geometry.index?Array.from(geometry.index.array):[...Array(position.count).keys()];
 const v=i=>new THREE.Vector3().fromBufferAttribute(position,i),areas=[];let total=0;
 for(let i=0;i<index.length;i+=3){const a=v(index[i]);total+=new THREE.Vector3().subVectors(v(index[i+1]),a).cross(new THREE.Vector3().subVectors(v(index[i+2]),a)).length()/2;areas.push(total);}
 geometry.computeBoundingBox();const size=geometry.boundingBox.getSize(new THREE.Vector3()).length();
 const rand=random(seed),positions=[],normals=[],strokes=[],joints=[],weights=[],indices=[];
 for(let s=0;s<count;s++){
  // Punto al azar sobre la superficie, proporcional al área.
  const pick=rand()*total;let lo=0,hi=areas.length-1;while(lo<hi){const mid=lo+hi>>1;if(areas[mid]<pick)lo=mid+1;else hi=mid;}
  const tri=[index[lo*3],index[lo*3+1],index[lo*3+2]];let r1=rand(),r2=rand();if(r1+r2>1){r1=1-r1;r2=1-r2;}const bary=[1-r1-r2,r1,r2];
  const anchor=new THREE.Vector3(),n=new THREE.Vector3();tri.forEach((k,j)=>{anchor.addScaledVector(v(k),bary[j]);n.addScaledVector(new THREE.Vector3().fromBufferAttribute(normal,k),bary[j]);});n.normalize();
  const rigid=tri[bary.indexOf(Math.max(...bary))];
  const tangent=new THREE.Vector3().crossVectors(n,new THREE.Vector3(rand()-.5,rand()-.5,rand()-.5)).normalize();
  // 60 % rayos que salen del cuerpo, 40 % trazos que corren por el borde y lo pasan.
  const radial=rand()<.6,dir=radial?n.clone().addScaledVector(tangent,.45*rand()).normalize():tangent;
  const length=size*(.05+.11*rand()),[from,to]=radial?[-.15,1]:[-.6,.6],stroke=rand()*1000;
  const base=positions.length/3;
  for(let i=0;i<=STROKE_SEGMENTS;i++)for(const side of [-1,1]){
   const u=i/STROKE_SEGMENTS;
   positions.push(anchor.x,anchor.y,anchor.z);normals.push(dir.x,dir.y,dir.z);
   strokes.push(u,side,stroke,length*(from+(to-from)*u));
   joints.push(skinIndex.getX(rigid),skinIndex.getY(rigid),skinIndex.getZ(rigid),skinIndex.getW(rigid));
   weights.push(skinWeight.getX(rigid),skinWeight.getY(rigid),skinWeight.getZ(rigid),skinWeight.getW(rigid));
  }
  for(let i=0;i<STROKE_SEGMENTS;i++){const a=base+i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
 }
 const result=new THREE.BufferGeometry();
 result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
 result.setAttribute('aStroke',new THREE.Float32BufferAttribute(strokes,4));
 result.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));result.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
 result.setIndex(indices);return result;
}

function strokeMaterial(settings){
 const material=outsideOnly(new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,settings);
  shader.vertexShader=hashGLSL+'attribute vec4 aStroke; varying float vStrokeAlive; varying vec2 vStroke; uniform float uMiscTime; uniform float uMiscRate; uniform vec2 uMiscResolution; uniform float uStrokeDensity; uniform float uStrokeBurst; uniform float uStrokeLength; uniform float uStrokeWidth; uniform float uStrokeWobble;\n'+shader.vertexShader
   // Aparición al azar: hay muchos más trazos que los visibles. Cada uno vive 1–4 ticks con su propio desfase
   // y, al volver, cambia de largo. Las ráfagas apagan o multiplican todos juntos cada ~6 ticks.
   // La dirección viaja en normal: el skinning la gira con el cuerpo.
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    float tick=floor(uMiscTime*uMiscRate);
    float seed=aStroke.z;
    float hold=1.+floor(miscHash(seed*5.3)*4.);
    float epoch=floor((tick+floor(miscHash(seed*2.9)*4.))/hold);
    float beat=floor((tick+3.)/6.);
    float burst=mix(1.,step(.35,miscHash(beat*1.37+.5))*(.3+1.4*miscHash(beat*7.1+.2)),uStrokeBurst);
    vStrokeAlive=step(miscHash(seed*.731+epoch*12.97),uStrokeDensity*burst*${STROKE_SHOWN.toFixed(2)});
    transformed+=normal*aStroke.w*uStrokeLength*(.55+.9*miscHash(seed*1.91+epoch*3.3));`)
   .replace('#include <project_vertex>',`#include <project_vertex>
    vec2 along=normalize(transformedNormal.xy+vec2(.00001));
    vec2 across=vec2(-along.y,along.x);
    float u=aStroke.x;
    float taper=pow(max(sin(3.14159*u),0.),.55)*(.55+.9*miscHash(seed*3.1));
    float wobble=(sin(u*7.+seed*1.7+tick*2.3)+.5*sin(u*17.-seed+tick*5.1))*uStrokeWobble*1.6;
    vStroke=vec2(u,aStroke.y);
    gl_Position.xy+=across*(aStroke.y*uStrokeWidth*taper+wobble)*2./uMiscResolution*gl_Position.w;
   `);
  shader.fragmentShader=hashGLSL+'uniform vec3 uStrokeColor; uniform float uMiscTime; uniform float uMiscRate; varying float vStrokeAlive; varying vec2 vStroke;\n'+shader.fragmentShader
   .replace('#include <opaque_fragment>',`#include <opaque_fragment>
    if(vStrokeAlive<.5)discard;
    // Pincel seco: algunas cerdas dejan huecos a lo largo del trazo.
    float bristle=miscHash(floor(vStroke.x*40.)*.37+floor((vStroke.y*.5+.5)*4.)*7.1+floor(uMiscTime*uMiscRate));
    if(bristle>.86&&abs(vStroke.y)>.2)discard;
    gl_FragColor=vec4(uStrokeColor,1.);
   `);
 };
 material.customProgramCacheKey=()=> 'character-misc-strokes-v1';
 return material;
}

function cutoutMaterial(settings){
 const material=outsideOnly(new THREE.MeshBasicMaterial({side:THREE.BackSide}));
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,settings);
  shader.vertexShader=hashGLSL+'uniform float uMiscTime; uniform float uMiscRate; uniform vec2 uMiscResolution; uniform float uCutOn; uniform float uCutWidth; uniform vec2 uCutOffset;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
    // Ancho distinto por zona: bordes en punta como papel cortado a tijera. Cambia a mitad de ritmo del hervor.
    float tick=floor(uMiscTime*uMiscRate*.5);
    float jag=miscHash(dot(floor(position*3.),vec3(12.9898,78.233,37.719))+tick*.61);
    // BackSide invierte la normal (FLIP_SIDED): se resta, igual que en el contorno.
    vec2 direction=normalize(transformedNormal.xy+vec2(.00001));
    gl_Position.xy+=(-direction*uCutWidth*(.45+1.1*jag)+uCutOffset)*uCutOn*2./uMiscResolution*gl_Position.w;
   `);
  shader.fragmentShader='uniform vec3 uCutColor; uniform float uCutOn;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\nif(uCutOn<.5)discard;\ngl_FragColor=vec4(uCutColor,1.);');
 };
 material.customProgramCacheKey=()=> 'character-misc-cutout-v1';
 return material;
}

// Mismo criterio de mallas que los contornos. Recorte debajo del contorno (renderOrder 1 < 2), trazos encima (3).
export function createCharacterMiscellany(root,settings,selectSource=o=>o.isSkinnedMesh&&o.name.startsWith('Chubee_'),{seed=7,count=STROKE_POOL}={}){
 const sources=[];root.traverse(o=>{if(selectSource(o))sources.push(o);});
 const meshes=[];
 sources.forEach((source,i)=>{
  if(!source.userData.outlineGeometry)source.userData.outlineGeometry=outlineGeometry(source.geometry);
  for(const [name,geometry,material,order] of [['Paper cutout',source.userData.outlineGeometry,cutoutMaterial(settings),1],['Loose strokes',strokeGeometry(source,{seed:seed+i,count}),strokeMaterial(settings),3]]){
   const mesh=new THREE.SkinnedMesh(geometry,material);
   mesh.name=name;mesh.renderOrder=order;mesh.frustumCulled=false;
   mesh.position.copy(source.position);mesh.quaternion.copy(source.quaternion);mesh.scale.copy(source.scale);
   mesh.bindMode=source.bindMode;mesh.bind(source.skeleton,source.bindMatrix);
   source.parent.add(mesh);meshes.push(mesh);
  }
 });
 return meshes;
}
// Controles de DialKit compartidos por el estudio (prendidos) y Capri (apagados por defecto).
export const miscellanyControls=(on=true)=>({
 Trazos:[on?.5:0,0,1,.05],'Largo trazos':[1.6,.2,3,.05],'Grosor trazos':[1.6,.3,4,.1],'Temblor trazos':[1,0,3,.1],'Ráfagas':[.6,0,1,.05],'Color trazos':'#130c29',
 Recorte:on,'Ancho recorte':[14,0,40,1],'Desfase recorte':{type:'pad',x:[.3,-1,1,.01],y:[-.3,-1,1,.01]},'Color recorte':'#f2c14e',
 Hervor:[8,1,24,1],
});
export function applyMiscellany(settings,m){
 settings.uStrokeDensity.value=m.Trazos;settings.uStrokeLength.value=m['Largo trazos'];settings.uStrokeWidth.value=m['Grosor trazos'];settings.uStrokeWobble.value=m['Temblor trazos'];settings.uStrokeBurst.value=m['Ráfagas'];settings.uStrokeColor.value.set(m['Color trazos']);
 settings.uCutOn.value=m.Recorte?1:0;settings.uCutWidth.value=m['Ancho recorte'];settings.uCutOffset.value.set(m['Desfase recorte'].x*20,m['Desfase recorte'].y*20);settings.uCutColor.value.set(m['Color recorte']);
 settings.uMiscRate.value=m.Hervor;
}
// Un solo reloj por página: los dos personajes comparten settings y hierven juntos.
export function tickMiscellany(settings,dt,width,height){settings.uMiscTime.value+=dt;settings.uMiscResolution.value.set(width,height);}
