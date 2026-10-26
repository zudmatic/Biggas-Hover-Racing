import {MathUtils,Vector3} from 'three';

// Bulldog 039's cameo before free driving: ignition on the grid, then the real
// hover physics under an autopilot while four shots cut around the ship.
// Times are seconds; offsets are model units, multiplied by the ship scale.
export const BULLDOG_INTRO=[
  {id:'ignition',caption:'Encendido',start:0,end:2.6},
  {id:'launch',caption:'Salida',start:2.6,end:5},
  {id:'turbine',caption:'Turbina',start:5,end:7.4},
  {id:'flyby',caption:'Pasada',start:7.4,end:10},
];
export const BULLDOG_INTRO_DURATION=BULLDOG_INTRO.at(-1).end;
// The eyes blink on, then the engine catches and the ship lifts.
export const INTRO_BLINKS=[[.35,.5],[.62,.75]],INTRO_EYES_ON=.9,INTRO_IGNITION=1;

export const introShot=time=>BULLDOG_INTRO.find(shot=>time<shot.end)??BULLDOG_INTRO.at(-1);
export const introEyes=time=>time>=INTRO_EYES_ON||INTRO_BLINKS.some(([from,to])=>time>=from&&time<to);
const ease=x=>{const u=MathUtils.clamp(x,0,1);return u*u*(3-2*u);};
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));

// Visual only: the parked ship rises onto its hover cushion with a small overshoot.
export function introLift(time){
  const u=MathUtils.clamp((time-INTRO_IGNITION-.1)/.9,0,1),c=1.70158;
  return -.45*(1-(1+(c+1)*(u-1)**3+c*(u-1)**2));
}

// Idle through the ignition shot, then follow the road centreline. Speed is
// capped by the bend ahead, braking before tight corners; the turbo fires for
// the turbine shot whenever the cap leaves room.
export function introInput(time,state,landscape){
  const input={reducedMotion:false,turn:0,throttle:0,boost:false,brake:false,drift:false};
  if(time<BULLDOG_INTRO[1].start-.3)return input;
  const road=landscape.roadAt(state.x,state.z),ahead=landscape.atDistance(road.distance+8+state.speed*.3),far=landscape.atDistance(road.distance+20+state.speed*.8);
  const bend=Math.abs(wrap(Math.atan2(far.nx,far.nz)-Math.atan2(road.nx,road.nz))),limit=72-bend*50;
  const error=wrap(Math.atan2(ahead.x-state.x,ahead.z-state.z)-state.yaw);
  // Positive turn lowers yaw in advanceHover.
  return {...input,turn:MathUtils.clamp(-error*3,-1,1),throttle:state.speed<limit?1:0,brake:state.speed>limit+6,
    boost:state.speed<limit&&time>=BULLDOG_INTRO[2].start&&time<BULLDOG_INTRO[3].start+.6};
}

export function createIntroCamera(camera,{landscape,surfaceHeight,clipCamera}){
  const forward=new Vector3(),right=new Vector3(),ship=new Vector3(),position=new Vector3(),look=new Vector3(),anchor=new Vector3(),flyby=new Vector3();
  let flybyPlaced=false;
  return {
    reset(){flybyPlaced=false;},
    update(time,state,scale){
      const shot=introShot(time),u=ease((time-shot.start)/(shot.end-shot.start)),s=scale;let fov;
      forward.set(Math.sin(state.yaw),0,Math.cos(state.yaw));right.set(Math.cos(state.yaw),0,-Math.sin(state.yaw));ship.set(state.x,state.y,state.z);
      if(shot.id==='ignition'){
        // Low push-in on the face while the eyes wake up.
        position.copy(ship).addScaledVector(forward,(7.8-2.2*u)*s).addScaledVector(right,(1.2-.9*u)*s).setY(state.y+(1.1+.2*u)*s);
        look.copy(ship).addScaledVector(forward,1.6*s).setY(state.y+1.6*s);fov=38;
      }else if(shot.id==='launch'){
        // Low tracking shot: the ship pulls ahead of the camera.
        position.copy(ship).addScaledVector(right,7.5*s).addScaledVector(forward,(5-9*u)*s).setY(state.y+1.3*s);
        look.copy(ship).setY(state.y+1.4*s);fov=46;
      }else if(shot.id==='turbine'){
        // Tight on the turbine while the turbo lights; the lens opens with speed.
        position.copy(ship).addScaledVector(forward,-(7.5+2*u)*s).addScaledVector(right,-2.4*s).setY(state.y+2.4*s);
        look.copy(ship).addScaledVector(forward,5*s).setY(state.y+1.3*s);fov=56+16*u;
      }else{
        // Locked-off roadside camera, inside the walls, that pans as the ship passes.
        if(!flybyPlaced){
          // The ship reaches the camera about halfway through the shot.
          const road=landscape.roadAt(state.x,state.z),ahead=landscape.atDistance(road.distance+Math.max(14,state.speed*1.3)),side=Math.max(2,(road.width??12)/2-2.5);
          flyby.set(ahead.x-ahead.nz*side,0,ahead.z+ahead.nx*side);flyby.y=(surfaceHeight(flyby.x,flyby.z)??ahead.y)+1.1;
          anchor.set(ahead.x,(surfaceHeight(ahead.x,ahead.z)??ahead.y)+1.1,ahead.z);clipCamera?.(anchor,flyby);flybyPlaced=true;
        }
        position.copy(flyby);look.copy(ship).setY(state.y+1.3*s);fov=44-6*u;
      }
      if(shot.id!=='flyby'){
        // Keep moving shots out of walls and terrain, as the chase camera does.
        anchor.copy(ship).setY(state.y+1.6*s);clipCamera?.(anchor,position);
        const floor=surfaceHeight(position.x,position.z);if(floor!==null&&floor!==undefined)position.y=Math.max(position.y,floor+.35);
      }
      camera.position.copy(position);camera.lookAt(look);
      if(Math.abs(camera.fov-fov)>.01){camera.fov=fov;camera.updateProjectionMatrix();}
      return shot;
    },
  };
}
