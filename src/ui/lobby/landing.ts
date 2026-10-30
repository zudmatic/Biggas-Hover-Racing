import './landing.css';
import {landingLensParams} from './landing-lens';
import {mountLandingShader} from './landing-shader';

/** Figma 1375:11526: native vectors and authored lens-distortion shader. */
export function landingMarkup(base: string) {
  const asset = (name: string) => `${base}images/landing/${name}.svg`;
  return `<section class="lobby-screen lobby-landing" data-screen="0" aria-labelledby="lobby-title-0">
    <div class="landing-effect-stage"><div class="landing-shader-host"></div></div>
    <div class="landing-source" hidden>
    <div class="landing-scene">
    <div class="landing-grid-plane"><img class="landing-grid" src="${asset('grid')}" alt=""></div>
    <div class="landing-design-plane">
      <div class="lobby-title-mark">

        <div aria-hidden="true">
          <img class="landing-logo-layer landing-logo-shadow" src="${asset('logo-shadow')}" alt="">
          <img class="landing-logo-layer landing-logo-orbit" src="${asset('logo-orbit')}" alt="">
          <span class="landing-logo-caption landing-logo-series">Base Friends // Original Game Series</span>
          <span class="landing-logo-caption landing-logo-trademark">TM</span>
          <img class="landing-logo-layer landing-logo-wordmark" src="${asset('logo-wordmark')}" alt="">
          <img class="landing-logo-layer landing-logo-detail" src="${asset('logo-detail')}" alt="">
          <span class="landing-logo-caption landing-logo-subtitle">HOVER RACING</span>
          <img class="landing-logo-layer landing-logo-highlight" src="${asset('logo-highlight')}" alt="">
        </div>
      </div>
      <div class="landing-start-art">START</div>
    </div>
    <div class="landing-metal-bar landing-metal-top"></div><div class="landing-metal-bar landing-metal-bottom"></div>
    </div></div>
    <h1 id="lobby-title-0" class="lobby-sr-only" tabindex="-1">BIGGAS Hover Racing</h1>
    <button class="lobby-start" type="button" aria-label="Start"><span class="lobby-sr-only">START</span></button>
  </section>`;
}

export function fitLanding(root: HTMLElement, signal: AbortSignal) {
  const landing = root.querySelector<HTMLElement>('.lobby-landing')!;
  const source = landing.querySelector<HTMLElement>('.landing-source')!;
  const markup = source.innerHTML;
  source.remove();
  const host = landing.querySelector<HTMLElement>('.landing-shader-host')!;
  let width = root.clientWidth, height = root.clientHeight;
  function fit() {
    const scale = Math.min(width / 1440, height / 1000);
    root.style.setProperty('--landing-scale', String(scale));
    root.style.setProperty('--landing-cover-scale', String(Math.max(width / 1440, height / 1000)));
    syncHitArea();
  }
  function syncHitArea() {
    const art = host.querySelector<HTMLElement>('.landing-start-art');
    const active = !!host.querySelector('canvas');
    landing.dataset.shader = active ? 'active' : 'fallback';
    // Invert the same radial mapping as the authored shader for the native Start hit area.
    const map = (x: number, y: number) => {
      const radius = Math.hypot(host.clientWidth, host.clientHeight) / 2;
      const distance = Math.hypot(x, y);
      let lo = 0, hi = distance;
      if (active) for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2, r2 = (mid / radius) ** 2;
        if (mid * (1 + landingLensParams.distortionStrength * (r2 + r2 * r2)) > distance) hi = mid;
        else lo = mid;
      }
      const ratio = active && distance ? (lo + hi) / 2 / distance : 1;
      return [width / 2 + x * ratio, height / 2 + y * ratio];
    };
    if (!art || !host.clientWidth || !host.clientHeight) return;
    // Measure the artwork after its shared transform so the native hit area follows the lens.
    const bounds = host.getBoundingClientRect(), rect = art.getBoundingClientRect();
    const left = rect.left - bounds.left - bounds.width / 2, right = left + rect.width;
    const top = rect.top - bounds.top - bounds.height / 2, bottom = top + rect.height;
    const corners = [map(left, top), map(right, top), map(left, bottom), map(right, bottom)];
    const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
    const button = landing.querySelector<HTMLElement>('.lobby-start')!;
    button.style.left = `${(Math.min(...xs) + Math.max(...xs)) / 2}px`;
    button.style.top = `${(Math.min(...ys) + Math.max(...ys)) / 2}px`;
    button.style.width = `${Math.max(44, Math.max(...xs) - Math.min(...xs))}px`;
    button.style.height = `${Math.max(44, Math.max(...ys) - Math.min(...ys))}px`;
  }
  fit();
  const unmount = mountLandingShader(host, markup, syncHitArea);
  const observer = new ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    fit();
  });
  observer.observe(root);
  const rendered = new MutationObserver(fit);
  rendered.observe(host, {childList: true, subtree: true});
  document.fonts.ready.then(() => {if (!signal.aborted) fit();});
  signal.addEventListener('abort', () => {observer.disconnect(); rendered.disconnect(); unmount();}, {once: true});
}
