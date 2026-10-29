import {SoundControl} from '@/ui/sound-control/sound-control';
import './race-screen.css';
import type {GamePhase} from '@/core/types';

export interface RaceScreenContent {
  pilotName: string;
  vehicleId: string;
  vehicleName: string;
  trackName: string;
  trackNumber: string;
  /** Lobby link back to the team selection (query string already built). */
  teamHref: string;
  mapSelectionHref: string;
  homeHref: string;
  hangarHref: string;
  comic: boolean;
}

const NOTICE_MS = 2300;

/**
 * The race page DOM: canvas, HUD panels, pause menu, loader, notices and
 * touch controls. Owns visibility per phase; the session wires behaviour.
 */
export class RaceScreen {
  readonly app: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly loader: HTMLElement;
  private readonly noticeElement: HTMLElement;
  private noticeUntil = 0;

  constructor(content: RaceScreenContent) {
    document.body.innerHTML = RaceScreen.markup(content);
    this.app = this.get<HTMLElement>('.flight-app');
    this.canvas = this.get<HTMLCanvasElement>('.flight-canvas');
    this.loader = this.get<HTMLElement>('.flight-loader');
    this.noticeElement = this.get<HTMLElement>('.flight-notice');
  }

  get<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Pantalla de carrera: falta ${selector}`);
    return element;
  }

  setText(element: Element, text: string): void {
    if (element.textContent !== text) element.textContent = text;
  }

  setProgress(value: number): void {
    this.get<HTMLProgressElement>('.flight-loader progress').value = value;
  }

  setLoadStatus(text: string): void {
    this.setText(this.get('#flight-load-status'), text);
  }

  /** Shows a transient message (e.g. "Faros encendidos"). */
  notice(text: string): void {
    this.setText(this.noticeElement, text);
    this.noticeElement.hidden = false;
    this.noticeUntil = performance.now() + NOTICE_MS;
  }

  hideNotice(): void {
    this.noticeElement.hidden = true;
    this.noticeUntil = 0;
  }

  /** Expires the notice; call once per frame. */
  update(now: number): void {
    if (this.noticeUntil && now > this.noticeUntil) this.hideNotice();
  }

  /** Replaces the loader with an error and a retry button. */
  fail(message: string): void {
    this.loader.hidden = false;
    this.loader.replaceChildren();
    const text = document.createElement('p');
    text.textContent = message;
    const retry = document.createElement('button');
    retry.textContent = 'Reintentar';
    retry.onclick = () => location.reload();
    this.loader.append(text, retry);
  }

  /** Panel visibility per phase. */
  showPhase(phase: GamePhase): void {
    this.app.dataset.phase = phase;
    this.get<HTMLElement>('.flight-status').hidden = phase !== 'flying';
    this.get<HTMLElement>('.flight-menu').hidden = phase !== 'paused';
    this.get<HTMLElement>('.flight-touch').hidden = phase !== 'flying';
    this.get<HTMLButtonElement>('#flight-camera').disabled = phase === 'loading';
    if (phase === 'paused') {
      this.get('#flight-menu-title').textContent = 'En pausa.';
      this.get<HTMLElement>('.flight-menu').scrollTop = 0;
      this.get<HTMLElement>('#flight-resume').focus({preventScroll: true});
    }
  }

  static markup(c: RaceScreenContent): string {
    const pilot = c.pilotName.toUpperCase();
    return `<main class="flight-app" data-ready="false" data-phase="loading">
    <canvas class="flight-canvas" tabindex="0" aria-label="Circuito flotante. W y S para velocidad, A y D o flechas laterales para girar, E para derrapar, espacio para frenar, Shift para turbo, F para faros y Escape para pausar. Altura automática."></canvas>
    <section class="flight-status race-panel" aria-label="Estado de conducción" hidden><div><span class="flight-status-label">PILOTO</span><strong class="flight-status-value" id="flight-pilot">${pilot}</strong></div><div><span class="flight-status-label">NAVE</span><strong class="flight-status-value">${c.vehicleId}</strong></div><div class="flight-driving"><span class="flight-status-label">ESTADO</span><output class="flight-status-value" id="flight-driving-state" aria-live="off">DETENIDO</output></div></section>
    <section class="flight-menu race-panel" aria-label="Menú de vuelo" hidden><div class="flight-menu-tag"><span><b class="flight-player-tag">P1</b> ${pilot} AL MANDO</span><span id="flight-seed">HOVER</span></div><h1 id="flight-menu-title">${c.trackName} <span>${c.trackNumber}.</span></h1><a class="flight-team-link" href="${c.teamHref}"><span>${c.pilotName} × ${c.vehicleName}</span><span>Cambiar selección</span></a><button id="flight-resume" class="flight-primary race-primary">Continuar <span aria-hidden="true">→</span></button><button id="flight-restart">Reiniciar <span>↻</span></button><div class="flight-menu-sections"><details class="flight-controls"><summary>Controles <span aria-hidden="true">⌨</span></summary><div class="flight-section-body"><p class="flight-section-label">TECLADO</p><dl class="flight-controls-list"><div><dt>Acelerar / reducir velocidad</dt><dd><kbd>W / S</kbd></dd></div><div><dt>Girar</dt><dd><kbd>A / D · ← / →</kbd></dd></div><div><dt>Turbo</dt><dd><kbd>SHIFT</kbd></dd></div><div><dt>Frenar</dt><dd><kbd>ESPACIO</kbd></dd></div><div><dt>Derrapar</dt><dd><kbd>E</kbd></dd></div><div><dt>Recuperar nave</dt><dd><kbd>R</kbd></dd></div><div><dt>Aceite</dt><dd><kbd>Q</kbd></dd></div><div><dt>Faros</dt><dd><kbd>F</kbd></dd></div><div><dt>Cambiar cámara</dt><dd><kbd>C</kbd></dd></div><div><dt>Silenciar / activar sonido</dt><dd><kbd>M</kbd></dd></div><div><dt>Pausar / continuar</dt><dd><kbd>ESC</kbd></dd></div></dl><p class="flight-touch-help">En pantalla táctil: arrastrá el joystick para girar y mantené pulsados los botones para acelerar, frenar, derrapar o usar el turbo.</p></div></details>
      <details class="flight-options"><summary>Opciones <span aria-hidden="true">⚙</span></summary><div class="flight-section-body">
        ${SoundControl.markup('flight-sound').replace('</button>', '<span>Sonido</span></button>')}
        <button id="flight-camera" disabled aria-label="Cambiar cámara">Cámara <span id="flight-camera-state">Cercana</span></button>
        <button id="flight-light" aria-label="Iluminación nocturna" aria-pressed="false">Iluminación <span id="flight-light-state">Día</span></button>
        <button id="flight-comic" aria-pressed="${c.comic}" aria-label="Cómic">Estilo cómic <span id="flight-comic-state">${c.comic ? 'Activado' : 'Desactivado'}</span></button>
        <div class="flight-quality"><label for="flight-quality">Gráficos</label><select id="flight-quality"><option value="auto">Automático</option><option value="high">Mayor calidad</option><option value="performance">Más fluidez</option></select><span id="flight-quality-state">Se adapta a tu equipo</span></div>
        <a class="flight-hangar-link" href="${c.hangarHref}">Ir al hangar <span aria-hidden="true">→</span></a>
      </div></details></div><nav class="flight-exit-links" aria-label="Salir del circuito"><a id="flight-map-selection" href="${c.mapSelectionHref}">Selección de mapa <span aria-hidden="true">→</span></a><a id="flight-main-menu" href="${c.homeHref}">Volver al menú principal <span aria-hidden="true">⌂</span></a></nav></section>
    <div class="flight-loader" role="status"><span id="flight-load-status">Preparando ${c.trackName} ${c.trackNumber}…</span><progress max="1" value="0"></progress></div>
    <div class="flight-notice" role="status" hidden></div>
    <section class="flight-telemetry race-panel race-panel-dark" aria-label="Telemetría"><span class="flight-hud-label">VELOCIDAD</span><div class="flight-speed"><output id="flight-speed">0</output><span>km/h</span></div><span class="flight-drift" hidden>DERRAPE</span><div class="flight-altitude">ALT <output id="flight-altitude">0</output> m</div><div class="flight-energy" role="progressbar" aria-label="Reserva de turbo" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span></span></div><div class="flight-energy-label"><span>TURBO</span><span id="flight-energy-value">100%</span></div></section>
    <aside class="flight-minimap race-panel race-panel-dark" aria-label="Mapa del circuito"><canvas width="192" height="192" role="img" aria-label="Tu posición en el circuito"></canvas><span id="flight-map-caption">${c.trackName.toUpperCase()} / ${c.trackNumber}</span></aside>
    <div class="flight-key-hint">ESC · PAUSA / CONTROLES</div>
    <div class="flight-touch" hidden><div class="flight-stick" role="group" aria-label="Joystick: girar"><span></span></div><div class="flight-touch-buttons"><button data-hold="accelerate" aria-label="Acelerar" aria-pressed="false">ACELERAR</button><button data-hold="brake" aria-label="Frenar" aria-pressed="false">FRENAR</button><button data-hold="drift" aria-label="Derrapar" aria-pressed="false">DERRAPAR</button><button data-hold="boost" aria-label="Turbo" aria-pressed="false">TURBO</button></div></div>
  </main>`;
  }
}
