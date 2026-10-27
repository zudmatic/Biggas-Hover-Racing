import * as THREE from 'three';
import {MeshBasicNodeMaterial} from 'three/webgpu';
import {uniform,texture,uv,positionLocal,vec2,vec3,mix,smoothstep} from 'three/tsl';

// Reuses the user's painted portfolio sky. Mirrored horizontal wrapping makes
// both joins continuous; haze and a zenith fade remove the image's top/bottom
// edges. The complete dome follows the camera, including jump-height views.
export function createDesertSky(scene,{mobile=false}={}){
  const root=new THREE.Group();root.name='Cielo panorámico del cañón';scene.add(root);
  const radius=4400,geometry=new THREE.SphereGeometry(radius,32,20);
  const ready=uniform(0),nightBlend=uniform(0);let disposed=false,blend=0;
  const panorama=new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/sky/desert-cloud-panorama-v01.webp`,()=>{
    if(disposed)panorama.dispose();else ready.value=1;
  });
  panorama.colorSpace=THREE.SRGBColorSpace;
  panorama.wrapS=THREE.MirroredRepeatWrapping;panorama.wrapT=THREE.ClampToEdgeWrapping;
  const height=positionLocal.y.div(radius).clamp(0,1);
  const sampleUV=vec2(uv().x.mul(2),uv().y.sub(.5).mul(3.3).clamp(0,1));
  const painted=texture(panorama,sampleUV).rgb;
  const luma=painted.dot(vec3(.2126,.7152,.0722));
  const clouds=mix(vec3(luma),painted,.93).mul(vec3(1.02,1,.94)).mul(.8);
  const horizon=uniform(new THREE.Color(0xc7d5cf)),zenith=uniform(new THREE.Color(0x3c87bc));
  const gradient=mix(horizon,zenith,height.pow(.35));
  const horizonFade=smoothstep(0,.12,height),zenithFade=smoothstep(.70,.90,height);
  const day=mix(mix(horizon,clouds,horizonFade),zenith,zenithFade);
  const night=mix(uniform(new THREE.Color(0x263c58)),uniform(new THREE.Color(0x071329)),height.pow(.55));
  const material=new MeshBasicNodeMaterial({side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false});
  material.colorNode=mix(mix(gradient,day,ready),night,nightBlend);
  const dome=new THREE.Mesh(geometry,material);dome.name='Panorama pintado sin costuras';dome.renderOrder=-1000;dome.frustumCulled=false;root.add(dome);
  const direction=new THREE.Vector3(-160,220,-120).normalize();
  const sun=new THREE.Mesh(new THREE.SphereGeometry(38,20,12),new THREE.MeshBasicMaterial({color:0xffe4a2,fog:false,depthWrite:false}));
  sun.name='Sol y luna';sun.position.copy(direction).multiplyScalar(3500);sun.renderOrder=-900;root.add(sun);
  const points=[];let seed=39033;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<(mobile?90:180);i++){const angle=random()*Math.PI*2,y=.13+random()*.85,r=Math.sqrt(1-y*y);points.push(Math.cos(angle)*r*3900,y*3900,Math.sin(angle)*r*3900);}
  const starGeometry=new THREE.BufferGeometry();starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  const starMaterial=new THREE.PointsMaterial({color:0xd6e9ff,size:7,transparent:true,opacity:0,depthWrite:false,fog:false});
  const stars=new THREE.Points(starGeometry,starMaterial);stars.name='Estrellas';stars.renderOrder=-950;stars.visible=false;root.add(stars);
  const sunDay=new THREE.Color(0xffe4a2),moon=new THREE.Color(0xdcecff);
  return {
    root,dome,sun,stars,cloudCount:0,
    update(camera,time,{night=false,dt=0,reducedMotion=false}={}){
      root.position.copy(camera.position);
      blend=reducedMotion?Number(night):THREE.MathUtils.damp(blend,Number(night),5,dt);
      nightBlend.value=blend;sun.material.color.copy(sunDay).lerp(moon,blend);
      stars.visible=blend>.01;starMaterial.opacity=blend*.85;
    },
    dispose(){disposed=true;panorama.dispose();geometry.dispose();material.dispose();sun.geometry.dispose();sun.material.dispose();starGeometry.dispose();starMaterial.dispose();root.removeFromParent();},
  };
}
