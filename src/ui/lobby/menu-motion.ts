import './menu-motion.css';

const ease = 'cubic-bezier(.22,1,.36,1)';

export function createMenuMotion(root: HTMLElement, {reduced, signal}: {reduced: MediaQueryList; signal: AbortSignal}) {
  const animations = new Set<Animation>();
  let ghost: HTMLElement | null = null;
  function clear() {
    for (const animation of animations) animation.cancel();
    animations.clear();
    ghost?.remove();
    ghost = null;
    delete root.dataset.transitioning;
    delete root.dataset.landingTransition;
  }
  function animate(element: HTMLElement | null, frames: Keyframe[], duration = 240, delay = 0) {
    if (!element || element.hidden) return;
    const animation = element.animate(frames, {duration, delay, easing: ease, fill: 'backwards'});
    animations.add(animation);
    animation.finished.catch(() => {}).finally(() => animations.delete(animation));
    return animation;
  }
  function enter(element: HTMLElement | null, {x = 0, y = 0, delay = 0, duration = 240} = {}) {
    return animate(
      element,
      [
        {opacity: 0, transform: `translate3d(${x}px,${y}px,0)`},
        {opacity: 1, transform: 'translate3d(0,0,0)'},
      ],
      duration,
      delay,
    );
  }
  function arrive(stage: number, direction = 1, fromLanding = false) {
    const screen = root.querySelector<HTMLElement>(`[data-screen="${stage}"]`)!;
    if (stage === 0) {
      enter(screen.querySelector('.landing-effect-stage'), {y: 18, duration: 280});
      enter(screen.querySelector('.lobby-start'), {y: 12, delay: 45});
      enter(screen.querySelector('.lobby-start-hint'), {delay: 70});
    } else if (stage === 1) {
      const delay = fromLanding ? 140 : 0;
      enter(screen.querySelector('.lobby-section-title'), {x: 18 * direction, delay});
      screen
        .querySelectorAll<HTMLElement>('.lobby-slot')
        .forEach((slot, i) => enter(slot, {y: 14, delay: delay + Math.min(i * 12, 72), duration: 200}));
      screen
        .querySelectorAll<HTMLElement>('.entry-card')
        .forEach((card, i) => enter(card, {y: fromLanding ? 32 : 16, delay: delay + Math.min(i * 35, 140), duration: fromLanding ? 360 : 240}));
      enter(screen.querySelector('.lobby-selected-name'), {x: -42 * direction, duration: 260});
      enter(screen.querySelector('.lobby-profile'), {y: 14, delay: 35});
      enter(root.querySelector('.lobby-preview'), {x: 32 * direction, delay: 25, duration: 260});
    } else {
      enter(screen.querySelector('.lobby-map-heading'), {x: 18 * direction});
      screen
        .querySelectorAll<HTMLElement>('.lobby-map-card')
        .forEach((card, i) => enter(card, {x: 28 * direction, delay: i * 35, duration: 250}));
      enter(screen.querySelector('.lobby-mode'), {y: 12, delay: 50});
    }
    enter(root.querySelector('[aria-current="step"] span'), {y: -6, duration: 180});
  }
  reduced.addEventListener(
    'change',
    () => {
      if (reduced.matches) clear();
    },
    {signal},
  );
  signal.addEventListener('abort', clear, {once: true});
  return {
    intro() {
      if (!reduced.matches) arrive(0);
    },
    before(from: number, to: number, keyboard: boolean) {
      clear();
      if (reduced.matches || (keyboard && from !== 0 && to !== 0) || from === to) return;
      root.dataset.transitioning = 'true';
      if (from === 0) root.dataset.landingTransition = 'true';
      const source = root.querySelector<HTMLElement>(`[data-screen="${from}"]`)!;
      ghost = source.cloneNode(true) as HTMLElement;
      // Canvas pixels are not copied by cloneNode. Preserve the rendered shader
      // during the landing exit instead of revealing an empty canvas mid-fade.
      source.querySelectorAll('canvas').forEach((canvas, index) => {
        const copy = ghost!.querySelectorAll('canvas')[index];
        if (!copy) return;
        const snapshot = document.createElement('img');
        snapshot.className = copy.className;
        snapshot.alt = '';
        snapshot.style.cssText = copy.style.cssText;
        snapshot.src = canvas.toDataURL();
        copy.replaceWith(snapshot);
      });
      ghost.removeAttribute('data-screen');
      ghost.removeAttribute('aria-labelledby');
      ghost.removeAttribute('id');
      ghost.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
      // A visual exit only: no duplicate controls, focus targets, radio groups or IDs.
      ghost.inert = true;
      ghost.setAttribute('aria-hidden', 'true');
      ghost.classList.add('lobby-exit');
      ghost.querySelectorAll('input').forEach((input) => input.removeAttribute('name'));
      root.append(ghost);
      const exiting = ghost;
      const animation = animate(
        exiting,
        [
          {opacity: 1, transform: 'translateX(0)'},
          {opacity: 0, transform: `translateX(${from === 0 ? -48 : to > from ? -22 : 22}px)`},
        ],
        from === 0 ? 360 : 130,
      );
      animation?.finished
        .catch(() => {})
        .finally(() => {
          exiting.remove();
          if (ghost === exiting) ghost = null;
        });
    },
    after(from: number, to: number, keyboard: boolean) {
      if (reduced.matches || (keyboard && from !== 0 && to !== 0) || from === to) return;
      arrive(to, to > from ? 1 : -1, from === 0);
      Promise.allSettled([...animations].map((animation) => animation.finished)).then(() => {
        if (!animations.size) {
          delete root.dataset.transitioning;
          delete root.dataset.landingTransition;
        }
      });
    },
  };
}

