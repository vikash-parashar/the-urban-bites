// Sponsor ads: banners the admin sells to local businesses. Three places: the home page ("home"), the
// customer's tracking page ("tracker") and the owner's orders screen ("staff"). The admin adds them in
// the staff area under Ads; views and taps are counted there so a sponsor can see what they got.
// Optional Google AdSense on the website only (never inside the Android app, which AdSense doesn't allow):
// set VITE_ADSENSE_CLIENT (ca-pub-...) and VITE_ADSENSE_SLOT, and it fills the home slot when no sponsor runs.
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, Phone, Trash2, Pencil, Eye, MousePointerClick } from 'lucide-react'
import { inApp } from './install'
import { staffApi, type Ad, type AdInput } from './staffApi'
import { useGuard } from './StaffExtras'
import { MButton } from './motion'

const API = import.meta.env.VITE_API_URL as string | undefined
const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined
const ADSENSE_SLOT = import.meta.env.VITE_ADSENSE_SLOT as string | undefined
export type AdPlace = 'home' | 'tracker' | 'staff'

export const adImageUrl = (a: Ad) => `${API}/v1/ads/${a.id}/image?v=${encodeURIComponent(a.updated_at)}`

function useLiveAds(place: AdPlace) {
  const [ads, setAds] = useState<Ad[] | null>(null)
  useEffect(() => {
    if (!API) { setAds([]); return }
    let alive = true
    fetch(`${API}/v1/ads?place=${place}`).then((r) => (r.ok ? r.json() : { ads: [] })).then((j) => alive && setAds(j.ads ?? [])).catch(() => alive && setAds([]))
    return () => { alive = false }
  }, [place])
  return ads
}

const clicked = (a: Ad) => { if (API) fetch(`${API}/v1/ads/${a.id}/click`, { method: 'POST', keepalive: true }).catch(() => {}) }

function AdCard({ ad }: { ad: Ad }) {
  const telHref = ad.phone ? `tel:${ad.phone}` : ''
  const href = ad.link_url || telHref
  const label = ad.cta || (ad.link_url ? 'Open' : ad.phone ? 'Call now' : '')
  return (
    <div className="ad-card">
      {ad.has_image && <img className="ad-img" src={adImageUrl(ad)} alt="" loading="lazy" />}
      <div className="ad-copy">
        <h3 className="ad-title">{ad.title}</h3>
        {ad.body && <p className="ad-body">{ad.body}</p>}
        {href && label && (
          <a className="ad-cta" href={href} target={ad.link_url ? '_blank' : undefined} rel="noopener sponsored" onClick={() => clicked(ad)}>
            {ad.link_url ? <ExternalLink size={16} aria-hidden /> : <Phone size={16} aria-hidden />} {label}
          </a>
        )}
      </div>
    </div>
  )
}

