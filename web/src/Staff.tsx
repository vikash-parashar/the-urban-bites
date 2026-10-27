import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { loadSession, signOut, staffApi, type Staff, type StaffAccount, type StaffOrder } from './staffApi'
import { rupees } from './menu'
import { CustomerTag, OffersEditor, ShopSettings, sourceLabel, useGuard, WalkIn } from './StaffExtras'
import DashboardView from './Dashboard'
import MenuAdmin from './MenuAdmin'
import Expenses from './Expenses'
import { ChangePassword, Login, ResetPassword } from './Account'
import { billText, itemKind, whatsappBill, type Bill } from './kit'
import { MA, MButton } from './motion'
import { brand } from './brand'
import { OrderTag, PaymentTag } from './Tags'
import { CustomerMap, NavView, RiderBoard, Riders } from './Delivery'
import { say } from './voice'
import { voiceNoteUrl } from './staffApi'

const PREP = [5, 10, 15, 20, 30, 45]

type Tab = 'dashboard' | 'orders' | 'walkin' | 'offers' | 'menu' | 'expenses' | 'shop' | 'staff' | 'riders' | 'deliveries'

// Staff area of the website (#staff): orders, menu, offers, sales dashboard and accounts.
export default function StaffApp({ hash }: { hash: string }) {
  const [user, setUser] = useState<Staff | null>(() => loadSession()?.user ?? null)
  const [tab, setTab] = useState<Tab>('orders')
  const [changing, setChanging] = useState(false)
  // Signed out, or told to change a temporary password: re-read the saved session.
  const onSignedOut = useCallback(() => setUser(loadSession()?.user ?? null), [])
  const [all, setAll] = useState(false)
  const feed = useOrderFeed(onSignedOut, all, !!user && !user.must_change_password && user.role !== 'delivery')

  if (hash.startsWith('#staff/reset')) {
    const token = new URLSearchParams(hash.split('?')[1] ?? '').get('token') ?? ''
    return <ResetPassword token={token} onDone={(s) => { setUser(s); location.hash = '#staff' }} />
  }
  if (!user) return <Login onIn={setUser} />
  if (user.must_change_password || changing) {
    return <ChangePassword user={user} forced={!!user.must_change_password} onDone={(s) => { setUser(s); setChanging(false) }} onCancel={() => setChanging(false)} />
  }

  // The owner runs the day (orders, walk-ins, sales, sold-out dishes, pausing orders); the admin sets everything else.
  const isAdmin = user.role === 'admin'
  const isRider = user.role === 'delivery'
  const tabs: [Tab, string, string][] = isRider
    ? [['deliveries', 'Deliveries', '🛵']]
    : isAdmin
    ? [['orders', 'Orders', '🧾'], ['dashboard', 'Sales', '📈'], ['walkin', 'Walk-in', '🚶'], ['offers', 'Offers', '🏷️'], ['menu', 'Menu', '🍽️'], ['expenses', 'Expenses', '💸'], ['shop', 'Shop', '🏪'], ['riders', 'Riders', '🛵'], ['staff', 'Staff', '👥']]
    : [['orders', 'Orders', '🧾'], ['dashboard', 'Sales', '📈'], ['walkin', 'Walk-in', '🚶'], ['menu', 'Sold out', '🍽️'], ['shop', 'Shop', '🏪'], ['riders', 'Riders', '🛵']]
  const shown: Tab = isRider ? 'deliveries' : tab

  return (
    <div className="staff">
      <header className="staff-bar">
        <a className="brand" href="#top" aria-label="Back to the website">
          <span className="brand-urban">The Urban</span>
          <span className="brand-bites">Bites</span>
        </a>
        <nav className="staff-tabs" role="tablist" aria-label="Staff sections">
          {tabs.map(([id, label, emoji]) => (
            <MButton key={id} role="tab" aria-selected={shown === id} className="tab" onClick={() => setTab(id)}>
              <span><i className="tab-emoji" aria-hidden="true">{emoji}</i>{label}{id === 'orders' && feed.newCount > 0 && <b className="tab-badge" aria-label={`${feed.newCount} new`}>{feed.newCount}</b>}</span>
            </MButton>
          ))}
        </nav>
        <div className="staff-who">
          <span>{user.name} · {roleName(user.role)}</span>
          <MButton className="btn btn-ghost btn-sm" onClick={() => setChanging(true)}>Password</MButton>
          <MButton className="btn btn-ghost btn-sm" onClick={() => { signOut(); setUser(null) }}>Sign out</MButton>
        </div>
      </header>
      <main className="staff-main">
        {!isRider && tab === 'dashboard' && <DashboardView onSignedOut={onSignedOut} goTo={setTab} isAdmin={isAdmin} />}
        {shown === 'deliveries' && <RiderBoard onSignedOut={onSignedOut} meId={user.id} />}
        {!isRider && shown === 'riders' && <Riders onSignedOut={onSignedOut} />}
        {!isRider && tab !== 'orders' && feed.newCount > 0 && (
          <MButton className="new-alert new-alert-top" onClick={() => setTab('orders')}>
            🔔 {feed.newCount === 1 ? '1 new order' : `${feed.newCount} new orders`} waiting · open Orders
          </MButton>
        )}
        {!isRider && tab === 'orders' && <Orders feed={feed} all={all} setAll={setAll} onSignedOut={onSignedOut} />}
        {!isRider && tab === 'walkin' && <WalkIn onSignedOut={onSignedOut} />}
        {!isRider && tab === 'offers' && isAdmin && <OffersEditor onSignedOut={onSignedOut} />}
        {!isRider && tab === 'menu' && <MenuAdmin onSignedOut={onSignedOut} canEdit={isAdmin} />}
        {!isRider && tab === 'expenses' && isAdmin && <Expenses onSignedOut={onSignedOut} />}
        {!isRider && tab === 'shop' && <ShopSettings onSignedOut={onSignedOut} isAdmin={isAdmin} />}
        {!isRider && tab === 'staff' && isAdmin && <StaffAccounts me={user} onSignedOut={onSignedOut} />}
      </main>
    </div>
  )
}

