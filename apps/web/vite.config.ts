import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/rooms': { target: 'http://127.0.0.1:1234', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:1234', changeOrigin: true },
      '/yjs': { target: 'ws://127.0.0.1:1234', ws: true, changeOrigin: true },
    },
  },
  optimizeDeps: { exclude: ['@rcic/shared'] },
})
