import {shipLiveryMarkup} from '@/ui/vehicle-livery/vehicle-livery';

// Static hangar page markup. Pure string building, so the DOM stays byte-identical to the original page.

export interface HangarMarkupPart {
  id: string;
  name: string;
  tag: string;
}

export interface HangarMarkupInput {
  /** Vite base URL. */
  base: string;
  ship: {id: string; name: string; title: string; file: string; windshield?: boolean; paint?: boolean};
  parts: readonly HangarMarkupPart[];
  /** Every hangar ship, in picker order. */
  ships: readonly {id: string; name: string}[];
  /** `pilot=…&palette=…&hat=…` carried across hangar and game links. */
  pilotParams: string;
  hat: string;
  livery: string;
  pilotName: string;
  downloadUrl: string;
}

export const HANGAR_VIEWS = [
  ['perspective', '3/4'],
  ['front', 'Frente'],
  ['side', 'Perfil'],
  ['back', 'Atrás'],
  ['top', 'Arriba'],
] as const;

export type HangarViewName = (typeof HANGAR_VIEWS)[number][0];

const header = ({base, ship, pilotParams}: HangarMarkupInput): string =>
  '<header class="ship-header">' +
  `<a class="ship-brand" href="${base}" aria-label="Biggas Hover Racing, inicio"><span class="ship-mark" aria-hidden="true">✳</span><strong>BIGGAS<small>HOVER RACING</small></strong><span class="ship-header-tag">Hangar</span></a>` +
  `<nav aria-label="Navegación del hangar"><a class="ship-back" href="${base}?vehicle=${ship.id}&${pilotParams}"><span aria-hidden="true">←</span> Volver al inicio</a></nav>` +
  '</header>';

const intro = ({base, ship, ships, pilotParams}: HangarMarkupInput): string => {
  const picker = ships
    .map(
      (item) =>
        `<a href="${base}spaceship.html?vehicle=${item.id}&${pilotParams}" ${item.id === ship.id ? 'aria-current="page"' : ''}>${item.name}</a>`,
    )
    .join('');
  const studio =
    ship.id === 'bluleet'
      ? `<a class="ship-studio" href="${base}chubee-studio.html">Estudio de tinta <span aria-hidden="true">✦</span></a>`
      : '';
  return (
    '<section class="ship-intro">' +
    `<div class="ship-heading"><span class="ship-eyebrow">HANGAR / EXPLORÁ TU NAVE</span><h1>${ship.title}<span class="ship-title-number">${ship.id}</span></h1></div>` +
    '<div class="ship-intro-actions">' +
    `<nav class="ship-picker" aria-label="Naves del hangar">${picker}</nav>` +
    studio +
    `<a class="ship-simulator" href="${base}?vehicle=${ship.id}&${pilotParams}">Simulador de vuelo <span aria-hidden="true">▶</span></a>` +
    '</div></section>'
  );
};

const viewport = ({ship, parts, hat}: HangarMarkupInput): string => {
  const hotspots = parts
    .map(
      (part) =>
        `<button class="ship-hotspot" hidden disabled data-hotspot="${part.id}" aria-label="Identificar ${part.name}" aria-pressed="false" title="${part.name}">${part.tag}</button>`,
    )
    .join('');
  const views = HANGAR_VIEWS.map(
    ([view, label]) => `<button data-ship-view="${view}" aria-pressed="${view === 'perspective'}" disabled>${label}</button>`,
  ).join('');
  return [
    `<section class="ship-viewport" aria-label="Hangar 3D de ${ship.title}" data-vehicle="${ship.id}" data-hat="${hat}" data-ready="false">`,
    '        <canvas class="ship-canvas" tabindex="0" aria-label="Nave 3D. Arrastrá para girar, rueda para acercar y clic para identificar una pieza."></canvas>',
    `        <div class="ship-stage-top"><span>HANGAR / ${ship.id}</span><span class="ship-status"><i class="ship-dot"></i><span id="ship-phase" role="status">EN HANGAR</span></span></div>`,
    `        <div class="ship-labels">${hotspots}</div>`,
    '        <div class="ship-stage-specs"><p title="Ancho × alto × largo en unidades de autoría">…</p></div>',
    '        <div class="ship-viewbar">' +
      `<div class="ship-views" role="group" aria-label="Vistas de la nave">${views}</div>` +
      '<div class="ship-tools"><button id="ship-rotate" aria-label="Giro automático" aria-pressed="false" title="Giro automático" disabled>⟳</button><button id="ship-reset" aria-label="Restablecer vista y nave" title="Restablecer vista y nave" disabled>⌖</button></div>' +
      '</div>',
    `        <div class="ship-loader" role="status"><span>Preparando el hangar…<br><small>Cargando ${ship.name}</small></span></div>`,
    '      </section>',
  ].join('\n');
};

