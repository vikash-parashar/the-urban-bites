import { cleanMobile } from './kit'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MustChangePassword, SignedOut, staffApi, type OfferInput, type StaffOrder } from './staffApi'
import { rupees } from './menu'
import type { Offer, Shop } from './shop'
import { BadgeMedal } from './Extras'
import { MButton } from './motion'
import { brand } from './brand'

type MenuCats = Awaited<ReturnType<typeof staffApi.menu>>['categories']

// useGuard runs an API call and keeps its error message. Signed out or a forced password change sends
// the person back to the right screen through onSignedOut.
export function useGuard(onSignedOut: () => void) {
  const [error, setError] = useState('')
  const guard = useCallback(
    async <T,>(p: Promise<T>): Promise<T | undefined> => {
      try {
        const r = await p
        setError('')
        return r
      } catch (e) {
        if (e instanceof SignedOut || e instanceof MustChangePassword) onSignedOut()
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        return undefined
      }
    },
    [onSignedOut],
  )
  return { error, guard }
}

function useMenuItems(guard: ReturnType<typeof useGuard>['guard']) {
  const [cats, setCats] = useState<MenuCats>([])
  useEffect(() => {
    guard(staffApi.menu()).then((r) => r && setCats(r.categories))
  }, [guard])
  return cats
}

// ---- Badge on the owner's order card ----

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export function CustomerTag({ o }: { o: StaffOrder }) {
  if (!o.customer_phone) return null
  // customer_orders counts finished orders; an open one is the next.
  const open = o.status !== 'completed' && o.status !== 'cancelled'
  const n = o.customer_orders + (open ? 1 : 0)
  return (
    <span className="cust-tag">
      {n <= 1 ? 'First order' : `${ordinal(n)} order`}
      {o.customer_badge && <BadgeMedal name={o.customer_badge} />}
    </span>
  )
}

export const sourceLabel: Record<StaffOrder['source'], string> = { web: 'Website', app: 'App', counter: 'Counter' }

// ---- Walk-in sale ----

