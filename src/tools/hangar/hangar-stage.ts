import {
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  ShadowMaterial,
  Vector3,
  type Scene,
} from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {PMREMGenerator, type RenderTarget, type WebGPURenderer} from 'three/webgpu';

const TICKS = 60;

/** Hangar lighting and set dressing: room reflections, platform, rings, grid, ticks and the contact shadow. */
export class HangarStage {
  private readonly environment: RenderTarget;
  private readonly contact: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly owned: {dispose(): void}[] = [];

  constructor(renderer: WebGPURenderer, scene: Scene) {
    // The renderer is already initialised, so the synchronous PMREM path is safe.
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    scene.environment = this.environment.texture;
    scene.environmentIntensity = 0.5;
    room.dispose();
    pmrem.dispose();

    scene.add(new HemisphereLight(0xfaf8eb, 0x798a75, 1.25));
    const key = new DirectionalLight(0xfff9eb, 2.5);
    key.position.set(-3, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -5;
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.00015;
    key.shadow.radius = 3;
    scene.add(key);
    const fill = new DirectionalLight(0xd4e5ff, 1.1);
    fill.position.set(5, 4, -5);
    scene.add(fill);

    const platform = new Mesh(new CylinderGeometry(3.6, 3.65, 0.16, 96), new MeshStandardMaterial({color: 0xf3f3f3, roughness: 1}));
    platform.position.y = -0.12;
    platform.receiveShadow = true;
    scene.add(platform);

    const ring = new Mesh(new RingGeometry(3.22, 3.235, 128), new MeshBasicMaterial({color: 0x008dca, side: DoubleSide}));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.035;
    scene.add(ring);
    const ringOuter = ring.clone();
    ringOuter.scale.setScalar(1.09);
    scene.add(ringOuter);

    const floor = new Mesh(new PlaneGeometry(200, 200), new ShadowMaterial({color: 0x111111, opacity: 0.11}));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.205;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new GridHelper(6, 12, 0xcccccc, 0xcccccc);
    grid.position.y = -0.033;
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    scene.add(grid);

    // One segment list instead of sixty two-point lines: same strokes, one draw call.
    const tickPoints: Vector3[] = [];
    for (let i = 0; i < TICKS; i++) {
      const angle = (i / TICKS) * Math.PI * 2;
      const radius = i % 5 === 0 ? 3.3 : 3.36;
      tickPoints.push(
        new Vector3(Math.sin(angle) * radius, -0.028, Math.cos(angle) * radius),
        new Vector3(Math.sin(angle) * 3.43, -0.028, Math.cos(angle) * 3.43),
      );
    }
    const ticks = new LineSegments(
      new BufferGeometry().setFromPoints(tickPoints),
      new LineBasicMaterial({color: 0x111111, transparent: true, opacity: 0.65}),
    );
    scene.add(ticks);

    // A soft, procedural contact shadow grounds the ship without extra assets.
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const context = shadowCanvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 62);
      gradient.addColorStop(0, 'rgba(38,50,32,.30)');
      gradient.addColorStop(1, 'rgba(38,50,32,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const shadowTexture = new CanvasTexture(shadowCanvas);
    this.contact = new Mesh(new PlaneGeometry(4.8, 6), new MeshBasicMaterial({map: shadowTexture, transparent: true, depthWrite: false}));
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = -0.024;
    scene.add(this.contact);

    this.owned.push(
      platform.geometry,
      platform.material,
      ring.geometry,
      ring.material,
      floor.geometry,
      floor.material,
      grid.geometry,
      grid.material,
      ticks.geometry,
      ticks.material,
      this.contact.geometry,
      this.contact.material,
      shadowTexture,
    );
  }

  /** The contact shadow fades and spreads as the ship lifts off. */
  update(altitude: number): void {
    this.contact.material.opacity = 1 - altitude * 0.38;
    this.contact.scale.setScalar(1 + altitude * 0.12);
  }

  dispose(): void {
    this.environment.dispose();
    for (const resource of this.owned) resource.dispose();
  }
}
