// Each layer has its own gain; footsteps choose between four separate takes.
export const SCENE_AUDIO_CHANNELS=[
  {id:'day-forest',file:'day-forest.wav',label:'Ambiente · día',description:'Bosque del video · repetición continua',volume:.22,loop:true},
  {id:'night-forest',file:'night-forest.wav',label:'Ambiente · noche',description:'Bosque nocturno · repetición continua',volume:.22,loop:true},
  {id:'footstep',label:'Pasos · madera',description:'Cuatro pisadas distintas sobre madera',volume:.23,variants:[1,2,3,4].map(n=>`footstep-${n}`)},
  {id:'footstep-carpet',label:'Pasos · alfombra',description:'Cuatro pisadas amortiguadas sobre tela',volume:.15,variants:[1,2,3,4].map(n=>`footstep-carpet-${n}`)},
  {id:'jump-whoosh',label:'Salto · aire',description:'El impulso al saltar',volume:.2},
  {id:'jump-land',label:'Salto · caída',description:'El golpe al aterrizar',volume:.22},
  {id:'watering',label:'Riego',description:'Agua sobre la tierra',volume:.28,loop:true},
  {id:'typing',label:'Teclado',description:'Teclas suaves con pausas naturales',volume:.22,loop:true},
  {id:'blinds-cord',label:'Persiana · cuerda',description:'Deslizamiento de la cuerda',volume:.22},
  {id:'blinds-slats',label:'Persiana · láminas',description:'Golpecitos de madera',volume:.22},
  {id:'interaction-pop',label:'Interacción · toque',description:'Un toque seco',volume:.2},
  {id:'interaction-chime',label:'Interacción · campanilla',description:'Una nota cristalina',volume:.14},
];
// Fixed levels relative to the mastered clips, shared by every visitor.
export const DEFAULT_AUDIO_MIX={master:1,channels:{
  'day-forest':.32,'night-forest':.34,footstep:.60,'footstep-carpet':1,
  'jump-whoosh':.88,'jump-land':1,watering:.79,typing:.33,
  'blinds-cord':1,'blinds-slats':.27,'interaction-pop':1,'interaction-chime':1,music:1,
}};
