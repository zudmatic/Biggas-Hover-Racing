import './renderer-navigation.js';
import {ZUD_HATS,zudHat} from './hat-catalog.js';
import {SHIPS,shipConfig} from './ship-catalog.js';
import {PILOTS,ZUDMATIC_PALETTES,pilotConfig,pilotChoice,pilotQuery} from './pilot-catalog.js';
import {CIRCUIT_MAPS,circuitMap} from './circuit-maps.js';
import './flight-selection.css';
import {raceAudio} from './race-audio.js';
import {soundControlMarkup,mountSoundControl} from './sound-control.js';
import {createMenuMotion,createRaceEntryTransition} from './menu-motion.js';

const lock='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>';
const steps=['Inicio','Personaje','Vehículo','Mapa'];
const available={pilot:Object.values(PILOTS),vehicle:Object.values(SHIPS)};
const hatSwatches={
  beanie:{color:'#f9670d',path:'M5 15V12a7 7 0 0 1 14 0v3M4 15h16v5H4zM10 4a2 2 0 1 0 4 0 2 2 0 1 0-4 0'},
  samurai_kasa:{color:'#e6c783',path:'M2 17 12 5l10 12H2zM12 5l-4 12m4-12 4 12M5 20h14'},
  cloud_chef:{color:'#eee7c9',path:'M7 12a4 4 0 1 1 1-7 4 4 0 0 1 8 0 4 4 0 1 1 1 7v8H7v-8zM7 16h10'},
  crescent_wizard:{color:'#8584c4',path:'M5 17 11 4l6 3-4 1 6 9M3 17h18v3H3zM12 11l-2 3h3'},
};

function roster(kind,base){
  const items=available[kind];
  return `<div class="lobby-roster" role="group" aria-label="${kind==='pilot'?'Personajes':'Vehículos'}">${items.map((item,i)=>`<button class="lobby-slot ${i===0?'is-selected':''}" type="button" ${kind==='vehicle'?`data-vehicle-choice="${item.id}"`:`data-pilot-choice="${item.id}"`} aria-pressed="${i===0}" aria-label="${item.name}${i===0?', seleccionado':''}"><img data-lobby-image="${item.image}" src="${base}images/flight/${item.image}.png" alt=""><span class="lobby-slot-player" ${i?'hidden':''}>P1</span><span class="lobby-slot-name">${item.name}</span></button>`).join('')}${Array.from({length:9-items.length},(_,i)=>`<button class="lobby-slot is-locked" type="button" disabled aria-label="${kind==='pilot'?'Personaje':'Vehículo'} ${i+items.length+1}, bloqueado"><span class="lobby-slot-index">${String(i+items.length+1).padStart(2,'0')}</span><span class="lobby-mystery" aria-hidden="true">?</span><span class="lobby-slot-lock">${lock}</span></button>`).join('')}</div>`;
}

