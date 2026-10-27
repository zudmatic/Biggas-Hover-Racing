import {attribute} from 'three/tsl';
import {createOilMaterial} from '../../fx/oil/oil-material';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createDialKit} from '../../tools/dials/dev-dials';
import {createFlightShip} from '../../content/vehicles/flight-ship';
import {createOilSimulation,updateOilResistance,clearOilEffect} from '../../sim/oil-simulation';
import './oil-gameplay.css';

export async function createFlightOil({scene,landscape,surfaceHeight,app,clearInput,onPrepare,onNotice,materialFactory}){
  const base=import.meta.env.BASE_URL;
  const results=await Promise.allSettled([new GLTFLoader().loadAsync(`${base}models/items/oil-barrel.glb`),createFlightShip('037',{exhaust:false})]);
  if(results.some(r=>r.status==='rejected')){
    if(results[1].status==='fulfilled')results[1].value.dispose();
    throw results.find(r=>r.status==='rejected').reason;
  }
  const template=results[0].value.scene,botShip=results[1].value;
  const root=new THREE.Group();root.name='Barriles y aceite';scene.add(root);
  const sim=createOilSimulation({landscape,surfaceHeight});
  let pourOwner='player';
  let enabled=false,botEnabled=true,lookingBack=false,phase='loading',scale=.75,botDistance=0,hits=0,lastContact=false;
  const bot={x:0,y:0,z:0,yaw:0,pitch:0,roll:0,speed:0,hover:.65,oilFactor:1,oilContact:false};
  root.add(botShip.root);
  const marker=new THREE.Mesh(new THREE.ConeGeometry(.35,.7,4),new THREE.MeshBasicMaterial({color:0xffb154}));
  marker.rotation.z=Math.PI;root.add(marker);
  template.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const haloGeometry=new THREE.TorusGeometry(.8,.065,4,20),haloMaterial=new THREE.MeshBasicMaterial({color:0xe7cc83});
  const barrels=sim.pickups.map(p=>{
    const group=new THREE.Group(),barrel=template.clone(true);barrel.scale.setScalar(.85);group.add(barrel);
    const halo=new THREE.Mesh(haloGeometry,haloMaterial);halo.rotation.x=Math.PI/2;halo.position.y=-.12;group.add(halo);
    group.position.set(p.x,p.y+1,p.z);root.add(group);return group;
  });
  // One bounded draw for all patches. Every perimeter vertex is projected onto
  // the actual road surface, so oil follows ramps instead of floating above them.
  const positions=new Float32Array(256*24*3),colors=new Float32Array(256*24*4),uvs=new Float32Array(256*24*2);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(colors,4).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
  // World-space shading keeps overlapping drops visually continuous. A thin-film
  // sheen and broad sky highlight vary with viewing angle, without tiled pixels.
  const oilMaterial=materialFactory?materialFactory():createOilMaterial(attribute('color','vec4').a);
  const oilMesh=new THREE.Mesh(geometry,oilMaterial);oilMesh.frustumCulled=false;oilMesh.renderOrder=2;root.add(oilMesh);
  const panel=document.createElement('section');panel.className='flight-oil';panel.setAttribute('aria-label','Barril de aceite');
  panel.innerHTML=`<div class="oil-heading"><span class="oil-drop" aria-hidden="true">◆</span><strong>ACEITE</strong><span class="oil-slot">Vacío</span></div><button class="oil-use" disabled>Soltar aceite <kbd>Q</kbd></button><p class="oil-hint">Recogé un barril en la pista</p><details class="oil-tools"><summary>Pruebas de aceite</summary><div class="oil-test"><button class="oil-prepare">Preparar prueba</button><button class="oil-bot-drop">Bot tira aceite</button><button class="oil-look" aria-pressed="false">Mirar atrás</button><label><input class="oil-bot-toggle" type="checkbox" checked> Bot de prueba</label><output class="oil-bot-status">Bot listo</output></div></details><output class="oil-player-status">Tu velocidad: 0 km/h</output>`;
  app.append(panel);
  const $=s=>panel.querySelector(s),button=$('.oil-use'),slot=$('.oil-slot'),hint=$('.oil-hint'),status=$('.oil-bot-status');
  panel.addEventListener('pointerdown',clearInput);panel.addEventListener('keydown',e=>{if(e.code!=='Escape')e.stopPropagation();});
  const label=document.createElement('div');label.className='oil-bot-label';label.textContent='BOT DE PRUEBA';app.append(label);
  function positionBot(){
    const road=landscape.atDistance(botDistance);bot.x=road.x;bot.z=road.z;bot.y=(surfaceHeight(road.x,road.z)??road.y)+.65;bot.yaw=Math.atan2(road.nx,road.nz);bot.pitch=Math.atan(road.grade);
  }
  function behindPlayer(player){botDistance=landscape.roadAt(player.x,player.z).distance-15;bot.speed=sim.config.botSpeed;clearOilEffect(bot);lastContact=false;positionBot();}
  function use(){if(enabled&&phase==='flying'&&sim.use()){pourOwner='player';onNotice('Aceite · dejando estela');}}
  const focusDrive=()=>app.querySelector('.flight-canvas').focus({preventScroll:true});
  button.onclick=()=>{use();focusDrive();};
  $('.oil-look').onclick=()=>{lookingBack=!lookingBack;$('.oil-look').setAttribute('aria-pressed',String(lookingBack));$('.oil-look').textContent=lookingBack?'Mirar adelante':'Mirar atrás';focusDrive();};
  $('.oil-prepare').onclick=()=>{if(enabled&&phase==='flying')onPrepare();};
  $('.oil-bot-drop').onclick=()=>{if(enabled&&phase==='flying')onPrepare(true);};
  $('.oil-bot-toggle').onchange=e=>{botEnabled=e.target.checked;if(!botEnabled&&pourOwner==='bot')sim.cancelPour();};
  const presets={
    Fuerte:{Ancho:3.5,Ralentizacion:65,Vertido:2.5,Duracion:5,Forma:{AnchoFinal:.8,DispersionInicial:1.1,DispersionFinal:.05,Separacion:.5,Variacion:15,Evolucion:1},Respuesta:{Entrada:.15,Recuperacion:1.5}},
    Salpicado:{Ancho:1.3,Ralentizacion:75,Vertido:3,Duracion:5,Forma:{AnchoFinal:.5,DispersionInicial:1.8,DispersionFinal:.1,Separacion:1.8,Variacion:35,Evolucion:.7},Respuesta:{Entrada:.1,Recuperacion:2}},
    Clasico:{Ancho:2.6,Ralentizacion:30,Vertido:2,Duracion:5,Forma:{AnchoFinal:2.6,DispersionInicial:0,DispersionFinal:0,Separacion:.8,Variacion:0,Evolucion:1},Respuesta:{Entrada:.21,Recuperacion:1}},
  };
  const dials=createDialKit('Aceite · prueba',{
    Ancho:[3.5,.3,5,.1],Vertido:[1,0,10,.1],Duracion:[6,0,10,.1],
    Ralentizacion:[55,0,95,1],VelocidadBot:[40,8,40,1],
    Forma:{_collapsed:true,AnchoFinal:[.8,.3,5,.1],DispersionInicial:[1.1,0,2.5,.1],DispersionFinal:[.1,0,2.5,.1],Separacion:[1,.2,4,.1],Variacion:[30,0,60,1],Evolucion:[2,.3,3,.1]},
    Respuesta:{_collapsed:true,Entrada:[.05,.05,2,.05],Recuperacion:[.5,.1,4,.1]},
    Fuerte:{type:'action',label:'Probar: fuerte y fina'},Salpicado:{type:'action',label:'Probar: salpicado'},Clasico:{type:'action',label:'Volver al clásico'},
  },{id:'oil-settings',persist:true,defaultCollapsed:true,onAction:key=>{if(presets[key])dials.setValues(presets[key]);}});
  const unsubscribe=dials.subscribe(v=>Object.assign(sim.config,{width:v.Ancho,pourDuration:Math.max(0,Math.min(10,v.Vertido)),lifetime:Math.max(0,Math.min(10,v.Duracion)),slowdown:v.Ralentizacion/100,botSpeed:v.VelocidadBot,
    endWidth:v.Forma.AnchoFinal,spread:v.Forma.DispersionInicial,endSpread:v.Forma.DispersionFinal,spacing:v.Forma.Separacion,variation:v.Forma.Variacion/100,taper:v.Forma.Evolucion,entryTime:v.Respuesta.Entrada,recoveryTime:v.Respuesta.Recuperacion}));
  function drawOil(){
    let at=0;
    function vertex(x,y,z,u,v,a){positions[at*3]=x;positions[at*3+1]=y+.025;positions[at*3+2]=z;colors.set([1,1,1,a],at*4);uvs.set([u,v],at*2);at++;}
    for(const p of sim.patches){
      const opacity=Math.min(1,(p.expires-sim.time)/.8)*.95;
      const points=Array.from({length:8},(_,i)=>{const angle=i*Math.PI/4,r=p.radius*(.87+.1*Math.sin(i*7+p.id*3));const x=p.x+Math.cos(angle)*r,z=p.z+Math.sin(angle)*r;return [x,surfaceHeight(x,z)??p.y,z,.5+(x-p.x)/(2*p.radius),.5+(z-p.z)/(2*p.radius)];});
      for(let i=0;i<8;i++){
        vertex(p.x,p.y,p.z,.5,.5,opacity);vertex(...points[i],opacity);vertex(...points[(i+1)%8],opacity);
      }
    }
    geometry.setDrawRange(0,at);geometry.attributes.position.needsUpdate=true;geometry.attributes.color.needsUpdate=true;geometry.attributes.uv.needsUpdate=true;
  }
  const projected=new THREE.Vector3();
  return {sim,bot,botShip,use,get lookingBack(){return enabled&&lookingBack;},
    reset(player,active){pourOwner='player';lookingBack=false;$('.oil-look').setAttribute('aria-pressed','false');$('.oil-look').textContent='Mirar atrás';enabled=active;root.visible=active;sim.reset();hits=0;behindPlayer(player);clearOilEffect(player);},
    prepare(player,botDrops=false){
      sim.reset();hits=0;behindPlayer(player);pourOwner=botDrops?'bot':'player';
      if(botDrops){botEnabled=true;$('.oil-bot-toggle').checked=true;botDistance=landscape.roadAt(player.x,player.z).distance+12;positionBot();sim.startPour();}
      else sim.grant();
    },
    cancelPour(){sim.cancelPour();},
    beforeStep(player,dt){updateOilResistance(player,enabled&&sim.contact(player),dt,sim.config.slowdown,sim.config);},
    step(dt,player,previous){
      if(!enabled)return;
      const hadItem=sim.inventory;sim.step(dt,player,previous,pourOwner==='bot'?{...bot,modelScale:scale}:player);
      if(!hadItem&&sim.inventory)onNotice('Barril recogido · Q para soltar aceite');
      if(botEnabled){
        const touching=sim.contact(bot);updateOilResistance(bot,touching,dt,sim.config.slowdown,sim.config);
        if(touching&&!lastContact){hits++;onNotice('El bot pisó aceite');}lastContact=touching;
        bot.speed+=(sim.config.botSpeed*bot.oilFactor-bot.speed)*(1-Math.exp(-dt*5));botDistance+=bot.speed*dt;positionBot();
      }
    },
    update(player,camera,nextPhase,modelScale,reduced){
      phase=nextPhase;scale=modelScale;panel.hidden=!enabled||!['flying','paused'].includes(phase);
      // The Bulldog cameo frames only the hero ship; the test bot rejoins at the grid.
      const cameo=phase==='intro';root.visible=enabled&&!cameo;
      button.disabled=phase!=='flying'||!sim.inventory||sim.pouring;$('.oil-prepare').disabled=phase!=='flying';$('.oil-bot-drop').disabled=phase!=='flying';
      slot.textContent=sim.pouring?(pourOwner==='bot'?'Bot vertiendo…':'Vertiendo…'):sim.inventory?'1 barril':'Vacío';
      hint.textContent=player.oilContact?'En aceite · velocidad reducida':sim.pouring?(pourOwner==='bot'?'Seguí al bot y atravesá la estela':'La estela queda detrás de tu nave'):sim.inventory?'Listo para usar':'Recogé un barril en la pista';
      status.textContent=!botEnabled?'Bot desactivado':`Bot ${Math.round(bot.speed*3.6)} km/h · ${bot.oilContact?'EN ACEITE':hits?`${hits} impactos`:'siguiendo pista'}`;
      $('.oil-player-status').textContent=`Tu velocidad: ${Math.round(player.speed*3.6)} km/h · ${player.oilContact?'EN ACEITE':player.oilFactor<.98?'recuperando':'normal'}`;
      panel.dataset.slow=String(player.oilContact);
      app.dataset.oilContact=String(player.oilContact);app.dataset.oilSource=pourOwner;app.dataset.oilEnabled=String(enabled);app.dataset.oilInventory=String(sim.inventory);app.dataset.oilPouring=String(sim.pouring);app.dataset.oilPatches=String(sim.patches.length);app.dataset.oilTime=sim.time.toFixed(2);app.dataset.oilFactor=(player.oilFactor??1).toFixed(3);
      app.dataset.botOilHits=String(hits);app.dataset.botSpeed=bot.speed.toFixed(2);app.dataset.botOil=String(bot.oilContact);app.dataset.botDistance=botDistance.toFixed(2);
      if(!enabled||cameo){label.hidden=true;return;}
      barrels.forEach((mesh,i)=>{mesh.visible=sim.pickups[i].readyAt<=sim.time;mesh.position.y=sim.pickups[i].y+1+(reduced?0:Math.sin(sim.time*2+i)*.12);mesh.rotation.y=reduced?0:sim.time*.55;});
      botShip.root.visible=marker.visible=botEnabled;botShip.root.scale.setScalar(scale);botShip.root.position.set(bot.x,bot.y,bot.z);botShip.root.rotation.set(-bot.pitch,bot.yaw,0,'YXZ');
      marker.position.set(bot.x,bot.y+4*scale,bot.z);marker.material.color.setHex(bot.oilContact?0xff643e:0xffb154);
      botShip.update(sim.time,bot.speed,false,reduced,bot);
      projected.set(bot.x,bot.y+4.7*scale,bot.z).project(camera);label.hidden=!botEnabled||projected.z>1||Math.abs(projected.x)>.95||Math.abs(projected.y)>.9;
      label.style.transform=`translate(${(projected.x*.5+.5)*innerWidth}px,${(-projected.y*.5+.5)*innerHeight}px) translate(-50%,-100%)`;
      label.textContent=bot.oilContact?'BOT · EN ACEITE':'BOT DE PRUEBA';drawOil();
    },
    drawMap(ctx,half){if(!enabled||!botEnabled)return;ctx.fillStyle=bot.oilContact?'#ff643e':'#ffbb65';ctx.beginPath();ctx.arc((bot.x/half+1)*96,(bot.z/half+1)*96,3.5,0,Math.PI*2);ctx.fill();},
    dispose(){
      unsubscribe();dials.destroy();botShip.dispose();geometry.dispose();oilMaterial.dispose();haloGeometry.dispose();haloMaterial.dispose();marker.geometry.dispose();marker.material.dispose();
      const gs=new Set(),ms=new Set(),ts=new Set();template.traverse(o=>{if(o.isMesh){gs.add(o.geometry);for(const m of [].concat(o.material)){ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v);}}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());root.removeFromParent();panel.remove();label.remove();
    },
  };
}
