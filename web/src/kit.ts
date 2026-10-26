// Small shared helpers: item icons, form checks (same rules as the Go API), UPI links and bills.
import { brand } from './brand'

export interface Kind {
  emoji: string
  drink: boolean
}

// itemKind picks an icon for a menu item from its name. Drinks get a drink icon, food a food icon.
// Keep in step with app/lib/brand_widgets.dart.
export function itemKind(name: string, category = ''): Kind {
  const n = name.toLowerCase()
  const has = (...w: string[]) => w.some((x) => n.includes(x))
  if (has('chai', 'tea')) return { emoji: '☕', drink: true }
  if (has('coffee')) return { emoji: '🧋', drink: true }
  if (has('lassi', 'shake')) return { emoji: '🥛', drink: true }
  if (has('water')) return { emoji: '💧', drink: true }
  if (has('red bull')) return { emoji: '⚡', drink: true }
  if (has('maaza', 'mango')) return { emoji: '🥭', drink: true }
  if (has('pepsi', 'cola', 'thums', 'sprite', 'cold drink', 'soda')) return { emoji: '🥤', drink: true }
  if (has('raita', 'dahi', 'curd')) return { emoji: '🥣', drink: false }
  if (has('momo')) return { emoji: '🥟', drink: false }
  if (has('chaap', 'tikka')) return { emoji: '🍢', drink: false }
  if (has('fried rice', 'rice')) return { emoji: '🍚', drink: false }
  if (has('manchurian', 'chilli paneer', 'paneer chilli', 'noodle', 'chowmein')) return { emoji: '🥡', drink: false }
  if (has('mushroom')) return { emoji: '🍄', drink: false }
  if (has('paneer')) return { emoji: has('paratha') ? '🫓' : '🧀', drink: false }
  if (has('naan', 'roti', 'paratha')) return { emoji: '🫓', drink: false }
  if (has('finger', 'fries') || (has('chips') && !has("lay's", 'lays'))) return { emoji: '🍟', drink: false }
  if (has('corn')) return { emoji: '🌽', drink: false }
  if (has('peanut')) return { emoji: '🥜', drink: false }
  if (has('chana')) return { emoji: '🫘', drink: false }
  if (has("lay's", 'lays', 'kurkure')) return { emoji: '🍿', drink: false }
  if (has('choco', 'dairy milk', 'cadbury')) return { emoji: '🍫', drink: false }
  if (category.toLowerCase().includes('drink')) return { emoji: '🥤', drink: true }
  return { emoji: '🍛', drink: false }
}

export const categoryEmoji: Record<string, string> = {
  momos: '🥟', chaap: '🍢', paneer: '🧀', chinese: '🥡', snacks: '🍟', breads: '🫓', drinks: '☕', 'cold-drinks': '🥤', 'packaged-snacks': '🍿',
}

// ---- form checks ----

const nameRe = /^[\p{L}][\p{L}\p{M} .']*$/u

export function checkFirstName(v: string) {
  const s = v.trim()
  if (!s) return 'Enter your first name'
  if (s.length < 2) return 'At least 2 letters'
  if (!nameRe.test(s)) return 'Letters only, no numbers or symbols'
  return ''
}

export function checkLastName(v: string) {
  const s = v.trim()
  if (s && !nameRe.test(s)) return 'Letters only, no numbers or symbols'
  return ''
}

// The 10 digits after +91.
export function checkMobile(v: string) {
  if (!v) return 'Enter your mobile number'
  if (v.length !== 10) return `Mobile number must be 10 digits (${v.length}/10)`
  if (!/^[6-9]/.test(v)) return 'Indian mobile numbers start with 6, 7, 8 or 9'
  return ''
}

export function checkAddress(v: string) {
  const s = v.trim()
  if (!s) return 'Enter where to deliver'
  if (s.length < 10) return 'Add house number, street and a landmark'
  return ''
}

// Keeps only letters and the few marks a name needs.
export const cleanName = (v: string) => v.replace(/[^\p{L}\p{M} .']/gu, '').slice(0, 28)

// Turns typed or pasted "+91 98765-43210" / "098765 43210" into the 10 digits, never more.
export function cleanMobile(v: string) {
  let d = v.replace(/\D/g, '')
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2)
  if (d.length > 10 && d.startsWith('0')) d = d.slice(1)
  return d.slice(0, 10)
}

// "+919876543210" or "9876543210" back to the 10 digits, for prefilling.
export function tenDigits(phone: string | undefined) {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) return d.slice(2)
  return d.length === 10 ? d : ''
}

export function checkUpiRef(v: string) {
  const s = v.replace(/\s/g, '')
  if (!s) return 'Enter the UPI reference number'
  if (!/^[A-Za-z0-9]{6,35}$/.test(s)) return 'Copy the 12-digit UPI ref / UTR number from your payment app'
  return ''
}

// ---- UPI ----

// A standard UPI payment link: GPay, PhonePe, Paytm and BHIM open it with the amount filled in.
export function upiLink(upiId: string, name: string, amount: number, note: string) {
  const q = new URLSearchParams({ pa: upiId, pn: name, am: amount.toFixed(2), tn: note, cu: 'INR' })
  return `upi://pay?${q.toString()}`
}

// ---- bills ----

export interface BillLine {
  name: string
  size: string
  qty: number
  unit_price: number
}

export interface Bill {
  number: number
  when: Date
  customer?: string
  lines: BillLine[]
  subtotal: number
  delivery_fee: number
  delivery: boolean
  total: number
  payment: string
}

export function billText(b: Bill) {
  const rows = b.lines.map((l) => `${l.qty} x ${l.name}${l.size === 'half' ? ' (half)' : ''}  ₹${l.qty * l.unit_price}`)
  return [
    `*${brand.name}* 🧾`,
    `Bill for order #${b.number}`,
    b.when.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    b.customer ? `Customer: ${b.customer}` : '',
    '--------------------',
    ...rows,
    '--------------------',
    b.delivery ? `Items: ₹${b.subtotal}\nDelivery: ${b.delivery_fee === 0 ? 'Free' : `₹${b.delivery_fee}`}` : '',
    `*Total: ₹${b.total}*`,
    `Payment: ${b.payment}`,
    '',
    `Thank you! Order again at ${brand.domain} or call ${brand.phone_display}.`,
  ]
    .filter((s, i, a) => s !== '' || a[i - 1] !== '')
    .join('\n')
}

// WhatsApp chat with the bill typed in. With no number, WhatsApp asks who to send it to.
export function whatsappBill(b: Bill, phone?: string) {
  const d = tenDigits(phone)
  return `https://wa.me/${d ? `91${d}` : ''}?text=${encodeURIComponent(billText(b))}`
}
