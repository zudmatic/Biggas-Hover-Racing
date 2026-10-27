import { defineConfig } from 'vite';

// Directory pages (playground/index.html) are served at "/playground/"; the bare path and the retired
// debug pages go there too, keeping their query (the browser keeps the hash). Mirrors vercel.json.
const redirects = { '/playground': '/playground/', '/webgpu-preview.html': '/playground/', '/propulsor-studio.html': '/playground/' };
function directoryRedirect(req, res, next) {
  const [path, search = ''] = req.url.split('?');
  if (!redirects[path]) return next();
  res.statusCode = 302; res.setHeader('Location', `${redirects[path]}${search ? `?${search}` : ''}`); res.end();
}

export default defineConfig({
  plugins: [{ name: 'directory-redirect', configureServer: server => { server.middlewares.use(directoryRedirect); }, configurePreviewServer: server => { server.middlewares.use(directoryRedirect); } }],
  build: {
    rollupOptions: {
      input: { main: 'index.html', spaceship: 'spaceship.html', simulator: 'simulator.html', chubee: 'chubee-studio.html', playground: 'playground/index.html' },
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
