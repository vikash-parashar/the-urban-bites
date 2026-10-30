import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { staffApi, type StaffOrder, type Totals } from './staffApi'
import { rupees } from './menu'
import { MButton } from './motion'
import type { Shop } from './shop'

type Go = (tab: 'walkin' | 'dashboard' | 'shop') => void

function greeting(d: Date) {
  const h = Number(d.toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// TodayStrip sits above the order board: a greeting, the live clock and today's numbers at a glance.
export function TodayStrip({ name, orders, goTo }: { name: string; orders: StaffOrder[]; goTo: Go }) {
  const [now, setNow] = useState(() => new Date())
  const [today, setToday] = useState<Totals | null>(null)
  const [shop, setShop] = useState<Shop | null>(null)

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t) }, [])
  // Refresh the numbers every minute, and whenever an order arrives or moves on.
  const sig = orders.map((o) => o.id + o.status + o.payment_status).join()
  useEffect(() => {
    let live = true
    const pull = () => {
      staffApi.dashboard('day').then((d) => { if (live) setToday(d.totals) }).catch(() => {})
      staffApi.shop().then((s) => { if (live) setShop(s) }).catch(() => {})
    }
    pull()
    const t = setInterval(pull, 60_000)
    return () => { live = false; clearInterval(t) }
  }, [sig])

  const open = orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled')
  const kitchen = open.filter((o) => o.status === 'accepted' || o.status === 'preparing').length
  const ready = open.filter((o) => o.status === 'ready' || o.status === 'out_for_delivery').length
  const unpaid = orders.filter((o) => o.payment_status !== 'paid' && o.status !== 'cancelled')
  const unpaidSum = unpaid.reduce((s, o) => s + o.total, 0)
  const first = name.trim().split(/\s+/)[0] || 'there'

  return (
    <section className="today" aria-label="Today at a glance">
      <div className="today-hi">
        <p className="eyebrow">{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</p>
        <h2 className="today-h">{greeting(now)}, {first} 👋</h2>
        <p className="menu-sub">{now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })} · here's how today is going.</p>
      </div>
      <div className="today-kpis">
        <MButton className={`kpi-tile ${shop && !shop.accepting_orders ? 'is-bad' : 'is-good'}`} onClick={() => goTo('shop')}>
          <i aria-hidden="true">{shop && !shop.accepting_orders ? '⏸️' : '🟢'}</i>
          <span>Website orders</span>
          <b>{!shop ? '…' : shop.accepting_orders ? 'Open' : 'Paused'}</b>
          <small>{!shop ? '' : shop.accepting_orders ? 'taking orders' : 'tap to open again'}</small>
        </MButton>
        <MButton className="kpi-tile" onClick={() => goTo('dashboard')}>
          <i aria-hidden="true">💰</i>
          <span>Sales today</span>
          <b>{today ? rupees(today.revenue) : '…'}</b>
          <small>{today ? `${today.orders} ${today.orders === 1 ? 'order' : 'orders'}` : ''}</small>
        </MButton>
        <div className="kpi-tile">
          <i aria-hidden="true">🔥</i>
          <span>In the kitchen</span>
          <b>{kitchen}</b>
          <small>{ready ? `${ready} ready or out` : 'none ready yet'}</small>
        </div>
        <div className={`kpi-tile ${unpaid.length ? 'is-warn' : ''}`}>
          <i aria-hidden="true">🧾</i>
          <span>Payment pending</span>
          <b>{rupees(unpaidSum)}</b>
          <small>{unpaid.length ? `${unpaid.length} ${unpaid.length === 1 ? 'order' : 'orders'}` : 'all collected'}</small>
        </div>
      </div>
    </section>
  )
}

// EmptyOrders fills the list when nothing is open, with the next useful things to do.
export function EmptyOrders({ goTo }: { goTo: Go }) {
  return (
    <div className="orders-empty">
      <motion.div className="oe-art" aria-hidden="true" animate={{ y: [0, -8, 0], rotate: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
        🍢
      </motion.div>
      <h3>All caught up</h3>
      <p className="menu-sub">No open orders right now. New ones from the website and the app show up here within 10 seconds, with a bell.</p>
      <div className="oe-actions">
        <MButton className="btn btn-gold btn-sm" onClick={() => goTo('walkin')}>🚶 Add a walk-in sale</MButton>
        <MButton className="btn btn-ghost btn-sm" onClick={() => goTo('dashboard')}>📈 Today's sales</MButton>
      </div>
    </div>
  )
}

// PickHint fills the detail side on big screens until an order is picked.
export function PickHint() {
  const steps: [string, string, string][] = [
    ['👆', 'Tap an order', 'Its items, the customer, the kitchen note and the map open here.'],
    ['⏱️', 'Set the ready time', 'From 5 to 45 minutes. The customer sees it and hears it straight away.'],
    ['✅', 'Move it along', 'Mark it ready, send it out with a rider, then mark it paid and done.'],
  ]
  return (
    <div className="pick-hint">
      <p className="eyebrow">How it works</p>
      <ol>
        {steps.map(([e, h, t], i) => (
          <motion.li key={h} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }}>
            <i aria-hidden="true">{e}</i>
            <span><b>{h}</b>{t}</span>
          </motion.li>
        ))}
      </ol>
      <p className="pick-tip">🔔 With this page open, the bell rings and the tab shows a count for every new order. Turn on 📲 alerts to get them with it closed too.</p>
    </div>
  )
}
