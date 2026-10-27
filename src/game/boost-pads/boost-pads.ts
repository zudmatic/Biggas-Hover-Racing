import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshStandardNodeMaterial,MeshBasicNodeMaterial} from 'three/webgpu';
import {uniform,uv,texture,vec2,vec3,float,fract,mix,positionLocal,smoothstep} from 'three/tsl';
import {createBoostPadSimulation} from '../../sim/boost-pad-simulation';
import {createDither} from '../../render/shaders/dither';
import {createPadEnvelope} from '../../sim/boost-pad-envelope';
import {BOOST_PAD_PRESET} from './boost-pad-preset';

export async function createFlightBoostPads({scene,landscape,surfaceHeight,onActivate=()=>{},distances}){
  const gltf=await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/boost-pad/boost-pad.glb`);
  let source;gltf.scene.traverse(o=>{if(o.isMesh)source=o;});
  const start=landscape.roadAt(landscape.spawn.x,landscape.spawn.z).distance;
  const locations=(distances??[start+38,landscape.length*.53,landscape.length*.92]).map(distance=>{
    const r=landscape.atDistance(distance),y=surfaceHeight(r.x,r.z)??r.y;
    return {...r,y,halfWidth:2.07,halfLength:3.64};
  });
  const settings={...BOOST_PAD_PRESET};
  const sim=createBoostPadSimulation(locations,settings),root=new THREE.Group();root.name='Track boost pads';scene.add(root);
  const time=uniform(0),flow=uniform(1.2),brightness=uniform(2),arrowCount=uniform(3),green=uniform(new THREE.Color(.035,1,.18)),blue=uniform(new THREE.Color(.02,.5,1)),views=[];
  const dither=createDither(),particleAlpha=uniform(.9),fieldAlpha=uniform(.16),fieldPulse=uniform(1.2),fieldFade=uniform(1.8);
  const fieldDither=createDither(),fieldTurbulence=uniform(.55),fieldNoiseScale=uniform(2.5),fieldNoiseSpeed=uniform(1.2);
  const screenOn=uniform(0),screenCells=uniform(42),screenGrid=uniform(.85),screenScan=uniform(.3);
  // Follow the actual screen UV island, including its clipped corners.
  // Model units are scaled exactly like the pad mesh below.
  const sourceUV=source.geometry.attributes.uv,sourcePosition=source.geometry.attributes.position,screenPoints=new Map();
  for(let i=0;i<sourceUV.count;i++){
    const u=sourceUV.getX(i),v=1-sourceUV.getY(i);
    if(u<16/2048-1e-5||u>784/2048+1e-5||v<16/2048-1e-5||v>2000/2048+1e-5)continue;
    const point=new THREE.Vector3(sourcePosition.getX(i)*1.8,sourcePosition.getY(i),sourcePosition.getZ(i)*1.4);
    screenPoints.set(`${point.x.toFixed(4)},${point.z.toFixed(4)}`,point);
  }
  const outline=[...screenPoints.values()].sort((a,b)=>Math.atan2(a.z,a.x)-Math.atan2(b.z,b.x));
  const panelHeight=outline.reduce((sum,p)=>sum+p.y,0)/outline.length;
  const positions=[];
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];
    positions.push(a.x,0,a.z,b.x,0,b.z,b.x,1,b.z,a.x,0,a.z,b.x,1,b.z,a.x,1,a.z);
  }
  const fieldGeometry=new THREE.BufferGeometry();fieldGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  fieldGeometry.computeVertexNormals();
  for(const p of sim.entries){
    // glTF flips Blender's V coordinate. Recover atlas +V so the flow follows +Z.
    const ready=uniform(0),flash=uniform(0),pulse=uniform(0),fieldLevel=uniform(0),scroll=uniform(0),local=vec2(uv().x,float(1).sub(uv().y)).sub(vec2(16/2048,16/2048)).div(vec2(768/2048,1984/2048));
    const panel=local.x.greaterThan(0).and(local.x.lessThan(1)).and(local.y.greaterThan(0)).and(local.y.lessThan(1)).select(1,0);
    // Replace the entire panel paint, not just yellow pixels: the baked arrows
    // also contain shadows, outlines and wear that otherwise remain as ghosts.
    // Keep the original atlas on the frame, corner caps and light housings.
    const sample=texture(source.material.map);
    const grain=fract(local.mul(vec2(1531,3917)).floor().dot(vec2(12.9898,78.233)).sin().mul(43758.5453));
    const cleanPanel=vec3(.018,.055,.075).mul(grain.mul(.12).add(.94));
    const paint=mix(sample.rgb,cleanPanel,panel);
    const resolution=vec2(screenCells,screenCells.mul(2));
    const cellUV=local.mul(resolution).floor().add(.5).div(resolution);
    const displayUV=mix(local,cellUV,screenOn);
    const phase=fract(displayUV.y.mul(arrowCount).sub(scroll)),tip=float(.9).sub(displayUV.x.sub(.5).abs().mul(1.35));
    const chevron=phase.lessThan(tip).and(phase.greaterThan(tip.sub(.38))).and(displayUV.x.sub(.5).abs().lessThan(.43)).select(1,0).mul(panel);
    const cell=fract(local.mul(resolution)).sub(.5).abs();
    const led=float(1).sub(smoothstep(.32,.49,cell.x.max(cell.y)));
    const pixels=mix(float(1),led,screenGrid.mul(screenOn));
    const scan=fract(local.y.sub(scroll.mul(.25))).sub(.5).abs();
    const scanLight=float(1).sub(smoothstep(.02,.16,scan)).mul(screenScan).mul(screenOn);
    const activeColor=mix(green,blue,flash);
    const strength=ready.mul(pulse.mul(.6).add(1));
    const material=new MeshStandardNodeMaterial({roughness:.7,metalness:.2,side:THREE.FrontSide});
    material.colorNode=mix(paint,mix(vec3(.008,.014,.018),activeColor.mul(.8).mul(pixels),strength.min(1)),chevron);
    const display=chevron.add(panel.mul(screenOn).mul(.025)).mul(pixels).mul(scanLight.add(1));
    material.emissiveNode=activeColor.mul(display).mul(strength.mul(brightness));
    const mesh=new THREE.Mesh(source.geometry,material);mesh.position.set(p.x,p.y+.025,p.z);mesh.rotation.set(-Math.atan(p.grade),Math.atan2(p.nx,p.nz),0,'YXZ');mesh.scale.set(1.8,1,1.4);mesh.receiveShadow=true;root.add(mesh);
    const fieldMaterial=new MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    const height=positionLocal.y.clamp(0,1);
    const wave=height.mul(15).sub(time.mul(fieldPulse).mul(5)).sin().mul(.15).add(.85);
    const q=positionLocal.mul(fieldNoiseScale),flowTime=time.mul(fieldNoiseSpeed);
    const warp=q.x.mul(1.7).add(q.z.mul(1.3)).sub(flowTime).sin();
    const coarse=q.y.mul(4).sub(flowTime.mul(2)).add(warp).add(q.x).sin();
    const detail=q.z.mul(3.1).add(q.x.mul(2.3)).sub(q.y.mul(6)).add(flowTime.mul(1.4)).sin();
    const turbulence=coarse.mul(.65).add(detail.mul(.35)).mul(.5).add(.5);
    const wisps=mix(float(1),smoothstep(.12,.85,turbulence),fieldTurbulence);
    // Bright at the emitting screen, smoothly transparent at the top.
    const fade=float(1).sub(height).pow(fieldFade);
    fieldMaterial.colorNode=activeColor.mul(1.8);
    fieldMaterial.opacityNode=fieldDither.alpha(fade.mul(wave).mul(wisps).mul(fieldAlpha).mul(2.5).mul(strength).mul(fieldLevel).clamp(0,1));
    const field=new THREE.Mesh(fieldGeometry,fieldMaterial);field.rotation.copy(mesh.rotation);field.position.copy(mesh.position).add(new THREE.Vector3(0,panelHeight+.002,0).applyQuaternion(mesh.quaternion));field.visible=false;root.add(field);
    views.push({ready,flash,pulse,fieldLevel,scroll,field,envelope:createPadEnvelope(),visual:{level:0,field:0,heat:0,pulse:0}});
  }
  const particleMaterial=new MeshBasicNodeMaterial({color:0x35bcff,transparent:true,opacity:.9,depthWrite:false});
  particleMaterial.opacityNode=dither.alpha(particleAlpha);
  const particles=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.10),particleMaterial,72);particles.frustumCulled=false;particles.count=0;root.add(particles);
  const sparks=[],dummy=new THREE.Object3D();let reduced=false;
  function burst(p){
    if(!reduced)for(let i=0;i<settings.particles;i++){
      // Emit opposite the arrows, with lateral spread in the pad's local frame.
      const side=(Math.random()-.5)*3,along=(Math.random()-.5)*5;
      const speed=settings.particleSpeed*(.7+Math.random()*.6),spread=(Math.random()-.5)*settings.spread*2;
      sparks.push({x:p.x+p.nz*side+p.nx*along,y:p.y+.4,z:p.z-p.nx*side+p.nz*along,
        vx:-p.nx*speed+p.nz*spread,vz:-p.nz*speed-p.nx*spread,
        age:0,vy:settings.rise*(.5+Math.random()),seed:Math.random()*100,life:settings.particleLife*(.7+Math.random()*.6)});
    }
    if(sparks.length>72)sparks.splice(0,sparks.length-72);onActivate(p);
  }
  const api={sim,settings,
    configure(v){Object.assign(settings,v);if(v.flow!==undefined)flow.value=v.flow;if(v.brightness!==undefined)brightness.value=v.brightness;if(v.arrowCount!==undefined)arrowCount.value=v.arrowCount;if(v.color)green.value.set(v.color);if(v.activeColor){blue.value.set(v.activeColor);particleMaterial.color.set(v.activeColor);}
      particleAlpha.value=settings.particleOpacity;fieldAlpha.value=settings.fieldOpacity;fieldPulse.value=settings.fieldPulse;fieldFade.value=settings.fieldFade;
      fieldTurbulence.value=settings.fieldTurbulence??.55;fieldNoiseScale.value=settings.fieldNoiseScale??2.5;fieldNoiseSpeed.value=settings.fieldNoiseSpeed??1.2;
      if(v.fieldSpreadX!==undefined||v.fieldSpreadZ!==undefined){
        const attr=fieldGeometry.attributes.position;
        for(let i=0;i<attr.count;i++){
          const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];
          // Anchor the base to the screen; expand the top in both directions.
          attr.setXYZ(i,x+Math.sign(x)*(settings.fieldSpreadX??0)*y,y,z+Math.sign(z)*(settings.fieldSpreadZ??0)*y);
        }
        attr.needsUpdate=true;fieldGeometry.computeVertexNormals();fieldGeometry.computeBoundingBox();fieldGeometry.computeBoundingSphere();
      }
      fieldDither.configure({Campo:settings.fieldDither??'Apagado','Campo intensidad':settings.fieldDitherAmount??.75,'Campo tamaño':settings.fieldDitherSize??2,'Niveles escena':6},'Campo');
      screenOn.value=Number(settings.screen??false);screenCells.value=settings.screenCells??42;screenGrid.value=settings.screenGrid??.85;screenScan.value=settings.screenScan??.3;
      dither.configure({Partículas:settings.dither??'Apagado','Partículas intensidad':settings.ditherAmount??.7,'Partículas tamaño':settings.ditherSize??2,'Niveles escena':6},'Partículas');},
    get heatFields(){return sim.entries.map((p,i)=>{const v=views[i].visual;return {...p,height:settings.fieldHeight,intensity:v.level*v.field*v.heat*(1+v.pulse*.5)};});},
    activate(state){return sim.activate(sim.entries[0],state,burst);},
    reset(){sim.reset();sparks.length=0;particles.count=0;for(const v of views)v.scroll.value=0;},
    step(dt,state,previous){sim.step(dt,state,previous,burst);},
    update(dt,isReduced){
      reduced=isReduced;time.value=reduced?0:sim.time;
      sim.entries.forEach((p,i)=>{const v=views[i],visual=v.envelope.update(p,dt,settings);v.visual=visual;
        v.ready.value=visual.level;v.flash.value=visual.blue;v.pulse.value=visual.pulse;v.fieldLevel.value=visual.field;
        if(!reduced)v.scroll.value=(v.scroll.value+dt*flow.value*visual.level)%1;
        v.field.visible=visual.level*visual.field>.0001;v.field.scale.y=settings.fieldHeight;});
      if(reduced)sparks.length=0;
      for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.age+=dt;s.life-=dt;if(s.life<=0){sparks.splice(i,1);continue;}s.vx+=Math.sin(time.value*7+s.seed)*settings.turbulence*dt;s.vz+=Math.cos(time.value*5+s.seed)*settings.turbulence*dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.z+=s.vz*dt;s.vy-=settings.gravity*dt;}
      sparks.forEach((s,i)=>{dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,Math.atan2(s.vx,s.vz),0);dummy.scale.setScalar(THREE.MathUtils.smoothstep(s.age,0,.09)*THREE.MathUtils.smoothstep(s.life,0,.236)*settings.particleSize/.1);dummy.scale.z*=settings.stretch;dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);});particles.count=sparks.length;particles.instanceMatrix.needsUpdate=true;
    },
    dispose(){scene.remove(root);for(const m of root.children)if(m.isMesh&&m!==particles)m.material.dispose();fieldGeometry.dispose();particles.geometry.dispose();particleMaterial.dispose();source.geometry.dispose();for(const v of Object.values(source.material))if(v?.isTexture)v.dispose();source.material.dispose();},
  };
  api.configure(settings);
  return api;
}
