import * as THREE from "three/webgpu"
import type { WaterContact } from "./water"

/** Use this until your own scene has a contact-distance map.
 * White in both R/G means no nearby shore/boat: no phantom foam or edge tint. */
export function createEmptyWaterContact(waterLevel = 0) {
  const texture = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    THREE.RGBAFormat
  )
  texture.needsUpdate = true
  const info: WaterContact = {
    minXZ: [0, 0],
    sizeXZ: [1, 1],
    maxDistance: 2,
    waterLevel,
  }
  return { texture, info }
}
