import {MeshStandardMaterial} from 'three';

const BAND=/\s+toon\s+(\d)$/;

// Bulldog 039's LOD0 bakes a three-band toon into unlit materials named
// "<family> toon 0|1|2" (dark, mid, light). Band 2 is the authored albedo.
// One lit material per family hands shading back to the game's comic shader,
// so the ship responds to sun, shadows, night and headlights like the others.
// Unlit materials without a band (the eye graphic) are left untouched.
export function lightToonSurfaces(root){
  const families=new Map(),replaced=new Set();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(const material of [].concat(mesh.material)){
      const match=material.isMeshBasicMaterial&&material.name.match(BAND);if(!match)continue;
      const name=material.name.replace(BAND,''),band=Number(match[1]),family=families.get(name);
      if(!family||band>family.band)families.set(name,{band,material});
    }
  });
  const lit=new Map([...families].map(([name,{material}])=>[name,new MeshStandardMaterial({name,color:material.color,side:material.side,roughness:.72,metalness:0})]));
  const convert=material=>{
    if(!material.isMeshBasicMaterial||!BAND.test(material.name))return material;
    replaced.add(material);return lit.get(material.name.replace(BAND,''));
  };
  root.traverse(mesh=>{if(mesh.isMesh)mesh.material=Array.isArray(mesh.material)?mesh.material.map(convert):convert(mesh.material);});
  replaced.forEach(material=>material.dispose());
  return {families:lit.size,replaced:replaced.size};
}
