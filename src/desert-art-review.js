// Development-only, fixed driver-height views for repeatable art comparisons.
// Loaded only with an explicit ?artView camera key. No racing input is simulated.
export function mountDesertArtReview({key,world,state,camera,vehicle,app}){
  const views={
    station:{x:-12.87,z:-300.17,yaw:-1.678},
    water:{x:294.3,z:-83.4,yaw:2.9},
    mountain:{x:-140.9,z:-29.3,yaw:-.55},
    houses:{x:-170,z:130,yaw:-.85},
    riverEnd:{x:270,z:-285,yaw:-2.76},
    riverReturn:{x:203.68146,z:-349.35947,yaw:2.95823},
    skyHigh:{x:-140.9,z:-29.3,yaw:-1.570796,height:25,lookHeight:90},
    train:{x:-237.66,z:16,yaw:0},
  };
  const view=views[key]??views.station;
  const ground=world.surfaceHeight(view.x,view.z)??0;
  Object.assign(state,{x:view.x,y:ground+.65,z:view.z,yaw:view.yaw,speed:0,throttle:0,vx:0,vz:0});
  camera.fov=62;camera.position.set(view.x,ground+(view.height??2.6),view.z);
  camera.lookAt(view.x+Math.sin(view.yaw)*70,ground+(view.lookHeight??3.2),view.z+Math.cos(view.yaw)*70);
  camera.updateProjectionMatrix();camera.updateMatrixWorld();
  vehicle.root.visible=false;world.lod.update(state,0,true);
  app.dataset.artView=key;
  const style=document.createElement('style');style.textContent='.flight-app>*:not(canvas):not(.art-review-nav),body>.flight-scale{display:none!important}.art-review-nav{position:fixed;bottom:12px;left:12px;display:flex;gap:8px;z-index:99}.art-review-nav a{font:12px monospace;color:white;background:#17252cbb;padding:8px 12px;text-decoration:none;border-radius:5px}';document.head.append(style);
  const nav=document.createElement('nav');nav.className='art-review-nav';nav.ariaLabel='Vistas de arte';
  for(const [name,label]of Object.entries({station:'Estación',water:'Río',mountain:'Montaña',houses:'Casas',riverEnd:'Proa',riverReturn:'Retorno',skyHigh:'Cielo alto',train:'Tren'})){const a=document.createElement('a'),url=new URL(location.href);url.searchParams.set('artView',name);url.searchParams.set('selection','map');a.href=url.href;a.textContent=label;nav.append(a);}
  app.append(nav);
  app.dataset.artCamera=JSON.stringify({position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov});
}
