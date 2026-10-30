import {lobbyCharacter, characterCardImage, racerLineup} from '@/content/characters/lineup';

/** The selectable cast. Legacy character models remain available to older tools. */
const artwork: Record<string, {color: string}> = {
  lomi: {color: '#00dca0'},
  bluleet: {color: '#ffc400'},
  ajo: {color: '#0654ff'},
  zudmatic: {color: '#ff073f'},
  'mr-kerry-capija': {color: '#9400ff'},
};
export const characterOrder = racerLineup.map(character => character.id);
export const characterSlotCount = 8;

export function playerCard(base: string, player: number, pilot?: string, ready = false) {
  if (!pilot) {
    return `<div class="entry-card-inner entry-card-closed"><span class="entry-closed-number" aria-hidden="true">${player}P</span><span class="entry-closed-seal" aria-hidden="true">COM</span><span class="entry-card-footer"><span class="entry-connect-prompt">Conecta un mando</span><span class="entry-card-series">${player}P / SIN JUGADOR</span></span></div>`;
  }
  const character = lobbyCharacter(pilot), art = artwork[pilot];
  return `<div class="entry-card-inner" style="--entry-color:${art.color}">
    <img class="entry-card-art" src="${characterCardImage(base, pilot)}" alt="" draggable="false">
    <span class="entry-card-copy"><span class="entry-card-number">JUGADOR / 0${player}</span><strong>${character.name}</strong></span>
    <span class="entry-card-footer"><span class="lobby-slot-player">${player}P <small>${character.comingSoon ? 'PRÓXIMAMENTE' : ready ? 'LISTO' : player === 1 ? 'ELIGE ARRIBA' : 'ELIGIENDO'}</small></span><span class="entry-card-series">${character.comingSoon ? character.vehicleName : player === 1 ? 'TECLADO / MOUSE' : 'MANDO · A CONFIRMAR'}</span></span>
  </div>`;
}

export function characterCards(base: string) {
  return Array.from({length: 4}, (_, i) => `<article class="entry-card is-closed" data-player-slot="${i + 1}" aria-label="Jugador ${i + 1}, sin conectar">${playerCard(base, i + 1)}</article>`).join('');
}

export function characterRoster(base: string) {
  return `<div class="lobby-roster" role="group" aria-label="Personajes">${characterOrder.map((id) => {
    const character = lobbyCharacter(id), art = artwork[id];
    return `<button type="button" class="lobby-slot" data-pilot-choice="${id}" style="--entry-color:${art.color}" aria-pressed="false" aria-label="${character.name}${character.comingSoon ? ", próximamente" : ""}"><img class="entry-portrait" src="${characterCardImage(base, id)}" alt=""><span class="lobby-slot-player" hidden>1P</span><span class="entry-other-players"></span><span class="lobby-slot-name">${character.name}</span>${character.comingSoon ? '<span class="entry-coming-soon">Próximamente</span>' : ''}</button>`;
  }).join('')}${Array.from({length: characterSlotCount - characterOrder.length}, (_, i) => `<button type="button" class="lobby-slot is-locked" disabled aria-label="Personaje ${i + characterOrder.length + 1}, bloqueado"><span class="lobby-mystery" aria-hidden="true">?</span></button>`).join('')}</div>`;
}
