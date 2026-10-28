import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  KeepStencilOp,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  SkinnedMesh,
  Vector2,
  type Color,
  type IUniform,
  type Material,
  type Object3D,
} from 'three';
import {inkShadingGLSL} from './ink-shader';
import {isMesh, isSkinnedMesh} from './object-guards';

/** Selects which meshes of a character get a finish layer (outlines, miscellany). */
export type MeshSelector = (object: Object3D) => boolean;

/** Optional atlas controls shared with the character's eye material. */
export interface TextureFxUniforms {
  uTexturePixels: IUniform<number>;
  uTextureLevels: IUniform<number>;
  uSkin: IUniform<Color>;
  uSkinMix: IUniform<number>;
}

// textureFx (opcional, solo atlas de personaje): uTexturePixels pixela el muestreo (0 = original),
// uTextureLevels posteriza con tinta (<2 = original), uSkin/uSkinMix tiñen las zonas azules.
const textureFxGLSL = `#ifdef USE_MAP
 vec2 inkUv=uTexturePixels>.5?(floor(vMapUv*uTexturePixels)+.5)/uTexturePixels:vMapUv;
 vec4 sampledDiffuseColor=textureGrad(map,inkUv,dFdx(vMapUv),dFdy(vMapUv));
 vec3 texel=sampledDiffuseColor.rgb;
 float skinMask=smoothstep(.3,.6,texel.b-max(texel.r,texel.g));
 texel=mix(texel,uSkin*clamp(texel.b/.87,0.,1.2),skinMask*uSkinMix);
 // Posteriza solo el valor (canal más alto) y escala el color: conserva matiz y saturación del atlas.
 // Redondear R, G y B por separado volvía rojo el camuflado (v1 en work/bluleet-integration/before-hue-posterize/).
 if(uInk>.5&&uTextureLevels>1.5){vec3 tone=pow(max(texel,0.),vec3(1./2.2));float value=max(max(tone.r,tone.g),tone.b),steps=uTextureLevels-1.;tone*=value>1e-4?(floor(value*steps+.5)/steps)/value:0.;texel=pow(tone,vec3(2.2));}
 sampledDiffuseColor.rgb=texel;
 diffuseColor*=sampledDiffuseColor;
#endif`;

/** The base colour of materials that have one (standard, basic…); undefined otherwise, as before. */
const pigmentOf = (material: Material): Color | undefined => (material as Material & {color?: Color}).color;

export function createPrintMaterial<M extends Material>(
  source: M,
  ink: IUniform<number>,
  flatInk = false,
  preserveTexture = false,
  textureFx: TextureFxUniforms | null = null,
): M {
  const material = source.clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uInk = ink;
    if (textureFx) {
      Object.assign(shader.uniforms, textureFx);
      shader.fragmentShader =
        'uniform float uTexturePixels; uniform float uTextureLevels; uniform vec3 uSkin; uniform float uSkinMix;\n' +
        shader.fragmentShader.replace('#include <map_fragment>', textureFxGLSL);
    }
    shader.uniforms.uFlatInk = {value: flatInk ? 1 : 0};
    shader.uniforms.uPigment = {value: pigmentOf(material)};
    shader.vertexShader = 'varying vec3 vPrintNormal; varying vec3 vPrintPoint;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <defaultnormal_vertex>',
      '#include <defaultnormal_vertex>\nvPrintNormal=inverseTransformDirection(transformedNormal,viewMatrix); vPrintPoint=position;',
    );
    shader.fragmentShader =
      inkShadingGLSL +
      'uniform float uFlatInk; uniform float uInk; uniform vec3 uPigment; varying vec3 vPrintNormal; varying vec3 vPrintPoint;\n' +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
   if(uInk>.5){
    gl_FragColor.rgb=uFlatInk>.5?shadeFlatPrintInk(uPigment,vPrintPoint):shadePrintInk(uPigment,vPrintPoint,vPrintNormal);
   }
  `,
    );
    if (preserveTexture) {
      shader.fragmentShader = shader.fragmentShader
        .replaceAll('shadeFlatPrintInk(uPigment,', 'shadeFlatPrintInk(diffuseColor.rgb,')
        .replaceAll('shadePrintInk(uPigment,', 'shadePrintInk(diffuseColor.rgb,');
    }
  };
  material.customProgramCacheKey = () =>
    'chubee-all-material-print-v2' + (preserveTexture ? '-textured' : '') + (textureFx ? '-texture-fx' : '');
  return material;
}

// Mallas facetadas (Chubee low-poly): en cada arista dura el vértice está repetido con normales
// distintas y la cáscara se abriría. El contorno usa la normal promedio de los que comparten posición.
export function outlineGeometry(source: BufferGeometry): BufferGeometry {
  // Comparte los demás atributos: lo que se corrija después en los pesos (character-locomotion) llega igual.
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(source.index);
  const position = geometry.attributes.position;
  const normal = source.attributes.normal;
  const sum = new Map<string, [number, number, number]>();
  const key = (i: number): string => `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
  for (let i = 0; i < position.count; i++) {
    const k = key(i);
    const s = sum.get(k) ?? [0, 0, 0];
    s[0] += normal.getX(i);
    s[1] += normal.getY(i);
    s[2] += normal.getZ(i);
    sum.set(k, s);
  }
  const normals = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = sum.get(key(i)) ?? [0, 0, 0];
    const length = Math.hypot(x, y, z) || 1;
    normals[i * 3] = x / length;
    normals[i * 3 + 1] = y / length;
    normals[i * 3 + 2] = z / length;
  }
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  return geometry;
}

