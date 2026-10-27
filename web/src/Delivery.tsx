import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { staffApi, type RiderAction, type StaffAccount, type StaffOrder } from './staffApi'
import { useGuard } from './StaffExtras'
import { rupees } from './menu'
import { MA, MButton } from './motion'
import { OrderTag, PaymentTag } from './Tags'
import { say } from './voice'
import { brand } from './brand'
import type { Shop } from './shop'

type LatLng = [number, number]

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const pin = (emoji: string, cls = '') =>
  L.divIcon({ className: `map-pin ${cls}`, html: `<span><i>${emoji}</i></span>`, iconSize: [36, 36], iconAnchor: [18, 34] })

// The cart's own location, fetched once for the maps.
let shopOnce: Promise<Shop | null> | null = null
const cartShop = () => (shopOnce ??= staffApi.shop().catch(() => null))

export const gmapsDir = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`

function haversine(a: LatLng, b: LatLng) {
  const R = 6371000, rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`)

// ---------- small map on an order (owner and rider) ----------

export function CustomerMap({ lat, lng, label, onNavigate }: { lat: number; lng: number; label: string; onNavigate?: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!box.current) return
    let alive = true
    const map = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([lat, lng], 15)
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIB }).addTo(map)
    L.marker([lat, lng], { icon: pin('🏠', 'pin-home') }).addTo(map).bindTooltip(label)
    cartShop().then((shop) => {
      if (!alive || shop?.cart_lat == null || shop.cart_lng == null) return
      L.marker([shop.cart_lat, shop.cart_lng], { icon: pin('🍢', 'pin-shop') }).addTo(map).bindTooltip(brand.name)
      map.fitBounds(L.latLngBounds([[lat, lng], [shop.cart_lat, shop.cart_lng]]), { padding: [30, 30], maxZoom: 16 })
    })
    return () => { alive = false; map.remove() }
  }, [lat, lng, label])
  return (
    <div className="cust-map">
      <div ref={box} className="cust-map-box" role="img" aria-label={`Map: customer location for ${label}`} />
      <div className="cust-map-actions">
        {onNavigate && <MButton className="btn btn-gold btn-sm" onClick={onNavigate}>🧭 Navigate in app</MButton>}
        <MA className="btn btn-ghost btn-sm" href={gmapsDir(lat, lng)} target="_blank" rel="noopener">Open in Google Maps</MA>
      </div>
    </div>
  )
}

// ---------- turn-by-turn navigation ----------

interface Step { text: string; hi: string; at: LatLng; idx: number; icon: string }
interface Route { coords: LatLng[]; cum: number[]; steps: Step[]; duration: number; distance: number }

const turnWord: Record<string, [string, string, string]> = {
  left: ['Turn left', 'बाएं मुड़ो', '⬅️'], right: ['Turn right', 'दाएं मुड़ो', '➡️'],
  'slight left': ['Keep slightly left', 'हल्का बाएं', '↖️'], 'slight right': ['Keep slightly right', 'हल्का दाएं', '↗️'],
  'sharp left': ['Sharp left', 'तेज़ बाएं मुड़ो', '⬅️'], 'sharp right': ['Sharp right', 'तेज़ दाएं मुड़ो', '➡️'],
  straight: ['Go straight', 'सीधे चलो', '⬆️'], uturn: ['Make a U-turn', 'यू-टर्न लो', '↩️'],
}

function stepText(m: { type: string; modifier?: string; exit?: number }, name: string): [string, string, string] {
  const onto = name ? ` onto ${name}` : ''
  if (m.type === 'depart') return [`Head out${onto}`, 'चलना शुरू करो', '🛵']
  if (m.type === 'arrive') return ['You have arrived', 'आप पहुँच गए', '🏁']
  if (m.type === 'roundabout' || m.type === 'rotary') return [`At the roundabout take exit ${m.exit ?? 1}${onto}`, `गोल चक्कर से ${m.exit ?? 1} नंबर निकास लो`, '🔄']
  const w = turnWord[m.modifier ?? 'straight'] ?? turnWord.straight
  return [`${w[0]}${onto}`, w[1], w[2]]
}

