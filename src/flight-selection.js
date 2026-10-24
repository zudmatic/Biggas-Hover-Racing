import {SHIPS,shipConfig} from './ship-catalog.js';
import {CIRCUIT_MAPS,circuitMap} from './circuit-maps.js';
import './flight-selection.css';
import {raceAudio} from './race-audio.js';
import {soundControlMarkup,mountSoundControl} from './sound-control.js';
import {createMenuMotion,createRaceEntryTransition} from './menu-motion.js';

const lock='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>';
const steps=['Inicio','Personaje','Vehículo','Mapa'];
const available={pilot:[{name:'Zud',image:'zud-face',id:'zud'}],vehicle:Object.values(SHIPS)};

function roster(kind,base){
  const items=available[kind];
  return `<div class="lobby-roster" role="group" aria-label="${kind==='pilot'?'Personajes':'Vehículos'}">${items.map((item,i)=>`<button class="lobby-slot ${i===0?'is-selected':''}" type="button" ${kind==='vehicle'?`data-vehicle-choice="${item.id}"`:''} aria-pressed="${i===0}" aria-label="${item.name}${i===0?', seleccionado':''}"><img data-lobby-image="${item.image}" src="${base}images/flight/${item.image}.png" alt=""><span class="lobby-slot-player" ${i?'hidden':''}>P1</span><span class="lobby-slot-name">${item.name}</span></button>`).join('')}${Array.from({length:9-items.length},(_,i)=>`<button class="lobby-slot is-locked" type="button" disabled aria-label="${kind==='pilot'?'Personaje':'Vehículo'} ${i+items.length+1}, bloqueado"><span class="lobby-slot-index">${String(i+items.length+1).padStart(2,'0')}</span><span class="lobby-mystery" aria-hidden="true">?</span><span class="lobby-slot-lock">${lock}</span></button>`).join('')}</div>`;
}

