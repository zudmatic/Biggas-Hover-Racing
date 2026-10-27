import {BackSide,Color,SkinnedMesh,AlwaysStencilFunc,NotEqualStencilFunc,KeepStencilOp,ReplaceStencilOp} from 'three';
import {MeshBasicNodeMaterial} from 'three/webgpu';
import {float,vec2,vec3,uniform,texture,uv,color,mix,smoothstep,sin,cos,atan,fract,floor,fwidth,positionGeometry,positionLocal,normalLocal,normalWorldGeometry} from 'three/tsl';

// Node equivalent of Chubee's ink-shader.js and spiral-shape.js. The game's
// WebGPU renderer and its WebGL2 fallback share this graph; no GLSL patches.
const hash=p=>fract(sin(p.dot(vec3(12.9898,78.233,43.156))).mul(43758.5453));
function inkBody(source){
  const material=new MeshBasicNodeMaterial({name:'Bluleet · tinta',side:source.side,map:source.map});
  const texel=texture(source.map,uv()).rgb;
  const blueMask=smoothstep(.3,.6,texel.b.sub(texel.r.max(texel.g)));
  const pigment=mix(texel,color(new Color('#2145ec')).mul(texel.b.div(.87).clamp(0,1.2)),blueMask);
  const tone=pigment.max(0).pow(1/2.2),value=tone.r.max(tone.g).max(tone.b);
  const poster=tone.mul(value.mul(4).add(.5).floor().div(4).div(value.max(.0001))).pow(2.2).mul(color(source.color));
  const p=positionGeometry,grain=hash(floor(p.mul(220)));
  const patch=sin(p.x.mul(28)).mul(sin(p.y.mul(31))).mul(sin(p.z.mul(27)));
  const light=normalWorldGeometry.normalize().dot(vec3(-3,6,5).normalize());
  const shade=smoothstep(.23,.30,light.add(grain.sub(.5).mul(.19)).add(patch.mul(.055)));
  material.colorNode=mix(vec3(.0015,.001,.003),poster,shade);
  material.userData.chubeeInk=true;return material;
}

function livingSpiral(point,t){
  const q=point.add(vec2(sin(t.mul(1.3).add(point.y.mul(5))),cos(t.mul(1.1).add(point.x.mul(4)))).mul(.6*.035).mul(float(1).sub(smoothstep(.65,1,point.length()))));
  const a=atan(q.y,q.x).add(t.mul(1.5));
  const polygon=cos(a.add(Math.PI/3).mod(Math.PI/3).sub(Math.PI/6));
  const r=q.length().mul(mix(float(1),polygon,.65));
  const pulse=sin(t.mul(1.7)).mul(.6*.08).add(1);
  const phase=a.sub(r.mul(17).mul(pulse)).add(sin(r.mul(10).sub(t.mul(2))).mul(.6*.55)).add(sin(a.mul(3).add(t)).mul(.6*.18));
  const line=sin(phase.mul(.5)).abs(),width=sin(a.mul(2).sub(t.mul(1.8)).add(r.mul(5))).mul(.6*.07).add(.4).min(.97),aa=fwidth(line).max(.008);
  return float(1).sub(smoothstep(width.sub(aa),width.add(aa),line)).mul(float(1).sub(smoothstep(.9,.98,q.length()))).max(float(1).sub(smoothstep(.025,.045,q.length())));
}

