import {createDialKit,createDialRoot} from 'dialkit/vanilla';
import 'dialkit/vanilla/styles.css';

const originalHull={halfWidth:1.52,halfLength:2.4,capsuleRadius:1.25,capsuleSpacing:.9,capsuleBottom:1.2,capsuleTop:2.45};

export function createFlightScale(onChange,onInteract){
  const host=document.createElement('aside');host.className='flight-dials';host.setAttribute('aria-label','Ajustar escala');document.body.append(host);
  host.addEventListener('pointerdown',onInteract);
  host.addEventListener('keydown',event=>event.stopPropagation());
  const root=createDialRoot({target:host,defaultOpen:!matchMedia('(max-width:760px)').matches,position:'bottom-left',theme:'dark'});
  const kit=createDialKit('Tamaño · nave y piloto',{
    Escala:[.75,.35,1.25,.01],
    Original:{type:'action',label:'Tamaño original · 1,00'},
  },{id:'flight-scale',persist:true,onAction:()=>kit.setValue('Escala',1)});
  const unsubscribe=kit.subscribe(values=>onChange(values.Escala));
  return {setVisible(visible){host.hidden=!visible;},dispose(){unsubscribe();kit.destroy();root.destroy();host.remove();}};
}

export function scaledHull(config,scale){
  return Object.fromEntries(Object.entries({...originalHull,...config.hull}).map(([key,value])=>[key,value*scale]));
}
