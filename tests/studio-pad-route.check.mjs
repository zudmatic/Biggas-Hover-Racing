import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Group,Vector3} from 'three';
import {createStudioCamera} from '../experiments/vfx-lab/studio-camera.js';
import {createBoostPadSimulation} from '../src/boost-pad-simulation.js';

test('straight studio route crosses forward, loops safely and respects pad cooldown',()=>{
  const ship=new Group(),camera=new PerspectiveCamera(),orbit={enabled:true,target:new Vector3(),update(){}};
  const rig=createStudioCamera(camera,orbit,ship);
  const settings={Cámara:'Actual','Recorrido de prueba':true,Trayectoria:'Recto sobre la placa',
    'Velocidad recorrido':.3,'Tamaño recorrido':8,Lateral:0,Altura:4,Distancia:12,
    'Suavizado posición':.3,'Suavizado giro':.35,'Suavizado mirada':.2,Anticipación:.15,Encuadre:0};
  rig.configure(settings);
  const sim=createBoostPadSimulation([{x:5,y:-.4,z:0,nx:0,nz:1,halfWidth:2.07,halfLength:3.64}]);
  let state={x:0,y:0,z:0,speed:0},lastHit=-Infinity,hits=0,wraps=0;
  for(let i=0;i<1800;i++){
    const before={...state},motion=rig.move(1/60,i/60,{});
    Object.assign(state,{x:ship.position.x,y:ship.position.y,z:ship.position.z,speed:motion.speed});
    assert.equal(state.x,5);assert.equal(ship.rotation.y,0);
    if(motion.reset){wraps++;assert.equal(motion.speed,0);}
    sim.step(1/60,state,motion.reset?state:before,()=>{
      assert.equal(motion.reset,false);assert.ok(state.z>before.z);
      assert.ok(i/60-lastHit>=7);lastHit=i/60;hits++;
    });
  }
  assert.ok(hits>2);assert.ok(wraps>5);
  rig.configure({...settings,Trayectoria:'Vueltas'});rig.move(1/60,31,{});assert.notEqual(ship.position.x,5);
  rig.configure({...settings,'Recorrido de prueba':false});rig.move(1/60,32,{});assert.equal(ship.position.length(),0);
  rig.dispose();
});

test('fixed camera stays put while pad boost accelerates the ship',()=>{
  const ship=new Group(),camera=new PerspectiveCamera(),orbit={enabled:true,target:new Vector3(),update(){}};
  const rig=createStudioCamera(camera,orbit,ship);
  rig.configure({Cámara:'Fija','Recorrido de prueba':true,Trayectoria:'Recto sobre la placa',
    'Velocidad recorrido':.1,'Tamaño recorrido':12,'Impulso de la placa':3,
    Lateral:0,Altura:4,Distancia:12,'Suavizado posición':.3,'Suavizado giro':.35,
    'Suavizado mirada':.2,Anticipación:0,Encuadre:0,FOV:50,'FOV turbo':8});
  const fixed=camera.position.clone(),target=orbit.target.clone();
  rig.move(1/60,0,{});
  const normal=rig.move(1/60,1/60,{}).speed;
  let boosted;
  for(let i=0;i<30;i++){boosted=rig.move(1/60,i/60,{},true).speed;rig.update(1/60,1,false);}
  assert.ok(boosted>normal*2.8);
  assert.deepEqual(camera.position.toArray(),fixed.toArray());
  assert.deepEqual(orbit.target.toArray(),target.toArray());assert.equal(camera.fov,50);
  let coasting;
  for(let i=0;i<30;i++)coasting=rig.move(1/60,i/60,{},false).speed;
  assert.ok(coasting<boosted);assert.ok(coasting>=normal);
  rig.dispose();
});
