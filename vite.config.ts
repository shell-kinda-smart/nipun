import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    open: false,
    // The API is served by the PHP backend on port 8080. Proxying it keeps
    // the browser on a single origin, so the session cookie is first-party
    // and no CORS configuration is needed in development.
    proxy: {
      '/api': {
        target: process.env.PAYLENS_API_URL || 'http://127.0.0.1:8080',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})