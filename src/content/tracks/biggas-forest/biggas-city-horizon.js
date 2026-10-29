import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Two closed, static ridgelines. Baked vertex shading keeps the distant terrain
// independent of city lights and shadow maps: one draw, no textures or updates.
export function createBiggasHorizon(root,{mobile=false}={}){
  const segments=mobile?128:256,parts=[],sun=new T.Vector3(-.55,.8,.35).normalize();
  const haze=new T.Color(0xb6c6bd),stone=new T.Color(),normal=new T.Vector3();
  for(let layer=0;layer<2;layer++){
    const positions=[],indices=[],profiles=layer?[[1900,-90],[2350,110],[2750,1],[3150,160],[3500,-150]]:[[1050,-100],[1280,65],[1630,1],[1950,80],[2220,-120]];
    for(let row=0;row<profiles.length;row++)for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2,phase=layer*1.7;
      const ridge=260+150*(.5+.5*Math.sin(a*7+phase))+115*(.5+.5*Math.sin(a*13+1.3+phase))+75*Math.sin(a*23+phase)**2;
      const radius=profiles[row][0]+Math.sin(a*5+phase)*65+Math.sin(a*11)*28;
      const y=row===2?ridge*(layer?1.4:1):profiles[row][1]+(row===1||row===3?Math.sin(a*9+phase)*28:0);
      positions.push(Math.cos(a)*radius,y,Math.sin(a)*radius);
      if(row&&i){const b=row*(segments+1)+i,p=b-segments-1;indices.push(p-1,p,b-1,p,b,b-1);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    const colors=[],p=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<p.count;i++){
      const height=p.getY(i),shade=.75+.25*Math.max(0,normal.fromBufferAttribute(n,i).dot(sun));
      stone.set(layer?0x8babb5:0x688b86).lerp(new T.Color(layer?0xc0d0d0:0xa1b5ad),T.MathUtils.smoothstep(height,300,650)).multiplyScalar(shade);
      stone.lerp(haze,layer?.48:T.MathUtils.lerp(.72,.2,T.MathUtils.smoothstep(height,-50,350)));stone.toArray(colors,i*3);
    }
    g.setAttribute('color',new T.Float32BufferAttribute(colors,3));parts.push(g);
  }
  const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
  const material=new T.MeshBasicMaterial({name:'Montañas lejanas · bruma',vertexColors:true,fog:false});
  const mesh=new T.Mesh(geometry,material);mesh.name='Cordillera del horizonte · 360°';root.add(mesh);
  const day=new T.Color(0xffffff),night=new T.Color(0x344f70);
  return {mesh,triangles:geometry.index.count/3,update(blend){material.color.copy(day).lerp(night,blend);},dispose(){geometry.dispose();material.dispose();mesh.removeFromParent();}};
}
