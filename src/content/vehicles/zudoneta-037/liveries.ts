import type {VehiclePaint} from '../vehicle-livery';

export const ZUDONETA_LIVERIES = [
  {id: 'original', name: 'Original', colors: ['#e2d5b5', '#697246', '#df6a26']},
  {id: 'cobalto', name: 'Cobalto', colors: ['#dce6ed', '#2456ad', '#f2a837']},
  {id: 'carmesi', name: 'Carmesí', colors: ['#eddbca', '#ae2945', '#e7b25b']},
  {id: 'turquesa', name: 'Turquesa', colors: ['#e0e6d1', '#168b82', '#ef7952']},
  {id: 'violeta', name: 'Violeta', colors: ['#e5dcee', '#7248ac', '#55c9d4']},
] as const;

export const ZUDONETA_PAINT: VehiclePaint = {
  materials: ['01 Marfil cálido · pintura', '02 Verde oliva militar', '03 Naranja seguridad'],
  variants: ZUDONETA_LIVERIES,
};

export const shipLivery = (id?: string | null) => ZUDONETA_LIVERIES.find((livery) => livery.id === id) ?? ZUDONETA_LIVERIES[0];
export const shipLiveryChoice = (query = new URLSearchParams(location.search)): string => shipLivery(query.get('livery')).id;
