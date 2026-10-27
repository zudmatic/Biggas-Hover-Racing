import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createFlameTrail} from '../src/vfx/flame-trail.js';

for(const speed of [0,52,100])for(const power of [.45,1])test(`flame stays compact at ${speed} m/s, power ${power}`,()=>{
  const scene=new THREE.Scene(),ship=new THREE.Group(),material=new THREE.MeshBasicMaterial(),nozzle=[0,0,-2,.24];ship.scale.setScalar(.6);
  const trail=createFlameTrail(scene,material,[nozzle]);
  for(let i=0;i<=144;i++){ship.position.z=speed*i/144;trail.record(i/144,ship);}
  trail.update(1,{Activa:true,Longitud:2.7,Ancho:.7,Pulsación:0},power,7.5,.8);
  const origin=new THREE.Vector3(...nozzle.slice(0,3)).applyMatrix4(ship.matrixWorld),a=new THREE.Vector3(),b=new THREE.Vector3();let longest=0;
  for(const mesh of scene.children){const attr=mesh.geometry.attributes.position;for(let i=0;i<attr.count;i+=2){a.fromBufferAttribute(attr,i);b.fromBufferAttribute(attr,i+1);longest=Math.max(longest,a.add(b).multiplyScalar(.5).distanceTo(origin));}}
  expect(longest).toBeLessThanOrEqual(2.7*power*.6+.00001);expect(longest).toBeGreaterThan(2.7*power*.6*.9);
  trail.clear();expect(scene.children.every(m=>!m.visible)).toBe(true);trail.dispose();material.dispose();expect(scene.children).toHaveLength(0);
});

test('flame history bends through turns and never stretches across recovery',()=>{
  const scene=new THREE.Scene(),ship=new THREE.Group(),material=new THREE.MeshBasicMaterial(),trail=createFlameTrail(scene,material,[[0,0,0,.24]]);
  for(let i=0;i<60;i++){ship.position.set(Math.sin(i/60)*20,0,Math.cos(i/60)*20);ship.rotation.y=i/60;trail.record(i/60,ship);}
  trail.update(59/60,{Activa:true,Longitud:2.7,Ancho:.7,Pulsación:0},1,7.5,0);
  const attr=scene.children[0].geometry.attributes.position;
  expect(Array.from(attr.array).every(Number.isFinite)).toBe(true);
  ship.position.set(200,0,200);trail.record(1,ship);trail.update(1,{Activa:true,Longitud:2.7,Ancho:.7,Pulsación:0},1,7.5,0);
  const point=new THREE.Vector3();for(let i=0;i<attr.count;i++){point.fromBufferAttribute(attr,i);expect(point.distanceTo(ship.position)).toBeLessThan(3.1);}
  trail.dispose();material.dispose();
});

// Stationary ship at scale .6 with one nozzle; returns per-row {t,mid,half} in world units.
function rows(settings,power,{Longitud=2.7,Ancho=.7}={}){
  const scene=new THREE.Scene(),ship=new THREE.Group(),material=new THREE.MeshBasicMaterial(),nozzle=[0,0,-2,.24];ship.scale.setScalar(.6);
  const trail=createFlameTrail(scene,material,[nozzle]);
  for(let i=0;i<=60;i++)trail.record(i/60,ship);
  trail.update(1,{Activa:true,Longitud,Ancho,Pulsación:0,...settings},power,7.5,0);
  const origin=new THREE.Vector3(...nozzle.slice(0,3)).applyMatrix4(ship.matrixWorld),{position,uv}=scene.children[0].geometry.attributes,out=[];
  for(let i=0;i<position.count;i+=2){
    const a=new THREE.Vector3().fromBufferAttribute(position,i),b=new THREE.Vector3().fromBufferAttribute(position,i+1),mid=a.clone().add(b).multiplyScalar(.5);
    out.push({t:uv.getY(i),distance:mid.distanceTo(origin),half:a.distanceTo(mid)});
  }
  trail.dispose();material.dispose();return out;
}

