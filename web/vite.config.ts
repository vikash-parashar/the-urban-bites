import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build can be served from S3/CloudFront at any path.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
})
