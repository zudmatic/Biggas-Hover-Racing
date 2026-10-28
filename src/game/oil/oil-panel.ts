import './oil-gameplay.css';

const UNSET = Symbol('unset');

/** Wraps a DOM write so it only runs when the value changes (the HUD updates every frame). */
function whenChanged<T>(write: (value: T) => void): (value: T) => void {
  let last: T | typeof UNSET = UNSET;
  return (value) => {
    if (value === last) return;
    last = value;
    write(value);
  };
}

function find<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

const PANEL_HTML = [
  '<div class="oil-heading"><span class="oil-drop" aria-hidden="true">◆</span><strong>ACEITE</strong><span class="oil-slot">Vacío</span></div>',
  '<button class="oil-use" disabled>Soltar aceite <kbd>Q</kbd></button>',
  '<p class="oil-hint">Recogé un barril en la pista</p>',
  '<details class="oil-tools"><summary>Pruebas de aceite</summary><div class="oil-test">',
  '<button class="oil-prepare">Preparar prueba</button>',
  '<button class="oil-bot-drop">Bot tira aceite</button>',
  '<button class="oil-look" aria-pressed="false">Mirar atrás</button>',
  '<label><input class="oil-bot-toggle" type="checkbox" checked> Bot de prueba</label>',
  '<output class="oil-bot-status">Bot listo</output>',
  '</div></details>',
  '<output class="oil-player-status">Tu velocidad: 0 km/h</output>',
].join('');

export interface OilPanelHandlers {
  /** Pointer down anywhere on the panel (releases held driving input). */
  onPointerDown(): void;
  onUse(): void;
  onLook(): void;
  onPrepare(): void;
  onBotDrop(): void;
  onBotToggle(enabled: boolean): void;
}

/** The oil item card: slot, use button, hints and the test tools. */
export class OilPanel {
  readonly root: HTMLElement;
  readonly setHidden: (hidden: boolean) => void;
  readonly setCanUse: (enabled: boolean) => void;
  /** Enables the test buttons (prepare / bot drop). */
  readonly setCanTest: (enabled: boolean) => void;
  readonly setSlot: (text: string) => void;
  readonly setHint: (text: string) => void;
  readonly setBotStatus: (text: string) => void;
  readonly setPlayerStatus: (text: string) => void;
  /** Highlights the card while the player is slowed by oil. */
  readonly setSlow: (slow: boolean) => void;
  private readonly look: HTMLButtonElement;
  private readonly botToggle: HTMLInputElement;

  constructor(parent: HTMLElement, handlers: OilPanelHandlers) {
    const root = document.createElement('section');
    root.className = 'flight-oil';
    root.setAttribute('aria-label', 'Barril de aceite');
    root.innerHTML = PANEL_HTML;
    parent.append(root);
    this.root = root;

    const use = find<HTMLButtonElement>(root, '.oil-use');
    const prepare = find<HTMLButtonElement>(root, '.oil-prepare');
    const botDrop = find<HTMLButtonElement>(root, '.oil-bot-drop');
    this.look = find<HTMLButtonElement>(root, '.oil-look');
    this.botToggle = find<HTMLInputElement>(root, '.oil-bot-toggle');
    root.addEventListener('pointerdown', () => handlers.onPointerDown());
    root.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape') event.stopPropagation();
    });
    use.addEventListener('click', () => handlers.onUse());
    this.look.addEventListener('click', () => handlers.onLook());
    prepare.addEventListener('click', () => handlers.onPrepare());
    botDrop.addEventListener('click', () => handlers.onBotDrop());
    this.botToggle.addEventListener('change', () => handlers.onBotToggle(this.botToggle.checked));

    const text = (selector: string) => {
      const element = find<HTMLElement>(root, selector);
      return whenChanged((value: string) => {
        element.textContent = value;
      });
    };
    this.setHidden = whenChanged((hidden) => {
      root.hidden = hidden;
    });
    this.setCanUse = whenChanged((enabled) => {
      use.disabled = !enabled;
    });
    this.setCanTest = whenChanged((enabled) => {
      prepare.disabled = !enabled;
      botDrop.disabled = !enabled;
    });
    this.setSlot = text('.oil-slot');
    this.setHint = text('.oil-hint');
    this.setBotStatus = text('.oil-bot-status');
    this.setPlayerStatus = text('.oil-player-status');
    this.setSlow = whenChanged((slow) => {
      root.dataset.slow = String(slow);
    });
  }

  setLookingBack(lookingBack: boolean): void {
    this.look.setAttribute('aria-pressed', String(lookingBack));
    this.look.textContent = lookingBack ? 'Mirar adelante' : 'Mirar atrás';
  }

  setBotEnabled(enabled: boolean): void {
    this.botToggle.checked = enabled;
  }

  remove(): void {
    this.root.remove();
  }
}

/** Screen-space tag that follows the test bot. */
export class BotLabel {
  readonly element: HTMLDivElement;
  private readonly setHidden: (hidden: boolean) => void;
  private readonly setTransform: (transform: string) => void;
  private readonly setText: (text: string) => void;

  constructor(parent: HTMLElement) {
    const element = document.createElement('div');
    element.className = 'oil-bot-label';
    element.textContent = 'BOT DE PRUEBA';
    parent.append(element);
    this.element = element;
    this.setHidden = whenChanged((hidden) => {
      element.hidden = hidden;
    });
    this.setTransform = whenChanged((transform) => {
      element.style.transform = transform;
    });
    this.setText = whenChanged((text) => {
      element.textContent = text;
    });
  }

  hide(): void {
    this.setHidden(true);
  }

  /** Shows the label with its bottom centre at viewport pixel (x, y). */
  show(x: number, y: number, text: string): void {
    this.setHidden(false);
    this.setTransform(`translate(${x}px,${y}px) translate(-50%,-100%)`);
    this.setText(text);
  }

  remove(): void {
    this.element.remove();
  }
}
