import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import {MeshoptDecoder, MeshoptEncoder} from 'meshoptimizer';

/** NodeIO that reads/writes every extension the game supports (Draco, meshopt, KTX2, quantization…). */
export async function createIO(): Promise<NodeIO> {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
}
