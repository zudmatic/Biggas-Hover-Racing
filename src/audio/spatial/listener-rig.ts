import {Quaternion, Vector3, type Camera} from 'three';

/** Keeps the Web Audio listener on the game camera. */
export class ListenerRig {
  /** Listener world position after the last `update`. */
  readonly position = new Vector3();
  private readonly forward = new Vector3();
  private readonly up = new Vector3();
  private readonly rotation = new Quaternion();

  update(context: AudioContext, camera: Camera): void {
    camera.getWorldPosition(this.position);
    camera.getWorldQuaternion(this.rotation);
    this.forward.set(0, 0, -1).applyQuaternion(this.rotation);
    this.up.set(0, 1, 0).applyQuaternion(this.rotation);
    const {listener} = context;
    const {position: p, forward: f, up: u} = this;
    if (listener.positionX) {
      const now = context.currentTime;
      listener.positionX.setValueAtTime(p.x, now);
      listener.positionY.setValueAtTime(p.y, now);
      listener.positionZ.setValueAtTime(p.z, now);
      listener.forwardX.setValueAtTime(f.x, now);
      listener.forwardY.setValueAtTime(f.y, now);
      listener.forwardZ.setValueAtTime(f.z, now);
      listener.upX.setValueAtTime(u.x, now);
      listener.upY.setValueAtTime(u.y, now);
      listener.upZ.setValueAtTime(u.z, now);
    } else {
      listener.setPosition(p.x, p.y, p.z);
      listener.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }
}
