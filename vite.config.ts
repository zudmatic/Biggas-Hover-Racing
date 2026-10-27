import {fileURLToPath, URL} from 'node:url';
import {defineConfig, type Connect} from 'vite';

// Directory pages (playground/index.html) are served at "/playground/"; send the bare path there too.
const directoryPages = ['/playground'];
const directoryRedirect: Connect.NextHandleFunction = (req, res, next) => {
  const [path, search = ''] = (req.url ?? '').split('?');
  if (!directoryPages.includes(path)) return next();
  res.statusCode = 302;
  res.setHeader('Location', `${path}/${search ? `?${search}` : ''}`);
  res.end();
};

export default defineConfig({
  resolve: {alias: {'@': fileURLToPath(new URL('./src', import.meta.url))}},
  optimizeDeps: {include: ['three/addons/loaders/DRACOLoader.js', 'three/addons/loaders/KTX2Loader.js', 'three/addons/libs/meshopt_decoder.module.js']},
  plugins: [{
    name: 'directory-redirect',
    configureServer: server => { server.middlewares.use(directoryRedirect); },
    configurePreviewServer: server => { server.middlewares.use(directoryRedirect); },
  }],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        spaceship: 'spaceship.html',
        simulator: 'simulator.html',
        propulsor: 'propulsor-studio.html',
        webgpu: 'webgpu-preview.html',
        chubee: 'chubee-studio.html',
        playground: 'playground/index.html',
      },
      output: {manualChunks: {three: ['three']}},
    },
  },
});
