import type {HullShape} from '@/content/vehicles/vehicle-definition';
import {createDialKit, createDialRoot, type DialConfig, type DialKitController} from '@/core/debug/dials';
import type {Disposable} from '@/core/disposable';
import 'dialkit/vanilla/styles.css';

/** Collision hull of a ship at model scale 1, used for any field a vehicle doesn't override. */
const ORIGINAL_HULL: Readonly<HullShape> = {
  halfWidth: 1.52,
  halfLength: 2.4,
  capsuleRadius: 1.25,
  capsuleSpacing: 0.9,
  capsuleBottom: 1.2,
  capsuleTop: 2.45,
};

const SCALE_DIALS = {
  Escala: [0.75, 0.35, 1.25, 0.01],
  Original: {type: 'action', label: 'Tamaño original · 1,00'},
} satisfies DialConfig;

/**
 * Development dial for the ship + pilot model scale. Mounts its own DialKit
 * host (the race's dev panel corner) and reports every change.
 */
export class ModelScaleDials implements Disposable {
  private readonly host: HTMLElement;
  private readonly root: ReturnType<typeof createDialRoot>;
  private readonly kit: DialKitController<typeof SCALE_DIALS>;
  private readonly unsubscribe: () => void;

  constructor(onChange: (scale: number) => void, onInteract: () => void) {
    const host = document.createElement('aside');
    host.className = 'flight-dials';
    host.setAttribute('aria-label', 'Ajustes de desarrollo');
    document.body.append(host);
    host.addEventListener('pointerdown', () => onInteract());
    host.addEventListener('keydown', (event) => event.stopPropagation());
    this.host = host;
    this.root = createDialRoot({
      target: host,
      defaultOpen: !matchMedia('(max-width:760px)').matches,
      position: 'top-right',
      theme: 'light',
    });
    this.kit = createDialKit('Tamaño · nave y piloto', SCALE_DIALS, {
      id: 'flight-scale',
      persist: true,
      defaultCollapsed: true,
      onAction: () => this.kit.setValue('Escala', 1),
    });
    this.unsubscribe = this.kit.subscribe((values) => onChange(values.Escala));
  }

  setVisible(visible: boolean): void {
    this.host.hidden = !visible;
  }

  dispose(): void {
    this.unsubscribe();
    this.kit.destroy();
    this.root.destroy();
    this.host.remove();
  }
}

/** The vehicle's collision hull (defaults filled in) scaled to the current model scale. */
export function scaledHull(config: {readonly hull?: Partial<HullShape>}, scale: number): HullShape {
  const hull: HullShape = {...ORIGINAL_HULL, ...config.hull};
  return {
    halfWidth: hull.halfWidth * scale,
    halfLength: hull.halfLength * scale,
    capsuleRadius: hull.capsuleRadius * scale,
    capsuleSpacing: hull.capsuleSpacing * scale,
    capsuleBottom: hull.capsuleBottom * scale,
    capsuleTop: hull.capsuleTop * scale,
  };
}
