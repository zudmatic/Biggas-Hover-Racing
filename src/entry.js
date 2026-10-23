// The room and hangar are separate entry points. Editors remain opt-in outside
// the public house build; none of them boots the room behind the active view.
const query=new URLSearchParams(location.search);
if(query.get('view')==='spaceship') {
  import('./spaceship.js').then(({createSpaceship})=>createSpaceship());
} else if(import.meta.env.MODE!=='house'&&(query.get('edit')==='scene'||query.get('debug')==='scene')) {
  import('./scene-editor.js').then(({createSceneEditor})=>createSceneEditor());
} else if(import.meta.env.MODE!=='house'&&(query.get('debug')==='character'||query.has('model-debug'))) {
  import('./character-debug.js').then(({createCharacterDebug})=>createCharacterDebug());
} else {
  import('./main.js');
}
