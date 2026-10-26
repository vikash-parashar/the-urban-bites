import { useEffect, useState, type FormEvent } from 'react'
import { lookup, offerPrice, unitPrice, type Cart, type CartLine } from './cart'
import { business, rupees } from './menu'
import { placeOrder, type OrderRequest, type PlacedOrder } from './api'
import { deliveryFee, distanceKm, loadMe, saveMe, type Shop } from './shop'
import Tracker from './Tracker'
import { checkAddress, checkFirstName, checkLastName, checkMobile, cleanMobile, cleanName, itemKind, tenDigits } from './kit'
import { MButton } from './motion'

interface Props {
  cart: Cart
  shop: Shop
  open: boolean
  tracking?: PlacedOrder
  pastOrders: PlacedOrder[]
  onPlaced: (o: PlacedOrder) => void
  onShowCart: () => void
  onClose: () => void
}

type Loc = { state: 'idle' } | { state: 'busy' } | { state: 'ok'; lat: number; lng: number; km: number | null } | { state: 'error'; msg: string }

export default function CartDrawer({ cart, shop, open, tracking, pastOrders, onPlaced, onShowCart, onClose }: Props) {
  const [fulfilment, setFulfilment] = useState<OrderRequest['fulfilment']>('pickup')
  // Which payment methods the admin has switched on (UPI also needs a saved UPI ID). Older API: cash + UPI if an ID is set.
  const methods = ([
    shop.accept_cash !== false && 'cash',
    shop.accept_upi !== false && shop.upi_id && 'online',
  ].filter(Boolean) as OrderRequest['payment_method'][])
  const payOptions: OrderRequest['payment_method'][] = methods.length ? methods : ['cash']
  const [picked, setPayment] = useState<OrderRequest['payment_method']>('cash')
  const payment = payOptions.includes(picked) ? picked : payOptions[0]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loc, setLoc] = useState<Loc>({ state: 'idle' })
  const me = loadMe()
  const [first, setFirst] = useState(me?.first ?? me?.name?.split(' ')[0] ?? '')
  const [last, setLast] = useState(me?.last ?? me?.name?.split(' ').slice(1).join(' ') ?? '')
  const [mobile, setMobile] = useState(tenDigits(me?.phone))
  const [address, setAddress] = useState(me?.address ?? '')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }))
  const errs = {
    first: checkFirstName(first),
    last: checkLastName(last),
    mobile: checkMobile(mobile),
    address: fulfilment === 'delivery' ? checkAddress(address) : '',
  }
  const show = (k: keyof typeof errs) => (touched[k] ? errs[k] : '')

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
    if (Object.values(errs).some(Boolean)) {
      setTouched({ first: true, last: true, mobile: true, address: true })
      setError('Please fix the highlighted fields.')
      return
    }
    const f = new FormData(e.currentTarget)
    const name = [first.trim(), last.trim()].filter(Boolean).join(' ')
    const phone = `+91${mobile}`
    setBusy(true)
    setError('')
    try {
      const lines: CartLine[] = cart.lines.map((l) => ({ ...l }))
      const placed = await placeOrder(
        {
          customer_name: name,
          customer_phone: phone,
          fulfilment,
          address: delivery ? address.trim() : undefined,
          note: String(f.get('note') || '') || undefined,
          payment_method: payment,
          items: lines.map((l) => ({ item_id: l.itemId, size: l.size, qty: l.qty })),
          ...(delivery && loc.state === 'ok' ? { lat: loc.lat, lng: loc.lng } : {}),
        },
        total,
        lines,
      )
      saveMe({ name, phone, first: first.trim(), last: last.trim(), address: address.trim() || undefined })
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
          <MButton className="icon-btn" onClick={onClose} aria-label="Close">✕</MButton>
        </div>

        {tracking ? (
          <>
            <Tracker order={tracking} phone={me?.phone} shop={shop} />
            {tracking.lines?.length ? (
              <MButton className="btn btn-ghost" onClick={() => { cart.dispatch({ type: 'fill', lines: tracking.lines! }); onShowCart() }}>Order the same again</MButton>
            ) : null}
            <MButton className="btn btn-ghost" onClick={onClose}>Back to the menu</MButton>
          </>
        ) : cart.count === 0 ? (
          <div className="empty">
            <p>Nothing here yet. Pick something hot from the menu.</p>
            {lastWithLines && (
              <MButton className="btn btn-ghost" onClick={() => cart.dispatch({ type: 'fill', lines: lastWithLines.lines! })}>
                Order again: same as #{lastWithLines.number}
              </MButton>
            )}
            <MButton className="btn btn-gold" onClick={onClose}>Browse the menu</MButton>
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
                    <span className="line-emoji" aria-hidden="true">{itemKind(item.name).emoji}</span>
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

            <div className="field-row">
              <label className="field" htmlFor="co-first">
                First name *
                <input id="co-first" required autoComplete="given-name" value={first} maxLength={28}
                  onChange={(e) => setFirst(cleanName(e.target.value))} onBlur={() => touch('first')} aria-invalid={!!show('first')} aria-describedby="co-first-err" />
                {show('first') && <span className="field-err" id="co-first-err">{show('first')}</span>}
              </label>
              <label className="field" htmlFor="co-last">
                Last name
                <input id="co-last" autoComplete="family-name" value={last} maxLength={28}
                  onChange={(e) => setLast(cleanName(e.target.value))} onBlur={() => touch('last')} aria-invalid={!!show('last')} />
                {show('last') && <span className="field-err">{show('last')}</span>}
              </label>
            </div>
            <label className="field" htmlFor="co-phone">
              Mobile number *
              <span className={`phone-in ${show('mobile') ? 'bad' : ''}`}>
                <span className="cc" aria-hidden="true">🇮🇳 +91</span>
                <input id="co-phone" required inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={mobile} maxLength={10}
                  onChange={(e) => setMobile(cleanMobile(e.target.value))} onBlur={() => touch('mobile')} aria-invalid={!!show('mobile')} aria-describedby="co-phone-help" />
                <span className="count" aria-hidden="true">{mobile.length}/10</span>
              </span>
              {show('mobile') ? <span className="field-err">{show('mobile')}</span>
                : <span className="opt" id="co-phone-help">Your bill and order updates come to this number. Orders count toward your Urban Regulars badge.</span>}
            </label>
            {delivery && (
              <>
                <label className="field" htmlFor="co-address">
                  Delivery address *
                  <textarea id="co-address" required rows={2} maxLength={200} placeholder="House no., street, village, landmark" value={address}
                    onChange={(e) => setAddress(e.target.value)} onBlur={() => touch('address')} aria-invalid={!!show('address')} />
                  {show('address') && <span className="field-err">{show('address')}</span>}
                </label>
                <div className="locate">
                  <MButton type="button" className="btn btn-ghost btn-sm" onClick={locate} disabled={loc.state === 'busy'}>
                    {loc.state === 'busy' ? 'Finding you…' : loc.state === 'ok' ? 'Location added ✓' : 'Share my location'}
                  </MButton>
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
              <input id="co-note" name="note" maxLength={120} placeholder="Less spicy, extra chutney…" />
            </label>

            <fieldset className="seg">
              <legend>Payment</legend>
              {payOptions.map((v) => (
                <label key={v} className={payment === v ? 'on' : ''}>
                  <input type="radio" name="payment" id={`pay-${v}`} checked={payment === v} onChange={() => setPayment(v)} />
                  <span className="pay-emoji" aria-hidden="true">{v === 'cash' ? '💵' : '📲'}</span>
                  <span className="pay-text">
                    {v === 'cash' ? (delivery ? 'Cash on delivery' : 'Cash at the counter') : 'UPI'}
                    <small>{v === 'cash' ? (delivery ? 'Pay when your food arrives' : 'Pay when you pick it up') : 'Google Pay · PhonePe · Paytm'}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            {error && <p className="error" role="alert">{error}</p>}
            <MButton className="btn btn-gold btn-block" disabled={busy || !canOrder}>
              {busy ? 'Sending to the kitchen…'
                : !shop.accepting_orders ? 'Online orders paused'
                : short > 0 ? `Add ${rupees(short)} more to order`
                : `Place order · ${rupees(total)}`}
            </MButton>
            <p className="fine">Questions? Call {business.phone.replace('+91', '')}.</p>
          </form>
        )}
      </aside>
    </div>
  )
}
