import * as THREE from 'three';

// The hoverbike's full-size handlebar and low pegs need extensions for the
// smaller racers. All endpoints are measured in the vehicle's local frame.
export function createNomadaPilotSupports(root,{hands,soles}){
  const metal=new THREE.MeshStandardMaterial({color:0x625d50,metalness:.75,roughness:.5});
  const rubber=new THREE.MeshStandardMaterial({color:0x493425,roughness:.85});
  const rodGeometry=new THREE.CylinderGeometry(.018,.018,1,8);
  const gripGeometry=new THREE.SphereGeometry(.038,10,6);
  const plateGeometry=new THREE.BoxGeometry(.17,.035,.19);
  const up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3(),target=new THREE.Vector3();
  function mesh(geometry,material,name){const m=new THREE.Mesh(geometry,material);m.name=name;m.castShadow=true;m.receiveShadow=true;m.userData.system='cockpit';root.add(m);return m;}
  const controls=hands.map((hand,i)=>({
    base:new THREE.Vector3((i===0?-1:1)*.56,1.67,.51),
    rod:mesh(rodGeometry,metal,'Extensión del manillar'),
    grip:mesh(gripGeometry,rubber,'Agarre de la Nómada'),hand,
  }));
  const rests=[-1,1].map((side,i)=>({
    base:new THREE.Vector3(side*.72,.3,.65),sole:soles[i],
    rod:mesh(rodGeometry,metal,'Soporte del estribo elevado'),
    plate:mesh(plateGeometry,rubber,'Estribo adaptado al piloto'),
  }));
  function connect(rod,base,end){direction.copy(end).sub(base);rod.position.copy(base).add(end).multiplyScalar(.5);rod.scale.y=direction.length();rod.quaternion.setFromUnitVectors(up,direction.normalize());}
  function update(){
    root.updateWorldMatrix(true,true);
    for(const control of controls){control.hand(target);root.worldToLocal(target);control.grip.position.copy(target);connect(control.rod,control.base,target);}
    for(const rest of rests){rest.sole(target);root.worldToLocal(target);target.y-=.0175;rest.plate.position.copy(target);connect(rest.rod,rest.base,target);}
  }
  return {update,dispose(){for(const item of [...controls.flatMap(c=>[c.rod,c.grip]),...rests.flatMap(r=>[r.rod,r.plate])])item.removeFromParent();rodGeometry.dispose();gripGeometry.dispose();plateGeometry.dispose();metal.dispose();rubber.dispose();}};
}
