import {Raycaster,Vector3} from 'three';

// Query the actual rug geometry, so moving, scaling or hiding it in the editor
// changes the sound boundary too. A rectangle would include the round corners.
export function createFootstepSurface(entries) {
  const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0),0,.3),hits=[];
  ray.layers.enableAll();
  return position=>{
    ray.ray.origin.copy(position);ray.ray.origin.y+=.1;
    for(const entry of entries.values()){
      if(entry.id!=='rug')continue;
      const object=entry.object;
      let visible=true;
      for(let node=object;node;node=node.parent)if(!node.visible){visible=false;break;}
      if(!visible)continue;
      object.updateWorldMatrix(true,true);hits.length=0;
      ray.intersectObject(object,true,hits);
      if(hits.length)return 'carpet';
    }
    return 'wood';
  };
}