function inkEye(source,side,t){
  const material=new MeshBasicNodeMaterial({name:`Bluleet · espiral ${side}`,map:source.map,side:source.side,toneMapped:false});
  const matrix=side==='l'?[-.05445,-.17493,.20227,-.05965]:[.05445,-.17493,-.20227,-.05965];
  const shift=([x,y])=>vec2(matrix[0]*x+matrix[1]*y,matrix[2]*x+matrix[3]*y);
  const sign=side==='l'?-1:1,disc=shift([sign*.067,.116]),pupil=shift([sign*.374,.079]);
  const eye=uv().sub(vec2(.936,.636)).div(vec2(.049,.046)),radius=eye.sub(disc).length(),aa=fwidth(radius).max(.008);
  const mask=float(1).sub(smoothstep(float(1).sub(aa),float(1).add(aa),radius));
  const travel=pupil.sub(disc),gaze=disc.add(travel.mul(float(.29).div(travel.length().max(.00001)).min(1)));
  const spiral=livingSpiral(eye.sub(gaze).div(.68),t);
  const base=mix(texture(source.map).rgb.mul(color(source.color)),mix(vec3(.96),vec3(.005),spiral),mask);
  const fleck=smoothstep(.89,.97,hash(floor(positionGeometry.mul(220))));
  material.colorNode=mix(base,base.mul(.35),fleck.mul(.55));material.userData.chubeeInk=true;return material;
}

export function createBluleetInk(mesh){
  const source=mesh.material,geometry=mesh.geometry.clone(),{position,uv:coords,skinIndex,skinWeight}=geometry.attributes;
  const head=mesh.skeleton.bones.findIndex(b=>b.name==='Head'),groups=[[],[],[]],tick=uniform(0);
  const isEye=i=>[0,1,2,3].some(k=>skinIndex.array[i*4+k]===head&&skinWeight.array[i*4+k]>.99)&&position.getZ(i)>.30&&position.getY(i)>1.45&&coords.getX(i)>.87&&coords.getY(i)>.56&&coords.getY(i)<.72;
  for(let i=0;i<geometry.index.count;i+=3){const tri=[0,1,2].map(k=>geometry.index.getX(i+k));groups[tri.every(isEye)?position.getX(tri[0])>0?1:2:0].push(...tri);}
  if(!groups[1].length||!groups[2].length)throw new Error('Bluleet: no se encontraron ambos ojos para la tinta');
  geometry.clearGroups();let start=0;groups.forEach((indices,i)=>{geometry.addGroup(start,indices.length,i);start+=indices.length;});geometry.setIndex(groups.flat());
  const materials=[inkBody(source),inkEye(source,'l',tick),inkEye(source,'r',tick)];mesh.geometry=geometry;mesh.material=materials;
  for(const material of materials)Object.assign(material,{stencilWrite:true,stencilRef:1,stencilFunc:AlwaysStencilFunc,stencilFail:KeepStencilOp,stencilZFail:KeepStencilOp,stencilZPass:ReplaceStencilOp});
  // Inverted skinned shells keep the yellow cutout and red edge attached to the
  // rig. Real depth testing lets the cockpit occlude the seated legs and torso.
  const shellGeometry=geometry.clone();shellGeometry.clearGroups();
  const shells=[];
  for(const [name,hex,width,order] of [['Recorte amarillo','#f2c14e',.045,1],['Borde rojo','#ff152b',.013,2]]){
    const mat=new MeshBasicNodeMaterial({name,color:hex,side:BackSide,depthWrite:false,toneMapped:false,stencilWrite:true,stencilRef:1,stencilFunc:NotEqualStencilFunc,stencilFail:KeepStencilOp,stencilZFail:KeepStencilOp,stencilZPass:KeepStencilOp});
    const jag=hash(floor(positionGeometry.mul(8))).mul(.45).add(.8);
    mat.positionNode=positionLocal.add(normalLocal.normalize().mul(jag).mul(width));mat.userData.chubeeInk=true;
    const shell=new SkinnedMesh(shellGeometry,mat);shell.name=name;shell.userData.system='cockpit';shell.renderOrder=order;shell.frustumCulled=false;
    shell.position.copy(mesh.position);shell.quaternion.copy(mesh.quaternion);shell.scale.copy(mesh.scale);shell.bindMode=mesh.bindMode;shell.bind(mesh.skeleton,mesh.bindMatrix);mesh.parent.add(shell);shells.push(shell);
  }
  return {update(time){tick.value=time;},dispose(){geometry.dispose();shellGeometry.dispose();materials.forEach(m=>m.dispose());shells.forEach(s=>{s.material.dispose();s.removeFromParent();});}};
}
