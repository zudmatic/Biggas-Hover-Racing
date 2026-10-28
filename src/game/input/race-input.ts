import {MathUtils} from 'three';
import {DisposableGroup, type Disposable} from '@/core/disposable';
import type {HoverInput} from '@/sim/hover-state';
import type {RacerController} from '../controllers/controller';

/** One-shot actions bound to keys. */
export type RaceAction = 'pause' | 'skipIntro' | 'toggleSound' | 'toggleHeadlights' | 'changeCamera' | 'useItem' | 'recover';

type HoldControl = 'accelerate' | 'brake' | 'boost' | 'drift';

interface TouchState {
  turn: number;
  accelerate: boolean;
  brake: boolean;
  boost: boolean;
  drift: boolean;
}

export interface RaceInputOptions {
  /** Root of the race screen (touch stick + hold buttons live inside). */
  root: HTMLElement;
  /** Whether held driving keys are being captured (true while flying). */
  isDriving: () => boolean;
  isIntro: () => boolean;
  /** Called on any first interaction, to unlock audio inside the gesture. */
  onGesture: () => void;
  onAction: (action: RaceAction) => void;
  reducedMotion: () => boolean;
}

const STEER_RIGHT = ['KeyD', 'ArrowRight'];
const STEER_LEFT = ['KeyA', 'ArrowLeft'];
const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

/**
 * Keyboard + touch controls for the local player. Implements `RacerController`
 * so the player is driven exactly like AI or network racers.
 */
export class RaceInput implements RacerController, Disposable {
  private readonly keys = new Set<string>();
  private readonly touch: TouchState = {turn: 0, accelerate: false, brake: false, boost: false, drift: false};
  private readonly events = new DisposableGroup();
  private readonly stick: HTMLElement | null;
  private readonly knob: HTMLElement | null;
  private stickPointer: number | null = null;

  constructor(private readonly options: RaceInputOptions) {
    const {root} = options;
    this.stick = root.querySelector<HTMLElement>('.flight-stick');
    this.knob = root.querySelector<HTMLElement>('.flight-stick span');
    const {events} = this;
    events.listen(document, 'keydown', (event) => this.keydown(event));
    events.listen(document, 'keyup', (event) => this.keys.delete(event.code));
    this.bindStick();
    this.bindHoldButtons();
  }

  /** Current driving intent (keyboard and touch combined). */
  sample(): HoverInput {
    const {keys, touch} = this;
    const has = (codes: string[]) => codes.some((code) => keys.has(code));
    return {
      reducedMotion: this.options.reducedMotion(),
      turn: MathUtils.clamp(Number(has(STEER_RIGHT)) - Number(has(STEER_LEFT)) + touch.turn, -1, 1),
      throttle: Number(keys.has('KeyW') || touch.accelerate) - Number(keys.has('KeyS')),
      boost: keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.boost,
      brake: keys.has('Space') || touch.brake,
      drift: keys.has('KeyE') || touch.drift,
    };
  }

  /** Releases every held key and touch control (pause, blur, menus). */
  clear(): void {
    this.keys.clear();
    Object.assign(this.touch, {turn: 0, accelerate: false, brake: false, boost: false, drift: false});
    this.stickPointer = null;
    if (this.knob) this.knob.style.transform = 'none';
    for (const button of this.options.root.querySelectorAll('[data-hold]')) button.setAttribute('aria-pressed', 'false');
  }

  reset(): void {
    this.clear();
  }

  dispose(): void {
    this.events.dispose();
  }

  private keydown(event: KeyboardEvent): void {
    const {options} = this;
    if (options.isIntro()) {
      if (['Enter', 'Escape', 'Space'].includes(event.code) && !event.repeat) {
        event.preventDefault();
        options.onAction('skipIntro');
      }
      return;
    }
    if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault();
      options.onAction('pause');
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return;
    if (target?.closest?.('summary')) return;
    if (event.code === 'Space' && target?.closest?.('button,a')) return;
    if (SCROLL_KEYS.includes(event.code)) event.preventDefault();
    if (!event.repeat) {
      if (event.code === 'KeyM') {
        event.preventDefault();
        options.onAction('toggleSound');
      }
      if (event.code === 'KeyF') {
        event.preventDefault();
        options.onAction('toggleHeadlights');
      }
      if (event.code === 'KeyC') options.onAction('changeCamera');
      if (event.code === 'KeyQ' && options.isDriving()) {
        event.preventDefault();
        options.onAction('useItem');
      }
      if (event.code === 'KeyR' && options.isDriving()) options.onAction('recover');
    }
    if (options.isDriving()) {
      options.onGesture();
      this.keys.add(event.code);
    }
  }

  private bindStick(): void {
    const {stick} = this;
    if (!stick) return;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== this.stickPointer) return;
      const rect = stick.getBoundingClientRect();
      const radius = rect.width * 0.33;
      this.touch.turn = MathUtils.clamp((event.clientX - rect.left - rect.width / 2) / radius, -1, 1);
      if (this.knob) this.knob.style.transform = `translateX(${this.touch.turn * radius}px)`;
    };
    this.events.listen(stick, 'pointerdown', (event) => {
      if (this.stickPointer !== null) return;
      this.options.onGesture();
      this.stickPointer = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      move(event);
    });
    this.events.listen(stick, 'pointermove', move);
    const release = (event: PointerEvent) => {
      if (event.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.touch.turn = 0;
      if (this.knob) this.knob.style.transform = 'none';
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.events.listen(stick, type, release);
  }

  private bindHoldButtons(): void {
    for (const button of this.options.root.querySelectorAll<HTMLElement>('[data-hold]')) {
      const control = button.dataset.hold as HoldControl;
      let pointerId: number | null = null;
      this.events.listen(button, 'pointerdown', (event) => {
        if (pointerId !== null) return;
        this.options.onGesture();
        pointerId = event.pointerId;
        button.setPointerCapture(pointerId);
        this.touch[control] = true;
        button.setAttribute('aria-pressed', 'true');
      });
      const release = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        pointerId = null;
        this.touch[control] = false;
        button.setAttribute('aria-pressed', 'false');
      };
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.events.listen(button, type, release);
    }
  }
}
