import {UniformsLib} from 'three/src/renderers/shaders/UniformsLib.js';
import {cloneUniforms} from 'three/src/renderers/shaders/UniformsUtils.js';
// GLSL reference used only by the diagnostic comparison page.
import {Color, DoubleSide, ShaderMaterial, type Texture} from 'three';

const vertexShader = `
  attribute vec3 fx; varying vec2 vUv; varying vec3 vFx;
  #include <fog_pars_vertex>
  void main(){vUv=uv;vFx=fx;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
    gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
  }`;
const fragmentShader = `
  uniform sampler2D atlas; uniform bool ground; uniform float style; varying vec2 vUv; varying vec3 vFx;
  uniform vec3 smokeColor; uniform float smokeDensity; uniform float screenGrain;
  #include <fog_pars_fragment>
  float pattern(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  float bayer2(vec2 p){return mod(2.0*p.x+3.0*p.y,4.0);}
  void main(){
    vec3 color;vec2 pixel=floor(vUv*48.0);float grain=pattern(pixel),maskOpacity=1.0;
    if(ground){
      float edge=abs(vUv.x-.5)*2.0;
      if(edge>.65+grain*.35||grain<.22||mod(pixel.x+floor(pixel.y/8.0),7.0)<1.0)discard;
      color=vec3(.027,.033,.038);
    }else{
      bool spark=vFx.y<0.0;
      vec2 local=(floor(vUv*32.0)+.5)/32.0;
      if(spark){
        vec2 q=(local-.5)*2.0;float a=atan(q.y,q.x);
        float spike=.17+.74*pow(max(0.0,cos(a*5.0)),3.0);
        if(length(q)>spike)discard;
        color=mix(vec3(.08,.95,.58),vec3(.96,.48,.10),vFx.z);
      }else if(style<.5||(style>1.5&&vFx.y<1000.0)){
        // A stable seed changes each fragment's silhouette, never its shape per frame.
        vec2 q=(local-.5)*2.0;float angle=atan(q.y,q.x);
        float sector=floor((angle+3.141593)*7.0/6.283186);
        float radius=.48+.33*pattern(vec2(sector,vFx.y));
        if(length(q)>radius)discard;
        maskOpacity=1.0-smoothstep(radius*.45,radius,length(q));
        color=smokeColor*(.84+.16*pattern(vec2(vFx.y,2.0)));
      }else{
        // Hybrid: overlapping, independently rotated source silhouettes, no flipbook popping.
        vec2 cell=vec2(1.0+mod(floor(vFx.y),2.0),3.0);
        vec4 texel=texture2D(atlas,(cell+clamp(local,.025,.975))*.25);
        if(texel.a<.25)discard;
        maskOpacity=smoothstep(.25,.9,texel.a)*(.7+.3*pattern(floor(local*8.0)+vFx.y));
        color=smokeColor*(dot(texel.rgb,vec3(.2126,.7152,.0722))>.45?1.0:.87);
      }
    }
    // Screen-aligned ordered transparency keeps the pattern coherent across overlapping puffs.
    vec2 screenPixel=floor(gl_FragCoord.xy/max(1.0,screenGrain));
    float coverage=ground?grain:(4.0*bayer2(mod(screenPixel,2.0))+bayer2(mod(floor(screenPixel/2.0),2.0))+.5)/16.0;
    float opacity=vFx.x;if(!ground&&vFx.y>=0.0)opacity*=smokeDensity*maskOpacity;
    if(coverage>opacity)discard;
    gl_FragColor=vec4(color,1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Smoke and ground-mark material of the original WebGL renderer (the `?backend=webgl` comparison). */
export function createLegacySmokeMaterial(texture: Texture, ground: boolean): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...cloneUniforms(UniformsLib.fog),
      atlas: {value: texture},
      ground: {value: ground},
      style: {value: 0},
      smokeColor: {value: new Color('#bababa')},
      smokeDensity: {value: 1},
      screenGrain: {value: 1.5},
    },
    vertexShader,
    fragmentShader,
    fog: true,
    side: DoubleSide,
    depthWrite: true,
    polygonOffset: ground,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}
