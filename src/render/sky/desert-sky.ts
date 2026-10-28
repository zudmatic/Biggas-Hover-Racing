import {
  BackSide,
  ClampToEdgeWrapping,
  Color,
  Group,
  MathUtils,
  Mesh,
  MirroredRepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  Vector3,
  type BufferGeometry,
  type Camera,
  type MeshBasicMaterial,
  type Points,
  type PointsMaterial,
  type Scene,
  type Texture,
} from 'three';
import {MeshBasicNodeMaterial} from 'three/webgpu';
import {mix, positionLocal, smoothstep, texture, uniform, uv, vec2, vec3} from 'three/tsl';
import {luma709} from '../shaders/color';
import {createStarField, createSunDisc, seededRandom, type Sky, type SkyUpdateOptions} from './sky';

const RADIUS = 4400;

/**
 * Reuses the user's painted portfolio sky. Mirrored horizontal wrapping makes
 * both joins continuous; haze and a zenith fade remove the image's top/bottom
 * edges. The complete dome follows the camera, including jump-height views.
 */
export class DesertSky implements Sky {
  readonly root = new Group();
  readonly dome: Mesh<SphereGeometry, MeshBasicNodeMaterial>;
  readonly sun: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly stars: Points<BufferGeometry, PointsMaterial>;
  readonly cloudCount = 0;

  private readonly panorama: Texture;
  /** 1 once the panorama has loaded; until then the dome shows the plain gradient. */
  private readonly ready = uniform(0);
  private readonly nightBlend = uniform(0);
  private readonly sunDay = new Color(0xffe4a2);
  private readonly moon = new Color(0xdcecff);
  private blend = 0;
  private disposed = false;

  constructor(scene: Scene, {mobile = false}: {mobile?: boolean} = {}) {
    const {root, ready, nightBlend} = this;
    root.name = 'Cielo panorámico del cañón';
    scene.add(root);
    const geometry = new SphereGeometry(RADIUS, 32, 20);
    const panorama = (this.panorama = new TextureLoader().load(
      `${import.meta.env.BASE_URL}textures/sky/desert-cloud-panorama-v01.webp`,
      () => {
        if (this.disposed) panorama.dispose();
        else ready.value = 1;
      },
    ));
    panorama.colorSpace = SRGBColorSpace;
    panorama.wrapS = MirroredRepeatWrapping;
    panorama.wrapT = ClampToEdgeWrapping;

    const height = positionLocal.y.div(RADIUS).clamp(0, 1);
    const sampleUV = vec2(uv().x.mul(2), uv().y.sub(0.5).mul(3.3).clamp(0, 1));
    const painted = texture(panorama, sampleUV).rgb;
    const clouds = mix(vec3(luma709(painted)), painted, 0.93)
      .mul(vec3(1.02, 1, 0.94))
      .mul(0.8);
    const horizon = uniform(new Color(0xc7d5cf));
    const zenith = uniform(new Color(0x3c87bc));
    const gradient = mix(horizon, zenith, height.pow(0.35));
    const horizonFade = smoothstep(0, 0.12, height);
    const zenithFade = smoothstep(0.7, 0.9, height);
    const day = mix(mix(horizon, clouds, horizonFade), zenith, zenithFade);
    const night = mix(uniform(new Color(0x263c58)), uniform(new Color(0x071329)), height.pow(0.55));
    const material = new MeshBasicNodeMaterial({side: BackSide, depthWrite: false, fog: false, toneMapped: false});
    material.colorNode = mix(mix(gradient, day, ready), night, nightBlend);
    this.dome = new Mesh(geometry, material);
    this.dome.name = 'Panorama pintado sin costuras';
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    root.add(this.dome);

    this.sun = createSunDisc();
    this.sun.position.copy(new Vector3(-160, 220, -120).normalize()).multiplyScalar(3500);
    root.add(this.sun);
    this.stars = createStarField(seededRandom(39033), mobile ? 90 : 180);
    this.stars.visible = false;
    root.add(this.stars);
  }

  update(camera: Camera, _time: number, {night = false, dt = 0, reducedMotion = false}: SkyUpdateOptions = {}): void {
    this.root.position.copy(camera.position);
    this.blend = reducedMotion ? Number(night) : MathUtils.damp(this.blend, Number(night), 5, dt);
    this.nightBlend.value = this.blend;
    this.sun.material.color.copy(this.sunDay).lerp(this.moon, this.blend);
    this.stars.visible = this.blend > 0.01;
    this.stars.material.opacity = this.blend * 0.85;
  }

  dispose(): void {
    this.disposed = true;
    this.panorama.dispose();
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.sun.geometry.dispose();
    this.sun.material.dispose();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
    this.root.removeFromParent();
  }
}
