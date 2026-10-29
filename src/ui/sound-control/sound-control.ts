import {audio} from '@/audio/audio-system';
import {DisposableGroup, type Disposable} from '@/core/disposable';
import {settings} from '@/core/settings';
import './sound-control.css';

export const soundIcon =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/><path class="sound-waves" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/><path class="sound-muted" d="m16 9 6 6m0-6-6 6"/></svg>';

export interface SoundControlOptions {
  signal?: AbortSignal;
  /** Called when the panel opens (e.g. to release held driving keys). */
  onOpen?: () => void;
}

/** Sound button + popover with music/effects volume and mute. */
export class SoundControl implements Disposable {
  private readonly events = new DisposableGroup();
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly music: HTMLInputElement;
  private readonly musicValue: HTMLOutputElement;
  private readonly effects: HTMLInputElement;
  private readonly effectsValue: HTMLOutputElement;
  private readonly mute: HTMLButtonElement;

  static markup(id: string): string {
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

  constructor(
    private readonly root: HTMLElement,
    {signal, onOpen = () => {}}: SoundControlOptions = {},
  ) {
    const find = <T extends Element>(selector: string) => {
      const element = root.querySelector<T>(selector);
      if (!element) throw new Error(`SoundControl: falta ${selector}`);
      return element;
    };
    this.button = find<HTMLButtonElement>('.sound-trigger');
    this.panel = find<HTMLElement>('.sound-panel');
    this.music = find<HTMLInputElement>('.sound-volume');
    this.musicValue = find<HTMLOutputElement>('.sound-volume-value');
    this.effects = find<HTMLInputElement>('.sound-effects-volume');
    this.effectsValue = find<HTMLOutputElement>('.sound-effects-value');
    this.mute = find<HTMLButtonElement>('.sound-mute');

    const {events} = this;
    events.listen(this.button, 'click', () => {
      if (!this.panel.hidden) {
        this.close();
        return;
      }
      this.panel.hidden = false;
      this.button.setAttribute('aria-expanded', 'true');
      this.position();
      onOpen();
      audio.unlock();
      this.music.focus({preventScroll: true});
    });
    events.listen(this.music, 'input', () => {
      const volume = Number(this.music.value) / 100;
      audio.music.setVolume(volume);
      if (volume > 0 && !audio.enabled) audio.setEnabled(true);
      audio.unlock();
    });
    events.listen(this.mute, 'click', () => this.toggleSound());
    events.listen(this.effects, 'input', () => {
      audio.setEffectsVolume(Number(this.effects.value) / 100);
      if (audio.effectsVolume > 0 && !audio.enabled) audio.setEnabled(true);
      audio.unlock();
      this.render();
    });
    events.listen(document, 'pointerdown', (event) => {
      if (!root.contains(event.target as Node)) this.close();
    });
    events.listen(root, 'focusout', (event) => {
      if (!root.contains(event.relatedTarget as Node | null)) this.close();
    });
    // Keep slider keys and Escape from steering the ship or changing lobby steps.
    events.listen(
      document,
      'keydown',
      (event) => {
        if (event.key === 'Escape' && !this.panel.hidden) {
          event.preventDefault();
          event.stopPropagation();
          this.close({focus: true});
          return;
        }
        if (this.panel.hidden || !root.contains(event.target as Node)) return;
        if (event.code === 'KeyM') {
          event.preventDefault();
          if (!event.repeat) this.toggleSound();
        }
        event.stopPropagation();
      },
      {capture: true},
    );
    events.listen(window, 'resize', () => this.position());
    events.add(audio.music.subscribe(() => this.render()));
    events.add(settings.on('change', () => this.render()));
    if (signal) {
      if (signal.aborted) this.dispose();
      else signal.addEventListener('abort', () => this.dispose(), {once: true});
    }
  }

  toggleSound(): void {
    audio.setEnabled(!audio.enabled);
    this.render();
  }

  close({focus = false}: {focus?: boolean} = {}): void {
    this.panel.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    if (focus) this.button.focus({preventScroll: true});
  }

  dispose(): void {
    this.events.dispose();
  }

  private render(): void {
    const percent = Math.round(audio.music.state.volume * 100);
    setRange(this.music, this.musicValue, percent);
    setRange(this.effects, this.effectsValue, Math.round(audio.effectsVolume * 100));
    this.button.dataset.muted = String(!audio.enabled);
    const label = this.mute.querySelector('span');
    if (label) label.textContent = audio.enabled ? 'Silenciar todo' : 'Activar sonido';
    this.mute.title = audio.enabled ? 'Silenciar todo · M' : 'Activar sonido · M';
  }

  private position(): void {
    if (this.panel.hidden) return;
    const rect = this.button.getBoundingClientRect();
    this.panel.style.left = `${Math.max(12, Math.min(rect.right - this.panel.offsetWidth, innerWidth - this.panel.offsetWidth - 12))}px`;
    this.panel.style.top = `${Math.max(12, Math.min(rect.bottom + 8, innerHeight - this.panel.offsetHeight - 12))}px`;
  }
}

function setRange(input: HTMLInputElement, output: HTMLOutputElement, percent: number): void {
  input.value = String(percent);
  input.setAttribute('aria-valuetext', `${percent}%`);
  input.style.setProperty('--sound-volume', `${percent}%`);
  output.textContent = `${percent}%`;
}
