import * as THREE from 'three';
import {retro} from './retro-material.js';
import {formatTime,dayCycle,wrapMinutes,handDelta} from './day-cycle.js';

export function createDeskClock() {
  const object=new THREE.Group();object.name='Reloj del escritorio';
  const yellow=retro(0xf5bf25),edge=retro(0xd99a15),ink=retro(0x323441),softInk=retro(0xaaa18a),cream=retro(0xf8e7bd);
  // Author the tiny prop at larger print-space units, then compensate with the
  // mesh transform. It uses the room's unmodified ink, mottle and diffuse shader
  // at a comparable grain density, including when brought close to the camera.
  const mesh=(geometry,material,x=0,y=0,z=0,parent=object)=>{
    geometry.scale(5,5,5);
    const m=new THREE.Mesh(geometry,material);m.scale.setScalar(.2);m.position.set(x,y,z);
    m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  };
  const ellipsoid=(x,y,z)=>new THREE.IcosahedronGeometry(1,3).scale(x,y,z);
  const body=mesh(ellipsoid(.269,.269,.097),yellow,0,0,-.025);body.name='Carcasa amarilla';
  const rim=mesh(new THREE.TorusGeometry(.242,.029,10,56),yellow,0,0,.060);rim.name='Borde redondeado';
  mesh(new THREE.TorusGeometry(.222,.008,6,48),edge,0,0,.087);
  const face=mesh(new THREE.CylinderGeometry(.223,.223,.012,48),cream,0,0,.085);face.rotation.x=Math.PI/2;face.name='Esfera crema';
  // Raised, rounded hour marks and hands, like the reference; no flat dial art.
  for(let i=0;i<12;i++){
    const angle=i*Math.PI/6;
    const mark=mesh(new THREE.CapsuleGeometry(.0058,.017,3,6),i%3===0?ink:softInk,Math.sin(angle)*.189,Math.cos(angle)*.189,.097);
    mark.rotation.z=-angle;
  }
  const hand=(length,radius,z)=>{
    const pivot=new THREE.Group();object.add(pivot);
    mesh(new THREE.CapsuleGeometry(radius,length-radius*2,4,8),ink,0,length*.40,z,pivot);return pivot;
  };
  const hour=hand(.138,.010,.111),minute=hand(.191,.0075,.133);
  hour.name='Aguja de horas';minute.name='Aguja de minutos';
  mesh(ellipsoid(.021,.021,.012),ink,0,0,.155);
  for(const side of [-1,1]){
    const foot=mesh(new THREE.CapsuleGeometry(.023,.066,4,8),yellow,side*.148,-.255,-.008);foot.rotation.z=-side*.43;foot.name='Pata inclinada';
    const bell=new THREE.Group();bell.position.set(side*.190,.252,-.017);bell.rotation.z=-side*.43;bell.name=side<0?'Campana izquierda':'Campana derecha';object.add(bell);
    mesh(new THREE.CylinderGeometry(.009,.012,.10,7),edge,0,-.030,0,bell);
    mesh(new THREE.SphereGeometry(.108,20,8,0,Math.PI*2,0,Math.PI/2),yellow,0,0,0,bell);
    const lip=mesh(new THREE.TorusGeometry(.103,.007,6,20),edge,0,0,0,bell);lip.rotation.x=Math.PI/2;
    const bottom=mesh(new THREE.CircleGeometry(.102,20),edge,0,0,0,bell);bottom.rotation.x=Math.PI/2;
    mesh(ellipsoid(.023,.025,.023),yellow,0,.122,0,bell);
  }
  const arch=new THREE.CubicBezierCurve3(new THREE.Vector3(-.153,.339,-.040),new THREE.Vector3(-.151,.446,-.040),new THREE.Vector3(.151,.446,-.040),new THREE.Vector3(.153,.339,-.040));
  mesh(new THREE.TubeGeometry(arch,20,.012,7,false),yellow).name='Asa superior';
  mesh(new THREE.CylinderGeometry(.008,.008,.063,7),edge,0,.290,-.018);
  mesh(new THREE.CapsuleGeometry(.015,.029,3,8),yellow,0,.325,-.018).rotation.z=Math.PI/2;
  return {object,hour,minute,update(minutes){hour.rotation.z=-minutes/720*Math.PI*2;minute.rotation.z=-minutes/60*Math.PI*2;}};
}

