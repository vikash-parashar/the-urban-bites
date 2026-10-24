import { useEffect, useReducer } from 'react'
import { categories, type Category, type MenuItem, type Size } from './menu'

export interface CartLine {
  itemId: string
  size: Size
  qty: number
}

type Action =
  | { type: 'add'; itemId: string; size: Size }
  | { type: 'dec'; itemId: string; size: Size }
  | { type: 'clear' }
  | { type: 'fill'; lines: CartLine[] }

const STORAGE_KEY = 'urban-bites-cart'

function reducer(lines: CartLine[], a: Action): CartLine[] {
  switch (a.type) {
    case 'add': {
      const hit = lines.find((l) => l.itemId === a.itemId && l.size === a.size)
      if (hit) return lines.map((l) => (l === hit ? { ...l, qty: l.qty + 1 } : l))
      return [...lines, { itemId: a.itemId, size: a.size, qty: 1 }]
    }
    case 'dec':
      return lines
        .map((l) => (l.itemId === a.itemId && l.size === a.size ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0)
    case 'clear':
      return []
    case 'fill':
      return a.lines.filter((l) => lookup(l.itemId))
  }
}

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CartLine[]) : []
  } catch {
    return []
  }
}

const itemsById = new Map<string, MenuItem>()

// Called with the bundled menu at load and again when the live menu arrives from the API,
// so cart prices always follow what the owner set.
export function registerMenu(cats: Category[]) {
  itemsById.clear()
  for (const c of cats) for (const i of c.items) itemsById.set(i.id, i)
}
registerMenu(categories)

export function lookup(id: string) {
  return itemsById.get(id)
}

// Offer prices for today (full plate), from the owner's offers.
const offerPrices = new Map<string, number>()
export function registerOffers(offers: { item_id: string | null; offer_price: number | null }[]) {
  offerPrices.clear()
  for (const o of offers) {
    if (!o.item_id || o.offer_price == null) continue
    const prev = offerPrices.get(o.item_id)
    offerPrices.set(o.item_id, prev == null ? o.offer_price : Math.min(prev, o.offer_price))
  }
}
export function offerPrice(item: MenuItem): number | undefined {
  return item.full != null ? offerPrices.get(item.id) : undefined
}

export function unitPrice(item: MenuItem, size: Size): number {
  if (size === 'full') return offerPrice(item) ?? item.full ?? 0
  return item.half ?? 0
}

export function useCart() {
  const [lines, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      /* storage blocked: cart lives for this visit only */
    }
  }, [lines])

  const count = lines.reduce((n, l) => n + l.qty, 0)
  const total = lines.reduce((sum, l) => {
    const item = lookup(l.itemId)
    return item ? sum + unitPrice(item, l.size) * l.qty : sum
  }, 0)
  const qtyOf = (itemId: string, size: Size) =>
    lines.find((l) => l.itemId === itemId && l.size === size)?.qty ?? 0

  return { lines, count, total, qtyOf, dispatch }
}

export type Cart = ReturnType<typeof useCart>
