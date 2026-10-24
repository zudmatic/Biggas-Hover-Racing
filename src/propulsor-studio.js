import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createDialRoot} from 'dialkit/vanilla';
import 'dialkit/vanilla/styles.css';
import {createFlightShip} from './flight-ship.js';
import {createCharacterComic} from './character-comic.js';
import {createFlightHeat} from './flight-heat.js';
import {createExhaustControls} from './flight-exhaust-controls.js';
import './propulsor-studio.css';

document.body.innerHTML=`<header><a href="./simulator.html">← Volver al juego</a><h1>Propulsión <small>ESTUDIO</small></h1><span id="status" role="status">Cargando nave…</span></header>
<main><section class="stage"><canvas aria-label="Vista del propulsor"></canvas><p class="hint">Arrastrá para girar · rueda para acercar</p></section>
<aside class="settings"><h2>Banco de pruebas</h2><a href="http://localhost:43181/">Abrir prueba Three-VFX ↗</a><label>Nave<select id="ship"><option value="033">033 · dos toberas</option><option value="037">Oliva · tres toberas</option></select></label>
<label>Prueba<select id="mode"><option value="idle">Reposo</option><option value="cruise">Aceleración</option><option value="boost" selected>Turbo</option><option value="brake">Frenado</option><option value="cycle">Ciclo automático</option></select></label>
<div class="buttons"><button id="pause">Pausar</button><button id="reset">Reiniciar ciclo</button></div>
<label>Velocidad de animación<select id="rate"><option value="1">Normal</option><option value="0.25">Cámara lenta · ¼</option><option value="0.5">Cámara lenta · ½</option></select></label>
<label><input id="turn" type="checkbox"> Simular giro</label><label><input id="comic" type="checkbox" checked> Acabado cómic</label>
<label>Fondo<select id="background"><option value="dark">Oscuro</option><option value="light">Claro</option><option value="grid" selected>Cuadrícula · ver calor</option></select></label>
<div class="buttons"><button data-view="rear">Trasera</button><button data-view="side">Lateral</button><button data-view="three">¾</button></div>
<p>Los ajustes del propulsor se comparten con el juego al recargarlo.</p><div id="dials"></div></aside></main>`;
const $=s=>document.querySelector(s),canvas=$('canvas'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.1,150);
scene.add(new THREE.HemisphereLight(0xe3f3ff,0x574439,2));const key=new THREE.DirectionalLight(0xffe9cb,3);key.position.set(4,8,-3);scene.add(key);
const grid=new THREE.GridHelper(30,30,0x648c95,0x40545c);grid.position.y=-.4;scene.add(grid);
const backdrop=new THREE.GridHelper(30,40,0x7fa0a7,0x526b73);backdrop.rotation.x=Math.PI/2;backdrop.position.z=5;scene.add(backdrop);
const orbit=new OrbitControls(camera,canvas);orbit.target.set(0,.8,-1.8);orbit.enableDamping=true;
function view(name){camera.position.set(...({rear:[0,3,-12],side:[10,3,-3],three:[7,4,-10]}[name]));orbit.update();}view('three');
const comic=createCharacterComic(renderer),heat=createFlightHeat(renderer),dialRoot=createDialRoot({target:$('#dials'),mode:'inline',defaultOpen:true,theme:'dark'});
let ship,controls,loading=0,time=0,paused=false,disposed=false,last=performance.now();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
async function load(id){const token=++loading;$('#status').textContent='Cargando nave…';
  try{const next=await createFlightShip(id);if(disposed||token!==loading){next.dispose();return;}
    controls?.dispose();ship?.dispose();ship=next;scene.add(ship.root);controls=createExhaustControls(ship.exhaust,heat,{collapsed:false});time=0;
    document.body.dataset.ready='true';document.body.dataset.ship=id;$('#status').textContent='Listo para probar';
  }catch(error){$('#status').textContent='No se pudo cargar la nave. Cambiá la selección para reintentar.';console.error(error);}
}
$('#ship').onchange=e=>load(e.target.value);$('#pause').onclick=()=>{paused=!paused;$('#pause').textContent=paused?'Continuar':'Pausar';};$('#reset').onclick=()=>{time=0;};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
function background(){const value=$('#background').value;scene.background=new THREE.Color(value==='light'?'#d9d2bb':'#192b33');grid.visible=backdrop.visible=value==='grid';}$('#background').onchange=background;background();
const resize=new ResizeObserver(()=>{const box=canvas.parentElement.getBoundingClientRect();renderer.setSize(box.width,box.height,false);camera.aspect=box.width/box.height;camera.updateProjectionMatrix();});resize.observe(canvas.parentElement);
renderer.setAnimationLoop(now=>{
  const dt=Math.min((now-last)/1000,.05);last=now;if(!paused)time+=dt*Number($('#rate').value);orbit.update();if(!ship)return;
  let mode=$('#mode').value;if(mode==='cycle')mode=['idle','cruise','boost','brake'][Math.floor(time/2)%4];
  const speed=mode==='idle'?0:mode==='cruise'?28:mode==='boost'?60:8,boost=mode==='boost';
  ship.root.rotation.y=$('#turn').checked&&!reduced.matches?Math.sin(time*.8)*.55:0;
  ship.update(time,speed,boost,reduced.matches,{braking:mode==='brake'});scene.updateMatrixWorld(true);camera.updateMatrixWorld();
  document.body.dataset.time=time.toFixed(3);document.body.dataset.mode=mode;
  heat.render(()=>{if($('#comic').checked)comic.render(scene,camera,`#${scene.background.getHexString()}`);else renderer.render(scene,camera);},{ship,camera,time,reduced:reduced.matches,boost,depthTexture:$('#comic').checked?()=>comic.depthTexture:null});
});
load('033');
window.addEventListener('pagehide',()=>{disposed=true;renderer.setAnimationLoop(null);resize.disconnect();controls?.dispose();dialRoot.destroy();ship?.dispose();heat.dispose();comic.dispose();orbit.dispose();grid.geometry.dispose();grid.material.dispose();backdrop.geometry.dispose();backdrop.material.dispose();renderer.dispose();},{once:true});
