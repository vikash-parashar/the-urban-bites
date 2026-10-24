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
        if (DONE.has(t.status)) return
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : 'Lost connection. Retrying…')
      }
      timer = window.setTimeout(tick, document.hidden ? POLL_MS * 3 : POLL_MS)
    }
    setData(null)
    tick()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [order?.id])

  return { data, error, clockOffset }
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
