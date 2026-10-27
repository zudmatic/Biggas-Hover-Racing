import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps:{include:['three/addons/loaders/DRACOLoader.js','three/addons/libs/meshopt_decoder.module.js']},
  build: {
    rollupOptions: {
      input: { main: 'index.html', spaceship: 'spaceship.html', simulator: 'simulator.html', propulsor: 'propulsor-studio.html', webgpu: 'webgpu-preview.html', chubee: 'chubee-studio.html' },
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
