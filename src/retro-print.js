import * as THREE from 'three';
import {retroStyle} from './retro-style.js';
import {PAPER_COLOR} from './paper.js';

// The finishing pass for Retro Print 3D: the look itself lives in the model
// and its shading (retro-material.js, surface-halftone.js). This pass develops
// the frame the way the reference was: filmic exposure, a warm glow off the
// highlights, and white paper flaring softly into the silhouettes. With `comic`
// (the opaque, full-frame use) it also prints on the paper, in this order:
//
//   1. outline      depth Laplacian on the render target's own depth texture
//   2. misregister  each channel sampled off register, more at the outline
//   3. develop      ACES, saturation x1.12, then comic grading and split tone
//   4. glow         the existing 12-tap warm bloom, added after grading
//   5. paper        blank paper stays exactly PAPER_COLOR; dots near the room
//   6. outline ink  drawn over the finished frame, tinted by the nearest surface
//   7. grain        static, on the ink (and on the paper only if asked)
//
// Without `comic` (the transparent dream bubble), or in the Normal look, only 3 and 4
// run. Transparent comic previews share the object's print treatment, while
// leaving the paper to the scene behind them.

const fragmentShader=`
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float bloomStrength;
uniform vec2 resolution;
uniform float pixelRatio;
uniform vec3 paper;
uniform float transparentPaper;
varying vec2 vUv;
#ifdef COMIC
  uniform sampler2D tDepth;
  uniform float uPixelWorld,uDepthRange,uCameraNear,uPerspective,uPaperGrain,uLite,uMono,uClassic;
  uniform vec4 uOutline,uOutlineInk,uMisreg,uGrade,uBg,uBgInk,uThemeA,uThemeB;
  uniform vec3 uSplitShadow,uSplitLight,uPaperDark,uPaperDusk,uPaperGlow;
  uniform vec2 uLampUv;
#endif
// three.js's own ACES (and exposure), so every object keeps the look it has
// in the normal render before it goes to print.
#include <tonemapping_pars_fragment>

vec3 toSrgb(vec3 c) { return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c)); }
#ifdef COMIC
// Linear view depth for perspective scenes; orthographic depth stays unchanged.
float printDepth(vec2 uv) {
  float d=texture2D(tDepth,uv).r;
  if(uPerspective<.5)return d;
  float far=uCameraNear+uDepthRange;
  return (uCameraNear*far/(far-d*uDepthRange)-uCameraNear)/uDepthRange;
}
// Saturation and contrast around mid gray, then a split tone by luminance.
vec3 grade(vec3 c) {
  float l=dot(c,vec3(.299,.587,.114));
  c=mix(vec3(l),c,uGrade.x);
  c=(c-.5)*uGrade.y+.5;
  c*=mix(vec3(1.),mix(uSplitShadow,uSplitLight,smoothstep(.15,.85,l)),uGrade.z*(1.-uMono));
  return clamp(c,0.,1.);
}
// Interleaved gradient noise: sin() hashes lose precision at pixel coordinates
// this large and show up as columns.
// The paper under the scene (src/paper-theme.js): light, or darkened by the night
// coming in from the top and by the blind's curtain, with a halftone wipe, a warm
// dusk on the night's front and the lamp's glow. At darkness 0 it is exactly paper.
vec3 paperAt(vec2 uv,vec2 fragment) {
  if(transparentPaper>.5)return paper;
  if(uThemeB.w<.5)return paper;
  float y=1.-uv.y;
  float night=smoothstep(0.,1.,uThemeA.x*1.7-y*.7);
  float curtain=1.-smoothstep(uThemeA.y-.12,uThemeA.y,y);
  float dark=night+(1.-night)*curtain;
  float shown=dark;
  float cell=uThemeA.w*pixelRatio;
  if(cell>1.) {
    // Dots grow until they close: the wipe is a halftone, not a gradient.
    vec2 axis=vec2(.70711);
    vec2 q=vec2(dot(fragment,axis),dot(fragment,vec2(-axis.y,axis.x)))/cell;
    float threshold=length(fract(q)-.5)/.70711,aa=max(1./cell,.03);
    shown=smoothstep(threshold-aa,threshold+aa,dark*1.06)*smoothstep(0.,.02,dark);
  }
  vec3 p=mix(paper,uPaperDark,shown);
  p=mix(p,uPaperDusk,night*(1.-night)*2.*uThemeB.x*(1.-curtain));
  vec2 away=(uv-uLampUv)*vec2(resolution.x/resolution.y,1.);
  p+=uPaperGlow*uThemeB.y*exp(-dot(away,away)/(uThemeB.z*uThemeB.z));
  return clamp(p,0.,1.);
}
float hash(vec2 p) { return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715)))); }
#endif
// Develop the render (exposure, filmic shoulder) and only then lay it on the
// paper, so blank paper keeps exactly the page color.
vec3 develop(vec2 uv,vec4 glow,vec3 pap) {
  vec4 s=texture2D(tScene,uv);
  vec3 c=s.a>.001?s.rgb/s.a:vec3(0.);
  if(bloomStrength>0.)c+=texture2D(tBloom,uv).rgb*bloomStrength;
  c=toSrgb(ACESFilmicToneMapping(c));
  // Printed color: a touch more saturated than the filmic curve leaves it.
  c=clamp(mix(vec3(dot(c,vec3(.299,.587,.114))),c,1.12),0.,1.);
  #ifdef COMIC
    if(uClassic<.5)c=grade(c);
  #endif
  // The paper flares into the silhouettes: in its own color, so on dark paper it darkens them.
  c=mix(c,pap*vec3(1.,.97,.93),glow.a*.06);
  vec3 printed=min(c+glow.rgb,1.);
  #ifdef COMIC
    // Black & white drops the filmic curve's and the glow's warmth; the paper stays as it is.
    printed=mix(printed,vec3(dot(printed,vec3(.299,.587,.114))),uMono);
  #endif
  return mix(pap,printed,s.a);
}
// Highlights spill warm light, and paper around the figure flares into its
// edges: soft, light-wrapped silhouettes like the reference.
vec4 bloom(vec2 uv) {
  vec3 sum=vec3(0.);float open=0.;
  for(int i=0;i<12;i++) {
    float a=float(i)*2.3998;
    float r=(3.+float(i)*1.2)*pixelRatio;
    vec4 s=texture2D(tScene,uv+vec2(cos(a),sin(a))*r/resolution);
    // Measured on the developed (tone-mapped) image: only true highlights glow.
    vec3 t=s.a>.001?ACESFilmicToneMapping(s.rgb/s.a):vec3(0.);
    sum+=max(t-.8,0.)*s.a;open+=1.-s.a;
  }
  return vec4(sum/12.,open/12.);
}
void main() {
  vec4 glow=bloom(vUv);glow.rgb=toSrgb(glow.rgb)*vec3(1.,.86,.66)*.17;
  float alpha=texture2D(tScene,vUv).a;
  vec3 color;
  #ifdef COMIC
    // The Normal look is the plain developed frame: develop + glow, nothing else.
    if(uClassic>.5) {
      color=develop(vUv,glow,paperAt(vUv,gl_FragCoord.xy));
    } else {
      vec2 texel=1./resolution;
      vec2 fragment=gl_FragCoord.xy;
      // 1. Outline: the depth buffer is linear under the ortho camera, so a plane
      // has zero Laplacian at any slope; silhouettes and creases do not. The
      // response is normalized by the tap distance in world units, which makes
      // the threshold a dimensionless slope change, independent of dpr.
      // Whole texels only: the depth texture is sampled nearest, and a fractional
      // offset would make a slanted plane's Laplacian jump between neighbors.
      float width=max(floor(uOutline.x*pixelRatio+.5),1.);
      float d0=printDepth(vUv);
      float pixelWorld=uPixelWorld;
      if(uPerspective>.5)pixelWorld*=max(uCameraNear+d0*uDepthRange,uCameraNear);
      // edgeMask is geometry only (0..1); the ink is that times the outline opacity,
      // so the edge misregistration works with the outline faint or off.
      float edgeMask=0.;
      vec2 nearest=vec2(0.);
      if(uLite>.5) {
        // Lite: silhouettes only, from two forward differences.
        float dRight=printDepth(vUv+vec2(width,0.)*texel),dUp=printDepth(vUv+vec2(0.,width)*texel);
        float jump=(abs(d0-dRight)+abs(d0-dUp))*uDepthRange/(width*pixelWorld);
        edgeMask=smoothstep(4.,8.,jump);
      } else {
        float dLeft=printDepth(vUv-vec2(width,0.)*texel),dRight=printDepth(vUv+vec2(width,0.)*texel);
        float dDown=printDepth(vUv-vec2(0.,width)*texel),dUp=printDepth(vUv+vec2(0.,width)*texel);
        float bend=abs(4.*d0-dLeft-dRight-dDown-dUp)*uDepthRange/(width*pixelWorld);
        float silhouette=smoothstep(3.,10.,bend);
        edgeMask=smoothstep(uOutline.y,uOutline.y*1.8,bend)*mix(uOutline.z,1.,silhouette);
        // The nearest tap decides which surface the ink takes its hue from.
        float near=d0;
        if(dLeft<near){near=dLeft;nearest=vec2(-width,0.);}
        if(dRight<near){near=dRight;nearest=vec2(width,0.);}
        if(dDown<near){near=dDown;nearest=vec2(0.,-width);}
        if(dUp<near){near=dUp;nearest=vec2(0.,width);}
      }
      float edge=edgeMask*uOutline.w;

      // 5 (prepared). Paper, with a halftone halo that fades with the distance
      // to the room: its coverage follows the alpha around this pixel.
      vec3 pap=paperAt(vUv,fragment);
      if(transparentPaper<.5&&uBg.w>.001&&alpha<.999&&uLite<.5) {
        float proximity=alpha;
        for(int i=0;i<12;i++) {
          float a=float(i)*2.3998;
          float r=(.15+.85*float(i)/11.)*uBg.z*pixelRatio;
          proximity+=textureLod(tScene,vUv+vec2(cos(a),sin(a))*r*texel,0.).a;
        }
        float coverage=uBg.w*pow(clamp(proximity/13.*2.2,0.,1.),1.5)*(1.-alpha);
        float cell=uBg.x*pixelRatio;
        vec2 axis=vec2(cos(uBg.y),sin(uBg.y));
        vec2 q=vec2(dot(fragment,axis),dot(fragment,vec2(-axis.y,axis.x)))/cell;
        float radius=sqrt(coverage/3.14159265),aa=max(1./cell,.03);
        float dots=(1.-smoothstep(radius-aa*.5,radius+aa*.5,length(fract(q)-.5)))*smoothstep(.005,.04,coverage);
        pap=mix(pap,uBgInk.rgb,dots*uBgInk.w);
      }

      // 2. Misregistration: a channel's own offset, so edges split into colored fringes.
      float shift=(uMisreg.x+uMisreg.y*edgeMask)*pixelRatio*(1.-uLite)*(1.-uMono);
      if(shift>.01) {
        color=vec3(develop(vUv+vec2(1.,.35)*shift*texel,glow,pap).r,
                   develop(vUv+vec2(-.7,.5)*shift*texel,glow,pap).g,
                   develop(vUv+vec2(.15,-1.)*shift*texel,glow,pap).b);
      } else color=develop(vUv,glow,pap);

      // 6. Outline ink: dark and saturated, tinted by the nearest surface.
      vec3 picked=vec3(1.);
      if(uLite<.5) {
        vec4 surface=textureLod(tScene,vUv+nearest*texel,0.);
        vec3 raw=surface.a>.001?surface.rgb/surface.a:vec3(1.);
        picked=toSrgb(raw/(1.+raw));
        picked=mix(picked,vec3(dot(picked,vec3(.299,.587,.114))),uMono);
      }
      color=mix(color,uOutlineInk.rgb*mix(vec3(1.),clamp(picked*1.5,0.,1.),uOutlineInk.w),edge);
      // 7. Static grain: on the ink, and on blank paper only when asked.
      color*=1.+(hash(fragment)-.5)*(uGrade.w*max(alpha,edge)+uPaperGrain*(1.-max(alpha,edge)));
      color=clamp(color,0.,1.);
    }
  #else
    color=develop(vUv,glow,paper);
  #endif
  // Optional transparent paper for UI previews: retain the developed object
  // color, but let the canvas compose over other carousel items and the shell.
  // The browser canvas uses premultiplied alpha.
  gl_FragColor=transparentPaper>.5?vec4(clamp(color-paper*(1.-alpha),0.,alpha),alpha):vec4(color,1.);
}`;

