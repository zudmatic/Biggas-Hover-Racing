// Shared hangar systems; each ship overrides its names, anchors and views.
// Coordinates are authoring units, not meters. +Y up, +Z forward.
export const SHIP_PARTS = [
  {id:'cockpit', name:'Cabina monoplaza', tag:'01', anchor:[0,1.8,.15], offset:[0,.75,0],
    view:[4.9,7.4,7.4]},
  {id:'engines', name:'Propulsores gemelos', tag:'02', anchor:[.72,.8,-2.15], offset:[0,0,-1.15],
    view:[4,3.2,-7]},
  {id:'mast', name:'Mástil dorsal', tag:'03', anchor:[0,3.5,-2], offset:[0,1.05,-.3],
    view:[6.3,3.7,3]},
  {id:'hull', name:'Casco y blindaje', tag:'04', anchor:[-1.2,1.1,.9], offset:[0,0,0],
    view:[-5.8,3.6,6.5]},
  {id:'cooling', name:'Radiadores laterales', tag:'05', anchor:[1.48,.9,-.45], offset:[.8,.1,0], split:true,
    view:[7,2.7,3.3]},
  {id:'landing', name:'Tren de apoyo', tag:'06', anchor:[.9,.22,1.6], offset:[0,-.45,.15],
    view:[5,2,6]},
  {id:'guards', name:'Asas y defensas', tag:'07', anchor:[-.83,1.84,-.9], offset:[.5,.35,0], split:true,
    view:[-5,4,5.5]},
  {id:'lights', name:'Frente e iluminación', tag:'08', anchor:[0,1,2.1], offset:[0,.05,.9],
    view:[2,2.5,7.5]},
];

export const FLIGHT_DURATION=18;
export function flightPose(time) {
  const t=Math.max(0,Math.min(FLIGHT_DURATION,time));
  const smooth=(a,b,x)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u);};
  const altitude=1.15*smooth(2,6,t)*(1-smooth(13,17,t));
  const flight=smooth(5,7,t)*(1-smooth(11,14,t));
  const power=smooth(0,2,t)*(1-smooth(15,18,t));
  return {altitude,power,roll:Math.sin(t*1.15)*.045*flight,pitch:Math.sin(t*.7)*.035*flight,
    bob:Math.sin(t*2)*.045*flight,phase:t<2?'Encendido':t<6?'Despegue':t<13?'Vuelo estacionario':t<17?'Aterrizaje':'En hangar'};
}
