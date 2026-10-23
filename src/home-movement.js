import * as THREE from 'three';
import { layout } from './home-layout.js';

const RADIUS=layout.radius;
export function canStand(x,z) {
  const {left,right,back,front}=layout.bounds;
  if(x<left||x>right||z<back||z>front)return false;
  return !layout.obstacles.some(([left,right,back,front])=> {
    const dx=x-THREE.MathUtils.clamp(x,left,right),dz=z-THREE.MathUtils.clamp(z,back,front);
    return dx*dx+dz*dz<RADIUS*RADIUS;
  });
}
function clearLine(a,b) {
  const count=Math.ceil(a.distanceTo(b)/.06);
  for(let i=1;i<=count;i++)if(!canStand(THREE.MathUtils.lerp(a.x,b.x,i/count),THREE.MathUtils.lerp(a.z,b.z,i/count)))return false;
  return true;
}

// Small room navigation grid, used only when an automatic action takes over
// from a freely chosen position. Shortcuts are accepted only with clear sight.
export function findWalkPath(start,target) {
  if(!canStand(start.x,start.z)||!canStand(target.x,target.z))return [];
  if(clearLine(start,target))return [target.clone()];
  const step=layout.navigation?.step??.12,origin=-layout.limit;
  const size=Math.floor(layout.limit*2/step)+1;
  const point=(i,j)=>new THREE.Vector3(origin+i*step,layout.home.y,origin+j*step);
  function nearest(value) {
    let best=null,distance=Infinity;
    for(let i=0;i<size;i++)for(let j=0;j<size;j++) {
      const p=point(i,j),d=p.distanceToSquared(value);
      if(d<distance&&canStand(p.x,p.z)&&clearLine(value,p)){best=i*size+j;distance=d;}
    }
    return best;
  }
  const first=nearest(start),last=nearest(target);
  if(first===null||last===null)return [];
  const queue=[first],previous=new Map([[first,null]]);
  for(let head=0;head<queue.length&&!previous.has(last);head++) {
    const id=queue[head],i=Math.floor(id/size),j=id%size;
    for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const ni=i+di,nj=j+dj,next=ni*size+nj;
      if(ni<0||nj<0||ni>=size||nj>=size||previous.has(next))continue;
      if(!clearLine(point(i,j),point(ni,nj)))continue;
      previous.set(next,id);queue.push(next);
    }
  }
  if(!previous.has(last))return [];
  const path=[target.clone()];
  for(let id=last;id!==null;id=previous.get(id))path.unshift(point(Math.floor(id/size),id%size));
  const result=[];let from=start,index=0;
  while(index<path.length) {
    let furthest=index;
    while(furthest+1<path.length&&clearLine(from,path[furthest+1]))furthest++;
    result.push(path[furthest]);from=path[furthest];index=furthest+1;
  }
  return result;
}

export class HomeMovement {
  constructor(journey) {this.journey=journey;this.reset();}
  reset() {this.active=false;this.height=0;this.velocity=0;this.moving=false;this.stepDistance=0;}
  takeControl() {
    if(this.active)return;
    const route=this.journey;
    route.segment=null;route.segments=[];route.exit=null;route.intent='manual';route.phase='idle';route.position.y=layout.home.y;
    // Dismount a chair or interrupt sitting at the closest clear floor point.
    if(!canStand(route.position.x,route.position.z)) {
      let destination;
      for(let radius=.12;radius<2&&!destination;radius+=.12)for(let i=0;i<32;i++) {
        const angle=i/32*Math.PI*2;
        const x=route.position.x+Math.sin(angle)*radius,z=route.position.z+Math.cos(angle)*radius;
        if(canStand(x,z)){destination=new THREE.Vector3(x,layout.home.y,z);break;}
      }
      route.position.copy(destination??layout.home);
    }
    this.active=true;
  }
  jump() {this.takeControl();if(this.height===0)this.velocity=3.8;}
  update(dt,keys,cameraYaw) {
    if(!this.active)return;
    const x=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
    const z=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
    const length=Math.hypot(x,z),position=this.journey.position;
    this.moving=false;this.stepDistance=0;
    if(length) {
      const dx=(Math.cos(cameraYaw)*x+Math.sin(cameraYaw)*z)/length*(layout.speed??1.65)*dt;
      const dz=(-Math.sin(cameraYaw)*x+Math.cos(cameraYaw)*z)/length*(layout.speed??1.65)*dt;
      const oldX=position.x,oldZ=position.z;
      // Small swept steps prevent tunneling, while separate axes let Zud
      // slide along furniture instead of getting stuck at a corner.
      const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.04));
      for(let i=0;i<steps;i++) {
        if(canStand(position.x+dx/steps,position.z))position.x+=dx/steps;
        if(canStand(position.x,position.z+dz/steps))position.z+=dz/steps;
      }
      this.stepDistance=Math.hypot(position.x-oldX,position.z-oldZ);
      this.moving=this.stepDistance>.00001;
      const heading=Math.atan2(dx,dz);
      const difference=Math.atan2(Math.sin(heading-this.journey.heading),Math.cos(heading-this.journey.heading));
      this.journey.heading+=difference*Math.min(1,dt*14);
    }
    if(this.velocity!==0||this.height>0) {
      this.height+=this.velocity*dt-5.5*dt*dt;this.velocity-=11*dt;
      if(this.height<=0){this.height=0;this.velocity=0;}
    }
    this.journey.phase=this.height>0?'jumping':this.moving?'moving':'idle';
  }
}
