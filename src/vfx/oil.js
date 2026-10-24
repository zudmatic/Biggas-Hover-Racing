import * as THREE from 'three/webgpu';
import {Fn,uniform,uv,attribute,positionWorld,cameraPosition,vec2,vec3,float,fract,floor,sin,cos,mix,smoothstep,dFdx,dFdy,reflect} from 'three/tsl';
import {createOilSimulation} from '../oil-simulation.js';

export function createOilPreview(scene,world){
  const sim=createOilSimulation({landscape:world.landscape,surfaceHeight:world.surfaceHeight});
  const geometry=new THREE.BufferGeometry();
  for(const [name,size] of [['position',3],['uv',2],['oilAlpha',1]])geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(256*24*size),size).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const material=createOilMaterial();
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=2;scene.add(mesh);
  function clear(){sim.reset();geometry.setDrawRange(0,0);}
  return {sim,clear,drop(){sim.startPour();},update(dt,state){
    sim.step(dt,state);let at=0;
    function vertex(x,y,z,u,v,a){geometry.attributes.position.setXYZ(at,x,y+.025,z);geometry.attributes.uv.setXY(at,u,v);geometry.attributes.oilAlpha.setX(at,a);at++;}
    for(const patch of sim.patches){
      const a=Math.min(1,(patch.expires-sim.time)/.8)*.95;
      const points=Array.from({length:8},(_,i)=>{const angle=i*Math.PI/4,r=patch.radius*(.87+.1*Math.sin(i*7+patch.id*3)),x=patch.x+Math.cos(angle)*r,z=patch.z+Math.sin(angle)*r;return [x,world.surfaceHeight(x,z)??patch.y,z,.5+(x-patch.x)/(2*patch.radius),.5+(z-patch.z)/(2*patch.radius)];});
      for(let i=0;i<8;i++){vertex(patch.x,patch.y,patch.z,.5,.5,a);vertex(...points[i],a);vertex(...points[(i+1)%8],a);}
    }
    geometry.setDrawRange(0,at);for(const a of Object.values(geometry.attributes))a.needsUpdate=true;
  },dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}};
}

export function createOilMaterial(alpha=attribute('oilAlpha','float')){
  const hash=q=>fract(sin(q.dot(vec2(127.1,311.7))).mul(43758.5453));
  const noise=Fn(([q])=>{const i=floor(q),f=fract(q),s=f.mul(f).mul(float(3).sub(f.mul(2)));return mix(mix(hash(i),hash(i.add(vec2(1,0))),s.x),mix(hash(i.add(vec2(0,1))),hash(i.add(1)),s.x),s.y);});
  const material=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const p=positionWorld.xz,n=noise(p.mul(.65)).add(noise(p.mul(1.8)).mul(.35));
  const edge=float(1).sub(smoothstep(.34,.455,uv().sub(.5).length().add(n.sub(.65).mul(.015))));
  const surface=dFdx(positionWorld).cross(dFdy(positionWorld)).normalize();
  const normal=surface.y.lessThan(0).select(surface.negate(),surface).add(vec3(sin(p.x.mul(.8).add(n)).mul(.014),0,cos(p.y.mul(.9).add(n)).mul(.014))).normalize();
  const view=cameraPosition.sub(positionWorld).normalize(),facing=normal.dot(view).clamp(),fresnel=float(1).sub(facing).pow(4);
  const glint=reflect(view.negate(),normal).dot(vec3(-.4,.8,.25).normalize()).max(0).pow(32);
  const film=cos(n.mul(.8).add(facing.mul(.6)).add(vec3(0,.33,.67)).mul(6.28318)).mul(.5).add(.5);
  material.colorNode=mix(vec3(.006,.008,.011),vec3(.018,.022,.028),n.mul(.55)).add(vec3(.065,.085,.11).mul(fresnel)).add(film.mul(.018).mul(smoothstep(.4,.85,n)).mul(fresnel.mul(.75).add(.25))).add(vec3(.18,.20,.21).mul(glint));
  material.opacityNode=edge.mul(alpha);material.alphaTestNode=uniform(.01);
  return material;
}