const roleName = (r: string) => (r === 'admin' ? 'Admin' : r === 'delivery' ? 'Delivery partner' : 'Owner')

function minsLeft(o: StaffOrder, offset: number) {
  if (!o.ready_at) return ''
  const left = Date.parse(o.ready_at) - (Date.now() + offset)
  return left <= 0 ? 'due now' : `${Math.ceil(left / 60000)} min left`
}

type Feed = ReturnType<typeof useOrderFeed>

// useOrderFeed polls the order list every 10 seconds for the whole staff area, so the
// new-order counter, the bell and the tab title work on every tab, not only on Orders.
function useOrderFeed(onSignedOut: () => void, all: boolean, enabled: boolean) {
  const [orders, setOrders] = useState<StaffOrder[]>([])
  const [offset, setOffset] = useState(0)
  const [sound, setSoundState] = useState(() => { try { return localStorage.getItem('ub-sound') !== 'off' } catch { return true } })
  const seen = useRef<Set<string> | null>(null)
  const soundRef = useRef(sound)
  const { error, guard } = useGuard(onSignedOut)

  const load = useCallback(async () => {
    const r = await guard(staffApi.orders(all))
    if (!r) return
    setOffset(Date.parse(r.server_time) - Date.now())
    setOrders(r.orders)
    const arrived = r.orders.filter((o) => o.status === 'placed' && seen.current && !seen.current.has(o.id))
    if (arrived.length && soundRef.current) { chime(); setTimeout(() => say('staff_new_order', true), 900) }
    const waiting = r.orders.filter((o) => o.status === 'placed').length
    document.title = waiting ? `(${waiting}) New order${waiting > 1 ? 's' : ''} · ${brand.name}` : `Orders · ${brand.name}`
    seen.current = new Set([...(seen.current ?? []), ...r.orders.map((o) => o.id)])
  }, [all, guard])

  useEffect(() => {
    if (!enabled) return
    load()
    const id = window.setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [load, enabled])

  const newCount = orders.filter((o) => o.status === 'placed').length
  // Keep ringing every 30 seconds while an order is still waiting to be accepted.
  useEffect(() => {
    if (!enabled || newCount === 0 || !sound) return
    const id = window.setInterval(chime, 30_000)
    return () => clearInterval(id)
  }, [enabled, newCount, sound])

  useEffect(() => () => { document.title = brand.name }, [])
  // Browsers only play sound after a tap; unlock the bell on the first tap anywhere.
  useEffect(() => {
    const unlock = () => audio()?.resume().catch(() => {})
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  const setSound = (on: boolean) => {
    soundRef.current = on
    setSoundState(on)
    try { localStorage.setItem('ub-sound', on ? 'on' : 'off') } catch { /* private mode */ }
    if (on) chime()
  }
  return { orders, offset, error, load, newCount, sound, setSound }
}

function Orders({ feed, all, setAll, onSignedOut }: { feed: Feed; all: boolean; setAll: (v: boolean) => void; onSignedOut: () => void }) {
  const { orders, offset, error, load, newCount, sound, setSound } = feed
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('open')
  const { error: updErr, guard } = useGuard(onSignedOut)

  const current = orders.find((o) => o.id === selected) ?? null
  const groups: [string, string, (o: StaffOrder) => boolean][] = [
    ['open', 'All open', (o) => o.status !== 'completed' && o.status !== 'cancelled'],
    ['placed', 'New', (o) => o.status === 'placed'],
    ['cooking', 'Cooking', (o) => o.status === 'accepted' || o.status === 'preparing'],
    ['ready', 'Ready', (o) => o.status === 'ready'],
    ['out', 'On the way', (o) => o.status === 'out_for_delivery'],
    ['unpaid', 'Not paid', (o) => o.payment_status !== 'paid' && o.status !== 'cancelled'],
  ]
  if (all) groups.push(['done', 'Done', (o) => o.status === 'completed'], ['cancelled', 'Cancelled', (o) => o.status === 'cancelled'])
  const test = groups.find((g) => g[0] === filter)?.[2] ?? (() => true)
  const shown = orders.filter(test)

  async function update(o: StaffOrder, u: { status?: string; prep_minutes?: number; payment_status?: string }) {
    const r = await guard(staffApi.updateOrder(o.id, u))
    if (r) load()
  }

  return (
    <div className={`board ${current ? 'has-sel' : ''}`}>
      <div className="board-list">
        <div className="board-head">
          <h2 className="staff-h">{all ? 'All orders' : 'Open orders'}</h2>
          <label className="check"><input id="show-all" type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show done</label>
        </div>
        <div className="alert-row">
          {newCount > 0 ? (
            <MButton className="new-alert" onClick={() => setFilter('placed')} animate={{ scale: [1, 1.03, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>
              🔔 {newCount === 1 ? '1 new order' : `${newCount} new orders`} · tap a card and set the time to accept
            </MButton>
          ) : (
            <span className="menu-sub">No new orders waiting.</span>
          )}
          <MButton className={`btn btn-ghost btn-sm sound-btn ${sound ? '' : 'is-off'}`} onClick={() => setSound(!sound)} aria-pressed={sound}>
            {sound ? '🔔 Sound on' : '🔕 Sound off'}
          </MButton>
        </div>
        <div className="order-filters" role="radiogroup" aria-label="Show orders">
          {groups.map(([id, label, f]) => {
            const n = orders.filter(f).length
            return <MButton key={id} role="radio" aria-checked={filter === id} className={`size ${id === 'placed' && n ? 'hot' : ''}`} onClick={() => setFilter(id)}
              animate={id === 'placed' && n ? { scale: [1, 1.08, 1] } : { scale: 1 }} transition={id === 'placed' && n ? { duration: 1.6, repeat: Infinity } : undefined}>{label} <b>{n}</b></MButton>
          })}
        </div>
        {(error || updErr) && <p className="error" role="alert">{updErr || error}</p>}
        {orders.length === 0 && !error && <p className="menu-sub">No open orders. New ones from the website and the app appear here within 10 seconds.</p>}
        {shown.length === 0 && orders.length > 0 && <p className="menu-sub">No orders here right now.</p>}
        {shown.map((o) => (
          <MButton layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }} key={o.id} className={`order-card ${o.status === 'placed' ? 'is-new' : ''} ${o.id === selected ? 'is-on' : ''}`} onClick={() => setSelected(o.id)}>
            <span className="oc-top">
              <strong>#{o.number}</strong>
              <OrderTag status={o.status} who="staff" delivery={o.fulfilment === 'delivery'} />
              <span className="oc-total">{rupees(o.total)}</span>
            </span>
            <span className="oc-tags"><PaymentTag method={o.payment_method} paid={o.payment_status === 'paid'} ref={o.payment_ref} cancelled={o.status === 'cancelled'} /></span>
            <span className="oc-meta">{o.customer_name} · {o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'} · {sourceLabel[o.source]}</span>
            <CustomerTag o={o} />
            <span className="oc-items">{o.items.map((l) => `${l.qty}× ${l.name}${l.size === 'half' ? ' (H)' : ''}`).join(', ')}</span>
            {(o.status === 'accepted' || o.status === 'preparing') && <span className="oc-eta">{minsLeft(o, offset)}</span>}
          </MButton>
        ))}
      </div>

      {current && <div className="sheet-scrim" onClick={() => setSelected(null)} aria-hidden="true" />}
      <div className="board-detail" role={current ? 'dialog' : undefined} aria-label={current ? `Order #${current.number}` : undefined}>
        {current && <MButton className="sheet-close" onClick={() => setSelected(null)} aria-label="Close order">Back to orders</MButton>}
        {!current ? (
          <p className="menu-sub">Pick an order to set its time and move it along.</p>
        ) : (
          <OrderPanel key={current.id} o={current} offset={offset} onUpdate={(u) => update(current, u)} />
        )}
      </div>
    </div>
  )
}

// One shared audio context, resumed by the first tap (browsers block sound before that).
let ctxRef: AudioContext | null = null
function audio(): AudioContext | null {
  try {
    if (!ctxRef) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctxRef = new Ctx()
    }
    return ctxRef
  } catch { return null }
}

// chime rings a short three-note bell for a new order.
function chime() {
  const ctx = audio()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  const t0 = ctx.currentTime + 0.02
  ;[880, 1175, 1568].forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = f
    o.type = 'triangle'
    const t = t0 + i * 0.16
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    o.connect(g).connect(ctx.destination)
    o.start(t)
    o.stop(t + 0.65)
  })
}

const STEPS: [string, string][] = [['placed', 'New'], ['preparing', 'Cooking'], ['ready', 'Ready'], ['completed', 'Done']]
const stepIndex = (o: StaffOrder) => {
  const s = o.status === 'accepted' ? 'preparing' : o.status === 'out_for_delivery' ? 'ready' : o.status
  return STEPS.findIndex(([k]) => k === s)
}

function Progress({ o }: { o: StaffOrder }) {
  if (o.status === 'cancelled') return <p className="error">This order was cancelled.</p>
  const at = stepIndex(o)
  return (
    <ol className="progress" aria-label="Order progress">
      {STEPS.map(([k, label], i) => (
        <li key={k} className={i < at ? 'done' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}>
          <span aria-hidden="true">{i < at ? '✓' : i + 1}</span>{k === 'ready' && o.fulfilment === 'delivery' ? (o.status === 'out_for_delivery' ? 'On the way' : 'Ready') : label}
        </li>
      ))}
    </ol>
  )
}

function staffBill(o: StaffOrder): Bill {
  return {
    number: o.number, when: new Date(o.created_at), customer: o.customer_name, lines: o.items,
    subtotal: o.subtotal, delivery_fee: o.delivery_fee, delivery: o.fulfilment === 'delivery', total: o.total,
    payment: `${o.payment_method === 'cash' ? 'Cash' : 'UPI'} · ${o.payment_status === 'paid' ? 'Paid' : 'Not paid yet'}${o.payment_ref ? ` (ref ${o.payment_ref})` : ''}`,
  }
}

function OrderPanel({ o, offset, onUpdate }: { o: StaffOrder; offset: number; onUpdate: (u: { status?: string; prep_minutes?: number; payment_status?: string }) => void }) {
  const [custom, setCustom] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [nav, setNav] = useState(false)
  const active = o.status !== 'completed' && o.status !== 'cancelled'
  const cooking = o.status === 'accepted' || o.status === 'preparing'
  const startStatus = o.status === 'placed' ? 'preparing' : undefined
  const next: [string, string] | null =
    cooking ? (o.fulfilment === 'delivery' ? ['out_for_delivery', 'Send out for delivery'] : ['ready', 'Mark ready for pickup'])
    : o.status === 'ready' ? ['completed', 'Picked up · close order']
    : o.status === 'out_for_delivery' ? ['completed', 'Delivered · close order']
    : null

  return (
    <div className="panel">
      <div className="oc-top">
        <h2 className="staff-h">Order #{o.number}</h2>
        <OrderTag status={o.status} who="staff" delivery={o.fulfilment === 'delivery'} />
        <span className="menu-sub">{new Date(o.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <Progress o={o} />
      <p><strong className="selectable">{o.customer_name}{o.customer_phone ? ` · ${o.customer_phone}` : ''}</strong>
        {o.customer_phone && <MA className="btn btn-ghost btn-sm call-btn" href={`tel:${o.customer_phone}`}>Call</MA>}<br />
        <span className="menu-sub">{o.fulfilment === 'delivery' ? `Delivery to: ${o.address ?? ''}${o.delivery_km != null ? ` · about ${o.delivery_km.toFixed(1)} km` : ''}` : 'Pickup at the cart'} · from the {sourceLabel[o.source].toLowerCase()}</span></p>
      {(o.customer_email || o.customer_city) && (
        <p className="menu-sub">{o.customer_city && <>📍 {o.customer_city}</>}{o.customer_city && o.customer_email && ' · '}{o.customer_email && <>✉️ <span className="selectable">{o.customer_email}</span></>}</p>
      )}
      <CustomerTag o={o} />
      {o.note && <p className="note">Note: {o.note}</p>}
      {o.has_voice_note && <VoicePlayer id={o.id} />}
      {o.fulfilment === 'delivery' && (
        o.delivery_lat != null && o.delivery_lng != null ? (
          <>
            {nav && <NavView order={o} onClose={() => setNav(false)} />}
            <CustomerMap lat={o.delivery_lat} lng={o.delivery_lng} label={o.customer_name} onNavigate={() => setNav(true)} />
          </>
        ) : <p className="menu-sub">No map location on this order (older order or from the app). Call the customer for directions.</p>
      )}
      {o.fulfilment === 'delivery' && (
        <p className="rider-line">{o.rider_name ? <>🛵 Rider: <strong>{o.rider_name}</strong>{o.status === 'out_for_delivery' ? ' · on the way' : ' · will deliver'}</> : '🛵 No rider has taken this yet. Riders see it in their Deliveries screen.'}</p>
      )}
      <ul className="lines">
        {o.items.map((l, i) => (
          <li key={i}><span className="line-emoji" aria-hidden="true">{itemKind(l.name).emoji}</span><div><strong>{l.qty}× {l.name}</strong>{l.size === 'half' && <small>Half plate</small>}</div><span /><span className="line-total">{rupees(l.qty * l.unit_price)}</span></li>
        ))}
      </ul>
      {o.fulfilment === 'delivery' && (
        <div className="sums"><div><span>Items</span><span>{rupees(o.subtotal)}</span></div><div><span>Delivery</span><span className={o.delivery_fee === 0 ? 'free' : ''}>{o.delivery_fee === 0 ? 'Free' : rupees(o.delivery_fee)}</span></div></div>
      )}
      <div className="total-row"><PaymentTag method={o.payment_method} paid={o.payment_status === 'paid'} ref={o.payment_ref} cancelled={o.status === 'cancelled'} /><strong>{rupees(o.total)}</strong></div>
      {o.payment_ref && (
        <p className="upi-ref-staff">📲 UPI ref <strong className="selectable">{o.payment_ref}</strong>{o.payment_status !== 'paid' && ' · match it with your bank or UPI app, then Mark paid'}</p>
      )}
      <div className="bill-actions">
        <MA className="btn btn-wa btn-sm" target="_blank" rel="noopener" href={whatsappBill(staffBill(o), o.customer_phone)}>Send bill on WhatsApp</MA>
        <MButton type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(billText(staffBill(o)))}>Copy bill</MButton>
      </div>

      {active && (
        <>
          <h3 className="panel-h">{o.status === 'placed' ? 'Accept: how long will it take?' : 'Change the ready time'}</h3>
          {cooking && o.ready_at && <p className="oc-eta">Customer sees: {minsLeft(o, offset)} (set to {o.prep_minutes} min)</p>}
          <div className="prep">
            {PREP.map((m) => <MButton key={m} className="size" onClick={() => onUpdate({ status: startStatus, prep_minutes: m })}>{m} min</MButton>)}
            <form className="prep-custom" onSubmit={(e) => { e.preventDefault(); const m = parseInt(custom, 10); if (m >= 1 && m <= 240) onUpdate({ status: startStatus, prep_minutes: m }) }}>
              <input id="prep-custom" inputMode="numeric" placeholder="Other" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom minutes" />
              <MButton className="size">Set</MButton>
            </form>
          </div>
          <div className="panel-actions">
            {next && <MButton className="btn btn-gold" onClick={() => onUpdate({ status: next[0] })}>{next[1]}</MButton>}
            {o.payment_status !== 'paid' && <MButton className="btn btn-ghost" onClick={() => onUpdate({ payment_status: 'paid' })}>Mark paid</MButton>}
            {!confirmCancel ? (
              <MButton className="btn btn-danger" onClick={() => setConfirmCancel(true)}>Cancel order</MButton>
            ) : (
              <span className="confirm">The customer will see it's cancelled.
                <MButton className="btn btn-danger" onClick={() => onUpdate({ status: 'cancelled' })}>Yes, cancel</MButton>
                <MButton className="btn btn-ghost" onClick={() => setConfirmCancel(false)}>Keep it</MButton>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function VoicePlayer({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let u: string | null = null
    voiceNoteUrl(id).then((x) => { u = x; setUrl(x) }).catch((e) => setErr(e.message))
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [id])
  return (
    <div className="voice-note staff-voice">
      <span className="panel-h">🎤 Voice note from the customer</span>
      {url ? <audio controls src={url} /> : err ? <span className="field-err">{err}</span> : <span className="menu-sub">Loading…</span>}
    </div>
  )
}

function StaffAccounts({ me, onSignedOut }: { me: Staff; onSignedOut: () => void }) {
  const [users, setUsers] = useState<StaffAccount[]>([])
  const [msg, setMsg] = useState('')
  const { error, guard } = useGuard(onSignedOut)
  const load = useCallback(async () => {
    const r = await guard(staffApi.users())
    if (r) setUsers(r.users)
  }, [guard])
  useEffect(() => { load() }, [load])

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const r = await guard(staffApi.createUser({ name: String(f.get('name')), email: String(f.get('email')), role: String(f.get('role')), password: String(f.get('password')) }))
    if (r) { form.reset(); setMsg(`Added ${r.name}. Share the temporary password with them; they’ll pick their own at first sign-in.`); load() }
  }

  async function reset(u: StaffAccount, e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const pw = String(new FormData(form).get('pw'))
    if (await guard(staffApi.updateUser(u.id, { password: pw }))) { form.reset(); setMsg(u.id === me.id ? 'Your password is changed.' : `Temporary password set for ${u.name}. They’ll choose a new one when they sign in.`) }
  }

  return (
    <div className="menu-edit">
      <h2 className="staff-h">Staff accounts</h2>
      <p className="menu-sub">Owners run orders, menu, offers and sales. Admins can also manage staff. A password you set here is temporary: the person is asked to choose their own the first time they sign in, and can use “Forgot password?” any time.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="oc-eta" role="status">{msg}</p>}
      {users.map((u) => (
        <div key={u.id} className={`me-row ${u.active ? '' : 'off'}`}>
          <span className="me-name"><strong>{u.name}</strong> · {roleName(u.role)}{u.must_change_password && <span className="tag-chip">Temporary password</span>}<br /><small className="menu-sub">{u.email} · {u.last_login_at ? `last in ${new Date(u.last_login_at).toLocaleString('en-IN')}` : 'never signed in'}</small></span>
          <form className="prep-custom" onSubmit={(e) => reset(u, e)}>
            <input id={`pw-${u.id}`} name="pw" type="password" minLength={10} required placeholder={u.id === me.id ? 'New password' : 'Temporary password'} aria-label={`New password for ${u.name}`} />
            <MButton className="size">Reset</MButton>
          </form>
          <label className="check"><input id={`act-${u.id}`} type="checkbox" checked={u.active} disabled={u.id === me.id}
            onChange={async (e) => { if (await guard(staffApi.updateUser(u.id, { active: e.target.checked }))) load() }} /> Active</label>
        </div>
      ))}
      <h3 className="panel-h">Add staff</h3>
      <form className="add-staff" onSubmit={add}>
        <label className="field" htmlFor="ns-name">Name<input id="ns-name" name="name" required /></label>
        <label className="field" htmlFor="ns-email">Email<input id="ns-email" name="email" type="email" required /></label>
        <label className="field" htmlFor="ns-pass">Password<input id="ns-pass" name="password" type="password" minLength={10} required placeholder="Temporary, 10+ characters" /></label>
        <label className="field" htmlFor="ns-role">Role<select id="ns-role" name="role" defaultValue="owner"><option value="owner">Owner</option><option value="delivery">Delivery partner</option><option value="admin">Admin</option></select></label>
        <MButton className="btn btn-gold">Add staff</MButton>
      </form>
    </div>
  )
}
