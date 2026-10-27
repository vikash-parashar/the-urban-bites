import { useEffect, useState } from 'react'

// "Install as app": Chrome/Edge on Android fire beforeinstallprompt, which we keep so a button can
// show the install sheet. iPhone Safari has no prompt, so we show the Share → Add to Home Screen steps.
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let saved: BIP | null = null
const subs = new Set<() => void>()
const tell = () => subs.forEach((f) => f())

export function setupInstall() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); saved = e as BIP; tell() })
  window.addEventListener('appinstalled', () => { saved = null; tell() })
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  }
}

// useManifest points the page at the staff manifest on #staff, so installing from there gives an
// "Orders" app that opens on the staff screen.
export function useManifest(staff: boolean) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (link) link.href = staff ? 'manifest-staff.webmanifest' : 'manifest.webmanifest'
    // iPhone uses this name under the home-screen icon.
    let t = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    if (!t) { t = document.createElement('meta'); t.name = 'apple-mobile-web-app-title'; document.head.appendChild(t) }
    t.content = staff ? 'UB Orders' : 'Urban Bites'
  }, [staff])
}

/** inApp: running inside The Urban Bites Android/iPhone app (it adds UrbanBitesApp to the user agent). */
export const inApp = () => /UrbanBitesApp\//.test(navigator.userAgent)
export const isStandalone = () =>
  inApp() || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  const installed = isStandalone()
  return {
    installed,
    canPrompt: !!saved && !installed,
    ios: isIOS() && !installed,
    async install() {
      if (!saved) return false
      await saved.prompt()
      const r = await saved.userChoice.catch(() => ({ outcome: 'dismissed' }))
      saved = null; tell()
      return r.outcome === 'accepted'
    },
  }
}
