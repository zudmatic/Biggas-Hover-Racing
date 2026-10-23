// Materials are often shared across furniture (and across GLB instances).
// Clone only a painted slot, retaining the Retro Print shader and live lighting.
const names={charcoal:'Carbón',cream:'Crema',mustard:'Mostaza',brass:'Latón',rubber:'Goma',ivory:'Marfil',wooddark:'Madera oscura',woodlight:'Madera clara',wood:'Madera',terracotta:'Terracota',sage:'Verde salvia',leaf:'Hojas',teal:'Verde azulado',soil:'Tierra'};
export function prepareColors(entry) {
  const slots=new Map();
  entry.object.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    materials.forEach((material,index)=>{
      if(!material.color||material.isShaderMaterial)return;
      // Animated dyes/emission belong to the interaction, not the paint control.
      if(entry.builtin&&(material.emissiveIntensity>0&&material.emissive?.getHex()!==0||entry.id==='plant'&&!material.userData.surfaceFamily))return;
      if(!slots.has(material))slots.set(material,{source:material,owned:null,targets:[],label:names[material.name]??material.name??'Color'});
      slots.get(material).targets.push({mesh,index,array:Array.isArray(mesh.material)});
    });
  });
  entry.colorSlots=[...slots.values()];entry.colors={};
}
export function applyColors(entry,colors={}) {
  for(const [index,slot] of entry.colorSlots.entries()) {
    const color=colors[index];
    let material=slot.source;
    if(color){slot.owned??=slot.source.clone();slot.owned.color.set(color);material=slot.owned;}
    for(const {mesh,index:materialIndex,array} of slot.targets) {
      if(array){mesh.material=[...mesh.material];mesh.material[materialIndex]=material;}
      else mesh.material=material;
    }
  }
  entry.colors={...colors};
}
export function disposeColors(entry){for(const slot of entry.colorSlots??[])slot.owned?.dispose();}
