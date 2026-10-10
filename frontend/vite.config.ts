import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api/v1': { target: process.env.STACKER_URL ?? 'http://localhost:8081', changeOrigin: true },
      '/query': { target: process.env.BACKEND_URL ?? 'http://localhost:8080', changeOrigin: true },
      '/events': { target: process.env.BACKEND_URL ?? 'http://localhost:8080', changeOrigin: true },
    },
  },
  test: {
    reporters: ['junit', 'html', 'default'],
    outputFile: {
      junit: 'reports/unit/junit.xml',
      html: 'reports/unit/index.html',
    },
  },
})
