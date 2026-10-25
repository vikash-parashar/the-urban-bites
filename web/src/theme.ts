// Colour themes. The site follows Indian time: Cream Day from 6:00 to 18:30 IST, Charcoal Gold
// at night. The ☀️/🌙 button overrides it until the next switch; ?theme=<id> or ?pick=1 force one.
export const themes = [
  { id: 'cream', name: 'Cream Day', note: 'Day look (6:00–18:30)', sw: ['#fbf6ec', '#3550e8', '#e9a21f'] },
  { id: 'charcoal', name: 'Charcoal Gold', note: 'Night look', sw: ['#0b0b0d', '#222228', '#f4b43a'] },
  { id: 'navy', name: 'Midnight Navy', note: 'Old blue look', sw: ['#070a1c', '#3d5cff', '#f4b43a'] },
  { id: 'maroon', name: 'Tandoor Maroon', note: 'Deep red with flame orange', sw: ['#170607', '#ff7a1a', '#f4b43a'] },
  { id: 'green', name: 'Hariyali Green', note: 'Fresh and clean', sw: ['#05130e', '#22c55e', '#f4b43a'] },
  { id: 'masala', name: 'Masala Orange', note: 'Light with spicy orange', sw: ['#fff4e8', '#e85d04', '#f59e0b'] },
] as const
export type ThemeId = (typeof themes)[number]['id']
export type Period = 'day' | 'night'

export const DAY: ThemeId = 'cream'
export const NIGHT: ThemeId = 'charcoal'
const KEY = 'ub_theme_override' // { period, at }: the period chosen, and the auto period when chosen
const PICK = 'ub_theme_pick'
const valid = (v: unknown): v is ThemeId => typeof v === 'string' && themes.some((t) => t.id === v)

// Minutes since midnight in India (UTC+5:30), whatever the visitor's own clock zone is.
function istMinutes(now = new Date()) {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440
}
export function autoPeriod(now = new Date()): Period {
  const m = istMinutes(now)
  return m >= 6 * 60 && m < 18 * 60 + 30 ? 'day' : 'night'
}

function read<T>(k: string): T | null {
  try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T } catch { return null }
}
function write(k: string, v: unknown) {
  try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage blocked */ }
}

// A fixed pick from ?theme= or the picker (?pick=1), used to compare looks.
export function pickedTheme(): ThemeId | null {
  const q = new URLSearchParams(location.search).get('theme')
  if (valid(q)) return q
  if (!new URLSearchParams(location.search).has('pick')) return null
  const saved = read<string>(PICK)
  return valid(saved) ? saved : null
}

export function currentPeriod(): Period {
  const auto = autoPeriod()
  const o = read<{ period: Period; at: Period }>(KEY)
  if (o && o.at === auto && (o.period === 'day' || o.period === 'night')) return o.period
  if (o) write(KEY, null) // the clock moved on to the next period: back to automatic
  return auto
}

export function setPeriod(p: Period) {
  write(KEY, p === autoPeriod() ? null : { period: p, at: autoPeriod() })
  applyCurrent()
}

export function pickTheme(id: ThemeId) {
  write(PICK, id)
  applyTheme(id)
}

export function currentTheme(): ThemeId {
  return pickedTheme() ?? (currentPeriod() === 'day' ? DAY : NIGHT)
}

export function applyCurrent() {
  applyTheme(currentTheme())
}

const bg: Record<ThemeId, string> = { navy: '#070a1c', charcoal: '#0b0b0d', maroon: '#170607', green: '#05130e', cream: '#fbf6ec', masala: '#fff4e8' }
function applyTheme(id: ThemeId) {
  const root = document.documentElement
  if (root.dataset.theme === id) return
  root.dataset.theme = id
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg[id])
  window.dispatchEvent(new CustomEvent('ub-theme', { detail: id }))
}

// Re-check every minute so an open page switches at 6:00 and 18:30.
export function startThemeClock() {
  applyCurrent()
  setInterval(applyCurrent, 60_000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) applyCurrent() })
}
