/** Runtime factories used by glTF-Transform; the codec instances remain opaque here. */
declare module 'draco3dgltf' {
  interface DracoFactories {
    createDecoderModule(): Promise<unknown>;
    createEncoderModule(): Promise<unknown>;
  }
  const draco: DracoFactories;
  export default draco;
}
