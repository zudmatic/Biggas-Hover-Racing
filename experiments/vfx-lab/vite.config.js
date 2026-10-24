import {defineConfig} from 'vite';
export default defineConfig({resolve:{dedupe:['three']},publicDir:'../../public',server:{host:'127.0.0.1',port:43181,strictPort:true}});