async function fetchRoute(from: LatLng, to: LatLng): Promise<Route> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=true`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Route service is busy. Try again or open Google Maps.')
  const body = await res.json()
  const r = body.routes?.[0]
  if (!r) throw new Error('No road route found. Open Google Maps instead.')
  const coords: LatLng[] = r.geometry.coordinates.map(([x, y]: [number, number]) => [y, x])
  const cum = [0]
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]))
  const nearestIdx = (p: LatLng) => {
    let best = 0, bd = Infinity
    coords.forEach((c, i) => { const d = haversine(c, p); if (d < bd) { bd = d; best = i } })
    return best
  }
  const steps: Step[] = []
  for (const leg of r.legs) for (const s of leg.steps) {
    const at: LatLng = [s.maneuver.location[1], s.maneuver.location[0]]
    const [text, hi, icon] = stepText(s.maneuver, s.name)
    steps.push({ text, hi, at, idx: nearestIdx(at), icon })
  }
  return { coords, cum, steps, duration: r.duration, distance: r.distance }
}

function nearestOnRoute(route: Route, p: LatLng) {
  let best = 0, bd = Infinity
  route.coords.forEach((c, i) => { const d = haversine(c, p); if (d < bd) { bd = d; best = i } })
  return { idx: best, off: bd }
}

export function NavView({ order, onClose }: { order: StaffOrder; onClose: () => void }) {
  const dest: LatLng = [order.delivery_lat!, order.delivery_lng!]
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const me = useRef<L.Marker | null>(null)
  const line = useRef<L.Polyline | null>(null)
  const [pos, setPos] = useState<LatLng | null>(null)
  const [route, setRoute] = useState<Route | null>(null)
  const [err, setErr] = useState('')
  const [follow, setFollow] = useState(true)
  const [talk, setTalk] = useState(true)
  const lastRoute = useRef(0)
  const spoken = useRef<string>('')

  // Map
  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { zoomControl: false }).setView(dest, 15)
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIB }).addTo(m)
    L.marker(dest, { icon: pin('🏠', 'pin-home') }).addTo(m).bindTooltip(order.customer_name)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    m.on('dragstart', () => setFollow(false))
    map.current = m
    return () => { m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live GPS
  useEffect(() => {
    if (!navigator.geolocation) { setErr("This phone can't share its location."); return }
    const id = navigator.geolocation.watchPosition(
      (p) => { setErr(''); setPos([p.coords.latitude, p.coords.longitude]) },
      () => setErr('Turn on location (GPS) and allow it for this site to see directions.'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // Route: first fix, then again when off the route (60 m) or every 2 minutes
  const near = route && pos ? nearestOnRoute(route, pos) : null
  useEffect(() => {
    if (!pos) return
    const stale = Date.now() - lastRoute.current > 120_000
    if (route && near && near.off < 60 && !stale) return
    if (Date.now() - lastRoute.current < 8000) return
    lastRoute.current = Date.now()
    fetchRoute(pos, dest).then(setRoute).catch((e) => setErr(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos])

  // Draw
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (pos) {
      if (!me.current) me.current = L.marker(pos, { icon: pin('🛵', 'pin-me'), zIndexOffset: 1000 }).addTo(m)
      else me.current.setLatLng(pos)
      if (follow) m.setView(pos, Math.max(m.getZoom(), 16), { animate: true })
    }
    if (route) {
      line.current?.remove()
      line.current = L.polyline(route.coords, { color: '#1d4ed8', weight: 7, opacity: 0.85 }).addTo(m)
      if (!pos) m.fitBounds(line.current.getBounds(), { padding: [40, 40] })
    }
  }, [pos, route, follow])

  const idx = near?.idx ?? 0
  const next = route?.steps.find((s, i) => i > 0 && s.idx > idx) ?? route?.steps[route.steps.length - 1]
  const toNext = route && next ? Math.max(0, route.cum[next.idx] - route.cum[idx]) : 0
  const left = route ? Math.max(0, route.distance - route.cum[idx]) : pos ? haversine(pos, dest) : 0
  const mins = route ? Math.max(1, Math.round((route.duration * (left / Math.max(1, route.distance))) / 60)) : null
  const arrived = pos != null && haversine(pos, dest) < 40

  // Spoken directions in Hindi: once at ~200 m and once at ~40 m before each turn
  useEffect(() => {
    if (!talk || !next) return
    const band = arrived ? 'arrived' : toNext < 50 ? 'now' : toNext < 220 ? 'soon' : ''
    const key = `${next.idx}-${band}`
    if (!band || spoken.current === key) return
    spoken.current = key
    const synth = window.speechSynthesis
    if (!synth) return
    const text = arrived ? 'आप पहुँच गए। ग्राहक को फोन कर लो।' : band === 'now' ? `अब ${next.hi}` : `${Math.round(toNext / 10) * 10} मीटर बाद ${next.hi}`
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'hi-IN'
    synth.cancel()
    synth.speak(u)
  }, [talk, next, toNext, arrived])

  return (
    <div className="nav-view" role="dialog" aria-label={`Directions to order #${order.number}`}>
      <div ref={box} className="nav-map" />
      <div className="nav-top">
        {arrived ? (
          <div className="nav-instr arrived"><span className="nav-ico">🏁</span><div><strong>You have arrived</strong><small>Call {order.customer_name} if you can't find the door.</small></div></div>
        ) : next ? (
          <div className="nav-instr"><span className="nav-ico">{next.icon}</span><div><strong>{fmtDist(toNext)}</strong><small>{next.text}</small></div></div>
        ) : (
          <div className="nav-instr"><span className="nav-ico">🛰️</span><div><strong>{pos ? 'Finding the road route…' : 'Waiting for GPS…'}</strong><small>Keep this screen open.</small></div></div>
        )}
        {err && <p className="nav-err" role="alert">{err}</p>}
      </div>
      <div className="nav-bottom">
        <div className="nav-sum">
          <strong>{fmtDist(left)}{mins != null && ` · ${mins} min`}</strong>
          <small>#{order.number} · {order.customer_name}{order.address ? ` · ${order.address}` : ''}</small>
        </div>
        <div className="nav-actions">
          {!follow && <MButton className="btn btn-ghost btn-sm" onClick={() => setFollow(true)}>📍 Follow me</MButton>}
          <MButton className="btn btn-ghost btn-sm" onClick={() => setTalk(!talk)} aria-pressed={talk}>{talk ? '🔊 Voice' : '🔇 Voice'}</MButton>
          {order.customer_phone && <MA className="btn btn-ghost btn-sm" href={`tel:${order.customer_phone}`}>📞 Call</MA>}
          <MA className="btn btn-ghost btn-sm" href={gmapsDir(dest[0], dest[1])} target="_blank" rel="noopener">Google Maps</MA>
          <MButton className="btn btn-gold btn-sm" onClick={onClose}>Close map</MButton>
        </div>
      </div>
    </div>
  )
}

