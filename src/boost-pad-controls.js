import {createDialKit} from './dev-dials.js';
import {PAD_TRANSITION} from './boost-pad-envelope.js';

export function createBoostPadControls(pads,state,focus){
  const kit=createDialKit('Placa turbo · laboratorio',{
    Activar:{type:'action',label:'Probar activación'},
    Encuadrar:{type:'action',label:'Ver placa de cerca'},
    Reiniciar:{type:'action',label:'Rearmar placa'},
    'Repetir automáticamente':false,
    'Tiempo transición':[PAD_TRANSITION,.08,.6,.01],
    'Duración turbo':[2,.25,6,.25],Cooldown:[7,1,15,.5],
    'Velocidad flechas':[2.5,0,4,.1],'Cantidad flechas':[4,1,6,1],Brillo:[5,0,5,.1],
    'Color disponible':{type:'color',default:'#34ff76'},
    'Color activación':{type:'color',default:'#90e000'},
    'Pantalla LED':true,'Celdas pantalla':[42,16,96,2],
    'Trama pantalla':[.85,0,1,.05],'Barrido pantalla':[.3,0,1,.05],
    'Cantidad partículas':[72,0,72,1],'Tamaño partículas':[.06,.02,.4,.01],
    'Duración partículas':[.65,.1,2,.05],
    'Velocidad partículas':[5,0,15,.25],'Dispersión partículas':[2.7,0,5,.1],
    'Elevación partículas':[2.7,-2,8,.1],'Gravedad partículas':[-5,-5,12,.25],
    'Turbulencia partículas':[6,0,6,.1],'Estiramiento partículas':[1,1,8,.25],
    'Opacidad partículas':[.8,0,1,.05],
    'Trama partículas':{type:'select',options:['Apagado','Damero','Dither'],default:'Dither'},
    'Intensidad trama':[1,0,1,.05],'Tamaño trama':[2,1,6,1],
    'Campo de luz':true,'Altura campo':[2,.2,4,.1],
    'Opacidad campo':[.3,0,.6,.01],'Pulso campo':[.6,0,4,.1],
    'Desvanecimiento campo':[4,.5,4,.1],
    'Apertura lateral':[1.2,0,2,.05],'Apertura longitudinal':[.65,0,2,.05],
    'Turbulencia campo':[.75,0,1,.05],'Escala ruido campo':[1.2,.5,8,.1],'Velocidad ruido campo':[.4,0,4,.1],
    'Trama campo':{type:'select',options:['Apagado','Damero','Dither'],default:'Dither'},
    'Intensidad trama campo':[.45,0,1,.05],'Tamaño trama campo':[2,1,6,1],
    'Distorsión campo':true,'Intensidad distorsión':[.6,0,1,.05],
  },{id:'boost-pad-lab',persist:false,onAction:action=>{
    if(action==='Activar')pads.activate(state);
    if(action==='Encuadrar')focus();
    if(action==='Reiniciar'){pads.reset();state.padBoostRemaining=0;}
  }});
  const unsubscribe=kit.subscribe(v=>pads.configure({transition:v['Tiempo transición'],duration:v['Duración turbo'],cooldown:v.Cooldown,
    flow:v['Velocidad flechas'],arrowCount:v['Cantidad flechas'],brightness:v.Brillo,
    color:v['Color disponible'],activeColor:v['Color activación'],particles:v['Cantidad partículas'],
    screen:v['Pantalla LED'],screenCells:v['Celdas pantalla'],screenGrid:v['Trama pantalla'],screenScan:v['Barrido pantalla'],
    particleSize:v['Tamaño partículas'],particleLife:v['Duración partículas'],
    particleSpeed:v['Velocidad partículas'],spread:v['Dispersión partículas'],rise:v['Elevación partículas'],
    gravity:v['Gravedad partículas'],turbulence:v['Turbulencia partículas'],stretch:v['Estiramiento partículas'],
    particleOpacity:v['Opacidad partículas'],dither:v['Trama partículas'],ditherAmount:v['Intensidad trama'],ditherSize:v['Tamaño trama'],
    field:v['Campo de luz'],fieldHeight:v['Altura campo'],fieldOpacity:v['Opacidad campo'],fieldPulse:v['Pulso campo'],fieldFade:v['Desvanecimiento campo'],
    fieldSpreadX:v['Apertura lateral'],fieldSpreadZ:v['Apertura longitudinal'],fieldTurbulence:v['Turbulencia campo'],fieldNoiseScale:v['Escala ruido campo'],fieldNoiseSpeed:v['Velocidad ruido campo'],
    fieldDither:v['Trama campo'],fieldDitherAmount:v['Intensidad trama campo'],fieldDitherSize:v['Tamaño trama campo'],
    distortion:v['Distorsión campo'],distortionStrength:v['Intensidad distorsión']}));
  return {update(){if(kit.values['Repetir automáticamente'])pads.activate(state);},dispose(){unsubscribe();kit.destroy();}};
}
