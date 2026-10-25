import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { loadSession, signIn, signOut, SignedOut, staffApi, type Earnings, type Staff, type StaffAccount, type StaffOrder } from './staffApi'
import { rupees } from './menu'
import { CustomerTag, OffersEditor, ShopSettings, sourceLabel, WalkIn } from './StaffExtras'
import { billText, itemKind, whatsappBill, type Bill } from './kit'

const statusLabel: Record<string, string> = {
  placed: 'New', accepted: 'Accepted', preparing: 'Cooking', ready: 'Ready',
  out_for_delivery: 'Out for delivery', completed: 'Done', cancelled: 'Cancelled',
}
const PREP = [5, 10, 15, 20, 30, 45]

type Tab = 'orders' | 'walkin' | 'offers' | 'menu' | 'shop' | 'earnings' | 'staff'

// Staff area of the website (#staff): the same controls as the owner tablet app.
export default function StaffApp() {
  const [user, setUser] = useState<Staff | null>(() => loadSession()?.user ?? null)
  const [tab, setTab] = useState<Tab>('orders')
  const onSignedOut = useCallback(() => setUser(null), [])

  if (!user) return <Login onIn={setUser} />

  const tabs: [Tab, string][] = [['orders', 'Orders'], ['walkin', 'Walk-in'], ['offers', 'Offers'], ['menu', 'Menu'], ['shop', 'Shop'], ['earnings', 'Earnings']]
  if (user.role === 'admin') tabs.push(['staff', 'Staff'])

  return (
    <div className="staff">
      <header className="staff-bar">
        <a className="brand" href="#top" aria-label="Back to the website">
          <span className="brand-urban">The Urban</span>
          <span className="brand-bites">Bites</span>
        </a>
        <nav className="staff-tabs" role="tablist" aria-label="Staff sections">
          {tabs.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="staff-who">
          <span>{user.name} · {user.role === 'admin' ? 'Admin' : 'Owner'}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { signOut(); setUser(null) }}>Sign out</button>
        </div>
      </header>
      <main className="staff-main">
        {tab === 'orders' && <Orders onSignedOut={onSignedOut} />}
        {tab === 'walkin' && <WalkIn onSignedOut={onSignedOut} />}
        {tab === 'offers' && <OffersEditor onSignedOut={onSignedOut} />}
        {tab === 'menu' && <MenuEditor onSignedOut={onSignedOut} />}
        {tab === 'shop' && <ShopSettings onSignedOut={onSignedOut} />}
        {tab === 'earnings' && <EarningsView onSignedOut={onSignedOut} />}
        {tab === 'staff' && user.role === 'admin' && <StaffAccounts me={user} onSignedOut={onSignedOut} />}
      </main>
    </div>
  )
}

function useGuard(onSignedOut: () => void) {
  const [error, setError] = useState('')
  const guard = useCallback(
    async <T,>(p: Promise<T>): Promise<T | undefined> => {
      try {
        const r = await p
        setError('')
        return r
      } catch (e) {
        if (e instanceof SignedOut) onSignedOut()
        setError(e instanceof Error ? e.message : 'Something went wrong.')
        return undefined
      }
    },
    [onSignedOut],
  )
  return { error, guard }
}

