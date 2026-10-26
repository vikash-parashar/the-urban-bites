// Website looks. The site follows Indian time: Street Pop by day (6:00–18:30 IST) and Neon Highway
// at night. Visitors can pick any of the three from the header; their pick lasts until the next
// automatic switch. ?theme=<id> forces one (for screenshots and comparing).
export const themes = [
  { id: 'pop', name: 'Street Pop', note: 'Bright day look', icon: '🌞', sw: ['#ffd23f', '#ff4f9a', '#111111'] },
  { id: 'neon', name: 'Neon Highway', note: 'Night look', icon: '🌃', sw: ['#0a0a10', '#ff3d8b', '#ffb23d'] },
  { id: 'glass', name: 'Glass Lounge', note: 'Charcoal and gold', icon: '🥂', sw: ['#0f0e0c', '#e8c16a', '#f1e9da'] },
] as const
export type ThemeId = (typeof themes)[number]['id']
export type Period = 'day' | 'night'

export const DAY: ThemeId = 'pop'
export const NIGHT: ThemeId = 'neon'
const KEY = 'ub_look' // { look, at }: the look chosen, and the automatic period when it was chosen
const valid = (v: unknown): v is ThemeId => typeof v === 'string' && themes.some((t) => t.id === v)

// Minutes since midnight in India (UTC+5:30), whatever the visitor's own clock zone is.
function istMinutes(now = new Date()) {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440
}
export function autoPeriod(now = new Date()): Period {
  const m = istMinutes(now)
  return m >= 6 * 60 && m < 18 * 60 + 30 ? 'day' : 'night'
}
export const autoTheme = (): ThemeId => (autoPeriod() === 'day' ? DAY : NIGHT)

function read<T>(k: string): T | null {
  try { return JSON.parse(localStorage.getItem(k) ?? 'null') as T } catch { return null }
}
function write(k: string, v: unknown) {
  try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage blocked */ }
}

export function forcedTheme(): ThemeId | null {
  const q = new URLSearchParams(location.search).get('theme')
  return valid(q) ? q : null
}

export function currentTheme(): ThemeId {
  const f = forcedTheme()
  if (f) return f
  const auto = autoPeriod()
  const o = read<{ look: ThemeId; at: Period }>(KEY)
  if (o && o.at === auto && valid(o.look)) return o.look
  if (o) write(KEY, null) // the clock moved on to the next period: back to automatic
  return autoTheme()
}

export function pickTheme(id: ThemeId) {
  write(KEY, id === autoTheme() ? null : { look: id, at: autoPeriod() })
  applyCurrent()
}

export function applyCurrent() {
  applyTheme(currentTheme())
}

const bg: Record<ThemeId, string> = { pop: '#ffd23f', neon: '#0a0a10', glass: '#0f0e0c' }
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
