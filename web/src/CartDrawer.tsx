import { useEffect, useState, type FormEvent } from 'react'
import { lookup, offerPrice, unitPrice, type Cart, type CartLine } from './cart'
import { business, rupees } from './menu'
import { placeOrder, type OrderRequest, type PlacedOrder } from './api'
import { deliveryFee, distanceKm, loadMe, saveMe, type Shop } from './shop'
import Tracker from './Tracker'

interface Props {
  cart: Cart
  shop: Shop
  open: boolean
  tracking?: PlacedOrder
  pastOrders: PlacedOrder[]
  onPlaced: (o: PlacedOrder) => void
  onClose: () => void
}

type Loc = { state: 'idle' } | { state: 'busy' } | { state: 'ok'; lat: number; lng: number; km: number | null } | { state: 'error'; msg: string }

export default function CartDrawer({ cart, shop, open, tracking, pastOrders, onPlaced, onClose }: Props) {
  const [fulfilment, setFulfilment] = useState<OrderRequest['fulfilment']>('pickup')
  const [payment, setPayment] = useState<OrderRequest['payment_method']>('cash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loc, setLoc] = useState<Loc>({ state: 'idle' })
  const me = loadMe()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const delivery = fulfilment === 'delivery'
  const subtotal = cart.total
  const min = delivery ? shop.min_order_delivery : shop.min_order_pickup
  const short = Math.max(0, min - subtotal)
  const km = loc.state === 'ok' ? loc.km : null
  const tooFar = delivery && km != null && km > shop.max_delivery_km
  const fee = delivery ? deliveryFee(shop, subtotal, km) : 0
  const total = subtotal + fee
  const canOrder = shop.accepting_orders && short === 0 && !tooFar

  function locate() {
    if (!navigator.geolocation) {
      setLoc({ state: 'error', msg: "This browser can't share location. Type your address and we'll call if needed." })
      return
    }
    setLoc({ state: 'busy' })
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng } = p.coords
        const d = shop.cart_lat != null && shop.cart_lng != null ? distanceKm(shop.cart_lat, shop.cart_lng, lat, lng) : null
        setLoc({ state: 'ok', lat, lng, km: d })
      },
      () => setLoc({ state: 'error', msg: "Couldn't get your location. Type your address and we'll call if needed." }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canOrder) return
    const f = new FormData(e.currentTarget)
    const name = String(f.get('name')).trim()
    const phone = String(f.get('phone')).trim()
    setBusy(true)
    setError('')
    try {
      const lines: CartLine[] = cart.lines.map((l) => ({ ...l }))
      const placed = await placeOrder(
        {
          customer_name: name,
          customer_phone: phone,
          fulfilment,
          address: delivery ? String(f.get('address')) : undefined,
          note: String(f.get('note') || '') || undefined,
          payment_method: payment,
          items: lines.map((l) => ({ item_id: l.itemId, size: l.size, qty: l.qty })),
          ...(delivery && loc.state === 'ok' ? { lat: loc.lat, lng: loc.lng } : {}),
        },
        total,
        lines,
      )
      saveMe({ name, phone })
      onPlaced(placed)
      cart.dispatch({ type: 'clear' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const lastWithLines = pastOrders.find((o) => o.lines?.length)

  return (
    <div className={`drawer-wrap ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-head">
          <h2 id="drawer-title">{tracking ? 'Your order' : 'Your cart'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {tracking ? (
          <>
            <Tracker order={tracking} phone={me?.phone} />
            {tracking.lines?.length ? (
              <button className="btn btn-ghost" onClick={() => cart.dispatch({ type: 'fill', lines: tracking.lines! })}>Order the same again</button>
            ) : null}
            <button className="btn btn-ghost" onClick={onClose}>Back to the menu</button>
          </>
        ) : cart.count === 0 ? (
          <div className="empty">
            <p>Nothing here yet. Pick something hot from the menu.</p>
            {lastWithLines && (
              <button className="btn btn-ghost" onClick={() => cart.dispatch({ type: 'fill', lines: lastWithLines.lines! })}>
                Order again: same as #{lastWithLines.number}
              </button>
            )}
            <button className="btn btn-gold" onClick={onClose}>Browse the menu</button>
          </div>
        ) : (
          <form className="checkout" onSubmit={submit}>
            {!shop.accepting_orders && (
              <p className="notice notice-closed" role="status">
                <strong>Online orders are paused.</strong> {shop.notice || `Call ${business.phone.replace('+91', '')} or visit the cart.`}
              </p>
            )}
            <ul className="lines">
              {cart.lines.map((l) => {
                const item = lookup(l.itemId)
                if (!item) return null
                const onOffer = l.size === 'full' && offerPrice(item) != null
                return (
                  <li key={`${l.itemId}-${l.size}`}>
                    <div>
                      <strong>{item.name}</strong>
                      {(item.half != null || onOffer) && (
                        <small>{item.half != null ? `${l.size === 'full' ? 'Full' : 'Half'} plate` : ''}{onOffer ? `${item.half != null ? ' · ' : ''}Offer price` : ''}</small>
                      )}
                    </div>
                    <div className="stepper">
                      <button type="button" onClick={() => cart.dispatch({ type: 'dec', itemId: l.itemId, size: l.size })} aria-label={`Remove one ${item.name}`}>−</button>
                      <span>{l.qty}</span>
                      <button type="button" onClick={() => cart.dispatch({ type: 'add', itemId: l.itemId, size: l.size })} aria-label={`Add one ${item.name}`}>+</button>
                    </div>
                    <span className="line-total">{rupees(unitPrice(item, l.size) * l.qty)}</span>
                  </li>
                )
              })}
            </ul>

            <fieldset className="seg">
              <legend>How do you want it?</legend>
              {(['pickup', 'delivery'] as const).map((v) => (
                <label key={v} className={fulfilment === v ? 'on' : ''}>
                  <input type="radio" name="fulfilment" id={`ful-${v}`} checked={fulfilment === v} onChange={() => setFulfilment(v)} />
                  {v === 'pickup' ? 'Pick up at the cart' : 'Deliver to me'}
                </label>
              ))}
            </fieldset>

            {min > 0 && (
              <div className={`min-meter ${short === 0 ? 'met' : ''}`}>
                <div className="min-bar"><i style={{ width: `${Math.min(100, (subtotal / min) * 100)}%` }} /></div>
                <p>
                  {short > 0
                    ? <>Add <strong>{rupees(short)}</strong> more. {delivery ? 'Delivery starts' : 'Online orders start'} at {rupees(min)}.</>
                    : delivery && fee === 0
                      ? <>You get <strong>free delivery</strong> within {shop.free_delivery_km} km.</>
                      : <>Minimum reached.</>}
                </p>
              </div>
            )}

            <div className="sums">
              <div><span>Items</span><span>{rupees(subtotal)}</span></div>
              {delivery && (
                <div>
                  <span>Delivery{km != null ? ` · ${km.toFixed(1)} km` : ''}</span>
                  <span className={fee === 0 ? 'free' : ''}>{fee === 0 ? 'Free' : rupees(fee)}</span>
                </div>
              )}
              <div className="total-row"><span>Total</span><strong>{rupees(total)}</strong></div>
            </div>

            <label className="field" htmlFor="co-name">
              Name
              <input id="co-name" name="name" required autoComplete="name" defaultValue={me?.name} />
            </label>
            <label className="field" htmlFor="co-phone">
              Phone
              <input id="co-phone" name="phone" required inputMode="tel" pattern="[0-9+ ]{10,14}" autoComplete="tel" placeholder="10-digit mobile" defaultValue={me?.phone} />
              <span className="opt">Your orders count toward your Urban Regulars badge.</span>
            </label>
            {delivery && (
              <>
                <label className="field" htmlFor="co-address">
                  Delivery address
                  <textarea id="co-address" name="address" required rows={2} placeholder="House, street, landmark" />
                </label>
                <div className="locate">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={locate} disabled={loc.state === 'busy'}>
                    {loc.state === 'busy' ? 'Finding you…' : loc.state === 'ok' ? 'Location added ✓' : 'Share my location'}
                  </button>
                  <span className="opt">
                    {loc.state === 'error' ? loc.msg
                      : loc.state === 'ok' && km == null ? 'Saved. The cart will see it on your order.'
                      : `Helps the rider find you. We deliver within ${shop.max_delivery_km} km.`}
                  </span>
                </div>
                {tooFar && (
                  <p className="error" role="alert">
                    You're about {km!.toFixed(1)} km away and we deliver within {shop.max_delivery_km} km. Choose pickup, or call {business.phone.replace('+91', '')}.
                  </p>
                )}
              </>
            )}
            <label className="field" htmlFor="co-note">
              Note for the kitchen <span className="opt">optional</span>
              <input id="co-note" name="note" placeholder="Less spicy, extra chutney…" />
            </label>

            <fieldset className="seg">
              <legend>Payment</legend>
              {(['cash', 'online'] as const).map((v) => (
                <label key={v} className={payment === v ? 'on' : ''}>
                  <input type="radio" name="payment" id={`pay-${v}`} checked={payment === v} onChange={() => setPayment(v)} />
                  {v === 'cash' ? (delivery ? 'Cash on delivery' : 'Pay at the counter') : 'Pay online (UPI / card)'}
                </label>
              ))}
            </fieldset>

            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn btn-gold btn-block" disabled={busy || !canOrder}>
              {busy ? 'Sending to the kitchen…'
                : !shop.accepting_orders ? 'Online orders paused'
                : short > 0 ? `Add ${rupees(short)} more to order`
                : `Place order · ${rupees(total)}`}
            </button>
            <p className="fine">Questions? Call {business.phone.replace('+91', '')}.</p>
          </form>
        )}
      </aside>
    </div>
  )
}
