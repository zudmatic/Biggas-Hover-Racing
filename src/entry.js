// The landing is the main entry; keep the existing direct hangar link working.
const query=new URLSearchParams(location.search);
if(query.get('view')==='spaceship') {
  import('./spaceship.js').then(({createSpaceship})=>createSpaceship());
} else {
  import('./flight-selection.js').then(({createFlightEntry})=>createFlightEntry());
}
