// Compile/upload offscreen geometry too, including the sun's shadow variants.
// Restore culling before play; hidden gameplay objects stay hidden throughout.
// Distance-gated decoration explicitly opts in so entering its district does
// not compile its unique instanced/vertex-color materials during a race.
export async function warmupFlightScene(scene, prepare){
  const objects=[],decoration=[];
  scene.traverse(object=>{
    if(object.userData.prewarmDecoration){decoration.push([object,object.visible]);object.visible=true;}
    if(object.isMesh||object.isPoints||object.isLine||object.isSprite){
      objects.push([object,object.frustumCulled]);object.frustumCulled=false;
    }
    if(object.isLight&&object.castShadow)object.shadow.needsUpdate=true;
  });
  try{await prepare();}
  finally{
    for(const [object,visible] of decoration)object.visible=visible;
    for(const [object,culled] of objects)object.frustumCulled=culled;
    scene.traverse(object=>{if(object.isLight&&object.castShadow)object.shadow.needsUpdate=true;});
  }
}
