import * as T from 'three';
import {MeshBasicNodeMaterial} from 'three/webgpu';
import {uniform,texture,uv,vec2,vec3,mix,smoothstep} from 'three/tsl';

// One open cylinder replaces both modelled mountain rings. Mirrored sampling
// makes u=0/1 AND the opposite join identical in colour and skyline alpha.
// It follows the sky root: distant mountains have no racing-speed parallax.
export function createBiggasHorizon(root,{mobile=false}={}){
  const geometry=new T.CylinderGeometry(3000,3000,2100,mobile?32:64,1,true);
  const ready=uniform(0),night=uniform(0);let disposed=false;
  const panorama=new T.TextureLoader().load(`${import.meta.env.BASE_URL}textures/biggas-forest/mountain-forest-panorama-v1.webp`,()=>{
    if(disposed)panorama.dispose();else ready.value=1;
  });
  panorama.colorSpace=T.SRGBColorSpace;
  panorama.wrapS=T.MirroredRepeatWrapping;panorama.wrapT=T.ClampToEdgeWrapping;
  panorama.minFilter=T.LinearMipmapLinearFilter;panorama.magFilter=T.LinearFilter;
  const painted=texture(panorama,vec2(uv().x.mul(2),uv().y));
  const haze=uniform(new T.Color(0xb6c6bd)),nightHaze=uniform(new T.Color(0x172b43));
  const day=mix(painted.rgb,haze,smoothstep(.04,.54,uv().y).oneMinus().mul(.75).add(.08));
  const nocturnal=mix(painted.rgb.mul(vec3(.18,.28,.44)),nightHaze,.25);
  const material=new MeshBasicNodeMaterial({name:'Forest · painted mountain panorama',side:T.BackSide,transparent:true,depthWrite:false,fog:false});
  material.colorNode=mix(day,nocturnal,night);
  // Fade the very bottom into the sky instead of exposing the open cylinder rim.
  material.opacityNode=smoothstep(.04,.95,painted.a).mul(smoothstep(0,.12,uv().y)).mul(ready);
  const mesh=new T.Mesh(geometry,material);mesh.name='Horizonte anime · cilindro continuo 360°';
  mesh.position.y=150;mesh.rotation.y=.45;mesh.renderOrder=-800;mesh.frustumCulled=false;
  root.add(mesh);
  return {mesh,panorama,ready,triangles:geometry.index.count/3,
    update(blend){night.value=blend;},
    dispose(){disposed=true;panorama.dispose();geometry.dispose();material.dispose();mesh.removeFromParent();},
  };
}