export function chooseFlight(){
  const base=import.meta.env.BASE_URL,reduced=matchMedia('(prefers-reduced-motion: reduce)'),controller=new AbortController(),{signal}=controller;
  let {pilot:selectedPilot,palette:selectedPalette,hat:selectedHat}=pilotChoice();
  let selectedVehicle=shipConfig(new URLSearchParams(location.search).get('vehicle')).id;
  const query=new URLSearchParams(location.search);
  let stage=0,selectedMap=circuitMap(query.get('map')).id,preview=null,previewStarted=false,leaving=false,paper=query.has('comic')?query.get('comic')!=='0':selectedPilot!=='bluleet';
  document.title='Biggas Hover Racing';
  document.body.innerHTML=`<main class="race-lobby" data-stage="0" data-pilot="zud" data-vehicle="033"><div class="lobby-paper-surface" aria-hidden="true"></div><div class="lobby-title-ribbon" aria-hidden="true"></div><div class="lobby-title-checkers" aria-hidden="true"></div><header class="lobby-header"><a class="lobby-brand" href="${base}" aria-label="Biggas Hover Racing, inicio"><span aria-hidden="true">✳</span><strong>BIGGAS<small>HOVER RACING</small></strong></a><nav class="lobby-steps" aria-label="Preparación de carrera" hidden>${steps.slice(1).map((name,i)=>`<button type="button" data-step="${i+1}" disabled><span>0${i+1}</span>${name}</button>`).join('')}</nav><div class="lobby-header-actions">${soundControlMarkup('lobby-sound')}<button type="button" id="lobby-paper" aria-label="Papel" aria-pressed="true" title="Shader de papel"><span aria-hidden="true">◐</span> Papel</button><a class="lobby-hangar" href="${base}spaceship.html">Hangar</a></div></header>
    <div class="lobby-preview" aria-label="Vista del modelo seleccionado" hidden><img class="lobby-preview-fallback" data-lobby-image="zud" src="${base}images/flight/zud.png" alt="Zud"><canvas class="lobby-preview-canvas" role="img" aria-label="Modelo 3D. Arrastra para girar."></canvas><span class="lobby-preview-loading" role="status">Cargando vista…</span><span class="lobby-drag-hint">↔ Girar</span></div>
    <section class="lobby-screen lobby-landing" data-screen="0" aria-labelledby="lobby-title-0"><div class="lobby-title-mark"><span class="lobby-title-orbit" aria-hidden="true">✳</span><h1 id="lobby-title-0" tabindex="-1"><span class="lobby-title-biggas">BIGGAS</span><span class="lobby-title-racing">HOVER<br>RACING</span></h1><span class="lobby-title-edition">033 / ORIGINAL SERIES</span></div><button class="race-primary lobby-primary lobby-start" type="button">Jugar <span aria-hidden="true">▶</span></button><span class="lobby-start-hint"><kbd>ENTER</kbd> PARA JUGAR</span></section>
    <section class="lobby-screen lobby-selection" data-screen="1" aria-labelledby="lobby-title-1" hidden><div class="lobby-section-title"><h1 id="lobby-title-1" tabindex="-1">ELIGE TU PERSONAJE</h1><span>01 / 09</span></div><div class="lobby-roster-panel">${roster('pilot',base)}</div><div class="lobby-selected-name"><span>P1</span><strong>ZUD</strong></div><div class="lobby-profile"><fieldset class="lobby-hats"><legend>SOMBRERO <span class="lobby-hat-name">${zudHat(selectedHat).name}</span></legend><div>${ZUD_HATS.map(hat=>`<button type="button" data-hat="${hat.id}" aria-label="Sombrero ${hat.name}" aria-pressed="${hat.id===selectedHat}" title="${hat.name}" style="--hat-color:${hatSwatches[hat.id].color}"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${hatSwatches[hat.id].path}"/></svg></span></button>`).join('')}</div></fieldset><fieldset class="lobby-palettes" hidden><legend>COLOR <span class="lobby-palette-name">Original</span></legend><div>${ZUDMATIC_PALETTES.map(p=>`<button type="button" data-palette="${p.name}" aria-label="Color ${p.name}" aria-pressed="${p.name===selectedPalette}" title="${p.name}" style="--palette-main:${p.colors.orange};--palette-detail:${p.colors.blue};--palette-accent:${p.parts?.part_015??p.colors.ivory}"><span></span></button>`).join('')}</div></fieldset><div class="lobby-profile-brand">BIGGAS<span>HOVER RACING</span></div><dl><div><dt>Vehículo</dt><dd>Nave 033</dd></div><div><dt>Estado</dt><dd>Listo</dd></div></dl></div></section>
    <section class="lobby-screen lobby-selection" data-screen="2" aria-labelledby="lobby-title-2" hidden><div class="lobby-section-title"><h1 id="lobby-title-2" tabindex="-1">ELIGE TU VEHÍCULO</h1><span>01 / 09</span></div><div class="lobby-roster-panel">${roster('vehicle',base)}</div><div class="lobby-selected-name"><span>033</span><strong>NAVE DE ZUD</strong></div><div class="lobby-profile"><div class="lobby-profile-brand">033<span>HOVERCRAFT</span></div><dl class="lobby-specs"><div><dt>Velocidad</dt><dd>187 <small>km/h</small></dd></div><div><dt>Turbo</dt><dd>259 <small>km/h</small></dd></div><div><dt>Flotación</dt><dd>0,65 <small>m</small></dd></div></dl></div></section>
    <section class="lobby-screen lobby-maps" data-screen="3" aria-labelledby="lobby-title-3" hidden><div class="lobby-map-heading"><div><span class="lobby-kicker">03 / DESTINO</span><h1 id="lobby-title-3" tabindex="-1">ELIGE TU <em>CIRCUITO.</em></h1></div><div class="lobby-team"><img data-lobby-image="zud-face" src="${base}images/flight/zud-face.png" alt=""><span>ZUD <b>×</b> 033</span><img data-lobby-image="033" src="${base}images/flight/033.png" alt=""></div></div><fieldset class="lobby-map-list"><legend class="lobby-sr-only">Mapa</legend>${Object.values(CIRCUIT_MAPS).map(map=>`<label class="lobby-map-card race-panel"><input type="radio" name="map" value="${map.id}" ${selectedMap===map.id?'checked':''}><span class="lobby-map-art"><img data-lobby-image="${map.id}" src="${base}images/flight/${map.id}.png" alt="${map.description}"><span class="lobby-map-number">${map.number}</span><span class="lobby-map-check" aria-hidden="true">✓</span></span><span class="lobby-map-info"><strong>${map.name}</strong><span>${map.summary}</span></span></label>`).join('')}</fieldset></section>
    <footer class="lobby-footer"><div class="lobby-footer-brand"><span class="lobby-checker" aria-hidden="true"></span> HOVER CLUB / 033</div><button type="button" class="lobby-back" hidden><span aria-hidden="true">←</span> Volver</button><span class="lobby-key-hint" hidden><kbd>ENTER</kbd> CONFIRMAR <kbd>ESC</kbd> VOLVER</span><button type="button" class="race-primary lobby-primary lobby-next" hidden>Confirmar Zud <span aria-hidden="true">→</span></button><span class="lobby-edition">VOL. 01</span></footer><div class="lobby-launching" role="status" hidden><span class="lobby-kicker">ZUD × 033</span><strong>Preparando pista<span>…</span></strong><span class="lobby-launch-track"></span></div>
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
      $('.lobby-next').innerHTML=`${stage===1?`Confirmar ${PILOTS[selectedPilot].name}`:stage===2?'Confirmar nave':'Volar'} <span aria-hidden="true">→</span>`;
      const pilot=stage===1;$('.lobby-preview').hidden=stage!==1&&stage!==2;if(stage===1||stage===2)loadPreview();preview?.setKind(pilot?'pilot':'vehicle');$('.lobby-preview-fallback').dataset.lobbyImage=pilot?PILOTS[selectedPilot].preview:selectedVehicle;updatePaperImages();$('.lobby-preview-fallback').alt=pilot?PILOTS[selectedPilot].name:`${SHIPS[selectedVehicle].name} con ${PILOTS[selectedPilot].name} al mando`;
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
      controller.abort();preview?.dispose();resolve({map:selectedMap,vehicle:selectedVehicle,pilot:selectedPilot,palette:selectedPalette,hat:selectedHat,paper,entryTransition});
    }
    $('.lobby-start').addEventListener('click',advance,{signal});$('.lobby-next').addEventListener('click',advance,{signal});
    $('.lobby-back').addEventListener('click',event=>show(Math.max(0,stage-1),{keyboard:event.detail===0}),{signal});
    root.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',event=>show(Number(button.dataset.step),{keyboard:event.detail===0}),{signal}));
    root.querySelectorAll('input[name=map]').forEach(input=>input.addEventListener('change',()=>{selectedMap=input.value;root.dataset.map=selectedMap;},{signal}));
    function selectPilot(id){
      selectedPilot=pilotConfig(id).id;const config=PILOTS[selectedPilot];root.dataset.pilot=selectedPilot;root.dataset.palette=selectedPalette;root.dataset.hat=selectedHat;
      root.querySelectorAll('[data-pilot-choice]').forEach(button=>{const selected=button.dataset.pilotChoice===selectedPilot;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',`${PILOTS[button.dataset.pilotChoice].name}${selected?', seleccionado':''}`);button.querySelector('.lobby-slot-player').hidden=!selected;});
      $('[data-screen="1"] .lobby-section-title>span').textContent=`${String(Object.keys(PILOTS).indexOf(selectedPilot)+1).padStart(2,'0')} / 09`;
      $('[data-screen="1"] .lobby-selected-name strong').textContent=config.name.toUpperCase();
      $('.lobby-hats').hidden=selectedPilot!=='zud';$('.lobby-hat-name').textContent=zudHat(selectedHat).name;root.querySelectorAll('button[data-hat]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.hat===selectedHat)));
      $('.lobby-palettes').hidden=selectedPilot!=='zudmatic';$('.lobby-palette-name').textContent=selectedPalette;
      root.querySelectorAll('button[data-palette]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.palette===selectedPalette)));
      $('.lobby-team img:first-child').dataset.lobbyImage=config.image;
      if(stage===1){$('.lobby-next').innerHTML=`Confirmar ${config.name} <span aria-hidden="true">→</span>`;$('.lobby-preview-fallback').dataset.lobbyImage=config.preview;$('.lobby-preview-fallback').alt=config.name;}
      preview?.setPilot(selectedPilot,selectedPalette,selectedHat);selectVehicle(selectedVehicle);
    }
    root.querySelectorAll('[data-pilot-choice]').forEach(button=>button.addEventListener('click',()=>selectPilot(button.dataset.pilotChoice),{signal}));
    root.querySelectorAll('button[data-palette]').forEach(button=>button.addEventListener('click',()=>{selectedPalette=button.dataset.palette;selectPilot(selectedPilot);},{signal}));
    root.querySelectorAll('button[data-hat]').forEach(button=>button.addEventListener('click',()=>{selectedHat=zudHat(button.dataset.hat).id;selectPilot(selectedPilot);},{signal}));
    $('[data-screen="1"] .lobby-roster').addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const ids=Object.keys(PILOTS),current=ids.indexOf(selectedPilot),next=event.key==='Home'?0:event.key==='End'?ids.length-1:(current+(event.key==='ArrowRight'?1:-1)+ids.length)%ids.length;
      selectPilot(ids[next]);$(`[data-pilot-choice="${ids[next]}"]`).focus();
    },{signal});
    function selectVehicle(id){
      selectedVehicle=shipConfig(id).id;const config=SHIPS[selectedVehicle];root.dataset.vehicle=selectedVehicle;
      root.querySelectorAll('[data-vehicle-choice]').forEach(button=>{const selected=button.dataset.vehicleChoice===selectedVehicle;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',`${SHIPS[button.dataset.vehicleChoice].name}${selected?', seleccionado':''}`);button.querySelector('.lobby-slot-player').hidden=!selected;});
      $('[data-screen="2"] .lobby-section-title>span').textContent=`${String(Object.keys(SHIPS).indexOf(selectedVehicle)+1).padStart(2,'0')} / 09`;
      $('[data-screen="2"] .lobby-selected-name>span').textContent=config.id;
      $('[data-screen="2"] .lobby-selected-name strong').textContent=config.title.toUpperCase();
      $('[data-screen="2"] .lobby-profile-brand').innerHTML=`${config.id}<span>HOVERCRAFT</span>`;
      $('[data-screen="1"] .lobby-profile dd').textContent=config.name;
      $('.lobby-team>span').innerHTML=`${PILOTS[selectedPilot].name.toUpperCase()} <b>×</b> ${config.id}`;
      $('.lobby-team img:last-child').dataset.lobbyImage=config.image;
      $('.lobby-launching .lobby-kicker').textContent=`${PILOTS[selectedPilot].name.toUpperCase()} × ${config.id}`;
      $('.lobby-hangar').href=`${base}spaceship.html?vehicle=${config.id}&${pilotQuery({pilot:selectedPilot,palette:selectedPalette,hat:selectedHat})}`;
      if(stage===2){$('.lobby-preview-fallback').dataset.lobbyImage=config.image;$('.lobby-preview-fallback').alt=`${config.name} con ${PILOTS[selectedPilot].name} al mando`;}
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
        const key=image.dataset.lobbyImage,isMap=Object.hasOwn(CIRCUIT_MAPS,key);
        const filename=key.startsWith('zudmatic')?key:isMap?`${key}${paper?'':'-normal'}`:`${key}${paper?'-paper':''}`;
        const src=`${base}images/flight/${filename}.png`;if(image.getAttribute('src')!==src)image.src=src;
      });
    }
    function setPaper(enabled){
      paper=enabled;root.dataset.paper=String(paper);$('#lobby-paper').setAttribute('aria-pressed',String(paper));preview?.setPaper(paper);updatePaperImages();
    }
    $('#lobby-paper').addEventListener('click',()=>setPaper(!paper),{signal});
    setPaper(paper);selectPilot(selectedPilot);root.dataset.map=selectedMap;
    if(new URLSearchParams(location.search).get('selection')==='map')show(3,{keyboard:true});
    // The title screen is typography only: defer the 3D renderer until selection.
    function loadPreview(){
      if(previewStarted)return;previewStarted=true;
      import('./flight-preview.js').then(({createFlightPreview})=>createFlightPreview($('.lobby-preview-canvas'),{reducedMotion:reduced,signal,initialKind:stage===1?'pilot':'vehicle',paper,vehicle:selectedVehicle,pilot:selectedPilot,palette:selectedPalette,hat:selectedHat,onStatus:status=>{if(!leaving)root.dataset.preview=$('.lobby-preview-canvas').dataset.pilot!==selectedPilot||(stage===2&&$('.lobby-preview-canvas').dataset.vehicle!==selectedVehicle)?'loading':status;}})).then(result=>{
        if(!result)return;if(leaving){result.dispose();return;}preview=result;preview.setPilot(selectedPilot,selectedPalette,selectedHat);preview.setPaper(paper);preview.setVehicle(selectedVehicle);preview.setKind(stage===1?'pilot':'vehicle');
      }).catch(()=>{root.dataset.preview='fallback';});
    }
  });
}

export async function createFlightEntry(){
  const choice=await chooseFlight();
  const url=new URL(location.href);url.searchParams.set('map',choice.map);url.searchParams.set('vehicle',choice.vehicle);url.searchParams.set('pilot',choice.pilot);url.searchParams.set('palette',choice.palette);url.searchParams.set('hat',choice.hat);url.searchParams.set('comic',choice.paper?'1':'0');url.searchParams.delete('seed');url.searchParams.delete('selection');url.searchParams.delete('mode');history.replaceState(null,'',url);
  try{
    const {createFlightSimulator}=await import('./flight-simulator.js');
    await createFlightSimulator({entryTransition:choice.entryTransition});
  }catch(error){
    raceAudio.dispose();console.error(error);choice.entryTransition.fail('No se pudo abrir el circuito.');
  }
}
