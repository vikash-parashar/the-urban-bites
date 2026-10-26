import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { trackOrder, type PlacedOrder, type Tracking } from './api'
import { lookup } from './cart'
import { rupees } from './menu'
import { MButton, Stagger, StaggerItem, lift } from './motion'
import { OrderTag, PaymentTag } from './Tags'

// The customer's recent orders (kept in this browser), each with its live status and a Track button.
export default function MyOrders({ orders, onOpen }: { orders: PlacedOrder[]; onOpen: (o: PlacedOrder) => void }) {
  const [info, setInfo] = useState<Record<string, Tracking>>({})
  const ids = orders.map((o) => o.id).join(',')

  useEffect(() => {
    let stop = false
    orders.forEach((o) =>
      trackOrder(o)
        .then((t) => !stop && setInfo((m) => ({ ...m, [o.id]: t })))
        .catch(() => {}),
    )
    return () => {
      stop = true
    }
  }, [ids])

  if (!orders.length) return null
  return (
    <section className="my-orders" id="my-orders" aria-labelledby="my-orders-title">
      <p className="eyebrow">Placed from this phone</p>
      <h2 id="my-orders-title">Your orders</h2>
      <Stagger className="my-orders-list">
        {orders.map((o) => {
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
              <motion.div className="my-order" {...lift}>
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
                    {t && <PaymentTag method={t.payment_method ?? o.payment_method} paid={paid} ref={t.payment_ref} cancelled={status === 'cancelled'} />}
                  </span>
                  <MButton className="btn btn-gold btn-sm" onClick={() => onOpen(o)}>
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
