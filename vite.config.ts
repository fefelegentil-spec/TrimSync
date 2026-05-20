import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Entrée React séparée pour ne pas écraser index.html (landing page vanilla)
  build: {
    rollupOptions: {
      input: 'demo.html',
    },
  },
})
