import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import process from 'node:process'
const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [vue(), vuetify({ autoImport: true })],

  // Vite options tailored to Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || '127.0.0.1',
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
  // lucide-vue-next se pre-bundlean en el arranque. Si Vite lo descubre a
  // mitad de sesion, re-optimiza, invalida el grafo de modulos y los imports
  // dinamicos fallan con "Failed to fetch dynamically imported module".
  optimizeDeps: {
    include: ['lucide-vue-next'],
  },
}))
