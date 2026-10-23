// Hover racing uses the supplied closed route in metres (+Y up, +Z forward).
export const HOVER_HEIGHT=.65;
export const CIRCUIT_SPEED=52;
export const CIRCUIT_BOOST=72;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));

export function createCircuitLandscape(route,gameplay){
  const samples=route.samples,length=route.length_m;
  function segment(i,t,x,z){
    const a=samples[i],b=samples[(i+1)%samples.length],p=a.position,q=b.position;
    const dx=q[0]-p[0],dz=q[2]-p[2],horizontal=Math.hypot(dx,dz),nx=dx/horizontal,nz=dz/horizontal;
    const cx=p[0]+dx*t,cz=p[2]+dz*t;
    return {x:cx,y:p[1]+(q[1]-p[1])*t,z:cz,nx,nz,grade:(q[1]-p[1])/horizontal,index:i,
      distance:a.distance_m+((i===samples.length-1?length:b.distance_m)-a.distance_m)*t,
      offset:(x-cx)*-nz+(z-cz)*nx,width:a.width_m};
  }
  function roadAt(x,z){
    let best=Infinity,result;
    for(let i=0;i<samples.length;i++){
      const a=samples[i].position,b=samples[(i+1)%samples.length].position,dx=b[0]-a[0],dz=b[2]-a[2];
      const t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz),0,1),d=(x-a[0]-dx*t)**2+(z-a[2]-dz*t)**2;
      if(d<best){best=d;result=segment(i,t,x,z);}
    }
    return {...result,distanceToRoad:Math.sqrt(best)};
  }
  function atDistance(distance){
    const d=((distance%length)+length)%length;
    let i=samples.length-1;
    for(let j=0;j<samples.length-1;j++)if(samples[j+1].distance_m>d){i=j;break;}
    const end=i===samples.length-1?length:samples[i+1].distance_m;
    return segment(i,(d-samples[i].distance_m)/(end-samples[i].distance_m),0,0);
  }
  const checkpoints=gameplay.checkpoints.map(cp=>({x:cp.position_gltf[0],y:cp.position_gltf[1]+HOVER_HEIGHT,z:cp.position_gltf[2],nx:cp.forward_gltf[0],nz:cp.forward_gltf[2],radius:(cp.width_m??gameplay.road_width_m??12)/2,order:cp.order,distance:samples[cp.route_index].distance_m}));
  // Cross start, CP01…CP15, then start again; crossing the grid is not a lap.
  const gates=[...checkpoints,{...checkpoints[0]}],grid=gameplay.spawn_positions[0],p=grid.position_gltf,road=roadAt(p[0],p[2]);
  const spawn={x:p[0],y:road.y+HOVER_HEIGHT,z:p[2]};
  const extent=Math.max(...samples.map(s=>Math.max(Math.abs(s.position[0]),Math.abs(s.position[2]))))+28;
  return {type:'circuit',seed:gameplay.road_width_m===18?35:34,samples,length,gates,spawn,yaw:Math.atan2(grid.forward_gltf[0],grid.forward_gltf[2]),roadAt,atDistance,mapHalf:extent,height:(x,z)=>roadAt(x,z).y};
}
export function createHoverState(landscape){return {...landscape.spawn,yaw:landscape.yaw,pitch:0,roll:0,speed:0,throttle:0,energy:1,boosting:false,boostLocked:false,cooldown:0,hoverTime:0,wallHit:false,vx:0,vz:0,yawRate:0,hover:HOVER_HEIGHT,hoverVelocity:0,slip:0,impact:0,impactSerial:0,acceleration:0,braking:false,drifting:false,driftBlend:0,offTrackTime:0,recoverNeeded:false};}
export function recoverHover(landscape,gateIndex){
  if(gateIndex===0)return {...createHoverState(landscape),cooldown:1.2};
  const road=landscape.atDistance(landscape.gates[gateIndex-1].distance+5);
  return {...createHoverState(landscape),x:road.x,y:road.y+HOVER_HEIGHT,z:road.z,yaw:Math.atan2(road.nx,road.nz),speed:0,throttle:0,pitch:Math.atan(road.grade),roll:0,cooldown:1.2};
}
export function advanceHover(state,input,dt,landscape,surfaceHeight=landscape.height){
  const previous={x:state.x,y:state.y,z:state.z},turn=clamp(input.turn??0,-1,1),oldSpeed=state.speed;
  state.throttle=clamp(state.throttle+(input.throttle??0)*24*dt,0,CIRCUIT_SPEED);
  state.braking=!!input.brake;
  // Hold E to loosen lateral grip. Braking takes priority; grip returns smoothly
  // on release, so countersteering can catch the slide without a velocity snap.
  state.drifting=!!input.drift&&!state.braking&&state.speed>8;
  state.driftBlend+=(Number(state.drifting)-state.driftBlend)*(1-Math.exp(-dt*(state.drifting?10:5)));
  if(!input.boost)state.boostLocked=false;
  state.boosting=!!input.boost&&!input.brake&&!state.boostLocked&&state.energy>0;
  state.energy=clamp(state.energy+(state.boosting?-.23:.13)*dt,0,1);
  if(state.energy===0){state.boostLocked=true;state.boosting=false;}
  const target=input.brake?0:state.boosting?CIRCUIT_BOOST:state.throttle,acceleration=input.brake?65:state.boosting?38:24;
  // A damped steering response and a separate velocity vector carry momentum into turns.
  const desiredYaw=-turn*(2.65-.9*state.speed/CIRCUIT_BOOST)*(1+state.driftBlend*.18);
  state.yawRate+=(desiredYaw-state.yawRate)*(1-Math.exp(-dt*13));state.yaw+=state.yawRate*dt;
  const fx=Math.sin(state.yaw),fz=Math.cos(state.yaw),rx=-fz,rz=fx;
  let longitudinal=Math.max(0,state.vx*fx+state.vz*fz),lateral=state.vx*rx+state.vz*rz;
  // Limit the total propulsion energy while sideways: drift must not grant speed.
  const forwardTarget=Math.sqrt(Math.max(0,target*target-lateral*lateral));
  longitudinal+=clamp(forwardTarget-longitudinal,-acceleration*dt,acceleration*dt);
  const grip=state.braking?9:9-6.7*state.driftBlend;
  lateral*=Math.exp(-grip*dt);
  state.vx=fx*longitudinal+rx*lateral;state.vz=fz*longitudinal+rz*lateral;
  state.x+=state.vx*dt;state.z+=state.vz*dt;
  const road=landscape.roadAt(state.x,state.z),heading=angle(state.yaw-Math.atan2(road.nx,road.nz));
  const halfHull=(state.hull?.halfWidth??1.52)*Math.abs(Math.cos(heading))+(state.hull?.halfLength??2.4)*Math.abs(Math.sin(heading));
  const limit=road.width/2-halfHull-.18;
  state.wallHit=!landscape.physicalBoundaries&&Math.abs(road.offset)>limit;state.impact*=Math.exp(-dt*7);
  if(state.wallHit){
    const side=Math.sign(road.offset),nx=-road.nz*side,nz=road.nx*side,offset=clamp(road.offset,-limit,limit);
    state.x=road.x-road.nz*offset;state.z=road.z+road.nx*offset;
    const normalSpeed=state.vx*nx+state.vz*nz;
    if(normalSpeed>0){
      // Inelastic normal impulse; tangent motion survives a glancing contact.
      state.vx-=normalSpeed*1.22*nx;state.vz-=normalSpeed*1.22*nz;
      state.vx*=.92;state.vz*=.92;state.throttle=Math.min(state.throttle,Math.hypot(state.vx,state.vz)+4);
      if(normalSpeed>1.5){state.impact=Math.min(14,normalSpeed);state.impactSerial++;state.hoverVelocity+=Math.min(.5,normalSpeed*.035);state.impactX=state.x+nx*halfHull;state.impactZ=state.z+nz*halfHull;}
    }
  }
  state.speed=Math.hypot(state.vx,state.vz);state.acceleration=(state.speed-oldSpeed)/dt;
  state.slip=Math.atan2(state.vx*rx+state.vz*rz,Math.max(1,state.vx*fx+state.vz*fz));
  state.hoverTime+=dt;
  // Spring-damper suspension in road-relative coordinates remains safe on steep ramps.
  const hoverTarget=HOVER_HEIGHT+(input.reducedMotion?0:Math.sin(state.hoverTime*3)*.025)+(state.boosting?.06:0);
  state.hoverVelocity+=((hoverTarget-state.hover)*100-state.hoverVelocity*14)*dt;
  state.hover=clamp(state.hover+state.hoverVelocity*dt,.43,.92);
  const surface=surfaceHeight(state.x,state.z)??road.y;state.y=surface+state.hover;
  const pitchTarget=Math.atan(road.grade*Math.cos(heading))-clamp(state.acceleration*.0007,-.045,.035);
  state.pitch+=(pitchTarget-state.pitch)*(1-Math.exp(-dt*10));
  const rollTarget=clamp(turn*.16*Math.min(1,state.speed/12)+state.slip*.18,-.28,.28);
  state.roll+=(rollTarget-state.roll)*(1-Math.exp(-dt*8));
  state.cooldown=Math.max(0,state.cooldown-dt);
  return previous;
}
export function crossesCircuitGate(a,b,gate){
  const da=(a.x-gate.x)*gate.nx+(a.z-gate.z)*gate.nz,db=(b.x-gate.x)*gate.nx+(b.z-gate.z)*gate.nz;
  if(da>=0||db<0)return false;
  const t=-da/(db-da),x=a.x+(b.x-a.x)*t-gate.x,z=a.z+(b.z-a.z)*t-gate.z,y=a.y+(b.y-a.y)*t-gate.y;
  return Math.abs(x*-gate.nz+z*gate.nx)<(gate.radius??6)&&Math.abs(y)<3;
}

export function formatRaceTime(seconds){const minutes=Math.floor(seconds/60),s=Math.floor(seconds%60),centiseconds=Math.floor(seconds%1*100);return `${String(minutes).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(centiseconds).padStart(2,'0')}`;}
