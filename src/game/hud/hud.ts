import type {GamePhase} from '@/core/types';
import type {HoverState} from '@/sim/hover-state';
import {Minimap} from './minimap';
import type {RaceScreen} from './race-screen';

const HUD_INTERVAL = 0.1;

/**
 * Telemetry panel, drift tag, quality readout and minimap. Refreshes at
 * 10 Hz and only touches the DOM when a value changes.
 */
export class Hud {
  readonly minimap: Minimap;
  private readonly speed: HTMLElement;
  private readonly altitude: HTMLElement;
  private readonly energy: HTMLElement;
  private readonly energyBar: HTMLElement;
  private readonly energyValue: HTMLElement;
  private readonly drivingState: HTMLElement;
  private readonly drift: HTMLElement;
  private readonly qualityState: HTMLElement;
  private lastUpdate = -1;
  private lastEnergy = -1;

  constructor(private readonly screen: RaceScreen) {
    this.speed = screen.get('#flight-speed');
    this.altitude = screen.get('#flight-altitude');
    this.energy = screen.get('.flight-energy span');
    this.energyBar = screen.get('.flight-energy');
    this.energyValue = screen.get('#flight-energy-value');
    this.drivingState = screen.get('#flight-driving-state');
    this.drift = screen.get('.flight-drift');
    this.qualityState = screen.get('#flight-quality-state');
    this.minimap = new Minimap(screen.get<HTMLCanvasElement>('.flight-minimap canvas'), Minimap.paletteFrom(screen.app));
  }

  /** Forces the next `update` to refresh (after pause/reset). */
  invalidate(): void {
    this.lastUpdate = -1;
  }

  update(now: number, state: HoverState, {phase, altitude, fps}: {phase: GamePhase; altitude: number; fps: number}): void {
    if (now - this.lastUpdate < HUD_INTERVAL) return;
    this.lastUpdate = now;
    const {screen} = this;
    const driving =
      state.braking && state.speed > 0.1
        ? 'FRENANDO'
        : state.drifting
          ? 'DERRAPANDO'
          : state.boosting
            ? 'TURBO'
            : state.speed > 0.1
              ? 'EN MARCHA'
              : 'DETENIDO';
    screen.setText(this.drivingState, driving);
    screen.setText(this.speed, String(Math.round(state.speed * 3.6)));
    screen.setText(this.altitude, Math.max(0, altitude).toFixed(1));
    if (state.energy !== this.lastEnergy) {
      this.lastEnergy = state.energy;
      const energy = Math.round(state.energy * 100);
      this.energy.style.transform = `scaleX(${state.energy})`;
      this.energyBar.setAttribute('aria-valuenow', String(energy));
      screen.setText(this.energyValue, `${energy}%`);
    }
    const drifting = state.drifting && phase === 'flying';
    if (this.drift.hidden === drifting) this.drift.hidden = !drifting;
    screen.setText(this.qualityState, fps ? `${fps} FPS` : 'Se adapta a tu equipo');
    this.minimap.draw(state);
  }
}
