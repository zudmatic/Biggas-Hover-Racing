import {BULLDOG_INTRO} from './bulldog-intro';
import './bulldog-intro.css';

const WIPE_MS=360;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Letterbox, shot captions, title card and a paper wipe back to the grid.
export function createIntroOverlay(parent,{onSkip}){
  const root=document.createElement('section');root.className='bulldog-intro';root.setAttribute('aria-label','Presentación de la Bulldog 039');
  root.innerHTML=`<div class="bulldog-intro-bar" data-edge="top"></div><div class="bulldog-intro-bar" data-edge="bottom"></div>
    <p class="bulldog-intro-caption" aria-live="polite"><span></span><b></b></p>
    <div class="bulldog-intro-title" aria-hidden="true"><span>039</span><strong>Bulldog</strong><small>Nave Bulldog · Hovercraft</small></div>
    <button type="button" class="bulldog-intro-skip">Saltar <kbd>Enter</kbd></button>
    <div class="bulldog-intro-wipe" aria-hidden="true"></div>`;
  const caption=root.querySelector('.bulldog-intro-caption');
  root.querySelector('.bulldog-intro-skip').addEventListener('click',onSkip);
  parent.append(root);
  return {
    root,
    setShot(shot){
      if(root.dataset.shot===shot.id)return;root.dataset.shot=shot.id;
      caption.querySelector('span').textContent=`${String(BULLDOG_INTRO.indexOf(shot)+1).padStart(2,'0')} / ${String(BULLDOG_INTRO.length).padStart(2,'0')}`;
      caption.querySelector('b').textContent=shot.caption;
    },
    // Cover the screen, let the caller move the ship back to the grid, then reveal.
    async cover(){root.dataset.wipe='in';await wait(WIPE_MS);},
    async reveal(){root.dataset.wipe='out';await wait(WIPE_MS);root.remove();},
    remove(){root.remove();},
  };
}
