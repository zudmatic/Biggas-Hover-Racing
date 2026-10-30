import {createLandingLens, drawSoftwareLens} from './landing-lens';
import {paintLanding} from './landing-paint';

/** Standard Canvas/WebGL rendering: no experimental flags or WebGPU dependency. */
export function mountLandingShader(host: HTMLElement, markup: string, syncHitArea: () => void) {
  const source = document.createElement('div');
  source.className = 'landing-render-content';
  source.setAttribute('aria-hidden', 'true');
  source.innerHTML = markup;
  host.append(source);
  let canvas = document.createElement('canvas');
  canvas.className = 'landing-shader';
  canvas.setAttribute('aria-hidden', 'true');
  let lens: ReturnType<typeof createLandingLens> = null;
  try {lens = createLandingLens(canvas);} catch { /* Software lens also works without a shader compiler. */ }
  if (!lens) {canvas = document.createElement('canvas');canvas.className = 'landing-shader';canvas.setAttribute('aria-hidden', 'true');}
  const texture = document.createElement('canvas');
  const background = new Image();
  const backgroundURL = getComputedStyle(source.querySelector('.landing-scene')!).backgroundImage;
  background.src = backgroundURL.slice(4, -1).replace(/^['"]|['"]$/g, '');
  const landing = host.closest<HTMLElement>('.lobby-landing')!;
  const plane = source.querySelector<HTMLElement>('.landing-design-plane')!;
  const button = landing.querySelector<HTMLButtonElement>('.lobby-start')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  const {signal} = events;
  let targetX = 0, targetY = 0, x = 0, y = 0, elapsed = 0, lastTime = 0;
  let disposed = false, ready = false, frame = 0;
  landing.addEventListener('pointermove', event => {
    if (reduced.matches || event.pointerType === 'touch' || button.matches(':hover, :focus-visible')) return;
    const bounds = landing.getBoundingClientRect();
    targetX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
    targetY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
    schedule();
  }, {signal});
  landing.addEventListener('pointerleave', () => {targetX = targetY = 0;schedule();}, {signal});
  reduced.addEventListener('change', () => {lastTime = 0;schedule();}, {signal});
  document.addEventListener('visibilitychange', () => {lastTime = 0;schedule();}, {signal});
  function render(now: number) {
    frame = 0;
    if (disposed || !ready) return;
    if (document.hidden || !host.clientWidth || !host.clientHeight) {lastTime = 0;return;}
    // Bound both fill rate and CPU work; no animation loop survives leaving the landing.
    const interval = lens ? 1000 / 30 : 1000 / 8;
    if (!reduced.matches && lastTime && now - lastTime < interval) {schedule();return;}
    const dt = lastTime ? Math.min((now - lastTime) / 1000, .1) : 0;
    lastTime = now;
    if (reduced.matches) {targetX = targetY = x = y = 0;elapsed = 0;}
    else {
      elapsed += dt;
      const ease = 1 - Math.exp(-dt * 8);
      x += (targetX - x) * ease;y += (targetY - y) * ease;
      if (Math.abs(targetX - x) < .001) x = targetX;
      if (Math.abs(targetY - y) < .001) y = targetY;
    }
    const travel = Math.min(1, landing.clientWidth / 1440, landing.clientHeight / 1000);
    plane.style.translate = `${(x * 24 * travel).toFixed(3)}px ${(y * 16 * travel).toFixed(3)}px`;
    const gridMotion = reduced.matches ? {x: 0, y: 0} : {
      x: (Math.sin(elapsed * .18) * 24 - x * 5) * travel,
      y: (Math.sin(elapsed * .14) * 30 - y * 4) * travel,
    };
    // Match physical display pixels. Only the actual GPU texture/viewport limit may cap quality.
    const cap = lens?.maxDimension ?? 1280;
    const ratio = Math.min(devicePixelRatio || 1, cap / Math.max(host.clientWidth, host.clientHeight));
    paintLanding(source, texture, background, ratio, gridMotion);
    if (lens) lens.draw(texture);else drawSoftwareLens(texture, canvas);
    if (!canvas.isConnected) host.append(canvas);
    host.dataset.renderer = lens ? 'webgl' : 'software';
    syncHitArea();
    if (!reduced.matches) schedule();
  }
  function schedule() {if (!frame && !disposed) frame = requestAnimationFrame(render);}
  const observer = new ResizeObserver(schedule);
  observer.observe(host);
  window.addEventListener('resize', schedule, {signal});
  // CSS/fonts are also used to position the native, accessible Start hit area.
  Promise.all([document.fonts.ready, background.decode(), ...Array.from(source.querySelectorAll('img'), image => image.decode())])
    .then(() => {ready = true;schedule();})
    .catch(error => {if (!disposed) console.error('Cannot load landing artwork', error);});
  const lost = (event: Event) => {
    event.preventDefault();
    // Switch to software after context loss; never drop the distortion from the preview.
    lens?.dispose();lens = null;
    const replacement = document.createElement('canvas');replacement.className = canvas.className;
    replacement.setAttribute('aria-hidden', 'true');canvas.replaceWith(replacement);canvas = replacement;
    schedule();
  };
  canvas.addEventListener('webglcontextlost', lost);
  return () => {
    disposed = true;cancelAnimationFrame(frame);observer.disconnect();events.abort();
    canvas.removeEventListener('webglcontextlost', lost);lens?.dispose();source.remove();canvas.remove();
  };
}
