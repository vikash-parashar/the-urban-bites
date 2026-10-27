import { useEffect, useState } from 'react'
import { trackOrder, type PlacedOrder, type Tracking } from './api'

const KEY = 'urban-bites-orders'

function read(): PlacedOrder[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as PlacedOrder[]
  } catch {
    return []
  }
}

function write(list: PlacedOrder[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 5)))
  } catch {
    /* storage blocked: tracking lasts for this visit */
  }
}

// The customer's own recent orders, kept in this browser so they can come back to the tracker.
export function useMyOrders() {
  const [orders, setOrders] = useState<PlacedOrder[]>(read)
  const add = (o: PlacedOrder) =>
    setOrders((prev) => {
      const next = [o, ...prev.filter((p) => p.id !== o.id)]
      write(next)
      return next
    })
  const remove = (id: string) =>
    setOrders((prev) => {
      const next = prev.filter((p) => p.id !== id)
      write(next)
      return next
    })
  return { orders, latest: orders[0] as PlacedOrder | undefined, add, remove }
}

const POLL_MS = 10_000
const DONE = new Set(['completed', 'cancelled'])

// Polls the order every 10 s until it's finished. clockOffset corrects for a phone whose clock is off.
export function useTracking(order: PlacedOrder | undefined) {
  const [data, setData] = useState<Tracking | null>(null)
  const [error, setError] = useState('')
  const [clockOffset, setClockOffset] = useState(0)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!order) return
    let stop = false
    let timer = 0
    const tick = async () => {
      try {
        const t = await trackOrder(order)
        if (stop) return
        setData(t)
        setError('')
        setClockOffset(Date.parse(t.server_time) - Date.now())
        // Stop when nothing more can change: cancelled, or finished and paid.
        if (t.status === 'cancelled' || (DONE.has(t.status) && t.payment_status === 'paid')) return
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : 'Lost connection. Retrying…')
      }
      timer = window.setTimeout(tick, document.hidden ? POLL_MS * 3 : POLL_MS)
    }
    if (nonce === 0) setData(null)
    tick()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [order?.id, nonce])

  return { data, error, clockOffset, refresh: () => setNonce((n) => n + 1) }
}

// Re-renders every second while a countdown is showing.
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

const DONE_KEY = 'ub-done-orders'
function doneIds(): string[] {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) || '[]') as string[] } catch { return [] }
}

// useStillOpen says whether an order is still on its way (so the "Track it" bar is worth showing).
// It checks every 30 s and remembers finished orders, so a delivered or cancelled one never comes back.
export function useStillOpen(order: PlacedOrder | undefined) {
  const [open, setOpen] = useState<boolean | null>(null)
  useEffect(() => {
    setOpen(null)
    if (!order) return
    if (doneIds().includes(order.id)) { setOpen(false); return }
    let stop = false
    let timer = 0
    const tick = async () => {
      try {
        const t = await trackOrder(order)
        if (stop) return
        if (DONE.has(t.status)) {
          setOpen(false)
          try { localStorage.setItem(DONE_KEY, JSON.stringify([order.id, ...doneIds()].slice(0, 20))) } catch { /* blocked */ }
          return
        }
        setOpen(true)
      } catch {
        if (!stop) setOpen((o) => o ?? true) // offline: keep the bar so they can still open the tracker
      }
      timer = window.setTimeout(tick, 30_000)
    }
    tick()
    return () => { stop = true; clearTimeout(timer) }
  }, [order?.id])
  return open === true
}
