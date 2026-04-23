import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1'
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ['tesseract.js'],
  },
})
