import {smoothCameraFov} from './flight-camera-fov.js';
import {Object3D,Vector3} from 'three';
import {KlippThree,VirtualCameraThree,FollowBodyThree,RotationComposerAimThree} from '@pmndrs/klipp/three';
import {createDialKit} from './dev-dials.js';

export function createFlightCameraKlipp(camera,{enabled=true,element=null,canOrbit=()=>true}={}){
  const target=new Object3D(),anchor=new Vector3(),safePosition=new Vector3(),rearPosition=new Vector3();
  const kit=createDialKit('Cámara · seguimiento',{
    Sistema:{type:'select',options:['Actual','Klipp'],default:enabled?'Klipp':'Actual'},
    'Retorno detrás':[1.2,.1,2,.05],
    'Espera mouse':[.7,0,2,.1],
    Distancia:[8.5,6,30,.5],Altura:[4,2,15,.25],Lateral:[0,-5,5,.1],
    'Suavizado posición':[.1,0,1,.025],'Suavizado giro':[.05,0,1,.025],
    'Suavizado mirada':[0,0,1,.025],Anticipación:[0,0,.5,.025],
  },{id:'flight-klipp-camera-v1',persist:false,defaultCollapsed:false});
  let klipp,shot,body,aim,wasActive=false,fov=62,collisionWorld,heading=0,orbitYaw=0,orbitHeight=0,idle=0,pointer=null,lastX=0,lastY=0;
  const up=new Vector3(0,1,0),events=new AbortController();
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  if(element){
    element.addEventListener('contextmenu',e=>e.preventDefault(),{signal:events.signal});
    element.addEventListener('pointerdown',e=>{
      if(e.pointerType!=='mouse'||!canOrbit()||!wasActive||kit.values.Sistema!=='Klipp'||pointer!==null)return;
      pointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;idle=0;element.setPointerCapture(pointer);
    },{signal:events.signal});
    element.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;
      orbitYaw=wrap(orbitYaw-(e.clientX-lastX)*.006);orbitHeight=Math.max(-1.5,Math.min(5,orbitHeight+(e.clientY-lastY)*.025));
      lastX=e.clientX;lastY=e.clientY;idle=0;
    },{signal:events.signal});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,e=>{if(e.pointerId===pointer){pointer=null;idle=0;}},{signal:events.signal});
  }
  function reset(){
    if(klipp)klipp.remove(shot);
    klipp=new KlippThree(camera);shot=new VirtualCameraThree('race-follow');
    body=new FollowBodyThree(target,{bindingMode:'lockToTargetWithWorldUp'});
    // Frame the ship itself. A forward offset rotates around it during turns
    // and pushes it offscreen when collision shortens the camera distance.
    aim=new RotationComposerAimThree(target,{targetOffset:new Vector3(0,2,0),radius:0,lookaheadIgnoreY:true,screenPosition:[0,-.15]});
    shot.body=body;shot.aim=aim;
    // Correct the position BEFORE aiming, inside Klipp's state. Moving the real
    // camera afterward leaves both the composer and Klipp's cached shot stale.
    shot.addExtension({applyAfter:'body',update(out){
      safePosition.fromArray(out.position);
      // Chase orientation is relative to the car, never its delayed world position.
      // Keep vertical damping, but remove sideways translation lag in long turns.
      rearPosition.set(body.offset[0],0,body.offset[2]).applyAxisAngle(up,heading+orbitYaw).add(target.position);
      safePosition.x=rearPosition.x;safePosition.z=rearPosition.z;safePosition.y+=orbitHeight;
      safePosition.y=Math.max(safePosition.y,(collisionWorld.surfaceHeight(safePosition.x,safePosition.z)??0)+3.5);
      anchor.copy(target.position);anchor.y+=2.3;
      collisionWorld.clipCamera?.(anchor,safePosition);
      safePosition.toArray(out.position);
    }});
    shot.addExtension({applyAfter:'start',update(out){out.fov=fov;}});klipp.add(shot);
  }
  return {
    get enabled(){return kit.values.Sistema==='Klipp';},
    suspend(){wasActive=false;pointer=null;},
    update(state,dt,{world,profile,snap=false,reduced=false,cameraMode=0}){
      const v=kit.values;
      target.position.set(state.x,state.y,state.z);target.rotation.set(0,state.yaw,0);target.updateMatrixWorld(true);
      collisionWorld=world;
      fov=smoothCameraFov(fov,profile.fov,dt,snap||!wasActive||reduced,profile.lens);
      if(snap||!wasActive){reset();snap=true;}
      if(snap){heading=state.yaw;orbitYaw=orbitHeight=idle=0;}
      else {
        const delta=wrap(state.yaw-heading),smooth=v['Suavizado giro'];
        heading=state.yaw-Math.max(-.35,Math.min(.35,delta*Math.exp(-dt/Math.max(.001,smooth))));
        if(pointer===null){
          idle+=dt;
          if((state.speed??0)>1&&idle>=v['Espera mouse']){
            const decay=Math.exp(-dt*4/v['Retorno detrás']);orbitYaw*=decay;orbitHeight*=decay;
          }
        }
      }
      wasActive=true;klipp.setSize(camera.aspect*1000,1000);
      body.offset=[v.Lateral,v.Altura*(cameraMode===1?2:1),-v.Distancia*(cameraMode===1?2:1)];
      body.damping=snap||reduced?0:v['Suavizado posición'];body.rotationDamping=snap||reduced?0:v['Suavizado giro'];
      aim.damping=snap||reduced?0:v['Suavizado mirada'];aim.lookaheadTime=reduced?0:v.Anticipación;
      klipp.update(Math.min(dt,.1));
      camera.updateMatrixWorld();
    },
    dispose(){events.abort();if(klipp)klipp.remove(shot);kit.destroy();},
  };
}
