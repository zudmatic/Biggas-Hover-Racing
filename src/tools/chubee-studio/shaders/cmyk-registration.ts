import {
  FramebufferTexture,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  type IUniform,
  type WebGLRenderer,
} from 'three';
import type {DialConfig, ResolvedValues} from 'dialkit/vanilla';

/** Misregistration uniforms, shared by the studio pass and Capri's render target. */
export interface RegistrationUniforms {
  uRegAmount: IUniform<number>;
  uRegAngle: IUniform<number>;
  uRegJitter: IUniform<number>;
  uRegTick: IUniform<number>;
  uRegTexel: IUniform<Vector2>;
}

// Registro CMYK corrido: error de impresión, no RGB split (referencias en work/cmyk-registration/).
// La imagen se separa en cuatro planchas de tinta y cada una se lee con su propio corrimiento; se recombinan
// restando como tinta sobre papel. Negro rico (CMY + parte de K): las líneas negras también sueltan color.
export function createRegistration(): RegistrationUniforms {
  return {
    uRegAmount: {value: 0},
    uRegAngle: {value: (35 * Math.PI) / 180},
    uRegJitter: {value: 0},
    uRegTick: {value: 0},
    uRegTexel: {value: new Vector2(1, 1)},
  };
}
// Cuánto negro va a la plancha K; el resto queda en CMY (negro rico).
export const REGISTRATION_BLACK = 0.6;
// Dirección y escala de cada plancha respecto del ángulo: cian y magenta lejos, amarillo poco, negro casi en registro.
export const PLATES: readonly {spin: number; scale: number}[] = [
  {spin: 0, scale: 1},
  {spin: 2.6, scale: 0.85},
  {spin: 4.5, scale: 0.45},
  {spin: 0.7, scale: 0.12},
];

export const registrationGLSL = `
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
export const registrationControls = (amount = 0) =>
  ({
    'CMYK corrido': [amount, 0, 24, 0.5],
    'Ángulo CMYK': [35, 0, 360, 1],
    'Temblor CMYK': [0.25, 0, 1, 0.05],
  }) satisfies DialConfig;

export type RegistrationValues = ResolvedValues<ReturnType<typeof registrationControls>>;

export function applyRegistration(registration: RegistrationUniforms, v: RegistrationValues): void {
  registration.uRegAmount.value = v['CMYK corrido'];
  registration.uRegAngle.value = (v['Ángulo CMYK'] * Math.PI) / 180;
  registration.uRegJitter.value = v['Temblor CMYK'];
}

// Estudio: dibuja normal en pantalla, copia el cuadro ya terminado (tone mapping y sRGB incluidos)
// y lo vuelve a dibujar separado en planchas. Con CMYK corrido en 0 no hace nada: el look queda idéntico.
export class RegistrationPass {
  private readonly size = new Vector2();
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly frameUniform: IUniform<FramebufferTexture | null> = {value: null};
  private frame: FramebufferTexture | null = null;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly registration: RegistrationUniforms,
  ) {
    const uniforms = {...registration, tFrame: this.frameUniform};
    this.quad = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        uniforms,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
        fragmentShader:
          registrationGLSL +
          'uniform sampler2D tFrame; varying vec2 vUv; void main(){gl_FragColor=vec4(cmykMisregister(tFrame,vUv,0.),1.);}',
      }),
    );
    this.scene.add(this.quad);
  }

  render(): void {
    if (this.registration.uRegAmount.value <= 0) return;
    const size = this.renderer.getDrawingBufferSize(this.size);
    if (!this.frame || this.frame.image.width !== size.x || this.frame.image.height !== size.y) {
      this.frame?.dispose();
      this.frame = new FramebufferTexture(size.x, size.y);
      this.frameUniform.value = this.frame;
    }
    this.registration.uRegTexel.value.set(1 / size.x, 1 / size.y);
    this.renderer.copyFramebufferToTexture(this.frame);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.frame?.dispose();
    this.frame = null;
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }
}

export function createRegistrationPass(renderer: WebGLRenderer, registration: RegistrationUniforms): RegistrationPass {
  return new RegistrationPass(renderer, registration);
}
