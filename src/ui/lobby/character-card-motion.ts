const ease = 'cubic-bezier(.22,1,.36,1)';

/** Animate card contents without overriding the responsive design's scale. */
export function createCharacterCardMotion(signal: AbortSignal) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Map<HTMLElement, Animation[]>();

  function clear(card: HTMLElement) {
    active.get(card)?.forEach(animation => animation.cancel());
    active.delete(card);
  }

  function clearAll() {
    for (const card of active.keys()) clear(card);
  }

  reduced.addEventListener('change', clearAll, {signal});
  signal.addEventListener('abort', clearAll, {once: true});

  return {
    clear,
    enter(card: HTMLElement) {
      if (signal.aborted || reduced.matches) return;
      const animations: Animation[] = [];
      function animate(selector: string, frames: Keyframe[], duration: number, delay = 0) {
        const element = card.querySelector<HTMLElement>(selector);
        if (element) animations.push(element.animate(frames, {duration, delay, easing: ease, fill: 'backwards'}));
      }

      // The artwork fills the card. Keep it opaque and covering every edge:
      // fading the panel reveals its contour, and sliding the image exposes
      // the backing color as a stripe. Zoom inward instead.
      animate('.figma-character-art, .entry-card-art', [
        {transform: 'scale(1.045)'},
        {transform: 'scale(1)'},
      ], 300);
      animate('.figma-card-copy, .entry-card-copy', [
        {opacity: 0, transform: 'translateX(-18px)'},
        {opacity: 1, transform: 'translateX(0)'},
      ], 240, 35);

      active.set(card, animations);
      Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
        if (active.get(card) === animations) active.delete(card);
      });
    },
  };
}
