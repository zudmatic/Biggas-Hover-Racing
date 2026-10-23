import {test,expect} from '@playwright/test';

// Compare rendered pixels, not just the presence of a map on a material: the
// posterizer used to erase low-contrast grain even with a valid, loaded texture.
test('comic and mono retain surface texture contrast across families and light levels',async({page})=>{
  test.setTimeout(60000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  // A blank document avoids running the room's animation during isolated renders.
  await page.route('**/texture-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Texture regression</title>'}));
  await page.goto('/texture-test');
  const results=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createRoomSurfaces}=await import('/src/room-surfaces.js');
    const {SURFACE_FAMILIES}=await import('/src/surface-library.js');
    const {retroStyle}=await import('/src/retro-style.js');
    const size=96,renderer=new THREE.WebGLRenderer();renderer.setSize(size,size);
    // Float pixels keep fine skin/metal grain above the readback's quantization floor.
    const target=new THREE.WebGLRenderTarget(size,size,{type:THREE.FloatType});renderer.setRenderTarget(target);
    const scene=new THREE.Scene(),light=new THREE.AmbientLight(0xffffff,1);scene.add(light);
    const geometry=new THREE.PlaneGeometry(1,1),surface=new THREE.Mesh(geometry);scene.add(surface);
    const camera=new THREE.OrthographicCamera(-.5,.5,.5,-.5,.1,10);camera.position.z=2;
    const pool=createRoomSurfaces(),results=[];
    retroStyle.setParams({posterSoft:.02,tintAmount:0,monoShadow:0});
    const render=()=>{
      renderer.render(scene,camera);
      const pixels=new Float32Array(size*size*4);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
      const values=[];for(let i=0;i<pixels.length;i+=4)values.push(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722);
      const mean=values.reduce((a,b)=>a+b,0)/values.length;
      const centered=values.map(value=>value/mean-1);
      const variance=centered.reduce((sum,value)=>sum+value*value,0)/values.length;
      return {centered,contrast:Math.sqrt(variance)};
    };
    for(const family of Object.keys(SURFACE_FAMILIES)){
      const material=pool.material(family,0xb0b0b0);surface.material=material;
      // Isolate albedo grain from relief, random mottling and printed dots.
      material.bumpMap=null;material.map.repeat.set(.5,.5);
      material.uniforms.mottle.value=0;material.uniforms.facetVariation.value=0;material.uniforms.retroHalftoneStrength.value=0;
      for(const intensity of [.6,1,1.8]){
        light.intensity=intensity;retroStyle.setLook('normal');const normal=render();
        for(const look of ['comic','mono']){
          retroStyle.setLook(look);const printed=render();
          const covariance=normal.centered.reduce((sum,value,i)=>sum+value*printed.centered[i],0)/normal.centered.length;
          results.push({family,intensity,look,retention:printed.contrast/normal.contrast,correlation:covariance/(normal.contrast*printed.contrast)});
        }
      }
    }
    pool.dispose();geometry.dispose();target.dispose();renderer.dispose();
    retroStyle.setLook('normal');retroStyle.setPreset('day');
    return results;
  });
  for(const result of results){
    const label=JSON.stringify(result);
    expect(result.retention,label).toBeGreaterThan(.7);
    expect(result.retention,label).toBeLessThan(1.4);
    expect(result.correlation,label).toBeGreaterThan(.9);
  }
  expect(errors).toEqual([]);
});
