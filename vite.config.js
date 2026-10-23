import { defineConfig } from 'vite';

// `--mode house` builds for zudmatic.com/house (assets under /house/).
export default defineConfig(({ mode }) => ({
  base: mode === 'house' ? '/house/' : '/',
  build: {
    outDir: mode === 'house' ? 'dist-house' : 'dist',
    rollupOptions: {
      input: { main: 'index.html', spaceship: 'spaceship.html', simulator: 'simulator.html' },
      output: { manualChunks: { three: ['three'] } },
    },
  },
}));