// ---------- the delivery partner's screen ----------

export function RiderBoard({ onSignedOut, meId }: { onSignedOut: () => void; meId: string }) {
  const [orders, setOrders] = useState<StaffOrder[]>([])
  const [nav, setNav] = useState<StaffOrder | null>(null)
  const [cash, setCash] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState(false)
  const seen = useRef<Map<string, string> | null>(null)
  const { error, guard } = useGuard(onSignedOut)

  const load = useCallback(async () => {
    const r = await guard(staffApi.riderOrders())
    if (!r) return
    setOrders(r.orders)
    setLoaded(true)
    const before = seen.current
    if (before) {
      const newOnes = r.orders.filter((o) => !o.rider_id && o.status !== 'completed' && !before.has(o.id))
      const nowReady = r.orders.filter((o) => o.rider_id === meId && o.status === 'ready' && before.get(o.id) !== 'ready')
      if (newOnes.length) say('rider_new_delivery', true)
      else if (nowReady.length) say('rider_order_ready', true)
    }
    seen.current = new Map(r.orders.map((o) => [o.id, o.status]))
    const open = r.orders.filter((o) => !o.rider_id && o.status !== 'completed').length
    document.title = open ? `(${open}) Delivery · ${brand.name}` : `Deliveries · ${brand.name}`
  }, [guard, meId])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [load])

  async function act(o: StaffOrder, a: RiderAction) {
    const r = await guard(staffApi.riderAction(o.id, a, !!cash[o.id]))
    if (r) {
      load()
      if (a === 'start' && r.delivery_lat != null) setNav(r)
    }
  }

  const mine = orders.filter((o) => o.rider_id === meId && o.status !== 'completed')
  const free = orders.filter((o) => !o.rider_id && o.status !== 'completed')
  const done = orders.filter((o) => o.status === 'completed')

  const card = (o: StaffOrder) => {
    const ready = o.status === 'ready'
    const out = o.status === 'out_for_delivery'
    const owe = o.payment_status !== 'paid'
    return (
      <div key={o.id} className={`rider-card ${o.rider_id ? 'is-mine' : ''}`}>
        <div className="oc-top">
          <strong>#{o.number}</strong>
          <OrderTag status={o.status} who="staff" delivery />
          <span className="oc-total">{rupees(o.total)}</span>
        </div>
        <span className="oc-tags">
          <PaymentTag method={o.payment_method} paid={!owe} ref={o.payment_ref} />
          {owe && o.payment_method === 'cash' && <span className="tag tag-warn">Collect {rupees(o.total)} cash</span>}
        </span>
        <p className="rider-who"><strong>{o.customer_name}</strong>{o.customer_city ? ` · ${o.customer_city}` : ''}<br /><span className="menu-sub">{o.address}</span></p>
        {o.delivery_km != null && <p className="menu-sub">About {o.delivery_km.toFixed(1)} km from the cart (straight line)</p>}
        <p className="oc-items">{o.items.map((l) => `${l.qty}× ${l.name}`).join(', ')}</p>
        {o.note && <p className="note">Note: {o.note}</p>}
        {o.status !== 'completed' && (
          <div className="rider-actions">
            {!o.rider_id && <MButton className="btn btn-gold" onClick={() => act(o, 'take')}>🙋 I'll deliver this</MButton>}
            {o.rider_id && !out && (
              <MButton className="btn btn-gold" onClick={() => act(o, 'start')}>{ready ? '🛵 Picked up · start trip' : '🛵 Start trip (food not marked ready)'}</MButton>
            )}
            {o.delivery_lat != null && o.delivery_lng != null && <MButton className="btn btn-ghost" onClick={() => setNav(o)}>🧭 Navigate</MButton>}
            {o.customer_phone && <MA className="btn btn-ghost" href={`tel:${o.customer_phone}`}>📞 Call</MA>}
            {out && (
              <span className="rider-deliver">
                {owe && o.payment_method === 'cash' && (
                  <label className="check"><input type="checkbox" checked={!!cash[o.id]} onChange={(e) => setCash((c) => ({ ...c, [o.id]: e.target.checked }))} /> Got {rupees(o.total)} cash</label>
                )}
                <MButton className="btn btn-ok" onClick={() => act(o, 'delivered')}>✅ Delivered</MButton>
              </span>
            )}
            {o.rider_id && !out && <MButton className="btn btn-ghost btn-sm" onClick={() => act(o, 'leave')}>Give it back</MButton>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rider">
      {nav && <NavView order={nav} onClose={() => setNav(null)} />}
      {error && <p className="error" role="alert">{error}</p>}
      <h2 className="staff-h">My deliveries</h2>
      {mine.length ? mine.map(card) : <p className="menu-sub">Nothing in your bag. Take an order below.</p>}
      <h2 className="staff-h">Waiting for a rider {free.length > 0 && <b className="tab-badge">{free.length}</b>}</h2>
      {free.length ? free.map(card) : <p className="menu-sub">{loaded ? 'No delivery orders waiting. New ones ring here within 10 seconds.' : 'Loading…'}</p>}
      {done.length > 0 && (
        <>
          <h2 className="staff-h">Delivered today</h2>
          {done.map(card)}
        </>
      )}
    </div>
  )
}

// ---------- delivery partner logins (owner and admin) ----------

export function Riders({ onSignedOut }: { onSignedOut: () => void }) {
  const [list, setList] = useState<StaffAccount[]>([])
  const [msg, setMsg] = useState('')
  const { error, guard } = useGuard(onSignedOut)
  const load = useCallback(async () => {
    const r = await guard(staffApi.riders())
    if (r) setList(r.riders)
  }, [guard])
  useEffect(() => { load() }, [load])

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const r = await guard(staffApi.createRider({ name: String(f.get('name')), email: String(f.get('email')), password: String(f.get('password')) }))
    if (r) { setMsg(`${r.name} can sign in now with that email and password. They choose their own password the first time.`); form.reset(); load() }
  }
  async function toggle(u: StaffAccount) {
    if (await guard(staffApi.updateRider(u.id, { active: !u.active }))) load()
  }
  async function reset(u: StaffAccount) {
    const pw = window.prompt(`New temporary password for ${u.name} (at least 10 characters):`)
    if (!pw) return
    if (await guard(staffApi.updateRider(u.id, { password: pw }))) { setMsg(`Done. Tell ${u.name} the new password in person or by phone.`); load() }
  }

  const sorted = useMemo(() => [...list].sort((a, b) => Number(b.active) - Number(a.active)), [list])
  return (
    <div className="riders">
      <h2 className="staff-h">Delivery partners</h2>
      <p className="menu-sub">Each rider gets their own login. They only see delivery orders, the customer's location and the map, nothing else.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {msg && <p className="upi-sent" role="status">{msg}</p>}
      {sorted.map((u) => (
        <div key={u.id} className={`me-row ${u.active ? '' : 'off'}`}>
          <span className="me-name"><strong>{u.name}</strong> {!u.active && <span className="tag tag-neutral">Switched off</span>}{u.must_change_password && <span className="tag-chip">Temporary password</span>}<br />
            <small className="menu-sub">{u.email} · {u.last_login_at ? `last in ${new Date(u.last_login_at).toLocaleString('en-IN')}` : 'never signed in'}</small></span>
          <span className="rider-acts">
            <MButton className="btn btn-ghost btn-sm" onClick={() => reset(u)}>New password</MButton>
            <MButton className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-ghost'}`} onClick={() => toggle(u)}>{u.active ? 'Switch off' : 'Switch on'}</MButton>
          </span>
        </div>
      ))}
      {list.length === 0 && <p className="menu-sub">No delivery partners yet.</p>}
      <form className="panel rider-add" onSubmit={add}>
        <h3 className="panel-h">Add a delivery partner</h3>
        <label className="field" htmlFor="rd-name">Name<input id="rd-name" name="name" required maxLength={40} placeholder="Raju" /></label>
        <label className="field" htmlFor="rd-email">Login email<input id="rd-email" name="email" type="email" required placeholder="raju@gmail.com" /></label>
        <label className="field" htmlFor="rd-pw">Temporary password<input id="rd-pw" name="password" required minLength={10} placeholder="At least 10 characters" /></label>
        <MButton className="btn btn-gold">Create login</MButton>
      </form>
    </div>
  )
}