/** The averaged-normal shell geometry, built once per source mesh and shared by outlines and miscellany. */
export function sharedOutlineGeometry(source: Mesh): BufferGeometry {
  const cached: BufferGeometry | undefined = source.userData.outlineGeometry;
  if (cached) return cached;
  const geometry = outlineGeometry(source.geometry);
  source.userData.outlineGeometry = geometry;
  return geometry;
}

const defaultSelector: MeshSelector = (object) => isSkinnedMesh(object) && object.name.startsWith('Chubee_');

/** Red brush outlines: three back-face shells per source mesh, masked by the character stencil (ref 1). */
export class CharacterOutlines {
  private readonly thickness: IUniform<number> = {value: 1};
  private readonly speed: IUniform<number> = {value: 1};
  private readonly wiggle: IUniform<number> = {value: 1};
  private readonly mode: IUniform<number> = {value: 0};
  private readonly time: IUniform<number> = {value: 0};
  private readonly resolution: IUniform<Vector2> = {value: new Vector2(1, 1)};
  private readonly shells: {mesh: Mesh; pass: number}[] = [];

  constructor(root: Object3D, selectSource: MeshSelector = defaultSelector) {
    const sources: Mesh[] = [];
    root.traverse((object) => {
      if (isMesh(object) && selectSource(object)) sources.push(object);
    });
    for (const source of sources) for (const pass of [0, 1, 2]) this.addShell(source, pass);
  }

  set(mode: number, wiggle: number, speed: number, thickness = 1): void {
    this.thickness.value = MathUtils.clamp(Number.isFinite(thickness) ? thickness : 1, 0.1, 4);
    this.mode.value = Number(mode);
    this.wiggle.value = wiggle;
    this.speed.value = speed;
    for (const {mesh, pass} of this.shells) mesh.visible = this.mode.value > 0 && (pass === 0 || this.mode.value === 2);
  }

  update(dt: number, width: number, height: number): void {
    this.time.value += dt * this.speed.value;
    this.resolution.value.set(width, height);
  }

  private addShell(source: Mesh, pass: number): void {
    const material = new MeshStandardMaterial({
      color: 0xff152b,
      emissive: 0xff152b,
      emissiveIntensity: 1,
      side: BackSide,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: NotEqualStencilFunc,
      stencilFail: KeepStencilOp,
      stencilZFail: KeepStencilOp,
      stencilZPass: KeepStencilOp,
    });
    material.toneMapped = false;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uOutlineThickness: this.thickness,
        uOutlineWiggle: this.wiggle,
        uOutlineMode: this.mode,
        uOutlineTime: this.time,
        uOutlineResolution: this.resolution,
        uOutlinePass: {value: pass},
      });
      shader.vertexShader =
        'varying vec3 vBrushPoint; uniform float uOutlineThickness; uniform float uOutlineWiggle; uniform float uOutlinePass; uniform float uOutlineMode; uniform float uOutlineTime; uniform vec2 uOutlineResolution;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
    vBrushPoint=position;
    vec2 direction=normalize(transformedNormal.xy+vec2(.00001));
    float tick=floor(uOutlineTime*8.)/8.;
    float wobble=sin(position.x*37.+position.y*19.+tick*4.)*.65+sin(position.z*29.-position.y*43.-tick*3.)*.35;
    float pressure=.5+.5*sin(position.y*11.+position.x*13.+position.z*7.+tick*.8);
    float cleanWobble=sin(position.y*7.+position.x*5.+tick*3.);
    float width=uOutlineMode>1.5?max(.6,2.+pressure*3.+uOutlinePass*2.3+wobble*2.2*uOutlineWiggle):max(.8,2.7+cleanWobble*.5*uOutlineWiggle);
    width*=uOutlineThickness;
    vec2 tangent=vec2(-direction.y,direction.x);
    if(uOutlineMode>1.5)gl_Position.xy+=tangent*sin(position.y*18.+tick*5.+uOutlinePass)*uOutlineWiggle*.9*2./uOutlineResolution*gl_Position.w;
    gl_Position.xy-=direction*width*2./uOutlineResolution*gl_Position.w;
   `,
      );
      shader.fragmentShader =
        'varying vec3 vBrushPoint; uniform float uOutlineMode; uniform float uOutlinePass; uniform float uOutlineTime;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\nif(uOutlineMode>1.5){float stroke=sin(vBrushPoint.y*13.+vBrushPoint.x*9.+vBrushPoint.z*17.+uOutlinePass*2.1);float bristle=sin(vBrushPoint.y*187.+vBrushPoint.x*123.+vBrushPoint.z*151.);if(uOutlinePass>.5 && (stroke<-.1 || bristle>.55))discard;} gl_FragColor.rgb=vec3(1.,.008,.022);',
      );
    };
    material.customProgramCacheKey = () => 'chubee-outline-stencil-v4';
    const geometry = sharedOutlineGeometry(source);
    let shell: Mesh;
    if (isSkinnedMesh(source)) {
      const skinned = new SkinnedMesh(geometry, material);
      skinned.bindMode = source.bindMode;
      skinned.bind(source.skeleton, source.bindMatrix);
      shell = skinned;
    } else {
      shell = new Mesh(geometry, material);
    }
    shell.renderOrder = 2;
    shell.name = 'Red outline';
    shell.userData.outlinePass = pass;
    shell.position.copy(source.position);
    shell.quaternion.copy(source.quaternion);
    shell.scale.copy(source.scale);
    shell.frustumCulled = false;
    shell.visible = false;
    source.parent?.add(shell);
    this.shells.push({mesh: shell, pass});
  }
}

export function createCharacterOutlines(root: Object3D, selectSource: MeshSelector = defaultSelector): CharacterOutlines {
  return new CharacterOutlines(root, selectSource);
}
