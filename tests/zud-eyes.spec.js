import {test,expect} from '@playwright/test';
import {Raycaster,Vector3} from 'three';
import {createZudModel} from '../src/zud-model.js';

test('circular pupils stay inside the aperture at extreme sizes, angles and gaze directions',()=>{
  const model=createZudModel({curve:1}),ray=new Raycaster();model.root.updateMatrixWorld(true);
  for(const opening of [.2,.6,1])for(const tilt of [-15,40])for(const gaze of [-1,1]) {
    const settings={eyeOpening:opening,eyeTilt:tilt,pupilSize:1.5,gazeX:gaze,gazeY:-gaze};
    model.eyeController.configure(settings);
    for(const eye of model.eyes.children) {
      const pupil=eye.getObjectByName('Pupila'),white=eye.getObjectByName('Blanco del ojo'),p=pupil.geometry.attributes.position;
      let maxRadiusSquared=0;
      for(let i=0;i<p.count;i++) {
        const side=Math.sign(eye.position.x);
        const dx=p.getX(i)-(-side*.025+gaze*.12),dy=p.getY(i)-(.005-gaze*.115);
        maxRadiusSquared=Math.max(maxRadiusSquared,dx*dx+dy*dy);
      }
      expect(maxRadiusSquared).toBeLessThanOrEqual(.18*.18+1e-6);
      for(let i=0;i<p.count;i+=39) {
        const center=new Vector3();for(let k=0;k<3;k++)center.add(new Vector3().fromBufferAttribute(p,i+k));
        center.divideScalar(3).applyMatrix4(pupil.matrixWorld);ray.set(new Vector3(center.x,center.y,4),new Vector3(0,0,-1));
        const hit=ray.intersectObject(white)[0];
        expect(hit,`pupil escaped aperture: ${opening}, ${tilt}, ${gaze}`).toBeTruthy();
        expect(center.z-hit.point.z,'white surface occludes pupil').toBeGreaterThan(0);
      }
    }
  }
  model.dispose();
});