export function WalkIn({ onSignedOut }: { onSignedOut: () => void }) {
  const { error, guard } = useGuard(onSignedOut)
  const cats = useMenuItems(guard)
  const [lines, setLines] = useState<Record<string, number>>({})
  const [amount, setAmount] = useState('')
  const [payment, setPayment] = useState<'cash' | 'online'>('cash')
  const [done, setDone] = useState<StaffOrder | null>(null)
  const [q, setQ] = useState('')

  const items = cats.flatMap((c) => c.items).filter((i) => i.available && i.full != null)
  const byId = new Map(items.map((i) => [i.id, i]))
  const picked = Object.entries(lines).filter(([, n]) => n > 0)
  const itemsTotal = picked.reduce((s, [id, n]) => s + (byId.get(id)?.full ?? 0) * n, 0)
  const shown = q ? items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())) : items

  const bump = (id: string, d: number) => setLines((l) => ({ ...l, [id]: Math.max(0, (l[id] ?? 0) + d) }))

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const amt = parseInt(amount, 10)
    const r = await guard(
      staffApi.counterSale({
        customer_name: String(f.get('name') || ''),
        customer_phone: f.get('phone') ? `+91${String(f.get('phone'))}` : '',
        payment_method: payment,
        ...(picked.length ? { items: picked.map(([item_id, qty]) => ({ item_id, size: 'full', qty })) } : { amount: amt }),
      }),
    )
    if (r) {
      setDone(r)
      setLines({})
      setAmount('')
      form.reset()
    }
  }

  return (
    <div className="menu-edit">
      <h2 className="staff-h">Walk-in sale</h2>
      <p className="menu-sub">Record what a customer bought at the cart. With their phone number it counts toward their Urban Regulars badge, and it adds to earnings.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {done && (
        <p className="fresh" role="status">
          Saved #{done.number} · {rupees(done.total)}{done.customer_phone ? ` · ${done.customer_name} now has ${done.customer_orders} ${done.customer_orders === 1 ? 'order' : 'orders'}` : ''}
          {done.customer_badge ? ` (${done.customer_badge})` : ''}
        </p>
      )}
      <form className="walkin" onSubmit={save}>
        <div className="walkin-who">
          <label className="field" htmlFor="wi-phone"><span>Customer phone <span className="opt">for the badge</span></span><span className="phone-in"><span className="cc" aria-hidden="true">+91</span><input id="wi-phone" name="phone" inputMode="numeric" maxLength={10} pattern="[6-9][0-9]{9}" title="10-digit mobile starting with 6, 7, 8 or 9" placeholder="98765 43210" onInput={(e) => { e.currentTarget.value = cleanMobile(e.currentTarget.value) }} /></span></label>
          <label className="field" htmlFor="wi-name"><span>Name <span className="opt">optional</span></span><input id="wi-name" name="name" /></label>
          <fieldset className="seg">
            <legend>Paid by</legend>
            {(['cash', 'online'] as const).map((v) => (
              <label key={v} className={payment === v ? 'on' : ''}>
                <input type="radio" name="wi-pay" id={`wi-pay-${v}`} checked={payment === v} onChange={() => setPayment(v)} />
                {v === 'cash' ? 'Cash' : 'UPI / online'}
              </label>
            ))}
          </fieldset>
        </div>

        <div className="walkin-items">
          <input className="walkin-q" id="wi-q" type="search" placeholder="Find an item" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an item" />
          <div className="walkin-grid">
            {shown.map((i) => (
              <div key={i.id} className={`wi-item ${lines[i.id] ? 'on' : ''}`}>
                <button type="button" className="wi-add" onClick={() => bump(i.id, 1)}>
                  <strong>{i.name}</strong><span>{rupees(i.full ?? 0)}</span>
                </button>
                {lines[i.id] ? (
                  <span className="wi-qty">
                    <button type="button" onClick={() => bump(i.id, -1)} aria-label={`One less ${i.name}`}>−</button>
                    {lines[i.id]}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          {picked.length === 0 && (
            <label className="field" htmlFor="wi-amount">Or just the amount ₹<input id="wi-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 180" /></label>
          )}
        </div>

        <MButton className="btn btn-gold walkin-save" disabled={picked.length === 0 && !(parseInt(amount, 10) > 0)}>
          Save sale · {rupees(picked.length ? itemsTotal : parseInt(amount, 10) || 0)}
        </MButton>
      </form>
    </div>
  )
}

// ---- Offers ----

const emptyOffer: OfferInput = { period: 'day', title: '', description: '', item_id: null, offer_price: null }

export function OffersEditor({ onSignedOut }: { onSignedOut: () => void }) {
  const { error, guard } = useGuard(onSignedOut)
  const cats = useMenuItems(guard)
  const [offers, setOffers] = useState<Offer[]>([])
  const [form, setForm] = useState<OfferInput>(emptyOffer)
  const [editing, setEditing] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const load = useCallback(async () => {
    const r = await guard(staffApi.offers())
    if (r) setOffers(r.offers)
  }, [guard])
  useEffect(() => { load() }, [load])

  const items = cats.flatMap((c) => c.items).filter((i) => i.full != null)
  const item = items.find((i) => i.id === form.item_id)

  async function save(e: FormEvent) {
    e.preventDefault()
    const body = { ...form, offer_price: form.item_id ? form.offer_price : null }
    const r = await guard(editing ? staffApi.updateOffer(editing, body) : staffApi.createOffer(body))
    if (r) {
      setMsg(editing ? 'Offer updated.' : 'Offer is live on the website.')
      setForm(emptyOffer)
      setEditing(null)
      load()
    }
  }

  function edit(o: Offer) {
    setEditing(o.id)
    setForm({ period: o.period, title: o.title, description: o.description, item_id: o.item_id, offer_price: o.offer_price, starts_on: o.starts_on, ends_on: o.ends_on, active: true })
    setMsg('')
  }

  async function end(o: Offer) {
    if ((await guard(staffApi.endOffer(o.id))) !== undefined) {
      setMsg(`Ended "${o.title}".`)
      load()
    }
  }

  const live = (o: Offer) => o.active && o.starts_on <= today && today <= o.ends_on

  return (
    <div className="menu-edit">
      <h2 className="staff-h">Offers</h2>
      <p className="menu-sub">Offers show on the website under Offers. Link a dish and set a price, and that price is charged automatically while the offer runs.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="oc-eta" role="status">{msg}</p>}

      <form className="offer-form panel" onSubmit={save}>
        <h3 className="panel-h">{editing ? 'Edit offer' : 'New offer'}</h3>
        <div className="sizes" role="radiogroup" aria-label="Offer period">
          {(['day', 'month'] as const).map((p) => (
            <MButton type="button" key={p} role="radio" aria-checked={form.period === p} className="size" onClick={() => setForm({ ...form, period: p, starts_on: undefined, ends_on: undefined })}>
              {p === 'day' ? 'Offer of the day' : 'Offer of the month'}
            </MButton>
          ))}
        </div>
        <label className="field" htmlFor="of-title">Headline<input id="of-title" required maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Malai Chaap at ₹199" /></label>
        <label className="field" htmlFor="of-desc">Details <span className="opt">optional</span><input id="of-desc" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Full plate, today only" /></label>
        <div className="offer-row">
          <label className="field" htmlFor="of-item">Dish <span className="opt">optional</span>
            <select id="of-item" value={form.item_id ?? ''} onChange={(e) => setForm({ ...form, item_id: e.target.value || null })}>
              <option value="">No dish (general offer)</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} · {rupees(i.full ?? 0)}</option>)}
            </select>
          </label>
          {form.item_id && (
            <label className="field" htmlFor="of-price">Offer price ₹ <span className="opt">full plate{item?.full != null ? `, normally ${rupees(item.full)}` : ''}</span>
              <input id="of-price" inputMode="numeric" value={form.offer_price ?? ''} onChange={(e) => setForm({ ...form, offer_price: e.target.value ? parseInt(e.target.value.replace(/\D/g, ''), 10) : null })} />
            </label>
          )}
        </div>
        <div className="offer-row">
          <label className="field" htmlFor="of-start">Starts<input id="of-start" type="date" value={form.starts_on ?? today} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></label>
          <label className="field" htmlFor="of-end">Ends <span className="opt">{form.period === 'day' ? 'same day if empty' : 'end of month if empty'}</span><input id="of-end" type="date" value={form.ends_on ?? ''} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></label>
        </div>
        <div className="panel-actions">
          <MButton className="btn btn-gold">{editing ? 'Save changes' : 'Post offer'}</MButton>
          {editing && <MButton type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setForm(emptyOffer) }}>Cancel</MButton>}
        </div>
      </form>

      <h3 className="panel-h">Your offers</h3>
      {offers.length === 0 && <p className="menu-sub">No offers yet.</p>}
      {offers.map((o) => (
        <div key={o.id} className={`me-row ${live(o) ? '' : 'off'}`}>
          <span className="me-name">
            <strong>{o.title}</strong> · {o.period === 'day' ? 'Day' : 'Month'}
            {o.item_name && o.offer_price != null && <> · {o.item_name} {rupees(o.offer_price)}</>}
            <br /><small className="menu-sub">{o.starts_on === o.ends_on ? o.starts_on : `${o.starts_on} to ${o.ends_on}`} · {live(o) ? 'Live now' : !o.active ? 'Ended' : o.starts_on > today ? 'Upcoming' : 'Finished'}</small>
          </span>
          <MButton className="btn btn-ghost btn-sm" onClick={() => edit(o)}>Edit</MButton>
          {o.active && o.ends_on >= today && <MButton className="btn btn-danger btn-sm" onClick={() => end(o)}>End now</MButton>}
        </div>
      ))}
    </div>
  )
}

