import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: 'index.html', spaceship: 'spaceship.html', simulator: 'simulator.html' },
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
