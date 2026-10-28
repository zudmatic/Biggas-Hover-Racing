import {ZUDONETA_LIVERIES, shipLivery} from '@/content/vehicles/zudoneta-037/liveries';
import './vehicle-livery.css';

export function shipLiveryMarkup(selected = 'original'): string{
  return `<fieldset class="ship-liveries"><legend>PINTURA <span class="ship-livery-name">${shipLivery(selected).name}</span></legend><div>${ZUDONETA_LIVERIES.map(livery=>`<button type="button" data-livery="${livery.id}" aria-label="Pintura ${livery.name}" aria-pressed="${livery.id===selected}" title="${livery.name}" style="--paint-base:${livery.colors[0]};--paint-main:${livery.colors[1]};--paint-accent:${livery.colors[2]}"><span></span></button>`).join('')}</div></fieldset>`;
}