// ---- Shop settings ----

export function ShopSettings({ onSignedOut, isAdmin }: { onSignedOut: () => void; isAdmin: boolean }) {
  const { error, guard } = useGuard(onSignedOut)
  const [shop, setShop] = useState<Shop | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    guard(staffApi.shop()).then((s) => s && setShop(s))
  }, [guard])

  async function patch(u: Partial<Shop>, done = 'Saved. The website shows it within a minute.') {
    const r = await guard(staffApi.updateShop(u))
    if (r) { setShop(r); setMsg(done) }
  }

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const n = (k: string) => Number(f.get(k))
    patch({
      min_order_delivery: n('min_d'), min_order_pickup: n('min_p'), free_delivery_min: n('free_min'),
      free_delivery_km: n('free_km'), max_delivery_km: n('max_km'), delivery_fee: n('fee'), notice: String(f.get('notice') || ''),
    })
  }

  function savePay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const cash = f.get('accept_cash') === 'on'
    const upi = f.get('accept_upi') === 'on'
    if (!cash && !upi) return setMsg('Keep at least one payment option on.')
    patch({
      accept_cash: cash, accept_upi: upi,
      upi_id: String(f.get('upi_id') || '').trim(), upi_name: String(f.get('upi_name') || '').trim() || brand.name,
    }, 'Payment options saved. The website shows them within a minute.')
  }

  function setHere() {
    navigator.geolocation?.getCurrentPosition(
      (p) => patch({ cart_lat: Math.round(p.coords.latitude * 1e5) / 1e5, cart_lng: Math.round(p.coords.longitude * 1e5) / 1e5 }, 'Cart location saved. Delivery distances are measured from here.'),
      () => setMsg("Couldn't read this device's location. Allow location for this site and try again."),
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  if (!shop) return <div className="menu-edit">{error ? <p className="error" role="alert">{error}</p> : <p className="menu-sub">Loading…</p>}</div>

  return (
    <div className="menu-edit">
      <h2 className="staff-h">Shop settings</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="oc-eta" role="status">{msg}</p>}

      <div className={`me-row ${shop.accepting_orders ? '' : 'off'}`}>
        <span className="me-name"><strong>{shop.accepting_orders ? 'Taking online orders' : 'Online orders paused'}</strong><br /><small className="menu-sub">Pause when you're closed or too busy. Walk-in sales still work.</small></span>
        <MButton className={`btn ${shop.accepting_orders ? 'btn-danger' : 'btn-gold'}`} onClick={() => patch({ accepting_orders: !shop.accepting_orders })}>
          {shop.accepting_orders ? 'Pause orders' : 'Start taking orders'}
        </MButton>
      </div>

      {!isAdmin && (
        <div className="me-row">
          <span className="me-name"><strong>Order rules</strong><br /><small className="menu-sub">
            Delivery minimum {rupees(shop.min_order_delivery)} · free delivery above {rupees(shop.free_delivery_min)} within {shop.free_delivery_km} km. Set by the admin.
          </small></span>
        </div>
      )}
      {!isAdmin && (
        <form className="me-row" key={`km-${shop.updated_at}`} onSubmit={(e) => {
          e.preventDefault()
          const km = Number(new FormData(e.currentTarget).get('max_km'))
          if (!(km > 0 && km <= 50)) return setMsg('Delivery range must be between 1 and 50 km.')
          patch({ max_delivery_km: km }, `Saved. You now deliver up to ${km} km.`)
        }}>
          <span className="me-name"><strong>Delivery range</strong><br /><small className="menu-sub">Customers farther than this can only pick up.</small></span>
          <span className="prep-custom">
            <input id="own-max-km" name="max_km" inputMode="decimal" defaultValue={shop.max_delivery_km} aria-label="Deliver up to km" style={{ width: 80 }} />
            <span className="menu-sub">km</span>
            <MButton className="size">Save</MButton>
          </span>
        </form>
      )}
      {isAdmin && <form className="panel shop-form" onSubmit={save} key={shop.updated_at}>
        <h3 className="panel-h">Order rules</h3>
        <div className="add-staff">
          <label className="field" htmlFor="sh-min-d">Minimum for delivery ₹<input id="sh-min-d" name="min_d" inputMode="numeric" defaultValue={shop.min_order_delivery} /></label>
          <label className="field" htmlFor="sh-min-p">Minimum for pickup ₹<input id="sh-min-p" name="min_p" inputMode="numeric" defaultValue={shop.min_order_pickup} /></label>
          <label className="field" htmlFor="sh-free-min">Free delivery above ₹<input id="sh-free-min" name="free_min" inputMode="numeric" defaultValue={shop.free_delivery_min} /></label>
          <label className="field" htmlFor="sh-free-km">Free delivery within km<input id="sh-free-km" name="free_km" inputMode="decimal" defaultValue={shop.free_delivery_km} /></label>
          <label className="field" htmlFor="sh-max-km">Deliver up to km<input id="sh-max-km" name="max_km" inputMode="decimal" defaultValue={shop.max_delivery_km} /></label>
          <label className="field" htmlFor="sh-fee">Delivery charge otherwise ₹<input id="sh-fee" name="fee" inputMode="numeric" defaultValue={shop.delivery_fee} /></label>
        </div>
        <label className="field" htmlFor="sh-notice">Notice on the website <span className="opt">optional, e.g. "Closed on Tuesday"</span><input id="sh-notice" name="notice" maxLength={200} defaultValue={shop.notice} /></label>
        <MButton className="btn btn-gold">Save rules</MButton>
      </form>}

      {isAdmin ? (
        <form className="panel shop-form" onSubmit={savePay} key={`pay-${shop.updated_at}`}>
          <h3 className="panel-h">💳 Payment options <span className="tag-chip">Admin only</span></h3>
          <p className="menu-sub">Choose how customers can pay for website orders. The owner can see these but can't change them.</p>
          <label className="check"><input type="checkbox" name="accept_cash" defaultChecked={shop.accept_cash} /> 💵 Cash (on delivery or at the counter)</label>
          <label className="check"><input type="checkbox" name="accept_upi" defaultChecked={shop.accept_upi} /> 📲 UPI (Google Pay, PhonePe, Paytm), straight to the UPI ID below, no fees</label>
          <div className="add-staff">
            <label className="field" htmlFor="sh-upi">UPI ID<input id="sh-upi" name="upi_id" autoComplete="off" placeholder="8398907216@ybl" pattern="[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}" title="Looks like name@bank, for example 8398907216@ybl" defaultValue={shop.upi_id} /></label>
            <label className="field" htmlFor="sh-upi-name">Name shown in UPI apps<input id="sh-upi-name" name="upi_name" maxLength={50} defaultValue={shop.upi_name} /></label>
          </div>
          {shop.accept_upi && !shop.upi_id && <p className="menu-sub">UPI is on but no UPI ID is saved, so customers only see cash for now.</p>}
          <MButton className="btn btn-gold">Save payment options</MButton>
        </form>
      ) : (
        <div className="me-row">
          <span className="me-name"><strong>💳 Payment options</strong><br /><small className="menu-sub">
            {[shop.accept_cash && 'Cash', shop.accept_upi && shop.upi_id && `UPI to ${shop.upi_id}`].filter(Boolean).join(' · ') || 'Cash'}. Set by the admin; ask Vikash to change them.
          </small></span>
        </div>
      )}

      {isAdmin && <div className="me-row">
        <span className="me-name"><strong>Cart location</strong><br /><small className="menu-sub">
          {shop.cart_lat != null ? `Set. Distances for delivery are measured from here.` : 'Not set yet. Stand at the cart with this tablet and tap the button, so the website can measure delivery distances.'}
        </small></span>
        <MButton className="btn btn-ghost" onClick={setHere}>Use this device's location</MButton>
      </div>}
    </div>
  )
}
