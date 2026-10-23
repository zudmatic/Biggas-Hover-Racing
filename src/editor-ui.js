import './editor-ui.css';

// Keep editor links in sync while preserving unrelated room URL options.
export function editorNavigation(active) {
  const base=new URL(location.href);
  for(const key of ['edit','debug','model-debug'])base.searchParams.delete(key);
  const link=(key,value)=>{const url=new URL(base);url.searchParams.set(key,value);return url.pathname+url.search+url.hash;};
  return `<nav class="studio-nav" aria-label="Editores"><a href="${link('edit','scene')}" ${active==='scene'?'aria-current="page"':''}>Escena</a><a href="${link('debug','character')}" ${active==='character'?'aria-current="page"':''}>Personaje</a></nav>`;
}

export function setupEditorInteractions() {
  document.documentElement.dataset.studioInput='keyboard';
  document.addEventListener('pointerdown',()=>document.documentElement.dataset.studioInput='pointer',true);
  document.addEventListener('keydown',()=>document.documentElement.dataset.studioInput='keyboard',true);
}

// One notice per editor: repeated actions update it instead of stacking messages.
// Errors and loading messages stay until resolved; success pauses while being read.
export function createEditorNotice(message) {
  const notice=document.createElement('div');
  notice.className='studio-notice';notice.inert=true;notice.dataset.open='false';
  const icon=document.createElement('span');icon.className='studio-notice-icon';icon.setAttribute('aria-hidden','true');
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Cerrar aviso');
  message.setAttribute('aria-atomic','true');
  notice.append(icon,message,close);document.body.append(notice);
  let timer,remaining=0,started=0,origin;
  const pause=()=>{clearTimeout(timer);if(started){remaining=Math.max(0,remaining-(performance.now()-started));started=0;}};
  const dismiss=()=>{pause();remaining=0;notice.dataset.open='false';notice.inert=true;};
  const resume=()=>{
    if(started||!remaining||document.hidden||(matchMedia('(hover:hover) and (pointer:fine)').matches&&notice.matches(':hover'))||notice.contains(document.activeElement))return;
    started=performance.now();timer=setTimeout(dismiss,remaining);
  };
  close.addEventListener('click',()=>{if(notice.contains(document.activeElement)&&origin?.isConnected)origin.focus({preventScroll:true});dismiss();});
  notice.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')pause();});notice.addEventListener('pointerleave',resume);
  notice.addEventListener('focusin',pause);notice.addEventListener('focusout',()=>queueMicrotask(resume));
  document.addEventListener('visibilitychange',()=>document.hidden?pause():resume());
  return (text,error=false,{pending=false}={})=>{
    pause();
    if(!text){message.textContent='';dismiss();return;}
    if(!notice.contains(document.activeElement))origin=document.activeElement;
    message.dataset.error=String(error);message.textContent=text;
    notice.dataset.error=String(error);notice.dataset.pending=String(pending);
    icon.textContent=error?'!':pending?'…':'✓';
    notice.inert=false;notice.dataset.open='true';
    remaining=error||pending?0:6000;resume();
  };
}
