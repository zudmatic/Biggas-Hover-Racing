const fields=['x','y','z','pitch','roll'];
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

// Physics stays at 60 Hz. Both the ship and camera consume the same pose
// between ticks, rather than following a target that stops on alternate frames.
export function createFlightRenderPose(){
  let previous=null;
  const rendered={};
  return {
    reset(state){previous={...state};},
    capture(state){previous={...state};},
    sample(state,alpha){
      Object.assign(rendered,state);
      if(!previous)return rendered;
      alpha=Math.max(0,Math.min(1,alpha));
      for(const field of fields)rendered[field]=previous[field]+(state[field]-previous[field])*alpha;
      rendered.yaw=previous.yaw+angleDelta(previous.yaw,state.yaw)*alpha;
      return rendered;
    },
  };
}
