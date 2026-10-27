import * as THREE from 'three';

// Global sky/ground fill plus a shadowed sun; a bounded pool lights the road
// near the player. Actual Lambert-compatible lights also work in comic mode.
export function createCircuitLighting(scene,{mobile=false,headlightMounts=[[-.8,1.05,1.7],[.8,1.05,1.7]],underglow=true}={}){
  const root=new THREE.Group();root.name='Iluminación del circuito';scene.add(root);
  const sky=new THREE.HemisphereLight(0xc4dcf2,0x927b59,1.7);
  const sun=new THREE.DirectionalLight(0xffd8a0,3.4);
  const fill=new THREE.DirectionalLight(0x87bbdc,.45);fill.position.set(80,50,-120);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:5,far:450});sun.shadow.normalBias=.12;sun.shadow.bias=-.0002;
  root.add(sky,sun,sun.target,fill);
  const lamps=Array.from({length:mobile?3:5},()=>{const light=new THREE.PointLight(0xffca7d,0,24,2);root.add(light);return light;});
  const headlights=headlightMounts.map(([x,y,z])=>{const light=new THREE.SpotLight(0xd8f4ff,0,55,.48,.65,1.2);light.userData.offset=x;light.userData.height=y;light.userData.forward=z;root.add(light,light.target);return light;});
  const engine=new THREE.PointLight(0x64e9ff,12,9,2);engine.visible=underglow;root.add(engine);
  const fixtures=[],matrix=new THREE.Matrix4();let night=false,blend=0,headlightsEnabled=false,desert=false;
  function setTrack(track){
    if(track.map==='desert-valley'){
      desert=true;dayFog.set(0xc7d9dc);daySky.set(0xb5d9ed);dayGround.set(0xa47d50);daySun.set(0xffead0);
      scene.fog.near=300;scene.fog.far=1400;
      sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);
      Object.assign(sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55});sun.shadow.camera.updateProjectionMatrix();
      return;
    }
    const count=Math.floor(track.length/28),poleGeometry=new THREE.CylinderGeometry(.08,.12,4.5,6),capGeometry=new THREE.BoxGeometry(.7,.16,.7);
    const poles=new THREE.InstancedMesh(poleGeometry,new THREE.MeshStandardMaterial({color:0x385258,roughness:.8}),count);
    const caps=new THREE.InstancedMesh(capGeometry,new THREE.MeshBasicMaterial({color:0xffd79e}),count);
    poles.castShadow=true;poles.receiveShadow=true;poles.name='Farolas';caps.name='Luces de pista';caps.material.name='Light lens';root.add(poles,caps);
    for(let i=0;i<count;i++){
      const road=track.atDistance(i*28),side=i%2?1:-1,x=road.x-road.nz*((road.width??12)/2+(track.map==='nexus'?2:.35))*side,z=road.z+road.nx*((road.width??12)/2+(track.map==='nexus'?2:.35))*side;
      matrix.makeTranslation(x,road.y+2.25,z);poles.setMatrixAt(i,matrix);matrix.makeTranslation(x,road.y+4.5,z);caps.setMatrixAt(i,matrix);
      fixtures.push(new THREE.Vector3(x,road.y+4.25,z));
    }
    poles.instanceMatrix.needsUpdate=true;caps.instanceMatrix.needsUpdate=true;
  }
  const dayFog=new THREE.Color(0xb6c6bd),nightFog=new THREE.Color(0x182c43),daySky=new THREE.Color(0xc4dcf2),nightSky=new THREE.Color(0x668fce),dayGround=new THREE.Color(0x927b59),nightGround=new THREE.Color(0x305468);
  const daySun=new THREE.Color(0xffd8a0),nightSun=new THREE.Color(0xa9c8ff),anchor=new THREE.Vector3();
  function update(state,time,{dt=0,reducedMotion=false,paused=false}={}){
    // User changes remain available while paused; decorative light movement stops.
    blend=reducedMotion?Number(night):THREE.MathUtils.damp(blend,Number(night),5,dt);
    sky.color.copy(daySky).lerp(nightSky,blend);sky.groundColor.copy(dayGround).lerp(nightGround,blend);sky.intensity=desert?1.35-blend*.8:1.7-blend*.8;
    sun.color.copy(daySun).lerp(nightSun,blend);sun.intensity=desert?4.1-blend*3.4:3.4-blend*2.7;fill.intensity=desert?1.0*(1-blend):.45-blend*.23;
    scene.background.copy(dayFog).lerp(nightFog,blend);scene.fog.color.copy(scene.background);
    const arc=reducedMotion||desert?0:Math.sin(time*.018)*18;
    sun.position.set(state.x+(desert?-160:-110)+arc,state.y+(desert?220:180),state.z+(desert?-120:70));sun.target.position.set(state.x,state.y,state.z);
    anchor.set(state.x,state.y,state.z);
    const nearest=fixtures.map((position,index)=>({position,index,distance:position.distanceToSquared(anchor)})).sort((a,b)=>a.distance-b.distance).slice(0,lamps.length);
    lamps.forEach((light,i)=>{const fixture=nearest[i];if(!fixture){light.intensity=0;return;}light.position.copy(fixture.position);light.intensity=(70+blend*230)*THREE.MathUtils.clamp((40-Math.sqrt(fixture.distance))/12,0,1);});
    const scale=state.modelScale??1;
    const fx=Math.sin(state.yaw),fz=Math.cos(state.yaw),rx=Math.cos(state.yaw),rz=-fx;
    headlights.forEach(light=>{const side=light.userData.offset*scale;light.position.set(state.x+fx*light.userData.forward*scale+rx*side,state.y+light.userData.height*scale,state.z+fz*light.userData.forward*scale+rz*side);light.target.position.set(state.x+fx*23+rx*side,state.y-1.4+Math.sin(state.pitch)*23,state.z+fz*23+rz*side);light.intensity=headlightsEnabled?90+blend*160:0;});
    engine.position.set(state.x-fx*1.5*scale,state.y+.15*scale,state.z-fz*1.5*scale);
    engine.color.setHex(state.braking?0xff5035:state.drifting?0xffb24c:0x64e9ff);
    const pulse=reducedMotion||paused?1:1+Math.sin(time*19)*.04;
    engine.intensity=(state.boosting?38:state.drifting?25:12)*pulse;
  }
  return {root,setTrack,update,get headlightsEnabled(){return headlightsEnabled;},setHeadlights(value){headlightsEnabled=!!value;if(!headlightsEnabled)headlights.forEach(light=>light.intensity=0);},sky,sun,lamps,headlights,engine,get night(){return night;},setNight(value){night=!!value;},dispose(){root.traverse(object=>{if(object.isLight)object.dispose();if(object.isMesh){object.geometry.dispose();object.material.dispose();}});root.removeFromParent();}};
}