for(const power of [.13,.45,1])test(`root sits on the exit plane at power ${power}`,()=>{
  const nearest=Math.min(...rows({Bocas:[{start:.5,radius:.3}]},power).map(r=>r.distance));
  expect(nearest).toBeCloseTo(.5*.6,2);
});

test('root fits inside the mouth',()=>{
  for(const row of rows({Bocas:[{start:.5,radius:.3}]},1,{Ancho:2}))if(row.t<.05)expect(row.half*.68).toBeLessThanOrEqual(.9*.3*.6+1e-4);
});

test('pilot flame keeps a minimum length when stopped',()=>{
  const longest=Math.max(...rows({Mínima:.7},.13,{Longitud:4.6}).map(r=>r.distance));
  expect(longest).toBeGreaterThanOrEqual(.7*.6*.95);
});

test('idle flame is narrower than an accelerating one',()=>{
  const half=power=>rows({},power).find(r=>Math.abs(r.t-.5)<1e-6).half;
  expect(half(.13)/half(.45)).toBeCloseTo(.6,2);
});

test('length is continuous across the pilot floor',()=>{
  const lengths=[];for(let i=0;i<50;i++)lengths.push(Math.max(...rows({Mínima:.7},1-.87*i/49).map(r=>r.distance)));
  const max=Math.max(...lengths);
  for(let i=1;i<lengths.length;i++)expect(Math.abs(lengths[i]-lengths[i-1])).toBeLessThan(.05*max);
});

test('pilot flame fades out as power drops to zero',()=>{
  const lengths=[];for(let i=0;i<40;i++)lengths.push(Math.max(...rows({Mínima:.7},.13-.124*i/39).map(r=>r.distance)));
  for(let i=1;i<lengths.length;i++)expect(Math.abs(lengths[i]-lengths[i-1])).toBeLessThan(.05*lengths[0]);
  expect(lengths.at(-1)).toBeLessThan(.1*lengths[0]);
});

// Records 2 s of motion at 60 Hz from pose(t, ship), then returns each strip's row centres (root → tip) in world space.
function flightRows(nozzles,pose,{power=1,settings={}}={}){
  const scene=new THREE.Scene(),ship=new THREE.Group(),material=new THREE.MeshBasicMaterial();ship.scale.setScalar(.75);
  const trail=createFlameTrail(scene,material,nozzles);
  for(let i=0;i<=120;i++){pose(i/60,ship);trail.record(i/60,ship);}
  trail.update(2,{Activa:true,Longitud:4.6,Ancho:1.22,Pulsación:0,...settings},power,7.5,0);
  const strips=scene.children.map(mesh=>{
    const {position,uv}=mesh.geometry.attributes,rows=[];
    for(let i=0;i<position.count;i+=2)rows.push({t:uv.getY(i),mid:new THREE.Vector3().fromBufferAttribute(position,i).add(new THREE.Vector3().fromBufferAttribute(position,i+1)).multiplyScalar(.5)});
    return rows.sort((a,b)=>a.t-b.t).map(r=>r.mid);
  });
  trail.dispose();material.dispose();return {strips,ship};
}
const arc=rows=>rows.slice(1).reduce((sum,p,i)=>sum+p.distanceTo(rows[i]),0);
const angle=(a,b)=>THREE.MathUtils.radToDeg(a.angleTo(b));

test('drifting: the flame leaves along the nozzle axis instead of the travel direction',()=>{
  // Heading +z (exhaust -z) while sliding 35° sideways at 40 m/s.
  const velocity=new THREE.Vector3(Math.sin(.61),0,Math.cos(.61)).multiplyScalar(40);
  const {strips:[rows]}=flightRows([[0,0,-2,.24]],(t,ship)=>{ship.position.copy(velocity).multiplyScalar(t);});
  const root=rows[0],early=rows[Math.round(rows.length*.3)];
  expect(angle(early.clone().sub(root),new THREE.Vector3(0,0,-1))).toBeLessThan(10);
});

