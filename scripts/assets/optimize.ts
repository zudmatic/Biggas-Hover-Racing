// Compresses game GLBs in place: Draco or lossless meshopt geometry, KTX2 (UASTC) textures.
//
//   node scripts/assets/optimize.ts [options] <file.glb | folder>…
//
//   --geometry draco|meshopt|none   default: draco
//   --textures ktx2|none            default: ktx2 (ETC1S for colour/data, UASTC for normal maps)
//   --uastc                         UASTC for every texture (higher quality, larger files)
//   --min-texture <px>              keep textures smaller than this as-is (default 64)
//   --dry                           report sizes without writing
//   --force                         also process public/models/desert-valley (hand-tuned, skipped by default)
//
// Why Draco/float meshopt and never KHR_mesh_quantization: several systems bake
// geometry at load (applyMatrix4 + mergeGeometries for tracks and ships) or read
// raw positions (collision, boost pads). Draco decodes to float32 and lossless
// meshopt keeps float32, so the runtime code works unchanged.
import {readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {type Document, type Texture, PropertyType} from '@gltf-transform/core';
import {EXTMeshoptCompression, KHRDracoMeshCompression, KHRTextureBasisu} from '@gltf-transform/extensions';
import {dedup, draco, reorder} from '@gltf-transform/functions';
import {MeshoptEncoder} from 'meshoptimizer';
import sharp from 'sharp';
import {encodeToKTX2} from 'ktx2-encoder';
import {createIO} from './io.ts';

type GeometryMode = 'draco' | 'meshopt' | 'none';
type TextureMode = 'ktx2' | 'none';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args.splice(index, 2)[1] : fallback;
};
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  if (index >= 0) args.splice(index, 1);
  return index >= 0;
};
const geometry = option('geometry', 'draco') as GeometryMode;
const textures = option('textures', 'ktx2') as TextureMode;
const minTexture = Number(option('min-texture', '64'));
const dry = flag('dry');
const uastcEverywhere = flag('uastc');
const force = flag('force');
const files = args
  .flatMap((path) => (statSync(path).isDirectory() ? walk(path) : [path]))
  .filter((file) => force || !file.includes('models/desert-valley'));
if (!files.length) {
  console.error('Usage: node scripts/assets/optimize.ts [--geometry draco|meshopt|none] [--textures ktx2|none] <file.glb|folder>…');
  process.exit(1);
}

const io = await createIO();
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MB`;
let before = 0;
let after = 0;

for (const file of files) {
  const document = await io.read(file);
  const used = new Set(
    document
      .getRoot()
      .listExtensionsUsed()
      .map((extension) => extension.extensionName),
  );
  // Only exact duplicates: merging materials/meshes would break code that finds them by name.
  await document.transform(dedup({propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE]}));
  if (geometry === 'draco' && !used.has('KHR_draco_mesh_compression') && !used.has('EXT_meshopt_compression')) {
    // Sequential encoding keeps vertex order (morph targets, skinning and
    // per-vertex lookups in code rely on it). 16-bit positions ≈ 1/65536 of the bounds.
    await document.transform(
      draco({method: 'sequential', quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14, quantizeColor: 10, quantizeGeneric: 14}),
    );
  } else if (geometry === 'meshopt' && !used.has('KHR_draco_mesh_compression') && !used.has('EXT_meshopt_compression')) {
    await document.transform(reorder({encoder: MeshoptEncoder}));
    document
      .createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({method: EXTMeshoptCompression.EncoderMethod.QUANTIZE});
  }
  if (textures === 'ktx2') await compressTextures(document);
  const original = statSync(file).size;
  const output = await io.writeBinary(document);
  before += original;
  after += output.byteLength;
  console.log(`${file}: ${mb(original)} → ${mb(output.byteLength)}${dry ? ' (dry run)' : ''}`);
  if (!dry) await io.write(file, document);
}
console.log(`Total: ${mb(before)} → ${mb(after)}`);

/**
 * ETC1S (small downloads, transcodes to BC/ASTC/ETC on the GPU) for colour and
 * data maps; UASTC + zstd for normal maps, where ETC1S artefacts show.
 * sRGB transfer for colour slots.
 */
async function compressTextures(document: Document): Promise<void> {
  let converted = false;
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    const size = texture.getSize();
    if (!image || !size || texture.getMimeType() === 'image/ktx2') continue;
    if (Math.max(...size) < minTexture) continue;
    const slots = textureSlots(document, texture);
    const color = slots.some((slot) => /baseColor|emissive|diffuse|specularColor|sheenColor/.test(slot));
    const normal = slots.some((slot) => /normal/.test(slot));
    const uastc = uastcEverywhere || normal;
    const encoded = await encodeToKTX2(await blockAligned(image, size), {
      isUASTC: uastc,
      ...(uastc
        ? {uastcLDRQualityLevel: 2, enableRDO: true, rdoQualityLevel: normal ? 0.5 : 1, needSupercompression: true}
        : {qualityLevel: 255, compressionLevel: 4}),
      isNormalMap: normal,
      isPerceptual: color,
      isSetKTX2SRGBTransferFunc: color,
      generateMipmap: true,
      imageDecoder: decode,
    });
    texture.setImage(encoded).setMimeType('image/ktx2');
    converted = true;
  }
  if (converted) document.createExtension(KHRTextureBasisu).setRequired(true);
}

/** Block-compressed GPU formats need dimensions that are multiples of 4. */
async function blockAligned(image: Uint8Array, [width, height]: [number, number]): Promise<Uint8Array> {
  const w = Math.ceil(width / 4) * 4;
  const h = Math.ceil(height / 4) * 4;
  if (w === width && h === height) return image;
  return new Uint8Array(await sharp(image).resize(w, h, {fit: 'fill', kernel: 'lanczos3'}).png().toBuffer());
}

async function decode(buffer: Uint8Array): Promise<{width: number; height: number; data: Uint8Array}> {
  const {data, info} = await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  return {data: new Uint8Array(data), width: info.width, height: info.height};
}

function textureSlots(document: Document, texture: Texture): string[] {
  const root = document.getRoot();
  return texture
    .getGraph()
    .listParentEdges(texture)
    .filter((edge) => edge.getParent() !== root)
    .map((edge) => edge.getName());
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.glb') ? [path] : [];
  });
}