// The actual desk object travels toward the camera. The transparent dialog only
// traps focus/pointers; every visible clock surface and both hands remain 3D.
export function createClockEditor({clock,scene,camera,canvas,getTime,setTime,reducedMotion,onOpen=()=>{}}) {
  const object=clock.object;
  const rest={position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()};
  const dialog=document.createElement('dialog');dialog.id='clock-dialog';dialog.className='clock-lightbox';
  dialog.setAttribute('aria-label','Reloj del escritorio');
  dialog.innerHTML=`<button type="button" class="clock-close" aria-label="Volver al escritorio">×</button><div class="clock-accessibility"><span role="slider" tabindex="0" data-hand="hour" aria-label="Manecilla de horas" aria-valuemin="0" aria-valuemax="23"></span><span role="slider" tabindex="0" data-hand="minute" aria-label="Manecilla de minutos" aria-valuemin="0" aria-valuemax="59"></span><output></output></div>`;
  document.body.append(dialog);
  const controls=[...dialog.querySelectorAll('[data-hand]')];
  // A short-range inspection fill preserves real diffuse shading at night.
  // Its cutoff stays around the lifted prop, so the room's cycle remains intact.
  const inspectionLight=new THREE.PointLight(0xffe2b5,0,1,2),lightOffset=new THREE.Vector3();
  inspectionLight.name='Luz de inspección del reloj';scene.add(inspectionLight);
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),inverse=new THREE.Matrix4(),localRay=new THREE.Ray(),facePlane=new THREE.Plane(new THREE.Vector3(0,0,1),-.133),hit=new THREE.Vector3();
  const target=new THREE.Vector3(),orientation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion(),tilt=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-.10);
  const meshes=[];object.traverse(mesh=>{if(mesh.isMesh)meshes.push({mesh,castShadow:mesh.castShadow});});
  let frustum={left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom};
  let amount=0,drag=null,returnFocus=null,outsidePointer=null;
  function sync(){
    const time=getTime();controls.forEach((control,i)=>{control.setAttribute('aria-valuenow',String(i?Math.floor(time%60):Math.floor(time/60)));control.setAttribute('aria-valuetext',`${formatTime(time)}, ${dayCycle(time).phase}`);});
    dialog.querySelector('output').textContent=formatTime(time);
  }
  function change(minutes){setTime(wrapMinutes(minutes));sync();}
  function localPoint(event){
    const bounds=canvas.getBoundingClientRect();ndc.set((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2);
    ray.setFromCamera(ndc,camera);object.updateWorldMatrix(true,false);inverse.copy(object.matrixWorld).invert();localRay.copy(ray.ray).applyMatrix4(inverse);
    return localRay.intersectPlane(facePlane,hit);
  }
  function pickHand(point){
    if(!point||Math.hypot(point.x,point.y)<.025)return null;
    const a=Math.atan2(point.x,point.y),radius=Math.hypot(point.x,point.y);
    const distance=hand=>Math.abs(Math.atan2(Math.sin(a+clock[hand].rotation.z),Math.cos(a+clock[hand].rotation.z)))*radius;
    if(radius<.135&&distance('hour')<.025)return 'hour';
    if(radius<.20&&distance('minute')<.025)return 'minute';
    return null;
  }
  const stop=()=>{if(drag)change(Math.round(getTime()));drag=null;outsidePointer=null;dialog.style.cursor='';};
  function close(){if(dialog.open)dialog.close();}
  dialog.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('button'))return;
    const point=localPoint(event),hand=pickHand(point);outsidePointer=point&&(Math.abs(point.x)>.34||point.y<-.34||point.y>.45)?event.pointerId:null;
    if(!hand)return;
    event.preventDefault();controls[hand==='hour'?0:1].focus({preventScroll:true});
    drag={id:event.pointerId,hand,angle:Math.atan2(point.x,point.y)};dialog.setPointerCapture(event.pointerId);dialog.style.cursor='grabbing';
  });
  dialog.addEventListener('pointermove',event=>{
    const point=localPoint(event);
    if(!drag){dialog.style.cursor=pickHand(point)?'grab':'';return;}
    if(event.pointerId!==drag.id||!point||Math.hypot(point.x,point.y)<.025)return;
    const next=Math.atan2(point.x,point.y);change(getTime()+handDelta(drag.angle,next,drag.hand));drag.angle=next;
  });
  dialog.addEventListener('pointerup',event=>{const point=localPoint(event),outside=outsidePointer===event.pointerId&&point&&(Math.abs(point.x)>.34||point.y<-.34||point.y>.45);stop();if(outside)close();});
  for(const name of ['pointercancel','lostpointercapture'])dialog.addEventListener(name,stop);
  dialog.addEventListener('keydown',event=>{
    event.stopPropagation();const hand=event.target.dataset.hand;
    if(hand&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();change(getTime()+(['ArrowRight','ArrowUp'].includes(event.key)?1:-1)*(hand==='hour'?60:1)*(event.shiftKey?5:1));
    }
  });
  dialog.querySelector('button').addEventListener('click',close);
  dialog.addEventListener('close',()=>{stop();returnFocus?.focus({preventScroll:true});});
  return {
    get open(){return dialog.open;},get active(){return dialog.open||amount>0;},
    resize(){frustum={left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom};},
    show(){if(dialog.open||amount>0)return;returnFocus=document.activeElement;onOpen();sync();dialog.showModal();controls[0].focus({preventScroll:true});},close,
    update(dt){
      const goal=dialog.open?1:0;if(!amount&&!goal){canvas.parentElement.dataset.clock='desk';return;}amount=reducedMotion.matches?goal:THREE.MathUtils.damp(amount,goal,9,dt);
      if(Math.abs(amount-goal)<.001)amount=goal;
      const bounds=canvas.getBoundingClientRect();
      // Make room beside the object without hiding the live lighting. On narrow
      // screens the room moves upward and the clock docks below, to the right.
      const narrow=bounds.width<700,zoom=1+amount*(narrow?.10:.08);
      const dx=narrow?0:(frustum.right-frustum.left)*.16*amount;
      const dy=narrow?-(frustum.top-frustum.bottom)*.15*amount:0;
      camera.left=frustum.left*zoom+dx;camera.right=frustum.right*zoom+dx;
      camera.top=frustum.top*zoom+dy;camera.bottom=frustum.bottom*zoom+dy;camera.updateProjectionMatrix();
      if(!amount){object.position.copy(rest.position);object.quaternion.copy(rest.quaternion);object.scale.copy(rest.scale);}
      else {
        camera.updateMatrixWorld();
        const diameter=narrow?Math.min(bounds.width*.49,bounds.height*.28,170):Math.min(bounds.width*.265,bounds.height*.40,300);
        const centerX=bounds.right-diameter*.63-14;
        const centerY=narrow?bounds.bottom-diameter*.66-28:bounds.top+bounds.height*.54;
        const x=(centerX-bounds.left)/bounds.width*2-1,y=1-(centerY-bounds.top)/bounds.height*2;
        target.set(x,y,-1).unproject(camera).addScaledVector(camera.getWorldDirection(hit),3-camera.near);
        object.parent.worldToLocal(target);
        object.position.lerpVectors(rest.position,target,amount);
        // A gentle upward arc makes the object lift off its feet as it comes forward.
        object.position.y+=Math.sin(amount*Math.PI)*.35;
        object.parent.getWorldQuaternion(parentRotation);orientation.copy(parentRotation).invert().multiply(camera.quaternion).multiply(tilt);
        object.quaternion.slerpQuaternions(rest.quaternion,orientation,amount);
        const scale=diameter/bounds.width*(camera.right-camera.left)/.53;
        object.scale.setScalar(THREE.MathUtils.lerp(rest.scale.x,scale,amount));
        dialog.style.setProperty('--clock-x',`${centerX}px`);
        dialog.style.setProperty('--clock-y',`${centerY}px`);
        dialog.style.setProperty('--clock-radius',`${diameter/2}px`);
      }
      const radius=object.scale.x*.265;
      object.getWorldPosition(inspectionLight.position);
      inspectionLight.position.add(lightOffset.set(-.9,1.2,1.7).applyQuaternion(camera.quaternion).multiplyScalar(radius));
      inspectionLight.distance=radius*3.3;
      inspectionLight.intensity=amount*radius*radius*(3.6+2.4*dayCycle(getTime()).night);
      for(const {mesh,castShadow} of meshes)mesh.castShadow=amount?false:castShadow;
      dialog.dataset.settled=String(amount===1);canvas.parentElement.dataset.clock=amount?(dialog.open?'open':'returning'):'desk';
      // Project the actual model for accessibility/interaction diagnostics.
      if(amount){
        object.updateWorldMatrix(true,true);
        const center=object.localToWorld(new THREE.Vector3(0,0,.133)).project(camera);
        const edge=object.localToWorld(new THREE.Vector3(.265,0,.133)).project(camera);
        const top=object.localToWorld(new THREE.Vector3(0,.265,.133)).project(camera);
        dialog.dataset.dial=`${bounds.left+(center.x+1)*bounds.width/2},${bounds.top+(1-center.y)*bounds.height/2},${Math.abs(edge.x-center.x)*bounds.width/2},${Math.abs(top.y-center.y)*bounds.height/2}`;
      }
    },
  };
}
