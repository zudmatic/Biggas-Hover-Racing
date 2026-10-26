import {test,expect} from '@playwright/test';

test('Bluleet has independent rigs and ink materials, and stays seated while the kart turns',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {createBluleetModel}=await import('/src/bluleet-model.js');
    const {createFlightShip}=await import('/src/flight-ship.js');
    const standing=await createBluleetModel({ink:false}),ship=await createFlightShip('bluleet',{exhaust:false}),actor=ship.pilot.actor;
    const independent=standing.bones.Head!==actor.bones.Head&&standing.meshes[0].material.map!==actor.meshes[0].material[0].map;
    const materials=actor.meshes.flatMap(m=>[].concat(m.material));
    const ink=materials.every(m=>m.isNodeMaterial&&m.userData.chubeeInk)&&actor.root.userData.ink;
    const textured=materials.every(m=>!!m.map);
    ship.root.updateMatrixWorld(true);
    const local=bone=>ship.root.worldToLocal(bone.getWorldPosition(new T.Vector3()));
    const before=local(actor.bones.hand_l),pelvis=local(actor.bones.pelvis).toArray();
    ship.root.rotation.set(.2,1,-.3);ship.root.scale.setScalar(.8);ship.update(2,20,false,false);ship.root.updateMatrixWorld(true);
    const drift=before.distanceTo(local(actor.bones.hand_l));standing.dispose();
    const handErrors=actor.poseStats.handErrors;ship.dispose();
    return {independent,ink,textured,pelvis,drift,handErrors};
  });
  expect(result.independent).toBe(true);expect(result.ink).toBe(true);expect(result.textured).toBe(true);
  expect(result.pelvis[1]).toBeCloseTo(1.225);expect(result.pelvis[2]).toBeCloseTo(-.1);
  expect(result.drift).toBeLessThan(.0001);expect(result.handErrors.every(e=>e<.001)).toBe(true);
});

test('Bluleet closes both hands around the actual steering rim without stretching his arms',async({page})=>{
  await page.goto('/');
  const grips=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {createFlightShip}=await import('/src/flight-ship.js');
    const {createBluleetModel}=await import('/src/bluleet-model.js');
    const actor=await createBluleetModel({seated:true,fit:'bluleet',ink:false}),rest=await createBluleetModel({ink:false});
    const ship=await createFlightShip('bluleet',{exhaust:false}),car=ship.root;
    ship.pilot.root.removeFromParent();
    actor.root.updateMatrixWorld(true);rest.root.updateMatrixWorld(true);car.updateMatrixWorld(true);
    const triangles=[],wheelRegion=new T.Box3(new T.Vector3(-.55,1.08,.4),new T.Vector3(.55,1.9,1.04));
    car.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const positions=mesh.geometry.attributes.position,index=mesh.geometry.index;
      for(let i=0;i<(index?.count??positions.count);i+=3){
        const vertices=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(positions,index?index.getX(i+k):i+k).applyMatrix4(mesh.matrixWorld));
        if(vertices.every(v=>wheelRegion.containsPoint(v)))triangles.push(new T.Triangle(...vertices));
      }
    });
    const position=(model,name)=>model.bones[name].getWorldPosition(new T.Vector3());
    const distance=point=>Math.min(...triangles.map(t=>t.closestPointToPoint(point,new T.Vector3()).distanceTo(point)));
    const result=['l','r'].map(s=>{
      const wrist=position(actor,`hand_${s}`),elbow=position(actor,`lowerarm_${s}`),shoulder=position(actor,`upperarm_${s}`),knuckle=position(actor,`middle_01_${s}`);
      const bindUpper=position(rest,`lowerarm_${s}`).sub(position(rest,`upperarm_${s}`)),bindLower=position(rest,`hand_${s}`).sub(position(rest,`lowerarm_${s}`));
      const hinge=bindUpper.cross(bindLower).normalize().applyQuaternion(rest.bones[`upperarm_${s}`].getWorldQuaternion(new T.Quaternion()).invert());
      const bend=actor.bones[`lowerarm_${s}`].quaternion.clone().multiply(rest.bones[`lowerarm_${s}`].quaternion.clone().invert());
      const bendAxis=new T.Vector3(bend.x,bend.y,bend.z).normalize();
      // Check the deformed mitten surface, not only the skeleton targets.
      const mesh=actor.meshes[0],handBones=new Set(),points=new Map();
      actor.bones[`hand_${s}`].traverse(b=>{if(b.isBone)handBones.add(mesh.skeleton.bones.indexOf(b));});
      let surfaceGap=Infinity,penetration=0,edgeCrossings=0;
      for(let i=0;i<mesh.geometry.attributes.position.count;i++){
        let weight=0;for(let k=0;k<4;k++)if(handBones.has(mesh.geometry.attributes.skinIndex.array[i*4+k]))weight+=mesh.geometry.attributes.skinWeight.array[i*4+k];
        if(weight<=.5)continue;
        const p=mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld);points.set(i,p);
        let nearest=Infinity,inside=false;
        for(const t of triangles){const q=t.closestPointToPoint(p,new T.Vector3()),d=p.distanceTo(q);if(d<nearest){nearest=d;inside=p.clone().sub(q).dot(t.getNormal(new T.Vector3()))<0;}}
        surfaceGap=Math.min(surfaceGap,nearest);if(inside)penetration=Math.max(penetration,nearest);
      }
      const seen=new Set(),index=mesh.geometry.index,ray=new T.Ray(),hit=new T.Vector3();
      for(let i=0;i<index.count;i+=3)for(const [u,v] of [[0,1],[1,2],[2,0]]){
        const a=index.getX(i+u),b=index.getX(i+v),key=[Math.min(a,b),Math.max(a,b)].join(',');
        if(!points.has(a)||!points.has(b)||seen.has(key))continue;seen.add(key);
        const start=points.get(a),end=points.get(b),length=start.distanceTo(end);ray.set(start,end.clone().sub(start).normalize());
        for(const t of triangles)if(ray.intersectTriangle(t.a,t.b,t.c,false,hit)){const d=start.distanceTo(hit);if(d>.0005&&d<length-.0005){edgeCrossings++;break;}}
      }
      return {
        surfaceGap,penetration,edgeCrossings,
        fingerDistance:distance(position(actor,`middle_04_leaf_${s}`)),
        thumbDistance:distance(position(actor,`thumb_04_leaf_${s}`)),
        wristBend:wrist.clone().sub(elbow).angleTo(knuckle.clone().sub(wrist)),
        elbowBend:elbow.clone().sub(shoulder).angleTo(wrist.clone().sub(elbow)),
        hingeAlignment:Math.abs(bendAxis.dot(hinge)),
        elbowFlare:Math.abs(elbow.x-shoulder.x),
        lengths:[['upperarm','lowerarm'],['lowerarm','hand']].map(([a,b])=>position(actor,`${a}_${s}`).distanceTo(position(actor,`${b}_${s}`))/position(rest,`${a}_${s}`).distanceTo(position(rest,`${b}_${s}`))),
      };
    });
    actor.dispose();rest.dispose();ship.dispose();return result;
  });
  for(const grip of grips){
    expect(grip.surfaceGap).toBeLessThan(.012);expect(grip.penetration).toBeLessThan(.001);expect(grip.edgeCrossings).toBe(0);
    expect(grip.fingerDistance).toBeLessThan(.05);expect(grip.thumbDistance).toBeLessThan(.06);
    expect(grip.wristBend).toBeLessThan(Math.PI/3);
    expect(grip.elbowBend).toBeGreaterThan(.9);expect(grip.elbowBend).toBeLessThan(1.9);
    expect(grip.hingeAlignment).toBeGreaterThan(.999);expect(grip.elbowFlare).toBeLessThan(.12);
    for(const length of grip.lengths)expect(length).toBeCloseTo(2.8/3.2,5);
  }
});

