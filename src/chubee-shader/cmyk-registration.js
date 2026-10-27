import * as T from 'three';

// Registro CMYK corrido: error de impresión, no RGB split (referencias en work/cmyk-registration/).
// La imagen se separa en cuatro planchas de tinta y cada una se lee con su propio corrimiento; se recombinan
// restando como tinta sobre papel. Negro rico (CMY + parte de K): las líneas negras también sueltan color.
export function createRegistration(){
 return {uRegAmount:{value:0},uRegAngle:{value:35*Math.PI/180},uRegJitter:{value:0},uRegTick:{value:0},uRegTexel:{value:new T.Vector2(1,1)}};
}
// Cuánto negro va a la plancha K; el resto queda en CMY (negro rico).
export const REGISTRATION_BLACK=.6;
// Dirección y escala de cada plancha respecto del ángulo: cian y magenta lejos, amarillo poco, negro casi en registro.
export const PLATES=[{spin:0,scale:1},{spin:2.6,scale:.85},{spin:4.5,scale:.45},{spin:.7,scale:.12}];

export const registrationGLSL=`
uniform float uRegAmount; uniform float uRegAngle; uniform float uRegJitter; uniform float uRegTick; uniform vec2 uRegTexel;
float regHash(float n){return fract(sin(n)*43758.5453);}
vec4 regCmyk(vec3 c){
 float k=(1.-max(max(c.r,c.g),c.b))*${REGISTRATION_BLACK.toFixed(2)};
 return vec4((1.-c-k)/max(1.-k,1e-4),k);
}
vec2 regOffset(float plate,float spin,float scale){
 vec2 jitter=vec2(regHash(plate*7.1+uRegTick*1.3),regHash(plate*3.7+uRegTick*2.9))-.5;
 return (vec2(cos(uRegAngle+spin),sin(uRegAngle+spin))*scale+jitter*uRegJitter)*uRegAmount*uRegTexel;
}
// linearIn = 1 cuando la textura viene en lineal (render target de Capri): separa en espacio de pantalla.
vec3 regSample(sampler2D image,vec2 uv,float linearIn){
 vec3 c=texture2D(image,clamp(uv,uRegTexel*.5,1.-uRegTexel*.5)).rgb;
 return linearIn>.5?pow(max(c,0.),vec3(1./2.2)):c;
}
vec3 cmykMisregister(sampler2D image,vec2 uv,float linearIn){
 if(uRegAmount<=0.)return texture2D(image,uv).rgb;
 float C=regCmyk(regSample(image,uv+regOffset(1.,${PLATES[0].spin.toFixed(2)},${PLATES[0].scale.toFixed(2)}),linearIn)).x;
 float M=regCmyk(regSample(image,uv+regOffset(2.,${PLATES[1].spin.toFixed(2)},${PLATES[1].scale.toFixed(2)}),linearIn)).y;
 float Y=regCmyk(regSample(image,uv+regOffset(3.,${PLATES[2].spin.toFixed(2)},${PLATES[2].scale.toFixed(2)}),linearIn)).z;
 float K=regCmyk(regSample(image,uv+regOffset(4.,${PLATES[3].spin.toFixed(2)},${PLATES[3].scale.toFixed(2)}),linearIn)).w;
 vec3 c=clamp(vec3(1.-C,1.-M,1.-Y)*(1.-K),0.,1.);
 return linearIn>.5?pow(c,vec3(2.2)):c;
}
`;

// Controles de DialKit compartidos: estudio con un corrimiento leve, Capri apagado.
export const registrationControls=(amount=0)=>({'CMYK corrido':[amount,0,24,.5],'Ángulo CMYK':[35,0,360,1],'Temblor CMYK':[.25,0,1,.05]});
export function applyRegistration(registration,v){
 registration.uRegAmount.value=v['CMYK corrido'];registration.uRegAngle.value=v['Ángulo CMYK']*Math.PI/180;registration.uRegJitter.value=v['Temblor CMYK'];
}

// Estudio: dibuja normal en pantalla, copia el cuadro ya terminado (tone mapping y sRGB incluidos)
// y lo vuelve a dibujar separado en planchas. Con CMYK corrido en 0 no hace nada: el look queda idéntico.
export function createRegistrationPass(renderer,registration){
 const size=new T.Vector2(),scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 let frame=null;
 const uniforms={...registration,tFrame:{value:null}};
 scene.add(new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,toneMapped:false,
  vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:registrationGLSL+'uniform sampler2D tFrame; varying vec2 vUv; void main(){gl_FragColor=vec4(cmykMisregister(tFrame,vUv,0.),1.);}'})));
 return {
  render(){
   if(registration.uRegAmount.value<=0)return;
   renderer.getDrawingBufferSize(size);
   if(!frame||frame.image.width!==size.x||frame.image.height!==size.y){frame?.dispose();frame=new T.FramebufferTexture(size.x,size.y);uniforms.tFrame.value=frame;}
   registration.uRegTexel.value.set(1/size.x,1/size.y);
   renderer.copyFramebufferToTexture(frame);
   renderer.render(scene,camera);
  },
 };
}
