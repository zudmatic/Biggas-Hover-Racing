// Reports what makes each GLB heavy. Usage: node scripts/assets/inspect.ts [files…]
import {readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {createIO} from './io.ts';

const roots = process.argv.slice(2);
const files = roots.length ? roots : walk('public/models');
const io = await createIO();
const mb = (bytes: number) => (bytes / 1048576).toFixed(2).padStart(6) + ' MB';

for (const file of files) {
  const document = await io.read(file);
  const root = document.getRoot();
  let vertices = 0;
  let primitives = 0;
  for (const mesh of root.listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      primitives++;
      vertices += primitive.getAttribute('POSITION')?.getCount() ?? 0;
    }
  let textureBytes = 0;
  const textures = root.listTextures().map((texture) => {
    const size = texture.getSize();
    textureBytes += texture.getImage()?.byteLength ?? 0;
    return `${texture.getMimeType().replace('image/', '')}${size ? ` ${size[0]}x${size[1]}` : ''}`;
  });
  const extensions = root
    .listExtensionsUsed()
    .map((extension) => extension.extensionName.replace(/^(KHR|EXT)_/, ''))
    .join(',');
  console.log(
    `${mb(statSync(file).size)}  ${relative('public', file)}\n          ${primitives} prims, ${vertices.toLocaleString()} verts · ${textures.length} textures ${mb(textureBytes)} [${[...new Set(textures)].join(' ')}] · ext: ${extensions || 'none'}`,
  );
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.glb') ? [path] : [];
  });
}
