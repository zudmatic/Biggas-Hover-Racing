// The printed-comic treatment, evaluated after the existing lighting and before
// tonemapping, on linear HDR color. One system: lightness bands drive a
// posterized base and four ink layers that share one grid per layer.
//
//   lightness  perceptual (sqrt) luminance of the lit result over a paper-white
//              reference that follows the current key + hemisphere light
//   bands      shadow and highlight masks from smoothsteps on lightness; between
//              the two edges the base is flat and carries no ink; where the
//              edges cross, both inks apply together
//   base       lightness quantized to a few steps; hue and colored bounce kept
//   highlight  light dots, added; rim dots reuse the same grid on silhouettes
//   shadow     hatching, multiplied; a crossing set only in the deepest shadow
//
// Every layer is zero-mean (coverage minus the printed dots), so it moves energy
// around instead of adding or removing it. Screen space (default) uses the
// drawing buffer's own pixels, scaled by a CSS-px pitch computed on the CPU, so
// dots keep one size under adaptive resolution. RETRO_OBJECT_SPACE keeps the ink
// attached to the surface with a triplanar projection of the rest-pose position.
export const surfaceHalftoneGLSL = `
varying vec3 vRetroPrintNormal;
uniform float retroClassic,retroHalftoneStrength,retroStrength,retroPixelRatio,retroMirror,retroView,retroGrain,retroWhite,retroLite;
uniform vec4 retroMono;
uniform vec4 retroBands,retroPoster,retroHiDots,retroHiParams,retroHatch,retroHatchB,retroHatchParams;
uniform vec3 retroShadowTint,retroLightTint,retroHiInk,retroHatchTint;
uniform vec2 retroRim;

// retroHalftoneStrength is a per-material scale; this value is "full print".
const float RETRO_INK_UNIT=.42;
const vec3 RETRO_LUMA=vec3(.2126,.7152,.0722);
// Object space: cells per world unit = density / pitch (3 px pitch -> 30 cells).
const float RETRO_OBJECT_DENSITY=90.;
// Black & white two-tone: HDR levels of the two tones (the white lands near paper white after ACES).
const float RETRO_MONO_WHITE=4.,RETRO_MONO_BLACK=.012;
// Black & white: what is left of the shadow band's light at monoShadow 1.
const float RETRO_MONO_SHADOW=.08;

// Layers vanish smoothly as their coverage goes to zero.
float retroFade(float coverage){return smoothstep(.005,.04,coverage);}
// Rotate a point by the layer's angle (xy: cos, sin) and scale it to cells.
vec2 retroGrid(vec2 p,vec4 layer,float cellsPerUnit){return vec2(dot(p,layer.xy),dot(p,vec2(-layer.y,layer.x)))*cellsPerUnit;}
// aa: edge width in cells; lod: 0 once cells are too small to resolve.
float retroDotCell(vec2 q,float coverage,float aa,float lod){
  float radius=sqrt(max(coverage,0.)/3.14159265);
  float printed=1.-smoothstep(radius-aa*.5,radius+aa*.5,length(fract(q)-.5));
  return (printed-coverage)*lod*retroFade(coverage);
}
// Parallel lines centered on integer s, covering a fraction of each cell.
float retroLineCell(float s,float coverage,float aa,float lod){
  float edge=.5-coverage*.5;
  float printed=smoothstep(edge-aa*.5,edge+aa*.5,abs(fract(s)-.5));
  return (printed-coverage)*lod*retroFade(coverage);
}

#ifdef RETRO_OBJECT_SPACE
float retroLod(float footprint){return 1.-smoothstep(.42,.92,footprint);}
float retroFootprint(vec2 q){return max(length(dFdx(q)),length(dFdy(q)));}
float retroDotAt(vec4 layer,float coverage,vec2 shift,vec3 pos,vec3 w){
  float cells=RETRO_OBJECT_DENSITY/layer.z;
  vec2 qx=retroGrid(pos.yz,layer,cells),qy=retroGrid(pos.zx,layer,cells),qz=retroGrid(pos.xy,layer,cells);
  float fx=retroFootprint(qx),fy=retroFootprint(qy),fz=retroFootprint(qz);
  return w.x*retroDotCell(qx,coverage,max(fx,.03),retroLod(fx))
       +w.y*retroDotCell(qy,coverage,max(fy,.03),retroLod(fy))
       +w.z*retroDotCell(qz,coverage,max(fz,.03),retroLod(fz));
}
float retroLineAt(vec4 layer,float coverage,vec3 pos,vec3 w){
  float cells=RETRO_OBJECT_DENSITY/layer.z;
  float sx=retroGrid(pos.yz,layer,cells).y,sy=retroGrid(pos.zx,layer,cells).y,sz=retroGrid(pos.xy,layer,cells).y;
  float fx=fwidth(sx),fy=fwidth(sy),fz=fwidth(sz);
  return w.x*retroLineCell(sx,coverage,max(fx,.03),retroLod(fx))
       +w.y*retroLineCell(sy,coverage,max(fy,.03),retroLod(fy))
       +w.z*retroLineCell(sz,coverage,max(fz,.03),retroLod(fz));
}
#else
// A cell is pitch CSS px, so perPixel (cells per device pixel) follows the
// adaptive resolution and the dots keep one size; their fade needs no derivatives.
float retroDotAt(vec4 layer,float coverage,vec2 shift,vec3 pos,vec3 w){
  float perPixel=1./(layer.z*retroPixelRatio);
  return retroDotCell(retroGrid(gl_FragCoord.xy+shift,layer,perPixel),coverage,max(perPixel,.03),1.-smoothstep(.42,.92,perPixel));
}
float retroLineAt(vec4 layer,float coverage,vec3 pos,vec3 w){
  float perPixel=1./(layer.z*retroPixelRatio);
  return retroLineCell(retroGrid(gl_FragCoord.xy,layer,perPixel).y,coverage,max(perPixel,.03),1.-smoothstep(.42,.92,perPixel));
}
#endif


// ---- Normal look: the print as it was before the comic treatment ----------------
// Material-space CMYK screens after the existing lighting. No screen coordinates
// or time: the ink stays attached to rigid and skinned surfaces. Zero-mean
// modulation preserves the underlying palette and energy. Kept verbatim (renamed)
// so the Normal look is exactly the earlier one; retroHalftoneStrength is used raw.
float retroClassicInk(vec2 surface,vec2 angle,float ink,vec2 registration){
  // Keep dots resolvable at the actual carousel and room camera distances.
  vec2 p=vec2(dot(surface,angle),dot(surface,vec2(-angle.y,angle.x)))*30.+registration;
  float footprint=max(length(dFdx(p)),length(dFdy(p)));
  // Integrate away subpixel dots instead of creating moire at room/mobile scale.
  float resolved=1.-smoothstep(.42,.92,footprint);
  float coverage=mix(.16,.62,clamp(ink,0.,1.));
  float radius=sqrt(coverage/3.14159265);
  float distanceToDot=length(fract(p)-.5);
  float aa=max(fwidth(distanceToDot),.025);
  float printed=1.-smoothstep(radius-aa*.5,radius+aa*.5,distanceToDot);
  return (coverage-printed)*resolved;
}
vec4 retroClassicPlates(vec2 surface,vec4 ink){
  // C 15°, M 75°, Y 0°, K 45°: very small registration offsets, not RGB edges.
  return vec4(
    retroClassicInk(surface,vec2(.965926,.258819),ink.x,vec2(.07,.02)),
    retroClassicInk(surface,vec2(.258819,.965926),ink.y,vec2(-.04,.05)),
    retroClassicInk(surface,vec2(1.,0.),ink.z,vec2(.02,-.06)),
    retroClassicInk(surface,vec2(.707107,.707107),ink.w,vec2(0.))
  );
}
vec3 retroClassicPrint(vec3 shaded,vec3 surface,vec3 surfaceNormal){
  // Actual lit surface color drives ink coverage, including moving shadows,
  // colored bounce and emissive surfaces. The lighting calculation is untouched.
  vec3 tone=max(shaded,vec3(0.))/(max(shaded,vec3(0.))+vec3(.65));
  float black=1.-max(tone.r,max(tone.g,tone.b));
  vec4 ink=vec4(clamp(vec3(1.)-tone-black*.45,0.,1.),black);
  vec3 weights=pow(abs(normalize(surfaceNormal)),vec3(4.));
  weights/=max(dot(weights,vec3(1.)),.0001);
  // Rest-space triplanar projection follows every side of an object without
  // stretching one camera-facing grid across floors, walls and curved bodies.
  vec4 plates=retroClassicPlates(surface.yz,ink)*weights.x
             +retroClassicPlates(surface.zx,ink)*weights.y
             +retroClassicPlates(surface.xy,ink)*weights.z;
  vec3 pressure=plates.xyz*.30+vec3(plates.w)*.70;
  return shaded*(vec3(1.)+pressure*retroHalftoneStrength);
}

// lit: linear HDR color after lighting. viewNormal: view space (the ortho view
// direction is constant, (0,0,1)). ink: the existing per-fragment noise, +-.5.
vec3 retroPrint(vec3 lit,vec3 viewNormal,float ink,vec3 pos,vec3 surfaceNormal,float textureDetail){
  // Normal look: the earlier halftone and nothing else (a uniform branch, no recompile).
  if(retroClassic>.5)return retroClassicPrint(lit,pos,surfaceNormal);
  // Lightness against the paper-white reference, then the three bands.
  float L=sqrt(max(dot(lit,RETRO_LUMA)/max(retroWhite,.001),0.));
  float soft=max(retroBands.z,.005);
  float shadowM=1.-smoothstep(retroBands.x-soft,retroBands.x+soft,L);
  float lightM=smoothstep(retroBands.y-soft,retroBands.y+soft,L);

  // Quantize the underlying light, excluding the map's luminance modulation.
  // lit already contains that detail: scaling it by a lighting-only ratio keeps
  // grain/weave and image artwork instead of flattening them into a single tone.
  // Band masks still use the actual lit result; Normal and two-tone stay intact.
  float lightingL=L/sqrt(max(textureDetail,.0001));
  float s=max(lightingL,.001)*max(retroPoster.x,1.);
  float level=floor(s)+.5+smoothstep(1.-retroPoster.y,1.,fract(s));
  vec3 c=lit*mix(1.,min(level*level/(s*s),4.),retroBands.w);
  // Cool shadows, warm lights.
  c*=mix(vec3(1.),retroShadowTint,shadowM*retroPoster.z);
  c*=mix(vec3(1.),retroLightTint,lightM*retroPoster.z);

  // Black & white: the frame pass turns the finished color into grays, so by default
  // (monoDetail 1) this is the Day render in grayscale, facets and light gradients
  // included. Toward monoDetail 0 the base becomes a two-tone drawing (the highlight
  // band mask) and the inks reverse: black dots on the light, light hatching on the dark.
  float twoTone=retroMono.x*(1.-retroMono.y);
  c=mix(c,vec3(mix(RETRO_MONO_BLACK,RETRO_MONO_WHITE,lightM)),twoTone);

  vec3 weights=vec3(0.);
  #ifdef RETRO_OBJECT_SPACE
    weights=pow(abs(normalize(surfaceNormal)),vec3(4.));
    weights/=max(dot(weights,vec3(1.)),.0001);
  #endif
  float rimM=smoothstep(retroRim.y,1.,pow(1.-clamp(dot(normalize(viewNormal),vec3(0.,0.,1.)),0.,1.),retroRim.x));
  float hiDev=0.,hatchDev=0.;
  // The mirror's reflection is minified; ink would only turn to noise there.
  float strength=retroStrength*retroHalftoneStrength/RETRO_INK_UNIT*(1.-retroMirror);
  float grain=1.+ink*retroGrain;
  if(strength>.001){
    // Highlights: light dots that grow with lightness; rim dots on silhouettes.
    float tLight=clamp((L-retroBands.y)/max(1.-retroBands.y,.05),0.,1.);
    float hiCoverage=retroHiParams.y*lightM*(.35+.65*tLight);
    // Lite (a uniform: switching to it must not recompile anything) has no rim dots.
    hiCoverage=max(hiCoverage,retroHiParams.z*rimM*(1.-retroLite));
    hiDev=retroDotAt(retroHiDots,hiCoverage*grain,vec2(0.),pos,weights);
    c=max(c+retroHiInk*hiDev*retroHiParams.x*strength*(1.-twoTone),0.);
    c=max(c*(1.-clamp(hiDev*retroMono.z*strength*twoTone,0.,1.)),0.);

    // Shadows: hatching that thickens toward black; a crossing set when deepest.
    float tShadow=1.-clamp(L/max(retroBands.x,.05),0.,1.);
    float hatchCoverage=retroHatchParams.y*shadowM*(.3+.7*tShadow)*grain;
    hatchDev=retroLineAt(retroHatch,hatchCoverage,pos,weights);
    // The crossing set (deepest shadow only) is skipped in lite; the branch is uniform.
    if(retroLite<.5) {
      float deep=shadowM*(1.-smoothstep(.3,.6,L/max(retroBands.x,.05)));
      hatchDev+=retroLineAt(retroHatchB,hatchCoverage*deep,pos,weights)*retroHatchParams.z;
    }
    c=max(c*(1.+(retroHatchTint-1.)*hatchDev*retroHatchParams.x*strength*(1.-twoTone)),0.);
    c=max(c+vec3(RETRO_MONO_WHITE*.5*hatchDev*retroMono.z*strength*twoTone),0.);
  }

  // Black & white: the shadow band sinks toward black while the lights keep their detail.
  c*=mix(1.,RETRO_MONO_SHADOW,shadowM*retroMono.x*retroMono.w);

  // Debug views: lightness, each band mask, each pattern layer in isolation.
  if(retroView>.5) {
    if(retroView<1.5)return vec3(L);
    if(retroView<2.5)return vec3(lightM);
    if(retroView<3.5)return vec3(shadowM);
    if(retroView<4.5)return vec3(.5+hiDev);
    if(retroView<5.5)return vec3(.5+hatchDev);
    return vec3(rimM);
  }
  return c;
}
`;
