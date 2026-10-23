import * as THREE from 'three';

// A soft dark ellipse under the character, scaled and faded as it jumps.
export function createContactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,.27)');
  gradient.addColorStop(.3, 'rgba(0,0,0,.20)');
  gradient.addColorStop(.6, 'rgba(0,0,0,.08)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 2.2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, .005, .08);
  return shadow;
}
