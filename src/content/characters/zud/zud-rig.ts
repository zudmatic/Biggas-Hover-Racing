import * as THREE from 'three';

// Bend the authored, continuous shells in their rest frame. Keeping the
// shoulder/hip band rigid preserves the buried joins and the original outline.
// CPU deformation also serves raycasting, shadows and the comic depth pass.
export function createZudRig({arms,feet}) {
  const bindings=new Set(),owned=new Set();
  const supportMatrix=new THREE.Matrix4(),legMatrix=new THREE.Matrix4();
  const makeJoint=(parent,name,position)=>{
    const joint=new THREE.Group();joint.name=name;joint.position.copy(position);
    joint.userData.restPosition=position.clone();parent.add(joint);return joint;
  };
  const elbows=arms.map((arm,i)=>makeJoint(arm,'Codo',new THREE.Vector3(i?.12:-.12,-.27,0)));
  const knees=feet.map((hip,i)=>makeJoint(hip,'Rodilla',new THREE.Vector3(i?.08:-.08,-.27,.015)));
  const hands=elbows.map((elbow,i)=>makeJoint(elbow,'Agarre',new THREE.Vector3(i?.16:-.16,-.51,.13).sub(elbow.position)));
  function bind(mesh,joint,{rigidParts=false}={}) {
    const binding={mesh,joint,rigidParts,geometry:null};bindings.add(binding);
    return ()=>{
      bindings.delete(binding);
      if(binding.geometry){owned.delete(binding.geometry);binding.geometry.dispose();}
    };
  }
  arms.forEach((arm,i)=>bind(arm.getObjectByName('Brazo'),elbows[i]));
  feet.forEach((hip,i)=>bind(hip.getObjectByName('Pierna'),knees[i]));
  function prepare(binding) {
    const {mesh,joint,rigidParts}=binding;
    if(binding.geometry){owned.delete(binding.geometry);binding.geometry.dispose();}
    // Variants may share geometry; never deform another character or the cache.
    const geometry=mesh.geometry.clone();mesh.geometry=geometry;owned.add(geometry);
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    const position=geometry.attributes.position,weights=new Float32Array(position.count);
    // Alternate arms are authored +X outward and mirrored by their parent.
    const pivot=joint.position.clone();
    if(rigidParts)pivot.x=Math.abs(pivot.x);
    else pivot.sub(mesh.position);
    const weight=y=>1-THREE.MathUtils.smoothstep(y,pivot.y-.10,pivot.y+.12);
    for(let i=0;i<weights.length;i++)weights[i]=weight(position.getY(i));
    if(rigidParts)for(const part of mesh.userData.parts) {
      // Armor and hands remain rigid. Flexible hoses span the bending zone.
      if(/Conducto flexible/.test(part.name))continue;
      let y=0;for(let i=part.start;i<part.start+part.count;i++)y+=position.getY(i);
      const w=y/part.count<pivot.y-.035?1:0;
      weights.fill(w,part.start,part.start+part.count);
    }
    geometry.computeBoundingSphere();
    // Conservative bounds contain the complete bend without scanning every
    // vertex again each frame. Positions themselves stay exact for raycasts.
    geometry.boundingSphere.radius+=.8;geometry.boundingBox=null;
    Object.assign(binding,{geometry,pivot,weights,positions:position.array.slice(),normals:geometry.attributes.normal.array.slice(),lastAngle:NaN});
  }
  function update() {
    for(const binding of bindings) {
      if(binding.mesh.geometry!==binding.geometry)prepare(binding);
      const {geometry,joint,pivot,weights,positions,normals}=binding,angle=joint.rotation.x;
      if(angle===binding.lastAngle)continue;
      const p=geometry.attributes.position.array,n=geometry.attributes.normal.array;
      for(let i=0;i<weights.length;i++) {
        const offset=i*3,a=angle*weights[i],c=Math.cos(a),s=Math.sin(a);
        const y=positions[offset+1]-pivot.y,z=positions[offset+2]-pivot.z;
        p[offset]=positions[offset];p[offset+1]=pivot.y+y*c-z*s;p[offset+2]=pivot.z+y*s+z*c;
        n[offset]=normals[offset];n[offset+1]=normals[offset+1]*c-normals[offset+2]*s;n[offset+2]=normals[offset+1]*s+normals[offset+2]*c;
      }
      geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;
      geometry.boundingBox=null;binding.lastAngle=angle;
    }
  }
  return {elbows,knees,hands,update,
    floorHeight(root) {
      // Solve in the character parent's space, before room scale, heading or
      // airborne movement. The lowest sole stays supported through hip roll.
      root.updateMatrix();let lowest=Infinity;
      for(const hip of feet) {
        const mesh=hip.getObjectByName('Pierna');hip.updateMatrix();mesh.updateMatrix();
        legMatrix.multiplyMatrices(hip.matrix,mesh.matrix);
        supportMatrix.multiplyMatrices(root.matrix,legMatrix);
        const e=supportMatrix.elements,p=mesh.geometry.attributes.position;
        for(let i=0;i<p.count;i++)lowest=Math.min(lowest,e[1]*p.getX(i)+e[5]*p.getY(i)+e[9]*p.getZ(i)+e[13]);
      }
      return lowest;
    },
    bindArmAsset(index,asset) {
      const releases=asset.children.filter(mesh=>mesh.isMesh).map(mesh=>bind(mesh,elbows[index],{rigidParts:true}));
      hands[index].position.set(index?.25:-.25,-.69,0).sub(elbows[index].position);
      return ()=>{releases.forEach(release=>release());hands[index].position.copy(hands[index].userData.restPosition);};
    },
    reset(){for(const joint of [...elbows,...knees])joint.rotation.set(0,0,0);update();},
    dispose(){owned.forEach(geometry=>geometry.dispose());owned.clear();bindings.clear();},
  };
}
