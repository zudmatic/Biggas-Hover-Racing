export const ARM_CATALOG=Object.freeze([
  {id:'forge',name:'Forja',type:'Armadura',color:'#a58b60',description:'Hombrera maciza, bordes de bronce, pernos hexagonales y un guantelete de placas.'},
  {id:'sentinel',name:'Centinela',type:'Armadura',color:'#8994ab',description:'Tres láminas de acero superpuestas, remaches, correas y dedos protegidos.'},
  {id:'hydraulic',name:'Hidráulico',type:'Robótico',color:'#c58b39',description:'Chasis industrial abierto, pistones cromados, mangueras y una pinza con nudillos mecánicos.'},
  {id:'aero',name:'Aero',type:'Robótico',color:'#dce4df',description:'Prótesis liviana de cerámica, tendones expuestos, juntas de titanio y pequeñas luces verdes.'},
  {id:'reactor',name:'Reactor',type:'Robótico',color:'#4bcad7',description:'Blindaje angular de grafito, núcleo de energía, aletas de refrigeración y conductos luminosos.'},
]);
export const ARM_PALETTES=Object.freeze({
  forge:['#75664f','#d0b684','#29292d','#989283','#c29451'],
  sentinel:['#657084','#b9c2ce','#292a32','#8c94a4','#674935'],
  hydraulic:['#ba7930','#e4bb65','#292e35','#c0c9cb','#5d665f'],
  aero:['#cbd5cf','#f0eee0','#303c45','#879da6','#70e4a6'],
  reactor:['#263846','#5c7787','#131e28','#859baa','#42d6e3'],
});
export const ARM_COLOR_FIELDS=['Color','TrimColor','AccentColor'];
export const ARM_DEFAULTS=Object.freeze({armLeft:'none',armRight:'none',...Object.fromEntries(['armLeft','armRight'].flatMap(side=>[
  [`${side}CustomColors`,false],...ARM_COLOR_FIELDS.map(field=>[`${side}${field}`,'#ffffff']),
]))});
export function armColorsFor(settings,side) {
  const palette=ARM_PALETTES[settings[side]];
  return Object.fromEntries(ARM_COLOR_FIELDS.map((field,i)=>[field,settings[`${side}CustomColors`]?settings[`${side}${field}`]:palette?.[[0,1,4][i]]??'#ffffff']));
}