for(const backend of ['webgl2','webgpu'])test(`Bluleet can be selected and flown with character ink on ${backend}`,async({page})=>{
  test.setTimeout(150000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'||/Invalid (BindGroup|CommandBuffer)|Multiple aspects|Error while parsing WGSL/.test(message.text()))errors.push(message.text());});
  await page.goto(`/?vehicle=bluleet&comic=0&renderer=${backend}`);
  await page.getByRole('button',{name:'Jugar',exact:true}).click();
  const lobby=page.locator('.race-lobby'),canvas=page.locator('.lobby-preview-canvas');
  await expect(lobby).toHaveAttribute('data-pilot','bluleet');
  await expect(lobby).toHaveAttribute('data-preview','ready',{timeout:60000});
  await expect(canvas).toHaveAttribute('data-paper','false');
  await expect(canvas).toHaveAttribute('data-backend',backend==='webgpu'?'WebGPU':'WebGL2');
  const png=await canvas.screenshot();
  const bluePixels=await page.evaluate(async bytes=>{
    const image=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
    const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
    const {data}=ctx.getImageData(0,0,c.width,c.height);let count=0;
    for(let i=0;i<data.length;i+=4)if(data[i+2]>data[i]*1.3&&data[i+2]>data[i+1]*1.15&&data[i]<180)count++;
    image.close();return count;
  },Array.from(png));expect(bluePixels).toBeGreaterThan(200);
  for(const selector of ['[data-pilot-choice=bluleet] img','.lobby-preview-fallback'])await expect.poll(()=>page.locator(selector).evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  await page.screenshot({path:`test-results/bluleet-pilot-menu-${backend}.png`});
  await page.getByRole('button',{name:'Confirmar Bluleet',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-kind','vehicle');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.screenshot({path:`test-results/bluleet-pilot-kart-${backend}.png`});
  await page.getByRole('button',{name:'Confirmar nave',exact:true}).click();
  await page.getByRole('button',{name:'Volar',exact:true}).click();
  const app=page.locator('.flight-app');await expect(app).toHaveAttribute('data-ready','true',{timeout:60000});
  await expect(app).toHaveAttribute('data-pilot','bluleet');await expect(app).toHaveAttribute('data-comic','false');
  await expect(app).toHaveAttribute('data-phase','flying',{timeout:15000});
  await page.keyboard.down('KeyW');await expect.poll(async()=>Number(await app.getAttribute('data-speed')),{timeout:15000}).toBeGreaterThan(15);await page.keyboard.up('KeyW');
  await page.keyboard.press('Escape');await page.screenshot({path:`test-results/bluleet-pilot-flight-${backend}.png`});
  expect(errors).toEqual([]);
});

test('Bluleet has a usable mobile fallback when the GLB cannot load',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/models/bluleet/bluleet-motionlab-dedos.glb',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.goto('/?pilot=bluleet&vehicle=bluleet&comic=0');
  await page.getByRole('button',{name:'Jugar',exact:true}).click();
  await expect(page.locator('.race-lobby')).toHaveAttribute('data-preview','fallback',{timeout:45000});
  await expect(page.locator('.lobby-preview-fallback')).toBeVisible();
  await expect.poll(()=>page.locator('.lobby-preview-fallback').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  await expect(page.getByRole('button',{name:'Confirmar Bluleet',exact:true})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'test-results/bluleet-pilot-mobile.png'});
});
