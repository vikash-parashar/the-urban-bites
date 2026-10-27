import { useState } from 'react'
import { motion } from 'motion/react'
import type { PlacedOrder, Tracking } from './api'
import { lookup } from './cart'
import { rupees } from './menu'
import { MButton, Stagger, StaggerItem, lift } from './motion'
import { OrderTag, PaymentTag } from './Tags'

type Statuses = { info: Record<string, Tracking>; open: PlacedOrder[]; completed: PlacedOrder[]; cancelled: PlacedOrder[] }
type Filter = 'open' | 'completed' | 'cancelled' | 'all'

// The customer's recent orders (kept in this browser): how many are still on the way and how many are
// done, then each order with its live status. Tap any order to open its tracker.
export default function MyOrders({ orders, status, onOpen }: { orders: PlacedOrder[]; status: Statuses; onOpen: (o: PlacedOrder) => void }) {
  const { info } = status
  const [pick, setPick] = useState<Filter | null>(null)
  // Default: show what's in progress when there is any, else everything.
  const filter: Filter = pick ?? (status.open.length ? 'open' : 'all')
  const shown = filter === 'all' ? orders : status[filter]
  const chips: [Filter, string, number][] = [
    ['open', '🔥 In progress', status.open.length],
    ['completed', '✅ Completed', status.completed.length],
    ['cancelled', '✖ Cancelled', status.cancelled.length],
    ['all', 'All', orders.length],
  ]

  if (!orders.length) return null
  return (
    <section className="my-orders" id="my-orders" aria-labelledby="my-orders-title">
      <p className="eyebrow">Placed from this phone</p>
      <h2 id="my-orders-title">Your orders</h2>
      <div className="my-orders-chips" role="tablist" aria-label="Show orders">
        {chips.filter(([id, , n]) => n > 0 || id === 'open' || id === 'all').map(([id, label, n]) => (
          <MButton key={id} role="tab" aria-selected={filter === id} className={`mo-chip ${filter === id ? 'is-on' : ''}`} onClick={() => setPick(id)}>
            {label} <b>{n}</b>
          </MButton>
        ))}
      </div>
      {shown.length === 0 && <p className="menu-sub">{filter === 'open' ? 'Nothing on the way right now. All your orders are done.' : 'No orders here.'}</p>}
      <Stagger className="my-orders-list" key={filter}>
        {shown.map((o) => {
          const t = info[o.id]
          const items = t?.items?.length
            ? t.items.map((i) => `${i.qty} × ${i.name}`)
            : (o.lines ?? []).flatMap((l) => {
                const it = lookup(l.itemId)
                return it ? [`${l.qty} × ${it.name}`] : []
              })
          const status = t?.status
          const paid = t?.payment_status === 'paid'
          return (
            <StaggerItem key={o.id}>
              <motion.div className={`my-order ${status && status !== 'completed' && status !== 'cancelled' ? 'is-live' : ''}`} {...lift}
                role="button" tabIndex={0} onClick={() => onOpen(o)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(o) }}>
                <div className="my-order-top">
                  <strong>Order #{o.number}</strong>
                  {status && <OrderTag status={status} who="customer" delivery={o.fulfilment === 'delivery'} />}
                </div>
                <p className="my-order-when">
                  {new Date(o.placed_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {o.fulfilment === 'delivery' ? '🛵 Delivery' : '🏃 Pickup'}
                </p>
                {items.length > 0 && <p className="my-order-items">{items.join(', ')}</p>}
                <div className="my-order-bottom">
                  <span className="my-order-pay">
                    <b>{rupees(t?.total ?? o.total)}</b>
                    {t && <PaymentTag method={t.payment_method ?? o.payment_method} paid={paid} ref={t.payment_ref} rejected={t.payment_rejected_ref} cancelled={status === 'cancelled'} />}
                  </span>
                  <MButton className="btn btn-gold btn-sm" onClick={(e) => { e.stopPropagation(); onOpen(o) }}>
                    {status === 'completed' || status === 'cancelled' ? 'View' : 'Track'}
                  </MButton>
                </div>
              </motion.div>
            </StaggerItem>
          )
        })}
      </Stagger>
    </section>
  )
}
