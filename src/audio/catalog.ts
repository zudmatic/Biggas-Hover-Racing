import {Registry} from '@/core/registry';

/** A licensed music track. Files live in public/audio/. */
export interface MusicCue {
  readonly id: string;
  readonly title: string;
  /** Path relative to public/. */
  readonly file: string;
  readonly credit?: {readonly channel: string; readonly url: string};
}

/** Which mixer bus a sound plays on. */
export type SoundBus = 'cues' | 'world' | 'ui';

/** A sampled sound effect. Add a sound by dropping the file in public/audio/ and registering it here. */
export interface SoundDefinition {
  readonly id: string;
  /** Path relative to public/. */
  readonly file: string;
  readonly bus: SoundBus;
  /** Linear gain applied on top of the bus. */
  readonly volume?: number;
}

export const musicCues = new Registry<MusicCue>('Música', 'race');

musicCues.register({
  id: 'menu',
  title: 'RALLY HOUSE',
  file: 'audio/biggas-menu.mp3',
  credit: {channel: 'The Vibe Guide', url: 'https://www.youtube.com/watch?v=CbtVUfRPE-Q'},
});
musicCues.register({
  id: 'race',
  title: 'MARLBORO CLUB',
  file: 'audio/biggas-race.mp3',
  credit: {channel: 'PXRKX', url: 'https://www.youtube.com/watch?v=__btnUgnhGw'},
});
musicCues.register({id: 'desert', title: 'MIDNIGHT NOIR', file: 'audio/midnight-noir.mp3'});

export const sounds = new Registry<SoundDefinition>('Sonido');

sounds.register({id: 'train.rolling', file: 'audio/train/rolling.mp3', bus: 'world'});
sounds.register({id: 'train.horn', file: 'audio/train/horn.mp3', bus: 'world'});

sounds.register({id: 'ui.ready', file: 'audio/ui/ready.wav', bus: 'ui'});

/** Menu cues share the effects mixer; Ready retains its separately chosen sample. */
export const UI_SOUNDS = {
  start: 'ui.start', select: 'ui.select', back: 'ui.back', pause: 'ui.pause',
  navigate: 'ui.navigate', denied: 'ui.denied', join: 'ui.join',
} as const;
for (const [name, id] of Object.entries(UI_SOUNDS)) {
  sounds.register({id, file: `audio/ui/${name}.wav`, bus: 'ui', volume: name === 'navigate' ? 0.45 : name === 'select' ? 0.65 : 0.8});
}
