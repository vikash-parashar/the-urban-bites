import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import brand from './brand.json'

// Fills the business name into index.html and writes manifest.webmanifest, both from brand.json,
// so renaming the business is a one-file change.
function brandPlugin(): Plugin {
  const manifest = () => JSON.stringify({
    name: brand.name, short_name: brand.name, start_url: './', display: 'standalone',
    background_color: '#0a0a10', theme_color: '#0a0a10',
    icons: [
      { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }, null, 2)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return {
    name: 'brand',
    transformIndexHtml: (html) => html
      .replaceAll('%BRAND_NAME%', esc(brand.name)).replaceAll('%BRAND_DESCRIPTION%', esc(brand.description))
      .replaceAll('%BRAND_SHARE%', esc(brand.share)).replaceAll('%BRAND_DOMAIN%', esc(brand.domain)),
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => { res.setHeader('Content-Type', 'application/manifest+json'); res.end(manifest()) })
    },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() }) },
  }
}

// Relative base so the build can be served from S3/CloudFront at any path.
export default defineConfig({
  base: './',
  plugins: [react(), brandPlugin()],
  server: { fs: { allow: ['..'] } },
})
