import { useEffect, useState } from 'react'
import { cookingKey, firstName, say, sayText, setVoiceOn, spokenNumber, voiceOn, type VoiceKey } from './voice'
import { play } from './sounds'
import type { OrderStatus, PlacedOrder } from './api'
import { isPreview, cancelOrder, registerOrderPush } from './api'
import { onPushToken } from './push'
import { useNow, useTracking } from './orders'
import { rupees } from './menu'
import { fetchBadge, type Badge } from './shop'
import { BadgeResult } from './Extras'
import { BillCard, PayBillBox, billFrom } from './PayBill'
import type { Shop } from './shop'
import { social } from './social'
import { MA, MButton } from './motion'
import { brand } from './brand'
import { OrderTag, PaymentTag } from './Tags'
import Celebrate from './Celebrate'
import OrderScene, { sceneFor } from './OrderScene'

const pickupSteps: { key: OrderStatus; label: string }[] = [
  { key: 'placed', label: 'Order received' },
  { key: 'preparing', label: 'Cooking' },
  { key: 'ready', label: 'Ready to pick up' },
  { key: 'completed', label: 'Collected' },
]
const deliverySteps: { key: OrderStatus; label: string }[] = [
  { key: 'placed', label: 'Order received' },
  { key: 'preparing', label: 'Cooking' },
  { key: 'out_for_delivery', label: 'On the way' },
  { key: 'completed', label: 'Delivered' },
]
const rank: Record<OrderStatus, number> = {
  placed: 0, accepted: 1, preparing: 1, ready: 2, out_for_delivery: 2, completed: 3, cancelled: -1,
}

function headline(status: OrderStatus, delivery: boolean, hasTime: boolean) {
  switch (status) {
    case 'placed':
      return 'Waiting for the kitchen to confirm'
    case 'accepted':
    case 'preparing':
      return hasTime ? (delivery ? 'Ready to send in' : 'Ready in') : 'The kitchen is on it'
    case 'ready':
      return delivery ? 'Packed and ready to leave' : 'Ready! Come pick it up'
    case 'out_for_delivery':
      return 'On the way to you'
    case 'completed':
      return delivery ? 'Delivered. Enjoy!' : 'Collected. Enjoy!'
    case 'cancelled':
      return 'This order was cancelled'
  }
}

// CancelBox: the customer can cancel only while the order waits for the owner. Once the owner sets
// the cooking time the food is being made, so the page says to call the cart instead.
function CancelBox({ order, status, prep, by, paidOnline, phone, onDone }: { order: PlacedOrder; status: string; prep: number | null; by?: string | null; paidOnline: boolean; phone?: string; onDone: () => void }) {
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (status === 'cancelled') {
    return <p className="tracker-note cancel-note">{by === 'customer' ? 'You cancelled this order.' : 'The cart cancelled this order.'}{paidOnline ? ' If you already paid by UPI, the owner will send the money back.' : ''}{phone ? ` Questions? Call ${phone}.` : ''}</p>
  }
  if (status !== 'placed' || prep != null) {
    if (status === 'completed') return null
    return <p className="tracker-note cancel-note">The cart has started making your food, so the order can't be cancelled now.{phone ? ` Something wrong? Call ${phone}.` : ''}</p>
  }
  async function go() {
    setBusy(true); setErr('')
    try { await cancelOrder(order); onDone() } catch (e) { setErr(e instanceof Error ? e.message : 'Could not cancel.'); setAsk(false) } finally { setBusy(false) }
  }
  return (
    <div className="cancel-box">
      {!ask ? (
        <>
          <p className="tracker-note">Changed your mind? You can cancel until the cart starts cooking.</p>
          <MButton type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk(true)}>Cancel order</MButton>
        </>
      ) : (
        <span className="confirm">Cancel order #{order.number}?{paidOnline ? ' If you already paid by UPI, the owner will send it back.' : ''}
          <MButton type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={go}>{busy ? 'Cancelling…' : 'Yes, cancel'}</MButton>
          <MButton type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk(false)}>Keep it</MButton>
        </span>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  )
}