function Login({ onIn }: { onIn: (s: Staff) => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    try {
      onIn(await signIn(String(f.get('email')), String(f.get('password'))))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="staff-login">
      <form className="checkout" onSubmit={submit}>
        <a className="brand" href="#top"><span className="brand-urban">The Urban</span><span className="brand-bites">Bites</span></a>
        <h1 className="staff-h">Staff sign in</h1>
        <p className="menu-sub">For the owner and the admin: orders, menu and earnings.</p>
        <label className="field" htmlFor="st-email">Email<input id="st-email" name="email" type="email" required autoComplete="username" /></label>
        <label className="field" htmlFor="st-pass">Password<input id="st-pass" name="password" type="password" required autoComplete="current-password" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-gold btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

function minsLeft(o: StaffOrder, offset: number) {
  if (!o.ready_at) return ''
  const left = Date.parse(o.ready_at) - (Date.now() + offset)
  return left <= 0 ? 'due now' : `${Math.ceil(left / 60000)} min left`
}

function Orders({ onSignedOut }: { onSignedOut: () => void }) {
  const [orders, setOrders] = useState<StaffOrder[]>([])
  const [all, setAll] = useState(false)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const seen = useRef<Set<string> | null>(null)
  const { error, guard } = useGuard(onSignedOut)

  const load = useCallback(async () => {
    const r = await guard(staffApi.orders(all))
    if (!r) return
    setOffset(Date.parse(r.server_time) - Date.now())
    setOrders(r.orders)
    const newOnes = r.orders.filter((o) => o.status === 'placed' && seen.current && !seen.current.has(o.id))
    if (newOnes.length) setFresh(`New order #${newOnes[0].number} from ${newOnes[0].customer_name}`)
    seen.current = new Set([...(seen.current ?? []), ...r.orders.map((o) => o.id)])
  }, [all, guard])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [load])

  const current = orders.find((o) => o.id === selected) ?? null

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
        {fresh && (
          <button className="fresh" onClick={() => setFresh(null)}>{fresh} · dismiss</button>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        {orders.length === 0 && !error && <p className="menu-sub">No open orders. New ones from the website and the app appear here within 10 seconds.</p>}
        {orders.map((o) => (
          <button key={o.id} className={`order-card ${o.status === 'placed' ? 'is-new' : ''} ${o.id === selected ? 'is-on' : ''}`} onClick={() => setSelected(o.id)}>
            <span className="oc-top">
              <strong>#{o.number}</strong>
              <span className={`pill pill-${o.status}`}>{statusLabel[o.status]}</span>
              <span className="oc-total">{rupees(o.total)}</span>
            </span>
            <span className="oc-meta">{o.customer_name} · {o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'} · {o.payment_method === 'cash' ? 'Cash' : 'Online'} · {sourceLabel[o.source]}</span>
            <CustomerTag o={o} />
            <span className="oc-items">{o.items.map((l) => `${l.qty}× ${l.name}${l.size === 'half' ? ' (H)' : ''}`).join(', ')}</span>
            {(o.status === 'accepted' || o.status === 'preparing') && <span className="oc-eta">{minsLeft(o, offset)}</span>}
          </button>
        ))}
      </div>

      {current && <div className="sheet-scrim" onClick={() => setSelected(null)} aria-hidden="true" />}
      <div className="board-detail" role={current ? 'dialog' : undefined} aria-label={current ? `Order #${current.number}` : undefined}>
        {current && <button className="sheet-close" onClick={() => setSelected(null)} aria-label="Close order">Back to orders</button>}
        {!current ? (
          <p className="menu-sub">Pick an order to set its time and move it along.</p>
        ) : (
          <OrderPanel key={current.id} o={current} offset={offset} onUpdate={(u) => update(current, u)} />
        )}
      </div>
    </div>
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
        <span className={`pill pill-${o.status}`}>{statusLabel[o.status]}</span>
        <span className="menu-sub">{new Date(o.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <p><strong className="selectable">{o.customer_name}{o.customer_phone ? ` · ${o.customer_phone}` : ''}</strong>
        {o.customer_phone && <a className="btn btn-ghost btn-sm call-btn" href={`tel:${o.customer_phone}`}>Call</a>}<br />
        <span className="menu-sub">{o.fulfilment === 'delivery' ? `Delivery to: ${o.address ?? ''}${o.delivery_km != null ? ` · about ${o.delivery_km.toFixed(1)} km` : ''}` : 'Pickup at the cart'} · from the {sourceLabel[o.source].toLowerCase()}</span></p>
      <CustomerTag o={o} />
      {o.note && <p className="note">Note: {o.note}</p>}
      <ul className="lines">
        {o.items.map((l, i) => (
          <li key={i}><span className="line-emoji" aria-hidden="true">{itemKind(l.name).emoji}</span><div><strong>{l.qty}× {l.name}</strong>{l.size === 'half' && <small>Half plate</small>}</div><span /><span className="line-total">{rupees(l.qty * l.unit_price)}</span></li>
        ))}
      </ul>
      {o.fulfilment === 'delivery' && (
        <div className="sums"><div><span>Items</span><span>{rupees(o.subtotal)}</span></div><div><span>Delivery</span><span className={o.delivery_fee === 0 ? 'free' : ''}>{o.delivery_fee === 0 ? 'Free' : rupees(o.delivery_fee)}</span></div></div>
      )}
      <div className="total-row"><span>{o.payment_method === 'cash' ? 'Cash' : 'UPI'} · {o.payment_status === 'paid' ? 'Paid' : 'Not paid yet'}</span><strong>{rupees(o.total)}</strong></div>
      {o.payment_ref && (
        <p className="upi-ref-staff">📲 UPI ref <strong className="selectable">{o.payment_ref}</strong>{o.payment_status !== 'paid' && ' · match it with your bank or UPI app, then Mark paid'}</p>
      )}
      <div className="bill-actions">
        <a className="btn btn-wa btn-sm" target="_blank" rel="noopener" href={whatsappBill(staffBill(o), o.customer_phone)}>Send bill on WhatsApp</a>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(billText(staffBill(o)))}>Copy bill</button>
      </div>

      {active && (
        <>
          <h3 className="panel-h">{o.status === 'placed' ? 'Accept: how long will it take?' : 'Change the ready time'}</h3>
          {cooking && o.ready_at && <p className="oc-eta">Customer sees: {minsLeft(o, offset)} (set to {o.prep_minutes} min)</p>}
          <div className="prep">
            {PREP.map((m) => <button key={m} className="size" onClick={() => onUpdate({ status: startStatus, prep_minutes: m })}>{m} min</button>)}
            <form className="prep-custom" onSubmit={(e) => { e.preventDefault(); const m = parseInt(custom, 10); if (m >= 1 && m <= 240) onUpdate({ status: startStatus, prep_minutes: m }) }}>
              <input id="prep-custom" inputMode="numeric" placeholder="Other" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom minutes" />
              <button className="size">Set</button>
            </form>
          </div>
          <div className="panel-actions">
            {next && <button className="btn btn-gold" onClick={() => onUpdate({ status: next[0] })}>{next[1]}</button>}
            {o.payment_status !== 'paid' && <button className="btn btn-ghost" onClick={() => onUpdate({ payment_status: 'paid' })}>Mark paid</button>}
            {!confirmCancel ? (
              <button className="btn btn-danger" onClick={() => setConfirmCancel(true)}>Cancel order</button>
            ) : (
              <span className="confirm">The customer will see it's cancelled.
                <button className="btn btn-danger" onClick={() => onUpdate({ status: 'cancelled' })}>Yes, cancel</button>
                <button className="btn btn-ghost" onClick={() => setConfirmCancel(false)}>Keep it</button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MenuEditor({ onSignedOut }: { onSignedOut: () => void }) {
  type Cat = Awaited<ReturnType<typeof staffApi.menu>>['categories'][number]
  const [cats, setCats] = useState<Cat[]>([])
  const { error, guard } = useGuard(onSignedOut)
  const load = useCallback(async () => {
    const r = await guard(staffApi.menu())
    if (r) setCats(r.categories)
  }, [guard])
  useEffect(() => { load() }, [load])

  async function save(id: string, u: { full?: number; half?: number; available?: boolean }) {
    if ((await guard(staffApi.updateItem(id, u))) !== undefined) load()
  }

  return (
    <div className="menu-edit">
      <h2 className="staff-h">Menu</h2>
      <p className="menu-sub">Change a price and press Enter, or switch an item off when it runs out. The website updates within a minute.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {cats.map((c) => (
        <section key={c.id}>
          <h3 className="panel-h">{c.name}</h3>
          {c.items.map((i) => (
            <div key={i.id} className={`me-row ${i.available ? '' : 'off'}`}>
              <span className="me-name">{i.name}</span>
              <PriceInput id={`p-${i.id}-full`} label="Full" value={i.full} onSave={(v) => save(i.id, { full: v })} />
              <PriceInput id={`p-${i.id}-half`} label="Half" value={i.half ?? null} onSave={(v) => save(i.id, { half: v })} />
              <label className="check"><input id={`a-${i.id}`} type="checkbox" checked={i.available} onChange={(e) => save(i.id, { available: e.target.checked })} /> On menu</label>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function PriceInput({ id, label, value, onSave }: { id: string; label: string; value: number | null; onSave: (v: number) => void }) {
  const [v, setV] = useState(value?.toString() ?? '')
  useEffect(() => setV(value?.toString() ?? ''), [value])
  return (
    <label className="me-price" htmlFor={id}>
      <span>{label} ₹</span>
      <input id={id} inputMode="numeric" value={v} placeholder="—" onChange={(e) => setV(e.target.value)}
        onBlur={() => { const n = parseInt(v, 10); if (!Number.isNaN(n) && n !== value) onSave(n) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </label>
  )
}

function isoDay(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function EarningsView({ onSignedOut }: { onSignedOut: () => void }) {
  const [days, setDays] = useState(1)
  const [e, setE] = useState<Earnings | null>(null)
  const { error, guard } = useGuard(onSignedOut)
  useEffect(() => {
    const to = new Date()
    const from = new Date(Date.now() - (days - 1) * 86_400_000)
    guard(staffApi.earnings(isoDay(from), isoDay(to))).then((r) => r && setE(r))
  }, [days, guard])
  const cash = e?.days.reduce((s, d) => s + d.cash, 0) ?? 0
  const online = e?.days.reduce((s, d) => s + d.online, 0) ?? 0
  const max = Math.max(1, ...(e?.days.map((d) => d.revenue) ?? [1]))
  return (
    <div className="earn">
      <div className="board-head">
        <h2 className="staff-h">Earnings</h2>
        <div className="sizes">
          {[[1, 'Today'], [7, '7 days'], [30, '30 days']].map(([d, l]) => (
            <button key={d} className="size" aria-checked={days === d} role="radio" onClick={() => setDays(d as number)}>{l}</button>
          ))}
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {e && (
        <>
          <div className="earn-top">
            <div><span className="eyebrow">Earned</span><strong className="earn-big">{rupees(e.revenue)}</strong></div>
            <dl className="visit-facts">
              <div><dt>Orders</dt><dd>{e.orders}</dd></div>
              <div><dt>Average</dt><dd>{rupees(e.avg_order)}</dd></div>
              <div><dt>Cash</dt><dd>{rupees(cash)}</dd></div>
              <div><dt>Online</dt><dd>{rupees(online)}</dd></div>
            </dl>
          </div>
          {days > 1 && (
            <div className="bars">
              {[...e.days].reverse().map((d) => (
                <div key={d.day} className="bar-row"><span>{d.day.slice(5)}</span><span className="bar"><i style={{ width: `${(d.revenue / max) * 100}%` }} /></span><span>{rupees(d.revenue)}</span></div>
              ))}
            </div>
          )}
          <h3 className="panel-h">Best sellers</h3>
          {e.top_items.length === 0 ? <p className="menu-sub">No completed orders in this period yet.</p> : (
            <ul className="lines">{e.top_items.map((t) => <li key={t.name}><div><strong>{t.name}</strong><small>{t.qty} sold</small></div><span /><span className="line-total">{rupees(t.sales)}</span></li>)}</ul>
          )}
        </>
      )}
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
    if (r) { form.reset(); setMsg(`Added ${r.name}.`); load() }
  }

  async function reset(u: StaffAccount, e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const pw = String(new FormData(form).get('pw'))
    if (await guard(staffApi.updateUser(u.id, { password: pw }))) { form.reset(); setMsg(`Password changed for ${u.name}.`) }
  }

  return (
    <div className="menu-edit">
      <h2 className="staff-h">Staff accounts</h2>
      <p className="menu-sub">Owners run orders, menu and earnings. Admins can also manage staff.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="oc-eta" role="status">{msg}</p>}
      {users.map((u) => (
        <div key={u.id} className={`me-row ${u.active ? '' : 'off'}`}>
          <span className="me-name"><strong>{u.name}</strong> · {u.role === 'admin' ? 'Admin' : 'Owner'}<br /><small className="menu-sub">{u.email} · {u.last_login_at ? `last in ${new Date(u.last_login_at).toLocaleString('en-IN')}` : 'never signed in'}</small></span>
          <form className="prep-custom" onSubmit={(e) => reset(u, e)}>
            <input id={`pw-${u.id}`} name="pw" type="password" minLength={10} required placeholder="New password" aria-label={`New password for ${u.name}`} />
            <button className="size">Reset</button>
          </form>
          <label className="check"><input id={`act-${u.id}`} type="checkbox" checked={u.active} disabled={u.id === me.id}
            onChange={async (e) => { if (await guard(staffApi.updateUser(u.id, { active: e.target.checked }))) load() }} /> Active</label>
        </div>
      ))}
      <h3 className="panel-h">Add staff</h3>
      <form className="add-staff" onSubmit={add}>
        <label className="field" htmlFor="ns-name">Name<input id="ns-name" name="name" required /></label>
        <label className="field" htmlFor="ns-email">Email<input id="ns-email" name="email" type="email" required /></label>
        <label className="field" htmlFor="ns-pass">Password<input id="ns-pass" name="password" type="password" minLength={10} required placeholder="10+ characters" /></label>
        <label className="field" htmlFor="ns-role">Role<select id="ns-role" name="role" defaultValue="owner"><option value="owner">Owner</option><option value="admin">Admin</option></select></label>
        <button className="btn btn-gold">Add staff</button>
      </form>
    </div>
  )
}
