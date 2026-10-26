import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  publicDir: false,
  build: {
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'assets/app.js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/app[extname]' } },
  },
})
