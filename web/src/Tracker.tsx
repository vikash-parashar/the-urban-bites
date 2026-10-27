import { useEffect, useState } from 'react'
import { cookingKey, say, setVoiceOn, voiceOn, type VoiceKey } from './voice'
import type { OrderStatus, PlacedOrder } from './api'
import { isPreview } from './api'
import { useNow, useTracking } from './orders'
import { rupees } from './menu'
import { fetchBadge, type Badge } from './shop'
import { BadgeResult } from './Extras'
import { BillCard, UpiPay, billFrom } from './PayBill'
import type { Shop } from './shop'
import { social } from './social'
import { MA } from './motion'
import { OrderTag, PaymentTag } from './Tags'

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

export default function Tracker({ order, phone, shop }: { order: PlacedOrder; phone?: string; shop: Shop }) {
  const { data, error, clockOffset, refresh } = useTracking(order)
  const [badge, setBadge] = useState<Badge | null>(null)
  const finished = data?.status === 'completed'
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
    if (status === 'cancelled') events.push(['cancelled', 'cancelled'])
    if (data.payment_status === 'paid' && status !== 'cancelled') events.push(['paid', 'paid'])
    const first = said.length === 0 && !fresh
    const todo = events.filter(([k]) => !said.includes(k))
    // Opening an old order later: remember its state quietly instead of reading it all out.
    if (!first) todo.slice(-2).forEach(([, key]) => say(key))
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
  const secs = Math.floor((left % 60_000) / 1000)
  const showClock = cooking && !!data?.ready_at
  const R = 52
  const C = 2 * Math.PI * R

  return (
    <div className="tracker">
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
          <PaymentTag method={data.payment_method ?? order.payment_method} paid={data.payment_status === 'paid'} ref={data.payment_ref} cancelled={status === 'cancelled'} />
        </div>
      )}

      <div className={`clock ${showClock ? '' : 'clock-idle'} status-${status}`} aria-live="polite">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="clock-track" cx="60" cy="60" r={R} />
          <circle
            className="clock-fill"
            cx="60"
            cy="60"
            r={R}
            strokeDasharray={C}
            strokeDashoffset={showClock ? C * (1 - Math.min(1, Math.max(0, progress))) : status === 'placed' ? C * 0.75 : 0}
          />
        </svg>
        <div className="clock-text">
          <span className="clock-label">{headline(status, delivery, showClock)}</span>
          {showClock && (
            <span className="clock-time">
              {left > 0 ? (
                <>
                  {mins}<small>m</small> {String(secs).padStart(2, '0')}<small>s</small>
                </>
              ) : (
                'Any moment'
              )}
            </span>
          )}
        </div>
      </div>

      {status !== 'cancelled' && (
        <ol className="steps">
          {steps.map((s) => {
            const r = rank[s.key]
            const cur = rank[status]
            return (
              <li key={s.key} className={r < cur ? 'done' : r === cur ? 'now' : ''}>
                {s.label}
              </li>
            )
          })}
        </ol>
      )}

      {data?.prep_minutes != null && cooking && (
        <p className="tracker-note">
          The owner set {data.prep_minutes} minutes for this order. This page updates on its own.
        </p>
      )}
      {shop.upi_id && data && data.status !== 'cancelled' && data.payment_status !== 'paid' && (data.payment_method ?? order.payment_method) === 'online' && (
        <UpiPay shop={shop} order={order} amount={data.total} sentRef={data.payment_ref} onSent={refresh} />
      )}
      {finished && social.googleReview && (
        <div className="tracker-review">
          <p><strong>Enjoyed it?</strong> A quick Google review helps a small cart a lot.</p>
          <MA className="btn btn-gold btn-sm" href={social.googleReview} target="_blank" rel="noopener">⭐ Rate us on Google</MA>
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
