const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => {const x=clamp(value);return x*x*(3-2*x);};
export const wrapMinutes = minutes => ((minutes % 1440) + 1440) % 1440;
export function dayCycle(minutes) {
  const hour=wrapMinutes(minutes)/60;
  const daylight=smooth((hour-5)/2)*(1-smooth((hour-17)/3));
  const twilight=Math.max(0,1-Math.abs(hour-6)/1.8,1-Math.abs(hour-18.5)/2);
  return {hour,daylight,twilight,night:1-daylight,
    phase:hour<5||hour>=20?'Noche':hour<7?'Amanecer':hour<17?'Día':hour<20?'Atardecer':'Noche'};
}
export function formatTime(minutes) {
  const value=Math.floor(wrapMinutes(minutes));
  return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
}
// Unwrap the dial at twelve: a full minute-hand turn advances one hour,
// and a full hour-hand turn advances twelve hours, including across midnight.
export function handDelta(previous, next, hand) {
  const angle=Math.atan2(Math.sin(next-previous),Math.cos(next-previous));
  return angle/(Math.PI*2)*(hand==='hour'?720:60);
}
