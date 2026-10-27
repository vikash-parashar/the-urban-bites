// Colour-coded status tags shared by the customer pages and the staff area.
// Red = problem or cancelled, amber = waiting / pending, blue = in progress, green = done or paid.

export type Tone = 'danger' | 'warn' | 'info' | 'success' | 'neutral'

type Who = 'staff' | 'customer'

export function orderTag(status: string, who: Who, delivery = false): { label: string; tone: Tone } {
  switch (status) {
    case 'placed':
      return who === 'staff' ? { label: 'New order', tone: 'warn' } : { label: 'Order placed', tone: 'success' }
    case 'accepted':
      return { label: 'Accepted', tone: 'info' }
    case 'preparing':
      return { label: 'In progress · Cooking', tone: 'info' }
    case 'ready':
      return { label: delivery ? 'Packed' : 'Ready for pickup', tone: 'success' }
    case 'out_for_delivery':
      return { label: 'Out for delivery', tone: 'info' }
    case 'completed':
      return { label: delivery ? 'Completed · Delivered' : 'Completed', tone: 'success' }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'danger' }
    default:
      return { label: status, tone: 'neutral' }
  }
}

export function paymentTag(p: { method?: string; paid?: boolean; ref?: string | null; rejected?: string | null; cancelled?: boolean }): { label: string; tone: Tone } {
  const how = p.method === 'online' ? 'UPI' : 'Cash'
  if (p.paid) return { label: `Payment received · ${how}`, tone: 'success' }
  if (p.cancelled) return { label: `Not charged · ${how}`, tone: 'neutral' }
  if (p.method === 'online' && p.ref) return { label: 'UPI sent · check bank', tone: 'info' }
  if (p.method === 'online' && p.rejected) return { label: 'UPI not received', tone: 'danger' }
  return { label: `Payment pending · ${how}`, tone: 'warn' }
}

export function Tag({ label, tone, pulse = false }: { label: string; tone: Tone; pulse?: boolean }) {
  return (
    <span className={`tag tag-${tone}${pulse ? ' tag-pulse' : ''}`}>
      <i className="tag-dot" aria-hidden="true" />
      {label}
    </span>
  )
}

export function OrderTag({ status, who, delivery }: { status: string; who: Who; delivery?: boolean }) {
  const t = orderTag(status, who, delivery)
  return <Tag {...t} pulse={who === 'staff' && status === 'placed'} />
}

export function PaymentTag(p: { method?: string; paid?: boolean; ref?: string | null; rejected?: string | null; cancelled?: boolean }) {
  return <Tag {...paymentTag(p)} />
}
