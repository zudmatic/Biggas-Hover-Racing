import {Vector3} from 'three';
import {KlippThree,VirtualCameraThree,FollowBodyThree,RotationComposerAimThree} from '@pmndrs/klipp/three';

// Klipp drives a separate camera so OrbitControls never competes for its transform.
export function createStudioCamera(camera,orbit,ship){
  const followCamera=camera.clone(),klipp=new KlippThree(followCamera);
  const follow=new VirtualCameraThree('studio-follow');
  const body=new FollowBodyThree(ship,{offset:new Vector3(0,4,-12),bindingMode:'lockToTargetWithWorldUp'});
  const aim=new RotationComposerAimThree(ship,{targetOffset:new Vector3(0,.7,0),lookaheadIgnoreY:true,radius:0});
  follow.body=body;follow.aim=aim;klipp.add(follow);
  let settings,mode,phase=0,fov=45;
  const previous=new Vector3(),delta=new Vector3();
  follow.addExtension({applyAfter:'start',update(out){out.fov=fov;}});
  return {
    configure(v){
      settings=v;
      body.offset=[v.Lateral,v.Altura,-v.Distancia];
      body.damping=v['Suavizado posición'];body.rotationDamping=v['Suavizado giro'];
      aim.damping=v['Suavizado mirada'];aim.lookaheadTime=v.Anticipación;
      aim.lookaheadSmoothing=.25;aim.screenPosition=[0,v.Encuadre];aim.deadZone=[.05,.05];
      if(mode!==v.Cámara){
        mode=v.Cámara;orbit.enabled=mode==='Actual';
        if(orbit.enabled){orbit.target.copy(ship.position).add(new Vector3(0,.7,0));orbit.update();}
      }
    },
    move(dt,time,studio){
      previous.copy(ship.position);
      if(settings['Recorrido de prueba']){
        phase+=dt*settings['Velocidad recorrido'];
        const radius=settings['Tamaño recorrido'];
        ship.position.set(Math.sin(phase)*radius,0,Math.sin(2*phase)*radius*.5);
        ship.rotation.y=Math.atan2(Math.cos(phase),Math.cos(2*phase));
      }else{
        ship.position.set(0,0,0);
        ship.rotation.y=studio['Simular giro']?Math.sin(time*studio['Velocidad giro'])*studio['Amplitud giro']:0;
      }
      // Manual orbit retains its chosen angle and follows the translation.
      if(orbit.enabled){delta.subVectors(ship.position,previous);camera.position.add(delta);orbit.target.add(delta);}
    },
    update(dt,power,paused){
      fov+=(settings.FOV+settings['FOV turbo']*power-fov)*(1-Math.exp(-dt*5));
      if(!paused)klipp.update(dt);
      if(orbit.enabled){camera.fov=settings.FOV;orbit.update();}
      else if(!paused){
        camera.position.copy(followCamera.position);camera.quaternion.copy(followCamera.quaternion);camera.fov=followCamera.fov;
      }
      camera.updateProjectionMatrix();camera.updateMatrixWorld();
    },
    resize(w,h){klipp.setSize(w,h);followCamera.aspect=w/h;followCamera.updateProjectionMatrix();},
    dispose(){klipp.remove(follow);},
  };
}
