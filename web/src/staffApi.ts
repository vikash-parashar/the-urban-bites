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
  /** Signed in with a temporary password: must choose their own before anything else. */
  must_change_password?: boolean
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
  payment_ref?: string | null
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

export interface Totals {
  orders: number; revenue: number; cost: number; gross_profit: number; expenses: number; net_profit: number
  avg_order: number; cancelled: number; items_sold: number; uncosted_sales: number; customers: number; new_customers: number
}
export interface Bucket { key: string; label: string; orders: number; revenue: number; cost: number; expenses: number; profit: number }
export interface ItemStat { item_id: string; name: string; qty: number; sales: number; cost: number; profit: number; costed: boolean; margin: number; orders: number; image: string }
export interface Split { key: string; orders: number; revenue: number }
export type Period = 'day' | 'week' | 'month' | 'year'
export interface Dashboard {
  period: Period; from: string; to: string; bucket: 'hour' | 'day' | 'month'
  totals: Totals; previous: Totals; series: Bucket[]; top_items: ItemStat[]; slow_items: ItemStat[]
  hours: number[]; weekdays: number[]; sources: Split[]; payments: Split[]; fulfilment: Split[]
  top_customers: { name: string; phone: string; orders: number; spent: number }[]
  expense_categories: Split[]; missing_cost: number
}
export interface Expense { id: string; spent_on: string; category: string; amount: number; note: string; created_at: string }

export interface MenuItemAdmin {
  id: string; category_id: string; name: string; name_hi?: string; description?: string; tag?: string; image?: string
  full: number | null; half?: number | null; cost_full?: number | null; cost_half?: number | null; available: boolean
}
export interface MenuCategoryAdmin { id: string; name: string; name_hi?: string; items: MenuItemAdmin[] }
export interface ItemInput {
  name?: string; name_hi?: string; description?: string; tag?: string; category_id?: string; image?: string
  full?: number; half?: number; cost_full?: number; cost_half?: number; available?: boolean; clear_half?: boolean; clear_cost_half?: boolean
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

const PUBLIC = ['/v1/owner/login', '/v1/owner/forgot', '/v1/owner/reset']

export class SignedOut extends Error {}
/** The server wants a new password before anything else (temporary password). */
export class MustChangePassword extends Error {}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new Error('This copy of the website is not connected to the server (VITE_API_URL is not set). Open https://the-urban-bites.onrender.com/#staff instead.')
  const session = loadSession()
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 401 && !PUBLIC.includes(path)) {
    saveSession(null)
    throw new SignedOut('Signed out. Sign in again with your staff email.')
  }
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { /* not JSON, e.g. a proxy error page */ }
  if (res.status === 403 && data?.code === 'password_change_required') {
    if (session) saveSession({ ...session, user: { ...session.user, must_change_password: true } })
    throw new MustChangePassword('Choose your own password first.')
  }
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

/** Change your own password. The server signs out older sessions and returns a fresh one. */
export async function changePassword(current: string, next: string): Promise<Staff> {
  const r = await call<Session>('POST', '/v1/me/password', { current, new: next })
  saveSession(r)
  return r.user
}

/** Ask for a reset link by email. Always succeeds, so it never reveals which emails have accounts. */
export const forgotPassword = (email: string) => call<null>('POST', '/v1/owner/forgot', { email })

export async function resetPassword(token: string, password: string): Promise<Staff> {
  const r = await call<Session>('POST', '/v1/owner/reset', { token, password })
  saveSession(r)
  return r.user
}

export const staffApi = {
  orders: (all: boolean) =>
    call<{ orders: StaffOrder[]; server_time: string }>('GET', `/v1/owner/orders?status=${all ? 'all' : 'active'}`),
  updateOrder: (id: string, u: { status?: string; prep_minutes?: number; payment_status?: string }) =>
    call<StaffOrder>('PATCH', `/v1/owner/orders/${id}`, u),
  menu: () => call<{ categories: MenuCategoryAdmin[] }>('GET', '/v1/owner/menu'),
  updateItem: (id: string, u: ItemInput) => call<null>('PATCH', `/v1/owner/menu/items/${encodeURIComponent(id)}`, u),
  createItem: (u: ItemInput) => call<MenuItemAdmin>('POST', '/v1/owner/menu/items', u),
  deleteItem: (id: string) => call<null>('DELETE', `/v1/owner/menu/items/${encodeURIComponent(id)}`),
  createCategory: (name: string, name_hi: string) => call<MenuCategoryAdmin>('POST', '/v1/owner/menu/categories', { name, name_hi }),
  dashboard: (period: Period, date?: string) => call<Dashboard>('GET', `/v1/owner/dashboard?period=${period}${date ? `&date=${date}` : ''}`),
  expenses: (period: Period, date?: string) =>
    call<{ expenses: Expense[]; total: number; categories: string[]; from: string; to: string }>('GET', `/v1/owner/expenses?period=${period}${date ? `&date=${date}` : ''}`),
  addExpense: (e: { spent_on?: string; category: string; amount: number; note: string }) => call<Expense>('POST', '/v1/owner/expenses', e),
  deleteExpense: (id: string) => call<null>('DELETE', `/v1/owner/expenses/${id}`),
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
