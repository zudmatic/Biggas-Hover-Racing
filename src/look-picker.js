import {HAT_CATALOG} from './hat-catalog.js';
import {createLookPreviews} from './look-previews.js';
import './look-picker.css';

export function createLookPicker({canvas,model,getSettings,reducedMotion,getSelected,onSelect}) {
  const dialog=document.createElement('dialog');
  dialog.id='look-dialog';dialog.className='look-picker';
  dialog.setAttribute('aria-labelledby','look-title');
  dialog.setAttribute('aria-describedby','look-help');
  dialog.innerHTML=`<h2 id="look-title" class="sr-only">Look</h2><p id="look-help" class="sr-only">Elegí un gorro. Presioná Escape para volver al cuarto.</p><button class="look-close" type="button" aria-label="Cerrar selector de gorros">×</button><div class="look-options"></div><p class="look-status" role="status"></p>`;
  const options=dialog.querySelector('.look-options'),status=dialog.querySelector('.look-status');
  const hats=[{id:'beanie',name:'Beanie'},...HAT_CATALOG];
  for(const hat of hats){
    const button=document.createElement('button');button.type='button';button.className='look-option';button.dataset.hat=hat.id;
    button.setAttribute('aria-pressed','false');
    const preview=document.createElement('span');preview.className='look-preview';preview.setAttribute('aria-hidden','true');button.append(preview);
    const label=document.createElement('span');label.className='sr-only';label.textContent=hat.name;button.append(label);options.append(button);
    button.addEventListener('click',async()=>{
      buttons.forEach(option=>option.disabled=true);dialog.setAttribute('aria-busy','true');status.textContent='Preparando tu gorro…';
      try{await onSelect(hat.id);sync();dialog.close();}
      catch{status.textContent='No se pudo cargar el gorro. Volvé a elegirlo para reintentar.';}
      finally{buttons.forEach(option=>option.disabled=false);dialog.removeAttribute('aria-busy');}
    });
  }
  const buttons=[...options.children];
  function sync(){for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.hat===getSelected()));}
  dialog.querySelector('.look-close').addEventListener('click',()=>dialog.close());
  let backdrop=false;
  dialog.addEventListener('pointerdown',event=>{backdrop=!event.target.closest('button');});
  dialog.addEventListener('click',event=>{if(backdrop&&!event.target.closest('button'))dialog.close();backdrop=false;});
  let previews;
  dialog.addEventListener('close',()=>{previews?.stop();canvas.focus({preventScroll:true});});
  document.body.append(dialog);
  return {open(){if(dialog.open)return;status.textContent='';sync();dialog.showModal();
    try{previews??=createLookPreviews({container:options,buttons,model,getSettings,reducedMotion});previews.start();}
    catch{status.textContent='Las vistas 3D no están disponibles. Podés elegir un gorro por su nombre.';}
    (buttons.find(button=>button.getAttribute('aria-pressed')==='true')??buttons[0]).focus();}};
}
