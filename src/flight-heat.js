import * as THREE from 'three';

// Screen-space refraction, limited to the projected exhaust volumes. Depth
// rejects the ship and foreground walls; HUD is HTML and never enters this pass.
export function createFlightHeat(renderer){
  const depth=new THREE.DepthTexture(1,1);
  const target=new THREE.WebGLRenderTarget(1,1,{depthTexture:depth});
  const segments=Array.from({length:3},()=>new THREE.Vector4()),ranges=Array.from({length:3},()=>new THREE.Vector2());
  const material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{frame:{value:target.texture},depthMap:{value:depth},segments:{value:segments},ranges:{value:ranges},resolution:{value:new THREE.Vector2()},time:{value:0},amount:{value:0},count:{value:0},encoded:{value:false}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`varying vec2 vUv;uniform sampler2D frame,depthMap;uniform vec4 segments[3];uniform vec2 ranges[3],resolution;uniform float time,amount;uniform int count;uniform bool encoded;
      void main(){float mask=0.;float sceneDepth=texture2D(depthMap,vUv).r;
        for(int i=0;i<3;i++){if(i>=count)break;
          vec2 a=segments[i].xy*resolution,b=segments[i].zw*resolution,p=vUv*resolution,d=b-a;
          float t=clamp(dot(p-a,d)/max(dot(d,d),1.),0.,1.);
          float width=clamp(length(d)*.16,5.,42.)*(.65+t);
          float m=(1.-smoothstep(width*.15,width,length(p-a-d*t)))*smoothstep(0.,.12,t)*(1.-smoothstep(.65,1.,t));
          float z=mix(ranges[i].x,ranges[i].y,t);
          if(sceneDepth<z-.00015)m=0.;mask=max(mask,m);
        }
        vec2 p=vUv*resolution/35.;
        vec2 wave=vec2(sin(p.y*2.1-time*5.+sin(p.x*1.7+time)),cos(p.x*2.4-time*3.+sin(p.y-time*2.)));
        vec2 offset=wave*mask*amount*3./resolution;
        // Do not pull foreground silhouettes into the refracted background.
        if(abs(texture2D(depthMap,clamp(vUv+offset,vec2(0.),vec2(1.))).r-sceneDepth)>.002)offset=vec2(0.);
        gl_FragColor=texture2D(frame,clamp(vUv+offset,vec2(0.),vec2(1.)));
        if(!encoded){
          #include <colorspace_fragment>
        }
      }`});
  const screen=new THREE.Scene(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);screen.add(quad);
  const flat=new THREE.OrthographicCamera(-1,1,1,-1,0,1),size=new THREE.Vector2(),start=new THREE.Vector3(),end=new THREE.Vector3();
  let strength=.45;
  return {configure(value){if(Number.isFinite(value))strength=THREE.MathUtils.clamp(value,0,1.5);},
    render(draw,{ship,camera,time,reduced,boost,depthTexture}){
      if(!strength||reduced){draw();return;}
      renderer.getDrawingBufferSize(size);if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
      material.uniforms.resolution.value.copy(size);material.uniforms.time.value=time;material.uniforms.amount.value=strength*(boost?1:.45);
      let count=0;
      for(const {group} of ship.exhaust.jets){
        start.set(0,0,-.08).applyMatrix4(group.matrixWorld).project(camera);
        end.set(0,0,-1.25).applyMatrix4(group.matrixWorld).project(camera);
        if(start.z< -1||start.z>1||end.z< -1||end.z>1)continue;
        segments[count].set(start.x*.5+.5,start.y*.5+.5,end.x*.5+.5,end.y*.5+.5);
        ranges[count].set(start.z*.5+.5,end.z*.5+.5);if(++count===3)break;
      }
      material.uniforms.count.value=count;
      if(!count){draw();return;}
      const previous=renderer.getRenderTarget();
      try{renderer.setRenderTarget(target);draw();}finally{renderer.setRenderTarget(previous);}
      material.uniforms.depthMap.value=depthTexture?.()??depth;
      material.uniforms.encoded.value=!!depthTexture;
      renderer.render(screen,flat);
    },dispose(){target.dispose();depth.dispose();material.dispose();quad.geometry.dispose();}};
}
