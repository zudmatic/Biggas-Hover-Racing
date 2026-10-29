import * as THREE from 'three';

// A fixed pool of short broken rings, all in one mesh. The per-vertex alpha
// fades each wake independently without extra materials or render passes.
export function createBiggasWakes(group,{mobile=false}={}){
  const capacity=mobile?12:24,segments=14,vertices=segments*6,pool=Array.from({length:capacity},()=>({life:0})),positions=new Float32Array(capacity*vertices*3),colors=new Float32Array(capacity*vertices*4),g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('color',new THREE.BufferAttribute(colors,4).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.MeshBasicMaterial({name:'Estelas en charcos',vertexColors:true,transparent:true,opacity:.55,depthWrite:false,side:THREE.DoubleSide}),mesh=new THREE.Mesh(g,material);mesh.frustumCulled=false;group.add(mesh);let cursor=0,emission=0,emitted=0;const corners=[0,1,0,1,1,0],edges=[0,0,1,0,1,1];
  function step(state,dt,puddle){
    for(const p of pool)p.life=Math.max(0,p.life-dt);
    if(!puddle||state.speed<5){emission=0;return;}emission+=Math.min(12,state.speed*.35)*dt;
    while(emission>=1){emission--;const p=pool[cursor++%capacity];Object.assign(p,{life:.75,x:state.x,y:puddle.p.y+.065,z:state.z,origin:puddle.p,heightAt:puddle.heightAt,rx:puddle.rx,rz:puddle.rz,yaw:state.yaw});emitted++;}
  }
  function update(reduced,paused){
    mesh.visible=!reduced&&pool.some(p=>p.life>0);if(!mesh.visible||paused)return;
    let v=0;
    for(const p of pool){
      if(p.life<=0){for(let j=0;j<vertices;j++)colors[(v+j)*4+3]=0;v+=vertices;continue;}
      const age=.75-p.life,radius=.35+age*2.4,alpha=p.life/.75;
      for(let segment=0;segment<segments;segment++)for(let vertex=0;vertex<6;vertex++){
        const corner=corners[vertex],edge=edges[vertex];
        const angle=(segment+corner)/segments*Math.PI*1.7+(p.yaw??0),r=radius+edge*.07,x=(p.x??0)+Math.cos(angle)*r,z=(p.z??0)+Math.sin(angle)*r;
        const origin=p.origin,dx=origin?x-origin.x:0,dz=origin?z-origin.z:0,lateral=origin?dx*-origin.nz+dz*origin.nx:0,longitudinal=origin?dx*origin.nx+dz*origin.nz:0,inside=origin&&(lateral/p.rx)**2+(longitudinal/p.rz)**2<.98;
        positions[v*3]=x;positions[v*3+1]=inside?(p.heightAt?.(x,z)??(p.y-.065+(origin?.bank??0)*lateral))+.065:p.y;positions[v*3+2]=z;colors[v*4]=.74;colors[v*4+1]=.92;colors[v*4+2]=.86;colors[v*4+3]=inside?alpha:0;v++;
      }
    }
    g.attributes.position.needsUpdate=true;g.attributes.color.needsUpdate=true;
  }
  return {mesh,pool,get emitted(){return emitted;},step,update,reset(){emission=0;emitted=0;cursor=0;pool.forEach(p=>p.life=0);colors.fill(0);g.attributes.color.needsUpdate=true;}};
}
