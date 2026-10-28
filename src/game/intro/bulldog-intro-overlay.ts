import {BULLDOG_INTRO, type IntroShot} from './bulldog-intro';
import './bulldog-intro.css';

const WIPE_MS = 360;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const OVERLAY_HTML = `<div class="bulldog-intro-bar" data-edge="top"></div><div class="bulldog-intro-bar" data-edge="bottom"></div>
    <p class="bulldog-intro-caption" aria-live="polite"><span></span><b></b></p>
    <div class="bulldog-intro-title" aria-hidden="true"><span>039</span><strong>Bulldog</strong><small>Nave Bulldog · Hovercraft</small></div>
    <button type="button" class="bulldog-intro-skip">Saltar <kbd>Enter</kbd></button>
    <div class="bulldog-intro-wipe" aria-hidden="true"></div>`;

function find<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

export interface IntroOverlayOptions {
  /** The skip button was pressed. */
  onSkip: () => void;
}

/** Letterbox, shot captions, title card and a paper wipe back to the grid. */
export class IntroOverlay {
  readonly root: HTMLElement;
  private readonly counter: HTMLElement;
  private readonly caption: HTMLElement;

  constructor(parent: HTMLElement, {onSkip}: IntroOverlayOptions) {
    const root = document.createElement('section');
    root.className = 'bulldog-intro';
    root.setAttribute('aria-label', 'Presentación de la Bulldog 039');
    root.innerHTML = OVERLAY_HTML;
    const caption = find<HTMLElement>(root, '.bulldog-intro-caption');
    this.counter = find<HTMLElement>(caption, 'span');
    this.caption = find<HTMLElement>(caption, 'b');
    find<HTMLButtonElement>(root, '.bulldog-intro-skip').addEventListener('click', () => onSkip());
    parent.append(root);
    this.root = root;
  }

  /** Updates the caption; a no-op while the shot is unchanged. */
  setShot(shot: IntroShot): void {
    const {root} = this;
    if (root.dataset.shot === shot.id) return;
    root.dataset.shot = shot.id;
    this.counter.textContent = `${String(BULLDOG_INTRO.indexOf(shot) + 1).padStart(2, '0')} / ${String(BULLDOG_INTRO.length).padStart(2, '0')}`;
    this.caption.textContent = shot.caption;
  }

  // Cover the screen, let the caller move the ship back to the grid, then reveal.
  async cover(): Promise<void> {
    this.root.dataset.wipe = 'in';
    await wait(WIPE_MS);
  }

  async reveal(): Promise<void> {
    this.root.dataset.wipe = 'out';
    await wait(WIPE_MS);
    this.root.remove();
  }

  remove(): void {
    this.root.remove();
  }
}
