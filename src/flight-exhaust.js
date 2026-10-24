import * as THREE from 'three';

// Advected noise drives both the axial deformation and flame erosion.
// Independent nozzle phases avoid synchronized, rigid-looking jets.
const noiseGLSL=`
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){return .57*noise(p)+.29*noise(p*2.03+17.)+.14*noise(p*4.1+43.);}
`;
export function createFlightExhaust(root,outlets){
  const settings={length:1,width:1,intensity:1,variation:.2,turbulence:.55,noiseScale:2.2,flow:1.4};
  const material=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:false,depthWrite:true,
    uniforms:{time:{value:0},strength:{value:1},variation:{value:.2},turbulence:{value:.55},noiseScale:{value:2.2},flow:{value:1.4},phase:{value:0},core:{value:new THREE.Color('#fff1bc')},fire:{value:new THREE.Color('#ff791f')}},
    vertexShader:`
      varying vec2 vUv;uniform float time,turbulence,noiseScale,flow,phase;
      ${noiseGLSL}
      void main(){vUv=uv;vec3 p=position;float t=uv.y;
        vec2 q=vec2(phase,t*noiseScale-time*flow*2.);
        p.x+=(fbm(q)-.5)*t*t*turbulence*1.5;
        p.y+=(fbm(q+31.)-.5)*t*t*turbulence;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader:`
      varying vec2 vUv;uniform float time,strength,variation,turbulence,noiseScale,flow,phase;uniform vec3 core,fire;
      ${noiseGLSL}
      void main(){
        vec2 uv=floor(vUv*vec2(36.,80.))/vec2(36.,80.);
        float t=uv.y;
        vec2 q=vec2(uv.x*noiseScale*3.+phase,t*noiseScale*2.-time*flow*3.);
        float n=fbm(q),warp=fbm(q*.6+19.);
        float x=abs(uv.x-.5+(warp-.5)*t*turbulence*.32)*2.;
        float width=pow(max(0.,1.-t),.6)*(.74+.16*sin(t*5.));
        width+=(n-.5)*t*(.18+turbulence*.55);
        width*=1.+variation*(noise(vec2(time*3.+phase,4.))-.5);
        if(x>width||t>.98)discard;
        float erosion=smoothstep(.18+t*.25,.48+t*.18,n+(1.-t)*.48);
        float coverage=erosion*(1.-smoothstep(.67,1.,t))*strength;
        // Ordered screenprint breakup, rather than a soft transparent glow.
        vec2 cell=mod(floor(gl_FragCoord.xy/1.5),4.);
        float b=mod(cell.x,2.)*2.+mod(cell.y,2.)*3.;
        b=mod(b,4.)*4.+mod(floor(cell.x/2.)*2.+floor(cell.y/2.)*3.,4.);
        if(coverage<(b+.5)/16.)discard;
        float ratio=x/max(width,.04);
        vec3 color=fire;
        if(ratio<.4+(n-.5)*.18&&t<.72)color=core;
        else if(ratio>.82)color=mix(fire*.32,vec3(.035,.025,.02),.3);
        else if(ratio<.64)color=mix(fire,core,.3);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  material.userData.retro=true;
  const geometry=new THREE.PlaneGeometry(2,1,1,24);geometry.translate(0,.5,0);geometry.rotateX(-Math.PI/2);
  const jets=outlets.map(([x,y,z,radius],index)=>{
    const group=new THREE.Group();group.name='Chorro de fuego';group.position.set(x,y,z);root.add(group);
    for(let i=0;i<3;i++){const mesh=new THREE.Mesh(geometry,material);mesh.rotation.z=i*Math.PI/3;mesh.onBeforeRender=()=>{material.uniforms.phase.value=index*13.7+i*3.1;material.uniformsNeedUpdate=true;};group.add(mesh);}
    return {group,radius};
  });
  const normalFire=material.uniforms.fire.value.clone(),normalCore=material.uniforms.core.value.clone();
  const turboFire=new THREE.Color('#42a4ff'),turboCore=new THREE.Color('#9e8c00');
  let lastTime=null,envelope=.45;
  function update(time,speed,boost,reduced,state){
    const dt=lastTime===null||time<lastTime?0:Math.min(.1,time-lastTime);lastTime=time;
    material.uniforms.fire.value.copy(boost?turboFire:normalFire);
    material.uniforms.core.value.copy(boost?turboCore:normalCore);
    const target=state?.braking?.2:boost?3.5:.45+Math.min(speed,55)*.024;
    if(dt===0&&time===0)envelope=target;
    else envelope+=(target-envelope)*(1-Math.exp(-dt*14));
    material.uniforms.time.value=reduced?0:time;
    material.uniforms.variation.value=reduced?0:settings.variation;
    material.uniforms.strength.value=settings.intensity;
    material.uniforms.turbulence.value=reduced?0:settings.turbulence;
    material.uniforms.noiseScale.value=settings.noiseScale;
    material.uniforms.flow.value=settings.flow;
    for(const {group,radius} of jets)group.scale.set(radius*settings.width*(boost?1.12:1),radius*settings.width*(boost?1.12:1),envelope*settings.length);
  }
  return {jets,material,update,configure(v){
    for(const k of ['length','width','intensity','variation'])if(Number.isFinite(v[k]))settings[k]=THREE.MathUtils.clamp(v[k],k==='variation'?0:.1,k==='variation'? .5:3);
    for(const [k,min,max] of [['turbulence',0,1.5],['noiseScale',.5,5],['flow',.1,3]])if(Number.isFinite(v[k]))settings[k]=THREE.MathUtils.clamp(v[k],min,max);
    for(const k of ['core','fire'])if(/^#[\da-f]{6}$/i.test(v[k]??'')){material.uniforms[k].value.set(v[k]);(k==='fire'?normalFire:normalCore).set(v[k]);}
  },dispose(){for(const {group} of jets)group.removeFromParent();geometry.dispose();material.dispose();}};
}
