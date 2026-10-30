import type {HoverState} from '@/sim/hover-state';
import type {Landscape} from '@/sim/landscape';

export type MinimapPalette = Record<'ink' | 'paper' | 'blue' | 'yellow' | 'muted' | 'dark', string>;

/** Draws extra markers (e.g. the oil test bot) over the minimap. */
export type MinimapLayer = (context: CanvasRenderingContext2D, half: number) => void;

const SIZE = 192;

/** Track outline rendered once; the player arrow and layers redraw on update. */
export class Minimap {
  private readonly context: CanvasRenderingContext2D;
  private readonly base = document.createElement('canvas');
  private ready = false;
  private landscape: Landscape | null = null;
  readonly layers: MinimapLayer[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    private readonly palette: MinimapPalette,
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Minimapa: canvas 2D no disponible.');
    this.context = context;
    this.base.width = this.base.height = SIZE;
  }

  /** Reads the race palette from the CSS custom properties of `element`. */
  static paletteFrom(element: Element): MinimapPalette {
    const theme = getComputedStyle(element);
    const read = (name: string) => theme.getPropertyValue(`--race-${name}`).trim();
    return {ink: read('ink'), paper: read('paper'), blue: read('blue'), yellow: read('yellow'), muted: read('muted'), dark: read('dark')};
  }

  build(landscape: Landscape): void {
    this.landscape = landscape;
    const ctx = this.base.getContext('2d');
    if (!ctx) return;
    const {palette} = this;
    const half = landscape.mapHalf;
    const project = (value: number) => (value / half + 1) * (SIZE / 2);
    ctx.fillStyle = palette.dark;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = palette.paper;
    ctx.lineWidth = 7;
    ctx.setLineDash([]);
    ctx.beginPath();
    landscape.samples.forEach((sample, i) => {
      const x = project(sample.position[0]);
      const y = project(sample.position[2]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.dark;
    ctx.stroke();
    this.ready = true;
    for (const shortcut of landscape.shortcuts.length ? landscape.shortcuts : landscape.shortcut ? [landscape.shortcut] : []) {
      ctx.strokeStyle = palette.yellow;
      ctx.lineWidth = 3;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      shortcut.forEach((p, i) => {
        const x = project(p[0]);
        const y = project(p[2]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  draw(state: HoverState): void {
    const {context, landscape} = this;
    if (!this.ready || !landscape) return;
    const half = landscape.mapHalf;
    context.drawImage(this.base, 0, 0);
    context.save();
    context.translate((state.x / half + 1) * (SIZE / 2), (state.z / half + 1) * (SIZE / 2));
    context.rotate(Math.PI - state.yaw);
    context.fillStyle = this.palette.yellow;
    context.strokeStyle = this.palette.ink;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(0, -7);
    context.lineTo(4, 4);
    context.lineTo(0, 2);
    context.lineTo(-4, 4);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();
    for (const layer of this.layers) layer(context, half);
  }
}
