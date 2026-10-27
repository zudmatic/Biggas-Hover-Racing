// The landing is the main entry; keep the existing direct hangar link working.
const query=new URLSearchParams(location.search);
if(query.get('view')==='spaceship') {
  import('./tools/hangar/hangar').then(({createSpaceship})=>createSpaceship());
} else {
  import('./ui/lobby/lobby').then(({createFlightEntry})=>createFlightEntry());
}
