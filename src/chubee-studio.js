import './chubee-studio.css';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createDialKit,createDialRoot} from 'dialkit/vanilla';
import {createBluleet} from './chubee-shader/capri-bluleet.js';
import {createPrintMaterial,createCharacterOutlines} from './chubee-shader/character-finish.js';
import {createMiscellanySettings,createCharacterMiscellany,tickMiscellany} from './chubee-shader/character-miscellany.js';
import {createRegistration,createRegistrationPass} from './chubee-shader/cmyk-registration.js';
import {createDrivingPose} from './bluleet-driving-pose.js';
import {shipConfig,shipUrl,prepareShipModel} from './ship-catalog.js';

const canvas=document.querySelector('#scene'),status=document.querySelector('#status');
// Chubee's onBeforeCompile ink/stencil shaders require the original WebGL renderer.
// This isolated studio does not replace the racing game's WebGPU renderer.
const renderer=new T.WebGLRenderer({canvas,antialias:true,stencil:true,preserveDrawingBuffer:true});
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene();scene.background=new T.Color('#e7e7e4');
scene.add(new T.HemisphereLight(0xffffff,0x767184,2));
const key=new T.DirectionalLight(0xffe9d5,3);key.position.set(-3,6,5);scene.add(key);
const fill=new T.DirectionalLight(0xb0c8ff,2);fill.position.set(4,3,-2);scene.add(fill);
const camera=new T.OrthographicCamera(-5,5,4,-4,.1,100),orbit=new OrbitControls(camera,canvas);orbit.enableDamping=true;
const ink={value:1},carInk={value:1},misc=createMiscellanySettings(),registration=createRegistration(),pass=createRegistrationPass(renderer,registration);
misc.uStrokeDensity.value=.25;misc.uStrokeLength.value=1.3;
let actor,car,carOutline,pose,poseStats,ready=false,moving=true,retro=900,last=performance.now(),disposed=false;
function reset(){camera.position.set(6,4.7,8);orbit.target.set(.65,1.5,0);camera.zoom=1;camera.updateProjectionMatrix();orbit.update();}
function resize(){const h=7,w=h*innerWidth/innerHeight;camera.left=-w/2;camera.right=w/2;camera.top=h/2;camera.bottom=-h/2;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,retro/innerHeight));renderer.setSize(innerWidth,innerHeight,false);}
reset();resize();addEventListener('resize',resize);
const controls=createDialKit('Bluleet · Hover Kart',{
  Acabado:{'Tinta personaje':true,'Tinta auto':false,Contorno:true,'Recorte amarillo':true,'Grosor contorno':[.8,.1,2,.1],'CMYK':[1,0,8,.5],Movimiento:true},
  Piloto:{_collapsed:true,Altura:[2.8,2,3,.05],'Altura asiento':[1.225,.75,1.4,.025],'Posición asiento':[-.1,-.4,.3,.025],'Inclinación':[7,0,35,1],'Altura manos':[1.35,.9,1.9,.025],'Posición manos':[.625,.2,1,.025]},
  Escena:{_collapsed:true,Fondo:'#e7e7e4','Resolución':[900,360,1080,60],'Frente':{type:'action'},'Costado':{type:'action'},'Perspectiva':{type:'action'},'Capturar':{type:'action'},'Volver al hangar':{type:'action'}},
},{id:'bluleet-kart-shader-studio-v5',persist:true,onAction:path=>{
  if(path==='Escena.Perspectiva')reset();
  if(path==='Escena.Frente'||path==='Escena.Costado'){camera.position.set(path==='Escena.Frente'?0:9,2.3,path==='Escena.Frente'?10:0);orbit.target.set(0,1.7,0);orbit.update();}
  if(path==='Escena.Volver al hangar')location.href=`${import.meta.env.BASE_URL}spaceship.html?vehicle=bluleet`;
  if(path==='Escena.Capturar'){render(0);const a=document.createElement('a');a.download='bluleet-hover-tinta.png';a.href=canvas.toDataURL();a.click();}
}});createDialRoot();
function apply(v){
  ink.value=Number(v.Acabado['Tinta personaje']);carInk.value=Number(v.Acabado['Tinta auto']);moving=v.Acabado.Movimiento;
  actor?.outlines.set(v.Acabado.Contorno?2:0,1,1,v.Acabado['Grosor contorno']);carOutline?.set(v.Acabado.Contorno&&v.Acabado['Tinta auto']?1:0,.25,.3,v.Acabado['Grosor contorno']*.5);
  misc.uCutOn.value=Number(v.Acabado['Recorte amarillo']);registration.uRegAmount.value=v.Acabado.CMYK;
  misc.uStrokeDensity.value=v.Acabado.Contorno?.25:0;
  scene.background.set(v.Escena.Fondo);retro=v.Escena.Resolución;resize();
  if(pose){const p=v.Piloto;poseStats=pose({height:p.Altura,seatY:p['Altura asiento'],seatZ:p['Posición asiento'],lean:p.Inclinación*Math.PI/180,gripY:p['Altura manos'],gripZ:p['Posición manos']});}
}
controls.subscribe(apply);
try{
  const loader=new GLTFLoader(),base=import.meta.env.BASE_URL;
  const [pilot,vehicle]=await Promise.all([loader.loadAsync(`${base}models/bluleet/bluleet-motionlab-dedos.glb`),loader.loadAsync(shipUrl('bluleet'))]);
  actor=createBluleet(pilot,ink);actor.state.uSkin.value.set('#2145ec');actor.state.uSkinMix.value=1;actor.state.uTextureLevels.value=5;
  actor.state.uEyeWhite.value.setRGB(.96,.96,.96);actor.state.uEyeInk.value.setRGB(.005,.005,.005);
  pose=createDrivingPose(actor);scene.add(actor.root);createCharacterMiscellany(actor.root,misc,o=>o.isSkinnedMesh&&o.name==='Bluleet',{seed:21});
  car=prepareShipModel(vehicle.scene,shipConfig('bluleet'));scene.add(car);
  car.traverse(o=>{if(!o.isMesh)return;o.material=createPrintMaterial(o.material,carInk,false,true);Object.assign(o.material,{stencilWrite:true,stencilRef:1,stencilFunc:T.AlwaysStencilFunc,stencilFail:T.KeepStencilOp,stencilZFail:T.KeepStencilOp,stencilZPass:T.ReplaceStencilOp});});
  carOutline=createCharacterOutlines(car,o=>o.isMesh);apply(controls.values);ready=true;status.hidden=true;document.body.dataset.ready='true';
}catch(error){status.textContent='No se pudo preparar el estudio. Recargá para volver a intentar.';status.setAttribute('role','alert');console.error(error);}
function render(dt){
  if(!ready)return;actor.update(dt,moving,0);actor.outlines.update(moving?dt:0,canvas.width,canvas.height);carOutline.update(moving?dt:0,canvas.width,canvas.height);tickMiscellany(misc,moving?dt:0,canvas.width,canvas.height);registration.uRegTick.value=Math.floor(misc.uMiscTime.value*8);orbit.update();renderer.render(scene,camera);pass.render();
  canvas.dataset.frame=String(Number(canvas.dataset.frame??0)+1);
}
renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.05);last=now;if(!disposed&&!document.hidden)render(dt);});
// Read-only diagnostics for pose and shader integration tests.
window.__bluleetStudio={get ready(){return ready},get pose(){return poseStats},get actor(){return actor},get car(){return car},get renderer(){return renderer},get controls(){return controls}};
addEventListener('pagehide',()=>{disposed=true;renderer.setAnimationLoop(null);orbit.dispose();const geometry=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(!o.isMesh)return;geometry.add(o.geometry);for(const m of [].concat(o.material)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();},{once:true});
