import { defineConfig } from 'vite';

// Directory pages (playground/index.html) are served at "/playground/"; send the bare path there too.
const directoryPages = ['/playground'];
function directoryRedirect(req, res, next) {
  const [path, search = ''] = req.url.split('?');
  if (!directoryPages.includes(path)) return next();
  res.statusCode = 302; res.setHeader('Location', `${path}/${search ? `?${search}` : ''}`); res.end();
}

export default defineConfig({
  plugins: [{ name: 'directory-redirect', configureServer: server => { server.middlewares.use(directoryRedirect); }, configurePreviewServer: server => { server.middlewares.use(directoryRedirect); } }],
  build: {
    rollupOptions: {
      input: { main: 'index.html', spaceship: 'spaceship.html', simulator: 'simulator.html', propulsor: 'propulsor-studio.html', webgpu: 'webgpu-preview.html', chubee: 'chubee-studio.html', playground: 'playground/index.html' },
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
