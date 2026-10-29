// Development-only, fixed driver-height views for repeatable art comparisons.
// Loaded only with an explicit ?artView camera key. No racing input is simulated.
import type {Object3D, PerspectiveCamera} from 'three';

interface ArtView {
  x: number;
  z: number;
  yaw: number;
  height?: number;
  lookHeight?: number;
}

/** The slice of the hover state the review overwrites to park the ship at a view. */
export interface ArtReviewState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  throttle: number;
  vx: number;
  vz: number;
}

/** What the review needs from the Desert Valley world (stand-in until the tracks domain exports its type). */
export interface ArtReviewWorld {
  surfaceHeight(x: number, z: number): number | null | undefined;
  lod: {update(state: ArtReviewState, dt: number, force: boolean): void};
}

export interface ArtReviewOptions {
  key: string | null;
  world: ArtReviewWorld;
  state: ArtReviewState;
  camera: PerspectiveCamera;
  vehicle: {root: Object3D};
  app: HTMLElement;
}

const VIEWS = {
  station: {x: -12.87, z: -300.17, yaw: -1.678},
  water: {x: 294.3, z: -83.4, yaw: 2.9},
  mountain: {x: -140.9, z: -29.3, yaw: -0.55},
  houses: {x: -170, z: 130, yaw: -0.85},
  riverEnd: {x: 270, z: -285, yaw: -2.76},
  riverReturn: {x: 203.68146, z: -349.35947, yaw: 2.95823},
  skyHigh: {x: -140.9, z: -29.3, yaw: -1.570796, height: 25, lookHeight: 90},
  train: {x: -237.66, z: 16, yaw: 0},
} satisfies Record<string, ArtView>;

type ArtViewKey = keyof typeof VIEWS;

const LABELS: Record<ArtViewKey, string> = {
  station: 'Estación',
  water: 'Río',
  mountain: 'Montaña',
  houses: 'Casas',
  riverEnd: 'Proa',
  riverReturn: 'Retorno',
  skyHigh: 'Cielo alto',
  train: 'Tren',
};

const STYLE =
  '.flight-app>*:not(canvas):not(.art-review-nav),body>.flight-scale{display:none!important}.art-review-nav{position:fixed;bottom:12px;left:12px;display:flex;gap:8px;z-index:99}.art-review-nav a{font:12px monospace;color:white;background:#17252cbb;padding:8px 12px;text-decoration:none;border-radius:5px}';

const isViewKey = (key: string | null): key is ArtViewKey => key !== null && Object.hasOwn(VIEWS, key);

/** Parks the camera at a fixed art view and hides the race HUD behind a small view switcher. */
export class DesertArtReview {
  private readonly style: HTMLStyleElement;
  private readonly nav: HTMLElement;

  static mount(options: ArtReviewOptions): DesertArtReview {
    return new DesertArtReview(options);
  }

  private constructor({key, world, state, camera, vehicle, app}: ArtReviewOptions) {
    const view: ArtView = isViewKey(key) ? VIEWS[key] : VIEWS.station;
    const ground = world.surfaceHeight(view.x, view.z) ?? 0;
    Object.assign(state, {x: view.x, y: ground + 0.65, z: view.z, yaw: view.yaw, speed: 0, throttle: 0, vx: 0, vz: 0});
    camera.fov = 62;
    camera.position.set(view.x, ground + (view.height ?? 2.6), view.z);
    camera.lookAt(view.x + Math.sin(view.yaw) * 70, ground + (view.lookHeight ?? 3.2), view.z + Math.cos(view.yaw) * 70);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    vehicle.root.visible = false;
    world.lod.update(state, 0, true);
    // Same as before: a missing key still writes the attribute (as the string "null").
    app.dataset.artView = String(key);

    this.style = document.createElement('style');
    this.style.textContent = STYLE;
    document.head.append(this.style);

    this.nav = document.createElement('nav');
    this.nav.className = 'art-review-nav';
    this.nav.ariaLabel = 'Vistas de arte';
    for (const [name, label] of Object.entries(LABELS)) {
      const link = document.createElement('a');
      const url = new URL(location.href);
      url.searchParams.set('artView', name);
      url.searchParams.set('selection', 'map');
      link.href = url.href;
      link.textContent = label;
      this.nav.append(link);
    }
    app.append(this.nav);
    app.dataset.artCamera = JSON.stringify({position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov});
  }

  dispose(): void {
    this.nav.remove();
    this.style.remove();
  }
}

/** Entry point dynamically imported by the flight simulator in dev with `?artView=`. */
export function mountDesertArtReview(options: ArtReviewOptions): DesertArtReview {
  return DesertArtReview.mount(options);
}
