import type { CartLine } from './cart'
import type { Category } from './menu'

// The Go API (see /api). Unset in the design preview, where orders stay in this browser.
const API_URL = import.meta.env.VITE_API_URL as string | undefined
export const isPreview = !API_URL

export interface OrderRequest {
  customer_name: string
  customer_phone: string
  customer_email?: string
  customer_city?: string
  fulfilment: 'delivery' | 'pickup'
  address?: string
  note?: string
  payment_method: 'online' | 'cash'
  items: { item_id: string; size: CartLine['size']; qty: number }[]
  lat?: number
  lng?: number
}

export interface PlacedOrder {
  id: string
  number: number
  track_token: string
  total: number
  subtotal?: number
  delivery_fee?: number
  fulfilment: OrderRequest['fulfilment']
  placed_at: string
  // Kept in this browser for "order again".
  lines?: CartLine[]
  payment_method?: OrderRequest['payment_method']
  customer_name?: string
}

export type OrderStatus = 'placed' | 'accepted' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled'

export interface Tracking {
  number: number
  status: OrderStatus
  fulfilment: OrderRequest['fulfilment']
  subtotal?: number
  delivery_fee?: number
  total: number
  prep_minutes: number | null
  ready_at: string | null
  server_time: string
  items: { name: string; size: string; qty: number; unit_price: number }[]
  customer_name?: string
  created_at?: string
  payment_method?: 'online' | 'cash'
  payment_status?: 'pending' | 'paid'
  payment_ref?: string | null
}

// sendPaymentRef passes the UPI reference (UTR) the customer got after paying, so the owner can match it.
export async function sendPaymentRef(o: PlacedOrder, ref: string): Promise<void> {
  const clean = ref.replace(/\s/g, '').toUpperCase()
  if (!API_URL) {
    try {
      localStorage.setItem(`urban-bites-ref-${o.id}`, clean)
    } catch {
      /* storage blocked */
    }
    return
  }
  const res = await fetch(`${API_URL}/v1/orders/${o.id}/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: o.track_token, ref: clean }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ? sentence(body.error) : `Couldn't send the reference (error ${res.status}).`)
  }
}

export async function fetchMenu(): Promise<Category[] | null> {
  if (!API_URL) return null
  const res = await fetch(`${API_URL}/v1/menu`)
  if (!res.ok) return null
  return ((await res.json()) as { categories: Category[] }).categories
}

export const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`)

export async function placeOrder(req: OrderRequest, cartTotal: number, lines: CartLine[]): Promise<PlacedOrder> {
  const placed_at = new Date().toISOString()
  if (!API_URL) {
    return { id: `preview-${Date.now()}`, number: 1000 + Math.floor(Math.random() * 900), track_token: '', total: cartTotal, fulfilment: req.fulfilment, placed_at, lines, payment_method: req.payment_method, customer_name: req.customer_name }
  }
  const res = await fetch(`${API_URL}/v1/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ? sentence(body.error) : `The kitchen didn't get your order (error ${res.status}). Try again or call us.`)
  return { ...(body as Omit<PlacedOrder, 'fulfilment' | 'placed_at'>), fulfilment: req.fulfilment, placed_at, lines, payment_method: req.payment_method, customer_name: req.customer_name }
}

// uploadVoiceNote sends the kitchen voice note recorded at checkout. A failure doesn't undo the order.
export async function uploadVoiceNote(o: PlacedOrder, note: Blob): Promise<void> {
  if (!API_URL) return
  const res = await fetch(`${API_URL}/v1/orders/${o.id}/voice?t=${o.track_token}`, {
    method: 'POST',
    headers: { 'Content-Type': note.type || 'audio/webm' },
    body: note,
  })
  if (!res.ok) throw new Error("Your order is placed, but the voice note didn't send. Type the note or call us.")
}

export async function trackOrder(o: PlacedOrder): Promise<Tracking> {
  if (!API_URL) return previewTracking(o)
  const res = await fetch(`${API_URL}/v1/orders/${o.id}?t=${o.track_token}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Couldn't load your order (error ${res.status}).`)
  return (await res.json()) as Tracking
}

// Preview only: plays a sample timeline so the tracker can be seen without the API.
// The kitchen "accepts" after 8 s with 15 minutes, and it counts down from there.
function previewTracking(o: PlacedOrder): Tracking {
  const now = Date.now()
  const placed = Date.parse(o.placed_at)
  const accepted = placed + 8_000
  const readyAt = accepted + 15 * 60_000
  let status: OrderStatus = 'placed'
  if (now >= accepted) status = 'preparing'
  if (now >= readyAt) status = 'ready'
  return {
    number: o.number,
    status,
    fulfilment: o.fulfilment,
    total: o.total,
    prep_minutes: now >= accepted ? 15 : null,
    ready_at: now >= accepted ? new Date(readyAt).toISOString() : null,
    server_time: new Date(now).toISOString(),
    items: [],
    customer_name: o.customer_name,
    created_at: o.placed_at,
    payment_method: o.payment_method ?? 'cash',
    payment_status: 'pending',
    payment_ref: (() => {
      try {
        return localStorage.getItem(`urban-bites-ref-${o.id}`)
      } catch {
        return null
      }
    })(),
  }
}

export interface FavItem { item_id: string; name: string; size: 'full' | 'half'; qty: number; times: number }
export interface Favourites { orders: number; items: FavItem[] }

// The dishes this customer orders most, from all their orders with the same phone number
// (website, app and at the cart). Needs a saved order's tracking token.
export async function fetchFavourites(o: PlacedOrder): Promise<Favourites | null> {
  if (!API_URL) return null
  const res = await fetch(`${API_URL}/v1/orders/${o.id}/favourites?t=${o.track_token}`, { cache: 'no-store' })
  if (!res.ok) return null
  return (await res.json()) as Favourites
}
