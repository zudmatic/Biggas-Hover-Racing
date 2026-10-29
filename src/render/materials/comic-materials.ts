import {Color, Vector2, type Material, type Mesh, type Object3D} from 'three';
import {MeshLambertNodeMaterial, type Node, type NodeBuilder, type UniformNode} from 'three/webgpu';
import {
  color as tslColor,
  dFdx,
  dFdy,
  float,
  floor,
  fract,
  fwidth,
  materialColor,
  materialReference,
  mix,
  normalGeometry,
  positionGeometry,
  screenCoordinate,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type {Disposable} from '@/core/disposable';
import {luma709} from '../shaders/color';
import {dotCell, lineCell, rotateToGrid} from '../shaders/halftone';
import {hash3, valueNoise3} from '../shaders/noise';
import {asSurface, isMesh, type MeshMaterial, type SurfaceMaterial} from '../scene-utils';
import {RETRO_DEFAULTS as defaults} from './retro-style';

/** Live controls of the TSL comic print, shared by every ComicMaterial bound to them. */
export interface ComicStyle {
  /** Ink strength (DialKit "Trama"). */
  readonly strength: UniformNode<number>;
  /** Shadow hatching on/off. */
  readonly hatch: UniformNode<number>;
  /** Highlight dots on/off. */
  readonly dots: UniformNode<number>;
  /** 0: ink attached to the surface (triplanar), 1: screen-space ink. */
  readonly screenSpace: UniformNode<number>;
  readonly pixelRatio: UniformNode<number>;
  /** Drawing buffer size in device pixels. */
  readonly resolution: UniformNode<Vector2>;
  /** Paper-white luminance the print's lightness is measured against. */
  readonly white: UniformNode<number>;
}

export function createComicStyle(): ComicStyle {
  return {
    strength: uniform(defaults.strength),
    hatch: uniform(1),
    dots: uniform(1),
    screenSpace: uniform(0),
    pixelRatio: uniform(1),
    resolution: uniform(new Vector2(1, 1)),
    white: uniform(1),
  };
}

/** Rotated grid of `pitch` px cells at `density` cells per unit. */
function grid(point: Node, pitch: Node, angle: number, density: Node | number): Node {
  return rotateToGrid(point, angle).mul(density).div(pitch);
}

/**
 * One ink layer (dots or lines): triplanar on the rest-pose surface, or in
 * screen pixels, blended by `style.screenSpace`.
 */
function pattern(coverage: Node, pitch: Node, angle: number, dots: boolean, style: ComicStyle): Node {
  const cell = dots ? dotCell : lineCell;
  const weights = normalGeometry.normalize().abs().pow(4);
  const w = weights.div(weights.dot(vec3(1)).max(0.0001));
  const planes: [Node, Node][] = [
    [positionGeometry.yz, w.x],
    [positionGeometry.zx, w.y],
    [positionGeometry.xy, w.z],
  ];
  let object: Node = float(0);
  for (const [plane, weight] of planes) {
    const q = grid(plane, pitch, angle, 90);
    const footprint = dots ? dFdx(q).length().max(dFdy(q).length()) : fwidth(q.y);
    object = object.add(cell(q, coverage, footprint.max(0.03), float(1).sub(smoothstep(0.42, 0.92, footprint))).mul(weight));
  }
  // WebGPU's framebuffer origin is top-left; flip Y to match GLSL screen ink.
  const pixel = vec2(screenCoordinate.x, style.resolution.y.sub(screenCoordinate.y));
  const perPixel = float(1).div(pitch.mul(style.pixelRatio));
  const screen = cell(
    grid(pixel, pitch, angle, float(1).div(style.pixelRatio)),
    coverage,
    perPixel.max(0.03),
    float(1).sub(smoothstep(0.42, 0.92, perPixel)),
  );
  return mix(object, screen, style.screenSpace);
}

/**
 * The comic treatment of surface-halftone.ts in TSL: lightness bands, a
 * posterized base, cool/warm tints, highlight dots and shadow hatching.
 */
function surfacePrint(lit: Node, detail: Node, ink: Node, style: ComicStyle): Node {
  const p = defaults;
  const L = luma709(lit).div(style.white.max(0.001)).max(0).sqrt();
  const shadow = float(1).sub(smoothstep(p.bandShadow - p.bandSoft, p.bandShadow + p.bandSoft, L));
  const light = smoothstep(p.bandLight - p.bandSoft, p.bandLight + p.bandSoft, L);
  // Quantize the light, not the map's own luminance detail.
  const s = L.div(detail.max(0.0001).sqrt()).max(0.001).mul(p.posterSteps);
  const level = floor(s)
    .add(0.5)
    .add(smoothstep(1 - p.posterSoft, 1, fract(s)));
  let c: Node = lit.mul(mix(float(1), level.mul(level).div(s.mul(s)).min(4), float(p.posterAmount)));
  c = c.mul(mix(vec3(1), tslColor(new Color(p.shadowTint)), shadow.mul(p.tintAmount)));
  c = c.mul(mix(vec3(1), tslColor(new Color(p.lightTint)), light.mul(p.tintAmount)));
  const grain = ink.mul(p.grain).add(1);
  const hiCoverage = light
    .mul(p.hiCoverage)
    .mul(
      L.sub(p.bandLight)
        .div(Math.max(1 - p.bandLight, 0.05))
        .clamp()
        .mul(0.65)
        .add(0.35),
    )
    .mul(grain);
  const hi = pattern(hiCoverage, float(p.hiPitch), p.hiAngle, true, style);
  c = c.add(tslColor(new Color(p.hiInk).multiplyScalar(p.hiGain)).mul(hi).mul(p.hiOpacity).mul(style.strength).mul(style.dots)).max(0);
  const coverage = shadow
    .mul(p.hatchCoverage)
    .mul(
      float(1)
        .sub(L.div(Math.max(p.bandShadow, 0.05)).clamp())
        .mul(0.7)
        .add(0.3),
    )
    .mul(grain);
  const deep = shadow.mul(float(1).sub(smoothstep(0.3, 0.6, L.div(Math.max(p.bandShadow, 0.05)))));
  const lines = pattern(coverage, float(p.hatchPitch), p.hatchAngle, false, style).add(
    pattern(coverage.mul(deep), float(p.hatchPitch), p.hatchAngle + 90, false, style).mul(p.hatchSecond),
  );
  c = c
    .mul(vec3(1).add(tslColor(new Color(p.hatchTint)).sub(1).mul(lines).mul(p.hatchOpacity).mul(style.strength).mul(style.hatch)))
    .max(0);
  return c;
}

/**
 * Run the print after Lambert illumination and before fog/tonemapping, as in
 * retro-material.ts. Skinning and instancing remain Three's native node paths.
 */
export class ComicMaterial extends MeshLambertNodeMaterial {
  comicStyle: ComicStyle;
  /** Map luminance over the flat albedo's, so the print quantizes light and keeps texture detail. */
  textureDetail: Node;
  /** Per-fragment ink noise, ±0.5. */
  inkNoise: Node;

  constructor(style: ComicStyle, textureDetail: Node, inkNoise: Node) {
    super();
    this.comicStyle = style;
    this.textureDetail = textureDetail;
    this.inkNoise = inkNoise;
  }

  override setupLighting(builder: NodeBuilder): Node {
    return surfacePrint(super.setupLighting(builder).toVar(), this.textureDetail, this.inkNoise, this.comicStyle);
  }
}

/** Source material properties a comic copy takes over (the color objects are shared, not copied). */
const COPIED_PROPERTIES = [
  'lightsNode',
  'map',
  'alphaMap',
  'normalMap',
  'bumpMap',
  'bumpScale',
  'normalScale',
  'emissiveMap',
  'emissiveIntensity',
  'aoMap',
  'aoMapIntensity',
  'side',
  'transparent',
  'opacity',
  'alphaTest',
  'depthWrite',
  'depthTest',
  'vertexColors',
  'flatShading',
  'wireframe',
  'polygonOffset',
  'polygonOffsetFactor',
  'polygonOffsetUnits',
] as const;

interface Binding {
  mesh: Mesh;
  source: MeshMaterial;
  printed: MeshMaterial;
}

/**
 * Binds comic copies of a scene's lit materials. Surfaces are bound once per
 * mesh (`refresh()` picks up meshes added later); `setEnabled` swaps between
 * the authored and the printed materials without rebuilding anything.
 */
export class ComicMaterials implements Disposable {
  private readonly cache = new Map<SurfaceMaterial, ComicMaterial>();
  private readonly bindings: Binding[] = [];
  private readonly known = new WeakSet<Mesh>();
  private readonly textureDetail: Node;
  private readonly inkNoise: Node;
  private readonly colorNode: Node;

  constructor(
    private readonly root: Object3D,
    private readonly style: ComicStyle,
  ) {
    // Share the node graph across surfaces. Per-material uniform nodes create a
    // different program key for every cloned hangar part, even for identical shaders.
    const albedo = materialColor.rgb.max(vec3(0.012, 0.01, 0.017)).pow(0.82);
    this.textureDetail = luma709(albedo).div(
      luma709(
        materialReference('color', 'color')
          .max(vec3(0.012, 0.01, 0.017))
          .pow(0.82),
      ).max(0.0001),
    );
    this.inkNoise = valueNoise3(positionGeometry.mul(34)).sub(0.5);
    const face = dFdx(positionGeometry).cross(dFdy(positionGeometry)).normalize().mul(48).add(0.5).floor();
    const variation = hash3(face)
      .sub(0.5)
      .mul(0.1)
      .add(this.inkNoise.mul(0.08))
      .add(
        valueNoise3(positionGeometry.mul(8))
          .sub(0.5)
          .mul(0.08 * 0.45),
      )
      .add(1);
    this.colorNode = vec4(albedo.mul(variation), materialColor.a);
    this.refresh();
  }

  /** Binds meshes added since the last call. */
  refresh(): void {
    this.root.traverse((object) => {
      if (!isMesh(object) || this.known.has(object)) return;
      this.known.add(object);
      const source = object.material;
      const printed = Array.isArray(source) ? source.map((material) => this.convert(material)) : this.convert(source);
      this.bindings.push({mesh: object, source, printed});
    });
  }

  setEnabled(on: boolean): void {
    for (const binding of this.bindings) binding.mesh.material = on ? binding.printed : binding.source;
  }

  /** Follows live paint-map replacements and animated emissive intensity. */
  sync(): void {
    for (const [source, material] of this.cache) {
      if (material.map !== (source.map ?? null)) {
        material.map = source.map ?? null;
        material.needsUpdate = true;
      }
      material.emissiveIntensity = source.emissiveIntensity ?? 1;
    }
  }

  dispose(): void {
    for (const binding of this.bindings) binding.mesh.material = binding.source;
    for (const material of this.cache.values()) material.dispose();
  }

  private convert(material: Material): Material {
    const source = asSurface(material);
    if (
      source.isNodeMaterial ||
      !source.color ||
      source.isShaderMaterial ||
      source.isMeshBasicMaterial ||
      source.isShadowMaterial ||
      source.userData.characterEyeSurface
    ) {
      return source;
    }
    const cached = this.cache.get(source);
    if (cached) return cached;
    const printed = new ComicMaterial(this.style, this.textureDetail, this.inkNoise);
    const from = source as unknown as Record<string, unknown>;
    const to = printed as unknown as Record<string, unknown>;
    for (const key of COPIED_PROPERTIES) if (from[key] !== undefined) to[key] = from[key];
    printed.color = source.color;
    printed.emissive = source.emissive ?? new Color();
    printed.name = `TSL · ${source.name}`;
    printed.colorNode = this.colorNode;
    this.cache.set(source, printed);
    return printed;
  }
}
