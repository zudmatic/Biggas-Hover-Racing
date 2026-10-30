import {shipLiveryChoice} from '@/content/vehicles/zudoneta-037/liveries';
import '../renderer-navigation';
import {ZUD_HATS, zudHat} from '../../content/characters/hats/hat-catalog';
import {vehicles} from '@/content/vehicles';
import {pilotChoice, pilotQuery} from '@/content/characters/selection';
import {ZUDMATIC_PALETTES} from '@/content/characters/zudmatic/palettes';
import {characters} from '@/content/characters';
import {tracks} from '@/content/tracks';
import './lobby.css';
import './character-select.css';
import './map-select.css';
import {characterCards, characterOrder, characterRoster, characterSlotCount} from './character-cards';
import {createPlayerEntry} from './player-entry';
import {createEntryTheme} from './entry-theme';
import {selectionAsset} from './figma-character-cards';
import {audio} from '@/audio/audio-system';
import {bindMenuHover, playUISound, preloadUISounds} from '@/audio/ui-sounds';
import {lobbyCharacter, characterCardImage} from '@/content/characters/lineup';
import type {PilotChoice} from '@/content/characters/selection';
import {SoundControl} from '../sound-control/sound-control';
import {createMenuMotion, createRaceEntryTransition} from './menu-motion';
import {landingMarkup, fitLanding} from './landing';

const steps = ['Inicio', 'Personaje', 'Mapa'];
const plainImages = new Set(
  characters.list().filter((pilot) => pilot.paperImages === false).flatMap((pilot) => [pilot.portrait, pilot.preview]),
);
const hatSwatches: Record<string, {color: string; path: string}> = {
  beanie: {color: '#f9670d', path: 'M5 15V12a7 7 0 0 1 14 0v3M4 15h16v5H4zM10 4a2 2 0 1 0 4 0 2 2 0 1 0-4 0'},
  samurai_kasa: {color: '#e6c783', path: 'M2 17 12 5l10 12H2zM12 5l-4 12m4-12 4 12M5 20h14'},
  cloud_chef: {color: '#eee7c9', path: 'M7 12a4 4 0 1 1 1-7 4 4 0 0 1 8 0 4 4 0 1 1 1 7v8H7v-8zM7 16h10'},
  crescent_wizard: {color: '#8584c4', path: 'M5 17 11 4l6 3-4 1 6 9M3 17h18v3H3zM12 11l-2 3h3'},
};

interface LobbyChoice extends PilotChoice {
  map: string;
  vehicle: string;
  paper: boolean;
  livery: string;
  entryTransition: ReturnType<typeof createRaceEntryTransition>;
}