const transport = (): string =>
  '<section class="ship-transport" aria-label="Animación de la nave">' +
  '<button class="ship-play" id="ship-play" aria-label="Iniciar vuelo" disabled>▶</button>' +
  '<div><p class="ship-track-title">Vuelo</p><div class="ship-track-status" id="ship-play-status" role="status">18 SEGUNDOS</div></div>' +
  '<div class="ship-track"><input class="ship-timeline" id="ship-time" aria-label="Tiempo de la animación" type="range" min="0" max="18" step="0.01" value="0" disabled><div class="ship-track-labels"><span>Encendido</span><span>Despegue</span><span>Vuelo</span><span>Aterrizaje</span></div></div>' +
  '<div class="ship-playback"><span id="ship-time-label">00:00 / 00:18</span><select id="ship-speed" aria-label="Velocidad de animación" disabled><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option></select><button id="ship-loop" aria-label="Repetir vuelo" aria-pressed="false" title="Repetir vuelo" disabled>↻</button></div>' +
  '</section>';

const panel = ({ship, parts, pilotName, livery}: HangarMarkupInput): string => {
  const list = parts
    .map(
      (part) =>
        `<button class="ship-part" data-part="${part.id}" aria-pressed="false" disabled><span class="ship-part-number">${part.tag}</span><span><span class="ship-part-name">${part.name}</span></span></button>`,
    )
    .join('');
  const toggles =
    `<label class="ship-switch">${ship.windshield ? 'Abrir parabrisas' : 'Abrir cabina'}<input id="ship-canopy" type="checkbox" disabled></label>` +
    `<label class="ship-switch">${ship.windshield ? 'Ocultar parabrisas' : 'Ocultar cabina'}<input id="ship-hide-canopy" type="checkbox" disabled></label>` +
    `<label class="ship-switch">${pilotName} al mando<input id="ship-pilot" type="checkbox" disabled></label>` +
    '<label class="ship-switch">Desarmar<input id="ship-explode" type="checkbox" disabled></label>' +
    '<label class="ship-switch">Etiquetas<input id="ship-label-toggle" type="checkbox" disabled></label>' +
    '<button id="ship-comic" class="ship-comic" aria-pressed="true" disabled><span aria-hidden="true">◐</span> Cómic</button>';
  return [
    `<aside class="ship-panel" aria-label="Componentes de la nave"><div class="ship-panel-top"><h2>Componentes</h2><span>${String(parts.length).padStart(2, '0')}</span></div>`,
    `      ${ship.paint ? shipLiveryMarkup(livery) : ''}<div class="ship-part-list">${list}</div>`,
    '      <p class="sr-only" id="ship-description" aria-live="polite"></p>',
    `      <div class="ship-toggles">${toggles}</div>`,
    '      </aside>',
  ].join('\n');
};

const footer = ({ship, downloadUrl}: HangarMarkupInput): string =>
  '<footer class="ship-footer">' +
  '<span><span class="ship-desktop-hint">ARRASTRÁ PARA GIRAR · SCROLL PARA ACERCAR</span><span class="ship-mobile-hint">GIRÁ CON UN DEDO · ZOOM CON DOS</span><span class="ship-key-hint"> &nbsp; / &nbsp; ESPACIO: PLAY / PAUSA</span></span>' +
  `<a href="${downloadUrl}" download="${ship.file}">DESCARGAR GLB</a>` +
  '</footer>';

/**
 * The whole hangar page. The transport bar sits inside the workspace, between the 3D viewport and the
 * parts panel; the blank lines keep the whitespace the page has always had.
 */
export function hangarMarkup(input: HangarMarkupInput): string {
  return [
    '<main class="ship-app"><div class="ship-paper-surface" aria-hidden="true"></div>',
    `    ${header(input)}`,
    `    ${intro(input)}`,
    '    <div class="ship-workspace">',
    `      ${viewport(input)}`,
    `      ${transport()}${panel(input)}`,
    '    </div>',
    '    ',
    `    ${footer(input)}`,
    '  </main>',
  ].join('\n');
}
