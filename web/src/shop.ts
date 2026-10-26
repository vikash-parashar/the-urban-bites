import { useEffect, useState } from 'react'
import { isPreview } from './api'
import { brand } from './brand'

// Shop rules, offers and badges from the Go API. The preview (no API) uses the same defaults the
// API ships with, plus sample offers, so the design can be seen.
const API_URL = import.meta.env.VITE_API_URL as string | undefined

export interface Shop {
  accepting_orders: boolean
  min_order_delivery: number
  min_order_pickup: number
  free_delivery_min: number
  free_delivery_km: number
  max_delivery_km: number
  delivery_fee: number
  cart_lat: number | null
  cart_lng: number | null
  notice: string
  // The owner's UPI ID. Empty means cash only.
  upi_id: string
  upi_name: string
  accept_cash: boolean
  accept_upi: boolean
  updated_at?: string
}

export interface Offer {
  id: string
  period: 'day' | 'month'
  title: string
  description: string
  item_id: string | null
  item_name?: string
  regular_price?: number
  offer_price: number | null
  starts_on: string
  ends_on: string
  active: boolean
}

export interface Badge {
  orders: number
  badge: string | null
  next_badge: string | null
  to_next: number
  month_orders: number
  top_of_month: boolean
}

export interface Tier {
  name: string
  min: number
}

export interface Regular {
  name: string
  phone_hint: string
  month_orders: number
  badge: string
}

export const defaultShop: Shop = {
  accepting_orders: true,
  min_order_delivery: 500,
  min_order_pickup: 0,
  free_delivery_min: 500,
  free_delivery_km: 5,
  max_delivery_km: 5,
  delivery_fee: 40,
  cart_lat: 29.113493,
  cart_lng: 76.416352,
  notice: '',
  upi_id: '',
  upi_name: brand.name,
  accept_cash: true,
  accept_upi: true,
}

export const defaultTiers: Tier[] = [
  { name: 'First Bite', min: 1 },
  { name: 'Regular', min: 3 },
  { name: 'Gold Regular', min: 10 },
  { name: 'Urban Legend', min: 25 },
]

const sampleOffers: Offer[] = [
  {
    id: 'sample-day', period: 'day', title: 'Malai Chaap at ₹199', description: 'Full plate, today only.',
    item_id: 'malai-chaap', item_name: 'Malai Chaap', regular_price: 230, offer_price: 199,
    starts_on: '', ends_on: '', active: true,
  },
  {
    id: 'sample-month', period: 'month', title: 'Free cold drink over ₹700', description: 'A 250 ml cold drink on us with any order above ₹700. Ask at the counter.',
    item_id: null, offer_price: null, starts_on: '', ends_on: '', active: true,
  },
]

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`)
  return body as T
}

// useShop loads the shop rules and today's offers once per visit.
export function useShop() {
  // The preview shows UPI with a demo ID so the payment screen can be seen.
  const [shop, setShop] = useState<Shop>(isPreview ? { ...defaultShop, upi_id: 'demo.urbanbites@upi' } : defaultShop)
  const [offers, setOffers] = useState<Offer[]>(isPreview ? sampleOffers : [])
  useEffect(() => {
    if (isPreview) return
    get<Shop>('/v1/shop').then(setShop).catch(() => {})
    get<{ offers: Offer[] }>('/v1/offers').then((r) => setOffers(r.offers)).catch(() => {})
  }, [])
  return { shop, offers }
}

export async function fetchBadge(phone: string, localCount: number): Promise<Badge> {
  if (isPreview) return previewBadge(localCount)
  return get<Badge>(`/v1/badge?phone=${encodeURIComponent(phone)}`)
}

export async function fetchRegulars(): Promise<{ regulars: Regular[]; tiers: Tier[]; monthly_min: number }> {
  if (isPreview) {
    return {
      regulars: [
        { name: 'Ravi', phone_hint: '••42', month_orders: 14, badge: 'Gold Regular' },
        { name: 'Priya', phone_hint: '••07', month_orders: 11, badge: 'Gold Regular' },
        { name: 'Aman', phone_hint: '••90', month_orders: 8, badge: 'Regular' },
        { name: 'Neha', phone_hint: '••15', month_orders: 6, badge: 'Regular' },
        { name: 'Sunil', phone_hint: '••63', month_orders: 5, badge: 'Regular' },
        { name: 'Pooja', phone_hint: '••28', month_orders: 4, badge: 'Regular' },
        { name: 'Deepak', phone_hint: '••71', month_orders: 3, badge: 'Regular' },
      ],
      tiers: defaultTiers,
      monthly_min: 3,
    }
  }
  return get('/v1/regulars')
}

function previewBadge(n: number): Badge {
  let cur: Tier | null = null
  let next: Tier | null = null
  for (const t of defaultTiers) {
    if (n >= t.min) cur = t
    else if (!next) next = t
  }
  return { orders: n, badge: cur?.name ?? null, next_badge: next?.name ?? null, to_next: next ? next.min - n : 0, month_orders: n, top_of_month: false }
}

// Straight-line distance in km, the same formula the API uses.
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(a)) * 100) / 100
}

export function deliveryFee(shop: Shop, subtotal: number, km: number | null) {
  const inRadius = km == null || km <= shop.free_delivery_km
  return subtotal >= shop.free_delivery_min && inRadius ? 0 : shop.delivery_fee
}

// The customer's name and phone, remembered in this browser so checkout is one tap next time.
const ME = 'urban-bites-me'
export interface Me {
  name: string
  phone: string
  first?: string
  last?: string
  address?: string
}
export function loadMe(): Me | null {
  try {
    return JSON.parse(localStorage.getItem(ME) || 'null') as Me | null
  } catch {
    return null
  }
}
export function saveMe(me: Me) {
  try {
    localStorage.setItem(ME, JSON.stringify(me))
  } catch {
    /* storage blocked */
  }
}

// tierLevel is 1-4 for styling the badge medal; 0 for none.
export function tierLevel(name: string | null | undefined) {
  return name ? defaultTiers.findIndex((t) => t.name === name) + 1 : 0
}