test('straight flight keeps the flame on the axis at any speed',()=>{
  for(const speed of [0,30,90]){
    const {strips:[rows]}=flightRows([[0,0,-2,.24]],(t,ship)=>{ship.position.z=speed*t;});
    const root=rows[0];for(const p of rows)expect(Math.hypot(p.x-root.x,p.y-root.y)).toBeLessThan(.01);
  }
});

test('flame length is measured along its curve, moving or not',()=>{
  const turning=(t,ship)=>{const yaw=2.5*t;ship.rotation.y=yaw;ship.position.set(12*(1-Math.cos(yaw)),0,12*Math.sin(yaw));};
  for(const pose of [()=>{},(t,ship)=>{ship.position.z=40*t;},turning]){
    const {strips:[rows]}=flightRows([[0,0,-2,.24]],pose);
    expect(arc(rows)).toBeCloseTo(4.6*.75,1);
  }
});

test('Bulldog side flames keep their spacing through a turn and never cross',()=>{
  const nozzles=[[-.88,.66,-2.8,.15],[0,1.23,-3.14,.44],[.88,.66,-2.8,.15]];
  for(const direction of [1,-1]){
    // Circle of radius 12 at 30 m/s (yaw rate 2.5 rad/s), turning left (+1) or right (-1).
    const {strips,ship}=flightRows(nozzles,(t,s)=>{const yaw=2.5*t*direction;s.rotation.y=yaw;s.position.set(12*direction*(1-Math.cos(yaw)),0,12*Math.sin(yaw*direction)*direction);});
    ship.updateMatrixWorld(true);
    const local=p=>ship.worldToLocal(p.clone());
    for(let j=0;j<strips[0].length;j+=6){
      const left=local(strips[0][j]),right=local(strips[2][j]);
      expect(right.x-left.x).toBeGreaterThan(.8*1.76);
    }
  }
});

test('wall impact: the flame never folds back over the nozzle',()=>{
  // 40 m/s along +z, then the wall stops the ship dead at t=1.9, kicks its yaw and bounces it back at 4 m/s.
  const nozzles=[[-.88,.66,-2.8,.15],[0,1.23,-3.14,.44],[.88,.66,-2.8,.15]];
  for(const settle of [1/60,3/60,6/60]){
    const impact=2-settle;
    const {strips}=flightRows(nozzles,(t,ship)=>{
      if(t<=impact){ship.position.set(0,0,40*t);ship.rotation.y=0;}
      else{ship.position.set(0,0,40*impact-4*(t-impact));ship.rotation.y=.25;}
    });
    for(const rows of strips){
      let farthest=0;
      for(const p of rows){const d=p.distanceTo(rows[0]);expect(d).toBeGreaterThanOrEqual(farthest-1e-3);farthest=Math.max(farthest,d);}
    }
  }
});

test('glancing wall hit: pushed out sideways, the flame keeps its length and shape',()=>{
  // 40 m/s along +z; at the hit the wall shoves the hull .4 m sideways and reflects it to (8, 30) m/s, nose kicked .2 rad.
  for(const since of [1/60,3/60,8/60]){
    const impact=2-since;
    const {strips}=flightRows([[-.88,.66,-2.8,.15],[0,1.23,-3.14,.44],[.88,.66,-2.8,.15]],(t,ship)=>{
      if(t<=impact){ship.position.set(0,0,40*t);ship.rotation.y=0;}
      else{const after=t-impact;ship.position.set(.4+8*after,0,40*impact+30*after);ship.rotation.y=.2;}
    });
    for(const rows of strips){
      expect(arc(rows)).toBeGreaterThan(.8*4.6*.75);
      let farthest=0;for(const p of rows){const d=p.distanceTo(rows[0]);expect(d).toBeGreaterThanOrEqual(farthest-1e-3);farthest=Math.max(farthest,d);}
    }
  }
});
