import { useEffect, useState, type FormEvent } from 'react'
import { lookup, type Cart } from './cart'
import { isPreview } from './api'
import { rupees } from './menu'
import type { ReactNode } from 'react'
import { googleMaps, social } from './social'
import { checkMobile, cleanMobile, tenDigits } from './kit'
import { fetchBadge, fetchRegulars, loadMe, tierLevel, type Badge, type Offer, type Regular, type Shop, type Tier, defaultTiers } from './shop'

// ---- Free delivery banner ----

export function DeliveryBanner({ shop }: { shop: Shop }) {
  return (
    <section className="promo" aria-labelledby="promo-title">
      <div className="promo-road" aria-hidden="true">
        <svg className="promo-scooter" viewBox="0 0 120 70">
          <circle cx="24" cy="54" r="12" />
          <circle cx="96" cy="54" r="12" />
          <path d="M24 54 L44 54 L58 30 L84 30 L96 54" />
          <path d="M58 30 L52 16 L40 16" />
          <rect x="62" y="12" width="24" height="18" rx="3" />
        </svg>
      </div>
      <div className="promo-copy">
        <p className="eyebrow">Special</p>
        <h2 id="promo-title">
          <span className="promo-free">Free delivery</span>
          <span className="promo-rule">within {shop.free_delivery_km} km on orders above {rupees(shop.free_delivery_min)}</span>
        </h2>
        <p className="promo-fine">
          Minimum order for delivery is {rupees(shop.min_order_delivery)}.
          {shop.min_order_pickup > 0 ? ` Pickup from ${rupees(shop.min_order_pickup)}.` : ' Pickup has no minimum.'}
        </p>
      </div>
      <a className="btn btn-gold" href="#menu">Start an order</a>
    </section>
  )
}

// ---- Offers of the day / month ----

