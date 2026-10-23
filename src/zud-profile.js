// Zud's actions, accessible status text and explicit keyboard shortcuts.
export const ZUD = {
  name: 'Zud',
  controls: [ ['wave','Saludar','1'], ['jump','Saltar','2'], ['dance','Bailar','3'], ['sleep','Dormir','4'], ['work','Trabajar','6'], ['smoke','Fumar','7'], ['disco','Anteojos','8'], ['halloween','Susto','9'] ],
  actions: {
    idle: {label:'Zud, a tu lado',text:'Soy Zud. ¿Qué hacemos?'},
    wave: {label:'Zud te saluda',text:'Hey. Te guardé un lugar.',duration:6500},
    jump: {label:'Tocando el cielo',text:'¡Mira! Casi alcanzo otra estrella.',duration:4400},
    dance: {label:'Con su propio ritmo',text:'Esta es mi canción. Está en mi cabeza.',duration:9500},
    sleep: {label:'Zud descansando',text:'Cinco minutos. Con el gorro puesto.'},
    work: {label:'Zud está concentrado',text:'Modo concentración. Una cosa a la vez.'},
    smoke: {label:'En una pausa',text:'Un ratito en las nubes.',duration:16000},
    disco: {label:'Bailando con anteojos',text:'Ahora sí. Que suene.'},
    halloween: {label:'Con su máscara de Halloween',text:'¿Bú…? Sigo siendo yo.'},
    water: {label:'Zud riega la planta',text:'Un poco de agua. Sin apuro.',duration:7000},
  },
  deskLine: 'Voy al escritorio. Ya vuelvo.',
  homeLine: 'Buen lugar para quedarse un rato.',
};
