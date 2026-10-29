// City-specific, small repeating material tiles. Color is a linear tint mask:
// authored paint colors and vertex colors still provide the palette.
const fract=x=>x-Math.floor(x),mix=(a,b,t)=>a+(b-a)*t;
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
function noise(u,v,nx,ny=nx){
  const x=fract(u)*nx,y=fract(v)*ny,ix=Math.floor(x),iy=Math.floor(y),a=smooth(0,1,fract(x)),b=smooth(0,1,fract(y));
  const h=(i,j)=>hash((i+nx)%nx,(j+ny)%ny);
  return mix(mix(h(ix,iy),h(ix+1,iy),a),mix(h(ix,iy+1),h(ix+1,iy+1),a),b);
}
const line=(x,width)=>1-smooth(width,width*2,Math.min(fract(x),1-fract(x)));

// [tile width in metres, bump depth, roughness]. Raised relief stays restrained
// enough for the painted PSX look; no extra geometry or shader layers are used.
export const cityTextureProfiles={
  dirt:[5,.055,1],asphalt:[5,.025,.98],concrete:[5,.045,.92],plaster:[4,.025,.94],paving:[4,.035,.94],
  rock:[7,.11,.96],stone:[3,.035,.9],brick:[3,.04,.93],wood:[2,.035,.88],bark:[2,.07,.98],birch:[2,.035,.95],
  grass:[4,.035,1],moss:[3,.045,1],foliage:[2,.025,.97],pine:[2,.025,.97],
  fabric:[1.5,.014,.95],paint:[2,.008,.69],metal:[2,.008,.58],bronze:[3,.006,.46],glass:[5,0,.23],rubber:[2,.015,.99],
};

export function citySurface(name=''){
  if(/dirt|tierra/i.test(name))return 'dirt';
  if(/foam|espuma/i.test(name))return 'foam';
  if(/water|fall|océano|agua/i.test(name))return 'water';
  if(/rubber|braking|tyre/i.test(name))return 'rubber';
  if(/road|asphalt|asfalto|grid/i.test(name))return 'asphalt';
  if(/birch/i.test(name))return 'birch';
  if(/bark/i.test(name))return 'bark';
  if(/wood|timber|madera/i.test(name))return 'wood';
  if(/grass|pasto|césped|vegetacion terreno/i.test(name))return 'grass';
  if(/pine/i.test(name))return 'pine';
  if(/fern|foliage|leaf|leaves|roofvegetation|vegetacion/i.test(name))return 'foliage';
  if(/moss|soil/i.test(name))return 'moss';
  if(/plaza|paving|limestone|adoquin/i.test(name))return 'paving';
  if(/rock|basalto|F039_Stone/i.test(name))return 'rock';
  if(/stone|ivory.*stone/i.test(name))return 'stone';
  if(/brick/i.test(name))return 'brick';
  if(/glass|glazing|window|neon|glint|luz|lens|iris|faros/i.test(name))return 'glass';
  if(/flag|bandera|cloth|awning|banderines/i.test(name))return 'fabric';
  if(/paint|kerb|marking|marcas|cone|enamel|accent|creamSign|seguridad/i.test(name))return 'paint';
  if(/gold|bronze|copper|champagne/i.test(name))return 'bronze';
  if(/metal|steel|aluminium|structure|mechanism|graphite|farola/i.test(name))return 'metal';
  if(/WarmConcrete/i.test(name))return 'plaster';
  return 'concrete';
}

