import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { ease, lift, spring } from './motion'
import { inApp } from './install'
import type { Shop } from './shop'

// Ad slots on the customer website, switched on and off by the admin (Shop settings → Ads).
// Two kinds:
//  - Google AdSense units: website only. The publisher ID (ca-pub-…) and the ad unit's slot ID are
//    build settings (VITE_ADSENSE_CLIENT, VITE_ADSENSE_SLOT) because ads.txt and the
//    google-adsense-account tag are baked into the build from the same ID. Google doesn't allow
//    AdSense inside an app's WebView, so the app never shows them.
//  - A local sponsor card the admin sells directly (a shop, a garage, a coaching centre): website and app.
// Slots sit between sections of the home page only. Never in the order drawer, checkout, tracking,
// or the staff/owner/rider screens (those are a different React tree, see main.tsx).

const CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() || ''
const SLOT = (import.meta.env.VITE_ADSENSE_SLOT as string | undefined)?.trim() || ''
const adsenseReady = /^ca-pub-\d{10,20}$/.test(CLIENT)

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

let scriptAdded = false
function loadAdSense() {
  if (scriptAdded || !adsenseReady) return
  scriptAdded = true
  const s = document.createElement('script')
  s.async = true
  s.crossOrigin = 'anonymous'
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`
  document.head.appendChild(s)
}

/** useAdSense loads Google's ad script once the admin has turned ads on (and never inside the app). */
export function useAdSense(shop: Shop) {
  const on = shop.ads_enabled && adsenseReady && !inApp()
  useEffect(() => { if (on) loadAdSense() }, [on])
  return on
}

const appear = {
  initial: { opacity: 0, y: 28, scale: 0.98 },
  whileInView: { opacity: 1, y: 0, scale: 1 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.6, ease },
} as const

/** One AdSense display unit. Hidden by CSS when Google has no ad to fill it. */
export function AdUnit({ shop, label = 'Advertisement' }: { shop: Shop; label?: string }) {
  const on = useAdSense(shop)
  const ins = useRef<HTMLModElement>(null)
  useEffect(() => {
    const el = ins.current
    // One push per unit; React StrictMode runs effects twice in development.
    if (!on || !SLOT || !el || el.dataset.pushed) return
    el.dataset.pushed = '1'
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch { /* blocked by an ad blocker */ }
  }, [on])
  if (!on || !SLOT) return null
  return (
    <motion.aside className="ad-slot" aria-label={label} {...appear}>
      <span className="ad-label">{label}</span>
      <ins ref={ins} className="adsbygoogle" style={{ display: 'block' }}
        data-ad-client={CLIENT} data-ad-slot={SLOT} data-ad-format="auto" data-full-width-responsive="true" />
    </motion.aside>
  )
}

/** The local sponsor card. Shows on the website and in the app when the admin has filled it in. */
export function SponsorCard({ shop }: { shop: Shop }) {
  if (!shop.sponsor_enabled || !shop.sponsor_name) return null
  const url = shop.sponsor_url
  const call = url.startsWith('tel:')
  const wa = /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(url)
  const cta = call ? 'Call them' : wa ? 'WhatsApp them' : 'Visit'
  return (
    <motion.aside className="ad-slot sponsor" aria-label={`Sponsored: ${shop.sponsor_name}`} {...appear}>
      <span className="ad-label">Sponsored</span>
      <motion.div className="sponsor-card" {...lift}>
        <div className="sponsor-copy">
          <strong>{shop.sponsor_name}</strong>
          {shop.sponsor_text && <p>{shop.sponsor_text}</p>}
        </div>
        {url && (
          <motion.a className="btn btn-ghost btn-sm" href={url} target={call ? undefined : '_blank'} rel="sponsored noopener"
            whileHover={{ y: -2, scale: 1.04 }} whileTap={{ scale: 0.94 }} transition={spring}>
            {cta} →
          </motion.a>
        )}
      </motion.div>
    </motion.aside>
  )
}

/** For the admin screen: is AdSense set up in this build? */
export const adsenseSetup = { ready: adsenseReady, client: CLIENT, slot: SLOT }
