import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {ARM_CATALOG,ARM_PALETTES,armColorsFor} from './arm-catalog.js';
import {retro} from './retro-material.js';

// Authored in the left shoulder's local coordinates (+X outward, +Z front).
// Mirror the complete assembly for the right shoulder, including the thumb.
// Every detail is geometry, so profiles, rear views and the comic pass agree.
export function createArmModel(id,{comic=false}={}) {
  const entry=ARM_CATALOG.find(item=>item.id===id);
  if(!entry)throw new Error(`Unknown arm: ${id}`);
  const root=new THREE.Group();root.name=`Brazo · ${entry.name}`;root.userData.armModel=id;
  const [body,edge,dark,steel,accent]=ARM_PALETTES[id].map((color,i)=>comic?retro(color):new THREE.MeshStandardMaterial({color,roughness:i===3?.27:.48,metalness:i===2?.25:id==='aero'&&i<2?.2:.76,flatShading:true}));
  if(id==='aero'||id==='reactor'){accent.emissive.copy(accent.color);accent.emissiveIntensity=.65;}
  const batches=new Map(),geometries=new Set();let details=0,handSpace=false;
  // Turn the authored forward palm toward the body around the wrist axis.
  // The mirrored right arm receives the opposite world-space rotation.
  const handRotation=new THREE.Matrix4().makeTranslation(.25,0,0)
    .multiply(new THREE.Matrix4().makeRotationY(-Math.PI/2))
    .multiply(new THREE.Matrix4().makeTranslation(-.25,0,0));
  function add(name,geometry,material,x=0,y=0,z=0,rotation=[0,0,0]) {
    const transform=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(1,1,1));
    geometry.applyMatrix4(transform);
    if(handSpace)geometry.applyMatrix4(handRotation);
    // Uniform, non-indexed buffers allow one draw call per material.
    const buffer=geometry.index?geometry.toNonIndexed():geometry;
    if(buffer!==geometry)geometry.dispose();
    if(!batches.has(material))batches.set(material,[]);
    buffer.userData.partName=name;batches.get(material).push(buffer);details++;
  }
  const box=(name,w,h,d,mat,x,y,z,rotation)=>add(name,new THREE.BoxGeometry(w,h,d),mat,x,y,z,rotation);
  const block=(name,w,h,d,mat,x,y,z,rotation,r=.025)=>add(name,new RoundedBoxGeometry(w,h,d,1,r),mat,x,y,z,rotation);
  const ball=(name,r,mat,x,y,z)=>add(name,new THREE.IcosahedronGeometry(r,1),mat,x,y,z);
  function rod(name,a,b,r,mat,r2=r,segments=10) {
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
    const geometry=new THREE.CylinderGeometry(r2,r,delta.length(),segments);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    const center=start.add(end).multiplyScalar(.5);add(name,geometry,mat,...center.toArray());
  }
  function bolt(x,y,z,r=.019) {
    rod('Arandela',[x,y,z-.006],[x,y,z+.006],r*1.4,dark,r*1.4,12);
    rod('Perno hexagonal',[x,y,z],[x,y,z+.019],r,steel,r,6);
    box('Ranura de tornillo',r*.9,.004,.003,dark,x,y,z+.021);
  }
  // Cross-sections surround the limb through 360°, rather than extruding a
  // front silhouette. Rows are [height, lateral radius, depth radius]. The
  // hollow version folds back along its inner wall, sealing both cut edges.
  function volume(name,rows,mat,x=0,z=0,wall=0,segments=12) {
    const profile=wall?[...rows,...rows.toReversed().map(([y,rx,rz])=>[y,rx-wall,rz-wall])]:rows;
    const point=(row,i)=>{const [y,rx,rz]=profile[row],a=i/segments*Math.PI*2;return [Math.sin(a)*rx,y,Math.cos(a)*rz];};
    const positions=[],uv=[];
    const tri=(a,b,c)=>{positions.push(...a,...b,...c);for(const p of [a,b,c])uv.push(p[0],p[1]);};
    for(let row=0;row<(wall?profile.length:profile.length-1);row++)for(let i=0;i<segments;i++) {
      const next=(row+1)%profile.length,a=point(row,i),b=point(row,i+1),c=point(next,i+1),d=point(next,i);
      tri(a,b,d);tri(b,c,d);
    }
    if(!wall)for(let i=0;i<segments;i++) {
      tri([0,rows[0][0],0],point(0,i+1),point(0,i));
      const last=rows.length-1;tri([0,rows[last][0],0],point(last,i),point(last,i+1));
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();add(name,geometry,mat,x,0,z);
  }
  // All trims sample the same section as their parent shell. Their inner
  // wall is buried slightly in it; independently guessed rings used to cut
  // through the armor at the wrist, shoulder and forearm openings.
  function section(rows,y) {
    const next=rows.findIndex(row=>row[0]>=y);
    const i=Math.max(0,next<0?rows.length-2:next-1);
    const a=rows[i],b=rows[i+1],t=THREE.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
    return [THREE.MathUtils.lerp(a[1],b[1],t),THREE.MathUtils.lerp(a[2],b[2],t)];
  }
  function band(name,rows,from,to,mat,x,segments=12) {
    const heights=[from,...rows.filter(row=>row[0]>from&&row[0]<to).map(row=>row[0]),to];
    volume(name,heights.map(y=>[y,...section(rows,y).map(r=>r+.012)]),mat,x,0,.018,segments);
  }
  function lining(rows,x,segments=12) {
    const from=rows[0][0]+.010,to=rows.at(-1)[0]-.012;
    const heights=[from,...rows.filter(row=>row[0]>from&&row[0]<to).map(row=>row[0]),to];
    volume('Revestimiento del antebrazo',heights.map(y=>[y,...section(rows,y).map(r=>r-.022)]),dark,x,0,0,segments);
  }
  // Z of the actual polygon face, not its circumscribed ellipse. Hardware
  // attached at an off-center X otherwise floats above the bevels.
  function front(rows,x,y,center,segments=12) {
    const [rx,rz]=section(rows,y),u=Math.min(1,Math.abs(x-center)/rx);
    const angle=Math.asin(Math.min(1,u)),step=2*Math.PI/segments;
    const a=Math.floor(angle/step)*step,b=a+step;
    const t=(u-Math.sin(a))/(Math.sin(b)-Math.sin(a));
    return rz*THREE.MathUtils.lerp(Math.cos(a),Math.cos(b),t);
  }
  function shell(y,w,h,depth) {
    const d=depth*.68,rows=[[y-.055,w*.9,d*.88],[y,w,d],[y+h*.50,w*.85,d*.87],[y+h*.87,w*.52,d*.58],[y+h,.045,.06]];
    volume('Cúpula de hombrera',rows,body,.12);
    band('Reborde envolvente de hombrera',rows,y-.052,y-.015,edge,.12);
    for(const angle of [-Math.PI/3,0,Math.PI/3,Math.PI]) {
      const a=[.12+Math.sin(angle)*w*.85,y+h*.5,Math.cos(angle)*d*.87];
      const b=[.12+Math.sin(angle)*w*.52,y+h*.87,Math.cos(angle)*d*.58];
      rod('Nervadura de hombrera',a,b,.008,edge);
    }
    return rows;
  }
  function sentinelShoulder() {
    // A broad, swept plate: the outer (+X) corner projects sideways, while
    // the raised crown and closed underside retain the shoulder's volume.
    // Mirroring the arm also mirrors the point away from the torso.
    const rim=[[-.26,.025,.18],[.04,-.045,.275],[.29,-.05,.255],[.57,-.035,.025],[.40,-.04,-.19],[.13,-.045,-.27],[-.26,.025,-.18],[-.30,.04,0]];
    const crown=[.14,.105,0];
    const inset=rim.map(([x,y,z])=>[.12+(x-.12)*.86,y+.021,z*.86]);
    const under=rim.map(([x,y,z])=>[x,y-.028,z]);
    const faces={plate:[],bevel:[],bottom:[]};
    for(let i=0;i<rim.length;i++) {
      const j=(i+1)%rim.length;
      faces.plate.push(crown,inset[i],inset[j]);
      faces.bevel.push(inset[i],rim[i],rim[j],inset[i],rim[j],inset[j]);
      faces.bevel.push(rim[i],under[i],under[j],rim[i],under[j],rim[j]);
      faces.bottom.push([.14,.045,0],under[j],under[i]);
    }
    for(const [name,vertices,material] of [['Hombrera en punta',faces.plate,body],['Bisel de la hombrera',faces.bevel,edge],['Interior de hombrera',faces.bottom,dark]]) {
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(vertices.flatMap(([x,,z])=>[x,z]),2));
      geometry.computeVertexNormals();add(name,geometry,material);
    }
    for(const i of [0,1,2,4,5,6]) {
      const p=inset[i].map((value,axis)=>value*.82+crown[axis]*.18);
      ball('Remache de hombrera',.017,steel,p[0],p[1]+.009,p[2]);
    }
  }
  function hose(points,material,r=.014) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    add('Conducto flexible',new THREE.TubeGeometry(curve,16,r,6,false),material);
  }
  function hand(armored=false,slim=false) {
    handSpace=true;
    const x=.25,y=-.69,w=slim?.29:armored?.37:.34,d=slim?.29:.34;
    const rows=[[y-.10,w*.32,d*.32],[y-.065,w*.50,d*.50],[y+.035,w*.50,d*.50],[y+.065,w*.39,d*.39],[y+.085,.095,.095]];
    // A closed palm shell replaces the rotated box that protruded through
    // the hollow gauntlet. The narrow top receives a centered wrist bearing.
    volume('Carcasa del puño',rows,body,x);
    if(armored)band('Borde del guantelete',rows,y+.035,y+.059,edge,x);
    for(let i=0;i<4;i++) {
      const fx=x-w*.34+i*w*.225,fy=y-.005-Math.sin(i/3*Math.PI)*.009;
      const z=front(rows,fx,fy,x);
      ball('Articulación del nudillo',.036,steel,fx,fy,z);
      block('Falange proximal',w*.205,.064,.075,body,fx,fy-.012,z+.023,[.16,0,0],.015);
      block('Falange media',w*.20,.054,.065,edge,fx,fy-.062,z+.008,[.65,0,0],.014);
      block('Falange replegada',w*.19,.045,.064,body,fx,fy-.080,z-.030,[1.25,0,0],.012);
      if(armored)bolt(fx,fy-.012,z+.06,.009);
      else box('Junta del dedo',w*.13,.006,.004,dark,fx,fy-.035,z+.062);
    }
    ball('Base del pulgar',.045,dark,x-w*.46,y+.025,.025);
    block('Protección del pulgar',.08,.10,.11,body,x-w*.47,y+.005,.060,[.15,0,-.38],.020);
    block('Punta del pulgar',.075,.065,.09,edge,x-w*.39,y-.045,.108,[.4,0,-.65],.019);
    bolt(x+w*.20,y+.02,front(rows,x+w*.20,y+.02,x),.012);
    handSpace=false;
    return rows;
  }
  // One continuous mechanical axis, with each rod ending inside its joint.
  // Narrower cores leave the elbow bearing visible without jagged rings.
  ball('Rótula del hombro',.095,dark,.04,-.075,0);
  rod('Núcleo del húmero',[.04,-.075,0],[.16,-.30,0],.070,dark,.070);
  ball('Codo',.105,dark,.16,-.30,0);
  rod('Eje del codo',[.16,-.30,-.13],[.16,-.30,.13],.075,steel,.075,12);
  rod('Tapa del codo',[.16,-.30,.13],[.16,-.30,.15],.052,edge,.052,12);
  bolt(.16,-.30,.15,.021);
  rod('Núcleo del antebrazo',[.16,-.30,0],[.25,-.595,0],.065,dark,.075);
  rod('Collar articulado',[.25,-.616,0],[.25,-.550,0],.085,steel,.085,12);
  if(id==='forge'||id==='sentinel') {
    const heavy=id==='forge';
    if(heavy) {
      shell(-.025,.30,.16,.40);
      // The plaque follows the dome's slope instead of floating upright.
      block('Marco frontal de hombrera',.25,.105,.035,edge,.12,.020,.236,[-.42,0,0],.012);
      block('Placa frontal de hombrera',.208,.073,.021,body,.12,.026,.255,[-.42,0,0],.009);
      block('Escudo grabado',.055,.049,.010,accent,.12,.029,.268,[-.42,0,0],.005);
      for(const x of [.035,.205])bolt(x,.005,.259,.012);
    } else sentinelShoulder();
    // Two overlapping scales end above the elbow. A third scale previously
    // occupied the same space as the forearm's upper rim on Centinela.
    for(let i=0;i<2;i++) {
      const y=-.14-i*.082,x=.14+i*.026,r=(heavy?.235:.245)-i*.023,d=.242-i*.018;
      const rows=[[y-.050,r,d],[y-.025,r*1.02,d*1.02],[y+.052,r*.76,d*.76]];
      volume('Lámina envolvente',rows,body,x,0,.028);
      band('Canto de lámina',rows,y-.048,y-.029,edge,x);
      for(const angle of [-Math.PI/6,Math.PI/6,Math.PI-Math.PI/6,Math.PI+Math.PI/6]) {
        const [rx,rz]=section(rows,y-.005);
        ball('Remache de lámina',.012,steel,x+Math.sin(angle)*rx,y-.005,Math.cos(angle)*rz);
      }
    }
    const rows=[[-.566,.12,.135],[-.52,.19,.22],[-.42,.215,.25],[-.365,.155,.18]];
    volume('Brazal completo',rows,body,.23,0,.028);lining(rows,.23);
    for(const y of [-.515,-.395])band('Aro del brazal',rows,y-.010,y+.010,edge,.23);
    band('Correa del brazal',rows,-.469,-.447,accent,.23);
    for(const sign of [-1,1])rod('Nervadura del brazal',[.23,-.50,sign*section(rows,-.50)[1]],[.23,-.425,sign*section(rows,-.425)[1]],.009,edge);
    for(const x of [.13,.33])for(const y of [-.425,-.49])bolt(x,y,front(rows,x,y,.23),.012);
    if(!heavy) {
      block('Aleta exterior',.075,.13,.18,body,.434,-.44,0,[0,0,-.12],.012);
      for(let i=0;i<3;i++) {
        const y=-.425-i*.023;
        box('Grabado del brazal',.065,.005,.004,dark,.23,y,front(rows,.23,y,.23)+.001);
      }
    } else block('Hebilla',.05,.028,.022,steel,.17,-.458,front(rows,.17,-.458,.23)+.012,undefined,.006);
    hand(true);
  } else if(id==='hydraulic') {
    shell(-.025,.26,.15,.37);
    block('Carcasa industrial',.20,.085,.05,body,.11,.005,.218,[-.40,0,0],.012);
    for(const x of [.045,.175])bolt(x,-.005,.242,.014);
    for(const z of [-.17,.17]) {
      const a=new THREE.Vector3(.265,-.12,z),b=new THREE.Vector3(.325,-.49,z),at=t=>a.clone().lerp(b,t).toArray();
      rod('Camisa del pistón',at(0),at(.56),.048,body);
      rod('Vástago cromado',at(.48),at(1),.025,steel);
      for(const t of [.12,.49])rod('Anillo del pistón',at(t-.025),at(t+.025),.053,steel);
      ball('Anclaje superior del pistón',.055,steel,...at(0));
      ball('Rótula hidráulica',.048,steel,...at(1));
      // Both ends sit in brackets attached to the shoulder / hydraulic block.
      block('Soporte del pistón',.08,.065,.10,body,.25,-.12,z*.80,undefined,.01);
      block('Soporte del vástago',.08,.065,.10,body,.30,-.49,z*.80,undefined,.01);
    }
    block('Bloque hidráulico',.28,.20,.35,body,.22,-.46,0,undefined,.03);
    block('Guardia del pistón',.20,.145,.075,body,.20,-.45,.18,undefined,.018);
    for(let i=0;i<3;i++)box('Franja de precaución',.027,.085,.006,dark,.145+i*.054,-.45,.220,[0,0,-.30]);
    for(let i=0;i<4;i++)block('Disipador trasero',.22,.022,.07,steel,.22,-.385-i*.045,-.19,undefined,.006);
    const hoses=[
      {points:[[.015,-.09,-.16],[-.025,-.24,-.20],[.055,-.39,-.22],[.13,-.49,-.18]],material:accent},
      {points:[[.24,-.07,-.16],[.40,-.19,-.20],[.40,-.33,-.21],[.30,-.395,-.18]],material:dark},
    ];
    for(const {points,material} of hoses) {
      hose(points,material,.022);
      for(const p of [points[0],points.at(-1)])ball('Racor del conducto',.032,steel,...p);
    }
    hand();
  } else if(id==='aero') {
    const shoulder=[[-.18,.12,.15],[-.10,.19,.22],[.02,.21,.23],[.10,.14,.16],[.13,.06,.075]];
    volume('Carcasa cerámica de hombro',shoulder,body,.10);
    band('Collar de cerámica',shoulder,-.175,-.145,edge,.10);
    for(const z of [-.10,.10])for(const x of [.05,.22]) {
      rod('Tendón de titanio',[x,-.15,z],[x+.025,-.40,z],.018,steel);
      ball('Anclaje del tendón',.027,edge,x,-.16,z);
    }
    const rows=[[-.566,.115,.13],[-.51,.16,.195],[-.415,.18,.22],[-.36,.13,.165]];
    volume('Carcasa aerodinámica',rows,body,.23,0,.026);lining(rows,.23);
    band('Labio cerámico',rows,-.39,-.365,edge,.23);
    for(let i=0;i<3;i++) {
      const y=-.43-i*.024;
      block('Indicador de carga',.047,.012,.014,accent,.23,y,front(rows,.23,y,.23),undefined,.004);
    }
    const points=[[.015,-.11,-.17],[.025,-.28,-.19],[.15,-.49,-.17]];
    hose(points,accent,.014);
    for(const p of [points[0],points.at(-1)])ball('Racor del conducto',.022,steel,...p);
    for(const y of [-.425,-.49])bolt(.29,y,front(rows,.29,y,.23),.010);
    hand(false,true);
  } else {
    shell(-.025,.28,.16,.39);
    block('Inserto luminoso',.18,.025,.024,accent,.12,.005,.252,[-.42,0,0],.008);
    for(const x of [.045,.285])for(const z of [-.12,.12]) {
      rod('Conducto de energía',[x,-.095,z],[x+.025,-.395,z],.014,accent);
      for(const [px,y] of [[x,-.095],[x+.025,-.395]])ball('Terminal de energía',.025,steel,px,y,z);
    }
    const rows=[[-.566,.12,.145],[-.52,.215,.24],[-.41,.23,.265],[-.355,.155,.19]];
    volume('Blindaje integral del reactor',rows,body,.24,0,.028,8);lining(rows,.24,8);
    band('Bisel del reactor',rows,-.39,-.360,edge,.24,8);
    // A seated housing fills the full gap beneath the round core, including
    // its lower edge where the tapered shell is further from the camera.
    for(const sign of [-1,1]) {
      rod('Cámara central',[.24,-.455,sign*.18],[.24,-.455,sign*.273],.083,dark,.083,12);
      rod('Anillo del reactor',[.24,-.455,sign*.268],[.24,-.455,sign*.283],.087,steel,.087,12);
      rod('Cámara de energía',[.24,-.455,sign*.282],[.24,-.455,sign*.289],.062,accent,.062,12);
      rod('Centro del núcleo',[.24,-.455,sign*.288],[.24,-.455,sign*.296],.026,edge,.026,6);
    }
    for(let i=0;i<3;i++)block('Aleta de refrigeración',.085,.020,.20,edge,.455,-.425-i*.034,0,undefined,.006);
    const palm=hand();
    handSpace=true;
    for(let i=0;i<3;i++) {
      const x=.195+i*.055;
      box('Luz del guantelete',.018,.025,.010,accent,x,-.67,front(palm,x,-.67,.25));
    }
    handSpace=false;
  }
  // Batched buffers retain all authored bevels, bolts and finger joints while
  // keeping two equipped arms cheap enough for the animated editor.
  for(const [material,buffers] of batches) {
    let offset=0;
    const parts=buffers.map(buffer=>{const part={name:buffer.userData.partName,start:offset,count:buffer.attributes.position.count};offset+=part.count;return part;});
    const geometry=mergeGeometries(buffers);buffers.forEach(buffer=>buffer.dispose());geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`${entry.name} · ${material.color.getHexString()}`;mesh.castShadow=mesh.receiveShadow=true;mesh.userData.parts=parts;root.add(mesh);
  }
  root.userData.detailCount=details;
  function setColors(colors) {
    for(const [material,key,index] of [[body,'Color',0],[edge,'TrimColor',1],[accent,'AccentColor',4]]) {
      material.userData.armColorRole=key;
      material.color.set(/^#[0-9a-f]{6}$/i.test(colors?.[key])?colors[key]:ARM_PALETTES[id][index]);
    }
    if(id==='aero'||id==='reactor')accent.emissive.copy(accent.color);
  }
  setColors();
  return {root,setColors,dispose(){geometries.forEach(g=>g.dispose());[body,edge,dark,steel,accent].forEach(m=>m.dispose());}};
}