// Return albedo and packed surface data: bump reads R, roughness reads G.
// Two GPU textures per family replace the former three separate maps.
export function paintCityTile(kind,size){
  const color=new Uint8Array(size*size*4),surface=new Uint8Array(size*size*4),tau=Math.PI*2;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,n=noise(u,v,8),broad=noise(u,v,4),fine=noise(u,v,64),grain=hash(x,y);
    let value=.86,height=.5,roughness=.94,tint=[1,1,1];
    if(kind==='dirt'){
      const gravel=smooth(.65,.82,fine),rut=line(u*3+noise(u,v,4,16)*.08,.045);
      value=.77+broad*.14+(fine-.5)*.15+gravel*.1-rut*.12;
      height=.38+fine*.19+gravel*.19-rut*.12;roughness=.95+grain*.05;tint=[1,.96,.88];
    }else if(kind==='asphalt'){
      const chips=smooth(.64,.78,fine),pits=grain>.95?1:0;
      const fissure=line(u*3+noise(u,v,4)*.55,.008)*(1-smooth(.43,.62,noise(u,v,8)));
      value=.77+grain*.1+chips*.12+(broad-.5)*.1-fissure*.18-pits*.1;
      height=.39+chips*.18+grain*.09-fissure*.2;roughness=.88+fine*.12;
    }else if(kind==='concrete'||kind==='plaster'){
      const pores=grain>.96&&fine<.5?1:0,stain=smooth(.56,.77,noise(u,v,8,2));
      const seam=kind==='concrete'?line(v*2,.004)*.1:0;
      value=.9+(n-.5)*.09-stain*.07-pores*.09-seam;height=.48+(fine-.5)*.12-pores*.15-seam;
      tint=[1,.994,.978];
    }else if(kind==='paving'||kind==='stone'||kind==='brick'){
      const rows=kind==='brick'?8:kind==='paving'?4:2,cols=kind==='brick'?5:kind==='paving'?4:3;
      const row=Math.floor(v*rows),su=u*cols+(row%2)*.5,sv=v*rows;
      const edge=Math.min(fract(su),1-fract(su),fract(sv),1-fract(sv));
      const joint=1-smooth(.014,.032,edge),bevel=1-smooth(.035,.08,edge),cell=hash(Math.floor(su)%cols,row);
      value=.81+cell*.13+(fine-.5)*.07-joint*.23-bevel*.04;height=.55-joint*.32-bevel*.08+(fine-.5)*.07;
      tint=[1,.99,.96];
    }else if(kind==='rock'){
      const strata=noise(u,v,8,32),fault=line(u*4+noise(u,v,4)*.8,.015),ledge=line(v*7+noise(u,v,8)*.25,.024);
      value=.76+n*.18+(strata-.5)*.16-fault*.12-ledge*.09;height=.3+n*.3+strata*.18-fault*.15-ledge*.08;
      tint=[.97,1,.98];
    }else if(kind==='wood'||kind==='bark'||kind==='birch'){
      const warp=noise(u,v,8,4),fibres=noise(u+warp*.035,v,64,8),groove=line(u*13+warp*.7,.075);
      if(kind==='birch'){
        const scar=smooth(.69,.77,noise(u,v,8,48))*(.45+warp*.55);
        value=.93+(n-.5)*.06-scar*.48;height=.5+(fibres-.5)*.07-scar*.1;tint=[1,.99,.96];
      }else if(kind==='wood'){
        const seam=line(u*4,.012),knot=smooth(.75,.93,Math.sin((u*4+warp*.2)*tau)*Math.sin(v*tau*2));
        value=.83+(fibres-.5)*.15+(warp-.5)*.13-groove*.07-knot*.12-seam*.18;height=.5+(fibres-.5)*.15-seam*.2;
        tint=[1,.97,.9];
      }else{
        value=.71+warp*.18+fibres*.12-groove*.21;height=.38+warp*.2+fibres*.2-groove*.23;tint=[1,.98,.93];
      }
    }else if(kind==='grass'||kind==='moss'){
      const tufts=smooth(.4,.72,n),earth=1-smooth(.23,.4,broad);
      value=.76+tufts*.15+(fine-.5)*.14-earth*.09;height=.35+tufts*.22+fine*.15;
      tint=[.94+earth*.06,1,.86+earth*.12];
    }else if(kind==='foliage'||kind==='pine'){
      // Clusters and dappled light instead of diagonal stripes over every tree.
      const clusters=noise(u,v,16),tips=smooth(.55,.8,noise(u,v,32,kind==='pine'?8:32));
      value=.74+clusters*.19+tips*.09;height=.36+clusters*.25+tips*.13;tint=[.96,1,.91];
    }else if(kind==='fabric'){
      const weave=((x%4<2)===(y%4<2))?1:0,fold=noise(u,v,16,2);
      value=.88+weave*.045+(fold-.5)*.07;height=.45+weave*.1;tint=[1,.994,.98];
    }else if(kind==='paint'){
      const chip=grain>.96&&fine<.38?1:0;value=.96+(n-.5)*.035-chip*.17;height=.53-chip*.1;roughness=.82+fine*.16;
    }else if(kind==='metal'||kind==='bronze'){
      const brushing=noise(u,v,8,128),patina=smooth(.58,.8,n);
      value=.91+(brushing-.5)*.08-patina*(kind==='bronze'?.11:.06);height=.5+(brushing-.5)*.055;roughness=.72+patina*.22+fine*.06;
      if(kind==='bronze')tint=[1,1-patina*.025,1-patina*.06];
    }else if(kind==='glass'){
      const streak=noise(u,v,32,2);value=.975+(streak-.5)*.035;roughness=.83+streak*.17;
    }else if(kind==='rubber'){
      value=.82+fine*.12;height=.45+fine*.1;
    }
    const i=(y*size+x)*4;
    for(let c=0;c<3;c++)color[i+c]=Math.round(clamp(value*tint[c])*255);color[i+3]=255;
    surface.set([Math.round(clamp(height)*255),Math.round(clamp(roughness)*255),0,255],i);
  }
  if(kind==='grass'){
    // Wrapped, curved strokes keep blade detail across tile borders. Density
    // scales with resolution so the mobile tile retains separated blades.
    for(let blade=0;blade<Math.round(size*5);blade++){
      const x=hash(blade,1)*size,y=hash(blade,2)*size,angle=hash(blade,3)*tau,length=(.012+hash(blade,4)*.032)*size,dry=hash(blade,5)>.88,steps=Math.ceil(length*2);
      for(let step=0;step<=steps;step++){
        const t=step/steps,bend=Math.sin(t*Math.PI)*length*.18,px=Math.round(x+Math.cos(angle)*length*t-Math.sin(angle)*bend),py=Math.round(y+Math.sin(angle)*length*t+Math.cos(angle)*bend),i=(((py%size+size)%size)*size+(px%size+size)%size)*4;
        const light=.73+hash(blade,6)*.15+t*.07;color.set([Math.round(light*255*(dry?1:.91)),Math.round(light*255),Math.round(light*255*(dry?.79:.8)),255],i);surface[i]=Math.round((.48+t*.17)*255);
      }
    }
  }
  return {color,surface};
}
