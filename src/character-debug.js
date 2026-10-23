import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {editableGeometry,patternTexture,createCharacterMaterials,updateCharacterMaterials} from './character-surfaces.js';
import {createZudModel} from './zud-model.js';
import {createZudAnimator} from './zud-animation.js';
import {CHARACTER_DEFAULTS,CHARACTER_BASE_REVISION,geometryFromQuality,CHARACTER_STORAGE,readCharacterDocument,normalizeCharacterSettings} from './character-settings.js';
import {SURFACE_FAMILIES} from './surface-library.js';
import {HAT_CATALOG,HAT_DEFAULTS,hatDefaults,hatAssetUrl} from './hat-catalog.js';
import {createCharacterHats} from './character-hats.js';
import {ARM_CATALOG,ARM_COLOR_FIELDS,armColorsFor} from './arm-catalog.js';
import {createCharacterArms} from './character-arms.js';
import {EYE_DEFAULTS} from './eye-settings.js';
import {smoothHipNormals} from './zud-hip-normals.js';
import {createCharacterComic} from './character-comic.js';
import './character-debug.css';
import {editorNavigation,setupEditorInteractions,createEditorNotice} from './editor-ui.js';

const select=(key,label,options)=>`<label class="lab-field"><span>${label}</span><select data-setting="${key}">${Object.entries(options).map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select></label>`;
const range=(key,label,min,max,step=.01)=>`<label class="lab-field"><span>${label}</span><span class="lab-range"><input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}"><output></output></span></label>`;
const color=(key,label)=>`<label class="lab-field"><span>${label}</span><input type="color" data-setting="${key}"></label>`;
const toggle=(key,label)=>`<label class="lab-field"><span>${label}</span><input type="checkbox" data-setting="${key}"></label>`;
const textures={none:'Sin textura',...Object.fromEntries(Object.entries(SURFACE_FAMILIES).map(([key,preset])=>[key,preset.label])),knit:'Tejido anterior',noise:'Grano anterior',checker:'Cuadrícula UV',custom:'Imagen propia'};
const HAT_SAVED_STORAGE='zud-hat-adjustments-v1';
const armOptions={none:'Brazo original',...Object.fromEntries(ARM_CATALOG.map(arm=>[arm.id,`${arm.name} · ${arm.type}`]))};
const hatSettings=value=>Object.fromEntries([...Object.keys(HAT_DEFAULTS),'hatSize','showHat'].map(key=>[key,value[key]]));

