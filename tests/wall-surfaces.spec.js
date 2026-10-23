import {test,expect} from '@playwright/test';

test('plaster joints render like one continuous surface in every look',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('**/wall-probe',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('/wall-probe');
  const results=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/.vite/deps/three.js');
    const {createRetroRoom}=await import('/src/retro-room.js');
    const {setRoomSurfaceUV}=await import('/src/surface-library.js');
    const {retroStyle}=await import('/src/retro-style.js');
    const room=createRetroRoom({deferExterior:true}),walls=room.room.getObjectByName('Paredes');
    const scene=new THREE.Scene();scene.add(walls,new THREE.AmbientLight(0xffffff,2));
    const renderer=new THREE.WebGLRenderer();renderer.setSize(128,128);
    const target=new THREE.WebGLRenderTarget(128,128);renderer.setRenderTarget(target);
    const camera=new THREE.OrthographicCamera(-.5,.5,.5,-.5,.1,20),results=[];
    const render=()=>{
      renderer.render(scene,camera);const pixels=new Uint8Array(128*128*4);
      renderer.readRenderTargetPixels(target,0,0,128,128,pixels);return pixels;
    };
    // Both the horizontal joint left of the window and the vertical one below
    // it must match a single unbroken sheet, including the object-space ink.
    for(const [x,y] of [[-1,1.5],[.15,.8]]){
      camera.position.set(x,y,5);camera.lookAt(x,y,-2.35);
      const geometry=new THREE.PlaneGeometry(1,1);geometry.translate(x,y,-2.35);setRoomSurfaceUV(geometry);
      const reference=new THREE.Mesh(geometry,walls.children[0].material);scene.add(reference);
      for(const look of ['normal','comic','mono']){
        retroStyle.setLook(look);walls.visible=true;reference.visible=false;const actual=render();
        walls.visible=false;reference.visible=true;const expected=render();
        const differences=actual.reduce((sum,value,i)=>sum+Number(Math.abs(value-expected[i])>3),0);
        results.push({x,y,look,differences});
      }
      reference.removeFromParent();geometry.dispose();
    }
    target.dispose();renderer.dispose();room.surfaces.dispose();return results;
  });
  for(const result of results)expect(result.differences,JSON.stringify(result)).toBeLessThan(128*128*.01);
  expect(errors).toEqual([]);
});
