import {characters} from './index';
import type {CharacterDefinition} from './character';

type LobbyCharacter = Pick<CharacterDefinition, 'id' | 'name' | 'portrait' | 'customization' | 'voice'> & {
  spokenName?: string;
  vehicle: string;
  vehicleName: string;
  comingSoon: boolean;
};

/** Lobby entries can announce a character before its racing model is available. */
export const racerLineup: LobbyCharacter[] = [
  {...characters.require('lomi'), vehicle: '040', vehicleName: 'LOMI', comingSoon: false},
  {...characters.require('bluleet'), vehicle: 'bluleet', vehicleName: 'Bluleet', comingSoon: false},
  {...characters.require('ajo'), vehicle: '038', vehicleName: 'Nómada', comingSoon: false},
  {...characters.require('zudmatic'), vehicle: '037', vehicleName: 'Zudoneta', comingSoon: false},
  {...characters.require('mr-kerry-capija'), spokenName: 'Mister Kerry Capija', vehicle: '039', vehicleName: 'Bulldog', comingSoon: false},
];

export function lobbyCharacter(id: string): LobbyCharacter {
  const character = racerLineup.find(character => character.id === id);
  if (!character) throw new Error(`Unknown lobby character: ${id}`);
  return character;
}

export const characterCardImage = (base: string, id: string) => `${base}images/characters/${id}.${id === 'mr-kerry-capija' ? 'png' : 'webp'}`;