export async function createCharacterDebug() {
  let settings={...CHARACTER_DEFAULTS},textureData=null,migrated=false,storageError=false;
  try{
    const stored=localStorage.getItem(CHARACTER_STORAGE);
    if(stored){const json=JSON.parse(stored),data=readCharacterDocument(json);settings=data.settings;textureData=data.texture;
      if(json.baseRevision!==CHARACTER_BASE_REVISION){Object.assign(settings,geometryFromQuality(CHARACTER_DEFAULTS.meshQuality),{comicShader:CHARACTER_DEFAULTS.comicShader});migrated=true;}}
  }catch{storageError=true;}
  const savedHats={};
  try{
    const stored=JSON.parse(localStorage.getItem(HAT_SAVED_STORAGE));
    if(stored?.version===1)for(const {id} of HAT_CATALOG){
      const value=stored.hats?.[id];
      if(value?.hatModel===id)savedHats[id]=hatSettings(normalizeCharacterSettings(value));
    }
  }catch{storageError=true;}
  const home=new URL(location.href);home.searchParams.delete('edit');home.searchParams.delete('debug');home.searchParams.delete('model-debug');
  document.title='Zud Lab · Editor de personaje';
  document.body.innerHTML=`<main class="lab">
    <header class="lab-header studio-header"><h1 class="studio-sr">Editar personaje</h1>${editorNavigation('character')}<div class="lab-header-actions"><span id="lab-save" class="studio-save" role="status">Preparando personaje…</span><a id="lab-home">Volver al cuarto</a></div></header>
    <section class="lab-viewport" aria-label="Vista previa del personaje"><canvas class="lab-canvas" tabindex="0" aria-label="Modelo 3D. Arrastrá para girar y usá la rueda para acercarte."></canvas>
      <div class="lab-scene-title"><span class="lab-badge" id="lab-stats"></span></div>
      <div class="lab-view-buttons" role="group" aria-label="Vistas de cámara"><button data-view="front">Frente</button><button data-view="side">Perfil</button><button data-view="back">Espalda</button><button data-view="reset">Centrar</button></div>
      <p class="lab-hint"><span class="studio-pointer-hint">Arrastrá para girar · Rueda para zoom · Botón derecho para desplazar</span><span class="studio-touch-hint">Arrastrá para girar · Pellizcá para zoom</span></p><div class="lab-loading">Preparando a Zud…</div>
    </section>
    <aside class="lab-panel" aria-label="Editor de personaje"><span class="lab-eyebrow">PERSONALIZAR</span><h2 style="margin-top:8px">A tu manera.</h2><p class="lab-intro">Probá, girá, cambiá de idea.<br>Los cambios se guardan en este navegador.</p>
      <nav class="lab-section-nav" aria-label="Secciones del personaje">${[['look','Apariencia'],['eyes','Mirada'],['hats','Sombrero'],['arms','Brazos'],['shape','Forma'],['studio','Estudio']].map(([id,label])=>`<button data-section="${id}" aria-controls="lab-section-${id}">${label}</button>`).join('')}<button class="lab-preview-return" id="lab-preview-return">↑ Volver al personaje</button></nav><details class="lab-quality" aria-label="Detalle y curvas"><summary>Detalle y curvas</summary>
        ${range('meshQuality','Detalle y curvas',0,100,1)}
        <div class="lab-quality-scale"><span>Low poly</span><span>High poly</span><span>Curvas</span></div>
        <p class="lab-note" id="lab-quality-description"></p>
      </details>
      <details id="lab-section-eyes" class="lab-eyes"><summary>Mirada y expresión</summary>
        ${range('eyeOpening','Apertura',0,1)}${range('eyeTilt','Inclinación (°)',-15,40,1)}
        ${range('pupilSize','Tamaño de pupila',.5,1.5)}
        ${range('gazeX','Mirada horizontal',-1,1)}${range('gazeY','Mirada vertical',-1,1)}
        ${range('eyeDepth','Relieve del ojo',0,.05,.001)}${toggle('eyeBlink','Parpadeo automático')}
        <div class="lab-eye-actions"><button class="lab-secondary" id="lab-blink">Probar parpadeo</button><button class="lab-secondary" id="lab-eye-reset">Restaurar mirada</button></div>
        <p class="lab-note">Los párpados recortan las pupilas y conservan el volumen al cerrar. La mirada se guarda con esta variante.</p>
      </details>
      <details id="lab-section-arms" class="lab-arms"><summary>Brazos / Colección de 5</summary>
        <p class="lab-note">Tres prótesis robóticas y dos armaduras. Elegí un modelo para cada lado o combiná dos distintos.</p>
        ${['armRight','armLeft'].map(side=>`${select(side,side==='armRight'?'Brazo derecho':'Brazo izquierdo',armOptions)}
        <div data-arm-colors="${side}" hidden>
          ${color(`${side}Color`,'Color principal')}${color(`${side}TrimColor`,'Bordes y placas')}${color(`${side}AccentColor`,'Detalles y luces')}
          <button class="lab-secondary" data-arm-colors-reset="${side}">Restaurar colores ${side==='armRight'?'del derecho':'del izquierdo'}</button>
        </div>`).join('')}
        <p class="lab-note">Los lados son los de Zud: de frente, su brazo derecho queda a tu izquierda.</p>
        <div class="lab-arm-descriptions" aria-live="polite"></div>
        <button class="lab-secondary" id="lab-arm-swap">Intercambiar brazos ⇄</button>
        <button class="lab-secondary" id="lab-arm-reset">Quitar brazos especiales</button>
      </details>
      <details class="lab-comic"><summary>Acabado visual</summary>
        ${toggle('comicShader','Ver todo en cómic')}
        <p class="lab-note">Tinta, tramado y contornos del cuarto sobre el personaje completo, incluidos brazos y sombreros. Desactivá para comparar.</p>
      </details>
      <details id="lab-section-hats" class="lab-hats"><summary>Sombreros / Colección de ${HAT_CATALOG.length}</summary>
        ${select('hatModel','Equipar',{beanie:'Gorro original',none:'Sin sombrero',...Object.fromEntries(HAT_CATALOG.map(hat=>[hat.id,hat.name]))})}
        <figure class="lab-hat-preview" hidden><img alt="" width="100" height="100"><figcaption></figcaption></figure>
        <p class="lab-note lab-hat-status" role="status" aria-live="polite"></p>
        <button class="lab-secondary" id="lab-hat-retry" hidden>Reintentar carga</button>
        ${range('hatSize','Tamaño',.75,1.4)}${toggle('showHat','Mostrar sombrero')}
        <div id="lab-hat-adjustments">
          ${toggle('hatAutoFit','Ajustar a la cabeza')}${range('hatCrownHeight','Altura de copa',.8,1.2)}
          <p class="lab-note">El ajuste adapta la abertura a la cabeza al cambiar tamaño, posición o inclinación. La altura de copa cambia la silueta sin levantar el borde.</p>
          ${range('hatOffsetX','Posición lateral',-.3,.3)}${range('hatOffsetY','Posición vertical',-.35,.35)}${range('hatOffsetZ','Adelante / atrás',-.3,.3)}
          ${range('hatYaw','Giro (°)',-180,180,1)}${range('hatTilt','Inclinación (°)',-25,25,1)}
          ${color('hatTint','Tinte')}${range('hatRoughness','Rugosidad',0,1)}${range('hatMetalness','Metal',0,1)}
          <button class="lab-secondary" id="lab-hat-reset">Restablecer ajustes del sombrero</button>
          <p class="lab-note">El tinte conserva los colores y detalles del diseño. Al elegir un sombrero se recuperan sus ajustes guardados, o los originales si todavía no guardaste ninguno.</p>
          <button class="lab-secondary lab-hat-copy" id="lab-hat-copy">Guardar y copiar ajustes</button>
          <p class="lab-note">Guardá este ajuste para este sombrero y pegalo en el chat para pedir que sea el predeterminado.</p>
          <p class="lab-note" id="lab-hat-copy-status" role="status" aria-live="polite"></p>
          <textarea id="lab-hat-copy-text" aria-label="Configuración del sombrero para copiar" readonly hidden spellcheck="false"></textarea>
        </div>
        <p class="lab-note">Tu sombrero y sus ajustes se guardan automáticamente y se ven al volver al cuarto.</p>
      </details>
      <details><summary>Geometría</summary>
        ${toggle('wireframe','Ver malla (wireframe)')}
        <p class="lab-note">El deslizador superior ajusta polígonos, sombreado y curvatura de la misma malla base.</p>
      </details>
      <details id="lab-section-look"><summary>Colores y texturas</summary>
        ${select('material','Material',{standard:'Físico (PBR)',toon:'Toon',normal:'Normales'})}
        ${color('skinColor','Cuerpo')}${color('hatColor','Gorro original')}${color('eyeColor','Ojos')}${color('pupilColor','Pupilas')}
        ${range('roughness','Rugosidad',0,1)}${range('metalness','Metal',0,1)}
        ${select('skinTexture','Textura cuerpo',textures)}${select('hatTexture','Textura gorro original',textures)}
        ${range('textureScale','Repetición',1,16,1)}${range('bump','Relieve',0,.5)}
        <p class="lab-note">Las familias comparten escala con el cuarto. Piel: grano fino. Tejido: puntos suaves. Repetición y relieve ajustan cada receta proporcionalmente.</p>
        <button class="lab-secondary" id="lab-texture">Cargar textura propia…</button><input type="file" id="lab-texture-file" accept="image/png,image/jpeg,image/webp" hidden>
        <p class="lab-note">PNG, JPG o WebP, hasta 5 MB. Se aplica al gorro; también podés elegirla para el cuerpo. El color tiñe la textura.</p>
      </details>
      <details id="lab-section-shape"><summary>Proporciones y partes</summary>
        ${range('width','Ancho',.7,1.3)}${range('height','Altura',.7,1.3)}${range('headSize','Cabeza',.8,1.2)}
        ${toggle('showPompom','Mostrar pompón')}${toggle('showEyes','Mostrar ojos')}
      </details>
      <details id="lab-section-studio"><summary>Estudio y movimiento</summary>
        ${select('pose','Pose',{idle:'Reposo',walk:'Caminata',wave:'Saludo',jump:'Salto',dance:'Baile',sleep:'Dormido'})}${toggle('animate','Animar pose')}${toggle('rotate','Giro automático')}
        ${toggle('grid','Cuadrícula de piso')}${color('background','Fondo')}${range('light','Luz principal',.5,6,.1)}
      </details>
      <p class="lab-note">Los brazos y el sombrero equipados se comparten con el cuarto. Los cambios de cuerpo, proporciones y estudio son una variante local. Exportá el JSON para conservarla o compartirla.</p>
      <div class="lab-actions"><button id="lab-export">Exportar JSON ↓</button><button id="lab-import">Importar JSON ↑</button><button id="lab-reset">Restaurar base</button></div>
      <input type="file" id="lab-import-file" accept=".json,application/json" hidden><p class="lab-status" role="status" aria-live="polite"></p>
    </aside></main>`;
  setupEditorInteractions();
  document.querySelector('#lab-home').href=home.pathname+home.search+home.hash;
  const viewport=document.querySelector('.lab-viewport'),canvas=document.querySelector('.lab-canvas');
  const status=document.querySelector('.lab-status'),stats=document.querySelector('#lab-stats');
  const message=createEditorNotice(status);
  const saveStatus=(text,error=false)=>{const badge=document.querySelector('#lab-save');badge.textContent=text;badge.dataset.error=String(error);};
  const sectionButtons=[...document.querySelectorAll('[data-section]')];
  const sections=[...document.querySelectorAll('[id^="lab-section-"]')];
  const markSection=id=>sectionButtons.forEach(button=>{
    if('lab-section-'+button.dataset.section===id)button.setAttribute('aria-current','location');
    else button.removeAttribute('aria-current');
  });
  for(const button of sectionButtons)button.addEventListener('click',()=>{
    const section=document.querySelector('#lab-section-'+button.dataset.section);section.open=true;
    section.scrollIntoView({block:'start'});section.querySelector('summary').focus({preventScroll:true});markSection(section.id);
  });
  let sectionFrame;
  const trackSection=()=>{
    cancelAnimationFrame(sectionFrame);
    sectionFrame=requestAnimationFrame(()=>{
      const edge=document.querySelector('.lab-section-nav').getBoundingClientRect().bottom+24;
      const current=sections.filter(section=>section.getBoundingClientRect().top<=edge).at(-1);
      markSection(current?.id);
    });
  };
  document.querySelector('.lab-panel').addEventListener('scroll',trackSection,{passive:true});
  window.addEventListener('scroll',trackSection,{passive:true});
  window.addEventListener('resize',trackSection);
  document.querySelector('#lab-preview-return').onclick=()=>{viewport.scrollIntoView({block:'start'});canvas.focus({preventScroll:true});};
  let renderer;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:true});}
  catch{document.querySelector('.lab-loading').textContent='Activá WebGL y recargá para abrir el estudio.';return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const comic=createCharacterComic(renderer);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,100);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.minDistance=3;controls.maxDistance=16;controls.maxPolarAngle=Math.PI*.85;
  controls.autoRotateSpeed=1.4;
  const resetCamera=(view='reset')=>{
    controls.target.set(0,1.6,0);
    const direction={front:[0,0,1],side:[1,0,0],back:[0,0,-1],reset:[.43,.15,1]}[view];
    document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
    camera.position.copy(new THREE.Vector3(...direction).normalize().multiplyScalar(innerWidth<=560?9:7.6).add(controls.target));controls.update();
  };
  resetCamera();
  controls.addEventListener('start',()=>document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed','false')));
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>resetCamera(button.dataset.view)));
  const hemisphere=new THREE.HemisphereLight(0xffffff,0x747365,2.2);scene.add(hemisphere);
  const key=new THREE.DirectionalLight(0xfff3df,3);key.position.set(3,6,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.025;scene.add(key);
  const fill=new THREE.DirectionalLight(0xc8daff,1.6);fill.position.set(-4,3,-2);scene.add(fill);
  const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer),environmentMap=pmrem.fromScene(environment);
  scene.environment=environmentMap.texture;environment.dispose();pmrem.dispose();
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:0x3b4233,opacity:.14}));floor.rotation.x=-Math.PI/2;floor.position.y=-.03;floor.receiveShadow=true;scene.add(floor);
  const grid=new THREE.GridHelper(14,28,0xb9beb0,0xc9cdbf);grid.position.y=.002;grid.material.transparent=true;grid.material.opacity=.42;scene.add(grid);
  // Transparent studio helpers must not leave opaque silhouettes in comic depth.
  floor.material.depthWrite=false;grid.material.depthWrite=false;
  const wrapper=new THREE.Group();scene.add(wrapper);
  const maps=new Map();
  for(const kind of [...Object.keys(SURFACE_FAMILIES),'knit','noise','checker'])maps.set(kind,patternTexture(kind));
  const configureTexture=texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());};
  maps.forEach(configureTexture);
  const textureFromData=async data=>{const texture=await new THREE.TextureLoader().loadAsync(data);configureTexture(texture);return texture;};
  if(textureData){try{maps.set('custom',await textureFromData(textureData));}catch{textureData=null;for(const key of ['skinTexture','hatTexture'])if(settings[key]==='custom')settings[key]='none';storageError=true;}}
  let model,animator,headGroup,hat,pompom,hats,arms,meshes=[],ownedGeometries=[],ownedMaterials=[],lastGeometry='',lastMaterial='',disposed=false;
  const clearModel=()=>{
    if(!model)return;
    arms?.dispose();hats?.dispose();wrapper.remove(model.root);ownedGeometries.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());model.dispose();
    ownedGeometries=[];ownedMaterials=[];meshes=[];
  };
  const geometryKey=()=>`${settings.detail}:${settings.shading}:${Math.max(0,settings.meshQuality-75)}`;
  function rebuild() {
    clearModel();model=createZudModel({detail:settings.detail,curve:Math.max(0,(settings.meshQuality-75)/25),appearance:false});animator=createZudAnimator(model);wrapper.add(model.root);
    hat=model.root.getObjectByName('Beanie de Zud');pompom=hat.getObjectByName('Pompón');
    model.root.traverse(mesh=>{
      if(!mesh.isMesh||mesh.parent===model.laptop)return;
      const isEye=mesh.parent.parent===model.eyes,isHat=mesh.parent===hat;
      if(!isEye){mesh.geometry=editableGeometry(mesh.geometry,settings.shading==='smooth',mesh.scale);ownedGeometries.push(mesh.geometry);}
      mesh.castShadow=!isEye;mesh.receiveShadow=!isEye;
      meshes.push({mesh,part:isEye?mesh.userData.eyePart:isHat?'hat':'skin'});
    });
    if(settings.shading==='smooth')smoothHipNormals(model);
    model.eyeController.setHeadSurface(model.root.getObjectByName('Cabeza de Zud'));
    arms=createCharacterArms(model);
    hats=createCharacterHats(model,{onChange:({state,active})=>{
      viewport.dataset.hatState=state;viewport.dataset.hat=active;
      document.querySelector('.lab-hat-status').textContent=state==='loading'?'Cargando sombrero…':state==='error'?'No se pudo cargar el sombrero. Se muestra el gorro original.':'Listo · Se verá en el cuarto.';
      document.querySelector('#lab-hat-retry').hidden=state!=='error';
      updateStats();
    }});
    headGroup=new THREE.Group();headGroup.position.y=-.35;model.root.add(headGroup);model.root.updateMatrixWorld(true);
    for(const part of [model.root.getObjectByName('Cabeza de Zud'),hat,model.eyes,hats.anchor])headGroup.attach(part);
    lastGeometry=geometryKey();lastMaterial='';
  }
  function updateMaterials() {
    ownedMaterials.forEach(material=>material.dispose());ownedMaterials=[];
    const effectiveMaterial=settings.comicShader&&settings.material==='normal'?'standard':settings.material;
    const materialByPart=createCharacterMaterials({...settings,material:effectiveMaterial});
    ownedMaterials=Object.values(materialByPart);
    for(const {mesh,part} of meshes)mesh.material=materialByPart[part];
    lastMaterial=effectiveMaterial;
  }
  function apply() {
    if(lastGeometry!==geometryKey())rebuild();
    if(lastMaterial!==(settings.comicShader&&settings.material==='normal'?'standard':settings.material))updateMaterials();
    maps.forEach(texture=>texture.repeat.setScalar(settings.textureScale));
    updateCharacterMaterials(Object.fromEntries(meshes.map(({mesh,part})=>[part,mesh.material])),settings,maps);
    wrapper.scale.set(settings.width,settings.height,settings.width);headGroup.scale.setScalar(settings.headSize);hat.scale.setScalar(settings.hatSize);
    hats.update(settings);arms.update(settings);model.eyes.visible=settings.showEyes;model.eyeController.configure(settings);
    scene.background=new THREE.Color(settings.background);key.intensity=settings.light;grid.visible=settings.grid;controls.autoRotate=settings.rotate;
    updateStats();
  }
  function updateStats() {
    let triangles=0;model.root.traverseVisible(mesh=>{if(mesh.isMesh&&mesh.parent!==model.laptop)triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;});
    stats.textContent=`${Math.round(triangles).toLocaleString('es-AR')} triángulos · ${settings.shading==='flat'?'facetado':'suave'}`;
    viewport.dataset.quality=String(settings.meshQuality);
    viewport.dataset.detail=settings.detail;viewport.dataset.triangles=String(triangles);viewport.dataset.material=settings.material;viewport.dataset.shading=settings.shading;
    viewport.dataset.armLeft=settings.armLeft;viewport.dataset.armRight=settings.armRight;viewport.dataset.comic=String(settings.comicShader);
  }
  const fields=[...document.querySelectorAll('[data-setting]')];
  function refresh() {
    const q=settings.meshQuality;
    document.querySelector('#lab-quality-description').textContent=q>75?(q===100?'Modelo final · Curvas al máximo.':'Curvas: redondeo progresivo de la geometría, conservando el diseño base.'):q>=75?'High poly.':q>=50?'Más polígonos y sombreado suave sobre la malla base.':q>=25?'Malla base · Conserva la silueta y las partes originales.':'Low poly · Cuerpo simplificado y gorro base conservado.';
    for(const input of fields){const value=settings[input.dataset.setting];if(input.type==='checkbox')input.checked=value;else input.value=value;
      const output=input.parentElement.querySelector('output');if(output)output.value=Number(value).toFixed(input.step==='1'?0:input.step==='0.001'?3:2);
      const key=input.dataset.setting;input.disabled=['roughness','metalness'].includes(key)&&(settings.material!=='standard'||settings.comicShader)||['skinColor','hatColor','skinTexture','hatTexture','bump'].includes(key)&&settings.material==='normal'&&!settings.comicShader;
    }
    const selected=HAT_CATALOG.find(hat=>hat.id===settings.hatModel);
    const preview=document.querySelector('.lab-hat-preview');preview.hidden=!selected;
    if(selected){const img=preview.querySelector('img');const url=hatAssetUrl(selected.preview);if(img.getAttribute('src')!==url)img.src=url;img.alt=`Referencia de ${selected.name}`;preview.querySelector('figcaption').textContent=selected.name;}
    document.querySelector('#lab-hat-adjustments').hidden=!selected;
    document.querySelector('.lab-arm-descriptions').innerHTML=['armRight','armLeft'].map(key=>{
      const arm=ARM_CATALOG.find(entry=>entry.id===settings[key]);
      return arm?`<article class="lab-arm-card" style="--arm-color:${arm.color}"><span>${key==='armRight'?'Derecho':'Izquierdo'} / ${arm.type}</span><strong>${arm.name}</strong><p>${arm.description}</p></article>`:'';
    }).join('');
    for(const side of ['armRight','armLeft']) {
      document.querySelector(`[data-arm-colors="${side}"]`).hidden=settings[side]==='none';
      for(const [suffix,value] of Object.entries(armColorsFor(settings,side)))fields.find(input=>input.dataset.setting===`${side}${suffix}`).value=value;
      document.querySelector(`[data-arm-colors-reset="${side}"]`).disabled=!settings[`${side}CustomColors`];
    }
    document.querySelector('#lab-arm-swap').disabled=settings.armLeft==='none'&&settings.armRight==='none';
    document.querySelector('#lab-arm-reset').disabled=settings.armLeft==='none'&&settings.armRight==='none';
    // Normals are a diagnostic material. Comic needs the actual surface colors.
    fields.find(input=>input.dataset.setting==='material').disabled=settings.comicShader;
    for(const key of ['hatColor','hatTexture','showPompom'])fields.find(input=>input.dataset.setting===key).disabled ||=settings.hatModel!=='beanie';
  }
  const snapshot=()=>({version:1,baseRevision:CHARACTER_BASE_REVISION,settings:{...settings},texture:textureData});
  const save=()=>{try{localStorage.setItem(CHARACTER_STORAGE,JSON.stringify(snapshot()));saveStatus('✓ Guardado en este navegador');}catch{saveStatus('Sin guardar',true);message('No se pudo guardar en el navegador. Exportá el JSON para conservar tus cambios.',true);}};
  document.querySelector('#lab-home').addEventListener('click',()=>{clearTimeout(saveTimer);save();});
  let saveTimer;
  let copyRevision=0;
  const copyStatus=document.querySelector('#lab-hat-copy-status'),copyText=document.querySelector('#lab-hat-copy-text');
  const changed=()=>{saveStatus('Guardando…');copyRevision++;copyStatus.textContent='';copyText.hidden=true;apply();refresh();clearTimeout(saveTimer);saveTimer=setTimeout(save,250);};
  for(const input of fields)input.addEventListener('input',()=>{
    const key=input.dataset.setting,value=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;
    if(value==='custom'&&!maps.has('custom')){refresh();message('Cargá una imagen con «Cargar textura propia».',true);return;}
    const armSide=['armRight','armLeft'].find(side=>ARM_COLOR_FIELDS.some(suffix=>key===side+suffix));
    if(armSide){for(const [suffix,color] of Object.entries(armColorsFor(settings,armSide)))settings[armSide+suffix]=color;settings[`${armSide}CustomColors`]=true;}
    if(key==='hatModel')settings={...settings,...hatDefaults(value),...savedHats[value]};
    if(key==='meshQuality')Object.assign(settings,geometryFromQuality(value));
    else settings[key]=value;
    changed();
  });
  let blinkUntil=0;
  document.querySelector('#lab-blink').addEventListener('click',()=>{blinkUntil=performance.now()+180;});
  document.querySelector('#lab-eye-reset').addEventListener('click',()=>{Object.assign(settings,EYE_DEFAULTS);changed();});
  document.querySelector('#lab-hat-reset').addEventListener('click',()=>{const hatModel=settings.hatModel;settings={...settings,...hatDefaults(hatModel)};changed();});
  document.querySelector('#lab-arm-swap').addEventListener('click',()=>{
    for(const suffix of ['',...ARM_COLOR_FIELDS,'CustomColors'])[settings[`armLeft${suffix}`],settings[`armRight${suffix}`]]=[settings[`armRight${suffix}`],settings[`armLeft${suffix}`]];
    changed();
  });
  for(const button of document.querySelectorAll('[data-arm-colors-reset]'))button.addEventListener('click',()=>{settings[`${button.dataset.armColorsReset}CustomColors`]=false;changed();});
  document.querySelector('#lab-arm-reset').addEventListener('click',()=>{settings.armLeft=settings.armRight='none';changed();});
  document.querySelector('#lab-hat-retry').addEventListener('click',()=>hats.retry());
  document.querySelector('#lab-hat-copy').addEventListener('click',async()=>{
    const selected=HAT_CATALOG.find(hat=>hat.id===settings.hatModel);if(!selected)return;
    const revision=++copyRevision,values=hatSettings(settings);
    const text=JSON.stringify({version:1,hatName:selected.name,settings:values},null,2);
    savedHats[selected.id]=values;
    let saved=true;
    try{localStorage.setItem(HAT_SAVED_STORAGE,JSON.stringify({version:1,hats:savedHats}));}catch{saved=false;}
    clearTimeout(saveTimer);save();
    copyText.value=text;copyText.hidden=true;
    const result=saved?`${selected.name}: ajustes guardados en este navegador.`:'No se pudo guardar en este navegador.';
    try{
      await navigator.clipboard.writeText(text);
      if(revision===copyRevision)copyStatus.textContent=`${result} Copiados: pegalos en el chat.`;
    }catch{
      if(revision!==copyRevision)return;
      copyStatus.textContent=`${result} Copiá el texto de abajo y pegalo en el chat.`;
      copyText.hidden=false;copyText.focus();copyText.select();
    }
  });
  document.querySelector('#lab-reset').addEventListener('click',()=>{
    uploadRevision++;settings={...CHARACTER_DEFAULTS};textureData=null;maps.get('custom')?.dispose();maps.delete('custom');changed();resetCamera();
  });
  const download=(text,name)=>{
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  document.querySelector('#lab-export').addEventListener('click',()=>{download(JSON.stringify(snapshot(),null,2),'zud-character.json');message('Variante exportada con sus ajustes y textura.');});
  const importFile=document.querySelector('#lab-import-file'),textureFile=document.querySelector('#lab-texture-file');
  document.querySelector('#lab-import').addEventListener('click',()=>importFile.click());
  document.querySelector('#lab-texture').addEventListener('click',()=>textureFile.click());
  let uploadRevision=0;
  // Decode before committing, so an invalid file never replaces a working variant.
  importFile.addEventListener('change',async()=>{
    const file=importFile.files[0];importFile.value='';if(!file)return;const revision=++uploadRevision;clearTimeout(saveTimer);save();
    try{
      if(file.size>4000000)throw new Error('El JSON supera el límite de 4 MB.');
      const json=JSON.parse(await file.text());
      if(disposed||revision!==uploadRevision)return;
      const data=readCharacterDocument(json);
      const texture=data.texture?await textureFromData(data.texture):null;
      if(disposed||revision!==uploadRevision){texture?.dispose();return;}
      maps.get('custom')?.dispose();maps.delete('custom');if(texture)maps.set('custom',texture);
      textureData=data.texture;settings=data.settings;changed();
    }catch(error){message(error instanceof SyntaxError?'No se pudo leer el JSON. El modelo sigue igual.':error.message,true);}
  });
  textureFile.addEventListener('change',async()=>{
    const file=textureFile.files[0];textureFile.value='';if(!file)return;const revision=++uploadRevision;clearTimeout(saveTimer);save();
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Usá una imagen PNG, JPG o WebP de hasta 5 MB.');
      const bitmap=await createImageBitmap(file),size=Math.min(1,512/Math.max(bitmap.width,bitmap.height));
      const image=document.createElement('canvas');image.width=Math.max(1,Math.round(bitmap.width*size));image.height=Math.max(1,Math.round(bitmap.height*size));
      image.getContext('2d').drawImage(bitmap,0,0,image.width,image.height);bitmap.close();
      const data=image.toDataURL('image/png'),texture=await textureFromData(data);
      if(disposed||revision!==uploadRevision){texture.dispose();return;}
      maps.get('custom')?.dispose();maps.set('custom',texture);textureData=data;settings.hatTexture='custom';changed();
    }catch{message('No se pudo cargar la imagen. Usá PNG, JPG o WebP de hasta 5 MB.',true);}
  });
  apply();refresh();if(storageError)message('No se pudo recuperar el guardado. Podés seguir editando o importar un JSON.',true);
  saveStatus(storageError?'Revisá el guardado':'✓ Guardado automático',storageError);
  if(migrated)save();
  const resize=()=>{const {width,height}=viewport.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(viewport);resize();
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let last=performance.now(),time=0;
  function renderPreview() {
    if(settings.comicShader)comic.render(scene,camera,settings.background);
    else renderer.render(scene,camera);
  }
  renderer.setAnimationLoop(now=>{
    const dt=Math.min((now-last)/1000,.05);last=now;
    if(settings.animate&&!reducedMotion.matches)time+=dt;
    const poseTime=settings.animate?time:.6;
    animator.update({state:settings.pose,time:poseTime,elapsed:poseTime,dt,motion:1,
      gait:{weight:settings.pose==='walk'?1:0,phase:poseTime*7},
      blink:now<blinkUntil||settings.eyeBlink&&!reducedMotion.matches&&(now%4800)<150});
    viewport.dataset.eyeAperture=model.eyes.children[0].userData.aperture.toFixed(3);
    controls.autoRotate=settings.rotate&&!reducedMotion.matches;controls.update(dt);
    renderPreview();
  });
  viewport.dataset.ready='true';document.querySelector('.lab-loading').hidden=true;
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer.setAnimationLoop(null);message('La vista 3D se pausó. Recargá para recuperar tus ajustes guardados.',true);});
  window.addEventListener('pagehide',()=>{
    // A bfcache page must retain its renderer and observers for pageshow.
    if(saveTimer){clearTimeout(saveTimer);save();}
  });
  window.addEventListener('pagehide',event=>{
    if(event.persisted)return;
    disposed=true;uploadRevision++;renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();clearModel();
    comic.dispose();maps.forEach(texture=>texture.dispose());floor.geometry.dispose();floor.material.dispose();grid.geometry.dispose();grid.material.dispose();environmentMap.dispose();renderer.dispose();
  });
}
