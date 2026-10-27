import {raceAudio,soundIcon} from '../../audio/race-audio';
import {gameMusic} from '../../audio/music-player';
import './sound-control.css';

export function soundControlMarkup(id){
  return `<div class="sound-control">
    <button type="button" id="${id}" class="sound-trigger" aria-label="Sonido" aria-expanded="false" aria-controls="${id}-panel" title="Ajustar sonido">${soundIcon}</button>
    <div id="${id}-panel" class="sound-panel" role="group" aria-label="Ajustes de sonido" hidden>
      <div class="sound-volume-heading"><label for="${id}-volume">Música</label><output for="${id}-volume" class="sound-volume-value" aria-live="off"></output></div>
      <input id="${id}-volume" class="sound-volume" type="range" min="0" max="100" step="1" aria-label="Volumen de música">
      <div class="sound-volume-limits" aria-hidden="true"><span>0</span><span>100</span></div>
      <div class="sound-volume-heading"><label for="${id}-effects">Efectos</label><output for="${id}-effects" class="sound-effects-value" aria-live="off"></output></div>
      <input id="${id}-effects" class="sound-volume sound-effects-volume" type="range" min="0" max="100" step="1" aria-label="Volumen de efectos">
      <button type="button" class="sound-mute"><span></span><kbd aria-hidden="true">M</kbd></button>
    </div>
  </div>`;
}

export function mountSoundControl(root,{signal,onOpen=()=>{}}={}){
  const controller=new AbortController(),options={signal:controller.signal};
  const button=root.querySelector('.sound-trigger'),panel=root.querySelector('.sound-panel');
  const slider=root.querySelector('.sound-volume'),value=root.querySelector('.sound-volume-value'),mute=root.querySelector('.sound-mute');
  const effects=root.querySelector('.sound-effects-volume'),effectsValue=root.querySelector('.sound-effects-value');
  function render(){
    const percent=Math.round(gameMusic.state.volume*100);
    slider.value=String(percent);slider.setAttribute('aria-valuetext',`${percent}%`);
    slider.style.setProperty('--sound-volume',`${percent}%`);value.textContent=`${percent}%`;
    const effectsPercent=Math.round(raceAudio.volume*100);
    effects.value=String(effectsPercent);effects.setAttribute('aria-valuetext',`${effectsPercent}%`);
    effects.style.setProperty('--sound-volume',`${effectsPercent}%`);effectsValue.textContent=`${effectsPercent}%`;
    button.dataset.muted=String(!raceAudio.enabled);
    mute.querySelector('span').textContent=raceAudio.enabled?'Silenciar todo':'Activar sonido';
    mute.title=raceAudio.enabled?'Silenciar todo · M':'Activar sonido · M';
  }
  function position(){
    if(panel.hidden)return;
    const rect=button.getBoundingClientRect();
    panel.style.left=`${Math.max(12,Math.min(rect.right-panel.offsetWidth,innerWidth-panel.offsetWidth-12))}px`;
    panel.style.top=`${Math.max(12,Math.min(rect.bottom+8,innerHeight-panel.offsetHeight-12))}px`;
  }
  function close({focus=false}={}){
    panel.hidden=true;button.setAttribute('aria-expanded','false');
    if(focus)button.focus({preventScroll:true});
  }
  function toggleSound(){raceAudio.setEnabled(!raceAudio.enabled);render();}
  button.addEventListener('click',()=>{
    if(!panel.hidden){close();return;}
    panel.hidden=false;button.setAttribute('aria-expanded','true');position();
    onOpen();raceAudio.unlock();slider.focus({preventScroll:true});
  },options);
  slider.addEventListener('input',()=>{
    const volume=Number(slider.value)/100;gameMusic.setVolume(volume);
    if(volume>0&&!raceAudio.enabled)raceAudio.setEnabled(true);
    raceAudio.unlock();
  },options);
  mute.addEventListener('click',toggleSound,options);
  effects.addEventListener('input',()=>{
    raceAudio.setVolume(Number(effects.value)/100);
    if(raceAudio.volume>0&&!raceAudio.enabled)raceAudio.setEnabled(true);
    raceAudio.unlock();render();
  },options);
  document.addEventListener('pointerdown',event=>{if(!root.contains(event.target))close();},options);
  root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget))close();},options);
  // Keep slider keys and Escape from steering the ship or changing lobby steps.
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopPropagation();close({focus:true});return;}
    if(panel.hidden||!root.contains(event.target))return;
    if(event.code==='KeyM'){event.preventDefault();if(!event.repeat)toggleSound();}
    event.stopPropagation();
  },{...options,capture:true});
  window.addEventListener('resize',position,options);
  const unsubscribe=gameMusic.subscribe(render);
  controller.signal.addEventListener('abort',unsubscribe,{once:true});
  const dispose=()=>controller.abort();
  if(signal){if(signal.aborted)dispose();else signal.addEventListener('abort',dispose,{once:true});}
  return {toggleSound,close,dispose};
}