export function Offers({ offers, cart, onOpenCart }: { offers: Offer[]; cart: Cart; onOpenCart: () => void }) {
  const [picked, setTab] = useState<'day' | 'month' | null>(null)
  if (offers.length === 0) return null
  const hasDay = offers.some((o) => o.period === 'day')
  const hasMonth = offers.some((o) => o.period === 'month')
  const tab = picked ?? (hasDay ? 'day' : 'month')
  const list = offers.filter((o) => o.period === tab)

  return (
    <section className="offers" id="offers" aria-labelledby="offers-title">
      <div className="menu-head">
        <p className="eyebrow">Straight from the owner</p>
        <h2 id="offers-title">Offers</h2>
      </div>
      {hasDay && hasMonth && (
        <div className="sizes offers-tabs" role="tablist" aria-label="Offer period">
          <button role="tab" aria-selected={tab === 'day'} className="size" onClick={() => setTab('day')}>Offer of the day</button>
          <button role="tab" aria-selected={tab === 'month'} className="size" onClick={() => setTab('month')}>Offers of the month</button>
        </div>
      )}
      <div className="offer-grid">
        {list.map((o) => {
          const item = o.item_id ? lookup(o.item_id) : undefined
          const qty = item ? cart.qtyOf(item.id, 'full') : 0
          return (
            <article key={o.id} className={`offer-card offer-${o.period}`}>
              <span className="offer-when">{o.period === 'day' ? 'Today only' : endsLabel(o.ends_on)}</span>
              <h3>{o.title}</h3>
              {o.description && <p>{o.description}</p>}
              {item && o.offer_price != null && (
                <div className="offer-foot">
                  <span className="price">
                    {o.regular_price != null && <s className="was">{rupees(o.regular_price)}</s>}
                    {rupees(o.offer_price)}
                  </span>
                  {qty === 0 ? (
                    <button className="add" onClick={() => cart.dispatch({ type: 'add', itemId: item.id, size: 'full' })}>Add</button>
                  ) : (
                    <button className="add added" onClick={onOpenCart}>{qty} in order · view</button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
      {isPreview && <p className="tracker-note preview-note">Preview: sample offers. On the live site these come from the owner's app.</p>}
    </section>
  )
}

function endsLabel(ends: string) {
  if (!ends) return 'This month'
  const d = new Date(`${ends}T00:00:00+05:30`)
  return `Till ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`
}

// ---- Badges ----

export function BadgeMedal({ name, size = 'sm' }: { name: string | null; size?: 'sm' | 'lg' }) {
  const level = tierLevel(name)
  if (!level) return null
  return (
    <span className={`medal medal-${level} medal-${size}`}>
      <span className="medal-star" aria-hidden="true">✦</span>
      {name}
    </span>
  )
}

export function Regulars({ localOrders }: { localOrders: number }) {
  const [regulars, setRegulars] = useState<Regular[]>([])
  const [tiers, setTiers] = useState<Tier[]>(defaultTiers)
  const [monthlyMin, setMonthlyMin] = useState(3)
  const [phone, setPhone] = useState(() => tenDigits(loadMe()?.phone))
  const [mine, setMine] = useState<Badge | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchRegulars()
      .then((r) => {
        setRegulars(r.regulars)
        setTiers(r.tiers)
        setMonthlyMin(r.monthly_min)
      })
      .catch(() => {})
  }, [])

  async function check(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setMine(await fetchBadge(`+91${phone}`, localOrders))
    } catch (err) {
      setMine(null)
      setError(err instanceof Error ? err.message : 'Could not check right now.')
    } finally {
      setBusy(false)
    }
  }

  const podium = [regulars[1], regulars[0], regulars[2]] // silver, gold, bronze
  const rest = regulars.slice(3)
  const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <section className="regulars wall" id="regulars" aria-labelledby="regulars-title">
      <div className="wall-sign" aria-hidden="true">
        <span className="wall-bulbs" />
      </div>
      <div className="menu-head wall-head">
        <p className="eyebrow">Urban Regulars · {new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</p>
        <h2 id="regulars-title"><span className="wall-hall">Wall of</span> <span className="wall-fame">Fame</span></h2>
        <p className="menu-sub">The biggest foodies of the month, in lights. Every finished order counts: website, app or at the counter. {monthlyMin} orders this month puts your name up here.</p>
      </div>

      {regulars.length === 0 ? (
        <div className="wall-empty">
          <span className="wall-crown" aria-hidden="true">👑</span>
          <p><strong>This spot is waiting for you.</strong> Be the first foodie on the wall this month.</p>
          <a className="btn btn-gold" href="#menu">Order now</a>
        </div>
      ) : (
        <>
          <ol className="podium" aria-label="Top three this month">
            {podium.map((r, i) => {
              if (!r) return <li key={i} className="podium-spot empty" aria-hidden="true" />
              const place = i === 1 ? 1 : i === 0 ? 2 : 3
              return (
                <li key={`${r.name}-${r.phone_hint}`} className={`podium-spot place-${place}`}>
                  {place === 1 && <span className="wall-crown" aria-hidden="true">👑</span>}
                  <span className="avatar" aria-hidden="true">{initials(r.name)}</span>
                  <strong className="podium-name">{r.name}</strong>
                  <small>{r.phone_hint}</small>
                  <span className="podium-count">{r.month_orders} orders</span>
                  <BadgeMedal name={r.badge} />
                  <span className="plinth"><b>{place}</b>{place === 1 && <em>Foodie of the month</em>}</span>
                </li>
              )
            })}
          </ol>
          {rest.length > 0 && (
            <div className="wall-ticker" aria-label="More regulars this month">
              <div className="wall-run">
                {[...rest, ...rest].map((r, i) => (
                  <span key={i} aria-hidden={i >= rest.length}>
                    ⭐ <b>{r.name}</b> {r.phone_hint} · {r.month_orders} orders
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {isPreview && <p className="tracker-note preview-note">Preview: sample names. On the live site these are real customers who ordered this month (first name and last two digits only).</p>}

      <div className="reg-grid">
        <ol className="tiers">
          {tiers.map((t) => (
            <li key={t.name}>
              <BadgeMedal name={t.name} size="lg" />
              <span>{t.min === 1 ? 'Your first order' : `${t.min} orders`}</span>
            </li>
          ))}
        </ol>

        <form className="board-card check-badge" onSubmit={check}>
          <h3>Am I on the wall?</h3>
          <label className="field" htmlFor="badge-phone">
            Your mobile number
            <span className="phone-in">
              <span className="cc" aria-hidden="true">🇮🇳 +91</span>
              <input id="badge-phone" inputMode="numeric" required maxLength={10} placeholder="98765 43210" value={phone}
                onChange={(e) => setPhone(cleanMobile(e.target.value))} />
            </span>
          </label>
          <button className="btn btn-gold" disabled={busy || checkMobile(phone) !== ''}>{busy ? 'Checking…' : 'Check my badge'}</button>
          {error && <p className="error" role="alert">{error}</p>}
          {mine && <BadgeResult b={mine} />}
        </form>
      </div>
    </section>
  )
}

export function BadgeResult({ b }: { b: Badge }) {
  return (
    <div className="badge-result" role="status">
      {b.badge ? <BadgeMedal name={b.badge} size="lg" /> : <span className="menu-sub">No badge yet</span>}
      <p>
        {b.orders === 0 ? 'No finished orders on this number yet.' : `${b.orders} ${b.orders === 1 ? 'order' : 'orders'} so far, ${b.month_orders} this month.`}
        {b.next_badge && ` ${b.to_next} more for ${b.next_badge}.`}
        {b.top_of_month && ' You are the Foodie of the Month!'}
      </p>
    </div>
  )
}

// ---- Notices ----

export function ShopNotice({ shop }: { shop: Shop }) {
  if (shop.accepting_orders && !shop.notice) return null
  return (
    <div className={`notice page-notice ${shop.accepting_orders ? '' : 'notice-closed'}`} role="status">
      {!shop.accepting_orders && <strong>Online orders are paused. </strong>}
      {shop.notice || 'Call 83989 07216 or visit the cart.'}
    </div>
  )
}

// ---- Our promise ----

const promises = [
  { icon: '😋', title: 'Taste you come back for', hi: 'ऐसा स्वाद, बार-बार आओ', text: 'Recipes cooked the same way every night, so your favourite always tastes like your favourite.' },
  { icon: '🧼', title: 'Spotless kitchen', hi: 'पूरी सफ़ाई', text: 'Clean counters, clean hands, clean oil. You can watch every plate being made.' },
  { icon: '🥇', title: 'Only the best ingredients', hi: 'सबसे अच्छी सामग्री', text: 'Fresh paneer, fresh vegetables and pure masalas. Nothing old, nothing cheap.' },
  { icon: '🔥', title: 'Made fresh to order', hi: 'ताज़ा, गरमा-गरम', text: 'Nothing sits waiting. Your food goes from the tawa to your plate.' },
]

export function Promise() {
  return (
    <section className="promise" aria-labelledby="promise-title">
      <div className="menu-head">
        <p className="eyebrow">Our promise</p>
        <h2 id="promise-title">
          <span>Quality, taste, cleanliness.</span>
          <span className="promise-gold">No match anywhere.</span>
        </h2>
        <p className="promise-hi" lang="hi">स्वाद, सफ़ाई और गुणवत्ता में कोई मुकाबला नहीं</p>
      </div>
      <ul className="promise-grid">
        {promises.map((p) => (
          <li key={p.title} className="promise-card">
            <span className="promise-icon" aria-hidden="true">{p.icon}</span>
            <h3>{p.title}</h3>
            <p className="promise-card-hi" lang="hi">{p.hi}</p>
            <p>{p.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---- Follow and rate ----

export function Social({ lat, lng }: { lat: number; lng: number }) {
  const links = [
    social.instagram && { href: social.instagram, cls: 'ig', label: 'Instagram', sub: 'Reels from the cart' },
    social.facebook && { href: social.facebook, cls: 'fb', label: 'Facebook', sub: 'Offers and news' },
    { href: social.googleReview || googleMaps(lat, lng), cls: 'gg', label: social.googleReview ? 'Rate us on Google' : 'Find us on Google', sub: social.googleReview ? '⭐⭐⭐⭐⭐ takes 10 seconds' : 'Maps and directions' },
    { href: social.whatsapp, cls: 'wa', label: 'WhatsApp', sub: 'Order or ask a question' },
  ].filter(Boolean) as { href: string; cls: string; label: string; sub: string }[]
  return (
    <section className="social" aria-labelledby="social-title">
      <h2 id="social-title">Loved it? Tell everyone.</h2>
      <p className="menu-sub">Follow the cart, share a photo of your plate, or leave a review. It helps a small family business more than you'd think.</p>
      <div className="social-links">
        {links.map((l) => (
          <a key={l.cls} className={`social-btn ${l.cls}`} href={l.href} target="_blank" rel="noopener">
            <span className="social-ico" aria-hidden="true">{socialIcon[l.cls]}</span>
            <span><strong>{l.label}</strong><small>{l.sub}</small></span>
          </a>
        ))}
      </div>
    </section>
  )
}

const socialIcon: Record<string, ReactNode> = {
  ig: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
  ),
  fb: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9h3l.5-4h-3.5V9c0-.6.4-1 1-1z" /></svg>
  ),
  gg: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" /></svg>
  ),
  wa: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8s.7-2 .9-2.3c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.8-.1 1.3z" /></svg>
  ),
}