export default function Tracker({ order, phone, shop }: { order: PlacedOrder; phone?: string; shop: Shop }) {
  const { data, error, clockOffset, refresh } = useTracking(order)
  const [badge, setBadge] = useState<Badge | null>(null)
  const finished = data?.status === 'completed'
  const { id: orderId, track_token: trackToken } = order
  useEffect(() => onPushToken((t) => { registerOrderPush({ id: orderId, track_token: trackToken }, t).catch(() => {}) }), [orderId, trackToken])
  useEffect(() => {
    if (!phone) return
    fetchBadge(phone, finished ? 1 : 0).then(setBadge).catch(() => {})
  }, [phone, finished])
  const status = data?.status ?? 'placed'
  const cooking = status === 'accepted' || status === 'preparing'
  const delivery0 = order.fulfilment === 'delivery'
  const [voice, setVoice] = useState(voiceOn)
  // Speak each new update once per order (remembered for this tab so a reload doesn't repeat it).
  useEffect(() => {
    if (!data) return
    const memo = `ub-said-${order.id}`
    let said: string[] = []
    try { said = JSON.parse(sessionStorage.getItem(memo) || '[]') } catch { /* blocked */ }
    const fresh = Date.now() - Date.parse(order.placed_at) < 3 * 60_000
    const events: [string, VoiceKey][] = []
    if (status === 'placed' && fresh) events.push(['placed', 'placed'])
    if (cooking) events.push([`cook-${data.prep_minutes ?? ''}`, cookingKey(data.prep_minutes)])
    if (status === 'ready') events.push(['ready', delivery0 ? 'ready_delivery' : 'ready_pickup'])
    if (status === 'out_for_delivery') events.push(['out', 'on_the_way'])
    if (status === 'completed') events.push(['done', delivery0 ? 'delivered' : 'collected'])
    // The customer cancelled it themselves: "koi baat na ji, man badalna thara haq sai". The cart cancelled it: "maaf kariyo ji".
    if (status === 'cancelled') events.push(['cancelled', data.cancelled_by === 'customer' ? 'cart_empty' : 'cancelled'])
    if (data.payment_rejected_ref && !data.payment_ref && data.payment_status !== 'paid' && status !== 'cancelled') events.push([`norecv-${data.payment_rejected_ref}`, 'payment_rejected'])
    if (data.payment_status === 'paid' && status !== 'cancelled') events.push(['paid', 'paid'])
    const first = said.length === 0 && !fresh
    const todo = events.filter(([k]) => !said.includes(k))
    // Opening an old order later: remember its state quietly instead of reading it all out.
    if (!first) {
      todo.slice(-2).forEach(([, key]) => say(key))
      // Then the customer's own order number, like a counter calling it out. Ready gets a ding and a buzz first.
      const n = spokenNumber(order.number)
      const last = todo[todo.length - 1]?.[0]
      if (last === 'ready') {
        play('kitchen', 'loud'); try { navigator.vibrate?.([300, 150, 300]) } catch { /* not supported */ }
        sayText(`ऑर्डर नंबर ${n}, ${firstName(order.customer_name)} जी, थारा ऑर्डर तैयार सै!`)
      } else if (last === 'placed') sayText(`थारा ऑर्डर नंबर ${n} सै जी।`)
      else if (last === 'out') { play('kitchen', 'normal'); sayText(`ऑर्डर नंबर ${n} रास्ते में सै।`) }
    }
    try { sessionStorage.setItem(memo, JSON.stringify([...said, ...todo.map(([k]) => k)])) } catch { /* blocked */ }
  }, [data, status, cooking, delivery0, order.id, order.placed_at])
  const now = useNow(cooking && !!data?.ready_at) + clockOffset
  const delivery = order.fulfilment === 'delivery'
  const steps = delivery ? deliverySteps : pickupSteps

  let left = 0
  let progress = 0
  if (data?.ready_at && data.prep_minutes) {
    const readyAt = Date.parse(data.ready_at)
    const total = data.prep_minutes * 60_000
    left = Math.max(0, readyAt - now)
    progress = 1 - left / total
  }
  const mins = Math.floor(left / 60_000)
  // The countdown ran out but the food isn't ready yet: a gentle, funny "patience" once per order.
  const overdue = cooking && !!data?.ready_at && left === 0 && !!data?.prep_minutes
  useEffect(() => {
    if (!overdue) return
    const k = `ub-wait-${order.id}`
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1') } catch { /* blocked */ }
    say('cooking_wait')
  }, [overdue, order.id])
  const secs = Math.floor((left % 60_000) / 1000)
  const showClock = cooking && !!data?.ready_at
  const paid = data?.payment_status === 'paid'
  // Colour of the whole tracker: yellow while it's with the kitchen, blue once it's ready or on
  // the way (or delivered but still unpaid), green when delivered and paid, red when cancelled.
  const tone = status === 'cancelled' ? 'red'
    : status === 'completed' && paid ? 'green'
    : status === 'completed' || status === 'ready' || status === 'out_for_delivery' ? 'blue'
    : 'yellow'
  const success = status === 'completed' && paid

  return (
    <div className={`tracker tone-${tone}`}>
      {success && <Celebrate id={order.id} />}
      <p className="tracker-no">
        Order #{order.number} · {rupees(data?.total ?? order.total)}
        {order.fulfilment === 'delivery' && (data?.delivery_fee ?? order.delivery_fee) === 0 && <span className="free"> · Free delivery</span>}
      </p>
      <button type="button" className={`voice-toggle ${voice ? '' : 'is-off'}`} aria-pressed={voice}
        onClick={() => { setVoiceOn(!voice); setVoice(!voice) }}>
        {voice ? '🔊 Voice updates on' : '🔇 Voice updates off'}
      </button>
      {data && (
        <div className="tracker-tags">
          <OrderTag status={status} who="customer" delivery={delivery} />
          <PaymentTag method={data.payment_method ?? order.payment_method} paid={data.payment_status === 'paid'} ref={data.payment_ref} rejected={data.payment_rejected_ref} cancelled={status === 'cancelled'} />
        </div>
      )}

      <OrderScene
        scene={sceneFor(status, { overdue, paused: status === 'placed' && !shop.accepting_orders })}
        label={headline(status, delivery, showClock)}
        progress={showClock ? progress : undefined}
        items={(data?.items ?? []).map((l) => `${l.qty}× ${l.name}`)}
        time={showClock ? (left > 0 ? <>{mins}<small>m</small> {String(secs).padStart(2, '0')}<small>s</small></> : 'Any moment') : undefined}
      />

      {status !== 'cancelled' ? (
        <ol className="steps">
          {steps.map((s) => {
            const r = rank[s.key]
            const cur = rank[status]
            // The last step counts as done once the order is finished, so the line runs top to bottom.
            const done = r < cur || status === 'completed'
            return (
              <li key={s.key} className={done ? 'done' : r === cur ? 'now' : ''}>
                {s.label}
                {status === 'completed' && s.key === 'completed' && !paid && <small className="step-sub"> · payment pending</small>}
              </li>
            )
          })}
        </ol>
      ) : (
        <ol className="steps">
          <li className="done">Order received</li>
          <li className="now">Cancelled</li>
        </ol>
      )}

      {data && <CancelBox order={order} status={status} prep={data.prep_minutes} by={data.cancelled_by} paidOnline={!!data.payment_ref || data.payment_status === 'paid'} phone={brand.phone_display} onDone={refresh} />}
      {data?.prep_minutes != null && cooking && (
        <p className="tracker-note">
          The owner set {data.prep_minutes} minutes for this order. This page updates on its own.
        </p>
      )}
      {data && data.status !== 'cancelled' && data.payment_status !== 'paid' && (
        <PayBillBox shop={shop} order={order} data={data} onChange={refresh} />
      )}
      {data && data.payment_status === 'paid' && data.status !== 'cancelled' && (
        <p className="paybox-paid" role="status">✅ Bill paid · {rupees(data.total)} {(data.payment_method ?? order.payment_method) === 'online' ? 'by UPI' : 'in cash'}. Thank you!</p>
      )}
      {finished && social.googleReview && (
        <div className="tracker-review">
          <p><strong>Enjoyed it?</strong> A quick Google review helps a small cart a lot.</p>
          <MA className="btn btn-gold btn-sm" href={social.googleReview} target="_blank" rel="noopener">⭐ Rate us on Google</MA>
          {social.instagram && <MA className="btn btn-ghost btn-sm" href={social.instagram} target="_blank" rel="noopener">📸 Follow on Instagram</MA>}
        </div>
      )}
      {data?.payment_status === 'paid' && <p className="upi-paid">✅ Payment received{data.payment_ref ? ` · UPI ref ${data.payment_ref}` : ''}</p>}
      <BillCard bill={billFrom(order, data)} phone={phone} />
      {badge && (
        <div className="tracker-badge">
          <p className="eyebrow">Urban Regulars</p>
          <BadgeResult b={badge} />
          {!finished && <p className="opt">This order counts once it's {order.fulfilment === 'delivery' ? 'delivered' : 'collected'}.</p>}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {isPreview && (
        <p className="tracker-note preview-note">
          Preview: this timing is a sample. On the live site it's the time the owner taps in the app.
        </p>
      )}
    </div>
  )
}