export function chooseFlight(): Promise<LobbyChoice> {
  const base = import.meta.env.BASE_URL,
    reduced = matchMedia('(prefers-reduced-motion: reduce)'),
    controller = new AbortController(),
    {signal} = controller;
  let {pilot: selectedPilot, palette: selectedPalette, hat: selectedHat} = pilotChoice();
  let selectedVehicle: string;
  const lookQuery = new URLSearchParams(location.search);
  // Start the illustrated roster at Lomi; each pilot owns a fixed vehicle.
  if (!lookQuery.has('pilot') && !lookQuery.has('vehicle')) {
    selectedPilot = 'lomi';
  }
  if (!characterOrder.includes(selectedPilot)) selectedPilot = characterOrder[0];
  if (lookQuery.get('pilot') === 'mr-kerry-capija') selectedPilot = 'mr-kerry-capija';
  const selectedLivery = shipLiveryChoice(lookQuery);
  let paperChosen = lookQuery.has('comic');
  let stage = 0,
    selectedMap = tracks.resolve(lookQuery.get('map')).id,
    leaving = false,
    paper = paperChosen ? lookQuery.get('comic') !== '0' : selectedMap !== 'desert-valley' && selectedPilot !== 'bluleet';
  document.title = 'Biggas Hover Racing';
  document.body.innerHTML = `<main class="race-lobby" data-stage="0" data-pilot="zud" data-vehicle="037"><div class="lobby-paper-surface" aria-hidden="true"></div><div class="lobby-title-ribbon" aria-hidden="true"></div><div class="lobby-title-checkers" aria-hidden="true"></div><header class="lobby-header"><a class="lobby-brand" href="${base}" aria-label="Biggas Hover Racing, inicio"><span aria-hidden="true">✳</span><strong>BIGGAS<small>HOVER RACING</small></strong></a><nav class="lobby-steps" aria-label="Preparación de carrera" hidden>${steps
    .slice(1)
    .map((name, i) => `<button type="button" data-step="${i + 1}" disabled><span>0${i + 1}</span>${name}</button>`)
    .join(
      '',
    )}</nav><div class="lobby-header-actions">${SoundControl.markup('lobby-sound')}<button type="button" id="lobby-paper" aria-label="Papel" aria-pressed="true" title="Shader de papel"><span aria-hidden="true">◐</span> Papel</button><a class="lobby-hangar" href="${base}spaceship.html">Hangar</a></div></header>
    ${landingMarkup(base)}
    <section class="lobby-screen lobby-selection lobby-character-select" data-screen="1" aria-labelledby="lobby-title-1" hidden><div class="lobby-section-title"><img class="figma-title-wedge" src="${selectionAsset(base, 'selected-BandaAmarillaDiagonal.svg')}" alt=""><h1 id="lobby-title-1" tabindex="-1">Player Entry<small>ELIGE TU PERSONAJE</small></h1><span>01 / 08</span></div><div class="lobby-roster-panel">${characterRoster(base)}</div><div class="entry-card-grid" role="group" aria-label="Jugadores">${characterCards(base)}</div><div class="lobby-selected-name"><span>P1</span><strong>ZUD</strong></div><div class="lobby-profile"><fieldset class="lobby-hats"><legend>SOMBRERO <span class="lobby-hat-name">${zudHat(selectedHat).name}</span></legend><div>${ZUD_HATS.map((hat) => `<button type="button" data-hat="${hat.id}" aria-label="Sombrero ${hat.name}" aria-pressed="${hat.id === selectedHat}" title="${hat.name}" style="--hat-color:${hatSwatches[hat.id].color}"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${hatSwatches[hat.id].path}"/></svg></span></button>`).join('')}</div></fieldset><fieldset class="lobby-palettes" hidden><legend>COLOR <span class="lobby-palette-name">Original</span></legend><div>${ZUDMATIC_PALETTES.map((p) => `<button type="button" data-palette="${p.name}" aria-label="Color ${p.name}" aria-pressed="${p.name === selectedPalette}" title="${p.name}" style="--palette-main:${p.colors.orange};--palette-detail:${p.colors.blue};--palette-accent:${p.parts?.part_015 ?? p.colors.ivory}"><span></span></button>`).join('')}</div></fieldset><div class="lobby-profile-brand">BIGGAS<span>HOVER RACING</span></div><dl><div><dt>Vehículo</dt><dd>Zudoneta</dd></div><div><dt>Estado</dt><dd>Listo</dd></div></dl></div></section>
    <section class="lobby-screen lobby-maps" data-screen="2" aria-labelledby="lobby-title-2" hidden><div class="lobby-map-heading lobby-section-title"><img class="figma-title-wedge" src="${selectionAsset(base, 'selected-BandaAmarillaDiagonal.svg')}" alt=""><h1 id="lobby-title-2" tabindex="-1">Course Select<small>ELIGE TU CIRCUITO</small></h1></div><div class="lobby-map-toolbar"><div class="lobby-team"><img data-lobby-image="zud-face" src="${base}images/flight/zud-face.png" alt=""><span>ZUD</span></div></div><fieldset class="lobby-map-list"><legend class="lobby-sr-only">Mapa</legend>${tracks
      .list()
      .map(
        (map) =>
          `<label class="lobby-map-card"><input type="radio" name="map" value="${map.id}" aria-label="${map.name}, ${map.summary}" ${selectedMap === map.id ? 'checked' : ''}><span class="lobby-map-shell"><span class="lobby-map-art"><img data-lobby-image="${map.id}" src="${base}images/flight/${map.id}.png" alt="${map.description}"><span class="lobby-map-copy"><strong>${map.name}</strong></span><span class="lobby-map-check" aria-hidden="true">✓</span></span><span class="lobby-map-info"><span>${map.summary}</span></span></span></label>`,
      )
      .join('')}</fieldset></section>
    <footer class="lobby-footer"><div class="lobby-footer-brand"><span class="lobby-checker" aria-hidden="true"></span> HOVER CLUB / 037</div><button type="button" class="lobby-back" aria-label="Volver" hidden><span aria-hidden="true">←</span> Volver</button><span class="lobby-key-hint" hidden><kbd>ENTER</kbd> CONFIRMAR <kbd>ESC</kbd> VOLVER</span><button type="button" class="race-primary lobby-primary lobby-next" hidden>Confirmar Zud <span aria-hidden="true">→</span></button><span class="lobby-edition">VOL. 01</span></footer><div class="lobby-launching" role="status" hidden><span class="lobby-kicker">ZUD × 037</span><strong>Preparando pista<span>…</span></strong><span class="lobby-launch-track"></span></div>
  </main>`;
  const root = document.querySelector<HTMLElement>('.race-lobby')!;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing lobby element: ${selector}`);
    return element;
  };
  createEntryTheme(root);
  bindMenuHover(root, signal);
  $('.sound-trigger').insertAdjacentHTML('beforeend', `<img class="figma-sound-icon" src="${selectionAsset(base, 'selected-IconoSonido.svg')}" alt="">`);
  function updateEntryAction() {
    const character = lobbyCharacter(selectedPilot);
    const ready = stage === 1 && root.dataset.primaryReady === 'true';
    $<HTMLButtonElement>('.lobby-next').disabled = character.comingSoon || ready;
    if (stage === 1) $('.lobby-next').textContent = character.comingSoon ? 'Próximamente' : ready ? root.dataset.allReady === 'true' ? 'Ready!' : 'Esperando jugadores…' : 'Ready';
  }
  const motion = createMenuMotion(root, {reduced, signal});
  fitLanding(root, signal);
  motion.intro();
  audio.setPhase('lobby');
  const {toggleSound} = new SoundControl($('.sound-control'), {signal});
  root.addEventListener(
    'pointerdown',
    (event) => {
      if (!(event.target instanceof Element && event.target.closest('.sound-control'))) {
        audio.unlock();
        preloadUISounds();
      }
    },
    {signal},
  );
  return new Promise<LobbyChoice>((resolve) => {
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    let readyKeyboard = false;
    function cancelReadyCountdown() {
      clearTimeout(readyTimer);
      readyTimer = undefined;
    }
    signal.addEventListener('abort', cancelReadyCountdown, {once: true});
    function updateReadiness() {
      const allReady = playerEntry.allReady;
      root.dataset.allReady = String(allReady);
      updateEntryAction();
      if (stage !== 1 || leaving || !allReady) { cancelReadyCountdown(); return; }
      if (readyTimer !== undefined) return;
      readyTimer = setTimeout(() => {
        readyTimer = undefined;
        if (!signal.aborted && stage === 1 && playerEntry.allReady) show(2, {keyboard: readyKeyboard});
      }, 1500);
    }
    function goBack(keyboard: boolean) {
      if (leaving || root.dataset.landingTransition || stage === 0) return;
      if (stage === 1 && playerEntry.primaryReady) { playUISound('back'); playerEntry.setPrimaryReady(false); }
      else show(Math.max(0, stage - 1), {keyboard});
    }
    function show(next: number, {keyboard = false} = {}) {
      if (leaving || root.dataset.landingTransition || next === stage) return;
      const previous = stage;
      if (next < previous) playUISound('back');
      cancelReadyCountdown();
      motion.before(previous, next, keyboard);
      stage = next;
      if (previous !== stage) playerEntry.resetReady();
      root.dataset.stage = String(stage);
      root.dataset.keyboard = String(keyboard);
      root.querySelectorAll<HTMLElement>('[data-screen]').forEach((screen) => (screen.hidden = Number(screen.dataset.screen) !== stage));
      $('.lobby-steps').hidden = stage === 0;
      $('.lobby-back').hidden = stage === 0;
      $('.lobby-next').hidden = stage === 0;
      $('.lobby-key-hint').hidden = stage === 0;
      $('.lobby-footer-brand').hidden = stage !== 0;
      $('.lobby-edition').hidden = stage !== 0;
      root.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((button) => {
        const index = Number(button.dataset.step);
        button.disabled = index > stage;
        if (index === stage) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      $('.lobby-next').innerHTML =
        `${stage === 1 ? `Confirmar ${lobbyCharacter(selectedPilot).name}` : 'Volar'} <span aria-hidden="true">→</span>`;
      updateEntryAction();
      updatePaperImages();
      $(`#lobby-title-${stage}`).focus({preventScroll: true});
      motion.after(previous, stage, keyboard);
    }
    async function advance(event?: Pick<MouseEvent, 'detail'>) {
      if (leaving || root.dataset.landingTransition) return;
      audio.unlock();
      preloadUISounds();
      if (stage > 0 && lobbyCharacter(selectedPilot).comingSoon) { playUISound('denied'); return; }
      if (stage === 0) { playUISound('start'); show(1, {keyboard: event?.detail === 0}); return; }
      if (stage === 1) {
        if (!playerEntry.primaryReady) {
          readyKeyboard = event?.detail === 0;
          playerEntry.setPrimaryReady(true);
        }
        return;
      }
      playUISound('start');
      audio.setPhase('loading');
      leaving = true;
      root.dataset.launching = 'true';
      $('.lobby-launching').hidden = false;
      $('.lobby-launch-track').textContent = `${tracks.require(selectedMap).name} / ${tracks.require(selectedMap).number}`;
      const entryTransition = createRaceEntryTransition($('.lobby-launching'), {reduced, keyboard: event?.detail === 0});
      root.inert = true;
      await entryTransition.covered;
      // Release the lobby once the cover is opaque, before loading the circuit.
      controller.abort();
      resolve({
        map: selectedMap,
        vehicle: selectedVehicle,
        pilot: selectedPilot,
        palette: selectedPalette,
        hat: selectedHat,
        livery: selectedLivery,
        paper,
        entryTransition,
      });
    }
    $('.lobby-start').addEventListener('click', advance, {signal});
    $('.lobby-next').addEventListener('click', advance, {signal});
    $<HTMLButtonElement>('.lobby-back').addEventListener('click', (event) => goBack(event.detail === 0), {
      signal,
    });
    root
      .querySelectorAll<HTMLButtonElement>('[data-step]')
      .forEach((button) =>
        button.addEventListener('click', (event) => show(Number(button.dataset.step), {keyboard: event.detail === 0}), {signal}),
      );
    root.querySelectorAll<HTMLInputElement>('input[name=map]').forEach((input) =>
      input.addEventListener(
        'change',
        () => {
          playUISound('select');
          selectedMap = input.value;
          root.dataset.map = selectedMap;
          if (!paperChosen) setPaper(selectedMap !== 'desert-valley' && selectedPilot !== 'bluleet');
        },
        {signal},
      ),
    );
    const playerEntry = createPlayerEntry(root, base, signal, () => stage === 1 && !leaving, palette => { selectedPalette = palette; selectPilot(selectedPilot); }, updateReadiness);
    function selectPilot(id: string | undefined) {
      selectedPilot = id && characterOrder.includes(id) ? id : characterOrder[0];
      playerEntry.selectPilot(selectedPilot, selectedPalette);
      const config = lobbyCharacter(selectedPilot);
      root.dataset.pilot = selectedPilot;
      root.dataset.palette = selectedPalette;
      root.dataset.hat = selectedHat;
      root.querySelectorAll<HTMLButtonElement>('[data-pilot-choice]').forEach((button) => {
        const selected = button.dataset.pilotChoice === selectedPilot;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
        button.setAttribute('aria-label', `${lobbyCharacter(button.dataset.pilotChoice!).name}${lobbyCharacter(button.dataset.pilotChoice!).comingSoon ? ', próximamente' : ''}${selected ? ', seleccionado' : ''}`);
        button.querySelector<HTMLElement>('.lobby-slot-player')!.hidden = !selected;
      });
      $('[data-screen="1"] .lobby-section-title>span').textContent =
        `${String(characterOrder.indexOf(selectedPilot) + 1).padStart(2, '0')} / ${String(characterSlotCount).padStart(2, '0')}`;
      $('[data-screen="1"] .lobby-selected-name strong').textContent = config.name.toUpperCase();
      $('.lobby-hats').hidden = !config.customization.hats;
      $('.lobby-hat-name').textContent = zudHat(selectedHat).name;
      root
        .querySelectorAll<HTMLButtonElement>('button[data-hat]')
        .forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.hat === selectedHat)));
      $('.lobby-palettes').hidden = !config.customization.palettes;
      $('.lobby-palette-name').textContent = selectedPalette;
      root
        .querySelectorAll<HTMLButtonElement>('button[data-palette]')
        .forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.palette === selectedPalette)));
      const portrait = $<HTMLImageElement>('.lobby-team img:first-child');
      if (config.portrait) portrait.dataset.lobbyImage = config.portrait;
      else { delete portrait.dataset.lobbyImage; portrait.src = characterCardImage(base, selectedPilot); }
      updateEntryAction();
      updateAssignedVehicle();
    }
    root.querySelectorAll<HTMLButtonElement>('[data-pilot-choice]').forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          playUISound('select');
          selectPilot(button.dataset.pilotChoice);
          $('[data-player-slot="1"]').scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
          const character = lobbyCharacter(selectedPilot);
          audio.speak(character.spokenName ?? character.name, character.voice);
        },
        {signal},
      ),
    );
    root.querySelectorAll<HTMLButtonElement>('button[data-palette]').forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          playUISound('navigate');
          selectedPalette = button.dataset.palette ?? 'Original';
          selectPilot(selectedPilot);
        },
        {signal},
      ),
    );
    root.querySelectorAll<HTMLButtonElement>('button[data-hat]').forEach((button) =>
      button.addEventListener(
        'click',
        () => {
          playUISound('navigate');
          selectedHat = zudHat(button.dataset.hat).id;
          selectPilot(selectedPilot);
        },
        {signal},
      ),
    );
    $('[data-screen="1"]').addEventListener(
      'keydown',
      (event) => {
        if (!(event.target instanceof Element && event.target.closest('[data-pilot-choice]'))) return;
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
        const ids = characterOrder,
          current = ids.indexOf(selectedPilot),
          next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? ids.length - 1
                : (current + delta + ids.length) % ids.length;
        if (ids[next] !== selectedPilot) playUISound('navigate');
        selectPilot(ids[next]);
        const character = lobbyCharacter(selectedPilot);
        audio.speak(character.spokenName ?? character.name, character.voice);
        $(`.lobby-slot[data-pilot-choice="${ids[next]}"]`).focus();
        $('[data-player-slot="1"]').scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
      },
      {signal},
    );
    function updateAssignedVehicle() {
      const character = lobbyCharacter(selectedPilot);
      selectedVehicle = character.vehicle;
      const config = vehicles.require(selectedVehicle);
      root.dataset.vehicle = selectedVehicle;
      root.dataset.livery = selectedLivery;
      $('[data-screen="1"] .lobby-profile dd').textContent = character.vehicleName;
      $('.lobby-team>span').textContent = character.name.toUpperCase();
      $('.lobby-launching .lobby-kicker').textContent = `${character.name.toUpperCase()} × ${character.vehicleName}`;
      const hangar = $<HTMLAnchorElement>('.lobby-hangar');
      if (character.comingSoon) { hangar.removeAttribute('href'); hangar.setAttribute('aria-disabled', 'true'); }
      else {
        hangar.removeAttribute('aria-disabled');
        hangar.href = `${base}spaceship.html?vehicle=${config.id}&${pilotQuery({pilot: selectedPilot, palette: selectedPalette, hat: selectedHat})}&livery=${selectedLivery}`;
      }
      updatePaperImages();
    }
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.repeat) return;
        if (event.code === 'KeyM') {
          event.preventDefault();
          toggleSound();
          return;
        }
        audio.unlock();
        if (event.key === 'Escape' && stage > 0) {
          event.preventDefault();
          goBack(true);
        }
        if (event.key === 'Enter' && !(event.target instanceof Element && event.target.closest('button,a,input'))) {
          event.preventDefault();
          advance({detail: 0});
        }
      },
      {signal},
    );
    function updatePaperImages() {
      root.querySelectorAll<HTMLImageElement>('[data-lobby-image]').forEach((image) => {
        const key = image.dataset.lobbyImage ?? '',
          isMap = tracks.has(key);
        const filename = plainImages.has(key) ? key : isMap ? `${key}${paper ? '' : '-normal'}` : `${key}${paper ? '-paper' : ''}`;
        const src = `${base}images/flight/${filename}.png`;
        if (image.getAttribute('src') !== src) image.src = src;
      });
    }
    function setPaper(enabled: boolean) {
      paper = enabled;
      root.dataset.paper = String(paper);
      $('#lobby-paper').setAttribute('aria-pressed', String(paper));
      updatePaperImages();
    }
    $('#lobby-paper').addEventListener(
      'click',
      () => {
        playUISound('select');
        paperChosen = true;
        setPaper(!paper);
      },
      {signal},
    );
    setPaper(paper);
    selectPilot(selectedPilot);
    root.dataset.map = selectedMap;
    if (lookQuery.get('selection') === 'map') show(lobbyCharacter(selectedPilot).comingSoon ? 1 : 2, {keyboard: true});
  });
}

export async function createFlightEntry() {
  const choice = await chooseFlight();
  const url = new URL(location.href);
  url.searchParams.set('map', choice.map);
  url.searchParams.set('vehicle', choice.vehicle);
  url.searchParams.set('pilot', choice.pilot);
  url.searchParams.set('palette', choice.palette);
  url.searchParams.set('hat', choice.hat);
  url.searchParams.set('livery', choice.livery);
  url.searchParams.set('comic', choice.paper ? '1' : '0');
  url.searchParams.delete('seed');
  url.searchParams.delete('selection');
  url.searchParams.delete('mode');
  history.replaceState(null, '', url);
  try {
    const {RaceSession} = await import('@/game/race-session');
    await RaceSession.start({entryTransition: choice.entryTransition});
  } catch (error) {
    audio.dispose();
    console.error(error);
    choice.entryTransition.fail('No se pudo abrir el circuito.');
  }
}