export function chooseFlight(){
  const base=import.meta.env.BASE_URL,reduced=matchMedia('(prefers-reduced-motion: reduce)'),controller=new AbortController(),{signal}=controller;
  let selectedVehicle=shipConfig(new URLSearchParams(location.search).get('vehicle')).id;
  let stage=0,selectedMap=circuitMap(new URLSearchParams(location.search).get('map')).id,mode=new URLSearchParams(location.search).get('mode')==='race'?'race':'free',preview=null,previewStarted=false,leaving=false,paper=new URLSearchParams(location.search).get('comic')!=='0';
  document.title='Biggas Hover Racing';
  document.body.innerHTML=`<main class="race-lobby" data-stage="0" data-pilot="zud" data-vehicle="033"><div class="lobby-paper-surface" aria-hidden="true"></div><div class="lobby-title-ribbon" aria-hidden="true"></div><div class="lobby-title-checkers" aria-hidden="true"></div><header class="lobby-header"><a class="lobby-brand" href="${base}" aria-label="Biggas Hover Racing, inicio"><span aria-hidden="true">✳</span><strong>BIGGAS<small>HOVER RACING</small></strong></a><nav class="lobby-steps" aria-label="Preparación de carrera" hidden>${steps.slice(1).map((name,i)=>`<button type="button" data-step="${i+1}" disabled><span>0${i+1}</span>${name}</button>`).join('')}</nav><div class="lobby-header-actions">${soundControlMarkup('lobby-sound')}<button type="button" id="lobby-paper" aria-label="Papel" aria-pressed="true" title="Shader de papel"><span aria-hidden="true">◐</span> Papel</button><a class="lobby-hangar" href="${base}spaceship.html">Hangar</a></div></header>
    <div class="lobby-preview" aria-label="Vista del modelo seleccionado" hidden><img class="lobby-preview-fallback" data-lobby-image="zud" src="${base}images/flight/zud.png" alt="Zud"><canvas class="lobby-preview-canvas" role="img" aria-label="Modelo 3D. Arrastra para girar."></canvas><span class="lobby-preview-loading" role="status">Cargando vista…</span><span class="lobby-drag-hint">↔ Girar</span></div>
    <section class="lobby-screen lobby-landing" data-screen="0" aria-labelledby="lobby-title-0"><div class="lobby-title-mark"><span class="lobby-title-orbit" aria-hidden="true">✳</span><h1 id="lobby-title-0" tabindex="-1"><span class="lobby-title-biggas">BIGGAS</span><span class="lobby-title-racing">HOVER<br>RACING</span></h1><span class="lobby-title-edition">033 / ORIGINAL SERIES</span></div><button class="lobby-primary lobby-start" type="button">Jugar <span aria-hidden="true">▶</span></button><span class="lobby-start-hint"><kbd>ENTER</kbd> PARA JUGAR</span></section>
    <section class="lobby-screen lobby-selection" data-screen="1" aria-labelledby="lobby-title-1" hidden><div class="lobby-section-title"><h1 id="lobby-title-1" tabindex="-1">ELIGE TU PERSONAJE</h1><span>01 / 09</span></div><div class="lobby-roster-panel">${roster('pilot',base)}</div><div class="lobby-selected-name"><span>P1</span><strong>ZUD</strong></div><div class="lobby-profile"><div class="lobby-profile-brand">BIGGAS<span>HOVER RACING</span></div><dl><div><dt>Vehículo</dt><dd>Nave 033</dd></div><div><dt>Estado</dt><dd>Listo</dd></div></dl></div></section>
    <section class="lobby-screen lobby-selection" data-screen="2" aria-labelledby="lobby-title-2" hidden><div class="lobby-section-title"><h1 id="lobby-title-2" tabindex="-1">ELIGE TU VEHÍCULO</h1><span>01 / 09</span></div><div class="lobby-roster-panel">${roster('vehicle',base)}</div><div class="lobby-selected-name"><span>033</span><strong>NAVE DE ZUD</strong></div><div class="lobby-profile"><div class="lobby-profile-brand">033<span>HOVERCRAFT</span></div><dl class="lobby-specs"><div><dt>Velocidad</dt><dd>187 <small>km/h</small></dd></div><div><dt>Turbo</dt><dd>259 <small>km/h</small></dd></div><div><dt>Flotación</dt><dd>0,65 <small>m</small></dd></div></dl></div></section>
    <section class="lobby-screen lobby-maps" data-screen="3" aria-labelledby="lobby-title-3" hidden><div class="lobby-map-heading"><div><span class="lobby-kicker">03 / DESTINO</span><h1 id="lobby-title-3" tabindex="-1">ELIGE TU <em>CIRCUITO.</em></h1></div><div class="lobby-team"><img data-lobby-image="zud-face" src="${base}images/flight/zud-face.png" alt=""><span>ZUD <b>×</b> 033</span><img data-lobby-image="033" src="${base}images/flight/033.png" alt=""></div></div><fieldset class="lobby-map-list"><legend class="lobby-sr-only">Mapa</legend>${Object.values(CIRCUIT_MAPS).map(map=>`<label class="lobby-map-card"><input type="radio" name="map" value="${map.id}" ${selectedMap===map.id?'checked':''}><span class="lobby-map-art"><img data-lobby-image="${map.id}" src="${base}images/flight/${map.id}.png" alt="${map.id==='ruins'?'Circuito de ruinas entre islas y agua':'Circuito urbano de Nexus'}"><span class="lobby-map-number">${map.number}</span><span class="lobby-map-check" aria-hidden="true">✓</span></span><span class="lobby-map-info"><strong>${map.name}</strong><span>${map.id==='ruins'?'0,80 KM · ISLAS':'1,21 KM · CIUDAD'}</span></span></label>`).join('')}</fieldset><fieldset class="lobby-mode"><legend>MODO</legend><label><input type="radio" name="mode" value="free" ${mode==='free'?'checked':''}><span>Vuelo libre</span></label><label><input type="radio" name="mode" value="race" ${mode==='race'?'checked':''}><span>Contrarreloj</span></label></fieldset></section>
    <footer class="lobby-footer"><div class="lobby-footer-brand"><span class="lobby-checker" aria-hidden="true"></span> HOVER CLUB / 033</div><button type="button" class="lobby-back" hidden><span aria-hidden="true">←</span> Volver</button><span class="lobby-key-hint" hidden><kbd>ENTER</kbd> CONFIRMAR <kbd>ESC</kbd> VOLVER</span><button type="button" class="lobby-primary lobby-next" hidden>Confirmar Zud <span aria-hidden="true">→</span></button><span class="lobby-edition">VOL. 01</span></footer><div class="lobby-launching" role="status" hidden><span class="lobby-kicker">ZUD × 033</span><strong>Preparando pista<span>…</span></strong><span class="lobby-launch-track"></span></div>
  </main>`;
  const root=document.querySelector('.race-lobby'),$=selector=>root.querySelector(selector);
  const motion=createMenuMotion(root,{reduced,signal});motion.intro();
  raceAudio.setPhase('lobby');
  const {toggleSound}=mountSoundControl($('.sound-control'),{signal});
  root.addEventListener('pointerdown',event=>{if(!event.target.closest('.sound-control'))raceAudio.unlock();},{signal});
  return new Promise(resolve=>{
    function show(next,{keyboard=false}={}){
      if(leaving)return;const previous=stage;motion.before(previous,next,keyboard);stage=next;root.dataset.stage=String(stage);root.dataset.keyboard=String(keyboard);
      root.querySelectorAll('[data-screen]').forEach(screen=>screen.hidden=Number(screen.dataset.screen)!==stage);
      $('.lobby-steps').hidden=stage===0;$('.lobby-back').hidden=stage===0;$('.lobby-next').hidden=stage===0;$('.lobby-key-hint').hidden=stage===0;$('.lobby-footer-brand').hidden=stage!==0;$('.lobby-edition').hidden=stage!==0;
      root.querySelectorAll('[data-step]').forEach(button=>{const index=Number(button.dataset.step);button.disabled=index>stage;if(index===stage)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      $('.lobby-next').innerHTML=`${stage===1?'Confirmar Zud':stage===2?'Confirmar nave':mode==='race'?'Correr':'Volar'} <span aria-hidden="true">→</span>`;
      const pilot=stage===1;$('.lobby-preview').hidden=stage!==1&&stage!==2;if(stage===1||stage===2)loadPreview();preview?.setKind(pilot?'pilot':'vehicle');$('.lobby-preview-fallback').dataset.lobbyImage=pilot?'zud':selectedVehicle;updatePaperImages();$('.lobby-preview-fallback').alt=pilot?'Zud':`${SHIPS[selectedVehicle].name} con Zud al mando`;
      $(`#lobby-title-${stage}`).focus({preventScroll:true});motion.after(previous,stage,keyboard);
    }
    async function advance(event){
      if(leaving)return;
      raceAudio.unlock();
      if(stage<3){show(stage+1,{keyboard:event?.detail===0});return;}
      raceAudio.setPhase('loading');
      leaving=true;root.dataset.launching='true';$('.lobby-launching').hidden=false;$('.lobby-launch-track').textContent=`${CIRCUIT_MAPS[selectedMap].name} / ${CIRCUIT_MAPS[selectedMap].number}`;
      const entryTransition=createRaceEntryTransition($('.lobby-launching'),{reduced,keyboard:event?.detail===0});root.inert=true;
      await entryTransition.covered;
      // Release the preview once the cover is opaque, before loading the circuit.
      controller.abort();preview?.dispose();resolve({map:selectedMap,vehicle:selectedVehicle,mode,paper,entryTransition});
    }
    $('.lobby-start').addEventListener('click',advance,{signal});$('.lobby-next').addEventListener('click',advance,{signal});
    $('.lobby-back').addEventListener('click',event=>show(Math.max(0,stage-1),{keyboard:event.detail===0}),{signal});
    root.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',event=>show(Number(button.dataset.step),{keyboard:event.detail===0}),{signal}));
    root.querySelectorAll('input[name=map]').forEach(input=>input.addEventListener('change',()=>{selectedMap=input.value;root.dataset.map=selectedMap;},{signal}));
    root.querySelectorAll('input[name=mode]').forEach(input=>input.addEventListener('change',()=>{mode=input.value;$('.lobby-next').innerHTML=`${mode==='race'?'Correr':'Volar'} <span aria-hidden="true">→</span>`;},{signal}));
    root.querySelectorAll('[data-screen="1"] .lobby-slot.is-selected').forEach(button=>button.addEventListener('click',()=>$('.lobby-next').focus({preventScroll:true}),{signal}));
    function selectVehicle(id){
      selectedVehicle=shipConfig(id).id;const config=SHIPS[selectedVehicle];root.dataset.vehicle=selectedVehicle;
      root.querySelectorAll('[data-vehicle-choice]').forEach(button=>{const selected=button.dataset.vehicleChoice===selectedVehicle;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',`${SHIPS[button.dataset.vehicleChoice].name}${selected?', seleccionado':''}`);button.querySelector('.lobby-slot-player').hidden=!selected;});
      $('[data-screen="2"] .lobby-section-title>span').textContent=selectedVehicle==='033'?'01 / 09':'02 / 09';
      $('[data-screen="2"] .lobby-selected-name>span').textContent=config.id;
      $('[data-screen="2"] .lobby-selected-name strong').textContent=config.title.toUpperCase();
      $('[data-screen="2"] .lobby-profile-brand').innerHTML=`${config.id}<span>HOVERCRAFT</span>`;
      $('[data-screen="1"] .lobby-profile dd').textContent=config.name;
      $('.lobby-team>span').innerHTML=`ZUD <b>×</b> ${config.id}`;
      $('.lobby-team img:last-child').dataset.lobbyImage=config.image;
      $('.lobby-launching .lobby-kicker').textContent=`ZUD × ${config.id}`;
      $('.lobby-hangar').href=`${base}spaceship.html?vehicle=${config.id}`;
      if(stage===2){$('.lobby-preview-fallback').dataset.lobbyImage=config.image;$('.lobby-preview-fallback').alt=`${config.name} con Zud al mando`;}
      preview?.setVehicle(selectedVehicle);updatePaperImages();
    }
    root.querySelectorAll('[data-vehicle-choice]').forEach(button=>button.addEventListener('click',()=>selectVehicle(button.dataset.vehicleChoice),{signal}));
    $('[data-screen="2"] .lobby-roster').addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const ids=Object.keys(SHIPS),current=ids.indexOf(selectedVehicle),next=event.key==='Home'?0:event.key==='End'?ids.length-1:(current+(event.key==='ArrowRight'?1:-1)+ids.length)%ids.length;
      selectVehicle(ids[next]);$(`[data-vehicle-choice="${ids[next]}"]`).focus();
    },{signal});
    document.addEventListener('keydown',event=>{
      if(event.repeat)return;
      if(event.code==='KeyM'){event.preventDefault();toggleSound();return;}
      raceAudio.unlock();
      if(event.key==='Escape'&&stage>0){event.preventDefault();show(stage-1,{keyboard:true});}
      if(event.key==='Enter'&&!event.target.closest('button,a,input')){event.preventDefault();advance({detail:0});}
    },{signal});
    function updatePaperImages(){
      root.querySelectorAll('[data-lobby-image]').forEach(image=>{
        const key=image.dataset.lobbyImage,isMap=key==='ruins'||key==='nexus';
        const filename=isMap?`${key}${paper?'':'-normal'}`:`${key}${paper?'-paper':''}`;
        const src=`${base}images/flight/${filename}.png`;if(image.getAttribute('src')!==src)image.src=src;
      });
    }
    function setPaper(enabled){
      paper=enabled;root.dataset.paper=String(paper);$('#lobby-paper').setAttribute('aria-pressed',String(paper));preview?.setPaper(paper);updatePaperImages();
    }
    $('#lobby-paper').addEventListener('click',()=>setPaper(!paper),{signal});
    setPaper(paper);selectVehicle(selectedVehicle);root.dataset.map=selectedMap;
    if(new URLSearchParams(location.search).get('selection')==='map')show(3,{keyboard:true});
    // The title screen is typography only: defer WebGL until selection.
    function loadPreview(){
      if(previewStarted)return;previewStarted=true;
      import('./flight-preview.js').then(({createFlightPreview})=>createFlightPreview($('.lobby-preview-canvas'),{reducedMotion:reduced,signal,initialKind:stage===1?'pilot':'vehicle',paper,vehicle:selectedVehicle,onStatus:status=>{if(!leaving)root.dataset.preview=stage===2&&$('.lobby-preview-canvas').dataset.vehicle!==selectedVehicle?'loading':status;}})).then(result=>{
        if(!result)return;if(leaving){result.dispose();return;}preview=result;preview.setPaper(paper);preview.setVehicle(selectedVehicle);preview.setKind(stage===1?'pilot':'vehicle');
      }).catch(()=>{root.dataset.preview='fallback';});
    }
  });
}

export async function createFlightEntry(){
  const choice=await chooseFlight();
  const url=new URL(location.href);url.searchParams.set('map',choice.map);url.searchParams.set('vehicle',choice.vehicle);url.searchParams.set('comic',choice.paper?'1':'0');url.searchParams.delete('seed');url.searchParams.delete('selection');url.searchParams.delete('mode');history.replaceState(null,'',url);
  try{
    const {createFlightSimulator}=await import('./flight-simulator.js');
    await createFlightSimulator({launchMode:choice.mode,entryTransition:choice.entryTransition});
  }catch(error){
    raceAudio.dispose();console.error(error);choice.entryTransition.fail('No se pudo abrir el circuito.');
  }
}
