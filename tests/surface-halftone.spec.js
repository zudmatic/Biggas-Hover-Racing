import {test,expect} from '@playwright/test';

// Material ink that is attached to the surface: the comic look in object space, and the
// Normal look (the print as it was before the comic shader), which must keep its original
// guarantees. Screen-space comic ink is covered in print-style.spec.js.
for(const look of ['normal','comic'])
test(`${look} look: ink preserves average color and follows a moving surface`,async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/');
  const result=await page.evaluate(async look=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {retro}=await import('/src/retro-material.js');
    const {retroStyle}=await import('/src/retro-style.js');
    retroStyle.setLook(look);
    // The flat plane sits in the highlight band: pin the values this test was written for.
    retroStyle.setParams({grain:0,bandShadow:.3,bandLight:.35,bandSoft:.05,posterAmount:.85,posterSteps:6,posterSoft:.12,hiPitch:7,hiOpacity:.3,hiCoverage:.45});
    const renderer=new THREE.WebGLRenderer();renderer.setSize(512,512);
    const target=new THREE.WebGLRenderTarget(512,512);
    renderer.setRenderTarget(target);
    const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,2));
    const material=retro(0x729ea6,{mottle:0,space:'object'});
    const surface=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.5),material);scene.add(surface);
    const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=3;
    const render=()=>{
      renderer.render(scene,camera);
      const pixels=new Uint8Array(512*512*4);
      renderer.readRenderTargetPixels(target,0,0,512,512,pixels);
      return pixels;
    };
    const strength=material.uniforms.retroHalftoneStrength.value;
    const printed=render();material.uniforms.retroHalftoneStrength.value=0;
    const plain=render();material.uniforms.retroHalftoneStrength.value=strength;
    // One quarter world unit is exactly 64 pixels in this orthographic view.
    surface.position.x=.25;const moved=render();
    let changed=0,motionError=0,samples=0;const drift=[0,0,0];
    for(let y=120;y<392;y++)for(let x=120;x<328;x++)for(let c=0;c<3;c++){
      const i=(y*512+x)*4+c,difference=printed[i]-plain[i];
      if(Math.abs(difference)>1)changed++;
      drift[c]+=difference;motionError+=Math.abs(printed[i]-moved[i+64*4]);samples++;
    }
    target.dispose();surface.geometry.dispose();material.dispose();renderer.dispose();
    return {changed,drift:drift.map(value=>value/(samples/3)),motionError:motionError/samples};
  },look);
  expect(result.changed).toBeGreaterThan(1000);
  for(const drift of result.drift)expect(Math.abs(drift)).toBeLessThan(1);
  expect(result.motionError).toBeLessThan(.1);
  expect(errors).toEqual([]);
});