// `comic` supports orthographic and perspective cameras, including transparent
// gallery previews; the dream bubble keeps the plain developed frame.
export function createPrintPass(renderer,{transparent=false,comic=!transparent,style=retroStyle}={}) {
  const depthTexture=comic?new THREE.DepthTexture(1,1):null;
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4,colorSpace:THREE.LinearSRGBColorSpace,depthTexture});
  const material=new THREE.ShaderMaterial({
    uniforms:{tBloom:{value:null},bloomStrength:{value:0},transparentPaper:{value:transparent?1:0},paper:{value:new THREE.Color(1,1,1)},tScene:{value:target.texture},tDepth:{value:depthTexture},
      resolution:{value:new THREE.Vector2(1,1)},pixelRatio:{value:1},uPixelWorld:{value:1},uDepthRange:{value:1},uCameraNear:{value:.1},uPerspective:{value:0},...style.post},
    defines:comic?{COMIC:1}:{},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader,depthTest:false,depthWrite:false,toneMapped:false,
  });
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;
  const screen=new THREE.Scene();screen.add(quad);
  const flat=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const size=new THREE.Vector2(),view=new THREE.Vector4();
  let paperHex=null;
  const setPaper=color=>{
    // Blank paper is drawn in this color, so the print sits on any page tone.
    material.uniforms.paper.value.set(color).convertLinearToSRGB();paperHex=color;
  };
  setPaper(PAPER_COLOR);
  return {
    setPaper,material,
    render(scene,camera,{samples=4,viewport=false,afterScene=null}={}) {
      // A gallery prints each view at its own pixel size, then composites it
      // into the canvas's current viewport/scissor without clearing its peers.
      if(viewport){renderer.getViewport(view);size.set(Math.floor(view.z*renderer.getPixelRatio()),Math.floor(view.w*renderer.getPixelRatio()));}
      else renderer.getDrawingBufferSize(size);
      if(!size.x||!size.y)return;
      if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
      if(target.samples!==samples){target.dispose();target.samples=samples;}
      material.uniforms.resolution.value.copy(size);
      material.uniforms.pixelRatio.value=renderer.getPixelRatio();
      if(comic) {
        // Perspective pixel size is measured at unit view depth, then scaled in GLSL.
        material.uniforms.uPixelWorld.value=camera.isOrthographicCamera?(camera.top-camera.bottom)/camera.zoom/size.y:2*Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5)/camera.zoom/size.y;
        material.uniforms.uDepthRange.value=camera.far-camera.near;
        material.uniforms.uCameraNear.value=camera.near;
        material.uniforms.uPerspective.value=camera.isPerspectiveCamera?1:0;
        if(style.params.paper!==paperHex)setPaper(style.params.paper);
      }
      const clear=renderer.getClearAlpha();
      renderer.setRenderTarget(target);renderer.setClearAlpha(0);renderer.clear();
      renderer.render(scene,camera);
      afterScene?.(target);
      renderer.setRenderTarget(null);renderer.setClearAlpha(clear);
      renderer.render(screen,flat);
    },
    dispose(){target.dispose();depthTexture?.dispose();material.dispose();quad.geometry.dispose();},
  };
}

