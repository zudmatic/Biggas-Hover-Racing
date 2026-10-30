import {Registry} from '@/core/registry';
import type {CharacterDefinition} from './character';
import {ajo} from './ajo';
import {bluleet} from './bluleet';
import {lomi} from './lomi';
import {mrKerryCapija} from './mr-kerry-capija';
import {zud} from './zud';
import {zudmatic} from './zudmatic';

export type {Character, CharacterDefinition, CharacterOptions} from './character';

/** Every racer, in lobby order. Unknown ids resolve to Zud. */
export const characters = new Registry<CharacterDefinition>('Personaje', 'zud');
characters.register(zud);
characters.register(zudmatic);
characters.register(ajo);
characters.register(bluleet);
characters.register(lomi);

characters.register(mrKerryCapija);
