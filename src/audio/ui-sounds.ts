import {audio} from './audio-system';
import {UI_SOUNDS} from './catalog';

type UICue = keyof typeof UI_SOUNDS;
const lastPlayed = new Map<UICue, number>();

/** Short feedback stays quiet during pointer sweeps or held controller inputs. */
export function playUISound(cue: UICue) {
  if (document.hidden || !audio.enabled || audio.effectsVolume <= 0) return;
  const now = performance.now();
  const cooldown = cue === 'navigate' ? 85 : 180;
  if (now - (lastPlayed.get(cue) ?? -Infinity) < cooldown) return;
  audio.unlock();
  if (!audio.audioContext) return;
  lastPlayed.set(cue, now);
  void audio.play(UI_SOUNDS[cue]);
}

/** Call after a gesture unlocks audio so the next selection has no decode delay. */
export function preloadUISounds() {
  void audio.sounds.preload([...Object.values(UI_SOUNDS), 'ui.ready']);
}

/** Hover/tab feedback only; clicks and controller actions play their semantic cue. */
export function bindMenuHover(root: HTMLElement, parentSignal?: AbortSignal): () => void {
  const controller = new AbortController(), {signal} = controller;
  const dispose = () => controller.abort();
  if (parentSignal?.aborted) dispose();
  else parentSignal?.addEventListener('abort', dispose, {once: true});
  const selector = 'button:not(:disabled), a[href], summary, input[type=radio], .lobby-map-card';
  function control(target: EventTarget | null) {
    const element = target instanceof Element ? target.closest<HTMLElement>(selector) : null;
    return element && root.contains(element) && !element.closest('[inert], [hidden], [aria-disabled=true]') ? element : null;
  }
  root.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse' || !audio.audioContext) return;
    const next = control(event.target);
    if (next && next !== control(event.relatedTarget)) playUISound('navigate');
  }, {signal});
  let tabAt = -Infinity;
  root.addEventListener('keydown', event => { if (event.key === 'Tab') tabAt = performance.now(); }, {signal});
  root.addEventListener('focusin', event => {
    if (performance.now() - tabAt < 100 && control(event.target)) playUISound('navigate');
  }, {signal});
  return dispose;
}
