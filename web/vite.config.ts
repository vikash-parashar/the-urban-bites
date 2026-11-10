import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import brand from './brand.json'

// Fills the business name into index.html and writes manifest.webmanifest, both from brand.json,
// so renaming the business is a one-file change.
function brandPlugin(): Plugin {
  // Two installable apps: the customer site, and "Orders" for the cart staff, which opens straight
  // on the staff screen (#staff) so Manjeet never needs to remember the address.
  const manifest = (staff = false) => JSON.stringify({
    id: staff ? './?app=staff' : './',
    name: staff ? `${brand.name} Orders` : brand.name, short_name: staff ? 'UB Orders' : brand.name,
    start_url: staff ? './?app=staff#staff' : './', scope: './', display: 'standalone', orientation: 'any',
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
      .replaceAll('%BRAND_SEO_TITLE%', esc(brand.seo_title)).replaceAll('%BRAND_NAME%', esc(brand.name)).replaceAll('%BRAND_DESCRIPTION%', esc(brand.description))
      .replaceAll('%BRAND_SHARE%', esc(brand.share)).replaceAll('%BRAND_DOMAIN%', esc(brand.domain)),
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => { res.setHeader('Content-Type', 'application/manifest+json'); res.end(manifest()) })
      server.middlewares.use('/manifest-staff.webmanifest', (_req, res) => { res.setHeader('Content-Type', 'application/manifest+json'); res.end(manifest(true)) })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() })
      this.emitFile({ type: 'asset', fileName: 'manifest-staff.webmanifest', source: manifest(true) })
    },
  }
}

// Google AdSense: when VITE_ADSENSE_CLIENT (ca-pub-…) is set at build time, write /ads.txt and the
// google-adsense-account tag Google checks during site review. Ads still stay off until the admin turns
// them on in Shop settings.
function adsPlugin(): Plugin {
  const client = (process.env.VITE_ADSENSE_CLIENT || '').trim()
  const ok = /^ca-pub-\d{10,20}$/.test(client)
  if (client && !ok) console.warn(`VITE_ADSENSE_CLIENT "${client}" doesn't look like ca-pub-1234567890123456; ads are left out of this build.`)
  const pub = client.replace(/^ca-/, '')
  return {
    name: 'ads',
    transformIndexHtml: (html) => ok ? html.replace('</head>', `    <meta name="google-adsense-account" content="${client}" />\n  </head>`) : html,
    generateBundle() {
      if (ok) this.emitFile({ type: 'asset', fileName: 'ads.txt', source: `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` })
    },
  }
}

// Relative base so the build can be served from S3/CloudFront at any path.
export default defineConfig({
  base: './',
  // Older phones: keep the JavaScript readable by Chrome/WebView 87+ (Android 7 phones that got updates).
  build: { target: ['es2020', 'chrome87', 'safari14'] },
  plugins: [react(), brandPlugin(), adsPlugin()],
  server: { fs: { allow: ['..'] } },
})
