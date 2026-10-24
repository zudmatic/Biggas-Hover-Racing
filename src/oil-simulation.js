export const OIL_DEFAULTS={width:2.6,endWidth:2.6,spread:0,endSpread:0,spacing:.8,variation:0,taper:1,entryTime:3/14,recoveryTime:1,pourDuration:2,lifetime:5,slowdown:.3,respawn:8,botSpeed:22};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

export function clearOilEffect(state){Object.assign(state,{oilContact:false,oilFactor:1});}

export function updateOilResistance(state,touching,dt,slowdown,settings=OIL_DEFAULTS){
  state.oilContact=touching;
  const target=touching?1-slowdown:1;
  const duration=touching?settings.entryTime:settings.recoveryTime;
  state.oilFactor=(state.oilFactor??1)+(target-(state.oilFactor??1))*(1-Math.exp(-dt*3/Math.max(.05,duration)));
}

// Simulation time advances only when the host is flying. Oil is shared by the
// player and training bot; overlapping patches never multiply the penalty.
export function createOilSimulation({landscape,surfaceHeight,settings={}}){
  const config={...OIL_DEFAULTS,...settings},patches=[],pickups=[];
  let time=0,inventory=false,pourLeft=0,pourTotal=0,lastDrop=null,serial=0;
  const start=landscape.roadAt(landscape.spawn.x,landscape.spawn.z).distance;
  function floor(x,z){
    const road=landscape.roadAt(x,z),y=surfaceHeight(x,z);
    return Number.isFinite(y)&&Math.abs(road.offset)<road.width/2-.25&&Math.abs(y-road.y)<2?y:null;
  }
  for(let d=14;d<landscape.length-15;d+=150){
    const road=landscape.atDistance(start+d);
    for(const offset of [-2.6,0,2.6]){
      const x=road.x-road.nz*offset,z=road.z+road.nx*offset,y=floor(x,z);
      if(y!==null)pickups.push({x,y,z,readyAt:0});
    }
  }
  function contact(state){return patches.some(p=>Math.abs(state.y-(state.hover??.65)-p.y)<1.5&&Math.hypot(state.x-p.x,state.z-p.z)<p.radius);}
  function drop(x,z,yaw){
    if(config.lifetime<=0)return;
    const t=Math.pow(clamp(1-pourLeft/pourTotal,0,1),config.taper);
    const noise=seed=>{const n=Math.sin(seed*127.1+311.7)*43758.5453;return (n-Math.floor(n))*2-1;};
    const id=serial++,spread=config.spread+(config.endSpread-config.spread)*t;
    const lateral=noise(id+1)*spread;
    x+=Math.cos(yaw)*lateral;z-=Math.sin(yaw)*lateral;
    const radius=Math.max(.12,(config.width+(config.endWidth-config.width)*t)/2*(1+noise(id+91)*config.variation));
    const y=floor(x,z);
    if(y===null)return;
    // Do not span voids, curbs or neighboring road levels.
    for(const [dx,dz] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){
      const h=floor(x+dx,z+dz);if(h===null||Math.abs(h-y)>1.2)return;
    }
    if(patches.length>=256)patches.shift();
    patches.push({id,x,y,z,radius,born:time,expires:time+config.lifetime});
  }
  return {config,patches,pickups,contact,floor,
    get time(){return time;},get inventory(){return inventory;},get pouring(){return pourLeft>0;},
    grant(){if(!pourLeft)inventory=true;},
    startPour(){if(pourLeft>0)return false;pourTotal=pourLeft=config.pourDuration;lastDrop=null;return true;},
    use(){if(!inventory||pourLeft>0)return false;inventory=false;pourTotal=pourLeft=config.pourDuration;lastDrop=null;return true;},
    cancelPour(){pourLeft=0;lastDrop=null;},
    reset(){time=0;inventory=false;pourLeft=0;lastDrop=null;patches.length=0;pickups.forEach(p=>p.readyAt=0);},
    step(dt,state,previous=state,emitter=state){
      time+=dt;
      for(let i=patches.length-1;i>=0;i--)if(patches[i].expires<=time)patches.splice(i,1);
      if(!inventory&&!pourLeft){
        const dx=state.x-previous.x,dz=state.z-previous.z,length2=dx*dx+dz*dz;
        for(const p of pickups){
          if(p.readyAt>time)continue;
          const t=length2?clamp(((p.x-previous.x)*dx+(p.z-previous.z)*dz)/length2,0,1):0;
          const x=previous.x+t*dx,z=previous.z+t*dz;
          if(Math.hypot(p.x-x,p.z-z)<1.6&&Math.abs(state.y-p.y)<2.5){inventory=true;p.readyAt=time+config.respawn;break;}
        }
      }
      if(pourLeft>0){
        const rear=2.9*(emitter.modelScale??.75),x=emitter.x-Math.sin(emitter.yaw)*rear,z=emitter.z-Math.cos(emitter.yaw)*rear;
        if(!lastDrop){drop(x,z,emitter.yaw);lastDrop={x,z};}
        else{
          const distance=Math.hypot(x-lastDrop.x,z-lastDrop.z),spacing=Math.max(.2,config.spacing);
          if(distance>12){lastDrop=null;} // Recovery/teleport must not paint across the map.
          else if(distance>=spacing){
            const n=Math.floor(distance/spacing),a=lastDrop;
            for(let i=1;i<=n;i++)drop(a.x+(x-a.x)*i*spacing/distance,a.z+(z-a.z)*i*spacing/distance,emitter.yaw);
            lastDrop={x:a.x+(x-a.x)*n*spacing/distance,z:a.z+(z-a.z)*n*spacing/distance};
          }
        }
        pourLeft=Math.max(0,pourLeft-dt);if(!pourLeft)lastDrop=null;
      }
    },
  };
}
