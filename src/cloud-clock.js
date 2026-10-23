// A separate wall clock keeps cloud shadows moving at the same speed even
// when rendering is slow. Hidden-tab time is excluded when returning.
export function createCloudClock(stage,{now=()=>performance.now()}={}) {
  let time=0,lastTime=now();
  document.addEventListener('visibilitychange',()=>{lastTime=now();});
  return {
    update() {
      const current=now();
      if(!document.hidden)time+=Math.max(0,current-lastTime)/1000*2;
      lastTime=current;
      stage.dataset.cloudTime=time.toFixed(3);
      return time;
    },
  };
}
