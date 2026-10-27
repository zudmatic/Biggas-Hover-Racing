import {fileURLToPath, URL} from 'node:url';
import {defineConfig} from 'vite';
export default defineConfig({resolve:{dedupe:['three'],alias:{'@':fileURLToPath(new URL('../../src',import.meta.url))}},publicDir:'../../public',server:{host:'127.0.0.1',port:43181,strictPort:true}});
