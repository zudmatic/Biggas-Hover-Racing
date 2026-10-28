import {Source} from 'three';

// Paint changes affect only the three body finishes, preserving mechanical PBR maps.
export const ZUDONETA_LIVERIES=[
  {id:'original',name:'Original',colors:['#e2d5b5','#697246','#df6a26']},
  {id:'cobalto',name:'Cobalto',colors:['#dce6ed','#2456ad','#f2a837']},
  {id:'carmesi',name:'Carmesí',colors:['#eddbca','#ae2945','#e7b25b']},
  {id:'turquesa',name:'Turquesa',colors:['#e0e6d1','#168b82','#ef7952']},
  {id:'violeta',name:'Violeta',colors:['#e5dcee','#7248ac','#55c9d4']},
];
export const shipLivery=id=>ZUDONETA_LIVERIES.find(livery=>livery.id===id)??ZUDONETA_LIVERIES[0];
export const shipLiveryChoice=(query=new URLSearchParams(location.search))=>shipLivery(query.get('livery')).id;
export function shipLiveryMarkup(selected='original'){
  return `<fieldset class="ship-liveries"><legend>PINTURA <span class="ship-livery-name">${shipLivery(selected).name}</span></legend><div>${ZUDONETA_LIVERIES.map(livery=>`<button type="button" data-livery="${livery.id}" aria-label="Pintura ${livery.name}" aria-pressed="${livery.id===selected}" title="${livery.name}" style="--paint-base:${livery.colors[0]};--paint-main:${livery.colors[1]};--paint-accent:${livery.colors[2]}"><span></span></button>`).join('')}</div></fieldset>`;
}

const paintNames=['01 Marfil cálido · pintura','02 Verde oliva militar','03 Naranja seguridad'];
// A neutral copy retains wear and texture variation without the old paint hue
// multiplying the new color. Original maps remain untouched for an exact reset.
function neutralPaintMap(source){
  const canvas=document.createElement('canvas'),image=source.image;
  canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
  const linear=Array.from({length:256},(_,i)=>{const c=i/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
  const luminance=i=>linear[data[i]]*.2126+linear[data[i+1]]*.7152+linear[data[i+2]]*.0722;
  let total=0;for(let i=0;i<data.length;i+=4)total+=luminance(i);
  const mean=Math.max(total/(data.length/4),.001);
  for(let i=0;i<data.length;i+=4){
    const value=Math.min(1,luminance(i)/mean*.8);
    const srgb=Math.round(255*(value<=.0031308?value*12.92:1.055*value**(1/2.4)-.055));
    data[i]=data[i+1]=data[i+2]=srgb;
  }
  context.putImageData(pixels,0,0);
  const texture=source.clone();texture.source=new Source(canvas);texture.needsUpdate=true;
  return texture;
}

export function createShipLivery(root,config,initial='original'){
  const materials=new Map(),maps=new Map();
  if(config.id==='037')root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(const material of [].concat(mesh.material)){
      const index=paintNames.indexOf(material.name);
      if(index>=0&&!materials.has(material))materials.set(material,{index,map:material.map,color:material.color.clone()});
    }
  });
  function setLivery(id){
    const livery=shipLivery(config.id==='037'?id:'original');root.userData.livery=livery.id;
    for(const [material,original] of materials){
      if(livery.id==='original'){material.map=original.map;material.color.copy(original.color);}
      else{
        if(original.map&&!maps.has(original.map))maps.set(original.map,neutralPaintMap(original.map));
        material.map=maps.get(original.map)??null;material.color.set(livery.colors[original.index]);
      }
    }
    return livery.id;
  }
  setLivery(initial);
  return {setLivery,dispose(){for(const [original,neutral] of maps){original.dispose();neutral.dispose();}maps.clear();materials.clear();}};
}
