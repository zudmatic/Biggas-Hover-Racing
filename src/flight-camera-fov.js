// A quick lens opening sells boost; the slower release avoids a zoom snap.
// Exponential damping keeps the response consistent across frame rates.
export function smoothCameraFov(current,target,dt,snap=false,{attack=9,release=3.5}={}){
  if(snap)return target;
  const rate=target>current?attack:release;
  return current+(target-current)*(1-Math.exp(-Math.max(0,dt)*rate));
}
