import * as THREE from 'three';
import { retro } from './retro-material.js';
import { createHalloweenMask } from './halloween-mask.js';

const matte=color=>retro(color);
function box(parent,w,h,d,material,x,y,z) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
  mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}

// The pixel glasses worn for dancing; also rest on the nightstand in Zud's room.
export function createPixelGlasses() {
  const frame=matte(0x494e58),lens=matte(0x080d14),glint=new THREE.MeshBasicMaterial({color:0xd9e2eb});
  const glasses=new THREE.Group();glasses.name='Anteojos pixelados';
  for(const side of [-1,1]) {
    const x=side*.49;
    box(glasses,.83,.39,.10,frame,x,0,0);
    box(glasses,.69,.53,.10,frame,x,0,0);
    box(glasses,.73,.29,.015,lens,x,0,.058);
    box(glasses,.59,.43,.015,lens,x,0,.058);
    for(let i=0;i<3;i++)box(glasses,.072,.056,.01,glint,x-.19+i*.065,.11-i*.054,.071);
    box(glasses,.065,.085,.64,frame,side*.88,.10,-.29);
  }
  box(glasses,.22,.08,.10,frame,0,.05,0);
  return glasses;
}

// The cigarette Zud smokes; also rests on the nightstand in his room. It runs
// from the filter at the origin along `direction`, .83 long.
export function createCigarette(direction=new THREE.Vector3(1,0,0)) {
  const cigarette=new THREE.Group();cigarette.name='Cigarro';
  const paper=matte(0xf2efe5),filter=matte(0xc58e50);
  function segment(length,radius,material,offset) {
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,8),material);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
    mesh.position.copy(direction).multiplyScalar(offset);cigarette.add(mesh);return mesh;
  }
  segment(.16,.061,filter,.08);
  segment(.62,.058,paper,.47);
  segment(.025,.056,matte(0x9b9290),.795);
  const ember=retro(0x9b3a21,{emissive:0xf76624,emissiveIntensity:.2});
  segment(.016,.048,ember,.815);
  cigarette.userData.ember=ember;
  return cigarette;
}

// A 5.2 s gesture (raise, drag, lower, exhale), then 2 s with the hand down.
// reach: hand at the mouth (0–1); drag: the ember glows; exhale: smoke leaves
// the mouth; breath: chest rise and fall.
export function smokeCycle(time) {
  const gestureDuration=5.2,restDuration=2,period=gestureDuration+restDuration;
  const u=Math.min(((time%period)+period)%period/gestureDuration,1),s=THREE.MathUtils.smootherstep;
  const reach=s(u,.06,.23)*(1-s(u,.46,.64));
  const drag=s(u,.25,.30)*(1-s(u,.41,.46));
  const exhale=s(u,.64,.70)*(1-s(u,.85,.96));
  const breath=s(u,.25,.44)*(1-s(u,.62,.88));
  return {u,reach,drag,exhale,breath};
}

// A small faceted watering can; the origin is the handle, where the hand holds it.
export function createWateringCan() {
  const can=new THREE.Group();can.name='Regadera';
  const tin=retro(0x5a9c8c,{});
  const dark=retro(0x2f5a52,{});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.26,.3,.44,8),tin);body.position.set(0,-.34,.18);can.add(body);
  const lid=new THREE.Mesh(new THREE.CylinderGeometry(.2,.26,.05,8),dark);lid.position.set(0,-.1,.18);can.add(lid);
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.2,.035,5,10,Math.PI),tin);handle.rotation.y=Math.PI/2;handle.position.set(0,-.1,.18);can.add(handle);
  const spout=new THREE.Mesh(new THREE.CylinderGeometry(.03,.05,.62,6),tin);
  spout.position.set(0,-.3,.6);spout.rotation.x=1.05;can.add(spout);
  const rose=new THREE.Mesh(new THREE.CylinderGeometry(.09,.04,.08,7),dark);rose.position.set(0,-.14,.86);rose.rotation.x=1.05;can.add(rose);
  can.userData.spout=new THREE.Vector3(0,-.12,.9);
  return can;
}

