import { useEffect, useState, type FormEvent } from 'react'
import { lookup, type Cart } from './cart'
import { isPreview } from './api'
import { rupees } from './menu'
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
  const [phone, setPhone] = useState(() => loadMe()?.phone ?? '')
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
      setMine(await fetchBadge(phone, localOrders))
    } catch (err) {
      setMine(null)
      setError(err instanceof Error ? err.message : 'Could not check right now.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="regulars" id="regulars" aria-labelledby="regulars-title">
      <div className="menu-head">
        <p className="eyebrow">Eat more, earn a badge</p>
        <h2 id="regulars-title">Urban Regulars</h2>
        <p className="menu-sub">Every finished order counts, whether you order here, in the app, or at the counter. Give your phone number when you order at the cart.</p>
      </div>

      <div className="reg-grid">
        <ol className="tiers">
          {tiers.map((t) => (
            <li key={t.name}>
              <BadgeMedal name={t.name} size="lg" />
              <span>{t.min === 1 ? 'Your first order' : `${t.min} orders`}</span>
            </li>
          ))}
        </ol>

        <div className="board-card">
          <h3>Top this month</h3>
          {regulars.length === 0 ? (
            <p className="menu-sub">Nobody yet. {monthlyMin} orders this month puts you on the board.</p>
          ) : (
            <ol className="leaders">
              {regulars.map((r, i) => (
                <li key={`${r.name}-${r.phone_hint}`} className={i === 0 ? 'top' : ''}>
                  <span className="rank">{i + 1}</span>
                  <span className="who">
                    <strong>{r.name}</strong> <small>{r.phone_hint}</small>
                    {i === 0 && <em className="fotm">Foodie of the month</em>}
                  </span>
                  <span className="count">{r.month_orders} orders</span>
                  <BadgeMedal name={r.badge} />
                </li>
              ))}
            </ol>
          )}
          {isPreview && <p className="tracker-note preview-note">Preview: sample leaderboard.</p>}
        </div>

        <form className="board-card check-badge" onSubmit={check}>
          <h3>Check your badge</h3>
          <label className="field" htmlFor="badge-phone">
            Your phone number
            <input id="badge-phone" inputMode="tel" required pattern="[0-9+ ]{10,14}" placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <button className="btn btn-ghost" disabled={busy}>{busy ? 'Checking…' : 'Check'}</button>
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