function AdSense() {
  const ref = useRef<HTMLModElement>(null)
  useEffect(() => {
    if (!document.querySelector('script[data-ub-adsense]')) {
      const s = document.createElement('script')
      s.async = true; s.crossOrigin = 'anonymous'; s.dataset.ubAdsense = '1'
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT!)}`
      document.head.appendChild(s)
    }
    try { ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ||= []).push({}) } catch { /* blocked by an ad blocker */ }
  }, [])
  return <ins ref={ref} className="adsbygoogle ad-sense" style={{ display: 'block' }} data-ad-client={ADSENSE_CLIENT} data-ad-slot={ADSENSE_SLOT} data-ad-format="auto" data-full-width-responsive="true" />
}

/** AdSlot shows the running sponsor ads for one place, one at a time (they take turns every 8 s). */
export function AdSlot({ place, className = '' }: { place: AdPlace; className?: string }) {
  const ads = useLiveAds(place)
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!ads || ads.length < 2) return
    const t = setInterval(() => setI((n) => (n + 1) % ads.length), 8000)
    return () => clearInterval(t)
  }, [ads])
  const sense = place === 'home' && !!ADSENSE_CLIENT && !!ADSENSE_SLOT && !inApp()
  if (!ads || (ads.length === 0 && !sense)) return null
  const ad = ads.length ? ads[i % ads.length] : null
  return (
    <aside className={`ad-slot ad-${place} ${className}`} aria-label="Sponsored">
      <p className="ad-tag">Sponsored · विज्ञापन</p>
      {ad ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={ad.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
            <AdCard ad={ad} />
          </motion.div>
        </AnimatePresence>
      ) : <AdSense />}
      {ads.length > 1 && (
        <div className="ad-dots" aria-hidden>{ads.map((a, n) => <span key={a.id} className={n === i % ads.length ? 'on' : ''} />)}</div>
      )}
    </aside>
  )
}

// ---- admin: Ads manager ----

const PLACES: [AdPlace, string][] = [['home', 'Home page'], ['tracker', 'Order tracking page'], ['staff', "Owner's orders screen"]]
const emptyAd: AdInput = { title: '', body: '', cta: '', link_url: '', phone: '', place: 'home', active: true, starts_on: '', ends_on: '', sort: 0, image: '' }

/** Shrinks a photo to at most 1000 px wide as JPEG, so it stays well under the 400 KB limit. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url })
    const scale = Math.min(1, 1000 / img.width)
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.82)
  } finally { URL.revokeObjectURL(url) }
}

export function AdsManager({ onSignedOut }: { onSignedOut: () => void }) {
  const { error, guard } = useGuard(onSignedOut)
  const [ads, setAds] = useState<Ad[]>([])
  const [form, setForm] = useState<AdInput>(emptyAd)
  const [editing, setEditing] = useState<Ad | null>(null)
  const [preview, setPreview] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const r = await guard(staffApi.ads())
    if (r) setAds(r.ads)
  }, [guard])
  useEffect(() => { load() }, [load])

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    try { const d = await shrink(f); setForm((x) => ({ ...x, image: d })); setPreview(d) } catch { setMsg("Couldn't read that photo. Try a JPG or PNG.") }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const r = await guard(editing ? staffApi.updateAd(editing.id, form) : staffApi.createAd(form))
    if (r) {
      setMsg(editing ? 'Ad updated.' : 'Ad is live.')
      setForm(emptyAd); setEditing(null); setPreview('')
      load()
    }
  }

  function edit(a: Ad) {
    setEditing(a)
    setForm({ title: a.title, body: a.body, cta: a.cta, link_url: a.link_url, phone: a.phone.replace(/^\+91/, ''), place: a.place, active: a.active, starts_on: a.starts_on ?? '', ends_on: a.ends_on ?? '', sort: a.sort, image: '' })
    setPreview(a.has_image ? adImageUrl(a) : '')
    setMsg('')
    scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function toggle(a: Ad) {
    const r = await guard(staffApi.updateAd(a.id, { title: a.title, body: a.body, cta: a.cta, link_url: a.link_url, phone: a.phone, place: a.place, active: !a.active, starts_on: a.starts_on ?? '', ends_on: a.ends_on ?? '', sort: a.sort, image: '' }))
    if (r) load()
  }

  async function remove(a: Ad) {
    if ((await guard(staffApi.deleteAd(a.id))) !== undefined) { setMsg(`Deleted "${a.title}".`); if (editing?.id === a.id) { setEditing(null); setForm(emptyAd); setPreview('') } load() }
  }

  const ctr = (a: Ad) => (a.views ? `${((a.clicks / a.views) * 100).toFixed(1)}%` : '–')

  return (
    <div className="menu-edit">
      <h2 className="staff-h">Ads</h2>
      <p className="menu-sub">Sell this space to local shops (mobile shop, coaching, property dealer) or promote your own deals. Ads show on the website and in the app. Views and taps are counted so you can show the sponsor what they got.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="oc-eta" role="status">{msg}</p>}

      <form className="offer-form panel" onSubmit={save}>
        <h3 className="panel-h">{editing ? 'Edit ad' : 'New ad'}</h3>
        <div className="sizes" role="radiogroup" aria-label="Where it shows">
          {PLACES.map(([p, label]) => (
            <MButton type="button" key={p} role="radio" aria-checked={form.place === p} className="size" onClick={() => setForm({ ...form, place: p })}>{label}</MButton>
          ))}
        </div>
        <label className="field" htmlFor="ad-title">Headline<input id="ad-title" required maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Sharma Mobiles, Julana" /></label>
        <label className="field" htmlFor="ad-body">Text <span className="opt">optional</span><input id="ad-body" maxLength={200} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Naye phone EMI pe, purane ka exchange" /></label>
        <div className="offer-row">
          <label className="field" htmlFor="ad-phone">Phone <span className="opt">optional</span><input id="ad-phone" inputMode="tel" maxLength={14} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98765 43210" /></label>
          <label className="field" htmlFor="ad-link">Website link <span className="opt">optional</span><input id="ad-link" type="url" maxLength={500} value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="https://..." /></label>
        </div>
        <div className="offer-row">
          <label className="field" htmlFor="ad-cta">Button text <span className="opt">optional</span><input id="ad-cta" maxLength={24} value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} placeholder="Call now" /></label>
          <label className="field" htmlFor="ad-from">From <span className="opt">optional</span><input id="ad-from" type="date" value={form.starts_on ?? ''} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></label>
          <label className="field" htmlFor="ad-to">Until <span className="opt">optional</span><input id="ad-to" type="date" value={form.ends_on ?? ''} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></label>
        </div>
        <label className="field" htmlFor="ad-img">Photo <span className="opt">optional, wide works best</span><input id="ad-img" type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} /></label>
        {preview && (
          <div className="ad-preview">
            <img src={preview} alt="Ad photo preview" />
            <MButton type="button" className="btn btn-ghost" onClick={() => { setPreview(''); setForm({ ...form, image: editing?.has_image ? 'remove' : '' }) }}>Remove photo</MButton>
          </div>
        )}
        <div className="offer-row">
          <MButton type="submit" className="btn btn-gold">{editing ? 'Save ad' : 'Put ad live'}</MButton>
          {editing && <MButton type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setForm(emptyAd); setPreview('') }}>Cancel</MButton>}
        </div>
      </form>

      <h3 className="panel-h">All ads</h3>
      {ads.length === 0 && <p className="menu-sub">No ads yet.</p>}
      <ul className="ad-list">
        {ads.map((a) => (
          <li key={a.id} className={`panel ad-row${a.active ? '' : ' off'}`}>
            {a.has_image && <img src={adImageUrl(a)} alt="" />}
            <div className="ad-row-copy">
              <strong>{a.title}</strong>
              <span className="opt">{PLACES.find(([p]) => p === a.place)?.[1]}{a.ends_on ? ` · until ${a.ends_on}` : ''}{a.active ? '' : ' · switched off'}</span>
              <span className="ad-stats"><Eye size={14} aria-hidden /> {a.views} views · <MousePointerClick size={14} aria-hidden /> {a.clicks} taps · {ctr(a)}</span>
            </div>
            <div className="ad-row-actions">
              <MButton type="button" className="btn btn-ghost" onClick={() => toggle(a)}>{a.active ? 'Switch off' : 'Switch on'}</MButton>
              <MButton type="button" className="btn btn-ghost" aria-label={`Edit ${a.title}`} onClick={() => edit(a)}><Pencil size={16} aria-hidden /></MButton>
              <MButton type="button" className="btn btn-ghost" aria-label={`Delete ${a.title}`} onClick={() => remove(a)}><Trash2 size={16} aria-hidden /></MButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
