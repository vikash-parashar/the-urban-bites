// Staff (owner/admin) calls to the Go API. The token is kept in this browser only.
import { sentence } from './api'
import type { Offer, Shop } from './shop'

const API_URL = import.meta.env.VITE_API_URL as string | undefined
const KEY = 'urban-bites-staff'

export interface Staff {
  id: string
  email: string
  name: string
  role: 'admin' | 'owner'
}

export interface StaffOrder {
  id: string
  number: number
  customer_name: string
  customer_phone: string
  fulfilment: 'pickup' | 'delivery'
  address?: string
  note?: string
  status: string
  payment_method: 'cash' | 'online'
  payment_status: 'pending' | 'paid' | 'refunded'
  source: 'web' | 'app' | 'counter'
  subtotal: number
  delivery_fee: number
  delivery_km: number | null
  customer_orders: number
  customer_badge?: string
  total: number
  prep_minutes: number | null
  ready_at: string | null
  created_at: string
  items: { item_id: string; name: string; size: string; unit_price: number; qty: number }[]
}

export interface StaffAccount extends Staff {
  active: boolean
  last_login_at: string | null
}

export interface Earnings {
  revenue: number
  orders: number
  avg_order: number
  days: { day: string; orders: number; revenue: number; cash: number; online: number }[]
  top_items: { name: string; qty: number; sales: number }[]
}

export interface OfferInput {
  period: 'day' | 'month'
  title: string
  description: string
  item_id: string | null
  offer_price: number | null
  starts_on?: string
  ends_on?: string
  active?: boolean
}

interface Session {
  token: string
  user: Staff
}

export function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') as Session | null
  } catch {
    return null
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: stay signed in for this tab only */
  }
}

export class SignedOut extends Error {}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new Error('Staff screens need the live API. This preview has no server behind it.')
  const session = loadSession()
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 401 && path !== '/v1/owner/login') {
    saveSession(null)
    throw new SignedOut('Signed out. Sign in again with your staff email.')
  }
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(data?.error ? sentence(`${data.error[0].toUpperCase()}${data.error.slice(1)}`) : `Error ${res.status}`)
  return data as T
}

export async function signIn(email: string, password: string): Promise<Staff> {
  const r = await call<Session>('POST', '/v1/owner/login', { email, password })
  saveSession(r)
  return r.user
}

export function signOut() {
  saveSession(null)
}

export const staffApi = {
  orders: (all: boolean) =>
    call<{ orders: StaffOrder[]; server_time: string }>('GET', `/v1/owner/orders?status=${all ? 'all' : 'active'}`),
  updateOrder: (id: string, u: { status?: string; prep_minutes?: number; payment_status?: string }) =>
    call<StaffOrder>('PATCH', `/v1/owner/orders/${id}`, u),
  menu: () =>
    call<{ categories: { id: string; name: string; items: { id: string; name: string; full: number | null; half?: number | null; available: boolean }[] }[] }>(
      'GET',
      '/v1/owner/menu',
    ),
  updateItem: (id: string, u: { full?: number; half?: number; available?: boolean }) =>
    call<null>('PATCH', `/v1/owner/menu/items/${id}`, u),
  earnings: (from: string, to: string) => call<Earnings>('GET', `/v1/owner/earnings?from=${from}&to=${to}`),
  shop: () => call<Shop>('GET', '/v1/shop'),
  updateShop: (u: Partial<Shop>) => call<Shop>('PATCH', '/v1/owner/shop', u),
  offers: () => call<{ offers: Offer[] }>('GET', '/v1/owner/offers'),
  createOffer: (o: OfferInput) => call<Offer>('POST', '/v1/owner/offers', o),
  updateOffer: (id: string, o: OfferInput) => call<Offer>('PUT', `/v1/owner/offers/${id}`, o),
  endOffer: (id: string) => call<null>('POST', `/v1/owner/offers/${id}/end`),
  counterSale: (s: { customer_name?: string; customer_phone?: string; payment_method: string; amount?: number; items?: { item_id: string; size: string; qty: number }[] }) =>
    call<StaffOrder>('POST', '/v1/owner/counter-sales', s),
  users: () => call<{ users: StaffAccount[] }>('GET', '/v1/admin/users'),
  createUser: (u: { email: string; name: string; role: string; password: string }) => call<StaffAccount>('POST', '/v1/admin/users', u),
  updateUser: (id: string, u: { active?: boolean; password?: string; role?: string }) =>
    call<StaffAccount>('PATCH', `/v1/admin/users/${id}`, u),
}
