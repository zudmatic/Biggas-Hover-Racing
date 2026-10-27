import * as THREE from 'three';
import {float,vec2,dFdx,dFdy,floor} from 'three/tsl';
import {CIRCUIT_SPEED} from '../circuit-physics.js';
import {ENERGY,THRUST} from './lomi-constants.js';

let pending=null;
export function loadEnergyTextures(base=import.meta.env.BASE_URL){
  pending??=Promise.all(['noise','flow'].map(name=>new THREE.TextureLoader().loadAsync(`${base}models/spaceship/lomi-040-${name}.webp`))).then(([noise,flow])=>{
    for(const map of [noise,flow]){map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.NoColorSpace;map.needsUpdate=true;}
    return {noise,flow};
  });
  return pending;
}

// textureGrad with the x derivative wrapped to the tile period, so the seam
// where an angle wraps from 1 to 0 picks the same mip as its neighbours.
export const tiled=(map,uv,period)=>{
  const p=float(period),dx=dFdx(uv).toVar(),dy=dFdy(uv).toVar();
  const wrap=d=>vec2(d.x.sub(p.mul(floor(d.x.div(p).add(.5)))),d.y);
  return map.sample(uv).grad(wrap(dx),wrap(dy));
};

export function createEnergySignals(){
  return {time:0,thrust:THRUST.idle,level:0,surge:0,speed:0,boost:0,aft:new THREE.Vector3(0,0,-1),bend:new THREE.Vector3()};
}
export const IDLE_STATE={throttle:0,speed:0,boosting:false,yaw:0,vx:0,vz:0,yawRate:0};

const forward=new THREE.Vector3(),left=new THREE.Vector3(),velocity=new THREE.Vector3(),lateral=new THREE.Vector3(),drag=new THREE.Vector3();
export function stepEnergySignals(signals,root,state,dt){
  const {surge,drag:dragging}=ENERGY,{damp}=THREE.MathUtils;
  const demand=Math.min(1,Math.max(state.throttle/CIRCUIT_SPEED,state.speed/CIRCUIT_SPEED,state.boosting?1:0));
  signals.thrust=damp(signals.thrust,THRUST.idle+(THRUST.cruise-THRUST.idle)*demand,THRUST.rate,dt);
  const level=THREE.MathUtils.inverseLerp(THRUST.idle,THRUST.cruise,signals.thrust);
  const rise=Math.max(0,level-signals.level)/Math.max(dt,1e-3);
  const kick=Math.min(1,rise*surge.gain);
  signals.surge=kick>signals.surge?damp(signals.surge,kick,surge.attack,dt):signals.surge*Math.exp(-surge.decay*dt);
  signals.level=level;signals.time+=dt;
  signals.boost=damp(signals.boost,state.boosting?1:0,THRUST.rate,dt);
  signals.aft.set(0,0,-1).transformDirection(root.matrixWorld);
  forward.set(Math.sin(state.yaw),0,Math.cos(state.yaw));
  left.set(Math.cos(state.yaw),0,-Math.sin(state.yaw));
  velocity.set(state.vx,0,state.vz);
  signals.speed=Math.max(0,velocity.dot(forward))/CIRCUIT_SPEED;
  lateral.copy(velocity).addScaledVector(forward,-velocity.dot(forward));
  drag.copy(left).multiplyScalar(state.yawRate*dragging.turn).addScaledVector(lateral,-dragging.slip);
  drag.addScaledVector(signals.aft,-drag.dot(signals.aft)).clampLength(0,dragging.max);
  signals.bend.lerp(drag,1-Math.exp(-dragging.rate*dt));
}
