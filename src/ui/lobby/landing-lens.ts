/** Portable version of Figma's lateral lens effect (.34 distortion, .04 aberration).
 * The original WGSL remains in lib/custom-effects for provenance. No HTML-in-Canvas APIs.
 */
export const landingLensParams = {
  distortionStrength: 0.3400000035762787,
  aberrationStrength: 0.03999999910593033,
  chromaticMode: 0,
  centre: {x: 50, y: 50},
  quality: 0,
} as const;
const distortion = landingLensParams.distortionStrength;
const chroma = (1 + distortion) * landingLensParams.aberrationStrength;
const vertex = `attribute vec2 position;
varying vec2 uv;
void main(){ uv = (position + 1.0) * .5; gl_Position = vec4(position,0.,1.); }`;
const fragment = `precision highp float;
varying vec2 uv;
uniform sampler2D source;
uniform vec2 size;
vec4 sampleLens(vec2 p,float amount){
  vec2 centered=p-size*.5;
  vec2 normalized=centered/(length(size)*.5);
  float r2=dot(normalized,normalized);
  vec2 coord=(centered*(1.+amount*(r2+r2*r2))+size*.5)/size;
  if(any(lessThan(coord,vec2(0.)))||any(greaterThan(coord,vec2(1.))))return vec4(0.);
  return texture2D(source,coord);
}
void main(){
  vec4 total=vec4(0.);
  // Triangularly weighted lateral samples retain the authored lens and RGB separation.
  for(int j=0;j<4;j++){
    vec2 jitter=vec2(0.);
    if(j==1)jitter=vec2(.5,-.333333);
    if(j==2)jitter=vec2(-.25,.333333);
    if(j==3)jitter=vec2(.25,-.111111);
    vec2 p=uv*size+jitter*1.4;
    vec4 color=vec4(0.);float weights=0.;
    for(int i=0;i<16;i++){
      float f=float(i)/15.-.5;
      float weight=1.-abs(f*2.);
      vec4 r=sampleLens(p,${distortion}+(f+.5)*${chroma});
      vec4 g=sampleLens(p,${distortion}+f*${chroma});
      vec4 b=sampleLens(p,${distortion}+(f-.5)*${chroma});
      float a=max(max(r.a,g.a),b.a);
      color+=vec4(r.a>.01?r.r:1.,g.a>.01?g.g:1.,b.a>.01?b.b:1.,1.)*a*weight;
      weights+=weight;
    }
    total+=color/weights;
  }
  gl_FragColor=total*.25;
}`;

export function createLandingLens(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, depth: false});
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Landing lens: ${error}`);
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);gl.attachShader(program, fs);gl.linkProgram(program);
  gl.deleteShader(vs);gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Cannot link landing lens');
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const size = gl.getUniformLocation(program, 'size');
  const viewportLimit = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const maxDimension = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, viewportLimit[0], viewportLimit[1]);
  return {
    maxDimension,
    draw(source: HTMLCanvasElement) {
      if (canvas.width !== source.width) canvas.width = source.width;
      if (canvas.height !== source.height) canvas.height = source.height;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform2f(size, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose() {gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);},
  };
}

/** Lower-resolution software rendering keeps the lens visible without a GPU. */
export function drawSoftwareLens(source: HTMLCanvasElement, target: HTMLCanvasElement) {
  const width = source.width, height = source.height;
  const pixels = source.getContext('2d')!.getImageData(0, 0, width, height).data;
  target.width = width;target.height = height;
  const context = target.getContext('2d')!;
  const result = context.createImageData(width, height), out = result.data;
  const radius2 = (width * width + height * height) / 4;
  const sample = (x: number, y: number, channel: number) => {
    if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 0;
    const left = Math.floor(x), top = Math.floor(y), fx = x - left, fy = y - top;
    const right = Math.min(width - 1, left + 1), bottom = Math.min(height - 1, top + 1);
    return (pixels[(top * width + left) * 4 + channel] * (1-fx) + pixels[(top * width + right) * 4 + channel] * fx) * (1-fy)
      + (pixels[(bottom * width + left) * 4 + channel] * (1-fx) + pixels[(bottom * width + right) * 4 + channel] * fx) * fy;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = x - width / 2, dy = y - height / 2, r2 = (dx*dx+dy*dy)/radius2;
    const index = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      let sum = 0, weights = 0;
      for (let tap = 1; tap < 7; tap++) {
        const f = tap / 7 - .5, weight = 1 - Math.abs(f * 2);
        const factor = 1 + (distortion + (f + (.5 - channel * .5)) * chroma) * (r2 + r2*r2);
        sum += sample(width/2 + dx*factor, height/2 + dy*factor, channel) * weight;
        weights += weight;
      }
      out[index+channel] = sum/weights;
    }
    out[index+3] = 255;
  }
  context.putImageData(result, 0, 0);
}
