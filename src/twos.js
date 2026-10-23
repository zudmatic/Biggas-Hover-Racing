// "Animation on twos": a pose clock that lets a character update at a fixed
// rate (12 fps by default) while everything else keeps rendering at full rate.
// step() reports whether the pose should update this frame and how much time
// has passed since its last update, so the easing in the animator (which is
// frame-rate independent) catches up correctly on each tick.
export function createTwosClock() {
  let sinceTick=0,credit=1;  // credit is in seconds; the first step always ticks
  return {
    step(dt,{on=false,fps=12}={}) {
      sinceTick+=dt;
      if(on) {
        const period=1/Math.max(1,fps);
        // Carry the remainder so the rate stays exact at any frame rate; a stall
        // never builds a backlog of more than two ticks.
        credit=Math.min(credit+dt,period*2);
        if(credit<period-1e-9)return {tick:false,dt:0};
        credit-=period;
        // A new start (or a stall) must not owe a second, immediate tick.
        if(credit>=period)credit=0;
      } else credit=1;
      const elapsed=sinceTick;sinceTick=0;
      return {tick:true,dt:elapsed};
    },
  };
}