export function createAccessories(root) {
  const glasses=createPixelGlasses();root.add(glasses);

  const smoking=new THREE.Group();smoking.name='Pausa para fumar';root.add(smoking);
  const direction=new THREE.Vector3(-1,-.12,.28).normalize();
  const cigarette=createCigarette(direction);cigarette.position.set(-.19,-.42,.80);smoking.add(cigarette);
  const emberMaterial=cigarette.userData.ember;
  const tip=new THREE.Vector3(),emitter=new THREE.Vector3();
  let previousSmokeTime=-1,wasSmoking=false;
  const smokeGeometry=new THREE.IcosahedronGeometry(1,1);
  const puffs=Array.from({length:9},(_,i)=> {
    const material=retro(0xc6c8ca,{transparent:true,opacity:0,depthWrite:false});
    const group=new THREE.Group();group.name=`Humo del cigarrillo ${i+1}`;
    for(let j=0;j<3;j++) {
      const mesh=new THREE.Mesh(smokeGeometry,material);
      mesh.position.set((j-1)*.45,j%2*.30,Math.sin(j+i)*.12);mesh.scale.setScalar(j===1?1:.72);group.add(mesh);
    }
    smoking.add(group);return {group,material,origin:new THREE.Vector3(),slot:null};
  });
  // Exhaled smoke leaves the mouth after a drag (only with a smoke cycle).
  const exhaled=Array.from({length:7},(_,i)=> {
    const material=retro(0xd4d5d8,{transparent:true,opacity:0,depthWrite:false});
    const mesh=new THREE.Mesh(smokeGeometry,material);mesh.name=`Exhalación ${i+1}`;smoking.add(mesh);return {mesh,material,seed:i*1.7};
  });
  // Zud's mouth: below and between the eyes, on the front of the face.
  const exhaleOrigin=new THREE.Vector3(-.32,-.46,.28);

  // Watering: the can pours a stream of faceted drops.
  const watering=new THREE.Group();watering.name='Regando';root.add(watering);
  const can=createWateringCan();watering.add(can);
  const dropMaterial=retro(0x8fc6ea,{transparent:true,opacity:.85});
  const drops=Array.from({length:12},()=>{const drop=new THREE.Mesh(new THREE.IcosahedronGeometry(.035,0),dropMaterial);watering.add(drop);return drop;});
  const pour=new THREE.Vector3(),land=new THREE.Vector3();
  const mask=createHalloweenMask();root.add(mask);
  glasses.visible=smoking.visible=watering.visible=false;
  // target: where the water lands, in this group's space (default: just ahead).
  return {glasses,smoking,exhaleOrigin,watering,can,mask,update({state,time,elapsed,motion,traveling,halloweenElapsed=0,cycle=null,target=null}) {
    glasses.visible=state==='disco'&&!traveling;
    smoking.visible=state==='smoke'&&!traveling;
    const smokeTime=motion?Math.max(0,elapsed??time):0;
    if(smoking.visible&&!cycle)cycle=smokeCycle(smokeTime);
    if(!wasSmoking||smokeTime<previousSmokeTime)puffs.forEach(puff=>puff.slot=null);
    wasSmoking=smoking.visible;previousSmokeTime=smokeTime;
    watering.visible=state==='water'&&!traveling;
    mask.visible=state==='halloween'&&!traveling;
    const maskWear=motion?THREE.MathUtils.smoothstep(halloweenElapsed,0,.85):1;
    mask.position.set(0,THREE.MathUtils.lerp(-.30,0,maskWear),THREE.MathUtils.lerp(1.38,.85,maskWear));
    mask.rotation.set((1-maskWear)*-.32,0,(1-maskWear)*-.12);
    const wear=motion?THREE.MathUtils.smoothstep(elapsed,0,.85):1;
    glasses.position.set(0,THREE.MathUtils.lerp(.78,-.08,wear),THREE.MathUtils.lerp(1.22,.84,wear));
    glasses.rotation.x=(1-wear)*-.3;
    // With a smoke cycle the ember flares on the drag; otherwise it breathes.
    const inhale=cycle?cycle.drag:(Math.sin(time*1.5)+1)/2;
    emberMaterial.emissiveIntensity=.15+inhale*.95*motion;
    exhaled.forEach(({mesh,material,seed},i)=> {
      const life=cycle?((cycle.u-.64-i*.018)/.24):0;
      const on=cycle&&motion&&life>0&&life<1;
      material.opacity=on?Math.sin(life*Math.PI)*.23:0;
      if(!on)return;
      // Out and forward first, then drifting up as it slows.
      mesh.position.set(exhaleOrigin.x+Math.sin(seed+life*5)*.1,exhaleOrigin.y+life*life*1.1,exhaleOrigin.z+.12+Math.sqrt(life)*.75).sub(smoking.position);
      mesh.scale.set(.045+life*.16,.035+life*.19,.07+life*.24);mesh.rotation.z=life+seed;
    });
    if(watering.visible) {
      // Drops fall from the spout to the soil, in a loop while pouring.
      // Drops arc from the spout to the soil, in a loop while pouring.
      pour.copy(can.userData.spout).applyEuler(can.rotation).add(can.position);
      land.copy(target??pour.clone().add(new THREE.Vector3(0,-.8,.3)));
      drops.forEach((drop,i)=> {
        const life=motion?((time*1.7+i/drops.length)%1):i/drops.length;
        drop.position.lerpVectors(pour,land,life);
        // Higher arc for a longer throw, like a stream from the spout.
        drop.position.y+=Math.sin(life*Math.PI)*Math.min(.9,.15+pour.distanceTo(land)*.25);
        drop.position.x+=Math.sin(i*2.3)*.04;drop.position.z+=Math.cos(i*1.7)*.04;
        drop.scale.setScalar(1-life*.3);
      });
    }
    // On the drag the cigarette turns from pointing out to pointing ahead, as
    // if between the lips; at rest it just trembles a little.
    cigarette.rotation.set(0,cycle?cycle.reach*.85:0,Math.sin(smokeTime*1.4)*.012*motion*(1-(cycle?.reach??0)));
    tip.copy(direction).multiplyScalar(.83).applyEuler(cigarette.rotation).add(cigarette.position);
    emitter.copy(tip).add(smoking.position);
    puffs.forEach((puff,i)=> {
      const {group,material,origin}=puff;
      const slot=Math.floor((smokeTime-i*.2)/1.8),birth=slot*1.8+i*.2;
      if(!smoking.visible||!motion||birth<0){material.opacity=0;return;}
      // Remember the emission point: lifting/lowering the hand must not drag
      // the whole plume along with the cigarette. Coordinates are in the mount.
      if(puff.slot!==slot){puff.slot=slot;origin.copy(emitter);}
      const life=(smokeTime-birth)/1.8,size=.025+life*.10;
      group.position.copy(origin).sub(smoking.position);
      group.position.x+=-life*.24+Math.sin(life*6+i*.7)*.035*life;
      group.position.y+=life*.85;group.position.z+=life*.08;
      group.scale.set(size*.7,size*1.4,size*.7);group.rotation.z=life*.5;
      material.opacity=Math.sin(life*Math.PI)*.22;
    });
  }};
}
