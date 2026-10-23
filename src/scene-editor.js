import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {createRetroRoom,ROOM_SCALE} from './retro-room.js';
import {createRetroLighting} from './retro-lighting.js';
import {createPrintPass} from './retro-print.js';
import {retroStyle} from './retro-style.js';
import {createZudModel} from './zud-model.js';
import {createNatureGarden} from './nature-garden.js';
import {createSceneDocument,catalog,categories,assetUrl,isVisible} from './scene-document.js';
import {createPropLighting} from './scene-interactions.js';
import './scene-editor.css';
import {editorNavigation,setupEditorInteractions,createEditorNotice} from './editor-ui.js';

export async function createSceneEditor() {
  const home=new URL(location.href);home.searchParams.delete('edit');home.searchParams.delete('debug');home.searchParams.delete('model-debug');
  document.title='Editar escena · Zud';
  document.body.innerHTML=`<main class="scene-editor">
    <header class="se-header studio-header"><h1 class="studio-sr">Editar escena</h1>${editorNavigation('scene')}<div class="se-header-actions"><span class="se-save studio-save" id="se-save" role="status">Preparando escena…</span><a id="se-home">Volver al cuarto</a></div></header>
    <aside id="se-library" class="se-library" aria-label="Biblioteca de objetos"><div class="se-tabs" role="tablist" aria-label="Contenido"><button role="tab" id="se-catalog-tab" aria-controls="se-catalog-panel" aria-selected="true">Catálogo <span>${catalog.length}</span></button><button role="tab" id="se-scene-tab" aria-controls="se-scene-panel" aria-selected="false">En escena</button><button role="tab" id="se-originals-tab" aria-controls="se-originals-panel" aria-selected="false">Originales</button></div>
      <section id="se-catalog-panel" role="tabpanel" aria-labelledby="se-catalog-tab"><div class="se-library-tools"><label class="se-search"><span>⌕</span><input id="se-search" type="search" placeholder="Buscar un objeto…" aria-label="Buscar modelos"></label><select id="se-category" aria-label="Categoría"><option value="">Todas las categorías</option>${Object.entries(categories).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select><div class="se-library-caption"><span id="se-count" role="status">${catalog.length} objetos</span><span>+ para agregar</span></div></div><div id="se-catalog" class="se-catalog"></div><div id="se-empty" class="se-search-empty" hidden><strong>No encontramos ese objeto</strong><span>Probá otro nombre o explorá todas las categorías.</span><button id="se-clear-search">Limpiar filtros</button></div></section>
      <section id="se-scene-panel" role="tabpanel" aria-labelledby="se-scene-tab" hidden><p class="se-note">Seleccioná un objeto para editarlo. Cada objeto se mueve y se quita por separado, incluidos los accesorios.</p><div id="se-objects" class="se-objects"></div></section>
      <section id="se-originals-panel" role="tabpanel" aria-labelledby="se-originals-tab" hidden><p class="se-note">Volvé a agregar los originales que quitaste. Conservan su última posición y sus colores.</p><div id="se-originals" class="se-objects"></div></section>
    </aside>
    <section id="se-viewport" class="se-viewport" aria-label="Escena 3D"><canvas id="se-canvas" tabindex="0" aria-label="Editor 3D: clic para seleccionar; arrastrá las flechas para mover; arrastrá el fondo para girar."></canvas>
      <div id="se-replacing" class="se-replacing" hidden><span></span><button id="se-cancel-replace">Cancelar</button></div>
      <div class="se-toolbar" role="toolbar" aria-label="Herramientas de escena"><button id="se-undo" title="Deshacer (Ctrl/⌘ Z)" aria-label="Deshacer" disabled>↶</button><button id="se-redo" title="Rehacer (Ctrl/⌘ Shift Z)" aria-label="Rehacer" disabled>↷</button><span></span><button id="se-center">Centrar vista</button><button id="se-grid" aria-pressed="false">Cuadrícula</button></div>
      <div class="se-mobile-nav"><button data-panel="se-library">Explorar objetos ↓</button><button data-panel="se-inspector">Propiedades ↓</button></div><p class="se-hint"><span class="studio-pointer-hint">Clic: seleccionar · Arrastrar fondo: girar · Rueda: zoom</span><span class="studio-touch-hint">Tocá para seleccionar · Arrastrá para girar · Pellizcá para zoom</span></p><div id="se-loading" class="se-loading" role="status">Preparando tu cuarto…</div>
    </section>
    <aside id="se-inspector" class="se-inspector" aria-label="Propiedades del objeto"><button class="se-preview-return" data-panel="se-viewport">↑ Volver a la vista 3D</button><span class="se-eyebrow">OBJETO SELECCIONADO</span><h2 id="se-selection">Tu próximo cambio.</h2><p id="se-selection-note" class="se-note">Elegí un objeto del cuarto o agregá uno del catálogo.</p>
      <div id="se-empty-selection" class="se-empty-selection"><strong>Empezá por un objeto</strong><p>Seleccionalo en la vista 3D o explorá los que ya están en tu cuarto.</p><button id="se-browse-objects">Ver objetos de la escena →</button></div><fieldset id="se-fields" disabled hidden><legend class="se-sr">Transformar objeto</legend><div class="se-modes" role="group" aria-label="Transformación"><button data-mode="translate" title="Mover (W)" aria-pressed="true">Mover <kbd>W</kbd></button><button data-mode="rotate" title="Girar (E)" aria-pressed="false">Girar <kbd>E</kbd></button><button data-mode="scale" title="Escalar (R)" aria-pressed="false">Escalar <kbd>R</kbd></button></div>
      <p class="se-field-title">Posición <span>X / Y / Z</span></p><div class="se-vector">${['x','y','z'].map(axis=>`<label>${axis.toUpperCase()}<input type="number" step="0.05" min="-20" max="20" data-position="${axis}" aria-label="Posición ${axis.toUpperCase()}"></label>`).join('')}</div>
      <label class="se-field">Giro Y <span><input id="se-rotation" type="number" step="15" min="-3600" max="3600" aria-label="Giro Y"> °</span></label>
      <label class="se-field">Escala uniforme <input id="se-scale" type="number" min="0.05" max="5" step="0.05"></label>
      <div class="se-supports"><button id="se-floor">Apoyar en piso</button><button id="se-desk">A altura de mesa</button></div>
      <div class="se-colors"><p class="se-field-title">Colores</p><div id="se-colors"></div><button id="se-reset-colors">Restablecer colores</button></div>
      <label class="se-check"><input id="se-snap" type="checkbox"> Ajustar a pasos de 0,1 / 15°</label>
      <div class="se-object-actions"><button id="se-replace">Reemplazar objeto</button><button id="se-delete">Quitar de la escena</button></div></fieldset>
      <div class="se-insert"><label for="se-support">Agregar nuevos objetos en</label><select id="se-support"><option value="auto">Su apoyo recomendado</option><option value="floor">Piso · Y 0,09</option><option value="desk">Mesa · Y 1,18</option><option value="wall">Pared · Y 1,90</option></select></div>
      <div class="se-document"><span class="se-eyebrow">TU ESCENA</span><p class="se-note">Se guarda automáticamente en este navegador. Volvé al cuarto para verla.</p><div><button id="se-export">Exportar JSON</button><button id="se-import">Importar JSON</button></div><input id="se-file" type="file" accept=".json,application/json" hidden><button id="se-reset">Restaurar escena base</button><p class="se-note">Las lámparas se encienden al oscurecer. La suculenta y el terrario crecen con el riego en el cuarto.</p></div>
      <div class="se-insert"><label for="se-light-preview">Vista previa de la luz</label><select id="se-light-preview"><option value="day">Día</option><option value="night">Noche</option><option value="blinds">Persiana baja</option></select></div>
      <p id="se-status" class="se-status" role="status" aria-live="polite"></p>
    </aside></main>`;
  setupEditorInteractions();
  const $=selector=>document.querySelector(selector);
  $('#se-home').href=home.pathname+home.search;
  const canvas=$('#se-canvas'),viewport=$('.se-viewport');
  let renderer;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:true});}catch{
    $('#se-loading').textContent='No se pudo abrir la vista 3D. Activá la aceleración gráfica y recargá.';return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene(),overlay=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4,4,4,-4,.1,80);
  const lighting=createRetroLighting(scene,{renderer}),room=createRetroRoom({bindLighting:lighting.bind});scene.add(room.room);lighting.bind(room.room);
  const nature=createNatureGarden({bindLighting:lighting.bind});scene.add(nature.garden);
  const zud=createZudModel(),actor=new THREE.Group();actor.add(zud.root);actor.scale.setScalar(ROOM_SCALE);actor.position.set(.25,.12,.5);scene.add(actor);lighting.bind(zud.root);
  lighting.setEnvironment({patches:room.bouncePatches,blockers:room.bounceBlockers,lights:room.lights});
  const print=createPrintPass(renderer),orbit=new OrbitControls(camera,canvas);
  orbit.minPolarAngle=.25;orbit.maxPolarAngle=1.48;orbit.minZoom=.5;orbit.maxZoom=3;orbit.enableDamping=false;
  const gizmo=new TransformControls(camera,canvas);gizmo.setSize(.85);overlay.add(gizmo.getHelper());
  const outline=new THREE.Box3Helper(new THREE.Box3(),0x75924c);outline.material.depthTest=false;outline.visible=false;overlay.add(outline);
  const grid=new THREE.GridHelper(4.9,49,0x6f824f,0x9d9e8b);grid.position.set(.1,.095,.1);grid.material.transparent=true;grid.material.opacity=.35;grid.visible=false;scene.add(grid);
  let dirty=true,selected=null,replacing=false,busy=false,ready=false,history=[],future=[],pointer=null,wasDragging=false;
  const invalidate=()=>{dirty=true;renderer.shadowMap.needsUpdate=true;};
  await room.ready;
  const doc=createSceneDocument(room,{onLoad:object=>{lighting.bind(object);object.traverse(mesh=>{if(mesh.isMesh&&mesh.castShadow&&!room.bounceBlockers.includes(mesh))room.bounceBlockers.push(mesh);});invalidate();}});
  const propLighting=createPropLighting(room,doc);
  const status=createEditorNotice($('#se-status'));
  function center(){orbit.target.set(0,1.1,0);camera.position.set(9,8,9);camera.zoom=1;camera.updateProjectionMatrix();orbit.update();invalidate();}
  function resize(){const {width,height}=viewport.getBoundingClientRect(),aspect=width/height,frustum=Math.max(9.3,9/aspect);camera.left=-frustum*aspect/2;camera.right=frustum*aspect/2;camera.top=frustum/2;camera.bottom=-frustum/2;camera.updateProjectionMatrix();renderer.setSize(width,height,false);retroStyle.setPixelRatio(renderer.getPixelRatio());invalidate();}
  new ResizeObserver(resize).observe(viewport);center();resize();
  function updateFields(){
    $('#se-fields').disabled=!selected||busy;$('#se-fields').hidden=!selected;$('#se-empty-selection').hidden=Boolean(selected);gizmo.enabled=ready&&!busy;
    $('#se-selection').textContent=selected?.label??'Tu próximo cambio.';
    $('#se-selection-note').textContent=selected?(selected.builtin?'Objeto original del cuarto':'Modelo del catálogo · '+categories[catalog.find(m=>m.id===selected.model).category]):'Elegí un objeto del cuarto o agregá uno del catálogo.';
    if(selected){const object=selected.object;for(const axis of ['x','y','z'])$(`[data-position="${axis}"]`).value=object.position[axis].toFixed(3);$('#se-rotation').value=THREE.MathUtils.radToDeg(object.rotation.y).toFixed(1);$('#se-scale').value=object.scale.x.toFixed(3);outline.box.setFromObject(object);}
    renderColors();
    outline.visible=Boolean(selected);
    $('#se-undo').disabled=busy||!history.length;$('#se-redo').disabled=busy||!future.length;
    for(const button of document.querySelectorAll('[data-model],#se-import,#se-reset,#se-support,#se-export'))button.disabled=busy;
    for(const button of document.querySelectorAll('[data-restore]'))button.disabled=busy||doc.entries.get(button.dataset.restore).object.visible;
    invalidate();
  }
  function objectsList(){
    $('#se-objects').replaceChildren();
    renderOriginals();
    for(const entry of doc.entries.values())if(isVisible(entry.object)){
      const button=document.createElement('button');button.dataset.object=entry.id;button.setAttribute('aria-pressed',String(selected===entry));
      const label=document.createElement('span');label.textContent=entry.label;const tag=document.createElement('small');tag.textContent=entry.builtin?'Original':'Catálogo';button.append(label,tag);button.addEventListener('click',()=>select(entry));$('#se-objects').append(button);
    }
  }
  function renderOriginals(){
    $('#se-originals').replaceChildren();
    for(const entry of doc.entries.values())if(entry.builtin){
      const button=document.createElement('button');button.dataset.restore=entry.id;button.disabled=busy||entry.object.visible;
      button.setAttribute('aria-label',`Agregar original: ${entry.label}`);
      const label=document.createElement('span');label.textContent=entry.label;const tag=document.createElement('small');tag.textContent=entry.object.visible?'En escena':'+ Agregar';button.append(label,tag);
      button.onclick=()=>operation(async()=>{const before=doc.snapshot();select(doc.restoreOriginal(entry.id));commit(before,'Objeto original recuperado.');});$('#se-originals').append(button);
    }
  }
  let colorSignature='';
  function renderColors(){
    const signature=(selected?.id??'')+JSON.stringify(selected?.colors??{});
    if(signature===colorSignature)return;colorSignature=signature;$('#se-colors').replaceChildren();
    if(!selected?.colorSlots.length){$('#se-colors').textContent='Este objeto no tiene colores editables.';return;}
    selected.colorSlots.forEach((slot,index)=>{
      const label=document.createElement('label');label.className='se-field';const span=document.createElement('span');span.textContent=slot.label==='Retro Print · diffuse'?`Superficie ${index+1}`:slot.label;
      const input=document.createElement('input');input.type='color';input.dataset.color=index;input.value=selected.colors[index]??'#'+slot.source.color.getHexString();input.setAttribute('aria-label',`Color ${index+1}: ${span.textContent}`);
      input.onchange=()=>{const before=doc.snapshot();doc.setColor(selected,index,input.value);commit(before,'Color guardado.');};label.append(span,input);$('#se-colors').append(label);
    });
  }
  function select(entry){selected=entry;replacing=false;$('#se-replacing').hidden=true;gizmo.detach();if(entry)gizmo.attach(entry.object);objectsList();updateFields();if(entry&&matchMedia('(max-width:600px)').matches)$('#se-inspector').scrollIntoView({block:'start'});}
  function save(){try{doc.save();$('#se-save').textContent='✓ Guardado en este navegador';}catch{$('#se-save').textContent='Sin guardar';status('No se pudo guardar en el navegador. Exportá el JSON para conservar tu escena.',true);}}
  function commit(before,message){const after=doc.snapshot();if(JSON.stringify(before)!==JSON.stringify(after)){history.push(before);if(history.length>50)history.shift();future=[];status(message);save();}objectsList();updateFields();}
  async function operation(fn,trigger){if(busy||!ready)return;busy=true;trigger?.setAttribute('aria-busy','true');updateFields();try{await fn();}catch(error){status(error.message||'No se pudo cargar el modelo. Intentá de nuevo.',true);}finally{busy=false;trigger?.removeAttribute('aria-busy');updateFields();}}
  function tab(which){for(const name of ['catalog','scene','originals']){$(`#se-${name}-tab`).setAttribute('aria-selected',String(name===which));$(`#se-${name}-tab`).tabIndex=name===which?0:-1;$(`#se-${name}-panel`).hidden=name!==which;}}
  tab('catalog');
  $('#se-browse-objects').onclick=()=>{tab('scene');$('#se-scene-tab').focus();};
  for(const button of document.querySelectorAll('[data-panel]'))button.onclick=()=>{const panel=$('#'+button.dataset.panel);panel.scrollIntoView({block:'start'});const target=panel.querySelector('canvas,button:not(:disabled),input:not(:disabled)');target?.focus({preventScroll:true});};
  $('#se-catalog-tab').onclick=()=>tab('catalog');$('#se-scene-tab').onclick=()=>tab('scene');$('#se-originals-tab').onclick=()=>tab('originals');
  for(const name of ['catalog','scene','originals'])$(`#se-${name}-tab`).onkeydown=event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const tabs=['catalog','scene','originals'],next=tabs[(tabs.indexOf(name)+(event.key==='ArrowRight'?1:2))%3];tab(next);$(`#se-${next}-tab`).focus();}};
  function renderCatalog(){
    const query=$('#se-search').value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase(),category=$('#se-category').value;
    const models=catalog.filter(item=>(!category||item.category===category)&&item.name.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().includes(query));
    $('#se-catalog').replaceChildren();$('#se-count').textContent=`${models.length} objetos`;$('#se-empty').hidden=models.length>0;
    for(const model of models){const button=document.createElement('button');button.className='se-card';button.dataset.model=model.id;button.disabled=busy;button.setAttribute('aria-label',`Agregar ${model.name}`);
      const img=document.createElement('img');img.src=assetUrl(`previews/${model.preview}`);img.alt='';img.loading='lazy';img.width=160;img.height=125;
      const label=document.createElement('span');label.textContent=model.name;const plus=document.createElement('b');plus.textContent='+';plus.setAttribute('aria-hidden','true');button.append(img,label,plus);
      button.onclick=()=>operation(async()=>{const before=doc.snapshot(),old=replacing?selected:null;status(`Cargando ${model.name}…`,false,{pending:true});const support=$('#se-support').value;const entry=await doc.add(model.id,{replace:old,support:support==='auto'?model.support:support});select(entry);commit(before,old?'Objeto reemplazado. Podés ajustar su posición.':'Objeto agregado. Arrastrá las flechas para ubicarlo.');},button);$('#se-catalog').append(button);
    }
  }
  $('#se-clear-search').onclick=()=>{$('#se-search').value='';$('#se-category').value='';renderCatalog();$('#se-search').focus();};
  $('#se-search').oninput=renderCatalog;$('#se-category').onchange=renderCatalog;renderCatalog();
  $('#se-replace').onclick=()=>{if(!selected)return;replacing=true;$('#se-replacing span').textContent=`Reemplazar «${selected.label}»: elegí un modelo`;$('#se-replacing').hidden=false;tab('catalog');$('#se-search').focus();};
  $('#se-cancel-replace').onclick=()=>{replacing=false;$('#se-replacing').hidden=true;};
  function change(fn,message='Transformación guardada.'){if(!selected||busy)return;const before=doc.snapshot();fn(selected.object);doc.markEdited(selected);commit(before,message);}
  for(const input of document.querySelectorAll('[data-position]'))input.onchange=()=>{const value=Number(input.value);if(input.value===''||!Number.isFinite(value)||Math.abs(value)>20){updateFields();return;}change(object=>object.position[input.dataset.position]=value);};
  $('#se-rotation').onchange=event=>{const value=Number(event.target.value);if(event.target.value===''||!Number.isFinite(value)||Math.abs(value)>3600){updateFields();return;}change(object=>object.rotation.y=THREE.MathUtils.degToRad(value));};
  $('#se-scale').onchange=event=>{const value=Number(event.target.value);if(event.target.value===''||!Number.isFinite(value)||value<.05||value>5){updateFields();return;}change(object=>object.scale.setScalar(value));};
  function support(y){change(object=>{room.room.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object),point=object.getWorldPosition(new THREE.Vector3());point.y+=y-box.min.y;object.position.copy(object.parent.worldToLocal(point));},'Objeto apoyado.');}
  $('#se-reset-colors').onclick=()=>{if(!selected||busy)return;const before=doc.snapshot();doc.resetColors(selected);commit(before,'Colores originales recuperados.');};
  $('#se-light-preview').onchange=event=>{const value=event.target.value;room.setTime(value==='night'?1410:610);if(room.blindsClosed!==(value==='blinds'))room.interactables.find(item=>item.action==='blinds').activate();invalidate();};
  $('#se-floor').onclick=()=>support(.09);$('#se-desk').onclick=()=>support(1.18);
  function setMode(mode){gizmo.setMode(mode);gizmo.showX=mode!=='rotate';gizmo.showZ=mode!=='rotate';gizmo.showY=true;for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));invalidate();}
  for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>setMode(button.dataset.mode);
  $('#se-snap').onchange=event=>{gizmo.setTranslationSnap(event.target.checked?.1:null);gizmo.setRotationSnap(event.target.checked?Math.PI/12:null);gizmo.setScaleSnap(event.target.checked?.1:null);};
  function remove(){if(!selected||busy)return;const before=doc.snapshot();doc.remove(selected);select(null);commit(before,'Objeto quitado. Podés recuperarlo con Deshacer.');}
  $('#se-delete').onclick=remove;
  async function travel(from,to){if(!from.length)return;await operation(async()=>{const target=from.at(-1),before=doc.snapshot();await doc.apply(target);from.pop();to.push(before);select(null);save();status('Escena actualizada.');});}
  $('#se-undo').onclick=()=>travel(history,future);$('#se-redo').onclick=()=>travel(future,history);
  $('#se-center').onclick=center;$('#se-grid').onclick=()=>{grid.visible=!grid.visible;$('#se-grid').setAttribute('aria-pressed',String(grid.visible));invalidate();};
  $('#se-reset').onclick=()=>operation(async()=>{const before=doc.snapshot();await doc.apply(doc.base());select(null);commit(before,'Escena base restaurada. Podés deshacer este cambio.');});
  $('#se-export').onclick=()=>{const blob=new Blob([JSON.stringify(doc.snapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='zud-escena.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Escena exportada.');};
  $('#se-import').onclick=()=>$('#se-file').click();$('#se-file').onchange=event=>{const file=event.target.files[0];event.target.value='';if(!file)return;operation(async()=>{if(file.size>250000)throw new Error('El JSON debe pesar menos de 250 KB.');const before=doc.snapshot();await doc.apply(JSON.parse(await file.text()));select(null);commit(before,'Escena importada y guardada.');});};
  let dragBefore;
  gizmo.addEventListener('dragging-changed',event=>{orbit.enabled=!event.value;});
  gizmo.addEventListener('mouseDown',()=>{dragBefore=doc.snapshot();wasDragging=true;});
  gizmo.addEventListener('objectChange',()=>{if(selected){for(const axis of ['x','y','z']){selected.object.position[axis]=THREE.MathUtils.clamp(selected.object.position[axis],-20,20);selected.object.scale[axis]=THREE.MathUtils.clamp(selected.object.scale[axis],.05,5);}updateFields();}});
  gizmo.addEventListener('mouseUp',()=>{if(selected&&dragBefore){doc.markEdited(selected);commit(dragBefore,'Transformación guardada.');dragBefore=null;}});
  orbit.addEventListener('change',invalidate);gizmo.addEventListener('change',invalidate);
  const ray=new THREE.Raycaster();
  canvas.addEventListener('pointerdown',event=>{pointer={x:event.clientX,y:event.clientY};wasDragging=Boolean(gizmo.dragging);});
  canvas.addEventListener('pointerup',event=>{if(!pointer||busy||!ready||wasDragging||event.button!==0||Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>5){pointer=null;return;}pointer=null;
    const rect=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    const hits=ray.intersectObjects([...doc.entries.values()].filter(e=>isVisible(e.object)).map(e=>e.object),true);
    for(const hit of hits){if(!isVisible(hit.object)||hit.object.userData.hitArea)continue;for(let node=hit.object;node;node=node.parent){const entry=[...doc.entries.values()].find(e=>e.object===node);if(entry){select(entry);return;}}}select(null);
  });
  canvas.addEventListener('pointercancel',()=>{pointer=null;});
  document.addEventListener('keydown',event=>{if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)||event.target.isContentEditable||busy||!ready)return;
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();travel(event.shiftKey?future:history,event.shiftKey?history:future);}
    else if(event.key==='Escape'){select(null);}
    else if(event.key==='Delete'||event.key==='Backspace'){if(event.target!==canvas)return;event.preventDefault();remove();}
    else if(selected&&!event.metaKey&&!event.ctrlKey){const mode={w:'translate',e:'rotate',r:'scale'}[event.key.toLowerCase()];if(mode)setMode(mode);}
  });
  updateFields();
  await Promise.all([room.ready,nature.ready]);
  try{const restored=await doc.restore();$('#se-save').textContent=restored?'✓ Escena recuperada':'Escena base aplicada';}catch{status('No se pudo recuperar la escena guardada. Podés importar un JSON o restaurar la escena original.',true);$('#se-save').textContent='No se pudo recuperar';}
  ready=true;$('.scene-editor').dataset.ready='true';$('#se-loading').hidden=true;objectsList();updateFields();
  room.update(false,0,0,{dt:1,reducedMotion:true,editing:true});
  renderer.setAnimationLoop(()=>{if(!dirty||document.hidden)return;dirty=false;room.room.updateMatrixWorld(true);camera.updateMatrixWorld();
    room.update(false,0,0,{dt:1,reducedMotion:true,editing:true});propLighting.update(1-room.daylight);
    // Only attached props should contribute after undo/replacement.
    room.bounceBlockers.splice(0,room.bounceBlockers.length,...room.bounceBlockers.filter(mesh=>{let node=mesh;while(node&&node!==room.room)node=node.parent;return Boolean(node);}));
    lighting.update(0,{room:true,cycle:room.cycle,daylight:room.daylight,reducedMotion:true,force:true});room.outside.render(renderer,camera);
    if(isVisible(room.mirror))room.mirror.renderReflection(renderer,scene,camera);
    print.render(scene,camera,{samples:0});renderer.autoClear=false;renderer.clearDepth();renderer.render(overlay,camera);renderer.autoClear=true;
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer.setAnimationLoop(null);status('La vista 3D se pausó. Recargá para recuperar los cambios guardados.',true);});
}
