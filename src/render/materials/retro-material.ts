import {
  Color,
  MeshLambertMaterial,
  Vector3,
  Vector4,
  type ColorRepresentation,
  type IUniform,
  type MeshLambertMaterialParameters,
  type Object3D,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import {isMesh, materialList} from '../scene-utils';
import {surfaceHalftoneGLSL} from './surface-halftone';
import {retroStyle, type RetroSpace} from './retro-style';

export const BOUNCE_COUNT = 8;

export function createBounceUniforms() {
  return {
    retroPatches: {value: Array.from({length: BOUNCE_COUNT}, () => new Vector4())},
    retroNormals: {value: Array.from({length: BOUNCE_COUNT}, () => new Vector3(0, 1, 0))},
    retroRadiance: {value: Array.from({length: BOUNCE_COUNT}, () => new Color(0, 0, 0))},
    retroSun: {value: new Color(1, 1, 1)},
    retroFloor: {value: -100},
    // Luminance a white surface gets from the current light: the "paper white"
    // the print's lightness is measured against (see retro-lighting.js).
    retroWhite: {value: 1},
    retroCloudTime: {value: 0},
    retroCloudStrength: {value: 0},
  } satisfies Record<string, IUniform>;
}

export type BounceUniforms = ReturnType<typeof createBounceUniforms>;

export interface RetroOptions extends Omit<MeshLambertMaterialParameters, 'color'> {
  mottle?: number;
  facetVariation?: number;
  /** Per-vertex `ao` and `bounce` attributes (RETRO_VERTEX_AO). */
  vertexAO?: boolean;
  gain?: number;
  bounceColor?: Color;
  bounceGain?: number;
  /** How much of the map's design shows through the dye (0..1). */
  mapStrength?: number;
  /** Pins the pattern space; null follows retroStyle. */
  space?: RetroSpace | null;
}

/** A retro() material: a Lambert material carrying the print's uniforms and GLSL hooks. */
export interface RetroMaterial extends MeshLambertMaterial {
  uniforms: Record<string, IUniform>;
  defaultAttributeValues: Record<string, number[]>;
  /** The compiled WebGL shader, so lighting bound later reaches it. */
  _retroShader?: WebGLProgramParametersWithUniforms;
}

const isColor = (value: unknown): value is Color => (value as Partial<Color> | null)?.isColor === true;

// One diffuse lighting model for the entire world. The print lives after
// lighting and before tonemapping, in screen space by default (or attached to
// the surface with `space:'object'`), and follows skinned and rigid meshes alike.
export function retro(color?: ColorRepresentation, options: RetroOptions = {}): RetroMaterial {
  const {
    emissive = 0,
    mottle = 0.13,
    facetVariation = 0.18,
    map = null,
    vertexAO = false,
    gain = 1,
    bounceColor = new Color(0, 0, 0),
    bounceGain = 0,
    mapStrength = 1,
    space = null,
    ...parameters
  } = options;
  const material = new MeshLambertMaterial({color, flatShading: true, emissive, map, ...parameters}) as RetroMaterial;
  if (isColor(color)) material.color = color; // Keep the live shared character dye.
  material.name = 'Retro Print · diffuse';
  material.userData.retro = true;
  // Optional per-vertex rest-frame offset joins the print across articulated
  // parts. Ordinary room meshes keep their existing local-space pattern.
  material.defaultAttributeValues = {retroPrintOffset: [0, 0, 0]};
  // Style uniforms are shared by every material; the lighting ones are bound later.
  material.uniforms = {
    ...createBounceUniforms(),
    ...retroStyle.uniforms,
    albedo: {value: material.color},
    gain: {value: gain},
    mottle: {value: mottle},
    facetVariation: {value: facetVariation},
    bounceColor: {value: bounceColor},
    bounceGain: {value: bounceGain},
    retroMapStrength: {value: mapStrength},
    // Per-material print strength; .42 is full print (a prop can print quieter).
    retroHalftoneStrength: {value: 0.42},
  };
  // RETRO_VERTEX_AO and RETRO_OBJECT_SPACE are compile-time defines owned by the
  // style registry, which recompiles every material when the pattern space changes.
  // The lite path is a uniform (retroLite): it never recompiles.
  retroStyle.register(material, {vertexAO, space});
  // Hooks are own properties (not methods): WebGPU's node conversion copies
  // enumerable properties, and the program key must follow the defines.
  material.customProgramCacheKey = () =>
    `retro-print-v5-${Object.keys(material.defines ?? {})
      .sort()
      .join('+')}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.uniforms);
    material._retroShader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
      attribute vec3 retroPrintOffset;
      varying vec3 vRetroPos;
      varying vec3 vRetroWorld;
      varying vec3 vRetroPrintNormal;
      #ifdef RETRO_VERTEX_AO
        attribute float ao;
        attribute float bounce;
        varying vec2 vRetroDetail;
      #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRetroPos=position+retroPrintOffset;
        vRetroPrintNormal=normal;
        #ifdef RETRO_VERTEX_AO
          vRetroDetail=vec2(ao,bounce);
        #endif`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 retroWorld=vec4(transformed,1.);
        #ifdef USE_BATCHING
          retroWorld=batchingMatrix*retroWorld;
        #endif
        #ifdef USE_INSTANCING
          retroWorld=instanceMatrix*retroWorld;
        #endif
        vRetroWorld=(modelMatrix*retroWorld).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 vRetroPos;
      varying vec3 vRetroWorld;
      uniform float gain,mottle,facetVariation,retroMapStrength,retroFloor,bounceGain;
      uniform float retroCloudTime,retroCloudStrength;
      uniform vec3 bounceColor,retroSun;
      uniform vec4 retroPatches[${BOUNCE_COUNT}];
      uniform vec3 retroNormals[${BOUNCE_COUNT}],retroRadiance[${BOUNCE_COUNT}];
      #ifdef RETRO_VERTEX_AO
        varying vec2 vRetroDetail;
      #endif
      ${surfaceHalftoneGLSL}
      float retroHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
      float retroNoise(vec3 p){
        vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(retroHash(i),retroHash(i+vec3(1,0,0)),f.x),mix(retroHash(i+vec3(0,1,0)),retroHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(retroHash(i+vec3(0,0,1)),retroHash(i+vec3(1,0,1)),f.x),mix(retroHash(i+vec3(0,1,1)),retroHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Imported cloth keeps its UV design without photographic contrast.
        diffuseColor.rgb=mix(diffuse, diffuseColor.rgb,retroMapStrength)*gain;
        diffuseColor.rgb=pow(max(diffuseColor.rgb,vec3(.012,.010,.017)),vec3(.82));
        // Keep the map's luminance separate from lighting posterization. Measure
        // after the same albedo curve and mapStrength used by the actual surface.
        float textureDetail=1.;
        #ifdef USE_MAP
          vec3 baseAlbedo=pow(max(diffuse*gain,vec3(.012,.010,.017)),vec3(.82));
          textureDetail=dot(diffuseColor.rgb,RETRO_LUMA)/max(dot(baseAlbedo,RETRO_LUMA),.0001);
        #endif
        // Round normals: floor at zero made flat faces switch ink IDs per pixel.
        vec3 faceId=floor(normalize(cross(dFdx(vRetroPos),dFdy(vRetroPos)))*48.+.5);
        float ink=retroNoise(vRetroPos*34.)-.5;
        diffuseColor.rgb*=1.+(retroHash(faceId)-.5)*facetVariation+ink*mottle+(retroNoise(vRetroPos*8.)-.5)*mottle*.45;`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `
        vec3 retroN=inverseTransformDirection(normal,viewMatrix);
        vec3 bounced=vec3(0.);
        for(int i=0;i<${BOUNCE_COUNT};i++){
          if(retroPatches[i].w<=0.)continue;
          vec3 delta=retroPatches[i].xyz-vRetroWorld;
          float distance2=max(dot(delta,delta),.0025);
          vec3 direction=delta*inversesqrt(distance2);
          float form=max(dot(retroN,direction),0.)*(dot(retroNormals[i],retroNormals[i])<.1?.5:max(dot(retroNormals[i],-direction),0.));
          bounced+=retroRadiance[i]*form*retroPatches[i].w/(distance2+retroPatches[i].w);
        }
        // Short-range contact darkening affects indirect light only. Direct
        // occlusion is handled by moving shadow maps, not baked into the dye.
        float contact=mix(.72,1.,smoothstep(.015,.28,vRetroWorld.y-retroFloor));
        irradiance=(irradiance+bounced)*contact;
        #ifdef RETRO_VERTEX_AO
          irradiance*=mix(vec3(.48,.38,.62),vec3(1.),vRetroDetail.x);
          irradiance+=bounceColor*bounceGain*vRetroDetail.y*retroSun*.35;
        #endif
        #include <lights_fragment_end>
        // Broad, feathered cloud shadows travel through world space, so the
        // lawn, foliage and room share one passing patch of shade. Direct
        // light is softened; the ambient fill keeps the scene readable.
        if(retroCloudStrength>0.){
          vec2 cloudUV=vRetroWorld.xz*.38-vec2(.12,.049)*retroCloudTime;
          float cloud=retroNoise(vec3(cloudUV,.37))*.8
            +retroNoise(vec3(cloudUV*1.9+vec2(3.7,1.2),.73))*.2;
          float shade=smoothstep(.38,.7,cloud);
          reflectedLight.directDiffuse*=1.-shade*retroCloudStrength;
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `
        outgoingLight=retroPrint(outgoingLight,normal,ink,vRetroPos,vRetroPrintNormal,textureDetail);
        #include <opaque_fragment>`,
      );
  };
  // Three's default clone drops compile hooks and custom uniforms. Painted and
  // animated copies must remain registered with the same live print/lighting.
  material.clone = () => {
    const copy = retro(material.color.clone(), {vertexAO, space});
    copy.copy(material);
    copy.uniforms = {...material.uniforms, albedo: {value: copy.color}};
    for (const key of ['gain', 'mottle', 'facetVariation', 'bounceColor', 'bounceGain', 'retroMapStrength', 'retroHalftoneStrength']) {
      const value: unknown = material.uniforms[key].value;
      copy.uniforms[key] = {value: hasClone(value) ? value.clone() : value};
    }
    return copy;
  };
  return material;
}

const hasClone = (value: unknown): value is {clone(): unknown} => typeof (value as {clone?: unknown} | null)?.clone === 'function';

/** Binds shared lighting uniforms (bounce patches, sun, floor…) to every retro material under `root`. */
export function bindRetroLighting(root: Object3D, uniforms: Record<string, IUniform>, {shadows = true}: {shadows?: boolean} = {}): void {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    for (const material of materialList(object.material)) {
      if (!material.userData.retro) continue;
      const retroMaterial = material as RetroMaterial;
      Object.assign(retroMaterial.uniforms, uniforms);
      if (retroMaterial._retroShader) Object.assign(retroMaterial._retroShader.uniforms, uniforms);
      object.castShadow = shadows && !material.transparent;
      object.receiveShadow = shadows;
    }
  });
}