export function createRaceEntryTransition(
  element: HTMLElement,
  {reduced, keyboard = false}: {reduced: MediaQueryList; keyboard?: boolean},
) {
  const events = new AbortController();
  let active: Animation | null = null,
    removed = false;
  element.classList.add('race-entry-cover');
  element.hidden = false;
  element.setAttribute('aria-live', 'polite');
  element.dataset.phase = 'covering';
  const meter = document.createElement('div');
  meter.className = 'race-entry-progress';
  meter.setAttribute('role', 'progressbar');
  meter.setAttribute('aria-label', 'Cargando circuito');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', '100');
  meter.setAttribute('aria-valuenow', '0');
  meter.innerHTML = '<span></span>';
  element.append(meter);
  document.body.append(element);
  function finishActive() {
    try {
      active?.finish();
    } catch {
      active?.cancel();
    }
  }
  reduced.addEventListener(
    'change',
    () => {
      if (reduced.matches) finishActive();
    },
    {signal: events.signal},
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) finishActive();
    },
    {signal: events.signal},
  );
  async function move(frames: Keyframe[], duration: number) {
    if (reduced.matches || keyboard || document.hidden || removed) return;
    active = element.animate(frames, {duration, easing: ease, fill: 'backwards'});
    await active.finished.catch(() => {});
    active = null;
  }
  const covered = move([{transform: 'translateX(105%)'}, {transform: 'translateX(0)'}], 260).then(() => {
    element.dataset.phase = 'loading';
  });
  function cancel() {
    if (removed) return;
    removed = true;
    active?.cancel();
    events.abort();
    element.remove();
  }
  return {
    covered,
    get animated() {
      return !reduced.matches && !keyboard;
    },
    mount() {
      if (!removed) document.body.append(element);
    },
    progress(value: number) {
      const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
      meter.setAttribute('aria-valuenow', String(percent));
      (meter.firstElementChild as HTMLElement).style.transform = `scaleX(${percent / 100})`;
    },
    async reveal() {
      this.progress(1);
      element.dataset.phase = 'revealing';
      await move([{transform: 'translateX(0)'}, {transform: 'translateX(-105%)'}], 280);
      cancel();
    },
    fail(message: string) {
      active?.cancel();
      events.abort();
      element.dataset.phase = 'error';
      element.replaceChildren();
      const text = document.createElement('p');
      text.textContent = message;
      const retry = document.createElement('button');
      retry.textContent = 'Reintentar';
      retry.onclick = () => location.reload();
      element.append(text, retry);
      retry.focus();
    },
    cancel,
  };
}
