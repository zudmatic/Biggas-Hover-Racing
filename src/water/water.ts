import {
  attribute,
  cameraPosition,
  color,
  float,
  mix,
  modelWorldMatrix,
  positionGeometry,
  positionWorld,
  refract,
  shadow,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { WATER_WAVES } from "./waves"

export type WaterContact = {
  minXZ: number[]
  sizeXZ: number[]
  maxDistance: number
  waterLevel: number
}

/** Transparent wave surface over a two-triangle seabed. Shared packed textures
 * and the existing sun shadow; no reflection/refraction render passes. */
export function createWater(
  pattern: THREE.Texture,
  sun: THREE.DirectionalLight,
  toSun: THREE.Vector3,
  contact: THREE.Texture,
  contactInfo: WaterContact,
  mesh: THREE.Mesh,
  bedPattern: THREE.Texture,
  options: { geometry?: THREE.BufferGeometry; maxWaveHeight?: number; desert?: boolean } = {}
) {
  pattern.colorSpace = THREE.NoColorSpace
  pattern.wrapS = pattern.wrapT = THREE.RepeatWrapping
  pattern.minFilter = THREE.LinearMipmapLinearFilter
  pattern.magFilter = THREE.LinearFilter
  pattern.anisotropy = 4
  bedPattern.colorSpace = THREE.NoColorSpace
  bedPattern.wrapS = bedPattern.wrapT = THREE.RepeatWrapping
  bedPattern.minFilter = THREE.LinearMipmapLinearFilter
  bedPattern.magFilter = THREE.LinearFilter
  bedPattern.anisotropy = 4
  contact.colorSpace = THREE.NoColorSpace
  contact.flipY = false
  contact.wrapS = contact.wrapT = THREE.ClampToEdgeWrapping
  contact.generateMipmaps = false
  contact.minFilter = contact.magFilter = THREE.LinearFilter

  // The optional river grid is bounded, clipped to wet cells and kept local to
  // this mesh. The source quad stays in the original GLB.
  mesh.updateWorldMatrix(true, false)
  const bounds = new THREE.Box3().setFromObject(mesh)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const inverseWorld = mesh.matrixWorld.clone().invert()
  const localUp = new THREE.Vector3(0, 1, 0).applyMatrix3(
    new THREE.Matrix3().setFromMatrix4(inverseWorld)
  )
  const geometry = options.geometry ?? mesh.geometry.clone()
  const displacementPadding = (options.maxWaveHeight ?? 0.2) * localUp.length()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.boundingBox?.expandByScalar(displacementPadding)
  if (geometry.boundingSphere)
    geometry.boundingSphere.radius += displacementPadding

  const phase = uniform(0)
  const scale = uniform(1)
  const caustics = uniform(0.85)
  const glints = uniform(0.35)
  const ripples = uniform(0.75)
  const sunStrength = uniform(1)
  const distantBlue = uniform(1)
  const blueDistance = uniform(75)
  const foam = uniform(0.7)
  const foamWidth = uniform(0.35)
  const waveHeight = uniform(0.045)
  const waterDepth = uniform(1.25)
  const clarity = uniform(0.75)
  const sunDirection = uniform(toSun)
  const boatContactFromWorld = uniform(new THREE.Matrix4())

  // Two long crossing waves, evaluated on the GPU. Their analytic slopes also
  // light the surface, so the shape and shading travel together.
  const baseWorld = modelWorldMatrix.mul(vec4(positionGeometry, 1)).xyz
  const [first, second] = WATER_WAVES
  const shoreWeight = options.geometry ? attribute('waterShore', 'float') : float(1)
  const waveA = baseWorld.xz
    .dot(vec2(first.x, first.z))
    .sub(phase.mul(first.speed))
  const waveB = baseWorld.xz
    .dot(vec2(second.x, second.z))
    .sub(phase.mul(second.speed))
  const swell = waveA
    .sin()
    .mul(first.weight)
    .add(waveB.sin().mul(second.weight))
  const waveSlope = vec2(first.x, first.z)
    .mul(waveA.cos().mul(first.weight))
    .add(vec2(second.x, second.z).mul(waveB.cos().mul(second.weight)))
    .mul(waveHeight).mul(shoreWeight)

  // Reuse the sun's shadow node, rather than allocating another shadow map.
  // r184 supports this hook; the installed r182 typings don't declare it yet.
  const visibility = shadow(sun)
  ;(
    sun.shadow as THREE.DirectionalLightShadow & { shadowNode: THREE.Node }
  ).shadowNode = visibility

  const worldUV = positionWorld.xz.mul(0.14).mul(scale).toVar()
  const current = options.desert ? vec2(0.006, 0.035).mul(phase) : vec2(0)
  const flowUV = worldUV.sub(current)
  const drift = phase.mul(0.018)
  // Broad oblique distortion does not restart at the texture's tile edges.
  // The two layers no longer march along the same repeating rows.
  const warp = vec2(
    flowUV.dot(vec2(1.71, 2.37)).add(phase.mul(0.09)).sin(),
    flowUV.dot(vec2(-2.13, 1.19)).sub(phase.mul(0.07)).sin()
  ).mul(0.19)
  const rotatedUV = vec2(
    flowUV.x.mul(0.8).sub(flowUV.y.mul(0.6)),
    flowUV.x.mul(0.6).add(flowUV.y.mul(0.8))
  )
  const b = texture(
    pattern,
    rotatedUV
      .mul(1.631)
      .add(vec2(0.43, 0.27))
      .sub(vec2(drift.mul(0.48), drift.mul(0.67)))
      .sub(warp)
  ).toVar()
  // Reuse the second sample's slopes to bend the first pattern. This breaks
  // up identical cells without a third sample or a procedural noise loop.
  const bSlope = b.rg.sub(0.5)
  const worldBSlope = vec2(
    bSlope.x.mul(0.8).add(bSlope.y.mul(0.6)),
    bSlope.y.mul(0.8).sub(bSlope.x.mul(0.6))
  ).toVar()
  const view = cameraPosition.sub(positionWorld).normalize().toVar()
  const opticalSlope = worldBSlope.mul(0.24).sub(waveSlope)
  const opticalNormal = vec3(opticalSlope.x, 1, opticalSlope.y).normalize()
  // Project the view through the moving surface onto a virtual submerged
  // layer. This is UV parallax, not a screen-space refraction render pass.
  const underwaterRay = refract(
    view.negate(),
    opticalNormal,
    float(0.75)
  ).toVar()
  const submergedXZ = positionWorld.xz
    .add(
      underwaterRay.xz.mul(waterDepth.div(underwaterRay.y.negate().max(0.4)))
    )
    .toVar()
  const submergedUV = submergedXZ.mul(0.14).mul(scale).sub(current)
  const a = texture(
    pattern,
    submergedUV
      .add(vec2(drift.mul(0.6), drift.mul(0.22)))
      .add(warp)
      .add(worldBSlope.mul(0.12))
  ).toVar()
  const patches = a.a.mul(0.5).add(b.a.mul(0.5))
  const body = mix(
    color(options.desert ? "#086878" : "#104e58"),
    color(options.desert ? "#20a397" : "#267c79"),
    patches.smoothstep(0.25, 0.72)
  )
  const transmission = waterDepth.mul(-0.38).exp().mul(clarity)
  const ribbons = a.b
    .mul(b.a.smoothstep(0.2, 0.75).mul(0.65).add(0.35))
    .smoothstep(0.18, 0.55)
  const nearColor = mix(
    body,
    color(options.desert ? "#b6e4cd" : "#c5dfb6"),
    ribbons.mul(caustics).mul(transmission.mul(0.4).add(0.5)).clamp()
  ).mul(1.15)

  const distance = cameraPosition.xz.sub(positionWorld.xz).length()
  const farMix = distance
    .smoothstep(blueDistance.mul(0.45), blueDistance)
    .mul(distantBlue)
  const deepColor = mix(color(options.desert ? "#07566d" : "#174c65"), color(options.desert ? "#158e9d" : "#287487"), patches).mul(1.05)
  const waterColor = mix(nearColor, deepColor, farMix.mul(0.94))

  // Only the surface layer drives the highlights; changing bed depth cannot
  // drag the sun sparkle along with the underwater pattern.
  const slope = worldBSlope.mul(1.6).mul(ripples).sub(waveSlope)
  const rippleNormal = vec3(slope.x, 1, slope.y).normalize()
  const half = view.add(sunDirection)
  // Art-directed sun lobe: compress the horizontal half-vector so a low
  // camera sees restrained glints without physically enormous wave slopes.
  const sunHalf = vec3(
    half.x.mul(0.24),
    half.y.add(0.14),
    half.z.mul(0.24)
  ).normalize()
  const shine = rippleNormal
    .dot(sunHalf)
    .max(0)
    .pow(95)
    .mul(b.b.smoothstep(0.25, 0.7))
    .mul(b.a.smoothstep(0.3, 0.7))
    .mul(glints)
    .mul(sunStrength)
    .mul(7)
  const lit = visibility.r
  const shade = mix(vec3(0.38, 0.66, 0.73), vec3(1), lit)
  const surfaceLight = rippleNormal
    .dot(sunDirection)
    .sub(sunDirection.y)
    .mul(0.55)
    .add(1)

  // World-space distance to real triangle/water intersections. The padded
  // border stores maxDistance, so clamping outside the map produces no foam.
  const contactUV = positionWorld.xz
    .sub(vec2(contactInfo.minXZ[0], contactInfo.minXZ[1]))
    .div(vec2(contactInfo.sizeXZ[0], contactInfo.sizeXZ[1]))
  // The same packed mask stores the boat independently of the shore. Sample
  // its rest footprint through the inverse boat motion, so foam follows it.
  const boatContactUV = boatContactFromWorld
    .mul(vec4(positionWorld, 1))
    .xz.sub(vec2(contactInfo.minXZ[0], contactInfo.minXZ[1]))
    .div(vec2(contactInfo.sizeXZ[0], contactInfo.sizeXZ[1]))
  const shoreDistance = texture(contact, contactUV)
    .r.min(texture(contact, boatContactUV).g)
    .mul(contactInfo.maxDistance)
    .toVar()
  const contactShade = shoreDistance.smoothstep(0.05, 1.6).oneMinus().mul(0.7)
  const width = foamWidth.mul(a.a.mul(0.55).add(0.65))
  const edge = shoreDistance.smoothstep(0.025, width).oneMinus()
  const fragments = b.b.smoothstep(0.1, 0.65).mul(b.a.smoothstep(0.2, 0.65))
  const wash = shoreDistance
    .sub(width.mul(swell.mul(0.15).add(0.7)))
    .abs()
    .smoothstep(0.015, width.mul(0.25))
    .oneMinus()
    .mul(fragments)
    .mul(0.3)
  const foamMask = edge.mul(fragments).max(wash).mul(foam).clamp()
  const groundedColor = mix(waterColor, color("#075648"), contactShade)
  // A restrained grazing-angle tint separates the surface from the bed.
  const sheen = rippleNormal.dot(view).max(0).oneMinus().pow(4).mul(0.22)
  const surface = mix(groundedColor, color("#6cabb4"), sheen)
    .mul(surfaceLight)
    .mul(shade)
    .add(vec3(1, 0.91, 0.66).mul(shine).mul(lit))
  const material = new THREE.MeshBasicNodeMaterial({
    name: "Waterfront | stylized water",
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    forceSinglePass: true,
  })
  material.lights = false
  material.positionNode = positionGeometry.add(
    uniform(localUp).mul(swell.mul(waveHeight).mul(shoreWeight))
  )
  material.colorNode = mix(
    surface,
    color("#e3f5e5").mul(1.6).mul(shade),
    foamMask
  )
  // Reveal actual submerged hull/wall geometry, not just a pattern painted on
  // the surface. Clearer nearby water, absorption at depth and an opaque blue
  // horizon. Foam and highlights remain on top of the transparent layer.
  const grazing = rippleNormal.dot(view).max(0).oneMinus().pow(5)
  const throughWater = clarity
    .pow(0.6)
    .mul(waterDepth.mul(-0.12).exp())
    .mul(0.95)
    .mul(farMix.mul(0.95).oneMinus())
    .mul(grazing.mul(0.14).oneMinus())
  material.opacityNode = mix(
    throughWater.oneMinus(),
    float(1),
    foamMask.max(shine.mul(lit).mul(0.2).clamp())
  )

  // A separate opaque bottom gives the surface real spatial separation and
  // prevents the sky/background from showing through otherwise empty water.
  // Its stationary stones are independent of the moving caustic pattern.
  const bedGeometry = new THREE.PlaneGeometry(size.x, size.z)
    .rotateX(-Math.PI / 2)
    .translate(center.x, contactInfo.waterLevel, center.z)
  const bedUV = vec2(
    worldUV.x.mul(0.92).sub(worldUV.y.mul(0.39)),
    worldUV.x.mul(0.39).add(worldUV.y.mul(0.92))
  ).mul(0.82)
  const bed = texture(bedPattern, bedUV.add(vec2(0.28, 0.63))).toVar()
  const bedNormal = vec3(bed.r.sub(0.5), 0.8, bed.g.sub(0.5)).normalize()
  const bedLight = bedNormal.dot(sunDirection).mul(0.8).add(0.55)
  const bedColor = mix(
    color("#275953"),
    color("#8faaa0"),
    bed.b.mul(0.8).add(bed.a.mul(0.2)).smoothstep(0.15, 0.75)
  ).mul(bedLight)
  const bedMaterial = new THREE.MeshBasicNodeMaterial({
    name: "Waterfront | submerged stone bed",
  })
  bedMaterial.lights = false
  bedMaterial.positionNode = positionGeometry.add(
    vec3(0, waterDepth.max(0.2).negate(), 0)
  )
  bedMaterial.colorNode = bedColor.mul(mix(vec3(0.45, 0.65, 0.7), vec3(1), lit))
  const seabed = new THREE.Mesh(bedGeometry, bedMaterial)
  seabed.name = "Waterfront | submerged stone bed"
  seabed.receiveShadow = true
  // GPU depth is adjustable; this is a single quad, cheap to always submit.
  seabed.frustumCulled = false
  return {
    material,
    geometry,
    seabed,
    pattern,
    phase,
    scale,
    caustics,
    glints,
    ripples,
    sunStrength,
    distantBlue,
    blueDistance,
    foam,
    foamWidth,
    waveHeight,
    waterDepth,
    clarity,
    boatContactFromWorld,
    dispose: () => visibility.dispose(),
  }
}
