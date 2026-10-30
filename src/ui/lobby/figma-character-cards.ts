import {lobbyCharacter, characterCardImage} from '@/content/characters/lineup';
import {ZUDMATIC_PALETTES} from '@/content/characters/zudmatic/palettes';
import './figma-character-select.css';

export const characterColors: Record<string, string> = {zudmatic: '#ffc011', bluleet: '#1064ff', lomi: '#bb10ff', ajo: '#ff8011', 'mr-kerry-capija': '#00d65b'};
const characterBackgrounds: Record<string, string> = {zudmatic: '#f90436', bluleet: '#ffbb03', lomi: '#00dca0', ajo: '#0654ff', 'mr-kerry-capija': '#9400ff'};
const artNames: Record<string, string> = {lomi: 'Lomi', bluleet: 'Bluleet', ajo: 'Ajo', zudmatic: 'Zudmatic'};
const plates: Record<string, string> = {zudmatic: '', bluleet: '1', lomi: '2', ajo: '3', 'mr-kerry-capija': ''};
export const selectionAsset = (base: string, name: string) => `${base}images/character-select/${name}`;
export const selectionArtwork = (base: string, pilot: string) => pilot === 'mr-kerry-capija' ? characterCardImage(base, pilot) : selectionAsset(base, `selected-Ilustracion${artNames[pilot]}.png`);
const image = (base: string, name: string, className: string) => `<img class="${className}" src="${selectionAsset(base, name)}" alt="" draggable="false">`;

/** Native controls over the design's individual exported artwork and vector layers. */
export function figmaPlayerCard(base: string, player: number, pilot?: string, ready = false, palette = 'Original') {
  const upcoming = Boolean(pilot && lobbyCharacter(pilot).comingSoon);
  const hasVariants = pilot !== 'mr-kerry-capija';
  const kind = pilot ? 'selected' : 'empty';
  const characterVariant = pilot === 'mr-kerry-capija' ? '-Kerry' : pilot ? plates[pilot] : '';
  // The COM corner treatment belongs to the column, independently of the character.
  const corners = !pilot && player % 2 === 1 ? 'selected-RecortesDeEsquina.svg' : `${kind}-RecortesDeEsquina${pilot && player === 2 ? '1' : ''}.svg`;
  const content = pilot ? `
    <img class="figma-character-art" src="${selectionArtwork(base, pilot)}" alt="" draggable="false">
    <div class="figma-card-copy"><span class="figma-player-number">${player}P</span>
      <span class="figma-ready" role="status" aria-label="Jugador ${player}, listo" ${ready ? '' : 'hidden'}>${image(base, 'ready-PlacaDiagonal.svg', 'figma-ready-plate')}<span>READY!</span></span>
      <div class="figma-character-name">${image(base, `selected-PlacaDiagonal${plates[pilot]}.svg`, 'figma-name-plate')}<strong>${lobbyCharacter(pilot).name}</strong></div>
    </div>
    <div class="figma-card-footer"><div class="figma-card-palettes" role="group" aria-label="Color del jugador ${player}">
      ${(upcoming || !hasVariants ? [] : ZUDMATIC_PALETTES).map(p => `<button type="button" data-entry-palette="${p.name}" data-entry-player="${player}" aria-label="Jugador ${player}: color ${p.name}" aria-pressed="${p.name === palette}" title="${p.name}">${image(base, `selected-Paleta${p.name}.svg`, 'figma-palette-art')}</button>`).join('')}
    </div>${upcoming ? '<span class="figma-coming-soon">Próximamente · Bulldog</span>' : !hasVariants ? '<span class="figma-coming-soon">Bulldog</span>' : ''}</div>` : `
    ${image(base, 'empty-RayosDeFondo.svg', 'figma-closed-rays')}
    ${image(base, 'empty-SelloCom.svg', 'figma-closed-seal')}
    <span class="figma-com">COM</span><div class="figma-card-footer figma-closed-footer"><span class="entry-connect-prompt">Conecta un mando</span></div>`;
  return `<div class="figma-card-design" data-character="${pilot ?? ''}" style="--character-color:${pilot ? characterColors[pilot] : '#949eb7'};--character-background:${pilot ? characterBackgrounds[pilot] : '#eee'}">
    ${image(base, `${kind}-ContornoRecortado.svg`, 'figma-card-contour')}
    <div class="figma-card-content ${pilot ? '' : 'figma-card-empty'}">${content}</div>
    ${image(base, corners, 'figma-card-corners')}
    ${image(base, `${kind}-BordeRecortado${characterVariant}.svg`, 'figma-card-border')}
  </div>`;
}