// The reference's floor shadow is colored and dusty: violet under the feet,
// blue toward the fill side, a warm spill on the key side, all grainy.
let shadowTexture;
export function printShadowTexture() {
  if(shadowTexture)return shadowTexture;
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=148;
  const context=canvas.getContext('2d');
  const blob=(x,y,rx,ry,[r,g,b],alpha)=> {
    context.save();context.translate(x,y);context.scale(rx,ry);
    const gradient=context.createRadialGradient(0,0,0,0,0,1);
    gradient.addColorStop(0,`rgba(${r},${g},${b},${alpha})`);gradient.addColorStop(.6,`rgba(${r},${g},${b},${alpha*.4})`);gradient.addColorStop(1,`rgba(${r},${g},${b},0)`);
    context.fillStyle=gradient;context.beginPath();context.arc(0,0,1,0,Math.PI*2);context.fill();context.restore();
  };
  blob(178,80,74,40,[255,190,84],.42);
  blob(72,66,90,56,[76,108,232],.62);
  blob(116,70,78,46,[164,70,184],.66);
  blob(128,76,50,26,[66,32,84],.82);
  // Dust: break the gradients into grain, denser where the shadow is darker.
  const image=context.getImageData(0,0,canvas.width,canvas.height);
  let seed=11;const random=()=>((seed=Math.imul(seed^seed>>>15,2246822519)+0x9e3779b9|0)>>>0)/4294967296;
  for(let i=3;i<image.data.length;i+=4)image.data[i]*=.35+random()*1.1;
  context.putImageData(image,0,0);
  shadowTexture=new THREE.CanvasTexture(canvas);shadowTexture.colorSpace=THREE.SRGBColorSpace;
  return shadowTexture;
}
