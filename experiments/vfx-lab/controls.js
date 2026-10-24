import {SHIPS} from '../../src/ship-catalog.js';
import {createDialKit,createDialRoot} from 'dialkit/vanilla';
import 'dialkit/vanilla/styles.css';

export function createControls(actions){
  const root=createDialRoot({target:document.querySelector('#dials'),mode:'inline',defaultOpen:true,theme:'dark'});
  const kits={},panels={};
  const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');document.querySelector('#dials').prepend(feedback);
  async function copyAll(){
    const snapshot=Object.fromEntries(Object.entries(kits).map(([key,kit])=>{
      const {name,config}=panels[key];
      return [name,Object.fromEntries(Object.entries(config).map(([field,definition])=>[
        field,definition?.type==='action'?definition:kit.values[field],
      ]))];
    }));
    const json=JSON.stringify(snapshot,null,2);
    try{
      await navigator.clipboard.writeText(json);
      feedback.textContent='Todos los valores copiados. Pegalos en el chat.';
    }catch{
      // Some embedded browsers deny clipboard access. Keep the full export available.
      const dialog=document.createElement('dialog'),text=document.createElement('textarea'),close=document.createElement('button');
      text.value=json;text.readOnly=true;text.setAttribute('aria-label','Todos los valores en JSON');text.style.cssText='width:70vw;height:65vh';
      close.textContent='Cerrar';close.onclick=()=>dialog.close();dialog.append(text,document.createElement('br'),close);document.body.append(dialog);
      dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();text.select();
      feedback.textContent='El navegador no permitió copiar. Usá Ctrl+C sobre el JSON seleccionado.';
    }
  }
  const add=(key,name,config)=>{
    panels[key]={name,config};
    return kits[key]=createDialKit(name,config,{id:`three-vfx-${key}-${key==='palette'?'v4':'v2'}`,persist:key!=='studio',defaultCollapsed:false,onAction:action=>action==='Copiar todo'?void copyAll():actions(action)});
  };
  add('studio','Estudio',{
    Vehículo:{type:'select',options:Object.values(SHIPS).map(s=>`${s.id} · ${s.name.replace(/ \d+$/,'')}`),default:'037 · Oliva'},
    Modo:{type:'select',options:['Turbo','Aceleración','Reposo','Soltar'],default:'Turbo'},
    Pausa:false,'Velocidad animación':[1,.1,2,.05],'Simular giro':false,
    'Amplitud giro':[.5,0,1.5,.05],'Velocidad giro':[.65,0,2,.05],
    Vista:{type:'select',options:['Tres cuartos','Trasera','Lateral'],default:'Tres cuartos'},
    'Toon / cómic':true,Cuadrícula:true,Fondo:{type:'color',default:'#182b34'},
    Limpiar:{type:'action',label:'Limpiar partículas'},Restablecer:{type:'action',label:'Restablecer todo'},
  });
  add('camera','Cámara de prueba',{
    'Cámara':{type:'select',options:['Actual','Klipp'],default:'Klipp'},
    'Recorrido de prueba':true,'Velocidad recorrido':[.3,0,.8,.01],'Tamaño recorrido':[8,2,12,.5],
    Distancia:[12,5,24,.5],Altura:[4,1,10,.25],Lateral:[0,-6,6,.25],
    'Suavizado posición':[.3,0,2,.05],'Suavizado giro':[.35,0,2,.05],
    'Suavizado mirada':[.2,0,1,.05],'Anticipación':[.15,0,1,.05],
    Encuadre:[-.15,-.5,.5,.05],FOV:[50,30,90,1],'FOV turbo':[8,0,25,1],
  });
  add('palette','Presets de color',{
    'Copiar todo':{type:'action',label:'Copiar todos los valores'},
    Preset:{type:'select',options:['Automático · rojo / turbo azul','1 · Rojo original','2 · Azul y dorado','3 · Blanco y negro'],default:'Automático · rojo / turbo azul'},
  });
  add('print','Damero y dither',{
    Fuego:{type:'select',options:['Apagado','Damero','Dither'],default:'Dither'},
    'Fuego intensidad':[.6,0,1,.05],'Fuego tamaño':[2,1,8,1],
    Escena:{type:'select',options:['Apagado','Damero','Dither'],default:'Apagado'},
    'Escena intensidad':[.5,0,1,.05],'Escena tamaño':[2,1,8,1],
    'Niveles escena':[6,2,16,1],
  });
  add('engine','Motor incandescente',{
    Activo:true,Profundidad:[2.25,.3,2.5,.05],Intensidad:[1.1,0,3,.05],Tamaño:[1.225,.5,1.5,.025],
    Enfriamiento:[0.85,.1,3,.05],Pulsación:[.04,0,.25,.01],'Luz cercana':[.5,0,3,.05],
    'Color borde':{type:'color',default:'#ff5812'},'Color centro':{type:'color',default:'#fff1b0'},
  });
  add('flame','Llama continua',{
    Activa:true,Longitud:[3.8,.2,9,.1],Ancho:[1.06,.1,3,.02],
    Intensidad:[1.75,0,4,.05],Opacidad:[0.51,0,1,.01],
    Turbulencia:[2.6,0,6,.1],'Escala ruido':[0.8,.1,4,.1],'Velocidad flujo':[1.95,.1,4,.05],
    'Afinar punta':[0.7,.15,2,.05],Pulsación:[0.02,0,.4,.01],
    'Color fuego':{type:'color',default:'#42a4ff'},'Color núcleo':{type:'color',default:'#9e8c00'},
  });
  add('fragments','Fragmentos',{
    Activos:true,Forma:{type:'select',options:['Pelotitas','Cubitos'],default:'Pelotitas'},'Cantidad por segundo':[600,0,600,5],Tamaño:[0.6,.01,1.2,.01],
    Duración:[0.5,.05,2,.05],Velocidad:[7.5,0,25,.5],Dispersión:[0.33,0,.8,.01],
    Turbulencia:[8,0,8,.1],'Escala ruido':[2.3,.1,5,.1],
    'Velocidad ruido':[2.5,0,4,.1],Elevación:[0.8,-3,6,.1],
    Estiramiento:[0.21,0,.5,.01],Opacidad:[0.13,0,1,.01],
    'Colores por bandas':true,Color:{type:'color',default:'#86a5ff'},
    'Color inicial':{type:'color',default:'#fff1bc'},
  });
  add('embers','Brasas pequeñas',{
    Activas:true,'Cantidad por segundo':[71,0,150,1],Tamaño:[0.1,.005,.25,.005],
    Duración:[.65,.05,2,.05],Velocidad:[12,0,30,.5],Dispersión:[0.64,0,1,.01],
    Turbulencia:[8,0,8,.1],Elevación:[-0.3,-3,6,.1],Estiramiento:[0.15,0,.5,.01],
    Opacidad:[1,0,1,.01],Color:{type:'color',default:'#ff861f'},
  });
  add('streaks','Chispas lineales',{
    Activas:true,'Cantidad por segundo':[22,0,120,1],Tamaño:[.55,.1,1.5,.05],
    Duración:[.4,.05,1.5,.05],Velocidad:[14,0,30,.5],Dispersión:[.22,0,1,.01],
    Turbulencia:[2,0,8,.1],Elevación:[.1,-3,6,.1],Estiramiento:[.15,0,.6,.01],
    Opacidad:[.8,0,1,.01],Color:{type:'color',default:'#ffd18a'},
  });
  add('heat','Distorsión de calor',{
    Activa:true,Intensidad:[0.25,0,2,.05],Longitud:[0.9,.3,3,.05],
    Ancho:[1.2,.3,3,.05],Turbulencia:[8,0,8,.1],'Velocidad ondas':[3,0,3,.05],
  });
  const warmAccents={engine:{'Color borde':'#ff5812','Color centro':'#fff1b0'},embers:{Color:'#ff861f'},streaks:{Color:'#ffd18a'}};
  const palettes={
    '1 · Rojo original':{...warmAccents,flame:{'Color fuego':'#ff6b16','Color núcleo':'#fff1bc'},fragments:{Color:'#ff6b16','Color inicial':'#fff1bc'}},
    '2 · Azul y dorado':{...warmAccents,flame:{'Color fuego':'#42a4ff','Color núcleo':'#9e8c00'},fragments:{Color:'#86a5ff','Color inicial':'#fff1bc'}},
  };
  palettes['3 · Blanco y negro']={engine:{'Color borde':'#000000','Color centro':'#ffffff'},flame:{'Color fuego':'#ffffff','Color núcleo':'#000000'},fragments:{Color:'#000000','Color inicial':'#ffffff'},embers:{Color:'#ffffff'},streaks:{Color:'#ffffff'}};
  const applyPalette=()=>{
    const selected=kits.palette.values.Preset;
    const palette=palettes[selected.startsWith('Automático')?(kits.studio.values.Modo==='Turbo'?'2 · Azul y dorado':'1 · Rojo original'):selected];
    for(const [key,colors] of Object.entries(palette))kits[key].setValues(colors);
  };
  const unsubscribePalette=kits.palette.subscribe(applyPalette);
  let lastMode;
  const unsubscribeMode=kits.studio.subscribe(v=>{if(v.Modo!==lastMode){lastMode=v.Modo;if(kits.palette.values.Preset.startsWith('Automático'))applyPalette();}});
  return {kits,reset(){Object.values(kits).forEach(k=>k.resetValues());applyPalette();},dispose(){unsubscribeMode();unsubscribePalette();Object.values(kits).forEach(k=>k.destroy());feedback.remove();root.destroy();}};
}
