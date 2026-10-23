import {test,expect} from '@playwright/test';
import {createZudModel} from '../src/zud-model.js';

test('bending changes the shells, preserves proximal anchors and never accumulates deformation',()=>{
  for(const detail of ['low','original','medium','high']) {
    const model=createZudModel({detail,appearance:false}),other=createZudModel({detail,appearance:false});
    const meshes=[...model.arms.map(arm=>arm.getObjectByName('Brazo')),...model.feet.map(hip=>hip.getObjectByName('Pierna'))];
    const original=meshes.map(mesh=>mesh.geometry.attributes.position.array.slice());
    const otherArm=other.arms[0].getObjectByName('Brazo'),shared=otherArm.geometry.attributes.position.array.slice();
    for(let cycle=0;cycle<20;cycle++) {
      model.rig.elbows.forEach(joint=>joint.rotation.x=-.9);model.rig.knees.forEach(joint=>joint.rotation.x=.7);model.rig.update();
      for(const [index,mesh] of meshes.entries()) {
        const p=mesh.geometry.attributes.position.array,rest=original[index];let moved=0,anchored=0,anchorError=0;
        for(let i=0;i<p.length;i+=3) {
          if(Math.abs(p[i+2]-rest[i+2])>.02)moved++;
          // Upper shoulder and thigh roots are deliberately rigid.
          if(rest[i+1]+mesh.position.y>.1){anchorError=Math.max(anchorError,Math.abs(p[i+1]-rest[i+1]),Math.abs(p[i+2]-rest[i+2]));anchored++;}
        }
        expect(moved).toBeGreaterThan(8);expect(anchored).toBeGreaterThan(8);expect(anchorError).toBeLessThan(1e-7);
      }
      model.rig.reset();
    }
    meshes.forEach((mesh,index)=>{
      const error=mesh.geometry.attributes.position.array.reduce((max,value,i)=>Math.max(max,Math.abs(value-original[index][i])),0);
      expect(error).toBeLessThan(1e-7);
    });
    expect(Array.from(otherArm.geometry.attributes.position.array)).toEqual(Array.from(shared));
    model.dispose();other.dispose();
  }
});