export function createCharacterArms(model,{comic=false}={}) {
  // Zud faces +Z: anatomical right is -X (the viewer's left).
  const slots=[{key:'armRight',pivot:model.arms[0],sign:-1},{key:'armLeft',pivot:model.arms[1],sign:1}].map(slot=>({...slot,original:slot.pivot.getObjectByName('Brazo'),core:model.root.children.find(part=>part.name==='Núcleo del hombro'&&part.position.distanceToSquared(slot.pivot.userData.restPosition)<1e-8),id:'none',asset:null}));
  return {
    update(settings) {
      for(const slot of slots) {
        const id=ARM_CATALOG.some(entry=>entry.id===settings[slot.key])?settings[slot.key]:'none';
        if(slot.id!==id) {
          slot.releaseRig?.();slot.releaseRig=null;slot.asset?.root.removeFromParent();slot.asset?.dispose();slot.asset=null;slot.id=id;
          if(id!=='none'){slot.asset=createArmModel(id,{comic});slot.asset.root.scale.x=slot.sign;slot.pivot.add(slot.asset.root);slot.releaseRig=model.rig.bindArmAsset(model.arms.indexOf(slot.pivot),slot.asset.root);}
        }
        slot.original.visible=id==='none';
        if(slot.core)slot.core.visible=id==='none';
        slot.asset?.setColors(armColorsFor(settings,slot.key));
        slot.asset?.root.traverse(mesh=>{if(mesh.isMesh)mesh.material.wireframe=Boolean(settings.wireframe);});
      }
    },
    dispose(){for(const slot of slots){slot.releaseRig?.();slot.releaseRig=null;slot.asset?.root.removeFromParent();slot.asset?.dispose();slot.original.visible=true;if(slot.core)slot.core.visible=true;slot.asset=null;slot.id='none';}},
  };
}
