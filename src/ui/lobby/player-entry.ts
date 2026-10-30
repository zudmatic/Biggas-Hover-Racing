import {audio} from '@/audio/audio-system';
import {playUISound} from '@/audio/ui-sounds';
import {lobbyCharacter} from '@/content/characters/lineup';
import {characterOrder} from './character-cards';
import {figmaPlayerCard, characterColors, selectionArtwork} from './figma-character-cards';
import {ZUDMATIC_PALETTES} from '@/content/characters/zudmatic/palettes';
import {createCharacterCardMotion} from './character-card-motion';

interface Guest {
  pilot: string;
  ready: boolean;
  direction: number;
  nextRepeat: number;
  confirm: boolean;
  cancel: boolean;
  palette: string;
  paletteDirection: number;
}

/** Keyboard/mouse own 1P. Each connected gamepad owns one additional lobby slot. */
export function createPlayerEntry(root: HTMLElement, base: string, signal: AbortSignal, isSelecting: () => boolean, onPalette: (palette: string) => void, onReadinessChange: () => void) {
  const assignments = new Map<number, number>();
  const guests = new Map<number, Guest>();
  const cardMotion = createCharacterCardMotion(signal);
  let frame = 0;
  let primaryPilot = characterOrder[0], primaryPalette = 'Original', primaryReady = false;
  const grid = root.querySelector<HTMLElement>('.entry-card-grid')!;
  // Fit the full design into both available dimensions; width alone overflows
  // shorter/wider viewports. Observe the fixed grid, not its resized children.
  const sizes = new ResizeObserver(([entry]) => {
    const style = getComputedStyle(grid);
    const columns = Number(style.getPropertyValue('--entry-columns')) || 2;
    const rows = Number(style.getPropertyValue('--entry-rows')) || 2;
    const gap = parseFloat(style.gap) || 0;
    const scale = Math.max(0, Math.min(
      (entry.contentRect.width - gap * (columns - 1)) / columns / 666.8,
      (entry.contentRect.height - gap * (rows - 1)) / rows / 279,
    ));
    grid.style.setProperty('--entry-card-scale', String(scale));
    grid.style.setProperty('--entry-card-width', `${666.8 * scale}px`);
    grid.style.setProperty('--entry-card-height', `${279 * scale}px`);
  });
  sizes.observe(grid);
  const portraits = new ResizeObserver(entries => {
    for (const {target, contentRect} of entries) {
      const scale = Math.max(contentRect.width / 151, contentRect.height / 64);
      (target as HTMLElement).style.setProperty('--portrait-scale', String(scale));
    }
  });
  root.querySelectorAll<HTMLElement>('[data-pilot-choice]').forEach(slot => portraits.observe(slot));
  signal.addEventListener('abort', () => { sizes.disconnect(); portraits.disconnect(); }, {once: true});

  function playReadySound() {
    audio.unlock();
    void audio.play('ui.ready');
  }

  function render(player: number, pilot?: string, ready = false) {
    const card = root.querySelector<HTMLElement>(`[data-player-slot="${player}"]`)!;
    const changed = Boolean(pilot && pilot !== card.dataset.pilot && isSelecting());
    if (ready && card.dataset.ready !== 'true') playReadySound();
    cardMotion.clear(card);
    card.classList.toggle('is-closed', !pilot);
    card.classList.toggle('is-selected', Boolean(pilot));
    card.dataset.pilot = pilot ?? '';
    card.dataset.ready = String(ready);
    card.setAttribute('aria-label', `Jugador ${player}, ${pilot ? lobbyCharacter(pilot).name : 'sin conectar'}${ready ? ', listo' : ''}`);
    card.innerHTML = figmaPlayerCard(base, player, pilot, ready, player === 1 ? primaryPalette : guests.get(player)?.palette);
    if (changed) cardMotion.enter(card);
  }

  function setPrimaryReady(ready: boolean) {
    if (ready && lobbyCharacter(primaryPilot).comingSoon) return;
    if (ready && !primaryReady) playReadySound();
    primaryReady = ready;
    root.dataset.primaryReady = String(ready);
    const card = root.querySelector<HTMLElement>('[data-player-slot="1"]')!;
    card.dataset.ready = String(ready);
    card.setAttribute('aria-label', `Jugador 1, ${lobbyCharacter(primaryPilot).name}${ready ? ', listo' : ''}`);
    const indicator = card.querySelector<HTMLElement>('.figma-ready');
    if (indicator) indicator.hidden = !ready;
    card.querySelectorAll<HTMLButtonElement>('[data-entry-palette]').forEach(button => button.disabled = ready);
    onReadinessChange();
  }

  function badges() {
    root.querySelectorAll<HTMLElement>('[data-pilot-choice]').forEach((button) => {
      const players = [...guests].filter(([, guest]) => guest.pilot === button.dataset.pilotChoice).map(([player]) => `${player}P`);
      button.querySelector<HTMLElement>('.entry-other-players')!.textContent = players.join(' ');
      const owners = [...(button.dataset.pilotChoice === primaryPilot ? [1] : []), ...[...guests].filter(([, guest]) => guest.pilot === button.dataset.pilotChoice).map(([player]) => player)];
      const accent = characterColors[button.dataset.pilotChoice!];
      button.style.setProperty('--roster-character-color', owners.length ? accent : '#62708a');
      let badges = button.querySelector<HTMLElement>('.figma-roster-players');
      if (!badges) { badges = document.createElement('span'); badges.className = 'figma-roster-players'; button.appendChild(badges); }
      badges.innerHTML = owners.map(player => `<span style="--character-color:${accent}">${player}P</span>`).join('');
      const portrait = button.querySelector<HTMLImageElement>('.entry-portrait')!;
      portrait.src = selectionArtwork(base, button.dataset.pilotChoice!);
    });
  }

  function poll(now: number) {
    if (signal.aborted) return;
    let pads: (Gamepad | null)[] = [];
    try { pads = Array.from(navigator.getGamepads?.() ?? []); } catch { /* Gamepad access may be disabled by browser policy. */ }
    for (const [index, player] of assignments) {
      if (!pads.some((pad) => pad?.connected && pad.index === index)) {
        assignments.delete(index);
        guests.delete(player);
        render(player);
        badges();
        onReadinessChange();
      }
    }
    for (const pad of pads) {
      if (!pad?.connected) continue;
      let player = assignments.get(pad.index);
      if (!player && isSelecting()) {
        player = [2, 3, 4].find((slot) => !guests.has(slot));
        if (!player) continue;
        assignments.set(pad.index, player);
        playUISound('join');
        const guest: Guest = {pilot: ['zudmatic', 'bluleet', 'lomi', 'ajo'][player - 1], ready: false, direction: 0, nextRepeat: 0, confirm: true, cancel: true, palette: 'Original', paletteDirection: 0};
        guests.set(player, guest);
        render(player, guest.pilot);
        badges();
        onReadinessChange();
      }
      if (!player) continue;
      const guest = guests.get(player)!;
      const confirm = Boolean(pad.buttons[0]?.pressed), cancel = Boolean(pad.buttons[1]?.pressed);
      const direction = pad.buttons[15]?.pressed || (pad.axes[0] ?? 0) > .55 ? 1
        : pad.buttons[14]?.pressed || (pad.axes[0] ?? 0) < -.55 ? -1 : 0;
      const paletteDirection = pad.buttons[5]?.pressed ? 1 : pad.buttons[4]?.pressed ? -1 : 0;
      let changed = false;
      if (isSelecting()) {
        if (direction && !guest.ready && (direction !== guest.direction || now >= guest.nextRepeat)) {
          playUISound('navigate');
          guest.pilot = characterOrder[(characterOrder.indexOf(guest.pilot) + direction + characterOrder.length) % characterOrder.length];
          guest.nextRepeat = now + (direction === guest.direction ? 160 : 380);
          changed = true;
        }
        if (paletteDirection && paletteDirection !== guest.paletteDirection && !guest.ready) {
          playUISound('navigate');
          const index = ZUDMATIC_PALETTES.findIndex(p => p.name === guest.palette);
          guest.palette = ZUDMATIC_PALETTES[(index + paletteDirection + ZUDMATIC_PALETTES.length) % ZUDMATIC_PALETTES.length].name;
          changed = true;
        }
        if (confirm && !guest.confirm && !guest.ready) {
          if (lobbyCharacter(guest.pilot).comingSoon) playUISound('denied');
          else { guest.ready = true; changed = true; }
        }
        if (cancel && !guest.cancel && guest.ready) { playUISound('back'); guest.ready = false; changed = true; }
      }
      guest.paletteDirection = paletteDirection;
      guest.direction = direction;
      guest.confirm = confirm;
      guest.cancel = cancel;
      if (changed) { render(player, guest.pilot, guest.ready); badges(); onReadinessChange(); }
    }
    frame = requestAnimationFrame(poll);
  }
  signal.addEventListener('abort', () => cancelAnimationFrame(frame), {once: true});
  frame = requestAnimationFrame(poll);
  root.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-entry-palette]');
    if (!button || !isSelecting()) return;
    const player = Number(button.dataset.entryPlayer), palette = button.dataset.entryPalette!;
    if (player === 1) { if (primaryReady) return; if (primaryPalette !== palette) playUISound('navigate'); primaryPalette = palette; onPalette(palette); }
    else { const guest = guests.get(player); if (!guest || guest.ready) return; if (guest.palette !== palette) playUISound('navigate'); guest.palette = palette; render(player, guest.pilot, guest.ready); }
    root.querySelector<HTMLButtonElement>(`[data-entry-player="${player}"][data-entry-palette="${palette}"]`)?.focus({preventScroll: true});
  }, {signal});
  for (const player of [2, 3, 4]) render(player);
  return {
    get primaryReady() { return primaryReady; },
    get allReady() { return primaryReady && [...guests.values()].every(guest => guest.ready); },
    setPrimaryReady,
    resetReady() {
      for (const [player, guest] of guests) {
        guest.ready = false;
        render(player, guest.pilot);
      }
      setPrimaryReady(false);
    },
    selectPilot(pilot: string, palette: string) {
      primaryPilot = pilot;
      primaryPalette = palette;
      render(1, pilot);
      badges();
      setPrimaryReady(false);
    },
  };
}
